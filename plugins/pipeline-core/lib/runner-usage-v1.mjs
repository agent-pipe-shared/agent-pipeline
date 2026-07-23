// SPDX-License-Identifier: SUL-1.0

/**
 * Pure, raw-first adapters for the frozen P3B usage contract.
 *
 * The adapter accepts exact JSON bytes from a registered runner event, returns
 * one in-memory envelope, and deliberately has no write, upload, retention, or
 * transcript-persistence path.  A requested route is not effective identity:
 * only a whole-file checked, caller-bound v1 receipt can make it observed.
 */
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { P3B_DIRECT_TERRA_RECEIPT_ADAPTER, validateRouteReceipt } from "./route-receipt.mjs";
import { registeredRouting } from "./runner-profiles-v2.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = resolve(HERE, "..", "scripts");
const USAGE_SCHEMA_PATH = resolve(SCRIPTS, "runner-usage.schema.json");
const BINDING_SCHEMA_PATH = resolve(SCRIPTS, "usage-route-binding.schema.json");
const USAGE_SCHEMA = Object.freeze(JSON.parse(readFileSync(USAGE_SCHEMA_PATH, "utf8")));
const BINDING_SCHEMA = Object.freeze(JSON.parse(readFileSync(BINDING_SCHEMA_PATH, "utf8")));
// `registeredRouting()` is a clone of the module's frozen I0 registry.  Keep
// it private so a caller cannot substitute a route after the module loads.
const FROZEN_I0_ROUTING = registeredRouting();

const SHA256 = /^[a-f0-9]{64}$/;
const GIT_OBJECT = /^[a-f0-9]{40}$/;
const CLAUDE_TURN_VERSION = "claude-transcript-usage.v1";
const CLAUDE_SESSION_VERSION = "claude-transcript-session-usage.v1";
const CODEX_VERSION = "codex-exec-json.v1";
const CLAUDE_FIELDS = new Set([
  "input_tokens",
  "output_tokens",
  "cache_creation_input_tokens",
  "cache_read_input_tokens",
  "cache_creation",
]);
const CLAUDE_CACHE_FIELDS = new Set(["ephemeral_5m_input_tokens", "ephemeral_1h_input_tokens"]);
const CODEX_FIELDS = new Set([
  "input_tokens",
  "cached_input_tokens",
  "output_tokens",
  "reasoning_output_tokens",
]);

export const RUNNER_USAGE_SCHEMA_PATH = USAGE_SCHEMA_PATH;
export const USAGE_ROUTE_BINDING_SCHEMA_PATH = BINDING_SCHEMA_PATH;
export const SUPPORTED_NATIVE_USAGE_SOURCES = Object.freeze({
  claude: Object.freeze([CLAUDE_TURN_VERSION, CLAUDE_SESSION_VERSION]),
  codex: Object.freeze([CODEX_VERSION]),
});

export class UsageIngestionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "UsageIngestionError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new UsageIngestionError(code, message);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function own(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function exactKeys(value, keys) {
  return isObject(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => own(value, key));
}

function nonemptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function isHash(value) {
  return typeof value === "string" && SHA256.test(value);
}

function same(left, right) {
  if (left === right) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (Array.isArray(left)) return Array.isArray(right) && left.length === right.length && left.every((item, index) => same(item, right[index]));
  if (typeof left === "object") {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] && same(left[key], right[key]));
  }
  return false;
}

function typeMatches(value, type) {
  const types = Array.isArray(type) ? type : [type];
  return types.some((entry) => {
    if (entry === "object") return isObject(value);
    if (entry === "array") return Array.isArray(value);
    if (entry === "null") return value === null;
    if (entry === "number") return typeof value === "number" && Number.isFinite(value);
    if (entry === "integer") return Number.isInteger(value);
    return typeof value === entry;
  });
}

function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function pointer(document, fragment) {
  if (fragment === "" || fragment === "#") return document;
  if (!fragment.startsWith("#/")) return null;
  return fragment.slice(2).split("/").reduce((node, key) => node?.[key.replace(/~1/g, "/").replace(/~0/g, "~")], document);
}

function resolveReference(document, ref) {
  if (typeof ref !== "string") return null;
  if (ref.startsWith("#")) return { document, schema: pointer(document, ref) };
  const [name, fragment = ""] = ref.split("#", 2);
  if (name !== "usage-route-binding.schema.json") return null;
  return { document: BINDING_SCHEMA, schema: pointer(BINDING_SCHEMA, fragment ? `#${fragment}` : "#") };
}

/*
 * This small validator is deliberately reference- and oneOf-aware.  The
 * pre-existing schema-lite helper does not resolve the I0 external facade ref,
 * so it is not an admissible boundary for usage envelopes.
 */
function validateSchema(value, schema, document, path, errors) {
  if (!isObject(schema)) {
    errors.push(`${path}: unusable schema`);
    return;
  }
  if (schema.$ref) {
    const resolved = resolveReference(document, schema.$ref);
    if (!resolved?.schema) errors.push(`${path}: unresolved reference`);
    else validateSchema(value, resolved.schema, resolved.document, path, errors);
  }
  if (schema.type && !typeMatches(value, schema.type)) {
    errors.push(`${path}: wrong type`);
    return;
  }
  if (own(schema, "const") && !same(value, schema.const)) errors.push(`${path}: const mismatch`);
  if (schema.enum && !schema.enum.some((entry) => same(value, entry))) errors.push(`${path}: enum mismatch`);
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: short string`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}: long string`);
    if (schema.pattern && !(new RegExp(schema.pattern, "u")).test(value)) errors.push(`${path}: pattern mismatch`);
    if (schema.format === "date" && !isIsoDate(value)) errors.push(`${path}: invalid date`);
  }
  if (typeof value === "number" && schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: below minimum`);
  if (isObject(value)) {
    for (const key of schema.required ?? []) if (!own(value, key)) errors.push(`${path}.${key}: required`);
    for (const [key, child] of Object.entries(schema.properties ?? {})) if (own(value, key)) validateSchema(value[key], child, document, `${path}.${key}`, errors);
    const known = new Set(Object.keys(schema.properties ?? {}));
    const extra = Object.keys(value).filter((key) => !known.has(key));
    if (schema.additionalProperties === false && extra.length) errors.push(`${path}: additional property`);
    if (isObject(schema.additionalProperties)) for (const key of extra) validateSchema(value[key], schema.additionalProperties, document, `${path}.${key}`, errors);
    for (const [key, dependencies] of Object.entries(schema.dependentRequired ?? {})) {
      if (own(value, key)) for (const required of dependencies) if (!own(value, required)) errors.push(`${path}.${required}: dependent required`);
    }
    if (schema.minProperties !== undefined && Object.keys(value).length < schema.minProperties) errors.push(`${path}: too few properties`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: too few items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: too many items`);
    if (schema.items) value.forEach((entry, index) => validateSchema(entry, schema.items, document, `${path}[${index}]`, errors));
  }
  for (const child of schema.allOf ?? []) validateSchema(value, child, document, path, errors);
  if (schema.anyOf && !schema.anyOf.some((child) => validateSchemaResult(value, child, document).valid)) errors.push(`${path}: anyOf mismatch`);
  if (schema.oneOf) {
    const matches = schema.oneOf.filter((child) => validateSchemaResult(value, child, document).valid).length;
    if (matches !== 1) errors.push(`${path}: oneOf mismatch`);
  }
  if (schema.not && validateSchemaResult(value, schema.not, document).valid) errors.push(`${path}: forbidden shape`);
  if (schema.if) {
    const branch = validateSchemaResult(value, schema.if, document).valid ? schema.then : schema.else;
    if (branch) validateSchema(value, branch, document, path, errors);
  }
}

function validateSchemaResult(value, schema, document) {
  const errors = [];
  validateSchema(value, schema, document, "$", errors);
  return { valid: errors.length === 0, errors };
}

export function loadRunnerUsageSchema() {
  return JSON.parse(JSON.stringify(USAGE_SCHEMA));
}

export function loadUsageRouteBindingSchema() {
  return JSON.parse(JSON.stringify(BINDING_SCHEMA));
}

export function validateRunnerUsageEnvelope(value) {
  return validateSchemaResult(value, USAGE_SCHEMA, USAGE_SCHEMA);
}

export function validateUsageRouteBinding(value) {
  return validateSchemaResult(value, BINDING_SCHEMA, BINDING_SCHEMA);
}

function exactNativeBytes(value) {
  if (typeof value === "string") return Buffer.from(value, "utf8");
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value);
  fail("native-event-bytes-required", "nativeEventBytes must be the exact received JSON bytes, not a parsed event");
}

function parseNativeEvent(value) {
  const bytes = exactNativeBytes(value);
  let text;
  let event;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    event = JSON.parse(text);
  } catch {
    fail("native-event-invalid", "native event bytes must be one valid UTF-8 JSON object");
  }
  if (!isObject(event)) fail("native-event-invalid", "native event must be an object");
  return { bytes, event, eventSha256: createHash("sha256").update(bytes).digest("hex") };
}

function numericUsage(value, fields, nested = new Map()) {
  if (!isObject(value) || Object.keys(value).length === 0) fail("usage-subobject-invalid", "native usage must be a nonempty object");
  for (const [key, entry] of Object.entries(value)) {
    if (!fields.has(key)) fail("usage-subobject-invalid", "native usage has an unsupported field");
    if (nested.has(key)) {
      const allowed = nested.get(key);
      if (!isObject(entry) || Object.keys(entry).length === 0) fail("usage-subobject-invalid", "native cache usage must be a nonempty numeric object");
      for (const [nestedKey, nestedValue] of Object.entries(entry)) {
        if (!allowed.has(nestedKey) || typeof nestedValue !== "number" || !Number.isFinite(nestedValue) || nestedValue < 0) fail("usage-subobject-invalid", "native cache usage has an unsupported nonnumeric field");
      }
    } else if (typeof entry !== "number" || !Number.isFinite(entry) || entry < 0) {
      fail("usage-subobject-invalid", "native usage fields must be nonnegative numbers");
    }
  }
  return JSON.parse(JSON.stringify(value));
}

function parseClaude(version, event) {
  if (version === CLAUDE_TURN_VERSION) {
    if (!exactKeys(event, ["type", "sessionId", "message"])
      || event.type !== "assistant"
      || !nonemptyString(event.sessionId)
      || !exactKeys(event.message, ["id", "usage"])
      || !nonemptyString(event.message.id)) fail("native-event-shape", "unsupported Claude transcript turn event shape");
    return { raw: numericUsage(event.message.usage, CLAUDE_FIELDS, new Map([["cache_creation", CLAUDE_CACHE_FIELDS]])), nativeIds: { threadId: event.sessionId, turnId: event.message.id }, scopeKind: "turn" };
  }
  if (version === CLAUDE_SESSION_VERSION) {
    if (!exactKeys(event, ["type", "sessionId", "usage"])
      || event.type !== "session.usage"
      || !nonemptyString(event.sessionId)) fail("native-event-shape", "unsupported Claude transcript session event shape");
    return { raw: numericUsage(event.usage, CLAUDE_FIELDS, new Map([["cache_creation", CLAUDE_CACHE_FIELDS]])), nativeIds: { threadId: event.sessionId }, scopeKind: "session" };
  }
  fail("native-version-unsupported", "Claude usage version is not registered");
}

function parseCodex(version, event) {
  if (version !== CODEX_VERSION) fail("native-version-unsupported", "Codex usage version is not registered");
  if (!exactKeys(event, ["type", "usage"]) || event.type !== "turn.completed") fail("native-event-shape", "unsupported Codex exec JSON turn.completed event shape");
  return { raw: numericUsage(event.usage, CODEX_FIELDS), nativeIds: null, scopeKind: "turn" };
}

function validScope(value, expectedKind) {
  if (!isObject(value) || !nonemptyString(value.kind) || value.kind !== expectedKind) return false;
  const keys = expectedKind === "workspace-account-aggregate" ? ["kind"] : ["kind", "dispatchId"];
  if (!Object.keys(value).every((key) => keys.includes(key))) return false;
  return !own(value, "dispatchId") || nonemptyString(value.dispatchId);
}

function resolveSourceContext(runner, parsed, sourceContext) {
  if (sourceContext === undefined || sourceContext === null) {
    if (runner === "codex") fail("source-context-missing", "Codex turn usage requires trusted app-server thread and turn context");
    return { ids: parsed.nativeIds, scope: { kind: parsed.scopeKind }, trusted: false };
  }
  if (!exactKeys(sourceContext, ["schema", "trust", "runner", "source", "scope"])
    || sourceContext.schema !== "pipeline.usage-source-context.v1"
    || sourceContext.runner !== runner
    || !isObject(sourceContext.source)
    || !validScope(sourceContext.scope, parsed.scopeKind)) fail("source-context-invalid", "source context must be one exact trusted runner-wrapper shape");
  const expectedTrust = runner === "codex" ? "codex-app-server" : "runner-wrapper";
  if (sourceContext.trust !== expectedTrust) fail("source-context-untrusted", "source context is not trusted for this runner");
  const idKeys = parsed.scopeKind === "turn" ? ["threadId", "turnId"] : ["threadId"];
  if (!exactKeys(sourceContext.source, idKeys) || !idKeys.every((key) => nonemptyString(sourceContext.source[key]))) fail("source-context-invalid", "trusted source context must contain the exact scope identifiers");
  if (parsed.nativeIds && !idKeys.every((key) => sourceContext.source[key] === parsed.nativeIds[key])) fail("source-context-mismatch", "trusted source ids do not match native event ids");
  const scope = { kind: parsed.scopeKind };
  if (own(sourceContext.scope, "dispatchId")) scope.dispatchId = sourceContext.scope.dispatchId;
  return { ids: { ...sourceContext.source }, scope, trusted: true };
}

function observed(value, sourceField) {
  return { status: "observed", value, sourceField, comparison: "same-runner-only" };
}

function omitted() {
  return { status: "unknown", reasonCode: "source-omitted" };
}

function unavailable() {
  return { status: "unavailable", reasonCode: "runner-does-not-emit" };
}

function unknown(reasonCode) {
  return { status: "unknown", reasonCode };
}

function rawMetric(raw, field) {
  return own(raw, field) ? observed(raw[field], field) : omitted();
}

function commonProjection(runner, raw, route) {
  const routeCost = route.status === "unbound" ? unknown("scope-unbound") : unknown("billing-unavailable");
  if (runner === "claude") {
    return {
      inputTokens: rawMetric(raw, "input_tokens"),
      outputTokens: rawMetric(raw, "output_tokens"),
      cachedInputTokens: unavailable(),
      cacheCreationInputTokens: rawMetric(raw, "cache_creation_input_tokens"),
      cacheReadInputTokens: rawMetric(raw, "cache_read_input_tokens"),
      reasoningOutputTokens: unavailable(),
      billedCost: routeCost,
      estimatedCost: routeCost,
    };
  }
  return {
    inputTokens: rawMetric(raw, "input_tokens"),
    outputTokens: rawMetric(raw, "output_tokens"),
    cachedInputTokens: rawMetric(raw, "cached_input_tokens"),
    cacheCreationInputTokens: unavailable(),
    cacheReadInputTokens: unavailable(),
    reasoningOutputTokens: rawMetric(raw, "reasoning_output_tokens"),
    billedCost: routeCost,
    estimatedCost: routeCost,
  };
}

function unbound(reasonCode) {
  return { status: "unbound", effective: { status: "unknown", reasonCode } };
}

function requestedShapeValid(runner, requested) {
  if (!exactKeys(requested, ["selector", "effort"]) || !exactKeys(requested.selector, ["kind", "value"])) return false;
  if (runner === "claude") return requested.selector.kind === "alias" && ["fable", "opus", "sonnet"].includes(requested.selector.value) && ["low", "medium", "high", "xhigh", "max", "not-applicable"].includes(requested.effort);
  return requested.selector.kind === "model-id"
    && ["gpt-5.6-sol", "gpt-5.6-terra"].includes(requested.selector.value)
    && ["xhigh", "max"].includes(requested.effort)
    && (requested.selector.value !== "gpt-5.6-terra" || requested.effort === "xhigh");
}

function receiptReferenceValid(value) {
  return exactKeys(value, ["schema", "repoRelativePath", "sha256", "resultSha256", "routeEvidenceSha256"])
    && value.schema === "pipeline.route-receipt.v1"
    && nonemptyString(value.repoRelativePath)
    && !value.repoRelativePath.startsWith("/")
    && !value.repoRelativePath.split(/[\\/]/u).includes("..")
    && isHash(value.sha256) && isHash(value.resultSha256) && isHash(value.routeEvidenceSha256);
}

function expectedCellRequest(cell) {
  if (!isObject(cell)) return null;
  if (exactKeys(cell, ["kind", "dutyId"]) && cell.kind === "duty" && nonemptyString(cell.dutyId)) return { requestedDuty: cell.dutyId, requestedWorktype: null };
  if (exactKeys(cell, ["kind", "profileId", "phaseId"]) && cell.kind === "profile-phase" && nonemptyString(cell.profileId) && nonemptyString(cell.phaseId)) return { requestedDuty: `profile_${cell.profileId}`, requestedWorktype: cell.phaseId };
  return null;
}

function registeredCellForRunner(cell, runner) {
  if (!isObject(cell)) return null;
  if (exactKeys(cell, ["kind", "dutyId"]) && cell.kind === "duty") {
    return FROZEN_I0_ROUTING.duties?.[cell.dutyId]?.[runner] ?? null;
  }
  if (exactKeys(cell, ["kind", "profileId", "phaseId"]) && cell.kind === "profile-phase") {
    return FROZEN_I0_ROUTING.profiles?.[cell.profileId]?.[cell.phaseId]?.[runner] ?? null;
  }
  return null;
}

function requestedMatchesRegisteredCell(requested, cell, runner) {
  const registered = registeredCellForRunner(cell, runner);
  return isObject(registered)
    && exactKeys(registered, ["state", "selector", "effort", "unavailable", "evidence"])
    && same(requested.selector, registered.selector)
    && requested.effort === registered.effort;
}

function routeContextShapeValid(runner, value) {
  return exactKeys(value, ["schema", "trust", "runner", "requested", "binding", "receipt", "dispatchBinding", "trustedEvidence"])
    && value.schema === "pipeline.usage-route-context.v1"
    && value.trust === "trusted-runner-wrapper"
    && value.runner === runner
    && requestedShapeValid(runner, value.requested)
    && validateUsageRouteBinding(value.binding).valid
    && receiptReferenceValid(value.receipt)
    && dispatchBindingShapeValid(value.dispatchBinding)
    && trustedEvidenceShapeValid(value.trustedEvidence);
}

function dispatchBindingShapeValid(value) {
  return exactKeys(value, ["dispatchId", "queueRevision", "candidateCommit", "candidateTree", "requestedDuty", "requestedWorktype"])
    && nonemptyString(value.dispatchId)
    && Number.isSafeInteger(value.queueRevision) && value.queueRevision >= 0
    && typeof value.candidateCommit === "string" && GIT_OBJECT.test(value.candidateCommit)
    && typeof value.candidateTree === "string" && GIT_OBJECT.test(value.candidateTree)
    && nonemptyString(value.requestedDuty)
    && (value.requestedWorktype === null || nonemptyString(value.requestedWorktype));
}

function trustedEvidenceShapeValid(value) {
  return exactKeys(value, ["source", "sha256", "resultSha256", "effectiveDuty", "effectiveWorktype", "effectiveRunner", "effectiveSelector", "effectiveProvider", "effectiveModelId", "effectiveEffort"])
    && ["host", "cli"].includes(value.source)
    && isHash(value.sha256) && isHash(value.resultSha256)
    && nonemptyString(value.effectiveDuty)
    && (value.effectiveWorktype === null || nonemptyString(value.effectiveWorktype))
    && ["claude", "codex"].includes(value.effectiveRunner)
    && exactKeys(value.effectiveSelector, ["kind", "value"])
    && value.effectiveSelector.kind === "model-id"
    && nonemptyString(value.effectiveSelector.value)
    && ["anthropic", "openai"].includes(value.effectiveProvider)
    && nonemptyString(value.effectiveModelId)
    && ["low", "medium", "high", "xhigh", "max", "not-applicable"].includes(value.effectiveEffort);
}

function sameCandidate(binding, dispatchBinding) {
  return isObject(dispatchBinding)
    && binding.dispatchId === dispatchBinding.dispatchId
    && binding.candidateCommit === dispatchBinding.candidateCommit
    && binding.candidateTree === dispatchBinding.candidateTree;
}

function readExactReceipt(repoRoot, reference) {
  if (!nonemptyString(repoRoot)) return { state: "invalid" };
  let root;
  let file;
  try {
    root = realpathSync(repoRoot);
    file = resolve(root, reference.repoRelativePath);
    const contained = relative(root, file);
    if (contained === "" || contained === ".." || contained.startsWith(`..${String.fromCharCode(47)}`) || contained.startsWith(`..${String.fromCharCode(92)}`)) return { state: "invalid" };
    if (!statSync(file).isFile()) return { state: "missing" };
    const resolvedFile = realpathSync(file);
    const resolvedRelative = relative(root, resolvedFile);
    if (resolvedRelative === ".." || resolvedRelative.startsWith(`..${String.fromCharCode(47)}`) || resolvedRelative.startsWith(`..${String.fromCharCode(92)}`)) return { state: "invalid" };
    const bytes = readFileSync(resolvedFile);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (sha256 !== reference.sha256) return { state: "invalid" };
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return { state: "ok", value };
  } catch (error) {
    if (error?.code === "ENOENT") return { state: "missing" };
    return { state: "invalid" };
  }
}

function bindRoute({ runner, source, scope, eventSha256, routeContext, repoRoot }) {
  if (!scope.dispatchId) return unbound("dispatch-context-missing");
  if (routeContext === undefined || routeContext === null) return unbound("receipt-missing");
  if (!routeContextShapeValid(runner, routeContext)) return unbound("binding-mismatch");
  const { requested, binding, receipt, dispatchBinding, trustedEvidence } = routeContext;
  const expected = expectedCellRequest(binding.cell);
  if (!expected
    || !requestedMatchesRegisteredCell(requested, binding.cell, runner)
    || !sameCandidate(binding, dispatchBinding)
    || binding.dispatchId !== scope.dispatchId
    || binding.usageEventSha256 !== eventSha256
    || binding.threadId !== source.threadId
    || binding.turnId !== source.turnId
    || dispatchBinding.requestedDuty !== expected.requestedDuty
    || dispatchBinding.requestedWorktype !== expected.requestedWorktype) return unbound("binding-mismatch");
  const loaded = readExactReceipt(repoRoot, receipt);
  if (loaded.state === "missing") return unbound("receipt-missing");
  if (loaded.state !== "ok") return unbound("receipt-invalid");
  const receiptValue = loaded.value;
  if (!isObject(receiptValue)
    || receiptValue.resultSha256 !== receipt.resultSha256
    || receiptValue.resolutionEvidence?.sha256 !== receipt.routeEvidenceSha256
    || receiptValue.requestedRunner !== runner
    || !same(receiptValue.requestedSelector, requested.selector)
    || receiptValue.requestedEffort !== requested.effort) return unbound("binding-mismatch");
  const projectedRoute = {
    runner,
    selector: { ...requested.selector },
    effort: requested.effort,
    unavailability: "defer",
    evidenceRequirement: "dispatch-receipt",
  };
  const validated = validateRouteReceipt(
    receiptValue,
    projectedRoute,
    dispatchBinding,
    trustedEvidence,
    undefined,
    runner === "codex"
      && requested.selector.kind === "model-id"
      && requested.selector.value === "gpt-5.6-terra"
      && requested.effort === "xhigh"
      ? P3B_DIRECT_TERRA_RECEIPT_ADAPTER
      : undefined,
  );
  if (!validated?.ok) {
    const bindingReasons = new Set(["missing-trusted-binding", "trusted-binding-mismatch", "requested-route-drift"]);
    return unbound(bindingReasons.has(validated?.reason) ? "binding-mismatch" : "receipt-invalid");
  }
  return {
    status: "bound",
    requested: { selector: { ...requested.selector }, effort: requested.effort },
    binding: JSON.parse(JSON.stringify(binding)),
    receipt: { ...receipt },
    effective: { status: "observed", modelId: receiptValue.effectiveModelId },
  };
}

/**
 * Ingest one exact native event. `nativeEventBytes` is mandatory so source
 * hashing cannot accidentally cover a re-serialized object. `sourceContext`
 * is mandatory for Codex because its documented turn.completed JSON may carry
 * only usage; `routeContext` is optional and a missing/failed binding stays
 * closed-unbound rather than looking up a receipt by a model string.
 */
export function ingestRunnerUsage({ runner, version, nativeEventBytes, sourceContext, routeContext, repoRoot } = {}) {
  if (!SUPPORTED_NATIVE_USAGE_SOURCES[runner]?.includes(version)) fail("native-source-unsupported", "runner and version are not a registered native usage source");
  const parsedEvent = parseNativeEvent(nativeEventBytes);
  const parsed = runner === "claude" ? parseClaude(version, parsedEvent.event) : parseCodex(version, parsedEvent.event);
  const context = resolveSourceContext(runner, parsed, sourceContext);
  const source = runner === "claude"
    ? { kind: "claude-transcript-usage", version, eventSha256: parsedEvent.eventSha256, threadId: context.ids.threadId, ...(parsed.scopeKind === "turn" ? { turnId: context.ids.turnId } : {}) }
    : { kind: "codex-turn-completed-usage", version, eventSha256: parsedEvent.eventSha256, threadId: context.ids.threadId, turnId: context.ids.turnId };
  const route = context.trusted
    ? bindRoute({ runner, source, scope: context.scope, eventSha256: parsedEvent.eventSha256, routeContext, repoRoot })
    : unbound("dispatch-context-missing");
  const envelope = {
    schema: "pipeline.runner-usage.v1",
    runner,
    source,
    scope: context.scope,
    route,
    raw: parsed.raw,
    common: commonProjection(runner, parsed.raw, route),
  };
  const validation = validateRunnerUsageEnvelope(envelope);
  if (!validation.valid) fail("envelope-contract-invalid", "generated usage envelope does not satisfy the frozen I0 contract");
  return envelope;
}

export function ingestClaudeUsage(options = {}) {
  return ingestRunnerUsage({ ...options, runner: "claude" });
}

export function ingestCodexUsage(options = {}) {
  return ingestRunnerUsage({ ...options, runner: "codex" });
}
