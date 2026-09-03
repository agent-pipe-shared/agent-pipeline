// SPDX-License-Identifier: SUL-1.0
/**
 * Falsifiability pin for check-dispatch-provenance.mjs (A-AC-08, briefing
 * WP-A-AC08). Same fixture posture as check-doc-reconciliation.test.mjs:
 * every behaviour is shown against a real temporary git repository with
 * real commits -- this module runs `git log`/`git diff-tree`/`git rev-parse`
 * for real, so a fixture that never initializes a git repo would not be
 * evidence of anything.
 *
 * NOT REGISTERED in harness/scripts/verify.mjs on purpose (standalone
 * checker per the dispatching briefing); run directly with `node --test` or
 * plain `node`.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkDispatchProvenance,
  checkDispatchRecordShape,
  formatRange,
  hasStage0Phrase,
  parseDispatchTrailer,
  stage0CapsMet,
  summaryLine,
  touchesTrackedSource,
} from "./check-dispatch-provenance.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const checkerPath = join(here, "check-dispatch-provenance.mjs");
const repoRoot = resolve(here, "..", "..");

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
}

function buildRoot() {
  const root = mkdtempSync(join(tmpdir(), "dispatch-provenance-test-"));
  initRepo(root);
  return root;
}

function cleanup(root) { rmSync(root, { recursive: true, force: true }); }

function writeFile(root, relPath, content) {
  const full = join(root, ...relPath.split("/"));
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function commit(root, message) {
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", message);
  return git(root, "rev-parse", "HEAD").trim();
}

/** N distinct lines, so each call's diff has a precisely known line count. */
function nLines(n, tag) {
  const lines = [];
  for (let i = 0; i < n; i += 1) lines.push(`${tag} line ${i}`);
  return `${lines.join("\n")}\n`;
}

function run(root, base, candidate, evidenceDir) { return checkDispatchProvenance({ root, base, candidate, evidenceDir }); }

function findingsOf(result, code) { return result.findings.filter((f) => f.startsWith(code)); }

// --------------------------------------------------- dispatch-record fixtures

function buildEvidenceDir() { return mkdtempSync(join(tmpdir(), "dispatch-record-shape-test-")); }

function writeRecord(evidenceDir, taskId, record) {
  writeFileSync(join(evidenceDir, `dispatch-record-${taskId}.json`), JSON.stringify(record, null, 2));
}

// -------------------------------------------------------------- unit-level

check("touchesTrackedSource: pure docs/+scratch/ paths are excluded, any other path is not", () => {
  assert.equal(touchesTrackedSource(["docs/state.md", "scratch/notes.txt"]), false);
  assert.equal(touchesTrackedSource(["docs/state.md", "harness/scripts/x.mjs"]), true);
  assert.equal(touchesTrackedSource([]), false);
});

check("parseDispatchTrailer: valid goldfish/critic trailers, malformed shapes, and absence", () => {
  assert.deepEqual(parseDispatchTrailer("fix: x\n\nDispatch: WP-A-AC08 (goldfish)\nAI-Assisted: true\n"), {
    present: true, valid: true, taskId: "WP-A-AC08", role: "goldfish", raw: "WP-A-AC08 (goldfish)",
  });
  assert.equal(parseDispatchTrailer("fix: x\n\nDispatch: WP-1 (critic)\n").valid, true);
  assert.equal(parseDispatchTrailer("fix: x\n\nDispatch: WP-1\n").valid, false); // missing role suffix
  assert.equal(parseDispatchTrailer("fix: x\n\nDispatch:  (goldfish)\n").valid, false); // empty TASK_ID
  assert.equal(parseDispatchTrailer("fix: x\n\nno trailer here\n").present, false);
});

check("hasStage0Phrase: case-insensitive", () => {
  assert.equal(hasStage0Phrase("within the stage-0 fast path"), true);
  assert.equal(hasStage0Phrase("within the STAGE-0 FAST PATH"), true);
  assert.equal(hasStage0Phrase("an ordinary commit"), false);
});

check("stage0CapsMet: exactly-at-cap passes, one over either cap fails", () => {
  const twoFiles = [{ added: 10, deleted: 0 }, { added: 15, deleted: 0 }]; // 2 files, 25 lines
  assert.equal(stage0CapsMet(twoFiles).withinCaps, true);
  const threeFiles = [{ added: 1, deleted: 0 }, { added: 1, deleted: 0 }, { added: 1, deleted: 0 }];
  assert.equal(stage0CapsMet(threeFiles).withinCaps, false);
  const tooManyLines = [{ added: 26, deleted: 0 }];
  assert.equal(stage0CapsMet(tooManyLines).withinCaps, false);
});

// --------------------------------------------------- behaviour: no trailer, no phrase

check("behaviour: missing trailer + no stage-0 phrase -> MISSING-DISPATCH-PROVENANCE reason=no-trailer-no-exemption", () => {
  const root = buildRoot();
  writeFile(root, "src/seed.txt", "seed\n");
  const base = commit(root, "base");
  writeFile(root, "src/alpha.txt", "changed\n");
  const candidate = commit(root, "ordinary commit, no trailer, no phrase");

  const result = run(root, base, candidate);
  assert.equal(result.ok, false);
  const findings = findingsOf(result, "MISSING-DISPATCH-PROVENANCE");
  assert.ok(findings.some((f) => f.includes(candidate) && f.includes("reason=no-trailer-no-exemption")), findings.join("\n"));
  cleanup(root);
});

// ------------------------------------------------- behaviour: recognized exemption

check("behaviour: missing trailer + phrase present + caps met -> recognized exemption, clears", () => {
  const root = buildRoot();
  writeFile(root, "src/seed.txt", "seed\n");
  const base = commit(root, "base");
  writeFile(root, "src/alpha.txt", nLines(10, "alpha"));
  const candidate = commit(root, "fix(x): small repair\n\nAuthored within the stage-0 fast path.\n\nAI-Assisted: true\n");

  const result = run(root, base, candidate);
  assert.equal(result.ok, true, result.findings.join("\n"));
  assert.equal(result.coverage.commitsExempt, 1);
  cleanup(root);
});

// ---------------------------------------------- behaviour: phrase but caps exceeded

check("behaviour: missing trailer + phrase present + caps NOT met -> flagged, reason=stage0-claim-caps-exceeded", () => {
  const root = buildRoot();
  writeFile(root, "src/seed.txt", "seed\n");
  const base = commit(root, "base");
  writeFile(root, "src/alpha.txt", nLines(30, "alpha")); // 30 > STAGE0_MAX_LINES
  const candidate = commit(root, "fix(x): large repair\n\nClaims the stage-0 fast path.\n\nAI-Assisted: true\n");

  const result = run(root, base, candidate);
  assert.equal(result.ok, false);
  const findings = findingsOf(result, "MISSING-DISPATCH-PROVENANCE");
  assert.ok(
    findings.some((f) => f.includes(candidate) && f.includes("reason=stage0-claim-caps-exceeded") && f.includes("30 changed lines")),
    findings.join("\n"),
  );
  cleanup(root);
});

check("behaviour: phrase present + files cap exceeded (3 files) -> flagged even with tiny diffs", () => {
  const root = buildRoot();
  writeFile(root, "src/seed.txt", "seed\n");
  const base = commit(root, "base");
  writeFile(root, "src/a.txt", "a\n");
  writeFile(root, "src/b.txt", "b\n");
  writeFile(root, "src/c.txt", "c\n");
  const candidate = commit(root, "fix(x): touch three files\n\nWithin the stage-0 fast path.\n\nAI-Assisted: true\n");

  const result = run(root, base, candidate);
  assert.equal(result.ok, false);
  assert.ok(findingsOf(result, "MISSING-DISPATCH-PROVENANCE").some((f) => f.includes("reason=stage0-claim-caps-exceeded")));
  cleanup(root);
});

// --------------------------------------------------------- behaviour: malformed trailer

check("behaviour: malformed Dispatch: trailer (missing role suffix) -> flagged, reason=malformed-trailer, phrase does not rescue it", () => {
  const root = buildRoot();
  writeFile(root, "src/seed.txt", "seed\n");
  const base = commit(root, "base");
  writeFile(root, "src/alpha.txt", "changed\n");
  const candidate = commit(
    root,
    "fix(x): repair\n\nWithin the stage-0 fast path.\n\nDispatch: WP-1\nAI-Assisted: true\n",
  );

  const result = run(root, base, candidate);
  assert.equal(result.ok, false);
  const findings = findingsOf(result, "MISSING-DISPATCH-PROVENANCE");
  assert.ok(findings.some((f) => f.includes(candidate) && f.includes("reason=malformed-trailer")), findings.join("\n"));
  cleanup(root);
});

check("behaviour: malformed Dispatch: trailer (empty TASK_ID) -> flagged, reason=malformed-trailer", () => {
  const root = buildRoot();
  writeFile(root, "src/seed.txt", "seed\n");
  const base = commit(root, "base");
  writeFile(root, "src/alpha.txt", "changed\n");
  const candidate = commit(root, "fix(x): repair\n\nDispatch:  (goldfish)\nAI-Assisted: true\n");

  const result = run(root, base, candidate);
  assert.equal(result.ok, false);
  assert.ok(findingsOf(result, "MISSING-DISPATCH-PROVENANCE").some((f) => f.includes("reason=malformed-trailer")));
  cleanup(root);
});

// ------------------------------------------------------------- behaviour: clears

check("behaviour: a valid goldfish trailer clears the commit", () => {
  const root = buildRoot();
  writeFile(root, "src/seed.txt", "seed\n");
  const base = commit(root, "base");
  writeFile(root, "src/alpha.txt", "changed\n");
  const candidate = commit(root, "feat(x): thing\n\nDispatch: WP-A-AC08 (goldfish)\nAI-Assisted: true\n");

  const result = run(root, base, candidate);
  assert.equal(result.ok, true, result.findings.join("\n"));
  cleanup(root);
});

check("behaviour: a valid critic trailer also clears the commit", () => {
  const root = buildRoot();
  writeFile(root, "src/seed.txt", "seed\n");
  const base = commit(root, "base");
  writeFile(root, "src/alpha.txt", "changed\n");
  const candidate = commit(root, "docs(review): findings\n\nDispatch: WP-A-AC08 (critic)\nAI-Assisted: true\n");

  const result = run(root, base, candidate);
  assert.equal(result.ok, true, result.findings.join("\n"));
  cleanup(root);
});

// ----------------------------------------------- behaviour: file-type filter

check("behaviour: a docs/-only commit is excluded entirely, even with no trailer and no phrase", () => {
  const root = buildRoot();
  writeFile(root, "src/seed.txt", "seed\n");
  const base = commit(root, "base");
  writeFile(root, "docs/state.md", "updated\n");
  const candidate = commit(root, "docs(state): update handover");

  const result = run(root, base, candidate);
  assert.equal(result.ok, true, result.findings.join("\n"));
  assert.equal(result.coverage.commitsTouchingSource, 0);
  cleanup(root);
});

check("behaviour: a scratch/-only commit is also excluded", () => {
  const root = buildRoot();
  writeFile(root, "src/seed.txt", "seed\n");
  const base = commit(root, "base");
  writeFile(root, "scratch/dispatch-record-X.json", "{}\n");
  const candidate = commit(root, "scratch: dispatch record");

  const result = run(root, base, candidate);
  assert.equal(result.ok, true, result.findings.join("\n"));
  cleanup(root);
});

check("behaviour: a mixed docs/+source commit IS examined (touches a tracked source file)", () => {
  const root = buildRoot();
  writeFile(root, "src/seed.txt", "seed\n");
  const base = commit(root, "base");
  writeFile(root, "docs/state.md", "updated\n");
  writeFile(root, "src/alpha.txt", "changed\n");
  const candidate = commit(root, "mixed commit, no trailer, no phrase");

  const result = run(root, base, candidate);
  assert.equal(result.ok, false);
  assert.equal(result.coverage.commitsTouchingSource, 1);
  cleanup(root);
});

// ---------------------------------------------- dispatch-record shape (NVA-B-RECSHAPE-1)
// agent-obligations.md §6's three entailments of a valid `Dispatch:` trailer. REPORTED,
// NOT FATAL: every case below asserts `result.ok` and the CLI exit code are unaffected,
// alongside asserting the specific `recordShapeFindings` entry the case is about.

check("checkDispatchRecordShape: a compliant record (terminal outcome, changedFiles covers the path) -> no finding", () => {
  const evidenceDir = buildEvidenceDir();
  writeRecord(evidenceDir, "WP-COMPLIANT", { outcome: "completed", report: { changedFiles: ["src/alpha.txt"] } });
  const findings = checkDispatchRecordShape("deadbeef", "WP-COMPLIANT", ["src/alpha.txt"], { evidenceDir });
  assert.deepEqual(findings, []);
  cleanup(evidenceDir);
});

check("checkDispatchRecordShape: record absent -> DISPATCH-RECORD-MISSING reason=record-absent", () => {
  const evidenceDir = buildEvidenceDir();
  const findings = checkDispatchRecordShape("deadbeef", "WP-NO-RECORD", ["src/alpha.txt"], { evidenceDir });
  assert.equal(findings.length, 1);
  assert.match(findings[0], /^DISPATCH-RECORD-MISSING deadbeef taskId=WP-NO-RECORD reason=record-absent/);
  cleanup(evidenceDir);
});

check("checkDispatchRecordShape: non-terminal outcome -> DISPATCH-RECORD-NOT-TERMINAL", () => {
  const evidenceDir = buildEvidenceDir();
  writeRecord(evidenceDir, "WP-INPROGRESS", { outcome: "in-progress", report: { changedFiles: ["src/alpha.txt"] } });
  const findings = checkDispatchRecordShape("deadbeef", "WP-INPROGRESS", ["src/alpha.txt"], { evidenceDir });
  assert.equal(findings.length, 1);
  assert.match(findings[0], /^DISPATCH-RECORD-NOT-TERMINAL deadbeef taskId=WP-INPROGRESS outcome="in-progress"/);
  cleanup(evidenceDir);
});

check("checkDispatchRecordShape: changedFiles absent -> DISPATCH-RECORD-PATHS-UNCOVERED reason=changedfiles-absent", () => {
  const evidenceDir = buildEvidenceDir();
  writeRecord(evidenceDir, "WP-NOFILES", { outcome: "completed" });
  const findings = checkDispatchRecordShape("deadbeef", "WP-NOFILES", ["src/alpha.txt"], { evidenceDir });
  assert.equal(findings.length, 1);
  assert.match(findings[0], /^DISPATCH-RECORD-PATHS-UNCOVERED deadbeef taskId=WP-NOFILES reason=changedfiles-absent/);
  cleanup(evidenceDir);
});

check("checkDispatchRecordShape: changedFiles present but does not cover a touched path -> reason=changedfiles-incomplete", () => {
  const evidenceDir = buildEvidenceDir();
  writeRecord(evidenceDir, "WP-PARTIAL", { outcome: "completed", report: { changedFiles: ["src/other.txt"] } });
  const findings = checkDispatchRecordShape("deadbeef", "WP-PARTIAL", ["src/alpha.txt"], { evidenceDir });
  assert.equal(findings.length, 1);
  assert.match(findings[0], /^DISPATCH-RECORD-PATHS-UNCOVERED deadbeef taskId=WP-PARTIAL reason=changedfiles-incomplete/);
  assert.ok(findings[0].includes("src/alpha.txt"));
  cleanup(evidenceDir);
});

check("checkDispatchRecordShape: a record can fail two conditions at once, and both are reported", () => {
  const evidenceDir = buildEvidenceDir();
  writeRecord(evidenceDir, "WP-BOTH", { outcome: "in-progress" });
  const findings = checkDispatchRecordShape("deadbeef", "WP-BOTH", ["src/alpha.txt"], { evidenceDir });
  assert.equal(findings.length, 2);
  assert.ok(findings.some((f) => f.startsWith("DISPATCH-RECORD-NOT-TERMINAL")));
  assert.ok(findings.some((f) => f.startsWith("DISPATCH-RECORD-PATHS-UNCOVERED")));
  cleanup(evidenceDir);
});

check("behaviour: a stage-0-exempt commit with no record at all produces NO dispatch-record-shape finding", () => {
  const root = buildRoot();
  const evidenceDir = buildEvidenceDir();
  writeFile(root, "src/seed.txt", "seed\n");
  const base = commit(root, "base");
  writeFile(root, "src/alpha.txt", nLines(10, "alpha"));
  const candidate = commit(root, "fix(x): small repair\n\nAuthored within the stage-0 fast path.\n\nAI-Assisted: true\n");

  const result = run(root, base, candidate, evidenceDir);
  assert.equal(result.ok, true, result.findings.join("\n"));
  assert.deepEqual(result.recordShapeFindings, []);
  cleanup(root);
  cleanup(evidenceDir);
});

check("behaviour (falsifier): a valid trailer naming a MISSING record is reported, but never fatal -- ok stays true, exit stays 0", () => {
  const root = buildRoot();
  const evidenceDir = buildEvidenceDir(); // deliberately empty -- no dispatch-record-WP-A-AC08.json
  writeFile(root, "src/seed.txt", "seed\n");
  const base = commit(root, "base");
  writeFile(root, "src/alpha.txt", "changed\n");
  const candidate = commit(root, "feat(x): thing\n\nDispatch: WP-A-AC08 (goldfish)\nAI-Assisted: true\n");

  const result = run(root, base, candidate, evidenceDir);
  assert.equal(result.ok, true, result.findings.join("\n")); // pre-existing findings/exit unchanged by the new class
  assert.equal(result.findings.length, 0);
  assert.equal(result.recordShapeFindings.length, 1);
  assert.match(result.recordShapeFindings[0], /^DISPATCH-RECORD-MISSING/);

  const cliResult = spawnSync(
    process.execPath,
    [checkerPath, "--root", root, "--base", base, "--candidate", candidate],
    { encoding: "utf8", env: { ...process.env } },
  );
  // The real CLI run (no --evidence-dir flag) resolves against THIS repository's own
  // evidence/ directory (module header: evidenceDir is never derived from --root), so it
  // is not asserted against here -- only the exit code, which is `ok`-driven either way.
  assert.equal(cliResult.status, 0, `stderr: ${cliResult.stderr}`);
  cleanup(root);
  cleanup(evidenceDir);
});

check("behaviour: a compliant record via the full checkDispatchProvenance path produces no dispatch-record-shape finding", () => {
  const root = buildRoot();
  const evidenceDir = buildEvidenceDir();
  writeFile(root, "src/seed.txt", "seed\n");
  const base = commit(root, "base");
  writeFile(root, "src/alpha.txt", "changed\n");
  const candidate = commit(root, "feat(x): thing\n\nDispatch: WP-FULL-PASS (goldfish)\nAI-Assisted: true\n");
  writeRecord(evidenceDir, "WP-FULL-PASS", { outcome: "completed", report: { changedFiles: ["src/alpha.txt"] } });

  const result = run(root, base, candidate, evidenceDir);
  assert.equal(result.ok, true, result.findings.join("\n"));
  assert.deepEqual(result.recordShapeFindings, []);
  cleanup(root);
  cleanup(evidenceDir);
});

// -------------------------------------------------------------------- usage

check("usage: --base and --candidate are both required; missing either is a findings-carrying failure", () => {
  const result = checkDispatchProvenance({ root: repoRoot });
  assert.equal(result.ok, false);
  assert.ok(result.findings[0].startsWith("USAGE-ERROR"));
});

check("an unresolvable ref is a GIT-REF-ERROR naming the range", () => {
  const root = buildRoot();
  writeFile(root, "src/seed.txt", "seed\n");
  const base = commit(root, "base");
  const result = run(root, base, "does-not-exist-ref");
  assert.equal(result.ok, false);
  assert.ok(result.findings[0].startsWith("GIT-REF-ERROR"));
  cleanup(root);
});

check("formatRange reports an unresolved side explicitly", () => {
  const range = { base: "abc", candidate: "def", baseSha: null, candidateSha: null };
  assert.equal(formatRange(range), "abc..def (resolved <unresolved>..<unresolved>)");
});

check("summaryLine names the range and its blind spots (QG-05 posture)", () => {
  const line = summaryLine({
    range: { base: "b", candidate: "c", baseSha: "b".repeat(40), candidateSha: "c".repeat(40) },
    coverage: { commitsInRange: 1, commitsTouchingSource: 1, commitsExempt: 0, findingCount: 0 },
  });
  assert.match(line, /WHAT THIS CHECK CANNOT DO/);
  assert.match(line, /EL-01/);
});

// ------------------------------------------------------------------------ CLI

check("CLI: exits 2 when --base or --candidate is omitted", () => {
  const result = spawnSync(process.execPath, [checkerPath], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /USAGE/);
});

check("CLI: exits 0 against a clean fixture root", () => {
  const root = buildRoot();
  writeFile(root, "src/seed.txt", "seed\n");
  const base = commit(root, "base");
  writeFile(root, "src/alpha.txt", "changed\n");
  const candidate = commit(root, "feat(x): thing\n\nDispatch: WP-A-AC08 (goldfish)\nAI-Assisted: true\n");

  const result = spawnSync(process.execPath, [checkerPath, "--root", root, "--base", base, "--candidate", candidate], { encoding: "utf8" });
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.match(result.stdout, /Dispatch provenance: range/);
  cleanup(root);
});

check("CLI: exits 2 against an unreconciled fixture root, and names the commit + reason in stderr", () => {
  const root = buildRoot();
  writeFile(root, "src/seed.txt", "seed\n");
  const base = commit(root, "base");
  writeFile(root, "src/alpha.txt", "changed\n");
  const candidate = commit(root, "ordinary commit, no trailer, no phrase");

  const result = spawnSync(process.execPath, [checkerPath, "--root", root, "--base", base, "--candidate", candidate], { encoding: "utf8" });
  assert.equal(result.status, 2, `stderr: ${result.stderr}`);
  assert.match(result.stderr, /MISSING-DISPATCH-PROVENANCE/);
  assert.ok(result.stderr.includes(candidate), result.stderr);
  cleanup(root);
});

// ---------------------------------------------------------- real corpus

check("CLI: a real repo stage-0 precedent commit is recognized as exempt (regression proof against real history)", () => {
  const result = spawnSync(
    process.execPath,
    [checkerPath, "--base", "a54f53b1~1", "--candidate", "a54f53b1"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.equal(result.status, 0, `expected exit 0 for a real stage-0 precedent commit, got ${result.status}; stderr: ${result.stderr}`);
  assert.match(result.stdout, /Dispatch provenance: range/);
});

process.stdout.write(`1..${passed}\n# pass ${passed}\n`);
