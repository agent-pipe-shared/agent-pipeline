// SPDX-License-Identifier: SUL-1.0
/** Runner-specific native hook return adapters for host-owned Goldfish commits.
 *
 * These adapters deliberately stop before Git mutation. A caller must first
 * bind the matching pre-launch dispatch to private host state and then pass
 * the validated return to the host commit transaction. A callback payload by
 * itself is never write authority.
 */

import { createHash } from "node:crypto";
import { canonicalizeJson, parseStrictJson } from "./governance-event.mjs";
import { validateDurableDispatchReportText } from "./dispatch-record.mjs";
import { CRITIC_REQUIRED_SCHEMA, CRITIC_SKIP_SCHEMA, validateCriticDecision } from "./critic-skip-decision.mjs";

export const NATIVE_GOLDFISH_RETURN_SCHEMA = "pipeline.native-goldfish-host-return.v1";
export const NATIVE_GOLDFISH_BRIEFING_SCHEMA = "pipeline.native-goldfish-host-briefing.v1";
export const NATIVE_GOLDFISH_CODEX_BRIEFING_SCHEMA = "pipeline.native-goldfish-host-briefing.v2";
export const NATIVE_GOLDFISH_HOST_DIRECTIVE = "NATIVE HOST-COMMIT RULE: Do not run git add, git commit, or write a dispatch-record; return the exact JSON contract below and leave all changes uncommitted for the host.";

const SHA = /^[a-f0-9]{64}$/u;
const OID = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const ROLE_TO_AGENT = Object.freeze({
  "pipeline-core:goldfish-implementor": "goldfish-implementor",
  "pipeline-core:goldfish-mechanic": "goldfish-mechanic",
});
const BRIEFING_FIELDS = ["schema", "dispatchId", "candidateCommit", "candidateTree", "runner", "role",
  "agentType", "model", "effort", "rulesetSha", "allowedPaths", "criticDecision"];
const CODEX_BRIEFING_FIELDS = ["schema", "dispatchId", "candidateCommit", "candidateTree", "runner", "role",
  "nativeAgentType", "model", "effort", "rulesetSha", "allowedPaths", "criticDecision"];
const FINAL_FIELDS = ["schema", "dispatchId", "candidateCommit", "outcome", "report", "changedPaths"];

const exact = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());

function normalizedPath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 240
    && !/[\\\0\r\n]/u.test(value) && !value.startsWith("/") && !/^[A-Za-z]:/u.test(value)
    && value.split("/").every((part) => part !== "" && part !== "." && part !== ".." && part !== ".git");
}

function fail(code) { return { ok: false, code }; }

/** Parse exactly one host-generated binding block from the dispatched prompt. */
export function parseNativeGoldfishBriefing(prompt) {
  if (typeof prompt !== "string" || prompt.length > 2 * 1024 * 1024) return fail("NGHR-BRIEFING-INPUT");
  const markers = ["<!-- pipeline-native-goldfish-host-commit:v1\n", "<!-- pipeline-native-goldfish-host-commit:v2\n"];
  const found = markers.map((marker) => ({ marker, start: prompt.indexOf(marker) })).filter(({ start }) => start >= 0);
  if (found.length !== 1 || prompt.indexOf(found[0].marker, found[0].start + found[0].marker.length) >= 0) return fail("NGHR-BRIEFING-MARKER");
  const { marker, start } = found[0];
  const version = marker.includes(":v2") ? 2 : 1;
  const bodyStart = start + marker.length;
  const end = prompt.indexOf("\n-->", bodyStart);
  if (end < 0) return fail("NGHR-BRIEFING-MARKER");
  const trailing = prompt.slice(end + 4);
  if (trailing.includes("<!-- pipeline-native-goldfish-host-commit:v1") || trailing.includes("<!-- pipeline-native-goldfish-host-commit:v2")) return fail("NGHR-BRIEFING-MARKER");
  if (prompt.split(NATIVE_GOLDFISH_HOST_DIRECTIVE).length !== 2) return fail("NGHR-BRIEFING-DIRECTIVE");
  let binding;
  try { binding = parseStrictJson(prompt.slice(bodyStart, end)); } catch { return fail("NGHR-BRIEFING-JSON"); }
  const validFields = version === 2 ? CODEX_BRIEFING_FIELDS : BRIEFING_FIELDS;
  if (!exact(binding, validFields) || binding.schema !== (version === 2 ? NATIVE_GOLDFISH_CODEX_BRIEFING_SCHEMA : NATIVE_GOLDFISH_BRIEFING_SCHEMA)
    || !["claude", "codex"].includes(binding.runner)
    || !ID.test(binding.dispatchId ?? "") || !OID.test(binding.candidateCommit ?? "")
    || !OID.test(binding.candidateTree ?? "") || !Object.hasOwn(ROLE_TO_AGENT, binding.role)
    || (version === 1 && binding.agentType !== ROLE_TO_AGENT[binding.role])
    || (version === 2 && (binding.runner !== "codex" || binding.nativeAgentType !== "worker"))
    || typeof binding.model !== "string" || binding.model.length === 0 || binding.model.length > 128
    || typeof binding.effort !== "string" || binding.effort.length === 0 || binding.effort.length > 32
    || !SHA.test(binding.rulesetSha ?? "") || !Array.isArray(binding.allowedPaths)
    || binding.allowedPaths.length === 0 || binding.allowedPaths.length > 64
    || !binding.allowedPaths.every(normalizedPath)
    || new Set(binding.allowedPaths).size !== binding.allowedPaths.length) return fail("NGHR-BRIEFING-SHAPE");
  try {
    const required = binding.criticDecision?.schema === CRITIC_REQUIRED_SCHEMA;
    if (!required && binding.criticDecision?.schema !== CRITIC_SKIP_SCHEMA) return fail("NGHR-BRIEFING-CRITIC-DISPOSITION");
    binding.criticDecision = validateCriticDecision(binding.criticDecision, { required });
  } catch { return fail("NGHR-BRIEFING-CRITIC-DISPOSITION"); }
  return { ok: true, code: "NGHR-BRIEFING-VALID", binding: { ...binding,
    ...(version === 2 ? { agentType: ROLE_TO_AGENT[binding.role], adapterVersion: 2 } : {}),
    allowedPaths: [...binding.allowedPaths] } };
}

/** Validate one plain-JSON final result; prose, fences and duplicate keys fail closed. */
export function validateNativeGoldfishFinal(text, { binding } = {}) {
  if (typeof text !== "string" || text.length === 0 || Buffer.byteLength(text, "utf8") > 2 * 1024 * 1024
    || !binding || !ID.test(binding.dispatchId ?? "") || !OID.test(binding.candidateCommit ?? "")) return fail("NGHR-FINAL-INPUT");
  let value;
  try { value = parseStrictJson(text); } catch { return fail("NGHR-FINAL-JSON"); }
  if (!exact(value, FINAL_FIELDS) || value.schema !== NATIVE_GOLDFISH_RETURN_SCHEMA
    || value.dispatchId !== binding.dispatchId || value.candidateCommit !== binding.candidateCommit
    || value.outcome !== "succeeded" || typeof value.report !== "string"
    || value.report.trim() === "" || Buffer.byteLength(value.report, "utf8") > 1024 * 1024
    || !Array.isArray(value.changedPaths) || value.changedPaths.length === 0 || value.changedPaths.length > 64
    || !value.changedPaths.every(normalizedPath) || new Set(value.changedPaths).size !== value.changedPaths.length
    || [...value.changedPaths].sort().join("\0") !== value.changedPaths.join("\0")
    || !value.changedPaths.every((path) => binding.allowedPaths.includes(path))) return fail("NGHR-FINAL-SHAPE");
  try { validateDurableDispatchReportText(value.report); } catch { return fail("NGHR-FINAL-REPORT-UNSAFE"); }
  let resultSha256;
  try { resultSha256 = createHashSha256(canonicalizeJson(value)); } catch { return fail("NGHR-FINAL-CANONICALIZATION"); }
  return { ok: true, code: "NGHR-FINAL-VALIDATED", final: {
    schema: value.schema, dispatchId: value.dispatchId, candidateCommit: value.candidateCommit,
    outcome: value.outcome, report: value.report,
    resultSha256, reportSha256: createHashSha256(value.report), changedPaths: [...value.changedPaths].sort(),
  } };
}

function createHashSha256(value) { return createHash("sha256").update(value, "utf8").digest("hex"); }

function oneTextBlock(value) {
  const content = value?.content;
  if (!Array.isArray(content) || content.length !== 1 || content[0]?.type !== "text"
    || typeof content[0]?.text !== "string") return null;
  return content[0].text;
}

/** Bind Claude's foreground Task/Agent PostToolUse result to its exact call and resolved model. */
export function observeClaudeGoldfishReturn(input, pending) {
  if (!input || input.hook_event_name !== "PostToolUse" || !["Agent", "Task"].includes(input.tool_name)
    || typeof input.tool_use_id !== "string" || input.tool_use_id !== pending?.toolUseId
    || typeof input.session_id !== "string" || input.session_id !== pending?.sessionId
    || pending?.runner !== "claude" || pending.binding?.runner !== "claude") return fail("NGHR-CLAUDE-CORRELATION");
  const response = input.tool_response;
  if (!response || response.status !== "completed" || typeof response.resolvedModel !== "string"
    || response.resolvedModel !== pending.binding.model) return fail("NGHR-CLAUDE-RETURN-MODEL");
  if (Array.isArray(response.modelsUsed)
    && (response.modelsUsed.length === 0 || response.modelsUsed.some((model) => model !== pending.binding.model))) {
    return fail("NGHR-CLAUDE-MODEL-SWITCH");
  }
  const text = oneTextBlock(response);
  if (text === null) return fail("NGHR-CLAUDE-RETURN-SHAPE");
  const final = validateNativeGoldfishFinal(text, { binding: pending.binding });
  return final.ok ? { ...final, runner: "claude", assurance: "host-observed-tool-use-and-resolved-model" } : final;
}

/**
 * Codex does not expose Claude's PostToolUse correlation ID at SubagentStop.
 * A host must first bind a unique pending spawn_agent call to this exact
 * agent_id at SubagentStart; ambiguous fan-out intentionally cannot finalize.
 */
export function observeCodexGoldfishReturn(input, pending) {
  if (!input || input.hook_event_name !== "SubagentStop"
    || typeof input.agent_id !== "string" || input.agent_id !== pending?.agentId
    || typeof input.session_id !== "string" || input.session_id !== pending?.sessionId
    || pending?.runner !== "codex" || pending.binding?.runner !== "codex"
    || input.agent_type !== (pending.binding.adapterVersion === 2 ? pending.binding.nativeAgentType : pending.binding.agentType)
    || typeof input.model !== "string" || input.model !== pending.binding.model
    || typeof input.last_assistant_message !== "string") return fail("NGHR-CODEX-CORRELATION");
  const final = validateNativeGoldfishFinal(input.last_assistant_message, { binding: pending.binding });
  return final.ok ? { ...final, runner: "codex", assurance: "host-observed-subagent-start-stop-and-session-route" } : final;
}
