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
export const NATIVE_GOLDFISH_ITEM_BRIEFING_SCHEMA = "pipeline.native-goldfish-host-briefing.v3";
export const NATIVE_GOLDFISH_CODEX_BRIEFING_SCHEMA = "pipeline.native-goldfish-host-briefing.v2";
export const NATIVE_GOLDFISH_HOST_DIRECTIVE = "NATIVE HOST-COMMIT RULE: Do not run git add, git commit, or write a dispatch-record; return the exact JSON contract below and leave all changes uncommitted for the host.";

const SHA = /^[a-f0-9]{64}$/u;
const OID = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
/**
 * The acceptance-criterion id grammar, `AC-<n>` or the closed compound `AC-E<epic>-<story>-<nn>`, at most 64 characters.
 * It is the SAME literal source string as `CRITERION_ID_SOURCE` in `critic-accepted-contract.mjs`, copied rather than
 * imported on purpose: that module pulls `scripts/pipeline-state.mjs` and the proof modules into this lightweight
 * hook-path validator. A pin (consumer-spec-criterion-binds-the-first-item-delivery) asserts the two strings are equal,
 * so they cannot drift apart.
 */
export const HOST_CRITERION_ID_SOURCE = 'AC-(?:[1-9][0-9]{0,60}|E[1-9][0-9]{0,3}-[0-9]{1,4}-[0-9]{1,4})';
const CRITERION_ID = new RegExp(`^${HOST_CRITERION_ID_SOURCE}$`, 'u');
const CRITERION_ID_MAX_LENGTH = 64;
const isCriterionId = (value) => typeof value === 'string' && value.length <= CRITERION_ID_MAX_LENGTH && CRITERION_ID.test(value);
const ROLE_TO_AGENT = Object.freeze({
  "pipeline-core:goldfish-implementor": "goldfish-implementor",
  "pipeline-core:goldfish-mechanic": "goldfish-mechanic",
  "pipeline-core:goldfish-deep": "goldfish-deep",
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
  const markers = ["<!-- pipeline-native-goldfish-host-commit:v1\n", "<!-- pipeline-native-goldfish-host-commit:v2\n", "<!-- pipeline-native-goldfish-host-commit:v3\n"];
  const found = markers.map((marker) => ({ marker, start: prompt.indexOf(marker) })).filter(({ start }) => start >= 0);
  if (found.length !== 1 || prompt.indexOf(found[0].marker, found[0].start + found[0].marker.length) >= 0) return fail("NGHR-BRIEFING-MARKER");
  const { marker, start } = found[0];
  const version = marker.includes(":v3") ? 3 : marker.includes(":v2") ? 2 : 1;
  const bodyStart = start + marker.length;
  const end = prompt.indexOf("\n-->", bodyStart);
  if (end < 0) return fail("NGHR-BRIEFING-MARKER");
  const trailing = prompt.slice(end + 4);
  if (/<!-- pipeline-native-goldfish-host-commit:v[123]/u.test(trailing)) return fail("NGHR-BRIEFING-MARKER");
  if (prompt.split(NATIVE_GOLDFISH_HOST_DIRECTIVE).length !== 2) return fail("NGHR-BRIEFING-DIRECTIVE");
  let binding;
  try { binding = parseStrictJson(prompt.slice(bodyStart, end)); } catch { return fail("NGHR-BRIEFING-JSON"); }
  const codexNative = version === 2 || version === 3 && binding.runner === "codex";
  const validFields = [...(codexNative ? CODEX_BRIEFING_FIELDS : BRIEFING_FIELDS),...(version === 3 ? ["itemDelivery"] : [])];
  if (!exact(binding, validFields) || binding.schema !== (version === 3 ? NATIVE_GOLDFISH_ITEM_BRIEFING_SCHEMA : version === 2 ? NATIVE_GOLDFISH_CODEX_BRIEFING_SCHEMA : NATIVE_GOLDFISH_BRIEFING_SCHEMA)
    || !["claude", "codex"].includes(binding.runner)
    || !ID.test(binding.dispatchId ?? "") || !OID.test(binding.candidateCommit ?? "")
    || !OID.test(binding.candidateTree ?? "") || !Object.hasOwn(ROLE_TO_AGENT, binding.role)
    || (!codexNative && binding.agentType !== ROLE_TO_AGENT[binding.role])
    || (codexNative && (binding.runner !== "codex" || binding.nativeAgentType !== "worker"))
    || typeof binding.model !== "string" || binding.model.length === 0 || binding.model.length > 128
    || typeof binding.effort !== "string" || binding.effort.length === 0 || binding.effort.length > 32
    || !SHA.test(binding.rulesetSha ?? "") || !Array.isArray(binding.allowedPaths)
    || binding.allowedPaths.length === 0 || binding.allowedPaths.length > 64
    || !binding.allowedPaths.every(normalizedPath)
    || new Set(binding.allowedPaths).size !== binding.allowedPaths.length) return fail("NGHR-BRIEFING-SHAPE");
  if(version === 3 && (!validateItemDeliveryBriefing(binding.itemDelivery).ok || !binding.allowedPaths.every(path=>binding.itemDelivery.checks.some(check=>check.dependencies.includes(path)))))return fail("NGHR-ITEM-DELIVERY-SHAPE");
  try {
    const required = binding.criticDecision?.schema === CRITIC_REQUIRED_SCHEMA;
    if (!required && binding.criticDecision?.schema !== CRITIC_SKIP_SCHEMA) return fail("NGHR-BRIEFING-CRITIC-DISPOSITION");
    binding.criticDecision = validateCriticDecision(binding.criticDecision, { required });
  } catch { return fail("NGHR-BRIEFING-CRITIC-DISPOSITION"); }
  return { ok: true, code: "NGHR-BRIEFING-VALID", binding: { ...binding,
    ...(codexNative ? { agentType: ROLE_TO_AGENT[binding.role], adapterVersion: 2 } : {}),
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

/** Typed selection data; original approval and actual source bytes are checked
 * independently by the authenticated continuation writer. */
export function validateItemDeliveryBriefing(value) {
  const locator=value?.criterionLocator;
  if(!exact(value,['schema','sliceId','itemId','criterionLocator','checks'])||value.schema!=='pipeline.item-delivery-briefing.v1'
    ||!ID.test(value.sliceId??'')||!ID.test(value.itemId??'')
    ||!exact(locator,['schema','sourcePath','sourceSha256','criterionId','startByte','endByte','excerptSha256'])
    ||locator.schema!=='pipeline.critic-criterion-locator.v1'||!normalizedPath(locator.sourcePath)
    ||!SHA.test(locator.sourceSha256??'')||!SHA.test(locator.excerptSha256??'')||!isCriterionId(locator.criterionId)
    ||!Number.isSafeInteger(locator.startByte)||!Number.isSafeInteger(locator.endByte)||locator.startByte<0||locator.endByte<=locator.startByte||locator.endByte-locator.startByte>4096
    ||!Array.isArray(value.checks)||value.checks.length<1||value.checks.length>16
    ||new Set(value.checks.map(check=>check.id)).size!==value.checks.length
    ||value.checks.some(check=>!exact(check,['id','path','dependencies'])||!ID.test(check.id??'')||!normalizedPath(check.path)
      ||!/\.test\.(?:mjs|cjs|js)$/u.test(check.path)||!Array.isArray(check.dependencies)||check.dependencies.length<1||check.dependencies.length>64
      ||!check.dependencies.every(normalizedPath)||new Set(check.dependencies).size!==check.dependencies.length))return fail('NGHR-ITEM-DELIVERY-SHAPE');
  return {ok:true,code:'NGHR-ITEM-DELIVERY-VALID'};
}
