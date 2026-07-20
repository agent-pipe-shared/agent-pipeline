#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CHANNEL_FETCH_SKEW_MS,
  DECISION_MAX_AGE_MS,
  ReleaseVersionDecisionError,
  canonicalJson,
  createReleaseVersionPlanJournal,
  compareStableVersions,
  createReleaseVersionDecision,
  createReleaseVersionPlan,
  deriveVersionSurfaceConsistency,
  nextMinorVersion,
  releaseVersionDecisionPath,
  releaseVersionPlanJournalPath,
  releaseVersionPlanPath,
  recoverReleaseVersionPlan,
  storeReleaseVersionDecision,
  storeReleaseVersionPlan,
  validateReleaseVersionDecision,
  validateReleaseVersionPlan,
} from "./release-version-plan.mjs";

const NOW = Date.parse("2026-07-19T12:00:00.000Z");
const h = (char, length = 64) => char.repeat(length);
function channel(version, offsetMs = 0, overrides = {}) {
  return {
    repositoryFingerprint: h(version[0] === "0" ? "a" : "b"),
    ref: "refs/heads/main",
    commit: h("c", 40),
    tree: h("d", 40),
    highestStableTag: `v${version}`,
    highestStableVersion: version,
    peeledCommit: h("e", 40),
    fetchedAt: new Date(NOW - offsetMs).toISOString(),
    ...overrides,
  };
}
function input(privateVersion = "0.3.1", publicVersion = "0.3.1", overrides = {}) {
  return {
    private: channel(privateVersion),
    neutralPublic: channel(publicVersion, 60_000),
    proofs: { private: { annotated: true, peeledCommitAncestor: true }, neutralPublic: { annotated: true, peeledCommitAncestor: true } },
    observedAt: new Date(NOW).toISOString(),
    ...overrides,
  };
}
function manifest(version, extra = {}) { return JSON.stringify({ version, ...extra }); }
function versionSurfaces(version, overrides = {}) {
  const entries = [
    { surface: "versionFile", path: "VERSION", bytes: `${version}\n` },
    { surface: "codexPlugin", path: "plugins/pipeline-core/.codex-plugin/plugin.json", bytes: manifest(version, { provider: "codex" }) },
    { surface: "claudePlugin", path: "plugins/pipeline-core/.claude-plugin/plugin.json", bytes: manifest(version, { provider: "claude" }) },
    { surface: "codexMarketplaceResolved", path: "plugins/pipeline-core/.codex-plugin/plugin.json", bytes: manifest(version, { provider: "codex" }) },
    { surface: "claudeMarketplaceResolved", path: "plugins/pipeline-core/.claude-plugin/plugin.json", bytes: manifest(version, { provider: "claude" }) },
  ];
  return { private: structuredClone(entries), neutralPublic: structuredClone(entries), ...overrides };
}
function planInput(overrides = {}) {
  const decision = createReleaseVersionDecision(input(), { nowMs: NOW });
  return {
    decision,
    evidenceRevision: 1,
    documentEvidenceSha256: h("1"),
    externalPrerequisite: { itemId: "pipeline.source-available-commercial-licensing", closureCommit: h("2", 40), resultSha256: h("3"), transitionSha256: h("4"), privateLicenseGateSha256: h("5"), neutralPublicLicenseGateSha256: h("6") },
    privateProductCandidate: { repositoryFingerprint: decision.private.repositoryFingerprint, commit: h("7", 40), tree: h("8", 40) },
    neutralPublicProductCandidate: { repositoryFingerprint: decision.neutralPublic.repositoryFingerprint, commit: h("9", 40), tree: h("a", 40) },
    versionSurfaces: versionSurfaces(decision.targetVersion),
    recovery: null,
    createdAt: new Date(NOW).toISOString(),
    ...overrides,
  };
}

const cases = [
  ["greater current baseline derives v0.4.0", () => {
    const decision = createReleaseVersionDecision(input(), { nowMs: NOW });
    assert.equal(decision.targetVersion, "0.4.0");
    assert.equal(decision.targetTag, "v0.4.0");
    assert.equal(validateReleaseVersionDecision(decision, { nowMs: NOW }), true);
  }],
  ["higher neutral-public baseline wins", () => assert.equal(createReleaseVersionDecision(input("0.3.1", "2.7.9"), { nowMs: NOW }).targetVersion, "2.8.0")],
  ["minor rollover keeps major and resets patch", () => assert.equal(nextMinorVersion("9.999.4"), "9.1000.0")],
  ["SemVer comparison is numeric, not lexical", () => assert.equal(compareStableVersions("0.10.0", "0.9.99"), 1)],
  ["prerelease, build metadata, and substituted tag fail closed", () => {
    for (const values of [
      input("1.0.0-alpha", "1.0.0"),
      input("1.0.0+build", "1.0.0"),
      input("1.0.0", "1.0.0", { private: channel("1.0.0", 0, { highestStableTag: "v1.0.1" }) }),
    ]) assert.throws(() => createReleaseVersionDecision(values, { nowMs: NOW }), ReleaseVersionDecisionError);
  }],
  ["missing annotated or ancestral proof fails before a decision exists", () => {
    for (const proofs of [
      { private: { annotated: false, peeledCommitAncestor: true }, neutralPublic: { annotated: true, peeledCommitAncestor: true } },
      { private: { annotated: true, peeledCommitAncestor: true }, neutralPublic: { annotated: true, peeledCommitAncestor: false } },
    ]) assert.throws(() => createReleaseVersionDecision(input("0.3.1", "0.3.1", { proofs }), { nowMs: NOW }), ReleaseVersionDecisionError);
  }],
  ["stale, future, and skewed fetch observations fail closed", () => {
    const stale = input(); stale.private.fetchedAt = new Date(NOW - DECISION_MAX_AGE_MS - 1).toISOString();
    const future = input(); future.neutralPublic.fetchedAt = new Date(NOW + 1).toISOString();
    const skew = input(); skew.neutralPublic.fetchedAt = new Date(NOW - CHANNEL_FETCH_SKEW_MS - 1).toISOString();
    for (const value of [stale, future, skew]) assert.throws(() => createReleaseVersionDecision(value, { nowMs: NOW }), ReleaseVersionDecisionError);
  }],
  ["the durable ID binds both channels, target, and observer time", () => {
    const decision = createReleaseVersionDecision(input(), { nowMs: NOW });
    const changed = structuredClone(decision); changed.neutralPublic.tree = h("f", 40);
    assert.throws(() => validateReleaseVersionDecision(changed, { nowMs: NOW }), ReleaseVersionDecisionError);
  }],
  ["private storage uses exactly one no-replace canonical record path", () => {
    const common = mkdtempSync(join(tmpdir(), "release-version-decision-"));
    try {
      const decision = createReleaseVersionDecision(input(), { nowMs: NOW });
      const stored = storeReleaseVersionDecision({ gitCommonDir: common, repoFingerprint: h("9"), decision }, { nowMs: NOW });
      const replay = storeReleaseVersionDecision({ gitCommonDir: common, repoFingerprint: h("9"), decision }, { nowMs: NOW });
      const expected = releaseVersionDecisionPath({ gitCommonDir: common, repoFingerprint: h("9"), decisionId: decision.decisionId });
      assert.equal(stored.status, "stored");
      assert.equal(replay.status, "replay");
      assert.equal(stored.path, expected);
      assert.equal(readFileSync(expected, "utf8"), canonicalJson(decision));
      assert.equal(lstatSync(expected).mode & 0o777, 0o600);
      writeFileSync(expected, "{}", "utf8");
      assert.throws(() => storeReleaseVersionDecision({ gitCommonDir: common, repoFingerprint: h("9"), decision }, { nowMs: NOW }), (error) => error instanceof ReleaseVersionDecisionError && error.code === "RVD-CONFLICT");
    } finally { rmSync(common, { recursive: true, force: true }); }
  }],
  ["sealed plan binds the exact decision and all five version surfaces", () => {
    const inputValue = planInput();
    const plan = createReleaseVersionPlan(inputValue, { nowMs: NOW });
    assert.equal(plan.status, "sealed");
    assert.equal(plan.targetVersion, "0.4.0");
    assert.equal(plan.versions.codexMarketplaceResolved, plan.targetVersion);
    assert.equal(plan.surfaceDigests.private.length, 5);
    assert.equal(validateReleaseVersionPlan(plan, { decision: inputValue.decision, nowMs: NOW }), true);
  }],
  ["surface consistency requires exact VERSION bytes and all resolved versions", () => {
    const target = "0.4.0";
    const missingNewline = versionSurfaces(target); missingNewline.private[0].bytes = target;
    const marketplaceMismatch = versionSurfaces(target); marketplaceMismatch.neutralPublic[4].bytes = manifest("0.4.1");
    const duplicate = versionSurfaces(target); duplicate.private[4].surface = "claudePlugin";
    for (const value of [missingNewline, marketplaceMismatch, duplicate]) assert.throws(() => deriveVersionSurfaceConsistency(value, target), ReleaseVersionDecisionError);
  }],
  ["plan rejects decision substitution and candidate channel mismatch", () => {
    const source = planInput();
    const plan = createReleaseVersionPlan(source, { nowMs: NOW });
    const otherDecision = createReleaseVersionDecision(input("1.0.0", "1.0.0"), { nowMs: NOW });
    assert.throws(() => validateReleaseVersionPlan(plan, { decision: otherDecision, nowMs: NOW }), ReleaseVersionDecisionError);
    const badCandidate = planInput(); badCandidate.privateProductCandidate.repositoryFingerprint = h("f");
    assert.throws(() => createReleaseVersionPlan(badCandidate, { nowMs: NOW }), ReleaseVersionDecisionError);
  }],
  ["sealed plan storage is private, immutable, and retains an explicit-ID journal", () => {
    const common = mkdtempSync(join(tmpdir(), "release-version-plan-"));
    try {
      const source = planInput();
      const plan = createReleaseVersionPlan(source, { nowMs: NOW });
      const stored = storeReleaseVersionPlan({ gitCommonDir: common, repoFingerprint: h("b"), plan, decision: source.decision }, { nowMs: NOW });
      const replay = storeReleaseVersionPlan({ gitCommonDir: common, repoFingerprint: h("b"), plan, decision: source.decision }, { nowMs: NOW });
      const recordPath = releaseVersionPlanPath({ gitCommonDir: common, repoFingerprint: h("b"), planId: plan.planId });
      const journalPath = releaseVersionPlanJournalPath({ gitCommonDir: common, repoFingerprint: h("b"), planId: plan.planId });
      assert.equal(stored.status, "stored");
      assert.equal(replay.status, "replay");
      assert.equal(readFileSync(recordPath, "utf8"), canonicalJson(plan));
      assert.equal(JSON.parse(readFileSync(journalPath, "utf8")).phase, "complete");
      assert.equal(lstatSync(recordPath).mode & 0o777, 0o600);
      assert.equal(lstatSync(journalPath).mode & 0o777, 0o600);
    } finally { rmSync(common, { recursive: true, force: true }); }
  }],
  ["prepared plan journal recovers only its named absent or exact record", () => {
    const common = mkdtempSync(join(tmpdir(), "release-version-recovery-"));
    try {
      const source = planInput();
      const plan = createReleaseVersionPlan(source, { nowMs: NOW });
      const recordPath = releaseVersionPlanPath({ gitCommonDir: common, repoFingerprint: h("c"), planId: plan.planId });
      const journalPath = releaseVersionPlanJournalPath({ gitCommonDir: common, repoFingerprint: h("c"), planId: plan.planId });
      const journal = createReleaseVersionPlanJournal({ gitCommonDir: common, repoFingerprint: h("c"), plan, decision: source.decision, createdAt: new Date(NOW).toISOString() });
      mkdirSync(join(journalPath, ".."), { recursive: true, mode: 0o700 });
      chmodSync(join(journalPath, ".."), 0o700);
      writeFileSync(journalPath, canonicalJson(journal), { mode: 0o600 });
      const recovered = recoverReleaseVersionPlan({ gitCommonDir: common, repoFingerprint: h("c"), planId: plan.planId, decision: source.decision }, { nowMs: NOW });
      assert.equal(recovered.status, "stored");
      assert.equal(JSON.parse(readFileSync(journalPath, "utf8")).phase, "complete");
      writeFileSync(recordPath, "third-bytes", "utf8");
      assert.throws(() => recoverReleaseVersionPlan({ gitCommonDir: common, repoFingerprint: h("c"), planId: plan.planId, decision: source.decision }, { nowMs: NOW }), ReleaseVersionDecisionError);
    } finally { rmSync(common, { recursive: true, force: true }); }
  }],
];

let passed = 0;
for (const [name, run] of cases) {
  try { run(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}: ${error.message}`); }
}
console.log(`${passed}/${cases.length} cases passed.`);
if (passed !== cases.length) process.exitCode = 1;
