// SPDX-License-Identifier: SUL-1.0
// C19I-W236-ADMIT check: the held patch exists, is non-empty and touches only plugins/pipeline-core/hooks/ and plugins/pipeline-core/lib/.
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";

const patchPath = new URL("./w236-every-admission-registry-entry-waits-for-a-sibling-lock-within-the-admission-deadline.patch", import.meta.url);

test("the w236 held patch exists, is non-empty and touches only the plugin hooks and lib", { timeout: 60000 }, () => {
  assert.ok(statSync(patchPath).size > 0, "the patch is non-empty");
  const touched = [...readFileSync(patchPath, "utf8").matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(touched.length > 0, "the patch names at least one file");
  for (const path of touched) assert.match(path, /^plugins\/pipeline-core\/(hooks|lib)\//u, `${path} is outside plugins/pipeline-core/hooks/ and plugins/pipeline-core/lib/`);
});
