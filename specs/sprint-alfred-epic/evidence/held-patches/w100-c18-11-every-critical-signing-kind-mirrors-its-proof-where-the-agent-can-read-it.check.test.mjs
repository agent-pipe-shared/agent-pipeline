// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const patch = join(dirname(fileURLToPath(import.meta.url)),
  "w100-c18-11-every-critical-signing-kind-mirrors-its-proof-where-the-agent-can-read-it.patch");
const ALLOWED = new Set([
  "plugins/pipeline-core/scripts/po-human-approval.mjs",
  "plugins/pipeline-core/scripts/po-human-approval.test.mjs",
  "plugins/pipeline-core/scripts/po-human-approval.signing-handoff.test.mjs",
  "plugins/pipeline-core/scripts/pipeline-state.mjs",
]);

test("the w100 patch exists and is non-empty", () => {
  assert.equal(existsSync(patch), true);
  assert.ok(statSync(patch).size > 0);
});

test("the w100 patch touches only the four named plugin files", () => {
  const files = [...readFileSync(patch, "utf8").matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)];
  assert.ok(files.length > 0);
  for (const [, from, to] of files) {
    assert.equal(from, to);
    assert.ok(ALLOWED.has(to), `unexpected file ${to}`);
  }
  assert.deepEqual(new Set(files.map(match => match[2])), ALLOWED);
});
