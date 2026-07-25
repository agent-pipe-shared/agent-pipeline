// SPDX-License-Identifier: SUL-1.0
//
// CYB-2C -- pure L2 required-capability plan builder. Consumes CYB-1b's
// `resolveApplicableControls()` output (a ResolvedPolicy -- see
// security-policy-resolver.mjs's top-of-file JSDoc for its exact shape) and
// produces a capability-level plan: `{ required: string[], optional:
// string[], planDigest: string }` of `cap.<family>` root ids, structurally
// matching the `plan.required`/`plan.optional` shape CYB-2A's fixture matrix
// (security-evidence-fixture-matrix.mjs) and CYB-2B's evaluator/aggregate
// function already consume (that shape comment documents `{required,
// optional}` as array-of-string-ids; this builder additionally attaches a
// `planDigest`, see point 5 below).
//
// Does NOT wire this plan into security-scan.mjs or guard-push.mjs (later
// waves, CYB-2E/2F) and does NOT add a field to control-catalog-schema.mjs's
// closed section 8 field set -- everything here is derived from existing
// ResolvedPolicy/control fields only.
//
// ---------------------------------------------------------------------------
// DESIGN DECISIONS (this task's genuine design latitude, documented here so
// a reader can predict this builder's output for a sixth, unseen
// ResolvedPolicy input without re-deriving the rule from the diff):
//
// 1. Required/optional mapping rule. CYB-1b's closed catalog schema has no
//    field that directly marks a control "required" vs "optional" at the
//    capability-plan level -- the closest existing signal is each control's
//    `defaultFailureMode` (control-catalog-schema.mjs section 8; a free-form
//    non-empty string field, not a closed enum -- only "block" appears
//    anywhere in the live catalog today). This builder reads
//    `entry.control.capabilityRequirements` (an array of `cap.<family>` or
//    `cap.<family>.<technique>` ids, CYB-1F section 3 grammar) and
//    `entry.control.defaultFailureMode` off each `resolvedControls[]` entry:
//      - a capability FAMILY ROOT is REQUIRED if it is named (directly, or
//        via a `.technique` suffix stripped per point 2) by at least one
//        resolved control whose `defaultFailureMode === "block"`.
//      - it is OPTIONAL if it is named only by resolved controls whose
//        `defaultFailureMode` is some other, non-"block" string, and never
//        by a "block"-mode control.
//    Rationale: "block" is the one failure-mode value this codebase already
//    defines operational semantics for (a blocking gate) -- treating it as
//    the required signal, and everything else as optional, is the smallest,
//    most literal reading of the existing field that does not invent new
//    vocabulary. Against today's live catalog (every control is "block")
//    this makes `optional` legitimately empty for all real fixtures -- a
//    fact about current catalog content, not a builder defect. The non-
//    "block" branch is exercised by a synthetic mixed-signal fixture in the
//    test file (which the live catalog cannot produce on its own today).
//
// 2. Capability-root normalization. A `capabilityRequirements` entry may be
//    a bare family root (`cap.secrets`) or a root+technique
//    (`cap.sast.taint-flow`, CYB-1F section 3 grammar). This builder's plan
//    operates at the FAMILY ROOT level only (per this task's Goal: "cap.*
//    capability-root ids") -- any `.technique` suffix is stripped to its
//    `cap.<family>` root before required/optional classification. No live
//    catalog control uses a technique suffix today; this rule exists so a
//    sixth, unseen input that does is still handled correctly, not merely
//    tolerated as an opaque extra id.
//
// 3. Tie resolution across multiple contributing controls ("required wins
//    ties"). A capability root named by two or more resolved controls with
//    mixed failure-mode signals (at least one "block", at least one not)
//    ends up in `required` -- ANY contributing control marking it required
//    is enough. This is the safe default for a security gate: a capability
//    silently downgrading to "optional" because of one weakly-attributed
//    control, while another control still needs it enforced, is exactly the
//    failure mode a plan builder must not produce. Concretely: this builder
//    computes the REQUIRED set first (union over all "block"-attributed
//    capability roots), then OPTIONAL = (every named root) minus REQUIRED --
//    so a root can never appear in both arrays, and both arrays are
//    deduplicated and sorted for deterministic output.
//
// 4. Applicability is not consulted. `resolvedControls[]` entries with
//    `applicability: "unknown"` (a declared `requiredInputs` value absent
//    from the caller's `applicabilityInputs` at resolve time -- CYB-1b AC4)
//    still contribute their `capabilityRequirements` to the plan exactly
//    like an "applicable" entry. `resolveApplicableControls()` already omits
//    any control whose module isn't activated or whose assurance-level
//    threshold isn't met (CYB-1b AC10) -- that is the one and only filter
//    this builder trusts for "is this control in scope at all." Applicability
//    "unknown" means "we do not yet have enough runtime data to know whether
//    this control's free-form condition truly holds," not "this control does
//    not apply" -- silently shrinking the required set because of a missing
//    runtime input would make a capability's requiredness gameable by simply
//    never supplying that input. If a future package needs "unknown"
//    surfaced/handled differently at evaluation time, that is downstream
//    (CYB-2E/2F) evaluator policy, not a reason to drop it from the plan
//    here.
//
// 5. Plan digest -- reuses CYB-1b's own canonical-digest APPROACH (a
//    key-sorted recursive `canonicalize()` serialization hashed with
//    sha256), not a second, differently-designed digest scheme. CYB-1b's
//    `canonicalize()` is a private (non-exported) helper of
//    security-policy-resolver.mjs, so this file re-implements the identical
//    pattern locally (see `canonicalize()` below -- the same key-sorted-
//    object / mapped-array / JSON.stringify-leaf algorithm) rather than
//    reaching into that module's internals or inventing an unrelated hash.
//    The digest payload is `{ policyDigest: resolvedPolicy.digest, required,
//    optional }` -- binding the plan to the EXACT resolved policy it was
//    built from via the `policyDigest` component (spec.md section 2 item 4's
//    "plan digest joins candidate evidence" requirement), while also being
//    sensitive to this builder's own derived output via the
//    `required`/`optional` components (so a future change to the mapping
//    rule itself, applied to the same resolved policy, is still visible as
//    a changed digest rather than silently absorbed into an unchanged one).
//
// Output shape:
//   buildCapabilityPlan(resolvedPolicy: ResolvedPolicy) -> {
//     required: string[],   // sorted, deduplicated cap.<family> root ids
//     optional: string[],   // sorted, deduplicated cap.<family> root ids;
//                            // disjoint from `required` by construction
//     planDigest: string,   // 'sha256:<hex>', see point 5 above
//   }
//
// Purity: no fs/network access; never mutates `resolvedPolicy` or any nested
// value (asserted in the test file via JSON.stringify equality before/after
// a call, and a deep-frozen-input call).

import { createHash } from "node:crypto";

function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// Identical pattern to security-policy-resolver.mjs's own (private,
// non-exported) `canonicalize()` -- reimplemented here rather than reaching
// into that module's internals (design decision 5 above).
function canonicalize(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

// CYB-1F section 3 grammar: cap.<family> or cap.<family>.<technique>. This
// builder operates at the family-root level only (design decision 2 above).
function familyRootOf(capabilityId) {
  const dot = capabilityId.indexOf(".", "cap.".length);
  return dot === -1 ? capabilityId : capabilityId.slice(0, dot);
}

// The L2 required-capability plan builder. Pure: performs no filesystem/
// network access and mutates none of `resolvedPolicy`'s (nested) values.
export function buildCapabilityPlan(resolvedPolicy) {
  if (!isPlainObject(resolvedPolicy)) {
    throw new TypeError("buildCapabilityPlan: resolvedPolicy must be a plain object (the ResolvedPolicy returned by resolveApplicableControls())");
  }
  const { resolvedControls, digest } = resolvedPolicy;
  if (!Array.isArray(resolvedControls)) {
    throw new TypeError("buildCapabilityPlan: resolvedPolicy.resolvedControls must be an array");
  }
  if (typeof digest !== "string" || digest.length === 0) {
    throw new TypeError("buildCapabilityPlan: resolvedPolicy.digest must be a non-empty string");
  }

  const requiredRoots = new Set();
  const namedRoots = new Set();

  resolvedControls.forEach((entry, index) => {
    if (!isPlainObject(entry) || !isPlainObject(entry.control)) {
      throw new TypeError(`buildCapabilityPlan: resolvedPolicy.resolvedControls[${index}].control must be a plain object`);
    }
    const { capabilityRequirements, defaultFailureMode } = entry.control;
    if (capabilityRequirements === undefined) return; // this control names no capability at all
    if (!Array.isArray(capabilityRequirements)) {
      throw new TypeError(`buildCapabilityPlan: resolvedPolicy.resolvedControls[${index}].control.capabilityRequirements must be an array`);
    }
    for (const rawId of capabilityRequirements) {
      const root = familyRootOf(rawId);
      namedRoots.add(root);
      if (defaultFailureMode === "block") {
        requiredRoots.add(root);
      }
    }
  });

  const required = [...requiredRoots].sort();
  const optional = [...namedRoots].filter((root) => !requiredRoots.has(root)).sort();

  const planDigest = `sha256:${createHash("sha256").update(canonicalize({ policyDigest: digest, required, optional })).digest("hex")}`;

  return { required, optional, planDigest };
}
