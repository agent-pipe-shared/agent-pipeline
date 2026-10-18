// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.design-generator-repeats-large-source-material (AC-152).
// Drives the real onboarding CLI main() and the real intake-generate library
// against a ~14 KB Unicode/CRLF request. No behavior under test is mocked.
//
// Re-expressed 2026-10-18 (PO decision, ALF-H4-PF14-DESIGN-INPUT-PROVENANCE):
// the generator no longer copies the captured material into ANY tracked target.
// design-input.md is a provenance record (digests + questions); the PRD and Spec
// reference it; the verbatim material stays in the private intake store and, only
// when scratch/ is git-ignored, in an ignored authoring copy that is never bound.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { main, summarizeOnboardingIntakeGeneratePlan } from "../../scripts/project-onboarding-v3.mjs";
import { mkdtempTestScratch } from "../test-tmpdir.mjs";
import {
  applyOnboardingIntakeCapture, applyOnboardingIntakeConsent, applyOnboardingIntakeDesignQuestions,
  applyOnboardingIntakeGenerate, planOnboardingIntakeGenerate, readOnboardingIntakeMaterialInput,
} from "../onboarding-continuity.mjs";

const sha = (text) => createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
const bytes = (text) => Buffer.byteLength(text, "utf8");
const countOf = (haystack, needle) => haystack.split(needle).length - 1;

function request(targetBytes) {
  const line = "Anforderung üöä ✓ the system shall keep every requirement exactly once.\r\n";
  let text = "REQ-START\r\n";
  let n = 0;
  while (bytes(text) < targetBytes) text += `${String(n += 1).padStart(4, "0")} ${line}`;
  return `${text}REQ-END\r\n`;
}

function readyRoot(text, { ignored = true } = {}) {
  const root = mkdtempTestScratch("alf-c-p16-03-");
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, "project", "pipeline.yaml"), "schema: pipeline.project.v1\n");
  writeFileSync(join(root, "project", "pipeline.json"), `${JSON.stringify({
    project: "fixture", verify: "node verify.mjs", autonomy: "bounded", branchModel: "local",
    worktree: "supported", stakes: "high", constraints: [],
  }, null, 2)}\n`);
  const git = spawnSync("git", ["init", "-q"], { cwd: root, encoding: "utf8", shell: false });
  assert.equal(git.status, 0, git.stderr);
  if (ignored) writeFileSync(join(root, ".gitignore"), "scratch/\n");
  applyOnboardingIntakeConsent({ rootDir: root, granted: true, language: "en", profile: "feature", activate: true });
  applyOnboardingIntakeCapture({ rootDir: root, text, activate: true });
  applyOnboardingIntakeDesignQuestions({
    rootDir: root, answers: [{ question: "What is the goal?", answer: "Ship it." }], activate: true,
  });
  return root;
}

function cli(root, extra = []) {
  let out = "";
  const code = main(["intake-generate-plan", "--root", root, "--runner", "claude", ...extra], {
    write: (chunk) => { out += chunk; return true; }, writeError: () => true,
  });
  return { code, out };
}

// Pure assertions, reused to prove the pin can fail against a mutant (RED).
function assertNoSourceMaterial(text, label) {
  for (const needle of ["REQ-START", "REQ-END", "Anforderung", "keep every requirement exactly once"]) {
    assert.equal(countOf(text, needle), 0, `${label} must not repeat the source material (${needle})`);
  }
}
function assertCompact(summaryText, budget) {
  assert.ok(bytes(summaryText) <= budget, `summary ${bytes(summaryText)} exceeds budget ${budget}`);
  assertNoSourceMaterial(summaryText, "summary");
}

test("measured before/after: no tracked target and no plan output carries the source material", (t) => {
  const text = request(14030);
  const root = readyRoot(text);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const verbose = cli(root, ["--verbose"]);
  const summary = cli(root, ["--summary"]);
  const dflt = cli(root);
  assert.deepEqual([verbose.code, summary.code, dflt.code], [0, 0, 0]);
  assert.equal(dflt.out, summary.out, "default output is the compact summary");
  const full = JSON.parse(verbose.out);
  // duplication measured: the request was stored in design-input, PRD and spec (3 copies); now 0 copies
  const stored = Object.values(full.targets).map((target) => countOf(target.content, "REQ-START"));
  assert.deepEqual(stored, [0, 0, 0]);
  for (const [name, target] of Object.entries(full.targets)) assertNoSourceMaterial(target.content, name);
  assertNoSourceMaterial(verbose.out, "full plan");
  assertCompact(summary.out, 8192);
});

test("provenance coverage: summary references bind the full plan's exact bytes; design-input records the source digest, not the text", (t) => {
  const text = request(14030);
  const root = readyRoot(text);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const verbose = cli(root, ["--verbose"]);
  const full = JSON.parse(verbose.out);
  const summary = JSON.parse(cli(root).out);
  assert.equal(summary.planSha256, full.planSha256);
  assert.equal(summary.checkpointDataSha256, full.checkpointDataSha256);
  assert.deepEqual(Object.keys(summary.targets), Object.keys(full.targets));
  for (const [name, target] of Object.entries(full.targets)) {
    assert.equal(summary.targets[name].path, target.path);
    assert.equal(summary.targets[name].afterSha256, sha(target.content));
    assert.equal(summary.targets[name].byteLength, bytes(target.content));
    assert.equal(target.content.includes(text), false, `${name} must not carry the request`);
  }
  const designInput = full.targets.designInput.content;
  assert.ok(designInput.includes(`sha256:${sha(text)}`), "design-input records the source chunk digest");
  assert.ok(designInput.includes(`${bytes(text)} bytes`), "design-input records the source chunk byte length");
  assert.ok(designInput.includes("What is the goal?"), "design-input lists the design question");
  for (const name of ["prd", "spec"]) {
    assert.ok(full.targets[name].content.includes(`specs/${full.featureId}/design-input.md`), `${name} names design-input.md`);
    assert.ok(full.targets[name].content.includes(`sha256:${full.targets.designInput.afterSha256}`), `${name} names the design-input digest`);
  }
  assert.deepEqual(summary.nextAction, full.nextAction);
  const replay = summary.fullPlanAction;
  assert.equal(replay.mutation, false);
  assert.equal(replay.argv.includes("--verbose"), true);
  const again = cli(root, replay.argv.slice(2).filter((_, i, a) => !(a[i - 1] === "--root" || a[i] === "--root")));
  assert.equal(again.out, verbose.out, "explicit full-plan action reproduces the full response byte-for-byte");
});

test("a fresh reviewer can reach the source: apply writes provenance only; the authoring copy and the private store hold the material", (t) => {
  const text = request(14030);
  const root = readyRoot(text);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const storeBefore = readOnboardingIntakeMaterialInput({ rootDir: root }).chunks.map((chunk) => chunk.text);
  const summary = JSON.parse(cli(root).out);
  const plan = planOnboardingIntakeGenerate({ rootDir: root, runner: "claude" });
  assert.equal(plan.authoringCopy.status, "will-write");
  assert.equal(plan.authoringCopy.code, null);
  assert.equal(plan.authoringCopy.path, `scratch/intake/${plan.featureId}/material.md`);
  assert.equal(JSON.stringify(plan.authoringCopy).includes("REQ-START"), false, "the plan descriptor carries no material");
  assert.equal(plan.planSha256, summary.planSha256);
  const applied = applyOnboardingIntakeGenerate({ rootDir: root, expectedPlanSha256: summary.planSha256, activate: true });
  assert.equal(applied.mutated, true);
  for (const target of Object.values(summary.targets)) {
    const disk = readFileSync(join(root, target.path), "utf8");
    assert.equal(sha(disk), target.afterSha256);
    assert.equal(bytes(disk), target.byteLength);
    assertNoSourceMaterial(disk, target.path);
  }
  assert.equal(applied.authoringCopy.status, "written");
  const copy = readFileSync(join(root, applied.authoringCopy.path), "utf8");
  assert.ok(copy.includes(text), "the ignored authoring copy holds the whole request verbatim (CRLF/Unicode)");
  assert.ok(copy.includes("A: Ship it."), "the authoring copy holds the answer verbatim");
  assert.deepEqual(readOnboardingIntakeMaterialInput({ rootDir: root }).chunks.map((chunk) => chunk.text), storeBefore,
    "the private intake store is untouched");
  assert.ok(JSON.stringify(readOnboardingIntakeMaterialInput({ rootDir: root })).includes("REQ-END"),
    "original request stays retrievable from the immutable intake store");
});

test("without an ignore rule for scratch/ no authoring copy is written and the plan and apply result say so with a typed code", (t) => {
  const text = request(14030);
  const root = readyRoot(text, { ignored: false });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const plan = planOnboardingIntakeGenerate({ rootDir: root, runner: "claude" });
  assert.equal(plan.authoringCopy.status, "will-not-write");
  assert.equal(plan.authoringCopy.code, "INTAKE-AUTHORING-COPY-NOT-IGNORED");
  assert.equal(plan.authoringCopy.requiredIgnoreRule, "scratch/");
  const applied = applyOnboardingIntakeGenerate({ rootDir: root, expectedPlanSha256: plan.planSha256, activate: true });
  assert.equal(applied.authoringCopy.status, "not-written");
  assert.equal(applied.authoringCopy.code, "INTAKE-AUTHORING-COPY-NOT-IGNORED");
  assert.equal(existsSync(join(root, plan.authoringCopy.path)), false, "no copy is written outside an ignored path");
  assert.equal(existsSync(join(root, "scratch")), false);
  // The authoring copy is never part of a binding: adding the ignore rule later keeps the plan digest and the copy appears on replay.
  writeFileSync(join(root, ".gitignore"), "scratch/\n");
  const replayPlan = planOnboardingIntakeGenerate({ rootDir: root, runner: "claude" });
  assert.equal(replayPlan.planSha256, plan.planSha256);
  assert.equal(replayPlan.authoringCopy.status, "will-write");
  const replay = applyOnboardingIntakeGenerate({ rootDir: root, expectedPlanSha256: replayPlan.planSha256, activate: true });
  assert.equal(replay.mutated, false);
  assert.equal(replay.authoringCopy.status, "written");
  assert.ok(readFileSync(join(root, replay.authoringCopy.path), "utf8").includes(text));
});

test("output budget: summary and full plan sizes are independent of the input size", (t) => {
  const source = request(56000);
  const small = readyRoot(request(14030));
  const large = readyRoot(source);
  t.after(() => { rmSync(small, { recursive: true, force: true }); rmSync(large, { recursive: true, force: true }); });
  const s = cli(small).out;
  const l = cli(large).out;
  const sf = cli(small, ["--verbose"]).out;
  const lf = cli(large, ["--verbose"]).out;
  assert.ok(bytes(l) <= 8192);
  assert.ok(Math.abs(bytes(l) - bytes(s)) < 256, "summary does not scale with the source size");
  assert.ok(Math.abs(bytes(lf) - bytes(sf)) < 256, "the full plan does not scale with the source size either");
  assert.ok(bytes(lf) < bytes(source), "the full plan is smaller than the source it no longer repeats");
});

test("argument contract: --summary/--verbose are exclusive and plan-only", (t) => {
  const root = readyRoot(request(1000));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(cli(root, ["--summary", "--verbose"]).code, 2);
  let out = "";
  const code = main(["inspect", "--root", root, "--summary"], { write: (c) => { out += c; return true; }, writeError: () => true });
  assert.equal(code, 2);
  assert.match(out, /--summary is only valid for intake-generate-plan/u);
});

test("RED mirror: the no-source-material assertion fails against a mutant that embeds the request in a target", (t) => {
  const text = request(14030);
  const root = readyRoot(text);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const plan = planOnboardingIntakeGenerate({ rootDir: root, runner: "claude" });
  const real = JSON.stringify(summarizeOnboardingIntakeGeneratePlan(plan, { runner: "claude" }), null, 2);
  assertCompact(real, 8192);
  assertNoSourceMaterial(JSON.stringify(plan, null, 2), "full plan");
  // The mutant restores the old verbatim behaviour; the budget is lifted so only the material check can throw.
  const mutantPlan = { ...plan, targets: { ...plan.targets, designInput: { ...plan.targets.designInput,
    content: `${plan.targets.designInput.content}\n${text}` } } };
  assert.throws(() => assertNoSourceMaterial(JSON.stringify(mutantPlan, null, 2), "full plan"), /source material/u);
  const mutantSummary = JSON.stringify({ ...summarizeOnboardingIntakeGeneratePlan(plan, { runner: "claude" }), source: text }, null, 2);
  assert.throws(() => assertCompact(mutantSummary, 1_000_000), /source material/u);
});

function inspect(root) {
  let out = "";
  const code = main(["inspect", "--root", root, "--runner", "claude"], {
    write: (chunk) => { out += chunk; return true; }, writeError: () => true,
  });
  return { code, out };
}

// Routine inspect on the same Unicode/CRLF fixture: nothing in its output (and so nothing in
// nextAction.pendingAsks, where present) may repeat the request, and its size must not scale
// with the input. Measured on this fixture: status "partial", nextAction null, pendingAsks absent
// and continuity digests null, so this pins non-repetition and size independence only; it does
// not exercise a populated pendingAsks nor a digest binding.
test("[pendingAsks compaction] routine inspect repeats no request text and is size-independent", (t) => {
  const text = request(14030);
  const small = readyRoot(text);
  const large = readyRoot(request(56000));
  t.after(() => { rmSync(small, { recursive: true, force: true }); rmSync(large, { recursive: true, force: true }); });
  const s = inspect(small);
  const l = inspect(large);
  const asksOf = (out) => JSON.stringify(JSON.parse(out).nextAction?.pendingAsks ?? []);
  for (const run of [s, l]) {
    assert.equal(countOf(run.out, "REQ-START"), 0, "inspect must not repeat the source material");
    assert.equal(countOf(run.out, "REQ-END"), 0);
    assert.equal(countOf(run.out, "Anforderung"), 0);
    assert.equal(countOf(asksOf(run.out), "Anforderung"), 0, "pendingAsks carries no request text");
    assert.ok(bytes(run.out) <= 8192, `inspect ${bytes(run.out)} exceeds 8192`);
  }
  assert.ok(bytes(l.out) < bytes(text), "inspect is smaller than even the small input");
  assert.ok(Math.abs(bytes(l.out) - bytes(s.out)) < 256, "inspect size does not scale with the source size");
  assert.ok(bytes(asksOf(l.out)) <= bytes(asksOf(s.out)) + 256, "pendingAsks size does not scale with the source size");
});
