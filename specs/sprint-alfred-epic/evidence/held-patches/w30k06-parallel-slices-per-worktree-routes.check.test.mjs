// SPDX-License-Identifier: SUL-1.0
// C30K-K6 check: the held patch exists, is not empty and touches only the one analysis document. No producer or product run.
// The patch is a delta on the integrated 30j tree (the clone int30j), which is not applied to the repository yet, so this check never
// runs `git apply` against the repository root: the notes name the required order (apply that tree first, then this patch).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const PATCH = join(import.meta.dirname, "w30k06-parallel-slices-per-worktree-routes.patch");
const ALLOWED = new Set([
  "specs/sprint-alfred-epic/plans/parallel-slices-per-worktree-routes-2026-11-18.md",
]);

test("the patch exists and is not empty", () => {
  assert.ok(statSync(PATCH).isFile());
  assert.ok(statSync(PATCH).size > 0);
});

test("the patch touches only the briefed file", () => {
  const touched = [...readFileSync(PATCH, "utf8").matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(touched.length > 0, "the patch names at least one file");
  for (const path of touched) assert.ok(ALLOWED.has(path), `${path} is outside the briefed file`);
});
