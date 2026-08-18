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
  "<!-- SPEC-REFERENCE-STRIPPED-TRIAGE: everything from this point in the " +
  "original backlog item has been removed for dispatch citation. It records " +
  "a prior human/Critic decision, verdict, or closure evidence ABOUT this " +
  "item -- never spec/reference content -- and would otherwise contaminate " +
  "an independent downstream review or implementation. See the item's own " +
  "file for the full history. Convention: backlog/items/2026-08-18-triage-" +
  "verdict-text-can-contaminate-a-backlog-item-as-a-later-spec-reference.md. -->";

// Headings that mark the start of verdict/decision/closure prose rather than
// spec-shaped content, matched case-insensitively at any heading level
// (`##`, `###`, ...). The EARLIEST match in the body wins: an already-triaged
// item can carry an appended "PO-decision implementation" or "Closure"
// section below "## Triage", and all of it is verdict-adjacent, not spec
// content.
const VERDICT_HEADING = /^#{1,6}[ \t]+(triage|closure|po-decision implementation)\b/imu;

/**
 * Strip everything from the first verdict-shaped heading onward out of a
 * backlog item's BODY (post-frontmatter Markdown, e.g. `parseBacklogItem(...)
 * .item.body` from `backlog-state.mjs`). Pure function: never touches the
 * filesystem, never mutates its input. Returns the ORIGINAL body unchanged
 * (`wasStripped: false`) when no verdict-shaped heading is present -- an
 * item with no Triage yet carries no verdict prose to strip.
 *
 * @param {string} body
 * @returns {{ text: string, wasStripped: boolean, removedHeading: string|null }}
 */
export function stripBacklogVerdictProse(body) {
  if (typeof body !== "string") throw new TypeError("body must be a string");
  const match = VERDICT_HEADING.exec(body);
  if (!match) return { text: body, wasStripped: false, removedHeading: null };
  const removedHeading = match[1].toLowerCase();
  const before = body.slice(0, match.index).replace(/\s+$/u, "");
  const text = `${before}\n\n${BACKLOG_STRIP_FENCE}\n`;
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
