// SPDX-License-Identifier: SUL-1.0
// AC-108 (closest accepted criterion; PRD and Spec unchanged): the Critic evidence of an earlier reviewed commit R stays valid for a
// candidate C when every path changed between R and C is administration or documentation, and never otherwise.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { ADMINISTRATION_DOCUMENTATION_CLASSES, administrationDocumentationClassOf, isAdministrationDocumentationPath } from "./administration-documentation-paths.mjs";
import { decideCriticEvidenceCarry, administrationDocumentationOnlyCommit, describeCriticCarry } from "./critic-evidence-carry.mjs";
import { isRecordOnlyPath } from "./record-only-paths.mjs";

function repo(t) {
  const root = mkdtempSync(join(tmpdir(), "critic-evidence-carry-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git(["init", "--quiet"]);
  const write = (path, text = "x\n") => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); };
  const commit = (message) => {
    git(["add", "-A"]);
    git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "--allow-empty", "-m", message]);
    return git(["rev-parse", "HEAD"]);
  };
  return { root, git, write, commit };
}
const decide = (r, reviewedCommit, candidateCommit, extra = {}) => decideCriticEvidenceCarry({ repoRoot: r.root, reviewedCommit, candidateCommit, ...extra });

test("the set names every class and pins what belongs to each", () => {
  const ids = ADMINISTRATION_DOCUMENTATION_CLASSES.map((entry) => entry.id);
  assert.deepEqual(ids, ["record-only", "documentation-markdown", "readme", "backlog", "feature-package-generated", "feature-evidence", "audit-bundle"]);
  const inSet = {
    "record-only": ["evidence/verify-latest.json", "backlog/evidence/a.json", "docs/state.md", "project/pipeline-state.json", ".claude/pipeline-state.json", "specs/f/evidence/x.log"],
    "documentation-markdown": ["docs/guide.md", "docs/deep/dir/note.md", "docs/push-release-flow.md"],
    readme: ["docs/README.md", "docs/sub/README", "backlog/README.md", "specs/f/README.md", "audit-bundles/f/README.txt"],
    backlog: ["backlog/index.json", "backlog/items/a.md", "backlog/notes/plain.txt", "backlog/transitions.ndjson"],
    "feature-package-generated": ["specs/f/lifecycle.json", "specs/f/result.md"],
    "feature-evidence": ["specs/f/evidence/anything.json", "specs/f/evidence/sub/dir/file.bin"],
    "audit-bundle": ["audit-bundles/f/abc/manifest.json", "audit-bundles/f/x.json"],
  };
  for (const [id, paths] of Object.entries(inSet)) {
    for (const path of paths) assert.ok(isAdministrationDocumentationPath(path), `${path} (${id})`);
  }
  assert.equal(administrationDocumentationClassOf("docs/guide.md"), "documentation-markdown");
  assert.equal(administrationDocumentationClassOf("backlog/index.json"), "record-only", "the first class that matches names the path");
  assert.equal(administrationDocumentationClassOf("backlog/notes/plain.txt"), "backlog");
  assert.equal(administrationDocumentationClassOf("docs/adr/0001-x.md"), null);
  assert.equal(administrationDocumentationClassOf("audit-bundles/f/x.json"), "audit-bundle");
});

test("the record-only set is the base: every record-only path is in the set", () => {
  for (const path of ["evidence/a.json", "backlog/STATUS.md", "backlog/index.json", "specs/f/lifecycle.json", "specs/f/result.md", "docs/state.md", "project/pipeline-state.json"]) {
    assert.equal(isRecordOnlyPath(path), true, path);
    assert.equal(isAdministrationDocumentationPath(path), true, path);
  }
});

test("everything else is content: source, scripts, configuration, schemas, tests, ADRs, PRD, Spec and plan texts, the root README", () => {
  const content = [
    "src/app.js", "scripts/run.mjs", "plugins/pipeline-core/lib/x.mjs", "plugins/pipeline-core/lib/x.test.mjs", "package.json", ".gitleaksignore",
    "project/guard-config.json", "project/pipeline.json", "harness/verify-suites.json", "schemas/x.schema.json", ".claude/agents/reviewer.md", ".claude/settings.json",
    "docs/adr/0001-x.md", "docs/adr/draft-y.json", "docs/run.sh", "docs/data.json", "docs/image.png",
    "specs/f/spec.md", "specs/f/prd.md", "specs/f/plan.md", "specs/f/notes.md",
    "README.md", "CLAUDE.md", "templates/prompts/x.md", "governance/examples/README.md",
    "audit-bundles", "docs", "docs/", "backlog",
  ];
  for (const path of content) assert.equal(isAdministrationDocumentationPath(path), false, path);
});

test("a Critic export path is never in the set: it has its own receipt classifier, and a forged one must not ride on the evidence class", () => {
  assert.equal(isAdministrationDocumentationPath(`specs/f/evidence/critic/${"a".repeat(32)}/report.md`), false);
  assert.equal(isAdministrationDocumentationPath("specs/f/evidence/critic/anything"), false);
  assert.equal(isAdministrationDocumentationPath("specs/f/evidence/critic-notes.md"), true);
});

test("a Critic disposition addendum and the Markdown evidence under evidence/ keep their own byte-bound classifier", () => {
  for (const path of ["evidence/dispatch-critic-addendum-t1.json", "backlog/evidence/dispatch-critic-addendum-t1.json", "evidence/critic-disposition-evidence-t1.md", "backlog/evidence/other.md"]) {
    assert.equal(isAdministrationDocumentationPath(path), false, path);
  }
  assert.equal(isAdministrationDocumentationPath("evidence/dispatch-record-t1.json"), true);
});

test("feature-bound classes follow the feature list when one is given", () => {
  assert.equal(isAdministrationDocumentationPath("specs/other/lifecycle.json", { featureIds: ["f"] }), false);
  assert.equal(isAdministrationDocumentationPath("specs/f/lifecycle.json", { featureIds: ["f"] }), true);
  assert.equal(isAdministrationDocumentationPath("audit-bundles/other/x.json", { featureIds: ["f"] }), false);
  assert.equal(isAdministrationDocumentationPath("specs/other/lifecycle.json"), true, "without a feature list the class is feature-agnostic");
  assert.equal(isAdministrationDocumentationPath("docs/guide.md", { featureIds: ["f"] }), true);
});

test("malformed paths are never in the set", () => {
  for (const path of ["docs/../src/a.js", "docs//x.md", "./docs/x.md", "/docs/x.md", "docs\\x.md", "docs/a\0.md", "", null, undefined, 7, "docs/./x.md"]) {
    assert.equal(isAdministrationDocumentationPath(path), false, String(path));
  }
});

test("an administration-only range is carried and names the passed-over commits", (t) => {
  const r = repo(t);
  r.write("src/app.js", "1\n"); r.write("docs/guide.md", "g\n");
  const reviewed = r.commit("reviewed");
  r.write("docs/guide.md", "g2\n");
  const d1 = r.commit("docs");
  r.write("evidence/dispatch-record-x.json", "{}\n"); r.write("backlog/index.json", "{}\n");
  const d2 = r.commit("administration");
  r.write("specs/f/lifecycle.json", "{}\n"); r.write("specs/f/result.md", "# r\n"); r.write("audit-bundles/f/b/manifest.json", "{}\n");
  const d3 = r.commit("close artefacts");
  const decision = decide(r, reviewed, d3);
  assert.equal(decision.carried, true);
  assert.equal(decision.code, "CEC-CARRIED");
  assert.equal(decision.reviewedCommit, reviewed);
  assert.equal(decision.candidateCommit, d3);
  assert.deepEqual(decision.passedOverCommits, [d1, d2, d3]);
  assert.deepEqual(decision.offendingPaths, []);
  assert.ok(decision.changedPaths.includes("backlog/index.json"));
  assert.equal(decision.candidateTree, r.git(["rev-parse", `${d3}^{tree}`]));
  assert.deepEqual(decide(r, reviewed, d3, { featureIds: ["f"] }).passedOverCommits, [d1, d2, d3]);
  assert.equal(decide(r, reviewed, d3, { featureIds: ["g"] }).carried, false, "the feature-bound paths belong to another feature");
  const readback = describeCriticCarry(decision);
  assert.match(readback, new RegExp(reviewed.slice(0, 8), "u"));
  for (const commit of [d1, d2, d3]) assert.match(readback, new RegExp(commit.slice(0, 8), "u"));
});

test("one source file anywhere in the range ends the carry, even when later commits are administration only", (t) => {
  const r = repo(t);
  r.write("src/app.js", "1\n");
  const reviewed = r.commit("reviewed");
  r.write("docs/guide.md", "g\n");
  r.commit("docs");
  r.write("src/app.js", "2\n"); r.write("docs/guide.md", "g2\n");
  r.commit("source next to docs");
  r.write("docs/guide.md", "g3\n");
  const tail = r.commit("docs again");
  const decision = decide(r, reviewed, tail);
  assert.equal(decision.carried, false);
  assert.equal(decision.code, "CEC-CONTENT-CHANGED");
  assert.deepEqual(decision.offendingPaths, ["src/app.js"]);
  assert.deepEqual(decision.passedOverCommits, []);
});

test("a content change that is reverted before the candidate leaves nothing to review", (t) => {
  const r = repo(t);
  r.write("src/app.js", "1\n");
  const reviewed = r.commit("reviewed");
  r.write("src/app.js", "2\n");
  r.commit("change");
  r.write("src/app.js", "1\n");
  const reverted = r.commit("revert");
  assert.equal(decide(r, reviewed, reverted).carried, true);
});

test("a non-ancestor is not carried", (t) => {
  const r = repo(t);
  r.write("src/app.js", "1\n");
  const base = r.commit("base");
  r.git(["checkout", "--quiet", "-b", "side"]);
  r.write("docs/side.md", "s\n");
  const side = r.commit("side");
  r.git(["checkout", "--quiet", "-"]);
  r.write("docs/main.md", "m\n");
  const main = r.commit("main");
  for (const [reviewed, candidate] of [[side, main], [main, side], [main, base]]) {
    const decision = decide(r, reviewed, candidate);
    assert.equal(decision.carried, false);
    assert.equal(decision.code, "CEC-NOT-ANCESTOR");
    assert.deepEqual(decision.passedOverCommits, []);
  }
});

test("an empty range (the same commit) and unreadable input are not carried", (t) => {
  const r = repo(t);
  r.write("docs/a.md", "a\n");
  const only = r.commit("only");
  assert.equal(decide(r, only, only).carried, false);
  assert.equal(decide(r, only, only).code, "CEC-EMPTY-RANGE");
  for (const bad of ["", "zzz", "a".repeat(40), null, undefined, 5]) {
    const decision = decide(r, bad, only);
    assert.equal(decision.carried, false, String(bad));
    assert.match(decision.code, /^CEC-(?:INPUT|UNREADABLE)$/u, String(bad));
  }
  assert.equal(decideCriticEvidenceCarry({ repoRoot: join(r.root, "missing"), reviewedCommit: only, candidateCommit: only }).carried, false);
});

test("a symbolic link or an executable file named like a document is content", (t) => {
  const r = repo(t);
  r.write("src/app.js", "1\n");
  const reviewed = r.commit("reviewed");
  symlinkSync("../src/app.js", join(r.root, "docs-link.md"));
  mkdirSync(join(r.root, "docs"), { recursive: true });
  symlinkSync("../src/app.js", join(r.root, "docs/linked.md"));
  assert.equal(decide(r, reviewed, r.commit("link")).carried, false);
  r.git(["rm", "--quiet", "-f", "docs-link.md", "docs/linked.md"]);
  const clean = r.commit("clean");
  r.write("docs/exec.md", "x\n"); chmodSync(join(r.root, "docs/exec.md"), 0o755);
  const exec = r.commit("exec");
  assert.equal(decide(r, clean, exec).carried, false);
  assert.deepEqual(decide(r, clean, exec).offendingPaths, ["docs/exec.md"]);
});

test("a removed source file and a removed document: only the document is administration", (t) => {
  const r = repo(t);
  r.write("src/app.js", "1\n"); r.write("docs/a.md", "a\n");
  const reviewed = r.commit("reviewed");
  r.git(["rm", "--quiet", "docs/a.md"]);
  assert.equal(decide(r, reviewed, r.commit("docs gone")).carried, true);
  const second = r.git(["rev-parse", "HEAD"]);
  r.git(["rm", "--quiet", "src/app.js"]);
  assert.equal(decide(r, second, r.commit("source gone")).carried, false);
});

test("the per-commit test used by the course: one parent, only administration paths, no manifest change", (t) => {
  const r = repo(t);
  r.write("src/app.js", "1\n");
  r.commit("reviewed");
  r.write("docs/a.md", "a\n");
  const docs = r.commit("docs");
  r.write("specs/f/lifecycle.json", "{}\n");
  const manifest = r.commit("manifest");
  r.write("src/app.js", "2\n"); r.write("docs/a.md", "b\n");
  const mixed = r.commit("mixed");
  assert.equal(administrationDocumentationOnlyCommit(r.root, docs), true);
  assert.equal(administrationDocumentationOnlyCommit(r.root, manifest), false, "a manifest change is classified by the registration tests, not here");
  assert.equal(administrationDocumentationOnlyCommit(r.root, mixed), false);
  assert.equal(administrationDocumentationOnlyCommit(r.root, r.git(["rev-list", "--max-parents=0", "HEAD"])), false, "the root commit has no single parent");
  assert.equal(administrationDocumentationOnlyCommit(join(r.root, "missing"), docs), false);
});
