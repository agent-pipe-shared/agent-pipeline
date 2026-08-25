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
const VERDICT_HEADING = /^(triage|closure|po-decision implementation)\b/iu;
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

function verdictWord(lineText) {
  const headingMatch = HEADING_LINE_RE.exec(lineText);
  if (!headingMatch) return null;
  const verdictMatch = VERDICT_HEADING.exec(headingMatch[2]);
  return verdictMatch ? verdictMatch[1].toLowerCase() : null;
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
 * @param {string} body
 * @returns {{ text: string, wasStripped: boolean, removedHeading: string|null }}
 */
export function stripBacklogVerdictProse(body) {
  if (typeof body !== "string") throw new TypeError("body must be a string");
  const headings = findHeadings(body);
  const ranges = [];
  let removedHeading = null;
  for (let i = 0; i < headings.length; i += 1) {
    const heading = headings[i];
    const word = verdictWord(heading.lineText);
    if (!word) continue;
    if (removedHeading === null) removedHeading = word;
    let end = body.length;
    for (let j = i + 1; j < headings.length; j += 1) {
      if (headings[j].level <= heading.level) {
        end = headings[j].start;
        break;
      }
    }
    ranges.push([heading.start, end]);
  }
  if (ranges.length === 0) return { text: body, wasStripped: false, removedHeading: null };
  const merged = mergeRanges(ranges);
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
