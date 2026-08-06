// SPDX-License-Identifier: SUL-1.0
/** Provider-neutral composed gate for local and external change control. */
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u; const SHA = /^[a-f0-9]{64}$/u; const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
function exact(value, keys) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function fail(code) { const error = new Error("Change control input is invalid."); error.code = code; throw error; }
function candidate(value) { return exact(value, ["commit", "tree"]) && OID.test(value.commit) && OID.test(value.tree); }
function artifact(value) { return exact(value, ["path", "sha256"]) && typeof value.path === "string" && SHA.test(value.sha256); }
function window(value) { return exact(value, ["startsAtEpochMs", "endsAtEpochMs"]) && Number.isSafeInteger(value.startsAtEpochMs) && Number.isSafeInteger(value.endsAtEpochMs) && value.startsAtEpochMs >= 0 && value.endsAtEpochMs >= value.startsAtEpochMs; }
export function validateChangeControlProfile(profile) {
  if (!exact(profile, ["schema", "profileId", "policySha256", "changeClass", "candidate", "artifact", "environment", "scopeSha256", "window", "mandatory"]) || profile.schema !== "pipeline.change-control-profile.v1" || !ID.test(profile.profileId) || !SHA.test(profile.policySha256) || !new Set(["standard", "normal", "emergency", "not-required"]).has(profile.changeClass) || !candidate(profile.candidate) || !artifact(profile.artifact) || !ID.test(profile.environment) || !SHA.test(profile.scopeSha256) || !window(profile.window) || typeof profile.mandatory !== "boolean" || (profile.changeClass === "not-required") !== !profile.mandatory) fail("CC-PROFILE");
  return Object.freeze({ ...profile, candidate: Object.freeze({ ...profile.candidate }), artifact: Object.freeze({ ...profile.artifact }), window: Object.freeze({ ...profile.window }) });
}
export function validateChangeControlReceipt(receipt) {
  if (!exact(receipt, ["schema", "profileId", "candidate", "artifact", "environment", "scopeSha256", "window", "state", "authenticated"]) || receipt.schema !== "pipeline.change-control-receipt.v1" || !ID.test(receipt.profileId) || !candidate(receipt.candidate) || !artifact(receipt.artifact) || !ID.test(receipt.environment) || !SHA.test(receipt.scopeSha256) || !window(receipt.window) || !new Set(["draft", "approved", "rejected", "expired", "conflicting", "unknown", "unavailable"]).has(receipt.state) || typeof receipt.authenticated !== "boolean") fail("CC-RECEIPT");
  return Object.freeze({ ...receipt, candidate: Object.freeze({ ...receipt.candidate }), artifact: Object.freeze({ ...receipt.artifact }), window: Object.freeze({ ...receipt.window }) });
}
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
/** The gate never converts ITSM text/receipt into Pipeline or human authority. */
export function evaluateChangeControlGate({ profile, pipelineAuthority, externalReceipt, nowEpochMs } = {}) {
  const current = validateChangeControlProfile(profile); if (!Number.isSafeInteger(nowEpochMs) || nowEpochMs < 0 || !exact(pipelineAuthority, ["granted", "candidate", "artifact", "environment", "scopeSha256", "emergencyAuthorized"]) || typeof pipelineAuthority.granted !== "boolean" || !candidate(pipelineAuthority.candidate) || !artifact(pipelineAuthority.artifact) || !ID.test(pipelineAuthority.environment) || !SHA.test(pipelineAuthority.scopeSha256) || typeof pipelineAuthority.emergencyAuthorized !== "boolean") fail("CC-GATE");
  const matchesLocal = pipelineAuthority.granted && same(pipelineAuthority.candidate, current.candidate) && same(pipelineAuthority.artifact, current.artifact) && pipelineAuthority.environment === current.environment && pipelineAuthority.scopeSha256 === current.scopeSha256;
  if (!matchesLocal) return Object.freeze({ schema: "pipeline.change-control-gate.v1", status: "blocked", reason: "pipeline-authority" });
  if (current.changeClass === "emergency" && !pipelineAuthority.emergencyAuthorized) return Object.freeze({ schema: "pipeline.change-control-gate.v1", status: "blocked", reason: "emergency-authority" });
  if (!current.mandatory) return Object.freeze({ schema: "pipeline.change-control-gate.v1", status: "allowed", reason: "not-required" });
  if (externalReceipt === null) return Object.freeze({ schema: "pipeline.change-control-gate.v1", status: "blocked", reason: "external-unavailable" });
  const external = validateChangeControlReceipt(externalReceipt); const matchesExternal = external.profileId === current.profileId && same(external.candidate, current.candidate) && same(external.artifact, current.artifact) && external.environment === current.environment && external.scopeSha256 === current.scopeSha256 && same(external.window, current.window);
  if (!matchesExternal || !external.authenticated || external.state !== "approved") return Object.freeze({ schema: "pipeline.change-control-gate.v1", status: "blocked", reason: "external-authority" });
  if (nowEpochMs < current.window.startsAtEpochMs || nowEpochMs > current.window.endsAtEpochMs) return Object.freeze({ schema: "pipeline.change-control-gate.v1", status: "blocked", reason: "outside-window" });
  return Object.freeze({ schema: "pipeline.change-control-gate.v1", status: "allowed", reason: "composed-authority" });
}

/**
 * Deployment journal and its projection.
 *
 * The local event is the record; the external update is a report about it. That
 * ordering is enforced rather than conventional: an external system must never
 * be the first place a deployment transition exists, because a failed publish
 * would then erase the transition entirely. The journal is append-only, so a
 * failed or mismatched attempt stays visible next to the one that succeeded.
 */
const JOURNAL_SCHEMA = "pipeline.change-control-journal.v1";
const DEPLOYMENT_EVENTS = new Set(["began", "validated", "failed", "rolled-back"]);
// Which local transitions may follow which. `validated` is deployment success;
// `rolled-back` is reachable from either terminal outcome.
const DEPLOYMENT_ORDER = { began: new Set(["validated", "failed"]), validated: new Set(["rolled-back"]), failed: new Set(["rolled-back"]), "rolled-back": new Set() };
const EXTERNAL_DISPOSITIONS = new Set(["published", "publish-failed", "readback-failed", "readback-mismatch", "unavailable"]);

function journalBinding(value) {
  return exact(value, ["profileId", "candidate", "artifact", "environment", "scopeSha256"])
    && ID.test(value.profileId) && candidate(value.candidate) && artifact(value.artifact) && ID.test(value.environment) && SHA.test(value.scopeSha256);
}

/** Opens an empty append-only deployment journal bound to one change tuple. */
export function createChangeControlJournal(binding) {
  if (!journalBinding(binding)) fail("CC-JOURNAL");
  return Object.freeze({ schema: JOURNAL_SCHEMA, profileId: binding.profileId, candidate: Object.freeze({ ...binding.candidate }), artifact: Object.freeze({ ...binding.artifact }), environment: binding.environment, scopeSha256: binding.scopeSha256, entries: Object.freeze([]) });
}

function localEntry(value) {
  return exact(value, ["class", "event", "occurredAtEpochMs", "evidenceSha256"]) && value.class === "local"
    && DEPLOYMENT_EVENTS.has(value.event) && Number.isSafeInteger(value.occurredAtEpochMs) && value.occurredAtEpochMs >= 0 && SHA.test(value.evidenceSha256);
}
function externalEntry(value) {
  return exact(value, ["class", "forEvent", "disposition", "occurredAtEpochMs", "receiptId"]) && value.class === "external"
    && DEPLOYMENT_EVENTS.has(value.forEvent) && EXTERNAL_DISPOSITIONS.has(value.disposition)
    && Number.isSafeInteger(value.occurredAtEpochMs) && value.occurredAtEpochMs >= 0
    && (value.receiptId === null || ID.test(value.receiptId));
}

/** Appends one entry, rejecting any order that would let an external report precede its local event. */
export function appendChangeControlEntry(journal, entry) {
  if (!exact(journal, ["schema", "profileId", "candidate", "artifact", "environment", "scopeSha256", "entries"]) || journal.schema !== JOURNAL_SCHEMA || !Array.isArray(journal.entries)) fail("CC-JOURNAL");
  const entries = journal.entries;
  const last = entries.length === 0 ? null : entries[entries.length - 1];
  if (last !== null && Number.isSafeInteger(entry?.occurredAtEpochMs) && entry.occurredAtEpochMs < last.occurredAtEpochMs) fail("CC-JOURNAL-ORDER");
  if (localEntry(entry)) {
    const locals = entries.filter((item) => item.class === "local");
    const previous = locals.length === 0 ? null : locals[locals.length - 1].event;
    if (previous === null ? entry.event !== "began" : !DEPLOYMENT_ORDER[previous].has(entry.event)) fail("CC-JOURNAL-ORDER");
  } else if (externalEntry(entry)) {
    // C-AC-05: the external update is publishable only after its local event.
    if (!entries.some((item) => item.class === "local" && item.event === entry.forEvent)) fail("CC-JOURNAL-ORDER");
  } else fail("CC-JOURNAL-ENTRY");
  return Object.freeze({ ...journal, candidate: Object.freeze({ ...journal.candidate }), artifact: Object.freeze({ ...journal.artifact }), entries: Object.freeze([...entries.map((item) => Object.freeze({ ...item })), Object.freeze({ ...entry })]) });
}

/** Projects the journal without ever upgrading an unpublished deployment to completed change control. */
export function projectChangeControlState(journal) {
  if (!exact(journal, ["schema", "profileId", "candidate", "artifact", "environment", "scopeSha256", "entries"]) || journal.schema !== JOURNAL_SCHEMA
    || !Array.isArray(journal.entries) || !journal.entries.every((entry) => localEntry(entry) || externalEntry(entry))) fail("CC-JOURNAL");
  const locals = journal.entries.filter((entry) => entry.class === "local");
  const externals = journal.entries.filter((entry) => entry.class === "external");
  const current = locals.length === 0 ? null : locals[locals.length - 1].event;
  // Every attempt is retained, including the failed ones: a later success must
  // not be able to hide that the external system was ever out of step.
  const attempts = Object.freeze(externals.map((entry) => Object.freeze({ forEvent: entry.forEvent, disposition: entry.disposition, occurredAtEpochMs: entry.occurredAtEpochMs, receiptId: entry.receiptId })));
  const failedAttempts = attempts.filter((entry) => entry.disposition !== "published").length;
  // Only the latest attempt for an event says whether the external system is
  // currently in step. `.some()` here was order-blind: one early success would
  // mask every later failure, so a publish followed by a readback mismatch still
  // projected as completed change control. Append order is authoritative --
  // `appendChangeControlEntry` refuses an entry that moves time backwards.
  const published = (event) => {
    const forEvent = attempts.filter((entry) => entry.forEvent === event);
    return forEvent.length > 0 && forEvent[forEvent.length - 1].disposition === "published";
  };
  const projection = (status, reason) => Object.freeze({ schema: "pipeline.change-control-state.v1", status, reason, deploymentEvent: current, deploymentEvidenceRetained: locals.length > 0, attempts, failedAttempts });
  if (current === null) return projection("not-started", "no-local-event");
  if (current === "began") return projection("in-progress", "deployment-began");
  if (current === "failed") return projection(published("failed") ? "failed" : "reconciliation-required", published("failed") ? "deployment-failed" : "external-update-outstanding");
  if (current === "rolled-back") return projection(published("rolled-back") ? "rolled-back" : "reconciliation-required", published("rolled-back") ? "deployment-rolled-back" : "external-update-outstanding");
  // C-AC-06: deployment succeeded, so its evidence is retained either way -- but
  // without a published external update this is not completed change control.
  return published("validated")
    ? projection("completed", "composed-change-control")
    : projection("reconciliation-required", "external-update-outstanding");
}
