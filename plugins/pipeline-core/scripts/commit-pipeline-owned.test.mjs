// SPDX-License-Identifier: SUL-1.0
// K98 (PO decision 2026-10-23, row 7/7): a CPO-FOREIGN-CHANGES refusal for the push-approval record
// names the working form. Message-only: no new write right, the refusal code and shape stay.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { courseEvidenceGapText, criticCourseRepair, locateCourseEvidenceGap, resolveRegisteredCriticCourseHistory } from "../lib/critic-course-admission.mjs";
import { commitPipelineOwned } from "./commit-pipeline-owned.mjs";

function refusedFor(statusOut) {
  const root = mkdtempSync(join(tmpdir(), "cpo-k98-"));
  const spawn = (_cmd, args) => (args.includes("status")
    ? { status: 0, stdout: statusOut, stderr: "" }
    : { status: 0, stdout: "", stderr: "" });
  return commitPipelineOwned(["--root", root, "--agent"], { spawn });
}

test("K98 row 7/7: the push-approval record refusal names the fold and the admitted trailer form", () => {
  const result = refusedFor(" M project/pipeline-state.json\n");
  assert.equal(result.status, "refused");
  assert.equal(result.code, "CPO-FOREIGN-CHANGES");
  assert.deepEqual(result.owned, []);
  assert.deepEqual(result.others, ["project/pipeline-state.json"]);
  assert.match(result.reason, /push-prepare/u);
  assert.match(result.reason, /do not commit it by hand/u);
  assert.match(result.reason, /Dispatch: stage-0 \(elephant\)/u);
});

function runWith(statusOut) {
  const root = mkdtempSync(join(tmpdir(), "cpo-untracked-"));
  const calls = [];
  const spawn = (_cmd, args) => {
    calls.push(args.slice(2));
    if (args.includes("status")) return { status: 0, stdout: statusOut, stderr: "" };
    if (args.includes("rev-parse")) return { status: 0, stdout: "a".repeat(40) + "\n", stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  };
  return { result: commitPipelineOwned(["--root", root, "--agent"], { spawn }), calls };
}

test("an untracked foreign file is listed as untouched and the owned queue is still committed by its own path", () => {
  const { result, calls } = runWith("?? docs/report.md\n M specs/feature/slice-queue.json\n");
  assert.equal(result.status, "committed");
  assert.deepEqual(result.owned, ["specs/feature/slice-queue.json"]);
  assert.deepEqual(result.untouched, ["docs/report.md"]);
  const add = calls.find((args) => args[0] === "add"), commit = calls.find((args) => args[0] === "commit");
  assert.deepEqual(add.slice(add.indexOf("--") + 1), ["specs/feature/slice-queue.json"]);
  assert.deepEqual(commit.slice(commit.indexOf("--") + 1), ["specs/feature/slice-queue.json"]);
});

test("a modified tracked foreign file still refuses, and the untracked one is named apart from it", () => {
  const { result, calls } = runWith(" M src/app.mjs\n?? docs/report.md\n M specs/feature/slice-queue.json\n");
  assert.equal(result.status, "refused");
  assert.equal(result.code, "CPO-FOREIGN-CHANGES");
  assert.deepEqual(result.others, ["src/app.mjs"]);
  assert.deepEqual(result.untouched, ["docs/report.md"]);
  assert.equal(calls.some((args) => args[0] === "commit" || args[0] === "add"), false);
});

// Codex greenfield, candidate 27: the close route committed a feature manifest alone while it listed an untracked
// evidence file, and every later Critic course read of that feature failed for good. Real Git, real course reader.
function featureRepo(name) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), `cpo-evidence-${name}-`)));
  const run = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  run("init", "-q");
  run("config", "user.name", "Test");
  run("config", "user.email", "test@example.invalid");
  run("config", "commit.gpgsign", "false");
  const put = (rel, text) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); };
  const project = JSON.stringify({ schema: "pipeline.project.v1", project: "cpo-evidence", verify: null, autonomy: "gated", handover: "docs/state.md" });
  put("project/pipeline.json", project); put(".claude/pipeline.json", project);
  put("project/pipeline-state.json", JSON.stringify({ continuity: { featureId: "feat-1", authority: { prd: { path: "specs/feat-1/prd.md", sha256: "0".repeat(64) } } } }));
  put("specs/feat-1/prd.md", "# PRD\n");
  const manifest = { schema: "pipeline.feature-package.v1", feature: { id: "feat-1" }, artifacts: [] };
  put("specs/feat-1/lifecycle.json", `${JSON.stringify(manifest, null, 2)}\n`);
  run("add", "-A");
  run("commit", "-q", "-m", "base");
  const evidencePath = "specs/feat-1/evidence/final-candidate-verify.json";
  const evidence = `${JSON.stringify({ schema: "example.verify.v1", status: "pass" })}\n`;
  put(evidencePath, evidence);
  const listed = { ...manifest, artifacts: [{ class: "candidate-evidence", path: evidencePath, sha256: createHash("sha256").update(evidence).digest("hex"),
    authority: false, mutability: "immutable", retention: "retain" }] };
  put("specs/feat-1/lifecycle.json", `${JSON.stringify(listed, null, 2)}\n`);
  return { root, run, put, evidencePath };
}

test("Codex report: an owned manifest is committed together with the untracked evidence it lists, and the course still reads", () => {
  const { root, run, evidencePath } = featureRepo("carry");
  try {
    const result = commitPipelineOwned(["--root", root, "--agent"]);
    assert.equal(result.status, "committed", JSON.stringify(result));
    assert.deepEqual(result.owned, ["specs/feat-1/lifecycle.json"]);
    assert.deepEqual(result.carried, [evidencePath]);
    assert.equal(result.untouched, undefined, "the carried file is not reported as left alone");
    assert.deepEqual(run("show", "--name-only", "--format=", "HEAD").trim().split("\n").sort(), [evidencePath, "specs/feat-1/lifecycle.json"].sort());
    assert.match(run("show", "-s", "--format=%B", "HEAD"), /those files, with exactly the listed bytes, are committed with it/u);
    assert.equal(run("status", "--porcelain").trim(), "");
    const history = resolveRegisteredCriticCourseHistory({ repoRoot: root, featureId: "feat-1", candidateCommit: run("rev-parse", "HEAD").trim() });
    assert.deepEqual(history.history, []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("Codex report: the manifest committed alone is the gap the course reader cannot pass (control for the test above)", () => {
  const { root, run } = featureRepo("control");
  try {
    run("add", "--", "specs/feat-1/lifecycle.json");
    run("commit", "-q", "-m", "manifest alone", "--", "specs/feat-1/lifecycle.json");
    run("add", "-A");
    run("commit", "-q", "-m", "evidence later");
    const head = run("rev-parse", "HEAD").trim();
    assert.throws(() => resolveRegisteredCriticCourseHistory({ repoRoot: root, featureId: "feat-1", candidateCommit: head }),
      (error) => error.code === "CCA-EVIDENCE-READ");
    // An already damaged history is named, not repaired: the commit, the path and the one way on (PO tile 2026-11-10).
    const gapCommit = run("rev-parse", "HEAD~1").trim();
    const gap = locateCourseEvidenceGap({ repoRoot: root, featureId: "feat-1", commit: head });
    assert.deepEqual(gap, { commit: gapCommit, path: "specs/feat-1/evidence/final-candidate-verify.json" });
    const text = criticCourseRepair("CCA-EVIDENCE-MODE", gap);
    assert.equal(typeof text, "string");
    assert.ok(text.includes(gapCommit) && text.includes("specs/feat-1/evidence/final-candidate-verify.json"), text);
    assert.match(text, /new feature of rigor 1/u);
    assert.match(courseEvidenceGapText("CCA-EVIDENCE-READ", null), /a revision of the feature manifest lists an evidence file/u);
    assert.equal(courseEvidenceGapText("CCA-PARENT", gap), null, "other codes keep their own repair");
    assert.equal(locateCourseEvidenceGap({ repoRoot: root, featureId: "feat-1", commit: gapCommit.replace(/.$/u, "x") }), null, "a malformed commit yields null");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("Codex report: listed evidence with other bytes than the manifest digest refuses and commits nothing", () => {
  const { root, run, put, evidencePath } = featureRepo("mismatch");
  try {
    put(evidencePath, "changed\n");
    const head = run("rev-parse", "HEAD").trim();
    const result = commitPipelineOwned(["--root", root, "--agent"]);
    assert.equal(result.status, "refused");
    assert.equal(result.code, "CPO-MANIFEST-EVIDENCE");
    assert.deepEqual(result.missing, [evidencePath]);
    assert.match(result.reason, /could not be read again/u);
    assert.equal(run("rev-parse", "HEAD").trim(), head);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("K98 row 7/7: a refusal for any other foreign file keeps the plain reason", () => {
  const result = refusedFor(" M other.txt\n");
  assert.equal(result.code, "CPO-FOREIGN-CHANGES");
  assert.doesNotMatch(result.reason, /push-prepare/u);
  assert.match(result.reason, /commits only the Pipeline's own state files/u);
});
