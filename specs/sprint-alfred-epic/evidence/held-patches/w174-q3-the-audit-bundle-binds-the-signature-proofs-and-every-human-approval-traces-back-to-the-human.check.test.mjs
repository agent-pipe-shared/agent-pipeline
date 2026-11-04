// SPDX-License-Identifier: SUL-1.0
/**
 * Delivery check for held patch w174 (Q3, AC-108): the patch exists, is non-empty and touches only the files the
 * slice may touch. It does not run `git apply` against the repository: the patch is a delta on top of w190, and the
 * notes file states the required order.
 */
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patchPath = join(here, "w174-q3-the-audit-bundle-binds-the-signature-proofs-and-every-human-approval-traces-back-to-the-human.patch");
const ALLOWED_PREFIXES = ["plugins/pipeline-core/scripts/", "plugins/pipeline-core/lib/", "docs/"];
const ALLOWED_FILES = new Set(["plugins/pipeline-core/lib/guard/command-catalogue.mjs", "docs/guard-maintenance-window-threat-model.md", "harness/verify-suites.json", "docs/product-capability-inventory.json"]);

function touchedPaths() {
  const text = readFileSync(patchPath, "utf8");
  const paths = new Set();
  for (const match of text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)) { paths.add(match[1]); paths.add(match[2]); }
  return [...paths].sort();
}

test("the w174 patch exists and is not empty", () => {
  assert.ok(statSync(patchPath).isFile());
  assert.ok(statSync(patchPath).size > 0);
});

test("the w174 patch touches only the audit, trace and registration files it may touch", () => {
  const paths = touchedPaths();
  assert.ok(paths.length > 0, "the patch names no file");
  const outside = paths.filter((path) => !ALLOWED_FILES.has(path) && !ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix)));
  assert.deepEqual(outside, []);
  assert.ok(paths.includes("plugins/pipeline-core/lib/human-approval-trace.mjs"), "the trace library is part of the patch");
});
