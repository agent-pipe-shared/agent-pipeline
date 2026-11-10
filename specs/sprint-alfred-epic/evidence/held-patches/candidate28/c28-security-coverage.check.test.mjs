// SPDX-License-Identifier: SUL-1.0
// Held-patch check for C28-SECURITY-COVERAGE (AC-108): the patch exists, is non-empty, touches only plugins/pipeline-core/, harness/ or docs/,
// and carries the three outcomes: a default rule pack with fixtures, honest not-run states with warnings, and the declared-requirement refusal.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patch = readFileSync(join(here, "c28-security-coverage.patch"), "utf8");
const ALLOWED = ["plugins/pipeline-core/", "harness/", "docs/"];

test("c28-security-coverage patch exists, is non-empty and touches only plugins/pipeline-core/, harness/ or docs/", () => {
  assert.ok(patch.length > 0);
  const files = [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1]);
  assert.ok(files.length > 0);
  for (const file of files) assert.ok(ALLOWED.some((prefix) => file.startsWith(prefix)), `outside the permitted surfaces: ${file}`);
  for (const file of [
    "plugins/pipeline-core/security/semgrep/pipeline.yml",
    "plugins/pipeline-core/config/security/semgrep-default-rules.test.mjs",
    "plugins/pipeline-core/lib/security-close-status.mjs",
    "plugins/pipeline-core/scripts/check-close-security-completeness.mjs",
    "plugins/pipeline-core/scripts/security-close-check.mjs",
    "plugins/pipeline-core/scripts/pipeline-manifest.schema.json",
  ]) assert.ok(files.includes(file), `the patch must change ${file}`);
});

test("c28-security-coverage patch carries the rule pack, the honest states and the declared-requirement refusal", () => {
  for (const needle of [
    "pipeline-default-dom-injection-sink", "pipeline-default-eval-like-call", "pipeline-default-unsafe-url-scheme", "pipeline-default-unvalidated-redirect",
    "pipeline-default-postmessage-no-origin-check", "pipeline-default-prototype-pollution", "pipeline-default-child-process-shell-string",
    "pipeline-default-hardcoded-secret", "pipeline-default-hardcoded-credential-assignment",
    "SEC-CLOSE-REQUIRED-CAPABILITY-NOT-RUN", "required_capabilities", "not-run", "WARNING",
  ]) assert.ok(patch.includes(needle), needle);
});
