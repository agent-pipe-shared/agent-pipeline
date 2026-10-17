// SPDX-License-Identifier: SUL-1.0
// Pin (ALF-C-P15-02, AC-146): original Alfred item
// pipeline.declared-product-criteria-need-matching-acceptance-evidence.
// Declared product criteria (AC ids in the Spec) must be reported with the evidence that actually
// matches them: a name or a structural presence is never satisfaction, a published verify result or
// a verify-suite receipt is an association (not product acceptance), a stale/unbound artifact is
// never current evidence, no browser proof is invented, and the report stays report-only with no
// completion effect and no extra closure gate. Exercises the real module and the real CLI against a
// real git fixture under scratch/ (no mocks of the behaviour under test).
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const libDir = resolve(here, "..");
const pluginRoot = resolve(libDir, "..");
const repoRoot = resolve(pluginRoot, "..", "..");
const scratchBase = join(repoRoot, "scratch");
mkdirSync(scratchBase, { recursive: true });
const work = realpathSync(mkdtempSync(join(scratchBase, "alf-c-p15-02-")));
after(() => rmSync(work, { recursive: true, force: true }));

const { openReportCandidate } = await import(pathToFileURL(join(libDir, "report-source-readers.mjs")).href);
const prod = await import(pathToFileURL(join(libDir, "declared-criteria-evidence-report.mjs")).href);
const cliPath = join(pluginRoot, "scripts", "acceptance-coverage-report.mjs");

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const GIT_ARGS = ["-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false",
  "-c", "core.autocrlf=false"];
function git(cwd, ...args) {
  return execFileSync("git", [...GIT_ARGS, ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function commit(cwd, files, message) {
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(cwd, path)), { recursive: true }); writeFileSync(join(cwd, path), body);
  }
  git(cwd, "add", "--", ...Object.keys(files));
  git(cwd, "commit", "--no-verify", "-q", "-m", message);
  return git(cwd, "rev-parse", "HEAD");
}
function fixture(name, files) {
  const dir = join(work, name); mkdirSync(dir);
  git(dir, "init", "-q");
  const head = commit(dir, files, "chore: fixture");
  return { dir, head, tree: git(dir, "rev-parse", `${head}^{tree}`) };
}
const SPEC_PATH = "specs/f/spec.md";
const SPEC = "# Spec\nAC-ONE is declared.\nAC-TWO is declared.\nAC-THREE is declared.\nAC-FOUR is declared.\n";
const MAP_PATH = "specs/f/spec.requirements.json";
const map = criteria => JSON.stringify({ schema: "pipeline.requirement-traceability.v1", specPath: SPEC_PATH, specSha256: sha(SPEC), criteria });
const SRC = { "src/a.txt": "hello world\n" };

// Host limitation: the module under test resolves git only from fixed trusted roots (no seam);
// where none resolves (native Windows host without git in those roots) the git-backed cases are skipped.
const { resolveTrustedSystemExecutable } = await import(pathToFileURL(join(libDir, "trusted-tool-resolution.mjs")).href);
const trustedGit = resolveTrustedSystemExecutable("git", { homeDir: null });
const SKIP = trustedGit.ok ? false
  : `host-limitation: no trusted git (${trustedGit.status}); owner Coordinator, due 2026-10-19 for the Linux/WSL run (PO decision K7)`;
const lazy = build => SKIP ? undefined : build();

// A: spec with four AC mentions, NO map -> nothing can be classified.
const A = lazy(() => fixture("a", { [SPEC_PATH]: SPEC, ...SRC }));
// B: map classifies three of the four mentions; one absent path, one absent literal.
const B = lazy(() => fixture("b", { [SPEC_PATH]: SPEC, ...SRC, [MAP_PATH]: map([
  { id: "AC-ONE", predicate: "path-exists", path: "src/a.txt" },
  { id: "AC-TWO", predicate: "path-exists", path: "src/missing.txt" },
  { id: "AC-THREE", predicate: "file-contains-literal", path: "src/a.txt", literal: "no such literal" }]) }));
// C: every declared criterion is structurally present: still must not read as satisfied.
const SPEC_C = "# Spec\nAC-ONE is declared.\n";
const C = lazy(() => fixture("c", { [SPEC_PATH]: SPEC_C, ...SRC, [MAP_PATH]: JSON.stringify({ schema: "pipeline.requirement-traceability.v1",
  specPath: SPEC_PATH, specSha256: sha(SPEC_C), criteria: [{ id: "AC-ONE", predicate: "file-contains-literal", path: "src/a.txt", literal: "hello" }] }) }));
// D: map digest does not match the candidate Spec bytes (stale map).
const D = lazy(() => fixture("d", { [SPEC_PATH]: SPEC + "changed after the map\n", ...SRC, [MAP_PATH]: map([
  { id: "AC-ONE", predicate: "path-exists", path: "src/a.txt" }]) }));

function artifact(fx, path, value) {
  mkdirSync(dirname(join(fx.dir, path)), { recursive: true });
  writeFileSync(join(fx.dir, path), typeof value === "string" ? value : JSON.stringify(value));
}
function report(fx, options, mod = prod) {
  return mod.reportDeclaredCriteriaEvidence(openReportCandidate({ repoRoot: fx.dir, candidateCommit: fx.head }), options);
}
const verifyDoc = (fx, extra = {}) => ({ schema: "pipeline.verify-evidence.v0", candidate: { commit: fx.head, tree: fx.tree },
  exitCode: 0, steps: [{ name: "unit", exitCode: 0 }], ...extra });

if (!SKIP) artifact(B, "evidence/verify-ok.json", verifyDoc(B));

/** Core acceptance assertion: a declared criterion without matching executed evidence is never satisfied. */
function assertCriteriaAreNotSatisfiedByName(r) {
  assert.equal(r.state, "gaps");
  const byId = Object.fromEntries(r.criteria.map(c => [c.id, c]));
  assert.deepEqual(Object.keys(byId), ["AC-FOUR", "AC-ONE", "AC-THREE", "AC-TWO"]);
  assert.deepEqual(byId["AC-FOUR"].structural, { status: "unmapped" });
  assert.equal(byId["AC-FOUR"].identitySource, "spec-text-mention-not-normative-classification");
  assert.equal(byId["AC-ONE"].identitySource, "candidate-adjacent-traceability-map");
  assert.equal(byId["AC-ONE"].structural.status, "present");
  assert.equal(byId["AC-TWO"].structural.status, "absent");
  assert.equal(byId["AC-THREE"].structural.status, "absent");
  for (const c of r.criteria) {
    assert.deepEqual(c.executedProductEvidence, { state: "unavailable", code: "REPORT-CRITERION-EXECUTION-BINDING-UNAVAILABLE" });
    assert.deepEqual(c.acceptedDisposition, { state: "unavailable", code: "REPORT-CRITERION-DISPOSITION-OWNER-UNAVAILABLE" });
  }
}
function assertVerifyIsNeverProductAcceptance(r) {
  assert.equal(r.verify.state, "published-success-not-product-acceptance");
  assert.equal(r.verify.candidateBound, true);
  assert.deepEqual(r.verify.executionAuthenticity, { state: "unavailable", code: "REPORT-VERIFY-JOURNAL-READER-NOT-SUPPLIED" });
}

// Host-independent CLI cases need no git: argument validation happens before the repository is opened.
describe("declared product criteria need matching acceptance evidence (AC-146): CLI argument contract", () => {
  const run = (...args) => spawnSync(process.execPath, [cliPath, ...args], { encoding: "utf8" });
  test("malformed or contradictory arguments are rejected with exit 2 and a report-only unavailable payload", () => {
    for (const args of [
      ["--kind", "candidate", "--candidate", "a".repeat(40), "--spec", "specs/x.md"],
      ["--kind", "nonsense", "--candidate", "a".repeat(40)],
      ["--kind", "criteria"],
      ["--kind", "criteria", "--candidate", "a".repeat(40), "--spec", "specs/x.md", "--spec", "specs/y.md"],
      ["--bogus", "x"],
    ]) {
      const out = run(...args);
      assert.equal(out.status, 2, `args ${args.join(" ")}`);
      const body = JSON.parse(out.stdout);
      assert.equal(body.reportOnly, true);
      assert.equal(body.completionEffect, "none");
      assert.equal(body.state, "unavailable");
      assert.equal(body.code, "REPORT-ARGUMENTS-OR-SOURCE-UNAVAILABLE");
    }
  });
});

describe("declared product criteria need matching acceptance evidence (AC-146)", { skip: SKIP }, () => {
  test("without a map, declared AC mentions are listed but unclassified and never satisfied", () => {
    const r = report(A, { specPath: SPEC_PATH });
    assert.equal(r.state, "gaps");
    assert.equal(r.traceability.mode, "undeclared");
    assert.deepEqual(r.criteria.map(c => c.id), ["AC-FOUR", "AC-ONE", "AC-THREE", "AC-TWO"]);
    for (const c of r.criteria) {
      assert.deepEqual(c.structural, { status: "unmapped" });
      assert.equal(c.identitySource, "spec-text-mention-not-normative-classification");
      assert.equal(c.executedProductEvidence.state, "unavailable");
      assert.equal(c.acceptedDisposition.state, "unavailable");
    }
  });

  test("a candidate map classifies criteria; absent targets and mention-only criteria stay gaps", () => {
    assertCriteriaAreNotSatisfiedByName(report(B, { specPath: SPEC_PATH }));
  });

  test("even when every mapped criterion is structurally present the state is unknown, never a pass", () => {
    const r = report(C, { specPath: SPEC_PATH });
    assert.equal(r.criteria.length, 1);
    assert.equal(r.criteria[0].structural.status, "present");
    assert.equal(r.criteria[0].executedProductEvidence.state, "unavailable");
    assert.equal(r.state, "unknown");
  });

  test("a stale map (Spec digest mismatch) degrades to unknown instead of classifying", () => {
    const r = report(D, { specPath: SPEC_PATH });
    assert.equal(r.state, "unknown");
    assert.deepEqual(r.source, { state: "unavailable", code: "RT-MAP-SPEC-DIGEST" });
    assert.deepEqual(r.criteria, []);
  });

  test("a missing Spec or an unacceptable Spec path is unknown with a typed code", () => {
    assert.deepEqual(report(B, { specPath: "specs/f/other.md" }).source, { state: "unavailable", code: "REPORT-CANDIDATE-FILE" });
    for (const specPath of [undefined, "docs/spec.md", "specs/f/spec.txt", 7]) {
      const r = report(B, { specPath });
      assert.equal(r.state, "unknown");
      assert.deepEqual(r.source, { state: "unavailable", code: "REPORT-SPEC-PATH" });
    }
  });

  test("the report is report-only, has no completion effect, and invents no browser or conservation proof", () => {
    for (const r of [report(A, { specPath: SPEC_PATH }), report(B, { specPath: SPEC_PATH }), report(C, { specPath: SPEC_PATH }), report(D, { specPath: SPEC_PATH })]) {
      assert.equal(r.schema, "pipeline.declared-criteria-evidence-report.v1");
      assert.equal(r.reportOnly, true);
      assert.equal(r.completionEffect, "none");
      assert.ok(["unknown", "gaps"].includes(r.state), `state ${r.state} is never a pass`);
      assert.equal(r.browserPolicy, "required-only-if-declared; core-or-structural-evidence-is-not-browser-proof");
      assert.deepEqual(r.conservation, { state: "unavailable", code: "REPORT-AUTHORIZED-ORIGINAL-CUSTODY-READER-UNAVAILABLE" });
      assert.deepEqual(r.readinessSources, ["original-input", "prd", "spec", "revised-design", "traceability"]);
    }
  });

  test("a published candidate-bound verify success is reported as a published result, not product acceptance", () => {
    const r = report(B, { specPath: SPEC_PATH, verifyPath: "evidence/verify-ok.json" });
    assertVerifyIsNeverProductAcceptance(r);
    assert.equal(r.state, "gaps", "a green verify does not close any declared criterion");
    for (const c of r.criteria) assert.equal(c.executedProductEvidence.state, "unavailable");
  });

  test("a verify result for another candidate is stale, a failed one is published-failed, a malformed one is unavailable", () => {
    artifact(B, "evidence/verify-stale.json", verifyDoc(B, { candidate: { commit: "b".repeat(40), tree: "c".repeat(40) } }));
    assert.equal(report(B, { specPath: SPEC_PATH, verifyPath: "evidence/verify-stale.json" }).verify.state, "stale");
    assert.equal(report(B, { specPath: SPEC_PATH, verifyPath: "evidence/verify-stale.json" }).verify.candidateBound, false);
    artifact(B, "evidence/verify-fail.json", verifyDoc(B, { exitCode: 1, steps: [{ name: "unit", exitCode: 1 }] }));
    assert.equal(report(B, { specPath: SPEC_PATH, verifyPath: "evidence/verify-fail.json" }).verify.state, "published-failed");
    artifact(B, "evidence/verify-bad.json", { schema: "pipeline.verify-evidence.v0", candidate: verifyDoc(B).candidate, exitCode: 0, steps: [{ name: "bad name!", exitCode: 0 }] });
    assert.deepEqual(report(B, { specPath: SPEC_PATH, verifyPath: "evidence/verify-bad.json" }).verify, { state: "unavailable", code: "REPORT-VERIFY-INVALID" });
    assert.equal(report(B, { specPath: SPEC_PATH, verifyPath: "evidence/absent.json" }).verify.state, "unavailable");
    assert.deepEqual(report(B, { specPath: SPEC_PATH, verifyPath: "docs/verify.json" }).verify, { state: "unavailable", code: "REPORT-PUBLIC-ARTIFACT-SCOPE" });
    assert.deepEqual(report(B, { specPath: SPEC_PATH }).verify, { state: "unavailable", code: "REPORT-VERIFY-NOT-SUPPLIED" });
  });

  test("receipts: an invalid receipt is recorded invalid, duplicates are bounded, none satisfies a criterion", () => {
    artifact(B, "evidence/receipt-bad.json", { schema: "pipeline.not-a-receipt" });
    const r = report(B, { specPath: SPEC_PATH, receiptPaths: ["evidence/receipt-bad.json", "evidence/receipt-missing.json"] });
    assert.equal(r.receipts[0].state, "invalid");
    assert.equal(r.receipts[0].code, "VERIFY-RECEIPT-SHAPE");
    assert.equal(r.receipts[1].state, "unavailable");
    for (const c of r.criteria) {
      assert.deepEqual(c.receiptAssociations, []);
      assert.equal(c.executedProductEvidence.state, "unavailable");
    }
    const dup = report(B, { specPath: SPEC_PATH, receiptPaths: ["evidence/receipt-bad.json", "evidence/receipt-bad.json"] });
    assert.equal(dup.state, "unknown");
    assert.deepEqual(dup.source, { state: "unavailable", code: "REPORT-RECEIPT-BOUND" });
    assert.equal(report(B, { specPath: SPEC_PATH, receiptPaths: "evidence/x.json" }).source.code, "REPORT-RECEIPT-BOUND");
  });

  test("the CLI emits the same criteria report, report-only, and degrades an unavailable candidate without a pass", () => {
    const run = (...args) => spawnSync(process.execPath, [cliPath, ...args], { encoding: "utf8" });
    const ok = run("--kind", "criteria", "--root", B.dir, "--candidate", B.head, "--spec", SPEC_PATH, "--verify", "evidence/verify-ok.json");
    assert.equal(ok.status, 0);
    const out = JSON.parse(ok.stdout);
    assert.equal(out.reportOnly, true);
    assert.equal(out.completionEffect, "none");
    assert.equal(out.candidateCoverage, undefined);
    assertCriteriaAreNotSatisfiedByName(out.criteriaEvidence);
    assertVerifyIsNeverProductAcceptance(out.criteriaEvidence);
    const both = JSON.parse(run("--kind", "both", "--root", B.dir, "--candidate", B.head, "--spec", SPEC_PATH).stdout);
    assert.equal(both.criteriaEvidence.state, "gaps");
    assert.ok(both.candidateCoverage, "kind both also carries the candidate-coverage section");
    const missing = run("--kind", "criteria", "--root", B.dir, "--candidate", "d".repeat(40), "--spec", SPEC_PATH);
    assert.equal(missing.status, 0);
    const miss = JSON.parse(missing.stdout);
    assert.equal(miss.state, "unavailable");
    assert.equal(miss.completionEffect, "none");
  });

  describe("RED: the assertions fail against scratch mirrors with the guarantee removed", () => {
    async function mirror(name, mutate) {
      const source = readFileSync(join(libDir, "declared-criteria-evidence-report.mjs"), "utf8");
      const rebased = source.replaceAll(/from "\.\//gu, `from "${pathToFileURL(libDir).href}/`);
      const mutated = mutate(rebased);
      assert.notEqual(mutated, rebased, `mutation ${name} must change the mirror`);
      const file = join(work, `mirror-${name}.mjs`); writeFileSync(file, mutated);
      return import(pathToFileURL(file).href);
    }
    test("a mirror that treats structural presence as executed product evidence fails the criteria assertion", async () => {
      const m = await mirror("presentisproof", s => s.replace(
        "executedProductEvidence: unavailable(\"REPORT-CRITERION-EXECUTION-BINDING-UNAVAILABLE\")",
        "executedProductEvidence: { state: \"satisfied\" }"));
      assert.throws(() => assertCriteriaAreNotSatisfiedByName(report(B, { specPath: SPEC_PATH }, m)), assert.AssertionError);
    });
    test("a mirror that promotes a green verify to acceptance fails the verify assertion", async () => {
      const m = await mirror("verifyaccepts", s => s.replace("\"published-success-not-product-acceptance\"", "\"accepted\""));
      assert.throws(() => assertVerifyIsNeverProductAcceptance(report(B, { specPath: SPEC_PATH, verifyPath: "evidence/verify-ok.json" }, m)), assert.AssertionError);
    });
    test("a mirror that ignores unmapped mentions loses the mention-only gap", async () => {
      const m = await mirror("nomentions", s => s.replace("?? [])].sort();", "?? [])].sort().slice(0, 0);"));
      assert.throws(() => assertCriteriaAreNotSatisfiedByName(report(B, { specPath: SPEC_PATH }, m)), assert.AssertionError);
    });
    test("the unmodified production function passes the same assertions", () => {
      assertCriteriaAreNotSatisfiedByName(report(B, { specPath: SPEC_PATH }));
      assertVerifyIsNeverProductAcceptance(report(B, { specPath: SPEC_PATH, verifyPath: "evidence/verify-ok.json" }));
    });
  });
});
