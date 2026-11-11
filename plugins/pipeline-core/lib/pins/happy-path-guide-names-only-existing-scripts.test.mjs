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
// Measured 2026-11-10: that notification started no model turn in 32 of 32 cases, so the guide must not make it the cue.
test("G20-61: the guide makes the wait command at the hand-back the cue to continue and forbids a status-report turn end", () => {
  const guide = readFileSync(GUIDE, "utf8");
  assert.match(guide, /hand-back message can arrive before that commit/u);
  assert.match(guide, /task-notification starts no turn/u);
  assert.match(guide, /wait-host-commit\.mjs` command from the launch notice in that same turn/u);
  assert.doesNotMatch(guide, /act on that notification/u);
  assert.match(guide, /never end a turn with a status report/u);
});

// PO decision 2026-11-10: a greenfield run handed the PO a first result for acceptance that showed nothing but a black page. The rule is
// product-neutral and holds for every hand-over, not only the close's acceptance question (finish-feature.mjs carries that one).
test("the guide asks for a self-run line before every hand-over to the PO, for any kind of result, without a gate", () => {
  const guide = readFileSync(GUIDE, "utf8");
  assert.match(guide, /Before you put anything in front of the PO for acceptance or to try out, make sure you have seen it work yourself/u);
  assert.match(guide, /start or open it the way the PO will and look at what it really shows/u);
  assert.match(guide, /or plainly that you could not\s+see it and why/u);
  assert.match(guide, /every kind of result \(an app, a page, a command-line tool, a library, a document\)/u);
  assert.match(guide, /It is not a gate/u);
});

// Live 2026-11-10, Claude on native Windows: the run said it waited for the design signature, started its wait, and gave no command until the PO asked.
test("the guide puts the signing command into the same message that waits for a PO signature", () => {
  const guide = readFileSync(GUIDE, "utf8");
  assert.match(guide, /Whenever you wait for a PO signature \(this one, a push, a residual acceptance\), the\s+same message gives the PO the exact signing command/u);
  assert.match(guide, /never announce that you\s+wait for a signature without it/u);
});

test("the guide keeps its honesty markers and holds no host path", () => {
  const guide = readFileSync(GUIDE, "utf8");
  assert.match(guide, /## Gaps this guide does not close/u);
  assert.match(guide, /\*\*no syntax documented\*\*/u);
  assert.doesNotMatch(guide, /[A-Za-z]:[\\/]|\/home\/|\/Users\//u);
});
