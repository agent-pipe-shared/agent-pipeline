// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { CARRY_FORWARD_SCHEMA, EVIDENCE_PATH_PATTERNS, evaluateEvidenceCarryForward, isEvidencePath, productTreeSha256 } from "./evidence-carry-forward.mjs";

const scratchRoots = [];
test.after(() => { for (const dir of scratchRoots) rmSync(dir, { recursive: true, force: true }); });

function git(root, ...args) {
  return execFileSync("git", ["-C", root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" }).trim();
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "ecf-"));
  scratchRoots.push(root);
  git(root, "init", "-q");
  return root;
}

function commit(root, files, message) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  git(root, "add", "--all");
  git(root, "commit", "-q", "-m", message);
  return git(root, "rev-parse", "HEAD");
}

function baseRepo() {
  const root = fixture();
  const base = commit(root, {
    "src/app.mjs": "export const a = 1;\n",
    "specs/f/plan.md": "plan\n",
    "specs/f/evidence/verify.json": "{}\n",
    "project/guard-config.json": "{}\n",
  }, "base");
  return { root, base };
}

test("ECF1: the evidence set is closed by record class, everything else is product-bound", () => {
  for (const path of ["specs/f/evidence/verify.json", "specs/f/evidence/deep/run.log", "specs/f/audit-bundles/b.json", "specs/f/lifecycle.json", "specs/f/result.md", "project/push-threat-model.md"]) {
    assert.equal(isEvidencePath(path), true, path);
  }
  for (const path of ["specs/f/plan.md", "specs/f/spec.md", "specs/f/prd.md", "project/guard-config.json", "project/other.md", "src/app.mjs", "specs/f/sub/evidence/x.json",
    "specs/f/evidenceX/a.json", "specs/f/lifecycle.json.bak", "specs/evidence/x.json", "scripts/evidence/x.json", "", "/specs/f/evidence/x.json", "specs/f/evidence/../plan.md"]) {
    assert.equal(isEvidencePath(path), false, path);
  }
  assert.ok(Object.isFrozen(EVIDENCE_PATH_PATTERNS));
  assert.equal(isEvidencePath(undefined), false);
});

test("ECF2: an evidence-only range carries Verify forward and names the passed-over commits", () => {
  const { root, base } = baseRepo();
  const first = commit(root, { "specs/f/evidence/new.json": "{\"n\":1}\n", "specs/f/lifecycle.json": "{}\n" }, "evidence one");
  const head = commit(root, { "specs/f/result.md": "r\n", "project/push-threat-model.md": "t\n" }, "evidence two");
  const decision = evaluateEvidenceCarryForward({ root, evidenceCommit: base, candidateCommit: head, kind: "verify" });
  assert.equal(decision.schema, CARRY_FORWARD_SCHEMA);
  assert.equal(decision.carried, true);
  assert.equal(decision.reason, "EVIDENCE-ONLY");
  assert.deepEqual(decision.passedOverCommits, [first, head]);
  assert.deepEqual(decision.changedEvidencePaths, ["project/push-threat-model.md", "specs/f/evidence/new.json", "specs/f/lifecycle.json", "specs/f/result.md"]);
  assert.equal(decision.productTreeSha256, productTreeSha256(root, base));
});

test("ECF3: any product path in the range stops the carry-forward and names the path", () => {
  for (const [path, content] of [["src/app.mjs", "export const a = 2;\n"], ["specs/f/plan.md", "changed\n"], ["project/guard-config.json", "{\"x\":1}\n"], ["specs/f/sub/evidence/x.json", "{}\n"]]) {
    const { root, base } = baseRepo();
    commit(root, { "specs/f/evidence/new.json": "{}\n" }, "evidence");
    const head = commit(root, { [path]: content }, "product");
    const decision = evaluateEvidenceCarryForward({ root, evidenceCommit: base, candidateCommit: head, kind: "verify" });
    assert.equal(decision.carried, false, path);
    assert.equal(decision.reason, "PRODUCT-PATH-CHANGED", path);
    assert.equal(decision.path, path);
  }
});

test("ECF4: a deletion of a product file and a rename out of the evidence set are product changes", () => {
  const { root, base } = baseRepo();
  git(root, "rm", "-q", "src/app.mjs");
  git(root, "commit", "-q", "-m", "delete product");
  const deleted = git(root, "rev-parse", "HEAD");
  assert.equal(evaluateEvidenceCarryForward({ root, evidenceCommit: base, candidateCommit: deleted, kind: "verify" }).reason, "PRODUCT-PATH-CHANGED");
  const second = baseRepo();
  git(second.root, "mv", "specs/f/evidence/verify.json", "src/verify.json");
  git(second.root, "commit", "-q", "-m", "rename out");
  const renamed = git(second.root, "rev-parse", "HEAD");
  const decision = evaluateEvidenceCarryForward({ root: second.root, evidenceCommit: second.base, candidateCommit: renamed, kind: "verify" });
  assert.equal(decision.carried, false);
  assert.equal(decision.path, "src/verify.json");
});

test("ECF5: the same commit is trivially carried; a commit that is not a descendant is not", () => {
  const { root, base } = baseRepo();
  assert.equal(evaluateEvidenceCarryForward({ root, evidenceCommit: base, candidateCommit: base, kind: "verify" }).reason, "SAME-COMMIT");
  const head = commit(root, { "specs/f/evidence/a.json": "{}\n" }, "evidence");
  const backwards = evaluateEvidenceCarryForward({ root, evidenceCommit: head, candidateCommit: base, kind: "verify" });
  assert.equal(backwards.carried, false);
  assert.equal(backwards.reason, "NOT-AN-ANCESTOR");
  git(root, "checkout", "-q", "--detach", base);
  const side = commit(root, { "specs/f/evidence/b.json": "{}\n" }, "side evidence");
  assert.equal(evaluateEvidenceCarryForward({ root, evidenceCommit: head, candidateCommit: side, kind: "verify" }).reason, "NOT-AN-ANCESTOR");
});

test("ECF6: Security evidence is carried only with a clean scan of the changed files, and every other outcome fails closed", () => {
  const { root, base } = baseRepo();
  const head = commit(root, { "specs/f/evidence/new.json": "{}\n", "specs/f/result.md": "r\n" }, "evidence");
  const seen = [];
  const clean = (files, context) => { seen.push({ files, commit: context.commit, root: context.root }); return { status: "clean" }; };
  const carried = evaluateEvidenceCarryForward({ root, evidenceCommit: base, candidateCommit: head, kind: "security", secretScan: clean });
  assert.equal(carried.carried, true);
  assert.deepEqual(seen, [{ files: ["specs/f/evidence/new.json", "specs/f/result.md"], commit: head, root }]);
  const failures = [
    [undefined, "SECRET-SCAN-UNAVAILABLE"],
    [() => ({ status: "finding" }), "SECRET-SCAN-FINDING"],
    [() => ({ status: "unavailable" }), "SECRET-SCAN-UNAVAILABLE"],
    [() => { throw new Error("scanner crashed"); }, "SECRET-SCAN-UNAVAILABLE"],
    [() => ({}), "SECRET-SCAN-UNAVAILABLE"],
    [() => null, "SECRET-SCAN-UNAVAILABLE"],
  ];
  for (const [secretScan, reason] of failures) {
    const decision = evaluateEvidenceCarryForward({ root, evidenceCommit: base, candidateCommit: head, kind: "security", secretScan });
    assert.equal(decision.carried, false);
    assert.equal(decision.reason, reason);
  }
  assert.equal(evaluateEvidenceCarryForward({ root, evidenceCommit: base, candidateCommit: head, kind: "verify" }).carried, true, "Verify needs no scan");
});

test("ECF7: the product tree hash ignores evidence files only", () => {
  const { root, base } = baseRepo();
  const evidenceOnly = commit(root, { "specs/f/evidence/other.json": "{\"o\":1}\n", "specs/f/lifecycle.json": "{}\n" }, "evidence");
  const product = commit(root, { "src/app.mjs": "export const a = 3;\n" }, "product");
  assert.equal(productTreeSha256(root, base), productTreeSha256(root, evidenceOnly));
  assert.notEqual(productTreeSha256(root, evidenceOnly), productTreeSha256(root, product));
  assert.match(productTreeSha256(root, base), /^[0-9a-f]{64}$/u);
});

test("ECF8: arguments are validated and the decision never changes the repository", () => {
  const { root, base } = baseRepo();
  const head = commit(root, { "specs/f/evidence/a.json": "{}\n" }, "evidence");
  assert.throws(() => evaluateEvidenceCarryForward({ root, evidenceCommit: "HEAD", candidateCommit: head, kind: "verify" }), /full 40-hex/u);
  assert.throws(() => evaluateEvidenceCarryForward({ root, evidenceCommit: base, candidateCommit: "--output=x", kind: "verify" }), /full 40-hex/u);
  assert.throws(() => evaluateEvidenceCarryForward({ root, evidenceCommit: base, candidateCommit: head, kind: "critic" }), /kind must be/u);
  assert.throws(() => productTreeSha256(root, "main"), /full 40-hex/u);
  const before = git(root, "status", "--porcelain=v1");
  evaluateEvidenceCarryForward({ root, evidenceCommit: base, candidateCommit: head, kind: "verify" });
  assert.equal(git(root, "status", "--porcelain=v1"), before);
  assert.equal(git(root, "rev-parse", "HEAD"), head);
});
