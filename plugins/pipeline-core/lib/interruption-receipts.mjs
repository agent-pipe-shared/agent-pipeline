// SPDX-License-Identifier: SUL-1.0
/** Pure interruption data. Validation and hashes confer no source authenticity or authority. */
import { createHash } from "node:crypto";

const PIN = { family: "Interruption receipt + registry", revision: 1, digest: "e60c80dd242b9d4dde5fd3b035b4ad56671c10117568f82b31d77d430fe12ff5" };
const REVISION = "c1-classification-r1";
const STATUSES = ["measured", "estimated", "unavailable", "unknown"];
const STATES = ["unresolved", "resolved", "terminal", "skipped", "unavailable", "unknown"];
const SOURCES = ["lifecycle-boundary", "workflow-observer", "authority-wait", "terminal-decision", "guard-observation", "readiness-observer", "dispatch-observer"];
const FACTS = ["expected-boundary", "next-step-prevented", "declared-authority-wait", "deliberately-stopped", "non-recoverable", "read-only-command", "readiness-partial", "writer-observer-disagreement", "tp-ceremony", "report-missing", "dispatch-ended"];
const INPUT_KEYS = ["eventId", "lineageId", "scope", "actor", "typedCode", "observations", "state", "firstObservedAt", "observedThroughAt", "resolvedAt", "terminalAt", "attemptCoverage", "recoveryCoverage", "joins", "resolution", "binding"];
const COPIED = INPUT_KEYS.filter((key) => !["attemptCoverage", "recoveryCoverage"].includes(key));
const RECORD_KEYS = ["schema", "contractPin", ...COPIED, "category", "classification", "derivationRevision", "registrySha256", "matchedRuleIds", "blockedWallTime", "attemptCount", "recoveryCount", "collectionStatus", "recordSha256"];
const RULES = [
  ["authority-wait", "authority-wait", ["declared-authority-wait"], "external-wait", "authority-wait", "issue-103", "classification-3"],
  ["deliberate-stop", "terminal-decision", ["deliberately-stopped"], "terminal-blocker", "terminal-stop", "issue-103", "classification-4"],
  ["dispatch-truncation", "dispatch-observer", ["dispatch-ended", "next-step-prevented", "report-missing"], "unplanned-interrupt", "dispatch-truncation", "alfred-issue-intake-103", "dispatch-truncation-2026-08-08"],
  ["expected-gate", "lifecycle-boundary", ["expected-boundary"], "planned-gate", "lifecycle-gate", "issue-103", "classification-1"],
  ["non-recoverable", "terminal-decision", ["non-recoverable"], "terminal-blocker", "terminal-stop", "issue-103", "classification-4"],
  ["prevented-step", "workflow-observer", ["next-step-prevented"], "unplanned-interrupt", "workflow-interruption", "issue-103", "classification-2"],
  ["read-only-refusal", "guard-observation", ["next-step-prevented", "read-only-command"], "unplanned-interrupt", "read-only-refusal", "alfred-issue-intake-103", "read-only-refusal-2026-08-27"],
  ["readiness-partial", "readiness-observer", ["next-step-prevented", "readiness-partial", "writer-observer-disagreement"], "unplanned-interrupt", "readiness-partial-deadlock", "alfred-issue-intake-103", "readiness-partial-2026-08-27"],
  ["tp-wait", "authority-wait", ["declared-authority-wait", "tp-ceremony"], "external-wait", "tp-ceremony-wait", "alfred-issue-intake-103", "tp-ceremony-2026-08-18"],
].map(([id, sourceKind, allFacts, classification, category, sourceId, section]) => ({ id, sourceKind, allFacts, classification, category, provenance: { sourceId, section } }));

const fail = (code) => { throw new TypeError(code); };
const requireValue = (condition, code = "C1-SHAPE") => { if (!condition) fail(code); };
const id = (value) => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/u.test(value)
  && !/(?:^|[._:+-])(?:sk-|gh[pousr]_|github_pat_|AKIA[0-9A-Z]{16})/u.test(value);
const digest = (value) => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const nullable = (value, predicate) => value === null || predicate(value);
const exact = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
  : value !== null && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}` : JSON.stringify(value);
const hash = (value) => createHash("sha256").update(canonical(value), "utf8").digest("hex");
const same = (left, right) => canonical(left) === canonical(right);
const copy = (value) => JSON.parse(canonical(value));
const ordered = (rows, key = (row) => row) => rows.every((row, index) => index === 0 || key(rows[index - 1]) < key(row));
const artifact = (value) => exact(value, ["id", "sha256"]) && id(value.id) && digest(value.sha256);

// Inspect descriptors before reading values. JSON ingestion (including duplicate-key
// detection) belongs to adapters. Cycles, accessors and custom prototypes are not JSON.
function safeJson(value, depth = 0, ancestors = new Set()) {
  requireValue(depth <= 16);
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") { requireValue(value.length <= 4096); return; }
  if (typeof value === "number") { requireValue(Number.isSafeInteger(value)); return; }
  requireValue(typeof value === "object" && !ancestors.has(value));
  const array = Array.isArray(value);
  const proto = Object.getPrototypeOf(value);
  requireValue(array ? proto === Array.prototype : proto === null || proto === Object.prototype);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  requireValue(keys.every((key) => typeof key === "string"));
  if (array) requireValue(value.length <= 4096 && keys.length === value.length + 1
    && keys.every((key) => key === "length" || /^(?:0|[1-9][0-9]*)$/u.test(key) && Number(key) < value.length));
  else requireValue(keys.length <= 64);
  ancestors.add(value);
  for (const key of keys) {
    const descriptor = descriptors[key];
    requireValue(Object.hasOwn(descriptor, "value") && (array && key === "length" || descriptor.enumerable));
    safeJson(descriptor.value, depth + 1, ancestors);
  }
  ancestors.delete(value);
}

function registryCheck(registry) {
  try { safeJson(registry); } catch { fail("C1-REGISTRY"); }
  requireValue(exact(registry, ["schema", "contractPin", "derivationRevision", "rules"])
    && registry.schema === "pipeline.interruption-registry.v1" && same(registry.contractPin, PIN)
    && registry.derivationRevision === REVISION && Array.isArray(registry.rules)
    && registry.rules.length > 0 && registry.rules.length <= RULES.length
    && registry.rules.every((rule) => RULES.some((known) => same(known, rule)))
    && ordered(registry.rules, (rule) => rule.id), "C1-REGISTRY");
}

export function validateInterruptionRegistry(registry) {
  try { registryCheck(registry); return { ok: true, code: null }; }
  catch { return { ok: false, code: "C1-REGISTRY" }; }
}

function timeCheck(time) {
  requireValue(exact(time, ["value", "status"]) && STATUSES.includes(time.status), "C1-TIME");
  if (["unknown", "unavailable"].includes(time.status)) requireValue(time.value === null, "C1-TIME");
  else requireValue(typeof time.value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(time.value)
    && Number.isFinite(Date.parse(time.value)) && new Date(time.value).toISOString() === time.value, "C1-TIME");
}
function uniqueRows(rows, key) {
  const found = new Map();
  for (const row of rows) {
    const identity = key(row);
    requireValue(!found.has(identity) || same(found.get(identity), row), "C1-CONFLICT");
    found.set(identity, row);
  }
  return [...found.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, row]) => row);
}
function chainCheck(rows, measured, review = false) {
  const byHash = new Map();
  const byId = new Map(rows.map((row) => [review ? row.reviewId : row.attemptId, row]));
  const children = new Map();
  const requests = new Map();
  for (const row of rows) {
    requireValue(!byHash.has(row.recordSha256) || same(byHash.get(row.recordSha256), row), "C1-CONFLICT");
    byHash.set(row.recordSha256, row);
    if (!review) {
      requireValue(!requests.has(row.invocationId) || requests.get(row.invocationId) === row.requestSha256, "C1-LINEAGE");
      requests.set(row.invocationId, row.requestSha256);
    }
  }
  for (const row of rows) {
    const parent = row.previousSha256 === null ? null : byHash.get(row.previousSha256);
    if (row.previousSha256 !== null) {
      if (!parent) requireValue(!measured, "C1-LINEAGE");
      else requireValue(review ? parent.reviewId === row.parentReviewId
        : parent.invocationId === row.invocationId && parent.requestSha256 === row.requestSha256, "C1-LINEAGE");
    }
    if (review && row.parentReviewId !== null && byId.has(row.parentReviewId))
      requireValue(byId.get(row.parentReviewId).recordSha256 === row.previousSha256, "C1-LINEAGE");
    const childKey = `${review ? "review" : row.invocationId}:${row.previousSha256}`;
    requireValue(!children.has(childKey), "C1-LINEAGE");
    children.set(childKey, row);
    const visited = new Set();
    let cursor = row;
    while (cursor) {
      requireValue(!visited.has(cursor.recordSha256), "C1-LINEAGE");
      visited.add(cursor.recordSha256);
      cursor = byHash.get(cursor.previousSha256);
    }
  }
}

function normalize(input) {
  safeJson(input);
  requireValue(exact(input, INPUT_KEYS));
  requireValue(id(input.eventId) && id(input.lineageId) && nullable(input.typedCode, id)
    && exact(input.scope, ["featureId", "packageId", "dispatchId", "phase"])
    && Object.values(input.scope).every((value) => nullable(value, id))
    && [input.scope.featureId, input.scope.packageId, input.scope.dispatchId].some((value) => value !== null)
    && exact(input.actor, ["runner", "role"]) && Object.values(input.actor).every((value) => nullable(value, id))
    && STATES.includes(input.state) && STATUSES.includes(input.attemptCoverage) && STATUSES.includes(input.recoveryCoverage));
  requireValue(Array.isArray(input.observations) && input.observations.length > 0
    && input.observations.every((row) => exact(row, ["sourceKind", "facts", "artifact"])
      && SOURCES.includes(row.sourceKind) && Array.isArray(row.facts) && row.facts.length <= FACTS.length
      && row.facts.every((fact) => FACTS.includes(fact)) && ordered(row.facts) && artifact(row.artifact)));
  uniqueRows(input.observations, (row) => row.artifact.id);
  requireValue(ordered(input.observations, (row) => row.artifact.id));
  requireValue(exact(input.binding, ["candidate", "artifacts"]), "C1-BINDING");
  const candidate = input.binding.candidate;
  requireValue(candidate === null || exact(candidate, ["commit", "tree"])
    && [candidate.commit, candidate.tree].every((value) => typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value))
    && candidate.commit.length === candidate.tree.length, "C1-BINDING");
  requireValue(Array.isArray(input.binding.artifacts) && input.binding.artifacts.length > 0
    && input.binding.artifacts.every(artifact), "C1-BINDING");
  uniqueRows(input.binding.artifacts, (row) => row.id);
  requireValue(ordered(input.binding.artifacts, (row) => row.id), "C1-BINDING");
  const bound = (reference) => input.binding.artifacts.some((row) => same(row, reference));
  requireValue(input.observations.every((row) => bound(row.artifact)), "C1-BINDING");
  requireValue(input.resolution === null || exact(input.resolution, ["class", "reference"])
    && ["sanctioned-recovery", "resumed", "deliberate-stop", "non-recoverable"].includes(input.resolution.class)
    && artifact(input.resolution.reference));
  if (input.resolution) requireValue(bound(input.resolution.reference), "C1-BINDING");
  requireValue(exact(input.joins, ["invocations", "reviews", "usages", "recoveries"])
    && Object.values(input.joins).every(Array.isArray));
  requireValue(input.joins.invocations.every((row) => exact(row, ["invocationId", "attemptId", "requestSha256", "previousSha256", "recordSha256", "invocationResolutionKey"])
    && id(row.invocationId) && id(row.attemptId) && digest(row.requestSha256) && digest(row.recordSha256)
    && nullable(row.previousSha256, digest) && nullable(row.invocationResolutionKey, digest)));
  const reviewId = (value) => id(value) && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value);
  requireValue(input.joins.reviews.every((row) => exact(row, ["reviewId", "parentReviewId", "previousSha256", "recordSha256"])
    && reviewId(row.reviewId) && nullable(row.parentReviewId, reviewId) && nullable(row.previousSha256, digest)
    && digest(row.recordSha256)));
  requireValue(input.joins.reviews.every((row) => (row.parentReviewId === null) === (row.previousSha256 === null)), "C1-LINEAGE");
  requireValue(input.joins.usages.every((row) => exact(row, ["scope", "source"])
    && exact(row.scope, ["dispatchId"]) && id(row.scope.dispatchId)
    && exact(row.source, ["eventSha256"]) && digest(row.source.eventSha256)));
  requireValue(input.joins.usages.every((row) => row.scope.dispatchId === input.scope.dispatchId), "C1-LINEAGE");
  requireValue(input.joins.recoveries.every(artifact));
  const joins = {
    invocations: uniqueRows(input.joins.invocations, (row) => canonical([row.invocationId, row.attemptId])),
    reviews: uniqueRows(input.joins.reviews, (row) => row.reviewId),
    usages: uniqueRows(input.joins.usages, (row) => canonical([row.scope.dispatchId, row.source.eventSha256])),
    recoveries: uniqueRows(input.joins.recoveries, (row) => row.id),
  };
  chainCheck(joins.invocations, input.attemptCoverage === "measured");
  chainCheck(joins.reviews, input.attemptCoverage === "measured", true);
  if (input.resolution?.class === "sanctioned-recovery")
    requireValue(joins.recoveries.some((row) => same(row, input.resolution.reference)), "C1-BINDING");
  for (const key of ["firstObservedAt", "observedThroughAt", "resolvedAt", "terminalAt"]) timeCheck(input[key]);
  const { state, resolvedAt, terminalAt, firstObservedAt, observedThroughAt, resolution } = input;
  requireValue(!(resolvedAt.value !== null && terminalAt.value !== null), "C1-TIME");
  if (state === "resolved") {
    requireValue(resolvedAt.value !== null && terminalAt.value === null, "C1-TIME");
    requireValue(resolution !== null && ["resumed", "sanctioned-recovery"].includes(resolution.class), "C1-CONFLICT");
  } else if (state === "terminal") {
    requireValue(terminalAt.value !== null && resolvedAt.value === null, "C1-TIME");
    requireValue(resolution !== null && ["deliberate-stop", "non-recoverable"].includes(resolution.class), "C1-CONFLICT");
    const fact = resolution.class === "deliberate-stop" ? "deliberately-stopped" : "non-recoverable";
    requireValue(input.observations.some((row) => row.sourceKind === "terminal-decision" && row.facts.includes(fact)), "C1-CONFLICT");
  } else {
    requireValue(resolvedAt.value === null && terminalAt.value === null, "C1-TIME");
    requireValue(resolution === null, "C1-CONFLICT");
  }
  for (const time of [firstObservedAt, resolvedAt, terminalAt]) if (time.value !== null && observedThroughAt.value !== null)
    requireValue(Date.parse(time.value) <= Date.parse(observedThroughAt.value), "C1-TIME");
  for (const time of [resolvedAt, terminalAt]) if (time.value !== null && firstObservedAt.value !== null)
    requireValue(Date.parse(time.value) >= Date.parse(firstObservedAt.value), "C1-TIME");
  return { ...copy(input), joins: copy(joins) };
}

const unknown = () => ({ classification: "unknown", category: "unknown", matchedRuleIds: [] });
function classify(input, registry) {
  if (input.typedCode === null) return unknown();
  const rules = registry.rules.filter((rule) => input.observations.some((row) => row.sourceKind === rule.sourceKind
    && rule.allFacts.every((fact) => row.facts.includes(fact))));
  if (rules.length === 0 || new Set(rules.map((row) => row.classification)).size !== 1) return unknown();
  const seeds = rules.filter((row) => row.provenance.sourceId === "alfred-issue-intake-103");
  const categories = new Set((seeds.length ? seeds : rules).map((row) => row.category));
  if (categories.size !== 1) return unknown();
  return { classification: rules[0].classification, category: [...categories][0], matchedRuleIds: rules.map((row) => row.id).sort() };
}
/** Invalid classification inputs throw only a closed C1 diagnostic. */
export function classifyInterruption(input, registry) {
  try {
    registryCheck(registry);
    return classify(normalize(input), registry);
  } catch (error) {
    fail(diagnostic(error));
  }
}
const fold = (statuses) => STATUSES[Math.max(...statuses.map((status) => STATUSES.indexOf(status)))];
const metric = (value, status, unit) => ({ value: ["measured", "estimated"].includes(status) ? value : null, status, unit });
function elapsed(input) {
  if (!["resolved", "terminal", "unresolved"].includes(input.state))
    return metric(null, input.state === "unavailable" ? "unavailable" : "unknown", "ms");
  const endpoint = input[input.state === "resolved" ? "resolvedAt" : input.state === "terminal" ? "terminalAt" : "observedThroughAt"];
  const status = fold([input.firstObservedAt.status, endpoint.status]);
  const value = ["measured", "estimated"].includes(status) ? Date.parse(endpoint.value) - Date.parse(input.firstObservedAt.value) : null;
  requireValue(value === null || Number.isSafeInteger(value) && value >= 0, "C1-TIME");
  return metric(value, status, "ms");
}
export function buildInterruptionReceipt(input, registry) {
  try {
    registryCheck(registry);
    const normalized = normalize(input);
    const blockedWallTime = elapsed(normalized);
    const attemptCount = metric(normalized.joins.invocations.length || normalized.joins.reviews.length, normalized.attemptCoverage, "count");
    const recoveryCount = metric(normalized.joins.recoveries.length, normalized.recoveryCoverage, "count");
    const statuses = [normalized.firstObservedAt.status, normalized.observedThroughAt.status, blockedWallTime.status, attemptCount.status, recoveryCount.status];
    if (normalized.state === "resolved") statuses.push(normalized.resolvedAt.status);
    if (normalized.state === "terminal") statuses.push(normalized.terminalAt.status);
    const core = { schema: "pipeline.interruption-receipt.v1", contractPin: copy(PIN),
      ...Object.fromEntries(COPIED.map((key) => [key, normalized[key]])), ...classify(normalized, registry),
      derivationRevision: REVISION, registrySha256: hash(registry), blockedWallTime, attemptCount, recoveryCount,
      collectionStatus: fold(statuses) };
    return { ok: true, code: null, receipt: { ...core, recordSha256: hash(core) } };
  } catch (error) {
    return { ok: false, code: diagnostic(error), receipt: null };
  }
}
export function validateInterruptionReceipt(record, registry) {
  try {
    registryCheck(registry);
    safeJson(record);
    requireValue(exact(record, RECORD_KEYS));
    requireValue(same(record.contractPin, PIN) && record.derivationRevision === REVISION && record.registrySha256 === hash(registry), "C1-REGISTRY");
    for (const key of ["blockedWallTime", "attemptCount", "recoveryCount"]) {
      const value = record[key];
      requireValue(exact(value, ["value", "status", "unit"]) && STATUSES.includes(value.status)
        && value.unit === (key === "blockedWallTime" ? "ms" : "count")
        && (["measured", "estimated"].includes(value.status) ? Number.isSafeInteger(value.value) && value.value >= 0 : value.value === null));
    }
    const input = Object.fromEntries(COPIED.map((key) => [key, record[key]]));
    input.attemptCoverage = record.attemptCount.status;
    input.recoveryCoverage = record.recoveryCount.status;
    const rebuilt = buildInterruptionReceipt(input, registry);
    requireValue(rebuilt.ok, rebuilt.code);
    requireValue(same(record, rebuilt.receipt), "C1-CONFLICT");
    return { ok: true, code: null };
  } catch (error) {
    return { ok: false, code: diagnostic(error) };
  }
}

// Aggregate ingestion snapshots data descriptors, never caller property reads.
// Receipt depth starts at zero independently of the new wrapper/array layers.
function dataDescriptors(value) {
  requireValue(value !== null && typeof value === "object");
  const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
  requireValue(array ? prototype === Array.prototype : prototype === null || prototype === Object.prototype);
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
  requireValue(keys.every((key) => typeof key === "string"));
  requireValue(keys.every((key) => Object.hasOwn(descriptors[key], "value")
    && (array && key === "length" || descriptors[key].enumerable)));
  if (array) {
    const length = descriptors.length?.value;
    requireValue(Number.isSafeInteger(length) && length >= 0 && length <= 4096 && keys.length === length + 1
      && keys.every((key) => key === "length" || /^(?:0|[1-9][0-9]*)$/u.test(key) && Number(key) < length));
  } else requireValue(keys.length <= 64);
  return descriptors;
}
function snapshotJson(value, depth = 0, ancestors = new Set()) {
  requireValue(depth <= 16);
  if (value === null || typeof value !== "object") { safeJson(value, depth); return value; }
  requireValue(!ancestors.has(value));
  const descriptors = dataDescriptors(value), result = Array.isArray(value) ? [] : Object.create(null);
  ancestors.add(value);
  for (const key of Object.keys(descriptors)) {
    if (Array.isArray(value) && key === "length") continue;
    result[key] = snapshotJson(descriptors[key].value, depth + 1, ancestors);
  }
  ancestors.delete(value);
  return result;
}
const ordinal = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const count = (value) => {
  requireValue(Number.isSafeInteger(value) && value >= 0);
  return metric(value, "measured", "count");
};
const bounded = (rows) => { requireValue(rows.length <= 4096); return rows; };
const joinIdentity = {
  invocations: (row) => canonical([row.invocationId, row.attemptId]),
  reviews: (row) => row.reviewId,
  usages: (row) => canonical([row.scope.dispatchId, row.source.eventSha256]),
  recoveries: (row) => row.id,
};
const joinStatus = (row, kind) => kind === "recoveries" ? row.recoveryCount.status
  : kind === "usages" ? row.collectionStatus : row.attemptCount.status;
const measuredTime = (time) => time.status === "measured" ? time.value : null;
const signature = (row) => ({ phase: row.scope.phase, codeFamily: row.category,
  runner: row.actor.runner, role: row.actor.role, typedCode: row.typedCode, classification: row.classification });
const missingSignatureField = (key, value) => value === null
  || ["codeFamily", "classification"].includes(key) && value === "unknown";
const knownSignature = (key) => Object.entries(key).every(([field, value]) => !missingSignatureField(field, value));

function lineageHistory(rows) {
  for (const key of ["featureId", "packageId", "dispatchId"])
    requireValue(new Set(rows.map((row) => row.scope[key]).filter((value) => value !== null)).size <= 1, "C1-LINEAGE");
  // Maps keep large update histories bounded without flattening every replay.
  const observations = new Map(), artifacts = new Map();
  const joins = Object.fromEntries(Object.keys(joinIdentity).map((key) => [key, new Map()]));
  const retain = (map, key, row) => {
    requireValue(!map.has(key) || same(map.get(key), row), "C1-CONFLICT");
    map.set(key, row); requireValue(map.size <= 4096);
  };
  for (const row of rows) {
    for (const observation of row.observations) retain(observations, observation.artifact.id, observation);
    for (const artifact of row.binding.artifacts) retain(artifacts, artifact.id, artifact);
    for (const kind of Object.keys(joins)) for (const link of row.joins[kind]) retain(joins[kind], joinIdentity[kind](link), link);
  }
  chainCheck([...joins.invocations.values()], false);
  chainCheck([...joins.reviews.values()], false, true);
  const measuredStarts = [...new Set(rows.map((row) => measuredTime(row.firstObservedAt)).filter((value) => value !== null))];
  requireValue(measuredStarts.length <= 1, "C1-TIME");
  const finalRows = rows.filter((row) => ["resolved", "terminal"].includes(row.state));
  requireValue(new Set(finalRows.map((row) => row.state)).size <= 1, "C1-CONFLICT");
  for (const row of finalRows) requireValue(same(row.resolution, finalRows[0].resolution), "C1-CONFLICT");
  const endpointKey = finalRows[0]?.state === "terminal" ? "terminalAt" : "resolvedAt";
  const measuredEnds = [...new Set(finalRows.map((row) => measuredTime(row[endpointKey])).filter((value) => value !== null))];
  requireValue(measuredEnds.length <= 1, "C1-TIME");
  const chronological = rows.filter((row) => row.observedThroughAt.status === "measured")
    .sort((a, b) => ordinal(a.observedThroughAt.value, b.observedThroughAt.value) || ordinal(a.eventId, b.eventId));
  const seen = Object.fromEntries(Object.keys(joins).map((key) => [key, new Set()]));
  let prior = null, closedState = null, unresolvedCutoff = null;
  for (const row of chronological) {
    if (measuredStarts.length) requireValue(measuredStarts[0] <= row.observedThroughAt.value, "C1-TIME");
    if (prior?.observedThroughAt.value === row.observedThroughAt.value) {
      const withoutIdentity = ({ eventId, recordSha256, ...rest }) => rest;
      requireValue(same(withoutIdentity(prior), withoutIdentity(row)), "C1-CONFLICT");
    }
    requireValue(closedState === null || row.state === closedState, "C1-CONFLICT");
    if (["resolved", "terminal"].includes(row.state)) {
      closedState = row.state;
      if (unresolvedCutoff !== null && row[endpointKey].status === "measured")
        requireValue(unresolvedCutoff <= row[endpointKey].value, "C1-TIME");
    }
    if (row.state === "unresolved") unresolvedCutoff = row.observedThroughAt.value;
    for (const kind of Object.keys(joins)) {
      const current = new Set(row.joins[kind].map(joinIdentity[kind]));
      if (joinStatus(row, kind) === "measured")
        requireValue([...seen[kind]].every((key) => current.has(key)), "C1-LINEAGE");
      for (const key of current) seen[kind].add(key);
    }
    prior = row;
  }
  if (measuredStarts.length && measuredEnds.length) requireValue(measuredStarts[0] <= measuredEnds[0], "C1-TIME");
  const orderingStatus = fold(rows.map((row) => row.observedThroughAt.status));
  const latest = rows.length === 1 ? rows[0] : orderingStatus === "measured"
    ? chronological.find((row) => row.observedThroughAt.value === chronological.at(-1).observedThroughAt.value) : null;
  const missingStatus = orderingStatus === "unavailable" ? "unavailable" : "unknown";
  const signatures = uniqueRows(rows.map(signature), canonical);
  return {
    rows, latest, signatures, stableSignature: signatures.length === 1 && knownSignature(signatures[0]) ? signatures[0] : null,
    measuredStart: measuredStarts[0] ?? null, measuredEnd: measuredEnds[0] ?? null,
    completeClocks: rows.every((row) => row.firstObservedAt.status === "measured" && row.observedThroughAt.status === "measured"
      && (!["resolved", "terminal"].includes(row.state) || row[endpointKey].status === "measured")),
    episode: { lineageId: rows[0].lineageId, eventIds: rows.map((row) => row.eventId).sort(), latestEventId: latest?.eventId ?? null,
      orderingStatus, classifications: [...new Set(rows.map((row) => row.classification))].sort(), states: [...new Set(rows.map((row) => row.state))].sort(),
      blockedWallTime: latest ? copy(latest.blockedWallTime) : metric(null, missingStatus, "ms"),
      attemptCount: latest ? copy(latest.attemptCount) : metric(null, missingStatus, "count"),
      recoveryCount: latest ? copy(latest.recoveryCount) : metric(null, missingStatus, "count") },
  };
}
function ratio(numerator, denominator, status) {
  requireValue(numerator <= denominator);
  const effectiveStatus = denominator === 0 ? "unknown" : status;
  return { numerator: count(numerator), denominator: count(denominator),
    value: ["measured", "estimated"].includes(effectiveStatus) ? numerator / denominator : null, status: effectiveStatus, unit: "ratio" };
}
function followupOutcome(member, histories, window, coverage) {
  const key = member.stableSignature, endpoint = member.measuredEnd;
  if (!key || endpoint === null || window.end.status !== "measured" || endpoint >= window.end.value) return "unknown";
  let complete = member.completeClocks && coverage.receipts === "measured" && coverage.followup === "measured";
  for (const peer of histories) {
    if (peer === member) continue;
    // A measured start outside this exposure cannot hide a later new episode,
    // even when some of that peer's other observations are unavailable.
    if (peer.measuredStart !== null && (peer.measuredStart <= endpoint || peer.measuredStart > window.end.value)) continue;
    const potential = peer.signatures.some((observed) => Object.keys(key).every((field) =>
      missingSignatureField(field, observed[field]) || observed[field] === key[field]));
    if (!potential) continue;
    if (peer.stableSignature && same(peer.stableSignature, key) && peer.measuredStart !== null
      && peer.measuredStart > endpoint && peer.measuredStart <= window.end.value) return "recurred";
    // Unknown or changing signatures/clocks cannot support a negative claim.
    if (!peer.stableSignature || !peer.completeClocks) complete = false;
  }
  return complete ? "noRecurrenceObserved" : "unknown";
}
function effectiveness(members, histories, window, coverage) {
  const assessed = members.filter(({ latest }) => latest && latest.classification !== "unknown"
    && ["unresolved", "resolved", "terminal"].includes(latest.state)
    && !(latest.state === "resolved" && latest.classification === "terminal-blocker"));
  const resolved = assessed.filter(({ latest }) => latest.state === "resolved");
  const outcomes = { recurred: 0, noRecurrenceObserved: 0, unknown: 0 };
  for (const member of resolved) outcomes[followupOutcome(member, histories, window, coverage)]++;
  const followupAssessed = outcomes.recurred + outcomes.noRecurrenceObserved;
  return { assessedCount: count(assessed.length), resolvedCount: count(resolved.length), unassessedCount: count(members.length - assessed.length),
    resolvedShare: ratio(resolved.length, assessed.length, fold([coverage.receipts, ...assessed.map(({ latest }) => latest.collectionStatus)])),
    followup: { resolvedCohortCount: count(resolved.length), assessedCount: count(followupAssessed),
      recurredCount: count(outcomes.recurred), noRecurrenceObservedCount: count(outcomes.noRecurrenceObserved), unknownCount: count(outcomes.unknown),
      recurrenceShare: ratio(outcomes.recurred, followupAssessed,
        fold([coverage.receipts, coverage.followup, outcomes.unknown ? "estimated" : "measured"])) } };
}

/** Derive a local observed-population view; no collection or success authority. */
export function aggregateInterruptionReceipts(input, registry) {
  try {
    let rules;
    try { rules = snapshotJson(registry); registryCheck(rules); } catch { fail("C1-REGISTRY"); }
    const fields = dataDescriptors(input);
    requireValue(!Array.isArray(input) && exact(fields, ["receipts", "window", "coverage"]));
    const window = snapshotJson(fields.window.value), coverage = snapshotJson(fields.coverage.value);
    requireValue(exact(window, ["start", "end"]));
    timeCheck(window.start); timeCheck(window.end);
    requireValue(exact(coverage, ["receipts", "followup"]) && Object.values(coverage).every((status) => STATUSES.includes(status)));
    requireValue(window.start.value === null || window.end.value === null || window.start.value <= window.end.value, "C1-TIME");
    if (Object.values(coverage).includes("measured"))
      requireValue(window.start.status === "measured" && window.end.status === "measured", "C1-TIME");
    const source = fields.receipts.value, rows = dataDescriptors(source);
    requireValue(Array.isArray(source));
    const events = new Map();
    for (let index = 0; index < rows.length.value; index++) {
      const row = snapshotJson(rows[index].value), validation = validateInterruptionReceipt(row, rules);
      requireValue(validation.ok, validation.code);
      if (row.observedThroughAt.value !== null) {
        requireValue(window.start.value === null || row.observedThroughAt.value >= window.start.value, "C1-TIME");
        requireValue(window.end.value === null || row.observedThroughAt.value <= window.end.value, "C1-TIME");
      }
      requireValue(!events.has(row.eventId) || same(events.get(row.eventId), row), "C1-CONFLICT");
      events.set(row.eventId, row);
    }
    const receipts = [...events.values()].sort((a, b) => ordinal(a.eventId, b.eventId)), lineages = new Map();
    for (const row of receipts) {
      if (!lineages.has(row.lineageId)) lineages.set(row.lineageId, []);
      lineages.get(row.lineageId).push(row);
    }
    const histories = [...lineages.entries()].sort(([a], [b]) => ordinal(a, b)).map(([, rows]) => lineageHistory(rows));
    const byLineage = new Map(histories.map((history) => [history.episode.lineageId, history]));
    const totals = { eventCount: count(receipts.length), episodeCount: count(histories.length) };
    for (const state of STATES) totals[`${state}Count`] = count(histories.filter(({ latest }) => latest?.state === state).length);
    totals.unassessedCount = count(histories.filter(({ latest }) => latest === null).length);
    const dimensions = { phase: (row) => row.scope.phase, codeFamily: (row) => row.category,
      runner: (row) => row.actor.runner, role: (row) => row.actor.role, recurrenceSignature: signature, resolutionClass: (row) => row.resolution?.class ?? null };
    const groups = {};
    for (const [dimension, keyFor] of Object.entries(dimensions)) {
      const buckets = new Map();
      for (const row of receipts) {
        const key = keyFor(row), bytes = canonical(key);
        if (!buckets.has(bytes)) buckets.set(bytes, { key, lineageIds: new Set() });
        buckets.get(bytes).lineageIds.add(row.lineageId);
      }
      groups[dimension] = bounded([...buckets.entries()]).sort(([a], [b]) => ordinal(a, b)).map(([, bucket]) => {
        const lineageIds = [...bucket.lineageIds].sort();
        return { key: bucket.key, lineageIds, episodeCount: count(lineageIds.length),
          effectiveness: effectiveness(lineageIds.map((id) => byLineage.get(id)), histories, window, coverage) };
      });
    }
    const categoryRanking = groups.codeFamily.map((group) => ({ category: group.key, lineageIds: group.lineageIds,
      episodeCount: count(group.lineageIds.length), repeatCount: count(Math.max(group.lineageIds.length - 1, 0)) }))
      .sort((a, b) => b.episodeCount.value - a.episodeCount.value || ordinal(a.category, b.category));
    const core = { schema: "pipeline.interruption-aggregate.v1", contractPin: PIN, derivationRevision: REVISION,
      registrySha256: hash(rules), window, coverage, receipts, episodes: histories.map(({ episode }) => episode), totals, groups, categoryRanking };
    return { ok: true, code: null, aggregate: copy({ ...core, recordSha256: hash(core) }) };
  } catch (error) { return { ok: false, code: diagnostic(error), aggregate: null }; }
}

function diagnostic(error) {
  try {
    const descriptor = error !== null && typeof error === "object" ? Object.getOwnPropertyDescriptor(error, "message") : null;
    const code = descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : null;
    return ["C1-SHAPE", "C1-REGISTRY", "C1-BINDING", "C1-TIME", "C1-LINEAGE", "C1-CONFLICT"].includes(code) ? code : "C1-SHAPE";
  } catch { return "C1-SHAPE"; }
}
