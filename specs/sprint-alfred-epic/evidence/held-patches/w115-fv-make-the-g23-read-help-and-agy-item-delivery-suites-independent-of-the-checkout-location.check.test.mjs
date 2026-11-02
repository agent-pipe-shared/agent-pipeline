// Held-patch check for w115: the g23-read-help and agy-item-delivery suites no longer depend on the checkout location. It does not run git apply: the patch is a delta on the candidate 19 base.
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PATCH = join(HERE, "w115-fv-make-the-g23-read-help-and-agy-item-delivery-suites-independent-of-the-checkout-location.patch");
const FILES = [
  "plugins/pipeline-core/lib/agy-item-delivery.test.mjs",
  "plugins/pipeline-core/lib/guard/g23-read-help.test.mjs",
];

test("w115: the patch exists and is non-empty", () => {
  assert.ok(existsSync(PATCH), "patch file is missing");
  assert.ok(statSync(PATCH).size > 0, "patch file is empty");
});

test("w115: the patch touches only the two suites", () => {
  const text = readFileSync(PATCH, "utf8");
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0, "patch has no diff header");
  for (const file of files) assert.ok(FILES.includes(file), `patch touches an unexpected file: ${file}`);
  for (const file of FILES) assert.ok(files.includes(file), `patch does not touch ${file}`);
});

test("w115: no assertion is removed or weakened", () => {
  const text = readFileSync(PATCH, "utf8");
  const removed = [...text.matchAll(/^-\s*(?:assert[.\w]*\(|for \(const bad)/gmu)];
  assert.equal(removed.length, 0, "an assertion line is removed");
});

test("w115: the g23 fixture plants its own credential-named file and the agy fixtures stay outside the temp folder", () => {
  const text = readFileSync(PATCH, "utf8");
  assert.match(text, /^\+\s*writeFileSync\(join\(outer, "\.env"\)/mu);
  assert.match(text, /^\+\s*const parent=new URL\('\.\.\/\.\.\/\.\.\/\.\.\/fixtures\/'/mu);
  assert.doesNotMatch(text, /^\+.*tmpdir\(\)/mu);
});
