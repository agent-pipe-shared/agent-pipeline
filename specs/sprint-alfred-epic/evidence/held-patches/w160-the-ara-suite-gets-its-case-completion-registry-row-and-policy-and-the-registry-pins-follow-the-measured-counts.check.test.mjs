// SPDX-License-Identifier: SUL-1.0
// Checks the held patch w160 exists and touches only its three briefed files. It does not apply the patch
// (the patch is built on the chain through w159, see the notes file).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";

const patch = new URL("./w160-the-ara-suite-gets-its-case-completion-registry-row-and-policy-and-the-registry-pins-follow-the-measured-counts.patch", import.meta.url);

test("the patch exists and is non-empty", () => {
  assert.ok(statSync(patch).size > 0);
});

test("the patch touches only the three briefed files", () => {
  const files = new Set();
  for (const line of readFileSync(patch, "utf8").split("\n")) {
    const match = /^diff --git a\/(\S+) b\/(\S+)$/u.exec(line);
    if (match) { files.add(match[1]); files.add(match[2]); }
  }
  const allowed = new Set([
    "harness/config/verify-case-completion.v1.json",
    "harness/scripts/check-verify-case-completion.test.mjs",
    "harness/verify-suites.json",
  ]);
  assert.ok(files.size > 0);
  for (const file of files) assert.ok(allowed.has(file), file);
});
