// SPDX-License-Identifier: SUL-1.0
// Regression pin: pipeline.design-intake-generator-omits-question-answers (ALF-C-P2-05, AC-153).
// Re-expressed 2026-10-18 (PO decision, ALF-H4-PF14-DESIGN-INPUT-PROVENANCE): the recorded
// design-question answers are private. They must reach NO tracked design artifact
// (design-input.md, PRD, spec); design-input.md lists the QUESTIONS only; the answers are
// carried, verbatim and in order, by the git-ignored authoring copy that is never bound.
// Real module, real git fixture under the repository scratch/; no mocks of the behavior.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function fixture(name, { ignored = true } = {}) {
  const root = mkdtempTestScratch(`diqa pin ${name} `);
  roots.push(root);
  mkdirSync(join(root, ".claude"), { recursive: true });
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, "project", "pipeline.yaml"), "schema: pipeline.project.v1\n");
  const git = spawnSync("git", ["init", "-q"], { cwd: root, encoding: "utf8", shell: false });
  assert.equal(git.status, 0, git.stderr);
  if (ignored) writeFileSync(join(root, ".gitignore"), "scratch/\n");
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
const readCopy = (root, plan) => readFileSync(join(root, plan.authoringCopy.path), "utf8");
const TARGETS = ["designInput", "prd", "spec"];

// Pure assertion: no line of any answer, and no answer marker, appears in tracked text.
function assertNoAnswers(text, answers, label) {
  assert.equal(/^A: /mu.test(text), false, `${label}: no answer marker`);
  for (const entry of answers) {
    for (const line of entry.answer.split("\n")) assert.equal(text.includes(line), false, `${label}: answer text "${line}" must stay private`);
  }
  assert.equal(text.includes("requirement material one"), false, `${label}: captured material must stay private`);
}

test("every question is listed in order in design-input.md, no answer reaches a tracked artifact, and the authoring copy holds every answer verbatim", () => {
  const root = fixture("verbatim");
  const answers = [
    { question: "What is the goal?", answer: "Ship the coordinator." },
    { question: "Who is the primary user?", answer: "Line one.\nLine two with `markdown` and a | pipe." },
    { question: "Which stack?", answer: "Node 22, no database." },
  ];
  applyOnboardingIntakeDesignQuestions({ rootDir: root, answers, activate: true });
  const { plan, applied } = generate(root);
  for (const key of TARGETS) assertNoAnswers(read(root, plan, key), answers, key);
  const designInput = read(root, plan, "designInput");
  assert.equal(designInput.includes("(design questions not yet answered)"), false, "no unanswered placeholder");
  let cursor = 0;
  answers.forEach((entry, index) => {
    const q = designInput.indexOf(`### Q${index + 1}: ${entry.question}`, cursor);
    assert.ok(q >= cursor && q !== -1, `design-input: question ${index + 1} present and in order`);
    cursor = q;
  });
  for (const key of ["prd", "spec"]) assert.equal(read(root, plan, key).includes("### Q1:"), false, `${key}: lists no questions`);
  assert.equal(applied.authoringCopy.status, "written");
  const copy = readCopy(root, plan);
  assert.match(copy, /## Design questions and answers/u);
  let at = copy.indexOf("## Design questions and answers");
  answers.forEach((entry, index) => {
    const q = copy.indexOf(`### Q${index + 1}: ${entry.question}`, at);
    assert.ok(q >= at && q !== -1, `authoring copy: question ${index + 1} present and in order`);
    const a = copy.indexOf(`A: ${entry.answer}`, q);
    assert.ok(a > q, `authoring copy: answer ${index + 1} present verbatim after its question`);
    at = a;
  });
});

test("the generate plan binds the answers by digest: different answers change the plan digest and the bytes, never the tracked text", () => {
  const rootA = fixture("digest-a");
  const rootB = fixture("digest-b");
  applyOnboardingIntakeDesignQuestions({ rootDir: rootA, answers: [{ question: "Q?", answer: "answer-alpha" }], activate: true });
  applyOnboardingIntakeDesignQuestions({ rootDir: rootB, answers: [{ question: "Q?", answer: "answer-beta" }], activate: true });
  const planA = planOnboardingIntakeGenerate({ rootDir: rootA });
  const planB = planOnboardingIntakeGenerate({ rootDir: rootB });
  assert.notEqual(planA.checkpointDataSha256, planB.checkpointDataSha256);
  for (const key of TARGETS) {
    assert.equal(planA.targets[key].content.includes("answer-alpha"), false, `${key}: plan A carries no answer text`);
    assert.equal(planB.targets[key].content.includes("answer-beta"), false, `${key}: plan B carries no answer text`);
    assert.notEqual(planA.targets[key].afterSha256, planB.targets[key].afterSha256, `${key}: bytes differ with the answer digest`);
  }
  assert.equal(JSON.stringify(planA).includes("answer-alpha"), false, "the plan result carries no answer text");
  generate(rootA);
  generate(rootB);
  assert.ok(readCopy(rootA, planA).includes("A: answer-alpha"));
  assert.equal(readCopy(rootA, planA).includes("answer-beta"), false);
  assert.ok(readCopy(rootB, planB).includes("A: answer-beta"));
});

test("an affirmative no-open-questions disposition is rendered explicitly, not as an unanswered placeholder", () => {
  const root = fixture("none-open");
  applyOnboardingIntakeDesignQuestions({ rootDir: root, answers: { disposition: "no-open-questions" }, activate: true });
  const { plan } = generate(root);
  assert.ok(read(root, plan, "designInput").includes("No open design questions were affirmed at intake."), "design-input: explicit disposition");
  assert.ok(readCopy(root, plan).includes("No open design questions were affirmed at intake."), "authoring copy: explicit disposition");
  for (const key of TARGETS) {
    assert.equal(read(root, plan, key).includes("(design questions not yet answered)"), false, `${key}: no unanswered placeholder`);
  }
});

test("generation is refused before answers exist, so no artifact can be written without them", () => {
  const root = fixture("no-answers");
  assert.throws(() => planOnboardingIntakeGenerate({ rootDir: root }), (error) => error?.code === "INTAKE-GENERATE-PRECONDITION");
  assert.throws(() => applyOnboardingIntakeGenerate({ rootDir: root, expectedPlanSha256: "0".repeat(64), activate: true }),
    (error) => error?.code === "INTAKE-GENERATE-PRECONDITION");
});

test("answers stay private across a replay, and a corrected-answer regeneration is refused or rewritten only in the authoring copy", () => {
  const root = fixture("replay");
  const answers = [{ question: "Q?", answer: "first answer" }];
  applyOnboardingIntakeDesignQuestions({ rootDir: root, answers, activate: true });
  const first = generate(root);
  const replayPlan = planOnboardingIntakeGenerate({ rootDir: root });
  assert.equal(replayPlan.planSha256, first.plan.planSha256, "replay plan is identical");
  const replay = applyOnboardingIntakeGenerate({ rootDir: root, expectedPlanSha256: replayPlan.planSha256, activate: true });
  assert.equal(replay.mutated, false, "unchanged replay is a no-op");
  assert.equal(replay.authoringCopy.status, "unchanged", "the authoring copy is replayed write-if-different");
  for (const key of TARGETS) assertNoAnswers(read(root, first.plan, key), answers, key);
  assert.ok(readCopy(root, first.plan).includes("A: first answer"), "authoring copy still carries the answer after replay");
  // After generation the answered round is locked: a different answer set is refused, never silently dropped.
  assert.throws(() => applyOnboardingIntakeDesignQuestions({
    rootDir: root, answers: [{ question: "Q?", answer: "other" }], activate: true,
  }), (error) => error?.code === "INTAKE-DESIGN-QUESTIONS-ALREADY-ANSWERED");
  assert.equal(readCopy(root, first.plan).includes("A: other"), false);
});

test("explicit pre-generation replacement carries the corrected answer, not the stale one, into the authoring copy only", () => {
  const root = fixture("replace");
  applyOnboardingIntakeDesignQuestions({ rootDir: root, answers: [{ question: "Q?", answer: "stale answer" }], activate: true });
  applyOnboardingIntakeDesignQuestions({
    rootDir: root, answers: [{ question: "Q?", answer: "corrected answer" }], replace: true, activate: true,
  });
  const { plan } = generate(root);
  const copy = readCopy(root, plan);
  assert.ok(copy.includes("A: corrected answer"), "authoring copy: corrected answer present");
  assert.equal(copy.includes("stale answer"), false, "authoring copy: stale answer absent");
  for (const key of TARGETS) {
    const text = read(root, plan, key);
    assert.equal(text.includes("corrected answer"), false, `${key}: corrected answer stays private`);
    assert.equal(text.includes("stale answer"), false, `${key}: stale answer absent`);
  }
});

test("without an ignore rule for scratch/ no file holds the answers and the plan names the missing rule with a typed code", () => {
  const root = fixture("not-ignored", { ignored: false });
  const answers = [{ question: "Q?", answer: "private answer" }];
  applyOnboardingIntakeDesignQuestions({ rootDir: root, answers, activate: true });
  const { plan, applied } = generate(root);
  assert.equal(plan.authoringCopy.code, "INTAKE-AUTHORING-COPY-NOT-IGNORED");
  assert.equal(plan.authoringCopy.requiredIgnoreRule, "scratch/");
  assert.equal(applied.authoringCopy.status, "not-written");
  assert.equal(existsSync(join(root, plan.authoringCopy.path)), false);
  for (const key of TARGETS) assertNoAnswers(read(root, plan, key), answers, key);
});
