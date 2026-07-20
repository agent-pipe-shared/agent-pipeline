#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";

import {
  DEFAULT_HUMAN_DECISION_LABEL,
  HumanRoleLabelValidationError,
  escapeHumanDecisionLabelText,
  renderHumanDecisionText,
  resolveHumanDecisionLabel,
  validateHumanDecisionLabel,
} from "./human-role-labels.mjs";

const rejected = [
  ["non-NFC", "e\u0301", "human_role_label_nfc"],
  ["leading Unicode whitespace", "\u00A0PO", "human_role_label_trim"],
  ["trailing Unicode whitespace", "PO\uFEFF", "human_role_label_trim"],
  ["C0 control", "P\u0000O", "human_role_label_control"],
  ["C1 control", "P\u0085O", "human_role_label_control"],
  ["bidi control", "P\u202EO", "human_role_label_bidi"],
  ["markup", "<PO>", "human_role_label_markup"],
  ["backslash", "P\\O", "human_role_label_markup"],
  ["lone surrogate", `P${String.fromCharCode(0xD800)}O`, "human_role_label_scalar"],
  ["noncharacter", `P${String.fromCodePoint(0xFDD0)}O`, "human_role_label_scalar"],
  ["too long", "P".repeat(41), "human_role_label_length"],
];

const cases = [
  ["missing source role resolves to PO", () => assert.equal(resolveHumanDecisionLabel(undefined), DEFAULT_HUMAN_DECISION_LABEL)],
  ["missing source po resolves to PO", () => assert.equal(resolveHumanDecisionLabel({}), DEFAULT_HUMAN_DECISION_LABEL)],
  ["valid NFC Unicode label remains exact", () => assert.equal(resolveHumanDecisionLabel({ po: { display_label: "Équipe" } }), "Équipe")],
  ["forty astral scalars are accepted", () => assert.equal(validateHumanDecisionLabel("😀".repeat(40)).ok, true)],
  ["plain text rendering has the fixed decision prefix", () => assert.equal(renderHumanDecisionText("Release owner"), "Human decision — Release owner")],
  ["HTML/Markdown text rendering encodes every scalar", () => assert.equal(escapeHumanDecisionLabelText("A😀"), "&#x41;&#x1F600;")],
  ["invalid resolver result is typed", () => assert.throws(() => resolveHumanDecisionLabel({ po: { display_label: "<PO>" } }), HumanRoleLabelValidationError)],
  ...rejected.map(([name, value, code]) => [`${name} is rejected without repair`, () => {
    const result = validateHumanDecisionLabel(value);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, code);
  }]),
];

let passed = 0;
for (const [name, run] of cases) {
  try { run(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}: ${error.message}`); }
}
console.log(`${passed}/${cases.length} cases passed.`);
if (passed !== cases.length) process.exitCode = 1;
