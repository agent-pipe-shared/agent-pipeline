// Held-patch check for w108: registration of the four suites added by candidate 18 and the vendored operating-model refresh.
// It does not run git apply: the patch is a delta on the end of the candidate 18 chain (w74 .. w106, w107, w104).
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PATCH = join(HERE, "w108-register-the-four-new-suites-and-refresh-the-vendored-operating-model-copy.patch");
const ALLOWED = [
  "docs/product-capability-inventory.json",
  "harness/verify-suites.json",
  "plugins/pipeline-core/docs/operating-model.md",
];
const SUITES = [
  "agy-native-implementation-admission-tests",
  "close-quality-readback-tests",
  "session-authority-registry-fsync-tests",
  "goldfish-host-commit-recover-tests",
];

test("w108: the patch exists and is non-empty", () => {
  assert.ok(existsSync(PATCH), "patch file is missing");
  assert.ok(statSync(PATCH).size > 0, "patch file is empty");
});

test("w108: the patch touches only the registry, the inventory and the vendored copy", () => {
  const text = readFileSync(PATCH, "utf8");
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0, "patch has no diff header");
  for (const file of files) assert.ok(ALLOWED.includes(file), `patch touches an unexpected file: ${file}`);
});

test("w108: every new suite is registered in the verify list and the inventory", () => {
  const text = readFileSync(PATCH, "utf8");
  for (const name of SUITES) {
    assert.match(text, new RegExp(`"name": "${name}"`, "u"), `${name} is not registered in verify-suites.json`);
    assert.match(text, new RegExp(`verify-phase:harness/scripts/verify\\.mjs:${name}"`, "u"), `${name} is not in the inventory`);
  }
});
