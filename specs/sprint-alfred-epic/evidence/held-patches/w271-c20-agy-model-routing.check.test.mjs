// SPDX-License-Identifier: SUL-1.0
// Held-patch check for w271 (C20-G2043-AGY-MODEL-ROUTING): the patch exists, is non-empty, touches only plugin or harness files, and
// carries the G20-43 outcome (a mismatching native child model is recorded and noticed, never denied; the routing cells).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patch = readFileSync(join(here, "w271-c20-agy-model-routing.patch"), "utf8");

test("w271 patch exists, is non-empty and every touched file is under plugins/pipeline-core/ or harness/", () => {
  assert.ok(patch.length > 0);
  const files = [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1]);
  assert.ok(files.length > 0);
  for (const file of files) assert.ok(file.startsWith("plugins/pipeline-core/") || file.startsWith("harness/"), `outside plugins/pipeline-core/ and harness/: ${file}`);
  assert.ok(files.includes("plugins/pipeline-core/lib/agy-native-goldfish.mjs"));
  assert.ok(files.includes("plugins/pipeline-core/config/runner-profiles-v3.json"));
});

test("w271 patch no longer denies a native child for a model mismatch, records it and routes the roles", () => {
  assert.doesNotMatch(patch, /^\+.*return deny\("AGY-NATIVE-CHILD-MODEL-MISMATCH"/mu, "the model mismatch is no longer a denial");
  assert.match(patch, /^\+.*AGY-NATIVE-CHILD-MODEL-NOTICE/mu);
  assert.match(patch, /^\+.*agy-native-child-model-mismatch/mu);
  assert.match(patch, /^\+.*"value": "gemini-3\.8-flash-low"/mu, "mechanic is flash low");
  assert.match(patch, /^\+.*"duty\.deep": "flash"/mu);
  assert.match(patch, /^\+.*"duty\.critic_normal": "inherit"/mu);
});
