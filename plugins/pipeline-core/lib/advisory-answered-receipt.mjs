// SPDX-License-Identifier: SUL-1.0

/**
 * The answered half of the selected host Advisor route (AC-135).
 *
 * An answered pipeline.advisory-receipt.v1 is not something an adapter may
 * simply claim: it is accepted only when the receipt binds, together, the
 * candidate, the resolved route, the question digest, the evidence digest, the
 * observed host execution record and the answer digest. This module adds no
 * receipt format. It checks the existing receipt against the existing sandbox
 * execution record and, when a binding is absent or does not hold, returns a
 * typed refusal that names the repair. Nothing here launches, observes or
 * persists anything; it is a pure verifier over values the host already holds.
 */
import { createHash } from "node:crypto";

import { validateAdvisoryReceipt } from "./advisory-receipt.mjs";
import { canonicalJson } from "./codex-sandbox-compatibility.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const EXECUTION_SCHEMA = "pipeline.codex-sandbox-execution-receipt.v1";
const SUCCESS_TERMINAL = Object.freeze({ childStarted: true, exitCode: 0, stdioStatus: "complete", cleanupStatus: "complete" });

/** Typed refusal code -> the repair its holder can actually run. Messages stay runner-neutral. */
export const ANSWERED_RECEIPT_REFUSALS = Object.freeze({
  advisory_answered_receipt_invalid: "Rebuild the receipt through the existing advisory receipt contract with status answered, an observed model identity and an answer digest; a receipt that fails that contract is not an answer.",
  advisory_answered_execution_missing: "Supply the execution record the selected host bridge wrote for this exact answer, or return the typed unavailable outcome instead; an admission, a callback acknowledgement or a JSON reply is not an execution and cannot be answered.",
  advisory_answered_candidate_mismatch: "Re-run the consultation against the current candidate commit and tree; the receipt, the demand or the host execution is bound to a different candidate or queue revision.",
  advisory_answered_route_mismatch: "Resolve the registered advisory route again and re-run; the observed model identity or the requested route differs from the configured route.",
  advisory_answered_question_mismatch: "Rebuild the demand from the exact question that was consulted; the receipt's question digest differs from the demand's.",
  advisory_answered_evidence_mismatch: "Rebuild the evidence bundle and the demand from the same references and re-run; the evidence digest of the demand, the bundle or the host execution differs.",
  advisory_answered_host_result_mismatch: "Re-run the consultation through the selected host bridge; the observed host result does not bind this receipt, this selection or a completed child.",
  advisory_answered_answer_mismatch: "Re-run the consultation; the answer digest in the receipt does not bind the answer that was returned.",
});

const sha = (value) => createHash("sha256").update(value).digest("hex");
function same(left, right) {
  try { return canonicalJson(left) === canonicalJson(right); } catch { return false; }
}
function refuse(code, field) {
  return Object.freeze({ ok: false, code, field, repair: ANSWERED_RECEIPT_REFUSALS[code] });
}

/**
 * Verify that an answered receipt is bound to the observed host execution.
 *
 * `execution` is the pipeline.codex-sandbox-execution-receipt.v1 record the
 * selected host bridge produced; `selection` is the sandbox duty result that
 * named it (selectionId, selectionSha256, dutyReceiptSha256). The duty-receipt
 * digest is the compact JSON digest the execution record already carries; no
 * second digest of the receipt is introduced.
 */
export function verifyAnsweredAdvisoryReceipt({ receipt, execution, answer, demand, route, dispatch, evidenceSha256, selection } = {}) {
  if (!validateAdvisoryReceipt(receipt).ok || receipt.observed.status !== "answered") {
    return refuse("advisory_answered_receipt_invalid", "receipt");
  }
  if (execution?.schema !== EXECUTION_SCHEMA || execution.terminal?.childStarted !== true
    || execution.dutyReceipt?.status !== "answered") return refuse("advisory_answered_execution_missing", "execution");
  if (!same(receipt.dispatch, dispatch) || !same(demand?.dispatch, dispatch)
    || execution.dispatch?.candidateCommit !== dispatch?.candidateCommit
    || execution.dispatch?.queueRevision !== dispatch?.queueRevision) return refuse("advisory_answered_candidate_mismatch", "dispatch");
  const configured = receipt.configuredRoute;
  const observed = receipt.observed.identity;
  if (typeof route?.model !== "string" || configured.runner !== route.runner
    || configured.selector.kind !== "model-id" || configured.selector.value !== route.model
    || configured.effort !== route.effort || observed.modelId !== route.model || observed.effort !== route.effort
    || execution.requested?.runner !== route.runner
    || execution.requested?.model !== route.model) return refuse("advisory_answered_route_mismatch", "route");
  if (!SHA256.test(demand?.questionSha256 ?? "") || receipt.questionSha256 !== demand.questionSha256) {
    return refuse("advisory_answered_question_mismatch", "questionSha256");
  }
  if (!SHA256.test(evidenceSha256 ?? "") || demand.evidenceSha256 !== evidenceSha256
    || execution.dispatch?.referenceSetSha256 !== evidenceSha256) return refuse("advisory_answered_evidence_mismatch", "evidenceSha256");
  if (execution.duty !== "advisory" || !same(execution.terminal, SUCCESS_TERMINAL)
    || execution.dutyReceipt.sha256 !== sha(JSON.stringify(receipt))
    || (selection !== undefined && (selection?.selectionId !== execution.selectionId
      || selection.selectionSha256 !== execution.selectionSha256
      || selection.dutyReceiptSha256 !== execution.dutyReceipt.sha256))) {
    return refuse("advisory_answered_host_result_mismatch", "execution");
  }
  if (typeof answer !== "string" || answer.length === 0 || receipt.answerSha256 !== sha(answer)) {
    return refuse("advisory_answered_answer_mismatch", "answerSha256");
  }
  return Object.freeze({
    ok: true,
    binding: Object.freeze({
      candidate: Object.freeze({ commit: receipt.dispatch.candidateCommit, tree: receipt.dispatch.candidateTree }),
      route: Object.freeze({ runner: configured.runner, model: configured.selector.value, effort: configured.effort }),
      questionSha256: receipt.questionSha256,
      evidenceSha256,
      hostResult: Object.freeze({
        selectionId: execution.selectionId,
        selectionSha256: execution.selectionSha256,
        dutyReceiptSha256: execution.dutyReceipt.sha256,
      }),
      answerSha256: receipt.answerSha256,
    }),
  });
}
