// SPDX-License-Identifier: SUL-1.0
// w30d1 C30D-G1: the one-shot close runs the Result bootstrap itself when it needs agent authority only (held patch). Plain node:test, no product run, no git apply:
// the patch is a delta on the 30d chain, so it applies to the repository only after that chain (see the notes file). The held patch exists, is non-empty and
// touches only the one-shot close driver and its test (AC-108).
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patchPath = join(here, "w30d1-the-one-shot-close-binds-the-result-itself.patch");
const ALLOWED = new Set(["plugins/pipeline-core/scripts/finish-feature.mjs", "plugins/pipeline-core/scripts/finish-feature.test.mjs"]);

test("w30d1 the held patch exists and is not empty", () => {
  assert.equal(existsSync(patchPath), true, "the held patch is missing");
  assert.ok(statSync(patchPath).size > 0, "the held patch is empty");
});

test("w30d1 the held patch touches only finish-feature.mjs and its test", () => {
  const text = readFileSync(patchPath, "utf8");
  const touched = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(touched.length > 0, "the patch names no file");
  for (const path of touched) assert.ok(ALLOWED.has(path), `${path} is outside the two files the change owns`);
  assert.ok(touched.includes("plugins/pipeline-core/scripts/finish-feature.mjs"), "the driver is not part of the patch");
  assert.ok(touched.includes("plugins/pipeline-core/scripts/finish-feature.test.mjs"), "the test is not part of the patch");
});
