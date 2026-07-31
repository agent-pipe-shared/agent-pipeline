#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * CYB-2I-4 -- completeness-vocabulary doc-lint (AC13, guardrails/security.md
 * SEC-09).
 *
 * AC13 requires that no project doc conflate the two human-facing
 * completeness terms most likely to be used interchangeably despite meaning
 * materially different things: `unavailable` ("relevant but not verifiable
 * right now") and `not-applicable` ("never relevant to begin with"). This
 * script scans a fixed, small set of project docs for the specific
 * direct-equivalence conflation pattern named in AC13 -- a sentence that
 * asserts the two terms mean the same thing (e.g. "unavailable (not
 * applicable)", "not-applicable, i.e. unavailable", "unavailable = not
 * applicable") -- and fails closed on a match.
 *
 * This is deliberately NOT a general co-occurrence check: a doc explaining
 * the SEC-09 distinction legitimately uses both words in the same section
 * (even the same sentence) without conflating them. Flagging every sentence
 * that merely mentions both terms would produce constant false positives on
 * exactly the prose this rule exists to protect. The heuristic instead
 * requires an explicit equivalence connector directly between the two terms
 * (parenthetical gloss, "i.e."/"that is", "=", "means", "is a synonym of",
 * "and ... are the same", "/ ... interchangeable"). See `KNOWN LIMITS`
 * below for what this catches and what it does not.
 *
 * KNOWN LIMITS (stated honestly, not overclaiming perfect detection):
 *   - False negatives: conflation phrased without one of the recognized
 *     connector shapes (e.g. a conflation spread across two sentences, or
 *     using a connector word not in the list such as "aka"/"a.k.a.") will
 *     NOT be caught. This is a template-matched heuristic, not NLP.
 *   - False negatives: a conflation split across a line wrap inside a
 *     source Markdown paragraph will not be caught, because detection is
 *     per physical line (this repo's guardrail docs write one bullet/
 *     sentence per line, so this is a low-risk simplification here, but it
 *     is not a general-purpose prose scanner).
 *   - False positives: a sentence that legitimately uses one of the
 *     connector words (e.g. "means") between the two terms while actually
 *     asserting they are DIFFERENT (rare phrasing, e.g. "unavailable means
 *     not-applicable is wrong here") could still match; the heuristic reads
 *     surface connector shape, not sentence-level negation/polarity.
 */
import { readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = new URL(".", import.meta.url);
export const DEFAULT_ROOT = resolve(fileURLToPath(new URL("../../../", HERE)));

/** The fixed, small doc set this lint scans -- see this file's own header + the briefing's Field 2 item 2. Never the whole repo tree. */
export const DEFAULT_SCANNED_FILES = Object.freeze([
  "guardrails/security.md",
  "guardrails/quality-gates.md",
  "docs/operating-model.md",
]);

const NOT_APPLICABLE = "not[- ]applicable";

/** Direct-equivalence connector shapes between "unavailable" and "not-applicable", either order. */
const CONFLATION_PATTERNS = [
  new RegExp(`\\bunavailable\\b\\s*\\(\\s*(?:i\\.e\\.,?\\s*)?${NOT_APPLICABLE}\\s*\\)`, "i"),
  new RegExp(`\\b${NOT_APPLICABLE}\\b\\s*\\(\\s*(?:i\\.e\\.,?\\s*)?unavailable\\s*\\)`, "i"),
  new RegExp(`\\bunavailable\\b\\s*,?\\s*(?:i\\.e\\.,?|that is,?)\\s*${NOT_APPLICABLE}\\b`, "i"),
  new RegExp(`\\b${NOT_APPLICABLE}\\b\\s*,?\\s*(?:i\\.e\\.,?|that is,?)\\s*unavailable\\b`, "i"),
  new RegExp(`\\bunavailable\\b\\s+(?:is|=|equals|means)\\s+${NOT_APPLICABLE}\\b`, "i"),
  new RegExp(`\\b${NOT_APPLICABLE}\\b\\s+(?:is|=|equals|means)\\s+unavailable\\b`, "i"),
  new RegExp(`\\bunavailable\\s+and\\s+${NOT_APPLICABLE}\\s+(?:are|mean)\\s+the\\s+same\\b`, "i"),
  new RegExp(`\\b${NOT_APPLICABLE}\\s+and\\s+unavailable\\s+(?:are|mean)\\s+the\\s+same\\b`, "i"),
  new RegExp(`\\b(?:unavailable|${NOT_APPLICABLE})\\s+(?:is\\s+)?(?:a\\s+)?synonym\\s+(?:for|of)\\s+(?:unavailable|${NOT_APPLICABLE})\\b`, "i"),
  new RegExp(`\\bunavailable\\s*/\\s*${NOT_APPLICABLE}\\s+(?:are\\s+)?interchangeable\\b`, "i"),
  new RegExp(`\\b${NOT_APPLICABLE}\\s*/\\s*unavailable\\s+(?:are\\s+)?interchangeable\\b`, "i"),
];

/**
 * SEC-09's closed six-term vocabulary, in the order they're defined in
 * `guardrails/security.md`. AC13's full evidence requirement is "all six
 * terms defined distinctly" -- `CONFLATION_PATTERNS` above only enforces the
 * non-conflation half; this catches the other half (deleting the whole
 * SEC-09 section would otherwise leave this lint at exit 0).
 */
const SIX_TERM_VOCABULARY = Object.freeze(["clean", "complete", "unavailable", "unsupported", "waived", "not-applicable"]);

/** The canonical doc this six-term-presence check applies to (the SEC-09 definition source itself -- the other scanned files only need to avoid conflating the vocabulary, not redefine it). */
const VOCABULARY_DEFINITION_FILE = "guardrails/security.md";

/**
 * A term is "defined" when it appears as a bold list-item introduction, e.g.
 * `- **clean** —`/`- **not-applicable** --`, matching this repo's existing
 * SEC-09 prose convention. A bare substring search would false-positive on
 * unrelated prose mentioning e.g. "waived" elsewhere in the doc.
 */
function definitionAnchorPattern(term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^\\s*-\\s+\\*\\*${escaped}\\*\\*\\s*[—-]`, "m");
}

/**
 * Verifies `guardrails/security.md`'s already-read `text` (or, if the caller
 * never read it because it was absent from the scanned `files` set, reads it
 * itself relative to `root`) contains a distinct bold-list-item definition
 * anchor for each of the six SEC-09 terms. Returns findings naming exactly
 * which term(s) are missing (empty = all six present). Never reports a
 * second, redundant "missing or unreadable" finding for a file the main scan
 * loop already reported missing -- `text` being `undefined` for that reason
 * is silently skipped here (the missing-file finding already exists).
 */
function checkSixTermVocabularyPresence(root, text, alreadyScanned) {
  const findings = [];
  if (text === undefined) {
    if (alreadyScanned) return findings; // main loop already reported this file as missing/unreadable
    try {
      text = readFileSync(join(root, VOCABULARY_DEFINITION_FILE), "utf8");
    } catch (error) {
      findings.push(`${VOCABULARY_DEFINITION_FILE}: missing or unreadable (${error.code ?? error.message})`);
      return findings;
    }
  }
  const missing = SIX_TERM_VOCABULARY.filter((term) => !definitionAnchorPattern(term).test(text));
  if (missing.length > 0) {
    findings.push(`${VOCABULARY_DEFINITION_FILE}: missing SEC-09 six-term vocabulary definition anchor(s) for: ${missing.join(", ")}`);
  }
  return findings;
}

function safeRelative(file) {
  if (typeof file !== "string" || file.length === 0 || isAbsolute(file) || file.includes("..")) return null;
  return file.replaceAll("\\", "/");
}

function scanText(relPath, text, findings) {
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const pattern of CONFLATION_PATTERNS) {
      if (pattern.test(line)) {
        findings.push(`${relPath}:${index + 1}: possible unavailable/not-applicable conflation - "${line.trim()}"`);
        break;
      }
    }
  });
}

/**
 * Scans `files` (repo-relative paths) under `root` for the unavailable/
 * not-applicable conflation pattern. Pure w.r.t. its inputs beyond the
 * filesystem reads it performs; never writes.
 */
export function checkCompletenessVocabularyDoclint(root = DEFAULT_ROOT, files = DEFAULT_SCANNED_FILES) {
  const findings = [];
  let vocabularyFileText;
  let vocabularyFileScanned = false;
  for (const file of files) {
    const relPath = safeRelative(file);
    if (!relPath) {
      findings.push(`${file}: scanned-file entry must be a repository-relative path`);
      continue;
    }
    if (relPath === VOCABULARY_DEFINITION_FILE) vocabularyFileScanned = true;
    let text;
    try {
      text = readFileSync(join(root, relPath), "utf8");
    } catch (error) {
      findings.push(`${relPath}: missing or unreadable (${error.code ?? error.message})`);
      continue;
    }
    if (relPath === VOCABULARY_DEFINITION_FILE) vocabularyFileText = text;
    scanText(relPath, text, findings);
  }
  findings.push(...checkSixTermVocabularyPresence(root, vocabularyFileText, vocabularyFileScanned));
  return { ok: findings.length === 0, findings };
}

function runCli() {
  const args = process.argv.slice(2);
  const rootIndex = args.indexOf("--root");
  if (args.length && (rootIndex !== 0 || args.length !== 2)) {
    process.stderr.write("usage: check-completeness-vocabulary-doclint.mjs [--root <repository>]\n");
    process.exit(2);
  }
  const root = rootIndex === 0 ? args[1] : (process.env.CLAUDE_PROJECT_DIR || process.cwd());
  const result = checkCompletenessVocabularyDoclint(root);
  if (!result.ok) {
    for (const item of result.findings) process.stderr.write(`COMPLETENESS-VOCAB-DOCLINT ${item}\n`);
    process.stderr.write(`Completeness-vocabulary doc-lint failed: ${result.findings.length} finding(s).\n`);
    process.exit(2);
  }
  process.stdout.write(`Completeness-vocabulary doc-lint clean: ${DEFAULT_SCANNED_FILES.length} file(s) scanned, no unavailable/not-applicable conflation found.\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();
