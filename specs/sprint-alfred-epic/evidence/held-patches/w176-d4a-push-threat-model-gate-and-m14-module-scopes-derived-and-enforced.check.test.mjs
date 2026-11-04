// SPDX-License-Identifier: SUL-1.0
// Checks the held patch w176-d4a exists and touches only its briefed files. It does not apply the patch to the repository:
// the patch is a delta on the held patch w190 (it edits the same files), so the order is w190 first, then this one (see the notes file).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";

const patch = new URL("./w176-d4a-push-threat-model-gate-and-m14-module-scopes-derived-and-enforced.patch", import.meta.url);

test("the patch exists and is non-empty", () => {
  assert.ok(statSync(patch).size > 0);
});

test("the patch touches only the briefed files", () => {
  const files = new Set();
  for (const line of readFileSync(patch, "utf8").split("\n")) {
    const match = /^diff --git a\/(\S+) b\/(\S+)$/u.exec(line);
    if (match) { files.add(match[1]); files.add(match[2]); }
  }
  const allowedExact = new Set([
    "docs/guard-maintenance-window-threat-model.md",
    "harness/verify-suites.json",
  ]);
  // scripts and lib (the gate and scope modules, the briefing tool, the wiring and the tests that must follow), and the happy-path guide text
  const allowedDirectory = /^plugins\/pipeline-core\/(?:lib|scripts|skills\/pipeline-start\/references)\/[^/]+$/u;
  assert.ok(files.size > 0);
  for (const file of files) assert.ok(allowedExact.has(file) || allowedDirectory.test(file), file);
});
