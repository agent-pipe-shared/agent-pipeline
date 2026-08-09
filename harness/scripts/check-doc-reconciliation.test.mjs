// SPDX-License-Identifier: SUL-1.0
/**
 * Falsifiability pin for check-doc-reconciliation.mjs. One fixture pair per
 * behaviour (dispatching briefing, DoD 4): each behaviour is shown BROKEN
 * (the check fires) and then FIXED (the same range clears), against a real
 * temporary git repository with real commits -- this module runs `git diff`
 * and `git rev-parse` for real, so a fixture that never initializes a git
 * repo would not be evidence of anything.
 *
 * NOT REGISTERED in harness/scripts/verify.mjs on purpose (that file's
 * maintenance window is closed, same posture as check-adr-consistency.test.mjs);
 * run it directly with `node`.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkDocReconciliation,
  formatRange,
  globMatches,
  globToRegExp,
  successLine,
} from "./check-doc-reconciliation.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const checkerPath = join(here, "check-doc-reconciliation.mjs");

let passed = 0;
function check(name, fn) { fn(); passed += 1; process.stdout.write(`ok ${passed} - ${name}\n`); }

// --------------------------------------------------------------- git fixture

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

function initRepo(root) {
  git(root, "init", "-q");
  git(root, "config", "user.email", "fixture@example.invalid");
  git(root, "config", "user.name", "Fixture");
  mkdirSync(join(root, "docs", "adr"), { recursive: true });
}

function commitAll(root, message) {
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", message);
  return git(root, "rev-parse", "HEAD").trim();
}

function writeAdr(root, filename, governsLine, extra = "") {
  const body = [
    `# ADR-${filename.slice(0, 4)}: Fixture`,
    "",
    "**Status:** accepted · **Date:** 2026-01-01",
    "",
    ...(governsLine ? [governsLine, ""] : []),
    "## Context",
    "",
    `Fixture context.${extra ? ` ${extra}` : ""}`,
    "",
  ].join("\n");
  writeFileSync(join(root, "docs", "adr", filename), body);
}

function writeRecord(root, content) {
  writeFileSync(join(root, "docs", "doc-reconciliation.md"), content);
}

function buildRoot() {
  const root = mkdtempSync(join(tmpdir(), "doc-reconciliation-test-"));
  initRepo(root);
  return root;
}

function cleanup(root) { rmSync(root, { recursive: true, force: true }); }

function run(root, base, candidate) { return checkDocReconciliation({ root, base, candidate }); }

// ---------------------------------------------------------- glob semantics

check("globMatches: a lone `*` matches within one path segment, never across `/`", () => {
  assert.equal(globMatches("docs/*.md", "docs/state.md"), true);
  assert.equal(globMatches("docs/*.md", "docs/adr/0012.md"), false);
});

check("globMatches: `**` crosses directories, including a zero-length span", () => {
  assert.equal(globMatches("plugins/pipeline-core/**", "plugins/pipeline-core/hooks/guard-push.mjs"), true);
  assert.equal(globMatches("plugins/pipeline-core/**", "plugins/pipeline-core/README.md"), true);
  assert.equal(globMatches("plugins/pipeline-core/**", "other/plugins/pipeline-core/x"), false);
});

check("globMatches: every other character is literal, including regex metacharacters", () => {
  assert.equal(globMatches("pipeline.user.yaml", "pipeline.user.yaml"), true);
  assert.equal(globMatches("pipeline.user.yaml", "pipelineXuserXyaml"), false);
});

check("globToRegExp: anchors the full string (a substring match is not a glob match)", () => {
  assert.equal(globToRegExp("state.md").test("docs/state.md"), false);
  assert.equal(globToRegExp("docs/state.md").test("docs/state.md"), true);
});

// ---------------------------------------------------- behaviour 1: fires

check("behaviour 1: an implicated ADR with no record entry fires UNRECONCILED-ADR", () => {
  const root = buildRoot();
  writeAdr(root, "0001-alpha.md", "**Governs:** src/alpha.txt");
  writeFileSync(join(root, "docs", "doc-reconciliation.md"), "# Doc reconciliation record\n\nNo entries yet.\n");
  writeFileSync(join(root, "src.placeholder"), "seed\n");
  const base = commitAll(root, "base");
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "alpha.txt"), "changed\n");
  const candidate = commitAll(root, "candidate: touch src/alpha.txt");

  const result = run(root, base, candidate);
  assert.equal(result.ok, false);
  assert.ok(
    result.findings.some((f) => f.startsWith("UNRECONCILED-ADR 0001-alpha.md:") && f.includes('"src/alpha.txt"') && f.includes(candidate)),
    `expected an UNRECONCILED-ADR finding naming 0001-alpha.md and src/alpha.txt, got:\n  ${result.findings.join("\n  ")}`,
  );
  cleanup(root);
});

// -------------------------------------------------- behaviour 2: clears

check("behaviour 2: the same range with a correct record entry clears", () => {
  const root = buildRoot();
  writeAdr(root, "0001-alpha.md", "**Governs:** src/alpha.txt");
  writeFileSync(join(root, "docs", "doc-reconciliation.md"), "# Doc reconciliation record\n\nNo entries yet.\n");
  writeFileSync(join(root, "src.placeholder"), "seed\n");
  const base = commitAll(root, "base");
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "alpha.txt"), "changed\n");
  const candidate = commitAll(root, "candidate: touch src/alpha.txt");

  writeRecord(root, [
    "# Doc reconciliation record",
    "",
    `## Candidate ${candidate}`,
    "",
    "- ADR-0001: checked, no change needed.",
    "",
  ].join("\n"));

  const result = run(root, base, candidate);
  assert.deepEqual(result.findings, []);
  assert.equal(result.ok, true);
  assert.equal(result.coverage.implicatedCount, 1);
  assert.equal(result.coverage.unreconciledCount, 0);
  cleanup(root);
});

check("behaviour 2b: 'amended in <commit>' is the other recognised satisfying shape", () => {
  const root = buildRoot();
  writeAdr(root, "0001-alpha.md", "**Governs:** src/alpha.txt");
  writeFileSync(join(root, "docs", "doc-reconciliation.md"), "seed\n");
  writeFileSync(join(root, "src.placeholder"), "seed\n");
  const base = commitAll(root, "base");
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "alpha.txt"), "changed\n");
  const candidate = commitAll(root, "candidate");

  writeRecord(root, [
    "# Doc reconciliation record",
    "",
    `## Candidate ${candidate}`,
    "",
    "- ADR-0001: amended in 1234567.",
    "",
  ].join("\n"));

  const result = run(root, base, candidate);
  assert.deepEqual(result.findings, []);
  assert.equal(result.ok, true);
  cleanup(root);
});

// -------------------------------------------- behaviour 3: stale-proof

check("behaviour 3: a record entry naming a DIFFERENT candidate commit does not satisfy the range", () => {
  const root = buildRoot();
  writeAdr(root, "0001-alpha.md", "**Governs:** src/alpha.txt");
  writeFileSync(join(root, "docs", "doc-reconciliation.md"), "seed\n");
  writeFileSync(join(root, "src.placeholder"), "seed\n");
  const base = commitAll(root, "base");
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "alpha.txt"), "changed once\n");
  const staleCandidate = commitAll(root, "candidate 1: touch src/alpha.txt");
  writeFileSync(join(root, "src", "alpha.txt"), "changed again\n");
  const realCandidate = commitAll(root, "candidate 2: touch src/alpha.txt again");

  // A well-formed entry exists, but ONLY under the stale candidate's own heading.
  writeRecord(root, [
    "# Doc reconciliation record",
    "",
    `## Candidate ${staleCandidate}`,
    "",
    "- ADR-0001: checked, no change needed.",
    "",
  ].join("\n"));

  const result = run(root, base, realCandidate);
  assert.equal(result.ok, false);
  assert.ok(
    result.findings.some((f) => f.startsWith("UNRECONCILED-ADR") && f.includes(realCandidate)),
    `expected the record for a different candidate to NOT satisfy this range, got:\n  ${result.findings.join("\n  ")}`,
  );

  // Positive control: the exact same fixture, but the entry is filed under
  // the REAL candidate's own heading -- proves the negative result above is
  // discrimination against the wrong commit, not a check that can never pass.
  writeRecord(root, [
    "# Doc reconciliation record",
    "",
    `## Candidate ${realCandidate}`,
    "",
    "- ADR-0001: checked, no change needed.",
    "",
  ].join("\n"));
  const fixed = run(root, base, realCandidate);
  assert.deepEqual(fixed.findings, []);
  assert.equal(fixed.ok, true);
  cleanup(root);
});

// ---------------------------------------------- behaviour 4: no Governs

check("behaviour 4: an ADR with no Governs: line never fires, however the range changes", () => {
  const root = buildRoot();
  writeAdr(root, "0002-beta.md", null); // no Governs line at all
  writeFileSync(join(root, "docs", "doc-reconciliation.md"), "seed\n");
  const base = commitAll(root, "base");
  // Touch a path that would have implicated 0002 had it carried a matching
  // Governs line -- it does not, so this must never surface a finding.
  writeFileSync(join(root, "docs", "adr", "0002-beta.md"), "# ADR-0002: Fixture\n\n**Status:** accepted · **Date:** 2026-01-02\n\n## Context\n\nEdited, still no Governs line.\n");
  const candidate = commitAll(root, "candidate: edit 0002 itself, still no Governs line");

  const result = run(root, base, candidate);
  assert.deepEqual(result.findings, []);
  assert.equal(result.ok, true);
  assert.equal(result.coverage.adrsWithGoverns, 0);
  assert.equal(result.coverage.implicatedCount, 0);
  cleanup(root);
});

// --------------------------------------------- behaviour 5: orphan glob

check("behaviour 5: a Governs glob matching no tracked file is reported (independent of the range)", () => {
  const root = buildRoot();
  writeAdr(root, "0003-gamma.md", "**Governs:** nowhere/does-not-exist.md");
  writeFileSync(join(root, "docs", "doc-reconciliation.md"), "seed\n");
  const base = commitAll(root, "base");
  writeFileSync(join(root, "README.md"), "unrelated change\n");
  const candidate = commitAll(root, "candidate: unrelated change");

  const result = run(root, base, candidate);
  assert.equal(result.ok, false);
  assert.ok(
    result.findings.some((f) => f.startsWith("ORPHAN-GOVERNS-GLOB 0003-gamma.md:") && f.includes('"nowhere/does-not-exist.md"')),
    `expected an ORPHAN-GOVERNS-GLOB finding, got:\n  ${result.findings.join("\n  ")}`,
  );

  // Positive control: point the glob at a file that really is tracked.
  writeAdr(root, "0003-gamma.md", "**Governs:** README.md");
  const fixedCandidate = commitAll(root, "fix the glob to name a tracked file");
  const fixed = run(root, base, fixedCandidate);
  assert.deepEqual(fixed.findings.filter((f) => f.startsWith("ORPHAN-GOVERNS-GLOB")), []);
  cleanup(root);
});

// ------------------------------------------------------- malformed entry

check("a record line that parses as neither recognised shape is MALFORMED-RECORD-ENTRY and does not satisfy", () => {
  const root = buildRoot();
  writeAdr(root, "0001-alpha.md", "**Governs:** src/alpha.txt");
  writeFileSync(join(root, "docs", "doc-reconciliation.md"), "seed\n");
  writeFileSync(join(root, "src.placeholder"), "seed\n");
  const base = commitAll(root, "base");
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "alpha.txt"), "changed\n");
  const candidate = commitAll(root, "candidate");

  writeRecord(root, [
    "# Doc reconciliation record",
    "",
    `## Candidate ${candidate}`,
    "",
    "- ADR-0001: looked at it, seems fine",
    "",
  ].join("\n"));

  const result = run(root, base, candidate);
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((f) => f.startsWith("MALFORMED-RECORD-ENTRY") && f.includes("ADR-0001")));
  assert.ok(result.findings.some((f) => f.startsWith("UNRECONCILED-ADR")), "a malformed entry must not silently satisfy the ADR it names");
  cleanup(root);
});

// --------------------------------------------------------- usage / errors

check("usage: --base and --candidate are both required; missing either is a findings-carrying failure, never a default range", () => {
  const noBase = checkDocReconciliation({ root: process.cwd(), candidate: "HEAD" });
  assert.equal(noBase.ok, false);
  assert.ok(noBase.findings.some((f) => f.startsWith("USAGE-ERROR")));
  const noCandidate = checkDocReconciliation({ root: process.cwd(), base: "HEAD" });
  assert.equal(noCandidate.ok, false);
  assert.ok(noCandidate.findings.some((f) => f.startsWith("USAGE-ERROR")));
});

check("an unresolvable ref is a GIT-REF-ERROR naming the range, not a silent empty diff", () => {
  const root = buildRoot();
  writeFileSync(join(root, "README.md"), "x\n");
  const base = commitAll(root, "base");
  const result = run(root, base, "not-a-real-ref-xyz");
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((f) => f.startsWith("GIT-REF-ERROR") && f.includes("not-a-real-ref-xyz")));
  cleanup(root);
});

// ------------------------------------------------------- success line + CLI

check("the success line reports the range, changed-path count, Governs coverage, and names its blind spots (QG-05)", () => {
  const root = buildRoot();
  writeAdr(root, "0001-alpha.md", "**Governs:** src/alpha.txt");
  writeFileSync(join(root, "docs", "doc-reconciliation.md"), "seed\n");
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "alpha.txt"), "seed\n"); // tracked, so the glob is not itself an orphan
  const base = commitAll(root, "base");
  writeFileSync(join(root, "README.md"), "unrelated\n");
  const candidate = commitAll(root, "candidate: unrelated change");

  const result = run(root, base, candidate);
  assert.deepEqual(result.findings, []);
  assert.equal(result.ok, true);
  const text = successLine(result);
  assert.ok(text.includes(base) && text.includes(candidate), "range not reported");
  assert.ok(text.includes("1/1 ADRs carry a Governs"), `Governs coverage not reported as expected, got: ${text}`);
  assert.match(text, /NOT checked:/);
  assert.match(text, /cannot make diligence certain|does not make diligence certain/);
  assert.match(text, /docs\/adr\/ only/);
  cleanup(root);
});

check("formatRange reports an unresolved side explicitly rather than omitting it", () => {
  assert.equal(formatRange({ base: "x", candidate: "y", baseSha: null, candidateSha: null }), "x..y (resolved <unresolved>..<unresolved>)");
});

check("CLI: exits 2 when --base or --candidate is omitted, without touching git at all", () => {
  const result = spawnSync(process.execPath, [checkerPath, "--candidate", "HEAD"], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /USAGE: check-doc-reconciliation\.mjs/);
});

check("CLI: exits 0 against a well-formed fixture root with a reconciled range", () => {
  const root = buildRoot();
  writeAdr(root, "0001-alpha.md", "**Governs:** src/alpha.txt");
  writeFileSync(join(root, "docs", "doc-reconciliation.md"), "seed\n");
  writeFileSync(join(root, "src.placeholder"), "seed\n");
  const base = commitAll(root, "base");
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "alpha.txt"), "changed\n");
  const candidate = commitAll(root, "candidate");
  writeRecord(root, ["# Doc reconciliation record", "", `## Candidate ${candidate}`, "", "- ADR-0001: checked, no change needed.", ""].join("\n"));

  const result = spawnSync(process.execPath, [checkerPath, "--root", root, "--base", base, "--candidate", candidate], { encoding: "utf8" });
  assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
  assert.match(result.stdout, /Doc reconciliation: range/);
  cleanup(root);
});

check("CLI: exits 2 (deliberate break) against an unreconciled fixture root, and names the range in stderr", () => {
  const root = buildRoot();
  writeAdr(root, "0001-alpha.md", "**Governs:** src/alpha.txt");
  writeFileSync(join(root, "docs", "doc-reconciliation.md"), "seed\n");
  writeFileSync(join(root, "src.placeholder"), "seed\n");
  const base = commitAll(root, "base");
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "alpha.txt"), "changed\n");
  const candidate = commitAll(root, "candidate");

  const result = spawnSync(process.execPath, [checkerPath, "--root", root, "--base", base, "--candidate", candidate], { encoding: "utf8" });
  assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr: ${result.stderr}`);
  assert.match(result.stderr, /UNRECONCILED-ADR/);
  assert.ok(result.stderr.includes(`${base}..${candidate}`), `expected the range in stderr, got: ${result.stderr}`);
  cleanup(root);
});

// ---------------------------------------------------------- real corpus

check("CLI: exits 0 against the real repository over a range that changes nothing implicated (regression proof, DoD 2)", () => {
  const repoRoot = resolve(here, "..", "..");
  // Same commit pair used for DoD 2 in the dispatch report: a backlog-only
  // change, which no seeded Governs glob matches.
  const result = spawnSync(process.execPath, [checkerPath, "--base", "3345efe~1", "--candidate", "3345efe"], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(result.status, 0, `expected exit 0 against the real corpus, got ${result.status}; stderr: ${result.stderr}`);
  assert.match(result.stdout, /Doc reconciliation: range/);
});

process.stdout.write(`1..${passed}\n# pass ${passed}\n`);
