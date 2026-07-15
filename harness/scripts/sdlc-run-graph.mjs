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

function isStrictlyIncreasing(values) {
  return values.every((value, index) => typeof value === "string"
    && (index === 0 || (typeof values[index - 1] === "string" && values[index - 1] < value)));
}

function validateLegacyV1(graph) {
  const findings = [];
  if (!isObject(graph)
    || graph.schemaVersion !== LEGACY_GRAPH_SCHEMA_VERSION
    || !Array.isArray(graph.events)
    || !Array.isArray(graph.edges)
    || !Array.isArray(graph.boundedFamilies)
    || !Array.isArray(graph.loopRecords)) {
    findings.push("historical v1 graph is not readable as pipeline.sdlc-run-graph.v1");
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
    if (!Array.isArray(cycle.eventIds) || cycle.eventIds.length < 1 || !cycle.eventIds.every(safeId)
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
    const actual = graph.events.filter((event) => event?.cycleId === cycle.cycleId).map((event) => event.eventId);
    if (actual.length !== cycle.eventIds.length || actual.some((id, index) => id !== cycle.eventIds[index])) {
      findings.push(`cycle ${cycle.cycleId} event membership does not preserve graph order`);
    }
    cycle.eventIds.forEach((eventId) => {
      if (membership.has(eventId)) findings.push(`event ${eventId} belongs to more than one cycle`);
      membership.set(eventId, cycle.cycleId);
    });
  }
  for (const event of graph.events) {
    const cycle = cyclesById.get(event?.cycleId);
    if (!cycle) {
      findings.push(`event ${event?.eventId ?? "unknown"} references a missing cycle`);
      continue;
    }
    if (cycle.packageId !== event.packageId) findings.push(`event ${event.eventId} contradicts cycle package ownership`);
    if (membership.get(event.eventId) !== event.cycleId) findings.push(`event ${event.eventId} is absent from its cycle event membership`);
  }
  for (const cycle of graph.cycles) {
    const cycleEvents = graph.events.filter((event) => event?.cycleId === cycle?.cycleId);
    if (!cycleEvents.every((event, index) => event.sequence === index)) {
      findings.push(`cycle ${cycle?.cycleId ?? "unknown"} event sequence must be strict, integer and contiguous`);
    }
    const actions = new Set(cycleEvents.map((event) => event.actionId));
    if (actions.size > 1) findings.push(`cycle ${cycle?.cycleId ?? "unknown"} cannot change action dispatch identity`);
  }

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
    if (!safeInteger(aggregate.count) || !safeInteger(aggregate.bound, 1) || aggregate.count > aggregate.bound) {
      findings.push(`loop aggregate ${aggregate.family} count/bound is invalid`);
    }
  }
  if (new Set(aggregateFamilies).size !== aggregateFamilies.length
    || LOOP_FAMILIES.some((family, index) => aggregateFamilies[index] !== family)) {
    findings.push("loopAggregates must be unique and in stable family order");
  }
  const stageCounts = new Map([
    ["critic-correction", graph.events.filter((event) => event?.stage === "correction").length],
    ["delta-regate", graph.events.filter((event) => event?.stage === "delta-regate").length],
    ["environment-failover", graph.events.filter((event) => event?.stage === "failover").length],
  ]);
  for (const [family, count] of stageCounts) {
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

function nodeId(value) {
  return `n_${value.replaceAll(/[.:-]/g, "_")}`;
}

/** Render canonical LF-terminated Mermaid bytes from v2 graph data only. */
export function renderSdlcMermaidV2(graph) {
  const checked = validateV2(graph);
  if (!checked.ok) throw new TypeError(`invalid v2 graph for projection: ${checked.findings.join("; ")}`);

  const lines = ["flowchart TD", "  graph_start([sdlc-v2-start])", "  graph_end([sdlc-v2-end])"];
  for (const cycle of graph.cycles) {
    const cycleNode = nodeId(cycle.cycleId);
    lines.push(`  ${cycleNode}["cycle:${cycle.sequence}:${cycle.cycleId}:${cycle.packageId}"]`);
    const cycleEvents = graph.events.filter((event) => event.cycleId === cycle.cycleId);
    for (const event of cycleEvents) {
      lines.push(`  ${nodeId(event.eventId)}["${event.sequence}:${event.stage}:${event.outcome}"]`);
    }
    if (cycleEvents.length > 0) {
      lines.push(`  ${cycleNode} --> ${nodeId(cycleEvents[0].eventId)}`);
      for (let index = 1; index < cycleEvents.length; index += 1) {
        lines.push(`  ${nodeId(cycleEvents[index - 1].eventId)} --> ${nodeId(cycleEvents[index].eventId)}`);
      }
    }
  }
  if (graph.cycles.length > 0) {
    lines.push(`  graph_start --> ${nodeId(graph.cycles[0].cycleId)}`);
    for (let index = 1; index < graph.cycles.length; index += 1) {
      const priorEvents = graph.events.filter((event) => event.cycleId === graph.cycles[index - 1].cycleId);
      lines.push(`  ${nodeId(priorEvents.at(-1).eventId)} --> ${nodeId(graph.cycles[index].cycleId)}`);
    }
    const finalEvents = graph.events.filter((event) => event.cycleId === graph.cycles.at(-1).cycleId);
    lines.push(`  ${nodeId(finalEvents.at(-1).eventId)} --> graph_end`);
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
