// SPDX-License-Identifier: SUL-1.0
//
// Negative-gate test suite for the CYB-2A fixture matrix
// (specs/2026-07-24-sprint-cyborg-epic/cyb-2-feature-spec.md §4, AC12).
//
// Every fixture is exercised through the one CYB-2B evaluator. A permanent
// intentionally-red fixture suite would conceal regressions from normal
// verification once that evaluator has shipped.
import assert from "node:assert/strict";
import { test } from "node:test";
import { FIXTURE_MATRIX, RUN_OUTCOMES } from "./security-evidence-fixture-matrix.mjs";
import { evaluateCapability } from "./security-evidence-evaluator.mjs";

// Exact class labels from cyb-2-feature-spec.md §4, in order, verbatim --
// do not rename/merge/drop; see this repo's own §4 quote for the count note.
const EXPECTED_CLASS_IDS = [
  "all-pass",
  "blocking+non-blocking findings",
  "all-skipped",
  "one-required-skipped",
  "optional-skipped",
  "empty/stale rule pack",
  "unsupported language",
  "environment execution failure",
  "timeout/cancellation",
  "partial/truncated coverage",
  "malformed output",
  "version/config/policy drift",
  "changed candidate after planning",
  "cross-platform tool resolution",
];

test("structural: fixture matrix has exactly the fourteen counted classes from §4, in order, none merged/renamed/dropped", () => {
  assert.strictEqual(
    FIXTURE_MATRIX.length,
    EXPECTED_CLASS_IDS.length,
    "the feature-spec's own §4 prose lists fourteen classes under a \"fifteen fixtures\" claim -- " +
      "this suite counts fourteen; report the discrepancy, do not invent a fifteenth here"
  );
  assert.deepStrictEqual(FIXTURE_MATRIX.map((f) => f.id), EXPECTED_CLASS_IDS);
});

test("structural: every fixture has a plausible v1-shaped candidate, a well-formed plan, and a valid expected-outcome enum member", () => {
  for (const fixture of FIXTURE_MATRIX) {
    assert.ok(typeof fixture.id === "string" && fixture.id.length > 0, `fixture missing a non-empty id`);
    assert.ok(typeof fixture.description === "string" && fixture.description.length > 0, `fixture "${fixture.id}" missing a description`);

    assert.strictEqual(fixture.candidate.schema, "pipeline.security-evidence.v1", `fixture "${fixture.id}" candidate.schema mismatch`);
    assert.ok(Array.isArray(fixture.candidate.capabilities) && fixture.candidate.capabilities.length > 0, `fixture "${fixture.id}" candidate.capabilities must be a non-empty array`);

    const capabilityIds = new Set();
    for (const capability of fixture.candidate.capabilities) {
      assert.ok(typeof capability.id === "string" && capability.id.length > 0, `fixture "${fixture.id}" has a capability with no id`);
      assert.ok(!capabilityIds.has(capability.id), `fixture "${fixture.id}" has a duplicate capability id "${capability.id}"`);
      capabilityIds.add(capability.id);
      assert.ok(typeof capability.tool === "string" && capability.tool.length > 0, `fixture "${fixture.id}" capability "${capability.id}" missing tool`);
      assert.ok(["PASS", "FINDINGS", "SKIPPED", "ERROR"].includes(capability.status), `fixture "${fixture.id}" capability "${capability.id}" has an unrecognized v1 status "${capability.status}"`);
      assert.ok(typeof capability.classification === "string" && capability.classification.length > 0, `fixture "${fixture.id}" capability "${capability.id}" missing classification`);
      assert.ok(Array.isArray(capability.findings), `fixture "${fixture.id}" capability "${capability.id}" findings must be an array`);
      assert.ok("raw" in capability, `fixture "${fixture.id}" capability "${capability.id}" missing raw`);
      assert.ok("reason" in capability, `fixture "${fixture.id}" capability "${capability.id}" missing reason`);
    }

    assert.ok(Array.isArray(fixture.plan?.required), `fixture "${fixture.id}" plan.required must be an array`);
    assert.ok(Array.isArray(fixture.plan?.optional), `fixture "${fixture.id}" plan.optional must be an array`);
    for (const requiredId of fixture.plan.required) {
      assert.ok(capabilityIds.has(requiredId), `fixture "${fixture.id}" plan.required references unknown capability id "${requiredId}"`);
    }
    for (const optionalId of fixture.plan.optional) {
      assert.ok(capabilityIds.has(optionalId), `fixture "${fixture.id}" plan.optional references unknown capability id "${optionalId}"`);
      assert.ok(!fixture.plan.required.includes(optionalId), `fixture "${fixture.id}" capability "${optionalId}" listed as both required and optional`);
    }

    if (fixture.focusCapabilityId !== null) {
      assert.ok(capabilityIds.has(fixture.focusCapabilityId), `fixture "${fixture.id}" focusCapabilityId "${fixture.focusCapabilityId}" is not one of its own capabilities`);
    }

    assert.ok(RUN_OUTCOMES.includes(fixture.expectedOutcome), `fixture "${fixture.id}" expectedOutcome "${fixture.expectedOutcome}" is not a CYB-1F §7 enum member`);
  }
});

for (const fixture of FIXTURE_MATRIX) {
  test(`fixture: ${fixture.id} resolves through the real evaluator`, () => {
    const capabilityIds = fixture.focusCapabilityId === null
      ? fixture.candidate.capabilities.map(({ id }) => id)
      : [fixture.focusCapabilityId];
    for (const capabilityId of capabilityIds) {
      const actual = evaluateCapability(fixture.candidate, capabilityId, fixture.plan).outcome;
      assert.strictEqual(actual, fixture.expectedOutcome,
        `fixture "${fixture.id}" capability "${capabilityId}" expected "${fixture.expectedOutcome}" but got "${actual}"`);
    }
  });
}
