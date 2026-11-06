// SPDX-License-Identifier: SUL-1.0
// Held-patch check for w250: the patch exists, touches only the stop path, its tests and the VCR01 pin, and carries the three fixes.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patch = readFileSync(join(here, "w250-a-stop-survives-a-sibling-commit-and-release-and-names-its-failure.patch"), "utf8");

test("w250 patch exists, touches only the stop path files and carries the three fixes", () => {
  assert.ok(patch.length > 0);
  const files = [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1]).sort();
  assert.deepEqual(files, [
    "harness/scripts/check-verify-case-completion.test.mjs",
    "plugins/pipeline-core/hooks/native-goldfish-host.mjs",
    "plugins/pipeline-core/lib/native-goldfish-host-finalizer.mjs",
    "plugins/pipeline-core/lib/native-goldfish-host-finalizer.test.mjs",
    "plugins/pipeline-core/lib/native-goldfish-host-state-fanout.test.mjs",
    "plugins/pipeline-core/lib/native-goldfish-host-state.mjs",
  ]);
  for (const needle of ["retryBindingChange", "nativeBoundaryRounds", "unresolvedStop", "systemMessage"]) assert.ok(patch.includes(needle), needle);
});
