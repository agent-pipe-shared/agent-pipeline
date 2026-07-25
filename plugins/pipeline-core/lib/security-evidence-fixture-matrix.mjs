// SPDX-License-Identifier: SUL-1.0
//
// CYB-2A -- fixture matrix for the failure/compatibility classes named in
// specs/2026-07-24-sprint-cyborg-epic/cyb-2-feature-spec.md §4 (AC12).
// FOUNDATION ONLY (Wave 1 of the CYB-2 body-slicing plan): this module builds
// the fixtures and a deliberately-not-yet-passing test harness around them.
// It does NOT build the real evaluator, capability-plan resolution, or the
// `security-evidence.v2` schema -- that is CYB-2B, a separate later
// sub-package. See plugins/pipeline-core/lib/security-evidence-fixture-matrix.test.mjs
// for the negative-gate test suite that consumes this module.
//
// Exports:
//   RUN_OUTCOMES            -> the frozen 10-member L3 per-capability run-
//                               outcome enum, mirrored (read-only) from
//                               cyb-1f-schema-boundary-draft.md §7. That file
//                               remains the frozen source of truth; this is a
//                               local copy for fixture annotation only.
//   FIXTURE_MATRIX           -> frozen array of the fixture objects (see
//                               shape below).
//   evaluateFixturePlaceholder(fixture) -> the temporary stub (see STUB
//                               section near the bottom of this file).
//
// 14-vs-15 count (report this, do not silently resolve it): cyb-2-feature-
// spec.md §4 lists exactly FOURTEEN dot-separated failure/compatibility
// classes, immediately followed by its own prose calling them "these
// fifteen fixtures." This module implements exactly the fourteen items as
// literally enumerated in §4 -- no class was merged, renamed, or invented to
// reach fifteen. This is a genuine spec-precision gap for the Elephant to
// reconcile, not resolved here.
//
// Fixture object shape (design choice made under this task's granted
// latitude):
//   {
//     id: string,                 // exact class label from §4, unique
//     description: string,        // one-line human-readable summary
//     candidate: {
//       schema: "pipeline.security-evidence.v1",
//       capabilities: [ { id, tool, status, classification, findings, raw,
//                          reason } , ... ],
//       // optional additive context fields (only on the fixtures that need
//       // them): platform, rulePackDetail, coverageDetail, policyDrift,
//       // candidateBinding -- see per-fixture comments below.
//     },
//     plan: { required: string[], optional: string[] },  // capability ids
//     focusCapabilityId: string | null,
//     expectedOutcome: string,     // exact RUN_OUTCOMES member spelling
//   }
//
// Design rationale for the candidate/plan split (this is the one deliberate
// design decision worth spelling out): each `candidate.capabilities[]` entry
// is kept STRICTLY to the real v1 per-adapter contract already shipping in
// harness/scripts/security-adapters/gitleaks.mjs and aggregated by
// harness/scripts/security-scan.mjs's `scannerEntry()` --
// `{status, classification, findings, raw, reason?}` plus the `tool` name
// and a short capability `id` for cross-referencing. Requiredness
// (required vs optional capability) is an L2-plan concept that does not
// exist in v1 at all -- it is exactly the gap CYB-2 exists to close -- so it
// is kept as a SEPARATE `plan` field on the fixture, never mixed into the
// v1-shaped `candidate.capabilities[]` entries themselves. This keeps the
// `candidate` object honestly v1-shaped (no invented/unrelated fields on the
// per-capability contract) while still letting fixtures like
// `one-required-skipped` vs `optional-skipped` be distinguished from data,
// not just from a label.
//
// `focusCapabilityId` names which capability entry in `candidate.capabilities`
// the `expectedOutcome` annotation is actually about (CYB-1F §7's enum is
// explicitly the "per-capability run outcome enum," not an aggregate-run
// verdict enum). `null` means the annotation is about the candidate as a
// whole (e.g. `all-pass`, `changed candidate after planning`).
//
// Several fixtures intentionally share the same RUN_OUTCOMES member (e.g.
// `environment execution failure` / `timeout/cancellation` /
// `cross-platform tool resolution` all expect `execution-unavailable`;
// `empty/stale rule pack` / `version/config/policy drift` both expect
// `stale`). The 10-state enum is coarser than the full diagnostic space by
// design (mirrors the real code's own pattern, e.g. `classification:
// "execution_environment"` vs `"scanner_error"` under the same `"ERROR"`
// status) -- each fixture still carries a distinct `id` and a distinct
// `reason` string, so no class is merged or made indistinguishable; AC2's
// "distinct typed codes" requirement is read as distinct diagnostics, not
// necessarily distinct enum members, since the enum members are its own
// closed, frozen set (CYB-1F §7) that this task does not get to extend.
// `waived` (the tenth enum member) is not the expected outcome of any of the
// fourteen classes below -- none of them is a governed-waiver scenario; this
// is a simple observation, not a defect (the DoD requires a valid enum
// member per fixture, not coverage of every member).
//
// STUB MECHANISM (temporary, replaced by CYB-2B): `evaluateFixturePlaceholder`
// always returns the fixed sentinel string "not-yet-implemented", which is
// deliberately NOT a member of RUN_OUTCOMES. Every fixture's test therefore
// asserts `evaluateFixturePlaceholder(fixture) === fixture.expectedOutcome`,
// which is guaranteed to fail today with a clear actual-vs-expected mismatch
// naming the sentinel and the real expected value -- not a generic
// import-crash. See the clearly marked "REPLACE WHEN CYB-2B LANDS" section
// near the bottom of this file. NEXT READER: when CYB-2B's real evaluator
// lands, delete/replace ONLY that one function (and the sentinel constant);
// nothing else in this file should need to change. The fixtures and their
// `expectedOutcome` annotations are permanent regression material -- CYB-2B
// should make these tests pass ONE AT A TIME as each capability class is
// implemented, never all fifteen^H^H^Hfourteen at once by accident (a
// sudden all-green flip on this suite is itself a smell worth investigating,
// not a milestone to celebrate uncritically).
//
// Purity: this module does no fs/network I/O -- every fixture is an in-memory
// literal. Nothing here reads a real file or spawns a process.

/** CYB-1F §7's frozen L3 per-capability run-outcome enum (read-only mirror; do not diverge). */
export const RUN_OUTCOMES = Object.freeze([
  "pass",
  "findings",
  "required-capability-missing",
  "unsupported",
  "execution-unavailable",
  "partial-coverage",
  "stale",
  "invalid",
  "not-applicable",
  "waived",
]);

// ---------------------------------------------------------------------------------------------
// The fixture matrix -- exactly the fourteen classes as literally enumerated in
// cyb-2-feature-spec.md §4, in the same order, none merged/renamed/dropped.
// ---------------------------------------------------------------------------------------------

export const FIXTURE_MATRIX = Object.freeze([
  Object.freeze({
    id: "all-pass",
    description: "Every required and optional capability ran and reported a clean result.",
    candidate: Object.freeze({
      schema: "pipeline.security-evidence.v1",
      capabilities: Object.freeze([
        Object.freeze({ id: "secrets", tool: "gitleaks", status: "PASS", classification: "success", findings: Object.freeze([]), raw: null, reason: null }),
        Object.freeze({ id: "sca", tool: "osv-scanner", status: "PASS", classification: "success", findings: Object.freeze([]), raw: null, reason: null }),
        Object.freeze({ id: "sast", tool: "semgrep", status: "PASS", classification: "success", findings: Object.freeze([]), raw: null, reason: null }),
        Object.freeze({ id: "license", tool: "license-check", status: "PASS", classification: "success", findings: Object.freeze([]), raw: null, reason: null }),
      ]),
    }),
    plan: Object.freeze({ required: Object.freeze(["secrets", "sca", "sast"]), optional: Object.freeze(["license"]) }),
    focusCapabilityId: null,
    expectedOutcome: "pass",
  }),

  Object.freeze({
    id: "blocking+non-blocking findings",
    description: "One capability reports a blocking-severity finding while another reports only a non-blocking one.",
    candidate: Object.freeze({
      schema: "pipeline.security-evidence.v1",
      capabilities: Object.freeze([
        Object.freeze({
          id: "secrets", tool: "gitleaks", status: "FINDINGS", classification: "findings",
          findings: Object.freeze([Object.freeze({ tool: "gitleaks", severity: "high", rule: "generic-api-key", path: "src/config.js", line: 12, msg: "secret detected" })]),
          raw: null, reason: null,
        }),
        Object.freeze({
          id: "sast", tool: "semgrep", status: "FINDINGS", classification: "findings",
          findings: Object.freeze([Object.freeze({ tool: "semgrep", severity: "low", rule: "style-nit", path: "src/util.js", line: 4, msg: "non-blocking style finding" })]),
          raw: null, reason: null,
        }),
      ]),
    }),
    plan: Object.freeze({ required: Object.freeze(["secrets", "sast"]), optional: Object.freeze([]) }),
    focusCapabilityId: "secrets",
    expectedOutcome: "findings",
  }),

  Object.freeze({
    id: "all-skipped",
    description: "Every capability in the plan (required and optional alike) is skipped -- no scanner binary available anywhere.",
    candidate: Object.freeze({
      schema: "pipeline.security-evidence.v1",
      capabilities: Object.freeze([
        Object.freeze({ id: "secrets", tool: "gitleaks", status: "SKIPPED", classification: "binary_missing", findings: Object.freeze([]), raw: null, reason: "gitleaks not found on PATH" }),
        Object.freeze({ id: "sca", tool: "osv-scanner", status: "SKIPPED", classification: "binary_missing", findings: Object.freeze([]), raw: null, reason: "osv-scanner not found on PATH" }),
        Object.freeze({ id: "sast", tool: "semgrep", status: "SKIPPED", classification: "binary_missing", findings: Object.freeze([]), raw: null, reason: "semgrep not found on PATH" }),
        Object.freeze({ id: "license", tool: "license-check", status: "SKIPPED", classification: "declared_licenses_missing", findings: Object.freeze([]), raw: null, reason: "third-party-licenses.json absent" }),
      ]),
    }),
    plan: Object.freeze({ required: Object.freeze(["secrets", "sca"]), optional: Object.freeze(["sast", "license"]) }),
    focusCapabilityId: "secrets",
    expectedOutcome: "required-capability-missing",
  }),

  Object.freeze({
    id: "one-required-skipped",
    description: "A single required capability is skipped while every other required capability passes.",
    candidate: Object.freeze({
      schema: "pipeline.security-evidence.v1",
      capabilities: Object.freeze([
        Object.freeze({ id: "secrets", tool: "gitleaks", status: "PASS", classification: "success", findings: Object.freeze([]), raw: null, reason: null }),
        Object.freeze({ id: "sca", tool: "osv-scanner", status: "SKIPPED", classification: "binary_missing", findings: Object.freeze([]), raw: null, reason: "osv-scanner not found on PATH" }),
        Object.freeze({ id: "sast", tool: "semgrep", status: "PASS", classification: "success", findings: Object.freeze([]), raw: null, reason: null }),
      ]),
    }),
    plan: Object.freeze({ required: Object.freeze(["secrets", "sca", "sast"]), optional: Object.freeze([]) }),
    focusCapabilityId: "sca",
    expectedOutcome: "required-capability-missing",
  }),

  Object.freeze({
    id: "optional-skipped",
    description: "An optional capability is absent/skipped while all required capabilities pass -- must not fail the run.",
    candidate: Object.freeze({
      schema: "pipeline.security-evidence.v1",
      capabilities: Object.freeze([
        Object.freeze({ id: "secrets", tool: "gitleaks", status: "PASS", classification: "success", findings: Object.freeze([]), raw: null, reason: null }),
        Object.freeze({ id: "license", tool: "license-check", status: "SKIPPED", classification: "declared_licenses_missing", findings: Object.freeze([]), raw: null, reason: "third-party-licenses.json absent; optional capability, non-blocking" }),
      ]),
    }),
    plan: Object.freeze({ required: Object.freeze(["secrets"]), optional: Object.freeze(["license"]) }),
    focusCapabilityId: "license",
    // "not-applicable" chosen over "unsupported"/"waived": this is an absent
    // optional capability with an explicit machine-readable reason (AC3),
    // not an unsupported ecosystem and not a governed waiver decision.
    expectedOutcome: "not-applicable",
  }),

  Object.freeze({
    id: "empty/stale rule pack",
    description: "The scanner ran but its resolved rule pack contains zero rules -- a clean result here cannot be trusted as coverage.",
    candidate: Object.freeze({
      schema: "pipeline.security-evidence.v1",
      capabilities: Object.freeze([
        Object.freeze({ id: "sast", tool: "semgrep", status: "PASS", classification: "empty_rule_pack", findings: Object.freeze([]), raw: null, reason: "rules_dir resolved but contains zero rule files" }),
      ]),
      // Additive context beyond the pure per-capability contract, modeled on
      // the real rules_dir concept in harness/scripts/security-scan.mjs's
      // buildAdapterConfig(); not part of the closed per-capability shape.
      rulePackDetail: Object.freeze({ path: "governance/security-controls/semgrep-rules", ruleCount: 0, lastUpdatedAt: "2024-01-01T00:00:00.000Z" }),
    }),
    plan: Object.freeze({ required: Object.freeze(["sast"]), optional: Object.freeze([]) }),
    focusCapabilityId: "sast",
    expectedOutcome: "stale",
  }),

  Object.freeze({
    id: "unsupported language",
    description: "The candidate tree's ecosystem/language has no rule support in the scanner's capability contract.",
    candidate: Object.freeze({
      schema: "pipeline.security-evidence.v1",
      capabilities: Object.freeze([
        Object.freeze({ id: "sast", tool: "semgrep", status: "SKIPPED", classification: "unsupported_ecosystem", findings: Object.freeze([]), raw: null, reason: "candidate tree is entirely COBOL; semgrep has no rule support for this ecosystem" }),
      ]),
    }),
    plan: Object.freeze({ required: Object.freeze(["sast"]), optional: Object.freeze([]) }),
    focusCapabilityId: "sast",
    expectedOutcome: "unsupported",
  }),

  Object.freeze({
    id: "environment execution failure",
    description: "The scanner's child process could not start at all because the execution environment blocks it (EPERM/EACCES).",
    candidate: Object.freeze({
      schema: "pipeline.security-evidence.v1",
      capabilities: Object.freeze([
        Object.freeze({ id: "secrets", tool: "gitleaks", status: "ERROR", classification: "execution_environment", findings: Object.freeze([]), raw: null, reason: "gitleaks could not start a Node child process (EPERM): execution environment blocks Node child processes" }),
      ]),
    }),
    plan: Object.freeze({ required: Object.freeze(["secrets"]), optional: Object.freeze([]) }),
    focusCapabilityId: "secrets",
    expectedOutcome: "execution-unavailable",
  }),

  Object.freeze({
    id: "timeout/cancellation",
    description: "The scanner started but did not finish within its bounded timeout and was killed/cancelled.",
    candidate: Object.freeze({
      schema: "pipeline.security-evidence.v1",
      capabilities: Object.freeze([
        Object.freeze({ id: "sca", tool: "osv-scanner", status: "ERROR", classification: "scanner_error", findings: Object.freeze([]), raw: null, reason: "osv-scanner timed out after 60000ms" }),
      ]),
    }),
    plan: Object.freeze({ required: Object.freeze(["sca"]), optional: Object.freeze([]) }),
    focusCapabilityId: "sca",
    // Shares "execution-unavailable" with `environment execution failure` /
    // `cross-platform tool resolution` -- the 10-state enum has no dedicated
    // timeout member; distinguished by id + reason string, not by enum value.
    expectedOutcome: "execution-unavailable",
  }),

  Object.freeze({
    id: "partial/truncated coverage",
    description: "The scanner completed but only scanned a bounded subset of eligible files -- coverage is visibly truncated.",
    candidate: Object.freeze({
      schema: "pipeline.security-evidence.v1",
      capabilities: Object.freeze([
        Object.freeze({ id: "sast", tool: "semgrep", status: "PASS", classification: "success", findings: Object.freeze([]), raw: null, reason: null }),
      ]),
      // Additive context modeled on the real `coverage: {subject, exclusions}`
      // field in security-scan.mjs's scannerEntry(), extended with the
      // truncation/scope fields AC6 names explicitly.
      coverageDetail: Object.freeze({ subject: "candidate-tree", exclusions: Object.freeze(["vendor/**"]), scannedFileCount: 40, totalEligibleFileCount: 120, truncated: true }),
    }),
    plan: Object.freeze({ required: Object.freeze(["sast"]), optional: Object.freeze([]) }),
    focusCapabilityId: "sast",
    expectedOutcome: "partial-coverage",
  }),

  Object.freeze({
    id: "malformed output",
    description: "The scanner exited cleanly but its report file/output could not be parsed as the documented contract shape.",
    candidate: Object.freeze({
      schema: "pipeline.security-evidence.v1",
      capabilities: Object.freeze([
        Object.freeze({ id: "secrets", tool: "gitleaks", status: "ERROR", classification: "scanner_error", findings: Object.freeze([]), raw: "{not-json", reason: "unparseable gitleaks report JSON: Unexpected token n in JSON at position 1" }),
      ]),
    }),
    plan: Object.freeze({ required: Object.freeze(["secrets"]), optional: Object.freeze([]) }),
    focusCapabilityId: "secrets",
    expectedOutcome: "invalid",
  }),

  Object.freeze({
    id: "version/config/policy drift",
    description: "Identical candidate, but the external rule/config data changed underneath it without a snapshot digest bump.",
    candidate: Object.freeze({
      schema: "pipeline.security-evidence.v1",
      capabilities: Object.freeze([
        Object.freeze({ id: "sast", tool: "semgrep", status: "PASS", classification: "success", findings: Object.freeze([]), raw: null, reason: null }),
      ]),
      // Additive context modeled on the real `policy.configurationSha256`
      // field in security-scan.mjs's securityPolicyBinding().
      policyDrift: Object.freeze({ configurationSha256: "aaaa...unchanged-snapshot-id", previousConfigurationSha256: "bbbb...different-rule-content-same-id", snapshotBumped: false }),
    }),
    plan: Object.freeze({ required: Object.freeze(["sast"]), optional: Object.freeze([]) }),
    focusCapabilityId: "sast",
    // Shares "stale" with `empty/stale rule pack` -- both are "the rule/config
    // data behind a clean result cannot be trusted as-is," distinguished by
    // id + reason/policyDrift detail, not by enum value.
    expectedOutcome: "stale",
  }),

  Object.freeze({
    id: "changed candidate after planning",
    description: "The evidence's bound candidate (commit/tree identity) no longer matches the candidate the plan was built for.",
    candidate: Object.freeze({
      schema: "pipeline.security-evidence.v1",
      capabilities: Object.freeze([
        Object.freeze({ id: "secrets", tool: "gitleaks", status: "PASS", classification: "success", findings: Object.freeze([]), raw: null, reason: null }),
        Object.freeze({ id: "sca", tool: "osv-scanner", status: "PASS", classification: "success", findings: Object.freeze([]), raw: null, reason: null }),
        Object.freeze({ id: "sast", tool: "semgrep", status: "PASS", classification: "success", findings: Object.freeze([]), raw: null, reason: null }),
        Object.freeze({ id: "license", tool: "license-check", status: "PASS", classification: "success", findings: Object.freeze([]), raw: null, reason: null }),
      ]),
      // Additive context modeled on the real candidate-identity fields
      // (commit/tree/inputSha256) in security-scan.mjs's observeCandidate()
      // / sameCandidate().
      candidateBinding: Object.freeze({ plannedCommit: "abc123planned", observedCommit: "def456observed", plannedTree: "tree-abc", observedTree: "tree-def", matches: false }),
    }),
    plan: Object.freeze({ required: Object.freeze(["secrets", "sca", "sast"]), optional: Object.freeze(["license"]) }),
    focusCapabilityId: null,
    expectedOutcome: "invalid",
  }),

  Object.freeze({
    id: "cross-platform tool resolution",
    description: "A scanner binary resolves to a path this platform's trust assessment rejects (e.g. native-Windows PATH walk finds a non-allowlisted executable).",
    candidate: Object.freeze({
      schema: "pipeline.security-evidence.v1",
      capabilities: Object.freeze([
        Object.freeze({ id: "secrets", tool: "gitleaks", status: "ERROR", classification: "execution_environment", findings: Object.freeze([]), raw: null, reason: "resolved gitleaks path was rejected: untrusted-path-outside-allowlist" }),
      ]),
      // Additive context modeled on the real `platform` parameter already
      // accepted by security-scan.mjs's runSecurityScan().
      platform: "win32",
    }),
    plan: Object.freeze({ required: Object.freeze(["secrets"]), optional: Object.freeze([]) }),
    focusCapabilityId: "secrets",
    expectedOutcome: "execution-unavailable",
  }),
]);

// ---------------------------------------------------------------------------------------------
// REPLACE WHEN CYB-2B LANDS -- temporary stub only, not a real evaluator.
// ---------------------------------------------------------------------------------------------

/**
 * Fixed sentinel the stub always returns. Deliberately NOT a member of
 * RUN_OUTCOMES, so every fixture's round-trip assertion
 * (`evaluateFixturePlaceholder(fixture) === fixture.expectedOutcome`) is
 * guaranteed to fail today with a readable actual-vs-expected mismatch.
 */
export const NOT_YET_IMPLEMENTED_OUTCOME = "not-yet-implemented";

/**
 * REPLACE WHEN CYB-2B LANDS.
 *
 * Temporary placeholder standing in for the real capability-plan-matching
 * evaluator (CYB-2B, a separate later sub-package). It deliberately never
 * inspects `fixture.candidate`/`fixture.plan` and always returns the fixed
 * `NOT_YET_IMPLEMENTED_OUTCOME` sentinel -- this is the whole point of a
 * negative-gate fixture matrix: every fixture must fail meaningfully now,
 * before the real evaluator exists, then flip green one at a time as CYB-2B
 * implements each capability class's real classification logic. Do not add
 * real logic here; do not scatter evaluator behavior elsewhere in this file.
 */
export function evaluateFixturePlaceholder(_fixture) {
  return NOT_YET_IMPLEMENTED_OUTCOME;
}
