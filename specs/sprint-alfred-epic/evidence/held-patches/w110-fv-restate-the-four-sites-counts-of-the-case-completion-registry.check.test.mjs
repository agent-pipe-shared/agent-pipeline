// Held-patch check for w110: the four sites counts of the case-completion registry. It does not run git apply: the patch is a delta on the applied candidate 18 tree.
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PATCH = join(HERE, "w110-fv-restate-the-four-sites-counts-of-the-case-completion-registry.patch");
const ALLOWED = ["harness/scripts/check-verify-case-completion.test.mjs"];

test("w110: the patch exists and is non-empty", () => {
  assert.ok(existsSync(PATCH), "patch file is missing");
  assert.ok(statSync(PATCH).size > 0, "patch file is empty");
});

test("w110: the patch touches only the registry test", () => {
  const text = readFileSync(PATCH, "utf8");
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0, "patch has no diff header");
  for (const file of files) assert.ok(ALLOWED.includes(file), `patch touches an unexpected file: ${file}`);
});

test("w110: the patch changes exactly the four measured numbers", () => {
  const text = readFileSync(PATCH, "utf8");
  for (const [name, from, to] of [["claude-intake-prompt-capture-tests", 48, 69], ["critic-dispatch-preflight-tests", 389, 406], ["g23-read-help-tests", 20, 36], ["po-human-approval-signing-handoff-tests", 17, 23]]) {
    assert.match(text, new RegExp(`^-\\s*\\["${name}",[^\\n]*"top-level-assertions",${from}\\],$`, "mu"), `${name} old count`);
    assert.match(text, new RegExp(`^\\+\\s*\\["${name}",[^\\n]*"top-level-assertions",${to}\\],$`, "mu"), `${name} new count`);
  }
});
