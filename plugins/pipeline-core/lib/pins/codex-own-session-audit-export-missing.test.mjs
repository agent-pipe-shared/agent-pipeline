// SPDX-License-Identifier: SUL-1.0
// Regression pin: pipeline.codex-own-session-audit-export-missing (ALF-C-P2-03, AC-133).
// Exercises the real own-session audit module and its real CLI (runner-transcript-recovery audit-current).
// Hosts without O_NOFOLLOW (native Windows) cannot open a session file under the module's alias
// protection; there it must say so honestly (`nofollow-unavailable`), and the cases that need a
// successful readback are skipped with that typed host-limitation reason.
import assert from "node:assert/strict";
import { appendFileSync, constants, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { auditCurrentRunnerSession } from "../runner-own-session-audit.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..", "..");
const cli = resolve(here, "..", "..", "scripts", "runner-transcript-recovery.mjs");
const HAS_NOFOLLOW = constants.O_NOFOLLOW !== undefined;
const HOST_LIMIT = HAS_NOFOLLOW ? false : "host-limitation: O_NOFOLLOW unavailable (nofollow-unavailable); session readback cannot succeed on this host";
const ENV_KEYS = ["CODEX_SESSION_ID", "CODEX_THREAD_ID", "CODEX_HOME"];

function fixture() {
  const scratch = join(repoRoot, "scratch");
  mkdirSync(scratch, { recursive: true });
  const base = realpathSync(mkdtempSync(join(scratch, "own-session-audit-")));
  const project = join(base, "project");
  const foreign = join(base, "foreign");
  const codexHome = join(base, "codex-home");
  mkdirSync(project);
  mkdirSync(foreign);
  mkdirSync(join(codexHome, "sessions", "2026", "10"), { recursive: true });
  return { base, project, foreign, codexHome, dir: join(codexHome, "sessions", "2026", "10") };
}

function session(fx, name, id, cwd, extra = []) {
  const lines = [JSON.stringify({ type: "session_meta", payload: { id, cwd } }), ...extra.map((row) => JSON.stringify(row))];
  writeFileSync(join(fx.dir, `${name}.jsonl`), `${lines.join("\n")}\n`);
}

function withEnv(values, run) {
  const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, values);
  try { return run(); } finally {
    for (const key of ENV_KEYS) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
  }
}

const approved = (fx, extra = {}) => ({ rootDir: fx.project, runner: "codex", metadataConsent: "approved", ...extra });
const cleanup = (fx) => rmSync(fx.base, { recursive: true, force: true });
const SESSION = "audit-session-001";

test("explicit command shape: consent, runner and invocation are required; selectors, paths and read grants are refused", () => {
  const fx = fixture();
  try {
    withEnv({ CODEX_SESSION_ID: SESSION, CODEX_HOME: fx.codexHome }, () => {
      assert.equal(auditCurrentRunnerSession({ rootDir: fx.project, runner: "codex" }).reason, "metadata-consent-required");
      assert.equal(auditCurrentRunnerSession({ ...approved(fx), metadataConsent: "yes" }).reason, "metadata-consent-required");
      assert.equal(auditCurrentRunnerSession(approved(fx, { runner: "claude" })).reason, "runner-unavailable");
      for (const extra of [{ sessionId: "foreign" }, { session: SESSION }, { path: fx.dir }, { filePath: fx.dir },
        { readTranscript: true }, { transcript: "content" }, { operation: "read" }]) {
        const out = auditCurrentRunnerSession(approved(fx, extra));
        assert.equal(out.status, "unavailable", JSON.stringify(extra));
        assert.equal(out.reason, "invalid-invocation", JSON.stringify(extra));
      }
      assert.equal(auditCurrentRunnerSession(approved(fx, { operation: "audit-current" })).reason !== "invalid-invocation", true);
      assert.equal(auditCurrentRunnerSession(null).reason, "invalid-invocation");
      assert.equal(auditCurrentRunnerSession([]).reason, "invalid-invocation");
    });
  } finally { cleanup(fx); }
});

test("active session identity is proven from the host environment; absent or conflicting identity yields honest unavailable", () => {
  const fx = fixture();
  try {
    session(fx, "a", SESSION, fx.project);
    withEnv({ CODEX_HOME: fx.codexHome }, () => {
      const out = auditCurrentRunnerSession(approved(fx));
      assert.equal(out.status, "unavailable");
      assert.equal(out.reason, "MODEL-ROLE-SESSION-IDENTITY-UNAVAILABLE");
    });
    withEnv({ CODEX_SESSION_ID: SESSION, CODEX_THREAD_ID: "another-thread", CODEX_HOME: fx.codexHome }, () => {
      assert.equal(auditCurrentRunnerSession(approved(fx)).reason, "MODEL-ROLE-SESSION-IDENTITY-CONFLICT");
    });
    withEnv({ CODEX_SESSION_ID: "bad id/with slash", CODEX_HOME: fx.codexHome }, () => {
      assert.equal(auditCurrentRunnerSession(approved(fx)).reason, "MODEL-ROLE-SESSION-IDENTITY-CONFLICT");
    });
  } finally { cleanup(fx); }
});

test("repository identity is proven before any metadata: relative or missing repository and storage are unavailable", () => {
  const fx = fixture();
  try {
    session(fx, "a", SESSION, fx.project);
    withEnv({ CODEX_SESSION_ID: SESSION, CODEX_HOME: fx.codexHome }, () => {
      assert.equal(auditCurrentRunnerSession(approved(fx, { rootDir: "relative/project" })).reason, "repository-unavailable");
      assert.equal(auditCurrentRunnerSession(approved(fx, { rootDir: undefined })).reason, "repository-unavailable");
      assert.equal(auditCurrentRunnerSession(approved(fx, { rootDir: join(fx.base, "missing") })).reason, "host-metadata-unavailable");
    });
    withEnv({ CODEX_SESSION_ID: SESSION, CODEX_HOME: "relative-home" }, () => {
      assert.equal(auditCurrentRunnerSession(approved(fx)).reason, "storage-unavailable");
    });
    withEnv({ CODEX_SESSION_ID: SESSION, CODEX_HOME: join(fx.base, "no-such-home") }, () => {
      assert.equal(auditCurrentRunnerSession(approved(fx)).status, "unavailable");
    });
  } finally { cleanup(fx); }
});

test("another session's metadata and a foreign repository are never exported (honest unavailable, never available)", () => {
  const fx = fixture();
  try {
    session(fx, "other", "someone-elses-session", fx.project, [{ type: "turn_context", payload: { model: "gpt-secret-model" } }]);
    session(fx, "foreign", SESSION, fx.foreign);
    withEnv({ CODEX_SESSION_ID: SESSION, CODEX_HOME: fx.codexHome }, () => {
      const out = auditCurrentRunnerSession(approved(fx));
      assert.equal(out.status, "unavailable");
      assert.equal(out.reason, HAS_NOFOLLOW ? "session-repository-conflict" : "nofollow-unavailable");
      assert.equal(JSON.stringify(out).includes("gpt-secret-model"), false);
    });
  } finally { cleanup(fx); }
});

test("a session with no stored record for the active id reports current-session-unavailable", { skip: HOST_LIMIT }, () => {
  const fx = fixture();
  try {
    session(fx, "other", "someone-elses-session", fx.project);
    withEnv({ CODEX_SESSION_ID: SESSION, CODEX_HOME: fx.codexHome }, () => {
      assert.equal(auditCurrentRunnerSession(approved(fx)).reason, "current-session-unavailable");
    });
  } finally { cleanup(fx); }
});

test("malformed session metadata and an ambiguous duplicate identity fail closed", { skip: HOST_LIMIT }, () => {
  const fx = fixture();
  try {
    writeFileSync(join(fx.dir, "bad.jsonl"), "not-json\n");
    withEnv({ CODEX_SESSION_ID: SESSION, CODEX_HOME: fx.codexHome }, () => {
      assert.equal(auditCurrentRunnerSession(approved(fx)).reason, "metadata-malformed");
    });
    rmSync(join(fx.dir, "bad.jsonl"));
    session(fx, "one", SESSION, fx.project);
    session(fx, "two", SESSION, fx.project);
    withEnv({ CODEX_SESSION_ID: SESSION, CODEX_HOME: fx.codexHome }, () => {
      assert.equal(auditCurrentRunnerSession(approved(fx)).reason, "session-identity-ambiguous");
    });
  } finally { cleanup(fx); }
});

test("available readback is bounded metadata only: hashes, runner-supplied model and token counters, no transcript content or path", { skip: HOST_LIMIT }, () => {
  const fx = fixture();
  try {
    const usage = { input_tokens: 10, cached_input_tokens: 2, output_tokens: 5, reasoning_output_tokens: 1, total_tokens: 15 };
    session(fx, "mine", SESSION, fx.project, [
      { type: "turn_context", payload: { model: "gpt-5.5" } },
      { type: "event_msg", payload: { type: "token_count", info: { total_token_usage: usage } } },
      { type: "response_item", payload: { text: "PRIVATE-TRANSCRIPT-BODY" } },
    ]);
    withEnv({ CODEX_SESSION_ID: SESSION, CODEX_HOME: fx.codexHome }, () => {
      const out = auditCurrentRunnerSession(approved(fx));
      assert.equal(out.status, "available");
      assert.equal(out.identityAssurance, "host-environment-and-local-session-metadata");
      assert.match(out.sessionSha256, /^[0-9a-f]{64}$/u);
      assert.match(out.repositorySha256, /^[0-9a-f]{64}$/u);
      assert.equal(out.modelIdentity, "gpt-5.5");
      assert.deepEqual(out.tokenCounters, usage);
      assert.equal(out.phaseWallTime, "unavailable");
      const text = JSON.stringify(out);
      for (const leak of ["PRIVATE-TRANSCRIPT-BODY", SESSION, fx.project, fx.codexHome]) assert.equal(text.includes(leak), false, leak);
    });
  } finally { cleanup(fx); }
});

test("absent runner data is reported as unavailable, and reconnect (fresh process, same host identity) returns the same session hash", { skip: HOST_LIMIT }, () => {
  const fx = fixture();
  try {
    session(fx, "mine", SESSION, fx.project);
    withEnv({ CODEX_THREAD_ID: SESSION, CODEX_HOME: fx.codexHome }, () => {
      const first = auditCurrentRunnerSession(approved(fx));
      const second = auditCurrentRunnerSession(approved(fx));
      assert.equal(first.status, "available");
      assert.equal(first.modelIdentity, "unavailable");
      assert.equal(first.tokenCounters, "unavailable");
      assert.equal(first.phaseWallTime, "unavailable");
      assert.equal(second.sessionSha256, first.sessionSha256);
    });
  } finally { cleanup(fx); }
});

test("CLI audit-current: exact flag set only, consent required, never a session selector or read grant", () => {
  const fx = fixture();
  try {
    session(fx, "mine", SESSION, fx.project);
    const env = { ...process.env, CODEX_SESSION_ID: SESSION, CODEX_HOME: fx.codexHome };
    delete env.CODEX_THREAD_ID;
    const run = (args) => {
      const done = spawnSync(process.execPath, [cli, ...args], { env, encoding: "utf8" });
      return JSON.parse(done.stdout.trim().split("\n").at(-1));
    };
    const base = ["audit-current", "--root", fx.project, "--runner", "codex", "--metadata-consent", "approved"];
    const ok = run(base);
    assert.equal(ok.schema === "pipeline.runner-own-session-audit.v1" || ok.status === "unavailable", true);
    assert.equal(ok.status, HAS_NOFOLLOW ? "available" : "unavailable");
    if (!HAS_NOFOLLOW) assert.equal(ok.reason, "nofollow-unavailable");
    assert.equal(run(["audit-current", "--root", fx.project, "--runner", "codex", "--metadata-consent", "denied"]).reason, "metadata-consent-required");
    assert.equal(run([...base, "--session-id", "foreign"]).reason, "invalid-invocation");
    assert.equal(run(["audit-current", "--root", fx.project, "--runner", "codex"]).reason, "invalid-invocation");
    assert.equal(run(["audit-current", "--root", fx.project, "--root", fx.project, "--runner", "codex"]).reason, "invalid-invocation");
  } finally { cleanup(fx); }
});

// ---------------------------------------------------------------------------------------------
// Added acceptance (2026-10-17, major): one repository-bound export on a grown session store.
// The parent/child link spellings used below (`forked_from_id`, `source.subagent.thread_spawn.
// parent_thread_id`) are the module's assumed Codex session_meta linkage; they are not verified
// against a live store.
// ---------------------------------------------------------------------------------------------
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const day = (n) => String(n).padStart(2, "0");
const at = (timestamp, row) => ({ timestamp, ...row });
const usageOf = (n) => ({ input_tokens: 10 * n, cached_input_tokens: n, output_tokens: 5 * n, reasoning_output_tokens: n, total_tokens: 15 * n });
const usageRow = (timestamp, n) => at(timestamp, { type: "event_msg", payload: { type: "token_count", info: { total_token_usage: usageOf(n) } } });
const viaSource = (parent) => ({ source: { subagent: { thread_spawn: { parent_thread_id: parent, depth: 1 } } } });

function put(fx, rel, id, cwd, { payload = {}, rows = [], ts } = {}) {
  const directory = join(fx.codexHome, "sessions", ...rel.split("/"));
  mkdirSync(directory, { recursive: true });
  const meta = { type: "session_meta", payload: { id, cwd, ...payload } };
  if (ts) { meta.timestamp = ts; meta.payload.timestamp = ts; }
  const file = join(directory, `rollout-${id}.jsonl`);
  writeFileSync(file, `${[meta, ...rows].map((row) => JSON.stringify(row)).join("\n")}\n`);
  return file;
}

const audit = (fx, internals) => auditCurrentRunnerSession(approved(fx), internals);
const ENV = (fx) => ({ CODEX_SESSION_ID: SESSION, CODEX_HOME: fx.codexHome });

test("a grown store of thousands of foreign sessions is scanned by repository filter inside the scan bound (module and CLI)", { skip: HOST_LIMIT }, () => {
  const fx = fixture();
  try {
    let foreign = 0;
    for (let month = 1; month <= 12; month += 1) {
      for (let d = 1; d <= 28; d += 1) {
        for (let n = 0; n < 13; n += 1) { put(fx, `2026/${day(month)}/${day(d)}`, `foreign-${month}-${d}-${n}`, fx.foreign); foreign += 1; }
      }
    }
    put(fx, "2026/10", SESSION, fx.project, { ts: "2026-10-19T10:00:00.000Z", rows: [usageRow("2026-10-19T10:05:00.000Z", 1)] });
    const FORMER_ENTRY_BOUND = 4096, FORMER_DIRECTORY_BOUND = 256;
    withEnv(ENV(fx), () => {
      const out = audit(fx);
      assert.equal(out.status, "available", JSON.stringify(out));
      assert.equal(out.completeness, "complete");
      assert.equal(out.truncated, false);
      assert.deepEqual(out.incompleteReasons, []);
      assert.equal(out.scan.foreignSessions, foreign);
      assert.equal(out.scan.entriesVisited > FORMER_ENTRY_BOUND, true);
      assert.equal(out.scan.directoriesVisited > FORMER_DIRECTORY_BOUND, true);
      assert.equal(out.scan.entriesVisited <= out.limits.entries, true);
      assert.equal(out.scan.bytesRead <= out.limits.scanBytes, true);
      assert.equal(out.segmentCount, 1);
      assert.equal(out.segments[0].role, "current");
      assert.equal(JSON.stringify(out).includes("foreign-"), false);
    });
    const env = { ...process.env, ...ENV(fx) };
    delete env.CODEX_THREAD_ID;
    const done = spawnSync(process.execPath, [cli, "audit-current", "--root", fx.project, "--runner", "codex", "--metadata-consent", "approved"], { env, encoding: "utf8" });
    const viaCli = JSON.parse(done.stdout.trim().split("\n").at(-1));
    assert.equal(viaCli.status, "available", done.stdout);
    assert.equal(viaCli.completeness, "complete");
    assert.equal(viaCli.sessionSha256, sha256(SESSION));
  } finally { cleanup(fx); }
});

test("truncation is reported honestly: a bound reached after the active session is partial, before it is unavailable", { skip: HOST_LIMIT }, () => {
  const fx = fixture();
  try {
    for (let d = 1; d <= 20; d += 1) for (let n = 0; n < 5; n += 1) put(fx, `2026/01/${day(d)}`, `foreign-${d}-${n}`, fx.foreign);
    const newest = put(fx, "2026/12/31", SESSION, fx.project);
    withEnv(ENV(fx), () => {
      const out = audit(fx, { limits: { entries: 30 } });
      assert.equal(out.status, "available");
      assert.equal(out.truncated, true);
      assert.equal(out.completeness, "partial");
      assert.equal(out.incompleteReasons.includes("entry-bound-reached"), true);
      assert.equal(out.limits.entries, 30);
      assert.equal(out.scan.entriesVisited <= 30, true);
      assert.equal(out.segmentCount, 1);
      const full = audit(fx);
      assert.equal(full.truncated, false);
      assert.equal(full.completeness, "complete");
    });
    rmSync(newest);
    put(fx, "2026/01/01", SESSION, fx.project);
    withEnv(ENV(fx), () => {
      const out = audit(fx, { limits: { entries: 30 } });
      assert.equal(out.status, "unavailable");
      assert.equal(out.reason, "scan-bound-exceeded");
      assert.equal(out.truncated, true);
      assert.equal(out.limits.entries, 30);
      assert.equal(audit(fx).status, "available");
    });
    withEnv(ENV(fx), () => {
      assert.equal(audit(fx, { limits: { entries: "many" } }).reason, "invalid-invocation");
      assert.equal(audit(fx, { limits: { unknownBound: 1 } }).reason, "invalid-invocation");
    });
  } finally { cleanup(fx); }
});

test("parent and child segments of this repository are enumerated with start/end events and token deltas; foreign and unrelated sessions are not", { skip: HOST_LIMIT }, () => {
  const fx = fixture();
  try {
    const PARENT = "audit-parent-001", CHILD_A = "audit-child-a", CHILD_B = "audit-child-b", GRAND = "audit-grandchild", OTHER = "audit-unrelated", FOREIGN_CHILD = "audit-foreign-child";
    put(fx, "2026/10/19", PARENT, fx.project, { ts: "2026-10-19T09:00:00.000Z", rows: [at("2026-10-19T09:30:00.000Z", { type: "turn_context", payload: { model: "gpt-5.5" } })] });
    put(fx, "2026/10/19", SESSION, fx.project, {
      ts: "2026-10-19T10:00:00.000Z", payload: { forked_from_id: PARENT },
      rows: [at("2026-10-19T10:01:00.000Z", { type: "turn_context", payload: { model: "gpt-5.5" } }),
        usageRow("2026-10-19T10:06:00.000Z", 1),
        at("2026-10-19T10:10:00.000Z", { type: "response_item", payload: { text: "PRIVATE-TRANSCRIPT-BODY" } }),
        usageRow("2026-10-19T10:29:00.000Z", 4),
        at("2026-10-19T10:30:00.000Z", { type: "event_msg", payload: { type: "task_complete" } })],
    });
    put(fx, "2026/10/19", CHILD_A, fx.project, { ts: "2026-10-19T10:12:00.000Z", payload: viaSource(SESSION), rows: [usageRow("2026-10-19T10:13:00.000Z", 2), usageRow("2026-10-19T10:20:00.000Z", 3)] });
    put(fx, "2026/10/19", CHILD_B, fx.project, { ts: "2026-10-19T10:14:00.000Z", payload: { forked_from_id: SESSION } });
    put(fx, "2026/10/19", GRAND, fx.project, { ts: "2026-10-19T10:15:00.000Z", payload: viaSource(CHILD_A) });
    put(fx, "2026/10/19", OTHER, fx.project, { ts: "2026-10-19T10:16:00.000Z" });
    put(fx, "2026/10/19", FOREIGN_CHILD, fx.foreign, { ts: "2026-10-19T10:17:00.000Z", payload: viaSource(SESSION) });
    withEnv(ENV(fx), () => {
      const out = audit(fx);
      assert.equal(out.status, "available", JSON.stringify(out));
      assert.equal(out.completeness, "complete");
      assert.equal(out.segmentCount, 5);
      assert.deepEqual(out.lineage, { ancestors: 1, descendants: 3 });
      assert.deepEqual(out.segments.map((segment) => [segment.role, segment.depth]),
        [["parent", -1], ["current", 0], ["child", 1], ["child", 1], ["child", 2]]);
      assert.deepEqual(out.segments.map((segment) => segment.ordinal), [0, 1, 2, 3, 4]);
      const byId = (id) => out.segments.find((segment) => segment.sessionSha256 === sha256(id));
      assert.equal(byId(OTHER), undefined);
      assert.equal(byId(FOREIGN_CHILD), undefined);
      const current = byId(SESSION);
      assert.equal(current.role, "current");
      assert.equal(current.parentSessionSha256, sha256(PARENT));
      assert.equal(byId(CHILD_A).parentSessionSha256, sha256(SESSION));
      assert.equal(byId(CHILD_B).parentSessionSha256, sha256(SESSION));
      assert.equal(byId(GRAND).parentSessionSha256, sha256(CHILD_A));
      assert.equal(current.startedAt, "2026-10-19T10:00:00.000Z");
      assert.equal(current.endedAt, "2026-10-19T10:30:00.000Z");
      assert.equal(current.elapsedMs, 30 * 60 * 1000);
      assert.deepEqual(current.firstEvent, { type: "session_meta" });
      assert.deepEqual(current.lastEvent, { type: "event_msg", subtype: "task_complete" });
      assert.equal(current.recordCount, 6);
      assert.equal(current.observation, "complete");
      assert.equal(current.tokenObservations, 2);
      assert.deepEqual(current.tokenCounters, usageOf(4));
      assert.deepEqual(current.tokenDelta, { input_tokens: 30, cached_input_tokens: 3, output_tokens: 15, reasoning_output_tokens: 3, total_tokens: 45 });
      assert.equal(byId(CHILD_A).tokenDelta.total_tokens, 15);
      assert.equal(byId(CHILD_B).tokenDelta, "unavailable");
      assert.equal(byId(CHILD_B).tokenCounters, "unavailable");
      assert.equal(out.startedAt, "2026-10-19T09:00:00.000Z");
      assert.equal(out.sessionSha256, sha256(SESSION));
      assert.deepEqual(out.tokenCounters, usageOf(4));
      assert.equal(out.phaseWallTime, "unavailable");
      const text = JSON.stringify(out);
      for (const leak of ["PRIVATE-TRANSCRIPT-BODY", SESSION, PARENT, CHILD_A, CHILD_B, GRAND, OTHER, FOREIGN_CHILD, fx.project, fx.foreign, fx.codexHome, "rollout-"]) {
        assert.equal(text.includes(leak), false, leak);
      }
    });
  } finally { cleanup(fx); }
});

test("a parent that cannot be found is stated as incomplete, never silently omitted", { skip: HOST_LIMIT }, () => {
  const fx = fixture();
  try {
    put(fx, "2026/10", SESSION, fx.project, { payload: { forked_from_id: "audit-missing-parent" } });
    withEnv(ENV(fx), () => {
      const out = audit(fx);
      assert.equal(out.status, "available");
      assert.equal(out.completeness, "partial");
      assert.equal(out.truncated, false);
      assert.equal(out.incompleteReasons.includes("parent-segment-not-found"), true);
      assert.deepEqual(out.lineage, { ancestors: 0, descendants: 0 });
    });
  } finally { cleanup(fx); }
});

test("a session file beyond the former 8 MiB cap is read by head and tail windows; growth during the audit is tolerated, shrinkage is not", { skip: HOST_LIMIT }, () => {
  const fx = fixture();
  try {
    const filler = Array.from({ length: 90 }, (_, n) => at("2026-10-19T10:10:00.000Z", { type: "response_item", payload: { n, text: "x".repeat(100 * 1024) } }));
    const file = put(fx, "2026/10", SESSION, fx.project, {
      ts: "2026-10-19T10:00:00.000Z",
      rows: [usageRow("2026-10-19T10:01:00.000Z", 1), ...filler, usageRow("2026-10-19T10:59:00.000Z", 5)],
    });
    withEnv(ENV(fx), () => {
      const out = audit(fx);
      assert.equal(out.status, "available", JSON.stringify(out));
      const [segment] = out.segments;
      assert.equal(segment.observation, "head-and-tail-windows");
      assert.equal(segment.unreadBytes > 0, true);
      assert.equal(segment.endedAt, "2026-10-19T10:59:00.000Z");
      assert.deepEqual(segment.tokenCounters, usageOf(5));
      assert.equal(segment.tokenDelta.total_tokens, 60);
    });
    rmSync(file);
    const growing = put(fx, "2026/10", SESSION, fx.project, { ts: "2026-10-19T10:00:00.000Z" });
    withEnv(ENV(fx), () => {
      const grown = audit(fx, { afterRead: (path) => { if (path === growing) appendFileSync(path, `${JSON.stringify(usageRow("2026-10-19T10:40:00.000Z", 2))}\n`); } });
      assert.equal(grown.status, "available", JSON.stringify(grown));
      assert.equal(grown.segments[0].grewDuringRead, true);
      const shrunk = audit(fx, { afterRead: (path) => { if (path === growing) writeFileSync(path, ""); } });
      assert.equal(shrunk.status, "unavailable");
      assert.equal(shrunk.reason, "snapshot-changed");
    });
  } finally { cleanup(fx); }
});
