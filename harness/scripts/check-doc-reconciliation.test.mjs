// SPDX-License-Identifier: SUL-1.0
/**
 * Falsifiability pin for check-doc-reconciliation.mjs. One fixture pair per
 * behaviour (dispatching briefing, DoD 4): each behaviour is shown BROKEN
 * (the check fires) and then FIXED (the same range clears), against a real
 * temporary git repository with real commits -- this module runs `git diff`
 * and `git rev-parse` for real, so a fixture that never initializes a git
 * repo would not be evidence of anything.
 *
 * F1/F2 (PHX-RECFIX, 2026-08-09): ADR bodies/`Governs:` lines are read from
 * the candidate commit (F1(b)); the reconciliation record is read from
 * `--record-ref` (default `HEAD`), a SEPARATE ref from `candidate` by
 * construction -- a record naming candidate X cannot live inside X (module
 * header, check-doc-reconciliation.mjs, "THREE THINGS ABOUT WHERE BYTES
 * COME FROM"). Every fixture below that wants a record to be READ now
 * commits it (`commitAll` after `writeRecord`) -- an uncommitted
 * `writeRecord` is deliberately still used where a fixture's whole point IS
 * to prove that state is invisible (F1(a)). `amended in <commit>` citations
 * are resolved (F2), so a placeholder hex no longer qualifies as a
 * satisfying entry; fixtures citing an amendment use a real, ancestor commit
 * that actually touches the named ADR.
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
  // The record cannot live INSIDE `candidate` (module header, "THREE THINGS
  // ABOUT WHERE BYTES COME FROM", point (ii)) -- it is committed as its own,
  // later commit, and read from --record-ref, which defaults to HEAD.
  commitAll(root, "record: reconcile ADR-0001 for the candidate");

  const result = run(root, base, candidate);
  assert.deepEqual(result.findings, []);
  assert.equal(result.ok, true);
  assert.equal(result.coverage.implicatedCount, 1);
  assert.equal(result.coverage.unreconciledCount, 0);
  cleanup(root);
});

check("behaviour 2b: 'amended in <commit>' is the other recognised satisfying shape (F2: citing a real, resolvable commit)", () => {
  const root = buildRoot();
  writeAdr(root, "0001-alpha.md", "**Governs:** src/alpha.txt");
  writeFileSync(join(root, "docs", "doc-reconciliation.md"), "seed\n");
  writeFileSync(join(root, "src.placeholder"), "seed\n");
  const base = commitAll(root, "base");
  // A real, prior commit that actually amends ADR-0001 -- F2 resolves the
  // citation (exists, ancestor of candidate, touches the named ADR), so an
  // arbitrary placeholder hex no longer qualifies here (see the dedicated F2
  // suite below for the rejection side).
  writeAdr(root, "0001-alpha.md", "**Governs:** src/alpha.txt", "Amended.");
  const amendCommit = commitAll(root, "amend ADR-0001");
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "alpha.txt"), "changed\n");
  const candidate = commitAll(root, "candidate");

  writeRecord(root, [
    "# Doc reconciliation record",
    "",
    `## Candidate ${candidate}`,
    "",
    `- ADR-0001: amended in ${amendCommit}.`,
    "",
  ].join("\n"));
  commitAll(root, "record: cite the real amending commit");

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

  // A well-formed entry exists, committed, but ONLY under the stale
  // candidate's own heading.
  writeRecord(root, [
    "# Doc reconciliation record",
    "",
    `## Candidate ${staleCandidate}`,
    "",
    "- ADR-0001: checked, no change needed.",
    "",
  ].join("\n"));
  commitAll(root, "record: reconcile the STALE candidate only");

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
  commitAll(root, "record: reconcile the REAL candidate");
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
  commitAll(root, "record: a malformed entry");

  const result = run(root, base, candidate);
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((f) => f.startsWith("MALFORMED-RECORD-ENTRY") && f.includes("ADR-0001")));
  assert.ok(result.findings.some((f) => f.startsWith("UNRECONCILED-ADR")), "a malformed entry must not silently satisfy the ADR it names");
  cleanup(root);
});

// ------------------------------------------- F1(a): record is commit-bound

check("F1(a): a record written but never committed does not satisfy the check -- committing it on --record-ref does", () => {
  const root = buildRoot();
  writeAdr(root, "0001-alpha.md", "**Governs:** src/alpha.txt");
  writeFileSync(join(root, "docs", "doc-reconciliation.md"), "# Doc reconciliation record\n\nNo entries yet.\n");
  writeFileSync(join(root, "src.placeholder"), "seed\n");
  const base = commitAll(root, "base");
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "alpha.txt"), "changed\n");
  const candidate = commitAll(root, "candidate: touch src/alpha.txt");

  const recordContent = [
    "# Doc reconciliation record",
    "",
    `## Candidate ${candidate}`,
    "",
    "- ADR-0001: checked, no change needed.",
    "",
  ].join("\n");

  // Write the SAME correctly-shaped, correctly-headed entry -- but leave it
  // sitting only in the working tree, never committed.
  writeRecord(root, recordContent);
  const uncommitted = run(root, base, candidate);
  assert.equal(uncommitted.ok, false, "an uncommitted record must not satisfy the check (F1)");
  assert.ok(
    uncommitted.findings.some((f) => f.startsWith("UNRECONCILED-ADR") && f.includes(candidate)),
    `expected UNRECONCILED-ADR, got:\n  ${uncommitted.findings.join("\n  ")}`,
  );

  // Positive control (DoD 1): the SAME record content, actually committed --
  // on its own, later commit, exactly as the write-order rule prescribes
  // (docs/doc-reconciliation.md) and as --record-ref (default HEAD) reads.
  const recordCommit = commitAll(root, "record: reconcile the candidate");
  const committed = run(root, base, candidate);
  assert.deepEqual(committed.findings, []);
  assert.equal(committed.ok, true, `expected the committed record to satisfy the check, got:\n  ${committed.findings.join("\n  ")}`);
  assert.equal(committed.range.recordRefSha, recordCommit, "default --record-ref (HEAD) must resolve to the just-made record commit");
  cleanup(root);
});

// ------------------------------------ F1(b): Governs: line is commit-bound

check("F1(b): a Governs: line deleted in the working tree only does not narrow the implicated set -- committing the deletion does", () => {
  const root = buildRoot();
  writeAdr(root, "0001-alpha.md", "**Governs:** src/alpha.txt");
  writeFileSync(join(root, "docs", "doc-reconciliation.md"), "seed\n");
  writeFileSync(join(root, "src.placeholder"), "seed\n");
  const base = commitAll(root, "base");
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "alpha.txt"), "changed\n");
  const candidate = commitAll(root, "candidate: touch src/alpha.txt");

  // Delete the Governs: line in the WORKING TREE only -- never committed.
  writeAdr(root, "0001-alpha.md", null);
  const stillFires = run(root, base, candidate);
  assert.equal(stillFires.ok, false, "a working-tree-only deletion of Governs: must not silence the ADR for this candidate (F1)");
  assert.ok(
    stillFires.findings.some((f) => f.startsWith("UNRECONCILED-ADR 0001-alpha.md") && f.includes(candidate)),
    `expected the candidate's OWN committed Governs: line to still implicate ADR-0001, got:\n  ${stillFires.findings.join("\n  ")}`,
  );
  assert.equal(stillFires.coverage.adrsWithGoverns, 1, "the candidate's OWN committed tree still carries the Governs: line");

  // Positive control (DoD 1): commit the SAME deletion for real, as a NEW candidate.
  const candidate2 = commitAll(root, "actually remove the Governs: line");
  const cleared = run(root, base, candidate2);
  assert.deepEqual(cleared.findings, []);
  assert.equal(cleared.ok, true);
  assert.equal(cleared.coverage.adrsWithGoverns, 0);
  cleanup(root);
});

// ------------------------------------------------- F2: amendment resolution

check("F2: an 'amended in <commit>' citing a nonexistent commit is UNRESOLVED-AMENDMENT and does not satisfy -- citing a real, qualifying commit does", () => {
  const root = buildRoot();
  writeAdr(root, "0001-alpha.md", "**Governs:** src/alpha.txt");
  writeFileSync(join(root, "docs", "doc-reconciliation.md"), "seed\n");
  writeFileSync(join(root, "src.placeholder"), "seed\n");
  const base = commitAll(root, "base");
  // A real, prior commit that actually amends ADR-0001 -- the qualifying
  // citation for the positive control below.
  writeAdr(root, "0001-alpha.md", "**Governs:** src/alpha.txt", "Amended for real.");
  const realAmendCommit = commitAll(root, "amend ADR-0001 for real");
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "alpha.txt"), "changed\n");
  const candidate = commitAll(root, "candidate: touch src/alpha.txt");

  const fakeSha = "1234567890123456789012345678901234567890";
  writeRecord(root, [
    "# Doc reconciliation record", "", `## Candidate ${candidate}`, "",
    `- ADR-0001: amended in ${fakeSha}.`, "",
  ].join("\n"));
  commitAll(root, "record: cite a nonexistent commit");

  const negative = run(root, base, candidate);
  assert.equal(negative.ok, false);
  assert.ok(
    negative.findings.some((f) => f.startsWith("UNRESOLVED-AMENDMENT") && f.includes("ADR-0001") && f.includes(fakeSha)),
    `expected UNRESOLVED-AMENDMENT, got:\n  ${negative.findings.join("\n  ")}`,
  );

  // Positive control: the SAME candidate, a NEW record entry citing the
  // real, ancestor commit that actually touched ADR-0001.
  writeRecord(root, [
    "# Doc reconciliation record", "", `## Candidate ${candidate}`, "",
    `- ADR-0001: amended in ${realAmendCommit}.`, "",
  ].join("\n"));
  commitAll(root, "record: cite the real amending commit");

  const positive = run(root, base, candidate);
  assert.deepEqual(positive.findings, []);
  assert.equal(positive.ok, true, `expected the resolved citation to satisfy the check, got:\n  ${positive.findings.join("\n  ")}`);
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
  commitAll(root, "record: reconcile the candidate");

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
