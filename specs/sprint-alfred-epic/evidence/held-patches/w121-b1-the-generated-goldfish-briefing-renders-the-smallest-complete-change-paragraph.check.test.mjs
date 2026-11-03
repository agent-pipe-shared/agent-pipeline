// Held-patch check for w121: the generated Goldfish briefing renders the smallest-complete-change paragraph. The patch applies to the repository on its own.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");
const PATCH = join(HERE, "w121-b1-the-generated-goldfish-briefing-renders-the-smallest-complete-change-paragraph.patch");
const FILES = ["plugins/pipeline-core/lib/dispatch-briefing-build.mjs", "plugins/pipeline-core/scripts/dispatch-briefing.test.mjs"];

test("w121: the patch exists and is non-empty", () => {
  assert.ok(existsSync(PATCH), "patch file is missing");
  assert.ok(statSync(PATCH).size > 0, "patch file is empty");
});

test("w121: git apply --check of the patch against the repository root exits 0", () => {
  const result = spawnSync("git", ["apply", "--check", PATCH], { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("w121: the patch touches only the briefing builder and its examiner", () => {
  const text = readFileSync(PATCH, "utf8");
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0, "patch has no diff header");
  for (const file of files) assert.ok(FILES.includes(file), `patch touches an unexpected file: ${file}`);
});

test("w121: the paragraph is added after the test-first paragraph, no existing line is removed, and it is at most 130 words", () => {
  const text = readFileSync(PATCH, "utf8");
  assert.match(text, /^\+export function smallestChangeParagraph\(pkg\)/mu);
  assert.match(text, /testFirstEvidenceParagraph\(pkg\)\}\$\{smallestChangeParagraph\(pkg\)\}/u);
  const removed = [...text.matchAll(/^-(?!-)(.*)$/gmu)].map((m) => m[1]);
  assert.ok(removed.every((line) => /testFirstEvidenceParagraph\(pkg\)\}$/u.test(line) || line.trim() === ""), `unexpected removed lines: ${removed.join(" | ")}`);
  const body = text.match(/^\+  return `\\n\\nSmallest complete change[^`]*`;$/mu)?.[0] ?? "";
  assert.ok(body.length > 0, "paragraph text not found");
  assert.ok(body.split(/\s+/u).length <= 135, "paragraph too long");
});
