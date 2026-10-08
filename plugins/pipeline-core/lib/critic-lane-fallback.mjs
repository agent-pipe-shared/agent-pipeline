// Codex Critic lane fallback decision (design note
// specs/sprint-alfred-epic/design/codex-critic-lane-2026-10-08.md section 4).
// Pure: no I/O. N1 = B (the receipt carries only digests of the native lane
// records); N2 = B (the decision reads the persisted selection's preflight.terminalCode).

export const LANE_NATIVE = "codex-sandbox-selected";
export const LANE_FALLBACK = "claude-fresh-session";

export const CLF_CODES = Object.freeze([
  "CLF-HOST-UNSUPPORTED",
  "CLF-PROFILE-UNAVAILABLE",
  "CLF-PREFLIGHT-FAILED",
  "CLF-EVIDENCE-STALE",
  "CLF-RULESET-UNAVAILABLE",
  "CLF-SELECTION-UNREADABLE",
]);

const TERMINAL_CODE_MAP = Object.freeze({
  "profile-unavailable": "CLF-PROFILE-UNAVAILABLE",
  "network-unavailable": "CLF-PROFILE-UNAVAILABLE",
  "child-stdio-error": "CLF-PREFLIGHT-FAILED",
  "host-error": "CLF-PREFLIGHT-FAILED",
});

const FAILURE_CLASS_MAP = Object.freeze({
  "policy-drift": "CLF-HOST-UNSUPPORTED",
  "host-unsupported": "CLF-HOST-UNSUPPORTED",
  "evidence-stale": "CLF-EVIDENCE-STALE",
  "preflight-failed": "CLF-PREFLIGHT-FAILED",
  "profile-drift": "CLF-PROFILE-UNAVAILABLE",
  "host-mode-unavailable": "CLF-PROFILE-UNAVAILABLE",
});

const own = (table, key) => (typeof key === "string" && Object.hasOwn(table, key) ? table[key] : null);
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const SHA256 = /^[a-f0-9]{64}$/u;

function verdict(selected, code) {
  const selectionId = selected?.selectionId ?? null;
  if (code === null) return { fallback: false, code: null, from: LANE_NATIVE, to: LANE_NATIVE, selectionId };
  return { fallback: true, code, from: LANE_NATIVE, to: LANE_FALLBACK, selectionId };
}

export function decideCriticLaneFallback({ selected, selection } = {}) {
  if (!isObject(selected)) return verdict(null, "CLF-SELECTION-UNREADABLE");
  if (selected.childStarted === true) return verdict(selected, null);
  if (selected.preLaunchCode === "selected-critic-role-dispatch-rejected") return verdict(selected, "CLF-RULESET-UNAVAILABLE");
  if (selected.status === "selected") return verdict(selected, null);
  if (!isObject(selection) || typeof selected.selectionId !== "string" || selection.selectionId !== selected.selectionId) {
    return verdict(selected, "CLF-SELECTION-UNREADABLE");
  }
  const failureClass = selection.failureClass ?? selected.failureClass;
  const hostClass = failureClass === "policy-drift" || failureClass === "host-unsupported";
  const code = (hostClass ? own(FAILURE_CLASS_MAP, failureClass) : null)
    ?? own(TERMINAL_CODE_MAP, selection.preflight?.terminalCode)
    ?? own(FAILURE_CLASS_MAP, failureClass);
  return verdict(selected, code ?? "CLF-SELECTION-UNREADABLE");
}

export function buildLaneRecord({ requested, used, platformClass = null, filesystemClass = null, selectionSha256 = null, executionReceiptSha256 = null, fallback = null } = {}) {
  return {
    schema: "pipeline.critic-lane-record.v1",
    requested,
    used,
    assuranceClass: used === LANE_NATIVE ? "sandboxed" : "fresh-session",
    platformClass,
    filesystemClass,
    selectionSha256,
    executionReceiptSha256,
    fallback: fallback === null || fallback === undefined ? null : {
      code: fallback.code,
      from: fallback.from,
      to: fallback.to,
      selectionId: fallback.selectionId,
      failureClass: fallback.failureClass ?? null,
      terminalCode: fallback.terminalCode ?? null,
    },
  };
}

export function validateLaneRecord(laneRecord, expected = {}) {
  const fail = (code) => ({ ok: false, code });
  if (!isObject(laneRecord)) return fail("CLF-LANE-RECORD-MISSING");
  if (laneRecord.schema !== "pipeline.critic-lane-record.v1") return fail("CLF-LANE-RECORD-SCHEMA");
  if (laneRecord.requested !== LANE_NATIVE || (laneRecord.used !== LANE_NATIVE && laneRecord.used !== LANE_FALLBACK)) return fail("CLF-LANE-RECORD-LANE");
  if (laneRecord.used === LANE_FALLBACK) {
    const f = laneRecord.fallback;
    if (laneRecord.assuranceClass !== "fresh-session") return fail("CLF-LANE-RECORD-ASSURANCE");
    if (!isObject(f) || !CLF_CODES.includes(f.code) || f.from !== LANE_NATIVE || f.to !== LANE_FALLBACK || typeof f.selectionId !== "string" || f.selectionId === "") return fail("CLF-LANE-RECORD-FALLBACK");
  } else {
    if (laneRecord.fallback !== null) return fail("CLF-LANE-RECORD-FALLBACK");
    if (laneRecord.assuranceClass !== "sandboxed") return fail("CLF-LANE-RECORD-ASSURANCE");
    if (!SHA256.test(laneRecord.selectionSha256 ?? "") || !SHA256.test(laneRecord.executionReceiptSha256 ?? "")) return fail("CLF-LANE-RECORD-DIGEST");
  }
  for (const key of ["selectionSha256", "executionReceiptSha256"]) {
    if (expected[key] !== undefined && laneRecord[key] !== expected[key]) return fail("CLF-LANE-RECORD-DIGEST-MISMATCH");
  }
  return { ok: true, code: null };
}
