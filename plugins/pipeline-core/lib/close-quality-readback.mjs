// SPDX-License-Identifier: SUL-1.0
// Read-only readback of the quality artefacts a change should have at close, plus the audit index of one change. It is NOT a gate: it never writes,
// never runs a scan, never calls the network, and a row whose signal cannot be read is "unknown", never "present". Every reader is injected.
// Rules (one sentence each):
//   security-scan         present when both evidence/security-latest.v2.json and its .verdict.json exist (the files check-close-security-completeness.mjs reads).
//   adr-decision          the typed architecture impact of the close decides: a decision-added/-superseded impact is present when docs/adr has a record and missing otherwise,
//                         any other typed impact is not-applicable, and no impact signal is unknown.
//                         Before that, every ADR path the design names (promisedAdrPaths) must exist: all there is present, any absent is missing and wins over a not-applicable impact (report-only).
//   architecture-fitness  present when the Pipeline State rigorHistory holds an observation for the feature that carries a fitness projection; missing when history is readable without one.
//   critic-report-file    present when specs/<feature>/evidence/critic/<packetId>/report.md exists for any packet (written by exportSessionCriticEvidence); missing when none does.
//                         When the receipts are readable the row names a PASSING review's report (the last in listing order) and is missing when every report records a fail.
//   handover-freshness    present when the handover file was last updated no more than HANDOVER_FRESHNESS_BOUND_MS before the last commit, missing when it is older.
//   journey-coverage      (G20-27) per user-facing criterion of specs/<feature>/spec.md: covered when it names journeys and an asserted effect, else not covered.
//                         The evidence lists every such criterion as `AC-n: covered` / `AC-n: not covered`; present when none is not covered, not-applicable
//                         when the Spec has no user-facing criterion, unknown when the Spec cannot be read.
//   risk-trace            (AC-112, report-only) per row of the Spec's closed risk table (lib/spec-risk-trace.mjs): present when every row is covered,
//                         residual-stated or not-applicable; missing, with the untraced / stale / malformed ids listed, when any row is not;
//                         not-applicable when the Spec has no such table; unknown when the Spec or a named path cannot be read.
// Reader contract: exists(rel)->bool, listDir(rel)->string[] (an absent directory is []), architectureImpact()->string|null, rigorHistory()->array|null,
// handoverUpdatedMs()->number|null, headCommitMs()->number|null, readBytes(rel)->Buffer, promisedAdrPaths()->string[]|null. A reader that throws or is not supplied yields "unknown".

import { createHash } from "node:crypto";
import { SCANNER_EXCEPTIONS_PATH, closeSecurityScopeNote, elementsOfCompletedScan, formatSecurityCloseStatus, isCriticalStakes, parseScannerExceptions } from "./security-close-status.mjs";
import { LEGACY_CALIBRATION, NEUTRAL_CALIBRATION } from "./project-authority-read.mjs";
import { inspectSpecJourneys, JOURNEY_REPAIR } from "./spec-journey-coverage.mjs";
import { inspectSpecRiskTrace, RISK_TRACE_HEADER } from "./spec-risk-trace.mjs";
import { describeVerdictLabel, fitnessObservationVerdictLabel } from "./architecture-verdict-label.mjs";

export const HANDOVER_FRESHNESS_BOUND_MS = 24 * 60 * 60 * 1000;
export const QUALITY_ROW_IDS = Object.freeze(["security-scan", "adr-decision", "architecture-fitness", "critic-report-file", "handover-freshness", "journey-coverage", "risk-trace"]);
export const QUALITY_READBACK_SCHEMA = "pipeline.close-quality-readback.v1";
export const AUDIT_INDEX_SCHEMA = "pipeline.close-audit-package-index.v1";

export const SECURITY_ENVELOPE_PATH = "evidence/security-latest.v2.json";
export const SECURITY_VERDICT_PATH = "evidence/security-latest.v2.verdict.json";
const SECURITY_SCAN_PATH = "evidence/security-latest.json";
const ADR_DIR = "docs/adr";
const DECISION_IMPACTS = new Set(["architecture-decision-added", "architecture-decision-superseded"]);
const NO_DECISION_IMPACTS = new Set(["architecture-conforms", "architecture-summary-updated", "no-architecture-impact"]);

const row = (id, status, evidence = null, remedy = null) => ({ id, status, evidence, remedy });
const unknown = (id, remedy = null) => row(id, "unknown", null, remedy);
const call = (fn, ...args) => {
  if (typeof fn !== "function") return { ok: false };
  try { return { ok: true, value: fn(...args) }; } catch { return { ok: false }; }
};

function securityRow(readers) {
  const id = "security-scan";
  const remedy = "node <plugin-root>/scripts/security-scan.mjs";
  const envelope = call(readers.exists, SECURITY_ENVELOPE_PATH);
  const verdict = call(readers.exists, SECURITY_VERDICT_PATH);
  if (!envelope.ok || !verdict.ok) return unknown(id, remedy);
  if (envelope.value !== true || verdict.value !== true) return row(id, "missing", null, remedy);
  // G20-25: "present" only says the evidence files exist, never that every scanner ran. When the scan result is readable the evidence
  // text carries the four-state reading of each element (the closed row shape has no field for it), so a skipped scanner never reads
  // like a passed scan; when it is not readable the evidence stays the bare path (the readback never claims what it cannot read).
  const scan = call(readers.readBytes, SECURITY_SCAN_PATH);
  if (scan.ok) {
    try {
      // Candidate 21h: the same critical reading and named exceptions as the close gate, read through the injected reader (a reader that
      // cannot supply the calibration or the exception file leaves the non-critical reading, which the readback never claims beyond).
      const text = (rel) => { const read = call(readers.readBytes, rel); return read.ok ? Buffer.from(read.value).toString("utf8") : null; };
      const stakesOf = (rel) => { try { const stakes = JSON.parse(text(rel))?.stakes; return typeof stakes === "string" ? stakes : null; } catch { return null; } };
      const critical = isCriticalStakes(stakesOf(NEUTRAL_CALIBRATION) ?? stakesOf(LEGACY_CALIBRATION));
      const exceptions = critical ? parseScannerExceptions(text(SCANNER_EXCEPTIONS_PATH)) : null;
      const states = formatSecurityCloseStatus(elementsOfCompletedScan(JSON.parse(Buffer.from(scan.value).toString("utf8")).scanners, { critical, exceptions })).map((line) => line.split(" -- ")[0]);
      // C29 (Codex run 3, C3): an empty or unreadable v2 capability plan travels beside the scanner states, so "present" never reads like every control passed.
      let verdictDocument = null; try { verdictDocument = JSON.parse(text(SECURITY_VERDICT_PATH)); } catch { verdictDocument = null; }
      const note = closeSecurityScopeNote(verdictDocument);
      return row(id, "present", `${SECURITY_ENVELOPE_PATH} (${[...states, ...(note === null ? [] : [note])].join("; ")})`);
    } catch { /* unreadable scan result: fall through to the bare path */ }
  }
  return row(id, "present", SECURITY_ENVELOPE_PATH);
}

function adrRow(readers) {
  const id = "adr-decision";
  const promised = call(readers.promisedAdrPaths);
  if (promised.ok && Array.isArray(promised.value) && promised.value.length > 0) {
    const checks = promised.value.map((path) => ({ path, found: call(readers.exists, path) }));
    if (checks.every((c) => c.found.ok)) {
      const absent = checks.filter((c) => c.found.value !== true).map((c) => c.path);
      const listing = checks.map((c) => `${c.path}: ${c.found.value === true ? "exists" : "missing"}`).join(", ");
      return absent.length === 0
        ? row(id, "present", listing)
        : row(id, "missing", listing,`The design names ADRs that do not exist: ${absent.join(", ")}. Write them with the architecture-decision skill.`);
    }
  }
  const impact = call(readers.architectureImpact);
  if (!impact.ok || typeof impact.value !== "string") return unknown(id);
  if (NO_DECISION_IMPACTS.has(impact.value)) return row(id, "not-applicable");
  if (!DECISION_IMPACTS.has(impact.value)) return unknown(id);
  const listing = call(readers.listDir, ADR_DIR);
  if (!listing.ok || !Array.isArray(listing.value)) return unknown(id);
  return listing.value.length > 0 ? row(id, "present", ADR_DIR) : row(id, "missing");
}

function fitnessRow(readers, featureId) {
  const id = "architecture-fitness";
  const remedy = "node <plugin-root>/scripts/architecture-fitness.mjs --root <root> --check";
  const history = call(readers.rigorHistory);
  if (!history.ok || !Array.isArray(history.value)) return unknown(id, remedy);
  const recordedEntries = history.value.filter((entry) => entry?.body?.featureId === featureId && entry.body.fitnessProjection !== null && entry.body.fitnessProjection !== undefined);
  if (recordedEntries.length === 0) return row(id, "missing", null, remedy);
  // CGF-08/CGF-23: the row shape is closed, so the label of the latest recorded observation travels in the free evidence text, with
  // the open report-only classes listed beside "present". A label that cannot be built leaves the bare row (the readback never claims what it cannot read).
  try { return row(id, "present", describeVerdictLabel(fitnessObservationVerdictLabel(recordedEntries[recordedEntries.length - 1].body))); } catch { return row(id, "present"); }
}

function criticRow(readers, featureId) {
  const id = "critic-report-file";
  const remedy = "node <plugin-root>/scripts/session-critic-finalizer.mjs export --root <root> --request <request.json>";
  const dir = `specs/${featureId}/evidence/critic`;
  const packets = call(readers.listDir, dir);
  if (!packets.ok || !Array.isArray(packets.value)) return unknown(id, remedy);
  // Codex greenfield F6: with three review rounds the row named the first report in listing order, an old FAIL, although a later round passed.
  // A packet whose receipt records a pass is preferred (the last such one in listing order); reports that all record a fail are "missing" a
  // passing review; a receipt that cannot be read leaves the legacy answer (a report exists) because the readback never claims what it cannot read.
  const reports = [];
  for (const packet of packets.value) {
    const path = `${dir}/${packet}/report.md`;
    const found = call(readers.exists, path);
    if (!found.ok) return unknown(id, remedy);
    if (found.value === true) reports.push({ path, receipt: `${dir}/${packet}/receipt.json` });
  }
  if (reports.length === 0) return row(id, "missing", null, remedy);
  const verdicts = reports.map((report) => {
    const bytes = call(readers.readBytes, report.receipt);
    if (!bytes.ok) return null;
    try { const pass = JSON.parse(Buffer.from(bytes.value).toString("utf8"))?.reviewPass; return typeof pass === "boolean" ? pass : null; } catch { return null; }
  });
  const passing = reports.filter((_, index) => verdicts[index] === true);
  if (passing.length > 0) return row(id, "present", passing[passing.length - 1].path);
  if (verdicts.every((verdict) => verdict === false)) {
    return row(id, "missing", null, "the exported Critic reports record no passing review of this feature; run a fresh review of the final candidate and export it: " + remedy);
  }
  return row(id, "present", reports[0].path);
}

// G20-27: per user-facing criterion of the Spec, covered / not covered by a named journey and an asserted effect (never a bare count).
function journeyRow(readers, specPath) {
  const id = "journey-coverage";
  const bytes = call(readers.readBytes, specPath);
  if (!bytes.ok) return unknown(id, JOURNEY_REPAIR);
  let coverage;
  try { coverage = inspectSpecJourneys(Buffer.from(bytes.value).toString("utf8")); } catch { return unknown(id, JOURNEY_REPAIR); }
  const userFacing = coverage.criteria.filter((entry) => entry.status !== "not-user-facing");
  if (userFacing.length === 0) return row(id, "not-applicable");
  const listing = userFacing.map((entry) => `${entry.id}: ${entry.status === "covered" ? "covered" : `not covered (no ${entry.missing.join(", no ")})`}`).join("; ");
  return coverage.notCovered.length === 0 ? row(id, "present", `${specPath} (${listing})`) : row(id, "missing", `${specPath} (${listing})`, JOURNEY_REPAIR);
}

// AC-112 (candidate 30k K16): per row of the Spec's closed risk table, how the accepted risk is traced (covered / residual-stated /
// not-applicable / untraced / stale / malformed), derived on read from the Spec bytes. Report-only: nothing is stored and nothing refuses.
const RISK_TRACE_REPAIR = (ids) => `in the Spec's risk table (header \`${RISK_TRACE_HEADER}\`) give row ${ids.join(", ")} a trace: a test path, \`command:<id>\`, \`residual: backlog/items/<item>.md\` or \`not-applicable: <reason>\`; on an approved Spec this is a registered Spec addendum, never an edit of approved bytes`;
const RISK_TRACE_READ_REPAIR = "restore the Spec as a readable file at its recorded path (check `git status`), commit it, and run the close readback again";
function riskTraceRow(readers, specPath) {
  const id = "risk-trace";
  const bytes = call(readers.readBytes, specPath);
  if (!bytes.ok) return unknown(id, RISK_TRACE_READ_REPAIR);
  let trace;
  try { trace = inspectSpecRiskTrace(Buffer.from(bytes.value).toString("utf8"), { exists: readers.exists }); } catch { return unknown(id, RISK_TRACE_READ_REPAIR); }
  if (trace.status === "not-applicable") return row(id, "not-applicable");
  const listing = `${specPath} (${trace.rows.map((entry) => `${entry.id}: ${entry.status}`).join("; ")})`;
  return trace.open.length === 0 ? row(id, "present", listing) : row(id, "missing", listing, RISK_TRACE_REPAIR(trace.open));
}

function handoverRow(readers, handoverPath) {
  const id = "handover-freshness";
  const updated = call(readers.handoverUpdatedMs);
  const head = call(readers.headCommitMs);
  if (!updated.ok || !head.ok || !Number.isFinite(updated.value) || !Number.isFinite(head.value)) return unknown(id);
  return head.value - updated.value <= HANDOVER_FRESHNESS_BOUND_MS ? row(id, "present", handoverPath) : row(id, "missing", handoverPath);
}

export function closeQualityReadback({ featureId, handoverPath = "docs/state.md", specPath = `specs/${featureId}/spec.md`, readers = {} } = {}) {
  return [
    securityRow(readers),
    adrRow(readers),
    fitnessRow(readers, featureId),
    criticRow(readers, featureId),
    handoverRow(readers, handoverPath),
    journeyRow(readers, specPath),
    riskTraceRow(readers, specPath),
  ];
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

// One JSON index of the change: each path with the sha256 of the file when it exists. Read-only; nothing is written.
export function buildAuditIndex({ featureId, prdPath = null, specPath = null, rows = [], readers = {} } = {}) {
  const fileEntry = (id, path) => {
    if (typeof path !== "string") return { id, path: null, sha256: null };
    const found = call(readers.exists, path);
    if (!found.ok || found.value !== true) return { id, path, sha256: null };
    const bytes = call(readers.readBytes, path);
    return { id, path, sha256: bytes.ok ? sha256(bytes.value) : null };
  };
  const criticDir = `specs/${featureId}/evidence/critic`;
  const reports = [];
  const packets = call(readers.listDir, criticDir);
  if (packets.ok && Array.isArray(packets.value)) {
    for (const packet of packets.value) {
      const entry = fileEntry("critic-report", `${criticDir}/${packet}/report.md`);
      if (entry.sha256 !== null) reports.push(entry);
    }
  }
  return {
    schema: AUDIT_INDEX_SCHEMA,
    featureId,
    entries: [
      fileEntry("prd", prdPath),
      fileEntry("spec", specPath),
      fileEntry("plan", `specs/${featureId}/plan.md`),
      fileEntry("verify-evidence", "evidence/verify-latest.json"),
      { id: "critic-reports", path: criticDir, files: reports },
      fileEntry("security-scan-evidence", SECURITY_ENVELOPE_PATH),
      fileEntry("fitness-evidence", "architecture/baseline.json"),
      fileEntry("push-threat-model", "project/push-threat-model.md"),
    ],
    qualityRows: rows,
  };
}
