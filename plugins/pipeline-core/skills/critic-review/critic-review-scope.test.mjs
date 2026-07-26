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
  assert.match(skill, /Recheck only the prior\s+findings, their fixes, and direct regressions introduced by those fixes\./u);
  assert.match(skill, /Do not\s+restart a broad hunt, reopen cleared categories, or create a Critic-of-Critic\s+loop/u);
  assert.match(skill, /unless the PO explicitly authorizes a larger new review scope\./u);
});
