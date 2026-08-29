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
import { spawn, spawnSync } from "node:child_process";
import { linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const GUARD = fileURLToPath(new URL("./guard-dispatch-budget.mjs", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const FAKE_ROOT = "/fake/root";
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
  "const [, , guardPath, scenarioB64] = process.argv;",
  "const scenario = JSON.parse(Buffer.from(scenarioB64, 'base64').toString('utf8'));",
  "",
  "const files = new Map(Object.entries(scenario.files || {}));",
  "const existsSyncFn = (p) => files.has(p);",
  "const readFileSyncFn = (p) => {",
  "  if (!files.has(p)) { const e = new Error('ENOENT ' + p); e.code = 'ENOENT'; throw e; }",
  "  return files.get(p);",
  "};",
  "let writeCount = 0;",
  "let writeMode = 'normal';",
  "const writeFileSyncFn = (p, c) => {",
  "  if (writeMode === 'throw') throw new Error('disk full');",
  "  if (writeMode === 'partial-throw') { files.set(p, 'partial'); throw new Error('ENOSPC'); }",
  "  if (writeMode === 'count') writeCount += 1;",
  "  files.set(p, c);",
  "};",
  "const mkdirSyncFn = () => {};",
  "const appendFileSyncFn = (p, c) => { files.set(p, (files.get(p) || '') + c); };",
  "const linkSyncFn = (from, to) => { if (files.has(to)) { const e = new Error('EEXIST ' + to); e.code = 'EEXIST'; throw e; } if (!files.has(from)) { const e = new Error('ENOENT ' + from); e.code = 'ENOENT'; throw e; } files.set(to, files.get(from)); };",
  "const unlinkSyncFn = (p) => { files.delete(p); };",
  "",
  "const mod = await import(guardPath);",
  "",
  "const commonDirCalls = [];",
  "const hasCommonDir = Object.prototype.hasOwnProperty.call(scenario, 'commonDir');",
  "const commonDirValue = hasCommonDir ? scenario.commonDir : '/fake/.git';",
  "const resolveGitCommonDirFn = (dir) => { commonDirCalls.push(dir); return commonDirValue; };",
  "",
  "const nowFn = () => scenario.nowIso || '2026-08-27T00:00:00.000Z';",
  "",
  "function baseOpts() {",
  "  const o = { resolveGitCommonDirFn, nowFn, existsSyncFn, readFileSyncFn, writeFileSyncFn, mkdirSyncFn, appendFileSyncFn, linkSyncFn, unlinkSyncFn,",
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
  "    results.push(mod.subagentIdentity(step.input, { existsSyncFn, readFileSyncFn }));",
  "  } else if (step.op === 'maxTurns') {",
  "    results.push(mod.resolveMaxTurns(step.agentType, step.rootDir));",
  "  } else if (step.op === 'commonDirReal') {",
  "    results.push(mod.resolveGitCommonDir(step.rootDir));",
  "  } else if (step.op === 'setWriteMode') {",
  "    writeMode = step.mode;",
  "    results.push(null);",
  "  } else if (step.op === 'getWriteCount') {",
  "    results.push(writeCount);",
  "  } else if (step.op === 'getFile') {",
  "    results.push(files.has(step.path) ? files.get(step.path) : null);",
  "  } else if (step.op === 'getFilesByPrefix') {",
  "    results.push(Array.from(files.entries()).filter(([p]) => p.startsWith(step.prefix)));",
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

const SCRATCH_ROOT = join(REPO_ROOT, "scratch");
mkdirSync(SCRATCH_ROOT, { recursive: true });
const runnerDir = mkdtempSync(join(SCRATCH_ROOT, "guard-dispatch-budget-runner-"));
const RUNNER_PATH = join(runnerDir, "runner.mjs");
writeFileSync(RUNNER_PATH, RUNNER_SOURCE);
const PARALLEL_COUNTER_RUNNER_PATH = join(runnerDir, "parallel-counter-runner.mjs");
writeFileSync(PARALLEL_COUNTER_RUNNER_PATH, [
  "const [, , guardPath, configB64] = process.argv;",
  "const { commonDir, counterPath } = JSON.parse(Buffer.from(configB64, 'base64').toString('utf8'));",
  "const { evaluateDispatchBudgetGuard } = await import(guardPath);",
  "const input = { agent_id: 'parallel-agent', agent_type: 'pipeline-core:goldfish-implementor', transcript_path: '/unused.jsonl', tool_name: 'Read', tool_input: { file_path: '/x' } };",
  "let result;",
  "for (let attempt = 0; attempt < 1000; attempt += 1) {",
  "  result = evaluateDispatchBudgetGuard(input, { rootDir: '/unused', resolveGitCommonDirFn: () => commonDir, resolveMaxTurnsFn: () => 50 });",
  "  if (result.exitCode === 0) break;",
  "  if (!result.stderr.includes('counter-lock-busy') && !result.stderr.includes('counter-lock-recovery-busy')) break;",
  "  await new Promise((resolve) => setTimeout(resolve, 2));",
  "}",
  "console.log(JSON.stringify({ exitCode: result.exitCode, stderr: result.stderr, count: JSON.parse((await import('node:fs')).readFileSync(counterPath, 'utf8')).count }));",
].join("\n"));
process.on("exit", () => { try { rmSync(runnerDir, { recursive: true, force: true }); } catch { /* best effort */ } });

/** Spawns the runner against the REAL guard module and returns its parsed RESULT payload. Fails loudly (never silently) if the child does not print the success marker -- see the file-top NOTE for why. */
function run(scenario, spawnOverrides = {}) {
  const b64 = Buffer.from(JSON.stringify(scenario), "utf8").toString("base64");
  const res = spawnSync(process.execPath, [RUNNER_PATH, GUARD, b64], { input: "", encoding: "utf8", timeout: 10000, ...spawnOverrides });
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

// pipeline.identity-attestation-fail-closed-fallback (2026-08-29): a
// transcript_path that IS present but not a usable absolute path must never
// share "unresolved"'s ambiguous, fail-open-tolerant kind -- it is never a
// legitimate orchestrator shape, unlike a genuinely missing field.
test("subagentIdentity: a present but relative transcript_path is a distinct kind, never merged into 'unresolved'", () => {
  const identity = subagentIdentity({ transcript_path: "relative/session/subagents/agent-x.jsonl" }, {});
  assert.notEqual(identity.kind, "unresolved");
  assert.notEqual(identity.kind, "orchestrator");
  assert.equal(identity.kind, "invalid-identity");
  assert.equal(identity.reason, "transcript-path-present-but-not-absolute");
});

test("subagentIdentity: a present but non-string, non-null transcript_path is invalid-identity, not unresolved", () => {
  assert.equal(subagentIdentity({ transcript_path: 12345 }, {}).kind, "invalid-identity");
});

// NVA-CF-NULLTID (2026-08-29): a JSON-serialized `transcript_path: null` (a
// host that emits null rather than omitting the key) is a legitimate
// "absent" encoding -- it must route the same as undefined/blank-string
// into the fail-OPEN "unresolved" lane, never the fail-CLOSED
// "invalid-identity" lane. Before this fix it landed in "invalid-identity"
// with the fixed sentinel agentId, which guard-lifecycle-ready.mjs's
// bootstrap-receipt gate can never clear (no receipt is ever written for a
// non-"subagent" kind), permanently blocking every Edit/Write/NotebookEdit
// for that session with no recovery route.
test("subagentIdentity: a null transcript_path is unresolved (treated as absent), not invalid-identity", () => {
  const identity = subagentIdentity({ transcript_path: null }, {});
  assert.equal(identity.kind, "unresolved");
  assert.equal(identity.reason, "transcript-path-missing-or-relative");
});

test("evaluateDispatchBudgetGuard: an invalid-identity (present-but-relative transcript_path) call still fails open here, unaffected -- this guard's own documented fail-open-but-visible posture is unchanged by the new kind", () => {
  const store = makeStore();
  const input = { transcript_path: "relative/session/subagents/agent-x.jsonl", tool_name: "Read", tool_input: { file_path: "/x" } };
  const result = evaluateDispatchBudgetGuard(input, baseOptions(store));
  assert.equal(result.exitCode, 0);
});

// pipeline.dispatch-budget-invalid-identity-fails-closed (2026-08-29,
// NVA-R7-INVALIDIDENTITY): the call itself still admits (exitCode 0,
// unchanged -- see the neighboring "still fails open" test above and this
// guard's own documented Fail-open-but-visible posture: a rate-limiting
// budget gate blocking every tool call outright on an unreadable identity is
// a much heavier act than refusing a write). What must change is the
// RECORD: an invalid-identity call must be recorded under its own distinct
// branch and its TRUE reason, never silently merged into -- or made to look
// like -- a resolved-but-undefined agent type's "max-turns-unresolvable"
// shape, which is what it fell through to before this fix and which
// actively discarded the distinction the F02 sentinel exists to preserve.
test("evaluateDispatchBudgetGuard: an invalid-identity call is recorded under its own distinct branch and TRUE reason, never the misleading max-turns-unresolvable shape", () => {
  const store = makeStore();
  const input = { transcript_path: "relative/session/subagents/agent-x.jsonl", tool_name: "Read", tool_input: { file_path: "/x" } };
  const result = evaluateDispatchBudgetGuard(input, baseOptions(store));
  assert.equal(result.exitCode, 0);
  const unresolvedRaw = store.files.get(`${COMMON_DIR}/agent-pipeline/dispatch-budget/unresolved.jsonl`);
  assert.ok(unresolvedRaw, "an invalid-identity call must still be recorded for visibility");
  const record = JSON.parse(unresolvedRaw.trim());
  assert.equal(record.kind, "invalid-identity");
  assert.equal(record.branch, "invalid-identity");
  assert.equal(record.reason, "transcript-path-present-but-not-absolute");
  assert.notEqual(record.reason, "max-turns-unresolvable");
  assert.notEqual(record.branch, "max-turns-unresolved");
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
    { env: { ...process.env, CLAUDE_PROJECT_DIR: "/env/root" } },
  );
  assert.deepEqual(withRootDir.commonDirCalls, [FAKE_ROOT], "options.rootDir must win over CLAUDE_PROJECT_DIR and process.cwd()");

  const envOnly = run(
    { rootDirAbsent: true, files: seedSubagentFiles(), steps: [{ op: "guard", input: readInputObj({}) }] },
    { env: { ...process.env, CLAUDE_PROJECT_DIR: "/env/root" } },
  );
  assert.deepEqual(envOnly.commonDirCalls, ["/env/root"], "CLAUDE_PROJECT_DIR must win over process.cwd() when no options.rootDir override is given");

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

test("a complete lock in its two-link publication interval is retryable contention", () => {
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
  const config = Buffer.from(JSON.stringify({ commonDir, counterPath }), "utf8").toString("base64");
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
    "const [guardPath, commonDir, inputB64] = process.argv.slice(2);",
    "const mod = await import(guardPath);",
    "const result = mod.evaluateDispatchBudgetGuard(JSON.parse(Buffer.from(inputB64, 'base64url').toString('utf8')), { rootDir: '/', resolveGitCommonDirFn: () => commonDir });",
    "process.exit(result.exitCode);",
  ].join("\n"));
  try {
    await Promise.all(Array.from({ length: 8 }, () => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [runner, GUARD, commonDir, Buffer.from(JSON.stringify(input)).toString("base64url")]);
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
