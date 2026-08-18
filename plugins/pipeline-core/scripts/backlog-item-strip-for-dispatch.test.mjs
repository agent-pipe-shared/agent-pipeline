#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { after, test } from "node:test";

import { run } from "./backlog-item-strip-for-dispatch.mjs";

const ITEM = "---\nschema: pipeline.backlog-item.v1\nid: pipeline.example\ntype: defect\nowner: pipeline\nstatus: open\ncreated: 2026-08-18\nsource: test\n---\n\n## Description\n\nD.\n\n## Triage\n\n- **Decision:** accepted\n- **Rationale:** a prior Critic verdict lives here.\n";

function fixtureDir() {
  const dir = mkdtempSync(join(tmpdir(), "backlog-item-strip-"));
  after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("run() strips Triage prose from a backlog item file and writes it to --out", () => {
  const dir = fixtureDir();
  const itemPath = join(dir, "item.md");
  const outPath = join(dir, "stripped.md");
  writeFileSync(itemPath, ITEM);
  const result = run(["--item", itemPath, "--out", outPath]);
  assert.equal(result.wasStripped, true);
  assert.equal(result.removedHeading, "triage");
  const written = readFileSync(outPath, "utf8");
  assert.ok(written.includes("## Description"));
  assert.ok(!written.includes("prior Critic verdict"));
});

test("run() requires --item", () => {
  assert.throws(() => run([]), /--item <path> is required/);
});

test("run() rejects an unknown flag", () => {
  assert.throws(() => run(["--bogus", "x"]), /Unknown argument: --bogus/);
});
