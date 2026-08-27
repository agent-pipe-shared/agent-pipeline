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
  assert.equal(store.files.size, 0, "no counter or unresolved state should ever be written for the orchestrator");
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

test("evaluateDispatchBudgetGuard: budget constants match the documented arithmetic for this repo's maxTurns:50 agents", () => {
  assert.equal(CLOSING_ALLOWANCE, 5);
  assert.equal(SAFETY_MARGIN, 10);
  const maxTurns = resolveMaxTurns("pipeline-core:goldfish-deep", REPO_ROOT);
  assert.equal(maxTurns - (CLOSING_ALLOWANCE + SAFETY_MARGIN), 35);
});
