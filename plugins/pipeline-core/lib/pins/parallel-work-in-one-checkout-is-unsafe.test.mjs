// SPDX-License-Identifier: SUL-1.0
/**
 * Regression pin: pipeline.parallel-work-in-one-checkout-is-unsafe (AC-224), failure modes 1 and 2.
 *
 * Original requirement (backlog/items/2026-10-04-parallel-work-in-one-checkout-is-unsafe.md, Description + Proposal):
 *   1. Counter lock. Parallel tool calls inside one dispatch must not make the dispatch-budget counter answer
 *      DISPATCH-BUDGET-INPUT-INVALID (counter-lock-busy) and leave it stuck. "Make the counter lock wait or retry
 *      briefly and recover on its own instead of sticking; serialise counter updates per dispatch."
 *   2. Dispatch-record collision. Parallel edits of the dispatch's own record must not trip
 *      GUARD-DISPATCH-RECORD-COLLISION once the outcome flips to committed-pending-report and leave an
 *      unrepairable record. "Make dispatch-record updates atomic and repairable."
 *   3. (not here) transient not-ready, and the liveness readback: a sibling dispatch appends below.
 *
 * Mode 1 runs the REAL hook (hooks/guard-dispatch-budget.mjs) as child processes on one real counter file, plus
 * a child "runner" that loads the real module and injects a clock-free `sleep` so a live holder can be released
 * MID-WAIT deterministically. Mode 2 reuses the in-process evaluateLifecycleReadyGuard seam that RECCOL-1..6 in
 * hooks/guard-lifecycle-ready.test.mjs use (those helpers are not importable, so minimal equivalents live here).
 *
 * Containment: every fixture lives under the repository scratch/ directory, never the OS temp dir. Every git call
 * runs with GIT_CEILING_DIRECTORIES set to the absolute parent of the fixture root, and each git fixture is
 * `git init`-ed in its own root before the first git write. The guard module is only ever imported inside CHILD
 * processes for mode 1 (so a regression of its entrypoint gate cannot turn this file into a silent pass).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { planGovernanceScopeDecision, applyGovernanceScopeDecision, observeGovernanceScope } from "../governance-scope.mjs";
import { evaluateLifecycleReadyGuard } from "../../hooks/guard-lifecycle-ready.mjs";

const GUARD = fileURLToPath(new URL("../../hooks/guard-dispatch-budget.mjs", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const SCRATCH_ROOT = join(REPO_ROOT, "scratch");
mkdirSync(SCRATCH_ROOT, { recursive: true });
const FIXTURE = mkdtempSync(join(SCRATCH_ROOT, "parwork-pin-"));
// Every fixture root is a direct child of FIXTURE, so FIXTURE is the absolute parent of each fixture root.
process.env.GIT_CEILING_DIRECTORIES = FIXTURE;
process.on("exit", () => { try { rmSync(FIXTURE, { recursive: true, force: true }); } catch { /* best effort */ } });

const GOLDFISH = "pipeline-core:goldfish-implementor";
// A refusal that mentions the counter lock in any of its three shapes (busy, timeout, ambiguous) or the generic invalid-input code.
const LOCK_REFUSAL = /counter-lock|COUNTER-LOCK|DISPATCH-BUDGET-INPUT-INVALID/u;

// ===================================================================================================================
// MODE 1 -- counter lock under parallel tool calls of ONE dispatch
// ===================================================================================================================
let seq = 0;

function hookFixture() {
  const root = join(FIXTURE, `hook-repo-${seq += 1}`);
  mkdirSync(root, { recursive: true });
  execFileSync("git", ["init", "--quiet"], { cwd: root, env: { ...process.env, GIT_CEILING_DIRECTORIES: dirname(root) } });
  const plan = planGovernanceScopeDecision({ rootDir: root, decision: "enroll", by: "Parallel work pin fixture" });
  assert.equal(applyGovernanceScopeDecision(plan, { activate: true, planSha256: plan.planSha256 }).state, "active");
  assert.equal(observeGovernanceScope({ rootDir: root }).requiresEnforcement, true);
  const budgetDir = join(root, ".git", "agent-pipeline", "dispatch-budget");
  mkdirSync(budgetDir, { recursive: true });
  const agentId = `pin-parwork-agent-${seq}`;
  const counterPath = join(budgetDir, `${agentId}.json`);
  writeFileSync(counterPath, `${JSON.stringify({
    schema: "pipeline.dispatch-budget-counter.v1", agentId, agentType: GOLDFISH,
    maxTurns: 50, baseCalls: 35, workingCap: 35, count: 0,
  }, null, 2)}\n`);
  return { root, agentId, budgetDir, counterPath, lockPath: `${counterPath}.binding.lock` };
}

const hookEnv = (f) => ({ ...process.env, CLAUDE_PROJECT_DIR: f.root, GIT_CEILING_DIRECTORIES: dirname(f.root) });
const readCount = (f) => JSON.parse(readFileSync(f.counterPath, "utf8")).count;
const lockDebris = (f) => readdirSync(f.budgetDir).filter((name) => /\.binding\.lock|\.recovery|\.dead\./u.test(name));

function hookPayload(f, n) {
  return {
    agent_id: f.agentId, agent_type: GOLDFISH, transcript_path: join(f.root, "session.jsonl"),
    tool_name: "Read", tool_input: { file_path: join(f.root, `a${n}.txt`) },
  };
}

/** One REAL hook process (the exact entrypoint the host spawns). Resolves with exit status, stderr and wall times. */
function runHook(f, n = 0) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const child = spawn(process.execPath, [GUARD], { cwd: f.root, env: hookEnv(f), stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error(`hook process ${n} did not exit within 120 s`)); }, 120000);
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (status) => { clearTimeout(timer); resolve({ n, status, stdout, stderr, startedAt, endedAt: Date.now() }); });
    child.stdin.end(JSON.stringify(hookPayload(f, n)));
  });
}

// ---- child "runner": the REAL module, a LIVE holder in the same process, `sleep` injected so the holder can be released mid-wait ----
const HOOK_RUNNER = join(FIXTURE, "hook-runner.mjs");
writeFileSync(HOOK_RUNNER, [
  "import { pathToFileURL } from 'node:url';",
  "const [, , guardPath, b64] = process.argv;",
  "const s = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));",
  "const mod = await import(pathToFileURL(guardPath).href);",
  "let holder = null;",
  "if (s.holdLock) {",
  "  const first = mod.acquireDispatchBudgetCounterLock(s.lockPath);",
  "  if (first.status !== 'acquired') { console.log('HOOKRUN: ' + JSON.stringify({ setupFailed: first.code })); process.exit(0); }",
  "  holder = first.lock;",
  "}",
  "const sleeps = [];",
  "const deps = {};",
  // The pre-R7-11 behaviour: one attempt, no wait. This is the hook-level seam `options.acquireDispatchBudgetCounterLockFn`.
  "if (s.singleAttempt) deps.acquireDispatchBudgetCounterLockFn = mod.acquireDispatchBudgetCounterLock;",
  "deps.sleep = (ms) => {",
  "  sleeps.push(ms);",
  "  if (holder && sleeps.length === s.releaseAfterSleeps) { mod.releaseDispatchBudgetCounterLock(holder); holder = null; }",
  "  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);",
  "};",
  "const result = mod.evaluateDispatchBudgetGuard(s.input, deps);",
  "const out = { exitCode: result.exitCode, stderr: result.stderr ?? '', sleeps, stillHeld: holder !== null };",
  "if (holder) mod.releaseDispatchBudgetCounterLock(holder);",
  "console.log('HOOKRUN: ' + JSON.stringify(out));",
].join("\n"));

function runnerRun(f, scenario) {
  const b64 = Buffer.from(JSON.stringify({ ...scenario, lockPath: f.lockPath, input: hookPayload(f, 0) }), "utf8").toString("base64");
  const res = spawnSync(process.execPath, [HOOK_RUNNER, GUARD, b64], { cwd: f.root, env: hookEnv(f), encoding: "utf8", input: "", timeout: 120000 });
  assert.equal(res.status, 0, `hook runner exited ${res.status}: ${(res.stderr ?? "").slice(0, 400)}`);
  const line = (res.stdout ?? "").split("\n").find((l) => l.startsWith("HOOKRUN: "));
  assert.ok(line, `no HOOKRUN line in runner output: ${JSON.stringify(res.stdout)}`);
  const out = JSON.parse(line.slice("HOOKRUN: ".length));
  assert.equal(out.setupFailed, undefined, `could not stage the live holder: ${out.setupFailed}`);
  return out;
}

// ---- child "holder": a SEPARATE live process that owns the counter lock until its stdin closes (or it is killed) ----
const LOCK_HOLDER = join(FIXTURE, "lock-holder.mjs");
writeFileSync(LOCK_HOLDER, [
  "import { pathToFileURL } from 'node:url';",
  "const [, , guardPath, lockPath] = process.argv;",
  "const mod = await import(pathToFileURL(guardPath).href);",
  "const first = mod.acquireDispatchBudgetCounterLock(lockPath);",
  "if (first.status !== 'acquired') { console.log('HOLDER-FAILED ' + first.code); process.exit(3); }",
  "console.log('HELD');",
  "process.stdin.resume();",
  "process.stdin.on('end', () => { mod.releaseDispatchBudgetCounterLock(first.lock); console.log('RELEASED'); process.exit(0); });",
].join("\n"));

function startHolder(f) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [LOCK_HOLDER, GUARD, f.lockPath], { env: hookEnv(f), stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let out = "";
    let err = "";
    const closed = new Promise((done) => { child.on("close", (code) => done({ code, out, err })); });
    const timer = setTimeout(() => { child.kill(); reject(new Error("lock holder never reported HELD")); }, 60000);
    child.stderr.setEncoding("utf8"); child.stdout.setEncoding("utf8");
    child.stderr.on("data", (d) => { err += d; });
    child.stdout.on("data", (d) => {
      out += d;
      if (out.startsWith("HELD")) {
        clearTimeout(timer);
        resolve({
          child, closed,
          release: () => { child.stdin.end(); return closed; },
          kill: () => { child.kill("SIGKILL"); return closed; },
        });
      } else if (out.startsWith("HOLDER-FAILED")) { clearTimeout(timer); reject(new Error(out)); }
    });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
  });
}

const HOST_SKIP = process.platform === "win32" || process.platform === "linux" ? false
  : `HOST-LIMITATION: native lock-owner identity is implemented for win32 and linux; platform ${process.platform} is held. Owner Coordinator, due 2026-10-19 (macOS/Linux/WSL run, PO decision K7)`;

test("PARWORK-M1a: 6 parallel REAL hook processes on one dispatch counter are all admitted, counted exactly once each, with no lock refusal and the lock released", { skip: HOST_SKIP, timeout: 300000 }, async () => {
  const f = hookFixture();
  const N = 6;
  const runs = await Promise.all(Array.from({ length: N }, (_, i) => runHook(f, i)));
  const summary = runs.map((r) => `#${r.n}: exit ${r.status} in ${r.endedAt - r.startedAt} ms`).join("; ");
  for (const r of runs) {
    assert.equal(r.status, 0, `parallel call ${r.n} refused; ${summary}; stderr: ${r.stderr.slice(0, 500)}`);
    assert.doesNotMatch(r.stderr, LOCK_REFUSAL, `parallel call ${r.n} surfaced a counter-lock refusal; ${summary}`);
  }
  assert.equal(readCount(f), N, `every parallel call is counted exactly once (lost update or double count otherwise); ${summary}`);
  assert.equal(existsSync(f.lockPath), false, "counter lock released after the parallel burst");
  assert.deepEqual(lockDebris(f), [], "no lock, recovery or quarantine debris left behind");
});

test("PARWORK-M1b: a LIVE holder that releases inside the bounded wait does not refuse the call -- it waits (5 -> 10 -> 20 ms backoff), is admitted and counted, and the lock is released", { skip: HOST_SKIP }, () => {
  const f = hookFixture();
  const r = runnerRun(f, { holdLock: true, releaseAfterSleeps: 3 });
  assert.equal(r.exitCode, 0, `call refused although the holder released inside the bound: ${r.stderr.slice(0, 500)}`);
  assert.doesNotMatch(r.stderr, LOCK_REFUSAL);
  assert.deepEqual(r.sleeps.slice(0, 3), [5, 10, 20], `the call did not wait with the specified backoff: ${JSON.stringify(r.sleeps)}`);
  assert.equal(r.sleeps.length, 3, "after the holder released, the very next attempt acquired (no further sleep)");
  assert.equal(r.stillHeld, false);
  assert.equal(readCount(f), 1, "the waiting call is counted exactly once");
  assert.equal(existsSync(f.lockPath), false, "lock released");
  assert.deepEqual(lockDebris(f), []);
});

test("PARWORK-M1c (control, RED mirror of the original defect): with the pre-fix single attempt a live holder makes the same call answer DISPATCH-BUDGET-INPUT-INVALID (counter-lock-busy) and uncounted", { skip: HOST_SKIP }, () => {
  // The hook-level seam `acquireDispatchBudgetCounterLockFn` swaps the bounded wait for the single attempt the hook had before R7-11.
  // PARWORK-M1b is green only because of the wait; this control proves the same fixture is RED without it, so M1b is not vacuous.
  const f = hookFixture();
  const r = runnerRun(f, { holdLock: true, singleAttempt: true, releaseAfterSleeps: 3 });
  assert.equal(r.exitCode, 2);
  assert.match(r.stderr, /DISPATCH-BUDGET-INPUT-INVALID/u);
  assert.match(r.stderr, /counter-lock-busy/u);
  assert.deepEqual(r.sleeps, [], "a single attempt never waits");
  assert.equal(readCount(f), 0, "the refused call is not counted");
});

test("PARWORK-M1d: a holder that outlasts the bound yields the typed DISPATCH-BUDGET-COUNTER-LOCK-TIMEOUT (retry the same call, uncounted, lock untouched), and the very next call after the holder releases is admitted -- the dispatch is not stuck", { skip: HOST_SKIP, timeout: 300000 }, async () => {
  const f = hookFixture();
  const holder = await startHolder(f);
  try {
    const refused = await runHook(f, 0);
    assert.equal(refused.status, 2, `expected the bounded-wait refusal, got exit ${refused.status}: ${refused.stderr.slice(0, 500)}`);
    assert.match(refused.stderr, /DISPATCH-BUDGET-COUNTER-LOCK-TIMEOUT/u);
    assert.match(refused.stderr, /retry the same call/u);
    assert.doesNotMatch(refused.stderr, /DISPATCH-BUDGET-INPUT-INVALID|repair or remove it through the trusted host path/u, "contention must not be reported as corrupt state needing host repair");
    assert.ok(refused.endedAt - refused.startedAt >= 3000, `the hook refused after ${refused.endedAt - refused.startedAt} ms: it did not wait out the 3000 ms bound`);
    assert.equal(readCount(f), 0, "the refused call is not counted and the counter is unchanged");
    assert.equal(existsSync(f.lockPath), true, "a live holder's lock is never taken over or deleted by the waiter");
  } finally {
    const released = await holder.release();
    assert.equal(released.code, 0, `holder exit: ${released.err}`);
  }
  const retry = await runHook(f, 1);
  assert.equal(retry.status, 0, `call after the timeout is still refused (stuck): ${retry.stderr.slice(0, 500)}`);
  assert.doesNotMatch(retry.stderr, LOCK_REFUSAL);
  assert.equal(readCount(f), 1, "the retried call is counted once");
  assert.equal(existsSync(f.lockPath), false, "lock released");
  assert.deepEqual(lockDebris(f), []);
});

test("PARWORK-M1e: a lock whose holder CRASHED (killed, lock file left behind) is recovered by the next real hook call instead of sticking the dispatch", { skip: HOST_SKIP, timeout: 300000 }, async () => {
  const f = hookFixture();
  const holder = await startHolder(f);
  const killed = await holder.kill();
  assert.equal(killed.code === 0, false, "the holder was killed, not released");
  assert.equal(existsSync(f.lockPath), true, "the crashed holder left its lock file behind (the stuck-counter precondition)");
  const r = await runHook(f, 0);
  assert.equal(r.status, 0, `the dead owner's lock was not recovered: ${r.stderr.slice(0, 500)}`);
  assert.doesNotMatch(r.stderr, LOCK_REFUSAL);
  assert.equal(readCount(f), 1);
  assert.equal(existsSync(f.lockPath), false, "lock released after the recovered acquisition");
  assert.deepEqual(lockDebris(f), []);
});

// ===================================================================================================================
// MODE 2 -- the dispatch's own record under repeated (and concurrent) edits of the same owner
// ===================================================================================================================
// Minimal equivalents of the helpers RECCOL-1..6 use in hooks/guard-lifecycle-ready.test.mjs (not importable from there).
const OWNER = "parwork-agent-owner";
const OTHER = "parwork-agent-other";
const SHA = "e1c0ffee12345678";
const COMMIT = "b".repeat(40);
const COLLISION = /GUARD-DISPATCH-RECORD-COLLISION/u;

let recSeq = 0;
function recordFixture() {
  const stamp = `m2-${recSeq += 1}`;
  const path = join(FIXTURE, `${stamp}-root`);
  const commonDir = join(FIXTURE, `${stamp}-common`);
  mkdirSync(join(path, ".claude"), { recursive: true });
  mkdirSync(join(path, ".agent-pipeline"), { recursive: true });
  mkdirSync(join(path, "evidence"), { recursive: true });
  writeFileSync(join(path, ".agent-pipeline", "onboarding-consent.json"), JSON.stringify({
    schema: "pipeline.onboarding-consent-marker.v1", status: "consent-given-onboarding-incomplete", consentGivenAt: "2026-09-29T00:00:00.000Z",
  }));
  writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
  mkdirSync(join(commonDir, "agent-pipeline", "bootstrap-receipt"), { recursive: true });
  for (const agentId of [OWNER, OTHER]) {
    writeFileSync(join(commonDir, "agent-pipeline", "bootstrap-receipt", `${agentId}.json`), JSON.stringify({
      schema: "pipeline.bootstrap-receipt.v1", agentId, agentType: "pipeline-core:goldfish-deep", observedAt: "1970-01-01T00:00:00.000Z",
    }));
  }
  const fx = { path, commonDir, history: null };
  fx.deps = {
    projectDir: path, resolveGitCommonDirFn: () => commonDir,
    requireProjectOnboardingReadyFn: () => ({ schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" }),
    nowFn: () => "1970-01-01T00:00:00.000Z", gitCommitForTaskIdFn: () => fx.history,
  };
  fx.rel = (id) => `evidence/dispatch-record-${id}.json`;
  fx.file = (id) => join(path, "evidence", `dispatch-record-${id}.json`);
  fx.claim = (id) => join(commonDir, "agent-pipeline", "dispatch-record-owner", `${id}.json`);
  fx.input = (agentId, tool, toolInput) => ({
    tool_name: tool, tool_input: toolInput, transcript_path: "/parent/session.jsonl",
    ...(agentId === null ? {} : { agent_id: agentId, agent_type: "pipeline-core:goldfish-deep" }),
  });
  fx.write = (agentId, id, record) => evaluateLifecycleReadyGuard(fx.input(agentId, "Write", { file_path: fx.rel(id), content: JSON.stringify(record, null, 2) }), fx.deps);
  fx.edit = (agentId, id, edit) => evaluateLifecycleReadyGuard(fx.input(agentId, "Edit", { file_path: fx.rel(id), old_string: edit.from, new_string: edit.to }), fx.deps);
  fx.land = (id, record) => writeFileSync(fx.file(id), JSON.stringify(record, null, 2));
  fx.text = (id) => readFileSync(fx.file(id), "utf8");
  fx.cleanup = () => { rmSync(path, { recursive: true, force: true }); rmSync(commonDir, { recursive: true, force: true }); };
  return fx;
}

/** The Edit tool's effect: replace one exact occurrence; an anchor that is absent or ambiguous would fail the tool itself, not the guard. */
function applyEdit(text, { from, to }) {
  const at = text.indexOf(from);
  assert.ok(at >= 0 && text.indexOf(from, at + 1) < 0, `Edit anchor ${JSON.stringify(from)} must match exactly once`);
  return text.slice(0, at) + to + text.slice(at + from.length);
}

/** Both guard evaluations happen BEFORE either edit lands (parallel tool calls), then the edits land one after the other. */
function admitConcurrently(fx, agentId, id, edits) {
  const verdicts = edits.map((edit) => fx.edit(agentId, id, edit));
  verdicts.forEach((v, i) => assert.equal(v.exitCode, 0, `concurrent edit #${i + 1} refused: ${v.stderr}`));
  let text = fx.text(id);
  for (const edit of edits) text = applyEdit(text, edit);
  writeFileSync(fx.file(id), text);
  return JSON.parse(text);
}

test("PARWORK-M2a: two same-owner Edits one after the other against the interim 'committed-pending-report' record are both admitted, keep it parseable, and the owner can still finalize it", () => {
  const fx = recordFixture();
  const id = "PARWORK-SEQ-1";
  try {
    const open = { taskId: id, outcome: "in-progress", commits: [], log: [] };
    assert.equal(fx.write(OWNER, id, open).exitCode, 0);
    fx.land(id, open);
    const claim = JSON.parse(readFileSync(fx.claim(id), "utf8"));
    assert.equal(claim.agentId, OWNER, "the opening write recorded its owner");
    fx.history = SHA; // the dispatch's own commit now cites the task id in git history
    const interim = { ...open, outcome: "committed-pending-report", commits: [COMMIT] };
    const checkpoint = fx.write(OWNER, id, interim);
    assert.equal(checkpoint.exitCode, 0, checkpoint.stderr);
    fx.land(id, interim);

    const first = { from: "\"log\": []", to: "\"log\": [{ \"phase\": \"edit-1\" }]" };
    const verdictOne = fx.edit(OWNER, id, first);
    assert.equal(verdictOne.exitCode, 0, `first same-owner Edit of the interim record refused: ${verdictOne.stderr}`);
    writeFileSync(fx.file(id), applyEdit(fx.text(id), first));
    assert.deepEqual(JSON.parse(fx.text(id)).log, [{ phase: "edit-1" }], "record parseable after the first edit");

    const second = { from: "{ \"phase\": \"edit-1\" }]", to: "{ \"phase\": \"edit-1\" }, { \"phase\": \"edit-2\" }]" };
    const verdictTwo = fx.edit(OWNER, id, second);
    assert.equal(verdictTwo.exitCode, 0, `second same-owner Edit of the interim record refused: ${verdictTwo.stderr}`);
    writeFileSync(fx.file(id), applyEdit(fx.text(id), second));
    const parsed = JSON.parse(fx.text(id));
    assert.deepEqual(parsed.log, [{ phase: "edit-1" }, { phase: "edit-2" }], "record parseable after the second edit");
    assert.equal(parsed.outcome, "committed-pending-report");

    const final = { ...parsed, outcome: "completed", candidateCommit: COMMIT, report: { text: "done" } };
    const finalized = fx.write(OWNER, id, final);
    assert.equal(finalized.exitCode, 0, `the interim record is not finalizable after two edits: ${finalized.stderr}`);
    fx.land(id, final);
    const late = fx.edit(OWNER, id, { from: "\"done\"", to: "\"altered\"" });
    assert.equal(late.exitCode, 2, "a finalized record stays immutable");
    assert.match(late.stderr, COLLISION);
  } finally { fx.cleanup(); }
});

test("PARWORK-M2b: PARALLEL same-owner Edits (both guard-evaluated before either lands) are admitted across the in-progress -> committed-pending-report flip, the record stays parseable, and it is finalizable", () => {
  const fx = recordFixture();
  const id = "PARWORK-PAR-2";
  try {
    const open = { taskId: id, outcome: "in-progress", commits: [], log: [] };
    assert.equal(fx.write(OWNER, id, open).exitCode, 0);
    fx.land(id, open);
    fx.history = SHA;

    // Pair 1 straddles the flip: one Edit flips the outcome and records the commit, the other appends a log entry.
    const afterFlip = admitConcurrently(fx, OWNER, id, [
      { from: "\"outcome\": \"in-progress\"", to: "\"outcome\": \"committed-pending-report\"" },
      { from: "\"log\": []", to: "\"log\": [{ \"phase\": \"committed\" }]" },
    ]);
    assert.equal(afterFlip.outcome, "committed-pending-report");
    assert.deepEqual(afterFlip.log, [{ phase: "committed" }]);

    // Pair 2 runs entirely against the interim record -- the state the item reports as unrepairable.
    const afterPair = admitConcurrently(fx, OWNER, id, [
      { from: "\"commits\": []", to: `"commits": ["${COMMIT}"]` },
      { from: "{ \"phase\": \"committed\" }]", to: "{ \"phase\": \"committed\" }, { \"phase\": \"checkpoint\" }]" },
    ]);
    assert.deepEqual(afterPair.commits, [COMMIT]);
    assert.deepEqual(afterPair.log, [{ phase: "committed" }, { phase: "checkpoint" }]);
    assert.equal(afterPair.outcome, "committed-pending-report", "the interim outcome survived both pairs");

    const final = { ...afterPair, outcome: "completed", candidateCommit: COMMIT, report: { text: "done" } };
    const finalized = fx.write(OWNER, id, final);
    assert.equal(finalized.exitCode, 0, `the record is not finalizable after the parallel edits: ${finalized.stderr}`);
  } finally { fx.cleanup(); }
});

test("PARWORK-M2c: concurrent Edits by a FOREIGN writer against the owner's interim record are all refused and leave the record byte-identical (a collision never corrupts it)", () => {
  const fx = recordFixture();
  const id = "PARWORK-FOREIGN-3";
  try {
    const open = { taskId: id, outcome: "in-progress", commits: [], log: [] };
    assert.equal(fx.write(OWNER, id, open).exitCode, 0);
    fx.land(id, open);
    fx.history = SHA;
    fx.land(id, { ...open, outcome: "committed-pending-report", commits: [COMMIT] });
    const before = fx.text(id);
    for (const who of [OTHER, null]) {
      for (const edit of [{ from: "\"log\": []", to: "\"log\": [{ \"x\": 1 }]" }, { from: "\"commits\"", to: "\"commits_\"" }]) {
        const refused = fx.edit(who, id, edit);
        assert.equal(refused.exitCode, 2, String(who));
        assert.match(refused.stderr, COLLISION);
      }
    }
    assert.equal(fx.text(id), before, "refused edits changed nothing");
    const survivor = fx.edit(OWNER, id, { from: "\"log\": []", to: "\"log\": [{ \"phase\": \"checkpoint\" }]" });
    assert.equal(survivor.exitCode, 0, `the owner is locked out after the foreign collisions: ${survivor.stderr}`);
  } finally { fx.cleanup(); }
});

// ===================================================================================================================
// SIBLING SECTION -- reserved, NOT part of this dispatch.
// Failure mode 3 (transient GUARD-LIFECYCLE-NOT-READY while another agent commits; one readiness definition for
// preflight and guard) and the liveness readback for open dispatch records (a second writer in the same checkout)
// belong to a sibling dispatch of item pipeline.parallel-work-in-one-checkout-is-unsafe. It appends its cases below
// this line; do not edit the mode 1 / mode 2 sections above to add them.
// ===================================================================================================================
