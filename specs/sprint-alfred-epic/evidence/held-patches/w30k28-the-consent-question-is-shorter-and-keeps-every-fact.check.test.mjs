// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PATCH = join(HERE, "w30k28-the-consent-question-is-shorter-and-keeps-every-fact.patch");
const ALLOWED = new Set([
  "plugins/pipeline-core/lib/onboarding-consent-scope.mjs",
  "plugins/pipeline-core/lib/onboarding-consent-scope.test.mjs",
  "plugins/pipeline-core/scripts/onboarding-consent-mark.test.mjs",
  "plugins/pipeline-core/lib/toolchain-registry.test.mjs",
  "plugins/pipeline-core/scripts/pipeline-start-preflight.test.mjs",
  "plugins/pipeline-core/scripts/onboarding-init.test.mjs",
  "plugins/pipeline-core/hooks/codex-session-start-hint.test.mjs",
  "plugins/pipeline-core/skills/pipeline-start/references/onboarding-recovery.md",
]);

test("the patch exists and is non-empty", () => {
  assert.ok(statSync(PATCH).size > 0);
});

// The patch is a delta on the integrated 30j tree, so it is not applied to the repository here (see the notes for the order).
test("the patch touches only the named files", () => {
  const text = readFileSync(PATCH, "utf8");
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)].map((m) => m[2]);
  assert.ok(files.length > 0);
  for (const f of files) assert.ok(ALLOWED.has(f), `unexpected file in patch: ${f}`);
});
