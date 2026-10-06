#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * gitleaks-repair-ignore.value-binding.test.mjs -- regression coverage for backlog item
 * pipeline.gitleaks-repair-does-not-check-that-the-moved-value-is-the-reviewed-one.
 *
 * A content-v1 `.gitleaksignore` entry binds path + rule + line + column + the secret VALUE (a
 * sha256 over all five). The line binding exists to force a fresh review whenever what sits at the
 * location is no longer what was reviewed. `repairStaleIgnoreEntry()` re-binds a stale entry to the
 * line a live finding moved to, so it may only do that when the live finding carries the SAME value
 * the removed entry was computed for. It selects the live finding by path + rule + column, recomputes
 * that finding's digest at the old line and refuses with a reason starting `value-binding-mismatch:`
 * on a mismatch, so a DIFFERENT value at the same location is never silently suppressed. This suite
 * is the regression pin for that refusal.
 *
 * Cases (the fixtures of (a) and (b*) differ ONLY in the value the live scan reports, which is what
 * rules out any other refusal path as the cause of a refusal):
 *   (a)  positive control -- same value at a new line: repair succeeds, exactly one line changes.
 *   (b1) the defect -- different value at the new line: repair must refuse with a reason.
 *   (b2) ... and the ignore file must be byte-identical afterwards.
 *   (b3) ... and the scan must still report the different value (it must not end up suppressed).
 *   (c)  no partial write -- the refusal leaves no temp or backup file next to the ignore file.
 *
 * Hermetic: a spy spawnFn returns synthetic gitleaks JSON, no real gitleaks binary is ever run, the
 * repository and ignore file are synthetic temp fixtures, every secret value is an obviously fake
 * placeholder string. Entries are always computed with the module's own exported
 * gitleaksContentAuthorityLine(), never by re-implementing the digest.
 *
 * Run:  node --test plugins/pipeline-core/scripts/gitleaks-repair-ignore.value-binding.test.mjs
 * Exit: 0 = all cases pass, non-zero = at least one case failed.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gitleaksContentAuthorityLine, run } from "./security-adapters/gitleaks.mjs";
import { repairStaleIgnoreEntry } from "./gitleaks-repair-ignore.mjs";

const REL_PATH = "backlog/fixture-value-binding.txt";
const RULE = "fixture-rule";
const COLUMN = 7;
const OLD_LINE = 3; // where the reviewed value was recorded
const NEW_LINE = 48; // where the live scan now reports a finding at the same path/rule/column
const REVIEWED_VALUE = "fixture-secret-value-reviewed"; // "V": the value the entry was computed for
const REPLACED_VALUE = "fixture-secret-value-replaced"; // "W": a different value nobody reviewed
const COMMENT_LINE = "# synthetic fixture -- not a real ignore file";
const UNRELATED_ENTRY = "content-v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:backlog/other.txt:fixture-rule:1:1";

/**
 * Synthetic repository: a comment line, an unrelated entry, and the stale entry for the REVIEWED
 * value at OLD_LINE. The spy scan reports one finding at NEW_LINE carrying `liveSecret`.
 */
function makeFixture({ liveSecret }) {
  const rootDir = mkdtempSync(join(tmpdir(), "gitleaks-repair-valuebind-"));
  mkdirSync(join(rootDir, "backlog"), { recursive: true });
  writeFileSync(join(rootDir, REL_PATH), "fixture content\n");

  const reviewedEntry = gitleaksContentAuthorityLine({
    File: REL_PATH, RuleID: RULE, StartLine: OLD_LINE, StartColumn: COLUMN, Secret: REVIEWED_VALUE,
  });
  assert.equal(typeof reviewedEntry, "string", "fixture sanity: the module must compute an entry for the reviewed finding");

  const ignoreFilePath = join(rootDir, ".gitleaksignore");
  writeFileSync(ignoreFilePath, [COMMENT_LINE, UNRELATED_ENTRY, reviewedEntry, ""].join("\n"));

  const liveFinding = {
    File: join(rootDir, REL_PATH), RuleID: RULE, StartLine: NEW_LINE, StartColumn: COLUMN, Secret: liveSecret, Description: "fixture finding",
  };
  const binaryPath = join(rootDir, "unused-fake-gitleaks");
  const calls = [];
  const spawnFn = (cmd, args) => {
    calls.push({ cmd, args });
    writeFileSync(args[args.indexOf("--report-path") + 1], JSON.stringify([liveFinding]));
    return { status: 0, stdout: "", stderr: "", error: null };
  };
  return { rootDir, ignoreFilePath, reviewedEntry, binaryPath, spawnFn, calls };
}

function repair(fixture) {
  return repairStaleIgnoreEntry({
    rootDir: fixture.rootDir,
    path: REL_PATH,
    rule: RULE,
    column: COLUMN,
    oldLine: OLD_LINE,
    spawnFn: fixture.spawnFn,
    binaryPath: fixture.binaryPath,
  });
}

async function scan(fixture) {
  return run({ rootDir: fixture.rootDir, config: { binaryPath: fixture.binaryPath }, spawnFn: fixture.spawnFn, timeoutMs: 5000 });
}

/** Fixture sanity: the stale entry must not already suppress the moved finding (it is inert). */
async function assertStaleEntryIsInert(fixture) {
  const before = await scan(fixture);
  assert.equal(before.status, "FINDINGS", "fixture sanity: the stale entry must not already suppress the moved finding");
  fixture.calls.length = 0; // the repair under test is the only scan the assertions count
}

test("(a) control: the live finding carries the SAME value at the new line -> repair succeeds and re-binds exactly one line to the new line", async () => {
  const fixture = makeFixture({ liveSecret: REVIEWED_VALUE });
  try {
    await assertStaleEntryIsInert(fixture);
    const beforeLines = readFileSync(fixture.ignoreFilePath, "utf8").split("\n");

    const result = await repair(fixture);
    assert.equal(result.ok, true, `expected repair to succeed for the reviewed value: ${result.reason ?? ""}`);
    assert.equal(result.oldLine, OLD_LINE);
    assert.equal(result.newLine, NEW_LINE);

    const expectedEntry = gitleaksContentAuthorityLine({
      File: REL_PATH, RuleID: RULE, StartLine: NEW_LINE, StartColumn: COLUMN, Secret: REVIEWED_VALUE,
    });
    assert.equal(result.newEntry, expectedEntry, "the new entry must be the module's own entry for the reviewed value at the new line");

    const afterLines = readFileSync(fixture.ignoreFilePath, "utf8").split("\n");
    assert.equal(afterLines.length, beforeLines.length, "the repair must not add or drop lines");
    const changedIndexes = afterLines.flatMap((line, index) => (line === beforeLines[index] ? [] : [index]));
    assert.deepEqual(changedIndexes, [beforeLines.indexOf(fixture.reviewedEntry)], "exactly one line (the stale entry) must change");
    assert.equal(afterLines[changedIndexes[0]], expectedEntry, "the changed line must be the entry re-bound to the new line");
    assert.equal(afterLines.includes(UNRELATED_ENTRY), true, "the unrelated entry must be left untouched");
    assert.equal(afterLines.includes(COMMENT_LINE), true, "the comment line must be left untouched");
  } finally {
    rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("(b1) defect: the live finding carries a DIFFERENT value at the new line -> repair refuses with a reason", async () => {
  const fixture = makeFixture({ liveSecret: REPLACED_VALUE });
  try {
    await assertStaleEntryIsInert(fixture);
    const result = await repair(fixture);
    assert.equal(result.ok, false, "a different value at the same path/rule/column must NOT be re-bound: nobody reviewed it");
    assert.equal(typeof result.reason, "string", "a refusal must carry a reason");
    assert.ok(result.reason.length > 0, "a refusal must carry a non-empty reason");
    // The Proposal requires a TYPED reason: pin the exact prefix so a refusal for any other cause (or an untyped one) cannot satisfy this case.
    assert.ok(
      result.reason.startsWith("value-binding-mismatch:"),
      `the refusal reason must start with the typed prefix "value-binding-mismatch:", got: ${result.reason}`,
    );
    assert.equal(fixture.calls.length, 1, "the refusal must come from the live scan result, i.e. after exactly one scan -- not from an earlier precondition");
  } finally {
    rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("(b2) defect: after the refusal the ignore file is byte-identical to before", async () => {
  const fixture = makeFixture({ liveSecret: REPLACED_VALUE });
  try {
    await assertStaleEntryIsInert(fixture);
    const before = readFileSync(fixture.ignoreFilePath);
    await repair(fixture);
    const after = readFileSync(fixture.ignoreFilePath);
    assert.equal(after.equals(before), true, "the ignore file must not be modified when the live value differs from the reviewed one");
  } finally {
    rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("(b3) defect: after the refusal the different value is still reported by the scan (never suppressed)", async () => {
  const fixture = makeFixture({ liveSecret: REPLACED_VALUE });
  try {
    await assertStaleEntryIsInert(fixture);
    await repair(fixture);
    const after = await scan(fixture);
    assert.equal(after.status, "FINDINGS", `the unreviewed value must still be a finding, got ${after.status} (ignored: ${after.ignored?.findingCount})`);
    assert.equal(after.ignored.findingCount, 0, "no finding may be suppressed by an entry nobody reviewed");
  } finally {
    rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("(c) no partial write: the refused repair leaves no temp or backup file next to the ignore file", async () => {
  const fixture = makeFixture({ liveSecret: REPLACED_VALUE });
  try {
    await assertStaleEntryIsInert(fixture);
    const directory = dirname(fixture.ignoreFilePath);
    const listingBefore = readdirSync(directory).sort();
    await repair(fixture);
    const listingAfter = readdirSync(directory).sort();
    // Independent of whether the repair refuses: this pins the no-sibling-file invariant on its own,
    // so a fix that writes via a temp file + rename cannot leave the temp file behind on refusal.
    assert.deepEqual(listingAfter, listingBefore, "the directory holding the ignore file must contain exactly the same entries after the repair attempt");
  } finally {
    rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});
