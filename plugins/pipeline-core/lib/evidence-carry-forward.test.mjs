// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { randomBytes } from "node:crypto";

import { CARRY_FORWARD_SCHEMA, EVIDENCE_PATH_PATTERNS, evaluateEvidenceCarryForward, isEvidencePath, productTreeSha256 } from "./evidence-carry-forward.mjs";
import { evidenceCarriedForward, gitleaksRangeSecretScan } from "./evidence-carry-forward-reader.mjs";
import { isInstalled as isGitleaksInstalled } from "../scripts/security-adapters/gitleaks.mjs";

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

test("ECF9: the reader never throws, carries Verify and Security with a scan, and refuses everything else", () => {
  const { root, base } = baseRepo();
  const head = commit(root, { "specs/f/evidence/a.json": "{}\n" }, "evidence");
  const product = commit(root, { "src/app.mjs": "export const a = 9;\n" }, "product");
  const clean = () => ({ status: "clean" });
  assert.equal(evidenceCarriedForward({ root, record: { commit: base }, kind: "verify", candidateCommit: head }).carried, true, "Verify needs no scan");
  assert.equal(evidenceCarriedForward({ root, record: { commit: base }, kind: "security", candidateCommit: head, secretScan: clean }).carried, true);
  const refusals = [
    [{ record: { commit: base }, kind: "security", candidateCommit: head, secretScan: () => ({ status: "finding" }) }, "SECRET-SCAN-FINDING"],
    [{ record: { commit: base }, kind: "security", candidateCommit: head, secretScan: () => ({ status: "unavailable" }) }, "SECRET-SCAN-UNAVAILABLE"],
    [{ record: { commit: base }, kind: "verify", candidateCommit: product }, "PRODUCT-PATH-CHANGED"],
    [{ record: { commit: head }, kind: "verify", candidateCommit: base }, "NOT-AN-ANCESTOR"],
    [{ record: { commit: "main" }, kind: "verify", candidateCommit: head }, "CARRY-FORWARD-INPUT-INVALID"],
    [{ record: null, kind: "verify", candidateCommit: head }, "CARRY-FORWARD-INPUT-INVALID"],
    [{ record: { commit: base }, kind: "critic", candidateCommit: head }, "CARRY-FORWARD-INPUT-INVALID"],
  ];
  for (const [input, reason] of refusals) {
    const decision = evidenceCarriedForward({ root, ...input });
    assert.equal(decision.carried, false, reason);
    assert.equal(decision.reason, reason);
  }
  assert.equal(evidenceCarriedForward({ root: join(root, "missing"), record: { commit: base }, kind: "verify", candidateCommit: head }).carried, false, "a root that is not a repository is a refusal, not a throw");
});

test("ECF10: the range scan asks gitleaks for exactly the passed-over commits and maps every outcome closed", () => {
  const calls = [];
  const deps = (status, extra = {}) => ({
    isInstalled: () => ({ installed: true, path: "/bin/gitleaks-fixture" }),
    resolveConfig: () => "/cfg/gitleaks.toml",
    spawn: (path, args, options) => { calls.push({ path, args, options }); return { status, ...extra }; },
  });
  const context = { root: "/repo", commit: "c".repeat(40), evidenceCommit: "a".repeat(40) };
  assert.deepEqual(gitleaksRangeSecretScan([], context, deps(0)), { status: "clean" });
  assert.deepEqual(calls[0].args, ["git", "/repo", "--log-opts", `${"a".repeat(40)}..${"c".repeat(40)}`, "--config", "/cfg/gitleaks.toml", "--no-banner", "--redact", "--exit-code", "2"]);
  assert.equal(calls[0].options.shell, false);
  assert.deepEqual(gitleaksRangeSecretScan([], context, deps(2)), { status: "finding" });
  assert.deepEqual(gitleaksRangeSecretScan([], context, deps(1)), { status: "unavailable" });
  assert.deepEqual(gitleaksRangeSecretScan([], context, deps(null)), { status: "unavailable" });
  assert.deepEqual(gitleaksRangeSecretScan([], context, deps(0, { error: new Error("ETIMEDOUT") })), { status: "unavailable" });
  assert.deepEqual(gitleaksRangeSecretScan([], context, { ...deps(0), isInstalled: () => ({ installed: false }) }), { status: "unavailable" });
  assert.deepEqual(gitleaksRangeSecretScan([], context, { ...deps(0), resolveConfig: () => null }), { status: "unavailable" });
  assert.deepEqual(gitleaksRangeSecretScan([], context, { ...deps(0), spawn: () => { throw new Error("spawn failed"); } }), { status: "unavailable" });
  assert.deepEqual(gitleaksRangeSecretScan([], { root: "/repo", commit: "c".repeat(40) }, deps(0)), { status: "unavailable" }, "no evidence commit, no range");
  assert.deepEqual(gitleaksRangeSecretScan(), { status: "unavailable" });
});

test("ECF11: with the real gitleaks, a clean range is clean and a planted token is a finding (skipped when gitleaks is not installed)", { skip: !isGitleaksInstalled(process.env).installed }, () => {
  const { root, base } = baseRepo();
  const cleanHead = commit(root, { "specs/f/evidence/a.json": "{\"ok\":true}\n" }, "clean evidence");
  assert.equal(evidenceCarriedForward({ root, record: { commit: base }, kind: "security", candidateCommit: cleanHead }).carried, true);
  // Built at run time so this source file never contains a token-shaped literal.
  const token = ["gh", "p_", randomBytes(27).toString("base64").replace(/[^A-Za-z0-9]/gu, "A").padEnd(36, "x").slice(0, 36)].join("");
  const leakyHead = commit(root, { "specs/f/evidence/leak.json": JSON.stringify({ token }) + "\n" }, "evidence with a token");
  const decision = evidenceCarriedForward({ root, record: { commit: base }, kind: "security", candidateCommit: leakyHead });
  assert.equal(decision.carried, false);
  assert.equal(decision.reason, "SECRET-SCAN-FINDING");
});
