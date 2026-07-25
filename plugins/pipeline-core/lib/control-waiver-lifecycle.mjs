// SPDX-License-Identifier: SUL-1.0
//
// Exports (stable):
//   WAIVER_CLASS_PO_WAIVED_DIRECT_IMPLEMENTATION -> "po-waived-direct-implementation"
//   WAIVER_CLASSES                          -> readonly ["po-waived-direct-implementation"]
//                                               (this task's typed waiverClass taxonomy;
//                                               closed enum — see DESIGN DECISIONS #2)
//   validateWaiverClassInvariants(waiver)   -> { valid: true } | { valid: false, errors }
//                                               Re-asserts the class-specific invariants
//                                               (mandatory expiry + mandatory follow-up
//                                               flag shape) for a
//                                               "po-waived-direct-implementation" waiver
//                                               record, INDEPENDENTLY of and in addition to
//                                               CYB-1a's generic waiver-shape check
//                                               (control-catalog-schema.mjs). A no-op
//                                               ({ valid: true }, plus an enum-membership
//                                               check) for any waiver without that class.
//   evaluateWaiverLifecycle({ waiver, now, otherwiseStatus, evidence }) -> Verdict
//                                               Pure. Fails closed on expiry (AC7): an
//                                               expired waiver's effectiveStatus falls back
//                                               to `otherwiseStatus`, NEVER `"waived"`.
//                                               Throws a typed TypeError on malformed input
//                                               (mirrors createEvaluationReceipt's /
//                                               resolveControlMigrationStatus's "never
//                                               guesses" discipline). Never mutates `waiver`
//                                               or `evidence` (`evidence` is accepted,
//                                               unused, purely to prove non-mutation extends
//                                               to whatever raw verifier evidence a caller
//                                               evaluates alongside the waiver at the same
//                                               protected boundary — AC7).
//   isFollowUpOutstanding(waiver)            -> boolean
//                                               true only for a
//                                               "po-waived-direct-implementation" waiver
//                                               whose mandatory Critic-review follow-up has
//                                               not yet been satisfied; false for any other
//                                               waiver (no class -> no follow-up requirement
//                                               -> nothing can be "outstanding").
//   clearFollowUp(waiver, evidenceRef)       -> new waiver record (pure transformation)
//                                               Self-clearing transition (old record +
//                                               Critic evidence reference -> new record);
//                                               never mutates the input record. Throws a
//                                               typed TypeError if `waiver` isn't a valid,
//                                               currently-outstanding
//                                               "po-waived-direct-implementation" record, or
//                                               if `evidenceRef` is missing/empty.
//
// Implements cyb-1-feature-spec.md §3 row AC7 ("Waivers scoped/authorized/
// reasoned/time-bounded/non-destructive/revalidated") and §4 ("Waiver
// lifecycle — the PO-waived-direct-implementation class") only.
//
// Consumes CYB-1a's already-frozen waiver *field-shape* rule
// (control-catalog-schema.mjs's validateControl, the `waiver` branch: null,
// or { authority, reason, expiry, revalidationTrigger }, all four non-empty
// strings when not null) as this module's INPUT contract — this module does
// not import or call that check; it re-validates the same four fields
// locally (assertGenericWaiverShape, below) because a caller may hand this
// module a waiver object that was never routed through validateControl
// (e.g. a hand-built fixture, or a value under construction), and this
// module's own "never guesses" discipline (matching
// security-policy-resolver.mjs's and control-catalog-migration.mjs's
// precedent) means it must not silently trust an unchecked shape either.
//
// Does NOT wire into control-evaluation-receipt.mjs or
// security-policy-resolver.mjs (integration is a later, out-of-scope task);
// does NOT define a second parallel receipt/policy schema (AC11 discipline)
// — a Verdict object here is a plain value shaped to be embeddable inside a
// CYB-1b `resolvedControls` entry or alongside a CYB-1c receipt, never a
// competing top-level schema of its own.
//
// ---------------------------------------------------------------------------
// DESIGN DECISIONS (this task's genuine design latitude, per this task's
// briefing field 1 — documented here so a later integration task can build
// on this without re-deriving it from the diff):
//
// 1. `waiverClass` is an ADDITIVE key inside the `waiver` sub-object, not a
//    new top-level control field. control-catalog-schema.mjs's §8 top-level
//    schema is closed, but its own top-of-file comment states composite
//    sub-objects (including `waiver`) are NOT closed against extra keys —
//    so adding `waiverClass` (and, for that one named class,
//    `criticFollowUp`, see #3) inside `waiver` cannot violate CYB-1a's
//    freeze.
//
// 2. The `waiverClass` enum (`WAIVER_CLASSES`) currently has exactly ONE
//    member, `"po-waived-direct-implementation"` — the only class the
//    feature-spec §4 names. `waiverClass` itself stays OPTIONAL on a waiver
//    record: an ordinary/untyped waiver simply omits the field (this keeps
//    every existing CYB-1a-shaped waiver fixture valid without a
//    migration). No catch-all/"general" class value was invented — the
//    briefing warns against inventing unrelated scope, and "the field is
//    absent" already unambiguously means "not classified", so a residual
//    enum member would be redundant, not clarifying.
//
// 3. Mandatory follow-up flag shape — `waiver.criticFollowUp`:
//      { required: true,                    // literal boolean; an explicit
//                                            // self-attestation, mirroring
//                                            // control-catalog-migration.mjs's
//                                            // `freshEvaluation === true`
//                                            // literal-check precedent — the
//                                            // field's mere presence must
//                                            // not be enough, since a
//                                            // forgetful/incomplete object
//                                            // literal could carry a stray
//                                            // key by accident
//        status: "outstanding" | "satisfied",
//        evidenceRef: string | null }        // non-empty string exactly
//                                            // when status is "satisfied";
//                                            // null while "outstanding"
//    `required` stays `true` for every record of this class by
//    construction (validateWaiverClassInvariants rejects any other value)
//    — it exists so the requirement is legible directly on the record, not
//    merely inferable by cross-referencing `waiverClass` against this
//    module's source (feature-spec §4: "not merely implied by convention").
//
// 4. Self-clearing transition (`clearFollowUp`) is a pure old-record ->
//    new-record transformation, never an in-place mutation, and is
//    one-directional and non-idempotent by design: it throws if `status` is
//    not currently `"outstanding"`, rather than silently no-op'ing on an
//    already-satisfied record — a caller re-clearing an already-cleared
//    waiver is almost always a bug (e.g. double-counting two different
//    Critic reviews as the same follow-up), so this module surfaces that as
//    a typed error rather than guessing the caller's intent.
//
// 5. Temporal comparison — `now < expiry` is "active"; `now === expiry` (or
//    later) is "expired" (the exact-boundary instant fails closed too).
//    CYB-1a validates `expiry` only as a non-empty string (format is
//    explicitly left open by §8) and this module keeps that constraint
//    (`waiver.expiry` must stay a string — CYB-1a's frozen shape, re-
//    asserted by assertGenericWaiverShape), but additionally requires it to
//    be a `Date.parse`-able ISO-8601-looking string and parses it as a real
//    instant rather than comparing strings lexically. The caller-supplied
//    `now` is NOT part of CYB-1a's schema, so it may be either a `Date`
//    instance or an ISO-8601 string — whichever is more convenient at the
//    call site. Either way, an unparseable value throws a typed error
//    rather than guessing — fail-closed applies to malformed temporal input
//    too, not just to a cleanly-parsed-but-elapsed expiry.
//
// 6. `otherwiseStatus` (the AC7 "whatever its underlying evaluation/
//    migration status would otherwise be" fallback) is accepted as a plain
//    caller-supplied non-empty string, expected (per this task's briefing
//    field 2, cyb-1f-schema-boundary-draft.md §7) to be a member of the
//    CYB-1F §7 control-result vocabulary (`met | not-met | not-applicable |
//    unavailable | waived | unknown | invalid`) — but this module
//    deliberately does NOT import or re-validate that enum from
//    control-catalog-migration.mjs (or anywhere else): per this task's
//    briefing field 2, control-catalog-migration.mjs is read-only STYLE
//    precedent for this module, not a runtime dependency, and importing its
//    enum would recreate the exact cross-package coupling that module's own
//    top-of-file comment deliberately avoids for itself. §7 ownership stays
//    with the catalog schema; this module only documents the expected
//    vocabulary in prose.
// ---------------------------------------------------------------------------

function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}
function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export const WAIVER_CLASS_PO_WAIVED_DIRECT_IMPLEMENTATION = "po-waived-direct-implementation";
export const WAIVER_CLASSES = Object.freeze([WAIVER_CLASS_PO_WAIVED_DIRECT_IMPLEMENTATION]);
const WAIVER_CLASS_SET = new Set(WAIVER_CLASSES);

const GENERIC_WAIVER_FIELDS = Object.freeze(["authority", "reason", "expiry", "revalidationTrigger"]);

// CYB-1a's generic waiver-shape re-assertion (see top-of-file comment on
// why this module re-checks rather than trusting an unvalidated caller
// input). Pure: reads only, never mutates `waiver`.
function assertGenericWaiverShape(waiver) {
  if (!isPlainObject(waiver)) {
    throw new TypeError('evaluateWaiverLifecycle: "waiver" must be null or a plain object (CYB-1F §8 waiver shape)');
  }
  for (const field of GENERIC_WAIVER_FIELDS) {
    if (!isNonEmptyString(waiver[field])) {
      throw new TypeError(
        `evaluateWaiverLifecycle: waiver.${field} must be a non-empty string (CYB-1F §8 waiver shape), got ${JSON.stringify(waiver[field])}`,
      );
    }
  }
}

// Feature-spec §4 — re-asserts class-specific invariants for a
// "po-waived-direct-implementation" waiver INDEPENDENTLY of CYB-1a's
// generic shape check. A no-op ({ valid: true }, aside from the
// enum-membership check) for any waiver whose `waiverClass` is absent or a
// different (still-valid) class. Pure: reads only, never mutates `waiver`.
export function validateWaiverClassInvariants(waiver) {
  if (!isPlainObject(waiver)) {
    return { valid: false, errors: [{ field: null, code: "WAIVER-NOT-OBJECT", message: "waiver record must be a plain object" }] };
  }

  const errors = [];

  if (
    hasOwn(waiver, "waiverClass") &&
    waiver.waiverClass !== null &&
    waiver.waiverClass !== undefined &&
    !WAIVER_CLASS_SET.has(waiver.waiverClass)
  ) {
    errors.push({
      field: "waiverClass",
      code: "WAIVER-UNKNOWN-CLASS",
      message: `waiver.waiverClass ${JSON.stringify(waiver.waiverClass)} is not one of the closed waiverClass enum values (${WAIVER_CLASSES.join(", ")})`,
    });
  }

  if (waiver.waiverClass !== WAIVER_CLASS_PO_WAIVED_DIRECT_IMPLEMENTATION) {
    return errors.length === 0 ? { valid: true } : { valid: false, errors };
  }

  // Mandatory expiry (feature-spec §4) — re-asserted here specifically for
  // this class, not left as an accidental side effect of CYB-1a's generic
  // rule (this task's briefing field 1).
  if (!isNonEmptyString(waiver.expiry)) {
    errors.push({
      field: "expiry",
      code: "WAIVER-CLASS-MISSING-EXPIRY",
      message: 'a "po-waived-direct-implementation" waiver must have a non-empty "expiry" (mandatory-expiry rule, feature-spec §4)',
    });
  }

  // Mandatory follow-up flag (feature-spec §4) — see DESIGN DECISIONS #3.
  const cf = waiver.criticFollowUp;
  if (!isPlainObject(cf)) {
    errors.push({
      field: "criticFollowUp",
      code: "WAIVER-CLASS-MISSING-FOLLOWUP",
      message: 'a "po-waived-direct-implementation" waiver must carry a "criticFollowUp" object (mandatory-follow-up rule, feature-spec §4)',
    });
  } else {
    if (cf.required !== true) {
      errors.push({
        field: "criticFollowUp.required",
        code: "WAIVER-CLASS-FOLLOWUP-NOT-REQUIRED",
        message: "waiver.criticFollowUp.required must be the literal boolean true",
      });
    }
    if (cf.status !== "outstanding" && cf.status !== "satisfied") {
      errors.push({
        field: "criticFollowUp.status",
        code: "WAIVER-CLASS-FOLLOWUP-INVALID-STATUS",
        message: 'waiver.criticFollowUp.status must be "outstanding" or "satisfied"',
      });
    } else if (cf.status === "outstanding" && cf.evidenceRef !== null) {
      errors.push({
        field: "criticFollowUp.evidenceRef",
        code: "WAIVER-CLASS-FOLLOWUP-UNEXPECTED-EVIDENCE",
        message: 'waiver.criticFollowUp.evidenceRef must be null while status is "outstanding"',
      });
    } else if (cf.status === "satisfied" && !isNonEmptyString(cf.evidenceRef)) {
      errors.push({
        field: "criticFollowUp.evidenceRef",
        code: "WAIVER-CLASS-FOLLOWUP-MISSING-EVIDENCE",
        message: 'waiver.criticFollowUp.evidenceRef must be a non-empty string once status is "satisfied"',
      });
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

// Parses a `Date` instance or a `Date.parse`-able ISO-8601-looking string
// into epoch milliseconds. Throws a typed error on anything else, or on an
// unparseable string — never guesses (DESIGN DECISIONS #5).
function parseInstant(value, label) {
  if (value instanceof Date) {
    const ms = value.getTime();
    if (Number.isNaN(ms)) {
      throw new TypeError(`evaluateWaiverLifecycle: ${label} is an invalid Date instance`);
    }
    return ms;
  }
  if (isNonEmptyString(value)) {
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) {
      throw new TypeError(
        `evaluateWaiverLifecycle: ${label} must be a Date instance or a Date.parse-able ISO-8601 string, got ${JSON.stringify(value)}`,
      );
    }
    return ms;
  }
  throw new TypeError(
    `evaluateWaiverLifecycle: ${label} is required and must be a Date instance or non-empty ISO-8601 string, got ${JSON.stringify(value)}`,
  );
}

// AC7 — evaluates one control's `waiver` field against a caller-supplied
// "now" instant and produces a lifecycle verdict. Fails closed on expiry:
// an expired waiver's `effectiveStatus` is `otherwiseStatus`, NEVER
// `"waived"`. Pure: no fs/network access; never mutates `waiver` or
// `evidence` (`evidence`, if supplied, is accepted and intentionally
// unused — see top-of-file comment). Throws a typed TypeError on malformed
// input, never guesses.
export function evaluateWaiverLifecycle({ waiver = null, now, otherwiseStatus, evidence } = {}) {
  void evidence; // intentionally unused — see top-of-file comment (AC7 non-mutation guarantee)

  if (!isNonEmptyString(otherwiseStatus)) {
    throw new TypeError(
      `evaluateWaiverLifecycle: "otherwiseStatus" is required and must be a non-empty string (the control's fallback status, CYB-1F §7 vocabulary), got ${JSON.stringify(otherwiseStatus)}`,
    );
  }
  const nowMs = parseInstant(now, '"now"');

  if (waiver === null || waiver === undefined) {
    return Object.freeze({
      effectiveStatus: otherwiseStatus,
      waiverState: "none",
      waiverClass: null,
    });
  }

  assertGenericWaiverShape(waiver);

  const classCheck = validateWaiverClassInvariants(waiver);
  if (!classCheck.valid) {
    throw new TypeError(
      `evaluateWaiverLifecycle: waiver record fails class-invariant validation: ${classCheck.errors.map((e) => e.message).join("; ")}`,
    );
  }

  const expiryMs = parseInstant(waiver.expiry, '"waiver.expiry"');
  const active = nowMs < expiryMs;

  return Object.freeze({
    effectiveStatus: active ? "waived" : otherwiseStatus,
    waiverState: active ? "active" : "expired",
    waiverClass: hasOwn(waiver, "waiverClass") && waiver.waiverClass !== undefined ? waiver.waiverClass : null,
  });
}

// Reports whether a "po-waived-direct-implementation" waiver's mandatory
// Critic-review follow-up is still outstanding. Pure; returns false (not an
// error) for any waiver that isn't a valid record of this class — no class
// means no follow-up requirement, so nothing can be "outstanding".
export function isFollowUpOutstanding(waiver) {
  if (!isPlainObject(waiver) || waiver.waiverClass !== WAIVER_CLASS_PO_WAIVED_DIRECT_IMPLEMENTATION) {
    return false;
  }
  return isPlainObject(waiver.criticFollowUp) && waiver.criticFollowUp.status === "outstanding";
}

// Self-clearing transition (feature-spec §4): old waiver record + Critic
// evidence reference -> new waiver record. Pure transformation, never
// mutates `waiver`. Throws a typed TypeError if `waiver` is not a valid,
// currently-outstanding "po-waived-direct-implementation" record, or if
// `evidenceRef` is missing/empty.
export function clearFollowUp(waiver, evidenceRef) {
  if (!isPlainObject(waiver) || waiver.waiverClass !== WAIVER_CLASS_PO_WAIVED_DIRECT_IMPLEMENTATION) {
    throw new TypeError('clearFollowUp: "waiver" must be a "po-waived-direct-implementation" waiver record');
  }
  const classCheck = validateWaiverClassInvariants(waiver);
  if (!classCheck.valid) {
    throw new TypeError(
      `clearFollowUp: waiver record fails class-invariant validation: ${classCheck.errors.map((e) => e.message).join("; ")}`,
    );
  }
  if (waiver.criticFollowUp.status !== "outstanding") {
    throw new TypeError('clearFollowUp: waiver.criticFollowUp.status must be "outstanding" to transition (already satisfied)');
  }
  if (!isNonEmptyString(evidenceRef)) {
    throw new TypeError(`clearFollowUp: "evidenceRef" is required and must be a non-empty string, got ${JSON.stringify(evidenceRef)}`);
  }

  return {
    ...waiver,
    criticFollowUp: {
      ...waiver.criticFollowUp,
      status: "satisfied",
      evidenceRef,
    },
  };
}
