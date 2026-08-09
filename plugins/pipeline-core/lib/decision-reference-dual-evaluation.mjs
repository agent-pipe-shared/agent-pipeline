// SPDX-License-Identifier: SUL-1.0
/**
 * decision-reference-dual-evaluation — H-AC-12's shared "dual-evaluate during
 * migration" primitive.
 *
 * WHY THIS FILE EXISTS
 *   H-AC-12 (specs/sprint-phoenix-epic/acceptance.md) requires that every direct
 *   reader of human authority "dual-evaluate during migration, fail on
 *   disagreement, and carry the shared compatibility owner and expiry." Two
 *   integration points need exactly this primitive today: `hooks/guard-
 *   devplan.mjs` (a legacy/v2/v4 plan-approval path that currently has only ONE
 *   evaluation, no ledger cross-check at all) and `lib/change-control.mjs` (a
 *   pure gate evaluator that currently trusts `pipelineAuthority.granted` alone,
 *   no `decisionId` concept). Both need "old-path reader says X, ledger-backed
 *   reader says Y, fail closed unless X === Y" -- this module is that ONE
 *   shared function, not duplicated per call site.
 *
 * SHAPE REUSE
 *   `isDecisionReference` validates the SAME `pipeline.human-decision-
 *   reference.v1` shape guard-devplan.mjs's `hasLedgerBackedPlanApproval` and
 *   `lib/plan-spec-state-v2.mjs`'s `validHumanDecisionReference` already
 *   validate (schema/decisionId/decisionDigest/candidate/checkpoint) -- a THIRD
 *   copy of the same shape check, not a new one, so every reader of a
 *   `humanDecision`-style reference agrees on what "well-formed" means.
 *
 * FAIL-CLOSED, NEVER A CRASH
 *   A malformed `reference` (present but not shaped like
 *   `pipeline.human-decision-reference.v1`) never throws: it resolves as
 *   "the ledger-backed reader disagrees" (ledgerOk: false), which -- combined
 *   with a `legacyOk: true` old-path verdict -- is exactly a disagreement, and
 *   disagreement fails closed. State data is externally influenced; a hook or
 *   gate crashing on malformed State would be a worse failure mode than
 *   blocking and naming the disagreement.
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO
 *   It never performs I/O (no ledger reads, no subprocess spawns). Resolving a
 *   reference against the canonical ledger is each call site's own concern
 *   (guard-devplan.mjs already owns a `spawnSync` into
 *   `scripts/governance-authority.mjs`; change-control.mjs is a pure evaluator
 *   with no I/O at all). Callers therefore pass EITHER an already-resolved
 *   `ledgerOk` boolean (change-control.mjs's pattern -- mirrors how it already
 *   receives `externalReceipt` pre-resolved) OR a `resolveReference(reference)`
 *   callback the caller controls (guard-devplan.mjs's pattern).
 *
 * COMPATIBILITY OWNER + EXPIRY
 *   `MIGRATION_COMPAT` is carried STRUCTURALLY on every evaluation result (a
 *   closed `{ owner, expiresAtEpochMs }` object, not a comment) per H-AC-12's
 *   text. This dispatch deliberately keeps `expiresAtEpochMs` as tracked
 *   metadata, not a runtime enforcement branch: nothing today writes a
 *   `humanDecision`-shaped reference for a legacy/v2/v4 plan approval, or a
 *   `decisionReference` for a change-control pipelineAuthority, so making
 *   expiry auto-flip enforcement (e.g. "absent reference blocks after the
 *   expiry date") would fail every such consumer the day it passes with no
 *   corresponding writer change -- `harness/scripts/pipeline-state.mjs` and any
 *   change-control caller are explicitly out of this dispatch's scope. Whoever
 *   owns closing H-AC-12 fully reads `owner`/`expiresAtEpochMs` off every
 *   evaluation result to track the migration window; this primitive does not
 *   silently decide unilaterally that the window has closed.
 *
 * VERIFY: node --test plugins/pipeline-core/lib/decision-reference-dual-evaluation.test.mjs
 */

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const REFERENCE_SCHEMA = "pipeline.human-decision-reference.v1";
const REFERENCE_KEYS = ["schema", "decisionId", "decisionDigest", "candidate", "checkpoint"];

function exact(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

/** The one `pipeline.human-decision-reference.v1` shape check every direct reader shares. */
export function isDecisionReference(value) {
  return exact(value, REFERENCE_KEYS)
    && value.schema === REFERENCE_SCHEMA
    && typeof value.decisionId === "string" && ID.test(value.decisionId)
    && SHA256.test(value.decisionDigest ?? "")
    && exact(value.candidate, ["commit", "tree"])
    && OID.test(value.candidate.commit ?? "")
    && OID.test(value.candidate.tree ?? "")
    && exact(value.checkpoint, ["repositoryFingerprint", "streamId", "sequence", "eventDigest", "candidateCommit", "candidateTree"])
    && SHA256.test(value.checkpoint.repositoryFingerprint ?? "")
    && value.checkpoint.streamId === "human"
    && Number.isSafeInteger(value.checkpoint.sequence) && value.checkpoint.sequence > 0
    && SHA256.test(value.checkpoint.eventDigest ?? "")
    && value.checkpoint.candidateCommit === value.candidate.commit
    && value.checkpoint.candidateTree === value.candidate.tree;
}

/**
 * H-AC-12's shared compatibility owner + expiry, carried on every evaluation
 * result this module returns. See file header "COMPATIBILITY OWNER + EXPIRY"
 * for why expiry is tracked metadata here rather than a runtime branch.
 */
export const MIGRATION_COMPAT = Object.freeze({
  owner: "pipeline",
  expiresAtEpochMs: Date.parse("2027-02-09T00:00:00.000Z"),
});

/**
 * The shared "dual-evaluate during migration" primitive. Given an old-path
 * (`legacyOk`) verdict and an OPTIONAL decision reference, this either:
 *   - `reference` absent (undefined/null): only one reader exists yet for this
 *     record -- returns the old-path verdict unchanged (`agreement: null`
 *     marks "no second reader consulted", never silently treated as
 *     agreement).
 *   - `reference` present: resolves a second, ledger-backed verdict (from the
 *     caller-supplied `ledgerOk`, or by invoking `resolveReference(reference)`
 *     when `ledgerOk` is not already known) and requires it to match
 *     `legacyOk`. Disagreement -- in EITHER direction -- fails closed
 *     (`ok: false`), never just "trust whichever reader is more permissive".
 *
 * `legacyOk` and `compat` are caller-controlled and MUST be well-formed --
 * this is a programmer contract (a TypeError here means a caller bug, not
 * externally-influenced State data, unlike `reference` itself).
 */
export function dualEvaluateDecisionReference({ legacyOk, reference, ledgerOk, resolveReference, compat = MIGRATION_COMPAT } = {}) {
  if (typeof legacyOk !== "boolean") {
    throw new TypeError("dualEvaluateDecisionReference: legacyOk must be a boolean");
  }
  if (!exact(compat, ["owner", "expiresAtEpochMs"]) || typeof compat.owner !== "string" || compat.owner === ""
    || !Number.isSafeInteger(compat.expiresAtEpochMs)) {
    throw new TypeError("dualEvaluateDecisionReference: compat must be a closed { owner, expiresAtEpochMs } object");
  }
  if (reference === undefined || reference === null) {
    return Object.freeze({ ok: legacyOk, agreement: null, legacyOk, ledgerOk: null, compat });
  }
  const ledgerVerdict = !isDecisionReference(reference)
    ? false // malformed reference never resolves -- fail closed, never a crash (see file header)
    : typeof ledgerOk === "boolean"
      ? ledgerOk
      : Boolean(typeof resolveReference === "function" && resolveReference(reference));
  const agreement = legacyOk === ledgerVerdict;
  return Object.freeze({ ok: agreement && legacyOk, agreement, legacyOk, ledgerOk: ledgerVerdict, compat });
}
