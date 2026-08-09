// SPDX-License-Identifier: SUL-1.0
/** Provider-neutral composed gate for local and external change control. */
import { dualEvaluateDecisionReference, isDecisionReference } from "./decision-reference-dual-evaluation.mjs";
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u; const SHA = /^[a-f0-9]{64}$/u; const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
function exact(value, keys) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function fail(code) { const error = new Error("Change control input is invalid."); error.code = code; throw error; }
function candidate(value) { return exact(value, ["commit", "tree"]) && OID.test(value.commit) && OID.test(value.tree); }
function artifact(value) { return exact(value, ["path", "sha256"]) && typeof value.path === "string" && SHA.test(value.sha256); }
function window(value) { return exact(value, ["startsAtEpochMs", "endsAtEpochMs"]) && Number.isSafeInteger(value.startsAtEpochMs) && Number.isSafeInteger(value.endsAtEpochMs) && value.startsAtEpochMs >= 0 && value.endsAtEpochMs >= value.startsAtEpochMs; }
// H-AC-12: `decisionReference` is an OPTIONAL 7th key on `pipelineAuthority`, never required
// -- its ABSENCE leaves pipelineAuthority's shape and every downstream check byte-for-byte
// identical to before this dispatch (regression-proof). When present, it must be exactly
// `{ reference, resolved }`: `reference` reuses the SAME `pipeline.human-decision-reference.v1`
// shape guard-devplan.mjs and plan-spec-state-v2.mjs already validate (via the shared
// `isDecisionReference`, not a new one), and `resolved` is the caller's ALREADY-RESOLVED
// second-reader verdict for that exact reference -- this module stays a pure evaluator with
// no I/O, exactly like it already trusts a pre-resolved `externalReceipt`.
function validPipelineAuthority(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  const hasDecisionReference = keys.length === 7 && Object.hasOwn(value, "decisionReference");
  if (keys.length !== 6 && !hasDecisionReference) return false;
  if (typeof value.granted !== "boolean" || !candidate(value.candidate) || !artifact(value.artifact)
    || !ID.test(value.environment) || !SHA.test(value.scopeSha256) || typeof value.emergencyAuthorized !== "boolean") return false;
  if (!hasDecisionReference) return true;
  const decisionReference = value.decisionReference;
  return decisionReference !== null && typeof decisionReference === "object" && !Array.isArray(decisionReference)
    && exact(decisionReference, ["reference", "resolved"])
    && typeof decisionReference.resolved === "boolean"
    && isDecisionReference(decisionReference.reference);
}
// C-AC-02: a standard-change profile must bind to an externally pre-authorized
// template and its still-valid revision (issue #24 §5); every other class
// carries no such binding at all.
function standardTemplate(value) { return exact(value, ["templateId", "revision"]) && ID.test(value.templateId) && ID.test(value.revision); }
// C-AC-12: reviewPolicy is orthogonal to mandatory/changeClass -- it names what
// happens when the external ITSM system is unreachable for a profile that does
// consult it. "mandatory" keeps today's unconditional block; "advisory" still
// wants ITSM review when reachable but never hard-blocks on its absence. Present
// (and drawn from the closed vocabulary) only when mandatory is true, null
// otherwise -- the same present/null-by-class shape as standardTemplate above.
export function validateChangeControlProfile(profile) {
  if (!exact(profile, ["schema", "profileId", "policySha256", "changeClass", "candidate", "artifact", "environment", "scopeSha256", "window", "mandatory", "standardTemplate", "reviewPolicy"]) || profile.schema !== "pipeline.change-control-profile.v1" || !ID.test(profile.profileId) || !SHA.test(profile.policySha256) || !new Set(["standard", "normal", "emergency", "not-required"]).has(profile.changeClass) || !candidate(profile.candidate) || !artifact(profile.artifact) || !ID.test(profile.environment) || !SHA.test(profile.scopeSha256) || !window(profile.window) || typeof profile.mandatory !== "boolean" || (profile.changeClass === "not-required") !== !profile.mandatory || (profile.changeClass === "standard" ? !standardTemplate(profile.standardTemplate) : profile.standardTemplate !== null) || (profile.mandatory ? !new Set(["mandatory", "advisory"]).has(profile.reviewPolicy) : profile.reviewPolicy !== null)) fail("CC-PROFILE");
  return Object.freeze({ ...profile, candidate: Object.freeze({ ...profile.candidate }), artifact: Object.freeze({ ...profile.artifact }), window: Object.freeze({ ...profile.window }), standardTemplate: profile.standardTemplate === null ? null : Object.freeze({ ...profile.standardTemplate }) });
}
export function validateChangeControlReceipt(receipt) {
  if (!exact(receipt, ["schema", "profileId", "candidate", "artifact", "environment", "scopeSha256", "window", "state", "authenticated"]) || receipt.schema !== "pipeline.change-control-receipt.v1" || !ID.test(receipt.profileId) || !candidate(receipt.candidate) || !artifact(receipt.artifact) || !ID.test(receipt.environment) || !SHA.test(receipt.scopeSha256) || !window(receipt.window) || !new Set(["draft", "approved", "rejected", "expired", "conflicting", "unknown", "unavailable"]).has(receipt.state) || typeof receipt.authenticated !== "boolean") fail("CC-RECEIPT");
  return Object.freeze({ ...receipt, candidate: Object.freeze({ ...receipt.candidate }), artifact: Object.freeze({ ...receipt.artifact }), window: Object.freeze({ ...receipt.window }) });
}
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
/** The gate never converts ITSM text/receipt into Pipeline or human authority. */
export function evaluateChangeControlGate({ profile, pipelineAuthority, externalReceipt, nowEpochMs } = {}) {
  const current = validateChangeControlProfile(profile); if (!Number.isSafeInteger(nowEpochMs) || nowEpochMs < 0 || !validPipelineAuthority(pipelineAuthority)) fail("CC-GATE");
  const matchesLocal = pipelineAuthority.granted && same(pipelineAuthority.candidate, current.candidate) && same(pipelineAuthority.artifact, current.artifact) && pipelineAuthority.environment === current.environment && pipelineAuthority.scopeSha256 === current.scopeSha256;
  if (!matchesLocal) return Object.freeze({ schema: "pipeline.change-control-gate.v1", status: "blocked", reason: "pipeline-authority" });
  // H-AC-12: only reached when `decisionReference` is present (see validPipelineAuthority
  // above) -- absent, this block never runs and behavior is byte-for-byte unchanged.
  // `legacyOk` is `pipelineAuthority.granted`, already required `true` by `matchesLocal`
  // above; `ledgerOk` is the caller's pre-resolved second-reader verdict. Disagreement
  // fails closed with its own distinct, operator-visible reason.
  if (Object.hasOwn(pipelineAuthority, "decisionReference")) {
    const evaluation = dualEvaluateDecisionReference({
      legacyOk: pipelineAuthority.granted,
      reference: pipelineAuthority.decisionReference.reference,
      ledgerOk: pipelineAuthority.decisionReference.resolved,
    });
    if (!evaluation.ok) return Object.freeze({ schema: "pipeline.change-control-gate.v1", status: "blocked", reason: "decision-reference-disagreement" });
  }
  if (current.changeClass === "emergency" && !pipelineAuthority.emergencyAuthorized) return Object.freeze({ schema: "pipeline.change-control-gate.v1", status: "blocked", reason: "emergency-authority" });
  if (!current.mandatory) return Object.freeze({ schema: "pipeline.change-control-gate.v1", status: "allowed", reason: "not-required" });
  if (externalReceipt === null) {
    // C-AC-12: advisory still wants ITSM review when reachable (see below), but
    // an unreachable ITSM system is never a hard block under advisory policy --
    // it is `allowed`, carrying a distinct, operator-visible reason instead of
    // silently passing as `composed-authority`, mirroring
    // projectChangeControlState's reconciliation-required pattern for "allowed,
    // but flagged for operator reconciliation".
    if (current.reviewPolicy === "advisory") return Object.freeze({ schema: "pipeline.change-control-gate.v1", status: "allowed", reason: "reconciliation-required" });
    return Object.freeze({ schema: "pipeline.change-control-gate.v1", status: "blocked", reason: "external-unavailable" });
  }
  const external = validateChangeControlReceipt(externalReceipt); const matchesExternal = external.profileId === current.profileId && same(external.candidate, current.candidate) && same(external.artifact, current.artifact) && external.environment === current.environment && external.scopeSha256 === current.scopeSha256 && same(external.window, current.window);
  if (!matchesExternal || !external.authenticated || external.state !== "approved") return Object.freeze({ schema: "pipeline.change-control-gate.v1", status: "blocked", reason: "external-authority" });
  if (nowEpochMs < current.window.startsAtEpochMs || nowEpochMs > current.window.endsAtEpochMs) return Object.freeze({ schema: "pipeline.change-control-gate.v1", status: "blocked", reason: "outside-window" });
  return Object.freeze({ schema: "pipeline.change-control-gate.v1", status: "allowed", reason: "composed-authority" });
}

/**
 * C-AC-09: resolves an environment's candidate change-control profiles -- all
 * claiming the same environment/candidate/artifact/scopeSha256 tuple -- to
 * exactly ONE effective outcome. The gate above already decides whether ONE
 * profile passes; this decides WHICH profile it gets handed, before it is
 * ever called. Zero candidates and a candidate set with no mandatory member
 * both resolve the same way evaluateChangeControlGate already treats
 * `mandatory: false` (line 34): `not-required`, with no profile to report --
 * an environment nothing constrains is not an error, it is exactly what
 * `not-required` already means elsewhere in this module. More than one
 * mandatory profile is always rejected, with no tie-break: the schema this
 * module validates against (validateChangeControlProfile above) carries no
 * priority/precedence field, so any changeClass-based ordering (e.g.
 * emergency outranking standard/normal) would be an unconfigured, invisible
 * rule this function invents on its own -- indistinguishable, from an
 * operator's perspective, from silently picking the wrong governance for a
 * release. C-AC-09's own text pairs "ambiguous" and "multiple mandatory
 * profiles" as one condition, not two different ones where a tie-break could
 * rescue one of them.
 */
export function resolveChangeControlProfile(candidates) {
  if (!Array.isArray(candidates)) fail("CC-RESOLVE");
  const validated = candidates.map((profile) => validateChangeControlProfile(profile));
  if (validated.length > 0) {
    const [first, ...rest] = validated;
    if (!rest.every((profile) => same(profile.candidate, first.candidate) && same(profile.artifact, first.artifact) && profile.environment === first.environment && profile.scopeSha256 === first.scopeSha256)) fail("CC-RESOLVE-SCOPE");
  }
  const mandatory = validated.filter((profile) => profile.mandatory);
  if (mandatory.length > 1) fail("CC-RESOLVE-AMBIGUOUS");
  if (mandatory.length === 1) return Object.freeze({ schema: "pipeline.change-control-resolution.v1", status: "effective", profile: mandatory[0] });
  return Object.freeze({ schema: "pipeline.change-control-resolution.v1", status: "not-required", profile: null });
}

/**
 * C-AC-02's "SHALL NOT permit class selection solely to avoid approval" has no
 * signal on one profile alone: changeClass/mandatory/standardTemplate/
 * reviewPolicy are already internally consistent by construction --
 * validateChangeControlProfile above enforces that -- so nothing about a
 * single valid profile, read in isolation, can say whether its class was
 * picked to fit the change or to dodge the approval a truer class would have
 * required. What IS structurally visible is the SAME underlying change
 * (identical candidate/artifact/environment/scopeSha256 tuple) being
 * represented under more than one classification: `proposed` is the
 * classification about to be used; `alternatives` are other classifications
 * considered for the exact same change (an earlier draft, a peer's
 * classification, a prior profile recorded for the same scope). This
 * composes with resolveChangeControlProfile rather than reimplementing its
 * tuple/ambiguity logic or inventing an unconfigured changeClass precedence
 * (the same precedence resolveChangeControlProfile's own docstring above
 * refuses to invent): resolving the fuller set (`proposed` plus every
 * same-tuple alternative) and finding it would NOT have landed on `proposed`
 * -- either because a same-tuple alternative is mandatory while `proposed`
 * is not, or because more than one same-tuple classification is
 * independently mandatory (resolveChangeControlProfile's own
 * CC-RESOLVE-AMBIGUOUS) -- is the flag: the change has more than one face,
 * and the one actually used is the one that avoids or narrows approval.
 *
 * Unlike resolveChangeControlProfile, `alternatives` need NOT already share
 * `proposed`'s tuple: callers may pass a broader candidate pool (e.g. every
 * profile considered in a review session, or recent journal-adjacent
 * profiles) and this function filters to the ones that actually describe the
 * same change before comparing -- picking the resolver's tuple invariant
 * apart rather than inheriting its all-or-nothing CC-RESOLVE-SCOPE failure.
 */
export function detectChangeClassShopping(proposed, alternatives) {
  const current = validateChangeControlProfile(proposed);
  if (!Array.isArray(alternatives)) fail("CC-SHOPPING");
  const validatedAlternatives = alternatives.map((profile) => validateChangeControlProfile(profile));
  const sameTuple = validatedAlternatives.filter((profile) => profile.profileId !== current.profileId && same(profile.candidate, current.candidate) && same(profile.artifact, current.artifact) && profile.environment === current.environment && profile.scopeSha256 === current.scopeSha256);
  const outcome = (flagged, reason) => Object.freeze({ schema: "pipeline.change-control-class-shopping.v1", flagged, reason, proposedChangeClass: current.changeClass, alternativeChangeClasses: Object.freeze(sameTuple.map((profile) => profile.changeClass)) });
  if (sameTuple.length === 0) return outcome(false, "no-alternative-classification");
  let resolution;
  try {
    resolution = resolveChangeControlProfile([current, ...sameTuple]);
  } catch (error) {
    if (error.code === "CC-RESOLVE-AMBIGUOUS") return outcome(true, "ambiguous-mandatory-alternatives");
    throw error;
  }
  if (resolution.status === "effective" && resolution.profile.profileId !== current.profileId) return outcome(true, "lighter-than-resolved-classification");
  return outcome(false, "no-lighter-selection-detected");
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

const CHANGE_CLASSES = new Set(["standard", "normal", "emergency", "not-required"]);

function journalBinding(value) {
  return exact(value, ["profileId", "candidate", "artifact", "environment", "scopeSha256", "changeClass"])
    && ID.test(value.profileId) && candidate(value.candidate) && artifact(value.artifact) && ID.test(value.environment) && SHA.test(value.scopeSha256)
    && CHANGE_CLASSES.has(value.changeClass);
}

/** Opens an empty append-only deployment journal bound to one change tuple. */
export function createChangeControlJournal(binding) {
  if (!journalBinding(binding)) fail("CC-JOURNAL");
  return Object.freeze({ schema: JOURNAL_SCHEMA, profileId: binding.profileId, candidate: Object.freeze({ ...binding.candidate }), artifact: Object.freeze({ ...binding.artifact }), environment: binding.environment, scopeSha256: binding.scopeSha256, changeClass: binding.changeClass, entries: Object.freeze([]) });
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
// C-AC-07: retrospective evidence that an emergency change was real or was
// reviewed after the fact. It is its own entry class, not a field on the
// local event, precisely so it cannot exist at the moment the gate allows
// the change (localEntry's evidenceSha256 is contemporaneous with the
// deployment itself) -- appendChangeControlEntry below requires it to
// reference an event that already happened locally, strictly later in time.
function retrospectiveEntry(value) {
  return exact(value, ["class", "forEvent", "occurredAtEpochMs", "evidenceSha256"]) && value.class === "retrospective"
    && DEPLOYMENT_EVENTS.has(value.forEvent) && Number.isSafeInteger(value.occurredAtEpochMs) && value.occurredAtEpochMs >= 0 && SHA.test(value.evidenceSha256);
}

/** Appends one entry, rejecting any order that would let an external report or a retrospective review precede its local event. */
export function appendChangeControlEntry(journal, entry) {
  if (!exact(journal, ["schema", "profileId", "candidate", "artifact", "environment", "scopeSha256", "changeClass", "entries"]) || journal.schema !== JOURNAL_SCHEMA || !Array.isArray(journal.entries)) fail("CC-JOURNAL");
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
  } else if (retrospectiveEntry(entry)) {
    // C-AC-07: the review must follow, and be strictly later than, the local
    // event it reviews -- it cannot be backdated to the moment the gate
    // allowed the change.
    const matchingLocals = entries.filter((item) => item.class === "local" && item.event === entry.forEvent);
    if (matchingLocals.length === 0 || entry.occurredAtEpochMs <= matchingLocals[matchingLocals.length - 1].occurredAtEpochMs) fail("CC-JOURNAL-ORDER");
  } else fail("CC-JOURNAL-ENTRY");
  return Object.freeze({ ...journal, candidate: Object.freeze({ ...journal.candidate }), artifact: Object.freeze({ ...journal.artifact }), entries: Object.freeze([...entries.map((item) => Object.freeze({ ...item })), Object.freeze({ ...entry })]) });
}

/** Projects the journal without ever upgrading an unpublished deployment to completed change control. */
export function projectChangeControlState(journal) {
  if (!exact(journal, ["schema", "profileId", "candidate", "artifact", "environment", "scopeSha256", "changeClass", "entries"]) || journal.schema !== JOURNAL_SCHEMA
    || !Array.isArray(journal.entries) || !journal.entries.every((entry) => localEntry(entry) || externalEntry(entry) || retrospectiveEntry(entry))) fail("CC-JOURNAL");
  const locals = journal.entries.filter((entry) => entry.class === "local");
  const externals = journal.entries.filter((entry) => entry.class === "external");
  const retrospectives = journal.entries.filter((entry) => entry.class === "retrospective");
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
  // C-AC-07: presence of retrospective evidence for a given local event,
  // order-blind by design -- unlike external dispositions there is no
  // "unpublish"; once genuine after-the-fact evidence exists for an event it
  // stays true for that event.
  const hasRetrospective = (event) => retrospectives.some((entry) => entry.forEvent === event);
  const projection = (status, reason) => Object.freeze({ schema: "pipeline.change-control-state.v1", status, reason, deploymentEvent: current, deploymentEvidenceRetained: locals.length > 0, attempts, failedAttempts });
  if (current === null) return projection("not-started", "no-local-event");
  if (current === "began") return projection("in-progress", "deployment-began");
  if (current === "failed") return projection(published("failed") ? "failed" : "reconciliation-required", published("failed") ? "deployment-failed" : "external-update-outstanding");
  if (current === "rolled-back") return projection(published("rolled-back") ? "rolled-back" : "reconciliation-required", published("rolled-back") ? "deployment-rolled-back" : "external-update-outstanding");
  // C-AC-06: deployment succeeded, so its evidence is retained either way -- but
  // without a published external update this is not completed change control.
  if (!published("validated")) return projection("reconciliation-required", "external-update-outstanding");
  // C-AC-07: an emergency-class deployment additionally needs retrospective
  // evidence -- distinct from, and necessarily later-obtainable than, the
  // external update above -- before it may report completed change control.
  // Every other class is unaffected: this branch is unreachable for them.
  if (journal.changeClass === "emergency" && !hasRetrospective("validated")) return projection("emergency-review-required", "retrospective-evidence-outstanding");
  return projection("completed", "composed-change-control");
}
