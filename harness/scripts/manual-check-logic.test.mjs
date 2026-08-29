// SPDX-License-Identifier: SUL-1.0
// Unit tests for harness/scripts/manual-check-logic.mjs (NVA-CF-ITEM25EXTRACT,
// backlog/items/2026-08-29-mandatory-verify-gate-has-no-path-for-a-project-with-no-tests-yet.md).
// Mirrors scratch/nva-r26-verifyprep/manual-check-logic.test.mjs (7/7 proven against the
// draft); the import path is unchanged because both files move to harness/scripts/ together.
import assert from "node:assert/strict";
import { test } from "node:test";
import { computeManualVerifyStep, containsUnreplacedManualCheckPlaceholder, UNREPLACED_MANUAL_CHECK_PLACEHOLDER, VERIFY_NOT_CONFIGURED_YET } from "./manual-check-logic.mjs";

test("no verifyManualStatus field: no step, unchanged behavior (this repo's own case)", () => {
  const result = computeManualVerifyStep({});
  assert.equal(result.step, null);
  assert.equal(result.evidence, null);
});

test("placeholder-only declared value fails, never silently passes (F19)", () => {
  const result = computeManualVerifyStep({ verifyManualStatus: UNREPLACED_MANUAL_CHECK_PLACEHOLDER });
  assert.equal(result.step.name, "verify-manual-check-placeholder-rejected");
  assert.equal(result.step.exitCode, 1);
  assert.equal(result.evidence.status, "placeholder-rejected");
});

test("placeholder embedded in a longer unfilled note also fails", () => {
  const result = computeManualVerifyStep({ verifyManualStatus: "TODO: Manual check required. fill in real result" });
  assert.equal(result.step.exitCode, 1);
});

test("honest not-configured-yet declaration passes but is distinct from a real pass (F11)", () => {
  const result = computeManualVerifyStep({ verifyManualStatus: VERIFY_NOT_CONFIGURED_YET });
  assert.equal(result.step.name, "verify-not-configured-yet");
  assert.equal(result.step.exitCode, 0);
  assert.equal(result.evidence.status, "not-configured-yet");
});

test("a genuine filled-in manual-check note passes under its own distinct name", () => {
  const result = computeManualVerifyStep({ verifyManualStatus: "Ran the full click-through on staging 2026-08-29, all green." });
  assert.equal(result.step.name, "verify-manual-check-declared");
  assert.equal(result.step.exitCode, 0);
  assert.equal(result.evidence.status, "declared");
});

test("the three declared outcomes are pairwise distinguishable by step name", () => {
  const notConfigured = computeManualVerifyStep({ verifyManualStatus: VERIFY_NOT_CONFIGURED_YET }).step.name;
  const placeholder = computeManualVerifyStep({ verifyManualStatus: UNREPLACED_MANUAL_CHECK_PLACEHOLDER }).step.name;
  const declared = computeManualVerifyStep({ verifyManualStatus: "real note" }).step.name;
  assert.equal(new Set([notConfigured, placeholder, declared]).size, 3);
});

test("containsUnreplacedManualCheckPlaceholder is a pure substring check", () => {
  assert.equal(containsUnreplacedManualCheckPlaceholder("Manual check required."), true);
  assert.equal(containsUnreplacedManualCheckPlaceholder("nope"), false);
  assert.equal(containsUnreplacedManualCheckPlaceholder(null), false);
  assert.equal(containsUnreplacedManualCheckPlaceholder(undefined), false);
});
