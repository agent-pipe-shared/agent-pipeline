// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { activateOrganizationPolicy, governanceBackfillConsentSubject, planOrganizationPolicyActivation } from "./organization-policy-activation.mjs";
import { assertBackfillConsent, exportConsentedOrganizationPolicyBackfill, selectBackfillEvents } from "./organization-policy-backfill-export.mjs";
import { appendPortableGovernanceEvent, queryPortableGovernanceStream } from "./governance-event-store.mjs";
import { createInMemoryGovernanceExportCollector } from "./governance-export-adapter.mjs";
import { canonicalizeJson, canonicalSha256 } from "./governance-event.mjs";
import { derivePoGateRepositoryFingerprint } from "./po-gate-authority.mjs";
import { discoverRepository } from "./worktree-lifecycle.mjs";

// WP-P-AC03: mechanical, non-behavioral change -- documentClasses becomes an
// optional parameter (defaulting to the original fixed entry) so P-AC-03's
// tests below can construct transitions with targetBinding-scoped classes
// without touching any pre-existing zero-argument pack() call site.
// P-AC-09 (fixture adaptation, no assertion weakened): this default fixture
// moves "security" into controlled-publication, so on a fresh root it previews
// a backfill range (classes ["security"], fromEpochMs null -- the whole
// history) and therefore now demands a distinct explicit backfill consent. The
// two pre-existing suites below keep every original assertion; only their
// authorize stub grew the consent fields the stricter contract requires.
function pack(documentClasses = [{ class: "security", mode: "controlled-publication", approvalRequired: true }]) { return { schema: "pipeline.organization-policy-pack.v1", packId: "security-baseline", revision: "a".repeat(64), compatibility: { minimumCoreVersion: "0.4.0", maximumCoreVersion: "0.5.0" }, governanceFloors: { requireHumanDecisionLedger: true, allowExternalAuthority: false }, documentClasses }; }
test("activates exactly the planned effective policy only after a bound authority readback", async () => {
  const root = mkdtempSync(join(tmpdir(), "organization-policy-activation-")); const plan = await planOrganizationPolicyActivation({ repositoryRoot: root, coreVersion: "0.4.7", packs: [pack()], activationId: "activate-security" });
  const receipt = await activateOrganizationPolicy({ repositoryRoot: root, plan, nowEpochMs: 1, authorize: async (request) => ({ granted: true, decisionId: "decision-security", activationId: request.activationId, effectivePolicySha256: request.effectivePolicySha256, backfillGranted: true, backfillDecisionId: "decision-security-backfill", backfillSubjectSha256: request.backfill.subjectSha256 }) });
  assert.equal(receipt.status, "activated"); assert.equal(JSON.parse(readFileSync(join(root, "governance/organization-policy-active.json"))).effectivePolicySha256, plan.effectivePolicySha256);
});
test("rejects an unbound authority response and stale plan preimage", async () => {
  const root = mkdtempSync(join(tmpdir(), "organization-policy-activation-")); const plan = await planOrganizationPolicyActivation({ repositoryRoot: root, coreVersion: "0.4.7", packs: [pack()], activationId: "activate-security" });
  await assert.rejects(() => activateOrganizationPolicy({ repositoryRoot: root, plan, nowEpochMs: 1, authorize: async () => ({ granted: true }) }), (error) => error.code === "OPA-AUTHORITY");
  await activateOrganizationPolicy({ repositoryRoot: root, plan, nowEpochMs: 2, authorize: async (request) => ({ granted: true, decisionId: "decision-security", activationId: request.activationId, effectivePolicySha256: request.effectivePolicySha256, backfillGranted: true, backfillDecisionId: "decision-security-backfill", backfillSubjectSha256: request.backfill.subjectSha256 }) });
  await assert.rejects(() => activateOrganizationPolicy({ repositoryRoot: root, plan, nowEpochMs: 3, authorize: async (request) => ({ granted: true, decisionId: "decision-security", activationId: request.activationId, effectivePolicySha256: request.effectivePolicySha256, backfillGranted: true, backfillDecisionId: "decision-security-backfill", backfillSubjectSha256: request.backfill.subjectSha256 }) }), (error) => error.code === "OPA-PREIMAGE");
});
// P-AC-03: the three preview fields must be computed from the transition
// itself (prior active state vs. this plan's newly resolved effectivePolicy)
// -- never left for a caller to supply. This activates a baseline pack with
// an artifact-bound "operations" class, then plans a second transition that
// points that same class at a different artifact, newly binds "security" to
// an external system, and moves "security" into controlled-publication for
// the first time, and asserts all three fields on both plans.
test("P-AC-03 computes newlyRequiredArtifacts, externalEffects, and backfillRange deterministically from the transition", async () => {
  const root = mkdtempSync(join(tmpdir(), "organization-policy-activation-"));
  const baselineClasses = [{ class: "operations", mode: "projection", approvalRequired: false, targetBinding: { targetClass: "artifact", targetRef: "ops-baseline-artifact" } }];
  const baselinePlan = await planOrganizationPolicyActivation({ repositoryRoot: root, coreVersion: "0.4.7", packs: [pack(baselineClasses)], activationId: "activate-baseline" });
  assert.deepEqual(baselinePlan.newlyRequiredArtifacts, [{ class: "operations", targetRef: "ops-baseline-artifact" }]);
  assert.deepEqual(baselinePlan.externalEffects, []);
  assert.equal(baselinePlan.backfillRange, null);
  await activateOrganizationPolicy({ repositoryRoot: root, plan: baselinePlan, nowEpochMs: 100, authorize: async (request) => ({ granted: true, decisionId: "decision-baseline", ...request }) });

  const nextClasses = [
    { class: "operations", mode: "projection", approvalRequired: false, targetBinding: { targetClass: "artifact", targetRef: "ops-next-artifact" } },
    { class: "security", mode: "controlled-publication", approvalRequired: true, targetBinding: { targetClass: "external-system", targetRef: "incident-webhook" } },
  ];
  const nextPlan = await planOrganizationPolicyActivation({ repositoryRoot: root, coreVersion: "0.4.7", packs: [pack(nextClasses)], activationId: "activate-next" });
  assert.deepEqual(nextPlan.newlyRequiredArtifacts, [{ class: "operations", targetRef: "ops-next-artifact" }]);
  assert.deepEqual(nextPlan.externalEffects, [{ class: "security", targetRef: "incident-webhook", effect: "activated" }]);
  assert.deepEqual(nextPlan.backfillRange, { classes: ["security"], fromEpochMs: 100 });
});
// P-AC-03: assertPlan (the trust boundary activateOrganizationPolicy passes a
// caller-supplied plan through) must fail closed on a hand-tampered preview
// field exactly like it already fails closed on a tampered effectivePolicy --
// the preview is derived data, never something a caller may substitute.
test("P-AC-03 rejects a plan whose preview fields were tampered instead of trusting caller-supplied data", async () => {
  const root = mkdtempSync(join(tmpdir(), "organization-policy-activation-"));
  const plan = await planOrganizationPolicyActivation({ repositoryRoot: root, coreVersion: "0.4.7", packs: [pack()], activationId: "activate-security" });
  const tampered = Object.freeze({ ...plan, newlyRequiredArtifacts: [{ class: "security", targetRef: "forged-artifact", extra: true }] });
  await assert.rejects(() => activateOrganizationPolicy({ repositoryRoot: root, plan: tampered, nowEpochMs: 1, authorize: async (request) => ({ granted: true, decisionId: "decision-security", activationId: request.activationId, effectivePolicySha256: request.effectivePolicySha256, backfillGranted: true, backfillDecisionId: "decision-security-backfill", backfillSubjectSha256: request.backfill.subjectSha256 }) }), (error) => error.code === "OPA-PREVIEW");
});

// ---------------------------------------------------------------------------
// P-AC-09: exact preview AND explicit backfill consent.
// These suites live in this already-registered file on purpose: harness/
// scripts/verify.mjs is a protected test path (guard-config TP-3), so a new
// sibling suite could not be registered in the verify gate from this dispatch.
// ---------------------------------------------------------------------------
const OPERATIONS_ONLY = [{ class: "operations", mode: "projection", approvalRequired: false }];
const CONTROLLED_SECURITY = [{ class: "operations", mode: "projection", approvalRequired: false }, { class: "security", mode: "controlled-publication", approvalRequired: true }];
const activationGrant = (decisionId) => async (request) => ({ granted: true, decisionId, activationId: request.activationId, effectivePolicySha256: request.effectivePolicySha256 });
const backfillGrant = (decisionId, backfillDecisionId, subject = null) => async (request) => ({ granted: true, decisionId, activationId: request.activationId, effectivePolicySha256: request.effectivePolicySha256, backfillGranted: true, backfillDecisionId, backfillSubjectSha256: subject ?? request.backfill.subjectSha256 });
async function baselineActivation(root, nowEpochMs = 100) {
  const plan = await planOrganizationPolicyActivation({ repositoryRoot: root, coreVersion: "0.4.7", packs: [pack(OPERATIONS_ONLY)], activationId: "activate-baseline" });
  assert.equal(plan.backfillRange, null);
  return activateOrganizationPolicy({ repositoryRoot: root, plan, nowEpochMs, authorize: activationGrant("decision-baseline") });
}
const backfillPlan = (root) => planOrganizationPolicyActivation({ repositoryRoot: root, coreVersion: "0.4.7", packs: [pack(CONTROLLED_SECURITY)], activationId: "activate-controlled" });

test("P-AC-09 refuses a backfill-implying activation carrying only the ordinary activation authority", async () => {
  const root = mkdtempSync(join(tmpdir(), "organization-policy-activation-"));
  await baselineActivation(root);
  const plan = await backfillPlan(root);
  assert.deepEqual(plan.backfillRange, { classes: ["security"], fromEpochMs: 100 });
  await assert.rejects(() => activateOrganizationPolicy({ repositoryRoot: root, plan, nowEpochMs: 300, authorize: activationGrant("decision-controlled") }), (error) => error.code === "OPA-BACKFILL-CONSENT");
  // Refused, not silently permitted: the prior activation is still the active one.
  const active = JSON.parse(readFileSync(join(root, "governance/organization-policy-active.json")));
  assert.equal(active.humanDecisionId, "decision-baseline");
  assert.equal(active.activatedAtEpochMs, 100);
  assert.equal(Object.hasOwn(active, "backfillConsent"), false);
});

test("P-AC-09 requires the backfill consent to be a distinct decision bound to the exact previewed window", async () => {
  const root = mkdtempSync(join(tmpdir(), "organization-policy-activation-"));
  await baselineActivation(root);
  const plan = await backfillPlan(root);
  // Echoing the activation decision back is not a second, distinct consent.
  await assert.rejects(() => activateOrganizationPolicy({ repositoryRoot: root, plan, nowEpochMs: 300, authorize: backfillGrant("decision-controlled", "decision-controlled") }), (error) => error.code === "OPA-BACKFILL-CONSENT");
  // A consent bound to some other window cannot authorize this one.
  await assert.rejects(() => activateOrganizationPolicy({ repositoryRoot: root, plan, nowEpochMs: 300, authorize: backfillGrant("decision-controlled", "decision-backfill", "f".repeat(64)) }), (error) => error.code === "OPA-BACKFILL-CONSENT");
  const receipt = await activateOrganizationPolicy({ repositoryRoot: root, plan, nowEpochMs: 300, authorize: backfillGrant("decision-controlled", "decision-backfill") });
  assert.deepEqual(receipt.backfillConsent, { schema: "pipeline.organization-policy-backfill-consent.v1", backfillDecisionId: "decision-backfill", classes: ["security"], fromEpochMs: 100, toEpochMs: 300, subjectSha256: governanceBackfillConsentSubject({ activationId: "activate-controlled", effectivePolicySha256: plan.effectivePolicySha256, classes: ["security"], fromEpochMs: 100, toEpochMs: 300 }) });
  const active = JSON.parse(readFileSync(join(root, "governance/organization-policy-active.json")));
  assert.equal(canonicalizeJson(active.backfillConsent), canonicalizeJson(receipt.backfillConsent));
});

test("P-AC-09 refuses an unasked-for backfill consent and leaves a no-backfill activation's shape untouched", async () => {
  const root = mkdtempSync(join(tmpdir(), "organization-policy-activation-"));
  const plan = await planOrganizationPolicyActivation({ repositoryRoot: root, coreVersion: "0.4.7", packs: [pack(OPERATIONS_ONLY)], activationId: "activate-baseline" });
  await assert.rejects(() => activateOrganizationPolicy({ repositoryRoot: root, plan, nowEpochMs: 100, authorize: backfillGrant("decision-baseline", "decision-backfill", "a".repeat(64)) }), (error) => error.code === "OPA-AUTHORITY");
  const receipt = await activateOrganizationPolicy({ repositoryRoot: root, plan, nowEpochMs: 100, authorize: activationGrant("decision-baseline") });
  assert.equal(Object.hasOwn(receipt, "backfillConsent"), false);
});

test("P-AC-09 the consent subject is deterministic, window-bound, and fails closed on malformed input", () => {
  const subject = { activationId: "activate-controlled", effectivePolicySha256: "c".repeat(64), classes: ["security"], fromEpochMs: 100, toEpochMs: 300 };
  assert.equal(governanceBackfillConsentSubject(subject), governanceBackfillConsentSubject({ ...subject }));
  assert.notEqual(governanceBackfillConsentSubject(subject), governanceBackfillConsentSubject({ ...subject, toEpochMs: 301 }));
  assert.notEqual(governanceBackfillConsentSubject(subject), governanceBackfillConsentSubject({ ...subject, activationId: "activate-other" }));
  for (const broken of [{ ...subject, classes: [] }, { ...subject, classes: ["not-a-class"] }, { ...subject, classes: ["security", "operations"] }, { ...subject, toEpochMs: 99 }, { ...subject, effectivePolicySha256: "short" }]) {
    assert.throws(() => governanceBackfillConsentSubject(broken), (error) => error.code === "OPA-BACKFILL-SUBJECT");
  }
});

test("P-AC-09 selects exactly the half-open consented window", () => {
  const events = [40, 100, 299, 300, 400].map((occurredAtEpochMs) => ({ occurredAtEpochMs }));
  assert.deepEqual(selectBackfillEvents(events, { fromEpochMs: 100, toEpochMs: 300 }).map((event) => event.occurredAtEpochMs), [100, 299]);
  assert.deepEqual(selectBackfillEvents(events, { fromEpochMs: null, toEpochMs: 300 }).map((event) => event.occurredAtEpochMs), [40, 100, 299]);
  assert.deepEqual(selectBackfillEvents([], { fromEpochMs: null, toEpochMs: 300 }), []);
});

const sha = (character) => character.repeat(64);
const EXPORT_POLICY = { schema: "pipeline.governance-export-policy.v1", policyId: "backfill", revision: sha("b"), destinationProfile: "audit", format: "ndjson", allowedFields: ["eventId", "eventType", "occurredAtEpochMs", "eventDigest"] };
const EXPORT_PROFILE = { schema: "pipeline.governance-export-adapter-profile.v1", profileId: "audit", format: "ndjson", adapterVersion: "v1", maxBatchEvents: 10, maxPayloadBytes: 10_000, acknowledgement: "per-event", ordering: "per-stream", deduplication: true, advisory: false };
function governanceRepository() {
  const root = mkdtempSync(join(tmpdir(), "organization-policy-backfill-"));
  execFileSync("git", ["init", "-q", root]);
  const repository = discoverRepository(root);
  const repositoryFingerprint = derivePoGateRepositoryFingerprint({ gitCommonDir: repository.commonDir, primaryRoot: repository.primaryRoot });
  const capturePolicy = { schema: "pipeline.governance-capture-policy.v1", policyId: "fixture", revision: sha("c"), defaultAction: "deny", streams: [
    { origin: "human", purpose: "authority-history", materiality: "required", personalIdentifiability: "prohibited", contextualIdentifiability: "prohibited", storageProfile: "repository-public-safe", retention: "repository-retained", disclosure: "repository-visible", encryptionGeneration: null },
    { origin: "agent", purpose: "declared-assumption", materiality: "policy-selected", personalIdentifiability: "prohibited", contextualIdentifiability: "prohibited", storageProfile: "repository-public-safe", retention: "repository-retained", disclosure: "repository-visible", encryptionGeneration: null },
    { origin: "lifecycle", purpose: "deterministic-lifecycle", materiality: "required", personalIdentifiability: "prohibited", contextualIdentifiability: "prohibited", storageProfile: "repository-public-safe", retention: "repository-retained", disclosure: "repository-visible", encryptionGeneration: null },
  ], sanitizedReceipt: { allowEventId: true, allowEventDigest: true, allowCheckpoint: true, allowReasonText: false }, mandatoryEventClasses: [] };
  mkdirSync(join(root, "governance/events"), { recursive: true });
  writeFileSync(join(root, "governance/events/registry.json"), `${canonicalizeJson({ schema: "pipeline.governance-stream-registry.v1", repositoryFingerprint, canonicalization: "RFC8785", digestAlgorithm: "sha-256", eventDigestDomain: "pipeline.governance-event.v1\0", storageRoot: "governance/events", streams: [
    { streamId: "human", origin: "human", authorityClass: "human-authority", relativeRoot: "human", storageProfile: "repository-public-safe", genesis: { sequence: 0, eventDigest: null } },
    { streamId: "agent", origin: "agent", authorityClass: "non-authoritative", relativeRoot: "agent", storageProfile: "repository-public-safe", genesis: { sequence: 0, eventDigest: null } },
    { streamId: "lifecycle", origin: "lifecycle", authorityClass: "non-authoritative", relativeRoot: "lifecycle", storageProfile: "repository-public-safe", genesis: { sequence: 0, eventDigest: null } },
  ] })}\n`);
  writeFileSync(join(root, "governance/events/capture-policy.json"), `${canonicalizeJson(capturePolicy)}\n`);
  return { root, repositoryFingerprint, capturePolicy };
}
function lifecycleIntent({ repositoryFingerprint, capturePolicy, index, occurredAtEpochMs }) {
  const unavailable = { state: "not-applicable" };
  const candidate = { commit: "b".repeat(40), tree: "c".repeat(40) };
  return { schema: "pipeline.governance-event-envelope.v1", payloadSchema: "pipeline.lifecycle-governance-event.v1", canonicalization: "RFC8785", digestAlgorithm: "sha-256", eventId: `evt-pac09-${index}`, idempotencyKey: `idem-pac09-${index}`, origin: "lifecycle", authorityClass: "non-authoritative", eventType: "lifecycle.dispatch", occurredAtEpochMs, observedAtEpochMs: occurredAtEpochMs, timeAssurance: "locally-observed", repositoryFingerprint, sourceUri: `urn:pipeline:repository:${repositoryFingerprint}`, streamId: "lifecycle", correlation: { featureId: unavailable, packageId: "wp-p-ac09", requestId: unavailable, sessionId: unavailable, dispatchId: `dispatch-${index}`, traceId: unavailable }, candidate, artifacts: [unavailable], policy: { policyDigest: unavailable, configurationDigest: unavailable, capturePolicyDigest: canonicalSha256(capturePolicy), redactionPolicyDigest: unavailable }, classification: "repository-public-safe", storageProfile: "repository-public-safe", retentionCompatibility: "repository-retained", disclosureClass: "repository-visible", payload: { eventId: `lifecycle-pac09-${index}`, kind: "dispatch", status: "active", reasonCode: "DISPATCHED", correlation: { packageId: "wp-p-ac09", dispatchId: `dispatch-${index}`, attemptId: "attempt-1", workerId: "worker-1", correlationId: `correlation-${index}`, queueRevision: 0 }, candidate, invalidatesEventId: null, supersedesEventId: null } };
}

// P-AC-09 end to end over a real store: real appended historical events, a real
// consent, and the ordinary export/delivery mechanism -- no mocked export.
test("P-AC-09 exports exactly the consented historical events through the real export and delivery path", async () => {
  const { root, repositoryFingerprint, capturePolicy } = governanceRepository();
  for (const [index, occurredAtEpochMs] of [50, 150, 250].entries()) {
    const appended = await appendPortableGovernanceEvent({ repositoryRoot: root, repositoryFingerprint, intent: lifecycleIntent({ repositoryFingerprint, capturePolicy, index: index + 1, occurredAtEpochMs }) });
    assert.equal(appended.outcome, "appended");
  }
  await baselineActivation(root, 100);
  const plan = await backfillPlan(root);
  assert.deepEqual(plan.backfillRange, { classes: ["security"], fromEpochMs: 100 });
  const receipt = await activateOrganizationPolicy({ repositoryRoot: root, plan, nowEpochMs: 300, authorize: backfillGrant("decision-controlled", "decision-backfill") });

  const collector = createInMemoryGovernanceExportCollector({ profile: EXPORT_PROFILE });
  const result = await exportConsentedOrganizationPolicyBackfill({ repositoryRoot: root, repositoryFingerprint, streamId: "lifecycle", receipt, exportPolicy: EXPORT_POLICY, profile: EXPORT_PROFILE, adapter: collector, batchId: "backfill-1", maxEvents: 10, attempt: 1 });

  const queried = await queryPortableGovernanceStream({ repositoryRoot: root, repositoryFingerprint, streamId: "lifecycle" });
  const expected = queried.events.filter((event) => event.occurredAtEpochMs >= 100 && event.occurredAtEpochMs < 300).map((event) => event.eventDigest);
  const excluded = queried.events.find((event) => event.occurredAtEpochMs === 50).eventDigest;
  assert.equal(expected.length, 2);
  assert.deepEqual(result.window, { fromEpochMs: 100, toEpochMs: 300 });
  assert.deepEqual(result.classes, ["security"]);
  assert.deepEqual([...result.sourceEventDigests], expected);
  assert.equal(result.sourceEventDigests.includes(excluded), false);
  // The events reached the destination through the ordinary delivery path.
  const batches = collector.readback();
  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0].mappings.map((mapping) => mapping.sourceEventDigest), expected);
  assert.equal(batches[0].mappings.every((mapping) => JSON.parse(mapping.payload).fields.eventDigest !== undefined), true);
  assert.equal(result.delivery.receipt.terminalDisposition, "delivered");
  assert.equal(result.delivery.receipt.eventCount, 2);
  assert.equal(result.delivery.receipt.acknowledgementClass, "accepted");
  assert.equal(result.delivery.outbox.cursor, 2);

  // No consent, no export -- and a consent widened after the fact is refused.
  await assert.rejects(() => exportConsentedOrganizationPolicyBackfill({ repositoryRoot: root, repositoryFingerprint, streamId: "lifecycle", receipt: { schema: receipt.schema, status: receipt.status, activePath: receipt.activePath, activeSha256: receipt.activeSha256, activationId: receipt.activationId, effectivePolicySha256: receipt.effectivePolicySha256, humanDecisionId: receipt.humanDecisionId }, exportPolicy: EXPORT_POLICY, profile: EXPORT_PROFILE, adapter: collector, batchId: "backfill-2", maxEvents: 10, attempt: 1 }), (error) => error.code === "OPB-CONSENT-ABSENT");
  await assert.rejects(() => exportConsentedOrganizationPolicyBackfill({ repositoryRoot: root, repositoryFingerprint, streamId: "lifecycle", receipt: { ...receipt, backfillConsent: { ...receipt.backfillConsent, fromEpochMs: null } }, exportPolicy: EXPORT_POLICY, profile: EXPORT_PROFILE, adapter: collector, batchId: "backfill-3", maxEvents: 10, attempt: 1 }), (error) => error.code === "OPB-CONSENT-BINDING");
  assert.equal(collector.readback().length, 1);
});

test("P-AC-09 assertBackfillConsent refuses a consent that is absent or not distinct from the activation decision", () => {
  const base = { schema: "pipeline.organization-policy-activation-receipt.v1", status: "activated", activePath: "governance/organization-policy-active.json", activeSha256: sha("a"), activationId: "activate-controlled", effectivePolicySha256: sha("c"), humanDecisionId: "decision-controlled" };
  const consent = { schema: "pipeline.organization-policy-backfill-consent.v1", backfillDecisionId: "decision-backfill", classes: ["security"], fromEpochMs: 100, toEpochMs: 300, subjectSha256: governanceBackfillConsentSubject({ activationId: base.activationId, effectivePolicySha256: base.effectivePolicySha256, classes: ["security"], fromEpochMs: 100, toEpochMs: 300 }) };
  assert.deepEqual(assertBackfillConsent({ ...base, backfillConsent: consent }), consent);
  assert.throws(() => assertBackfillConsent(base), (error) => error.code === "OPB-CONSENT-ABSENT");
  assert.throws(() => assertBackfillConsent({ ...base, status: "preview", backfillConsent: consent }), (error) => error.code === "OPB-CONSENT-ABSENT");
  assert.throws(() => assertBackfillConsent({ ...base, backfillConsent: { ...consent, backfillDecisionId: base.humanDecisionId } }), (error) => error.code === "OPB-CONSENT-ABSENT");
  assert.throws(() => assertBackfillConsent({ ...base, backfillConsent: { ...consent, toEpochMs: 900 } }), (error) => error.code === "OPB-CONSENT-BINDING");
});
