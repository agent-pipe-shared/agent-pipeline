// SPDX-License-Identifier: SUL-1.0
// Check for the held patch w255-c20-agy-native-goldfish.patch (C20-G208B-AGY-NATIVE, AC-108): the patch exists, is not empty, and touches
// only the plugin surfaces the slice may change. The behaviour itself is pinned by the new suite the patch adds
// (plugins/pipeline-core/lib/pins/antigravity-native-goldfish-dispatch-needs-consent-and-has-no-parent-binding.test.mjs); this check runs no
// product code and calls no model.
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const patchPath = join(dirname(fileURLToPath(import.meta.url)), "w255-c20-agy-native-goldfish.patch");
const ALLOWED = [
  "plugins/pipeline-core/lib/",
  "plugins/pipeline-core/hooks/",
  "plugins/pipeline-core/scripts/",
  "plugins/pipeline-core/config/",
  "plugins/pipeline-core/skills/pipeline-start/references/",
];

test("the held patch exists and is not empty", () => {
  assert.ok(statSync(patchPath).isFile());
  assert.ok(statSync(patchPath).size > 0);
});

test("every file the patch touches is under lib/, hooks/, scripts/, config/ or skills/pipeline-start/references/", () => {
  const text = readFileSync(patchPath, "utf8");
  const touched = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(touched.length > 0, "the patch lists no file");
  for (const path of touched) {
    assert.ok(ALLOWED.some((prefix) => path.startsWith(prefix)), `${path} is outside the permitted plugin surfaces`);
  }
});

test("the patch adds the native Goldfish module and its pin", () => {
  const text = readFileSync(patchPath, "utf8");
  assert.match(text, /^\+\+\+ b\/plugins\/pipeline-core\/lib\/agy-native-goldfish\.mjs$/mu);
  assert.match(text, /^\+\+\+ b\/plugins\/pipeline-core\/lib\/pins\/antigravity-native-goldfish-dispatch-[^\n]*\.test\.mjs$/mu);
});
