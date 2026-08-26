// SPDX-License-Identifier: SUL-1.0
/**
 * Falsifiability pin for check-epic-file-contract.mjs. Builds a small,
 * self-contained fixture tree (never the real repo) that mirrors the real
 * harness contract's shape -- a `specs/sprint-phoenix-epic/spec.md` with a
 * "## 7." heading and backtick-quoted-path table rows, plus a matching file
 * tree -- then, one behaviour at a time, breaks it and shows the check
 * reports it, and shows the fixed fixture is clean.
 *
 * NOT REGISTERED in harness/scripts/verify.mjs on purpose (that file's
 * maintenance window is closed, same posture as check-adr-consistency.test.mjs
 * and check-doc-reconciliation.test.mjs); run it directly with `node` or
 * `node --test`.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  checkEpicFileContract,
  coveredRoots,
  extractInventoryPaths,
  extractSection7,
  successLine,
} from "./check-epic-file-contract.mjs";

let passed = 0;
function check(name, fn) { fn(); passed += 1; process.stdout.write(`ok ${passed} - ${name}\n`); }

// -------------------------------------------------------------- fixture kit

const SPEC_REL = join("specs", "sprint-phoenix-epic", "spec.md");

function buildRoot() {
  return mkdtempSync(join(tmpdir(), "epic-file-contract-test-"));
}
function cleanup(root) { rmSync(root, { recursive: true, force: true }); }

function writeFile(root, relPath, content = "fixture\n") {
  const abs = join(root, relPath);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content);
}

function writeSpec(root, sectionsText) {
  writeFile(root, SPEC_REL, `# Fixture spec\n\n## 6. Something earlier\n\nirrelevant\n\n${sectionsText}\n`);
}

/** A minimal, self-consistent §7 with two roots and a following ## 8. section
 *  (mirrors the real spec's shape: §7 is not the last section). */
function wellFormedFixture() {
  const root = buildRoot();
  const section7 = [
    "## 7. Detailed implementation inventory",
    "",
    "### 7.1 Alpha root",
    "",
    "| File | Change | Rationale |",
    "| --- | --- | --- |",
    "| `alpha/one.mjs` | create | test fixture |",
    "| `alpha/two.mjs` | create | test fixture |",
    "",
    "### 7.2 Beta root",
    "",
    "| File | Change | Rationale |",
    "| --- | --- | --- |",
    "| `beta/three.md` | create | test fixture |",
    "",
    "## 8. Not part of the inventory",
    "",
    "| `not-in-scope/four.mjs` | should never be read | out of §7 |",
    "",
  ].join("\n");
  writeSpec(root, section7);
  writeFile(root, "alpha/one.mjs");
  writeFile(root, "alpha/two.mjs");
  writeFile(root, "beta/three.md");
  return root;
}

function run(root) { return checkEpicFileContract({ root, specRel: SPEC_REL }); }

// ---------------------------------------------------------------- baseline

check("well-formed fixture: every declared path exists, no drift", () => {
  const root = wellFormedFixture();
  const result = run(root);
  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.drift, []);
  assert.equal(result.coverage.pathsDeclared, 3);
  assert.equal(result.coverage.rootsCovered, 2);
  cleanup(root);
});

// -------------------------------------------------------- existence (fail)

check("a declared path that does not exist on disk is a finding and fails the check", () => {
  const root = wellFormedFixture();
  rmSync(join(root, "alpha", "two.mjs"));
  const result = run(root);
  assert.equal(result.ok, false);
  assert.equal(result.missing.length, 1);
  assert.match(result.missing[0], /alpha\/two\.mjs/);
  cleanup(root);
});

check("multiple missing declared paths are all reported, not just the first", () => {
  const root = wellFormedFixture();
  rmSync(join(root, "alpha", "two.mjs"));
  rmSync(join(root, "beta", "three.md"));
  const result = run(root);
  assert.equal(result.ok, false);
  assert.equal(result.missing.length, 2);
  cleanup(root);
});

// ------------------------------------------------------ drift (never fails)

check("an undeclared tracked file inside a covered root is reported as drift, not a failure", () => {
  const root = wellFormedFixture();
  writeFile(root, "alpha/undeclared.mjs");
  const result = run(root);
  assert.equal(result.ok, true, "drift alone must never fail the check");
  assert.deepEqual(result.drift, ["alpha/undeclared.mjs"]);
  cleanup(root);
});

check("a file in an unrelated, uncovered directory is never reported as drift", () => {
  const root = wellFormedFixture();
  writeFile(root, "gamma/unrelated.mjs");
  const result = run(root);
  assert.equal(result.ok, true);
  assert.deepEqual(result.drift, []);
  cleanup(root);
});

check("a subdirectory of a covered root that is not itself a named root is not recursed into", () => {
  const root = wellFormedFixture();
  writeFile(root, "alpha/nested/deep.mjs");
  const result = run(root);
  assert.equal(result.ok, true);
  // "alpha/nested" is a directory, not a file, inside "alpha" -- listFilesInDir
  // only lists files, so the directory itself is never reported; its content
  // ("alpha/nested/deep.mjs") lives under an uncovered root ("alpha/nested")
  // and so is also never reported.
  assert.deepEqual(result.drift, []);
  cleanup(root);
});

check("naming a path in a subdirectory makes that subdirectory its own root, independent of its parent root", () => {
  const root = buildRoot();
  const section7 = [
    "## 7. Detailed implementation inventory",
    "",
    "| `docs/adr/README.md` | maintain | index |",
    "| `docs/artifact-topology.md` | maintain | doc |",
    "",
  ].join("\n");
  writeSpec(root, section7);
  writeFile(root, "docs/adr/README.md");
  writeFile(root, "docs/artifact-topology.md");
  writeFile(root, "docs/undeclared-doc.md"); // drift under root "docs"
  writeFile(root, "docs/adr/0099-undeclared.md"); // drift under root "docs/adr"
  const result = run(root);
  assert.equal(result.ok, true);
  assert.deepEqual(result.drift.sort(), ["docs/adr/0099-undeclared.md", "docs/undeclared-doc.md"]);
  cleanup(root);
});

// -------------------------------------------------------------- extraction

check("extractSection7 stops at the next level-2 heading and excludes it", () => {
  const text = "## 6. Before\n\nnope\n\n## 7. Target\n\nyes\n\n## 8. After\n\nnope\n";
  const section = extractSection7(text);
  assert.match(section, /yes/);
  assert.doesNotMatch(section, /nope/);
});

check("extractSection7 returns the rest of the file when §7 is the last section", () => {
  const text = "## 6. Before\n\nnope\n\n## 7. Target\n\nyes to the end\n";
  const section = extractSection7(text);
  assert.match(section, /yes to the end/);
});

check("extractSection7 returns null when no '## 7.' heading exists", () => {
  assert.equal(extractSection7("## 6. Only\n\nsomething\n"), null);
});

check("extractInventoryPaths reads only the first (backtick-quoted) table column, deduplicated", () => {
  const section = [
    "| File | Change | Rationale |",
    "| --- | --- | --- |",
    "| `a/one.mjs` | create | rationale with `backticks` inside |",
    "| `a/one.mjs` | duplicate row | same path again |",
    "| `a/two.mjs` | create | second |",
  ].join("\n");
  assert.deepEqual(extractInventoryPaths(section), ["a/one.mjs", "a/two.mjs"]);
});

check("coveredRoots returns the distinct immediate parent directories, sorted", () => {
  assert.deepEqual(
    coveredRoots(["b/two.mjs", "a/one.mjs", "a/three.mjs", "root-file.md"]),
    [".", "a", "b"],
  );
});

// ---------------------------------------------------------------- absence

check("a missing spec.md file is a finding, not a thrown error", () => {
  const root = buildRoot();
  const result = run(root);
  assert.equal(result.ok, false);
  assert.equal(result.missing.length, 1);
  assert.match(result.missing[0], /could not read the file contract/);
  cleanup(root);
});

check("a spec.md with no '## 7.' heading is a finding, not a thrown error", () => {
  const root = buildRoot();
  writeFile(root, SPEC_REL, "# Fixture spec\n\n## 6. Only\n\nsomething\n");
  const result = run(root);
  assert.equal(result.ok, false);
  assert.match(result.missing[0], /no "## 7\." section heading found/);
  cleanup(root);
});

// ------------------------------------------------------------- successLine

check("successLine names counts and, when present, the drifted files, without asserting failure", () => {
  const root = wellFormedFixture();
  writeFile(root, "alpha/undeclared.mjs");
  const result = run(root);
  const line = successLine(result, SPEC_REL);
  assert.match(line, /3 declared path\(s\) all exist/);
  assert.match(line, /1 tracked file\(s\)/);
  assert.match(line, /alpha\/undeclared\.mjs/);
  cleanup(root);
});

// ----------------------------------------------- real backlog-item shapes

check(
  "reconstructs the backlog item's real drift shape: a §7-covered root (harness/scripts) with " +
    "undeclared check scripts is reported as drift, never a failure",
  () => {
    const root = buildRoot();
    const section7 = [
      "## 7. Detailed implementation inventory",
      "",
      "| `harness/scripts/verify.mjs` | maintain | gate |",
      "",
    ].join("\n");
    writeSpec(root, section7);
    writeFile(root, "harness/scripts/verify.mjs");
    writeFile(root, "harness/scripts/check-verify-suite-registration.mjs");
    writeFile(root, "harness/scripts/check-adr-consistency.mjs");
    const result = run(root);
    assert.equal(result.ok, true);
    assert.deepEqual(result.drift.sort(), [
      "harness/scripts/check-adr-consistency.mjs",
      "harness/scripts/check-verify-suite-registration.mjs",
    ]);
    cleanup(root);
  },
);

process.stdout.write(`\n${passed} check(s) passed.\n`);
