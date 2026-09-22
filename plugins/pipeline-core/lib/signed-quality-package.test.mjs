import test from "node:test";
import assert from "node:assert";
import { applyQualityPackage } from "./signed-quality-package.mjs";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";

test("signed-quality-package negative matrix", (t) => {
  const repo = mkdtempSync(join(tmpdir(), "repo-"));
  mkdirSync(join(repo, ".git"));
  
  const intent = {
    schema: "pipeline.signed-quality-package.v1",
    baseCommit: "dummy",
    unifiedDiff: "--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-a\n+b\n",
    expectedDigests: { "a.txt": "expected-sha" }
  };
  
  // Test invalid schema
  const invalidIntent = { ...intent, schema: "invalid" };
  assert.throws(() => applyQualityPackage(repo, invalidIntent), /Invalid schema/);
});
