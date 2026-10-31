#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, createHmac, generateKeyPairSync, sign } from "node:crypto";
import { createCriticalActionApprovalRequest, criticalActionSubjectSha256 } from "../lib/critical-action-approval-request.mjs";
import { afterEach, test } from "node:test";
import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./pipeline-state.mjs";
import { planFeaturePackageReconcile, reconcileNoDriftOk, validateFeaturePackage } from "../lib/feature-package-topology.mjs";
import { inspectSignedDescriptorCustodyRepository } from "../lib/worktree-lifecycle.mjs";
import { createControlledMethodRuntimeFixture } from "../lib/session-requester-bridge.mjs";
import { createSessionAuthorityParticipantPorts } from "../lib/session-authority-observers.mjs";
import { observeSessionCleanupState } from "../lib/onboarding-continuity.mjs";
import { initializeSessionAuthorityRegistry, reserveSessionAuthorityMember, withSessionAuthorityBoundary } from "../lib/session-authority-registry.mjs";

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

// The fixture owns its repository, so it can never resolve an enclosing one.
function initRepo(dir) {
  const git = (...args) => execFileSync("git", ["-C", dir, ...args], { stdio: "ignore" });
  git("init", "-q"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
}

function fixture(name = "case", parent = tmpdir()) {
  const root = mkdtempSync(join(parent, `pipeline-result-bootstrap-${name}-`)); roots.push(root); initRepo(root);
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

function registerPackage(f) {
  for (const name of ["acceptance.md", "candidate-evidence.md"]) writeFileSync(join(f.root, "specs/feature", name), `${name}\n`);
  const artifact = (kind, path, authority, mutability) => ({ class: kind, path, sha256: hash(readFileSync(join(f.root, path))), authority, mutability, retention: "active" });
  const manifest = {
    schema: "pipeline.feature-package.v1", feature: { id: "feature", rigor: 1 }, state: "implementing",
    artifacts: [
      artifact("prd", "specs/feature/prd_feature.md", true, "mutable"),
      artifact("spec", "specs/feature/spec.md", true, "immutable"),
      artifact("acceptance", "specs/feature/acceptance.md", true, "mutable"),
      artifact("result", "specs/feature/result.md", true, "append-only"),
      artifact("candidate-evidence", "specs/feature/candidate-evidence.md", false, "immutable"),
    ], candidate: null, supersedes: null,
  };
  const manifestPath = "specs/feature/lifecycle.json";
  writeFileSync(join(f.root, manifestPath), `${JSON.stringify(manifest, null, 2)}\n`);
  assert.equal(validateFeaturePackage(f.root, manifestPath).ok, true);
  return { manifestPath, manifest };
}

function legacyJournalFixture(name, stage = "post-state") {
  const f = fixture(name);
  const { manifestPath } = registerPackage(f);
  const oldSuffix = Buffer.from('```pipeline-result\n{"courseDecisionIntents":[],"courseDecisionReceipts":[],"decisionBriefs":[],"finalIntegrations":[]}\n```\n');
  const oldBytes = Buffer.concat([f.historical, oldSuffix]);
  const preState = readFileSync(f.statePath);
  const postState = structuredClone(f.value);
  postState.continuity.revision = 8;
  postState.continuity.resume.sourceRevision = 8;
  postState.continuity.authority.result = { path: "specs/feature/result.md", sha256: hash(oldBytes) };
  postState.updatedAt = NOW;
  const postStateBytes = Buffer.from(JSON.stringify(postState, null, 2) + "\n");
  writeFileSync(f.resultPath, oldBytes);
  if (stage === "post-state") writeFileSync(f.statePath, postStateBytes);
  const key = Buffer.alloc(32, 11);
  mkdirSync(join(f.commonDir, "agent-pipeline", "result-bootstrap"), { recursive: true, mode: 0o700 });
  writeFileSync(join(f.commonDir, "agent-pipeline", "result-bootstrap", "key"), key, { mode: 0o600 });
  const core = { schema: "pipeline.continuity-result-bootstrap-journal.v1", planSha256: h("a"),
    stateSha256: hash(preState), postStateSha256: hash(postStateBytes),
    result: { path: "specs/feature/result.md", sha256: hash(oldBytes) } };
  const mac = createHmac("sha256", key).update(JSON.stringify(core)).digest("hex");
  writeFileSync(f.journalPath, JSON.stringify({ ...core, mac }) + "\n", { mode: 0o600 });
  const action = ["continuity-result-bootstrap-apply", "--feature-id", "feature", "--expected-revision", "7",
    "--expected-state-sha256", core.stateSha256, "--expected-post-state-sha256", core.postStateSha256,
    "--updated-at", NOW, "--plan-sha256", core.planSha256, "--activate"];
  return { ...f, manifestPath, oldBytes, oldSuffix, action };
}

test("legacy MAC journal recovers the exact pre-fence postimage and yields the signed package preview", () => {
  const f = legacyJournalFixture("legacy-post");
  const manifestBefore = readFileSync(join(f.root, f.manifestPath));
  const result = invoke(f.root, f.action);
  assert.equal(result.status, 0, result.err);
  const receipt = JSON.parse(result.out);
  assert.equal(receipt.status, "recovered-legacy");
  assert.equal(receipt.completion.state, "reconciliation-pending");
  assert.equal(receipt.completion.preview.status, "reconcile-preview");
  assert.deepEqual(readFileSync(join(f.root, f.manifestPath)), manifestBefore);
  assert.deepEqual(readFileSync(f.resultPath).subarray(0, f.historical.length), f.historical);
  assert.equal(readFileSync(f.resultPath).includes(Buffer.from("pipeline.result-reconciliation-fence.v1")), true);
  assert.equal(JSON.parse(readFileSync(f.statePath)).continuity.authority.result.sha256, hash(readFileSync(f.resultPath)));
  assert.equal(existsSync(f.journalPath), false);
});

test("legacy journal repairs Result-before-State and replays each interrupted repair phase", () => {
  for (const [name, stage, seam] of [
    ["prestate", "pre-state", "afterLegacyResultRepairJournal"],
    ["after-result", "post-state", "afterLegacyResultRepairResult"],
    ["after-state", "post-state", "afterLegacyResultRepairState"],
  ]) {
    const f = legacyJournalFixture(name, stage);
    const stopped = invoke(f.root, f.action, { [seam]: () => false });
    assert.equal(stopped.status, 2, name);
    assert.equal(existsSync(f.journalPath), true, name);
    const resumed = invoke(f.root, f.action);
    assert.equal(resumed.status, 0, `${name}: ${resumed.err}`);
    assert.equal(JSON.parse(resumed.out).completion.preview.status, "reconcile-preview", name);
    assert.equal(existsSync(f.journalPath), false, name);
  }
});

test("legacy journal refuses forged proof, altered historical prefix and PRD drift without writing", () => {
  for (const kind of ["forged-mac", "prefix", "prd"]) {
    const f = legacyJournalFixture(`legacy-${kind}`);
    if (kind === "forged-mac") {
      const value = JSON.parse(readFileSync(f.journalPath)); value.mac = h("f");
      writeFileSync(f.journalPath, JSON.stringify(value) + "\n", { mode: 0o600 });
    }
    if (kind === "prefix") writeFileSync(f.resultPath, Buffer.concat([Buffer.from("tampered\n"), f.oldBytes]));
    if (kind === "prd") writeFileSync(join(f.root, "specs/feature/prd_feature.md"), "drift\n");
    const stateBefore = readFileSync(f.statePath);
    const resultBefore = readFileSync(f.resultPath);
    const manifestBefore = readFileSync(join(f.root, f.manifestPath));
    const refused = invoke(f.root, f.action);
    assert.equal(refused.status, 2, kind);
    assert.deepEqual(readFileSync(f.statePath), stateBefore, kind);
    assert.deepEqual(readFileSync(f.resultPath), resultBefore, kind);
    assert.deepEqual(readFileSync(join(f.root, f.manifestPath)), manifestBefore, kind);
  }
});

test("retired legacy journal exposes one exact signed repair preview and then the existing package reconcile", () => {
  const f = legacyJournalFixture("legacy-retired");
  rmSync(f.journalPath);
  const manifestBefore = readFileSync(join(f.root, f.manifestPath));
  const previewRun = invoke(f.root, ["continuity-result-bootstrap-plan"]);
  assert.equal(previewRun.status, 0, previewRun.err);
  const preview = JSON.parse(previewRun.out);
  assert.equal(preview.status, "legacy-repair-preview");
  assert.equal(preview.preview.result.from, hash(f.oldBytes));
  assert.equal(preview.applyAction.approvalKind, "feature-package-reconcile");
  const args = ["feature-package-reconcile", "--root", f.root, "--manifest", f.manifestPath, "--plan-sha256", preview.planSha256];
  const stateBefore = readFileSync(f.statePath); const resultBefore = readFileSync(f.resultPath);
  const defaultAbsent = invoke(f.root, args, { gitCandidate: () => ({ ok: true, commit: h("a"), tree: h("b") }) });
  assert.equal(defaultAbsent.status, 2); assert.deepEqual(readFileSync(f.statePath), stateBefore);
  assert.deepEqual(readFileSync(f.resultPath), resultBefore);
  const absent = invoke(f.root, args, { featurePackageReconcileApproval: () => ({ ok: false }), gitCandidate: () => ({ ok: true, commit: h("a"), tree: h("b") }) });
  assert.equal(absent.status, 2); assert.deepEqual(readFileSync(f.statePath), stateBefore);
  assert.deepEqual(readFileSync(f.resultPath), resultBefore);
  const repaired = invoke(f.root, args, { now: undefined, featurePackageReconcileApproval: () => ({ ok: true }), gitCandidate: () => ({ ok: true, commit: h("a"), tree: h("b") }) });
  assert.equal(repaired.status, 0, repaired.err);
  const receipt = JSON.parse(repaired.out);
  assert.equal(receipt.status, "legacy-repaired");
  assert.equal(receipt.completion.preview.status, "reconcile-preview");
  assert.deepEqual(readFileSync(join(f.root, f.manifestPath)), manifestBefore);
  const reconciled = invoke(f.root, ["feature-package-reconcile", "--root", f.root, "--manifest", f.manifestPath,
    "--plan-sha256", receipt.completion.planSha256], {
    featurePackageReconcileApproval: () => ({ ok: true }), gitCandidate: () => ({ ok: true, commit: h("a"), tree: h("b") }),
  });
  assert.equal(reconciled.status, 0, reconciled.err);
  assert.equal(validateFeaturePackage(f.root, f.manifestPath).ok, true);
});

test("signed legacy repair replays after interruption without consuming another approval", () => {
  const f = legacyJournalFixture("legacy-signed-replay"); rmSync(f.journalPath);
  const preview = JSON.parse(invoke(f.root, ["continuity-result-bootstrap-plan"]).out);
  const args = ["feature-package-reconcile", "--root", f.root, "--manifest", f.manifestPath, "--plan-sha256", preview.planSha256];
  const stopped = invoke(f.root, args, { featurePackageReconcileApproval: () => ({ ok: true }),
    gitCandidate: () => ({ ok: true, commit: h("a"), tree: h("b") }), afterLegacyResultRepairResult: () => false });
  assert.equal(stopped.status, 2);
  const resumed = invoke(f.root, args, { featurePackageReconcileApproval: () => ({ ok: false }) });
  assert.equal(resumed.status, 0, resumed.err);
  assert.equal(JSON.parse(resumed.out).completion.preview.status, "reconcile-preview");
});

test("signed legacy preview refuses source drift and forged repair replay without new writes", () => {
  const drift = legacyJournalFixture("legacy-signed-drift"); rmSync(drift.journalPath);
  const preview = JSON.parse(invoke(drift.root, ["continuity-result-bootstrap-plan"]).out);
  writeFileSync(join(drift.root, "specs/feature/spec.md"), "drift\n");
  const args = ["feature-package-reconcile", "--root", drift.root, "--manifest", drift.manifestPath, "--plan-sha256", preview.planSha256];
  const stateBefore = readFileSync(drift.statePath); const resultBefore = readFileSync(drift.resultPath);
  const refused = invoke(drift.root, args, { featurePackageReconcileApproval: () => ({ ok: true }),
    gitCandidate: () => ({ ok: true, commit: h("a"), tree: h("b") }) });
  assert.equal(refused.status, 2);
  assert.deepEqual(readFileSync(drift.statePath), stateBefore);
  assert.deepEqual(readFileSync(drift.resultPath), resultBefore);

  const keyless = legacyJournalFixture("legacy-signed-keyless"); rmSync(keyless.journalPath);
  const keylessPlan = JSON.parse(invoke(keyless.root, ["continuity-result-bootstrap-plan"]).out);
  rmSync(join(keyless.commonDir, "agent-pipeline", "result-bootstrap", "key"));
  let approvals = 0;
  const keylessResult = invoke(keyless.root, ["feature-package-reconcile", "--root", keyless.root, "--manifest", keyless.manifestPath,
    "--plan-sha256", keylessPlan.planSha256], { featurePackageReconcileApproval: () => { approvals++; return { ok: true }; },
    gitCandidate: () => ({ ok: true, commit: h("a"), tree: h("b") }) });
  assert.equal(keylessResult.status, 2); assert.equal(approvals, 0);
  assert.deepEqual(readFileSync(keyless.resultPath), keyless.oldBytes);

  const forged = legacyJournalFixture("legacy-signed-forged"); rmSync(forged.journalPath);
  const signedPlan = JSON.parse(invoke(forged.root, ["continuity-result-bootstrap-plan"]).out);
  const signedArgs = ["feature-package-reconcile", "--root", forged.root, "--manifest", forged.manifestPath, "--plan-sha256", signedPlan.planSha256];
  const stopped = invoke(forged.root, signedArgs, { featurePackageReconcileApproval: () => ({ ok: true }),
    gitCandidate: () => ({ ok: true, commit: h("a"), tree: h("b") }), afterLegacyResultRepairJournal: () => false });
  assert.equal(stopped.status, 2);
  const repairPath = join(forged.commonDir, "agent-pipeline", "result-bootstrap", "legacy-repair-journal");
  const record = JSON.parse(readFileSync(repairPath)); record.mac = h("f");
  writeFileSync(repairPath, JSON.stringify(record) + "\n", { mode: 0o600 });
  const oldState = readFileSync(forged.statePath); const oldResult = readFileSync(forged.resultPath);
  const replay = invoke(forged.root, signedArgs, { featurePackageReconcileApproval: () => ({ ok: true }) });
  assert.equal(replay.status, 2);
  assert.deepEqual(readFileSync(forged.statePath), oldState);
  assert.deepEqual(readFileSync(forged.resultPath), oldResult);
});

// Windows: Node synthesizes `.mode` on native Windows from the read-only
// attribute alone, so the bare `(info.mode & 0o077)` comparison in
// ensureBootstrapPrivateDirectory/readPrivateBootstrap failed closed
// unconditionally there (backlog/items/2026-08-18-windows-posix-mode-bit-
// checks-are-meaningless-on-ntfs.md). These inject `platform`/
// `assessWindowsPrivate` via the CLI's own `deps` seam to prove the win32
// branch decides the outcome, not the bare mode bits.
test("win32: a POSIX-insecure private result-bootstrap directory is admitted via the injected DACL assurance instead of failing closed (POSIX unchanged)", () => {
  const f = fixture("win32-secure"); const p = plan(f);
  // Exactly what the old bare `(info.mode & 0o077) !== 0` comparison would
  // have failed closed on unconditionally, on every platform.
  mkdirSync(join(f.commonDir, "agent-pipeline"), { recursive: true, mode: 0o755 });
  mkdirSync(join(f.commonDir, "agent-pipeline", "result-bootstrap"), { mode: 0o755 });
  const posix = invoke(f.root, p.applyAction.argv.slice(1));
  assert.equal(posix.status, 2);
  assert.doesNotMatch(posix.out, /"status":"(?:applied|replayed)"/);
  const win32Secure = invoke(f.root, p.applyAction.argv.slice(1), { platform: "win32", assessWindowsPrivate: () => ({ status: "secure" }) });
  assert.equal(win32Secure.status, 0, win32Secure.err);
});

test("win32: an insecure DACL assessment on the private result-bootstrap directory still fails closed", () => {
  const f = fixture("win32-insecure"); const p = plan(f);
  const win32Insecure = invoke(f.root, p.applyAction.argv.slice(1), { platform: "win32", assessWindowsPrivate: () => ({ status: "insecure" }) });
  assert.equal(win32Insecure.status, 2);
  assert.doesNotMatch(win32Insecure.out, /"status":"(?:applied|replayed)"/);
});

test("AC-047-143--146: readonly plan binds existing lowercase canonical Result prefix and strict appended fence", () => {
  const f = fixture("success"); const p = plan(f);
  const fence = Buffer.from("\n<!-- pipeline.result-reconciliation-fence.v1 -->\n```pipeline-result\n{\"courseDecisionIntents\":[],\"courseDecisionReceipts\":[],\"decisionBriefs\":[],\"finalIntegrations\":[]}\n```\n");
  assert.equal(p.schema, "pipeline.continuity-result-bootstrap-plan.v1"); assert.equal(p.preimage.result.path, "specs/feature/result.md"); assert.equal(p.preimage.result.sha256, hash(f.historical));
  assert.deepEqual(Buffer.from(p.preimage.historicalMarkdown.bytesBase64, "base64"), f.historical); assert.deepEqual(Buffer.from(p.append.bytesBase64, "base64"), fence);
  assert.deepEqual(Buffer.from(p.result.bytesBase64, "base64"), Buffer.concat([f.historical, fence])); assert.equal(existsSync(f.journalPath), false);
  assert.equal(p.applyAction.mutation, true); assert.equal(p.applyAction.requiresConfirmation, true); assert.equal(p.applyAction.argv.at(-1), "--activate");
  const applied = invoke(f.root, p.applyAction.argv.slice(1)); assert.equal(applied.status, 0, applied.err);
  assert.deepEqual(JSON.parse(applied.out).completion, {
    scope: "feature-closure", state: "in-progress", queueAction: "review", workflowTerminal: false,
  });
  const after = JSON.parse(readFileSync(f.statePath)); const expected = structuredClone(f.value);
  expected.continuity.revision = 8; expected.continuity.resume.sourceRevision = 8; expected.continuity.authority.result = { path: "specs/feature/result.md", sha256: p.result.sha256 }; expected.updatedAt = NOW;
  assert.deepEqual(after, expected); assert.deepEqual(readFileSync(f.resultPath), Buffer.from(p.result.bytesBase64, "base64")); assert.deepEqual(readFileSync(f.resultPath).subarray(0, f.historical.length), f.historical);
  assert.equal(existsSync(join(f.root, "specs/feature/Result.md")), false);
  assert.equal(existsSync(join(f.root, ".claude", ".pipeline-result-bootstrap-private")), false); assert.equal(existsSync(f.journalPath), false);
});

test("registered Result bootstrap preserves stale manifest authority and yields a provable signed reconciliation preview", () => {
  const f = fixture("registered"); const { manifestPath } = registerPackage(f);
  const manifestBytes = readFileSync(join(f.root, manifestPath));
  const p = plan(f);
  assert.equal(p.preimage.package.path, manifestPath);
  const applied = invoke(f.root, p.applyAction.argv.slice(1)); assert.equal(applied.status, 0, applied.err);
  const completion = JSON.parse(applied.out).completion;
  assert.equal(completion.state, "reconciliation-pending");
  assert.equal(completion.preview.status, "reconcile-preview");
  assert.equal(completion.preview.changes.length, 1);
  assert.equal(completion.preview.changes[0].class, "result");
  assert.equal(completion.preview.changes[0].from, hash(f.historical));
  assert.deepEqual(readFileSync(join(f.root, manifestPath)), manifestBytes);
  assert.equal(validateFeaturePackage(f.root, manifestPath).ok, false);
  assert.equal(planFeaturePackageReconcile(f.root, manifestPath, JSON.parse(readFileSync(f.statePath)).continuity.authority.result).status, "reconcile-preview");
  const replay = invoke(f.root, p.applyAction.argv.slice(1)); assert.equal(replay.status, 0, replay.err);
  assert.equal(JSON.parse(replay.out).completion.planSha256, completion.planSha256);
  const reconciled = invoke(f.root, ["feature-package-reconcile", "--root", f.root, "--manifest", manifestPath, "--plan-sha256", completion.planSha256], {
    featurePackageReconcileApproval: () => ({ ok: true }),
    gitCandidate: () => ({ ok: true, commit: h("a"), tree: h("b") }),
  });
  assert.equal(reconciled.status, 0, reconciled.err);
  assert.equal(validateFeaturePackage(f.root, manifestPath).ok, true);
  const afterReconcileReplay = invoke(f.root, p.applyAction.argv.slice(1));
  assert.equal(afterReconcileReplay.status, 0, afterReconcileReplay.err);
  assert.equal(JSON.parse(afterReconcileReplay.out).completion.queueAction, "review");
});

test("registered bootstrap interruption and replay retain a single provable reconciliation plan", () => {
  for (const [name, seam] of [["result", "afterResultBootstrapResult"], ["state", "afterResultBootstrapState"]]) {
    const f = fixture(`registered-${name}`); const { manifestPath } = registerPackage(f); const p = plan(f);
    const manifestBytes = readFileSync(join(f.root, manifestPath));
    assert.equal(invoke(f.root, p.applyAction.argv.slice(1), { [seam]: () => false }).status, 2);
    assert.equal(existsSync(f.journalPath), true);
    assert.deepEqual(readFileSync(join(f.root, manifestPath)), manifestBytes);
    const resumed = invoke(f.root, p.applyAction.argv.slice(1)); assert.equal(resumed.status, 0, resumed.err);
    const receipt = JSON.parse(resumed.out);
    assert.equal(receipt.completion.preview.status, "reconcile-preview");
    assert.equal(receipt.completion.preview.changes.length, 1);
    assert.equal(existsSync(f.journalPath), false);
    const replay = invoke(f.root, p.applyAction.argv.slice(1)); assert.equal(replay.status, 0, replay.err);
    assert.equal(JSON.parse(replay.out).completion.planSha256, receipt.completion.planSha256);
  }
});

test("registered package authority drift refuses bootstrap before Result, State or manifest mutation", () => {
  const f = fixture("package-drift"); const { manifestPath, manifest } = registerPackage(f);
  manifest.artifacts.find((entry) => entry.class === "result").sha256 = h("f");
  writeFileSync(join(f.root, manifestPath), `${JSON.stringify(manifest, null, 2)}\n`);
  const stateBytes = readFileSync(f.statePath); const resultBytes = readFileSync(f.resultPath); const manifestBytes = readFileSync(join(f.root, manifestPath));
  const refused = invoke(f.root, ["continuity-result-bootstrap-plan"]);
  assert.equal(refused.status, 2); assert.match(refused.err, /PS-RESULT-BOOTSTRAP-PACKAGE/);
  assert.deepEqual(readFileSync(f.statePath), stateBytes); assert.deepEqual(readFileSync(f.resultPath), resultBytes);
  assert.deepEqual(readFileSync(join(f.root, manifestPath)), manifestBytes); assert.equal(existsSync(f.journalPath), false);
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
  assert.equal(replay.status, 0, replay.err); assert.equal(JSON.parse(replay.out).status, "replayed"); assert.equal(JSON.parse(replay.out).mutated, false); assert.deepEqual(JSON.parse(replay.out).completion, { scope: "feature-closure", state: "in-progress", queueAction: "review", workflowTerminal: false }); assert.deepEqual(readFileSync(f.statePath), bytes);
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

test("controlled METHOD: catalogue-present Source companion closes exact Result bootstrap effects", async () => {
  const parent = join(process.cwd(), "scratch", "test-tmp");
  mkdirSync(parent, { recursive: true });
  const f = fixture("source-catalogue", parent);
  mkdirSync(join(f.root, "project"), { mode: 0o700 });
  const neutralStatePath = join(f.root, "project", "pipeline-state.json");
  writeFileSync(neutralStatePath, readFileSync(f.statePath), { mode: 0o600 });
  rmSync(f.statePath);
  f.statePath = neutralStatePath;
  chmodSync(f.statePath, 0o600);
  registerPackage(f);
  const repository = inspectSignedDescriptorCustodyRepository(f.root);
  const runtime = createControlledMethodRuntimeFixture({ repository,
    fixtureRoot: join(repository.commonDir, "agent-pipeline", "controlled-method-fixtures", "result-bootstrap"),
    sessionId: "result-bootstrap" });
  const ports = createSessionAuthorityParticipantPorts({ repository });
  assert.equal(initializeSessionAuthorityRegistry({ repository }, ports).status, "initialized");
  const port = ports.find(row => row.producerId === "onboarding-continuity").port;
  let operationHandle, executionHandle, memberHandle, memberPath;
  const member = () => {
    const bytes = readFileSync(join(repository.commonDir, memberPath.slice(5)));
    return { path: memberPath, sha256: hash(bytes), size: bytes.length };
  };
  await runtime.run(async () => {
    const state = observeSessionCleanupState(f.root);
    const prepared = port.prepareOperation({ requesterHandle: runtime.requesterHandle, entry: "bind",
      input: { expectedStateSha256: state.stateSha256, expectedRevision: state.revision } });
    assert.equal(prepared.status, "prepared", JSON.stringify(prepared));
    operationHandle = prepared.operationHandle;
    const observed = port.observeOperation(operationHandle);
    const reserved = withSessionAuthorityBoundary({ repository }, boundary =>
      reserveSessionAuthorityMember({ boundary, producerPort: port, association: observed.association, operationHandle }));
    memberHandle = reserved.memberHandle; memberPath = reserved.memberRef.path;
    const executed = await port.executeOperation({ operationHandle, memberHandle, expectedMemberRef: reserved.memberRef });
    assert.equal(executed.status, "executed", JSON.stringify(executed));
    executionHandle = executed.executionHandle;
  });
  const sourceCall = async (argv, overrides = {}) => {
    const out = []; const log = console.log;
    console.log = (...parts) => out.push(parts.join(" "));
    try {
      const result = await runtime.run(() => port.executeCompanionOperation({ operationHandle, executionHandle,
        expectedMemberRef: member(), expectedStateSha256: hash(readFileSync(f.statePath)), entry: argv[0], argv, ...overrides }));
      return { result, out: out.join("\n") };
    } finally { console.log = log; }
  };
  const beforeState = readFileSync(f.statePath), beforeResult = readFileSync(f.resultPath);
  const missingErrors = [], originalError = console.error;
  console.error = (...parts) => missingErrors.push(parts.join(" "));
  let missingContext;
  try { missingContext = run(["continuity-result-bootstrap-plan"], { dir: f.root }); }
  finally { console.error = originalError; }
  assert.equal(missingContext, 2);
  assert.match(missingErrors.join("\n"), /companion-owning-lifecycle-context-required/);
  assert.deepEqual(readFileSync(f.statePath), beforeState);
  assert.deepEqual(readFileSync(f.resultPath), beforeResult);
  const forged = await sourceCall(["continuity-result-bootstrap-plan"], { expectedStateSha256: h("f") });
  assert.equal(forged.result.status, "unavailable");
  assert.equal(forged.result.attempted, false);
  assert.deepEqual(readFileSync(f.statePath), beforeState);
  assert.deepEqual(readFileSync(f.resultPath), beforeResult);
  const planned = await sourceCall(["continuity-result-bootstrap-plan"]);
  assert.equal(planned.result.status, "completed", JSON.stringify(planned.result));
  assert.equal(planned.result.exitCode, 0);
  const plan = JSON.parse(planned.out);
  const prdPath = join(f.root, "specs/feature/prd_feature.md");
  const prdBytes = readFileSync(prdPath);
  writeFileSync(prdPath, "drift\n");
  const drifted = await sourceCall(plan.applyAction.argv.slice(1));
  assert.notEqual(drifted.result.exitCode, 0);
  assert.deepEqual(readFileSync(f.statePath), beforeState);
  assert.deepEqual(readFileSync(f.resultPath), beforeResult);
  writeFileSync(prdPath, prdBytes);
  // Restored bytes have a new physical identity, so the old plan stays stale.
  const refreshed = await sourceCall(["continuity-result-bootstrap-plan"]);
  assert.equal(refreshed.result.exitCode, 0);
  const applied = await sourceCall(JSON.parse(refreshed.out).applyAction.argv.slice(1));
  assert.equal(applied.result.status, "completed", JSON.stringify(applied.result));
  assert.equal(applied.result.exitCode, 0);
  assert.equal(applied.result.assurance, "controlled-unit-method");
  const receipt = JSON.parse(applied.out);
  assert.equal(receipt.status, "applied");
  assert.equal(receipt.completion.preview.status, "reconcile-preview");
  assert.deepEqual(readFileSync(f.resultPath).subarray(0, f.historical.length), f.historical);
  assert.equal(existsSync(join(repository.commonDir, "agent-pipeline", "result-bootstrap", "journal")), false);
  assert.equal(validateFeaturePackage(f.root, "specs/feature/lifecycle.json").ok, false);
  await runtime.dispose();
});

// ---- N29 (D206): a feature whose registered package carries its Result without authority can be closed ----
// The package below is the consumer state: registered by an earlier build, state implementing, the Result entry
// present with authority:false and mutability:immutable. Ordinary packages (authority:true) are pinned above.

const CLOSE_CLI = fileURLToPath(new URL("./close-coordinator.mjs", import.meta.url));

function closeCli(args, expectedStatus = 0) {
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, [CLOSE_CLI, ...args], { encoding: "utf8", shell: false, env });
  assert.equal(r.status, expectedStatus, r.stderr || r.stdout);
  return JSON.parse(r.stdout);
}

function closeAction(action, expectedStatus = 0) {
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(action.executable, action.argv, { encoding: "utf8", shell: false, env });
  assert.equal(r.status, expectedStatus, r.stderr || r.stdout);
  return JSON.parse(r.stdout);
}

function registerPackageWithoutResultAuthority(f, mutate = () => {}) {
  for (const name of ["acceptance.md", "candidate-evidence.md"]) writeFileSync(join(f.root, "specs/feature", name), `${name}\n`);
  const artifact = (kind, path, authority, mutability) => ({ class: kind, path, sha256: hash(readFileSync(join(f.root, path))), authority, mutability, retention: "active" });
  const manifest = {
    schema: "pipeline.feature-package.v1", feature: { id: "feature", rigor: 1 }, state: "implementing",
    artifacts: [
      artifact("prd", "specs/feature/prd_feature.md", true, "mutable"),
      artifact("spec", "specs/feature/spec.md", true, "immutable"),
      artifact("acceptance", "specs/feature/acceptance.md", true, "mutable"),
      artifact("result", "specs/feature/result.md", false, "immutable"),
      artifact("candidate-evidence", "specs/feature/candidate-evidence.md", false, "immutable"),
    ], candidate: null, supersedes: null,
  };
  mutate(manifest, { artifact, f });
  const manifestPath = "specs/feature/lifecycle.json";
  writeFileSync(join(f.root, manifestPath), `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifestPath, manifest };
}

const reconcileDeps = { featurePackageReconcileApproval: () => ({ ok: true }), gitCandidate: () => ({ ok: true, commit: h("a"), tree: h("b") }) };

test("N29 anchor: a package whose Result entry has authority:false closes from checkpointed through bootstrap and reconcile without restarting", () => {
  const f = fixture("n29-anchor"); const { manifestPath, manifest } = registerPackageWithoutResultAuthority(f);
  assert.equal(validateFeaturePackage(f.root, manifestPath).ok, true, "the consumer package is valid for the registering build's validator");
  const root = realpathSync(f.root); const lifecycle = "close-n29";
  // The close lifecycle is taken to checkpointed exactly as the consumer did.
  const start = closeCli(["plan-start", "--root", root, "--lifecycle", lifecycle, "--actor", "PO", "--close-intent", "durable-stop"]);
  assert.equal(closeAction(start.nextAction).status, "applied");
  const checkpoint = closeCli(["plan-transition", "--root", root, "--lifecycle", lifecycle, "--actor", "PO", "--phase", "checkpointed"]);
  assert.equal(closeAction(checkpoint.nextAction).phase, "checkpointed");
  const transitionArgs = ["plan-transition", "--root", root, "--lifecycle", lifecycle, "--actor", "PO", "--phase", "feature-close-prepared", "--architecture-impact", "architecture-conforms"];
  // (1) CLOSE-RESULT names the next step and the unmet condition.
  const noResult = closeCli(transitionArgs, 2);
  assert.equal(noResult.code, "CLOSE-RESULT");
  assert.match(noResult.message, /continuity-result-bootstrap-plan/); assert.match(noResult.message, /Implementation Result/);
  assert.match(noResult.message, /continuity/i); assert.match(noResult.message, /same lifecycle|without restarting|no plan-start/i);
  // (3) The bootstrap admits the package, records the pending lift, and keeps the registered manifest bytes.
  const manifestBytes = readFileSync(join(f.root, manifestPath));
  const p = plan(f);
  assert.equal(p.preimage.package.path, manifestPath); assert.equal(p.preimage.package.resultAuthorityLift, true);
  const applied = invoke(f.root, p.applyAction.argv.slice(1)); assert.equal(applied.status, 0, applied.err);
  const completion = JSON.parse(applied.out).completion;
  assert.equal(completion.state, "reconciliation-pending"); assert.equal(completion.preview.status, "reconcile-preview");
  assert.equal(completion.preview.changes.length, 1);
  assert.equal(completion.preview.changes[0].class, "result"); assert.deepEqual(completion.preview.changes[0].authority, { from: false, to: true });
  assert.equal(completion.preview.requiredAuthority, "po");
  assert.deepEqual(readFileSync(join(f.root, manifestPath)), manifestBytes);
  const replay = invoke(f.root, p.applyAction.argv.slice(1)); assert.equal(replay.status, 0, replay.err);
  assert.equal(JSON.parse(replay.out).completion.planSha256, completion.planSha256);
  // Continuity now binds the Result; make the State close-ready the way the close fixtures do.
  const stateValue = JSON.parse(readFileSync(f.statePath));
  stateValue.continuity.queueHead.nextAction = "close"; writeFileSync(f.statePath, JSON.stringify(stateValue, null, 2) + "\n");
  mkdirSync(join(f.root, "evidence")); writeFileSync(join(f.root, "evidence/close.txt"), "closed resources\n");
  writeFileSync(join(f.root, "evidence/close-request.json"), `${JSON.stringify({ schema: "pipeline.continuity-close.v0", featureId: "feature", expectedRevision: stateValue.continuity.revision,
    result: stateValue.continuity.authority.result, closeEvidence: { path: "evidence/close.txt", sha256: hash(readFileSync(join(f.root, "evidence/close.txt"))) } }, null, 2)}\n`);
  const closeArgs = [...transitionArgs, "--continuity-close-request", "evidence/close-request.json"];
  // Until the reconcile is applied the package is stale, and the refusal names the reconcile verb.
  const stale = closeCli(closeArgs, 2);
  assert.equal(stale.code, "CLOSE-PACKAGE"); assert.match(stale.message, /feature-package-reconcile/);
  // The reconcile step the completion names: PO-bound, driven here as the other reconcile tests drive it.
  const reconciled = invoke(f.root, ["feature-package-reconcile", "--root", f.root, "--manifest", manifestPath, "--plan-sha256", completion.planSha256], reconcileDeps);
  assert.equal(reconciled.status, 0, reconciled.err);
  assert.equal(validateFeaturePackage(f.root, manifestPath).ok, true);
  const after = JSON.parse(readFileSync(join(f.root, manifestPath)));
  const expected = structuredClone(manifest);
  const resultEntry = expected.artifacts.find((entry) => entry.class === "result");
  resultEntry.authority = true; resultEntry.sha256 = hash(readFileSync(f.resultPath));
  assert.deepEqual(after, expected, "only the result entry's authority and digest change; every other key and entry is untouched");
  assert.equal(after.artifacts.find((entry) => entry.class === "result").mutability, "immutable");
  // (4) The SAME lifecycle continues: the result, close-request and package gates pass; the next gate is the
  // candidate-bound Critic/Verify audit every registered package needs (a separate route, not this defect).
  const proceeds = closeCli(closeArgs, 2);
  assert.equal(proceeds.code, "CLOSE-QUALIFICATION-REQUIRED");
  assert.equal(closeCli(["inspect", "--root", root, "--lifecycle", lifecycle]).coordinator.phase, "checkpointed");
});

// ---- N30 (D210): the completion prints the exact reconcile signing command and its subject digest ----
// Like `push-init` does for a push. The digest is the one the verifier recomputes from { manifest, planSha256, candidate }
// (pipeline-state.mjs verifyCriticalHumanProof); the printed reconcile command is admitted with a proof made for that digest.

test("N30 anchor: the completion prints the signing command with the subject digest the verifier recomputes, and the printed reconcile command is admitted with a proof made for it", () => {
  const f = fixture("n30-anchor"); const { manifestPath } = registerPackageWithoutResultAuthority(f);
  const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
  const gitDeps = { gitCandidate: () => ({ ok: true, ...candidate }) };
  const p = plan(f);
  const applied = invoke(f.root, p.applyAction.argv.slice(1), gitDeps); assert.equal(applied.status, 0, applied.err);
  const completion = JSON.parse(applied.out).completion;
  assert.equal(completion.state, "reconciliation-pending");
  const expectedSubject = { manifest: manifestPath, planSha256: completion.planSha256, candidate };
  const expectedDigest = criticalActionSubjectSha256({ kind: "feature-package-reconcile", candidate, subject: expectedSubject });
  const signature = completion.signatureCommand;
  assert.equal(signature.kind, "feature-package-reconcile");
  assert.equal(signature.subjectSha256, expectedDigest, "the printed digest is criticalActionSubjectSha256 over the verifier's preimage");
  assert.deepEqual(signature.subject, expectedSubject); assert.deepEqual(signature.candidate, candidate);
  assert.equal(signature.executable, "node");
  const flag = (argv, name) => argv[argv.indexOf(name) + 1];
  assert.equal(argv0(signature.argv), "authorize-critical");
  assert.equal(flag(signature.argv, "--kind"), "feature-package-reconcile");
  assert.equal(flag(signature.argv, "--subject-sha256"), expectedDigest);
  assert.equal(flag(signature.argv, "--feature-id"), "feature");
  assert.equal(flag(signature.argv, "--plan"), "specs/feature/prd_feature.md");
  assert.equal(flag(signature.argv, "--spec"), "specs/feature/spec.md");
  assert.equal(flag(signature.argv, "--repo-root"), realpathSync(f.root));
  assert.equal(typeof signature.command, "string"); assert.equal(signature.requiresPoApproval, true);
  assert.equal(signature.argv.includes("--directory"), false, "the approval directory is resolved by the signing step and never printed");
  // The PO's terminal makes this proof; the test makes it the same way, for exactly the printed digest.
  const expiresAt = flag(signature.argv, "--expires-at");
  const keys = generateKeyPairSync("ed25519");
  const publicKey = keys.publicKey.export({ format: "pem", type: "spki" }).toString();
  const authority = { keyReference: "test-key", publicKeySha256: hash(publicKey) };
  const external = mkdtempSync(join(tmpdir(), "n30-external-")); roots.push(external);
  const proofFiles = (digest, name) => {
    const request = createCriticalActionApprovalRequest({ candidate, featureId: "feature", planBytes: readFileSync(join(f.root, "specs/feature/prd_feature.md")), specBytes: readFileSync(join(f.root, "specs/feature/spec.md")),
      action: { kind: "feature-package-reconcile", subjectSha256: digest, expiresAt } });
    const proof = { schema: "pipeline.po-approval-proof.v1", intentSha256: request.approvalIntent.sha256, keyReference: "test-key", publicKey,
      signatureBase64: sign(null, Buffer.from(request.approvalIntent.sha256), keys.privateKey).toString("base64") };
    const files = { request: join(external, `${name}-request.json`), authority: join(external, `${name}-authority.json`), proof: join(external, `${name}-proof.json`) };
    writeFileSync(files.request, JSON.stringify(request)); writeFileSync(files.authority, JSON.stringify(authority)); writeFileSync(files.proof, JSON.stringify(proof));
    return files;
  };
  mkdirSync(join(f.root, "project"), { recursive: true });
  writeFileSync(join(f.root, "project", "critical-human-proof.json"), JSON.stringify({ schema: "pipeline.critical-human-proof-policy.v1", requiredKinds: ["feature-package-reconcile"] }));
  // The follow-on command is printed with named placeholders for the three files the signing step writes and the actor.
  const reconcile = completion.reconcileCommand;
  assert.equal(reconcile.executable, process.execPath); assert.equal(argv0(reconcile.argv), "feature-package-reconcile");
  assert.equal(flag(reconcile.argv, "--manifest"), manifestPath); assert.equal(flag(reconcile.argv, "--plan-sha256"), completion.planSha256);
  assert.deepEqual(reconcile.placeholders.map((entry) => entry.flag).sort(), ["--by", "--proof", "--proof-authority", "--proof-request"]);
  const fill = (files) => reconcile.argv.map((entry) => {
    const hit = reconcile.placeholders.find((placeholder) => placeholder.token === entry);
    if (hit === undefined) return entry;
    return { "--by": "PO", "--proof-request": files.request, "--proof-authority": files.authority, "--proof": files.proof }[hit.flag];
  });
  // A proof made for a DIFFERENT digest is refused, so the admission below is not vacuous.
  const wrong = proofFiles("c".repeat(64), "wrong");
  const refused = invoke(f.root, fill(wrong).slice(1), gitDeps);
  assert.equal(refused.status, 2, refused.err); assert.match(refused.err, /FTP-RECONCILE-APPROVAL-REJECTED/);
  assert.equal(validateFeaturePackage(f.root, manifestPath).ok, false, "a refused reconcile leaves the package stale");
  const good = proofFiles(expectedDigest, "good");
  const admitted = invoke(f.root, fill(good).slice(1), gitDeps);
  assert.equal(admitted.status, 0, admitted.err);
  assert.equal(validateFeaturePackage(f.root, manifestPath).ok, true);
});

test("N30: without a readable candidate the completion says why it has no signing command and still names the reconcile verb", () => {
  const f = fixture("n30-nocandidate"); registerPackageWithoutResultAuthority(f);
  const p = plan(f);
  const applied = invoke(f.root, p.applyAction.argv.slice(1), { gitCandidate: () => ({ ok: false, error: "no commit" }) }); assert.equal(applied.status, 0, applied.err);
  const completion = JSON.parse(applied.out).completion;
  assert.equal(completion.state, "reconciliation-pending");
  assert.equal(completion.signatureCommand, null);
  assert.match(completion.signatureUnavailable, /candidate/u);
  assert.match(completion.nextAction, /feature-package-reconcile/u);
});

// ---- N31 remainder (D212): the reconcile plan and its digest can be read again after the bootstrap apply ----
// The close-feature skill says to take the signing command again from a fresh continuity-result-bootstrap-plan once a
// commit moved the candidate; that read must answer with the pending reconcile instead of refusing.

test("N31r: a read-only bootstrap plan after the apply prints the pending reconcile plan, its planSha256 and both commands, and writes nothing", () => {
  const f = fixture("n31r-reread"); const { manifestPath } = registerPackageWithoutResultAuthority(f);
  const gitDeps = { gitCandidate: () => ({ ok: true, commit: "a".repeat(40), tree: "b".repeat(40) }) };
  const p = plan(f);
  const applied = invoke(f.root, p.applyAction.argv.slice(1), gitDeps); assert.equal(applied.status, 0, applied.err);
  const completion = JSON.parse(applied.out).completion;
  const before = readFileSync(f.statePath); const manifestBefore = readFileSync(join(f.root, manifestPath));
  const reread = invoke(f.root, ["continuity-result-bootstrap-plan"], gitDeps);
  assert.equal(reread.status, 0, reread.err);
  assert.deepEqual(readFileSync(f.statePath), before, "the read writes no State");
  assert.deepEqual(readFileSync(join(f.root, manifestPath)), manifestBefore, "the read writes no manifest");
  const value = JSON.parse(reread.out);
  assert.equal(value.schema, "pipeline.continuity-result-reconcile-pending.v1");
  assert.equal(value.status, "reconcile-preview"); assert.equal(value.manifest, manifestPath);
  assert.equal(value.planSha256, completion.planSha256, "the same plan digest the apply printed");
  assert.equal(value.signatureCommand.subjectSha256, completion.signatureCommand.subjectSha256);
  assert.deepEqual(value.reconcileCommand.argv, completion.reconcileCommand.argv);
  assert.equal(value.mutated, false);
});

test("N31r: the reconcile command marks --by as the PO's own value and names where each proof path comes from", () => {
  const f = fixture("n31r-by"); registerPackageWithoutResultAuthority(f);
  const p = plan(f);
  const applied = invoke(f.root, p.applyAction.argv.slice(1), { gitCandidate: () => ({ ok: true, commit: "a".repeat(40), tree: "b".repeat(40) }) });
  assert.equal(applied.status, 0, applied.err);
  const placeholders = JSON.parse(applied.out).completion.reconcileCommand.placeholders;
  const by = placeholders.find((entry) => entry.flag === "--by");
  assert.equal(by.token, "<po-name>");
  assert.match(by.from, /PO/u); assert.match(by.from, /never the agent/u);
  for (const [flag, field] of [["--proof-request", "requestPath"], ["--proof-authority", "authorityPath"], ["--proof", "proofPath"]]) {
    assert.match(placeholders.find((entry) => entry.flag === flag).from, new RegExp(field, "u"), `${flag} names the ${field} the signing terminal prints`);
  }
});

const argv0 = (argv) => argv[1];

test("N29 negatives: two Result entries, a Result at another path and a PRD without authority stay refused with a typed detail", () => {
  const refusal = (name, mutate, state = null) => {
    const f = fixture(name); registerPackageWithoutResultAuthority(f, mutate);
    if (state !== null) { const s = JSON.parse(readFileSync(f.statePath)); state(s); writeFileSync(f.statePath, JSON.stringify(s, null, 2) + "\n"); }
    const stateBytes = readFileSync(f.statePath); const resultBytes = readFileSync(f.resultPath);
    const refused = invoke(f.root, ["continuity-result-bootstrap-plan"]);
    assert.equal(refused.status, 2, name); assert.match(refused.err, /PS-RESULT-BOOTSTRAP-PACKAGE/, name); assert.match(refused.err, /zero mutation/, name);
    assert.deepEqual(readFileSync(f.statePath), stateBytes, name); assert.deepEqual(readFileSync(f.resultPath), resultBytes, name); assert.equal(existsSync(f.journalPath), false, name);
    return refused.err;
  };
  const twoResults = refusal("n29-two", (manifest, { artifact, f }) => {
    writeFileSync(join(f.root, "specs/feature/result-extra.md"), "extra\n");
    manifest.artifacts.push(artifact("result", "specs/feature/result-extra.md", false, "immutable"));
  });
  assert.match(twoResults, /condition=entry-duplicate/); assert.match(twoResults, /class=result/); assert.match(twoResults, /path=specs\/feature\/result\.md/);
  const wrongPath = refusal("n29-path", (manifest, { artifact, f }) => {
    writeFileSync(join(f.root, "specs/feature/result-copy.md"), readFileSync(f.resultPath));
    manifest.artifacts.find((entry) => entry.class === "result").path = "specs/feature/result-copy.md";
    manifest.artifacts.find((entry) => entry.class === "result").sha256 = hash(readFileSync(join(f.root, "specs/feature/result-copy.md")));
  });
  assert.match(wrongPath, /condition=path-mismatch/); assert.match(wrongPath, /class=result/);
  const staleDigest = refusal("n29-digest", (manifest) => { manifest.artifacts.find((entry) => entry.class === "result").sha256 = h("f"); });
  assert.match(staleDigest, /condition=(?:digest-mismatch|manifest-invalid)/);
  const prdNoAuthority = refusal("n29-prd", (manifest) => { manifest.artifacts.find((entry) => entry.class === "prd").authority = false; });
  assert.match(prdNoAuthority, /condition=manifest-invalid/);
  // A draft package that names the PRD without authority reaches the entry check itself.
  const draftPrd = refusal("n29-prd-draft", (manifest) => {
    manifest.state = "draft"; manifest.artifacts = manifest.artifacts.filter((entry) => entry.class === "prd"); manifest.artifacts[0].authority = false;
  });
  assert.match(draftPrd, /condition=authority-false/); assert.match(draftPrd, /class=prd/);
  const draftNoSpec = refusal("n29-spec-missing", (manifest) => {
    manifest.state = "draft"; manifest.artifacts = manifest.artifacts.filter((entry) => entry.class === "prd");
  });
  assert.match(draftNoSpec, /condition=entry-missing/); assert.match(draftNoSpec, /class=spec/);
});

test("N29: the reconcile plan lifts authority only on the Result entry Continuity binds, and the no-drift check admits nothing wider", () => {
  const before = { schema: "s", state: "implementing", artifacts: [
    { class: "prd", path: "p", sha256: h("1"), authority: true, mutability: "mutable", retention: "active" },
    { class: "result", path: "r", sha256: h("2"), authority: false, mutability: "immutable", retention: "active" },
  ] };
  const lifted = structuredClone(before); lifted.artifacts[1].authority = true; lifted.artifacts[1].sha256 = h("3");
  assert.equal(reconcileNoDriftOk(before, lifted), false, "default stays digest-only");
  assert.equal(reconcileNoDriftOk(before, lifted, { liftResultAuthorityPath: "r" }), true);
  assert.equal(reconcileNoDriftOk(before, lifted, { liftResultAuthorityPath: "other" }), false);
  const noDigest = structuredClone(lifted); noDigest.artifacts[1].sha256 = h("2");
  assert.equal(reconcileNoDriftOk(before, noDigest, { liftResultAuthorityPath: "r" }), false, "the lift rides on the fence-proven digest move only");
  const prdBefore = structuredClone(before); prdBefore.artifacts[0].authority = false;
  const prdLift = structuredClone(before); prdLift.artifacts[0].sha256 = h("9");
  assert.equal(reconcileNoDriftOk(prdBefore, prdLift, { liftResultAuthorityPath: "p" }), false, "a PRD is never lifted");
  const demoted = structuredClone(lifted); const demotedBefore = structuredClone(before); demotedBefore.artifacts[1].authority = true;
  demoted.artifacts[1].authority = false;
  assert.equal(reconcileNoDriftOk(demotedBefore, demoted, { liftResultAuthorityPath: "r" }), false, "authority is never lowered");
  const other = structuredClone(lifted); other.artifacts[1].mutability = "mutable";
  assert.equal(reconcileNoDriftOk(before, other, { liftResultAuthorityPath: "r" }), false, "no other key moves");
  const state = structuredClone(lifted); state.state = "verifying";
  assert.equal(reconcileNoDriftOk(before, state, { liftResultAuthorityPath: "r" }), false, "no manifest key moves");
});
