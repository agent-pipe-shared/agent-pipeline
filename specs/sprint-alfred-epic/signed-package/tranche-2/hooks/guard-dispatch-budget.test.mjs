// SPDX-License-Identifier: SUL-1.0
/**
 * guard-dispatch-budget.mjs -- hook-level suite.
 *
 * NOTE, deliberately absent: no module-scope `import { evaluateDispatchBudgetGuard, ... }
 * from "./guard-dispatch-budget.mjs"` here (pipeline.budget-guard-test-suite-silent-pass,
 * NVA-B-BUDGETGUARD-2). That shape was carried by this file until now, and is safe only
 * while the guard's top-level body stays behind its `isDirectInvocation(import.meta.url)`
 * gate (guard-dispatch-budget.mjs line ~532). If that gate ever regressed to running the
 * hook body unconditionally (reading stdin, calling process.exit), a module-scope import
 * would execute that body during module EVALUATION, before a single `test(...)` case ran --
 * and under `node --test`, a file that exits 0 having registered no test is reported as ONE
 * PASSING TEST, none of this file's own coverage having run. `guard-dispatch.test.mjs`
 * carried the identical hazard and no longer does (`e4aeb8fe`); this file follows the same
 * replacement pattern: a single reusable runner script, written to a temp file at module
 * load time, does the importing and calling in a CHILD process; this file itself never
 * imports guard-dispatch-budget.mjs. The runner never touches its own `process.stdin` (the
 * scenario travels via an argv-encoded payload instead), so if the guard's entrypoint gate
 * ever did regress, the child's stdin stays exactly as `spawnSync`'s `input: ""` left it --
 * empty. The runner's success marker prints only AFTER `await import(guardPath)` returns
 * control, so a module that exits SYNCHRONOUSLY during its own top-level evaluation never
 * reaches that line, and `run()` below treats the marker's absence as an explicit, loud test
 * failure -- never a silent pass. Measured for this exact suite in
 * `evidence/NVA-B-BUDGETGUARD-2-part-a-red-demo.txt` ("sync" class).
 *
 * That measurement also found a narrower gap, honestly disclosed rather than papered over: a
 * DEFERRED exit (stdin listeners attached, `process.exit` called from the 'end' callback --
 * what deleting the isDirectInvocation() gate below would actually produce) is NOT caught by
 * this mechanism. `await import(...)` resolves as a microtask before the stdin 'end' callback
 * (a later I/O-phase macrotask) ever runs, so the marker still prints. The same evidence file's
 * "async" class shows this is not a NEW silent-pass hazard either -- the old module-scope-import
 * shape did not silently pass against it (it exited non-zero with no summary). Positive coverage
 * of the isDirectInvocation() gate itself remains a follow-up, not attempted here.
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { planGovernanceScopeDecision, applyGovernanceScopeDecision, observeGovernanceScope } from "../lib/governance-scope.mjs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const GUARD = fileURLToPath(new URL("./guard-dispatch-budget.mjs", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const SCRATCH_ROOT = join(REPO_ROOT, "scratch");
function activeGovernanceRoot(prefix) {
  const root = mkdtempSync(join(SCRATCH_ROOT, `guard-budget-active-${prefix}-`));
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  const plan = planGovernanceScopeDecision({ rootDir: root, decision: "enroll", by: "Dispatch budget fixture" });
  assert.equal(applyGovernanceScopeDecision(plan, { activate: true, planSha256: plan.planSha256 }).state, "active");
  assert.equal(observeGovernanceScope({ rootDir: root }).requiresEnforcement, true);
  return root;
}
const FAKE_ROOT = activeGovernanceRoot("guard");
const ENV_ROOT = activeGovernanceRoot("env");
const SUBAGENT_TRANSCRIPT = "/fake/session/subagents/agent-abc123.jsonl";
const META_PATH = "/fake/session/subagents/agent-abc123.meta.json";
const ORCHESTRATOR_TRANSCRIPT = "/fake/session/top-level.jsonl";
const COMMON_DIR = "/fake/.git";
const COUNTER_PATH = `${COMMON_DIR}/agent-pipeline/dispatch-budget/abc123.json`;
const PARENT_META_PATH = "/fake/session/parent/subagents/agent-abc123.meta.json";
const pendingBindingPath = (toolUseId) => `${COMMON_DIR}/agent-pipeline/dispatch-budget/pending/${createHash("sha256").update(toolUseId).digest("hex")}.json`;
const pendingBinding = ({ toolUseId = "parent-tool-1", baseCalls, maxTurns = 50, effectiveCap }) => `${JSON.stringify({
  schema: "pipeline.pending-dispatch-budget-binding.v1",
  toolUseIdSha256: createHash("sha256").update(toolUseId).digest("hex"),
  bindings: [{ agentType: "goldfish-implementor", baseCalls, maxTurns, effectiveCap }],
})}\n`;

const agentDefPath = (name) => `${FAKE_ROOT}/plugins/pipeline-core/agents/${name}.md`;
const AGENT_DEF_PATH = agentDefPath("goldfish-deep");

// The runner is written once, to a temp file, and reused (spawned fresh) by every test
// below -- it is a child-process helper, never a same-process import of the guard.
const RUNNER_SOURCE = [
  "import { pathToFileURL } from 'node:url';",
  "const [, , guardPath, scenarioB64] = process.argv;",
  "const scenario = JSON.parse(Buffer.from(scenarioB64, 'base64').toString('utf8'));",
  "",
  "// The in-memory fs doubles are keyed by the POSIX literals this suite seeds ('/fake/...'), while the",
  "// guard builds its keys with the host's node:path join/dirname -- backslash-separated on win32. Every",
  "// double, the seeding and the inspection ops therefore go through canon(), which maps a key to one",
  "// separator form so a lookup matches whichever separator built it. On any other platform canon is the",
  "// identity function, so POSIX behaviour is unchanged by construction.",
  "const canon = process.platform === 'win32' ? (p) => String(p).replaceAll('\\\\', '/') : (p) => p;",
  "const files = new Map(Object.entries(scenario.files || {}).map(([k, v]) => [canon(k), v]));",
  "const existsSyncFn = (p) => files.has(canon(p));",
  "const readFileSyncFn = (p) => {",
  "  if (!files.has(canon(p))) { const e = new Error('ENOENT ' + p); e.code = 'ENOENT'; throw e; }",
  "  return files.get(canon(p));",
  "};",
  "let writeCount = 0;",
  "let writeMode = 'normal';",
  "const writeFileSyncFn = (p, c) => {",
  "  if (writeMode === 'throw') throw new Error('disk full');",
  "  if (writeMode === 'partial-throw') { files.set(canon(p), 'partial'); throw new Error('ENOSPC'); }",
  "  if (writeMode === 'count') writeCount += 1;",
  "  files.set(canon(p), c);",
  "};",
  "const mkdirSyncFn = () => {};",
  "const appendFileSyncFn = (p, c) => { files.set(canon(p), (files.get(canon(p)) || '') + c); };",
  "const linkSyncFn = (from, to) => { if (files.has(canon(to))) { const e = new Error('EEXIST ' + to); e.code = 'EEXIST'; throw e; } if (!files.has(canon(from))) { const e = new Error('ENOENT ' + from); e.code = 'ENOENT'; throw e; } files.set(canon(to), files.get(canon(from))); };",
  "const unlinkSyncFn = (p) => { files.delete(canon(p)); };",
  "",
  "const mod = await import(pathToFileURL(guardPath).href);",
  "",
  "const commonDirCalls = [];",
  "const hasCommonDir = Object.prototype.hasOwnProperty.call(scenario, 'commonDir');",
  "const commonDirValue = hasCommonDir ? scenario.commonDir : '/fake/.git';",
  "const resolveGitCommonDirFn = (dir) => { commonDirCalls.push(dir); return commonDirValue; };",
  "",
  "const nowFn = () => scenario.nowIso || '2026-08-27T00:00:00.000Z';",
  "",
  "const fakePluginRoot = () => scenario.rootDir + '/plugins/pipeline-core';",
  "function baseOpts() {",
  "  const o = { pluginRoot: scenario.rootDir ? fakePluginRoot() : undefined, resolveGitCommonDirFn,nowFn, existsSyncFn, readFileSyncFn, writeFileSyncFn, mkdirSyncFn, appendFileSyncFn, linkSyncFn, unlinkSyncFn,",
  "    acquireDispatchBudgetCounterLockFn: (path) => ({ status: 'acquired', lock: { path } }),",
  "    releaseDispatchBudgetCounterLockFn: () => true,",
  "  };",
  "  if (!scenario.realBudgetBinding) o.dispatchBudgetContractForRoleFn = (agentType) => ({ applicable: false, role: agentType });",
  "  if (!scenario.rootDirAbsent) o.rootDir = scenario.rootDir;",
  "  return o;",
  "}",
  "",
  "const results = [];",
  "let realLock = null;",
  "for (const step of (scenario.steps || [])) {",
  "  if (step.op === 'guard') {",
  "    const r = mod.evaluateDispatchBudgetGuard(step.input, baseOpts());",
  "    results.push({ exitCode: r.exitCode, stderr: r.stderr });",
  "  } else if (step.op === 'identity') {",
  "    results.push(mod.subagentIdentity(step.input, { existsSyncFn, readFileSyncFn, pluginRoot: scenario.rootDir ? fakePluginRoot() : undefined }));",
  "  } else if (step.op === 'maxTurns') {",
  "    results.push(mod.resolveMaxTurns(step.agentType, step.rootDir, { pluginRoot: step.rootDir + '/plugins/pipeline-core' }));",
  "  } else if (step.op === 'commonDirReal') {",
  "    results.push(mod.resolveGitCommonDir(step.rootDir));",
  "  } else if (step.op === 'setWriteMode') {",
  "    writeMode = step.mode;",
  "    results.push(null);",
  "  } else if (step.op === 'getWriteCount') {",
  "    results.push(writeCount);",
  "  } else if (step.op === 'getFile') {",
  "    results.push(files.has(canon(step.path)) ? files.get(canon(step.path)) : null);",
  "  } else if (step.op === 'getFilesByPrefix') {",
  "    results.push(Array.from(files.entries()).filter(([p]) => p.startsWith(canon(step.prefix))));",
  "  } else if (step.op === 'listFiles') {",
  "    results.push(Array.from(files.keys()));",
  "  } else if (step.op === 'filesSize') {",
  "    results.push(files.size);",
  "  } else if (step.op === 'constants') {",
  "    results.push({ DENIAL_CODE: mod.DENIAL_CODE, CLOSING_ALLOWANCE: mod.CLOSING_ALLOWANCE, SAFETY_MARGIN: mod.SAFETY_MARGIN });",
  "  } else if (step.op === 'acquireRealLock') {",
  "    const r = mod.acquireDispatchBudgetCounterLock(step.path);",
  "    if (r.status === 'acquired') realLock = r.lock;",
  "    results.push({ status: r.status, code: r.code || null, recovered: r.recovered || false });",
  "  } else if (step.op === 'releaseRealLock') {",
  "    results.push(mod.releaseDispatchBudgetCounterLock(realLock));",
  "    realLock = null;",
  "  } else {",
  "    throw new Error('unknown op ' + step.op);",
  "  }",
  "}",
  "",
  "console.log('BUDGETRUN-OK');",
  "console.log('RESULT: ' + JSON.stringify({ results, commonDirCalls }));",
].join("\n");


mkdirSync(SCRATCH_ROOT, { recursive: true });
const runnerDir = activeGovernanceRoot("runner");
const RUNNER_PATH = join(runnerDir, "runner.mjs");
writeFileSync(RUNNER_PATH, RUNNER_SOURCE);
const PARALLEL_COUNTER_RUNNER_PATH = join(runnerDir, "parallel-counter-runner.mjs");
writeFileSync(PARALLEL_COUNTER_RUNNER_PATH, [
  "import { pathToFileURL } from 'node:url';",
  "const [, , guardPath, configB64] = process.argv;",
  "const { commonDir, counterPath, rootDir } = JSON.parse(Buffer.from(configB64, 'base64').toString('utf8'));",
  "const { evaluateDispatchBudgetGuard } = await import(pathToFileURL(guardPath).href);",
  "const input = { agent_id: 'parallel-agent', agent_type: 'pipeline-core:goldfish-implementor', transcript_path: '/unused.jsonl', tool_name: 'Read', tool_input: { file_path: '/x' } };",
  "let result;",
  "for (let attempt = 0; attempt < 1000; attempt += 1) {",
  "  result = evaluateDispatchBudgetGuard(input, { rootDir, resolveGitCommonDirFn: () => commonDir, resolveMaxTurnsFn: () => 50 });",
  "  if (result.exitCode === 0) break;",
  "  if (!result.stderr.includes('counter-lock-busy') && !result.stderr.includes('counter-lock-recovery-busy')) break;",
  "  await new Promise((resolve) => setTimeout(resolve, 2));",
  "}",
  "console.log(JSON.stringify({ exitCode: result.exitCode, stderr: result.stderr }));",
].join("\n"));
process.on("exit", () => { for (const root of [runnerDir, FAKE_ROOT, ENV_ROOT]) { try { rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ } } });

// Hang-detector bound for ONE runner child (it executes a whole scenario of sequential guard calls). 10 s is
// ample where a guard call costs milliseconds. On win32 every guard call spends ~170 ms inside
// observeGovernanceScope (measured 2026-10-07, R7-11-W2: 26 timed calls, 161-245 ms each), so the 50- and
// 60-call scenarios legitimately need ~9-11 s; the bound is widened there only. Other platforms keep 10 s.
const RUNNER_TIMEOUT_MS = process.platform === "win32" ? 60000 : 10000;

/** Spawns the runner against the REAL guard module and returns its parsed RESULT payload. Fails loudly (never silently) if the child does not print the success marker -- see the file-top NOTE for why. */
function run(scenario, spawnOverrides = {}) {
  const b64 = Buffer.from(JSON.stringify(scenario), "utf8").toString("base64");
  const res = spawnSync(process.execPath, [RUNNER_PATH, GUARD, b64], { input: "", encoding: "utf8", timeout: RUNNER_TIMEOUT_MS, ...spawnOverrides });
  const stdout = res.stdout ?? "";
  const stderr = res.stderr ?? "";
  assert.equal(res.status, 0, `runner child exited ${res.status} (expected 0) -- stderr: ${stderr.trim().slice(0, 500)}`);
  assert.ok(stdout.includes("BUDGETRUN-OK"), `runner did not print the success marker BUDGETRUN-OK -- stdout ${JSON.stringify(stdout)} stderr ${JSON.stringify(stderr)}`);
  const line = stdout.split("\n").find((l) => l.startsWith("RESULT: "));
  assert.ok(line, `runner did not print a RESULT line -- stdout ${JSON.stringify(stdout)}`);
  return JSON.parse(line.slice("RESULT: ".length));
}

function seedSubagentFiles(maxTurns = 20) {
  return {
    [META_PATH]: JSON.stringify({ agentType: "pipeline-core:goldfish-deep", description: "x", toolUseId: "t1", spawnDepth: 1 }),
    [AGENT_DEF_PATH]: `---\nname: goldfish-deep\nmodel: sonnet\nmaxTurns: ${maxTurns}\ntools: Read\n---\nbody\n`,
  };
}

// NVA-B-BUDGETGUARD-2: a subagent call now needs agent_id (and agent_type, for maxTurns
// resolution) directly on the payload -- transcript_path is no longer read by this guard's
// own identity step at all, though it is kept here for realism/logging.
function readInputObj(tool_input, agentType = "pipeline-core:goldfish-deep") {
  return { transcript_path: SUBAGENT_TRANSCRIPT, tool_name: "Read", tool_input, agent_id: "abc123", agent_type: agentType };
}

function orchestratorInputObj(tool_input = { file_path: "/x" }) {
  return { transcript_path: ORCHESTRATOR_TRANSCRIPT, tool_name: "Read", tool_input };
}

test("subagentIdentity: transcript_path under a subagents/ directory with valid meta.json resolves as a dispatched subagent", () => {
  const { results } = run({
    files: { [META_PATH]: JSON.stringify({ agentType: "pipeline-core:goldfish-deep", description: "x", toolUseId: "t1", spawnDepth: 1 }) },
    steps: [{ op: "identity", input: { transcript_path: SUBAGENT_TRANSCRIPT } }],
  });
  assert.equal(results[0].kind, "subagent");
  assert.equal(results[0].agentId, "abc123");
  assert.equal(results[0].agentType, "pipeline-core:goldfish-deep");
});

test("subagentIdentity: transcript_path NOT under a subagents/ directory resolves as the orchestrator", () => {
  const { results } = run({ steps: [{ op: "identity", input: { transcript_path: "/fake/session/top-level.jsonl" } }] });
  assert.equal(results[0].kind, "orchestrator");
});

test("subagentIdentity: missing transcript_path is unresolved (ambiguous), not orchestrator", () => {
  const { results } = run({ steps: [
    { op: "identity", input: {} },
    { op: "identity", input: { transcript_path: "" } },
  ] });
  assert.equal(results[0].kind, "unresolved");
  assert.equal(results[1].kind, "unresolved");
});

test("subagentIdentity: a present but relative transcript_path is a distinct kind, never merged into 'unresolved'", () => {
  const { results } = run({ steps: [{ op: "identity", input: { transcript_path: "relative/session/subagents/agent-x.jsonl" } }] });
  assert.notEqual(results[0].kind, "unresolved");
  assert.notEqual(results[0].kind, "orchestrator");
  assert.equal(results[0].kind, "invalid-identity");
  assert.equal(results[0].reason, "transcript-path-present-but-not-absolute");
});

test("subagentIdentity: a present but non-string, non-null transcript_path is invalid-identity, not unresolved", () => {
  const { results } = run({ steps: [{ op: "identity", input: { transcript_path: 12345 } }] });
  assert.equal(results[0].kind, "invalid-identity");
});

test("subagentIdentity: a null transcript_path is unresolved (treated as absent), not invalid-identity", () => {
  const { results } = run({ steps: [{ op: "identity", input: { transcript_path: null } }] });
  assert.equal(results[0].kind, "unresolved");
  assert.equal(results[0].reason, "transcript-path-missing-or-relative");
});

test("evaluateDispatchBudgetGuard (NVA-B-BUDGETGUARD-2): a payload without agent_id is the orchestrator to this guard regardless of its transcript_path shape -- exit 0", () => {
  const { results } = run({
    rootDir: FAKE_ROOT,
    steps: [{ op: "guard", input: { transcript_path: "relative/session/subagents/agent-x.jsonl", tool_name: "Read", tool_input: { file_path: "/x" } } }],
  });
  assert.equal(results[0].exitCode, 0);
});

test("evaluateDispatchBudgetGuard (NVA-B-BUDGETGUARD-2): a payload without agent_id writes no counter and no unresolved.jsonl -- it is the orchestrator to this guard, full stop, whatever its transcript_path looks like", () => {
  const { results } = run({
    rootDir: FAKE_ROOT,
    steps: [
      { op: "guard", input: { transcript_path: "relative/session/subagents/agent-x.jsonl", tool_name: "Read", tool_input: { file_path: "/x" } } },
      { op: "getFilesByPrefix", prefix: `${COMMON_DIR}/agent-pipeline/dispatch-budget/unresolved-observations/` },
      { op: "listFiles" },
    ],
  });
  assert.equal(results[0].exitCode, 0);
  assert.deepEqual(results[1], [], "no agent_id means this guard's own identity step never inspects transcript_path at all, so no unresolved observation is written for this call");
  const counterFiles = results[2].filter((p) => p.includes("/dispatch-budget/") && !p.includes("orchestrator-seen") && !p.includes("unresolved-observations"));
  assert.deepEqual(counterFiles, [], "no per-agent counter file is written for a payload with no agent_id");
});

test("subagentIdentity: missing sibling meta.json is unresolved", () => {
  const { results } = run({ steps: [{ op: "identity", input: { transcript_path: SUBAGENT_TRANSCRIPT } }] });
  assert.equal(results[0].kind, "unresolved");
  assert.equal(results[0].reason, "meta-file-missing");
});

test("subagentIdentity: spawnDepth that is not a number >= 1 is unresolved, never force-fit", () => {
  const { results } = run({
    files: { [META_PATH]: JSON.stringify({ agentType: "pipeline-core:goldfish-deep", spawnDepth: 0 }) },
    steps: [{ op: "identity", input: { transcript_path: SUBAGENT_TRANSCRIPT } }],
  });
  assert.equal(results[0].reason, "spawn-depth-not-a-dispatch");
});

test("resolveMaxTurns: reads the live maxTurns value out of a real agent definition's frontmatter (no mocking)", () => {
  const { results } = run({ steps: [{ op: "maxTurns", agentType: "pipeline-core:goldfish-deep", rootDir: REPO_ROOT }] });
  assert.equal(typeof results[0], "number");
  assert.ok(results[0] > 0);
});

test("resolveMaxTurns: unknown agent name resolves null rather than throwing", () => {
  const { results } = run({ steps: [{ op: "maxTurns", agentType: "pipeline-core:not-a-real-agent", rootDir: REPO_ROOT }] });
  assert.equal(results[0], null);
});

test("resolveGitCommonDir: resolves a real .git directory in this checkout (no mocking)", () => {
  const { results } = run({ steps: [{ op: "commonDirReal", rootDir: REPO_ROOT }] });
  assert.equal(typeof results[0], "string");
  assert.ok(results[0].endsWith(".git"));
});

test("evaluateDispatchBudgetGuard: counts across calls, allowing every call up to the working cap", () => {
  const steps = [];
  for (let i = 1; i <= 5; i += 1) steps.push({ op: "guard", input: readInputObj({ file_path: "/x" }) });
  steps.push({ op: "getFile", path: `${COMMON_DIR}/agent-pipeline/dispatch-budget/abc123.json` });
  const { results } = run({ rootDir: FAKE_ROOT, files: seedSubagentFiles(20), steps }); // workingCap = 20 - (5 + 10) = 5
  for (let i = 0; i < 5; i += 1) assert.equal(results[i].exitCode, 0, `call ${i + 1} should be allowed`);
  const counterRaw = results[5];
  assert.ok(counterRaw, "a counter file must exist after calls");
  assert.equal(JSON.parse(counterRaw).count, 5);
});

test("evaluateDispatchBudgetGuard: refuses a non-closing working call once the cap is crossed", () => {
  const steps = [{ op: "constants" }];
  for (let i = 1; i <= 6; i += 1) steps.push({ op: "guard", input: readInputObj({ file_path: "/x" }) });
  const { results } = run({ rootDir: FAKE_ROOT, files: seedSubagentFiles(20), steps }); // workingCap = 5
  const { DENIAL_CODE } = results[0];
  assert.equal(results[6].exitCode, 2);
  assert.match(results[6].stderr, new RegExp(DENIAL_CODE));
  assert.match(results[6].stderr, /The working budget is exhausted; 4 closing-call slots remain\./u);
  assert.match(results[6].stderr, /Within that remaining allowance, only these acts are permitted:/u);
  assert.doesNotMatch(results[6].stderr, /No further tool calls are permitted/u);
});

test("evaluateDispatchBudgetGuard: malformed persisted counts fail closed without being reset or overwritten", () => {
  for (const rawCounter of [
    JSON.stringify({ schema: "pipeline.dispatch-budget-counter.v1", count: -1 }),
    JSON.stringify({ schema: "pipeline.dispatch-budget-counter.v1", count: 1.5 }),
    JSON.stringify({ schema: "pipeline.dispatch-budget-counter.v1", count: "4" }),
    "{not-json",
  ]) {
    const { results } = run({
      rootDir: FAKE_ROOT,
      files: { ...seedSubagentFiles(20), [COUNTER_PATH]: rawCounter },
      steps: [
        { op: "guard", input: readInputObj({ file_path: "/x" }) },
        { op: "getFile", path: COUNTER_PATH },
      ],
    });
    assert.equal(results[0].exitCode, 2);
    assert.match(results[0].stderr, /DISPATCH-BUDGET-INPUT-INVALID/u);
    assert.equal(results[1], rawCounter, "invalid persisted evidence must remain intact and must not grant a fresh budget");
  }
});

test("evaluateDispatchBudgetGuard: each permitted closing act still passes after the cap", () => {
  const steps = [];
  for (let i = 1; i <= 5; i += 1) steps.push({ op: "guard", input: readInputObj({ file_path: "/x" }) }); // workingCap = 5
  const AGENT_ID_FIELDS = { agent_id: "abc123", agent_type: "pipeline-core:goldfish-deep" };
  steps.push({ op: "guard", input: { transcript_path: SUBAGENT_TRANSCRIPT, tool_name: "Write", tool_input: { file_path: `${FAKE_ROOT}/evidence/dispatch-record-NVA-BUDGETGUARD-1.json`, content: "{}" }, ...AGENT_ID_FIELDS } });
  steps.push({ op: "guard", input: { transcript_path: SUBAGENT_TRANSCRIPT, tool_name: "Bash", tool_input: { command: "git add -- evidence/x.json" }, ...AGENT_ID_FIELDS } });
  steps.push({ op: "guard", input: { transcript_path: SUBAGENT_TRANSCRIPT, tool_name: "Bash", tool_input: { command: "git commit -F m.txt -- evidence/x.json" }, ...AGENT_ID_FIELDS } });
  steps.push({ op: "guard", input: { transcript_path: SUBAGENT_TRANSCRIPT, tool_name: "Edit", tool_input: { file_path: `${FAKE_ROOT}/lib/x.mjs`, old_string: "a", new_string: "b" }, ...AGENT_ID_FIELDS } });
  const { results } = run({ rootDir: FAKE_ROOT, files: seedSubagentFiles(20), steps });
  assert.equal(results[5].exitCode, 0, "dispatch-record write");
  assert.equal(results[6].exitCode, 0, "git add");
  assert.equal(results[7].exitCode, 0, "git commit");
  assert.equal(results[8].exitCode, 2, "a differently-shaped call after the same cap is still refused");
});

test("evaluateDispatchBudgetGuard: exactly five post-cap closing calls pass and the sixth is denied", () => {
  const closingInput = {
    transcript_path: SUBAGENT_TRANSCRIPT,
    agent_id: "abc123",
    agent_type: "pipeline-core:goldfish-deep",
    tool_name: "Write",
    tool_input: { file_path: `${FAKE_ROOT}/evidence/dispatch-record-CLOSING-BOUNDARY.json`, content: "{}" },
  };
  const steps = [];
  for (let count = 1; count <= 5; count += 1) steps.push({ op: "guard", input: readInputObj({ file_path: "/x" }) });
  for (let count = 1; count <= 6; count += 1) {
    steps.push({ op: "guard", input: closingInput });
    steps.push({ op: "getFile", path: COUNTER_PATH });
  }
  steps.push({ op: "guard", input: { ...closingInput, tool_name: "Bash", tool_input: { command: "git add -- evidence/x.json" } } });
  steps.push({ op: "getFile", path: COUNTER_PATH });
  const { results } = run({ rootDir: FAKE_ROOT, files: seedSubagentFiles(20), steps });
  for (let index = 0; index < 5; index += 1) assert.equal(results[index].exitCode, 0);
  for (let ordinal = 1; ordinal <= 6; ordinal += 1) {
    const index = 5 + (ordinal - 1) * 2;
    assert.equal(results[index].exitCode, ordinal <= 5 ? 0 : 2, `closing attempt ${ordinal}`);
    assert.equal(JSON.parse(results[index + 1]).count, 5 + ordinal, "every attempt must remain counted");
    if (ordinal <= 5) assert.equal(results[index].stderr, "");
  }
  for (const index of [15, 17]) {
    assert.equal(results[index].exitCode, 2, "changing closing shape cannot renew the allowance");
    assert.match(results[index].stderr, /DISPATCH-BUDGET-EXHAUSTED/u);
    assert.match(results[index].stderr, /The closing allowance of 5 tool calls is exhausted\./u);
    assert.match(results[index].stderr, /No further tool calls are permitted for this dispatch\./u);
    assert.match(results[index].stderr, /Emit the closing report without another tool call\./u);
    assert.doesNotMatch(results[index].stderr, /slots remain|these acts.*permitted|git add|git commit|write\/update/u);
  }
  assert.equal(JSON.parse(results[18]).count, 12);
});

test("evaluateDispatchBudgetGuard: a denied work attempt consuming the final slot reports closing exhaustion", () => {
  const steps = [];
  for (let count = 1; count <= 10; count += 1) steps.push({ op: "guard", input: readInputObj({ file_path: "/x" }) });
  steps.push({ op: "getFile", path: COUNTER_PATH });
  const { results } = run({ rootDir: FAKE_ROOT, files: seedSubagentFiles(20), steps });
  assert.equal(results[8].exitCode, 2);
  assert.match(results[8].stderr, /1 closing-call slot remains\./u);
  assert.equal(results[9].exitCode, 2);
  assert.match(results[9].stderr, /The closing allowance of 5 tool calls is exhausted\./u);
  assert.doesNotMatch(results[9].stderr, /slots remain|these acts.*permitted/u);
  assert.equal(JSON.parse(results[10]).count, 10);
});

test("evaluateDispatchBudgetGuard: the orchestrating session is never limited, however many calls it makes", () => {
  const steps = [];
  for (let i = 1; i <= 50; i += 1) steps.push({ op: "guard", input: orchestratorInputObj() });
  steps.push({ op: "listFiles" });
  const { results } = run({ rootDir: FAKE_ROOT, steps });
  for (let i = 0; i < 50; i += 1) assert.equal(results[i].exitCode, 0, `orchestrator call ${i + 1} must never be blocked`);
  const allFiles = results[50];
  const counterOrUnresolvedFiles = allFiles.filter(
    (p) => p.endsWith("unresolved.jsonl") || (p.includes("/dispatch-budget/") && !p.includes("orchestrator-seen")),
  );
  assert.deepEqual(counterOrUnresolvedFiles, [], "no counter or unresolved.jsonl state should ever be written for the orchestrator");
});

test("evaluateDispatchBudgetGuard: the orchestrator branch records exactly one bounded observation for its session (NVA-BUDGETROOT-1)", () => {
  const markerPath = `${COMMON_DIR}/agent-pipeline/dispatch-budget/orchestrator-seen/top-level.json`;
  const { results } = run({ rootDir: FAKE_ROOT, steps: [{ op: "guard", input: orchestratorInputObj() }, { op: "getFile", path: markerPath }] });
  assert.equal(results[0].exitCode, 0);
  const raw = results[1];
  assert.ok(raw, "an orchestrator observation marker must exist");
  const record = JSON.parse(raw.trim());
  assert.equal(record.branch, "orchestrator");
  assert.equal(record.root, FAKE_ROOT);
  assert.equal(record.commonDir, COMMON_DIR);
  assert.equal(record.transcriptPath, ORCHESTRATOR_TRANSCRIPT);
  assert.equal(record.at, "2026-08-27T00:00:00.000Z");
});

test("evaluateDispatchBudgetGuard: the orchestrator observation sink is bounded -- one write per session, not one per call", () => {
  const steps = [];
  for (let i = 1; i <= 30; i += 1) steps.push({ op: "guard", input: orchestratorInputObj() });
  steps.push({ op: "setWriteMode", mode: "count" });
  for (let i = 1; i <= 30; i += 1) steps.push({ op: "guard", input: orchestratorInputObj() });
  steps.push({ op: "getWriteCount" });
  const { results } = run({ rootDir: FAKE_ROOT, steps });
  assert.equal(results[results.length - 1], 0, "once the marker exists for this session, no further write should ever occur");
});

test("evaluateDispatchBudgetGuard: rootDir precedence -- assert the actual resolveGitCommonDirFn argument in all three precedence cases", () => {
  const withRootDir = run(
    { rootDir: FAKE_ROOT, files: seedSubagentFiles(), steps: [{ op: "guard", input: readInputObj({}) }] },
    { env: { ...process.env, CLAUDE_PROJECT_DIR: ENV_ROOT }, cwd: runnerDir },
  );
  assert.deepEqual(withRootDir.commonDirCalls, [FAKE_ROOT], "options.rootDir must win over CLAUDE_PROJECT_DIR and process.cwd()");

  const envOnly = run(
    { rootDirAbsent: true, files: seedSubagentFiles(), steps: [{ op: "guard", input: readInputObj({}) }] },
    { env: { ...process.env, CLAUDE_PROJECT_DIR: ENV_ROOT }, cwd: runnerDir },
  );
  assert.deepEqual(envOnly.commonDirCalls, [ENV_ROOT], "CLAUDE_PROJECT_DIR must win over process.cwd() when no options.rootDir override is given");

  const { CLAUDE_PROJECT_DIR: _drop, ...envWithoutVar } = process.env;
  const cwdFallback = run(
    { rootDirAbsent: true, files: seedSubagentFiles(), steps: [{ op: "guard", input: readInputObj({}) }] },
    { env: envWithoutVar, cwd: runnerDir },
  );
  assert.deepEqual(cwdFallback.commonDirCalls, [runnerDir], "process.cwd() must be used when neither options.rootDir nor CLAUDE_PROJECT_DIR are set");
});

test("evaluateDispatchBudgetGuard: a null git common dir is observed on stderr, and the allow verdict is unchanged", () => {
  const { results } = run({ rootDir: FAKE_ROOT, commonDir: null, files: seedSubagentFiles(), steps: [{ op: "guard", input: readInputObj({ file_path: "/x" }) }] });
  assert.equal(results[0].exitCode, 0);
  assert.match(results[0].stderr, /common-dir-unresolved/);
  assert.match(results[0].stderr, /"identityKind":"subagent"/);
});

test("evaluateDispatchBudgetGuard: orchestrator with an unresolvable common dir is still allowed, observed via stderr only, and persists nothing", () => {
  const { results } = run({ rootDir: FAKE_ROOT, commonDir: null, steps: [{ op: "guard", input: orchestratorInputObj({}) }, { op: "filesSize" }] });
  assert.equal(results[0].exitCode, 0);
  assert.match(results[0].stderr, /common-dir-unresolved/);
  assert.equal(results[1], 0, "nothing should be persisted when there is nowhere safe to persist it");
});

test("evaluateDispatchBudgetGuard: a write failure in the new orchestrator observation sink never changes the allow verdict", () => {
  const { results } = run({ rootDir: FAKE_ROOT, steps: [{ op: "setWriteMode", mode: "throw" }, { op: "guard", input: orchestratorInputObj({}) }] });
  assert.equal(results[1].exitCode, 0);
});

test("evaluateDispatchBudgetGuard (NVA-B-BUDGETGUARD-2): a subagents/-shaped transcript_path with no agent_id is still the orchestrator to this guard -- transcript_path shape is no longer read at all for this guard's own identity step", () => {
  const { results } = run({
    rootDir: FAKE_ROOT, // subagents/-shaped transcript_path, deliberately no agent_id, no meta.json seeded
    steps: [
      { op: "guard", input: { transcript_path: SUBAGENT_TRANSCRIPT, tool_name: "Read", tool_input: { file_path: "/x" } } },
      { op: "getFilesByPrefix", prefix: `${COMMON_DIR}/agent-pipeline/dispatch-budget/unresolved-observations/` },
    ],
  });
  assert.equal(results[0].exitCode, 0);
  assert.deepEqual(results[1], [], "no unresolved observation is written -- a payload with no agent_id is simply the orchestrator now, regardless of transcript_path shape");
});

test("evaluateDispatchBudgetGuard (NVA-B-BUDGETGUARD-2): an unresolvable maxTurns (unknown agent_type carried directly on the payload) still allows and records", () => {
  const { results } = run({
    rootDir: FAKE_ROOT,
    steps: [
      { op: "guard", input: { agent_id: "abc123", agent_type: "pipeline-core:not-a-real-agent", tool_name: "Read", tool_input: { file_path: "/x" } } },
      { op: "getFilesByPrefix", prefix: `${COMMON_DIR}/agent-pipeline/dispatch-budget/unresolved-observations/` },
    ],
  });
  assert.equal(results[0].exitCode, 0);
  assert.equal(results[1].length, 1);
  const record = JSON.parse(results[1][0][1]);
  assert.equal(record.reason, "max-turns-unresolvable");
  assert.equal(record.agentId, "abc123");
  assert.equal(record.agentType, "pipeline-core:not-a-real-agent");
});

// NVA-B-BUDGETGUARD-2 -- both live-measured PreToolUse payload key sets
// (backlog/evidence/2026-09-06-dispatch-budget-guard-discriminator-measured.md), pinned as
// fixtures so a future regression back to guessing a transcript_path shape fails a test here
// instead of silently reintroducing a discriminator no real payload satisfies.
const ORCHESTRATOR_PAYLOAD_KEYS = ["cwd", "effort", "hook_event_name", "permission_mode", "prompt_id", "scratchpad_dir", "session_id", "tool_input", "tool_name", "tool_use_id", "transcript_path"];
const SUBAGENT_PAYLOAD_KEYS = [...ORCHESTRATOR_PAYLOAD_KEYS, "agent_id", "agent_type"];

function measuredOrchestratorPayload(overrides = {}) {
  return {
    cwd: "/fake/cwd", effort: "xhigh", hook_event_name: "PreToolUse", permission_mode: "default",
    prompt_id: "p1", scratchpad_dir: "/fake/scratch", session_id: "sess-1",
    tool_input: { file_path: "/x" }, tool_name: "Read", tool_use_id: "tu-1",
    transcript_path: "/fake/session/parent.jsonl",
    ...overrides,
  };
}

function measuredSubagentPayload(overrides = {}) {
  return { ...measuredOrchestratorPayload(), agent_id: "abc123", agent_type: "pipeline-core:goldfish-deep", ...overrides };
}

function boundImplementorFiles(baseCalls, effectiveCap) {
  const toolUseId = "parent-tool-1";
  return {
    [agentDefPath("goldfish-implementor")]: "---\nname: goldfish-implementor\nmaxTurns: 50\n---\n",
    [PARENT_META_PATH]: JSON.stringify({ agentType: "pipeline-core:goldfish-implementor", description: "x", toolUseId, spawnDepth: 1 }),
    [pendingBindingPath(toolUseId)]: pendingBinding({ toolUseId, baseCalls, effectiveCap }),
  };
}

test("a preflight-bound base cap of 20 denies the twenty-first authenticated child work call", () => {
  const input = measuredSubagentPayload({ agent_type: "pipeline-core:goldfish-implementor" });
  const steps = [
    { op: "guard", input },
    { op: "getFile", path: pendingBindingPath("parent-tool-1") },
    ...Array.from({ length: 20 }, () => ({ op: "guard", input })),
  ];
  const { results } = run({ rootDir: FAKE_ROOT, realBudgetBinding: true, files: boundImplementorFiles(20, 20), steps });
  assert.equal(results[1], null, "the first authenticated child call consumes its pending binding");
  assert.equal(results[0].exitCode, 0);
  assert.ok(results.slice(2, 21).every(({ exitCode }) => exitCode === 0));
  assert.equal(results[21].exitCode, 2);
  assert.match(results[21].stderr, /working cap of 20/u);
});

test("an altered pending record cannot overwrite an already-bound child counter", () => {
  const files = boundImplementorFiles(40, 35);
  files[COUNTER_PATH] = `${JSON.stringify({
    schema: "pipeline.dispatch-budget-counter.v1", agentId: "abc123",
    agentType: "pipeline-core:goldfish-implementor", maxTurns: 50,
    baseCalls: 20, workingCap: 20, count: 1,
  }, null, 2)}\n`;
  const { results } = run({
    rootDir: FAKE_ROOT,
    realBudgetBinding: true,
    files,
    steps: [
      { op: "guard", input: measuredSubagentPayload({ agent_type: "pipeline-core:goldfish-implementor" }) },
      { op: "getFile", path: COUNTER_PATH },
    ],
  });
  assert.equal(results[0].exitCode, 0);
  const counter = JSON.parse(results[1]);
  assert.equal(counter.baseCalls, 20);
  assert.equal(counter.workingCap, 20);
  assert.equal(counter.count, 2);
});

test("an implementor base cap of 40 is limited to the tier-safe cap of 35", () => {
  const input = measuredSubagentPayload({ agent_type: "pipeline-core:goldfish-implementor" });
  const steps = Array.from({ length: 36 }, () => ({ op: "guard", input }));
  const { results } = run({ rootDir: FAKE_ROOT, realBudgetBinding: true, files: boundImplementorFiles(40, 35), steps });
  assert.ok(results.slice(0, 35).every(({ exitCode }) => exitCode === 0));
  assert.equal(results[35].exitCode, 2);
  assert.match(results[35].stderr, /working cap of 35/u);
  assert.match(results[35].stderr, /min\(baseCalls=40, maxTurns=50/u);
});

test("a budget-bearing child with an attested parent tool id but no pending binding fails closed", () => {
  const files = boundImplementorFiles(20, 20);
  delete files[pendingBindingPath("parent-tool-1")];
  const { results } = run({
    rootDir: FAKE_ROOT,
    realBudgetBinding: true,
    files,
    steps: [{ op: "guard", input: measuredSubagentPayload({ agent_type: "pipeline-core:goldfish-implementor" }) }],
  });
  assert.equal(results[0].exitCode, 2);
  assert.match(results[0].stderr, /DBB-PENDING-BINDING-MISSING/u);
});

test("a live counter owner blocks a second acquisition and releases its exact inode", () => {
  const lockDir = mkdtempSync(join(runnerDir, "live-lock-"));
  const lockPath = join(lockDir, "agent.json.binding.lock");
  const { results } = run({ steps: [
    { op: "acquireRealLock", path: lockPath },
    { op: "acquireRealLock", path: lockPath },
    { op: "releaseRealLock" },
  ] });
  assert.deepEqual(results[0], { status: "acquired", code: null, recovered: false });
  assert.deepEqual(results[1], { status: "rejected", code: "counter-lock-busy", recovered: false });
  assert.equal(results[2], true);
});

test("a complete lock in its two-link publication interval is retryable contention", { skip: process.platform === "linux" ? false : `Linux-only: reads /proc/<pid>/stat and /proc/sys/kernel/random/boot_id and asserts owner platform "linux"; process.platform is "${process.platform}"` }, () => {
  const lockDir = mkdtempSync(join(runnerDir, "publishing-lock-"));
  const lockPath = join(lockDir, "agent.json.binding.lock");
  const temporaryPath = `${lockPath}.publisher.tmp`;
  const statText = readFileSync(`/proc/${process.pid}/stat`, "utf8");
  const close = statText.lastIndexOf(")");
  const processStart = statText.slice(close + 2).trim().split(/\s+/u)[19];
  const owner = {
    platform: "linux",
    hostId: hostname().toLowerCase(),
    bootId: readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim().toLowerCase(),
    pid: process.pid,
    processStart,
    nonce: randomUUID().replaceAll("-", ""),
  };
  writeFileSync(temporaryPath, `${JSON.stringify({ schema: "pipeline.dispatch-budget-counter-lock.v1", owner })}\n`, { flag: "wx", mode: 0o600 });
  linkSync(temporaryPath, lockPath);
  const { results } = run({ steps: [{ op: "acquireRealLock", path: lockPath }] });
  assert.deepEqual(results[0], { status: "rejected", code: "counter-lock-busy", recovered: false });
});

test("a binding lock left by a dead process is identity-checked and recovered", () => {
  const lockDir = mkdtempSync(join(runnerDir, "dead-lock-"));
  const lockPath = join(lockDir, "agent.json.binding.lock");
  const first = run({ steps: [{ op: "acquireRealLock", path: lockPath }] });
  assert.deepEqual(first.results[0], { status: "acquired", code: null, recovered: false });
  const second = run({ steps: [
    { op: "acquireRealLock", path: lockPath },
    { op: "releaseRealLock" },
  ] });
  assert.deepEqual(second.results[0], { status: "acquired", code: null, recovered: true });
  assert.equal(second.results[1], true);
});

test("concurrent authenticated child calls serialize counter RMW without lost increments", async () => {
  const commonDir = mkdtempSync(join(runnerDir, "parallel-counter-"));
  const counterPath = join(commonDir, "agent-pipeline", "dispatch-budget", "parallel-agent.json");
  mkdirSync(join(commonDir, "agent-pipeline", "dispatch-budget"), { recursive: true, mode: 0o700 });
  writeFileSync(counterPath, `${JSON.stringify({
    schema: "pipeline.dispatch-budget-counter.v1",
    agentId: "parallel-agent",
    agentType: "pipeline-core:goldfish-implementor",
    maxTurns: 50,
    baseCalls: 35,
    workingCap: 35,
    count: 0,
  }, null, 2)}\n`);
  const config = Buffer.from(JSON.stringify({ commonDir, counterPath, rootDir: FAKE_ROOT }), "utf8").toString("base64");
  const invoke = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [PARALLEL_COUNTER_RUNNER_PATH, GUARD, config], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`parallel worker exited ${code}: ${stderr}`));
      else resolve(JSON.parse(stdout.trim()));
    });
  });
  const results = await Promise.all(Array.from({ length: 16 }, invoke));
  assert.ok(results.every(({ exitCode }) => exitCode === 0), JSON.stringify(results));
  assert.equal(JSON.parse(readFileSync(counterPath, "utf8")).count, 16);
});

test("evaluateDispatchBudgetGuard (NVA-B-BUDGETGUARD-2): the two measured live PreToolUse payload key sets are pinned as fixtures", () => {
  assert.deepEqual(Object.keys(measuredOrchestratorPayload()).sort(), [...ORCHESTRATOR_PAYLOAD_KEYS].sort());
  assert.deepEqual(Object.keys(measuredSubagentPayload()).sort(), [...SUBAGENT_PAYLOAD_KEYS].sort());
});

test("evaluateDispatchBudgetGuard (NVA-B-BUDGETGUARD-2): the measured subagent-shaped fixture is counted -- a counter file is written carrying its agentId and agentType", () => {
  const { results } = run({
    rootDir: FAKE_ROOT,
    files: seedSubagentFiles(20),
    steps: [
      { op: "guard", input: measuredSubagentPayload() },
      { op: "getFile", path: `${COMMON_DIR}/agent-pipeline/dispatch-budget/abc123.json` },
    ],
  });
  assert.equal(results[0].exitCode, 0);
  const counter = JSON.parse(results[1]);
  assert.equal(counter.agentId, "abc123");
  assert.equal(counter.agentType, "pipeline-core:goldfish-deep");
  assert.equal(counter.count, 1);
});

test("evaluateDispatchBudgetGuard (NVA-B-BUDGETGUARD-2): the measured orchestrator-shaped fixture is never counted -- no per-agent counter file is ever written for it", () => {
  const { results } = run({
    rootDir: FAKE_ROOT,
    steps: [{ op: "guard", input: measuredOrchestratorPayload() }, { op: "listFiles" }],
  });
  assert.equal(results[0].exitCode, 0);
  const counterFiles = results[1].filter((p) => p.includes("/dispatch-budget/") && !p.includes("orchestrator-seen"));
  assert.deepEqual(counterFiles, []);
});

// NVA-B-BUDGETVIS-1 (F1, backlog/evidence/2026-09-06-nva-b-guardfix-critic-round1.md): a payload
// that carries neither a usable `agent_id` NOR the measured orchestrator shape's own clean absence
// of both `agent_id` and `agent_type` -- i.e. partial/malformed dispatch-identity evidence -- must
// leave a record naming its true reason, distinguishable from both a counted subagent and the
// once-per-session orchestrator marker. Built on the measured fixtures (never the 3-key legacy
// `orchestratorInputObj()`/minimal payloads above, which stay exactly as pinned -- their own
// absence of `session_id`/`cwd`/etc. is not what this dispatch is testing). EXPECTED TO FAIL against
// the guard as it stands after `6372b984`: `dispatchBudgetCallerIdentity()` there returns only
// `subagent`/`orchestrator`, so every case below currently lands in the orchestrator branch.
const UNRESOLVED_PREFIX = `${COMMON_DIR}/agent-pipeline/dispatch-budget/unresolved-observations/`;

test("evaluateDispatchBudgetGuard (NVA-B-BUDGETVIS-1): a payload carrying agent_type without agent_id is recorded as unattributable, not silently absorbed into the orchestrator marker", () => {
  const { results } = run({
    rootDir: FAKE_ROOT,
    steps: [
      { op: "guard", input: measuredOrchestratorPayload({ agent_type: "pipeline-core:goldfish-deep" }) },
      { op: "getFilesByPrefix", prefix: UNRESOLVED_PREFIX },
      { op: "getFile", path: `${COMMON_DIR}/agent-pipeline/dispatch-budget/orchestrator-seen/parent.json` },
      { op: "listFiles" },
    ],
  });
  assert.equal(results[0].exitCode, 0, "an unattributable call is still allowed, exactly as today");
  assert.equal(results[1].length, 1, "an unattributable call must leave one bounded observation");
  const record = JSON.parse(results[1][0][1]);
  assert.equal(record.kind, "unresolved");
  assert.equal(record.branch, "unresolved-identity");
  assert.equal(record.reason, "agent-type-without-agent-id");
  assert.equal(record.agentTypeRaw, "pipeline-core:goldfish-deep");
  assert.equal(results[2], null, "no orchestrator marker is written for this call -- it is not classified as the orchestrator");
  const counterFiles = results[3].filter((p) => p.includes("/dispatch-budget/") && !p.includes("orchestrator-seen") && !p.includes("unresolved-observations"));
  assert.deepEqual(counterFiles, [], "an unattributable call is never counted as a per-agent dispatch");
});

test("evaluateDispatchBudgetGuard (NVA-B-BUDGETVIS-1): a payload carrying a blank agent_id is recorded as unattributable, not the orchestrator", () => {
  const { results } = run({
    rootDir: FAKE_ROOT,
    steps: [
      { op: "guard", input: measuredOrchestratorPayload({ agent_id: "   " }) },
      { op: "getFilesByPrefix", prefix: UNRESOLVED_PREFIX },
    ],
  });
  assert.equal(results[0].exitCode, 0);
  assert.equal(results[1].length, 1, "an unattributable call must leave one bounded observation");
  const record = JSON.parse(results[1][0][1]);
  assert.equal(record.reason, "agent-id-present-but-blank");
  assert.equal(record.agentIdRaw, "   ");
});

test("evaluateDispatchBudgetGuard (NVA-B-BUDGETVIS-1): a payload carrying a non-string agent_id is recorded as unattributable with its raw value preserved", () => {
  const { results } = run({
    rootDir: FAKE_ROOT,
    steps: [
      { op: "guard", input: measuredOrchestratorPayload({ agent_id: 12345 }) },
      { op: "getFilesByPrefix", prefix: UNRESOLVED_PREFIX },
    ],
  });
  assert.equal(results[0].exitCode, 0);
  assert.equal(results[1].length, 1, "an unattributable call must leave one bounded observation");
  const record = JSON.parse(results[1][0][1]);
  assert.equal(record.reason, "agent-id-present-but-not-a-string");
  assert.equal(record.agentIdRaw, 12345);
});

test("evaluateDispatchBudgetGuard (NVA-B-BUDGETVIS-1): the three identity shapes land in three disjoint sinks -- counted, marker-only, and unresolved-only", () => {
  const { results } = run({
    rootDir: FAKE_ROOT,
    files: seedSubagentFiles(20),
    steps: [
      { op: "guard", input: measuredSubagentPayload() },
      { op: "guard", input: measuredOrchestratorPayload({ transcript_path: "/fake/session/other.jsonl" }) },
      { op: "guard", input: measuredOrchestratorPayload({ transcript_path: "/fake/session/third.jsonl", agent_type: "pipeline-core:goldfish-deep" }) },
      { op: "listFiles" },
    ],
  });
  for (const r of results.slice(0, 3)) assert.equal(r.exitCode, 0);
  const allFiles = results[3];
  const counterFiles = allFiles.filter((p) => p.includes("/dispatch-budget/") && !p.includes("orchestrator-seen") && !p.includes("unresolved-observations"));
  const markerFiles = allFiles.filter((p) => p.includes("/orchestrator-seen/"));
  const unresolvedFiles = unresolvedObservationFiles(allFiles);
  assert.equal(counterFiles.length, 1, "exactly one per-agent counter file, for the genuine subagent call");
  assert.equal(markerFiles.length, 1, "exactly one orchestrator marker, for the genuine orchestrator call");
  assert.equal(unresolvedFiles.length, 1, "exactly one bounded unresolved observation, holding the unattributable call's record");
});

test("evaluateDispatchBudgetGuard: workingCap always equals each agent's own maxTurns minus the documented reserve", () => {
  for (const agentName of ["goldfish-deep", "goldfish-implementor", "goldfish-mechanic"]) {
    const { results } = run({
      rootDir: FAKE_ROOT,
      files: {
        [META_PATH]: JSON.stringify({ agentType: `pipeline-core:${agentName}`, description: "x", toolUseId: "t1", spawnDepth: 1 }),
      },
      steps: [
        { op: "constants" },
        { op: "maxTurns", agentType: `pipeline-core:${agentName}`, rootDir: REPO_ROOT },
      ],
    });
    const { CLOSING_ALLOWANCE, SAFETY_MARGIN } = results[0];
    assert.equal(CLOSING_ALLOWANCE, 5, "the guard's own documented closing allowance");
    assert.equal(SAFETY_MARGIN, 10, "the guard's own documented safety margin");
    const maxTurns = results[1];
    assert.ok(typeof maxTurns === "number" && maxTurns > 0, `${agentName}'s own agent definition must resolve a positive maxTurns`);
    const expectedWorkingCap = maxTurns - (CLOSING_ALLOWANCE + SAFETY_MARGIN);

    // Exercised through the real guard, not just the raw formula: seed a subagent whose
    // meta.json names this exact agentType, drive one call, and confirm the guard itself
    // agrees -- by reading the persisted counter's own recorded workingCap, which the guard
    // derives independently inside evaluateDispatchBudgetGuard.
    const { results: guardResults } = run({
      rootDir: FAKE_ROOT,
      files: {
        [META_PATH]: JSON.stringify({ agentType: `pipeline-core:${agentName}`, description: "x", toolUseId: "t1", spawnDepth: 1 }),
        [agentDefPath(agentName)]: `---\nname: ${agentName}\nmodel: sonnet\nmaxTurns: ${maxTurns}\ntools: Read\n---\nbody\n`,
      },
      steps: [
        { op: "guard", input: readInputObj({ file_path: "/x" }, `pipeline-core:${agentName}`) },
        { op: "getFile", path: `${COMMON_DIR}/agent-pipeline/dispatch-budget/abc123.json` },
      ],
    });
    assert.equal(guardResults[0].exitCode, 0, `${agentName}'s first call must be allowed`);
    const counterRaw = guardResults[1];
    assert.ok(counterRaw, `${agentName}: a counter file must exist after a call`);
    assert.equal(
      JSON.parse(counterRaw).workingCap,
      expectedWorkingCap,
      `${agentName}: guard-derived workingCap must equal maxTurns - (CLOSING_ALLOWANCE + SAFETY_MARGIN)`,
    );
  }
});

function unresolvedObservationFiles(paths) {
  return paths.filter((path) => path.includes("/dispatch-budget/unresolved-observations/") && path.endsWith(".json"));
}

test("evaluateDispatchBudgetGuard (NVA-B-BUDGET-RESIDUE-1): repeated unresolved identity observations are bounded once per session and reason", () => {
  const input = measuredOrchestratorPayload({ agent_id: null, agent_type: "pipeline-core:goldfish-deep", session_id: "bounded-session" });
  const { results } = run({
    rootDir: FAKE_ROOT,
    steps: [
      { op: "guard", input }, { op: "guard", input }, { op: "guard", input },
      { op: "listFiles" },
    ],
  });
  for (const result of results.slice(0, 3)) assert.equal(result.exitCode, 0);
  const paths = unresolvedObservationFiles(results[3]);
  assert.equal(paths.length, 1, "one complete observation is retained for repeated same-key calls");
});

test("evaluateDispatchBudgetGuard (NVA-B-BUDGET-RESIDUE-1): unresolved observation keys separate session, reason, and fallback session buckets", () => {
  const { results } = run({
    rootDir: FAKE_ROOT,
    steps: [
      { op: "guard", input: measuredOrchestratorPayload({ agent_id: null, session_id: "session-a" }) },
      { op: "guard", input: measuredOrchestratorPayload({ agent_id: null, session_id: "session-b" }) },
      { op: "guard", input: measuredOrchestratorPayload({ agent_type: "pipeline-core:goldfish-deep", session_id: "session-a" }) },
      { op: "guard", input: measuredOrchestratorPayload({ agent_id: null, session_id: null }) },
      { op: "listFiles" },
    ],
  });
  for (const result of results.slice(0, 4)) assert.equal(result.exitCode, 0);
  assert.equal(unresolvedObservationFiles(results[4]).length, 4);
});

test("evaluateDispatchBudgetGuard (NVA-B-BUDGET-RESIDUE-1): max-turns-unresolvable is deduplicated and sink failures remain fail-open", () => {
  const unresolved = measuredSubagentPayload({ agent_type: "pipeline-core:not-a-real-agent", session_id: "unknown-turns" });
  const { results } = run({
    rootDir: FAKE_ROOT,
    steps: [
      { op: "guard", input: unresolved }, { op: "guard", input: unresolved },
      { op: "setWriteMode", mode: "throw" },
      { op: "guard", input: measuredOrchestratorPayload({ agent_id: null, session_id: "sink-failure" }) },
      { op: "listFiles" },
    ],
  });
  for (const result of [results[0], results[1], results[3]]) assert.equal(result.exitCode, 0);
  assert.equal(unresolvedObservationFiles(results[4]).length, 1, "write failure does not create a suppressor or change the allow verdict");
});

test("evaluateDispatchBudgetGuard (NVA-B-BUDGET-RESIDUE-1): malformed and absent session identities share the explicit fallback bucket, retain legacy JSONL, and clean partial writes", () => {
  const legacy = `${COMMON_DIR}/agent-pipeline/dispatch-budget/unresolved.jsonl`;
  const { session_id: _sessionId, ...absentSession } = measuredOrchestratorPayload({ agent_id: null });
  const { results } = run({
    rootDir: FAKE_ROOT,
    files: { [legacy]: "legacy-jsonl\n" },
    steps: [
      { op: "guard", input: absentSession },
      { op: "guard", input: measuredOrchestratorPayload({ agent_id: null, session_id: null }) },
      { op: "guard", input: measuredOrchestratorPayload({ agent_id: null, session_id: "   " }) },
      { op: "guard", input: measuredOrchestratorPayload({ agent_id: null, session_id: 17 }) },
      { op: "setWriteMode", mode: "partial-throw" },
      { op: "guard", input: measuredOrchestratorPayload({ agent_type: "pipeline-core:goldfish-deep", session_id: "write-failure" }) },
      { op: "getFile", path: legacy }, { op: "listFiles" },
    ],
  });
  for (const result of [results[0], results[1], results[2], results[3], results[5]]) assert.equal(result.exitCode, 0);
  assert.equal(results[6], "legacy-jsonl\n");
  const observations = unresolvedObservationFiles(results[7]);
  assert.equal(observations.length, 1, "absent and malformed session identities share fallback-session for one reason");
  assert.equal(results[7].filter((path) => path.includes(".observation-")).length, 0, "partial write leaves no suppressor or temporary file");
});

test("evaluateDispatchBudgetGuard (NVA-B-BUDGET-RESIDUE-1): concurrent real-filesystem callers claim one complete same-key observation", async () => {
  const fixture = mkdtempSync(join(REPO_ROOT, "scratch", "guard-dispatch-budget-observation-"));
  const commonDir = join(fixture, "common");
  const runner = join(fixture, "concurrent-runner.mjs");
  const input = measuredOrchestratorPayload({ agent_id: null, agent_type: "pipeline-core:goldfish-deep", session_id: "same-session" });
  writeFileSync(runner, [
    "import { pathToFileURL } from 'node:url';",
    "const [guardPath, commonDir, rootDir, inputB64] = process.argv.slice(2);",
    "const mod = await import(pathToFileURL(guardPath).href);",
    "const result = mod.evaluateDispatchBudgetGuard(JSON.parse(Buffer.from(inputB64, 'base64url').toString('utf8')), { rootDir, resolveGitCommonDirFn: () => commonDir });",
    "process.exit(result.exitCode);",
  ].join("\n"));
  try {
    await Promise.all(Array.from({ length: 8 }, () => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [runner, GUARD, commonDir, FAKE_ROOT, Buffer.from(JSON.stringify(input)).toString("base64url")]);
      child.on("error", reject);
      child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`child exited ${code}`)));
    })));
    const observationRoot = join(commonDir, "agent-pipeline", "dispatch-budget", "unresolved-observations");
    const directories = readdirSync(observationRoot, { recursive: true }).filter((entry) => String(entry).endsWith(".json"));
    assert.equal(directories.length, 1);
    const observation = JSON.parse(readFileSync(join(observationRoot, directories[0]), "utf8"));
    assert.equal(observation.reason, "agent-id-present-but-not-a-string");
    assert.equal(observation.branch, "unresolved-identity");
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

// =================================================================================================
// Spec section 22.11, R7-11a..d (task R7-11-T2): parallel dispatch is supported.
// PO decision 2026-10-07 #26: the dispatch-budget accounting must never refuse a call because another
// dispatch holds its lock (toil T19). RED BY DESIGN: these cases pin the settled wait interface; the
// production fix follows in R7-11-F. The interface pinned here (and nothing else):
//   - acquireDispatchBudgetCounterLock keeps its single-attempt semantics (existing cases unchanged);
//   - new export acquireDispatchBudgetCounterLockWithWait(path, dependencies): retries the single attempt
//     with bounded backoff while the holder is live, returns { status: "acquired", ... } as soon as the lock
//     is free, after the bound returns { status: "rejected", code: "counter-lock-timeout", holderAgeMs },
//     and recovers a provably dead holder exactly as the single attempt does;
//   - dependencies.now() -> epoch ms and dependencies.sleep(ms) are injected and SYNCHRONOUS (the hook
//     is synchronous; production already blocks with Atomics.wait);
//   - new export COUNTER_LOCK_WAIT_BOUND_MS (read below through a child, never hard-coded here);
//   - holder age = now - the lock file's mtime; the hook forwards its own `options` object to the lock
//     function as `dependencies` (it already does), so options.now / options.sleep reach the wait loop;
//   - the hook refuses a call that outwaits the bound with reason counter-lock-timeout and names the age.
// Determinism, case by case (no wall-clock races, no retries by the callers):
//   R7-11a/c: a holder CHILD holds the REAL lock behind a file barrier ("held" -> "release"). Every worker
//     makes exactly one hook call (no retry loop of its own, unlike the older parallel case above, which
//     retries on counter-lock-busy and therefore masks this defect). The worker injects a sleep that drops a
//     "waiting-<label>" marker file; the parent releases the holder only once every expected waiter has
//     either dropped its marker (proof that THIS call met the held lock) or already terminated (the refusal
//     path of today's code). The worker's injected now() subtracts the time it spent sleeping, so a
//     bound measured on now() cannot expire while the parent is still assembling the contention.
//   R7-11b/d: one child process holds the real lock itself (same-process owner is live on win32 and
//     Linux) and calls the wait variant / the hook with a VIRTUAL clock: now() reads a counter that
//     starts at the lock's mtime plus a fixed offset and only sleep(ms) advances it; a sleep stub may
//     release the lock after K calls. Nothing waits in real time.
// Like the rest of this file, nothing here imports guard-dispatch-budget.mjs at module scope (file-top NOTE):
// every call into the guard happens in a child runner.
// =================================================================================================
const R711_RUNNER_SOURCE = String.raw`
import { pathToFileURL } from 'node:url';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [, , guardPath, configB64] = process.argv;
const cfg = JSON.parse(Buffer.from(configB64, 'base64').toString('utf8'));
const mod = await import(pathToFileURL(guardPath).href);
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const emit = (value) => console.log('R711-RESULT: ' + JSON.stringify(value));
const hookInput = (agentId) => ({ agent_id: agentId, agent_type: 'pipeline-core:goldfish-implementor', transcript_path: '/unused.jsonl', tool_name: 'Read', tool_input: { file_path: '/x' } });
const hookOptions = (extra) => Object.assign({ rootDir: cfg.rootDir, resolveGitCommonDirFn: () => cfg.commonDir, resolveMaxTurnsFn: () => 50 }, extra);

if (cfg.mode === 'exports') {
  emit({
    waitType: typeof mod.acquireDispatchBudgetCounterLockWithWait,
    bound: mod.COUNTER_LOCK_WAIT_BOUND_MS === undefined ? null : mod.COUNTER_LOCK_WAIT_BOUND_MS,
  });
} else if (cfg.mode === 'holder') {
  // The controlled holder: owns the REAL lock until the parent drops the release barrier file.
  const acquired = mod.acquireDispatchBudgetCounterLock(cfg.lockPath);
  if (acquired.status !== 'acquired') {
    emit({ acquired: false, code: acquired.code || null });
  } else {
    writeFileSync(join(cfg.signalDir, 'held'), '1');
    const deadline = Date.now() + cfg.maxHoldMs;
    while (!existsSync(join(cfg.signalDir, 'release')) && Date.now() < deadline) pause(5);
    emit({ acquired: true, barrierSeen: existsSync(join(cfg.signalDir, 'release')), released: mod.releaseDispatchBudgetCounterLock(acquired.lock) });
  }
} else if (cfg.mode === 'worker') {
  // ONE hook call, no retry loop. sleep() is the probe: its first call proves this call met a held lock.
  const startedAt = Date.now();
  let slept = 0;
  let waited = false;
  const sleep = (ms) => {
    if (!waited) { waited = true; writeFileSync(join(cfg.signalDir, 'waiting-' + cfg.label), '1'); }
    if (Date.now() - startedAt > cfg.safetyMs) throw new Error('worker ' + cfg.label + ' exceeded its safety ceiling of ' + cfg.safetyMs + ' ms while waiting');
    const before = Date.now();
    pause(Math.max(1, Number(ms) || 1));
    slept += Date.now() - before;
  };
  const now = () => Date.now() - slept;
  const r = mod.evaluateDispatchBudgetGuard(hookInput(cfg.agentId), hookOptions({ now, sleep }));
  emit({ label: cfg.label, agentId: cfg.agentId, exitCode: r.exitCode, stderr: String(r.stderr || ''), waited });
} else if (cfg.mode === 'virtual') {
  // Same-process live holder (or none) plus a virtual clock: nothing here waits in real time.
  let held = null;
  let mtimeMs = null;
  if (cfg.holder === 'live') {
    const acquired = mod.acquireDispatchBudgetCounterLock(cfg.lockPath);
    if (acquired.status !== 'acquired') throw new Error('fixture holder not acquired: ' + JSON.stringify(acquired));
    held = acquired.lock;
    mtimeMs = Math.floor(statSync(cfg.lockPath).mtimeMs);
  }
  const startClock = (mtimeMs === null ? Date.now() : mtimeMs) + (cfg.holdOffsetMs || 0);
  let clock = startClock;
  let reads = 0;
  let released = false;
  let sleepsAfterRelease = 0;
  const readings = new Set();
  const sleeps = [];
  const now = () => {
    reads += 1;
    if (reads > 2000000) throw new Error('runaway wait loop: now() read more than 2000000 times');
    readings.add(clock);
    return clock;
  };
  const sleep = (ms) => {
    if (released) sleepsAfterRelease += 1;
    sleeps.push(ms);
    if (sleeps.length > 200000) throw new Error('runaway wait loop: sleep() called more than 200000 times');
    clock += ms;
    if (held !== null && typeof cfg.releaseAfterSleeps === 'number' && sleeps.length >= cfg.releaseAfterSleeps) {
      mod.releaseDispatchBudgetCounterLock(held);
      held = null;
      released = true;
    }
  };
  let outcome;
  if (cfg.call === 'wait') {
    const r = mod.acquireDispatchBudgetCounterLockWithWait(cfg.lockPath, { now, sleep });
    outcome = {
      status: r.status,
      code: r.code === undefined ? null : r.code,
      recovered: r.recovered === true,
      holderAgeMs: r.holderAgeMs === undefined ? null : r.holderAgeMs,
    };
    if (r.status === 'acquired') outcome.acquiredLockReleased = mod.releaseDispatchBudgetCounterLock(r.lock);
  } else {
    const r = mod.evaluateDispatchBudgetGuard(hookInput(cfg.agentId), hookOptions({ now, sleep }));
    outcome = { exitCode: r.exitCode, stderr: String(r.stderr || '') };
  }
  const heldStillIntact = held === null ? null : mod.releaseDispatchBudgetCounterLock(held);
  emit({ outcome, sleeps, sleepsAfterRelease, released, readings: Array.from(readings), startClock, finalClock: clock, mtimeMs, heldStillIntact });
} else {
  throw new Error('unknown R7-11 runner mode ' + cfg.mode);
}
`;
let r711RunnerPathCache = null;
function r711RunnerPath() {
  if (r711RunnerPathCache === null) {
    r711RunnerPathCache = join(runnerDir, "r711-runner.mjs");
    writeFileSync(r711RunnerPathCache, R711_RUNNER_SOURCE);
  }
  return r711RunnerPathCache;
}

function r711ParseResult(stdout, label) {
  const line = String(stdout ?? "").split(/\r?\n/u).find((candidate) => candidate.startsWith("R711-RESULT: "));
  assert.ok(line, `R7-11 runner (${label}) did not print a result line -- stdout ${JSON.stringify(String(stdout ?? "").slice(0, 500))}`);
  return JSON.parse(line.slice("R711-RESULT: ".length));
}

function r711RunSync(config) {
  const b64 = Buffer.from(JSON.stringify(config), "utf8").toString("base64");
  const res = spawnSync(process.execPath, [r711RunnerPath(), GUARD, b64], { input: "", encoding: "utf8", timeout: RUNNER_TIMEOUT_MS });
  assert.equal(res.status, 0, `R7-11 runner (${config.mode}/${config.call ?? "-"}) exited ${res.status} (expected 0) -- stderr: ${String(res.stderr ?? "").trim().slice(0, 800)}`);
  return r711ParseResult(res.stdout, config.mode);
}

/** Spawns a long-lived R7-11 child; `done` resolves with its result line, `isClosed()` tells the parent it has terminated. */
function r711Spawn(config) {
  const b64 = Buffer.from(JSON.stringify(config), "utf8").toString("base64");
  const child = spawn(process.execPath, [r711RunnerPath(), GUARD, b64], { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  let closed = false;
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      closed = true;
      try {
        assert.equal(code, 0, `R7-11 ${config.mode} child (${config.label ?? "-"}) exited ${code} (expected 0) -- stderr: ${stderr.trim().slice(0, 800)}`);
        resolve(r711ParseResult(stdout, config.mode));
      } catch (error) { reject(error); }
    });
  });
  done.catch(() => { /* the awaiting test reports it; this only prevents an unhandled-rejection race */ });
  return { child, done, isClosed: () => closed };
}

async function r711WaitFor(predicate, timeoutMs = RUNNER_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return predicate();
}

let r711ExportsCache = null;
function r711RequireWaitContract() {
  if (r711ExportsCache === null) r711ExportsCache = r711RunSync({ mode: "exports" });
  assert.equal(r711ExportsCache.waitType, "function", "guard-dispatch-budget.mjs must export acquireDispatchBudgetCounterLockWithWait(path, dependencies) (Spec 22.11)");
  assert.ok(Number.isSafeInteger(r711ExportsCache.bound) && r711ExportsCache.bound > 0 && r711ExportsCache.bound <= 10000,
    `guard-dispatch-budget.mjs must export COUNTER_LOCK_WAIT_BOUND_MS as a positive integer ceiling of at most a few seconds (<= 10000 ms) -- got ${JSON.stringify(r711ExportsCache.bound)}`);
  return r711ExportsCache;
}

/** A fixture git common dir with one pre-seeded counter (count 0) per agent; locks live beside the counters, in the fixture only. */
function r711Fixture(label, agentIds) {
  const root = mkdtempSync(join(runnerDir, `r711-${label}-`));
  const commonDir = join(root, "common");
  const budgetDir = join(commonDir, "agent-pipeline", "dispatch-budget");
  mkdirSync(budgetDir, { recursive: true, mode: 0o700 });
  const signalDir = join(root, "signal");
  mkdirSync(signalDir);
  const agents = {};
  for (const agentId of agentIds) {
    const counterPath = join(budgetDir, `${agentId}.json`);
    writeFileSync(counterPath, `${JSON.stringify({
      schema: "pipeline.dispatch-budget-counter.v1",
      agentId,
      agentType: "pipeline-core:goldfish-implementor",
      maxTurns: 50,
      baseCalls: 35,
      workingCap: 35,
      count: 0,
    }, null, 2)}\n`);
    agents[agentId] = { counterPath, lockPath: `${counterPath}.binding.lock` };
  }
  return { root, commonDir, signalDir, agents };
}
const r711Count = (fixture, agentId) => JSON.parse(readFileSync(fixture.agents[agentId].counterPath, "utf8")).count;

/**
 * Runs `callers` (one hook call each, no retries) against a REAL lock that a holder child keeps until every
 * caller that is expected to wait has proven it met the held lock (marker file) or has already terminated.
 * Every child has closed before this returns, whatever happens.
 */
async function r711ContendedBatch(fixture, holderAgent, callers) {
  const barrier = (name) => join(fixture.signalDir, name);
  const holder = r711Spawn({ mode: "holder", lockPath: fixture.agents[holderAgent].lockPath, signalDir: fixture.signalDir, maxHoldMs: RUNNER_TIMEOUT_MS * 3 });
  const workers = [];
  let contentionObserved = false;
  try {
    await r711WaitFor(() => existsSync(barrier("held")) || holder.isClosed());
    assert.ok(existsSync(barrier("held")), "the controlled holder child did not acquire the real lock");
    for (const caller of callers) {
      workers.push({
        ...caller,
        proc: r711Spawn({
          mode: "worker", label: caller.label, agentId: caller.agentId, commonDir: fixture.commonDir,
          rootDir: FAKE_ROOT, signalDir: fixture.signalDir, safetyMs: RUNNER_TIMEOUT_MS * 2,
        }),
      });
    }
    contentionObserved = await r711WaitFor(() => workers.every((worker) => worker.proc.isClosed()
      || (worker.expectWait && existsSync(barrier(`waiting-${worker.label}`)))));
  } finally {
    writeFileSync(barrier("release"), "1");
    const procs = [holder, ...workers.map((worker) => worker.proc)];
    const killer = setTimeout(() => { for (const proc of procs) proc.child.kill(); }, RUNNER_TIMEOUT_MS * 2);
    try { await Promise.allSettled(procs.map((proc) => proc.done)); } finally { clearTimeout(killer); }
  }
  const holderResult = await holder.done;
  const results = await Promise.all(workers.map((worker) => worker.proc.done));
  return { holderResult, results, contentionObserved };
}

const R711_REFUSAL_PATTERN = /counter-lock-busy|DISPATCH-BUDGET-INPUT-INVALID/u;
function r711Refused(results) {
  return results.filter((result) => result.exitCode !== 0).map(({ label, exitCode, stderr }) => ({ label, exitCode, stderr: stderr.trim().slice(0, 300) }));
}

test("R7-11a: N concurrent tool calls of one subagent that all meet a live lock holder are all admitted and the counter advances by exactly N", async () => {
  const N = 6;
  const agentId = "r711-agent-a";
  const fixture = r711Fixture("a", [agentId]);
  const batch = await r711ContendedBatch(fixture, agentId, Array.from({ length: N }, (_, index) => ({ label: `w${index}`, agentId, expectWait: true })));
  const refused = r711Refused(batch.results);
  assert.equal(refused.length, 0, `${refused.length} of ${N} concurrent calls were refused while a live holder held the lock: ${JSON.stringify(refused)}`);
  for (const result of batch.results) assert.doesNotMatch(result.stderr, R711_REFUSAL_PATTERN, `${result.label} surfaced a lock refusal to the agent`);
  assert.equal(r711Count(fixture, agentId), N, "no lost update and no double count: the counter advances by exactly N");
  assert.equal(batch.contentionObserved, true, "forced contention: every worker must have recorded a wait (injected sleep) before the holder was released");
  assert.ok(batch.results.every((result) => result.waited), `every worker must have met the held lock -- waited flags: ${JSON.stringify(batch.results.map(({ label, waited }) => [label, waited]))}`);
  assert.equal(batch.holderResult.released, true, "the holder released its exact lock inode");
});

test("R7-11b: the wait variant recovers a lock left by a provably dead holder at once, without waiting out the bound", () => {
  r711RequireWaitContract();
  const lockDir = mkdtempSync(join(runnerDir, "r711-dead-lock-"));
  const lockPath = join(lockDir, "agent.json.binding.lock");
  const first = run({ steps: [{ op: "acquireRealLock", path: lockPath }] });
  assert.deepEqual(first.results[0], { status: "acquired", code: null, recovered: false });
  const second = r711RunSync({ mode: "virtual", call: "wait", holder: "none", lockPath });
  assert.equal(second.outcome.status, "acquired");
  assert.equal(second.outcome.recovered, true, "a dead holder is recovered exactly as the single attempt recovers it");
  assert.equal(second.sleeps.length, 0, "a dead owner is recovered without waiting");
  assert.equal(second.outcome.acquiredLockReleased, true);
});

test("R7-11b: the wait variant keeps a malformed lock fail-closed under its existing code and never waits for it", () => {
  r711RequireWaitContract();
  const lockDir = mkdtempSync(join(runnerDir, "r711-malformed-lock-"));
  const lockPath = join(lockDir, "agent.json.binding.lock");
  writeFileSync(lockPath, "not a lock record\n");
  const result = r711RunSync({ mode: "virtual", call: "wait", holder: "none", lockPath });
  assert.equal(result.outcome.status, "rejected");
  assert.equal(result.outcome.code, "counter-lock-malformed");
  assert.equal(result.sleeps.length, 0, "waiting applies only to a live owner");
});

test("R7-11b: the hook admits and counts exactly once a call whose lock was left by a provably dead holder", () => {
  const agentId = "r711-agent-b";
  const fixture = r711Fixture("b", [agentId]);
  const dead = run({ steps: [{ op: "acquireRealLock", path: fixture.agents[agentId].lockPath }] });
  assert.deepEqual(dead.results[0], { status: "acquired", code: null, recovered: false });
  const hook = r711RunSync({ mode: "virtual", call: "hook", holder: "none", agentId, commonDir: fixture.commonDir, rootDir: FAKE_ROOT });
  assert.equal(hook.outcome.exitCode, 0, hook.outcome.stderr);
  assert.equal(r711Count(fixture, agentId), 1, "admitted and counted once");
  assert.equal(hook.sleeps.length, 0, "a dead owner is not waited for");
});

test("R7-11c: a lock held for agent A leaves agent B's call admitted with no wait; the counters stay independent", async () => {
  const [agentA, agentB] = ["r711-agent-ca", "r711-agent-cb"];
  const fixture = r711Fixture("c-isolation", [agentA, agentB]);
  const batch = await r711ContendedBatch(fixture, agentA, [{ label: "b0", agentId: agentB, expectWait: false }]);
  const [call] = batch.results;
  assert.equal(call.exitCode, 0, call.stderr);
  assert.equal(call.waited, false, "agent B's call must not wait on agent A's lock");
  assert.equal(r711Count(fixture, agentB), 1, "agent B counted once");
  assert.equal(r711Count(fixture, agentA), 0, "agent A's counter is untouched by agent B's call");
});

test("R7-11c: two agents each making concurrent calls are all admitted and keep separate counters, with agent A's lock held throughout the first contention", async () => {
  const [agentA, agentB] = ["r711-agent-cc", "r711-agent-cd"];
  const fixture = r711Fixture("c-mixed", [agentA, agentB]);
  const batch = await r711ContendedBatch(fixture, agentA, [
    { label: "a0", agentId: agentA, expectWait: true },
    { label: "a1", agentId: agentA, expectWait: true },
    { label: "b0", agentId: agentB, expectWait: false },
    { label: "b1", agentId: agentB, expectWait: false },
  ]);
  const refused = r711Refused(batch.results);
  assert.equal(refused.length, 0, `${refused.length} of 4 concurrent calls were refused: ${JSON.stringify(refused)}`);
  for (const result of batch.results) assert.doesNotMatch(result.stderr, R711_REFUSAL_PATTERN, `${result.label} surfaced a lock refusal to the agent`);
  assert.equal(r711Count(fixture, agentA), 2, "agent A counted exactly its own two calls");
  assert.equal(r711Count(fixture, agentB), 2, "agent B counted exactly its own two calls");
  assert.ok(batch.results.filter(({ label }) => label.startsWith("a")).every(({ waited }) => waited), "agent A's calls met the held lock (forced contention)");
});

test("R7-11d: COUNTER_LOCK_WAIT_BOUND_MS is exported as a positive integer ceiling of a few seconds", () => {
  const { bound } = r711RequireWaitContract();
  assert.ok(bound > 0 && bound <= 10000, `bound ${bound}`);
});

const R711_HOLD_OFFSET_MS = 250;

test("R7-11d: a live holder beyond the bound yields counter-lock-timeout naming the holder age, and the holder is left intact", () => {
  const { bound } = r711RequireWaitContract();
  const lockDir = mkdtempSync(join(runnerDir, "r711-timeout-lock-"));
  const lockPath = join(lockDir, "agent.json.binding.lock");
  const result = r711RunSync({ mode: "virtual", call: "wait", holder: "live", holdOffsetMs: R711_HOLD_OFFSET_MS, releaseAfterSleeps: null, lockPath });
  const { outcome, sleeps, readings, mtimeMs } = result;
  assert.equal(outcome.status, "rejected");
  assert.equal(outcome.code, "counter-lock-timeout");
  assert.ok(Number.isFinite(outcome.holderAgeMs) && outcome.holderAgeMs >= bound, `holderAgeMs ${outcome.holderAgeMs} must be a number of at least the bound ${bound}`);
  assert.ok(readings.some((reading) => Math.abs(outcome.holderAgeMs + mtimeMs - reading) <= 1),
    `holder age is now minus the lock file's mtime: holderAgeMs ${outcome.holderAgeMs} + mtime ${mtimeMs} matches no now() reading`);
  const total = sleeps.reduce((sum, ms) => sum + ms, 0);
  assert.ok(sleeps.length > 0 && total > 0, "the call waited before giving up");
  assert.ok(total >= bound - R711_HOLD_OFFSET_MS, `waited only ${total} ms of a ${bound} ms bound`);
  assert.ok(total - sleeps[sleeps.length - 1] <= bound && total <= 2 * bound, `waited ${total} ms, beyond the ${bound} ms bound`);
  assert.equal(result.heldStillIntact, true, "a live holder's lock is never taken over or deleted");
});

test("R7-11d: a holder that releases within the bound lets the call through as soon as the lock is free", () => {
  const { bound } = r711RequireWaitContract();
  const lockDir = mkdtempSync(join(runnerDir, "r711-release-lock-"));
  const lockPath = join(lockDir, "agent.json.binding.lock");
  const result = r711RunSync({ mode: "virtual", call: "wait", holder: "live", holdOffsetMs: R711_HOLD_OFFSET_MS, releaseAfterSleeps: 2, lockPath });
  assert.equal(result.outcome.status, "acquired");
  assert.equal(result.outcome.recovered, false);
  assert.equal(result.released, true, "the holder released during the wait");
  assert.equal(result.sleepsAfterRelease, 0, "no sleep once the lock is free");
  assert.ok(result.sleeps.length >= 2 && result.sleeps.reduce((sum, ms) => sum + ms, 0) <= bound, "waited, but within the bound");
  assert.equal(result.outcome.acquiredLockReleased, true);
});

const R711_HOLDER_AGE_TEXT = /holder[^\n]{0,80}?\d|\bage\b[^\n]{0,40}?\d|held for[^\n]{0,20}?\d/iu;

test("R7-11d: at hook level a live holder beyond the bound refuses with counter-lock-timeout, names the holder age and counts nothing", () => {
  const agentId = "r711-agent-dt";
  const fixture = r711Fixture("d-hook-timeout", [agentId]);
  const before = readFileSync(fixture.agents[agentId].counterPath, "utf8");
  const result = r711RunSync({
    mode: "virtual", call: "hook", holder: "live", holdOffsetMs: R711_HOLD_OFFSET_MS, releaseAfterSleeps: null,
    lockPath: fixture.agents[agentId].lockPath, agentId, commonDir: fixture.commonDir, rootDir: FAKE_ROOT,
  });
  const { exitCode, stderr } = result.outcome;
  assert.equal(exitCode, 2, stderr);
  assert.match(stderr, /counter-lock-timeout/u);
  assert.doesNotMatch(stderr, /counter-lock-busy/u, "counter-lock-busy never reaches the agent");
  assert.match(stderr, R711_HOLDER_AGE_TEXT, `the refusal text names the holder age: ${JSON.stringify(stderr)}`);
  assert.ok(!stderr.includes(fixture.commonDir) && !stderr.includes("binding.lock"), "the refusal text is path-redacted");
  assert.equal(readFileSync(fixture.agents[agentId].counterPath, "utf8"), before, "a timed-out call is never counted and changes no counter");
  assert.equal(result.heldStillIntact, true, "the live holder's lock was not taken over");
});

test("R7-11d: at hook level a holder that releases within the bound lets the call through, counted exactly once", () => {
  const agentId = "r711-agent-dr";
  const fixture = r711Fixture("d-hook-release", [agentId]);
  const result = r711RunSync({
    mode: "virtual", call: "hook", holder: "live", holdOffsetMs: R711_HOLD_OFFSET_MS, releaseAfterSleeps: 2,
    lockPath: fixture.agents[agentId].lockPath, agentId, commonDir: fixture.commonDir, rootDir: FAKE_ROOT,
  });
  assert.equal(result.outcome.exitCode, 0, result.outcome.stderr);
  assert.equal(result.released, true, "the holder released during the wait");
  assert.equal(result.sleepsAfterRelease, 0, "no sleep once the lock is free");
  assert.equal(r711Count(fixture, agentId), 1, "admitted after waiting and counted exactly once");
});

// =================================================================================================
// Task R7-11-T3: pin the bounded-wait boundary (test-only). The settled behaviour, one case per clause:
//   1. COUNTER_LOCK_WAIT_BOUND_MS is exactly 3000 (green today);
//   2. retry set: counter-lock-busy / -changed / -recovery-busy are retried inside the bound; the dead-owner
//      recovery outcomes -recovery-raced / -recovery-changed / -recovery-malformed and any malformed-lock
//      outcome refuse at once, one attempt, no sleep (RED today for -recovery-raced only: the catch-all for a
//      dead-owner recovery exception must fail closed, but it sits in COUNTER_LOCK_TRANSIENT_CODES);
//   3. when only -changed / -recovery-busy occurred until the bound, the timeout carries NO holderAgeMs and
//      the refusal text never says "live holder" (green today);
//   4. the hook refuses a timeout under its own typed code DISPATCH-BUDGET-COUNTER-LOCK-TIMEOUT, path-free,
//      with a repair telling the agent to retry the same call (RED today: it reuses ...-INPUT-INVALID);
//   5. with no dependencies.now the wait runs on a monotonic source: a Date.now that jumps back 60000 ms
//      mid-wait must not stretch the wait beyond the bound (RED today: it reads Date.now).
// Seams, deliberately asymmetric (do not conflate): at FUNCTION level acquireDispatchBudgetCounterLockFn
// replaces the single attempt and the real wait loop runs around it (clauses 2, 3, 5); at HOOK level the same
// option short-circuits the whole wait (evaluateDispatchBudgetGuard calls it instead of the wait), so clauses
// 3-text and 4 are driven with a stub that returns the timeout outcome directly. Everything stubbed lives in a
// fresh child process (R711T3_RUNNER_SOURCE); nothing leaks into any other case.
// =================================================================================================
const R711T3_RUNNER_SOURCE = String.raw`
import { pathToFileURL } from 'node:url';

const [, , guardPath, configB64] = process.argv;
const cfg = JSON.parse(Buffer.from(configB64, 'base64').toString('utf8'));
const mod = await import(pathToFileURL(guardPath).href);
const emit = (value) => console.log('R711-RESULT: ' + JSON.stringify(value));
const hookInput = (agentId) => ({ agent_id: agentId, agent_type: 'pipeline-core:goldfish-implementor', transcript_path: '/unused.jsonl', tool_name: 'Read', tool_input: { file_path: '/x' } });
const hookOptions = (extra) => Object.assign({ rootDir: cfg.rootDir, resolveGitCommonDirFn: () => cfg.commonDir, resolveMaxTurnsFn: () => 50 }, extra);
const outcomeOf = (entry) => (entry === 'acquired' ? { status: 'acquired', lock: null } : { status: 'rejected', code: entry });

if (cfg.mode === 'scripted-wait') {
  // Function level: the scripted function REPLACES THE SINGLE ATTEMPT; the real wait loop runs around it on a virtual clock.
  let clock = 1000000;
  let attempts = 0;
  const sleeps = [];
  const script = cfg.script.slice();
  const attempt = () => {
    attempts += 1;
    if (attempts > 100000) throw new Error('runaway wait loop: more than 100000 attempts');
    const entry = script.length > 1 || !cfg.repeatLast ? script.shift() : script[0];
    return outcomeOf(entry === undefined ? 'acquired' : entry);
  };
  const sleep = (ms) => {
    sleeps.push(ms);
    if (sleeps.length > 100000) throw new Error('runaway wait loop: more than 100000 sleeps');
    clock += ms;
  };
  const r = mod.acquireDispatchBudgetCounterLockWithWait(cfg.lockPath, { acquireDispatchBudgetCounterLockFn: attempt, now: () => clock, sleep });
  emit({ status: r.status, code: r.code === undefined ? null : r.code, hasHolderAgeMs: Object.prototype.hasOwnProperty.call(r, 'holderAgeMs'), attempts, sleeps });
} else if (cfg.mode === 'hook-stub') {
  // Hook level: the option SHORT-CIRCUITS the wait, so the stub returns the timeout outcome itself.
  let calls = 0;
  const stub = () => {
    calls += 1;
    return Object.assign({ status: 'rejected', code: 'counter-lock-timeout' }, cfg.holderAgeMs === null ? {} : { holderAgeMs: cfg.holderAgeMs });
  };
  const r = mod.evaluateDispatchBudgetGuard(hookInput(cfg.agentId), hookOptions({ acquireDispatchBudgetCounterLockFn: stub }));
  emit({ exitCode: r.exitCode, stderr: String(r.stderr || ''), calls });
} else if (cfg.mode === 'monotonic') {
  // No dependencies.now and no dependencies.sleep: the wait runs on its own clock and really sleeps. A live holder is
  // scripted at the single-attempt level. performance.now() is the real-time reference (unaffected by the Date.now stub).
  const realDateNow = Date.now.bind(Date);
  const t0 = performance.now();
  const bound = mod.COUNTER_LOCK_WAIT_BOUND_MS;
  let offset = 0;
  let attempts = 0;
  globalThis.Date.now = () => {
    if (performance.now() - t0 > bound + cfg.ceilingSlackMs) {
      throw new Error('a wall-clock based wait outran the ' + bound + ' ms bound by more than ' + cfg.ceilingSlackMs + ' ms after Date.now jumped back ' + cfg.jumpBackMs + ' ms');
    }
    return realDateNow() - offset;
  };
  const attempt = () => {
    attempts += 1;
    if (offset === 0 && performance.now() - t0 >= cfg.jumpAfterMs) offset = cfg.jumpBackMs;
    return { status: 'rejected', code: 'counter-lock-busy' };
  };
  let result = null;
  let error = null;
  try {
    result = mod.acquireDispatchBudgetCounterLockWithWait(cfg.lockPath, { acquireDispatchBudgetCounterLockFn: attempt });
  } catch (caught) {
    error = String((caught && caught.message) || caught);
  }
  const realElapsedMs = performance.now() - t0;
  emit({ error, jumped: offset !== 0, attempts, realElapsedMs, status: result === null ? null : result.status, code: result === null || result.code === undefined ? null : result.code });
} else {
  throw new Error('unknown R7-11-T3 runner mode ' + cfg.mode);
}
`;
let r711t3RunnerPathCache = null;
function r711t3RunSync(config) {
  if (r711t3RunnerPathCache === null) {
    r711t3RunnerPathCache = join(runnerDir, "r711-t3-runner.mjs");
    writeFileSync(r711t3RunnerPathCache, R711T3_RUNNER_SOURCE);
  }
  const b64 = Buffer.from(JSON.stringify(config), "utf8").toString("base64");
  const res = spawnSync(process.execPath, [r711t3RunnerPathCache, GUARD, b64], { input: "", encoding: "utf8", timeout: RUNNER_TIMEOUT_MS });
  assert.equal(res.status, 0, `R7-11-T3 runner (${config.mode}) exited ${res.status} (expected 0) -- stderr: ${String(res.stderr ?? "").trim().slice(0, 800)}`);
  return r711ParseResult(res.stdout, config.mode);
}

/** A lock path inside a fresh directory where no lock file exists: the wait has no mtime to age, so no holder is ever "seen" by the filesystem. */
function r711t3AbsentLockPath(label) {
  return join(mkdtempSync(join(runnerDir, `r711-t3-${label}-`)), "agent.json.binding.lock");
}

test("R7-11d-T3: COUNTER_LOCK_WAIT_BOUND_MS is exactly 3000 ms", () => {
  assert.equal(r711RequireWaitContract().bound, 3000);
});

for (const code of ["counter-lock-busy", "counter-lock-changed", "counter-lock-recovery-busy"]) {
  test(`R7-11d-T3: ${code} is retried inside the bound and the call is admitted as soon as the lock is free`, () => {
    const { bound } = r711RequireWaitContract();
    const result = r711t3RunSync({ mode: "scripted-wait", lockPath: r711t3AbsentLockPath("retry"), script: [code, code, "acquired"], repeatLast: false });
    assert.equal(result.status, "acquired", JSON.stringify(result));
    assert.equal(result.attempts, 3, "two refused attempts were retried, the third was admitted");
    assert.equal(result.sleeps.length, 2, "one sleep between each pair of attempts and none after the admission");
    assert.ok(result.sleeps.reduce((sum, ms) => sum + ms, 0) <= bound, "the retries stayed inside the bound");
  });
}

for (const code of ["counter-lock-recovery-changed", "counter-lock-recovery-malformed", "counter-lock-malformed"]) {
  test(`R7-11d-T3: ${code} is never retried: one attempt, no sleep, refused with its own code`, () => {
    r711RequireWaitContract();
    const result = r711t3RunSync({ mode: "scripted-wait", lockPath: r711t3AbsentLockPath("noretry"), script: [code], repeatLast: true });
    assert.equal(result.status, "rejected", JSON.stringify(result));
    assert.equal(result.code, code, "the single attempt's refusal is returned as it came");
    assert.equal(result.attempts, 1, "a single attempt and no retry");
    assert.equal(result.sleeps.length, 0, "no sleep before refusing");
  });
}

test("R7-11d-T3: counter-lock-recovery-failed (a genuine dead-owner recovery failure) fails closed at once: one attempt, no sleep", () => {
  r711RequireWaitContract();
  const result = r711t3RunSync({ mode: "scripted-wait", lockPath: r711t3AbsentLockPath("recovery-failed"), script: ["counter-lock-recovery-failed"], repeatLast: true });
  assert.equal(result.status, "rejected", JSON.stringify(result));
  assert.equal(result.code, "counter-lock-recovery-failed", "refused with the single attempt's own code, not folded into a timeout");
  assert.equal(result.attempts, 1, `a genuine recovery failure must not be retried -- got ${result.attempts} attempts`);
  assert.equal(result.sleeps.length, 0, `no sleep before refusing -- got ${result.sleeps.length} sleeps`);
});

test("R7-11d-T5: counter-lock-recovery-raced is a retried benign race", () => {
  const { bound } = r711RequireWaitContract();
  const result = r711t3RunSync({ mode: "scripted-wait", lockPath: r711t3AbsentLockPath("raced-retry"), script: ["counter-lock-recovery-raced", "acquired"], repeatLast: false });
  assert.notEqual(result.status, "rejected", `a benign recovery race must not be refused at once -- got ${JSON.stringify(result)}`);
  assert.equal(result.status, "acquired", JSON.stringify(result));
  assert.ok(result.attempts > 1, `the raced attempt must be retried -- got ${result.attempts} attempts`);
  assert.equal(result.attempts, 2, "the raced attempt was retried once and the second was admitted");
  assert.equal(result.sleeps.length, 1, "one sleep between the two attempts and none after the admission");
  assert.ok(result.sleeps.reduce((sum, ms) => sum + ms, 0) <= bound, "the retry stayed inside the bound");
});

for (const code of ["counter-lock-changed", "counter-lock-recovery-busy"]) {
  test(`R7-11d-T3: only ${code} until the bound times out with counter-lock-timeout and no holderAgeMs`, () => {
    const { bound } = r711RequireWaitContract();
    const result = r711t3RunSync({ mode: "scripted-wait", lockPath: r711t3AbsentLockPath("timeout"), script: [code], repeatLast: true });
    assert.equal(result.status, "rejected", JSON.stringify(result));
    assert.equal(result.code, "counter-lock-timeout");
    assert.equal(result.hasHolderAgeMs, false, "no live holder was seen, so no holder age is reported");
    assert.ok(result.attempts > 1 && result.sleeps.reduce((sum, ms) => sum + ms, 0) >= bound, "the call waited out the full bound before giving up");
  });
}

function r711t3HookTimeout(label, holderAgeMs) {
  const agentId = `r711-agent-t3-${label}`;
  const fixture = r711Fixture(`t3-${label}`, [agentId]);
  const before = readFileSync(fixture.agents[agentId].counterPath, "utf8");
  const result = r711t3RunSync({ mode: "hook-stub", agentId, commonDir: fixture.commonDir, rootDir: FAKE_ROOT, holderAgeMs });
  assert.equal(result.calls, 1, "the hook-level option was consulted exactly once");
  assert.equal(result.exitCode, 2, result.stderr);
  assert.ok(!result.stderr.includes(fixture.commonDir) && !result.stderr.includes("binding.lock"), "the refusal text is path-redacted");
  assert.equal(readFileSync(fixture.agents[agentId].counterPath, "utf8"), before, "a timed-out call is never counted and changes no counter");
  return result.stderr;
}

test("R7-11d-T3: a timeout without a holder age never says 'live holder' in the refusal text", () => {
  const stderr = r711t3HookTimeout("noage-text", null);
  assert.doesNotMatch(stderr, /live holder/iu, `no live holder was seen: ${JSON.stringify(stderr)}`);
});

for (const { label, holderAgeMs } of [{ label: "with-age", holderAgeMs: 3100 }, { label: "no-age", holderAgeMs: null }]) {
  test(`R7-11d-T3: the hook refuses a timeout (${label}) under its own typed code DISPATCH-BUDGET-COUNTER-LOCK-TIMEOUT with a retry-the-same-call repair`, () => {
    const stderr = r711t3HookTimeout(`typed-${label}`, holderAgeMs);
    assert.match(stderr, /DISPATCH-BUDGET-COUNTER-LOCK-TIMEOUT/u, `a lock timeout has its own typed code: ${JSON.stringify(stderr)}`);
    assert.doesNotMatch(stderr, /DISPATCH-BUDGET-INPUT-INVALID/u, "a lock timeout is not an invalid-budget-state refusal");
    assert.match(stderr, /\bretry\b[^\n]{0,20}\bsame\b[^\n]{0,20}\bcall\b/iu, `the repair tells the agent to retry the same call: ${JSON.stringify(stderr)}`);
    assert.doesNotMatch(stderr, /trusted host path/iu, "a transient timeout is not a corrupt counter: no host-path repair is offered");
  });
}

test("R7-11d-T3: with no injected clock the wait is monotonic: Date.now jumping back 60000 ms mid-wait ends the call within the bound plus 500 ms of real time", () => {
  const { bound } = r711RequireWaitContract();
  const result = r711t3RunSync({
    mode: "monotonic", lockPath: r711t3AbsentLockPath("mono"), jumpAfterMs: 800, jumpBackMs: 60000, ceilingSlackMs: 500,
  });
  assert.equal(result.error, null, `the wait must not follow a wall clock that moved backwards: ${result.error}`);
  assert.equal(result.jumped, true, "the backwards jump happened mid-wait");
  assert.equal(result.status, "rejected");
  assert.equal(result.code, "counter-lock-timeout");
  assert.ok(result.realElapsedMs >= bound - 50, `the call gave up after only ${Math.round(result.realElapsedMs)} ms of a ${bound} ms bound`);
  assert.ok(result.realElapsedMs <= bound + 500, `the call took ${Math.round(result.realElapsedMs)} ms of real time, beyond the ${bound} ms bound plus 500 ms`);
});

// =================================================================================================
// Task R7-11-T4: pin the split between BENIGN recovery races and GENUINE recovery failures (test-only).
// Contract (Spec 22.11): the accounting "must never refuse a call only because another call holds its lock";
// "a malformed, unsafe or ambiguous lock stays fail-closed; waiting applies only to a live owner"; R7-11a/b:
// admitted and counted once. These cases define the behaviour of the REAL dead-owner recovery path of
// acquireDispatchBudgetCounterLock, reached through the real wait loop and the real hook:
//   1. the recovery lock vanishes between the EEXIST link attempt and the existence check (the winner finished its
//      recovery and now holds a live main lock): not a refusal -- wait for the winner, admitted, counted once;
//   2. the stale-recovery-lock takeover hits ENOENT (rename) or EEXIST (republish) because a parallel caller took it
//      first: retried, admitted, counted once;
//   3. the main-lock republish after the dead-owner rename hits ENOENT or EEXIST (a fresh caller published first):
//      retried, admitted, counted once;
//   4. a GENUINE I/O failure (EACCES, EPERM, EIO from the rename / unlink / link step of recovery) refuses at once,
//      fail-closed, under its own reason code counter-lock-recovery-failed: not counter-lock-recovery-raced, never
//      retried (no sleep), and the counter is untouched.
// Seams: NOT acquireDispatchBudgetCounterLockFn (that would script the result). The hook forwards its own options
// object to the real wait loop and the real single attempt as `dependencies`, so the filesystem seams linkSyncFn /
// renameSyncFn / unlinkSyncFn wrap the REAL fs calls and deviate exactly once, at one named step. A parallel caller
// is a real acquisition by the same child process (a live owner, as in the older R7-11 cases) that is advanced one
// stage per injected sleep, so nothing waits in real time. The dead-owner locks are left behind by a child that has
// exited. Each case asserts the injected step was actually reached, so no case can pass vacuously. Which of these
// are RED or GREEN at a given commit is recorded by the evidence capture, not hard-coded here.
// Not pinned here (adjacent, left to the fix task): a recovery lock that vanishes between the existence check and
// the stable read, and an unlink failure of the quarantined dead lock AFTER the new main lock was published.
// =================================================================================================
const R711T4_RUNNER_SOURCE = String.raw`
import { pathToFileURL } from 'node:url';
import { existsSync, linkSync, renameSync, unlinkSync } from 'node:fs';

const [, , guardPath, configB64] = process.argv;
const cfg = JSON.parse(Buffer.from(configB64, 'base64').toString('utf8'));
const mod = await import(pathToFileURL(guardPath).href);
const emit = (value) => console.log('R711-RESULT: ' + JSON.stringify(value));
const mainPath = cfg.lockPath;
const recoveryPath = mainPath + '.recovery';
const trap = cfg.trap;
const events = [];
const held = { main: null, recovery: null };
let fired = false;

const fsError = (code, syscall) => Object.assign(new Error(code + ': simulated ' + syscall + ' failure'), { code });

// The parallel caller ("winner"): REAL acquisitions through the guard's own default filesystem seams, made by this
// process, so its lock is live (same pid) exactly like the holder of the older R7-11 cases.
const winnerAction = (action) => {
  if (action === 'take-main' || action === 'take-recovery') {
    const slot = action === 'take-main' ? 'main' : 'recovery';
    const taken = mod.acquireDispatchBudgetCounterLock(slot === 'main' ? mainPath : recoveryPath);
    if (taken.status !== 'acquired') throw new Error('fixture winner could not ' + action + ': ' + JSON.stringify(taken));
    held[slot] = taken.lock;
    events.push(action);
  } else if (action === 'release-main' || action === 'release-recovery') {
    const slot = action === 'release-main' ? 'main' : 'recovery';
    if (held[slot] !== null) {
      events.push(action + ':' + mod.releaseDispatchBudgetCounterLock(held[slot]));
      held[slot] = null;
    }
  } else throw new Error('unknown winner action ' + action);
};

// Where the single injected deviation happens. The conditions keep the release path of the admitted call (which
// renames/unlinks the same main lock) from ever matching.
const matches = (kind, a, b) => {
  if (trap.fn !== kind) return false;
  if (trap.target === 'recovery-link') return b === recoveryPath;
  if (trap.target === 'stale-recovery-rename') return a === recoveryPath;
  if (trap.target === 'stale-recovery-unlink') return typeof a === 'string' && a.startsWith(recoveryPath + '.dead.');
  if (trap.target === 'main-rename') return a === mainPath && existsSync(recoveryPath);
  if (trap.target === 'main-republish-link') return b === mainPath && !existsSync(mainPath);
  throw new Error('unknown trap target ' + trap.target);
};
const intercept = (kind, a, b, real) => {
  if (fired || !matches(kind, a, b)) return real();
  fired = true;
  events.push('trap:' + kind + ':' + trap.effect);
  if (trap.effect === 'fail') throw fsError(trap.error, kind);
  if (trap.effect === 'winner-then-eexist') { for (const action of trap.winner) winnerAction(action); throw fsError('EEXIST', kind); }
  if (trap.effect === 'winner-then-real') { for (const action of trap.winner) winnerAction(action); return real(); }
  if (trap.effect === 'real-then-winner') { const result = real(); for (const action of trap.winner) winnerAction(action); return result; }
  throw new Error('unknown trap effect ' + trap.effect);
};

let clock = Date.now();
const sleeps = [];
const now = () => clock;
const sleep = (ms) => {
  sleeps.push(ms);
  if (sleeps.length > 200000) throw new Error('runaway wait loop: sleep() called more than 200000 times');
  clock += ms;
  for (const action of (cfg.stages[sleeps.length - 1] || [])) winnerAction(action);
};

const input = { agent_id: cfg.agentId, agent_type: 'pipeline-core:goldfish-implementor', transcript_path: '/unused.jsonl', tool_name: 'Read', tool_input: { file_path: '/x' } };
const options = {
  rootDir: cfg.rootDir,
  resolveGitCommonDirFn: () => cfg.commonDir,
  resolveMaxTurnsFn: () => 50,
  now,
  sleep,
  linkSyncFn: (from, to) => intercept('link', from, to, () => linkSync(from, to)),
  renameSyncFn: (from, to) => intercept('rename', from, to, () => renameSync(from, to)),
  unlinkSyncFn: (path) => intercept('unlink', path, undefined, () => unlinkSync(path)),
};
const r = mod.evaluateDispatchBudgetGuard(input, options);
const winnerHeldAtEnd = held.main !== null || held.recovery !== null;
const mainExistsAfter = existsSync(mainPath);
for (const action of ['release-recovery', 'release-main']) winnerAction(action);
emit({ exitCode: r.exitCode, stderr: String(r.stderr || ''), sleeps, events, trapFired: fired, winnerHeldAtEnd, mainExistsAfter });
`;
let r711t4RunnerPathCache = null;
function r711t4RunSync(config) {
  if (r711t4RunnerPathCache === null) {
    r711t4RunnerPathCache = join(runnerDir, "r711-t4-runner.mjs");
    writeFileSync(r711t4RunnerPathCache, R711T4_RUNNER_SOURCE);
  }
  const b64 = Buffer.from(JSON.stringify(config), "utf8").toString("base64");
  const res = spawnSync(process.execPath, [r711t4RunnerPathCache, GUARD, b64], { input: "", encoding: "utf8", timeout: RUNNER_TIMEOUT_MS });
  assert.equal(res.status, 0, `R7-11-T4 runner exited ${res.status} (expected 0) -- stderr: ${String(res.stderr ?? "").trim().slice(0, 800)}`);
  return r711ParseResult(res.stdout, "recovery");
}

/** One hook call against a real dead-owner lock (plus a real stale recovery lock when asked); returns the child's observations. */
function r711t4Call(label, { staleRecovery = false, trap, stages = [] }) {
  const agentId = `r711-agent-t4-${label}`;
  const fixture = r711Fixture(`t4-${label}`, [agentId]);
  const { counterPath, lockPath } = fixture.agents[agentId];
  const steps = [{ op: "acquireRealLock", path: lockPath }];
  if (staleRecovery) steps.push({ op: "acquireRealLock", path: `${lockPath}.recovery` });
  for (const left of run({ steps }).results) assert.deepEqual(left, { status: "acquired", code: null, recovered: false }, "fixture: a lock left behind by a child that has exited");
  const before = readFileSync(counterPath, "utf8");
  const result = r711t4RunSync({ agentId, commonDir: fixture.commonDir, rootDir: FAKE_ROOT, lockPath, trap, stages });
  return { agentId, fixture, counterPath, before, result };
}

/** A benign recovery race: reached, not refused, waited for the winner, admitted and counted exactly once. */
function r711t4AssertBenign({ agentId, fixture, result }, expectedWinnerEvents) {
  assert.equal(result.trapFired, true, `the injected race was never reached on the real recovery path -- events ${JSON.stringify(result.events)}`);
  assert.equal(result.exitCode, 0, `a benign recovery race refused the call instead of retrying it: ${result.stderr}`);
  assert.doesNotMatch(result.stderr, /counter-lock-recovery-raced|counter-lock-recovery-failed|counter-lock-busy|counter-lock-timeout/u, "no lock refusal reaches the agent");
  assert.equal(r711Count(fixture, agentId), 1, "admitted and counted exactly once");
  for (const event of expectedWinnerEvents) assert.ok(result.events.includes(event), `the winner must have released (${event}) while the call waited -- events ${JSON.stringify(result.events)}`);
  assert.equal(result.winnerHeldAtEnd, false, "the call was admitted only after the winner released: a live holder is never taken over");
  assert.equal(result.mainExistsAfter, false, "the admitted call released its own lock");
}

test("R7-11d-T4: a recovery lock that vanishes between the EEXIST link attempt and the existence check is not a refusal: the call waits for the winner's live main lock, then is admitted and counted once", () => {
  const call = r711t4Call("vanish", {
    trap: { fn: "link", target: "recovery-link", effect: "winner-then-eexist", winner: ["take-main"] },
    stages: [["release-main"]],
  });
  r711t4AssertBenign(call, ["release-main:true"]);
});

test("R7-11d-T4: a stale-recovery-lock takeover that hits ENOENT because a parallel caller took it first is retried, admitted and counted once", () => {
  const call = r711t4Call("stale-enoent", {
    staleRecovery: true,
    trap: { fn: "rename", target: "stale-recovery-rename", effect: "winner-then-real", winner: ["take-main"] },
    stages: [["release-main"]],
  });
  r711t4AssertBenign(call, ["release-main:true"]);
});

test("R7-11d-T4: a stale-recovery-lock takeover whose republish hits EEXIST because a parallel caller published first is retried, admitted and counted once", () => {
  const call = r711t4Call("stale-eexist", {
    staleRecovery: true,
    trap: { fn: "unlink", target: "stale-recovery-unlink", effect: "real-then-winner", winner: ["take-recovery"] },
    stages: [["release-recovery", "take-main"], ["release-main"]],
  });
  r711t4AssertBenign(call, ["release-recovery:true", "release-main:true"]);
});

test("R7-11d-T4: a main-lock republish that hits ENOENT after the dead-owner rename is retried, admitted and counted once", () => {
  const call = r711t4Call("republish-enoent", {
    trap: { fn: "link", target: "main-republish-link", effect: "fail", error: "ENOENT" },
  });
  r711t4AssertBenign(call, []);
});

const R711T4_GENUINE_FAILURES = [
  { label: "EACCES from the rename of the dead main lock into quarantine", staleRecovery: false, trap: { fn: "rename", target: "main-rename", effect: "fail", error: "EACCES" } },
  { label: "EIO from the link that publishes the recovery lock", staleRecovery: false, trap: { fn: "link", target: "recovery-link", effect: "fail", error: "EIO" } },
  { label: "EPERM from the rename of a stale recovery lock", staleRecovery: true, trap: { fn: "rename", target: "stale-recovery-rename", effect: "fail", error: "EPERM" } },
  { label: "EIO from the unlink of a stale recovery lock", staleRecovery: true, trap: { fn: "unlink", target: "stale-recovery-unlink", effect: "fail", error: "EIO" } },
  { label: "EACCES from the link that republishes the main lock", staleRecovery: false, trap: { fn: "link", target: "main-republish-link", effect: "fail", error: "EACCES" } },
];
R711T4_GENUINE_FAILURES.forEach(({ label, staleRecovery, trap }, index) => {
  test(`R7-11d-T4: a genuine I/O failure (${label}) refuses at once, fail-closed, under counter-lock-recovery-failed, never retried, with no counter change`, () => {
    const { counterPath, before, result } = r711t4Call(`io-${index}`, { staleRecovery, trap });
    assert.equal(result.trapFired, true, `the injected I/O failure was never reached on the real recovery path -- events ${JSON.stringify(result.events)}`);
    assert.equal(result.exitCode, 2, `a genuine recovery failure must fail closed: ${result.stderr}`);
    assert.equal(result.sleeps.length, 0, "a genuine I/O failure is never retried: one attempt, no sleep");
    assert.equal(readFileSync(counterPath, "utf8"), before, "a refused call changes no counter");
    assert.match(result.stderr, /counter-lock-recovery-failed/u, `a genuine recovery failure has its own reason code: ${JSON.stringify(result.stderr)}`);
    assert.doesNotMatch(result.stderr, /counter-lock-recovery-raced|counter-lock-timeout/u, "it is neither a recovery race nor a timeout");
  });
});

test("R7-11d-T4: a main-lock republish that hits EEXIST because a fresh caller published first is retried, admitted and counted once", () => {
  const call = r711t4Call("republish-eexist", {
    trap: { fn: "link", target: "main-republish-link", effect: "winner-then-real", winner: ["take-main"] },
    stages: [["release-main"]],
  });
  r711t4AssertBenign(call, ["release-main:true"]);
});

// ===========================================================================
// TR-G-T (tranche-2 post-image, 2026-10-09): pins for the toil-resolution rows T34, T37, T49 and for the T57
// clause "a denial shows the budget charge" (Ruling 115, TR-K4). Appended; every case above is unchanged.
// Design: specs/sprint-alfred-epic/design/toil-resolution-2026-10-08.md section 2 (rows) and section 5 row 11.
//
// ASSUMPTIONS (the rows fix behaviour, not these names; a fix that spells them differently re-points the pin):
//   A1. T37: the log's root cause is not in the pin author's context. The construction used here is two children
//       of the SAME agentType launched under ONE parent tool id (one pending record, one binding for the role).
//       The first child consumes the binding (dispatch-budget-binding.mjs unlinks the record when no bindings
//       remain), so the second finds none. The row offers two cures ("key the pending binding per dispatch, or
//       name the re-dispatch action"); the pin accepts either: the second child is admitted with the briefed
//       cap, OR it is refused with a message that names a re-dispatch action (matched by /re-?dispatch/i).
//   A2. T49: the commit-flow producer is `goldfish-commit-command-flow.mjs` (agent-obligations.md section 6).
//       Its argument spelling is NOT pinned; the pin only needs the script name. The admitted location is taken
//       to be the plugin root the guard itself resolves (the runner passes `<rootDir>/plugins/pipeline-core`).
//       "Nothing else" is pinned with four refusals that stay refusals: another script, the producer chained
//       to a second command with `&&` or `;`, and two non-closing git verbs.
//   A3. T57: the budget guard's OWN exhaustion denial already names the charge (counted attempts), the working
//       cap and the remaining closing slots, so that half is pinned GREEN here to stop TR-K4 regressing it. The
//       half Ruling 115 found unmet -- refusals by the OTHER guards -- cannot be expressed in this file (this
//       guard never sees their verdicts) and is left to TR-K4's own pins in the owning suites.
//   A4. T34: the cache is a performance change with no seam in this guard (evaluateDispatchBudgetGuard calls
//       observeGovernanceScope directly, no injectable) and no decided cache location, so its speed-up cannot be
//       pinned here. The row's INVARIANT can: "any change ... recomputes". The pin retires the governance scope
//       between two guard calls (decision "decline") and requires the very next call to see it. It is GREEN
//       today and goes RED if a future cache serves a stale "active" verdict.
// ===========================================================================
const TRG_PRODUCER = "goldfish-commit-command-flow.mjs";
const trgProducerCommand = (tail = "--task TR-G-T-20261009 -- evidence/x.json") => `node "${FAKE_ROOT}/plugins/pipeline-core/scripts/${TRG_PRODUCER}" ${tail}`;
const trgCounterPath = (agentId) => `${COMMON_DIR}/agent-pipeline/dispatch-budget/${agentId}.json`;
const trgChildMetaPath = (agentId) => `/fake/session/parent/subagents/agent-${agentId}.meta.json`;
const trgChildMeta = (toolUseId) => JSON.stringify({ agentType: "pipeline-core:goldfish-implementor", description: "x", toolUseId, spawnDepth: 1 });
const trgImplementorPayload = (agentId) => measuredSubagentPayload({ agent_type: "pipeline-core:goldfish-implementor", agent_id: agentId });
const trgDeepCall = (tool_name, tool_input) => ({ transcript_path: SUBAGENT_TRANSCRIPT, agent_id: "abc123", agent_type: "pipeline-core:goldfish-deep", tool_name, tool_input });
// workingCap = maxTurns 20 - (5 closing + 10 safety) = 5; the closing allowance is 5 more counted calls.
const trgCapSteps = () => Array.from({ length: 5 }, () => ({ op: "guard", input: readInputObj({ file_path: "/x" }) }));

test("TR-G T49 (a): after the working cap, the commit-flow producer is an admitted closing act and stays counted", () => {
  const steps = [
    ...trgCapSteps(),
    { op: "guard", input: trgDeepCall("Bash", { command: trgProducerCommand() }) },
    { op: "guard", input: trgDeepCall("Bash", { command: trgProducerCommand("--task TR-G-T-20261009 --paths evidence/x.json") }) },
    { op: "getFile", path: COUNTER_PATH },
  ];
  const { results } = run({ rootDir: FAKE_ROOT, files: seedSubagentFiles(20), steps });
  for (let index = 0; index < 5; index += 1) assert.equal(results[index].exitCode, 0, `work call ${index + 1} is within the cap`);
  assert.equal(results[5].exitCode, 0, `the producer after the cap must be admitted -- got: ${results[5].stderr.trim().slice(0, 300)}`);
  assert.equal(results[6].exitCode, 0, `a second producer call after the cap must be admitted -- got: ${results[6].stderr.trim().slice(0, 300)}`);
  assert.equal(JSON.parse(results[7]).count, 7, "admitted closing calls remain counted");
});

test("TR-G T49 (b): after the working cap nothing but the named closing acts is admitted (control, green today)", () => {
  const refused = [
    `node "${FAKE_ROOT}/plugins/pipeline-core/scripts/some-other-script.mjs" --task TR-G-T-20261009`,
    `${trgProducerCommand()} && git push origin main`,
    `${trgProducerCommand()}; echo done`,
    "git push origin main",
    "git reset --hard HEAD~1",
  ];
  const steps = [...trgCapSteps(), ...refused.map((command) => ({ op: "guard", input: trgDeepCall("Bash", { command }) }))];
  const { results } = run({ rootDir: FAKE_ROOT, files: seedSubagentFiles(20), steps });
  refused.forEach((command, index) => {
    const verdict = results[5 + index];
    assert.equal(verdict.exitCode, 2, `must stay refused after the cap: ${command}`);
    assert.match(verdict.stderr, /DISPATCH-BUDGET-EXHAUSTED/u, `must be the budget refusal: ${command}`);
  });
});

test("TR-G T49 (c): the producer cannot renew the closing allowance -- five post-cap producer calls pass, the sixth is refused", () => {
  const steps = [
    ...trgCapSteps(),
    ...Array.from({ length: 6 }, () => ({ op: "guard", input: trgDeepCall("Bash", { command: trgProducerCommand() }) })),
    { op: "getFile", path: COUNTER_PATH },
  ];
  const { results } = run({ rootDir: FAKE_ROOT, files: seedSubagentFiles(20), steps });
  for (let ordinal = 1; ordinal <= 5; ordinal += 1) {
    assert.equal(results[4 + ordinal].exitCode, 0, `producer closing call ${ordinal} of 5 -- got: ${results[4 + ordinal].stderr.trim().slice(0, 300)}`);
  }
  assert.equal(results[10].exitCode, 2, "the sixth post-cap call is outside the allowance");
  assert.match(results[10].stderr, /The closing allowance of 5 tool calls is exhausted\./u);
  assert.equal(JSON.parse(results[11]).count, 11, "every attempt stays counted");
});

// ---------------------------------------------------------------------------
// TR-G-T3 (tranche-2 post-image, 2026-10-09): pins for the two post-cap admission gaps the TR-G-F Critic (Opus,
// partial) found in the producer lane and in the git closing verb (Ruling 138, F1 and F2). Appended after T49 (c);
// every case above is unchanged.
//   F1. comparableScriptPath maps "\" to "/" on EVERY platform, so on a POSIX host
//       `<plugin root>/scripts\goldfish-commit-command-flow.mjs` (a different path there) is admitted as the producer.
//       Pins (d) quoted and (e) bare: refused after the cap. They are POSIX-host pins and are skipped on a win32
//       host, where "\" is a path separator and that spelling is rightly admitted. There is NO platform seam to
//       inject: the guard reads process.platform directly and this runner has no scenario field that sets it, so no
//       injected-win32 admission control exists here and none is invented.
//   F2. The git closing verb is matched at the START of the command only, so a chained command that begins with
//       `git add` / `git commit` is admitted after the cap. Pins (f) `&&`, (g) `;`, (h) `|`: refused. Controls (i)
//       plain `git add -- <p>` / `git commit -F <f> -- <p>` and (j) the forward-slash producer spellings: admitted.
// Every test keeps its post-cap calls within the five-call closing allowance, so a refusal below is the shape's and
// never allowance exhaustion (the exhaustion text is asserted ABSENT).
// ---------------------------------------------------------------------------
const TRG_SKIP_ON_WIN32 = process.platform === "win32" ? "POSIX-host pin: on a win32 host the backslash is a path separator and that spelling stays admitted (the guard reads process.platform directly; no platform seam to inject)" : false;
const TRG_SKIP_BARE_ON_WIN32 = process.platform === "win32" ? "POSIX-host pin: on a win32 host a bare token containing a backslash is refused by the bare-token rule (pins (p) and (q)), not by the POSIX refusal this case pins (the guard reads process.platform directly; no platform seam to inject)" : false;
const TRG_TAIL = "--task TR-G-T3-20261009 -- evidence/x.json";
const trgBackslashQuoted = () => `node "${FAKE_ROOT}/plugins/pipeline-core/scripts\\${TRG_PRODUCER}" ${TRG_TAIL}`;
const trgBackslashBare = () => `node ${FAKE_ROOT}/plugins/pipeline-core/scripts\\${TRG_PRODUCER} ${TRG_TAIL}`;
const trgForwardBare = () => `node ${FAKE_ROOT}/plugins/pipeline-core/scripts/${TRG_PRODUCER} ${TRG_TAIL}`;
const trgPostCap = (commands) => {
  const steps = [...trgCapSteps(), ...commands.map((command) => ({ op: "guard", input: trgDeepCall("Bash", { command }) }))];
  const { results } = run({ rootDir: FAKE_ROOT, files: seedSubagentFiles(20), steps });
  for (let index = 0; index < 5; index += 1) assert.equal(results[index].exitCode, 0, `work call ${index + 1} is within the cap`);
  return results.slice(5);
};
const trgAssertRefusedAfterCap = (verdict, command) => {
  assert.equal(verdict.exitCode, 2, `must stay refused after the cap, but it was admitted: ${command}`);
  assert.match(verdict.stderr, /DISPATCH-BUDGET-EXHAUSTED/u, `must be the budget refusal: ${command}`);
  assert.doesNotMatch(verdict.stderr, /closing allowance of 5 tool calls is exhausted/u, `the refusal must be the shape's, not allowance exhaustion: ${command}`);
};
const trgAssertAdmittedAfterCap = (verdict, command) => {
  assert.equal(verdict.exitCode, 0, `must be admitted as a closing act after the cap: ${command} -- got: ${verdict.stderr.trim().slice(0, 300)}`);
};

test("TR-G T49 (d): after the working cap, a quoted producer path with a backslash before the script name is refused on a POSIX host", { skip: TRG_SKIP_ON_WIN32 }, () => {
  const command = trgBackslashQuoted();
  const [verdict] = trgPostCap([command]);
  trgAssertRefusedAfterCap(verdict, command);
});

test("TR-G T49 (e): after the working cap, a bare producer path with a backslash before the script name is refused on a POSIX host", { skip: TRG_SKIP_BARE_ON_WIN32 }, () => {
  assert.doesNotMatch(FAKE_ROOT, /[\s"']/u, "the bare spelling needs a plugin root without whitespace or quotes");
  const command = trgBackslashBare();
  const [verdict] = trgPostCap([command]);
  trgAssertRefusedAfterCap(verdict, command);
});

test("TR-G T49 (f): after the working cap, `git add <x> && <other>` is refused -- only one simple git command is a closing act", () => {
  const command = "git add -- evidence/x.json && git push origin main";
  const [verdict] = trgPostCap([command]);
  trgAssertRefusedAfterCap(verdict, command);
});

test("TR-G T49 (g): after the working cap, `git add <x>; <other>` is refused", () => {
  const command = "git add -- evidence/x.json; echo done";
  const [verdict] = trgPostCap([command]);
  trgAssertRefusedAfterCap(verdict, command);
});

test("TR-G T49 (h): after the working cap, `git commit -F <f> | <other>` is refused", () => {
  const command = "git commit -F scratch/commit-msg/TR-G-T3.txt -- evidence/x.json | tee scratch/out.txt";
  const [verdict] = trgPostCap([command]);
  trgAssertRefusedAfterCap(verdict, command);
});

test("TR-G T49 (i): after the working cap, plain `git add -- <p>` and `git commit -F <f> -- <p>` stay admitted (control, green today)", () => {
  const commands = ["git add -- evidence/x.json", "git commit -F scratch/commit-msg/TR-G-T3.txt -- evidence/x.json"];
  trgPostCap(commands).forEach((verdict, index) => trgAssertAdmittedAfterCap(verdict, commands[index]));
});

test("TR-G T49 (j): after the working cap, the forward-slash producer spellings, quoted and bare, stay admitted (control, green today)", () => {
  assert.doesNotMatch(FAKE_ROOT, /[\s"']/u, "the bare spelling needs a plugin root without whitespace or quotes");
  const forwardRoot = FAKE_ROOT.replaceAll("\\", "/");
  const commands = [
    `node "${forwardRoot}/plugins/pipeline-core/scripts/${TRG_PRODUCER}" ${TRG_TAIL}`,
    `node ${forwardRoot}/plugins/pipeline-core/scripts/${TRG_PRODUCER} ${TRG_TAIL}`,
  ];
  trgPostCap(commands).forEach((verdict, index) => trgAssertAdmittedAfterCap(verdict, commands[index]));
});

// ---------------------------------------------------------------------------
// TR-G-T4 (tranche-2 post-image, 2026-10-09): pins for the three guard corrections of Ruling 150 (TR-G delta Critic
// FAIL, findings 1 to 3). Appended after T49 (j); every earlier line is unchanged. The guard fix that turns the red
// pins green is TR-G-F4, a separate dispatch (QG-04).
//   Finding 1. The producer is admitted only in its absolute plugin-root spelling, but the refusal text names only the
//       script. Pin (l): the refusal of a relative spelling names the exact admitted absolute path, compared after
//       mapping "\" to "/" (and lower-casing on win32) on both sides so the fix may choose either separator. Pin (k)
//       is its control: the relative spelling is refused, today and after the fix. A relative spelling is NOT
//       admitted because in a source checkout it is the source copy, a different program from the installed plugin.
//   Finding 3. The verb pattern `^git\s+(add|commit)\b` lets a hyphenated lookalike through as a closing act, because
//       `\b` matches between "t" and "-". Pins (m) `git commit-graph write` and (n) `git commit-tree HEAD`: refused.
//       Neither carries a shell control character, so today they are admitted for the verb pattern alone. The fix
//       pattern is `^git\s+(add|commit)(\s|$)`.
//   Finding 2. On win32 only a QUOTED token gets the backslash mapping; a bare (unquoted) token that contains "\" is
//       refused, because a shell eats an unquoted backslash. Pins (p) all separators backslashes and (q) a backslash
//       only before the script name: refused, win32-native only. The guard reads process.platform directly and this
//       runner has no platform seam, so (p) and (q) carry a typed probe-based skip on every other host, and no
//       injected-win32 variant is invented.
//   Controls: (o) the exact path the refusal text names is admitted (quoted, and bare with forward slashes only), and
//       `git commit -F <f> -- <p>` stays admitted. Each test spends at most three post-cap calls (allowance: five).
// ---------------------------------------------------------------------------
const TRG4_TAIL = "--task TR-G-T4-20261009 -- evidence/x.json";
const TRG4_PLUGIN_ROOT = `${FAKE_ROOT}/plugins/pipeline-core`;
// The one admitted producer path, spelled with the same join the guard uses for its comparison.
const TRG4_ADMITTED = join(TRG4_PLUGIN_ROOT, "scripts", TRG_PRODUCER);
const trg4Comparable = (text) => {
  const slashed = String(text).replaceAll("\\", "/");
  return process.platform === "win32" ? slashed.toLowerCase() : slashed;
};
const trg4RelativeCommand = () => `node plugins/pipeline-core/scripts/${TRG_PRODUCER} ${TRG4_TAIL}`;
const TRG4_WIN32_ONLY_SKIP = process.platform === "win32" ? false : "TRG4-WIN32-ONLY: native-win32 pin; the guard reads process.platform directly (no platform seam) and on a POSIX host a backslash is an ordinary character, already pinned by T49 (d) and (e)";

test("TR-G T49 (k): after the working cap, a relative spelling of the producer script stays refused (control, green today)", () => {
  const command = trg4RelativeCommand();
  const [verdict] = trgPostCap([command]);
  trgAssertRefusedAfterCap(verdict, command);
});

test("TR-G T49 (l): after the working cap, the refusal text names the exact admitted absolute producer path", () => {
  const command = trg4RelativeCommand();
  const [verdict] = trgPostCap([command]);
  trgAssertRefusedAfterCap(verdict, command);
  assert.ok(
    trg4Comparable(verdict.stderr).includes(trg4Comparable(TRG4_ADMITTED)),
    `the refusal must name the admitted absolute path ${TRG4_ADMITTED} -- got: ${verdict.stderr.trim().slice(0, 700)}`,
  );
});

test("TR-G T49 (m): after the working cap, `git commit-graph write` is refused -- a hyphenated lookalike is not a closing git verb", () => {
  const command = "git commit-graph write";
  const [verdict] = trgPostCap([command]);
  trgAssertRefusedAfterCap(verdict, command);
});

test("TR-G T49 (n): after the working cap, `git commit-tree HEAD` is refused -- a second hyphenated lookalike", () => {
  const command = "git commit-tree HEAD";
  const [verdict] = trgPostCap([command]);
  trgAssertRefusedAfterCap(verdict, command);
});

test("TR-G T49 (o): after the working cap, the exact admitted producer command (quoted, and bare with forward slashes) and `git commit -F <f> -- <p>` stay admitted (control, green today)", () => {
  assert.doesNotMatch(FAKE_ROOT, /[\s"']/u, "the bare spelling needs a plugin root without whitespace or quotes");
  const commands = [
    `node "${TRG4_ADMITTED}" ${TRG4_TAIL}`,
    `node ${TRG4_ADMITTED.replaceAll("\\", "/")} ${TRG4_TAIL}`,
    "git commit -F scratch/commit-msg/TR-G-T4.txt -- evidence/x.json",
  ];
  trgPostCap(commands).forEach((verdict, index) => trgAssertAdmittedAfterCap(verdict, commands[index]));
});

test("TR-G T49 (p): on win32, after the working cap, a bare producer path whose separators are all backslashes is refused", { skip: TRG4_WIN32_ONLY_SKIP }, () => {
  assert.doesNotMatch(FAKE_ROOT, /[\s"']/u, "the bare spelling needs a plugin root without whitespace or quotes");
  const command = `node ${TRG4_ADMITTED.replaceAll("/", "\\")} ${TRG4_TAIL}`;
  assert.ok(command.slice(5, command.indexOf(" ", 5)).includes("\\"), "the bare script token must contain a backslash");
  const [verdict] = trgPostCap([command]);
  trgAssertRefusedAfterCap(verdict, command);
});

test("TR-G T49 (q): on win32, after the working cap, a bare producer path with a backslash only before the script name is refused", { skip: TRG4_WIN32_ONLY_SKIP }, () => {
  assert.doesNotMatch(FAKE_ROOT, /[\s"']/u, "the bare spelling needs a plugin root without whitespace or quotes");
  const command = `node ${TRG4_PLUGIN_ROOT.replaceAll("\\", "/")}/scripts\\${TRG_PRODUCER} ${TRG4_TAIL}`;
  const [verdict] = trgPostCap([command]);
  trgAssertRefusedAfterCap(verdict, command);
});

function trgTwoChildrenOneParentFiles() {
  const files = boundImplementorFiles(20, 20);
  files[trgChildMetaPath("def456")] = trgChildMeta("parent-tool-1");
  return files;
}

test("TR-G T37 (a): a second same-role child under one parent tool id is bound per dispatch, or its refusal names the re-dispatch action", () => {
  const { results } = run({
    rootDir: FAKE_ROOT,
    realBudgetBinding: true,
    files: trgTwoChildrenOneParentFiles(),
    steps: [
      { op: "guard", input: trgImplementorPayload("abc123") },
      { op: "guard", input: trgImplementorPayload("def456") },
      { op: "getFile", path: trgCounterPath("def456") },
    ],
  });
  assert.equal(results[0].exitCode, 0, "the first child consumes the binding and is admitted");
  if (results[1].exitCode === 0) {
    const counter = JSON.parse(results[2]);
    assert.equal(counter.baseCalls, 20, "an admitted second child carries the briefed base cap, not a default");
    assert.equal(counter.workingCap, 20);
    assert.equal(counter.count, 1);
    return;
  }
  assert.equal(results[1].exitCode, 2, "the only other admissible outcome is a refusal");
  assert.match(results[1].stderr, /re-?dispatch/iu, `a refusal must name the re-dispatch action -- got: ${results[1].stderr.trim().slice(0, 400)}`);
});

test("TR-G T37 (b): concurrent launches under DISTINCT parent tool ids each resolve their own binding (control, green today)", () => {
  const files = boundImplementorFiles(20, 20);
  files[trgChildMetaPath("def456")] = trgChildMeta("parent-tool-2");
  files[pendingBindingPath("parent-tool-2")] = pendingBinding({ toolUseId: "parent-tool-2", baseCalls: 30, effectiveCap: 30 });
  const { results } = run({
    rootDir: FAKE_ROOT,
    realBudgetBinding: true,
    files,
    steps: [
      { op: "guard", input: trgImplementorPayload("abc123") },
      { op: "guard", input: trgImplementorPayload("def456") },
      { op: "getFile", path: trgCounterPath("abc123") },
      { op: "getFile", path: trgCounterPath("def456") },
      { op: "getFile", path: pendingBindingPath("parent-tool-1") },
      { op: "getFile", path: pendingBindingPath("parent-tool-2") },
    ],
  });
  assert.equal(results[0].exitCode, 0);
  assert.equal(results[1].exitCode, 0, `the second launch must not starve -- got: ${results[1].stderr.trim().slice(0, 300)}`);
  assert.deepEqual([JSON.parse(results[2]).baseCalls, JSON.parse(results[2]).workingCap], [20, 20]);
  assert.deepEqual([JSON.parse(results[3]).baseCalls, JSON.parse(results[3]).workingCap], [30, 30]);
  assert.equal(results[4], null, "each pending record is consumed by its own child");
  assert.equal(results[5], null);
});

test("TR-G T57 (Ruling 115, TR-K4 clause 2): this guard's own denial shows the budget charge -- counted attempts, working cap and remaining closing slots (green today)", () => {
  const steps = Array.from({ length: 10 }, () => ({ op: "guard", input: readInputObj({ file_path: "/x" }) }));
  const { results } = run({ rootDir: FAKE_ROOT, files: seedSubagentFiles(20), steps });
  for (let count = 6; count <= 9; count += 1) {
    const remaining = 10 - count;
    const verdict = results[count - 1];
    assert.equal(verdict.exitCode, 2, `attempt ${count} is refused`);
    assert.match(verdict.stderr, new RegExp(`has counted ${count} tool-call attempts against a working cap of 5`, "u"), `attempt ${count} must show its charge`);
    assert.match(verdict.stderr, new RegExp(`${remaining} closing-call ${remaining === 1 ? "slot remains" : "slots remain"}`, "u"), `attempt ${count} must show what remains`);
  }
  assert.match(results[9].stderr, /has counted 10 tool-call attempts against a working cap of 5/u);
  assert.match(results[9].stderr, /The closing allowance of 5 tool calls is exhausted\./u);
});

test("TR-G T34: a governance state change between two guard calls takes effect on the second call -- the scope observation recomputes (invariant for a future cache, green today)", () => {
  const root = activeGovernanceRoot("t34");
  try {
    const files = {
      [META_PATH]: JSON.stringify({ agentType: "pipeline-core:goldfish-deep", description: "x", toolUseId: "t1", spawnDepth: 1 }),
      [`${root}/plugins/pipeline-core/agents/goldfish-deep.md`]: "---\nname: goldfish-deep\nmodel: sonnet\nmaxTurns: 20\ntools: Read\n---\nbody\n",
    };
    const steps = [{ op: "guard", input: readInputObj({ file_path: "/x" }) }, { op: "getFile", path: COUNTER_PATH }];
    const first = run({ rootDir: root, files, steps });
    assert.equal(first.results[0].exitCode, 0);
    assert.equal(JSON.parse(first.results[1]).count, 1, "an enrolled scope counts the call");
    const plan = planGovernanceScopeDecision({ rootDir: root, decision: "decline", by: "TR-G T34 fixture" });
    applyGovernanceScopeDecision(plan, { activate: true, planSha256: plan.planSha256 });
    assert.equal(observeGovernanceScope({ rootDir: root }).requiresEnforcement, false, "fixture precondition: the scope no longer requires enforcement");
    const second = run({ rootDir: root, files: { ...files, [COUNTER_PATH]: first.results[1] }, steps });
    assert.equal(second.results[0].exitCode, 0);
    assert.equal(JSON.parse(second.results[1]).count, 1, "after the scope was retired the next call must not be counted: a cached 'active' verdict would count it");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
