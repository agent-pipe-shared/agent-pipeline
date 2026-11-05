// SPDX-License-Identifier: SUL-1.0
// w230 (F4b, AC-108 closest accepted criterion): the held patch exists and touches only the named files.
// It does not run git apply against the repository: the patch is a delta on the held patch w225 to w228.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PATCH = join(HERE, "w230-f4b-decisions-to-record-are-asked-from-the-design-on-and-checked-report-only-at-close.patch");
const ALLOWED = [
  /^plugins\/pipeline-core\/lib\//u,
  /^plugins\/pipeline-core\/agents\//u,
  /^plugins\/pipeline-core\/scripts\//u,
  /^plugins\/pipeline-core\/runbooks\//u,
  /^plugins\/pipeline-core\/skills\/pipeline-start\/references\//u,
  /^harness\/config\/verify-case-completion-augmentations\.v1\.json$/u,
  /^harness\/scripts\/check-verify-case-completion\.test\.mjs$/u,
];

test("the patch exists and is non-empty", () => {
  assert.ok(statSync(PATCH).size > 0);
});

test("the patch touches only the named files", () => {
  const text = readFileSync(PATCH, "utf8");
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0, "no file in the patch");
  for (const file of files) assert.ok(ALLOWED.some((re) => re.test(file)), `outside the write scope: ${file}`);
});
