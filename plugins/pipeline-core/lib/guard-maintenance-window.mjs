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

import { createPoApprovalIntent } from "./po-approval-proof.mjs";
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
  // F2 (NVA-A7FIX-1): the two modules THIS file itself imports and calls
  // (createPoApprovalIntent above; readCriticalHumanProofPolicy/
  // verifyAgainstTrustAnchors above) to actually verify a window and every
  // push/deploy/publication/release-preflight proof. ADR-0058 Decision 3
  // documents this list as covering "the code that verifies windows"; these two
  // were the recursive hole that principle names but the implemented list
  // omitted.
  "plugins/pipeline-core/lib/critical-human-proof-policy.mjs",
  "plugins/pipeline-core/lib/po-approval-proof.mjs",
  // NVA-A7FIX-2 (fixing Critic F-2 against the F2 fix above, which itself only closed
  // the FIRST import hop): the full transitive closure of every entry above's own
  // first-party relative imports, computed and enforced by
  // guard-maintenance-window-kernel-closure.test.mjs (GMWKC01) rather than hand-walked
  // -- every entry below is imported, directly or transitively, by one of the entries
  // above. This list is intentionally large: `guard-lifecycle-ready.mjs` alone pulls in
  // most of the onboarding/continuity/runner-profile machinery through
  // `project-onboarding-v3.mjs`, and every one of those modules is code a valid GS-6
  // window could otherwise use to corrupt what "session readiness" or "a verified
  // window" means. GMWKC01 fails on ANY future edit that adds an import to a kernel
  // file without extending this list to match, so this enumeration can no longer drift
  // from the code the way the seven-entry (then nine-entry) hand-typed list already had
  // twice.
  "plugins/pipeline-core/lib/codex-host-layout.mjs",
  "plugins/pipeline-core/lib/codex-onboarding-app-server.mjs",
  "plugins/pipeline-core/lib/codex-onboarding-capabilities.mjs",
  "plugins/pipeline-core/lib/codex-onboarding-runtime.mjs",
  "plugins/pipeline-core/lib/continuity-host-adapter.mjs",
  "plugins/pipeline-core/lib/continuity-state.mjs",
  "plugins/pipeline-core/lib/continuity-status.mjs",
  "plugins/pipeline-core/lib/critic-export-policy.mjs",
  "plugins/pipeline-core/lib/critical-action-approval-request.mjs",
  "plugins/pipeline-core/lib/document-hooks.mjs",
  "plugins/pipeline-core/lib/entrypoint.mjs",
  "plugins/pipeline-core/lib/gate-estimate.mjs",
  "plugins/pipeline-core/lib/git-cmd.mjs",
  "plugins/pipeline-core/lib/human-guard-override.mjs",
  "plugins/pipeline-core/lib/human-role-labels.mjs",
  "plugins/pipeline-core/lib/machine-plane.mjs",
  "plugins/pipeline-core/lib/manifest.mjs",
  "plugins/pipeline-core/lib/onboarding-continuity.mjs",
  "plugins/pipeline-core/lib/plan-spec-state-v2.mjs",
  "plugins/pipeline-core/lib/po-gate-authority.mjs",
  "plugins/pipeline-core/lib/po-gate-profile-publisher.mjs",
  "plugins/pipeline-core/lib/project-authority.mjs",
  "plugins/pipeline-core/lib/project-onboarding-ready-gate.mjs",
  "plugins/pipeline-core/lib/project-onboarding-v3.mjs",
  "plugins/pipeline-core/lib/recovery-preview-attestation.mjs",
  "plugins/pipeline-core/lib/runner-native-continuation.mjs",
  "plugins/pipeline-core/lib/runner-profile-migration-v2.mjs",
  "plugins/pipeline-core/lib/runner-profile-migration-v3.mjs",
  "plugins/pipeline-core/lib/runner-profiles-v2.mjs",
  "plugins/pipeline-core/lib/runner-profiles-v3.mjs",
  "plugins/pipeline-core/lib/runtime-projection-v2.mjs",
  "plugins/pipeline-core/lib/runtime-projection-v3.mjs",
  "plugins/pipeline-core/lib/schema-lite.mjs",
  "plugins/pipeline-core/lib/session-cleanup-recovery.mjs",
  "plugins/pipeline-core/lib/source-observation.mjs",
  "plugins/pipeline-core/lib/windows-private-state.mjs",
  "plugins/pipeline-core/lib/worktree-lifecycle.mjs",
  "plugins/pipeline-core/lib/yaml-lite.mjs",
  "plugins/pipeline-core/scripts/codex-app-server-health.mjs",
  "plugins/pipeline-core/scripts/continuity-status.mjs",
  "plugins/pipeline-core/scripts/v3-bootstrap-authority.mjs",
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

/**
 * `create: false` resolves the same paths WITHOUT creating or hardening the directory
 * — for read-only callers (`describeGuardMaintenanceWindowRequest`) that must not leave
 * a directory behind in a repository that has never used a window. The per-file
 * owner-private check (`safePrivateFile`) still runs on every read.
 */
function storagePaths(common, { create = true } = {}) {
  const directory = join(common, "agent-pipeline", "guard-maintenance-window");
  const base = create ? secureDirectory(directory) : directory;
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

function validIntentEnvelope(value) {
  return object(value) && object(value.value) && SHA256.test(value.sha256 ?? "");
}

function validRequest(value) {
  return object(value) && value.schema === GMW_REQUEST_SCHEMA && validSubject(value.subject) && validIntentEnvelope(value.intent);
}

/**
 * The ONE re-derivation of a guard-lift intent from a stored envelope, used by
 * `install`, by `prepare`'s reuse check and by `describeGuardMaintenanceWindowRequest`.
 * `kind`/`decision` are hardcoded, never read from the stored value: a record claiming a
 * different kind simply fails to reproduce its own digest.
 */
function rebuildGuardLiftIntent(value, subjectSha256) {
  return createPoApprovalIntent({
    kind: "guard-lift",
    featureId: value?.featureId,
    planSha256: value?.planSha256,
    specSha256: value?.specSha256,
    candidate: value?.candidate,
    policyRevision: value?.policyRevision,
    subjectSha256,
    decision: "lift",
  });
}

/** Reads the durable request file if it is present, well-formed and owner-private; null otherwise. */
function readStoredRequest(path) {
  if (!existsSync(path)) return null;
  try {
    safePrivateFile(path);
    const stored = JSON.parse(readFileSync(path, "utf8"));
    return validRequest(stored) && validScope(stored.subject.scopeRuleIds) ? stored : null;
  } catch { return null; }
}

// ---------------------------------------------------------------------------------
// prepare / install / status / cover / close
// ---------------------------------------------------------------------------------

/**
 * True when the request already on disk expresses EXACTLY the intent being prepared
 * again, so re-preparing must hand back the same digest instead of minting a new one
 * (CEREMONY-1 defect B: a signature the PO has already given must not be voided by a
 * second `prepare`, or by anything that happened between the two).
 *
 * Every field the human is shown or that bounds the window is compared: scope, reason,
 * the physical repository, the expiry basis and the absolute signed expiry, plus the
 * whole intent envelope (feature, plan, spec, candidate commit/tree, policy revision)
 * via a full digest re-derivation. Two fields are deliberately NOT compared:
 *   - `nonce`, because it is what would otherwise change on every call, and re-rolling it
 *     for an unchanged intent buys nothing: the absolute signed `expiresAtMs` already
 *     bounds any replay, and install() already documents a repeated install of the same
 *     {request, proof} as safe-by-construction;
 *   - `openingTreeSha256`, because a live-plugin-tree write between two prepares is
 *     exactly the unrelated event that must NOT cost a second signature. It stays bound
 *     in the signed subject (ADR-0058 point 5) as the hash at the moment this intent was
 *     first prepared, and install() records what it observes alongside it.
 * `preparation` is unsigned metadata: tampering with it can only cause a fresh mint or a
 * reuse of a request whose own signed expiry the PO still sees in the confirmation.
 */
function reusablePreparedRequest({ stored, scopeRuleIds, reason, repoFingerprintSha256, ttlSeconds, intentValue, nowMs }) {
  if (stored === null) return false;
  const subject = stored.subject;
  if (subject.reason !== reason) return false;
  if (subject.repoFingerprintSha256 !== repoFingerprintSha256) return false;
  if (subject.scopeRuleIds.length !== scopeRuleIds.length) return false;
  if (subject.scopeRuleIds.some((id, index) => id !== scopeRuleIds[index])) return false;
  if (!object(stored.preparation) || stored.preparation.ttlSeconds !== ttlSeconds) return false;
  // A signed expiry that has passed, or that install() would now refuse as too far out,
  // can never become a usable window — re-preparing must mint a fresh, clamped one.
  if (!(subject.expiresAtMs > nowMs) || subject.expiresAtMs > nowMs + MAX_WINDOW_TTL_MS) return false;
  const subjectSha256 = sha(subject);
  if (subjectSha256 !== stored.intent.value?.subjectSha256) return false;
  let rebuilt;
  try { rebuilt = rebuildGuardLiftIntent(intentValue, subjectSha256); } catch { return false; }
  return rebuilt.sha256 === stored.intent.sha256;
}

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

  const repo = topology(rootDir, spawn);
  const repoFingerprintSha256 = repoFingerprint(repo);
  const commit = git(repo.root, ["rev-parse", "HEAD"], spawn);
  const tree = git(repo.root, ["rev-parse", "HEAD^{tree}"], spawn);
  const scope = [...new Set(scopeRuleIds)].sort();
  const trimmedReason = reason.trim();
  const intentValue = { featureId, planSha256, specSha256, candidate: { commit, tree }, policyRevision };
  const paths = storagePaths(repo.common);

  // Idempotent over its own intent: an unchanged request keeps its digest, so an
  // approval the PO has already given still applies (CEREMONY-1 defect B). Any change
  // to scope, expiry basis, reason, feature, plan/spec or candidate falls through to a
  // fresh mint below — and therefore still needs its own signature.
  const stored = readStoredRequest(paths.request);
  if (reusablePreparedRequest({ stored, scopeRuleIds: scope, reason: trimmedReason, repoFingerprintSha256, ttlSeconds, intentValue, nowMs })) {
    return { intent: stored.intent, subject: stored.subject, request: stored, reused: true };
  }

  const openingTreeSha256 = pluginTreeSha256(livePluginRoot);
  const nonce = randomBytes(16).toString("hex");
  // The ABSOLUTE bound is chosen and clamped ONCE, here, and becomes part of the
  // signed subject (F1/F2 fix) -- never a relative ttlSeconds that a later step
  // reinterprets against its own "now".
  const expiresAtMs = Math.min(nowMs + ttlSeconds * 1000, nowMs + MAX_WINDOW_TTL_MS);
  const subject = {
    scopeRuleIds: scope,
    expiresAtMs,
    reason: trimmedReason,
    repoFingerprintSha256,
    openingTreeSha256,
    nonce,
  };
  const subjectSha256 = sha(subject);
  const intent = rebuildGuardLiftIntent(intentValue, subjectSha256);
  // `preparation` is UNSIGNED envelope metadata (never part of `subject`, never part of
  // the digest): it records the expiry basis so a later prepare can tell "same request"
  // from "same expiry by coincidence". Nothing downstream trusts it — install() and
  // currentGuardMaintenanceWindow() never read it.
  const request = { schema: GMW_REQUEST_SCHEMA, subject, intent, preparation: { ttlSeconds, preparedAtMs: nowMs } };
  writeAtomic(paths.request, Buffer.from(`${JSON.stringify(request)}\n`, "utf8"));
  return { intent, subject, request, reused: false };
}

/** Agent-safe: verify-and-place only. Cannot succeed without a genuine proof. */
export function installGuardMaintenanceWindow({ rootDir, request, trustPolicy, proof, livePluginRoot, nowMs = Date.now(), spawn = spawnSync } = {}) {
  if (!validRequest(request)) fail("GMW-REQUEST-INVALID", "window request is malformed");
  // F3 defense in depth: install() re-validates the closed scope set independently of
  // prepare() -- a hand-built request naming a non-liftable id must never install.
  if (!validScope(request.subject.scopeRuleIds)) fail("GMW-SCOPE-INVALID", "scope must name only GS-6 or a TP-* rule id");
  if (typeof livePluginRoot !== "string" || livePluginRoot === "") {
    fail("GMW-PLUGIN-SOURCE", "no currently-enforcing live plugin root was supplied (see guard-gate-strength.mjs's livePluginRoots())");
  }
  const repo = topology(rootDir, spawn);
  const repoFingerprintSha256 = repoFingerprint(repo);
  if (repoFingerprintSha256 !== request.subject.repoFingerprintSha256) {
    fail("GMW-DRIFT", "physical repository identity drifted since the request was prepared");
  }
  // Candidate binding: repoFingerprintSha256 above proves this is physically the SAME
  // repository the PO signed for, but says nothing about whether its committed state is
  // still the state the signature covers. `request.intent.value.candidate` is the
  // {commit, tree} prepareGuardMaintenanceWindowRequest() bound into the signed intent
  // (via `git rev-parse HEAD` / `git rev-parse HEAD^{tree}`, the same derivation used
  // here) -- install() must refuse when the repository has moved past it. Checked as an
  // objective fact about reality, independently of and before the cryptographic proof
  // below, exactly like the repoFingerprintSha256 check just above. `git()` itself
  // fails closed (GMW-GIT) on a failed or unusable invocation, so an unresolvable HEAD
  // never falls through to a comparison at all, let alone an admission. Deliberately
  // does NOT restore the live-plugin-TREE equality check `23d93b0` removed -- that
  // compared bytes under `livePluginRoot`, an unrelated directory, and killed a
  // signature on any unrelated write to it; this compares the signed `candidate`
  // against the repository's actual `HEAD`, so uncommitted working-tree bytes (never
  // reflected in `rev-parse HEAD`/`HEAD^{tree}`) are still admitted, exactly the
  // property `23d93b0` established.
  const candidate = request.intent.value?.candidate ?? {};
  const currentCommit = git(repo.root, ["rev-parse", "HEAD"], spawn);
  if (currentCommit !== candidate.commit) {
    fail("GMW-CANDIDATE-COMMIT-MISMATCH", "current HEAD commit does not match the signed candidate commit");
  }
  const currentTree = git(repo.root, ["rev-parse", "HEAD^{tree}"], spawn);
  if (currentTree !== candidate.tree) {
    fail("GMW-CANDIDATE-TREE-MISMATCH", "current HEAD tree does not match the signed candidate tree");
  }
  // The live-plugin tree hash is OBSERVED and RECORDED here, never an admission
  // precondition (CEREMONY-1 defect B). It used to be compared for equality against the
  // hash bound at prepare time, which meant any write into the plugin tree between the
  // two steps — including one by an unrelated process, and including one the window is
  // about to authorize anyway — destroyed a signature the PO had already given, for a
  // reason the PO was never asked about. What it would have protected is already covered
  // by the signed subject (physical repository identity, scope, absolute expiry, reason)
  // and by the intent's candidate commit/tree binding; the working-tree bytes it
  // additionally covered are bytes a GS-6 window exists to let the session change, and
  // the pre-install route to changing them (a same-repo merge/checkout) is the residual
  // risk ADR-0058 explicitly leaves to delivery discipline rather than to this check.
  // The observation is kept, in both directions, so the audit record and bootstrap can
  // still state as fact what the tree looked like when the window was prepared and when
  // it was armed. A tree that cannot be hashed at all (e.g. a symlink appeared) records
  // `null` rather than voiding an approval that has already been given.
  const observedTreeSha256 = (() => {
    try { return pluginTreeSha256(livePluginRoot); } catch { return null; }
  })();

  const subjectSha256 = sha(request.subject);
  if (subjectSha256 !== request.intent.value?.subjectSha256) fail("GMW-REQUEST-INVALID", "request subject does not match its own intent");
  let rebuiltIntent;
  try {
    rebuiltIntent = rebuildGuardLiftIntent(request.intent.value, subjectSha256);
  } catch { fail("GMW-REQUEST-INVALID", "request intent is malformed"); }
  if (rebuiltIntent.sha256 !== request.intent.sha256) fail("GMW-REQUEST-INVALID", "request intent digest does not match its rebuilt preimage");

  // NVA-GMWFIX-2: unlike the four CRITICAL_ACTION_KINDS ceremonies (trustAnchorsFor,
  // lib/critical-action-authorization.mjs), the Guard Maintenance Window does NOT adopt
  // "absent/empty trustAnchors accepts any well-formed key" -- GMW is the ceremony that
  // LIFTS GS-6/TP-* protection in the first place, so that posture here would make the
  // whole ceremony self-serviceable by an agent, with no human involved
  // (docs/adr/0058-guard-maintenance-window.md). `trustPolicy` is either a single anchor
  // object -- the shape every pre-existing caller and the CLI's `--authority` branch
  // supply -- or a v3 anchor SET (an array) -- the shape the CLI's default-authority
  // branch supplies when the committed policy carries a non-empty one. Normalizing a
  // lone object into a one-element set before calling verifyAgainstTrustAnchors keeps
  // every existing single-anchor caller's behavior byte-for-byte identical
  // (verifyAgainstTrustAnchors on a one-element, non-empty set is exactly
  // verifyPoApprovalProof against that one anchor). F3-style defense in depth (see "never
  // trust a stored record's scope claim" a few lines above `currentGuardMaintenanceWindow`'s
  // anchor resolution, same pattern): an EMPTY resolved set is refused HERE, before
  // verification is ever attempted, regardless of what shape or source `trustPolicy` came
  // from -- never trust a caller's anchor shape either.
  const anchors = Array.isArray(trustPolicy) ? trustPolicy : [trustPolicy];
  if (anchors.length === 0) {
    fail("GMW-TRUST-ANCHOR-MISSING", "resolved trust anchor set is empty; the Guard Maintenance Window never treats an empty/absent trustAnchors set as \"any well-formed key\"");
  }
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
    // Both halves of the tree observation, recorded rather than enforced: what the
    // signed subject bound when the request was prepared, and what was actually there
    // when the window was armed.
    preparedTreeSha256: request.subject.openingTreeSha256,
    observedTreeSha256,
  };
  const paths = storagePaths(repo.common);
  writeAtomic(paths.window, Buffer.from(`${JSON.stringify(record)}\n`, "utf8"));
  return currentGuardMaintenanceWindow({ rootDir, nowMs, spawn });
}

/**
 * `preparedTreeSha256`/`observedTreeSha256` are audit observations, not admission
 * criteria: absent (a record written before CEREMONY-1) or null (the tree could not be
 * hashed) is tolerated, a present value must still look like a digest. They carry no
 * validity weight — the signed subject and the proof do.
 */
function validTreeObservation(value) {
  return value === undefined || value === null || SHA256.test(value);
}

function validWindowRecord(value) {
  return object(value) && value.schema === GMW_WINDOW_SCHEMA && typeof value.root === "string"
    && SHA256.test(value.repoFingerprintSha256 ?? "") && validSubject(value.subject)
    && object(value.intent) && object(value.intent.value) && SHA256.test(value.intent.sha256 ?? "")
    && object(value.proof) && Number.isFinite(value.installedAtMs)
    && validTreeObservation(value.preparedTreeSha256) && validTreeObservation(value.observedTreeSha256);
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

  const repoFingerprintSha256 = repoFingerprint(repo);
  if (record.repoFingerprintSha256 !== repoFingerprintSha256 || record.root !== repo.root) return { status: "absent" };
  if (record.subject.repoFingerprintSha256 !== repoFingerprintSha256) return { status: "absent" };

  // NVA-GMWFIX-1: this used to read the legacy SINGULAR `policy.trustAnchor` field only,
  // which is permanently `null` once `critical-human-proof.json` carries the v3
  // `trustAnchors` SET -- every window read back `absent`, including the one install()
  // itself performs to build its own return value. NVA-GMWFIX-2: unlike trustAnchorsFor
  // (lib/critical-action-authorization.mjs), GMW does NOT adopt "absent/empty trustAnchors
  // accepts any well-formed key" -- GMW is the ceremony that LIFTS GS-6/TP-* protection in
  // the first place, so that posture here would make the whole ceremony self-serviceable
  // by an agent (docs/adr/0058-guard-maintenance-window.md). A NON-EMPTY v3 set wins
  // whenever the document carries one; an absent OR EMPTY v3 set falls through to the
  // legacy singular field (the fallback for a document that predates v3, or that
  // explicitly carries an empty v3 set), and finally to "absent" -- the SAME posture GMW
  // had before NVA-GMWFIX-1 for the no-anchor-available case.
  let anchors;
  try {
    const policy = readCriticalHumanProofPolicy(repo.root);
    if (!policy.ok) return { status: "absent" };
    if (Array.isArray(policy.trustAnchors) && policy.trustAnchors.length > 0) anchors = policy.trustAnchors;
    else if (policy.trustAnchor !== null) anchors = [policy.trustAnchor];
    else return { status: "absent" };
  } catch { return { status: "absent" }; }

  const subjectSha256 = sha(record.subject);
  if (subjectSha256 !== record.intent.value?.subjectSha256) return { status: "absent" }; // tamper: subject/intent disagree
  let rebuiltIntent;
  try {
    rebuiltIntent = rebuildGuardLiftIntent(record.intent.value, subjectSha256);
  } catch { return { status: "absent" }; }
  if (rebuiltIntent.sha256 !== record.intent.sha256) return { status: "absent" }; // tamper
  // Defense in depth (belt-and-suspenders with the resolution above): never let an empty
  // anchor set reach verification, regardless of how `anchors` above was resolved -- a
  // future code path that resolves it differently must still be unable to pass an empty
  // set through to verifyAgainstTrustAnchors.
  if (!Array.isArray(anchors) || anchors.length === 0) return { status: "absent" };
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
    // Audit-only: what the live plugin tree actually hashed to when this window was
    // armed. `null` when the record predates CEREMONY-1 or the tree was unhashable.
    observedTreeSha256: record.observedTreeSha256 ?? null,
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

// ---------------------------------------------------------------------------------
// What a signing command may show the human (CEREMONY-1 defect A, ADR-0061 Decision 4)
// ---------------------------------------------------------------------------------

/**
 * The stated maximum of the disclosure. A summary that can grow without limit is a new
 * place to hide text a human will not read, so every dimension is capped and every cap
 * is enforced on the way out (not merely intended): at most this many lines, each at
 * most this many characters, with the reason and the scope list capped separately and
 * their truncation stated in the line itself.
 */
export const GMW_SUMMARY_MAX_LINES = 8;
export const GMW_SUMMARY_MAX_LINE_CHARS = 240;
export const GMW_SUMMARY_MAX_REASON_CHARS = 160;
export const GMW_SUMMARY_MAX_SCOPE_IDS = 8;

/**
 * Renders one recorded value for a terminal prompt: control characters (newlines
 * included) collapse to spaces, so a recorded string can never add, indent or forge a
 * line of the confirmation; length is capped and the cut is marked.
 */
function displayText(value, limit) {
  const flat = (typeof value === "string" ? value : "").replace(/\p{C}/gu, " ").replace(/\s+/gu, " ").trim();
  return flat.length <= limit
    ? { text: flat, truncated: false, length: flat.length }
    : { text: `${flat.slice(0, limit)}...`, truncated: true, length: flat.length };
}

function displayTimestamp(expiresAtMs) {
  try {
    const iso = new Date(expiresAtMs).toISOString();
    return typeof iso === "string" ? iso : String(expiresAtMs);
  } catch { return String(expiresAtMs); }
}

function clipLines(lines) {
  return lines.slice(0, GMW_SUMMARY_MAX_LINES).map((line) => {
    const flat = String(line).replace(/\p{C}/gu, " ");
    return flat.length <= GMW_SUMMARY_MAX_LINE_CHARS ? flat : `${flat.slice(0, GMW_SUMMARY_MAX_LINE_CHARS - 3)}...`;
  });
}

function unresolvedRequest(code) {
  return { resolved: false, code, lines: [] };
}

/**
 * Resolves the guard-maintenance-window request recorded in this repository for
 * `intentSha256` and renders a bounded, purely-read summary of it.
 *
 * Two properties are the point of this function:
 *
 * 1. **It never fabricates.** Every displayed value is read from the recorded request.
 *    When no record resolves, the caller gets `{ resolved: false, lines: [] }` and must
 *    say exactly that — the honest "no description available" text stays, only the
 *    ignorance goes away.
 * 2. **It never becomes authority.** The summary is shown only when the record
 *    re-derives to exactly the digest about to be signed, through the same
 *    subject/intent derivation `installGuardMaintenanceWindow` performs. Edit any
 *    displayed field and the record stops re-deriving, so it stops being displayed —
 *    it does not start displaying a lie. The signature still covers the digest and
 *    nothing else; this function has no way to change what is signed.
 */
export function describeGuardMaintenanceWindowRequest({ rootDir, intentSha256, spawn = spawnSync } = {}) {
  try {
    if (!SHA256.test(intentSha256 ?? "")) return unresolvedRequest("GMW-RECORD-DIGEST-INVALID");
    let repo;
    try { repo = topology(rootDir, spawn); } catch { return unresolvedRequest("GMW-RECORD-REPOSITORY-UNAVAILABLE"); }
    const paths = storagePaths(repo.common, { create: false });
    const stored = readStoredRequest(paths.request);
    if (stored === null) return unresolvedRequest("GMW-RECORD-ABSENT");
    if (stored.intent.sha256 !== intentSha256) return unresolvedRequest("GMW-RECORD-DIGEST-MISMATCH");

    const subjectSha256 = sha(stored.subject);
    if (subjectSha256 !== stored.intent.value?.subjectSha256) return unresolvedRequest("GMW-RECORD-INCONSISTENT");
    let rebuilt;
    try { rebuilt = rebuildGuardLiftIntent(stored.intent.value, subjectSha256); } catch { return unresolvedRequest("GMW-RECORD-INCONSISTENT"); }
    if (rebuilt.sha256 !== intentSha256) return unresolvedRequest("GMW-RECORD-INCONSISTENT");

    const value = stored.intent.value ?? {};
    const reason = displayText(stored.subject.reason, GMW_SUMMARY_MAX_REASON_CHARS);
    const scopeTotal = stored.subject.scopeRuleIds.length;
    const scopeRuleIds = stored.subject.scopeRuleIds.slice(0, GMW_SUMMARY_MAX_SCOPE_IDS).map((id) => displayText(id, 32).text);
    const scopeNote = scopeTotal > scopeRuleIds.length ? ` [showing ${scopeRuleIds.length} of ${scopeTotal}]` : "";
    const reasonNote = reason.truncated ? ` [truncated to ${GMW_SUMMARY_MAX_REASON_CHARS} of ${reason.length} characters]` : "";
    const expiresAt = displayTimestamp(stored.subject.expiresAtMs);
    const candidate = value.candidate ?? {};

    return {
      resolved: true,
      code: "GMW-RECORD-RESOLVED",
      schema: stored.schema,
      kind: displayText(value.kind, 32).text,
      featureId: displayText(value.featureId, 64).text,
      scopeRuleIds,
      scopeTotal,
      reason: reason.text,
      reasonTruncated: reason.truncated,
      expiresAtMs: stored.subject.expiresAtMs,
      expiresAt,
      candidate: { commit: displayText(candidate.commit, 64).text, tree: displayText(candidate.tree, 64).text },
      lines: clipLines([
        `recorded request: ${displayText(stored.schema, 64).text} (kind ${displayText(value.kind, 32).text}, feature ${displayText(value.featureId, 64).text})`,
        `guard rules this lifts: ${scopeRuleIds.join(", ")}${scopeNote}`,
        `reason recorded with the request: "${reason.text}"${reasonNote}`,
        `window expires at (signed, absolute): ${expiresAt}`,
        `candidate commit: ${displayText(candidate.commit, 64).text}`,
        `candidate tree: ${displayText(candidate.tree, 64).text}`,
      ]),
    };
  } catch { return unresolvedRequest("GMW-RECORD-UNREADABLE"); }
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
};
