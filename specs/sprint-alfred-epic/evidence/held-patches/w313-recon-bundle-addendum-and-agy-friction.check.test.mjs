// SPDX-License-Identifier: SUL-1.0
// Check for the held patch w313 (C31-R3): recon note L6 + L14 to L17. Analysis only, no producer or product run.
// The patch is a delta on the base clone of candidate 31, so it is NOT applied to the repository here: the test only
// asserts that the patch exists, is non-empty and touches exactly the one note file of its write list.
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PATCH = join(HERE, "w313-recon-bundle-addendum-and-agy-friction.patch");
const NOTE = "specs/sprint-alfred-epic/plans/recon-l6-l14-l17-bundle-addendum-and-agy-friction-2026-11-18.md";

test("w313: the patch exists and is non-empty", () => {
  assert.ok(statSync(PATCH).size > 0, "the patch file is empty");
});

test("w313: the patch touches only the recon note", () => {
  const text = readFileSync(PATCH, "utf8");
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(files.length > 0, "the patch names no file");
  assert.deepEqual([...new Set(files)], [NOTE]);
});
