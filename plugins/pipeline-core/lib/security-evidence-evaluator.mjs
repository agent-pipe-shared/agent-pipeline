// SPDX-License-Identifier: SUL-1.0
//
// CYB-2B -- `pipeline.security-evidence.v2` schema + the pure L3 per-capability
// evaluator (specs/2026-07-24-sprint-cyborg-epic/cyb-2-feature-spec.md §3 rows
// AC1, AC2, AC4, AC5, AC6). Wave 2 of the CYB-2 body-slicing plan; depends on
// CYB-2A's closed fixture matrix (security-evidence-fixture-matrix.mjs) and on
// CYB-1F's F-3 ratification (cyb-1f-schema-boundary-draft.md §7).
//
// This module builds TWO independent things, per the briefing's own framing
// ("build two things, in one new pair of files"):
//
//   (A) the `pipeline.security-evidence.v2` schema -- a NEW, additive,
//       closed evidence-envelope schema. It does not reuse, mutate, or
//       silently extend `pipeline.security-evidence.v1` (harness/scripts/
//       security-scan.mjs's schema string) -- v1 stays exactly as-is, out of
//       scope, a later wave's job. See "PART A" below.
//   (B) the pure L3 per-capability evaluator + a separate aggregate-verdict
//       function + the F-3 run-outcome -> control-result projection. See
//       "PART B" below.
//
// CRITICAL ARCHITECTURAL NOTE (read this before touching PART B): the
// evaluator in PART B does NOT consume or schema-validate against the v2
// schema in PART A. It consumes CYB-2A's fixtures directly, which are
// deliberately kept v1-shaped (`candidate.schema === "pipeline.security-
// evidence.v1"`, see that file's own header) plus a separate `plan` field.
// If the evaluator required v2-shaped input it would reject all 14 closed
// fixtures outright -- that file is frozen and this task may not edit it.
// The v2 schema (PART A) is therefore a genuinely separate deliverable,
// exercised by its own schema-validation fixtures in this module's test
// file, not fed through the evaluator. Wiring a real v2-producing adapter
// pipeline into the evaluator is explicitly CYB-2E/CYB-2D's job (out of
// scope here, per the briefing's field 1).
//
// Exports:
//   PART A (schema):
//     SECURITY_EVIDENCE_V2_SCHEMA    -> the v2 schema string constant.
//     FINDING_SEVERITIES             -> closed severity enum for a finding.
//     validateFindingEnvelope(finding)         -> { valid, errors? }
//     validateCoverageRecord(coverage)         -> { valid, errors? }
//     validateCapabilityRecord(record)         -> { valid, errors? }
//     validateSecurityEvidenceV2(envelope)     -> { valid, errors? }
//   PART B (evaluator):
//     RUN_OUTCOMES                   -> frozen 10-member L3 run-outcome enum
//                                        (CYB-1F §7 mirror, independent copy;
//                                        see "THREE MIRRORS" note below).
//     CONTROL_RESULTS                -> frozen 7-member control-result enum
//                                        (CYB-1F §7 mirror).
//     evaluateCapability(candidate, capabilityId, plan) -> diagnostic object
//                                        { outcome, capabilityId, tool,
//                                          status, classification, reason,
//                                          required }
//     evaluateAllCapabilities(candidate, plan) -> { [capabilityId]: outcome }
//     aggregateVerdict(outcomeMap, plan)       -> { blocking, offendingCapabilities }
//     projectRunOutcomeToControlResult(runOutcome, { required }) -> control-result
//
// ============================================================================
// PART A DESIGN NOTES -- the v2 schema
// ============================================================================
//
// Field placement (envelope-level vs per-capability-level identity): AC4
// requires six identity fields -- capability, tool, rule-pack/config, policy,
// input, environment -- to be non-empty. Rather than inventing an unrelated
// shape, this schema places each identity concept where the REAL code
// already places its closest analogue (per this task's context file,
// harness/scripts/security-scan.mjs):
//   - `policy`, `input`, `environment` are ENVELOPE-level, one per whole scan
//     run -- exactly mirroring security-scan.mjs's own
//     `policy.configurationSha256` (top-level `policy` field),
//     `candidate.commit`/`.tree`/`.inputSha256` (top-level `candidate`
//     field, renamed `input` here since "candidate" already names a
//     different concept in CYB-2A's fixture vocabulary), and the `platform`
//     parameter `runSecurityScan()` already accepts.
//   - `capability` (id), `tool`, `rulePack` (rule-pack/config) are
//     PER-CAPABILITY-level, one per scanner/capability entry -- exactly
//     mirroring the real per-scanner `scannerEntry()`/`buildAdapterConfig()`
//     shape (each scanner has its own tool identity and its own rule-pack/
//     config, e.g. semgrep's `rules_dir`), which envelope-level fields
//     cannot express once more than one tool contributes rule-pack-specific
//     provenance.
// `validateSecurityEvidenceV2()` therefore checks policy/input/environment
// once at the envelope, and delegates to `validateCapabilityRecord()` for
// capability/tool/rulePack, once per capability entry.
//
// Findings (AC5): `validateFindingEnvelope()` is a CLOSED schema (unknown
// keys rejected) with the exact field set CYB-2A's own fixture findings
// already use verbatim (`{tool, severity, rule, path, line, msg}, see e.g.
// the "blocking+non-blocking findings" fixture) -- no invented shape.
// `severity` is a closed enum (`FINDING_SEVERITIES`); `line` is a positive
// integer or `null` (some finding classes, e.g. dependency-level SCA
// findings, are not tied to a single source line).
//
// Coverage (AC5/AC6): `validateCoverageRecord()` is a CLOSED schema with
// exactly six always-present top-level fields (AC6): the five AC6 names
// this task literally (`exclusions`, `ignored`, `unsupportedScope`,
// `truncation`, `dataAge`) plus one judged addition, `subject` -- without a
// baseline "what was in scope" field, `exclusions` alone cannot be
// interpreted (excluded relative to WHAT?). `subject` is not invented: it is
// the exact field name security-scan.mjs's own `scannerEntry()` already
// writes (`coverage: {subject, exclusions}`). Each field may be empty
// (empty string/array, `false`, `null`) but the KEY must always be present --
// `hasOwn()` checks enforce "absent is not [valid]" per AC6's own wording.
// `truncation`/`dataAge` are themselves small closed sub-objects (not bare
// booleans/numbers) so that `truncation.scannedFileCount`/
// `.totalEligibleFileCount` (modeled on CYB-2A's own `coverageDetail`
// fixture field names) can travel alongside the boolean flag.
//
// ============================================================================
// PART B DESIGN NOTES -- the per-capability evaluator
// ============================================================================
//
// THREE MIRRORS (deliberate, not an oversight): CYB-1F §7 is the frozen
// source of truth for RUN_OUTCOMES; security-evidence-fixture-matrix.mjs
// (CYB-2A) keeps its own read-only local copy "for fixture annotation
// only"; this file keeps a THIRD independent copy for the same reason one
// module further down the dependency chain should not import a frozen enum
// from a sibling *fixture* file (a production evaluator depending on a test-
// fixture module's exports would be a backwards dependency direction). All
// three copies must stay byte-identical; the test file asserts this file's
// RUN_OUTCOMES `deepStrictEqual`s the one CYB-2A exports, to catch silent
// divergence between the three mirrors.
//
// `status` (PASS/FINDINGS/SKIPPED/ERROR, v1-inherited, unchanged in v2's
// CapabilityRecord for continuity) is NOT the same vocabulary as
// RUN_OUTCOMES: `status` is the raw tool-execution result; RUN_OUTCOMES is
// the classified L3 evaluator OUTPUT, computed from status + classification
// + additive candidate-level context. Conflating the two would collapse the
// exact distinction CYB-1F draws between "run outcome" (L3, per-capability)
// and "control result" (catalog-level) one layer too early.
//
// Classification logic (evaluateCapability), in priority order:
//   1. CANDIDATE-BINDING OVERRIDE (highest priority, applies to every
//      capability uniformly): if `candidate.candidateBinding.matches ===
//      false`, every capability's outcome becomes `"invalid"` regardless of
//      that capability's own status. This is FORCED, not merely a style
//      choice: `aggregateVerdict()`'s contract (AC1's own wording) is
//      `(outcomeMap, plan)` only -- it never sees `candidateBinding`. If a
//      per-capability evaluation instead reported the capability's own
//      (truthfully passing) status here, the aggregate would see
//      all-required-pass and report GREEN for the "changed candidate after
//      planning" fixture -- silently wrong, since the fault is that the
//      EVIDENCE no longer describes the candidate the plan was built for,
//      not that any tool's own result was bad (the fixture's own comment
//      says exactly this). Surfacing the fault at the per-capability layer
//      is therefore the only way "per-capability outcomes + the aggregate
//      function together" (briefing's own phrasing) can produce `invalid`
//      for every capability in that fixture without widening the aggregate
//      function's contract beyond what AC1 specifies. This is candidate-
//      integrity poisoning every result equally, not a claim that any one
//      tool's own result was itself bad -- kept as a distinct
//      `classification: "candidate_binding_mismatch"` (not the capability's
//      real classification) so this is diagnosable, never silently
//      conflated with a real scanner_error.
//   2. CLASSIFICATION OVERRIDES (apply regardless of status):
//      `classification === "unsupported_ecosystem"` -> `"unsupported"`;
//      `classification === "execution_environment"` -> `"execution-
//      unavailable"`. Both hold even for a SKIPPED status (an unsupported-
//      ecosystem skip is about applicability, not presence, so it must not
//      be conflated with `required-capability-missing` even for a required
//      capability -- confirmed against the "unsupported language" fixture,
//      whose capability IS required yet still expects `"unsupported"`).
//   3. STATUS SWITCH (v1's four-member enum):
//      - SKIPPED -> `required-capability-missing` if this capability is in
//        `plan.required`, else `not-applicable` (matches `one-required-
//        skipped`/`all-skipped` vs `optional-skipped` exactly).
//      - ERROR -> the raw-presence discriminator: `capability.raw != null`
//        -> `"invalid"`, else `"execution-unavailable"`. Both "timeout/
//        cancellation" and "malformed output" carry the SAME classification
//        (`"scanner_error"`) yet expect DIFFERENT outcomes -- classification
//        alone cannot distinguish them (confirmed by reading both fixtures'
//        `classification` strings directly, per the briefing's own
//        instruction). `raw` (the scanner's captured raw output) is a
//        STRUCTURAL signal, not a reason-string keyword match: a timed-out/
//        killed process never produced parseable output (`raw: null`); a
//        process that exited but wrote unparseable output has a non-null
//        `raw` (CYB-2A's fixture literally sets `raw: "{not-json"`). This is
//        more robust than sniffing the `reason` string for "timeout" vs
//        "JSON", which is prose and not a contract.
//      - FINDINGS -> `"findings"` (severity-based blocking assessment is an
//        aggregate/L1-policy concern, out of scope for a per-capability
//        outcome; both a blocking-severity and a non-blocking-severity
//        finding map to the same per-capability `"findings"` outcome).
//      - PASS -> checked against three candidate-level additive-context
//        overrides, in this order: `policyDrift` (silent config drift:
//        `snapshotBumped === false` AND the two config digests differ) ->
//        `"stale"`; `classification === "empty_rule_pack"` or
//        `rulePackDetail.ruleCount === 0` -> `"stale"`; `coverageDetail.
//        truncated === true` -> `"partial-coverage"`; otherwise `"pass"`.
//        SCOPE LIMITATION (documented, not silently assumed): these three
//        additive fields are CANDIDATE-level in CYB-2A's fixtures, not
//        per-capability, because every fixture that uses one of them has
//        exactly one capability entry -- applying the whole-candidate
//        context to "the" capability is unambiguous there. A real multi-
//        capability v2 evidence record would carry rule-pack/coverage/drift
//        provenance PER capability (see PART A's `rulePack`/`coverage`
//        fields, which already model this correctly) -- wiring that richer
//        per-capability signal into a production evaluator is CYB-2E's job,
//        not this fixture-matching task's.
//
// AC2 (typed diagnostic detail): `evaluateCapability()` never returns a bare
// enum string as its primary result -- it returns an object carrying
// `capabilityId`/`tool`/`status`/`classification`/`reason`/`required`
// alongside `outcome`. `all-skipped`'s "secrets" (`required-capability-
// missing`, reason "gitleaks not found on PATH") and `one-required-
// skipped`'s "sca" (also `required-capability-missing`, reason "osv-scanner
// not found on PATH") therefore carry the SAME coarse enum member but
// distinguishable detail -- this is the intended property (a coarse,
// closed, ten-member enum with a richer diagnostic layer on top), not a
// gap. The primary DoD comparison against `fixture.expectedOutcome` reads
// only `.outcome`.
//
// Aggregate function (AC1) is kept SEPARATE from the per-capability
// evaluator on purpose -- different granularity, per CYB-1F §7's own note
// that the run-outcome enum is explicitly "the per-capability run outcome
// enum," not an aggregate-verdict enum. `aggregateVerdict(outcomeMap, plan)`
// only inspects `plan.required` capabilities (an optional capability's own
// non-pass outcome never blocks, matching `optional-skipped`'s fixture
// intent) and reports `{ blocking, offendingCapabilities }` -- the offender
// list length itself is further AC2-relevant diagnostic detail (`all-
// skipped` yields two offenders; `one-required-skipped` yields one).
//
// F-3 projection (`projectRunOutcomeToControlResult`): the ONE ratified
// example (cyb-1f-schema-boundary-draft.md §7/§10, F-3) is
// `required-capability-missing -> not-met` under a required policy vs
// `-> unavailable` under an optional one. This function is a general,
// direct mapping table -- callers pass the run outcome AND the `required`
// boolean explicitly; it does not re-derive either from re-running the
// evaluator on a fixture. This distinction matters concretely: running
// CYB-2A's own `optional-skipped` fixture through `evaluateCapability()`
// yields `"not-applicable"`, NOT `"required-capability-missing"` (see the
// SKIPPED branch above) -- `optional-skipped`'s role in this file's test
// suite is only to supply the `required: false` half of the ratified F-3
// pair (via its own `plan.optional` membership), never to reproduce
// `required-capability-missing` itself. Beyond the one ratified pair, this
// task's own design latitude covers the rest of the table:
//   - `pass -> met`, `findings -> not-met`, `waived -> waived`,
//     `not-applicable -> not-applicable` (direct 1:1; each of these run
//     outcomes already encodes its own definitive state).
//   - `unsupported -> not-applicable` (requiredness-insensitive: ecosystem
//     inapplicability is the same fact whether or not the capability was
//     required -- mirrors CYB-1F §3's "where applicable" families note that
//     applicability is decided by the resolver, never by omission).
//   - `invalid -> invalid` (requiredness-insensitive: a structural/binding
//     fault maps onto the control-result enum's own explicit `invalid`
//     member unchanged).
//   - `execution-unavailable`, `partial-coverage`, `stale` -> same shape as
//     the ratified `required-capability-missing` pair (`not-met` if
//     required, `unavailable` if optional). All four of these run outcomes
//     share the same underlying shape -- "the check could not be completed
//     or confirmed," as opposed to a proven pass/fail -- and CYB-1F's own
//     AC1 already groups every one of them together as "non-accepted" for
//     blocking purposes; this projection mirrors that same grouping rather
//     than inventing a fourth bespoke rule per enum member.
//   - `unknown` (a CONTROL_RESULTS member) is never produced by this
//     projection -- every one of the ten run outcomes already has a
//     definite classification under this design. Documented as an
//     observation (mirrors CYB-2A's own "`waived` is not the expected
//     outcome of any of the fourteen classes" note), not a defect.
//
// Purity: every exported function here is synchronous and pure -- no
// fs/network/child_process access, no mutation of any input argument (this
// file imports nothing beyond its own local helpers; there is no import
// statement in this module at all, which is itself the purity proof a
// reviewer can check by reading the top of the file).

// ---------------------------------------------------------------------------------------------
// Small structural predicates (local; no imports needed anywhere in this file).
// ---------------------------------------------------------------------------------------------

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function isNullableString(value) {
  return value === null || typeof value === "string";
}
function isNullableNumber(value) {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}
function isStringArray(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

// ===============================================================================================
// PART A -- the `pipeline.security-evidence.v2` schema
// ===============================================================================================

/** The v2 schema string. Additive/new -- never collides with or mutates `pipeline.security-evidence.v1`. */
export const SECURITY_EVIDENCE_V2_SCHEMA = "pipeline.security-evidence.v2";

/** Closed finding-severity enum (AC5). */
export const FINDING_SEVERITIES = Object.freeze(["critical", "high", "medium", "low", "info"]);

const FINDING_FIELDS = Object.freeze(["tool", "severity", "rule", "path", "line", "msg"]);

/**
 * Validates one finding envelope (AC5): closed shape, exactly
 * `{tool, severity, rule, path, line, msg}` -- the field set CYB-2A's own
 * fixtures already use verbatim. Pure; never throws on malformed input --
 * returns a typed rejection instead (mirrors control-evaluation-receipt.mjs's
 * `validateEvaluationReceipt` typed-rejection style).
 */
export function validateFindingEnvelope(finding) {
  if (!isPlainObject(finding)) {
    return { valid: false, errors: [{ field: "$", code: "not-an-object", message: "finding envelope must be a plain object" }] };
  }
  const errors = [];
  for (const key of Object.keys(finding)) {
    if (!FINDING_FIELDS.includes(key)) {
      errors.push({ field: key, code: "unknown-field", message: `finding envelope is closed; unexpected field "${key}"` });
    }
  }
  if (!isNonEmptyString(finding.tool)) {
    errors.push({ field: "tool", code: "missing-or-empty", message: "tool is required and must be a non-empty string" });
  }
  if (!FINDING_SEVERITIES.includes(finding.severity)) {
    errors.push({ field: "severity", code: "invalid-enum", message: `severity must be one of: ${FINDING_SEVERITIES.join(", ")}` });
  }
  if (!isNonEmptyString(finding.rule)) {
    errors.push({ field: "rule", code: "missing-or-empty", message: "rule is required and must be a non-empty string" });
  }
  if (!isNonEmptyString(finding.path)) {
    errors.push({ field: "path", code: "missing-or-empty", message: "path is required and must be a non-empty string" });
  }
  if (!(finding.line === null || (Number.isInteger(finding.line) && finding.line >= 1))) {
    errors.push({ field: "line", code: "invalid-type", message: "line must be a positive integer or null (not every finding class is line-bound)" });
  }
  if (!isNonEmptyString(finding.msg)) {
    errors.push({ field: "msg", code: "missing-or-empty", message: "msg is required and must be a non-empty string" });
  }
  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

const COVERAGE_FIELDS = Object.freeze(["subject", "exclusions", "ignored", "unsupportedScope", "truncation", "dataAge"]);
const TRUNCATION_FIELDS = Object.freeze(["truncated", "scannedFileCount", "totalEligibleFileCount"]);
const DATA_AGE_FIELDS = Object.freeze(["ageSeconds", "snapshotAt"]);

/**
 * Validates one coverage record (AC5/AC6): closed shape with exactly six
 * always-present top-level fields -- `exclusions`/`ignored`/
 * `unsupportedScope`/`truncation`/`dataAge` (AC6's own five, named
 * verbatim) plus `subject` (judged addition, see header comment). Every
 * field's KEY must be present (`hasOwn`); the VALUE may be empty
 * (empty string/array, `false`, `null`) -- "empty is valid, absent is not."
 */
export function validateCoverageRecord(coverage) {
  if (!isPlainObject(coverage)) {
    return { valid: false, errors: [{ field: "$", code: "not-an-object", message: "coverage record must be a plain object" }] };
  }
  const errors = [];
  for (const key of Object.keys(coverage)) {
    if (!COVERAGE_FIELDS.includes(key)) {
      errors.push({ field: key, code: "unknown-field", message: `coverage record is closed; unexpected field "${key}"` });
    }
  }
  if (!hasOwn(coverage, "subject") || typeof coverage.subject !== "string") {
    errors.push({ field: "subject", code: "missing-or-invalid-type", message: "subject is required and must be a string (may be empty)" });
  }
  if (!hasOwn(coverage, "exclusions") || !isStringArray(coverage.exclusions)) {
    errors.push({ field: "exclusions", code: "missing-or-invalid-type", message: "exclusions is required and must be an array of strings (may be empty)" });
  }
  if (!hasOwn(coverage, "ignored") || !isStringArray(coverage.ignored)) {
    errors.push({ field: "ignored", code: "missing-or-invalid-type", message: "ignored is required and must be an array of strings (may be empty)" });
  }
  if (!hasOwn(coverage, "unsupportedScope") || !isStringArray(coverage.unsupportedScope)) {
    errors.push({ field: "unsupportedScope", code: "missing-or-invalid-type", message: "unsupportedScope is required and must be an array of strings (may be empty)" });
  }
  if (!hasOwn(coverage, "truncation") || !isPlainObject(coverage.truncation)) {
    errors.push({ field: "truncation", code: "missing-or-invalid-type", message: "truncation is required and must be an object" });
  } else {
    const truncation = coverage.truncation;
    for (const key of Object.keys(truncation)) {
      if (!TRUNCATION_FIELDS.includes(key)) errors.push({ field: `truncation.${key}`, code: "unknown-field", message: `truncation is closed; unexpected field "${key}"` });
    }
    if (typeof truncation.truncated !== "boolean") {
      errors.push({ field: "truncation.truncated", code: "invalid-type", message: "truncation.truncated is required and must be a boolean" });
    }
    if (!hasOwn(truncation, "scannedFileCount") || !isNullableNumber(truncation.scannedFileCount)) {
      errors.push({ field: "truncation.scannedFileCount", code: "invalid-type", message: "truncation.scannedFileCount is required and must be a number or null" });
    }
    if (!hasOwn(truncation, "totalEligibleFileCount") || !isNullableNumber(truncation.totalEligibleFileCount)) {
      errors.push({ field: "truncation.totalEligibleFileCount", code: "invalid-type", message: "truncation.totalEligibleFileCount is required and must be a number or null" });
    }
  }
  if (!hasOwn(coverage, "dataAge") || !isPlainObject(coverage.dataAge)) {
    errors.push({ field: "dataAge", code: "missing-or-invalid-type", message: "dataAge is required and must be an object" });
  } else {
    const dataAge = coverage.dataAge;
    for (const key of Object.keys(dataAge)) {
      if (!DATA_AGE_FIELDS.includes(key)) errors.push({ field: `dataAge.${key}`, code: "unknown-field", message: `dataAge is closed; unexpected field "${key}"` });
    }
    if (!hasOwn(dataAge, "ageSeconds") || !isNullableNumber(dataAge.ageSeconds)) {
      errors.push({ field: "dataAge.ageSeconds", code: "invalid-type", message: "dataAge.ageSeconds is required and must be a number or null" });
    }
    if (!hasOwn(dataAge, "snapshotAt") || !isNullableString(dataAge.snapshotAt)) {
      errors.push({ field: "dataAge.snapshotAt", code: "invalid-type", message: "dataAge.snapshotAt is required and must be a string or null" });
    }
  }
  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

const CAPABILITY_RECORD_FIELDS = Object.freeze(["capabilityId", "tool", "rulePack", "status", "classification", "findings", "coverage", "reason"]);
const V2_CAPABILITY_STATUSES = Object.freeze(["PASS", "FINDINGS", "SKIPPED", "ERROR"]);

/**
 * Validates one per-capability record (AC4/AC5): checks the PER-CAPABILITY
 * identity fields (capability id, tool, rule-pack/config -- see header
 * "field placement" note), the v1-inherited status enum, and delegates to
 * `validateFindingEnvelope`/`validateCoverageRecord` for the nested arrays.
 */
export function validateCapabilityRecord(record) {
  if (!isPlainObject(record)) {
    return { valid: false, errors: [{ field: "$", code: "not-an-object", message: "capability record must be a plain object" }] };
  }
  const errors = [];
  for (const key of Object.keys(record)) {
    if (!CAPABILITY_RECORD_FIELDS.includes(key)) {
      errors.push({ field: key, code: "unknown-field", message: `capability record is closed; unexpected field "${key}"` });
    }
  }
  if (!isNonEmptyString(record.capabilityId)) {
    errors.push({ field: "capabilityId", code: "missing-or-empty", message: "capabilityId identity field is required and must be non-empty (AC4)" });
  }
  if (!isPlainObject(record.tool) || !isNonEmptyString(record.tool.name)) {
    errors.push({ field: "tool", code: "missing-or-empty", message: "tool identity field is required; tool.name must be non-empty (AC4)" });
  } else if (!isNullableString(record.tool.version)) {
    errors.push({ field: "tool.version", code: "invalid-type", message: "tool.version must be a string or null" });
  }
  if (!isPlainObject(record.rulePack) || !isNonEmptyString(record.rulePack.ref)) {
    errors.push({ field: "rulePack", code: "missing-or-empty", message: "rule-pack/config identity field is required; rulePack.ref must be non-empty (AC4)" });
  } else if (!isNullableString(record.rulePack.digest)) {
    errors.push({ field: "rulePack.digest", code: "invalid-type", message: "rulePack.digest must be a string or null" });
  }
  if (!V2_CAPABILITY_STATUSES.includes(record.status)) {
    errors.push({ field: "status", code: "invalid-enum", message: `status must be one of: ${V2_CAPABILITY_STATUSES.join(", ")}` });
  }
  if (!isNonEmptyString(record.classification)) {
    errors.push({ field: "classification", code: "missing-or-empty", message: "classification is required and must be non-empty" });
  }
  if (!Array.isArray(record.findings)) {
    errors.push({ field: "findings", code: "invalid-type", message: "findings must be an array" });
  } else {
    record.findings.forEach((finding, index) => {
      const result = validateFindingEnvelope(finding);
      if (!result.valid) {
        for (const e of result.errors) errors.push({ field: `findings[${index}].${e.field}`, code: e.code, message: e.message });
      }
    });
  }
  const coverageResult = validateCoverageRecord(record.coverage);
  if (!coverageResult.valid) {
    for (const e of coverageResult.errors) errors.push({ field: `coverage.${e.field}`, code: e.code, message: e.message });
  }
  if (!hasOwn(record, "reason") || !isNullableString(record.reason)) {
    errors.push({ field: "reason", code: "missing-or-invalid-type", message: "reason is required (string or null)" });
  }
  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

const ENVELOPE_FIELDS = Object.freeze(["schema", "policy", "input", "environment", "capabilities"]);

/**
 * Validates a full v2 evidence envelope (AC4): checks the ENVELOPE-level
 * identity fields (policy, input, environment -- see header "field
 * placement" note) and delegates to `validateCapabilityRecord` for every
 * entry in `capabilities`.
 */
export function validateSecurityEvidenceV2(envelope) {
  if (!isPlainObject(envelope)) {
    return { valid: false, errors: [{ field: "$", code: "not-an-object", message: "v2 evidence envelope must be a plain object" }] };
  }
  const errors = [];
  for (const key of Object.keys(envelope)) {
    if (!ENVELOPE_FIELDS.includes(key)) {
      errors.push({ field: key, code: "unknown-field", message: `v2 evidence envelope is closed; unexpected field "${key}"` });
    }
  }
  if (envelope.schema !== SECURITY_EVIDENCE_V2_SCHEMA) {
    errors.push({ field: "schema", code: "invalid-value", message: `schema must be exactly "${SECURITY_EVIDENCE_V2_SCHEMA}"` });
  }
  if (!isPlainObject(envelope.policy) || !isNonEmptyString(envelope.policy.configurationSha256)) {
    errors.push({ field: "policy", code: "missing-or-empty", message: "policy identity field is required; policy.configurationSha256 must be non-empty (AC4)" });
  }
  if (!isPlainObject(envelope.input) || !isNonEmptyString(envelope.input.commit) || !isNonEmptyString(envelope.input.tree) || !isNonEmptyString(envelope.input.inputSha256)) {
    errors.push({ field: "input", code: "missing-or-empty", message: "input identity field is required; commit/tree/inputSha256 must all be non-empty (AC4)" });
  }
  if (!isPlainObject(envelope.environment) || !isNonEmptyString(envelope.environment.platform)) {
    errors.push({ field: "environment", code: "missing-or-empty", message: "environment identity field is required; environment.platform must be non-empty (AC4)" });
  } else if (!isNullableString(envelope.environment.nodeVersion)) {
    errors.push({ field: "environment.nodeVersion", code: "invalid-type", message: "environment.nodeVersion must be a string or null" });
  }
  if (!Array.isArray(envelope.capabilities) || envelope.capabilities.length === 0) {
    errors.push({ field: "capabilities", code: "missing-or-empty", message: "capabilities must be a non-empty array" });
  } else {
    envelope.capabilities.forEach((record, index) => {
      const result = validateCapabilityRecord(record);
      if (!result.valid) {
        for (const e of result.errors) errors.push({ field: `capabilities[${index}].${e.field}`, code: e.code, message: e.message });
      }
    });
  }
  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

// ===============================================================================================
// PART B -- the pure L3 per-capability evaluator, the aggregate verdict, and the F-3 projection
// ===============================================================================================

/** CYB-1F §7's frozen L3 per-capability run-outcome enum (independent read-only mirror; see "THREE MIRRORS" in the header comment). */
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

/** CYB-1F §7's frozen control-result enum (read-only mirror; the F-3 projection's target vocabulary). */
export const CONTROL_RESULTS = Object.freeze(["met", "not-met", "not-applicable", "unavailable", "waived", "unknown", "invalid"]);

const ACCEPTED_AGGREGATE_OUTCOMES = Object.freeze(["pass", "findings", "waived"]);

/**
 * Evaluates ONE capability of a candidate to its L3 run outcome, returning a
 * rich diagnostic object (AC2) rather than a bare enum string. See the
 * header comment's "PART B DESIGN NOTES" for the full priority-ordered
 * classification logic and its rationale. Pure: reads `candidate`/`plan`,
 * mutates neither.
 */
export function evaluateCapability(candidate, capabilityId, plan) {
  if (!isPlainObject(candidate) || !Array.isArray(candidate.capabilities)) {
    throw new TypeError("evaluateCapability: candidate.capabilities must be an array");
  }
  if (!isPlainObject(plan) || !Array.isArray(plan.required) || !Array.isArray(plan.optional)) {
    throw new TypeError("evaluateCapability: plan.required/plan.optional must be arrays");
  }
  const capability = candidate.capabilities.find((c) => c.id === capabilityId);
  if (!capability) {
    throw new TypeError(`evaluateCapability: candidate has no capability id "${capabilityId}"`);
  }
  const required = plan.required.includes(capabilityId);
  const base = { capabilityId, tool: capability.tool, status: capability.status, classification: capability.classification, required };

  // 1. Candidate-binding override -- highest priority, poisons every
  // capability's result equally (see header comment for the forced-not-
  // stylistic reasoning).
  if (candidate.candidateBinding && candidate.candidateBinding.matches === false) {
    return {
      ...base,
      outcome: "invalid",
      classification: "candidate_binding_mismatch",
      reason: `evidence candidate no longer matches the plan's bound candidate (planned tree "${candidate.candidateBinding.plannedTree ?? "?"}" vs observed "${candidate.candidateBinding.observedTree ?? "?"}")`,
    };
  }

  const { status, classification, raw, reason } = capability;

  // 2. Classification overrides -- hold regardless of status.
  if (classification === "unsupported_ecosystem") {
    return { ...base, outcome: "unsupported", reason: reason ?? null };
  }
  if (classification === "execution_environment") {
    return { ...base, outcome: "execution-unavailable", reason: reason ?? null };
  }

  // 3. Status switch (v1's four-member status enum).
  switch (status) {
    case "SKIPPED":
      return { ...base, outcome: required ? "required-capability-missing" : "not-applicable", reason: reason ?? null };
    case "ERROR":
      // Structural discriminator, not reason-string sniffing: non-null `raw`
      // means the tool produced output that failed to parse (malformed
      // output); `raw === null` means no output was ever produced
      // (execution never completed -- e.g. a timeout/kill).
      return { ...base, outcome: raw != null ? "invalid" : "execution-unavailable", reason: reason ?? null };
    case "FINDINGS":
      return { ...base, outcome: "findings", reason: reason ?? null };
    case "PASS": {
      if (
        candidate.policyDrift
        && candidate.policyDrift.snapshotBumped === false
        && candidate.policyDrift.configurationSha256 !== candidate.policyDrift.previousConfigurationSha256
      ) {
        return { ...base, outcome: "stale", reason: "policy/config drift: content changed underneath the candidate without a snapshot digest bump" };
      }
      if (classification === "empty_rule_pack" || (candidate.rulePackDetail && candidate.rulePackDetail.ruleCount === 0)) {
        return { ...base, outcome: "stale", reason: reason ?? "resolved rule pack contains zero rules; a clean result cannot be trusted as coverage" };
      }
      if (candidate.coverageDetail && candidate.coverageDetail.truncated === true) {
        return { ...base, outcome: "partial-coverage", reason: "coverage truncated: only a bounded subset of eligible files was scanned" };
      }
      return { ...base, outcome: "pass", reason: reason ?? null };
    }
    default:
      // Defensive only -- CYB-2A's own structural test already constrains
      // every fixture's status to this four-member v1 enum; unreachable by
      // any of the 14 fixtures.
      throw new TypeError(`evaluateCapability: unrecognized v1 status "${status}" for capability "${capabilityId}"`);
  }
}

/**
 * Convenience composition of `evaluateCapability` over every capability in
 * `candidate.capabilities`, returning a bare `{ [capabilityId]: outcome }`
 * map -- the exact input shape `aggregateVerdict` expects. Pure.
 */
export function evaluateAllCapabilities(candidate, plan) {
  const outcomeMap = {};
  for (const capability of candidate.capabilities) {
    outcomeMap[capability.id] = evaluateCapability(candidate, capability.id, plan).outcome;
  }
  return outcomeMap;
}

/**
 * AC1: takes the per-capability outcome MAP (bare enum strings) plus the
 * plan's required/optional split, and produces a single blocking/non-
 * blocking verdict. Deliberately kept separate from `evaluateCapability`
 * (different granularity -- see header comment). Only `plan.required`
 * capabilities are inspected: an optional capability's own non-pass outcome
 * never blocks (matches `optional-skipped`'s fixture intent). Pure.
 */
export function aggregateVerdict(outcomeMap, plan) {
  if (!isPlainObject(outcomeMap)) {
    throw new TypeError("aggregateVerdict: outcomeMap must be a plain object");
  }
  if (!isPlainObject(plan) || !Array.isArray(plan.required) || !Array.isArray(plan.optional)) {
    throw new TypeError("aggregateVerdict: plan.required/plan.optional must be arrays");
  }
  const offendingCapabilities = [];
  for (const capabilityId of plan.required) {
    const outcome = outcomeMap[capabilityId] ?? null;
    if (!ACCEPTED_AGGREGATE_OUTCOMES.includes(outcome)) {
      offendingCapabilities.push({ capabilityId, outcome });
    }
  }
  return { blocking: offendingCapabilities.length > 0, offendingCapabilities };
}

/**
 * F-3 (cyb-1f-schema-boundary-draft.md §7/§10, RATIFIED): projects one L3
 * run outcome to the catalog control-result enum, given whether the
 * capability was required by the plan. See the header comment's F-3 section
 * for the full table and the reasoning for every entry beyond the one
 * ratified pair (`required-capability-missing -> not-met`/`unavailable`).
 * Pure; throws a typed TypeError for an unrecognized run outcome (never
 * silently returns `"unknown"`).
 */
export function projectRunOutcomeToControlResult(runOutcome, { required } = {}) {
  if (!RUN_OUTCOMES.includes(runOutcome)) {
    throw new TypeError(`projectRunOutcomeToControlResult: unrecognized run outcome "${runOutcome}"`);
  }
  if (typeof required !== "boolean") {
    throw new TypeError('projectRunOutcomeToControlResult: options.required must be a boolean');
  }
  switch (runOutcome) {
    case "pass":
      return "met";
    case "findings":
      return "not-met";
    case "waived":
      return "waived";
    case "not-applicable":
    case "unsupported":
      return "not-applicable";
    case "invalid":
      return "invalid";
    case "required-capability-missing": // F-3 RATIFIED example
    case "execution-unavailable":
    case "partial-coverage":
    case "stale":
      return required ? "not-met" : "unavailable";
    /* c8 ignore next 2 */
    default:
      throw new TypeError(`projectRunOutcomeToControlResult: no projection rule defined for "${runOutcome}"`);
  }
}
