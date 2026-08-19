// SPDX-License-Identifier: SUL-1.0
/**
 * Closed-shape validation for the restricted machine-local attribution record
 * (GMW/HGO design D-1, increment 2).
 *
 * This is the record H-AC-11 describes as the "separately protected
 * machine-local decision record": it is never admitted portably (governance
 * schema/store enforce `storageProfile: "restricted-machine-local"` only, see
 * governance-event.mjs and governance-event-store.mjs) and it carries exactly
 * the two values the portable payload structurally excludes (§5.1 of
 * specs/sprint-phoenix-epic/design/gmw-hgo-evidence-intake-into-the-human-ledger.md):
 * the free-text rationale and the trust anchor's {keyReference,
 * publicKeySha256} pair. Both are safe here only because this store is
 * encrypted at rest, machine-local, and erasable -- the opposite of the
 * append-only, world-readable portable ledger.
 *
 * §5.2 R-2 forbids every record-level correlator crossing between this zone
 * and the portable one: no decisionId, eventId, idempotencyKey, intent
 * digest, subject digest, nonce, candidate, artifact digest, or exact
 * timestamp. This shape has no field for any of those -- there is nothing
 * left to carry one -- and `timeBucketEpochMs` is checked against a fixed
 * bucket size so an exact timestamp cannot be smuggled in disguised as one.
 */
import { HumanGovernanceLedgerError } from "./human-governance-decision.mjs";

export const HUMAN_DECISION_ATTRIBUTION_SCHEMA = "pipeline.human-decision-attribution.v1";

/** One day. §5.2 R-2's "no exact timestamp" enforced structurally. */
export const ATTRIBUTION_TIME_BUCKET_MS = 86_400_000;

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const CODE = /^[A-Z][A-Z0-9._:-]{0,127}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
// critical-human-proof-policy.mjs:213, kept as a pinned copy for the same
// reason guard-authority-ledger-intake.mjs pins LIFTABLE_TP_PREFIX: the
// literal is duplicated rather than requesting a widened export surface from
// a module another session owns.
const KEY_REFERENCE = /^[A-Za-z0-9._:@/-]{1,200}$/u;
const AUTHORITIES = new Set(["product-owner", "delegated-reviewer", "security-reviewer", "privacy-reviewer"]);
const ASSURANCE = new Set(["locally-attributed", "externally-attested", "unknown"]);
const PACKAGE_IDS = new Set(["guard-maintenance-window", "human-guard-override"]);
const MAX_RATIONALE_LENGTH = 4096;

function fail(code, message) { throw new HumanGovernanceLedgerError(code, message); }
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) { return record(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }

function isUnicodeScalarString(value) {
  if (typeof value !== "string") return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const low = value.charCodeAt(index + 1);
      if (!(low >= 0xdc00 && low <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

/**
 * Validates one restricted attribution payload.
 *
 * Rejects an unknown key, a package/authority/assurance value outside the
 * closed sets, a malformed key reference or key digest, an empty or
 * oversized rationale, and a time value that is not day-bucketed.
 */
export function validateHumanDecisionAttribution(payload) {
  const keys = ["schema", "packageId", "authorityClass", "identityAssurance", "reasonCode", "rationale", "keyReference", "publicKeySha256", "timeBucketEpochMs"];
  if (!exact(payload, keys) || payload.schema !== HUMAN_DECISION_ATTRIBUTION_SCHEMA) fail("HDA-SHAPE", "The attribution payload does not carry the closed nine-key shape.");
  if (!PACKAGE_IDS.has(payload.packageId)) fail("HDA-SHAPE", "packageId must be guard-maintenance-window or human-guard-override.");
  if (!AUTHORITIES.has(payload.authorityClass)) fail("HDA-SHAPE", "authorityClass is not a recognised authority class.");
  if (!ASSURANCE.has(payload.identityAssurance)) fail("HDA-SHAPE", "identityAssurance is not a recognised assurance class.");
  if (typeof payload.reasonCode !== "string" || !CODE.test(payload.reasonCode)) fail("HDA-SHAPE", "reasonCode must be a stable upper-case code.");

  if (typeof payload.rationale !== "string" || payload.rationale.length === 0 || payload.rationale.length > MAX_RATIONALE_LENGTH || !isUnicodeScalarString(payload.rationale)) {
    fail("HDA-RATIONALE", "rationale must be a non-empty Unicode-scalar string of at most 4096 characters.");
  }
  if (typeof payload.keyReference !== "string" || !KEY_REFERENCE.test(payload.keyReference)) {
    fail("HDA-KEY-REFERENCE", "keyReference does not match the trust anchor's key-reference pattern.");
  }
  if (typeof payload.publicKeySha256 !== "string" || !SHA256.test(payload.publicKeySha256)) {
    fail("HDA-DIGEST", "publicKeySha256 must be a sha-256 hex digest.");
  }
  if (!Number.isSafeInteger(payload.timeBucketEpochMs) || payload.timeBucketEpochMs < 0 || payload.timeBucketEpochMs % ATTRIBUTION_TIME_BUCKET_MS !== 0) {
    fail("HDA-TIME-BUCKET", "timeBucketEpochMs must be a non-negative multiple of ATTRIBUTION_TIME_BUCKET_MS.");
  }

  return Object.freeze({ ...payload });
}

/** True for a payload that declares itself a restricted attribution record, before validation. */
export function isHumanDecisionAttribution(value) {
  return record(value) && value.schema === HUMAN_DECISION_ATTRIBUTION_SCHEMA;
}

export { HumanGovernanceLedgerError };
