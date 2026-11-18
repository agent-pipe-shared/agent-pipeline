// SPDX-License-Identifier: SUL-1.0
// K98 (PO decision 2026-10-23, row 7/7): a CPO-FOREIGN-CHANGES refusal for the push-approval record
// names the working form. Message-only: no new write right, the refusal code and shape stay.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";import { tmpdir } from "node:os";
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

// C30G-D2 (AC-108): a close that stopped half way left an uncommitted manifest listing evidence a person deleted. The refusal named no route and nobody could proceed.
// The recovery must be in the result (`repair`, and the end of `reason`), and a tree that FOLLOWS it must commit or report nothing to commit.
test("C30G-D2: a manifest that lists deleted evidence refuses with the recovery for an uncommitted manifest, and following that recovery ends in nothing-to-commit", () => {
  const { root, run, put, evidencePath } = featureRepo("recover");
  try {
    rmSync(join(root, evidencePath));
    put("specs/feat-1/evidence/verify-candidate.json", "{}\n");
    put("specs/feat-1/acceptance.md", "# Acceptance\n");
    const head = run("rev-parse", "HEAD").trim();
    const refused = commitPipelineOwned(["--root", root, "--agent"]);
    assert.equal(refused.status, "refused");
    assert.equal(refused.code, "CPO-MANIFEST-EVIDENCE");
    assert.deepEqual(refused.missing, [evidencePath]);
    assert.equal(typeof refused.repair, "string", JSON.stringify(refused));
    assert.ok(refused.reason.endsWith(refused.repair), "the reason ends with the recovery");
    assert.ok(refused.repair.includes("git restore -- specs/feat-1/lifecycle.json"), refused.repair);
    assert.ok(refused.repair.includes("specs/feat-1/evidence/verify-candidate.json") && refused.repair.includes("specs/feat-1/acceptance.md"), "the untracked close outputs are named");
    assert.match(refused.repair, /never delete/u);
    assert.match(refused.repair, /rerun the identical close command/u);
    assert.doesNotMatch(refused.repair, /FPR-VERIFY-IMMUTABLE|already lists/u, "the manifest at HEAD does not list it: the other route is not offered");
    assert.equal(run("rev-parse", "HEAD").trim(), head, "a refusal commits nothing");
    // Follow the recovery exactly as it is worded: restore the manifest, move the untracked close outputs out of the work tree.
    run("restore", "--", "specs/feat-1/lifecycle.json");
    const outside = realpathSync(mkdtempSync(join(tmpdir(), "cpo-moved-")));
    try {
      renameSync(join(root, "specs/feat-1/evidence/verify-candidate.json"), join(outside, "verify-candidate.json"));
      renameSync(join(root, "specs/feat-1/acceptance.md"), join(outside, "acceptance.md"));
      const after = commitPipelineOwned(["--root", root, "--agent"]);
      assert.ok(["nothing-to-commit", "committed"].includes(after.status), JSON.stringify(after));
      assert.equal(run("status", "--porcelain").trim(), "");
    } finally { rmSync(outside, { recursive: true, force: true }); }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("C30G-D2: when the manifest at HEAD already lists the missing file a new Verify run cannot replace it: the recovery is the original bytes, else the course reader's damaged-course route", () => {
  const { root, run, put, evidencePath } = featureRepo("head-lists");
  try {
    run("add", "--", "specs/feat-1/lifecycle.json");
    run("commit", "-q", "-m", "manifest alone", "--", "specs/feat-1/lifecycle.json");
    rmSync(join(root, evidencePath));
    put("specs/feat-1/lifecycle.json", `${readFileSync(join(root, "specs/feat-1/lifecycle.json"), "utf8")}\n`);
    const refused = commitPipelineOwned(["--root", root, "--agent"]);
    assert.equal(refused.code, "CPO-MANIFEST-EVIDENCE", JSON.stringify(refused));
    assert.ok(refused.reason.endsWith(refused.repair));
    assert.doesNotMatch(refused.reason, /Restore or re-register that evidence first/u, "the old closing sentence is replaced, not kept beside the recovery");
    // Reading register-feature-package (addVerifyEvidence): a registered path with other bytes is FPR-VERIFY-IMMUTABLE, so a new Verify run cannot stand in; no producer or registration is offered.
    assert.match(refused.repair, /already lists specs\/feat-1\/evidence\/final-candidate-verify\.json, so a restore does not remove the entry/u);
    assert.match(refused.repair, /registered evidence is never replaced \(FPR-VERIFY-IMMUTABLE\)/u);
    assert.doesNotMatch(refused.repair, /--add-verify-evidence|verify-evidence-producer/u);
    assert.match(refused.repair, /put it back at its path with exactly the listed bytes and run node \S+commit-pipeline-owned\.mjs --root \S+ --agent again/u);
    assert.match(refused.repair, /new feature of rigor 1[\s\S]*discard-feature/u, "the damaged-course way on of the course reader, when the file is gone for good");
    // Following the first route: the original bytes put back, the same command carries them into the manifest commit.
    put(evidencePath, `${JSON.stringify({ schema: "example.verify.v1", status: "pass" })}\n`);
    const after = commitPipelineOwned(["--root", root, "--agent"]);
    assert.equal(after.status, "committed", JSON.stringify(after));
    assert.deepEqual(after.carried, [evidencePath]);
    assert.equal(run("status", "--porcelain").trim(), "");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// C30J-J7 (queue C30-24 item 9, AC-112): a person deleted a listed evidence file, or changed acceptance.md. The refusal names the way back where it happens; nothing is committed and nothing is deleted by it.
function committedFeature(name) {
  const repo = featureRepo(name);
  repo.run("add", "-A"); repo.run("commit", "-q", "-m", "feature with its evidence");
  return repo;
}

test("C30J-J7: a deleted tracked evidence file names the route: the ORIGINAL bytes back with git restore, else a new feature and the PO's discard; following it ends clean", () => {
  const { root, run, evidencePath } = committedFeature("deleted-tracked");
  try {
    rmSync(join(root, evidencePath));
    const head = run("rev-parse", "HEAD").trim();
    const refused = commitPipelineOwned(["--root", root, "--agent"]);
    assert.equal(refused.status, "refused"); assert.equal(refused.code, "CPO-FOREIGN-CHANGES"); assert.deepEqual(refused.others, [evidencePath]);
    assert.equal(typeof refused.repair, "string", JSON.stringify(refused));
    assert.ok(refused.reason.endsWith(refused.repair), "the reason ends with the recovery");
    assert.ok(refused.repair.includes(`git restore -- ${evidencePath}`), refused.repair);
    assert.match(refused.repair, /ORIGINAL bytes/u);
    assert.match(refused.repair, /git log --oneline --all -- \S+ names it and git restore --source=<commit> -- \S+/u, "when HEAD no longer holds the file");
    assert.match(refused.repair, /FPR-VERIFY-IMMUTABLE/u, "a new run cannot stand in for registered evidence");
    assert.match(refused.repair, /new feature of rigor 1[\s\S]*discard-feature/u, "gone for good");
    assert.equal(run("rev-parse", "HEAD").trim(), head, "a refusal commits nothing");
    run("restore", "--", evidencePath);
    assert.equal(commitPipelineOwned(["--root", root, "--agent"]).status, "nothing-to-commit");
    assert.equal(run("status", "--porcelain").trim(), "");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("C30J-J7: a modified tracked acceptance.md names its recovery: copy aside, restore, rerun the identical close, which writes the record again", () => {
  const { root, run, put } = committedFeature("modified-acceptance");
  try {
    put("specs/feat-1/acceptance.md", "# Acceptance\n"); run("add", "--", "specs/feat-1/acceptance.md"); run("commit", "-q", "-m", "acceptance");
    put("specs/feat-1/acceptance.md", "# Acceptance\nedited by hand\n");
    const refused = commitPipelineOwned(["--root", root, "--agent"]);
    assert.equal(refused.code, "CPO-FOREIGN-CHANGES"); assert.deepEqual(refused.others, ["specs/feat-1/acceptance.md"]);
    assert.match(refused.repair, /first copy the file outside the work tree \(nothing is deleted\), then run git restore -- specs\/feat-1\/acceptance\.md/u, refused.repair);
    assert.match(refused.repair, /specs\/feat-1\/acceptance\.md is written by the close[\s\S]*rerun the identical close command/u);
    assert.doesNotMatch(refused.repair, /ORIGINAL bytes|FPR-VERIFY-IMMUTABLE/u, "no deletion: the evidence route is not offered");
    run("restore", "--", "specs/feat-1/acceptance.md");
    assert.equal(commitPipelineOwned(["--root", root, "--agent"]).status, "nothing-to-commit");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("C30J-J7: the push-approval record refusal never offers a restore (that record is folded by push-prepare), and a mixed list restores only the other paths", () => {
  const alone = refusedFor(" M project/pipeline-state.json\n");
  assert.doesNotMatch(alone.reason, /git restore/u); assert.equal(alone.repair, undefined);
  const mixed = refusedFor(" M project/pipeline-state.json\n D src/gone.mjs\n");
  assert.ok(mixed.repair.includes("git restore -- src/gone.mjs") && !mixed.repair.includes("pipeline-state.json"), mixed.repair);
});

test("C30J-J7: a committed manifest that lists a file gone from the work tree names where the original bytes may sit in Git: the commit that held them", () => {
  const { root, run, put, evidencePath } = featureRepo("head-lists-git");
  try {
    run("add", "--", "specs/feat-1/lifecycle.json"); run("commit", "-q", "-m", "manifest alone", "--", "specs/feat-1/lifecycle.json");
    rmSync(join(root, evidencePath));
    put("specs/feat-1/lifecycle.json", `${readFileSync(join(root, "specs/feat-1/lifecycle.json"), "utf8")}\n`);
    const refused = commitPipelineOwned(["--root", root, "--agent"]);
    assert.equal(refused.code, "CPO-MANIFEST-EVIDENCE", JSON.stringify(refused));
    assert.match(refused.repair, /git log --oneline --all -- specs\/feat-1\/evidence\/final-candidate-verify\.json names the commit that held them[\s\S]*git restore --source=<commit> -- specs\/feat-1\/evidence\/final-candidate-verify\.json/u, refused.repair);
    assert.match(refused.repair, /new feature of rigor 1[\s\S]*discard-feature/u, "the gone-for-good route stays");
    assert.match(refused.repair, /If the file is gone for good: The Critic course of this feature cannot be read/u, "the sentence is joined with one space");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("K98 row 7/7: a refusal for any other foreign file keeps the plain reason", () => {
  const result = refusedFor(" M other.txt\n");
  assert.equal(result.code, "CPO-FOREIGN-CHANGES");
  assert.doesNotMatch(result.reason, /push-prepare/u);
  assert.match(result.reason, /commits only the Pipeline's own state files/u);
});

// C28-HOST-COMMIT-RECOVERY (AC-108, PO decision 2026-11-10): this command commits from Node, so no Bash guard sees it as a commit. It makes the same
// check as the commit guard itself: a commit touching a running Goldfish's write scope is refused once with the warning, unless the caller acknowledges
// that dispatch (`--acknowledge-goldfish <id>`, recorded as a `Concurrent-Goldfish:` trailer; no PO signature); a commit outside the scope only warns.
function runningFixture(allowed) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "cpo-running-")));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  git("init", "-q");
  for (const [name, value] of [["user.name", "Fixture"], ["user.email", "fixture@example.invalid"], ["commit.gpgsign", "false"], ["core.hooksPath", "/dev/null"]]) git("config", name, value);
  mkdirSync(join(root, "specs", "feat"), { recursive: true });
  writeFileSync(join(root, "specs", "feat", "slice-queue.json"), "{}\n");
  git("add", "--", "specs/feat/slice-queue.json");
  git("commit", "-q", "-m", "base");
  writeFileSync(join(root, "specs", "feat", "slice-queue.json"), "{\"changed\":true}\n");
  const dir = join(root, ".git", "agent-pipeline", "run", "native-goldfish-host-commit");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "pending-claude-RGC-ONE.json"), JSON.stringify({ createdAtMs: Date.now(), runner: "claude", binding: { dispatchId: "RGC-ONE", candidateCommit: git("rev-parse", "HEAD").trim(), allowedPaths: allowed } }));
  return { root, git };
}

test("RGC: an owned path inside a running Goldfish's scope is refused once with the dispatch named, and the acknowledgement admits it and is recorded in the commit", () => {
  const { root, git } = runningFixture(["specs/feat/slice-queue.json"]);
  try {
    const head = git("rev-parse", "HEAD").trim();
    const refused = commitPipelineOwned(["--root", root, "--agent"]);
    assert.equal(refused.status, "refused");
    assert.equal(refused.code, "CPO-RUNNING-GOLDFISH");
    assert.match(refused.reason, /RGC-ONE/u);
    assert.match(refused.reason, /specs\/feat\/slice-queue\.json/u);
    assert.match(refused.reason, /--acknowledge-goldfish RGC-ONE/u);
    assert.equal(git("rev-parse", "HEAD").trim(), head, "the refusal committed nothing");
    const admitted = commitPipelineOwned(["--root", root, "--agent", "--acknowledge-goldfish", "RGC-ONE"]);
    assert.equal(admitted.status, "committed", JSON.stringify(admitted));
    assert.match(git("log", "-1", "--format=%B"), /^Concurrent-Goldfish: RGC-ONE$/mu);
    assert.match(admitted.warnings?.[0] ?? "", /RGC-ONE/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("RGC: an owned path outside a running Goldfish's scope commits with the warning only", () => {
  const { root, git } = runningFixture(["src/elsewhere.txt"]);
  try {
    const result = commitPipelineOwned(["--root", root, "--agent"]);
    assert.equal(result.status, "committed", JSON.stringify(result));
    assert.match(result.warnings?.[0] ?? "", /RGC-ONE/u);
    assert.doesNotMatch(git("log", "-1", "--format=%B"), /Concurrent-Goldfish/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
