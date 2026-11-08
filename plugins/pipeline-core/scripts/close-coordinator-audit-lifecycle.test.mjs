// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { recordCriticVerifyLifecycle } from "../lib/critic-verify-lifecycle.mjs";
import * as organizationPolicy from "../lib/organization-policy.mjs";
import { canonicalSha256 } from "../lib/governance-event.mjs";
import { registerGenericCriticBatch } from "../lib/critic-generic-batch.mjs";import { planVerifySelection } from "../lib/verify-selection.mjs";
import { admitSessionCriticReview, finalizeSessionCriticReview, runSessionCriticFinalizerCli } from "./session-critic-finalizer.mjs";
import { preflightCriticDispatchWithAdmitRequest } from "./critic-dispatch-preflight.mjs";
import { finishFeature } from "./finish-feature.mjs";
import { readConsumedCandidateReceipt } from "../lib/critic-packet-preflight-read.mjs";
import { CRITIC_ACKNOWLEDGEMENT_KIND, criticAcknowledgementSubject } from "../lib/critic-acknowledgement.mjs";
import { writeCriticalApproval } from "../lib/critical-action-authorization.mjs";

const ROOT = process.cwd();
const CLI = new URL("./close-coordinator.mjs", import.meta.url).pathname;
const NATIVE_HOOK = new URL("../hooks/native-goldfish-host.mjs", import.meta.url).pathname;
const MERGE = new URL("./critic-split-merge.mjs", import.meta.url).pathname;
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
// The audit request's `packs` default is today's full pack object; a case may substitute its own array
// (D229: the request may NAME the shipped core baseline pack instead of carrying a pack object).
const FIXTURE_PACK = { schema: "pipeline.organization-policy-pack.v1", packId: "test-policy", revision: h("5"), compatibility: { minimumCoreVersion: "0.1.0", maximumCoreVersion: "9.0.0" }, governanceFloors: { requireHumanDecisionLedger: true, allowExternalAuthority: false }, documentClasses: [{ class: "security", mode: "controlled-publication", approvalRequired: true }] };
// C19-D2b: the Critic round is finalized with a Source-issued return by default; origin "fallback" asks for the
// caller-authored classification (the finalizer's own opt-in), which the close gate accepts only at rigor 0 and low risk.
const sourceReturn = (query) => ({ schema: "pipeline.session-critic-source-return.v1", issuer: "source", packetId: query.packetId,
  packetDigest: query.packetDigest, claimant: query.claimant, sessionId: query.sessionId, verdictSha256: query.verdictSha256,
  issuedAtMs: 1, expiresAtMs: Date.now() + 3_600_000 });
// G20-72: the approved architecture design of the whole-feature walk (a PRD-named file next to the spec, found by the split).
const SPLIT_DESIGN = { schema: "pipeline.architecture-design.v1", repositoryKind: "greenfield", disposition: { decision: "approved-scoped", scope: ["specs/", "src/"], rationale: "fixture" },
  modules: ["core", "api"].map((id) => ({ id, responsibility: `the ${id} module`, nonResponsibilities: [], ownedPaths: [`src/${id}/**`], publicContracts: [`src/${id}/index.mjs`],
    allowedDependencies: [], authorityEffects: [], verificationEntryPoints: [`tests/${id}.test.mjs`], adrReferences: [] })),
  implementationSurface: ["src/core/index.mjs", "src/api/index.mjs"],
  fitnessModel: { schema: "pipeline.fitness-model.v1", profileId: "fixture", revision: 1, allowedBoundaryCrossings: [], antiFragmentationPolicy: { minimumModuleFiles: 1 } } };
const SPLIT_DESIGN_PRD = `# PRD design\n\n\`\`\`pipeline-architecture-design\n${JSON.stringify(SPLIT_DESIGN, null, 2)}\n\`\`\`\n`;
// G20-72: the real chain for a range above the split bound, with real commands and real state: the preflight prints the split, admit, one Critic stop per entry through the
// real hook entry, the merge script, finalize. Returns nothing; the consumed receipt is what the close reads.
function splitChain(root, review, packetId) {
  const printed = preflightCriticDispatchWithAdmitRequest(review.preflightInput, { env: {} });
  assert.ok(printed.split, "the walk's range is above the split bound");
  const request = structuredClone(printed.admitRequest);
  Object.assign(request, { taskId: review.taskId, projectId: review.projectId, sessionId: review.sessionId, packetId, route: review.route, verdictPath: "evidence/critic-verdict.json", event: null });
  request.review.genericBatchRef = review.genericBatchRef;
  put(root, "scratch/split-request.json", JSON.stringify(request));
  put(root, "scratch/split.json", JSON.stringify(printed.split));
  // The hook entry exits silently outside a governed project; the onboarding consent marker is the smallest real enrolment (untracked, the reviewed range is unchanged).
  put(root, ".agent-pipeline/onboarding-consent.json", JSON.stringify({ schema: "pipeline.onboarding-consent-marker.v1", status: "consent-given-onboarding-incomplete", consentGivenAt: "2026-11-08T10:00:00.000Z" }));
  const run = (argv) => { const result = runSessionCriticFinalizerCli(argv); assert.equal(result.exitCode, 0, JSON.stringify(result.output)); return result.output; };
  run(["admit", "--root", root, "--request", "scratch/split-request.json"]);
  const children = printed.split.entries.map((entry) => [entry.id, { ...review.verdict, deliberately_not_flagged: [`reviewed ${entry.id}`], trajectory_evidence: `${entry.scopeMarker} read the diff of ${entry.id}` }]);
  const argv = [MERGE, "--root", root, "--split", "scratch/split.json", "--out", "evidence/critic-verdict.json"];
  children.forEach(([id, value], index) => {
    const stop = spawnSync(process.execPath, [NATIVE_HOOK, "--runner", "codex"], { encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: root }, input: JSON.stringify({
      hook_event_name: "SubagentStop", session_id: "33333333-aaaa-bbbb-cccc-444444444444", agent_type: "critic", stop_hook_active: false, cwd: root,
      last_assistant_message: `\`\`\`json\n${JSON.stringify(value)}\n\`\`\`\n` }) });
    assert.match(stop.stderr, /Source return issued/u, stop.stderr);
    put(root, `scratch/split-child-${index}.json`, JSON.stringify(value));
    argv.push("--child", `${id}=scratch/split-child-${index}.json`);
  });
  const merged = spawnSync(process.execPath, argv, { encoding: "utf8" });
  assert.equal(merged.status, 0, merged.stderr);
  run(["finalize", "--root", root, "--request", "scratch/split-request.json"]);
}
function fixture(t, { packs = [FIXTURE_PACK], origin = "source", split = false } = {}) {
  mkdirSync(join(ROOT, "scratch/test-tmp"), { recursive: true });
  const root = mkdtempSync(join(ROOT, "scratch/test-tmp/close-audit-lifecycle-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // A non-feature session Critic needs a generic batch over a review unit committed at the base.
  const reviewUnit = { schema: "pipeline.critic-review-unit.v1", kind: "related-fixes", purpose: "Close the audit feature as one delivery",
    specPath: "specs/audit-feature/spec.md", logicalWorkIds: ["AC-1", "AC-2"], criterionIds: ["AC-1", "AC-2"],
    deliveryBoundary: { mainRef: "refs/heads/main" }, singletonRationale: null };
  for (const [path, text] of [["specs/audit-feature/prd.md", "# PRD\n"], ["specs/audit-feature/spec.md", "# Spec\nAC-1 AC-2\n"], ["specs/audit-feature/result.md", "# Result\n"], ["specs/review-unit.json", JSON.stringify(reviewUnit)], ["evidence/close.txt", "close\n"], ["docs/state.md", "# State\n"]]) put(root, path, text);
  if (split) put(root, "specs/audit-feature/prd-design.md", SPLIT_DESIGN_PRD);
  mkdirSync(join(root, ".claude"));
  git(root, ["init", "-q", "-b", "main"]); git(root, ["add", "."]); git(root, ["commit", "-qm", "base"]);
  const baseCommit = git(root, ["rev-parse", "HEAD"]);
  put(root, "specs/audit-feature/spec.md", "# Spec\nQualified candidate\n");
  put(root, ".claude/pipeline.yaml", "schema: pipeline.manifest.v0\n");
  if (split) for (const dir of ["core", "api"]) for (let index = 0; index < 14; index += 1) put(root, `src/${dir}/m${index}.mjs`, `export const m${index} = ${index};\n`);
  git(root, ["add", "specs/audit-feature/spec.md", ".claude/pipeline.yaml", ...(split ? ["src"] : [])]);
  git(root, ["commit", "-qm", "work"]);
  const work = git(root, ["rev-parse", "HEAD"]);
  // The authored record is committed between the base and the reviewed candidate, as the batch producer reads it.
  put(root, "evidence/dispatch-record-close-audit-review.json", JSON.stringify({
    schema: "pipeline.dispatch-record.v3", taskId: "close-audit-review",
    agentType: "default", model: "gpt-5.6-luna", effort: "medium",
    rulesetSha: "b7797309cf6abe175fd52b0a8749d82b43714ea0",
    dispatcher: "elephant", outcome: "completed", commits: [work],
    candidateCommit: work, resultSha256: h("a"), log: [{ phase: "verify", toolUseCount: 1 }],
    report: { text: "done", changedFiles: ["specs/audit-feature/spec.md"] },
    criticRequired: { schema: "pipeline.critic-required-decision.v1",
      trigger: { schema: "pipeline.critic-trigger-input.v1", rigorLevel: 2,
        riskClass: "high", riskFlag: true,
        diff: { mechanical: false, architecture: false, guardrails: true, security: false } },
      appliedRow: "T1" },
  }));
  git(root, ["add", "evidence/dispatch-record-close-audit-review.json"]);
  git(root, ["commit", "-qm", "persist authored dispatch record"]);
  const candidate = { commit: git(root, ["rev-parse", "HEAD"]), tree: git(root, ["rev-parse", "HEAD^{tree}"]) };
  const prd = readFileSync(join(root, "specs/audit-feature/prd.md")); const spec = readFileSync(join(root, "specs/audit-feature/spec.md")); const result = readFileSync(join(root, "specs/audit-feature/result.md"));
  const verify = { schema: "pipeline.verify-evidence.v0", commit: candidate.commit, tree: candidate.tree, candidate, exitCode: 0, selection: planVerifySelection({ mode: "candidate", candidateCommit: candidate.commit, registeredSuiteIds: ["test"], policy: { schema: "pipeline.verify-selection.v1", baseline: ["test"], areas: [{ id: "all", paths: ["**"], suites: ["test"] }] } }) };
  put(root, "specs/audit-feature/verify.json", JSON.stringify(verify)); put(root, "specs/audit-feature/acceptance.md", "# Acceptance\n");
  const artifacts = [["prd", "specs/audit-feature/prd.md", prd], ["spec", "specs/audit-feature/spec.md", spec], ["result", "specs/audit-feature/result.md", result], ["acceptance", "specs/audit-feature/acceptance.md", readFileSync(join(root, "specs/audit-feature/acceptance.md"))], ["candidate-evidence", "specs/audit-feature/verify.json", readFileSync(join(root, "specs/audit-feature/verify.json"))]].map(([kind, path, bytes]) => ({ class: kind, path, sha256: sha(bytes), authority: kind === "prd" || kind === "spec", mutability: kind === "candidate-evidence" ? "immutable" : "mutable", retention: "active" }));
  put(root, "specs/audit-feature/lifecycle.json", JSON.stringify({ schema: "pipeline.feature-package.v1", feature: { id: "audit-feature", rigor: 1 }, state: "completed", artifacts, candidate, supersedes: null }));
  const common = git(root, ["rev-parse", "--git-common-dir"]);
  const criticPacketId = "1".repeat(32);
  const criticDiagnostic = { schema: "pipeline.verify-evidence.v0", commit: candidate.commit,
    tree: candidate.tree, candidate, exitCode: 0,
    selection: planVerifySelection({ mode: "critic", baseCommit, candidateCommit: candidate.commit,
      changedPaths: split ? git(root, ["diff", "--name-only", baseCommit, candidate.commit]).split("\n") : [".claude/pipeline.yaml", "evidence/dispatch-record-close-audit-review.json", "specs/audit-feature/spec.md"],
      registeredSuiteIds: ["test"], policy: { schema: "pipeline.verify-selection.v1",
        baseline: ["test"], areas: [{ id: "all", paths: ["**"], suites: ["test"] }] } }),
    steps: [{ name: "test", exitCode: 0 }] };
  put(root, "evidence/critic-diagnostic.json", JSON.stringify(criticDiagnostic));
  const review = { preflightInput: { root, base: baseCommit,
    candidate: candidate.commit, specPath: "specs/audit-feature/spec.md",
    guardrailPaths: [".claude/pipeline.yaml"], evidencePaths: ["evidence/critic-diagnostic.json"],
    priorCriticEvidencePath: null }, taskId: "close-audit-review",
    projectId: "fixture", sessionId: "close-review-1", packetId: criticPacketId,
    route: { routeId: "session-critic", runner: "codex",
      adapter: "session-functional-equivalent", provider: "openai",
      modelTier: "higher-capability", effortTier: "xhigh" },
    verdict: { findings: [], deliberately_not_flagged: ["fixture"],
      trajectory_verdict: "consistent", trajectory_evidence: "fixture evidence",
      briefing_violations: [], pass: true } };
  const controlRoot = join(root, common, "agent-pipeline", "critic-packets");
  mkdirSync(controlRoot, { recursive: true, mode: 0o700 });
  chmodSync(join(root, common, "agent-pipeline"), 0o700);
  chmodSync(controlRoot, 0o700);
  const batch = registerGenericCriticBatch({ repoRoot: root, controlRoot, declaration: {
    taskId: "close-audit-review", baseCommit, candidateCommit: candidate.commit, logicalWorkIds: ["AC-1", "AC-2"],
    specPath: "specs/audit-feature/spec.md", guardrailPaths: [".claude/pipeline.yaml"], signedQualityImportAnchor: null, reviewUnitPath: "specs/review-unit.json" } });
  review.genericBatchRef = { ...batch.batchRef, memberSha256: batch.memberSha256 };
  if (split) splitChain(root, review, criticPacketId);
  else {
    admitSessionCriticReview(review);
    if (origin === "fallback") finalizeSessionCriticReview({ ...review, allowCallerAuthoredFallback: true });
    else finalizeSessionCriticReview(review, { readOriginalSourceReturnFn: sourceReturn });
  }
  const lifecycle = recordCriticVerifyLifecycle({ gitCommonDir: join(root, common),
    criticPacketId, candidate, evidencePath: "specs/audit-feature/verify.json", evidence: verify });
  const request = { schema: "pipeline.feature-close-audit-request.v1", manifestPath: "specs/audit-feature/lifecycle.json", coreVersion: "0.7.0", packs, criticVerifyLifecycleId: lifecycle.receipt.id };
  put(root, "evidence/audit-request.json", JSON.stringify(request));
  const state = { schema: "pipeline.state.v0", planApproved: true, activeFeature: { id: "audit-feature", planPath: "specs/audit-feature/prd.md", phase: "implementation" }, planApproval: { poGateAuthority: { planSha256: sha(prd), specPath: "specs/audit-feature/spec.md", specSha256: sha(spec) } }, continuity: { schema: "pipeline.continuity.v0", featureId: "audit-feature", runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator" }, revision: 1, authority: { prd: { path: "specs/audit-feature/prd.md", sha256: sha(prd) }, spec: { path: "specs/audit-feature/spec.md", sha256: sha(spec) }, result: { path: "specs/audit-feature/result.md", sha256: sha(result) } }, queueHead: { packageId: "close-package", actionId: "close-action", nextAction: "close", dispatch: null, productRetryCount: 0, environmentRerouteCount: 0 }, blocker: null, decisionTxn: null, acknowledgedFinal: null, resume: { mode: "immediate", sourceRevision: 1, reasonCode: "active-turn" }, recovery: null, capacity: { concurrencyLimit: 3, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" } } };
  put(root, ".claude/pipeline-state.json", JSON.stringify(state));
  put(root, "evidence/close-request.json", JSON.stringify({ schema: "pipeline.continuity-close.v0", featureId: "audit-feature", expectedRevision: 1, result: state.continuity.authority.result, closeEvidence: { path: "evidence/close.txt", sha256: sha(readFileSync(join(root, "evidence/close.txt"))) } }));
  return { root, candidate, lifecycle, statePath: join(root, ".claude/pipeline-state.json") };
}
function prepare(t, options) {
  const f = fixture(t, options); const lifecycle = "close-audit";
  const start = invoke(f.root, ["plan-start", "--root", f.root, "--lifecycle", lifecycle, "--actor", "PO", "--close-intent", "durable-stop"]); invokeAction(f.root, start.nextAction);
  const checkpoint = invoke(f.root, ["plan-transition", "--root", f.root, "--lifecycle", lifecycle, "--actor", "PO", "--phase", "checkpointed"]); invokeAction(f.root, checkpoint.nextAction);
  const plan = invoke(f.root, ["plan-transition", "--root", f.root, "--lifecycle", lifecycle, "--actor", "PO", "--phase", "feature-close-prepared", "--architecture-impact", "no-architecture-impact", "--continuity-close-request", "evidence/close-request.json", "--audit-request", "evidence/audit-request.json", "--critic-verify-lifecycle", f.lifecycle.receipt.id]);
  const applied = invokeAction(f.root, plan.nextAction);
  return { ...f, plan, applied };
}
// Plan the feature-close-prepared transition without applying it, optionally expecting a refusal.
function planPrepared(f, status = 0) {
  const lifecycle = "close-audit";
  const start = invoke(f.root, ["plan-start", "--root", f.root, "--lifecycle", lifecycle, "--actor", "PO", "--close-intent", "durable-stop"]); invokeAction(f.root, start.nextAction);
  const checkpoint = invoke(f.root, ["plan-transition", "--root", f.root, "--lifecycle", lifecycle, "--actor", "PO", "--phase", "checkpointed"]); invokeAction(f.root, checkpoint.nextAction);
  return invoke(f.root, ["plan-transition", "--root", f.root, "--lifecycle", lifecycle, "--actor", "PO", "--phase", "feature-close-prepared", "--architecture-impact", "no-architecture-impact", "--continuity-close-request", "evidence/close-request.json", "--audit-request", "evidence/audit-request.json", "--critic-verify-lifecycle", f.lifecycle.receipt.id], status);
}
const requestPath = (f) => join(f.root, "evidence/audit-request.json");
const auditReceipt = (f) => JSON.parse(readFileSync(join(f.root, ".git", "agent-pipeline", "publication-close", "close-audit", "evidence", "feature-close-audit.json"), "utf8"));
// D229 (2026-11-01), written from the decision before the implementation: a consumer without an organization
// policy names the shipped core baseline pack in its audit request and closes on the audit route.
// C19-D2b (PO 2026-11-03), written from the decision before the implementation (AC-108 closest accepted criterion).
test("D2b a caller-authored Critic verdict is refused CLOSE-CRITIC-CALLER-AUTHORED at rigor 1, naming the packet, the rigor and the repair", t => {
  const f = fixture(t, { origin: "fallback" });
  const refused = planPrepared(f, 2);
  assert.equal(refused.code, "CLOSE-CRITIC-CALLER-AUTHORED");
  // Restated 2026-11-07 (G20-39, QG-04, same strictness): the old repair ("finalize WITHOUT the fallback") was not runnable, because finalizing
  // without the flag is exactly what produces the fallback label. The refusal now names the one runnable repair, the PO acknowledgement command.
  assert.match(refused.message ?? JSON.stringify(refused), new RegExp(`${"1".repeat(32)}[\\s\\S]*rigor 1[\\s\\S]*approve-critic-acknowledgement --by <name> --critic-packet ${"1".repeat(32)}`, "iu"));
  assert.equal(existsSync(join(f.root, "audit-bundles")), false);
});
// G20-39 (AC-108): the acknowledgement is recorded the way the command records it (same private store, same record shape); the command itself is walked in close-path-e2e.
function acknowledge(f, overrides = {}, packetId = "1".repeat(32)) {
  const { receipt } = readConsumedCandidateReceipt({ controlRoot: join(f.root, ".git", "agent-pipeline", "critic-packets"), packetId });
  const subject = criticAcknowledgementSubject({ packetId, receipt });
  const approval = { approvedBy: "Fixture PO", approvedAt: "2026-11-07T10:00:00.000Z", forCommit: receipt.candidate.commit, forTree: receipt.candidate.tree, packetId,
    criticReceiptSha256: subject.criticReceiptSha256, independence: subject.independence, criticalProof: null, ...overrides };
  assert.equal(writeCriticalApproval({ gitCommonDir: join(f.root, ".git"), kind: CRITIC_ACKNOWLEDGEMENT_KIND, approval }).ok, true);
}
test("G20-39 an acknowledged caller-authored Critic admits the identical close at rigor 1, and the receipt keeps the caller-authored label", t => {
  const f = fixture(t, { origin: "fallback" });
  assert.equal(planPrepared(f, 2).code, "CLOSE-CRITIC-CALLER-AUTHORED");
  acknowledge(f);
  const plan = invoke(f.root, ["plan-transition", "--root", f.root, "--lifecycle", "close-audit", "--actor", "PO", "--phase", "feature-close-prepared", "--architecture-impact", "no-architecture-impact", "--continuity-close-request", "evidence/close-request.json", "--audit-request", "evidence/audit-request.json", "--critic-verify-lifecycle", f.lifecycle.receipt.id]);
  invokeAction(f.root, plan.nextAction);
  const { receipt } = readConsumedCandidateReceipt({ controlRoot: join(f.root, ".git", "agent-pipeline", "critic-packets"), packetId: "1".repeat(32) });
  assert.equal(receipt.independence, "caller-authored-fallback");
  assert.equal(existsSync(join(f.root, "audit-bundles", "audit-feature", f.candidate.commit, "README.md")), true);
});
test("G20-39 an acknowledgement for another packet, another receipt or another candidate never admits the close; nothing is built", t => {
  const f = fixture(t, { origin: "fallback" });
  acknowledge(f, { packetId: "2".repeat(32) });
  acknowledge(f, { criticReceiptSha256: "e".repeat(64) });
  acknowledge(f, { forCommit: "d".repeat(40) });
  acknowledge(f, { forTree: "c".repeat(40) });
  const refused = planPrepared(f, 2);
  assert.equal(refused.code, "CLOSE-CRITIC-CALLER-AUTHORED");
  assert.equal(existsSync(join(f.root, "audit-bundles")), false);
});
test("D2b a Source-issued Critic verdict closes at rigor 1 and its consumed receipt says so", t => {
  const f = prepare(t);
  const { receipt } = readConsumedCandidateReceipt({ controlRoot: join(f.root, ".git", "agent-pipeline", "critic-packets"), packetId: "1".repeat(32) });
  assert.equal(receipt.independence, "source-issued-origin");
  assert.equal(existsSync(join(f.root, "audit-bundles", "audit-feature", f.candidate.commit, "README.md")), true);
});
// G20-72 (candidate 20e, AC-108), the whole chain with real commands and real state: preflight prints the split, admit, one Critic stop per entry through the real hook
// entry, the merge script, finalize, the receipt verifies, and the feature close accepts the source-issued label at rigor 1 and high risk with NO PO acknowledgement.
test("G20-72 a whole-feature Critic round split per module closes at rigor 1 and high risk with no PO acknowledgement; its receipt is source-issued and carries the split digest", t => {
  const f = prepare(t, { split: true });
  const { receipt } = readConsumedCandidateReceipt({ controlRoot: join(f.root, ".git", "agent-pipeline", "critic-packets"), packetId: "1".repeat(32) });
  assert.equal(receipt.independence, "source-issued-origin");
  assert.match(receipt.splitSha256, /^[a-f0-9]{64}$/u);
  assert.equal(existsSync(join(f.root, "audit-bundles", "audit-feature", f.candidate.commit, "README.md")), true, "the identical close built the audit bundle");
});
test("D229 an audit request that names the shipped core baseline pack plans, builds the README audit bundle with that pack in the effective policy and closes", t => {
  const f = prepare(t, { packs: ["pipeline-core-baseline"] });
  // The request bytes keep the NAME; only the plan and its stored options carry the resolved pack object.
  assert.deepEqual(JSON.parse(readFileSync(requestPath(f), "utf8")).packs, ["pipeline-core-baseline"]);
  const bundle = join(f.root, "audit-bundles", "audit-feature", f.candidate.commit);
  assert.equal(existsSync(join(bundle, "README.md")), true);
  const expected = organizationPolicy.resolveEffectiveOrganizationPolicy({ coreVersion: "0.7.0", packs: [organizationPolicy.CORE_BASELINE_PACK] });
  assert.equal(JSON.parse(readFileSync(join(bundle, "manifest.json"), "utf8")).effectivePolicySha256, canonicalSha256(expected));
  const saved = auditReceipt(f);
  assert.deepEqual(saved.plan.bundlePlan.effectivePolicy.packs.map((entry) => entry.packId), ["pipeline-core-baseline"]);
  assert.equal(saved.plan.bundlePlan.effectivePolicy.packs[0].revision, "6611e7f34e2b330b096dde3ec9f1662c5226bceb2390c96d856f0cd751bd8ee3");
  assert.deepEqual(saved.plan.bundlePlan.effectivePolicy.documentClasses, []);
  const closed = invokeAction(f.root, f.applied.nextAction);
  assert.match(closed, /Feature "audit-feature" closed/);
  assert.equal(JSON.parse(readFileSync(f.statePath)).closedFeatures.at(-1).auditReference.criticVerifyLifecycleId, f.lifecycle.receipt.id);
});
test("D229 a request may name the core baseline pack beside a full pack object; both reach the effective policy", t => {
  const f = prepare(t, { packs: ["pipeline-core-baseline", FIXTURE_PACK] });
  assert.deepEqual(auditReceipt(f).plan.bundlePlan.effectivePolicy.packs.map((entry) => entry.packId), ["pipeline-core-baseline", "test-policy"]);
});
test("D229 a full pack object in the request behaves exactly as before: it reaches the effective policy unchanged", t => {
  const f = prepare(t);
  const policy = auditReceipt(f).plan.bundlePlan.effectivePolicy;
  assert.deepEqual(policy.packs.map((entry) => entry.packId), ["test-policy"]);
  assert.equal(policy.packs[0].revision, h("5"));
  assert.deepEqual(policy.documentClasses.map((entry) => entry.class), ["security"]);
  assert.equal(JSON.parse(readFileSync(requestPath(f), "utf8")).packs[0].packId, "test-policy");
});
test("D229 an unknown pack name or a wrong element type is refused CLOSE-AUDIT-REQUEST naming the known id, and nothing is built", t => {
  const f = fixture(t, { packs: ["pipeline-core-basline"] });
  const unknown = planPrepared(f, 2);
  assert.equal(unknown.code, "CLOSE-AUDIT-REQUEST");
  assert.match(JSON.stringify(unknown), /pipeline-core-baseline/);
  for (const packs of [[7], [null], [["pipeline-core-baseline"]], [true], ["Pipeline-Core-Baseline"], [""], ["pipeline-core-baseline", "other-pack"]]) {
    put(f.root, "evidence/audit-request.json", JSON.stringify({ ...JSON.parse(readFileSync(requestPath(f), "utf8")), packs }));
    const refused = invoke(f.root, ["plan-transition", "--root", f.root, "--lifecycle", "close-audit", "--actor", "PO", "--phase", "feature-close-prepared", "--architecture-impact", "no-architecture-impact", "--continuity-close-request", "evidence/close-request.json", "--audit-request", "evidence/audit-request.json", "--critic-verify-lifecycle", f.lifecycle.receipt.id], 2);
    assert.equal(refused.code, "CLOSE-AUDIT-REQUEST", JSON.stringify(packs));
  }
  assert.equal(existsSync(join(f.root, "audit-bundles")), false);
});
test("D229 there is no default pack: an empty packs array is still FCA-POLICY-REQUIRED and a request without packs keeps its exact-shape refusal", t => {
  const f = fixture(t, { packs: [] });
  assert.equal(planPrepared(f, 2).code, "FCA-POLICY-REQUIRED");
  const { packs, ...withoutPacks } = JSON.parse(readFileSync(requestPath(f), "utf8"));
  assert.deepEqual(packs, []);
  put(f.root, "evidence/audit-request.json", JSON.stringify(withoutPacks));
  const refused = invoke(f.root, ["plan-transition", "--root", f.root, "--lifecycle", "close-audit", "--actor", "PO", "--phase", "feature-close-prepared", "--architecture-impact", "no-architecture-impact", "--continuity-close-request", "evidence/close-request.json", "--audit-request", "evidence/audit-request.json", "--critic-verify-lifecycle", f.lifecycle.receipt.id], 2);
  assert.equal(refused.code, "CLOSE-AUDIT-REQUEST");
  assert.equal(existsSync(join(f.root, "audit-bundles")), false);
});
test("D229 naming the core baseline pack twice is refused as a duplicate pack", t => {
  const f = fixture(t, { packs: ["pipeline-core-baseline", "pipeline-core-baseline"] });
  assert.equal(planPrepared(f, 2).code, "OPP-RESOLVE-DUPLICATE");
  assert.equal(existsSync(join(f.root, "audit-bundles")), false);
});
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
