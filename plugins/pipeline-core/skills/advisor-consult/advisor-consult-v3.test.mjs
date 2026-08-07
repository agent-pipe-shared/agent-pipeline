#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const skill = readFileSync(join(HERE, "SKILL.md"), "utf8");

test("consultation requires one concrete reason and closed demand before any model effect", () => {
  assert.match(skill, /pipeline\.advisory-lifecycle-policy\.v2/u);
  assert.match(skill, /architecture-tradeoff\|decision-ambiguity\|evidence-conflict\|recovery-choice\|risk-review/u);
  assert.match(skill, /pipeline\.advisory-demand\.v2/u);
  assert.match(skill, /Before any child, model request, prompt export or timeout/u);
  assert.match(skill, /question SHA-256, evidence SHA-256/u);
  assert.match(skill, /candidate commit\/tree/u);
  assert.match(skill, /advisory_demand_required/u);
  assert.match(skill, /advisory_demand_binding_mismatch/u);
});

test("lifecycle events are non-triggers and identical demand is not repeated", () => {
  assert.match(skill, /Reject session start, profile selection, restart, resume, re-entry, Compact,\s+unchanged handover, a configured route or consent alone/u);
  assert.match(skill, /pipeline\.advisory-consultation-record\.v2/u);
  assert.match(skill, /same\s+`reuseKeySha256` is `reuse-no-repeat`: launch no child and make no model\s+request/u);
  assert.match(skill, /changed question, reason, evidence, candidate or route-policy\s+digest is material drift/u);
});

test("Codex consultations keep the bounded route but spend 180/90 only on demand", () => {
  assert.match(skill, /codex-host-advisor-route\.mjs/u);
  assert.match(skill, /pipeline\.codex-host-advisor-policy\.v1/u);
  assert.match(skill, /one monotonic 180-second deadline/u);
  assert.match(skill, /one monotonic 90-second deadline/u);
  assert.match(skill, /Polling never resets/u);
  assert.match(skill, /interrupt exactly once/u);
  assert.match(skill, /Never start a third\s+attempt/u);
  assert.match(skill, /before\/between\/after\s+workspace observations/u);
  assert.match(skill, /no attested selected-sandbox execution; OS isolation and model identity are not asserted/u);
  assert.equal(skill.includes("danger-full-access"), false);
});

test("Claude remains same-runner and bootstrap remains model-free", () => {
  assert.match(skill, /unchanged V3 same-runner chain/u);
  assert.match(skill, /native Fable, native Opus only after repeated Fable failure/u);
  assert.match(skill, /pipeline\.advisory-capability-preflight\.v2/u);
  assert.match(skill, /never\s+invokes this skill/u);
  assert.match(skill, /Capability state is not consultation success/u);
});
