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

test("the guide tells when to call the architecture-decision skill: at design promotion, for every decision the design names", () => {
  const guide = readFileSync(GUIDE, "utf8");
  assert.match(guide, /architecture-decision/u);
  assert.match(guide, /decisions to record/iu);
  assert.ok(existsSync(join(PLUGIN, "skills", "architecture-decision", "SKILL.md")));
});

// G20-61 (Claude greenfield 2026-11-08 06:03 -> 06:59 UTC): the hand-back arrived before the host commit, the session reported
// and ended its turn, and the completion notification a minute later produced no action until the PO asked.
test("G20-61: the guide makes the Goldfish completion notification the cue to continue and forbids a status-report turn end", () => {
  const guide = readFileSync(GUIDE, "utf8");
  assert.match(guide, /hand-back message can arrive before that commit/u);
  assert.match(guide, /act on that notification, read `git log -1` and dispatch the next ready slice in the same turn/u);
  assert.match(guide, /never end a turn with a status report/u);
});

test("the guide keeps its honesty markers and holds no host path", () => {
  const guide = readFileSync(GUIDE, "utf8");
  assert.match(guide, /## Gaps this guide does not close/u);
  assert.match(guide, /\*\*no syntax documented\*\*/u);
  assert.doesNotMatch(guide, /[A-Za-z]:[\\/]|\/home\/|\/Users\//u);
});
