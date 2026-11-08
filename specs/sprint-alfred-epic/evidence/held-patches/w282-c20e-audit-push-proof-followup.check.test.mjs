// SPDX-License-Identifier: SUL-1.0
// Held-patch check for w282 (C20E-AUDIT-PUSH-PROOF-FOLLOWUP): the patch exists, is non-empty, touches only plugin, harness or doc files,
// and carries the follow-up outcome (the push and release approval proofs reach the remote audit bundle in one evidence-only commit).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patch = readFileSync(join(here, "w282-c20e-audit-push-proof-followup.patch"), "utf8");
const notes = readFileSync(join(here, "w282-c20e-audit-push-proof-followup.notes.md"), "utf8");

test("w282 patch exists, is non-empty and every touched file is under plugins/pipeline-core/, harness/ or a doc the notes name", () => {
  assert.ok(patch.length > 0);
  const files = [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1]);
  assert.ok(files.length > 0);
  for (const file of files) {
    const allowed = file.startsWith("plugins/pipeline-core/") || file.startsWith("harness/") || (file.startsWith("docs/") && notes.includes(file));
    assert.ok(allowed, `outside plugins/pipeline-core/, harness/ and the docs the notes name: ${file}`);
  }
  for (const file of [
    "plugins/pipeline-core/lib/critical-action-authorization.mjs",
    "plugins/pipeline-core/hooks/guard-push.mjs",
    "plugins/pipeline-core/lib/audit-bundle.mjs",
    "plugins/pipeline-core/lib/audit-proof-collection.mjs",
    "plugins/pipeline-core/scripts/release-preflight-cli.mjs",
    "plugins/pipeline-core/hooks/guard-push-release-tag-ancestry.test.mjs",
    "docs/push-release-flow.md",
  ]) {
    assert.ok(files.includes(file), `the patch touches ${file}`);
  }
  assert.ok(!files.includes("plugins/pipeline-core/hooks/guard-push.test.mjs"), "the protected guard-push test is never edited");
});

test("w282 patch carries the follow-up outcome: the writer, the verifier, the guard admission and the cases", () => {
  assert.match(patch, /^\+export function writeAuditProofFollowUp\(/mu, "the follow-up writer");
  assert.match(patch, /^\+export function authorizeAuditProofFollowUp\(/mu, "the guard admission");
  assert.match(patch, /^\+.*armWriterCommitCapability/mu, "the G20-66 commit capability for exactly the written files");
  assert.match(patch, /^\+.*AB-FOLLOWUP/mu, "the bundle verifier checks the follow-up file");
  assert.match(patch, /^\+.*proofs\/follow-up\.json/mu, "the one follow-up list file");
  assert.match(patch, /^\+.*AUDIT-FOLLOWUP-/mu, "typed refusal codes of the admission");
  assert.match(patch, /^\+.*authorizeAuditProofFollowUp/mu);
  assert.match(patch, /^\+.*C20E-AP/mu, "new or restated tests carry the C20E-AP comment");
  assert.match(patch, /^\+.*attribution/imu, "a chat-mode approval is carried as an attribution record");
});

test("w282 notes name the closest criterion, what was not changed and what was not proven", () => {
  assert.match(notes, /AC-108/);
  assert.match(notes, /authorizeAuditProofFollowUp/);
  assert.match(notes, /Not changed/);
  assert.match(notes, /Not proven/);
  assert.match(notes, /docs\/push-release-flow\.md/);
});
