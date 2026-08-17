// SPDX-License-Identifier: SUL-1.0
/**
 * P-AC-09 (second half): actually export the historical events a human gave
 * explicit backfill consent for.
 *
 * `computeBackfillRange` (organization-policy-activation.mjs) previews which
 * historical events would newly become exportable after a policy/document-class
 * change, and `activateOrganizationPolicy` now refuses to activate such a
 * transition without a distinct, window-bound consent. This module is the only
 * thing that turns that consent into a delivery, and it deliberately owns no
 * export mechanism of its own: it reads through the ordinary store read path
 * (`queryPortableGovernanceStream`), sanitizes through the ordinary default-deny
 * projection boundary (`projectGovernanceEvent`), queues through the ordinary
 * outbox (`enqueueGovernanceExport`) and ships through the ordinary delivery
 * coordinator (`deliverGovernanceExportBatch`). A backfill is therefore subject
 * to exactly the same field allowlist, payload bounds, acknowledgement handling
 * and recoverable outbox state as any other export -- there is no second,
 * weaker path into a destination.
 *
 * Scope note (disclosed, not silent): the portable event envelope carries no
 * organization document-class axis, so the consented `classes` cannot select
 * events. They name WHY the window became exportable and are carried into the
 * result for audit; the window itself (`[fromEpochMs, toEpochMs)`, anchored at
 * the prior activation and closed at this activation) is what selects events.
 */
import { governanceBackfillConsentSubject } from "./organization-policy-activation.mjs";
import { projectGovernanceEvent, validateGovernanceExportPolicy } from "./governance-event-projection.mjs";
import { queryPortableGovernanceStream } from "./governance-event-store.mjs";
import { createGovernanceExportOutbox, enqueueGovernanceExport } from "./governance-export-outbox.mjs";
import { deliverGovernanceExportBatch } from "./governance-export-delivery.mjs";

const SHA = /^[a-f0-9]{64}$/u;
function fail(code, message = "Organization policy backfill export is invalid.") { const error = new Error(message); error.code = code; throw error; }
function exact(value, keys) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }

/**
 * Re-derive the consent subject from the receipt's own fields and require it to
 * match the recorded digest. A receipt is data a caller hands us, so a widened
 * window or a swapped activation identity must fail closed here rather than
 * silently exporting more history than a human ever saw.
 */
export function assertBackfillConsent(receipt) {
  if (!exact(receipt ?? null, ["schema", "status", "activePath", "activeSha256", "activationId", "effectivePolicySha256", "humanDecisionId", "backfillConsent"])
    || receipt.schema !== "pipeline.organization-policy-activation-receipt.v1" || receipt.status !== "activated") fail("OPB-CONSENT-ABSENT", "No activation receipt carrying an explicit backfill consent was supplied.");
  const consent = receipt.backfillConsent;
  if (!exact(consent, ["schema", "backfillDecisionId", "classes", "fromEpochMs", "toEpochMs", "subjectSha256"])
    || consent.schema !== "pipeline.organization-policy-backfill-consent.v1" || typeof consent.backfillDecisionId !== "string" || consent.backfillDecisionId === ""
    || consent.backfillDecisionId === receipt.humanDecisionId || !SHA.test(consent.subjectSha256 ?? "")) fail("OPB-CONSENT-ABSENT", "The supplied backfill consent is not a distinct, well-formed consent.");
  if (governanceBackfillConsentSubject({ activationId: receipt.activationId, effectivePolicySha256: receipt.effectivePolicySha256, classes: consent.classes, fromEpochMs: consent.fromEpochMs, toEpochMs: consent.toEpochMs }) !== consent.subjectSha256) fail("OPB-CONSENT-BINDING", "The backfill consent is not bound to the window it records.");
  return Object.freeze({ ...consent, classes: Object.freeze([...consent.classes]) });
}

/** Exactly the consented half-open window; nothing outside it is ever selected. */
export function selectBackfillEvents(events, consent) {
  const from = consent.fromEpochMs === null ? 0 : consent.fromEpochMs;
  return Object.freeze((Array.isArray(events) ? events : []).filter((event) => Number.isSafeInteger(event?.occurredAtEpochMs) && event.occurredAtEpochMs >= from && event.occurredAtEpochMs < consent.toEpochMs).map((event) => Object.freeze({ ...event })));
}

/**
 * Read, project, queue and deliver the consented historical events through the
 * ordinary export path. Refuses outright without a bound consent -- this is the
 * enforcement half of "explicit backfill consent": no consent, no export.
 */
export async function exportConsentedOrganizationPolicyBackfill({ repositoryRoot, registryPath, repositoryFingerprint, streamId, checkpoint = null, receipt, exportPolicy, profile, adapter, outbox = null, batchId, maxEvents, attempt = 1 } = {}) {
  const consent = assertBackfillConsent(receipt);
  const policy = validateGovernanceExportPolicy(exportPolicy);
  const queried = await queryPortableGovernanceStream({ repositoryRoot, registryPath, repositoryFingerprint, streamId, checkpoint });
  const selected = selectBackfillEvents(queried.events, consent);
  // Default-deny: a historical event the export policy will not project is a
  // refusal, never a silently skipped event inside a consented window.
  const projections = selected.map((event) => {
    const result = projectGovernanceEvent({ event, policy });
    if (result.status !== "projected") fail("OPB-PROJECTION", `A consented historical event could not be projected (${result.reason}).`);
    return result.projection;
  });
  const queue = outbox ?? createGovernanceExportOutbox({ destinationProfile: policy.destinationProfile, policyRevision: policy.revision });
  const queued = projections.reduce((state, projection) => enqueueGovernanceExport(state, projection), queue);
  const delivery = await deliverGovernanceExportBatch({ outbox: queued, profile, adapter, batchId, maxEvents: maxEvents ?? Math.max(projections.length, 1), attempt });
  return Object.freeze({
    schema: "pipeline.organization-policy-backfill-export-result.v1",
    activationId: receipt.activationId,
    backfillDecisionId: consent.backfillDecisionId,
    subjectSha256: consent.subjectSha256,
    classes: consent.classes,
    window: Object.freeze({ fromEpochMs: consent.fromEpochMs, toEpochMs: consent.toEpochMs }),
    sourceEventDigests: Object.freeze(projections.map((projection) => projection.sourceEventDigest)),
    delivery,
  });
}
