// SPDX-License-Identifier: SUL-1.0
// C30J-J3 check: the held patch exists and touches only the files its slice may change.
// It does not run `git apply` against the repository: the patch is a delta on the integrated 30i tree, so the
// notes next to it state the required order (apply the integrated 30i tree first).
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";

const patchPath = new URL("./w30j03-a-mistyped-passphrase-ceremony-reproduced-and-closed.patch", import.meta.url);
const ALLOWED = new Set([
  "plugins/pipeline-core/lib/chat-gate-ceremony.mjs",
  "plugins/pipeline-core/lib/chat-gate-ceremony.test.mjs",
  "plugins/pipeline-core/scripts/po-human-approval.mjs",
  "plugins/pipeline-core/scripts/po-human-approval.test.mjs",
  "plugins/pipeline-core/lib/critical-action-approval-request.mjs",
  "plugins/pipeline-core/scripts/repair-map.test.mjs",
]);

test("the held patch exists and is non-empty", () => {
  assert.ok(statSync(patchPath).size > 0);
});

test("the held patch touches only the files of its write list", () => {
  const touched = [...readFileSync(patchPath, "utf8").matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(touched.length > 0, "the patch changes at least one file");
  assert.deepEqual([...new Set(touched)].filter((path) => !ALLOWED.has(path)), [], "no file outside the write list");
});
