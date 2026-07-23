#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const skill = readFileSync(join(HERE, "SKILL.md"), "utf8");

test("Codex consults immediately use the one direct host-bound transport", () => {
  assert.match(skill, /codex-host-advisor-route\.mjs/u);
  assert.match(skill, /exactly one fresh project-scoped `consult-advisor`/u);
  assert.match(skill, /without a selected-sandbox, App-Server, native-adapter or other advisory\s+probe/u);
  assert.match(skill, /Missing consent resolves to `default` and is enabled without a per-run prompt/u);
  assert.equal(skill.includes("danger-full-access"), false, "consults must not offer the prohibited mode");
});

test("consult authority remains registry-bound and does not admit user prose", () => {
  assert.match(skill, /V3 registry is normative/u);
  assert.match(skill, /fresh context/u);
  assert.match(skill, /one supplied question/u);
  assert.doesNotMatch(skill, /ask (?:the )?(?:PO|user).*mode/ui);
});

test("Codex status is the only bounded gate evidence", () => {
  assert.match(skill, /pipeline\.host-advisor-status\.v1/u);
  assert.match(skill, /candidate-\/launch-\/question-bound/u);
  assert.match(skill, /unchanged-workspace/u);
  assert.match(skill, /no fallback/u);
  assert.match(skill, /no attested\s+selected-sandbox execution; OS isolation and model identity are not asserted/u);
  assert.match(skill, /Codex never creates `pipeline\.advisory-receipt\.v1`/u);
});
