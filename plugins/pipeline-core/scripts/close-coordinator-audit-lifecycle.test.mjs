// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { recordCriticVerifyLifecycle } from "../lib/critic-verify-lifecycle.mjs";
import { planVerifySelection } from "../lib/verify-selection.mjs";
import { admitSessionCriticReview, finalizeSessionCriticReview } from "./session-critic-finalizer.mjs";
import { finishFeature } from "./finish-feature.mjs";

const ROOT = process.cwd();
const CLI = new URL("./close-coordinator.mjs", import.meta.url).pathname;
const FINISH = new URL("./finish-feature.mjs", import.meta.url).pathname;
const STATE = new URL("./pipeline-state.mjs", import.meta.url).pathname;
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const h = (value) => value.repeat(64);
const git = (root, args) => {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "Close test", GIT_AUTHOR_EMAIL: "close@test.invalid", GIT_COMMITTER_NAME: "Close test", GIT_COMMITTER_EMAIL: "close@test.invalid" } });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};
const invoke = (root, argv, status = 0) => {
  const result = spawnSync(process.execPath, [CLI, ...argv], { cwd: root, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
  assert.equal(result.status, status, result.stderr || result.stdout);
  assert.notEqual(result.stdout.trim(), "", result.stderr || "coordinator wrote no JSON");
  return JSON.parse(result.stdout);
};
const invokeAction = (root, action, status = 0) => {
  const result = spawnSync(action.executable, action.argv, { cwd: root, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
  assert.equal(result.status, status, result.stderr || result.stdout);
  return action.argv[0] === STATE ? result.stdout : JSON.parse(result.stdout);
};
function put(root, path, text) { mkdirSync(join(root, path, ".."), { recursive: true }); writeFileSync(join(root, path), text); }
function fixture(t) {
  mkdirSync(join(ROOT, "scratch/test-tmp"), { recursive: true });
  const root = mkdtempSync(join(ROOT, "scratch/test-tmp/close-audit-lifecycle-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [path, text] of [["specs/audit-feature/prd.md", "# PRD\n"], ["specs/audit-feature/spec.md", "# Spec\n"], ["specs/audit-feature/result.md", "# Result\n"], ["evidence/close.txt", "close\n"], ["docs/state.md", "# State\n"]]) put(root, path, text);
  mkdirSync(join(root, ".claude"));
  git(root, ["init", "-q"]); git(root, ["add", "."]); git(root, ["commit", "-qm", "base"]);
  put(root, "specs/audit-feature/spec.md", "# Spec\nQualified candidate\n");
  put(root, ".claude/pipeline.yaml", "schema: pipeline.manifest.v0\n");
  git(root, ["add", "specs/audit-feature/spec.md", ".claude/pipeline.yaml"]);
  git(root, ["commit", "-qm", "candidate"]);
  const candidate = { commit: git(root, ["rev-parse", "HEAD"]), tree: git(root, ["rev-parse", "HEAD^{tree}"]) };
  const prd = readFileSync(join(root, "specs/audit-feature/prd.md")); const spec = readFileSync(join(root, "specs/audit-feature/spec.md")); const result = readFileSync(join(root, "specs/audit-feature/result.md"));
  const verify = { schema: "pipeline.verify-evidence.v0", commit: candidate.commit, tree: candidate.tree, candidate, exitCode: 0, selection: planVerifySelection({ mode: "candidate", candidateCommit: candidate.commit, registeredSuiteIds: ["test"], policy: { schema: "pipeline.verify-selection.v1", baseline: ["test"], areas: [{ id: "all", paths: ["**"], suites: ["test"] }] } }) };
  put(root, "specs/audit-feature/verify.json", JSON.stringify(verify)); put(root, "specs/audit-feature/acceptance.md", "# Acceptance\n");
  const artifacts = [["prd", "specs/audit-feature/prd.md", prd], ["spec", "specs/audit-feature/spec.md", spec], ["result", "specs/audit-feature/result.md", result], ["acceptance", "specs/audit-feature/acceptance.md", readFileSync(join(root, "specs/audit-feature/acceptance.md"))], ["candidate-evidence", "specs/audit-feature/verify.json", readFileSync(join(root, "specs/audit-feature/verify.json"))]].map(([kind, path, bytes]) => ({ class: kind, path, sha256: sha(bytes), authority: kind === "prd" || kind === "spec", mutability: kind === "candidate-evidence" ? "immutable" : "mutable", retention: "active" }));
  put(root, "specs/audit-feature/lifecycle.json", JSON.stringify({ schema: "pipeline.feature-package.v1", feature: { id: "audit-feature", rigor: 1 }, state: "completed", artifacts, candidate, supersedes: null }));
  const common = git(root, ["rev-parse", "--git-common-dir"]);
  const criticPacketId = "1".repeat(32);
  const baseCommit = git(root, ["rev-parse", "HEAD^"]);
  const criticDiagnostic = { schema: "pipeline.verify-evidence.v0", commit: candidate.commit,
    tree: candidate.tree, candidate, exitCode: 0,
    selection: planVerifySelection({ mode: "critic", baseCommit, candidateCommit: candidate.commit,
      changedPaths: [".claude/pipeline.yaml", "specs/audit-feature/spec.md"],
      registeredSuiteIds: ["test"], policy: { schema: "pipeline.verify-selection.v1",
        baseline: ["test"], areas: [{ id: "all", paths: ["**"], suites: ["test"] }] } }),
    steps: [{ name: "test", exitCode: 0 }] };
  put(root, "evidence/critic-diagnostic.json", JSON.stringify(criticDiagnostic));
  put(root, "evidence/dispatch-record-close-audit-review.json", JSON.stringify({
    schema: "pipeline.dispatch-record.v3", taskId: "close-audit-review",
    agentType: "default", model: "gpt-5.6-luna", effort: "medium",
    rulesetSha: "b7797309cf6abe175fd52b0a8749d82b43714ea0",
    dispatcher: "elephant", outcome: "completed", commits: [candidate.commit],
    candidateCommit: candidate.commit, resultSha256: h("a"), log: [],
    report: { text: "done", changedFiles: ["specs/audit-feature/spec.md"] },
    criticRequired: { schema: "pipeline.critic-required-decision.v1",
      trigger: { schema: "pipeline.critic-trigger-input.v1", rigorLevel: 2,
        riskClass: "high", riskFlag: true,
        diff: { mechanical: false, architecture: false, guardrails: true, security: false } },
      appliedRow: "T1" },
  }));
  const review = { preflightInput: { root, base: baseCommit,
    candidate: candidate.commit, specPath: "specs/audit-feature/spec.md",
    guardrailPaths: [], evidencePaths: ["evidence/critic-diagnostic.json"],
    priorCriticEvidencePath: null }, taskId: "close-audit-review",
    projectId: "fixture", sessionId: "close-review-1", packetId: criticPacketId,
    route: { routeId: "session-critic", runner: "codex",
      adapter: "session-functional-equivalent", provider: "openai",
      modelTier: "higher-capability", effortTier: "xhigh" },
    verdict: { findings: [], deliberately_not_flagged: ["fixture"],
      trajectory_verdict: "consistent", trajectory_evidence: "fixture evidence",
      briefing_violations: [], pass: true } };
  admitSessionCriticReview(review);
  finalizeSessionCriticReview(review);
  const lifecycle = recordCriticVerifyLifecycle({ gitCommonDir: join(root, common),
    criticPacketId, candidate, evidencePath: "specs/audit-feature/verify.json", evidence: verify });
  const request = { schema: "pipeline.feature-close-audit-request.v1", manifestPath: "specs/audit-feature/lifecycle.json", coreVersion: "0.7.0", packs: [{ schema: "pipeline.organization-policy-pack.v1", packId: "test-policy", revision: h("5"), compatibility: { minimumCoreVersion: "0.1.0", maximumCoreVersion: "9.0.0" }, governanceFloors: { requireHumanDecisionLedger: true, allowExternalAuthority: false }, documentClasses: [{ class: "security", mode: "controlled-publication", approvalRequired: true }] }], criticVerifyLifecycleId: lifecycle.receipt.id };
  put(root, "evidence/audit-request.json", JSON.stringify(request));
  const state = { schema: "pipeline.state.v0", planApproved: true, activeFeature: { id: "audit-feature", planPath: "specs/audit-feature/prd.md", phase: "implementation" }, planApproval: { poGateAuthority: { planSha256: sha(prd), specPath: "specs/audit-feature/spec.md", specSha256: sha(spec) } }, continuity: { schema: "pipeline.continuity.v0", featureId: "audit-feature", runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator" }, revision: 1, authority: { prd: { path: "specs/audit-feature/prd.md", sha256: sha(prd) }, spec: { path: "specs/audit-feature/spec.md", sha256: sha(spec) }, result: { path: "specs/audit-feature/result.md", sha256: sha(result) } }, queueHead: { packageId: "close-package", actionId: "close-action", nextAction: "close", dispatch: null, productRetryCount: 0, environmentRerouteCount: 0 }, blocker: null, decisionTxn: null, acknowledgedFinal: null, resume: { mode: "immediate", sourceRevision: 1, reasonCode: "active-turn" }, recovery: null, capacity: { concurrencyLimit: 3, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" } } };
  put(root, ".claude/pipeline-state.json", JSON.stringify(state));
  put(root, "evidence/close-request.json", JSON.stringify({ schema: "pipeline.continuity-close.v0", featureId: "audit-feature", expectedRevision: 1, result: state.continuity.authority.result, closeEvidence: { path: "evidence/close.txt", sha256: sha(readFileSync(join(root, "evidence/close.txt"))) } }));
  return { root, candidate, lifecycle, statePath: join(root, ".claude/pipeline-state.json") };
}
function prepare(t) {
  const f = fixture(t); const lifecycle = "close-audit";
  const start = invoke(f.root, ["plan-start", "--root", f.root, "--lifecycle", lifecycle, "--actor", "PO", "--close-intent", "durable-stop"]); invokeAction(f.root, start.nextAction);
  const checkpoint = invoke(f.root, ["plan-transition", "--root", f.root, "--lifecycle", lifecycle, "--actor", "PO", "--phase", "checkpointed"]); invokeAction(f.root, checkpoint.nextAction);
  const plan = invoke(f.root, ["plan-transition", "--root", f.root, "--lifecycle", lifecycle, "--actor", "PO", "--phase", "feature-close-prepared", "--architecture-impact", "no-architecture-impact", "--continuity-close-request", "evidence/close-request.json", "--audit-request", "evidence/audit-request.json", "--critic-verify-lifecycle", f.lifecycle.receipt.id]);
  const applied = invokeAction(f.root, plan.nextAction);
  return { ...f, plan, applied };
}
test("coordinator builds the README audit bundle and forwards only a readback-bound Critic/Verify ID", t => {
  const f = prepare(t);
  assert.equal(existsSync(join(f.root, "audit-bundles", "audit-feature", f.candidate.commit, "README.md")), true);
  assert.equal(f.applied.nextAction.argv.at(f.applied.nextAction.argv.indexOf("--critic-verify-lifecycle") + 1), f.lifecycle.receipt.id);
  const closed = invokeAction(f.root, f.applied.nextAction);
  assert.match(closed, /Feature "audit-feature" closed/);
  const state = JSON.parse(readFileSync(f.statePath));
  assert.equal(state.closedFeatures.at(-1).auditReference.criticVerifyLifecycleId, f.lifecycle.receipt.id);
});
test("forged private lifecycle Critic fields cannot qualify feature close", t => {
  const f = fixture(t);
  const target = join(f.root, ".git", "agent-pipeline", "critic-verify-lifecycle",
    `${f.lifecycle.receipt.id}.json`);
  const forged = { ...f.lifecycle.receipt,
    critic: { ...f.lifecycle.receipt.critic, verdictSha256: h("9") } };
  writeFileSync(target, `${JSON.stringify(forged)}\n`);
  const start = invoke(f.root, ["plan-start", "--root", f.root,
    "--lifecycle", "close-forged", "--actor", "PO", "--close-intent", "durable-stop"]);
  invokeAction(f.root, start.nextAction);
  const checkpoint = invoke(f.root, ["plan-transition", "--root", f.root,
    "--lifecycle", "close-forged", "--actor", "PO", "--phase", "checkpointed"]);
  invokeAction(f.root, checkpoint.nextAction);
  const blocked = invoke(f.root, ["plan-transition", "--root", f.root,
    "--lifecycle", "close-forged", "--actor", "PO", "--phase", "feature-close-prepared",
    "--architecture-impact", "no-architecture-impact",
    "--continuity-close-request", "evidence/close-request.json",
    "--audit-request", "evidence/audit-request.json",
    "--critic-verify-lifecycle", f.lifecycle.receipt.id], 2);
  assert.equal(blocked.code, "CVL-CRITIC-DRIFT");
  assert.equal(existsSync(join(f.root, "audit-bundles")), false);
});
test("finish-feature drives the real coordinator and State writer through verified bundle readback", t => {
  const f = fixture(t);
  const call = spawnSync(process.execPath, [FINISH, "--root", f.root, "--by", "PO",
    "--architecture-impact", "no-architecture-impact", "--audit-request", "evidence/audit-request.json",
    "--critic-verify-lifecycle", f.lifecycle.receipt.id,
    "--continuity-close-request", "evidence/close-request.json"], {
    cwd: f.root, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: f.root },
  });
  assert.equal(call.status, 0, call.stderr || call.stdout);
  const result = JSON.parse(call.stdout);
  assert.equal(result.status, "closed");
  assert.match(result.lifecycleId, /^audit-feature-[a-f0-9]{24}$/u);
  assert.equal(existsSync(join(f.root, "audit-bundles", "audit-feature", f.candidate.commit, "README.md")), true);
  const state = JSON.parse(readFileSync(f.statePath));
  assert.equal(state.closedFeatures.at(-1).auditReference.criticVerifyLifecycleId, f.lifecycle.receipt.id);
});
test("finish-feature resumes a prepared real close without duplicating the audit bundle", t => {
  const f = prepare(t);
  const original = readFileSync(join(f.root, "audit-bundles", "audit-feature", f.candidate.commit, "README.md"));
  const result = finishFeature({ rootDir: f.root, by: "PO", architectureImpact: "no-architecture-impact",
    auditRequest: "evidence/audit-request.json", criticVerifyLifecycle: f.lifecycle.receipt.id,
    continuityCloseRequest: "evidence/close-request.json", resumeLifecycleId: "close-audit" });
  assert.equal(result.status, "closed");
  assert.equal(result.coordinator.status, "replayed");
  assert.deepEqual(readFileSync(join(f.root, "audit-bundles", "audit-feature", f.candidate.commit, "README.md")), original);
  assert.equal(JSON.parse(readFileSync(f.statePath)).closedFeatures.length, 1);
});
test("finish-feature recovers a lost final response from real closed State without duplicating effects", t => {
  const f = fixture(t);
  const input = { rootDir: f.root, by: "PO", architectureImpact: "no-architecture-impact",
    auditRequest: "evidence/audit-request.json", criticVerifyLifecycle: f.lifecycle.receipt.id,
    continuityCloseRequest: "evidence/close-request.json" };
  const first = finishFeature({ ...input, lifecycleId: "close-audit" });
  assert.equal(first.status, "closed");
  const stateBefore = readFileSync(f.statePath);
  const bundlePath = join(f.root, "audit-bundles", "audit-feature", f.candidate.commit, "README.md");
  const bundleBefore = readFileSync(bundlePath);
  const replay = spawnSync(process.execPath, [FINISH, "--root", f.root, "--by", "PO",
    "--architecture-impact", "no-architecture-impact", "--audit-request", input.auditRequest,
    "--critic-verify-lifecycle", input.criticVerifyLifecycle,
    "--continuity-close-request", input.continuityCloseRequest,
    "--resume-lifecycle-id", "close-audit"], {
    cwd: f.root, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: f.root },
  });
  assert.equal(replay.status, 0, replay.stderr || replay.stdout);
  const recovered = JSON.parse(replay.stdout);
  assert.equal(recovered.status, "closed");
  assert.equal(recovered.closeOutput, "already-closed");
  assert.deepEqual(readFileSync(f.statePath), stateBefore);
  assert.deepEqual(readFileSync(bundlePath), bundleBefore);
  assert.equal(JSON.parse(stateBefore).closedFeatures.length, 1);
  assert.throws(() => finishFeature({ ...input, by: "Different actor", resumeLifecycleId: "close-audit" }),
    error => error.code === "FINISH-RESUME-CLOSED-MISMATCH");
  assert.deepEqual(readFileSync(f.statePath), stateBefore);
});
test("altered public Verify bytes after preparation refuse the final State close without mutation", t => {
  const f = prepare(t); const before = readFileSync(f.statePath);
  put(f.root, "specs/audit-feature/verify.json", JSON.stringify({ schema: "pipeline.verify-evidence.v0", exitCode: 0, candidate: f.candidate, forged: true }));
  const result = spawnSync(process.execPath, f.applied.nextAction.argv, { cwd: f.root, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: f.root } });
  assert.equal(result.status, 2);
  assert.deepEqual(readFileSync(f.statePath), before);
});
test("the exact prepared transition is replayable only after its private audit and Critic/Verify readback still match", t => {
  const f = prepare(t);
  const replay = invokeAction(f.root, f.plan.nextAction);
  assert.equal(replay.status, "replayed");
  assert.equal(replay.nextAction.argv.at(replay.nextAction.argv.indexOf("--critic-verify-lifecycle") + 1), f.lifecycle.receipt.id);
  assert.equal(existsSync(join(f.root, "audit-bundles", "audit-feature", f.candidate.commit, "README.md")), true);
});
test("a new candidate after preparation refuses final State close without mutation", t => {
  const f = prepare(t); const before = readFileSync(f.statePath);
  git(f.root, ["commit", "--allow-empty", "-qm", "late candidate drift"]);
  const result = spawnSync(process.execPath, f.applied.nextAction.argv, { cwd: f.root, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: f.root } });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /FCA-CANDIDATE-CHANGED/);
  assert.deepEqual(readFileSync(f.statePath), before);
});
