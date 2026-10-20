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
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { CRITIC_REQUIRED_SCHEMA, CRITIC_TRIGGER_INPUT_SCHEMA } from "../critic-skip-decision.mjs";
import { ITEM_QUEUE_SCHEMA, SLICE_QUEUE_SCHEMA, validateSliceQueue } from "../slice-queue.mjs";

const CLI = fileURLToPath(new URL("../../scripts/close-coordinator.mjs", import.meta.url));
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
  const result = { path: paths.result, sha256: sha256(readFileSync(join(root, paths.result))) };
  writeFileSync(join(root, "evidence", "close-request.json"), json({
    schema: "pipeline.continuity-close.v0", featureId: FEATURE, expectedRevision: 7, result,
    closeEvidence: { path: paths.closeEvidence, sha256: sha256(readFileSync(join(root, paths.closeEvidence))) },
  }));
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(join(root, ".claude", "pipeline-state.json"), json({
    schema: "pipeline.state.v0",
    activeFeature: { id: FEATURE, planPath: paths.prd, phase: "implementation" },
    planApproved: true,
    planApproval: { poGateAuthority: { planSha256: prdSha256, specPath: paths.spec, specSha256 } },
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
});
