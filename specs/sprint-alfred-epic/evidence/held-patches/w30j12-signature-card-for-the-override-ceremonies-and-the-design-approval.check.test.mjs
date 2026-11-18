// SPDX-License-Identifier: SUL-1.0
// C30J-J12 (AC-112 closest accepted criterion, queue C30-20 gap): structural check of the held patch w30j12. Plain node:test, no product run,
// no git, no producer. The patch is a delta on the integrated 30i tree (the clone base9, which holds the w30i9 card module); it is therefore NOT
// applied to the real checkout here -- apply it after that chain (see the notes), never before.
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patchPath = join(here, "w30j12-signature-card-for-the-override-ceremonies-and-the-design-approval.patch");
const WRITE_LIST = Object.freeze([
  "plugins/pipeline-core/lib/critical-action-approval-card.mjs",
  "plugins/pipeline-core/lib/critical-action-approval-card.test.mjs",
  "plugins/pipeline-core/scripts/po-human-approval.mjs",
  "plugins/pipeline-core/scripts/po-human-approval.signing-handoff.test.mjs",
  "plugins/pipeline-core/scripts/signing-disclosure-sweep/presentation-cases.mjs",
  "plugins/pipeline-core/lib/pins/signing-prompt-prints-the-whole-review-package.test.mjs",
  "plugins/pipeline-core/lib/pins/three-runner-happy-path-with-two-po-approvals.test.mjs",
]);

test("w30j12: the held patch exists and is non-empty", () => {
  assert.ok(statSync(patchPath).isFile());
  assert.ok(statSync(patchPath).size > 0);
});

test("w30j12: the held patch touches only the briefed files and carries the card module, its tests and the call site", () => {
  const patch = readFileSync(patchPath, "utf8");
  const touched = [...patch.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(touched.length > 0, "the patch must contain at least one file diff");
  for (const path of touched) assert.ok(WRITE_LIST.includes(path), `${path} is outside the write list`);
  for (const path of ["plugins/pipeline-core/lib/critical-action-approval-card.mjs", "plugins/pipeline-core/lib/critical-action-approval-card.test.mjs", "plugins/pipeline-core/scripts/po-human-approval.mjs"]) {
    assert.ok(touched.includes(path), `${path} must be part of the patch`);
  }
});

test("w30j12: the patch changes no bound field and leaves the compact disclosure and the confirmation frame untouched", () => {
  const patch = readFileSync(patchPath, "utf8");
  const removed = patch.split("\n").filter((line) => line.startsWith("-") && !line.startsWith("---"));
  assert.deepEqual(removed.filter((line) => /CONFIRMATION_TOKEN|createPoApprovalIntent|signIntentIntoProof|approvalIntent|intentSha256|compactSigningDisclosure|composeDisclosureLines/u.test(line)), []);
  // The only removed production lines in the approval script are the card import and the two argument swaps at the print call site.
  const section = patch.slice(patch.indexOf("diff --git a/plugins/pipeline-core/scripts/po-human-approval.mjs"));
  const scriptRemoved = section.split("\n").slice(1).filter((line) => line.startsWith("-") && !line.startsWith("---"));
  assert.equal(scriptRemoved.length, 3, scriptRemoved.join("\n"));
  assert.ok(patch.includes("+    const disclosureLines") === false, "the compact disclosure line itself is not re-added");
});
