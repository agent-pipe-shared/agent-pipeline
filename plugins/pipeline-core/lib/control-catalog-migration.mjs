// SPDX-License-Identifier: SUL-1.0
//
// Exports:
//   CONTROL_RESULT_VALUES          -> readonly ["met","not-met","not-applicable",
//                                     "unavailable","waived","unknown","invalid"]
//                                     (CYB-1F §7 control-result enum, verbatim
//                                     order; REFERENCED here, not owned/frozen
//                                     by this module — §7 itself is owned by
//                                     the catalog schema, per its own text)
//   resolveControlMigrationStatus(input) -> { migrationStatuses } — pure
//                                     function; throws a typed error on
//                                     malformed input, never guesses
//
// Implements CYB-1 feature-spec (cyb-1-feature-spec.md §3) AC13 ONLY:
// "Migration doesn't silently mark historical controls satisfied" — adopting
// the catalog for the first time (or against a legacy/pre-catalog system's
// leftover records) must never let an absent or untrustworthy prior record
// masquerade as a fresh `met` evaluation. This guards against the natural
// implementation bug of "no record found -> default to true/compliant".
//
// ---------------------------------------------------------------------------
// SCOPE NOTE (per this task's briefing field 1 — read before extending):
//
// AC13's own #41 wording is receipt/evaluation-result-flavored, but this
// package is deliberately scoped to depend ONLY on CYB-1a
// (control-catalog-schema.mjs, closed) and CYB-1b
// (security-policy-resolver.mjs, closed) — NOT on CYB-1c's actual
// evaluation-receipt schema, which is a sibling package dispatched
// concurrently in the same wave and may not exist yet. The `priorEvaluations`
// / "qualifying input" concept below is therefore this module's OWN,
// narrower, self-contained notion of "a trustworthy record of a genuine
// fresh evaluation" — it is deliberately NOT a preview or partial
// implementation of CYB-1c's future receipt shape, and does not attempt to
// guess it. When CYB-1c lands, its author is expected to read this comment
// and reconcile the two concepts (e.g. by feeding a receipt-derived record
// through this module's qualifying shape below, or superseding this module
// entirely) — that reconciliation is a later task, not this one's.
// ---------------------------------------------------------------------------
//
// THE "QUALIFYING INPUT" DEFINITION (this task's genuine design latitude —
// read this before touching the `isQualifyingPriorEvaluation` predicate):
//
// The AC13 hard rule (briefing field 1, verbatim): `met` may only appear for
// a control if the caller explicitly supplied a "qualifying,
// non-migration-flagged" input for it. This module encodes that exact phrase
// as TWO independent signals that must BOTH hold — a required POSITIVE
// attestation, and the confirmed ABSENCE of a negative self-report:
//
// A `priorEvaluations` entry for a given control id QUALIFIES if and only if
// it is a plain object satisfying ALL FOUR:
//   1. `freshEvaluation === true`   (the literal boolean, not merely
//      truthy) — an explicit attestation from the caller that this record
//      was produced by evaluating the control just now, not inherited/
//      guessed/migrated from a legacy system. This is the "qualifying" half
//      of the phrase, and the one field that exists purely to make
//      "no-op / silent default" shapes impossible to satisfy by accident.
//   2. `migrated !== true`          — the "non-migration-flagged" half of
//      the phrase, read literally: even if `freshEvaluation` is (perhaps
//      self-contradictorily) also `true`, an explicit `migrated: true`
//      self-report always disqualifies the entry. The negative flag always
//      wins over the positive one.
//   3. `result` is one of `CONTROL_RESULT_VALUES` (CYB-1F §7) — the actual
//      declared outcome.
//   4. `evaluatedAt` is a non-empty string (an ISO-8601-looking timestamp is
//      expected but not strictly parsed here — presence and non-emptiness
//      only; timestamp-freshness *policy* belongs to a later package).
//
// Anything else — the key absent entirely, an explicit `undefined` value, a
// bare boolean (`true`/`false`), a bare string (`"ok"`/`"passed"`/anything),
// a number, an object missing any of the four conditions above (INCLUDING an
// object that already declares `result: "met"` but omits `freshEvaluation`
// — the sharpest form of the bug this AC guards against: data that *looks*
// compliant but was never attested as a fresh evaluation) — is NON-qualifying,
// REGARDLESS of how plausible or "truthy" it looks. Non-qualifying input for
// an `applicable` control always resolves to `unknown` (this module's
// deliberate choice over `not-met`: a non-qualifying shape means "we cannot
// trust what this says", which is honestly `unknown`, not an affirmative
// claim of non-compliance — the AC13 DoD permits either, this module always
// picks `unknown` for internal consistency with CYB-1b's own `unknown`).
//
// This is deliberately a HIGH bar (briefing field 4 forbids weakening it) —
// the entire point of AC13 is that reaching `met` must require an explicit,
// structurally distinctive, current-evaluation signal, never an inference
// from "some data happened to be present" or "the value was truthy".
//
// A note on `null`/other non-object `priorEvaluations` as a WHOLE: omitting
// the `priorEvaluations` key entirely (`undefined`) means "no prior system
// exists at all" and is treated as an empty map. Any OTHER non-plain-object
// value supplied for `priorEvaluations` itself (e.g. `null`, an array, a
// string) is treated as a caller/data bug and throws — it is deliberately
// NOT silently coerced into "absent", per this codebase's "never guess"
// precedent (control-catalog-schema.mjs, security-policy-resolver.mjs).
// ---------------------------------------------------------------------------
//
// Function contract:
//
//   resolveControlMigrationStatus({
//     resolvedControls,     // CYB-1b's resolveApplicableControls(...).resolvedControls
//                            // AS-IS -- array of { id, control, contributingModule,
//                            // applicability: 'applicable'|'unknown', missingInputs }.
//                            // Not mutated; read-only.
//     priorEvaluations,      // optional plain-object map: control id -> legacy/
//                            // prior record of ANY shape (whatever a pre-catalog
//                            // system happens to have left behind), or omitted
//                            // entirely (`undefined`) when there is no prior
//                            // system at all. Presence of the KEY (own-property),
//                            // not truthiness, is what "has a record" means; an
//                            // explicit `undefined` VALUE still counts as "has a
//                            // record" and is then judged non-qualifying like any
//                            // other non-qualifying shape.
//   }) -> {
//     migrationStatuses: Array<{
//       id,                  // control.id, echoed from resolvedControls
//       status,              // one of CONTROL_RESULT_VALUES
//       qualifying,          // boolean -- true only when a qualifying input
//                            // (see above) actually drove `status`
//       reason,              // 'applicability-unknown' | 'no-prior-data' |
//                            // 'non-qualifying-prior-data' | 'qualifying-prior-data'
//     }>,                    // sorted ascending by `id` -- canonical, independent
//                            // of resolvedControls/priorEvaluations input order;
//                            // exactly one entry per resolvedControls entry
//                            // (never omitted, per AC13's "never silently omitted").
//   }
//
// Rule enforced (AC13, non-negotiable -- do not weaken): `status` can only be
// the qualifying entry's declared `result` (which MAY be `met`) when
// `reason === 'qualifying-prior-data'`. Every other reason forces
// `status: 'unknown'`. A control whose CYB-1b `applicability` is already
// `'unknown'` is never even consulted against `priorEvaluations` -- it stays
// `'unknown'` unconditionally, which is this module staying "consistent with
// CYB-1b's own non-`met`-producing applicability result" per briefing field 1.
//
// Pure: no fs/network access; mutates neither `resolvedControls` nor
// `priorEvaluations` (nor their nested values).
//
// Malformed input (wrong JS type where an object/array/string is required,
// or `resolvedControls` entries missing an `id`/valid `applicability`) throws
// TypeError -- a caller/data bug, surfaced loudly, matching
// control-catalog-schema.mjs's / security-policy-resolver.mjs's "never
// silently guess" precedent.

function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}
function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

// CYB-1F §7 control-result enum, verbatim (referenced only -- owned by the
// catalog schema, not by this module).
export const CONTROL_RESULT_VALUES = Object.freeze([
  "met",
  "not-met",
  "not-applicable",
  "unavailable",
  "waived",
  "unknown",
  "invalid",
]);
const CONTROL_RESULT_SET = new Set(CONTROL_RESULT_VALUES);

// See the "QUALIFYING INPUT" DEFINITION above -- do not weaken any of these
// four conditions (briefing field 4).
function isQualifyingPriorEvaluation(value) {
  if (!isPlainObject(value)) return false;
  if (value.freshEvaluation !== true) return false;
  if (value.migrated === true) return false; // "non-migration-flagged": negative flag always wins
  if (!CONTROL_RESULT_SET.has(value.result)) return false;
  if (!isNonEmptyString(value.evaluatedAt)) return false;
  return true;
}

// The AC13 migration-fixture function: never lets an absent/untrustworthy
// prior record silently resolve to `met`. Pure: performs no filesystem/
// network access and mutates none of `input`'s (nested) values.
export function resolveControlMigrationStatus(input) {
  if (!isPlainObject(input)) {
    throw new TypeError("resolveControlMigrationStatus: input must be a plain object");
  }
  const { resolvedControls, priorEvaluations } = input;

  if (!Array.isArray(resolvedControls)) {
    throw new TypeError(
      "resolveControlMigrationStatus: resolvedControls must be an array (CYB-1b's resolveApplicableControls(...).resolvedControls)"
    );
  }

  let priorMap;
  if (priorEvaluations === undefined) {
    priorMap = null; // no prior system at all
  } else if (isPlainObject(priorEvaluations)) {
    priorMap = priorEvaluations;
  } else {
    throw new TypeError(
      "resolveControlMigrationStatus: priorEvaluations must be a plain object map (control id -> legacy record) or omitted entirely"
    );
  }

  const migrationStatuses = resolvedControls.map((entry, index) => {
    if (!isPlainObject(entry) || !isNonEmptyString(entry.id)) {
      throw new TypeError(`resolveControlMigrationStatus: resolvedControls[${index}] must be a plain object with a non-empty "id"`);
    }
    if (entry.applicability !== "applicable" && entry.applicability !== "unknown") {
      throw new TypeError(
        `resolveControlMigrationStatus: resolvedControls[${index}].applicability must be "applicable" or "unknown" (CYB-1b's own output shape), got ${JSON.stringify(entry.applicability)}`
      );
    }

    if (entry.applicability === "unknown") {
      return { id: entry.id, status: "unknown", qualifying: false, reason: "applicability-unknown" };
    }

    const hasPrior = priorMap !== null && hasOwn(priorMap, entry.id);
    if (!hasPrior) {
      return { id: entry.id, status: "unknown", qualifying: false, reason: "no-prior-data" };
    }

    const prior = priorMap[entry.id];
    if (isQualifyingPriorEvaluation(prior)) {
      return { id: entry.id, status: prior.result, qualifying: true, reason: "qualifying-prior-data" };
    }
    return { id: entry.id, status: "unknown", qualifying: false, reason: "non-qualifying-prior-data" };
  });

  migrationStatuses.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return { migrationStatuses };
}
