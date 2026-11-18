// SPDX-License-Identifier: SUL-1.0
// Delivery check of the held patch w313 (candidate 31, C31-B3, AC-112): the patch exists, is non-empty and touches only the briefed files.
// It does not apply the patch: the patch is a delta on the base clone of candidate 31 and applies only after that base (see the notes file).
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const PATCH = join(here, "w313-submit-plan-hints-the-adr-command-and-create-adr-generates-the-drafts-from-the-design.patch");
const ALLOWED = new Set([
  "plugins/pipeline-core/scripts/pipeline-state.mjs",
  "plugins/pipeline-core/scripts/pipeline-state.test.mjs",
  "plugins/pipeline-core/scripts/create-adr.mjs",
  "plugins/pipeline-core/scripts/architecture-baseline.test.mjs",
  "plugins/pipeline-core/lib/architecture-effective-decisions.mjs",
  "plugins/pipeline-core/lib/architecture-effective-decisions.test.mjs",
  "plugins/pipeline-core/lib/guard/command-catalogue.mjs",
  "plugins/pipeline-core/lib/guard/constants.mjs",
  "plugins/pipeline-core/skills/pipeline-start/references/happy-path.md",
  "plugins/pipeline-core/runbooks/plan-path.v1.json",
  "plugins/pipeline-core/scripts/generate-runbook.test.mjs",
  "plugins/pipeline-core/lib/pins/catalogue-admit-prescribed-lifecycle-verbs.test.mjs",
]);

test("w313: the patch exists and is non-empty", () => {
  assert.ok(existsSync(PATCH), "the held patch is missing");
  assert.ok(statSync(PATCH).size > 0, "the held patch is empty");
});

test("w313: the patch touches only the briefed files", () => {
  const text = readFileSync(PATCH, "utf8");
  const touched = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(touched.length > 0, "the patch names no file");
  const outside = [...new Set(touched)].filter((file) => !ALLOWED.has(file));
  assert.deepEqual(outside, [], `files outside the write list: ${outside.join(", ")}`);
  assert.ok(touched.includes("plugins/pipeline-core/scripts/create-adr.mjs"), "the create-adr change is part of the patch");
  assert.ok(touched.includes("plugins/pipeline-core/lib/architecture-effective-decisions.mjs"), "the shared derivation is part of the patch");
});
