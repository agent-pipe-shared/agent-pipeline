#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
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
    observed: { primary: "unavailable", fallbacks: ["available"] },
  }).evidence.state, "degraded");
  assert.equal(preflightAdvisoryCapability({
    runner: "codex", profile: "epic", consent: "approved",
    observed: { primary: "unavailable", fallbacks: ["unavailable"] },
  }).evidence.state, "unavailable");
  assert.equal(preflightAdvisoryCapability({
    runner: "codex", profile: "epic", consent: "approved",
    observed: { primary: "unavailable", fallbacks: ["available", "available"] },
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
