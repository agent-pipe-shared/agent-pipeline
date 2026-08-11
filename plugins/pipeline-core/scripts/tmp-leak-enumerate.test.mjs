#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { enumerateTmpDirectories, prefixOf } from "./tmp-leak-enumerate.mjs";

let fixtureRoot;

test.beforeEach(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), "tmp-leak-enumerate-test-"));
});

test.afterEach(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

test("prefixOf strips a trailing -<alnum> random suffix", () => {
  assert.equal(prefixOf("actions-permissions-x7k2p9"), "actions-permissions");
  assert.equal(prefixOf("sbom-abc123"), "sbom");
  assert.equal(prefixOf("no-suffix-here"), "no-suffix-here".replace(/-[A-Za-z0-9]+$/, ""));
});

test("groups fixture entries by prefix with counts, sorted descending", () => {
  mkdirSync(join(fixtureRoot, "actions-permissions-aaa1"));
  mkdirSync(join(fixtureRoot, "actions-permissions-bbb2"));
  mkdirSync(join(fixtureRoot, "actions-permissions-ccc3"));
  mkdirSync(join(fixtureRoot, "sbom-xyz9"));
  writeFileSync(join(fixtureRoot, "sbom-abc1"), "not a dir but still an entry");

  const report = enumerateTmpDirectories(fixtureRoot);
  assert.equal(report.totalEntries, 5);
  assert.deepEqual(report.groups, [
    { prefix: "actions-permissions", count: 3 },
    { prefix: "sbom", count: 2 },
  ]);
  assert.equal(report.reason, null);
});

test("an unreadable root yields an empty group list plus a reason, never throws", () => {
  const report = enumerateTmpDirectories(join(fixtureRoot, "does-not-exist"));
  assert.equal(report.totalEntries, 0);
  assert.deepEqual(report.groups, []);
  assert.ok(report.reason);
});
