#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, test } from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "./pipeline-state.mjs";

const roots = [];
const NOW = "2026-07-31T14:00:00.000Z";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const h = (value) => value.repeat(64);
afterEach(() => { while (roots.length) rmSync(roots.pop(), { recursive: true, force: true }); });

function invoke(root, argv) {
  const out = []; const err = []; const log = console.log; const error = console.error;
  console.log = (...value) => out.push(value.join(" ")); console.error = (...value) => err.push(value.join(" "));
  try { return { status: run(argv, { dir: root, now: () => NOW }), out: out.join("\n"), err: err.join("\n") }; }
  finally { console.log = log; console.error = error; }
}

function fixture(name) {
  const root = mkdtempSync(join(tmpdir(), `pipeline-result-rebind-${name}-`)); roots.push(root);
  const feature = join(root, "specs", "feature"); mkdirSync(join(root, ".claude")); mkdirSync(feature, { recursive: true });
  const spec = Buffer.from("# Spec\n", "utf8"); const specSha256 = hash(spec);
  const prd = Buffer.from(`<!-- technical-spec-sha256: ${specSha256} -->\n# PRD\n`, "utf8"); const prdSha256 = hash(prd);
  const lower = Buffer.from("# lower canonical history\n", "utf8"); const upper = Buffer.from("# upper selected history\n", "utf8");
  writeFileSync(join(feature, "spec.md"), spec); writeFileSync(join(feature, "prd_feature.md"), prd);
  writeFileSync(join(feature, "result.md"), lower); writeFileSync(join(feature, "Result.md"), upper);
  const authority = { schema: "pipeline.po-gate-authority.v2", humanFacing: "en", sourceSha256: h("1"), runtimeSha256: h("2"), receiptSha256: h("3"), repositoryFingerprint: h("4"), planPath: "specs/feature/prd_feature.md", planSha256: prdSha256, specPath: "specs/feature/spec.md", specSha256 };
  const submission = { schema: "pipeline.plan-submission.v1", featureId: "feature", planPath: authority.planPath, planSha256: prdSha256, specPath: authority.specPath, specSha256, profile: "feature", profileSha256: h("5"), submittedBy: "Coordinator", submittedAt: "2026-07-31T13:00:00.000Z" };
  const submissionSha256 = hash(Buffer.from(JSON.stringify(Object.fromEntries(Object.entries(submission).sort(([a], [b]) => a.localeCompare(b))))));
  // The production implementation canonicalizes its own submission digest. The
  // literal here is replaced below by a plan-generated lifecycle-compatible digest.
  const approval = { schema: "pipeline.plan-approval.v4", approvedBy: "PO", approvedAt: "2026-07-31T13:05:00.000Z", submissionSha256: null, profileSha256: submission.profileSha256, poGateAuthority: authority, priorInvalidationSha256: null };
  const state = {
    schema: "pipeline.state.v0", activeFeature: { id: "feature", planPath: authority.planPath, phase: "implementation" }, planApproved: true, planSubmission: submission, planApproval: approval,
    continuity: { schema: "pipeline.continuity.v0", featureId: "feature", revision: 7, runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator", sessionCleanup: null }, authority: { prd: { path: authority.planPath, sha256: prdSha256 }, spec: { path: authority.specPath, sha256: specSha256 }, result: { path: "specs/feature/result.md", sha256: hash(lower) } }, queueHead: { packageId: "pkg", actionId: "review", nextAction: "review", productRetryCount: 0, environmentRerouteCount: 0, dispatch: null }, blocker: null, acknowledgedFinal: null, resume: { mode: "immediate", sourceRevision: 7, reasonCode: "active-turn" }, recovery: null, decisionTxn: null, closeTransition: null, capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" } }, updatedAt: "2026-07-31T13:10:00.000Z",
  };
  // SHA-256 canonical JSON uses lexical object keys; this fixture intentionally
  // has no nested insertion-order dependence.
  const canonical = (value) => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  approval.submissionSha256 = hash(canonical(submission));
  const statePath = join(root, ".claude", "pipeline-state.json"); writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
  return { root, statePath, state, lowerPath: join(feature, "result.md"), upperPath: join(feature, "Result.md"), lower, upper };
}

function plan(f) {
  const before = readFileSync(f.statePath); const result = invoke(f.root, ["continuity-result-rebind-plan", "--result-path", "specs/feature/Result.md"]);
  assert.equal(result.status, 0, result.err); assert.deepEqual(readFileSync(f.statePath), before); return JSON.parse(result.out);
}

test("AC-047-151/152: explicit collision plan and apply rebind only State authority while preserving both Result bytes", () => {
  const f = fixture("apply"); const p = plan(f);
  assert.equal(p.schema, "pipeline.continuity-result-rebind-plan.v1"); assert.equal(p.selectedAuthorityTarget.path, "specs/feature/Result.md");
  assert.deepEqual(p.preimage.resultCandidates.map((entry) => entry.path), ["specs/feature/Result.md", "specs/feature/result.md"]);
  assert.ok(p.authorityClosure.every((entry) => entry.status === "validated-immutable" || entry.status === "not-present"));
  const applied = invoke(f.root, p.applyAction.argv.slice(1)); assert.equal(applied.status, 0, applied.err); assert.equal(JSON.parse(applied.out).status, "applied");
  const expected = structuredClone(f.state); expected.continuity.revision = 8; expected.continuity.resume.sourceRevision = 8; expected.continuity.authority.result = { path: "specs/feature/Result.md", sha256: hash(f.upper) }; expected.updatedAt = NOW;
  assert.deepEqual(JSON.parse(readFileSync(f.statePath)), expected); assert.deepEqual(readFileSync(f.lowerPath), f.lower); assert.deepEqual(readFileSync(f.upperPath), f.upper);
  const stateBytes = readFileSync(f.statePath); const replay = invoke(f.root, p.applyAction.argv.slice(1)); assert.equal(replay.status, 0, replay.err); assert.equal(JSON.parse(replay.out).status, "replayed"); assert.equal(JSON.parse(replay.out).mutated, false); assert.deepEqual(readFileSync(f.statePath), stateBytes);
});

test("AC-047-153: stale State or either Result candidate drift rejects with no false success", () => {
  const staleState = fixture("stale-state"); const stalePlan = plan(staleState); const changed = JSON.parse(readFileSync(staleState.statePath)); changed.updatedAt = "2026-07-31T13:11:00.000Z"; writeFileSync(staleState.statePath, JSON.stringify(changed, null, 2) + "\n");
  const stateBefore = readFileSync(staleState.statePath); const stateResult = invoke(staleState.root, stalePlan.applyAction.argv.slice(1)); assert.equal(stateResult.status, 2); assert.doesNotMatch(stateResult.out, /"status":"(?:applied|replayed)"/); assert.deepEqual(readFileSync(staleState.statePath), stateBefore); assert.deepEqual(readFileSync(staleState.lowerPath), staleState.lower); assert.deepEqual(readFileSync(staleState.upperPath), staleState.upper);
  const drift = fixture("result-drift"); const driftPlan = plan(drift); writeFileSync(drift.upperPath, Buffer.from("changed\n")); const driftState = readFileSync(drift.statePath); const driftResult = invoke(drift.root, driftPlan.applyAction.argv.slice(1)); assert.equal(driftResult.status, 2); assert.doesNotMatch(driftResult.out, /"status":"(?:applied|replayed)"/); assert.deepEqual(readFileSync(drift.statePath), driftState); assert.deepEqual(readFileSync(drift.lowerPath), drift.lower);
});
