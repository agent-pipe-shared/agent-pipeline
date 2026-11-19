// SPDX-License-Identifier: SUL-1.0
/**
 * C30-6 (PO 2026-11-16): the readiness review report separates BLOCKING findings from QUESTIONS, and the split is read from the
 * bound report text, never from a flag the reviewed party passes. A greenfield run of twelve readiness rounds never reached
 * ready because every question the reviewer asked became an open finding that held the design.
 *
 * Report contract (`agents/readiness-reviewer.md`): a line `Blocking findings:` and a line `Questions:` (a markdown heading
 * or bold of the same words also counts), each followed by items that start with their id (`DESIGN-REVIEW-3`, `AC-155`).
 * Only a blocking finding is an open finding of the receipt; a question never is.
 *
 * A report without a `Blocking findings:` line is a legacy report: nothing is inferred from it and the caller keeps the old
 * rule (every id the Elephant passes is an open finding). Pure: no filesystem, no git, no clock.
 *
 * C31a (greenfield 2026-11-19): a delta report lists the earlier round's items under a label of its own ("Round 1 questions,
 * status against the current text:"). That line matched no heading, so the blocking section ran on through it and nine
 * `resolved` questions became open findings the receipt could not carry (`DRC-FINDINGS-SPLIT`), which stopped the next
 * review dispatch. A section now also ends at a label line (unindented, no item, at least three words, ending in a colon, after a
 * blank line, after at least one item, and naming a round, earlier/previous/prior items or a status), and an item whose id is
 * followed directly by a status token (`resolved`, `withdrawn` or `closed`, alone or with "in substance" / "for ...", then a
 * sentence end) is not open. Both rules are narrow on purpose (C31b, after the cloud review of C31a): an intro sentence under the
 * heading, a finding that begins "Resolved paths ..." or "Closed-loop ...", or one that says "must be fixed before build" stays open.
 */

const BLOCKING_HEADING = /^\s*(?:#{1,6}\s*)?(?:\*\*|__)?\s*blocking(?:\s+findings?)?\s*(?:\*\*|__)?\s*:?\s*(?:\*\*|__)?\s*(?:\(.*\))?\s*$/iu;
const QUESTIONS_HEADING = /^\s*(?:#{1,6}\s*)?(?:\*\*|__)?\s*(?:open\s+)?questions?(?:\s+to\s+the\s+elephant)?\s*(?:\*\*|__)?\s*:?\s*(?:\*\*|__)?\s*(?:\(.*\))?\s*$/iu;
const OTHER_HEADING = /^\s*#{1,6}\s+\S/u;
const ITEM_ID = /^\s*(?:[-*+]|\d+[.)])?\s*(?:\*\*|__)?\[?([A-Z][A-Z0-9]*(?:-[A-Z0-9]+){1,7})\]?(?:\*\*|__)?(?=[\s:.)\-—–]|$)/u;
// An unindented, non-bullet line of at least three words that ends in a colon. A one- or two-word "Repair:" inside an item does not end the section.
const LABEL_LINE = /^(?![-*+]\s|\d+[.)]\s)\S+(?:[ \t]+\S+){2,}[ \t]*(?:\*\*|__)?[ \t]*$/u;
const ENDS_WITH_COLON = /:\s*(?:\*\*|__)?\s*$/u;
// A status token, not a sentence that happens to start with the word: the word stands alone or is followed by "in substance" / "for ...",
// then a sentence end. "DR-4: Resolved paths escape the root" and "DR-5 - Closed-loop retry has no cap" stay open findings.
const RESOLVED_STATUS = /^\s*(?:\([^)]*\))?\s*[:\-—–]?\s*(?:\*\*|__)?(?:resolved|withdrawn|closed)(?:\*\*|__)?(?:[ \t]+(?:in[ \t]+substance|for[ \t]+[^.;\n]{1,60}?))?[ \t]*(?:[.;,)]|$)/iu;
// A label line names an earlier round's status list; it must say so (round, earlier, previous, prior, status) to end a section.
const LABEL_KEYWORD = /\b(?:round|earlier|previous|prior|status)\b/iu;

/** The report scanned once: each item with the 1-based line it was read from. */
function scan(text) {
  const lines = text.split(/\r?\n/u);
  if (!lines.some((line) => BLOCKING_HEADING.test(line))) return null;
  const blocking = [];
  const questions = [];
  let section = null;
  let itemsInSection = 0;
  lines.forEach((line, index) => {
    const previousBlank = index === 0 || lines[index - 1].trim() === "";
    if (BLOCKING_HEADING.test(line)) { section = "blocking"; itemsInSection = 0; return; }
    if (QUESTIONS_HEADING.test(line)) { section = "questions"; itemsInSection = 0; return; }
    if (OTHER_HEADING.test(line)) { section = null; return; }
    if (section === null) return;
    const match = ITEM_ID.exec(line);
    if (match === null) {
      // The section ends only at a label line that follows a blank line, comes after at least one item and names an earlier round's
      // status; an intro sentence under the heading ("These two block the build:") never ends it, so no finding after it is lost.
      if (itemsInSection > 0 && previousBlank && line.length <= 160 && ENDS_WITH_COLON.test(line) && LABEL_LINE.test(line) && LABEL_KEYWORD.test(line)) section = null;
      return;
    }
    itemsInSection += 1;
    if (section === "blocking" && RESOLVED_STATUS.test(line.slice(match[0].length))) return;
    const bucket = section === "blocking" ? blocking : questions;
    if (!bucket.some((entry) => entry.id === match[1])) bucket.push({ id: match[1], line: index + 1 });
  });
  return { blocking, questions };
}

/**
 * @param {string} text the report text
 * @returns {{ structured: false } | { structured: true, blocking: string[], questions: string[] }}
 */
export function designReviewReportSections(text) {
  if (typeof text !== "string") return { structured: false };
  const scanned = scan(text);
  if (scanned === null) return { structured: false };
  return { structured: true, blocking: scanned.blocking.map((entry) => entry.id).sort(), questions: scanned.questions.map((entry) => entry.id).sort() };
}

/**
 * Where each id of the blocking and the question section was read, for a refusal that has to be diagnosable.
 * @returns {{ blocking: Record<string, number>, questions: Record<string, number> }}
 */
export function designReviewReportLines(text) {
  const scanned = typeof text === "string" ? scan(text) : null;
  const toMap = (entries) => Object.fromEntries(entries.map((entry) => [entry.id, entry.line]));
  return scanned === null ? { blocking: {}, questions: {} } : { blocking: toMap(scanned.blocking), questions: toMap(scanned.questions) };
}

/**
 * Does the open-finding set the caller passes equal the report's blocking set? Legacy reports always agree.
 * @returns {{ ok: true } | { ok: false, missing: string[], extra: string[], questionsAsFindings: string[] }}
 */
export function checkOpenFindingsAgainstReport(text, openFindingIds) {
  const sections = designReviewReportSections(text);
  if (!sections.structured) return { ok: true };
  const passed = [...new Set(openFindingIds)].sort();
  const missing = sections.blocking.filter((id) => !passed.includes(id));
  const extra = passed.filter((id) => !sections.blocking.includes(id));
  const questionsAsFindings = extra.filter((id) => sections.questions.includes(id));
  return missing.length === 0 && extra.length === 0 ? { ok: true } : { ok: false, missing, extra, questionsAsFindings };
}
