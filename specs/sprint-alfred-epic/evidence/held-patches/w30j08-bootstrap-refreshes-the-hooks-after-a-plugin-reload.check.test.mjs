// SPDX-License-Identifier: SUL-1.0
// C30J-J8 check: the held patch exists, is not empty and touches only the briefed files. No producer or product run.
// The patch is a delta on the integrated 30i tree (the clone base9), which is not applied to the repository yet, so this check never
// runs `git apply` against the repository root: the notes name the required order (apply that tree first, then this patch).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const PATCH = join(import.meta.dirname, "w30j08-bootstrap-refreshes-the-hooks-after-a-plugin-reload.patch");
const ALLOWED = new Set([
  "plugins/pipeline-core/scripts/pipeline-start-preflight.mjs",
  "plugins/pipeline-core/scripts/pipeline-start-preflight.test.mjs",
  "plugins/pipeline-core/scripts/refresh-mandatory-hooks.mjs",
  "plugins/pipeline-core/scripts/refresh-mandatory-hooks.test.mjs",
  "plugins/pipeline-core/scripts/mid-session-hook-refresh.test.mjs",
  "plugins/pipeline-core/lib/hook-currentness.mjs",
  "plugins/pipeline-core/lib/pins/bootstrap-should-refresh-hooks-when-the-plugin-updated.test.mjs",
  "plugins/pipeline-core/lib/pins/git-hook-runtime-snapshots-go-stale-after-plugin-changes.test.mjs",
  "plugins/pipeline-core/scripts/repair-map.test.mjs",
]);

test("the patch exists and is not empty", () => {
  assert.ok(statSync(PATCH).isFile());
  assert.ok(statSync(PATCH).size > 0);
});

test("the patch touches only the briefed files", () => {
  const touched = [...readFileSync(PATCH, "utf8").matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(touched.length > 0, "the patch names at least one file");
  for (const path of touched) assert.ok(ALLOWED.has(path), `${path} is outside the briefed files`);
});

test("the patch carries the recon proofs: the soft-advisory boundary and the attestation case", () => {
  const text = readFileSync(PATCH, "utf8");
  for (const needle of ["P7: a soft refresh advisory", "RED P7", "C30J-J8: stale mandatory hooks beside plugin-attestation-required"]) {
    assert.ok(text.includes(needle), `${needle} is part of the patch`);
  }
});
