// SPDX-License-Identifier: SUL-1.0

/**
 * Fresh consumer-root onboarding for the public V3 authority.  Unlike the
 * migration, this is deliberately narrow: it writes only absent, Pipeline-owned
 * targets after an explicit activation. A pre-existing ungoverned project is a
 * distinct additive adoption path; existing authority stays owned by the
 * migration/repair workflow.
 */
import { createHash, randomBytes } from "node:crypto";
import {
  accessSync, closeSync, constants, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync,
  linkSync, readdirSync, realpathSync, readFileSync, renameSync, rmSync, rmdirSync, unlinkSync, writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CODEX_HOST_CONTROL_PATHS,
  hasCodexGitControlMount,
  hasCodexHostControlLayout,
  hasCodexRuntimeControlMount,
  observeCodexHostRepositoryInitAdmission,
} from "./codex-host-layout.mjs";
import {
  appServerNextAction,
  observeOnboardingAppServer,
  RUNNERS_WITHOUT_APP_SERVER,
} from "./codex-onboarding-app-server.mjs";
import { observeCodexOnboardingCapabilities } from "./codex-onboarding-capabilities.mjs";
import {
  applyOnboardingContinuityRepair,
  applyOnboardingKickoff,
  applyOnboardingKickoffPromotion,
  classifyOnboardingContinuity,
  INTAKE_CAPTURE_APPLY_SCHEMA,
  INTAKE_CONSENT_APPLY_SCHEMA,
  INTAKE_DESIGN_QUESTIONS_APPLY_SCHEMA,
  INTAKE_GENERATE_PLAN_SCHEMA,
  KICKOFF_GOAL_MAX_BYTES,
  KICKOFF_PROMOTION_PLAN_SCHEMA,
  observeBootstrapBindAcknowledgement,
  planOnboardingContinuityRepair,
  planOnboardingKickoff,
  planOnboardingKickoffPromotion,
  planOnboardingSessionCleanupPrivatization,
  readOnboardingIntakeCheckpoint,
  reconstructOnboardingKickoffPlan,
  reconstructOnboardingKickoffPromotionPlan,
} from "./onboarding-continuity.mjs";
import { applyRunnerProfileMigrationV3, inspectRunnerProfileMigrationV3, planRunnerProfileMigrationV3, renderCanonicalV3Manifest } from "./runner-profile-migration-v3.mjs";
import { loadRunnerProfilesV3Registry, validatePipelineUserV3 } from "./runner-profiles-v3.mjs";
import { loadManifest, validateManifest } from "./manifest.mjs";
import {
  poGateProfileProjectionPaths,
  validatePoGateAuthorityForRepository,
  validatePoGateProfileForRepository,
} from "./po-gate-authority.mjs";
import { initializePoGateProfileReceipt, publishPoGateProfileReceipt } from "./po-gate-profile-publisher.mjs";
import { correctPromotedLanguage, correctSeededKickoffLanguage, regenerateRuntimeProjection } from "./onboarding-language-correction.mjs";
import { parseYaml } from "./yaml-lite.mjs";
import { codexCustomAgentSeed, loadRuntimeProjectionV3OwnedKeys, planRuntimeProjectionV3 } from "./runtime-projection-v3.mjs";
import {
  CodexOnboardingRuntimeError,
  prepareRuntimeRestartBinding, persistRestartBarrier, readCurrentRuntimeReadback,
  readRestartBarrier, removeRestartBarrierCas, requiresNativeRuntimeReadback,
  runtimeRestartBindingCurrent,
} from "./codex-onboarding-runtime.mjs";
import { validateV3BootstrapAuthority } from "../scripts/v3-bootstrap-authority.mjs";
import { checkVerifyContractConfigured } from "../scripts/push-gate-satisfiability.mjs";
import { applyInstall as applyPrePushHookInstallOnboarding } from "../scripts/pre-push-hook-install.mjs";
import { applyInstall as applyPreCommitHookInstallOnboarding } from "../scripts/pre-commit-hook-install.mjs";
import { applySessionCleanupRecovery, planSessionCleanupRecovery, SessionCleanupRecoveryError } from "./session-cleanup-recovery.mjs";
import {
  LEGACY_CALIBRATION,
  LEGACY_STATE,
  NEUTRAL_CALIBRATION,
  NEUTRAL_MANIFEST,
  NEUTRAL_STATE,
  planProjectAuthorityMigration,
  planProjectAuthoritySessionCleanupRecovery,
  inspectProjectAuthorityProvenance,
  PROJECT_AUTHORITY_VENDOR_SYNC_SCHEMA,
  SELF_HEALABLE_VENDOR_PROVENANCE_CODES,
  readProjectAuthority,
  resolveProjectAuthorityPaths,
} from "./project-authority.mjs";
import { derivePlanLifecycle } from "./plan-spec-state-v2.mjs";
import { discoverRepository } from "./worktree-lifecycle.mjs";
import { CRITICAL_HUMAN_PROOF_POLICY_PATH, CRITICAL_HUMAN_PROOF_POLICY_V1, CRITICAL_HUMAN_PROOF_POLICY_V3 } from "./critical-human-proof-policy.mjs";
import { readMachinePlane } from "./machine-plane.mjs";
import { clearConsentMarker } from "./onboarding-consent-marker.mjs";

// Wave 4 onboarding coordinator, step 6 (design SSa.4/SSe; NVA-W5-COORD-STEP6-1).
// The three new v4Inspection statuses a genuinely fresh repo now settles into
// instead of "kickoff-required" -- every existing status-set gate that used
// "kickoff-required" as a proxy for "fresh repo, about to need onboarding
// conversation input" is widened to also admit these, additively, alongside
// the original.
const INTAKE_COORDINATOR_STATUSES = ["intake-required", "intake-design-questions-required", "bootstrap-binding-required"];

const SOURCE = "pipeline.user.yaml";
const SCHEMA = "pipeline.project-onboarding.v4";
// Closed placeholder token used only in the structured handover action below.
// A driver replaces this ONE argv element with the PO's verbatim verifyCommand
// answer before executing the nested applyAction. It is data, never a shell
// interpolation convention and never itself accepted by pipeline-state.mjs.
export const PROJECT_ONBOARDING_VERIFY_COMMAND_PLACEHOLDER = "<PO_VERIFY_COMMAND>";
export const PROJECT_ONBOARDING_INITIAL_ANSWERS_RECEIPT_PATH = ".git/agent-pipeline/onboarding-initial-answers.json";
export const PROJECT_ONBOARDING_INITIAL_ANSWERS_RECEIPT_SCHEMA = "pipeline.onboarding-initial-answers.v1";
const LEGACY_SCHEMA = "pipeline.project-onboarding.v3";
const PLAN_SCHEMA = "pipeline.project-onboarding-plan.v3";
const REMOTE_ADOPTION_PLAN_SCHEMA = "pipeline.project-onboarding-remote-adoption-plan.v1";
const SOURCE_RECOVERY_SCHEMA = "pipeline.project-onboarding-source-recovery.v1";
const MANIFEST_REPAIR_PLAN_SCHEMA = "pipeline.project-onboarding-manifest-repair-plan.v1";
const PARTIAL_AUTHORITY_PLAN_SCHEMA = "pipeline.project-onboarding-partial-authority-plan.v1";
const PARTIAL_AUTHORITY_SOURCE = "canonical-fresh-v3";
const REINSTALL_PLAN_SCHEMA = "pipeline.project-onboarding-reinstall-plan.v1";
const SAFE_RELATIVE = /^(?!\/)(?!.*(?:^|\/)\.\.?($|\/))[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/u;
const AUTHENTICATED = new WeakMap();
const AUTHENTICATED_MANIFEST_REPAIRS = new WeakMap();
const USER_RESERVED_PATHS = new Set([".agents", ".claude", ".codex", "project"]);
/**
 * The paths the Pipeline itself tells a project to write into, ignored so the
 * project is not handed a repository the Pipeline immediately dirties.
 *
 * `scratch/` is where the bootstrap skill sends every agent for temporary files,
 * and nothing was ignoring it: the skill said so in its own text ("Onboarding does
 * not add `scratch/` to your `.gitignore`"), which made the gap a documented
 * defect rather than an unknown one. `evidence/` is where the shipped producers
 * write the verify and security artifacts the push gate demands -- and that one is
 * not cosmetic: `security-scan.mjs` REFUSES a dirty working tree, so the evidence
 * the gate requires is what makes the scan that produces the rest of it
 * impossible. Measured 2026-08-09: all four adapters returned
 * `working-tree-not-clean` until `evidence/` was ignored.
 *
 * `project/pipeline-state.json` is the third: `pipeline-state.mjs`'s own working-
 * tree state file, which changes on nearly every `pipeline-state.mjs` command --
 * including `approve-push` itself. Left tracked, that dirties the tree on every
 * command (blocking `verify-evidence-producer`'s clean-tree requirement the same
 * way an untracked `evidence/` did) and can invalidate an already-signed,
 * commit-bound push approval if it gets re-committed after signing
 * (`docs/state.md`, 2026-08-07/08 push-approval entries). Unlike the other two
 * this is a FILE, not a directory the Pipeline populates over time -- but the
 * file itself is never a target THIS module writes (grep confirms
 * "pipeline-state.json" appears nowhere else in this file): it is created later,
 * exclusively by `pipeline-state.mjs`'s own write path, which requires the
 * authority files this module creates (`project/pipeline.json`,
 * `project/pipeline.yaml`) to already exist and therefore can only run AFTER
 * `applyProjectOnboardingV3` has returned. `applyProjectOnboardingV3` writes
 * every target -- including this `.gitignore` seed -- synchronously within one
 * call and never touches the Git index itself (no `git add`/`git commit`
 * anywhere in it), so the seed is complete on disk before any later step could
 * ever create `project/pipeline-state.json`. There is consequently no ordering
 * window here to close with anything beyond the ignore rule itself (investigated
 * for GF-084; see the regression test extending IGNORESEED-1 for the checked-in
 * proof against a real Git repository).
 *
 * Every entry is ANCHORED (`/scratch/`, not `scratch/`). An unanchored rule
 * is how `evidence/` once swallowed `backlog/evidence/` in this repository and
 * silently broke the closure citations the backlog gate demands
 * (`pipeline.over-broad-ignore-rule-swallows-closure-evidence`). The same
 * one-character omission must not be reintroduced by the thing that fixes it.
 *
 * Written ONLY when the project has no `.gitignore` at all. Appending to a file
 * the project owns is a different decision with a different cost, and the seed
 * does not take it unasked: a project that already has one keeps it untouched and
 * is told what to add -- see `REQUIRED_PROJECT_IGNORE_PATTERNS` /
 * `withPendingProjectIgnoreGapAsk()` below, which is exactly that ask-step
 * (2026-08-28 backlog: the-push-gate-is-unsatisfiable-in-any-installed-plugin-
 * deployment.md, consumer HA -- an owned `.gitignore` missing these entries left
 * a signed push candidate with no exit once the evidence/security producers
 * dirtied the tree AFTER the signature already existed).
 */
const PROJECT_IGNORE_SEED = [
  "# Written by Agent-Pipeline onboarding because this repository had no .gitignore.",
  "# Entries are paths the Pipeline itself writes into. Anchored on purpose: an",
  "# unanchored `evidence/` also matches `<anything>/evidence/`.",
  "",
  "# Agent scratch space (the bootstrap skill sends every agent here).",
  "/scratch/",
  "",
  "# Verify and security evidence. security-scan refuses a dirty working tree, so",
  "# leaving these tracked makes the security gate impossible to satisfy.",
  "/evidence/",
  "",
  "# pipeline-state.mjs's own state file. It changes on nearly every",
  "# pipeline-state.mjs command (including approve-push itself); leaving it",
  "# tracked dirties the tree on every command and can invalidate an already",
  "# signed, commit-bound push approval if it gets re-committed after signing.",
  "/project/pipeline-state.json",
  "",
  "# Claude Code session-scratch state under .claude/: worktree-isolated dispatch",
  "# directories and per-session usage/consent/model-identity markers this",
  "# Pipeline's own scripts write. Named individually, NOT a blanket `.claude/`",
  "# ignore -- .claude/settings.json, .claude/pipeline.json and",
  "# .claude/pipeline.yaml are tracked project configuration and must stay",
  "# tracked. Leaving these untracked-but-unignored is what left a dirty tree",
  "# blocking verify and, in turn, push approval on a fresh greenfield project",
  "# (2026-08-29 backlog: a-dirty-claude-directory-blocks-verify-which-blocks-",
  "# push-approval.md).",
  "/.claude/worktrees/",
  "/.claude/settings.local.json",
  "/.claude/.usage-*.json",
  "/.claude/.stop-suggest-*.json",
  "/.claude/.pipeline-install-consent-*.json",
  "/.claude/.main-session-model-identity-*.json",
  "",
].join("\n");
// Derived, never a second hand-copied list: these are the exact anchored
// lines `PROJECT_IGNORE_SEED` writes for a from-scratch project. Reusing the
// single source of truth means the from-scratch seed and the owned-.gitignore
// gap check (below) can never silently drift apart the way a duplicated
// literal array would.
const REQUIRED_PROJECT_IGNORE_PATTERNS = PROJECT_IGNORE_SEED.split("\n").filter((line) => line.startsWith("/"));
const ONBOARDING_SCRIPT = fileURLToPath(new URL("../scripts/project-onboarding-v3.mjs", import.meta.url));
const ONBOARDING_INIT_DRIVER = fileURLToPath(new URL("../scripts/onboarding-init.mjs", import.meta.url));
const MIGRATION_SCRIPT = fileURLToPath(new URL("../scripts/runner-profile-migration-v3.mjs", import.meta.url));
const HOST_REPOSITORY_INIT_SCRIPT = fileURLToPath(new URL("../scripts/codex-host-repository-init.mjs", import.meta.url));
const SESSION_CLEANUP_SCRIPT = fileURLToPath(new URL("../scripts/session-cleanup.mjs", import.meta.url));
const SESSION_CAPABILITY_DIAGNOSE_SCRIPT = fileURLToPath(new URL("../scripts/session-capability-diagnose.mjs", import.meta.url));
const PO_AUTHORITY_REBIND_WRITER = fileURLToPath(new URL("../scripts/pipeline-state.mjs", import.meta.url));
const PO_PROFILE_REPAIR_WRITER = fileURLToPath(new URL("../scripts/po-gate-profile-repair.mjs", import.meta.url));
const PROJECT_AUTHORITY_MIGRATION_WRITER = fileURLToPath(new URL("../scripts/project-authority-migration.mjs", import.meta.url));
// This module's own install location IS the real absolute path every pipeline
// script it hands the project actually lives at on THIS machine -- the same
// derivation the *_SCRIPT/*_WRITER constants above already use per-script. A
// consumer project's runner-permission allowlist (below) is scoped to the
// whole directory rather than one entry per script, because Direction in
// backlog/items/2026-08-28-a-consumer-project-must-allowlist-every-runner-
// lane-itself.md is a coverage guarantee ("every pipeline script the flow
// itself hands it"), and this directory is exactly the set of scripts
// onboarding invokes across its own lifecycle (see the *_SCRIPT/*_WRITER
// constants above, all siblings of this one directory).
const SCRIPTS_DIR = fileURLToPath(new URL("../scripts/", import.meta.url));
const SHA256_RE = /^[a-f0-9]{64}$/u;
const REMOTE_REF_RE = /^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._/-]*$/u;
const MANIFEST_REPAIR_SCHEMA = "pipeline.project-onboarding-manifest-repair-plan.v1";

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function diagnostic(path, code, message, repair) { return { path, code, message, repair }; }

// Fail-closed runner identity (ADR-0051/ADR-0057 R1; backlog:
// absent-runner-flag-silently-defaults-to-codex, decision: candidate 1). No
// helper in this module may reach a runner identity by assuming one -- an
// absent `runner` is a caller error, never a silently substituted "codex".
// Same shape and naming convention as the sibling contract already enforced
// on the apply-action constructor (commit 94b8a72,
// APPLY-ACTION-RUNNER-REQUIRED in onboarding-continuity.mjs): a typed error
// that names the exact function that could not resolve one, so the module
// speaks one convention rather than two.
//
// This is deliberately distinct from "which runner is executing this
// process" (an environment read, legitimate only at a CLI/session entry
// boundary that then threads the value forward explicitly -- see
// pipeline-start-preflight.mjs) versus "which runner is this project for"
// (what every parameter validated here answers). Deriving the latter from
// `process.env.CLAUDECODE` inside this module was tried and reverted: it
// broke every test that exercises a Codex-shaped project from a session that
// is itself running under Claude Code, because the two questions coincide
// live and diverge under test -- evidence the questions are different, not
// evidence either answer is safe to assume.
class OnboardingRunnerRequiredError extends Error {
  constructor(caller) {
    super(`${caller} cannot proceed without an explicit runner identity; none is assumed`);
    this.name = "OnboardingRunnerRequiredError";
    this.code = "ONBOARDING-RUNNER-REQUIRED";
    this.caller = caller;
  }
}
function requireRunner(runner, caller) {
  if (typeof runner !== "string" || runner.length === 0) throw new OnboardingRunnerRequiredError(caller);
  return runner;
}
function bytesOf(value) { return Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8"); }
function describe(bytes) {
  if (bytes === null) return { status: "absent", sha256: null, byteLength: 0 };
  const raw = bytesOf(bytes);
  return { status: "present", sha256: sha256(raw), byteLength: raw.byteLength };
}
function decodeUtf8Strict(bytes, label) {
  const raw = bytesOf(bytes);
  let decoded;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(raw);
  } catch {
    throw new Error(`${label} is not valid UTF-8`);
  }
  if (Buffer.from(decoded, "utf8").compare(raw) !== 0) throw new Error(`${label} is not canonical UTF-8`);
  return decoded;
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}
function renderScalar(value) {
  if (typeof value === "string") return JSON.stringify(value).replace(/</gu, "\\u003c").replace(/>/gu, "\\u003e");
  if (typeof value === "boolean" || Number.isInteger(value)) return String(value);
  throw new Error("unsupported V3 YAML scalar");
}
function renderYaml(value, indent = "") {
  if (Array.isArray(value)) return value.map((item) => (item && typeof item === "object")
    ? `${indent}-\n${renderYaml(item, `${indent}  `)}` : `${indent}- ${renderScalar(item)}\n`).join("");
  return Object.keys(value).sort().map((key) => {
    const child = value[key];
    return child && typeof child === "object" ? `${indent}${key}:\n${renderYaml(child, `${indent}  `)}` : `${indent}${key}: ${renderScalar(child)}\n`;
  }).join("");
}
function deps(overrides = {}) {
  return {
    accessSync, closeSync, constants, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync,
    linkSync, readdirSync, realpathSync, readFileSync, renameSync, rmSync, rmdirSync, unlinkSync, writeFileSync,
    spawnSync, observeCodexOnboardingCapabilities, observeOnboardingAppServer,
    initializePoGateProfileReceipt, publishPoGateProfileReceipt,
    homedir, readMachinePlane,
    ...overrides,
  };
}
function safeRoot(rootDir, fs) {
  if (typeof rootDir !== "string" || rootDir.length === 0) throw new Error("root must be a non-empty path");
  const requested = resolve(rootDir);
  const info = fs.lstatSync(requested);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("root must be a real directory, not a symbolic link");
  return fs.realpathSync(requested);
}
function safePath(root, relative, fs) {
  if (!SAFE_RELATIVE.test(relative)) throw new Error(`unsafe project-relative path: ${relative}`);
  const target = resolve(root, relative);
  if (!target.startsWith(`${root}${sep}`)) throw new Error(`path escapes project root: ${relative}`);
  let cursor = root;
  for (const part of relative.split("/")) {
    cursor = join(cursor, part);
    if (!fs.existsSync(cursor)) break;
    const info = fs.lstatSync(cursor);
    if (info.isSymbolicLink()) throw new Error(`project path contains a symbolic link: ${relative}`);
    if (cursor !== target && !info.isDirectory()) throw new Error(`project path has a non-directory parent: ${relative}`);
  }
  return target;
}

function projectAuthorityPaths(root, fs) {
  if (typeof fs.resolveProjectAuthorityPaths === "function") {
    return fs.resolveProjectAuthorityPaths(root);
  }
  const resolved = resolveProjectAuthorityPaths({ rootDir: root });
  if (resolved.status === "ready") return resolved;
  const neutralState = safePath(root, NEUTRAL_STATE, fs);
  const legacyState = safePath(root, LEGACY_STATE, fs);
  const neutral = fs.existsSync(neutralState) || !fs.existsSync(legacyState);
  return {
    status: "compatibility",
    source: neutral ? "neutral" : "legacy",
    state: neutral ? NEUTRAL_STATE : LEGACY_STATE,
    calibration: neutral ? NEUTRAL_CALIBRATION : LEGACY_CALIBRATION,
  };
}

// NVA-R5-LANGWIRE: `correctSeededKickoffLanguage`/`correctPromotedLanguage`
// (the PO-answered-language correction called by
// `applyProjectOnboardingKickoffV4`/`applyProjectOnboardingKickoffPromotionV4`
// below) moved to `./onboarding-language-correction.mjs` -- see that module's
// own header comment for the full history (kickoff is the first point the
// human's real language answer is known; a second call site exists for
// promotion because kickoff-design.md's second, document-specific language
// question arrives only after kickoff) and why it moved (the coordinator-
// sourced `bootstrap-bind-apply` flow in `onboarding-continuity.mjs` needed
// the identical, already-two-axis-safe correction, and that module cannot
// import this one -- the dependency already runs the other way).

// The receipt this publishes is only valid if it binds exactly the two files
// the PO-gate authority reads back, so the pair is resolved by that authority
// and never named here. Naming the runtime manifest locally is what broke a
// fresh kickoff: the receipt bound the legacy-tier `.claude/pipeline.yaml`
// while the validator read the neutral-tier `project/pipeline.yaml`, which
// only *looked* correct while both tiers happened to be seeded byte-identical.
function initializeKickoffPoProfile(root, fs) {
  const projection = poGateProfileProjectionPaths(root);
  const sourceBytes = readBoundPhysicalFile(safePath(root, projection.source, fs), fs);
  const runtimeBytes = readBoundPhysicalFile(safePath(root, projection.manifest, fs), fs);
  const initialized = fs.initializePoGateProfileReceipt({
    rootDir: root,
    userYamlText: sourceBytes,
    runtimeYamlText: runtimeBytes,
  });
  if (!initialized?.ok) {
    throw new Error(`kickoff PO profile initialization failed (${initialized?.code ?? "unavailable"})`);
  }
  return initialized;
}
function rootEntries(root, fs) {
  return fs.readdirSync(root).sort().map((name) => {
    const path = join(root, name);
    const info = fs.lstatSync(path);
    let writable = false;
    try { fs.accessSync(path, fs.constants.W_OK); writable = true; } catch {}
    let empty = false;
    if (info.isDirectory() && !info.isSymbolicLink()) {
      try { empty = fs.readdirSync(path).length === 0; } catch {}
    }
    return { name, symlink: info.isSymbolicLink(), directory: info.isDirectory(), file: info.isFile(), writable, empty };
  });
}

/**
 * Read-only recovery planning for an old, incomplete Pipeline authority.
 * This deliberately inventories user surfaces but does not infer a V3 source
 * from legacy calibration and does not create any target.
 */
export function planProjectPartialAuthorityAdoption({ rootDir = process.cwd(), profile = null, source = null, runner, deps: overrides = {} } = {}) {
  requireRunner(runner, "planProjectPartialAuthorityAdoption");
  const fs = deps(overrides);
  let root;
  try { root = safeRoot(rootDir, fs); } catch (error) {
    return { schema: PARTIAL_AUTHORITY_PLAN_SCHEMA, status: "unsafe-root", diagnostics: [diagnostic("$.root", "unsafe_root", error.message, "supply a physical project root")] };
  }
  const legacy = safePath(root, LEGACY_CALIBRATION, fs);
  const v3 = safePath(root, SOURCE, fs);
  if (!fs.existsSync(legacy) || fs.existsSync(v3)) {
    return { schema: PARTIAL_AUTHORITY_PLAN_SCHEMA, status: "not-applicable", root, diagnostics: [diagnostic("$.authority", "partial_authority_not_applicable", "the legacy-without-V3 recovery shape is absent", "use the lifecycle action returned for the current authority shape")] };
  }
  const supportedProfiles = ["epic", "feature", "mini"];
  if (!supportedProfiles.includes(profile) || source !== PARTIAL_AUTHORITY_SOURCE) {
    return {
      schema: PARTIAL_AUTHORITY_PLAN_SCHEMA, status: "selection-required", root,
      selection: { profiles: supportedProfiles, sources: [PARTIAL_AUTHORITY_SOURCE] },
      diagnostics: [diagnostic("$.selection", "partial_authority_selection_required", "no explicit reconstructable V3 authority selection is bound", "re-run plan-partial-authority with --profile and --source canonical-fresh-v3 after PO selection")],
    };
  }
  const paths = [".claude", ".agents", ".codex", "docs"].filter((relative) => fs.existsSync(safePath(root, relative, fs))).sort();
  try {
    const artifacts = paths.map((relative) => ({ path: relative, snapshot: physicalTreeSnapshot(safePath(root, relative, fs), fs) }));
    const intent = freshIntent(runner, fs);
    if (!validatePipelineUserV3(intent).ok) throw new Error("canonical V3 source is invalid");
    // This path holds an explicit PO profile selection, so the seeded gate
    // chapter is the one that profile asks for.
    const baselines = freshBaselines(intent, { profile, fs });
    // Same three portable targets the primary onboarding flow writes for the
    // seeded blocking `push` gate, PLUS the matching proof policy
    // (CRITICAL_HUMAN_PROOF_POLICY_PATH) -- this route seeds the identical
    // gate chapter (see freshGateChapter below) and would otherwise leave a
    // reconstructed project's first `approve-push` refusing with
    // CRITICAL-PROOF-POLICY-KIND-REQUIRED, exactly the defect
    // freshCriticalHumanProofPolicyBytes exists to remove.
    const targets = [
      { path: SOURCE, bytes: renderYaml(intent) },
      { path: ".claude/pipeline.yaml", bytes: baselines[".claude/pipeline.yaml"].bytes },
      { path: NEUTRAL_MANIFEST, bytes: baselines[NEUTRAL_MANIFEST].bytes },
      { path: CRITICAL_HUMAN_PROOF_POLICY_PATH, bytes: baselines[CRITICAL_HUMAN_PROOF_POLICY_PATH].bytes },
    ].sort((left, right) => left.path.localeCompare(right.path));
    for (const target of targets) if (fs.existsSync(safePath(root, target.path, fs))) throw new Error(`Pipeline-owned target already exists: ${target.path}`);
    const plan = { schema: PARTIAL_AUTHORITY_PLAN_SCHEMA, status: "ready", root, selection: { profile, source }, artifacts, targets: targets.map((target) => ({ path: target.path, before: describe(null), after: describe(target.bytes) })), mutation: false };
    const planSha256 = sha256(JSON.stringify(stable(plan)));
    return { ...plan, planSha256, applyAction: commandAction([ONBOARDING_SCRIPT, "apply-partial-authority", "--root", root, "--profile", profile, "--source", source, "--plan-sha256", planSha256, "--activate"], true, true, PARTIAL_AUTHORITY_PLAN_SCHEMA, ["applied", "runtime-initialization-required", "kickoff-required"]) };
  } catch (error) {
    return { schema: PARTIAL_AUTHORITY_PLAN_SCHEMA, status: "inventory-unavailable", root, diagnostics: [diagnostic("$.artifacts", "partial_authority_inventory_unavailable", error.message, "repair unsafe or unreadable user paths before planning")] };
  }
}

export function applyProjectPartialAuthorityAdoption({ rootDir = process.cwd(), profile = null, source = null, runner, planSha256, activate = false, deps: overrides = {} } = {}) {
  requireRunner(runner, "applyProjectPartialAuthorityAdoption");
  const fs = deps(overrides);
  if (!activate || !SHA256_RE.test(planSha256 ?? "")) return { schema: PARTIAL_AUTHORITY_PLAN_SCHEMA, status: "activation-required", diagnostics: [diagnostic("$.activate", "activation_required", "apply requires explicit activation", "review the digest-bound plan and pass --activate")] };
  const plan = planProjectPartialAuthorityAdoption({ rootDir, profile, source, runner, deps: fs });
  if (plan.status !== "ready" || plan.planSha256 !== planSha256) return { schema: PARTIAL_AUTHORITY_PLAN_SCHEMA, status: "invalid-plan", root: plan.root, diagnostics: [diagnostic("$.planSha256", "plan_digest_mismatch", "the supplied plan digest is not current", "run the read-only partial-authority plan again")] };
  const root = plan.root; const created = []; const createdDirectories = [];
  try {
    const intent = freshIntent(runner, fs); const baselines = freshBaselines(intent, { fs });
    const bytes = new Map([[SOURCE, renderYaml(intent)], [".claude/pipeline.yaml", baselines[".claude/pipeline.yaml"].bytes], [NEUTRAL_MANIFEST, baselines[NEUTRAL_MANIFEST].bytes], [CRITICAL_HUMAN_PROOF_POLICY_PATH, baselines[CRITICAL_HUMAN_PROOF_POLICY_PATH].bytes]]);
    for (const target of plan.targets) {
      const path = safePath(root, target.path, fs);
      if (fs.existsSync(path)) throw new Error(`target appeared during activation: ${target.path}`);
      ensureTargetParents(root, path, createdDirectories, fs);
      fs.writeFileSync(path, bytes.get(target.path), { encoding: "utf8", flag: "wx", mode: 0o600 });
      const identity = fileIdentity(fs.lstatSync(path)); if (!identity) throw new Error(`created target identity is unavailable: ${target.path}`);
      // The digest is recorded from the bytes actually written, not re-read
      // from disk: `rollback()` deletes only what still IS these bytes, and a
      // re-read could adopt foreign content as this transaction's own
      // (NVA-B-ROUNDL-F4).
      created.push({ path, identity, sha256: sha256(bytes.get(target.path)) });
    }
    const after = inspectProjectOnboardingV3({ rootDir: root, deps: fs, runner });
    return { schema: PARTIAL_AUTHORITY_PLAN_SCHEMA, status: "applied", root, changes: plan.targets.map((target) => target.path), postInspection: after };
  } catch (error) {
    const failures = rollback(root, created, createdDirectories, null, null, false, fs);
    return { schema: PARTIAL_AUTHORITY_PLAN_SCHEMA, status: failures.length ? "rollback-failed" : "rolled-back", root, diagnostics: [diagnostic("$.transaction", failures.length ? "rollback_failed" : "apply_failed", error.message, "repair the root and run the typed plan again")] };
  }
}

/**
 * Reinstall is deliberately an authority-only transaction.  It never treats
 * legacy calibration, skills, hooks, docs, or runner directories as owned.
 */
export function planProjectOnboardingReinstall({ rootDir = process.cwd(), deps: overrides = {} } = {}) {
  const fs = deps(overrides); let root;
  try { root = safeRoot(rootDir, fs); } catch (error) { return { schema: REINSTALL_PLAN_SCHEMA, status: "unrepairable", diagnostics: [diagnostic("$.root", "unsafe_root", error.message, "supply a physical project root")] }; }
  const sourcePath = safePath(root, SOURCE, fs); const manifestPath = safePath(root, ".claude/pipeline.yaml", fs);
  let source;
  try { source = readBoundPhysicalFile(sourcePath, fs); } catch { return { schema: REINSTALL_PLAN_SCHEMA, status: "not-applicable", root, diagnostics: [diagnostic("$.source", "reinstall_source_unavailable", "a current V3 source is required for a reversible reinstall", "use partial-authority adoption for legacy or absent V3 authority")] }; }
  let intent; let projection;
  try {
    intent = parseYaml(decodeUtf8Strict(source, SOURCE));
    if (!validatePipelineUserV3(intent).ok) throw new Error("invalid V3 source");
    projection = planRuntimeProjectionV3(intent, { source: SOURCE, baselines: currentRuntimeBaselines(root, intent, fs) });
  } catch { return { schema: REINSTALL_PLAN_SCHEMA, status: "not-applicable", root, diagnostics: [diagnostic("$.source", "reinstall_source_unowned", "the V3 source cannot prove a current owned projection", "use the source-owning recovery route")] }; }
  const expected = projection.targets.find((target) => target.path === ".claude/pipeline.yaml")?.after?.bytes;
  let manifest;
  try { manifest = readBoundPhysicalFile(manifestPath, fs); } catch { return { schema: REINSTALL_PLAN_SCHEMA, status: "not-applicable", root, diagnostics: [diagnostic("$.manifest", "reinstall_manifest_unavailable", "the generated manifest is unavailable", "use the manifest repair route")] }; }
  if (typeof expected !== "string" || Buffer.compare(manifest, Buffer.from(expected, "utf8")) !== 0) return { schema: REINSTALL_PLAN_SCHEMA, status: "not-applicable", root, diagnostics: [diagnostic("$.manifest", "reinstall_manifest_unowned", "the existing manifest is not the current generated V3 projection", "repair or preserve it through its owning workflow")] };
  let repository;
  try { repository = discoverRepository(root, { spawn: fs.spawnSync }); } catch { return { schema: REINSTALL_PLAN_SCHEMA, status: "private-store-unavailable", root, diagnostics: [diagnostic("$.repository", "reinstall_private_store_unavailable", "the physical Git common directory is unavailable", "restore local Git capability before retrying")] }; }
  const targets = [{ path: SOURCE, before: describe(source) }, { path: ".claude/pipeline.yaml", before: describe(manifest) }];
  const binding = { schema: REINSTALL_PLAN_SCHEMA, root, commonDir: repository.commonDir, targets };
  const planSha256 = sha256(JSON.stringify(stable(binding)));
  return { ...binding, status: "ready", planSha256, mutation: false, applyAction: commandAction([ONBOARDING_SCRIPT, "apply-reinstall", "--root", root, "--plan-sha256", planSha256, "--activate"], true, true, REINSTALL_PLAN_SCHEMA, ["applied"]) };
}

export function applyProjectOnboardingReinstall({ rootDir = process.cwd(), planSha256, activate = false, deps: overrides = {} } = {}) {
  const fs = deps(overrides);
  if (!activate || !SHA256_RE.test(planSha256 ?? "")) return { schema: REINSTALL_PLAN_SCHEMA, status: "activation-required" };
  const plan = planProjectOnboardingReinstall({ rootDir, deps: fs });
  if (plan.status !== "ready" || plan.planSha256 !== planSha256) return { schema: REINSTALL_PLAN_SCHEMA, status: "invalid-plan", root: plan.root };
  const archive = join(plan.commonDir, "agent-pipeline", "reinstall-quarantine", planSha256);
  const moved = [];
  try {
    fs.mkdirSync(archive, { recursive: true, mode: 0o700 });
    for (const target of plan.targets) {
      const source = safePath(plan.root, target.path, fs); const bytes = readBoundPhysicalFile(source, fs);
      if (sha256(bytes) !== target.before.sha256) throw new Error(`preimage changed: ${target.path}`);
      const destination = join(archive, target.path.replaceAll("/", "__"));
      if (fs.existsSync(destination)) throw new Error(`quarantine collision: ${target.path}`);
      fs.renameSync(source, destination); moved.push({ source, destination });
    }
    fs.writeFileSync(join(archive, "receipt.json"), `${JSON.stringify({ schema: REINSTALL_PLAN_SCHEMA, planSha256, targets: plan.targets })}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    return { schema: REINSTALL_PLAN_SCHEMA, status: "applied", root: plan.root, quarantine: { status: "private", planSha256 }, changes: plan.targets.map((target) => target.path) };
  } catch (error) {
    const failures = [];
    for (const entry of moved.reverse()) try { if (!fs.existsSync(entry.source) && fs.existsSync(entry.destination)) fs.renameSync(entry.destination, entry.source); } catch (rollbackError) { failures.push(rollbackError); }
    return { schema: REINSTALL_PLAN_SCHEMA, status: failures.length ? "rollback-failed" : "rolled-back", root: plan.root, diagnostics: [diagnostic("$.transaction", failures.length ? "reinstall_rollback_failed" : "reinstall_apply_failed", error.message, "inspect the private quarantine before retrying")] };
  }
}
function runtimePaths() { return loadRuntimeProjectionV3OwnedKeys().targets.map((target) => target.path).sort(); }
function hasOwnRuntime(root, fs) { return runtimePaths().some((relative) => fs.existsSync(safePath(root, relative, fs))); }

function fsyncDirectory(path, fs) {
  let fd;
  try {
    fd = fs.openSync(path, "r");
    fs.fsyncSync(fd);
  } catch (error) {
    if (!(process.platform === "win32"
      && ["EPERM", "EINVAL", "EISDIR", "EACCES", "ENOTSUP"].includes(error?.code))) throw error;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function sameIdentity(expected, path, fs) {
  try {
    const actual = fs.lstatSync(path);
    return !actual.isSymbolicLink()
      && actual.isFile()
      && actual.nlink === 1
      && String(actual.dev) === expected.dev
      && String(actual.ino) === expected.ino;
  } catch {
    return false;
  }
}

function sameFileObject(expected, path, fs) {
  try {
    const actual = fs.lstatSync(path);
    return !actual.isSymbolicLink()
      && actual.isFile()
      && actual.nlink >= 1
      && String(actual.dev) === expected.dev
      && String(actual.ino) === expected.ino;
  } catch {
    return false;
  }
}

function fileIdentity(info) {
  return info && !info.isSymbolicLink() && info.isFile() && info.nlink === 1
    ? { dev: String(info.dev), ino: String(info.ino) }
    : null;
}

/**
 * Ownership predicate for a rollback that DELETES a file it believes it
 * published. `{dev, ino}` alone is not sufficient for that decision: an inode
 * number freed by a concurrent `unlink` is routinely handed straight back to
 * the next file created in the same directory (ext4 allocates the lowest free
 * inode in the block group; tmpfs draws inode numbers from a monotonic counter
 * and never reuses one -- which is exactly why this is invisible on a tmpfs
 * `/tmp` and reproducible on an ext4-backed one). Under reuse `sameIdentity`
 * cannot tell the output this transaction published from foreign content that
 * replaced it, and the rollback then deletes bytes it never wrote.
 *
 * The published bytes are known exactly, so ownership additionally requires
 * the file's current content to still BE those bytes. Anything else is foreign
 * and is left in place; a rollback that cannot prove ownership must not delete.
 */
function ownsPublishedOutput(expectedIdentity, expectedSha256, path, fs) {
  if (!sameIdentity(expectedIdentity, path, fs)) return false;
  try {
    return sha256(fs.readFileSync(path, "utf8")) === expectedSha256;
  } catch {
    return false;
  }
}

function directoryIdentity(info) {
  return info && !info.isSymbolicLink() && info.isDirectory()
    ? { dev: String(info.dev), ino: String(info.ino) }
    : null;
}

function sameDirectoryIdentity(expected, path, fs) {
  try {
    const actual = directoryIdentity(fs.lstatSync(path));
    return actual !== null && actual.dev === expected.dev && actual.ino === expected.ino;
  } catch {
    return false;
  }
}

function readBoundPhysicalFile(path, fs, { optional = false } = {}) {
  let fd;
  try {
    let before;
    try { before = fileIdentity(fs.lstatSync(path)); } catch (error) {
      if (optional && error?.code === "ENOENT") return null;
      throw error;
    }
    if (!before) throw new Error("project file is not a single-link physical file");
    fd = fs.openSync(path, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    const opened = fileIdentity(fs.fstatSync(fd));
    if (!opened || opened.dev !== before.dev || opened.ino !== before.ino) {
      throw new Error("project file identity changed before read");
    }
    const bytes = fs.readFileSync(fd);
    const after = fileIdentity(fs.fstatSync(fd));
    if (!after || after.dev !== opened.dev || after.ino !== opened.ino || !sameIdentity(opened, path, fs)) {
      throw new Error("project file identity changed during read");
    }
    return bytesOf(bytes);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function openBoundDirectory(path, fs) {
  const before = directoryIdentity(fs.lstatSync(path));
  if (!before || fs.realpathSync(path) !== path) throw new Error("manifest parent is not a physical directory");
  const fd = fs.openSync(
    path,
    fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY ?? 0) | (fs.constants.O_NOFOLLOW ?? 0),
  );
  const opened = directoryIdentity(fs.fstatSync(fd));
  if (!opened || opened.dev !== before.dev || opened.ino !== before.ino || !sameDirectoryIdentity(opened, path, fs)) {
    fs.closeSync(fd);
    throw new Error("manifest parent identity changed before publication");
  }
  return { fd, identity: opened, path };
}

function boundDirectoryEntry(directory, name, fs) {
  if (name !== basename(name) || name === "." || name === "..") throw new Error("manifest entry name is unsafe");
  const candidates = process.platform === "linux"
    ? [`/proc/self/fd/${directory.fd}`]
    : process.platform === "win32" ? [] : [`/dev/fd/${directory.fd}`, `/proc/self/fd/${directory.fd}`];
  const descriptorRoot = candidates.find((candidate) => {
    try { return fs.existsSync(candidate); } catch { return false; }
  });
  if (descriptorRoot) return join(descriptorRoot, name);
  if (process.platform === "win32" && sameDirectoryIdentity(directory.identity, directory.path, fs)) {
    return join(directory.path, name);
  }
  throw new Error("fd-relative manifest publication is unavailable");
}

function syncBoundDirectory(directory, fs) {
  try {
    fs.fsyncSync(directory.fd);
  } catch (error) {
    if (!(process.platform === "win32"
      && ["EPERM", "EINVAL", "EISDIR", "EACCES", "ENOTSUP"].includes(error?.code))) throw error;
  }
  const after = directoryIdentity(fs.fstatSync(directory.fd));
  if (!after || after.dev !== directory.identity.dev || after.ino !== directory.identity.ino
    || !sameDirectoryIdentity(directory.identity, directory.path, fs)) {
    throw new Error("manifest parent identity changed during publication");
  }
}

function quarantineManifestPublication(directory, target, expected, planSha256, fs) {
  if (!expected || !sameFileObject(expected, target, fs)) return false;
  const quarantine = boundDirectoryEntry(
    directory,
    `.pipeline-manifest-repair-quarantine-${planSha256.slice(0, 24)}-${randomBytes(8).toString("hex")}`,
    fs,
  );
  try {
    fs.renameSync(target, quarantine);
  } catch {
    return false;
  }
  if (sameFileObject(expected, quarantine, fs)) return true;
  try {
    fs.linkSync(quarantine, target);
  } catch {}
  return false;
}

function recoverProbeIdentity(fd, path, candidate, fs) {
  let descriptor = null;
  try { if (fd !== undefined) descriptor = fileIdentity(fs.fstatSync(fd)); } catch {}
  let current = null;
  try { current = fileIdentity(fs.lstatSync(path)); } catch {}
  if (descriptor && current && descriptor.dev === current.dev && descriptor.ino === current.ino) return current;
  if (candidate && current && candidate.dev === current.dev && candidate.ino === current.ino) return current;
  return null;
}

const RUNTIME_CAPABILITY_PROBE_BYTES = "runtime-capability-probe";

/**
 * NVA-B-ROUNDL-F4. The identity check below is NOT protection against inode
 * reuse: under reuse the identity is exactly what matches, because the freed
 * number is handed straight back to the file that replaced ours (see
 * `ownsPublishedOutput()`'s docblock for why). The delete therefore has to be
 * authorized by content -- `expectedSha256` is the digest of the bytes this
 * probe itself last wrote at this path (the empty preimage between the
 * exclusive create and the write, the probe bytes after it). Anything else at
 * this path is foreign, and this transaction's contract is explicit that a
 * leaked or foreign probe path is never silently ignored: refuse the delete and
 * surface it, rather than destroying bytes the probe never wrote.
 */
function cleanupRuntimeProbe(path, identity, expectedSha256, fs) {
  if (!fs.existsSync(path)) return;
  if (!identity || !sameIdentity(identity, path, fs)) {
    throw new Error("runtime capability probe changed identity before rollback");
  }
  if (!expectedSha256 || !ownsPublishedOutput(identity, expectedSha256, path, fs)) {
    throw new Error("runtime capability probe content is not this probe's own before rollback");
  }
  fs.unlinkSync(path);
}

function nearestExistingPhysicalParent(root, relative, fs) {
  const target = safePath(root, relative, fs);
  let parent = dirname(target);
  while (!fs.existsSync(parent)) {
    const next = dirname(parent);
    if (next === parent || (next !== root && !next.startsWith(`${root}${sep}`))) {
      throw new Error("runtime target has no safe project-local parent");
    }
    parent = next;
  }
  const info = fs.lstatSync(parent);
  if (!info.isDirectory() || info.isSymbolicLink() || fs.realpathSync(parent) !== parent) {
    throw new Error("runtime target parent is not a physical directory");
  }
  return parent;
}

function selectedRuntimeTargetParents(root, fs) {
  return [...new Set(runtimePaths()
    .filter((relative) => relative.startsWith(".codex/"))
    .map((relative) => nearestExistingPhysicalParent(root, relative, fs)))].sort();
}

/**
 * Prove each distinct selected Codex target parent can support the migration
 * transaction. Every byte is disposable and identity-bound; cleanup controls
 * over the primary failure so a leaked/foreign path can never be ignored.
 */
function probeSelectedRuntimeTargets(root, fs) {
  const parents = selectedRuntimeTargetParents(root, fs);
  for (const parent of parents) {
    const suffix = randomBytes(18).toString("hex");
    const source = join(parent, `.pipeline-runtime-capability-${suffix}.tmp`);
    const target = join(parent, `.pipeline-runtime-capability-${suffix}.renamed`);
    let fd;
    let identity = null;
    let createdIdentity = null;
    let primaryError = null;
    // The digest of the bytes THIS probe last wrote at its own path, advanced
    // as the transaction advances: null before the exclusive create, the empty
    // preimage once the file exists, the probe bytes once they are written.
    // `cleanupRuntimeProbe` authorizes its delete against this, never against
    // `{dev, ino}` alone (NVA-B-ROUNDL-F4).
    let probeSha256 = null;
    try {
      fd = fs.openSync(
        source,
        fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0),
        0o600,
      );
      probeSha256 = sha256("");
      createdIdentity = fileIdentity(fs.lstatSync(source));
      const opened = fileIdentity(fs.fstatSync(fd));
      if (!createdIdentity || !opened
        || createdIdentity.dev !== opened.dev
        || createdIdentity.ino !== opened.ino) throw new Error("runtime capability probe identity is unavailable");
      identity = opened;
      fs.writeFileSync(fd, Buffer.from(RUNTIME_CAPABILITY_PROBE_BYTES, "utf8"));
      probeSha256 = sha256(RUNTIME_CAPABILITY_PROBE_BYTES);
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = undefined;
      fs.renameSync(source, target);
      fsyncDirectory(parent, fs);
    } catch (error) {
      primaryError = error;
    }
    identity ??= recoverProbeIdentity(fd, source, createdIdentity, fs)
      ?? recoverProbeIdentity(fd, target, createdIdentity, fs);
    const cleanupErrors = [];
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch (error) { cleanupErrors.push(error); }
    }
    try { cleanupRuntimeProbe(source, identity, probeSha256, fs); } catch (error) { cleanupErrors.push(error); }
    try { cleanupRuntimeProbe(target, identity, probeSha256, fs); } catch (error) { cleanupErrors.push(error); }
    try { fsyncDirectory(parent, fs); } catch (error) { cleanupErrors.push(error); }
    if (cleanupErrors.length > 0) throw cleanupErrors[0];
    if (primaryError) throw primaryError;
  }
}

function isHostControlLayout(root, entries, fs) {
  return (entries.length === 1 && entries[0].name === ".git" && hasCodexGitControlMount(root, {
    access: fs.accessSync,
    fsConstants: fs.constants,
    lstat: fs.lstatSync,
    readdir: fs.readdirSync,
  })) || (entries.length >= 2 && entries.length <= CODEX_HOST_CONTROL_PATHS.length
    && entries.every((entry) => CODEX_HOST_CONTROL_PATHS.includes(entry.name))
    && [".codex", ".git"].every((name) => entries.some((entry) => entry.name === name))
    && hasCodexHostControlLayout(root, {
      access: fs.accessSync,
      fsConstants: fs.constants,
      lstat: fs.lstatSync,
      readdir: fs.readdirSync,
    }));
}

function isExistingGitMetadata(entry, root, fs) {
  if (entry.name !== ".git" || entry.symlink) return false;
  const path = join(root, ".git");
  if (entry.directory) return fs.existsSync(join(path, "HEAD")) && fs.existsSync(join(path, "objects"));
  if (!entry.file) return false;
  let pointer;
  try { pointer = fs.readFileSync(path, "utf8"); } catch { return false; }
  // A linked worktree keeps a regular `.git` pointer file rather than a
  // directory. Require Git to validate that pointer before treating it as
  // preserved project metadata; malformed user bytes remain fail-closed.
  if (!/^gitdir: [^\r\n\0]+\r?\n?$/u.test(pointer)) return false;
  const probe = fs.spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: root, encoding: "utf8" });
  return probe.status === 0 && String(probe.stdout ?? "").trim() === "true";
}

function isAdoptableUnmanagedRoot(entries, root, fs) {
  return entries.length > 0 && entries.every((entry) => {
    if (entry.name === ".git") return isExistingGitMetadata(entry, root, fs);
    return !USER_RESERVED_PATHS.has(entry.name) && !entry.symlink;
  });
}

// The seeded runner is the identity the onboarding actually ran under, echoed
// explicitly by every caller (ADR-0051/ADR-0057 R1). A literal fallback here
// is exactly how a Claude consumer used to end up with a Codex project; the
// decided fix (backlog: absent-runner-flag-silently-defaults-to-codex,
// candidate 1, fail closed) makes an absent runner a caller error instead.
//
// HISTORY (NOVA-RESTART-RUNNER-1): this and the other hardcoded `runner =
// "codex"` defaults below were once investigated for correction to
// `env.CLAUDECODE === "1" ? "claude" : "codex"`. That change was reverted: it
// directly cascades into breaking the historical regression test "omitting
// --runner keeps the historical Codex App-Server requirement"
// (project-onboarding-v3.test.mjs) and dozens of others whenever the process
// itself runs under Claude Code (CLAUDECODE=1) -- which is every session that
// could run this task or its own test suite. The prior CLOSED backlog item
// (onboarding-lifecycle-plan-hardcodes-the-codex-runner) had already declined
// this exact change for the same reason. The deferred question -- keep the
// literal, make it visible, or fail closed -- was decided by the follow-up
// backlog item above, and the regression test named there is now inverted to
// match: it asserts the omission is an error, not a preserved default.
function freshIntent(runner, fs) {
  requireRunner(runner, "freshIntent");
  const registry = loadRunnerProfilesV3Registry();
  const humanApproval = machinePushApprovalPreference(fs) ?? "signature";
  return {
    schema: "pipeline.user.v3",
    language: { human_facing: "en", agent_facing: "en" },
    agent_runtime: "other",
    runners: { enabled: ["claude", "codex", ...(runner === "antigravity" ? ["antigravity"] : [])], default: runner },
    routing: { profiles: clone(registry.profiles), duties: clone(registry.duties) },
    usage: { common_projection: "pipeline.runner-usage.v1", raw_persistence: "none" },
    autonomy: { push_policy: "gated", branch_model: "feature-branch", wip_limit: 3 },
    // `push_approval` is seeded from THIS MACHINE's remembered preference
    // (`machine-plane.mjs`'s `pushApprovalDefault`) when that plane is valid,
    // falling back to the fail-closed literal "signature" only when it is
    // absent/invalid -- exactly the situation in which the onboarding flow is
    // about to ask the question anyway (`withPendingPushApprovalSetupAsk`
    // below). Before this, the machine-scoped question's answer was recorded
    // ONLY in `machine.json` and in guidance text telling the agent to
    // hand-edit this file afterward -- an unenforced manual step, never
    // actually applied to a generated repository
    // (backlog: 2026-08-25-greenfield-onboarding-never-applies-the-machine-
    // push-approval-preference.md). The setting is the single control over
    // how a human clears a push, and with the key omitted the only way to
    // learn that "chat" exists at all was to read the plugin's source, which
    // is exactly what the 2026-08-09 greenfield runs did.
    // `security` is seeded BLOCKING (NVA-R33-SECGATEON, backlog:
    // 2026-08-28-seed-the-security-gate-on-now-that-its-satisfying-path-is-open.md).
    // It used to be seeded OFF, on grounds that are worth keeping rather than
    // erasing, because they explain WHY this is now safe rather than merely
    // asserting it is:
    //
    // NVA-R18-SCANBOOT (backlog: scanner-bootstrap-is-not-self-sufficient-for-a-
    // fresh-project, 2026-08-29) closed the two reasons `off` originally rested
    // on:
    //   - Reason 1 ("onboarding writes no `.gitignore`, so the push-gate
    //     evidence itself dirties a fresh consumer's tree") no longer holds:
    //     onboarding now seeds one (`PROJECT_IGNORE_SEED`, this file, covering
    //     `/scratch/`, `/evidence/`, `/project/pipeline-state.json`).
    //   - Reason 2 ("needs three external scanners a consumer machine need not
    //     have") is closed AS A BLOCKER: measured with no scanner reachable,
    //     every scanner reads `SKIPPED [binary_missing]`, the license check
    //     reads `SKIPPED [not-configured]`, and the verdict is CLEAN -> exit 0.
    //     A missing scanner does not fail the gate; each scanner's status is
    //     separately distinguishable in evidence as one of
    //     `passed`/`findings`/`not-configured`/`tool-unavailable`/
    //     `not-applicable` (`deriveReportStatus()`, security-scan.mjs).
    //     Semgrep's and license-check's own fallback configuration also now
    //     ships with the plugin (`security/semgrep/pipeline.yml`,
    //     `config/security/license-allowlist.default.json`) rather than only
    //     existing in the Pipeline's own repository, so a consumer that
    //     configures nothing of its own still gets a working, offline scan
    //     instead of a guaranteed ERROR.
    //   - A genuinely bare fresh consumer ships no
    //     `governance/security-controls/catalog.json`, so the real remaining
    //     "required capabilities" blocker (live only for a project that DOES
    //     ship its own catalog, this repository included per ADR-0015) does not
    //     apply to it either: an absent/unreadable catalog resolves to an empty
    //     required-capability plan, never a blocking verdict (proven in
    //     security-scan.test.mjs, "fresh consumer (no catalog)").
    //
    // The remaining, TRUE blocker the seeding item's own "Correction" section
    // found the same day -- reason 2's "own on-disk location" fallback resolves
    // fine from THIS repository's checkout but fails for an installed-plugin
    // consumer (`GITLEAKS_CONFIG_PATH` walks four directories up looking for a
    // repo root that does not exist there) -- is now ALSO closed: commit
    // `867d287a` fixed gitleaks config resolution for installed-plugin
    // deployments, and NVA-J-PUSHPREPGATE made `push-prepare.mjs` respect
    // `gates.security` (`isSecurityGateActive()`) instead of demanding evidence
    // unconditionally. Both are prerequisites this seed change depends on, not
    // reasoning original to it.
    //
    // `warn` is never the seeded value, and never will be by accident: guard-push
    // evaluates security findings into the SAME failure list it evaluates under
    // the PUSH gate's mode, which is `blocking`. A `warn` security gate would
    // therefore hard-block every consumer push while claiming to warn -- worse
    // than either `off` or `blocking`, and never a fallback to reach for here.
    gates: { dev_plan: "blocking", push: "blocking", human_approval: humanApproval, push_approval: humanApproval, security: "blocking", claude_md_max_lines: 200 },
    critic_export: clone(registry.criticExportPolicy),
    roles: { po: { display_label: "Human" } },
    session: { keep_awake: true },
    // This is repository-scoped standing consent for the already closed
    // allowlist. It is not a per-consultation prompt or approval of a wider
    // data class, provider, or packet boundary.
    advisor_export: { consent: "approved" },
  };
}
// A seeded verify command that FAILS until a human replaces it, and says what
// to replace and where. See the comment on the calibration baseline below.
const UNCONFIGURED_VERIFY = "node -e \"console.error('pipeline: the verify contract of this project is not configured. Replace the verify command in project/pipeline.json with the real verification command for this project (for example its test suite), then run verify again.'); process.exit(1)\"";

// The three PO gate profiles the kickoff flow collects, verbatim and complete.
const KICKOFF_PROFILES = Object.freeze(["epic", "feature", "mini"]);

// The seeded gate chapter. A manifest WITHOUT a `gates` section leaves every
// gate reading it inert: `gateConfig()` returns null for an absent section
// (lib/manifest.mjs), and guard-devplan.mjs exits 0 on a falsy gate -- so a
// freshly onboarded project used to run with no plan gate at all while its
// `pipeline.user.yaml` said `dev_plan: blocking`. The chapter below is what
// makes a new project state which gates are actually live.
//
// `dev-plan` is seeded in `blocking`, and that is what makes a new project ASK
// its human before implementation starts: guard-devplan.mjs exits 1 (a report
// the tool call survives) in `warn` and 2 (a refusal) in `blocking`, so a `warn`
// seed cannot keep implementation from beginning -- the reported defect was
// exactly that a fresh project wrote its first implementation file without the
// PO ever being asked
// (backlog/items/2026-08-07-a-promoted-feature-can-never-pass-the-plan-gate.md).
//
// `blocking` is only defensible because the satisfying path was MEASURED end to
// end in a real temporary root before this seed was changed, not read off the
// code: onboarding -> runtime -> kickoff -> kickoff promotion -> `submit-plan
// --by <name> --profile <epic|feature|mini>` (exit 0) -> `approve-plan --by
// <name>` (exit 0) -> `set-phase --phase implementation` (exit 0), after which
// the same non-exempt implementation write the gate refused is admitted (guard
// exit 0). The path was measured for all three PO profiles AND for a project
// that never promotes a design package (the kickoff seed is itself valid PRD
// authority), so no reachable fresh-project shape is left standing in front of
// a gate it cannot pass. The two conditions the path does depend on are already
// satisfied by the seeded artifacts: the active PRD declares the repository PO
// language once (`<!-- po-language: en -->`) and binds the neighbouring spec.md
// digest once (`<!-- technical-spec-sha256: ... -->`), which is what the kickoff
// seed writes and what a hand-authored replacement PRD must preserve.
//
// `push` is seeded `blocking` for the same reason and to the same standard, and
// not before (2026-08-09). The defect it closes is the one the PO found in BOTH
// greenfield runs: `pipeline.user.yaml` seeds `gates.push: blocking`, so the
// consumer is told the gate is live, while guard-push.mjs reads the MANIFEST and
// exits 0 on an absent gate -- a push then succeeded in a project whose own
// calibration promised it could not. One of those runs even attempted
// `approve-push`, was correctly refused for missing proof, and pushed anyway.
// A gate a project declares and does not enforce is worse than no gate.
//
// The satisfying path was MEASURED end to end in a real temporary root, not read
// off the code, and every step of it is reachable with SHIPPED commands:
//   1. the human configures a real verify command (the seeded placeholder exits 1
//      by design and says so -- this step is required of them anyway);
//   2. `node <plugin>/scripts/verify-evidence-producer.mjs --out
//      evidence/verify-latest.json` writes the candidate-bound evidence the gate
//      demands (agent-executable; it refuses rather than writing when the verify
//      command fails, so the artifact can never claim a pass that did not happen);
//   3. the human chooses how a push is cleared -- `gates.push_approval` in
//      `pipeline.user.yaml`, ADR-0056, defaulting to `signature`;
//   4. `materialize-push-threat-model` creates the artifact the approval binds
//      (agent-executable, then human-reviewed);
//   5. `approve-push --by <name> --remote <remote> --destination <full-ref>`,
//      plus the three proof flags in `signature` mode.
// After (5) the same push the guard refused is admitted (guard exit 0).
//
// The measurement is also what found the reason this could not have been seeded
// earlier even if someone had tried: in `chat` mode -- the mode ADR-0056 exists
// to give a human WITHOUT key management -- `approve-push` refused every fresh
// consumer with CRITICAL-PROOF-POLICY-KIND-REQUIRED, because it consulted the
// policy file's `requiredKinds` before the operator's stand-down. Fixed in
// scripts/pipeline-state.mjs (`verifyCriticalHumanProof`); without that fix this
// seed WOULD be the unsatisfiable gate this chapter must not create.
//
// `security` is seeded `blocking` too (NVA-R33-SECGATEON, 2026-08-29), now that
// its satisfying path in a brand-new project has actually been established --
// see the seeding comment on `freshIntent()`'s `gates` literal above for the
// full chain of prerequisites this depends on. It is `automated`, never
// `human`: the same command that satisfies it also produces the evidence
// guard-push.mjs reads, with no separate approval step.
const DEV_PLAN_BLOCKING_GATE = "gates:\n"
  // The refusal itself reports the lifecycle state but not the whole command
  // sequence out of it, so the enforcing artifact carries it.
  + "  # Human plan approval. Implementation writes are REFUSED until the PO has\n"
  + "  # approved this feature's plan and the phase has been switched:\n"
  + "  #   pipeline-state submit-plan --by <name> --profile <epic|feature|mini>\n"
  + "  #   pipeline-state approve-plan --by <name>\n"
  + "  #   pipeline-state set-phase --phase implementation\n"
  + "  dev-plan:\n    mode: blocking\n    type: human\n"
  // Same shape, same reason: the refusal reports what is missing but not the whole
  // sequence out of it, so the enforcing artifact carries it.
  + "  # Human push approval. `git push` is REFUSED until this commit carries passing,\n"
  + "  # candidate-bound verify evidence AND the PO has approved this exact commit:\n"
  + "  #   verify-evidence-producer --out evidence/verify-latest.json\n"
  + "  #   pipeline-state materialize-push-threat-model\n"
  + "  #   pipeline-state approve-push --by <name> --remote <remote> --destination <full-ref>\n"
  + "  # How a human clears it is one setting, gates.push_approval in pipeline.user.yaml:\n"
  + "  # \"signature\" (default) also demands --proof-request/--proof-authority/--proof;\n"
  + "  # \"chat\" lets them clear it in-session. Set it to \"off\" here to disable the gate.\n"
  + "  push:\n    mode: blocking\n    type: human\n"
  // Same shape again: the refusal reports which finding is missing or stale but
  // not the command that regenerates it, so the enforcing artifact carries it.
  // This gate is AUTOMATED, not human: there is no separate approval step, only
  // the scan itself.
  + "  # Automated security scan. `git push` is REFUSED (same guard-push.mjs check as\n"
  + "  # the push gate above) until this commit carries fresh, candidate-bound security\n"
  + "  # evidence -- run this from a clean, committed working tree:\n"
  + "  #   security-scan --root .\n"
  + "  # A machine missing the external scanners (gitleaks/semgrep/osv-scanner/license-\n"
  + "  # check) still reaches a CLEAN, non-blocking verdict: each scanner reports SKIPPED\n"
  + "  # rather than failing the gate (deriveReportStatus(), security-scan.mjs).\n"
  + "  security:\n    mode: blocking\n    type: automated\n";
// Per PO profile. All three resolve to the same live chapter -- the
// differentiation surface exists (the profile is a real input on the
// partial-authority path), and the satisfying path above was measured
// separately for epic, feature and mini with the same outcome, so there is no
// measured reason to give them different modes.
const FRESH_GATE_CHAPTERS = Object.freeze({
  epic: DEV_PLAN_BLOCKING_GATE,
  feature: DEV_PLAN_BLOCKING_GATE,
  mini: DEV_PLAN_BLOCKING_GATE,
});
export function freshGateChapter(profile = null) {
  return KICKOFF_PROFILES.includes(profile) ? FRESH_GATE_CHAPTERS[profile] : DEV_PLAN_BLOCKING_GATE;
}
// Greenfield onboarding has no profile yet: the kickoff collects the goal, and
// the profile is only bound later, at kickoff promotion. The profile-neutral
// chapter is therefore the seeded default, and a caller that DOES hold an
// explicit PO profile (the partial-authority reconstruction) passes it.
export function freshManifestBytes(profile = null) {
  return "schema: pipeline.manifest.v0\n"
    + "language:\n  human_facing: en\n"
    + freshGateChapter(profile)
    + "modelRouting:\n  legacy:\n    model: legacy\n    effort: low\n";
}
// The honest consumer-project calibration for `.claude/pipeline.json`, byte-
// identical to what freshBaselines() below seeds for a non-host-managed fresh
// project. This is exported so runner-profile-migration-v3.mjs's slim V3
// runtime initialization can seed the SAME honest placeholder for an ORDINARY
// consumer project's runtime targets -- as opposed to
// SLIM_V3_RUNTIME_SEEDS[".claude/pipeline.json"] there, which is the private
// overlay's own calibration and is correct only for a private overlay
// activating itself. Without this, a consumer project whose portable-seed step
// ran before its runtime-initialization step (the ordinary greenfield order)
// would have its `.claude/pipeline.json` seeded from the overlay literal the
// moment runtime initialization finds it still absent.
export function freshCalibrationBytes() {
  return `${JSON.stringify({ project: "new-project", verify: UNCONFIGURED_VERIFY, handover: "docs/state.md", autonomy: "gated", branchModel: "feature-branch", repositoryMode: "local-only", worktree: "optional", stakes: "standard", constraints: ["Configure project-specific policy before delivery."] }, null, 2)}\n`;
}
// Materializes `project/critical-human-proof.json` at onboarding time,
// unconditionally of `gates.push_approval` (ADR-0056) -- that setting is
// read from `pipeline.user.yaml`, which a human may edit at any point after
// onboarding, so the policy file cannot be seeded conditionally on a mode
// that has not been chosen yet.
//
// Backlog: 2026-08-09-critical-human-proof-not-materialized-for-signature-mode.
// A fresh project had NO `project/critical-human-proof.json` at all, so
// `readCriticalHumanProofPolicy` saw an empty `requiredKinds`, and
// `verifyCriticalHumanProof` refused the very first `approve-push` with
// `CRITICAL-PROOF-POLICY-KIND-REQUIRED` -- demanding the project declare
// `push` as proof-requiring in exactly the configuration (a freshly onboarded
// project) where nobody had yet had the chance to. The seeded manifest gate
// chapter (`freshGateChapter` above) already tells the operator `push` is
// blocking; this is the matching declaration the proof-policy reader needs to
// reach its own next real gate instead of refusing outright.
//
// `.v1`, `requiredKinds: ["push"]` only, no trust anchor -- UNLESS `fs` is
// supplied and THIS MACHINE already has a signing key
// (`detectExistingLocalTrustAnchor()` below, read-only: the machine plane's
// `poKeyDirectory` and its `trust-policy.json`). When one is found, the
// anchor is seeded into the SAME transaction as the rest of this file's
// bytes -- `.v3`'s `trustAnchors`, carrying only the key's public digest and
// its own `keyReference`, never a filesystem path -- so the first human
// override this project ever needs does not discover the anchor's absence as
// an unexplained circularity (backlog: 2026-08-28-onboarding-must-bootstrap-
// the-trust-anchor-once.md). This REUSES an already-existing key; it never
// creates one (only the PO ever runs `po-human-approval.mjs setup`,
// `collectPushApprovalPreferenceAction()`'s guidance above) and every write
// site for this file's bytes uses `flag: "wx"` (create-only), so an existing
// `project/critical-human-proof.json` is never silently replaced either way.
// No `fs` (a caller that predates this parameter, or a context with no
// filesystem access) falls back to exactly the original no-anchor seed.
//
// When no anchor is found -- no machine key yet, or `fs` withheld -- the
// seed stays `.v1`, `requiredKinds: ["push"]` only: no waiver, no trust
// anchor, no kind beyond the one gate this seed already turns on. A project
// that wants more (a waiver, a kind beyond `push`) edits this file itself --
// gate-strength protected (GS-2), by design, same as every other change to
// its own strength.
export function freshCriticalHumanProofPolicyBytes(fs = null) {
  const anchor = fs ? detectExistingLocalTrustAnchor(fs) : null;
  if (anchor) {
    // `waivedKinds` is REQUIRED on every v2/v3 document by
    // readCriticalHumanProofPolicy()'s own exactKeys() shape check
    // (critical-human-proof-policy.mjs) -- an absent field there is not "no
    // waivers", it is `!Array.isArray(value.waivedKinds)`, which fails the
    // whole document as CRITICAL-PROOF-POLICY-INVALID. Omitting it here once
    // seeded a v3 anchor that this repository's OWN consumer refused to read
    // -- authorizeHumanGuardOverrideBySignature() then still fell through to
    // HGO-TRUST-ANCHOR-MISSING, reproducing the exact deadlock this function
    // exists to prevent (measured live: scratch/probe-trust-anchor-shape.mjs,
    // backlog 2026-08-28-onboarding-must-bootstrap-the-trust-anchor-once.md).
    return `${JSON.stringify({
      schema: CRITICAL_HUMAN_PROOF_POLICY_V3,
      requiredKinds: ["push"],
      waivedKinds: [],
      trustAnchors: [{ keyReference: anchor.keyReference, publicKeySha256: anchor.publicKeySha256 }],
    }, null, 2)}\n`;
  }
  return `${JSON.stringify({ schema: CRITICAL_HUMAN_PROOF_POLICY_V1, requiredKinds: ["push"] }, null, 2)}\n`;
}
// Computes the `permissions.allow` entries a freshly onboarded consumer needs
// to invoke the pipeline scripts onboarding itself hands the project, on
// every runner lane (Bash, PowerShell) and every path spelling the same
// absolute directory can be written with (backslash- and forward-slash-
// separated) -- backlog:
// 2026-08-28-a-consumer-project-must-allowlist-every-runner-lane-itself.md.
// The gap this closes was measured live: a consumer's settings.json covered
// exactly ONE spelling on ONE lane (a Windows backslash path, Bash only),
// so the SAME invocation nondeterministically ran or was refused depending
// on which lane and which path spelling the runner's own classifier saw --
// turning an ordinary guard refusal into a total stop with no lane left to
// retry on.
//
// `scriptsDirAbsolute` is this machine's own OS-native absolute path to the
// installed plugin's `scripts/` directory (see `SCRIPTS_DIR` above) -- never
// a project-relative path, because a marketplace install is reached from
// outside the project root. On POSIX, forward- and backslash-normalized
// forms of a path with no backslashes in it are byte-identical, so only ONE
// spelling is emitted there; on Windows the two forms differ and both are
// emitted, matching the item's own "path spelling matters on Windows
// specifically" framing -- this never invents a spelling the host does not
// actually need.
export function pipelineScriptsRunnerAllowlistEntries(scriptsDirAbsolute) {
  const trimmed = scriptsDirAbsolute.replace(/[\\/]+$/u, "");
  const forwardSlash = trimmed.replace(/\\/gu, "/");
  const backslash = trimmed.replace(/\//gu, "\\");
  const spellings = forwardSlash === backslash ? [forwardSlash] : [forwardSlash, backslash];
  const entries = [];
  for (const lane of ["Bash", "PowerShell"]) {
    for (const spelling of spellings) {
      const glob = spelling.includes("\\") ? `${spelling}\\*` : `${spelling}/*`;
      entries.push(`${lane}(node "${glob}")`);
    }
  }
  return entries;
}
// Materializes `.claude/settings.json`'s fresh-onboarding seed bytes. Kept as
// its own exported function (mirrors `freshCriticalHumanProofPolicyBytes`,
// `freshCalibrationBytes` immediately above) so a test can assert on the
// bytes directly rather than only through the larger `freshBaselines` map.
export function freshSettingsJsonBytes() {
  return `${JSON.stringify({ permissions: { allow: pipelineScriptsRunnerAllowlistEntries(SCRIPTS_DIR) } }, null, 2)}\n`;
}
function freshBaselines(intent, { hostManaged = false, profile = null, fs = null } = {}) {
  const baselines = {
    ".claude/settings.json": { status: "present", bytes: freshSettingsJsonBytes() },
    // The seeded verify command FAILS until a human configures it. The previous
    // seed (`git diff --check`) was chosen to be HEAD-independent so it could
    // never fail before the user's first commit -- which made a brand-new
    // project report a green verification contract while owning no tests at
    // all, indistinguishable from a satisfied one everywhere downstream (stop
    // hook, Goldfish submission, candidate binding). An unconfigured contract
    // must be visibly unconfigured, so the placeholder exits non-zero and names
    // exactly what to replace and where. `node` is used rather than a shell
    // builtin because the runtime executing this command is guaranteed present
    // on every host the Pipeline runs on, on Windows as well.
    ".claude/pipeline.json": { status: "present", bytes: `${JSON.stringify({ project: "new-project", verify: UNCONFIGURED_VERIFY, handover: "docs/state.md", autonomy: "gated", branchModel: "feature-branch", repositoryMode: hostManaged ? "host-managed" : "local-only", worktree: "optional", stakes: "standard", constraints: [hostManaged ? "Codex owns .git and .codex; configure project verification before delivery." : "Configure project-specific policy before delivery."] }, null, 2)}\n` },
    ".claude/pipeline.yaml": { status: "present", bytes: freshManifestBytes(profile) },
    ".codex/config.toml": { status: "present", bytes: "" },
    ".codex/agents/implementor.toml": { status: "present", bytes: codexCustomAgentSeed("implementor") },
    ".codex/agents/critic.toml": { status: "present", bytes: codexCustomAgentSeed("critic") },
    ".codex/agents/consult-advisor.toml": { status: "present", bytes: "" },
  };
  const projection = planRuntimeProjectionV3(intent, { baselines });
  if (projection.status !== "ready") throw new Error("fresh V3 runtime projection is invalid");
  for (const target of projection.targets.filter((entry) => entry.path.startsWith(".claude/"))) {
    if (target.after?.status !== "present" || typeof target.after.bytes !== "string") {
      throw new Error(`fresh V3 runtime target is invalid: ${target.path}`);
    }
    baselines[target.path] = { status: "present", bytes: target.after.bytes };
  }
  baselines[NEUTRAL_CALIBRATION] = {
    status: "present",
    bytes: baselines[".claude/pipeline.json"].bytes,
  };
  baselines[NEUTRAL_MANIFEST] = {
    status: "present",
    bytes: baselines[".claude/pipeline.yaml"].bytes,
  };
  baselines[CRITICAL_HUMAN_PROOF_POLICY_PATH] = {
    status: "present",
    bytes: freshCriticalHumanProofPolicyBytes(fs),
  };
  return baselines;
}
function gitCapability(fs, root) {
  const observation = fs.spawnSync("git", ["--version"], { cwd: root, encoding: "utf8" });
  if (observation.error || observation.status !== 0) return { ok: false, reason: "git --version failed" };
  const match = String(observation.stdout ?? "").match(/git version (\d+)\.(\d+)(?:\.(\d+))?/u);
  if (!match) return { ok: false, reason: "Git version is not recognizable" };
  const major = Number(match[1]); const minor = Number(match[2]);
  if (major < 2 || (major === 2 && minor < 28)) return { ok: false, reason: "Git 2.28 or newer is required for --initial-branch" };
  return { ok: true, version: match[0] };
}
function legacyInspection(rootDir, fs) {
  let root;
  try { root = safeRoot(rootDir, fs); } catch (error) { return { schema: LEGACY_SCHEMA, status: "unsafe", diagnostics: [diagnostic("$.root", "unsafe_root", error.message, "supply a real non-symlink directory")] }; }
  let entries;
  try { entries = rootEntries(root, fs); } catch (error) { return { schema: LEGACY_SCHEMA, status: "unsafe", root, diagnostics: [diagnostic("$.root", "root_unreadable", error.message, "repair root access before onboarding")] }; }
  const link = entries.find((entry) => entry.symlink);
  if (link) return { schema: LEGACY_SCHEMA, status: "unsafe", root, diagnostics: [diagnostic(`$.entries.${link.name}`, "symlink_entry", "fresh onboarding rejects symbolic links", "use a real empty directory")], entries: entries.map((entry) => entry.name) };
  if (entries.length === 0) return { schema: LEGACY_SCHEMA, status: "fresh", root, diagnostics: [], entries: [] };
  if (isHostControlLayout(root, entries, fs)) {
    return {
      schema: LEGACY_SCHEMA,
      status: "fresh-host-managed",
      root,
      diagnostics: [diagnostic(
        "$.entries",
        "host_managed_fresh_root",
        "Codex owns the empty, non-writable .git and .codex control paths (plus .agents when present); onboarding will create only portable project authority outside them",
        "review the host-managed plan and activate it; do not remove, overwrite, chmod, or relocate the reserved paths",
      )],
      entries: entries.map((entry) => entry.name),
    };
  }
  const sourcePath = safePath(root, SOURCE, fs);
  if (fs.existsSync(sourcePath)) {
    const migrated = inspectRunnerProfileMigrationV3({ rootDir: root, deps: fs });
    if (migrated.status === "ready" && ["v0", "v1", "v2"].includes(migrated.sourceKind)) {
      return { schema: LEGACY_SCHEMA, status: "migration-required", root, sourceKind: migrated.sourceKind, diagnostics: [diagnostic("$.source", "legacy_source", "the root has a legacy pipeline authority", "use runner-profile-migration-v3 inspect, plan, then apply --activate")], entries: entries.map((entry) => entry.name) };
    }
    if (migrated.status === "ready" && migrated.sourceKind === "v3-refresh") {
      return { schema: LEGACY_SCHEMA, status: "migration-required", root, sourceKind: migrated.sourceKind, diagnostics: [diagnostic("$.source", "stale_generated_projection", "the V3 source uses a recognized older generated registry projection", "review and apply the closed V3 registry refresh")], entries: entries.map((entry) => entry.name) };
    }
    if (migrated.status === "ready" && migrated.sourceKind === "v3") {
      const authority = validateV3BootstrapAuthority({ rootDir: root, deps: fs });
      if (["projection-current", "restart-required", "ready"].includes(authority.status)
        || authority.runtimeProjection === "noop") {
        return { schema: LEGACY_SCHEMA, status: "ready", root, diagnostics: [], entries: entries.map((entry) => entry.name) };
      }
    }
  }
  let runtimePresent;
  try { runtimePresent = hasOwnRuntime(root, fs); }
  catch (error) {
    return { schema: LEGACY_SCHEMA, status: "unsafe", root, diagnostics: [diagnostic("$.runtime", "unsafe_runtime_path", error.message, "remove symbolic links before onboarding")], entries: entries.map((entry) => entry.name) };
  }
  if (!runtimePresent && !fs.existsSync(sourcePath) && isAdoptableUnmanagedRoot(entries, root, fs)) {
    return {
      schema: LEGACY_SCHEMA,
      status: "existing-unmanaged",
      root,
      diagnostics: [diagnostic(
        "$.root",
        "adoption_required",
        "the root contains an existing project without Pipeline authority; only absent, conflict-free Pipeline targets may be added after explicit activation",
        "review the adoption plan and pass apply --activate; existing project files and Git history stay untouched",
      )],
      entries: entries.map((entry) => entry.name),
    };
  }
  const code = runtimePresent || fs.existsSync(sourcePath) ? "partial_v3_state" : "unrelated_entries";
  return { schema: LEGACY_SCHEMA, status: "partial", root, diagnostics: [diagnostic("$.root", code, "the root is not a brand-new empty project directory", "do not overwrite it; inspect or repair its existing authority explicitly")], entries: entries.map((entry) => entry.name) };
}

function lifecycleDiagnostic(path, code, message, guidance = "") {
  return { path, code, message: String(message).replace(/[\r\n]+/gu, " "), guidance: String(guidance).replace(/[\r\n]+/gu, " ") };
}

function emptyRuntime(status = "not-observed") {
  return { status, sourceSha256: null, targetsSha256: null, barrierSha256: null, readbackSha256: null };
}

const RUNTIME_FAILURES = Object.freeze({
  "runtime-executable-unavailable": {
    code: "runtime_executable_unavailable",
    message: "the trusted Codex runtime executable is unavailable",
    guidance: "install or expose the physical platform executable before retrying",
  },
  "runtime-executable-unsafe": {
    code: "runtime_executable_unsafe",
    message: "the discovered Codex runtime executable is unsafe",
    guidance: "remove linked or wrapper candidates and expose the physical platform executable",
  },
  "private-state-assurance-unavailable": {
    code: "private_state_assurance_unavailable",
    message: "private restart-state assurance is unavailable",
    guidance: "restore the platform owner/access inspector before retrying",
  },
  "private-state-object-unsafe": {
    code: "private_state_object_unsafe",
    message: "a private restart-state object is unsafe",
    guidance: "repair the owner-only physical private-state boundary before retrying",
  },
  "writer-lock-unavailable": {
    code: "writer_lock_unavailable",
    message: "the private restart-state writer lock is unavailable",
    guidance: "inspect the typed writer-lock state before retrying",
  },
});

function runtimeFailureResult(base, error, {
  phase,
  code,
  message,
  guidance,
} = {}) {
  const typed = error instanceof CodexOnboardingRuntimeError ? RUNTIME_FAILURES[error.code] : null;
  const failurePhase = error instanceof CodexOnboardingRuntimeError ? error.phase : phase;
  const failure = typed ?? { code, message, guidance };
  return lifecycleResult({
    status: "runtime-readback-unavailable",
    root: base.root,
    runner: base.runner,
    intent: base.intent,
    repository: base.repository,
    runtime: emptyRuntime("readback-unavailable"),
    nextAction: null,
    diagnostics: [lifecycleDiagnostic(
      `$.runtime.${failurePhase}`,
      failure.code,
      failure.message,
      failure.guidance,
    )],
  });
}

function emptyContinuity() { return { status: "unavailable", stateSha256: null, handoverSha256: null, historySha256: null }; }

function emptyAppServer() { return { required: false, status: "not-requested", code: null }; }

function cleanupHumanRecoveryAction(root) {
  return {
    kind: "command",
    executable: "node",
    argv: [SESSION_CLEANUP_SCRIPT, "plan-human-recovery", "--repo", root],
    mutation: false,
    requiresConfirmation: false,
    expected: {
      schema: "pipeline.session-cleanup-human-recovery-plan.v1",
      statuses: ["decision-required"],
    },
  };
}

function partialCleanupRecoveryResult({
  root,
  runner,
  intent,
  repository,
  runtime = emptyRuntime(),
  deps = {},
  strict = false,
}) {
  requireRunner(runner, "partialCleanupRecoveryResult");
  try {
    const planCleanupRecovery = deps.planSessionCleanupRecovery
      ?? planSessionCleanupRecovery;
    const recovery = planCleanupRecovery({
      rootDir: root,
      scriptPath: SESSION_CLEANUP_SCRIPT,
    });
    // Per the PO's explicit 2026-08-18 decision (backlog item
    // pipeline.self-healing-local-cleanup-recovery), a "ready" typed recovery
    // plan is auto-applied here rather than surfaced as a PO selection
    // question -- readyRecoveryPlan()'s applyAction now carries
    // requiresConfirmation: false for all six typed recovery kinds. Only an
    // apply failure (the plan's own digest/readback proofs did not hold) or
    // the untyped plan-human-recovery path below still asks a human.
    if (recovery.status === "ready") {
      const applyCleanupRecovery = deps.applySessionCleanupRecovery
        ?? applySessionCleanupRecovery;
      try {
        applyCleanupRecovery({
          rootDir: root,
          expectedPlanSha256: recovery.planSha256,
          activate: true,
          scriptPath: SESSION_CLEANUP_SCRIPT,
        });
        return null;
      } catch (error) {
        const typed = error instanceof SessionCleanupRecoveryError;
        return lifecycleResult({
          status: "partial",
          root,
          runner,
          intent,
          repository,
          runtime,
          nextAction: cleanupHumanRecoveryAction(root),
          diagnostics: [lifecycleDiagnostic(
            "$.authority.sessionCleanup",
            typed ? error.code : "cleanup_recovery_apply_failed",
            typed
              ? error.message
              : "an automatic, digest-bound cleanup recovery attempt did not converge",
            "retain the state and request an explicit authority decision; do not guess, replace, or delete a descriptor",
          )],
        });
      }
    }
    const nextAction = new Set(["cleanup-required", "release-ready"]).has(recovery.status)
      ? recovery.nextAction ?? null
      : null;
    if (nextAction !== null) {
      return lifecycleResult({
        status: "partial",
        root,
        runner,
        intent,
        repository,
        runtime,
        nextAction,
        diagnostics: [lifecycleDiagnostic(
          "$.authority.sessionCleanup",
          "cleanup_recovery_required",
          "exact retained cleanup residue blocks authority completion",
          "apply only the descriptor- and digest-bound cleanup recovery action",
        )],
      });
    }
    if (new Set([
      "closed-recovery-unavailable",
      "orphan-cleanup-required",
      "orphan-recovery-unavailable",
    ]).has(recovery.status)) {
      return lifecycleResult({
        status: "partial",
        root,
        runner,
        intent,
        repository,
        runtime,
        nextAction: cleanupHumanRecoveryAction(root),
        diagnostics: [lifecycleDiagnostic(
          "$.authority.sessionCleanup",
          "cleanup_recovery_unavailable",
          "cleanup residue lacks sufficient exact recovery proof",
          "retain the state and request an explicit authority decision; do not guess, replace, or delete a descriptor",
        )],
      });
    }
  } catch {
    if (strict) {
      return lifecycleResult({
        status: "partial",
        root,
        runner,
        intent,
        repository,
        runtime,
        nextAction: cleanupHumanRecoveryAction(root),
        diagnostics: [lifecycleDiagnostic(
          "$.authority.sessionCleanup",
          "cleanup_recovery_observation_unavailable",
          "cleanup recovery authority could not be observed safely",
          "repair private cleanup-state read access before retrying",
        )],
      });
    }
    // Other partial-authority states remain owned by their existing typed
    // source/manifest diagnostics. Never infer cleanup authority from failure.
  }
  return null;
}

function persistedPoAuthority(root, fs) {
  try {
    const path = safePath(root, projectAuthorityPaths(root, fs).state, fs);
    const before = fs.lstatSync(path);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1
      || fs.realpathSync(path) !== path) {
      return { status: "unavailable" };
    }
    const bytes = fs.readFileSync(path);
    const after = fs.lstatSync(path);
    if (!after.isFile() || after.isSymbolicLink() || after.nlink !== 1
      || before.dev !== after.dev || before.ino !== after.ino
      || before.mode !== after.mode || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs || fs.realpathSync(path) !== path) {
      return { status: "unavailable" };
    }
    const state = JSON.parse(bytes.toString("utf8"));
    const continuity = state?.continuity?.authority;
    const lifecycle = derivePlanLifecycle(state, {
      ...(SHA256_RE.test(continuity?.prd?.sha256 ?? "")
        ? { planSha256: continuity.prd.sha256 }
        : {}),
      ...(SHA256_RE.test(continuity?.spec?.sha256 ?? "")
        ? { specSha256: continuity.spec.sha256 }
        : {}),
    });
    if (!lifecycle.ok) return { status: "drifted", nextAction: lifecycle.nextAction };
    if (lifecycle.status === null) return { status: "absent", lifecycleStatus: null };
    if (lifecycle.status === "draft"
      || lifecycle.status === "awaiting-approval") {
      return { status: "absent", lifecycleStatus: lifecycle.status };
    }
    const approval = state.planApproval?.poGateAuthority;
    if (!SHA256_RE.test(approval?.planSha256 ?? "")
      || !SHA256_RE.test(approval?.specSha256 ?? "")
      || continuity?.prd?.path !== approval.planPath
      || continuity?.spec?.path !== approval.specPath) return { status: "drifted" };
    return {
      status: "observed",
      planSha256: approval.planSha256,
      specSha256: approval.specSha256,
      lifecycleStatus: lifecycle.status,
    };
  } catch {
    return { status: "unavailable" };
  }
}

function plannerEnvironmentForRunner(runner) {
  const env = { ...process.env };
  for (const key of ["CLAUDECODE", "ANTIGRAVITY_AGENT", "AI_AGENT", "CODEX_SESSION_ID", "CODEX_THREAD_ID"]) delete env[key];
  if (runner === "claude") env.CLAUDECODE = "1";
  else if (runner === "antigravity") env.ANTIGRAVITY_AGENT = "1";
  else env.CODEX_SESSION_ID = "project-onboarding-driver";
  return env;
}

function observePoAuthorityRebind(root, fs, runner) {
  const unavailable = (reason) => ({ status: "unavailable", reason });
  const injectedValidator = typeof fs.validatePoGateAuthorityForRepository === "function";
  const validateAuthority = fs.validatePoGateAuthorityForRepository ?? validatePoGateAuthorityForRepository;
  const injectedPersisted = typeof fs.observePersistedPoAuthority === "function";
  const persisted = injectedPersisted
    ? fs.observePersistedPoAuthority(root)
    : persistedPoAuthority(root, fs);
  if (persisted.status === "drifted") return unavailable("persisted-authority-drift");
  if (persisted.status === "unavailable" && !injectedValidator) return unavailable("persisted-authority-unavailable");
  // A pristine kickoff or exact revoke-plan v2 postimage deliberately carries
  // no current approval. Re-validating historical State provenance as though
  // it were live PO authority recreates the design re-entry deadlock.
  if (persisted.status === "absent" && !injectedPersisted) return { status: "not-needed" };
  const authority = validateAuthority(persisted.status === "observed"
    ? {
      repoRoot: root,
      expectedPlanSha256: persisted.planSha256,
      expectedSpecSha256: persisted.specSha256,
    }
    : { repoRoot: root });
  if (authority?.ok === true) return { status: "not-needed" };
  if (authority?.code === "PO-GATE-PLAN-DIGEST-STALE") {
    return unavailable("plan-digest-stale");
  }
  // A PRD that never carried the technical Spec marker at all (or carries more
  // than one) has no recorded digest for a rebind to fold in, and the rebind
  // writer itself refuses this state (PO-REBIND-STATE): it requires an
  // existing approval, which a PRD that never carried the marker cannot have
  // reached. Offering the rebind route here would be offering a route already
  // known to refuse, so this is explicitly not-applicable rather than left to
  // fall through the inequality below alongside every other unrelated code.
  if (authority?.code === "PO-GATE-PRD-SPEC-MARKER-MISSING") {
    return { status: "not-applicable" };
  }
  if (authority?.code !== "PO-GATE-PRD-SPEC-MISMATCH") {
    return { status: "not-applicable" };
  }
  let writer;
  try {
    writer = PO_AUTHORITY_REBIND_WRITER;
    const info = fs.lstatSync(writer);
    if (!info.isFile() || info.isSymbolicLink() || fs.realpathSync(writer) !== writer) {
      throw new Error("unsafe PO authority writer");
    }
  } catch {
    return unavailable("writer-unavailable");
  }
  const planned = fs.spawnSync(process.execPath, [writer, "po-authority-rebind-plan"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    env: plannerEnvironmentForRunner(runner),
    maxBuffer: 2 * 1024 * 1024,
  });
  if (planned?.error) return unavailable("planner-execution-unavailable");
  if (planned?.status !== 0) return unavailable("planner-rejected");
  if (String(planned.stderr ?? "").trim() !== "") return unavailable("planner-protocol-violation");
  let plan;
  try {
    plan = JSON.parse(String(planned.stdout ?? ""));
  } catch {
    return unavailable("planner-malformed-output");
  }
  const action = plan?.applyAction;
  const expectedArgv = [
    writer,
    "po-authority-rebind-apply",
    "--plan-sha256",
    plan?.planSha256,
    "--updated-at",
    plan?.plannedAt,
    "--activate",
    "--runner",
    runner,
  ];
  if (!plan || typeof plan !== "object" || Array.isArray(plan)
    || plan.schema !== "pipeline.po-authority-rebind-plan.v1"
    || plan.root !== root
    || !SHA256_RE.test(plan.planSha256 ?? "")
    || typeof plan.plannedAt !== "string"
    || !Number.isFinite(Date.parse(plan.plannedAt))
    || new Date(plan.plannedAt).toISOString() !== plan.plannedAt
    || !action || typeof action !== "object" || Array.isArray(action)
    || action.executable !== process.execPath
    || JSON.stringify(action.argv) !== JSON.stringify(expectedArgv)
    || action.mutation !== true
    || action.requiresConfirmation !== true
    || action.requiresHostBoundary !== true) {
    return unavailable("planner-invalid-plan");
  }
  return {
    status: "required",
    nextAction: {
      kind: "command",
      executable: action.executable,
      argv: action.argv,
      mutation: true,
      requiresConfirmation: true,
      expected: {
        schema: "pipeline.po-authority-rebind-apply.v1",
        statuses: ["applied"],
      },
    },
  };
}

function observePoAuthorityDecision(root, fs, runner) {
  let writer;
  try {
    writer = PO_AUTHORITY_REBIND_WRITER;
    const info = fs.lstatSync(writer);
    if (!info.isFile() || info.isSymbolicLink() || fs.realpathSync(writer) !== writer) {
      throw new Error("unsafe PO authority writer");
    }
  } catch {
    return { status: "unavailable" };
  }
  const planned = fs.spawnSync(process.execPath, [writer, "po-authority-decision-plan"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    env: plannerEnvironmentForRunner(runner),
    maxBuffer: 2 * 1024 * 1024,
  });
  if (planned?.error || planned?.status !== 0 || String(planned.stderr ?? "").trim() !== "") {
    return observePoProfileRepair(root, fs);
  }
  let plan;
  try { plan = JSON.parse(String(planned.stdout ?? "")); }
  catch { return { status: "unavailable" }; }
  const candidates = Array.isArray(plan?.candidates) ? plan.candidates : [];
  const actions = Array.isArray(plan?.selectionActions) ? plan.selectionActions : [];
  const specAction = actions.find((action) => action?.selectedCandidate === "spec");
  const prdAction = actions.find((action) => action?.selectedCandidate === "prd");
  const expectedSelectionArgv = [
    writer,
    "po-authority-decision-select",
    "--plan-sha256",
    plan?.planSha256,
    "--planned-at",
    plan?.plannedAt,
    "--selection",
    "spec",
    "--runner",
    runner,
  ];
  if (!plan || typeof plan !== "object" || Array.isArray(plan)
    || plan.schema !== "pipeline.po-authority-decision-plan.v1"
    || plan.root !== root || !SHA256_RE.test(plan.planSha256 ?? "")
    || typeof plan.plannedAt !== "string" || !Number.isFinite(Date.parse(plan.plannedAt))
    || new Date(plan.plannedAt).toISOString() !== plan.plannedAt
    || candidates.length !== 2
    || JSON.stringify(candidates.map((candidate) => candidate?.id).sort()) !== JSON.stringify(["prd", "spec"])
    || !specAction || specAction.status !== "available"
    || specAction.executable !== process.execPath
    || JSON.stringify(specAction.argv) !== JSON.stringify(expectedSelectionArgv)
    || specAction.mutation !== false || specAction.requiresConfirmation !== true
    || !prdAction || prdAction.status !== "unavailable" || prdAction.mutation !== false) {
    return { status: "unavailable" };
  }
  return {
    status: "required",
    nextAction: {
      kind: "command",
      executable: process.execPath,
      argv: [writer, "po-authority-decision-plan"],
      mutation: false,
      requiresConfirmation: false,
      expected: {
        schema: "pipeline.po-authority-decision-plan.v1",
        statuses: ["planned"],
      },
    },
  };
}

function observePoProfileRepair(root, fs) {
  const validateProfile = fs.validatePoGateProfileForRepository ?? validatePoGateProfileForRepository;
  const profile = validateProfile({ repoRoot: root });
  if (profile?.ok === true) return { status: "unavailable" };
  let writer;
  try {
    writer = PO_PROFILE_REPAIR_WRITER;
    const info = fs.lstatSync(writer);
    if (!info.isFile() || info.isSymbolicLink() || fs.realpathSync(writer) !== writer) {
      return { status: "unavailable" };
    }
  } catch {
    return { status: "unavailable" };
  }
  const planned = fs.spawnSync(process.execPath, [writer, "plan", "--root", root], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (planned?.error || planned?.status !== 0 || String(planned.stderr ?? "").trim() !== "") {
    return { status: "unavailable" };
  }
  let plan;
  try { plan = JSON.parse(String(planned.stdout ?? "")); }
  catch { return { status: "unavailable" }; }
  const action = plan?.applyAction;
  const expectedArgv = [
    writer,
    "apply",
    "--root",
    root,
    "--plan-sha256",
    plan?.planSha256,
    "--activate",
  ];
  if (plan?.schema !== "pipeline.po-gate-profile-repair-plan.v1"
    || plan?.status !== "ready" || plan?.root !== root
    || !SHA256_RE.test(plan?.planSha256 ?? "")
    || action?.executable !== process.execPath
    || JSON.stringify(action?.argv) !== JSON.stringify(expectedArgv)
    || action?.mutation !== true || action?.requiresConfirmation !== true
    || action?.requiresHostBoundary !== true) {
    return { status: "unavailable" };
  }
  return {
    status: "profile-repair-required",
    nextAction: {
      kind: "command",
      executable: action.executable,
      argv: action.argv,
      mutation: true,
      requiresConfirmation: true,
      expected: {
        schema: "pipeline.po-gate-profile-repair-apply.v1",
        statuses: ["applied"],
      },
    },
  };
}

function runtimeTargetReadOnlyResult({ root, runner, intent, repository }) {
  requireRunner(runner, "runtimeTargetReadOnlyResult");
  return lifecycleResult({
    status: "runtime-target-read-only",
    root,
    runner,
    intent,
    repository,
    runtime: emptyRuntime("target-read-only"),
    nextAction: null,
    diagnostics: [lifecycleDiagnostic(
      "$.runtime",
      "runtime_target_read_only",
      "a selected Codex runtime target cannot support the required reversible transaction",
      "repair target or parent permissions before planning runtime changes",
    )],
  });
}

function unavailableRepository(intent) {
  return {
    status: "unavailable",
    mode: "unknown",
    gitVersion: null,
    initializesGit: false,
    rootWritable: "not-observed",
    sessionCapability: ["onboarding", "bootstrap"].includes(intent) ? "not-required" : "not-observed",
    worktreeCapability: intent === "dispatch" ? "not-observed" : "not-required",
  };
}

const REPOSITORY_KEYS = [
  "status", "mode", "gitVersion", "initializesGit", "rootWritable", "sessionCapability", "worktreeCapability",
];
const REPOSITORY_STATUSES = new Set([
  "local-valid-writable", "local-uninitialized", "host-managed", "control-path-read-only", "control-path-invalid",
  "git-unavailable", "root-read-only", "session-capability-unavailable", "worktree-capability-unavailable", "unavailable",
]);
function validRepositoryComponent(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...REPOSITORY_KEYS].sort())
    && REPOSITORY_STATUSES.has(value.status)
    && new Set(["local", "host-managed", "unknown"]).has(value.mode)
    && (value.gitVersion === null || (typeof value.gitVersion === "string" && value.gitVersion.length > 0))
    && typeof value.initializesGit === "boolean"
    && new Set(["passed", "failed", "not-observed"]).has(value.rootWritable)
    && new Set(["passed", "failed", "not-required", "not-observed"]).has(value.sessionCapability)
    && new Set(["passed", "failed", "not-required", "not-observed"]).has(value.worktreeCapability);
}

function observeRepositoryCapability(rootDir, fs, intent, willInitializeGit = false) {
  try {
    const observed = fs.observeCodexOnboardingCapabilities({
      rootDir,
      intent,
      willInitializeGit,
      deps: { spawnSync: fs.spawnSync },
    });
    return validRepositoryComponent(observed) ? observed : unavailableRepository(intent);
  } catch {
    return unavailableRepository(intent);
  }
}

function persistedHostManagedLayout(root, fs) {
  try {
    const calibrationPath = projectAuthorityPaths(root, fs).calibration;
    const calibration = JSON.parse(fs.readFileSync(safePath(root, calibrationPath, fs), "utf8"));
    return calibration?.repositoryMode === "host-managed" && hasCodexHostControlLayout(root, {
      access: fs.accessSync, fsConstants: fs.constants, lstat: fs.lstatSync, readdir: fs.readdirSync,
    });
  } catch { return false; }
}

function pluginManagedCodexRuntime(root, fs) {
  const reserved = hasCodexRuntimeControlMount(root, {
    access: fs.accessSync,
    fsConstants: fs.constants,
    lstat: fs.lstatSync,
    readdir: fs.readdirSync,
  });
  if (!reserved) return null;
  const admission = observeCodexHostRepositoryInitAdmission(root, {
    lstat: fs.lstatSync,
    readFile: fs.readFileSync,
    platform: fs.process?.platform,
  });
  if (admission.status === "valid") return "receipt-attested";
  return admission.status === "invalid" ? "receipt-invalid" : "reserved-unattested";
}

function pluginManagedAdmissionDriftResult({ root, runner, intent, repository, sourceSha256 }) {
  requireRunner(runner, "pluginManagedAdmissionDriftResult");
  return lifecycleResult({
    status: "projection-drift",
    root,
    runner,
    intent,
    repository,
    runtime: {
      ...emptyRuntime("projection-drift"),
      sourceSha256: sourceSha256 ?? null,
    },
    nextAction: null,
    diagnostics: [lifecycleDiagnostic(
      "$.runtime",
      "projection_drift",
      "an existing Codex host-initialization receipt is invalid or no longer bound to the current authority",
      "repair the host-initialization receipt and control layout before retrying; do not repeat initialization",
    )],
  });
}

function commandAction(argv, mutation, requiresConfirmation, schema, statuses) {
  return { kind: "command", executable: "node", argv, mutation, requiresConfirmation, expected: { schema, statuses } };
}

/**
 * Append the identity this observation ran under to a self-referencing
 * onboarding-script argv, so executing the returned action verbatim can never
 * silently substitute a different runner (ADR-0051, ADR-0057 R1). `--intent` is
 * appended only when it differs from the "onboarding" default the receiving
 * command would apply anyway; carrying the default forward changes nothing.
 *
 * A caller with no runner in scope must not call this — that is the stop
 * condition, not a case to paper over with a literal.
 */
function lifecycleArgv(argv, runner, intent = "onboarding") {
  if (typeof runner !== "string" || runner.length === 0) return argv;
  return intent === "onboarding" ? [...argv, "--runner", runner] : [...argv, "--runner", runner, "--intent", intent];
}

/**
 * NVA-W12-COPYSAFE: exported (previously module-private) so copy-safe-command.mjs
 * can quote the real argv values of a command that also carries an unresolved
 * placeholder (e.g. "<plan-sha256>") without re-implementing this quoting --
 * the placeholder text itself bypasses shellWord() entirely (see
 * copy-safe-command.mjs's placeholder()), this export only covers the REAL
 * values sitting alongside it in the same argv. Behavior is unchanged for
 * every existing caller of renderProjectOnboardingAction(), which still calls
 * this the same way it always has.
 */
export function shellWord(value) {
  if (typeof value !== "string" || value.includes("\0")) {
    throw new TypeError("command arguments must be NUL-free strings");
  }
  if (/^[A-Za-z0-9_@%+=:,./-]+$/u.test(value)) return value;
  if (/[\r\n]/u.test(value)) {
    const escaped = value
      .replaceAll("\\", "\\\\")
      .replaceAll("'", "\\'")
      .replaceAll("\r", "\\r")
      .replaceAll("\n", "\\n");
    return `$'${escaped}'`;
  }
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

/** Render an exact command/restart action as one copy-safe shell line. */
export function renderProjectOnboardingAction(action) {
  let executable;
  let argv;
  if (action?.kind === "command") {
    executable = action.executable;
    argv = action.argv;
  } else if (action?.kind === "restart-process") {
    executable = action.launch?.executable;
    argv = action.launch?.argv;
  } else {
    throw new TypeError("only command and restart-process actions are renderable");
  }
  if (typeof executable !== "string" || !Array.isArray(argv) || !argv.every((part) => typeof part === "string")) {
    throw new TypeError("action executable/argv is invalid");
  }
  return [executable, ...argv].map(shellWord).join(" ");
}

const COPY_COMMAND_MAX_COLUMNS = 72;
function singleQuoted(value, powershell = false) {
  return powershell
    ? `'${value.replaceAll("'", "''")}'`
    : `'${value.replaceAll("'", "'\"'\"'")}'`;
}
function boundedAssignmentLines(name, value, renderer = "posix") {
  if (/[\r\n]/u.test(value)) throw new TypeError("copy command values cannot contain line breaks");
  const powershell = renderer === "powershell";
  const cmd = renderer === "cmd";
  if (!new Set(["posix", "powershell", "cmd"]).has(renderer)) {
    throw new TypeError("copy command renderer is invalid");
  }
  // cmd.exe expands %, ! and several metacharacters before executing SET.
  // Refuse rather than emit a seemingly copy-safe command for those roots.
  if (cmd && /[%!"^&|<>()]/u.test(value)) {
    throw new TypeError("cmd copy command value is unsafe");
  }
  const lines = [];
  let remaining = value;
  do {
    const prefix = cmd
      ? `set \"${name}=${lines.length === 0 ? "" : `%${name}%`}`
      : powershell
        ? `${name}${lines.length === 0 ? " = " : " += "}`
        : `${name}=${lines.length === 0 ? "" : `\${${name}}`}`;
    let length = remaining.length;
    while (length > 0
      && `${prefix}${cmd ? remaining.slice(0, length) : singleQuoted(remaining.slice(0, length), powershell)}${cmd ? "\"" : ""}`.length > COPY_COMMAND_MAX_COLUMNS) {
      length -= 1;
    }
    if (length === 0 && remaining.length > 0) throw new TypeError("copy command value cannot be bounded");
    // NVA-B-COPYSAFE (backlog/items/2026-08-31-copy-safe-renderer-wrap-point-
    // is-path-length-sensitive.md): the greedy column-fit loop above chunks
    // purely by character count, so a filesystem path or script filename
    // embedded in the opaque value can land astride a wrap boundary --
    // whether that happens depended only on the value's total length modulo
    // the per-line budget, i.e. on checkout path length, not on anything a
    // human did wrong. Prefer to back the cut off to the nearest preceding
    // DELIMITER -- a space (the boundary between two space-separated command
    // tokens) or a path separator ("/" or "\\", the boundary between two
    // path segments) -- so a command token, and separately the FILENAME
    // segment of a longer path that itself does not fit on one line, both
    // stay contiguous, greppable strings wherever a delimiter-aligned break
    // makes that possible. This can only shrink the chunk (never grow it
    // past the already-verified bound) and strictly reduces `length`, so
    // termination is unaffected. Only a single path segment WIDER than one
    // whole line (no delimiter anywhere in the reachable prefix) falls back
    // to the prior mid-token split, unavoidably: reconstruction still stays
    // byte-exact via plain concatenation either way (copy-safe-command.test.mjs
    // pins both the common case and this fallback).
    const isDelimiter = (ch) => ch === " " || ch === "/" || ch === "\\";
    if (length < remaining.length && !isDelimiter(remaining[length - 1]) && !isDelimiter(remaining[length])) {
      let delimiterIndex = -1;
      for (let index = length - 1; index >= 0; index -= 1) {
        if (isDelimiter(remaining[index])) { delimiterIndex = index; break; }
      }
      if (delimiterIndex !== -1) length = delimiterIndex + 1;
    }
    const chunk = remaining.slice(0, length);
    lines.push(`${prefix}${cmd ? chunk : singleQuoted(chunk, powershell)}${cmd ? "\"" : ""}`);
    remaining = remaining.slice(length);
  } while (remaining.length > 0);
  return lines;
}
function restartCopyCommands(executable, argv) {
  const [launcher, rootFlag, root, barrierFlag, barrierSha256, activate] = argv;
  if (executable !== "node"
    || rootFlag !== "--root"
    || root !== "."
    || barrierFlag !== "--barrier-sha256"
    || activate !== "--activate"
    || !/^[a-f0-9]{64}$/u.test(barrierSha256)) {
    throw new TypeError("restart action cannot be rendered as a bounded command");
  }
  const posix = [
    ...boundedAssignmentLines("P", launcher),
    ...boundedAssignmentLines("R", root),
    ...boundedAssignmentLines("B", barrierSha256),
    'node "$P" --root "$R" --barrier-sha256 "$B" --activate',
  ];
  const powershell = [
    ...boundedAssignmentLines("$P", launcher, "powershell"),
    ...boundedAssignmentLines("$R", root, "powershell"),
    ...boundedAssignmentLines("$B", barrierSha256, "powershell"),
    "& node $P --root $R --barrier-sha256 $B --activate",
  ];
  const cmd = [
    ...boundedAssignmentLines("P", launcher, "cmd"),
    ...boundedAssignmentLines("R", root, "cmd"),
    ...boundedAssignmentLines("B", barrierSha256, "cmd"),
    'node "%P%" --root "%R%" --barrier-sha256 "%B%" --activate',
  ];
  for (const line of [...posix, ...powershell, ...cmd]) {
    if (line.length > COPY_COMMAND_MAX_COLUMNS) throw new TypeError("copy command line exceeds its bound");
  }
  return {
    maxColumns: COPY_COMMAND_MAX_COLUMNS,
    posix: posix.join("\n"),
    powershell: powershell.join("\n"),
    cmd: cmd.join("\r\n"),
  };
}

/**
 * Bounded, copy-safe rendering of an ALREADY-ASSEMBLED, arbitrary command
 * string -- distinct from restartCopyCommands(), which only ever renders one
 * fixed, validated argv shape. This treats the entire string as ONE opaque
 * bounded value (the same technique restartCopyCommands already uses for its
 * barrier-sha256/root values): it is chunked and quoted by
 * boundedAssignmentLines() without ever re-parsing or re-quoting the
 * command's own internal structure, which is what keeps this correct for a
 * command this function never validated the shape of.
 *
 * A per-shell rendering is `null`, never thrown, when that shell cannot
 * safely represent the value at all (e.g. cmd.exe's SET expands `%`, `!` and
 * other metacharacters, so boundedAssignmentLines() refuses a value
 * containing one; a value containing a line break is unrenderable for every
 * target). Every renderer failure is independent: one shell being
 * unrenderable never blocks the others.
 */
export function boundedOpaqueCopyCommand(command) {
  if (typeof command !== "string" || command.length === 0) {
    throw new TypeError("copy command value must be a non-empty string");
  }
  const bounded = (renderer, name, invocationLine, lineJoin) => {
    try {
      const lines = [...boundedAssignmentLines(name, command, renderer), invocationLine];
      if (!lines.every((line) => line.length <= COPY_COMMAND_MAX_COLUMNS)) return null;
      return lines.join(lineJoin);
    } catch {
      return null;
    }
  };
  return {
    maxColumns: COPY_COMMAND_MAX_COLUMNS,
    posix: bounded("posix", "CMD", 'eval "$CMD"', "\n"),
    powershell: bounded("powershell", "$CMD", "Invoke-Expression $CMD", "\n"),
    cmd: bounded("cmd", "CMD", "%CMD%", "\r\n"),
  };
}

function continuityRepairPlanAction(root, runner, intent) {
  return commandAction(
    lifecycleArgv([ONBOARDING_SCRIPT, "plan-repair", "--root", root], runner, intent),
    false,
    false,
    SCHEMA,
    ["continuity-damaged"],
  );
}

// Same `collect-input` shape as `collectAuthorIdentityAction()`: the operator-
// confirmed continuity repair (`onboarding-continuity.mjs`'s
// `operatorConfirmedContinuity()`) needs a claim this tool can never derive on
// its own -- which feature a mature project's absent `pipeline-state.json`
// belongs to, and where its approved PRD and neighbouring Spec live -- so a
// `status: "operator-authority-required"` repair plan surfaces this ask
// instead of the flat `nextAction: null` every other unrepairable continuity
// shape still returns. Field names mirror `operatorAuthority`'s own closed
// shape (`validateOperatorContinuityAuthority` in onboarding-continuity.mjs)
// exactly, and the CLI accepts them back as --id/--plan-path/--prd-path/
// --spec-path/--language.
function collectOperatorContinuityAuthorityAction() {
  return {
    kind: "collect-input",
    inputs: [
      { name: "featureId", encoding: "utf8", trim: true, minBytes: 1, maxBytes: 128, singleLine: true, rejectNul: true },
      { name: "planPath", encoding: "utf8", trim: true, minBytes: 1, maxBytes: 240, singleLine: true, rejectNul: true },
      { name: "prdPath", encoding: "utf8", trim: true, minBytes: 1, maxBytes: 240, singleLine: true, rejectNul: true },
      { name: "specPath", encoding: "utf8", trim: true, minBytes: 1, maxBytes: 240, singleLine: true, rejectNul: true },
      { name: "language", encoding: "utf8", trim: true, minBytes: 2, maxBytes: 2, singleLine: true, rejectNul: true },
    ],
    mutation: false,
    requiresConfirmation: false,
    guidance: "this project's pipeline-state.json is absent while its configured handover is real; ask the PO once which feature it belongs to, the approved PRD path (repeated as both --plan-path and --prd-path -- the plan IS the PRD), the neighbouring specification path, and the human-facing language (de or en); nothing here is inferred from repository content, and it is independently checked before it is ever adopted -- then rerun plan-repair/apply-repair with --id --plan-path --prd-path --spec-path --language set to those exact values",
    expected: { schema: SCHEMA, statuses: ["continuity-damaged"] },
  };
}

function collectGoalAction() {
  return {
    kind: "collect-input",
    input: {
      name: "goal",
      encoding: "utf8",
      trim: true,
      minBytes: 1,
      maxBytes: KICKOFF_GOAL_MAX_BYTES,
      singleLine: true,
      rejectNul: true,
    },
    mutation: false,
    requiresConfirmation: false,
    expected: {
      schema: SCHEMA,
      statuses: ["kickoff-required"],
    },
  };
}

// Wave 4 onboarding coordinator, step 6 (design SSa.4/SSa.5 point 1;
// NVA-W5-COORD-STEP6-1): the `intake-required` nextAction offered when no
// intake checkpoint exists yet, or one exists with no recorded consent.
// Same `collect-input` shape as `collectAuthorIdentityAction()` below,
// asking once for consent plus whichever of the git author/language/profile
// values are not already known -- `intake-consent-apply` itself is
// idempotent and only fills fields still null, so re-asking an already-
// answered field costs nothing.
const INTAKE_GIT_AUTHOR_NAME_PLACEHOLDER = "<PO_INTAKE_GIT_AUTHOR_NAME>";
const INTAKE_GIT_AUTHOR_EMAIL_PLACEHOLDER = "<PO_INTAKE_GIT_AUTHOR_EMAIL>";
const INTAKE_LANGUAGE_PLACEHOLDER = "<PO_INTAKE_LANGUAGE>";
const INTAKE_PROFILE_PLACEHOLDER = "<PO_INTAKE_PROFILE>";
const INTAKE_DESIGN_ANSWERS_PLACEHOLDER = "<PO_INTAKE_DESIGN_ANSWERS_JSON>";
const INTAKE_TEXT_FILE = "scratch/onboarding-intake.txt";

function intakeConsentAction(root, runner, checkpoint, missingAuthorIdentity) {
  const values = checkpoint.status === "present"
    ? checkpoint.value.values
    : { gitAuthor: null, language: null, profile: null };
  const needsGitAuthor = values.gitAuthor === null && missingAuthorIdentity.length > 0;
  const needsLanguage = values.language === null;
  const needsProfile = values.profile === null;
  const inputs = [
    ...(needsGitAuthor ? [
      { name: "gitAuthorName", encoding: "utf8", trim: true, minBytes: 1, maxBytes: AUTHOR_IDENTITY_FIELD_MAX_BYTES, singleLine: true, rejectNul: true },
      { name: "gitAuthorEmail", encoding: "utf8", trim: true, minBytes: 1, maxBytes: AUTHOR_IDENTITY_FIELD_MAX_BYTES, singleLine: true, rejectNul: true },
    ] : []),
    ...(needsLanguage ? [{ name: "language", encoding: "utf8", trim: true, minBytes: 2, maxBytes: 2, singleLine: true, rejectNul: true }] : []),
    ...(needsProfile ? [{ name: "profile", encoding: "utf8", trim: true, minBytes: 4, maxBytes: 7, singleLine: true, rejectNul: true }] : []),
    { name: "projectDescription", encoding: "utf8", trim: false, minBytes: 1, maxBytes: INTAKE_MATERIAL_TEXT_MAX_BYTES, singleLine: false, rejectNul: true },
  ];
  const argv = [ONBOARDING_SCRIPT, "intake-consent-apply", "--root", root, "--granted"];
  if (needsGitAuthor) argv.push("--git-author-name", INTAKE_GIT_AUTHOR_NAME_PLACEHOLDER, "--git-author-email", INTAKE_GIT_AUTHOR_EMAIL_PLACEHOLDER);
  if (needsLanguage) argv.push("--language", INTAKE_LANGUAGE_PLACEHOLDER);
  if (needsProfile) argv.push("--profile", INTAKE_PROFILE_PLACEHOLDER);
  argv.push("--text-file", INTAKE_TEXT_FILE, "--activate", "--runner", runner);
  return {
    kind: "collect-input",
    inputs,
    mutation: false,
    requiresConfirmation: false,
    guidance: `ask once for explicit consent, the still-unresolved typed values listed in inputs, and the first project description. Write the projectDescription bytes verbatim to ${INTAKE_TEXT_FILE} inside this repository (create scratch/ if absent); the returned applyAction deliberately uses only --text-file, never --text, so multiline text remains copy-safe and the two mutually exclusive forms can never collide. Replace only the typed placeholders present in applyAction.argv with the matching verbatim single-line answers, then execute that exact action. Git author fields are omitted when repository-local Git already resolves them; do not ask for them again or reconstruct intake-consent-apply yourself.`,
    applyAction: commandAction(argv, true, true, INTAKE_CONSENT_APPLY_SCHEMA, ["applied"]),
    expected: { schema: SCHEMA, statuses: ["intake-required"] },
  };
}

// Mirrors the private INTAKE_MAX_MATERIAL_BYTES bound enforced by
// applyOnboardingIntakeCapture() in onboarding-continuity.mjs (not exported
// there, so restated here rather than imported).
const INTAKE_MATERIAL_TEXT_MAX_BYTES = 1_000_000;

// Wave 4 onboarding coordinator, step 6: the `intake-required` nextAction
// offered once consent is recorded but no material input has been captured
// yet (checkpoint transactionState still "collecting"). Unlike every other
// collect-input action in this file, the collected text is genuinely
// multi-line prose (a PO message), so singleLine is false here -- no
// consumer in this file validates that flag; it is descriptive metadata for
// the caller collecting the value.
function intakeCaptureAction(root, runner) {
  return {
    kind: "collect-input",
    input: { name: "text", encoding: "utf8", trim: false, minBytes: 1, maxBytes: INTAKE_MATERIAL_TEXT_MAX_BYTES, singleLine: false, rejectNul: true },
    mutation: false,
    requiresConfirmation: false,
    guidance: `consent is already recorded; ask for the next project-material message, write its bytes verbatim to ${INTAKE_TEXT_FILE}, and execute the exact returned applyAction. It uses only --text-file, never the mutually exclusive --text form, so multiline content is copy-safe. Do not reconstruct intake-capture-apply.`,
    applyAction: commandAction(
      [ONBOARDING_SCRIPT, "intake-capture-apply", "--root", root, "--text-file", INTAKE_TEXT_FILE, "--activate", "--runner", runner],
      true, true, INTAKE_CAPTURE_APPLY_SCHEMA, ["applied"],
    ),
    expected: { schema: SCHEMA, statuses: ["intake-required"] },
  };
}

// Wave 4 onboarding coordinator, step 6: the `intake-design-questions-
// required` nextAction offered once at least one material-input chunk is
// captured but the one bundled design-question round has not been answered
// yet (checkpoint transactionState "design-questions-pending").
function intakeDesignQuestionsAction(root, runner) {
  return {
    kind: "collect-input",
    input: { name: "answersJson", encoding: "utf8", trim: true, minBytes: 2, maxBytes: 65_536, singleLine: false, rejectNul: true },
    mutation: false,
    requiresConfirmation: false,
    guidance: `ask the PO the ONE bundled round of design questions this project still needs answered. Replace exactly ${INTAKE_DESIGN_ANSWERS_PLACEHOLDER} in applyAction.argv with the JSON array of {question, answer} objects as one argv data element, then execute that exact returned action; never reconstruct the command or ask a second round.`,
    applyAction: commandAction(
      [ONBOARDING_SCRIPT, "intake-design-questions-apply", "--root", root, "--answers-json", INTAKE_DESIGN_ANSWERS_PLACEHOLDER, "--activate", "--runner", runner],
      true, true, INTAKE_DESIGN_QUESTIONS_APPLY_SCHEMA, ["applied"],
    ),
    expected: { schema: SCHEMA, statuses: ["intake-design-questions-required"] },
  };
}

// Wave 4 onboarding coordinator, step 6: the `intake-design-questions-
// required` nextAction offered once the design-question round is answered
// (checkpoint transactionState "ready-to-generate") -- a real, ready-to-run
// command like `portable-seed-required`'s own nextAction just below,
// because intake-generate-plan needs no PO-supplied value: it deterministically
// derives the staging bytes from the checkpoint's own already-durable content.
function intakeGeneratePlanAction(root, runner, intent) {
  return commandAction(
    lifecycleArgv([ONBOARDING_SCRIPT, "intake-generate-plan", "--root", root], runner, intent),
    false, false,
    INTAKE_GENERATE_PLAN_SCHEMA,
    ["intake-design-questions-required"],
  );
}

// Wave 4 onboarding coordinator, step 6: the `bootstrap-binding-required`
// nextAction offered once staging is generated (checkpoint transactionState
// "generated") -- same reasoning as intakeGeneratePlanAction() above:
// bootstrap-bind-plan needs no PO-supplied value either.
function bootstrapBindPlanAction(root, runner, intent) {
  return commandAction(
    lifecycleArgv([ONBOARDING_SCRIPT, "bootstrap-bind-plan", "--root", root], runner, intent),
    false, false,
    KICKOFF_PROMOTION_PLAN_SCHEMA,
    ["bootstrap-binding-required"],
  );
}

// NVA-D-ACKASK: sibling of bootstrapBindPlanAction() above, offered INSTEAD of it
// while the staging PRD does not yet carry the PO's own plan-acknowledgement marker
// (backlog: 2026-08-28-the-guided-init-ends-in-an-error-where-it-should-ask-the-po.md).
// bootstrap-bind-plan refuses this exact state with a raw
// KICKOFF-PROMOTION-PRD-ACKNOWLEDGEMENT-MARKER-MISSING exit and no interpretable
// next step -- correct as the fail-closed floor for a direct caller, wrong as the
// only thing a guided driver following nextAction ever sees, since the driver
// (onboarding-init.mjs) holds no domain knowledge and cannot turn "exit 2" into
// "ask a human". Deliberately carries no `input`/`inputs`, unlike every other
// collect-input action in this file: there is no apply command this library may
// name back, because the staging PRD is not yet promotion-bound, so the sanctioned
// rebind ceremony (po-authority-acknowledge-plan/apply) does not apply to it either
// -- po-gate-authority.mjs's own ACKNOWLEDGEMENT_REPAIR text draws exactly this line
// for the still-freely-editable, pre-bind case: the PO adds the single marker line
// to the PRD themselves, directly, once satisfied. This function -- and this file's
// diff as a whole -- must never grow a writer for that line.
function collectPrdAcknowledgementAction(prd, spec) {
  return {
    kind: "collect-input",
    mutation: false,
    requiresConfirmation: false,
    guidance: "binding requires the PO's own acknowledgement that the generated staging plan is content-sound and"
      + " consistent with its neighboring specification -- an agent must never supply this on the PO's behalf."
      + ` Ask the PO to read the staging PRD at ${prd.path} (sha256 ${prd.sha256}) and the staging specification at`
      + ` ${spec.path} (sha256 ${spec.sha256}); if and only if satisfied, the PO adds the single line`
      + " <!-- po-plan-acknowledged: content-sound-and-spec-consistent --> on its own line to the PRD themselves --"
      + " there is no command that writes this line on their behalf, and none should ever be offered."
      + " Once that line is present, review the read-only bootstrap-bind-plan action, then apply it.",
    expected: { schema: SCHEMA, statuses: ["bootstrap-binding-required"] },
  };
}

const RESTART_EXPECTED_STATUSES = [
  "portable-seed-required", "runtime-initialization-required", "kickoff-required", "host-repository-init-required", "ready", "partial", "invalid", "unsafe",
  "migration-required", "adoption-required", "repository-mount-read-only", "repository-control-path-invalid", "git-capability-unavailable",
  "project-root-read-only", "repository-mode-unsupported", "repository-observation-unavailable", "session-capability-unavailable",
  "worktree-capability-unavailable", "runtime-target-read-only", "runtime-readback-unavailable", "projection-drift", "continuity-damaged",
  "continuity-observation-unavailable", "app-server-execution-denied", "app-server-not-running", "app-server-unavailable",
];
// Reached whenever onboarding observes a restart-required runtime state,
// regardless of which runner is driving the session -- `runner` MUST be
// threaded from the caller's own already-known identity (never redetected
// here), so this stays consistent with the rest of the lifecycle result it
// is embedded in. There is today no Claude-native counterpart to
// `codex-onboarding-launch.mjs`/`codex-onboarding-runtime.mjs` (dead-end
// checked: `native-plugin-readback.mjs` is an install/update readback
// verifier, not a restart launcher); a `runner` other than `"codex"` gets a
// typed external-operator action instead of the Codex launcher, mirroring
// `externalRestartOnly()`'s "show the user, never a tool call" pattern in
// `guard-lifecycle-ready.mjs` (backlog:
// onboarding-restart-flow-is-codex-only-not-runner-aware).
function restartAction(_root, barrierSha256, runner) {
  if (runner !== "codex") return externalOperatorRestartAction(runner);
  const executable = "node";
  // Restart commands intentionally use the caller's current physical root.
  // The launcher rejects a mismatched --root before issuing a ticket, so this
  // cannot promote a scratch checkout into a new session merely by rendering
  // an absolute path into a handover command.
  const argv = [fileURLToPath(new URL("../scripts/codex-onboarding-launch.mjs", import.meta.url)), "--root", ".", "--barrier-sha256", barrierSha256, "--activate"];
  return {
    kind: "restart-process", requiresCurrentProcessExit: true,
    launch: {
      executable,
      argv,
      executionBoundary: "external-terminal",
      invocation: "user-copy-only",
      codexToolCallPermitted: false,
      copyCommand: restartCopyCommands(executable, argv),
    },
    mutation: true, requiresConfirmation: true, expectedStatuses: RESTART_EXPECTED_STATUSES,
  };
}

// Minimal, non-Codex restart action (field 1's Scope note, option b): a
// genuine Claude-native restart/resume launcher still needs to be built from
// scratch (no reusable starting point exists today) and is out of this
// defect's bounded scope. This never spawns a subprocess and is never a
// sanctioned tool-call target; it only carries guidance for the human/agent
// to resume or continue the session manually.
function externalOperatorRestartAction(runner) {
  return {
    kind: "external-operator",
    requiresCurrentProcessExit: false,
    guidance: `a restart is required, but the automated restart launcher exists only for the Codex runner today; ${typeof runner === "string" && runner.length > 0 ? `the "${runner}" runner has` : "this runner has"} no native launcher yet -- do not run any command for this step through a tool call; end this session and resume or start a fresh session at the same project root instead`,
    mutation: false, requiresConfirmation: true, expected: { schema: SCHEMA, statuses: RESTART_EXPECTED_STATUSES },
  };
}

function lifecycleResult({
  status,
  root,
  runner,
  intent,
  repository,
  runtime,
  continuity = emptyContinuity(),
  appServer = emptyAppServer(),
  nextAction = null,
  diagnostics = [],
}) {
  // Deliberately no `requireRunner` guard here: this is a shared, low-level
  // result-shape builder. Some callers legitimately pass `runner: null` as an
  // explicit "no claim" sentinel for a root that cannot be resolved at all
  // (see `repositoryFailureResult` / the symlink-rejection branch of
  // `v4Inspection` below) -- a different thing from a caller that never
  // received an identity to thread through. Every caller that COULD silently
  // assume "codex" instead of threading its own runner is guarded at its own
  // boundary (`v4Inspection`, `readyLifecycleResult`,
  // `afterRuntimeLifecycleResult`, `runtimeTargetReadOnlyResult`,
  // `pluginManagedAdmissionDriftResult`, `partialCleanupRecoveryResult`, and
  // the exported entry points below), so by the time `runner` reaches here it
  // is already either a validated identity or a deliberate `null`.
  return {
    schema: SCHEMA,
    status,
    root: root ?? null,
    runner,
    intent,
    repository,
    runtime,
    continuity,
    appServer,
    nextAction,
    diagnostics,
  };
}

// pipeline.ready-gate-keys-derived-from-producer: exported so a consumer's
// own accepted-key check (project-onboarding-ready-gate.mjs) can ask this
// module what shape its one shared v4 envelope builder actually returns,
// instead of hand-typing a duplicate list that silently drifts behind it --
// twice, confirmed live (backlog:
// pipeline.ready-gate-hand-maintained-shape-mirror). Calling the real
// builder above with harmless placeholder arguments and reading its own key
// set back is derivation, not restatement: any key added to or removed from
// `lifecycleResult`'s object literal above changes this automatically, with
// no second list to keep in sync.
export const PROJECT_ONBOARDING_BASE_RESULT_KEYS = Object.freeze(Object.keys(lifecycleResult({
  status: "shape-probe",
  root: null,
  runner: null,
  intent: "onboarding",
  repository: {},
  runtime: {},
})));

function validAppServerComponent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(["code", "required", "status"])) {
    return false;
  }
  // `not-requested` (this intent does not need it) and `not-applicable` (this
  // runner has no App-Server concept at all) are both code-free non-required
  // states; every required state keeps its exact existing status/code pairing.
  if (value.required === false) {
    return (value.status === "not-requested" || value.status === "not-applicable") && value.code === null;
  }
  if (value.required !== true || typeof value.code !== "string" || !/^CAS-[A-Z0-9-]+$/u.test(value.code)) return false;
  if (value.status === "running") return value.code === "CAS-READY";
  if (value.status === "execution-denied") return value.code === "CAS-EXECUTION-UNAVAILABLE";
  if (value.status === "not-running") return value.code === "CAS-DAEMON-UNREACHABLE";
  return value.status === "unavailable"
    && value.code !== "CAS-READY"
    && value.code !== "CAS-DAEMON-UNREACHABLE";
}

function notApplicableAppServer() { return { required: false, status: "not-applicable", code: null }; }

function observeReadyAppServer(intent, runner, fs) {
  // A runner with no App-Server concept is not-applicable for every intent: no
  // observation is attempted, nothing is claimed running, nothing blocks.
  if (RUNNERS_WITHOUT_APP_SERVER.has(runner)) return notApplicableAppServer();
  if (intent === "onboarding") return emptyAppServer();
  try {
    const observed = fs.observeOnboardingAppServer({ intent });
    return validAppServerComponent(observed)
      ? observed
      : { required: true, status: "unavailable", code: "CAS-UNKNOWN" };
  } catch {
    return { required: true, status: "unavailable", code: "CAS-UNKNOWN" };
  }
}

// backlog: 2026-08-08-the-guard-refuses-the-recovery-the-inspection-prescribes.md
// (C1). One shared table with three readers: the producer below
// (`readyLifecycleResult`), the guard's admission check
// (`isExactPoAuthorityRebindPlannerRecovery` in guard-lifecycle-ready.mjs), and
// the contract suite that asserts the two agree
// (hooks/guard-lifecycle-recovery-contract.test.mjs). A reason added here is
// therefore offered, admitted and covered at once, instead of depending on two
// hand-written duplicates staying in sync -- they did not, and the guard
// refused five of the six actions this table offers until the contract suite
// enumerated them. `offersPlannerRetry: false` marks the
// one reason where re-running the planner cannot help: `observePoAuthorityRebind`
// already spawned the planner as part of THIS SAME inspection and observed it
// reject (`planned.status !== 0`) -- offering to run the identical command again
// against the same on-disk preimage would prescribe a route already proven to
// refuse. Every other reason keeps its existing read-only retry action
// unchanged (AC-7).
export const PO_AUTHORITY_REBIND_UNAVAILABLE_DIAGNOSTICS = [
  { reason: "writer-unavailable", code: "po_authority_rebind_writer_unavailable", message: "the PO authority rebind writer could not be observed safely", repair: "restore the sanctioned writer before retrying; do not edit Pipeline State manually", offersPlannerRetry: true },
  { reason: "planner-execution-unavailable", code: "po_authority_rebind_planner_execution_unavailable", message: "the PO authority rebind planner could not be executed", repair: "repair the planner execution boundary and retry the read-only planner", offersPlannerRetry: true },
  { reason: "planner-rejected", code: "po_authority_rebind_planner_rejected", message: "the PO authority rebind planner already examined this authority preimage, in this same inspection, and rejected it", repair: "no automated rebind route exists for this preimage; retain both authority documents and repair the underlying PRD/Spec mismatch by hand; do not edit Pipeline State manually", offersPlannerRetry: false },
  { reason: "planner-protocol-violation", code: "po_authority_rebind_planner_protocol_invalid", message: "the PO authority rebind planner emitted an invalid protocol response", repair: "repair the planner response contract before retrying", offersPlannerRetry: true },
  { reason: "planner-malformed-output", code: "po_authority_rebind_planner_output_invalid", message: "the PO authority rebind planner did not emit a valid structured plan", repair: "repair the planner output contract before retrying", offersPlannerRetry: true },
  { reason: "planner-invalid-plan", code: "po_authority_rebind_planner_plan_invalid", message: "the PO authority rebind planner emitted a plan outside the closed rebind contract", repair: "repair the planner plan binding before retrying", offersPlannerRetry: true },
  // Fallback: every other `unavailable(...)` reason not named above
  // (persisted-authority-drift, persisted-authority-unavailable, plan-digest-stale)
  // falls through to this entry. `reason: null` marks it as the default.
  { reason: null, code: "po_authority_rebind_unavailable", message: "the PRD and specification authority differ but no closed rebind action could be validated", repair: "retain both authority documents and repair the typed PO rebind planner; do not edit Pipeline State manually", offersPlannerRetry: true },
];

/**
 * Propose (never gate) the design-to-implementation handover once the plan
 * lifecycle is genuinely `approved` -- backlog:
 * 2026-08-08-no-design-to-implementation-handover-exists.md, PO decision
 * 2026-08-17, Q2 "Option A": the operator stays in control, implementation
 * work must remain possible whether or not this proposal is acted on. This
 * only ever adds a `nextAction` to an otherwise-unchanged `status: "ready"`
 * result; it never changes that status, and the separate `guard-devplan.mjs`
 * lifecycle check (unaffected by this function) is what actually keeps
 * implementation writes refused until `set-phase --phase implementation`
 * genuinely runs.
 *
 * Reuses `persistedPoAuthority`'s exact safe-read (symlink/hardlink/before-
 * after identity checks) and its own `derivePlanLifecycle` projection, the
 * same one `pipeline-state.mjs` and `nextActionSection()` use, rather than
 * re-deriving lifecycle status from scratch. `lifecycleStatus === "approved"`
 * only ever occurs when `activeFeature.phase !== "implementation"` (i.e.
 * still `"design"`, the only other valid phase) AND a current, digest-bound
 * PO approval exists -- exactly the precondition this backlog item's own Q1
 * dependency (2026-08-07-a-promoted-feature-can-never-pass-the-plan-gate.md,
 * resolved 2026-08-11) made reachable.
 *
 * Deliberately calls `persistedPoAuthority` directly rather than through the
 * `fs.observePersistedPoAuthority` override `observePoAuthorityRebind` uses:
 * that hook's single-argument shape and its `{status:"absent"}` test stub
 * both belong to the PO-rebind concern specifically. Reusing it here would
 * silently couple two unrelated observations under one override.
 */
function designToImplementationHandoverAction(root, fs) {
  const authority = persistedPoAuthority(root, fs);
  if (authority.status !== "observed" || authority.lifecycleStatus !== "approved") return null;
  // NVA-GF-GREENFIELD-UNBORNHEAD-1: set-phase deliberately refuses a fresh
  // project's missing/UNCONFIGURED_VERIFY calibration unless the real command
  // is supplied in the SAME transaction. Publishing the historical bare
  // command in that state therefore advertised an action already known to
  // fail. Make the missing value a primary, driver-readable collect-input
  // boundary and bind its answer to one exact nested apply argv. No direct
  // calibration edit is prescribed or needed; pipeline-state.mjs owns both
  // writes atomically. A configured project retains the historical command
  // byte-for-byte below.
  const verify = checkVerifyContractConfigured(root);
  if (!verify.ok) return collectImplementationVerifyCommandAction(root);
  return commandAction(
    [PO_AUTHORITY_REBIND_WRITER, "set-phase", "--phase", "implementation"],
    true,
    true,
    SCHEMA,
    ["ready"],
  );
}

/**
 * Enters the existing public plan-lifecycle driver once onboarding itself is
 * ready but the persisted plan still needs submission/presentation/approval.
 * `persistedPoAuthority()` is deliberately reused here: its before/after
 * identity checks and `derivePlanLifecycle()` projection are the safe source
 * of truth already used by the approved handover directly above.  An absent
 * feature, an approved design, and implementation therefore remain outside
 * this action's closed two-status domain.
 */
function planLifecycleInspectAction(root, fs) {
  const authority = persistedPoAuthority(root, fs);
  if (authority.status !== "absent"
    || !new Set(["draft", "awaiting-approval"]).has(authority.lifecycleStatus)) return null;
  return commandAction(
    [PO_AUTHORITY_REBIND_WRITER, "inspect"],
    false,
    false,
    "pipeline.inspect.v1",
    ["draft", "awaiting-approval"],
  );
}

function readyLifecycleResult({ root, runner, intent, repository, runtime, continuity = emptyContinuity() }, fs) {
  requireRunner(runner, "readyLifecycleResult");
  // The fresh protected-mount transition is not a ready-state claim.  Its
  // confirmed host repository initializer must be plannable even when the
  // current workspace sandbox cannot reach the host App-Server control
  // socket.  App-Server health remains mandatory after host initialization,
  // before any bootstrap/session/dispatch result may become ready.
  if (runtime.status === "plugin-managed-unattested" && continuity.status === "valid") {
    return lifecycleResult({
      status: "host-repository-init-required",
      root,
      runner,
      intent,
      repository,
      runtime,
      continuity,
      appServer: emptyAppServer(),
      nextAction: commandAction(
        [HOST_REPOSITORY_INIT_SCRIPT, "plan", "--root", root],
        false,
        false,
        "pipeline.codex-host-repository-init-plan.v1",
        ["ready", "not-applicable"],
      ),
      diagnostics: [lifecycleDiagnostic(
        "$.runtime",
        "plugin_managed_runtime_unattested",
        "the reserved Codex runtime mount is not yet bound to a durable host initialization receipt",
        "review the exact host repository initialization plan",
      )],
    });
  }
  // Cleanup descriptors are meaningful only after local Git and valid
  // continuity authority both exist. A fresh/host-managed bootstrap must first
  // complete its typed repository initialization; probing the protected host
  // control mount here would turn that legitimate transition into a false
  // cleanup-observation failure.
  if (repository.mode === "local" && continuity.status === "valid") {
    const cleanupRecovery = partialCleanupRecoveryResult({
      root,
      runner,
      intent,
      repository,
      runtime,
      deps: fs,
      strict: true,
    });
    if (cleanupRecovery !== null) return cleanupRecovery;
    // Critic finding F1, 2026-08-19 (dispatch W4-CRITIC-2C): a null return
    // here can mean a recovery kind that MUTATED portable State (three of
    // the six typed kinds release a binding) just committed successfully --
    // the `continuity` this function was called with is the preimage, not
    // the postimage. Re-observe it fresh before anything below reads it,
    // exactly like afterRuntimeLifecycleResult's own first observation
    // (line ~2464) already does; a stale digest silently returned as
    // "ready" is worse than the extra read.
    try {
      continuity = (fs.classifyOnboardingContinuity ?? classifyOnboardingContinuity)({
        rootDir: root,
        repositoryCapability: repository.mode,
        spawn: fs.spawnSync,
      });
    } catch {
      continuity = emptyContinuity();
    }
  }
  // Runtime projection and App-Server health are distinct authorities. A
  // plugin-managed projection still requires the same single, read-only
  // App-Server observation as a project-local projection before bootstrap,
  // session, or dispatch may report ready.
  const appServer = observeReadyAppServer(intent, runner, fs);
  if (appServer.required === true && appServer.status !== "running") {
    const status = appServer.status === "execution-denied"
      ? "app-server-execution-denied"
      : appServer.status === "not-running"
        ? "app-server-not-running"
        : "app-server-unavailable";
    const diagnostic = status === "app-server-execution-denied"
      ? lifecycleDiagnostic(
        "$.appServer",
        "app_server_execution_denied",
        "the required read-only App-Server health observation was denied by the execution boundary",
        "observe App-Server health through the host-authorized local read-only boundary",
      )
      : status === "app-server-not-running"
        ? lifecycleDiagnostic(
          "$.appServer",
          "app_server_not_running",
          "the required local App-Server daemon is not running",
          "review and explicitly confirm the bounded recovery action",
        )
        : lifecycleDiagnostic(
          "$.appServer",
          "app_server_unavailable",
          "the required local App-Server health could not be established",
          "use only the returned bounded doctor or recovery action when one is available",
        );
    return lifecycleResult({
      status,
      root,
      runner,
      intent,
      repository,
      runtime,
      continuity,
      appServer,
      nextAction: appServerNextAction(appServer),
      diagnostics: [diagnostic],
    });
  }
  if (continuity.status === "absent-pristine") {
    // Wave 4 onboarding coordinator, step 6 (design SSa.4/SSe;
    // NVA-W5-COORD-STEP6-1). `applyOnboardingKickoff`'s own precondition is
    // exactly this continuity status (KICKOFF-NOT-PRISTINE,
    // onboarding-continuity.mjs), and it transitions continuity to "valid"
    // the moment it writes the provisional state -- so a repository already
    // mid-kickoff under the OLD model (kickoff-apply already ran,
    // kickoff-promote has not) structurally never reaches this branch at
    // all; it already carries `continuity.status === "valid"` and is routed
    // by the branches below, completely untouched by anything here. SSe's
    // "keep the old track alive and unchanged for mid-kickoff repos" is
    // therefore already true by construction -- this branch only ever sees
    // a repository the old kickoff machinery never started for, so it is
    // routed into the new intake-*/bootstrap-bind-* coordinator instead of
    // the old `kickoff-required` status, based on the private intake
    // checkpoint's own transactionState (private, checkpoint-internal;
    // never itself exposed as the public v4Inspection status -- SSa.4's
    // table).
    const checkpoint = (fs.readOnboardingIntakeCheckpoint ?? readOnboardingIntakeCheckpoint)({
      rootDir: root,
      repositoryCapability: repository.mode,
      spawn: fs.spawnSync,
    });
    const consentMissing = checkpoint.status === "absent" || checkpoint.value.consent === null;
    const transactionState = checkpoint.status === "present" ? checkpoint.value.transactionState : null;
    if (consentMissing) {
      const missingAuthorIdentity = unresolvedAuthorIdentityKeys(root, repository.mode !== "local", fs);
      return lifecycleResult({
        status: "intake-required",
        root, runner, intent, repository, runtime, continuity, appServer,
        nextAction: intakeConsentAction(root, runner, checkpoint, missingAuthorIdentity),
        diagnostics: [lifecycleDiagnostic(
          "$.continuity",
          "intake_required",
          checkpoint.status === "absent"
            ? "no private intake checkpoint exists yet"
            : "an intake checkpoint exists but consent has not been recorded",
          "collect consent (and any still-missing git author/language/profile values), then review the read-only intake-consent-apply action",
        )],
      });
    }
    if (transactionState === "collecting") {
      return lifecycleResult({
        status: "intake-required",
        root, runner, intent, repository, runtime, continuity, appServer,
        nextAction: intakeCaptureAction(root, runner),
        diagnostics: [lifecycleDiagnostic(
          "$.continuity",
          "intake_required",
          "consent is recorded but no material input has been captured yet",
          "capture the PO's next message of project material via the read-only intake-capture-apply action",
        )],
      });
    }
    if (transactionState === "design-questions-pending") {
      return lifecycleResult({
        status: "intake-design-questions-required",
        root, runner, intent, repository, runtime, continuity, appServer,
        nextAction: intakeDesignQuestionsAction(root, runner),
        diagnostics: [lifecycleDiagnostic(
          "$.continuity",
          "intake_design_questions_required",
          "material input is captured but the bundled design-question round has not been answered",
          "ask the PO the one bundled design-question round, then review the read-only intake-design-questions-apply action",
        )],
      });
    }
    if (transactionState === "ready-to-generate") {
      return lifecycleResult({
        status: "intake-design-questions-required",
        root, runner, intent, repository, runtime, continuity, appServer,
        nextAction: intakeGeneratePlanAction(root, runner, intent),
        diagnostics: [lifecycleDiagnostic(
          "$.continuity",
          "intake_design_questions_required",
          "the design-question round is answered; staging generation has not run yet",
          "review the read-only intake-generate-plan action, then apply it",
        )],
      });
    }
    if (transactionState === "generated") {
      // NVA-D-ACKASK: read-only observation of whether the PO's own
      // acknowledgement marker is present on the staging PRD yet -- decides
      // whether nextAction may safely name bootstrap-bind-plan (it would
      // refuse) or must ask the PO instead. Any failure here (a drifted
      // state resolveBootstrapBindInputs()/observeBootstrapBindAcknowledgement()
      // was never designed to see at this checkpoint stage) falls back to
      // today's unchanged behaviour rather than crashing a read-only inspect.
      let acknowledgement = null;
      try {
        acknowledgement = (fs.observeBootstrapBindAcknowledgement ?? observeBootstrapBindAcknowledgement)({
          rootDir: root, repositoryCapability: repository.mode, spawn: fs.spawnSync,
        });
      } catch {
        acknowledgement = null;
      }
      // NVA-V5-ACKEXEMPTASK: ask only when the marker is BOTH absent and actually
      // required. `exempt` is true exactly when the staging PRD's current bytes are
      // still what the generator would produce from the recorded intake consent --
      // the case NVA-R-STAGINGACK exempts from the marker at the bind. Asking there
      // anyway would stop the PO to certify a judgement nobody is being asked to
      // make, on bytes nobody authored. `exempt` is read defensively (`=== true`)
      // so an older observation shape without the field asks exactly as before.
      const needsAcknowledgement = acknowledgement !== null
        && acknowledgement.acknowledged === false
        && acknowledgement.exempt !== true;
      return lifecycleResult({
        status: "bootstrap-binding-required",
        root, runner, intent, repository, runtime, continuity, appServer,
        nextAction: needsAcknowledgement
          ? collectPrdAcknowledgementAction(acknowledgement.prd, acknowledgement.spec)
          : bootstrapBindPlanAction(root, runner, intent),
        diagnostics: [lifecycleDiagnostic(
          "$.continuity",
          "bootstrap_binding_required",
          needsAcknowledgement
            ? "staging PRD/spec/design-input are generated but the PO has not yet acknowledged the staging PRD"
            : "staging PRD/spec/design-input are generated but not yet bound as authority",
          needsAcknowledgement
            ? "ask the PO to review the staging PRD and spec named in the collect-input action's guidance, then have the PO add the acknowledgement marker themselves"
            : "review the read-only bootstrap-bind-plan action, then apply it",
        )],
      });
    }
    // transactionState "bound" (or any other value SSa.4's table does not
    // name) would mean the checkpoint has already moved past this
    // coordinator's own scope while continuity itself somehow still reads
    // absent-pristine -- a drifted state this design does not describe
    // (SSa.4's table ends at "generated"; "bound" is supposed to coincide
    // with continuity becoming "valid", which is a completely different
    // branch, never this one). Falling back to the pre-existing
    // `kickoff-required` behaviour keeps this an unreachable-in-practice
    // safety net rather than a guess at a new, undesigned status.
    return lifecycleResult({
      status: "kickoff-required",
      root,
      runner,
      intent,
      repository,
      runtime,
      continuity,
      appServer,
      nextAction: collectGoalAction(),
      diagnostics: [lifecycleDiagnostic(
        "$.continuity",
        "continuity_absent_pristine",
        "no sanctioned initial continuity exists",
        "collect and validate the project goal, then review the read-only kickoff plan",
      )],
    });
  }
  if (continuity.status === "damaged") {
    return lifecycleResult({
      status: "continuity-damaged",
      root,
      runner,
      intent,
      repository,
      runtime,
      continuity,
      appServer,
      nextAction: continuityRepairPlanAction(root, runner, intent),
      diagnostics: [lifecycleDiagnostic(
        "$.continuity",
        "continuity_damaged",
        "existing continuity artifacts are inconsistent or invalid",
        "review the bounded continuity repair plan; pristine kickoff is not permitted",
      )],
    });
  }
  if (continuity.status !== "valid") {
    return lifecycleResult({
      status: "continuity-observation-unavailable",
      root,
      runner,
      intent,
      repository,
      runtime,
      continuity: { ...continuity, status: "unavailable" },
      appServer,
      // The guidance no longer asserts read access as the cause. This branch is a
      // catch-all -- every classification that is neither `valid`, `damaged`, nor
      // `absent-pristine` lands here -- and naming ONE cause for all of them sent
      // the 2026-08-09 session looking for a read-permission problem that did not
      // exist while its actual state was a digest disagreement. Saying what is and
      // is not established costs nothing and stops the wrong hunt.
      diagnostics: [lifecycleDiagnostic(
        "$.continuity",
        "continuity_observation_unavailable",
        "continuity authority could not be established as valid",
        "no cause is established here: the observation may be unreadable, or readable and disagreeing with its recorded digests. "
        + "Inspect the state and the artifacts it binds read-only before changing either.",
      )],
    });
  }
  const poAuthorityRebind = observePoAuthorityRebind(root, fs, runner);
  if (poAuthorityRebind.status === "required") {
    return lifecycleResult({
      status: "partial",
      root,
      runner,
      intent,
      repository,
      runtime,
      continuity,
      appServer,
      nextAction: poAuthorityRebind.nextAction,
      diagnostics: [lifecycleDiagnostic(
        "$.authority.poGate",
        "po_authority_rebind_required",
        "the approved PRD marker and persisted PO authority bind an older neighboring specification",
        "present and apply only the returned digest-bound PO authority rebind action after explicit PO confirmation",
      )],
    });
  }
  if (poAuthorityRebind.status === "unavailable") {
    const poAuthorityDecision = observePoAuthorityDecision(root, fs, runner);
    if (poAuthorityDecision.status === "required") {
      return lifecycleResult({
        status: "partial",
        root,
        runner,
        intent,
        repository,
        runtime,
        continuity,
        appServer,
        nextAction: poAuthorityDecision.nextAction,
        diagnostics: [lifecycleDiagnostic(
          "$.authority.poGate",
          "po_authority_decision_required",
          "the current PRD and specification require an explicit neutral Human authority selection",
          "run only the returned read-only decision plan, present both candidates, then use the exact selected action after Human confirmation",
        )],
      });
    }
    if (poAuthorityDecision.status === "profile-repair-required") {
      return lifecycleResult({
        status: "partial",
        root,
        runner,
        intent,
        repository,
        runtime,
        continuity,
        appServer,
        nextAction: poAuthorityDecision.nextAction,
        diagnostics: [lifecycleDiagnostic(
          "$.authority.poGate.profile",
          "po_profile_repair_required",
          "the machine-local PO profile receipt is missing or stale",
          "apply only the returned digest-bound PO profile repair after explicit PO confirmation, then re-run inspection for the authority decision",
        )],
      });
    }
    const entry = PO_AUTHORITY_REBIND_UNAVAILABLE_DIAGNOSTICS.find((row) => row.reason === poAuthorityRebind.reason)
      ?? PO_AUTHORITY_REBIND_UNAVAILABLE_DIAGNOSTICS.find((row) => row.reason === null);
    return lifecycleResult({
      status: "partial",
      root,
      runner,
      intent,
      repository,
      runtime,
      continuity,
      appServer,
      nextAction: entry.offersPlannerRetry
        ? {
          kind: "command",
          executable: process.execPath,
          argv: [PO_AUTHORITY_REBIND_WRITER, "po-authority-rebind-plan"],
          mutation: false,
          requiresConfirmation: false,
          expected: {
            schema: "pipeline.po-authority-rebind-plan.v1",
          },
        }
        : null,
      diagnostics: [lifecycleDiagnostic(
        "$.authority.poGate",
        entry.code,
        entry.message,
        entry.repair,
      )],
    });
  }
  // Additive-only (spread AFTER the shared builder, never a change to
  // `lifecycleResult()`'s own shape): dozens of other statuses return through
  // that shared, low-level builder, and widening its signature would put a
  // new key on every one of them. `pushApprovalMode` and
  // `trustAnchorAvailability` only make sense once a repository is fully
  // "ready" -- that is the exact moment a session bootstrap inspects and
  // reports on -- so they are attached here, and only here.
  //
  // Built by iterating READY_ONLY_RESULT_FIELD_BUILDERS (declared just below
  // this function) rather than as a second literal object: that map is the
  // one place a ready-only field is ever added, and the exported
  // PROJECT_ONBOARDING_READY_ONLY_RESULT_KEYS is its Object.keys() -- the two
  // cannot drift apart because they are the same object (backlog:
  // pipeline.ready-gate-hand-maintained-shape-mirror).
  const readyOnlyFields = {};
  for (const [key, build] of Object.entries(READY_ONLY_RESULT_FIELD_BUILDERS)) {
    readyOnlyFields[key] = build(root, fs);
  }
  return {
    ...lifecycleResult({
      status: "ready",
      root,
      runner,
      intent,
      repository,
      runtime,
      continuity,
      appServer,
      nextAction: planLifecycleInspectAction(root, fs)
        ?? designToImplementationHandoverAction(root, fs),
      diagnostics: [],
    }),
    ...readyOnlyFields,
  };
}

// pipeline.ready-gate-keys-derived-from-producer: {name -> builder(root, fs)}
// for every field readyLifecycleResult() above attaches ONLY to a ready
// result. PROJECT_ONBOARDING_READY_ONLY_RESULT_KEYS is Object.keys() of this
// exact map, so a field added here (the only place this ever happens) is
// reflected there automatically -- never a second hand-typed list.
const READY_ONLY_RESULT_FIELD_BUILDERS = {
  pushApprovalMode: activePushApprovalMode,
  trustAnchorAvailability,
};

export const PROJECT_ONBOARDING_READY_ONLY_RESULT_KEYS = Object.freeze(
  Object.keys(READY_ONLY_RESULT_FIELD_BUILDERS),
);

function afterRuntimeLifecycleResult({ root, intent, repository, runtime, runner }, fs) {
  requireRunner(runner, "afterRuntimeLifecycleResult");
  let continuity;
  try {
    continuity = (fs.classifyOnboardingContinuity ?? classifyOnboardingContinuity)({
      rootDir: root,
      repositoryCapability: repository.mode,
      spawn: fs.spawnSync,
    });
  } catch {
    continuity = emptyContinuity();
  }
  return readyLifecycleResult({ root, runner, intent, repository, runtime, continuity }, fs);
}

function lifecyclePlanDigest(plan) {
  return sha256(JSON.stringify(stable({ root: plan.root, state: plan.state ?? plan.sourceKind, intentSha256: plan.intentSha256, sourceSha256: plan.sourceSha256, git: plan.git, targets: plan.targets })));
}

function sourceRecoveryCategory(inspected, sourceKind, migrationPlan) {
  if (["continuity-damaged", "recovery-required"].includes(inspected.status)
    || migrationPlan?.status === "recovery-required"
    || (inspected.diagnostics ?? []).some((entry) => ["pending_transaction", "evidence_unavailable"].includes(entry.code))) return "unavailable-evidence";
  if (sourceKind === "v3" && migrationPlan?.status === "ready"
    && migrationPlan.changes?.some((entry) => entry.kind === "runtime")) {
    return "stale-generated-projection";
  }
  if (inspected.status === "ready" && migrationPlan?.status === "noop") return "current-authority";
  if (inspected.status === "migration-required") return ["v0", "v1", "v2"].includes(sourceKind)
    ? "unsupported-source-transition" : "stale-generated-projection";
  if (inspected.status === "adoption-required") return "unsupported-source-transition";
  return "invalid-authority";
}

/** Read-only diagnosis of a V4 source transition. */
export function planProjectOnboardingSourceRecovery({ rootDir = process.cwd(), runner, deps: overrides = {} } = {}) {
  requireRunner(runner, "planProjectOnboardingSourceRecovery");
  const fs = deps(overrides);
  let root = null; let sourceSha256 = null; let sourceKind = null; let migrationPlan = null;
  try {
    root = safeRoot(rootDir, fs);
    const sourcePath = safePath(root, SOURCE, fs);
    if (fs.existsSync(sourcePath)) {
      const bytes = fs.readFileSync(sourcePath);
      sourceSha256 = sha256(bytes);
      const migrated = inspectRunnerProfileMigrationV3({ rootDir: root, deps: fs });
      if (migrated.status === "ready") {
        sourceKind = migrated.sourceKind;
        migrationPlan = planRunnerProfileMigrationV3({
          rootDir: root,
          deps: fs,
          initializeMissingRuntimeForSlimV3: true,
        });
      } else if (migrated.status === "recovery-required") {
        migrationPlan = migrated;
      }
    }
  } catch { /* diagnosis remains terminal and side-effect free */ }
  let inspected;
  try { inspected = inspectProjectOnboardingV3({ rootDir, deps: fs, intent: "onboarding", runner }); }
  catch (error) { inspected = { status: "unsafe", diagnostics: [diagnostic("$.root", "source_unavailable", error.message, "repair the physical root")] }; }
  const category = sourceRecoveryCategory(inspected, sourceKind, migrationPlan);
  const terminal = ["invalid-authority", "unsupported-source-transition", "unavailable-evidence"].includes(category);
  const action = terminal ? null : commandAction([ONBOARDING_SCRIPT, "inspect", "--root", root ?? resolve(rootDir), "--intent", "onboarding"], false, false, SCHEMA, [SCHEMA]);
  const plan = { schema: SOURCE_RECOVERY_SCHEMA, status: terminal ? "unrepairable" : "ready", root, category, sourceSha256, nextAction: action, diagnostics: inspected.diagnostics ?? [] };
  return plan;
}

function manifestParentIdentity(root, fs) {
  const parent = safePath(root, ".claude", fs);
  if (!fs.existsSync(parent)) throw new Error("manifest parent is absent");
  const info = fs.lstatSync(parent);
  return directoryIdentity(info);
}

function manifestPlanDigest(plan) {
  return sha256(JSON.stringify(stable({
    root: plan.root, source: plan.source, target: plan.target, generated: plan.generated,
    preservation: plan.preservation, parent: plan.parent,
  })));
}

/** Plan an absent-target-only manifest repair. This function never writes. */
export function planProjectOnboardingManifestRepair({ rootDir = process.cwd(), deps: overrides = {} } = {}) {
  const fs = deps(overrides); let root;
  try { root = safeRoot(rootDir, fs); } catch (error) {
    return { schema: MANIFEST_REPAIR_SCHEMA, status: "unrepairable", root: null, diagnostics: [diagnostic("$.root", "unsafe_root", error.message, "use the exact physical project root")] };
  }
  let sourcePath; let targetPath;
  try {
    sourcePath = safePath(root, SOURCE, fs); targetPath = safePath(root, ".claude/pipeline.yaml", fs);
  } catch (error) {
    return { schema: MANIFEST_REPAIR_SCHEMA, status: "unrepairable", root, diagnostics: [diagnostic("$.root", "unsafe_path", error.message, "repair symbolic links in the project path")] };
  }
  let sourceBytes;
  try { sourceBytes = fs.readFileSync(sourcePath, "utf8"); } catch (error) {
    return { schema: MANIFEST_REPAIR_SCHEMA, status: "unrepairable", root, diagnostics: [diagnostic("$.source", "source_missing", error.message, "repair through the source owner")] };
  }
  const migrated = inspectRunnerProfileMigrationV3({ rootDir: root, deps: fs });
  if (migrated.status !== "ready" || migrated.sourceKind !== "v3" || !sourceEnablesCodex(root, fs)) {
    return { schema: MANIFEST_REPAIR_SCHEMA, status: "unrepairable", root, diagnostics: [diagnostic("$.source", "source_invalid", "pipeline.user.yaml is not a current Codex V3 source", "repair the source through its owning workflow")] };
  }
  let targetInfo = null; try { targetInfo = fs.lstatSync(targetPath); } catch {}
  if (targetInfo) return { schema: MANIFEST_REPAIR_SCHEMA, status: "unrepairable", root, diagnostics: [diagnostic("$.target", "target_present", "the manifest target already exists and will not be replaced", "remove it through its owning workflow")] };
  let parent;
  try { parent = manifestParentIdentity(root, fs); } catch (error) { return { schema: MANIFEST_REPAIR_SCHEMA, status: "unrepairable", root, diagnostics: [diagnostic("$.target.parent", "parent_invalid", error.message, "repair the physical .claude directory")] }; }
  const canonical = renderCanonicalV3Manifest({ rootDir: root, deps: fs });
  if (canonical.status !== "ready") return { schema: MANIFEST_REPAIR_SCHEMA, status: "unrepairable", root, diagnostics: canonical.diagnostics ?? [] };
  const plan = {
    schema: MANIFEST_REPAIR_SCHEMA, status: "ready", root,
    source: { path: SOURCE, sha256: sha256(sourceBytes), byteLength: Buffer.byteLength(sourceBytes, "utf8") },
    target: { path: ".claude/pipeline.yaml", status: "absent", sha256: null, byteLength: 0 },
    generated: { sha256: canonical.sha256, byteLength: canonical.byteLength },
    preservation: "absent-target-only", parent, planSha256: null, nextAction: null,
    diagnostics: [],
  };
  plan.planSha256 = manifestPlanDigest(plan);
  plan.nextAction = commandAction([ONBOARDING_SCRIPT, "apply-manifest-repair", "--root", root, "--plan-sha256", plan.planSha256, "--activate"], true, true, MANIFEST_REPAIR_SCHEMA, ["ready"]);
  return plan;
}

export function applyProjectOnboardingManifestRepair({ rootDir = process.cwd(), runner, planSha256, activate = false, deps: overrides = {} } = {}) {
  requireRunner(runner, "applyProjectOnboardingManifestRepair");
  if (!activate) return { schema: MANIFEST_REPAIR_SCHEMA, status: "activation-required", diagnostics: [diagnostic("$.activate", "activation_required", "apply requires explicit activation", "review the plan and pass --activate")] };
  const fs = deps(overrides); const plan = planProjectOnboardingManifestRepair({ rootDir, deps: fs });
  if (plan.status !== "ready" || plan.planSha256 !== planSha256) return { schema: MANIFEST_REPAIR_SCHEMA, status: "invalid-plan", root: plan.root, diagnostics: [diagnostic("$.planSha256", "plan_digest_mismatch", "the supplied plan digest is not current", "run plan-manifest-repair again")] };
  const root = safeRoot(rootDir, fs); const target = safePath(root, ".claude/pipeline.yaml", fs); const parentPath = dirname(target);
  let temp = null; let tempIdentity = null; let tempSha256 = null;
  let published = null; let publishedIdentity = null;
  try {
    const sourceNow = fs.readFileSync(safePath(root, SOURCE, fs), "utf8");
    if (sha256(sourceNow) !== plan.source.sha256) throw new Error("source bytes changed since planning");
    if (fs.existsSync(target)) throw new Error("manifest target appeared before publication");
    const parentNow = manifestParentIdentity(root, fs);
    if (JSON.stringify(parentNow) !== JSON.stringify(plan.parent)) throw new Error("manifest target parent changed since planning");
    temp = join(parentPath, `.pipeline-manifest-repair-${randomBytes(12).toString("hex")}.tmp`);
    const canonical = renderCanonicalV3Manifest({ rootDir: root, deps: fs });
    if (canonical.status !== "ready" || canonical.sha256 !== plan.generated.sha256) throw new Error("generated manifest changed since planning");
    const generated = canonical.bytes;
    fs.writeFileSync(temp, generated, { encoding: "utf8", flag: "wx", mode: 0o600 });
    // NVA-B-ROUNDN F-B: bind the temporary the moment it exists. `generated` is
    // the exact byte string just written to it, so the rollback below can decide
    // its delete on content instead of on the path alone.
    tempIdentity = fileIdentity(fs.lstatSync(temp));
    if (!tempIdentity) throw new Error("manifest temporary identity is unavailable");
    tempSha256 = sha256(generated);
    const tempFd = fs.openSync(temp, "r");
    try { fs.fsyncSync(tempFd); } finally { fs.closeSync(tempFd); }
    fs.fsyncDirectory?.(parentPath);
    fs.linkSync(temp, target);
    // NVA-B-UNLINK-1: assigned the instant the target is live, not after the
    // temporary's own removal succeeds. A throwing `unlinkSync(temp)` below
    // must not leave the catch believing nothing was published while the
    // target is in fact live at `target` -- the defect this binds shut.
    published = target;
    fs.unlinkSync(temp);
    temp = null;
    publishedIdentity = fileIdentity(fs.lstatSync(target));
    if (!publishedIdentity) throw new Error("published manifest identity unavailable");
    if (sha256(fs.readFileSync(safePath(root, SOURCE, fs), "utf8")) !== plan.source.sha256) throw new Error("source bytes changed after publication");
    if (JSON.stringify(manifestParentIdentity(root, fs)) !== JSON.stringify(plan.parent)) throw new Error("manifest target parent changed after publication");
    if (!sameIdentity(publishedIdentity, target, fs)) throw new Error("manifest target identity changed after publication");
    const readback = loadManifest(root);
    if (readback.status !== "ok") throw new Error("post-apply manifest readback was not valid");
    const inspection = (fs.inspectProjectOnboardingV3 ?? inspectProjectOnboardingV3)({ rootDir: root, deps: fs, intent: "bootstrap", runner });
    if (inspection.status !== "ready") throw new Error("post-apply V4 readback was not ready");
    return { schema: MANIFEST_REPAIR_SCHEMA, status: "ready", root, planSha256, readback: { schema: SCHEMA, status: inspection.status, manifestSha256: sha256(generated) }, diagnostics: inspection.diagnostics ?? [] };
  } catch (error) {
    // NVA-B-ROUNDN F-B: this delete used to be decided by nothing at all -- not
    // content, not even identity -- while the line below it already bound its
    // own. Identity alone would not have been enough either: under inode reuse
    // it is exactly what matches the file that replaced our temporary (see
    // `ownsPublishedOutput()`'s docblock). The temporary's bytes are known
    // exactly, so ownership is decided on content; anything else is foreign and
    // is left in place.
    if (temp && tempIdentity && tempSha256) { try { if (ownsPublishedOutput(tempIdentity, tempSha256, temp, fs)) fs.unlinkSync(temp); } catch {} }
    if (published && publishedIdentity) { try { if (ownsPublishedOutput(publishedIdentity, plan.generated.sha256, published, fs)) fs.unlinkSync(published); } catch {} }
    // NVA-B-UNLINK-1: a throwing `unlinkSync(temp)` right above (immediately
    // after a successful `linkSync`) leaves `published` set but
    // `publishedIdentity` unavailable -- nlink is still 2 while the temporary
    // stays linked, so `ownsPublishedOutput()` above correctly refuses to
    // delete it (that refusal is the existing content-bound delete discipline,
    // untouched). What must not stay hardcoded is the status: it is read off
    // the target's own current bytes rather than assumed from merely having
    // reached this catch. Only when the target no longer holds this
    // transaction's own generated content is "rolled-back" true.
    let stillPublished = false;
    if (published) {
      try {
        stillPublished = fs.existsSync(published) && sha256(fs.readFileSync(published, "utf8")) === plan.generated.sha256;
      } catch { stillPublished = false; }
    }
    return {
      schema: MANIFEST_REPAIR_SCHEMA,
      status: stillPublished ? "rollback-failed" : "rolled-back",
      root,
      diagnostics: [diagnostic(
        "$.transaction",
        stillPublished ? "rollback_failed" : "apply_failed",
        stillPublished ? `${error.message} (the manifest target is still published; rollback could not confirm removal)` : error.message,
        stillPublished ? "inspect the published manifest target directly before any readiness claim" : "repair the target and replan",
      )],
    };
  }
}

function sourceEnablesCodex(root, fs) {
  try {
    const parsed = parseYaml(fs.readFileSync(safePath(root, SOURCE, fs), "utf8"));
    return Array.isArray(parsed?.runners?.enabled)
      && parsed.runners.enabled.includes("codex");
  } catch { return false; }
}

/**
 * General, runner-aware form of `sourceEnablesCodex`. Used only where the
 * caller's own invoking runner (not always "codex") controls admission; the
 * Codex-specific helper above stays untouched for its own existing call
 * sites. (`selectedRunnerIsCodex`, the second Codex-specific helper this
 * comment used to name, was deleted by NVA-MANIFESTRUNNER-1 -- its two call
 * sites now use this function instead.)
 */
function sourceEnablesRunner(root, fs, runner) {
  try {
    const parsed = parseYaml(fs.readFileSync(safePath(root, SOURCE, fs), "utf8"));
    return Array.isArray(parsed?.runners?.enabled)
      && parsed.runners.enabled.includes(runner);
  } catch { return false; }
}

function sourceRecoveryResult({
  status,
  root,
  category,
  sourceSha256 = null,
  nextAction = null,
  diagnostics = [],
}) {
  return {
    schema: SOURCE_RECOVERY_SCHEMA,
    status,
    root: root ?? null,
    category,
    sourceSha256,
    nextAction,
    diagnostics,
  };
}

// Repair-route metadata attached to every "unrepairable" diagnostic this
// planner returns (NVA-SOURCERECOVERY-1, corrected by NVA-RECOVERYDEADEND-1).
// `repairCommand` states explicitly, in typed form, that no automated repair
// route applies here and what the human must decide, so a session that
// reaches this diagnostic is never left to improvise a remedy the way the
// originating incident documents happened once already (a session that
// fabricated an unrelated "missing identity block" diagnosis and pointed at
// a pre-v3 sibling file). It also never names `plan-source-recovery` itself
// as an available next command: this planner is invoked from exactly one
// place, the `plan-source-recovery` subcommand
// (plugins/pipeline-core/scripts/project-onboarding-v3.mjs), so a diagnostic
// that named it as its own repair would be pointing at its own producer --
// the exact dead-end NVA-RECOVERYDEADEND-1 removed. The original
// `message`/`guidance` text on each diagnostic is never replaced by this --
// only paired with it.
const NO_AUTOMATED_REPAIR_ROUTE_REASON = "no_automated_repair_route";

function noAutomatedRepairRoute(guidance) {
  return { available: false, reason: NO_AUTOMATED_REPAIR_ROUTE_REASON, guidance };
}

/**
 * Diagnose only the source-owning boundary. This read-only planner must end
 * either in one exact sanctioned workflow or an explicit terminal
 * disposition; it never edits or guesses source authority.
 */
export function planProjectOnboardingSourceRecoveryV4({
  rootDir = process.cwd(),
  deps: overrides = {},
  // Echoed, never inferred (ADR-0051/ADR-0057 R1): a recovery result that does not
  // say which runner observed it cannot be consumed as identity-bound evidence, and
  // its own emitted actions would silently fall back to the literal default.
  runner = null,
  intent = null,
} = {}) {
  const fs = deps(overrides);
  let root;
  try {
    root = safeRoot(rootDir, fs);
  } catch {
    return sourceRecoveryResult({
      status: "unrepairable",
      root: null,
      category: "unavailable-evidence",
      diagnostics: [{
        ...lifecycleDiagnostic(
          "$.root",
          "source_evidence_unavailable",
          "the source root cannot be observed safely",
          "restore read access to the canonical physical project root",
        ),
        repairCommand: noAutomatedRepairRoute(
          "no automated repair route applies: this planner cannot resolve the project root at all, so it cannot even re-triage; a human must restore read access to the canonical physical project root before any command here can run",
        ),
      }],
    });
  }
  const inspected = inspectRunnerProfileMigrationV3({ rootDir: root, deps: fs });
  if (inspected.status === "recovery-required") {
    return sourceRecoveryResult({
      status: "recoverable",
      root,
      category: "unavailable-evidence",
      nextAction: commandAction(
        [MIGRATION_SCRIPT, "apply", "--root", root, "--activate"],
        true,
        true,
        "pipeline.runner-profile-migration-plan.v3",
        ["ready", "noop", "applied"],
      ),
      diagnostics: [lifecycleDiagnostic(
        "$.source",
        "source_transaction_recovery_required",
        "a pending V3 transaction prevents current source evidence",
        "deliver the migration recovery preview and explicitly activate the existing bounded recovery workflow",
      )],
    });
  }
  if (inspected.status !== "ready") {
    return sourceRecoveryResult({
      status: "unrepairable",
      root,
      category: "invalid-authority",
      diagnostics: [{
        ...lifecycleDiagnostic(
          "$.source",
          "source_authority_unrepairable",
          "the source is not one recognized authority that Public Core can reconstruct safely",
          "restore or correct pipeline.user.yaml through its external source-owning workflow",
        ),
        repairCommand: noAutomatedRepairRoute(
          "no automated repair route applies: this diagnostic is produced by the same read-only re-triage that would otherwise be offered as its own repair command, so naming it again would only send the reader in a circle; correct pipeline.user.yaml directly, using the validation diagnostics listed alongside this one for the specific reason it failed, through its external source-owning workflow",
        ),
        // NVA-RECOVERYDEADEND-1: the underlying validation diagnostics/errors
        // already present on `inspected` (from `inspectRunnerProfileMigrationV3`,
        // status "invalid-root" or "invalid-source") -- the actual reason the
        // source was not recognized, so a reader is not left to guess it.
        underlyingDiagnostics: inspected.diagnostics,
      }],
    });
  }
  if (inspected.sourceKind === "v3-refresh") {
    return sourceRecoveryResult({
      status: "recoverable",
      root,
      category: "stale-generated-projection",
      sourceSha256: inspected.sourceSha256,
      nextAction: commandAction(
        [MIGRATION_SCRIPT, "plan", "--root", root],
        false,
        false,
        "pipeline.runner-profile-migration-plan.v3",
        ["ready", "noop"],
      ),
      diagnostics: [lifecycleDiagnostic(
        "$.source",
        "source_projection_refresh_available",
        "the source is a recognized older V3 generated registry projection",
        "review the closed migration plan before explicit activation",
      )],
    });
  }
  if (["v0", "v1", "v2"].includes(inspected.sourceKind)) {
    return sourceRecoveryResult({
      status: "recoverable",
      root,
      category: "unsupported-source-transition",
      sourceSha256: inspected.sourceSha256,
      nextAction: commandAction(
        [MIGRATION_SCRIPT, "inspect", "--root", root],
        false,
        false,
        "pipeline.runner-profile-migration-inspect.v3",
        ["ready"],
      ),
      diagnostics: [lifecycleDiagnostic(
        "$.source",
        "legacy_source_transition_required",
        "the source is a recognized legacy authority",
        "continue only through the explicit V3 migration workflow",
      )],
    });
  }
  // Admission is bound to the invoking session's own runner (ADR-0051), not
  // always Codex: a V3 source that enables only Claude is a valid authority
  // for a Claude Code session. `selectedRunnerIsCodex` is superseded here.
  if (!sourceEnablesRunner(root, fs, runner)) {
    return sourceRecoveryResult({
      status: "unrepairable",
      root,
      category: "unsupported-source-transition",
      sourceSha256: inspected.sourceSha256,
      diagnostics: [{
        ...lifecycleDiagnostic(
          "$.source.runners.enabled",
          "source_runner_transition_unsupported",
          "this V3 source does not enable the invoking session's own runner",
          "enable this runner in the source's authority, or switch to a runner it already enables; this recovery planner will not rewrite it",
        ),
        repairCommand: noAutomatedRepairRoute(
          "no automated repair route applies: enabling a runner in the source's authority is a decision only a human makes -- this planner will not rewrite it; once the source enables the invoking runner, rerun plan-source-recovery to re-triage",
        ),
      }],
    });
  }
  return sourceRecoveryResult({
    status: "unrepairable",
    root,
    category: "current-authority",
    sourceSha256: inspected.sourceSha256,
    diagnostics: [{
      ...lifecycleDiagnostic(
        "$.source",
        "source_is_current",
        "the V3 source is current and is not the controlling recovery failure",
        "rerun the V4 lifecycle inspection and follow its controlling action",
      ),
      repairCommand: noAutomatedRepairRoute(
        "no automated repair route applies here: the source itself is not broken, so no source-recovery command is the fix; rerun the V4 lifecycle inspection (plan-source-recovery's own caller) and follow whatever controlling action it names instead",
      ),
    }],
  });
}

function manifestRepairBinding(plan) {
  return {
    schema: plan.schema,
    root: plan.root,
    source: plan.source,
    target: plan.target,
  };
}

function manifestRepairResult({
  status,
  root,
  source = null,
  target = null,
  planSha256 = null,
  applyAction = null,
  diagnostics = [],
}) {
  return {
    schema: MANIFEST_REPAIR_PLAN_SCHEMA,
    status,
    root: root ?? null,
    source,
    target,
    planSha256,
    applyAction,
    diagnostics,
  };
}

function currentRuntimeBaselines(root, intent, fs) {
  const baselines = freshBaselines(intent, { fs });
  for (const relative of runtimePaths()) {
    const target = safePath(root, relative, fs);
    if (!fs.existsSync(target)) continue;
    const bytes = readBoundPhysicalFile(target, fs);
    baselines[relative] = {
      status: "present",
      bytes: decodeUtf8Strict(bytes, `runtime target ${relative}`),
    };
  }
  return baselines;
}

/**
 * Plan one generated-manifest repair. Only an absent target is reconstructable
 * by this writer. Every existing target returns a terminal disposition and
 * remains under its owning workflow.
 */
export function planProjectOnboardingManifestRepairV4({
  rootDir = process.cwd(),
  deps: overrides = {},
  // Echoed, never inferred (ADR-0051/ADR-0057 R1). Named sessionIntent because this
  // function already binds `intent` to the PARSED pipeline.user.yaml; the two are
  // different concepts and must not share a name.
  runner = null,
  sessionIntent = null,
} = {}) {
  const fs = deps(overrides);
  let root;
  try {
    root = safeRoot(rootDir, fs);
  } catch {
    return manifestRepairResult({
      status: "unrepairable",
      root: null,
      diagnostics: [lifecycleDiagnostic(
        "$.root",
        "manifest_repair_root_unavailable",
        "the project root cannot be observed safely",
        "restore the canonical physical root before retrying",
      )],
    });
  }
  const inspection = inspectRunnerProfileMigrationV3({ rootDir: root, deps: fs });
  // Admission is bound to the invoking session's own runner (ADR-0051), not
  // always Codex: a V3 source that enables only Claude is a valid authority
  // for a Claude Code session. `selectedRunnerIsCodex` is superseded here.
  if (inspection.status !== "ready" || inspection.sourceKind !== "v3" || !sourceEnablesRunner(root, fs, runner)) {
    return manifestRepairResult({
      status: "unrepairable",
      root,
      diagnostics: [lifecycleDiagnostic(
        "$.source",
        "manifest_repair_source_not_current",
        "manifest repair requires one current V3 source that enables the invoking session's own runner",
        "complete the source-owning recovery workflow first",
      )],
    });
  }
  // The portable seed establishes `project/pipeline.yaml` as the sole
  // authority.  A missing runtime projection may be reconstructed below, but
  // this writer must never treat that as permission to mask or replace a
  // malformed canonical project manifest.
  const canonicalManifest = loadManifest(root);
  if (canonicalManifest.status !== "ok") {
    // A schema-less-but-otherwise-valid canonical manifest (backlog:
    // a-schema-less-project-pipeline-yaml-has-no-known-repair-path) is a normalizing repair,
    // not an owner-repair dead end -- loadManifest() surfaces that via `.repair`, and this
    // diagnostic must say so, never fall back to the generic "absent or invalid" code that
    // gives an operator no actionable next step for this specific, safely-detectable class.
    const manifestDiagnostic = canonicalManifest.repair?.available
      ? lifecycleDiagnostic(
        "$.authority.manifest",
        "canonical_manifest_schema_missing_repairable",
        "the canonical project manifest is missing the required top-level 'schema: pipeline.manifest.v0' field, but every other field validates",
        "normalize project/pipeline.yaml by adding 'schema: pipeline.manifest.v0' as a top-level key (loadManifest(..., { selfHeal: true }) confirms this is sufficient); apply the normalization through project/pipeline.yaml's owning authority workflow, then repair the runtime projection again",
      )
      : lifecycleDiagnostic(
        "$.authority.manifest",
        "canonical_manifest_requires_owner_repair",
        "the canonical project manifest is absent or invalid",
        "repair project/pipeline.yaml through its owning authority workflow before repairing a runtime projection",
      );
    return manifestRepairResult({
      status: "unrepairable",
      root,
      source: { path: SOURCE, sha256: inspection.sourceSha256 },
      diagnostics: [manifestDiagnostic],
    });
  }
  let intent;
  let projection;
  let sourceBytes;
  try {
    const sourcePath = safePath(root, SOURCE, fs);
    sourceBytes = readBoundPhysicalFile(sourcePath, fs);
    if (sha256(sourceBytes) !== inspection.sourceSha256) throw new Error("source changed after migration inspection");
    intent = parseYaml(decodeUtf8Strict(sourceBytes, SOURCE));
    const validation = validatePipelineUserV3(intent, { source: SOURCE });
    if (!validation.ok) throw new Error("source validation changed during manifest planning");
    projection = planRuntimeProjectionV3(intent, {
      source: SOURCE,
      baselines: currentRuntimeBaselines(root, intent, fs),
    });
    const sourceAfter = readBoundPhysicalFile(sourcePath, fs);
    if (sourceAfter.compare(sourceBytes) !== 0 || sha256(sourceAfter) !== inspection.sourceSha256) {
      throw new Error("source changed during manifest planning");
    }
  } catch {
    return manifestRepairResult({
      status: "unrepairable",
      root,
      source: { path: SOURCE, sha256: inspection.sourceSha256 },
      diagnostics: [lifecycleDiagnostic(
        "$.manifest",
        "manifest_unowned_bytes_unpreservable",
        "the existing manifest bytes cannot be projected while preserving unowned content",
        "repair the YAML syntax or restore the generated file from a trusted source, then plan again",
      )],
    });
  }
  if (projection.status !== "ready") {
    return manifestRepairResult({
      status: "unrepairable",
      root,
      source: { path: SOURCE, sha256: inspection.sourceSha256 },
      diagnostics: [lifecycleDiagnostic(
        "$.manifest",
        "manifest_unowned_bytes_unpreservable",
        "the manifest projection is not safely reconstructable",
        "repair the invalid unowned content through its owning workflow",
      )],
    });
  }
  const projected = projection.targets.find((entry) => entry.path === ".claude/pipeline.yaml");
  if (!projected || projected.after?.status !== "present" || typeof projected.after.bytes !== "string") {
    return manifestRepairResult({
      status: "unrepairable",
      root,
      source: { path: SOURCE, sha256: inspection.sourceSha256 },
      diagnostics: [lifecycleDiagnostic(
        "$.manifest",
        "manifest_projection_unavailable",
        "the V3 renderer produced no complete manifest target",
        "repair the runtime ownership manifest before retrying",
      )],
    });
  }
  let projectedManifest;
  try {
    projectedManifest = validateManifest(parseYaml(projected.after.bytes), { rootDir: root });
  } catch {
    projectedManifest = { status: "invalid" };
  }
  if (projectedManifest.status !== "ok") {
    return manifestRepairResult({
      status: "unrepairable",
      root,
      source: { path: SOURCE, sha256: inspection.sourceSha256 },
      diagnostics: [lifecycleDiagnostic(
        "$.manifest",
        "manifest_postimage_invalid",
        "the byte-preserving projection does not produce a valid manifest",
        "restore the unowned manifest structure through its owning workflow",
      )],
    });
  }
  const targetPath = safePath(root, ".claude/pipeline.yaml", fs);
  const beforeBytes = readBoundPhysicalFile(targetPath, fs, { optional: true });
  if (beforeBytes !== null) {
    return manifestRepairResult({
      status: "unrepairable",
      root,
      source: { path: SOURCE, sha256: inspection.sourceSha256 },
      diagnostics: [lifecycleDiagnostic(
        "$.manifest",
        "manifest_existing_target_requires_owner_repair",
        "an existing manifest cannot be replaced with an atomic no-replace publication",
        "repair or remove the generated manifest through its owning workflow, then create a new digest-bound plan",
      )],
    });
  }
  const afterBytes = Buffer.from(projected.after.bytes, "utf8");
  const binding = {
    schema: MANIFEST_REPAIR_PLAN_SCHEMA,
    root,
    source: { path: SOURCE, sha256: inspection.sourceSha256 },
    target: {
      path: ".claude/pipeline.yaml",
      before: describe(beforeBytes),
      after: describe(afterBytes),
      preservation: "absent-target-only",
    },
  };
  const planSha256 = sha256(JSON.stringify(stable(binding)));
  const plan = manifestRepairResult({
    ...binding,
    status: "ready",
    planSha256,
    applyAction: commandAction(
      [ONBOARDING_SCRIPT, "apply-manifest-repair", "--root", root, "--plan-sha256", planSha256, "--activate"],
      true,
      true,
      SCHEMA,
      RESTART_EXPECTED_STATUSES,
    ),
  });
  AUTHENTICATED_MANIFEST_REPAIRS.set(plan, {
    signature: JSON.stringify(plan),
    afterBytes,
  });
  return plan;
}

export function applyProjectOnboardingManifestRepairV4({
  rootDir = process.cwd(),
  runner,
  planSha256,
  activate = false,
  deps: overrides = {},
} = {}) {
  requireRunner(runner, "applyProjectOnboardingManifestRepairV4");
  const fs = deps(overrides);
  if (activate !== true || !/^[a-f0-9]{64}$/u.test(planSha256 ?? "")) {
    return v4Inspection(rootDir, fs, "onboarding", runner);
  }
  const plan = planProjectOnboardingManifestRepairV4({ rootDir, deps: fs, runner });
  const authenticated = AUTHENTICATED_MANIFEST_REPAIRS.get(plan);
  if (plan.status !== "ready"
    || plan.planSha256 !== planSha256
    || sha256(JSON.stringify(stable(manifestRepairBinding(plan)))) !== planSha256
    || !authenticated
    || authenticated.signature !== JSON.stringify(plan)) {
    return v4Inspection(rootDir, fs, "onboarding", runner);
  }
  let source;
  let parent;
  let temporary;
  let boundTarget;
  let fd;
  let temporaryIdentity = null;
  let publicationIdentity = null;
  let committed = false;
  let postCommitFailure = null;
  try {
    const target = safePath(plan.root, plan.target.path, fs);
    source = safePath(plan.root, plan.source.path, fs);
    parent = openBoundDirectory(dirname(target), fs);
    const temporaryName = `.pipeline-manifest-repair-${plan.planSha256.slice(0, 24)}-${randomBytes(8).toString("hex")}.tmp`;
    temporary = boundDirectoryEntry(parent, temporaryName, fs);
    boundTarget = boundDirectoryEntry(parent, basename(target), fs);
    fd = fs.openSync(
      temporary,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    temporaryIdentity = fileIdentity(fs.fstatSync(fd));
    if (!temporaryIdentity) throw new Error("manifest temporary identity is unavailable");
    fs.writeFileSync(fd, authenticated.afterBytes);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    if (!sameIdentity(temporaryIdentity, temporary, fs)
      || !sameDirectoryIdentity(parent.identity, parent.path, fs)) {
      throw new Error("manifest publication topology changed");
    }
    const currentSource = readBoundPhysicalFile(source, fs);
    if (sha256(currentSource) !== plan.source.sha256) throw new Error("source preimage changed after planning");
    fs.linkSync(temporary, boundTarget);
    committed = true;
    publicationIdentity = temporaryIdentity;
    if (!sameFileObject(temporaryIdentity, temporary, fs)
      || !sameFileObject(temporaryIdentity, boundTarget, fs)) {
      postCommitFailure = {
        code: "manifest_repair_target_changed_after_commit",
        message: "the atomically published manifest changed identity before readback",
        repair: "stop and restore the generated manifest through its owning workflow before any readiness claim",
      };
      throw new Error("manifest target changed during publication");
    }
    if (!sameDirectoryIdentity(parent.identity, parent.path, fs)) {
      postCommitFailure = {
        code: "manifest_repair_parent_changed_after_commit",
        message: "the pinned manifest parent changed after atomic publication",
        repair: "stop and restore the canonical physical .claude directory before any readiness claim",
      };
      throw new Error("manifest parent changed during publication");
    }
    const sourceAfter = readBoundPhysicalFile(source, fs);
    if (sha256(sourceAfter) !== plan.source.sha256) {
      postCommitFailure = {
        code: "manifest_repair_source_changed_after_commit",
        message: "the V3 source changed during atomic manifest publication",
        repair: "stop and create a new source-bound repair plan before any readiness claim",
      };
      throw new Error("source changed during manifest publication");
    }
    if (fs.fsyncDirectory) fs.fsyncDirectory(parent.path);
    else syncBoundDirectory(parent, fs);
    const durableSource = readBoundPhysicalFile(source, fs);
    if (sha256(durableSource) !== plan.source.sha256) {
      postCommitFailure = {
        code: "manifest_repair_source_changed_after_commit",
        message: "the V3 source changed during manifest durability confirmation",
        repair: "stop and create a new source-bound repair plan before any readiness claim",
      };
      throw new Error("source changed during manifest durability confirmation");
    }
    if (!sameDirectoryIdentity(parent.identity, parent.path, fs)) {
      postCommitFailure = {
        code: "manifest_repair_parent_changed_after_commit",
        message: "the pinned manifest parent changed during durability confirmation",
        repair: "stop and restore the canonical physical .claude directory before any readiness claim",
      };
      throw new Error("manifest parent changed during durability confirmation");
    }
    if (!sameFileObject(publicationIdentity, boundTarget, fs)) {
      postCommitFailure = {
        code: "manifest_repair_target_changed_after_commit",
        message: "the published manifest changed identity during durability confirmation",
        repair: "stop and restore the generated manifest through its owning workflow before any readiness claim",
      };
      throw new Error("manifest target changed during durability confirmation");
    }
    fs.unlinkSync(temporary);
    temporaryIdentity = null;
    if (fs.fsyncDirectory) fs.fsyncDirectory(parent.path);
    else syncBoundDirectory(parent, fs);
    const finalSource = readBoundPhysicalFile(source, fs);
    if (sha256(finalSource) !== plan.source.sha256) {
      postCommitFailure = {
        code: "manifest_repair_source_changed_after_commit",
        message: "the V3 source changed before final manifest readback",
        repair: "stop and create a new source-bound repair plan before any readiness claim",
      };
      throw new Error("source changed before final manifest readback");
    }
    if (!sameDirectoryIdentity(parent.identity, parent.path, fs)) {
      postCommitFailure = {
        code: "manifest_repair_parent_changed_after_commit",
        message: "the pinned manifest parent changed before final readback",
        repair: "stop and restore the canonical physical .claude directory before any readiness claim",
      };
      throw new Error("manifest parent changed before final readback");
    }
    if (!sameFileObject(publicationIdentity, boundTarget, fs)) {
      postCommitFailure = {
        code: "manifest_repair_target_changed_after_commit",
        message: "the published manifest changed identity before final readback",
        repair: "stop and restore the generated manifest through its owning workflow before any readiness claim",
      };
      throw new Error("manifest target changed before final readback");
    }
  } catch {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch {}
    }
    try {
      // NVA-B-ROUNDL-F4: `sameIdentity` alone cannot authorize this delete --
      // under inode reuse it is precisely what matches foreign content that
      // replaced our temporary. The temporary's bytes are known exactly
      // (`authenticated.afterBytes`, the same bytes written to it above), so
      // ownership is decided on content; anything else is left in place.
      if (temporaryIdentity && temporary
        && ownsPublishedOutput(temporaryIdentity, sha256(authenticated.afterBytes), temporary, fs)) {
        fs.unlinkSync(temporary);
      }
    } catch {}
    if (committed) {
      let quarantined = true;
      if (postCommitFailure) {
        quarantined = quarantineManifestPublication(parent, boundTarget, publicationIdentity, plan.planSha256, fs);
      }
      const observed = v4Inspection(rootDir, fs, "onboarding", runner);
      const failure = postCommitFailure && quarantined ? postCommitFailure : postCommitFailure ? {
        code: "manifest_repair_rollback_incomplete",
        message: "publication drift occurred and the exact manifest postimage could not be quarantined",
        repair: "stop and inspect the physical manifest target before any readiness claim",
      } : {
        code: "manifest_repair_durability_unavailable",
        message: "the manifest postimage was published but directory durability could not be confirmed",
        repair: "stop and re-observe the physical project before any readiness claim",
      };
      return lifecycleResult({
        status: "partial",
        root: observed.root,
        runner: observed.runner,
        intent: observed.intent,
        repository: observed.repository,
        runtime: observed.runtime,
        continuity: observed.continuity,
        appServer: observed.appServer,
        diagnostics: [lifecycleDiagnostic(
          "$.manifest",
          failure.code,
          failure.message,
          failure.repair,
        )],
      });
    }
    return v4Inspection(rootDir, fs, "onboarding", runner);
  } finally {
    try { if (parent) fs.closeSync(parent.fd); } catch {}
  }
  return v4Inspection(rootDir, fs, "onboarding", runner);
}

const REPOSITORY_FAILURES = {
  "control-path-read-only": {
    status: "repository-mount-read-only",
    code: "repository_control_path_read_only",
    path: "$.repository",
    message: "the physical Git control path did not pass its reversible write probe",
    guidance: "remount or repair the repository control path before retrying",
  },
  "control-path-invalid": {
    status: "repository-control-path-invalid",
    code: "repository_control_path_invalid",
    path: "$.repository",
    message: "the repository control path is invalid or escaped its physical authority",
    guidance: "repair the Git control layout before retrying",
  },
  "git-unavailable": {
    status: "git-capability-unavailable",
    code: "git_unavailable",
    path: "$.repository.gitVersion",
    message: "Git 2.28 or newer could not be observed",
    guidance: "install or expose Git 2.28 or newer before retrying",
  },
  "root-read-only": {
    status: "project-root-read-only",
    code: "project_root_read_only",
    path: "$.root",
    message: "the project root did not pass its reversible write probe",
    guidance: "repair project-root write access before retrying",
  },
  "session-capability-unavailable": {
    status: "session-capability-unavailable",
    code: "session_capability_unavailable",
    path: "$.repository.sessionCapability",
    message: "the session cleanup descriptor probe did not complete and roll back",
    guidance: "repair the repository-private session capability before retrying",
  },
  "worktree-capability-unavailable": {
    status: "worktree-capability-unavailable",
    code: "worktree_capability_unavailable",
    path: "$.repository.worktreeCapability",
    message: "the dispatch worktree probe did not complete and roll back",
    guidance: "repair the local Git worktree capability before retrying",
  },
  unavailable: {
    status: "repository-observation-unavailable",
    code: "repository_observation_unavailable",
    path: "$.repository",
    message: "the repository capability could not be observed safely",
    guidance: "supply one physical project root and retry the observation",
  },
};

// `runner` is threaded from the caller (`v4Inspection`, already validated),
// never assumed here. This was previously a hardcoded `"codex"` literal in
// the returned result -- the same defect class as the parameter defaults
// this task removes, just spelled as an object-literal value instead of a
// default (backlog: absent-runner-flag-silently-defaults-to-codex).
function repositoryFailureResult(rootDir, fs, intent, repository, runner) {
  requireRunner(runner, "repositoryFailureResult");
  let failure = REPOSITORY_FAILURES[repository.status] ?? null;
  if (repository.status === "local-uninitialized" && !["onboarding", "bootstrap"].includes(intent)) {
    failure = REPOSITORY_FAILURES["control-path-invalid"];
  } else if (repository.status === "host-managed"
    && (intent === "dispatch" || (intent === "session"
      && (repository.gitVersion === null || repository.sessionCapability !== "passed")))) {
    failure = {
      status: "repository-mode-unsupported",
      code: "repository_mode_unsupported",
      path: "$.repository.mode",
      message: "host-managed repository mode has not established the capability required by this intent",
      guidance: "complete the exact host repository transition before session work; dispatch still requires a local worktree capability",
    };
  } else if (!failure && !["local-valid-writable", "local-uninitialized", "host-managed"].includes(repository.status)) {
    failure = REPOSITORY_FAILURES.unavailable;
  }
  if (!failure) return null;
  let root = null;
  if (repository.status !== "unavailable") {
    try { root = safeRoot(rootDir, fs); } catch {}
  }
  const sessionCapabilityDiagnostic = repository.status === "session-capability-unavailable" && root !== null
    ? commandAction(
      [SESSION_CAPABILITY_DIAGNOSE_SCRIPT, "--repo", root],
      true,
      false,
      "pipeline.session-capability-diagnosis.v1",
      ["ready", "unavailable", "precondition-unavailable"],
    )
    : null;
  return lifecycleResult({
    status: failure.status,
    root,
    runner: root === null ? null : runner,
    intent,
    repository,
    runtime: emptyRuntime(),
    // A failed descriptor probe is not an authority to alter private state.
    // It is, however, diagnosable through the already sanctioned redacted,
    // reversible probe. Returning that exact action prevents the
    // lifecycle guard from asking callers to repeat an inspection that can
    // never yield a recovery route by itself.
    nextAction: sessionCapabilityDiagnostic,
    diagnostics: [lifecycleDiagnostic(failure.path, failure.code, failure.message, failure.guidance)],
  });
}

function v4Inspection(rootDir, fs, intent = "onboarding", runner) {
  requireRunner(runner, "v4Inspection");
  try {
    const requestedRoot = resolve(rootDir);
    const requestedInfo = fs.lstatSync(requestedRoot);
    if (requestedInfo.isSymbolicLink()) {
      return lifecycleResult({
        status: "unsafe",
        root: null,
        runner: null,
        intent,
        repository: unavailableRepository(intent),
        runtime: emptyRuntime(),
        nextAction: null,
        diagnostics: [lifecycleDiagnostic(
          "$.root",
          "root_symlink_rejected",
          "the requested project root is a symbolic link",
          "use the canonical physical project directory",
        )],
      });
    }
  } catch {
    // The repository observer below owns all other resolution/read failures.
  }
  const repository = observeRepositoryCapability(rootDir, fs, intent, intent === "onboarding");
  const repositoryFailure = repositoryFailureResult(rootDir, fs, intent, repository, runner);
  if (repositoryFailure) return repositoryFailure;
  const legacy = legacyInspection(rootDir, fs);
  const unavailable = lifecycleResult({
    status: "unsafe",
    root: legacy.root,
    runner: legacy.root ? runner : null,
    intent,
    repository,
    runtime: emptyRuntime(),
    diagnostics: [lifecycleDiagnostic("$.root", "root_resolution_failed", "the project root could not be resolved safely", "supply one real project directory")],
  });
  if (legacy.status === "unsafe") {
    // A physical root may be sound while one selected runtime parent is a
    // symlink.  Keep that distinction: the caller can safely diagnose the
    // runtime write boundary without being told that the whole project root
    // is unresolved.
    if (legacy.root && legacy.diagnostics?.some((entry) => entry?.code === "unsafe_runtime_path")) {
      return runtimeTargetReadOnlyResult({ root: legacy.root, runner, intent, repository });
    }
    return unavailable;
  }
  if (legacy.status === "fresh" || legacy.status === "fresh-host-managed") {
    return lifecycleResult({
      status: "portable-seed-required",
      root: legacy.root,
      runner,
      intent,
      repository,
      runtime: emptyRuntime(),
      nextAction: commandAction(lifecycleArgv([ONBOARDING_SCRIPT, "plan", "--root", legacy.root], runner, intent), false, false, SCHEMA, ["portable-seed-required"]),
      diagnostics: [lifecycleDiagnostic("$.source", "portable_seed_missing", "no portable V3 source and calibration seed exists", "review the portable seed plan")],
    });
  }
  if (legacy.status === "existing-unmanaged") {
    return lifecycleResult({
      status: "adoption-required",
      root: legacy.root,
      runner,
      intent,
      repository,
      runtime: emptyRuntime(),
      nextAction: commandAction(lifecycleArgv([ONBOARDING_SCRIPT, "plan", "--root", legacy.root], runner, intent), false, false, SCHEMA, ["adoption-required"]),
      diagnostics: [lifecycleDiagnostic("$.source", "adoption_required", "the local project has no Pipeline authority", "review the additive adoption plan")],
    });
  }
  if (legacy.status === "migration-required") {
    const refresh = legacy.sourceKind === "v3-refresh";
    return lifecycleResult({
      status: "migration-required",
      root: legacy.root,
      runner,
      intent,
      repository,
      runtime: emptyRuntime(),
      nextAction: commandAction(
        [MIGRATION_SCRIPT, refresh ? "plan" : "inspect", "--root", legacy.root],
        false,
        false,
        refresh ? "pipeline.runner-profile-migration-plan.v3" : "pipeline.runner-profile-migration-inspect.v3",
        refresh ? ["ready", "noop"] : ["ready", "invalid-root", "recovery-required", "invalid-source"],
      ),
      diagnostics: [lifecycleDiagnostic(
        "$.source",
        refresh ? "stale_generated_projection" : "migration_required",
        refresh ? "the project has a recognized stale V3 generated registry projection" : "the project has a legacy Pipeline source",
        refresh ? "review the closed V3 refresh plan" : "inspect the V3 migration",
      )],
    });
  }
  if (legacy.status === "partial") {
    const sourcePath = legacy.root && safePath(legacy.root, SOURCE, fs);
    if (sourcePath && fs.existsSync(sourcePath)) {
      const migrated = inspectRunnerProfileMigrationV3({ rootDir: legacy.root, deps: fs });
      if (migrated.status !== "ready") {
        return lifecycleResult({
          status: "invalid",
          root: legacy.root,
          runner: null,
          intent,
          repository,
          runtime: emptyRuntime(),
          nextAction: commandAction(lifecycleArgv([ONBOARDING_SCRIPT, "plan-source-recovery", "--root", legacy.root], runner, intent), false, false, SOURCE_RECOVERY_SCHEMA, ["recoverable", "unrepairable"]),
          diagnostics: [lifecycleDiagnostic("$.source", "source_invalid", "pipeline.user.yaml is not a valid V3 source", "review the closed source recovery disposition")],
        });
      }
      if (migrated.sourceKind === "v3") {
        // Admission is bound to the invoking session's own runner (ADR-0051),
        // not always Codex: a V3 source that enables only Claude is a valid
        // authority for a Claude Code session. `sourceEnablesCodex` stays
        // reserved for its own three existing call sites.
        if (!sourceEnablesRunner(legacy.root, fs, runner)) {
          return lifecycleResult({
            status: "invalid",
            root: legacy.root,
            runner,
            intent,
            repository,
            runtime: emptyRuntime(),
            nextAction: null,
            diagnostics: [lifecycleDiagnostic(
              "$.source.runners.enabled",
              "source_invalid",
              `${runner} is not enabled by the source authority`,
              `enable ${runner} through the source authority`,
            )],
          });
        }
        const manifest = loadManifest(legacy.root);
        if (manifest.status !== "ok") {
          return lifecycleResult({ status: "partial", root: legacy.root, runner, intent, repository, runtime: emptyRuntime(),
            nextAction: commandAction(lifecycleArgv([ONBOARDING_SCRIPT, "plan-manifest-repair", "--root", legacy.root], runner, intent), false, false, MANIFEST_REPAIR_PLAN_SCHEMA, ["ready", "unrepairable"]),
            diagnostics: [lifecycleDiagnostic("$.manifest", "manifest_invalid", "the generated pipeline manifest is absent or invalid", "review the digest-bound manifest-only repair plan")] });
        }
        // Codex reserves this directory inside its sandbox. The installed
        // plugin supplies the runtime there; a consumer project must not be
        // declared broken merely because it cannot materialize hidden bytes.
        const pluginRuntime = pluginManagedCodexRuntime(legacy.root, fs);
        if (pluginRuntime) {
          if (pluginRuntime === "receipt-invalid") {
            return pluginManagedAdmissionDriftResult({
              root: legacy.root,
              runner,
              intent,
              repository,
              sourceSha256: migrated.sourceSha256,
            });
          }
          return afterRuntimeLifecycleResult({
            root: legacy.root,
            intent,
            repository,
            runner,
            runtime: {
              ...emptyRuntime(pluginRuntime === "receipt-attested"
                ? "plugin-managed"
                : "plugin-managed-unattested"),
              sourceSha256: migrated.sourceSha256 ?? null,
            },
          }, fs);
        }
        if (persistedHostManagedLayout(legacy.root, fs)) {
          return runtimeTargetReadOnlyResult({ root: legacy.root, runner, intent, repository });
        }
        try {
          selectedRuntimeTargetParents(legacy.root, fs);
        } catch {
          return runtimeTargetReadOnlyResult({ root: legacy.root, runner, intent, repository });
        }
        const runtimePlan = planRunnerProfileMigrationV3({ rootDir: legacy.root, deps: fs, initializeMissingRuntimeForSlimV3: true });
        if (runtimePlan.status === "ready") {
          const runtimeTargets = runtimePlan.targets.filter((target) => target.kind === "runtime");
          const missing = runtimeTargets.some((target) => target.before?.status === "absent");
          // A newly appeared owned Codex preimage controls before other absent
          // targets: initialization must never overwrite it under a "missing" claim.
          const driftedPresent = runtimeTargets.some((target) => target.path.startsWith(".codex/")
            && target.before?.status === "present"
            && target.before.sha256 !== target.after?.sha256);
          const initialize = missing && !driftedPresent;
          if (initialize) {
            try {
              probeSelectedRuntimeTargets(legacy.root, fs);
            } catch {
              return runtimeTargetReadOnlyResult({ root: legacy.root, runner, intent, repository });
            }
          }
          const runtime = { ...emptyRuntime(initialize ? "missing" : "projection-drift"), sourceSha256: runtimePlan.sourceSha256 ?? null };
          // NVA-W9-DRIFTREPAIR: a real continuity classification is attached
          // here (mirroring afterRuntimeLifecycleResult's own try/catch
          // pattern above) instead of the default emptyContinuity() this
          // result used to carry. The reported top-level `status` below is
          // completely unchanged -- still exactly "projection-drift"/
          // "runtime-initialization-required" for every existing caller.
          // Only `applyProjectOnboardingKickoffV4`'s own gate (this module)
          // reads `observed.continuity.status` to admit a pristine,
          // not-yet-kicked-off project through kickoff apply despite genuine
          // unrelated drift, so its own `regenerateRuntimeProjection()` call
          // (NVA-CF-ONBOARDKICKOFF: unconditional there, never gated behind
          // whether a language change also happens to occur) can repair that
          // SAME drift atomically instead of every caller being stuck reading
          // "unavailable" here forever.
          let continuity;
          try {
            continuity = (fs.classifyOnboardingContinuity ?? classifyOnboardingContinuity)({
              rootDir: legacy.root,
              repositoryCapability: repository.mode,
              spawn: fs.spawnSync,
            });
          } catch {
            continuity = emptyContinuity();
          }
          return lifecycleResult({
            status: initialize ? "runtime-initialization-required" : "projection-drift",
            root: legacy.root,
            runner,
            intent,
            repository,
            runtime,
            continuity,
            nextAction: commandAction(lifecycleArgv([ONBOARDING_SCRIPT, initialize ? "plan-runtime" : "plan-repair", "--root", legacy.root], runner, intent), false, false, SCHEMA, [initialize ? "runtime-initialization-required" : "projection-drift"]),
            diagnostics: [lifecycleDiagnostic("$.runtime", initialize ? "runtime_missing" : "projection_drift", initialize ? "required Codex runtime targets are absent" : "generated runtime bytes differ from the V3 projection", "review the lifecycle runtime plan")],
          });
        }
      }
    }
    const cleanupRecovery = partialCleanupRecoveryResult({ root: legacy.root, runner, intent, repository });
    if (cleanupRecovery !== null) return cleanupRecovery;
    // This is an internal, read-only-caller inspection of a partial state, run
    // as the same runner that is inspecting -- never a second identity.
    const partialPlan = planProjectPartialAuthorityAdoption({ rootDir: legacy.root, runner, deps: fs });
    const reparable = partialPlan.status === "selection-required";
    return lifecycleResult({
      status: "partial",
      root: legacy.root,
      runner,
      intent,
      repository,
      runtime: emptyRuntime(),
      nextAction: reparable ? commandAction(lifecycleArgv([ONBOARDING_SCRIPT, "plan-partial-authority", "--root", legacy.root], runner, intent), false, false, PARTIAL_AUTHORITY_PLAN_SCHEMA, ["selection-required", "ready"]) : null,
      diagnostics: [lifecycleDiagnostic("$.authority", "partial_authority", "the project has an incomplete Pipeline authority", reparable ? "run the typed partial-authority planner and bind an explicit PO selection" : "inspect the existing source and generated targets")],
    });
  }
  if (legacy.status === "ready") {
    const projectAuthority = readProjectAuthority({ rootDir: legacy.root });
    if (projectAuthority.status === "ready" && projectAuthority.source === "legacy") {
      return lifecycleResult({
        status: "migration-required",
        root: legacy.root,
        runner,
        intent,
        repository,
        runtime: emptyRuntime(),
        nextAction: commandAction(
          [PROJECT_AUTHORITY_MIGRATION_WRITER, "plan", "--root", legacy.root],
          false,
          false,
          "pipeline.project-authority.v1",
          ["ready", "noop", "recovery-required", "invalid-source"],
        ),
        diagnostics: [lifecycleDiagnostic(
          "$.authority",
          "project_authority_migration_required",
          "generic Pipeline authority still uses a runner-specific legacy directory",
          "review and apply the typed runner-neutral project-authority migration",
        )],
      });
    }
    if (projectAuthority.status !== "ready") {
      const provenance = inspectProjectAuthorityProvenance({ rootDir: legacy.root });
      const migration = planProjectAuthorityMigration({
        rootDir: legacy.root,
        provenance: provenance.status === "ready" ? provenance : undefined,
      });
      // A marketplace-installed project has no vendored plugin copy, so the
      // mixed-authority adoption path above can never plan `ready` for it: its
      // package provenance is `unavailable` and the planner refuses with
      // PA-PROVENANCE-REQUIRED.  Without this branch that project falls through
      // to `invalid` with `nextAction: null` -- a dead end.  Name the sync that
      // provisions the missing evidence; a BROKEN copy is not offered it.
      if (projectAuthority.status === "mixed"
        && migration.status === "provenance-rejected"
        && migration.code === "PA-PROVENANCE-REQUIRED"
        && provenance.status === "unavailable"
        && SELF_HEALABLE_VENDOR_PROVENANCE_CODES.includes(provenance.code)) {
        return lifecycleResult({
          status: "migration-required",
          root: legacy.root,
          runner,
          intent,
          repository,
          runtime: emptyRuntime(),
          nextAction: commandAction(
            [PROJECT_AUTHORITY_MIGRATION_WRITER, "vendor-sync", "--root", legacy.root],
            false,
            false,
            PROJECT_AUTHORITY_VENDOR_SYNC_SCHEMA,
            ["ready", "noop"],
          ),
          diagnostics: [lifecycleDiagnostic(
            "$.authority",
            "project_authority_vendor_sync_required",
            "mixed-authority adoption requires a local copy of the loaded Pipeline package as provenance, which a marketplace install does not have",
            "review and apply the typed vendored-package sync, then inspect again; it writes only the ignored local package copy",
          )],
        });
      }
      if ((projectAuthority.status === "mixed" || projectAuthority.code === "PA-LEGACY-STATE-RETIREMENT-REQUIRED")
        && migration.status === "ready") {
        return lifecycleResult({
          status: "migration-required",
          root: legacy.root,
          runner,
          intent,
          repository,
          runtime: emptyRuntime(),
          nextAction: commandAction(
            [PROJECT_AUTHORITY_MIGRATION_WRITER, "plan", "--root", legacy.root],
            false,
            false,
            "pipeline.project-authority.v1",
            ["ready"],
          ),
          diagnostics: [lifecycleDiagnostic(
            "$.authority",
            "project_authority_remote_adoption_required",
            projectAuthority.code === "PA-LEGACY-STATE-RETIREMENT-REQUIRED"
              ? "a mutable legacy lifecycle State remains beside canonical neutral authority"
              : "a remote checkout left a partial neutral authority beside a complete legacy authority",
            projectAuthority.code === "PA-LEGACY-STATE-RETIREMENT-REQUIRED"
              ? "review and apply the typed legacy-State retirement; it removes only the stale duplicate after an exact neutral-State preimage check"
              : "review the typed adoption plan; it archives neutral preimages in private Git metadata before replacing them",
          )],
        });
      }
      const cleanupRecovery = projectAuthority.code === "PA-STATE-SESSION-CLEANUP-PRIVATE"
        ? (fs.planProjectAuthoritySessionCleanupRecovery ?? planProjectAuthoritySessionCleanupRecovery)({ rootDir: legacy.root })
        : null;
      let cleanupPrivatization = null;
      if (projectAuthority.code === "PA-STATE-SESSION-CLEANUP-PRIVATE"
        && cleanupRecovery?.status !== "ready") {
        try {
          cleanupPrivatization = (
            fs.planOnboardingSessionCleanupPrivatization
            ?? planOnboardingSessionCleanupPrivatization
          )({
            rootDir: legacy.root,
            sessionCleanupScript: SESSION_CLEANUP_SCRIPT,
          });
        } catch {
          cleanupPrivatization = null;
        }
      }
      return lifecycleResult({
        status: "invalid",
        root: legacy.root,
        runner,
        intent,
        repository,
        runtime: emptyRuntime(),
        nextAction: cleanupRecovery?.status === "ready"
          ? commandAction(
            [PROJECT_AUTHORITY_MIGRATION_WRITER, "recover", "--root", legacy.root],
            false,
            false,
            "pipeline.project-authority-recovery.v1",
            ["ready", "none", "recovery-unavailable", "recovery-required"],
          )
          : cleanupPrivatization?.status === "ready"
            ? commandAction(
              [SESSION_CLEANUP_SCRIPT, "plan-privatization", "--repo", legacy.root],
              false,
              false,
              "pipeline.session-cleanup-privatization-plan.v1",
              ["ready", "noop"],
            )
            : null,
        diagnostics: [lifecycleDiagnostic(
          "$.authority",
          "project_authority_invalid",
          projectAuthority.reason ?? "runner-neutral project authority is incomplete or mixed",
          "use only the typed project-authority recovery or migration action",
        )],
      });
    }
    const authority = validateV3BootstrapAuthority({ rootDir: legacy.root, deps: fs, runner });
    if (authority.status === "ready" && authority.runtimeProjection === "plugin-managed") {
      return afterRuntimeLifecycleResult({
        root: legacy.root,
        intent,
        repository,
        runner,
        runtime: { ...emptyRuntime("plugin-managed"), sourceSha256: authority.sourceSha256 ?? null },
      }, fs);
    }
    if (authority.status === "host-init-required"
      && authority.runtimeProjection === "plugin-managed-unattested") {
      return afterRuntimeLifecycleResult({
        root: legacy.root,
        intent,
        repository,
        runner,
        runtime: {
          ...emptyRuntime("plugin-managed-unattested"),
          sourceSha256: authority.sourceSha256 ?? null,
        },
      }, fs);
    }
    if (authority.status === "projection-drift"
      && authority.runtimeProjection === "plugin-managed-invalid") {
      return pluginManagedAdmissionDriftResult({
        root: legacy.root,
        runner,
        intent,
        repository,
        sourceSha256: authority.sourceSha256,
      });
    }
    if (["projection-current", "restart-required", "ready"].includes(authority.status)
      || authority.runtimeProjection === "noop") {
      // A runner without a native runtime readback never reads the barrier's
      // declared targets (they are frozen to `.codex/*`), so the private Codex
      // restart authority is not consulted for it at all -- not even when a
      // Codex session left a pending barrier behind in a dual-runner project.
      // Gating this session on that artifact would make one runner a
      // precondition for another (ADR-0057 decision 2a). This mirrors
      // `projectionCurrent`'s own branch in `scripts/v3-bootstrap-authority.mjs`,
      // which is why `authority.status` is already `"ready"` here.
      if (!requiresNativeRuntimeReadback(runner)) {
        return afterRuntimeLifecycleResult({
          root: legacy.root,
          runner,
          intent,
          repository,
          runtime: {
            ...emptyRuntime("readback-not-applicable"),
            sourceSha256: authority.sourceSha256 ?? null,
            targetsSha256: sha256(JSON.stringify(runtimePaths())),
          },
        }, fs);
      }
      try {
        const barrier = readRestartBarrier({ rootDir: legacy.root, repositoryCapability: repository.mode, deps: fs });
        if (barrier.status === "present" && barrier.barrier.state === "restart-required") {
          if (!runtimeRestartBindingCurrent(barrier.barrier, { codexExecutable: fs.codexExecutable })) {
            return lifecycleResult({
              status: "runtime-attestation-required",
              root: legacy.root,
              runner,
              intent,
              repository,
              runtime: {
                status: "projection-current",
                sourceSha256: barrier.barrier.sourceSha256,
                targetsSha256: barrier.barrier.runtimeTargetsSha256,
                barrierSha256: barrier.rawSha256,
                readbackSha256: null,
              },
              nextAction: commandAction(
                lifecycleArgv([ONBOARDING_SCRIPT, "plan-readback", "--root", legacy.root], runner, intent),
                false,
                false,
                SCHEMA,
                ["runtime-attestation-required"],
              ),
              diagnostics: [lifecycleDiagnostic(
                "$.runtime",
                "restart_binding_drift",
                "the pending restart barrier is bound to a different Pipeline launcher, helper, or Codex executable",
                "review and apply the digest-bound readback bootstrap plan to replace the stale barrier",
              )],
            });
          }
          return lifecycleResult({
            status: "restart-required",
            root: legacy.root,
            runner,
            intent,
            repository,
            runtime: { status: "restart-required", sourceSha256: barrier.barrier.sourceSha256, targetsSha256: barrier.barrier.runtimeTargetsSha256, barrierSha256: barrier.rawSha256, readbackSha256: null },
            nextAction: restartAction(legacy.root, barrier.rawSha256, runner),
            diagnostics: [lifecycleDiagnostic("$.runtime", "restart_required", "Codex runtime targets changed and require a fresh effective-runtime readback", "confirm the one-use restart action")],
          });
        }
        if (barrier.status === "present" && barrier.barrier.state === "cleared") {
          const current = readCurrentRuntimeReadback({
            rootDir: legacy.root,
            repositoryCapability: repository.mode,
            deps: fs,
          });
          if (current.status !== "current") throw new Error("cleared runtime readback marker is absent");
          return afterRuntimeLifecycleResult({ root: legacy.root, runner, intent, repository,
            runtime: {
              status: "readback-current",
              sourceSha256: current.barrier.sourceSha256,
              targetsSha256: current.barrier.runtimeTargetsSha256,
              barrierSha256: current.barrierSha256,
              readbackSha256: current.readbackSha256,
            },
          }, fs);
        }
        if (barrier.status === "absent" && authority.status === "projection-current") {
          return lifecycleResult({
            status: "runtime-attestation-required",
            root: legacy.root,
            runner,
            intent,
            repository,
            runtime: {
              status: "projection-current",
              sourceSha256: authority.sourceSha256 ?? null,
              targetsSha256: sha256(JSON.stringify(runtimePaths())),
              barrierSha256: null,
              readbackSha256: null,
            },
            nextAction: commandAction(
              lifecycleArgv([ONBOARDING_SCRIPT, "plan-readback", "--root", legacy.root], runner, intent),
              false,
              false,
              SCHEMA,
              ["runtime-attestation-required"],
            ),
            diagnostics: [lifecycleDiagnostic(
              "$.runtime",
              "restart_required",
              "the current Codex projection has no native effective-runtime readback",
              "review and apply the digest-bound readback bootstrap plan, then restart",
            )],
          });
        }
      } catch (error) {
        return runtimeFailureResult({ root: legacy.root, runner, intent, repository }, error, {
          phase: "native-runtime-readback",
          code: "native_runtime_readback_unavailable",
          message: "private runtime readback state could not be observed safely",
          guidance: "repair the platform private-state/readback capability before retrying",
        });
      }
    }
  }
  const cleanupRecovery = partialCleanupRecoveryResult({ root: legacy.root, runner, intent, repository });
  if (cleanupRecovery !== null) return cleanupRecovery;
  // Same internal, read-only-caller inspection as the sibling partial branch
  // above: the inspecting runner, threaded through, never assumed.
  const partialPlan = planProjectPartialAuthorityAdoption({ rootDir: legacy.root, runner, deps: fs });
  const reparable = partialPlan.status === "selection-required";
  return lifecycleResult({
    status: "partial",
    root: legacy.root,
    runner,
    intent,
    repository,
    runtime: emptyRuntime(),
    nextAction: reparable ? commandAction(lifecycleArgv([ONBOARDING_SCRIPT, "plan-partial-authority", "--root", legacy.root], runner, intent), false, false, PARTIAL_AUTHORITY_PLAN_SCHEMA, ["selection-required", "ready"]) : null,
    diagnostics: [lifecycleDiagnostic("$.authority", "partial_authority", "the Pipeline authority is incomplete", reparable ? "run the typed partial-authority planner and bind an explicit PO selection" : "inspect the source and generated targets")],
  });
}

/**
 * PHX-WP-ONBOARDING-CONSENT-LOCK: the onboarding-consent marker's one
 * genuine-completion call site. `intent === "session"` is the exact intent
 * guard-lifecycle-ready.mjs's `requireProjectOnboardingReady` uses to gate
 * real Write/Edit and Bash/PowerShell admission, so a `ready` result here,
 * for that intent, IS this codebase's own existing definition of "onboarding
 * actually complete" -- regardless of which apply/recovery path produced it.
 * Clearing is best-effort and never allowed to affect this function's own
 * return value: a marker that fails to clear simply stays blocking, which is
 * safe for the marker's purpose (never a bypass), and inspect() itself must
 * stay a reliable read no matter what the marker's filesystem state is.
 */
export function inspectProjectOnboardingV3({ rootDir = process.cwd(), deps: overrides = {}, intent = "onboarding", runner } = {}) {
  requireRunner(runner, "inspectProjectOnboardingV3");
  const fs = deps(overrides);
  // NVA-V13-ASKWINDOW: an onboarding ask whose condition is still true used
  // to surface ONLY through the single `apply-portable-seed` call that
  // happened to publish it -- every other reader of this function, including
  // an ordinary `inspect`, saw the raw v4Inspection() with no ask attached,
  // even when the underlying condition (a missing author identity, an
  // unconfigured verify command, ...) was still true. See
  // `withPendingOnboardingAsksOnNextActionOnly()`'s own comment for why this
  // merges only into `nextAction.pendingAsks` rather than reusing the
  // apply-portable-seed path's raw per-field side channels.
  const result = withPendingOnboardingAsksOnNextActionOnly(v4Inspection(rootDir, fs, intent, runner), fs);
  if (intent === "session" && result?.status === "ready") {
    try {
      clearConsentMarker({ rootDir: result.root ?? rootDir, reason: "onboarding-complete" });
    } catch {
      // Never let a marker-clear failure surface through inspect()'s contract.
    }
  }
  return result;
}

export function planProjectOnboardingV3({ rootDir = process.cwd(), deps: overrides = {}, runner } = {}) {
  const fs = deps(overrides); const inspected = legacyInspection(rootDir, fs);
  if (!["fresh", "fresh-host-managed", "existing-unmanaged"].includes(inspected.status)) return { schema: PLAN_SCHEMA, status: inspected.status, root: inspected.root, diagnostics: inspected.diagnostics, targets: [], requiresExplicitActivation: true };
  const hostManaged = inspected.status === "fresh-host-managed";
  const git = hostManaged ? { ok: true, version: null } : gitCapability(fs, inspected.root);
  if (!git.ok) return { schema: PLAN_SCHEMA, status: "unsupported", root: inspected.root, diagnostics: [diagnostic("$.git", "git_initial_branch_unsupported", git.reason, "install Git 2.28 or newer before activation")], targets: [], requiresExplicitActivation: true };
  const intent = freshIntent(runner, fs); const validation = validatePipelineUserV3(intent);
  if (!validation.ok) return { schema: PLAN_SCHEMA, status: "invalid-authority", root: inspected.root, diagnostics: validation.errors, targets: [], requiresExplicitActivation: true };
  const baselines = freshBaselines(intent, { hostManaged, fs });
  const manifest = validateManifest(parseYaml(baselines[NEUTRAL_MANIFEST].bytes), { rootDir: inspected.root });
  if (manifest.status !== "ok") return { schema: PLAN_SCHEMA, status: "invalid-projection", root: inspected.root, diagnostics: manifest.errors, targets: [], requiresExplicitActivation: true };
  // Only when the project has none. The apply below is create-only (`flag: "wx"`,
  // and it throws on a target that appeared during activation), so a project that
  // already owns a `.gitignore` is never touched -- it simply gets no such target.
  const seedsProjectIgnore = !(inspected.entries ?? []).includes(".gitignore");
  const internal = [
    ...[
      NEUTRAL_CALIBRATION,
      NEUTRAL_MANIFEST,
      CRITICAL_HUMAN_PROOF_POLICY_PATH,
    ].map((path) => ({ path, bytes: baselines[path].bytes })),
    { path: SOURCE, bytes: renderYaml(intent) },
    ...(seedsProjectIgnore ? [{ path: ".gitignore", bytes: PROJECT_IGNORE_SEED }] : []),
  ].sort((left, right) => left.path.localeCompare(right.path));
  const targets = internal.map((target) => ({
    path: target.path,
    // `project-ignore` is its own kind rather than being folded into `runtime`:
    // the runtime kind is filtered on elsewhere to mean "a compiled V3 runtime
    // target", and a `.gitignore` is neither compiled nor owned by that projection.
    kind: target.path === SOURCE
      ? "source"
      : (target.path === ".gitignore"
        ? "project-ignore"
        : (target.path.startsWith("project/") ? "project-authority" : "runtime")),
    before: describe(null),
    after: describe(target.bytes),
    changed: true,
  }));
  const initializesGit = !hostManaged && (inspected.status === "fresh" || !inspected.entries.includes(".git"));
  const plan = { schema: PLAN_SCHEMA, status: "ready", root: inspected.root, state: inspected.status, intentSha256: sha256(JSON.stringify(stable(intent))), git: hostManaged ? { mode: "host-managed", initialBranch: null, version: null, initializesGit: false } : { mode: "local", initialBranch: "main", version: git.version, initializesGit }, targets, changes: targets.map((target) => target.path), requiresExplicitActivation: true, activation: { command: "apply --activate", createsGitRepository: initializesGit, createsCommit: false } };
  AUTHENTICATED.set(plan, { signature: JSON.stringify(plan), root: inspected.root, targets: internal, state: inspected.status, initializesGit, hostManaged });
  return plan;
}

/**
 * Ask — never invent — the repository's commit author when it is unresolved.
 *
 * BOTH 2026-08-09 greenfield runs lost a PO turn to `Author identity unknown` at
 * their first commit: onboarding initialized the repository and never looked at
 * whether anything could commit into it. The agent then hit it several steps
 * later, mid-implementation, where only the human could answer. A warn-only
 * diagnostic (2026-08-09) fixed the discovery timing but not the interruption:
 * it sat as one passive entry in the generic `diagnostics` array, next to dozens
 * of unrelated diagnostic kinds, easy to miss and never blocking or asking
 * anything (backlog: 2026-08-10-git-identity-warn-only-diagnostic-does-not-meet-
 * po-expectation.md). This asks instead, at the exact same point, using the same
 * `collect-input` shape `collectGoalAction()` already uses for the kickoff goal.
 *
 * This deliberately still does NOT set `user.name`/`user.email` itself. An
 * author identity is a claim about who a human is; a seed inventing one would
 * put a fabricated name in permanent history, which is worse than the stop it
 * prevents — that safety property carries over unchanged; only the delivery
 * mechanism (ask, not warn) changed.
 *
 * 2026-08-17 refinement (backlog: 2026-08-17-git-identity-must-be-set-
 * immediately-before-first-commit-not-at-setup-time.md): a live Codex
 * happy-path restart test showed the calling agent asking early as intended,
 * then also running `git config` immediately, before onboarding readiness --
 * the guidance below now explicitly defers the `git config` write until
 * immediately before the repository's first commit; the ask itself is
 * unchanged.
 *
 * Non-fatal by construction: an unreadable Git, a host-managed mount this seed
 * does not own, or any probe failure resolves to "nothing missing" rather than
 * a false alarm.
 */
function unresolvedAuthorIdentityKeys(root, hostManaged, fs) {
  if (hostManaged) return [];
  const configured = (key) => {
    try {
      const probe = fs.spawnSync("git", ["config", "--get", key], { cwd: root, encoding: "utf8" });
      return probe.status === 0 && String(probe.stdout ?? "").trim().length > 0;
    } catch {
      return true; // Unprobeable is not "missing" -- never ask on evidence we do not have.
    }
  };
  return ["user.name", "user.email"].filter((key) => !configured(key));
}

// A generous single-line bound for a real name or email address -- the same
// role KICKOFF_GOAL_MAX_BYTES plays for the kickoff goal, kept local here
// rather than imported so this stays independent of onboarding-continuity.mjs.
const AUTHOR_IDENTITY_FIELD_MAX_BYTES = 320;
const INITIAL_GIT_AUTHOR_NAME_PLACEHOLDER = "<PO_GIT_AUTHOR_NAME>";
const INITIAL_GIT_AUTHOR_EMAIL_PLACEHOLDER = "<PO_GIT_AUTHOR_EMAIL>";
const INITIAL_PUSH_APPROVAL_PLACEHOLDER = "<signature|chat>";

// Same `collect-input` shape as `collectGoalAction()`, asking for both fields
// at once: the PO's own wording asks once for both, never one at a time and
// never a default for whichever key happens to already resolve. The `git
// config` write the guidance describes is deferred to immediately before the
// repository's first commit, not the moment the values are collected -- see
// the 2026-08-17 note on `unresolvedAuthorIdentityKeys()` above.
function collectAuthorIdentityAction(missing) {
  return {
    kind: "collect-input",
    inputs: [
      { name: "gitAuthorName", encoding: "utf8", trim: true, minBytes: 1, maxBytes: AUTHOR_IDENTITY_FIELD_MAX_BYTES, singleLine: true, rejectNul: true },
      { name: "gitAuthorEmail", encoding: "utf8", trim: true, minBytes: 1, maxBytes: AUTHOR_IDENTITY_FIELD_MAX_BYTES, singleLine: true, rejectNul: true },
    ],
    mutation: false,
    requiresConfirmation: false,
    guidance: `this repository cannot name a commit author (${missing.join(" and ")} unset); ask the PO once now for the author name and email, then hold the answered values -- do not set them yet -- and apply them via git config user.name "<name>" and git config user.email "<email>" in THIS repository's local config only, immediately before authoring this repository's first commit, never sooner -- never --global, and never a value the PO did not type`,
    expected: { schema: PLAN_SCHEMA, statuses: ["applied"] },
  };
}

/**
 * Content-based, not target-based: reads whatever `.gitignore` text a project
 * actually has on disk right now (from-scratch seed already written, or a
 * project's own pre-existing file, or empty if genuinely absent) and reports
 * which of `REQUIRED_PROJECT_IGNORE_PATTERNS` are not present as an exact,
 * trimmed line. A from-scratch seed always satisfies every pattern by
 * construction, so this naturally returns `[]` for that case without needing
 * to know whether onboarding itself wrote the file -- the only case this ever
 * fires for in practice is a project that owns a `.gitignore` onboarding
 * never touched.
 */
function missingProjectIgnorePatterns(gitignoreText) {
  const present = new Set(String(gitignoreText ?? "").split(/\r?\n/u).map((line) => line.trim()));
  return REQUIRED_PROJECT_IGNORE_PATTERNS.filter((pattern) => !present.has(pattern));
}

// Shared by both call sites that need `missingProjectIgnorePatterns()`'s
// input: `applyProjectOnboardingV3()` itself (this function's direct return)
// and `withPendingProjectIgnoreGapAsk()` (the lifecycle-composition re-probe,
// GF-103's own reason a second call site exists at all for the sibling
// author-identity ask). Unreadable or absent resolves to empty text -- never
// a thrown error out of an ask-surfacing check.
function readProjectIgnoreText(root, fs) {
  try {
    const path = safePath(root, ".gitignore", fs);
    return fs.existsSync(path) ? fs.readFileSync(path, "utf8") : "";
  } catch {
    return "";
  }
}

/**
 * The ask-step half of the three options the backlog names for an owned
 * `.gitignore` missing these entries (appending with the PO's knowledge, an
 * ask that surfaces the requirement, or having the producers write somewhere
 * already ignored by construction). This module cannot silently rewrite a
 * file the project owns -- same restraint `PROJECT_IGNORE_SEED` already
 * documents -- and it cannot change where the shipped evidence/security
 * producers write (out of this module's scope). So it asks: same
 * `collect-input`, informational-acknowledgment shape
 * `proposeTrustAnchorMaterializationAction()` below uses for a PO-facing
 * proposal nothing here may apply unattended. `mutation: false` is literal --
 * this library never writes to a `.gitignore` it did not just create itself.
 */
const PROJECT_IGNORE_GAP_ACK_MAX_BYTES = 16;
function collectProjectIgnoreGapAction(missing) {
  return {
    kind: "collect-input",
    input: {
      name: "projectIgnoreGapAcknowledged",
      encoding: "utf8",
      trim: true,
      minBytes: 1,
      maxBytes: PROJECT_IGNORE_GAP_ACK_MAX_BYTES,
      singleLine: true,
      rejectNul: true,
    },
    mutation: false,
    requiresConfirmation: false,
    guidance: `this repository already owns a .gitignore, so onboarding never rewrote it -- but it is missing ${missing.join(" and ")}, exactly the paths the Pipeline's own evidence and security producers write into. Left out, their output can dirty the working tree AFTER a push signature already exists, with no way back: the signature is bound to the exact commit it was produced for, and committing the producers' output moves that commit. Ask the PO, then append these anchored lines to this repository's own .gitignore yourself, with ordinary tools -- onboarding will never write to a file the project owns: ${missing.join(" ")}. Reply with a short acknowledgment ("done" or "skip") once the PO has seen this, whether or not they acted on it now.`,
    expected: { schema: SCHEMA, statuses: PORTABLE_APPLY_IDENTITY_ASK_STATUSES },
  };
}

/**
 * Ask -- for EVERY repository, pre-filled from this machine's remembered
 * preference -- how a push approval is cleared, and (only the first time a
 * machine is ever asked) where the PO's signing key lives (backlog:
 * installing-consumer-is-never-asked-any-setup-decision.md; design: this
 * repository's own Nova A epic setup-bootstrap design note, SS3). Every
 * setting an installing consumer needs today resolves silently to its
 * strictest default (`signature`, ADR-0056) with nobody ever telling them a
 * key is required, let alone that one exists. This closes exactly that gap
 * for the two decisions the PO scoped narrow for now -- `gates.push_approval`
 * and the PO key directory -- leaving the rest of the machine/repository
 * split (routing, language, session, usage, the remaining gates, autonomy,
 * critic/advisor export) to the deferred, full-taxonomy treatment.
 *
 * `pipeline.user.yaml` is repository-scoped config (PO architectural
 * decision, 2026-08-25): the question is therefore CONFIRMED per repository,
 * not asked from scratch every time and not silenced after the first machine
 * ever answers it. `machinePushApprovalPreference()` below supplies the
 * pre-fill -- `null` (this machine has never answered) makes the guidance
 * below walk the PO through the full first-time ceremony including the
 * signing key; a resolved value makes it a short per-repository confirm/
 * override instead. `freshIntent()` reads the SAME value to seed the
 * generated `pipeline.user.yaml`, so confirming the pre-fill here needs no
 * further write -- only an explicit override does.
 *
 * Deliberately does NOT write `pipeline.user.yaml`, `machine.json`, or a key
 * directory itself -- same asymmetry as `collectAuthorIdentityAction()`
 * above: this asks and guides, the caller (with the PO present) performs any
 * actual write with ordinary tools afterward. Only the PO ever creates the
 * signing key, in their own terminal (nova-setup-bootstrap.md SS3.3/SS6a) --
 * this library never runs `po-human-approval.mjs setup` on the PO's behalf
 * and never touches key material.
 */
// A generous single-line bound: covers "signature" (9 bytes) and "chat"
// (4 bytes) with ample margin, same role AUTHOR_IDENTITY_FIELD_MAX_BYTES
// plays just above.
const PUSH_APPROVAL_PREFERENCE_MAX_BYTES = 32;
function collectPushApprovalPreferenceAction(poKeyDirectoryHint, machineDefault) {
  const firstAsk = machineDefault === null;
  return {
    kind: "collect-input",
    input: {
      name: "pushApprovalPreference",
      encoding: "utf8",
      trim: true,
      minBytes: 1,
      maxBytes: PUSH_APPROVAL_PREFERENCE_MAX_BYTES,
      singleLine: true,
      rejectNul: true,
    },
    mutation: false,
    requiresConfirmation: false,
    guidance: firstAsk
      ? "this machine has never been asked how a push approval is cleared, and every setting today resolves silently to the strictest default; ask the PO once, in plain language: \"signature\" proves each approval with a detached Ed25519 signature whose private key never leaves the PO's own terminal (recommended); \"chat\" instead records an attribution in the session -- a labelled record, not a proof. Accept exactly \"signature\" or \"chat\" as the answer, never invent one. "
        + `If "signature": the sibling trust-anchor setup question in this same onboarding round collects whether an existing key should be reused or a new one created, its external directory, and the human attribution. Its returned applyAction is the only setup command to execute; do not reconstruct or copy a separate po-human-approval command. The suggested external directory is ${poKeyDirectoryHint ?? "a directory outside every repository"}, but the PO may choose another absolute path outside every checkout. `
        + "This repository's gates.push_approval in pipeline.user.yaml is seeded with the answer automatically (repository plane, ADR-0056), so no further write is needed for THIS repository; also record the same answer -- plus the key directory, if \"signature\" -- in the machine-scoped configuration plane (machine-plane.mjs) so the NEXT repository on this machine starts pre-filled with it instead of asking from scratch."
      : `this repository's gates.push_approval (pipeline.user.yaml, ADR-0056) is pre-filled from this machine's remembered preference, "${machineDefault}" (machine-plane.mjs). This is a per-repository confirmation, not a one-time machine question -- it is asked again for every new repository, seeded with the machine default so the PO can confirm in one short turn rather than re-typing it from scratch. Ask the PO to confirm "${machineDefault}" for THIS repository, or type the other value ("signature" or "chat") to override it for this repository only -- an override here does not change the machine's own remembered default in machine-plane.mjs, and pipeline.user.yaml is already seeded with the pre-filled value, so only an override needs a further edit to gates.push_approval. Accept exactly "signature" or "chat" as the answer, never invent one.`,
    expected: { schema: SCHEMA, statuses: PORTABLE_APPLY_IDENTITY_ASK_STATUSES },
  };
}

function initialAnswersReceipt(root, fs) {
  try {
    const path = safePath(root, PROJECT_ONBOARDING_INITIAL_ANSWERS_RECEIPT_PATH, fs);
    if (!fs.existsSync(path)) return null;
    const stat = fs.lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) return null;
    const parsed = JSON.parse(fs.readFileSync(path, "utf8"));
    if (parsed?.schema !== PROJECT_ONBOARDING_INITIAL_ANSWERS_RECEIPT_SCHEMA
      || parsed.root !== root
      || !["signature", "chat"].includes(parsed.pushApprovalPreference)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * The proposed default location for the PO's signing key directory
 * (nova-setup-bootstrap.md SS3.3) -- a sibling of the machine-scoped
 * configuration plane's own directory, NEVER inside it. `machine-plane.mjs`'s
 * write carve-out admits exactly one file, `machine.json`; key material must
 * never share that admitted path. This is only ever rendered into
 * human-facing guidance text -- the directory itself is created by the PO, in
 * their own terminal; this library never creates it and never writes into
 * it, mirroring `machinePlaneFilePath()`'s own home-directory derivation.
 */
function defaultPoKeyDirectoryHint(fs) {
  try {
    const home = (fs.homedir ?? homedir)();
    if (typeof home !== "string" || home.trim().length === 0) return null;
    return join(home, "agent-pipeline-po");
  } catch {
    return null;
  }
}

/**
 * True exactly when THIS MACHINE has never answered the push-approval /
 * PO-key-directory question: the machine-scoped configuration plane
 * (`machine-plane.mjs`) is absent or fails its own validation. Deliberately
 * three-valued-to-boolean, not "absent only" -- an invalid plane is just as
 * unanswered as a missing one, and re-asking is the fail-closed response to
 * either.
 */
function unresolvedMachinePushApprovalSetup(fs) {
  const readPlane = fs.readMachinePlane ?? readMachinePlane;
  return readPlane().status !== "valid";
}

/**
 * This machine's remembered push-approval preference (`machine-plane.mjs`'s
 * `pushApprovalDefault`), or `null` when the machine plane is absent/invalid
 * -- i.e. exactly when `unresolvedMachinePushApprovalSetup()` above is true.
 * The single read both `freshIntent()` (seeding a NEW repository's
 * `pipeline.user.yaml`) and `withPendingPushApprovalSetupAsk()` (rendering
 * the per-repository confirm/override ask, pre-filled with this same value)
 * are built on, so the two can never disagree about what "the machine
 * default" currently is.
 */
function machinePushApprovalPreference(fs) {
  const readPlane = fs.readMachinePlane ?? readMachinePlane;
  const result = readPlane();
  if (result.status !== "valid") return null;
  const value = result.plane?.pushApprovalDefault;
  return value === "chat" || value === "signature" ? value : null;
}

/**
 * The LIVE value of THIS repository's own `gates.push_approval`, read
 * straight from its committed `pipeline.user.yaml` -- distinct from
 * `machinePushApprovalPreference()` above, which is only the MACHINE's
 * remembered default, not necessarily what this particular repository has
 * on record today (a human may edit it, or override the pre-fill, at any
 * point after onboarding). Surfaced on the "ready" envelope (backlog:
 * 2026-08-28-push-approval-mode-is-not-chosen-at-onboarding.md, "make the
 * active mode visible in the bootstrap confirmation") so a runner that
 * believes it switched modes has a record to be contradicted by, rather
 * than a belief nothing else in the session can check. Absent, unreadable
 * or malformed resolves to `"signature"` -- ADR-0056's own fail-closed
 * default, never a silent downgrade to the weaker mode.
 */
function activePushApprovalMode(root, fs) {
  try {
    const path = safePath(root, SOURCE, fs);
    if (!fs.existsSync(path)) return "signature";
    const parsed = parseYaml(fs.readFileSync(path, "utf8"));
    const value = parsed?.gates?.push_approval;
    return value === "chat" || value === "signature" ? value : "signature";
  } catch {
    return "signature";
  }
}

/**
 * Named, typed surfacing of whether THIS repository's own
 * `project/critical-human-proof.json` currently carries a usable trust
 * anchor -- `"present"` or `"absent"`, never a boolean the caller has to
 * reinterpret. Closes the second half of backlog 2026-08-28-onboarding-
 * must-bootstrap-the-trust-anchor-once.md's acceptance criteria: when a
 * human declines the key-creation walkthrough (or none has run yet), the
 * absence is now a state visible at every "ready" inspection, not something
 * only discovered later as the human-override ceremony's own unexplained
 * `HGO-TRUST-ANCHOR-MISSING` circularity (human-guard-override.mjs).
 * Read-only; never writes or repairs the policy file itself -- GS-2
 * (guard-gate-strength.mjs) reserves that to the PO or the signed HGO Edit
 * ceremony, same boundary `detectExistingLocalTrustAnchor()` /
 * `repositoryAlreadyHasTrustAnchor()` above already respect.
 */
function trustAnchorAvailability(root, fs) {
  try {
    const path = safePath(root, CRITICAL_HUMAN_PROOF_POLICY_PATH, fs);
    if (!fs.existsSync(path)) return "absent";
    const parsed = JSON.parse(fs.readFileSync(path, "utf8"));
    if (parsed?.schema === CRITICAL_HUMAN_PROOF_POLICY_V3 && Array.isArray(parsed.trustAnchors) && parsed.trustAnchors.length > 0) return "present";
    if (parsed?.trustAnchor && typeof parsed.trustAnchor === "object" && typeof parsed.trustAnchor.publicKeySha256 === "string") return "present";
    return "absent";
  } catch {
    return "absent";
  }
}

function ensurePreimage(root, expectedState, fs) {
  const now = legacyInspection(root, fs);
  if (now.status !== expectedState) throw new Error(`root changed since planning (${now.status})`);
}

function physicalTreeSnapshot(path, fs) {
  const rows = [];
  function visit(current, relative) {
    const info = fs.lstatSync(current);
    if (info.isSymbolicLink()) throw new Error("Git control tree contains a symbolic link");
    if (info.isDirectory()) {
      rows.push({ path: relative, kind: "directory", dev: String(info.dev), ino: String(info.ino) });
      for (const name of fs.readdirSync(current).sort()) {
        visit(join(current, name), relative ? `${relative}/${name}` : name);
      }
      return;
    }
    if (!info.isFile() || info.nlink !== 1) throw new Error("Git control tree contains an unsafe file");
    rows.push({
      path: relative,
      kind: "file",
      dev: String(info.dev),
      ino: String(info.ino),
      sha256: sha256(fs.readFileSync(current)),
    });
  }
  visit(path, "");
  return rows;
}

function samePhysicalTree(path, expected, fs) {
  try {
    return JSON.stringify(physicalTreeSnapshot(path, fs)) === JSON.stringify(expected);
  } catch {
    return false;
  }
}

function ensureTargetParents(root, target, createdDirectories, fs) {
  const missing = [];
  let parent = dirname(target);
  while (parent !== root && !fs.existsSync(parent)) {
    missing.push(parent);
    parent = dirname(parent);
  }
  if (parent !== root) {
    const info = fs.lstatSync(parent);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("target parent is not a physical directory");
  }
  for (const directory of missing.reverse()) {
    if (fs.existsSync(directory)) {
      const info = fs.lstatSync(directory);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("target parent appeared with an unsafe identity");
      continue;
    }
    fs.mkdirSync(directory, { mode: 0o700 });
    const identity = directoryIdentity(fs.lstatSync(directory));
    if (!identity) throw new Error("created target directory identity is unavailable");
    createdDirectories.push({ path: directory, identity });
  }
}

function rollback(root, created, createdDirectories, gitIdentity, gitTree, gitWasExpectedAbsent, fs) {
  const failures = [];
  for (const entry of [...created].reverse()) {
    try {
      if (!fs.existsSync(entry.path)) continue;
      if (!entry.identity || !sameIdentity(entry.identity, entry.path, fs)) {
        throw new Error("created target changed identity before rollback");
      }
      // NVA-B-ROUNDL-F4: the identity check above is not reuse protection --
      // under inode reuse it is exactly what matches the file that replaced
      // ours. This rollback deletes a target only while its content still IS
      // the bytes this transaction wrote there; anything else is foreign and
      // is left in place, with the failure surfaced rather than swallowed.
      if (!entry.sha256 || !ownsPublishedOutput(entry.identity, entry.sha256, entry.path, fs)) {
        throw new Error("created target content is not this transaction's own before rollback");
      }
      fs.unlinkSync(entry.path);
    } catch (error) { failures.push(error); }
  }
  for (const entry of [...createdDirectories].reverse()) {
    try {
      if (!fs.existsSync(entry.path)) continue;
      if (!entry.identity || !sameDirectoryIdentity(entry.identity, entry.path, fs)) {
        throw new Error("created target directory changed identity before rollback");
      }
      fs.rmdirSync(entry.path);
    } catch (error) { failures.push(error); }
  }
  const gitPath = join(root, ".git");
  if (gitWasExpectedAbsent && fs.existsSync(gitPath)) {
    try {
      if (!gitIdentity || !sameDirectoryIdentity(gitIdentity, gitPath, fs)) {
        throw new Error("created Git control directory changed identity before rollback");
      }
      if (!gitTree || !samePhysicalTree(gitPath, gitTree, fs)) {
        throw new Error("created Git control tree changed before rollback");
      }
      fs.rmSync(gitPath, { recursive: true, force: true });
    } catch (error) { failures.push(error); }
  }
  return failures;
}

export function applyProjectOnboardingV3(plan, { rootDir = plan?.root ?? process.cwd(), activate = false, deps: overrides = {} } = {}) {
  if (!activate) return { schema: PLAN_SCHEMA, status: "activation-required", diagnostics: [diagnostic("$.activate", "activation_required", "apply requires explicit activation", "review the plan and pass --activate")] };
  const state = plan && AUTHENTICATED.get(plan);
  if (!state || state.signature !== JSON.stringify(plan)) return { schema: PLAN_SCHEMA, status: "invalid-plan", diagnostics: [diagnostic("$", "invalid_plan", "apply accepts only an unchanged in-process onboarding plan", "run plan again") ] };
  const fs = deps(overrides); let root; const created = []; const createdDirectories = [];
  let gitIdentity = null; let gitTree = null; let gitWasExpectedAbsent = false;
  try {
    root = safeRoot(rootDir, fs);
    if (root !== state.root) throw new Error("apply root differs from authenticated onboarding plan root");
    ensurePreimage(root, state.state, fs);
    for (const target of state.targets) safePath(root, target.path, fs);
    const git = state.hostManaged ? { ok: true } : gitCapability(fs, root); if (!git.ok) throw new Error(git.reason);
    if (state.initializesGit) {
      gitWasExpectedAbsent = true;
      const initialized = fs.spawnSync("git", ["init", "--initial-branch=main"], { cwd: root, encoding: "utf8" });
      if (initialized.error || initialized.status !== 0) throw new Error(`git init --initial-branch=main failed: ${String(initialized.stderr ?? initialized.error ?? "unknown error").trim()}`);
      gitIdentity = directoryIdentity(fs.lstatSync(join(root, ".git")));
      if (!gitIdentity) throw new Error("created Git control directory identity is unavailable");
      gitTree = physicalTreeSnapshot(join(root, ".git"), fs);
    }
    for (const target of state.targets) {
      const path = safePath(root, target.path, fs);
      if (fs.existsSync(path)) throw new Error(`target appeared during activation: ${target.path}`);
      ensureTargetParents(root, path, createdDirectories, fs);
      fs.writeFileSync(path, target.bytes, { encoding: "utf8", flag: "wx", mode: 0o600 });
      const identity = fileIdentity(fs.lstatSync(path));
      if (!identity) throw new Error(`created target identity is unavailable: ${target.path}`);
      // Digest of the bytes actually written -- see the same push in
      // applyProjectPartialAuthorityAdoption (NVA-B-ROUNDL-F4).
      created.push({ path, identity, sha256: sha256(target.bytes) });
    }
    const source = inspectRunnerProfileMigrationV3({ rootDir: root, deps: fs });
    if (source.status !== "ready" || source.sourceKind !== "v3") throw new Error("post-apply portable source validation was not ready");
    const manifest = loadManifest(root);
    if (manifest.status !== "ok") throw new Error("post-apply canonical manifest validation was not ready");
    // NVA-R9-PREPUSHHOOK (backlog: pipeline.pre-push-hook-is-offered-not-installed): the
    // git-porcelain pre-push backstop is installed-by-default here -- the same place
    // `.gitignore` is auto-seeded above -- rather than merely offered behind a separate
    // confirmation step. Placed AFTER every earlier throw point in this transaction: an
    // onboarding attempt that still rolls back above never reaches this line, so a rolled-
    // back attempt can never leave an orphaned hook behind. `applyPrePushHookInstallOnboarding`
    // (pre-push-hook-install.mjs's own `applyInstall`) already refuses -- never overwrites --
    // a hook it did not itself write (`planInstall`'s `foreign-hook-present` / hash-mismatch
    // checks), so calling it unconditionally can never touch a project-owned hook. Best-effort
    // and never fatal to onboarding: a host-managed root has no local git control this
    // installer can resolve (skipped outright, matching `unresolvedAuthorIdentityKeys()`'s own
    // host-managed short-circuit above), and any other failure (a real git binary missing, an
    // unresolvable repository root) degrades to a recorded, non-throwing status rather than
    // rolling back a transaction whose scaffold has already durably landed -- this is a
    // backstop, not a precondition for onboarding to succeed.
    const prePushHookInstall = state.hostManaged
      ? { status: "host-managed-skip" }
      : (() => {
          try { return applyPrePushHookInstallOnboarding({ rootDir: root }); }
          catch (error) { return { status: "install-error", detail: String(error?.message ?? error) }; }
        })();
    // NVA-R39-GENESISWIRE (backlog: 2026-08-29-a-node-script-defeats-every-file-protection-
    // guard.md, "Stage 2 partially landed" / "PO decision, 2026-08-29", candidate (b)): mirrors
    // `prePushHookInstall` immediately above, exactly -- install-by-default, unconditional,
    // best-effort, never a reason to roll back a scaffold that already durably landed. Safe to
    // wire in now (an earlier attempt was reverted because it broke this scaffold's own FIRST
    // commit) because `pre-commit-hook-install.mjs`'s installed hook now exempts a protected
    // path's very first appearance in git history -- exactly what onboarding's own
    // scaffold-authoring step above produces.
    const preCommitHookInstall = state.hostManaged
      ? { status: "host-managed-skip" }
      : (() => {
          try { return applyPreCommitHookInstallOnboarding({ rootDir: root }); }
          catch (error) { return { status: "install-error", detail: String(error?.message ?? error) }; }
        })();
    const gitResult = state.hostManaged ? { mode: "host-managed", initialized: false, initialBranch: null, committed: false } : { mode: "local", initialized: gitIdentity !== null, initialBranch: "main", committed: false };
    const authority = { status: "portable-seed", runtimeProjection: "missing" };
    // The transaction (Git init + scaffold writes) is unconditionally done by
    // this point -- an unresolved author identity is never a reason to roll
    // any of it back. It is a separate, additive `nextAction` alongside the
    // same "applied" status: a real ask-the-PO step, never a passive
    // diagnostic entry the caller has to notice on its own (see
    // `unresolvedAuthorIdentityKeys()`'s doc comment for the full history).
    const missingIdentity = unresolvedAuthorIdentityKeys(root, state.hostManaged, fs);
    // Same additive side-channel shape as `missingIdentity`'s `nextAction`
    // above, kept as its own field rather than competing for that single
    // slot: host-managed roots are out of scope (their `.git`/scaffold is
    // Codex-owned, mirroring `unresolvedAuthorIdentityKeys()`'s own
    // host-managed short-circuit), and a project that owns no `.gitignore`
    // just got the full seed written above, so this always resolves empty
    // for that case without needing to know which branch produced the file.
    const missingIgnorePatterns = state.hostManaged ? [] : missingProjectIgnorePatterns(readProjectIgnoreText(root, fs));
    const projectIgnoreGap = missingIgnorePatterns.length > 0 ? { projectIgnoreGapAction: collectProjectIgnoreGapAction(missingIgnorePatterns) } : {};
    if (missingIdentity.length > 0) {
      return { schema: PLAN_SCHEMA, status: "applied", root, changes: plan.changes, git: gitResult, authority, prePushHookInstall, preCommitHookInstall, nextAction: collectAuthorIdentityAction(missingIdentity), diagnostics: [], ...projectIgnoreGap };
    }
    return { schema: PLAN_SCHEMA, status: "applied", root, changes: plan.changes, git: gitResult, authority, prePushHookInstall, preCommitHookInstall, diagnostics: [], ...projectIgnoreGap };
  } catch (error) {
    const rollbackFailures = root ? rollback(root, created, createdDirectories, gitIdentity, gitTree, gitWasExpectedAbsent, fs) : [];
    if (rollbackFailures.length) return { schema: PLAN_SCHEMA, status: "rollback-failed", root, diagnostics: [diagnostic("$.transaction", "rollback_failed", `${error.message}; rollback also failed: ${rollbackFailures[0].message}`, "repair generated paths manually before retrying")] };
    return { schema: PLAN_SCHEMA, status: "rolled-back", root, diagnostics: [diagnostic("$.transaction", "apply_failed", error.message, "repair the root and run inspect then plan again")] };
  }
}

function remoteAdoptionDiagnostic(code, message, guidance) {
  return diagnostic("$.remote", code, message, guidance);
}

function validRemoteAdoptionRequest(remote, ref) {
  if (typeof remote !== "string" || remote.length === 0 || remote.length > 2048 || remote.startsWith("-") || /[\0\r\n]/u.test(remote)) {
    return "remote must be one non-empty, NUL-free argv value";
  }
  if (!REMOTE_REF_RE.test(ref) || ref.includes("..") || ref.includes("//") || ref.endsWith("/") || ref.endsWith(".lock")) {
    return "ref must be one safe refs/heads/<branch> value";
  }
  return null;
}

function remoteAdoptionBranch(ref) { return ref.slice("refs/heads/".length); }

function remoteAdoptionTarget(rootDir, fs) {
  let root;
  try { root = safeRoot(rootDir, fs); } catch (error) {
    return { status: "unsafe", root: null, diagnostics: [remoteAdoptionDiagnostic("unsafe_root", error.message, "supply one real target directory")] };
  }
  let entries;
  try { entries = rootEntries(root, fs); } catch (error) {
    return { status: "unsafe", root, diagnostics: [remoteAdoptionDiagnostic("target_unreadable", error.message, "repair target access before planning adoption")] };
  }
  const disallowed = entries.find((entry) => entry.symlink || ![".git", ".codex", ".agents"].includes(entry.name));
  if (disallowed) {
    return { status: "target-not-fresh", root, diagnostics: [remoteAdoptionDiagnostic(
      "target_not_fresh",
      `remote adoption accepts only an empty target or reserved control mounts; found ${disallowed.name}`,
      "use a new target directory; remote adoption never merges with user content",
    )] };
  }
  for (const reserved of [".codex", ".agents"]) {
    const entry = entries.find((candidate) => candidate.name === reserved);
    if (entry && (!entry.directory || entry.symlink)) {
      return { status: "unsafe", root, diagnostics: [remoteAdoptionDiagnostic("reserved_control_unsafe", `${reserved} must be a physical directory`, "repair the reserved control mount before planning adoption")] };
    }
  }
  const git = entries.find((entry) => entry.name === ".git");
  if (git && !isHostControlLayout(root, entries, fs)) {
    return { status: "target-not-fresh", root, diagnostics: [remoteAdoptionDiagnostic("git_control_not_host_reserved", "remote adoption never mutates a normal initialized Git repository", "use an empty target or the exact empty host-reserved control layout")] };
  }
  const controlIdentities = [];
  for (const entry of entries) {
    const info = fs.lstatSync(join(root, entry.name));
    const identity = directoryIdentity(info) ?? fileIdentity(info);
    if (!identity) return { status: "unsafe", root, diagnostics: [remoteAdoptionDiagnostic("control_identity_unavailable", `the reserved ${entry.name} control path has no stable physical identity`, "repair the control mount before planning adoption")] };
    controlIdentities.push({ path: entry.name, kind: entry.directory ? "directory" : "file", identity });
  }
  return {
    status: "ready",
    root,
    entries: entries.map((entry) => entry.name),
    initializesGit: !git,
    protectedPaths: entries.filter((entry) => [".codex", ".agents"].includes(entry.name)).map((entry) => entry.name),
    controlIdentities,
    diagnostics: [],
  };
}

function runRemoteGit(fs, root, args) {
  const result = fs.spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result?.error || result?.status !== 0) {
    const reason = String(result?.stderr ?? result?.error?.message ?? "Git command failed").replace(/[\r\n]+/gu, " ").trim();
    throw new Error(reason || "Git command failed");
  }
  return String(result.stdout ?? "");
}

function observeRemoteBranch(fs, root, remote, ref) {
  let stdout;
  try { stdout = runRemoteGit(fs, root, ["ls-remote", "--refs", remote, ref]); }
  catch (error) {
    return { status: "remote-unavailable", diagnostics: [remoteAdoptionDiagnostic("remote_unavailable", error.message, "make the stated remote/ref available through the selected read-only Git transport")] };
  }
  const rows = stdout.trim().split(/\r?\n/u).filter(Boolean);
  if (rows.length !== 1) {
    return { status: "remote-ref-unavailable", diagnostics: [remoteAdoptionDiagnostic("remote_ref_unavailable", "the stated remote did not return exactly one branch ref", "confirm the exact existing refs/heads branch before adopting it")] };
  }
  const match = rows[0].match(/^([0-9a-f]{40}|[0-9a-f]{64})\t([^\t\r\n]+)$/u);
  if (!match || match[2] !== ref) {
    return { status: "remote-ref-unavailable", diagnostics: [remoteAdoptionDiagnostic("remote_ref_mismatch", "the remote response was not the exact requested branch ref", "retry only with the intended remote and refs/heads branch")] };
  }
  return { status: "ready", oid: match[1], diagnostics: [] };
}

function remoteAdoptionPlanDigest(plan) {
  return sha256(JSON.stringify(stable({
    root: plan.root,
    remote: plan.remote,
    ref: plan.ref,
    branch: plan.branch,
    revision: plan.revision,
    target: plan.target,
  })));
}

/**
 * Plan an explicit existing-remote branch adoption.  This is intentionally a
 * read-only remote observation: it does not seed authority, initialize Git,
 * create kickoff/cleanup state, or materialize any runtime target.
 */
export function planProjectRemoteAdoptionV4({ rootDir = process.cwd(), remote, ref, deps: overrides = {} } = {}) {
  const fs = deps(overrides);
  const invalid = validRemoteAdoptionRequest(remote, ref);
  if (invalid) return { schema: REMOTE_ADOPTION_PLAN_SCHEMA, status: "invalid-request", root: null, diagnostics: [remoteAdoptionDiagnostic("invalid_request", invalid, "provide --remote and one existing --ref refs/heads/<branch>")], requiresExplicitActivation: true };
  const target = remoteAdoptionTarget(rootDir, fs);
  if (target.status !== "ready") return { schema: REMOTE_ADOPTION_PLAN_SCHEMA, status: target.status, root: target.root, diagnostics: target.diagnostics, requiresExplicitActivation: true };
  const observed = observeRemoteBranch(fs, target.root, remote, ref);
  if (observed.status !== "ready") return { schema: REMOTE_ADOPTION_PLAN_SCHEMA, status: observed.status, root: target.root, diagnostics: observed.diagnostics, requiresExplicitActivation: true };
  const plan = {
    schema: REMOTE_ADOPTION_PLAN_SCHEMA,
    status: "ready",
    root: target.root,
    remote,
    ref,
    branch: remoteAdoptionBranch(ref),
    revision: { oid: observed.oid, sha256: sha256(observed.oid) },
    target: {
      entries: target.entries,
      initializesGit: target.initializesGit,
      protectedPaths: target.protectedPaths,
      controlIdentities: target.controlIdentities,
      neverMoves: [".agents", ".codex"],
    },
    authority: { status: "deferred-until-exact-branch-checkout" },
    requiresExplicitActivation: true,
  };
  plan.planSha256 = remoteAdoptionPlanDigest(plan);
  plan.applyAction = {
    ...commandAction([ONBOARDING_SCRIPT, "adopt-remote", "apply", "--root", plan.root, "--remote", remote, "--ref", ref, "--plan-sha256", plan.planSha256, "--activate"], true, true, SCHEMA, ["ready", "migration-required", "runtime-initialization-required", "runtime-attestation-required", "restart-required", "kickoff-required", "remote-adoption-rolled-back", "remote-adoption-recovery-required"]),
    requiresHostBoundary: true,
  };
  return plan;
}

function ownedWorktreeSnapshot(root, fs) {
  const rows = [];
  for (const name of fs.readdirSync(root).sort()) {
    if ([".git", ".codex", ".agents"].includes(name)) continue;
    const path = join(root, name);
    const info = fs.lstatSync(path);
    if (info.isSymbolicLink()) throw new Error("remote checkout produced a symbolic link");
    if (info.isDirectory()) rows.push(...physicalTreeSnapshot(path, fs).map((row) => ({ ...row, path: row.path ? `${name}/${row.path}` : name })));
    else if (info.isFile() && info.nlink === 1) rows.push({ path: name, kind: "file", dev: String(info.dev), ino: String(info.ino), sha256: sha256(fs.readFileSync(path)) });
    else throw new Error("remote checkout produced an unsafe worktree entry");
  }
  return rows;
}

function rollbackRemoteAdoption(root, worktree, gitIdentity, gitTree, fs) {
  try {
    const current = ownedWorktreeSnapshot(root, fs);
    if (JSON.stringify(current) !== JSON.stringify(worktree)) throw new Error("remote worktree changed identity before rollback");
    for (const row of [...worktree].sort((a, b) => b.path.localeCompare(a.path))) {
      const path = join(root, row.path);
      if (row.kind === "file") fs.unlinkSync(path);
      else fs.rmdirSync(path);
    }
    const gitPath = join(root, ".git");
    if (gitIdentity) {
      if (!sameDirectoryIdentity(gitIdentity, gitPath, fs) || !samePhysicalTree(gitPath, gitTree, fs)) throw new Error("created Git control path changed before rollback");
      fs.rmSync(gitPath, { recursive: true, force: true });
    }
    return null;
  } catch (error) { return error; }
}

/** Apply an exact remote plan and then classify the branch's own authority. */
export function applyProjectRemoteAdoptionV4({ rootDir = process.cwd(), remote, ref, runner, planSha256, activate = false, deps: overrides = {} } = {}) {
  requireRunner(runner, "applyProjectRemoteAdoptionV4");
  if (!activate) return { schema: REMOTE_ADOPTION_PLAN_SCHEMA, status: "activation-required", diagnostics: [remoteAdoptionDiagnostic("activation_required", "remote adoption requires explicit activation", "review the digest-bound adoption plan and pass --activate")] };
  const fs = deps(overrides);
  const plan = planProjectRemoteAdoptionV4({ rootDir, remote, ref, deps: fs });
  if (plan.status !== "ready" || plan.planSha256 !== planSha256) return plan;
  let gitIdentity = null;
  let gitTree = null;
  let worktree = [];
  let checkedOut = false;
  try {
    if (plan.target.initializesGit) {
      runRemoteGit(fs, plan.root, ["init", "--initial-branch=main"]);
      const gitPath = join(plan.root, ".git");
      gitIdentity = directoryIdentity(fs.lstatSync(gitPath));
      if (!gitIdentity) throw new Error("created Git control directory identity is unavailable");
      gitTree = physicalTreeSnapshot(gitPath, fs);
    }
    runRemoteGit(fs, plan.root, ["remote", "add", "origin", plan.remote]);
    if (gitIdentity) gitTree = physicalTreeSnapshot(join(plan.root, ".git"), fs);
    runRemoteGit(fs, plan.root, ["fetch", "--no-tags", "origin", `${plan.ref}:refs/remotes/origin/${plan.branch}`]);
    if (gitIdentity) gitTree = physicalTreeSnapshot(join(plan.root, ".git"), fs);
    const observed = runRemoteGit(fs, plan.root, ["rev-parse", `refs/remotes/origin/${plan.branch}`]).trim();
    if (observed !== plan.revision.oid) throw new Error("fetched remote branch no longer matches the digest-bound plan");
    const names = runRemoteGit(fs, plan.root, ["ls-tree", "-r", "--name-only", plan.revision.oid]).split(/\r?\n/u);
    if (names.some((name) => [".agents", ".codex"].some((reserved) => name === reserved || name.startsWith(`${reserved}/`)))) {
      throw new Error("remote branch contains a reserved control path; adoption never moves .agents or .codex");
    }
    runRemoteGit(fs, plan.root, ["checkout", "--no-track", "-b", plan.branch, plan.revision.oid]);
    checkedOut = true;
    worktree = ownedWorktreeSnapshot(plan.root, fs);
    if (gitIdentity) gitTree = physicalTreeSnapshot(join(plan.root, ".git"), fs);
    runRemoteGit(fs, plan.root, ["branch", "--set-upstream-to", `origin/${plan.branch}`, plan.branch]);
    return v4Inspection(plan.root, fs, "onboarding", runner);
  } catch (error) {
    // An owned, newly-created Git control tree can be removed only when both
    // the checkout tree and Git identity remain exactly the transaction's.
    // Host-owned control mounts are deliberately left for their owner instead
    // of pretending a generic local rollback is safe.
    if (gitIdentity) {
      const rollbackError = rollbackRemoteAdoption(plan.root, worktree, gitIdentity, gitTree, fs);
      if (!rollbackError) return { schema: REMOTE_ADOPTION_PLAN_SCHEMA, status: "remote-adoption-rolled-back", root: plan.root, diagnostics: [remoteAdoptionDiagnostic("remote_adoption_rolled_back", error.message, "the exact transaction was rolled back; run the read-only plan again before retrying")] };
    }
    return {
      schema: REMOTE_ADOPTION_PLAN_SCHEMA,
      status: "remote-adoption-recovery-required",
      root: plan.root,
      diagnostics: [remoteAdoptionDiagnostic("remote_adoption_recovery_required", error.message, "the target or host-owned Git control path changed during adoption; preserve it and use the Git owner recovery path")],
      nextAction: commandAction([ONBOARDING_SCRIPT, "adopt-remote", "plan", "--root", plan.root, "--remote", plan.remote, "--ref", plan.ref], false, false, REMOTE_ADOPTION_PLAN_SCHEMA, ["ready", "target-not-fresh", "remote-unavailable", "remote-ref-unavailable"]),
    };
  }
}

function planLifecycle(rootDir, fs, operation, intent = "onboarding", runner, operatorAuthority = null) {
  const observed = v4Inspection(rootDir, fs, intent, runner);
  if (operation === "portable") {
    if (!["portable-seed-required", "adoption-required"].includes(observed.status)) return observed;
    const plan = planProjectOnboardingV3({ rootDir, deps: fs, runner: observed.runner });
    if (plan.status !== "ready") return observed;
    return { ...observed, nextAction: commandAction(lifecycleArgv([ONBOARDING_SCRIPT, "apply-portable-seed", "--root", plan.root, "--plan-sha256", lifecyclePlanDigest(plan), "--activate"], observed.runner, intent), true, true, SCHEMA, ["runtime-initialization-required", "restart-required", "kickoff-required", ...INTAKE_COORDINATOR_STATUSES]) };
  }
  if (operation === "repair" && observed.status === "continuity-damaged") {
    const plan = planOnboardingContinuityRepair({
      rootDir,
      repositoryCapability: observed.repository.mode,
      spawn: fs.spawnSync,
      operatorAuthority,
    });
    if (plan.status === "operator-authority-required") {
      // Third repair case (`onboarding-continuity.mjs`'s
      // `operatorConfirmedContinuity()`): a mature project's
      // `pipeline-state.json` is absent while its configured handover is real,
      // and nothing in the repository can name which feature it belongs to.
      // A real ask-step, not the flat `nextAction: null` every other
      // unrepairable continuity shape below still returns.
      return {
        ...observed,
        nextAction: collectOperatorContinuityAuthorityAction(),
        diagnostics: [],
      };
    }
    if (plan.status !== "ready") {
      return {
        ...observed,
        nextAction: null,
        diagnostics: [lifecycleDiagnostic(
          "$.continuity",
          "continuity_repair_unavailable",
          "the damaged continuity has no bounded automatic repair",
          "preserve the artifacts and use the continuity-owning workflow; do not retry plan-repair",
        )],
      };
    }
    return {
      ...observed,
      nextAction: commandAction(
        lifecycleArgv([ONBOARDING_SCRIPT, "apply-repair", "--root", plan.root, "--plan-sha256", plan.planSha256, "--activate"], observed.runner, intent),
        true,
        true,
        SCHEMA,
        ["ready"],
      ),
    };
  }
  if (operation === "runtime" || operation === "repair" || operation === "readback") {
    const expected = operation === "runtime"
      ? "runtime-initialization-required"
      : operation === "repair"
        ? "projection-drift"
        : "runtime-attestation-required";
    if (observed.status !== expected) return observed;
    // This is an ORDINARY consumer project's runtime initialization, never a
    // private overlay activating itself (that is a separate, dedicated call
    // path in private-overlay-activation.mjs). overlayCalibration: false keeps
    // a freshly seeded `.claude/pipeline.json` the honest consumer placeholder
    // instead of the overlay's own calibration literal.
    const plan = planRunnerProfileMigrationV3({ rootDir, deps: fs, initializeMissingRuntimeForSlimV3: operation === "runtime", overlayCalibration: false });
    if (operation === "readback" ? plan.status !== "noop" : plan.status !== "ready") return observed;
    // A runner without a native runtime readback publishes no barrier, so its
    // initialization lands on the next real step instead of `restart-required`.
    // Promising `restart-required` there would hand the caller an expectation
    // the apply can never satisfy.
    const runtimeStatuses = requiresNativeRuntimeReadback(observed.runner)
      ? ["restart-required"]
      : ["kickoff-required", ...INTAKE_COORDINATOR_STATUSES, "ready"];
    const statuses = operation === "runtime"
      ? runtimeStatuses
      : operation === "repair"
        ? ["restart-required", "kickoff-required", ...INTAKE_COORDINATOR_STATUSES, "ready"]
        : ["restart-required"];
    const applyCommand = operation === "runtime"
      ? "initialize-runtime"
      : operation === "repair"
        ? "apply-repair"
        : "apply-readback";
    return { ...observed, nextAction: commandAction(lifecycleArgv([ONBOARDING_SCRIPT, applyCommand, "--root", plan.root, "--plan-sha256", lifecyclePlanDigest(plan), "--activate"], observed.runner, intent), true, true, SCHEMA, statuses) };
  }
  return observed;
}

// GF-103 built a real `collect-input` ask-step for a missing commit-author
// identity at the `applyProjectOnboardingV3()` function level, but the real
// `apply-portable-seed --activate` CLI path never observes it:
// `applyLifecycle()`'s "portable" branch calls that function and discards its
// return value, then returns a completely fresh `v4Inspection()` instead
// (backlog: 2026-08-10-git-identity-ask-step-unreachable-through-live-cli-
// path.md). This re-surfaces it, ADDITIVELY, on exactly the "portable" apply
// path: never a new terminal status (that would reopen the fakeDeps/fakeGit
// test breakage GF-103 avoided) and never a change to the primary
// `nextAction` a caller already chains through to reach the next lifecycle
// step. The three statuses checked are exactly the ones the portable apply's
// own contract already declares as its resting points a few lines below
// (`["runtime-initialization-required", "restart-required", "kickoff-required"]`)
// -- a root whose portable seed lands directly on a plugin-managed Codex
// runtime reaches "restart-required" or "kickoff-required" without ever
// passing through "runtime-initialization-required", and the ask must reach
// those callers too, not just the common case.
//
// Deliberately re-probed here rather than threading the one-shot result
// `applyProjectOnboardingV3()` itself returned: a zero-write replay of the
// exact same apply call takes the early "plan is no longer ready" return
// below WITHOUT calling `applyProjectOnboardingV3()` again, and the existing
// replay-identity test (`assert.deepEqual(portableReplayed, portableApplied)`)
// requires both call shapes to compute this field identically -- a captured,
// one-shot value would desync the second call from the first.
const PORTABLE_APPLY_IDENTITY_ASK_STATUSES = ["runtime-initialization-required", "restart-required", "kickoff-required", ...INTAKE_COORDINATOR_STATUSES];
function withPendingAuthorIdentityAsk(observed, fs) {
  if (observed.repository?.mode !== "local") return observed;
  if (!PORTABLE_APPLY_IDENTITY_ASK_STATUSES.includes(observed.status)) return observed;
  const missing = unresolvedAuthorIdentityKeys(observed.root, false, fs);
  if (missing.length === 0) return observed;
  // Reuses the exact, already-tested ask-step shape `applyProjectOnboardingV3()`
  // returns directly (AUTHORID-1). Its `expected: { schema: PLAN_SCHEMA,
  // statuses: ["applied"] }` describes the direct library call's own contract,
  // not this envelope's `pipeline.project-onboarding.v4` status -- left as-is
  // rather than rebuilt for this embedding, since it is still an accurate,
  // self-contained description of what fulfilling the ask itself resolves to.
  return { ...observed, authorIdentityAction: collectAuthorIdentityAction(missing) };
}

// Sibling of `withPendingAuthorIdentityAsk()` immediately above -- same
// gating shape (local mode, same three resting statuses, same additive-only
// contract), different question. Kept as its own function rather than folded
// into that one: the two asks have unrelated resolutions -- this one is
// pre-filled from a MACHINE-scoped default (`machinePushApprovalPreference()`)
// but confirmed per REPOSITORY every time (PO decision 2026-08-25:
// `pipeline.user.yaml` is repository-scoped config), while author identity
// resolves purely per-repository -- and a shared name would misdescribe
// whichever concern was not in it.
function withPendingPushApprovalSetupAsk(observed, fs) {
  if (observed.repository?.mode !== "local") return observed;
  if (!PORTABLE_APPLY_IDENTITY_ASK_STATUSES.includes(observed.status)) return observed;
  if (initialAnswersReceipt(observed.root, fs) !== null) return observed;
  return { ...observed, pushApprovalSetupAction: collectPushApprovalPreferenceAction(defaultPoKeyDirectoryHint(fs), machinePushApprovalPreference(fs)) };
}

/**
 * Read-only detection of an OBVIOUS candidate verify command, checked in the
 * same fixed priority order the backlog names them (Direction 1, backlog:
 * pipeline.onboarding-must-elicit-the-real-verify-contract): an npm test
 * script, then a Makefile "test" target, then a conventional shell test
 * script file. Never runs anything, never guesses beyond these three
 * concrete signals -- an absent or unrecognised project shape returns `null`
 * rather than inventing a default, so `collectVerifyContractAction()` below
 * can truthfully say "detected" only when this function actually found
 * something in the project's own files.
 */
function detectVerifyCommandCandidate(root) {
  const packageJsonPath = join(root, "package.json");
  if (existsSync(packageJsonPath)) {
    try {
      const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8"));
      const script = parsed?.scripts?.test;
      if (typeof script === "string" && script.trim().length > 0 && !/Error: no test specified/u.test(script)) {
        return { command: "npm test", source: `package.json's "scripts.test" ("${script}")` };
      }
    } catch {
      // Malformed package.json is not this ask's problem to diagnose -- no candidate from it.
    }
  }
  const makefilePath = join(root, "Makefile");
  if (existsSync(makefilePath)) {
    try {
      if (/^test:/mu.test(readFileSync(makefilePath, "utf8"))) {
        return { command: "make test", source: "the Makefile's \"test\" target" };
      }
    } catch {
      // Unreadable Makefile -- no candidate from it.
    }
  }
  for (const name of ["test.sh", "run-tests.sh", "runtests.sh"]) {
    if (existsSync(join(root, name))) {
      return { command: `./${name}`, source: `the "${name}" script` };
    }
  }
  return null;
}

// A generous single-line bound for a shell command -- same role
// AUTHOR_IDENTITY_FIELD_MAX_BYTES/PUSH_APPROVAL_PREFERENCE_MAX_BYTES play
// above, sized for a realistic verify invocation rather than a name or a
// short token.
const VERIFY_COMMAND_MAX_BYTES = 512;

function verifyCommandInput() {
  return {
    name: "verifyCommand",
    encoding: "utf8",
    trim: true,
    minBytes: 1,
    maxBytes: VERIFY_COMMAND_MAX_BYTES,
    singleLine: true,
    rejectNul: true,
  };
}

/**
 * Approved design + unconfigured verify contract: one genuine public-driver
 * input boundary and the exact atomic apply transaction that consumes it.
 * The placeholder occupies exactly one argv element, so runners substitute
 * the PO's answer as data without quoting, shell reconstruction, or chat-only
 * knowledge. `pipeline-state.mjs` validates the answer again before writing.
 */
function collectImplementationVerifyCommandAction(root) {
  const candidate = detectVerifyCommandCandidate(root);
  return {
    kind: "collect-input",
    input: verifyCommandInput(),
    mutation: false,
    requiresConfirmation: false,
    guidance: candidate
      ? `the approved plan is ready for implementation, but its verify command is not configured. A candidate was detected from ${candidate.source}: "${candidate.command}". Ask the PO to confirm that exact command or supply a different real command. Then replace exactly ${PROJECT_ONBOARDING_VERIFY_COMMAND_PLACEHOLDER} in applyAction.argv with the PO's verbatim answer and execute applyAction once; that sanctioned transaction records the verify command and enters implementation atomically. Do not mutate calibration separately.`
      : `the approved plan is ready for implementation, but its verify command is not configured. Ask the PO for this project's real verification command. Then replace exactly ${PROJECT_ONBOARDING_VERIFY_COMMAND_PLACEHOLDER} in applyAction.argv with the PO's verbatim answer and execute applyAction once; that sanctioned transaction records the verify command and enters implementation atomically. Do not mutate calibration separately.`,
    applyAction: commandAction(
      [
        PO_AUTHORITY_REBIND_WRITER, "set-phase", "--phase", "implementation",
        "--verify-command", PROJECT_ONBOARDING_VERIFY_COMMAND_PLACEHOLDER,
      ],
      true,
      true,
      SCHEMA,
      ["ready"],
    ),
    expected: { schema: SCHEMA, statuses: ["ready"] },
  };
}

/**
 * Builds the `collect-input` ask for the real verify command, OFFERING
 * `candidate` (from `detectVerifyCommandCandidate()`) for confirmation when
 * one was found -- never silently adopting it, and never inventing one when
 * `candidate` is `null`. This library never writes the answer itself: same
 * asymmetry as `collectAuthorIdentityAction()`/`collectPushApprovalPreferenceAction()`
 * above -- the caller (with the PO present) edits project/pipeline.json's
 * "verify" field after the PO actually confirms or supplies a command. A
 * "defer" reply is a legitimate answer, not a dead end: `UNCONFIGURED_VERIFY`
 * (which fails on purpose) stays in place, and `withPendingVerifyContractAsk()`
 * below additionally records that the push gate is unsatisfiable while it does.
 */
function collectVerifyContractAction(candidate) {
  return {
    kind: "collect-input",
    input: verifyCommandInput(),
    mutation: false,
    requiresConfirmation: false,
    guidance: candidate
      ? `this project's verify command in project/pipeline.json is still the plugin's UNCONFIGURED_VERIFY placeholder, which fails on purpose -- the push gate cannot be satisfied until it is replaced with this project's real verification command. A candidate was detected from ${candidate.source}: "${candidate.command}". Ask the PO to confirm this exact command, or type a different one to use instead, or reply "defer" to leave the placeholder in place for now. Never adopt the candidate silently -- only the PO's own confirmed answer may replace project/pipeline.json's "verify" field, and the placeholder must never be made to pass. Until this is answered and applied, the push gate stays unsatisfiable.`
      : `this project's verify command in project/pipeline.json is still the plugin's UNCONFIGURED_VERIFY placeholder, which fails on purpose -- the push gate cannot be satisfied until it is replaced with this project's real verification command. No obvious candidate (an npm test script, a Makefile "test" target, or a conventional test script) was detected automatically. Ask the PO for the real verification command for this project (for example its test suite), or reply "defer" to leave the placeholder in place for now. Until this is answered and applied, the push gate stays unsatisfiable.`,
    expected: { schema: SCHEMA, statuses: PORTABLE_APPLY_IDENTITY_ASK_STATUSES },
  };
}

// Sibling of `withPendingPushApprovalSetupAsk()`/`withPendingAuthorIdentityAsk()`
// above -- same gating shape, different question. Closes backlog
// pipeline.onboarding-must-elicit-the-real-verify-contract: nothing before
// this ever asked what a project's real verify command is, so the seeded
// `UNCONFIGURED_VERIFY` placeholder (deliberately failing -- see its own
// definition above) stayed in place unnoticed until the push gate discovered
// it, at push time, after a human had already been asked for a signature.
// Reuses `checkVerifyContractConfigured()` (push-gate-satisfiability.mjs)
// rather than re-deriving the placeholder/missing/configured classification
// a second time. Additive only, same as its siblings: never replaces
// `nextAction`, never changes the lifecycle's resting status, and never
// writes project/pipeline.json itself.
function withPendingVerifyContractAsk(observed) {
  if (observed.repository?.mode !== "local") return observed;
  if (!PORTABLE_APPLY_IDENTITY_ASK_STATUSES.includes(observed.status)) return observed;
  // designToImplementationHandoverAction() already publishes this unresolved
  // value as the PRIMARY action with its atomic apply contract. Adding the
  // older side-channel ask as pendingAsks would ask the same answered field
  // twice and, worse, reintroduce its obsolete raw-calibration guidance.
  if (observed.nextAction?.kind === "collect-input"
    && observed.nextAction.input?.name === "verifyCommand") return observed;
  const check = checkVerifyContractConfigured(observed.root);
  if (check.ok) return observed;
  return {
    ...observed,
    verifyContractAction: collectVerifyContractAction(detectVerifyCommandCandidate(observed.root)),
    // Typed, not prose (Acceptance criterion 2): a caller can branch on this
    // field directly rather than pattern-matching `verifyContractAction`'s
    // human-facing guidance text to learn the push gate cannot be satisfied
    // yet.
    verifyContractStatus: check.status,
    pushGateSatisfiable: false,
  };
}

// Closes backlog 2026-08-28-push-approval-mode-is-not-chosen-at-onboarding.md:
// `withPendingAuthorIdentityAsk()`/`withPendingPushApprovalSetupAsk()`/
// `withPendingTrustAnchorGuidanceAsk()` above each publish their own question
// ONLY as a named side-channel envelope field (`authorIdentityAction` etc.),
// never as `nextAction` -- the one field a caller that "follows nextAction"
// (this library's own documented driver contract) actually reads. Two
// resolutions were possible (either promote one of these asks to replace
// `nextAction` outright, or leave the side channel as-is and document it as
// part of the contract); this file picks neither in isolation, because both
// have a real cost here: replacing `nextAction` outright would bury whatever
// real next step `v4Inspection()` already computed for these resting
// statuses (a `collect-input` ask of its own for "kickoff-required", e.g.
// `collectGoalAction()`, or a real blocking command for
// "runtime-initialization-required") -- and `pushApprovalSetupAction`/
// `trustAnchorGuidanceAction` are unconditional, per-repository
// CONFIRMATIONS with no resolved/consumed state this library can observe
// (unlike `authorIdentityAction`, which disappears once `git config` is
// set), so replacing `nextAction` with either of them would never fall away
// and would permanently hide the real step underneath it. Leaving them
// side-channel-only, unchanged, would keep them exactly as unreachable as
// the backlog found them.
//
// The resolution actually applied: MERGE. `nextAction` keeps whatever
// command or ask `v4Inspection()` already decided is the real next step for
// this status -- untouched, so an existing caller reading `nextAction.kind`/
// `.command` sees no behavior change -- and every pending side-channel ask
// (author identity, push approval, verify contract, trust anchor guidance,
// project-ignore gap, in that fixed priority order) is additionally attached
// to THAT SAME object as `nextAction.pendingAsks`, so a caller that follows
// `nextAction` reaches the push-approval question (and the author-identity
// one -- the SAME resolution applied to both, closing the disagreement
// between the two conventions the backlog names) without the real required
// step ever being masked. The original per-field channels
// (`authorIdentityAction` etc.) are left in place, unchanged, for the
// existing tests and any caller already reading them directly.
function collectInitialAnswersAction(observed) {
  if (!observed.pushApprovalSetupAction) return null;
  const authorInputs = observed.authorIdentityAction?.inputs ?? [];
  const trustSetup = observed.trustAnchorGuidanceAction?.applyAction?.argv?.[0] === ONBOARDING_INIT_DRIVER
    ? observed.trustAnchorGuidanceAction
    : null;
  const inputs = [
    ...authorInputs,
    observed.pushApprovalSetupAction.input,
    ...(trustSetup?.inputs ?? []),
  ];
  const argv = [ONBOARDING_INIT_DRIVER, "--root", observed.root, "--runner", observed.runner];
  if (authorInputs.length > 0) {
    argv.push(
      "--git-author-name", INITIAL_GIT_AUTHOR_NAME_PLACEHOLDER,
      "--git-author-email", INITIAL_GIT_AUTHOR_EMAIL_PLACEHOLDER,
    );
  }
  argv.push("--push-approval", INITIAL_PUSH_APPROVAL_PLACEHOLDER);
  if (trustSetup) {
    argv.push(
      "--trust-anchor-mode", TRUST_ANCHOR_MODE_PLACEHOLDER,
      "--trust-anchor-directory", TRUST_ANCHOR_DIRECTORY_PLACEHOLDER,
      "--trust-anchor-human-name", TRUST_ANCHOR_HUMAN_NAME_PLACEHOLDER,
      "--trust-anchor-existing-key", TRUST_ANCHOR_EXISTING_KEY_PLACEHOLDER,
    );
  }
  return {
    kind: "collect-input",
    inputs,
    mutation: false,
    requiresConfirmation: false,
    guidance: `collect this one initial PO round, replace each placeholder in applyAction.argv with the matching verbatim answer, then execute that exact returned action once. It records the repository-local Git author, applies the push-approval preference, ${trustSetup ? "imports an existing PEM key or creates one new key and materializes its public anchor, " : "reuses the already materialized public anchor, "}and re-enters the public onboarding driver. Do not reconstruct git config, machine-plane, intake, or key-setup commands. The real verify command is intentionally deferred until the approved design-to-implementation handover can offer the project's actual test command.`,
    applyAction: commandAction(
      argv,
      true,
      true,
      "pipeline.onboarding-init.v1",
      ["ready", "collect-input", "pending-asks", "unsupported-next-action"],
    ),
    expected: { schema: "pipeline.onboarding-init.v1", outcomes: ["ready", "collect-input", "pending-asks", "unsupported-next-action"] },
  };
}

function withPendingAsksSurfacedOnNextAction(observed) {
  const initialAnswersAction = collectInitialAnswersAction(observed);
  const trustSetupBundled = initialAnswersAction !== null
    && observed.trustAnchorGuidanceAction?.applyAction?.argv?.[0] === ONBOARDING_INIT_DRIVER;
  const pendingAsks = [
    initialAnswersAction ?? observed.authorIdentityAction,
    initialAnswersAction === null ? observed.pushApprovalSetupAction : null,
    trustSetupBundled ? null : observed.trustAnchorGuidanceAction,
    observed.projectIgnoreGapAction,
  ].filter(Boolean);
  if (pendingAsks.length === 0 || observed.nextAction == null) return observed;
  return { ...observed, nextAction: { ...observed.nextAction, pendingAsks } };
}

// PO decision 2026-08-19 (backlog: 2026-08-18-po-key-trust-anchor-onboarding.md,
// Option A): a machine that already answered the push-approval question above
// (a signing key already exists somewhere on this machine) still leaves EVERY
// subsequent project on it with no propagated trust anchor -- nothing before
// this read the machine plane's already-known authority and offered to carry
// its public digest into a new project. Read-only, additive, never writes
// project/critical-human-proof.json itself: GS-2 (guard-gate-strength.mjs) is
// a deliberate, unliftable protection ("an agent that can weaken its own gate
// has no gate"); this only proposes the pre-composed snippet and command a
// human (or the existing signed HGO Edit ceremony) runs themselves. Must not
// be read as touching PO-KEYDIR-01(A)'s repo-scoped-by-default directory
// decision (backlog: 2026-08-10-po-key-directory-default-should-be-repo-
// scoped-not-machine-wide.md) -- this is about the ANCHOR artifact, not
// where the private key lives -- and must not give po-gate-authority.mjs
// (submit-plan/approve-plan) any new dependency on signature-key
// infrastructure, which it has none of today and this change does not add.
// NVA-V1-KEYDIRPTR (backlog: 2026-08-28-a-dead-key-directory-pointer-is-
// permanent-and-silent.md): the four stops below used to all fold into an
// indistinguishable `null` -- a genuine "no machine key yet" (stops 1-2) was
// impossible for any caller to tell apart from "this machine HAS a key but
// the pointer to it is broken" (stops 3-4), a repairable fault. `status` is
// one of:
//   "no-plane"          -- no valid machine plane at all
//   "no-directory"       -- valid plane, but no poKeyDirectory recorded
//   "broken-pointer"     -- a directory IS recorded, but no readable
//                           trust-policy.json resolves there (the directory
//                           itself may no longer exist, or it exists but the
//                           file inside it is missing)
//   "malformed-policy"   -- the file resolves and parses, but its shape
//                           (keyReference/publicKeySha256) is invalid
//   "found"              -- a usable anchor was located; `anchor` is set
// The first two are the genuine no-key case `freshCriticalHumanProofPolicyBytes`'s
// bare v1 fallback exists for and must keep seeding exactly as before; the
// latter two are a dead reference, not an absence -- Direction #1 of the
// backlog item this closes.
export function observeLocalTrustAnchorPointer(fs) {
  const readPlane = fs.readMachinePlane ?? readMachinePlane;
  const plane = readPlane();
  if (plane.status !== "valid") return { status: "no-plane", anchor: null };
  const directory = plane.plane?.poKeyDirectory;
  if (typeof directory !== "string" || directory.length === 0) return { status: "no-directory", anchor: null };
  const path = join(directory, "trust-policy.json");
  if (!fs.existsSync(path)) return { status: "broken-pointer", anchor: null, directory };
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(path, "utf8")); } catch { return { status: "malformed-policy", anchor: null, directory }; }
  if (typeof parsed?.keyReference !== "string" || parsed.keyReference.length === 0) return { status: "malformed-policy", anchor: null, directory };
  if (typeof parsed?.publicKeySha256 !== "string" || !/^[a-f0-9]{64}$/u.test(parsed.publicKeySha256)) return { status: "malformed-policy", anchor: null, directory };
  return {
    status: "found",
    anchor: {
      directory, keyReference: parsed.keyReference, publicKeySha256: parsed.publicKeySha256,
      humanName: typeof parsed.humanName === "string" && parsed.humanName.length > 0 ? parsed.humanName : null,
    },
  };
}

// Thin, behavior-preserving wrapper: every pre-existing caller
// (`freshCriticalHumanProofPolicyBytes`, `withPendingTrustAnchorGuidanceAsk`)
// keeps reading a bare anchor-or-null exactly as before. A caller that needs
// to tell a broken pointer apart from a genuine no-key machine calls
// `observeLocalTrustAnchorPointer` directly instead.
function detectExistingLocalTrustAnchor(fs) {
  return observeLocalTrustAnchorPointer(fs).anchor;
}

// True when THIS repository's own committed trust-anchor policy already
// carries the given digest -- read-only. Absent, unreadable or malformed
// resolves to "not confirmed present" (never blocks the guidance on an
// unparseable file; worst case is a redundant, harmless reminder, never a
// false "already done").
function repositoryAlreadyHasTrustAnchor(root, fs, publicKeySha256) {
  const path = safePath(root, CRITICAL_HUMAN_PROOF_POLICY_PATH, fs);
  if (!fs.existsSync(path)) return false;
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(path, "utf8")); } catch { return false; }
  if (parsed?.schema === CRITICAL_HUMAN_PROOF_POLICY_V3 && Array.isArray(parsed.trustAnchors)) {
    return parsed.trustAnchors.some((anchor) => anchor?.publicKeySha256 === publicKeySha256);
  }
  return parsed?.trustAnchor?.publicKeySha256 === publicKeySha256;
}

// A generous single-line bound for a short acknowledgment token ("done",
// "skip", ...) -- this field exists only to close the collect-input action's
// shape consistently with every other one in this file (all require
// minBytes >= 1); the actual deliverable is the guidance text's snippet.
const TRUST_ANCHOR_ACK_MAX_BYTES = 16;
function proposeTrustAnchorMaterializationAction(anchor) {
  const snippet = JSON.stringify([{ keyReference: anchor.keyReference, publicKeySha256: anchor.publicKeySha256 }], null, 2);
  return {
    kind: "collect-input",
    input: {
      name: "trustAnchorMaterializationAcknowledged",
      encoding: "utf8",
      trim: true,
      minBytes: 1,
      maxBytes: TRUST_ANCHOR_ACK_MAX_BYTES,
      singleLine: true,
      rejectNul: true,
    },
    mutation: false,
    requiresConfirmation: false,
    guidance: `this machine already has a signing key (${anchor.humanName ?? "a recorded PO"} at ${anchor.directory}), but this repository's ${CRITICAL_HUMAN_PROOF_POLICY_PATH} has no matching trust anchor yet -- propose this ready-to-use "trustAnchors" entry to the PO rather than making them rediscover the file's shape: ${snippet}. The PO themselves (or the existing signed HGO Edit ceremony, human-guard-override.mjs -- guard-gate-strength.mjs forbids any agent write to this file directly) adds this entry to ${CRITICAL_HUMAN_PROOF_POLICY_PATH}'s "trustAnchors" array (creating the file with schema "${CRITICAL_HUMAN_PROOF_POLICY_V3}" if it does not exist yet) and commits it. This is informational only, never mutating -- reply with a short acknowledgment ("done" or "skip") once the PO has seen it, whether or not they acted on it now.`,
    expected: { schema: SCHEMA, statuses: PORTABLE_APPLY_IDENTITY_ASK_STATUSES },
  };
}

// NVA-V6-ANCHORREPORT (backlog: 2026-08-28-a-dead-key-directory-pointer-is-
// permanent-and-silent.md, Direction #1): a recorded `poKeyDirectory` that no
// longer resolves to a readable, well-formed `trust-policy.json` used to
// collapse into the SAME null `detectExistingLocalTrustAnchor()` returns for
// a genuine no-key machine -- so `withPendingTrustAnchorGuidanceAsk()` below
// stayed silent about it exactly as it does for the machine that never had a
// key at all. A dead pointer is a repairable fault, not an absence, and the
// PO cannot repair what they are never told about. Sibling of
// `proposeTrustAnchorMaterializationAction()` above -- same shape
// (informational `collect-input`, `mutation: false`, no `executable`/`argv`,
// nothing this library or an agent could run to repair the pointer itself:
// the PO repairs it themselves, or the existing signed HGO Edit ceremony
// does), distinct guidance text and distinct `input.name` so the two never
// read as the same message.
function proposeTrustAnchorPointerRepairAction(directory) {
  return {
    kind: "collect-input",
    input: {
      name: "trustAnchorPointerRepairAcknowledged",
      encoding: "utf8",
      trim: true,
      minBytes: 1,
      maxBytes: TRUST_ANCHOR_ACK_MAX_BYTES,
      singleLine: true,
      rejectNul: true,
    },
    mutation: false,
    requiresConfirmation: false,
    guidance: `this machine has a signing-key directory recorded (${directory}), but no readable trust-policy.json resolves there -- the directory may no longer exist, or the file inside it may be missing. This is a dead pointer, not the absence of a key: tell the PO exactly this (name the recorded directory) and let them repair it themselves -- recreate the key directory or its trust-policy.json, or re-run \`po-human-approval.mjs setup\` pointing at the correct location; this library never writes to the key directory or to the machine plane's poKeyDirectory on anyone's behalf. Reply with a short acknowledgment ("done" or "skip") once the PO has seen this, whether or not they acted on it now.`,
    expected: { schema: SCHEMA, statuses: PORTABLE_APPLY_IDENTITY_ASK_STATUSES },
  };
}

// Sibling of `proposeTrustAnchorPointerRepairAction()` immediately above --
// same "dead pointer, PO repairs it" framing, but for the OTHER of the two
// fault statuses `observeLocalTrustAnchorPointer()` distinguishes: here the
// directory resolves and `trust-policy.json` parses, but its shape
// (`keyReference`/`publicKeySha256`) is invalid. Kept as a distinct message
// (distinct `input.name`, distinct guidance) rather than folded into the
// broken-pointer text above -- "the file is not there" and "the file is
// there but broken" are different repairs, and merging them would leave the
// PO diagnosing which one applies from a message that no longer says.
function proposeTrustAnchorPolicyRepairAction(directory) {
  return {
    kind: "collect-input",
    input: {
      name: "trustAnchorPolicyRepairAcknowledged",
      encoding: "utf8",
      trim: true,
      minBytes: 1,
      maxBytes: TRUST_ANCHOR_ACK_MAX_BYTES,
      singleLine: true,
      rejectNul: true,
    },
    mutation: false,
    requiresConfirmation: false,
    guidance: `this machine has a signing-key directory recorded (${directory}), and a trust-policy.json file resolves there, but its contents do not parse into a valid trust anchor (a missing or malformed keyReference/publicKeySha256) -- the file exists but is broken, which is a different repair from the file not being there at all. Tell the PO exactly this (name the recorded directory) and let them repair it themselves -- inspect and fix the file, or re-run \`po-human-approval.mjs setup\` to regenerate it; this library never writes to the key directory or to the machine plane's poKeyDirectory on anyone's behalf. Reply with a short acknowledgment ("done" or "skip") once the PO has seen this, whether or not they acted on it now.`,
    expected: { schema: SCHEMA, statuses: PORTABLE_APPLY_IDENTITY_ASK_STATUSES },
  };
}

// NVA-V17-NOKEYASK (backlog: 2026-08-28-onboarding-must-bootstrap-the-trust-
// anchor-once.md and 2026-08-28-a-v1-trust-anchor-makes-the-signature-push-
// route-functionless.md): the two genuine-absence statuses
// `observeLocalTrustAnchorPointer()` distinguishes ("no-plane", "no-directory")
// used to fall through to `pointer.anchor === null` below with no ask at all
// -- a machine that has never had a PO signing key reached "ready" having
// been told nothing about it, and the first person to discover the gap was
// whoever later tried to sign a push. Third sibling of
// `proposeTrustAnchorPointerRepairAction()`/`proposeTrustAnchorPolicyRepairAction()`
// above -- same shape (informational `collect-input`, `mutation: false`, no
// `executable`/`argv`; the PO creates the key themselves, this library never
// writes to the key directory or the machine plane's poKeyDirectory on
// anyone's behalf), its own distinct `input.name` and guidance so a "no key
// at all" message never reads as either dead-pointer repair message: "no key
// exists yet" and "a key's pointer is broken" are different situations with
// different remedies.
const TRUST_ANCHOR_MODE_PLACEHOLDER = "<existing|new>";
const TRUST_ANCHOR_DIRECTORY_PLACEHOLDER = "<absolute external key directory>";
const TRUST_ANCHOR_HUMAN_NAME_PLACEHOLDER = "<human attribution>";
const TRUST_ANCHOR_EXISTING_KEY_PLACEHOLDER = "<absolute existing key path|none>";

function trustAnchorSetupInput(name, maxBytes) {
  return {
    name,
    encoding: "utf8",
    trim: true,
    minBytes: 1,
    maxBytes,
    singleLine: true,
    rejectNul: true,
  };
}

function proposeTrustAnchorAbsentGuidanceAction(root, runner) {
  return {
    kind: "collect-input",
    inputs: [
      trustAnchorSetupInput("trustAnchorSetupMode", 8),
      trustAnchorSetupInput("trustAnchorDirectory", 4096),
      trustAnchorSetupInput("trustAnchorHumanName", 512),
      trustAnchorSetupInput("trustAnchorExistingKeyPath", 4096),
    ],
    mutation: false,
    requiresConfirmation: false,
    guidance: `this environment has no recorded PO signing key. Ask once, in this same onboarding round: (1) import an existing PEM key or create a new key, (2) the absolute external destination directory, and (3) the human name approvals are attributed to. For "existing", also collect the absolute private-key PEM path. For "new", use the literal value "none" for trustAnchorExistingKeyPath; the attended command will prompt locally for the new key's passphrase. Only after the PO confirms those answers, replace the four placeholders in applyAction.argv with exactly them and execute that one returned action through the public onboarding driver. It performs setup, verifies both machine and repository directory pointers, materializes the first public trust anchor into this repository, and re-enters onboarding. It never returns private-key bytes. A repository that already carries a different anchor is refused as a conflict.`,
    applyAction: {
      kind: "command",
      executable: "node",
      argv: [
        ONBOARDING_INIT_DRIVER,
        "--root", root,
        "--runner", runner,
        "--trust-anchor-mode", TRUST_ANCHOR_MODE_PLACEHOLDER,
        "--trust-anchor-directory", TRUST_ANCHOR_DIRECTORY_PLACEHOLDER,
        "--trust-anchor-human-name", TRUST_ANCHOR_HUMAN_NAME_PLACEHOLDER,
        "--trust-anchor-existing-key", TRUST_ANCHOR_EXISTING_KEY_PLACEHOLDER,
      ],
      mutation: true,
      requiresConfirmation: true,
      expected: {
        schema: "pipeline.onboarding-init.v1",
        outcomes: ["ready", "collect-input", "pending-asks"],
      },
    },
    expected: { schema: SCHEMA, statuses: PORTABLE_APPLY_IDENTITY_ASK_STATUSES },
  };
}

// Sibling of `withPendingPushApprovalSetupAsk()` immediately above -- unlike
// that ask (which now fires unconditionally, every repository), this one
// keeps its own gate and fires ONLY once the machine HAS already answered
// (`unresolvedMachinePushApprovalSetup()` false), proposing
// a repository-scoped materialization snippet instead of the machine-scoped
// question -- EXCEPT for the two genuine-absence statuses below, which fire
// regardless of that gate (see their own paragraph).
//
// NVA-V6-ANCHORREPORT: reads `observeLocalTrustAnchorPointer()` directly
// (not the thin `detectExistingLocalTrustAnchor()` wrapper other callers
// still use unchanged -- see that function's own comment) so the two dead-
// pointer statuses ("broken-pointer", "malformed-policy") can each raise
// their own distinct ask instead of silently matching the `anchor === null`
// branch a genuine no-key machine ("no-plane", "no-directory") also takes.
//
// NVA-V17-NOKEYASK: those two genuine-absence statuses no longer fall
// through to silence -- they raise `proposeTrustAnchorAbsentGuidanceAction()`
// above, checked BEFORE `unresolvedMachinePushApprovalSetup()` deliberately:
// `unresolvedMachinePushApprovalSetup(fs)` reads the exact same machine plane
// `observeLocalTrustAnchorPointer()` does and is true under precisely the
// same condition "no-plane" is (`plane.status !== "valid"`), so checking
// pointer status first, ahead of that gate, changes behaviour ONLY for
// "no-plane" -- every other status ("no-directory", "broken-pointer",
// "malformed-policy", "found") requires a valid plane by construction, so
// `unresolvedMachinePushApprovalSetup(fs)` is already false by the time any
// of those branches below is reached and its later call is a no-op for them,
// byte-for-byte preserving "broken-pointer"/"malformed-policy"/"found"'s
// existing behaviour (including "found", still routed through
// `proposeTrustAnchorMaterializationAction()` exactly as before, still
// gated on push-approval-setup being resolved).
function withPendingTrustAnchorGuidanceAsk(observed, fs) {
  if (observed.repository?.mode !== "local") return observed;
  if (!PORTABLE_APPLY_IDENTITY_ASK_STATUSES.includes(observed.status)) return observed;
  const pointer = observeLocalTrustAnchorPointer(fs);
  if (pointer.status === "no-plane" || pointer.status === "no-directory") {
    return { ...observed, trustAnchorGuidanceAction: proposeTrustAnchorAbsentGuidanceAction(observed.root, observed.runner) };
  }
  if (unresolvedMachinePushApprovalSetup(fs)) return observed;
  if (pointer.status === "broken-pointer") {
    return { ...observed, trustAnchorGuidanceAction: proposeTrustAnchorPointerRepairAction(pointer.directory) };
  }
  if (pointer.status === "malformed-policy") {
    return { ...observed, trustAnchorGuidanceAction: proposeTrustAnchorPolicyRepairAction(pointer.directory) };
  }
  if (pointer.anchor === null) return observed;
  if (repositoryAlreadyHasTrustAnchor(observed.root, fs, pointer.anchor.publicKeySha256)) return observed;
  return { ...observed, trustAnchorGuidanceAction: proposeTrustAnchorMaterializationAction(pointer.anchor) };
}

// Sibling of `withPendingAuthorIdentityAsk()` above -- same gating shape,
// content-based rather than a re-derived plan check: reads whatever
// `.gitignore` this root actually has on disk right now (2026-08-28 backlog:
// the-push-gate-is-unsatisfiable-in-any-installed-plugin-deployment.md).
// Unreadable or absent resolves to empty text, which
// `missingProjectIgnorePatterns()` then reports as everything missing --
// never a false "nothing to ask" on a probe failure.
function withPendingProjectIgnoreGapAsk(observed, fs) {
  if (observed.repository?.mode !== "local") return observed;
  if (!PORTABLE_APPLY_IDENTITY_ASK_STATUSES.includes(observed.status)) return observed;
  const missing = missingProjectIgnorePatterns(readProjectIgnoreText(observed.root, fs));
  if (missing.length === 0) return observed;
  return { ...observed, projectIgnoreGapAction: collectProjectIgnoreGapAction(missing) };
}

// NVA-V13-ASKWINDOW (backlog: the onboarding asks survive past the one call
// that publishes them): the five-wrapper ask chain used to be spelled out
// TWICE, verbatim, on the two `applyLifecycle()` "portable" branch return
// lines directly below -- a third and fourth hand-written copy of the same
// composition is exactly the drift this dispatch was told not to add.
// Anything that wants the full, apply-portable-seed-shaped envelope (the
// five per-field side channels -- `authorIdentityAction` etc. -- PLUS the
// `nextAction.pendingAsks` merge) composes through this one function
// instead. Byte-for-byte the same composition the two call sites spelled out
// before this refactor -- a pure extraction, not a behavior change.
function withAllPendingOnboardingAsksAttached(observed, fs) {
  return withPendingAsksSurfacedOnNextAction(withPendingProjectIgnoreGapAsk(withPendingTrustAnchorGuidanceAsk(withPendingVerifyContractAsk(withPendingPushApprovalSetupAsk(withPendingAuthorIdentityAsk(observed, fs), fs)), fs), fs));
}

// Sibling of `withAllPendingOnboardingAsksAttached()` immediately above, for
// a caller that must NOT grow with the five raw per-field side channels:
// `inspectProjectOnboardingV3()` below feeds every intent through
// `project-onboarding-ready-gate.mjs`'s `requireProjectOnboardingReady()`,
// whose `exactKeys()` check enforces a CLOSED top-level key set for EVERY
// status, not only "ready" -- `BASE_RESULT_KEYS` gates every non-ready
// status too. Reusing `withAllPendingOnboardingAsksAttached()`'s shape
// verbatim there would grow the observation with keys that gate does not
// expect the moment any ask's condition is true, failing every intent
// closed (PORG-INVALID-OBSERVATION) -- the single highest-risk regression
// this dispatch must not introduce. This exposes the SAME pending-ask
// computation through the ONE channel a generic caller already reads
// (`nextAction.pendingAsks`; see `onboarding-init.mjs`'s own doc comment),
// returning the ORIGINAL `observed` object with nothing but `nextAction`
// replaced -- the five side channels are computed internally and then
// discarded, never attached to the object this function returns.
function withPendingOnboardingAsksOnNextActionOnly(observed, fs) {
  const augmented = withAllPendingOnboardingAsksAttached(observed, fs);
  return augmented.nextAction === observed.nextAction ? observed : { ...observed, nextAction: augmented.nextAction };
}

function applyLifecycle(rootDir, fs, operation, planSha256, activate, intent = "onboarding", runner, operatorAuthority = null) {
  if (!activate || typeof planSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(planSha256)) return v4Inspection(rootDir, fs, intent, runner);
  if (operation === "portable") {
    // The apply-side plan must be recomputed under the SAME identity the plan
    // digest was produced with, or the digests never match and the apply is a
    // silent no-op that loops the caller back to adoption-required.
    const plan = planProjectOnboardingV3({ rootDir, deps: fs, runner: v4Inspection(rootDir, fs, intent, runner).runner });
    if (plan.status !== "ready" || lifecyclePlanDigest(plan) !== planSha256) return withAllPendingOnboardingAsksAttached(v4Inspection(rootDir, fs, intent, runner), fs);
    applyProjectOnboardingV3(plan, { rootDir, activate: true, deps: fs });
    return withAllPendingOnboardingAsksAttached(v4Inspection(rootDir, fs, intent, runner), fs);
  }
  const beforeApply = v4Inspection(rootDir, fs, intent, runner);
  if (operation === "repair" && beforeApply.status === "continuity-damaged") {
    const plan = planOnboardingContinuityRepair({
      rootDir,
      repositoryCapability: beforeApply.repository.mode,
      spawn: fs.spawnSync,
      operatorAuthority,
    });
    if (plan.status !== "ready" || plan.planSha256 !== planSha256) return beforeApply;
    try {
      applyOnboardingContinuityRepair({
        rootDir,
        repositoryCapability: beforeApply.repository.mode,
        expectedPlanSha256: planSha256,
        activate: true,
        operatorAuthority,
        deps: { spawn: fs.spawnSync },
      });
    } catch {
      return v4Inspection(rootDir, fs, intent, runner);
    }
    return v4Inspection(rootDir, fs, intent, runner);
  }
  const expectedBeforeApply = operation === "runtime"
    ? "runtime-initialization-required"
    : operation === "repair"
      ? "projection-drift"
      : "runtime-attestation-required";
  if (beforeApply.status !== expectedBeforeApply) return beforeApply;
  if (operation !== "readback") {
    try {
      probeSelectedRuntimeTargets(beforeApply.root, fs);
    } catch {
      return runtimeTargetReadOnlyResult(beforeApply);
    }
  }
  // Same caller as planLifecycle() above: an ordinary consumer project's
  // runtime apply, not a private overlay activation. See its comment.
  const plan = planRunnerProfileMigrationV3({ rootDir, deps: fs, initializeMissingRuntimeForSlimV3: operation === "runtime", overlayCalibration: false });
  const expectedPlanStatus = operation === "readback" ? "noop" : "ready";
  if (plan.status !== expectedPlanStatus || lifecyclePlanDigest(plan) !== planSha256) return v4Inspection(rootDir, fs, intent, runner);
  const runtimeTargets = plan.targets.filter((target) => target.kind === "runtime" && target.path.startsWith(".codex/")).map((target) => ({
    path: target.path, beforeSha256: target.before.sha256, afterSha256: target.after.sha256,
  })).sort((left, right) => left.path.localeCompare(right.path));
  // The barrier declares `.codex/*` targets only and is cleared only by a
  // ticket proving a fresh Codex process re-read them. For a runner without a
  // native runtime readback neither half is reachable, so publishing one would
  // strand the project behind an unclearable gate -- and binding it would even
  // make a Codex executable a hard precondition for that runner's onboarding
  // (ADR-0057 decision 2a). Nothing here is skipped for the Codex path: its
  // binding, its digests and its durable-before-mutation ordering are
  // untouched below.
  const barrierRequired = requiresNativeRuntimeReadback(beforeApply.runner);
  let persisted = null;
  if (barrierRequired) {
    let binding;
    try {
      binding = (fs.prepareRuntimeRestartBinding ?? prepareRuntimeRestartBinding)({
        rootDir: plan.root,
        sourceSha256: plan.sourceSha256,
        runtimeTargets,
        codexExecutable: fs.codexExecutable,
      });
    } catch (error) {
      return runtimeFailureResult(beforeApply, error, {
        phase: "runtime-executable-binding",
        code: "runtime_executable_binding_failed",
        message: "the trusted Codex runtime executable could not be bound",
        guidance: "repair executable discovery and retry the unchanged digest-bound plan",
      });
    }
    try {
      // The barrier is durable before the target transaction begins. A crash in
      // either direction therefore blocks rather than claiming a loaded runtime.
      persisted = (fs.persistRestartBarrier ?? persistRestartBarrier)({
        rootDir: plan.root,
        repositoryCapability: beforeApply.repository.mode,
        binding,
        deps: fs,
      });
    } catch (error) {
      return runtimeFailureResult(beforeApply, error, {
        phase: "restart-barrier-persist",
        code: "restart_barrier_publication_failed",
        message: "the restart barrier could not be published before runtime mutation",
        guidance: "repair private restart-state persistence before retrying",
      });
    }
  }
  if (operation === "readback") return v4Inspection(rootDir, fs, intent, runner);
  const applied = applyRunnerProfileMigrationV3(plan, { rootDir, activate: true, deps: fs });
  if (applied.status !== "applied" && persisted?.written) {
    try {
      (fs.removeRestartBarrierCas ?? removeRestartBarrierCas)({
        rootDir: plan.root,
        repositoryCapability: beforeApply.repository.mode,
        expectedRawSha256: persisted.rawSha256,
        deps: fs,
      });
      for (const directory of [...(persisted.createdDirectories ?? [])].reverse()) {
        if (!fs.existsSync(directory)) continue;
        const info = fs.lstatSync(directory);
        if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("private runtime directory changed before rollback");
        fs.rmdirSync(directory);
        fsyncDirectory(dirname(directory), fs);
      }
    } catch {
      return runtimeFailureResult(beforeApply, null, {
        phase: "runtime-target-transaction",
        code: "exact_rollback_failed",
        message: "failed runtime activation could not restore its exact restart-state preimage",
        guidance: "inspect the typed private restart state before retrying",
      });
    }
  }
  if (applied.status !== "applied" && applied.failureClass === "runtime-target-read-only") {
    return runtimeTargetReadOnlyResult(beforeApply);
  }
  if (applied.status !== "applied") {
    return runtimeFailureResult(beforeApply, null, {
      phase: "runtime-target-transaction",
      code: "runtime_target_mutation_failed",
      message: "the runtime target transaction failed after durable barrier publication",
      guidance: "repair the target transaction failure and retry from the observed barrier state",
    });
  }
  return v4Inspection(rootDir, fs, intent, runner);
}

export function planProjectOnboardingLifecycleV4({ rootDir = process.cwd(), deps: overrides = {}, operation = "portable", intent = "onboarding", runner, operatorAuthority = null } = {}) {
  return planLifecycle(rootDir, deps(overrides), operation, intent, runner, operatorAuthority);
}

export function applyProjectOnboardingLifecycleV4({ rootDir = process.cwd(), deps: overrides = {}, operation = "portable", planSha256, activate = false, intent = "onboarding", runner, operatorAuthority = null } = {}) {
  return applyLifecycle(rootDir, deps(overrides), operation, planSha256, activate, intent, runner, operatorAuthority);
}

// Wave 4 onboarding coordinator, step 6 (design SSe; NVA-W5-COORD-STEP6-1).
// See the two usage sites below for the full rationale.
const KICKOFF_PLAN_ADMITTED_STATUSES = new Set(["kickoff-required", ...INTAKE_COORDINATOR_STATUSES]);

// The kickoff entry points inspect on the caller's behalf, so they must inspect
// as the caller's runner. Substituting one here is the same identity loss the
// consumer chain guards against (ADR-0051, ADR-0057 R1): a runner without a
// native runtime readback would be told it owes a Codex attestation and could
// never reach a kickoff at all. An omitted runner is now a caller error
// (backlog: absent-runner-flag-silently-defaults-to-codex, candidate 1) --
// never a silently promoted `"codex"`.
export function planProjectOnboardingKickoffV4({
  rootDir = process.cwd(),
  goal,
  language,
  runner,
  deps: overrides = {},
} = {}) {
  requireRunner(runner, "planProjectOnboardingKickoffV4");
  const fs = deps(overrides);
  const observed = v4Inspection(rootDir, fs, "onboarding", runner);
  // Wave 4 onboarding coordinator, step 6 (design SSe; NVA-W5-COORD-STEP6-1,
  // widened per explicit PO-equivalent decision after the narrow version
  // broke 53 pre-existing tests that use kickoff-plan/apply purely as an
  // unrelated fixture-setup mechanism): a real session now reaches
  // kickoff-required only through the drift fallback in the absent-pristine
  // branch; every genuinely fresh repo instead reports one of the three new
  // intake-*/bootstrap-binding-required statuses. Kickoff stays alive and
  // reachable exactly as designed (SSe: "not deleted") for a direct/manual/
  // test-fixture caller by accepting those three alongside the original
  // kickoff-required -- `applyOnboardingKickoff`'s own inner precondition
  // (KICKOFF-NOT-PRISTINE, onboarding-continuity.mjs) independently still
  // requires continuity.status === "absent-pristine", which is exactly what
  // all four of these statuses share, so this widening adds no new case the
  // inner layer would not already accept on its own terms.
  if (!KICKOFF_PLAN_ADMITTED_STATUSES.has(observed.status)) return observed;
  return planOnboardingKickoff({
    rootDir: observed.root,
    goal,
    language,
    runner,
    repositoryCapability: observed.repository.mode,
    onboardingScript: ONBOARDING_SCRIPT,
    spawn: fs.spawnSync,
  });
}

export function applyProjectOnboardingKickoffV4({
  rootDir = process.cwd(),
  goal,
  language,
  runner,
  planSha256,
  activate = false,
  deps: overrides = {},
} = {}) {
  requireRunner(runner, "applyProjectOnboardingKickoffV4");
  const fs = deps(overrides);
  const observed = v4Inspection(rootDir, fs, "onboarding", runner);
  // See KICKOFF_PLAN_ADMITTED_STATUSES above (design SSe; NVA-W5-COORD-STEP6-1):
  // "ready" is kept for the exact same replay-after-apply case it always
  // covered, unrelated to this widening.
  // NVA-W9-DRIFTREPAIR: "projection-drift" is ALSO admitted here -- apply
  // only, never plan; KICKOFF_PLAN_ADMITTED_STATUSES itself stays untouched
  // so planProjectOnboardingKickoffV4's own gate above is unaffected. A
  // project that is otherwise still pristine (continuity.status stays the
  // controlling check right below, completely unchanged) but happens to
  // carry drift in a runtime target unrelated to this kickoff must not be
  // handed back its own drift status here: applyOnboardingKickoff below
  // still runs exactly as before, and the drift is repaired in the same
  // correction transaction, for any drifted V3 runtime target the migration
  // governs -- not special-cased to any one file.
  //
  // NVA-CF-ONBOARDKICKOFF: the repair used to be reached ONLY as a side
  // effect of correctSeededKickoffLanguage()'s own regenerateRuntimeProjection()
  // call, which that function skips via an early return whenever the
  // resolved kickoff language equals the already-seeded language -- the seed
  // default ("en") and therefore the common case. Every same-language
  // kickoff with genuine pre-existing drift was admitted through apply above
  // WITHOUT the repair that was the whole justification for admitting it.
  // `wasProjectionDrift` is latched from the pre-apply observation (the exact
  // status this gate admitted) and used below to call
  // regenerateRuntimeProjection() unconditionally -- never gated behind
  // whether a language change also happens to occur -- so the repair this
  // admission was justified on actually always runs.
  const admittedProjectionDrift = observed.status === "projection-drift";
  if ((!KICKOFF_PLAN_ADMITTED_STATUSES.has(observed.status) && observed.status !== "ready" && !admittedProjectionDrift)
    || !["absent-pristine", "valid"].includes(observed.continuity.status)) {
    return observed;
  }
  const plan = reconstructOnboardingKickoffPlan({
    rootDir: observed.root,
    goal,
    language,
    runner,
    repositoryCapability: observed.repository.mode,
    onboardingScript: ONBOARDING_SCRIPT,
    spawn: fs.spawnSync,
  });
  applyOnboardingKickoff({
    plan,
    expectedPlanSha256: planSha256,
    activate,
    deps: { ...overrides, spawn: fs.spawnSync },
  });
  if (observed.repository.mode === "local") {
    correctSeededKickoffLanguage(observed.root, plan.language, fs);
    // NVA-CF-ONBOARDKICKOFF: unconditional, regardless of whether the call
    // above just did (or skipped) its own regeneration -- see the comment on
    // `admittedProjectionDrift` above. A no-op when the language-switch
    // branch already regenerated the projection (regenerateRuntimeProjection's
    // own plan.status !== "ready" check makes the second call a no-op once
    // the drift is already gone).
    if (admittedProjectionDrift) regenerateRuntimeProjection(observed.root, fs);
    initializeKickoffPoProfile(observed.root, fs);
  }
  return v4Inspection(rootDir, fs, "onboarding", runner);
}

// The promotion entry points inspect on the caller's behalf exactly as their
// kickoff siblings above do, and were missing the same `runner` parameter
// those siblings' comment already warns about: promotion is unreachable for
// every non-Codex runner without it (backlog:
// kickoff-apply-action-drops-the-runner-the-plan-was-made-for, mechanism A;
// ADR-0051, ADR-0057 R1). An omitted runner is now a caller error for the
// same reason as the kickoff siblings (backlog:
// absent-runner-flag-silently-defaults-to-codex, candidate 1).
export function planProjectOnboardingKickoffPromotionV4({
  rootDir = process.cwd(), profile, featureId, planPath, prdPath, specPath, designInputPath,
  runner, deps: overrides = {},
} = {}) {
  requireRunner(runner, "planProjectOnboardingKickoffPromotionV4");
  const fs = deps(overrides);
  const observed = v4Inspection(rootDir, fs, "onboarding", runner);
  if (observed.status !== "ready" || observed.continuity.status !== "valid") return observed;
  return planOnboardingKickoffPromotion({
    rootDir: observed.root, profile, featureId, planPath, prdPath, specPath, designInputPath, runner,
    repositoryCapability: observed.repository.mode, onboardingScript: ONBOARDING_SCRIPT, spawn: fs.spawnSync,
  });
}

export function applyProjectOnboardingKickoffPromotionV4({
  rootDir = process.cwd(), profile, featureId, planPath, prdPath, specPath, designInputPath,
  runner, planSha256, activate = false, deps: overrides = {},
} = {}) {
  requireRunner(runner, "applyProjectOnboardingKickoffPromotionV4");
  const fs = deps(overrides);
  const observed = v4Inspection(rootDir, fs, "onboarding", runner);
  if (observed.status !== "ready" || observed.continuity.status !== "valid") return observed;
  const plan = reconstructOnboardingKickoffPromotionPlan({
    rootDir: observed.root, profile, featureId, planPath, prdPath, specPath, designInputPath, runner,
    repositoryCapability: observed.repository.mode, onboardingScript: ONBOARDING_SCRIPT, spawn: fs.spawnSync,
  });
  applyOnboardingKickoffPromotion({
    plan, expectedPlanSha256: planSha256, activate, deps: { ...overrides, spawn: fs.spawnSync },
  });
  if (observed.repository.mode === "local") {
    correctPromotedLanguage(observed.root, plan.authority.poLanguage, fs);
  }
  return v4Inspection(rootDir, fs, "onboarding", runner);
}
