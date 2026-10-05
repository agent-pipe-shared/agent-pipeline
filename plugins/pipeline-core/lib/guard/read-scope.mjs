// SPDX-License-Identifier: SUL-1.0
// Guard module "read-scope" (layer 3), split out of guard-lifecycle-ready.mjs; declarations moved verbatim (s2-guard-split-plan.md).

import { lstatSync, readdirSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep, win32 } from "node:path";
import { isAllowedPassiveReadTarget } from "../passive-read-policy.mjs";
import { readClaudeTaskOutputReadScope } from "../claude-task-output-read-scope.mjs";
import { isBoundedReadOnlyPipeline, parseGuardCommand } from "../../hooks/guard-command-grammar.mjs";
import { BOUNDED_PIPELINE_ADDITIONAL_ROOTS, CLAUDE_BASH_SHELL_DIALECT_PLATFORM, MAX_CLAUDE_TASK_OUTPUT_READ_BYTES } from "./constants.mjs";
import { commandPath, isPathWithinRoot, pathInside, rawReadCandidatePath } from "./path-containment.mjs";
import { isBoundedCatPipeline, isBoundedGitPipeline, isBoundedGrepPipeline, isBoundedReadOnlyAndChain, isChainSegmentAdmitted, isReadOnlyDiagnosticCommand, isReadOnlySimpleWords, isSafeExactPassiveFile, passiveCandidate, splitTopLevelAndChain } from "./shell-grammar.mjs";
import { verdict } from "./verdict.mjs";
import { claudeSessionMemoryDirectory } from "./write-scope.mjs";

/**
 * NVA-B-READCONTAIN-2 (backlog: 2026-09-01-read-containment-was-removed-a-day-after-it-was-
 * added-with-no-recorded-decision.md). The READ-side twin of `claudeSessionMemoryDirectory()`
 * just above: this session's own transcript file, exactly as the CLI's PreToolUse hook payload
 * supplies it in `input.transcript_path`, never reconstructed, guessed, or pattern-matched from
 * a sampled naming scheme. Admitted downstream as an EXACT single-file match only -- never a
 * directory-prefix admission -- so a genuine agent need (reading its own session transcript) is
 * met without reopening the boundary NVA-B-READCONTAIN-1 restored. That exact-match invariant
 * is enforced structurally at the sole downstream consumer, isApprovedSingleCommandReadArg()'s
 * extraRoots loop (NVA-B-GLRMINORS-1, Gap A) -- not merely by the ancestor-walk's own logic,
 * which alone would incidentally admit any `<this file>/<nonexistent-child>` candidate string
 * (saved only by the real OS's ENOTDIR at actual read time before that fix).
 *
 * Fails closed exactly like claudeSessionMemoryDirectory(): an absent, empty, relative, or
 * null-byte-carrying transcript_path, or one that does not realpath to an existing plain FILE,
 * returns null rather than guessing. realpathSync() resolves every symlinked ancestor (and the
 * transcript_path itself, if it is a symlink) in one step, so a symlinked session directory
 * cannot misdirect the boundary this function hands back.
 */
function claudeSessionTranscriptFilePath(input, dependencies = {}) {
  const transcriptPath = input?.transcript_path;
  if (typeof transcriptPath !== "string" || transcriptPath.trim() === ""
    || transcriptPath.includes("\0") || !isAbsolute(transcriptPath)) return null;
  const realpath = dependencies.realpathSyncFn ?? realpathSync;
  const statFn = dependencies.statSyncFn ?? statSync;
  try {
    const real = realpath(transcriptPath);
    return statFn(real).isFile() ? real : null;
  } catch {
    return null;
  }
}

/**
 * Session content can contain user data or credentials, so the guard never admits a host-wide
 * session collection. The host supplies only the current Claude transcript path; its exact file
 * and the exact derived `memory/` directory are the sole session-derived read roots. A restart
 * needing a prior transcript must use a dedicated, project-filtering reader rather than turn a
 * shared runner storage directory into a generic shell-readable boundary.
 *
 * Each entry is admitted or omitted independently. Deliberately NOT a module-level constant
 * (unlike BOUNDED_PIPELINE_ADDITIONAL_ROOTS): both roots vary per invocation with `input`.
 *
 * Deliberately excludes the `/tmp` task-output directory a dispatched subagent's own output
 * lands in: that location is not carried in any PreToolUse hook field, and admitting it would
 * mean pattern-matching Claude Code's own tmp-layout naming scheme (uid, encoded-cwd, session
 * id, `tasks/`) -- the exact "guessed rather than resolved" shape this function, and MEMPATH-1
 * before it, both refuse to do. That need stays out of scope for this function.
 */
export function sessionReadScopeRoots(input, dependencies = {}) {
  const roots = [];
  const transcriptFile = claudeSessionTranscriptFilePath(input, dependencies);
  if (transcriptFile !== null) roots.push(transcriptFile);
  const memoryDir = claudeSessionMemoryDirectory(input, dependencies);
  if (memoryDir !== null) roots.push(memoryDir);
  const explicitCwd = input?.tool_input?.cwd ?? input?.tool_input?.Cwd;
  if (typeof explicitCwd === "string" && explicitCwd.trim() !== "") {
    try {
      const realpath = dependencies.realpathSyncFn ?? realpathSync;
      roots.push(realpath(resolve(explicitCwd)));
    } catch {
      roots.push(resolve(explicitCwd));
    }
  }
  return roots;
}

// Current-session background-task output is an exact-file read capability. The
// native PostToolUse recorder supplies the session/task/tool binding; this guard
// independently checks that the returned path is the physical, single-link,
// bounded task file in its authorized directory before using it as a read target.
function claudeTaskOutputReadScope(path, input, root, dependencies = {}) {
  const sessionId = input?.session_id;
  const transcriptPath = input?.transcript_path;
  if (typeof sessionId !== "string" || sessionId === ""
    || typeof transcriptPath !== "string" || transcriptPath === ""
    || typeof path !== "string" || path === "" || !isAbsolute(path) || path.includes("\0")) return null;
  const reader = dependencies.readClaudeTaskOutputReadScopeFn ?? readClaudeTaskOutputReadScope;
  let scope;
  try {
    scope = reader({ projectDir: root, sessionId, transcriptPath, requestedPath: path });
  } catch { return null; }
  if (scope?.status !== "available" || scope.sessionId !== sessionId
    || typeof scope.taskId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/u.test(scope.taskId)
    || typeof scope.toolUseId !== "string" || scope.toolUseId === ""
    || typeof scope.path !== "string" || typeof scope.authorizedTaskDirectory !== "string") return null;
  try {
    const candidate = resolve(path);
    const directory = scope.authorizedTaskDirectory;
    if (candidate !== path || candidate !== scope.path || !isAbsolute(directory)
      || resolve(directory) !== directory || dirname(candidate) !== directory
      || basename(candidate) !== `${scope.taskId}.output`
      || realpathSync(directory) !== directory || !lstatSync(directory).isDirectory()) return null;
    const leaf = lstatSync(candidate);
    const physical = realpathSync(candidate);
    if (!leaf.isFile() || leaf.isSymbolicLink() || leaf.nlink !== 1
      || leaf.size < 0 || leaf.size > MAX_CLAUDE_TASK_OUTPUT_READ_BYTES
      || physical !== candidate) return null;
    return { path: candidate, taskId: scope.taskId, sessionId, toolUseId: scope.toolUseId };
  } catch { return null; }
}

export function exactClaudeTaskOutputBashRead(command, root, input, dependencies = {}) {
  const parsed = parseGuardCommand(command, root, { platform: CLAUDE_BASH_SHELL_DIALECT_PLATFORM });
  if (parsed.parseStatus !== "accepted" || parsed.segments.length !== 1
    || parsed.operators.length !== 0 || parsed.redirects.length !== 0) return false;
  const { executable, argv } = parsed.segments[0];
  const name = basename(executable).toLowerCase();
  let requestedPath = null;
  if (["cat", "head", "tail"].includes(name)) {
    const args = argv[0] === "--" ? argv.slice(1) : argv;
    if (args.length !== 1) return false;
    requestedPath = args[0];
  } else if (["grep", "rg"].includes(name)) {
    if (argv.length !== 2) return false;
    requestedPath = argv[1];
  } else return false;
  const scope = claudeTaskOutputReadScope(requestedPath, input, root, dependencies);
  return scope !== null && isReadOnlyDiagnosticCommand(command, root, [scope.path]);
}

export function exactClaudeTaskOutputPowerShellRead(command, root, input, dependencies = {}) {
  const parsed = parseGuardCommand(command, root, { platform: "win32" });
  if (parsed.parseStatus !== "accepted" || parsed.segments.length !== 1
    || parsed.operators.length !== 0 || parsed.redirects.length !== 0) return false;
  const { executable, argv } = parsed.segments[0];
  if (basename(executable).toLowerCase() !== "get-content") return false;
  const args = argv[0]?.toLowerCase() === "-path" ? argv.slice(1) : argv;
  if (args.length !== 1) return false;
  return claudeTaskOutputReadScope(args[0], input, root, dependencies) !== null;
}

/**
 * The one redirect shape that writes nothing anywhere: stderr sent to the platform null
 * device. Shared by BOTH redirect classifiers -- the accepted-parse branch of
 * isForbiddenCrossRepositoryMutation() and the unparsed-command fallback
 * hasExternalOutputRedirect() -- so the two cannot drift apart again.
 *
 * They had drifted. The accepted-parse branch already exempted `2>/dev/null`; the fallback
 * did not, so any command the closed grammar could not parse -- `cmd 2>/dev/null; cmd2`,
 * `cmd 2>/dev/null && cmd2` -- was refused as GUARD-CROSS-REPO-MUTATION on the strength of
 * its stderr suppressor. Suppressing stderr mutates nothing, least of all another
 * repository, and what was actually wrong with those commands (composition) has its own
 * truthful code. A guard that misnames what it caught teaches operators to distrust the
 * codes it gets right. Measured 2026-08-08.
 *
 * This exempts a REASON, never a command: such commands are still refused, by the closed
 * grammar (GUARD-PARSE-UNSUPPORTED / GUARD-REDIRECT-UNAPPROVED) one screen below. Narrow by
 * construction -- file descriptor 2 only, the null device only, per redirect. `2>audit.log`,
 * `>/dev/null`, `&>/dev/null` and every stdout redirect stay outside it, and a second
 * redirect in the same command is judged on its own (`cmd 2>/dev/null > /etc/passwd` stays a
 * cross-repository mutation).
 */
export function isNullDeviceStderrRedirect(fd, target) {
  return fd === 2 && (target === "/dev/null" || target.toLowerCase() === "nul");
}

/**
 * NVA-BL-75 (backlog: guard-reclassification-changed-what-a-signature-can-lift). WHY the
 * exemption above is correct -- not merely harmless. 88d316d proved that it admits nothing;
 * the reasoning for the classification itself lived only in the backlog item that reviewed
 * it, which is exactly the kind of thing that has to be readable next to the code.
 *
 * The claim, on its own terms: `2>/dev/null` writes nothing, anywhere -- least of all into
 * another repository. It therefore never was a cross-repository mutation, and was never a
 * member of the class this function selects. Skipping it removes a FALSE POSITIVE; it does
 * not carve an exception out of a true one. What such commands are actually refused for --
 * composition the closed grammar does not accept -- is untouched and keeps its own code.
 *
 * Why that distinction is worth stating: the class this function selects is not only a
 * denial code, it is an OVERRIDE class. At 88d316d, GUARD-CROSS-REPO-MUTATION was a bare
 * refusal (ADR-0059 Decision 5) while the three grammar codes routed through the human
 * override planner (Decisions 3/4), so reclassifying looked like moving a command from
 * "never liftable" into "liftable by a signed human override" while its verdict stayed put.
 * Correctness of the classification is what settles that: a command that is not a
 * cross-repository mutation must not be held in the non-liftable class BY a cross-repository
 * label it does not deserve. A guard may refuse a command for what it is; it may not keep a
 * human from authorizing it on the strength of a fact that is untrue.
 *
 * Two things keep that from being a mere assertion:
 *   - ADR-0059 Decision 6 has since made the cross-repository class routable too, through its
 *     own narrower `cross-repository-target` class whose plan carries a scopeAttestation. So
 *     today BOTH classes route, on different terms -- which is why the difference is measured
 *     rather than argued: guard-lifecycle-ready.test.mjs's NVA-BL-75 corpus pins the pair
 *     (denial code, override class) per command, so the next reclassification that moves a
 *     command between override classes fails a test instead of needing a reviewer.
 *   - For the exact shapes 88d316d moved (`cmd 2>/dev/null; cmd2` and siblings) the measured
 *     reachability delta is zero, under either code: HGO's own eligibility()
 *     (lib/human-guard-override.mjs) refuses an unparseable command containing `>` before it
 *     can be classified, so no capability is armable for one and the guard says so
 *     ("No human override route ... status=external-operator-required"). That refusal
 *     predates the reclassification (af5826e7, 2026-07-29), so no signature gained reach.
 */
export function hasExternalOutputRedirect(command, root) {
  let quote = null;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (quote !== null) {
      if (char === quote) quote = null;
      else if (quote === "\"" && char === "\\") index += 1;
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (char !== ">") continue;
    if (command[index + 1] === ">" || command[index + 1] === "&") continue;
    // Same descriptor rule the tokenizer uses (hooks/guard-command-grammar.mjs, the
    // `char === "2" && command[index + 1] === ">"` branch): a `2` immediately before the
    // `>` names file descriptor 2. `&>` and a bare `>` are deliberately not descriptor 2.
    const fd = command[index - 1] === "2" ? 2 : null;
    let cursor = index + 1;
    while (cursor < command.length && /\s/u.test(command[cursor])) cursor += 1;
    let target = "";
    while (cursor < command.length && !/\s/u.test(command[cursor])
      && !"|;&<>()".includes(command[cursor])) {
      target += command[cursor];
      cursor += 1;
    }
    if (isNullDeviceStderrRedirect(fd, target)) continue;
    const resolved = commandPath(target, root);
    if (resolved !== null && !pathInside(root, resolved)) return true;
  }
  return false;
}

/**
 * NVA-BL-76 (restored by NVA-B-READCONTAIN-1): is this command the bounded read-only
 * diagnostic pipeline that isReadOnlyDiagnosticCommand() admits in every respect EXCEPT that
 * a read target resolves outside the project root (and outside
 * BOUNDED_PIPELINE_ADDITIONAL_ROOTS)?
 *
 * Answered by evaluating the SAME predicate twice -- never by a second, competing parse of
 * the command, and never by re-deriving which argv token is a path (the rule against a rival
 * parser that rejectedGrammarElement() states one screen up applies here verbatim). The
 * second call passes every argv token, lifted via rawReadCandidatePath() (round 2, F4 --
 * NOT `resolve(root, token)`; see isRealpathedWithinBoundary's own doc comment for why a
 * lexically-collapsed self-lift silently defeats the shortcut it exists to feed), as its own
 * approved read root; `approvedReadPath` builds a candidate the identical un-collapsed way,
 * so `isRealpathedWithinBoundary`'s `resolved === boundary` shortcut fires (byte-identical
 * strings) for precisely the path candidates, and the call returns true iff every OTHER
 * bound already holds: two segments, one `|`, rg as the producer, validateRg's flag
 * allowlist on both sides, head's canonical 1..500 count, and the single admitted
 * `2>/dev/null` suppressor. `rg … | tee out.txt`, `… | head -n 9999` and
 * `… | head -n 5 > out.txt` therefore stay false and keep their existing codes.
 *
 * This never admits anything. Its only consumer picks WHICH refusal is printed, so the
 * relaxed second evaluation cannot widen what the guard allows: the first call, with the
 * real roots, is still the one that decides admission (isReadOnlyDiagnosticCommand).
 */
export function isOutsideRootBoundedDiagnosticRead(parsed, root) {
  if (!parsed || parsed.parseStatus !== "accepted") return false;
  const isBoundedRead = (roots) => isBoundedReadOnlyPipeline(parsed, root, roots)
    || isBoundedGrepPipeline(parsed, root, roots)
    || isBoundedCatPipeline(parsed, root, roots)
    || isBoundedGitPipeline(parsed, root, roots);
  if (isBoundedRead(BOUNDED_PIPELINE_ADDITIONAL_ROOTS)) return false;
  const scopeLifted = parsed.segments.flatMap((segment) => segment.argv
    .filter((token) => typeof token === "string" && token !== "" && !token.includes("\0"))
    .map((token) => {
      try { return rawReadCandidatePath(token, root); } catch { return null; }
    })
    .filter((value) => value !== null));
  return isBoundedRead([...BOUNDED_PIPELINE_ADDITIONAL_ROOTS, ...scopeLifted]);
}

/**
 * pipeline.read-scope-single-command-root-check: the single, un-piped sibling of
 * isOutsideRootBoundedDiagnosticRead() just above -- is this command the single-command
 * read-only shape isReadOnlyDiagnosticCommand() admits in every respect EXCEPT that a read
 * target resolves outside the project root (and outside BOUNDED_PIPELINE_ADDITIONAL_ROOTS)?
 * Before this check existed, isReadOnlySimpleWords() imposed no containment restriction at
 * all on the single-command shape while the piped shape was already root-checked -- so
 * protection against reading outside the project root depended on the shell shape of the
 * command (piped vs. not), not on the actual filesystem target being read (backlog:
 * 2026-08-29-read-scope-guard-admits-single-command-but-blocks-the-piped-form.md).
 *
 * Answered by the identical two-call pattern as the piped sibling: the first call, with the
 * real roots, decides whether this shape is a read-only single command AT ALL (an in-root
 * read short-circuits earlier via isReadOnlyDiagnosticCommand() and never reaches this
 * function; a command not shaped like a read-only single command -- e.g. `grep
 * --files-with-matches`, or any write/mutating command -- returns false on the first call
 * regardless of extraRoots, since none of those branches ever consult extraRoots). The
 * second call, with the read's own literal path arguments lifted via rawReadCandidatePath()
 * (round 2, F4 -- NOT `resolve(root, token)`, for the identical reason
 * isOutsideRootBoundedDiagnosticRead() above no longer uses it: a lexically-collapsed
 * self-lift stops matching isApprovedSingleCommandReadArg's own raw candidate byte-for-byte,
 * so isRealpathedWithinBoundary's `resolved === boundary` shortcut silently stops firing and
 * this function falls back to false -- letting a composed `<symlink>/../<outside>/<file>`
 * argument, in `ready` lifecycle state, fall through this whole branch to unconditional
 * admission at evaluateAfterGrammarAdmission() instead of the READ_SCOPE_DENIAL_CODE refusal
 * below; measured live this round before the fix), additionally approved as extra roots,
 * answers "was the containment check the ONLY thing blocking this command" -- exactly the
 * question isOutsideRootBoundedDiagnosticRead() answers for the piped shape. This never
 * admits anything by ITSELF widening containment; its only consumer
 * (evaluateLifecycleReadyGuard()) uses a `true` result to select the READ_SCOPE_DENIAL_CODE
 * refusal over whatever else that branch would otherwise refuse under -- but for the
 * un-piped, `ready`-lifecycle single-command shape this file admits by default, a `false`
 * result here is exactly what a wrongly-widened self-lift turns into an actual admission, not
 * merely a different denial code (the asymmetry with the piped sibling above, where every
 * path through that branch still ends in a refusal one way or another).
 *
 * NVA-B-DENIALCODE-1 (backlog: 2026-09-06-suppressed-and-chained-outside-root-reads-land-on-
 * the-wrong-denial-code.md): a bare `redirects.length !== 0` exclusion used to reject this
 * shape before it ever reached the read-scope check at all, so a single, un-piped outside-root
 * read carrying the one admitted trailing `2>/dev/null`/`2>nul` stderr suppressor -- itself
 * independently admitted for an IN-root read by
 * isReadOnlyDiagnosticCommandWithTrailingStderrRedirect() -- fell through to the caller's
 * earlier, less-specific "this command has a redirect" branch and printed
 * GUARD-REDIRECT-UNAPPROVED instead of the true reason. Now tolerates EXACTLY that one
 * redirect shape (the identical `fd === 2, direction === ">", target is the platform's null
 * device` test simpleWordsAllowingTrailingStderrDevNullRedirect() already applies for
 * admission, inlined here rather than re-parsing the command from a string -- this function is
 * only ever handed the already-`accepted` `parsed` object, never the raw text) before falling
 * through to the identical two-call scope-lift pattern below; any OTHER redirect shape (more
 * than one redirect, or a single redirect that is not this exact suppressor) still returns
 * false immediately, exactly as before.
 */
export function isOutsideRootSingleCommandRead(parsed, root) {
  if (!parsed || parsed.parseStatus !== "accepted" || parsed.segments.length !== 1
    || parsed.operators.length !== 0 || parsed.redirects.length > 1) return false;
  if (parsed.redirects.length === 1) {
    const redirect = parsed.redirects[0];
    const windows = parsed.dialect === "windows-direct";
    const isAdmittedRedirect = redirect.fd === 2 && redirect.direction === ">"
      && (windows ? redirect.target.toLowerCase() === "nul" : redirect.target === "/dev/null");
    if (!isAdmittedRedirect) return false;
  }
  const words = [parsed.segments[0].executable, ...parsed.segments[0].argv];
  if (isReadOnlySimpleWords(words, root)) return false;
  const scopeLifted = words.slice(1)
    .filter((token) => typeof token === "string" && token !== "" && !token.includes("\0"))
    .map((token) => {
      try { return rawReadCandidatePath(token, root); } catch { return null; }
    })
    .filter((value) => value !== null);
  return isReadOnlySimpleWords(words, root, [...BOUNDED_PIPELINE_ADDITIONAL_ROOTS, ...scopeLifted]);
}

/**
 * The `&&`-chain sibling of isOutsideRootSingleCommandRead() and
 * isOutsideRootBoundedDiagnosticRead() above (NVA-B-DENIALCODE-1, same backlog item as the
 * doc comment on isOutsideRootSingleCommandRead()). Is this command an `&&`-chain that
 * isBoundedReadOnlyAndChain() would admit in every respect EXCEPT that a read target in one of
 * its segments resolves outside the project root (and outside
 * BOUNDED_PIPELINE_ADDITIONAL_ROOTS)?
 *
 * Unlike both siblings above, this one cannot be handed a `parsed` object from
 * parseGuardCommand(): the shared tokenizer denies a top-level `&&` outright
 * (guard-command-grammar.mjs's CONTROL set), so an `&&`-chain never reaches parseStatus
 * "accepted" there -- the denied() object's segments/operators/redirects are always the empty,
 * frozen arrays, with nothing left to classify. This function therefore works on the raw
 * command STRING via splitTopLevelAndChain(), the identical boundary-finder
 * isBoundedReadOnlyAndChain() itself already uses -- never a second, competing definition of
 * where the chain's segments are.
 *
 * Answered by the identical two-call pattern as both siblings: the first call
 * (isBoundedReadOnlyAndChain, with no extra roots) decides whether this shape is a bounded
 * `&&`-chain AT ALL -- a chain already admitted this way returns false here and never needs
 * this reclassification. The second call, with every segment's own read-target argv token
 * lifted via rawReadCandidatePath() (round 2, F4 discipline -- see
 * isOutsideRootSingleCommandRead()'s own doc comment above for why NOT `resolve(root, token)`)
 * additionally approved as extra roots, answers "would every segment be admitted if the ONLY
 * thing standing in its way were containment". This never admits anything by itself: its only
 * consumer picks WHICH refusal is printed, never whether the command is admitted --
 * isBoundedReadOnlyAndChain(), called with the real roots, is still the one that decides that.
 */
export function isOutsideRootReadOnlyAndChain(command, root) {
  const parts = splitTopLevelAndChain(command);
  if (!parts) return false;
  if (isBoundedReadOnlyAndChain(command, root)) return false;
  const scopeLifted = parts.flatMap((part) => {
    const parsedPart = parseGuardCommand(part, root);
    if (parsedPart.parseStatus !== "accepted" || parsedPart.segments.length !== 1) return [];
    return parsedPart.segments[0].argv
      .filter((token) => typeof token === "string" && token !== "" && !token.includes("\0"))
      .map((token) => {
        try { return rawReadCandidatePath(token, root); } catch { return null; }
      })
      .filter((value) => value !== null);
  });
  const extraRoots = [...BOUNDED_PIPELINE_ADDITIONAL_ROOTS, ...scopeLifted];
  return parts.every((part) => isChainSegmentAdmitted(part, root, extraRoots));
}

export function containedLiteralReadPath(value, root, dependencies = {}, extraRoots = []) {
  return typeof value === "string" && !/[\0$`*?\[\]{}]/u.test(value)
    && isAllowedPassiveReadTarget(value, {
      rootDir: root, recursive: true, additionalRecursiveRoots: extraRoots,
    });
}

function containedRelativeGlob(value) {
  // Wildcards are useful inside the project, but broad patterns and hidden
  // selectors could enumerate private key files. Keep wildcard forms to
  // ordinary source/document extensions; exact entries use the read policy.
  if (typeof value !== "string" || value === "" || /[\0$`\[\]{}\\]/u.test(value)
    || value.startsWith("~") || isAbsolute(value) || win32.isAbsolute(value)
    || !value.split("/").every((part) => part !== "" && !part.startsWith("."))) return false;
  if (!/[?*]/u.test(value)) return true;
  return /\.(?:md|mjs|js|cjs|ts|tsx|css|html|svg|txt|yaml|yml)$/iu.test(value);
}

function containedGlobBase(path, root, extraRoots = []) {
  const candidate = rawReadCandidatePath(path, root);
  if (candidate === null || !isAllowedPassiveReadTarget(path, {
    rootDir: root, recursive: true, directoryListing: true,
    additionalRecursiveRoots: extraRoots,
  })) return false;
  try { return statSync(candidate).isDirectory(); }
  catch { return false; }
}

function registeredPluginReadScopeRoots(dependencies = {}) {
  let supplied;
  try {
    supplied = dependencies.registeredPluginReadScopeRootsFn
      ? dependencies.registeredPluginReadScopeRootsFn()
      : BOUNDED_PIPELINE_ADDITIONAL_ROOTS;
  } catch { return []; }
  if (!Array.isArray(supplied) || supplied.length > 1) return [];
  const roots = [];
  for (const path of supplied) {
    try {
      if (typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path
        || realpathSync(path) !== path || lstatSync(path).isSymbolicLink()
        || !statSync(path).isDirectory()) continue;
      roots.push(path);
    } catch {}
  }
  return roots;
}

function registeredPluginReadPathStatus(raw, projectRoot, pluginRoots) {
  let lexical;
  try { lexical = resolve(passiveCandidate(raw, projectRoot)); }
  catch { return false; }
  let matched = false;
  for (const pluginRoot of pluginRoots) {
    const lexicalInside = isPathWithinRoot(lexical, pluginRoot);
    let physical;
    try { physical = realpathSync(lexical); }
    catch { return lexicalInside ? false : matched ? true : null; }
    const physicalInside = isPathWithinRoot(physical, pluginRoot);
    if (!lexicalInside && !physicalInside) continue;
    matched = true;
    if (!lexicalInside || !physicalInside) return false;
    const excluded = new Set([".git", "auth", "credentials", "secrets", "logs", "sessions", "history"]);
    const relativeParts = [relative(pluginRoot, lexical), relative(pluginRoot, physical)];
    if (relativeParts.some(part => part.split(sep).some(segment => excluded.has(segment.toLowerCase())))) return false;
  }
  return matched ? true : null;
}

function isSafeRegisteredPluginDirectory(raw, root, extraRoots, pluginPathStatus) {
  if (pluginPathStatus !== true || !isAllowedPassiveReadTarget(raw, {
    rootDir: root, recursive: true, directoryListing: true, additionalRecursiveRoots: extraRoots,
  })) return false;
  try { return statSync(passiveCandidate(raw, root)).isDirectory(); }
  catch { return false; }
}

function passiveTargetIsFile(raw, root) {
  try { return statSync(passiveCandidate(raw, root)).isFile(); }
  catch { return false; }
}

// ALFRED-QP4 (G1, G3, G4, F1; amended R2-1). Every lane below is read-only, requires the target to be a directory (or a missing file) that is inside the
// project root BOTH lexically and physically (no link or junction escape), carries no dot-segment in the path it NAMES, and re-uses
// isAllowedPassiveReadTarget -- including its whole-tree secret screen -- unchanged. The Glob wildcard listing additionally walks the subtree below the
// named path and is admitted only when no directory there is hidden (qp4NoHiddenDirectoryAtOrBelow), so .git private state and .claude are not listed
// through a parent directory either. There is NO Grep directory lane: guardrails/security.md SEC-11 requires native Grep to name an exact file.
function qp4PhysicallyInsideProject(candidate, root) {
  try {
    const lexical = resolve(candidate);
    const rootResolved = resolve(root);
    if (!isPathWithinRoot(lexical, rootResolved)) return false;
    const physical = realpathSync(lexical);
    const rootPhysical = realpathSync(rootResolved);
    if (!isPathWithinRoot(physical, rootPhysical)) return false;
    return [relative(rootResolved, lexical), relative(rootPhysical, physical)]
      .every((part) => part.split(sep).every((segment) => segment !== ".." && !segment.startsWith(".")));
  } catch { return false; }
}

function qp4InRootDirectory(raw, root, extraRoots) {
  if (typeof raw !== "string" || raw === "" || /[\0$\x60*?\[\]{}]/u.test(raw) || raw.startsWith("~")) return false;
  const candidate = passiveCandidate(raw, root);
  if (!qp4PhysicallyInsideProject(candidate, root)) return false;
  try { if (!statSync(candidate).isDirectory()) return false; } catch { return false; }
  return isAllowedPassiveReadTarget(raw, {
    rootDir: root, recursive: true, directoryListing: true, additionalRecursiveRoots: extraRoots,
  });
}

// Glob: "<literal directories>/*" lists the immediate entry names of one in-root directory whose whole tree passes the secret screen AND in which no
// directory at or below the named path is hidden (R2-1). The project root is therefore never an admitted path while it contains .git or .claude.
function qp4InRootWildcardListing(raw, selector, root, extraRoots) {
  if (typeof selector !== "string" || selector === "" || /[\0$\x60\[\]{}\\]/u.test(selector) || selector.startsWith("~")
    || isAbsolute(selector) || win32.isAbsolute(selector)) return false;
  const parts = selector.split("/");
  if (!parts.every((part) => part !== "" && !part.startsWith("."))) return false;
  if (parts[parts.length - 1] !== "*" || parts.slice(0, -1).some((part) => /[?*]/u.test(part))) return false;
  const directory = parts.length === 1 ? raw : join(raw, ...parts.slice(0, -1));
  return qp4InRootDirectory(directory, root, extraRoots) && qp4NoHiddenDirectoryAtOrBelow(passiveCandidate(directory, root), root);
}

// R2-1: bounded, fail-closed subtree walk. True ONLY when no directory at or below `directory` has a name starting with "." -- every directory entry is
// resolved to its physical path (links and junctions are followed), which must stay inside the physical project root and carry no dot-named segment
// relative to it. Any read error (including a dangling or looping link), an entry that cannot be classified, more than QP4_WALK_MAX_ENTRIES entries or a
// tree deeper than QP4_WALK_MAX_DEPTH returns false. Read-only; lists names, never reads file contents.
const QP4_WALK_MAX_ENTRIES = 5000;

const QP4_WALK_MAX_DEPTH = 32;

function qp4NoHiddenDirectoryAtOrBelow(directory, root) {
  try {
    const rootPhysical = realpathSync(resolve(root));
    const pending = [{ path: realpathSync(resolve(directory)), depth: 0 }];
    const seen = new Set();
    let entries = 0;
    while (pending.length > 0) {
      const { path, depth } = pending.pop();
      if (seen.has(path)) continue;
      seen.add(path);
      if (depth > QP4_WALK_MAX_DEPTH) return false;
      if (!isPathWithinRoot(path, rootPhysical) || relative(rootPhysical, path).split(sep).some((segment) => segment.startsWith("."))) return false;
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        if (++entries > QP4_WALK_MAX_ENTRIES) return false;
        const lexical = join(path, entry.name);
        let isDirectory = entry.isDirectory();
        if (entry.isSymbolicLink() || (!isDirectory && !entry.isFile())) isDirectory = statSync(lexical).isDirectory();
        if (!isDirectory) continue;
        if (entry.name.startsWith(".")) return false;
        pending.push({ path: realpathSync(lexical), depth: depth + 1 });
      }
    }
    return true;
  } catch { return false; }
}

const QP4_SECRET_NAME = /^(?:id_[^/\\]*|credentials|auth\.json|oauth_creds\.json|[^/\\]+\.(?:p12|pfx|key|pem))$/iu;

// Read: a file that does not exist, spelled as a plain in-root path whose nearest existing ancestor is a directory physically inside the project.
function qp4MissingInRootTarget(raw, root) {
  if (typeof raw !== "string" || raw === "" || /[\0$\x60*?\[\]{}]/u.test(raw) || raw.startsWith("~")) return false;
  const rootResolved = resolve(root);
  const candidate = resolve(passiveCandidate(raw, root));
  if (candidate === rootResolved || !isPathWithinRoot(candidate, rootResolved)) return false;
  if (relative(rootResolved, candidate).split(sep).some((segment) => segment === ".." || segment.startsWith("."))
    || QP4_SECRET_NAME.test(basename(candidate))) return false;
  try { lstatSync(candidate); return false; } catch (error) { if (error?.code !== "ENOENT") return false; }
  try {
    let ancestor = resolve(candidate, "..");
    for (;;) {
      try { return statSync(ancestor).isDirectory() && isPathWithinRoot(realpathSync(ancestor), realpathSync(rootResolved)); } catch (error) {
        if ((error?.code !== "ENOENT" && error?.code !== "ENOTDIR") || ancestor === rootResolved) return false;
        ancestor = resolve(ancestor, "..");
      }
    }
  } catch { return false; }
}

export function readToolScopeVerdict(input, root, dependencies) {
  const toolName = String(input.tool_name);
  const params = input.tool_input ?? {};
  const pluginRoots = registeredPluginReadScopeRoots(dependencies);
  const sessionRoots = [...sessionReadScopeRoots(input, dependencies), ...pluginRoots];
  const path = toolName === "Read" ? params.file_path : params.path ?? ".";
  const selector = toolName === "Glob" ? params.pattern : params.glob;
  const pluginPath = registeredPluginReadPathStatus(path, root, pluginRoots);
  const taskOutput = toolName === "Read" || toolName === "Grep"
    ? claudeTaskOutputReadScope(path, input, root, dependencies)
    : null;
  const targetSafe = (toolName === "Read"
    ? pluginPath !== false && (taskOutput !== null
      || isAllowedPassiveReadTarget(path, { rootDir: root, recursive: true, additionalRecursiveRoots: sessionRoots }))
      && (pluginPath !== true || passiveTargetIsFile(path, root))
    : toolName === "Grep" ? pluginPath !== false && (taskOutput !== null
      || isSafeExactPassiveFile(path, root, sessionRoots)
      || isSafeRegisteredPluginDirectory(path, root, sessionRoots, pluginPath))
    : containedLiteralReadPath(path, root, dependencies, sessionRoots));
  const selectorSafe = toolName === "Glob"
    ? pluginPath !== false && containedRelativeGlob(selector)
      && (/[?*]/u.test(selector)
        ? containedGlobBase(path, root, sessionRoots)
        : isAllowedPassiveReadTarget(join(path, selector), {
          rootDir: root, recursive: true, additionalRecursiveRoots: sessionRoots,
        }))
    : selector === undefined;
  const scoped = targetSafe && selectorSafe;
  if (scoped) return verdict(0);
  if (toolName === "Glob" && qp4InRootWildcardListing(path, selector, root, sessionRoots)) return verdict(0);
  // R2-1 (SEC-11): there is no Grep directory lane; Grep with a directory path is refused exactly as at HEAD.
  if (toolName === "Read" && qp4MissingInRootTarget(path, root)) {
    return verdict(2, "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): GUARD-READ-TARGET-MISSING: the target does not exist inside the project (nothing to read at that path); check the spelling or create it first.\n");
  }
  return verdict(2, "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): GUARD-READ-TARGET: use an exact passive path outside protected credential roots.\n");
}
