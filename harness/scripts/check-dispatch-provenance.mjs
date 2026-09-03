#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * check-dispatch-provenance.mjs — A-AC-08 ("WHEN delivered work originated
 * from a dispatch, THE SYSTEM SHALL retain a matching public-safe dispatch
 * reference and detect missing required provenance.", specs/sprint-phoenix-
 * epic/acceptance.md).
 *
 * MECHANISM. `--base <ref> --candidate <ref>`, BOTH REQUIRED, no defaults
 * (same convention as check-doc-reconciliation.mjs). For every commit in the
 * exclusive range `git log --format=%H <base>..<candidate>`:
 *   1. Read the commit's own diff (`git diff-tree --no-commit-id --numstat
 *      -r --root <sha>`) — never the working tree, never an aggregate range
 *      diff: this check is per-commit because the stage-0 exemption's caps
 *      (below) are a per-commit property, not a range property.
 *   2. If every changed path starts with `docs/` or `scratch/` (this
 *      module's own file-type filter — see "FILE-TYPE FILTER" below), the
 *      commit is skipped entirely: not examined, not a finding either way.
 *   3. Otherwise the commit's message (`git log -1 --format=%B <sha>`) must
 *      carry a valid `Dispatch: <TASK_ID> (goldfish|critic)` trailer line,
 *      OR qualify for the conservative stage-0 exemption defined below.
 *      Anything else is `MISSING-DISPATCH-PROVENANCE`.
 *
 * THE STAGE-0 EXEMPTION (design decision, briefing WP-A-AC08, 2026-08-09 —
 * resolves a prior stop on whether EL-01's stage-0 fast-path exemption
 * (roles/elephant.md, EL-01) can be auto-detected from commit metadata
 * alone). A commit is a recognized exemption ONLY if BOTH hold:
 *   (a) its message contains a case-insensitive match for the phrase
 *       "stage-0 fast path" — the self-declaration phrasing every real
 *       stage-0 commit in this repo has used to date (verified against
 *       a54f53b1, bf6abb76, 4a7a750f, 8b8181639, 034ce1d2, 14743192 via
 *       `git log --all --grep="stage-0 fast path" -i`); AND
 *   (b) the commit's own diff independently satisfies EL-01's two
 *       MECHANICALLY-CHECKABLE caps: at most `STAGE0_MAX_FILES` files
 *       changed, at most `STAGE0_MAX_LINES` changed lines (additions +
 *       deletions, summed over every changed file in the commit — not just
 *       the "source" subset (b) is checked against). EL-01's own text says
 *       "≤ 2 files, ≤ ~25 diff lines"; the "~" has no more precise number
 *       anywhere in that text, so this module treats 25 as the literal
 *       upper bound for a mechanical yes/no check (see STAGE0_MAX_LINES).
 * A commit whose message contains the phrase but which FAILS the mechanical
 * caps is NOT treated as exempt — it is `MISSING-DISPATCH-PROVENANCE` with
 * `reason=stage0-claim-caps-exceeded`, a reason string distinct from a bare
 * missing trailer: either a false self-declaration or a caps violation,
 * either way worth a human look. A malformed `Dispatch:` line (present but
 * not matching the required shape — e.g. no `(goldfish)`/`(critic)` suffix,
 * or an empty TASK_ID) is ALWAYS flagged (`reason=malformed-trailer`),
 * regardless of the phrase — a broken trailer is never rescued by a
 * self-declaration found elsewhere in the same message.
 *
 * FILE-TYPE FILTER (this module's own design choice, not a canonical
 * taxonomy — stated and justified here because nothing upstream defines
 * one). A commit is examined only if at least one changed path does NOT
 * start with `docs/` or `scratch/`. Rationale: a commit that only touches
 * documentation or scratch/working artifacts is not "delivered work" in the
 * A-AC-08 sense this check enforces provenance for; excluding those two
 * prefixes is a conservative default, not an exhaustive process-artifact
 * taxonomy (specs/, backlog/, guardrails/, roles/, templates/ etc. are all
 * still treated as "source" here and DO require provenance — a deliberate,
 * documented choice: those directories carry the Pipeline's own governed
 * deliverables, not merely process bookkeeping).
 *
 * WHAT THIS CHECK CANNOT DO, STATED HERE ONCE (same posture check-doc-
 * reconciliation.mjs takes toward its own limitations).
 *   - It CANNOT verify EL-01's semantic criteria: no architecture/schema/
 *     public-API/test/guardrail-hook-CI/dependency/security-surface change.
 *     None of those are mechanically checkable from a diff alone.
 *   - It CANNOT verify the "risk flag" EL-01 names as a stage-0
 *     disqualifier — EL-01 nowhere defines a location or format for it in
 *     this repo, so there is nothing for this module to read.
 *   - The "stage-0 fast path" phrase match is a SELF-DECLARATION read from
 *     commit prose, never independent proof that the commit truly meets
 *     EL-01's full definition — only the two mechanical caps above are
 *     independently checked; a commit could satisfy the phrase and the caps
 *     while still violating a semantic criterion this module cannot see.
 *   - A `Dispatch:` trailer is validated on its SHAPE only
 *     (`<TASK_ID> (goldfish|critic)`), never against a real task registry —
 *     a syntactically valid trailer citing a nonexistent task ID passes.
 *   - A merge commit shows NO per-file diff to this check: `git diff-tree`
 *     without `-m`/`-c` emits nothing for a merge commit by design, and
 *     this module deliberately does not pass either flag. A merge commit is
 *     therefore silently out of scope for this check on its own account —
 *     the commits it merged are still examined individually if they are
 *     themselves present in the given range.
 *   - Rename detection is not requested (`-M` is not passed to
 *     `diff-tree --numstat`); a rename shows as a delete + an add of the
 *     full file, which is the more conservative (larger) count for the
 *     stage-0 caps, never the more lenient one.
 *   - `DISPATCH_LINE_RE` matches `/^Dispatch:[ \t]*(.*)$/m` ANYWHERE in the
 *     message, not git's own trailer block (contrast
 *     `dispatch-authorship-verify.mjs`'s `parseTrailerBlock`, which walks
 *     backward from the last non-blank line and stops at the first line that
 *     is not `Key: value` shaped). This cuts both ways and neither is fixed
 *     here — doing so would change an EXISTING finding class's behaviour,
 *     which this briefing forbids: (a) a trailer block separated from the
 *     body by a blank line — invisible to git's own
 *     `%(trailers:only=true,unfold=true)`, see `backlog/items/2026-09-01-
 *     every-stage-0-commit-loses-its-assistance-marker-to-a-blank-line.md` —
 *     is STILL FOUND by this module, unlike by git itself; (b) a `Dispatch:`
 *     line appearing in ordinary body prose, never intended as a trailer, is
 *     ACCEPTED by this module as if it were one.
 *
 * DISPATCH-RECORD SHAPE (briefing NVA-B-RECSHAPE-1; `templates/prompts/
 * agent-obligations.md` §6, the entailment a `Dispatch: <TASK_ID> (goldfish|
 * critic)` trailer states in bold: the record must exist, its `outcome` must
 * be terminal, and its `report.changedFiles` must cover the commit's own
 * changed paths). Every commit that reaches a VALID trailer above — so
 * already past the file-type filter and never a stage-0-exempt commit, which
 * carries no trailer and therefore no task id to resolve a record for — is
 * ALSO checked against its named record, ONE finding class per §6 condition:
 *
 *   - `DISPATCH-RECORD-MISSING` — `reason=record-absent` (no
 *     `evidence/dispatch-record-<TASK_ID>.json`), `reason=record-unreadable`
 *     (exists but is not parseable JSON), or `reason=taskid-unsafe` (the
 *     trailer's id is not a safe filename fragment, so no path is even
 *     attempted — mirrors `isSafeTaskId` in dispatch-authorship-verify.mjs).
 *   - `DISPATCH-RECORD-NOT-TERMINAL` — the record exists but `outcome` is
 *     one of `NON_TERMINAL_OUTCOMES` (`isTerminalOutcome`, imported).
 *   - `DISPATCH-RECORD-PATHS-UNCOVERED` — `reason=changedfiles-absent` (no
 *     machine-readable `report.changedFiles` at all — `declaredPaths` returns
 *     null) or `reason=changedfiles-incomplete` (declared, but at least one
 *     of the commit's OWN changed paths — the same per-commit numstat list
 *     the stage-0 caps are checked against, never an aggregate range diff —
 *     is not covered by `coveringPath`, an exact match or a declared
 *     directory-prefix match, never a basename match).
 *
 * All three conditions are checked independently once a record is found (a
 * record can be simultaneously non-terminal AND incomplete; both findings are
 * reported), so `checkDispatchProvenance` returns them in a SEPARATE
 * `recordShapeFindings` array — deliberately never merged into `findings`.
 * **THESE FINDINGS ARE REPORTED, NOT FATAL.** They do not affect `ok` or the
 * exit code (`pipeline.dispatch-record-shape-is-fatal`, near the `ok:` line
 * below, names the precondition for flipping that — a precondition already
 * known NOT to hold today: `evidence/` is gitignored, so this check applied
 * in CI or a fresh checkout finds ZERO records for every trailer-bearing
 * commit, unconditionally, independent of corpus quality).
 *
 * `evidenceDir` (default `DEFAULT_EVIDENCE_DIR`, imported) is resolved from
 * THIS PLUGIN'S OWN FILE LOCATION, never from `--root`/`root` — a `--root
 * <other-checkout>` run still reads THIS repository's `evidence/` directory.
 * Test fixtures therefore pass `evidenceDir` explicitly rather than relying
 * on the default, which points at nothing meaningful for a throwaway root.
 *
 * Exit 0: every commit touching a tracked source file (per the filter
 * above) in the given range carries either a valid `Dispatch:` trailer or a
 * recognized stage-0 exemption. Exit 2: at least one
 * `MISSING-DISPATCH-PROVENANCE` finding, or an infrastructure error
 * (`GIT-REF-ERROR`, `GIT-LOG-ERROR`, `GIT-SHOW-ERROR`, `GIT-DIFF-TREE-ERROR`,
 * `USAGE-ERROR`). A `DISPATCH-RECORD-*` finding never changes the exit code
 * (see above). `--root <dir>` resolves the git range against another
 * checkout (test-fixture convention, matches check-doc-reconciliation.mjs).
 *
 * Read-only: this module only inspects git history via `git log`/`git
 * diff-tree`/`git rev-parse`, plus a read of `evidence/dispatch-record-
 * <TASK_ID>.json` for the new check; it never writes, stages, or commits
 * anything.
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Reused, not reimplemented (briefing NVA-B-RECSHAPE-1): `readRecordFile` /
// `DEFAULT_EVIDENCE_DIR` are the one canonical record-path resolution
// (`dispatch-record-<TASK_ID>.json` under `evidence/`); `declaredPaths` /
// `coveringPath` / `isTerminalOutcome` are the SAME "covers" reading the
// existing corpus is already judged by in `dispatch-authorship-verify.mjs`
// (exact-match or declared-directory-prefix, never a basename match). Using a
// second, independently-invented definition of "covers" here would let this
// module and that one disagree about the same commit — read-only import,
// this file is never modified by this module.
import {
  DEFAULT_EVIDENCE_DIR,
  coveringPath,
  declaredPaths,
  isTerminalOutcome,
  readRecordFile,
} from "../../plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = resolve(HERE, "..", "..");

const SHA_RE = /^[0-9a-f]{40}$/;

// ------------------------------------------------------------- file filter

export const EXCLUDED_SOURCE_PREFIXES = ["docs/", "scratch/"];

/** True if at least one path in `paths` is NOT under an excluded prefix
 *  (module header, "FILE-TYPE FILTER"). An empty `paths` list (e.g. a merge
 *  commit's empty diff-tree output) returns false: nothing to examine. */
export function touchesTrackedSource(paths) {
  return paths.some((p) => !EXCLUDED_SOURCE_PREFIXES.some((prefix) => p.startsWith(prefix)));
}

// ----------------------------------------------------------- trailer parsing

const DISPATCH_LINE_RE = /^Dispatch:[ \t]*(.*)$/m;
const DISPATCH_VALUE_RE = /^(\S+)[ \t]+\((goldfish|critic)\)[ \t]*$/;

/**
 * `{ present, valid, taskId, role, raw }` for the FIRST `Dispatch:` line
 * found anywhere in `message` (templates/prompts/goldfish-task.md, field 6 /
 * Final report, defines the canonical trailer shape this validates against).
 * `present: false` means no such line exists at all. `present: true, valid:
 * false` means the line exists but its value does not match
 * `<TASK_ID> (goldfish|critic)` — an empty TASK_ID or a missing role suffix
 * both land here (DoD: "Malformed trailer ... treated as invalid, flagged").
 */
export function parseDispatchTrailer(message) {
  const m = DISPATCH_LINE_RE.exec(message);
  if (m === null) return { present: false, valid: false, taskId: null, role: null, raw: null };
  const raw = m[1].trim();
  const valueMatch = DISPATCH_VALUE_RE.exec(raw);
  if (valueMatch === null) return { present: true, valid: false, taskId: null, role: null, raw };
  return { present: true, valid: true, taskId: valueMatch[1], role: valueMatch[2], raw };
}

// ------------------------------------------------------- stage-0 exemption

const STAGE0_PHRASE_RE = /stage-0 fast path/i;

/** Case-insensitive self-declaration match (module header, "THE STAGE-0
 *  EXEMPTION", condition (a)). */
export function hasStage0Phrase(message) {
  return STAGE0_PHRASE_RE.test(message);
}

// EL-01 (roles/elephant.md): "≤ 2 files, ≤ ~25 diff lines". The "~" has no
// more precise number anywhere in that text; this module treats 25 as the
// literal upper bound for a mechanical yes/no caps check (module header).
export const STAGE0_MAX_FILES = 2;
export const STAGE0_MAX_LINES = 25;

/** `{ filesChanged, linesChanged, withinCaps }` from a commit's own numstat
 *  file list (module header, "THE STAGE-0 EXEMPTION", condition (b)).
 *  `linesChanged` sums additions + deletions over EVERY changed file in the
 *  commit, not only the "source" subset the file-type filter selects — the
 *  caps are a whole-commit-diff property. A binary file (numstat "-\t-")
 *  contributes 0 lines but still counts toward `filesChanged`. */
export function stage0CapsMet(files) {
  const filesChanged = files.length;
  const linesChanged = files.reduce((sum, f) => sum + f.added + f.deleted, 0);
  return {
    filesChanged,
    linesChanged,
    withinCaps: filesChanged <= STAGE0_MAX_FILES && linesChanged <= STAGE0_MAX_LINES,
  };
}

// ------------------------------------------------------------------- git IO

function gitResolveCommit(root, ref) {
  const result = spawnSync("git", ["rev-parse", "--verify", `${ref}^{commit}`], { cwd: root, encoding: "utf8", shell: false });
  if (result.status !== 0) return null;
  const sha = result.stdout.trim();
  return SHA_RE.test(sha) ? sha : null;
}

function gitCommitList(root, baseSha, candidateSha) {
  const result = spawnSync("git", ["log", "--format=%H", `${baseSha}..${candidateSha}`], { cwd: root, encoding: "utf8", shell: false });
  if (result.status !== 0) return { ok: false, shas: [], error: (result.stderr ?? "").trim() || `git exited ${result.status}` };
  const shas = result.stdout.split("\n").map((l) => l.trim()).filter((l) => l !== "");
  return { ok: true, shas, error: null };
}

function gitCommitMessage(root, sha) {
  const result = spawnSync("git", ["log", "-1", "--format=%B", sha], { cwd: root, encoding: "utf8", shell: false });
  if (result.status !== 0) return { ok: false, text: null, error: (result.stderr ?? "").trim() || `git exited ${result.status}` };
  return { ok: true, text: result.stdout, error: null };
}

/** Per-commit numstat, `--root` included so an initial (parentless) commit
 *  in a range is also read correctly (no-op for any other commit); NO
 *  `-m`/`-c`, so a merge commit deliberately yields an empty file list
 *  (module header, "WHAT THIS CHECK CANNOT DO"). NO `-M`, so renames count
 *  as delete+add (module header, same section). */
function gitDiffTreeNumstat(root, sha) {
  const result = spawnSync(
    "git",
    ["diff-tree", "--no-commit-id", "--numstat", "-r", "--root", sha],
    { cwd: root, encoding: "utf8", shell: false },
  );
  if (result.status !== 0) return { ok: false, files: [], error: (result.stderr ?? "").trim() || `git exited ${result.status}` };
  const files = [];
  for (const line of result.stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const parts = trimmed.split("\t");
    if (parts.length < 3) continue;
    const [addedRaw, deletedRaw, ...pathParts] = parts;
    const path = pathParts.join("\t");
    const binary = addedRaw === "-" || deletedRaw === "-";
    files.push({ path, added: binary ? 0 : Number(addedRaw), deleted: binary ? 0 : Number(deletedRaw), binary });
  }
  return { ok: true, files, error: null };
}

/** The range text this module prints in every failure/usage line — same
 *  posture as check-doc-reconciliation.mjs's formatRange. */
export function formatRange(range) {
  const resolvedBase = range.baseSha ?? "<unresolved>";
  const resolvedCandidate = range.candidateSha ?? "<unresolved>";
  return `${range.base}..${range.candidate} (resolved ${resolvedBase}..${resolvedCandidate})`;
}

// ------------------------------------------------- dispatch-record shape

/**
 * The §6 entailment check for ONE commit that already carries a VALID
 * `Dispatch: <TASK_ID> (goldfish|critic)` trailer (module header,
 * "DISPATCH-RECORD SHAPE"). `commitPaths` is the SAME per-commit numstat
 * path list the caller already computed for the stage-0 caps — this
 * function never re-derives or aggregates a diff of its own (DoD: "judged
 * against the commit's OWN diff, per commit, never an aggregate range
 * diff"). Returns an array of finding strings (zero, one, two, or three —
 * every condition is checked independently; a record can be simultaneously
 * non-terminal AND path-incomplete, and both are reported).
 */
export function checkDispatchRecordShape(sha, taskId, commitPaths, { evidenceDir = DEFAULT_EVIDENCE_DIR } = {}) {
  const findings = [];

  let record;
  try {
    record = readRecordFile(evidenceDir, taskId);
  } catch (error) {
    // `readRecordFile` throws both for an unsafe task id (never attempts a
    // path) and for a record that exists but fails to parse as JSON --
    // distinguished by `reason=` so the two are still greppable apart, even
    // though the briefing's three finding classes fold both into MISSING.
    const reason = /unsafe task id/u.test(error.message) ? "taskid-unsafe" : "record-unreadable";
    findings.push(
      `DISPATCH-RECORD-MISSING ${sha} taskId=${taskId} reason=${reason} -- ${error.message} (reported, not yet ` +
      `fatal: pipeline.dispatch-record-shape-is-fatal)`,
    );
    return findings;
  }
  if (record === null) {
    findings.push(
      `DISPATCH-RECORD-MISSING ${sha} taskId=${taskId} reason=record-absent -- no evidence/dispatch-record-` +
      `${taskId}.json exists (reported, not yet fatal: pipeline.dispatch-record-shape-is-fatal)`,
    );
    return findings;
  }

  if (!isTerminalOutcome(record.outcome)) {
    findings.push(
      `DISPATCH-RECORD-NOT-TERMINAL ${sha} taskId=${taskId} outcome=${JSON.stringify(record.outcome ?? null)} -- ` +
      `expected a terminal outcome; the record still vouches for nothing (reported, not yet fatal: ` +
      `pipeline.dispatch-record-shape-is-fatal)`,
    );
  }

  const declared = declaredPaths(record);
  if (declared === null) {
    findings.push(
      `DISPATCH-RECORD-PATHS-UNCOVERED ${sha} taskId=${taskId} reason=changedfiles-absent -- record declares no ` +
      `machine-readable report.changedFiles (reported, not yet fatal: pipeline.dispatch-record-shape-is-fatal)`,
    );
  } else {
    const uncovered = commitPaths.filter((path) => coveringPath(path, declared) === null);
    if (uncovered.length > 0) {
      findings.push(
        `DISPATCH-RECORD-PATHS-UNCOVERED ${sha} taskId=${taskId} reason=changedfiles-incomplete -- changedFiles ` +
        `does not cover ${uncovered.length} changed path(s): ${uncovered.join(", ")} (reported, not yet fatal: ` +
        `pipeline.dispatch-record-shape-is-fatal)`,
      );
    }
  }

  return findings;
}

// -------------------------------------------------------------------- entry

export function checkDispatchProvenance({ root = DEFAULT_ROOT, base, candidate, evidenceDir = DEFAULT_EVIDENCE_DIR } = {}) {
  if (!base || !candidate) {
    return {
      ok: false,
      findings: ["USAGE-ERROR -- both --base <ref> and --candidate <ref> are required; there is no default range."],
      recordShapeFindings: [],
      range: null,
      coverage: null,
    };
  }

  const findings = [];
  const recordShapeFindings = [];
  const baseSha = gitResolveCommit(root, base);
  const candidateSha = gitResolveCommit(root, candidate);
  const range = { base, candidate, baseSha, candidateSha };

  if (baseSha === null || candidateSha === null) {
    const which = baseSha === null ? `base "${base}"` : `candidate "${candidate}"`;
    findings.push(`GIT-REF-ERROR ${formatRange(range)} -- could not resolve ${which} to a commit`);
    return { ok: false, findings, recordShapeFindings, range, coverage: null };
  }

  const listResult = gitCommitList(root, baseSha, candidateSha);
  if (!listResult.ok) {
    findings.push(`GIT-LOG-ERROR ${formatRange(range)} -- git log failed: ${listResult.error}`);
    return { ok: false, findings, recordShapeFindings, range, coverage: null };
  }

  let commitsTouchingSource = 0;
  let commitsExempt = 0;

  for (const sha of listResult.shas) {
    const statResult = gitDiffTreeNumstat(root, sha);
    if (!statResult.ok) {
      findings.push(`GIT-DIFF-TREE-ERROR ${sha} -- could not read commit diff: ${statResult.error}`);
      continue;
    }
    const paths = statResult.files.map((f) => f.path);
    // A merge commit's empty file list (module header) is indistinguishable
    // from, and treated the same as, a commit that happens to touch
    // nothing: skipped, never examined, never a finding either way.
    if (!touchesTrackedSource(paths)) continue;

    const msgResult = gitCommitMessage(root, sha);
    if (!msgResult.ok) {
      findings.push(`GIT-SHOW-ERROR ${sha} -- could not read commit message: ${msgResult.error}`);
      continue;
    }

    commitsTouchingSource += 1;
    const message = msgResult.text;
    const trailer = parseDispatchTrailer(message);

    if (trailer.present && trailer.valid) {
      // Trailer-level provenance is satisfied; the §6 entailment behind it
      // is a SEPARATE, non-fatal check (module header, "DISPATCH-RECORD
      // SHAPE"). `taskId`/`role` were already restricted to `(goldfish|
      // critic)` by `DISPATCH_VALUE_RE`, so no role gate is needed here.
      recordShapeFindings.push(...checkDispatchRecordShape(sha, trailer.taskId, paths, { evidenceDir }));
      continue; // valid Dispatch: trailer -- OK
    }

    if (trailer.present && !trailer.valid) {
      findings.push(
        `MISSING-DISPATCH-PROVENANCE ${sha} reason=malformed-trailer -- "Dispatch:" line present but does not match ` +
        `"Dispatch: <TASK_ID> (goldfish|critic)": "${trailer.raw}"`,
      );
      continue;
    }

    // No Dispatch: line at all -- the only remaining route is the
    // conservative stage-0 exemption (module header, "THE STAGE-0 EXEMPTION").
    if (!hasStage0Phrase(message)) {
      findings.push(
        `MISSING-DISPATCH-PROVENANCE ${sha} reason=no-trailer-no-exemption -- no "Dispatch:" trailer and no ` +
        `"stage-0 fast path" self-declaration in the commit message`,
      );
      continue;
    }

    const caps = stage0CapsMet(statResult.files);
    if (caps.withinCaps) {
      commitsExempt += 1;
      continue; // recognized stage-0 exemption
    }

    findings.push(
      `MISSING-DISPATCH-PROVENANCE ${sha} reason=stage0-claim-caps-exceeded -- "stage-0 fast path" phrase present but ` +
      `mechanical caps not met (${caps.filesChanged} files / ${caps.linesChanged} changed lines; cap is ` +
      `<=${STAGE0_MAX_FILES} files / <=${STAGE0_MAX_LINES} lines, EL-01); not recognized as an exemption -- either a false ` +
      `self-declaration or a caps violation, either way worth a human look`,
    );
  }

  const coverage = {
    commitsInRange: listResult.shas.length,
    commitsTouchingSource,
    commitsExempt,
    findingCount: findings.length,
    recordShapeFindingCount: recordShapeFindings.length,
  };
  // pipeline.dispatch-record-shape-is-fatal -- TWO PRECONDITIONS, both
  // currently false, mirroring check-backlog-done-predicate.mjs's own
  // "reported, not yet enforced" posture for its UNDECLARED class:
  //   1. `evidence/` must stop being gitignored for a check run in CI or a
  //      fresh checkout to see ANY record at all. Today it does not
  //      (`dispatch-authorship-verify.mjs`'s own LIMITS section says so of
  //      its identical resolution), so folding `recordShapeFindings` into
  //      `ok` today would report `DISPATCH-RECORD-MISSING` for EVERY
  //      trailer-bearing commit in a fresh clone, unconditionally --
  //      regardless of how compliant the corpus actually is. This is not a
  //      corpus-quality question; it is a precondition this checker cannot
  //      satisfy on its own.
  //   2. Once (1) holds, the existing corpus must actually be assessed:
  //      `backlog/items/2026-09-01-half-the-dispatch-records-omit-the-
  //      field-that-binds-them-to-their-commit.md` measured roughly 60 of
  //      ~130 records missing `report.changedFiles` alone: making this
  //      fatal today would break the gate for a backlog nobody has decided
  //      whether to backfill, narrow the template's claim, or both.
  // Neither precondition is this script's to satisfy; this is the flip
  // point, not a place this script changes itself.
  return { ok: findings.length === 0, findings, recordShapeFindings, range, coverage };
}

/**
 * The success line: states what was measured AND names this check's blind
 * spots inline (QG-05 posture, same as check-doc-reconciliation.mjs's
 * successLine) — the full account lives in the module header, "WHAT THIS
 * CHECK CANNOT DO".
 */
export function summaryLine({ range, coverage }) {
  return [
    `Dispatch provenance: range ${formatRange(range)} -- ${coverage.commitsInRange} commit(s) in range, ` +
      `${coverage.commitsTouchingSource} touching a tracked source file (docs/, scratch/ excluded), ` +
      `${coverage.commitsExempt} recognized stage-0 exemption(s), ${coverage.findingCount} finding(s), ` +
      `${coverage.recordShapeFindingCount ?? 0} dispatch-record-shape finding(s) (reported, not yet fatal -- ` +
      `pipeline.dispatch-record-shape-is-fatal).`,
    "WHAT THIS CHECK CANNOT DO: it cannot verify EL-01's semantic criteria (no architecture/schema/public-API/test/" +
      "guardrail-hook-CI/dependency/security-surface change) or the undefined \"risk flag\" EL-01 names but nowhere " +
      "defines a location/format for; the \"stage-0 fast path\" phrase match is a self-declaration read from commit " +
      "prose, not independent proof -- only the two mechanical caps (<=2 files, <=25 changed lines) are independently " +
      "checked. A \"Dispatch:\" trailer is validated on its shape only, never against a real task registry. A merge " +
      "commit shows no per-file diff to this check and is silently out of scope on its own account; the commits it " +
      "merged are still checked individually if present in the range.",
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
    console.error("USAGE: check-dispatch-provenance.mjs --base <ref> --candidate <ref> [--root <dir>]");
    console.error("Both --base and --candidate are required; there is no default range.");
    process.exit(2);
  }

  const result = checkDispatchProvenance({ root, base, candidate });
  // DISPATCH-RECORD-* findings are printed either way (reported, not yet
  // fatal) but never gate `process.exit` -- only `result.findings.length`
  // (the pre-existing, unchanged exit-status source) does that.
  if (result.ok) {
    console.log(summaryLine(result));
    for (const finding of result.recordShapeFindings) console.error(finding);
    process.exit(0);
  }
  for (const finding of result.findings) console.error(finding);
  for (const finding of result.recordShapeFindings) console.error(finding);
  const rangeText = result.range ? formatRange(result.range) : `${base}..${candidate} (unresolved)`;
  console.error(`Dispatch provenance check failed: ${result.findings.length} finding(s) over range ${rangeText}.`);
  process.exit(2);
}
