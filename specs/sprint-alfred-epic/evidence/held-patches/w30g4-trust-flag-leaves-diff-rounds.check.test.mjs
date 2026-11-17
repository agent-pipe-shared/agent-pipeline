// SPDX-License-Identifier: SUL-1.0
// Check for the held patch w30g4-trust-flag-leaves-diff-rounds (C30G-E2, AC-108). The patch is a delta on the applied candidate 30g chain,
// so this check does NOT run git apply against the repository: it asserts the patch exists, is non-empty and touches only the write list.
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";

const patchUrl = new URL("./w30g4-trust-flag-leaves-diff-rounds.patch", import.meta.url);
const ALLOWED = new Set([
  "plugins/pipeline-core/lib/review-economy.mjs",
  "plugins/pipeline-core/lib/review-economy.test.mjs",
  "plugins/pipeline-core/lib/critic-course-admission.mjs",
  "plugins/pipeline-core/lib/critic-course-admission.test.mjs",
  "plugins/pipeline-core/lib/feature-package-registration.mjs",
  "plugins/pipeline-core/scripts/register-feature-package.mjs",
  "plugins/pipeline-core/lib/critic-generic-batch.mjs",
  "plugins/pipeline-core/lib/critic-generic-batch.test.mjs",
  "plugins/pipeline-core/lib/critic-review-lineage.mjs",
  "plugins/pipeline-core/lib/critic-review-lineage.test.mjs",
  "plugins/pipeline-core/lib/critic-review-lineage-core.mjs",
  "plugins/pipeline-core/scripts/codex-critic-host.mjs",
  "plugins/pipeline-core/scripts/review-attempt.schema.json",
  "plugins/pipeline-core/scripts/critic-dispatch-preflight.test.mjs",
  "plugins/pipeline-core/scripts/check-critic-skip-coverage.test.mjs",
  "plugins/pipeline-core/lib/interruption-receipts.test.mjs",
  "plugins/pipeline-core/lib/pins/critic-course-consumer-chain-walk.test.mjs",
  "plugins/pipeline-core/lib/pins/critic-round-cap-and-delta-scope-are-not-enforced.test.mjs",
  "plugins/pipeline-core/lib/pins/close-coordinator-refuses-a-required-critic-without-evidence.test.mjs",
  "plugins/pipeline-core/skills/critic-review/SKILL.md",
  "plugins/pipeline-core/templates/prompts/critic-review.md",
  "templates/prompts/critic-review.md",
  "plugins/pipeline-core/skills/pipeline-start/references/architecture-orientation.md",
]);

test("the held patch exists and is non-empty", () => {
  assert.ok(statSync(patchUrl).isFile());
  assert.ok(statSync(patchUrl).size > 0);
});

test("the held patch touches only the files of its write list", () => {
  const text = readFileSync(patchUrl, "utf8");
  const touched = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(touched.length > 0, "the patch names at least one file");
  const outside = [...new Set(touched)].filter((path) => !ALLOWED.has(path));
  assert.deepEqual(outside, []);
});

test("the held patch keeps the versioned schema id of the review attempt record", () => {
  const text = readFileSync(patchUrl, "utf8");
  assert.ok(!/^[-+].*"\$id"/mu.test(text), "no schema $id line is added or removed");
  assert.ok(!/^[-+].*"const": "pipeline\.review-attempt\.v1"/mu.test(text), "the review attempt schema const is untouched");
});
