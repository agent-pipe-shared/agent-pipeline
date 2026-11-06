// SPDX-License-Identifier: SUL-1.0
// C19K-W246: the held patch exists, is non-empty and touches only plugins/pipeline-core/hooks/ and plugins/pipeline-core/lib/.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const patch = readFileSync(new URL("./w246-a-stop-lands-its-host-commit-after-any-disjoint-advance-of-head-including-during-its-terminal-prepare.patch", import.meta.url), "utf8");

test("the w246 held patch is non-empty and touches only plugins/pipeline-core/hooks/ and lib/", { timeout: 60000 }, () => {
  assert.ok(patch.length > 0, "the patch is not empty");
  const files = [...patch.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(files.length > 0, "the patch names at least one file");
  for (const file of files) assert.ok(/^plugins\/pipeline-core\/(hooks|lib)\//u.test(file), `out-of-scope path in the patch: ${file}`);
});
