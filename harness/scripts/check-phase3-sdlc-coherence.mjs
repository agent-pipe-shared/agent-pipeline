#!/usr/bin/env node
/**
 * Opt-in Phase-3 Result coherence checker.
 *
 * This reconciles Result-owned records.  It does not create a lifecycle,
 * delivery, verification, or status authority of its own.
 */
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { GRAPH_SCHEMA_VERSION, validateSdlcRunGraph } from "./sdlc-run-graph.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = resolve(HERE, "..", "..");

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_TARGET = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const GIT_OBJECT_ID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const FINAL_EVIDENCE_KEYS = [
  "finalDeliveryEvidenceId", "candidateCommit", "tree", "verifyCommand",
  "verifyResultDigest", "privacyDisposition", "securityDisposition",
  "approvedTarget", "pushedOid", "fetchedOid",
];
const PACKAGE_BINDING_KEYS = [
  "packageId", "packageSha256", "terminalCycleId", "terminalEventId",
  "finalDeliveryEvidenceId",
];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return isObject(value) && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function safeId(value) {
  return typeof value === "string" && SAFE_ID.test(value);
}

function gitObjectId(value) {
  return typeof value === "string" && GIT_OBJECT_ID.test(value);
}

export function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("non-finite JSON number");
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

function recordId(record, candidates) {
  if (!isObject(record)) return null;
  for (const candidate of candidates) {
    if (safeId(record[candidate])) return record[candidate];
  }
  return null;
}

function graphEvents(graph) {
  return Array.isArray(graph?.events) ? graph.events.filter(isObject) : [];
}

function graphCycles(graph) {
  return Array.isArray(graph?.cycles) ? graph.cycles.filter(isObject) : [];
}

function sourceIds(event) {
  return Array.isArray(event?.sourceEvidenceIds) ? event.sourceEvidenceIds : [];
}

function validatePackageResults(result, graph, findings) {
  if (!Array.isArray(result.packageResults)) {
    findings.push("packageResults must be an array");
    return new Map();
  }
  const packages = new Map();
  for (const entry of result.packageResults) {
    if (!isObject(entry) || !safeId(entry.id) || !safeId(entry.actionId) || packages.has(entry.id)) {
      findings.push(`PackageResult ${entry?.id ?? "unknown"} has a missing, malformed or duplicate identity`);
      continue;
    }
    packages.set(entry.id, entry);
  }
  const cycles = graphCycles(graph);
  const events = graphEvents(graph);
  for (const [packageId, packageResult] of packages) {
    const packageCycles = cycles.filter((cycle) => cycle?.packageId === packageId);
    const packageEvents = events.filter((event) => event?.packageId === packageId);
    if (packageCycles.length !== 1 || packageEvents.length < 1
      || packageEvents.some((event) => event.cycleId !== packageCycles[0]?.cycleId)) {
      findings.push(`PackageResult ${packageId} must map to one or more ordered events in exactly one cycle`);
    }
    if (packageEvents.some((event) => event.actionId !== packageResult.actionId)) {
      findings.push(`PackageResult ${packageId} action dispatch identity does not match graph events`);
    }
  }
  for (const cycle of cycles) {
    if (!packages.has(cycle?.packageId)) findings.push(`cycle ${cycle?.cycleId ?? "unknown"} has no owning PackageResult`);
  }
  for (const event of events) {
    if (!packages.has(event?.packageId)) findings.push(`event ${event?.eventId ?? "unknown"} has no owning PackageResult`);
  }
  return packages;
}

function addEvidence(inventory, id, kind, packageId, actionId, findings) {
  if (!safeId(id)) {
    findings.push(`${kind} has an invalid source evidence ID`);
    return;
  }
  if (inventory.has(id)) {
    findings.push(`sourceEvidence ID ${id} is duplicate or ambiguous`);
    return;
  }
  inventory.set(id, { kind, packageId, actionId });
}

function buildEvidenceInventory(result, packages, finalEvidence, findings) {
  const inventory = new Map();
  for (const [packageId, packageResult] of packages) {
    addEvidence(inventory, packageResult.resultEvidenceId, "PackageResult", packageId, packageResult.actionId, findings);
    const corrections = packageResult.correctionRecords;
    if (!Array.isArray(corrections)) {
      findings.push(`PackageResult ${packageId} correctionRecords must be an array`);
    } else {
      for (const correction of corrections) {
        addEvidence(inventory, correction?.correctionId, "correction", packageId, correction?.actionId, findings);
      }
    }
    const deltas = packageResult.deltaReceipts;
    if (!Array.isArray(deltas)) {
      findings.push(`PackageResult ${packageId} deltaReceipts must be an array`);
    } else {
      for (const receipt of deltas) {
        addEvidence(inventory, receipt?.receiptId, "delta receipt", packageId, receipt?.actionId, findings);
      }
    }
    if (isObject(packageResult.delivery)) {
      addEvidence(inventory, packageResult.delivery.deliveryReceiptId, "delivery receipt", packageId, packageResult.actionId, findings);
      addEvidence(inventory, packageResult.delivery.fetchBackReceiptId, "fetch-back receipt", packageId, packageResult.actionId, findings);
    }
  }
  if (isObject(finalEvidence)) {
    addEvidence(inventory, finalEvidence.finalDeliveryEvidenceId, "final delivery evidence", null, null, findings);
  }
  if (result.externalEvidence !== undefined) {
    if (!Array.isArray(result.externalEvidence)) findings.push("externalEvidence must be an array when present");
    else for (const entry of result.externalEvidence) {
      addEvidence(inventory, recordId(entry, ["id", "evidenceId", "receiptId"]), "external evidence", null, null, findings);
    }
  }
  return inventory;
}

function validateGraphSources(graph, inventory, findings) {
  for (const event of graphEvents(graph)) {
    for (const sourceId of sourceIds(event)) {
      const source = inventory.get(sourceId);
      if (!source) {
        findings.push(`event ${event.eventId} sourceEvidence ${sourceId} does not resolve and may be fabricated`);
        continue;
      }
      if (source.packageId !== null && source.packageId !== event.packageId) {
        findings.push(`event ${event.eventId} sourceEvidence ${sourceId} crosses a package boundary`);
      }
      if (source.actionId !== null && source.actionId !== event.actionId) {
        findings.push(`event ${event.eventId} sourceEvidence ${sourceId} crosses an action boundary`);
      }
    }
  }
}

function recordEventBijection(packages, graph, recordField, idField, stage, label, findings) {
  const records = [];
  for (const [packageId, packageResult] of packages) {
    for (const record of packageResult[recordField] ?? []) {
      records.push({ packageId, actionId: record?.actionId, id: record?.[idField] });
    }
  }
  const typedEvents = graphEvents(graph).filter((event) => event.stage === stage);
  for (const record of records) {
    const matches = typedEvents.filter((event) => sourceIds(event).includes(record.id));
    if (matches.length !== 1) findings.push(`${label} ${record.id} must have exactly one typed ${stage} event (bijection)`);
    else if (matches[0].packageId !== record.packageId || matches[0].actionId !== record.actionId) {
      findings.push(`${label} ${record.id} event crosses its package or action boundary`);
    }
  }
  for (const event of typedEvents) {
    const matches = records.filter((record) => sourceIds(event).includes(record.id));
    if (matches.length !== 1) findings.push(`${stage} event ${event.eventId} does not resolve exactly one ${label}`);
  }
}

function validateDeliveryBijection(packages, graph, findings) {
  let mapped = 0;
  let expected = 0;
  for (const [packageId, packageResult] of packages) {
    const delivery = packageResult.delivery;
    if (!isObject(delivery) || delivery.outcome !== "succeeded") continue;
    expected += 1;
    const packageEvents = graphEvents(graph).filter((event) => event.packageId === packageId);
    const pushEvents = packageEvents.filter((event) => event.stage === "delivery"
      && sourceIds(event).includes(delivery.deliveryReceiptId));
    const fetchEvents = packageEvents.filter((event) => event.stage === "fetch-back"
      && sourceIds(event).includes(delivery.fetchBackReceiptId));
    const exactPair = pushEvents.length === 1 && fetchEvents.length === 1
      && pushEvents[0].cycleId === fetchEvents[0].cycleId
      && pushEvents[0].actionId === packageResult.actionId
      && fetchEvents[0].actionId === packageResult.actionId
      && pushEvents[0].sequence < fetchEvents[0].sequence;
    if (!exactPair) {
      findings.push(`successful delivery ${packageId} requires exactly one delivery/push and fetch-back/readback pair`);
    } else {
      mapped += 1;
    }
    if (!gitObjectId(delivery.pushedOid) || delivery.pushedOid !== delivery.fetchedOid
      || delivery.pushedOid !== packageResult.candidateCommit) {
      findings.push(`successful delivery ${packageId} pushedOid and fetchedOid must be an exact candidate readback`);
    }
  }
  const allPushEvents = graphEvents(graph).filter((event) => event.stage === "delivery");
  const allFetchEvents = graphEvents(graph).filter((event) => event.stage === "fetch-back");
  const deliveryIds = new Set([...packages.values()].map((entry) => entry.delivery?.deliveryReceiptId).filter(Boolean));
  const fetchIds = new Set([...packages.values()].map((entry) => entry.delivery?.fetchBackReceiptId).filter(Boolean));
  for (const event of allPushEvents) {
    const matches = sourceIds(event).filter((id) => deliveryIds.has(id));
    if (matches.length !== 1) findings.push(`delivery event ${event.eventId} does not resolve exactly one push receipt`);
  }
  for (const event of allFetchEvents) {
    const matches = sourceIds(event).filter((id) => fetchIds.has(id));
    if (matches.length !== 1) findings.push(`fetch-back event ${event.eventId} does not resolve exactly one readback receipt`);
  }
  if (mapped !== expected) {
    findings.push(`delivery mapping covers ${mapped} of ${expected} successful packages; ${expected - mapped} missing or unmapped`);
  }
}

function validateFinalEvidence(result, graph, findings) {
  const evidence = result.finalDeliveryEvidence;
  if (!exactKeys(evidence, FINAL_EVIDENCE_KEYS)) {
    findings.push("a closed v2 Result requires exactly one closed finalDeliveryEvidence object with verifyResultDigest");
    return null;
  }
  if (!safeId(evidence.finalDeliveryEvidenceId)
    || !gitObjectId(evidence.candidateCommit) || !gitObjectId(evidence.tree)
    || typeof evidence.verifyCommand !== "string" || evidence.verifyCommand.length < 1
    || typeof evidence.verifyResultDigest !== "string" || !SHA256.test(evidence.verifyResultDigest)
    || !safeId(evidence.privacyDisposition) || !safeId(evidence.securityDisposition)
    || typeof evidence.approvedTarget !== "string" || !SAFE_TARGET.test(evidence.approvedTarget)
    || !gitObjectId(evidence.pushedOid) || !gitObjectId(evidence.fetchedOid)) {
    findings.push("finalDeliveryEvidence has a malformed final commit/tree/verify/readback binding");
  }
  if (evidence.pushedOid !== evidence.candidateCommit || evidence.fetchedOid !== evidence.pushedOid) {
    findings.push("finalDeliveryEvidence pushedOid/fetchedOid must exactly read back the final candidate commit");
  }
  const finalStages = new Set(["final-verify", "delivery", "fetch-back", "close"]);
  for (const event of graphEvents(graph)) {
    if (finalStages.has(event.stage)
      && (event.candidateCommit !== evidence.candidateCommit || event.tree !== evidence.tree)) {
      findings.push(`final ${event.stage} event ${event.eventId} conflicts with finalDeliveryEvidence commit/tree`);
    }
  }
  return evidence;
}

function validatePackageBindings(result, packages, graph, finalEvidence, findings) {
  if (!Array.isArray(result.packageBindings)) {
    findings.push("packageBindings must be an array with complete package coverage");
    return;
  }
  const seen = new Set();
  for (const binding of result.packageBindings) {
    if (!exactKeys(binding, PACKAGE_BINDING_KEYS) || !safeId(binding.packageId)
      || typeof binding.packageSha256 !== "string" || !SHA256.test(binding.packageSha256)
      || !safeId(binding.terminalCycleId) || !safeId(binding.terminalEventId)
      || !safeId(binding.finalDeliveryEvidenceId)) {
      findings.push(`packageBindings contains a malformed entry for ${binding?.packageId ?? "unknown"}`);
      continue;
    }
    if (seen.has(binding.packageId)) findings.push(`packageBindings contains duplicate coverage for ${binding.packageId}`);
    seen.add(binding.packageId);
    const packageResult = packages.get(binding.packageId);
    if (!packageResult) {
      findings.push(`packageBindings contains extra or fabricated package ${binding.packageId}`);
      continue;
    }
    if (binding.packageSha256 !== sha256Canonical(packageResult)) {
      findings.push(`packageSha256 for ${binding.packageId} is stale or does not retain the immutable PackageResult digest`);
    }
    if (!finalEvidence || binding.finalDeliveryEvidenceId !== finalEvidence.finalDeliveryEvidenceId) {
      findings.push(`finalDeliveryEvidenceId for ${binding.packageId} does not resolve to the one final evidence object`);
    }
    const packageCycles = graphCycles(graph).filter((cycle) => cycle.packageId === binding.packageId);
    if (packageCycles.length !== 1 || packageCycles[0].cycleId !== binding.terminalCycleId) {
      findings.push(`terminalCycleId for ${binding.packageId} does not resolve to its terminal cycle`);
      continue;
    }
    const terminalEventId = Array.isArray(packageCycles[0].eventIds) ? packageCycles[0].eventIds.at(-1) : null;
    if (binding.terminalEventId !== terminalEventId) {
      findings.push(`terminalEventId for ${binding.packageId} is not its terminal event`);
    }
  }
  for (const packageId of packages.keys()) {
    if (!seen.has(packageId)) findings.push(`packageBindings coverage is missing ${packageId}`);
  }
  if (seen.size !== packages.size) findings.push("packageBindings coverage must be complete and duplicate-free");
}

function validateStatuses(result, graph, findings) {
  if (typeof result.status !== "string") findings.push("Result status must be explicit for status reconciliation");
  const expected = graph?.completionClaim;
  if (result.status !== expected) findings.push(`Result status ${result.status ?? "missing"} conflicts with graph status ${expected ?? "missing"}`);
  if (!Array.isArray(result.statusProjections) || result.statusProjections.length < 1) {
    findings.push("statusProjections must reconcile existing close-state projections");
    return;
  }
  const projectionNames = new Set();
  for (const projection of result.statusProjections) {
    if (!isObject(projection) || !safeId(projection.projection) || typeof projection.status !== "string") {
      findings.push("statusProjections contains a malformed projection");
    } else {
      if (projectionNames.has(projection.projection)) findings.push(`status projection ${projection.projection} is duplicated`);
      projectionNames.add(projection.projection);
      if (projection.status !== result.status || projection.status !== expected) {
        findings.push(`status projection ${projection.projection}=${projection.status} conflicts with ${result.status}/${expected}`);
      }
    }
  }
}

function reconcilePhase3SdlcCoherence(result) {
  const findings = [];
  if (!isObject(result)) return { ok: false, findings: ["Phase-3 Result envelope must be one object"] };
  const graph = result.sdlcRunGraph;
  if (!isObject(graph) || graph.schemaVersion !== GRAPH_SCHEMA_VERSION) {
    findings.push(`Phase-3 coherence requires ${GRAPH_SCHEMA_VERSION}`);
    return { ok: false, findings };
  }
  const checkedGraph = validateSdlcRunGraph(graph);
  findings.push(...checkedGraph.findings.map((finding) => `sdlcRunGraph: ${finding}`));

  const packages = validatePackageResults(result, graph, findings);
  const finalEvidence = validateFinalEvidence(result, graph, findings);
  const inventory = buildEvidenceInventory(result, packages, finalEvidence, findings);
  validateGraphSources(graph, inventory, findings);
  recordEventBijection(packages, graph, "correctionRecords", "correctionId", "correction", "correction record", findings);
  recordEventBijection(packages, graph, "deltaReceipts", "receiptId", "delta-regate", "delta receipt", findings);
  validateDeliveryBijection(packages, graph, findings);
  validatePackageBindings(result, packages, graph, finalEvidence, findings);
  validateStatuses(result, graph, findings);
  return { ok: findings.length === 0, findings };
}

/** Reconcile a parsed Phase-3 Result envelope without mutating it. */
export function checkPhase3SdlcCoherence(result) {
  try {
    return reconcilePhase3SdlcCoherence(result);
  } catch (error) {
    return { ok: false, findings: [`malformed Phase-3 Result could not be reconciled (${error.message})`] };
  }
}

/** Parse JSON while refusing duplicate object keys. */
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

export function parsePhase3Result(source) {
  if (typeof source !== "string" || source.startsWith("\uFEFF") || source.includes("\r")) {
    return { ok: false, findings: ["Result must be UTF-8/LF text without BOM or CR"], result: null };
  }
  const blocks = [...source.matchAll(/^```pipeline-result\n([\s\S]*?)^```\s*$/gm)];
  if (blocks.length !== 1) return { ok: false, findings: [`expected exactly one pipeline-result block, found ${blocks.length}`], result: null };
  try {
    const result = parseJsonNoDuplicateKeys(blocks[0][1]);
    return isObject(result)
      ? { ok: true, findings: [], result }
      : { ok: false, findings: ["pipeline-result block must contain one object"], result: null };
  } catch (error) {
    return { ok: false, findings: [`pipeline-result JSON is invalid (${error.message})`], result: null };
  }
}

function safeResultPath(root, resultPath) {
  if (typeof resultPath !== "string" || resultPath.length < 1 || isAbsolute(resultPath)
    || resultPath.includes("\\") || resultPath.includes("\0")) return null;
  const rootReal = realpathSync(root);
  const candidate = resolve(rootReal, resultPath);
  const rel = relative(rootReal, candidate);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  const stat = lstatSync(candidate);
  if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(candidate) !== candidate) return null;
  return candidate;
}

export function checkPhase3SdlcCoherenceFile(root = DEFAULT_ROOT, resultPath) {
  let path;
  try { path = safeResultPath(root, resultPath); } catch { path = null; }
  if (path === null) return { ok: false, findings: ["Result path must be an existing non-symlink repository-relative file"] };
  let source;
  try { source = readFileSync(path, "utf8"); } catch { return { ok: false, findings: ["Result is unreadable"] }; }
  const parsed = parsePhase3Result(source);
  if (!parsed.ok) return { ok: false, findings: parsed.findings };
  return checkPhase3SdlcCoherence(parsed.result);
}

export function resultArg(argv) {
  const index = argv.indexOf("--result");
  return index === -1 ? null : argv[index + 1] ?? null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const resultPath = resultArg(process.argv.slice(2));
  if (!resultPath) {
    console.log("SKIP Phase-3 SDLC coherence: no --result supplied (explicit close opt-in only).");
    process.exit(0);
  }
  const checked = checkPhase3SdlcCoherenceFile(DEFAULT_ROOT, resultPath);
  if (!checked.ok) {
    for (const finding of checked.findings) console.error(`FAIL Phase-3 SDLC coherence: ${finding}`);
    process.exit(2);
  }
  console.log("Phase-3 SDLC Result coherence valid.");
}
