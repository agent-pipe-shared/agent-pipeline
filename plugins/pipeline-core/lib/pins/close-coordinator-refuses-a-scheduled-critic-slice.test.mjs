// SPDX-License-Identifier: SUL-1.0
// Pin: D52 clause B. The close coordinator cannot reach `feature-close-prepared` while a slice of THIS
// feature's delivery course with tier `critic` is still scheduled (state ready, no terminal dispatch record:
// not started, or in progress). A done (terminal record) or cancelled Critic slice never blocks, and another
// feature's course never blocks. Every case drives the real coordinator process in its own fixture repository
// (own `git init`) under the OS temp root.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { SLICE_QUEUE_SCHEMA, validateSliceQueue } from "../slice-queue.mjs";
import { CURRENT_APPROVAL_SCHEMA, PLAN_SUBMISSION_SCHEMA, sha256CanonicalJson } from "../plan-spec-state-v2.mjs";

const CLI = process.env.G20_CLOSE_CLI ?? fileURLToPath(new URL("../../scripts/close-coordinator.mjs", import.meta.url));
const CANDIDATE = "a".repeat(40);
const FEATURE = "feature";
const COURSE_PATH = "specs/feature/slice-queue.json";
const OTHER_COURSE_PATH = "specs/other/slice-queue.json";
const ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
delete ENV.NODE_TEST_CONTEXT;

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const record = (taskId, outcome) => ({
  schema: "pipeline.dispatch-record.v3", taskId, agentType: "goldfish-implementor", model: "claude-sonnet-5",
  effort: "medium", rulesetSha: "0.6.2+local", dispatcher: "Elephant", candidateCommit: CANDIDATE,
  resultSha256: null, outcome, commits: [], log: outcome === "in-progress" ? [] : [{ phase: "done", toolUseCount: 1 }], report: null,
});
const recordFile = (taskId, outcome) => ({ [`evidence/dispatch-record-${taskId}.json`]: json(record(taskId, outcome)) });
const slice = (id, extra = {}) => ({ id, title: `slice ${id}`, state: "ready", dependsOn: [], writeScope: [`src/${id}.mjs`],
  readScope: [], tier: "implementor", commitMode: "host-commit", loadClass: "light", ...extra });
const criticSlice = (extra = {}) => slice("TASK-CRITIC", { tier: "critic", tierReason: "independent review of the batch", dependsOn: ["TASK-DONE"], ...extra });
const course = (feature, slices) => ({ schema: SLICE_QUEUE_SCHEMA, feature, slices });
const courseFile = (slices, feature = FEATURE) => ({ [COURSE_PATH]: json(course(feature, slices)) });

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

function fixtureRepository(label, files = {}) {
  const root = mkdtempSync(join(tmpdir(), `alf-d52b-${label}-`));
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
    planSubmission, planApproved: true,
    planApproval: { schema: CURRENT_APPROVAL_SCHEMA, approvedBy: "fixture", approvedAt: "2026-10-24T00:01:00.000Z",
      submissionSha256: sha256CanonicalJson(planSubmission), profileSha256, poGateAuthority,
      priorInvalidationSha256: null, designApprovalBinding: null, designApproval: null },
    continuity: { revision: 7,
      authority: { prd: { path: paths.prd, sha256: prdSha256 }, spec: { path: paths.spec, sha256: specSha256 }, result },
      queueHead: { nextAction: "close", dispatch: null }, blocker: null, decisionTxn: null },
  }));
  git(root, ["init", "-b", "main"]);
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "fixture"]);
  return { root, lifecycle: `close-${label}` };
}

function checkpointed(label, files = {}) {
  const repo = fixtureRepository(label, files);
  const common = ["--root", repo.root, "--lifecycle", repo.lifecycle, "--actor", "PO"];
  const start = invoke(["plan-start", ...common, "--close-intent", "durable-stop"]);
  assert.equal(start.status, 0, JSON.stringify(start.body));
  assert.equal(invokeAction(start.body.nextAction).body.status, "applied");
  const checkpoint = invoke(["plan-transition", ...common, "--phase", "checkpointed"]);
  assert.equal(checkpoint.status, 0, JSON.stringify(checkpoint.body));
  assert.equal(invokeAction(checkpoint.body.nextAction).body.status, "applied");
  return {
    ...repo,
    planPrepared: () => invoke(["plan-transition", ...common, "--phase", "feature-close-prepared",
      "--architecture-impact", "architecture-conforms", "--continuity-close-request", "evidence/close-request.json"]),
    snapshot: () => ({
      state: readFileSync(join(repo.root, ".claude", "pipeline-state.json"), "utf8"),
      coordinator: readFileSync(join(repo.root, ".git", "agent-pipeline", "publication-close", repo.lifecycle, "coordinator.json"), "utf8"),
    }),
  };
}

const done = () => ({ ...recordFile("TASK-DONE", "succeeded") });
function assertRefusedForScheduledCritic(outcome) {
  assert.equal(outcome.status, 2, JSON.stringify(outcome.body));
  assert.equal(outcome.body.code, "CLOSE-CRITIC-SLICE-SCHEDULED", JSON.stringify(outcome.body));
  assert.ok(outcome.body.message.includes("TASK-CRITIC"), `the scheduled Critic slice must be named: ${outcome.body.message}`);
  assert.ok(/Critic review/u.test(outcome.body.message) && /cancel/u.test(outcome.body.message),
    `both repairs must be named: ${outcome.body.message}`);
}

test("the fixture delivery course is a valid slice queue", () => {
  const validated = validateSliceQueue(course(FEATURE, [slice("TASK-DONE"), criticSlice()]));
  assert.equal(validated.ok, true, JSON.stringify(validated.errors));
  const cancelled = validateSliceQueue(course(FEATURE, [slice("TASK-DONE"), criticSlice({ state: "cancelled", cancelClass: "budget", holdReason: "no longer needed" })]));
  assert.equal(cancelled.ok, true, JSON.stringify(cancelled.errors));
});

test("(a) a scheduled Critic slice with no record refuses the close with a typed code and zero mutation", () => {
  const repo = checkpointed("a", { ...courseFile([slice("TASK-DONE"), criticSlice()]), ...done() });
  const before = repo.snapshot();
  assertRefusedForScheduledCritic(repo.planPrepared());
  assert.deepEqual(repo.snapshot(), before, "a refused close preparation must leave State and the coordinator byte-identical");
});

test("(b) a Critic slice whose dispatch record is still in progress refuses the close", () => {
  const repo = checkpointed("b", { ...courseFile([slice("TASK-DONE"), criticSlice()]), ...done(), ...recordFile("TASK-CRITIC", "in-progress") });
  const before = repo.snapshot();
  assertRefusedForScheduledCritic(repo.planPrepared());
  assert.deepEqual(repo.snapshot(), before);
});

test("(c) a done Critic slice (terminal record) plans", () => {
  const repo = checkpointed("c", { ...courseFile([slice("TASK-DONE"), criticSlice()]), ...done(), ...recordFile("TASK-CRITIC", "succeeded") });
  const planned = repo.planPrepared();
  assert.equal(planned.status, 0, JSON.stringify(planned.body));
  assert.equal(planned.body.phase, "feature-close-prepared");
  assert.equal(invokeAction(planned.body.nextAction).body.status, "applied");
});

test("(d) a cancelled Critic slice plans", () => {
  const repo = checkpointed("d", { ...courseFile([slice("TASK-DONE"), criticSlice({ state: "cancelled", cancelClass: "budget", holdReason: "no longer needed" })]), ...done() });
  const planned = repo.planPrepared();
  assert.equal(planned.status, 0, JSON.stringify(planned.body));
  assert.equal(planned.body.phase, "feature-close-prepared");
});

test("(e) the apply step re-checks: a Critic slice scheduled after planning refuses the transition", () => {
  const repo = checkpointed("e", { ...courseFile([slice("TASK-DONE")]), ...done() });
  const planned = repo.planPrepared();
  assert.equal(planned.status, 0, JSON.stringify(planned.body));
  writeFileSync(join(repo.root, COURSE_PATH), json(course(FEATURE, [slice("TASK-DONE"), criticSlice()])));
  const before = repo.snapshot();
  assertRefusedForScheduledCritic(invokeAction(planned.body.nextAction));
  assert.deepEqual(repo.snapshot(), before, "a refused apply must leave State and the coordinator byte-identical");
});

test("(f) a scheduled Critic slice of ANOTHER feature course never blocks", () => {
  const other = { [OTHER_COURSE_PATH]: json(course("other", [slice("TASK-DONE"), criticSlice()])) };
  const repo = checkpointed("f", { ...courseFile([slice("TASK-DONE")]), ...other, ...done() });
  const planned = repo.planPrepared();
  assert.equal(planned.status, 0, JSON.stringify(planned.body));
  assert.equal(planned.body.phase, "feature-close-prepared");
});
