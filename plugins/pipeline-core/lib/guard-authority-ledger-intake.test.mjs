// SPDX-License-Identifier: SUL-1.0
/**
 * Unit tests U-1..U-10 of the design's §12 for the pure GMW/HGO intake builders.
 * Design: specs/sprint-phoenix-epic/design/gmw-hgo-evidence-intake-into-the-human-ledger.md
 *
 * Every test name carries its U-number so the coverage claim can be compared
 * against the suite rather than taken on trust.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  LIFTABLE_RULE_PREFIX,
  OVERRIDE_REASON_CODE_AUTHORIZED,
  OVERRIDE_REASON_CODE_DENIED,
  OVERRIDE_REASON_CODE_DRIFT,
  OVERRIDE_REASON_CODE_EXPIRED,
  WINDOW_POLICY_PREIMAGE_SCHEMA,
  WINDOW_PROOF_REQUIREMENT,
  WINDOW_REASON_CODE_CLOSED,
  WINDOW_REASON_CODE_EXPIRED,
  WINDOW_REASON_CODE_NOT_ARMED,
  WINDOW_REASON_CODE_UNATTESTED,
  buildAppendIntent,
  buildOverrideDecisions,
  buildWindowExpiryDecision,
  buildWindowGrantDecision,
  buildWindowRequestDecision,
  buildWindowRevocationDecision,
  denyDecisionId,
  expireDecisionId,
  grantDecisionId,
  requestDecisionId,
  revokeDecisionId,
} from "./guard-authority-ledger-intake.mjs";
import { canonicalSha256, canonicalizeJson } from "./governance-event.mjs";
import { validateHumanGovernanceDecision } from "./human-governance-decision.mjs";
import { LIFTABLE_RULE_IDS, MAX_WINDOW_TTL_MS, isLiftableRuleId } from "./guard-maintenance-window.mjs";

// ---------------------------------------------------------------------------------
// Fixtures. Every digest is distinct so a leak into an unexpected field is
// visible rather than masked by a collision with another fixture value.
// ---------------------------------------------------------------------------------

const PLAN_SHA256 = "1".repeat(64);
const SPEC_SHA256 = "2".repeat(64);
const OPENING_TREE_SHA256 = "3".repeat(64);
const LEDGER_FINGERPRINT = "4".repeat(64);
const GMW_FINGERPRINT = "5".repeat(64);
const INTENT_SHA256 = "6".repeat(64);
const SUBJECT_SHA256 = "7".repeat(64);
const COMMIT = "a".repeat(40);
const TREE = "b".repeat(40);
const INSTALLED_AT_MS = 1_700_000_000_000;
const ONE_HOUR_MS = 60 * 60 * 1000;

// Trust-anchor material (§5.1 exclusion 2). Never an input to any preimage.
const ANCHOR_KEY_REFERENCE = "po-signing-key-nova";
const ANCHOR_PUBLIC_KEY_SHA256 = "ab".repeat(32);

const FREE_TEXT_REASON = "ZZFREETEXTZZ lift GS-6 to repair the writer-owned policy file";
const SUBJECT_NONCE = "cd".repeat(16);

function windowSubject(overrides = {}) {
  return {
    scopeRuleIds: ["GS-6", "TP-writer"],
    expiresAtMs: INSTALLED_AT_MS + ONE_HOUR_MS,
    reason: FREE_TEXT_REASON,
    repoFingerprintSha256: GMW_FINGERPRINT,
    openingTreeSha256: OPENING_TREE_SHA256,
    nonce: SUBJECT_NONCE,
    ...overrides,
  };
}

function windowIntent(overrides = {}) {
  return {
    value: {
      schema: "pipeline.po-approval-intent.v1",
      kind: "guard-lift",
      featureId: "PHX-2",
      planSha256: PLAN_SHA256,
      specSha256: SPEC_SHA256,
      candidate: { commit: COMMIT, tree: TREE },
      policyRevision: "guard-maintenance-window-v1",
      subjectSha256: SUBJECT_SHA256,
      decision: "lift",
      ...overrides,
    },
    sha256: INTENT_SHA256,
  };
}

const PLAN_ARTIFACT = { path: "specs/sprint-phoenix-epic/plan.md", sha256: PLAN_SHA256 };
const SPEC_ARTIFACT = { path: "specs/sprint-phoenix-epic/spec.md", sha256: SPEC_SHA256 };

function windowRequest(overrides = {}) {
  return {
    intent: windowIntent(),
    subject: windowSubject(),
    repositoryFingerprint: LEDGER_FINGERPRINT,
    installedAtMs: INSTALLED_AT_MS,
    plan: PLAN_ARTIFACT,
    spec: SPEC_ARTIFACT,
    generation: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------------
// HGO fixtures
// ---------------------------------------------------------------------------------

const HGO_REQUEST_SHA256 = "8".repeat(64);
const HGO_HEAD = "c".repeat(40);
const HGO_TREE = "d".repeat(40);
const HGO_STATUS_SHA256 = "9".repeat(64);
const HGO_OBSERVATION_FINGERPRINT = "e".repeat(64);
const HGO_PLUGIN_TREE_SHA256 = "f".repeat(64);
const PROJECT_POLICY_SHA256 = "0f".repeat(32);
const ELIGIBLE_FILE_SHA256 = "1e".repeat(32);
const HGO_AUTHORIZED_AT = 1_700_000_500_000;
const HGO_EXPIRES_AT = HGO_AUTHORIZED_AT + ONE_HOUR_MS;

function policyIdentityFixture({ projectPresent = true } = {}) {
  return {
    guards: [{ guard: "guard-testpath.mjs", implementationSha256: "2d".repeat(32) }],
    project: [
      { path: ".claude/settings.json", status: projectPresent ? "present" : "absent", sha256: projectPresent ? "3d".repeat(32) : null },
      { path: "project/guard-config.json", status: projectPresent ? "present" : "absent", sha256: projectPresent ? PROJECT_POLICY_SHA256 : null },
    ],
  };
}

function capabilityFixture(overrides = {}) {
  return {
    schema: "pipeline.human-guard-override-capability.v1",
    status: "authorized",
    requestSha256: HGO_REQUEST_SHA256,
    repository: {
      fingerprintSha256: HGO_OBSERVATION_FINGERPRINT,
      head: HGO_HEAD,
      tree: HGO_TREE,
      statusSha256: HGO_STATUS_SHA256,
      state: {},
    },
    commandClass: "writer-owned-project-policy-emergency",
    denials: [{ guard: "guard-testpath.mjs", rule: "TP-writer" }],
    policy: policyIdentityFixture(),
    eligiblePaths: ["project/guard-config.json"],
    mode: "standard",
    authorizedAt: HGO_AUTHORIZED_AT,
    expiresAt: HGO_EXPIRES_AT,
    consumedAt: null,
    ...overrides,
  };
}

const ELIGIBLE_ARTIFACTS = [{ path: "project/guard-config.json", sha256: ELIGIBLE_FILE_SHA256 }];

function overrideRequest(overrides = {}) {
  return {
    transition: "authorized",
    capability: capabilityFixture(),
    repositoryFingerprint: LEDGER_FINGERPRINT,
    authorizationChannel: "signature",
    eligibleArtifacts: ELIGIBLE_ARTIFACTS,
    generation: 0,
    ...overrides,
  };
}

/** Every decision the builders in this module can produce, for property tests. */
function allDecisions() {
  const request = buildWindowRequestDecision(windowRequest());
  const grant = buildWindowGrantDecision(windowRequest());
  const revoked = buildWindowRevocationDecision({ grant, intentSha256: INTENT_SHA256, generation: 0, reasonCode: WINDOW_REASON_CODE_CLOSED });
  const notArmed = buildWindowRevocationDecision({ grant, intentSha256: INTENT_SHA256, generation: 0, reasonCode: WINDOW_REASON_CODE_NOT_ARMED });
  const expired = buildWindowExpiryDecision({ grant, intentSha256: INTENT_SHA256, generation: 0 });
  const denial = buildOverrideDecisions(overrideRequest({ transition: "denied", notBeforeEpochMs: HGO_AUTHORIZED_AT, expiresAtEpochMs: HGO_EXPIRES_AT }));
  const authorized = buildOverrideDecisions(overrideRequest());
  const hgoGrant = authorized.decisions[0];
  const hgoExpired = buildOverrideDecisions(overrideRequest({ transition: "expired", grant: hgoGrant }));
  const hgoDrift = buildOverrideDecisions(overrideRequest({ transition: "drift", grant: hgoGrant }));
  return [request, grant, revoked, notArmed, expired, ...denial.decisions, ...authorized.decisions, ...hgoExpired.decisions, ...hgoDrift.decisions];
}

// ---------------------------------------------------------------------------------
// U-1
// ---------------------------------------------------------------------------------

test("U-1 every builder output validates, and one extra key fails HGL-SHAPE", () => {
  const decisions = allDecisions();
  assert.ok(decisions.length >= 10, "the property set must cover every builder");
  for (const decision of decisions) {
    assert.deepEqual(validateHumanGovernanceDecision(decision), decision);
    assert.throws(
      () => validateHumanGovernanceDecision({ ...decision, proofSha256: "0".repeat(64) }),
      (error) => error.code === "HGL-SHAPE",
      `an extra key must fail HGL-SHAPE for ${decision.decisionId}`,
    );
  }
});

// ---------------------------------------------------------------------------------
// U-2
// ---------------------------------------------------------------------------------

test("U-2 granted without links.requestDecisionId fails HGL-LIFECYCLE; each disposition needs exactly its own link", () => {
  const grant = buildWindowGrantDecision(windowRequest());
  assert.equal(grant.links.requestDecisionId, requestDecisionId({ intentSha256: INTENT_SHA256 }));
  assert.throws(
    () => validateHumanGovernanceDecision({ ...grant, links: { ...grant.links, requestDecisionId: null } }),
    (error) => error.code === "HGL-LIFECYCLE",
  );

  const revoked = buildWindowRevocationDecision({ grant, intentSha256: INTENT_SHA256, generation: 0, reasonCode: WINDOW_REASON_CODE_CLOSED });
  assert.equal(revoked.links.revokesDecisionId, grant.decisionId);
  assert.throws(
    () => validateHumanGovernanceDecision({ ...revoked, links: { ...revoked.links, revokesDecisionId: null, requestDecisionId: grant.decisionId } }),
    (error) => error.code === "HGL-LIFECYCLE",
  );

  const expired = buildWindowExpiryDecision({ grant, intentSha256: INTENT_SHA256, generation: 0 });
  assert.equal(expired.links.expiresDecisionId, grant.decisionId);
  assert.throws(
    // Two non-null links is exactly as invalid as none.
    () => validateHumanGovernanceDecision({ ...expired, links: { ...expired.links, revokesDecisionId: grant.decisionId } }),
    (error) => error.code === "HGL-LIFECYCLE",
  );

  const denial = buildOverrideDecisions(overrideRequest({ transition: "denied", notBeforeEpochMs: HGO_AUTHORIZED_AT, expiresAtEpochMs: HGO_EXPIRES_AT }));
  const [requested, denied] = denial.decisions;
  assert.equal(requested.event, "requested");
  assert.deepEqual(Object.values(requested.links).filter((value) => value !== null), []);
  assert.equal(denied.links.requestDecisionId, requested.decisionId);
});

// ---------------------------------------------------------------------------------
// U-3
// ---------------------------------------------------------------------------------

test("U-3 reason codes are pinned; free text never appears in and is never hashed into any output", () => {
  const grant = buildWindowGrantDecision(windowRequest());
  assert.equal(grant.reasonCode, WINDOW_REASON_CODE_UNATTESTED);

  const signed = buildWindowGrantDecision(windowRequest({ subject: windowSubject({ reasonCode: "GUARD.MAINTENANCE.WRITER_REPAIR" }) }));
  assert.equal(signed.reasonCode, "GUARD.MAINTENANCE.WRITER_REPAIR");

  // A present but malformed code fails closed rather than degrading silently.
  assert.throws(
    () => buildWindowGrantDecision(windowRequest({ subject: windowSubject({ reasonCode: FREE_TEXT_REASON }) }) ),
    (error) => error.code === "GAL-REASON-CODE",
  );

  assert.equal(buildWindowRevocationDecision({ grant, intentSha256: INTENT_SHA256, generation: 0, reasonCode: WINDOW_REASON_CODE_CLOSED }).reasonCode, WINDOW_REASON_CODE_CLOSED);
  assert.equal(buildWindowRevocationDecision({ grant, intentSha256: INTENT_SHA256, generation: 0, reasonCode: WINDOW_REASON_CODE_NOT_ARMED }).reasonCode, WINDOW_REASON_CODE_NOT_ARMED);
  assert.equal(buildWindowExpiryDecision({ grant, intentSha256: INTENT_SHA256, generation: 0 }).reasonCode, WINDOW_REASON_CODE_EXPIRED);
  assert.throws(
    () => buildWindowRevocationDecision({ grant, intentSha256: INTENT_SHA256, generation: 0, reasonCode: "closed because the writer needed it" }),
    (error) => error.code === "GAL-REASON-CODE",
  );

  const overrideCodes = {
    denied: OVERRIDE_REASON_CODE_DENIED,
    authorized: OVERRIDE_REASON_CODE_AUTHORIZED,
  };
  for (const [transition, code] of Object.entries(overrideCodes)) {
    const built = buildOverrideDecisions(overrideRequest({ transition, notBeforeEpochMs: HGO_AUTHORIZED_AT, expiresAtEpochMs: HGO_EXPIRES_AT }));
    assert.equal(built.decisions.at(-1).reasonCode, code);
  }
  const hgoGrant = buildOverrideDecisions(overrideRequest()).decisions[0];
  assert.equal(buildOverrideDecisions(overrideRequest({ transition: "expired", grant: hgoGrant })).decisions[0].reasonCode, OVERRIDE_REASON_CODE_EXPIRED);
  assert.equal(buildOverrideDecisions(overrideRequest({ transition: "drift", grant: hgoGrant })).decisions[0].reasonCode, OVERRIDE_REASON_CODE_DRIFT);

  // Neither the free text, nor its digest, nor the nonce reaches any output —
  // §5.3 rejects the digest explicitly, because a digest of a short operator
  // sentence is a direct route back to its content.
  const serialized = canonicalizeJson(allDecisions());
  const reasonDigest = createHash("sha256").update(FREE_TEXT_REASON, "utf8").digest("hex");
  for (const forbidden of ["ZZFREETEXTZZ", FREE_TEXT_REASON, reasonDigest, canonicalSha256(FREE_TEXT_REASON), SUBJECT_NONCE, GMW_FINGERPRINT]) {
    assert.equal(serialized.includes(forbidden), false, `a forbidden value reached the portable output: ${forbidden.slice(0, 24)}`);
  }

  // Not merely absent: not hashed in either. A different reason and nonce
  // produce a byte-identical decision.
  const other = buildWindowGrantDecision(windowRequest({
    subject: windowSubject({ reason: "an entirely different operator sentence", nonce: "ee".repeat(16) }),
  }));
  assert.equal(canonicalizeJson(other), canonicalizeJson(grant));
});

// ---------------------------------------------------------------------------------
// U-4
// ---------------------------------------------------------------------------------

test("U-4 identifiers are deterministic; g moves only the disposition ids; installedAtMs moves no id at all", () => {
  const i32 = INTENT_SHA256.slice(0, 32);
  assert.equal(requestDecisionId({ intentSha256: INTENT_SHA256 }), `gmw-request-${i32}`);
  assert.equal(grantDecisionId({ intentSha256: INTENT_SHA256, generation: 0 }), `gmw-grant-${i32}-0`);
  assert.equal(revokeDecisionId({ intentSha256: INTENT_SHA256, generation: 0 }), `gmw-revoke-${i32}-0`);
  assert.equal(expireDecisionId({ intentSha256: INTENT_SHA256, generation: 0 }), `gmw-expired-${i32}-0`);

  // Identical input -> identical ids and identical decisions.
  assert.equal(canonicalizeJson(buildWindowGrantDecision(windowRequest())), canonicalizeJson(buildWindowGrantDecision(windowRequest())));

  // A changed generation moves the grant/disposition ids and nothing else.
  const gen0 = buildWindowGrantDecision(windowRequest({ generation: 0 }));
  const gen1 = buildWindowGrantDecision(windowRequest({ generation: 1 }));
  assert.notEqual(gen0.decisionId, gen1.decisionId);
  assert.equal(gen1.decisionId, `gmw-grant-${i32}-1`);
  assert.equal(gen0.links.requestDecisionId, gen1.links.requestDecisionId);
  assert.equal(requestDecisionId({ intentSha256: INTENT_SHA256 }), gen1.links.requestDecisionId);
  assert.equal(revokeDecisionId({ intentSha256: INTENT_SHA256, generation: 1 }), `gmw-revoke-${i32}-1`);

  // The regression guard against the clock-suffixed scheme §7.3 replaced: a
  // changed installedAtMs changes NO id, only the validity bounds.
  const later = buildWindowGrantDecision(windowRequest({ installedAtMs: INSTALLED_AT_MS + 61_000 }));
  assert.equal(later.decisionId, gen0.decisionId);
  assert.deepEqual(later.links, gen0.links);
  assert.notEqual(later.validity.notBeforeEpochMs, gen0.validity.notBeforeEpochMs);
  assert.equal(later.validity.expiresAtEpochMs, gen0.validity.expiresAtEpochMs, "an honest prepare()-built request keeps the signed bound");

  const requested = buildWindowRequestDecision(windowRequest());
  const requestedLater = buildWindowRequestDecision(windowRequest({ installedAtMs: INSTALLED_AT_MS + 61_000 }));
  assert.equal(requested.decisionId, requestedLater.decisionId);
});

// ---------------------------------------------------------------------------------
// U-5
// ---------------------------------------------------------------------------------

test("U-5 identityAssurance is locally-attributed and timeAssurance locally-observed in every record", () => {
  for (const decision of allDecisions()) {
    assert.equal(decision.identityAssurance, "locally-attributed", decision.decisionId);
    assert.equal(decision.timeAssurance, "locally-observed", decision.decisionId);
  }
});

// ---------------------------------------------------------------------------------
// U-6
// ---------------------------------------------------------------------------------

test("U-6 validity is min(signed, installedAtMs + MAX_WINDOW_TTL_MS); the catalogue pin agrees with isLiftableRuleId", () => {
  // Honest, prepare()-built request: the signed bound is the binding term.
  const honest = buildWindowGrantDecision(windowRequest());
  assert.equal(honest.validity.notBeforeEpochMs, INSTALLED_AT_MS);
  assert.equal(honest.validity.expiresAtEpochMs, INSTALLED_AT_MS + ONE_HOUR_MS);
  assert.equal(honest.validity.expiresAtEpochMs, Math.min(INSTALLED_AT_MS + ONE_HOUR_MS, INSTALLED_AT_MS + MAX_WINDOW_TTL_MS));
  assert.equal(honest.validity.singleUse, false, "a window is time-boxed, not single-use");

  // Hand-built subject beyond the ceiling: the clock term binds instead, and it
  // can never exceed the signed bound.
  const tooFar = buildWindowGrantDecision(windowRequest({ subject: windowSubject({ expiresAtMs: INSTALLED_AT_MS + 10 * ONE_HOUR_MS }) }));
  assert.equal(tooFar.validity.expiresAtEpochMs, INSTALLED_AT_MS + MAX_WINDOW_TTL_MS);
  assert.ok(tooFar.validity.expiresAtEpochMs <= INSTALLED_AT_MS + 10 * ONE_HOUR_MS);

  // The request record carries the same formula, which is the whole of its
  // validity check under §7.3's adoption rule (i).
  assert.deepEqual(buildWindowRequestDecision(windowRequest()).validity, honest.validity);

  // §5.5's pinned copy of the module-private TP- prefix still agrees with the
  // exported observable form of the same catalogue.
  for (const ruleId of LIFTABLE_RULE_IDS) assert.equal(isLiftableRuleId(ruleId), true);
  assert.equal(isLiftableRuleId(`${LIFTABLE_RULE_PREFIX}writer`), true);
  assert.equal(LIFTABLE_RULE_PREFIX, "TP-");
  for (const notLiftable of ["GS-1", "GS-5", "GS-7", "TP", "tp-writer"]) assert.equal(isLiftableRuleId(notLiftable), false);
});

// ---------------------------------------------------------------------------------
// U-7
// ---------------------------------------------------------------------------------

test("U-7 policyDigest is verified constructively; the trust anchor is absent at every depth", () => {
  const grant = buildWindowGrantDecision(windowRequest());

  // Recomputed from §5.5's declared preimage, written out here rather than
  // imported, so an extra or substituted input fails this test.
  const preimage = {
    schema: WINDOW_POLICY_PREIMAGE_SCHEMA,
    policyRevision: "guard-maintenance-window-v1",
    approvalKind: "guard-lift",
    proofRequirement: WINDOW_PROOF_REQUIREMENT,
    liftableRuleIds: [...LIFTABLE_RULE_IDS],
    liftableRulePrefix: "TP-",
    maxWindowTtlMs: MAX_WINDOW_TTL_MS,
  };
  assert.equal(grant.policyDigest, canonicalSha256(preimage));
  assert.equal(WINDOW_POLICY_PREIMAGE_SCHEMA, "pipeline.guard-authority-intake-policy.v1");
  assert.equal(WINDOW_PROOF_REQUIREMENT, "detached-ed25519-over-intent-digest");

  // Two different approvers on the same policy state produce the same digest:
  // a policy digest, not a pseudonym.
  assert.equal(buildWindowGrantDecision(windowRequest({ subject: windowSubject({ nonce: "77".repeat(16) }) })).policyDigest, grant.policyDigest);

  // A builder handed the trust anchor as an extra input produces a
  // byte-identical output.
  const anchored = buildWindowGrantDecision(windowRequest({
    intent: { ...windowIntent(), value: { ...windowIntent().value, keyReference: ANCHOR_KEY_REFERENCE, publicKeySha256: ANCHOR_PUBLIC_KEY_SHA256 } },
    subject: windowSubject({ keyReference: ANCHOR_KEY_REFERENCE, publicKeySha256: ANCHOR_PUBLIC_KEY_SHA256 }),
    trustAnchor: { keyReference: ANCHOR_KEY_REFERENCE, publicKeySha256: ANCHOR_PUBLIC_KEY_SHA256 },
  }));
  assert.equal(canonicalizeJson(anchored), canonicalizeJson(grant));

  // Neither the anchor's values nor a digest of either appears in the preimage
  // or in any output, at any depth.
  const derivatives = [
    ANCHOR_KEY_REFERENCE,
    ANCHOR_PUBLIC_KEY_SHA256,
    createHash("sha256").update(ANCHOR_PUBLIC_KEY_SHA256, "utf8").digest("hex"),
    createHash("sha256").update(ANCHOR_KEY_REFERENCE, "utf8").digest("hex"),
    canonicalSha256({ keyReference: ANCHOR_KEY_REFERENCE, publicKeySha256: ANCHOR_PUBLIC_KEY_SHA256 }),
  ];
  const haystack = `${canonicalizeJson(preimage)}${canonicalizeJson(allDecisions())}`;
  for (const derivative of derivatives) {
    assert.equal(haystack.includes(derivative), false, `a trust-anchor derivative reached the output: ${derivative.slice(0, 24)}`);
  }

  // HGO's preimage is exactly the policyIdentity object HGO already computes.
  const authorized = buildOverrideDecisions(overrideRequest()).decisions[0];
  assert.equal(authorized.policyDigest, canonicalSha256(policyIdentityFixture()));
});

// ---------------------------------------------------------------------------------
// U-8
// ---------------------------------------------------------------------------------

test("U-8 no builder can emit corrected or superseded", () => {
  for (const decision of allDecisions()) {
    assert.ok(!["corrected", "superseded"].includes(decision.event), `${decision.decisionId} emitted ${decision.event}`);
    assert.ok(!["corrected", "superseded"].includes(decision.outcome), `${decision.decisionId} emitted ${decision.outcome}`);
  }
  // The intent layer refuses one too, so the property cannot be reintroduced by
  // hand-building a payload and wrapping it.
  const grant = buildWindowGrantDecision(windowRequest());
  for (const event of ["corrected", "superseded"]) {
    const forged = validateHumanGovernanceDecision({
      ...grant,
      decisionId: `gmw-${event}-${INTENT_SHA256.slice(0, 32)}-0`,
      event,
      outcome: event,
      links: { ...grant.links, requestDecisionId: null, [event === "corrected" ? "correctsDecisionId" : "supersedesDecisionId"]: grant.decisionId },
    });
    assert.throws(
      () => buildAppendIntent({ decision: forged, repositoryFingerprint: LEDGER_FINGERPRINT, occurredAtEpochMs: INSTALLED_AT_MS, requestId: INTENT_SHA256, featureId: "PHX-2" }),
      (error) => error.code === "GAL-EVENT-TYPE",
    );
  }
});

// ---------------------------------------------------------------------------------
// U-9
// ---------------------------------------------------------------------------------

test("U-9 the HGO denial builder produces requested + denied with GUARD.OVERRIDE.DENIED and requestDecisionId", () => {
  const built = buildOverrideDecisions(overrideRequest({
    transition: "denied",
    notBeforeEpochMs: HGO_AUTHORIZED_AT,
    expiresAtEpochMs: HGO_EXPIRES_AT,
  }));
  assert.equal(built.representable, true);
  assert.equal(built.decisions.length, 2);
  const [requested, denied] = built.decisions;

  assert.equal(requested.event, "requested");
  assert.equal(requested.outcome, "pending");
  assert.equal(requested.decisionId, requestDecisionId({ intentSha256: HGO_REQUEST_SHA256, producer: "hgo" }));

  assert.equal(denied.event, "denied");
  assert.equal(denied.outcome, "denied");
  assert.equal(denied.reasonCode, OVERRIDE_REASON_CODE_DENIED);
  assert.equal(denied.decisionId, denyDecisionId({ intentSha256: HGO_REQUEST_SHA256, generation: 0, producer: "hgo" }));
  assert.equal(denied.links.requestDecisionId, requested.decisionId);
  assert.equal(denied.scope.packageId, "human-guard-override");
  assert.equal(denied.scope.action, "GUARD.OVERRIDE.CONSUME.SIGNATURE");
  assert.equal(denied.validity.singleUse, true);
  assert.equal(denied.ruleDigest, canonicalSha256({ eligiblePaths: ["project/guard-config.json"], commandClass: "writer-owned-project-policy-emergency" }));

  // H-7: a decision with no denying guard identity behind it is refused.
  assert.throws(
    () => buildOverrideDecisions(overrideRequest({ transition: "denied", capability: capabilityFixture({ denials: [] }), notBeforeEpochMs: HGO_AUTHORIZED_AT, expiresAtEpochMs: HGO_EXPIRES_AT })),
    (error) => error.code === "GAL-INPUT",
  );

  // The channel is a closed set and is never guessed from `mode`.
  assert.equal(
    buildOverrideDecisions(overrideRequest({ authorizationChannel: "chat" })).decisions[0].scope.action,
    "GUARD.OVERRIDE.CONSUME.CHAT",
  );
  assert.throws(
    () => buildOverrideDecisions(overrideRequest({ authorizationChannel: "standard" })),
    (error) => error.code === "GAL-INPUT",
  );
});

// ---------------------------------------------------------------------------------
// U-10
// ---------------------------------------------------------------------------------

test("U-10 HGO representability follows §7.5's order: layer 0 first, then layers 1-3", () => {
  // Layer 0 — a global-plugin-install capability has no candidate, and its
  // policy.project entries would otherwise satisfy layer 2. It must still be
  // not-representable, with no decision object.
  const pluginInstall = buildOverrideDecisions(overrideRequest({
    capability: capabilityFixture({
      mode: "global-plugin-install",
      eligiblePaths: [],
      repository: { fingerprintSha256: HGO_OBSERVATION_FINGERPRINT, head: null, tree: null, statusSha256: HGO_PLUGIN_TREE_SHA256 },
    }),
    eligibleArtifacts: [],
  }));
  assert.equal(pluginInstall.representable, false);
  assert.equal(pluginInstall.reason, "candidate-unrepresentable");
  assert.equal(pluginInstall.decisions, null);

  // No builder ever writes statusSha256, fingerprintSha256 or a plugin tree
  // digest into scope.candidate.
  const serialized = canonicalizeJson(allDecisions());
  for (const substitute of [HGO_STATUS_SHA256, HGO_OBSERVATION_FINGERPRINT, HGO_PLUGIN_TREE_SHA256]) {
    assert.equal(serialized.includes(substitute), false, `an observation digest reached a portable field: ${substitute.slice(0, 16)}`);
  }
  for (const decision of allDecisions()) {
    if (decision.scope.packageId !== "human-guard-override") continue;
    assert.equal(decision.scope.candidate.commit, HGO_HEAD);
    assert.equal(decision.scope.candidate.tree, HGO_TREE);
  }

  // Layer 1 — a capability with representable eligiblePaths uses them.
  const layer1 = buildOverrideDecisions(overrideRequest());
  assert.equal(layer1.representable, true);
  assert.deepEqual(layer1.decisions[0].scope.artifacts, [{ path: "project/guard-config.json", sha256: ELIGIBLE_FILE_SHA256 }]);

  // A caller cannot inject an artifact the capability does not declare.
  const injected = buildOverrideDecisions(overrideRequest({
    eligibleArtifacts: [...ELIGIBLE_ARTIFACTS, { path: "docs/not-declared.md", sha256: "4d".repeat(32) }],
  }));
  assert.deepEqual(injected.decisions[0].scope.artifacts.map((entry) => entry.path), ["project/guard-config.json"]);

  // Layer 2 — a capability without representable eligiblePaths falls back to
  // the present policy.project entries, and only those matching the artifact
  // path pattern (the dot-prefixed .claude/ entry is rejected by it).
  const layer2 = buildOverrideDecisions(overrideRequest({
    capability: capabilityFixture({ eligiblePaths: [".claude/settings.json"] }),
    eligibleArtifacts: [],
  }));
  assert.equal(layer2.representable, true);
  assert.deepEqual(layer2.decisions[0].scope.artifacts, [{ path: "project/guard-config.json", sha256: PROJECT_POLICY_SHA256 }]);

  // Layer 3 — neither source yields an entry: not representable, no decision
  // object, never a fabricated path and never an empty artifacts array.
  const layer3 = buildOverrideDecisions(overrideRequest({
    capability: capabilityFixture({ eligiblePaths: [".claude/settings.json"], policy: policyIdentityFixture({ projectPresent: false }) }),
    eligibleArtifacts: [],
  }));
  assert.equal(layer3.representable, false);
  assert.equal(layer3.reason, "artifacts-unrepresentable");
  assert.equal(layer3.decisions, null);

  for (const built of [layer1, layer2, injected]) {
    assert.ok(built.decisions.every((decision) => decision.scope.artifacts.length > 0));
  }
});

// ---------------------------------------------------------------------------------
// §7.2 append intent — the wrapper every decision above must survive
// ---------------------------------------------------------------------------------

test("U-1/U-5 support: buildAppendIntent yields exactly §7.2's 24 keys and a store-valid envelope", () => {
  const grant = buildWindowGrantDecision(windowRequest());
  const intent = buildAppendIntent({
    decision: grant,
    repositoryFingerprint: LEDGER_FINGERPRINT,
    occurredAtEpochMs: INSTALLED_AT_MS,
    featureId: "PHX-2",
    requestId: INTENT_SHA256,
    configurationDigest: OPENING_TREE_SHA256,
  });

  // §7.2's 24 keys, verbatim: the 28 envelope keys minus the four the store
  // owns (`INTENT_OMITTED_FIELDS`).
  const INTENT_KEYS = [
    "schema", "payloadSchema", "canonicalization", "digestAlgorithm", "eventId", "idempotencyKey", "origin",
    "authorityClass", "eventType", "occurredAtEpochMs", "observedAtEpochMs", "timeAssurance",
    "repositoryFingerprint", "sourceUri", "streamId", "correlation", "candidate", "artifacts", "policy",
    "classification", "storageProfile", "retentionCompatibility", "disclosureClass", "payload",
  ];
  assert.equal(INTENT_KEYS.length, 24);
  assert.deepEqual(Object.keys(intent).sort(), [...INTENT_KEYS].sort());

  for (const omitted of ["sequence", "previousEventDigest", "payloadDigest", "eventDigest"]) {
    assert.equal(Object.hasOwn(intent, omitted), false, `${omitted} is writer-owned and must be omitted`);
  }
  assert.equal(intent.eventId, `evt-${grant.decisionId}`);
  assert.equal(intent.idempotencyKey, grant.decisionId);
  assert.equal(intent.eventType, "human.granted");
  assert.equal(intent.sourceUri, `urn:pipeline:repository:${LEDGER_FINGERPRINT}`);
  assert.equal(intent.streamId, "human");
  assert.equal(intent.origin, "human");
  assert.equal(intent.authorityClass, "human-authority");
  assert.equal(intent.timeAssurance, "locally-observed");
  assert.equal(intent.observedAtEpochMs, INSTALLED_AT_MS);
  assert.deepEqual(intent.correlation.sessionId, { state: "omitted-by-policy" });
  assert.deepEqual(intent.correlation.dispatchId, { state: "omitted-by-policy" });
  assert.deepEqual(intent.correlation.traceId, { state: "omitted-by-policy" });
  assert.equal(intent.correlation.requestId, INTENT_SHA256);
  assert.equal(intent.correlation.packageId, "guard-maintenance-window");
  assert.equal(intent.policy.policyDigest, grant.policyDigest);
  assert.equal(intent.policy.configurationDigest, OPENING_TREE_SHA256);
  // Never a fabricated hash for a digest the environment cannot supply.
  assert.deepEqual(intent.policy.capturePolicyDigest, { state: "unavailable" });
  assert.deepEqual(intent.policy.redactionPolicyDigest, { state: "unavailable" });
  assert.equal(intent.classification, "repository-public-safe");
  assert.equal(intent.storageProfile, "repository-public-safe");
  assert.equal(intent.retentionCompatibility, "repository-retained");
  assert.equal(intent.disclosureClass, "repository-visible");
  assert.deepEqual(intent.candidate, { commit: COMMIT, tree: TREE });
  assert.deepEqual(intent.payload, grant);

  // A cross-repository intent fails closed before it can reach the store.
  assert.throws(
    () => buildAppendIntent({ decision: grant, repositoryFingerprint: "0".repeat(64), occurredAtEpochMs: INSTALLED_AT_MS, requestId: INTENT_SHA256 }),
    (error) => error.code === "GAL-INTENT",
  );

  // Every decision this module can build survives the wrapper.
  for (const decision of allDecisions()) {
    const wrapped = buildAppendIntent({
      decision,
      repositoryFingerprint: LEDGER_FINGERPRINT,
      occurredAtEpochMs: INSTALLED_AT_MS,
      requestId: INTENT_SHA256,
    });
    assert.equal(wrapped.payload.decisionId, decision.decisionId);
    assert.deepEqual(wrapped.correlation.featureId, { state: "unavailable" });
  }
});

test("§7.4 support: an artifact digest that disagrees with the signed intent fails closed", () => {
  assert.throws(
    () => buildWindowGrantDecision(windowRequest({ plan: { path: "specs/plan.md", sha256: "5d".repeat(32) } })),
    (error) => error.code === "GAL-ARTIFACT-DIGEST",
  );
  assert.throws(
    () => buildWindowGrantDecision(windowRequest({ spec: { path: "specs/spec.md", sha256: "5d".repeat(32) } })),
    (error) => error.code === "GAL-ARTIFACT-DIGEST",
  );
  // An absolute path never reaches a portable field.
  assert.throws(
    () => buildWindowGrantDecision(windowRequest({ plan: { path: "/home/po/specs/plan.md", sha256: PLAN_SHA256 } })),
    (error) => error.code === "GAL-INPUT",
  );
});

test("§7.3 support: a disposition must belong to the request digest and generation it names", () => {
  const grant = buildWindowGrantDecision(windowRequest({ generation: 1 }));
  assert.throws(
    () => buildWindowRevocationDecision({ grant, intentSha256: INTENT_SHA256, generation: 0, reasonCode: WINDOW_REASON_CODE_CLOSED }),
    (error) => error.code === "GAL-INPUT",
  );
  const revoked = buildWindowRevocationDecision({ grant, intentSha256: INTENT_SHA256, generation: 1, reasonCode: WINDOW_REASON_CODE_CLOSED });
  assert.equal(revoked.decisionId, revokeDecisionId({ intentSha256: INTENT_SHA256, generation: 1 }));
  // A disposition restates the grant's scope and digests rather than
  // recomputing them differently.
  assert.deepEqual(revoked.scope, grant.scope);
  assert.equal(revoked.policyDigest, grant.policyDigest);
  assert.equal(revoked.ruleDigest, grant.ruleDigest);
  assert.deepEqual(revoked.validity, grant.validity);
});
