// SPDX-License-Identifier: SUL-1.0
// Held-patch check for w254 (C20-G2025-SECURITY): the patch exists, is non-empty, touches only the permitted plugin surfaces and carries the
// security close chain (four-state vocabulary, the critical-calibration refusal, the --out-dir analysis run).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patch = readFileSync(join(here, "w254-c20-security-close-chain.patch"), "utf8");
const ALLOWED = [
  "plugins/pipeline-core/lib/",
  "plugins/pipeline-core/scripts/",
  "plugins/pipeline-core/hooks/guard-push",
  "plugins/pipeline-core/guardrails/",
];
const ALLOWED_FILES = ["plugins/pipeline-core/docs/operating-model.md"];

test("w254 patch exists, is non-empty and touches only the permitted plugin surfaces", () => {
  assert.ok(patch.length > 0);
  const files = [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1]);
  assert.ok(files.length > 0);
  for (const file of files) {
    assert.ok(ALLOWED.some((prefix) => file.startsWith(prefix)) || ALLOWED_FILES.includes(file), `outside the permitted surfaces: ${file}`);
  }
  assert.ok(files.includes("plugins/pipeline-core/lib/security-close-status.mjs"));
  assert.ok(files.includes("plugins/pipeline-core/lib/pins/security-close-chain-is-hard-per-calibration.test.mjs"));
});

test("w254 patch carries the four-state vocabulary, the critical refusal and the analysis run", () => {
  for (const needle of ["SEC-CLOSE-SCANNER-NOT-EXECUTED", "not executed", "not applicable", "isCriticalStakes", "--out-dir", "evidenceOutDir"]) {
    assert.ok(patch.includes(needle), needle);
  }
});
