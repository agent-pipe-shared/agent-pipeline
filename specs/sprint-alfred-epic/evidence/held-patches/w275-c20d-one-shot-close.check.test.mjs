// SPDX-License-Identifier: SUL-1.0
// Held-patch check for w275 (C20D-P3-ONE-SHOT-CLOSE-2): the patch exists, is non-empty, touches only plugin, harness or doc files,
// and carries the P3 outcome (one agent command to the printed commit, signed proofs in the versioned audit bundle).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patch = readFileSync(join(here, "w275-c20d-one-shot-close.patch"), "utf8");
const notes = readFileSync(join(here, "w275-c20d-one-shot-close.notes.md"), "utf8");

test("w275 patch exists, is non-empty and every touched file is under plugins/pipeline-core/, harness/ or a doc the notes name", () => {
  assert.ok(patch.length > 0);
  const files = [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1]);
  assert.ok(files.length > 0);
  for (const file of files) {
    const allowed = file.startsWith("plugins/pipeline-core/") || file.startsWith("harness/") || (file.startsWith("docs/") && notes.includes(file));
    assert.ok(allowed, `outside plugins/pipeline-core/, harness/ and the docs the notes name: ${file}`);
  }
  for (const file of ["plugins/pipeline-core/scripts/finish-feature.mjs", "plugins/pipeline-core/lib/audit-bundle.mjs", "plugins/pipeline-core/lib/audit-proof-collection.mjs", "plugins/pipeline-core/skills/close-feature/SKILL.md"]) {
    assert.ok(files.includes(file), `the patch touches ${file}`);
  }
});

test("w275 patch carries the P3 outcome: the one-shot driver with typed stops, the proofs in the bundle and its verifier, the skill lead", () => {
  assert.match(patch, /^\+export function oneShotClose\(/mu, "the one command");
  assert.match(patch, /^\+.*--one-shot/mu, "the CLI branch");
  assert.match(patch, /^\+.*ONESHOT-CRITIC-PACKET-MISSING/mu);
  assert.match(patch, /^\+.*ONESHOT-VERIFY-RED/mu);
  assert.match(patch, /^\+.*armWriterCommitCapability/mu, "the G20-66 commit capability");
  assert.match(patch, /^\+export function collectAuditProofs\(/mu, "the proof collection");
  assert.match(patch, /^\+.*proofs/mu, "the bundle carries proofs/");
  assert.match(patch, /^\+.*AB-PROOF-SIGNATURE/mu, "the verifier checks the signature");
  assert.match(patch, /^\+.*AB-DIGEST/mu, "the verifier checks the digest");
  assert.match(patch, /^\+.*P3/mu, "new or restated tests carry the P3 comment");
  assert.match(patch, /^\+Start here: the one command|^\+## Start here: the one command/mu, "the skill leads with the one command");
});

test("w275 notes name the closest criterion, what was not changed and what was not proven", () => {
  assert.match(notes, /AC-108/);
  assert.match(notes, /oneShotClose/);
  assert.match(notes, /Not changed/);
  assert.match(notes, /Not proven/);
});
