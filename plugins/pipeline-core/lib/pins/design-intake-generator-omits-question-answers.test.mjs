// SPDX-License-Identifier: SUL-1.0
// Regression pin: pipeline.design-intake-generator-omits-question-answers (ALF-C-P2-05, AC-153).
// The design intake generator must carry the recorded design-question answers into
// every generated design artifact (design-input.md, PRD, spec) instead of dropping them.
// Real module, real git fixture under the repository scratch/; no mocks of the behavior.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { mkdtempTestScratch } from "../test-tmpdir.mjs";
import {
  applyOnboardingIntakeCapture,
  applyOnboardingIntakeConsent,
  applyOnboardingIntakeDesignQuestions,
  applyOnboardingIntakeGenerate,
  planOnboardingIntakeGenerate,
} from "../onboarding-continuity.mjs";

const roots = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function fixture(name) {
  const root = mkdtempTestScratch(`diqa pin ${name} `);
  roots.push(root);
  mkdirSync(join(root, ".claude"), { recursive: true });
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, "project", "pipeline.yaml"), "schema: pipeline.project.v1\n");
  const git = spawnSync("git", ["init", "-q"], { cwd: root, encoding: "utf8", shell: false });
  assert.equal(git.status, 0, git.stderr);
  writeFileSync(join(root, "project", "pipeline.json"), `${JSON.stringify({
    project: "fixture", verify: "node verify.mjs", autonomy: "bounded", branchModel: "local",
    worktree: "supported", stakes: "high", constraints: [],
  }, null, 2)}\n`);
  applyOnboardingIntakeConsent({ rootDir: root, granted: true, language: "en", profile: "feature", activate: true });
  applyOnboardingIntakeCapture({ rootDir: root, text: "requirement material one", activate: true });
  return root;
}

function generate(root) {
  const plan = planOnboardingIntakeGenerate({ rootDir: root });
  const applied = applyOnboardingIntakeGenerate({ rootDir: root, expectedPlanSha256: plan.planSha256, activate: true });
  return { plan, applied };
}

const read = (root, plan, key) => readFileSync(join(root, plan.targets[key].path), "utf8");
const TARGETS = ["designInput", "prd", "spec"];

test("every answered question and answer appears verbatim, in order, in all three generated artifacts", () => {
  const root = fixture("verbatim");
  const answers = [
    { question: "What is the goal?", answer: "Ship the coordinator." },
    { question: "Who is the primary user?", answer: "Line one.\nLine two with `markdown` and a | pipe." },
    { question: "Which stack?", answer: "Node 22, no database." },
  ];
  applyOnboardingIntakeDesignQuestions({ rootDir: root, answers, activate: true });
  const { plan } = generate(root);
  for (const key of TARGETS) {
    const text = read(root, plan, key);
    assert.match(text, /## Design questions and answers/u, `${key}: section heading present`);
    assert.equal(text.includes("(design questions not yet answered)"), false, `${key}: no unanswered placeholder`);
    let cursor = text.indexOf("## Design questions and answers");
    answers.forEach((entry, index) => {
      const q = text.indexOf(`### Q${index + 1}: ${entry.question}`, cursor);
      assert.ok(q >= cursor, `${key}: question ${index + 1} present and in order`);
      const a = text.indexOf(`A: ${entry.answer}`, q);
      assert.ok(a > q, `${key}: answer ${index + 1} present verbatim after its question`);
      cursor = a;
    });
  }
});

test("the generate plan binds the answers: different answers change the plan digest and the planned content", () => {
  const rootA = fixture("digest-a");
  const rootB = fixture("digest-b");
  applyOnboardingIntakeDesignQuestions({ rootDir: rootA, answers: [{ question: "Q?", answer: "answer-alpha" }], activate: true });
  applyOnboardingIntakeDesignQuestions({ rootDir: rootB, answers: [{ question: "Q?", answer: "answer-beta" }], activate: true });
  const planA = planOnboardingIntakeGenerate({ rootDir: rootA });
  const planB = planOnboardingIntakeGenerate({ rootDir: rootB });
  assert.notEqual(planA.checkpointDataSha256, planB.checkpointDataSha256);
  for (const key of TARGETS) {
    assert.ok(planA.targets[key].content.includes("A: answer-alpha"), `${key}: plan A carries its answer`);
    assert.ok(planB.targets[key].content.includes("A: answer-beta"), `${key}: plan B carries its answer`);
    assert.equal(planA.targets[key].content.includes("answer-beta"), false);
    assert.notEqual(planA.targets[key].afterSha256, planB.targets[key].afterSha256, `${key}: bytes differ with the answer`);
  }
});

test("an affirmative no-open-questions disposition is rendered explicitly, not as an unanswered placeholder", () => {
  const root = fixture("none-open");
  applyOnboardingIntakeDesignQuestions({ rootDir: root, answers: { disposition: "no-open-questions" }, activate: true });
  const { plan } = generate(root);
  for (const key of TARGETS) {
    const text = read(root, plan, key);
    assert.ok(text.includes("No open design questions were affirmed at intake."), `${key}: explicit disposition`);
    assert.equal(text.includes("(design questions not yet answered)"), false, `${key}: no unanswered placeholder`);
  }
});

test("generation is refused before answers exist, so no artifact can be written without them", () => {
  const root = fixture("no-answers");
  assert.throws(() => planOnboardingIntakeGenerate({ rootDir: root }), (error) => error?.code === "INTAKE-GENERATE-PRECONDITION");
  assert.throws(() => applyOnboardingIntakeGenerate({ rootDir: root, expectedPlanSha256: "0".repeat(64), activate: true }),
    (error) => error?.code === "INTAKE-GENERATE-PRECONDITION");
});

test("answers survive a replay and a corrected-answer regeneration rewrites them in the artifacts", () => {
  const root = fixture("replay");
  applyOnboardingIntakeDesignQuestions({ rootDir: root, answers: [{ question: "Q?", answer: "first answer" }], activate: true });
  const first = generate(root);
  const replayPlan = planOnboardingIntakeGenerate({ rootDir: root });
  assert.equal(replayPlan.planSha256, first.plan.planSha256, "replay plan is identical");
  const replay = applyOnboardingIntakeGenerate({ rootDir: root, expectedPlanSha256: replayPlan.planSha256, activate: true });
  assert.equal(replay.mutated, false, "unchanged replay is a no-op");
  for (const key of TARGETS) assert.ok(read(root, first.plan, key).includes("A: first answer"), `${key}: still carries the answer after replay`);
  // After generation the answered round is locked: a different answer set is refused, never silently dropped.
  assert.throws(() => applyOnboardingIntakeDesignQuestions({
    rootDir: root, answers: [{ question: "Q?", answer: "other" }], activate: true,
  }), (error) => error?.code === "INTAKE-DESIGN-QUESTIONS-ALREADY-ANSWERED");
  for (const key of TARGETS) assert.equal(read(root, first.plan, key).includes("A: other"), false);
});

test("explicit pre-generation replacement carries the corrected answer, not the stale one, into the artifacts", () => {
  const root = fixture("replace");
  applyOnboardingIntakeDesignQuestions({ rootDir: root, answers: [{ question: "Q?", answer: "stale answer" }], activate: true });
  applyOnboardingIntakeDesignQuestions({
    rootDir: root, answers: [{ question: "Q?", answer: "corrected answer" }], replace: true, activate: true,
  });
  const { plan } = generate(root);
  for (const key of TARGETS) {
    const text = read(root, plan, key);
    assert.ok(text.includes("A: corrected answer"), `${key}: corrected answer present`);
    assert.equal(text.includes("stale answer"), false, `${key}: stale answer absent`);
  }
});
