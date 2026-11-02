// Check for the w83 held patch: it exists, applies to the repository, and touches only its six files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..", "..", "..");
const PATCH = join(import.meta.dirname, "w83-a18-m2-signing-refused-before-the-prompt-and-push-remedy-named.patch");
const ALLOWED = [
  "plugins/pipeline-core/scripts/po-human-approval.mjs",
  "plugins/pipeline-core/scripts/po-human-approval.test.mjs",
  "plugins/pipeline-core/scripts/push-prepare.mjs",
  "plugins/pipeline-core/scripts/push-prepare.test.mjs",
  "plugins/pipeline-core/config/runner-capabilities.json",
  "plugins/pipeline-core/scripts/runner-capabilities.test.mjs",
];

test("the patch exists and is non-empty", () => {
  assert.ok(existsSync(PATCH));
  assert.ok(readFileSync(PATCH).length > 0);
});

test("the patch applies to the repository root", () => {
  const result = spawnSync("git", ["apply", "--check", PATCH], { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("the patch touches only the named files", () => {
  const touched = [...readFileSync(PATCH, "utf8").matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap(match => [match[1], match[2]]);
  assert.ok(touched.length > 0);
  for (const path of touched) assert.ok(ALLOWED.includes(path), `unexpected file in patch: ${path}`);
});
