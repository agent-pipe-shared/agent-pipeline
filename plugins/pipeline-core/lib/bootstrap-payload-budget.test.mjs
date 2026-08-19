#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BOOTSTRAP_PAYLOAD_MAX_BYTES,
  boundedNarrativeExcerpt,
  boundedPayload,
  measureBootstrapPayload,
  selectLazyReferences,
  STATE_EXCERPT_MAX_BYTES,
  STATE_EXCERPT_TRUNCATION_MARKER,
} from "./bootstrap-payload-budget.mjs";

const positive = measureBootstrapPayload({ featureId: "nova", revision: 4 }, { mode: "normal" });
assert.equal(positive.metric, "utf8-byte-upper-bound");
assert.equal(positive.exactModelTokens, false);
assert.equal(positive.withinBudget, true);
const tampered = measureBootstrapPayload({ featureId: "nova", revision: 5 }, { mode: "normal" });
assert.notEqual(tampered.digestSha256, positive.digestSha256);

const over = boundedPayload({ code: "PCR-READY", featureId: "nova", revision: 7, huge: "x".repeat(50_000) }, { mode: "compact" });
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

// measureBootstrapPayload's optional maxBytes override: defaults are unchanged (backward
// compatible), but a caller with its own sub-budget shares the same measurement/schema.
const defaultCeiling = measureBootstrapPayload("x".repeat(10), { mode: "normal" });
assert.equal(defaultCeiling.maxUpperBoundUnits, BOOTSTRAP_PAYLOAD_MAX_BYTES);
const customCeiling = measureBootstrapPayload("x".repeat(10), { mode: "normal", maxBytes: 5 });
assert.equal(customCeiling.maxUpperBoundUnits, 5);
assert.equal(customCeiling.withinBudget, false);
assert.equal(customCeiling.schema, defaultCeiling.schema);

// boundedNarrativeExcerpt: null/empty input fails closed without crashing.
for (const empty of [null, undefined, "", "   \n\n  ", 42, {}]) {
  const result = boundedNarrativeExcerpt(empty);
  assert.equal(result.value, null);
  assert.equal(result.truncated, false);
  assert.equal(result.overBudget, false);
}

// Fits within budget: returned verbatim (trimmed), no marker, not flagged truncated.
const smallNarrative = "Paragraph one.\n\nParagraph two, still small.";
const fitResult = boundedNarrativeExcerpt(smallNarrative, { maxBytes: STATE_EXCERPT_MAX_BYTES });
assert.equal(fitResult.value, smallNarrative);
assert.equal(fitResult.truncated, false);
assert.equal(fitResult.overBudget, false);
assert.equal(fitResult.originalMeasurement.withinBudget, true);
assert.equal(fitResult.measurement.withinBudget, true);

// Exceeds budget: truncated from the OLDEST end (paragraphs dropped from the front first),
// newest paragraph(s) at the tail are kept verbatim, and the marker is embedded in the value.
const paragraphs = [];
for (let i = 0; i < 20; i += 1) paragraphs.push(`Paragraph number ${i}: ${"x".repeat(500)}`);
const bigNarrative = paragraphs.join("\n\n");
const overResult = boundedNarrativeExcerpt(bigNarrative, { maxBytes: 2_000 });
assert.equal(overResult.truncated, true);
assert.equal(overResult.overBudget, true);
assert.ok(overResult.value.startsWith(STATE_EXCERPT_TRUNCATION_MARKER));
assert.ok(overResult.value.includes("Paragraph number 19"), "newest paragraph must survive truncation");
assert.ok(!overResult.value.includes("Paragraph number 0:"), "oldest paragraph must be dropped first");
assert.equal(overResult.measurement.withinBudget, true);
assert.ok(overResult.measurement.bytes <= 2_000);
assert.ok(overResult.originalMeasurement.bytes > overResult.measurement.bytes);

// Pathological case: a single paragraph alone exceeds the whole budget. Must still produce
// non-empty, budget-respecting output rather than an empty or over-budget value, and must
// never crash on multi-byte UTF-8 content at the cut boundary.
const hugeMultiByteParagraph = `Ünïcödé wörds with ümlauts: ${"ü".repeat(3_000)}`;
const hugeResult = boundedNarrativeExcerpt(hugeMultiByteParagraph, { maxBytes: 500 });
assert.equal(hugeResult.truncated, true);
assert.ok(hugeResult.value.startsWith(STATE_EXCERPT_TRUNCATION_MARKER));
assert.ok(hugeResult.measurement.bytes <= 500);
assert.ok(hugeResult.value.length > STATE_EXCERPT_TRUNCATION_MARKER.length, "must keep some tail content");
