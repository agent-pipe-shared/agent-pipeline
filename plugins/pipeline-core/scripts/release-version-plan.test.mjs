#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  CHANNEL_FETCH_SKEW_MS,
  DECISION_MAX_AGE_MS,
  ReleaseVersionDecisionError,
  canonicalJson,
  checkReleaseVersionPlanSecurityCompleteness,
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
import { hardenWindowsPrivateDirectory } from "../lib/windows-private-state.mjs";

const NOW = Date.parse("2026-07-19T12:00:00.000Z");
const h = (char, length = 64) => char.repeat(length);
function selection(promotionChannel = "stable", targetVersion = "0.4.7", overrides = {}) {
  return {
    promotionChannel,
    targetVersion,
    targetTag: `v${targetVersion}`,
    candidateCommit: h("f", 40),
    candidateTree: h("e", 40),
    ...overrides,
  };
}
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
function input(privateVersion = "0.4.6", publicVersion = "0.4.6", overrides = {}) {
  return {
    private: channel(privateVersion),
    neutralPublic: channel(publicVersion, 60_000),
    proofs: { private: { annotated: true, peeledCommitAncestor: true }, neutralPublic: { annotated: true, peeledCommitAncestor: true } },
    selection: selection(),
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
    neutralPublicProductCandidate: { repositoryFingerprint: decision.neutralPublic.repositoryFingerprint, commit: decision.selection.candidateCommit, tree: decision.selection.candidateTree },
    versionSurfaces: versionSurfaces(decision.targetVersion),
    recovery: null,
    createdAt: new Date(NOW).toISOString(),
    ...overrides,
  };
}

/**
 * Schema-shaped v2 envelope+verdict pair for `checkReleaseVersionPlanSecurityCompleteness`'s own
 * cases below -- mirrors `security-completeness-gate.test.mjs`'s `exactV2Envelope`/
 * `exactV2Verdict`/`writePair` fixture shapes exactly (this module's own tests otherwise stay
 * fully in-memory; the four completeness-gate cases below are the only ones that need a real
 * temp `projectDir` because `checkSecurityCompleteness`, unlike everything else in this file,
 * reads real evidence files off disk by design).
 */
function writeReleasePlanSecurityEvidence(dir, {
  commit,
  tree,
  status = "PASS",
  classification = "clean",
  outcome = "pass",
  blocking = false,
  offendingCapabilities = [],
}) {
  const envelope = {
    schema: "pipeline.security-evidence.v2",
    policy: { configurationSha256: h("e") },
    input: { commit, tree, inputSha256: h("f") },
    environment: { platform: process.platform, nodeVersion: process.version },
    capabilities: [{
      capabilityId: "cap.secrets",
      tool: { name: "gitleaks", version: null },
      rulePack: { ref: "gitleaks-default", digest: null },
      status,
      classification,
      findings: [],
      coverage: {
        subject: "candidate-tree",
        exclusions: [],
        ignored: [],
        unsupportedScope: [],
        truncation: { truncated: false, scannedFileCount: null, totalEligibleFileCount: null },
        dataAge: { ageSeconds: 0, snapshotAt: null },
      },
      reason: null,
    }],
  };
  const verdict = {
    schema: "pipeline.security-verdict.v2",
    producedFrom: "pipeline.security-evidence.v2",
    exitAuthority: "v1-blocking-logic",
    note: "fixture",
    v1ExitCode: 0,
    plan: { required: ["cap.secrets"], optional: [], planDigest: h("g"), source: "fixture", resolvedPolicyDigest: h("h") },
    capabilityOutcomes: { "cap.secrets": outcome },
    verdict: { blocking, offendingCapabilities },
    controls: [],
  };
  const envelopePath = join(dir, "evidence/security-latest.v2.json");
  const verdictPath = join(dir, "evidence/security-latest.v2.verdict.json");
  mkdirSync(dirname(envelopePath), { recursive: true });
  writeFileSync(envelopePath, JSON.stringify(envelope));
  writeFileSync(verdictPath, JSON.stringify(verdict));
}

const cases = [
  ["explicit stable patch selection preserves 0.4.7 without forcing next minor", () => {
    const decision = createReleaseVersionDecision(input(), { nowMs: NOW });
    assert.equal(decision.selection.promotionChannel, "stable");
    assert.equal(decision.targetVersion, "0.4.7");
    assert.equal(decision.targetTag, "v0.4.7");
    assert.equal(validateReleaseVersionDecision(decision, { nowMs: NOW }), true);
  }],
  ["explicit beta selection binds exact prerelease channel, version, tag and candidate", () => {
    const decision = createReleaseVersionDecision(input("0.4.6", "0.4.6", { selection: selection("beta", "0.4.7-beta.1") }), { nowMs: NOW });
    assert.equal(decision.selection.promotionChannel, "beta");
    assert.equal(decision.targetVersion, "0.4.7-beta.1");
    assert.equal(decision.targetTag, "v0.4.7-beta.1");
    assert.equal(decision.selection.candidateCommit, h("f", 40));
  }],
  ["higher observed baseline constrains but does not choose an explicit target", () => {
    const decision = createReleaseVersionDecision(input("0.4.6", "2.7.9", { selection: selection("stable", "2.7.10") }), { nowMs: NOW });
    assert.equal(decision.targetVersion, "2.7.10");
  }],
  ["next-minor helper remains recommendation metadata only", () => assert.equal(nextMinorVersion("9.999.4"), "9.1000.0")],
  ["SemVer comparison is numeric, not lexical", () => assert.equal(compareStableVersions("0.10.0", "0.9.99"), 1)],
  ["prerelease, build metadata, and substituted tag fail closed", () => {
    for (const values of [
      input("1.0.0-alpha", "1.0.0"),
      input("1.0.0+build", "1.0.0"),
      input("1.0.0", "1.0.0", { private: channel("1.0.0", 0, { highestStableTag: "v1.0.1" }) }),
    ]) assert.throws(() => createReleaseVersionDecision(values, { nowMs: NOW }), ReleaseVersionDecisionError);
  }],
  ["alpha, missing selection, implicit target and malformed beta identifiers fail closed", () => {
    const missing = input(); delete missing.selection;
    const implicit = input(); implicit.selection = { promotionChannel: "stable" };
    for (const value of [
      input("0.4.6", "0.4.6", { selection: selection("alpha", "0.4.7") }),
      missing,
      implicit,
      input("0.4.6", "0.4.6", { selection: selection("beta", "0.4.7-beta.01") }),
      input("0.4.6", "0.4.6", { selection: selection("beta", "0.04.7-beta.1") }),
      input("0.4.6", "0.4.6", { selection: selection("stable", "0.4.7-beta.1") }),
      input("0.4.6", "0.4.6", { selection: selection("beta", "0.4.7") }),
    ]) assert.throws(() => createReleaseVersionDecision(value, { nowMs: NOW }), ReleaseVersionDecisionError);
  }],
  ["selection tag mismatch and a target not above observed stable fail closed", () => {
    assert.throws(() => createReleaseVersionDecision(input("0.4.6", "0.4.6", {
      selection: selection("stable", "0.4.7", { targetTag: "v0.4.8" }),
    }), { nowMs: NOW }), ReleaseVersionDecisionError);
    assert.throws(() => createReleaseVersionDecision(input("0.4.7", "0.4.7", {
      selection: selection("beta", "0.4.7-beta.1"),
    }), { nowMs: NOW }), ReleaseVersionDecisionError);
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
    const substitutedSelection = structuredClone(decision); substitutedSelection.selection.candidateCommit = h("1", 40);
    assert.throws(() => validateReleaseVersionDecision(substitutedSelection, { nowMs: NOW }), ReleaseVersionDecisionError);
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
      if (process.platform !== "win32") assert.equal(lstatSync(expected).mode & 0o777, 0o600);
      writeFileSync(expected, "{}", "utf8");
      assert.throws(() => storeReleaseVersionDecision({ gitCommonDir: common, repoFingerprint: h("9"), decision }, { nowMs: NOW }), (error) => error instanceof ReleaseVersionDecisionError && error.code === "RVD-CONFLICT");
    } finally { rmSync(common, { recursive: true, force: true }); }
  }],
  ["sealed plan binds the exact decision and all five version surfaces", () => {
    const inputValue = planInput();
    const plan = createReleaseVersionPlan(inputValue, { nowMs: NOW });
    assert.equal(plan.status, "sealed");
    assert.equal(plan.targetVersion, "0.4.7");
    assert.deepEqual(plan.selection, inputValue.decision.selection);
    assert.equal(plan.versions.codexMarketplaceResolved, plan.targetVersion);
    assert.equal(plan.surfaceDigests.private.length, 5);
    assert.equal(validateReleaseVersionPlan(plan, { decision: inputValue.decision, nowMs: NOW }), true);
  }],
  ["surface consistency requires exact VERSION bytes and all resolved versions", () => {
    const target = "0.4.7";
    const missingNewline = versionSurfaces(target); missingNewline.private[0].bytes = target;
    const marketplaceMismatch = versionSurfaces(target); marketplaceMismatch.neutralPublic[4].bytes = manifest("0.4.1");
    const duplicate = versionSurfaces(target); duplicate.private[4].surface = "claudePlugin";
    for (const value of [missingNewline, marketplaceMismatch, duplicate]) assert.throws(() => deriveVersionSurfaceConsistency(value, target), ReleaseVersionDecisionError);
  }],
  ["plan rejects decision substitution and candidate channel mismatch", () => {
    const source = planInput();
    const plan = createReleaseVersionPlan(source, { nowMs: NOW });
    const otherDecision = createReleaseVersionDecision(input("1.0.0", "1.0.0", { selection: selection("stable", "1.0.1") }), { nowMs: NOW });
    assert.throws(() => validateReleaseVersionPlan(plan, { decision: otherDecision, nowMs: NOW }), ReleaseVersionDecisionError);
    const substitutedPlan = structuredClone(plan); substitutedPlan.selection.candidateTree = h("2", 40);
    assert.throws(() => validateReleaseVersionPlan(substitutedPlan, { decision: source.decision, nowMs: NOW }), ReleaseVersionDecisionError);
    const badCandidate = planInput(); badCandidate.privateProductCandidate.repositoryFingerprint = h("f");
    assert.throws(() => createReleaseVersionPlan(badCandidate, { nowMs: NOW }), ReleaseVersionDecisionError);
    const substitutedPublicCandidate = planInput(); substitutedPublicCandidate.neutralPublicProductCandidate.commit = h("9", 40);
    assert.throws(() => createReleaseVersionPlan(substitutedPublicCandidate, { nowMs: NOW }), (error) => error instanceof ReleaseVersionDecisionError && error.code === "RVP-CANDIDATE");
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
      if (process.platform !== "win32") {
        assert.equal(lstatSync(recordPath).mode & 0o777, 0o600);
        assert.equal(lstatSync(journalPath).mode & 0o777, 0o600);
      }
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
      let existingAncestor = dirname(journalPath);
      while (!existsSync(existingAncestor)) existingAncestor = dirname(existingAncestor);
      mkdirSync(join(journalPath, ".."), { recursive: true, mode: 0o700 });
      chmodSync(join(journalPath, ".."), 0o700);
      // On native Windows chmod cannot establish the owner-only DACL the private
      // record directory contract requires; the recursive mkdirSync above may have
      // created several nested levels, and production's ensurePrivateDirectory
      // asserts every ancestor down to the journal's parent -- harden each newly
      // created component (no-op on POSIX), matching how the production writer
      // hardens directories it creates itself.
      if (process.platform === "win32") {
        for (let cursor = dirname(journalPath); cursor !== existingAncestor; cursor = dirname(cursor)) {
          hardenWindowsPrivateDirectory(cursor);
        }
      }
      writeFileSync(journalPath, canonicalJson(journal), { mode: 0o600 });
      const recovered = recoverReleaseVersionPlan({ gitCommonDir: common, repoFingerprint: h("c"), planId: plan.planId, decision: source.decision }, { nowMs: NOW });
      assert.equal(recovered.status, "stored");
      assert.equal(JSON.parse(readFileSync(journalPath, "utf8")).phase, "complete");
      writeFileSync(recordPath, "third-bytes", "utf8");
      assert.throws(() => recoverReleaseVersionPlan({ gitCommonDir: common, repoFingerprint: h("c"), planId: plan.planId, decision: source.decision }, { nowMs: NOW }), ReleaseVersionDecisionError);
    } finally { rmSync(common, { recursive: true, force: true }); }
  }],
  ["release plan completeness gate (CYB-2I-3): fresh bound non-blocking pair is a pass (empty failure array)", () => {
    const dir = mkdtempSync(join(tmpdir(), "release-plan-completeness-"));
    try {
      const source = planInput();
      const plan = createReleaseVersionPlan(source, { nowMs: NOW });
      writeReleasePlanSecurityEvidence(dir, { commit: plan.privateProductCandidate.commit, tree: plan.privateProductCandidate.tree });
      const failures = checkReleaseVersionPlanSecurityCompleteness(plan, { projectDir: dir });
      assert.deepStrictEqual(failures, []);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }],
  ["release plan completeness gate (CYB-2I-3): blocking verdict surfaces the shared gate's own failure line", () => {
    const dir = mkdtempSync(join(tmpdir(), "release-plan-completeness-"));
    try {
      const source = planInput();
      const plan = createReleaseVersionPlan(source, { nowMs: NOW });
      writeReleasePlanSecurityEvidence(dir, {
        commit: plan.privateProductCandidate.commit,
        tree: plan.privateProductCandidate.tree,
        status: "SKIPPED",
        classification: "binary_missing",
        outcome: "required-capability-missing",
        blocking: true,
        offendingCapabilities: [{ capabilityId: "cap.secrets", outcome: "required-capability-missing" }],
      });
      const failures = checkReleaseVersionPlanSecurityCompleteness(plan, { projectDir: dir });
      assert.deepStrictEqual(failures, [
        "evidence/security-latest.v2.verdict.json: required capability cap.secrets did not reach an accepted state (outcome=required-capability-missing)",
      ]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }],
  ["release plan completeness gate (CYB-2I-3): missing evidence fails closed with both reasons reported", () => {
    const dir = mkdtempSync(join(tmpdir(), "release-plan-completeness-"));
    try {
      const source = planInput();
      const plan = createReleaseVersionPlan(source, { nowMs: NOW });
      const failures = checkReleaseVersionPlanSecurityCompleteness(plan, { projectDir: dir });
      assert.deepStrictEqual(failures, [
        "evidence/security-latest.v2.json missing",
        "evidence/security-latest.v2.verdict.json missing",
      ]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }],
  ["release plan completeness gate (CYB-2I-3): evidence bound to a different commit/tree than the plan's own private candidate is caught", () => {
    const dir = mkdtempSync(join(tmpdir(), "release-plan-completeness-"));
    try {
      const source = planInput();
      const plan = createReleaseVersionPlan(source, { nowMs: NOW });
      writeReleasePlanSecurityEvidence(dir, { commit: h("1", 40), tree: h("2", 40) }); // bound to a DIFFERENT commit/tree than plan.privateProductCandidate
      const failures = checkReleaseVersionPlanSecurityCompleteness(plan, { projectDir: dir });
      assert.deepStrictEqual(failures, [
        "evidence/security-latest.v2.json: input commit does not match the pushed source",
        "evidence/security-latest.v2.json: input tree does not match the pushed source",
      ]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }],
  ["release plan completeness gate (CYB-2I-3): requires an already-sealed plan", () => {
    const source = planInput();
    const plan = createReleaseVersionPlan(source, { nowMs: NOW });
    const notSealed = { ...plan, status: "draft" };
    assert.throws(
      () => checkReleaseVersionPlanSecurityCompleteness(notSealed, { projectDir: "/irrelevant" }),
      (error) => error instanceof ReleaseVersionDecisionError && error.code === "RVP-COMPLETENESS",
    );
  }],
  ["release plan completeness gate (CYB-2I-3): requires a caller-supplied projectDir (no process.cwd() default)", () => {
    const source = planInput();
    const plan = createReleaseVersionPlan(source, { nowMs: NOW });
    assert.throws(
      () => checkReleaseVersionPlanSecurityCompleteness(plan, {}),
      (error) => error instanceof ReleaseVersionDecisionError && error.code === "RVP-COMPLETENESS",
    );
  }],
];

let passed = 0;
for (const [name, run] of cases) {
  try { run(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}: ${error.message}`); }
}
console.log(`${passed}/${cases.length} cases passed.`);
if (passed !== cases.length) process.exitCode = 1;
