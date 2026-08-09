// SPDX-License-Identifier: SUL-1.0
/** Closed PHX-4 agent assumptions/selection payload; observational only. */
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u, CODE=/^[A-Z][A-Z0-9._:-]{0,127}$/u, SHA=/^[a-f0-9]{64}$/u;
const KINDS=new Set(["assumption","selection","verification-scope","fallback","escalation"]), STATES=new Set(["declared","verified","contradicted","expired","invalidated","superseded"]);
/** A-AC-11: the epistemic ground a claim was held on, a separate axis from the claim lifecycle `state`; the two never collapse into one enum. */
const ASSUMPTION_STATES=new Set(["assumed","inferred","observed","verified","contradicted","unavailable","unknown"]);
/** A-AC-05: identity provenance/assurance, admissible only on the kinds where an identity choice is material to the decision being recorded (`selection`, `escalation`, `fallback`); `assumption`/`verification-scope` never carry it. */
const IDENTITY_DIMENSIONS=new Set(["runner","model","effort","profile","role","adapter","capability"]), IDENTITY_PROVENANCE=new Set(["same-dispatch-observed","requested-route","inherited-session","unknown"]), IDENTITY_ASSURANCE=new Set(["verified","reported","inferred","unknown"]), IDENTITY_KINDS=new Set(["selection","escalation","fallback"]);
const COMMAND_STATES=new Set(["offered","acknowledged","authorized","copied","attempted","execution-unobserved","observed-completed","readback-verified","failed","partial","cancelled","unknown","unavailable","readback-mismatch","recovery-proposed","recovered"]);
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
 */
export function validateAgentDecisionEvent(value) {
  const keys=["eventId","kind","state","reasonCode","candidateDigest","relatedHumanDecisionId","supersedesEventId"];
  if(value?.kind==="command-offer") return validateCommandOfferEvent(value);
  if(value?.kind==="legacy-import-observation") return validateLegacyImportObservationEvent(value);
  const epistemic=rec(value)&&Object.hasOwn(value,"assumptionState");
  const identified=rec(value)&&Object.hasOwn(value,"identity");
  const extended=[...keys,...(epistemic?["assumptionState"]:[]),...(identified?["identity"]:[])];
  if(!exact(value,extended)||!ID.test(value.eventId)||!KINDS.has(value.kind)||!STATES.has(value.state)||(epistemic&&!ASSUMPTION_STATES.has(value.assumptionState))||(identified&&!validIdentity(value.identity))||!CODE.test(value.reasonCode)||!SHA.test(value.candidateDigest)||(value.relatedHumanDecisionId!==null&&(!ID.test(value.relatedHumanDecisionId)))||(value.supersedesEventId!==null&&!ID.test(value.supersedesEventId)))fail("ADJ-SHAPE");
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
 */
export function validateCommandOfferEvent(value) {
  const keys=["eventId","kind","state","reasonCode","candidateDigest","relatedHumanDecisionId","supersedesEventId","offerOrigin","operation","target","sideEffectClass","authorityRequirement","policyDigest","redactionPolicyDigest","executionAssurance","omissions","offerEventId","preEvidenceDigest","postEvidenceDigest","recoverability"];
  const hasRequiredCleanup=rec(value)&&Object.hasOwn(value,"requiredCleanup");
  const hasOccurredAtEpochMs=rec(value)&&Object.hasOwn(value,"occurredAtEpochMs");
  const extended=[...keys,...(hasRequiredCleanup?["requiredCleanup"]:[]),...(hasOccurredAtEpochMs?["occurredAtEpochMs"]:[])];
  const validRequiredCleanup=(cleanup)=>exact(cleanup,["cleanupClass","status","digest"])&&ID.test(cleanup.cleanupClass)&&CLEANUP_STATUSES.has(cleanup.status)&&(cleanup.digest===null||SHA.test(cleanup.digest));
  if(!exact(value,extended)||value.kind!=="command-offer"||!ID.test(value.eventId)||!COMMAND_STATES.has(value.state)||!CODE.test(value.reasonCode)||!SHA.test(value.candidateDigest)||(value.relatedHumanDecisionId!==null&&!ID.test(value.relatedHumanDecisionId))||(value.supersedesEventId!==null&&!ID.test(value.supersedesEventId))||!["pipeline-initiated","user-requested-pipeline-supplied"].includes(value.offerOrigin)||!exact(value.operation,["operationClass","version","governedArtifactSha256"])||!ID.test(value.operation.operationClass)||(value.operation.version!==null&&!ID.test(value.operation.version))||(value.operation.governedArtifactSha256!==null&&!SHA.test(value.operation.governedArtifactSha256))||!exact(value.target,["repositoryFingerprint","scopeDigest"])||!SHA.test(value.target.repositoryFingerprint)||!SHA.test(value.target.scopeDigest)||!["non-authoritative","destructive","guard-bypass","authority-changing"].includes(value.sideEffectClass)||!["not-required","human-decision-required"].includes(value.authorityRequirement)||!SHA.test(value.policyDigest)||!SHA.test(value.redactionPolicyDigest)||!COMMAND_ASSURANCE.has(value.executionAssurance)||!Array.isArray(value.omissions)||value.omissions.length<4||value.omissions.length>7||new Set(value.omissions).size!==value.omissions.length||value.omissions.some((entry)=>!OMITTABLE.has(entry))||!["raw-command","arguments","private-coordinates","unrestricted-output"].every((entry)=>value.omissions.includes(entry))||(value.offerEventId!==null&&!ID.test(value.offerEventId))||(value.preEvidenceDigest!==null&&!SHA.test(value.preEvidenceDigest))||(value.postEvidenceDigest!==null&&!SHA.test(value.postEvidenceDigest))||!["not-applicable","recoverable","cleanup-required","rollback-required"].includes(value.recoverability)||(hasRequiredCleanup&&!validRequiredCleanup(value.requiredCleanup))||(hasOccurredAtEpochMs&&!(Number.isSafeInteger(value.occurredAtEpochMs)&&value.occurredAtEpochMs>=0)))fail("ADJ-COMMAND-OFFER");
  if(value.authorityRequirement==="human-decision-required"&&value.relatedHumanDecisionId===null)fail("ADJ-COMMAND-AUTHORITY");
  if(value.state==="offered"&&(value.offerEventId!==null||value.executionAssurance!=="not-applicable"||value.preEvidenceDigest!==null||value.postEvidenceDigest!==null))fail("ADJ-COMMAND-OFFER");
  if(value.state!=="offered"&&value.offerEventId===null)fail("ADJ-COMMAND-LINK");
  if(value.state==="attempted"&&value.executionAssurance!=="attempted")fail("ADJ-COMMAND-OUTCOME");
  if(value.state==="execution-unobserved"&&value.executionAssurance!=="execution-unobserved")fail("ADJ-COMMAND-OUTCOME");
  if(["observed-completed","readback-verified","failed","partial","cancelled","unknown","unavailable","readback-mismatch"].includes(value.state)&&value.executionAssurance!==value.state)fail("ADJ-COMMAND-OUTCOME");
  if(hasRequiredCleanup&&value.recoverability==="not-applicable")fail("ADJ-COMMAND-CLEANUP-SCOPE");
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
  if(!exact(value,keys)||value.kind!=="legacy-import-observation"||!ID.test(value.eventId)||!STATES.has(value.state)||!CODE.test(value.reasonCode)||!SHA.test(value.candidateDigest)||(value.relatedHumanDecisionId!==null&&!ID.test(value.relatedHumanDecisionId))||(value.supersedesEventId!==null&&!ID.test(value.supersedesEventId))||!LEGACY_SOURCE_CLASSES.has(value.legacySourceClass)||!AUTHORITY_PROOF_STATUSES.has(value.authorityProofStatus)||(value.sourceReferencePath!==null&&!SOURCE_PATH.test(value.sourceReferencePath))||(value.sourceReferenceDigest!==null&&!SHA.test(value.sourceReferenceDigest)))fail("ADJ-LEGACY-SHAPE");
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
