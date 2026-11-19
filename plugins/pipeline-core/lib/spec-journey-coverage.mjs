// SPDX-License-Identifier: SUL-1.0
/**
 * Journey coverage of a Spec's acceptance criteria (C20 finding G20-27, Codex greenfield P0 "Produktfehler und unzureichende Examiner").
 *
 * WHY. Green unit tests missed stored-HTML execution, play without a timer, an overwrite after an import with the same revision and the loss
 * of the rescue candidate: each criterion was examined as a unit, none as the journey a user takes through a state transition. A user-facing
 * criterion therefore has to name the journeys that prove it (every entry path, a reload in the middle of a transition, a second action after
 * an error, a concurrent import, every dynamic text context) and the actual effect asserted, not only that some text changed.
 *
 * WHAT IT READS. Only the Spec bytes, through the criterion rows the host parser already locates (scanAcceptedCriterionRows). Pure; nothing is
 * written, run or fetched. One shared reading for the plan hand-off inspection (not ready) and the close readback (covered / not covered).
 *
 * THE CLOSED MARKERS (the same words the Spec template teaches):
 *   `Journeys: <journeys>` and `Asserts: <the actual effect>` inside the criterion text (a table cell, or an indented continuation line of a
 *   bullet criterion); `[user-facing]` forces the duty; `[not user-facing: <reason>]` exempts a criterion that no user sees (a bare tag with
 *   no reason exempts nothing). A criterion with neither tag is user-facing when its text uses the closed vocabulary below (English only:
 *   a Spec in another language tags its user-facing criteria with `[user-facing]`).
 */
import { scanAcceptedCriterionRows } from './critic-accepted-contract.mjs';

export const JOURNEY_CLASSES = Object.freeze([
  'every entry path to the transition',
  'a reload in the middle of a transition',
  'a second action after an error',
  'a concurrent import',
  'every dynamic text context (where stored text is rendered or executed)',
]);

export const JOURNEY_REPAIR = 'add to each named criterion in the Spec a `Journeys: <every entry path; reload in the middle of a transition; a second action after an error; a concurrent import; every dynamic text context that applies>` clause and an `Asserts: <the actual effect, such as the stored state, not only that text changed>` clause (a criterion no user sees is tagged `[not user-facing: <reason>]`), commit it';

const USER_FACING_TAG = /\[user-facing\]/iu;
const NOT_USER_FACING_TAG = /\[not user-facing:\s*(?!\{\{|<)\S[^\]]*\]/iu; // an unfilled `{{reason}}` / `<reason>` is no reason
// A closed vocabulary, deliberately small: a false positive costs one clause, a false negative is the P0 this exists for.
const USER_FACING_VOCABULARY = /\b(?:users?|players?|screens?|pages?|buttons?|clicks?|taps?|presses|pressed|browsers?|dialogs?|menus?|reload|displays?|displayed|renders?|rendered|UI)\b/iu;
const CLAUSE_MARKER = /\b(Journeys?|Asserts?):/giu;
// Both placeholder spellings: the generated skeleton's `<...>` and the Spec template's `{{...}}`.
// C32 (second Antigravity greenfield report): `/<[^>]*>/` read `< 1800000 ms ... >= 1800000 ms` as one unfilled placeholder and refused a criterion that was complete. A skeleton placeholder is `<` directly
// followed by a letter or underscore, not by a digit or a space, and not glued to the word before it (`a<b`), and it holds no further `<`.
const PLACEHOLDER = /(?<![\p{L}\p{N}])<[\p{L}_][^<>]*>|\{\{|REPLACE/u;
// An effect that only says something changed is no assertion on the actual effect.
const WEAK_EFFECT = /^(?:the\s+)?(?:text|label|title|output|value|content|page|view|screen|message|state)?\s*(?:is\s+|was\s+|has\s+|gets\s+)?(?:changed|updated|shown|displayed|visible|present|different|correct|ok|works?|set)$/iu;

/** The text of one clause (`Journeys` or `Asserts`): from its marker to the next marker or the end, without trailing punctuation. */
function clauseText(text, kind) {
  const markers = [...text.matchAll(CLAUSE_MARKER)];
  const index = markers.findIndex((match) => match[1].toLowerCase().startsWith(kind));
  if (index === -1) return '';
  const start = markers[index].index + markers[index][0].length;
  const end = index + 1 < markers.length ? markers[index + 1].index : text.length;
  return text.slice(start, end).replace(/\s+/gu, ' ').replace(/\[(?:not )?user-facing[^\]]*\]/giu, '').trim().replace(/[\s.;,]+$/u, '');
}

const isUserFacing = (text) => {
  if (NOT_USER_FACING_TAG.test(text)) return false;
  return USER_FACING_TAG.test(text) || USER_FACING_VOCABULARY.test(text.replace(/\[not user-facing\]/giu, ''));
};

/**
 * @param {string} source the Spec text
 * @returns {{criteria: {id: string, status: 'covered'|'not-covered'|'not-user-facing', missing: ('journeys'|'effect')[]}[], covered: string[], notCovered: string[]}}
 */
export function inspectSpecJourneys(source) {
  const criteria = [];
  const seen = new Set();
  for (const row of scanAcceptedCriterionRows(String(source))) {
    if (row.normative !== true || row.valid === false || typeof row.text !== 'string' || seen.has(row.id)) continue;
    seen.add(row.id);
    if (!isUserFacing(row.text)) { criteria.push({ id: row.id, status: 'not-user-facing', missing: [] }); continue; }
    const journeys = clauseText(row.text, 'journey');
    const effect = clauseText(row.text, 'assert');
    const missing = [];
    if (journeys === '' || PLACEHOLDER.test(journeys)) missing.push('journeys');
    if (effect === '' || PLACEHOLDER.test(effect) || WEAK_EFFECT.test(effect)) missing.push('effect');
    criteria.push({ id: row.id, status: missing.length === 0 ? 'covered' : 'not-covered', missing });
  }
  return {
    criteria,
    covered: criteria.filter((entry) => entry.status === 'covered').map((entry) => entry.id),
    notCovered: criteria.filter((entry) => entry.status === 'not-covered').map((entry) => entry.id),
  };
}
