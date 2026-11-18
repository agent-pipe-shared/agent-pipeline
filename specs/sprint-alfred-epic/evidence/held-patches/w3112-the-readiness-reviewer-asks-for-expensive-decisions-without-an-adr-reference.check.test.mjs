// SPDX-License-Identifier: SUL-1.0
// Check for C31-B12: the held patch exists, is non-empty and touches only the two briefed files.
// It does not apply the patch (it is a delta on the candidate 31 base clone chain).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patchPath = join(here, "w3112-the-readiness-reviewer-asks-for-expensive-decisions-without-an-adr-reference.patch");
const ALLOWED = [
  "plugins/pipeline-core/agents/readiness-reviewer.md",
  "plugins/pipeline-core/lib/pins/acceptance-criteria-are-examined-as-whole-user-journeys.test.mjs",
];

test("the patch exists and is non-empty", () => {
  assert.ok(readFileSync(patchPath, "utf8").length > 0);
});

test("the patch touches only the briefed files", () => {
  const text = readFileSync(patchPath, "utf8");
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0, "at least one file diff");
  for (const f of files) assert.ok(ALLOWED.includes(f), `unexpected file in patch: ${f}`);
  for (const f of ALLOWED) assert.ok(files.includes(f), `patch lacks ${f}`);
});
