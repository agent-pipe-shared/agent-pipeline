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
 *               (CLAUDE.md is the tie-breaker), and an "escalation ladder"
 *               attribution resolves to a section that has one.
 *   PHX-CITE-4  the pointer for the normative risk-class definitions resolves
 *               to text that defines risk.
 *   PHX-CITE-5  the "search harshly, report honestly" back-reference resolves
 *               to the section that states it.
 *   PHX-CITE-6  the Rensin attribution resolves to a target that names Rensin.
 *   PHX-CITE-7  no "transfer format <n>" ordinal is used while no enumeration
 *               defining that numbering exists anywhere in the canon.
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

/** Every file this check reads; the evidence runner materializes exactly these. */
export const CITATION_SOURCE_FILES = [PROTOCOL, ROLE, SKILL, OM, ADR3, ADR14, CLAUDE, README, FLOW];

/** Path tokens a citation may use, mapped to the file they resolve to. */
const PATH_ALIASES = [
  [/^docs\/operating-model\.md$/, OM],
  [/^harness\/review-protocol\.md$/, PROTOCOL],
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

function line(text, locator) {
  const m = locator.exec(text);
  return m ? m[0] : null;
}

/** All `path.md` references in a citation, each with the section it names, if any. */
function pathRefs(citation) {
  const refs = [];
  const re = /`([^`]+\.md)`(?:\s*(?:—|,)\s*\*([^*]+)\*)?/g;
  for (const m of citation.matchAll(re)) {
    const alias = PATH_ALIASES.find(([pattern]) => pattern.test(m[1]));
    if (alias) refs.push({ raw: m[1], file: alias[1], sectionName: m[2] ?? null });
  }
  return refs;
}

function adrRefs(citation) {
  return ADR_ALIASES.filter(([pattern]) => pattern.test(citation)).map(([, file]) => ({ raw: file, file, sectionName: null }));
}

/** Resolve a reference to its text, or null when the named section does not exist. */
function resolveRef(root, ref) {
  const doc = readDoc(root, ref.file);
  if (!ref.sectionName) return doc;
  return section(doc, new RegExp(`(^|\\s)${ref.sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`));
}

function describe(ref) {
  return ref.sectionName ? `${ref.file} — *${ref.sectionName}*` : ref.file;
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
        refs.push({ raw: "this file", file: claim.file, sectionName: null, selfNum: selfNum ? selfNum[1] : null });
      }
      for (const ref of refs) {
        let text = ref.selfNum ? numberedSection(readDoc(root, ref.file), ref.selfNum) : resolveRef(root, ref);
        const where = ref.selfNum ? `${ref.file} §${ref.selfNum}` : describe(ref);
        if (text === null) {
          findings.push(`PHX-CITE-1 TARGET-MISSING: ${claim.file} cites ${where}, which does not exist.`);
          continue;
        }
        const carries = normalize(text).includes(canonical);
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
  if (target.text === null || !/rung/i.test(target.text)) {
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
  const ladder = /\*([^*]+)\* \(escalation ladder/.exec(citation);
  if (ladder) {
    const text = section(readDoc(root, OM), new RegExp(`(^|\\s)${ladder[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`));
    if (text === null || !/rung|ladder/i.test(text)) {
      findings.push(`PHX-CITE-3 ANCHOR-ABSENT: ${PROTOCOL} assigns the escalation ladder to ${OM} — *${ladder[1]}*, which contains no ladder.`);
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
  const defines = targets.some((t) => t.text !== null && /\*\*Risk\*\*\s*(answers|is|means)/.test(t.text));
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
  const selfNum = /§(\d(?:\.\d)?)/.exec(citation);
  if (!selfNum) {
    findings.push(`PHX-CITE-5 REFERENCE-MISSING: ${PROTOCOL} states the two-phase pattern without naming where it is defined.`);
    return;
  }
  const text = numberedSection(doc, selfNum[1]);
  if (text === null || !/search harshly, report honestly/i.test(text)) {
    findings.push(`PHX-CITE-5 PATTERN-ABSENT: ${PROTOCOL} cites §${selfNum[1]} for "search harshly, report honestly"; that section does not state it.`);
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
  const anchored = targets.some((t) => t.text !== null && /Rensin/.test(t.text));
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

export function checkCriticContractCitations({ root = DEFAULT_ROOT } = {}) {
  const findings = [];
  checkCanonicalWording(root, findings);
  checkRungAnchor(root, findings);
  checkLadderPointer(root, findings);
  checkOperationalizationMap(root, findings);
  checkRiskClassDefinitions(root, findings);
  checkTwoPhaseBackReference(root, findings);
  checkRensinAttribution(root, findings);
  checkTransferFormatOrdinal(root, findings);
  return { ok: findings.length === 0, findings, root };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const rootIndex = process.argv.indexOf("--root");
  const root = rootIndex === -1 ? DEFAULT_ROOT : resolve(process.argv[rootIndex + 1] ?? DEFAULT_ROOT);
  const result = checkCriticContractCitations({ root });
  if (result.ok) {
    console.log("Critic contract citations: every cited target contains its cited content (7 citation classes checked).");
    process.exit(0);
  }
  for (const finding of result.findings) console.error(finding);
  console.error(`Critic contract citation check failed: ${result.findings.length} finding(s).`);
  process.exit(2);
}
