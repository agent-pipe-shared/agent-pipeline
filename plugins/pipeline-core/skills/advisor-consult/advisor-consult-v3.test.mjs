#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const skill = readFileSync(join(HERE, "SKILL.md"), "utf8");

test("Codex consults use one bounded primary and one smaller fallback", () => {
  assert.match(skill, /codex-host-advisor-route\.mjs/u);
  assert.match(skill, /pipeline\.codex-host-advisor-policy\.v1/u);
  assert.match(skill, /one\s+monotonic deadline/u);
  assert.match(skill, /polling never resets it/u);
  assert.match(skill, /interrupt it exactly once/u);
  assert.match(skill, /Recompute the same workspace SHA-256/u);
  assert.match(skill, /launch exactly one fresh fallback/u);
  assert.match(skill, /Never start a third attempt/u);
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

test("Codex status is bounded evidence and exhaustion is non-blocking", () => {
  assert.match(skill, /pipeline\.host-advisor-status\.v1/u);
  assert.match(skill, /candidate-\/launch-\/question-bound/u);
  assert.match(skill, /unchanged-workspace/u);
  assert.match(skill, /before, between,\s+and after attempts/u);
  assert.match(skill, /emit\s+`advisory-unavailable` and continue bootstrap/u);
  assert.match(skill, /without an Advisory-pass claim/u);
  assert.match(skill, /Mutation or observed separate export remains a hard failure/u);
  assert.match(skill, /no attested\s+selected-sandbox execution; OS isolation and model identity are not asserted/u);
  assert.match(skill, /Codex never\s+creates `pipeline\.advisory-receipt\.v1`/u);
});
