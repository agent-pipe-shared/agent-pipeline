// SPDX-License-Identifier: SUL-1.0
// Pin: ALF-W3B-CRITIC-CLOSE-GATE (backlog 2026-10-07 "Observed 2026-10-18").
// The close coordinator cannot reach `feature-close-prepared` while one of THIS feature's
// delivery-course dispatch records requires a Critic and carries no matching Critic evidence.
// Records of other or earlier features never block. Every case drives the real coordinator
// process in its own fixture repository (own `git init`) under the OS temp root; nothing here
// touches the checkout under test.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { CRITIC_REQUIRED_SCHEMA, CRITIC_TRIGGER_INPUT_SCHEMA } from "../critic-skip-decision.mjs";
import { CRITIC_DISPOSITION_ADDENDUM_SCHEMA, criticDispositionAddendumPath } from "../critic-disposition-addendum.mjs";
import { readBoundConsumedCriticReceipt, residualFindingId } from "../critic-verify-lifecycle.mjs";
import { writeResidualAcceptanceRecord } from "../critic-verify-readiness.mjs";
import { compileCriticReviewLineage } from "../critic-review-lineage.mjs";
import { sha256Canonical as courseSha256Canonical } from "../review-economy.mjs";
import { canonicalJson as packetCanonicalJson, readConsumedCandidateReceipt, readConsumedCandidateResult } from "../../scripts/critic-packet-preflight.mjs";
import { registerGenericCriticBatch } from "../critic-generic-batch.mjs";
import { reportSha256 } from "../dispatch-record.mjs";
import { planVerifySelection } from "../verify-selection.mjs";
import { admitSessionCriticReview, finalizeSessionCriticReview } from "../../scripts/session-critic-finalizer.mjs";
import { parseCriticDispatchPreflightArgs } from "../../scripts/critic-dispatch-preflight.mjs";
import { addCriticDeltaRequest } from "../feature-package-registration.mjs";
import { produceCriticDiagnostic } from "../critic-diagnostic-producer.mjs";
import { ITEM_QUEUE_SCHEMA, SLICE_QUEUE_SCHEMA, validateSliceQueue } from "../slice-queue.mjs";
import { CURRENT_APPROVAL_SCHEMA, PLAN_SUBMISSION_SCHEMA, sha256CanonicalJson } from "../plan-spec-state-v2.mjs";

const CLI = process.env.G20_CLOSE_CLI ?? fileURLToPath(new URL("../../scripts/close-coordinator.mjs", import.meta.url));
const CANDIDATE = "a".repeat(40);
const FEATURE = "feature";
const COURSE_PATH = "specs/feature/slice-queue.json";
const ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
delete ENV.NODE_TEST_CONTEXT;

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const trigger = (overrides = {}) => ({
  schema: CRITIC_TRIGGER_INPUT_SCHEMA, rigorLevel: 0, riskClass: "low", riskFlag: false,
  diff: { mechanical: false, architecture: false, guardrails: false, security: false }, ...overrides,
});
const required = () => ({ schema: CRITIC_REQUIRED_SCHEMA, trigger: trigger({ rigorLevel: 2 }), appliedRow: "T3" });
const evidenceBytes = '{"verdict":"reviewed"}\n';
const evidenced = (taskId) => ({
  criticEvidence: { schema: "pipeline.critic-evidence-reference.v1", taskId, candidateCommit: CANDIDATE,
    path: `evidence/critic-${taskId}.json`, sha256: sha256(evidenceBytes) },
});
const record = (taskId, disposition) => ({
  schema: "pipeline.dispatch-record.v3", taskId, agentType: "goldfish-implementor", model: "claude-sonnet-5",
  effort: "medium", rulesetSha: "0.6.2+local", dispatcher: "Elephant", candidateCommit: CANDIDATE,
  resultSha256: null, outcome: "in-progress", commits: [], log: [], report: null, ...disposition,
});
const recordFile = (taskId, disposition) => ({ [`evidence/dispatch-record-${taskId}.json`]: json(record(taskId, disposition)) });
const evidenceFile = (taskId) => ({ [`evidence/critic-${taskId}.json`]: evidenceBytes });
const course = (feature, ids) => ({
  schema: SLICE_QUEUE_SCHEMA, feature,
  slices: ids.map((id) => ({ id, title: `slice ${id}`, state: "ready", dependsOn: [], writeScope: [`src/${id}.mjs`],
    readScope: [], tier: "implementor", commitMode: "host-commit", loadClass: "light" })),
});
const courseFile = (feature, ids) => ({ [COURSE_PATH]: json(course(feature, ids)) });

function git(root, args) {
  const result = spawnSync("git", ["-c", "user.name=pin", "-c", "user.email=pin@example.invalid", ...args],
    { cwd: root, encoding: "utf8", shell: false, env: ENV });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

function spawn(executable, argv) {
  const result = spawnSync(executable, argv, { encoding: "utf8", shell: false, env: ENV });
  assert.notEqual(result.stdout, "", `no output (status ${result.status}): ${result.stderr}`);
  return { status: result.status, body: JSON.parse(result.stdout) };
}
const invoke = (args) => spawn(process.execPath, [CLI, ...args]);
const invokeAction = (action) => spawn(action.executable, action.argv);

/** A fixture user repository with an approved active feature, a bound Result and a close request. */
function fixtureRepository(label, files = {}) {
  const root = mkdtempSync(join(tmpdir(), `alf-w3b-${label}-`));
  const paths = { prd: "specs/feature/prd.md", spec: "specs/feature/spec.md", result: "specs/feature/result.md", closeEvidence: "evidence/close.txt" };
  const base = { [paths.prd]: "# PRD\n", [paths.spec]: "# Spec\n", [paths.result]: "# Result\n", [paths.closeEvidence]: "closed resources\n" };
  for (const [path, content] of Object.entries({ ...base, ...files })) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  const prdSha256 = sha256(readFileSync(join(root, paths.prd)));
  const specSha256 = sha256(readFileSync(join(root, paths.spec)));
  const profileSha256 = "a".repeat(64);
  const planSubmission = { schema: PLAN_SUBMISSION_SCHEMA, featureId: FEATURE,
    planPath: paths.prd, planSha256: prdSha256, specPath: paths.spec, specSha256,
    profile: "mini", profileSha256, submittedBy: "fixture", submittedAt: "2026-10-24T00:00:00.000Z" };
  const poGateAuthority = { schema: "pipeline.po-gate-authority.v2", humanFacing: "en",
    sourceSha256: "b".repeat(64), runtimeSha256: "c".repeat(64), receiptSha256: "d".repeat(64),
    repositoryFingerprint: "e".repeat(64), planPath: paths.prd, planSha256: prdSha256,
    specPath: paths.spec, specSha256 };
  const result = { path: paths.result, sha256: sha256(readFileSync(join(root, paths.result))) };
  writeFileSync(join(root, "evidence", "close-request.json"), json({
    schema: "pipeline.continuity-close.v0", featureId: FEATURE, expectedRevision: 7, result,
    closeEvidence: { path: paths.closeEvidence, sha256: sha256(readFileSync(join(root, paths.closeEvidence))) },
  }));
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(join(root, ".claude", "pipeline-state.json"), json({
    schema: "pipeline.state.v0",
    activeFeature: { id: FEATURE, planPath: paths.prd, phase: "implementation" },
    // QG-04: the old positive fixture had no approved submission binding.
    planSubmission,
    planApproved: true,
    planApproval: { schema: CURRENT_APPROVAL_SCHEMA, approvedBy: "fixture", approvedAt: "2026-10-24T00:01:00.000Z",
      submissionSha256: sha256CanonicalJson(planSubmission), profileSha256, poGateAuthority,
      priorInvalidationSha256: null, designApprovalBinding: null, designApproval: null },
    continuity: {
      revision: 7,
      authority: { prd: { path: paths.prd, sha256: prdSha256 }, spec: { path: paths.spec, sha256: specSha256 }, result },
      queueHead: { nextAction: "close", dispatch: null },
      blocker: null,
      decisionTxn: null,
    },
  }));
  git(root, ["init", "-b", "main"]);
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "fixture"]);
  return { root, lifecycle: `close-${label}` };
}

/** The fixture repository with its close lifecycle started and checkpointed. */
function checkpointed(label, files = {}, afterFixture = null) {
  const repo = fixtureRepository(label, files);
  if (afterFixture) afterFixture(repo.root);
  const common = ["--root", repo.root, "--lifecycle", repo.lifecycle, "--actor", "PO"];
  const start = invoke(["plan-start", ...common, "--close-intent", "durable-stop"]);
  assert.equal(start.status, 0, JSON.stringify(start.body));
  assert.equal(invokeAction(start.body.nextAction).body.status, "applied");
  const checkpoint = invoke(["plan-transition", ...common, "--phase", "checkpointed"]);
  assert.equal(checkpoint.status, 0, JSON.stringify(checkpoint.body));
  assert.equal(invokeAction(checkpoint.body.nextAction).body.status, "applied");
  return {
    ...repo,
    planPrepared: (...extra) => invoke(["plan-transition", ...common, "--phase", "feature-close-prepared",
      "--architecture-impact", "architecture-conforms", "--continuity-close-request", "evidence/close-request.json", ...extra]),
    snapshot: () => ({
      state: readFileSync(join(repo.root, ".claude", "pipeline-state.json"), "utf8"),
      coordinator: readFileSync(join(repo.root, ".git", "agent-pipeline", "publication-close", repo.lifecycle, "coordinator.json"), "utf8"),
    }),
  };
}

function assertRefusedForMissingCritic(outcome, { named, notNamed = [] }) {
  assert.equal(outcome.status, 2, JSON.stringify(outcome.body));
  assert.equal(outcome.body.code, "CLOSE-CRITIC-EVIDENCE-MISSING", JSON.stringify(outcome.body));
  for (const id of named) assert.ok(outcome.body.message.includes(id), `the uncovered id ${id} must be named: ${outcome.body.message}`);
  for (const id of notNamed) assert.ok(!outcome.body.message.includes(id), `${id} must not be named: ${outcome.body.message}`);
  assert.ok(/Critic dispatch/u.test(outcome.body.message), `the Critic dispatch must be named as the repair: ${outcome.body.message}`);
}

test("the fixture delivery course is a valid slice queue", () => {
  const validated = validateSliceQueue(course(FEATURE, ["TASK-IN-COURSE", "TASK-SECOND"]));
  assert.equal(validated.ok, true, JSON.stringify(validated.errors));
});

test("(a) this feature's course slice with a required record and no evidence refuses the close with zero mutation", () => {
  const repo = checkpointed("a", {
    ...courseFile(FEATURE, ["TASK-IN-COURSE"]),
    ...recordFile("TASK-IN-COURSE", { criticRequired: required() }),
  });
  const before = repo.snapshot();
  assertRefusedForMissingCritic(repo.planPrepared(), { named: ["TASK-IN-COURSE"] });
  assert.deepEqual(repo.snapshot(), before, "a refused close preparation must leave State and the coordinator byte-identical");
});

test("(a) the apply step re-checks: a required record that appears after planning refuses the transition", () => {
  const repo = checkpointed("a-apply", courseFile(FEATURE, ["TASK-IN-COURSE"]));
  const planned = repo.planPrepared();
  assert.equal(planned.status, 0, JSON.stringify(planned.body));
  mkdirSync(join(repo.root, "evidence"), { recursive: true });
  for (const [path, content] of Object.entries(recordFile("TASK-IN-COURSE", { criticRequired: required() }))) {
    writeFileSync(join(repo.root, path), content);
  }
  const before = repo.snapshot();
  assertRefusedForMissingCritic(invokeAction(planned.body.nextAction), { named: ["TASK-IN-COURSE"] });
  assert.deepEqual(repo.snapshot(), before, "a refused apply must leave State and the coordinator byte-identical");
});

test("(a) only the uncovered course slice is named", () => {
  const repo = checkpointed("a-named", {
    ...courseFile(FEATURE, ["TASK-OPEN", "TASK-DONE"]),
    ...recordFile("TASK-OPEN", { criticRequired: required() }),
    ...recordFile("TASK-DONE", evidenced("TASK-DONE")),
    ...evidenceFile("TASK-DONE"),
  });
  assertRefusedForMissingCritic(repo.planPrepared(), { named: ["TASK-OPEN"], notNamed: ["TASK-DONE"] });
});

// N33 (D212): the refusal stated a round cap (D190/D199 removed it) and named no command to write the addendum, so an operator holding a
// passed Critic course receipt had no route from the refusal to a satisfied gate.
test("(h) the refusal states the current rule and names the addendum command, with no stale round-cap wording (D212)", () => {
  const repo = checkpointed("h", {
    ...courseFile(FEATURE, ["TASK-IN-COURSE"]),
    ...recordFile("TASK-IN-COURSE", { criticRequired: required() }),
  });
  const refused = repo.planPrepared();
  assertRefusedForMissingCritic(refused, { named: ["TASK-IN-COURSE"] });
  const message = refused.body.message;
  assert.match(message, /node <plugin-root>\/scripts\/dispatch-record-write\.mjs --repo-root <repo-root> --critic-addendum <request\.json>/u);
  assert.match(message, /no round cap/u);
  assert.match(message, /a further correction-diff Critic round is always allowed/u);
  assert.match(message, /reviewed range contains the record's commit/u);
  assert.doesNotMatch(message, /at most three|never another Critic|once spent|Elephant self-verification/u);
});

// N33 A+B (D212): two orchestrator-attested records, one commit each, covered by ONE consumed, passed Critic course receipt whose
// task id is the FIRST delivery's (TASK-ONE), so it covers TASK-TWO only by range. The receipt is a REAL consumed packet (generic batch -> admit -> finalize) under the fixture's
// .git/agent-pipeline/critic-packets, the same machinery the audit-lifecycle test uses; the coordinator reads it with no injection.
const sha = (value) => createHash("sha256").update(value).digest("hex");
const attestedV4 = (taskId, commit) => {
  const text = "Orchestrator-committed hand-back.";
  return { schema: "pipeline.dispatch-record.v4", runner: "claude", taskId, agentType: "goldfish-implementor", model: "claude-sonnet-5", effort: "medium",
    rulesetSha: "0.6.2+local", dispatcher: "Elephant", candidateCommit: commit, resultSha256: reportSha256(text), outcome: "completed-orchestrator-attested",
    commits: [commit], log: [{ phase: "orchestrator-attested", toolUseCount: 0, note: "tool-use count and worker model not observed" }],
    report: { text, changedFiles: [`src/${taskId}.mjs`] }, criticRequired: required(),
    outcomeClassification: { schema: "pipeline.dispatch-outcome-classification.v1", kind: "orchestrator-attested" },
    attestation: { schema: "pipeline.dispatch-orchestrator-attestation.v1", assurance: "orchestrator-attested", briefingSha256: "1".repeat(64), handbackSha256: "2".repeat(64) } };
};
/** afterFixture hook: history P0 <- base <- R1 <- R2 <- candidate; a passed course Critic over (base, candidate]; both records; both addenda. */
const attestedWithCourseReceipt = ({ secondInsideRange }) => (root) => {
  const put = (path, text) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); };
  const commit = (message, paths) => { git(root, ["add", "--", ...paths]); git(root, ["commit", "-m", message]); return git(root, ["rev-parse", "HEAD"]); };
  put("src/before.mjs", "export const before = 1;\n");
  const beforeBase = commit("before the reviewed range", ["src/before.mjs"]);
  put("specs/critic/spec.md", "# Spec\nAC-1 AC-2\n");
  put(".claude/pipeline.yaml", "schema: pipeline.manifest.v0\n");
  put("specs/review-unit.json", JSON.stringify({ schema: "pipeline.critic-review-unit.v1", kind: "related-fixes", purpose: "Close the feature as one delivery",
    specPath: "specs/critic/spec.md", logicalWorkIds: ["AC-1", "AC-2"], criterionIds: ["AC-1", "AC-2"], deliveryBoundary: { mainRef: "refs/heads/main" }, singletonRationale: null }));
  const baseCommit = commit("reviewed range base", ["specs/critic/spec.md", ".claude/pipeline.yaml", "specs/review-unit.json"]);
  put("src/TASK-ONE.mjs", "export const one = 1;\n");
  const first = commit("feat(x): one", ["src/TASK-ONE.mjs"]);
  put("src/TASK-TWO.mjs", "export const two = 2;\n");
  const second = commit("feat(x): two", ["src/TASK-TWO.mjs"]);
  const secondCommit = secondInsideRange ? second : beforeBase;
  const records = { "TASK-ONE": attestedV4("TASK-ONE", first), "TASK-TWO": attestedV4("TASK-TWO", secondCommit) };
  for (const [taskId, value] of Object.entries(records)) put(`evidence/dispatch-record-${taskId}.json`, json(value));
  const candidate = (() => { commit("persist the attested dispatch records", Object.keys(records).map((taskId) => `evidence/dispatch-record-${taskId}.json`));
    return { commit: git(root, ["rev-parse", "HEAD"]), tree: git(root, ["rev-parse", "HEAD^{tree}"]) }; })();
  const common = git(root, ["rev-parse", "--git-common-dir"]);
  const controlRoot = join(root, common, "agent-pipeline", "critic-packets");
  mkdirSync(controlRoot, { recursive: true, mode: 0o700 });
  chmodSync(join(root, common, "agent-pipeline"), 0o700);
  chmodSync(controlRoot, 0o700);
  const changedPaths = git(root, ["diff", "--name-only", baseCommit, candidate.commit]).split("\n").filter(Boolean).sort();
  put("evidence/critic-diagnostic.json", JSON.stringify({ schema: "pipeline.verify-evidence.v0", commit: candidate.commit, tree: candidate.tree, candidate, exitCode: 0,
    selection: planVerifySelection({ mode: "critic", baseCommit, candidateCommit: candidate.commit, changedPaths, registeredSuiteIds: ["test"],
      policy: { schema: "pipeline.verify-selection.v1", baseline: ["test"], areas: [{ id: "all", paths: ["**"], suites: ["test"] }] } }),
    steps: [{ name: "test", exitCode: 0 }] }));
  const packetId = "1".repeat(32);
  const review = { preflightInput: { root, base: baseCommit, candidate: candidate.commit, specPath: "specs/critic/spec.md", guardrailPaths: [".claude/pipeline.yaml"],
      evidencePaths: ["evidence/critic-diagnostic.json"], priorCriticEvidencePath: null },
    taskId: "TASK-ONE", projectId: "fixture", sessionId: "close-review-1", packetId,
    route: { routeId: "session-critic", runner: "codex", adapter: "session-functional-equivalent", provider: "openai", modelTier: "higher-capability", effortTier: "xhigh" },
    verdict: { findings: [], deliberately_not_flagged: ["fixture"], trajectory_verdict: "consistent", trajectory_evidence: "fixture evidence", briefing_violations: [], pass: true } };
  const batch = registerGenericCriticBatch({ repoRoot: root, controlRoot, declaration: { taskId: "TASK-ONE", baseCommit, candidateCommit: candidate.commit,
    logicalWorkIds: ["AC-1", "AC-2"], specPath: "specs/critic/spec.md", guardrailPaths: [".claude/pipeline.yaml"], signedQualityImportAnchor: null, reviewUnitPath: "specs/review-unit.json" } });
  review.genericBatchRef = { ...batch.batchRef, memberSha256: batch.memberSha256 };
  admitSessionCriticReview(review);
  finalizeSessionCriticReview({ ...review, allowCallerAuthoredFallback: true });
  const bound = readBoundConsumedCriticReceipt({ gitCommonDir: join(root, common), criticPacketId: packetId, candidate });
  for (const [taskId, value] of Object.entries(records)) {
    const bytes = Buffer.from(json(value));
    const criticBytes = `Independent Critic course review covering ${taskId}.\n`;
    put(`evidence/critic-${taskId}.md`, criticBytes);
    put(criticDispositionAddendumPath(taskId), json({ schema: CRITIC_DISPOSITION_ADDENDUM_SCHEMA, recordPath: `evidence/dispatch-record-${taskId}.json`, recordSha256: sha(bytes),
      taskId, candidateCommit: value.candidateCommit, reviewCandidateCommit: candidate.commit, criticPacketId: packetId, criticReceiptSha256: bound.criticReceiptSha256,
      criticEvidence: { schema: "pipeline.critic-evidence-reference.v1", taskId, candidateCommit: value.candidateCommit, path: `evidence/critic-${taskId}.md`, sha256: sha(criticBytes) } }));
  }
};

test("(i) two orchestrator-attested records covered by one consumed course receipt whose reviewed range contains both commits plan (D212 A+B)", () => {
  const repo = checkpointed("i", courseFile(FEATURE, ["TASK-ONE", "TASK-TWO"]), attestedWithCourseReceipt({ secondInsideRange: true }));
  const planned = repo.planPrepared();
  assert.equal(planned.status, 0, JSON.stringify(planned.body));
  assert.equal(planned.body.phase, "feature-close-prepared");
  assert.equal(invokeAction(planned.body.nextAction).body.status, "applied");
});

test("(i) the same course receipt does not cover a record whose commit lies before the reviewed range: the close names only that record", () => {
  const repo = checkpointed("i-out", courseFile(FEATURE, ["TASK-ONE", "TASK-TWO"]), attestedWithCourseReceipt({ secondInsideRange: false }));
  const before = repo.snapshot();
  assertRefusedForMissingCritic(repo.planPrepared(), { named: ["TASK-TWO"], notNamed: ["TASK-ONE"] });
  assert.deepEqual(repo.snapshot(), before, "a refused close preparation must leave State and the coordinator byte-identical");
});

// N35 (D217 A+B): the consumer's exact acceptance path. A three-round Critic course: round 1 full over (G, C1], rounds 2 and 3 deltas over
// (C1, C2] and (C2, C3]. Both attested records have one commit each, inside (G, C1]. The LAST round is a REAL consumed receipt with reviewPass
// false (two minor findings); the course ended through a PO residual acceptance recorded in the private store, in the repository's committed
// chat approval mode. The three lineage records are registered in specs/critic-course/lifecycle.json at HEAD. The coordinator reads all of
// it with no injection. The receipt's task id is TASK-ONE (the batch needs a task with a dispatch record), so TASK-ONE binds by task-id
// equality and TASK-TWO only through the course chain.
const N35_HASH = (c) => c.repeat(64);
const N35_FINDINGS = [
  { gap: "first missing edge", risk: "failure one", severity: "minor", evidence: "src/fix3.mjs:1", spec_ref: "AC-1" },
  { gap: "second missing edge", risk: "failure two", severity: "minor", evidence: "src/fix3.mjs:2", spec_ref: "AC-2" },
];
const failedCourseWithResidual = ({ residual = "valid", severity = "minor" } = {}) => (root) => {
  const put = (path, text) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); };
  const commit = (message, paths) => { git(root, ["add", "--", ...paths]); git(root, ["commit", "-m", message]); return git(root, ["rev-parse", "HEAD"]); };
  put("src/before.mjs", "export const before = 1;\n");
  commit("before the reviewed range", ["src/before.mjs"]);
  put("specs/critic/spec.md", "# Spec\nAC-1 AC-2\n");
  put(".claude/pipeline.yaml", "schema: pipeline.manifest.v0\n");
  put("specs/review-unit.json", JSON.stringify({ schema: "pipeline.critic-review-unit.v1", kind: "related-fixes", purpose: "Close the feature as one delivery",
    specPath: "specs/critic/spec.md", logicalWorkIds: ["AC-1", "AC-2"], criterionIds: ["AC-1", "AC-2"], deliveryBoundary: { mainRef: "refs/heads/main" }, singletonRationale: null }));
  const genesis = commit("course genesis base", ["specs/critic/spec.md", ".claude/pipeline.yaml", "specs/review-unit.json"]);
  put("src/TASK-ONE.mjs", "export const one = 1;\n");
  const first = commit("feat(x): one", ["src/TASK-ONE.mjs"]);
  put("src/TASK-TWO.mjs", "export const two = 2;\n");
  const second = commit("feat(x): two", ["src/TASK-TWO.mjs"]);
  const records = { "TASK-ONE": attestedV4("TASK-ONE", first), "TASK-TWO": attestedV4("TASK-TWO", second) };
  for (const [taskId, value] of Object.entries(records)) put(`evidence/dispatch-record-${taskId}.json`, json(value));
  const c1 = commit("persist the attested dispatch records", Object.keys(records).map((taskId) => `evidence/dispatch-record-${taskId}.json`));
  put("src/fix2.mjs", "export const fix2 = 2;\n");
  const c2 = commit("fix: round two correction", ["src/fix2.mjs"]);
  put("src/fix3.mjs", "export const fix3 = 3;\n");
  const c3 = commit("fix: round three correction", ["src/fix3.mjs"]);
  const candidate = { commit: c3, tree: git(root, ["rev-parse", "HEAD^{tree}"]) };
  const common = git(root, ["rev-parse", "--git-common-dir"]);
  const controlRoot = join(root, common, "agent-pipeline", "critic-packets");
  mkdirSync(controlRoot, { recursive: true, mode: 0o700 });
  chmodSync(join(root, common, "agent-pipeline"), 0o700);
  chmodSync(controlRoot, 0o700);
  const changedPaths = git(root, ["diff", "--name-only", c2, c3]).split("\n").filter(Boolean).sort();
  put("evidence/critic-diagnostic.json", JSON.stringify({ schema: "pipeline.verify-evidence.v0", commit: c3, tree: candidate.tree, candidate, exitCode: 0,
    selection: planVerifySelection({ mode: "critic", baseCommit: c2, candidateCommit: c3, changedPaths, registeredSuiteIds: ["test"],
      policy: { schema: "pipeline.verify-selection.v1", baseline: ["test"], areas: [{ id: "all", paths: ["**"], suites: ["test"] }] } }),
    steps: [{ name: "test", exitCode: 0 }] }));
  const packetId = "3".repeat(32);
  const findings = N35_FINDINGS.map((finding) => ({ ...finding, severity }));
  const review = { preflightInput: { root, base: c2, candidate: c3, specPath: "specs/critic/spec.md", guardrailPaths: [".claude/pipeline.yaml"],
      evidencePaths: ["evidence/critic-diagnostic.json"], priorCriticEvidencePath: null },
    taskId: "TASK-ONE", projectId: "fixture", sessionId: "close-review-3", packetId,
    route: { routeId: "session-critic", runner: "codex", adapter: "session-functional-equivalent", provider: "openai", modelTier: "higher-capability", effortTier: "xhigh" },
    verdict: { findings, deliberately_not_flagged: ["fixture"], trajectory_verdict: "consistent", trajectory_evidence: "fixture evidence", briefing_violations: [], pass: false } };
  const batch = registerGenericCriticBatch({ repoRoot: root, controlRoot, declaration: { taskId: "TASK-ONE", baseCommit: c2, candidateCommit: c3,
    logicalWorkIds: ["AC-1", "AC-2"], specPath: "specs/critic/spec.md", guardrailPaths: [".claude/pipeline.yaml"], signedQualityImportAnchor: null, reviewUnitPath: "specs/review-unit.json" } });
  review.genericBatchRef = { ...batch.batchRef, memberSha256: batch.memberSha256 };
  admitSessionCriticReview(review);
  finalizeSessionCriticReview({ ...review, allowCallerAuthoredFallback: true });
  const consumed = readConsumedCandidateReceipt({ controlRoot, packetId });
  assert.equal(consumed.receipt.reviewPass, false, "the fixture receipt is a failed receipt");
  const receiptSha = sha256(packetCanonicalJson(consumed.receipt));
  const open = readConsumedCandidateResult({ controlRoot, packetId }).result.verdict.findings;
  const idsOf = (list) => list.map((finding) => ({ id: residualFindingId(finding), severity: finding.severity })).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (residual !== "none") {
    const accepted = residual === "other-findings" ? idsOf(open.slice(0, 1)) : idsOf(open);
    const stored = writeResidualAcceptanceRecord({ gitCommonDir: join(root, common), criticReceiptSha256: receiptSha, consumption: null,
      record: { schema: "pipeline.critic-residual-acceptance.v1", mode: "chat", forCommit: c3, forTree: candidate.tree, candidate, criticReceiptSha256: receiptSha,
        findings: accepted, approvedBy: "PO", approvedAt: "2026-10-31T10:00:00.000Z", criticalProof: null,
        criticalProofWaiver: { kind: "accept-residual-critic-findings", mode: "chat-attributed-unattested", source: "pipeline.user.yaml" },
        humanApproval: { kind: "accept-residual-critic-findings", mode: "chat-attributed-unattested" } } });
    assert.equal(stored.ok, true, JSON.stringify(stored));
  }
  for (const [taskId, value] of Object.entries(records)) {
    const bytes = Buffer.from(json(value));
    const criticBytes = `Independent Critic course review covering ${taskId}.\n`;
    put(`evidence/critic-${taskId}.md`, criticBytes);
    put(criticDispositionAddendumPath(taskId), json({ schema: CRITIC_DISPOSITION_ADDENDUM_SCHEMA, recordPath: `evidence/dispatch-record-${taskId}.json`, recordSha256: sha(bytes),
      taskId, candidateCommit: value.candidateCommit, reviewCandidateCommit: c3, criticPacketId: packetId, criticReceiptSha256: receiptSha,
      criticEvidence: { schema: "pipeline.critic-evidence-reference.v1", taskId, candidateCommit: value.candidateCommit, path: `evidence/critic-${taskId}.md`, sha256: sha(criticBytes) } }));
  }
  // The four registered lineage records of the course (rounds 1-3 and the registration itself at HEAD).
  const path = "src/example.mjs";
  const rounds = [{ base: genesis, head: c1, id: "1".repeat(32) }, { base: c1, head: c2, id: "2".repeat(32) }, { base: c2, head: c3, id: packetId }];
  const delta = { changedPaths: [path], changedBehaviorClaims: ["behavior-one"], priorReceipt: { id: "receipt-1", sha256: N35_HASH("4") },
    pathInvariantMap: { [path]: ["INV-1"] }, pathInvariantMapSha256: courseSha256Canonical({ [path]: ["INV-1"] }), coordinatorImpactConfirmed: true,
    trustBoundaryChanged: false, impactAmbiguous: false };
  const history = [];
  rounds.forEach((round, index) => {
    const packet = { packetId: round.id, request: { projectId: "fixture", taskId: "TASK-ONE", trigger: "T1" },
      candidate: { base: round.base, commit: round.head, tree: git(root, ["rev-parse", `${round.head}^{tree}`]) },
      diff: { base: round.base, commit: round.head, path: ".git/review.diff", bytes: 1, sha256: N35_HASH("5") },
      diffPaths: [path], bindings: { requestSha256: N35_HASH("a"), diffPathsSha256: N35_HASH("b"), governanceSha256: N35_HASH("c") } };
    history.push(compileCriticReviewLineage({ packet, reviewId: `review-${index + 1}`, parent: history.at(-1) ?? null,
      packages: [{ id: "package", subjectSha256: N35_HASH("d"), changedPaths: [path], integrationEdges: ["edge"] }],
      coverage: { changedPaths: [path], acceptanceIds: ["AC-1"], integrationEdges: ["edge"], complete: true, receiptSha256: N35_HASH("e") },
      lane: { laneId: `lane-${index + 1}`, contextSha256: N35_HASH((index + 3).toString(16)), evidenceSha256: N35_HASH((index + 6).toString(16)) },
      verdict: { status: "findings", schemaValid: true, resultSha256: N35_HASH("2"), failure: null },
      findings: [{ id: "finding-1", priorFindingId: index === 0 ? null : "finding-1", severity: "low", status: "open", evidenceSha256: N35_HASH("3") }],
      correction: index === 0 ? null : { commit: round.head, deltaSha256: N35_HASH("5"), impactSha256: courseSha256Canonical(["edge"]) },
      invalidation: { kind: "none", reason: null, evidenceSha256: null },
      reviewAttempt: index === 0 ? { round: 1, correctionCommits: 0, requestedMode: "full" }
        : { round: index + 1, correctionCommits: index, requestedMode: "delta", base: round.base, head: round.head, tree: packet.candidate.tree, ...delta } }));
  });
  const artifacts = history.map((record, index) => {
    const text = `${JSON.stringify(record)}\n`;
    put(`specs/critic-course/evidence/critic-review-${index + 1}.json`, text);
    return { class: "candidate-evidence", path: `specs/critic-course/evidence/critic-review-${index + 1}.json`, sha256: sha(text), authority: false, mutability: "immutable", retention: "retain" };
  });
  // The course lives in its own registered package (the closing feature's package is validated separately by the coordinator); the
  // addendum check derives the course from the packet id, so the feature id need not equal the closing feature.
  put("specs/critic-course/lifecycle.json", `${JSON.stringify({ schema: "pipeline.feature-package.v1", feature: { id: "critic-course", rigor: 1 }, state: "approved", artifacts })}\n`);
  commit("register the Critic course lineage", ["specs/critic-course"]);
};
const N35_USER_CONFIG = { "pipeline.user.yaml": "gates:\n  human_approval: chat\n" };

test("(j) two attested records of round 1 are covered by a course closed through a PO residual acceptance of its last round: the close plans (D217 A+B)", () => {
  const repo = checkpointed("j", { ...courseFile(FEATURE, ["TASK-ONE", "TASK-TWO"]), ...N35_USER_CONFIG }, failedCourseWithResidual());
  const planned = repo.planPrepared();
  assert.equal(planned.status, 0, JSON.stringify(planned.body));
  assert.equal(planned.body.phase, "feature-close-prepared");
  assert.equal(invokeAction(planned.body.nextAction).body.status, "applied");
});

test("(j) a failed last round without a PO residual acceptance never covers the records: the refusal says so and names the accept route (D217 A, C)", () => {
  const repo = checkpointed("j-none", { ...courseFile(FEATURE, ["TASK-ONE", "TASK-TWO"]), ...N35_USER_CONFIG }, failedCourseWithResidual({ residual: "none" }));
  const before = repo.snapshot();
  const refused = repo.planPrepared();
  assertRefusedForMissingCritic(refused, { named: ["TASK-ONE", "TASK-TWO"] });
  assert.match(refused.body.message, /a failed receipt never binds without a PO residual acceptance/u);
  assert.match(refused.body.message, /approve-residual-acceptance/u);
  assert.match(refused.body.message, /course closed by a residual acceptance covers the records of all its registered rounds/u);
  assert.deepEqual(repo.snapshot(), before, "a refused close preparation must leave State and the coordinator byte-identical");
});

test("(j) a residual acceptance bound to another finding set, or a receipt with a non-minor finding, never covers the records (D217 A)", () => {
  for (const options of [{ residual: "other-findings" }, { severity: "major" }]) {
    const repo = checkpointed(`j-${options.residual ?? "major"}`, { ...courseFile(FEATURE, ["TASK-ONE", "TASK-TWO"]), ...N35_USER_CONFIG }, failedCourseWithResidual(options));
    assertRefusedForMissingCritic(repo.planPrepared(), { named: ["TASK-ONE", "TASK-TWO"] });
  }
});

test("(b) the same record with matching Critic evidence plans", () => {
  const repo = checkpointed("b", {
    ...courseFile(FEATURE, ["TASK-IN-COURSE"]),
    ...recordFile("TASK-IN-COURSE", evidenced("TASK-IN-COURSE")),
    ...evidenceFile("TASK-IN-COURSE"),
  });
  const planned = repo.planPrepared();
  assert.equal(planned.status, 0, JSON.stringify(planned.body));
  assert.equal(planned.body.phase, "feature-close-prepared");
  assert.equal(invokeAction(planned.body.nextAction).body.status, "applied");
});

test("(c) a required record without evidence whose id is not in this feature's course plans", () => {
  const repo = checkpointed("c", {
    ...courseFile(FEATURE, ["TASK-IN-COURSE"]),
    ...recordFile("TASK-IN-COURSE", evidenced("TASK-IN-COURSE")),
    ...evidenceFile("TASK-IN-COURSE"),
    ...recordFile("TASK-OF-AN-EARLIER-FEATURE", { criticRequired: required() }),
  });
  const planned = repo.planPrepared();
  assert.equal(planned.status, 0, JSON.stringify(planned.body));
  assert.equal(planned.body.phase, "feature-close-prepared");
});

test("(d) a feature with no delivery course plans, whatever other records exist", () => {
  const repo = checkpointed("d", recordFile("TASK-ANY", { criticRequired: required() }));
  const planned = repo.planPrepared();
  assert.equal(planned.status, 0, JSON.stringify(planned.body));
  assert.equal(planned.body.phase, "feature-close-prepared");
});

test("rigor one close without a delivery course still needs the independent Critic/Verify audit", () => {
  const repo = checkpointed("rigor-one-no-course", {}, (root) => {
    const path = join(root, ".claude", "pipeline-state.json");
    const state = JSON.parse(readFileSync(path, "utf8"));
    state.planSubmission = { ...state.planSubmission, profile: "feature" };
    // Existing v4 approval remains readable: it binds this exact feature
    // submission without introducing a synthetic design-review receipt.
    state.planApproval = { schema: "pipeline.plan-approval.v4", approvedBy: "fixture",
      approvedAt: "2026-10-24T00:01:00.000Z", submissionSha256: sha256CanonicalJson(state.planSubmission),
      profileSha256: state.planSubmission.profileSha256, poGateAuthority: state.planApproval.poGateAuthority,
      priorInvalidationSha256: null };
    writeFileSync(path, json(state));
    git(root, ["add", ".claude/pipeline-state.json"]);
    git(root, ["commit", "-m", "declare rigor one"]);
  });
  const before = repo.snapshot();
  const refused = repo.planPrepared();
  assert.equal(refused.status, 2, JSON.stringify(refused.body));
  assert.equal(refused.body.code, "CLOSE-QUALIFICATION-REQUIRED");
  assert.deepEqual(repo.snapshot(), before);
});

test("(e) an invalid delivery course fails closed with a typed code and zero mutation", () => {
  const repo = checkpointed("e", { [COURSE_PATH]: "{ not json" });
  const before = repo.snapshot();
  const refused = repo.planPrepared();
  assert.equal(refused.status, 2, JSON.stringify(refused.body));
  assert.equal(refused.body.code, "CLOSE-DELIVERY-COURSE-INVALID", JSON.stringify(refused.body));
  assert.deepEqual(repo.snapshot(), before);
});

test("(f) a delivery course that belongs to another feature fails closed rather than scoping the gate", () => {
  const repo = checkpointed("f", {
    ...courseFile("some-other-feature", ["TASK-IN-COURSE"]),
    ...recordFile("TASK-IN-COURSE", { criticRequired: required() }),
  });
  const refused = repo.planPrepared();
  assert.equal(refused.status, 2, JSON.stringify(refused.body));
  assert.equal(refused.body.code, "CLOSE-DELIVERY-COURSE-INVALID", JSON.stringify(refused.body));
});

// D27/D55 (Q1): a background Goldfish slice has no dispatch record, only its trailer commit. The close
// accepts that as its authorship record on the audit route only, never silently.
const itemSlice = (id, baseCommit) => ({
  id, title: `slice ${id}`, state: "ready", dependsOn: [], writeScope: [`src/${id}.mjs`], readScope: ["specs/feature/spec.md"],
  tier: "implementor", commitMode: "host-commit", loadClass: "light",
  delivery: { itemId: id, criteria: ["AC-1"], baseCommit,
    criterionLocator: { schema: "pipeline.critic-criterion-locator.v1", sourcePath: "specs/feature/spec.md", sourceSha256: "c".repeat(64), criterionId: "AC-1", startByte: 0, endByte: 7, excerptSha256: "d".repeat(64) },
    checks: [{ id: `${id}-check`, path: `src/${id}.test.mjs`, dependencies: [`src/${id}.mjs`, `src/${id}.test.mjs`] }], approvalSha256: "e".repeat(64) },
});
const itemCourse = (slices) => ({ schema: ITEM_QUEUE_SCHEMA, feature: FEATURE, slices });
/** After the fixture commit: the course and one orchestrator commit carrying `Dispatch: <id> (goldfish)`. */
const orchestratorCommitted = (id, { trailer = true } = {}) => (root) => {
  const base = git(root, ["rev-parse", "HEAD"]);
  writeFileSync(join(root, COURSE_PATH), json(itemCourse([itemSlice(id, base)])));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", `${id}.mjs`), "export const work = 1;\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "feat(x): background work", ...(trailer ? ["-m", `AI-Assisted: true\nDispatch: ${id} (goldfish)\nCommit-Act: orchestrator`] : [])]);
};

test("(g) the item course fixture is a valid slice queue", () => {
  const validated = validateSliceQueue(itemCourse([itemSlice("TASK-BG", "f".repeat(40))]));
  assert.equal(validated.ok, true, JSON.stringify(validated.errors));
});

test("(g) a course slice recorded only by its orchestrator commit refuses the close off the audit route, naming it and the repair", () => {
  const repo = checkpointed("g", {}, orchestratorCommitted("TASK-BG"));
  const before = repo.snapshot();
  const refused = repo.planPrepared();
  assert.equal(refused.status, 2, JSON.stringify(refused.body));
  assert.equal(refused.body.code, "CLOSE-AUTHORSHIP-COMMIT-ONLY", JSON.stringify(refused.body));
  assert.match(refused.body.message, /TASK-BG/u);
  assert.match(refused.body.message, /--audit-request <path> --critic-verify-lifecycle <id>/u);
  assert.deepEqual(repo.snapshot(), before, "a refused close preparation must leave State and the coordinator byte-identical");
});

test("(g) on the audit route the commit-only slice is accepted and the audit route's own checks decide", () => {
  const repo = checkpointed("g-audit", {}, orchestratorCommitted("TASK-BG"));
  const refused = repo.planPrepared("--audit-request", "evidence/no-such-audit-request.json", "--critic-verify-lifecycle", "0".repeat(64));
  assert.notEqual(refused.body.code, "CLOSE-AUTHORSHIP-COMMIT-ONLY", JSON.stringify(refused.body));
  assert.equal(refused.body.code, "CLOSE-PATH-MISSING", JSON.stringify(refused.body));
  assert.match(refused.body.message, /feature-close audit request does not exist at evidence\/no-such-audit-request\.json/u);
});

test("(g) a slice whose commit carries no Dispatch trailer is not commit-recorded and plans as before", () => {
  const repo = checkpointed("g-none", {}, orchestratorCommitted("TASK-BG", { trailer: false }));
  const planned = repo.planPrepared();
  assert.equal(planned.status, 0, JSON.stringify(planned.body));
  assert.equal(planned.body.phase, "feature-close-prepared");
  // Ordinal-2 Critic F-D: the plan states the slice as unrecorded instead of passing it silently, and the report
  // stays outside the plan digest, so applying the plan is unchanged.
  assert.deepEqual(planned.body.courseAuthorship,
    { schema: "pipeline.close-course-authorship.v1", dispatchRecord: [], orchestratorCommit: [], unrecorded: ["TASK-BG"] });
  assert.equal(invokeAction(planned.body.nextAction).body.status, "applied");
});

// ---------------------------------------------------------------------------------------------------------------------------------
// D223 slice 2: `plan-transition --phase feature-close-prepared` writes the byte-bound Critic addendum for every uncovered record that
// exactly ONE passed (or residual-accepted), consumed Critic receipt or registered Critic course covers, never commits and never stages.
//
// The chain cases below run a consumer fixture through the REAL entry points in order: slice records through `dispatch-record-write
// --attested-request`, every Critic round through `critic-correction-input-bindings derive` -> `critic-dispatch-preflight` -> admission ->
// finalizer (which writes the lineage, slice 1) with the lineage committed as the finalizer's own commit instruction names it, then the
// real `close-coordinator` plan -> commit -> plan -> apply. Seams (named, not hidden): the Critic model call (a fixed verdict handed to
// the finalizer with the source-return origin of the existing suites), the PO residual acceptance (writeResidualAcceptanceRecord in the
// chat approval mode, as the close pins above do), the Critic's own per-round dispatch record, and the end of the close: the walk stops at
// the applied `feature-close-prepared` phase, because `closed-local` needs Verify and cleanup evidence that have nothing to do with the
// Critic course (the walk pin critic-course-consumer-chain-walk.test.mjs stops at the same step).
// ---------------------------------------------------------------------------------------------------------------------------------
const COURSE_FEATURE = "held-feature"; // the Critic course of the consumer (its feature package); FEATURE is the closing feature
const COURSE_SPEC = `specs/${COURSE_FEATURE}/spec.md`;
const COURSE_GUARDRAILS = [".claude/pipeline.yaml", "governance/guidelines/review.md", "governance/policies/checklist.md"];
const SCRIPTS = fileURLToPath(new URL("../../scripts/", import.meta.url));
const w9Put = (root, path, text) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); };
const w9CommitPaths = (root, paths, message) => {
  git(root, paths.length === 1 && paths[0] === "." ? ["add", "--", "."] : ["add", "-f", "--", ...paths]);
  git(root, ["commit", "-qm", message]);
  return git(root, ["rev-parse", "HEAD"]);
};
function w9Cli(script, args) {
  const result = spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { encoding: "utf8", shell: false, env: ENV });
  const text = (result.stdout.trim() !== "" ? result.stdout : result.stderr).trim();
  let body = null;
  try { body = JSON.parse(text.split("\n")[0]); } catch { /* a plain-text refusal */ }
  return { status: result.status, body, text, stderr: result.stderr };
}
const W9_FAIL_MAJOR = { findings: [
  { gap: "major gap one", risk: "consumer breaks", severity: "major", evidence: `${COURSE_SPEC}:1`, spec_ref: "AC-1" },
  { gap: "minor gap one", risk: "small drift", severity: "minor", evidence: `${COURSE_SPEC}:2`, spec_ref: "AC-1" },
  { gap: "minor gap two", risk: "small drift", severity: "minor", evidence: `${COURSE_SPEC}:2`, spec_ref: "AC-1" }], pass: false };
const w9Minors = (tag) => ({ findings: [
  { gap: `minor ${tag} one`, risk: "cosmetic drift", severity: "minor", evidence: `${COURSE_SPEC}:1`, spec_ref: "AC-1" },
  { gap: `minor ${tag} two`, risk: "cosmetic drift", severity: "minor", evidence: `${COURSE_SPEC}:2`, spec_ref: "AC-1" }], pass: false });
const W9_PASS = { findings: [], pass: true };
const w9VerdictOf = (value) => ({ deliberately_not_flagged: ["scope"], trajectory_verdict: "consistent", trajectory_evidence: "candidate evidence inspected", briefing_violations: [], ...value });
const w9Origin = (q) => ({ schema: "pipeline.session-critic-source-return.v1", issuer: "source", packetId: q.packetId, packetDigest: q.packetDigest, claimant: q.claimant, sessionId: q.sessionId, verdictSha256: q.verdictSha256, issuedAtMs: Date.now() - 1000, expiresAtMs: Date.now() + 60000 });
const w9Required = () => ({ schema: "pipeline.critic-required-decision.v1", trigger: { schema: "pipeline.critic-trigger-input.v1", rigorLevel: 2, riskClass: "high", riskFlag: true, diff: { mechanical: false, architecture: false, guardrails: true, security: false } }, appliedRow: "T1" });
const w9PacketIdOf = (round) => `a${round.toString(16)}`.repeat(16);
const w9CommonDir = (root) => join(root, git(root, ["rev-parse", "--git-common-dir"]));
const w9ReceiptSha = (root, packetId) => sha256(packetCanonicalJson(readConsumedCandidateReceipt({ controlRoot: join(w9CommonDir(root), "agent-pipeline", "critic-packets"), packetId }).receipt));
const w9Status = (root) => git(root, ["status", "--porcelain=v1", "--untracked-files=all"]);
const w9Derived = (root) => readdirSync(join(root, "evidence")).filter((name) => /^dispatch-critic-addendum-|^critic-disposition-evidence-/u.test(name)).sort();

/** The closing feature's State, delivery course and close request, as the close pins build them; the State file is gitignored. */
function w9CloseFixtureFiles(root, sliceIds) {
  const paths = { prd: `specs/${FEATURE}/prd.md`, spec: `specs/${FEATURE}/spec.md`, result: `specs/${FEATURE}/result.md`, closeEvidence: "evidence/close.txt" };
  w9Put(root, paths.prd, "# PRD\n"); w9Put(root, paths.spec, "# Spec\n"); w9Put(root, paths.result, "# Result\n"); w9Put(root, paths.closeEvidence, "closed resources\n");
  w9Put(root, COURSE_PATH, json(course(FEATURE, sliceIds)));
  const prdSha256 = sha256(readFileSync(join(root, paths.prd)));
  const specSha256 = sha256(readFileSync(join(root, paths.spec)));
  const profileSha256 = "a".repeat(64);
  const planSubmission = { schema: PLAN_SUBMISSION_SCHEMA, featureId: FEATURE, planPath: paths.prd, planSha256: prdSha256, specPath: paths.spec, specSha256,
    profile: "mini", profileSha256, submittedBy: "fixture", submittedAt: "2026-10-24T00:00:00.000Z" };
  const poGateAuthority = { schema: "pipeline.po-gate-authority.v2", humanFacing: "en", sourceSha256: "b".repeat(64), runtimeSha256: "c".repeat(64), receiptSha256: "d".repeat(64),
    repositoryFingerprint: "e".repeat(64), planPath: paths.prd, planSha256: prdSha256, specPath: paths.spec, specSha256 };
  const result = { path: paths.result, sha256: sha256(readFileSync(join(root, paths.result))) };
  w9Put(root, "evidence/close-request.json", json({ schema: "pipeline.continuity-close.v0", featureId: FEATURE, expectedRevision: 7, result,
    closeEvidence: { path: paths.closeEvidence, sha256: sha256(readFileSync(join(root, paths.closeEvidence))) } }));
  w9Put(root, ".claude/pipeline-state.json", json({ schema: "pipeline.state.v0", activeFeature: { id: FEATURE, planPath: paths.prd, phase: "implementation" },
    planSubmission, planApproved: true,
    planApproval: { schema: CURRENT_APPROVAL_SCHEMA, approvedBy: "fixture", approvedAt: "2026-10-24T00:01:00.000Z", submissionSha256: sha256CanonicalJson(planSubmission), profileSha256, poGateAuthority,
      priorInvalidationSha256: null, designApprovalBinding: null, designApproval: null },
    continuity: { revision: 7, authority: { prd: { path: paths.prd, sha256: prdSha256 }, spec: { path: paths.spec, sha256: specSha256 }, result }, queueHead: { nextAction: "close", dispatch: null }, blocker: null, decisionTxn: null } }));
}

function w9RegisterDiagnostic(root, candidate, tag) {
  const manifestPath = `specs/${COURSE_FEATURE}/lifecycle.json`;
  const logPath = `specs/${COURSE_FEATURE}/evidence/targeted-${tag}.log`, diagnosticPath = `specs/${COURSE_FEATURE}/evidence/diagnostic-${tag}.json`, capturedPath = `evidence/${COURSE_FEATURE}-targeted-${tag}.log`;
  const produced = produceCriticDiagnostic({ root, candidate, specPath: COURSE_SPEC, guardrailPaths: COURSE_GUARDRAILS, command: [process.execPath, "-e", "process.exit(0)"], logPath: capturedPath });
  w9Put(root, logPath, readFileSync(join(root, capturedPath)));
  produced.targeted.log.path = logPath;
  w9Put(root, diagnosticPath, JSON.stringify(produced));
  const manifest = JSON.parse(readFileSync(join(root, manifestPath), "utf8"));
  for (const path of [logPath, diagnosticPath]) manifest.artifacts.push({ class: "candidate-evidence", path, sha256: sha256(readFileSync(join(root, path))), authority: false, mutability: "immutable", retention: "retain" });
  writeFileSync(join(root, manifestPath), JSON.stringify(manifest));
  return { diagnosticPath, registration: w9CommitPaths(root, [manifestPath, logPath, diagnosticPath], `register the ${tag} diagnostic`) };
}

function w9DeltaRequest(root, claims) {
  const base = { changedBehaviorClaims: claims, coordinatorImpactConfirmed: true, trustBoundaryChanged: false, impactAmbiguous: false };
  w9Put(root, "scratch/delta-input.json", JSON.stringify({ ...base, pathInvariantMap: { "placeholder.mjs": ["inv-one"] } }));
  const first = addCriticDeltaRequest({ root, inputPath: "scratch/delta-input.json" });
  assert.equal(first.code, "FPR-DELTA-MAP", JSON.stringify(first));
  w9Put(root, "scratch/delta-input.json", JSON.stringify({ ...base, pathInvariantMap: Object.fromEntries(first.changedPaths.map((path) => [path, ["inv-one"]])) }));
  const added = addCriticDeltaRequest({ root, inputPath: "scratch/delta-input.json" });
  assert.equal(added.status, "delta-request-added", JSON.stringify(added));
  return { added, registration: w9CommitPaths(root, added.commitPaths, "register the delta request") };
}

/** The PO's chat-mode acceptance of exactly the minor findings of one consumed round (seam named in the header above). */
function w9AcceptResidual(root, packetId) {
  const common = w9CommonDir(root);
  const controlRoot = join(common, "agent-pipeline", "critic-packets");
  const consumed = readConsumedCandidateResult({ controlRoot, packetId });
  const findings = consumed.result.verdict.findings.map((finding) => ({ id: residualFindingId(finding), severity: finding.severity })).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const receiptSha = sha256(packetCanonicalJson(consumed.receipt));
  const candidate = { commit: consumed.packet.candidate.commit, tree: git(root, ["rev-parse", `${consumed.packet.candidate.commit}^{tree}`]) };
  const stored = writeResidualAcceptanceRecord({ gitCommonDir: common, criticReceiptSha256: receiptSha, consumption: null,
    record: { schema: "pipeline.critic-residual-acceptance.v1", mode: "chat", forCommit: candidate.commit, forTree: candidate.tree, candidate, criticReceiptSha256: receiptSha, findings,
      approvedBy: "PO", approvedAt: "2026-10-31T10:00:00.000Z", criticalProof: null,
      criticalProofWaiver: { kind: "accept-residual-critic-findings", mode: "chat-attributed-unattested", source: "pipeline.user.yaml" },
      humanApproval: { kind: "accept-residual-critic-findings", mode: "chat-attributed-unattested" } } });
  assert.equal(stored.ok, true, JSON.stringify(stored));
}

/**
 * A consumer repository with a registered Critic course walked to its last round. `rounds` is a list of { verdict, accept }: round 1 is a
 * full round, every later round a delta over the previous round's candidate. `slices` are the task ids whose records are written through
 * the attested route; `earlySlice` is one more slice whose commit precedes the course genesis (it is on no round's range).
 */
function w9Course({ label, rounds, slices, earlySlice = null }) {
  const root = mkdtempSync(join(tmpdir(), `w9add-${label}-`));
  git(root, ["init", "-q", "-b", "main"]);
  w9Put(root, ".claude/pipeline.yaml", "schema: pipeline.manifest.v0\ngovernance:\n  guidelines_path: governance/guidelines\n  policies_path: governance/policies\ngates:\n  push:\n    mode: blocking\n    type: human\n    approval: standing-approved\n");
  w9Put(root, "governance/guidelines/review.md", "Review changed code.\n");
  w9Put(root, "governance/policies/checklist.md", "- verify\n");
  w9Put(root, ".gitignore", "/project/pipeline-state.json\n/.claude/pipeline-state.json\n/scratch/\n/evidence/*-targeted-*.log\n");
  w9Put(root, "project/pipeline.json", json({ handover: "docs/state.md", criticFindingRecordPaths: ["docs/findings.md"] }));
  w9Put(root, "docs/state.md", "state v1\n");
  w9Put(root, "docs/findings.md", "findings quoted here\n");
  w9Put(root, "pipeline.user.yaml", "gates:\n  human_approval: chat\n");
  w9CloseFixtureFiles(root, earlySlice === null ? slices : [earlySlice, ...slices]);
  w9CommitPaths(root, ["."], "base");
  const prefix = `specs/${COURSE_FEATURE}`, manifestPath = `${prefix}/lifecycle.json`, unitPath = `${prefix}/design/critic-review-unit.json`;
  let earlyCommit = null;
  if (earlySlice !== null) {
    w9Put(root, `src/${earlySlice}.mjs`, "export const early = 0;\n");
    earlyCommit = w9CommitPaths(root, [`src/${earlySlice}.mjs`], `feat(x): the slice that precedes the course genesis\n\nAI-Assisted: true\nDispatch: ${earlySlice} (goldfish)`);
  }
  w9Put(root, COURSE_SPEC, "# Complete behavior\nAC-1: deliver complete behavior\n");
  w9Put(root, unitPath, JSON.stringify({ schema: "pipeline.critic-review-unit.v1", kind: "feature-section", purpose: "Deliver one complete behavior", specPath: COURSE_SPEC, logicalWorkIds: ["scope-one", "scope-two"], criterionIds: ["AC-1"], deliveryBoundary: { mainRef: git(root, ["symbolic-ref", "HEAD"]) }, singletonRationale: null }));
  const topo = [["prd", "prd.md", true, "mutable", "active"], ["acceptance", "acceptance.md", false, "mutable", "active"], ["result", "result.md", false, "mutable", "active"], ["candidate-evidence", "evidence/seed.json", false, "immutable", "retain"]].map(([klass, rel, authority, mutability, retention]) => {
    const path = `${prefix}/${rel}`; w9Put(root, path, `${klass}\n`);
    return { class: klass, path, sha256: sha256(readFileSync(join(root, path))), authority, mutability, retention };
  });
  const manifest = { schema: "pipeline.feature-package.v1", feature: { id: COURSE_FEATURE, rigor: 2 }, state: "approved", candidate: null, supersedes: null, artifacts: [
    { class: "spec", path: COURSE_SPEC, sha256: sha256(readFileSync(join(root, COURSE_SPEC))), authority: true, mutability: "mutable", retention: "active" },
    { class: "design", path: unitPath, sha256: sha256(readFileSync(join(root, unitPath))), authority: false, mutability: "immutable", retention: "retain" }, ...topo] };
  w9Put(root, manifestPath, JSON.stringify(manifest));
  const genesis = w9CommitPaths(root, [prefix], "declare feature review unit");
  const sliceCommits = {};
  for (const id of slices) {
    w9Put(root, `src/${id}.mjs`, `export const ${id.replaceAll("-", "_")} = 1;\n`);
    sliceCommits[id] = w9CommitPaths(root, [`src/${id}.mjs`], `feat(x): ${id}\n\nAI-Assisted: true\nDispatch: ${id} (goldfish)`);
  }
  const attestedRecord = (id, commit, allowedPath) => {
    w9Put(root, `scratch/briefing-${id}.md`, `<!-- pipeline-native-goldfish-host-commit:v3\n${JSON.stringify({ schema: "pipeline.native-goldfish-host-briefing.v3", dispatchId: id, candidateCommit: git(root, ["rev-parse", `${commit}^`]), runner: "claude", role: "pipeline-core:goldfish-deep", agentType: "goldfish-deep", model: "sonnet", effort: "high", rulesetSha: "0.7.0+claude.20261031060558.62b553e", allowedPaths: [allowedPath], criticDecision: w9Required() })}\n-->\n`);
    w9Put(root, `scratch/handback-${id}.txt`, `Slice ${id} delivered; host committed.\n`);
    w9Put(root, `scratch/attested-${id}.json`, json({ schema: "pipeline.dispatch-attested-request.v1", briefingPath: `scratch/briefing-${id}.md`, handbackPath: `scratch/handback-${id}.txt`, commits: [commit] }));
    const written = w9Cli("dispatch-record-write.mjs", ["--repo-root", root, "--attested-request", `scratch/attested-${id}.json`]);
    assert.equal(written.status, 0, `attested record ${id}: ${written.text}${written.stderr}`);
  };
  if (earlySlice !== null) attestedRecord(earlySlice, earlyCommit, `src/${earlySlice}.mjs`);
  for (const id of slices) attestedRecord(id, sliceCommits[id], `src/${id}.mjs`);
  w9Put(root, COURSE_SPEC, "# Complete behavior\nAC-1: deliver complete behavior\nImplemented behavior.\n");
  manifest.artifacts[0].sha256 = sha256(readFileSync(join(root, COURSE_SPEC)));
  w9Put(root, manifestPath, JSON.stringify(manifest));
  let head = w9CommitPaths(root, [COURSE_SPEC, manifestPath, ...(earlySlice === null ? [] : [`evidence/dispatch-record-${earlySlice}.json`]), ...slices.map((id) => `evidence/dispatch-record-${id}.json`)], "integrate feature behavior and persist the slice records");

  let previousCandidate = head, lastPacketId = null, lastCandidate = null;
  for (let index = 0; index < rounds.length; index += 1) {
    const round = rounds[index], n = index + 1, tag = `r${n}`, packetId = w9PacketIdOf(n + 9);
    let candidate = head, registrationCommit, deltaRequestPath = null;
    if (n > 1) {
      w9Put(root, `src/fix${n}.mjs`, `export const fix${n} = ${n};\n`);
      w9Put(root, "docs/state.md", `state v${n}\n`);
      candidate = w9CommitPaths(root, [`src/fix${n}.mjs`, "docs/state.md"], `fix: round ${n} correction`);
    }
    const diag = w9RegisterDiagnostic(root, candidate, tag);
    registrationCommit = diag.registration;
    if (n > 1) {
      const delta = w9DeltaRequest(root, [`fix-${n}`]);
      registrationCommit = delta.registration; deltaRequestPath = delta.added.deltaRequestPath;
    }
    const base = n === 1 ? genesis : previousCandidate;
    let bindingsPath = null;
    if (n > 1) {
      bindingsPath = `scratch/bindings-${tag}.json`;
      const derived = w9Cli("critic-correction-input-bindings.mjs", ["derive", "--root", root, "--base", base, "--head", candidate, "--out", bindingsPath]);
      assert.equal(derived.status, 0, `bindings ${tag}: ${derived.text}`);
    }
    const argv = ["--root", root, "--base", base, "--candidate", candidate, "--spec", COURSE_SPEC, "--evidence", diag.diagnosticPath, "--registration-commit", registrationCommit,
      ...(deltaRequestPath === null ? [] : ["--delta-request", deltaRequestPath]), ...(bindingsPath === null ? [] : ["--correction-input-bindings", bindingsPath])];
    const preflight = w9Cli("critic-dispatch-preflight.mjs", argv);
    assert.equal(preflight.body?.status, "packet-ready", `preflight ${tag}: ${preflight.text}`);
    const taskId = `critic-round-${n}`;
    w9Put(root, `evidence/dispatch-record-${taskId}.json`, JSON.stringify({ schema: "pipeline.dispatch-record.v3", taskId, agentType: "default", model: "gpt-5.6-luna", effort: "medium", rulesetSha: "b7797309cf6abe175fd52b0a8749d82b43714ea0", dispatcher: "elephant", outcome: "completed", commits: [candidate], candidateCommit: candidate, resultSha256: "a".repeat(64), log: [{ phase: "implement", toolUseCount: 1 }], report: { text: "done", changedFiles: [COURSE_SPEC] }, criticRequired: w9Required() }));
    const request = { preflightInput: parseCriticDispatchPreflightArgs(argv), taskId, projectId: "pipeline", sessionId: `session-${n}`, packetId, route: { routeId: "session-critic", runner: "codex", adapter: "session-functional-equivalent", provider: "openai", modelTier: "higher-capability", effortTier: "xhigh" }, verdict: w9VerdictOf(round.verdict) };
    admitSessionCriticReview(request, {});
    const finalized = finalizeSessionCriticReview(request, { readOriginalSourceReturnFn: w9Origin });
    assert.equal(finalized.status, "completed", `finalize ${tag}: ${JSON.stringify(finalized)}`);
    // D223 slice 1: the finalizer wrote the lineage into the working tree; the agent commits exactly the paths its instruction names.
    assert.equal(finalized.lineage?.status, "written", `the finalizer writes the lineage of ${tag}: ${JSON.stringify(finalized.lineage)}`);
    head = w9CommitPaths(root, finalized.lineage.commitPaths, `register lineage of round ${n}`);
    if (round.accept) w9AcceptResidual(root, packetId);
    previousCandidate = candidate; lastPacketId = packetId; lastCandidate = candidate;
  }
  return { root, genesis, lastPacketId, lastCandidate, sliceCommits };
}

/** The real close coordinator through plan-start and the checkpoint; `planPrepared` is the plan of feature-close-prepared. */
function w9CloseSession(root) {
  const common = ["--root", root, "--lifecycle", `close-${basename(root)}`, "--actor", "PO"];
  const start = invoke(["plan-start", ...common, "--close-intent", "durable-stop"]);
  assert.equal(start.status, 0, JSON.stringify(start.body));
  assert.equal(invokeAction(start.body.nextAction).body.status, "applied");
  const checkpoint = invoke(["plan-transition", ...common, "--phase", "checkpointed"]);
  assert.equal(checkpoint.status, 0, JSON.stringify(checkpoint.body));
  assert.equal(invokeAction(checkpoint.body.nextAction).body.status, "applied");
  return { planPrepared: () => invoke(["plan-transition", ...common, "--phase", "feature-close-prepared",
    "--architecture-impact", "architecture-conforms", "--continuity-close-request", "evidence/close-request.json"]) };
}

const W9_ROUNDS_LAST_PASSED = () => [{ verdict: W9_FAIL_MAJOR }, { verdict: w9Minors("r2"), accept: true }, { verdict: W9_PASS }];
const W9_ROUNDS_LAST_ACCEPTED = () => [{ verdict: W9_FAIL_MAJOR }, { verdict: w9Minors("r2"), accept: true }];

/** What the plan reported it wrote: every file exists, nothing is staged, HEAD did not move, the files are untracked. */
function assertWrittenAndUncommitted(root, outcome, taskIds, head) {
  assert.equal(outcome.status, 2, JSON.stringify(outcome.body));
  assert.equal(outcome.body.code, "CLOSE-CRITIC-ADDENDA-WRITTEN", JSON.stringify(outcome.body));
  const reported = outcome.body.criticAddenda;
  assert.deepEqual(reported.written.map((entry) => entry.taskId), [...taskIds].sort(), "one addendum per covered record, in task id order");
  const paths = reported.written.flatMap((entry) => [entry.addendumPath, entry.evidencePath]).sort();
  assert.deepEqual(reported.commitPaths, paths, "the commit instruction names exactly the files that were written");
  for (const entry of reported.written) {
    assert.equal(entry.addendumPath, criticDispositionAddendumPath(entry.taskId));
    assert.ok(existsSync(join(root, entry.addendumPath)) && existsSync(join(root, entry.evidencePath)), `${entry.taskId}: both files are in the working tree`);
  }
  for (const path of reported.commitPaths) assert.ok(outcome.body.message.includes(path), `the message names ${path}: ${outcome.body.message}`);
  assert.ok(outcome.body.message.includes(`git add -f -- ${reported.commitPaths.join(" ")}`), outcome.body.message);
  assert.match(outcome.body.message, /nothing was staged or committed/u);
  assert.match(outcome.body.message, /plan this transition again after that commit/u);
  assert.equal(reported.planAgain, true);
  assert.equal(git(root, ["diff", "--cached", "--name-only"]), "", "the coordinator stages nothing");
  assert.equal(git(root, ["rev-parse", "HEAD"]), head, "the coordinator commits nothing");
  assert.deepEqual(w9Derived(root), reported.commitPaths.map((path) => basename(path)).sort());
  for (const path of reported.commitPaths) assert.equal(git(root, ["ls-files", "--", path]), "", `${path} is untracked until the agent commits it`);
}

test("(k) D223 chain: three slices, a three-round Critic course, plan writes the addenda, the agent commits them, the second plan succeeds and applies", () => {
  const fx = w9Course({ label: "pos", rounds: W9_ROUNDS_LAST_PASSED(), slices: ["TASK-ONE", "TASK-TWO", "TASK-THREE"] });
  try {
    const { root } = fx;
    assert.deepEqual(w9Derived(root), [], "no addendum and no derived evidence exist before the close");
    const session = w9CloseSession(root);
    const head = git(root, ["rev-parse", "HEAD"]);
    const first = session.planPrepared();
    assertWrittenAndUncommitted(root, first, ["TASK-ONE", "TASK-TWO", "TASK-THREE"], head);
    const reported = first.body.criticAddenda;
    const receiptSha = w9ReceiptSha(root, fx.lastPacketId);
    for (const entry of reported.written) {
      assert.equal(entry.criticPacketId, fx.lastPacketId, "the course is covered by its LAST round");
      assert.equal(entry.reviewCandidateCommit, fx.lastCandidate);
      const addendum = JSON.parse(readFileSync(join(root, entry.addendumPath), "utf8"));
      const recordBytes = readFileSync(join(root, addendum.recordPath));
      assert.equal(addendum.schema, CRITIC_DISPOSITION_ADDENDUM_SCHEMA);
      assert.equal(addendum.recordSha256, sha256(recordBytes), "the addendum is byte-bound to the immutable record");
      assert.equal(addendum.criticReceiptSha256, receiptSha, "the addendum is bound to the consumed receipt of the last round");
      assert.equal(addendum.candidateCommit, fx.sliceCommits[entry.taskId]);
      assert.equal(addendum.criticEvidence.sha256, sha256(readFileSync(join(root, entry.evidencePath))), "the evidence reference digests the evidence file");
    }
    // Idempotent: the written files bind the records, so planning again before the commit rewrites and alters nothing.
    const before = Object.fromEntries(reported.commitPaths.map((path) => [path, readFileSync(join(root, path), "utf8")]));
    const statusBefore = w9Status(root);
    const again = session.planPrepared();
    assert.equal(again.status, 0, JSON.stringify(again.body));
    assert.deepEqual(Object.fromEntries(reported.commitPaths.map((path) => [path, readFileSync(join(root, path), "utf8")])), before);
    assert.equal(w9Status(root), statusBefore, "a plan that has nothing to write changes nothing");
    // The agent commits exactly the files the plan named, then the second plan succeeds and applies.
    w9CommitPaths(root, reported.commitPaths, "chore(evidence): bind the Critic course to the delivery records");
    // The Critic's own per-round dispatch records of the fixture stay untracked (a fixture artefact outside the closing feature's course).
    const statusBeforeSecond = w9Status(root);
    assert.ok(reported.commitPaths.every((path) => git(root, ["ls-files", "--", path]) === path), "the named files are committed");
    const second = session.planPrepared();
    assert.equal(second.status, 0, JSON.stringify(second.body));
    assert.equal(second.body.phase, "feature-close-prepared");
    assert.equal(second.body.criticAddenda, undefined);
    assert.equal(invokeAction(second.body.nextAction).body.status, "applied");
    assert.equal(w9Status(root), statusBeforeSecond, "the second plan and the apply wrote no further file");
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});

test("(k) a course closed by a PO residual acceptance of its last round: the addenda are written for the covered records only, the record that is on no round stays refused", () => {
  const fx = w9Course({ label: "mixed", rounds: W9_ROUNDS_LAST_ACCEPTED(), slices: ["TASK-ONE", "TASK-TWO"], earlySlice: "TASK-EARLY" });
  try {
    const { root } = fx;
    const session = w9CloseSession(root);
    const head = git(root, ["rev-parse", "HEAD"]);
    const first = session.planPrepared();
    assertWrittenAndUncommitted(root, first, ["TASK-ONE", "TASK-TWO"], head);
    assert.ok(!existsSync(join(root, criticDispositionAddendumPath("TASK-EARLY"))), "no addendum for the record that is on no round");
    // The unambiguous part is reported first; the record the course does not cover keeps today's repair text for exactly that id.
    assert.match(first.body.message, /TASK-EARLY require a Critic and carry no matching Critic evidence/u);
    assert.doesNotMatch(first.body.message, /TASK-ONE require|TASK-TWO require/u);
    assert.match(first.body.message, /--critic-addendum <request\.json> once for EACH uncovered record/u);
    w9CommitPaths(root, first.body.criticAddenda.commitPaths, "chore(evidence): bind the Critic course to the delivery records");
    const before = w9Status(root);
    const second = session.planPrepared();
    assertRefusedForMissingCritic(second, { named: ["TASK-EARLY"], notNamed: ["TASK-ONE", "TASK-TWO"] });
    assert.equal(w9Status(root), before, "the second plan writes nothing: the only uncovered record has no cover");
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});

test("(k) negative (1): a record covered by no receipt and no course stays refused with CLOSE-CRITIC-EVIDENCE-MISSING and nothing is written", () => {
  const repo = checkpointed("k-none", { ...courseFile(FEATURE, ["TASK-IN-COURSE"]), ...recordFile("TASK-IN-COURSE", { criticRequired: required() }) });
  const before = [repo.snapshot(), w9Status(repo.root)];
  assertRefusedForMissingCritic(repo.planPrepared(), { named: ["TASK-IN-COURSE"] });
  assert.deepEqual([repo.snapshot(), w9Status(repo.root)], before, "State, coordinator and the working tree are byte-identical");
  assert.deepEqual(w9Derived(repo.root), []);
});

/**
 * afterFixture hook: history P0 <- base <- R1 <- R2 <- candidate, two attested Critic-required records (one commit each, both inside the
 * reviewed range) and the listed CONSUMED, passed Critic packets over (base, candidate]; no addendum is written. `packets` entries are
 * { packetId, taskId, unit }: a packet whose task id is a record's covers that record by its own task id and the other one by range.
 * One Critic review unit is owned by one batch (CGB-CONFLICT), so each packet reviews the same range as its own unit ("a", "b", ...).
 */
const consumedCourseReceipts = (packets) => (root) => {
  const put = (path, text) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); };
  const commit = (message, paths) => { git(root, ["add", "--", ...paths]); git(root, ["commit", "-m", message]); return git(root, ["rev-parse", "HEAD"]); };
  put("src/before.mjs", "export const before = 1;\n");
  commit("before the reviewed range", ["src/before.mjs"]);
  put(".claude/pipeline.yaml", "schema: pipeline.manifest.v0\n");
  const units = { a: ["AC-1", "AC-2"], b: ["AC-3", "AC-4"], c: ["AC-5", "AC-6"] };
  put("specs/critic/spec.md", `# Spec\n${Object.values(units).flat().join(" ")}\n`);
  for (const [unit, ids] of Object.entries(units)) {
    put(`specs/review-unit-${unit}.json`, JSON.stringify({ schema: "pipeline.critic-review-unit.v1", kind: "related-fixes", purpose: `Close the feature as one delivery (${unit})`,
      specPath: "specs/critic/spec.md", logicalWorkIds: ids, criterionIds: ids, deliveryBoundary: { mainRef: "refs/heads/main" }, singletonRationale: null }));
  }
  const baseCommit = commit("reviewed range base", ["specs/critic/spec.md", ".claude/pipeline.yaml", ...Object.keys(units).map((unit) => `specs/review-unit-${unit}.json`)]);
  put("src/TASK-ONE.mjs", "export const one = 1;\n");
  const first = commit("feat(x): one", ["src/TASK-ONE.mjs"]);
  put("src/TASK-TWO.mjs", "export const two = 2;\n");
  const second = commit("feat(x): two", ["src/TASK-TWO.mjs"]);
  const records = { "TASK-ONE": attestedV4("TASK-ONE", first), "TASK-TWO": attestedV4("TASK-TWO", second) };
  for (const [taskId, value] of Object.entries(records)) put(`evidence/dispatch-record-${taskId}.json`, json(value));
  commit("persist the attested dispatch records", Object.keys(records).map((taskId) => `evidence/dispatch-record-${taskId}.json`));
  const candidate = { commit: git(root, ["rev-parse", "HEAD"]), tree: git(root, ["rev-parse", "HEAD^{tree}"]) };
  const common = git(root, ["rev-parse", "--git-common-dir"]);
  const controlRoot = join(root, common, "agent-pipeline", "critic-packets");
  mkdirSync(controlRoot, { recursive: true, mode: 0o700 });
  chmodSync(join(root, common, "agent-pipeline"), 0o700);
  chmodSync(controlRoot, 0o700);
  const changedPaths = git(root, ["diff", "--name-only", baseCommit, candidate.commit]).split("\n").filter(Boolean).sort();
  put("evidence/critic-diagnostic.json", JSON.stringify({ schema: "pipeline.verify-evidence.v0", commit: candidate.commit, tree: candidate.tree, candidate, exitCode: 0,
    selection: planVerifySelection({ mode: "critic", baseCommit, candidateCommit: candidate.commit, changedPaths, registeredSuiteIds: ["test"],
      policy: { schema: "pipeline.verify-selection.v1", baseline: ["test"], areas: [{ id: "all", paths: ["**"], suites: ["test"] }] } }),
    steps: [{ name: "test", exitCode: 0 }] }));
  packets.forEach(({ packetId, taskId, unit = "a" }, index) => {
    const review = { preflightInput: { root, base: baseCommit, candidate: candidate.commit, specPath: "specs/critic/spec.md", guardrailPaths: [".claude/pipeline.yaml"],
        evidencePaths: ["evidence/critic-diagnostic.json"], priorCriticEvidencePath: null },
      taskId, projectId: "fixture", sessionId: `close-review-${index + 1}`, packetId,
      route: { routeId: "session-critic", runner: "codex", adapter: "session-functional-equivalent", provider: "openai", modelTier: "higher-capability", effortTier: "xhigh" },
      verdict: { findings: [], deliberately_not_flagged: ["fixture"], trajectory_verdict: "consistent", trajectory_evidence: "fixture evidence", briefing_violations: [], pass: true } };
    const batch = registerGenericCriticBatch({ repoRoot: root, controlRoot, declaration: { taskId, baseCommit, candidateCommit: candidate.commit,
      logicalWorkIds: units[unit], specPath: "specs/critic/spec.md", guardrailPaths: [".claude/pipeline.yaml"], signedQualityImportAnchor: null, reviewUnitPath: `specs/review-unit-${unit}.json` } });
    review.genericBatchRef = { ...batch.batchRef, memberSha256: batch.memberSha256 };
    admitSessionCriticReview(review);
    finalizeSessionCriticReview({ ...review, allowCallerAuthoredFallback: true });
  });
};

test("(k) control: ONE passed, consumed receipt (its own task id, which also contains the other commit) covers both records; the addenda are written", () => {
  const repo = checkpointed("k-one", courseFile(FEATURE, ["TASK-ONE", "TASK-TWO"]), consumedCourseReceipts([{ packetId: "1".repeat(32), taskId: "TASK-ONE" }]));
  const head = git(repo.root, ["rev-parse", "HEAD"]);
  const first = repo.planPrepared();
  assertWrittenAndUncommitted(repo.root, first, ["TASK-ONE", "TASK-TWO"], head);
  for (const entry of first.body.criticAddenda.written) assert.equal(entry.criticPacketId, "1".repeat(32));
});

test("(k) negative (2): a record covered by two passed receipts is ambiguous: the refusal is today's, and nothing is written", () => {
  const repo = checkpointed("k-two", courseFile(FEATURE, ["TASK-ONE", "TASK-TWO"]), consumedCourseReceipts([
    { packetId: "1".repeat(32), taskId: "TASK-ONE", unit: "a" }, { packetId: "2".repeat(32), taskId: "TASK-TWO", unit: "b" }]));
  const before = [repo.snapshot(), w9Status(repo.root)];
  assertRefusedForMissingCritic(repo.planPrepared(), { named: ["TASK-ONE", "TASK-TWO"] });
  assert.deepEqual([repo.snapshot(), w9Status(repo.root)], before);
  assert.deepEqual(w9Derived(repo.root), []);
});

test("(k) negative (3): a course whose rounds all failed and carry no PO residual acceptance never covers a record: the refusal names the accept route and nothing is written", () => {
  const fx = w9Course({ label: "failed", rounds: [{ verdict: W9_FAIL_MAJOR }, { verdict: w9Minors("r2") }], slices: ["TASK-ONE", "TASK-TWO"] });
  try {
    const { root } = fx;
    const session = w9CloseSession(root);
    const before = w9Status(root);
    const refused = session.planPrepared();
    assertRefusedForMissingCritic(refused, { named: ["TASK-ONE", "TASK-TWO"] });
    assert.match(refused.body.message, /a failed receipt never binds without a PO residual acceptance/u);
    assert.match(refused.body.message, /approve-residual-acceptance/u);
    assert.equal(w9Status(root), before);
    assert.deepEqual(w9Derived(root), []);
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});

test("(k) negative (4): a tampered course chain (a registered lineage row with changed bytes) never covers a record: today's refusal, nothing is written", () => {
  const fx = w9Course({ label: "tamper", rounds: W9_ROUNDS_LAST_ACCEPTED(), slices: ["TASK-ONE", "TASK-TWO"] });
  try {
    const { root } = fx;
    const lineage = git(root, ["ls-files", `specs/${COURSE_FEATURE}/evidence`]).split("\n").filter((path) => /critic-lineage-/u.test(path)).sort()[0];
    assert.ok(lineage, "the registered lineage file of round 1 exists");
    writeFileSync(join(root, lineage), `${readFileSync(join(root, lineage), "utf8")} `);
    w9CommitPaths(root, [lineage], "tamper with a registered lineage row");
    const session = w9CloseSession(root);
    const before = w9Status(root);
    assertRefusedForMissingCritic(session.planPrepared(), { named: ["TASK-ONE", "TASK-TWO"] });
    assert.equal(w9Status(root), before);
    assert.deepEqual(w9Derived(root), []);
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});

test("(k) the apply step never writes an addendum: a covered record that appears after planning refuses the apply and leaves no derived file", () => {
  const repo = checkpointed("k-apply", courseFile(FEATURE, ["TASK-ONE", "TASK-TWO"]));
  const planned = repo.planPrepared();
  assert.equal(planned.status, 0, JSON.stringify(planned.body));
  consumedCourseReceipts([{ packetId: "1".repeat(32), taskId: "TASK-ONE" }])(repo.root);
  const before = repo.snapshot();
  assertRefusedForMissingCritic(invokeAction(planned.body.nextAction), { named: ["TASK-ONE", "TASK-TWO"] });
  assert.deepEqual(repo.snapshot(), before);
  assert.deepEqual(w9Derived(repo.root), [], "only plan-transition derives; apply-transition stays a pure check");
});

test("(k) a write failure leaves the plan refusing with its typed code and no partial file behind, the first record's files included", { skip: process.platform === "win32" }, () => {
  const fx = w9Course({ label: "wfail", rounds: W9_ROUNDS_LAST_ACCEPTED(), slices: ["TASK-ONE", "TASK-TWO"] });
  try {
    const { root } = fx;
    const session = w9CloseSession(root);
    // The second record's addendum path is a dangling symbolic link: the first record's files are written, the second publication fails.
    const blocked = join(root, criticDispositionAddendumPath("TASK-TWO"));
    symlinkSync(join(root, "scratch", "nowhere.json"), blocked);
    const before = w9Status(root);
    const refused = session.planPrepared();
    assert.equal(refused.status, 2, JSON.stringify(refused.body));
    assert.equal(refused.body.code, "CLOSE-CRITIC-ADDENDA-WRITE-FAILED", JSON.stringify(refused.body));
    assert.match(refused.body.message, /TASK-TWO/u);
    assert.equal(refused.body.criticAddenda, undefined);
    assert.equal(w9Status(root), before, "the first record's addendum and evidence were removed again");
    assert.deepEqual(readdirSync(join(root, "evidence")).filter((name) => /^dispatch-critic-addendum-|^critic-disposition-evidence-/u.test(name)), [basename(blocked)]);
    assert.ok(lstatSync(blocked).isSymbolicLink(), "the pre-existing entry is left as it was");
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});
