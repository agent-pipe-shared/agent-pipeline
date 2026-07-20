#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const skill = readFileSync(join(HERE, "SKILL.md"), "utf8");

test("affected Codex consults require a selected generic host transport before dispatch", () => {
  assert.equal(skill.includes("sandboxed-readonly-host-bridge.mjs"), true, "consults must name the generic selected host bridge");
  assert.equal(skill.includes("selectionId"), true, "consults must bind a selection ID");
  assert.equal(skill.includes("network-open/read-only"), true, "consults must name the documented profile");
  assert.equal(skill.includes("host-mode-unavailable"), true, "consults must preserve the typed unavailable outcome");
  assert.equal(/before (?:the )?first child/u.test(skill), true, "selection must precede every child");
  assert.equal(skill.includes("danger-full-access"), false, "consults must not offer the prohibited mode");
  assert.equal(/strong(?:ly)?[- ]isolat(?:ed|ion)/ui.test(skill), false, "network-open transport must not claim strong isolation");
});

test("consult authority remains machine-bound and does not admit user prose", () => {
  assert.match(skill, /runner, role, selector and fallback order come from the V3\s+registry/u);
  assert.match(skill, /fresh context/u);
  assert.match(skill, /Read, Grep, Glob/u);
  assert.doesNotMatch(skill, /ask (?:the )?(?:PO|user).*mode/ui);
});

test("a typed Codex sandbox stop permits one PO-authorized gate-capable functional-equivalent pass with bounded residual assurance", () => {
  assert.match(skill, /Only after\s+exactly one selected Codex sandbox attempt ends in a typed `no-child` or\s+`unavailable` outcome/u);
  assert.match(skill, /one fresh,\s+host-internal direct\s+`consult-advisor` subagent/u);
  assert.match(skill, /local, fresh, hard-read-only/u);
  assert.match(skill, /no\s+handover, memory, repository mutation, network export, raw-answer persistence,\s+model-identity assertion or auto-apply/u);
  assert.match(skill, /must not retry, replace, repair or\s+mask the selected sandbox attempt/u);
  assert.match(skill, /PO-authorized functional-equivalent pass/u);
  assert.match(skill, /gate-capable advisory evidence/u);
  assert.match(skill, /until the PO revokes it or a functional Codex CLI selected\s+sandbox becomes available/u);
  assert.match(skill, /no attested\s+selected-sandbox execution; OS isolation and model identity are not asserted/u);
  assert.match(skill, /It emits no `pipeline\.advisory-receipt\.v1`/u);
  assert.match(skill, /A local consult failure, a second question, any mutation, or\s+any export is not a pass/u);
});
