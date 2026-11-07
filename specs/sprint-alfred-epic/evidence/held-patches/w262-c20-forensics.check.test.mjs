// SPDX-License-Identifier: SUL-1.0
// Held-patch check for w262 (C20-G2031-FORENSICS): the patch exists, is non-empty, touches only plugin files and carries the page cursor,
// the windowed read, the metadataComplete/eventsComplete split and the guard admission of the new flags.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patch = readFileSync(join(here, "w262-c20-forensics.patch"), "utf8");

test("w262 patch exists, is non-empty and every touched file is under plugins/pipeline-core/", () => {
  assert.ok(patch.length > 0);
  const files = [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1]);
  assert.ok(files.length > 0);
  for (const file of files) assert.ok(file.startsWith("plugins/pipeline-core/"), `outside plugins/pipeline-core/: ${file}`);
  for (const needed of [
    "plugins/pipeline-core/scripts/runner-transcript-recovery.mjs",
    "plugins/pipeline-core/scripts/runner-transcript-recovery.test.mjs",
    "plugins/pipeline-core/lib/guard/sanctioned-args-scripts.mjs",
    "plugins/pipeline-core/lib/pins/catalogue-admit-prescribed-lifecycle-verbs.test.mjs",
  ]) assert.ok(files.includes(needed), needed);
});

test("w262 patch carries pagination, the windowed read, the completeness split and the turn counters", () => {
  for (const needle of [
    "readRunnerTranscriptWindow", "invalid-cursor", "cursor-stale", "nextCall", "metadataComplete", "eventsComplete",
    "--page-size", "--window-bytes", "endTimestamp", "toolCallCount",
  ]) assert.ok(patch.includes(needle), needle);
});
