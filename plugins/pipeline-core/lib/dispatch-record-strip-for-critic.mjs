#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Strip a dispatch record down to a strictly bounded, prose-free safe field
 * set before it is cited as authorship evidence in a Critic dispatch.
 *
 * WHY. `templates/prompts/critic-review.md` requires both of these, and they
 * collide: a Critic needs dispatch-record evidence to verify diff authorship
 * (`commits`, `report.changedFiles`, whether a `Dispatch:` trailer resolves),
 * while CR-02/EL-09 forbid the Critic from receiving the implementor's own
 * justification prose. A dispatch record's mandatory `report.text` field
 * carries exactly that prose, so handing over the raw record satisfies the
 * first requirement by violating the second. Confirmed live 2026-09-04: a
 * Critic round on the capture-evidence package received an unstripped record
 * and disclosed the contamination itself (roughly 1,500 characters of
 * per-finding implementor narrative in `report.text`). See
 * backlog/items/2026-09-04-a-dispatch-record-carries-implementor-prose-into-a-critic-that-must-not-read-it.md.
 *
 * This is the dispatch-record sibling of
 * `stripBacklogItemForDispatch()`/`stripBacklogVerdictProse()`
 * (`backlog-dispatch-reference.mjs`), which solves the same shape of problem
 * for backlog items (PO decision 2026-08-18 #19: strip at the
 * dispatch-construction side, never a disregard instruction asked of the
 * downstream reader). Unlike that sibling, a dispatch record is JSON, not
 * Markdown with a frontmatter/body split needing heading-boundary detection
 * — so this module strips by ALLOWLISTING a fixed, flat set of fields from an
 * already-parsed record object, rather than by locating and removing a prose
 * section from raw text. The effect is the same: every field not on the
 * declared safe set is dropped, unconditionally, including any future field
 * this module has never heard of.
 *
 * A field absent from the source record is simply absent from the output —
 * never invented, never null-filled, mirroring the sibling's defensive style.
 */

/** The exact top-level fields carried through unchanged when present. */
export const DISPATCH_RECORD_SAFE_TOP_LEVEL_FIELDS = Object.freeze([
  "taskId",
  "agentType",
  "model",
  "effort",
  "rulesetSha",
  "commits",
  "outcome",
]);

/**
 * The house-style rationale separator inside a `report.changedFiles` bare-
 * string entry (`"<path> - <rationale>"`, confirmed against the real corpus,
 * e.g. `evidence/dispatch-record-NVA-B-SCANNER.json`). Split on the FIRST
 * literal occurrence so a rationale that itself contains " - " is still cut
 * at the earliest boundary, never mistaken for part of the path.
 */
const RATIONALE_SEPARATOR = " - ";

/**
 * Reduce one `report.changedFiles` entry to a bare repo-relative path string,
 * or `null` when the entry's shape carries no recognisable path (dropped by
 * the caller rather than passed through as-is — an unrecognised shape is
 * exactly the kind of thing this module exists to keep out).
 *
 * @param {unknown} entry
 * @returns {string|null}
 */
function normalizeChangedFileEntry(entry) {
  if (typeof entry === "string") {
    const separatorIndex = entry.indexOf(RATIONALE_SEPARATOR);
    const path = separatorIndex === -1 ? entry : entry.slice(0, separatorIndex);
    return path.trim();
  }
  if (entry && typeof entry === "object" && !Array.isArray(entry) && typeof entry.path === "string") {
    return entry.path.trim();
  }
  return null;
}

/**
 * Normalize a whole `report.changedFiles` array to bare path strings,
 * dropping any entry whose shape does not resolve to a non-empty path.
 *
 * @param {unknown[]} changedFiles
 * @returns {string[]}
 */
function normalizeChangedFiles(changedFiles) {
  const normalized = [];
  for (const entry of changedFiles) {
    const path = normalizeChangedFileEntry(entry);
    if (typeof path === "string" && path !== "") normalized.push(path);
  }
  return normalized;
}

/**
 * `modelOverride` is kept ONLY as `{ model, effort }` — both bounded,
 * non-prose values — never `.rationale`, which is exactly the class of
 * free-text implementor justification this mechanism exists to remove
 * (MP-05/MP-07 requires the rationale for a real briefing, but a Critic
 * verifying authorship never needs to read WHY a model was overridden, only
 * THAT one was).
 *
 * @param {unknown} modelOverride
 * @returns {{model?: string, effort?: string}|undefined}
 */
function stripModelOverride(modelOverride) {
  if (!modelOverride || typeof modelOverride !== "object" || Array.isArray(modelOverride)) return undefined;
  const stripped = {};
  if (typeof modelOverride.model === "string") stripped.model = modelOverride.model;
  if (typeof modelOverride.effort === "string") stripped.effort = modelOverride.effort;
  return stripped;
}

/**
 * Reduce a full, already-parsed dispatch-record object to the strictly
 * bounded safe field set: `taskId`, `agentType`, `model`, `effort`,
 * `rulesetSha`, `commits`, `outcome`, `report.changedFiles` (normalized to
 * bare path strings), and `modelOverride.{model,effort}` when present.
 * Everything else — `report.text`, `log`, `dispatcher`, `criticSkip`,
 * `modelOverride.rationale`, and any other field — is dropped.
 *
 * Pure function: never touches the filesystem, never mutates its input.
 *
 * @param {Record<string, unknown>} record
 * @returns {Record<string, unknown>}
 */
export function stripDispatchRecordForCritic(record) {
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    throw new TypeError("record must be a JSON object");
  }

  const stripped = {};
  for (const field of DISPATCH_RECORD_SAFE_TOP_LEVEL_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(record, field)) {
      stripped[field] = record[field];
    }
  }

  const changedFiles = record.report && typeof record.report === "object" ? record.report.changedFiles : undefined;
  if (Array.isArray(changedFiles)) {
    stripped.report = { changedFiles: normalizeChangedFiles(changedFiles) };
  }

  const strippedModelOverride = stripModelOverride(record.modelOverride);
  if (strippedModelOverride !== undefined) {
    stripped.modelOverride = strippedModelOverride;
  }

  return stripped;
}
