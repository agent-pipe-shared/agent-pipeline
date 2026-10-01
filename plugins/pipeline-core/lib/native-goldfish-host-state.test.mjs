// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { bindNativeCodexStart, prepareNativeGoldfishHostState,
  readNativeCodexPending, readNativeGoldfishPending } from "./native-goldfish-host-state.mjs";
import { NATIVE_GOLDFISH_HOST_DIRECTIVE } from "./native-goldfish-host-return.mjs";

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "native-goldfish-host-state-"));
  const commonDir = join(root, ".git");
  try {
    mkdirSync(commonDir);
    const commit = "a".repeat(40); const tree = "b".repeat(40);
    const dependencies = {
      git: (_root, args) => args.at(-1) === "HEAD^{commit}" ? commit : tree,
      resolveCommonDir: () => commonDir,
      captureBaseline: ({ root: candidateRoot, candidateCommit, resultPath }) => {
        if (existsSync(join(candidateRoot, "dirty-marker"))) return { ok: false, code: "AGY-HOST-BASELINE-DIRTY" };
        return { ok: true, baseline: { schema: "pipeline.agy-host-commit-baseline.v1",
          root: candidateRoot, candidateCommit, resultPath, untracked: [] } };
      },
    };
    return run({ root, commonDir, dependencies, commit, tree });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function prompt(binding) { return `Goldfish briefing\n<!-- pipeline-native-goldfish-host-commit:v1\n${JSON.stringify(binding)}\n-->\n${NATIVE_GOLDFISH_HOST_DIRECTIVE}\nReturn contract follows.`; }
function makeBinding({ dispatchId, commit, tree, runner = "claude" }) {
  return { schema: "pipeline.native-goldfish-host-briefing.v1", dispatchId,
    candidateCommit: commit, candidateTree: tree, runner, role: "pipeline-core:goldfish-implementor",
    agentType: "goldfish-implementor", model: "gpt-6-luna", effort: "high",
    rulesetSha: "c".repeat(64), allowedPaths: ["src/change.mjs"],
    criticDecision: { schema: "pipeline.critic-required-decision.v1",
      trigger: { schema: "pipeline.critic-trigger-input.v1", rigorLevel: 1, riskClass: "medium", riskFlag: false,
        diff: { mechanical: false, architecture: true, guardrails: false, security: false } }, appliedRow: "T1" } };
}
function makeCodexWorkerBinding({ dispatchId, commit, tree }) {
  const binding = makeBinding({ dispatchId, commit, tree, runner: "codex" });
  const { agentType: _legacyAgentType, ...withoutNativeAlias } = binding;
  return { ...withoutNativeAlias, schema: "pipeline.native-goldfish-host-briefing.v2", nativeAgentType: "worker" };
}
function toolInput(runner, { root, session, toolUseId, binding, toolName = "Task" }) {
  return runner === "claude"
    ? { cwd: root, session_id: session, tool_name: toolName, tool_use_id: toolUseId,
      tool_input: { subagent_type: "pipeline-core:goldfish-implementor", prompt: prompt(binding), run_in_background: false } }
    : { cwd: root, session_id: session, tool_name: "spawn_agent", tool_use_id: toolUseId,
      tool_input: { agent_type: "goldfish-implementor", message: prompt(binding) } };
}

const cases = [
  { id: "NGHS01", name: "unmarked native dispatch stays untouched", run: () => fixture(({ root, commit, tree }) => {
    const input = toolInput("claude", { root, session: "session-1", toolUseId: "tool-1", binding: makeBinding({ dispatchId: "TASK-1", commit, tree }) });
    input.tool_input.prompt = "ordinary Goldfish briefing";
    assert.equal(prepareNativeGoldfishHostState({ root, runner: "claude", input }).code, "NGHS-NOT-APPLICABLE");
  }) },
  { id: "NGHS02", name: "clean Claude preflight binds exact session and tool-use identity", run: () => fixture(({ root, commit, tree, dependencies }) => {
    const binding = makeBinding({ dispatchId: "TASK-CLAUDE-1", commit, tree });
    const input = toolInput("claude", { root, session: "session-claude", toolUseId: "tool-claude-1", binding });
    const prepared = prepareNativeGoldfishHostState({ root, runner: "claude", input }, dependencies);
    assert.equal(prepared.ok, true, prepared.code);
    const readback = readNativeGoldfishPending({ commonDir: join(root, ".git"), runner: "claude",
      sessionId: "session-claude", correlationId: "tool-claude-1" });
    assert.equal(readback.ok, true, readback.code);
    assert.equal(readback.state.binding.dispatchId, binding.dispatchId);
    assert.equal(readback.state.baseline.candidateCommit, commit);
    const agentBinding = makeBinding({ dispatchId: "TASK-CLAUDE-AGENT-1", commit, tree });
    const agentInput = toolInput("claude", { root, session: "session-agent", toolUseId: "tool-agent-1",
      binding: agentBinding, toolName: "Agent" });
    assert.equal(prepareNativeGoldfishHostState({ root, runner: "claude", input: agentInput }, dependencies).ok, true);
    const backgroundInput = toolInput("claude", { root, session: "session-bg", toolUseId: "tool-bg-1", binding: agentBinding });
    delete backgroundInput.tool_input.run_in_background;
    assert.equal(prepareNativeGoldfishHostState({ root, runner: "claude", input: backgroundInput }, dependencies).code,
      "NGHS-CLAUDE-FOREGROUND-REQUIRED");
  }) },
  { id: "NGHS03", name: "Codex start-stop association consumes resolved pending bindings and refuses true ambiguity", run: () => fixture(({ root, commit, tree, dependencies }) => {
    const first = makeBinding({ dispatchId: "TASK-CODEX-1", commit, tree, runner: "codex" });
    const initial = prepareNativeGoldfishHostState({ root, runner: "codex",
      input: toolInput("codex", { root, session: "session-codex", toolUseId: "tool-codex-1", binding: first }) }, dependencies);
    assert.equal(initial.ok, true, initial.code);
    const start = { hook_event_name: "SubagentStart", session_id: "session-codex",
      agent_id: "child-codex-1", agent_type: "goldfish-implementor", model: first.model };
    assert.equal(bindNativeCodexStart({ commonDir: join(root, ".git"), input: start }).ok, true);
    const stop = { ...start, hook_event_name: "SubagentStop" };
    const pending = readNativeCodexPending({ commonDir: join(root, ".git"), input: stop });
    assert.equal(pending.ok, true, pending.code);
    assert.equal(pending.state.agentId, start.agent_id);
    assert.equal(pending.state.binding.dispatchId, first.dispatchId);

    const second = makeBinding({ dispatchId: "TASK-CODEX-2", commit, tree, runner: "codex" });
    const another = prepareNativeGoldfishHostState({ root, runner: "codex",
      input: toolInput("codex", { root, session: "session-codex", toolUseId: "tool-codex-2", binding: second }) }, dependencies);
    assert.equal(another.ok, true, another.code);
    const secondStart = { ...start, agent_id: "child-codex-2" };
    assert.equal(bindNativeCodexStart({ commonDir: join(root, ".git"), input: secondStart }).ok, true);
    const secondStop = readNativeCodexPending({ commonDir: join(root, ".git"), input: {
      ...secondStart, hook_event_name: "SubagentStop" } });
    assert.equal(secondStop.ok, true, secondStop.code);
    assert.equal(secondStop.state.binding.dispatchId, second.dispatchId);

    for (const suffix of ["3", "4"]) {
      const next = makeBinding({ dispatchId: `TASK-CODEX-${suffix}`, commit, tree, runner: "codex" });
      const pendingNext = prepareNativeGoldfishHostState({ root, runner: "codex",
        input: toolInput("codex", { root, session: "session-codex", toolUseId: `tool-codex-${suffix}`, binding: next }) }, dependencies);
      assert.equal(pendingNext.ok, true, pendingNext.code);
    }
    assert.equal(bindNativeCodexStart({ commonDir: join(root, ".git"), input: {
      ...start, agent_id: "child-codex-3" } }).code, "NGHS-CODEX-START-AMBIGUOUS");
  }) },
  { id: "NGHS04", name: "candidate, runner role and dirty checkout are checked before model launch", run: () => fixture(({ root, commit, tree, dependencies }) => {
    const binding = makeBinding({ dispatchId: "TASK-DRIFT-1", commit, tree });
    const wrongCandidate = toolInput("claude", { root, session: "session-drift", toolUseId: "tool-drift-1",
      binding: { ...binding, candidateCommit: "0".repeat(40) } });
    assert.equal(prepareNativeGoldfishHostState({ root, runner: "claude", input: wrongCandidate }, dependencies).code, "NGHS-CANDIDATE-MISMATCH");
    const wrongRole = toolInput("claude", { root, session: "session-drift", toolUseId: "tool-drift-2",
      binding: { ...binding, role: "pipeline-core:goldfish-mechanic", agentType: "goldfish-mechanic" } });
    assert.equal(prepareNativeGoldfishHostState({ root, runner: "claude", input: wrongRole }, dependencies).code, "NGHS-ROLE-MISMATCH");
    writeFileSync(join(root, "dirty-marker"), "dirty after candidate\n");
    const dirty = toolInput("claude", { root, session: "session-drift", toolUseId: "tool-drift-3", binding });
    assert.equal(prepareNativeGoldfishHostState({ root, runner: "claude", input: dirty }, dependencies).code, "AGY-HOST-BASELINE-DIRTY");
  }) },
  { id: "NGHS05", name: "expired unstarted Codex pending state cannot poison a later exact start", run: () => fixture(({ root, commit, tree, dependencies }) => {
    const oldBinding = makeBinding({ dispatchId: "TASK-CODEX-STALE", commit, tree, runner: "codex" });
    const oldInput = toolInput("codex", { root, session: "session-expiry", toolUseId: "tool-stale", binding: oldBinding });
    const oldPending = prepareNativeGoldfishHostState({ root, runner: "codex", input: oldInput },
      { ...dependencies, nowEpochMs: () => 1_000 });
    assert.equal(oldPending.ok, true, oldPending.code);
    const start = { hook_event_name: "SubagentStart", session_id: "session-expiry", agent_id: "child-fresh",
      agent_type: oldBinding.agentType, model: oldBinding.model };
    assert.equal(bindNativeCodexStart({ commonDir: join(root, ".git"), input: start,
      nowEpochMs: 121_001 }).code, "NGHS-CODEX-START-UNBOUND");
    const freshBinding = makeBinding({ dispatchId: "TASK-CODEX-FRESH", commit, tree, runner: "codex" });
    const freshInput = toolInput("codex", { root, session: "session-expiry", toolUseId: "tool-fresh", binding: freshBinding });
    const freshPending = prepareNativeGoldfishHostState({ root, runner: "codex", input: freshInput },
      { ...dependencies, nowEpochMs: () => 121_001 });
    assert.equal(freshPending.ok, true, freshPending.code);
    assert.equal(bindNativeCodexStart({ commonDir: join(root, ".git"), input: start,
      nowEpochMs: 121_002 }).ok, true);
  }) },
  { id: "NGHS06", name: "Codex v2 binds the worker native type to the functional Goldfish role and exact start", run: () => fixture(({ root, commonDir, commit, tree, dependencies }) => {
    const binding = makeCodexWorkerBinding({ dispatchId: "TASK-CODEX-WORKER-1", commit, tree });
    const promptText = `<!-- pipeline-native-goldfish-host-commit:v2\n${JSON.stringify(binding)}\n-->\n${NATIVE_GOLDFISH_HOST_DIRECTIVE}`;
    const input = { cwd: root, session_id: "session-worker", tool_name: "spawn_agent", tool_use_id: "tool-worker",
      tool_input: { agent_type: "worker", message: promptText } };
    const prepared = prepareNativeGoldfishHostState({ root, runner: "codex", input }, dependencies);
    assert.equal(prepared.ok, true, prepared.code);
    const wrong = bindNativeCodexStart({ commonDir, input: { hook_event_name: "SubagentStart",
      session_id: "session-worker", agent_id: "child-wrong", agent_type: "goldfish-implementor", model: binding.model } });
    assert.equal(wrong.code, "NGHS-CODEX-START-UNBOUND");
    assert.equal(bindNativeCodexStart({ commonDir, input: { hook_event_name: "SubagentStart",
      session_id: "other-session", agent_id: "child-wrong-session", agent_type: "worker", model: binding.model } }).code,
      "NGHS-CODEX-START-UNBOUND");
    assert.equal(bindNativeCodexStart({ commonDir, input: { hook_event_name: "SubagentStart",
      session_id: "session-worker", agent_id: "child-wrong-model", agent_type: "worker", model: "other-model" } }).code,
      "NGHS-CODEX-START-UNBOUND");
    assert.equal(bindNativeCodexStart({ commonDir, input: { hook_event_name: "SubagentStop",
      session_id: "session-worker", agent_id: "child-malformed", agent_type: "worker", model: binding.model } }).code,
      "NGHS-CODEX-START-INPUT");
    const started = bindNativeCodexStart({ commonDir, input: { hook_event_name: "SubagentStart",
      session_id: "session-worker", agent_id: "child-worker", agent_type: "worker", model: binding.model } });
    assert.equal(started.ok, true, started.code);
    const pending = readNativeCodexPending({ commonDir, input: { hook_event_name: "SubagentStop",
      session_id: "session-worker", agent_id: "child-worker", agent_type: "worker", model: binding.model } });
    assert.equal(pending.ok, true, pending.code);
    assert.equal(pending.state.binding.role, "pipeline-core:goldfish-implementor");
    assert.equal(pending.state.binding.nativeAgentType, "worker");
  }) },
  { id: "NGHS07", name: "legacy v1 association keeps the unprefixed role in its unchanged schema", run: () => fixture(({ root, commonDir, commit, tree, dependencies }) => {
    const binding = makeBinding({ dispatchId: "TASK-CODEX-V1-PREFIXED", commit, tree, runner: "codex" });
    const input = toolInput("codex", { root, session: "session-v1-prefixed", toolUseId: "tool-v1-prefixed", binding });
    input.tool_input.agent_type = "pipeline-core:goldfish-implementor";
    assert.equal(prepareNativeGoldfishHostState({ root, runner: "codex", input }, dependencies).ok, true);
    const start = { hook_event_name: "SubagentStart", session_id: "session-v1-prefixed", agent_id: "child-v1-prefixed",
      agent_type: "pipeline-core:goldfish-implementor", model: binding.model };
    assert.equal(bindNativeCodexStart({ commonDir, input: start }).ok, true);
    const associationFiles = readdirSync(join(commonDir, "agent-pipeline", "run", "native-goldfish-host-commit"))
      .filter((filename) => filename.startsWith("agent-codex-"));
    assert.equal(associationFiles.length, 1);
    const association = JSON.parse(readFileSync(join(commonDir, "agent-pipeline", "run", "native-goldfish-host-commit", associationFiles[0]), "utf8"));
    assert.equal(association.schema, "pipeline.native-goldfish-host-agent-binding.v1");
    assert.equal(association.agentType, "goldfish-implementor");
  }) },
  { id: "NGHS08", name: "Codex v2 refuses ambiguous worker starts and malformed stops", run: () => fixture(({ root, commonDir, commit, tree, dependencies }) => {
    for (const suffix of ["A", "B"]) {
      const binding = makeCodexWorkerBinding({ dispatchId: `TASK-CODEX-AMBIGUOUS-${suffix}`, commit, tree });
      const input = { cwd: root, session_id: "session-ambiguous-worker", tool_name: "spawn_agent",
        tool_use_id: `tool-ambiguous-${suffix}`, tool_input: { agent_type: "worker",
          message: `<!-- pipeline-native-goldfish-host-commit:v2\n${JSON.stringify(binding)}\n-->\n${NATIVE_GOLDFISH_HOST_DIRECTIVE}` } };
      assert.equal(prepareNativeGoldfishHostState({ root, runner: "codex", input }, dependencies).ok, true);
    }
    const ambiguous = bindNativeCodexStart({ commonDir, input: { hook_event_name: "SubagentStart",
      session_id: "session-ambiguous-worker", agent_id: "child-ambiguous", agent_type: "worker", model: "gpt-6-luna" } });
    assert.equal(ambiguous.code, "NGHS-CODEX-START-AMBIGUOUS");
    assert.equal(readNativeCodexPending({ commonDir, input: { hook_event_name: "SubagentStop",
      session_id: "session-ambiguous-worker", agent_id: "child-ambiguous" } }).code, "NGHS-CODEX-PENDING-MISSING");
  }) },
];

const fd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w") : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases, fd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
