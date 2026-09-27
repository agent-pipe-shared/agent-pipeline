#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  advisorySessionRoleSelectionSha256,
  advisoryEvidenceBundleSha256,
  advisoryConsultationDisposition,
  buildAdvisoryEvidenceBundle,
  createAdvisoryConsultationRecord,
  createAdvisoryDemand,
  loadAdvisoryLifecycleV2Policy,
  preflightAdvisoryCapability,
  renderAdvisoryEvidencePrompt,
  validateAdvisoryDemand,
  validateAdvisoryEvidenceBundle,
  validateAdvisoryEvidenceBundleForRepository,
  validateAdvisoryLifecycleV2Policy,
} from "./advisory-lifecycle-v2.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const dispatch = {
  dispatchId: "issue-80",
  queueRevision: 4,
  candidateCommit: "a".repeat(40),
  candidateTree: "b".repeat(40),
};

test("published lifecycle policy is closed and versioned without changing V3 route authority", () => {
  const policy = loadAdvisoryLifecycleV2Policy();
  assert.equal(validateAdvisoryLifecycleV2Policy(policy).ok, true);
  assert.equal(policy.routeAuthority, "pipeline.runner-profiles.v3");
  assert.equal(policy.bootstrap.mode, "capability-preflight-only");
  assert.equal(policy.consultation.mode, "on-demand");
});

test("bootstrap capability observation is immediate model-free evidence for both runners", () => {
  for (const runner of ["claude", "codex"]) {
    const result = preflightAdvisoryCapability({ runner, profile: "epic", consent: "approved" });
    assert.equal(result.ok, true);
    assert.equal(result.evidence.state, "unknown");
    assert.equal(result.evidence.assurance, "model-free-configured-route; model availability and identity not probed");
    assert.deepEqual(result.evidence.effects, {
      childLaunches: 0,
      modelRequests: 0,
      questionExports: 0,
      receipts: 0,
      consultationBudgetMs: 0,
    });
    assert.notEqual(result.evidence.disposition.primary, null);
  }
});

test("disabled states precede route use and observed capability maps to bounded states", () => {
  for (const input of [
    { runner: "codex", profile: "mini", consent: "approved" },
    { runner: "claude", profile: "feature", consent: "declined" },
  ]) {
    const result = preflightAdvisoryCapability(input);
    assert.equal(result.evidence.state, "disabled");
    assert.deepEqual(result.evidence.disposition, { primary: null, fallbacks: [] });
  }
  assert.equal(preflightAdvisoryCapability({
    runner: "codex", profile: "epic", consent: "approved",
    observed: { primary: "unavailable", fallbacks: [] },
  }).evidence.state, "unavailable");
  assert.equal(preflightAdvisoryCapability({
    runner: "codex", profile: "epic", consent: "approved",
    observed: { primary: "unavailable", fallbacks: ["available"] },
  }).code, "invalid_capability_observation");
});

test("only a concrete trigger, one question and exact candidate/evidence bindings create demand", () => {
  const good = createAdvisoryDemand({
    runner: "codex",
    profile: "feature",
    reason: "risk-review",
    question: "Which boundary reduces this concrete risk?",
    evidenceSha256: sha256("bounded evidence"),
    dispatch,
  });
  assert.equal(good.ok, true);
  assert.equal(Object.hasOwn(good.demand, "question"), false);
  assert.equal(validateAdvisoryDemand(good.demand, {
    runner: "codex",
    profile: "feature",
    question: "Which boundary reduces this concrete risk?",
    dispatch,
  }).ok, true);
  for (const reason of ["session-start", "resume", "compact", "consent-present", "configured-route"]) {
    assert.equal(createAdvisoryDemand({
      runner: "codex", profile: "feature", reason, question: "Should bootstrap consult?",
      evidenceSha256: sha256("same"), dispatch,
    }).ok, false);
  }
});

test("Claude session-selected Advisor fallback is bound in v3 demand and material reuse", () => {
  const selectionBase = {
    runner: "claude", taskRoute: "duty.advisory.fallback", role: "frontier",
    effort: "max", modelId: "claude-frontier-reviewed", sessionId: "claude-session-01",
    readbackSha256: "1".repeat(64), receiptSha256: "2".repeat(64),
  };
  const selection = { ...selectionBase,
    selectionSha256: advisorySessionRoleSelectionSha256(selectionBase) };
  const input = {
    runner: "claude", profile: "feature", reason: "risk-review",
    question: "Which session-admitted fallback is valid?",
    evidenceSha256: sha256("bounded advisor evidence"), dispatch,
    sessionRoleSelection: selection,
  };
  const created = createAdvisoryDemand(input);
  assert.equal(created.ok, true);
  assert.equal(created.demand.schema, "pipeline.advisory-demand.v3");
  assert.equal(Object.hasOwn(created.demand.sessionRoleBinding, "sessionId"), false);
  assert.equal(created.demand.sessionRoleBinding.modelId, selection.modelId);
  assert.equal(created.demand.sessionRoleBinding.selectionSha256, selection.selectionSha256);
  assert.equal(validateAdvisoryDemand(created.demand, input).ok, true);

  const record = createAdvisoryConsultationRecord({ demand: created.demand,
    outcome: "answered", receipt: { sanitized: true }, completedAtMs: 10 }).record;
  assert.equal(advisoryConsultationDisposition(created.demand, record).disposition, "reuse-no-repeat");
  const nextSelectionBase = { ...selectionBase, modelId: "claude-frontier-next",
    sessionId: "claude-session-02", receiptSha256: "3".repeat(64) };
  const nextSelection = { ...nextSelectionBase,
    selectionSha256: advisorySessionRoleSelectionSha256(nextSelectionBase) };
  const changed = createAdvisoryDemand({ ...input, sessionRoleSelection: nextSelection }).demand;
  assert.equal(advisoryConsultationDisposition(changed, record).disposition, "consult-material-drift");

  const tampered = structuredClone(created.demand);
  tampered.sessionRoleBinding.modelId = "attacker-selected-model";
  assert.equal(validateAdvisoryDemand(tampered, input).code, "advisory_demand_binding_mismatch");
  assert.equal(createAdvisoryDemand({ ...input, sessionRoleSelection: {
    ...selection, effort: "medium",
  } }).ok, false);
});

test("allowlisted evidence is content-bound, bounded and rendered into the model input", () => {
  const content = "closed evidence\n";
  const bundle = {
    schema: "pipeline.advisory-evidence-bundle.v1",
    references: [{
      path: "evidence/review.md",
      sha256: sha256(content),
      bytes: Buffer.byteLength(content),
      content,
    }],
  };
  const bundleSha256 = advisoryEvidenceBundleSha256(bundle);
  assert.equal(validateAdvisoryEvidenceBundle(bundle, bundleSha256).ok, true);
  const prompt = renderAdvisoryEvidencePrompt("Which boundary is safe?", bundle, bundleSha256);
  assert.match(prompt, /Which boundary is safe\?/u);
  assert.match(prompt, /closed evidence/u);
  assert.match(prompt, new RegExp(bundleSha256, "u"));
  const tampered = structuredClone(bundle);
  tampered.references[0].content = "different evidence\n";
  assert.equal(validateAdvisoryEvidenceBundle(tampered, bundleSha256).ok, false);
  assert.throws(
    () => buildAdvisoryEvidenceBundle(process.cwd(), [
      "plugins/pipeline-core/scripts/advisory-host-bridge.mjs",
      "plugins/pipeline-core/scripts/advisory-host-bridge.mjs",
    ]),
    /references are invalid/u,
  );
});

test("physical evidence requires caller order and is re-read against the exact repository bytes", () => {
  const root = mkdtempSync(join(tmpdir(), "advisory-evidence-"));
  try {
    mkdirSync(join(root, "evidence"));
    writeFileSync(join(root, "evidence", "a.md"), "alpha\n");
    writeFileSync(join(root, "evidence", "b.md"), "bravo\n");
    assert.throws(
      () => buildAdvisoryEvidenceBundle(root, ["evidence/b.md", "evidence/a.md"]),
      /references are invalid/u,
    );
    const bundle = buildAdvisoryEvidenceBundle(root, ["evidence/a.md", "evidence/b.md"]);
    const bundleSha256 = advisoryEvidenceBundleSha256(bundle);
    assert.equal(validateAdvisoryEvidenceBundleForRepository(root, bundle, bundleSha256).ok, true);
    writeFileSync(join(root, "evidence", "a.md"), "changed\n");
    assert.equal(
      validateAdvisoryEvidenceBundleForRepository(root, bundle, bundleSha256).code,
      "advisory_evidence_physical_drift",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("same material demand is not repeated and any bound material drift permits a new consult", () => {
  const first = createAdvisoryDemand({
    runner: "claude", profile: "epic", reason: "architecture-tradeoff",
    question: "A or B?", evidenceSha256: sha256("evidence-v1"), dispatch,
  }).demand;
  const record = createAdvisoryConsultationRecord({
    demand: first, outcome: "answered", receipt: { sanitized: true }, completedAtMs: 1,
  }).record;
  assert.equal(advisoryConsultationDisposition(first, record).disposition, "reuse-no-repeat");
  const changed = createAdvisoryDemand({
    runner: "claude", profile: "epic", reason: "architecture-tradeoff",
    question: "A or B?", evidenceSha256: sha256("evidence-v2"), dispatch,
  }).demand;
  assert.equal(advisoryConsultationDisposition(changed, record).disposition, "consult-material-drift");
  const forgedDemand = structuredClone(first);
  forgedDemand.reuseKeySha256 = "f".repeat(64);
  assert.equal(advisoryConsultationDisposition(forgedDemand, record).code, "invalid_advisory_demand");
  assert.equal(createAdvisoryConsultationRecord({
    demand: forgedDemand, outcome: "answered", receipt: null, completedAtMs: 2,
  }).code, "invalid_consultation_record_input");
  const forgedRecord = { ...record, demandSha256: "f".repeat(64) };
  assert.equal(advisoryConsultationDisposition(first, forgedRecord).code, "prior_consultation_binding_mismatch");
});

test("policy drift and question drift invalidate a demand before any route can run", () => {
  const question = "What is the smallest safe recovery?";
  const created = createAdvisoryDemand({
    runner: "claude", profile: "feature", reason: "recovery-choice",
    question, evidenceSha256: sha256("recovery evidence"), dispatch,
  }).demand;
  assert.equal(validateAdvisoryDemand(created, {
    runner: "claude", profile: "feature", question: `${question} changed`, dispatch,
  }).code, "advisory_demand_binding_mismatch");
  const changedPolicy = loadAdvisoryLifecycleV2Policy();
  changedPolicy.consultation.triggerReasons = [...changedPolicy.consultation.triggerReasons].reverse();
  assert.equal(validateAdvisoryDemand(created, {
    runner: "claude", profile: "feature", question, dispatch, policy: changedPolicy,
  }).code, "advisory_demand_binding_mismatch");
});
