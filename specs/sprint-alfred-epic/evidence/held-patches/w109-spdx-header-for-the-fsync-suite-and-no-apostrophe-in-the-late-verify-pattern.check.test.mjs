// Held-patch check for w109: two pins the Full Verify of candidate 18 found (license header, case-completion classification).
// It does not run git apply: the patch is a delta on the end of the candidate 18 chain (after w108).
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PATCH = join(HERE, "w109-spdx-header-for-the-fsync-suite-and-no-apostrophe-in-the-late-verify-pattern.patch");
const ALLOWED = [
  "plugins/pipeline-core/lib/session-authority-registry-fsync.test.mjs",
  "plugins/pipeline-core/scripts/pipeline-state-late-verify.test.mjs",
];

test("w109: the patch exists and is non-empty", () => {
  assert.ok(existsSync(PATCH), "patch file is missing");
  assert.ok(statSync(PATCH).size > 0, "patch file is empty");
});

test("w109: the patch touches only the two test files", () => {
  const text = readFileSync(PATCH, "utf8");
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0, "patch has no diff header");
  for (const file of files) assert.ok(ALLOWED.includes(file), `patch touches an unexpected file: ${file}`);
});

test("w109: the patch adds the SPDX header and removes the apostrophe pattern", () => {
  const text = readFileSync(PATCH, "utf8");
  assert.match(text, /^\+\/\/ SPDX-License-Identifier: SUL-1\.0$/mu);
  assert.doesNotMatch(text, /^\+.*runner'\?s\?/mu);
});
