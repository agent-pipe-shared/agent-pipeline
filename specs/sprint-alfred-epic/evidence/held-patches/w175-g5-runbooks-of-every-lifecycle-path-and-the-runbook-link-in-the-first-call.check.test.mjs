// SPDX-License-Identifier: SUL-1.0
// Check for the held patch w175 (C19-G5 rest, AC-108): the patch exists, is non-empty and touches only the files the dispatch may change.
// It does not run git apply against the repository: the patch is a delta on the held patch w190 (see the notes file for the order).
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PATCH = join(HERE, "w175-g5-runbooks-of-every-lifecycle-path-and-the-runbook-link-in-the-first-call.patch");

const ALLOWED_PREFIXES = [
  "plugins/pipeline-core/scripts/",
  "plugins/pipeline-core/lib/",
  "plugins/pipeline-core/runbooks/",
  "plugins/pipeline-core/skills/pipeline-start/references/",
];
const ALLOWED_FILES = new Set([
  "docs/push-release-flow.md",
  "docs/guard-maintenance-window-threat-model.md",
  "harness/verify-suites.json",
  "docs/product-capability-inventory.json",
]);

test("the patch exists and is non-empty", () => {
  assert.ok(statSync(PATCH).isFile());
  assert.ok(statSync(PATCH).size > 0);
});

test("the patch touches only the allowed files", () => {
  const text = readFileSync(PATCH, "utf8");
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0, "the patch names files");
  for (const file of files) {
    const allowed = ALLOWED_FILES.has(file) || ALLOWED_PREFIXES.some((prefix) => file.startsWith(prefix));
    assert.ok(allowed, `outside the allowed files: ${file}`);
  }
});
