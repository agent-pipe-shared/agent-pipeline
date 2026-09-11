#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const skill = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "SKILL.md"), "utf8");

test("Critic findings stay bound to the candidate diff and direct regressions", () => {
  assert.match(skill, /The candidate diff is the review boundary\./u);
  assert.match(skill, /in a file changed by `\{\{DIFF_RANGE\}\}`/u);
  assert.match(skill, /a concrete regression in a direct dependency caused or exposed by that\s+changed diff/u);
  assert.match(skill, /cannot affect the\s+binary verdict/u);
});

test("a fix re-review cannot create an unbounded Critic loop", () => {
  assert.match(skill, /MUST start at the exact\s+candidate commit reviewed by the immediately preceding Critic/u);
  assert.match(skill, /`PREVIOUS_CRITIC_CANDIDATE\.\.NEW_CANDIDATE`/u);
  assert.match(skill, /broad range\s+\(for example `main\.\.HEAD`\) on a re-review is a dispatch defect/u);
  assert.match(skill, /Never supply its path or bytes as reviewer\s+evidence\./u);
  assert.match(skill, /Review the correction diff against the unchanged specification and\s+recheck only the corrected behavior and direct regressions introduced by the\s+fixes\./u);
  assert.match(skill, /Prior-finding reconciliation remains coordinator-side\./u);
  assert.match(skill, /Do not restart a broad hunt,[\s\S]*Critic-of-Critic loop/u);
  assert.match(skill, /unless the PO\s+explicitly authorizes a larger new review scope\./u);
});
