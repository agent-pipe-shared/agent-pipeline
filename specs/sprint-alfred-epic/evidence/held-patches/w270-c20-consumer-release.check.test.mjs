// SPDX-License-Identifier: SUL-1.0
// Held-patch check for w270 (C20-G2042-CONSUMER-RELEASE): the patch exists, is non-empty and touches only plugin or harness files
// (plus the docs files the notes name), and it carries the end-to-end close-path walk extended to the consumer release.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patch = readFileSync(join(here, "w270-c20-consumer-release.patch"), "utf8");
const notes = readFileSync(join(here, "w270-c20-consumer-release.notes.md"), "utf8");

test("w270 patch exists, is non-empty and every touched file is under plugins/pipeline-core/ or harness/ or a docs file the notes name", () => {
  assert.ok(patch.length > 0);
  const files = [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1]);
  assert.ok(files.length > 0);
  for (const file of files) {
    const allowed = file.startsWith("plugins/pipeline-core/") || file.startsWith("harness/") || (file.startsWith("docs/") && notes.includes(file));
    assert.ok(allowed, `outside plugins/pipeline-core/ and harness/ and not a docs file the notes name: ${file}`);
  }
  assert.ok(files.includes("plugins/pipeline-core/scripts/close-path-e2e.test.mjs"), "the end-to-end walk test is part of the patch");
  assert.ok(files.includes("plugins/pipeline-core/scripts/release-preflight-cli.mjs"), "the consumer mode of the release preflight is part of the patch");
});

test("w270 patch walks the consumer release to the pushed version tag", () => {
  assert.match(patch, /RPC-CONSUMER-NOT-PUSHED/u);
  assert.match(patch, /refs\/tags\/\$\{tag\}/u);
  assert.match(patch, /authorizeRecordedReleaseTag/u);
});
