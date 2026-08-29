// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CLOSING_ALLOWANCE,
  DENIAL_CODE,
  SAFETY_MARGIN,
  evaluateDispatchBudgetGuard,
  resolveGitCommonDir,
  resolveMaxTurns,
  subagentIdentity,
} from "./guard-dispatch-budget.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const FAKE_ROOT = "/fake/root";
const SUBAGENT_TRANSCRIPT = "/fake/session/subagents/agent-abc123.jsonl";
const META_PATH = "/fake/session/subagents/agent-abc123.meta.json";
const AGENT_DEF_PATH = `${FAKE_ROOT}/plugins/pipeline-core/agents/goldfish-deep.md`;
const COMMON_DIR = "/fake/.git";

/** An in-memory fs double shared by a test's fake dependency bag -- no real disk I/O. */
function makeStore(initial = {}) {
  const files = new Map(Object.entries(initial));
  return {
    files,
    existsSyncFn: (p) => files.has(p),
    readFileSyncFn: (p) => {
      if (!files.has(p)) { const err = new Error(`ENOENT ${p}`); err.code = "ENOENT"; throw err; }
      return files.get(p);
    },
    writeFileSyncFn: (p, content) => { files.set(p, content); },
    mkdirSyncFn: () => {},
    appendFileSyncFn: (p, content) => { files.set(p, (files.get(p) ?? "") + content); },
  };
}

function baseOptions(store, overrides = {}) {
  return {
    rootDir: FAKE_ROOT,
    resolveGitCommonDirFn: () => COMMON_DIR,
    nowFn: () => "2026-08-27T00:00:00.000Z",
    ...store,
    ...overrides,
  };
}

function readInput(tool_input) {
  return { transcript_path: SUBAGENT_TRANSCRIPT, tool_name: "Read", tool_input };
}

function seedSubagent(maxTurns = 20) {
  return makeStore({
    [META_PATH]: JSON.stringify({ agentType: "pipeline-core:goldfish-deep", description: "x", toolUseId: "t1", spawnDepth: 1 }),
    [AGENT_DEF_PATH]: `---\nname: goldfish-deep\nmodel: sonnet\nmaxTurns: ${maxTurns}\ntools: Read\n---\nbody\n`,
  });
}

test("subagentIdentity: transcript_path under a subagents/ directory with valid meta.json resolves as a dispatched subagent", () => {
  const store = seedSubagent();
  const identity = subagentIdentity({ transcript_path: SUBAGENT_TRANSCRIPT }, store);
  assert.equal(identity.kind, "subagent");
  assert.equal(identity.agentId, "abc123");
  assert.equal(identity.agentType, "pipeline-core:goldfish-deep");
});

test("subagentIdentity: transcript_path NOT under a subagents/ directory resolves as the orchestrator", () => {
  const identity = subagentIdentity({ transcript_path: "/fake/session/top-level.jsonl" }, {});
  assert.equal(identity.kind, "orchestrator");
});

test("subagentIdentity: missing transcript_path is unresolved (ambiguous), not orchestrator", () => {
  assert.equal(subagentIdentity({}, {}).kind, "unresolved");
  assert.equal(subagentIdentity({ transcript_path: "" }, {}).kind, "unresolved");
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

test("subagentIdentity: a present but non-string transcript_path is also invalid-identity, not unresolved", () => {
  assert.equal(subagentIdentity({ transcript_path: 12345 }, {}).kind, "invalid-identity");
  assert.equal(subagentIdentity({ transcript_path: null }, {}).kind, "invalid-identity");
});

test("evaluateDispatchBudgetGuard: an invalid-identity (present-but-relative transcript_path) call still fails open here, unaffected -- this guard's own documented fail-open-but-visible posture is unchanged by the new kind", () => {
  const store = makeStore();
  const input = { transcript_path: "relative/session/subagents/agent-x.jsonl", tool_name: "Read", tool_input: { file_path: "/x" } };
  const result = evaluateDispatchBudgetGuard(input, baseOptions(store));
  assert.equal(result.exitCode, 0);
});

test("subagentIdentity: missing sibling meta.json is unresolved", () => {
  const identity = subagentIdentity({ transcript_path: SUBAGENT_TRANSCRIPT }, makeStore());
  assert.equal(identity.kind, "unresolved");
  assert.equal(identity.reason, "meta-file-missing");
});

test("subagentIdentity: spawnDepth that is not a number >= 1 is unresolved, never force-fit", () => {
  const store = makeStore({ [META_PATH]: JSON.stringify({ agentType: "pipeline-core:goldfish-deep", spawnDepth: 0 }) });
  assert.equal(subagentIdentity({ transcript_path: SUBAGENT_TRANSCRIPT }, store).reason, "spawn-depth-not-a-dispatch");
});

test("resolveMaxTurns: reads the live maxTurns value out of a real agent definition's frontmatter (no mocking)", () => {
  const value = resolveMaxTurns("pipeline-core:goldfish-deep", REPO_ROOT);
  assert.equal(typeof value, "number");
  assert.ok(value > 0);
});

test("resolveMaxTurns: unknown agent name resolves null rather than throwing", () => {
  assert.equal(resolveMaxTurns("pipeline-core:not-a-real-agent", REPO_ROOT), null);
});

test("resolveGitCommonDir: resolves a real .git directory in this checkout (no mocking)", () => {
  const common = resolveGitCommonDir(REPO_ROOT);
  assert.equal(typeof common, "string");
  assert.ok(common.endsWith(".git"));
});

test("evaluateDispatchBudgetGuard: counts across calls, allowing every call up to the working cap", () => {
  const store = seedSubagent(20); // workingCap = 20 - (5 + 10) = 5
  for (let i = 1; i <= 5; i += 1) {
    const result = evaluateDispatchBudgetGuard(readInput({ file_path: "/x" }), baseOptions(store));
    assert.equal(result.exitCode, 0, `call ${i} should be allowed`);
  }
  const counterRaw = store.files.get(`${COMMON_DIR}/agent-pipeline/dispatch-budget/abc123.json`);
  assert.ok(counterRaw, "a counter file must exist after calls");
  assert.equal(JSON.parse(counterRaw).count, 5);
});

test("evaluateDispatchBudgetGuard: refuses a non-closing working call once the cap is crossed", () => {
  const store = seedSubagent(20); // workingCap = 5
  for (let i = 1; i <= 5; i += 1) evaluateDispatchBudgetGuard(readInput({ file_path: "/x" }), baseOptions(store));
  const result = evaluateDispatchBudgetGuard(readInput({ file_path: "/x" }), baseOptions(store));
  assert.equal(result.exitCode, 2);
  assert.match(result.stderr, new RegExp(DENIAL_CODE));
});

test("evaluateDispatchBudgetGuard: each permitted closing act still passes after the cap", () => {
  const store = seedSubagent(20); // workingCap = 5
  for (let i = 1; i <= 5; i += 1) evaluateDispatchBudgetGuard(readInput({ file_path: "/x" }), baseOptions(store));

  const dispatchRecordWrite = {
    transcript_path: SUBAGENT_TRANSCRIPT,
    tool_name: "Write",
    tool_input: { file_path: `${FAKE_ROOT}/evidence/dispatch-record-NVA-BUDGETGUARD-1.json`, content: "{}" },
  };
  assert.equal(evaluateDispatchBudgetGuard(dispatchRecordWrite, baseOptions(store)).exitCode, 0);

  const gitAdd = { transcript_path: SUBAGENT_TRANSCRIPT, tool_name: "Bash", tool_input: { command: "git add -- evidence/x.json" } };
  assert.equal(evaluateDispatchBudgetGuard(gitAdd, baseOptions(store)).exitCode, 0);

  const gitCommit = { transcript_path: SUBAGENT_TRANSCRIPT, tool_name: "Bash", tool_input: { command: "git commit -F m.txt -- evidence/x.json" } };
  assert.equal(evaluateDispatchBudgetGuard(gitCommit, baseOptions(store)).exitCode, 0);

  // a differently-shaped call after the same cap is still refused
  const otherEdit = { transcript_path: SUBAGENT_TRANSCRIPT, tool_name: "Edit", tool_input: { file_path: `${FAKE_ROOT}/lib/x.mjs`, old_string: "a", new_string: "b" } };
  assert.equal(evaluateDispatchBudgetGuard(otherEdit, baseOptions(store)).exitCode, 2);
});

test("evaluateDispatchBudgetGuard: the orchestrating session is never limited, however many calls it makes", () => {
  const store = makeStore();
  const orchestratorInput = { transcript_path: "/fake/session/top-level.jsonl", tool_name: "Read", tool_input: { file_path: "/x" } };
  for (let i = 1; i <= 50; i += 1) {
    const result = evaluateDispatchBudgetGuard(orchestratorInput, baseOptions(store));
    assert.equal(result.exitCode, 0, `orchestrator call ${i} must never be blocked`);
  }
  // No per-agent counter is ever written for the orchestrator -- only the bounded
  // once-per-session observation marker (NVA-BUDGETROOT-1; see the dedicated bound
  // test below for the "still just one file" assertion).
  const counterOrUnresolvedFiles = [...store.files.keys()].filter(
    (p) => p.endsWith("unresolved.jsonl") || (p.includes("/dispatch-budget/") && !p.includes("orchestrator-seen")),
  );
  assert.deepEqual(counterOrUnresolvedFiles, [], "no counter or unresolved.jsonl state should ever be written for the orchestrator");
});

test("evaluateDispatchBudgetGuard: the orchestrator branch records exactly one bounded observation for its session (NVA-BUDGETROOT-1)", () => {
  const store = makeStore();
  const orchestratorInput = { transcript_path: "/fake/session/top-level.jsonl", tool_name: "Read", tool_input: { file_path: "/x" } };
  const result = evaluateDispatchBudgetGuard(orchestratorInput, baseOptions(store));
  assert.equal(result.exitCode, 0);
  const markerPath = `${COMMON_DIR}/agent-pipeline/dispatch-budget/orchestrator-seen/top-level.json`;
  const raw = store.files.get(markerPath);
  assert.ok(raw, "an orchestrator observation marker must exist");
  const record = JSON.parse(raw.trim());
  assert.equal(record.branch, "orchestrator");
  assert.equal(record.root, FAKE_ROOT);
  assert.equal(record.commonDir, COMMON_DIR);
  assert.equal(record.transcriptPath, "/fake/session/top-level.jsonl");
  assert.equal(record.at, "2026-08-27T00:00:00.000Z");
});

test("evaluateDispatchBudgetGuard: the orchestrator observation sink is bounded -- one write per session, not one per call", () => {
  const store = makeStore();
  const orchestratorInput = { transcript_path: "/fake/session/top-level.jsonl", tool_name: "Read", tool_input: { file_path: "/x" } };
  for (let i = 1; i <= 30; i += 1) evaluateDispatchBudgetGuard(orchestratorInput, baseOptions(store));
  let writeCount = 0;
  const spyOptions = baseOptions({
    ...store,
    writeFileSyncFn: (p, c) => { writeCount += 1; store.writeFileSyncFn(p, c); },
  });
  for (let i = 1; i <= 30; i += 1) evaluateDispatchBudgetGuard(orchestratorInput, spyOptions);
  assert.equal(writeCount, 0, "once the marker exists for this session, no further write should ever occur");
});

test("evaluateDispatchBudgetGuard: rootDir precedence -- options.rootDir wins over CLAUDE_PROJECT_DIR and process.cwd()", () => {
  const store = seedSubagent();
  const calls = [];
  const spy = (dir) => { calls.push(dir); return COMMON_DIR; };
  const savedEnv = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = "/env/root";
  try {
    evaluateDispatchBudgetGuard(readInput({}), { ...baseOptions(store), resolveGitCommonDirFn: spy });
    assert.deepEqual(calls, [FAKE_ROOT], "options.rootDir must win over CLAUDE_PROJECT_DIR and process.cwd()");
  } finally {
    if (savedEnv === undefined) delete process.env.CLAUDE_PROJECT_DIR; else process.env.CLAUDE_PROJECT_DIR = savedEnv;
  }
});

test("evaluateDispatchBudgetGuard: rootDir precedence -- CLAUDE_PROJECT_DIR wins over process.cwd() when options.rootDir is absent", () => {
  const store = seedSubagent();
  const calls = [];
  const spy = (dir) => { calls.push(dir); return COMMON_DIR; };
  const savedEnv = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = "/env/root";
  try {
    const { rootDir: _drop, ...rest } = baseOptions(store);
    evaluateDispatchBudgetGuard(readInput({}), { ...rest, resolveGitCommonDirFn: spy });
    assert.deepEqual(calls, ["/env/root"], "CLAUDE_PROJECT_DIR must win over process.cwd() when no options.rootDir override is given");
  } finally {
    if (savedEnv === undefined) delete process.env.CLAUDE_PROJECT_DIR; else process.env.CLAUDE_PROJECT_DIR = savedEnv;
  }
});

test("evaluateDispatchBudgetGuard: rootDir precedence -- process.cwd() is the final fallback when neither options.rootDir nor CLAUDE_PROJECT_DIR are set", () => {
  const store = seedSubagent();
  const calls = [];
  const spy = (dir) => { calls.push(dir); return COMMON_DIR; };
  const savedEnv = process.env.CLAUDE_PROJECT_DIR;
  delete process.env.CLAUDE_PROJECT_DIR;
  try {
    const { rootDir: _drop, ...rest } = baseOptions(store);
    evaluateDispatchBudgetGuard(readInput({}), { ...rest, resolveGitCommonDirFn: spy });
    assert.deepEqual(calls, [process.cwd()], "process.cwd() must be used when neither options.rootDir nor CLAUDE_PROJECT_DIR are set");
  } finally {
    if (savedEnv === undefined) delete process.env.CLAUDE_PROJECT_DIR; else process.env.CLAUDE_PROJECT_DIR = savedEnv;
  }
});

test("evaluateDispatchBudgetGuard: a null git common dir is observed on stderr, and the allow verdict is unchanged", () => {
  const store = seedSubagent();
  const options = { ...baseOptions(store), resolveGitCommonDirFn: () => null };
  const result = evaluateDispatchBudgetGuard(readInput({ file_path: "/x" }), options);
  assert.equal(result.exitCode, 0);
  assert.match(result.stderr, /common-dir-unresolved/);
  assert.match(result.stderr, /"identityKind":"subagent"/);
});

test("evaluateDispatchBudgetGuard: orchestrator with an unresolvable common dir is still allowed, observed via stderr only, and persists nothing", () => {
  const store = makeStore();
  const orchestratorInput = { transcript_path: "/fake/session/top-level.jsonl", tool_name: "Read", tool_input: {} };
  const options = { ...baseOptions(store), resolveGitCommonDirFn: () => null };
  const result = evaluateDispatchBudgetGuard(orchestratorInput, options);
  assert.equal(result.exitCode, 0);
  assert.match(result.stderr, /common-dir-unresolved/);
  assert.equal(store.files.size, 0, "nothing should be persisted when there is nowhere safe to persist it");
});

test("evaluateDispatchBudgetGuard: a write failure in the new orchestrator observation sink never changes the allow verdict", () => {
  const store = makeStore();
  const orchestratorInput = { transcript_path: "/fake/session/top-level.jsonl", tool_name: "Read", tool_input: {} };
  const throwingOptions = baseOptions({
    ...store,
    writeFileSyncFn: () => { throw new Error("disk full"); },
  });
  const result = evaluateDispatchBudgetGuard(orchestratorInput, throwingOptions);
  assert.equal(result.exitCode, 0);
});

test("evaluateDispatchBudgetGuard: an unresolvable identity allows the call AND records it for visibility", () => {
  const store = makeStore(); // no meta.json seeded -> meta-file-missing
  const result = evaluateDispatchBudgetGuard(readInput({ file_path: "/x" }), baseOptions(store));
  assert.equal(result.exitCode, 0);
  const unresolvedRaw = store.files.get(`${COMMON_DIR}/agent-pipeline/dispatch-budget/unresolved.jsonl`);
  assert.ok(unresolvedRaw, "an unresolved-identity call must be recorded");
  const record = JSON.parse(unresolvedRaw.trim());
  assert.equal(record.reason, "meta-file-missing");
});

test("evaluateDispatchBudgetGuard: an unresolvable maxTurns (unknown agent definition) also allows and records", () => {
  const store = makeStore({
    [META_PATH]: JSON.stringify({ agentType: "pipeline-core:not-a-real-agent", spawnDepth: 1 }),
  });
  const result = evaluateDispatchBudgetGuard(readInput({ file_path: "/x" }), baseOptions(store));
  assert.equal(result.exitCode, 0);
  const unresolvedRaw = store.files.get(`${COMMON_DIR}/agent-pipeline/dispatch-budget/unresolved.jsonl`);
  const record = JSON.parse(unresolvedRaw.trim());
  assert.equal(record.reason, "max-turns-unresolvable");
});

test("evaluateDispatchBudgetGuard: workingCap always equals each agent's own maxTurns minus the documented reserve", () => {
  assert.equal(CLOSING_ALLOWANCE, 5, "the guard's own documented closing allowance");
  assert.equal(SAFETY_MARGIN, 10, "the guard's own documented safety margin");
  for (const agentName of ["goldfish-deep", "goldfish-implementor", "goldfish-mechanic"]) {
    const maxTurns = resolveMaxTurns(`pipeline-core:${agentName}`, REPO_ROOT);
    assert.ok(
      typeof maxTurns === "number" && maxTurns > 0,
      `${agentName}'s own agent definition must resolve a positive maxTurns`,
    );
    const expectedWorkingCap = maxTurns - (CLOSING_ALLOWANCE + SAFETY_MARGIN);
    // Exercised through the real guard, not just the raw formula: seed a
    // subagent whose meta.json names this exact agentType, drive it up to
    // (but not past) the expected cap, and confirm the guard itself agrees
    // -- by reading the persisted counter's own recorded workingCap, which
    // the guard derives independently inside evaluateDispatchBudgetGuard.
    const store = makeStore({
      [META_PATH]: JSON.stringify({ agentType: `pipeline-core:${agentName}`, description: "x", toolUseId: "t1", spawnDepth: 1 }),
      [`${FAKE_ROOT}/plugins/pipeline-core/agents/${agentName}.md`]: `---\nname: ${agentName}\nmodel: sonnet\nmaxTurns: ${maxTurns}\ntools: Read\n---\nbody\n`,
    });
    const result = evaluateDispatchBudgetGuard(readInput({ file_path: "/x" }), baseOptions(store));
    assert.equal(result.exitCode, 0, `${agentName}'s first call must be allowed`);
    const counterRaw = store.files.get(`${COMMON_DIR}/agent-pipeline/dispatch-budget/abc123.json`);
    assert.ok(counterRaw, `${agentName}: a counter file must exist after a call`);
    assert.equal(
      JSON.parse(counterRaw).workingCap,
      expectedWorkingCap,
      `${agentName}: guard-derived workingCap must equal maxTurns - (CLOSING_ALLOWANCE + SAFETY_MARGIN)`,
    );
  }
});
