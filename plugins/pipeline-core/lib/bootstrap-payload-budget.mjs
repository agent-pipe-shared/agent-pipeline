// SPDX-License-Identifier: SUL-1.0

import { createHash } from "node:crypto";

export const BOOTSTRAP_PAYLOAD_SCHEMA = "pipeline.bootstrap-payload-measurement.v1";
/**
 * THE single owner of the bootstrap payload budget: every call site imports this
 * constant, none restates it. It was raised on 2026-08-08 (GF-057) on the PO's
 * explicit authorization, with the reasoning recorded above the assertion in
 * skills/pipeline-start/pipeline-start-v3.test.mjs. That raise reached only one
 * of the then-five copies, and the disagreeing copies are exactly what this
 * constant now prevents: bootstrap-payload-measure.test.mjs asserts that no
 * consumer carries a second literal of this number. Raised again 2026-08-18
 * (PO decision) from 18,000 to 45,000, in the same step that raised
 * `HANDOVER_MAX_BYTES` (`lib/handover-rotation.mjs`) from 12,000 to 30,000 --
 * preserving that constant's original 1.5x-headroom relationship to this one
 * (18,000/12,000 = 45,000/30,000 = 1.5) rather than letting the handover cap
 * alone exceed the whole bootstrap budget.
 */
export const BOOTSTRAP_PAYLOAD_MAX_BYTES = 45_000;

/**
 * Byte budget for the post-compact re-ground message's docs/state.md narrative
 * excerpt (`post-compact-reground.mjs`'s `buildStateNarrativeLines`), added
 * 2026-08-19 (`pipeline.post-compact-reground-carries-no-state-md-narrative`,
 * Option 2 "mechanical"). Deliberately a fraction (not the full ceiling) of
 * `BOOTSTRAP_PAYLOAD_MAX_BYTES` above: the excerpt shares one compact message
 * with the structured continuity JSON projection and its own labels/markers,
 * so it needs headroom rather than the whole ceiling to itself. Sized to
 * cover several recent narrative paragraphs of `docs/state.md`'s "live open
 * state" section (PO's explicit "enough content since the last compact, not
 * just the last few crumbs" requirement) while a real-world session's live
 * section, which routinely grows well past this in one working day, still
 * gets truncated rather than ever silently omitted.
 */
export const STATE_EXCERPT_MAX_BYTES = 15_000;

/**
 * Prefix embedded verbatim into a truncated narrative excerpt's own value, so
 * the truncation is visible in the emitted text itself (machine-checkable via
 * substring/regex match), never a silently shorter string.
 */
export const STATE_EXCERPT_TRUNCATION_MARKER =
  "[docs/state.md excerpt truncated: oldest paragraphs dropped to fit the byte budget -- read docs/state.md directly for the full narrative]";

function text(value) {
  return typeof value === "string" ? value : JSON.stringify(value ?? null);
}

/**
 * Conservative runner-neutral upper bound: one UTF-8 byte is one token unit.
 * It intentionally never claims to be a model tokenizer measurement. `maxBytes`
 * defaults to the shared bootstrap ceiling but is overridable so a caller with
 * its own, smaller sub-budget (e.g. `STATE_EXCERPT_MAX_BYTES`) still shares this
 * one canonical measurement/schema instead of hand-rolling a second one.
 */
export function measureBootstrapPayload(value, { mode = "normal", runner = "runner-neutral", maxBytes = BOOTSTRAP_PAYLOAD_MAX_BYTES } = {}) {
  const serialized = text(value);
  const bytes = Buffer.byteLength(serialized, "utf8");
  return Object.freeze({
    schema: BOOTSTRAP_PAYLOAD_SCHEMA,
    metric: "utf8-byte-upper-bound",
    exactModelTokens: false,
    mode,
    runner,
    bytes,
    upperBoundUnits: bytes,
    maxUpperBoundUnits: maxBytes,
    withinBudget: bytes <= maxBytes,
    digestSha256: createHash("sha256").update(serialized).digest("hex"),
  });
}

export function measureBootstrapBytes(bytes, { mode = "normal", runner = "runner-neutral" } = {}) {
  const upperBoundUnits = Number(bytes);
  return Object.freeze({
    schema: BOOTSTRAP_PAYLOAD_SCHEMA,
    metric: "utf8-byte-upper-bound",
    exactModelTokens: false,
    mode,
    runner,
    bytes: upperBoundUnits,
    upperBoundUnits,
    maxUpperBoundUnits: BOOTSTRAP_PAYLOAD_MAX_BYTES,
    withinBudget: upperBoundUnits <= BOOTSTRAP_PAYLOAD_MAX_BYTES,
  });
}

export function boundedPayload(value, options = {}) {
  const originalMeasurement = measureBootstrapPayload(value, options);
  if (originalMeasurement.withinBudget) {
    return {
      value,
      measurement: originalMeasurement,
      originalMeasurement,
      emittedMeasurement: originalMeasurement,
      overBudget: false,
      truncated: false,
    };
  }
  const compact = {
    code: value?.code ?? null,
    featureId: value?.featureId ?? null,
    phase: value?.phase ?? null,
    revision: value?.revision ?? null,
    workResumptionAllowed: value?.workResumptionAllowed === true,
  };
  const emittedMeasurement = measureBootstrapPayload(compact, options);
  return {
    value: compact,
    measurement: emittedMeasurement,
    originalMeasurement,
    emittedMeasurement,
    overBudget: true,
    truncated: true,
  };
}

/**
 * Bound a verbatim narrative text (e.g. docs/state.md's live-open-state
 * excerpt) to `maxBytes`, using this module's one canonical measurement
 * schema rather than a second, hand-rolled truncation concept. On overflow,
 * truncates from the OLDEST end -- drops whole paragraphs (blank-line
 * separated blocks) from the front first, keeping the newest content at the
 * tail -- and prefixes the kept text with `STATE_EXCERPT_TRUNCATION_MARKER`
 * so truncation is visible in the emitted value itself, never silent. Never
 * splits a Unicode code point: the fallback for a single paragraph alone
 * exceeding the budget walks whole code points from the tail (never raw
 * byte offsets), so it can never produce a broken multi-byte sequence --
 * and never a replacement-character byte-length overshoot past `maxBytes`.
 */
export function boundedNarrativeExcerpt(rawText, { maxBytes = STATE_EXCERPT_MAX_BYTES, mode = "state-excerpt" } = {}) {
  if (typeof rawText !== "string" || rawText.trim().length === 0) {
    return { value: null, measurement: null, originalMeasurement: null, truncated: false, overBudget: false };
  }
  const trimmed = rawText.trim();
  const originalMeasurement = measureBootstrapPayload(trimmed, { mode, maxBytes });
  if (originalMeasurement.withinBudget) {
    return { value: trimmed, measurement: originalMeasurement, originalMeasurement, truncated: false, overBudget: false };
  }
  const markerBlock = `${STATE_EXCERPT_TRUNCATION_MARKER}\n\n`;
  const paragraphs = trimmed.split(/\n\n+/).filter((paragraph) => paragraph.length > 0);
  let kept = [];
  for (let i = paragraphs.length - 1; i >= 0; i -= 1) {
    const candidate = [paragraphs[i], ...kept];
    const candidateValue = `${markerBlock}${candidate.join("\n\n")}`;
    if (Buffer.byteLength(candidateValue, "utf8") > maxBytes) break;
    kept = candidate;
  }
  let value;
  if (kept.length > 0) {
    value = `${markerBlock}${kept.join("\n\n")}`;
  } else {
    const lastParagraph = paragraphs[paragraphs.length - 1] ?? "";
    const room = Math.max(0, maxBytes - Buffer.byteLength(markerBlock, "utf8"));
    value = `${markerBlock}${codePointSafeTail(lastParagraph, room)}`;
  }
  const measurement = measureBootstrapPayload(value, { mode, maxBytes });
  return { value, measurement, originalMeasurement, truncated: true, overBudget: true };
}

/**
 * Longest suffix of `str` whose UTF-8 byte length is `<= maxBytes`, walking
 * whole Unicode code points from the end so a surrogate pair or multi-byte
 * character is never split (which would otherwise risk a replacement-
 * character byte-length overshoot past `maxBytes`).
 */
function codePointSafeTail(str, maxBytes) {
  if (maxBytes <= 0) return "";
  if (Buffer.byteLength(str, "utf8") <= maxBytes) return str;
  const codePoints = Array.from(str);
  let bytes = 0;
  let start = codePoints.length;
  for (let i = codePoints.length - 1; i >= 0; i -= 1) {
    const charBytes = Buffer.byteLength(codePoints[i], "utf8");
    if (bytes + charBytes > maxBytes) break;
    bytes += charBytes;
    start = i;
  }
  return codePoints.slice(start).join("");
}

export function selectLazyReferences({ code, role = "elephant", ready = false } = {}) {
  if (ready || code === "PCR-READY") return [];
  const refs = ["references/onboarding-recovery.md"];
  if (["critic", "goldfish"].includes(role)) refs.push("references/role-specific.md");
  if (code === "PCR-DECISION-PENDING" || code === "PCR-BLOCKED") refs.push("references/continuation.md");
  return refs;
}
