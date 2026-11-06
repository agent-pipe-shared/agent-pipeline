// SPDX-License-Identifier: SUL-1.0
// Held-patch check for w251: the patch exists, touches only the files of the Full Verify reds and the two minor findings, and carries each fix.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patch = readFileSync(join(here, "w251-the-19l-full-verify-reds-and-two-minor-findings.patch"), "utf8");

test("w251 patch exists, touches only the named files and carries every fix", () => {
  assert.ok(patch.length > 0);
  const files = [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1]).sort();
  assert.deepEqual(files, [
    "docs/guard-maintenance-window-threat-model.md",
    "docs/product-capability-inventory.json",
    "harness/scripts/check-verify-suite-append.mjs",
    "harness/scripts/check-verify-suite-append.test.mjs",
    "harness/verify-suite-history-recovery.json",
    "plugins/pipeline-core/lib/guard-maintenance-window.mjs",
    "plugins/pipeline-core/lib/local-worker-supervisor.mjs",
    "plugins/pipeline-core/lib/pins/windows-requester-ancestors-above-repository-are-human-controlled.test.mjs",
    "plugins/pipeline-core/lib/windows-owned-authority-backend.mjs",
    "plugins/pipeline-core/scripts/agent-guidance-w247.test.mjs",
    "plugins/pipeline-core/scripts/pipeline-start-preflight.mjs",
    "plugins/pipeline-core/scripts/push-prepare.test.mjs",
    "plugins/pipeline-core/scripts/win-authority-readiness-and-preflight.test.mjs",
    "specs/sprint-alfred-epic/evidence/native-checks-options-2026-11-05.md",
  ]);
  for (const needle of ["appendsInvariant", "d9731d0468e3b932efb79a47749ce20f223a75f2", "source-digest-memo.mjs", "nodeExecutable()",
    "isWin()", "inspectSignedDescriptorCustodyRepository", "no-json", "W247-5", "loose.txt"]) assert.ok(patch.includes(needle), needle);
});
