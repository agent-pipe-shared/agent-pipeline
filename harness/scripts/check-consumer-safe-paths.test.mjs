#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { ALLOWLIST, checkRepository, checkText, SOURCE_ONLY_PREFIXES } from "./check-consumer-safe-paths.mjs";

const REPO = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const FIXTURE_ROOT = join(REPO, "scratch", "check-consumer-safe-paths-fixture");

function writeFixture(name, text) {
  writeFileSync(join(FIXTURE_ROOT, name), text, "utf8");
}

test.before(() => {
  mkdirSync(FIXTURE_ROOT, { recursive: true });
  writeFixture(
    "bad.md",
    "# Bad skill\n\nRun `node harness/scripts/example.mjs --now` before continuing.\n",
  );
  writeFixture(
    "clean.md",
    "# Clean skill\n\nRun `node plugins/pipeline-core/scripts/example.mjs --now` before continuing.\n",
  );
  writeFixture(
    "allowlisted.md",
    "# Allowlisted skill\n\nRun `node harness/scripts/example.mjs --now` before continuing.\n",
  );
});

test.after(() => {
  rmSync(FIXTURE_ROOT, { recursive: true, force: true });
});

test("a fixture naming a source-only path fails", () => {
  const { findings } = checkRepository(FIXTURE_ROOT, {
    markdownPaths: ["bad.md"],
    allowlist: [],
  });
  assert.equal(findings.length, 1);
  assert.match(findings[0], /^bad\.md:3: names source-only path prefix "harness\/"/u);
});

test("a clean fixture passes", () => {
  const { findings, stats } = checkRepository(FIXTURE_ROOT, {
    markdownPaths: ["clean.md"],
    allowlist: [],
  });
  assert.deepEqual(findings, []);
  assert.equal(stats.filesScanned, 1);
});

test("an allowlisted occurrence passes", () => {
  const { findings } = checkRepository(FIXTURE_ROOT, {
    markdownPaths: ["allowlisted.md"],
    allowlist: [{ file: "allowlisted.md", match: "harness/scripts/example.mjs", reason: "test fixture" }],
  });
  assert.deepEqual(findings, []);
});

test("a stale allowlist entry (never matches) is itself reported", () => {
  const { findings } = checkRepository(FIXTURE_ROOT, {
    markdownPaths: ["clean.md"],
    allowlist: [{ file: "clean.md", match: "harness/scripts/nothing-here.mjs", reason: "test fixture" }],
  });
  assert.equal(findings.length, 1);
  assert.match(findings[0], /never matched a line/u);
});

test("multiple prefix hits on one line each produce a finding", () => {
  const used = new Set();
  const findings = checkText(
    "multi.md",
    "See harness/scripts/a.mjs and specs/sprint-nova-epic/b.md and setup.mjs.\n",
    [],
    used,
  );
  assert.equal(findings.length, 3);
});

test("SOURCE_ONLY_PREFIXES carries the backlog item's minimum set", () => {
  for (const prefix of ["harness/", "specs/sprint-nova-epic/", "setup.mjs"]) {
    assert.ok(SOURCE_ONLY_PREFIXES.includes(prefix), `missing prefix ${prefix}`);
  }
});

test("every ALLOWLIST entry carries a non-empty stated reason", () => {
  for (const entry of ALLOWLIST) {
    assert.equal(typeof entry.file, "string");
    assert.ok(entry.file.startsWith("plugins/pipeline-core/"));
    assert.equal(typeof entry.match, "string");
    assert.ok(entry.match.length > 0);
    assert.equal(typeof entry.reason, "string");
    assert.ok(entry.reason.length >= 20, `reason for ${entry.file} too short to be a real justification`);
  }
});

test("current repository passes with the real ALLOWLIST (AC-11)", () => {
  const { findings } = checkRepository(REPO);
  assert.deepEqual(findings, [], JSON.stringify(findings, null, 2));
});

test("real allowlisted files still exist and still contain the allowlisted substring", () => {
  for (const entry of ALLOWLIST) {
    const text = readFileSync(resolve(REPO, entry.file), "utf8");
    assert.ok(text.includes(entry.match), `${entry.file} no longer contains "${entry.match}"`);
  }
});

process.stdout.write("check-consumer-safe-paths: fixture and repository checks passed\n");
