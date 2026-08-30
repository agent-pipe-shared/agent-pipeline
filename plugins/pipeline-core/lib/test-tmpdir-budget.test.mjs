#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { chmodSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { mkdtempTestScratch } from "./test-tmpdir.mjs";
import { TEST_TMP_MAX_BYTES, TEST_TMP_MAX_ENTRIES, measureTestTmpUsage } from "./test-tmpdir-budget.mjs";

let passed = 0;
let failed = 0;
function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
}

const suiteRoot = mkdtempTestScratch("tb-suite-root-");
function fakeRepoRoot() {
  return mkdtempTestScratch("tb-fake-root-", suiteRoot);
}

try {
// TB01: an untouched fake repo (no scratch/test-tmp/ yet) measures as empty and within budget.
{
  const root = fakeRepoRoot();
  const measured = measureTestTmpUsage(root);
  check("TB01 empty/absent scratch/test-tmp/ measures zero bytes", measured.bytes === 0, String(measured.bytes));
  check("TB01 empty/absent scratch/test-tmp/ measures zero entries", measured.entries === 0, String(measured.entries));
  check("TB01 empty/absent scratch/test-tmp/ is within budget", measured.withinBudget === true);
  check("TB01 default maxBytes/maxEntries equal the exported constants", measured.maxBytes === TEST_TMP_MAX_BYTES && measured.maxEntries === TEST_TMP_MAX_ENTRIES);
}

// TB02: exact byte/entry counting over a small known fixture tree.
{
  const root = fakeRepoRoot();
  const testTmp = join(root, "scratch", "test-tmp");
  mkdirSync(join(testTmp, "fixture-a", "nested"), { recursive: true });
  writeFileSync(join(testTmp, "fixture-a", "one.txt"), "12345"); // 5 bytes
  writeFileSync(join(testTmp, "fixture-a", "nested", "two.txt"), "1234567890"); // 10 bytes
  const measured = measureTestTmpUsage(root);
  // Entries: fixture-a (dir), one.txt, nested (dir), two.txt = 4.
  check("TB02 counts every file and directory recursively", measured.entries === 4, String(measured.entries));
  check("TB02 sums file bytes recursively", measured.bytes === 15, String(measured.bytes));
}

// TB03: an entry-count override is exceeded by a real, small fixture (no need to
// manufacture 20,001 real entries to exercise the "exceeds" branch).
{
  const root = fakeRepoRoot();
  const testTmp = join(root, "scratch", "test-tmp");
  mkdirSync(testTmp, { recursive: true });
  writeFileSync(join(testTmp, "a.txt"), "x");
  writeFileSync(join(testTmp, "b.txt"), "x");
  const measured = measureTestTmpUsage(root, { maxEntries: 1 });
  check("TB03 exceeding the entry bound flips withinBudget false", measured.withinBudget === false);
  check("TB03 exceeding the entry bound still reports the real entry count", measured.entries === 2, String(measured.entries));
}

// TB04: a byte-count override is exceeded by a real, small fixture.
{
  const root = fakeRepoRoot();
  const testTmp = join(root, "scratch", "test-tmp");
  mkdirSync(testTmp, { recursive: true });
  writeFileSync(join(testTmp, "big.txt"), "0123456789");
  const measured = measureTestTmpUsage(root, { maxBytes: 5 });
  check("TB04 exceeding the byte bound flips withinBudget false", measured.withinBudget === false);
  check("TB04 exceeding the byte bound still reports the real byte count", measured.bytes === 10, String(measured.bytes));
}

// TB05: an unreadable directory is surfaced as a finding, not a thrown exception.
{
  const root = fakeRepoRoot();
  const testTmp = join(root, "scratch", "test-tmp");
  const locked = join(testTmp, "locked");
  mkdirSync(locked, { recursive: true });
  writeFileSync(join(locked, "hidden.txt"), "x");
  chmodSync(locked, 0o000);
  let measured;
  try {
    measured = measureTestTmpUsage(root);
  } finally {
    chmodSync(locked, 0o700); // restore so cleanup at the end of this file can remove it
  }
  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
  if (isRoot) {
    check("TB05 skipped: running as root, chmod 000 does not deny root", true);
  } else {
    check("TB05 an unreadable directory is reported as a finding, not thrown", measured.findings.length > 0, measured.findings.join("; "));
    check("TB05 an unreadable directory flips withinBudget false", measured.withinBudget === false);
  }
}

// TB06: a symlink inside scratch/test-tmp/ is counted once but never followed.
{
  const root = fakeRepoRoot();
  const testTmp = join(root, "scratch", "test-tmp");
  const target = join(root, "outside-scratch-test-tmp");
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, "should-not-be-counted.txt"), "0123456789012345"); // 16 bytes
  mkdirSync(testTmp, { recursive: true });
  symlinkSync(target, join(testTmp, "link-to-outside"));
  const measured = measureTestTmpUsage(root);
  check("TB06 a symlink counts as exactly one entry", measured.entries === 1, String(measured.entries));
  check("TB06 a symlink's target is never traversed for bytes", measured.bytes === 0, String(measured.bytes));
}

// TB07: the direct-invocation CLI can target an isolated repository root, so
// this suite proves the CLI contract without inheriting historical fixtures
// from other tests sharing the checkout's real scratch/test-tmp/.
{
  const root = fakeRepoRoot();
  mkdirSync(join(root, "scratch", "test-tmp", "fixture"), { recursive: true });
  const modulePath = fileURLToPath(new URL("./test-tmpdir-budget.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [modulePath, "--base", root], { encoding: "utf8" });
  check("TB07 direct invocation exits 0 for an isolated scratch/test-tmp/", result.status === 0, `status=${result.status} stderr=${result.stderr}`);
  check("TB07 direct invocation prints an OK summary line", /test-tmp budget OK/.test(result.stdout), result.stdout);
}
} finally {
  rmSync(suiteRoot, { recursive: true, force: true });
}
console.log(`\n${passed}/${passed + failed} checks passed.`);
process.exit(failed === 0 ? 0 : 1);
