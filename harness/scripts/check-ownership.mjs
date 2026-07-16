/** Validate a shadow-only ownership map; this module never alters gate configuration. */
export const CHECK_OWNERSHIP_SCHEMA = "pipeline.check-ownership.v1";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const ROOT_KEYS = new Set(["schema", "candidate", "mandatoryCheckIds", "checks", "overlaps"]);
const CANDIDATE_KEYS = new Set(["commit", "tree"]);
const CHECK_KEYS = new Set(["checkId", "owner", "errorClass", "assertionFingerprint", "evidenceIds"]);
const OVERLAP_KEYS = new Set(["leftCheckId", "rightCheckId", "leftAssertionFingerprint", "rightAssertionFingerprint", "overlapFingerprint", "evidenceIds"]);
const OWNERS = new Set(["deterministic-verify", "semantic-critic", "trajectory-critic", "human-risk"]);

function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) { return object(value) && Object.keys(value).length === keys.size && Object.keys(value).every((key) => keys.has(key)); }
function id(value) { return typeof value === "string" && ID.test(value); }
function sha(value) { return typeof value === "string" && SHA256.test(value); }
function oid(value) { return typeof value === "string" && OID.test(value); }
function evidence(value) { return Array.isArray(value) && value.length > 0 && value.length <= 128 && value.every(id) && new Set(value).size === value.length; }
function pair(left, right) { return `${left}\u0000${right}`; }

/** Return all validation findings; a map must be complete and unambiguous to pass. */
export function validateCheckOwnershipMap(value) {
  const findings = [];
  if (!exact(value, ROOT_KEYS) || value.schema !== CHECK_OWNERSHIP_SCHEMA) return { ok: false, code: "COM-INVALID", findings: ["map must use the closed ownership schema"] };
  if (!exact(value.candidate, CANDIDATE_KEYS) || !oid(value.candidate.commit) || !oid(value.candidate.tree)) findings.push("candidate must bind exact commit and tree OIDs");
  if (!Array.isArray(value.mandatoryCheckIds) || value.mandatoryCheckIds.length === 0 || value.mandatoryCheckIds.length > 512 || !value.mandatoryCheckIds.every(id) || new Set(value.mandatoryCheckIds).size !== value.mandatoryCheckIds.length) findings.push("mandatoryCheckIds must be a non-empty duplicate-free closed ID list");
  if (!Array.isArray(value.checks) || value.checks.length === 0 || value.checks.length > 512) findings.push("checks must be a non-empty bounded array");
  const checks = new Map();
  for (const check of Array.isArray(value.checks) ? value.checks : []) {
    if (!exact(check, CHECK_KEYS) || !id(check.checkId) || !OWNERS.has(check.owner) || !id(check.errorClass) || !sha(check.assertionFingerprint) || !evidence(check.evidenceIds)) {
      findings.push("checks must have closed ID/owner/error-class/fingerprint/evidence fields");
      continue;
    }
    if (checks.has(check.checkId)) findings.push("checkId must have exactly one owner");
    else checks.set(check.checkId, check);
  }
  const mandatory = new Set(Array.isArray(value.mandatoryCheckIds) ? value.mandatoryCheckIds : []);
  for (const checkId of mandatory) if (!checks.has(checkId)) findings.push("every mandatory check must have one ownership entry");
  for (const checkId of checks.keys()) if (!mandatory.has(checkId)) findings.push("ownership entries must not introduce a non-mandatory check");

  if (!Array.isArray(value.overlaps) || value.overlaps.length > 4096) findings.push("overlaps must be a bounded array");
  const actualPairs = new Set();
  for (const overlap of Array.isArray(value.overlaps) ? value.overlaps : []) {
    if (!exact(overlap, OVERLAP_KEYS) || !id(overlap.leftCheckId) || !id(overlap.rightCheckId)
      || !sha(overlap.leftAssertionFingerprint) || !sha(overlap.rightAssertionFingerprint) || !sha(overlap.overlapFingerprint) || !evidence(overlap.evidenceIds)) {
      findings.push("overlaps must have closed endpoints, exact fingerprints, and evidence IDs");
      continue;
    }
    if (overlap.leftCheckId >= overlap.rightCheckId) { findings.push("overlap endpoints must be unique and lexically ordered"); continue; }
    const left = checks.get(overlap.leftCheckId);
    const right = checks.get(overlap.rightCheckId);
    if (!left || !right || left.assertionFingerprint !== overlap.leftAssertionFingerprint || right.assertionFingerprint !== overlap.rightAssertionFingerprint
      || overlap.leftAssertionFingerprint !== overlap.rightAssertionFingerprint || overlap.overlapFingerprint !== overlap.leftAssertionFingerprint) {
      findings.push("overlap fingerprints must exactly match two known identical assertions");
      continue;
    }
    const key = pair(overlap.leftCheckId, overlap.rightCheckId);
    if (actualPairs.has(key)) findings.push("an overlap pair may be reported once");
    actualPairs.add(key);
  }
  const byFingerprint = new Map();
  for (const check of checks.values()) {
    const group = byFingerprint.get(check.assertionFingerprint) ?? [];
    group.push(check.checkId);
    byFingerprint.set(check.assertionFingerprint, group);
  }
  for (const group of byFingerprint.values()) {
    group.sort();
    for (let left = 0; left < group.length; left += 1) for (let right = left + 1; right < group.length; right += 1) {
      if (!actualPairs.has(pair(group[left], group[right]))) findings.push("every identical assertion fingerprint must be reported as an overlap");
    }
  }
  return { ok: findings.length === 0, code: findings.length === 0 ? "COM-VALID" : "COM-INVALID", findings };
}

/** Produce a stable overlap report. It records overlaps only and never removes a check or owner. */
export function reportCheckOwnershipOverlaps(value) {
  const valid = validateCheckOwnershipMap(value);
  if (!valid.ok) return { ok: false, code: valid.code, overlaps: [], findings: valid.findings };
  const overlaps = value.overlaps.map((overlap) => ({
    checkIds: [overlap.leftCheckId, overlap.rightCheckId],
    assertionFingerprint: overlap.overlapFingerprint,
    evidenceIds: [...overlap.evidenceIds].sort(),
  })).sort((left, right) => left.checkIds.join("\u0000").localeCompare(right.checkIds.join("\u0000")));
  return { ok: true, code: "COM-OVERLAPS-REPORTED", overlaps, findings: [] };
}

export const checkOwnershipMap = validateCheckOwnershipMap;
