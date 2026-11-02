// Held-patch check for w116: the draft inspection refuses an uncovered design scope before the PO signs. It does not run git apply: the patch is a delta on the candidate 19 base.
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PATCH = join(HERE, "w116-c18-12-the-draft-inspection-refuses-an-uncovered-design-scope-before-the-po-signs.patch");
const FILES = [
  "plugins/pipeline-core/lib/architecture-design.mjs",
  "plugins/pipeline-core/lib/architecture-design.test.mjs",
];

test("w116: the patch exists and is non-empty", () => {
  assert.ok(existsSync(PATCH), "patch file is missing");
  assert.ok(statSync(PATCH).size > 0, "patch file is empty");
});

test("w116: the patch touches only the design module and its test", () => {
  const text = readFileSync(PATCH, "utf8");
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0, "patch has no diff header");
  for (const file of files) assert.ok(FILES.includes(file), `patch touches an unexpected file: ${file}`);
  for (const file of FILES) assert.ok(files.includes(file), `patch does not touch ${file}`);
});

test("w116: the draft inspection calls the shared scope rule and the code and field stay", () => {
  const text = readFileSync(PATCH, "utf8");
  assert.match(text, /^\+function requireScopeCoverage\(input, planPath, taskScope\)/mu);
  assert.match(text, /^\+\s*requireScopeCoverage\(design, planPath, null\);/mu);
  assert.match(text, /ARCHITECTURE-DESIGN-SCOPE-MISMATCH/u);
  assert.match(text, /"disposition\.scope"/u);
});

test("w116: no assertion is removed", () => {
  const text = readFileSync(PATCH, "utf8");
  assert.equal([...text.matchAll(/^-\s*(?:assert[.\w]*\()/gmu)].length, 0, "an assertion line is removed");
});
