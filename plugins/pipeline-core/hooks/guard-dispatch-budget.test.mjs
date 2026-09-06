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
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const GUARD = fileURLToPath(new URL("./guard-dispatch-budget.mjs", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const FAKE_ROOT = "/fake/root";
const SUBAGENT_TRANSCRIPT = "/fake/session/subagents/agent-abc123.jsonl";
const META_PATH = "/fake/session/subagents/agent-abc123.meta.json";
const ORCHESTRATOR_TRANSCRIPT = "/fake/session/top-level.jsonl";
const COMMON_DIR = "/fake/.git";

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
  "  if (writeMode === 'count') writeCount += 1;",
  "  files.set(p, c);",
  "};",
  "const mkdirSyncFn = () => {};",
  "const appendFileSyncFn = (p, c) => { files.set(p, (files.get(p) || '') + c); };",
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
  "  const o = { resolveGitCommonDirFn, nowFn, existsSyncFn, readFileSyncFn, writeFileSyncFn, mkdirSyncFn, appendFileSyncFn };",
  "  if (!scenario.rootDirAbsent) o.rootDir = scenario.rootDir;",
  "  return o;",
  "}",
  "",
  "const results = [];",
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
  "  } else if (step.op === 'listFiles') {",
  "    results.push(Array.from(files.keys()));",
  "  } else if (step.op === 'filesSize') {",
  "    results.push(files.size);",
  "  } else if (step.op === 'constants') {",
  "    results.push({ DENIAL_CODE: mod.DENIAL_CODE, CLOSING_ALLOWANCE: mod.CLOSING_ALLOWANCE, SAFETY_MARGIN: mod.SAFETY_MARGIN });",
  "  } else {",
  "    throw new Error('unknown op ' + step.op);",
  "  }",
  "}",
  "",
  "console.log('BUDGETRUN-OK');",
  "console.log('RESULT: ' + JSON.stringify({ results, commonDirCalls }));",
].join("\n");

const runnerDir = mkdtempSync(join(tmpdir(), "guard-dispatch-budget-runner-"));
const RUNNER_PATH = join(runnerDir, "runner.mjs");
writeFileSync(RUNNER_PATH, RUNNER_SOURCE);
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

function readInputObj(tool_input) {
  return { transcript_path: SUBAGENT_TRANSCRIPT, tool_name: "Read", tool_input };
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

test("evaluateDispatchBudgetGuard: an invalid-identity (present-but-relative transcript_path) call still fails open here, unaffected -- this guard's own documented fail-open-but-visible posture is unchanged by the new kind", () => {
  const { results } = run({
    rootDir: FAKE_ROOT,
    steps: [{ op: "guard", input: { transcript_path: "relative/session/subagents/agent-x.jsonl", tool_name: "Read", tool_input: { file_path: "/x" } } }],
  });
  assert.equal(results[0].exitCode, 0);
});

test("evaluateDispatchBudgetGuard: an invalid-identity call is recorded under its own distinct branch and TRUE reason, never the misleading max-turns-unresolvable shape", () => {
  const { results } = run({
    rootDir: FAKE_ROOT,
    steps: [
      { op: "guard", input: { transcript_path: "relative/session/subagents/agent-x.jsonl", tool_name: "Read", tool_input: { file_path: "/x" } } },
      { op: "getFile", path: `${COMMON_DIR}/agent-pipeline/dispatch-budget/unresolved.jsonl` },
    ],
  });
  assert.equal(results[0].exitCode, 0);
  const unresolvedRaw = results[1];
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
});

test("evaluateDispatchBudgetGuard: each permitted closing act still passes after the cap", () => {
  const steps = [];
  for (let i = 1; i <= 5; i += 1) steps.push({ op: "guard", input: readInputObj({ file_path: "/x" }) }); // workingCap = 5
  steps.push({ op: "guard", input: { transcript_path: SUBAGENT_TRANSCRIPT, tool_name: "Write", tool_input: { file_path: `${FAKE_ROOT}/evidence/dispatch-record-NVA-BUDGETGUARD-1.json`, content: "{}" } } });
  steps.push({ op: "guard", input: { transcript_path: SUBAGENT_TRANSCRIPT, tool_name: "Bash", tool_input: { command: "git add -- evidence/x.json" } } });
  steps.push({ op: "guard", input: { transcript_path: SUBAGENT_TRANSCRIPT, tool_name: "Bash", tool_input: { command: "git commit -F m.txt -- evidence/x.json" } } });
  steps.push({ op: "guard", input: { transcript_path: SUBAGENT_TRANSCRIPT, tool_name: "Edit", tool_input: { file_path: `${FAKE_ROOT}/lib/x.mjs`, old_string: "a", new_string: "b" } } });
  const { results } = run({ rootDir: FAKE_ROOT, files: seedSubagentFiles(20), steps });
  assert.equal(results[5].exitCode, 0, "dispatch-record write");
  assert.equal(results[6].exitCode, 0, "git add");
  assert.equal(results[7].exitCode, 0, "git commit");
  assert.equal(results[8].exitCode, 2, "a differently-shaped call after the same cap is still refused");
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

test("evaluateDispatchBudgetGuard: an unresolvable identity allows the call AND records it for visibility", () => {
  const { results } = run({
    rootDir: FAKE_ROOT, // no meta.json seeded -> meta-file-missing
    steps: [{ op: "guard", input: readInputObj({ file_path: "/x" }) }, { op: "getFile", path: `${COMMON_DIR}/agent-pipeline/dispatch-budget/unresolved.jsonl` }],
  });
  assert.equal(results[0].exitCode, 0);
  const unresolvedRaw = results[1];
  assert.ok(unresolvedRaw, "an unresolved-identity call must be recorded");
  const record = JSON.parse(unresolvedRaw.trim());
  assert.equal(record.reason, "meta-file-missing");
});

test("evaluateDispatchBudgetGuard: an unresolvable maxTurns (unknown agent definition) also allows and records", () => {
  const { results } = run({
    rootDir: FAKE_ROOT,
    files: { [META_PATH]: JSON.stringify({ agentType: "pipeline-core:not-a-real-agent", spawnDepth: 1 }) },
    steps: [{ op: "guard", input: readInputObj({ file_path: "/x" }) }, { op: "getFile", path: `${COMMON_DIR}/agent-pipeline/dispatch-budget/unresolved.jsonl` }],
  });
  assert.equal(results[0].exitCode, 0);
  const record = JSON.parse(results[1].trim());
  assert.equal(record.reason, "max-turns-unresolvable");
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
        { op: "guard", input: readInputObj({ file_path: "/x" }) },
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
