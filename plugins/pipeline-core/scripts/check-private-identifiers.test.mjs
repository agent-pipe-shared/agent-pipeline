#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { derivePatterns, inspectAddedLines, scanChangedContent } from "./check-private-identifiers.mjs";

function repo() {
  const root = mkdtempSync(join(tmpdir(), "privacy-gate-fixture-"));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
  git("init", "--quiet");
  git("config", "user.name", "Fixture Operator");
  git("config", "user.email", "fixture.operator@example.invalid");
  return { root, git };
}

const synthetic = () => derivePatterns({
  home: "/home/fixture_operator", username: "fixture_operator",
  userProfile: "C:\\Users\\fixture_operator", email: "fixture.operator@example.invalid",
});

test("recognizes native, JSON-escaped and URI-encoded paths without returning values", () => {
  const patterns = synthetic();
  const lines = [
    "+/home/fixture_operator/work/item",
    "+C:\\\\Users\\\\fixture_operator\\\\work",
    "+C%3A%2FUsers%2Ffixture_operator%2Fwork",
    "+fixture.operator@example.invalid",
  ];
  const counts = inspectAddedLines(`+++ b/file\n${lines.join("\n")}`, patterns);
  assert.equal(counts.get("home-path"), 3);
  assert.equal(counts.get("email"), 1);
  assert.ok(!JSON.stringify([...counts]).includes("fixture_operator"));
});

test("rejects similarly prefixed but distinct home paths and ordinary username prose", () => {
  const counts = inspectAddedLines(
    "+/home/fixture_operator2/work\n+fixture_operator authored this document\n+C:/Users/fixture_operator2/work",
    synthetic(),
  );
  assert.equal(counts.size, 0);
});

test("one added line records every matched category once", () => {
  const counts = inspectAddedLines(
    "+/home/fixture_operator/work fixture.operator@example.invalid",
    synthetic(),
  );
  assert.equal(counts.get("home-path"), 1);
  assert.equal(counts.get("email"), 1);
});

test("scans staged additions and unstaged tracked changes, but not historical content", () => {
  const { root, git } = repo();
  try {
    writeFileSync(join(root, "old.txt"), "/home/fixture_operator/legacy\n");
    git("add", "old.txt");
    git("commit", "--quiet", "-m", "fixture");
    writeFileSync(join(root, "old.txt"), "/home/fixture_operator/legacy\nplain edit\n");
    assert.equal(scanChangedContent(root, { patterns: synthetic() }).ok, true);

    writeFileSync(join(root, "fresh.txt"), "safe\nC:/Users/fixture_operator/work\n");
    git("add", "fresh.txt");
    writeFileSync(join(root, "old.txt"), "/home/fixture_operator/legacy\nnew line fixture.operator@example.invalid\n");
    const result = scanChangedContent(root, { patterns: synthetic() });
    assert.equal(result.ok, false);
    assert.deepEqual(result.findings.map(({ scope, category, path }) => ({ scope, category, path })), [
      { scope: "staged", category: "home-path", path: "fresh.txt" },
      { scope: "worktree", category: "email", path: "old.txt" },
    ]);
    assert.ok(!JSON.stringify(result).includes("fixture_operator"));
    assert.ok(!JSON.stringify(result).includes("fixture.operator"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("scrubs a sensitive changed file name from diagnostics", () => {
  const { root, git } = repo();
  try {
    writeFileSync(join(root, "old.txt"), "safe\n");
    git("add", "old.txt");
    git("commit", "--quiet", "-m", "fixture");
    const name = "fixture.operator@example.invalid.txt";
    writeFileSync(join(root, name), "safe\n");
    git("add", name);
    const result = scanChangedContent(root, { patterns: synthetic() });
    assert.equal(result.ok, false);
    assert.ok(result.findings.some(({ category, path }) => category === "email" && path.includes("<private>")));
    assert.ok(!JSON.stringify(result).includes("fixture.operator"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("local pattern input is rejected while tracked or visible to Git", () => {
  const { root, git } = repo();
  try {
    const patternName = "private-patterns.json";
    writeFileSync(join(root, patternName), JSON.stringify([{ category: "local-pattern", value: "SYNTHETIC-PRIVATE-MARKER" }]));
    assert.throws(() => scanChangedContent(root, { patternsFile: join(root, patternName) }), /must be ignored/u);
    git("add", patternName);
    assert.throws(() => scanChangedContent(root, { patternsFile: join(root, patternName) }), /is tracked/u);
    git("reset", "--quiet", "--", patternName);
    writeFileSync(join(root, ".gitignore"), `${patternName}\n`);
    writeFileSync(join(root, "note.txt"), "SYNTHETIC-PRIVATE-MARKER\n");
    git("add", "note.txt");
    const result = scanChangedContent(root, { patternsFile: join(root, patternName) });
    assert.equal(result.ok, false);
    assert.equal(result.findings[0].category, "local-pattern");
    assert.ok(!JSON.stringify(result).includes("SYNTHETIC-PRIVATE-MARKER"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
