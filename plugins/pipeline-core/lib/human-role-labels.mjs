// SPDX-License-Identifier: Apache-2.0

/**
 * The decision-role label is deliberately presentation-only.  Machine role
 * keys stay `po`; callers may use the returned label only in a human-facing
 * text field.
 */
export const DEFAULT_HUMAN_DECISION_LABEL = "PO";

const EDGE_WHITESPACE = /^[\u0009-\u000D\u0020\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+|[\u0009-\u000D\u0020\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+$/gu;
const MARKUP_OR_ESCAPE = new Set([0x3C, 0x3E, 0x5B, 0x5D, 0x7B, 0x7D, 0x60, 0x5C]);

export class HumanRoleLabelValidationError extends TypeError {
  constructor(error) {
    super(error.message);
    this.name = "HumanRoleLabelValidationError";
    this.code = error.code;
    this.path = error.path;
  }
}

function failure(path, code, message) {
  return { ok: false, error: { path, code, message, repair: "use a 1–40 scalar NFC plain-text display label" } };
}

function isNoncharacter(codePoint) {
  return (codePoint >= 0xFDD0 && codePoint <= 0xFDEF)
    || (codePoint <= 0x10FFFF && (codePoint & 0xFFFE) === 0xFFFE);
}

/**
 * Validate the source value without normalizing or repairing it.  The error
 * object is suitable for the typed V3 validator and never contains a rendered
 * value.
 */
export function validateHumanDecisionLabel(value, { path = "$.roles.po.display_label" } = {}) {
  if (typeof value !== "string") return failure(path, "human_role_label_type", "human decision display label must be a string");
  if (value !== value.normalize("NFC")) return failure(path, "human_role_label_nfc", "human decision display label must already be NFC");
  if (value !== value.replace(EDGE_WHITESPACE, "")) return failure(path, "human_role_label_trim", "human decision display label must not have Unicode whitespace at either edge");

  const scalars = Array.from(value);
  if (scalars.length < 1 || scalars.length > 40) return failure(path, "human_role_label_length", "human decision display label must contain 1–40 Unicode scalar values");

  for (const scalar of scalars) {
    const codePoint = scalar.codePointAt(0);
    if (codePoint <= 0x1F || (codePoint >= 0x7F && codePoint <= 0x9F)) return failure(path, "human_role_label_control", "human decision display label contains a control character");
    if (codePoint === 0x61C || codePoint === 0x200E || codePoint === 0x200F || (codePoint >= 0x202A && codePoint <= 0x202E) || (codePoint >= 0x2066 && codePoint <= 0x2069)) return failure(path, "human_role_label_bidi", "human decision display label contains a bidi control");
    if (MARKUP_OR_ESCAPE.has(codePoint)) return failure(path, "human_role_label_markup", "human decision display label contains markup or an escape character");
    if ((codePoint >= 0xD800 && codePoint <= 0xDFFF) || isNoncharacter(codePoint)) return failure(path, "human_role_label_scalar", "human decision display label contains an invalid Unicode scalar");
  }
  return { ok: true, value };
}

/** Resolve the optional source shape.  Missing roles/po deliberately means PO. */
export function resolveHumanDecisionLabel(roles, { path = "$.roles.po.display_label" } = {}) {
  if (roles === undefined || roles === null || roles.po === undefined || roles.po === null) return DEFAULT_HUMAN_DECISION_LABEL;
  const result = validateHumanDecisionLabel(roles.po.display_label, { path });
  if (!result.ok) throw new HumanRoleLabelValidationError(result.error);
  return result.value;
}

/** Plain terminal/host text only; never use this result as markup or an identifier. */
export function renderHumanDecisionText(label = DEFAULT_HUMAN_DECISION_LABEL) {
  const result = validateHumanDecisionLabel(label, { path: "$.humanRoles.po.displayLabel" });
  if (!result.ok) throw new HumanRoleLabelValidationError(result.error);
  return `Human decision — ${result.value}`;
}

/** Encode every label scalar for an HTML or Markdown text-node renderer. */
export function escapeHumanDecisionLabelText(label = DEFAULT_HUMAN_DECISION_LABEL) {
  const result = validateHumanDecisionLabel(label, { path: "$.humanRoles.po.displayLabel" });
  if (!result.ok) throw new HumanRoleLabelValidationError(result.error);
  return Array.from(result.value).map((scalar) => `&#x${scalar.codePointAt(0).toString(16).toUpperCase()};`).join("");
}
