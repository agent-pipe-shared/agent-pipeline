// SPDX-License-Identifier: SUL-1.0
/** Closed PHX-4 agent assumptions/selection payload; observational only. */
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u, CODE=/^[A-Z][A-Z0-9._:-]{0,127}$/u, SHA=/^[a-f0-9]{64}$/u;
const KINDS=new Set(["assumption","selection","verification-scope","fallback","escalation"]), STATES=new Set(["declared","verified","contradicted","expired","invalidated","superseded"]);
/** A-AC-11: the epistemic ground a claim was held on, a separate axis from the claim lifecycle `state`; the two never collapse into one enum. */
const ASSUMPTION_STATES=new Set(["assumed","inferred","observed","verified","contradicted","unavailable","unknown"]);
/** A-AC-05: identity provenance/assurance, admissible only on the kinds where an identity choice is material to the decision being recorded (`selection`, `escalation`, `fallback`); `assumption`/`verification-scope` never carry it. */
const IDENTITY_DIMENSIONS=new Set(["runner","model","effort","profile","role","adapter","capability"]), IDENTITY_PROVENANCE=new Set(["same-dispatch-observed","requested-route","inherited-session","unknown"]), IDENTITY_ASSURANCE=new Set(["verified","reported","inferred","unknown"]), IDENTITY_KINDS=new Set(["selection","escalation","fallback"]);
/**
 * R-AC-08: `rollback-performed`/`cleanup-performed` are the two OCCURRED
 * recovery facts. Every other rollback/cleanup notion on this shape is
 * prospective and stays that way: `recoverability` is a closed category
 * naming WHETHER a mutation would need rolling back or cleaning up
 * (`rollback-required`/`cleanup-required`), and `requiredCleanup` names WHAT
 * that follow-up is -- neither is ever the assertion that it happened.
 * Recording the occurrence therefore needed a `state`, exactly like every
 * other "this happened" fact in this vocabulary (`attempted`,
 * `readback-verified`, `recovered`), not a fourth `recoverability` value:
 * widening that enum would have made the occurred fact indistinguishable
 * from the requirement it discharges, and would have let it be smuggled onto
 * an `offered` event that has by definition executed nothing.
 *
 * `recovered` is deliberately NOT reused: it records that an alternative was
 * SELECTED (R-AC-02's considered-recovery axis, `recordCommandRecoveryDisposition`),
 * which is a decision, not a carried-out mutation-undo. A lifecycle can hold
 * both, in that order, and each keeps its own event.
 */
const COMMAND_STATES=new Set(["offered","acknowledged","authorized","copied","attempted","execution-unobserved","observed-completed","readback-verified","failed","partial","cancelled","unknown","unavailable","readback-mismatch","recovery-proposed","recovered","rollback-performed","cleanup-performed"]);
const COMMAND_ASSURANCE=new Set(["not-applicable","attempted","execution-unobserved","observed-completed","readback-verified","failed","partial","cancelled","unknown","unavailable","readback-mismatch"]);
const OMITTABLE=new Set(["raw-command","arguments","private-coordinates","unrestricted-output","prompt","transcript","credential"]);
/** R-AC-04: whether a recorded required cleanup/readback has itself been carried out -- a dimension distinct from `recoverability`'s category and from the original operation's `state`/`executionAssurance`. */
const CLEANUP_STATUSES=new Set(["pending","completed","verified"]);
/** H-AC-08: the six legacy record classes issue #30's Migration section names, one-to-one, and the two honest outcomes of trying to reprove their original authority tuple. */
const LEGACY_SOURCE_CLASSES=new Set(["mutable-approval-state","guard-override-jsonl-record","deployment-approval-log","override-receipt","backlog-transition-record","release-change-evidence"]), AUTHORITY_PROOF_STATUSES=new Set(["unprovable","not-attempted"]);
/** Local mirror of governance-event.mjs's ARTIFACT_PATH; this module stays dependency-free by design (see header), so the pattern is duplicated exactly rather than imported. */
const SOURCE_PATH=/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9][A-Za-z0-9._\/-]{0,255}$/u;
/**
 * A-AC-07: the closed set of named event classes capture policy may mark
 * `mandatory`. Investigated one by one against this module's existing shapes
 * (see `representedEventClasses` below) rather than assumed to need new
 * `kind`s; all seven turned out to already have an existing representation.
 */
export const EVENT_CLASSES=new Set(["security","privacy","authority","candidate","external-side-effect","recovery","verification-scope"]);
const SECURITY_SIDE_EFFECTS=new Set(["guard-bypass","authority-changing","destructive"]);
export class AgentDecisionJournalError extends Error { constructor(code){super("Agent decision event is invalid.");this.code=code;} }
const rec=(v)=>v!==null&&typeof v==="object"&&!Array.isArray(v), exact=(v,k)=>rec(v)&&Object.keys(v).length===k.length&&k.every((x)=>Object.hasOwn(v,x)); const fail=(c)=>{throw new AgentDecisionJournalError(c);};
const validIdentity=(identity)=>Array.isArray(identity)&&identity.length>=1&&identity.length<=7&&identity.every((entry)=>exact(entry,["dimension","value","provenance","assurance"])&&IDENTITY_DIMENSIONS.has(entry.dimension)&&ID.test(entry.value)&&IDENTITY_PROVENANCE.has(entry.provenance)&&IDENTITY_ASSURANCE.has(entry.assurance))&&new Set(identity.map((entry)=>entry.dimension)).size===identity.length;
/**
 * Admits only bounded reason codes/digests; this record can never grant authority.
 * `assumptionState` is optional because A-AC-11 governs the case WHEN an
 * assumption state is recorded; when the key is present it fails closed against
 * ASSUMPTION_STATES, and it constrains no `state` value and is constrained by none.
 * `identity` is optional the same way, for A-AC-05: WHEN an identity dimension is
 * recorded it fails closed against IDENTITY_DIMENSIONS/IDENTITY_PROVENANCE/
 * IDENTITY_ASSURANCE, and its presence is itself scoped to IDENTITY_KINDS
 * (ADJ-IDENTITY-SCOPE) because only `selection`/`escalation`/`fallback` ever have
 * a material identity choice to record.
 * `revalidationTrigger` is optional the same way, for A-AC-01: WHEN the
 * criterion's "revalidation trigger" clause is recorded it is a bounded stable
 * identifier -- the same `CODE` pattern `reasonCode` already validates against,
 * never free text, which this module admits nowhere -- naming what would make
 * the recorded decision due for re-checking; unlike `identity` it is
 * deliberately admissible on every `kind` (no scope rule), because A-AC-01's
 * own text says "assumption or selection" broadly and narrows the trigger to no
 * subset of KINDS the way A-AC-05's identity dimension narrows itself.
 */
export function validateAgentDecisionEvent(value) {
  const keys=["eventId","kind","state","reasonCode","candidateDigest","relatedHumanDecisionId","supersedesEventId"];
  if(value?.kind==="command-offer") return validateCommandOfferEvent(value);
  if(value?.kind==="legacy-import-observation") return validateLegacyImportObservationEvent(value);
  const epistemic=rec(value)&&Object.hasOwn(value,"assumptionState");
  const identified=rec(value)&&Object.hasOwn(value,"identity");
  const revalidated=rec(value)&&Object.hasOwn(value,"revalidationTrigger");
  const extended=[...keys,...(epistemic?["assumptionState"]:[]),...(identified?["identity"]:[]),...(revalidated?["revalidationTrigger"]:[])];
  if(!exact(value,extended)||!ID.test(value.eventId)||!KINDS.has(value.kind)||!STATES.has(value.state)||(epistemic&&!ASSUMPTION_STATES.has(value.assumptionState))||(identified&&!validIdentity(value.identity))||(revalidated&&(typeof value.revalidationTrigger!=="string"||!CODE.test(value.revalidationTrigger)))||(typeof value.reasonCode!=="string"||!CODE.test(value.reasonCode))||!SHA.test(value.candidateDigest)||(value.relatedHumanDecisionId!==null&&(!ID.test(value.relatedHumanDecisionId)))||(value.supersedesEventId!==null&&!ID.test(value.supersedesEventId)))fail("ADJ-SHAPE");
  if(value.state==="superseded"&&value.supersedesEventId===null)fail("ADJ-SUPERSESSION");
  if(identified&&!IDENTITY_KINDS.has(value.kind))fail("ADJ-IDENTITY-SCOPE");
  return Object.freeze({...value,...(identified?{identity:Object.freeze(value.identity.map((entry)=>Object.freeze({...entry})))}:{})});
}

/**
 * Closed, public-safe agent-journal event for a command or script offer.
 * No command text, argument, user identity, private path, or raw output is
 * admissible. The record is observational and can never grant authority.
 *
 * R-AC-04: `recoverability` already names WHETHER a mutation needs
 * cleanup/rollback, as a closed category. `requiredCleanup` is a distinct
 * field recording WHAT that required cleanup/readback actually is/was: a
 * stable `cleanupClass` (bounded identifier, same ID pattern as
 * `operation.operationClass`, but naming the follow-up action rather than
 * the original operation), a `status` tracking whether that action has
 * actually been carried out (the "readback" half of the criterion -- a
 * dimension `recoverability` itself never carries), and a `digest`,
 * nullable, of a public-safe governed cleanup/readback procedure artifact
 * (mirrors `operation.governedArtifactSha256`; never raw text). Optional at
 * the key level, exactly like `assumptionState`/`identity` on
 * `validateAgentDecisionEvent` above, so every pre-existing command-offer
 * fixture keeps validating unchanged; when present it is scoped
 * (ADJ-COMMAND-CLEANUP-SCOPE) to only ever accompany a `recoverability`
 * other than `not-applicable` -- recording what cleanup/readback is
 * required only makes sense once WHETHER one is needed has itself been
 * asserted.
 *
 * R-AC-09: `occurredAtEpochMs` is the field this criterion's "stale"
 * clause needs -- until now no timestamp existed anywhere on this shape,
 * so staleness could not be evaluated at all. This module has no notion
 * of "now" or a hard staleness window today, and unilaterally inventing
 * one would be a caller's policy this validator does not own; the
 * criterion's own text ("SHALL render it ... never successful") is a
 * rendering requirement, satisfied by exposing a bounded, comparable
 * timestamp for a caller to judge staleness against its own window, not
 * by embedding a rejection threshold here. Optional at the key level,
 * exactly like `requiredCleanup` above and `assumptionState`/`identity`
 * on `validateAgentDecisionEvent`, so every pre-existing command-offer
 * fixture keeps validating unchanged. Format-validated only -- a
 * non-negative safe integer, matching `occurredAtEpochMs`'s existing
 * meaning on the governance-event envelope (governance-event.mjs) --
 * and never scoped to a particular `state`: every command-offer event in
 * a lifecycle (offer, attempt, outcome, recovery) has its own "when this
 * occurred" fact, and none of them constrain it against another.
 * Deliberately excluded from `external-command-offer.mjs`'s `sameOffer`/
 * `sameRecoveryContext` identity checks for the same reason: a later
 * event in the same lifecycle is expected to carry a different, later
 * timestamp -- that is not substitution.
 *
 * R-AC-09's "duplicated" clause is deliberately NOT addressed by a new
 * field or rule here: `governance-event-store.mjs`'s
 * `appendPortableGovernanceEvent` already detects a duplicate/
 * conflicting submission via its own `idempotencyKey` mechanism
 * (idempotent-replay on an exact match, `GES-IDEMPOTENCY-CONFLICT` on a
 * same-key/different-digest submission), exercised end-to-end for
 * agent-origin events generically by this file's own A-AC-13
 * store-integration test (not command-offer-specific, but the same
 * store code path a wired command-offer append would use).
 * A pre-existing R-AC-13 test in `external-command-offer.test.mjs`
 * documents that duplicate/retry detection is intentionally NOT done at
 * this validation layer, delegated entirely to the caller-supplied
 * `append()`; this function has no visibility into prior events to
 * compare against in any case. Building a second duplicate-detection
 * mechanism here would both contradict that documented design and be
 * redundant with the store layer's existing one.
 *
 * R-AC-11: `commitment`/`commitmentReceiptId` are the public-safe half of
 * a private-only handoff detail this record's own `omissions` already
 * mandates be excluded (`raw-command`, `private-coordinates`, etc.). The
 * detail itself never appears on this shape -- only a SHA-256 `commitment`
 * digest of it (the same `SHA` pattern already used for `candidateDigest`/
 * `policyDigest`) and an opaque `commitmentReceiptId` (the same `ID`
 * pattern already used for every other identifier on this shape),
 * correlating to wherever the detail was actually stored: sanctioned
 * restricted machine-local state (`governance-event-store.mjs`'s
 * `putRestrictedGovernanceEvent`/`queryRestrictedGovernanceEvent`), never
 * this journal. Two flat top-level keys, not a nested object, deliberately
 * mirroring `document-lifecycle.mjs`'s `receiptId`+`commitment` pairing
 * convention field-for-field rather than inventing a third shape
 * convention for a "receipt+digest" pair; named `commitmentReceiptId`
 * rather than a bare `receiptId` because, unlike `document-lifecycle.mjs`,
 * this shape already carries several other unrelated identifiers
 * (`offerEventId`, `relatedHumanDecisionId`, `supersedesEventId`) and a
 * bare `receiptId` would be ambiguous about which of those it correlates
 * to. Optional at the key level, exactly like `requiredCleanup`/
 * `occurredAtEpochMs` above, so every pre-existing command-offer fixture
 * keeps validating unchanged; unlike `document-lifecycle.mjs`'s own
 * always-present-but-nullable `receiptId`/`commitment` keys, this shape
 * reuses ITS OWN existing optional-key (`Object.hasOwn`) convention
 * instead, so the two keys' PRESENCE, not a null value, encodes "no
 * commitment was exposed" -- WHEN policy permits exposing one (R-AC-11's
 * own qualifier), a caller sets both; otherwise neither is present at
 * all. Both-or-neither is enforced (ADJ-COMMAND-COMMITMENT-PAIRING): a
 * commitment digest with no receipt to correlate it against, or a receipt
 * id with no digest proving knowledge of the detail, is malformed either
 * way.
 */
export function validateCommandOfferEvent(value) {
  const keys=["eventId","kind","state","reasonCode","candidateDigest","relatedHumanDecisionId","supersedesEventId","offerOrigin","operation","target","sideEffectClass","authorityRequirement","policyDigest","redactionPolicyDigest","executionAssurance","omissions","offerEventId","preEvidenceDigest","postEvidenceDigest","recoverability"];
  const hasRequiredCleanup=rec(value)&&Object.hasOwn(value,"requiredCleanup");
  const hasOccurredAtEpochMs=rec(value)&&Object.hasOwn(value,"occurredAtEpochMs");
  const hasCommitment=rec(value)&&Object.hasOwn(value,"commitment");
  const hasCommitmentReceiptId=rec(value)&&Object.hasOwn(value,"commitmentReceiptId");
  const extended=[...keys,...(hasRequiredCleanup?["requiredCleanup"]:[]),...(hasOccurredAtEpochMs?["occurredAtEpochMs"]:[]),...(hasCommitment?["commitment"]:[]),...(hasCommitmentReceiptId?["commitmentReceiptId"]:[])];
  const validRequiredCleanup=(cleanup)=>exact(cleanup,["cleanupClass","status","digest"])&&ID.test(cleanup.cleanupClass)&&CLEANUP_STATUSES.has(cleanup.status)&&(cleanup.digest===null||SHA.test(cleanup.digest));
  if(!exact(value,extended)||value.kind!=="command-offer"||!ID.test(value.eventId)||!COMMAND_STATES.has(value.state)||(typeof value.reasonCode!=="string"||!CODE.test(value.reasonCode))||!SHA.test(value.candidateDigest)||(value.relatedHumanDecisionId!==null&&!ID.test(value.relatedHumanDecisionId))||(value.supersedesEventId!==null&&!ID.test(value.supersedesEventId))||!["pipeline-initiated","user-requested-pipeline-supplied"].includes(value.offerOrigin)||!exact(value.operation,["operationClass","version","governedArtifactSha256"])||!ID.test(value.operation.operationClass)||(value.operation.version!==null&&!ID.test(value.operation.version))||(value.operation.governedArtifactSha256!==null&&!SHA.test(value.operation.governedArtifactSha256))||!exact(value.target,["repositoryFingerprint","scopeDigest"])||!SHA.test(value.target.repositoryFingerprint)||!SHA.test(value.target.scopeDigest)||!["non-authoritative","destructive","guard-bypass","authority-changing"].includes(value.sideEffectClass)||!["not-required","human-decision-required"].includes(value.authorityRequirement)||!SHA.test(value.policyDigest)||!SHA.test(value.redactionPolicyDigest)||!COMMAND_ASSURANCE.has(value.executionAssurance)||!Array.isArray(value.omissions)||value.omissions.length<4||value.omissions.length>7||new Set(value.omissions).size!==value.omissions.length||value.omissions.some((entry)=>!OMITTABLE.has(entry))||!["raw-command","arguments","private-coordinates","unrestricted-output"].every((entry)=>value.omissions.includes(entry))||(value.offerEventId!==null&&!ID.test(value.offerEventId))||(value.preEvidenceDigest!==null&&!SHA.test(value.preEvidenceDigest))||(value.postEvidenceDigest!==null&&!SHA.test(value.postEvidenceDigest))||!["not-applicable","recoverable","cleanup-required","rollback-required"].includes(value.recoverability)||(hasRequiredCleanup&&!validRequiredCleanup(value.requiredCleanup))||(hasOccurredAtEpochMs&&!(Number.isSafeInteger(value.occurredAtEpochMs)&&value.occurredAtEpochMs>=0))||(hasCommitment&&!SHA.test(value.commitment))||(hasCommitmentReceiptId&&!ID.test(value.commitmentReceiptId)))fail("ADJ-COMMAND-OFFER");
  if(value.authorityRequirement==="human-decision-required"&&value.relatedHumanDecisionId===null)fail("ADJ-COMMAND-AUTHORITY");
  if(value.state==="offered"&&(value.offerEventId!==null||value.executionAssurance!=="not-applicable"||value.preEvidenceDigest!==null||value.postEvidenceDigest!==null))fail("ADJ-COMMAND-OFFER");
  if(value.state!=="offered"&&value.offerEventId===null)fail("ADJ-COMMAND-LINK");
  if(value.state==="attempted"&&value.executionAssurance!=="attempted")fail("ADJ-COMMAND-OUTCOME");
  if(value.state==="execution-unobserved"&&value.executionAssurance!=="execution-unobserved")fail("ADJ-COMMAND-OUTCOME");
  if(["observed-completed","readback-verified","failed","partial","cancelled","unknown","unavailable","readback-mismatch"].includes(value.state)&&value.executionAssurance!==value.state)fail("ADJ-COMMAND-OUTCOME");
  /**
   * R-AC-08: an occurred recovery fact is structurally bound to the prospective
   * requirement it discharges -- `rollback-performed` only ever on a
   * `rollback-required` record, `cleanup-performed` only on a `cleanup-required`
   * one -- so no caller (this validator's users included, not only
   * `external-command-offer.mjs`) can assert that a rollback happened for a
   * mutation nothing ever recorded as needing one. `executionAssurance` is
   * pinned to `not-applicable` because it grades the OFFERED command's
   * execution; an undo action carries no new claim about that, and leaving it
   * free would let a `rollback-performed` event label itself
   * `observed-completed` (R-AC-06). Additive: no pre-existing state's rules
   * change, and both constraints only refuse.
   */
  if((value.state==="rollback-performed"||value.state==="cleanup-performed")&&(value.executionAssurance!=="not-applicable"||value.recoverability!==(value.state==="rollback-performed"?"rollback-required":"cleanup-required")))fail("ADJ-COMMAND-OCCURRENCE-SCOPE");
  if(hasRequiredCleanup&&value.recoverability==="not-applicable")fail("ADJ-COMMAND-CLEANUP-SCOPE");
  if(hasCommitment!==hasCommitmentReceiptId)fail("ADJ-COMMAND-COMMITMENT-PAIRING");
  return Object.freeze({...value,operation:Object.freeze({...value.operation}),target:Object.freeze({...value.target}),omissions:Object.freeze([...value.omissions]),...(hasRequiredCleanup?{requiredCleanup:Object.freeze({...value.requiredCleanup})}:{})});
}

/**
 * H-AC-08: a pre-Phoenix or external approval/override/deploy record whose
 * original authority tuple cannot be reproven. Imported only as this closed,
 * explicitly unverified observation, never as an authority-bearing event; it
 * rides the existing, unmodified `origin === "agent"` ->
 * `authorityClass: "non-authoritative"` binding (governance-event.mjs:175),
 * so it structurally cannot satisfy a gate.
 */
export function validateLegacyImportObservationEvent(value) {
  const keys=["eventId","kind","state","reasonCode","candidateDigest","relatedHumanDecisionId","supersedesEventId","legacySourceClass","authorityProofStatus","sourceReferencePath","sourceReferenceDigest"];
  if(!exact(value,keys)||value.kind!=="legacy-import-observation"||!ID.test(value.eventId)||!STATES.has(value.state)||(typeof value.reasonCode!=="string"||!CODE.test(value.reasonCode))||!SHA.test(value.candidateDigest)||(value.relatedHumanDecisionId!==null&&!ID.test(value.relatedHumanDecisionId))||(value.supersedesEventId!==null&&!ID.test(value.supersedesEventId))||!LEGACY_SOURCE_CLASSES.has(value.legacySourceClass)||!AUTHORITY_PROOF_STATUSES.has(value.authorityProofStatus)||(value.sourceReferencePath!==null&&!SOURCE_PATH.test(value.sourceReferencePath))||(value.sourceReferenceDigest!==null&&!SHA.test(value.sourceReferenceDigest)))fail("ADJ-LEGACY-SHAPE");
  if(value.state==="superseded"&&value.supersedesEventId===null)fail("ADJ-SUPERSESSION");
  return Object.freeze({...value});
}

/**
 * A-AC-07: which of the seven named `EVENT_CLASSES` a validated event
 * represents, so a capture-policy `mandatory` marking can be recognized
 * without a parallel tagging scheme. Every event this module admits is
 * already `candidate`-bound (`candidateDigest` is required on all three
 * shapes) and already subject to the unconditional, policy-independent
 * `personalIdentifiability`/`contextualIdentifiability` "prohibited" gate at
 * `governance-event-store.mjs` (`assertPortablePayload`), so both are always
 * represented -- that gate already fails closed for every portable event,
 * capture decision or not, which is a stronger guarantee than "marked
 * mandatory". `authority` is `relatedHumanDecisionId !== null` (the A-AC-04
 * correlation field, present on all three shapes) or, for a command offer,
 * `authorityRequirement === "human-decision-required"`. `verification-scope`
 * is the existing `kind` of that name. The remaining three are only ever
 * representable on a `command-offer`: the offer's existence itself is
 * `external-side-effect` (it is the one shape whose whole purpose is
 * proposing an external command/script); `security` is a `sideEffectClass`
 * of `guard-bypass`, `authority-changing`, or `destructive`
 * (`SECURITY_SIDE_EFFECTS`); `recovery` is any `recoverability` other than
 * `not-applicable`. No new `kind` was needed for any of the seven.
 */
export function representedEventClasses(value) {
  const classes=new Set(["candidate","privacy"]);
  if(value.relatedHumanDecisionId!==null)classes.add("authority");
  if(value.kind==="verification-scope")classes.add("verification-scope");
  if(value.kind==="command-offer"){
    classes.add("external-side-effect");
    if(SECURITY_SIDE_EFFECTS.has(value.sideEffectClass))classes.add("security");
    if(value.recoverability!=="not-applicable")classes.add("recovery");
    if(value.authorityRequirement==="human-decision-required")classes.add("authority");
  }
  return classes;
}

/**
 * A-AC-10: the explicit per-event-class fail-open/fail-closed policy that
 * applies when agent journaling is UNAVAILABLE. Deliberately one closed table
 * rather than scattered if-statements or a fallback default: every one of the
 * seven `EVENT_CLASSES` must carry an explicit disposition, and the
 * module-load check below fails closed if the two sets ever drift, so a newly
 * added class can never inherit an unstated default.
 *
 * This is a DIFFERENT axis from A-AC-07's `mandatoryEventClasses`
 * (`governance-event-store.mjs`), which today marks all seven mandatory. That
 * policy governs a discretionary caller choice to sample an event out while
 * journaling WORKS; this one governs the involuntary case where nothing can be
 * recorded at all. Reusing A-AC-07's marking here would mark every class
 * fail-closed and silently delete R-AC-10's already-shipped, already-tested
 * non-material exception, so the dispositions are derived from this codebase's
 * ACTUAL journaling-unavailable behavior instead:
 *
 *  - `security`, `authority`, `recovery`, `verification-scope` -> fail-closed.
 *    Exactly the classes whose presence is what makes an event material:
 *    `security` is a guard-bypass/authority-changing/destructive
 *    `sideEffectClass`, `authority` is a bound human decision or a
 *    `human-decision-required` offer, `recovery` is any `recoverability` other
 *    than `not-applicable`, `verification-scope` is a claim about what was
 *    checked. `external-command-offer.mjs` already refuses every one of them
 *    without a journal today; the table states that, it does not invent it.
 *  - `candidate`, `privacy` -> fail-open. Not a materiality judgment: both are
 *    represented by EVERY event this module admits (see
 *    `representedEventClasses`), so they discriminate nothing, and marking
 *    either fail-closed would collapse the table into "always closed" and
 *    contradict R-AC-10's existing carve-out. `privacy` separately keeps a
 *    stronger, policy-independent guarantee elsewhere -- `assertPortablePayload`'s
 *    unconditional prohibited-identifiability gate, which depends on no
 *    capture or availability decision.
 *  - `external-side-effect` -> fail-open, for the same structural reason: every
 *    `command-offer` represents it, so it cannot be the discriminator. An
 *    offer's dangerous sub-cases are separately represented by
 *    `security`/`authority`/`recovery` above, which is precisely the
 *    distinction R-AC-10's non-material exception already draws.
 *
 * Composition is strictest-wins (`resolveJournalingUnavailability`): an event
 * represents a SET of classes and one fail-closed member closes the whole
 * event. The resulting fail-open set is a strict SUBSET of what R-AC-10
 * already admits, never a superset -- this table loosens no existing outcome.
 */
export const JOURNALING_UNAVAILABLE_DISPOSITIONS=Object.freeze({security:"fail-closed",privacy:"fail-open",authority:"fail-closed",candidate:"fail-open","external-side-effect":"fail-open",recovery:"fail-closed","verification-scope":"fail-closed"});
const DISPOSITIONS=new Set(["fail-open","fail-closed"]);
/** Fails at import, not at first use: an undeclared class must never reach a caller as an implicit default. */
if(Object.keys(JOURNALING_UNAVAILABLE_DISPOSITIONS).length!==EVENT_CLASSES.size||![...EVENT_CLASSES].every((entry)=>DISPOSITIONS.has(JOURNALING_UNAVAILABLE_DISPOSITIONS[entry])))fail("ADJ-JOURNALING-POLICY-INCOMPLETE");

/** The declared disposition for one event class; an unknown or undeclared class is refused rather than defaulted. */
export function journalingUnavailableDisposition(eventClass) {
  if(!EVENT_CLASSES.has(eventClass)||!Object.hasOwn(JOURNALING_UNAVAILABLE_DISPOSITIONS,eventClass))fail("ADJ-JOURNALING-POLICY-UNDECLARED");
  return JOURNALING_UNAVAILABLE_DISPOSITIONS[eventClass];
}

/**
 * A-AC-10's second half -- "expose the gap". Returns a closed, frozen,
 * public-safe gap record in BOTH directions (a caller that fails closed
 * attaches this same record to its typed error), never a bare boolean and
 * never silence, so the caller can observe WHICH policy fired, WHICH classes
 * decided it, and that an event went unrecorded -- not merely the
 * proceed/refuse outcome. `decidingEventClasses` is the full sorted list of
 * fail-closed members rather than a first hit, so the record is deterministic
 * and does not depend on set iteration order.
 *
 * The record is deliberately not a receipt: `schema` is unique to this path,
 * `journaled` is always false, and it carries no command `status`, so it can
 * never be read as evidence that anything was journaled or executed.
 */
export function resolveJournalingUnavailability(value) {
  const event=validateAgentDecisionEvent(value);
  const eventClasses=[...representedEventClasses(event)].sort();
  const decidingEventClasses=eventClasses.filter((entry)=>journalingUnavailableDisposition(entry)==="fail-closed");
  return Object.freeze({schema:"pipeline.agent-journaling-gap.v1",authority:"non-authoritative",gap:"agent-journaling-unavailable",journaled:false,disposition:decidingEventClasses.length>0?"fail-closed":"fail-open",eventClasses:Object.freeze(eventClasses),decidingEventClasses:Object.freeze(decidingEventClasses),eventId:event.eventId,candidateDigest:event.candidateDigest});
}
