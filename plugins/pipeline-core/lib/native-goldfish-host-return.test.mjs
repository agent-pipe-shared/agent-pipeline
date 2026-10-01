// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { createHash } from "node:crypto";
import { mkdtempSync, openSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NATIVE_GOLDFISH_BRIEFING_SCHEMA, NATIVE_GOLDFISH_CODEX_BRIEFING_SCHEMA, NATIVE_GOLDFISH_RETURN_SCHEMA,
  NATIVE_GOLDFISH_HOST_DIRECTIVE, observeClaudeGoldfishReturn, observeCodexGoldfishReturn, parseNativeGoldfishBriefing,
  validateNativeGoldfishFinal } from "./native-goldfish-host-return.mjs";

const SHA = (text) => createHash("sha256").update(text).digest("hex");
const binding = { schema: NATIVE_GOLDFISH_BRIEFING_SCHEMA, dispatchId: "NATIVE-RETURN-1",
  candidateCommit: "a".repeat(40), candidateTree: "b".repeat(40),
  runner: "claude",
  role: "pipeline-core:goldfish-implementor", agentType: "goldfish-implementor",
  model: "claude-sonnet-5", effort: "medium", rulesetSha: "c".repeat(64),
  allowedPaths: ["src/change.mjs"],
  criticDecision: { schema: "pipeline.critic-required-decision.v1",
    trigger: { schema: "pipeline.critic-trigger-input.v1", rigorLevel: 1, riskClass: "medium", riskFlag: false,
      diff: { mechanical: false, architecture: true, guardrails: false, security: false } }, appliedRow: "T1" } };
const final = { schema: NATIVE_GOLDFISH_RETURN_SCHEMA, dispatchId: binding.dispatchId,
  candidateCommit: binding.candidateCommit, outcome: "succeeded", report: "Implemented and verified.",
  changedPaths: ["src/change.mjs"] };
const finalText = JSON.stringify(final);
const claudePending = { runner: "claude", sessionId: "session-1", toolUseId: "tool-use-1", binding };
const codexBinding = { ...binding, runner: "codex" };
const { agentType: _legacyAgentType, ...bindingWithoutNativeAlias } = binding;
const codexWorkerBinding = { ...bindingWithoutNativeAlias, schema: NATIVE_GOLDFISH_CODEX_BRIEFING_SCHEMA, runner: "codex",
  nativeAgentType: "worker" };
const codexPending = { runner: "codex", sessionId: "session-1", agentId: "agent-1", binding: codexBinding };

const cases = [
  ["NGHR01 parses one closed host briefing binding and rejects duplicate markers", () => {
    const prompt = `briefing\n<!-- pipeline-native-goldfish-host-commit:v1\n${JSON.stringify(binding)}\n-->\n${NATIVE_GOLDFISH_HOST_DIRECTIVE}\nrest`;
    assert.deepEqual(parseNativeGoldfishBriefing(prompt), { ok: true, code: "NGHR-BRIEFING-VALID", binding });
    assert.equal(parseNativeGoldfishBriefing(`${prompt}\n${prompt}`).code, "NGHR-BRIEFING-MARKER");
  }],
  ["NGHR02 rejects malformed runner, model, candidate, scope and duplicate-key briefing metadata", () => {
    for (const change of [
      { role: "pipeline-core:critic" }, { agentType: "goldfish-mechanic" },
      { model: "" }, { candidateTree: "bad" }, { allowedPaths: ["../outside"] },
      { allowedPaths: ["src/change.mjs", "src/change.mjs"] },
    ]) {
      const prompt = `<!-- pipeline-native-goldfish-host-commit:v1\n${JSON.stringify({ ...binding, ...change })}\n-->\n${NATIVE_GOLDFISH_HOST_DIRECTIVE}`;
      assert.equal(parseNativeGoldfishBriefing(prompt).ok, false);
    }
    assert.equal(parseNativeGoldfishBriefing(`<!-- pipeline-native-goldfish-host-commit:v1\n{"schema":"${binding.schema}","schema":"forged"}\n-->\n${NATIVE_GOLDFISH_HOST_DIRECTIVE}`).code, "NGHR-BRIEFING-JSON");
  }],
  ["NGHR03 admits only one successful JSON return bound to dispatch, candidate and allowed paths", () => {
    const admitted = validateNativeGoldfishFinal(finalText, { binding });
    assert.equal(admitted.ok, true, admitted.code);
    assert.equal(admitted.final.reportSha256, SHA(final.report));
    for (const change of [
      { dispatchId: "OTHER" }, { candidateCommit: "d".repeat(40) },
      { outcome: "blocked", changedPaths: [] }, { changedPaths: ["src/change.mjs", "outside.txt"] },
      { changedPaths: ["../outside"] }, { extra: true },
    ]) assert.equal(validateNativeGoldfishFinal(JSON.stringify({ ...final, ...change }), { binding }).ok, false);
    assert.equal(validateNativeGoldfishFinal(`\`${finalText}\``, { binding }).code, "NGHR-FINAL-JSON");
    assert.equal(validateNativeGoldfishFinal(`{"schema":"${final.schema}","schema":"forged"}`, { binding }).code, "NGHR-FINAL-JSON");
  }],
  ["NGHR04 Claude Task/Agent return requires exact tool/session correlation, successful completion and stable resolved model", () => {
    const input = { hook_event_name: "PostToolUse", tool_name: "Task", tool_use_id: "tool-use-1",
      session_id: "session-1", tool_response: { status: "completed", resolvedModel: binding.model,
        modelsUsed: [binding.model], content: [{ type: "text", text: finalText }] } };
    const observed = observeClaudeGoldfishReturn(input, claudePending);
    assert.equal(observed.ok, true, observed.code);
    assert.equal(observed.runner, "claude");
    assert.equal(observeClaudeGoldfishReturn({ ...input, tool_name: "Agent" }, claudePending).ok, true);
    assert.equal(observeClaudeGoldfishReturn({ ...input, tool_use_id: "other" }, claudePending).ok, false);
    assert.equal(observeClaudeGoldfishReturn({ ...input, tool_response: { ...input.tool_response, resolvedModel: "other-model" } }, claudePending).code, "NGHR-CLAUDE-RETURN-MODEL");
    assert.equal(observeClaudeGoldfishReturn({ ...input, tool_response: { ...input.tool_response, modelsUsed: [binding.model, "other-model"] } }, claudePending).code, "NGHR-CLAUDE-MODEL-SWITCH");
    assert.equal(observeClaudeGoldfishReturn({ ...input, tool_response: { ...input.tool_response, status: "error" } }, claudePending).ok, false);
  }],
  ["NGHR05 Codex return requires the exact prior start-stop agent and session binding", () => {
    const input = { hook_event_name: "SubagentStop", session_id: "session-1", agent_id: "agent-1",
      agent_type: codexBinding.agentType, model: codexBinding.model, last_assistant_message: finalText };
    const observed = observeCodexGoldfishReturn(input, codexPending);
    assert.equal(observed.ok, true, observed.code);
    assert.equal(observed.assurance, "host-observed-subagent-start-stop-and-session-route");
    assert.equal(observeCodexGoldfishReturn({ ...input, agent_id: "other" }, codexPending).ok, false);
    assert.equal(observeCodexGoldfishReturn({ ...input, session_id: "other" }, codexPending).ok, false);
    assert.equal(observeCodexGoldfishReturn({ ...input, agent_type: "critic" }, codexPending).ok, false);
    assert.equal(observeCodexGoldfishReturn({ ...input, model: "other-model" }, codexPending).ok, false);
    assert.equal(observeCodexGoldfishReturn({ ...input, last_assistant_message: "partial" }, codexPending).ok, false);
  }],
  ["NGHR06 v2 binds Codex worker transport separately from the functional Goldfish role", () => {
    const prompt = `<!-- pipeline-native-goldfish-host-commit:v2\n${JSON.stringify(codexWorkerBinding)}\n-->\n${NATIVE_GOLDFISH_HOST_DIRECTIVE}`;
    const parsed = parseNativeGoldfishBriefing(prompt);
    assert.equal(parsed.ok, true, parsed.code);
    assert.equal(parsed.binding.nativeAgentType, "worker");
    assert.equal(parsed.binding.role, "pipeline-core:goldfish-implementor");
    assert.equal(parsed.binding.agentType, "goldfish-implementor");
    for (const change of [{ nativeAgentType: "goldfish-implementor" }, { runner: "claude" }, { extra: true }]) {
      const invalid = `<!-- pipeline-native-goldfish-host-commit:v2\n${JSON.stringify({ ...codexWorkerBinding, ...change })}\n-->\n${NATIVE_GOLDFISH_HOST_DIRECTIVE}`;
      assert.equal(parseNativeGoldfishBriefing(invalid).ok, false);
    }
    assert.equal(parseNativeGoldfishBriefing(`${prompt}\n${prompt}`).ok, false);
  }],
  ["NGHR07 v2 SubagentStop requires the exact native worker type", () => {
    const pending = { ...codexPending, binding: { ...codexWorkerBinding, adapterVersion: 2,
      agentType: "goldfish-implementor" } };
    const input = { hook_event_name: "SubagentStop", session_id: "session-1", agent_id: "agent-1",
      agent_type: "worker", model: codexWorkerBinding.model, last_assistant_message: finalText };
    assert.equal(observeCodexGoldfishReturn(input, pending).ok, true);
    for (const change of [{ session_id: "other-session" }, { agent_id: "other-agent" },
      { model: "other-model" }, { hook_event_name: "SubagentStart" }, { agent_type: "goldfish-implementor" }]) {
      assert.equal(observeCodexGoldfishReturn({ ...input, ...change }, pending).ok, false);
    }
  }],
];

const temp = mkdtempSync(join(tmpdir(), "native-goldfish-host-return-"));
try {
  for (const [name, run] of cases) {
    try { run(); process.stdout.write(`✔ ${name}\n`); }
    catch (error) { process.stdout.write(`✖ ${name}\n`); throw error; }
  }
} finally { rmSync(temp, { recursive: true, force: true }); }

const fd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: cases.map(([name, run]) => ({ id: name.slice(0, 6), name: name.slice(7), run })),
  fd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
