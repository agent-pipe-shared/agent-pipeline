// SPDX-License-Identifier: SUL-1.0
// Held-patch check for w257 (C20-G2025-SECURITY-GATE): the patch exists, is non-empty, touches only the permitted plugin surfaces and
// carries the critical-calibration refusal, the sanctioned gate writer and its guard admission.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patch = readFileSync(join(here, "w257-c20-security-gate-repair.patch"), "utf8");
const ALLOWED = [
  "plugins/pipeline-core/lib/",
  "plugins/pipeline-core/scripts/",
  "plugins/pipeline-core/skills/",
];

test("w257 patch exists, is non-empty and touches only lib/, scripts/ and skills/ of the plugin", () => {
  assert.ok(patch.length > 0);
  const files = [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1]);
  assert.ok(files.length > 0);
  for (const file of files) {
    assert.ok(ALLOWED.some((prefix) => file.startsWith(prefix)), `outside the permitted surfaces: ${file}`);
  }
  for (const needed of [
    "plugins/pipeline-core/scripts/security-gate-configure.mjs",
    "plugins/pipeline-core/lib/security-close-status.mjs",
    "plugins/pipeline-core/lib/pins/security-close-chain-is-hard-per-calibration.test.mjs",
    "plugins/pipeline-core/lib/pins/catalogue-admit-prescribed-lifecycle-verbs.test.mjs",
  ]) assert.ok(files.includes(needed), needed);
});

test("w257 patch carries the typed refusal, the idempotent writer and its guard admission", () => {
  for (const needle of [
    "SEC-CLOSE-GATE-NOT-CONFIGURED", "securityGateNotConfiguredRefusal", "SECURITY_GATE_CONFIGURE_SCRIPT",
    "SECURITY_GATE_BLOCK", "already configured", "PA-MANIFEST-DRIFT",
  ]) assert.ok(patch.includes(needle), needle);
});
