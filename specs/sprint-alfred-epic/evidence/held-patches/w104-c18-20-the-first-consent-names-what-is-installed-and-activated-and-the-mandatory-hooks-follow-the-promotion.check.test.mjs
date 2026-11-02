// w104 held-patch check: the patch exists, applies to the repository HEAD and touches only the named files.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

const here = import.meta.dirname;
const root = resolve(here, "..", "..", "..", "..");
const patch = join(here, "w104-c18-20-the-first-consent-names-what-is-installed-and-activated-and-the-mandatory-hooks-follow-the-promotion.patch");
const allowed = new Set([
  "plugins/pipeline-core/skills/pipeline-start/SKILL.md",
  "docs/operating-model.md",
  "plugins/pipeline-core/scripts/project-onboarding-v3.mjs",
  "plugins/pipeline-core/lib/project-onboarding-v3.mjs",
  "plugins/pipeline-core/lib/onboarding-continuity.mjs",
  "plugins/pipeline-core/scripts/project-onboarding-v3-argv-closure.test.mjs",
]);

test("the patch exists and is non-empty", () => {
  assert.equal(existsSync(patch), true);
  assert.ok(statSync(patch).size > 0);
});

test("git apply --check of the patch against the repository root exits 0", () => {
  const result = spawnSync("git", ["apply", "--check", patch], { cwd: root, encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
});

test("the patch touches only the named files", () => {
  const files = [...readFileSync(patch, "utf8").matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)]
    .flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0);
  for (const file of files) assert.ok(allowed.has(file), `unexpected file in patch: ${file}`);
});
