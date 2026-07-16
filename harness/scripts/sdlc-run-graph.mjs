/**
 * Canonical Phase-3 SDLC run graph.
 *
 * The v2 path is deliberately closed and data-only.  The v1 path is a
 * compatibility reader: it neither upgrades nor derives meaning from historic
 * counters.  Projection is available only for a valid v2 graph.
 */

export const GRAPH_SCHEMA_VERSION = "pipeline.sdlc-run-graph.v2";
export const LEGACY_GRAPH_SCHEMA_VERSION = "pipeline.sdlc-run-graph.v1";
export const PROJECTION_GENERATOR_VERSION = "pipeline-sdlc-mermaid.v2";

export const STAGES = Object.freeze([
  "work", "stage-verify", "critic", "correction", "delta-regate",
  "intent", "state-cas", "final-verify", "delivery", "fetch-back",
  "close", "course", "failover",
]);

export const OUTCOMES = Object.freeze([
  "succeeded", "failed", "stopped", "deferred", "superseded",
]);

export const LOOP_FAMILIES = Object.freeze([
  "critic-correction", "delta-regate", "product-retry", "environment-failover",
]);

export const LOOP_BOUNDS = Object.freeze({
  "critic-correction": 2,
  "delta-regate": 2,
  "product-retry": 1,
  "environment-failover": 1,
});

export const COMMIT_BOUND_STAGES = Object.freeze([
  "work", "stage-verify", "critic", "correction", "delta-regate",
  "intent", "state-cas", "final-verify", "delivery", "fetch-back", "close",
]);

const STAGE_SET = new Set(STAGES);
const OUTCOME_SET = new Set(OUTCOMES);
const LOOP_FAMILY_SET = new Set(LOOP_FAMILIES);
const COMMIT_BOUND_STAGE_SET = new Set(COMMIT_BOUND_STAGES);
const FAULT_DOMAINS = new Set(["product", "execution-environment", "unknown"]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const GIT_OBJECT_ID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const SHA256 = /^[a-f0-9]{64}$/;
const LEGACY_FAMILY_CONTRACT = Object.freeze([
  ["initial-full-critic", "event"],
  ["critic-correction", "back-edge"],
  ["delta-regate", "back-edge"],
  ["product-retry", "back-edge"],
  ["environment-failover", "reroute"],
  ["scope-course-stop", "gate"],
  ["package-push-fetch-back", "event"],
]);
const LEGACY_FAMILIES = new Set(LEGACY_FAMILY_CONTRACT.map(([family]) => family));
const LEGACY_BACK_EDGE_FAMILIES = new Set(["critic-correction", "delta-regate", "product-retry"]);
const LEGACY_EVENT_TYPES = new Set([
  "start", "work", "critic", "correction", "verify", "retry", "failover",
  "gate", "po-decision", "push-fetch-back", "handoff", "close",
]);
const LEGACY_EDGE_KINDS = new Set(["event", "back-edge", "reroute", "gate"]);
const LEGACY_LOOP_OUTCOMES = new Set(["succeeded", "failed", "stopped", "deferred"]);
const LEGACY_EXIT_REASONS = new Set([
  "corrected", "regate-pass", "retry-pass", "retry-failed", "budget-exhausted",
  "po-stop", "po-defer",
]);
const LEGACY_SOURCE_COLLECTIONS = new Set([
  "packageResults", "finalIntegrations", "decisionBriefs", "courseDecisionIntents",
  "courseDecisionReceipts", "externalEvidence",
]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, required, optional = []) {
  if (!isObject(value)) return false;
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key))
    && Object.keys(value).every((key) => allowed.has(key));
}

function safeId(value) {
  return typeof value === "string" && SAFE_ID.test(value);
}

function safeInteger(value, minimum = 0) {
  return Number.isSafeInteger(value) && value >= minimum;
}

function gitObjectId(value) {
  return typeof value === "string" && GIT_OBJECT_ID.test(value);
}

function digest(value) {
  return typeof value === "string" && SHA256.test(value);
}

function isStrictlyIncreasing(values) {
  return values.every((value, index) => typeof value === "string"
    && (index === 0 || (typeof values[index - 1] === "string" && values[index - 1] < value)));
}

function validateLegacySourceRef(ref) {
  return exactKeys(ref, ["collection", "id", "sha256"])
    && LEGACY_SOURCE_COLLECTIONS.has(ref.collection) && safeId(ref.id) && digest(ref.sha256);
}

function validateLegacyEvent(event) {
  return exactKeys(event, [
    "eventId", "sequence", "eventType", "outcome", "packageId", "actionId",
    "originChainId", "boundedFamily", "decisionBriefId", "sourceRefs",
  ])
    && safeId(event.eventId) && safeInteger(event.sequence)
    && LEGACY_EVENT_TYPES.has(event.eventType) && OUTCOME_SET.has(event.outcome)
    && [event.packageId, event.actionId, event.originChainId].every(safeId)
    && (event.boundedFamily === null || LEGACY_FAMILIES.has(event.boundedFamily))
    && (event.decisionBriefId === null || safeId(event.decisionBriefId))
    && Array.isArray(event.sourceRefs) && event.sourceRefs.length >= 1
    && event.sourceRefs.length <= 32 && event.sourceRefs.every(validateLegacySourceRef);
}

function validateLegacyEdge(edge) {
  return exactKeys(edge, [
    "edgeId", "fromEventId", "toEventId", "kind", "boundedFamily", "loopStableId",
    "sourceRefs",
  ])
    && [edge.edgeId, edge.fromEventId, edge.toEventId].every(safeId)
    && LEGACY_EDGE_KINDS.has(edge.kind)
    && (edge.boundedFamily === null || LEGACY_FAMILIES.has(edge.boundedFamily))
    && (edge.loopStableId === null || safeId(edge.loopStableId))
    && Array.isArray(edge.sourceRefs) && edge.sourceRefs.length >= 1
    && edge.sourceRefs.length <= 32 && edge.sourceRefs.every(validateLegacySourceRef);
}

function validateLegacyEvidence(entry) {
  return exactKeys(entry, ["id", "sha256"]) && safeId(entry.id) && digest(entry.sha256);
}

function validateLegacyLoop(loop) {
  return exactKeys(loop, [
    "stableId", "family", "packageId", "actionId", "originChainId", "triggerEvidence",
    "attemptResultDigests", "normalizedFailureSignature", "similarityGroupId",
    "observedCount", "configuredLimit", "outcome", "exitReason", "decisionBriefId",
  ])
    && [loop.stableId, loop.packageId, loop.actionId, loop.originChainId, loop.similarityGroupId].every(safeId)
    && LEGACY_BACK_EDGE_FAMILIES.has(loop.family) && digest(loop.normalizedFailureSignature)
    && Array.isArray(loop.triggerEvidence) && loop.triggerEvidence.length >= 1
    && loop.triggerEvidence.length <= 32 && loop.triggerEvidence.every(validateLegacyEvidence)
    && Array.isArray(loop.attemptResultDigests) && loop.attemptResultDigests.length >= 1
    && loop.attemptResultDigests.length <= 16
    && loop.attemptResultDigests.every((entry) => exactKeys(entry, ["attemptId", "resultSha256"])
      && safeId(entry.attemptId) && digest(entry.resultSha256))
    && safeInteger(loop.observedCount, 1) && safeInteger(loop.configuredLimit, 1)
    && LEGACY_LOOP_OUTCOMES.has(loop.outcome) && LEGACY_EXIT_REASONS.has(loop.exitReason)
    && (loop.decisionBriefId === null || safeId(loop.decisionBriefId));
}

/*
 * Standalone graph callers receive the same closed structural contract as the
 * historical checker. File-level v1 Result reads are still delegated to the
 * unchanged Phase-2.6 checker, which owns its Result/source semantics.
 */
function validateLegacyV1(graph) {
  const findings = [];
  const rootKeys = [
    "schemaVersion", "featureId", "graphCutoffEventId", "sourceEventSetSha256",
    "completionClaim", "events", "edges", "boundedFamilies", "loopRecords",
  ];
  if (!exactKeys(graph, rootKeys)) {
    return { ok: false, findings: ["historical v1 graph violates the closed root contract"] };
  }
  if (graph.schemaVersion !== LEGACY_GRAPH_SCHEMA_VERSION || !safeId(graph.featureId)
    || !safeId(graph.graphCutoffEventId) || !digest(graph.sourceEventSetSha256)
    || !["candidate-handoff", "phase-close"].includes(graph.completionClaim)) {
    findings.push("historical v1 graph has malformed root identity or completion fields");
  }
  if (!Array.isArray(graph.events) || graph.events.length < 1 || graph.events.length > 512) {
    findings.push("historical v1 events must be a non-empty bounded array");
  }
  if (!Array.isArray(graph.edges) || graph.edges.length > 1024) {
    findings.push("historical v1 edges must be a bounded array");
  }
  if (!Array.isArray(graph.boundedFamilies) || graph.boundedFamilies.length !== LEGACY_FAMILY_CONTRACT.length) {
    findings.push("historical v1 boundedFamilies must inventory exactly seven families");
  }
  if (!Array.isArray(graph.loopRecords) || graph.loopRecords.length > 128) {
    findings.push("historical v1 loopRecords must be a bounded array");
  }
  if (![graph.events, graph.edges, graph.boundedFamilies, graph.loopRecords].every(Array.isArray)) {
    return { ok: false, findings };
  }
  if (!graph.events.every(validateLegacyEvent)) findings.push("historical v1 events contain a malformed closed record");
  if (!graph.edges.every(validateLegacyEdge)) findings.push("historical v1 edges contain a malformed closed record");
  if (!graph.loopRecords.every(validateLegacyLoop)) findings.push("historical v1 loopRecords contain a malformed closed record");
  for (let index = 0; index < graph.boundedFamilies.length; index += 1) {
    const entry = graph.boundedFamilies[index];
    const expected = LEGACY_FAMILY_CONTRACT[index];
    if (!exactKeys(entry, ["family", "kind", "count", "disposition"])
      || entry.family !== expected?.[0] || entry.kind !== expected?.[1]
      || !safeInteger(entry.count)
      || entry.disposition !== (entry.count === 0 ? "not-triggered" : "executed")) {
      findings.push(`historical v1 bounded family ${expected?.[0] ?? index} is missing, reordered or malformed`);
    }
  }
  const eventIds = graph.events.map((event) => event?.eventId);
  if (new Set(eventIds).size !== eventIds.length) findings.push("historical v1 event IDs must be unique");
  if (!graph.events.every((event, index) => event?.sequence === index)) findings.push("historical v1 events must use contiguous sequence order");
  if (graph.events.at(-1)?.eventId !== graph.graphCutoffEventId) findings.push("historical v1 cutoff must be the final event");
  const edgeIds = graph.edges.map((edge) => edge?.edgeId);
  if (new Set(edgeIds).size !== edgeIds.length
    || edgeIds.some((id, index) => index > 0 && (!(typeof id === "string") || edgeIds[index - 1] >= id))) {
    findings.push("historical v1 edge IDs must be unique and lexically ordered");
  }
  const loopIds = graph.loopRecords.map((loop) => loop?.stableId);
  if (new Set(loopIds).size !== loopIds.length
    || loopIds.some((id, index) => index > 0 && (!(typeof id === "string") || loopIds[index - 1] >= id))) {
    findings.push("historical v1 loop IDs must be unique and lexically ordered");
  }
  return { ok: findings.length === 0, findings };
}

function validateEventShape(event, findings) {
  const required = [
    "eventId", "cycleId", "sequence", "packageId", "actionId", "stage",
    "sourceEvidenceIds", "outcome",
  ];
  const optional = ["candidateCommit", "tree", "faultDomain", "failureSignature"];
  if (!exactKeys(event, required, optional)) {
    findings.push(`event ${event?.eventId ?? "unknown"} violates the closed v2 event shape`);
    return;
  }
  if (![event.eventId, event.cycleId, event.packageId, event.actionId].every(safeId)) {
    findings.push(`event ${event.eventId ?? "unknown"} has an invalid stable identity`);
  }
  if (!safeInteger(event.sequence)) findings.push(`event ${event.eventId} sequence must be a non-negative integer`);
  if (!STAGE_SET.has(event.stage)) findings.push(`event ${event.eventId} has an invalid stage`);
  if (!OUTCOME_SET.has(event.outcome)) findings.push(`event ${event.eventId} has an invalid outcome`);
  if (!Array.isArray(event.sourceEvidenceIds) || event.sourceEvidenceIds.length < 1
    || event.sourceEvidenceIds.length > 64 || !event.sourceEvidenceIds.every(safeId)
    || new Set(event.sourceEvidenceIds).size !== event.sourceEvidenceIds.length) {
    findings.push(`event ${event.eventId} sourceEvidenceIds must be non-empty, duplicate-free stable IDs`);
  }

  if (COMMIT_BOUND_STAGE_SET.has(event.stage)) {
    if (!gitObjectId(event.candidateCommit)) findings.push(`event ${event.eventId} stage ${event.stage} requires a candidateCommit`);
    if (!gitObjectId(event.tree)) findings.push(`event ${event.eventId} stage ${event.stage} requires a tree`);
  } else if (Object.hasOwn(event, "candidateCommit") !== Object.hasOwn(event, "tree")
    || (Object.hasOwn(event, "candidateCommit")
      && (!gitObjectId(event.candidateCommit) || !gitObjectId(event.tree)))) {
    findings.push(`event ${event.eventId} has an incomplete or malformed optional commit/tree binding`);
  }

  const hasDomain = Object.hasOwn(event, "faultDomain");
  const hasSignature = Object.hasOwn(event, "failureSignature");
  const faultApplicable = event.outcome === "failed" || event.stage === "course" || event.stage === "failover";
  if ((event.outcome === "failed" || event.stage === "failover") && !hasDomain && !hasSignature) {
    findings.push(`event ${event.eventId} requires digest-bound fault metadata for ${event.stage}/${event.outcome}`);
  }
  if (hasDomain !== hasSignature) {
    findings.push(`event ${event.eventId} faultDomain and failureSignature must be present together`);
  } else if (hasDomain) {
    if (!faultApplicable) findings.push(`event ${event.eventId} fault metadata is not applicable to ${event.stage}/${event.outcome}`);
    if (!FAULT_DOMAINS.has(event.faultDomain)) findings.push(`event ${event.eventId} has an invalid faultDomain`);
    if (typeof event.failureSignature !== "string" || !SHA256.test(event.failureSignature)) {
      findings.push(`event ${event.eventId} failureSignature must be a SHA-256 digest`);
    }
  }
}

function deriveLoopCounts(graph, findings) {
  const counts = {
    "critic-correction": graph.events.filter((event) => event?.stage === "correction").length,
    "delta-regate": graph.events.filter((event) => event?.stage === "delta-regate").length,
    "product-retry": 0,
    "environment-failover": graph.events.filter((event) => event?.stage === "failover").length,
  };
  for (const cycle of graph.cycles) {
    if (!isObject(cycle)) continue;
    const attempts = graph.events.filter((event) => isObject(event)
      && event.cycleId === cycle.cycleId && event.stage === "work");
    counts["product-retry"] += Math.max(0, attempts.length - 1);
    if (attempts.length > 1) {
      const first = attempts[0];
      const retry = attempts[1];
      if (first.outcome !== "failed" || first.faultDomain !== "product" || !digest(first.failureSignature)) {
        findings.push(`cycle ${cycle?.cycleId ?? "unknown"} product retry must follow one digest-bound failed product work attempt`);
      }
      if (retry.outcome === "failed"
        && (retry.faultDomain !== "product" || !digest(retry.failureSignature))) {
        findings.push(`cycle ${cycle?.cycleId ?? "unknown"} failed product retry must remain in the product fault domain with a failure signature`);
      }
      if (first.outcome === "failed" && first.faultDomain === "product"
        && retry.outcome === "failed" && retry.faultDomain === "product"
        && retry.failureSignature === first.failureSignature) {
        const retryIndex = graph.events.indexOf(retry);
        const courseIndex = graph.events.findIndex((event, index) => index > retryIndex
          && event?.stage === "course" && event.cycleId === retry.cycleId
          && event.packageId === retry.packageId && event.actionId === retry.actionId
          && event.faultDomain === "product" && event.failureSignature === retry.failureSignature);
        if (courseIndex === -1) {
          findings.push(`cycle ${cycle.cycleId} recurring product retry signature requires a later matching course event in the same package/action/cycle`);
        }
      }
    }
  }
  for (const event of graph.events.filter((entry) => entry?.stage === "failover")) {
    if (event.faultDomain !== "execution-environment") {
      findings.push(`failover event ${event.eventId ?? "unknown"} must remain in the execution-environment fault domain`);
    }
  }
  return counts;
}

function validateSuccessfulCloseChain(events, label, findings) {
  const expectedStages = ["final-verify", "delivery", "fetch-back", "close"];
  const tail = events.slice(-expectedStages.length);
  if (tail.length !== expectedStages.length
    || tail.some((event, index) => event?.stage !== expectedStages[index] || event.outcome !== "succeeded")) {
    findings.push(`${label} requires a successful terminal final-verify -> delivery -> fetch-back -> close chain`);
    return;
  }
  const [first] = tail;
  if (tail.some((event) => event.candidateCommit !== first.candidateCommit || event.tree !== first.tree)) {
    findings.push(`${label} terminal chain must bind one unchanged final commit/tree`);
  }
  if (tail.some((event) => event.cycleId !== first.cycleId
    || event.packageId !== first.packageId || event.actionId !== first.actionId)) {
    findings.push(`${label} terminal chain must remain in one package/action/cycle`);
  }
}

function validatePhaseCloseTail(graph, findings) {
  if (graph.completionClaim !== "phase-close") return;
  for (const cycle of graph.cycles) {
    if (!isObject(cycle)) continue;
    const cycleEvents = graph.events.filter((event) => isObject(event) && event.cycleId === cycle.cycleId);
    validateSuccessfulCloseChain(cycleEvents, `phase-close cycle ${cycle.cycleId}/${cycle.packageId}`, findings);
  }
  validateSuccessfulCloseChain(graph.events, "phase-close global chronology", findings);
}

function validateV2(graph) {
  const findings = [];
  const rootKeys = ["schemaVersion", "featureId", "completionClaim", "cycles", "events", "loopAggregates"];
  if (!exactKeys(graph, rootKeys)) {
    return { ok: false, findings: ["v2 graph violates the closed top-level graph shape"] };
  }
  if (!safeId(graph.featureId)) findings.push("v2 graph featureId is invalid");
  if (!["candidate-handoff", "phase-close"].includes(graph.completionClaim)) findings.push("v2 graph completionClaim is invalid");
  if (!Array.isArray(graph.cycles) || graph.cycles.length < 1 || graph.cycles.length > 512) {
    findings.push("v2 graph cycles must be a non-empty bounded array");
  }
  if (!Array.isArray(graph.events) || graph.events.length < 1 || graph.events.length > 4096) {
    findings.push("v2 graph events must be a non-empty bounded array");
  }
  if (!Array.isArray(graph.loopAggregates)) findings.push("v2 graph loopAggregates must be an array");
  if (findings.length > 0 && (!Array.isArray(graph.cycles) || !Array.isArray(graph.events) || !Array.isArray(graph.loopAggregates))) {
    return { ok: false, findings };
  }

  for (const event of graph.events) validateEventShape(event, findings);
  const eventIds = graph.events.map((event) => event?.eventId);
  if (new Set(eventIds).size !== eventIds.length) findings.push("event IDs must be unique without duplicate event identity");
  if (!isStrictlyIncreasing(eventIds)) findings.push("events must remain in monotonically increasing eventId order");

  const cycleIds = [];
  const cyclePackages = [];
  for (const cycle of graph.cycles) {
    if (!exactKeys(cycle, ["cycleId", "packageId", "sequence", "eventIds"])) {
      findings.push(`cycle ${cycle?.cycleId ?? "unknown"} violates the closed cycle shape`);
      continue;
    }
    cycleIds.push(cycle.cycleId);
    cyclePackages.push(cycle.packageId);
    if (!safeId(cycle.cycleId) || !safeId(cycle.packageId)) findings.push(`cycle ${cycle.cycleId ?? "unknown"} has an invalid identity`);
    if (!safeInteger(cycle.sequence)) findings.push(`cycle ${cycle.cycleId} sequence must be a non-negative integer`);
    if (!Array.isArray(cycle.eventIds) || cycle.eventIds.length < 1 || cycle.eventIds.length > 4096
      || !cycle.eventIds.every(safeId)
      || new Set(cycle.eventIds).size !== cycle.eventIds.length) {
      findings.push(`cycle ${cycle.cycleId} event membership must contain ordered unique event IDs`);
    }
  }
  if (new Set(cycleIds).size !== cycleIds.length) findings.push("cycle IDs must be unique and cannot be reused to reset a bound");
  if (new Set(cyclePackages).size !== cyclePackages.length) findings.push("a package cycle identity cannot be reset under a second cycle");
  if (!graph.cycles.every((cycle, index) => cycle?.sequence === index)) findings.push("cycles must have strict contiguous sequence order");

  const cyclesById = new Map(graph.cycles.map((cycle) => [cycle?.cycleId, cycle]));
  const membership = new Map();
  for (const cycle of graph.cycles) {
    if (!Array.isArray(cycle?.eventIds)) continue;
    const actual = graph.events.filter((event) => isObject(event) && event.cycleId === cycle.cycleId)
      .map((event) => event.eventId);
    if (actual.length !== cycle.eventIds.length || actual.some((id, index) => id !== cycle.eventIds[index])) {
      findings.push(`cycle ${cycle.cycleId} event membership does not preserve graph order`);
    }
    cycle.eventIds.forEach((eventId) => {
      if (membership.has(eventId)) findings.push(`event ${eventId} belongs to more than one cycle`);
      membership.set(eventId, cycle.cycleId);
    });
  }
  for (const event of graph.events) {
    if (!isObject(event)) continue;
    const cycle = cyclesById.get(event?.cycleId);
    if (!cycle) {
      findings.push(`event ${event?.eventId ?? "unknown"} references a missing cycle`);
      continue;
    }
    if (cycle.packageId !== event.packageId) findings.push(`event ${event.eventId} contradicts cycle package ownership`);
    if (membership.get(event.eventId) !== event.cycleId) findings.push(`event ${event.eventId} is absent from its cycle event membership`);
  }
  for (const cycle of graph.cycles) {
    if (!isObject(cycle)) continue;
    const cycleEvents = graph.events.filter((event) => isObject(event) && event.cycleId === cycle.cycleId);
    if (!cycleEvents.every((event, index) => event.sequence === index)) {
      findings.push(`cycle ${cycle?.cycleId ?? "unknown"} event sequence must be strict, integer and contiguous`);
    }
    const actions = new Set(cycleEvents.map((event) => event.actionId));
    if (actions.size > 1) findings.push(`cycle ${cycle?.cycleId ?? "unknown"} cannot change action dispatch identity`);
  }

  validatePhaseCloseTail(graph, findings);

  if (graph.loopAggregates.length !== LOOP_FAMILIES.length) {
    findings.push("loopAggregates must contain exactly one aggregate per loop family");
  }
  const aggregateFamilies = [];
  for (const aggregate of graph.loopAggregates) {
    if (!exactKeys(aggregate, ["family", "count", "bound"])) {
      findings.push(`loop aggregate ${aggregate?.family ?? "unknown"} violates the closed aggregate shape`);
      continue;
    }
    aggregateFamilies.push(aggregate.family);
    if (!LOOP_FAMILY_SET.has(aggregate.family)) findings.push(`loop aggregate ${aggregate.family} has an invalid family`);
    const fixedBound = LOOP_BOUNDS[aggregate.family];
    if (!safeInteger(aggregate.count) || aggregate.bound !== fixedBound || aggregate.count > fixedBound) {
      findings.push(`loop aggregate ${aggregate.family} count/bound is invalid`);
    }
  }
  if (new Set(aggregateFamilies).size !== aggregateFamilies.length
    || LOOP_FAMILIES.some((family, index) => aggregateFamilies[index] !== family)) {
    findings.push("loopAggregates must be unique and in stable family order");
  }
  const chronologyCounts = deriveLoopCounts(graph, findings);
  for (const [family, count] of Object.entries(chronologyCounts)) {
    const aggregate = graph.loopAggregates.find((entry) => entry?.family === family);
    if (aggregate && aggregate.count !== count) findings.push(`loop aggregate ${family} count does not match typed events`);
  }

  return { ok: findings.length === 0, findings };
}

/** Validate either a historical v1 graph or the closed v2 contract without mutation. */
export function validateSdlcRunGraph(graph) {
  if (graph?.schemaVersion === LEGACY_GRAPH_SCHEMA_VERSION) return validateLegacyV1(graph);
  if (graph?.schemaVersion === GRAPH_SCHEMA_VERSION) return validateV2(graph);
  return { ok: false, findings: ["unsupported SDLC run graph schemaVersion"] };
}

/**
 * Construct an immutable v2 graph from caller-owned data.  No defaults are
 * inferred because doing so would fabricate chronology or loop counts.
 */
export function createSdlcRunGraph(graph) {
  const copy = structuredClone(graph);
  const checked = validateV2(copy);
  if (!checked.ok) throw new TypeError(`invalid v2 SDLC run graph: ${checked.findings.join("; ")}`);
  const freeze = (value) => {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      Object.freeze(value);
      Object.values(value).forEach(freeze);
    }
    return value;
  };
  return freeze(copy);
}

/** Render canonical LF-terminated Mermaid bytes from v2 graph data only. */
export function renderSdlcMermaidV2(graph) {
  const checked = validateV2(graph);
  if (!checked.ok) throw new TypeError(`invalid v2 graph for projection: ${checked.findings.join("; ")}`);

  const lines = ["flowchart TD", "  graph_start([sdlc-v2-start])", "  graph_end([sdlc-v2-end])"];
  for (let index = 0; index < graph.events.length; index += 1) {
    const event = graph.events[index];
    lines.push(`  event_${index}["${index}:${event.eventId}:${event.cycleId}:${event.sequence}:${event.stage}:${event.outcome}"]`);
  }
  if (graph.events.length > 0) {
    lines.push("  graph_start --> event_0");
    for (let index = 1; index < graph.events.length; index += 1) {
      lines.push(`  event_${index - 1} --> event_${index}`);
    }
    lines.push(`  event_${graph.events.length - 1} --> graph_end`);
  }
  for (const aggregate of graph.loopAggregates) {
    lines.push(`  graph_start -.->|loop ${aggregate.family} count=${aggregate.count} bound=${aggregate.bound}| graph_end`);
  }
  lines.push("  graph_start -.->|product-retry branch| branch_product_retry{product-retry}");
  lines.push("  graph_start -.->|failover branch| branch_failover{failover}");
  lines.push("  graph_start -.->|course branch| branch_course{course}");
  lines.push("  graph_start -.->|terminal-stop branch| branch_terminal_stop{terminal-stop}");
  return `${lines.join("\n")}\n`;
}

export const renderSdlcMermaid = renderSdlcMermaidV2;
