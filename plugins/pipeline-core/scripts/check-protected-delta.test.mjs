// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { checkProtectedDelta } from "./check-protected-delta.mjs";

function gitFor(paths) {
  return (_root, args) => {
    if (args[0] === "diff") return `${paths.join("\0")}\0`;
    if (args[0] === "rev-parse" && args[1].endsWith("^{tree}")) return "b".repeat(40);
    if (args[0] === "rev-parse") return "a".repeat(40);
    throw new Error("unexpected git invocation");
  };
}

test("A3 candidate delta binds baseline identity and reports protected changes", () => {
  const result = checkProtectedDelta({ rootDir: process.cwd(), base: "base", candidate: "candidate", gitFn: gitFor(["plugins/pipeline-core/lib/protected-baseline.mjs", "README.md"]) });
  assert.equal(result.status, "protected-delta");
  assert.equal(result.ok, false);
  assert.equal(result.protectedPaths[0].ruleId, "PB-BASELINE-LOADER");
  assert.equal(result.candidate.commit, "a".repeat(40));
  assert.ok(result.baseline.identity.mergedDigest);
});

test("A3 candidate delta passes ordinary unprotected paths", () => {
  const result = checkProtectedDelta({ rootDir: process.cwd(), gitFn: gitFor(["README.md"]) });
  assert.equal(result.status, "pass");
  assert.equal(result.ok, true);
  assert.deepEqual(result.protectedPaths, []);
});
