// SPDX-License-Identifier: SUL-1.0
// C30J-J1 held-patch check: the patch exists, is non-empty and touches only the briefed files.
// It is a delta on the integrated 30i tree, so it is NOT applied to the repository here.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const PATCH = new URL("./w30j01-one-list-for-package-states-and-plan-route-text.patch", import.meta.url);
const ALLOWED = new Set([
  "plugins/pipeline-core/scripts/check-artifact-topology.mjs",
  "plugins/pipeline-core/scripts/check-artifact-topology.test.mjs",
  "plugins/pipeline-core/lib/evidence-view-model.mjs",
  "plugins/pipeline-core/lib/evidence-view-model.test.mjs",
  "plugins/pipeline-core/lib/feature-package-topology.mjs",
  "plugins/pipeline-core/lib/feature-package-topology.test.mjs",
  "plugins/pipeline-core/lib/external-reference-adapter.mjs",
  "plugins/pipeline-core/lib/external-reference-adapter.test.mjs",
  "plugins/pipeline-core/scripts/pipeline-state.mjs",
  "plugins/pipeline-core/scripts/pipeline-state.test.mjs",
]);

test("the patch is non-empty and touches only the briefed files", () => {
  const text = readFileSync(PATCH, "utf8");
  assert.ok(text.length > 0);
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(files.length > 0, "the patch names at least one file");
  for (const file of files) assert.ok(ALLOWED.has(file), `unexpected file in the patch: ${file}`);
});
