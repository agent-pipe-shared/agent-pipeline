// SPDX-License-Identifier: SUL-1.0
// Candidate 19c, w172 delivery check (AC-108): the held patch exists, is non-empty and touches only the files the briefing named.
// Plain node:test, no producer or product run. The patch is a delta on top of the held patch w168, so it is NOT applied against
// the repository here; the notes state the required order (w168 first, then this patch).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const patchPath = fileURLToPath(new URL("./w172-win-rest-the-failed-path-in-the-powershell-envelope-eperm-retry-the-handover-consistency-and-the-slicing-hint.patch", import.meta.url));

const EXACT = new Set([
  "plugins/pipeline-core/lib/windows-owned-authority-native.ps1",
  "plugins/pipeline-core/lib/windows-owned-authority-backend.mjs",
  "plugins/pipeline-core/lib/windows-authority-readiness.mjs",
  "plugins/pipeline-core/scripts/pipeline-state.mjs",
  "plugins/pipeline-core/hooks/native-slicing.mjs",
  "plugins/pipeline-core/hooks/guard-dispatch.mjs",
  "plugins/pipeline-core/lib/session-authority-registry.mjs",
  "plugins/pipeline-core/lib/session-requester-bridge.mjs",
  "plugins/pipeline-core/scripts/pipeline-start-preflight.mjs",
  "plugins/pipeline-core/scripts/refresh-mandatory-hooks.mjs",
  "plugins/pipeline-core/scripts/win-authority-rest.test.mjs",
  "plugins/pipeline-core/scripts/win-authority-readiness-and-preflight.test.mjs",
  "docs/state.md",
  "harness/verify-suites.json",
  "docs/product-capability-inventory.json",
]);
const DIRECTORIES = ["plugins/pipeline-core/scripts/security-readiness/", "plugins/pipeline-core/scripts/security-adapters/"];

function patchedPaths(text) {
  const paths = new Set();
  for (const line of text.split("\n")) {
    const header = /^diff --git a\/(\S+) b\/(\S+)$/u.exec(line);
    if (header !== null) { paths.add(header[1]); paths.add(header[2]); }
  }
  return [...paths].sort();
}

test("the w172 patch exists and is non-empty", () => {
  assert.ok(statSync(patchPath).isFile());
  assert.ok(statSync(patchPath).size > 0);
});

test("the w172 patch touches only the files the briefing named", () => {
  const paths = patchedPaths(readFileSync(patchPath, "utf8"));
  assert.ok(paths.length > 0, "the patch changes at least one file");
  const outside = paths.filter((path) => !EXACT.has(path) && !DIRECTORIES.some((directory) => path.startsWith(directory) && !path.slice(directory.length).includes("/")));
  assert.deepEqual(outside, [], "no file outside the named list");
});
