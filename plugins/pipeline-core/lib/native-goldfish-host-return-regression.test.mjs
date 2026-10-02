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
