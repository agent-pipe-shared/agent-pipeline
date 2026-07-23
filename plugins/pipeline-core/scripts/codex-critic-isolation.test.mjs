#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync, spawn as spawnProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { chmod, link, lstat, mkdir, mkdtemp, open, readFile, rm, symlink, truncate, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";

import {
  CODEX_CRITIC_ARTIFACTS,
  CODEX_CRITIC_POLICY,
  CODEX_CRITIC_TRACE_EVENTS,
  CODEX_CRITIC_TRACE_STEPS,
  buildCodexCriticInvocation,
  buildExactFixture,
  buildPermissionProfile,
  buildProfileBoundCodexCriticInvocation,
  buildReviewBundle,
  createSecureTraceStore,
  createDebugLineRedactor,
  criticPrompt,
  ensureOwnedProcessGroupGone,
  inspectCodexBinary,
  inspectToolFreeJsonl,
  localFailureDiagnostic,
  runCodexCritic,
  runPermissionProfilePreflight,
  runProfileBoundIsolation,
  sanitizeEnvironment,
  spawnDebugChildObserver,
  verifySecureTraceStore,
  verifyProfileContract,
} from "./codex-critic-isolation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const verdict = {
  findings: [], deliberately_not_flagged: ["synthetic fixture"], trajectory_verdict: "consistent",
  trajectory_evidence: "synthetic adapter result", briefing_violations: [], pass: true,
};
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed += 1; process.stdout.write(`PASS  ${name}\n`); }
  catch (error) { failures.push(`${name}: ${error.stack ?? error.message}`); process.stdout.write(`FAIL  ${name} -- ${error.message}\n`); }
}

function fixtureProfile() { return buildPermissionProfile({ fixtureRoot: "/tmp/profile-fixture", runtimeRoot: "/opt/codex/releases/0.144.4-test" }); }

await check("debug redactor emits only complete lines and finish flushes explicitly", () => {
  const redactor = createDebugLineRedactor();
  assert.deepEqual(redactor.write(Buffer.from("prefix to")), []);
  assert.deepEqual(redactor.write(Buffer.from("ken=split-private\nsecond\r")), ["prefix token=[REDACTED_SECRET]"]);
  assert.deepEqual(redactor.write(Buffer.from("\npassword=finish-private")), ["second"]);
  assert.deepEqual(redactor.finish(), ["password=[REDACTED_SECRET]"]);
  assert.throws(() => redactor.write(Buffer.from("late\n")), /closed/u);
});

await check("debug redactor preserves UTF-8 split across arbitrary Buffer chunks", () => {
  const input = Buffer.from("Grüße 🌍\n東京");
  const redactor = createDebugLineRedactor();
  const lines = [];
  for (const byte of input) lines.push(...redactor.write(Buffer.from([byte])));
  lines.push(...redactor.finish());
  assert.deepEqual(lines, ["Grüße 🌍", "東京"]);
});

await check("debug redactor covers every credential family", () => {
  const cases = [
    ["HTTP_AUTHORIZATION: Bearer auth-private", "auth-private"],
    ["scheme=Bearer bearer-private", "bearer-private"],
    ["OPENAI_API_KEY=api-private", "api-private"],
    ["GH_TOKEN: token-private", "token-private"],
    ["CLIENT_SECRET=secret-private", "secret-private"],
    ["DB_PASSWORD: password-private", "password-private"],
    ["SESSION_COOKIE: session=cookie-private; preference=also-private", "cookie-private"],
  ];
  for (const [line, raw] of cases) {
    const redactor = createDebugLineRedactor();
    const output = redactor.write(Buffer.from(`${line}\n`));
    assert.equal(output.length, 1, line);
    assert.equal(output[0].includes(raw), false, line);
    assert.match(output[0], /\[REDACTED_SECRET\]/u, line);
    assert.deepEqual(redactor.finish(), []);
  }
});

await check("debug redactor removes URL coordinates, paths and control bytes", () => {
  const redactor = createDebugLineRedactor();
  const raw = "url=https://example.invalid/review?account=private#fragment relative=/callback?code=private#state unix=/home/private/repo/file.txt drive=C:\\Users\\Private\\file.txt unc=\\\\server\\share\\private.txt controls=\u0000\t\u001b[31m\n";
  const [output] = redactor.write(Buffer.from(raw));
  assert.equal(output.includes("account=private"), false);
  assert.equal(output.includes("code=private"), false);
  assert.equal(output.includes("fragment"), false);
  assert.equal(output.includes("/home/private"), false);
  assert.equal(output.includes("C:\\Users"), false);
  assert.equal(output.includes("\\\\server\\share"), false);
  assert.match(output, /https:\/\/\[REDACTED_URL\]/u);
  assert.equal(output.match(/\?\[REDACTED_URL_QUERY\]#\[REDACTED_URL_FRAGMENT\]/gu)?.length, 1);
  assert.equal(output.match(/\[REDACTED_ABSOLUTE_PATH\]/gu)?.length, 4);
  assert.match(output, /controls=\\x00\\t\\x1b\[31m/u);
  assert.equal(/[\u0000-\u001f\u007f-\u009f]/u.test(output), false);
  assert.deepEqual(redactor.finish(), []);
});

await check("debug redactor bounds pending and total output and never exposes raw values", () => {
  const pendingRaw = "pending-private-value";
  const pending = createDebugLineRedactor({ maxPendingBytes: 8, maxOutputBytes: 64 });
  assert.throws(() => pending.write(Buffer.from(pendingRaw)), /limit exceeded/u);
  assert.equal(JSON.stringify(pending).includes(pendingRaw), false);
  assert.throws(() => pending.finish(), /closed/u);

  const outputRaw = "output-private-value";
  const output = createDebugLineRedactor({ maxPendingBytes: 64, maxOutputBytes: 3 });
  assert.deepEqual(output.write(Buffer.from("ab\n")), ["ab"]);
  assert.throws(() => output.write(Buffer.from(`${outputRaw}\n`)), /limit exceeded/u);
  assert.equal(JSON.stringify(output).includes(outputRaw), false);
  assert.throws(() => output.finish(), /closed/u);
});

await check("debug redactor removes URL authority, bare tokens, JWTs and case-normalized private literals across splits", () => {
  const rawValues = [
    "user-private", "host.private.invalid", "private/url/path", "file-private", "sk-privateCanary123",
    "ghp_PrivateCanary123", "eyJhbGciOiJIUzI1NiJ9.cHJpdmF0ZS1wYXlsb2Fk.cHJpdmF0ZS1zaWduYXR1cmU",
    "space-private", "machine-private-17", "c:/srv/private-root-17",
  ];
  const redactor = createDebugLineRedactor({ privateIdentifiers: ["MACHINE-PRIVATE-17"], privateRoots: ["C:\\Srv\\Private-Root-17"] });
  const input = Buffer.from(`https://user-private:pass@host.private.invalid/private/url/path?q=private#fragment file:///tmp/file-private sk-privateCanary123 ghp_PrivateCanary123 eyJhbGciOiJIUzI1NiJ9.cHJpdmF0ZS1wYXlsb2Fk.cHJpdmF0ZS1zaWduYXR1cmU token space-private machine-private-17 c:/srv/private-root-17\n`);
  const lines = [];
  for (let offset = 0; offset < input.length; offset += 3) lines.push(...redactor.write(input.subarray(offset, offset + 3)));
  lines.push(...redactor.finish());
  const output = lines.join("\n");
  for (const raw of rawValues) assert.equal(output.includes(raw), false, raw);
  assert.match(output, /https:\/\/\[REDACTED_URL\]/u);
  assert.match(output, /file:\/\/\[REDACTED_URL\]/u);
  assert.match(output, /\[REDACTED_PRIVATE_IDENTIFIER\]/u);
  assert.equal((output.match(/\[REDACTED_SECRET\]/gu) ?? []).length >= 4, true);
});

async function withTraceCase(fn) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "codex-trace-test-"));
  const fixtureRoot = path.join(directory, "fixture");
  await mkdir(fixtureRoot);
  const tracePath = path.join(directory, "trace.jsonl");
  try { return await fn({ directory, fixtureRoot, tracePath, options: { tracePath, repoRoot: root, fixtureRoot } }); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

function validTracePayloads() {
  const digest = "a".repeat(64);
  const events = [["run.started", {}]];
  for (const step of CODEX_CRITIC_TRACE_STEPS) {
    events.push(["step.started", { step }]);
    if (step === "preflight") {
      for (const [index, label] of ["profile-preflight-fixture-read", "profile-preflight-external-read-denied", "profile-preflight-write-denied"].entries()) {
        events.push(["child.spawn-requested", { label }], ["child.spawned", { label, pid: 201 + index, pgid: 201 + index }]);
        events.push(["lease.armed", { label, elapsedMs: 0, stdoutBytes: 0, stderrBytes: 0 }]);
        events.push(["child.exit", { label, code: index === 0 ? 0 : 2, signal: null }], ["child.close", { label, code: index === 0 ? 0 : 2, signal: null }]);
      }
    } else if (step === "critic") {
      events.push(["child.spawn-requested", { label: "critic" }], ["child.spawned", { label: "critic", pid: 101, pgid: 101 }]);
      events.push(["stdin.write-requested", { bytes: 12, sha256: digest }], ["stdin.write-accepted", { bytes: 12 }], ["stdin.end-requested", {}], ["stdin.closed", {}]);
      events.push(["stream.chunk", { stream: "stdout", bytes: 4, cumulativeBytes: 4, sha256: digest }]);
      events.push(["stream.jsonl-event", { type: "item.completed", itemType: "agent_message", status: "completed" }]);
      events.push(["process.sample", { availability: "observed", state: "S", cpuUserTicks: 1, cpuSystemTicks: 2, rssPages: 3, fdCount: 4, wchanSha256: digest }]);
      events.push(["lease.armed", { label: "critic", elapsedMs: 0, stdoutBytes: 4, stderrBytes: 0 }], ["lease.heartbeat", { label: "critic", elapsedMs: 1000, stdoutBytes: 4, stderrBytes: 0 }]);
      events.push(["child.exit", { label: "critic", code: 0, signal: null }], ["child.close", { label: "critic", code: 0, signal: null }]);
    } else if (step === "result") events.push(["result.observed", { present: true, bytes: 12, sha256: digest }]);
    events.push(["step.completed", { step }]);
  }
  events.push(["run.completed", { cause: "unbestimmt" }]);
  return events;
}

async function appendSuccessfulPreflightChildren(store) {
  for (const [index, label] of ["profile-preflight-fixture-read", "profile-preflight-external-read-denied", "profile-preflight-write-denied"].entries()) {
    await store.append("child.spawn-requested", { label }); await store.append("child.spawned", { label, pid: 301 + index, pgid: 301 + index });
    await store.append("lease.armed", { label, elapsedMs: 0, stdoutBytes: 0, stderrBytes: 0 });
    await store.append("child.exit", { label, code: index === 0 ? 0 : 2, signal: null }); await store.append("child.close", { label, code: index === 0 ? 0 : 2, signal: null });
  }
}

async function beginTraceStep(store, target) {
  await store.append("run.started", {});
  for (const step of CODEX_CRITIC_TRACE_STEPS) {
    await store.append("step.started", { step });
    if (step === target) return;
    if (step === "preflight") await appendSuccessfulPreflightChildren(store);
    await store.append("step.completed", { step });
  }
  throw new Error("target trace step is outside the fixed lifecycle");
}

async function completeSuccessfulTraceFromCritic(store) {
  await store.append("step.completed", { step: "critic" });
  for (const step of ["binding-after", "result", "canary", "cleanup"]) {
    await store.append("step.started", { step });
    if (step === "result") await store.append("result.observed", { present: true, bytes: 1, sha256: "b".repeat(64) });
    await store.append("step.completed", { step });
  }
  await store.append("run.completed", { cause: "unbestimmt" });
}

async function appendMinimalFailedTrace(store, cause = "unbestimmt") {
  await store.append("run.started", {}); await store.append("step.started", { step: "input" });
  await store.append("step.failed", { step: "input" }); await store.append("run.failed", { cause });
}

async function appendCompleteSuccessfulTrace(store) {
  for (const [event, payload] of validTracePayloads()) await store.append(event, payload);
}

await check("trace store publishes the exact closed event and step enums", () => {
  assert.deepEqual(CODEX_CRITIC_TRACE_EVENTS, [
    "trace.opened", "run.started", "run.completed", "run.failed", "step.started", "step.completed", "step.failed",
    "child.spawn-requested", "child.spawned", "child.spawn-failed", "child.error", "child.exit", "child.close", "child.signal-requested", "child.signal-result", "child.force-settled",
    "stdin.write-requested", "stdin.write-accepted", "stdin.end-requested", "stdin.closed", "stdin.error",
    "stream.chunk", "stream.jsonl-event", "stream.diagnostic", "stream.error", "process.sample", "lease.armed", "lease.heartbeat", "lease.expired", "result.observed", "trace.finalized",
  ]);
  assert.deepEqual(CODEX_CRITIC_TRACE_STEPS, ["input", "commit", "binary", "fixture", "bundle", "profile", "preflight", "binding-before", "critic", "binding-after", "result", "canary", "cleanup"]);
  assert.equal(Object.isFrozen(CODEX_CRITIC_TRACE_EVENTS), true);
  assert.equal(Object.isFrozen(CODEX_CRITIC_TRACE_STEPS), true);
});

await check("trace store accepts the exact complete lifecycle and clean final verification", () => withTraceCase(async ({ tracePath, options }) => {
  let monotonic = 10n;
  const store = await createSecureTraceStore({ ...options, now: () => "2026-07-14T12:00:00.000Z", monotonicNow: () => monotonic++ });
  await appendCompleteSuccessfulTrace(store);
  const synced = await store.sync();
  assert.equal(synced.recordCount, 1 + validTracePayloads().length);
  const final = await store.finalize({ outcome: "completed", cause: "unbestimmt" });
  assert.equal(final.ok, true);
  assert.equal(final.recordCount, 2 + validTracePayloads().length);
  assert.equal(final.outcome, "completed");
  assert.match(final.rootSha256, /^[0-9a-f]{64}$/u);
  const bytes = await readFile(tracePath);
  assert.equal(final.bytes, bytes.length);
  const records = bytes.toString("utf8").trimEnd().split("\n").map(JSON.parse);
  assert.deepEqual(records.map((record) => record.event), ["trace.opened", ...validTracePayloads().map(([event]) => event), "trace.finalized"]);
  assert.deepEqual(records.map((record) => record.seq), records.map((_record, index) => index + 1));
  assert.equal(records.every((record, index) => index === 0 ? record.previous_sha256 === null : record.previous_sha256 === records[index - 1].record_sha256), true);
  assert.equal(records.at(-1).payload.totalBytes, bytes.length);
  assert.equal(records.at(-1).payload.recordCount, records.length);
  assert.equal(records.at(-1).payload.priorRootSha256, records.at(-2).record_sha256);
  await assert.rejects(() => store.append("run.started", {}), /closed/u);
}));

await check("trace store rejects unknown events, every bad step event and additional payload keys", async () => {
  await withTraceCase(async ({ options }) => {
    const store = await createSecureTraceStore(options);
    await assert.rejects(() => store.append("private.event", {}), /closed enum/u);
    await assert.rejects(() => store.append("run.started", {}), /closed|enum/u);
  });
  for (const event of ["step.started", "step.completed", "step.failed"]) {
    await withTraceCase(async ({ options }) => {
      const store = await createSecureTraceStore(options);
      await assert.rejects(() => store.append(event, { step: "arbitrary" }), /step.*closed enum/u);
    });
  }
  await withTraceCase(async ({ options }) => {
    const store = await createSecureTraceStore(options);
    await assert.rejects(() => store.append("run.started", { detail: "not-allowed" }), /unexpected detail/u);
  });
});

await check("trace payload schemas reject unsafe enum values, categories and inconsistent observations", async () => {
  const invalid = [
    ["child.signal-requested", { label: "critic", signal: "SIG_PRIVATE" }, /signal enum/u],
    ["child.spawn-failed", { label: "critic", category: "raw error text" }, /category/u],
    ["stream.jsonl-event", { type: "tool.call", itemType: "mcp_tool_call", status: "completed" }, /lifecycle/u],
    ["stream.chunk", { stream: "private", bytes: 1, cumulativeBytes: 1, sha256: "a".repeat(64) }, /stream/u],
    ["process.sample", { availability: "observed", state: "?" }, /process state/u],
    ["process.sample", { availability: "unavailable", rssPages: 1 }, /cannot contain/u],
    ["result.observed", { present: false, bytes: 1, sha256: null }, /zero bytes/u],
    ["result.observed", { present: true, bytes: 1, sha256: null }, /inconsistent/u],
  ];
  for (const [event, payload, expected] of invalid) {
    await withTraceCase(async ({ options }) => {
      const store = await createSecureTraceStore(options);
      await assert.rejects(() => store.append(event, payload), expected);
    });
  }
  await withTraceCase(async ({ options }) => {
    const store = await createSecureTraceStore({ ...options, privateIdentifiers: ["PRIVATE-HOST"] });
    await assert.rejects(() => store.append("stream.diagnostic", { stream: "stderr", line: "private-host" }), /observer-managed/u);
  });
  await withTraceCase(async ({ options }) => {
    const store = await createSecureTraceStore({ ...options, privateIdentifiers: ["PRIVATE-HOST"] }); await beginTraceStep(store, "critic");
    const child = observedChild(); const timers = observerTimers();
    const { observer } = await spawnDebugChildObserver({ traceStore: store, spawn: () => child, command: "/debug/codex", ...timers });
    child.stderr.write(Buffer.from("private-host\n")); await settleEvents();
    await assert.rejects(() => observer.finishAndDrain(), /trace operation failed/u);
  });
});

await check("trace path validation rejects relative, noncanonical, outside, fixture, symlink and existing targets", () => withTraceCase(async ({ directory, fixtureRoot, tracePath, options }) => {
  await assert.rejects(() => createSecureTraceStore({ ...options, tracePath: "trace.jsonl" }), /absolute/u);
  await assert.rejects(() => createSecureTraceStore({ ...options, tracePath: `${directory}${path.sep}nested${path.sep}..${path.sep}other.jsonl` }), /canonical/u);
  await assert.rejects(() => createSecureTraceStore({ ...options, tracePath: path.join(root, "private-trace.jsonl") }), /OS temp/u);
  await assert.rejects(() => createSecureTraceStore({ ...options, tracePath: path.join(fixtureRoot, "trace.jsonl") }), /outside fixtureRoot/u);

  const realParent = path.join(directory, "real-parent");
  const linkedParent = path.join(directory, "linked-parent");
  await mkdir(realParent); await symlink(realParent, linkedParent);
  await assert.rejects(() => createSecureTraceStore({ ...options, tracePath: path.join(linkedParent, "trace.jsonl") }), /symbolic link/u);

  await writeFile(tracePath, "existing", { mode: 0o600 });
  await assert.rejects(() => createSecureTraceStore(options), /absent/u);
  await unlink(tracePath);
  await symlink(path.join(directory, "missing-target"), tracePath);
  await assert.rejects(() => createSecureTraceStore(options), /symbolic link/u);
}));

await check("trace location applies canonical generic forbidden roots during creation and verification", () => withTraceCase(async ({ directory, tracePath }) => {
  await assert.rejects(() => createSecureTraceStore({ tracePath, forbiddenRoots: [path.join(directory, "fixture", "..")] }), /outside forbiddenRoots\[0\]/u);
  const store = await createSecureTraceStore({ tracePath, forbiddenRoots: [root] });
  await appendMinimalFailedTrace(store); await store.finalize({ outcome: "failed", cause: "unbestimmt" });
  await assert.rejects(() => verifySecureTraceStore({ tracePath, binding: store.binding, forbiddenRoots: [directory] }), /outside forbiddenRoots\[0\]/u);
}));

await check("trace lifecycle rejects duplicate terminals, illegal steps, child/stdin/lease order and post-terminal events", async () => {
  const cases = [
    async (store) => store.append("run.completed", { cause: "unbestimmt" }),
    async (store) => { await store.append("run.started", {}); return store.append("run.started", {}); },
    async (store) => { await store.append("run.started", {}); return store.append("step.completed", { step: "input" }); },
    async (store) => { await store.append("run.started", {}); return store.append("step.started", { step: "result" }); },
    async (store) => { await store.append("run.started", {}); return store.append("child.spawned", { label: "critic", pid: 1, pgid: 1 }); },
    async (store) => { await store.append("run.started", {}); return store.append("stdin.write-accepted", { bytes: 1 }); },
    async (store) => { await store.append("run.started", {}); return store.append("lease.heartbeat", { label: "critic", elapsedMs: 1, stdoutBytes: 0, stderrBytes: 0 }); },
    async (store) => { await beginTraceStep(store, "result"); return store.append("step.completed", { step: "result" }); },
    async (store) => { await beginTraceStep(store, "result"); await store.append("result.observed", { present: false, bytes: 0, sha256: null }); return store.append("result.observed", { present: false, bytes: 0, sha256: null }); },
    async (store) => { await beginTraceStep(store, "critic"); return store.append("child.spawn-requested", { label: "profile-preflight-fixture-read" }); },
    async (store) => { await appendCompleteSuccessfulTrace(store); return store.append("result.observed", { present: false, bytes: 0, sha256: null }); },
  ];
  for (const runCase of cases) await withTraceCase(async ({ options }) => {
    const store = await createSecureTraceStore(options);
    await assert.rejects(() => runCase(store), /run|step|spawn|stdin|lease|active|result|child label/u);
  });
  await withTraceCase(async ({ options }) => {
    const store = await createSecureTraceStore(options);
    await appendMinimalFailedTrace(store, "cleanup");
    await assert.rejects(() => store.finalize({ outcome: "completed", cause: "cleanup" }), /disagrees/u);
  });
  await withTraceCase(async ({ tracePath, options }) => {
    const store = await createSecureTraceStore(options); await beginTraceStep(store, "critic");
    const result = await spawnDebugChildObserver({ traceStore: store, command: "/debug/missing", spawn: () => {
      assert.equal(readFileSync(tracePath, "utf8").includes('"event":"child.spawn-requested"'), true);
      throw Object.assign(new Error("private spawn failure"), { code: "ENOENT" });
    } });
    assert.deepEqual({ ok: result.ok, category: result.category }, { ok: false, category: "not-found" });
    assert.equal(readFileSync(tracePath, "utf8").includes('"event":"child.spawn-failed"'), true);
    await store.append("step.failed", { step: "critic" }); await store.append("run.failed", { cause: "child-process" });
    await store.finalize({ outcome: "failed", cause: "child-process" });
  });
});

function forgedTrace(specifications, outcome, cause) {
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  const records = []; let previous = null;
  for (const [index, [event, payload]] of specifications.entries()) {
    const withoutHash = { seq: index + 1, wall_time: "2026-07-14T12:00:00.000Z", monotonic_ns: String(index + 1), event, payload, previous_sha256: previous };
    const record = { ...withoutHash, record_sha256: hash(JSON.stringify(withoutHash)) };
    records.push(record); previous = record.record_sha256;
  }
  let totalBytes = 0; let final;
  for (let iteration = 0; iteration < 16; iteration += 1) {
    const payload = { outcome, cause, priorRootSha256: previous, recordCount: records.length + 1, totalBytes };
    const withoutHash = { seq: records.length + 1, wall_time: "2026-07-14T12:00:00.000Z", monotonic_ns: String(records.length + 1), event: "trace.finalized", payload, previous_sha256: previous };
    final = { ...withoutHash, record_sha256: hash(JSON.stringify(withoutHash)) };
    const actual = Buffer.byteLength(`${[...records, final].map(JSON.stringify).join("\n")}\n`);
    if (actual === totalBytes) break;
    totalBytes = actual;
  }
  return Buffer.from(`${[...records, final].map(JSON.stringify).join("\n")}\n`);
}

await check("trace verifier replays lifecycle and rejects correctly hashed illegal order and cardinality", async () => {
  const illegal = [
    [["trace.opened", {}], ["run.started", {}], ["run.completed", { cause: "unbestimmt" }], ["result.observed", { present: false, bytes: 0, sha256: null }]],
    [["trace.opened", {}], ["run.started", {}], ["run.completed", { cause: "unbestimmt" }], ["run.failed", { cause: "unbestimmt" }]],
    [["trace.opened", {}], ["run.started", {}], ["step.completed", { step: "input" }], ["run.failed", { cause: "unbestimmt" }]],
  ];
  for (const specifications of illegal) await withTraceCase(async ({ tracePath, options }) => {
    const store = await createSecureTraceStore(options);
    await appendMinimalFailedTrace(store); await store.finalize({ outcome: "failed", cause: "unbestimmt" });
    await writeFile(tracePath, forgedTrace(specifications, "completed", "unbestimmt"), { mode: 0o600 });
    await assert.rejects(() => verifySecureTraceStore({ ...options, binding: store.binding }), /active run|step terminal|complete fixed/u);
  });
});

await check("trace verifier requires one correctly labelled lease arm for every child in a complete success", async () => {
  const complete = [["trace.opened", {}], ...validTracePayloads()];
  const variants = [
    complete.filter(([event]) => !event.startsWith("lease.")),
    (() => {
      const records = complete.map(([event, payload]) => [event, { ...payload }]);
      const index = records.findIndex(([event]) => event === "lease.armed");
      records.splice(index + 1, 0, [records[index][0], { ...records[index][1] }]);
      return records;
    })(),
    complete.map(([event, payload]) => event === "lease.armed" && payload.label === "critic"
      ? [event, { ...payload, label: "profile-preflight-fixture-read" }]
      : [event, { ...payload }]),
  ];
  for (const specifications of variants) await withTraceCase(async ({ tracePath, options }) => {
    const store = await createSecureTraceStore(options);
    await appendMinimalFailedTrace(store); await store.finalize({ outcome: "failed", cause: "unbestimmt" });
    await writeFile(tracePath, forgedTrace(specifications, "completed", "unbestimmt"), { mode: 0o600 });
    await assert.rejects(() => verifySecureTraceStore({ ...options, binding: store.binding }), /lease|armed/u);
  });
});

await check("trace creation uses regular 0600 single-link file and binds device/inode", () => withTraceCase(async ({ tracePath, directory, options }) => {
  const store = await createSecureTraceStore(options);
  const info = await lstat(tracePath);
  assert.equal(info.isFile(), true);
  assert.equal(info.mode & 0o777, 0o600);
  assert.equal(info.nlink, 1);
  assert.deepEqual(store.binding, { dev: String(info.dev), ino: String(info.ino) });
  await appendMinimalFailedTrace(store, "cleanup");
  const alias = path.join(directory, "trace-alias.jsonl");
  await link(tracePath, alias);
  await assert.rejects(() => store.finalize({ outcome: "failed", cause: "cleanup" }), /link count/u);
}));

await check("trace appends serialize with contiguous order and nondecreasing monotonic nanoseconds", () => withTraceCase(async ({ tracePath, options }) => {
  let tick = 0n;
  const store = await createSecureTraceStore({ ...options, monotonicNow: () => ++tick });
  await beginTraceStep(store, "critic");
  await store.append("child.spawn-requested", { label: "critic" });
  await store.append("child.spawned", { label: "critic", pid: 101, pgid: 101 });
  await store.append("stdin.write-requested", { bytes: 0, sha256: createHash("sha256").update("").digest("hex") });
  await store.append("stdin.write-accepted", { bytes: 0 }); await store.append("stdin.end-requested", {}); await store.append("stdin.closed", {});
  await store.append("lease.armed", { label: "critic", elapsedMs: 0, stdoutBytes: 0, stderrBytes: 0 });
  await Promise.all(Array.from({ length: 12 }, (_unused, index) => store.append("lease.heartbeat", { label: "critic", elapsedMs: index, stdoutBytes: index, stderrBytes: 0 })));
  await store.append("child.exit", { label: "critic", code: 0, signal: null });
  await store.append("child.close", { label: "critic", code: 0, signal: null });
  await completeSuccessfulTraceFromCritic(store);
  await store.finalize({ outcome: "completed", cause: "unbestimmt" });
  const records = (await readFile(tracePath, "utf8")).trimEnd().split("\n").map(JSON.parse);
  assert.deepEqual(records.map((record) => record.seq), Array.from({ length: records.length }, (_unused, index) => index + 1));
  assert.deepEqual(records.filter((record) => record.event === "lease.heartbeat").map((record) => record.payload.elapsedMs), Array.from({ length: 12 }, (_unused, index) => index));
  assert.equal(records.every((record, index) => index === 0 || BigInt(record.monotonic_ns) >= BigInt(records[index - 1].monotonic_ns)), true);
}));

await check("trace store fails closed on event, byte and backward-clock bounds", async () => {
  await withTraceCase(async ({ options }) => {
    const store = await createSecureTraceStore({ ...options, maxEvents: 3 });
    await store.append("run.started", {});
    await assert.rejects(() => store.append("run.started", {}), /no room/u);
    await assert.rejects(() => store.finalize({ outcome: "failed", cause: "unbestimmt" }), /closed|room/u);
  });
  await withTraceCase(async ({ options }) => {
    await assert.rejects(() => createSecureTraceStore({ ...options, maxBytes: 1 }), /byte bound/u);
  });
  await withTraceCase(async ({ options }) => {
    const times = [2n, 1n];
    const store = await createSecureTraceStore({ ...options, monotonicNow: () => times.shift() });
    await assert.rejects(() => store.append("run.started", {}), /backwards/u);
    await assert.rejects(() => store.sync(), /backwards|closed/u);
  });
});

await check("trace store fails closed on injected write and sync errors", async () => {
  await withTraceCase(async ({ options }) => {
    let writes = 0;
    const injectedOpen = async (...args) => {
      const handle = await open(...args);
      if (args.length < 3) return handle;
      return {
        stat: (...inner) => handle.stat(...inner),
        write: (...inner) => { writes += 1; return writes === 2 ? Promise.reject(new Error("injected-write")) : handle.write(...inner); },
        datasync: () => handle.datasync(), sync: () => handle.sync(), close: () => handle.close(),
      };
    };
    const store = await createSecureTraceStore({ ...options, io: { open: injectedOpen } });
    await assert.rejects(() => store.append("run.started", {}), /injected-write/u);
    await assert.rejects(() => store.sync(), /injected-write|closed/u);
  });
  await withTraceCase(async ({ options }) => {
    const injectedOpen = async (...args) => {
      const handle = await open(...args);
      if (args.length < 3) return handle;
      return { stat: (...inner) => handle.stat(...inner), write: (...inner) => handle.write(...inner), datasync: () => Promise.reject(new Error("injected-sync")), sync: () => Promise.reject(new Error("injected-sync")), close: () => handle.close() };
    };
    const store = await createSecureTraceStore({ ...options, io: { open: injectedOpen } });
    await assert.rejects(() => store.sync(), /injected-sync/u);
    await assert.rejects(() => store.append("run.started", {}), /injected-sync|closed/u);
  });
});

await check("trace verification detects truncation, mutation, replacement and mode drift", async () => {
  for (const fault of ["truncation", "mutation", "replacement", "mode"]) {
    await withTraceCase(async ({ tracePath, options }) => {
      const store = await createSecureTraceStore(options);
      await appendMinimalFailedTrace(store);
      await store.finalize({ outcome: "failed", cause: "unbestimmt" });
      const original = await readFile(tracePath);
      if (fault === "truncation") {
        const finalStart = original.lastIndexOf(0x0a, original.length - 2) + 1;
        await truncate(tracePath, finalStart);
        await assert.rejects(() => verifySecureTraceStore({ ...options, binding: store.binding }), /missing.*final|truncated/u);
      } else if (fault === "mutation") {
        const changed = Buffer.from(original);
        const marker = Buffer.from('"record_sha256":"');
        const offset = changed.indexOf(marker) + marker.length;
        changed[offset] = changed[offset] === 0x61 ? 0x62 : 0x61;
        await writeFile(tracePath, changed);
        await assert.rejects(() => verifySecureTraceStore({ ...options, binding: store.binding }), /hash|predecessor/u);
      } else if (fault === "replacement") {
        await unlink(tracePath); await writeFile(tracePath, original, { mode: 0o600 });
        await assert.rejects(() => verifySecureTraceStore({ ...options, binding: store.binding }), /device\/inode/u);
      } else {
        await chmod(tracePath, 0o640);
        await assert.rejects(() => verifySecureTraceStore({ ...options, binding: store.binding }), /0600/u);
      }
    });
  }
});

function observedChild({ pid = 4242, onWrite = () => {}, onEnd = () => {}, onKill = () => true, listenerOrder = [] } = {}) {
  const child = new EventEmitter();
  child.pid = pid;
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kill = (signal) => onKill(signal);
  for (const [emitter, prefix] of [[child, "child"], [child.stdin, "stdin"], [child.stdout, "stdout"], [child.stderr, "stderr"]]) {
    const originalOn = emitter.on;
    emitter.on = function trackedOn(event, listener) { listenerOrder.push(`${prefix}:${event}`); return originalOn.call(this, event, listener); };
  }
  const originalWrite = child.stdin.write.bind(child.stdin);
  child.stdin.write = (chunk, ...args) => { listenerOrder.push("stdin:write"); onWrite(Buffer.from(chunk), child); return originalWrite(chunk, ...args); };
  const originalEnd = child.stdin.end.bind(child.stdin);
  child.stdin.end = (...args) => { listenerOrder.push("stdin:end"); onEnd(child); return originalEnd(...args); };
  return child;
}

function failingStdinChild(mode) {
  const child = observedChild();
  if (mode === "epipe") {
    child.stdin.write = (_chunk, callback) => {
      setImmediate(() => { const error = Object.assign(new Error("stdin-private-error"), { code: "EPIPE" }); child.stdin.emit("error", error); callback(error); });
      return true;
    };
  } else {
    child.stdin.write = (_chunk, callback) => { setImmediate(() => callback()); return true; };
    child.stdin.end = () => { setImmediate(() => child.stdin.emit("close")); return child.stdin; };
  }
  return child;
}

function observerTimers(onArm = () => {}) {
  const state = { interval: null, timeout: null, clearedIntervals: 0, clearedTimeouts: 0 };
  return {
    state,
    setIntervalFn(fn, milliseconds) { onArm("interval"); state.interval = { fn, milliseconds }; return { unref() {} }; },
    clearIntervalFn() { state.clearedIntervals += 1; },
    setTimeoutFn(fn, milliseconds) { onArm("timeout"); state.timeout = { fn, milliseconds }; return { unref() {} }; },
    clearTimeoutFn() { state.clearedTimeouts += 1; },
  };
}

function settleEvents() { return new Promise((resolve) => setImmediate(resolve)); }

await check("debug child observer installs listeners before stdin and drains early split UTF-8 JSONL plus redacted stderr", () => withTraceCase(async ({ tracePath, options }) => {
  const store = await createSecureTraceStore({ ...options, privateIdentifiers: ["MACHINE-PRIVATE-17"] }); await beginTraceStep(store, "critic");
  const order = []; const durableSnapshots = [];
  const snapshot = (sideEffect) => durableSnapshots.push([sideEffect, readFileSync(tracePath, "utf8")]);
  const timers = observerTimers(snapshot); const procPaths = [];
  const stdout = Buffer.from(`${JSON.stringify({ type: "thread.started" })}\n${JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "private-verdict-🌍" } })}\n`);
  const split = stdout.indexOf(Buffer.from("🌍")) + 1;
  const child = observedChild({
    listenerOrder: order,
    onWrite: (_input, current) => { snapshot("stdin-write"); current.stdout.write(stdout.subarray(0, split)); current.stderr.write(Buffer.from("token=split-")); },
    onEnd: (current) => { snapshot("stdin-end"); current.stdout.end(stdout.subarray(split)); current.stderr.end(Buffer.from("private\nmachine-private-17\n")); },
  });
  const statFields = Array(22).fill("0"); statFields[0] = "S"; statFields[11] = "11"; statFields[12] = "12"; statFields[21] = "13";
  const procIo = {
    readFile: async (target) => {
      procPaths.push(target);
      if (target.endsWith("/stat")) return Buffer.from(`4242 (private command) ${statFields.join(" ")}\n`);
      if (target.endsWith("/status")) return Buffer.from("Name:\tprivate-command\nPid:\t4242\n");
      if (target.endsWith("/wchan")) return Buffer.from("private-wchan-coordinate\n");
      throw Object.assign(new Error("unexpected private path"), { code: "ENOENT" });
    },
    readdir: async (target) => { procPaths.push(target); return ["0", "1", "2"]; },
  };
  let clock = 100;
  const spawned = await spawnDebugChildObserver({ traceStore: store, spawn: () => { snapshot("spawn"); return child; }, command: "/debug/codex", label: "critic", privateIdentifiers: ["machine-private-17"], procIo, clock: () => clock, ...timers });
  assert.equal(spawned.ok, true); const { observer } = spawned;
  await observer.armLease({ leaseMs: 1000 }); clock = 125; await observer.heartbeatLease();
  await observer.writeAndEndStdin("stdin-private-content");
  await observer.sampleProcess();
  await settleEvents();
  child.emit("exit", 0, null); child.emit("close", 0, null);
  await settleEvents();
  const summary = await observer.finishAndDrain();
  assert.equal(summary.closed, true); assert.equal(timers.state.interval.milliseconds, 5000); assert.equal(timers.state.clearedIntervals > 0, true);
  const writeIndex = order.indexOf("stdin:write");
  for (const listener of ["child:error", "stdin:error", "stdout:data", "stderr:data", "child:exit", "child:close"]) assert.equal(order.indexOf(listener) >= 0 && order.indexOf(listener) < writeIndex, true, listener);
  assert.equal(order.indexOf("stdin:write") < order.indexOf("stdin:end"), true);
  assert.deepEqual(procPaths.sort(), ["/proc/4242/fd", "/proc/4242/stat", "/proc/4242/status", "/proc/4242/wchan"]);
  assert.equal(procPaths.some((entry) => entry.endsWith("cmdline") || entry.endsWith("environ")), false);
  await completeSuccessfulTraceFromCritic(store); await store.finalize({ outcome: "completed", cause: "unbestimmt" });
  assert.equal(durableSnapshots.find(([sideEffect]) => sideEffect === "spawn")[1].includes('"event":"child.spawn-requested"'), true);
  assert.equal(durableSnapshots.find(([sideEffect]) => sideEffect === "stdin-write")[1].includes('"event":"stdin.write-requested"'), true);
  assert.equal(durableSnapshots.find(([sideEffect]) => sideEffect === "stdin-end")[1].includes('"event":"stdin.end-requested"'), true);
  assert.equal(durableSnapshots.find(([sideEffect]) => sideEffect === "timeout")[1].includes('"event":"lease.armed"'), true);
  const trace = await readFile(tracePath, "utf8");
  for (const raw of ["stdin-private-content", "private-verdict", "split-private", "machine-private-17", "private-wchan-coordinate", "private-command"]) assert.equal(trace.includes(raw), false, raw);
  const records = trace.trimEnd().split("\n").map(JSON.parse);
  assert.deepEqual(records.filter((record) => record.event === "stream.jsonl-event").map((record) => record.payload), [
    { type: "thread.started", itemType: "unknown", status: "started" },
    { type: "item.completed", itemType: "agent_message", status: "completed" },
  ]);
  assert.equal(records.some((record) => record.event === "stream.diagnostic" && record.payload.line.includes("[REDACTED_SECRET]")), true);
  assert.equal(records.some((record) => record.event === "process.sample" && record.payload.availability === "observed" && record.payload.fdCount === 3), true);
}));

await check("debug child observer accepts stdin only after callback and drain and rejects asynchronous EPIPE or premature close", async () => {
  for (const [mode, category] of [["epipe", "broken-pipe"], ["close", "premature-close"]]) await withTraceCase(async ({ tracePath, options }) => {
    const store = await createSecureTraceStore(options); await beginTraceStep(store, "critic"); const timers = observerTimers();
    const child = failingStdinChild(mode);
    const spawned = await spawnDebugChildObserver({ traceStore: store, spawn: () => child, command: "/debug/codex", ...timers });
    const { observer } = spawned;
    await assert.rejects(() => observer.writeAndEndStdin("stdin-private-payload"), new RegExp(category, "u"));
    child.stdout.end(); child.stderr.end(); child.emit("exit", 1, null); child.emit("close", 1, null); await settleEvents();
    await assert.rejects(() => observer.finishAndDrain(), /closed failure category/u);
    await store.append("step.failed", { step: "critic" }); await store.append("run.failed", { cause: "coordinator-input" }); await store.finalize({ outcome: "failed", cause: "coordinator-input" });
    const trace = await readFile(tracePath, "utf8");
    assert.equal(trace.includes("stdin-private-error"), false); assert.equal(trace.includes("stdin-private-payload"), false);
    assert.equal(trace.includes('"event":"stdin.error"'), true); assert.equal(trace.includes(`"category":"${category}"`), true);
    if (mode === "epipe") assert.equal(trace.includes('"event":"stdin.write-accepted"'), false);
    assert.equal(trace.includes('"event":"stdin.closed"'), false);
  });
  await withTraceCase(async ({ tracePath, options }) => {
    const store = await createSecureTraceStore(options); await beginTraceStep(store, "critic"); const timers = observerTimers();
    const child = observedChild(); let callbackSawAccepted = null;
    child.stdin.write = (_chunk, callback) => {
      setImmediate(() => {
        callback(); callbackSawAccepted = readFileSync(tracePath, "utf8").includes('"event":"stdin.write-accepted"');
        setImmediate(() => child.stdin.emit("drain"));
      });
      return false;
    };
    child.stdin.end = () => { setImmediate(() => child.stdin.emit("finish")); return child.stdin; };
    const { observer } = await spawnDebugChildObserver({ traceStore: store, spawn: () => child, command: "/debug/codex", ...timers });
    await observer.writeAndEndStdin("backpressure-private-payload");
    await observer.armLease({ leaseMs: 1000 });
    assert.equal(callbackSawAccepted, false);
    assert.equal(readFileSync(tracePath, "utf8").includes('"event":"stdin.write-accepted"'), true);
    child.stdout.end(); child.stderr.end(); child.emit("exit", 0, null); child.emit("close", 0, null); await settleEvents();
    await observer.finishAndDrain(); await completeSuccessfulTraceFromCritic(store); await store.finalize({ outcome: "completed", cause: "unbestimmt" });
  });
  await withTraceCase(async ({ tracePath, options }) => {
    let child;
    const injectedOpen = async (...args) => {
      const handle = await open(...args);
      if (args.length < 3) return handle;
      return {
        stat: (...inner) => handle.stat(...inner),
        write: async (buffer, ...inner) => {
          if (buffer.includes(Buffer.from('"event":"stdin.write-accepted"'))) {
            await new Promise((resolve) => setImmediate(() => {
              child.stdin.emit("error", Object.assign(new Error("post-callback-private-error"), { code: "EPIPE" }));
              resolve();
            }));
          }
          return handle.write(buffer, ...inner);
        },
        datasync: () => handle.datasync(), sync: () => handle.sync(), close: () => handle.close(),
      };
    };
    const store = await createSecureTraceStore({ ...options, io: { open: injectedOpen } }); await beginTraceStep(store, "critic");
    child = observedChild();
    child.stdin.write = (_chunk, callback) => { setImmediate(callback); return true; };
    const { observer } = await spawnDebugChildObserver({ traceStore: store, spawn: () => child, command: "/debug/codex", ...observerTimers() });
    await assert.rejects(() => observer.writeAndEndStdin("post-callback-private-payload"), /broken-pipe/u);
    child.stdout.end(); child.stderr.end(); child.emit("exit", 1, null); child.emit("close", 1, null); await settleEvents();
    await assert.rejects(() => observer.finishAndDrain(), /closed failure category/u);
    await store.append("step.failed", { step: "critic" }); await store.append("run.failed", { cause: "coordinator-input" }); await store.finalize({ outcome: "failed", cause: "coordinator-input" });
    const trace = await readFile(tracePath, "utf8");
    assert.equal(trace.includes("post-callback-private-error"), false);
    assert.equal(trace.includes("post-callback-private-payload"), false);
    assert.equal(trace.includes('"event":"stdin.error"'), true);
    assert.equal(trace.includes('"category":"broken-pipe"'), true);
    assert.equal(trace.includes('"event":"stdin.closed"'), false);
  });
});

await check("debug child observer rolls back final stdin close when EPIPE arrives during its trace append", () => withTraceCase(async ({ tracePath, options }) => {
  let child; let injected = false; const operations = [];
  const injectedOpen = async (...args) => {
    const handle = await open(...args);
    if (args.length < 3) return handle;
    return {
      stat: (...inner) => handle.stat(...inner),
      write: async (buffer, ...inner) => {
        if (buffer.includes(Buffer.from('"event":"stdin.error"'))) operations.push("stdin.error");
        if (!injected && buffer.includes(Buffer.from('"event":"stdin.closed"'))) {
          operations.push("stdin.closed");
          injected = true;
          await new Promise((resolve) => setImmediate(() => {
            child.stdin.emit("error", Object.assign(new Error("final-append-private-error"), { code: "EPIPE" }));
            resolve();
          }));
        }
        return handle.write(buffer, ...inner);
      },
      datasync: () => { operations.push("sync"); return handle.datasync(); },
      sync: () => { operations.push("sync"); return handle.sync(); }, close: () => handle.close(),
    };
  };
  const store = await createSecureTraceStore({ ...options, io: { open: injectedOpen } }); await beginTraceStep(store, "critic");
  child = observedChild();
  child.stdin.write = (_chunk, callback) => { setImmediate(callback); return true; };
  child.stdin.end = () => { setImmediate(() => child.stdin.emit("finish")); return child.stdin; };
  const { observer } = await spawnDebugChildObserver({ traceStore: store, spawn: () => child, command: "/debug/codex", ...observerTimers() });
  await assert.rejects(() => observer.writeAndEndStdin("final-append-private-payload"), /broken-pipe/u);
  assert.equal(injected, true);
  assert.deepEqual(operations.slice(operations.lastIndexOf("stdin.error")), ["stdin.error", "sync"]);
  child.stdout.end(); child.stderr.end(); child.emit("exit", 1, null); child.emit("close", 1, null); await settleEvents();
  await assert.rejects(() => observer.finishAndDrain(), /closed failure category/u);
  await store.append("step.failed", { step: "critic" }); await store.append("run.failed", { cause: "coordinator-input" }); await store.finalize({ outcome: "failed", cause: "coordinator-input" });
  const trace = await readFile(tracePath, "utf8");
  assert.equal(trace.includes("final-append-private-error"), false);
  assert.equal(trace.includes("final-append-private-payload"), false);
  assert.equal(trace.includes('"event":"stdin.error"'), true);
  assert.equal(trace.includes('"category":"broken-pipe"'), true);
  assert.equal(trace.includes('"event":"stdin.closed"'), false);
}));

await check("debug child observer lease expiry records the signal pair, stops sampling and fails closed", () => withTraceCase(async ({ tracePath, options }) => {
  const store = await createSecureTraceStore(options); await beginTraceStep(store, "critic"); const timers = observerTimers(); const signals = [];
  const child = observedChild({ onKill: (signal) => { signals.push(signal); assert.equal(readFileSync(tracePath, "utf8").includes('"event":"child.signal-requested"'), true); return true; } });
  let clock = 1000;
  const spawned = await spawnDebugChildObserver({ traceStore: store, spawn: () => child, command: "/debug/codex", clock: () => clock, ...timers }); const { observer } = spawned;
  await observer.writeAndEndStdin(Buffer.alloc(0)); await settleEvents();
  await observer.armLease({ leaseMs: 25, signal: "SIGTERM" }); assert.equal(timers.state.timeout.milliseconds, 25);
  clock = 1025; await observer.expireLease({ signal: "SIGTERM" });
  child.stdout.end(); child.stderr.end(); child.emit("exit", null, "SIGTERM"); child.emit("close", null, "SIGTERM"); await settleEvents();
  await assert.rejects(() => observer.finishAndDrain(), /closed failure category/u);
  assert.deepEqual(signals, ["SIGTERM"]); assert.equal(timers.state.clearedIntervals > 0, true); assert.equal(timers.state.clearedTimeouts > 0, true);
  await store.append("step.failed", { step: "critic" }); await store.append("run.failed", { cause: "response-stalled" }); await store.finalize({ outcome: "failed", cause: "response-stalled" });
  const records = (await readFile(tracePath, "utf8")).trimEnd().split("\n").map(JSON.parse);
  assert.deepEqual(records.filter((record) => ["lease.expired", "child.signal-requested", "child.signal-result"].includes(record.event)).map((record) => record.event), ["lease.expired", "child.signal-requested", "child.signal-result"]);
}));

await check("debug child observer records categorical proc unavailability without leaking the read error", () => withTraceCase(async ({ tracePath, options }) => {
  const store = await createSecureTraceStore(options); await beginTraceStep(store, "critic"); const timers = observerTimers();
  const unavailable = Object.assign(new Error("proc-private-detail"), { code: "ENOENT" });
  const child = observedChild();
  const spawned = await spawnDebugChildObserver({ traceStore: store, spawn: () => child, command: "/debug/codex", procIo: { readFile: async () => { throw unavailable; }, readdir: async () => { throw unavailable; } }, ...timers }); const { observer } = spawned;
  await observer.writeAndEndStdin(""); await observer.armLease({ leaseMs: 1000 }); await observer.sampleProcess(); await settleEvents();
  child.stdout.end(); child.stderr.end(); child.emit("exit", 0, null); child.emit("close", 0, null); await settleEvents();
  await observer.finishAndDrain(); await completeSuccessfulTraceFromCritic(store); await store.finalize({ outcome: "completed", cause: "unbestimmt" });
  const trace = await readFile(tracePath, "utf8"); assert.equal(trace.includes("proc-private-detail"), false);
  const sample = trace.trimEnd().split("\n").map(JSON.parse).find((record) => record.event === "process.sample");
  assert.deepEqual(sample.payload, { availability: "unavailable", category: "not-found" });
}));

await check("lease policy separates fixed preflight and final-Critic bounds", () => {
  assert.equal(CODEX_CRITIC_POLICY.preflightLeaseMs, 120_000);
  assert.equal(CODEX_CRITIC_POLICY.criticLeaseMs, 300_000);
  assert.equal(Object.hasOwn(CODEX_CRITIC_POLICY, "leaseMs"), false);
});

await check("profile is root-deny, read-scoped, network-off and contains no write grant", () => {
  const profile = fixtureProfile();
  assert.equal(profile.normalized.filesystem[0].path, ":root");
  assert.equal(profile.normalized.filesystem[0].access, "deny");
  assert.equal(profile.normalized.network.enabled, false);
  assert.equal(profile.normalized.filesystem.some((entry) => entry.access === "write"), false);
  assert.match(profile.hash, /^[0-9a-f]{64}$/u);
  assert.ok(profile.config.some((entry) => entry.includes('":root"="deny"')));
  assert.ok(profile.config.includes("permissions.pipeline-critic.network.enabled=false"));
});

await check("profile rejects roots, overlapping runtime and invalid identifiers", () => {
  assert.throws(() => buildPermissionProfile({ fixtureRoot: "/", runtimeRoot: "/opt/runtime" }));
  assert.throws(() => buildPermissionProfile({ fixtureRoot: "/tmp", runtimeRoot: "/opt/codex/releases/0.144.4-test" }));
  assert.throws(() => buildPermissionProfile({ fixtureRoot: "/tmp/a", runtimeRoot: "/usr" }));
  assert.throws(() => buildPermissionProfile({ fixtureRoot: "/tmp/same", runtimeRoot: "/tmp/same" }));
  assert.throws(() => buildPermissionProfile({ fixtureRoot: "/tmp/a", runtimeRoot: "/tmp/a/runtime" }));
  assert.throws(() => buildPermissionProfile({ fixtureRoot: os.homedir(), runtimeRoot: "/opt/codex/releases/0.144.4-test" }));
  assert.throws(() => buildPermissionProfile({ fixtureRoot: "/tmp/a", runtimeRoot: "/tmp/b", profileId: "BAD" }));
});

await check("profile validation rejects root-deny, private-read, write, network and hash drift", () => {
  const valid = fixtureProfile();
  const invoke = (profile) => buildProfileBoundCodexCriticInvocation({ fixtureRoot: "/tmp/profile-fixture", schemaPath: "/tmp/schema.json", resultPath: "/tmp/result.json", permissionProfile: profile, codexBinary: "/opt/codex/bin/codex", env: { PATH: "/bin" } });
  const clone = () => structuredClone(valid);
  const missingRoot = clone(); missingRoot.normalized.filesystem.shift(); assert.throws(() => invoke(missingRoot), /root deny/u);
  const privateRead = clone(); privateRead.normalized.filesystem.push({ path: "/home/private/state", access: "read" }); assert.throws(() => invoke(privateRead), /extra/u);
  const write = clone(); write.normalized.filesystem[2].access = "write"; assert.throws(() => invoke(write), /writable/u);
  const network = clone(); network.normalized.network.enabled = true; assert.throws(() => invoke(network), /network/u);
  const hashDrift = clone(); hashDrift.hash = "f".repeat(64); assert.throws(() => invoke(hashDrift), /drifted/u);
});

await check("profile-bound invocation fixes Sol/max and forbids legacy sandbox", () => {
  const invocation = buildProfileBoundCodexCriticInvocation({ fixtureRoot: "/tmp/profile-fixture", schemaPath: "/tmp/schema.json", resultPath: "/tmp/result.json", permissionProfile: fixtureProfile(), codexBinary: "/opt/codex/bin/codex", env: { PATH: "/bin", HOME: "/home/test", GITHUB_TOKEN: "no" } });
  for (const required of ["--ignore-user-config", "--ignore-rules", "--strict-config", "--ephemeral", "--json", "--output-schema", "--output-last-message"]) assert.ok(invocation.args.includes(required));
  assert.equal(invocation.args.includes("--sandbox"), false);
  assert.ok(invocation.args.includes('model_reasoning_effort="max"'));
  assert.ok(invocation.args.includes('approval_policy="never"'));
  assert.ok(invocation.args.includes('web_search="disabled"'));
  assert.ok(invocation.args.includes('shell_environment_policy.inherit="none"'));
  assert.deepEqual(invocation.options.env, { PATH: "/bin", HOME: "/home/test" });
});

await check("historical invocation remains isolated from the new acceptance builder", () => {
  const legacy = buildCodexCriticInvocation({ fixtureRoot: "/tmp/f", schemaPath: "/tmp/s", resultPath: "/tmp/r", env: { PATH: "/bin" } });
  assert.ok(legacy.args.includes("--sandbox"));
  assert.throws(() => buildProfileBoundCodexCriticInvocation({ fixtureRoot: "/tmp/f", schemaPath: "/tmp/s", resultPath: "/tmp/r", permissionProfile: null, codexBinary: "/tmp/codex", env: { PATH: "/bin" } }));
});

await check("environment allowlist removes credentials, proxies and arbitrary variables", () => {
  assert.deepEqual(sanitizeEnvironment({ PATH: "/bin", HOME: "/home/test", LANG: "C", CI: "true", GH_TOKEN: "x", HTTPS_PROXY: "x", CUSTOM: "x" }), { PATH: "/bin", HOME: "/home/test", LANG: "C" });
});

await check("binary inspection requires the pinned standalone release layout", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "profile-binary-test-"));
  try {
    const binary = path.join(temp, "releases", "0.144.4-test", "bin", "codex");
    await mkdir(path.dirname(binary), { recursive: true }); await writeFile(binary, "binary"); await chmod(binary, 0o700);
    const info = await inspectCodexBinary({ codexBinary: binary, execFileSync: () => `${CODEX_CRITIC_POLICY.requiredVersion}\n` });
    assert.match(info.binarySha256, /^[0-9a-f]{64}$/u); assert.equal(info.runtimeRoot, path.dirname(path.dirname(binary)));
    const loose = path.join(temp, "codex"); await writeFile(loose, "binary"); await chmod(loose, 0o700);
    await assert.rejects(() => inspectCodexBinary({ codexBinary: loose, execFileSync: () => `${CODEX_CRITIC_POLICY.requiredVersion}\n` }), /standalone layout/u);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

await check("profile contract requires named profiles and tool-free exec controls", () => {
  const fake = (_binary, args) => args[0] === "sandbox"
    ? "Run commands within a Codex-provided sandbox\n-P, --permission-profile <NAME>\n"
    : "--ignore-user-config --ignore-rules --strict-config --ephemeral --json --output-schema --output-last-message";
  assert.match(verifyProfileContract({ codexBinary: "/tmp/codex", execFileSync: fake }).contractSha256, /^[0-9a-f]{64}$/u);
  assert.throws(() => verifyProfileContract({ codexBinary: "/tmp/codex", execFileSync: () => "missing" }));
});

await check("exact fixture and review bundle carry full committed UTF-8 content", async () => {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const fixture = await buildExactFixture({ repoRoot: root, candidateCommit: head, artifactPaths: ["plugins/pipeline-core/scripts/critic-verdict.schema.json"] });
  try {
    const bundle = await buildReviewBundle(fixture);
    assert.equal(bundle.value.artifacts.length, 1);
    assert.match(bundle.value.artifacts[0].content, /Critic verdict/u);
    assert.equal(bundle.value.artifacts[0].content.length > 0, true);
    assert.match(bundle.hash, /^[0-9a-f]{64}$/u);
    assert.throws(() => criticPrompt({ bundle: { hash: bundle.hash }, taskId: "task", nonce: fixture.manifest.nonce, candidateCommit: head, candidateTree: fixture.manifest.tree, candidateParent: fixture.manifest.parent, candidateParentTree: fixture.manifest.parentTree }));
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
});

await check("fixture rejects traversal and duplicate artifact inputs before acceptance", async () => {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  await assert.rejects(() => buildExactFixture({ repoRoot: root, candidateCommit: head, artifactPaths: ["../private"] }), /normalized relative/u);
  await assert.rejects(() => buildExactFixture({ repoRoot: root, candidateCommit: head, artifactPaths: ["harness/scripts/verify.mjs", "harness/scripts/verify.mjs"] }), /unique/u);
});

function childProcess(exitCode, afterSpawn = async () => {}) {
  const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.pid = null; child.kill = () => true;
  queueMicrotask(async () => { await afterSpawn(child); child.stdout.end(); child.stderr.end(); child.emit("close", exitCode, null); });
  return child;
}

await check("direct profile preflight accepts read-allow/read-deny/write-deny and unchanged canaries", async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "profile-preflight-fixture-"));
  const runtime = await mkdtemp(path.join(os.tmpdir(), "profile-preflight-runtime-"));
  const external = await mkdtemp(path.join(os.tmpdir(), "profile-preflight-parent-"));
  try {
    const profile = buildPermissionProfile({ fixtureRoot: fixture, runtimeRoot: runtime });
    const result = await runPermissionProfilePreflight({ codexBinary: "/tmp/codex", permissionProfile: profile, fixtureRoot: fixture, externalParent: external, env: { PATH: "/bin", HOME: "/home/test" }, spawn(_command, args, options) {
      assert.equal(options.env.CODEX_HOME.startsWith(os.tmpdir()), true);
      assert.ok(args.includes("-P")); assert.equal(args.includes("--sandbox"), false);
      const script = args[args.indexOf("--") + 3];
      return childProcess(script.includes("printf") || args.at(-1).includes("external-read-sentinel") ? 2 : 0);
    } });
    assert.equal(result.ok, true); assert.deepEqual(result.canaries, { fixtureUnchanged: true, externalUnchanged: true, writeTargetAbsent: true });
    assert.equal(JSON.stringify(result).includes(external), false);
  } finally { await rm(fixture, { recursive: true, force: true }); await rm(runtime, { recursive: true, force: true }); await rm(external, { recursive: true, force: true }); }
});

await check("preflight fails closed on a successful forbidden write outcome", async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "profile-preflight-red-")); const runtime = await mkdtemp(path.join(os.tmpdir(), "profile-runtime-red-")); const external = await mkdtemp(path.join(os.tmpdir(), "profile-external-red-"));
  try {
    const result = await runPermissionProfilePreflight({ codexBinary: "/tmp/codex", permissionProfile: buildPermissionProfile({ fixtureRoot: fixture, runtimeRoot: runtime }), fixtureRoot: fixture, externalParent: external, env: { PATH: "/bin" }, spawn: (_command, args) => childProcess(args.at(-1).includes("external-read-sentinel") ? 2 : 0) });
    assert.equal(result.ok, false); assert.equal(result.category, "profile-preflight-failed");
  } finally { await rm(fixture, { recursive: true, force: true }); await rm(runtime, { recursive: true, force: true }); await rm(external, { recursive: true, force: true }); }
});

await check("JSONL parser enforces order, cardinality and no tool/post-terminal events", () => {
  const clean = [
    { type: "thread.started" }, { type: "turn.started" }, { type: "item.started", item: { type: "reasoning" } },
    { type: "item.completed", item: { type: "agent_message", text: "{}" } }, { type: "turn.completed" },
  ].map(JSON.stringify).join("\n");
  assert.equal(inspectToolFreeJsonl(clean).ok, true);
  assert.equal(inspectToolFreeJsonl(`${clean}\n${JSON.stringify({ type: "item.started", item: { type: "command_execution" } })}`).ok, false);
  assert.equal(inspectToolFreeJsonl(`${JSON.stringify({ type: "turn.started" })}\n${clean}`).ok, false);
  assert.equal(inspectToolFreeJsonl(clean.replace(JSON.stringify({ type: "turn.completed" }), "not-json")).ok, false);
  for (const type of ["command_execution", "file_change", "mcp_tool_call", "web_search", "app_call", "browser_action", "plan", "unknown"]) {
    const injected = clean.replace(JSON.stringify({ type: "turn.completed" }), `${JSON.stringify({ type: "item.started", item: { type } })}\n${JSON.stringify({ type: "turn.completed" })}`);
    assert.equal(inspectToolFreeJsonl(injected).ok, false, type);
  }
  assert.equal(inspectToolFreeJsonl(clean.replace(JSON.stringify({ type: "turn.completed" }), `${JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "{}" } })}\n${JSON.stringify({ type: "turn.completed" })}`)).ok, false);
});

function criticSpawn({ toolEvent = false, badBinding = false, badVerdict = false, schemaInvalid = false, missingResult = false, oversizedResult = false, differentMessage = false, oversizedStream = false, oversizedStderr = false, exitCode = 0, capturePrompt = null } = {}) {
  return (_command, args) => {
    const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.pid = null; child.kill = () => true;
    const chunks = []; child.stdin.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    child.stdin.on("finish", async () => {
      const prompt = Buffer.concat(chunks).toString("utf8"); if (capturePrompt) capturePrompt(prompt);
      const value = (key) => new RegExp(`^${key}=(.+)$`, "mu").exec(prompt)?.[1];
      const output = args[args.indexOf("--output-last-message") + 1];
      const wrapper = {
        task_id: badBinding ? "wrong" : value("TASK_ID"), nonce: value("NONCE"), candidate_commit: value("CANDIDATE_COMMIT"), candidate_tree: value("CANDIDATE_TREE"), candidate_parent: value("CANDIDATE_PARENT"), candidate_parent_tree: value("CANDIDATE_PARENT_TREE"), bundle_sha256: value("REVIEW_BUNDLE_SHA256"), review_contract_sha256: value("REVIEW_CONTRACT_SHA256"),
        verdict: badVerdict ? { ...verdict, pass: false } : verdict,
      };
      if (schemaInvalid) delete wrapper.nonce;
      if (!missingResult) await writeFile(output, oversizedResult ? "x".repeat(70 * 1024) : JSON.stringify(wrapper));
      const events = [{ type: "thread.started" }, { type: "turn.started" }, { type: "item.started", item: { type: "reasoning" } }];
      if (toolEvent) events.push({ type: "item.started", item: { type: "command_execution" } });
      events.push({ type: "item.completed", item: { type: "agent_message", text: differentMessage ? "{}" : JSON.stringify(wrapper) } }, { type: "turn.completed" });
      child.stdout.write(oversizedStream ? "x".repeat(300 * 1024) : `${events.map(JSON.stringify).join("\n")}\n`); if (oversizedStderr) child.stderr.write("x".repeat(300 * 1024)); child.stdout.end(); child.stderr.end(); child.emit("close", exitCode, null);
    });
    return child;
  };
}

await check("tool-less critic receives full content and accepts only bound clean verdict", async () => {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const fixture = await buildExactFixture({ repoRoot: root, candidateCommit: head, artifactPaths: ["plugins/pipeline-core/scripts/critic-verdict.schema.json"] });
  const runtime = await mkdtemp(path.join(os.tmpdir(), "profile-critic-runtime-"));
  try {
    const bundle = await buildReviewBundle(fixture); let prompt = "";
    const result = await runCodexCritic({ fixture, reviewBundle: bundle, permissionProfile: buildPermissionProfile({ fixtureRoot: fixture.root, runtimeRoot: runtime }), codexBinary: "/tmp/codex", schemaPath: path.join(fixture.root, "plugins/pipeline-core/scripts/critic-verdict.schema.json"), env: { PATH: "/bin" }, spawn: criticSpawn({ capturePrompt: (value) => { prompt = value; } }) });
    assert.equal(result.ok, true); assert.equal(result.stream.toolFree, true); assert.match(prompt, /Critic verdict/u); assert.match(prompt, /REVIEW_BUNDLE_SHA256=/u);
  } finally { await rm(fixture.root, { recursive: true, force: true }); await rm(runtime, { recursive: true, force: true }); }
});

await check("tool events, replay binding and unclean verdict each fail closed", async () => {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const fixture = await buildExactFixture({ repoRoot: root, candidateCommit: head, artifactPaths: ["plugins/pipeline-core/scripts/critic-verdict.schema.json"] }); const runtime = await mkdtemp(path.join(os.tmpdir(), "profile-critic-red-"));
  try {
    const bundle = await buildReviewBundle(fixture); const profile = buildPermissionProfile({ fixtureRoot: fixture.root, runtimeRoot: runtime }); const schemaPath = path.join(fixture.root, "plugins/pipeline-core/scripts/critic-verdict.schema.json");
    for (const options of [{ toolEvent: true }, { badBinding: true }, { badVerdict: true }, { schemaInvalid: true }, { missingResult: true }, { oversizedResult: true }, { differentMessage: true }, { oversizedStream: true }, { oversizedStderr: true }, { exitCode: 2 }]) {
      const result = await runCodexCritic({ fixture, reviewBundle: bundle, permissionProfile: profile, codexBinary: "/tmp/codex", schemaPath, env: { PATH: "/bin" }, spawn: criticSpawn(options) });
      assert.equal(result.ok, false);
    }
  } finally { await rm(fixture.root, { recursive: true, force: true }); await rm(runtime, { recursive: true, force: true }); }
});

await check("critic timeout terminates its owned process group and fails closed", async () => {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const fixture = await buildExactFixture({ repoRoot: root, candidateCommit: head, artifactPaths: ["plugins/pipeline-core/scripts/critic-verdict.schema.json"] });
  const runtime = await mkdtemp(path.join(os.tmpdir(), "profile-timeout-runtime-"));
  try {
    const bundle = await buildReviewBundle(fixture);
    const result = await runCodexCritic({ fixture, reviewBundle: bundle, permissionProfile: buildPermissionProfile({ fixtureRoot: fixture.root, runtimeRoot: runtime }), codexBinary: "/tmp/codex", schemaPath: path.join(fixture.root, "plugins/pipeline-core/scripts/critic-verdict.schema.json"), leaseMs: 20, env: { PATH: "/bin" }, spawn: (_command, _args, options) => spawnProcess("/bin/sh", ["-c", "sleep 5"], options) });
    assert.equal(result.ok, false); assert.equal(result.category, "lease-timeout"); assert.equal(result.process.timedOut, true); assert.equal(result.process.ownedProcessGroupGone, true);
  } finally { await rm(fixture.root, { recursive: true, force: true }); await rm(runtime, { recursive: true, force: true }); }
});

await check("debug critic timeout is classified response-stalled only after durable lease evidence", async () => {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const fixture = await buildExactFixture({ repoRoot: root, candidateCommit: head, artifactPaths: ["plugins/pipeline-core/scripts/critic-verdict.schema.json"] });
  const runtime = await mkdtemp(path.join(os.tmpdir(), "profile-debug-timeout-runtime-")); const traceDirectory = await mkdtemp(path.join(os.tmpdir(), "profile-debug-timeout-trace-")); const tracePath = path.join(traceDirectory, "trace.jsonl");
  try {
    const store = await createSecureTraceStore({ tracePath, repoRoot: root, fixtureRoot: fixture.root, privateRoots: [root, fixture.root, runtime] }); await beginTraceStep(store, "critic");
    const bundle = await buildReviewBundle(fixture); let childPid = null; const started = Date.now();
    const result = await runCodexCritic({ fixture, reviewBundle: bundle, permissionProfile: buildPermissionProfile({ fixtureRoot: fixture.root, runtimeRoot: runtime }), codexBinary: "/tmp/codex", schemaPath: path.join(fixture.root, "plugins/pipeline-core/scripts/critic-verdict.schema.json"), leaseMs: 20, env: { PATH: "/bin" }, spawn: (_command, _args, options) => {
      const child = spawnProcess(process.execPath, ["-e", 'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'], options); childPid = child.pid; return child;
    }, debugContext: { traceStore: store, privateRoots: [root, fixture.root, runtime] } });
    assert.equal(result.ok, false); assert.equal(result.category, "lease-timeout"); assert.equal(result.process.timedOut, true); assert.equal(result.process.ownedProcessGroupGone, true);
    assert.equal(Date.now() - started < 4_000, true); assert.throws(() => process.kill(childPid, 0));
    await store.append("step.failed", { step: "critic" }); await store.append("run.failed", { cause: "response-stalled" }); await store.finalize({ outcome: "failed", cause: "response-stalled" });
    const records = (await readFile(tracePath, "utf8")).trimEnd().split("\n").map(JSON.parse);
    assert.equal(records.some(({ event, payload }) => event === "lease.expired" && payload.label === "critic"), true);
    assert.deepEqual(records.filter(({ event }) => event === "child.signal-requested").map(({ payload }) => payload.signal), ["SIGTERM", "SIGKILL"]);
    assert.deepEqual(records.filter(({ event }) => event === "child.signal-result").map(({ payload }) => payload.signal), ["SIGTERM", "SIGKILL"]);
    assert.deepEqual(records.find(({ event }) => event === "run.failed").payload, { cause: "response-stalled" });
  } finally { await rm(fixture.root, { recursive: true, force: true }); await rm(runtime, { recursive: true, force: true }); await rm(traceDirectory, { recursive: true, force: true }); }
});

await check("debug hard lease force-settles a child that never closes without inventing close evidence", async () => {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const fixture = await buildExactFixture({ repoRoot: root, candidateCommit: head, artifactPaths: ["plugins/pipeline-core/scripts/critic-verdict.schema.json"] });
  const runtime = await mkdtemp(path.join(os.tmpdir(), "profile-debug-forced-runtime-")); const traceDirectory = await mkdtemp(path.join(os.tmpdir(), "profile-debug-forced-trace-")); const tracePath = path.join(traceDirectory, "trace.jsonl");
  try {
    const store = await createSecureTraceStore({ tracePath, repoRoot: root, fixtureRoot: fixture.root }); await beginTraceStep(store, "critic");
    const bundle = await buildReviewBundle(fixture); const started = Date.now();
    const result = await runCodexCritic({ fixture, reviewBundle: bundle, permissionProfile: buildPermissionProfile({ fixtureRoot: fixture.root, runtimeRoot: runtime }), codexBinary: "/tmp/codex", schemaPath: path.join(fixture.root, "plugins/pipeline-core/scripts/critic-verdict.schema.json"), leaseMs: 20, env: { PATH: "/bin" }, spawn: () => {
      const child = new EventEmitter(); child.pid = 987_654_321; child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => true; return child;
    }, debugContext: { traceStore: store, privateRoots: [root, fixture.root, runtime] } });
    assert.equal(result.ok, false); assert.equal(result.category, "lease-timeout"); assert.equal(result.process.timedOut, true); assert.equal(result.process.ownedProcessGroupGone, true);
    assert.equal(Date.now() - started >= 1_900 && Date.now() - started < 4_000, true);
    await store.append("step.failed", { step: "critic" }); await store.append("run.failed", { cause: "response-stalled" }); await store.finalize({ outcome: "failed", cause: "response-stalled" });
    const records = (await readFile(tracePath, "utf8")).trimEnd().split("\n").map(JSON.parse);
    assert.equal(records.some(({ event, payload }) => event === "child.close" && payload.label === "critic"), false);
    assert.deepEqual(records.find(({ event }) => event === "child.force-settled").payload, { label: "critic", category: "close-unobserved" });
    assert.deepEqual(records.filter(({ event }) => event === "child.signal-requested").map(({ payload }) => payload.signal), ["SIGTERM", "SIGKILL"]);
    assert.equal(records.at(-1).payload.outcome, "failed");
  } finally { await rm(fixture.root, { recursive: true, force: true }); await rm(runtime, { recursive: true, force: true }); await rm(traceDirectory, { recursive: true, force: true }); }
});

await check("residual owned process group is detected when TERM and KILL cannot clean it", async () => {
  const signals = [];
  const gone = await ensureOwnedProcessGroupGone(424242, (_pid, signal) => { signals.push(signal); });
  assert.equal(gone, false); assert.deepEqual(signals, [0, "SIGTERM", 0, "SIGKILL", 0]);
});

await check("synchronous spawn failure, asynchronous process error and signal fail closed", async () => {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const fixture = await buildExactFixture({ repoRoot: root, candidateCommit: head, artifactPaths: ["plugins/pipeline-core/scripts/critic-verdict.schema.json"] });
  const runtime = await mkdtemp(path.join(os.tmpdir(), "profile-process-fail-runtime-"));
  try {
    const reviewBundle = await buildReviewBundle(fixture); const permissionProfile = buildPermissionProfile({ fixtureRoot: fixture.root, runtimeRoot: runtime }); const schemaPath = path.join(fixture.root, "plugins/pipeline-core/scripts/critic-verdict.schema.json");
    const common = { fixture, reviewBundle, permissionProfile, codexBinary: "/tmp/codex", schemaPath, leaseMs: 50, env: { PATH: "/bin" } };
    const sync = await runCodexCritic({ ...common, spawn: () => { throw new Error("synthetic private spawn detail"); } });
    assert.equal(sync.ok, false); assert.equal(sync.category, "spawn-failed"); assert.equal(JSON.stringify(sync).includes("synthetic private"), false);
    const asynchronous = await runCodexCritic({ ...common, spawn: () => {
      const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.pid = null; child.kill = () => true;
      queueMicrotask(() => child.emit("error", new Error("synthetic private async detail"))); return child;
    } });
    assert.equal(asynchronous.ok, false); assert.equal(asynchronous.process.error, "process-error"); assert.equal(JSON.stringify(asynchronous).includes("synthetic private"), false);
    const signaled = await runCodexCritic({ ...common, spawn: () => {
      const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.pid = null; child.kill = () => true;
      queueMicrotask(() => { child.stdout.end(); child.stderr.end(); child.emit("close", null, "SIGTERM"); }); return child;
    } });
    assert.equal(signaled.ok, false); assert.equal(signaled.process.signal, "SIGTERM");
  } finally { await rm(fixture.root, { recursive: true, force: true }); await rm(runtime, { recursive: true, force: true }); }
});

async function syntheticRepo() {
  const repo = await mkdtemp(path.join(os.tmpdir(), "profile-aggregate-repo-"));
  execFileSync("git", ["init", "-q"], { cwd: repo }); execFileSync("git", ["config", "user.name", "Fixture"], { cwd: repo }); execFileSync("git", ["config", "user.email", "fixture@example.invalid"], { cwd: repo });
  await writeFile(path.join(repo, "seed.txt"), "parent\n"); execFileSync("git", ["add", "--", "seed.txt"], { cwd: repo }); execFileSync("git", ["commit", "-qm", "parent"], { cwd: repo });
  for (const file of CODEX_CRITIC_ARTIFACTS) {
    const destination = path.join(repo, file); await mkdir(path.dirname(destination), { recursive: true });
    const bytes = file.endsWith("critic-verdict.schema.json") ? await readFile(path.join(root, file)) : Buffer.from(`public fixture ${file}\n`);
    await writeFile(destination, bytes);
  }
  execFileSync("git", ["add", "--", ...CODEX_CRITIC_ARTIFACTS], { cwd: repo }); execFileSync("git", ["commit", "-qm", "fixture"], { cwd: repo });
  return { repo, head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim() };
}

async function commitPath(repo, file, bytes, message) {
  await writeFile(path.join(repo, file), bytes);
  execFileSync("git", ["add", "--", file], { cwd: repo }); execFileSync("git", ["commit", "-qm", message], { cwd: repo });
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
}

await check("fixture fails closed on missing, symlink, invalid UTF-8 and oversized artifacts", async () => {
  const missing = await syntheticRepo();
  try { await assert.rejects(() => buildExactFixture({ repoRoot: missing.repo, candidateCommit: missing.head, artifactPaths: ["missing-public-artifact.txt"] }), /missing/u); }
  finally { await rm(missing.repo, { recursive: true, force: true }); }

  const linked = await syntheticRepo();
  try {
    const file = CODEX_CRITIC_ARTIFACTS[0]; await rm(path.join(linked.repo, file)); await symlink("neutral-synthetic-target", path.join(linked.repo, file));
    execFileSync("git", ["add", "--", file], { cwd: linked.repo }); execFileSync("git", ["commit", "-qm", "symlink"], { cwd: linked.repo });
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: linked.repo, encoding: "utf8" }).trim();
    await assert.rejects(() => buildExactFixture({ repoRoot: linked.repo, candidateCommit: head, artifactPaths: [file] }), /symlinked/u);
  } finally { await rm(linked.repo, { recursive: true, force: true }); }

  const invalid = await syntheticRepo();
  try {
    const file = CODEX_CRITIC_ARTIFACTS[4]; const head = await commitPath(invalid.repo, file, Buffer.from([0xc3, 0x28]), "invalid utf8");
    const fixture = await buildExactFixture({ repoRoot: invalid.repo, candidateCommit: head, artifactPaths: [file] });
    try { await assert.rejects(() => buildReviewBundle(fixture), /UTF-8/u); } finally { await rm(fixture.root, { recursive: true, force: true }); }
  } finally { await rm(invalid.repo, { recursive: true, force: true }); }

  const oversized = await syntheticRepo();
  try {
    const file = CODEX_CRITIC_ARTIFACTS[4]; const head = await commitPath(oversized.repo, file, Buffer.alloc(512 * 1024 + 1, 0x61), "oversized");
    await assert.rejects(() => buildExactFixture({ repoRoot: oversized.repo, candidateCommit: head, artifactPaths: [file] }), /exceeds/u);
  } finally { await rm(oversized.repo, { recursive: true, force: true }); }
});

await check("bundle fails closed on total oversize, content drift and extra fixture files", async () => {
  const total = await syntheticRepo();
  try {
    for (const file of CODEX_CRITIC_ARTIFACTS) await writeFile(path.join(total.repo, file), Buffer.alloc(430 * 1024, 0x61));
    execFileSync("git", ["add", "--", ...CODEX_CRITIC_ARTIFACTS], { cwd: total.repo }); execFileSync("git", ["commit", "-qm", "total oversize"], { cwd: total.repo });
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: total.repo, encoding: "utf8" }).trim();
    const fixture = await buildExactFixture({ repoRoot: total.repo, candidateCommit: head, artifactPaths: CODEX_CRITIC_ARTIFACTS });
    try { await assert.rejects(() => buildReviewBundle(fixture), /bundle exceeds/u); } finally { await rm(fixture.root, { recursive: true, force: true }); }
  } finally { await rm(total.repo, { recursive: true, force: true }); }

  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const drifted = await buildExactFixture({ repoRoot: root, candidateCommit: head, artifactPaths: ["plugins/pipeline-core/scripts/critic-verdict.schema.json"] });
  try {
    await writeFile(path.join(drifted.root, "plugins/pipeline-core/scripts/critic-verdict.schema.json"), "drift\n");
    await assert.rejects(() => buildReviewBundle(drifted), /drifted/u);
  } finally { await rm(drifted.root, { recursive: true, force: true }); }

  const extra = await buildExactFixture({ repoRoot: root, candidateCommit: head, artifactPaths: ["plugins/pipeline-core/scripts/critic-verdict.schema.json"] });
  const runtime = await mkdtemp(path.join(os.tmpdir(), "profile-extra-runtime-"));
  try {
    const bundle = await buildReviewBundle(extra); await writeFile(path.join(extra.root, "unexpected-public-extra.txt"), "extra\n");
    await assert.rejects(() => runCodexCritic({ fixture: extra, reviewBundle: bundle, permissionProfile: buildPermissionProfile({ fixtureRoot: extra.root, runtimeRoot: runtime }), codexBinary: "/tmp/codex", schemaPath: path.join(extra.root, "plugins/pipeline-core/scripts/critic-verdict.schema.json"), env: { PATH: "/bin" }, spawn: criticSpawn() }), /extra files/u);
  } finally { await rm(extra.root, { recursive: true, force: true }); await rm(runtime, { recursive: true, force: true }); }
});

function aggregateSpawn(observedEnvironments = []) {
  return (_command, args, options) => {
    observedEnvironments.push(options.env);
    if (args[0] === "sandbox") { const script = args[args.indexOf("--") + 3]; return childProcess(script.includes("printf") || args.at(-1).includes("external-read-sentinel") ? 2 : 0); }
    return criticSpawn()(_command, args, options);
  };
}

function debugAggregateSpawn(criticOptions = {}, observedEnvironments = []) {
  const base = aggregateSpawn(); let pid = 52_000;
  return (command, args, options) => {
    observedEnvironments.push(options.env);
    const child = args[0] === "sandbox" ? base(command, args, options) : criticSpawn(criticOptions)(command, args, options);
    if (args[0] === "sandbox") { assert.equal(options.stdio[0], "ignore"); child.stdin = null; }
    child.pid = pid; pid += 1;
    const emit = child.emit;
    child.emit = function debugLifecycle(event, ...values) {
      if (event === "close") emit.call(this, "exit", ...values);
      return emit.call(this, event, ...values);
    };
    return child;
  };
}

function debugAggregateWithCritic(criticFactory) {
  const probes = debugAggregateSpawn();
  return (command, args, options) => args[0] === "sandbox" ? probes(command, args, options) : criticFactory(command, args, options);
}

function emptyDebugCritic(_command, _args, _options) {
  const child = new EventEmitter(); child.pid = 61_001; child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => true;
  child.stdin.on("finish", () => queueMicrotask(() => { child.stdout.end(); child.stderr.end(); child.emit("exit", 0, null); child.emit("close", 0, null); }));
  return child;
}

await check("aggregate binds exact HEAD/five artifacts and emits path-free public evidence", async () => {
  const { repo, head } = await syntheticRepo(); const runtime = await mkdtemp(path.join(os.tmpdir(), "profile-aggregate-runtime-")); const normalEnvironments = [];
  try {
    const binaryInspection = { binarySha256: "a".repeat(64), versionSha256: "b".repeat(64), runtimeRoot: runtime, runtimeRootSha256: "c".repeat(64), runtimeManifestSha256: "e".repeat(64), runtimeEntries: 1 };
    const result = await runProfileBoundIsolation({ repoRoot: repo, candidateCommit: head, artifactPaths: CODEX_CRITIC_ARTIFACTS, externalParent: path.dirname(repo), resolvedBinary: "/tmp/codex", binaryInspection, inspectBinary: async () => binaryInspection, contractInspection: { contractSha256: "d".repeat(64) }, env: { PATH: "/bin", GITHUB_TOKEN: "private-token-canary", RUST_LOG: "private-user-filter" }, spawn: aggregateSpawn(normalEnvironments) });
    assert.equal(result.ok, true); assert.equal(result.envelope.preflight.ok, true); assert.equal(result.envelope.critic.ok, true);
    assert.equal(result.envelope.preflightLeaseMs, 120_000); assert.equal(result.envelope.criticLeaseMs, 300_000);
    assert.equal(normalEnvironments.length, 4); assert.equal(normalEnvironments.every((value) => value.RUST_LOG === undefined), true);
    const publicEnvelope = JSON.stringify(result.envelope);
    assert.equal(publicEnvelope.includes(repo), false); assert.equal(publicEnvelope.includes(runtime), false); assert.equal(publicEnvelope.includes("private-token-canary"), false);
    for (const forbidden of ["stdoutTail", "stderrTail", "localDiagnostics", "REVIEW_BUNDLE_SHA256=", "agent_message"]) assert.equal(publicEnvelope.includes(forbidden), false, forbidden);
    await assert.rejects(() => runProfileBoundIsolation({ repoRoot: repo, candidateCommit: "f".repeat(40), artifactPaths: CODEX_CRITIC_ARTIFACTS }), /current Shared HEAD/u);
  } finally { await rm(repo, { recursive: true, force: true }); await rm(runtime, { recursive: true, force: true }); }
});

await check("debug aggregate records the exact productive lifecycle without changing public evidence shape", async () => {
  const { repo, head } = await syntheticRepo(); const runtime = await mkdtemp(path.join(os.tmpdir(), "profile-debug-runtime-")); const debugDirectory = await mkdtemp(path.join(os.tmpdir(), "profile-debug-trace-"));
  const tracePath = path.join(debugDirectory, "trace.jsonl"); const progress = []; const summaries = []; const environments = [];
  try {
    const binaryInspection = { binarySha256: "1".repeat(64), versionSha256: "2".repeat(64), runtimeRoot: runtime, runtimeRootSha256: "3".repeat(64), runtimeManifestSha256: "4".repeat(64), runtimeEntries: 1 };
    const result = await runProfileBoundIsolation({ repoRoot: repo, candidateCommit: head, artifactPaths: CODEX_CRITIC_ARTIFACTS, externalParent: path.dirname(repo), resolvedBinary: "/tmp/codex", binaryInspection, inspectBinary: async () => binaryInspection, contractInspection: { contractSha256: "5".repeat(64) }, env: { PATH: "/bin", GITHUB_TOKEN: "debug-private-token" }, spawn: debugAggregateSpawn({}, environments), debugContext: { tracePath, forbiddenRoots: [repo], onProgress: (value) => progress.push(value), onSummary: (value) => summaries.push(value) } });
    assert.equal(result.ok, true); assert.equal(Object.hasOwn(result, "debugContext"), false); assert.equal(Object.hasOwn(result.envelope.critic, "debugTimedOut"), false);
    assert.deepEqual(progress.map(({ step, status }) => [step, status]), CODEX_CRITIC_TRACE_STEPS.map((step) => [step, "completed"]));
    assert.deepEqual(summaries.map(({ outcome, cause }) => [outcome, cause]), [["completed", "unbestimmt"]]);
    assert.equal(environments.length, 4); assert.equal(environments.every((value) => value.RUST_LOG === "codex_core=info,codex_exec=info" && value.GITHUB_TOKEN === undefined), true);
    const trace = await readFile(tracePath, "utf8"); const records = trace.trimEnd().split("\n").map(JSON.parse);
    assert.deepEqual(records.filter(({ event }) => event === "step.completed").map(({ payload }) => payload.step), CODEX_CRITIC_TRACE_STEPS);
    assert.deepEqual(records.filter(({ event }) => event === "child.spawned").map(({ payload }) => payload.label), ["profile-preflight-fixture-read", "profile-preflight-external-read-denied", "profile-preflight-write-denied", "critic"]);
    assert.deepEqual(records.filter(({ event }) => event === "lease.armed").map(({ payload }) => payload.label), ["profile-preflight-fixture-read", "profile-preflight-external-read-denied", "profile-preflight-write-denied", "critic"]);
    assert.deepEqual(records.filter(({ event }) => event.startsWith("stdin.")).map(({ event }) => event), ["stdin.write-requested", "stdin.write-accepted", "stdin.end-requested", "stdin.closed"]);
    const observed = records.find(({ event }) => event === "result.observed")?.payload; assert.equal(observed.present, true); assert.match(observed.sha256, /^[0-9a-f]{64}$/u);
    for (const forbidden of [repo, runtime, "debug-private-token", "REVIEW_BUNDLE_SHA256=", "trajectory_evidence", "synthetic adapter result"]) assert.equal(trace.includes(forbidden), false, forbidden);
  } finally { await rm(repo, { recursive: true, force: true }); await rm(runtime, { recursive: true, force: true }); await rm(debugDirectory, { recursive: true, force: true }); }
});

await check("debug aggregate attributes missing result only from observed result evidence", async () => {
  const { repo, head } = await syntheticRepo(); const runtime = await mkdtemp(path.join(os.tmpdir(), "profile-debug-result-runtime-")); const debugDirectory = await mkdtemp(path.join(os.tmpdir(), "profile-debug-result-trace-")); const tracePath = path.join(debugDirectory, "trace.jsonl");
  try {
    const binaryInspection = { binarySha256: "6".repeat(64), versionSha256: "7".repeat(64), runtimeRoot: runtime, runtimeRootSha256: "8".repeat(64), runtimeManifestSha256: "9".repeat(64), runtimeEntries: 1 };
    const result = await runProfileBoundIsolation({ repoRoot: repo, candidateCommit: head, artifactPaths: CODEX_CRITIC_ARTIFACTS, externalParent: path.dirname(repo), resolvedBinary: "/tmp/codex", binaryInspection, inspectBinary: async () => binaryInspection, contractInspection: { contractSha256: "a".repeat(64) }, env: { PATH: "/bin" }, spawn: debugAggregateSpawn({ missingResult: true }), debugContext: { tracePath } });
    assert.equal(result.ok, false); assert.equal(result.envelope.critic.category, "invalid-verdict");
    const records = (await readFile(tracePath, "utf8")).trimEnd().split("\n").map(JSON.parse);
    assert.deepEqual(records.filter(({ event }) => event === "step.completed").map(({ payload }) => payload.step), CODEX_CRITIC_TRACE_STEPS.slice(0, CODEX_CRITIC_TRACE_STEPS.indexOf("result")));
    assert.deepEqual(records.find(({ event }) => event === "result.observed").payload, { present: false, bytes: 0, sha256: null });
    assert.deepEqual(records.find(({ event }) => event === "run.failed").payload, { cause: "result-sink" });
    assert.deepEqual(records.at(-1).payload.outcome, "failed");
  } finally { await rm(repo, { recursive: true, force: true }); await rm(runtime, { recursive: true, force: true }); await rm(debugDirectory, { recursive: true, force: true }); }
});

await check("debug aggregate finalizes asynchronous pre-spawn ENOENT without pid or lease invention", async () => {
  const { repo, head } = await syntheticRepo(); const runtime = await mkdtemp(path.join(os.tmpdir(), "profile-debug-enoent-runtime-")); const debugDirectory = await mkdtemp(path.join(os.tmpdir(), "profile-debug-enoent-trace-")); const tracePath = path.join(debugDirectory, "trace.jsonl");
  try {
    const binaryInspection = { binarySha256: "b".repeat(64), versionSha256: "c".repeat(64), runtimeRoot: runtime, runtimeRootSha256: "d".repeat(64), runtimeManifestSha256: "e".repeat(64), runtimeEntries: 1 };
    const spawn = debugAggregateWithCritic((_command, _args, options) => spawnProcess(path.join(os.tmpdir(), "pipeline-codex-definitely-missing-binary"), [], options));
    const result = await runProfileBoundIsolation({ repoRoot: repo, candidateCommit: head, artifactPaths: CODEX_CRITIC_ARTIFACTS, externalParent: path.dirname(repo), resolvedBinary: "/tmp/codex", binaryInspection, inspectBinary: async () => binaryInspection, contractInspection: { contractSha256: "f".repeat(64) }, env: { PATH: "/bin" }, spawn, debugContext: { tracePath } });
    assert.equal(result.ok, false); assert.equal(result.envelope.critic.category, "spawn-failed");
    const records = (await readFile(tracePath, "utf8")).trimEnd().split("\n").map(JSON.parse); const criticEvents = records.filter(({ payload }) => payload.label === "critic");
    assert.deepEqual(criticEvents.map(({ event }) => event), ["child.spawn-requested", "child.spawn-failed"]);
    assert.deepEqual(criticEvents[1].payload, { label: "critic", category: "not-found" });
    assert.deepEqual(records.find(({ event }) => event === "run.failed").payload, { cause: "cli-before-turn" });
    assert.equal(records.at(-1).event, "trace.finalized"); assert.equal(records.at(-1).payload.outcome, "failed");
  } finally { await rm(repo, { recursive: true, force: true }); await rm(runtime, { recursive: true, force: true }); await rm(debugDirectory, { recursive: true, force: true }); }
});

await check("debug cause requires child or JSONL evidence and distinguishes pre-turn from lifecycle", async () => {
  const cases = [
    { name: "preflight-no-child", external: "missing", critic: null, expected: "unbestimmt" },
    { name: "critic-empty", external: null, critic: emptyDebugCritic, expected: "cli-before-turn" },
    { name: "critic-jsonl", external: null, critic: "tool-event", expected: "jsonl-lifecycle" },
  ];
  for (const [index, specification] of cases.entries()) {
    const { repo, head } = await syntheticRepo(); const runtime = await mkdtemp(path.join(os.tmpdir(), `profile-debug-cause-${index}-runtime-`)); const debugDirectory = await mkdtemp(path.join(os.tmpdir(), `profile-debug-cause-${index}-trace-`)); const tracePath = path.join(debugDirectory, "trace.jsonl");
    try {
      const digit = String(index + 1); const binaryInspection = { binarySha256: digit.repeat(64), versionSha256: "a".repeat(64), runtimeRoot: runtime, runtimeRootSha256: "b".repeat(64), runtimeManifestSha256: "c".repeat(64), runtimeEntries: 1 };
      const spawn = specification.critic === "tool-event" ? debugAggregateSpawn({ toolEvent: true }) : specification.critic ? debugAggregateWithCritic(specification.critic) : debugAggregateSpawn();
      const externalParent = specification.external === "missing" ? path.join(debugDirectory, "absent-private-parent") : path.dirname(repo);
      const result = await runProfileBoundIsolation({ repoRoot: repo, candidateCommit: head, artifactPaths: CODEX_CRITIC_ARTIFACTS, externalParent, resolvedBinary: "/tmp/codex", binaryInspection, inspectBinary: async () => binaryInspection, contractInspection: { contractSha256: "d".repeat(64) }, env: { PATH: "/bin" }, spawn, debugContext: { tracePath } });
      assert.equal(result.ok, false, specification.name);
      const records = (await readFile(tracePath, "utf8")).trimEnd().split("\n").map(JSON.parse);
      assert.deepEqual(records.find(({ event }) => event === "run.failed").payload, { cause: specification.expected }, specification.name);
      if (specification.name === "preflight-no-child") assert.equal(records.some(({ event }) => event.startsWith("child.")), false);
      if (specification.name === "critic-empty") assert.equal(records.some(({ event }) => event === "stream.jsonl-event"), false);
      if (specification.name === "critic-jsonl") assert.equal(records.some(({ event }) => event === "stream.jsonl-event"), true);
    } finally { await rm(repo, { recursive: true, force: true }); await rm(runtime, { recursive: true, force: true }); await rm(debugDirectory, { recursive: true, force: true }); }
  }
});

await check("aggregate blocks binary/runtime drift after preflight and before critic", async () => {
  const { repo, head } = await syntheticRepo(); const runtime = await mkdtemp(path.join(os.tmpdir(), "profile-drift-runtime-"));
  try {
    const binaryInspection = { binarySha256: "a".repeat(64), versionSha256: "b".repeat(64), runtimeRoot: runtime, runtimeRootSha256: "c".repeat(64), runtimeManifestSha256: "d".repeat(64), runtimeEntries: 1 };
    const drifted = { ...binaryInspection, runtimeManifestSha256: "e".repeat(64) };
    const result = await runProfileBoundIsolation({ repoRoot: repo, candidateCommit: head, artifactPaths: CODEX_CRITIC_ARTIFACTS, externalParent: path.dirname(repo), resolvedBinary: "/tmp/codex", binaryInspection, inspectBinary: async () => drifted, contractInspection: { contractSha256: "f".repeat(64) }, env: { PATH: "/bin" }, spawn: aggregateSpawn() });
    assert.equal(result.ok, false); assert.equal(result.envelope.bindingStableBeforeCritic, false); assert.equal(result.envelope.critic, null);
  } finally { await rm(repo, { recursive: true, force: true }); await rm(runtime, { recursive: true, force: true }); }
});

await check("aggregate rejects wrong artifact set and dirty exact artifacts before spawn", async () => {
  const { repo, head } = await syntheticRepo();
  try {
    await assert.rejects(() => runProfileBoundIsolation({ repoRoot: repo, candidateCommit: head, artifactPaths: CODEX_CRITIC_ARTIFACTS.slice(0, 4) }), /exact five/u);
    await writeFile(path.join(repo, CODEX_CRITIC_ARTIFACTS[0]), "dirty\n");
    await assert.rejects(() => runProfileBoundIsolation({ repoRoot: repo, candidateCommit: head, artifactPaths: CODEX_CRITIC_ARTIFACTS }), /must be clean/u);
  } finally { await rm(repo, { recursive: true, force: true }); }
});

await check("local failure diagnostics are bounded and remain separate from public evidence", () => {
  const stdout = { bytes: 3, totalBytes: 3, parts: [Buffer.from("abc")] }; const stderr = { bytes: 5, totalBytes: 5, parts: [Buffer.from("error")] };
  const diagnostic = localFailureDiagnostic(stdout, stderr); assert.equal(diagnostic.stdoutTail, "abc"); assert.match(diagnostic.stderrSha256, /^[0-9a-f]{64}$/u);
});

process.stdout.write(`\n${passed}/${passed + failures.length} checks passed.\n`);
if (failures.length) { process.stdout.write(`${failures.join("\n")}\n`); process.exitCode = 1; }
