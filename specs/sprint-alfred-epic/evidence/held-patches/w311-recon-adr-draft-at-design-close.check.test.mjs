// SPDX-License-Identifier: SUL-1.0
// C31-R1 check: the held patch of the lane-L4 recon note exists, is not empty and touches only the one note.
// Plain node:test. It does not run git apply: the patch is a delta on the base clone of candidate 31 (apply that first).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const PATCH = join(here, "w311-recon-adr-draft-at-design-close.patch");
const ALLOWED = ["specs/sprint-alfred-epic/plans/recon-l4-adr-draft-2026-11-18.md"];

test("the recon note patch exists and is not empty", { timeout: 60000 }, () => {
  const info = statSync(PATCH);
  assert.ok(info.isFile());
  assert.ok(info.size > 0);
});

test("the recon note patch touches only the one note", { timeout: 60000 }, () => {
  const text = readFileSync(PATCH, "utf8");
  const touched = new Set();
  for (const line of text.split("\n")) {
    const match = /^diff --git a\/(\S+) b\/(\S+)$/u.exec(line);
    if (match) { touched.add(match[1]); touched.add(match[2]); }
  }
  assert.ok(touched.size > 0, "the patch names no file");
  assert.deepEqual([...touched].sort(), [...ALLOWED].sort());
});
