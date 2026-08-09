#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * check-doc-reconciliation.mjs — layer two of the two-layer check the PO asked
 * for after two accepted ADRs were found contradicting the implementation.
 * Layer one (check-adr-consistency.mjs, commit f1d254e) compares the ADR
 * corpus against itself. This layer asks a different question: when code
 * changed, did anyone look at the decisions that govern it?
 *
 * WHY A COMMIT-RANGE-BOUND RECORD, NOT A HANDOVER TODO. The session that
 * pushes is not the session that started, and compacts happen in between. An
 * obligation recorded in a handover has a one-context-window lifetime, so an
 * "I'll reconcile the docs before I push" note is worthless once the context
 * that wrote it is gone. This check instead binds the obligation to the exact
 * commit range it covers, and the only thing that can satisfy it is an
 * artifact naming that exact range — never a promise, never a TODO, never a
 * record that happens to be recent.
 *
 * MECHANISM.
 *   1. An ADR may carry a `**Governs:**` line in its header area (above any
 *      `DE-REFERENCE-BELOW` marker, English text only — ADR-0011): a single
 *      line, comma-separated repo-relative globs.
 *   2. `--base <ref> --candidate <ref>`, BOTH REQUIRED, no defaults. The
 *      changed path set is `git diff --name-only <base>..<candidate>`
 *      (exact form). The measured range is printed in every output line this
 *      module writes, success or failure — a count that does not say which
 *      range it came from is how a correct measurement got attached to the
 *      wrong question earlier this sprint.
 *   3. An ADR is IMPLICATED when one of its globs matches a changed path.
 *   4. Every implicated ADR must appear in a reconciliation record at
 *      `docs/doc-reconciliation.md`, inside a section whose heading names
 *      the exact RESOLVED candidate commit (full 40-hex SHA — see "RECORD
 *      FORMAT" below), with one line per ADR stating either that it was
 *      checked and needs no change, or naming the commit that amended it.
 *   5. An ADR carrying no `**Governs:**` line is counted and reported, NEVER
 *      enforced. Coverage is a number in the success line, growing as ADRs
 *      get the line; failing on unannotated ADRs would make this unusable on
 *      day one.
 *
 * GLOB SEMANTICS (this module's own design; documented because nothing
 * upstream fixes it). Anchored against the FULL repo-relative POSIX path
 * (git already emits forward slashes on every platform for `diff
 * --name-only` and `ls-files`, so no separator translation is needed):
 *   - `*`  matches any run of characters EXCLUDING `/` (one path segment);
 *   - `**` matches any run of characters INCLUDING `/`, zero-length included
 *     (crosses directories; `plugins/pipeline-core/**` matches
 *     `plugins/pipeline-core/hooks/guard-push.mjs`);
 *   - every other character is literal (no `?`, no `[...]` classes).
 * This is deliberately smaller than a general-purpose glob library: fewer
 * metacharacters means fewer surprises in a file a human edits by hand.
 *
 * RECORD FORMAT (docs/doc-reconciliation.md; this module's own design —
 * dispatch metadata: genuine in-task design latitude on this shape).
 * A section heading is `## Candidate <40-hex-sha>` (optionally followed by
 * more text on the same line, e.g. a date or a one-line description); its
 * body runs until the next `## ` heading or end of file. Inside that body, a
 * reconciliation line for ADR-NNNN is `- ADR-NNNN: checked, no change
 * needed.` or `- ADR-NNNN: amended in <commit>.`. A `- ADR-NNNN: ...` line
 * whose body matches neither shape is MALFORMED-RECORD-ENTRY, reported and
 * NOT honoured — a half-written entry must not silently satisfy the ADR it
 * names, the same posture QG-06 takes toward a half-written exclusion.
 *
 * STALE-PROOF BY CONSTRUCTION, NOT BY A SPECIAL CASE. A record entry is only
 * ever read from the section whose heading names the RESOLVED candidate SHA
 * being checked right now. An entry for ADR-0012 that exists only under a
 * `## Candidate <some other sha>` heading is invisible to this run — not
 * filtered out, never looked at in the first place. That is the whole
 * mechanism that makes a stale record fail: there is no code path that lets
 * a record for one commit answer for another.
 *
 * WHAT THIS CHECK CANNOT DO, STATED HERE ONCE. It makes OMISSION impossible
 * (an implicated ADR with no matching record entry is a hard finding); it
 * cannot make DILIGENCE certain (a `checked, no change needed` line is
 * accepted on its stated shape alone — nothing here judges whether the
 * change was actually looked at, or looked at well). It covers `docs/adr/`
 * only, never any other documentation (specs/, backlog/, guardrails/,
 * roles/, templates/, or prose without a `Governs:` line).
 *
 * Exit 0: every ADR implicated by the measured range has a record entry (or
 * there are none). Exit 2: at least one finding (unreconciled ADR, malformed
 * record entry, or a Governs glob that matches no tracked file — this last
 * class is a static corpus defect and fires independently of any range).
 * `--root <dir>` resolves both the ADR corpus and the git range against
 * another checkout, the same convention check-adr-consistency.mjs uses for
 * its falsifiability fixtures.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { listAdrFiles } from "./check-adr-consistency.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = resolve(HERE, "..", "..");
export const ADR_DIR_REL = join("docs", "adr");
export const RECORD_REL = join("docs", "doc-reconciliation.md");

const GOVERNS_RE = /^\*\*Governs:\*\*[ \t]*(.+)$/m;
const SECTION_HEADING_RE = /^##[ \t]+Candidate[ \t]+([0-9a-f]{40})\b.*$/gm;
const ENTRY_RE = /^-[ \t]*ADR-(\d{4}):[ \t]*(.+?)[ \t]*$/gm;
const CHECKED_BODY_RE = /^checked,[ \t]*no change needed\.?$/i;
const AMENDED_BODY_RE = /^amended in[ \t]+([0-9a-f]{7,40})\.?$/i;
const SHA_RE = /^[0-9a-f]{40}$/;

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

// ------------------------------------------------------------ glob matching

const REGEX_SPECIAL_CHAR_RE = /[.*+?^${}()|[\]\\]/;
function escapeRegexChar(ch) {
  return REGEX_SPECIAL_CHAR_RE.test(ch) ? `\\${ch}` : ch;
}

/** Translates ONE glob (see module header, "GLOB SEMANTICS") into an anchored
 *  RegExp. `**` -> `.*`; a lone `*` -> `[^/]*`; everything else escaped literal. */
export function globToRegExp(glob) {
  let source = "^";
  let i = 0;
  while (i < glob.length) {
    if (glob[i] === "*" && glob[i + 1] === "*") { source += ".*"; i += 2; continue; }
    if (glob[i] === "*") { source += "[^/]*"; i += 1; continue; }
    source += escapeRegexChar(glob[i]);
    i += 1;
  }
  source += "$";
  return new RegExp(source);
}

export function globMatches(glob, posixPath) {
  return globToRegExp(glob).test(posixPath);
}

// ------------------------------------------------------------------ parsing

/**
 * The `**Governs:**` line of one ADR's raw text, in the header area above any
 * DE-REFERENCE-BELOW marker (englishPart already excludes everything below
 * it, so a match here is always above the marker). Returns
 * `{ globs, offset }` (offset into the RAW file text, for line-number
 * reporting) or null if the ADR carries no such line -- counted, never
 * enforced (see module header point 5).
 */
export function parseGovernsGlobs(rawText) {
  const english = englishPart(rawText);
  const m = GOVERNS_RE.exec(english);
  if (m === null) return null;
  const globs = m[1].split(",").map((g) => g.trim()).filter((g) => g !== "");
  return { globs, offset: m.index };
}

/**
 * The body text of the reconciliation section whose heading names
 * `candidateSha` exactly, plus the raw-text offset that body starts at (for
 * line-number reporting). Returns null if no such heading exists at all --
 * this is the entire stale-proofing mechanism: a section for a DIFFERENT sha
 * is simply never found, so its entries are never read (see module header,
 * "STALE-PROOF BY CONSTRUCTION").
 */
export function findCandidateSection(recordText, candidateSha) {
  const re = new RegExp(SECTION_HEADING_RE.source, "gm");
  let match;
  while ((match = re.exec(recordText)) !== null) {
    if (match[1] !== candidateSha) continue;
    const start = match.index + match[0].length;
    const rest = recordText.slice(start);
    const nextHeading = /^##[ \t]+/m.exec(rest);
    const body = nextHeading ? rest.slice(0, nextHeading.index) : rest;
    return { text: body, startOffset: start };
  }
  return null;
}

/**
 * Every `- ADR-NNNN: ...` line in one section body. A well-formed entry
 * (module header, "RECORD FORMAT") marks that ADR number satisfied for this
 * candidate; a line that does not parse as either recognised shape is pushed
 * onto `findings` as MALFORMED-RECORD-ENTRY and does NOT satisfy anything --
 * the same "not honoured" posture QG-06 takes toward a malformed exclusion.
 */
export function parseReconciliationEntries(section, fullRawText, candidateSha, findings) {
  const satisfied = new Set();
  const re = new RegExp(ENTRY_RE.source, "gm");
  let match;
  while ((match = re.exec(section.text)) !== null) {
    const number = match[1];
    const body = match[2];
    const line = lineOf(fullRawText, section.startOffset + match.index);
    if (CHECKED_BODY_RE.test(body) || AMENDED_BODY_RE.test(body)) {
      satisfied.add(number);
      continue;
    }
    findings.push(
      `MALFORMED-RECORD-ENTRY ${RECORD_REL}:${line} -- entry for ADR-${number} under candidate ${candidateSha} is neither ` +
      `"checked, no change needed" nor "amended in <commit>" (got "${body}")`,
    );
  }
  return satisfied;
}

// ----------------------------------------------------------------------- git

function gitRevParse(root, ref) {
  const result = spawnSync("git", ["rev-parse", ref], { cwd: root, encoding: "utf8", shell: false });
  if (result.status !== 0) return null;
  const sha = result.stdout.trim();
  return SHA_RE.test(sha) ? sha : null;
}

function gitDiffNameOnly(root, baseSha, candidateSha) {
  const result = spawnSync("git", ["diff", "--name-only", `${baseSha}..${candidateSha}`], { cwd: root, encoding: "utf8", shell: false });
  if (result.status !== 0) return { ok: false, error: (result.stderr ?? "").trim() || `git exited ${result.status}` };
  const paths = result.stdout.split("\n").map((line) => line.trim()).filter((line) => line !== "");
  return { ok: true, paths };
}

function gitLsFiles(root) {
  const result = spawnSync("git", ["ls-files"], { cwd: root, encoding: "utf8", shell: false });
  if (result.status !== 0) return { ok: false, error: (result.stderr ?? "").trim() || `git exited ${result.status}` };
  const files = result.stdout.split("\n").map((line) => line.trim()).filter((line) => line !== "");
  return { ok: true, files };
}

/** The range text this module prints in EVERY output, success or failure
 *  (module header point 2): the raw refs as given, plus their resolution
 *  where one was reached. */
export function formatRange(range) {
  const resolvedBase = range.baseSha ?? "<unresolved>";
  const resolvedCandidate = range.candidateSha ?? "<unresolved>";
  return `${range.base}..${range.candidate} (resolved ${resolvedBase}..${resolvedCandidate})`;
}

// -------------------------------------------------------------------- entry

export function checkDocReconciliation({ root = DEFAULT_ROOT, base, candidate } = {}) {
  if (!base || !candidate) {
    return {
      ok: false,
      findings: ["USAGE-ERROR -- both --base <ref> and --candidate <ref> are required; there is no default range."],
      range: null,
      coverage: null,
    };
  }

  const findings = [];
  const baseSha = gitRevParse(root, base);
  const candidateSha = gitRevParse(root, candidate);
  const range = { base, candidate, baseSha, candidateSha };

  if (baseSha === null || candidateSha === null) {
    const which = baseSha === null ? `base "${base}"` : `candidate "${candidate}"`;
    findings.push(`GIT-REF-ERROR ${formatRange(range)} -- could not resolve ${which} to a commit`);
    return { ok: false, findings, range, coverage: null };
  }

  const diffResult = gitDiffNameOnly(root, baseSha, candidateSha);
  if (!diffResult.ok) {
    findings.push(`GIT-DIFF-ERROR ${formatRange(range)} -- git diff --name-only failed: ${diffResult.error}`);
    return { ok: false, findings, range, coverage: null };
  }
  const changedPaths = diffResult.paths;

  const { files: adrFiles, error: listError } = listAdrFiles(root);
  if (listError) {
    findings.push(`READ-ERROR ${ADR_DIR_REL}:1 -- could not read the directory (${listError.code ?? listError.message})`);
    return { ok: false, findings, range, coverage: null };
  }

  const lsResult = gitLsFiles(root);
  if (!lsResult.ok) {
    findings.push(`GIT-LS-FILES-ERROR ${formatRange(range)} -- git ls-files failed: ${lsResult.error}`);
    return { ok: false, findings, range, coverage: null };
  }
  const trackedFiles = lsResult.files;

  let adrsWithGoverns = 0;
  const implicated = [];
  for (const file of adrFiles) {
    const raw = readRaw(file.path);
    const parsed = parseGovernsGlobs(raw);
    if (parsed === null) continue; // no Governs line -- counted below, never enforced
    adrsWithGoverns += 1;
    const line = lineOf(raw, parsed.offset);

    for (const glob of parsed.globs) {
      const matchesAnyTracked = trackedFiles.some((tracked) => globMatches(glob, tracked));
      if (!matchesAnyTracked) {
        findings.push(`ORPHAN-GOVERNS-GLOB ${file.name}:${line} -- glob "${glob}" matches no tracked file`);
      }
    }

    const matchedPaths = changedPaths.filter((path) => parsed.globs.some((glob) => globMatches(glob, path)));
    if (matchedPaths.length > 0) implicated.push({ file: file.name, number: file.number, line, matchedPaths });
  }

  let recordText = null;
  let recordReadError = null;
  try {
    recordText = readRaw(join(root, RECORD_REL));
  } catch (error) {
    recordReadError = error;
  }

  let satisfied = new Set();
  if (recordText !== null) {
    const section = findCandidateSection(recordText, candidateSha);
    if (section !== null) satisfied = parseReconciliationEntries(section, recordText, candidateSha, findings);
  } else if (implicated.length > 0) {
    findings.push(
      `RECORD-READ-ERROR ${RECORD_REL}:1 -- could not read the reconciliation record ` +
      `(${recordReadError?.code ?? recordReadError?.message}); ${implicated.length} implicated ADR(s) cannot be shown reconciled`,
    );
  }

  const unreconciled = [];
  for (const item of implicated) {
    if (satisfied.has(item.number)) continue;
    unreconciled.push(item);
    const quotedPaths = item.matchedPaths.map((path) => `"${path}"`).join(", ");
    findings.push(
      `UNRECONCILED-ADR ${item.file}:${item.line} -- implicated by changed path(s) ${quotedPaths} but has no reconciliation ` +
      `record entry for candidate ${candidateSha} in ${RECORD_REL}`,
    );
  }

  const coverage = {
    changedPathCount: changedPaths.length,
    adrsScanned: adrFiles.length,
    adrsWithGoverns,
    implicatedCount: implicated.length,
    unreconciledCount: unreconciled.length,
  };

  return { ok: findings.length === 0, findings, range, coverage };
}

/**
 * The success line. States what was measured AND what this check does not
 * cover (QG-05, guardrails/quality-gates.md) -- see module header, "WHAT
 * THIS CHECK CANNOT DO".
 */
export function successLine({ range, coverage }) {
  return [
    `Doc reconciliation: range ${formatRange(range)} -- ${coverage.changedPathCount} changed path(s), ` +
      `${coverage.adrsWithGoverns}/${coverage.adrsScanned} ADRs carry a Governs: line, ` +
      `${coverage.implicatedCount} implicated by this range, all reconciled.`,
    "NOT checked: whether anyone actually looked -- this check makes omission impossible, it does not make diligence certain; " +
      "a \"checked, no change needed\" entry is accepted on its stated shape alone, never on the quality of the reasoning behind it. " +
      "It covers docs/adr/ only, never any other documentation (specs/, backlog/, guardrails/, roles/, templates/, or prose that " +
      "carries no Governs: line).",
  ].join(" ");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const argv = process.argv.slice(2);
  const argVal = (flag) => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  const rootArg = argVal("--root");
  const root = rootArg ? resolve(rootArg) : DEFAULT_ROOT;
  const base = argVal("--base");
  const candidate = argVal("--candidate");

  if (!base || !candidate) {
    console.error("USAGE: check-doc-reconciliation.mjs --base <ref> --candidate <ref> [--root <dir>]");
    console.error("Both --base and --candidate are required; there is no default range.");
    process.exit(2);
  }

  const result = checkDocReconciliation({ root, base, candidate });
  if (result.ok) {
    console.log(successLine(result));
    process.exit(0);
  }
  for (const finding of result.findings) console.error(finding);
  const rangeText = result.range ? formatRange(result.range) : `${base}..${candidate} (unresolved)`;
  console.error(`Doc reconciliation check failed: ${result.findings.length} finding(s) over range ${rangeText}.`);
  process.exit(2);
}
