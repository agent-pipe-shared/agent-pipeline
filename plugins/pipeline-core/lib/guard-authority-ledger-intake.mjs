// SPDX-License-Identifier: SUL-1.0
/**
 * Pure builders that turn GMW/HGO producer facts into validated PHX-2 human
 * governance decisions and portable append intents.
 *
 * Design: specs/sprint-phoenix-epic/design/gmw-hgo-evidence-intake-into-the-human-ledger.md
 * (§5.5 policyDigest preimage, §7.2 append intent, §7.3 deterministic ids,
 * §7.4 GMW sequence, §7.5 HGO sequence).
 *
 * This module performs **no** file, process, environment, clock or randomness
 * access (§7.1). Every time value, every digest of file bytes, and every
 * stream-state observation is a caller-supplied parameter, so the whole
 * receiving contract stays unit-testable and independent of the producers'
 * function signatures.
 *
 * Two exclusions are load-bearing rather than incidental (§5.1, §5.2 R-1):
 * the free-form operator `reason` and the `nonce` of GMW's signed subject are
 * never read here, and no trust-anchor value (`keyReference`,
 * `publicKeySha256`, or anything derived from either at any depth) enters any
 * output. `policyDigest`'s preimage is closed and enumerated below precisely so
 * that property can be verified constructively instead of by blocklist.
 */
import { canonicalSha256, validateGovernanceEventEnvelope } from "./governance-event.mjs";
import { validateHumanGovernanceDecision } from "./human-governance-decision.mjs";
import { LIFTABLE_RULE_IDS, MAX_WINDOW_TTL_MS } from "./guard-maintenance-window.mjs";

/**
 * Pinned copy of GMW's module-private `LIFTABLE_TP_PREFIX` (§5.5). The literal
 * is duplicated rather than requesting a widened export surface from a module
 * another session owns; U-6 pins the copy against the exported
 * `isLiftableRuleId`, which is the observable form of the same catalogue.
 */
export const LIFTABLE_RULE_PREFIX = "TP-";

export const WINDOW_POLICY_PREIMAGE_SCHEMA = "pipeline.guard-authority-intake-policy.v1";
export const WINDOW_PROOF_REQUIREMENT = "detached-ed25519-over-intent-digest";

export const WINDOW_PACKAGE_ID = "guard-maintenance-window";
export const WINDOW_ACTION = "GUARD.MAINTENANCE.LIFT";
export const OVERRIDE_PACKAGE_ID = "human-guard-override";
export const ENVIRONMENT = "local-checkout";

/** §5.3: the code the intake records when the signed subject carries none. */
export const WINDOW_REASON_CODE_UNATTESTED = "GUARD.MAINTENANCE.WINDOW_UNATTESTED";
/** §7.4 step 2 / §6: an explicit `close` narrowed the capability away. */
export const WINDOW_REASON_CODE_CLOSED = "GUARD.MAINTENANCE.CLOSED";
/** §7.4 step (e) / §8.2 row 3: the grant was recorded but no window armed. */
export const WINDOW_REASON_CODE_NOT_ARMED = "GUARD.MAINTENANCE.NOT_ARMED";
/**
 * §6/§7.5 require a distinct lazy `expired` disposition for a window but never
 * name its code; this literal completes the `GUARD.MAINTENANCE.*` family the
 * two codes above establish. Disclosed as a filled design gap.
 */
export const WINDOW_REASON_CODE_EXPIRED = "GUARD.MAINTENANCE.EXPIRED";

/** §7.5's table, verbatim. */
export const OVERRIDE_REASON_CODE_DENIED = "GUARD.OVERRIDE.DENIED";
export const OVERRIDE_REASON_CODE_AUTHORIZED = "GUARD.OVERRIDE.AUTHORIZED";
export const OVERRIDE_REASON_CODE_EXPIRED = "GUARD.OVERRIDE.EXPIRED";
export const OVERRIDE_REASON_CODE_DRIFT = "GUARD.OVERRIDE.DRIFT";

const WINDOW_DISPOSITION_REASON_CODES = new Set([WINDOW_REASON_CODE_CLOSED, WINDOW_REASON_CODE_NOT_ARMED]);

/**
 * §4: the two HGO consumption actions. The capability itself carries no channel
 * field (`CAPABILITY_KEYS` has none), and §7.5's one-word gloss "from the
 * consumption mode" cannot be the source — HGO's `mode` is
 * `standard`/`pipeline-author-repair`/`global-plugin-install`, never
 * signature/chat. The channel is therefore a required caller input drawn from
 * this closed set; this module never guesses it from `mode`.
 */
const OVERRIDE_ACTION_BY_CHANNEL = Object.freeze({
  signature: "GUARD.OVERRIDE.CONSUME.SIGNATURE",
  chat: "GUARD.OVERRIDE.CONSUME.CHAT",
});

/** §7.2: the six portable event types this path can produce. */
const EVENT_TYPE_BY_EVENT = Object.freeze({
  requested: "human.requested",
  granted: "human.granted",
  denied: "human.denied",
  consumed: "human.consumed",
  revoked: "human.revoked",
  expired: "human.expired",
});

const SHA256 = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const CODE = /^[A-Z][A-Z0-9._:-]{0,127}$/u;
const ARTIFACT_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/u;

const OMITTED_BY_POLICY = Object.freeze({ state: "omitted-by-policy" });
const UNAVAILABLE = Object.freeze({ state: "unavailable" });

export class GuardAuthorityIntakeError extends Error {
  constructor(code, message = "Guard authority ledger intake input is invalid.") {
    super(message);
    this.name = "GuardAuthorityIntakeError";
    this.code = code;
  }
}

function fail(code, message) { throw new GuardAuthorityIntakeError(code, message); }

function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

function requireDigest(value, what) {
  if (typeof value !== "string" || !SHA256.test(value)) fail("GAL-INPUT", `${what} must be a sha-256 hex digest`);
  return value;
}

function requireSafeInteger(value, what) {
  if (!Number.isSafeInteger(value) || value < 0) fail("GAL-INPUT", `${what} must be a non-negative safe integer`);
  return value;
}

function requireGeneration(generation) {
  if (!Number.isSafeInteger(generation) || generation < 0) fail("GAL-INPUT", "generation must be a non-negative safe integer");
  return generation;
}

function requireArtifactEntry(value, what) {
  if (!isRecord(value) || typeof value.path !== "string" || !ARTIFACT_PATH.test(value.path) || !SHA256.test(value.sha256)) {
    fail("GAL-INPUT", `${what} must be {path, sha256} with a repository-relative path`);
  }
  return { path: value.path, sha256: value.sha256 };
}

// ---------------------------------------------------------------------------------
// §7.3 deterministic identifiers
// ---------------------------------------------------------------------------------

const PRODUCERS = new Set(["gmw", "hgo"]);

/**
 * §7.3 derives every identifier from the request digest and the stream state
 * itself, never from a clock or a nonce. That is what makes the store's
 * idempotency branch — not an `assertAppend` precondition — the place the
 * identical-request race is decided, and it is the property U-4 pins.
 *
 * §7.3 names only the GMW forms. HGO's per-decision digest is
 * `capability.requestSha256`, so the same scheme is applied under the `hgo`
 * producer prefix; the default stays `gmw`, which is §7.3's literal contract.
 */
function decisionId(kind, { intentSha256, generation, producer = "gmw" } = {}, withGeneration) {
  if (!PRODUCERS.has(producer)) fail("GAL-INPUT", "producer must be \"gmw\" or \"hgo\"");
  requireDigest(intentSha256, "intentSha256");
  const i32 = intentSha256.slice(0, 32);
  const id = withGeneration ? `${producer}-${kind}-${i32}-${requireGeneration(generation)}` : `${producer}-${kind}-${i32}`;
  if (!ID.test(id)) fail("GAL-INPUT", "the derived decisionId is not a valid identifier");
  return id;
}

/** `<producer>-request-<i32>` — one per signed request, appended once (§7.3). */
export function requestDecisionId(request) { return decisionId("request", request, false); }

/** `<producer>-grant-<i32>-<g>`, `g` = grants already linked to the request (§7.3). */
export function grantDecisionId(request) { return decisionId("grant", request, true); }

/** `<producer>-revoke-<i32>-<g>` (§7.3). */
export function revokeDecisionId(request) { return decisionId("revoke", request, true); }

/** `<producer>-expired-<i32>-<g>` (§7.3). */
export function expireDecisionId(request) { return decisionId("expired", request, true); }

/**
 * `<producer>-deny-<i32>-<g>`. §7.5 requires a `denied` event; §7.3 names no id
 * for it, so the same generation-suffixed scheme is extended. Disclosed as a
 * filled design gap.
 */
export function denyDecisionId(request) { return decisionId("deny", request, true); }

// ---------------------------------------------------------------------------------
// §5.5 policyDigest preimages
// ---------------------------------------------------------------------------------

/**
 * The closed, enumerated GMW preimage of §5.5. Nothing else can enter it, so no
 * future input can smuggle the trust anchor in sideways: neither `keyReference`
 * nor `publicKeySha256` nor any value computed from either appears here at any
 * depth. Two different approvers signing on the same policy revision produce
 * the same digest — the property that distinguishes a policy digest from a
 * pseudonym.
 */
export function windowPolicyDigestPreimage({ policyRevision, approvalKind } = {}) {
  if (typeof policyRevision !== "string" || policyRevision === "") fail("GAL-INPUT", "intent.value.policyRevision is required");
  if (typeof approvalKind !== "string" || approvalKind === "") fail("GAL-INPUT", "intent.value.kind is required");
  return {
    schema: WINDOW_POLICY_PREIMAGE_SCHEMA,
    policyRevision,
    approvalKind,
    proofRequirement: WINDOW_PROOF_REQUIREMENT,
    liftableRuleIds: [...LIFTABLE_RULE_IDS],
    liftableRulePrefix: LIFTABLE_RULE_PREFIX,
    maxWindowTtlMs: MAX_WINDOW_TTL_MS,
  };
}

function windowPolicyDigest(intentValue) {
  return canonicalSha256(windowPolicyDigestPreimage({
    policyRevision: intentValue.policyRevision,
    approvalKind: intentValue.kind,
  }));
}

/**
 * §5.5: HGO's `policyDigest` is `canonicalSha256(capability.policy)` — the exact
 * `policyIdentity` object HGO already computes, MACs into the capability and
 * re-checks at consume time. Every input is a digest of content (shipped guard
 * implementations plus repository-relative policy files); no key material, no
 * free text, no path outside the repository.
 */
function overridePolicyDigest(policy) {
  if (!isRecord(policy) || !Array.isArray(policy.guards) || !Array.isArray(policy.project)) {
    fail("GAL-INPUT", "capability.policy must be policyIdentity's {guards, project} shape");
  }
  return canonicalSha256(policy);
}

// ---------------------------------------------------------------------------------
// §7.4 GMW builders
// ---------------------------------------------------------------------------------

/**
 * §4: `ruleDigest` is re-derivable against the closed public catalogue
 * (`LIFTABLE_RULE_IDS` + the `TP-` prefix).
 */
function windowRuleDigest(subject) {
  return canonicalSha256({ scopeRuleIds: [...subject.scopeRuleIds], openingTreeSha256: subject.openingTreeSha256 });
}

/**
 * §5.3: the portable reason code is a separate, stable code, never a
 * transformation of — and never a digest of — the operator's free text. A
 * subject that carries a `reasonCode` that is not a valid code fails closed
 * rather than degrading silently to the unattested value.
 */
function windowReasonCode(subject) {
  if (!Object.hasOwn(subject, "reasonCode") || subject.reasonCode === undefined || subject.reasonCode === null) {
    return WINDOW_REASON_CODE_UNATTESTED;
  }
  if (typeof subject.reasonCode !== "string" || !CODE.test(subject.reasonCode)) {
    fail("GAL-REASON-CODE", "subject.reasonCode is present but is not a stable upper-case code");
  }
  return subject.reasonCode;
}

/**
 * §4/§7.4: the enforcement path's own formula, `min(signed expiresAtMs,
 * installedAtMs + MAX_WINDOW_TTL_MS)`. `installedAtMs` is the single clock read
 * the caller takes once and passes to both this builder and
 * `installGuardMaintenanceWindow`, so `notBeforeEpochMs` *is* that process's
 * `installedAtMs` rather than an approximation of it.
 */
export function windowValidity({ signedExpiresAtMs, installedAtMs } = {}) {
  requireSafeInteger(installedAtMs, "installedAtMs");
  if (!Number.isSafeInteger(signedExpiresAtMs)) fail("GAL-INPUT", "subject.expiresAtMs must be a safe integer");
  return {
    notBeforeEpochMs: installedAtMs,
    expiresAtEpochMs: Math.min(signedExpiresAtMs, installedAtMs + MAX_WINDOW_TTL_MS),
    singleUse: false,
  };
}

/**
 * Reads exactly the signed fields §4 maps, and deliberately not
 * `subject.reason`, `subject.nonce` or `subject.repoFingerprintSha256` (§5.1
 * exclusions 3 and 4). The repository fingerprint is the *ledger's*
 * (`derivePoGateRepositoryFingerprint`), never GMW's own — a different preimage
 * (A-6), and the two are not interchangeable.
 */
function windowCore({ intent, subject, repositoryFingerprint, installedAtMs, plan, spec }) {
  if (!isRecord(intent) || !isRecord(intent.value)) fail("GAL-INPUT", "a PO approval intent with a `value` record is required");
  if (!isRecord(subject)) fail("GAL-INPUT", "the signed subject record is required");
  requireDigest(intent.sha256, "intent.sha256");
  requireDigest(repositoryFingerprint, "repositoryFingerprint");
  const value = intent.value;
  if (!isRecord(value.candidate) || !OID.test(String(value.candidate.commit)) || !OID.test(String(value.candidate.tree))) {
    fail("GAL-INPUT", "intent.value.candidate must carry an exact commit and tree");
  }
  if (!Array.isArray(subject.scopeRuleIds) || subject.scopeRuleIds.length === 0
    || subject.scopeRuleIds.some((id) => typeof id !== "string")) fail("GAL-INPUT", "subject.scopeRuleIds is required");
  requireDigest(subject.openingTreeSha256, "subject.openingTreeSha256");

  // §7.4: paths are unsigned and therefore agent-supplied, but a digest match
  // against the signed intent proves the bytes are the ones the PO signed over,
  // so no trust is placed in the path itself. The caller reads the bytes; this
  // builder compares. A mismatch fails closed and no window arms.
  const planArtifact = requireArtifactEntry(plan, "plan");
  const specArtifact = requireArtifactEntry(spec, "spec");
  if (planArtifact.sha256 !== value.planSha256 || specArtifact.sha256 !== value.specSha256) {
    fail("GAL-ARTIFACT-DIGEST", "the supplied plan/spec digests do not match the signed intent");
  }

  return {
    scope: {
      repositoryFingerprint,
      candidate: { commit: value.candidate.commit, tree: value.candidate.tree },
      packageId: WINDOW_PACKAGE_ID,
      action: WINDOW_ACTION,
      environment: ENVIRONMENT,
      artifacts: [planArtifact, specArtifact],
    },
    reasonCode: windowReasonCode(subject),
    policyDigest: windowPolicyDigest(value),
    ruleDigest: windowRuleDigest(subject),
    validity: windowValidity({ signedExpiresAtMs: subject.expiresAtMs, installedAtMs }),
  };
}

const NO_LINKS = Object.freeze({
  requestDecisionId: null,
  consumesDecisionId: null,
  revokesDecisionId: null,
  expiresDecisionId: null,
  supersedesDecisionId: null,
  correctsDecisionId: null,
});

function links(overrides) { return { ...NO_LINKS, ...overrides }; }

function decision({ id, event, outcome, authorityClass, core, link }) {
  return validateHumanGovernanceDecision({
    decisionId: id,
    event,
    outcome,
    authorityClass,
    // §4/H-AC-05, U-5: never upgraded, not even on the cryptographically
    // proof-verified GMW path — the trust anchor is machine-local
    // configuration, and a caller-supplied policy is not proof of its
    // provenance.
    identityAssurance: "locally-attributed",
    // There is no attested time source anywhere in this path.
    timeAssurance: "locally-observed",
    scope: core.scope,
    reasonCode: core.reasonCode,
    policyDigest: core.policyDigest,
    ruleDigest: core.ruleDigest,
    validity: core.validity,
    links: links(link),
  });
}

function requireAuthorityClass(authorityClass) {
  if (typeof authorityClass !== "string" || authorityClass === "") fail("GAL-INPUT", "authorityClass is required");
  return authorityClass;
}

/** §7.4 step (b): appended once per signed request, `outcome: "pending"`, all links null. */
export function buildWindowRequestDecision(request = {}) {
  const core = windowCore(request);
  return decision({
    id: requestDecisionId({ intentSha256: request.intent.sha256 }),
    event: "requested",
    outcome: "pending",
    authorityClass: requireAuthorityClass(request.authorityClass ?? "product-owner"),
    core,
    link: {},
  });
}

/**
 * §7.4 step (c). `links.requestDecisionId` is required, not optional: a
 * `granted` decision without it fails `HGL-LIFECYCLE` (U-2).
 */
export function buildWindowGrantDecision(request = {}) {
  const core = windowCore(request);
  const intentSha256 = request.intent.sha256;
  return decision({
    id: grantDecisionId({ intentSha256, generation: request.generation }),
    event: "granted",
    outcome: "granted",
    authorityClass: requireAuthorityClass(request.authorityClass ?? "product-owner"),
    core,
    link: { requestDecisionId: requestDecisionId({ intentSha256 }) },
  });
}

/**
 * Inherits the grant's scope and digests, following the kernel's own
 * disposition precedent (`createConsumedHumanGovernanceDecision`): a
 * disposition describes the same decision, so it may not restate it
 * differently. The generation is asserted against the grant's own id rather
 * than parsed out of it.
 */
function windowDisposition({ grant, intentSha256, generation, event, reasonCode, idFor, linkKey }) {
  const source = validateHumanGovernanceDecision(grant);
  if (source.event !== "granted" || source.outcome !== "granted") fail("GAL-INPUT", "a granted decision is required to dispose of");
  requireDigest(intentSha256, "intentSha256");
  const expectedGrantId = grantDecisionId({ intentSha256, generation });
  if (source.decisionId !== expectedGrantId) fail("GAL-INPUT", "the grant does not belong to this request digest and generation");
  return decision({
    id: idFor({ intentSha256, generation }),
    event,
    outcome: event,
    authorityClass: source.authorityClass,
    core: {
      scope: source.scope,
      reasonCode,
      policyDigest: source.policyDigest,
      ruleDigest: source.ruleDigest,
      validity: source.validity,
    },
    link: { [linkKey]: source.decisionId },
  });
}

/**
 * §7.4 step (e) and step 2: `GUARD.MAINTENANCE.NOT_ARMED` when the install
 * throws after the grant was recorded, `GUARD.MAINTENANCE.CLOSED` when an
 * explicit close narrowed the capability away. The code is a closed set, so no
 * free text can reach the field.
 */
export function buildWindowRevocationDecision({ grant, intentSha256, generation, reasonCode } = {}) {
  if (!WINDOW_DISPOSITION_REASON_CODES.has(reasonCode)) {
    fail("GAL-REASON-CODE", "a window revocation reason code must be CLOSED or NOT_ARMED");
  }
  return windowDisposition({
    grant, intentSha256, generation, event: "revoked", reasonCode,
    idFor: revokeDecisionId, linkKey: "revokesDecisionId",
  });
}

/**
 * §6/§7.5, D-3: the lazy `expired` disposition an explicit reconcile step
 * appends — never a timer, never the guard read path. Idempotent by
 * `expireDecisionId`.
 */
export function buildWindowExpiryDecision({ grant, intentSha256, generation } = {}) {
  return windowDisposition({
    grant, intentSha256, generation, event: "expired", reasonCode: WINDOW_REASON_CODE_EXPIRED,
    idFor: expireDecisionId, linkKey: "expiresDecisionId",
  });
}

// ---------------------------------------------------------------------------------
// §7.5 HGO builders
// ---------------------------------------------------------------------------------

const OVERRIDE_TRANSITIONS = new Set(["denied", "authorized", "expired", "drift"]);

/**
 * §7.5 layer 0. `scope.candidate` requires two `OID` values and admits no typed
 * state, unlike the envelope. A capability whose observation carries
 * `head: null`/`tree: null` — every `mode: "global-plugin-install"` capability —
 * cannot be represented, and nothing is appended for it. `statusSha256`,
 * `fingerprintSha256` and the plugin tree digest are all 64-hex and would pass
 * the `OID` pattern; substituting one would place a value into the field that
 * is not the thing the field denotes, permanently, in an append-only record
 * (AC-13).
 */
function overrideCandidate(repository) {
  if (!isRecord(repository)) return null;
  const { head, tree } = repository;
  if (typeof head !== "string" || typeof tree !== "string" || !OID.test(head) || !OID.test(tree)) return null;
  return { commit: head, tree };
}

/**
 * §7.5 layers 1-3, in order, deterministic.
 *
 * Layer 1 entries are supplied by the caller because reading bytes is I/O; they
 * are nonetheless constrained here to paths the capability itself declares
 * eligible, so a caller cannot inject an artifact the decision is not bound to
 * (AC-12). Layer 2 falls back to `policy.project` entries with
 * `status: "present"` — honestly bound, since a change to any of them drifts
 * the capability and HGO refuses to consume it.
 */
function overrideArtifacts(capability, eligibleArtifacts) {
  const declared = new Set(Array.isArray(capability.eligiblePaths) ? capability.eligiblePaths : []);
  const layer1 = eligibleArtifacts
    .map((entry) => requireArtifactEntry(entry, "eligibleArtifacts entry"))
    .filter((entry) => declared.has(entry.path))
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  if (layer1.length > 0) return layer1;

  const project = Array.isArray(capability.policy?.project) ? capability.policy.project : [];
  const layer2 = project
    .filter((entry) => isRecord(entry) && entry.status === "present" && typeof entry.path === "string"
      && ARTIFACT_PATH.test(entry.path) && typeof entry.sha256 === "string" && SHA256.test(entry.sha256))
    .map((entry) => ({ path: entry.path, sha256: entry.sha256 }))
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  if (layer2.length > 0) return layer2;

  return null;
}

function notRepresentable(reason) { return Object.freeze({ representable: false, reason, decisions: null }); }

/**
 * Builds the portable decisions for one HGO transition (§7.5's table), or the
 * explicit *not-representable* outcome and **no decision object** when the
 * payload contract cannot express the decision.
 *
 * The not-representable outcome is not a failed append (§8.1): increment 1
 * leaves those lanes exactly as they are today — no portable event, no refusal,
 * no new capability — rather than disabling a working human lane to satisfy a
 * bookkeeping rule. Representability is therefore decided before any append is
 * attempted, and the two cases can never be conflated at run time.
 *
 * `capability` is any record carrying §10.2 H-1's fields (a denial record or a
 * capability): `repository`, `eligiblePaths`, `policy`, `commandClass`,
 * `requestSha256`, and for `authorized` also `authorizedAt`/`expiresAt`.
 */
export function buildOverrideDecisions({
  transition,
  capability,
  repositoryFingerprint,
  authorizationChannel,
  eligibleArtifacts = [],
  generation = 0,
  authorityClass = "product-owner",
  grant,
  notBeforeEpochMs,
  expiresAtEpochMs,
} = {}) {
  if (!OVERRIDE_TRANSITIONS.has(transition)) fail("GAL-INPUT", "transition must be denied|authorized|expired|drift");
  if (!isRecord(capability)) fail("GAL-INPUT", "an HGO capability or denial record is required");
  requireDigest(repositoryFingerprint, "repositoryFingerprint");
  requireDigest(capability.requestSha256, "capability.requestSha256");
  if (!Array.isArray(eligibleArtifacts)) fail("GAL-INPUT", "eligibleArtifacts must be an array");
  const action = OVERRIDE_ACTION_BY_CHANNEL[authorizationChannel];
  if (action === undefined) fail("GAL-INPUT", "authorizationChannel must be \"signature\" or \"chat\"");
  // H-7: a denial set is never empty, so every HGO decision has at least one
  // denying guard identity behind it.
  if (!Array.isArray(capability.denials) || capability.denials.length === 0) {
    fail("GAL-INPUT", "capability.denials must carry at least one denying guard identity");
  }

  const intentSha256 = capability.requestSha256;
  const requestId = requestDecisionId({ intentSha256, producer: "hgo" });

  // Dispositions describe an already recorded grant and inherit its scope, so
  // representability was settled when that grant was built.
  if (transition === "expired" || transition === "drift") {
    const source = validateHumanGovernanceDecision(grant);
    if (source.event !== "granted" || source.outcome !== "granted") fail("GAL-INPUT", "a granted decision is required to dispose of");
    if (source.decisionId !== grantDecisionId({ intentSha256, generation, producer: "hgo" })) {
      fail("GAL-INPUT", "the grant does not belong to this request digest and generation");
    }
    const expired = transition === "expired";
    return Object.freeze({
      representable: true,
      reason: null,
      decisions: Object.freeze([decision({
        id: (expired ? expireDecisionId : revokeDecisionId)({ intentSha256, generation, producer: "hgo" }),
        event: expired ? "expired" : "revoked",
        outcome: expired ? "expired" : "revoked",
        authorityClass: source.authorityClass,
        core: {
          scope: source.scope,
          reasonCode: expired ? OVERRIDE_REASON_CODE_EXPIRED : OVERRIDE_REASON_CODE_DRIFT,
          policyDigest: source.policyDigest,
          ruleDigest: source.ruleDigest,
          validity: source.validity,
        },
        link: expired ? { expiresDecisionId: source.decisionId } : { revokesDecisionId: source.decisionId },
      })]),
    });
  }

  // Layer 0 is checked FIRST: no artifact source can repair a missing
  // candidate, and checking it second is what lets a candidate-less capability
  // be classified representable by its policy files alone.
  const candidate = overrideCandidate(capability.repository);
  if (candidate === null) return notRepresentable("candidate-unrepresentable");
  const artifacts = overrideArtifacts(capability, eligibleArtifacts);
  if (artifacts === null) return notRepresentable("artifacts-unrepresentable");

  if (typeof capability.commandClass !== "string" || capability.commandClass === "") {
    fail("GAL-INPUT", "capability.commandClass is required");
  }

  const authorized = transition === "authorized";
  const notBefore = authorized ? capability.authorizedAt : notBeforeEpochMs;
  const expires = authorized ? capability.expiresAt : expiresAtEpochMs;
  requireSafeInteger(notBefore, authorized ? "capability.authorizedAt" : "notBeforeEpochMs");
  requireSafeInteger(expires, authorized ? "capability.expiresAt" : "expiresAtEpochMs");

  const core = {
    scope: {
      repositoryFingerprint,
      candidate,
      packageId: OVERRIDE_PACKAGE_ID,
      action,
      environment: ENVIRONMENT,
      artifacts,
    },
    reasonCode: authorized ? OVERRIDE_REASON_CODE_AUTHORIZED : OVERRIDE_REASON_CODE_DENIED,
    policyDigest: overridePolicyDigest(capability.policy),
    ruleDigest: canonicalSha256({
      eligiblePaths: Array.isArray(capability.eligiblePaths) ? [...capability.eligiblePaths] : [],
      commandClass: capability.commandClass,
    }),
    // §4: an HGO capability is single-use.
    validity: { notBeforeEpochMs: notBefore, expiresAtEpochMs: expires, singleUse: true },
  };
  const owner = requireAuthorityClass(authorityClass);

  if (authorized) {
    // The `requested` record was already appended at denial time and is
    // appended once (§7.3); the grant links back to it.
    return Object.freeze({
      representable: true,
      reason: null,
      decisions: Object.freeze([decision({
        id: grantDecisionId({ intentSha256, generation, producer: "hgo" }),
        event: "granted",
        outcome: "granted",
        authorityClass: owner,
        core,
        link: { requestDecisionId: requestId },
      })]),
    });
  }

  // §7.5: `recordHumanGuardDenial` produces `requested` then `denied`.
  return Object.freeze({
    representable: true,
    reason: null,
    decisions: Object.freeze([
      decision({
        id: requestId,
        event: "requested",
        outcome: "pending",
        authorityClass: owner,
        core,
        link: {},
      }),
      decision({
        id: denyDecisionId({ intentSha256, generation, producer: "hgo" }),
        event: "denied",
        outcome: "denied",
        authorityClass: owner,
        core,
        link: { requestDecisionId: requestId },
      }),
    ]),
  });
}

// ---------------------------------------------------------------------------------
// §7.2 the append intent
// ---------------------------------------------------------------------------------

function digestOrTypedState(value, what) {
  if (value === undefined || value === null) return UNAVAILABLE;
  if (typeof value === "string") return requireDigest(value, what);
  if (isRecord(value) && typeof value.state === "string") return { state: value.state };
  fail("GAL-INPUT", `${what} must be a sha-256 digest or a typed state`);
}

/**
 * Wraps one validated decision into the exact 24-key append intent of §7.2. The
 * store computes `sequence`, `previousEventDigest`, `payloadDigest` and
 * `eventDigest`, so this never emits them.
 *
 * `sessionId`/`dispatchId`/`traceId` are always omitted by policy: they are
 * machine-local correlators, i.e. private coordinates under H-AC-13. A policy
 * digest the environment genuinely cannot supply is recorded as the typed state
 * `unavailable`, never as a fabricated hash.
 */
export function buildAppendIntent({
  decision: payload,
  repositoryFingerprint,
  occurredAtEpochMs,
  observedAtEpochMs,
  featureId = null,
  requestId,
  configurationDigest,
  capturePolicyDigest,
  redactionPolicyDigest,
} = {}) {
  const validated = validateHumanGovernanceDecision(payload);
  requireDigest(repositoryFingerprint, "repositoryFingerprint");
  if (validated.scope.repositoryFingerprint !== repositoryFingerprint) {
    fail("GAL-INTENT", "the decision scope names a different repository than the intent");
  }
  const occurred = requireSafeInteger(occurredAtEpochMs, "occurredAtEpochMs");
  const observed = observedAtEpochMs === undefined ? occurred : requireSafeInteger(observedAtEpochMs, "observedAtEpochMs");
  const eventType = EVENT_TYPE_BY_EVENT[validated.event];
  // U-8: this path never produces a correction or a supersession, and the
  // absence is a pinned property rather than an unaddressed dimension.
  if (eventType === undefined) fail("GAL-EVENT-TYPE", `this path never emits a "${validated.event}" event`);
  if (typeof requestId !== "string" || !ID.test(requestId)) fail("GAL-INPUT", "requestId is required");
  if (featureId !== null && (typeof featureId !== "string" || !ID.test(featureId))) fail("GAL-INPUT", "featureId must be an identifier or null");

  const eventId = `evt-${validated.decisionId}`;
  if (!ID.test(eventId)) fail("GAL-INTENT", "the derived eventId is not a valid identifier");

  const intent = {
    schema: "pipeline.governance-event-envelope.v1",
    payloadSchema: "pipeline.human-governance-decision.v1",
    canonicalization: "RFC8785",
    digestAlgorithm: "sha-256",
    eventId,
    idempotencyKey: validated.decisionId,
    origin: "human",
    authorityClass: "human-authority",
    eventType,
    occurredAtEpochMs: occurred,
    observedAtEpochMs: observed,
    timeAssurance: "locally-observed",
    repositoryFingerprint,
    sourceUri: `urn:pipeline:repository:${repositoryFingerprint}`,
    streamId: "human",
    correlation: {
      featureId: featureId === null ? UNAVAILABLE : featureId,
      packageId: validated.scope.packageId,
      requestId,
      sessionId: OMITTED_BY_POLICY,
      dispatchId: OMITTED_BY_POLICY,
      traceId: OMITTED_BY_POLICY,
    },
    candidate: { ...validated.scope.candidate },
    artifacts: validated.scope.artifacts.map((entry) => ({ ...entry })),
    policy: {
      policyDigest: validated.policyDigest,
      configurationDigest: digestOrTypedState(configurationDigest, "configurationDigest"),
      capturePolicyDigest: digestOrTypedState(capturePolicyDigest, "capturePolicyDigest"),
      redactionPolicyDigest: digestOrTypedState(redactionPolicyDigest, "redactionPolicyDigest"),
    },
    classification: "repository-public-safe",
    storageProfile: "repository-public-safe",
    retentionCompatibility: "repository-retained",
    disclosureClass: "repository-visible",
    payload: { ...validated, scope: { ...validated.scope }, validity: { ...validated.validity }, links: { ...validated.links } },
  };

  // The same shape check the store performs before it accepts an intent
  // (`assertIntent`): the writer-owned fields are stubbed exactly as the store
  // stubs them, so an intent this builder returns cannot fail `GES-INTENT`.
  const probe = { ...intent, sequence: 1, previousEventDigest: null, payloadDigest: "0".repeat(64), eventDigest: "0".repeat(64) };
  const shape = validateGovernanceEventEnvelope(probe, { verifyDigests: false });
  if (!shape.valid) fail("GAL-INTENT", `the derived append intent is not a valid envelope: ${shape.errors.join(",")}`);

  return Object.freeze(intent);
}
