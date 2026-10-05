// SPDX-License-Identifier: SUL-1.0
// Guard module "path-containment" (layer 0), split out of guard-lifecycle-ready.mjs; declarations moved verbatim (s2-guard-split-plan.md).

import { existsSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export function pathInside(root, target) {
  const rel = relative(root, target);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/**
 * Reject lexical escapes and escapes through an existing symlink ancestor. Shared by
 * isProjectWritePath() (root = this project's own physical root, already realpathed by its
 * caller) and isClaudeSessionMemoryWritePath() (root = this session's own derived memory
 * directory, MEMPATH-1) -- the identical walk, bound to whichever already-real boundary the
 * caller owns.
 */
export function isPathWithinRealpathedRoot(filePath, root, dependencies) {
  if (typeof filePath !== "string" || filePath.trim() === "" || filePath.includes("\0")) return false;
  const exists = dependencies.existsSyncFn ?? existsSync;
  const realpath = dependencies.realpathSyncFn ?? realpathSync;
  const requested = resolve(root, filePath);
  if (!pathInside(root, requested)) return false;
  let ancestor = requested;
  try {
    while (ancestor !== root && !exists(ancestor)) ancestor = dirname(ancestor);
    return pathInside(root, realpath(ancestor));
  } catch {
    return false;
  }
}

export function isProjectWritePath(filePath, root, dependencies = {}) {
  return isPathWithinRealpathedRoot(filePath, root, dependencies);
}

/**
 * NVA-B-READCONTAIN-1 (fix round, F2; corrected round 2, F4/F5). Shared by
 * isApprovedCatPipelineReadPath below and isApprovedSingleCommandReadArg (this file, further
 * down): takes a RAW, NOT lexically-collapsed candidate (see rawReadCandidatePath() just
 * below -- built without path.resolve()/path.join(), which would silently cancel a `..`
 * segment against a preceding path component before any filesystem check ever runs) and
 * confirms it survives the identical ancestor-walk-then-realpath discipline
 * isPathWithinRealpathedRoot() (this file, ~line 1520) applies on the write lane, so a
 * symlink planted inside `boundary` pointing outside it is refused, not silently admitted by
 * a lexical-only pathInside() check -- and so is the composed escape
 * `<symlink>/../<outside-dir>/<file>`, where a purely lexical resolve() cancels the
 * symlink-then-".." pair into a string that reads as trivially inside `boundary` while the
 * OS actually dereferences the symlink FIRST and applies the following `..` relative to ITS
 * real target (round 2, F4 -- reproduced live: the direct-symlink shape was refused, this
 * composed shape was not, and the admitted command read bytes from outside the boundary).
 *
 * `boundary` itself is also realpathed here (round 2, F4) before either pathInside()
 * comparison below, closing the asymmetry a prior round flagged but could not verify: this
 * helper realpathed the candidate but compared it against a boundary that was, at most,
 * lexically resolve()d by its callers -- never confirmed to be the boundary's own real,
 * symlink-free path. A boundary that fails to realpath (does not exist, or a filesystem
 * error) fails this check closed, exactly like every other catch branch here.
 *
 * Deliberately its OWN copy of that discipline, not a direct call into
 * isPathWithinRealpathedRoot() itself, for two reasons. First, this dispatch's forbidden
 * list excludes write-path logic from this round's changes, and isPathWithinRealpathedRoot()
 * backs isProjectWritePath() directly. Second, and more than a scope courtesy:
 * isPathWithinRealpathedRoot() re-resolves its own `filePath` argument AGAINST the boundary
 * it is given (`resolve(root, filePath)`) -- correct for its single-boundary write-lane
 * caller, but calling it once per candidate boundary here (root, then each of extraRoots)
 * would silently reinterpret a RELATIVE read argument as relative to each extra boundary in
 * turn, admitting shapes the lexical check never did. Taking an already-built raw absolute
 * candidate and only ever deriving containment through realpath avoids that widening. This
 * mirrors the same deliberate-separate-copy convention this function's own predecessor
 * comment already states for the bounded-pipeline family (below).
 *
 * The `resolved === boundary` identity shortcut matters for a caller this function's own
 * two consumers do not control: isOutsideRootSingleCommandRead()/isOutsideRootBoundedDiagnosticRead()'s
 * own "was containment the only thing blocking this" re-check lifts a read argument's OWN
 * resolved path into `extraRoots`, so the candidate and the boundary are the identical string
 * by construction on that second call -- not a real, independently-realpathed root like
 * `root` or BOUNDED_PIPELINE_ADDITIONAL_ROOTS. Without the shortcut, realpathing that
 * self-referential boundary re-resolves the SAME symlink the candidate already carries,
 * which then fails containment against its own un-realpathed string -- silently defeating the
 * lift this classifier exists to perform and letting the command fall through past the
 * READ-SCOPE branch entirely (measured live this dispatch: a plain symlinked single-command
 * read fell through to unconditional admission in ready state instead of landing on
 * GUARD-READ-SCOPE-OUTSIDE-ROOT). The shortcut costs nothing on the real-boundary path: a
 * resolved file path equals a directory boundary only when the boundary itself is the exact
 * thing being read, which needs no symlink walk to already be "inside itself". Deliberately
 * checked BEFORE boundary is realpathed below -- it is a caller-constructed identity on the
 * caller's own strings, not a filesystem fact.
 *
 * For every non-identity candidate, the realpathed boundary must be a DIRECTORY. A regular
 * file has no contained descendants: without this inspection, the missing-descendant ancestor
 * walk below would climb `<file>/<nonexistent-child>` back to that file and report it inside.
 * This belongs in the exported primitive so future file-boundary callers inherit the same
 * exact-file discipline as the current transcript-file caller. The directory case deliberately
 * keeps admitting a missing descendant, and the literal identity shortcut above deliberately
 * remains before this filesystem inspection.
 *
 * `dependencies` (round 2, F5): exported so guard-lifecycle-ready.test.mjs can call this
 * function directly with an injected `realpathSyncFn` that throws, proving the fail-closed
 * catch branches below are real rather than merely present -- no production caller supplies
 * it today; both real call sites always mean the real filesystem.
 */
export function isRealpathedWithinBoundary(resolved, boundary, dependencies = {}) {
  if (resolved === boundary) return true;
  const exists = dependencies.existsSyncFn ?? existsSync;
  const realpath = dependencies.realpathSyncFn ?? realpathSync;
  const stat = dependencies.statSyncFn ?? statSync;
  let realBoundary;
  try {
    realBoundary = realpath(boundary);
    if (!stat(realBoundary).isDirectory()) return false;
  } catch {
    return false;
  }
  if (!pathInside(realBoundary, resolved)) return false;
  let ancestor = resolved;
  try {
    while (ancestor !== boundary && !exists(ancestor)) ancestor = dirname(ancestor);
    return pathInside(realBoundary, realpath(ancestor));
  } catch {
    return false;
  }
}

// NVA-B-READCONTAIN-1 (correction round 2, F4). commandPath()'s existing null-for-a-flag
// detection stays the "is this a path token at all" gate (both callers below still call
// commandPath() first, unchanged, purely to decide that), but its RESOLVED return value must
// never reach isRealpathedWithinBoundary(): path.resolve()/path.join() collapse a `..`
// segment lexically, with zero filesystem awareness, before any symlink in the path is ever
// examined. Building the candidate this way instead -- string concatenation, never resolve()
// or join() -- keeps a literal `..` segment intact so dirname()/existsSync()/realpathSync()
// (all OS-accurate and symlink-aware) walk the SAME path the shell will actually resolve,
// dereferencing a symlink component before applying a `..` that follows it, exactly like the
// kernel does and path.resolve() does not.
// NVA-B-TILDEFIX-1 (backlog: 2026-09-06-a-leading-tilde-path-argument-is-admitted-as-inside-
// the-project-root.md): a leading `~` is expanded by the REAL shell to an absolute
// home-directory path BEFORE this command's argv is ever assembled -- entirely outside
// anything this parser sees or can walk. Concatenating it under `root` (the branch below,
// unmodified for every other value) is exactly the bug: isRealpathedWithinBoundary's
// ancestor-walk then finds no directory literally named `~`, climbs all the way to `root`,
// and calls the (nonexistent, literal) path "inside" it. Prefixing with `sep` instead makes
// the candidate syntactically absolute and lexically outside `root` by plain string
// concatenation, with no existsSync/realpathSync call needed to fail containment -- this is a
// narrow reject, never real tilde expansion. Returning the bare, un-prefixed `value` would NOT
// be safe here even though it looks lexically foreign to `root`: pathInside()'s
// path.relative() call re-resolves a RELATIVE `target` against the guard process's own cwd
// before comparing, and in real (non-test) usage `root` usually IS that cwd, which would
// silently re-admit the tilde value as "inside" (measured live, this dispatch). Prefixing with
// `sep` yields an already-absolute string, so no such cwd-dependent re-resolution ever
// happens. Deterministic in `value` alone, so when isOutsideRootSingleCommandRead()'s /
// isOutsideRootBoundedDiagnosticRead()'s scope-lift widening later re-adds this exact same
// candidate as its own extraRoots entry, the two calls still byte-match and
// isRealpathedWithinBoundary()'s `resolved === boundary` shortcut still fires -- preserving
// the self-lift symmetry those callers rely on to route this to READ_SCOPE_DENIAL_CODE
// instead of silently falling through to unconditional admission for the un-piped
// single-command shape (see isRealpathedWithinBoundary's own doc comment above, and F4's
// identical concern about a broken self-lift shortcut). guard-command-grammar.mjs's
// approvedReadPath() carries an independent twin of the underlying `startsWith("~")` check --
// never imported (guard-lifecycle-ready.mjs imports FROM guard-command-grammar.mjs, never the
// reverse) and deliberately NOT this same sentinel-candidate construction: that lane's only
// caller (isBoundedReadOnlyPipeline, always inside a `|`-joined two-segment pipeline) already
// denies with an existing code once containment fails, with or without the self-lift
// symmetry, so a plain unconditional `return false` is correct and sufficient there.
export function rawReadCandidatePath(value, root) {
  if (typeof value !== "string" || value === "" || value.startsWith("-")) return null;
  if (value.startsWith("~")) return `${sep}${value}`;
  return isAbsolute(value) ? value : `${root}${sep}${value}`;
}

export function pipelineSourceRoot(root, exists = existsSync) {
  return exists(join(root, "plugins", "pipeline-core", ".codex-plugin", "plugin.json"))
    && exists(join(root, "harness", "scripts", "verify.mjs"));
}

export function commandPath(value, root) {
  if (typeof value !== "string" || value === "" || value.startsWith("-")) return null;
  // Bash expands a leading `~` before executing the command. Treating the unexpanded token
  // as a relative path would therefore classify a real home-directory target as if it were
  // the literal (usually nonexistent) `<root>/~...` path. As in rawReadCandidatePath(), this
  // is a fail-closed sentinel rather than an attempt to reproduce shell/user lookup rules:
  // every leading-tilde form is outside `root`, while all other commandPath callers retain
  // their existing resolve() behaviour.
  if (value.startsWith("~")) return `${sep}${value}`;
  return resolve(root, value);
}

export function isShellExternalPathToken(value) {
  return typeof value === "string" && (isAbsolute(value) || value.startsWith("~"));
}

export function isPathWithinRoot(path, root) {
  const part = relative(root, path);
  return part === "" || (part !== ".." && !part.startsWith(`..${sep}`) && !isAbsolute(part));
}
