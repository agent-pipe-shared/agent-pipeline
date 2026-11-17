// SPDX-License-Identifier: SUL-1.0
// C30I-S1A (AC-108): check of the held patch w30i1-skills-fit-the-antigravity-body-limit.patch.
// The patch is a delta on the 30h chain (it edits the same skill files), so it does NOT apply to a checkout without that chain:
// this check therefore never runs git apply; it asserts that the patch exists, is non-empty, and touches only the write list.
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const PATCH = fileURLToPath(new URL("./w30i1-skills-fit-the-antigravity-body-limit.patch", import.meta.url));

const ALLOWED = new Set([
  "plugins/pipeline-core/skills/critic-review/SKILL.md",
  "plugins/pipeline-core/skills/critic-review/references/critic-protocol.md",
  "plugins/pipeline-core/skills/critic-review/references/coordinator-course.md",
  "plugins/pipeline-core/skills/critic-review/critic-review-scope.test.mjs",
  "plugins/pipeline-core/skills/close-block/SKILL.md",
  "plugins/pipeline-core/skills/close-block/references/close-light-and-extensions.md",
  "plugins/pipeline-core/skills/close-block/close-block-fanout-report.test.mjs",
  "plugins/pipeline-core/skills/close-feature/SKILL.md",
  "plugins/pipeline-core/skills/close-feature/references/close-feature-detail.md",
  "plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.v1.json",
  "plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.test.mjs",
  "plugins/pipeline-core/lib/host-skill-catalog.test.mjs",
  "plugins/pipeline-core/lib/host-skill-catalog.mjs",
  "plugins/pipeline-core/lib/agy-central-snapshot.mjs",
  "plugins/pipeline-core/install-agy.test.mjs",
  "harness/scripts/check-critic-fail-closed.mjs",
  "harness/scripts/check-critic-fail-closed.test.mjs",
  "harness/scripts/check-critic-contract-citations.mjs",
  "harness/scripts/check-critic-contract-citations.test.mjs",
  "harness/scripts/check-module-cluster-reachability.mjs",
  "harness/scripts/check-module-cluster-reachability.test.mjs",
  "harness/verify-suites.json",
  "docs/product-capability-inventory.json",
  "plugins/pipeline-core/reader-inputs/product-capability-inventory.json",
  "plugins/pipeline-core/skills/pipeline-start/references/antigravity-feature-close.md",
  "docs/operating-tools.md",
]);

// The three new reference files and the size guard are the delivery itself.
const REQUIRED = [
  "plugins/pipeline-core/skills/critic-review/SKILL.md",
  "plugins/pipeline-core/skills/critic-review/references/critic-protocol.md",
  "plugins/pipeline-core/skills/critic-review/references/coordinator-course.md",
  "plugins/pipeline-core/skills/close-block/SKILL.md",
  "plugins/pipeline-core/skills/close-block/references/close-light-and-extensions.md",
  "plugins/pipeline-core/skills/close-feature/SKILL.md",
  "plugins/pipeline-core/skills/close-feature/references/close-feature-detail.md",
  "plugins/pipeline-core/install-agy.test.mjs",
  "plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.v1.json",
];

function touchedPaths() {
  const text = readFileSync(PATCH, "utf8");
  const paths = new Set();
  for (const m of text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)) {
    paths.add(m[1]);
    paths.add(m[2]);
  }
  return paths;
}

test("C30I-S1A the held patch exists and is non-empty", () => {
  assert.equal(existsSync(PATCH), true, "the .patch file exists");
  assert.ok(statSync(PATCH).size > 0, "the .patch file is non-empty");
});

test("C30I-S1A the held patch touches only the named files and delivers the split", () => {
  const paths = touchedPaths();
  assert.ok(paths.size > 0, "the patch names at least one file");
  const outside = [...paths].filter((p) => !ALLOWED.has(p)).sort();
  assert.deepEqual(outside, [], "no file outside the write list is touched");
  const missing = REQUIRED.filter((p) => !paths.has(p));
  assert.deepEqual(missing, [], "the three skills, their reference files, the size guard and the digest pin are in the patch");
});
