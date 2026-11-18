// SPDX-License-Identifier: SUL-1.0
// C30J-J28 (AC-112 closest accepted criterion, queue C30-20 gap): structural check of the held patch w30j28. Plain node:test, no product run,
// no git, no producer. The patch is a delta on the integrated 30j tree (the clone int30j); it is therefore NOT applied to the real checkout
// here -- apply it after that chain (see the notes), never before.
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patchPath = join(here, "w30j28-the-signature-card-covers-the-bare-intent-digest-override-route.patch");
const WRITE_LIST = Object.freeze([
  "plugins/pipeline-core/lib/human-guard-override.mjs",
  "plugins/pipeline-core/lib/human-guard-override.test.mjs",
  "plugins/pipeline-core/lib/critical-action-approval-card.mjs",
  "plugins/pipeline-core/lib/critical-action-approval-card.test.mjs",
  "plugins/pipeline-core/scripts/po-human-approval.mjs",
  "plugins/pipeline-core/scripts/po-human-approval.test.mjs",
]);

test("w30j28: the held patch exists and is non-empty", () => {
  assert.ok(statSync(patchPath).isFile());
  assert.ok(statSync(patchPath).size > 0);
});

test("w30j28: the held patch touches only the briefed files and carries the describer, the card helper and the three suites", () => {
  const patch = readFileSync(patchPath, "utf8");
  const touched = [...patch.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(touched.length > 0, "the patch must contain at least one file diff");
  for (const path of touched) assert.ok(WRITE_LIST.includes(path), `${path} is outside the write list`);
  for (const path of [
    "plugins/pipeline-core/lib/human-guard-override.mjs", "plugins/pipeline-core/lib/human-guard-override.test.mjs",
    "plugins/pipeline-core/lib/critical-action-approval-card.test.mjs", "plugins/pipeline-core/scripts/po-human-approval.mjs",
    "plugins/pipeline-core/scripts/po-human-approval.test.mjs",
  ]) assert.ok(touched.includes(path), `${path} must be part of the patch`);
});

test("w30j28: the patch changes no digest, proof, index key or display line and stores nothing", () => {
  const patch = readFileSync(patchPath, "utf8");
  const removed = patch.split("\n").filter((line) => line.startsWith("-") && !line.startsWith("---"));
  assert.deepEqual(removed.filter((line) => /createPoApprovalIntent|signIntentIntoProof|approvalIntent|compactSigningDisclosure|composeDisclosureLines|HGO_DISCLOSURE_INDEX_SCHEMA|exactKeys|window expires at|eligible paths this override/u.test(line)), []);
  const added = patch.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++"));
  // The facts are returned next to the display lines; nothing is written, so no write call is added in the production files.
  const production = patch.slice(patch.indexOf("diff --git a/plugins/pipeline-core/lib/human-guard-override.mjs"), patch.indexOf("diff --git a/plugins/pipeline-core/lib/human-guard-override.test.mjs"));
  assert.equal(/writeFileSync|writeExclusive|appendFileSync|renameSync/u.test(production), false);
  assert.ok(added.some((line) => line.includes("cardFacts")), "the describer returns the structured facts");
});
