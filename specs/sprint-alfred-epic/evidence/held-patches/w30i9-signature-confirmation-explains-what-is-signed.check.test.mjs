// SPDX-License-Identifier: SUL-1.0
// C30I-S5 (AC-112, queue C30-20): structural check of the held patch w30i9. Plain node:test, no product run, no git, no producer.
// The patch is a delta on the integrated tree that already holds the 30i slices S1A to S7, S4 and the analysis; it is therefore NOT
// applied to the real checkout here -- apply it after that chain (see the notes), never before.
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patchPath = join(here, "w30i9-signature-confirmation-explains-what-is-signed.patch");
const WRITE_LIST = Object.freeze([
  "plugins/pipeline-core/scripts/po-human-approval.mjs",
  "plugins/pipeline-core/scripts/po-human-approval.test.mjs",
  "plugins/pipeline-core/scripts/po-human-approval.signing-handoff.test.mjs",
  "plugins/pipeline-core/lib/critical-action-approval-request.mjs",
  "plugins/pipeline-core/lib/critical-action-approval-card.mjs",
  "plugins/pipeline-core/lib/critical-action-approval-card.test.mjs",
  "harness/config/verify-case-completion-augmentations.v1.json",
]);

test("w30i9: the held patch exists and is non-empty", () => {
  assert.ok(statSync(patchPath).isFile());
  assert.ok(statSync(patchPath).size > 0);
});

test("w30i9: the held patch touches only the briefed files and adds the card module and its tests", () => {
  const patch = readFileSync(patchPath, "utf8");
  const touched = [...patch.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(touched.length > 0, "the patch must contain at least one file diff");
  for (const path of touched) assert.ok(WRITE_LIST.includes(path), `${path} is outside the write list`);
  for (const path of ["plugins/pipeline-core/lib/critical-action-approval-card.mjs", "plugins/pipeline-core/lib/critical-action-approval-card.test.mjs", "plugins/pipeline-core/scripts/po-human-approval.mjs"]) {
    assert.ok(touched.includes(path), `${path} must be part of the patch`);
  }
});

test("w30i9: the patch changes no bound field (request schema, intent, subject preimage, key handling, confirmation word)", () => {
  const patch = readFileSync(patchPath, "utf8");
  const removed = patch.split("\n").filter((line) => line.startsWith("-") && !line.startsWith("---"));
  assert.deepEqual(removed.filter((line) => /CRITICAL_ACTION_APPROVAL_REQUEST_SCHEMA|CONFIRMATION_TOKEN|createCriticalActionApprovalRequest|signIntentIntoProof|approvalIntent/u.test(line)), []);
});
