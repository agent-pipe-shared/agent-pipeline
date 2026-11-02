import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const here = import.meta.dirname;
const root = resolve(here, "..", "..", "..", "..");
const patch = join(here, "w91-c18-12-the-scope-mismatch-refusal-names-the-required-coverage.patch");
const ALLOWED = [
  "plugins/pipeline-core/lib/architecture-design.mjs",
  "plugins/pipeline-core/lib/architecture-design.test.mjs",
  "plugins/pipeline-core/agents/readiness-reviewer.md",
];

test("the w91 patch exists and is non-empty", () => {
  assert.ok(statSync(patch).size > 0);
});

test("the w91 patch applies to the repository root", () => {
  const result = spawnSync("git", ["apply", "--check", patch], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("the w91 patch touches only the three named files", () => {
  const touched = [...readFileSync(patch, "utf8").matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap(m => [m[1], m[2]]);
  assert.ok(touched.length > 0);
  for (const file of touched) assert.ok(ALLOWED.includes(file), `unexpected file ${file}`);
});
