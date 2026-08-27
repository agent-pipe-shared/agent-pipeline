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
import { isAbsolute, join, relative, resolve, sep, win32 as win32Path } from "node:path";
import { spawnSync } from "node:child_process";

import { createPoApprovalIntent } from "./po-approval-proof.mjs";
import { readCriticalHumanProofPolicy, verifyAgainstTrustAnchors } from "./critical-human-proof-policy.mjs";
import { assessWindowsPrivatePath, hardenWindowsPrivateDirectory } from "./windows-private-state.mjs";
import { LEGACY_GUARD_CONFIG, NEUTRAL_GUARD_CONFIG, resolveProjectAuthorityPaths } from "./project-authority.mjs";

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
  "plugins/pipeline-core/lib/guard-devplan-policy.mjs",
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
  // AGY-GWMKERNEL-1: chat-gate-ceremony.mjs (the shared "genuinely attended
  // terminal" confirmation primitive, AGY-CHATADAPTER-1/2) is imported by
  // pipeline-state.mjs and project-onboarding-v3.mjs below -- both already
  // kernel paths -- so it is transitively kernel too (GMWKC01).
  "plugins/pipeline-core/lib/chat-gate-ceremony.mjs",
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
  // pipeline.gmw-kernel-closure-test-does-not-model-spawn-edges: GMWKC01 now also walks
  // process-spawn edges (a kernel file handing a first-party script path to
  // node:child_process's spawnSync), not just static imports -- `project-onboarding-v3.mjs`
  // above reaches these two writer scripts (and everything THEY import) through the
  // process boundary, not an import.
  "plugins/pipeline-core/lib/feature-package-topology.mjs",
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
  "plugins/pipeline-core/lib/private-boundary.mjs",
  "plugins/pipeline-core/lib/project-authority.mjs",
  "plugins/pipeline-core/lib/project-onboarding-ready-gate.mjs",
  "plugins/pipeline-core/lib/project-onboarding-v3.mjs",
  // Pre-existing, unrelated static-import gap found already failing GMWKC01 at this
  // dispatch's own base commit (guard-lifecycle-ready.mjs already imported both of these
  // before this dispatch touched anything) -- closed alongside the spawn-edge fix above
  // because GMWKC01 is one non-decomposable transitive-closure assertion over the whole
  // array, not a per-edge-type check. Neither import is spawn-related.
  "plugins/pipeline-core/lib/protected-test-paths.mjs",
  // publication-authority.mjs/publication-bundle.mjs/publication-bundle-v2.mjs/
  // publication-capability-preflight.mjs/review-economy.mjs below: transitive closure of
  // scripts/pipeline-state.mjs (one of the two spawn-edge additions), not spawn edges
  // themselves.
  "plugins/pipeline-core/lib/publication-authority.mjs",
  "plugins/pipeline-core/lib/publication-bundle.mjs",
  "plugins/pipeline-core/lib/publication-bundle-v2.mjs",
  "plugins/pipeline-core/lib/publication-capability-preflight.mjs",
  "plugins/pipeline-core/lib/recovery-preview-attestation.mjs",
  "plugins/pipeline-core/lib/review-economy.mjs",
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
  // Two actual spawn-edge targets (pipeline.gmw-kernel-closure-test-does-not-model-
  // spawn-edges): project-onboarding-v3.mjs's observePoAuthorityRebind/
  // observePoAuthorityDecision/observePoProfileRepair spawn a child process running
  // each of these as process.execPath's own script argument.
  "plugins/pipeline-core/scripts/pipeline-state.mjs",
  "plugins/pipeline-core/scripts/po-gate-profile-repair.mjs",
  // Pre-existing, unrelated static-import gap (see protected-test-paths.mjs note above):
  // guard-lifecycle-ready.mjs already imported this before this dispatch touched anything.
  "plugins/pipeline-core/scripts/project-onboarding-v3.mjs",
  "plugins/pipeline-core/scripts/publication-close-journal.mjs",
  "plugins/pipeline-core/scripts/v3-bootstrap-authority.mjs",
  // VFX2-GMW (sprint_phoenix merge, 2026-08-26): GMWKC01 found this second closure gap
  // after the merge -- guard-gate-strength.mjs, human-guard-override.mjs,
  // project-onboarding-v3.mjs and scripts/pipeline-state.mjs (all already kernel paths
  // above) each gained a new import into the human-governance-ledger/control-execution/
  // decision-attribution machinery that Phoenix's side of the merge introduced. Every
  // entry below is imported, directly or transitively, from one of those four files.
  "plugins/pipeline-core/lib/agent-decision-journal.mjs",
  "plugins/pipeline-core/lib/authority-revision-proof.mjs",
  "plugins/pipeline-core/lib/control-execution-exchange.mjs",
  "plugins/pipeline-core/lib/control-execution-lifecycle-event.mjs",
  "plugins/pipeline-core/lib/decision-reference-dual-evaluation.mjs",
  "plugins/pipeline-core/lib/external-push-ledger.mjs",
  "plugins/pipeline-core/lib/governance-event-store.mjs",
  "plugins/pipeline-core/lib/governance-event.mjs",
  "plugins/pipeline-core/lib/guard-authority-ledger-intake.mjs",
  "plugins/pipeline-core/lib/guard-handoff-offer.mjs",
  "plugins/pipeline-core/lib/human-decision-attribution.mjs",
  "plugins/pipeline-core/lib/human-governance-decision.mjs",
  "plugins/pipeline-core/lib/human-governance-ledger.mjs",
  "plugins/pipeline-core/lib/human-role-exception-decision.mjs",
  "plugins/pipeline-core/lib/lifecycle-governance-events.mjs",
  "plugins/pipeline-core/lib/onboarding-consent-marker.mjs",
  "plugins/pipeline-core/lib/threat-model-approval-request.mjs",
  "plugins/pipeline-core/lib/threat-model.mjs",
  // NVA-KERNELDYN-1 (2026-08-27): project-onboarding-v3.mjs (already kernel above)
  // gained a static import of pre-push-hook-install.mjs; that file's dynamic
  // `import()` edges (declared in DYNAMIC_IMPORT_EDGES,
  // guard-maintenance-window-kernel-closure.test.mjs, since PLUGIN_LIB_DIR is an
  // install-time-bound path, not a literal specifier the scanner can read) and their
  // own further imports pull in the rest of this group. guard-dispatch-budget.mjs and
  // plan-authority-staging-guard.mjs are unrelated pre-existing closure gaps GMWKC01
  // found already open at this dispatch's base commit -- caught by the same
  // non-decomposable closure assertion, not by the dynamic-import fix.
  "plugins/pipeline-core/hooks/guard-dispatch-budget.mjs",
  "plugins/pipeline-core/lib/plan-authority-staging-guard.mjs",
  "plugins/pipeline-core/lib/security-completeness-gate.mjs",
  "plugins/pipeline-core/lib/security-evidence-evaluator.mjs",
  "plugins/pipeline-core/lib/verify-evidence-path.mjs",
  "plugins/pipeline-core/scripts/pre-push-hook-install.mjs",
  // NVA-GS15-1: onboarding-staging-authoring.mjs is imported by both
  // guard-gate-strength.mjs and guard-lifecycle-ready.mjs (already kernel above), so it
  // is kernel by construction -- a GS-6 window covering it would let the first edit
  // change what either guard admits as the bootstrap-binding-required staging-authoring
  // write.
  "plugins/pipeline-core/lib/onboarding-staging-authoring.mjs",
  // NVA-INTAKEARGV-1: onboarding-argv-shapes.mjs holds the single declaration of the argv
  // shape guard-lifecycle-ready.mjs admits for every mutating onboarding command, reached
  // through both project-onboarding-v3.mjs modules (already kernel above). A GS-6 window
  // covering it would let the first edit widen what the guard admits -- which is exactly
  // the drift this module was created to make impossible.
  "plugins/pipeline-core/lib/onboarding-argv-shapes.mjs",
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

/**
 * NVA-GMWFINGERPRINT-1: fold the WSL2 default-automount `/mnt/<drive>/...` spelling
 * and the native Windows `<DRIVE>:\...` spelling of one physical path into a single
 * lower-cased identity before `repoFingerprint()` hashes it -- the SAME construction
 * as `canonicalRepositoryPathIdentity`/`windowsDriveLetterIdentity`
 * (po-gate-authority.mjs) and `fingerprintIdentity`/`windowsDriveLetterFingerprintIdentity`
 * (codex-onboarding-runtime.mjs, NVA-FINGERPRINT-1/1858a21b).
 *
 * MIRRORED here rather than imported: po-gate-authority.mjs's own pair is
 * unexported (and this dispatch's Forbidden section bars editing that file to
 * export them); codex-onboarding-runtime.mjs's `fingerprintIdentity` IS exported
 * and its module is already a `NEVER_LIFTABLE_KERNEL_PATHS` entry (so importing it
 * would need no new kernel-closure entry), but pulling in that much larger,
 * domain-unrelated onboarding-runtime module -- with its own launch-ticket/host-
 * adapter import surface -- for ~10 lines of pure regex logic would widen this
 * never-liftable kernel file's own dependency surface for no reason: this file's
 * own DUPLICATION NOTE above (physicalRoot/topology/secureDirectory/etc.) already
 * establishes "small physical-safety primitive stays local" as the house rule here,
 * not a novel shortcut. This is a third independently-named copy of the same ~10
 * lines (the risk the dispatching item explicitly names) -- accepted deliberately
 * for that reason, not overlooked.
 *
 * `repo.root`/`repo.common` are already realpathSync'd absolute paths by the time
 * `repoFingerprint()` calls this (physicalRoot/topology above), so no further
 * resolving is attempted here -- only the cross-notation fold. A path outside the
 * recognized drive-letter/mount world (the common case: a plain POSIX checkout) is
 * returned byte-for-byte, never lower-cased or otherwise touched: NTFS/DrvFs are
 * case-insensitive so folding case is safe ONLY once a path is recognized as
 * belonging to that world -- a same-string different-case plain POSIX pair can be
 * two genuinely different directories on a case-sensitive filesystem and must never
 * be merged (AC-2).
 */
function windowsDriveLetterRepoIdentity(candidate) {
  const normalized = candidate.replaceAll("/", "\\");
  if (!win32Path.isAbsolute(normalized)) return candidate;
  const resolved = win32Path.resolve(normalized);
  return resolved === normalized ? resolved.toLocaleLowerCase("en-US") : candidate;
}
function repoPathIdentity(path) {
  const wslMount = /^\/mnt\/([A-Za-z])(\/.*)?$/u.exec(path);
  if (wslMount !== null) return windowsDriveLetterRepoIdentity(`${wslMount[1].toUpperCase()}:${wslMount[2] ?? "/"}`);
  if (/^[A-Za-z]:[\\/]/u.test(path)) return windowsDriveLetterRepoIdentity(path);
  return path;
}

function repoFingerprint(repo) {
  return sha({ physicalRoot: repoPathIdentity(repo.root), physicalCommon: repoPathIdentity(repo.common) });
}

/**
 * Pre-NVA-GMWFINGERPRINT-1 formula, kept verbatim (raw `repo.root`/`repo.common`
 * strings, no cross-notation folding) so a request/window record a previous
 * pipeline version already wrote can still be recognized -- read-only lookback,
 * mirrors po-gate-authority.mjs's `derivePoGateRepositoryFingerprintLegacy` /
 * `poGateReceiptFingerprintMatches` split. Never used to WRITE a new record; every
 * write below goes through `repoFingerprint()` above.
 */
function repoFingerprintLegacy(repo) {
  return sha({ physicalRoot: repo.root, physicalCommon: repo.common });
}

/**
 * True when `storedFingerprint` binds `repo`'s physical identity under the current
 * (normalized) formula OR the pre-fix (raw) one -- a request/window record written
 * by older code, from either access-path notation, is still found. Never writes.
 */
function repoFingerprintMatches(storedFingerprint, repo) {
  return typeof storedFingerprint === "string"
    && (storedFingerprint === repoFingerprint(repo) || storedFingerprint === repoFingerprintLegacy(repo));
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
  // `protectedTestPatterns` (F2 fix, NVA-GMWFIX-4) is likewise UNSIGNED envelope
  // metadata, captured ONCE here from the live guard-config.json this repository
  // currently resolves to -- install()'s tolerance check (intervenedCommitsStayWithinScope)
  // uses ONLY this frozen snapshot for TP-* pattern matching, never a fresh read of the
  // live file, and fails the whole tolerance path closed if the live file has drifted
  // from it by the time install() runs.
  // `authorshipMode`/`stage0Selfcheck` (PHX-WP-STAGE0-SELFCHECK) ride ALONGSIDE `subject`,
  // deliberately unsigned: the PO's signature covers the file-protection lift, never the
  // authorship declaration. `stage0Selfcheck` is recorded only for "elephant-direct" --
  // carrying it for "goldfish-dispatch" would misleadingly imply EL-01 relevance where
  // none applies.
  const protectedTestPatterns = captureProtectedTestPatternsSnapshot(rootDir);
  const request = {
    schema: GMW_REQUEST_SCHEMA,
    subject,
    intent,
    preparation: { ttlSeconds, preparedAtMs: nowMs },
    protectedTestPatterns,
    authorshipMode,
    stage0Selfcheck: authorshipMode === "elephant-direct" ? stage0Selfcheck : null,
  };
  writeAtomic(paths.request, Buffer.from(`${JSON.stringify(request)}\n`, "utf8"));
  return { intent, subject, request, reused: false };
}

// ---------------------------------------------------------------------------------
// NVA-GMWFIX-3 (PO decision, 2026-08-17, Option A): commit-landing tolerance. Extends
// the file-write idempotency (GMW19/NVA-BL-73) to an actual COMMIT landing between
// prepare and install, PROVIDED every file it touches is provably inside the window's
// own already-signed scope. Positive, narrow proof only -- absence of a counter-example
// is never treated as proof of membership -- and fails closed on any uncertainty at all.
// ---------------------------------------------------------------------------------

/**
 * Mirrors guard-testpath.mjs's own `protectedTestPaths` loader (same config field,
 * same explicit-`id`-else-`TP-<n>` convention, same case-insensitive regex) -- reused
 * rather than reinvented, because a commit-scope check that used a DIFFERENT notion of
 * "what TP-3 protects" than the guard that actually enforces TP-3 would be worse than
 * no check at all. Resolves to the physical config path this repository currently uses;
 * `null` when it cannot be resolved at all. Shared by `captureProtectedTestPatternsSnapshot`
 * (prepare-time, frozen) and `liveProtectedTestPatternsConfigSha256` (install-time,
 * drift-detection only -- see the F2 fix note above `intervenedCommitsStayWithinScope`).
 */
function resolveGuardConfigPath(rootDir) {
  try {
    const authority = resolveProjectAuthorityPaths({ rootDir });
    const guardConfigRelPath = authority.status === "ready"
      ? authority.guardConfig
      : (existsSync(join(rootDir, NEUTRAL_GUARD_CONFIG)) ? NEUTRAL_GUARD_CONFIG : LEGACY_GUARD_CONFIG);
    return join(rootDir, guardConfigRelPath);
  } catch { return null; }
}

/**
 * F2 fix (NVA-GMWFIX-4, Critic finding against NVA-GMWFIX-3/c8acb6a6): called ONLY at
 * `prepareGuardMaintenanceWindowRequest` time, this is the ONE read of the live,
 * mutable `guard-config.json` whose result ever governs a TP-* tolerance decision --
 * captured once, persisted onto the request record (`protectedTestPatterns`, an
 * unsigned field, same trust tier as `preparation`: an attacker able to tamper with the
 * owner-private request.json already has a much stronger foothold than editing an
 * ordinarily-writable guard-config.json, and this snapshot's whole purpose is closing
 * the LATTER gap). `configSha256` is the raw config file's own content hash (`null`
 * when the config cannot be resolved/read at all); `patterns` is the resolved
 * `{id, pattern}` list at that moment, same validation as the loader this replaces:
 * entry pattern must be a non-empty string and a constructible RegExp, or it is dropped.
 */
function captureProtectedTestPatternsSnapshot(rootDir) {
  const configPath = resolveGuardConfigPath(rootDir);
  if (configPath === null) return { configSha256: null, patterns: [] };
  let raw;
  try { raw = readFileSync(configPath, "utf8"); } catch { return { configSha256: null, patterns: [] }; }
  const configSha256 = sha(raw);
  const patterns = [];
  try {
    const cfg = JSON.parse(raw);
    const list = Array.isArray(cfg?.protectedTestPaths) ? cfg.protectedTestPaths : [];
    for (const [i, entry] of list.entries()) {
      if (typeof entry?.pattern !== "string" || entry.pattern === "") continue;
      const id = typeof entry?.id === "string" && entry.id !== "" ? entry.id : `TP-${i + 1}`;
      try { new RegExp(entry.pattern, "i"); } catch { continue; } // invalid regex: drop, mirrors the loader this replaces
      patterns.push({ id, pattern: entry.pattern });
    }
  } catch { /* unparsable config -> configSha256 still recorded, patterns stay empty */ }
  return { configSha256, patterns };
}

/**
 * Install-time-only: hashes the raw bytes of the LIVE guard-config.json this repository
 * currently resolves to, for the SOLE purpose of detecting drift against the
 * prepare-time-frozen `configSha256` -- never used to derive the patterns actually
 * matched below. `null` exactly mirrors `captureProtectedTestPatternsSnapshot`'s own
 * null case (unresolvable/unreadable config), so a config absent at both prepare and
 * install time is never reported as drift.
 */
function liveProtectedTestPatternsConfigSha256(rootDir) {
  const configPath = resolveGuardConfigPath(rootDir);
  if (configPath === null) return null;
  try { return sha(readFileSync(configPath, "utf8")); } catch { return null; }
}

/** Compiles a FROZEN `{id, pattern}` list (from a request's `protectedTestPatterns.patterns`,
 * never from a live read) into the `Map<id, RegExp>` shape `pathWithinScope` expects. An
 * unresolvable/malformed entry contributes nothing -- absence of a pattern is never an
 * unbounded match, same posture as the loader this replaces. */
function compileFrozenTestPatterns(patterns) {
  const map = new Map();
  if (!Array.isArray(patterns)) return map;
  for (const entry of patterns) {
    if (!object(entry) || typeof entry.id !== "string" || entry.id === "" || typeof entry.pattern !== "string" || entry.pattern === "") continue;
    try { map.set(entry.id, new RegExp(entry.pattern, "i")); } catch { /* invalid regex: id stays unresolved */ }
  }
  return map;
}

/**
 * True only when `absolutePath`/`repoRelativePath` is provably inside AT LEAST ONE
 * rule this window's OWN `scopeRuleIds` actually grants: GS-6 means "under
 * `livePluginRoot`" (the same anchor `isNeverLiftableKernelPath` above already uses
 * via `normalizeRepoRelativePath`); a `TP-<n>` id means "matches that id's own
 * configured pattern" via `testPatterns`. A rule id this cannot resolve a pattern for
 * contributes nothing -- absence of a pattern is never treated as an unbounded match.
 *
 * F1 fix (NVA-GMWFIX-4, Critic finding against NVA-GMWFIX-3/c8acb6a6): checked FIRST,
 * before and overriding both branches below -- a path that is `isNeverLiftableKernelPath`
 * (this module's own, ADR-0058's, definition of a path no window may ever cover) is OUT
 * of scope unconditionally, regardless of what `scopeRuleIds` claims. Without this, a
 * GS-6-scoped window tolerated a commit rewriting the guard kernel itself: `livePluginRoot`
 * always contains the plugin's own kernel directory, so a bare GS-6 containment check
 * alone calls the guard kernel "in scope"; and a TP-* pattern can equally happen to match
 * a kernel path (e.g. this repository's own TP-4 on `hooks/hooks.json`) without ever
 * being checked against the kernel list at all.
 */
function pathWithinScope(absolutePath, repoRelativePath, { scopeRuleIds, livePluginRoot, testPatterns, rootDir }) {
  if (isNeverLiftableKernelPath(absolutePath, { rootDir, livePluginRoot })) return false;
  if (scopeRuleIds.includes("GS-6") && normalizeRepoRelativePath(livePluginRoot, absolutePath) !== null) return true;
  for (const ruleId of scopeRuleIds) {
    if (ruleId === "GS-6") continue;
    const pattern = testPatterns.get(ruleId);
    if (pattern && pattern.test(repoRelativePath)) return true;
  }
  return false;
}

/**
 * True only when EVERY changed file across every commit strictly between
 * `candidateCommit` (exclusive) and `currentCommit` (inclusive) is provably inside the
 * window's own already-signed `scopeRuleIds`. This is a POSITIVE, narrow proof:
 * absence of a counter-example is never treated as proof of membership. Fails closed
 * -- returns `false` -- on ANY uncertainty at all: `candidateCommit` not a strict,
 * linear ancestor of `currentCommit` (a rebase, a reset, a rewritten history); a merge
 * or root commit anywhere in the range; a diff this cannot cleanly classify (rename
 * detection is forced ON with `-M` specifically so a rename can never masquerade as an
 * ordinary add+delete pair -- any status other than plain `A`/`M`/`D` fails closed,
 * renames included, deliberately, even when both halves of the rename are themselves
 * in-scope); an empty/malformed diff; or any git invocation that does not succeed the
 * way this function expects. Never trusts anything about the new commit besides what
 * `git` itself reports here (no commit message, no author, no other metadata read). A
 * caught exception anywhere in here IS "does not qualify" -- this function's only
 * contract with its caller is a boolean, and the caller's own strict, pre-existing
 * refusal is what stands whenever this returns `false`.
 */
function intervenedCommitsStayWithinScope({ root, spawn, candidateCommit, currentCommit, scopeRuleIds, livePluginRoot, rootDir, frozenProtectedTestPatterns }) {
  try {
    if (typeof candidateCommit !== "string" || candidateCommit === "") return false;
    const spawnGit = (args) => spawn("git", args, { cwd: root, encoding: "utf8", shell: false, timeout: 5000 });

    const ancestor = spawnGit(["merge-base", "--is-ancestor", candidateCommit, currentCommit]);
    if (ancestor?.error || ancestor?.status !== 0) return false; // not a strict ancestor, or uncertain

    const revList = spawnGit(["rev-list", "--parents", "--reverse", `${candidateCommit}..${currentCommit}`]);
    if (revList?.error || revList?.status !== 0) return false;
    const lines = String(revList.stdout ?? "").split("\n").map((line) => line.trim()).filter((line) => line !== "");
    if (lines.length === 0) return false; // inconsistent with the caller's own currentCommit !== candidateCommit check

    // F2 fix (NVA-GMWFIX-4, Critic finding against NVA-GMWFIX-3/c8acb6a6): the TP-*
    // pattern set used below is the FROZEN, prepare-time snapshot persisted onto the
    // request record -- NEVER a fresh read of the live, mutable guard-config.json (that
    // read used to let an intervening config edit -- or an uncommitted working-tree
    // edit, since the old loader read the live file, not a specific commit -- silently
    // re-bind what a signed TP-<n> id means). A live config that has drifted AT ALL
    // since prepare -- even in a way that would not itself change the pattern actually
    // used below -- voids the whole tolerance path (fail closed), rather than silently
    // choosing between the frozen and the live definition.
    const frozen = object(frozenProtectedTestPatterns) ? frozenProtectedTestPatterns : { configSha256: null, patterns: [] };
    const liveConfigSha256 = liveProtectedTestPatternsConfigSha256(rootDir);
    if (liveConfigSha256 !== (frozen.configSha256 ?? null)) return false;
    const testPatterns = compileFrozenTestPatterns(frozen.patterns);

    for (const line of lines) {
      const hashes = line.split(/\s+/u);
      const commit = hashes[0];
      const parents = hashes.slice(1);
      if (parents.length !== 1) return false; // merge commit or root commit: fail closed

      const diff = spawnGit(["diff", "--name-status", "-M", parents[0], commit]);
      if (diff?.error || diff?.status !== 0) return false;
      const diffLines = String(diff.stdout ?? "").split("\n").map((entry) => entry.trim()).filter((entry) => entry !== "");
      if (diffLines.length === 0) return false; // empty/malformed diff: fail closed

      for (const diffLine of diffLines) {
        const fields = diffLine.split("\t");
        if (fields.length !== 2 || (fields[0] !== "A" && fields[0] !== "M" && fields[0] !== "D")) return false;
        const repoRelativePath = fields[1];
        if (typeof repoRelativePath !== "string" || repoRelativePath === "") return false;
        const absolutePath = resolve(root, repoRelativePath);
        if (!pathWithinScope(absolutePath, repoRelativePath, { scopeRuleIds, livePluginRoot, testPatterns, rootDir })) return false;
      }
    }
    return true;
  } catch { return false; }
}

/** Agent-safe: verify-and-place only. Cannot succeed without a genuine proof. */
export function installGuardMaintenanceWindow({ rootDir, request, trustPolicy, anchors, proof, livePluginRoot, nowMs = Date.now(), spawn = spawnSync } = {}) {
  // Fail closed on a missing/malformed anchor set. verifyAgainstTrustAnchors() coerces any
  // non-array `anchors` to [] -- which is its MOST permissive posture (an empty set derives
  // the anchor from the proof itself, so any well-formed Ed25519 key verifies). GMW never
  // inherits that posture (NVA-GMWFIX-2): a caller that supplies neither `trustPolicy` nor
  // `anchors` is refused loudly here, before verification is ever attempted.
  //
  // `trustPolicy` is the primary parameter: either a single anchor object -- the shape
  // every pre-existing single-anchor caller supplies -- or a v3 anchor SET (an array).
  // `anchors` is accepted as an equivalent, already-array-shaped alias (e.g. this plugin's
  // own CLI, which already resolves its own set). Whichever is supplied is normalized
  // below into a one-element set when it is a lone object, keeping every existing
  // single-anchor caller's behavior byte-for-byte identical.
  const suppliedTrustPolicy = trustPolicy !== undefined ? trustPolicy : anchors;
  if (suppliedTrustPolicy === undefined || suppliedTrustPolicy === null) {
    fail("GMW-ANCHORS-INVALID", "trustPolicy (or anchors) is required; a missing value is refused rather than treated as an empty set");
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
  // NVA-GMWFINGERPRINT-1: accepts the signed subject's fingerprint under EITHER the
  // current (normalized) formula or the pre-fix (raw) one -- a request prepared by
  // older code, or from the other access-path notation of this same physical repo,
  // must still install rather than being reported as drift.
  if (!repoFingerprintMatches(request.subject.repoFingerprintSha256, repo)) {
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
    // NVA-GMWFIX-3 (PO decision, 2026-08-17, Option A): a commit landing between
    // prepare and install no longer unconditionally voids the signature, PROVIDED it
    // (or a short chain of them) stays entirely within the window's OWN already-signed
    // scope -- the same file-write idempotency reasoning NVA-BL-73/23d93b0a/64450b35
    // already established for an unrelated write, extended here to an actual commit.
    // `intervenedCommitsStayWithinScope` is a POSITIVE, narrow proof: any uncertainty
    // at all (a merge commit, a rename, an unparseable diff, a rewritten history) falls
    // straight through to the strict refusal below, exactly as this guard behaved
    // before this fix existed. When tolerated, the tree check below is skipped
    // entirely and deliberately: the tree necessarily moved along with the tolerated
    // commit(s), so comparing it against the OLD signed candidate.tree would just
    // reintroduce the same refusal through the back door.
    const tolerated = intervenedCommitsStayWithinScope({
      root: repo.root, spawn, candidateCommit: candidate.commit, currentCommit,
      scopeRuleIds: request.subject.scopeRuleIds, livePluginRoot, rootDir: repo.root,
      frozenProtectedTestPatterns: request.protectedTestPatterns,
    });
    if (!tolerated) {
      fail("GMW-CANDIDATE-COMMIT-MISMATCH", "current HEAD commit does not match the signed candidate commit");
    }
  } else {
    // Unchanged commit: the defense-in-depth tree check still applies here, exactly as
    // before this fix -- it guards against a hand-built request that tells the truth
    // about the commit and lies about the tree (GMW23), a shape the tolerance path
    // above is never reached for.
    const currentTree = git(repo.root, ["rev-parse", "HEAD^{tree}"], spawn);
    if (currentTree !== candidate.tree) {
      fail("GMW-CANDIDATE-TREE-MISMATCH", "current HEAD tree does not match the signed candidate tree");
    }
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
  // (docs/adr/0058-guard-maintenance-window.md). `suppliedTrustPolicy` (resolved above) is
  // either a single anchor object -- the shape every pre-existing caller and the CLI's
  // `--authority` branch supply -- or a v3 anchor SET (an array) -- the shape the CLI's
  // default-authority branch supplies when the committed policy carries a non-empty one,
  // or the shape a caller passing `anchors` directly already supplies. Normalizing a lone
  // object into a one-element set before calling verifyAgainstTrustAnchors keeps every
  // existing single-anchor caller's behavior byte-for-byte identical (verifyAgainstTrustAnchors
  // on a one-element, non-empty set is exactly verifyPoApprovalProof against that one
  // anchor). F3-style defense in depth (see "never trust a stored record's scope claim" a
  // few lines above `currentGuardMaintenanceWindow`'s anchor resolution, same pattern): an
  // EMPTY resolved set is refused HERE, before verification is ever attempted, regardless
  // of what shape or source `trustPolicy`/`anchors` came from -- never trust a caller's
  // anchor shape either. Reassigns the `anchors` PARAMETER binding directly (never a
  // `const`/`let` re-declaration -- `anchors` is already a destructured parameter, per the
  // `trustPolicy`/`anchors` alias above) so a caller supplying `anchors` directly is
  // honored identically to one supplying `trustPolicy`.
  anchors = Array.isArray(suppliedTrustPolicy) ? suppliedTrustPolicy : [suppliedTrustPolicy];
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
  // authorshipMode/stage0Selfcheck shape/membership is re-checked separately via
  // validStage0Declaration() below (PHX-WP-STAGE0-SELFCHECK), the same split already
  // applied to validRequest() above and to scope elsewhere in this file.
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
  // PHX-WP-STAGE0-SELFCHECK: same posture as the scope re-check immediately above --
  // never partially honor a stored record whose stage-0 authorship declaration is
  // present but malformed, or (for "elephant-direct") does not actually qualify.
  // PHX-WP-STAGE0-SELFCHECK-BACKCOMPAT: uses the legacy-tolerant variant here (read
  // path only) so a window record written before this field existed -- genuinely
  // missing authorshipMode -- is not retroactively invalidated; see
  // validStoredStage0Declaration()'s own doc comment for why this split is safe.
  if (!validStoredStage0Declaration(record.authorshipMode, record.stage0Selfcheck)) return { status: "absent" };

  // NVA-GMWFINGERPRINT-1: both the stored fingerprint fields and the stored plain
  // `root` string are matched under either the current (normalized) or the pre-fix
  // (raw) identity -- a window record written from the other access-path notation
  // of this same physical repo, or by older code, must still read back as active,
  // never silently as "absent" mid-window.
  if (!repoFingerprintMatches(record.repoFingerprintSha256, repo) || repoPathIdentity(record.root) !== repoPathIdentity(repo.root)) {
    return { status: "absent" };
  }
  if (!repoFingerprintMatches(record.subject.repoFingerprintSha256, repo)) return { status: "absent" };

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
  // had before NVA-GMWFIX-1 for the no-anchor-available case. (Merge note, PHX-T-GMW: the
  // sprint_phoenix branch instead treated an explicit empty v3 set as "any well-formed key
  // may sign" -- superseded by NVA-GMWFIX-2 and pinned wrong-then-corrected by GMW28 below;
  // kept out of this merge on that basis.)
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
        "note: a commit landing after this point, before install, invalidates this signature unless it stays entirely within this window's own already-signed scope",
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
  repoPathIdentity,
  repoFingerprint,
  repoFingerprintLegacy,
  repoFingerprintMatches,
  validAuthorshipMode,
  validStage0Selfcheck,
  stage0Qualifies,
  validStage0Declaration,
  validStoredStage0Declaration,
};
