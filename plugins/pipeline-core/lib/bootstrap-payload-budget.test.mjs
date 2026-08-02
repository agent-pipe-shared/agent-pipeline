#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BOOTSTRAP_PAYLOAD_MAX_BYTES,
  boundedPayload,
  measureBootstrapPayload,
  selectLazyReferences,
} from "./bootstrap-payload-budget.mjs";

const positive = measureBootstrapPayload({ featureId: "nova", revision: 4 }, { mode: "normal" });
assert.equal(positive.metric, "utf8-byte-upper-bound");
assert.equal(positive.exactModelTokens, false);
assert.equal(positive.withinBudget, true);
const tampered = measureBootstrapPayload({ featureId: "nova", revision: 5 }, { mode: "normal" });
assert.notEqual(tampered.digestSha256, positive.digestSha256);

const over = boundedPayload({ code: "PCR-READY", featureId: "nova", revision: 7, huge: "x".repeat(20_000) }, { mode: "compact" });
assert.equal(over.overBudget, true);
assert.equal(over.originalMeasurement.withinBudget, false);
assert.equal(over.emittedMeasurement.withinBudget, true);
assert.equal(over.truncated, true);
assert.equal(over.value.featureId, "nova");
assert.equal(over.value.revision, 7);
assert.equal(over.measurement.withinBudget, true);
assert.ok(over.measurement.upperBoundUnits <= BOOTSTRAP_PAYLOAD_MAX_BYTES);

assert.deepEqual(selectLazyReferences({ code: "PCR-READY", ready: true }), []);
assert.deepEqual(selectLazyReferences({ code: "PCR-BLOCKED", role: "critic" }), [
  "references/onboarding-recovery.md",
  "references/role-specific.md",
  "references/continuation.md",
]);
assert.deepEqual(selectLazyReferences({ code: "PCR-DECISION-PENDING", role: "goldfish" }), [
  "references/onboarding-recovery.md",
  "references/role-specific.md",
  "references/continuation.md",
]);
const skillRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "skills", "pipeline-start");
for (const reference of selectLazyReferences({ code: "PCR-BLOCKED", role: "critic" })) {
  assert.equal(existsSync(join(skillRoot, reference)), true, `${reference} must resolve from pipeline-start`);
}
for (const runner of ["codex", "claude-code"]) {
  const parity = measureBootstrapPayload({ featureId: "nova", revision: 4 }, { runner, mode: "compact" });
  assert.equal(parity.upperBoundUnits, positive.upperBoundUnits);
  assert.equal(parity.exactModelTokens, false);
}
