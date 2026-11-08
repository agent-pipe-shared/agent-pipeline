// SPDX-License-Identifier: SUL-1.0
// Held-patch check for w276 (C20D-G2065-DOCS-MODULE): the patch exists, is non-empty, touches only plugin files, and carries the G20-65
// outcome (a documentation-only module names one of its own owned documents as the item check: `document:<owned path>`).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patch = readFileSync(join(here, "w276-c20d-docs-module.patch"), "utf8");

test("w276 patch exists, is non-empty and every touched file is under plugins/pipeline-core/, harness/ or docs/", () => {
  assert.ok(patch.length > 0);
  const files = [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1]);
  assert.ok(files.length > 0);
  for (const file of files) assert.ok(file.startsWith("plugins/pipeline-core/") || file.startsWith("harness/") || file.startsWith("docs/"), `outside plugins/pipeline-core/, harness/ and docs/: ${file}`);
  for (const file of [
    "plugins/pipeline-core/scripts/dispatch-briefing.mjs",
    "plugins/pipeline-core/lib/native-goldfish-host-return.mjs",
    "plugins/pipeline-core/lib/native-goldfish-host-state.mjs",
    "plugins/pipeline-core/lib/module-dispatch-scope.mjs",
    "plugins/pipeline-core/lib/architecture-design.mjs",
    "plugins/pipeline-core/skills/pipeline-start/references/happy-path.md",
  ]) assert.ok(files.includes(file), `the patch must change ${file}`);
});

test("w276 patch carries the document check form, its host verification and the design-time report", () => {
  assert.match(patch, /^\+.*DBG-CHECK-DOCUMENT-MODULE/mu, "a code module or a package without a module is refused the document form");
  assert.match(patch, /^\+.*DBG-CHECK-DOCUMENT-NOT-OWNED/mu);
  assert.match(patch, /^\+.*document-check-missing/mu, "the host finalize refuses a missing document");
  assert.match(patch, /^\+.*document-check-empty/mu);
  assert.match(patch, /^\+.*document-check-unchanged/mu);
  assert.match(patch, /^\+.*ARCHITECTURE-DESIGN-MODULE-NO-CHECK/mu, "the architecture validator reports a module without an admissible check");
  assert.match(patch, /^\+.*document:<owned path>/mu, "the happy-path guide states the rule");
});

test("w276 patch restates no existing assertion: no test line is removed except inside a hunk that re-adds it", () => {
  const removedAssertions = [...patch.matchAll(/^-\s*(?:assert\.|\{ id: ")/gmu)];
  assert.equal(removedAssertions.length, 0, "an existing assertion or case was removed or weakened");
});
