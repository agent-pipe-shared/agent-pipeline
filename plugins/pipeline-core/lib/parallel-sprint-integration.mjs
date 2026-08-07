// SPDX-License-Identifier: SUL-1.0

import { createHash } from "node:crypto";

/**
 * Pure policy for integrating parallel Sprint candidates.
 *
 * The caller supplies Git observations and persists any accepted receipt. This
 * module never invokes Git, changes a ref, rebases a candidate, or writes State.
 */

export const PARALLEL_SPRINT_INTEGRATION_INPUT_SCHEMA = "pipeline.parallel-sprint-integration-input.v1";
export const PARALLEL_SPRINT_INTEGRATION_RECEIPT_SCHEMA = "pipeline.parallel-sprint-integration-receipt.v1";
export const PARALLEL_SPRINT_IMPACT_REVIEW_SCHEMA = "pipeline.parallel-sprint-impact-review.v1";
export const PARALLEL_SPRINT_SELECTION_SCHEMA = "pipeline.parallel-sprint-selection.v1";

export const PARALLEL_SPRINT_DISPOSITIONS = Object.freeze({
  BASELINE_CURRENT: "baseline-current",
  BASELINE_STALE_DEFERRED: "baseline-stale-deferred",
  BASELINE_IMPACT_REVIEW_REQUIRED: "baseline-impact-review-required",
  REBASE_REQUIRED_FOR_PROMOTION: "rebase-required-for-promotion",
});

export const PARALLEL_SPRINT_RECOVERY_ACTIONS = Object.freeze({
  BASELINE_REPAIR: "baseline-repair",
  WRITE_SET_REPAIR: "write-set-repair",
  IMPACT_REVIEW_RECEIPT: "impact-review-receipt",
  PROMOTION_REBASE: "promotion-rebase",
  RESUME_INTERRUPTED: "resume-interrupted",
});

// Git supports SHA-1 and SHA-256 repositories. Intermediate lengths are not
// full object identities and must not be admitted as exact evidence.
const GIT_OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const SAFE_TAG = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/u;
const IMPACT_SURFACES = new Set([
  "security",
  "release",
  "guard",
  "config",
  "permission",
  "bootstrap",
  "install",
  "runtime",
  "native-readback",
  "compatibility",
  "write-set",
]);
const IMPACT_DECISIONS = new Set(["compatible", "defer", "material-incompatibility"]);
const PROMOTION_REASONS = new Set(["merge-ready-candidate", "protected-surface", "material-incompatibility"]);
const INTERRUPTED_KINDS = new Set(Object.values(PARALLEL_SPRINT_RECOVERY_ACTIONS));

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return isObject(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function canonicalJson(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!isObject(value)) throw new TypeError("non-JSON value");
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

/** Digest helper for callers constructing confirmed receipts from a plan. */
export function digestParallelSprintValue(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function inputDigest(input) {
  try {
    const bound = isObject(input) ? { ...input, interrupted: "none" } : input;
    return digestParallelSprintValue(bound);
  } catch {
    // A non-JSON/cyclic input cannot be a portable request. Bind the diagnostic
    // action to a fixed invalid-input sentinel instead of throwing.
    return digestParallelSprintValue({ invalidPortableInput: true });
  }
}

function canonicalPath(value) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 512
    && value.trim() === value
    && value !== "."
    && !value.includes("\\")
    && !value.includes("\0")
    && !/[?*[\]]/u.test(value)
    && !value.startsWith("/")
    && !/^[A-Za-z]:/u.test(value)
    && !value.startsWith("./")
    && !value.endsWith("/")
    && !value.split("/").some((part) => part === "" || part === "." || part === "..");
}

function canonicalList(value, valid) {
  if (!Array.isArray(value)) return null;
  const sorted = [...value].sort();
  return sorted.every(valid) && new Set(sorted).size === sorted.length ? sorted : null;
}

function overlaps(left, right) {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function writeSetsOverlap(left, right) {
  return left.some((leftPath) => right.some((rightPath) => overlaps(leftPath, rightPath)));
}

function normalizedBaseline(value) {
  if (!hasExactKeys(value, ["kind", "ref", "commit", "tree"])) return null;
  if (!GIT_OID.test(value.commit) || !GIT_OID.test(value.tree) || value.commit.length !== value.tree.length) return null;
  if (value.kind === "release-tag") {
    return typeof value.ref === "string" && SAFE_TAG.test(value.ref) ? { ...value } : null;
  }
  if (value.kind === "main-commit") return value.ref === "main" ? { ...value } : null;
  return null;
}

function sameBaseline(left, right) {
  return left.kind === right.kind
    && left.ref === right.ref
    && left.commit === right.commit
    && left.tree === right.tree;
}

function normalizeAdvance(value) {
  if (!hasExactKeys(value, ["kind", "baseline", "writeSet", "surfaces"])) {
    return { ok: false, code: "PSI-ADVANCE-MISSING-OR-INCONSISTENT" };
  }
  if (value.kind === "none") {
    return value.baseline === null && Array.isArray(value.writeSet) && value.writeSet.length === 0
      && Array.isArray(value.surfaces) && value.surfaces.length === 0
      ? { ok: true, value: { kind: "none", baseline: null, writeSet: [], surfaces: [] } }
      : { ok: false, code: "PSI-ADVANCE-NONE-INCONSISTENT" };
  }
  if (value.kind !== "ordinary") return { ok: false, code: "PSI-ADVANCE-KIND-UNKNOWN" };
  const baseline = normalizedBaseline(value.baseline);
  const writeSet = canonicalList(value.writeSet, canonicalPath);
  if (baseline === null) return { ok: false, code: "PSI-ADVANCE-GIT-EVIDENCE-INVALID" };
  if (writeSet === null || writeSet.length === 0) return { ok: false, code: "PSI-ADVANCE-WRITE-SET-INVALID" };
  if (!Array.isArray(value.surfaces) || value.surfaces.some((surface) => typeof surface !== "string")) {
    return { ok: false, code: "PSI-ADVANCE-SURFACES-UNAVAILABLE", reviewRequired: true };
  }
  const surfaces = canonicalList(value.surfaces, (surface) => IMPACT_SURFACES.has(surface));
  if (surfaces === null) return { ok: false, code: "PSI-ADVANCE-SURFACE-UNKNOWN", reviewRequired: true };
  return { ok: true, value: { kind: "ordinary", baseline, writeSet, surfaces } };
}

function makeAction(kind, requestSha256, details = {}) {
  const body = {
    kind,
    mutation: false,
    automaticGit: false,
    requiresConfirmation: true,
    expectedInputSha256: requestSha256,
    ...details,
  };
  return { ...body, actionSha256: digestParallelSprintValue(body) };
}

function sealReceipt(value) {
  return { ...value, receiptSha256: digestParallelSprintValue(value) };
}

function recovery(kind, code, requestSha256, details = {}) {
  return sealReceipt({
    schema: PARALLEL_SPRINT_INTEGRATION_RECEIPT_SCHEMA,
    status: "recovery-required",
    disposition: null,
    code,
    requestSha256,
    repositoryFreshness: "independent-unobserved",
    baselineFreshnessClaim: null,
    mergeReadyClaim: null,
    action: makeAction(kind, requestSha256, details),
  });
}

function baselineRepair(code, requestSha256, details = {}) {
  return recovery(PARALLEL_SPRINT_RECOVERY_ACTIONS.BASELINE_REPAIR, code, requestSha256, {
    required: ["baseline.kind", "baseline.ref", "baseline.commit", "baseline.tree"],
    ...details,
  });
}

function integrationReceipt(disposition, baseline, code, requestSha256, details = {}) {
  return sealReceipt({
    schema: PARALLEL_SPRINT_INTEGRATION_RECEIPT_SCHEMA,
    status: disposition === PARALLEL_SPRINT_DISPOSITIONS.BASELINE_CURRENT
      || disposition === PARALLEL_SPRINT_DISPOSITIONS.BASELINE_STALE_DEFERRED ? "work-permitted" : "blocked",
    disposition,
    code,
    requestSha256,
    baseline,
    repositoryFreshness: "independent-unobserved",
    baselineFreshnessClaim: disposition === PARALLEL_SPRINT_DISPOSITIONS.BASELINE_CURRENT ? "baseline-exact" : null,
    mergeReadyClaim: null,
    action: null,
    ...details,
  });
}

function expectedImpactReview(baseline, advance, candidateWriteSet) {
  const overlap = writeSetsOverlap(candidateWriteSet, advance.writeSet);
  return {
    schema: PARALLEL_SPRINT_IMPACT_REVIEW_SCHEMA,
    baseline,
    observedBaseline: advance.baseline,
    changedSurfaces: advance.surfaces,
    writeSetComparison: {
      candidateWriteSet,
      advanceWriteSet: advance.writeSet,
      overlap,
    },
  };
}

function validateImpactReview(receipt, expected) {
  if (!hasExactKeys(receipt, [
    "schema", "baseline", "observedBaseline", "changedSurfaces", "writeSetComparison",
    "decision", "poExceptionSha256", "confirmed", "receiptSha256",
  ]) || receipt.schema !== PARALLEL_SPRINT_IMPACT_REVIEW_SCHEMA || receipt.confirmed !== true
    || !IMPACT_DECISIONS.has(receipt.decision)
    || !(receipt.poExceptionSha256 === null || SHA256.test(receipt.poExceptionSha256))) return { ok: false, code: "PSI-IMPACT-RECEIPT-INVALID" };
  const { receiptSha256, decision, poExceptionSha256, confirmed, ...observations } = receipt;
  try {
    if (receiptSha256 !== digestParallelSprintValue({ ...observations, decision, poExceptionSha256, confirmed })) {
      return { ok: false, code: "PSI-IMPACT-RECEIPT-DIGEST-MISMATCH" };
    }
    if (canonicalJson(observations) !== canonicalJson(expected)) return { ok: false, code: "PSI-IMPACT-RECEIPT-DRIFT" };
  } catch {
    return { ok: false, code: "PSI-IMPACT-RECEIPT-NONPORTABLE" };
  }
  return { ok: true, decision, poExceptionSha256, receiptSha256 };
}

function validatePromotion(value) {
  if (hasExactKeys(value, ["poSelected", "reason"]) && value.poSelected === false && value.reason === "none") {
    return { ok: true, selected: false };
  }
  if (!hasExactKeys(value, ["poSelected", "reason", "candidate", "selection", "targetMain"])
    || value.poSelected !== true || !PROMOTION_REASONS.has(value.reason)) return { ok: false, code: "PSI-PROMOTION-INVALID" };
  const candidate = value.candidate;
  if (!hasExactKeys(candidate, ["sprintId", "commit", "tree", "approvedScopeSha256", "candidateEvidenceSha256", "gatesSha256", "gatesReady"])
    || !SAFE_ID.test(candidate.sprintId ?? "") || !GIT_OID.test(candidate.commit ?? "") || !GIT_OID.test(candidate.tree ?? "")
    || candidate.commit.length !== candidate.tree.length || !SHA256.test(candidate.approvedScopeSha256 ?? "")
    || !SHA256.test(candidate.candidateEvidenceSha256 ?? "") || !SHA256.test(candidate.gatesSha256 ?? "")
    || candidate.gatesReady !== true) return { ok: false, code: "PSI-PROMOTION-CANDIDATE-NOT-MERGE-READY" };
  const selection = value.selection;
  if (!hasExactKeys(selection, [
    "schema", "sprintId", "candidateCommit", "candidateTree", "firstMergeReady",
    "poAuthoritySha256", "confirmed", "selectionSha256",
  ]) || selection.schema !== PARALLEL_SPRINT_SELECTION_SCHEMA || selection.sprintId !== candidate.sprintId
    || selection.candidateCommit !== candidate.commit || selection.candidateTree !== candidate.tree
    || selection.firstMergeReady !== true || selection.confirmed !== true
    || !SHA256.test(selection.poAuthoritySha256 ?? "")) return { ok: false, code: "PSI-PROMOTION-SELECTION-INVALID" };
  const { selectionSha256, ...selectionBody } = selection;
  if (selectionSha256 !== digestParallelSprintValue(selectionBody)) return { ok: false, code: "PSI-PROMOTION-SELECTION-DIGEST-MISMATCH" };
  const targetMain = normalizedBaseline(value.targetMain);
  if (targetMain === null || targetMain.kind !== "main-commit") return { ok: false, code: "PSI-PROMOTION-TARGET-MAIN-INVALID" };
  if (targetMain.commit.length !== candidate.commit.length) return { ok: false, code: "PSI-PROMOTION-OBJECT-FORMAT-MISMATCH" };
  return { ok: true, selected: true, reason: value.reason, candidate: { ...candidate }, selection: { ...selection }, targetMain };
}

function reconcileInterrupted(interrupted, requestSha256, receipt) {
  if (interrupted === "none") return receipt;
  if (!hasExactKeys(interrupted, ["status", "requestSha256", "actionKind", "actionSha256"])
    || !["pending", "completed"].includes(interrupted.status)
    || !SHA256.test(interrupted.requestSha256 ?? "") || !INTERRUPTED_KINDS.has(interrupted.actionKind)
    || !SHA256.test(interrupted.actionSha256 ?? "")) {
    return recovery(PARALLEL_SPRINT_RECOVERY_ACTIONS.RESUME_INTERRUPTED, "PSI-INTERRUPTED-STATE-INVALID", requestSha256, {
      interrupted: null,
    });
  }
  if (interrupted.status === "completed") {
    return recovery(PARALLEL_SPRINT_RECOVERY_ACTIONS.RESUME_INTERRUPTED, "PSI-INTERRUPTED-COMPLETED-REOBSERVE", requestSha256, {
      interrupted,
    });
  }
  if (interrupted.requestSha256 !== requestSha256 || receipt.action === null
    || interrupted.actionKind !== receipt.action.kind || interrupted.actionSha256 !== receipt.action.actionSha256) {
    return recovery(PARALLEL_SPRINT_RECOVERY_ACTIONS.RESUME_INTERRUPTED, "PSI-INTERRUPTED-BINDING-DRIFT", requestSha256, {
      interrupted,
      currentActionSha256: receipt.action?.actionSha256 ?? null,
    });
  }
  const { receiptSha256: ignored, ...body } = receipt;
  return sealReceipt({ ...body, status: "resumed", code: "PSI-INTERRUPTED-IDEMPOTENT-RESUME" });
}

/**
 * Computes one closed integration disposition from immutable caller-held data.
 * Every returned action is a confirmed, digest/CAS-bound plan only.
 */
export function planParallelSprintIntegration(input) {
  const requestSha256 = inputDigest(input);
  if (!isObject(input) || input.schema !== PARALLEL_SPRINT_INTEGRATION_INPUT_SCHEMA) {
    return baselineRepair("PSI-INPUT-SCHEMA", requestSha256);
  }
  const allowed = [
    "schema", "baseline", "candidateWriteSet", "writeSetScope", "advance",
    "impactReview", "promotion", "interrupted",
  ];
  const required = allowed.filter((key) => key !== "impactReview");
  if (!Object.keys(input).every((key) => allowed.includes(key)) || !required.every((key) => Object.hasOwn(input, key))) {
    return baselineRepair("PSI-INPUT-SHAPE", requestSha256);
  }

  const baseline = normalizedBaseline(input.baseline);
  if (baseline === null) return baselineRepair("PSI-BASELINE-MISSING-OR-INCONSISTENT", requestSha256);

  const candidateWriteSet = canonicalList(input.candidateWriteSet, canonicalPath);
  if (candidateWriteSet === null || candidateWriteSet.length === 0) {
    return recovery(PARALLEL_SPRINT_RECOVERY_ACTIONS.WRITE_SET_REPAIR, "PSI-WRITE-SET-MISSING-OR-BROAD", requestSha256, {
      baseline,
      required: ["candidateWriteSet"],
    });
  }
  if (input.writeSetScope !== "exact") {
    return recovery(PARALLEL_SPRINT_RECOVERY_ACTIONS.WRITE_SET_REPAIR, "PSI-WRITE-SET-SCOPE-MISSING-OR-BROAD", requestSha256, {
      baseline,
      required: ["writeSetScope: exact"],
    });
  }

  const promotion = validatePromotion(input.promotion);
  if (!promotion.ok) {
    const failed = recovery(PARALLEL_SPRINT_RECOVERY_ACTIONS.PROMOTION_REBASE, promotion.code, requestSha256, {
      baseline,
      required: ["explicit confirmed PO selection", "merge-ready candidate evidence", "exact target main commit/tree"],
    });
    return reconcileInterrupted(input.interrupted, requestSha256, failed);
  }

  const advanceResult = normalizeAdvance(input.advance);
  if (!advanceResult.ok) {
    const kind = advanceResult.reviewRequired
      ? PARALLEL_SPRINT_RECOVERY_ACTIONS.IMPACT_REVIEW_RECEIPT
      : advanceResult.code === "PSI-ADVANCE-WRITE-SET-INVALID"
        ? PARALLEL_SPRINT_RECOVERY_ACTIONS.WRITE_SET_REPAIR
        : PARALLEL_SPRINT_RECOVERY_ACTIONS.BASELINE_REPAIR;
    const failed = recovery(kind, advanceResult.code, requestSha256, { baseline });
    return reconcileInterrupted(input.interrupted, requestSha256, failed);
  }
  const advance = advanceResult.value;
  if (advance.kind === "ordinary" && sameBaseline(advance.baseline, baseline)) {
    const failed = baselineRepair("PSI-ADVANCE-DOES-NOT-ADVANCE", requestSha256, { baseline });
    return reconcileInterrupted(input.interrupted, requestSha256, failed);
  }
  if (advance.kind === "ordinary" && advance.baseline.commit.length !== baseline.commit.length) {
    const failed = baselineRepair("PSI-ADVANCE-OBJECT-FORMAT-MISMATCH", requestSha256, {
      baseline,
      observedAdvance: advance.baseline,
    });
    return reconcileInterrupted(input.interrupted, requestSha256, failed);
  }

  let review = null;
  if (advance.kind === "ordinary") {
    const impact = advance.surfaces.length > 0 || writeSetsOverlap(candidateWriteSet, advance.writeSet);
    if (impact) {
      const expected = expectedImpactReview(baseline, advance, candidateWriteSet);
      review = validateImpactReview(input.impactReview ?? null, expected);
      if (!review.ok) {
        const planned = integrationReceipt(
          PARALLEL_SPRINT_DISPOSITIONS.BASELINE_IMPACT_REVIEW_REQUIRED,
          baseline,
          review.code,
          requestSha256,
          {
            advance: advance.baseline,
            action: makeAction(PARALLEL_SPRINT_RECOVERY_ACTIONS.IMPACT_REVIEW_RECEIPT, requestSha256, {
              review: expected,
              reviewSha256: digestParallelSprintValue(expected),
            }),
          },
        );
        return reconcileInterrupted(input.interrupted, requestSha256, planned);
      }
      if (review.decision === "material-incompatibility" && !promotion.selected) {
        const failed = recovery(PARALLEL_SPRINT_RECOVERY_ACTIONS.PROMOTION_REBASE, "PSI-MATERIAL-INCOMPATIBILITY-SELECTION-REQUIRED", requestSha256, {
          baseline,
          impactReviewReceiptSha256: review.receiptSha256,
          required: ["explicit confirmed PO selection", "merge-ready candidate evidence", "exact target main commit/tree"],
        });
        return reconcileInterrupted(input.interrupted, requestSha256, failed);
      }
    } else if (input.impactReview !== undefined && input.impactReview !== null) {
      const failed = recovery(PARALLEL_SPRINT_RECOVERY_ACTIONS.IMPACT_REVIEW_RECEIPT, "PSI-IMPACT-RECEIPT-UNEXPECTED", requestSha256, {
        baseline,
        observedAdvance: advance.baseline,
      });
      return reconcileInterrupted(input.interrupted, requestSha256, failed);
    }
  } else if (input.impactReview !== undefined && input.impactReview !== null) {
    const failed = recovery(PARALLEL_SPRINT_RECOVERY_ACTIONS.IMPACT_REVIEW_RECEIPT, "PSI-IMPACT-RECEIPT-UNEXPECTED", requestSha256, {
      baseline,
      observedAdvance: null,
    });
    return reconcileInterrupted(input.interrupted, requestSha256, failed);
  }

  let planned;
  if (promotion.selected) {
    if (review?.decision === "defer") {
      planned = recovery(PARALLEL_SPRINT_RECOVERY_ACTIONS.IMPACT_REVIEW_RECEIPT, "PSI-PROMOTION-CONFLICTS-CONFIRMED-DEFER", requestSha256, {
        baseline,
        impactReviewReceiptSha256: review.receiptSha256,
      });
    } else if (promotion.reason === "protected-surface" && review === null) {
      planned = recovery(PARALLEL_SPRINT_RECOVERY_ACTIONS.IMPACT_REVIEW_RECEIPT, "PSI-PROTECTED-SURFACE-RECEIPT-REQUIRED", requestSha256, {
        baseline,
        required: ["confirmed protected-surface impact review"],
      });
    } else if (promotion.reason === "material-incompatibility" && review?.decision !== "material-incompatibility") {
      planned = recovery(PARALLEL_SPRINT_RECOVERY_ACTIONS.IMPACT_REVIEW_RECEIPT, "PSI-MATERIAL-INCOMPATIBILITY-RECEIPT-REQUIRED", requestSha256, {
        baseline,
        required: ["confirmed material-incompatibility impact review"],
      });
    } else if (advance.kind === "ordinary" && !sameBaseline(promotion.targetMain, advance.baseline)) {
      planned = recovery(PARALLEL_SPRINT_RECOVERY_ACTIONS.PROMOTION_REBASE, "PSI-PROMOTION-TARGET-MAIN-DRIFT", requestSha256, {
        baseline,
        observedMain: advance.baseline,
        selectedTargetMain: promotion.targetMain,
      });
    } else {
      planned = integrationReceipt(
        PARALLEL_SPRINT_DISPOSITIONS.REBASE_REQUIRED_FOR_PROMOTION,
        baseline,
        "PSI-PO-FIRST-MERGE-READY-CANDIDATE-SELECTED",
        requestSha256,
        {
          advance: advance.kind === "ordinary" ? advance.baseline : null,
          action: makeAction(PARALLEL_SPRINT_RECOVERY_ACTIONS.PROMOTION_REBASE, requestSha256, {
            selectedCandidate: promotion.candidate,
            candidateFrozen: true,
            selectionSha256: promotion.selection.selectionSha256,
            targetMain: promotion.targetMain,
            reason: promotion.reason,
            impactReviewReceiptSha256: review?.receiptSha256 ?? null,
            postRebaseRequired: ["regenerated candidate bindings", "complete final verify", "complete final security gates"],
          }),
        },
      );
    }
  } else if (advance.kind === "none") {
    planned = integrationReceipt(PARALLEL_SPRINT_DISPOSITIONS.BASELINE_CURRENT, baseline, "PSI-BASELINE-EXACT", requestSha256);
  } else {
    planned = integrationReceipt(
      PARALLEL_SPRINT_DISPOSITIONS.BASELINE_STALE_DEFERRED,
      baseline,
      review === null ? "PSI-DISJOINT-ORDINARY-ADVANCE" : "PSI-CONFIRMED-IMPACT-DEFERRED",
      requestSha256,
      {
        advance: advance.baseline,
        candidateWriteSet,
        advanceWriteSet: advance.writeSet,
        impactReviewReceiptSha256: review?.receiptSha256 ?? null,
      },
    );
  }
  return reconcileInterrupted(input.interrupted, requestSha256, planned);
}
