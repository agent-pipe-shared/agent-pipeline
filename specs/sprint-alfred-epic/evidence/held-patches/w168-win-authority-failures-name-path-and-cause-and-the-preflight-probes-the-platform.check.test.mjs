// SPDX-License-Identifier: SUL-1.0
// Checks the held patch w168 exists and touches only its briefed files. It does not apply the patch against the
// repository: the patch is a delta on top of the held patch w166 (see the notes file for the required order).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";

const patch = new URL("./w168-win-authority-failures-name-path-and-cause-and-the-preflight-probes-the-platform.patch", import.meta.url);

test("the patch exists and is non-empty", () => {
  assert.ok(statSync(patch).size > 0);
});

test("the patch touches only the briefed files", () => {
  const files = new Set();
  for (const line of readFileSync(patch, "utf8").split("\n")) {
    const match = /^diff --git a\/(\S+) b\/(\S+)$/u.exec(line);
    if (match) { files.add(match[1]); files.add(match[2]); }
  }
  const allowed = new Set([
    "plugins/pipeline-core/lib/windows-owned-authority-native.ps1",
    "plugins/pipeline-core/lib/windows-authority-readiness.mjs",
    "plugins/pipeline-core/lib/session-requester-bridge.mjs",
    "plugins/pipeline-core/lib/session-authority-registry.mjs",
    "plugins/pipeline-core/scripts/session-authority-repair.mjs",
    "plugins/pipeline-core/scripts/pipeline-start-preflight.mjs",
    "plugins/pipeline-core/scripts/refresh-mandatory-hooks.mjs",
    "plugins/pipeline-core/scripts/verify-evidence-producer.mjs",
    "plugins/pipeline-core/hooks/guard-dispatch.mjs",
    "plugins/pipeline-core/lib/environment-readiness.mjs",
    "plugins/pipeline-core/scripts/update-public-handover.mjs",
    "plugins/pipeline-core/scripts/win-authority-readiness-and-preflight.test.mjs",
    "harness/verify-suites.json",
    "docs/product-capability-inventory.json",
  ]);
  assert.ok(files.size > 0);
  for (const file of files) assert.ok(allowed.has(file), file);
});
