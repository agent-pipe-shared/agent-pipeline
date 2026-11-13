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
export const ROLE_TO_AGENT = Object.freeze({
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

/** G20-48 (live Antigravity greenfield 2026-11-07): the runner set of the runner-neutral DISPATCH ADMISSION (the generated-briefing
 * rule, the write scope and the governed item queue in guard-dispatch). Those consumers parsed with the default below, so every
 * `--runner antigravity` briefing was refused DBG-GENERATED-BINDING-REQUIRED and no native Goldfish could start. They opt in with
 * this set; the default stays claude/codex for the Claude and Codex host-commit paths (A18-M1C). */
export const DISPATCH_ADMISSION_BRIEFING_RUNNERS = Object.freeze(["claude", "codex", "antigravity"]);

/** Parse exactly one host-generated binding block from the dispatched prompt. */
export function parseNativeGoldfishBriefing(prompt, { runners = ["claude", "codex"] } = {}) {
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
    || !runners.includes(binding.runner)
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

/** C23 (AC-108): the wrong-field-set condition names the keys that are missing and the keys that are not part of the contract (a misspelling
 * shows as one of each), at most 5 each. Only keys of a JSON object can be named; any other JSON value says just `fields`. */
function fieldsCondition(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return { condition: "fields" };
  const keys = Object.keys(value);
  const missingKeys = FINAL_FIELDS.filter((key) => !keys.includes(key)).slice(0, 5);
  const unexpectedKeys = keys.filter((key) => !FINAL_FIELDS.includes(key) && key !== "testFirst").slice(0, 5);
  return { condition: "fields", ...(missingKeys.length > 0 ? { missingKeys } : {}), ...(unexpectedKeys.length > 0 ? { unexpectedKeys } : {}) };
}

/** AC-164: the first sub-condition of NGHR-FINAL-SHAPE that fires, as a bounded detail, or null when the shape is valid.
 * The slugs are closed; a path is echoed only after it passed `normalizedPath` (repository-relative), at most 5, so a
 * host path or arbitrary text from the contract never travels. The checks and their order are those of the former
 * single conjunction, so admission is unchanged. */
function finalShapeCondition(value, binding, allowCheckpoint) {
  const named = (condition, paths) => (paths === undefined ? { condition } : { condition, paths: paths.slice(0, 5) });
  const hasTestFirst = value !== null && typeof value === "object" && !Array.isArray(value) && Object.hasOwn(value, "testFirst");
  if (!exact(hasTestFirst ? (({ testFirst: _t, ...rest }) => rest)(value) : value, FINAL_FIELDS)) return fieldsCondition(value);
  if (value.schema !== NATIVE_GOLDFISH_RETURN_SCHEMA) return named("schema");
  if (value.dispatchId !== binding.dispatchId) return named("dispatch-id");
  if (value.candidateCommit !== binding.candidateCommit) return named("candidate-commit");
  if (!(value.outcome === "succeeded" || (allowCheckpoint === true && value.outcome === "checkpoint"))) return named("outcome");
  if (typeof value.report !== "string") return named("report-type");
  if (value.report.trim() === "") return named("report-empty");
  if (Buffer.byteLength(value.report, "utf8") > 1024 * 1024) return named("report-oversize");
  if (!Array.isArray(value.changedPaths)) return named("changed-paths-type");
  if (value.changedPaths.length === 0) return named("changed-paths-empty");
  if (value.changedPaths.length > 64) return named("changed-paths-too-many");
  if (!value.changedPaths.every(normalizedPath)) return named("path-not-normalized");
  if (new Set(value.changedPaths).size !== value.changedPaths.length) return named("paths-duplicate");
  if ([...value.changedPaths].sort().join("\0") !== value.changedPaths.join("\0")) return named("paths-unsorted");
  const outside = value.changedPaths.filter((path) => !binding.allowedPaths.includes(path));
  if (outside.length > 0) return named("path-outside-allowed", outside);
  if (hasTestFirst) return testFirstCondition(value.testFirst);
  return null;
}

const TEST_FIRST_COMMAND_MAX = 500;
const boundedCommand = (value) => typeof value === "string" && value.trim() !== "" && value.length <= TEST_FIRST_COMMAND_MAX && !/[\0\r\n]/u.test(value);
/** C18-19 (AC-239): the optional `testFirst` block of a return. Self-attested evidence; its first failing sub-condition as a closed slug, or null. */
function testFirstCondition(block) {
  if (block === null || typeof block !== "object" || Array.isArray(block)) return { condition: "test-first-type" };
  if (!exact(block, ["red", "greenCommand"])) return { condition: "test-first-fields" };
  if (!Array.isArray(block.red)) return { condition: "test-first-red-type" };
  if (block.red.length === 0) return { condition: "test-first-red-empty" };
  if (block.red.length > 16) return { condition: "test-first-red-too-many" };
  for (const entry of block.red) {
    if (!exact(entry, ["command", "exitCode", "evidencePath"])) return { condition: "test-first-red-fields" };
    if (!boundedCommand(entry.command)) return { condition: "test-first-red-command" };
    if (!Number.isSafeInteger(entry.exitCode) || entry.exitCode === 0) return { condition: "test-first-red-exit-code" };
    if (!normalizedPath(entry.evidencePath)) return { condition: "test-first-red-evidence-path" };
  }
  if (!boundedCommand(block.greenCommand)) return { condition: "test-first-green-command" };
  return null;
}

// One Markdown fence around the WHOLE message carries the same one object and nothing else (the briefing itself shows the contract in such a
// fence, and a live Goldfish copied it, which cost a hand-written recovery). The inner text still goes through the strict parser, so a second
// block, prose or a different language tag still fails: JSON has no raw newline inside a string, so no fence line can hide inside the object.
const WHOLE_MESSAGE_JSON_FENCE = /^\s*```(?:json)?[ \t]*\r?\n([\s\S]*)\r?\n```\s*$/u;
function withoutWholeMessageFence(text) {
  const match = WHOLE_MESSAGE_JSON_FENCE.exec(text);
  return match === null ? text : match[1];
}

/** C23 (AC-108): where the text of a refused return stopped being JSON, as a closed, bounded detail that never echoes the text. The strict
 * parser reports no offset, so the position is read from the engine's own message by a second, diagnostic-only parse: nothing it accepts is
 * ever admitted. `json-truncated` = the text ends inside the value (a cut-off return); `json-syntax` = it breaks earlier; `json-duplicate-key`;
 * `json-not-strict` = the engine accepts what the strict parser refuses (for example a lone surrogate escape). */
function jsonFailureDetail(text, error) {
  if (/GE-JSON-DUPLICATE-KEY/u.test(String(error?.message))) return { condition: "json-duplicate-key" };
  let engine = null;
  try { JSON.parse(text); } catch (caught) { engine = caught; }
  if (engine === null) return { condition: "json-not-strict" };
  const message = String(engine?.message);
  const found = /\bposition (\d+)/u.exec(message);
  const position = found ? Number(found[1]) : /end of JSON input/u.test(message) ? text.length : null;
  if (!Number.isSafeInteger(position) || position > text.length) return { condition: "json-syntax" };
  // C29 (Glossover K-27): a complete JSON value followed by more text (a closing sentence, a second fence) is its own condition, so the
  // refusal says what to change instead of reading like a broken object. Still refused: the final message is the one object only.
  if (/after JSON at position/u.test(message) && position < text.length) {
    let complete = false;
    try { parseStrictJson(text.slice(0, position)); complete = true; } catch { complete = false; }
    if (complete) return { condition: "json-trailing-text", errorMessage: `a complete JSON value ends at character ${text.slice(0, position).trimEnd().length}; ${text.length - position} characters of other text follow it (the final message must be the JSON object only, optionally in one fence around the whole message)` };
  }
  return { condition: position >= text.length ? "json-truncated" : "json-syntax", errorMessage: `parse failed at position ${position} of ${text.length} characters` };
}

/** Validate one JSON final result (plain, or in one fence around the whole message); prose, any other fencing and duplicate keys fail closed. */
// D31: `allowCheckpoint` is opt-in. Only the SubagentStop route passes it, because a budget stop settles there without
// a commit; every other route (foreground PostToolUse, Codex) keeps admitting a success only.
export function validateNativeGoldfishFinal(text, { binding, allowCheckpoint = false } = {}) {
  if (typeof text !== "string" || text.length === 0 || Buffer.byteLength(text, "utf8") > 2 * 1024 * 1024
    || !binding || !ID.test(binding.dispatchId ?? "") || !OID.test(binding.candidateCommit ?? "")) return fail("NGHR-FINAL-INPUT");
  let value;
  const inner = withoutWholeMessageFence(text);
  try { value = parseStrictJson(inner); } catch (error) { return { ...fail("NGHR-FINAL-JSON"), detail: jsonFailureDetail(inner, error) }; }
  const shapeCondition = finalShapeCondition(value, binding, allowCheckpoint);
  if (shapeCondition !== null) return { ...fail("NGHR-FINAL-SHAPE"), detail: shapeCondition };
  try { validateDurableDispatchReportText(value.report); } catch { return fail("NGHR-FINAL-REPORT-UNSAFE"); }
  let resultSha256;
  // C18-19: the result digest binds the return WITHOUT its optional testFirst block, because the observation receipt re-derives
  // this digest from the record alone (native-goldfish-host-observation.mjs) and the record carries no testFirst block.
  try { resultSha256 = createHashSha256(canonicalizeJson(Object.hasOwn(value, "testFirst") ? (({ testFirst: _t, ...rest }) => rest)(value) : value)); } catch { return fail("NGHR-FINAL-CANONICALIZATION"); }
  return { ok: true, code: "NGHR-FINAL-VALIDATED", final: {
    schema: value.schema, dispatchId: value.dispatchId, candidateCommit: value.candidateCommit,
    outcome: value.outcome, report: value.report,
    resultSha256, reportSha256: createHashSha256(value.report), changedPaths: [...value.changedPaths].sort(),
    ...(Object.hasOwn(value, "testFirst") ? { testFirst: structuredClone(value.testFirst) } : {}),
  } };
}

function createHashSha256(value) { return createHash("sha256").update(value, "utf8").digest("hex"); }

function oneTextBlock(value) {
  const content = value?.content;
  if (!Array.isArray(content) || content.length !== 1 || content[0]?.type !== "text"
    || typeof content[0]?.text !== "string") return null;
  return content[0].text;
}

// C23: the Agent tool's `model` parameter carries only a family alias, so the host may resolve a configured alias or id to another
// model of that family. Another family, or a configured value with no recognisable family, keeps the exact comparison.
const claudeFamily = (model) => /^(?:claude-)?(opus|sonnet|haiku|fable)(?=$|[-_.:[])/u.exec(String(model).trim().toLowerCase())?.[1] ?? null;
const satisfiesClaudeBinding = (model, configured) => model === configured
  || (claudeFamily(configured) !== null && claudeFamily(model) === claudeFamily(configured));

/** Bind Claude's foreground Task/Agent PostToolUse result to its exact call and resolved model. */
export function observeClaudeGoldfishReturn(input, pending) {
  if (!input || input.hook_event_name !== "PostToolUse" || !["Agent", "Task"].includes(input.tool_name)
    || typeof input.tool_use_id !== "string" || input.tool_use_id !== pending?.toolUseId
    || typeof input.session_id !== "string" || input.session_id !== pending?.sessionId
    || pending?.runner !== "claude" || pending.binding?.runner !== "claude") return fail("NGHR-CLAUDE-CORRELATION");
  const response = input.tool_response;
  if (!response || response.status !== "completed" || typeof response.resolvedModel !== "string"
    || !satisfiesClaudeBinding(response.resolvedModel, pending.binding.model)) return fail("NGHR-CLAUDE-RETURN-MODEL");
  if (Array.isArray(response.modelsUsed)
    && (response.modelsUsed.length === 0 || response.modelsUsed.some((model) => !satisfiesClaudeBinding(model, pending.binding.model)))) {
    return fail("NGHR-CLAUDE-MODEL-SWITCH");
  }
  const text = oneTextBlock(response);
  if (text === null) return fail("NGHR-CLAUDE-RETURN-SHAPE");
  const final = validateNativeGoldfishFinal(text, { binding: pending.binding });
  return final.ok ? { ...final, runner: "claude", assurance: "host-observed-tool-use-and-resolved-model",
    ...(response.resolvedModel === pending.binding.model ? {} : { resolvedModelDiffers: response.resolvedModel }) } : final;
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

const COMMAND_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
/** G20-65: the document check form of a documentation-only module (`document:<owned path>`); the file kinds are the closed set of
 * `isDocumentOwnedPath` (lib/architecture-design.mjs), copied here on purpose because this hook-path validator stays lightweight (a test pins the equality). */
export const DOCUMENT_CHECK_PREFIX='document:';
export const DOCUMENT_CHECK_FILE=/\.(?:md|mdx|txt|rst|adoc)$/u;
/** D195: a check is the 3-key .test form, the additive 4-key command form (path = the calibration that registers the command) or, G20-65,
 * the 4-key document form (path = the owned document, `document` repeats it, so the check names exactly one file of the write scope). */
function validCheckForm(check){
  if(check!==null&&typeof check==='object'&&Object.hasOwn(check,'document'))
    return exact(check,['id','path','document','dependencies'])&&check.document===check.path&&normalizedPath(check.path)&&DOCUMENT_CHECK_FILE.test(check.path)
      &&Array.isArray(check.dependencies)&&check.dependencies.includes(check.path);
  if(check!==null&&typeof check==='object'&&Object.hasOwn(check,'command'))
    return exact(check,['id','path','command','dependencies'])&&typeof check.command==='string'&&COMMAND_ID.test(check.command)&&normalizedPath(check.path)
      &&Array.isArray(check.dependencies)&&check.dependencies.includes(check.path);
  return exact(check,['id','path','dependencies'])&&/\.test\.(?:mjs|cjs|js)$/u.test(check.path);
}
/** Typed selection data; original approval and actual source bytes are checked
 * independently by the authenticated continuation writer. */
export function validateItemDeliveryBriefing(value) {
  const locator=value?.criterionLocator;
  const hasContinuation=value!==null&&typeof value==='object'&&Object.hasOwn(value,'continuationOf');
  if(!exact(value,hasContinuation?['schema','sliceId','itemId','criterionLocator','checks','continuationOf']:['schema','sliceId','itemId','criterionLocator','checks'])
    ||(hasContinuation&&(typeof value.continuationOf!=='string'||!ID.test(value.continuationOf)))||value.schema!=='pipeline.item-delivery-briefing.v1'
    ||!ID.test(value.sliceId??'')||!ID.test(value.itemId??'')
    ||!exact(locator,['schema','sourcePath','sourceSha256','criterionId','startByte','endByte','excerptSha256'])
    ||locator.schema!=='pipeline.critic-criterion-locator.v1'||!normalizedPath(locator.sourcePath)
    ||!SHA.test(locator.sourceSha256??'')||!SHA.test(locator.excerptSha256??'')||!isCriterionId(locator.criterionId)
    ||!Number.isSafeInteger(locator.startByte)||!Number.isSafeInteger(locator.endByte)||locator.startByte<0||locator.endByte<=locator.startByte||locator.endByte-locator.startByte>4096
    ||!Array.isArray(value.checks)||value.checks.length<1||value.checks.length>16
    ||new Set(value.checks.map(check=>check.id)).size!==value.checks.length
    ||value.checks.some(check=>!validCheckForm(check)||!ID.test(check.id??'')||!normalizedPath(check.path)
      ||!Array.isArray(check.dependencies)||check.dependencies.length<1||check.dependencies.length>64
      ||!check.dependencies.every(normalizedPath)||new Set(check.dependencies).size!==check.dependencies.length))return fail('NGHR-ITEM-DELIVERY-SHAPE');
  return {ok:true,code:'NGHR-ITEM-DELIVERY-VALID'};
}
