#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, openSync } from "node:fs";
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
import { registerTestCaseCompletion } from "./test-case-completion.mjs";

const cases = [];
const injectedFailure = process.env.PIPELINE_BPB_TEST_INJECT_FAILURE ?? "";
const selfProbeChild = process.env.PIPELINE_BPB_TEST_SELF_PROBE_CHILD === "1";
function check(name, run) {
  const id = `BPB${String(cases.length + 1).padStart(2, "0")}`;
  cases.push({ id, name, run() { if (injectedFailure === id) assert.fail("intentional bootstrap payload budget case-completion failure"); return run(); } });
}

check("measures a normal payload and binds its digest to content", () => {
  const positive = measureBootstrapPayload({ featureId: "nova", revision: 4 }, { mode: "normal" });
  assert.equal(positive.metric, "utf8-byte-upper-bound");
  assert.equal(positive.exactModelTokens, false);
  assert.equal(positive.withinBudget, true);
  const tampered = measureBootstrapPayload({ featureId: "nova", revision: 5 }, { mode: "normal" });
  assert.notEqual(tampered.digestSha256, positive.digestSha256);
});

check("bounds an oversized compact payload while retaining continuity fields", () => {
  const over = boundedPayload({ code: "PCR-READY", featureId: "nova", revision: 7, huge: "x".repeat(50_000) }, { mode: "compact" });
  assert.equal(over.overBudget, true);
  assert.equal(over.originalMeasurement.withinBudget, false);
  assert.equal(over.emittedMeasurement.withinBudget, true);
  assert.equal(over.truncated, true);
  assert.equal(over.value.featureId, "nova");
  assert.equal(over.value.revision, 7);
  assert.equal(over.measurement.withinBudget, true);
  assert.ok(over.measurement.upperBoundUnits <= BOOTSTRAP_PAYLOAD_MAX_BYTES);
});

check("selects only typed lazy references and resolves each selected path", () => {
  assert.deepEqual(selectLazyReferences({ code: "PCR-READY", ready: true }), []);
  assert.deepEqual(selectLazyReferences({ code: "PCR-BLOCKED", role: "critic" }), ["references/onboarding-recovery.md", "references/role-specific.md", "references/continuation.md"]);
  assert.deepEqual(selectLazyReferences({ code: "PCR-DECISION-PENDING", role: "goldfish" }), ["references/onboarding-recovery.md", "references/role-specific.md", "references/continuation.md"]);
  const skillRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "skills", "pipeline-start");
  for (const reference of selectLazyReferences({ code: "PCR-BLOCKED", role: "critic" })) assert.equal(existsSync(join(skillRoot, reference)), true, `${reference} must resolve from pipeline-start`);
});

check("measures compact payloads with runner parity", () => {
  const positive = measureBootstrapPayload({ featureId: "nova", revision: 4 }, { mode: "normal" });
  for (const runner of ["codex", "claude-code"]) {
    const parity = measureBootstrapPayload({ featureId: "nova", revision: 4 }, { runner, mode: "compact" });
    assert.equal(parity.upperBoundUnits, positive.upperBoundUnits);
    assert.equal(parity.exactModelTokens, false);
  }
});

check("supports a caller sub-budget without changing the default ceiling", () => {
  const defaultCeiling = measureBootstrapPayload("x".repeat(10), { mode: "normal" });
  assert.equal(defaultCeiling.maxUpperBoundUnits, BOOTSTRAP_PAYLOAD_MAX_BYTES);
  const customCeiling = measureBootstrapPayload("x".repeat(10), { mode: "normal", maxBytes: 5 });
  assert.equal(customCeiling.maxUpperBoundUnits, 5);
  assert.equal(customCeiling.withinBudget, false);
  assert.equal(customCeiling.schema, defaultCeiling.schema);
});

check("rejects empty narrative input without crashing", () => {
  for (const empty of [null, undefined, "", "   \n\n  ", 42, {}]) {
    const result = boundedNarrativeExcerpt(empty);
    assert.equal(result.value, null);
    assert.equal(result.truncated, false);
    assert.equal(result.overBudget, false);
  }
});

check("returns a fitting narrative verbatim after trimming", () => {
  const smallNarrative = "Paragraph one.\n\nParagraph two, still small.";
  const fitResult = boundedNarrativeExcerpt(smallNarrative, { maxBytes: STATE_EXCERPT_MAX_BYTES });
  assert.equal(fitResult.value, smallNarrative);
  assert.equal(fitResult.truncated, false);
  assert.equal(fitResult.overBudget, false);
  assert.equal(fitResult.originalMeasurement.withinBudget, true);
  assert.equal(fitResult.measurement.withinBudget, true);
});

check("truncates an oversized narrative from the oldest end", () => {
  const paragraphs = [];
  for (let i = 0; i < 20; i += 1) paragraphs.push(`Paragraph number ${i}: ${"x".repeat(500)}`);
  const overResult = boundedNarrativeExcerpt(paragraphs.join("\n\n"), { maxBytes: 2_000 });
  assert.equal(overResult.truncated, true);
  assert.equal(overResult.overBudget, true);
  assert.ok(overResult.value.startsWith(STATE_EXCERPT_TRUNCATION_MARKER));
  assert.ok(overResult.value.includes("Paragraph number 19"), "newest paragraph must survive truncation");
  assert.ok(!overResult.value.includes("Paragraph number 0:"), "oldest paragraph must be dropped first");
  assert.equal(overResult.measurement.withinBudget, true);
  assert.ok(overResult.measurement.bytes <= 2_000);
  assert.ok(overResult.originalMeasurement.bytes > overResult.measurement.bytes);
});

check("bounds a single oversized multi-byte paragraph without an empty result", () => {
  const hugeMultiByteParagraph = `Ünïcödé wörds with ümlauts: ${"ü".repeat(3_000)}`;
  const hugeResult = boundedNarrativeExcerpt(hugeMultiByteParagraph, { maxBytes: 500 });
  assert.equal(hugeResult.truncated, true);
  assert.ok(hugeResult.value.startsWith(STATE_EXCERPT_TRUNCATION_MARKER));
  assert.ok(hugeResult.measurement.bytes <= 500);
  assert.ok(hugeResult.value.length > STATE_EXCERPT_TRUNCATION_MARKER.length, "must keep some tail content");
});

check("an early failed case still emits dispositions for the complete declared corpus", () => {
  if (selfProbeChild) return;
  const probe = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { encoding: "utf8", env: { ...process.env, PIPELINE_BPB_TEST_INJECT_FAILURE: "BPB02", PIPELINE_BPB_TEST_SELF_PROBE_CHILD: "1", PIPELINE_VERIFY_CASE_COMPLETION_FD: "3", PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES: "65536" }, shell: false, stdio: ["ignore", "pipe", "pipe", "pipe"], timeout: 30_000 });
  assert.notEqual(probe.status, 0, "the injected early case must fail");
  const records = String(probe.output[3]).trim().split("\n").map((line) => JSON.parse(line));
  const disposed = records.filter((record) => record.event === "DISPOSED");
  assert.equal(records[0].event, "DECLARED"); assert.equal(records[0].caseCount, 10); assert.equal(disposed.length, 10);
  assert.equal(disposed.find((record) => record.id === "BPB02")?.disposition, "fail");
  assert.equal(disposed.find((record) => record.id === "BPB10")?.disposition, "pass");
  assert.deepEqual(records.at(-1).counts, { pass: 9, fail: 1, skip: 0, todo: 0 });
  assert.equal(records.at(-1).declaredCount, 10); assert.equal(records.at(-1).disposedCount, 10);
});

assert.equal(cases.length, 10, "the complete bootstrap payload budget corpus must be registered before execution begins");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w") : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: cases, fd: completionFd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
