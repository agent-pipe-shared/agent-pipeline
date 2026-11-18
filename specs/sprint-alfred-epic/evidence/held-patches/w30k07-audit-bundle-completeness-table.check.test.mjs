// SPDX-License-Identifier: SUL-1.0
// C30K-K7 (AC-112 binding, see the notes file): the held patch carries exactly one analysis document and nothing else.
// Plain node:test, no producer or product run, and no `git apply` against the repository: the patch is a delta on the integrated
// 30j tree (the clone int30j), so it applies only after that chain (the order is stated in the notes file).
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patchPath = join(here, "w30k07-audit-bundle-completeness-table.patch");
const ALLOWED = ["specs/sprint-alfred-epic/plans/audit-bundle-completeness-table-2026-11-18.md"];

test("the held patch exists and is non-empty", () => {
  assert.ok(existsSync(patchPath), "the patch file is missing");
  assert.ok(statSync(patchPath).isFile(), "the patch is not a regular file");
  assert.ok(statSync(patchPath).size > 0, "the patch is empty");
});

test("the held patch touches only the one analysis document", () => {
  const text = readFileSync(patchPath, "utf8");
  const touched = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(touched.length > 0, "the patch names no file");
  assert.deepEqual([...new Set(touched)].sort(), ALLOWED);
});

test("the document the patch adds carries the four closing sections in order and the analysis-only statement", () => {
  const text = readFileSync(patchPath, "utf8");
  const added = text.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++")).map((line) => line.slice(1)).join("\n");
  assert.match(added, /analysis only, no test run/u);
  const headings = ["## Recommendation", "## What stays unchanged (DO-NOT-DO)", "## Staged plan", "## Open decisions for the PO"].map((heading) => added.indexOf(heading));
  assert.ok(headings.every((index) => index >= 0), `a closing section is missing: ${headings.join(",")}`);
  assert.deepEqual([...headings].sort((a, b) => a - b), headings, "the closing sections are out of order");
  assert.ok(added.split("\n").length <= 420, "the document is longer than about 400 lines");
});
