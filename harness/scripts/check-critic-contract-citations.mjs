#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * check-critic-contract-citations.mjs — every cross-reference in the Critic's
 * binding contract resolves to a target that actually contains the cited
 * content.
 *
 * WHY THIS EXISTS. `harness/review-protocol.md`, `roles/critic.md` and
 * `plugins/pipeline-core/skills/critic-review/SKILL.md` are the Critic's
 * binding protocol; a reader (human or agent) follows their citations to find
 * the normative material. A citation that resolves to the wrong section is
 * worse than a missing one: it looks authoritative, so the reader stops
 * looking. On 2026-08-09 seven such citations were measured at once — three
 * files claiming a canonical wording is "word-identical"/"verbatim"/"mirrored"
 * in a `docs/operating-model.md` section that does not contain a single word
 * of it, a "rung 1" and a "Flow diagram" cited into three paragraphs of prose
 * that carry neither, a "this section" pointer for definitions that live one
 * document away, two §-numbers off by one section, and a heading ordinal
 * ("transfer format 3") whose enumeration exists nowhere in the repository.
 * None of them is visible to review: every one of them reads like a correct
 * citation. Only mechanical resolution finds them, which is what this does.
 *
 * WHAT IT CHECKS. Each record below reads the CITING LINE out of the file and
 * follows whatever that line currently says — it does not compare against a
 * hardcoded expected sentence. Rewriting a citation to point somewhere else
 * therefore moves the check with it; only a citation whose target really
 * carries the cited content passes.
 *
 *   PHX-CITE-1  the canonical trigger wording is present in every document the
 *               identity claim names as carrying it (and absent from every
 *               document the same claim names as NOT carrying it). The
 *               reference copy is ADR-0014's quote, not any edited file's.
 *   PHX-CITE-2  the "rung 1" anchor and the escalation-ladder diagram/prose
 *               pointer resolve to text that contains them.
 *   PHX-CITE-3  the review system is attributed to the same operating-model
 *               section that CLAUDE.md's *Where things live* maps it to
 *               (CLAUDE.md is the tie-breaker), and EVERY "escalation ladder"
 *               attribution in the three contract files resolves to a target
 *               that has a rung.
 *   PHX-CITE-4  the pointer for the normative risk-class definitions resolves
 *               to text that defines risk.
 *   PHX-CITE-5  the "search harshly, report honestly" back-reference resolves
 *               to the section that states it.
 *   PHX-CITE-6  the Rensin attribution resolves to a target that names Rensin.
 *   PHX-CITE-7  no "transfer format <n>" ordinal is used while no enumeration
 *               defining that numbering exists anywhere in the canon.
 *   PHX-CITE-8  every CROSS-FILE section coordinate in the three contract files
 *               resolves: a §-number to a section that exists in the cited
 *               file, a section title to a heading that carries it. Two of the
 *               seven founding defects were §-numbers off by one; before this
 *               class the number was parsed only out of a "this file" clause
 *               and discarded everywhere else. Coverage and blind spots are
 *               enumerated at the class itself (below) and reported in the
 *               success line — the class once announced "every cross-file
 *               coordinate" while parsing one separator shape, so two live
 *               forms were unchecked behind a completeness claim.
 *
 * NO CLASS MAY BE SATISFIED BY ITS OWN CITING LINE. Several citations sit
 * inside the very section they cite (PHX-CITE-5 is the canonical case), so a
 * naive substring search finds the cited phrase in the pointer rather than in
 * the rule. Every content test below therefore runs against the target text
 * with the citing line removed (`withoutCitingLine`): the section must state
 * the cited content itself, or the class goes red.
 *
 * Exit 0 = every citation resolves. Exit 2 = at least one does not.
 * `--root <dir>` resolves all paths against another checkout, which is how the
 * evidence runner replays the pre-repair (RED) state from git.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(HERE, "..", "..");

const PROTOCOL = "harness/review-protocol.md";
const ROLE = "roles/critic.md";
const SKILL = "plugins/pipeline-core/skills/critic-review/SKILL.md";
const OM = "docs/operating-model.md";
const ADR3 = "docs/adr/0003-role-implementation-subagents.md";
const ADR14 = "docs/adr/0014-critic-contract.md";
const CLAUDE = "CLAUDE.md";
const README = "README.md";
const FLOW = "PIPELINE_FLOW.md";
const BOOTSTRAP = "harness/session-bootstrap.md";

/** Every file this check reads; the evidence runner materializes exactly these. */
export const CITATION_SOURCE_FILES = [PROTOCOL, ROLE, SKILL, OM, ADR3, ADR14, CLAUDE, README, FLOW, BOOTSTRAP];

/**
 * Path tokens a citation may use, mapped to the file they resolve to. The
 * directory prefix is optional where a contract file cites a sibling by bare
 * filename ("review-protocol.md §2.1", `roles/critic.md`) — dropping those
 * would silently exempt one of the three files from PHX-CITE-8.
 */
const PATH_ALIASES = [
  [/^docs\/operating-model\.md$/, OM],
  [/^(?:harness\/)?review-protocol\.md$/, PROTOCOL],
  [/^(?:harness\/)?session-bootstrap\.md$/, BOOTSTRAP],
  [/^roles\/critic\.md$/, ROLE],
  [/critic-review\/SKILL\.md$/, SKILL],
  [/^CLAUDE\.md$/, CLAUDE],
  [/^README\.md$/, README],
  [/^PIPELINE_FLOW\.md$/, FLOW],
];

const ADR_ALIASES = [
  [/ADR-0003/, ADR3],
  [/ADR-0014/, ADR14],
];

// ---------------------------------------------------------------- primitives

/**
 * Bilingual docs (ADR-0011) carry a full German reference translation below a
 * marker line. Only the English above it is authoritative, so a citation must
 * resolve there — a hit in the German copy would be a false green.
 *
 * The marker is matched only at the start of a line: CLAUDE.md quotes the
 * marker string inline while documenting the convention, and cutting there
 * would hide its own *Where things live* mapping from this check.
 */
function englishPart(text) {
  const m = /^<!-- DE-REFERENCE-BELOW/m.exec(text);
  return m ? text.slice(0, m.index) : text;
}

function readDoc(root, rel) {
  return englishPart(readFileSync(join(root, rel), "utf8"));
}

function normalize(text) {
  return text.replace(/\s+/g, " ").trim();
}

/** Markdown section by heading text: heading line through the next heading of same/higher level. */
function section(text, titleRegex) {
  const lines = text.split("\n");
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^(#{1,6})\s+(.*\S)\s*$/.exec(lines[i]);
    if (!m) continue;
    if (start === -1) {
      if (titleRegex.test(m[2])) {
        start = i;
        level = m[1].length;
      }
    } else if (m[1].length <= level) {
      return lines.slice(start, i).join("\n");
    }
  }
  return start === -1 ? null : lines.slice(start).join("\n");
}

/** Section of a numbered document (e.g. "§2.4" -> heading "2.4 ..." or "2.4. ..."). */
function numberedSection(text, num) {
  const escaped = num.replace(/\./g, "\\.");
  return section(text, new RegExp(`^${escaped}[.\\s]`));
}

/** Section whose heading ENDS in the cited title ("## 6. Evidence, review and recovery"). */
function titledSection(text, title) {
  return section(text, new RegExp(`(^|\\s)${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`));
}

function line(text, locator) {
  const m = locator.exec(text);
  return m ? m[0] : null;
}

/**
 * All `path.md` references in a citation, each with the section coordinate it
 * names: a §-number (`…md` §2.1), a title (`…md` — *Trigger decision table*),
 * or both (`…md` §2.1, *Trigger decision table*). The §-number used to be
 * dropped here, which followed a cross-file citation to the file and threw its
 * coordinate away — the exact defect shape (§ off by one) this check was
 * written for.
 */
function pathRefs(citation) {
  const refs = [];
  const re = /`([^`]+\.md)`(?:\s*§(\d+(?:\.\d+)*))?(?:\s*(?:—|,)\s*\*([^*]+)\*)?/g;
  for (const m of citation.matchAll(re)) {
    const alias = PATH_ALIASES.find(([pattern]) => pattern.test(m[1]));
    if (alias) refs.push({ raw: m[1], file: alias[1], sectionNum: m[2] ?? null, sectionName: m[3] ?? null });
  }
  return refs;
}

function adrRefs(citation) {
  return ADR_ALIASES.filter(([pattern]) => pattern.test(citation)).map(([, file]) => ({ raw: file, file, sectionNum: null, sectionName: null }));
}

/** §-numbers a citation applies to the file it sits in ("§4 below", "this file's §2.1"). */
function selfSectionNums(citation) {
  const nums = [];
  for (const re of [/this file'?s?\s*§(\d+(?:\.\d+)*)/g, /§(\d+(?:\.\d+)*)\s*(?:below|above|of this file)/g]) {
    for (const m of citation.matchAll(re)) nums.push(m[1]);
  }
  return [...new Set(nums)];
}

/** Resolve a reference to its text, or null when the named section does not exist. */
function resolveRef(root, ref) {
  const doc = readDoc(root, ref.file);
  if (ref.sectionNum) {
    const text = numberedSection(doc, ref.sectionNum);
    if (text === null) return null;
    // A coordinate that names both number and title must agree with the heading.
    if (ref.sectionName && !text.split("\n")[0].includes(ref.sectionName)) return null;
    return text;
  }
  if (!ref.sectionName) return doc;
  return titledSection(doc, ref.sectionName);
}

function describe(ref) {
  const coordinate = [ref.sectionNum ? `§${ref.sectionNum}` : null, ref.sectionName ? `*${ref.sectionName}*` : null]
    .filter(Boolean)
    .join(", ");
  return coordinate ? `${ref.file} — ${coordinate}` : ref.file;
}

/**
 * The target text a citation is judged against, with the citing line itself
 * removed. A pointer that sits inside its own target ("… (§2.5 above)" inside
 * §2.5) otherwise proves itself: the searched phrase is present because the
 * pointer names it, even after the section stops stating the rule.
 */
function withoutCitingLine(text, citation) {
  if (text === null) return null;
  const cited = citation.trim();
  return text.split("\n").filter((l) => l.trim() !== cited).join("\n");
}

/** Every target a citing line names: path refs, ADR refs, and same-file §-refs. */
function citedTargets(root, citingFile, citation) {
  const targets = [...pathRefs(citation), ...adrRefs(citation)].map((ref) => ({
    text: resolveRef(root, ref),
    where: describe(ref),
  }));
  for (const num of selfSectionNums(citation)) {
    targets.push({ text: numberedSection(readDoc(root, citingFile), num), where: `${citingFile} §${num}` });
  }
  return targets;
}

// ------------------------------------------------------------------- checks

/**
 * PHX-CITE-1: three files claim a canonical trigger wording is identical in a
 * list of documents. Each clause of the claim is resolved: a clause that
 * denies the wording ("not in X", "does not carry") must resolve to absence,
 * every other clause to presence.
 */
const IDENTITY_CLAIMS = [
  { file: PROTOCOL, locator: /^Canonical trigger wording \(.*$/m },
  { file: ROLE, locator: /^.*\*\*Trigger \(canonical wording.*$/m },
  { file: SKILL, locator: /^\(Canonical English wording.*$/m },
];

function checkCanonicalWording(root, findings) {
  const adr = readDoc(root, ADR14);
  const quoteLine = /^>\s*"Every architecture\/guardrail\/security diff[^\n]*$/m.exec(adr);
  if (!quoteLine) {
    findings.push(`PHX-CITE-1 NO-REFERENCE-COPY: ${ADR14} no longer carries the canonical trigger wording; nothing to compare against.`);
    return;
  }
  const canonical = normalize(quoteLine[0].replace(/^>\s*/, ""));

  for (const claim of IDENTITY_CLAIMS) {
    const doc = readDoc(root, claim.file);
    const citation = line(doc, claim.locator);
    if (!citation) {
      findings.push(`PHX-CITE-1 CITATION-NOT-FOUND: ${claim.file} no longer contains the identity claim this check resolves.`);
      continue;
    }
    for (const clause of citation.split(/;\s+/)) {
      const denies = /\bnot\b|does not carry/.test(clause);
      const refs = [...pathRefs(clause), ...adrRefs(clause)];
      if (/this file/.test(clause)) {
        const selfNum = /this file'?s? §(\d(?:\.\d)?)/.exec(clause);
        refs.push({ raw: "this file", file: claim.file, sectionNum: null, sectionName: null, selfNum: selfNum ? selfNum[1] : null });
      }
      for (const ref of refs) {
        const text = ref.selfNum ? numberedSection(readDoc(root, ref.file), ref.selfNum) : resolveRef(root, ref);
        const where = ref.selfNum ? `${ref.file} §${ref.selfNum}` : describe(ref);
        if (text === null) {
          findings.push(`PHX-CITE-1 TARGET-MISSING: ${claim.file} cites ${where}, which does not exist.`);
          continue;
        }
        const carries = normalize(withoutCitingLine(text, citation)).includes(canonical);
        if (denies && carries) {
          findings.push(`PHX-CITE-1 FALSE-DENIAL: ${claim.file} says ${where} does not carry the canonical trigger wording, but it does.`);
        } else if (!denies && !carries) {
          findings.push(`PHX-CITE-1 WORDING-ABSENT: ${claim.file} claims the canonical trigger wording is identical in ${where}; that target does not contain it.`);
        }
      }
    }
  }
}

/** PHX-CITE-2a: the self-fix rule's "rung 1" anchor. */
function checkRungAnchor(root, findings) {
  const doc = readDoc(root, PROTOCOL);
  const citation = line(doc, /^\*\*Why:\*\* A fresh context with a better briefing.*$/m);
  if (!citation) {
    findings.push(`PHX-CITE-2 CITATION-NOT-FOUND: ${PROTOCOL} no longer contains the self-fix rationale this check resolves.`);
    return;
  }
  for (const ref of pathRefs(citation)) {
    if (resolveRef(root, ref) === null) {
      findings.push(`PHX-CITE-2 TARGET-MISSING: ${PROTOCOL} cites ${describe(ref)}, which does not exist.`);
    }
  }
  if (!/rung\s*1/i.test(citation)) return;
  const selfNum = /§(\d(?:\.\d)?)\s*(?:of this file|below|above)?/.exec(citation);
  const target = selfNum
    ? { text: numberedSection(doc, selfNum[1]), where: `${PROTOCOL} §${selfNum[1]}` }
    : (() => {
        const ref = pathRefs(citation)[0];
        return ref ? { text: resolveRef(root, ref), where: describe(ref) } : { text: null, where: "(no target named)" };
      })();
  if (target.text === null || !/rung/i.test(withoutCitingLine(target.text, citation))) {
    findings.push(`PHX-CITE-2 ANCHOR-ABSENT: ${PROTOCOL} anchors "rung 1" in ${target.where}, which contains no rung.`);
  }
}

/** PHX-CITE-2b: the escalation ladder's pointer at the end of §4. */
function checkLadderPointer(root, findings) {
  const doc = readDoc(root, PROTOCOL);
  const citation = line(doc, /^(?:Flow diagram|Normative counterpart|Diagram):.*$/m);
  if (!citation) {
    findings.push(`PHX-CITE-2 CITATION-NOT-FOUND: ${PROTOCOL} no longer contains the escalation-ladder pointer this check resolves.`);
    return;
  }
  const claimsDiagram = /^Flow diagram|^Diagram/.test(citation);
  const deniesDiagram = /no flow diagram/i.test(citation);
  for (const ref of pathRefs(citation)) {
    const text = resolveRef(root, ref);
    if (text === null) {
      findings.push(`PHX-CITE-2 TARGET-MISSING: ${PROTOCOL} cites ${describe(ref)}, which does not exist.`);
      continue;
    }
    const hasDiagram = /```/.test(text);
    if (claimsDiagram && !hasDiagram) {
      findings.push(`PHX-CITE-2 DIAGRAM-ABSENT: ${PROTOCOL} cites a flow diagram in ${describe(ref)}; that target contains no diagram.`);
    }
    if (deniesDiagram && ref.file === OM && hasDiagram) {
      findings.push(`PHX-CITE-2 FALSE-DENIAL: ${PROTOCOL} states no flow diagram exists, but ${describe(ref)} contains one.`);
    }
  }
}

/** PHX-CITE-3: the status line's operationalization map vs. CLAUDE.md's mapping. */
function checkOperationalizationMap(root, findings) {
  const claudeMap = /review system \(\*([^*]+)\*/.exec(readDoc(root, CLAUDE));
  const doc = readDoc(root, PROTOCOL);
  const citation = line(doc, /^\*\*Status:\*\*.*$/m);
  if (!citation) {
    findings.push(`PHX-CITE-3 CITATION-NOT-FOUND: ${PROTOCOL} no longer contains the status line this check resolves.`);
    return;
  }
  if (!claudeMap) {
    findings.push(`PHX-CITE-3 TIEBREAKER-MISSING: ${CLAUDE} no longer maps the review system to an operating-model section.`);
  } else {
    const attributed = /\*([^*]+)\* \(review system/.exec(citation);
    if (!attributed) {
      findings.push(`PHX-CITE-3 ATTRIBUTION-MISSING: ${PROTOCOL} names no operating-model section for the review system; ${CLAUDE} maps it to *${claudeMap[1]}*.`);
    } else if (attributed[1] !== claudeMap[1]) {
      findings.push(`PHX-CITE-3 MAPPING-MISMATCH: ${PROTOCOL} assigns the review system to *${attributed[1]}*; ${CLAUDE} maps it to *${claudeMap[1]}*.`);
    }
  }
}

/**
 * PHX-CITE-3b: EVERY "escalation ladder" attribution in the three contract
 * files — not just the protocol's status line — resolves to a target that
 * carries a rung. `roles/critic.md` attributed the ladder to an
 * operating-model section that has neither the word "ladder" nor a rung in its
 * normative English part; the check read that file for one other class and
 * passed over this one, so the class only covered the file it happened to
 * parse.
 */
function checkLadderAttributions(root, findings) {
  for (const rel of [PROTOCOL, ROLE, SKILL]) {
    const doc = readDoc(root, rel);
    for (const raw of doc.split("\n")) {
      if (/^#{1,6}\s/.test(raw)) continue; // a heading names the ladder, it does not cite it
      for (const clause of raw.split(/;\s+/)) {
        if (!/escalation ladder/i.test(clause)) continue;
        const targets = citedTargets(root, rel, clause);
        if (targets.length === 0) {
          findings.push(`PHX-CITE-3 LADDER-UNANCHORED: ${rel} refers to the escalation ladder without naming where it is defined: "${clause.trim()}"`);
          continue;
        }
        const anchored = targets.some((t) => t.text !== null && /\brungs?\b/i.test(withoutCitingLine(t.text, raw)));
        if (!anchored) {
          findings.push(`PHX-CITE-3 LADDER-ABSENT: ${rel} attributes the escalation ladder to ${targets.map((t) => t.where).join(", ")}; no cited target contains a rung.`);
        }
      }
    }
  }
}

/** PHX-CITE-4: the pointer for the normative risk-class definitions. */
function checkRiskClassDefinitions(root, findings) {
  const doc = readDoc(root, PROTOCOL);
  const citation = line(doc, /^.*normative definitions:.*$/m);
  if (!citation) {
    findings.push(`PHX-CITE-4 CITATION-NOT-FOUND: ${PROTOCOL} no longer contains the risk-class definition pointer.`);
    return;
  }
  const pointer = /normative definitions:\s*([^;]+);/.exec(citation);
  const scope = pointer ? pointer[1] : citation;
  const refs = pathRefs(scope);
  const selfNum = /§(\d(?:\.\d)?)/.exec(scope);
  const targets = refs.length > 0
    ? refs.map((ref) => ({ text: resolveRef(root, ref), where: describe(ref) }))
    : selfNum
      ? [{ text: numberedSection(doc, selfNum[1]), where: `${PROTOCOL} §${selfNum[1]}` }]
      : [{ text: null, where: "(no target named)" }];
  const defines = targets.some((t) => t.text !== null && /\*\*Risk\*\*\s*(answers|is|means)/.test(withoutCitingLine(t.text, citation)));
  if (!defines) {
    findings.push(`PHX-CITE-4 DEFINITION-ABSENT: ${PROTOCOL} points at ${targets.map((t) => t.where).join(", ")} for the normative risk-class definitions; no cited target defines risk.`);
  }
}

/** PHX-CITE-5: the two-phase pattern's back-reference. */
function checkTwoPhaseBackReference(root, findings) {
  const doc = readDoc(root, PROTOCOL);
  const citation = line(doc, /^\*\*Prompt framing:\*\*.*$/m);
  if (!citation) {
    findings.push(`PHX-CITE-5 CITATION-NOT-FOUND: ${PROTOCOL} no longer contains the prompt-framing rule.`);
    return;
  }
  const targets = citedTargets(root, PROTOCOL, citation);
  if (targets.length === 0) {
    findings.push(`PHX-CITE-5 REFERENCE-MISSING: ${PROTOCOL} states the two-phase pattern without naming where it is defined.`);
    return;
  }
  // The pointer sits INSIDE the section it cites, so the phrase is present in
  // the target as long as the pointer is — the citing line is removed before
  // the search, otherwise this class could not fail at all.
  const states = targets.some((t) => t.text !== null && /search harshly, report honestly/i.test(withoutCitingLine(t.text, citation)));
  if (!states) {
    findings.push(`PHX-CITE-5 PATTERN-ABSENT: ${PROTOCOL} cites ${targets.map((t) => t.where).join(", ")} for "search harshly, report honestly"; no cited target states it independently of the citing line.`);
  }
}

/** PHX-CITE-6: the Rensin attribution of the time-shifted second look. */
function checkRensinAttribution(root, findings) {
  const doc = readDoc(root, PROTOCOL);
  const citation = line(doc, /^.*time distance replaces the second human.*$/m);
  if (!citation) {
    findings.push(`PHX-CITE-6 CITATION-NOT-FOUND: ${PROTOCOL} no longer contains the time-shifted second look rationale.`);
    return;
  }
  const refs = pathRefs(citation);
  const selfNum = /§(\d(?:\.\d)?)/.exec(citation);
  const targets = [
    ...refs.map((ref) => ({ text: resolveRef(root, ref), where: describe(ref) })),
    ...(selfNum ? [{ text: numberedSection(doc, selfNum[1]), where: `${PROTOCOL} §${selfNum[1]}` }] : []),
  ];
  if (targets.length === 0) {
    findings.push(`PHX-CITE-6 REFERENCE-MISSING: ${PROTOCOL} attributes the rule to Rensin without naming where that attribution is anchored.`);
    return;
  }
  const anchored = targets.some((t) => t.text !== null && /Rensin/.test(withoutCitingLine(t.text, citation)));
  if (!anchored) {
    findings.push(`PHX-CITE-6 ATTRIBUTION-ABSENT: ${PROTOCOL} anchors the Rensin attribution in ${targets.map((t) => t.where).join(", ")}; no cited target names Rensin.`);
  }
}

/** PHX-CITE-7: ordinals of an enumeration that must exist somewhere. */
function checkTransferFormatOrdinal(root, findings) {
  const definition = CITATION_SOURCE_FILES.some((rel) => /transfer format 1\b|transfer formats\b/i.test(readDoc(root, rel)));
  for (const rel of [PROTOCOL, ROLE, SKILL]) {
    const doc = readDoc(root, rel);
    const used = /^.*transfer format\s+\d.*$/m.exec(doc);
    if (used && !definition) {
      findings.push(`PHX-CITE-7 ORDINAL-UNANCHORED: ${rel} uses "${used[0].trim()}"; no document in the canon defines that numbering.`);
    }
  }
}

/**
 * PHX-CITE-8: every cross-file section coordinate resolves to a section that
 * exists — and, where the coordinate names the title, to a heading that carries
 * it. The number is the part a reader navigates by, and it is the part that
 * silently rots when the target file is renumbered.
 *
 * WHAT COUNTS AS A COORDINATE. A `path.md` reference followed by the section it
 * names. EVERY separator shape that occurs in the three contract files is
 * parsed — the shapes are listed here because the previous matcher accepted
 * only the first three while the check announced it resolved "every cross-file
 * coordinate", leaving two live forms unchecked behind that claim:
 *
 *   `path.md` §2.1                       number only
 *   `path.md` §2.1 (prose aside)         number only; a parenthetical without
 *                                        italics is prose, not a title claim
 *   `path.md` §2.1, *Title*              number + title
 *   `path.md` §2.1 (*Title*)             number + title, parenthesised
 *   `path.md` — §6.3 (prose aside)       dash between path and number
 *   `path.md` — *Title*                  title only, no number
 *   `path.md` (*Title A* … *Title B*)    several titles for one path
 *
 * WHAT THIS CLASS DOES NOT CHECK (QG-05 — a gate states its own blind spots;
 * the success line repeats this, and reports the resolved count so that
 * shrinking the corpus shows up as a smaller number rather than as silence):
 *
 *   - RULE-ID coordinates: `roles/elephant.md` — *EL-01*,
 *     `policies/model-policy.md` MP-07, `policies/tooling-policy.md` G2/W2.
 *     These name a rule INSIDE a document, not a heading, so resolving them as
 *     headings would report a false red on a correct citation. They are
 *     recognised by shape, skipped, and counted in the success line.
 *   - Prose descriptions after a path (`…/critic-review.md` — negative-thesis
 *     critic prompt template) — not a coordinate, nothing to resolve.
 *   - Bare paths with no coordinate: this class does not assert the file exists.
 *   - Citations in any file other than the three contract files.
 *   - German reference translations below the DE-REFERENCE-BELOW marker (ADR-0011).
 */
export const COORDINATE_RE = new RegExp(
  "`?((?:[A-Za-z0-9_.-]+/)*[A-Za-z0-9_.-]+\\.md)`?" + //     1: the cited path
    "(?:[ \\t]*[—–-])?" + //                                 optional dash separator
    "(?:[ \\t]*§(\\d+(?:\\.\\d+)*))?" + //                   2: optional §-number
    "(?:[ \\t]*(?:,[ \\t]*|[—–-][ \\t]*)?(\\*[^*\\n]+\\*|\\([^)\\n]*\\)))?", // 3: optional title carrier
  "g",
);

/**
 * A rule/requirement identifier (EL-01, MP-07, GIT-05, W2, T1) rather than a
 * section title. Anchored whole-string, and a heading title that merely starts
 * with a digit ("*5. Close deliberately; recover with a bound*") does not match.
 */
const RULE_ID_RE = /^[A-Z]{1,5}-?\d[\w./-]*$/;

function checkSectionCoordinates(root, findings, coverage) {
  for (const rel of [PROTOCOL, ROLE, SKILL]) {
    const doc = readDoc(root, rel);
    for (const m of doc.matchAll(COORDINATE_RE)) {
      const num = m[2] ?? null;
      const named = [...(m[3] ?? "").matchAll(/\*([^*]+)\*/g)].map((t) => t[1].trim());
      const titles = named.filter((t) => !RULE_ID_RE.test(t));
      coverage.ruleIdCoordinatesSkipped += named.length - titles.length;
      if (!num && titles.length === 0) continue; // a bare path names no section
      const alias = PATH_ALIASES.find(([pattern]) => pattern.test(m[1]));
      const file = alias ? alias[1] : m[1];
      const coordinate = [num ? `§${num}` : null, ...titles.map((t) => `*${t}*`)].filter(Boolean).join(", ");
      let targetDoc;
      try {
        targetDoc = readDoc(root, file);
      } catch {
        // A replay root materializes CITATION_SOURCE_FILES only; an unreadable
        // non-canon target is a defect in the real checkout, absence elsewhere.
        if (root === DEFAULT_ROOT) {
          findings.push(`PHX-CITE-8 FILE-MISSING: ${rel} cites ${file} ${coordinate}; that file cannot be read.`);
        }
        continue;
      }
      if (num) {
        coverage.coordinatesResolved += 1;
        const text = numberedSection(targetDoc, num);
        if (text === null) {
          findings.push(`PHX-CITE-8 SECTION-MISSING: ${rel} cites ${file} §${num}, which does not exist in that file.`);
          continue;
        }
        const heading = text.split("\n")[0].trim();
        for (const title of titles) {
          coverage.coordinatesResolved += 1;
          if (!heading.includes(title)) {
            findings.push(`PHX-CITE-8 TITLE-MISMATCH: ${rel} cites ${file} §${num} as *${title}*; that section is "${heading}".`);
          }
        }
        continue;
      }
      // Title without a number: the title itself is the coordinate.
      for (const title of titles) {
        coverage.coordinatesResolved += 1;
        if (titledSection(targetDoc, title) === null) {
          findings.push(`PHX-CITE-8 HEADING-MISSING: ${rel} cites ${file} — *${title}*; that file has no heading with that title.`);
        }
      }
    }
  }
}

export function checkCriticContractCitations({ root = DEFAULT_ROOT } = {}) {
  const findings = [];
  const coverage = { coordinatesResolved: 0, ruleIdCoordinatesSkipped: 0 };
  checkCanonicalWording(root, findings);
  checkRungAnchor(root, findings);
  checkLadderPointer(root, findings);
  checkOperationalizationMap(root, findings);
  checkLadderAttributions(root, findings);
  checkRiskClassDefinitions(root, findings);
  checkTwoPhaseBackReference(root, findings);
  checkRensinAttribution(root, findings);
  checkTransferFormatOrdinal(root, findings);
  checkSectionCoordinates(root, findings, coverage);
  return { ok: findings.length === 0, findings, root, coverage };
}

/**
 * The success line. It states what was resolved AND what was not: an
 * unqualified "every cited target contains its cited content" is exactly the
 * overclaim this check was repaired for (QG-05). The counts are measured, so
 * silently dropping a citation shrinks a number instead of changing nothing.
 */
export function successLine({ coverage }) {
  return [
    "Critic contract citations: 8 classes green — every citation this check resolves points at a target that carries its cited content.",
    `PHX-CITE-8 resolved ${coverage.coordinatesResolved} cross-file section coordinates (§-numbers and section titles) across the 3 contract files.`,
    `NOT checked: rule-ID coordinates such as \`roles/elephant.md\` — *EL-01* (${coverage.ruleIdCoordinatesSkipped} skipped: they name a rule, not a heading),`,
    "prose after a path, bare paths without a coordinate, citations outside the 3 contract files,",
    "and German reference translations below the DE-REFERENCE-BELOW marker.",
  ].join(" ");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const rootIndex = process.argv.indexOf("--root");
  const root = rootIndex === -1 ? DEFAULT_ROOT : resolve(process.argv[rootIndex + 1] ?? DEFAULT_ROOT);
  const result = checkCriticContractCitations({ root });
  if (result.ok) {
    console.log(successLine(result));
    process.exit(0);
  }
  for (const finding of result.findings) console.error(finding);
  console.error(`Critic contract citation check failed: ${result.findings.length} finding(s).`);
  process.exit(2);
}
