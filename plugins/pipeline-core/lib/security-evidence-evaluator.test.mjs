// SPDX-License-Identifier: SUL-1.0
//
// CYB-2B -- test suite for security-evidence-evaluator.mjs (the
// `pipeline.security-evidence.v2` schema + the pure L3 per-capability
// evaluator). Two independent halves, mirroring the module under test:
//
//   PART A tests -- schema-validation fixtures (AC4, AC5, AC6). Permanent
//   regression coverage, not scratch checks (per the NEW-FEATURE module in
//   this task's briefing).
//   PART B tests -- the primary acceptance signal: every one of CYB-2A's 14
//   closed `FIXTURE_MATRIX` fixtures, run through the REAL evaluator
//   (imported directly from security-evidence-fixture-matrix.mjs, never
//   through the temporary `evaluateFixturePlaceholder` stub), must produce
//   exactly its own `expectedOutcome`. This is how the "flips green one at a
//   time" claim is proven without editing CYB-2A's closed files (see this
//   task's briefing field 3): CYB-2A's own `.test.mjs` file is re-run
//   separately, unedited, and is asserted to still exit non-zero (see the
//   report, not this file -- that assertion cannot live in a unit test
//   without touching the closed file).
//
// Purity note: every FIXTURE_MATRIX fixture is deeply `Object.freeze()`d
// (CYB-2A's own doing). Since ES modules run in strict mode, any attempted
// mutation of a fixture's candidate/plan by the evaluator under test would
// throw a TypeError immediately -- this test suite passing at all is itself
// a partial purity proof (no mutation of frozen input), on top of the
// evaluator module importing no fs/network/child_process API (verifiable by
// reading its top-of-file import block, which is empty).

import assert from "node:assert/strict";
import { test } from "node:test";

import { FIXTURE_MATRIX, RUN_OUTCOMES as CYB2A_RUN_OUTCOMES } from "./security-evidence-fixture-matrix.mjs";
import {
  SECURITY_EVIDENCE_V2_SCHEMA,
  FINDING_SEVERITIES,
  validateFindingEnvelope,
  validateCoverageRecord,
  validateCapabilityRecord,
  validateSecurityEvidenceV2,
  RUN_OUTCOMES,
  CONTROL_RESULTS,
  evaluateCapability,
  evaluateAllCapabilities,
  aggregateVerdict,
  projectRunOutcomeToControlResult,
} from "./security-evidence-evaluator.mjs";

// -------------------------------------------------------------------------------------------
// Guard: this file's own RUN_OUTCOMES mirror must never silently diverge from CYB-2A's mirror
// (both are independent read-only copies of the CYB-1F §7 frozen source -- see this module's
// header comment, "THREE MIRRORS").
// -------------------------------------------------------------------------------------------

test("guard: this module's RUN_OUTCOMES mirror matches CYB-2A's own mirror exactly", () => {
  assert.deepStrictEqual(RUN_OUTCOMES, CYB2A_RUN_OUTCOMES);
});

function fixtureById(id) {
  const found = FIXTURE_MATRIX.find((f) => f.id === id);
  assert.ok(found, `expected FIXTURE_MATRIX to contain a fixture with id "${id}"`);
  return found;
}

// ===============================================================================================
// PART B -- primary acceptance signal: all 14 fixtures through the REAL evaluator
// ===============================================================================================

const FOCUSED_FIXTURES = FIXTURE_MATRIX.filter((f) => f.focusCapabilityId !== null);

for (const fixture of FOCUSED_FIXTURES) {
  test(`real evaluator: ${fixture.id} resolves focus capability "${fixture.focusCapabilityId}" to its expectedOutcome`, () => {
    const result = evaluateCapability(fixture.candidate, fixture.focusCapabilityId, fixture.plan);
    assert.ok(RUN_OUTCOMES.includes(result.outcome), `evaluator returned "${result.outcome}", not a RUN_OUTCOMES member`);
    assert.strictEqual(result.outcome, fixture.expectedOutcome, `fixture "${fixture.id}" expected "${fixture.expectedOutcome}" but real evaluator returned "${result.outcome}"`);
  });
}

test("real evaluator: all-pass (focusCapabilityId: null) -- every capability resolves to \"pass\"", () => {
  const fixture = fixtureById("all-pass");
  for (const capability of fixture.candidate.capabilities) {
    const result = evaluateCapability(fixture.candidate, capability.id, fixture.plan);
    assert.strictEqual(result.outcome, "pass", `capability "${capability.id}" expected "pass" but got "${result.outcome}"`);
  }
});

test("real evaluator: changed candidate after planning (focusCapabilityId: null) -- every capability resolves to \"invalid\" via the candidate-binding override", () => {
  const fixture = fixtureById("changed candidate after planning");
  assert.strictEqual(fixture.expectedOutcome, "invalid");
  assert.strictEqual(fixture.candidate.candidateBinding.matches, false, "fixture precondition: candidateBinding.matches must be false");
  for (const capability of fixture.candidate.capabilities) {
    const result = evaluateCapability(fixture.candidate, capability.id, fixture.plan);
    assert.strictEqual(result.outcome, "invalid", `capability "${capability.id}" expected the candidate-binding override to produce "invalid" but got "${result.outcome}"`);
    assert.strictEqual(result.classification, "candidate_binding_mismatch", "override must not be conflated with the capability's own real classification");
  }
});

test("structural: FIXTURE_MATRIX has exactly 14 fixtures and every focused one was exercised above", () => {
  assert.strictEqual(FIXTURE_MATRIX.length, 14);
  assert.strictEqual(FOCUSED_FIXTURES.length, 12, "12 of the 14 fixtures carry a non-null focusCapabilityId; the other 2 (all-pass, changed candidate after planning) are exercised by their own dedicated tests above");
});

// ===============================================================================================
// AC1 -- aggregate verdict, kept separate from the per-capability evaluator
// ===============================================================================================

test("AC1: one-required-skipped -- a required capability at a non-accepted outcome blocks", () => {
  const fixture = fixtureById("one-required-skipped");
  const outcomeMap = evaluateAllCapabilities(fixture.candidate, fixture.plan);
  const verdict = aggregateVerdict(outcomeMap, fixture.plan);
  assert.strictEqual(verdict.blocking, true);
  assert.deepStrictEqual(verdict.offendingCapabilities, [{ capabilityId: "sca", outcome: "required-capability-missing" }]);
});

test("AC1: optional-skipped -- all-required-pass and only-optional-non-pass reports green (non-blocking)", () => {
  const fixture = fixtureById("optional-skipped");
  const outcomeMap = evaluateAllCapabilities(fixture.candidate, fixture.plan);
  assert.strictEqual(outcomeMap.license, "not-applicable", "the optional capability's own outcome is still computed, just never inspected by the aggregate");
  const verdict = aggregateVerdict(outcomeMap, fixture.plan);
  assert.strictEqual(verdict.blocking, false);
  assert.deepStrictEqual(verdict.offendingCapabilities, []);
});

test("AC1: all-pass reports green", () => {
  const fixture = fixtureById("all-pass");
  const outcomeMap = evaluateAllCapabilities(fixture.candidate, fixture.plan);
  const verdict = aggregateVerdict(outcomeMap, fixture.plan);
  assert.strictEqual(verdict.blocking, false);
  assert.deepStrictEqual(verdict.offendingCapabilities, []);
});

test("AC1: all-skipped -- every required capability missing blocks with one offender per required capability", () => {
  const fixture = fixtureById("all-skipped");
  const outcomeMap = evaluateAllCapabilities(fixture.candidate, fixture.plan);
  const verdict = aggregateVerdict(outcomeMap, fixture.plan);
  assert.strictEqual(verdict.blocking, true);
  assert.strictEqual(verdict.offendingCapabilities.length, fixture.plan.required.length);
});

// ===============================================================================================
// AC2 -- all-skipped vs one-required-skipped: same coarse enum member, distinct typed detail
// ===============================================================================================

test("AC2: all-skipped and one-required-skipped share the SAME RUN_OUTCOMES member but carry distinct, programmatically-checkable diagnostic detail", () => {
  const allSkipped = fixtureById("all-skipped");
  const oneRequiredSkipped = fixtureById("one-required-skipped");

  const allSkippedFocus = evaluateCapability(allSkipped.candidate, allSkipped.focusCapabilityId, allSkipped.plan);
  const oneRequiredSkippedFocus = evaluateCapability(oneRequiredSkipped.candidate, oneRequiredSkipped.focusCapabilityId, oneRequiredSkipped.plan);

  // The coarse property AC2 is actually about: identical enum member...
  assert.strictEqual(allSkippedFocus.outcome, "required-capability-missing");
  assert.strictEqual(oneRequiredSkippedFocus.outcome, "required-capability-missing");
  assert.strictEqual(allSkippedFocus.outcome, oneRequiredSkippedFocus.outcome, "both fixtures' focus outcome must be the same coarse enum member");

  // ...yet distinguishable via typed detail fields, not merely by a different focus id.
  assert.notStrictEqual(allSkippedFocus.reason, oneRequiredSkippedFocus.reason);
  assert.notStrictEqual(allSkippedFocus.tool, oneRequiredSkippedFocus.tool);
  assert.notStrictEqual(allSkippedFocus.capabilityId, oneRequiredSkippedFocus.capabilityId);

  // Strengthen beyond "two different ids": the "all vs one" semantic itself is checkable via
  // the aggregate function's offender-list SHAPE (count), independent of which specific
  // capability ids happen to be involved.
  const allSkippedVerdict = aggregateVerdict(evaluateAllCapabilities(allSkipped.candidate, allSkipped.plan), allSkipped.plan);
  const oneRequiredSkippedVerdict = aggregateVerdict(evaluateAllCapabilities(oneRequiredSkipped.candidate, oneRequiredSkipped.plan), oneRequiredSkipped.plan);
  assert.strictEqual(allSkippedVerdict.offendingCapabilities.length, 2, "all-skipped: both required capabilities (secrets, sca) are missing");
  assert.strictEqual(oneRequiredSkippedVerdict.offendingCapabilities.length, 1, "one-required-skipped: exactly one required capability (sca) is missing");
});

// ===============================================================================================
// F-3 projection -- the one ratified example, using one-required-skipped/optional-skipped's
// own plan membership to supply the `required` boolean (see this module's header comment: the
// run outcome itself is passed directly, never re-derived by re-running optional-skipped
// through the evaluator, since that fixture's real per-capability outcome is "not-applicable").
// ===============================================================================================

test("F-3: required-capability-missing projects to not-met when required (one-required-skipped's own plan), unavailable when optional (optional-skipped's own plan)", () => {
  const oneRequiredSkipped = fixtureById("one-required-skipped");
  const optionalSkipped = fixtureById("optional-skipped");

  const requiredCapabilityWasRequired = oneRequiredSkipped.plan.required.includes(oneRequiredSkipped.focusCapabilityId);
  const optionalCapabilityWasOptional = optionalSkipped.plan.optional.includes(optionalSkipped.focusCapabilityId);
  assert.strictEqual(requiredCapabilityWasRequired, true);
  assert.strictEqual(optionalCapabilityWasOptional, true);

  assert.strictEqual(projectRunOutcomeToControlResult("required-capability-missing", { required: true }), "not-met");
  assert.strictEqual(projectRunOutcomeToControlResult("required-capability-missing", { required: false }), "unavailable");
});

test("F-3: every RUN_OUTCOMES member projects to a member of CONTROL_RESULTS, for both required and optional", () => {
  for (const runOutcome of RUN_OUTCOMES) {
    for (const required of [true, false]) {
      const projected = projectRunOutcomeToControlResult(runOutcome, { required });
      assert.ok(CONTROL_RESULTS.includes(projected), `projection of "${runOutcome}" (required=${required}) returned "${projected}", not a CONTROL_RESULTS member`);
    }
  }
});

test("F-3: rejects an unrecognized run outcome rather than silently returning \"unknown\"", () => {
  assert.throws(() => projectRunOutcomeToControlResult("not-a-real-outcome", { required: true }), TypeError);
});

// ===============================================================================================
// PART A -- schema-validation fixtures (AC4, AC5, AC6)
// ===============================================================================================

function buildValidFinding() {
  return { tool: "gitleaks", severity: "high", rule: "generic-api-key", path: "src/config.js", line: 12, msg: "secret detected" };
}

function buildValidCoverageRecord() {
  return {
    subject: "candidate-tree",
    exclusions: ["vendor/**"],
    ignored: [],
    unsupportedScope: [],
    truncation: { truncated: false, scannedFileCount: 120, totalEligibleFileCount: 120 },
    dataAge: { ageSeconds: 0, snapshotAt: "2026-07-25T00:00:00.000Z" },
  };
}

function buildValidCapabilityRecord() {
  return {
    capabilityId: "cap.secrets",
    tool: { name: "gitleaks", version: "8.18.0" },
    rulePack: { ref: "governance/security-controls/gitleaks-rules", digest: "sha256:aaaa" },
    status: "PASS",
    classification: "success",
    findings: [],
    coverage: buildValidCoverageRecord(),
    reason: null,
  };
}

function buildValidEnvelope() {
  return {
    schema: SECURITY_EVIDENCE_V2_SCHEMA,
    policy: { configurationSha256: "sha256:bbbb" },
    input: { commit: "abc123", tree: "tree-abc", inputSha256: "sha256:cccc" },
    environment: { platform: "win32", nodeVersion: "20.11.0" },
    capabilities: [buildValidCapabilityRecord()],
  };
}

test("PART A: a fully valid v2 envelope validates", () => {
  const result = validateSecurityEvidenceV2(buildValidEnvelope());
  assert.deepStrictEqual(result, { valid: true });
});

// --- AC4: identity fields required non-empty; dropping any one rejects, for >=2 different fields ---

test("AC4: dropping the envelope-level \"policy\" identity field rejects the envelope", () => {
  const envelope = buildValidEnvelope();
  delete envelope.policy;
  const result = validateSecurityEvidenceV2(envelope);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "policy"), "expected a rejection naming the missing policy identity field");
});

test("AC4: dropping the envelope-level \"input\" identity field rejects the envelope", () => {
  const envelope = buildValidEnvelope();
  delete envelope.input;
  const result = validateSecurityEvidenceV2(envelope);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "input"), "expected a rejection naming the missing input identity field");
});

test("AC4: dropping the envelope-level \"environment\" identity field rejects the envelope", () => {
  const envelope = buildValidEnvelope();
  delete envelope.environment;
  const result = validateSecurityEvidenceV2(envelope);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "environment"), "expected a rejection naming the missing environment identity field");
});

test("AC4: dropping the per-capability \"tool\" identity field rejects that capability record", () => {
  const record = buildValidCapabilityRecord();
  delete record.tool;
  const result = validateCapabilityRecord(record);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "tool"), "expected a rejection naming the missing tool identity field");
});

test("AC4: dropping the per-capability \"rulePack\" (rule-pack/config) identity field rejects that capability record", () => {
  const record = buildValidCapabilityRecord();
  delete record.rulePack;
  const result = validateCapabilityRecord(record);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "rulePack"), "expected a rejection naming the missing rule-pack/config identity field");
});

test("AC4: dropping the per-capability \"capabilityId\" identity field rejects that capability record", () => {
  const record = buildValidCapabilityRecord();
  delete record.capabilityId;
  const result = validateCapabilityRecord(record);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "capabilityId"), "expected a rejection naming the missing capability identity field");
});

// --- AC5: closed finding envelope + closed coverage record, each with a malformed variant rejected ---

test("AC5: a full finding envelope validates", () => {
  assert.deepStrictEqual(validateFindingEnvelope(buildValidFinding()), { valid: true });
});

test("AC5: a finding envelope with an invalid severity is rejected", () => {
  const finding = { ...buildValidFinding(), severity: "urgent" };
  const result = validateFindingEnvelope(finding);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "severity" && e.code === "invalid-enum"));
});

test("AC5: a finding envelope with an unknown extra field is rejected (closed schema)", () => {
  const finding = { ...buildValidFinding(), cve: "CVE-2024-0001" };
  const result = validateFindingEnvelope(finding);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "cve" && e.code === "unknown-field"));
});

test("AC5: a finding envelope with a non-integer line is rejected", () => {
  const finding = { ...buildValidFinding(), line: "12" };
  const result = validateFindingEnvelope(finding);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "line"));
});

test("AC5: a full coverage record validates", () => {
  assert.deepStrictEqual(validateCoverageRecord(buildValidCoverageRecord()), { valid: true });
});

test("AC5: a coverage record with an unknown extra field is rejected (closed schema)", () => {
  const coverage = { ...buildValidCoverageRecord(), extraField: "nope" };
  const result = validateCoverageRecord(coverage);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "extraField" && e.code === "unknown-field"));
});

test("AC5: a coverage record whose truncation.truncated is not a boolean is rejected", () => {
  const coverage = buildValidCoverageRecord();
  coverage.truncation = { ...coverage.truncation, truncated: "yes" };
  const result = validateCoverageRecord(coverage);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "truncation.truncated"));
});

// --- AC6: six always-present coverage fields; empty is valid, absent is not ---

test("AC6: a coverage record with all six fields present-but-empty is VALID", () => {
  const emptyButPresent = {
    subject: "",
    exclusions: [],
    ignored: [],
    unsupportedScope: [],
    truncation: { truncated: false, scannedFileCount: null, totalEligibleFileCount: null },
    dataAge: { ageSeconds: null, snapshotAt: null },
  };
  assert.deepStrictEqual(validateCoverageRecord(emptyButPresent), { valid: true });
});

for (const field of ["subject", "exclusions", "ignored", "unsupportedScope", "truncation", "dataAge"]) {
  test(`AC6: a coverage record missing "${field}" entirely (not just empty) is REJECTED`, () => {
    const coverage = buildValidCoverageRecord();
    delete coverage[field];
    const result = validateCoverageRecord(coverage);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.field === field), `expected a rejection naming the missing "${field}" field`);
  });
}

test("PART A: the finding severity enum and control-result/run-outcome enums are exactly their documented sets", () => {
  assert.deepStrictEqual(FINDING_SEVERITIES, ["critical", "high", "medium", "low", "info"]);
  assert.deepStrictEqual(CONTROL_RESULTS, ["met", "not-met", "not-applicable", "unavailable", "waived", "unknown", "invalid"]);
});
