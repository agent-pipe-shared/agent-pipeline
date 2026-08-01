#!/usr/bin/env node
import assert from "node:assert/strict";
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
  "references/recovery.md",
  "references/role-specific.md",
  "references/continuation.md",
]);
assert.deepEqual(selectLazyReferences({ code: "PCR-DECISION-PENDING", role: "goldfish" }), [
  "references/recovery.md",
  "references/role-specific.md",
  "references/continuation.md",
]);
for (const runner of ["codex", "claude-code"]) {
  const parity = measureBootstrapPayload({ featureId: "nova", revision: 4 }, { runner, mode: "compact" });
  assert.equal(parity.upperBoundUnits, positive.upperBoundUnits);
  assert.equal(parity.exactModelTokens, false);
}
