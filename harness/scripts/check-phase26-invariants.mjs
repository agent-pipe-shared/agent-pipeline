#!/usr/bin/env node
/**
 * Opt-in Phase-2.6 close checker.
 *
 * No arguments deliberately skip this product-specific gate.  `--result <path>`
 * validates the Result-owned run graph, its one deterministic Mermaid projection,
 * loop/source reconciliation, and the bounded early-smoke/scope/performance evidence.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = resolve(HERE, "..", "..", "..");
export const GRAPH_SCHEMA_VERSION = "pipeline.sdlc-run-graph.v1";
export const PROJECTION_GENERATOR_VERSION = "pipeline-sdlc-mermaid.v1";
export const INVARIANT_EVIDENCE_SCHEMA = "pipeline.phase26-invariant-evidence.v1";
export const PHASE_PACKAGE_ID = "P2.6-P5";

export const FAMILY_CONTRACT = Object.freeze([
  ["initial-full-critic", "event"],
  ["critic-correction", "back-edge"],
  ["delta-regate", "back-edge"],
  ["product-retry", "back-edge"],
  ["environment-failover", "reroute"],
  ["scope-course-stop", "gate"],
  ["package-push-fetch-back", "event"],
]);

const FAMILY_NAMES = new Set(FAMILY_CONTRACT.map(([family]) => family));
const BACK_EDGE_FAMILIES = new Set(FAMILY_CONTRACT.filter(([, kind]) => kind === "back-edge").map(([family]) => family));
const EVENT_TYPES = new Set(["start", "work", "critic", "correction", "verify", "retry", "failover", "gate", "po-decision", "push-fetch-back", "handoff", "close"]);
const OUTCOMES = new Set(["succeeded", "failed", "stopped", "deferred", "superseded"]);
const EDGE_KINDS = new Set(["event", "back-edge", "reroute", "gate"]);
const LOOP_OUTCOMES = new Set(["succeeded", "failed", "stopped", "deferred"]);
const EXIT_REASONS = new Set(["corrected", "regate-pass", "retry-pass", "retry-failed", "budget-exhausted", "po-stop", "po-defer"]);
const SOURCE_COLLECTIONS = new Set(["packageResults", "finalIntegrations", "decisionBriefs", "courseDecisionIntents", "courseDecisionReceipts", "externalEvidence"]);
const SHA256_RE = /^[a-f0-9]{64}$/;
const COMMIT_RE = /^[a-f0-9]{40}$/;
const SAFE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return isObject(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function safeId(value) {
  return typeof value === "string" && SAFE_ID_RE.test(value);
}

function safeInteger(value, minimum = 0) {
  return Number.isSafeInteger(value) && value >= minimum;
}

function digest(value) {
  return typeof value === "string" && SHA256_RE.test(value);
}

export function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("non-finite number");
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!isObject(value)) throw new TypeError("non-JSON value");
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

export function sha256Canonical(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Parse JSON without JSON.parse's duplicate-key last-write-wins behavior. */
function parseJsonNoDuplicateKeys(source) {
  let index = 0;
  const whitespace = () => { while (/[ \t\n\r]/.test(source[index] ?? "")) index += 1; };
  const parseString = () => {
    if (source[index] !== '"') throw new SyntaxError("string expected");
    const start = index++;
    while (index < source.length) {
      const char = source[index++];
      if (char === '"') return JSON.parse(source.slice(start, index));
      if (char === "\\") {
        const escaped = source[index++];
        if (escaped === "u") {
          if (!/^[a-fA-F0-9]{4}$/.test(source.slice(index, index + 4))) throw new SyntaxError("invalid unicode escape");
          index += 4;
        } else if (!'"\\/bfnrt'.includes(escaped ?? "")) throw new SyntaxError("invalid escape");
      } else if (char.charCodeAt(0) < 0x20) throw new SyntaxError("control character");
    }
    throw new SyntaxError("unterminated string");
  };
  const parseValue = () => {
    whitespace();
    if (source[index] === '"') return parseString();
    if (source[index] === "{") {
      index += 1;
      const object = {};
      const seen = new Set();
      whitespace();
      if (source[index] === "}") { index += 1; return object; }
      while (true) {
        whitespace();
        const key = parseString();
        if (seen.has(key)) throw new SyntaxError(`duplicate key ${key}`);
        seen.add(key);
        whitespace();
        if (source[index++] !== ":") throw new SyntaxError("colon expected");
        object[key] = parseValue();
        whitespace();
        const separator = source[index++];
        if (separator === "}") return object;
        if (separator !== ",") throw new SyntaxError("comma expected");
      }
    }
    if (source[index] === "[") {
      index += 1;
      const array = [];
      whitespace();
      if (source[index] === "]") { index += 1; return array; }
      while (true) {
        array.push(parseValue());
        whitespace();
        const separator = source[index++];
        if (separator === "]") return array;
        if (separator !== ",") throw new SyntaxError("comma expected");
      }
    }
    const tail = source.slice(index);
    const literal = /^(true|false|null)/.exec(tail);
    if (literal) {
      index += literal[0].length;
      return literal[0] === "true" ? true : literal[0] === "false" ? false : null;
    }
    const number = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(tail);
    if (!number) throw new SyntaxError("value expected");
    index += number[0].length;
    const value = Number(number[0]);
    if (!Number.isFinite(value)) throw new SyntaxError("non-finite number");
    return value;
  };
  const value = parseValue();
  whitespace();
  if (index !== source.length) throw new SyntaxError("trailing JSON content");
  return value;
}

function parsePipelineResultBlock(markdown) {
  if (typeof markdown !== "string" || markdown.startsWith("\uFEFF") || markdown.includes("\r")) {
    return { ok: false, findings: ["Result must be UTF-8/LF text without BOM or CR"] };
  }
  const resultBlocks = [...markdown.matchAll(/^```pipeline-result\n([\s\S]*?)^```\s*$/gm)];
  const findings = [];
  if (resultBlocks.length !== 1) findings.push(`expected exactly one pipeline-result block, found ${resultBlocks.length}`);
  let result = null;
  if (resultBlocks.length === 1) {
    try {
      result = parseJsonNoDuplicateKeys(resultBlocks[0][1]);
      if (!isObject(result)) findings.push("pipeline-result block must contain one JSON object");
    } catch (error) {
      findings.push(`pipeline-result JSON is invalid (${error.message})`);
    }
  }
  return { ok: findings.length === 0, findings, result };
}

export function parsePhase26Result(markdown) {
  const parsed = parsePipelineResultBlock(markdown);
  const findings = [...parsed.findings];
  const mermaidBlocks = typeof markdown === "string"
    ? [...markdown.matchAll(/^```mermaid\n([\s\S]*?)^```\s*$/gm)]
    : [];
  if (mermaidBlocks.length !== 1) findings.push(`expected exactly one Mermaid block, found ${mermaidBlocks.length}`);
  return { ok: findings.length === 0, findings, result: parsed.result, mermaid: mermaidBlocks.length === 1 ? mermaidBlocks[0][1] : null };
}

function nodeId(eventId) {
  return `n_${eventId.replaceAll(/[.:-]/g, "_")}`;
}

/** Deterministic, label-closed PO projection. No prose or path enters this renderer. */
export function renderSdlcMermaid(graph) {
  const lines = ["flowchart TD"];
  for (const event of graph.events) {
    lines.push(`  ${nodeId(event.eventId)}["${event.sequence}:${event.eventType}:${event.outcome}"]`);
  }
  for (const edge of graph.edges) {
    const family = edge.boundedFamily ?? "unbounded";
    lines.push(`  ${nodeId(edge.fromEventId)} -->|${edge.kind}:${family}| ${nodeId(edge.toEventId)}`);
  }
  graph.boundedFamilies.forEach((entry, index) => {
    lines.push(`  family_${index}["family:${entry.family}:${entry.count}:${entry.disposition}"]`);
  });
  for (const loop of graph.loopRecords) {
    const brief = loop.decisionBriefId === null ? "none" : loop.decisionBriefId;
    lines.push(`  loop_${loop.stableId.replaceAll(/[.:-]/g, "_")}["loop:${loop.family}:${loop.observedCount}/${loop.configuredLimit}:${loop.similarityGroupId}:${loop.outcome}:${loop.exitReason}:brief=${brief}"]`);
    const edge = graph.edges.find((candidate) => candidate.loopStableId === loop.stableId);
    if (edge) lines.push(`  ${nodeId(edge.fromEventId)} -.-> loop_${loop.stableId.replaceAll(/[.:-]/g, "_")}`);
  }
  return `${lines.join("\n")}\n`;
}

function validateSourceRef(ref) {
  return exactKeys(ref, ["collection", "id", "sha256"])
    && SOURCE_COLLECTIONS.has(ref.collection) && safeId(ref.id) && digest(ref.sha256);
}

function validateEvent(event) {
  return exactKeys(event, ["eventId", "sequence", "eventType", "outcome", "packageId", "actionId", "originChainId", "boundedFamily", "decisionBriefId", "sourceRefs"])
    && safeId(event.eventId) && safeInteger(event.sequence) && EVENT_TYPES.has(event.eventType) && OUTCOMES.has(event.outcome)
    && [event.packageId, event.actionId, event.originChainId].every(safeId)
    && (event.boundedFamily === null || FAMILY_NAMES.has(event.boundedFamily))
    && (event.decisionBriefId === null || safeId(event.decisionBriefId))
    && Array.isArray(event.sourceRefs) && event.sourceRefs.length >= 1 && event.sourceRefs.length <= 32
    && event.sourceRefs.every(validateSourceRef)
    && new Set(event.sourceRefs.map((ref) => `${ref.collection}:${ref.id}`)).size === event.sourceRefs.length;
}

function validateEdge(edge) {
  return exactKeys(edge, ["edgeId", "fromEventId", "toEventId", "kind", "boundedFamily", "loopStableId", "sourceRefs"])
    && [edge.edgeId, edge.fromEventId, edge.toEventId].every(safeId) && EDGE_KINDS.has(edge.kind)
    && (edge.boundedFamily === null || FAMILY_NAMES.has(edge.boundedFamily))
    && (edge.loopStableId === null || safeId(edge.loopStableId))
    && Array.isArray(edge.sourceRefs) && edge.sourceRefs.length >= 1 && edge.sourceRefs.length <= 32
    && edge.sourceRefs.every(validateSourceRef)
    && new Set(edge.sourceRefs.map((ref) => `${ref.collection}:${ref.id}`)).size === edge.sourceRefs.length;
}

function validateEvidence(entry) {
  return exactKeys(entry, ["id", "sha256"]) && safeId(entry.id) && digest(entry.sha256);
}

function validateLoop(loop) {
  return exactKeys(loop, ["stableId", "family", "packageId", "actionId", "originChainId", "triggerEvidence", "attemptResultDigests", "normalizedFailureSignature", "similarityGroupId", "observedCount", "configuredLimit", "outcome", "exitReason", "decisionBriefId"])
    && [loop.stableId, loop.packageId, loop.actionId, loop.originChainId, loop.similarityGroupId].every(safeId)
    && BACK_EDGE_FAMILIES.has(loop.family) && digest(loop.normalizedFailureSignature)
    && Array.isArray(loop.triggerEvidence) && loop.triggerEvidence.length >= 1 && loop.triggerEvidence.length <= 32 && loop.triggerEvidence.every(validateEvidence)
    && Array.isArray(loop.attemptResultDigests) && loop.attemptResultDigests.length >= 1 && loop.attemptResultDigests.length <= 16
    && loop.attemptResultDigests.every((entry) => exactKeys(entry, ["attemptId", "resultSha256"]) && safeId(entry.attemptId) && digest(entry.resultSha256))
    && safeInteger(loop.observedCount, 1) && safeInteger(loop.configuredLimit, 1)
    && loop.observedCount === loop.attemptResultDigests.length
    && LOOP_OUTCOMES.has(loop.outcome) && EXIT_REASONS.has(loop.exitReason)
    && (loop.decisionBriefId === null || safeId(loop.decisionBriefId));
}

function resultCollectionId(collection, value) {
  if (!isObject(value)) return null;
  if (collection === "packageResults") return value.id;
  if (collection === "finalIntegrations") return value.integrationId;
  if (collection === "decisionBriefs") return value.briefId;
  if (collection === "courseDecisionIntents" || collection === "courseDecisionReceipts") return value.idempotencyKey;
  if (collection === "externalEvidence") return value.id;
  return null;
}

function evidenceInventory(result, findings) {
  if (!Array.isArray(result.externalEvidence)) {
    findings.push("pipeline-result externalEvidence must be an array");
    return new Map();
  }
  const inventory = new Map();
  for (const entry of result.externalEvidence) {
    if (!validateEvidence(entry) || inventory.has(entry.id)) {
      findings.push("externalEvidence contains a missing, malformed or duplicate stable ID");
      continue;
    }
    inventory.set(entry.id, entry.sha256);
  }
  return inventory;
}

function inventoryContains(inventory, entry) {
  return validateEvidence(entry) && inventory.get(entry.id) === entry.sha256;
}

function validateSourceReconciliation(result, graph, findings) {
  const refs = new Map();
  const actual = new Map();
  for (const event of graph.events) {
    for (const ref of event.sourceRefs) {
      const key = `${ref.collection}:${ref.id}`;
      if (refs.has(key) && refs.get(key) !== ref.sha256) findings.push(`source ref ${key} has conflicting digests`);
      refs.set(key, ref.sha256);
    }
  }
  for (const edge of graph.edges) {
    for (const ref of edge.sourceRefs) {
      const key = `${ref.collection}:${ref.id}`;
      if (refs.has(key) && refs.get(key) !== ref.sha256) findings.push(`source ref ${key} has conflicting digests`);
      refs.set(key, ref.sha256);
    }
  }
  for (const collection of ["packageResults", "finalIntegrations", "decisionBriefs", "courseDecisionIntents", "courseDecisionReceipts", "externalEvidence"]) {
    const values = result[collection];
    if (!Array.isArray(values)) {
      findings.push(`pipeline-result ${collection} must be an array`);
      continue;
    }
    const seen = new Set();
    for (const value of values) {
      const id = resultCollectionId(collection, value);
      if (!safeId(id) || seen.has(id)) {
        findings.push(`${collection} contains a missing or duplicate stable ID`);
        continue;
      }
      seen.add(id);
      const key = `${collection}:${id}`;
      const expected = collection === "externalEvidence" ? value.sha256 : sha256Canonical(value);
      actual.set(key, expected);
      if (collection !== "externalEvidence" && refs.get(key) !== expected) findings.push(`${key} is missing from graph sources or has a stale digest`);
    }
  }
  for (const [key, referencedDigest] of refs) {
    if (!actual.has(key) || actual.get(key) !== referencedDigest) {
      findings.push(`${key} is a fabricated or stale Result-owned source reference`);
    }
  }
  const sourceSet = {
    events: graph.events.map(({ eventId, sequence, sourceRefs }) => ({ eventId, sequence, sourceRefs })),
    edges: graph.edges.map(({ edgeId, sourceRefs }) => ({ edgeId, sourceRefs })),
  };
  if (graph.sourceEventSetSha256 !== sha256Canonical(sourceSet)) findings.push("sourceEventSetSha256 does not bind the ordered event source set");
}

function resultAtCommit(root, resultPath, commit) {
  if (!COMMIT_RE.test(commit ?? "")) return null;
  const historic = spawnSync("git", ["-C", root, "show", `${commit}:${resultPath}`], { encoding: "utf8", timeout: 5000 });
  if (historic.status !== 0) return null;
  const parsed = parsePipelineResultBlock(historic.stdout);
  return parsed.ok && isObject(parsed.result) ? parsed.result : null;
}

function p5SchemaIntroducedAt(root, resultPath, currentResult) {
  const head = spawnSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8", timeout: 5000 });
  const headCommit = head.status === 0 ? head.stdout.trim() : null;
  if (!COMMIT_RE.test(headCommit ?? "")) return null;
  const headResult = resultAtCommit(root, resultPath, headCommit);
  const currentIsP5 = currentResult?.phase26InvariantEvidence?.schema === INVARIANT_EVIDENCE_SCHEMA;
  const headIsP5 = headResult?.phase26InvariantEvidence?.schema === INVARIANT_EVIDENCE_SCHEMA;
  if (!currentIsP5) return null;
  // Before the first P5 Result commit, HEAD is the authenticated pre-P5 baseline.
  // This is the only case where a legacy exemption may cite HEAD exactly.
  if (!headIsP5) return { commit: headCommit, worktreeIntroduction: true };
  const history = spawnSync("git", ["-C", root, "log", "--format=%H", "--reverse", "HEAD", "--", resultPath], { encoding: "utf8", timeout: 5000 });
  if (history.status !== 0) return null;
  for (const commit of history.stdout.split("\n").filter(Boolean)) {
    if (resultAtCommit(root, resultPath, commit)?.phase26InvariantEvidence?.schema === INVARIANT_EVIDENCE_SCHEMA) {
      return { commit, worktreeIntroduction: false };
    }
  }
  return null;
}

function historicPackage(root, resultPath, commit, packageId, introduction) {
  if (!COMMIT_RE.test(commit ?? "") || !introduction) return null;
  const ancestor = spawnSync("git", ["-C", root, "merge-base", "--is-ancestor", commit, introduction.commit], { encoding: "utf8", timeout: 5000 });
  if (ancestor.status !== 0 || (!introduction.worktreeIntroduction && commit === introduction.commit)) return null;
  const historic = resultAtCommit(root, resultPath, commit);
  if (!historic || historic?.phase26InvariantEvidence?.schema === INVARIANT_EVIDENCE_SCHEMA || !Array.isArray(historic.packageResults)) return null;
  return historic.packageResults.find((entry) => entry?.id === packageId) ?? null;
}

function legacyLedgerExemptions(result, evidence, findings, provenance) {
  const entries = evidence?.legacyLedgerExemptions;
  if (!Array.isArray(entries)) {
    findings.push("phase26InvariantEvidence legacyLedgerExemptions must be an array");
    return new Map();
  }
  const available = new Map((result.packageResults ?? []).map((entry) => [entry?.id, entry]));
  const exemptions = new Map();
  const introduction = p5SchemaIntroducedAt(provenance.root, provenance.resultPath, result);
  if (!introduction) findings.push("legacy ledger exemptions require an authenticated P5 schema-introduction boundary");
  for (const entry of entries) {
    if (!exactKeys(entry, ["packageId", "packageSha256", "historicResultCommit", "reason"])
      || !safeId(entry.packageId) || !digest(entry.packageSha256)
      || !COMMIT_RE.test(entry.historicResultCommit ?? "")
      || entry.reason !== "pre-p5-result-schema" || exemptions.has(entry.packageId)) {
      findings.push("legacyLedgerExemptions contains an invalid or duplicate bound entry");
      continue;
    }
    const packageResult = available.get(entry.packageId);
    const historic = historicPackage(provenance.root, provenance.resultPath, entry.historicResultCommit, entry.packageId, introduction);
    if (!packageResult || isObject(packageResult.loopEconomy) || sha256Canonical(packageResult) !== entry.packageSha256
      || !historic || isObject(historic.loopEconomy) || sha256Canonical(historic) !== entry.packageSha256) {
      findings.push(`legacy ledger exemption ${entry.packageId} is stale, fabricated or masks a current ledger`);
      continue;
    }
    exemptions.set(entry.packageId, entry.packageSha256);
  }
  return exemptions;
}

function loopEconomySums(result, evidence, findings, provenance) {
  const mapping = {
    criticCorrection: "critic-correction",
    deltaRegate: "delta-regate",
    productRetry: "product-retry",
    environmentFailover: "environment-failover",
    courseStop: "scope-course-stop",
    packagePushFetchBack: "package-push-fetch-back",
  };
  const sums = Object.fromEntries(Object.values(mapping).map((family) => [family, 0]));
  if (!Array.isArray(result.packageResults)) return sums;
  const exemptions = legacyLedgerExemptions(result, evidence, findings, provenance);
  for (const packageResult of result.packageResults) {
    if (!isObject(packageResult?.loopEconomy)) {
      if (exemptions.get(packageResult?.id) !== sha256Canonical(packageResult)) {
        findings.push(`package ${packageResult?.id ?? "unknown"} lacks a bound loopEconomy ledger`);
      }
      continue;
    }
    if (exemptions.has(packageResult.id)) findings.push(`package ${packageResult.id} has both a ledger and a legacy exemption`);
    for (const [field, family] of Object.entries(mapping)) {
      const count = packageResult.loopEconomy[field];
      if (!safeInteger(count)) findings.push(`package ${packageResult.id} loopEconomy.${field} must be a non-negative integer`);
      else sums[family] += count;
    }
  }
  return sums;
}

function deliveryEnvelopes(result, findings) {
  if (result.packageDeliveryEnvelopes === undefined) return new Map();
  if (!Array.isArray(result.packageDeliveryEnvelopes)) {
    findings.push("packageDeliveryEnvelopes must be an array when supplied");
    return new Map();
  }
  const packages = new Map((result.packageResults ?? []).map((entry) => [entry?.id, entry]));
  const envelopes = new Map();
  for (const envelope of result.packageDeliveryEnvelopes) {
    if (!exactKeys(envelope, ["packageId", "packageSha256", "status", "sharedCommit", "fullVerify", "publicGate"])
      || !safeId(envelope.packageId) || !digest(envelope.packageSha256) || typeof envelope.status !== "string"
      || !COMMIT_RE.test(envelope.sharedCommit ?? "") || !isObject(envelope.fullVerify) || !isObject(envelope.publicGate)) {
      findings.push("packageDeliveryEnvelopes contains an invalid envelope");
      continue;
    }
    const packageResult = packages.get(envelope.packageId);
    if (!packageResult || envelopes.has(envelope.packageId) || sha256Canonical(packageResult) !== envelope.packageSha256) {
      findings.push(`package delivery envelope ${envelope.packageId} is duplicate, stale or unbound`);
      continue;
    }
    envelopes.set(envelope.packageId, envelope);
  }
  return envelopes;
}

function validateGraph(result, graph, findings, inventory, provenance) {
  const keys = ["schemaVersion", "featureId", "graphCutoffEventId", "sourceEventSetSha256", "completionClaim", "events", "edges", "boundedFamilies", "loopRecords"];
  if (!exactKeys(graph, keys) || graph.schemaVersion !== GRAPH_SCHEMA_VERSION || !safeId(graph.featureId)
    || !safeId(graph.graphCutoffEventId) || !digest(graph.sourceEventSetSha256)
    || !["candidate-handoff", "phase-close"].includes(graph.completionClaim)
    || !Array.isArray(graph.events) || !Array.isArray(graph.edges)
    || !Array.isArray(graph.boundedFamilies) || !Array.isArray(graph.loopRecords)) {
    findings.push("sdlcRunGraph does not match the closed root contract");
    return;
  }
  if (graph.events.length < 1 || graph.events.length > 512 || !graph.events.every(validateEvent)) findings.push("sdlcRunGraph.events contains an invalid event");
  if (graph.edges.length > 1024 || !graph.edges.every(validateEdge)) findings.push("sdlcRunGraph.edges contains an invalid edge");
  if (graph.loopRecords.length > 128 || !graph.loopRecords.every(validateLoop)) findings.push("sdlcRunGraph.loopRecords contains an invalid loop");
  const eventIds = new Set(graph.events.map(({ eventId }) => eventId));
  if (eventIds.size !== graph.events.length) findings.push("event IDs must be unique");
  if (!graph.events.every((event, index) => event.sequence === index)) findings.push("events must be ordered with contiguous sequence numbers");
  if (graph.events.at(-1)?.eventId !== graph.graphCutoffEventId) findings.push("graph cutoff must be the last traversed event");
  const edgeIds = graph.edges.map(({ edgeId }) => edgeId);
  if (new Set(edgeIds).size !== edgeIds.length || edgeIds.some((id, index) => index > 0 && edgeIds[index - 1] >= id)) findings.push("edges must have unique lexically ordered IDs");
  const sequence = new Map(graph.events.map((event) => [event.eventId, event.sequence]));
  for (const event of graph.events) {
    if (event.boundedFamily === "initial-full-critic" && event.eventType !== "critic") findings.push(`initial Full Critic event ${event.eventId} has the wrong event type`);
    if (event.boundedFamily === "package-push-fetch-back" && (event.eventType !== "push-fetch-back" || event.outcome !== "succeeded")) findings.push(`package push/fetch-back event ${event.eventId} is not a successful typed event`);
    if (event.boundedFamily === "scope-course-stop" && (event.eventType !== "gate" || !["stopped", "deferred"].includes(event.outcome))) findings.push(`scope/course stop event ${event.eventId} is not a terminal gate`);
    if (event.boundedFamily !== null && !new Set(["initial-full-critic", "scope-course-stop", "package-push-fetch-back"]).has(event.boundedFamily)) {
      findings.push(`bounded family ${event.boundedFamily} cannot be represented as an event record`);
    }
  }
  for (const edge of graph.edges) {
    if (!eventIds.has(edge.fromEventId) || !eventIds.has(edge.toEventId)) findings.push(`edge ${edge.edgeId} references an unknown event`);
    if (edge.kind === "back-edge") {
      if (!BACK_EDGE_FAMILIES.has(edge.boundedFamily) || edge.loopStableId === null) findings.push(`back-edge ${edge.edgeId} lacks its bounded loop binding`);
      if ((sequence.get(edge.fromEventId) ?? -1) <= (sequence.get(edge.toEventId) ?? -1)) findings.push(`back-edge ${edge.edgeId} must point to an earlier event`);
    } else if (edge.loopStableId !== null) findings.push(`non-back-edge ${edge.edgeId} cannot carry loopStableId`);
    if (edge.kind !== "back-edge" && (sequence.get(edge.fromEventId) ?? -1) >= (sequence.get(edge.toEventId) ?? -1)) {
      findings.push(`non-back-edge ${edge.edgeId} must point strictly forward or be declared as a bounded back-edge`);
    }
    if (edge.kind === "reroute" && edge.boundedFamily !== "environment-failover") findings.push(`reroute ${edge.edgeId} must use environment-failover`);
    if (edge.boundedFamily !== null) {
      const expectedKind = new Map(FAMILY_CONTRACT).get(edge.boundedFamily);
      if (!new Set(["back-edge", "reroute"]).has(expectedKind) || edge.kind !== expectedKind) findings.push(`bounded edge ${edge.edgeId} uses the wrong family kind`);
    }
    if (edge.boundedFamily !== null && !edge.sourceRefs.some((ref) => ref.collection !== "externalEvidence")) {
      findings.push(`bounded edge ${edge.edgeId} lacks Result-owned state/receipt/package evidence`);
    }
  }
  for (const event of graph.events.slice(1)) {
    if (!graph.edges.some((edge) => edge.toEventId === event.eventId)) findings.push(`event ${event.eventId} is not connected to the traversed graph`);
  }
  const reachable = new Set([graph.events[0]?.eventId]);
  const pending = [graph.events[0]?.eventId];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const edge of graph.edges.filter((candidate) => candidate.fromEventId === current)) {
      if (!reachable.has(edge.toEventId)) {
        reachable.add(edge.toEventId);
        pending.push(edge.toEventId);
      }
    }
  }
  for (const event of graph.events) {
    if (!reachable.has(event.eventId)) findings.push(`event ${event.eventId} is not reachable from the graph start`);
  }
  for (const event of graph.events.filter((candidate) => candidate.eventType === "gate" || ["stopped", "deferred"].includes(candidate.outcome))) {
    if (event.decisionBriefId === null) findings.push(`gate/stop event ${event.eventId} lacks decisionBriefId`);
    if (event.decisionBriefId !== null && !event.sourceRefs.some((ref) => ref.collection === "decisionBriefs" && ref.id === event.decisionBriefId)) {
      findings.push(`gate/stop event ${event.eventId} lacks its Result-owned decision-brief source`);
    }
    const outgoing = graph.edges.filter((edge) => edge.fromEventId === event.eventId && edge.kind !== "back-edge");
    for (const edge of outgoing) {
      const next = graph.events.find((candidate) => candidate.eventId === edge.toEventId);
      if (next?.eventType !== "po-decision" || next.decisionBriefId !== event.decisionBriefId) {
        findings.push(`stop event ${event.eventId} resumes without its bound PO-decision event`);
      }
    }
  }
  for (const event of graph.events.filter((candidate) => candidate.boundedFamily !== null)) {
    if (!event.sourceRefs.some((ref) => ref.collection !== "externalEvidence")) {
      findings.push(`bounded event ${event.eventId} lacks Result-owned state/receipt/package evidence`);
    }
  }

  if (graph.boundedFamilies.length !== FAMILY_CONTRACT.length) findings.push("boundedFamilies must inventory exactly seven families");
  const economy = loopEconomySums(result, result.phase26InvariantEvidence, findings, provenance);
  for (let index = 0; index < FAMILY_CONTRACT.length; index += 1) {
    const [family, kind] = FAMILY_CONTRACT[index];
    const inventory = graph.boundedFamilies[index];
    if (!exactKeys(inventory, ["family", "kind", "count", "disposition"])
      || inventory.family !== family || inventory.kind !== kind || !safeInteger(inventory.count)
      || inventory.disposition !== (inventory.count === 0 ? "not-triggered" : "executed")) {
      findings.push(`bounded family ${family} is missing, reordered or inconsistent`);
      continue;
    }
    const observed = kind === "back-edge" || kind === "reroute"
      ? graph.edges.filter((edge) => edge.kind === kind && edge.boundedFamily === family).length
      : graph.events.filter((event) => event.boundedFamily === family).length;
    if (inventory.count !== observed) findings.push(`bounded family ${family} count does not match typed graph records`);
    if (family !== "initial-full-critic" && inventory.count !== economy[family]) findings.push(`bounded family ${family} count does not reconcile with package loopEconomy`);
  }

  const loopIds = graph.loopRecords.map(({ stableId }) => stableId);
  if (new Set(loopIds).size !== loopIds.length || loopIds.some((id, index) => index > 0 && loopIds[index - 1] >= id)) findings.push("loop records must have unique lexically ordered stable IDs");
  const semanticLoopIds = new Set();
  const signatureGroups = new Map();
  const backEdges = graph.edges.filter(({ kind }) => kind === "back-edge");
  if (backEdges.length !== graph.loopRecords.length) findings.push("executed back-edges and loop records are not bijective");
  for (const loop of graph.loopRecords) {
    const semanticId = canonicalJson({
      family: loop.family, packageId: loop.packageId, actionId: loop.actionId,
      originChainId: loop.originChainId, normalizedFailureSignature: loop.normalizedFailureSignature,
    });
    if (semanticLoopIds.has(semanticId)) findings.push(`loop ${loop.stableId} renames an existing semantic loop identity`);
    semanticLoopIds.add(semanticId);
    const priorGroup = signatureGroups.get(loop.normalizedFailureSignature);
    if (priorGroup !== undefined && priorGroup !== loop.similarityGroupId) findings.push(`loop ${loop.stableId} splits an identical failure signature across similarity groups`);
    signatureGroups.set(loop.normalizedFailureSignature, loop.similarityGroupId);
    const edges = backEdges.filter((edge) => edge.loopStableId === loop.stableId && edge.boundedFamily === loop.family);
    if (edges.length !== 1) findings.push(`loop ${loop.stableId} does not bind exactly one matching back-edge`);
    if (edges.length === 1 && loop.triggerEvidence.some((trigger) => !edges[0].sourceRefs.some((ref) => ref.id === trigger.id && ref.sha256 === trigger.sha256))) {
      findings.push(`loop ${loop.stableId} trigger evidence is not bound by its back-edge`);
    }
    if (loop.triggerEvidence.some((trigger) => !inventoryContains(inventory, trigger))) {
      findings.push(`loop ${loop.stableId} trigger evidence is absent from externalEvidence`);
    }
    const expectedExitFamily = new Map([
      ["corrected", "critic-correction"], ["regate-pass", "delta-regate"],
      ["retry-pass", "product-retry"], ["retry-failed", "product-retry"],
    ]).get(loop.exitReason);
    if (expectedExitFamily !== undefined && loop.family !== expectedExitFamily) findings.push(`loop ${loop.stableId} exit reason is invalid for its family`);
    if (loop.exitReason === "po-stop" && loop.outcome !== "stopped") findings.push(`loop ${loop.stableId} po-stop must remain stopped`);
    if (loop.exitReason === "po-defer" && loop.outcome !== "deferred") findings.push(`loop ${loop.stableId} po-defer must remain deferred`);
    if (loop.exitReason === "budget-exhausted" && !["stopped", "deferred"].includes(loop.outcome)) findings.push(`loop ${loop.stableId} exhausted budget lacks a stop/defer outcome`);
    const requiresBrief = ["stopped", "deferred"].includes(loop.outcome) || ["retry-failed", "budget-exhausted", "po-stop", "po-defer"].includes(loop.exitReason);
    if (requiresBrief !== (loop.decisionBriefId !== null)) findings.push(`loop ${loop.stableId} has an inconsistent decision-brief disposition`);
    if (loop.outcome === "succeeded" && loop.observedCount > loop.configuredLimit) findings.push(`loop ${loop.stableId} exceeds its configured limit without a stop`);
    if (loop.decisionBriefId !== null && !result.decisionBriefs.some((brief) => brief?.briefId === loop.decisionBriefId)) findings.push(`loop ${loop.stableId} references a missing decision brief`);
  }
  validateSourceReconciliation(result, graph, findings);

  if (graph.completionClaim === "phase-close") {
    const envelopes = deliveryEnvelopes(result, findings);
    const cutoff = graph.events.at(-1);
    if (cutoff?.eventType !== "close" || cutoff.outcome !== "succeeded") {
      findings.push("phase-close requires the cutoff to be one successful terminal close event");
    }
    if (graph.edges.some((edge) => edge.fromEventId === cutoff?.eventId)) {
      findings.push("phase-close terminal close event must have no outgoing edges");
    }
    if (!["attested", "po-approved-phase3-deferral"].includes(result.phase26InvariantEvidence?.executionRouting?.status)) {
      findings.push("phase-close requires an attested dispatch or an explicit PO-approved Phase-3 routing deferral");
    }
    for (const packageResult of result.packageResults) {
      const delivery = envelopes.get(packageResult?.id) ?? packageResult;
      const gate = delivery?.publicGate;
      const expectedCommit = delivery?.sharedCommit ?? delivery?.sharedCommits?.at(-1);
      const verifyCandidates = [delivery?.fullVerify, ...Object.values(delivery?.fullVerify ?? {}).filter(isObject)];
      const exactVerify = COMMIT_RE.test(expectedCommit ?? "") && verifyCandidates.some((candidate) => candidate?.exitCode === 0
        && candidate.boundCommit === expectedCommit);
      const delivered = /(?:^|;\s*)pushed-and-fetchback-verified(?:;|$)/.test(String(delivery?.status ?? ""));
      if (!delivered || !COMMIT_RE.test(gate?.pushedOid ?? "") || gate.pushedOid !== expectedCommit || gate.fetchBackOid !== expectedCommit
        || gate.privacyFindings !== 0 || !exactVerify) {
        findings.push(`phase-close package ${packageResult?.id ?? "unknown"} lacks green Verify/push/fetch-back evidence`);
      }
    }
  }
}

function nearestRankP95(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.95) - 1];
}

function validateMeasurement(name, value, exactLimit, findings) {
  if (!exactKeys(value, ["sampleCount", "samplesMs", "p95Ms", "limitMs"])
    || !safeInteger(value.sampleCount, 5) || value.sampleCount > 50
    || !Array.isArray(value.samplesMs) || value.samplesMs.length !== value.sampleCount
    || !value.samplesMs.every((sample) => safeInteger(sample)) || value.limitMs !== exactLimit) {
    findings.push(`${name} performance measurement is malformed or uses the wrong limit`);
    return;
  }
  const p95 = nearestRankP95(value.samplesMs);
  if (value.p95Ms !== p95) findings.push(`${name} declared p95 does not match its samples`);
  if (p95 > exactLimit) findings.push(`${name} p95 ${p95}ms exceeds ${exactLimit}ms`);
}

function validateInvariantEvidence(result, evidence, findings, inventory) {
  if (!exactKeys(evidence, ["schema", "packageId", "earlySmoke", "scope", "performance", "executionRouting", "legacyLedgerExemptions"])
    || evidence.schema !== INVARIANT_EVIDENCE_SCHEMA || evidence.packageId !== PHASE_PACKAGE_ID) {
    findings.push(`phase26InvariantEvidence must use ${INVARIANT_EVIDENCE_SCHEMA} and package ${PHASE_PACKAGE_ID}`);
    return;
  }
  const smoke = evidence.earlySmoke;
  if (!exactKeys(smoke, ["status", "namedCapabilityId", "elapsedFromImplementationStartMs", "cumulativeLiveMs", "plannedPathCount", "changedPathCountBeforeSmoke", "evidenceId", "evidenceSha256"])
    || smoke.status !== "pass" || !safeId(smoke.namedCapabilityId) || !digest(smoke.evidenceSha256)
    || !safeInteger(smoke.elapsedFromImplementationStartMs) || smoke.elapsedFromImplementationStartMs > 3_600_000
    || !safeInteger(smoke.cumulativeLiveMs) || smoke.cumulativeLiveMs > 900_000
    || !safeInteger(smoke.plannedPathCount, 1) || !safeInteger(smoke.changedPathCountBeforeSmoke)
    || smoke.changedPathCountBeforeSmoke * 5 >= smoke.plannedPathCount
    || !inventoryContains(inventory, { id: smoke.evidenceId, sha256: smoke.evidenceSha256 })) {
    findings.push("early smoke must be named/evidence-bound, within 60/15 minutes, and before 20 percent of planned paths");
  }
  const scope = evidence.scope;
  if (!exactKeys(scope, ["plannedPathCount", "actualPathCount", "plannedAcceptanceCriteriaCount", "actualAcceptanceCriteriaCount", "newTrustBoundaries", "deltaDisposition", "decisionBriefId"])
    || !safeInteger(scope.plannedPathCount, 1) || !safeInteger(scope.actualPathCount)
    || !safeInteger(scope.plannedAcceptanceCriteriaCount, 1) || !safeInteger(scope.actualAcceptanceCriteriaCount)
    || !Array.isArray(scope.newTrustBoundaries) || !scope.newTrustBoundaries.every(safeId)
    || new Set(scope.newTrustBoundaries).size !== scope.newTrustBoundaries.length
    || !["not-required", "approved"].includes(scope.deltaDisposition)
    || (scope.decisionBriefId !== null && !safeId(scope.decisionBriefId))) {
    findings.push("scope evidence does not match the closed count/delta contract");
  } else {
    const grew = scope.actualPathCount * 10 > scope.plannedPathCount * 11
      || scope.actualAcceptanceCriteriaCount * 10 > scope.plannedAcceptanceCriteriaCount * 11
      || scope.newTrustBoundaries.length > 0;
    if (smoke?.plannedPathCount !== scope.plannedPathCount) findings.push("early-smoke and scope planned path counts disagree");
    if (grew && (scope.deltaDisposition !== "approved" || scope.decisionBriefId === null)) findings.push("scope/trust delta requires an approved bound decision brief");
    if (!grew && (scope.deltaDisposition !== "not-required" || scope.decisionBriefId !== null)) findings.push("no-delta scope evidence must not fabricate an approval");
    if (scope.decisionBriefId !== null) {
      const brief = result.decisionBriefs.find((candidate) => candidate?.briefId === scope.decisionBriefId);
      if (!brief) findings.push("scope delta decision brief is absent from Result");
      else {
        const briefSha256 = sha256Canonical(brief);
        if (!result.courseDecisionReceipts.some((receipt) => receipt?.briefSha256 === briefSha256 && receipt?.casOutcome === "applied")) {
          findings.push("scope delta lacks an applied Result-owned PO decision receipt");
        }
      }
    }
  }
  const performance = evidence.performance;
  if (!exactKeys(performance, ["method", "targetedVerify", "fullVerify", "ledgerWriter"])
    || performance.method !== "repeated-monotonic-wall-clock-ms.v1") {
    findings.push("performance evidence must disclose the repeatable monotonic-wall-clock method");
    return;
  }
  validateMeasurement("Targeted Verify", performance.targetedVerify, 2_000, findings);
  validateMeasurement("Full Verify", performance.fullVerify, 30_000, findings);
  validateMeasurement("Ledger writer", performance.ledgerWriter, 50, findings);
  const route = evidence.executionRouting;
  if (!exactKeys(route, ["status", "requestedDuty", "requiredSelector", "requiredEffort", "routeReceiptEvidenceId", "routeReceiptEvidenceSha256", "phase3Disposition"])
    || route.requestedDuty !== "codex_implementation" || route.requiredSelector !== "terra" || route.requiredEffort !== "xhigh"
    || !["attested", "unattested-nonconformance", "po-approved-phase3-deferral"].includes(route.status)) {
    findings.push("execution routing evidence is malformed or changes the approved Terra/xhigh request");
  } else if (route.status === "attested") {
    if (route.phase3Disposition !== "none" || !inventoryContains(inventory, { id: route.routeReceiptEvidenceId, sha256: route.routeReceiptEvidenceSha256 })) {
      findings.push("attested execution routing lacks a bound external route receipt");
    }
  } else if (route.phase3Disposition !== "mandatory-dispatch-attestation" || route.routeReceiptEvidenceId !== null || route.routeReceiptEvidenceSha256 !== null) {
    findings.push("unattested or PO-deferred execution routing must remain an explicit Phase-3 obligation without a fabricated receipt");
  }
}

function safeResultPath(root, resultPath) {
  if (typeof resultPath !== "string" || resultPath.length < 1 || isAbsolute(resultPath) || resultPath.includes("\\") || resultPath.includes("\0")) return null;
  const candidate = resolve(root, resultPath);
  const rel = relative(realpathSync(root), candidate);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  const stat = lstatSync(candidate);
  if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(candidate) !== candidate) return null;
  return candidate;
}

export function checkPhase26Invariants(root = DEFAULT_ROOT, resultPath) {
  const findings = [];
  let path;
  try { path = safeResultPath(root, resultPath); } catch { path = null; }
  if (path === null) return { ok: false, findings: ["Result path must be an existing non-symlink repository-relative file"] };
  const provenance = { root: realpathSync(root), resultPath };
  let markdown;
  try { markdown = readFileSync(path, "utf8"); } catch { return { ok: false, findings: ["Result is unreadable"] }; }
  const parsed = parsePhase26Result(markdown);
  findings.push(...parsed.findings);
  if (!parsed.result || parsed.mermaid === null) return { ok: false, findings };
  const result = parsed.result;
  const inventory = evidenceInventory(result, findings);
  if (!isObject(result.sdlcRunGraph)) findings.push("pipeline-result must contain sdlcRunGraph");
  else validateGraph(result, result.sdlcRunGraph, findings, inventory, provenance);
  if (!isObject(result.phase26InvariantEvidence)) findings.push("pipeline-result must contain phase26InvariantEvidence");
  else validateInvariantEvidence(result, result.phase26InvariantEvidence, findings, inventory);
  const binding = result.sdlcRunGraphProjection;
  if (!exactKeys(binding, ["generatorVersion", "graphSha256", "mermaidSha256"])
    || binding.generatorVersion !== PROJECTION_GENERATOR_VERSION || !digest(binding.graphSha256) || !digest(binding.mermaidSha256)) {
    findings.push("sdlcRunGraphProjection does not match the closed binding contract");
  } else if (isObject(result.sdlcRunGraph)) {
    const expectedMermaid = renderSdlcMermaid(result.sdlcRunGraph);
    if (binding.graphSha256 !== sha256Canonical(result.sdlcRunGraph)) findings.push("projection graphSha256 does not bind canonical graph JSON");
    if (parsed.mermaid !== expectedMermaid) findings.push("Mermaid block is not the deterministic graph-only projection");
    if (binding.mermaidSha256 !== sha256Text(expectedMermaid) || binding.mermaidSha256 !== sha256Text(parsed.mermaid)) findings.push("projection mermaidSha256 does not bind normalized Mermaid bytes");
  }
  return { ok: findings.length === 0, findings };
}

export function resultArg(argv) {
  const index = argv.indexOf("--result");
  return index === -1 ? null : argv[index + 1] ?? null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const resultPath = resultArg(process.argv.slice(2));
  if (!resultPath) {
    console.log("SKIP Phase-2.6 invariants: no --result supplied (explicit close opt-in only).");
    process.exit(0);
  }
  const checked = checkPhase26Invariants(DEFAULT_ROOT, resultPath);
  if (!checked.ok) {
    for (const finding of checked.findings) console.error(`FAIL Phase-2.6 invariants: ${finding}`);
    process.exit(2);
  }
  console.log(`Phase-2.6 invariants valid for ${PHASE_PACKAGE_ID}.`);
}
