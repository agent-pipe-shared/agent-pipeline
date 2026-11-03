// Held-patch check for w120: Goldfish rule GF-10 and the Critic search item "unrequested addition". The patch is independent of the other candidate 19 patches (git apply --check on the repository).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");
const PATCH = join(HERE, "w120-b1-the-goldfish-rule-gf-10-and-the-critic-search-item-unrequested-addition.patch");
const ALLOWED = new Set(["roles/goldfish.md", "roles/critic.md", "plugins/pipeline-core/roles/goldfish.md", "plugins/pipeline-core/roles/critic.md"]);

test("w120: the patch exists and is non-empty", () => {
  assert.ok(existsSync(PATCH), "patch file is missing");
  assert.ok(statSync(PATCH).size > 0, "patch file is empty");
});

test("w120: git apply --check of the patch against the repository root exits 0", () => {
  const result = spawnSync("git", ["apply", "--check", PATCH], { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("w120: the patch touches only the two role files and their vendored copies", () => {
  const text = readFileSync(PATCH, "utf8");
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0, "patch has no diff header");
  for (const file of files) assert.ok(ALLOWED.has(file), `patch touches an unexpected file: ${file}`);
});

test("w120: the patch adds GF-10 and the Critic item and removes no existing line of the roles", () => {
  const text = readFileSync(PATCH, "utf8");
  assert.match(text, /^\+### GF-10 \(MUST\) — The smallest complete change/mu);
  assert.match(text, /^\+.*unrequested addition/mu);
  assert.equal([...text.matchAll(/^-(?![-])/gmu)].length <= 1, true, "more than the one rewritten Critic search-surface line is removed");
});
