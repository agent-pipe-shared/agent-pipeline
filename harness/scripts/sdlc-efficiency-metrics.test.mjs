// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import {
  summarizeSdlcEfficiencyMetrics,
  validateSdlcEfficiencyMetric,
} from "./sdlc-efficiency-metrics.mjs";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  process.stdout.write(`ok ${passed} - ${name}\n`);
}

const D = "a".repeat(64);
const O = "1".repeat(40);

function metric(overrides = {}) {
  return {
    schema: "pipeline.sdlc-efficiency-metrics.v1",
    metricId: "metric-1",
    cycleId: "cycle-1",
    gateId: "verify-1",
    candidate: { commit: O, tree: O },
    timing: {
      wallDurationMs: 12,
      queueDurationMs: "unknown",
      remoteRoundtripDurationMs: "unknown",
    },
    usage: {
      inputBytes: "unknown", outputBytes: "unknown", contextBytes: "unknown",
      inputTokens: "unknown", outputTokens: "unknown", contextTokens: "unknown",
    },
    finding: { findingId: "unknown", novelty: "none", severity: "none", errorClass: "none" },
    change: { changedPathCount: 0, affectedInvariantIds: [] },
    gate: { mode: "full", outcome: "passed", reworkDisposition: "none", reopened: false, rollbackDisposition: "none" },
    checkpointRecoveryUse: false,
    versions: { toolVersion: "tool-1", runnerVersion: "runner-1", schemaVersion: "v1" },
    ...overrides,
  };
}

check("ME01 accepts one closed shadow-only metric record", () => {
  assert.equal(validateSdlcEfficiencyMetric(metric()).ok, true);
});

check("ME02 preserves unknown unavailable measurements rather than coercing them to zero", () => {
  const record = metric({
    timing: { wallDurationMs: "unknown", queueDurationMs: "unknown", remoteRoundtripDurationMs: "unknown" },
  });
  assert.equal(validateSdlcEfficiencyMetric(record).ok, true);
  assert.equal(record.timing.wallDurationMs, "unknown");
  assert.equal(record.usage.inputTokens, "unknown");
});

for (const [name, mutate] of [
  ["unknown metric field", (record) => { record.rawProviderOutput = "private"; }],
  ["negative duration", (record) => { record.timing.wallDurationMs = -1; }],
  ["fractional changed path count", (record) => { record.change.changedPathCount = 0.5; }],
  ["unclosed novelty", (record) => { record.finding.novelty = "probably-new"; }],
  ["malformed candidate", (record) => { record.candidate.commit = "not-an-oid"; }],
]) {
  check(`ME03 rejects ${name} fail-closed`, () => {
    const record = metric();
    mutate(record);
    assert.equal(validateSdlcEfficiencyMetric(record).ok, false);
  });
}

check("ME04 accepts novelty and remote checkpoint-recovery evidence without gate authority", () => {
  const record = metric({
    metricId: "metric-recovery-1",
    timing: { wallDurationMs: 21, queueDurationMs: 3, remoteRoundtripDurationMs: 8 },
    usage: { inputBytes: 10, outputBytes: 11, contextBytes: 12, inputTokens: 1, outputTokens: 2, contextTokens: 3 },
    finding: { findingId: "finding-1", novelty: "novel", severity: "high", errorClass: "environment" },
    change: { changedPathCount: 2, affectedInvariantIds: ["AC-15"] },
    checkpointRecoveryUse: true,
  });
  assert.equal(validateSdlcEfficiencyMetric(record).ok, true);
});

check("ME05 summary is deterministic, input-preserving, and cannot make a gate decision", () => {
  const first = metric({ metricId: "metric-b", cycleId: "cycle-2", gateId: "verify-2" });
  const second = metric({ metricId: "metric-a", cycleId: "cycle-1", gateId: "verify-1" });
  const before = JSON.stringify([first, second]);
  const forward = summarizeSdlcEfficiencyMetrics([first, second]);
  const reverse = summarizeSdlcEfficiencyMetrics([second, first]);
  assert.equal(forward.ok, true);
  assert.deepEqual(forward, reverse);
  assert.equal(JSON.stringify([first, second]), before);
  assert.equal(Object.hasOwn(forward.summary, "gateDecision"), false);
  assert.equal(Object.hasOwn(forward.summary, "mutateGate"), false);
});

check("ME06 summary fails closed for malformed input and contains no synthetic zero for unknown data", () => {
  const invalid = summarizeSdlcEfficiencyMetrics([metric(), { nope: true }]);
  assert.equal(invalid.ok, false);
  const summary = summarizeSdlcEfficiencyMetrics([metric()]);
  assert.equal(summary.ok, true);
  assert.match(JSON.stringify(summary.summary), /unknown/);
});

check("ME07 rejects distinct metric IDs that try to summarize the same cycle and gate twice", () => {
  const duplicate = summarizeSdlcEfficiencyMetrics([
    metric({ metricId: "metric-cycle-gate-a" }),
    metric({ metricId: "metric-cycle-gate-b" }),
  ]);
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.code, "SEM-DUPLICATE-GATE-CYCLE");
});

process.stdout.write(`1..${passed}\n# pass ${passed}\n`);
