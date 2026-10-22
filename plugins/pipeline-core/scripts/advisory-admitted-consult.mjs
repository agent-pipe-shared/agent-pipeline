// SPDX-License-Identifier: SUL-1.0

/**
 * The admitted half of the ordinary Codex consult in the host bridge.
 *
 * The bridge calls this only after the host reported an explicit `admitted`
 * export decision AND a sealed, host-owned executor was installed as a
 * dependency (never as stdin input). The executor's result is not trusted: an
 * answer is reported only when the returned receipt, execution record and
 * answer digest bind the candidate, route, question, evidence and host result
 * through `verifyAnsweredAdvisoryReceipt`. Any other outcome is a typed refusal
 * with a repair. Because an attempt may already have started, a refusal here is
 * deliberately NOT described as a no-child route selection.
 *
 * The bridge's own helpers (route resolution, receipt construction, atomic
 * persistence, event emission) are handed in; this module has no I/O of its own.
 */
import { ANSWERED_RECEIPT_REFUSALS, verifyAnsweredAdvisoryReceipt } from "../lib/advisory-answered-receipt.mjs";
import { createAdvisoryConsultationRecord } from "../lib/advisory-lifecycle-v2.mjs";
import { AdvisoryReceiptAssuranceError } from "../lib/advisory-receipt-assurance.mjs";

/**
 * Every refusal of the ordinary Codex consult names what the user can do next.
 * Nothing ran, or nothing is trusted, so the alternative is to continue without
 * an Advisor (an on-demand Advisor is optional, ADR-0085). Runner-neutral and
 * free of question/evidence content.
 */
export const ORDINARY_CONSULT_REPAIRS = Object.freeze({
  "advisor-repository-export-declined": "Repository Advisor export consent is declined, so no data was exported and no model was called. Continue without an Advisor (an on-demand Advisor is optional), or set advisor_export.consent to approved in pipeline.user.yaml and ask again.",
  "advisor-host-export-denied": "The host did not approve this export, so no data was exported and no model was called. Continue without an Advisor; do not retry through another command or provider.",
  "ordinary-consult-host-route-unavailable": "Repository export consent is missing or the host route is unavailable, so no data was exported and no model was called. Continue without an Advisor, or record advisor_export.consent in pipeline.user.yaml and ask again.",
  "ordinary-consult-host-callback-unavailable": "This host has no sealed executor installed for an ordinary consult, so no data was exported and no model was called. Continue without an Advisor; an on-demand Advisor is optional and no design stage requires one.",
  "advisor-host-execution-unavailable": "The host-owned executor failed or returned no verifiable result, so no answer is reported and nothing the executor said is trusted. Continue without an Advisor, or ask again once the host executor is repaired; a consultation of this request is spent.",
  "advisory_route_unavailable": "The registered advisory route could not be resolved for this candidate, so the executor was not called. Resolve the registered route and ask again, or continue without an Advisor.",
});

/** Returns the process exit code after emitting exactly one `advisory.completed` event. */
export async function finishAdmittedOrdinaryConsult({ input, args, repositoryRoot, dependencies, consultationRecordPath, host }) {
  const base = { schema: "pipeline.advisory-host.v1", type: "advisory.completed", answer: null, attempts: [], attemptTrailPath: null, routeSelectionPath: null, sandboxBinding: null, agentDecisionEvent: null };
  const route = host.resolveRoute();
  if (route === null) {
    host.emit({ ...base, ok: false, code: "advisory_route_unavailable", repair: ORDINARY_CONSULT_REPAIRS.advisory_route_unavailable,
      receiptPath: null, consultationRecord: null, consultationRecordPath: null, modelCalls: 0, launcherCalls: 0 });
    return 2;
  }
  let outcome = null;
  try { outcome = await dependencies.executeAdmittedConsult({ input: structuredClone(input), repoRoot: repositoryRoot }); } catch { outcome = null; }
  const result = outcome?.advisoryResult;
  let failure = null;
  if (result?.ok === true && result.code === "answered" && typeof result.answer === "string") {
    const bound = verifyAnsweredAdvisoryReceipt({ receipt: result.receipt, execution: outcome.execution, answer: result.answer,
      demand: input.demand, route, dispatch: input.dispatch, evidenceSha256: input.demand.evidenceSha256, selection: outcome.sandboxBinding ?? null });
    if (!bound.ok) failure = { code: bound.code, repair: bound.repair };
  } else if (typeof result?.code === "string" && Object.hasOwn(ANSWERED_RECEIPT_REFUSALS, result.code)) {
    failure = { code: result.code, repair: ANSWERED_RECEIPT_REFUSALS[result.code] };
  } else {
    failure = { code: "advisor-host-execution-unavailable", repair: ORDINARY_CONSULT_REPAIRS["advisor-host-execution-unavailable"] };
  }
  let persisted = null;
  let receipt = failure === null ? result.receipt : null;
  if (failure === null) {
    try { persisted = host.writeJsonAtomic(args.receipt, receipt); } catch (error) {
      if (!(error instanceof AdvisoryReceiptAssuranceError)) throw error;
      failure = { code: `advisory_receipt_${error.status}`, repair: ORDINARY_CONSULT_REPAIRS["advisor-host-execution-unavailable"] };
      receipt = null;
    }
  }
  if (failure !== null) {
    // Only the unavailable receipt is written; a no-child route selection would claim no attempt started.
    receipt = host.receiptFor(input, route, { status: "unavailable", fallbackReason: "consult-unavailable" });
    persisted = host.writeJsonAtomic(args.receipt, receipt);
  }
  const record = createAdvisoryConsultationRecord({ demand: input.demand, receipt, outcome: receipt.observed.status, completedAtMs: Date.now() });
  if (!record.ok) throw new Error(record.code);
  host.writeJsonAtomic(consultationRecordPath, record.record);
  const common = { receiptPath: host.resolvePath(args.receipt), directoryDurability: persisted?.directoryDurability ?? null, consultationRecord: record.record, consultationRecordPath };
  if (failure !== null) {
    host.emit({ ...base, ...common, ok: false, code: failure.code, repair: failure.repair });
    return 2;
  }
  const decision = await (dependencies.recordAdvisoryDecisionEvent ?? host.recordAdvisoryDecisionEvent)(receipt, { repoRoot: repositoryRoot });
  host.emit({ ...base, ...common, ok: true, code: "answered", answer: result.answer,
    attempts: [{ adapter: "host-consult", kind: "consult", runner: "codex", status: "answered" }],
    sandboxBinding: structuredClone(outcome.sandboxBinding), agentDecisionEvent: decision });
  return 0;
}
