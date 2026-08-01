#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, test } from "node:test";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "./pipeline-state.mjs";

const roots = [];
const NOW = "2026-07-31T12:00:00.000Z";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const h = (c) => c.repeat(64);
const canonical = (value) => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
afterEach(() => { while (roots.length) rmSync(roots.pop(), { recursive: true, force: true }); });

function state(overrides = {}) {
  return {
    schema: "pipeline.state.v0",
    activeFeature: { id: "feature", planPath: "specs/feature/prd_feature.md", phase: "implementation" },
    planApproved: true,
    continuity: {
      schema: "pipeline.continuity.v0", featureId: "feature", revision: 7,
      runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator", sessionCleanup: null },
      authority: { prd: { path: "specs/feature/prd_feature.md", sha256: h("1") }, spec: { path: "specs/feature/spec.md", sha256: h("2") }, result: null },
      queueHead: { packageId: "pkg", actionId: "review", nextAction: "review", productRetryCount: 0, environmentRerouteCount: 0, dispatch: null },
      blocker: null, acknowledgedFinal: null, resume: { mode: "immediate", sourceRevision: 7, reasonCode: "active-turn" }, recovery: null, decisionTxn: null, closeTransition: null,
      capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" },
      ...overrides,
    }, updatedAt: "2026-07-31T11:00:00.000Z",
  };
}

function fixture(name = "case") {
  const root = mkdtempSync(join(tmpdir(), `pipeline-result-bootstrap-${name}-`)); roots.push(root);
  mkdirSync(join(root, ".claude")); mkdirSync(join(root, "specs", "feature"), { recursive: true });
  writeFileSync(join(root, "specs/feature/prd_feature.md"), "prd\n"); writeFileSync(join(root, "specs/feature/spec.md"), "spec\n");
  const historical = Buffer.from("# Feature result\n\nExisting canonical Markdown must survive intact.\n", "utf8");
  writeFileSync(join(root, "specs/feature/result.md"), historical);
  const commonDir = join(root, ".git-common"); mkdirSync(commonDir, { mode: 0o700 });
  const value = state();
  value.continuity.authority.prd.sha256 = hash(readFileSync(join(root, "specs/feature/prd_feature.md")));
  value.continuity.authority.spec.sha256 = hash(readFileSync(join(root, "specs/feature/spec.md")));
  const authority = { schema: "pipeline.po-gate-authority.v2", humanFacing: "en", sourceSha256: h("1"), runtimeSha256: h("2"), receiptSha256: h("3"), repositoryFingerprint: h("4"), planPath: value.continuity.authority.prd.path, planSha256: value.continuity.authority.prd.sha256, specPath: value.continuity.authority.spec.path, specSha256: value.continuity.authority.spec.sha256 };
  const submission = { schema: "pipeline.plan-submission.v1", featureId: "feature", planPath: authority.planPath, planSha256: authority.planSha256, specPath: authority.specPath, specSha256: authority.specSha256, profile: "feature", profileSha256: h("5"), submittedBy: "Coordinator", submittedAt: "2026-07-31T10:00:00.000Z" };
  value.planSubmission = submission;
  value.planApproval = { schema: "pipeline.plan-approval.v4", approvedBy: "PO", approvedAt: "2026-07-31T10:05:00.000Z", submissionSha256: hash(canonical(submission)), profileSha256: submission.profileSha256, poGateAuthority: authority, priorInvalidationSha256: null };
  const statePath = join(root, ".claude", "pipeline-state.json"); writeFileSync(statePath, JSON.stringify(value, null, 2) + "\n");
  return { root, statePath, value, historical, resultPath: join(root, "specs/feature/result.md"), commonDir, journalPath: join(commonDir, "agent-pipeline", "result-bootstrap", "journal") };
}

function invoke(root, argv, extra = {}) {
  const out = []; const err = []; const log = console.log; const error = console.error;
  console.log = (...v) => out.push(v.join(" ")); console.error = (...v) => err.push(v.join(" "));
  try { return { status: run(argv, { dir: root, now: () => NOW, gitCommonDir: () => ({ ok: true, path: join(root, ".git-common") }), ...extra }), out: out.join("\n"), err: err.join("\n") }; }
  finally { console.log = log; console.error = error; }
}

function plan(f) {
  const before = readFileSync(f.statePath); const value = invoke(f.root, ["continuity-result-bootstrap-plan"]);
  assert.equal(value.status, 0, value.err); assert.deepEqual(readFileSync(f.statePath), before); return JSON.parse(value.out);
}

test("AC-047-143--146: readonly plan binds existing lowercase canonical Result prefix and strict appended fence", () => {
  const f = fixture("success"); const p = plan(f);
  const fence = Buffer.from("```pipeline-result\n{\"courseDecisionIntents\":[],\"courseDecisionReceipts\":[],\"decisionBriefs\":[],\"finalIntegrations\":[]}\n```\n");
  assert.equal(p.schema, "pipeline.continuity-result-bootstrap-plan.v1"); assert.equal(p.preimage.result.path, "specs/feature/result.md"); assert.equal(p.preimage.result.sha256, hash(f.historical));
  assert.deepEqual(Buffer.from(p.preimage.historicalMarkdown.bytesBase64, "base64"), f.historical); assert.deepEqual(Buffer.from(p.append.bytesBase64, "base64"), fence);
  assert.deepEqual(Buffer.from(p.result.bytesBase64, "base64"), Buffer.concat([f.historical, fence])); assert.equal(existsSync(f.journalPath), false);
  assert.equal(p.applyAction.mutation, true); assert.equal(p.applyAction.requiresConfirmation, true); assert.equal(p.applyAction.argv.at(-1), "--activate");
  const applied = invoke(f.root, p.applyAction.argv.slice(1)); assert.equal(applied.status, 0, applied.err);
  assert.deepEqual(JSON.parse(applied.out).completion, {
    scope: "feature-closure", state: "in-progress", nextAction: "review", workflowTerminal: false,
  });
  const after = JSON.parse(readFileSync(f.statePath)); const expected = structuredClone(f.value);
  expected.continuity.revision = 8; expected.continuity.resume.sourceRevision = 8; expected.continuity.authority.result = { path: "specs/feature/result.md", sha256: p.result.sha256 }; expected.updatedAt = NOW;
  assert.deepEqual(after, expected); assert.deepEqual(readFileSync(f.resultPath), Buffer.from(p.result.bytesBase64, "base64")); assert.deepEqual(readFileSync(f.resultPath).subarray(0, f.historical.length), f.historical);
  assert.equal(existsSync(join(f.root, "specs/feature/Result.md")), false);
  assert.equal(existsSync(join(f.root, ".claude", ".pipeline-result-bootstrap-private")), false); assert.equal(existsSync(f.journalPath), false);
});

test("AC-047-147: journal and Result-before-State interruptions resume once and exact replay is zero-mutation", () => {
  const beforeResult = fixture("journal-before-result"); const beforeResultPlan = plan(beforeResult);
  const stoppedBeforeResult = invoke(beforeResult.root, beforeResultPlan.applyAction.argv.slice(1), { afterResultBootstrapJournal: () => false });
  assert.equal(stoppedBeforeResult.status, 2); assert.deepEqual(readFileSync(beforeResult.resultPath), beforeResult.historical); assert.equal(existsSync(beforeResult.journalPath), true);
  assert.equal(invoke(beforeResult.root, beforeResultPlan.applyAction.argv.slice(1)).status, 0);
  const f = fixture("crash"); const p = plan(f);
  const stopped = invoke(f.root, p.applyAction.argv.slice(1), { afterResultBootstrapResult: () => false });
  assert.equal(stopped.status, 2); assert.equal(JSON.parse(readFileSync(f.statePath)).continuity.authority.result, null); assert.equal(existsSync(f.journalPath), true);
  assert.equal(invoke(f.root, p.applyAction.argv.slice(1)).status, 0);
  const bytes = readFileSync(f.statePath); const replay = invoke(f.root, p.applyAction.argv.slice(1));
  assert.equal(replay.status, 0, replay.err); assert.equal(JSON.parse(replay.out).status, "replayed"); assert.equal(JSON.parse(replay.out).mutated, false); assert.deepEqual(JSON.parse(replay.out).completion, { scope: "feature-closure", state: "in-progress", nextAction: "review", workflowTerminal: false }); assert.deepEqual(readFileSync(f.statePath), bytes);
  const afterState = fixture("state-before-retire"); const afterStatePlan = plan(afterState);
  const stoppedAfterState = invoke(afterState.root, afterStatePlan.applyAction.argv.slice(1), { afterResultBootstrapState: () => false });
  assert.equal(stoppedAfterState.status, 2); assert.equal(existsSync(afterState.journalPath), true);
  const recovered = invoke(afterState.root, afterStatePlan.applyAction.argv.slice(1)); assert.equal(recovered.status, 0, recovered.err); assert.equal(JSON.parse(recovered.out).status, "replayed"); assert.equal(JSON.parse(recovered.out).mutated, false); assert.equal(existsSync(afterState.journalPath), false);
});

test("AC-047-143/148: active work, nonnull authority, State/document drift, absent/fenced and unsafe Result targets fail closed", () => {
  for (const kind of ["nonnull", "dispatch", "blocker", "decision", "recovery", "close", "prd", "missing", "fence", "symlink", "hardlink"]) {
    const f = fixture(kind); const s = JSON.parse(readFileSync(f.statePath));
    if (kind === "nonnull") s.continuity.authority.result = { path: "specs/feature/result.md", sha256: h("f") };
    if (kind === "dispatch") s.continuity.queueHead.dispatch = { featureId: "feature", queueRevision: 7, packageId: "pkg", actionId: "review", dispatchId: "d", attemptId: "a", authorityDigests: { prdSha256: s.continuity.authority.prd.sha256, specSha256: s.continuity.authority.spec.sha256, resultSha256: null }, routeRequestSha256: h("a"), mayDelegate: false };
    if (kind === "blocker") { s.continuity.queueHead = null; s.continuity.blocker = { type: "scope", signature: "b", resumeCondition: { kind: "manual", evidenceSha256: null }, decisionBrief: null }; }
    if (kind === "decision") s.continuity.decisionTxn = {};
    if (kind === "recovery") s.continuity.recovery = {};
    if (kind === "close") s.continuity.closeTransition = {};
    if (kind === "prd") writeFileSync(join(f.root, "specs/feature/prd_feature.md"), "drift\n");
    if (kind === "missing") rmSync(f.resultPath);
    if (kind === "fence") writeFileSync(f.resultPath, Buffer.concat([f.historical, Buffer.from("```pipeline-result\n{}\n```\n")]));
    if (kind === "symlink") { rmSync(f.resultPath); symlinkSync("/tmp", f.resultPath); }
    if (kind === "hardlink") { rmSync(f.resultPath); writeFileSync(join(f.root, "specs/feature/foreign"), "x"); linkSync(join(f.root, "specs/feature/foreign"), f.resultPath); }
    if (!["prd", "missing", "fence", "symlink", "hardlink"].includes(kind)) writeFileSync(f.statePath, JSON.stringify(s, null, 2) + "\n");
    const before = readFileSync(f.statePath); assert.equal(invoke(f.root, ["continuity-result-bootstrap-plan"]).status, 2, kind); assert.deepEqual(readFileSync(f.statePath), before, kind);
  }
});

test("AC-047-149: bootstrap requires a current implementing Plan lifecycle before any Result or State mutation", () => {
  for (const kind of ["missing-approval", "stale-approval", "contradictory-approval", "prd-lifecycle-drift", "spec-lifecycle-drift"]) {
    const f = fixture(kind); const s = JSON.parse(readFileSync(f.statePath));
    if (kind === "missing-approval") delete s.planApproval;
    if (kind === "stale-approval") s.planApproval.submissionSha256 = h("f");
    if (kind === "contradictory-approval") s.planApproved = false;
    if (kind === "prd-lifecycle-drift") {
      writeFileSync(join(f.root, "specs/feature/prd_feature.md"), "prd lifecycle drift\n");
      s.continuity.authority.prd.sha256 = hash(readFileSync(join(f.root, "specs/feature/prd_feature.md")));
    }
    if (kind === "spec-lifecycle-drift") {
      writeFileSync(join(f.root, "specs/feature/spec.md"), "spec lifecycle drift\n");
      s.continuity.authority.spec.sha256 = hash(readFileSync(join(f.root, "specs/feature/spec.md")));
    }
    writeFileSync(f.statePath, JSON.stringify(s, null, 2) + "\n");
    const beforeState = readFileSync(f.statePath); const beforeResult = readFileSync(f.resultPath);
    const rejected = invoke(f.root, ["continuity-result-bootstrap-plan"]);
    assert.equal(rejected.status, 2, kind); assert.match(rejected.err, /zero mutation/, kind);
    assert.deepEqual(readFileSync(f.statePath), beforeState, kind); assert.deepEqual(readFileSync(f.resultPath), beforeResult, kind);
    assert.equal(existsSync(f.journalPath), false, kind);
  }
});
