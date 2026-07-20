// SPDX-License-Identifier: Apache-2.0

/**
 * Safe display-only rendering for the optional V3 PO label.
 *
 * The calibration value is never an actor, evidence value, path, command,
 * selector, or markup fragment.  Callers that own a terminal/plain-text host
 * field receive text only.  Markup-capable callers receive one text-encoded
 * scalar stream and must not concatenate it into a source fragment.
 */
import { validateHumanDecisionLabel } from "./human-role-labels.mjs";

const DEFAULT_PO_DISPLAY_LABEL = "PO";

function calibrationLabel(calibration) {
  const configured = calibration?.humanRoles?.po?.displayLabel;
  return configured === undefined ? DEFAULT_PO_DISPLAY_LABEL : configured;
}

export function resolveHumanDecisionDisplayLabel(calibration = {}) {
  const displayLabel = calibrationLabel(calibration);
  const validation = validateHumanDecisionLabel(displayLabel, { path: "$.humanRoles.po.displayLabel" });
  return validation.ok
    ? { ok: true, displayLabel }
    : { ok: false, code: validation.error.code, message: validation.error.message };
}

export function renderHumanDecisionPlainText(calibration = {}) {
  const resolved = resolveHumanDecisionDisplayLabel(calibration);
  return resolved.ok
    ? { ok: true, text: `Human decision — ${resolved.displayLabel}` }
    : resolved;
}

export function renderPipelineStatusPlainText() {
  return "Pipeline";
}

/** Encode every Unicode scalar as text for a markup-capable presentation. */
export function encodeTextScalarsForMarkup(value) {
  return Array.from(value, (scalar) => `&#x${scalar.codePointAt(0).toString(16).toUpperCase()};`).join("");
}

export function renderHumanDecisionMarkupText(calibration = {}) {
  const rendered = renderHumanDecisionPlainText(calibration);
  return rendered.ok
    ? { ok: true, text: encodeTextScalarsForMarkup(rendered.text) }
    : rendered;
}

export function renderPipelineStatusMarkupText() {
  return encodeTextScalarsForMarkup(renderPipelineStatusPlainText());
}
