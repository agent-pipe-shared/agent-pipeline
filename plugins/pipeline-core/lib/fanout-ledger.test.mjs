// SPDX-License-Identifier: SUL-1.0
// FANOUT slice S2: contract tests for the fan-out slot ledger library.
// Every case builds its own temp directory tree and injects it as the root, so
// nothing here can read or write the real repository's private state.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { devNull, tmpdir } from "node:os";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";
import { appendEvent, fanoutStatePath, liveSlices, readEvents, staleSlices } from "./fanout-ledger.mjs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";

const NOW = Date.parse("2026-10-05T12:00:00.000Z");
const MINUTE = 60_000;
const HASH = "a".repeat(64);
const iso = (ms) => new Date(ms).toISOString();
const ago = (minutes) => NOW - minutes * MINUTE;
const MODULE_URL = new URL("./fanout-ledger.mjs", import.meta.url).href;

const cases = [];
function check(name, run) {
  cases.push({ id: `FL${String(cases.length + 1).padStart(2, "0")}`, name, run });
}

/** A disposable tree: <sandbox>/{sentinel.txt, common, evidence}. `common` plays the git common dir. */
function sandbox() {
  const sandboxDir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "fanout-ledger-")));
  const commonDir = join(sandboxDir, "common");
  const evidenceDir = join(sandboxDir, "evidence");
  mkdirSync(commonDir);
  mkdirSync(evidenceDir);
  writeFileSync(join(sandboxDir, "sentinel.txt"), "untouched");
  return { sandboxDir, commonDir, evidenceDir, cleanup() { try { rmSync(sandboxDir, { recursive: true, force: true }); } catch { /* best effort */ } } };
}
async function withSandbox(run) {
  const box = sandbox();
  try { return await run(box); } finally { box.cleanup(); }
}
function listTree(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      out.push(relative(root, full).replaceAll("\\", "/"));
      if (entry.isDirectory()) walk(full);
    }
  };
  walk(root);
  return out.sort();
}
function launch(sliceId, atMs, extra = {}) {
  return { type: "launch", sliceId, agentType: "goldfish-implementor", model: "claude-sonnet-5-5", writeScopeHash: HASH, commitMode: "diff-only", at: iso(atMs), ...extra };
}
function finish(sliceId, atMs, how = "notification", extra = {}) {
  return { type: "finish", sliceId, how, at: iso(atMs), ...extra };
}
function writeRecord(evidenceDir, sliceId, outcome, mtimeMs, taskId = sliceId) {
  const path = join(evidenceDir, `dispatch-record-${sliceId}.json`);
  writeFileSync(path, `${JSON.stringify({ schema: "pipeline.dispatch-record.v4", taskId, outcome })}\n`);
  utimesSync(path, new Date(mtimeMs), new Date(mtimeMs));
}
function writeCounter(commonDir, agentId, mtimeMs) {
  const dir = join(commonDir, "agent-pipeline", "dispatch-budget");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${agentId}.json`);
  writeFileSync(path, `${JSON.stringify({ schema: "pipeline.dispatch-budget-counter.v1", agentId, count: 3 })}\n`);
  utimesSync(path, new Date(mtimeMs), new Date(mtimeMs));
}
const ids = (entries) => entries.map((entry) => entry.sliceId);

check("fanoutStatePath is one hash-named JSONL per session under the private fanout directory", () => {
  const path = fanoutStatePath("/repo/.git", "claude", "raw-session-id-123");
  const expectedHash = createHash("sha256").update(JSON.stringify("raw-session-id-123")).digest("hex").slice(0, 32);
  assert.equal(path.replaceAll("\\", "/"), `/repo/.git/agent-pipeline/fanout/claude-${expectedHash}.jsonl`);
  assert.ok(!path.includes("raw-session-id-123"), "the raw session id never reaches a path");
  assert.equal(fanoutStatePath("/repo/.git", "claude", "raw-session-id-123"), path);
  assert.notEqual(fanoutStatePath("/repo/.git", "claude", "another"), path);
  assert.notEqual(fanoutStatePath("/repo/.git", "codex", "raw-session-id-123"), path);
  for (const bad of [["", "claude", "s"], ["/repo/.git", "../x", "s"], ["/repo/.git", "Claude", "s"], ["/repo/.git", "claude", ""], ["/repo/.git", "claude", 7]]) {
    assert.throws(() => fanoutStatePath(...bad), (error) => error?.code === "FANOUT-ARGUMENT");
  }
});

check("appendEvent writes exactly one validated private line per call and rejects everything that is not hash-only", () => withSandbox(({ commonDir }) => {
  const result = appendEvent(commonDir, "claude", "s-1", launch("S2-10", ago(5)));
  assert.equal(result.path, fanoutStatePath(commonDir, "claude", "s-1"));
  appendEvent(commonDir, "claude", "s-1", { type: "stop-eval", live: 2, target: 4, ready: 3, decision: "block", reason: "FANOUT-BLOCK", mode: "shadow", at: iso(ago(4)) });
  appendEvent(commonDir, "claude", "s-1", { type: "block", reasonCode: "FANOUT-BLOCK", live: 2, target: 4, ready: 3, at: iso(ago(4)) });
  appendEvent(commonDir, "claude", "s-1", { type: "declined", sliceId: "S2-11", kind: "defer", reasonSha256: HASH, at: iso(ago(3)) });
  appendEvent(commonDir, "claude", "s-1", { type: "pause", by: "po", untilAt: iso(NOW + 60 * MINUTE), reasonSha256: HASH, at: iso(ago(2)) });
  appendEvent(commonDir, "claude", "s-1", { type: "defied", reasonCode: "FANOUT-DEFIED", blocks: 3, at: iso(ago(1)) });
  appendEvent(commonDir, "claude", "s-1", finish("S2-10", NOW, "reap", { reasonSha256: HASH }));
  const raw = readFileSync(result.path, "utf8");
  const lines = raw.split("\n");
  assert.equal(lines.pop(), "", "every line is newline terminated");
  assert.equal(lines.length, 7);
  for (const line of lines) {
    const parsed = JSON.parse(line);
    assert.equal(parsed.schema, "pipeline.fanout-event.v1");
    assert.ok(Buffer.byteLength(line, "utf8") <= 1024, "a line stays small enough for one atomic append");
  }
  // Stamps `at` itself when the caller gives none.
  const stamped = appendEvent(commonDir, "claude", "s-1", { type: "block", reasonCode: "FANOUT-BLOCK", live: 1, target: 4, ready: 1 }, { now: NOW });
  assert.equal(stamped.event.at, iso(NOW));
  const before = readFileSync(result.path, "utf8");
  const invalid = [
    { ...launch("S2-10", NOW), prompt: "raw briefing text" },                 // unknown key: no free-form lane
    { ...launch("S2-10", NOW), agentType: "C:/Users/someone/work" },          // host path as a token
    { ...launch("S2-10", NOW), model: "D:\\Dev\\repo" },
    { ...launch("S2-10", NOW), agentType: "has spaces and prose" },
    { ...launch("S2-10", NOW), writeScopeHash: "plugins/pipeline-core/lib/x.mjs" }, // a path where a hash belongs
    { ...launch("S2-10", NOW), sliceId: "../escape" },
    { ...launch("S2-10", NOW), commitMode: "yolo" },
    { ...launch("S2-10", NOW), agentId: "../counter" },
    { ...launch("S2-10", NOW), at: "yesterday" },
    { type: "launch", sliceId: "S2-10" },                                      // missing required fields
    finish("S2-10", NOW, "reap"),                                              // reap needs a reason hash
    finish("S2-10", NOW, "because I said so"),
    finish("S2-10", NOW, "notification", { reasonSha256: HASH }),              // reason hash is reap-only
    { type: "stop-eval", live: 1, target: 4, ready: 1, decision: "block", reason: "free text with spaces", mode: "shadow" },
    { type: "stop-eval", live: -1, target: 4, ready: 1, decision: "block", reason: "FANOUT-BLOCK", mode: "shadow" },
    { type: "pause", by: "nobody", untilAt: iso(NOW), reasonSha256: HASH },
    { type: "telemetry", sliceId: "S2-10" },
    { schema: "pipeline.fanout-event.v1", ...launch("S2-10", NOW) },           // schema/envelope is the library's, not the caller's
    null,
  ];
  for (const event of invalid) {
    assert.throws(() => appendEvent(commonDir, "claude", "s-1", event), (error) => error?.code === "FANOUT-EVENT-INVALID", JSON.stringify(event));
  }
  assert.equal(readFileSync(result.path, "utf8"), before, "a refused event leaves the ledger byte-identical");
}));

check("concurrent appends from several child processes lose no line and tear no line", () => withSandbox(async ({ commonDir }) => {
  const sessionId = "concurrent-session";
  // Create the private directory once up front (that first-creation step is the only
  // part that is not a plain append); the children then race on the append itself.
  appendEvent(commonDir, "claude", sessionId, { type: "stop-eval", live: 0, target: 4, ready: 0, decision: "allow", reason: "FANOUT-NO-READY", mode: "shadow", at: iso(NOW) });
  const childSource = `
    import { appendEvent } from ${JSON.stringify(MODULE_URL)};
    const { FL_COMMON, FL_SESSION, FL_TAG, FL_COUNT } = process.env;
    for (let i = 0; i < Number(FL_COUNT); i += 1) {
      appendEvent(FL_COMMON, "claude", FL_SESSION, {
        type: "launch", sliceId: "C" + FL_TAG + "-" + String(i).padStart(3, "0"), agentType: "goldfish-implementor",
        model: "claude-sonnet-5-5", writeScopeHash: "${HASH}", commitMode: "diff-only",
      });
    }
  `;
  const CHILDREN = 5;
  const PER_CHILD = 30;
  const runChild = (tag) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", childSource], {
      env: { ...process.env, FL_COMMON: commonDir, FL_SESSION: sessionId, FL_TAG: String(tag), FL_COUNT: String(PER_CHILD) },
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr }));
  });
  const results = await Promise.all(Array.from({ length: CHILDREN }, (_, tag) => runChild(tag)));
  for (const result of results) assert.equal(result.code, 0, result.stderr);
  const path = fanoutStatePath(commonDir, "claude", sessionId);
  const rawLines = readFileSync(path, "utf8").split("\n");
  assert.equal(rawLines.pop(), "");
  assert.equal(rawLines.length, 1 + CHILDREN * PER_CHILD, "no append was lost");
  const parsed = rawLines.map((line) => JSON.parse(line)); // a torn or interleaved line would throw here
  const read = readEvents(commonDir, "claude", sessionId);
  assert.equal(read.skipped, 0);
  assert.equal(read.events.length, 1 + CHILDREN * PER_CHILD);
  const launches = parsed.filter((event) => event.type === "launch");
  assert.equal(new Set(launches.map((event) => event.sliceId)).size, CHILDREN * PER_CHILD, "every distinct event arrived exactly once");
  for (let tag = 0; tag < CHILDREN; tag += 1) {
    const own = launches.filter((event) => event.sliceId.startsWith(`C${tag}-`)).map((event) => event.sliceId);
    assert.deepEqual(own, [...own].sort(), "one writer's own events keep their append order");
    assert.equal(own.length, PER_CHILD);
  }
  assert.equal(liveSlices({ commonDir, runner: "claude", sessionId, now: NOW + MINUTE }).length, CHILDREN * PER_CHILD);
}));

check("liveSlices is the union of the launch event, a non-terminal dispatch record and the budget-counter heartbeat", () => withSandbox(({ commonDir, evidenceDir }) => {
  const at = (event) => appendEvent(commonDir, "claude", "union", event);
  // L: launch event only.
  at(launch("FX-L", ago(10)));
  // C: all three sources at once.
  at(launch("FX-C", ago(8), { agentId: "agent-C" }));
  writeRecord(evidenceDir, "FX-C", "in-progress", ago(3));
  writeCounter(commonDir, "agent-C", ago(1));
  // R: a non-terminal record the ledger never saw (launch event lost), named by the queue.
  writeRecord(evidenceDir, "FX-R", "in-progress", ago(2));
  // H: finished per ledger, but its counter was touched after the finish and is fresh.
  at(launch("FX-H", ago(30), { agentId: "agent-H" }));
  at(finish("FX-H", ago(20)));
  writeCounter(commonDir, "agent-H", ago(2));
  // H2: finished, counter touched after the finish but outside the heartbeat window: not live.
  at(launch("FX-H2", ago(90), { agentId: "agent-H2" }));
  at(finish("FX-H2", ago(80)));
  writeCounter(commonDir, "agent-H2", ago(30));
  // D: a terminal record ends the dispatch even though no finish was ever written, and a fresh counter does not revive it.
  at(launch("FX-D", ago(30), { agentId: "agent-D" }));
  writeRecord(evidenceDir, "FX-D", "completed", ago(5));
  writeCounter(commonDir, "agent-D", ago(1));
  // F: explicit finish; the older in-progress record must not keep the slot.
  at(launch("FX-F", ago(30)));
  at(finish("FX-F", ago(10), "subagent-stop"));
  writeRecord(evidenceDir, "FX-F", "in-progress", ago(25));
  // T: relaunched after a finish: live again.
  at(launch("FX-T", ago(40)));
  at(finish("FX-T", ago(30)));
  at(launch("FX-T", ago(5)));
  // X: an old terminal record, then a newer launch that has not re-opened its record yet: live.
  writeRecord(evidenceDir, "FX-X", "completed", ago(50));
  at(launch("FX-X", ago(5)));
  // Z: an in-progress record nobody asked about (not in the ledger, not in sliceIds) is never scanned.
  writeRecord(evidenceDir, "FX-Z", "in-progress", ago(1));
  // U/M: an unreadable record and a record whose taskId names another slice prove nothing.
  writeFileSync(join(evidenceDir, "dispatch-record-FX-U.json"), "{not json");
  writeRecord(evidenceDir, "FX-M", "in-progress", ago(1), "FX-OTHER");

  const live = liveSlices({ commonDir, runner: "claude", sessionId: "union", evidenceDir, sliceIds: ["FX-R", "FX-U", "FX-M", "FX-C"], now: NOW });
  assert.deepEqual(ids(live), ["FX-C", "FX-H", "FX-L", "FX-R", "FX-T", "FX-X"]);
  const by = Object.fromEntries(live.map((entry) => [entry.sliceId, entry]));
  assert.deepEqual(by["FX-C"].sources, ["launch", "record", "heartbeat"]);
  assert.deepEqual(by["FX-L"].sources, ["launch"]);
  assert.deepEqual(by["FX-R"].sources, ["record"]);
  assert.deepEqual(by["FX-H"].sources, ["heartbeat"]);
  assert.deepEqual(by["FX-T"].sources, ["launch"]);
  assert.deepEqual(by["FX-X"].sources, ["launch"]);
  assert.equal(by["FX-C"].lastActivityAt, iso(ago(1)), "the freshest of the three sources is the last activity");
  assert.equal(by["FX-C"].silentMinutes, 1);
  assert.equal(by["FX-C"].agentType, "goldfish-implementor");
  assert.equal(by["FX-R"].launchedAt, null);
  // Without an evidence directory only the ledger and the heartbeat speak.
  assert.deepEqual(ids(liveSlices({ commonDir, runner: "claude", sessionId: "union", now: NOW })), ["FX-C", "FX-D", "FX-H", "FX-L", "FX-T", "FX-X"], "without a record the finished FX-D still looks launched");
  // A session with no ledger file at all has no live slices and is not an error.
  assert.deepEqual(liveSlices({ commonDir, runner: "claude", sessionId: "never-written", now: NOW }), []);
  for (const bad of [{ sliceIds: ["../x"] }, { staleAfterMinutes: 0 }, { staleAfterMinutes: "20" }]) {
    assert.throws(() => liveSlices({ commonDir, runner: "claude", sessionId: "union", now: NOW, ...bad }), (error) => error?.code === "FANOUT-ARGUMENT");
  }
}));

check("a silent slice stays live and is only reported stale; only an explicit reap frees it", () => withSandbox(({ commonDir, evidenceDir }) => {
  const at = (event) => appendEvent(commonDir, "claude", "stale", event);
  at(launch("SR-OLD", ago(60)));
  at(launch("SR-FRESH", ago(5)));
  at(launch("SR-BEAT", ago(60), { agentId: "agent-beat" }));
  writeCounter(commonDir, "agent-beat", ago(1));
  at(launch("SR-ANCIENT", NOW - 10 * 24 * 60 * MINUTE));
  at(launch("SR-EDGE20", ago(20)));
  at(launch("SR-EDGE21", ago(21)));
  const options = { commonDir, runner: "claude", sessionId: "stale", evidenceDir, now: NOW };
  assert.deepEqual(ids(liveSlices(options)), ["SR-ANCIENT", "SR-BEAT", "SR-EDGE20", "SR-EDGE21", "SR-FRESH", "SR-OLD"], "silence never frees a slot");
  assert.deepEqual(ids(staleSlices(options)), ["SR-ANCIENT", "SR-EDGE21", "SR-OLD"], "stale means silent for MORE than the threshold; a fresh heartbeat de-stales");
  const old = staleSlices(options).find((entry) => entry.sliceId === "SR-OLD");
  assert.equal(old.silentMinutes, 60);
  assert.equal(old.stale, true);
  assert.deepEqual(ids(staleSlices({ ...options, staleAfterMinutes: 90 })), ["SR-ANCIENT"], "the threshold is a parameter, default 20");

  // Reap: explicit, reasoned, and the only thing that frees a silent slot.
  writeRecord(evidenceDir, "SR-OLD", "in-progress", ago(59)); // the dead agent's abandoned opening record
  assert.throws(() => at(finish("SR-OLD", ago(1), "reap")), (error) => error?.code === "FANOUT-EVENT-INVALID");
  at(finish("SR-OLD", ago(1), "reap", { reasonSha256: HASH }));
  assert.ok(!ids(liveSlices(options)).includes("SR-OLD"), "reap frees the slot even though its record still says in-progress");
  assert.ok(!ids(staleSlices(options)).includes("SR-OLD"));
  at(finish("SR-ANCIENT", ago(1), "reap", { reasonSha256: HASH }));
  assert.ok(!ids(liveSlices(options)).includes("SR-ANCIENT"));
  // Strictest reading: a reap never hides a dispatch that is demonstrably still working.
  at(finish("SR-BEAT", ago(3), "reap", { reasonSha256: HASH }));
  const revived = liveSlices(options).find((entry) => entry.sliceId === "SR-BEAT");
  assert.deepEqual(revived?.sources, ["heartbeat"], "a heartbeat newer than the reap proves the agent alive");
  // A relaunch after the reap is a fresh dispatch of the slice.
  at(launch("SR-OLD", ago(0.5)));
  assert.deepEqual(liveSlices(options).find((entry) => entry.sliceId === "SR-OLD")?.sources, ["launch"]);
}));

check("the ledger stores hashes and tokens only and writes nowhere outside the injected root", () => withSandbox(({ sandboxDir, commonDir, evidenceDir }) => {
  const rawSession = "super-secret-session-id-0f3a9c";
  const hostFragments = [rawSession, sandboxDir, tmpdir(), "Users", "briefing", "prompt"];
  const events = [
    launch("PV-1", ago(5), { agentId: "agent-pv" }),
    { type: "stop-eval", live: 1, target: 4, ready: 2, decision: "block", reason: "FANOUT-BLOCK", mode: "enforce", at: iso(ago(4)) },
    { type: "declined", sliceId: "PV-2", kind: "hold", reasonSha256: createHash("sha256").update("a raw one-line reason that must never be stored").digest("hex"), at: iso(ago(3)) },
    finish("PV-1", ago(1), "reap", { reasonSha256: HASH }),
  ];
  for (const event of events) appendEvent(commonDir, "claude", rawSession, event);
  const treeBefore = listTree(sandboxDir);
  assert.deepEqual(treeBefore.filter((entry) => !entry.startsWith("common/")), ["common", "evidence", "sentinel.txt"], "nothing was written beside the injected root");
  assert.deepEqual(treeBefore.filter((entry) => entry.startsWith("common/")), [
    "common/agent-pipeline",
    "common/agent-pipeline/fanout",
    `common/agent-pipeline/fanout/${relative(join(commonDir, "agent-pipeline", "fanout"), fanoutStatePath(commonDir, "claude", rawSession)).replaceAll("\\", "/")}`,
  ], "exactly one ledger file, no temp or lock leftovers");
  const text = readFileSync(fanoutStatePath(commonDir, "claude", rawSession), "utf8");
  for (const fragment of hostFragments) assert.ok(!text.includes(fragment), `ledger text must not contain ${JSON.stringify(fragment)}`);
  assert.ok(!/[A-Za-z]:[\\/]/u.test(text) && !text.includes("\\\\") && !/"\/[a-z]/u.test(text), "no host path shape in the ledger");
  const allowed = new Set(["schema", "type", "at", "sliceId", "agentType", "model", "writeScopeHash", "commitMode", "agentId", "how", "reasonSha256", "live", "target", "ready", "decision", "reason", "mode", "reasonCode", "kind", "by", "untilAt", "blocks"]);
  for (const line of text.trim().split("\n")) for (const key of Object.keys(JSON.parse(line))) assert.ok(allowed.has(key), `unexpected persisted key ${key}`);
  // Reading and deriving liveness never writes either.
  liveSlices({ commonDir, runner: "claude", sessionId: rawSession, evidenceDir, now: NOW });
  staleSlices({ commonDir, runner: "claude", sessionId: rawSession, evidenceDir, now: NOW });
  assert.deepEqual(listTree(sandboxDir), treeBefore);
  assert.equal(readFileSync(join(sandboxDir, "sentinel.txt"), "utf8"), "untouched");
}));

check("a damaged, forged or truncated line is skipped and counted, never fatal and never a phantom slot", () => withSandbox(({ commonDir }) => {
  const sessionId = "damaged";
  appendEvent(commonDir, "claude", sessionId, launch("DM-1", ago(5)));
  const path = fanoutStatePath(commonDir, "claude", sessionId);
  appendFileSync(path, "{\"schema\":\"pipeline.fanout-event.v1\",\"type\":\"launch\",\"sliceId\":\"DM-TORN\"\n");   // truncated JSON
  appendFileSync(path, `${JSON.stringify({ schema: "pipeline.fanout-event.v1", type: "launch", sliceId: "DM-FORGED", agentType: "x", model: "y", writeScopeHash: HASH, commitMode: "diff-only", at: iso(ago(5)), prompt: "smuggled" })}\n`);
  appendFileSync(path, "not json at all\n");
  appendEvent(commonDir, "claude", sessionId, launch("DM-2", ago(4)));
  const read = readEvents(commonDir, "claude", sessionId);
  assert.equal(read.events.length, 2);
  assert.equal(read.skipped, 3);
  assert.deepEqual(ids(liveSlices({ commonDir, runner: "claude", sessionId, now: NOW })), ["DM-1", "DM-2"]);
}));

check("an unsafe ledger directory is refused instead of written through", () => withSandbox(({ commonDir }) => {
  mkdirSync(join(commonDir, "agent-pipeline"));
  writeFileSync(join(commonDir, "agent-pipeline", "fanout"), "a regular file where the directory belongs");
  assert.throws(() => appendEvent(commonDir, "claude", "unsafe", launch("US-1", ago(1))), (error) => error?.code === "FANOUT-DIRECTORY-UNSAFE");
  assert.equal(readFileSync(join(commonDir, "agent-pipeline", "fanout"), "utf8"), "a regular file where the directory belongs");
  assert.equal(statSync(join(commonDir, "agent-pipeline", "fanout")).isFile(), true);
}));

assert.equal(cases.length, 8, "the complete fanout-ledger corpus must be registered before execution begins");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({
  cases,
  fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536"),
});
