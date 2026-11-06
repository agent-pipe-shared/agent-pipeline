// SPDX-License-Identifier: SUL-1.0
// Plain node:test check for the held patch w237 (the SubagentStop reads under the read scope and holds the registry lock only for its writes).
// It asserts only that the patch exists, is non-empty and touches nothing outside plugins/pipeline-core/hooks/ and plugins/pipeline-core/lib/;
// it runs no product code.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const PATCH = new URL("./w237-the-subagent-stop-reads-under-the-read-scope-and-holds-the-registry-lock-only-for-its-writes.patch", import.meta.url);
const ALLOWED = [
  "plugins/pipeline-core/hooks/",
  "plugins/pipeline-core/lib/",
];

test("w237 patch exists, is non-empty and carries a diff", () => {
  const text = readFileSync(PATCH, "utf8");
  assert.ok(text.length > 0, "the patch is not empty");
  assert.match(text, /^diff --git /mu, "the patch holds at least one file diff");
});

test("w237 patch touches only plugins/pipeline-core/hooks/ and plugins/pipeline-core/lib/", () => {
  const text = readFileSync(PATCH, "utf8");
  const paths = new Set();
  for (const match of text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)) { paths.add(match[1]); paths.add(match[2]); }
  assert.ok(paths.size > 0, "the patch names at least one path");
  for (const path of paths) {
    assert.ok(ALLOWED.some((prefix) => path.startsWith(prefix)), `${path} is inside the briefed scope`);
    assert.equal(path.includes(".."), false, `${path} stays inside the repository`);
  }
});
