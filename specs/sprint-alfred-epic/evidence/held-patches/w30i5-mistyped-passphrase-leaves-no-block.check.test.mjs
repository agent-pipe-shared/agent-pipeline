// SPDX-License-Identifier: SUL-1.0
// Check of the held patch w30i5 (C30I-S6, queue C30-21): the patch exists, is non-empty and touches only the files its scope names.
// It does not run git apply against the repository: the patch is a delta on the 30h chain plus the skill split, the agent fields, the bound-session advance and the registration --supersedes (the clone base7), see the notes file for the order.

import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const DIR = import.meta.dirname;
const PATCH = join(DIR, "w30i5-mistyped-passphrase-leaves-no-block.patch");
const ALLOWED = new Set([
  "plugins/pipeline-core/lib/chat-gate-ceremony.mjs",
  "plugins/pipeline-core/lib/chat-gate-ceremony.test.mjs",
  "plugins/pipeline-core/scripts/po-human-approval.mjs",
  "plugins/pipeline-core/scripts/po-human-approval.test.mjs",
  "plugins/pipeline-core/scripts/po-human-approval.signing-handoff.test.mjs",
  "plugins/pipeline-core/scripts/po-human-approval-openssl-path.test.mjs",
  "plugins/pipeline-core/scripts/session-authority-repair.mjs",
  "plugins/pipeline-core/scripts/session-authority-repair.test.mjs",
  "plugins/pipeline-core/lib/session-authority-registry.mjs",
  "plugins/pipeline-core/lib/routine-repair.mjs",
  "plugins/pipeline-core/lib/routine-repair.test.mjs",
  "plugins/pipeline-core/scripts/routine-repair.mjs",
  "harness/config/verify-case-completion-augmentations.v1.json",
]);

test("the w30i5 patch exists and is not empty", () => {
  assert.ok(statSync(PATCH).isFile());
  assert.ok(statSync(PATCH).size > 0);
});

test("the w30i5 patch touches only the files its scope names", () => {
  const text = readFileSync(PATCH, "utf8");
  const touched = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(touched.length > 0, "the patch names at least one file");
  for (const path of touched) assert.ok(ALLOWED.has(path), `outside the scope: ${path}`);
  assert.ok(touched.includes("plugins/pipeline-core/lib/chat-gate-ceremony.mjs"), "the ceremony change is in the patch");
  assert.ok(touched.includes("plugins/pipeline-core/scripts/po-human-approval.mjs"), "the signing change is in the patch");
  assert.ok(touched.includes("plugins/pipeline-core/lib/routine-repair.mjs"), "the routine-repair change is in the patch");
});
