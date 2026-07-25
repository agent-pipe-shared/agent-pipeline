// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  WAIVER_CLASSES,
  WAIVER_CLASS_PO_WAIVED_DIRECT_IMPLEMENTATION,
  validateWaiverClassInvariants,
  evaluateWaiverLifecycle,
  isFollowUpOutstanding,
  clearFollowUp,
} from "./control-waiver-lifecycle.mjs";

function deepFreeze(v, seen = new Set()) {
  if (v && typeof v === "object" && !seen.has(v)) {
    seen.add(v);
    Object.values(v).forEach((x) => deepFreeze(x, seen));
    Object.freeze(v);
  }
  return v;
}

const NOW = "2026-07-25T00:00:00.000Z";
const PAST_EXPIRY = "2026-01-01T00:00:00.000Z";
const FUTURE_EXPIRY = "2099-01-01T00:00:00.000Z";

function genericWaiver(overrides = {}) {
  return {
    authority: "Security Lead",
    reason: "temporary mitigation pending vendor patch",
    expiry: FUTURE_EXPIRY,
    revalidationTrigger: "vendor patch release",
    ...overrides,
  };
}

function poWaivedWaiver(overrides = {}) {
  return {
    authority: "PO (André)",
    reason: "AFK time-boxed direct-implementation authorization",
    expiry: FUTURE_EXPIRY,
    revalidationTrigger: "next session start",
    waiverClass: WAIVER_CLASS_PO_WAIVED_DIRECT_IMPLEMENTATION,
    criticFollowUp: { required: true, status: "outstanding", evidenceRef: null },
    ...overrides,
  };
}

// --- AC7: expired waiver fails closed -> non-waived effective status (never "waived")

{
  const waiver = genericWaiver({ expiry: PAST_EXPIRY });
  const verdict = evaluateWaiverLifecycle({ waiver, now: NOW, otherwiseStatus: "not-met" });
  assert.equal(verdict.effectiveStatus, "not-met");
  assert.notEqual(verdict.effectiveStatus, "waived");
  assert.equal(verdict.waiverState, "expired");
}

// --- AC7: expired po-waived-direct-implementation waiver also fails closed

{
  const waiver = poWaivedWaiver({ expiry: PAST_EXPIRY });
  const verdict = evaluateWaiverLifecycle({ waiver, now: NOW, otherwiseStatus: "unknown" });
  assert.equal(verdict.effectiveStatus, "unknown");
  assert.notEqual(verdict.effectiveStatus, "waived");
  assert.equal(verdict.waiverState, "expired");
  assert.equal(verdict.waiverClass, WAIVER_CLASS_PO_WAIVED_DIRECT_IMPLEMENTATION);
}

// --- AC7: exactly-at-expiry instant also fails closed (boundary is exclusive)

{
  const waiver = genericWaiver({ expiry: NOW });
  const verdict = evaluateWaiverLifecycle({ waiver, now: NOW, otherwiseStatus: "unknown" });
  assert.equal(verdict.waiverState, "expired");
  assert.equal(verdict.effectiveStatus, "unknown");
}

// --- AC7: currently-valid (non-expired) waiver resolves to an active/waived effective status

{
  const waiver = genericWaiver({ expiry: FUTURE_EXPIRY });
  const verdict = evaluateWaiverLifecycle({ waiver, now: NOW, otherwiseStatus: "not-met" });
  assert.equal(verdict.waiverState, "active");
  assert.equal(verdict.effectiveStatus, "waived");
}

// --- no waiver at all -> "none" state, effectiveStatus is simply the fallback

{
  const verdict = evaluateWaiverLifecycle({ waiver: null, now: NOW, otherwiseStatus: "met" });
  assert.deepEqual(verdict, { effectiveStatus: "met", waiverState: "none", waiverClass: null });
}

// --- `now` also accepts a Date instance, not just an ISO string (waiver.expiry
//     stays a string per CYB-1a's frozen waiver shape, but is still parsed as
//     a real instant, not just string-compared)

{
  const waiver = genericWaiver({ expiry: FUTURE_EXPIRY });
  const verdict = evaluateWaiverLifecycle({ waiver, now: new Date(NOW), otherwiseStatus: "not-met" });
  assert.equal(verdict.effectiveStatus, "waived");
}

// --- AC7: evaluation function does not mutate a passed-in raw evidence object

{
  const evidence = deepFreeze({ verifier: "gitleaks", findings: [], raw: "no secrets detected" });
  const before = JSON.stringify(evidence);
  const waiver = deepFreeze(genericWaiver({ expiry: FUTURE_EXPIRY }));

  const verdict = evaluateWaiverLifecycle({ waiver, now: NOW, otherwiseStatus: "not-met", evidence });

  assert.equal(JSON.stringify(evidence), before, "raw verifier evidence must be byte-unchanged after evaluation");
  assert.equal(verdict.effectiveStatus, "waived");
}

// --- purity: evaluateWaiverLifecycle never mutates the waiver input either (works against deeply frozen input)

{
  const waiver = deepFreeze(genericWaiver({ expiry: PAST_EXPIRY }));
  const before = JSON.stringify(waiver);
  assert.doesNotThrow(() => evaluateWaiverLifecycle({ waiver, now: NOW, otherwiseStatus: "unknown" }));
  assert.equal(JSON.stringify(waiver), before);
}

// --- malformed evaluateWaiverLifecycle input is rejected with a typed error

{
  assert.throws(() => evaluateWaiverLifecycle({ waiver: null, now: NOW }), TypeError, "missing otherwiseStatus must throw");
  assert.throws(() => evaluateWaiverLifecycle({ waiver: null, otherwiseStatus: "unknown" }), TypeError, "missing now must throw");
  assert.throws(
    () => evaluateWaiverLifecycle({ waiver: null, now: "not-a-real-date", otherwiseStatus: "unknown" }),
    TypeError,
    "unparseable now must throw",
  );
  assert.throws(
    () => evaluateWaiverLifecycle({ waiver: genericWaiver({ expiry: "not-a-real-date" }), now: NOW, otherwiseStatus: "unknown" }),
    TypeError,
    "unparseable waiver.expiry must throw",
  );
  assert.throws(
    () => evaluateWaiverLifecycle({ waiver: genericWaiver({ authority: "" }), now: NOW, otherwiseStatus: "unknown" }),
    TypeError,
    "malformed generic waiver shape must throw",
  );
  assert.throws(() => evaluateWaiverLifecycle({ waiver: "not-an-object", now: NOW, otherwiseStatus: "unknown" }), TypeError);
}

// --- waiverClass taxonomy: closed enum, exactly the one named class

{
  assert.deepEqual(WAIVER_CLASSES, ["po-waived-direct-implementation"]);
  assert.equal(WAIVER_CLASS_PO_WAIVED_DIRECT_IMPLEMENTATION, "po-waived-direct-implementation");

  const badClassWaiver = genericWaiver({ waiverClass: "not-a-real-class" });
  const check = validateWaiverClassInvariants(badClassWaiver);
  assert.equal(check.valid, false);
  assert.ok(check.errors.some((e) => e.code === "WAIVER-UNKNOWN-CLASS"));
}

// --- a waiver with no waiverClass at all is untouched by class-specific invariants

{
  const check = validateWaiverClassInvariants(genericWaiver());
  assert.deepEqual(check, { valid: true });
}

// --- po-waived-direct-implementation: missing expiry is rejected (typed error), re-asserted
//     specifically for this class, not merely relying on CYB-1a's generic shape check

{
  const { expiry, ...withoutExpiry } = poWaivedWaiver();
  const check = validateWaiverClassInvariants(withoutExpiry);
  assert.equal(check.valid, false);
  assert.ok(
    check.errors.some((e) => e.code === "WAIVER-CLASS-MISSING-EXPIRY"),
    "class-specific missing-expiry rejection must be reported by its own dedicated code",
  );

  assert.throws(
    () => evaluateWaiverLifecycle({ waiver: withoutExpiry, now: NOW, otherwiseStatus: "unknown" }),
    TypeError,
    "evaluateWaiverLifecycle must also reject a po-waived-direct-implementation waiver missing expiry, before any lifecycle/date logic runs",
  );
}

// --- po-waived-direct-implementation: missing/malformed criticFollowUp is rejected

{
  const { criticFollowUp, ...withoutFollowUp } = poWaivedWaiver();
  const check1 = validateWaiverClassInvariants(withoutFollowUp);
  assert.equal(check1.valid, false);
  assert.ok(check1.errors.some((e) => e.code === "WAIVER-CLASS-MISSING-FOLLOWUP"));

  const notLiterallyTrue = poWaivedWaiver({ criticFollowUp: { required: "yes", status: "outstanding", evidenceRef: null } });
  const check2 = validateWaiverClassInvariants(notLiterallyTrue);
  assert.equal(check2.valid, false);
  assert.ok(check2.errors.some((e) => e.code === "WAIVER-CLASS-FOLLOWUP-NOT-REQUIRED"));

  const badStatus = poWaivedWaiver({ criticFollowUp: { required: true, status: "done", evidenceRef: null } });
  const check3 = validateWaiverClassInvariants(badStatus);
  assert.equal(check3.valid, false);
  assert.ok(check3.errors.some((e) => e.code === "WAIVER-CLASS-FOLLOWUP-INVALID-STATUS"));

  const evidenceWhileOutstanding = poWaivedWaiver({
    criticFollowUp: { required: true, status: "outstanding", evidenceRef: "critic-review-2026-07-26" },
  });
  const check4 = validateWaiverClassInvariants(evidenceWhileOutstanding);
  assert.equal(check4.valid, false);
  assert.ok(check4.errors.some((e) => e.code === "WAIVER-CLASS-FOLLOWUP-UNEXPECTED-EVIDENCE"));

  const missingEvidenceWhileSatisfied = poWaivedWaiver({
    criticFollowUp: { required: true, status: "satisfied", evidenceRef: null },
  });
  const check5 = validateWaiverClassInvariants(missingEvidenceWhileSatisfied);
  assert.equal(check5.valid, false);
  assert.ok(check5.errors.some((e) => e.code === "WAIVER-CLASS-FOLLOWUP-MISSING-EVIDENCE"));
}

// --- po-waived-direct-implementation: fresh record reports follow-up outstanding;
//     clearFollowUp transitions it to satisfied, without mutating the original input

{
  const waiver = deepFreeze(poWaivedWaiver());
  const before = JSON.stringify(waiver);

  assert.equal(isFollowUpOutstanding(waiver), true);

  const cleared = clearFollowUp(waiver, "critic-review-evidence://2026-07-26/session-4321");

  assert.equal(JSON.stringify(waiver), before, "clearFollowUp must not mutate the original waiver record");
  assert.equal(isFollowUpOutstanding(waiver), true, "original record must still report outstanding after transition");

  assert.equal(isFollowUpOutstanding(cleared), false);
  assert.equal(cleared.criticFollowUp.status, "satisfied");
  assert.equal(cleared.criticFollowUp.evidenceRef, "critic-review-evidence://2026-07-26/session-4321");
  // all other fields carried through unchanged
  assert.equal(cleared.authority, waiver.authority);
  assert.equal(cleared.expiry, waiver.expiry);
  assert.equal(cleared.waiverClass, waiver.waiverClass);

  // re-validate: the cleared record is itself a valid record of this class
  assert.deepEqual(validateWaiverClassInvariants(cleared), { valid: true });
}

// --- clearFollowUp is one-directional: re-clearing an already-satisfied record throws

{
  const waiver = poWaivedWaiver();
  const cleared = clearFollowUp(waiver, "critic-review-evidence://first-pass");
  assert.throws(() => clearFollowUp(cleared, "critic-review-evidence://second-pass"), TypeError);
}

// --- clearFollowUp rejects non-po-waived waivers, missing/empty evidenceRef, and malformed records

{
  assert.throws(() => clearFollowUp(genericWaiver(), "some-evidence"), TypeError, "a non-po-waived-direct-implementation waiver must be rejected");
  assert.throws(() => clearFollowUp(poWaivedWaiver(), ""), TypeError, "empty evidenceRef must be rejected");
  assert.throws(() => clearFollowUp(poWaivedWaiver(), undefined), TypeError, "missing evidenceRef must be rejected");
  const { expiry, ...malformed } = poWaivedWaiver();
  assert.throws(() => clearFollowUp(malformed, "some-evidence"), TypeError, "a structurally invalid po-waived record must be rejected");
}

// --- isFollowUpOutstanding is false (not a thrown error) for anything that isn't
//     a valid outstanding po-waived-direct-implementation record

{
  assert.equal(isFollowUpOutstanding(null), false);
  assert.equal(isFollowUpOutstanding(genericWaiver()), false);
  assert.equal(isFollowUpOutstanding(poWaivedWaiver({ criticFollowUp: { required: true, status: "satisfied", evidenceRef: "x" } })), false);
}

// --- top-of-file comment documents exported names/signatures, the waiverClass
//     taxonomy, and the mandatory-follow-up/self-clearing design (matching
//     CYB-1a/1b/1g's style)

{
  const modulePath = fileURLToPath(new URL("./control-waiver-lifecycle.mjs", import.meta.url));
  const source = readFileSync(modulePath, "utf8");

  assert.match(source, /Exports \(stable\):/, "top-of-file comment must list stable exports, matching sibling-module style");
  assert.match(source, /evaluateWaiverLifecycle\(\{ waiver, now, otherwiseStatus, evidence \}\)/);
  assert.match(source, /validateWaiverClassInvariants\(waiver\)/);
  assert.match(source, /isFollowUpOutstanding\(waiver\)/);
  assert.match(source, /clearFollowUp\(waiver, evidenceRef\)/);
  assert.match(source, /po-waived-direct-implementation/);
  assert.match(source, /criticFollowUp/);
  assert.match(source, /DESIGN DECISIONS/);
  assert.match(source, /Self-clearing transition/);
}
