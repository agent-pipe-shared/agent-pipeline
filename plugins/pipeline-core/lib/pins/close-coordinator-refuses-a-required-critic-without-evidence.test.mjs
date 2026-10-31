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
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { CRITIC_REQUIRED_SCHEMA, CRITIC_TRIGGER_INPUT_SCHEMA } from "../critic-skip-decision.mjs";
import { CRITIC_DISPOSITION_ADDENDUM_SCHEMA, criticDispositionAddendumPath } from "../critic-disposition-addendum.mjs";
import { readBoundConsumedCriticReceipt } from "../critic-verify-lifecycle.mjs";
import { registerGenericCriticBatch } from "../critic-generic-batch.mjs";
import { reportSha256 } from "../dispatch-record.mjs";
import { planVerifySelection } from "../verify-selection.mjs";
import { admitSessionCriticReview, finalizeSessionCriticReview } from "../../scripts/session-critic-finalizer.mjs";
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
