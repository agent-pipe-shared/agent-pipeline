// SPDX-License-Identifier: SUL-1.0
// Purpose: write the standard held-patch check test (patch exists, applies to the repository HEAD, touches only the named files) next to a held patch.
// The route runs this from scratch/agent-out/ like the other clone-slice tools (copy it there on a fresh machine).
// Usage: node scratch/agent-out/mk-check.mjs <held patch stem without .patch> <comma separated allowed repo-relative paths> "<one line subject>"
// Writes: specs/sprint-alfred-epic/evidence/held-patches/<stem>.check.test.mjs
import { writeFileSync } from "node:fs";
const [stem, allowed, subject] = process.argv.slice(2);
if (!stem || !allowed || !subject) { console.error("usage: mk-check.mjs <stem> <allowed,paths> <subject>"); process.exit(2); }
const set = allowed.split(",").map((path) => `  ${JSON.stringify(path.trim())},`).join("\n");
const text = `// SPDX-License-Identifier: SUL-1.0
// Held-patch check (${subject}): the patch exists, applies to the repository HEAD and touches only the named files.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

const REPO = resolve(import.meta.dirname, "..", "..", "..", "..");
const PATCH = join(import.meta.dirname, ${JSON.stringify(`${stem}.patch`)});
const ALLOWED = new Set([
${set}
]);

test("the patch exists and is non-empty", () => {
  assert.ok(existsSync(PATCH));
  assert.ok(statSync(PATCH).size > 0);
});

test("git apply --check of the patch against the repository root exits 0", () => {
  const result = spawnSync("git", ["apply", "--check", PATCH], { cwd: REPO, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("the patch touches only the named files", () => {
  const result = spawnSync("git", ["apply", "--numstat", PATCH], { cwd: REPO, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const touched = result.stdout.split("\\n").filter(Boolean).map((line) => line.split("\\t")[2]);
  assert.ok(touched.length > 0);
  for (const path of touched) assert.ok(ALLOWED.has(path), \`unexpected path \${path}\`);
});
`;
writeFileSync(`specs/sprint-alfred-epic/evidence/held-patches/${stem}.check.test.mjs`, text);
console.log(`wrote ${stem}.check.test.mjs`);
