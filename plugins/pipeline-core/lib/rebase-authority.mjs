// SPDX-License-Identifier: SUL-1.0
/**
 * rebase-authority — ONE side-effect-free resolver for the question "does a genuine
 * active rebase carry an already-valid approved authority forward, and what is its
 * narrow surface?".
 *
 * WHY THIS FILE EXISTS
 *   backlog: 2026-09-01-an-authorized-rebase-demands-a-fresh-po-signature-after-every-
 *   conflict.md. During a rebase the partially replayed working tree shows an EARLIER
 *   design state (`planApproved: false`), and the lifecycle gate reads that intermediate
 *   state as current authority — so every conflict costs a fresh Ed25519 signature. The
 *   authority that matters is the one at `orig-head`, the true starting point of the
 *   replay, and it is the only thing this module will read an approval out of.
 *
 * WHAT IT DECIDES, AND WHAT IT DELIBERATELY DOES NOT
 *   It decides two things and nothing else: (Requirement 1) whether the state at
 *   `orig-head` is validly approved and in implementation, bound to the full identity of
 *   the repository and of the rebase; and (Requirement 2) which paths and which command
 *   shapes lie inside that rebase's narrow conflict surface. It resolves no conflict, it
 *   grants no push, it writes nothing, and NO GUARD CONSUMES IT YET — wiring is a separate
 *   package. Everything a guard would need is returned as inert, deeply frozen data.
 *
 * THE TWO DIRECTIONS THAT MATTER
 *   - A partial replay must never turn an existing approval back into an apparent draft.
 *     Hence every digest and every state byte comes out of the `orig-head` GIT TREE
 *     (`git cat-file blob <orig-head>:<path>`), never out of the working tree.
 *   - An `orig-head` that is not validly approved must never be turned into an approval by
 *     the presence of a rebase. Hence the lifecycle gate below is a hard AND, and the
 *     terminal statement of every decision function in this file is a refusal.
 *
 * PURITY (structural, not merely untested)
 *   `runGitRead()` refuses any git verb outside READ_ONLY_GIT_VERBS BEFORE it reaches the
 *   injected runner, so no injected dependency can widen this module into a mutator. The
 *   write-capable members in `rebaseAuthorityDeps()` exist so a caller can replace them
 *   with throwing stubs and observe that resolution still succeeds; this module never
 *   calls one.
 *
 * REQUIREMENT 4 (no general exception) IS A CONSTRAINT ON THE RESULT TYPE
 *   The result has a closed key set (REBASE_AUTHORITY_RESULT_KEYS /
 *   REBASE_AUTHORITY_AUTHORITY_KEYS, asserted by the suite). There is no field in which a
 *   session-wide override, a multi-use capability, a maintenance-window extension, an
 *   automatic `--skip`, an `--edit-todo`, an `exec`, an arbitrary `-c`, shell chaining, a
 *   push, a force-push or an approval-mode switch could be reported as authorised — the
 *   absence of remote/push authority is stated as `remoteAuthority: false` /
 *   `pushAuthority: false` rather than left to an omission.
 *
 * REQUIREMENT 5 (the surface is discoverable, and the authority is never opt-in)
 *   A caller that holds a result can ENUMERATE the surface — `conflictPaths`,
 *   `permittedContinuations`, `nextCommand`, `resolutionShapes` — and render a denial
 *   without going back to git for anything. The predicate is the second half of that
 *   contract, never a replacement for it. `rebaseAuthorityRetryActions()` renders the
 *   `pipeline.guard-retry-actions.v1` envelope, and it is non-empty for every result
 *   carrying this module's schema, so a guard can never emit an empty envelope mid-rebase.
 *
 *   One boundary is deliberate and is NOT a shortfall to be fixed by widening this
 *   function. That envelope admits read-only diagnostics only: its sole in-repo consumer
 *   (`lib/human-guard-override.mjs`) drops every action whose `mutation` is not `false`,
 *   and `hooks/guard-lifecycle-ready.mjs` records that AC-047-140 admits an entry only when
 *   "every returned action is a separate-tool-call, independently admitted read-only
 *   diagnostic" — the precise reason `git commit -F` is shipped there as message text
 *   rather than as an action. `git rebase --continue` is a mutation and falls under exactly
 *   that exclusion, so it is carried as DATA (`nextCommand`) for a guard to print, never as
 *   a typed action claiming a read-only guarantee it does not have.
 *
 *   Never opt-in: this authority exists because the repository is genuinely mid-rebase from
 *   a validly approved starting point. There is no flag, no environment variable and no
 *   argument that turns it on, and `resolveRebaseAuthority()` ignores every key beyond
 *   `rootDir` and `deps`.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync,
  renameSync, rmSync, unlinkSync, writeFileSync,
} from "node:fs";
import { isAbsolute, join, posix, relative, resolve, sep } from "node:path";

import { parseGuardCommand } from "../hooks/guard-command-grammar.mjs";
import { derivePlanLifecycle } from "./plan-spec-state-v2.mjs";
import { LEGACY_STATE, NEUTRAL_STATE } from "./project-authority.mjs";
import { extractShellWriteTargets } from "./protected-test-paths.mjs";

export const REBASE_AUTHORITY_SCHEMA = "pipeline.rebase-authority.v1";

/** The envelope a guard already emits for machine-readable retry guidance. */
export const REBASE_AUTHORITY_RETRY_ACTIONS_SCHEMA = "pipeline.guard-retry-actions.v1";

/** The token `resolutionShapes` carries where a real conflict path belongs. */
export const CONFLICT_PATH_PLACEHOLDER = "<conflict-path>";

/**
 * The only git verbs this module may ever run. Enforced in `runGitRead()` — i.e. on the
 * module's own side of the dependency boundary — so that "never spawns a mutating git
 * command" holds for every caller, including one that injects a permissive runner.
 */
export const READ_ONLY_GIT_VERBS = Object.freeze(new Set(["rev-parse", "cat-file", "diff"]));

/** Full, lowercase git object ids only: SHA-1 (40) or SHA-256 (64). Never abbreviated. */
const FULL_LOWERCASE_OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

/** `head-name` must name a real branch ref, not a detached-HEAD placeholder. */
const BRANCH_REF = /^refs\/heads\/[^\s\0]+$/u;

/**
 * The exact global-option spelling Requirement 2 names, and the only one admitted — and
 * only in front of `rebase --continue`. `git rebase` opens an editor on some paths; this
 * is the documented way to stop it doing so. Any other `-c KEY=VALUE`, including a glued
 * `-ccore.editor=true`, is refused (Requirement 4: "no arbitrary `-c`").
 */
const ADMITTED_GLOBAL_CONFIG = Object.freeze(["-c", "core.editor=true"]);

/**
 * Exact `git rebase` continuations this authority covers. `--abort` is deliberately NOT
 * here: the spec keeps it on its existing narrow recovery semantics, independent of this
 * authority, and quietly absorbing it would widen the surface by accident. `--skip`,
 * `--edit-todo` and `--exec` are absent by construction, not by filtering.
 */
const ADMITTED_REBASE_TAILS = Object.freeze([
  Object.freeze(["--continue"]),
  Object.freeze(["--show-current-patch"]),
]);

/**
 * Conflict-resolution subcommands and the flags each may carry, keyed by verb. Every one
 * of them REQUIRES an explicit `--` and takes its pathspecs only after it: without the
 * separator git's own grammar is ambiguous between a revision and a path, and an ambiguous
 * token must never be resolved in the permissive direction here.
 */
const CONFLICT_COMMAND_FLAGS = Object.freeze(new Map([
  ["checkout", Object.freeze(new Set(["--ours", "--theirs"]))],
  ["restore", Object.freeze(new Set(["--ours", "--theirs", "--worktree"]))],
  ["add", Object.freeze(new Set([]))],
]));

/**
 * Requirement 4's prohibition list as executable data, so the suite demonstrates the
 * property rather than restating it. Each entry is a shape that must never be reported as
 * authorised, whatever the resolved authority says.
 */
export const REBASE_AUTHORITY_PROHIBITED_SHAPES = Object.freeze([
  Object.freeze({ id: "edit-todo", command: "git rebase --edit-todo" }),
  Object.freeze({ id: "exec", command: "git rebase --exec 'touch marker'" }),
  Object.freeze({ id: "exec-glued", command: "git rebase --exec=./run.sh" }),
  Object.freeze({ id: "automatic-skip", command: "git rebase --skip" }),
  Object.freeze({ id: "arbitrary-config", command: "git -c core.hooksPath=none rebase --continue" }),
  Object.freeze({ id: "glued-config", command: "git -ccore.editor=true rebase --continue" }),
  Object.freeze({ id: "push", command: "git push origin HEAD" }),
  Object.freeze({ id: "force-push", command: "git push --force origin main" }),
  Object.freeze({ id: "force-with-lease", command: "git push --force-with-lease" }),
  Object.freeze({ id: "shell-chaining", command: "git rebase --continue && git push" }),
  Object.freeze({ id: "shell-chaining-semicolon", command: "git rebase --continue ; git push" }),
]);

/** The closed key set of the resolver's result. */
export const REBASE_AUTHORITY_RESULT_KEYS = Object.freeze(["schema", "status", "code", "detail", "authority"]);

/** The closed key set of the `authority` payload on an authorized result. */
export const REBASE_AUTHORITY_AUTHORITY_KEYS = Object.freeze([
  "backend", "conflictPaths", "doneSha256", "headName", "lifecycle", "nextCommand", "onto",
  "origHead", "originalFeature", "permittedContinuations", "plan", "pushAuthority",
  "remoteAuthority", "repository", "resolutionShapes", "scope", "sessionWide", "spec",
  "statePath", "todoSha256",
]);

/**
 * The exact continuations, as renderable command strings, DERIVED from the same tables the
 * predicate enforces — so the text a guard prints can never drift from what is actually
 * permitted. The suite asserts every one of these is permitted by
 * `rebaseAuthorityPermitsCommand()`.
 */
function permittedContinuationCommands() {
  return [
    `git ${ADMITTED_GLOBAL_CONFIG.join(" ")} rebase --continue`,
    ...ADMITTED_REBASE_TAILS.map((tail) => `git rebase ${tail.join(" ")}`),
  ];
}

/**
 * Renderable templates for the conflict-resolution commands, one per admitted verb/flag
 * pair, with CONFLICT_PATH_PLACEHOLDER where a path from `conflictPaths` belongs. Also
 * derived from the enforcing table rather than restated. Edit/Write/apply_patch resolutions
 * need no template: their surface is exactly `conflictPaths`.
 */
function resolutionShapeTemplates() {
  const shapes = [];
  for (const [verb, flags] of CONFLICT_COMMAND_FLAGS) {
    if (flags.size === 0) shapes.push(`git ${verb} -- ${CONFLICT_PATH_PLACEHOLDER}`);
    for (const flag of flags) shapes.push(`git ${verb} ${flag} -- ${CONFLICT_PATH_PLACEHOLDER}`);
  }
  return shapes;
}

/**
 * Dependency object, same `deps(overrides)` shape this codebase already uses for injected
 * filesystem access. The write-capable members are listed on purpose: they let a caller
 * replace every mutating capability with a throwing stub and observe that resolution is
 * unaffected. This module calls none of them.
 */
export function rebaseAuthorityDeps(overrides = {}) {
  return {
    existsSync, lstatSync, readFileSync, realpathSync,
    gitRead: defaultGitRead,
    // write-capable, never called (see the module header's PURITY note)
    appendFileSync, mkdirSync, renameSync, rmSync, spawnSync, unlinkSync, writeFileSync,
    ...overrides,
  };
}

/** Default read-only git runner. Returns raw BYTES: a digest over re-encoded text drifts. */
function defaultGitRead({ rootDir, argv }) {
  const result = spawnSync("git", ["-C", rootDir, ...argv], { encoding: "buffer" });
  if (result.error !== undefined || typeof result.status !== "number") return { ok: false, stdout: Buffer.alloc(0) };
  return { ok: result.status === 0, stdout: Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.alloc(0) };
}

function sha256Hex(bytes) {
  return createHash("sha256").update(Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes), "utf8")).digest("hex");
}

function refused(code, detail = null) {
  return Object.freeze({ schema: REBASE_AUTHORITY_SCHEMA, status: "refused", code, detail, authority: null });
}

class Refusal extends Error {
  constructor(code, detail = null) {
    super(code);
    this.code = code;
    this.detail = detail;
  }
}

function refuse(code, detail = null) {
  throw new Refusal(code, detail);
}

/**
 * The module's own read-only boundary. A verb outside READ_ONLY_GIT_VERBS never reaches
 * the injected runner, so no dependency object can make this module mutate a repository.
 */
function runGitRead(deps, rootDir, argv) {
  const verb = argv[0];
  if (!READ_ONLY_GIT_VERBS.has(verb)) refuse("REBASE-AUTHORITY-NON-READ-GIT-VERB", verb ?? null);
  const result = deps.gitRead({ rootDir, argv });
  if (result === null || typeof result !== "object") return { ok: false, stdout: Buffer.alloc(0) };
  return { ok: result.ok === true, stdout: Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(String(result.stdout ?? ""), "utf8") };
}

function gitReadText(deps, rootDir, argv, code) {
  const result = runGitRead(deps, rootDir, argv);
  if (!result.ok) refuse(code, argv.join(" "));
  return result.stdout.toString("utf8").trim();
}

/** Raw blob bytes at an exact tree-ish. The digest source for plan/spec and for the state. */
function readBlobAt(deps, rootDir, oid, path) {
  const result = runGitRead(deps, rootDir, ["cat-file", "blob", `${oid}:${path}`]);
  return result.ok ? result.stdout : null;
}

function readRebaseFile(deps, dir, name) {
  const path = join(dir, name);
  if (!deps.existsSync(path)) return null;
  try {
    const bytes = deps.readFileSync(path);
    return Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes), "utf8");
  } catch {
    return null;
  }
}

/**
 * Project-relative form of a candidate path, or null when it is not a path inside this
 * repository at all. Mirrors `guard-devplan-policy`'s resolution order (absolute against
 * the root, backslashes slashified, POSIX traversal collapsed BEFORE any comparison).
 */
function repoRelative(root, candidate) {
  if (typeof candidate !== "string" || candidate === "" || candidate.includes("\0")) return null;
  let rel = candidate;
  if (isAbsolute(candidate)) {
    const raw = relative(root, candidate);
    if (raw === "" || isAbsolute(raw)) return null;
    const slashed = raw.replace(/\\/gu, "/");
    if (raw === ".." || slashed.startsWith("../")) return null;
    rel = raw;
  }
  rel = posix.normalize(rel.replace(/\\/gu, "/"));
  if (rel === "" || rel === "." || rel === ".." || rel.startsWith("../") || rel.startsWith("/")) return null;
  return rel;
}

/**
 * Resolve the rebase authority for a repository root.
 *
 * @param {{rootDir: string, deps?: object}} args
 * @returns {Readonly<{schema: string, status: "authorized"|"refused", code: string,
 *   detail: string|null, authority: object|null}>} deeply frozen; `authority` is null on
 *   every refusal.
 */
export function resolveRebaseAuthority({ rootDir, deps: overrides } = {}) {
  const deps = rebaseAuthorityDeps(overrides);
  try {
    return deepFreeze({
      schema: REBASE_AUTHORITY_SCHEMA,
      status: "authorized",
      code: "REBASE-AUTHORITY-CURRENT",
      detail: null,
      authority: resolveAuthority(rootDir, deps),
    });
  } catch (error) {
    if (error instanceof Refusal) return refused(error.code, error.detail);
    return refused("REBASE-AUTHORITY-RESOLVE-FAILED", String(error?.message ?? error));
  }
}

function resolveAuthority(rootDir, deps) {
  // ---- 1. real repository identity, and the git-common-dir identity -------------------
  if (typeof rootDir !== "string" || rootDir === "") refuse("REBASE-AUTHORITY-ROOT-INVALID");
  const requested = resolve(rootDir);
  let info;
  try { info = deps.lstatSync(requested); } catch { refuse("REBASE-AUTHORITY-ROOT-UNREADABLE"); }
  if (!info.isDirectory() || info.isSymbolicLink()) refuse("REBASE-AUTHORITY-ROOT-INVALID");
  const root = deps.realpathSync(requested);

  const gitDirRaw = gitReadText(deps, root, ["rev-parse", "--absolute-git-dir"], "REBASE-AUTHORITY-GIT-DIR-UNRESOLVABLE");
  const commonDirRaw = gitReadText(deps, root, ["rev-parse", "--git-common-dir"], "REBASE-AUTHORITY-COMMON-DIR-UNRESOLVABLE");
  const gitDir = deps.realpathSync(resolve(root, gitDirRaw));
  const commonDir = deps.realpathSync(resolve(root, commonDirRaw));
  const repository = {
    root,
    gitDir,
    commonDir,
    linkedWorktree: gitDir !== commonDir,
    fingerprint: sha256Hex(Buffer.from(`${root}\n${gitDir}\n${commonDir}`, "utf8")),
  };

  // ---- 2. a GENUINE active rebase, on the backend this module supports ----------------
  // The rebase state directory is per-worktree, so it lives under the git dir, never the
  // common dir. `rebase-apply` (the `am` backend) has no `git-rebase-todo` and no `done`,
  // so Requirement 1's todo/completed hashes have no source there: it is refused rather
  // than served with an invented mapping.
  const mergeDir = join(gitDir, "rebase-merge");
  if (!deps.existsSync(mergeDir)) {
    if (deps.existsSync(join(gitDir, "rebase-apply"))) refuse("REBASE-AUTHORITY-BACKEND-UNSUPPORTED", "rebase-apply");
    refuse("REBASE-AUTHORITY-NO-ACTIVE-REBASE");
  }

  const headName = (readRebaseFile(deps, mergeDir, "head-name")?.toString("utf8") ?? "").trim();
  if (!BRANCH_REF.test(headName)) refuse("REBASE-AUTHORITY-HEAD-NAME-INVALID");
  const origHead = (readRebaseFile(deps, mergeDir, "orig-head")?.toString("utf8") ?? "").trim();
  const onto = (readRebaseFile(deps, mergeDir, "onto")?.toString("utf8") ?? "").trim();
  if (!FULL_LOWERCASE_OID.test(origHead)) refuse("REBASE-AUTHORITY-ORIG-HEAD-INVALID");
  if (!FULL_LOWERCASE_OID.test(onto)) refuse("REBASE-AUTHORITY-ONTO-INVALID");

  const todoBytes = readRebaseFile(deps, mergeDir, "git-rebase-todo");
  if (todoBytes === null) refuse("REBASE-AUTHORITY-TODO-ABSENT");
  // `done` is absent until the first step is replayed; an empty completed portion is a
  // real observation with a real digest, not a default.
  const doneBytes = readRebaseFile(deps, mergeDir, "done") ?? Buffer.alloc(0);

  // The rebase files could name anything; bind to an object this repository actually has.
  const origHeadType = gitReadText(deps, root, ["cat-file", "-t", origHead], "REBASE-AUTHORITY-ORIG-HEAD-UNRESOLVABLE");
  if (origHeadType !== "commit") refuse("REBASE-AUTHORITY-ORIG-HEAD-UNRESOLVABLE", origHeadType);

  // ---- 3. the ORIGINAL feature state, from the orig-head tree -------------------------
  let statePath = null;
  let stateBytes = null;
  for (const candidate of [NEUTRAL_STATE, LEGACY_STATE]) {
    const bytes = readBlobAt(deps, root, origHead, candidate);
    if (bytes !== null) { statePath = candidate; stateBytes = bytes; break; }
  }
  if (stateBytes === null) refuse("REBASE-AUTHORITY-STATE-ABSENT-AT-ORIG-HEAD");
  let state;
  try { state = JSON.parse(stateBytes.toString("utf8")); } catch { refuse("REBASE-AUTHORITY-STATE-INVALID-AT-ORIG-HEAD"); }
  const activeFeature = state?.activeFeature;
  if (activeFeature === null || typeof activeFeature !== "object" || typeof activeFeature.id !== "string" || activeFeature.id === "") {
    refuse("REBASE-AUTHORITY-NO-ACTIVE-FEATURE-AT-ORIG-HEAD");
  }

  // ---- 4. plan and spec BYTES, also from the orig-head tree ---------------------------
  // Same precedence as the dev-plan gate: the submission's paths first, the sealed
  // approval authority's second. Read out of the orig-head state, never the working tree —
  // reading the paths from the working tree is a quieter form of the same defect.
  const submitted = state.planSubmission;
  const approvalAuthority = state.planApproval?.poGateAuthority;
  const planPath = typeof submitted?.planPath === "string" ? submitted.planPath : approvalAuthority?.planPath;
  const specPath = typeof submitted?.specPath === "string" ? submitted.specPath : approvalAuthority?.specPath;
  if (typeof planPath !== "string" || planPath === "") refuse("REBASE-AUTHORITY-PLAN-PATH-ABSENT-AT-ORIG-HEAD");
  if (typeof specPath !== "string" || specPath === "") refuse("REBASE-AUTHORITY-SPEC-PATH-ABSENT-AT-ORIG-HEAD");
  const planBytes = readBlobAt(deps, root, origHead, planPath);
  if (planBytes === null) refuse("REBASE-AUTHORITY-PLAN-BYTES-ABSENT-AT-ORIG-HEAD", planPath);
  const specBytes = readBlobAt(deps, root, origHead, specPath);
  if (specBytes === null) refuse("REBASE-AUTHORITY-SPEC-BYTES-ABSENT-AT-ORIG-HEAD", specPath);
  const planSha256 = sha256Hex(planBytes);
  const specSha256 = sha256Hex(specBytes);

  // ---- 5. a lifecycle of `implementing`, DERIVED from exactly those bytes -------------
  // The hard AND that makes negative case 7 structural: a rebase can never manufacture an
  // approval, it can only carry one that was already valid at the true starting point.
  const lifecycle = derivePlanLifecycle(state, { planSha256, specSha256 });
  if (state.planApproved !== true
    || lifecycle.ok !== true
    || lifecycle.status !== "implementing"
    || lifecycle.nextAction !== null) {
    refuse("REBASE-AUTHORITY-ORIG-HEAD-NOT-IMPLEMENTING", lifecycle.code ?? null);
  }

  // ---- 6. the currently conflicted paths ---------------------------------------------
  const conflicts = runGitRead(deps, root, ["diff", "--name-only", "--diff-filter=U", "-z"]);
  if (!conflicts.ok) refuse("REBASE-AUTHORITY-CONFLICT-SET-UNREADABLE");
  const conflictPaths = [...new Set(conflicts.stdout.toString("utf8").split("\0")
    .map((entry) => repoRelative(root, entry))
    .filter((entry) => entry !== null))].sort();

  const continuations = permittedContinuationCommands();
  return {
    backend: "merge",
    conflictPaths,
    doneSha256: sha256Hex(doneBytes),
    headName,
    lifecycle: { ok: true, status: lifecycle.status, code: lifecycle.code },
    // The exact next command, as data a guard prints — never as a typed retry action (see
    // the module header's Requirement 5 note: that envelope is read-only-diagnostic only).
    nextCommand: continuations[0],
    onto,
    origHead,
    originalFeature: { id: activeFeature.id, phase: activeFeature.phase ?? null },
    permittedContinuations: continuations,
    plan: { path: planPath, sha256: planSha256 },
    // Stated, never omitted: this authority carries no remote and no push capability.
    pushAuthority: false,
    remoteAuthority: false,
    repository,
    resolutionShapes: resolutionShapeTemplates(),
    scope: "single-active-rebase-conflict-surface",
    sessionWide: false,
    spec: { path: specPath, sha256: specSha256 },
    statePath,
    todoSha256: sha256Hex(todoBytes),
  };
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

/** An authorized result of this module's own shape — never a caller-shaped look-alike. */
function authorityOf(result) {
  if (result === null || typeof result !== "object") return null;
  if (result.schema !== REBASE_AUTHORITY_SCHEMA || result.status !== "authorized") return null;
  const authority = result.authority;
  if (authority === null || typeof authority !== "object" || !Array.isArray(authority.conflictPaths)) return null;
  return authority;
}

/**
 * Is `candidatePath` inside this rebase's current conflict surface?
 *
 * Deny-by-default: an implementation file untouched by a conflict does not become editable
 * because a rebase is active somewhere. No options bag — an options bag is where a future
 * escape hatch lands.
 *
 * @param {object} result a result from `resolveRebaseAuthority()`
 * @param {string} candidatePath absolute or repository-relative
 * @returns {boolean}
 */
export function rebaseAuthorityPermitsPath(result, candidatePath) {
  const authority = authorityOf(result);
  if (authority === null) return false;
  const rel = repoRelative(authority.repository.root, candidatePath);
  if (rel === null) return false;
  if (authority.conflictPaths.includes(rel)) return true;
  return false;
}

/**
 * Is `command` an exact continuation or a conflict resolution inside this rebase's surface?
 *
 * Allowlist first, then narrow: a permit is reachable only through an enumerated shape, and
 * every enumerated shape's real pathspecs are re-checked against the conflict surface using
 * the guards' OWN extraction (`extractShellWriteTargets()`), so this predicate cannot
 * disagree with a guard about what a command's argv is. The terminal statement is `false`.
 *
 * @param {object} result a result from `resolveRebaseAuthority()`
 * @param {string} command one simple shell command
 * @returns {boolean}
 */
export function rebaseAuthorityPermitsCommand(result, command) {
  const authority = authorityOf(result);
  if (authority === null) return false;
  if (typeof command !== "string" || command.trim() === "") return false;
  const root = authority.repository.root;

  const parsed = parseGuardCommand(command, root);
  if (parsed?.parseStatus !== "accepted") return false;
  // Chaining and redirection are refused structurally, not by pattern-matching operators.
  if (!Array.isArray(parsed.segments) || parsed.segments.length !== 1) return false;
  if (Array.isArray(parsed.redirects) && parsed.redirects.length > 0) return false;

  const segment = parsed.segments[0];
  const executable = String(segment?.executable ?? "").replace(/\\/gu, "/").split("/").at(-1)?.toLowerCase().replace(/\.exe$/u, "");
  if (executable !== "git") return false;

  const argv = Array.isArray(segment.argv) ? [...segment.argv] : null;
  if (argv === null) return false;

  // Global options: at most the one admitted `-c core.editor=true`, and only before
  // `rebase --continue`. Any other dash-prefixed global token (including a glued `-c…`)
  // ends the walk in a refusal rather than being skipped over.
  let index = 0;
  let admittedConfig = false;
  while (index < argv.length && argv[index].startsWith("-")) {
    if (argv[index] !== ADMITTED_GLOBAL_CONFIG[0] || argv[index + 1] !== ADMITTED_GLOBAL_CONFIG[1]) return false;
    if (admittedConfig) return false;
    admittedConfig = true;
    index += 2;
  }
  const verb = argv[index] ?? null;
  const tail = argv.slice(index + 1);
  if (admittedConfig && !(verb === "rebase" && tail.length === 1 && tail[0] === "--continue")) return false;

  if (verb === "rebase") {
    if (!ADMITTED_REBASE_TAILS.some((admitted) => admitted.length === tail.length && admitted.every((token, at) => token === tail[at]))) {
      return false;
    }
    return writeTargetsInsideSurface(result, command, root);
  }

  const flags = CONFLICT_COMMAND_FLAGS.get(verb ?? "");
  if (flags === undefined) return false;
  const separator = tail.indexOf("--");
  // No explicit `--` means git's grammar is ambiguous between a revision and a pathspec.
  if (separator === -1) return false;
  for (const token of tail.slice(0, separator)) {
    if (!flags.has(token)) return false;
  }
  const pathspecs = tail.slice(separator + 1);
  if (pathspecs.length === 0) return false;
  for (const pathspec of pathspecs) {
    if (!rebaseAuthorityPermitsPath(result, pathspec)) return false;
  }
  return writeTargetsInsideSurface(result, command, root);
}

/**
 * Every write target the guards' own extractor sees in this command must lie inside the
 * conflict surface. This is the second lock, not the first: an empty extraction can never
 * admit a command on its own, because a permit is only reachable after an enumerated shape
 * already matched above.
 */
/**
 * The `pipeline.guard-retry-actions.v1` envelope for a result, so a consuming guard renders
 * the surface instead of re-deriving it from git at denial time.
 *
 * Every action is an independently admitted, separate-tool-call READ-ONLY diagnostic, which
 * is the only thing that envelope admits (`mutation: false` and `requiresConfirmation:
 * false` are contractual, not decorative — the envelope's in-repo consumer drops anything
 * else). The mutating continuation lives on the result as `nextCommand` for the denial's
 * prose. `retryActions` is non-empty for every result carrying this module's schema, so an
 * empty envelope during an active rebase cannot arise here.
 *
 * @param {object} result a result from `resolveRebaseAuthority()`
 * @returns {Readonly<{schema: string, retryActions: ReadonlyArray<object>}>}
 */
export function rebaseAuthorityRetryActions(result) {
  if (result === null || typeof result !== "object" || result.schema !== REBASE_AUTHORITY_SCHEMA) {
    return deepFreeze({ schema: REBASE_AUTHORITY_RETRY_ACTIONS_SCHEMA, retryActions: [] });
  }
  return deepFreeze({
    schema: REBASE_AUTHORITY_RETRY_ACTIONS_SCHEMA,
    retryActions: [
      ["rebase", "--show-current-patch"],
      ["diff", "--name-only", "--diff-filter=U"],
      ["status", "--short"],
    ].map((argv) => ({ executable: "git", argv, mutation: false, requiresConfirmation: false })),
  });
}

function writeTargetsInsideSurface(result, command, root) {
  for (const target of extractShellWriteTargets({ command, root })) {
    if (!rebaseAuthorityPermitsPath(result, target.candidate)) return false;
  }
  return true;
}
