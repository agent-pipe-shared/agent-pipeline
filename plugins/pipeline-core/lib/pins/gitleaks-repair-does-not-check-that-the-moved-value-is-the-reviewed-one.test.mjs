#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Regression pin for backlog item
 * pipeline.gitleaks-repair-does-not-check-that-the-moved-value-is-the-reviewed-one (AC-183).
 *
 * repairStaleIgnoreEntry() may re-bind a stale content-v1 entry to a moved line only when the live
 * finding carries the SAME value the entry was computed for. Each case drives the real module with
 * the module's documented spawnFn/binaryPath seams (synthetic gitleaks JSON, no real binary) and
 * fixtures under the repository scratch/ directory (not the OS temp dir). All secrets are fake.
 *
 * Run:  node --test plugins/pipeline-core/lib/pins/gitleaks-repair-does-not-check-that-the-moved-value-is-the-reviewed-one.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gitleaksContentAuthorityLine, run } from "../../scripts/security-adapters/gitleaks.mjs";
import { recomputeStaleIgnoreEntry, repairStaleIgnoreEntry } from "../../scripts/gitleaks-repair-ignore.mjs";

const SCRATCH_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "scratch");
const REL_PATH = "backlog/fixture-pin.txt";
const RULE = "fixture-rule";
const COLUMN = 7;
const OLD_LINE = 3;
const NEW_LINE = 48;
const REVIEWED = "fixture-secret-value-reviewed";
const REPLACED = "fixture-secret-value-replaced";
const UNRELATED = "content-v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:backlog/other.txt:fixture-rule:1:1";

function makeFixture({ liveSecret, extraLive = [] }) {
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  const rootDir = mkdtempSync(join(SCRATCH_ROOT, "gl-valbind-pin-"));
  mkdirSync(join(rootDir, "backlog"), { recursive: true });
  writeFileSync(join(rootDir, REL_PATH), "fixture content\n");
  const reviewedEntry = gitleaksContentAuthorityLine({ File: REL_PATH, RuleID: RULE, StartLine: OLD_LINE, StartColumn: COLUMN, Secret: REVIEWED });
  assert.equal(typeof reviewedEntry, "string");
  const ignoreFilePath = join(rootDir, ".gitleaksignore");
  writeFileSync(ignoreFilePath, ["# synthetic", UNRELATED, reviewedEntry, ""].join("\n"));
  const live = [{ File: join(rootDir, REL_PATH), RuleID: RULE, StartLine: NEW_LINE, StartColumn: COLUMN, Secret: liveSecret, Description: "fixture" }, ...extraLive];
  const binaryPath = join(rootDir, "unused-fake-gitleaks");
  const spawnFn = (_cmd, args) => {
    writeFileSync(args[args.indexOf("--report-path") + 1], JSON.stringify(live));
    return { status: 0, stdout: "", stderr: "", error: null };
  };
  return { rootDir, ignoreFilePath, reviewedEntry, binaryPath, spawnFn };
}

const opts = (f) => ({ rootDir: f.rootDir, path: REL_PATH, rule: RULE, column: COLUMN, oldLine: OLD_LINE, spawnFn: f.spawnFn, binaryPath: f.binaryPath });
const cleanup = (f) => rmSync(f.rootDir, { recursive: true, force: true });

test("point 1 control: same reviewed value at a moved line is re-bound, exactly one line changes", async () => {
  const f = makeFixture({ liveSecret: REVIEWED });
  try {
    const before = readFileSync(f.ignoreFilePath, "utf8").split("\n");
    const r = await repairStaleIgnoreEntry(opts(f));
    assert.equal(r.ok, true, r.reason);
    assert.equal(r.newLine, NEW_LINE);
    const expected = gitleaksContentAuthorityLine({ File: REL_PATH, RuleID: RULE, StartLine: NEW_LINE, StartColumn: COLUMN, Secret: REVIEWED });
    assert.equal(r.newEntry, expected);
    const after = readFileSync(f.ignoreFilePath, "utf8").split("\n");
    assert.equal(after.length, before.length);
    const changed = after.flatMap((l, i) => (l === before[i] ? [] : [i]));
    assert.deepEqual(changed, [before.indexOf(f.reviewedEntry)]);
  } finally { cleanup(f); }
});

test("point 2: a different value at the same path/rule/column refuses with the typed value-binding-mismatch reason", async () => {
  const f = makeFixture({ liveSecret: REPLACED });
  try {
    const r = await repairStaleIgnoreEntry(opts(f));
    assert.equal(r.ok, false);
    assert.ok(typeof r.reason === "string" && r.reason.startsWith("value-binding-mismatch:"), String(r.reason));
  } finally { cleanup(f); }
});

test("point 3: the refusal leaves the ignore file byte-identical and no sibling temp/backup file", async () => {
  const f = makeFixture({ liveSecret: REPLACED });
  try {
    const before = readFileSync(f.ignoreFilePath);
    const listing = readdirSync(f.rootDir).sort();
    await repairStaleIgnoreEntry(opts(f));
    assert.equal(readFileSync(f.ignoreFilePath).equals(before), true);
    assert.deepEqual(readdirSync(f.rootDir).sort(), listing);
  } finally { cleanup(f); }
});

test("point 4: after the refusal the unreviewed value is still a scan finding (never suppressed)", async () => {
  const f = makeFixture({ liveSecret: REPLACED });
  try {
    await repairStaleIgnoreEntry(opts(f));
    const scan = await run({ rootDir: f.rootDir, config: { binaryPath: f.binaryPath }, spawnFn: f.spawnFn, timeoutMs: 5000 });
    assert.equal(scan.status, "FINDINGS");
    assert.equal(scan.ignored.findingCount, 0);
  } finally { cleanup(f); }
});

test("point 5: the refusal reason never contains either secret value", async () => {
  const f = makeFixture({ liveSecret: REPLACED });
  try {
    const r = await repairStaleIgnoreEntry(opts(f));
    assert.equal(r.ok, false);
    assert.equal(r.reason.includes(REPLACED), false);
    assert.equal(r.reason.includes(REVIEWED), false);
  } finally { cleanup(f); }
});

test("point 6: the read-only recompute route applies the same value check (refuses a different value, writes nothing)", async () => {
  const f = makeFixture({ liveSecret: REPLACED });
  try {
    const before = readFileSync(f.ignoreFilePath);
    const r = await recomputeStaleIgnoreEntry(opts(f));
    assert.equal(r.ok, false);
    assert.ok(r.reason.startsWith("value-binding-mismatch:"), String(r.reason));
    assert.equal(readFileSync(f.ignoreFilePath).equals(before), true);
  } finally { cleanup(f); }
});

test("point 7: recompute of the reviewed value succeeds without mutating the file", async () => {
  const f = makeFixture({ liveSecret: REVIEWED });
  try {
    const before = readFileSync(f.ignoreFilePath);
    const r = await recomputeStaleIgnoreEntry(opts(f));
    assert.equal(r.ok, true, r.reason);
    assert.equal(r.mutated, false);
    assert.equal(readFileSync(f.ignoreFilePath).equals(before), true);
  } finally { cleanup(f); }
});

test("point 8: an ambiguous live match (two findings at path/rule/column) refuses and does not write", async () => {
  const extra = { File: REL_PATH, RuleID: RULE, StartLine: 60, StartColumn: COLUMN, Secret: REVIEWED, Description: "fixture" };
  const f = makeFixture({ liveSecret: REVIEWED, extraLive: [extra] });
  try {
    const before = readFileSync(f.ignoreFilePath);
    const r = await repairStaleIgnoreEntry(opts(f));
    assert.equal(r.ok, false);
    assert.equal(readFileSync(f.ignoreFilePath).equals(before), true);
  } finally { cleanup(f); }
});
