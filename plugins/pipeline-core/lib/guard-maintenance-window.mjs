// SPDX-License-Identifier: SUL-1.0
/**
 * Guard Maintenance Window (GMW) — ADR-0058.
 *
 * A PO-signed, time-boxed record that lets a small, closed set of self-protecting
 * guard rules (GS-6, the live plugin root; TP-*, configured protected test paths)
 * honor an additional "allow" path alongside their existing unconditional deny. It
 * grants nothing else: GS-1..GS-5/GS-7 and the hardcoded kernel below stay
 * permanently unreachable through this module, regardless of what a signed payload
 * claims. See docs/adr/0058-guard-maintenance-window.md and
 * docs/guard-maintenance-window-threat-model.md for the decision and its threat
 * model; specs/sprint-nova-epic/design/2026-08-07-guard-maintenance-window-design.md
 * for the concrete contract this file implements.
 *
 * NO IN-SESSION ACTIVATION STEP. `prepare` is agent-safe (produces only a public,
 * digest-bound request). `install` is agent-safe but verify-and-place ONLY: it
 * cannot succeed without a genuine detached Ed25519 proof signed by the PO's own
 * key, structurally identical to the guarantee `po-approval-proof.mjs` already
 * gives push approval. There is no "arm" step: presence of a valid, unexpired,
 * correctly-bound window record *is* the window.
 *
 * DUPLICATION NOTE (read before touching physicalRoot/topology/secureDirectory/
 * safePrivateFile/writeAtomic/pluginTreeSha256 below). `lib/human-guard-override.mjs`
 * implements equivalent helpers, but it is a read-only reference for this module
 * (NOVA-GMW-1 briefing, Forbidden section) — none of them are exported from it in a
 * form this module may import, and this module MUST NOT modify that file. So the
 * small physical-safety primitives below are an intentional, narrow, second
 * definition, not an oversight. Several other lib modules in this plugin already
 * carry their own local `physicalRoot`/`topology` for the same reason (e.g.
 * `private-overlay-activation.mjs`, `onboarding-continuity.mjs`,
 * `codex-onboarding-capabilities.mjs`) — this is the established pattern when a
 * module cannot import the canonical implementation, not a novel shortcut.
 * `livePluginRoots()`/`insideLivePlugin()` from `../hooks/guard-gate-strength.mjs`
 * are the design note's sanctioned reuse point for live-plugin-root detection (do
 * not duplicate that logic) — but this module does NOT import them directly: doing
 * so would create an import cycle, since `guard-gate-strength.mjs`'s own GS-6
 * branch must in turn import `windowCoversRule`/`isNeverLiftableKernelPath` FROM
 * here. Instead, every function here that needs to know "the live plugin root"
 * (`prepareGuardMaintenanceWindowRequest`, `installGuardMaintenanceWindow`,
 * `isNeverLiftableKernelPath`) takes it as an explicit `livePluginRoot` parameter;
 * the one caller that already has `livePluginRoots()` available locally
 * (`guard-gate-strength.mjs` itself, and the CLI, which imports it directly) is
 * responsible for supplying it. `windowCoversRule`/`currentGuardMaintenanceWindow`
 * need no such parameter at all: they only re-verify an already-installed record,
 * never recompute a live tree hash.
 */
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

import { createPoApprovalIntent, verifyPoApprovalProof } from "./po-approval-proof.mjs";
import { readCriticalHumanProofPolicy, verifyAgainstTrustAnchors } from "./critical-human-proof-policy.mjs";
import { assessWindowsPrivatePath, hardenWindowsPrivateDirectory } from "./windows-private-state.mjs";

export class GuardMaintenanceWindowError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "GuardMaintenanceWindowError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new GuardMaintenanceWindowError(code, message);
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (object(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha(value) {
  return createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : canonical(value)).digest("hex");
}

const SHA256 = /^[a-f0-9]{64}$/u;

// ---------------------------------------------------------------------------------
// Constants (design note: "New file: lib/guard-maintenance-window.mjs")
// ---------------------------------------------------------------------------------

/** GS-6 is the only enumerated liftable id; every TP-* id is liftable by prefix. */
export const LIFTABLE_RULE_IDS = Object.freeze(["GS-6"]);
const LIFTABLE_TP_PREFIX = "TP-";

/** True only for "GS-6" or an id starting "TP-" — never for GS-1..GS-5/GS-7 or anything else. */
export function isLiftableRuleId(ruleId) {
  return typeof ruleId === "string" && (LIFTABLE_RULE_IDS.includes(ruleId) || ruleId.startsWith(LIFTABLE_TP_PREFIX));
}

/**
 * Repository-relative paths that are refused unconditionally, before any window
 * lookup at all — the code that verifies windows, that decides whether GS-6 fires,
 * the plugin's own manifest, the grammar/lifecycle guards, and the trust anchor
 * itself. A window covering one of these paths is worthless-by-construction: the
 * calling guard checks this list FIRST and never reaches `windowCoversRule` at all
 * for a kernel path.
 */
export const NEVER_LIFTABLE_KERNEL_PATHS = Object.freeze([
  "plugins/pipeline-core/hooks/guard-gate-strength.mjs",
  "plugins/pipeline-core/lib/guard-maintenance-window.mjs",
  "plugins/pipeline-core/hooks/hooks.json",
  "plugins/pipeline-core/lib/tool-write-target.mjs",
  "plugins/pipeline-core/hooks/guard-command-grammar.mjs",
  "plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs",
  "project/critical-human-proof.json",
]);

// The "plugins/pipeline-core/..." entries above are written against whatever
// directory CONTAINS the currently-enforcing plugin root's own "plugins/pipeline-core"
// segment. In a self-hosted checkout that anchor is the project root, but in a
// globally-installed marketplace copy the live plugin root is NOT inside `rootDir`
// at all (guard-gate-strength.mjs's own `livePluginRoots()` deliberately decouples
// "the copy that is enforcing right now" from the project directory). Checking only
// against `rootDir` would therefore silently miss every "plugins/pipeline-core/..."
// kernel entry in that layout -- exactly the recursive hole ADR-0058 names ("a GS-6
// window covers the code that verifies GS-6 windows"). So this checks BOTH anchors.
const PLUGIN_KERNEL_SUFFIXES = NEVER_LIFTABLE_KERNEL_PATHS
  .filter((path) => path.startsWith("plugins/pipeline-core/"))
  .map((path) => path.slice("plugins/pipeline-core/".length).toLowerCase());
const PROJECT_KERNEL_PATHS = NEVER_LIFTABLE_KERNEL_PATHS
  .filter((path) => !path.startsWith("plugins/pipeline-core/"))
  .map((path) => path.toLowerCase());

/** Same normalization as `gateStrengthRuleFor`: forward-slashed, case-insensitive, root-relative. Null when `filePath` escapes `anchor`. */
function normalizeRepoRelativePath(anchor, filePath) {
  if (typeof filePath !== "string" || filePath.length === 0) return null;
  let root;
  try { root = resolve(anchor); } catch { return null; }
  const absolute = isAbsolute(filePath) ? resolve(filePath) : resolve(root, filePath);
  const rel = relative(root, absolute);
  if (rel === "" || rel.startsWith(`..${sep}`) || rel === "..") return null;
  return rel.split(sep).join("/").toLowerCase();
}

/**
 * True when `filePath` names a hardcoded kernel path. `livePluginRoot`, when
 * supplied, is checked as its own anchor (its parent directory) IN ADDITION to
 * `rootDir`, so a globally-installed plugin's kernel files are still caught even
 * though they are not inside the governed project.
 */
export function isNeverLiftableKernelPath(filePath, { rootDir, livePluginRoot = null } = {}) {
  const projectRelative = normalizeRepoRelativePath(rootDir, filePath);
  if (projectRelative !== null && PROJECT_KERNEL_PATHS.includes(projectRelative)) return true;
  if (projectRelative !== null && PLUGIN_KERNEL_SUFFIXES.some((suffix) => projectRelative === `plugins/pipeline-core/${suffix}`)) return true;
  if (livePluginRoot) {
    const pluginRelative = normalizeRepoRelativePath(livePluginRoot, filePath);
    if (pluginRelative !== null && PLUGIN_KERNEL_SUFFIXES.includes(pluginRelative)) return true;
  }
  return false;
}

/** Fixed, short ceiling: hours, not days (ADR-0058 point 4). */
export const MAX_WINDOW_TTL_MS = 4 * 60 * 60 * 1000;

const GMW_REQUEST_SCHEMA = "pipeline.guard-maintenance-window-request.v1";
const GMW_WINDOW_SCHEMA = "pipeline.guard-maintenance-window.v1";

// ---------------------------------------------------------------------------------
// Physical-safety / storage primitives (duplicated from human-guard-override.mjs;
// see the DUPLICATION NOTE at the top of this file).
// ---------------------------------------------------------------------------------

function physicalRoot(root) {
  const physical = realpathSync(resolve(root));
  const info = lstatSync(physical);
  if (!info.isDirectory() || info.isSymbolicLink()) fail("GMW-ROOT", "repository root is not physical");
  return physical;
}

function git(root, args, spawn = spawnSync) {
  const result = spawn("git", args, { cwd: root, encoding: "utf8", shell: false, timeout: 5000 });
  if (result?.status !== 0 || result?.error) {
    const operation = args.map((value) => String(value).replace(/[^A-Za-z0-9._=-]/gu, "_")).join("-").slice(0, 120);
    const outcome = result?.error?.code ?? result?.error?.name ?? result?.signal ?? `exit-${String(result?.status)}`;
    fail("GMW-GIT", `repository identity is unavailable (operation=${operation}, outcome=${outcome})`);
  }
  return String(result.stdout ?? "").trim();
}

function topology(root, spawn = spawnSync) {
  const physical = physicalRoot(root);
  const top = realpathSync(git(physical, ["rev-parse", "--show-toplevel"], spawn));
  if (top !== physical) fail("GMW-ROOT", "window root must be the physical repository top");
  const rawCommon = git(physical, ["rev-parse", "--path-format=absolute", "--git-common-dir"], spawn);
  const common = realpathSync(isAbsolute(rawCommon) ? rawCommon : resolve(physical, rawCommon));
  const info = lstatSync(common);
  if (!info.isDirectory() || info.isSymbolicLink()) fail("GMW-COMMON-DIR", "Git common directory is unsafe");
  return { root: physical, common };
}

function secureDirectory(path, {
  platform = process.platform,
  assessWindowsPrivatePathFn = assessWindowsPrivatePath,
  hardenWindowsPrivateDirectoryFn = hardenWindowsPrivateDirectory,
} = {}) {
  const existed = existsSync(path);
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const info = lstatSync(path);
  if (!info.isDirectory() || info.isSymbolicLink()) fail("GMW-STORAGE", "window directory is unsafe");
  if (platform === "win32") {
    const assurance = existed ? assessWindowsPrivatePathFn(path) : hardenWindowsPrivateDirectoryFn(path);
    if (assurance.status !== "secure") fail("GMW-DACL", "window directory DACL is not owner-private");
  } else if ((info.mode & 0o077) !== 0) {
    try { chmodSync(path, 0o700); } catch {}
    if ((lstatSync(path).mode & 0o077) !== 0) fail("GMW-PERMISSIONS", "window directory is not owner-private");
  }
  return path;
}

function safePrivateFile(path, { platform = process.platform, assessWindowsPrivatePathFn = assessWindowsPrivatePath } = {}) {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) fail("GMW-STORAGE", "window file is unsafe");
  if (platform === "win32") {
    if (assessWindowsPrivatePathFn(path).status !== "secure") fail("GMW-DACL", "window file DACL is not owner-private");
  } else if ((info.mode & 0o077) !== 0) fail("GMW-PERMISSIONS", "window file is not owner-private");
  return info;
}

function writeExclusive(path, bytes) {
  const fd = openSync(path, "wx", 0o600);
  try { writeFileSync(fd, bytes); } finally { closeSync(fd); }
  safePrivateFile(path);
}

function writeAtomic(path, bytes) {
  const tmp = `${path}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    writeExclusive(tmp, bytes);
    renameSync(tmp, path);
    safePrivateFile(path);
  } finally {
    try { unlinkSync(tmp); } catch {}
  }
}

function storagePaths(common) {
  const base = secureDirectory(join(common, "agent-pipeline", "guard-maintenance-window"));
  return { base, request: join(base, "request.json"), window: join(base, "window.json") };
}

/** Same algorithm as human-guard-override.mjs's `pluginSourceTreeSha256` (duplicated; see header). */
function pluginTreeSha256(root) {
  const entries = [];
  const visit = (directory, prefix = "") => {
    const children = readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const relativePath = prefix === "" ? child.name : `${prefix}/${child.name}`;
      const absolutePath = join(directory, child.name);
      const info = lstatSync(absolutePath);
      if (info.isSymbolicLink()) fail("GMW-PLUGIN-SOURCE", "live plugin root contains a symbolic link");
      if (info.isDirectory()) { visit(absolutePath, relativePath); continue; }
      if (!info.isFile() || info.nlink !== 1 || realpathSync(absolutePath) !== absolutePath) {
        fail("GMW-PLUGIN-SOURCE", "live plugin root contains an unsafe entry");
      }
      entries.push({ path: relativePath, sha256: sha(readFileSync(absolutePath)) });
    }
  };
  visit(root);
  return sha(entries);
}

function repoFingerprint(repo) {
  return sha({ physicalRoot: repo.root, physicalCommon: repo.common });
}

// ---------------------------------------------------------------------------------
// Request shape validation
// ---------------------------------------------------------------------------------

function validSubject(value) {
  return object(value)
    && Array.isArray(value.scopeRuleIds) && value.scopeRuleIds.length > 0
    && value.scopeRuleIds.every((id) => typeof id === "string")
    // `expiresAtMs` is the SIGNED, absolute bound (F1/F2 fix): prepare() computes and
    // clamps it once, install() writes it through verbatim, and currentGuardMaintenanceWindow()
    // derives validity purely from this signed value. It is never recomputed from a
    // relative ttlSeconds interpreted against a later, attacker-influenceable "now".
    && Number.isFinite(value.expiresAtMs) && value.expiresAtMs > 0
    && typeof value.reason === "string" && value.reason.trim() !== ""
    && SHA256.test(value.repoFingerprintSha256 ?? "")
    && SHA256.test(value.openingTreeSha256 ?? "")
    && typeof value.nonce === "string" && value.nonce.length > 0;
}

/** F3 defense in depth: never trust a stored/rebuilt subject's scope claim without re-checking the closed set. */
function validScope(scopeRuleIds) {
  return Array.isArray(scopeRuleIds) && scopeRuleIds.length > 0 && scopeRuleIds.every(isLiftableRuleId);
}

// ---------------------------------------------------------------------------------
// Mandatory stage-0 self-check (PHX-WP-STAGE0-SELFCHECK;
// backlog/items/2026-08-09-elephant-authored-production-diff-closed-its-own-gating-criterion.md).
//
// A signed GMW record only ever authorizes LIFTING FILE PROTECTION (GS-6/TP-*); it
// has never authorized -- and still does not authorize -- an Elephant session to
// author the commit itself instead of dispatching a Goldfish (EL-01/EL-16). The
// backlog item's root cause was exactly this conflation, made as an implicit
// judgment call under TTL time pressure. This block closes that gap by making the
// declaration EXPLICIT, STATED and STRUCTURALLY MANDATORY on every prepare()/
// install() call -- not part of the PO-signed `subject` (the PO's signature
// authorizes a file-protection lift, never an authorship judgment, which stays the
// Elephant's own gate per EL-03(c)), but a caller precondition that fails closed,
// exactly like the F3 scope re-check above, independently in BOTH prepare() and
// install() so a hand-built request cannot bypass prepare()'s own check either.
// ---------------------------------------------------------------------------------

export const AUTHORSHIP_MODES = Object.freeze(["goldfish-dispatch", "elephant-direct"]);

/** Shape/membership only: one of the two closed authorship-mode strings, never omitted or defaulted. */
function validAuthorshipMode(value) {
  return typeof value === "string" && AUTHORSHIP_MODES.includes(value);
}

/** Shape only -- EL-01's stage-0 fast-path definition (roles/elephant.md EL-01): file count, diff-line count, explicit no-test-file confirmation. */
function validStage0Selfcheck(value) {
  return object(value)
    && Number.isInteger(value.filesChanged) && value.filesChanged >= 0
    && Number.isInteger(value.diffLines) && value.diffLines >= 0
    && typeof value.touchesTestFile === "boolean";
}

/** EL-01's own stage-0 fast-path arithmetic: <=2 files, <=~25 diff lines, no test-file changes. Presumes `validStage0Selfcheck(value)` already passed. */
function stage0Qualifies(value) {
  return value.filesChanged <= 2 && value.diffLines <= 25 && value.touchesTestFile === false;
}

/** Non-throwing counterpart of assertStage0Declaration, for the read path (currentGuardMaintenanceWindow), which reports "absent" rather than throwing. */
function validStage0Declaration(authorshipMode, stage0Selfcheck) {
  if (!validAuthorshipMode(authorshipMode)) return false;
  if (authorshipMode !== "elephant-direct") return true;
  return validStage0Selfcheck(stage0Selfcheck) && stage0Qualifies(stage0Selfcheck);
}

/**
 * Backward-compat variant of validStage0Declaration, used ONLY on the stored-record
 * read path (currentGuardMaintenanceWindow) -- never in assertStage0Declaration,
 * which governs prepare()/install() and must keep demanding an explicit declaration
 * for every window created from here on (PHX-WP-STAGE0-SELFCHECK-BACKCOMPAT).
 *
 * A window record written before this field existed has no `authorshipMode` key at
 * all (JSON.parse yields `undefined`, not `null` or ""): such a record predates the
 * stage-0 declaration requirement and is treated as implicitly valid, exactly as it
 * was before this field was introduced -- re-validating it against a requirement it
 * was never asked to satisfy would silently invalidate an already-active, PO-signed
 * window. Any record that DOES carry an authorshipMode key -- even a malformed or
 * unrecognised one -- is a record written under this requirement (or a tampered
 * one) and gets the full, strict check; only a genuinely absent field is legacy.
 */
function validStoredStage0Declaration(authorshipMode, stage0Selfcheck) {
  if (authorshipMode === undefined) return true;
  return validStage0Declaration(authorshipMode, stage0Selfcheck);
}

/**
 * Mandatory, fail-closed re-check: every call into prepare()/install() must state
 * EXPLICITLY who authors the commit under this window. An "elephant-direct"
 * declaration must also state, and actually satisfy, EL-01's own stage-0 fast-path
 * definition -- a declaration that does not qualify is refused outright, it is
 * never merely flagged. Called independently by both prepare() and install() (the
 * same F3 defense-in-depth pattern already used for scope above).
 */
function assertStage0Declaration(authorshipMode, stage0Selfcheck) {
  if (!validAuthorshipMode(authorshipMode)) {
    fail(
      "GMW-AUTHORSHIP-MODE-INVALID",
      'authorshipMode is required and must be "goldfish-dispatch" or "elephant-direct" -- an explicit, stated declaration of who authors the commit under this window (no implicit default; roles/elephant.md EL-01, backlog/items/2026-08-09-elephant-authored-production-diff-closed-its-own-gating-criterion.md)',
    );
  }
  if (authorshipMode === "elephant-direct") {
    if (!validStage0Selfcheck(stage0Selfcheck)) {
      fail(
        "GMW-STAGE0-SELFCHECK-INVALID",
        'stage0Selfcheck is required for authorshipMode "elephant-direct" and must state { filesChanged, diffLines, touchesTestFile } -- the explicit stage-0 qualification confirmation EL-01 requires before an Elephant session may author the commit itself',
      );
    }
    if (!stage0Qualifies(stage0Selfcheck)) {
      fail(
        "GMW-STAGE0-NOT-QUALIFIED",
        "the declared diff does not meet EL-01's stage-0 fast-path definition (<=2 files, <=~25 diff lines, no test-file changes) -- an Elephant-authored commit to a protected path requires a Goldfish dispatch instead of direct authorship under this window",
      );
    }
  }
}

function validIntentEnvelope(value) {
  return object(value) && object(value.value) && SHA256.test(value.sha256 ?? "");
}

function validRequest(value) {
  // authorshipMode/stage0Selfcheck are deliberately NOT part of this shape check --
  // exactly like validSubject above only checking scopeRuleIds is an array of strings
  // and leaving closed-set membership to the separate validScope() re-check, the
  // stage-0 declaration's full validation (including its closed-set membership and
  // its business-logic "does it actually qualify" question) is owned exclusively by
  // assertStage0Declaration(), called separately and explicitly in both prepare() and
  // install() (F3 defense in depth) so the two paths report the same specific codes.
  return object(value) && value.schema === GMW_REQUEST_SCHEMA && validSubject(value.subject) && validIntentEnvelope(value.intent);
}

// ---------------------------------------------------------------------------------
// prepare / install / status / cover / close
// ---------------------------------------------------------------------------------

/** Agent-safe: produces only public, digest-bound data for external signing. */
export function prepareGuardMaintenanceWindowRequest({
  rootDir,
  scopeRuleIds,
  ttlSeconds,
  reason,
  featureId,
  planSha256,
  specSha256,
  policyRevision,
  livePluginRoot,
  authorshipMode,
  stage0Selfcheck = null,
  nowMs = Date.now(),
  spawn = spawnSync,
} = {}) {
  if (!Array.isArray(scopeRuleIds) || scopeRuleIds.length === 0 || scopeRuleIds.some((id) => !isLiftableRuleId(id))) {
    fail("GMW-SCOPE-INVALID", "scope must name only GS-6 or a TP-* rule id");
  }
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) fail("GMW-TTL-INVALID", "ttlSeconds must be a positive number");
  if (typeof reason !== "string" || reason.trim() === "") fail("GMW-REASON-INVALID", "reason is required");
  if (typeof livePluginRoot !== "string" || livePluginRoot === "") {
    fail("GMW-PLUGIN-SOURCE", "no currently-enforcing live plugin root was supplied (see guard-gate-strength.mjs's livePluginRoots())");
  }
  // Mandatory stage-0 self-check (PHX-WP-STAGE0-SELFCHECK): fails closed before any
  // repo/tree work happens if the caller has not explicitly stated who authors the
  // commit under this window, and (for "elephant-direct") whether that diff actually
  // meets EL-01's own stage-0 fast-path definition.
  assertStage0Declaration(authorshipMode, stage0Selfcheck);

  const repo = topology(rootDir, spawn);
  const openingTreeSha256 = pluginTreeSha256(livePluginRoot);
  const repoFingerprintSha256 = repoFingerprint(repo);
  const nonce = randomBytes(16).toString("hex");
  // The ABSOLUTE bound is chosen and clamped ONCE, here, and becomes part of the
  // signed subject (F1/F2 fix) -- never a relative ttlSeconds that a later step
  // reinterprets against its own "now".
  const expiresAtMs = Math.min(nowMs + ttlSeconds * 1000, nowMs + MAX_WINDOW_TTL_MS);
  const subject = {
    scopeRuleIds: [...new Set(scopeRuleIds)].sort(),
    expiresAtMs,
    reason: reason.trim(),
    repoFingerprintSha256,
    openingTreeSha256,
    nonce,
  };
  const subjectSha256 = sha(subject);
  const commit = git(repo.root, ["rev-parse", "HEAD"], spawn);
  const tree = git(repo.root, ["rev-parse", "HEAD^{tree}"], spawn);
  const intent = createPoApprovalIntent({
    kind: "guard-lift",
    featureId,
    planSha256,
    specSha256,
    candidate: { commit, tree },
    policyRevision,
    subjectSha256,
    decision: "lift",
  });
  // authorshipMode/stage0Selfcheck ride ALONGSIDE `subject`, deliberately unsigned
  // (see the header comment on this block): the PO's signature covers the
  // file-protection lift, never the authorship declaration. `stage0Selfcheck` is
  // recorded only for "elephant-direct" -- carrying it for "goldfish-dispatch" would
  // misleadingly imply EL-01 relevance where none applies.
  const request = {
    schema: GMW_REQUEST_SCHEMA,
    subject,
    intent,
    authorshipMode,
    stage0Selfcheck: authorshipMode === "elephant-direct" ? stage0Selfcheck : null,
  };
  const paths = storagePaths(repo.common);
  writeAtomic(paths.request, Buffer.from(`${JSON.stringify(request)}\n`, "utf8"));
  return { intent, subject, request };
}

/** Agent-safe: verify-and-place only. Cannot succeed without a genuine proof. */
export function installGuardMaintenanceWindow({ rootDir, request, anchors, proof, livePluginRoot, nowMs = Date.now(), spawn = spawnSync } = {}) {
  // Fail closed on a missing/malformed anchor set. verifyAgainstTrustAnchors() coerces any
  // non-array `anchors` to [] -- which is its MOST permissive posture (an empty set derives the
  // anchor from the proof itself, so any well-formed Ed25519 key verifies). A caller that simply
  // forgets `anchors`, or passes the wrong shape, must therefore not silently inherit that
  // posture: caller error is refused loudly here, while an explicit empty array (the deliberate
  // "any well-formed key may sign" choice) still reaches verification unchanged.
  if (!Array.isArray(anchors)) {
    fail("GMW-ANCHORS-INVALID", "anchors must be an array (possibly empty); a missing or malformed value is refused rather than treated as an empty set");
  }
  if (!validRequest(request)) fail("GMW-REQUEST-INVALID", "window request is malformed");
  // F3 defense in depth: install() re-validates the closed scope set independently of
  // prepare() -- a hand-built request naming a non-liftable id must never install.
  if (!validScope(request.subject.scopeRuleIds)) fail("GMW-SCOPE-INVALID", "scope must name only GS-6 or a TP-* rule id");
  // F3 defense in depth (PHX-WP-STAGE0-SELFCHECK): re-verify the stage-0 authorship
  // declaration independently of prepare() too -- a hand-built request must never
  // install with a missing/invalid declaration, or an "elephant-direct" declaration
  // that does not actually qualify under EL-01's stage-0 fast-path definition.
  assertStage0Declaration(request.authorshipMode, request.stage0Selfcheck);
  if (typeof livePluginRoot !== "string" || livePluginRoot === "") {
    fail("GMW-PLUGIN-SOURCE", "no currently-enforcing live plugin root was supplied (see guard-gate-strength.mjs's livePluginRoots())");
  }
  const repo = topology(rootDir, spawn);
  const repoFingerprintSha256 = repoFingerprint(repo);
  if (repoFingerprintSha256 !== request.subject.repoFingerprintSha256) {
    fail("GMW-DRIFT", "physical repository identity drifted since the request was prepared");
  }
  const openingTreeSha256 = pluginTreeSha256(livePluginRoot);
  if (openingTreeSha256 !== request.subject.openingTreeSha256) {
    fail("GMW-DRIFT", "live plugin tree drifted since the request was prepared");
  }

  const subjectSha256 = sha(request.subject);
  if (subjectSha256 !== request.intent.value?.subjectSha256) fail("GMW-REQUEST-INVALID", "request subject does not match its own intent");
  let rebuiltIntent;
  try {
    rebuiltIntent = createPoApprovalIntent({
      kind: "guard-lift",
      featureId: request.intent.value?.featureId,
      planSha256: request.intent.value?.planSha256,
      specSha256: request.intent.value?.specSha256,
      candidate: request.intent.value?.candidate,
      policyRevision: request.intent.value?.policyRevision,
      subjectSha256,
      decision: "lift",
    });
  } catch { fail("GMW-REQUEST-INVALID", "request intent is malformed"); }
  if (rebuiltIntent.sha256 !== request.intent.sha256) fail("GMW-REQUEST-INVALID", "request intent digest does not match its rebuilt preimage");

  const verified = verifyAgainstTrustAnchors({ intent: rebuiltIntent, anchors, proof });
  if (!verified.verified) fail("GMW-PROOF-INVALID", verified.code ?? "PO-APPROVAL-PROOF-INVALID");

  // The signed `expiresAtMs` is written through VERBATIM -- install() never recomputes
  // or extends it (F1/F2 fix). If it has already passed, there is nothing left to arm.
  if (request.subject.expiresAtMs <= nowMs) fail("GMW-EXPIRED", "the signed window has already expired; nothing left to arm");
  // Critic delta review 2 (Finding 1, bounded to 2bc1fc8): `validSubject` places no
  // upper bound on a hand-built (non-prepare()) subject.expiresAtMs beyond
  // finiteness/positivity -- only prepare()'s OWN clamp bounded it, and a hand-built
  // request bypasses prepare() entirely. Without this check, ONE PO signature over a
  // grossly oversized expiresAtMs (e.g. ~100x MAX_WINDOW_TTL_MS) could be
  // re-submitted to install() every <4h, each call re-anchoring the read-time ceiling
  // (`installedAtMs + MAX_WINDOW_TTL_MS`) forward from a LATER "now" -- walking the
  // effective expiry forward indefinitely (bounded only by the huge signed value)
  // from that single signature, contradicting INV-2 and ADR-0058 point 4's
  // `min(signedExpiresAt, openedAt + MAX_TTL)` formula, where "openedAt" implies a
  // stable, one-time anchor. Rejecting here, at the FIRST install attempt, denies the
  // exploit a foothold: a request only ever installs when its signed expiry is
  // already within one MAX_WINDOW_TTL_MS of the ACTUAL install time, so no later
  // re-install can ever walk the ceiling past what was already true at first install.
  // A normal prepare()-built request always satisfies this (prepare clamps to
  // nowMs_prepare + min(ttl, MAX_TTL), and install happens at or after prepare, so
  // nowMs_install + MAX_TTL >= nowMs_prepare + MAX_TTL >= expiresAtMs); a legitimate
  // repeated install of an already-small-TTL window (GMW09) stays far below this
  // bound on every call.
  if (request.subject.expiresAtMs > nowMs + MAX_WINDOW_TTL_MS) {
    fail("GMW-EXPIRY-TOO-FAR", "the signed expiresAtMs is more than one MAX_WINDOW_TTL_MS beyond the actual install time");
  }
  // `installedAtMs` is informational only (audit: when this record was actually placed)
  // -- it is NOT part of the signed subject and carries no security weight of its own.
  // A defensive read-time ceiling (currentGuardMaintenanceWindow) uses it only to
  // NARROW the effective expiry, never to extend it past the signed bound -- tampering
  // with it post-install can only make the window smaller, never larger than what the
  // PO actually signed. Re-running install() with the identical {request, proof} is
  // therefore safe: it just reinstalls the same signed, already-bounded window rather
  // than resetting a fresh expiry from a later "now" (closes F2's "unlimited renewable"
  // failure mode), and the check above now guarantees this holds even for a hand-built
  // subject that skipped prepare()'s own clamp.
  const installedAtMs = nowMs;
  const record = {
    schema: GMW_WINDOW_SCHEMA,
    root: repo.root,
    repoFingerprintSha256,
    subject: request.subject,
    intent: rebuiltIntent,
    proof,
    installedAtMs,
    // Carried through for audit visibility (PHX-WP-STAGE0-SELFCHECK) -- unsigned, same
    // as on the request; the window record is the durable trace that the mandatory
    // self-check was actually stated, not skipped, at install time.
    authorshipMode: request.authorshipMode,
    stage0Selfcheck: request.stage0Selfcheck,
  };
  const paths = storagePaths(repo.common);
  writeAtomic(paths.window, Buffer.from(`${JSON.stringify(record)}\n`, "utf8"));
  return currentGuardMaintenanceWindow({ rootDir, nowMs, spawn });
}

function validWindowRecord(value) {
  // authorshipMode/stage0Selfcheck shape/membership is re-checked separately via
  // validStage0Declaration() below (PHX-WP-STAGE0-SELFCHECK), the same split already
  // applied to validRequest() above and to scope elsewhere in this file.
  return object(value) && value.schema === GMW_WINDOW_SCHEMA && typeof value.root === "string"
    && SHA256.test(value.repoFingerprintSha256 ?? "") && validSubject(value.subject)
    && object(value.intent) && object(value.intent.value) && SHA256.test(value.intent.sha256 ?? "")
    && object(value.proof) && Number.isFinite(value.installedAtMs);
}

/**
 * The function every guard calls. Never trusts a cached/self-declared "valid"
 * field: the proof is re-verified fresh on every read, and expiry parsing is
 * fail-closed (`Number.isFinite(parsedMs) && nowMs < parsedMs`, never the inverted
 * `expired = ... <= nowMs` shape that produced a known bug elsewhere in this
 * codebase, human-guard-override.mjs).
 */
export function currentGuardMaintenanceWindow({ rootDir, nowMs = Date.now(), spawn = spawnSync } = {}) {
  let repo;
  try { repo = topology(rootDir, spawn); } catch { return { status: "absent" }; }
  const paths = storagePaths(repo.common);
  if (!existsSync(paths.window)) return { status: "absent" };

  let record;
  try {
    safePrivateFile(paths.window);
    record = JSON.parse(readFileSync(paths.window, "utf8"));
  } catch { return { status: "absent" }; }
  if (!validWindowRecord(record)) return { status: "absent" };
  // F3 defense in depth: never trust a stored record's scope claim, even if every
  // other check below would otherwise pass -- a record naming a non-liftable id is
  // treated as wholly invalid, not partially honored.
  if (!validScope(record.subject.scopeRuleIds)) return { status: "absent" };
  // PHX-WP-STAGE0-SELFCHECK: same posture as the scope re-check immediately above --
  // never partially honor a stored record whose stage-0 authorship declaration is
  // present but malformed, or (for "elephant-direct") does not actually qualify.
  // PHX-WP-STAGE0-SELFCHECK-BACKCOMPAT: uses the legacy-tolerant variant here (read
  // path only) so a window record written before this field existed -- genuinely
  // missing authorshipMode -- is not retroactively invalidated; see
  // validStoredStage0Declaration()'s own doc comment for why this split is safe.
  if (!validStoredStage0Declaration(record.authorshipMode, record.stage0Selfcheck)) return { status: "absent" };

  const repoFingerprintSha256 = repoFingerprint(repo);
  if (record.repoFingerprintSha256 !== repoFingerprintSha256 || record.root !== repo.root) return { status: "absent" };
  if (record.subject.repoFingerprintSha256 !== repoFingerprintSha256) return { status: "absent" };

  // The committed identity is a SET (ADR-0056's 2026-08-16 correction). A v3 document's
  // `trustAnchors` is used as written, EMPTY INCLUDED -- an explicit empty v3 set is not
  // "no anchor", it is the "any well-formed key may sign" posture, and refusing it here
  // would silently turn a deliberately-configured window into an absent one. A v1/v2
  // document's single `trustAnchor` is wrapped as a set of one (identical behaviour to
  // before), and only a document with no anchor concept at all still reads as absent.
  let anchors;
  try {
    const policy = readCriticalHumanProofPolicy(repo.root);
    if (!policy.ok) return { status: "absent" };
    anchors = policy.trustAnchors !== null
      ? policy.trustAnchors
      : (policy.trustAnchor === null ? null : [policy.trustAnchor]);
    if (anchors === null) return { status: "absent" };
  } catch { return { status: "absent" }; }

  const subjectSha256 = sha(record.subject);
  if (subjectSha256 !== record.intent.value?.subjectSha256) return { status: "absent" }; // tamper: subject/intent disagree
  let rebuiltIntent;
  try {
    rebuiltIntent = createPoApprovalIntent({
      kind: "guard-lift",
      featureId: record.intent.value?.featureId,
      planSha256: record.intent.value?.planSha256,
      specSha256: record.intent.value?.specSha256,
      candidate: record.intent.value?.candidate,
      policyRevision: record.intent.value?.policyRevision,
      subjectSha256,
      decision: "lift",
    });
  } catch { return { status: "absent" }; }
  if (rebuiltIntent.sha256 !== record.intent.sha256) return { status: "absent" }; // tamper
  const verified = verifyAgainstTrustAnchors({ intent: rebuiltIntent, anchors, proof: record.proof });
  if (!verified.verified) return { status: "absent" }; // tamper / revoked anchor

  // Validity is derived PURELY from the signed, digest-verified `expiresAtMs` above
  // (F1/F2 fix) -- fail-closed: `Number.isFinite(...) && nowMs < ...`, never the
  // inverted `expired = ... <= nowMs` shape that produced a known bug elsewhere in
  // this codebase (human-guard-override.mjs). `installedAtMs` (plaintext, unsigned,
  // server-observed at actual install time) adds a purely NARROWING defensive
  // ceiling: `min(signed, installedAtMs + MAX_WINDOW_TTL_MS)` can only ever reduce
  // the effective expiry toward the signed bound, never extend it past what the PO
  // actually signed -- tampering with `installedAtMs` upward cannot exceed
  // `record.subject.expiresAtMs`, and tampering with `expiresAtMs` itself (inside
  // `record.subject`) already fails the subject/intent digest check above.
  const signedExpiresAtMs = record.subject.expiresAtMs;
  const ceilingMs = record.installedAtMs + MAX_WINDOW_TTL_MS;
  const effectiveExpiresAtMs = Number.isFinite(signedExpiresAtMs) ? Math.min(signedExpiresAtMs, ceilingMs) : NaN;
  const active = Number.isFinite(effectiveExpiresAtMs) && nowMs < effectiveExpiresAtMs;

  const shared = {
    scopeRuleIds: record.subject.scopeRuleIds,
    reason: record.subject.reason,
    openingTreeSha256: record.subject.openingTreeSha256,
    // PHX-WP-STAGE0-SELFCHECK: surfaced for audit -- `status`/CLI callers can see the
    // stated authorship declaration without reading window.json directly.
    authorshipMode: record.authorshipMode,
    stage0Selfcheck: record.stage0Selfcheck,
    // PHX-WP-GMW-LEDGER-EMISSION: surfaced so a `close`-time caller can identify which
    // ledger request/grant this window's own portable decision trail belongs to
    // (`guard-authority-ledger-intake.mjs`'s `requestDecisionId`/`grantDecisionId` are
    // both derived from this digest) WITHOUT re-reading window.json directly or
    // duplicating this function's own validation. Read-only, additive: no change to
    // what is stored, verified, or how install/close narrow or arm capability.
    intentSha256: record.intent.sha256,
  };
  if (!active) {
    return { status: "expired", ...shared, expiresAtMs: Number.isFinite(effectiveExpiresAtMs) ? effectiveExpiresAtMs : null };
  }
  return { status: "active", ...shared, expiresAtMs: effectiveExpiresAtMs, remainingMs: effectiveExpiresAtMs - nowMs };
}

/** Convenience wrapper. Callers refusing a `NEVER_LIFTABLE_KERNEL_PATHS` path never call this at all. */
export function windowCoversRule({ rootDir, ruleId, nowMs = Date.now(), spawn = spawnSync } = {}) {
  const window = currentGuardMaintenanceWindow({ rootDir, nowMs, spawn });
  // F3 defense in depth: `isLiftableRuleId` is re-checked here too, even though
  // currentGuardMaintenanceWindow already refuses a record naming a non-liftable id --
  // never report `covered: true` for GS-1..GS-5/GS-7 or an unknown id through this path.
  const covered = window.status === "active" && isLiftableRuleId(ruleId) && window.scopeRuleIds.includes(ruleId);
  return { covered, window };
}

/** Agent-safe, unauthenticated: closing only narrows capability. No-op if absent. */
export function closeGuardMaintenanceWindow({ rootDir, spawn = spawnSync } = {}) {
  let repo;
  try { repo = topology(rootDir, spawn); } catch { return { status: "absent" }; }
  const paths = storagePaths(repo.common);
  if (!existsSync(paths.window)) return { status: "absent" };
  try { unlinkSync(paths.window); } catch {}
  return { status: "closed" };
}

/** Exposed only for tests that need real fixtures without re-deriving the same primitives (mirrors human-guard-override.mjs's own `humanGuardOverrideInternals`). */
export const guardMaintenanceWindowInternals = {
  canonical,
  sha,
  topology,
  physicalRoot,
  storagePaths,
  pluginTreeSha256,
  validAuthorshipMode,
  validStage0Selfcheck,
  stage0Qualifies,
  validStage0Declaration,
  validStoredStage0Declaration,
};
