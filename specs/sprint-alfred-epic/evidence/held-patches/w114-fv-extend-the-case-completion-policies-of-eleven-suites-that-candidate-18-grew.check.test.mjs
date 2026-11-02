// Held-patch check for w114: the case-completion policies of eleven suites that candidate 18 grew. It does not run git apply: the patch is a delta on the applied candidate 18 tree.
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PATCH = join(HERE, "w114-fv-extend-the-case-completion-policies-of-eleven-suites-that-candidate-18-grew.patch");
const ONLY = "harness/config/verify-case-completion-augmentations.v1.json";
const SUITES = [
  "agy-host-commit-admission-tests",
  "agy-host-commit-execution-tests",
  "commit-message-policy-tests",
  "dispatch-record-write-tests",
  "native-goldfish-host-return-tests",
  "claude-intake-prompt-capture-tests",
  "po-human-approval-signing-handoff-tests",
  "guard-dispatch-tests",
  "critic-course-admission-tests",
  "critic-dispatch-preflight-tests",
  "native-goldfish-host-finalizer-tests",
];

test("w114: the patch exists and is non-empty", () => {
  assert.ok(existsSync(PATCH), "patch file is missing");
  assert.ok(statSync(PATCH).size > 0, "patch file is empty");
});

test("w114: the patch touches only the augmentation file", () => {
  const text = readFileSync(PATCH, "utf8");
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0, "patch has no diff header");
  for (const file of files) assert.equal(file, ONLY, `patch touches an unexpected file: ${file}`);
});

test("w114: the patch only extends policies (every removed case id line comes back)", () => {
  const text = readFileSync(PATCH, "utf8");
  const ids = (sign) => [...text.matchAll(new RegExp(`^[${sign}]\\s+"([A-Z]{2,6}\\d{2,3})",?$`, "gmu"))].map((m) => m[1]);
  const added = new Set(ids("+"));
  for (const id of ids("-")) assert.ok(added.has(id), `case id ${id} is removed`);
});

test("w114: the patch names no suite outside the eleven", () => {
  const text = readFileSync(PATCH, "utf8");
  const names = [...text.matchAll(/^\+\s+"name": "([^"]+)"/gmu)].map((m) => m[1]);
  for (const name of names) assert.ok(SUITES.includes(name), `new row for an unexpected suite: ${name}`);
});
