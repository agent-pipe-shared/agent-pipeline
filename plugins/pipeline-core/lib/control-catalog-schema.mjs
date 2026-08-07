// SPDX-License-Identifier: SUL-1.0
//
// Exports (stable — CYB-1b/1c/1d/1e/1f/1g import from this exact module path):
//   validateControl(control)                            -> { valid } | { valid: false, errors }
//   lintCatalogContent(controls)                         -> { valid } | { valid: false, errors }
//   lintStandardMappingsAndClaims(controls, catalogText) -> { valid } | { valid: false, errors }
//
// Encodes the CYB-1F §8 closed control-catalog schema field boundary
// (specs/2026-07-24-sprint-cyborg-epic/cyb-1f-schema-boundary-draft.md §8)
// and the AC1/AC5/AC8 checks from
// specs/2026-07-24-sprint-cyborg-epic/cyb-1-feature-spec.md §3.
//
// Design decisions this task made where §8 names a composite field only in
// prose (no sub-schema is frozen there — these shapes are THIS module's own
// encoding, not independently frozen; a later change goes through the §6
// re-approval rule, same as any other schema change, without reopening §8's
// top-level list):
//   - `applicability`    -> { expression: string, requiredInputs: string[] }
//   - `evidenceContract` -> { schemaRef: string, ... } — only `schemaRef` is
//     required; the freshness/binding-rule portion is validated
//     permissively (extra/loosely-shaped keys tolerated) because §8's
//     "schema ref + freshness/binding rule" is ambiguous between a 2-key and
//     3-key shape and CYB-1c (receipt binding) is the actual owner of that
//     detail.
//   - `waiver`           -> null (not waived) | { authority, reason, expiry,
//     revalidationTrigger } (all four §8-named sub-fields required, and
//     each a non-empty string, when waiver is not null)
//   - `standardMappings` entries -> { standard: string, ... } structurally
//     here; the "versioned" requirement (§8) is enforced by
//     lintStandardMappingsAndClaims (AC8), not here, so all three exports
//     stay independently unit-testable per this task's DoD.
// `status` is validated as a plain non-empty string, not CYB-1F §7's
// control-result enum: §7 is the *evaluation-result* enum for the receipt
// (explicitly "distinct from ... the L3 per-capability run outcome enum" in
// §7's own text), not a catalog record's lifecycle status; the briefing
// flags §7 as background-only for this task.
// `capabilityRequirements` entries are checked against BOTH the
// `cap.<family>[.<technique>]` grammar (§3) AND membership of the family
// root in the thirteen frozen roots (§3) — the roots are closed at freeze,
// so a non-root family is rejected here rather than left to a later
// sub-package to discover.
// The top-level control-record schema is CLOSED: an unrecognized top-level
// key is rejected (matching §8's own "closed ... schema field boundary"
// framing). Composite sub-objects are NOT closed in the same way — extra
// keys inside `applicability`/`evidenceContract`/`waiver`/`standardMappings`
// entries are tolerated, since those internal shapes are this module's own
// prose encoding, not part of the frozen §8 list itself.

function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}
function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}
function isNonEmpty(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (isPlainObject(v)) return Object.keys(v).length > 0;
  return Boolean(v);
}

// CYB-1F §4: ctl.<class>.<domain>.<slug>, class in {base, stack, risk}.
const CONTROL_ID_RE = /^ctl\.(?:base|stack|risk)\.[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
// CYB-1F §3: cap.<family> or cap.<family>.<technique>.
const CAPABILITY_RE = /^cap\.([a-z0-9]+(?:-[a-z0-9]+)*)(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)?$/;
// CYB-1F §3: the thirteen frozen family roots (closed at freeze; additive
// sub-techniques under a root do not reopen the freeze).
const FROZEN_CAPABILITY_ROOTS = new Set([
  "secrets", "sca", "sast", "iac", "container", "ci-workflow", "dast",
  "fuzz", "memsafety", "authz", "crypto", "privacy", "ai-agent",
]);
const CONTROL_CLASSES = new Set(["base", "stack", "risk"]);

// CYB-1F §8 closed field set — exactly these 22 keys. `waiver`,
// `supersedes` and `supersededBy` may hold a null VALUE, but the key itself
// is still required (downstream packages can rely on the key existing).
const CONTROL_FIELDS = Object.freeze([
  "id", "revision", "status", "title", "objective", "threat", "class",
  "applicability", "phase", "boundary", "owner", "approvalAuthority",
  "verifierType", "capabilityRequirements", "evidenceContract", "severity",
  "defaultFailureMode", "remediation", "waiver", "supersedes",
  "supersededBy", "standardMappings",
]);
const CONTROL_FIELD_SET = new Set(CONTROL_FIELDS);
const SIMPLE_STRING_FIELDS = [
  "status", "title", "objective", "threat", "phase", "boundary", "owner",
  "approvalAuthority", "verifierType", "severity", "defaultFailureMode",
  "remediation",
];

// AC1 — validate one control record against the CYB-1F §8 closed schema.
// Pure: reads only, never mutates `control`, no filesystem/network access.
// Returns { valid: true } or { valid: false, errors: [{ field, code, message }] }.
export function validateControl(control) {
  if (!isPlainObject(control)) {
    return { valid: false, errors: [{ field: null, code: "SCHEMA-NOT-OBJECT", message: "control record must be a plain object" }] };
  }

  const errors = [];

  for (const key of Object.keys(control)) {
    if (!CONTROL_FIELD_SET.has(key)) {
      errors.push({ field: key, code: "SCHEMA-UNKNOWN-FIELD", message: `unexpected field "${key}" is not part of the CYB-1F §8 closed schema` });
    }
  }
  for (const field of CONTROL_FIELDS) {
    if (!hasOwn(control, field)) {
      errors.push({ field, code: "SCHEMA-MISSING-FIELD", message: `missing required field "${field}"` });
    }
  }

  for (const field of SIMPLE_STRING_FIELDS) {
    if (hasOwn(control, field) && !isNonEmptyString(control[field])) {
      errors.push({ field, code: "SCHEMA-INVALID-STRING-FIELD", message: `field "${field}" must be a non-empty string` });
    }
  }

  if (hasOwn(control, "id") && !CONTROL_ID_RE.test(control.id)) {
    errors.push({ field: "id", code: "SCHEMA-INVALID-ID", message: `field "id" must match the control-ID grammar ctl.<class>.<domain>.<slug> (CYB-1F §4), got ${JSON.stringify(control.id)}` });
  }

  if (hasOwn(control, "revision") && !(Number.isInteger(control.revision) && control.revision >= 0)) {
    errors.push({ field: "revision", code: "SCHEMA-INVALID-REVISION", message: 'field "revision" must be a non-negative integer' });
  }

  if (hasOwn(control, "class") && !CONTROL_CLASSES.has(control.class)) {
    errors.push({ field: "class", code: "SCHEMA-INVALID-CLASS", message: `field "class" must be one of base|stack|risk (CYB-1F §4), got ${JSON.stringify(control.class)}` });
  }

  if (hasOwn(control, "applicability")) {
    const a = control.applicability;
    if (!isPlainObject(a) || !isNonEmptyString(a.expression) || !Array.isArray(a.requiredInputs) || !a.requiredInputs.every(isNonEmptyString)) {
      errors.push({ field: "applicability", code: "SCHEMA-INVALID-APPLICABILITY", message: 'field "applicability" must be an object with a non-empty "expression" string and a "requiredInputs" array of non-empty strings (CYB-1F §8 prose encoding)' });
    }
  }

  if (hasOwn(control, "capabilityRequirements")) {
    const list = control.capabilityRequirements;
    if (!Array.isArray(list)) {
      errors.push({ field: "capabilityRequirements", code: "SCHEMA-INVALID-CAPABILITY-REQUIREMENTS", message: 'field "capabilityRequirements" must be an array' });
    } else {
      list.forEach((entry, index) => {
        const match = isNonEmptyString(entry) ? entry.match(CAPABILITY_RE) : null;
        if (!match) {
          errors.push({ field: `capabilityRequirements[${index}]`, code: "SCHEMA-INVALID-CAPABILITY-REQUIREMENTS", message: `entry ${JSON.stringify(entry)} does not match the cap.<family>[.<technique>] grammar (CYB-1F §3)` });
          return;
        }
        if (!FROZEN_CAPABILITY_ROOTS.has(match[1])) {
          errors.push({ field: `capabilityRequirements[${index}]`, code: "SCHEMA-UNKNOWN-CAPABILITY-ROOT", message: `entry ${JSON.stringify(entry)} references family root "cap.${match[1]}", which is not one of the thirteen frozen roots (CYB-1F §3)` });
        }
      });
    }
  }

  if (hasOwn(control, "evidenceContract")) {
    const ec = control.evidenceContract;
    if (!isPlainObject(ec) || !isNonEmptyString(ec.schemaRef)) {
      errors.push({ field: "evidenceContract", code: "SCHEMA-INVALID-EVIDENCE-CONTRACT", message: 'field "evidenceContract" must be an object with a non-empty "schemaRef" string (the freshness/binding-rule portion is validated permissively; CYB-1F §8 does not fix its exact key shape)' });
    }
  }

  if (hasOwn(control, "waiver") && control.waiver !== null) {
    const w = control.waiver;
    const waiverFields = ["authority", "reason", "expiry", "revalidationTrigger"];
    if (!isPlainObject(w) || !waiverFields.every((k) => isNonEmptyString(w[k]))) {
      errors.push({ field: "waiver", code: "SCHEMA-INVALID-WAIVER", message: 'field "waiver" must be null (not waived) or an object with non-empty "authority", "reason", "expiry" and "revalidationTrigger" strings (CYB-1F §8)' });
    }
  }

  for (const field of ["supersedes", "supersededBy"]) {
    if (hasOwn(control, field) && control[field] !== null && !CONTROL_ID_RE.test(control[field])) {
      errors.push({ field, code: field === "supersedes" ? "SCHEMA-INVALID-SUPERSEDES" : "SCHEMA-INVALID-SUPERSEDED-BY", message: `field "${field}" must be null or a control ID matching ctl.<class>.<domain>.<slug> (CYB-1F §4)` });
    }
  }

  if (hasOwn(control, "standardMappings")) {
    const sm = control.standardMappings;
    if (!Array.isArray(sm)) {
      errors.push({ field: "standardMappings", code: "SCHEMA-INVALID-STANDARD-MAPPINGS", message: 'field "standardMappings" must be an array' });
    } else {
      sm.forEach((entry, index) => {
        if (!isPlainObject(entry) || !isNonEmptyString(entry.standard)) {
          errors.push({ field: `standardMappings[${index}]`, code: "SCHEMA-INVALID-STANDARD-MAPPINGS", message: `entry at index ${index} must be an object with a non-empty "standard" name (version traceability is enforced by lintStandardMappingsAndClaims, AC8)` });
        }
      });
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

const CATALOG_CONTENT_REQUIRED_FIELDS = ["verifierType", "evidenceContract", "boundary", "defaultFailureMode"];

// AC5 — catalog-content lint: every control names verifier + evidence
// contract + boundary + failure policy. Runs over ALL supplied controls
// unconditionally: resolving true per-repository "applicability" is the
// CYB-1b resolver's job (out of scope here), so this lint validates the
// static catalog definition, not a per-repo resolved view.
// Pure and independent of validateControl (does not call it internally).
export function lintCatalogContent(controls) {
  if (!Array.isArray(controls)) {
    throw new TypeError("lintCatalogContent: controls must be an array");
  }
  const errors = [];
  for (const control of controls) {
    if (!isPlainObject(control)) {
      errors.push({ controlId: null, field: null, code: "CATALOG-LINT-NOT-OBJECT", message: "control record must be a plain object" });
      continue;
    }
    const controlId = typeof control.id === "string" ? control.id : null;
    for (const field of CATALOG_CONTENT_REQUIRED_FIELDS) {
      if (!isNonEmpty(control[field])) {
        errors.push({ controlId, field, code: "CATALOG-LINT-MISSING-FIELD", message: `control ${controlId ?? "(unknown id)"} is missing required field "${field}"` });
      }
    }
  }
  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

const CLAIM_WORDS_RE = /\b(certified|compliant)\b/i;
const DISCLAIMER_PHRASES = ["informatively mapped to", "not a certification claim"];
const PROSE_FIELDS = ["title", "objective", "threat", "remediation"];

function splitSentences(text) {
  return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

function hasBareClaim(sentence) {
  if (!CLAIM_WORDS_RE.test(sentence)) return false;
  const lower = sentence.toLowerCase();
  return !DISCLAIMER_PHRASES.some((phrase) => lower.includes(phrase));
}

// AC8 — two checks: (a) every standardMappings entry carries a version;
// (b) no bare "certified"/"compliant" claim (without a qualifying
// disclaimer phrase in the same sentence) across control prose fields or
// the optional catalogText narrative-documentation string.
// Pure and independent of the other two exports.
export function lintStandardMappingsAndClaims(controls, catalogText = "") {
  if (!Array.isArray(controls)) {
    throw new TypeError("lintStandardMappingsAndClaims: controls must be an array");
  }
  if (typeof catalogText !== "string") {
    throw new TypeError("lintStandardMappingsAndClaims: catalogText must be a string");
  }
  const errors = [];

  for (const control of controls) {
    if (!isPlainObject(control)) {
      errors.push({ controlId: null, field: null, code: "CATALOG-LINT-NOT-OBJECT", message: "control record must be a plain object" });
      continue;
    }
    const controlId = typeof control.id === "string" ? control.id : null;

    const mappings = Array.isArray(control.standardMappings) ? control.standardMappings : [];
    mappings.forEach((mapping, index) => {
      if (!isPlainObject(mapping) || !isNonEmptyString(mapping.version)) {
        errors.push({ controlId, field: `standardMappings[${index}].version`, code: "CATALOG-LINT-MISSING-VERSION", message: `control ${controlId ?? "(unknown id)"} standardMappings entry ${index} is missing a "version" field` });
      }
    });

    for (const field of PROSE_FIELDS) {
      const text = typeof control[field] === "string" ? control[field] : "";
      for (const sentence of splitSentences(text)) {
        if (hasBareClaim(sentence)) {
          errors.push({ controlId, field, code: "CATALOG-LINT-BARE-CLAIM", message: `control ${controlId ?? "(unknown id)"} field "${field}" uses "certified"/"compliant" without a qualifying disclaimer in the same sentence`, sentence });
        }
      }
    }
  }

  for (const sentence of splitSentences(catalogText)) {
    if (hasBareClaim(sentence)) {
      errors.push({ controlId: null, field: "catalogText", code: "CATALOG-LINT-BARE-CLAIM", message: 'catalog doc text uses "certified"/"compliant" without a qualifying disclaimer in the same sentence', sentence });
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}
