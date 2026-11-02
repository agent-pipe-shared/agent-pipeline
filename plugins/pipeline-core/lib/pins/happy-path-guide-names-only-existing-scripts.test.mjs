// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GUIDE = join(PLUGIN, "skills", "pipeline-start", "references", "happy-path.md");
const SKILL = join(PLUGIN, "skills", "pipeline-start", "SKILL.md");

test("the happy-path guide names only scripts that ship, and the start skill loads it", () => {
  const guide = readFileSync(GUIDE, "utf8");
  const scripts = [...new Set([...guide.matchAll(/\x60([a-z0-9-]+\.mjs)\b/gu)].map((match) => match[1]))];
  assert.ok(scripts.length >= 12, `the guide should name the lifecycle scripts, found ${scripts.length}`);
  for (const script of scripts) assert.ok(existsSync(join(PLUGIN, "scripts", script)), `${script} is named by the guide but does not ship in scripts/`);
  assert.match(readFileSync(SKILL, "utf8"), /\x60references\/happy-path\.md\x60 for the ordered command chain/u);
});

test("the guide keeps its honesty markers and holds no host path", () => {
  const guide = readFileSync(GUIDE, "utf8");
  assert.match(guide, /## Gaps this guide does not close/u);
  assert.match(guide, /\*\*no syntax documented\*\*/u);
  assert.doesNotMatch(guide, /[A-Za-z]:[\\/]|\/home\/|\/Users\//u);
});
