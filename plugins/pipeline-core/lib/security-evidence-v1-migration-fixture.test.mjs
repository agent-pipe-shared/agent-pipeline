// SPDX-License-Identifier: SUL-1.0
//
// CYB-2H -- v1-shaped evidence evaluated under v2 policy is rejected, never
// silently accepted (specs/2026-07-24-sprint-cyborg-epic/cyb-2-feature-spec.md
// §3 row AC11). Fixture/test-only module: no migration/upgrade tool, no
// change to `harness/scripts/security-scan.mjs`'s real output, no touching of
// CYB-2B's closed schema/evaluator module or its own test file.
//
// WHY THIS TEST EXISTS (AC11's whole point): CYB-2B's v2 schema
// (`pipeline.security-evidence.v2`, plugins/pipeline-core/lib/
// security-evidence-evaluator.mjs) is a NEW, additive schema -- it does not
// reuse or extend v1. But "additive and separate" is only a real guarantee if
// the v2 validator actually checks SHAPE, not just the `schema` string label.
// A validator that happened to only check for fields v1 also has (or that
// merely string-compares `schema`) could let a genuinely stale v1 record
// "pass" as v2 -- exactly the silent-acceptance failure AC11 forbids. This
// file proves, with a concrete v1 record modeled on security-scan.mjs's real
// output, that `validateSecurityEvidenceV2()` rejects it -- and (second case)
// that merely relabeling the `schema` string without restructuring the
// record is ALSO rejected, proving the check is actual shape enforcement,
// not a label check.
//
// No fs/network access, no mutation: this module only builds plain object
// literals and calls the pure `validateSecurityEvidenceV2` import.

import assert from "node:assert/strict";
import { test } from "node:test";

import { SECURITY_EVIDENCE_V2_SCHEMA, validateSecurityEvidenceV2 } from "./security-evidence-evaluator.mjs";

// ---------------------------------------------------------------------------------------------
// A realistic v1 evidence record, recognizably derived from
// harness/scripts/security-scan.mjs's real `evidenceCore` shape (schema
// string, top-level field set, and its `scannerEntry()` per-scanner shape --
// see that file's `runSecurityScan()`/`scannerEntry()` for the fields this
// mirrors). This is a representative subset (four scanners collapsed to two,
// no real git commit/tree values needed) -- not invented from nothing, per
// the briefing's context-file instruction to read security-scan.mjs first.
// ---------------------------------------------------------------------------------------------

const V1_SCHEMA = "pipeline.security-evidence.v1";

function buildRealisticV1Record() {
  return {
    schema: V1_SCHEMA,
    project: "agent-pipeline",
    command: "node harness/scripts/security-scan.mjs",
    commit: "abc123def456",
    candidate: {
      status: "clean",
      commit: "abc123def456",
      tree: "tree-abc123",
      inputSha256: "sha256:candidate-input",
      repositorySha256: "sha256:candidate-repo",
      inventory: { entries: 42, symlinkPolicy: "reject", submodulePolicy: "reject" },
      reason: null,
      snapshot: { method: "git-detached-worktree.v1", verifiedBeforeAfter: true },
    },
    finishedAt: "2026-07-25T00:00:00.000Z",
    thresholds: { block_on: ["critical", "high"] },
    policy: {
      schema: "pipeline.security-policy-binding.v1",
      configurationSha256: "sha256:policy-config",
      inputs: { manifestSha256: null, declaredLicensesSha256: null, licenseAllowlistSha256: null, semgrepRulesPath: null },
      sha256: "sha256:policy-inputs",
    },
    execution: {
      childProcessPreflight: { status: "PASS", classification: "success" },
      snapshotCleanup: { status: "removed" },
    },
    scanners: [
      {
        tool: "gitleaks",
        adapter: "pipeline.security-adapter.v1",
        executableSha256: "sha256:gitleaks-bin",
        status: "PASS",
        classification: "success",
        findingCount: 0,
        coverage: { subject: "candidate-tree", exclusions: [] },
      },
      {
        tool: "osv-scanner",
        adapter: "pipeline.security-adapter.v1",
        executableSha256: "sha256:osv-bin",
        status: "FINDINGS",
        classification: "findings",
        findingCount: 1,
        coverage: { subject: "candidate-tree", exclusions: [] },
      },
    ],
    findings: [
      { tool: "osv-scanner", severity: "high", rule: "CVE-2024-0001", path: "package-lock.json", line: null, msg: "vulnerable dependency" },
    ],
    exitCode: 2,
    payloadSha256: "sha256:evidence-payload",
  };
}

test("AC11: a realistic v1-shaped record (schema pipeline.security-evidence.v1) is rejected by the v2 validator", () => {
  const v1Record = buildRealisticV1Record();
  assert.strictEqual(v1Record.schema, V1_SCHEMA, "fixture precondition: this record must actually carry the real v1 schema string");

  const result = validateSecurityEvidenceV2(v1Record);

  // The whole point of AC11: never silently accepted. `valid` must be exactly
  // `false` -- not merely falsy, not coerced, not upgraded.
  assert.strictEqual(result.valid, false, "a v1-shaped record must never validate as v2 -- silent acceptance would be exactly the AC11 failure mode");
  assert.ok(Array.isArray(result.errors) && result.errors.length > 0, "rejection must carry typed error detail, not just a bare false");

  // Sharpen the assertion beyond "some error fired": the wrong schema string
  // is explicitly named (proves the label mismatch alone is already
  // sufficient to fail this record, independent of any shape difference).
  assert.ok(
    result.errors.some((e) => e.field === "schema" && e.code === "invalid-value"),
    "expected an explicit rejection naming the wrong (v1) schema string",
  );

  // And the v1 envelope's real top-level fields (project/command/commit/
  // candidate/finishedAt/thresholds/execution/scanners/findings/exitCode/
  // payloadSha256) are NOT part of v2's closed ENVELOPE_FIELDS set
  // (schema/policy/input/environment/capabilities) -- every one of them is
  // flagged as an unknown field. This proves rejection is driven by actual
  // shape mismatch, not merely the wrong schema string.
  const unknownFieldNames = result.errors.filter((e) => e.code === "unknown-field").map((e) => e.field);
  for (const v1OnlyField of ["project", "command", "commit", "candidate", "finishedAt", "execution", "scanners", "payloadSha256"]) {
    assert.ok(unknownFieldNames.includes(v1OnlyField), `expected v1-only field "${v1OnlyField}" to be flagged as unknown under v2's closed envelope schema`);
  }

  // v2's own required identity/capabilities fields are genuinely absent from
  // the v1 shape (not just differently named) -- confirm they are reported
  // missing too, so this is a real structural gap, not only "extra fields".
  const missingFieldNames = result.errors.filter((e) => e.code === "missing-or-empty").map((e) => e.field);
  assert.ok(missingFieldNames.includes("input"), "v1 has no envelope-level `input` identity field at all");
  assert.ok(missingFieldNames.includes("environment"), "v1 has no envelope-level `environment` identity field at all");
});

// ---------------------------------------------------------------------------------------------
// Second, stronger case (recommended by the briefing, included here): a v1
// record that has been naively "migrated" by relabeling ONLY its `schema`
// string to the v2 constant, with every other field left exactly v1-shaped
// underneath. If the v2 validator only checked the schema-string label (and
// not the real envelope/capability/finding/coverage shape), this record
// would slip through as a false "valid v2" record -- the exact silent-
// upgrade failure AC11 forbids. Asserting rejection here proves the
// validator enforces actual shape, not just the label.
// ---------------------------------------------------------------------------------------------

test("AC11 (stronger case): a v1 record with ONLY its schema string relabeled to v2, shape left v1-shaped, is ALSO rejected", () => {
  const relabeled = { ...buildRealisticV1Record(), schema: SECURITY_EVIDENCE_V2_SCHEMA };
  assert.strictEqual(relabeled.schema, SECURITY_EVIDENCE_V2_SCHEMA, "fixture precondition: only the schema string was changed");

  const result = validateSecurityEvidenceV2(relabeled);

  assert.strictEqual(result.valid, false, "relabeling the schema string alone must not make a v1-shaped record pass as v2 -- this is the naive-migration trap AC11 guards against");
  assert.ok(Array.isArray(result.errors) && result.errors.length > 0, "rejection must carry typed error detail");

  // The schema string itself now matches, so it must NOT be the reason for
  // rejection this time -- proving the failure comes from actual shape
  // checking, not the label.
  assert.ok(
    !result.errors.some((e) => e.field === "schema"),
    "the schema field itself now matches v2 exactly; it must not appear among the rejection errors",
  );

  // The same v1-only top-level fields are still flagged as unknown, and the
  // same real v2 identity fields are still reported missing -- the relabel
  // changed nothing about the underlying (rejected) shape.
  const unknownFieldNames = result.errors.filter((e) => e.code === "unknown-field").map((e) => e.field);
  assert.ok(unknownFieldNames.includes("candidate"), "underlying v1 shape (e.g. `candidate`) is still present and still unknown under v2's closed schema after a label-only relabel");

  const missingFieldNames = result.errors.filter((e) => e.code === "missing-or-empty").map((e) => e.field);
  assert.ok(missingFieldNames.includes("input"), "relabeling the schema string does not conjure a real `input` identity field into existence");
  assert.ok(missingFieldNames.includes("environment"), "relabeling the schema string does not conjure a real `environment` identity field into existence");
  assert.ok(missingFieldNames.includes("capabilities"), "relabeling the schema string does not conjure real per-capability records into existence");
});
