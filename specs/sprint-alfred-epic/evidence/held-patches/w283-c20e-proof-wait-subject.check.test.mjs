// SPDX-License-Identifier: SUL-1.0
// Held-patch check for w283 (C20E-G2076-PROOF-WAIT-SUBJECT): the patch exists, is non-empty, touches only plugin files, and carries the
// G20-76 outcome (the signature wait counts a scratch proof as present only when its mirrored request carries the expected subject).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patch = readFileSync(join(here, "w283-c20e-proof-wait-subject.patch"), "utf8");
const notes = readFileSync(join(here, "w283-c20e-proof-wait-subject.notes.md"), "utf8");
const files = [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1]);

test("w283 patch exists, is non-empty and every touched file is under plugins/pipeline-core/ or an allowed docs/ file the notes name", () => {
  assert.ok(patch.length > 0);
  assert.ok(files.length > 0);
  for (const file of files) {
    const allowed = file.startsWith("plugins/pipeline-core/") || (file.startsWith("docs/") && notes.includes(file));
    assert.ok(allowed, `outside plugins/pipeline-core/ (docs only when the notes name them): ${file}`);
  }
  for (const file of [
    "plugins/pipeline-core/lib/signed-proof-wait.mjs",
    "plugins/pipeline-core/scripts/proof-wait.mjs",
    "plugins/pipeline-core/scripts/push-prepare.mjs",
    "plugins/pipeline-core/lib/guard/command-catalogue.mjs",
    "plugins/pipeline-core/scripts/push-prepare.test.mjs",
    "plugins/pipeline-core/lib/pins/three-runner-happy-path-with-two-po-approvals.test.mjs",
  ]) assert.ok(files.includes(file), `the patch must change ${file}`);
});

test("w283 patch carries the subject-bound wait, its typed stale refusal and the shell grammar admission", () => {
  assert.match(patch, /^\+.*PROOF-WAIT-STALE/mu, "a timeout where an older mirror sat at the path ends in the new typed code");
  assert.match(patch, /^\+.*--subject/mu, "the flag is emitted, parsed and admitted");
  assert.match(patch, /^\+.*subjectSha256/mu);
  assert.match(patch, /^\+.*CRITICAL_ACTION_APPROVAL_REQUEST_SCHEMA/mu, "the request schema is read from its owner, not spelled a second time");
  assert.match(patch, /^\+.*intentSha256/mu, "the proof must sign the matching request's own intent");
  assert.match(patch, /^\+.*sanctionedProofWaitArgs|^\+.*\[a-f0-9\]\{64\}/mu);
  assert.match(patch, /^\+.*G20-76/mu);
});

test("w283 patch restates no existing assertion: no assertion or case line is removed", () => {
  const removedAssertions = [...patch.matchAll(/^-\s*(?:assert\.|test\()/gmu)];
  assert.equal(removedAssertions.length, 0, "an existing assertion or case was removed or weakened");
});

test("w283 notes name the call-site audit and the interim hint", () => {
  for (const site of ["push-prepare", "pipeline-state", "project-onboarding-v3", "human-guard-override"]) assert.ok(notes.includes(site), `the audit names ${site}`);
  assert.match(notes, /set .*scratch\/critical-\*.* aside/iu, "the interim hint is stated");
});
