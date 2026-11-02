// Held-patch check for w105 (C18-21, AC-262): the signing-preparation parity audit is a docs-only delta.
// It does not run git apply: the patch is a delta on top of the held patches w83 and w100.
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PATCH = join(HERE, "w105-c18-21-signing-preparation-parity-audit-across-the-runners.patch");
const ALLOWED = ["specs/sprint-alfred-epic/plans/candidate-18-drafts/signing-parity-audit-2026-11-02.md"];

test("w105: the patch exists and is non-empty", () => {
  assert.ok(existsSync(PATCH), "patch file is missing");
  assert.ok(statSync(PATCH).size > 0, "patch file is empty");
});

test("w105: the patch touches only the audit document", () => {
  const text = readFileSync(PATCH, "utf8");
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0, "patch has no diff header");
  for (const file of files) assert.ok(ALLOWED.includes(file), `patch touches an unexpected file: ${file}`);
});
