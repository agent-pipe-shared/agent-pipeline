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
 */

const BLOCKING_HEADING = /^\s*(?:#{1,6}\s*)?(?:\*\*|__)?\s*blocking(?:\s+findings?)?\s*(?:\*\*|__)?\s*:?\s*(?:\*\*|__)?\s*(?:\(.*\))?\s*$/iu;
const QUESTIONS_HEADING = /^\s*(?:#{1,6}\s*)?(?:\*\*|__)?\s*(?:open\s+)?questions?(?:\s+to\s+the\s+elephant)?\s*(?:\*\*|__)?\s*:?\s*(?:\*\*|__)?\s*(?:\(.*\))?\s*$/iu;
const OTHER_HEADING = /^\s*#{1,6}\s+\S/u;
const ITEM_ID = /^\s*(?:[-*+]|\d+[.)])?\s*(?:\*\*|__)?\[?([A-Z][A-Z0-9]*(?:-[A-Z0-9]+){1,7})\]?(?:\*\*|__)?(?=[\s:.)\-—–]|$)/u;

/**
 * @param {string} text the report text
 * @returns {{ structured: false } | { structured: true, blocking: string[], questions: string[] }}
 */
export function designReviewReportSections(text) {
  if (typeof text !== "string") return { structured: false };
  const lines = text.split(/\r?\n/u);
  if (!lines.some((line) => BLOCKING_HEADING.test(line))) return { structured: false };
  const blocking = [];
  const questions = [];
  let section = null;
  for (const line of lines) {
    if (BLOCKING_HEADING.test(line)) { section = "blocking"; continue; }
    if (QUESTIONS_HEADING.test(line)) { section = "questions"; continue; }
    if (OTHER_HEADING.test(line)) { section = null; continue; }
    if (section === null) continue;
    const match = ITEM_ID.exec(line);
    if (match === null) continue;
    const bucket = section === "blocking" ? blocking : questions;
    if (!bucket.includes(match[1])) bucket.push(match[1]);
  }
  return { structured: true, blocking: blocking.sort(), questions: questions.sort() };
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
