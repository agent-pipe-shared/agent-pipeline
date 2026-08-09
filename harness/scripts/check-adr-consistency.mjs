#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * check-adr-consistency.mjs — five purely mechanical consistency classes over
 * the `docs/adr/` corpus. Nothing here infers semantic agreement; every
 * finding names a file and a line it was read from.
 *
 * WHY THIS EXISTS. Until 2026-08-09 three files (`0047-...md` plus two others,
 * later renumbered to `0061`/`0062`) all claimed number 0047 and nothing
 * noticed for weeks — no reader, no gate, no cross-reference check, ever
 * counted the numbers. In the same window ADR-0038's status line was found
 * narrower ("session-trigger semantics superseded by ADR-0047") than the
 * supersession sentence ADR-0047 itself carried ("session-trigger and
 * mandatory-receipt semantics") — two accepted, cross-referencing documents
 * disagreeing about what one superseded in the other, silently, because
 * nothing ever compared the two claims. This is the first of two layers the
 * PO asked for after those defects; it is deliberately mechanical — it never
 * judges whether a decision is a GOOD one, only whether the corpus's own
 * cross-references are internally consistent.
 *
 * FIVE DEFECT CLASSES, each independently falsifiable and reported with its
 * own distinct message:
 *
 *   1. DUPLICATE-NUMBER      -- two files under docs/adr/ share the same
 *      leading four-digit filename number.
 *   2. MISSING-STATUS-LINE   -- a file carries neither of the corpus's two
 *      measured status conventions (see EXTRACT STATUS TEXT below).
 *   3. DANGLING-SUPERSESSION-TARGET -- an `ADR-NNNN` token named inside a
 *      file's own status text does not resolve to a file that exists.
 *   4. SUPERSESSION-DISAGREEMENT -- ADR-A's status text claims a term set is
 *      "superseded by ADR-B", ADR-B itself contains a same-sentence claim of
 *      what it supersedes in ADR-A, and the two term sets differ. See
 *      "CLASS 4 — NARROWING" below for exactly what textual shape this
 *      requires on both sides, and what is reported instead when a pair does
 *      not parse that way.
 *   5. INDEX-DISAGREEMENT    -- `docs/adr/README.md`'s English index table:
 *      every real ADR file has exactly one row, every row's linked file
 *      exists, and the row's displayed number matches the linked filename's
 *      number.
 *
 * ENGLISH ONLY. Every file in this corpus (ADR-0011) carries a German
 * reference translation below a `<!-- DE-REFERENCE-BELOW` marker line; only
 * the text above it is read by any class here.
 *
 * EXTRACT STATUS TEXT — TWO SHAPES, MEASURED NOT ASSUMED. The corpus was
 * grepped, not guessed at: ADRs 0006/0011/0014/0018/0019/0020/
 * 0023/0024/0026/0031 carry a `## Status` heading section instead of the
 * newer `**Status:** ... · **Date:** ...` inline bold paragraph the rest of
 * the corpus uses. Both are the corpus's established shape (measured: every
 * numbered file has exactly one of the two); a check that only recognised the
 * newer shape would report 10 false MISSING-STATUS-LINE findings against a
 * corpus with nothing wrong. `extractStatusText` recognises both; a file
 * carrying neither is the only case class 2 reports.
 *
 * CLASS 4 — NARROWING (a stop condition in the dispatching briefing: "Class 4
 * cannot be implemented without guessing at meaning. Narrow it until it is
 * purely textual ... do not ship a class that infers."). The ONLY real
 * instance of a status-line "superseded by ADR-B" claim in the corpus today
 * is ADR-0038 -> ADR-0047, and the ONLY real instance of a target ADR's own
 * "what I supersede in you" sentence is ADR-0047's "ADR-0038 remains
 * authoritative for route topology but is superseded for session-trigger and
 * mandatory-receipt semantics." This check recognises exactly those two
 * textual shapes and nothing wider:
 *   side A (in ADR-A's status text): `<terms> superseded by (ADR-)?NNNN`,
 *     terms taken from the nearest preceding `;` or `·` clause boundary (or
 *     the start of the status text).
 *   side B (in ADR-B's English text): a SINGLE-SENTENCE span (no `.` in
 *     between) reading `ADR-<A>` ... `is superseded for <terms>.`.
 * A pair that does not parse on BOTH sides this way is never asserted to
 * agree OR disagree — it is counted as unparsed and named in the success
 * line. What this costs in coverage: a claim phrased any other way (active
 * voice "ADR-B supersedes ADR-A for X", a claim split across a full stop, a
 * claim in prose rather than attached to the literal token "ADR-NNNN") is
 * invisible to this class. That is the deliberate price of "no class that
 * infers" — widening the shape to catch more phrasings would mean guessing
 * where a same-meaning claim starts and ends.
 *
 * Exit 0: all five classes clean. Exit 2: at least one finding.
 * `--root <dir>` resolves `docs/adr/` against another checkout, which is how
 * the falsifiability fixtures run this file's exact CLI against a temp root.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = resolve(HERE, "..", "..");
export const ADR_DIR_REL = join("docs", "adr");
export const README_REL = join("docs", "adr", "README.md");

const FILENAME_RE = /^(\d{4})-.+\.md$/;

/** English-primary text only (ADR-0011): everything below the marker is a
 *  full German reference translation this check never reads. */
function englishPart(text) {
  const m = /^<!-- DE-REFERENCE-BELOW/m.exec(text);
  return m ? text.slice(0, m.index) : text;
}

function readRaw(absPath) {
  return readFileSync(absPath, "utf8");
}

/** 1-based line number of a character offset into the SAME raw text the
 *  offset was measured against (englishPart only truncates the tail, so an
 *  offset into it is always a valid offset into the raw file too). */
function lineOf(rawText, offset) {
  return rawText.slice(0, offset).split("\n").length;
}

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

/** Every `docs/adr/*.md` file whose name is a numbered ADR (README excluded). */
export function listAdrFiles(root) {
  const dir = join(root, ADR_DIR_REL);
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    return { files: [], error };
  }
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name === "README.md") continue;
    const m = FILENAME_RE.exec(entry.name);
    if (!m) continue;
    files.push({ name: entry.name, number: m[1], path: join(dir, entry.name) });
  }
  files.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { files, error: null };
}

/**
 * The status text of a file, in whichever of the corpus's two measured shapes
 * it uses (see module header). Returns `{ text, offset }` (offset into the RAW
 * file text, for line-number reporting) or null if neither shape is present.
 */
function extractStatusText(rawText, english) {
  const headingMatch = /^## Status\s*$/m.exec(english);
  if (headingMatch) {
    const bodyStart = headingMatch.index + headingMatch[0].length;
    const rest = english.slice(bodyStart);
    const nextHeading = /^#{1,6}\s/m.exec(rest);
    const body = nextHeading ? rest.slice(0, nextHeading.index) : rest;
    const trimmed = body.trim();
    if (trimmed !== "") {
      const offset = bodyStart + body.indexOf(trimmed.slice(0, 1));
      return { text: normalizeWhitespace(trimmed), offset: Math.max(offset, bodyStart) };
    }
  }
  const boldMatch = /\*\*Status:\*\*/.exec(english);
  if (boldMatch) {
    const rest = english.slice(boldMatch.index);
    const blank = /\n[ \t]*\n/.exec(rest);
    const para = blank ? rest.slice(0, blank.index) : rest;
    const trimmed = para.trim();
    if (trimmed !== "") return { text: normalizeWhitespace(trimmed), offset: boldMatch.index };
  }
  return null;
}

// -------------------------------------------------------------- class 1 & 2

function checkDuplicateNumbers(files, findings) {
  const byNumber = new Map();
  for (const file of files) {
    if (!byNumber.has(file.number)) byNumber.set(file.number, []);
    byNumber.get(file.number).push(file);
  }
  let duplicateCount = 0;
  for (const [number, group] of byNumber) {
    if (group.length <= 1) continue;
    duplicateCount += 1;
    const names = group.map((f) => f.name).sort().join(", ");
    for (const file of group) {
      findings.push(`DUPLICATE-NUMBER ${file.name}:1 -- number ${number} is also claimed by ${names}`);
    }
  }
  return duplicateCount;
}

function checkMissingStatusLine(files, statusByFile, findings) {
  let missingCount = 0;
  for (const file of files) {
    if (statusByFile.get(file.name) !== null) continue;
    missingCount += 1;
    findings.push(`MISSING-STATUS-LINE ${file.name}:1 -- neither a "**Status:**" paragraph nor a "## Status" section was found`);
  }
  return missingCount;
}

// ------------------------------------------------------------------ class 3

function checkDanglingSupersessionTargets(files, statusByFile, adrByNumber, findings) {
  let danglingCount = 0;
  let targetsChecked = 0;
  for (const file of files) {
    const status = statusByFile.get(file.name);
    if (status === null) continue;
    const raw = readRaw(file.path);
    const re = /ADR-(\d{4})/g;
    const seen = new Set();
    for (const m of status.text.matchAll(re)) {
      const target = m[1];
      if (seen.has(target)) continue;
      seen.add(target);
      targetsChecked += 1;
      if (adrByNumber.has(target)) continue;
      danglingCount += 1;
      // Locate the token in the raw file for a real line number: the status
      // text was whitespace-normalized, so re-find the literal token starting
      // from the status paragraph's own offset in the raw text.
      const tokenOffset = raw.indexOf(`ADR-${target}`, status.offset);
      const line = lineOf(raw, tokenOffset === -1 ? status.offset : tokenOffset);
      findings.push(`DANGLING-SUPERSESSION-TARGET ${file.name}:${line} -- names ADR-${target}, which does not exist in ${ADR_DIR_REL}`);
    }
  }
  return { danglingCount, targetsChecked };
}

// ------------------------------------------------------------------ class 4

/** Terms named by a "superseded by (ADR-)NNNN" clause: text back to the
 *  nearest preceding `;` or `·` clause boundary (or the start of the status
 *  text), trimmed. Purely positional -- no meaning is inferred. */
function precedingClauseText(statusText, matchStart) {
  const semi = statusText.lastIndexOf(";", matchStart);
  const dot = statusText.lastIndexOf("·", matchStart); // '·'
  const boundary = Math.max(semi, dot);
  const start = boundary === -1 ? 0 : boundary + 1;
  return statusText.slice(start, matchStart).trim();
}

/** Splits a term-set phrase on commas, semicolons and " and " (case
 *  insensitive), never on any other basis -- no synonym or stemming logic. */
function splitTerms(phrase) {
  return phrase
    .split(/\s*(?:,|;|\band\b)\s*/i)
    .map((t) => t.trim())
    .filter((t) => t !== "");
}

function sameTermSet(a, b) {
  const na = [...new Set(a.map((t) => t.toLowerCase()))].sort();
  const nb = [...new Set(b.map((t) => t.toLowerCase()))].sort();
  if (na.length !== nb.length) return false;
  return na.every((t, i) => t === nb[i]);
}

/** The ONE textual shape side B is recognised in: a single-sentence span (no
 *  "." in between) naming `ADR-<adrA>` and then "is superseded for <terms>.". */
function findSupersessionClaimInTarget(englishB, adrA) {
  const re = new RegExp(`ADR-${adrA}\\b[^.]*?\\bis superseded for\\s+([^.]+)\\.`);
  const m = re.exec(englishB);
  if (!m) return null;
  return { terms: normalizeWhitespace(m[1]), offset: m.index };
}

function checkSupersessionDisagreement(files, statusByFile, adrByNumber, findings, coverage) {
  const SUPERSEDED_BY_RE = /superseded by\s+(?:ADR-)?(\d{4})/g;
  for (const fileA of files) {
    const statusA = statusByFile.get(fileA.name);
    if (statusA === null) continue;
    for (const m of statusA.text.matchAll(SUPERSEDED_BY_RE)) {
      const targetNumber = m[1];
      coverage.pairsFound += 1;
      const termsAPhrase = precedingClauseText(statusA.text, m.index);
      const termsA = splitTerms(termsAPhrase);
      const fileB = adrByNumber.get(targetNumber);
      if (!fileB || termsA.length === 0) {
        coverage.unparsedPairs.push(`${fileA.name} -> ADR-${targetNumber} (side A did not resolve to a parseable term set or target file)`);
        continue;
      }
      const rawA = readRaw(fileA.path);
      const englishB = englishPart(readRaw(fileB.path));
      const claim = findSupersessionClaimInTarget(englishB, fileA.number);
      if (!claim) {
        coverage.unparsedPairs.push(`${fileA.name} -> ${fileB.name} (no matching "ADR-${fileA.number} ... is superseded for ..." sentence found in ${fileB.name})`);
        continue;
      }
      const termsB = splitTerms(claim.terms);
      coverage.pairsCompared += 1;
      if (sameTermSet(termsA, termsB)) continue;
      const tokenOffset = rawA.indexOf("superseded by", statusA.offset);
      const lineA = lineOf(rawA, tokenOffset === -1 ? statusA.offset : tokenOffset);
      const rawB = readRaw(fileB.path);
      const lineB = lineOf(rawB, claim.offset);
      findings.push(
        `SUPERSESSION-DISAGREEMENT ${fileA.name}:${lineA} claims "${termsAPhrase}" superseded by ADR-${targetNumber}; ` +
        `${fileB.name}:${lineB} claims it supersedes ADR-${fileA.number} for "${claim.terms}" -- term sets disagree`,
      );
    }
  }
}

// ------------------------------------------------------------------ class 5

const INDEX_HEADER_RE = /^\|\s*No\.\s*\|/m;
const INDEX_ROW_RE = /^\|\s*\[(\d{4})\]\(([^)]+\.md)\)\s*\|/gm;

/** The main English index table's own text: from its header row down to the
 *  next level-3 heading ("### Resubmissions"), never the Resubmissions table
 *  (same link syntax, would otherwise double-count every row it names). */
function indexTableText(englishReadme) {
  const headerMatch = INDEX_HEADER_RE.exec(englishReadme);
  if (!headerMatch) return null;
  const rest = englishReadme.slice(headerMatch.index);
  const nextHeading = /^###\s/m.exec(rest);
  const region = nextHeading ? rest.slice(0, nextHeading.index) : rest;
  return { region, offset: headerMatch.index };
}

function checkIndexDisagreement(files, root, findings, coverage) {
  const readmePath = join(root, README_REL);
  let raw;
  try {
    raw = readRaw(readmePath);
  } catch (error) {
    findings.push(`INDEX-DISAGREEMENT ${README_REL}:1 -- could not read the index (${error.code ?? error.message})`);
    return;
  }
  const english = englishPart(raw);
  const table = indexTableText(english);
  if (!table) {
    findings.push(`INDEX-DISAGREEMENT ${README_REL}:1 -- no English index table header ("| No. | Title | Status | Date |") found`);
    return;
  }
  // Keyed by the LINKED FILENAME, not the displayed number: two files that
  // happen to share a filename number (class 1's own defect shape) must each
  // still be checkable for "exactly one row" independently of that collision
  // -- keying by number here would make every duplicate-number fixture also
  // report a spurious index disagreement, conflating two distinct defects.
  const rowsByFilename = new Map();
  for (const m of table.region.matchAll(INDEX_ROW_RE)) {
    coverage.indexRowsRead += 1;
    const displayedNumber = m[1];
    const linkTarget = m[2];
    const line = lineOf(raw, table.offset + m.index);
    const linkedFileName = basename(linkTarget);
    if (!rowsByFilename.has(linkedFileName)) rowsByFilename.set(linkedFileName, []);
    rowsByFilename.get(linkedFileName).push({ line, linkTarget, displayedNumber });

    const linkedPath = join(root, ADR_DIR_REL, linkTarget);
    if (!existsSync(linkedPath)) {
      findings.push(`INDEX-DISAGREEMENT ${README_REL}:${line} -- row for ${displayedNumber} links ${linkTarget}, which does not exist`);
      continue;
    }
    const nameMatch = FILENAME_RE.exec(linkedFileName);
    if (nameMatch && nameMatch[1] !== displayedNumber) {
      findings.push(`INDEX-DISAGREEMENT ${README_REL}:${line} -- row displays ${displayedNumber} but links ${linkedFileName}, numbered ${nameMatch[1]}`);
    }
  }
  for (const file of files) {
    const rows = rowsByFilename.get(file.name) ?? [];
    if (rows.length === 0) {
      findings.push(`INDEX-DISAGREEMENT ${README_REL}:${lineOf(raw, table.offset)} -- ${file.name} has no row in the English index table`);
    } else if (rows.length > 1) {
      const lines = rows.map((r) => r.line).join(", ");
      findings.push(`INDEX-DISAGREEMENT ${README_REL}:${rows[0].line} -- ${file.name} has ${rows.length} rows in the English index table (lines ${lines})`);
    }
  }
}

// -------------------------------------------------------------------- entry

export function checkAdrConsistency({ root = DEFAULT_ROOT } = {}) {
  const findings = [];
  const coverage = {
    filesScanned: 0,
    duplicateNumbers: 0,
    missingStatusLines: 0,
    supersessionTargetsChecked: 0,
    danglingSupersessionTargets: 0,
    supersessionPairsFound: 0,
    supersessionPairsCompared: 0,
    unparsedSupersessionPairs: [],
    indexRowsRead: 0,
  };

  const { files, error } = listAdrFiles(root);
  if (error) {
    findings.push(`READ-ERROR ${ADR_DIR_REL}:1 -- could not read the directory (${error.code ?? error.message})`);
    return { ok: false, findings, root, coverage };
  }
  coverage.filesScanned = files.length;

  coverage.duplicateNumbers = checkDuplicateNumbers(files, findings);

  const statusByFile = new Map();
  for (const file of files) {
    const raw = readRaw(file.path);
    const english = englishPart(raw);
    statusByFile.set(file.name, extractStatusText(raw, english));
  }
  coverage.missingStatusLines = checkMissingStatusLine(files, statusByFile, findings);

  const adrByNumber = new Map(files.map((f) => [f.number, f]));
  const dangling = checkDanglingSupersessionTargets(files, statusByFile, adrByNumber, findings);
  coverage.danglingSupersessionTargets = dangling.danglingCount;
  coverage.supersessionTargetsChecked = dangling.targetsChecked;

  const class4Coverage = { pairsFound: 0, pairsCompared: 0, unparsedPairs: [] };
  checkSupersessionDisagreement(files, statusByFile, adrByNumber, findings, class4Coverage);
  coverage.supersessionPairsFound = class4Coverage.pairsFound;
  coverage.supersessionPairsCompared = class4Coverage.pairsCompared;
  coverage.unparsedSupersessionPairs = class4Coverage.unparsedPairs;

  checkIndexDisagreement(files, root, findings, coverage);

  return { ok: findings.length === 0, findings, root, coverage };
}

/**
 * The success line. States what was measured AND what this check does not
 * cover (QG-05, guardrails/quality-gates.md): an unqualified "the corpus is
 * consistent" would overclaim exactly the way the checks this repairs after
 * did not exist to prevent.
 */
export function successLine({ coverage }) {
  const unparsed = coverage.unparsedSupersessionPairs;
  return [
    "ADR corpus consistency: 5 classes green -- " +
      `${coverage.filesScanned} numbered ADR files, 0 duplicate numbers, 0 missing status lines, ` +
      `${coverage.supersessionTargetsChecked} ADR-NNNN supersession targets resolved (0 dangling), ` +
      `${coverage.supersessionPairsCompared}/${coverage.supersessionPairsFound} status-line supersession pair(s) compared and agreeing, ` +
      `${coverage.indexRowsRead} English index rows all resolving to their claimed file at their claimed number.`,
    `Unparsed supersession pairs (counted, not judged): ${unparsed.length}` + (unparsed.length > 0 ? ` -- ${unparsed.join("; ")}` : "."),
    "NOT checked: whether an ADR's decision is reflected in the code that implements it; German reference translations below the DE-REFERENCE-BELOW marker;",
    "any supersession claim phrased other than the two literal shapes this check parses (see module header, \"CLASS 4 -- NARROWING\") -- such a pair is reported as unparsed above, never silently agreed;",
    "whether a decision recorded here is still a GOOD decision -- this check is purely mechanical cross-reference consistency, never semantic judgment.",
  ].join(" ");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const rootIndex = process.argv.indexOf("--root");
  const root = rootIndex === -1 ? DEFAULT_ROOT : resolve(process.argv[rootIndex + 1] ?? DEFAULT_ROOT);
  const result = checkAdrConsistency({ root });
  if (result.ok) {
    console.log(successLine(result));
    process.exit(0);
  }
  for (const finding of result.findings) console.error(finding);
  console.error(`ADR consistency check failed: ${result.findings.length} finding(s).`);
  process.exit(2);
}
