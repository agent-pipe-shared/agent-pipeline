#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Strip a backlog item's own Triage/verdict/closure prose before the item is
 * cited as a spec/reference input to a downstream dispatch (Goldfish or
 * Critic).
 *
 * WHY. `docs/state.md`'s 2026-08-08 Nova GF-054 entry recorded a concrete
 * incident: a backlog item's Triage section carried an earlier Critic
 * verdict, and that item was later handed to a subsequent Critic as a
 * reference/spec input -- meaning the later Critic could read a prior
 * verdict about the very thing it was independently supposed to judge (a
 * "circular measuring stick"). The Critic caught it itself that time, but the
 * incident named the failure as the DISPATCHER's, not something to rely on a
 * downstream reader catching every time.
 * See backlog/items/2026-08-18-triage-verdict-text-can-contaminate-a-backlog-
 * item-as-a-later-spec-reference.md and PO decision 2026-08-18 #19: strip at
 * the dispatch-construction side (this module), rather than instructing the
 * downstream Critic/Goldfish to disregard verdict-shaped language on its own.
 *
 * This is a pure text transform with no filesystem dependency, mirroring
 * `backlog-state.mjs`'s own frontmatter/body split convention (`---\n` ...
 * `\n---\n`) without depending on that module's stricter schema validation --
 * a legacy or not-yet-triaged item should still strip cleanly.
 */

export const BACKLOG_STRIP_FENCE =
  "<!-- SPEC-REFERENCE-STRIPPED-TRIAGE: this section of the original backlog " +
  "item has been removed for dispatch citation. It recorded a prior human " +
  "or Critic verdict about this item -- never spec/reference content -- and " +
  "would otherwise contaminate an independent downstream review or " +
  "implementation. See the item's own file for the full history. Convention: " +
  "backlog/items/2026-08-18-triage-verdict-text-can-contaminate-a-backlog-" +
  "item-as-a-later-spec-reference.md. -->";

// Headings that mark the start of verdict/decision/closure prose rather than
// spec-shaped content, matched case-insensitively at any heading level
// (`##`, `###`, ...). Each such heading's OWN section (its body, bounded by
// the next heading at the same level or shallower -- never end-of-file) is
// what gets removed; a later, differently-named heading (e.g. a PO decision
// section appended after "## Triage") is spec content and survives unless it
// independently matches this pattern too (2026-08-25 fix: the previous
// "earliest match strips to end-of-file" behavior dropped every later
// section regardless of shape -- backlog/items/2026-08-25-backlog-strip-for-
// dispatch-drops-every-section-after-triage.md).
// Headings whose NAME alone marks the entire section as verdict/decision/
// closure/implementor-narrative prose (an unconditional match, regardless of
// what the section actually says) -- these never legitimately carry spec
// content under this repository's convention. "resolution" was added
// 2026-09-06 (backlog/items/2026-09-06-backlog-item-strip-for-dispatch-does-
// not-remove-a-resolution-section.md): a "## Resolution" heading is, BY
// DEFINITION, the implementor's own account of which commit fixed the item
// and why the fix is believed correct -- there is no legitimate spec-shaped
// use of that heading name, so (like Triage/Closure/PO-decision) no content
// check is needed.
const VERDICT_HEADING = /^(triage|closure|po-decision implementation|resolution)\b/iu;

// "## Progress note (...)" is different: this repository's real convention
// (surveyed 2026-09-06 across multiple closed/in-progress items) uses this
// exact heading shape for BOTH legitimate delivery narrative ("what changed,
// which files, which tests") and prior verdict/self-assessment prose ("byte-
// identical, zero behavior change", "38/38 pass") -- unlike "## Resolution",
// an unconditional heading-name match would swallow genuinely spec-shaped
// delivery notes too. So a "progress note" heading is only a CANDIDATE: it
// is only treated as verdict-shaped, and its whole section stripped, when
// its own content also contains a verdict-shaped token (VERDICT_TOKEN_RE
// below).
const PROGRESS_NOTE_HEADING = /^progress note\b/iu;

// Vocabulary shared by the "## Progress note" content gate and the
// headingless bold-marker detector below -- deliberately small and drawn
// directly from the real verdict prose observed in this repository's own
// backlog items (2026-09-06 survey): PASS/FAIL (Critic verdicts), approved/
// rejected (PO decisions), resolved (implementor self-assessment, e.g.
// "Resolved gap (1) above"), and the word "Critic" itself (a prior review's
// own name for itself). Kept narrow on purpose: a wider net risks swallowing
// genuine spec prose that happens to use one of these as an ordinary word.
const VERDICT_TOKEN_RE = /\b(pass(?:ed|es)?|fail(?:ed|s)?|approved|rejected|resolved|critic)\b/iu;

// A verdict-shaped bold inline marker with NO heading at all (2026-09-06,
// same spec item, "Recurred again" section): e.g.
// `**T1 Critic round 1 (opus, max): FAIL.**` followed by remediation prose.
// Matches only when the bold span starts the line (after optional leading
// whitespace) and its OWN text contains a verdict token -- a list item like
// `- **Decision:** rejected` does not match (the token sits outside the bold
// span, and the line does not start with `**`), so this never re-triggers on
// the existing Triage-body bold labels.
const BOLD_MARKER_LINE_RE = /^\*\*([^*\n]+)\*\*/u;
const VERDICT_MARKER_LABEL = "verdict-marker (no heading)";

const HEADING_LINE_RE = /^(#{1,6})[ \t]+(.*)$/u;
const FENCE_LINE_RE = /^\s*(`{3,}|~{3,})/u;

/**
 * Locate every Markdown heading line in `body`, skipping lines inside a
 * fenced code block (``` or ~~~) so a `#`-prefixed comment/shell line inside
 * a Triage section's own fenced example can never be mistaken for a
 * section-boundary heading and truncate the strip early.
 */
function findHeadings(body) {
  const headings = [];
  let insideFence = false;
  let offset = 0;
  for (const line of body.split("\n")) {
    if (FENCE_LINE_RE.test(line)) {
      insideFence = !insideFence;
    } else if (!insideFence) {
      const match = HEADING_LINE_RE.exec(line);
      if (match) headings.push({ level: match[1].length, start: offset, lineText: line });
    }
    offset += line.length + 1;
  }
  return headings;
}

/**
 * Locate every headingless verdict-shaped bold marker line in `body`, using
 * the same fenced-code-block skip as `findHeadings` so a marker-shaped
 * example inside a fenced block is never mistaken for a real one.
 */
function findVerdictMarkers(body) {
  const markers = [];
  let insideFence = false;
  let offset = 0;
  for (const line of body.split("\n")) {
    if (FENCE_LINE_RE.test(line)) {
      insideFence = !insideFence;
    } else if (!insideFence) {
      const stripped = line.replace(/^[ \t]+/u, "");
      const match = BOLD_MARKER_LINE_RE.exec(stripped);
      if (match && VERDICT_TOKEN_RE.test(match[1])) markers.push({ start: offset });
    }
    offset += line.length + 1;
  }
  return markers;
}

/** End boundary (exclusive) of a heading's own section: the next heading at
 * the same level or shallower, or end-of-body when there is none. */
function headingSectionEnd(headings, index, level, bodyLength) {
  for (let j = index + 1; j < headings.length; j += 1) {
    if (headings[j].level <= level) return headings[j].start;
  }
  return bodyLength;
}

/** Merge overlapping/adjacent/nested [start, end) ranges into disjoint, ordered ranges. */
function mergeRanges(ranges) {
  const merged = [];
  for (const [start, end] of ranges) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/**
 * Strip every verdict-shaped heading's OWN section out of a backlog item's
 * BODY (post-frontmatter Markdown, e.g. `parseBacklogItem(...).item.body`
 * from `backlog-state.mjs`), leaving any other section -- however far below
 * the first verdict heading it appears -- intact. Pure function: never
 * touches the filesystem, never mutates its input. Returns the ORIGINAL
 * body unchanged (`wasStripped: false`) when no verdict-shaped heading is
 * present -- an item with no Triage yet carries no verdict prose to strip.
 *
 * Three sources of a "verdict-shaped" range, combined (2026-09-06 fix,
 * backlog/items/2026-09-06-backlog-item-strip-for-dispatch-does-not-remove-
 * a-resolution-section.md): (1) an unconditional VERDICT_HEADING match
 * (Triage/Closure/PO-decision/Resolution); (2) a PROGRESS_NOTE_HEADING match
 * whose own section also contains a VERDICT_TOKEN_RE hit; (3) a headingless
 * bold verdict marker line, stripped up to the next heading of any level (or
 * end of body). `removedHeading` reports whichever of these starts earliest
 * in the document, matching the existing "earliest verdict-shaped heading"
 * contract.
 *
 * @param {string} body
 * @returns {{ text: string, wasStripped: boolean, removedHeading: string|null }}
 */
export function stripBacklogVerdictProse(body) {
  if (typeof body !== "string") throw new TypeError("body must be a string");
  const headings = findHeadings(body);
  const entries = [];

  for (let i = 0; i < headings.length; i += 1) {
    const heading = headings[i];
    const headingMatch = HEADING_LINE_RE.exec(heading.lineText);
    const title = headingMatch ? headingMatch[2] : "";
    const verdictMatch = VERDICT_HEADING.exec(title);
    if (verdictMatch) {
      const end = headingSectionEnd(headings, i, heading.level, body.length);
      entries.push({ start: heading.start, end, label: verdictMatch[1].toLowerCase() });
      continue;
    }
    if (PROGRESS_NOTE_HEADING.test(title)) {
      const end = headingSectionEnd(headings, i, heading.level, body.length);
      if (VERDICT_TOKEN_RE.test(body.slice(heading.start, end))) {
        entries.push({ start: heading.start, end, label: "progress note" });
      }
    }
  }

  for (const marker of findVerdictMarkers(body)) {
    let end = body.length;
    for (const heading of headings) {
      if (heading.start > marker.start) {
        end = heading.start;
        break;
      }
    }
    entries.push({ start: marker.start, end, label: VERDICT_MARKER_LABEL });
  }

  if (entries.length === 0) return { text: body, wasStripped: false, removedHeading: null };
  entries.sort((a, b) => a.start - b.start);
  const removedHeading = entries[0].label;
  const merged = mergeRanges(entries.map(({ start, end }) => [start, end]));
  let text = "";
  let cursor = 0;
  for (const [start, end] of merged) {
    const keep = body.slice(cursor, start).replace(/\s+$/u, "");
    text += (keep.length ? `${keep}\n\n` : "") + `${BACKLOG_STRIP_FENCE}\n\n`;
    cursor = end;
  }
  text += body.slice(cursor);
  return { text, wasStripped: true, removedHeading };
}

function splitFrontmatter(rawText) {
  if (typeof rawText !== "string" || !rawText.startsWith("---\n")) {
    throw new Error("backlog item must begin with YAML frontmatter");
  }
  const end = rawText.indexOf("\n---\n", 4);
  if (end === -1) throw new Error("backlog item frontmatter closing delimiter is missing");
  return { frontmatter: rawText.slice(0, end + 5), body: rawText.slice(end + 5) };
}

/**
 * Dispatch-construction entry point: take a full backlog item file's raw text
 * (frontmatter + body) and return the frontmatter plus the Triage/verdict-
 * stripped body -- the only form admissible as a Goldfish/Critic dispatch's
 * spec/context reference to a backlog item under this rule.
 *
 * @param {string} rawText
 * @returns {{ text: string, wasStripped: boolean, removedHeading: string|null }}
 */
export function stripBacklogItemForDispatch(rawText) {
  const { frontmatter, body } = splitFrontmatter(rawText);
  const stripped = stripBacklogVerdictProse(body);
  return { text: `${frontmatter}${stripped.text}`, wasStripped: stripped.wasStripped, removedHeading: stripped.removedHeading };
}
