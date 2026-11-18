// SPDX-License-Identifier: SUL-1.0
// Candidate 31, lane M3 (L2 + L11, AC-112): structural check of the held patch w313. The patch is a delta on the base clone of candidate 31, so it is NOT applied
// to the real checkout here (apply the base clone first, see the notes file); this check only proves that it exists and touches nothing outside its five files.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PATCH = fileURLToPath(new URL("./w313-the-baseline-boundary-policy-is-written-when-the-architecture-is-materialized.patch", import.meta.url));
const ALLOWED = [
  "plugins/pipeline-core/lib/architecture-design.mjs",
  "plugins/pipeline-core/lib/architecture-design.test.mjs",
  "plugins/pipeline-core/scripts/architecture-boundary-check.mjs",
  "plugins/pipeline-core/scripts/architecture-boundary-check.test.mjs",
  "plugins/pipeline-core/scripts/pipeline-state.mjs",
];

test("w313: the held patch exists and is not empty", () => {
  assert.ok(statSync(PATCH).size > 0);
});

test("w313: the patch touches only the five files of its write list", () => {
  const text = readFileSync(PATCH, "utf8");
  const touched = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(touched.length > 0, "the patch names at least one file");
  assert.deepEqual([...new Set(touched)].filter((file) => !ALLOWED.includes(file)), [], "no file outside the write list");
});

test("w313: the patch carries the derived test ownership and the materialize-time baseline policy", () => {
  const text = readFileSync(PATCH, "utf8");
  assert.match(text, /^\+function testOwners\(/mu);
  assert.match(text, /^\+export function baselineBoundaryPolicy\(/mu);
  assert.match(text, /^\+\s+const policyTargets = /mu);
});
