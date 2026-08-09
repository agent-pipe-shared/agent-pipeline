// SPDX-License-Identifier: SUL-1.0
/**
 * Falsifiability pin for check-adr-consistency.mjs. A consistency check that
 * cannot go red is decoration -- this test builds a small, self-consistent
 * fixture corpus (never the real docs/adr/), then, one class at a time,
 * breaks EXACTLY that class's invariant, shows the check reports it and
 * names the offending file, and shows the same corpus without the break
 * exits clean. It also reconstructs the two real defects that motivated this
 * check (2026-08-09 three-way 0047 number collision; the 0038/0047
 * status-line supersession disagreement) and quotes the findings.
 *
 * NOT REGISTERED in harness/scripts/verify.mjs on purpose (that file's
 * maintenance window is closed); run it directly with `node`.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { checkAdrConsistency, successLine } from "./check-adr-consistency.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const checkerPath = join(here, "check-adr-consistency.mjs");

let passed = 0;
function check(name, fn) { fn(); passed += 1; process.stdout.write(`ok ${passed} - ${name}\n`); }

function buildRoot() {
  const root = mkdtempSync(join(tmpdir(), "adr-consistency-test-"));
  mkdirSync(join(root, "docs", "adr"), { recursive: true });
  return root;
}
function writeAdr(root, filename, content) { writeFileSync(join(root, "docs", "adr", filename), content); }
function writeReadme(root, content) { writeFileSync(join(root, "docs", "adr", "README.md"), content); }
function cleanup(root) { rmSync(root, { recursive: true, force: true }); }

function readmeTable(rows) {
  return [
    "# ADR-Index",
    "",
    "| No. | Title | Status | Date |",
    "|---|---|---|---|",
    ...rows,
    "",
    "### Resubmissions",
    "",
    "| ADR | Date / trigger |",
    "|---|---|",
    "",
    "### Conventions",
    "",
    "Format per ADR: context -> decision -> consequences -> discarded alternatives -> resubmission.",
    "",
  ].join("\n");
}

function boldAdr(title, statusLine, extra = "") {
  return [
    `# ${title}`,
    "",
    statusLine,
    "",
    "## Context",
    "",
    "Fixture context.",
    "",
    "## Decision",
    "",
    `Fixture decision.${extra ? ` ${extra}` : ""}`,
    "",
  ].join("\n");
}

function headingAdr(title, statusBody) {
  return [
    `# ${title}`,
    "",
    "## Status",
    "",
    statusBody,
    "",
    "## Context",
    "",
    "Fixture context.",
    "",
  ].join("\n");
}

/**
 * A minimal, self-consistent two-file baseline: one file in each of the
 * corpus's two measured status shapes (bold-inline, heading), no
 * supersession claims, and a matching README index -- the "well-formed"
 * starting point every per-class fixture below mutates from.
 */
function wellFormedRoot() {
  const root = buildRoot();
  writeAdr(root, "0001-alpha.md", boldAdr("ADR-0001: Alpha", "**Status:** accepted · **Date:** 2026-01-01"));
  writeAdr(root, "0002-beta.md", headingAdr("ADR-0002: Beta", "Accepted on 2026-01-02."));
  writeReadme(root, readmeTable([
    "| [0001](0001-alpha.md) | Alpha | accepted | 2026-01-01 |",
    "| [0002](0002-beta.md) | Beta | accepted | 2026-01-02 |",
  ]));
  return root;
}

function run(root) { return checkAdrConsistency({ root }); }

// ---------------------------------------------------------------- baseline
check("the well-formed baseline fixture is itself green (fixtures below measure departures from this)", () => {
  const root = wellFormedRoot();
  const result = run(root);
  assert.deepEqual(result.findings, []);
  assert.equal(result.ok, true);
  cleanup(root);
});

// ============================================================= class 1
// DUPLICATE-NUMBER: two files under docs/adr/ share the same leading number.
check("class 1 (DUPLICATE-NUMBER): fires when two files share a number, clears when renumbered", () => {
  const root = wellFormedRoot();
  writeAdr(root, "0001-alpha-conflict.md", boldAdr("ADR-0001: Alpha Conflict", "**Status:** accepted · **Date:** 2026-01-03"));
  writeReadme(root, readmeTable([
    "| [0001](0001-alpha.md) | Alpha | accepted | 2026-01-01 |",
    "| [0002](0002-beta.md) | Beta | accepted | 2026-01-02 |",
    "| [0001](0001-alpha-conflict.md) | Alpha Conflict | accepted | 2026-01-03 |",
  ]));
  const broken = run(root);
  assert.equal(broken.ok, false);
  assert.ok(broken.findings.every((f) => f.startsWith("DUPLICATE-NUMBER")), `expected only DUPLICATE-NUMBER findings, got:\n  ${broken.findings.join("\n  ")}`);
  assert.ok(broken.findings.some((f) => f.startsWith("DUPLICATE-NUMBER 0001-alpha.md:")), `expected 0001-alpha.md named, got:\n  ${broken.findings.join("\n  ")}`);
  assert.ok(broken.findings.some((f) => f.startsWith("DUPLICATE-NUMBER 0001-alpha-conflict.md:")), `expected 0001-alpha-conflict.md named, got:\n  ${broken.findings.join("\n  ")}`);
  cleanup(root);

  const clean = wellFormedRoot(); // the exact same corpus minus the conflicting file/row
  assert.deepEqual(run(clean).findings, []);
  cleanup(clean);
});

// ============================================================= class 2
// MISSING-STATUS-LINE: a file carrying neither established status shape.
check("class 2 (MISSING-STATUS-LINE): fires when a file has neither shape, clears when one is added", () => {
  const root = wellFormedRoot();
  writeAdr(root, "0003-gamma.md", ["# ADR-0003: Gamma", "", "## Context", "", "No status section at all.", ""].join("\n"));
  writeReadme(root, readmeTable([
    "| [0001](0001-alpha.md) | Alpha | accepted | 2026-01-01 |",
    "| [0002](0002-beta.md) | Beta | accepted | 2026-01-02 |",
    "| [0003](0003-gamma.md) | Gamma | accepted | 2026-01-04 |",
  ]));
  const broken = run(root);
  assert.equal(broken.ok, false);
  assert.deepEqual(broken.findings, ["MISSING-STATUS-LINE 0003-gamma.md:1 -- neither a \"**Status:**\" paragraph nor a \"## Status\" section was found"]);
  cleanup(root);

  const fixed = buildRoot();
  writeAdr(fixed, "0001-alpha.md", boldAdr("ADR-0001: Alpha", "**Status:** accepted · **Date:** 2026-01-01"));
  writeAdr(fixed, "0002-beta.md", headingAdr("ADR-0002: Beta", "Accepted on 2026-01-02."));
  writeAdr(fixed, "0003-gamma.md", boldAdr("ADR-0003: Gamma", "**Status:** accepted · **Date:** 2026-01-04"));
  writeReadme(fixed, readmeTable([
    "| [0001](0001-alpha.md) | Alpha | accepted | 2026-01-01 |",
    "| [0002](0002-beta.md) | Beta | accepted | 2026-01-02 |",
    "| [0003](0003-gamma.md) | Gamma | accepted | 2026-01-04 |",
  ]));
  assert.deepEqual(run(fixed).findings, []);
  cleanup(fixed);
});

// ============================================================= class 3
// DANGLING-SUPERSESSION-TARGET: an ADR-NNNN named in a status line that
// does not exist -- named OUTSIDE a "superseded by" clause, so this fixture
// cannot be satisfied by class 4's machinery instead.
check("class 3 (DANGLING-SUPERSESSION-TARGET): fires when a status line names a nonexistent ADR, clears when it exists", () => {
  const root = wellFormedRoot();
  writeAdr(root, "0001-alpha.md", boldAdr("ADR-0001: Alpha", "**Status:** accepted; revises ADR-9999 · **Date:** 2026-01-01"));
  const broken = run(root);
  assert.equal(broken.ok, false);
  assert.deepEqual(broken.findings, ["DANGLING-SUPERSESSION-TARGET 0001-alpha.md:3 -- names ADR-9999, which does not exist in docs/adr"]);
  cleanup(root);

  const fixed = wellFormedRoot(); // ADR-9999 replaced by an existing target, ADR-0002
  writeAdr(fixed, "0001-alpha.md", boldAdr("ADR-0001: Alpha", "**Status:** accepted; revises ADR-0002 · **Date:** 2026-01-01"));
  assert.deepEqual(run(fixed).findings, []);
  cleanup(fixed);
});

// ============================================================= class 4
// SUPERSESSION-DISAGREEMENT: A's status line claims a term set superseded by
// B; B's own sentence claims a DIFFERENT term set superseded in A.
function supersessionRoot({ claimAterms, claimBterms }) {
  const root = buildRoot();
  writeAdr(root, "0001-alpha.md", boldAdr(
    "ADR-0001: Alpha",
    `**Status:** accepted registry; ${claimAterms} superseded by ADR-0002 · **Date:** 2026-01-01`,
  ));
  writeAdr(root, "0002-beta.md", boldAdr(
    "ADR-0002: Beta",
    "**Status:** accepted · **Date:** 2026-01-02",
    `ADR-0001 remains authoritative for other matters but is superseded for ${claimBterms}.`,
  ));
  writeReadme(root, readmeTable([
    "| [0001](0001-alpha.md) | Alpha | accepted | 2026-01-01 |",
    "| [0002](0002-beta.md) | Beta | accepted | 2026-01-02 |",
  ]));
  return root;
}

check("class 4 (SUPERSESSION-DISAGREEMENT): fires when the two term sets differ, clears when they agree", () => {
  const root = supersessionRoot({ claimAterms: "alpha semantics", claimBterms: "alpha and beta semantics" });
  const broken = run(root);
  assert.equal(broken.ok, false);
  assert.ok(broken.findings.every((f) => f.startsWith("SUPERSESSION-DISAGREEMENT")), `expected only SUPERSESSION-DISAGREEMENT, got:\n  ${broken.findings.join("\n  ")}`);
  assert.ok(broken.findings.some((f) => f.includes("0001-alpha.md:") && f.includes("0002-beta.md:")), `expected both files named, got:\n  ${broken.findings.join("\n  ")}`);
  cleanup(root);

  const clean = supersessionRoot({ claimAterms: "alpha and beta semantics", claimBterms: "alpha and beta semantics" });
  assert.deepEqual(run(clean).findings, []);
  cleanup(clean);
});

// ============================================================= class 5
// INDEX-DISAGREEMENT: covers three independently falsifiable shapes -- a
// missing row, a row naming a nonexistent file, and a row/filename number
// mismatch. Each is shown broken and then cleared on its own.
check("class 5 (INDEX-DISAGREEMENT): a file with no index row fires, and clears once the row is added", () => {
  const root = wellFormedRoot();
  writeReadme(root, readmeTable(["| [0001](0001-alpha.md) | Alpha | accepted | 2026-01-01 |"])); // 0002's row dropped
  const broken = run(root);
  assert.equal(broken.ok, false);
  assert.deepEqual(broken.findings, ["INDEX-DISAGREEMENT docs/adr/README.md:3 -- 0002-beta.md has no row in the English index table"]);
  cleanup(root);

  const fixed = wellFormedRoot();
  assert.deepEqual(run(fixed).findings, []);
  cleanup(fixed);
});

check("class 5 (INDEX-DISAGREEMENT): a row naming a nonexistent file fires, and clears once corrected", () => {
  const root = wellFormedRoot();
  writeReadme(root, readmeTable([
    "| [0001](0001-alpha.md) | Alpha | accepted | 2026-01-01 |",
    "| [0002](0002-beta.md) | Beta | accepted | 2026-01-02 |",
    "| [0009](0009-ghost.md) | Ghost | accepted | 2026-01-09 |",
  ]));
  const broken = run(root);
  assert.equal(broken.ok, false);
  assert.ok(broken.findings.some((f) => f.startsWith("INDEX-DISAGREEMENT") && f.includes("0009-ghost.md")), `expected the ghost row named, got:\n  ${broken.findings.join("\n  ")}`);
  cleanup(root);

  const fixed = wellFormedRoot();
  assert.deepEqual(run(fixed).findings, []);
  cleanup(fixed);
});

check("class 5 (INDEX-DISAGREEMENT): a row displaying a number that disagrees with its linked filename fires, and clears once corrected", () => {
  const root = wellFormedRoot();
  writeReadme(root, readmeTable([
    "| [0099](0001-alpha.md) | Alpha | accepted | 2026-01-01 |", // 0099 displayed, links a 0001 file
    "| [0002](0002-beta.md) | Beta | accepted | 2026-01-02 |",
  ]));
  const broken = run(root);
  assert.equal(broken.ok, false);
  assert.ok(
    broken.findings.some((f) => f.startsWith("INDEX-DISAGREEMENT") && f.includes("displays 0099") && f.includes("0001-alpha.md") && f.includes("numbered 0001")),
    `expected a number-mismatch finding, got:\n  ${broken.findings.join("\n  ")}`,
  );
  cleanup(root);

  const fixed = wellFormedRoot();
  assert.deepEqual(run(fixed).findings, []);
  cleanup(fixed);
});

// ------------------------------------------------------- regression proof
// Reconstructs the two real defects named in the dispatching briefing:
// (a) a three-way number collision (three files all claiming one number),
// (b) ADR-0038's status line claiming a NARROWER term set superseded by
//     ADR-0047 than ADR-0047 itself claims to supersede in ADR-0038.
// Both are reconstructed in ONE fixture corpus and both findings are
// asserted and quoted -- this is the regression this check exists to catch.
check("regression: reconstructs the three-way 0047 collision and the 0038/0047 status-line disagreement, both reported", () => {
  const root = buildRoot();
  // (a) three files claiming number 0047 -- the real 2026-08-09 collision.
  // "model-free-advisor-preflight-v2" is the one that, in reality, carries
  // the disagreement sentence (b); it is also the alphabetically LAST of the
  // three "0047-..." names, so adrByNumber (built from files sorted by name,
  // later entries winning) resolves ADR-0038's "superseded by ADR-0047"
  // target to exactly that file -- the same file the real corpus resolves
  // to, since the numbering collision was repaired by renumbering the OTHER
  // two, never this one.
  writeAdr(root, "0047-governance-event-kernel.md", boldAdr("ADR-0047: Governance event kernel", "**Status:** accepted · **Date:** 2026-08-02"));
  writeAdr(root, "0047-local-supervisor-state-authority.md", boldAdr("ADR-0047: Local supervisor state authority", "**Status:** accepted · **Date:** 2026-07-25"));
  writeAdr(root, "0047-model-free-advisor-preflight-v2.md", boldAdr(
    "ADR-0047: Model-free Advisor preflight",
    "**Status:** accepted · **Date:** 2026-07-29",
    "ADR-0038 remains authoritative for route topology but is superseded for session-trigger and mandatory-receipt semantics.",
  ));
  // (b) 0038's status line claims a NARROWER set than 0047's own sentence.
  writeAdr(root, "0038-runner-neutral-advisory-v3.md", boldAdr(
    "ADR-0038: Runner-neutral advisory duty v3",
    "**Status:** accepted route registry; session-trigger semantics superseded by ADR-0047 · **Date:** 2026-07-19",
  ));
  writeReadme(root, readmeTable([
    "| [0038](0038-runner-neutral-advisory-v3.md) | Runner-neutral advisory duty v3 | accepted | 2026-07-19 |",
    "| [0047](0047-model-free-advisor-preflight-v2.md) | Model-free Advisor preflight | accepted | 2026-07-29 |",
    "| [0047](0047-local-supervisor-state-authority.md) | Local supervisor state authority | accepted | 2026-07-25 |",
    "| [0047](0047-governance-event-kernel.md) | Governance event kernel | accepted | 2026-08-02 |",
  ]));
  const result = run(root);
  assert.equal(result.ok, false);

  const duplicateFindings = result.findings.filter((f) => f.startsWith("DUPLICATE-NUMBER"));
  assert.equal(duplicateFindings.length, 3, `expected 3 DUPLICATE-NUMBER findings (one per colliding file), got:\n  ${duplicateFindings.join("\n  ")}`);
  for (const name of ["0047-model-free-advisor-preflight-v2.md", "0047-local-supervisor-state-authority.md", "0047-governance-event-kernel.md"]) {
    assert.ok(duplicateFindings.some((f) => f.startsWith(`DUPLICATE-NUMBER ${name}:`)), `expected ${name} named among the duplicates, got:\n  ${duplicateFindings.join("\n  ")}`);
  }

  const disagreementFindings = result.findings.filter((f) => f.startsWith("SUPERSESSION-DISAGREEMENT"));
  assert.equal(disagreementFindings.length, 1, `expected exactly 1 SUPERSESSION-DISAGREEMENT finding, got:\n  ${disagreementFindings.join("\n  ")}`);
  assert.ok(disagreementFindings[0].startsWith("SUPERSESSION-DISAGREEMENT 0038-runner-neutral-advisory-v3.md:"), disagreementFindings[0]);
  assert.ok(disagreementFindings[0].includes('claims "session-trigger semantics" superseded by ADR-0047'), disagreementFindings[0]);

  process.stdout.write(`  regression finding (a), 1 of 3: ${duplicateFindings[0]}\n`);
  process.stdout.write(`  regression finding (b): ${disagreementFindings[0]}\n`);
  cleanup(root);
});

// ---------------------------------------------------- success line + CLI
check("the success line reports measured coverage and names its blind spots (QG-05)", () => {
  const result = checkAdrConsistency();
  const text = successLine(result);
  assert.ok(text.includes(String(result.coverage.filesScanned)), "file count not reported");
  assert.ok(/NOT checked:/.test(text), "no blind spots named");
  assert.ok(/does not check|whether an ADR's decision/.test(text) === false || /whether an ADR's decision/.test(text), "code-comparison blind spot missing");
  assert.ok(/DE-REFERENCE-BELOW/.test(text), "German-translation blind spot not named");
  assert.ok(/Unparsed supersession pairs/.test(text), "unparsed-pairs count not reported");
});

check("CLI: exits 0 against the real docs/adr/ corpus", () => {
  const repoRoot = resolve(here, "..", "..");
  const result = spawnSync(process.execPath, [checkerPath, "--root", repoRoot], { encoding: "utf8" });
  assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
  assert.match(result.stdout, /ADR corpus consistency: 5 classes green/);
});

check("CLI: exits 2 (deliberate break) against a fixture with a duplicate number", () => {
  const root = wellFormedRoot();
  writeAdr(root, "0001-alpha-conflict.md", boldAdr("ADR-0001: Alpha Conflict", "**Status:** accepted · **Date:** 2026-01-03"));
  writeReadme(root, readmeTable([
    "| [0001](0001-alpha.md) | Alpha | accepted | 2026-01-01 |",
    "| [0002](0002-beta.md) | Beta | accepted | 2026-01-02 |",
    "| [0001](0001-alpha-conflict.md) | Alpha Conflict | accepted | 2026-01-03 |",
  ]));
  const result = spawnSync(process.execPath, [checkerPath, "--root", root], { encoding: "utf8" });
  assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr: ${result.stderr}`);
  assert.match(result.stderr, /DUPLICATE-NUMBER/);
  cleanup(root);
});

process.stdout.write(`1..${passed}\n# pass ${passed}\n`);
