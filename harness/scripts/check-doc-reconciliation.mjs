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
 * THREE THINGS ABOUT WHERE BYTES COME FROM, STATED PLAINLY (F1 fix,
 * 2026-08-09 — this replaces an earlier version of this module that read
 * both inputs below from the filesystem, and an earlier draft of THIS fix
 * that tried to read the record from the candidate commit too; both were
 * wrong, for two different reasons, below):
 *
 *   (i) ADR bodies and their `Governs:` lines are read from the CANDIDATE
 *   commit. `git show <candidateSha>:<path>` for content, `git ls-tree -r
 *   --name-only <candidateSha> -- docs/adr` for the file list, never
 *   `readdirSync`/`readFileSync` against the working tree. There is no
 *   self-reference problem here: an ADR's declaration of what it governs is
 *   independent of the reconciliation record, so it can legitimately be part
 *   of the exact commit being measured.
 *
 *   (ii) The reconciliation record is read from `--record-ref <ref>`
 *   (optional, defaults to `HEAD`) via `git show <recordRefSha>:docs/doc-
 *   reconciliation.md` — a SEPARATE ref from `candidate`, on purpose, never
 *   the working tree. A record naming candidate X cannot live INSIDE X: the
 *   record's bytes are part of X's tree, so writing them changes the tree,
 *   which changes X's own commit hash — arithmetic, not a bug in the record
 *   format. That is exactly why the record's own write-order rule
 *   (docs/doc-reconciliation.md) already says the record is committed LAST
 *   and names the tip of the substantive work rather than itself. So "in a
 *   commit" is the requirement this fix enforces, not "in the candidate
 *   commit" — the two are different refs by construction, and `--record-ref`
 *   makes that explicit instead of silently assuming HEAD.
 *
 *   (iii) `--record-ref` MUST resolve to a real commit, or that is
 *   RECORD-REF-ERROR (a hard failure, same posture as an unresolved `--base`/
 *   `--candidate`). `--record-ref` MUST have `candidate` as an ancestor of
 *   itself (or equal to it) — `git merge-base --is-ancestor <candidate>
 *   <recordRefSha>` — or a record found there is RECORD-UNAVAILABLE and not
 *   honoured: a ref that does not descend from the candidate cannot
 *   truthfully describe it (the same "a record for one commit must not
 *   answer for another" property "STALE-PROOF BY CONSTRUCTION" below
 *   describes for heading text, extended to the ref itself). Once that
 *   ancestry holds, a record-ref whose tree carries no
 *   `docs/doc-reconciliation.md` at all is ALSO RECORD-UNAVAILABLE, never
 *   silently treated as an empty/zero-entry record — the two are different
 *   claims ("nothing was written yet" vs "something was written and read")
 *   and this module never blurs them into one. RECORD-UNAVAILABLE is only a
 *   FINDING when something is actually implicated (module header, "Exit 0");
 *   with nothing implicated there is nothing for an unreadable record to
 *   fail to cover. This module deliberately never compares the record file's
 *   state AT `candidate` against its state at `--record-ref` — the record's
 *   only source of truth is `--record-ref`; whatever (if anything) happens
 *   to live at that path in `candidate`'s own tree is never read and never
 *   compared, in either direction.
 *
 * The changed-path set (`git diff <base>..<candidate>`) is, by design, about
 * the RANGE rather than either single commit's content, and stays as it was.
 * The "matches no tracked file" half of ORPHAN-GOVERNS-GLOB (`git ls-files`)
 * also stays as it was — documented below as a static corpus property,
 * independent of any range or ref, not a per-candidate claim. Before this
 * fix, a record written but never committed, or a `Governs:` line deleted
 * only in the working tree, could change this check's verdict without either
 * edit ever reaching a commit at all — the accusation side (`git diff`) was
 * commit-bound and the exoneration side (record, ADR bodies) was not.
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
 * "AMENDED IN <commit>" IS RESOLVED, NOT TAKEN ON FAITH (F2 fix, 2026-08-09).
 * The cited ref must (a) resolve to a real commit (`git rev-parse --verify
 * <cited>^{commit}`), (b) be an ancestor of, or equal to, the CANDIDATE
 * commit (`git merge-base --is-ancestor <cited> <candidate>` — this is about
 * the governed change the citation claims to answer for, which is the
 * candidate, not about where the record entry's bytes happen to live), and
 * (c) itself touch the exact ADR file it is cited for (`git show --name-only
 * <cited>` includes that path). A cited commit predating `--base` is
 * accepted (the ADR may have been legitimately amended before this range
 * began, and the record is simply stating that truthfully) — nothing here
 * requires the citation to fall inside `[base, candidate]`, only inside the
 * candidate's ancestry. A cited commit that fails any of (a)-(c) is
 * UNRESOLVED-AMENDMENT, reported and NOT honoured, same posture as
 * MALFORMED-RECORD-ENTRY.
 *
 * STALE-PROOF BY CONSTRUCTION, NOT BY A SPECIAL CASE. A record entry is only
 * ever read from the section whose heading names the RESOLVED candidate SHA
 * being checked right now, out of the content `git show <record-ref>:...`
 * returns for that ref — never the candidate's own tree, never the working
 * tree (see "THREE THINGS ABOUT WHERE BYTES COME FROM" above for why those
 * are different refs by construction). An entry for ADR-0012 that exists
 * only under a `## Candidate <some other sha>` heading is invisible to this
 * run — not filtered out, never looked at in the first place. That is the
 * whole mechanism that makes a stale record fail: there is no code path that
 * lets a record for one commit answer for another, AND no code path that
 * lets an uncommitted edit (to the record, or to an ADR's `Governs:` line)
 * answer for any commit at all.
 *
 * WHAT THIS CHECK CANNOT DO, STATED HERE ONCE. It makes OMISSION impossible
 * (an implicated ADR with no matching record entry is a hard finding); it
 * cannot make DILIGENCE certain (a `checked, no change needed` line, or a
 * resolved `amended in <commit>` line, is accepted on its stated shape once
 * that shape resolves — nothing here judges whether the change was actually
 * looked at, or looked at well, or whether a cited amendment actually
 * addressed the governed change correctly). It covers `docs/adr/` only,
 * never any other documentation (specs/, backlog/, guardrails/, roles/,
 * templates/, or prose without a `Governs:` line).
 *
 * Exit 0: every ADR implicated by the measured range has a record entry (or
 * there are none). Exit 2: at least one finding (unreconciled ADR, malformed
 * record entry, an unresolved "amended in" citation, an unresolved
 * `--record-ref` (RECORD-REF-ERROR) or a `--record-ref` whose record could
 * not be used for this candidate (RECORD-UNAVAILABLE), or a Governs glob
 * that matches no tracked file — this last class is a static corpus defect
 * and fires independently of any range, and still measured against `git
 * ls-files`/the working tree, not any commit — see "THREE THINGS ABOUT WHERE
 * BYTES COME FROM" above). `--root <dir>` resolves the ADR corpus, the git
 * range, and `--record-ref` against another checkout, the same convention
 * check-adr-consistency.mjs uses for its falsifiability fixtures.
 */
import { spawnSync } from "node:child_process";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = resolve(HERE, "..", "..");
export const ADR_DIR_REL = join("docs", "adr");
export const RECORD_REL = join("docs", "doc-reconciliation.md");

const ADR_FILENAME_RE = /^(\d{4})-.+\.md$/;
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

/** git wants forward-slash pathspecs on every platform; `join()`-built repo-
 *  relative constants use the host separator, so this is the one place that
 *  translates before a path reaches `spawnSync("git", ...)`. */
function toPosixPath(relPath) {
  return relPath.split(sep).join("/");
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
 *
 * `resolveAmended`, if given, is called as `resolveAmended(number, citedRef)`
 * for every `amended in <ref>` body and must return `{ ok, reason }` (F2 fix,
 * module header "AMENDED IN <commit> IS RESOLVED"); a rejection is reported
 * as UNRESOLVED-AMENDMENT and does NOT satisfy the ADR. Omitting it (no
 * caller does today) falls back to the pre-fix "shape alone" behaviour, kept
 * only so this function stays independently testable without a live repo.
 */
export function parseReconciliationEntries(section, fullRawText, candidateSha, findings, resolveAmended) {
  const satisfied = new Set();
  const re = new RegExp(ENTRY_RE.source, "gm");
  let match;
  while ((match = re.exec(section.text)) !== null) {
    const number = match[1];
    const body = match[2];
    const line = lineOf(fullRawText, section.startOffset + match.index);
    if (CHECKED_BODY_RE.test(body)) {
      satisfied.add(number);
      continue;
    }
    const amendedMatch = AMENDED_BODY_RE.exec(body);
    if (amendedMatch !== null) {
      const citedRef = amendedMatch[1];
      const resolution = resolveAmended ? resolveAmended(number, citedRef) : { ok: true };
      if (resolution.ok) {
        satisfied.add(number);
      } else {
        findings.push(
          `UNRESOLVED-AMENDMENT ${RECORD_REL}:${line} -- entry for ADR-${number} under candidate ${candidateSha} cites ` +
          `"amended in ${citedRef}" but ${resolution.reason}`,
        );
      }
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

/** Unlike `gitRevParse`, verifies `ref` names an OBJECT THAT ACTUALLY EXISTS
 *  and is a commit -- `git rev-parse <ref>` alone happily echoes back a
 *  syntactically 40-hex string that names no real object (measured: exit 0,
 *  no stderr), so F2's "does it exist" half needs `--verify ...^{commit}`,
 *  not the plain form the range args use. */
function gitVerifyCommit(root, ref) {
  const result = spawnSync("git", ["rev-parse", "--verify", `${ref}^{commit}`], { cwd: root, encoding: "utf8", shell: false });
  if (result.status !== 0) return null;
  const sha = result.stdout.trim();
  return SHA_RE.test(sha) ? sha : null;
}

/** Content of `<path>` as it exists in commit `sha`'s own tree -- never the
 *  working tree (F1 fix). `notFound: true` distinguishes "this commit's tree
 *  has no such path" (an ordinary, expected case for a missing record) from
 *  any other git failure. */
function gitShowFile(root, sha, relPath) {
  const result = spawnSync("git", ["show", `${sha}:${toPosixPath(relPath)}`], { cwd: root, encoding: "utf8", shell: false });
  if (result.status === 0) return { ok: true, text: result.stdout, notFound: false, error: null };
  const stderr = (result.stderr ?? "").trim();
  const notFound = /does not exist in|exists on disk, but not in/i.test(stderr);
  return { ok: false, text: null, notFound, error: notFound ? null : (stderr || `git exited ${result.status}`) };
}

/** Every path under `relDir` in commit `sha`'s own tree (F1 fix) -- the
 *  candidate-bound counterpart of `readdirSync`. An empty result is not
 *  itself an error (e.g. the directory did not exist yet at this commit);
 *  a real git failure is reported separately via `ok: false`. */
function gitLsTreeFiles(root, sha, relDir) {
  const result = spawnSync("git", ["ls-tree", "-r", "--name-only", sha, "--", toPosixPath(relDir)], { cwd: root, encoding: "utf8", shell: false });
  if (result.status !== 0) return { ok: false, paths: [], error: (result.stderr ?? "").trim() || `git exited ${result.status}` };
  const paths = result.stdout.split("\n").map((line) => line.trim()).filter((line) => line !== "");
  return { ok: true, paths, error: null };
}

/** Every `docs/adr/*.md` file (README excluded) named in a `git ls-tree`
 *  path list, in the same shape `listAdrFiles` (check-adr-consistency.mjs)
 *  returns for the working tree -- `relPath` is the git-relative path used
 *  to `git show` this file's content and to check what a cited commit
 *  touched (F2). */
function parseAdrTreePaths(paths) {
  const files = [];
  for (const relPath of paths) {
    const name = relPath.split("/").pop();
    if (name === "README.md") continue;
    const m = ADR_FILENAME_RE.exec(name);
    if (!m) continue;
    files.push({ name, number: m[1], relPath });
  }
  files.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return files;
}

/**
 * F2: resolves an `amended in <citedRef>` citation. `adrRelPath` is the path
 * (in the candidate's own tree) of the ADR the entry is FOR; `undefined`
 * means that ADR number is not part of the candidate's own `docs/adr/`
 * listing at all. See module header, "AMENDED IN <commit> IS RESOLVED", for
 * the three conditions and the "outside the measured range" decision.
 */
export function resolveAmendedCommit(root, citedRef, candidateSha, adrRelPath) {
  if (adrRelPath === undefined) {
    return { ok: false, reason: "the ADR it names is not part of the candidate's own docs/adr/ tree" };
  }
  const resolved = gitVerifyCommit(root, citedRef);
  if (resolved === null) {
    return { ok: false, reason: "does not resolve to a real commit" };
  }
  const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", resolved, candidateSha], { cwd: root, encoding: "utf8", shell: false });
  if (ancestor.status !== 0) {
    return { ok: false, reason: `resolves to ${resolved}, which is not an ancestor of (or equal to) candidate ${candidateSha}` };
  }
  const touched = spawnSync("git", ["show", "--name-only", "--format=", resolved], { cwd: root, encoding: "utf8", shell: false });
  if (touched.status !== 0) {
    return { ok: false, reason: `resolves to ${resolved}, but its changed-file list could not be read` };
  }
  const touchedPaths = touched.stdout.split("\n").map((line) => line.trim()).filter((line) => line !== "");
  if (!touchedPaths.includes(adrRelPath)) {
    return { ok: false, reason: `resolves to ${resolved}, which does not touch ${adrRelPath}` };
  }
  return { ok: true };
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
 *  where one was reached. Includes `--record-ref` when the caller supplied
 *  one on `range` (F1 fix) -- the record's provenance is now a second
 *  decisive input, not a footnote, so it is named alongside base/candidate
 *  rather than only inside individual RECORD-* findings. Callers that never
 *  attempted to resolve it (`range.recordRef === undefined`, e.g. a
 *  --base/--candidate GIT-REF-ERROR reported before recordRef was even
 *  looked at) print the base/candidate range alone. */
export function formatRange(range) {
  const resolvedBase = range.baseSha ?? "<unresolved>";
  const resolvedCandidate = range.candidateSha ?? "<unresolved>";
  const baseText = `${range.base}..${range.candidate} (resolved ${resolvedBase}..${resolvedCandidate})`;
  if (range.recordRef === undefined) return baseText;
  const resolvedRecordRef = range.recordRefSha ?? "<unresolved>";
  return `${baseText}, record-ref ${range.recordRef} (resolved ${resolvedRecordRef})`;
}

// -------------------------------------------------------------------- entry

/** `--record-ref` default (module header, point (ii)): the record cannot
 *  live inside `candidate` itself, so it needs a ref of its own; `HEAD`
 *  matches how this check has always been run manually, without requiring
 *  the caller to name a ref for the common case. */
export const DEFAULT_RECORD_REF = "HEAD";

export function checkDocReconciliation({ root = DEFAULT_ROOT, base, candidate, recordRef = DEFAULT_RECORD_REF } = {}) {
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
  const range = { base, candidate, baseSha, candidateSha, recordRef, recordRefSha: undefined };

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

  // ADR file LIST and every ADR body are read out of the candidate commit's
  // own tree, never the working tree (F1 fix; module header, "THREE THINGS
  // ABOUT WHERE BYTES COME FROM", point (i)).
  const adrListResult = gitLsTreeFiles(root, candidateSha, ADR_DIR_REL);
  if (!adrListResult.ok) {
    findings.push(`GIT-LS-TREE-ERROR ${formatRange(range)} -- git ls-tree failed listing ${ADR_DIR_REL} at candidate ${candidateSha}: ${adrListResult.error}`);
    return { ok: false, findings, range, coverage: null };
  }
  const adrFiles = parseAdrTreePaths(adrListResult.paths);

  const lsResult = gitLsFiles(root);
  if (!lsResult.ok) {
    findings.push(`GIT-LS-FILES-ERROR ${formatRange(range)} -- git ls-files failed: ${lsResult.error}`);
    return { ok: false, findings, range, coverage: null };
  }
  const trackedFiles = lsResult.files;

  let adrsWithGoverns = 0;
  const implicated = [];
  const adrRelPathByNumber = new Map();
  for (const file of adrFiles) {
    adrRelPathByNumber.set(file.number, file.relPath);
    const show = gitShowFile(root, candidateSha, file.relPath);
    if (!show.ok) {
      findings.push(`GIT-SHOW-ERROR ${file.name}:1 -- could not read ${file.relPath} at candidate ${candidateSha} (${show.error ?? "not found"})`);
      continue;
    }
    const raw = show.text;
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

  // The record is read from --record-ref, a SEPARATE ref from `candidate`
  // (module header, point (ii)/(iii)) -- never from candidate's own tree,
  // never from the working tree. An unresolvable ref is a hard failure, same
  // posture as --base/--candidate.
  const recordRefSha = gitVerifyCommit(root, recordRef);
  range.recordRefSha = recordRefSha;
  if (recordRefSha === null) {
    findings.push(`RECORD-REF-ERROR ${formatRange(range)} -- could not resolve --record-ref "${recordRef}" to a commit`);
    return { ok: false, findings, range, coverage: null };
  }

  let recordText = null;
  let recordUnavailableReason = null;
  const recordRefAncestry = spawnSync("git", ["merge-base", "--is-ancestor", candidateSha, recordRefSha], { cwd: root, encoding: "utf8", shell: false });
  if (recordRefAncestry.status !== 0) {
    // candidate is NOT an ancestor of (or equal to) --record-ref: a record
    // living there cannot truthfully describe this candidate (module header,
    // point (iii)) -- treated as unavailable, not read at all.
    recordUnavailableReason = `--record-ref "${recordRef}" (resolved ${recordRefSha}) does not have candidate ${candidateSha} as an ancestor; a record there cannot describe this candidate`;
  } else {
    const recordShow = gitShowFile(root, recordRefSha, RECORD_REL);
    if (recordShow.ok) {
      recordText = recordShow.text;
    } else if (recordShow.notFound) {
      recordUnavailableReason = `${RECORD_REL} does not exist at --record-ref "${recordRef}" (resolved ${recordRefSha})`;
    } else {
      recordUnavailableReason = `could not read the reconciliation record at --record-ref "${recordRef}" (resolved ${recordRefSha}): ${recordShow.error}`;
    }
  }
  // recordText === null with implicated.length === 0: fine, nothing needed
  // a record in the first place (module header, "Exit 0"). Never silently
  // treated as an empty/zero-entry record when something WAS implicated --
  // that becomes a RECORD-UNAVAILABLE finding below instead.

  let satisfied = new Set();
  if (recordText !== null) {
    const section = findCandidateSection(recordText, candidateSha);
    if (section !== null) {
      satisfied = parseReconciliationEntries(
        section,
        recordText,
        candidateSha,
        findings,
        (number, citedRef) => resolveAmendedCommit(root, citedRef, candidateSha, adrRelPathByNumber.get(number)),
      );
    }
  } else if (implicated.length > 0) {
    findings.push(
      `RECORD-UNAVAILABLE ${RECORD_REL}:1 -- ${recordUnavailableReason}; ${implicated.length} implicated ADR(s) cannot be shown reconciled`,
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
      "a \"checked, no change needed\" entry is accepted on its stated shape alone, never on the quality of the reasoning behind it; " +
      "a resolved \"amended in <commit>\" entry only proves the cited commit is real, an ancestor of the candidate, and that it " +
      "touched the named ADR file -- not that the amendment addressed the governed change correctly. ADR bodies and Governs: lines " +
      "are read from the candidate commit itself; the reconciliation record is read from --record-ref (a separate ref from " +
      "candidate, by construction -- see module header) -- never from the working tree, either way. It covers docs/adr/ only, " +
      "never any other documentation (specs/, backlog/, guardrails/, roles/, templates/, or prose that carries no Governs: line).",
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
  const recordRef = argVal("--record-ref") ?? DEFAULT_RECORD_REF;

  if (!base || !candidate) {
    console.error("USAGE: check-doc-reconciliation.mjs --base <ref> --candidate <ref> [--record-ref <ref>] [--root <dir>]");
    console.error("Both --base and --candidate are required; there is no default range. --record-ref defaults to HEAD.");
    process.exit(2);
  }

  const result = checkDocReconciliation({ root, base, candidate, recordRef });
  if (result.ok) {
    console.log(successLine(result));
    process.exit(0);
  }
  for (const finding of result.findings) console.error(finding);
  const rangeText = result.range ? formatRange(result.range) : `${base}..${candidate} (unresolved)`;
  console.error(`Doc reconciliation check failed: ${result.findings.length} finding(s) over range ${rangeText}.`);
  process.exit(2);
}
