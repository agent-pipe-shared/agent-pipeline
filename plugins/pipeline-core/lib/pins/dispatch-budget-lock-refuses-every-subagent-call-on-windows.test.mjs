// SPDX-License-Identifier: SUL-1.0
/**
 * Regression pin: pipeline.dispatch-budget-lock-refuses-every-subagent-call-on-windows (AC-161).
 *
 * Acceptance of the original item, one block of cases each:
 *   (1) the counter lock has a cross-platform owner identity with live/dead/ambiguous semantics;
 *   (2) a budget-counted subagent runs Read, Write and Bash through the REAL hook (child process, real
 *       lock, real counter file) without any counter-lock refusal;
 *   (3) the Goldfish and Critic briefing templates state the bootstrap-entry step before the first write.
 *
 * The guard module is only ever imported inside a CHILD process (never at module scope here), so a
 * regression of its entrypoint gate cannot turn this file into a silent pass. Fixtures live under the
 * repository scratch/ directory, never the OS temp dir.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { planGovernanceScopeDecision, applyGovernanceScopeDecision, observeGovernanceScope } from "../governance-scope.mjs";

const GUARD = fileURLToPath(new URL("../../hooks/guard-dispatch-budget.mjs", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const SCRATCH_ROOT = join(REPO_ROOT, "scratch");
mkdirSync(SCRATCH_ROOT, { recursive: true });
const FIXTURE = mkdtempSync(join(SCRATCH_ROOT, "dbl-win-pin-"));
process.on("exit", () => { try { rmSync(FIXTURE, { recursive: true, force: true }); } catch { /* best effort */ } });

const NATIVE_SKIP = process.platform === "win32" || process.platform === "linux" ? false
  : `HOST-LIMITATION: native owner identity is implemented for win32 and linux; platform ${process.platform} is held. Owner Coordinator, due 2026-10-19 (macOS/Linux/WSL run, PO decision K7)`;

// ---- child runner: real lock primitives, optional forged owner record -------------------------------
const RUNNER = join(FIXTURE, "lock-runner.mjs");
writeFileSync(RUNNER, [
  "import { pathToFileURL } from 'node:url';",
  "import { writeFileSync, readFileSync } from 'node:fs';",
  "import { hostname, uptime } from 'node:os';",
  "const [, , guardPath, b64] = process.argv;",
  "const s = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));",
  "const mod = await import(pathToFileURL(guardPath).href);",
  "const deps = {};",
  "if (s.platform) deps.platform = s.platform;",
  "if (s.killMode) deps.killFn = () => { if (s.killMode === 'alive') return; const e = new Error('k'); e.code = s.killMode; throw e; };",
  "if (s.forge) {",
  "  const boot = Math.round(Date.now() / 1000 - uptime()) + (s.forge.bootOffset || 0);",
  "  const owner = { platform: 'win32', hostId: s.forge.otherHost ? 'some-other-host' : hostname().toLowerCase(), bootId: 'w32boot-' + boot, pid: s.forge.self ? process.pid : 999999, processStart: '1', nonce: 'a'.repeat(32) };",
  "  writeFileSync(s.lockPath, JSON.stringify({ schema: 'pipeline.dispatch-budget-counter-lock.v1', owner }) + '\\n');",
  "}",
  "const sleeps = [];",
  "if (s.fakeClock) { let t = 0; deps.now = () => t; deps.sleep = (ms) => { sleeps.push(ms); t += ms; }; }",
  "const t0 = performance.now();",
  "const first = s.wait ? mod.acquireDispatchBudgetCounterLockWithWait(s.lockPath, deps) : mod.acquireDispatchBudgetCounterLock(s.lockPath, deps);",
  "const out = { status: first.status, code: first.code ?? null, recovered: first.recovered ?? false };",
  "if (s.wait) { out.elapsedMs = performance.now() - t0; out.sleeps = sleeps; out.holderAgeMs = first.holderAgeMs ?? null; }",
  "if (first.status === 'acquired') {",
  "  out.owner = JSON.parse(readFileSync(s.lockPath, 'utf8')).owner;",
  "  if (s.second) { const again = mod.acquireDispatchBudgetCounterLock(s.lockPath, deps); out.second = { status: again.status, code: again.code ?? null }; }",
  "  out.released = mod.releaseDispatchBudgetCounterLock(first.lock);",
  "}",
  "console.log('LOCKRUN: ' + JSON.stringify(out));",
].join("\n"));

let seq = 0;
function lockRun(scenario, guardPath = GUARD) {
  const lockPath = join(FIXTURE, `lock-${seq += 1}`, "agent.json.binding.lock");
  mkdirSync(join(lockPath, ".."), { recursive: true });
  const b64 = Buffer.from(JSON.stringify({ ...scenario, lockPath }), "utf8").toString("base64");
  const res = spawnSync(process.execPath, [RUNNER, guardPath, b64], { encoding: "utf8", input: "", timeout: 60000 });
  assert.equal(res.status, 0, `lock runner exited ${res.status}: ${(res.stderr ?? "").slice(0, 400)}`);
  const line = (res.stdout ?? "").split("\n").find((l) => l.startsWith("LOCKRUN: "));
  assert.ok(line, `no LOCKRUN line in runner output: ${JSON.stringify(res.stdout)}`);
  return { ...JSON.parse(line.slice("LOCKRUN: ".length)), lockPath };
}

// ---- (1) cross-platform owner identity --------------------------------------------------------------
test("AC1a: on the native host the lock is acquired, carries this platform's owner identity, and a second attempt sees a LIVE owner (busy, not ambiguous)", { skip: NATIVE_SKIP }, () => {
  const r = lockRun({ second: true });
  assert.equal(r.status, "acquired", `native acquisition refused with ${r.code}`);
  assert.equal(r.owner.platform, process.platform);
  assert.match(r.owner.hostId, /^[A-Za-z0-9._-]{1,120}$/u);
  assert.ok(Number.isSafeInteger(r.owner.pid) && r.owner.pid > 0);
  assert.match(r.owner.processStart, /^[0-9]+$/u);
  assert.equal(r.second.status, "rejected");
  assert.equal(r.second.code, "counter-lock-busy", "a live owner must read busy (retryable), never owner-ambiguous");
  assert.equal(r.released, true);
  assert.equal(existsSync(r.lockPath), false, "lock released");
});

test("AC1b: win32 identity semantics (platform seam, runs on any host): owner from another boot is DEAD and recovered", () => {
  const r = lockRun({ platform: "win32", forge: { bootOffset: -100000 } });
  assert.equal(r.status, "acquired", `refused with ${r.code}`);
  assert.equal(r.recovered, true);
});

test("AC1c: win32 identity semantics: same boot, same pid, different process start is DEAD (pid reuse) and recovered", () => {
  const r = lockRun({ platform: "win32", forge: { self: true } });
  assert.equal(r.status, "acquired", `refused with ${r.code}`);
  assert.equal(r.recovered, true);
});

test("AC1d: win32 identity semantics: same boot, foreign pid -- ESRCH is dead (recovered), alive/EPERM is live (busy), other error is ambiguous", () => {
  const dead = lockRun({ platform: "win32", forge: {}, killMode: "ESRCH" });
  assert.equal(dead.status, "acquired", `ESRCH refused with ${dead.code}`);
  assert.equal(dead.recovered, true);
  for (const killMode of ["alive", "EPERM"]) {
    const live = lockRun({ platform: "win32", forge: {}, killMode });
    assert.deepEqual([live.status, live.code], ["rejected", "counter-lock-busy"], `killMode ${killMode}`);
  }
  const ambiguous = lockRun({ platform: "win32", forge: {}, killMode: "EIO" });
  assert.deepEqual([ambiguous.status, ambiguous.code], ["rejected", "counter-lock-owner-ambiguous"]);
});

test("AC1e: win32 identity semantics: a lock recorded by a different host is ambiguous, never taken over", () => {
  const r = lockRun({ platform: "win32", forge: { otherHost: true } });
  assert.deepEqual([r.status, r.code], ["rejected", "counter-lock-owner-ambiguous"]);
  assert.equal(existsSync(r.lockPath), true, "foreign-host lock must be left untouched");
});

// ---- (1b) R7-11 bounded wait: the module HAS acquireDispatchBudgetCounterLockWithWait (3000 ms bound, 5..100 ms backoff)
const WAIT_BOUND_MS = 3000;
const WAIT_UPPER_MS = WAIT_BOUND_MS + 6000; // generous slack for a loaded host; still proves "no unbounded loop"

test("R7-11a: a live foreign owner holds the lock -> the wait returns a typed counter-lock-timeout within the stated bound, never taking the lock over", () => {
  const r = lockRun({ platform: "win32", forge: {}, killMode: "alive", wait: true });
  assert.deepEqual([r.status, r.code], ["rejected", "counter-lock-timeout"]);
  assert.ok(r.elapsedMs >= WAIT_BOUND_MS - 100, `returned after ${r.elapsedMs} ms, before the ${WAIT_BOUND_MS} ms bound: it did not wait`);
  assert.ok(r.elapsedMs <= WAIT_UPPER_MS, `waited ${r.elapsedMs} ms, beyond the upper bound ${WAIT_UPPER_MS} ms`);
  assert.ok(Number.isFinite(r.holderAgeMs) && r.holderAgeMs >= 0, "timeout names the holder age");
  assert.equal(existsSync(r.lockPath), true, "a live holder's lock is never taken over or deleted");
});

test("R7-11b: the wait backs off 5 -> 100 ms (capped), sleeps never exceed the bound in total, and a non-transient owner state (ambiguous) is returned at once without sleeping", () => {
  const r = lockRun({ platform: "win32", forge: {}, killMode: "alive", wait: true, fakeClock: true });
  assert.deepEqual([r.status, r.code], ["rejected", "counter-lock-timeout"]);
  assert.deepEqual(r.sleeps.slice(0, 6), [5, 10, 20, 40, 80, 100]);
  assert.ok(r.sleeps.every((ms) => ms >= 1 && ms <= 100), `sleep outside 1..100 ms: ${JSON.stringify(r.sleeps)}`);
  assert.ok(r.sleeps.reduce((a, b) => a + b, 0) <= WAIT_BOUND_MS, "total slept time exceeds the wait bound");
  const amb = lockRun({ platform: "win32", forge: { otherHost: true }, wait: true, fakeClock: true });
  assert.deepEqual([amb.status, amb.code], ["rejected", "counter-lock-owner-ambiguous"]);
  assert.deepEqual(amb.sleeps, [], "ambiguous must fail closed with no wait");
});

// ---- (1c) RED mirror: a mutant lock module that drops the win32 owner identity must fail the pin's own cases ----
// The mutant is a scratch copy of the guard with every recorded win32 owner read as ambiguous (the pre-fix
// behaviour: nothing is ever provably live or dead). Relative imports are rewritten to absolute URLs so the
// copy loads from the scratch fixture through the same RUNNER seam as the real module.
function buildMutantGuard() {
  let src = readFileSync(GUARD, "utf8");
  const libUrl = pathToFileURL(join(GUARD, "..", "..", "lib")).href;
  src = src.replaceAll('from "../lib/', `from "${libUrl}/`);
  const anchor = "function win32CounterLockOwnerState(record, dependencies = {}) {";
  assert.ok(src.includes(anchor), "mutation anchor missing: the win32 owner-state function was renamed; update the RED mirror");
  src = src.replace(anchor, `${anchor}\n  return "ambiguous";`);
  const path = join(FIXTURE, "guard-dispatch-budget.mutant.mjs");
  writeFileSync(path, src);
  return path;
}

test("RED mirror: a mutant lock module without win32 owner identity FAILS the AC1b/AC1c/AC1d expectations that the real module meets", () => {
  const mutant = buildMutantGuard();
  const ac1b = (r) => r.status === "acquired" && r.recovered === true;
  const realB = lockRun({ platform: "win32", forge: { bootOffset: -100000 } });
  assert.ok(ac1b(realB), "control: the real module meets the AC1b expectation");
  const mutB = lockRun({ platform: "win32", forge: { bootOffset: -100000 } }, mutant);
  assert.equal(ac1b(mutB), false, `mutant must break AC1b (dead owner recovered), got ${mutB.status}/${mutB.code}`);
  assert.equal(mutB.code, "counter-lock-owner-ambiguous");
  const mutC = lockRun({ platform: "win32", forge: { self: true } }, mutant);
  assert.notEqual(mutC.status, "acquired", "mutant must break AC1c (pid reuse recovered)");
  const mutD = lockRun({ platform: "win32", forge: {}, killMode: "alive" }, mutant);
  assert.notEqual(mutD.code, "counter-lock-busy", "mutant must break AC1d (live foreign pid is busy)");
});

// ---- (2) budget-counted subagent through the real hook ----------------------------------------------
function hookFixture() {
  const root = join(FIXTURE, "hook-repo");
  mkdirSync(root, { recursive: true });
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  const plan = planGovernanceScopeDecision({ rootDir: root, decision: "enroll", by: "Dispatch budget lock pin fixture" });
  assert.equal(applyGovernanceScopeDecision(plan, { activate: true, planSha256: plan.planSha256 }).state, "active");
  assert.equal(observeGovernanceScope({ rootDir: root }).requiresEnforcement, true);
  const budgetDir = join(root, ".git", "agent-pipeline", "dispatch-budget");
  mkdirSync(budgetDir, { recursive: true });
  const agentId = "pin-windows-agent";
  const counterPath = join(budgetDir, `${agentId}.json`);
  writeFileSync(counterPath, `${JSON.stringify({
    schema: "pipeline.dispatch-budget-counter.v1", agentId, agentType: "pipeline-core:goldfish-implementor",
    maxTurns: 50, baseCalls: 35, workingCap: 35, count: 0,
  }, null, 2)}\n`);
  return { root, agentId, counterPath, lockPath: `${counterPath}.binding.lock` };
}

test("AC2: a budget-counted subagent runs Read, Write and Bash through the real hook; every call is admitted, counted once, and the lock is released", () => {
  const f = hookFixture();
  const calls = [
    ["Read", { file_path: join(f.root, "a.txt") }],
    ["Write", { file_path: join(f.root, "scratch", "b.txt"), content: "x" }],
    ["Bash", { command: "git status" }],
    ["Read", { file_path: join(f.root, "a.txt") }],
  ];
  calls.forEach(([tool_name, tool_input], index) => {
    const res = spawnSync(process.execPath, [GUARD], {
      cwd: f.root, encoding: "utf8", timeout: 60000,
      env: { ...process.env, CLAUDE_PROJECT_DIR: f.root },
      input: JSON.stringify({
        agent_id: f.agentId, agent_type: "pipeline-core:goldfish-implementor",
        transcript_path: join(f.root, "session.jsonl"), tool_name, tool_input,
      }),
    });
    assert.equal(res.status, 0, `${tool_name} call ${index + 1} refused (exit ${res.status}): ${(res.stderr ?? "").slice(0, 400)}`);
    assert.doesNotMatch(res.stderr ?? "", /counter-lock|DISPATCH-BUDGET-INPUT-INVALID/u, `${tool_name} surfaced a lock refusal`);
    assert.equal(JSON.parse(readFileSync(f.counterPath, "utf8")).count, index + 1, "counted exactly once per call");
    assert.equal(existsSync(f.lockPath), false, "lock released after the call");
  });
});

// ---- (3) briefing templates state the bootstrap-entry step -----------------------------------------
test("AC3: the Goldfish template states the entry step before the opening record/first write, and the Critic template names its bootstrap entry", () => {
  const goldfish = readFileSync(join(REPO_ROOT, "templates", "prompts", "goldfish-task.md"), "utf8");
  const step0 = goldfish.indexOf("**Step 0");
  assert.ok(step0 >= 0, "goldfish-task.md has no Step 0 entry paragraph");
  const body = goldfish.slice(step0, step0 + 1500);
  assert.match(body, /before the opening record or any other write/u);
  assert.match(body, /pipeline-core:pipeline-start/u);
  assert.match(body, /before the first Edit, Write or NotebookEdit/u);
  const critic = readFileSync(join(REPO_ROOT, "templates", "prompts", "critic-review.md"), "utf8");
  assert.match(critic, /use `pipeline-core:pipeline-start critic`/u);
});
