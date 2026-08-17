#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PARALLEL_SPRINT_DISPOSITIONS,
  PARALLEL_SPRINT_IMPACT_REVIEW_SCHEMA,
  PARALLEL_SPRINT_PUBLICATION_GATE_INPUT_SCHEMA,
  PARALLEL_SPRINT_PUBLICATION_GATE_RECEIPT_SCHEMA,
  PARALLEL_SPRINT_RECOVERY_ACTIONS,
  PARALLEL_SPRINT_SELECTION_SCHEMA,
  checkUnpublishedSiblingSprintConsumption,
  digestParallelSprintValue,
  planParallelSprintIntegration,
} from "./parallel-sprint-integration.mjs";

const BASELINE = Object.freeze({
  kind: "release-tag",
  ref: "v0.4.7",
  commit: "a".repeat(40),
  tree: "b".repeat(40),
});
const ADVANCED = Object.freeze({
  kind: "main-commit",
  ref: "main",
  commit: "c".repeat(40),
  tree: "d".repeat(40),
});

function input(overrides = {}) {
  return {
    schema: "pipeline.parallel-sprint-integration-input.v1",
    baseline: { ...BASELINE },
    candidateWriteSet: ["plugins/pipeline-core/lib/parallel-sprint-integration.mjs"],
    writeSetScope: "exact",
    advance: { kind: "none", baseline: null, writeSet: [], surfaces: [] },
    promotion: { poSelected: false, reason: "none" },
    interrupted: "none",
    ...overrides,
  };
}

function confirmedSelection(candidate) {
  const body = {
    schema: PARALLEL_SPRINT_SELECTION_SCHEMA,
    sprintId: candidate.sprintId,
    candidateCommit: candidate.commit,
    candidateTree: candidate.tree,
    firstMergeReady: true,
    poAuthoritySha256: "4".repeat(64),
    confirmed: true,
  };
  return { ...body, selectionSha256: digestParallelSprintValue(body) };
}

function promotion(targetMain = ADVANCED) {
  const candidate = {
    sprintId: "sprint-nova",
    commit: "1".repeat(40),
    tree: "2".repeat(40),
    approvedScopeSha256: "3".repeat(64),
    candidateEvidenceSha256: "4".repeat(64),
    gatesSha256: "5".repeat(64),
    gatesReady: true,
  };
  return {
    poSelected: true,
    reason: "merge-ready-candidate",
    candidate,
    selection: confirmedSelection(candidate),
    targetMain: { ...targetMain },
  };
}

function impactReviewFor(plan, decision = "compatible") {
  const body = {
    ...plan.action.review,
    decision,
    poExceptionSha256: null,
    confirmed: true,
  };
  return { ...body, receiptSha256: digestParallelSprintValue(body) };
}

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  process.stdout.write(`PASS PSI${String(passed).padStart(2, "0")} ${name}\n`);
}

check("keeps an exact SHA-1 baseline current without claiming repository freshness", () => {
  const receipt = planParallelSprintIntegration(input());
  assert.equal(receipt.disposition, PARALLEL_SPRINT_DISPOSITIONS.BASELINE_CURRENT);
  assert.equal(receipt.action, null);
  assert.equal(receipt.repositoryFreshness, "independent-unobserved");
  assert.equal(receipt.mergeReadyClaim, null);
  assert.match(receipt.requestSha256, /^[a-f0-9]{64}$/u);
  assert.match(receipt.receiptSha256, /^[a-f0-9]{64}$/u);
});

check("accepts exact SHA-256 Git identities but rejects intermediate-length pseudo-OIDs", () => {
  const sha256 = planParallelSprintIntegration(input({
    baseline: { ...BASELINE, commit: "a".repeat(64), tree: "b".repeat(64) },
  }));
  assert.equal(sha256.disposition, PARALLEL_SPRINT_DISPOSITIONS.BASELINE_CURRENT);
  const pseudo = planParallelSprintIntegration(input({
    baseline: { ...BASELINE, commit: "a".repeat(48), tree: "b".repeat(48) },
  }));
  assert.equal(pseudo.action.kind, PARALLEL_SPRINT_RECOVERY_ACTIONS.BASELINE_REPAIR);
});

check("defers a disjoint advance without freshness or merge-readiness claims", () => {
  const receipt = planParallelSprintIntegration(input({
    advance: { kind: "ordinary", baseline: { ...ADVANCED }, writeSet: ["docs/changelog.md"], surfaces: [] },
  }));
  assert.equal(receipt.disposition, PARALLEL_SPRINT_DISPOSITIONS.BASELINE_STALE_DEFERRED);
  assert.equal(receipt.status, "work-permitted");
  assert.equal(receipt.action, null);
  assert.equal(receipt.baselineFreshnessClaim, null);
  assert.equal(receipt.mergeReadyClaim, null);
});

check("requires a confirmed digest-bound review for protected and overlapping surfaces", () => {
  const protectedPlan = planParallelSprintIntegration(input({
    advance: { kind: "ordinary", baseline: { ...ADVANCED }, writeSet: ["docs/changelog.md"], surfaces: ["security"] },
  }));
  assert.equal(protectedPlan.disposition, PARALLEL_SPRINT_DISPOSITIONS.BASELINE_IMPACT_REVIEW_REQUIRED);
  assert.equal(protectedPlan.action.kind, PARALLEL_SPRINT_RECOVERY_ACTIONS.IMPACT_REVIEW_RECEIPT);
  assert.equal(protectedPlan.action.requiresConfirmation, true);
  assert.match(protectedPlan.action.reviewSha256, /^[a-f0-9]{64}$/u);

  const overlapPlan = planParallelSprintIntegration(input({
    advance: { kind: "ordinary", baseline: { ...ADVANCED }, writeSet: ["plugins/pipeline-core/lib"], surfaces: [] },
  }));
  assert.equal(overlapPlan.action.review.writeSetComparison.overlap, true);
});

check("accepts the exact confirmed impact receipt and detects receipt drift", () => {
  const changed = { kind: "ordinary", baseline: { ...ADVANCED }, writeSet: ["docs/changelog.md"], surfaces: ["security"] };
  const plan = planParallelSprintIntegration(input({ advance: changed }));
  const receipt = impactReviewFor(plan);
  const accepted = planParallelSprintIntegration(input({ advance: changed, impactReview: receipt }));
  assert.equal(accepted.disposition, PARALLEL_SPRINT_DISPOSITIONS.BASELINE_STALE_DEFERRED);
  assert.equal(accepted.code, "PSI-CONFIRMED-IMPACT-DEFERRED");
  assert.equal(accepted.impactReviewReceiptSha256, receipt.receiptSha256);

  const drifted = planParallelSprintIntegration(input({
    advance: { ...changed, writeSet: ["docs/other.md"] },
    impactReview: receipt,
  }));
  assert.equal(drifted.disposition, PARALLEL_SPRINT_DISPOSITIONS.BASELINE_IMPACT_REVIEW_REQUIRED);
  assert.equal(drifted.code, "PSI-IMPACT-RECEIPT-DRIFT");
});

check("requires explicit PO selection, ready evidence and exact target main before promotion", () => {
  const missing = planParallelSprintIntegration(input({
    promotion: { poSelected: true, reason: "merge-ready-candidate" },
  }));
  assert.equal(missing.status, "recovery-required");
  assert.equal(missing.action.kind, PARALLEL_SPRINT_RECOVERY_ACTIONS.PROMOTION_REBASE);

  const selected = planParallelSprintIntegration(input({ promotion: promotion(BASELINE) }));
  assert.equal(selected.status, "recovery-required");
  assert.equal(selected.code, "PSI-PROMOTION-TARGET-MAIN-INVALID");
});

check("binds promotion rebase to only the selected first merge-ready candidate and exact main", () => {
  const receipt = planParallelSprintIntegration(input({
    advance: { kind: "ordinary", baseline: { ...ADVANCED }, writeSet: ["docs/changelog.md"], surfaces: [] },
    promotion: promotion(),
  }));
  assert.equal(receipt.disposition, PARALLEL_SPRINT_DISPOSITIONS.REBASE_REQUIRED_FOR_PROMOTION);
  assert.equal(receipt.action.kind, PARALLEL_SPRINT_RECOVERY_ACTIONS.PROMOTION_REBASE);
  assert.equal(receipt.action.selectedCandidate.sprintId, "sprint-nova");
  assert.deepEqual(receipt.action.targetMain, ADVANCED);
  assert.equal(receipt.action.automaticGit, false);
  assert.equal(receipt.action.requiresConfirmation, true);
  assert.match(receipt.action.actionSha256, /^[a-f0-9]{64}$/u);
});

check("rejects target-main drift after a candidate was selected", () => {
  const otherMain = { ...ADVANCED, commit: "e".repeat(40), tree: "f".repeat(40) };
  const receipt = planParallelSprintIntegration(input({
    advance: { kind: "ordinary", baseline: { ...ADVANCED }, writeSet: ["docs/changelog.md"], surfaces: [] },
    promotion: promotion(otherMain),
  }));
  assert.equal(receipt.status, "recovery-required");
  assert.equal(receipt.code, "PSI-PROMOTION-TARGET-MAIN-DRIFT");
  assert.equal(receipt.action.kind, PARALLEL_SPRINT_RECOVERY_ACTIONS.PROMOTION_REBASE);
});

check("rejects mixed repository object formats and unexpected review receipts", () => {
  const mixed = planParallelSprintIntegration(input({
    advance: {
      kind: "ordinary",
      baseline: { ...ADVANCED, commit: "c".repeat(64), tree: "d".repeat(64) },
      writeSet: ["docs/changelog.md"],
      surfaces: [],
    },
  }));
  assert.equal(mixed.code, "PSI-ADVANCE-OBJECT-FORMAT-MISMATCH");
  assert.equal(mixed.action.kind, PARALLEL_SPRINT_RECOVERY_ACTIONS.BASELINE_REPAIR);

  const strayReview = planParallelSprintIntegration(input({
    impactReview: {
      schema: PARALLEL_SPRINT_IMPACT_REVIEW_SCHEMA,
      baseline: { ...BASELINE },
      observedBaseline: { ...ADVANCED },
      changedSurfaces: [],
      writeSetComparison: { candidateWriteSet: [], advanceWriteSet: [], overlap: false },
      decision: "compatible",
      poExceptionSha256: null,
      confirmed: true,
      receiptSha256: "9".repeat(64),
    },
  }));
  assert.equal(strayReview.code, "PSI-IMPACT-RECEIPT-UNEXPECTED");
  assert.equal(strayReview.action.kind, PARALLEL_SPRINT_RECOVERY_ACTIONS.IMPACT_REVIEW_RECEIPT);
});

check("makes every fail-closed family repairable and confirmed", () => {
  const cases = [
    planParallelSprintIntegration(null),
    planParallelSprintIntegration(input({ baseline: null })),
    planParallelSprintIntegration(input({ candidateWriteSet: [] })),
    planParallelSprintIntegration(input({
      advance: { kind: "ordinary", baseline: { ...ADVANCED }, writeSet: ["docs/a.md"], surfaces: ["unknown"] },
    })),
  ];
  assert.deepEqual(cases.map((entry) => entry.action.kind), [
    PARALLEL_SPRINT_RECOVERY_ACTIONS.BASELINE_REPAIR,
    PARALLEL_SPRINT_RECOVERY_ACTIONS.BASELINE_REPAIR,
    PARALLEL_SPRINT_RECOVERY_ACTIONS.WRITE_SET_REPAIR,
    PARALLEL_SPRINT_RECOVERY_ACTIONS.IMPACT_REVIEW_RECEIPT,
  ]);
  for (const entry of cases) {
    assert.equal(entry.action.requiresConfirmation, true);
    assert.equal(entry.action.automaticGit, false);
    assert.equal(entry.action.expectedInputSha256, entry.requestSha256);
  }
});

check("idempotently resumes only the same pending digest-bound action", () => {
  const changed = { kind: "ordinary", baseline: { ...ADVANCED }, writeSet: ["docs/a.md"], surfaces: ["guard"] };
  const first = planParallelSprintIntegration(input({ advance: changed }));
  const interrupted = {
    status: "pending",
    requestSha256: first.requestSha256,
    actionKind: first.action.kind,
    actionSha256: first.action.actionSha256,
  };
  const resumed = planParallelSprintIntegration(input({ advance: changed, interrupted }));
  assert.equal(resumed.status, "resumed");
  assert.equal(resumed.code, "PSI-INTERRUPTED-IDEMPOTENT-RESUME");
  assert.equal(resumed.action.actionSha256, first.action.actionSha256);
  assert.deepEqual(planParallelSprintIntegration(input({ advance: changed, interrupted })), resumed);
});

check("fails closed on interrupted drift, replay and conflicting action identity", () => {
  const changed = { kind: "ordinary", baseline: { ...ADVANCED }, writeSet: ["docs/a.md"], surfaces: ["guard"] };
  const first = planParallelSprintIntegration(input({ advance: changed }));
  const binding = {
    requestSha256: first.requestSha256,
    actionKind: first.action.kind,
    actionSha256: first.action.actionSha256,
  };
  const drift = planParallelSprintIntegration(input({
    advance: { ...changed, writeSet: ["docs/b.md"] },
    interrupted: { status: "pending", ...binding },
  }));
  assert.equal(drift.action.kind, PARALLEL_SPRINT_RECOVERY_ACTIONS.RESUME_INTERRUPTED);
  assert.equal(drift.code, "PSI-INTERRUPTED-BINDING-DRIFT");

  const replay = planParallelSprintIntegration(input({ advance: changed, interrupted: { status: "completed", ...binding } }));
  assert.equal(replay.code, "PSI-INTERRUPTED-COMPLETED-REOBSERVE");
  assert.equal(replay.action.kind, PARALLEL_SPRINT_RECOVERY_ACTIONS.RESUME_INTERRUPTED);
});

check("requires a selected candidate after confirmed material incompatibility", () => {
  const changed = { kind: "ordinary", baseline: { ...ADVANCED }, writeSet: ["docs/a.md"], surfaces: ["compatibility"] };
  const plan = planParallelSprintIntegration(input({ advance: changed }));
  const review = impactReviewFor(plan, "material-incompatibility");
  const blocked = planParallelSprintIntegration(input({ advance: changed, impactReview: review }));
  assert.equal(blocked.status, "recovery-required");
  assert.equal(blocked.code, "PSI-MATERIAL-INCOMPATIBILITY-SELECTION-REQUIRED");
  assert.equal(blocked.action.kind, PARALLEL_SPRINT_RECOVERY_ACTIONS.PROMOTION_REBASE);
});

check("does not promote across a confirmed defer decision", () => {
  const changed = { kind: "ordinary", baseline: { ...ADVANCED }, writeSet: ["docs/a.md"], surfaces: ["release"] };
  const plan = planParallelSprintIntegration(input({ advance: changed }));
  const review = impactReviewFor(plan, "defer");
  const blocked = planParallelSprintIntegration(input({ advance: changed, impactReview: review, promotion: promotion() }));
  assert.equal(blocked.status, "recovery-required");
  assert.equal(blocked.code, "PSI-PROMOTION-CONFLICTS-CONFIRMED-DEFER");
  assert.equal(blocked.action.kind, PARALLEL_SPRINT_RECOVERY_ACTIONS.IMPACT_REVIEW_RECEIPT);
});

// --- EPIC-AC-02: unpublished sibling-Sprint consumption gate ----------------

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const NOVA_COMMIT = "9".repeat(40);
const NOVA_TIP = "7".repeat(40);

function featurePackage(overrides = {}) {
  return {
    schema: "pipeline.feature-package.v1",
    feature: { id: "sprint-phoenix-epic", rigor: 2 },
    state: "verifying",
    artifacts: [],
    candidate: { commit: "e".repeat(40), tree: "f".repeat(40) },
    supersedes: null,
    ...overrides,
  };
}

function ancestryProbe(tipCommit, exitCode) {
  return { probe: "merge-base--is-ancestor", tipCommit, exitCode };
}

function consumption(overrides = {}) {
  return {
    epic: "nova",
    commit: NOVA_COMMIT,
    source: "candidate-commit-ancestry",
    publishedTip: { ref: "v0.4.7", commit: NOVA_TIP, publicationStatus: "published" },
    reachability: ancestryProbe(NOVA_TIP, 0),
    ...overrides,
  };
}

function gateInput(overrides = {}) {
  return {
    schema: PARALLEL_SPRINT_PUBLICATION_GATE_INPUT_SCHEMA,
    package: featurePackage(),
    siblingProvenance: { probe: "branch-contains", epics: ["nova"] },
    consumptions: [consumption()],
    ...overrides,
  };
}

check("permits a package that binds no candidate commit at all", () => {
  const receipt = checkUnpublishedSiblingSprintConsumption(gateInput({
    package: featurePackage({ state: "draft", candidate: null }),
    siblingProvenance: "unobserved",
    consumptions: [],
  }));
  assert.equal(receipt.schema, PARALLEL_SPRINT_PUBLICATION_GATE_RECEIPT_SCHEMA);
  assert.equal(receipt.status, "verification-permitted");
  assert.equal(receipt.code, "PSI-PUB-NO-BOUND-COMMIT");
  assert.deepEqual(receipt.findings, []);
});

check("permits a Nova commit proven reachable from Nova's published tip", () => {
  const receipt = checkUnpublishedSiblingSprintConsumption(gateInput());
  assert.equal(receipt.status, "verification-permitted");
  assert.equal(receipt.code, "PSI-PUB-SIBLING-CONSUMPTION-PUBLISHED");
  assert.deepEqual(receipt.publishedConsumptions, [{ epic: "nova", commit: NOVA_COMMIT }]);
  assert.deepEqual(receipt.findings, []);
});

check("fails verification when the consumed Nova commit is unpublished", () => {
  const receipt = checkUnpublishedSiblingSprintConsumption(gateInput({
    consumptions: [consumption({ reachability: ancestryProbe(NOVA_TIP, 1) })],
  }));
  assert.equal(receipt.status, "verification-failed");
  assert.equal(receipt.code, "PSI-PUB-CONSUMES-UNPUBLISHED-COMMIT");
  assert.deepEqual(receipt.publishedConsumptions, []);
  assert.deepEqual(receipt.findings, [{
    code: "PSI-PUB-CONSUMES-UNPUBLISHED-COMMIT",
    epic: "nova",
    commit: NOVA_COMMIT,
  }]);
});

check("fails verification when sibling-Epic provenance was never observed", () => {
  const receipt = checkUnpublishedSiblingSprintConsumption(gateInput({
    siblingProvenance: "unobserved",
    consumptions: [],
  }));
  assert.equal(receipt.status, "verification-failed");
  assert.equal(receipt.code, "PSI-PUB-PROVENANCE-UNOBSERVED");
});

check("fails verification when the Cyborg tip is itself unpublished", () => {
  const receipt = checkUnpublishedSiblingSprintConsumption(gateInput({
    siblingProvenance: { probe: "branch-contains", epics: ["cyborg"] },
    consumptions: [consumption({
      epic: "cyborg",
      publishedTip: { ref: "sprint_cyborg", commit: NOVA_TIP, publicationStatus: "unpublished" },
    })],
  }));
  assert.equal(receipt.status, "verification-failed");
  assert.equal(receipt.code, "PSI-PUB-SIBLING-TIP-UNPUBLISHED");
});

check("fails verification when Nightwing reachability was never probed", () => {
  const receipt = checkUnpublishedSiblingSprintConsumption(gateInput({
    siblingProvenance: { probe: "branch-contains", epics: ["nightwing"] },
    consumptions: [consumption({ epic: "nightwing", reachability: "unobserved" })],
  }));
  assert.equal(receipt.status, "verification-failed");
  assert.equal(receipt.code, "PSI-PUB-REACHABILITY-UNOBSERVED");
});

check("refuses a consumption claim that no bound candidate commit could carry", () => {
  const receipt = checkUnpublishedSiblingSprintConsumption(gateInput({
    package: featurePackage({ candidate: null }),
  }));
  assert.equal(receipt.status, "verification-failed");
  assert.equal(receipt.code, "PSI-PUB-CONSUMPTION-WITHOUT-BOUND-COMMIT");
});

check("refuses an unattributed Epic, a drifted tip probe, and an unusable input", () => {
  const unattributed = checkUnpublishedSiblingSprintConsumption(gateInput({
    siblingProvenance: { probe: "branch-contains", epics: [] },
  }));
  assert.equal(unattributed.code, "PSI-PUB-CONSUMPTION-UNATTRIBUTED");
  const drifted = checkUnpublishedSiblingSprintConsumption(gateInput({
    consumptions: [consumption({ reachability: ancestryProbe("6".repeat(40), 0) })],
  }));
  assert.equal(drifted.code, "PSI-PUB-REACHABILITY-TIP-DRIFT");
  const unknownEpic = checkUnpublishedSiblingSprintConsumption(gateInput({
    consumptions: [{ ...consumption(), epic: "sentinel" }],
  }));
  assert.equal(unknownEpic.code, "PSI-PUB-CONSUMPTION-INVALID");
  assert.equal(checkUnpublishedSiblingSprintConsumption({ schema: "other" }).code, "PSI-PUB-INPUT-SCHEMA");
  assert.equal(checkUnpublishedSiblingSprintConsumption(gateInput({
    package: { ...featurePackage(), schema: "pipeline.feature-package.v0" },
  })).code, "PSI-PUB-PACKAGE-MANIFEST-INVALID");
  for (const receipt of [unattributed, drifted, unknownEpic]) assert.equal(receipt.status, "verification-failed");
});

check("seals every gate receipt against its own body", () => {
  const receipt = checkUnpublishedSiblingSprintConsumption(gateInput());
  const { receiptSha256, ...body } = receipt;
  assert.equal(receiptSha256, digestParallelSprintValue(body));
  const other = checkUnpublishedSiblingSprintConsumption(gateInput({
    consumptions: [consumption({ reachability: ancestryProbe(NOVA_TIP, 1) })],
  }));
  assert.notEqual(other.requestSha256, receipt.requestSha256);
});

check("admits every feature package this repository holds today", () => {
  const specs = join(REPO_ROOT, "specs");
  if (!existsSync(specs)) return;
  let seen = 0;
  for (const entry of readdirSync(specs, { withFileTypes: true })) {
    const manifestPath = join(specs, entry.name, "lifecycle.json");
    if (!entry.isDirectory() || !existsSync(manifestPath)) continue;
    seen += 1;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const receipt = checkUnpublishedSiblingSprintConsumption({
      schema: PARALLEL_SPRINT_PUBLICATION_GATE_INPUT_SCHEMA,
      package: manifest,
      siblingProvenance: "unobserved",
      consumptions: [],
    });
    if (manifest.candidate === null) {
      // No bound commit exists, so nothing can be consumed: no Git needed.
      assert.equal(receipt.status, "verification-permitted", `${entry.name}: ${receipt.code}`);
      assert.equal(receipt.code, "PSI-PUB-NO-BOUND-COMMIT");
    } else {
      // A bound commit without an observation never passes by default.
      assert.equal(receipt.status, "verification-failed", `${entry.name}: ${receipt.code}`);
      assert.equal(receipt.code, "PSI-PUB-PROVENANCE-UNOBSERVED");
    }
    assert.equal(receipt.packageId, manifest.feature.id);
  }
  assert.ok(seen > 0, "no feature package manifests were found");
});

check("decides both directions from real git merge-base exit codes", () => {
  let head; let parent;
  try {
    const git = (args) => execFileSync("git", ["-C", REPO_ROOT, ...args], { encoding: "utf8" }).trim();
    head = git(["rev-parse", "HEAD"]);
    parent = git(["rev-parse", "HEAD~1"]);
  } catch {
    return; // No Git or no history here: the constructed probes above still bind the contract.
  }
  const probe = (commit, tipCommit) => {
    try {
      execFileSync("git", ["-C", REPO_ROOT, "merge-base", "--is-ancestor", commit, tipCommit], { stdio: "ignore" });
      return 0;
    } catch (error) {
      return typeof error.status === "number" ? error.status : 128;
    }
  };
  const observed = (commit, tipCommit) => checkUnpublishedSiblingSprintConsumption(gateInput({
    package: featurePackage({ candidate: { commit: head, tree: head } }),
    consumptions: [consumption({
      commit,
      publishedTip: { ref: "main", commit: tipCommit, publicationStatus: "published" },
      reachability: ancestryProbe(tipCommit, probe(commit, tipCommit)),
    })],
  }));
  assert.equal(probe(parent, head), 0);
  assert.equal(observed(parent, head).status, "verification-permitted");
  assert.equal(probe(head, parent), 1);
  const refused = observed(head, parent);
  assert.equal(refused.status, "verification-failed");
  assert.equal(refused.code, "PSI-PUB-CONSUMES-UNPUBLISHED-COMMIT");
});

process.stdout.write(`${passed}/25 checks passed.\n`);
