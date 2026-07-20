// SPDX-License-Identifier: Apache-2.0

/**
 * Pure HAW-0 state transitions for binding an existing approval to its Spec
 * and for recording a bound revocation. The pipeline-state writer owns locks,
 * filesystem I/O and command routing; this module owns only closed values.
 */
import { createHash } from "node:crypto";

const APPROVAL_SCHEMA = "pipeline.plan-approval.v2";
const AUTHORITY_SCHEMA = "pipeline.po-gate-authority.v2";
const REVOCATION_SCHEMA = "pipeline.plan-revocation.v2";
const STATE_SCHEMA = "pipeline.state.v0";
const SHA256 = /^[a-f0-9]{64}$/u;
const AUTHORITY_KEYS = [
  "schema",
  "humanFacing",
  "sourceSha256",
  "runtimeSha256",
  "receiptSha256",
  "repositoryFingerprint",
  "planPath",
  "planSha256",
  "specPath",
  "specSha256",
];
const APPROVAL_KEYS = [
  "schema",
  "approvedBy",
  "approvedAt",
  "specBoundBy",
  "specBoundAt",
  "poGateAuthority",
];
const LEGACY_APPROVAL_KEYS = ["approvedBy", "approvedAt"];
const REVOCATION_KEYS = [
  "schema",
  "planPath",
  "planSha256",
  "specPath",
  "specSha256",
  "revokedBy",
  "revokedAt",
];

function fail(code) {
  return { ok: false, code };
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, keys) {
  return isPlainObject(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isCanonicalIso(value) {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isNonBlankString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isRepositoryPath(value) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.includes("\0")
    || value.includes("\\")
    || value.startsWith("/")
    || /^[A-Za-z]:/u.test(value)
  ) return false;
  return value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

function equalCanonical(left, right) {
  try {
    return canonicalJson(left) === canonicalJson(right);
  } catch {
    return false;
  }
}

/** Repository canonical JSON: recursive lexical keys and JSON scalar bytes. */
export function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new TypeError("canonical JSON accepts safe integers only");
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!isPlainObject(value)) throw new TypeError("canonical JSON accepts plain JSON values only");
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

export function sha256CanonicalJson(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function validAuthority(value) {
  return hasExactKeys(value, AUTHORITY_KEYS)
    && value.schema === AUTHORITY_SCHEMA
    && (value.humanFacing === "de" || value.humanFacing === "en")
    && SHA256.test(value.sourceSha256)
    && SHA256.test(value.runtimeSha256)
    && SHA256.test(value.receiptSha256)
    && SHA256.test(value.repositoryFingerprint)
    && isRepositoryPath(value.planPath)
    && SHA256.test(value.planSha256)
    && isRepositoryPath(value.specPath)
    && SHA256.test(value.specSha256);
}

function validLegacyApproval(value) {
  return hasExactKeys(value, LEGACY_APPROVAL_KEYS)
    && isNonBlankString(value.approvedBy)
    && isCanonicalIso(value.approvedAt);
}

function validV2Approval(value) {
  return hasExactKeys(value, APPROVAL_KEYS)
    && value.schema === APPROVAL_SCHEMA
    && isNonBlankString(value.approvedBy)
    && isCanonicalIso(value.approvedAt)
    && isNonBlankString(value.specBoundBy)
    && isCanonicalIso(value.specBoundAt)
    && validAuthority(value.poGateAuthority);
}

function validV2Revocation(value) {
  return hasExactKeys(value, REVOCATION_KEYS)
    && value.schema === REVOCATION_SCHEMA
    && isRepositoryPath(value.planPath)
    && SHA256.test(value.planSha256)
    && isRepositoryPath(value.specPath)
    && SHA256.test(value.specSha256)
    && isNonBlankString(value.revokedBy)
    && isCanonicalIso(value.revokedAt);
}

function validStateForAuthority(state, authority) {
  return isPlainObject(state)
    && state.schema === STATE_SCHEMA
    && isPlainObject(state.activeFeature)
    && isNonBlankString(state.activeFeature.id)
    && state.activeFeature.planPath === authority.planPath;
}

function currentStateMatches(state, expectedStateSha256) {
  if (!SHA256.test(expectedStateSha256)) return false;
  try {
    return sha256CanonicalJson(state) === expectedStateSha256;
  } catch {
    return false;
  }
}

function matchingAuthority(authority, expectedPlanSha256, expectedSpecSha256) {
  return validAuthority(authority)
    && SHA256.test(expectedPlanSha256)
    && SHA256.test(expectedSpecSha256)
    && authority.planSha256 === expectedPlanSha256
    && authority.specSha256 === expectedSpecSha256;
}

function matchingRevocation(revocation, approval) {
  return validV2Revocation(revocation)
    && revocation.planPath === approval.poGateAuthority.planPath
    && revocation.planSha256 === approval.poGateAuthority.planSha256
    && revocation.specPath === approval.poGateAuthority.specPath
    && revocation.specSha256 === approval.poGateAuthority.specSha256;
}

/**
 * Atomically-ready pure transition from one exact legacy plan approval to v2.
 * Callers must apply the returned state under their existing writer lock.
 */
export function bindPlanSpecApproval({
  state,
  expectedStateSha256,
  poGateAuthority,
  expectedPlanSha256,
  expectedSpecSha256,
  by,
  at,
}) {
  if (!currentStateMatches(state, expectedStateSha256)) return fail("PS-V2-STATE-STALE");
  if (!matchingAuthority(poGateAuthority, expectedPlanSha256, expectedSpecSha256)) return fail("PS-V2-AUTHORITY-INVALID");
  if (!validStateForAuthority(state, poGateAuthority) || state.planApproved !== true) return fail("PS-V2-APPROVAL-INVALID");
  if (!isNonBlankString(by) || !isCanonicalIso(at)) return fail("PS-V2-BIND-REQUEST-INVALID");
  if (Object.prototype.hasOwnProperty.call(state, "planRevocation")) return fail("PS-V2-REVOCATION-CONFLICT");

  const approval = state.planApproval;
  if (validV2Approval(approval)) {
    if (
      !equalCanonical(approval.poGateAuthority, poGateAuthority)
      || approval.specBoundBy !== by
      || approval.specBoundAt !== at
    ) return fail("PS-V2-BIND-CONFLICT");
    return { ok: true, replay: true, state, approval };
  }
  if (!validLegacyApproval(approval)) return fail("PS-V2-LEGACY-APPROVAL-INVALID");

  const bound = {
    schema: APPROVAL_SCHEMA,
    approvedBy: approval.approvedBy,
    approvedAt: approval.approvedAt,
    specBoundBy: by,
    specBoundAt: at,
    poGateAuthority,
  };
  return {
    ok: true,
    replay: false,
    state: { ...state, planApproved: true, planApproval: bound },
    approval: bound,
  };
}

/**
 * Pure v2-only revocation. Legacy approvals/revocations are history, never an
 * authorization source for this transition.
 */
export function revokePlanV2({
  state,
  expectedStateSha256,
  expectedPlanSha256,
  expectedSpecSha256,
  by,
  at,
}) {
  if (!currentStateMatches(state, expectedStateSha256)) return fail("PS-V2-STATE-STALE");
  if (!isNonBlankString(by) || !isCanonicalIso(at)) return fail("PS-V2-REVOCATION-REQUEST-INVALID");
  const approval = state?.planApproval;
  if (!validV2Approval(approval)) return fail("PS-V2-APPROVAL-INVALID");
  const authority = approval.poGateAuthority;
  if (
    !matchingAuthority(authority, expectedPlanSha256, expectedSpecSha256)
    || !validStateForAuthority(state, authority)
  ) return fail("PS-V2-AUTHORITY-INVALID");

  if (Object.prototype.hasOwnProperty.call(state, "planRevocation")) {
    const revocation = state.planRevocation;
    if (
      state.planApproved !== false
      || !matchingRevocation(revocation, approval)
      || revocation.revokedBy !== by
      || revocation.revokedAt !== at
    ) return fail("PS-V2-REVOCATION-CONFLICT");
    return {
      ok: true,
      replay: true,
      state,
      revocation,
      planRevocationSha256: sha256CanonicalJson(revocation),
    };
  }
  if (state.planApproved !== true) return fail("PS-V2-APPROVAL-INVALID");

  const revocation = {
    schema: REVOCATION_SCHEMA,
    planPath: authority.planPath,
    planSha256: authority.planSha256,
    specPath: authority.specPath,
    specSha256: authority.specSha256,
    revokedBy: by,
    revokedAt: at,
  };
  return {
    ok: true,
    replay: false,
    state: { ...state, planApproved: false, planRevocation: revocation },
    revocation,
    planRevocationSha256: sha256CanonicalJson(revocation),
  };
}
