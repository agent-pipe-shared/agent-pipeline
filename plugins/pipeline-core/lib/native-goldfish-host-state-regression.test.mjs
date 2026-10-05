// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, devNull } from "node:os";
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
  ? openSync(devNull, "w") : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases, fd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
