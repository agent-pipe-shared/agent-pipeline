#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runTmpLeakGuard, snapshotCount } from "./tmp-leak-guard.mjs";

// Self-contained: every fixture root here is created under `node:os` tmpdir() with a unique
// prefix owned only by this test, never the repo's own `/tmp` prefixes, and removed in an
// `after` hook regardless of test outcome -- the test proves leak DETECTION without adding to
// the real leak (briefing stop condition on state-changing tests).
let fixtureRoot;

test.beforeEach(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), "tmp-leak-guard-test-"));
});

test.afterEach(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

test("reports zero delta when the wrapped command creates nothing", () => {
  const receipt = runTmpLeakGuard({
    root: fixtureRoot,
    command: process.execPath,
    args: ["-e", "process.exit(0)"],
  });
  assert.equal(receipt.beforeCount, 0);
  assert.equal(receipt.afterCount, 0);
  assert.equal(receipt.delta, 0);
  assert.equal(receipt.leakDetected, false);
  assert.equal(receipt.commandExitCode, 0);
});

test("detects a positive delta when the wrapped command leaks N directories", () => {
  const leakCount = 4;
  // The wrapped "command" is a real child process (node -e) that deliberately creates and
  // leaves behind N directories inside the fixture root -- exercising the guard's actual
  // spawn + snapshot path, not merely its accounting math.
  const script = `
    const fs = require("fs");
    const path = require("path");
    for (let i = 0; i < ${leakCount}; i++) {
      fs.mkdirSync(path.join(${JSON.stringify(fixtureRoot)}, "leaked-fixture-dir-" + i));
    }
  `;
  const receipt = runTmpLeakGuard({
    root: fixtureRoot,
    command: process.execPath,
    args: ["-e", script],
  });

  assert.equal(receipt.beforeCount, 0);
  assert.equal(receipt.afterCount, leakCount);
  assert.equal(receipt.delta, leakCount);
  assert.equal(receipt.leakDetected, true);
  assert.equal(receipt.commandExitCode, 0);

  // Confirm the fixture root really does contain what the guard reported (behavioral check,
  // not merely trusting the guard's own count).
  assert.equal(readdirSync(fixtureRoot).length, leakCount);
});

test("a wrapped command's own non-zero exit code is preserved even with no leak", () => {
  const receipt = runTmpLeakGuard({
    root: fixtureRoot,
    command: process.execPath,
    args: ["-e", "process.exit(7)"],
  });
  assert.equal(receipt.delta, 0);
  assert.equal(receipt.leakDetected, false);
  assert.equal(receipt.commandExitCode, 7);
});

test("snapshotCount returns 0 for an unreadable/absent root", () => {
  assert.equal(snapshotCount(join(fixtureRoot, "does-not-exist")), 0);
});

test("runTmpLeakGuard requires a non-empty command string", () => {
  assert.throws(() => runTmpLeakGuard({ root: fixtureRoot, command: "" }));
  assert.throws(() => runTmpLeakGuard({ root: fixtureRoot }));
});
