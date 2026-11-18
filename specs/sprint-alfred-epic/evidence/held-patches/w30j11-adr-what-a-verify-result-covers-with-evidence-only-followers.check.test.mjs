// Check for held patch w30j11: ADR draft on what a Verify result covers (document only).
// Plain node:test, no producer or product run, no git apply against the repository
// (the patch is a delta on the integrated 30i tree; the notes state the order).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const patchPath = join(here, "w30j11-adr-what-a-verify-result-covers-with-evidence-only-followers.patch");
const ALLOWED = new Set([
  "docs/adr/0104-an-evidence-only-follower-commit-and-what-a-verify-result-covers.md",
  "docs/adr/README.md",
]);

test("the patch exists and is non-empty", () => {
  assert.ok(existsSync(patchPath), "patch file missing");
  assert.ok(statSync(patchPath).size > 0, "patch file empty");
});

test("the patch touches only the ADR and its index row", () => {
  const text = readFileSync(patchPath, "utf8");
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0, "no file in patch");
  for (const f of files) assert.ok(ALLOWED.has(f), `file outside the write list: ${f}`);
  assert.ok(files.includes("docs/adr/0104-an-evidence-only-follower-commit-and-what-a-verify-result-covers.md"));
  assert.ok(files.includes("docs/adr/README.md"));
});

test("the ADR is proposed, not accepted, and states both options and the invariants", () => {
  const text = readFileSync(patchPath, "utf8");
  assert.match(text, /\+\*\*Status:\*\* proposed/);
  assert.match(text, /Option A/);
  assert.match(text, /Option B/);
  assert.match(text, /Invariants/);
  assert.match(text, /Rollback/);
});
