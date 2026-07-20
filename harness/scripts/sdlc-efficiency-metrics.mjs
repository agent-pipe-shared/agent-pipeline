/** Shadow-only validation and deterministic summaries for SDLC efficiency evidence. */
export const SDLC_EFFICIENCY_METRICS_SCHEMA = "pipeline.sdlc-efficiency-metrics.v1";
export const UNKNOWN = "unknown";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/;
const MAX = Number.MAX_SAFE_INTEGER;
const ROOT_KEYS = new Set(["schema", "metricId", "cycleId", "gateId", "candidate", "timing", "usage", "finding", "change", "gate", "checkpointRecoveryUse", "versions"]);
const TIMING_KEYS = new Set(["wallDurationMs", "queueDurationMs", "remoteRoundtripDurationMs"]);
const USAGE_KEYS = new Set(["inputBytes", "outputBytes", "contextBytes", "inputTokens", "outputTokens", "contextTokens"]);
const FINDING_KEYS = new Set(["findingId", "novelty", "severity", "errorClass"]);
const CHANGE_KEYS = new Set(["changedPathCount", "affectedInvariantIds"]);
const GATE_KEYS = new Set(["mode", "outcome", "reworkDisposition", "reopened", "rollbackDisposition"]);
const VERSION_KEYS = new Set(["toolVersion", "runnerVersion", "schemaVersion"]);
const CANDIDATE_KEYS = new Set(["commit", "tree"]);
const GATE_MODES = new Set(["full", "delta", "stage-verify", "final-verify", "semantic-critic", "trajectory-critic", "course", "failover", UNKNOWN]);
const OUTCOMES = ["passed", "failed", "blocked", "skipped", UNKNOWN];
const REWORK = new Set(["none", "rework", "reopen", "defer", UNKNOWN]);
const ROLLBACK = new Set(["none", "rolled-back", "rollback-pending", "not-applicable", UNKNOWN]);
const NOVELTY = new Set(["novel", "recurring", "none", UNKNOWN]);
const SEVERITY = new Set(["blocker", "high", "major", "minor", "none", UNKNOWN]);

function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) { return object(value) && Object.keys(value).length === keys.size && Object.keys(value).every((key) => keys.has(key)); }
function id(value) { return typeof value === "string" && ID.test(value); }
function oid(value) { return typeof value === "string" && OID.test(value); }
function measurement(value) { return value === UNKNOWN || (Number.isSafeInteger(value) && value >= 0 && value <= MAX); }
function tri(value) { return value === true || value === false || value === UNKNOWN; }
function version(value) { return typeof value === "string" && VERSION.test(value); }
function sortedUniqueIds(value) { return Array.isArray(value) && value.length <= 256 && value.every(id) && new Set(value).size === value.length; }
function idsOrUnknown(value) { return value === UNKNOWN || sortedUniqueIds(value); }

/** Validate one closed shadow record. It intentionally has no gate authority. */
export function validateSdlcEfficiencyMetric(value) {
  if (!exact(value, ROOT_KEYS) || value.schema !== SDLC_EFFICIENCY_METRICS_SCHEMA || ![value.metricId, value.cycleId, value.gateId].every(id)) return { ok: false, code: "SEM-INVALID" };
  if (!exact(value.candidate, CANDIDATE_KEYS) || !oid(value.candidate.commit) || !oid(value.candidate.tree)) return { ok: false, code: "SEM-CANDIDATE" };
  if (!exact(value.timing, TIMING_KEYS) || !Object.values(value.timing).every(measurement)) return { ok: false, code: "SEM-TIMING" };
  if (!exact(value.usage, USAGE_KEYS) || !Object.values(value.usage).every(measurement)) return { ok: false, code: "SEM-USAGE" };
  if (!exact(value.finding, FINDING_KEYS)
    || !(id(value.finding.findingId) || value.finding.findingId === UNKNOWN)
    || !NOVELTY.has(value.finding.novelty) || !SEVERITY.has(value.finding.severity)
    || !(id(value.finding.errorClass) || value.finding.errorClass === "none" || value.finding.errorClass === UNKNOWN)) return { ok: false, code: "SEM-FINDING" };
  if (!exact(value.change, CHANGE_KEYS) || !measurement(value.change.changedPathCount) || !idsOrUnknown(value.change.affectedInvariantIds)) return { ok: false, code: "SEM-CHANGE" };
  if (!exact(value.gate, GATE_KEYS) || !GATE_MODES.has(value.gate.mode) || !OUTCOMES.includes(value.gate.outcome)
    || !REWORK.has(value.gate.reworkDisposition) || !tri(value.gate.reopened) || !ROLLBACK.has(value.gate.rollbackDisposition)) return { ok: false, code: "SEM-GATE" };
  if (!tri(value.checkpointRecoveryUse)) return { ok: false, code: "SEM-RECOVERY" };
  if (!exact(value.versions, VERSION_KEYS) || !Object.values(value.versions).every(version)) return { ok: false, code: "SEM-VERSIONS" };
  return { ok: true, code: "SEM-VALID" };
}

export const validateEfficiencyMetric = validateSdlcEfficiencyMetric;

function total(records, path) {
  const values = records.map((record) => record[path[0]][path[1]]);
  return values.some((value) => value === UNKNOWN) ? UNKNOWN : values.reduce((sum, value) => sum + value, 0);
}

/** Deterministically summarize records without passing, failing, skipping, or changing a gate. */
export function summarizeSdlcEfficiencyMetrics(records) {
  if (!Array.isArray(records)) return { ok: false, code: "SEM-RECORDS", summary: null };
  const ids = new Set();
  const gateCycles = new Set();
  for (const record of records) {
    const valid = validateSdlcEfficiencyMetric(record);
    if (!valid.ok) return { ok: false, code: valid.code, summary: null };
    if (ids.has(record.metricId)) return { ok: false, code: "SEM-DUPLICATE-METRIC", summary: null };
    ids.add(record.metricId);
    const gateCycle = `${record.cycleId}\u0000${record.gateId}`;
    if (gateCycles.has(gateCycle)) return { ok: false, code: "SEM-DUPLICATE-GATE-CYCLE", summary: null };
    gateCycles.add(gateCycle);
  }
  const ordered = [...records].sort((left, right) => left.metricId.localeCompare(right.metricId));
  const byOutcome = Object.fromEntries(OUTCOMES.map((outcome) => [outcome, 0]));
  for (const record of ordered) byOutcome[record.gate.outcome] += 1;
  const totals = {
    wallDurationMs: total(ordered, ["timing", "wallDurationMs"]),
    queueDurationMs: total(ordered, ["timing", "queueDurationMs"]),
    remoteRoundtripDurationMs: total(ordered, ["timing", "remoteRoundtripDurationMs"]),
    inputBytes: total(ordered, ["usage", "inputBytes"]), outputBytes: total(ordered, ["usage", "outputBytes"]), contextBytes: total(ordered, ["usage", "contextBytes"]),
    inputTokens: total(ordered, ["usage", "inputTokens"]), outputTokens: total(ordered, ["usage", "outputTokens"]), contextTokens: total(ordered, ["usage", "contextTokens"]),
  };
  return { ok: true, code: "SEM-SUMMARIZED", summary: { schema: "pipeline.sdlc-efficiency-metrics-summary.v1", metricIds: ordered.map((record) => record.metricId), recordCount: ordered.length, byOutcome, totals } };
}

export const summarizeEfficiencyMetrics = summarizeSdlcEfficiencyMetrics;
