// SPDX-License-Identifier: SUL-1.0
//
// Structural drift-detection suite for CYB-1's control-catalog policy stack
// (CYB-1's feature-spec AC14: "Full Verify detects schema/precedence/
// applicability/evidence-binding drift"). This is a snapshot/golden layer
// ONE LEVEL UP from each module's own CYB-1a-g behavioral regression suite
// (security-policy-resolver.test.mjs, control-catalog-schema.test.mjs,
// control-evaluation-receipt.test.mjs, control-waiver-lifecycle.test.mjs):
// it pins the exact SHAPE of the frozen constants/enums/precedence orders/
// required-field sets each module exports, so an edit that changes that
// shape -- even one that happens to keep every existing behavioral fixture
// green (e.g. adding a new enum member nobody wrote a fixture against yet)
// -- fails loudly here, instead of silently passing because no existing
// fixture happened to exercise the new/changed shape.
//
// Deliberate exclusions (see the inline notes in each module's section
// below for the specifics): security-policy-resolver.mjs's
// MODULE_PRECEDENCE_ORDER/ASSURANCE_LEVELS and control-waiver-lifecycle.mjs's
// WAIVER_CLASSES are NOT re-pinned here -- they are already pinned by an
// exact `assert.deepEqual` (plus `Object.isFrozen`) inside their own
// sibling `.test.mjs` files. Repeating the identical assertion here would
// be redundant fixture coverage, not an additional drift tripwire: any edit
// that broke the copy here would break the sibling's copy in the very same
// commit, and vice versa, so duplicating it buys no independent protection.
//
// This file is READ-ONLY toward all four modules under test and toward
// their existing `.test.mjs` siblings -- it adds a new, separate file only,
// it does not modify any of them.

import assert from "node:assert/strict";
import * as securityPolicyResolver from "./security-policy-resolver.mjs";
import * as controlCatalogSchema from "./control-catalog-schema.mjs";
import * as controlEvaluationReceipt from "./control-evaluation-receipt.mjs";
import * as controlWaiverLifecycle from "./control-waiver-lifecycle.mjs";

const { validateControl } = controlCatalogSchema;
const { createEvaluationReceipt, validateEvaluationReceipt } = controlEvaluationReceipt;
const { evaluateWaiverLifecycle } = controlWaiverLifecycle;

function sortedKeys(namespaceObject) {
  return Object.keys(namespaceObject).sort();
}

// ===========================================================================
// security-policy-resolver.mjs
// ===========================================================================

{
  // Export surface: exactly these three bindings, nothing added, removed or
  // renamed. A silently added export (e.g. a second precedence-adjacent
  // constant) or a rename of an existing one is exactly the kind of
  // structural drift AC14 names, and none of CYB-1b's own behavioral tests
  // enumerate the module's full export surface (they only import the names
  // they already know about).
  assert.deepEqual(
    sortedKeys(securityPolicyResolver),
    ["ASSURANCE_LEVELS", "MODULE_PRECEDENCE_ORDER", "resolveApplicableControls"].sort(),
  );
}

// MODULE_PRECEDENCE_ORDER's exact member list AND order, and
// ASSURANCE_LEVELS's exact member list, are DELIBERATELY NOT re-pinned
// here: security-policy-resolver.test.mjs (lines ~34-49) already does
// `assert.deepEqual(MODULE_PRECEDENCE_ORDER, [...9 exact members...])` and
// `assert.deepEqual(ASSURANCE_LEVELS, [...3 exact members...])`, plus
// `Object.isFrozen()` on both -- an exact structural snapshot already
// exists there (see top-of-file note on why duplicating it here would add
// no independent protection).

// ===========================================================================
// control-catalog-schema.mjs
// ===========================================================================

{
  // Export surface.
  assert.deepEqual(
    sortedKeys(controlCatalogSchema),
    ["validateControl", "lintCatalogContent", "lintStandardMappingsAndClaims"].sort(),
  );
}

{
  // validateControl's exact required top-level field SET *and order*.
  // There is no separately-exported schema constant (control-catalog-
  // schema.mjs keeps it as a local, unexported CONTROL_FIELDS array), so
  // this snapshot is taken indirectly: calling validateControl({}) makes
  // EVERY required field "missing", and the validator pushes one
  // SCHEMA-MISSING-FIELD error per field in its internal iteration order --
  // so the resulting error list's `field` sequence *is* the field set,
  // verbatim, including order. control-catalog-schema.test.mjs's own suite
  // never calls validateControl({}); it only ever deletes ONE field at a
  // time from an otherwise-complete fixture and asserts a loose
  // `.some(...)` match, so a field silently added to, removed from, or
  // reordered within the closed set is NOT currently caught unless a
  // fixture happens to already exercise that exact field -- precisely the
  // AC14 gap this suite exists to close.
  const result = validateControl({});
  assert.equal(result.valid, false);
  assert.deepEqual(
    result.errors.map((e) => e.field),
    [
      "id", "revision", "status", "title", "objective", "threat", "class",
      "applicability", "phase", "boundary", "owner", "approvalAuthority",
      "verifierType", "capabilityRequirements", "evidenceContract", "severity",
      "defaultFailureMode", "remediation", "waiver", "supersedes",
      "supersededBy", "standardMappings",
    ],
  );
  assert.ok(result.errors.every((e) => e.code === "SCHEMA-MISSING-FIELD"));
}

{
  // validateControl's exact "must be a non-empty string" type-constraint
  // SET *and order* (the internal, unexported SIMPLE_STRING_FIELDS list).
  // Same indirect-snapshot technique: build an otherwise-fully-valid
  // control whose SIMPLE_STRING_FIELDS-eligible values are all blanked to
  // "", and read off the resulting SCHEMA-INVALID-STRING-FIELD error
  // sequence. This is new coverage: no existing fixture blanks more than
  // one string field at a time, so a field silently added to (or dropped
  // from) this type-constraint list is not independently pinned anywhere
  // else.
  const control = {
    id: "ctl.base.secrets.drift-probe",
    revision: 0,
    status: "",
    title: "",
    objective: "",
    threat: "",
    class: "base",
    applicability: { expression: "always", requiredInputs: [] },
    phase: "",
    boundary: "",
    owner: "",
    approvalAuthority: "",
    verifierType: "",
    capabilityRequirements: [],
    evidenceContract: { schemaRef: "pipeline.control-evidence.v1" },
    severity: "",
    defaultFailureMode: "",
    remediation: "",
    waiver: null,
    supersedes: null,
    supersededBy: null,
    standardMappings: [],
  };
  const result = validateControl(control);
  assert.equal(result.valid, false);
  const stringFieldErrors = result.errors.filter((e) => e.code === "SCHEMA-INVALID-STRING-FIELD");
  assert.deepEqual(
    stringFieldErrors.map((e) => e.field),
    [
      "status", "title", "objective", "threat", "phase", "boundary", "owner",
      "approvalAuthority", "verifierType", "severity", "defaultFailureMode",
      "remediation",
    ],
  );
  // no OTHER error code fired for this otherwise-structurally-valid record
  // (confirms the fixture above is not accidentally tripping an unrelated
  // check, which would silently pollute the field-order snapshot above)
  assert.equal(result.errors.length, stringFieldErrors.length);
}

{
  // capabilityRequirements' thirteen frozen family roots (CYB-1F §3,
  // "closed at freeze"). FROZEN_CAPABILITY_ROOTS is an internal, unexported
  // Set, so this locks it from the outside by asserting each of the
  // thirteen roots named in the module's own top-of-file comment is
  // individually ACCEPTED. This cannot (without an export) catch a silent
  // ADDITION to the set, but it does catch a silent REMOVAL or rename of
  // any one of the thirteen -- control-catalog-schema.test.mjs's own suite
  // only ever exercises ONE non-member ("cap.quantum") being rejected, and
  // never confirms the full accepted set.
  const FROZEN_ROOTS = [
    "secrets", "sca", "sast", "iac", "container", "ci-workflow", "dast",
    "fuzz", "memsafety", "authz", "crypto", "privacy", "ai-agent",
  ];
  assert.equal(FROZEN_ROOTS.length, 13);
  for (const root of FROZEN_ROOTS) {
    const control = {
      id: "ctl.base.secrets.drift-probe",
      revision: 0,
      status: "active",
      title: "t",
      objective: "o",
      threat: "t",
      class: "base",
      applicability: { expression: "always", requiredInputs: [] },
      phase: "p",
      boundary: "b",
      owner: "o",
      approvalAuthority: "a",
      verifierType: "v",
      capabilityRequirements: [`cap.${root}`],
      evidenceContract: { schemaRef: "pipeline.control-evidence.v1" },
      severity: "s",
      defaultFailureMode: "d",
      remediation: "r",
      waiver: null,
      supersedes: null,
      supersededBy: null,
      standardMappings: [],
    };
    const result = validateControl(control);
    assert.deepEqual(result, { valid: true }, `capability root "cap.${root}" must be accepted`);
  }
}

// ===========================================================================
// control-evaluation-receipt.mjs
// ===========================================================================

{
  assert.deepEqual(
    sortedKeys(controlEvaluationReceipt),
    ["createEvaluationReceipt", "validateEvaluationReceipt"].sort(),
  );
}

{
  // validateEvaluationReceipt's exact required-field SET *and order* (the
  // internal, unexported REQUIRED_FIELDS array). Same indirect-snapshot
  // technique as above: validateEvaluationReceipt({}) makes every required
  // field "missing" and the resulting error sequence is the field list,
  // verbatim. control-evaluation-receipt.test.mjs's own suite only ever
  // deletes one field at a time from a complete receipt (loose `.some(...)`
  // match), so a field silently added to REQUIRED_FIELDS -- which would
  // newly reject every existing minimal receipt fixture -- is not
  // independently pinned anywhere else. This is also the AC6 "binding
  // fields" surface named in this task's briefing: candidateId and
  // policyDigest are the first two entries, confirmed by exact name here.
  const result = validateEvaluationReceipt({});
  assert.equal(result.valid, false);
  assert.deepEqual(
    result.errors.map((e) => e.field),
    ["candidateId", "policyDigest", "resolvedControls", "receiptDigest"],
  );
  assert.ok(result.errors.every((e) => e.code === "RECEIPT-MISSING-FIELD"));
}

{
  // createEvaluationReceipt's exact OUTPUT key set. An extra, renamed or
  // dropped key on the returned receipt object is exactly the kind of
  // silent evidence-binding-shape drift AC14 names, and no existing test
  // asserts the receipt's exact key set (only individual field values via
  // `assert.equal`, or a partial `assert.deepEqual` between two receipts).
  const receipt = createEvaluationReceipt({
    candidateId: "candidate-drift-probe",
    policyDigest: `sha256:${"a".repeat(64)}`,
    resolvedControls: [],
  });
  assert.deepEqual(
    Object.keys(receipt).sort(),
    ["candidateId", "evaluatedAt", "policyDigest", "receiptDigest", "resolvedControls"].sort(),
  );
}

// ===========================================================================
// control-waiver-lifecycle.mjs
// ===========================================================================

{
  assert.deepEqual(
    sortedKeys(controlWaiverLifecycle),
    [
      "WAIVER_CLASS_PO_WAIVED_DIRECT_IMPLEMENTATION",
      "WAIVER_CLASSES",
      "validateWaiverClassInvariants",
      "evaluateWaiverLifecycle",
      "isFollowUpOutstanding",
      "clearFollowUp",
    ].sort(),
  );
}

// WAIVER_CLASSES's exact member list is DELIBERATELY NOT re-pinned here:
// control-waiver-lifecycle.test.mjs (line ~153) already does
// `assert.deepEqual(WAIVER_CLASSES, ["po-waived-direct-implementation"])` --
// same "already an exact snapshot, duplicating adds no independent
// protection" reasoning as security-policy-resolver.mjs above.

{
  // evaluateWaiverLifecycle's Verdict shape has TWO independent return
  // sites in the source: the `waiver === null` early return, and the
  // general (active/expired) return. control-waiver-lifecycle.test.mjs's
  // own suite does an exact `assert.deepEqual` against the FULL verdict
  // object only for the `waiver === null` case (its "no waiver at all"
  // test, line ~92) -- every active/expired-path assertion in that suite
  // checks individual fields (`.effectiveStatus`, `.waiverState`) only,
  // never the object's exact key set. A field added to ONE return site but
  // not the other is exactly the kind of asymmetric structural drift this
  // suite exists to catch, so this closes that gap for the general-case
  // return site independently.
  const waiver = {
    authority: "Security Lead",
    reason: "temporary mitigation pending vendor patch",
    expiry: "2099-01-01T00:00:00.000Z",
    revalidationTrigger: "vendor patch release",
  };
  const verdict = evaluateWaiverLifecycle({ waiver, now: "2026-07-30T00:00:00.000Z", otherwiseStatus: "not-met" });
  assert.equal(verdict.waiverState, "active");
  assert.deepEqual(
    Object.keys(verdict).sort(),
    ["effectiveStatus", "waiverClass", "waiverState"].sort(),
  );
}

console.log("control-catalog-drift: ok");
