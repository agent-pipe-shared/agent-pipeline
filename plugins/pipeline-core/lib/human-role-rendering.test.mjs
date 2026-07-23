#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";

import {
  encodeTextScalarsForMarkup,
  renderHumanDecisionMarkupText,
  renderHumanDecisionPlainText,
  renderPipelineStatusMarkupText,
  renderPipelineStatusPlainText,
  resolveHumanDecisionDisplayLabel,
} from "./human-role-rendering.mjs";

let passed = 0;
const failures = [];
function test(name, run) {
  try {
    run();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.error(`FAIL ${name} -- ${error.message}`);
  }
}

test("missing role calibration resolves to PO", () => {
  assert.deepEqual(resolveHumanDecisionDisplayLabel({}), { ok: true, displayLabel: "PO" });
  assert.deepEqual(renderHumanDecisionPlainText({}), { ok: true, text: "Human decision — PO" });
});

test("custom label remains display-only plain text", () => {
  assert.deepEqual(
    renderHumanDecisionPlainText({ humanRoles: { po: { displayLabel: "Produktleitung" } } }),
    { ok: true, text: "Human decision — Produktleitung" },
  );
  assert.equal(renderPipelineStatusPlainText(), "Pipeline");
});

test("markup rendering encodes every scalar instead of building a fragment", () => {
  const rendered = renderHumanDecisionMarkupText({ humanRoles: { po: { displayLabel: "R&D" } } });
  assert.equal(rendered.ok, true);
  assert.match(rendered.text, /^&#x48;&#x75;/u);
  assert.equal(rendered.text.includes("R&D"), false);
  assert.equal(encodeTextScalarsForMarkup("😀"), "&#x1F600;");
  assert.equal(renderPipelineStatusMarkupText(), "&#x50;&#x69;&#x70;&#x65;&#x6C;&#x69;&#x6E;&#x65;");
});

test("invalid calibration label fails as a typed display error", () => {
  const rendered = renderHumanDecisionPlainText({ humanRoles: { po: { displayLabel: "<PO>" } } });
  assert.deepEqual(rendered, {
    ok: false,
    code: "human_role_label_markup",
    message: "human decision display label contains markup or an escape character",
  });
});

console.log(`\n${passed}/${passed + failures.length} tests passed.`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
