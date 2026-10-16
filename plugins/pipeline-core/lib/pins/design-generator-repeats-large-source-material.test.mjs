// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.design-generator-repeats-large-source-material (AC-152).
// Drives the real onboarding CLI main() and the real intake-generate library
// against a ~14 KB Unicode/CRLF request. No behavior under test is mocked.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function readyRoot(text) {
  const root = mkdtempTestScratch("alf-c-p16-03-");
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, "project", "pipeline.yaml"), "schema: pipeline.project.v1\n");
  writeFileSync(join(root, "project", "pipeline.json"), `${JSON.stringify({
    project: "fixture", verify: "node verify.mjs", autonomy: "bounded", branchModel: "local",
    worktree: "supported", stakes: "high", constraints: [],
  }, null, 2)}\n`);
  const git = spawnSync("git", ["init", "-q"], { cwd: root, encoding: "utf8", shell: false });
  assert.equal(git.status, 0, git.stderr);
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
function assertCompact(summaryText, request_, fullText, budget) {
  assert.ok(bytes(summaryText) <= budget, `summary ${bytes(summaryText)} exceeds budget ${budget}`);
  assert.equal(countOf(summaryText, "REQ-START"), 0, "summary must not repeat the source material");
  assert.ok(bytes(summaryText) * 10 < bytes(fullText), "summary must be at least 10x smaller than the full plan");
  assert.ok(request_.length > 0);
}

test("measured before/after: summary drops the repeated request, full plan is the repeated baseline", (t) => {
  const text = request(14030);
  const root = readyRoot(text);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const verbose = cli(root, ["--verbose"]);
  const summary = cli(root, ["--summary"]);
  const dflt = cli(root);
  assert.deepEqual([verbose.code, summary.code, dflt.code], [0, 0, 0]);
  assert.equal(dflt.out, summary.out, "default output is the compact summary");
  const full = JSON.parse(verbose.out);
  // duplication measured: the request is stored in design-input, PRD and spec (3 copies, source unchanged by the compaction)
  const stored = Object.values(full.targets).map((target) => countOf(target.content, "REQ-START"));
  assert.deepEqual(stored, [1, 1, 1]);
  assert.ok(countOf(verbose.out, "REQ-START") >= 3, "full plan repeats the request per target");
  assert.equal(countOf(summary.out, "REQ-START"), 0);
  assertCompact(summary.out, text, verbose.out, 8192);
  assert.ok(bytes(verbose.out) > bytes(text) * 3, "full plan is dominated by the repeated request");
});

test("identical requirement coverage: summary references bind the full plan's exact bytes; full action reproduces it", (t) => {
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
    assert.ok(target.content.includes(text), `${name} still carries the whole request verbatim (CRLF/Unicode)`);
  }
  assert.deepEqual(summary.nextAction, full.nextAction);
  const replay = summary.fullPlanAction;
  assert.equal(replay.mutation, false);
  assert.equal(replay.argv.includes("--verbose"), true);
  const again = cli(root, replay.argv.slice(2).filter((_, i, a) => !(a[i - 1] === "--root" || a[i] === "--root")));
  assert.equal(again.out, verbose.out, "explicit full-plan action reproduces the full response byte-for-byte");
});

test("a fresh reviewer can reach the source: apply writes artifacts matching the summary and the private source is retrievable", (t) => {
  const text = request(14030);
  const root = readyRoot(text);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const summary = JSON.parse(cli(root).out);
  const applied = applyOnboardingIntakeGenerate({ rootDir: root, expectedPlanSha256: summary.planSha256, activate: true });
  assert.equal(applied.mutated, true);
  for (const target of Object.values(summary.targets)) {
    const disk = readFileSync(join(root, target.path), "utf8");
    assert.equal(sha(disk), target.afterSha256);
    assert.equal(bytes(disk), target.byteLength);
    assert.ok(disk.includes(text));
  }
  const material = readOnboardingIntakeMaterialInput({ rootDir: root });
  assert.ok(JSON.stringify(material).includes("REQ-END"), "original request stays retrievable from the immutable intake store");
});

test("output budget: summary size is independent of the input size while the full plan grows", (t) => {
  const small = readyRoot(request(14030));
  const large = readyRoot(request(56000));
  t.after(() => { rmSync(small, { recursive: true, force: true }); rmSync(large, { recursive: true, force: true }); });
  const s = cli(small).out;
  const l = cli(large).out;
  const lf = cli(large, ["--verbose"]).out;
  assert.ok(bytes(l) <= 8192);
  assert.ok(Math.abs(bytes(l) - bytes(s)) < 256, "summary does not scale with the source size");
  assert.ok(bytes(lf) > 150000, "full plan scales with the source size (3 copies)");
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

test("RED mirror: the compactness assertion fails against a mutant that embeds the target content", (t) => {
  const text = request(14030);
  const root = readyRoot(text);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const plan = planOnboardingIntakeGenerate({ rootDir: root, runner: "claude" });
  const real = JSON.stringify(summarizeOnboardingIntakeGeneratePlan(plan, { runner: "claude" }), null, 2);
  const fullText = JSON.stringify(plan, null, 2);
  assertCompact(real, text, fullText, 8192);
  const mutant = JSON.stringify({ ...summarizeOnboardingIntakeGeneratePlan(plan, { runner: "claude" }), targets: plan.targets }, null, 2);
  assert.throws(() => assertCompact(mutant, text, fullText, 8192));
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
