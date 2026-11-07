// SPDX-License-Identifier: SUL-1.0
// Held-patch check for w263 (C20-G2036-ARCH-OPERATIONAL): the patch exists, is non-empty, touches only plugin or schema surfaces and
// carries the measurement, the Verify suite, the commit-step readback and the pins for each.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patch = readFileSync(join(here, "w263-c20-architecture-operational.patch"), "utf8");
const ALLOWED = ["plugins/pipeline-core/", "schemas/"];

test("w263 patch exists, is non-empty and touches only plugins/pipeline-core/ and schemas/", () => {
  assert.ok(patch.length > 0);
  const files = [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1]);
  assert.ok(files.length > 0);
  for (const file of files) {
    assert.ok(ALLOWED.some((prefix) => file.startsWith(prefix)), `outside the permitted surfaces: ${file}`);
  }
  for (const needed of [
    "plugins/pipeline-core/scripts/architecture-boundary-check.mjs",
    "plugins/pipeline-core/scripts/verify-evidence-producer.mjs",
    "plugins/pipeline-core/lib/architecture-design.mjs",
    "plugins/pipeline-core/scripts/pipeline-state.mjs",
  ]) assert.ok(files.includes(needed), needed);
  // The never-liftable kernel file gains no import edge (GMWKC01): the Verify measurement runs through its own dispatcher module.
  assert.ok(!files.includes("plugins/pipeline-core/scripts/consumer-verify-check.mjs"));
});

test("w263 patch carries the measurement, the Verify suite, the commit-step readback and their pins", () => {
  for (const needle of [
    "pipeline.architecture-measurement.v1", "measureArchitecture", "baseline-architecture", "measuredDependencies",
    "runConsumerVerifyCheck", "architectureCommitStep", "uncommittedPaths", "nextAction", "G20-36",
  ]) assert.ok(patch.includes(needle), needle);
});
