// SPDX-License-Identifier: SUL-1.0
// Held-patch check for w274 (C20D-G2066-WRITER-COMMIT): the patch exists, is non-empty, touches only plugin, harness or doc files,
// and carries the G20-66 outcome (a sanctioned writer arms the commit of exactly the protected bytes it wrote; the hook admits them).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patch = readFileSync(join(here, "w274-c20d-writer-commit.patch"), "utf8");
const notes = readFileSync(join(here, "w274-c20d-writer-commit.notes.md"), "utf8");

test("w274 patch exists, is non-empty and every touched file is under plugins/pipeline-core/, harness/ or a doc the notes name", () => {
  assert.ok(patch.length > 0);
  const files = [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1]);
  assert.ok(files.length > 0);
  for (const file of files) {
    const allowed = file.startsWith("plugins/pipeline-core/") || file.startsWith("harness/") || (file.startsWith("docs/") && notes.includes(file));
    assert.ok(allowed, `outside plugins/pipeline-core/, harness/ and the docs the notes name: ${file}`);
  }
  assert.ok(files.includes("plugins/pipeline-core/lib/writer-commit-capability.mjs"), "the shared mechanism");
  assert.ok(files.includes("plugins/pipeline-core/lib/protected-test-paths.mjs"), "the hook-side admission");
  assert.ok(files.includes("plugins/pipeline-core/scripts/pre-commit-hook-install.mjs"), "the hook consumes the capability");
  assert.ok(files.includes("plugins/pipeline-core/scripts/pipeline-state.mjs"), "approve-plan and close-feature arm it");
  assert.ok(files.includes("plugins/pipeline-core/scripts/finish-feature.mjs"), "every finish-feature stage arms it");
});

test("w274 patch carries the G20-66 mechanism: stable entry point, hook admission, stale repair naming the writer rerun, wired writers", () => {
  assert.match(patch, /^\+export function armWriterCommitCapability\(/mu, "the entry point the one-shot close calls");
  assert.match(patch, /^\+export function writerCommitAdmission\(/mu);
  assert.match(patch, /^\+.*PB-WRITER-COMMIT-STALE/mu);
  assert.match(patch, /^\+.*WRITER_COMMIT_COMMANDS/mu);
  assert.match(patch, /^\+.*"approve-plan", "close-feature"/mu);
  assert.match(patch, /^\+.*G20-66/mu, "tests that pinned the old refusal or the new cases carry the G20-66 comment");
});

test("w274 notes name the entry point and the closest criterion", () => {
  assert.match(notes, /armWriterCommitCapability/);
  assert.match(notes, /AC-108/);
  assert.match(notes, /Not changed/);
  assert.match(notes, /Not proven/);
});
