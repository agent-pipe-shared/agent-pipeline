// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { main, readRunnerCapabilities, selectRunner } from "./runner-capabilities.mjs";

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), "..");
const GUIDE = join(PLUGIN, "skills", "pipeline-start", "references", "happy-path.md");

const capture = () => { const lines = []; return { lines, out: { write: (text) => { lines.push(text); } } }; };

test("the table has the three runners, every row has a cell per runner and an owner", () => {
  const table = readRunnerCapabilities();
  assert.deepEqual(table.runners, ["claude", "codex", "antigravity"]);
  assert.ok(table.rows.length >= 8);
  for (const row of table.rows) {
    for (const key of ["topic", "claude", "codex", "antigravity", "owner"]) assert.equal(typeof row[key], "string", `${row.topic}: ${key}`);
    assert.ok(row.owner.length > 0);
  }
  assert.equal(new Set(table.rows.map((row) => row.topic)).size, table.rows.length, "topics are unique");
});

test("the happy-path guide table is the projection of the JSON source, row for row", () => {
  const table = readRunnerCapabilities();
  const guide = readFileSync(GUIDE, "utf8");
  const rows = guide.split("\n").filter((line) => line.startsWith("| ") && !line.startsWith("| Topic") && !line.startsWith("| ---"))
    .map((line) => line.slice(2, -2).split(" | "));
  assert.equal(rows.length, table.rows.length);
  rows.forEach((cells, index) => {
    const row = table.rows[index];
    assert.deepEqual(cells, [row.topic, row.claude, row.codex, row.antigravity], `row ${index + 1} (${row.topic}) drifted from the JSON source`);
  });
});

test("an owner that names a file in this plugin names one that ships", () => {
  for (const row of readRunnerCapabilities().rows) {
    for (const owner of row.owner.split(";").map((part) => part.trim())) {
      if (owner.startsWith("docs/")) continue; // repository documentation, vendored separately
      const relative = owner.replace(/^references\//u, "skills/pipeline-start/references/");
      assert.ok(existsSync(join(PLUGIN, relative)), `${row.topic}: owner ${owner} does not ship`);
    }
  }
});

test("the CLI prints the table, one runner's column, and refuses anything else", () => {
  const all = capture();
  assert.equal(main([], all.out), 0);
  assert.equal(JSON.parse(all.lines.join("")).schema, "pipeline.runner-capabilities.v1");
  const one = capture();
  assert.equal(main(["--runner", "antigravity"], one.out), 0);
  const column = JSON.parse(one.lines.join(""));
  assert.equal(column.runner, "antigravity");
  assert.equal(column.rows.find((row) => row.topic === "Close entry").value, "`finish-feature.mjs` single entry");
  const bad = capture();
  assert.equal(main(["--runner", "gemini"], bad.out), 2);
  assert.equal(JSON.parse(bad.lines.join("")).ok, false);
  const usage = capture();
  assert.equal(main(["--all"], usage.out), 2);
  assert.equal(JSON.parse(usage.lines.join("")).code, "RC-USAGE");
  assert.throws(() => selectRunner(readRunnerCapabilities(), "gemini"), /RC-RUNNER/u);
});
