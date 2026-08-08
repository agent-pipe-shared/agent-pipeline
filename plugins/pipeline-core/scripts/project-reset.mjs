#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Read-only `plan` step for a typed project reset (R2A).
 *
 * THE GAP THIS CLOSES. Nothing in the plugin removes a project's Pipeline
 * state and returns it to a pre-onboarding condition, so a stuck project's
 * only exit was an agent-composed `rm -rf` -- one that swept `docs/` whole
 * because `docs/state.md` is a DEFAULT handover location, not a fact (see
 * backlog/items/2026-08-08-there-is-no-sanctioned-way-to-start-over.md).
 * This module derives, never recalls, the paths a reset would touch.
 *
 * WHAT THIS IS, AND IS NOT. This is the `plan` half only: it removes nothing,
 * creates nothing, and a project it inspects is byte-identical afterwards.
 * The `apply` half (digest-bound to this plan) is a separate, later piece
 * (R2B). Every removable path is DERIVED from the project's resolved
 * authority tier (`resolveAuthorityArtifactPath`, `AUTHORITY_ARTIFACTS`) and
 * its parsed calibration (`calibration.handover`), never hardcoded --
 * hardcoding `docs/state.md` here would repeat exactly the defect this item
 * was filed for.
 *
 * THREE CLOSED SETS. `remove`: paths a reset would delete -- always a file,
 * or a directory the Pipeline creates wholesale. Two cases of the latter:
 * `.git/agent-pipeline/` (private state), and (R3) an UNPROMOTED provisional
 * kickoff anchor under `specs/` -- `specs/kickoff-<16 hex>/`, matched by
 * shape via KICKOFF_ANCHOR_DIRNAME_RE below, never a startsWith string test.
 * Everywhere else the individual seeded file is named, never a container the
 * Pipeline merely writes into: `docs/` itself, or an adopter's own or a
 * promoted feature's design package under `specs/`.
 * `keep`: paths inside the Pipeline's own footprint the reset deliberately
 * leaves -- a compatibility copy at the authority tier that is NOT currently
 * selected (retained by design, see project-authority.mjs), private state
 * that resolves outside this project root (a linked worktree's Git common
 * directory, shared with other worktrees), and (R3) a PROMOTED kickoff
 * anchor -- one already carrying the supersession marker naming its
 * successor -- kept as a provenance record rather than removed as litter
 * (see the AC-4 decision at the anchor-scanning code below).
 * `neverTouched`: fixed categories the reset does not enter at all -- this
 * repository's own git history, the adopter's own files, and any design
 * package under `specs/` that is not itself a provisional kickoff anchor.
 *
 * A THIRD REMOVAL KIND (R2B/R2C). `remove` also derives every runtime-
 * projection target from the unfiltered `loadRuntimeProjectionV3OwnedKeys().
 * targets` (`runtime-projection-v3.mjs`), runner-neutrally -- never
 * `.codex/`-only or `.claude/`-only. THREE shapes fall out of that manifest,
 * keyed on the `projection` field -- never on `ownedKeys.length` alone, and
 * never on the path -- see `classifyRuntimeProjectionProvenance` below for
 * why `ownedKeys.length` cannot be the signal. A `preserve-only` target the
 * Pipeline owns no key of at all (`.claude/settings.json`,
 * `.codex/config.toml`) is `keep`, never `remove`. A whole-file-seed
 * projection (`codex-custom-agent-v3`, `codex-advisor-agent-v3`) whose
 * renderer emits the COMPLETE file body from static role metadata / intent
 * alone -- the three `.codex/agents/*.toml` files -- is a whole-file
 * `remove`, exactly like the authority artifacts above, because the whole
 * file is Pipeline prose. A keys-patch projection (`human-role-display-v3`,
 * `claude-model-routing-v3`) whose renderer instead patches specific keys
 * into an EXISTING project-owned document is a `remove` entry that names the
 * exact owned keys and never the file -- the same "remove what was seeded,
 * never the container" rule from the docs/`specs/` case, one level down,
 * inside a file instead of a directory. Two runtime-projection paths
 * (`.claude/pipeline.yaml`, `.claude/pipeline.json`) physically coincide with
 * an authority artifact (manifest, calibration); where the authority loop
 * above has ALREADY classified that exact path -- as a whole-file `remove`
 * at the currently selected tier, or as a whole-file `keep` for an existing
 * compatibility copy at the other tier -- that classification is a strict
 * superset of the runtime-projection treatment (removing/keeping the whole
 * file removes/keeps the owned keys inside it too), so the runtime-
 * projection loop SKIPS an already-claimed path. A path is therefore
 * classified exactly once, never twice. Only `apply` (R2C) actually knows
 * how to act on the two removal shapes; a `type: "keys"` entry surviving to
 * `apply` is a typed refusal (key-level surgery is unimplemented), never a
 * file delete standing in for it.
 *
 * FAILS CLOSED, NAMES WHICH. A root that is not a project, one whose
 * authority is unreadable, and one that is a symlink each produce a
 * distinct typed refusal with a non-zero exit -- never a guessed path set.
 * An already-absent artifact (a partially completed reset, or a project
 * still pending kickoff) is NOT a refusal: it is marked `existed: false`
 * inside an otherwise ordinary `ready` plan, because resuming an
 * interrupted reset is the case this item was filed for.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import {
  AUTHORITY_ARTIFACTS,
  LEGACY_MANIFEST,
  NEUTRAL_MANIFEST,
  resolveAuthorityArtifactPath,
} from "../lib/project-authority.mjs";
import { loadRuntimeProjectionV3OwnedKeys } from "../lib/runtime-projection-v3.mjs";

export const PROJECT_RESET_PLAN_SCHEMA = "pipeline.project-reset-plan.v1";
export const PROJECT_RESET_APPLY_RESULT_SCHEMA = "pipeline.project-reset-apply-result.v1";

// The stages `apply` can be interrupted at, frozen so the fault-injection test
// suite can iterate them and a future stage cannot be added silently: journal
// write (three sub-stages: temp file written+fsynced, renamed into place,
// containing directory fsynced), each individual quarantine move, quarantine
// removal, and journal removal. Every stage from "journal-rename" onward is
// recovered by resuming the SAME digest-bound command (the journal is the
// durable record of intent); a fault strictly before "journal-rename" is
// recovered by discarding the orphaned temporary file and leaves the root
// byte-identical to before the call.
export const RESET_APPLY_FAULT_STAGES = Object.freeze([
  "journal-temp-fsync",
  "journal-rename",
  "journal-directory-fsync",
  "move",
  "quarantine-remove",
  "journal-remove",
]);

const SHA256_RE = /^[a-f0-9]{64}$/u;
const RESET_QUARANTINE_DIRNAME = ".pipeline-reset-quarantine";
const RESET_JOURNAL_BASENAME = ".pipeline-reset-journal.json";
const RESET_RECEIPT_BASENAME = ".pipeline-reset-receipt.json";
const RESET_JOURNAL_SCHEMA = "pipeline.project-reset-journal.v1";

const AUTHORITY_KINDS = Object.freeze(["manifest", "state", "calibration", "guardConfig", "guardAudit"]);
const DEFAULT_HANDOVER_PATH = "docs/state.md";

// Fixed regardless of project shape: the reset never enters these categories
// at all, so the command states them rather than an agent guessing them.
const NEVER_TOUCHED = Object.freeze([
  Object.freeze({
    category: "git-history",
    description: "the repository's own git history: commits, refs, and objects",
  }),
  Object.freeze({
    category: "adopter-files",
    description: "the adopter's own files outside the Pipeline's authority and private-state footprint",
  }),
  Object.freeze({
    category: "design-package",
    description: "any design package under specs/ that is not itself a provisional kickoff anchor: an adopter's own work, or a promoted feature's PRD, specification, and design input. A provisional kickoff anchor (specs/kickoff-<16 hex>/) is not a design package -- it is Pipeline-seeded scaffolding for an attempted kickoff, and this reset classifies it separately (kind kickoffAnchor/kickoffAnchorPromoted in remove/keep, not this entry)",
  }),
]);

// R3 (backlog/items/2026-08-08-there-is-no-sanctioned-way-to-start-over.md,
// direction 3): a provisional kickoff anchor is Pipeline-seeded scaffolding,
// not a design package, so its removal belongs in `remove`/`keep` above --
// never folded into the "design-package" neverTouched entry that used to
// claim specs/ untouched wholesale (see the entry's description above).
//
// SHAPE, NOT A STRING TEST. `KICKOFF_ANCHOR_DIRNAME_RE` is the SAME check
// onboarding-continuity.mjs uses to recognise a kickoff feature id
// (:3434 recognisedKickoff, :4354 publishKickoffSupersession, :460 history
// validation) -- the id is `kickoff-${goalSha256.slice(0, 16)}`
// (:3241 planOnboardingKickoff) and its directory is `specs/${featureId}`
// (:2876 initialAuthorityPaths). A startsWith("specs/kickoff-") test would
// also match an adopter's own specs/kickoff-notes-from-the-workshop/; the
// exact 16-lowercase-hex shape does not, because it is drawn from a sha256
// digest.
//
// DUPLICATED, NOT IMPORTED, AND SAID SO. None of the three call sites above
// exports this regex, and importing onboarding-continuity.mjs here would
// pull kickoff's full read/write/lock side-effect surface into a read-only
// plan step -- exactly what this dispatch's stop conditions warned against
// doing silently. Precedent for the duplication already exists in this
// repository: onboarding-continuity.test.mjs:1134 duplicates the sibling
// `SUPERSEDED.md` constant (see KICKOFF_SUPERSESSION_MARKER_BASENAME below)
// as a test-local constant for the same reason. Agreement is pinned by
// project-reset.test.mjs, which drives specs/ through the REAL
// planOnboardingKickoff/applyOnboardingKickoff and
// planOnboardingKickoffPromotion/applyOnboardingKickoffPromotion producers
// and asserts this regex classifies exactly what they create.
const KICKOFF_ANCHOR_DIRNAME_RE = /^kickoff-[a-f0-9]{16}$/u;

// The basename a promotion transaction already writes, after it commits, to
// retire an anchor by naming its successor
// (onboarding-continuity.mjs:144 KICKOFF_SUPERSESSION_BASENAME, written by
// publishKickoffSupersession:4353). Not exported either; duplicated for the
// same reason and pinned the same way as the regex above.
const KICKOFF_SUPERSESSION_MARKER_BASENAME = "SUPERSEDED.md";

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalSha256(value) {
  return sha256(Buffer.from(canonicalJson(value), "utf8"));
}

/** A handover path must be a bounded project-relative path that cannot collide with a control path. */
function isSafeHandoverPath(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 240) return false;
  if (value.includes("\0") || value.includes("\\") || isAbsolute(value)) return false;
  const parts = value.split("/");
  if (parts.some((part) => part.length === 0 || part === "." || part === "..")) return false;
  if (value === ".git" || value.startsWith(".git/")) return false;
  return true;
}

function resolveGitCommonDir(root) {
  const result = spawnSync("git", ["-C", root, "rev-parse", "--path-format=absolute", "--git-common-dir"], {
    encoding: "utf8",
    shell: false,
    timeout: 5000,
  });
  if (result.error || result.status !== 0) return null;
  const raw = String(result.stdout ?? "").trim();
  if (!raw || !isAbsolute(raw)) return null;
  try { return realpathSync(raw); } catch { return null; }
}

function refusal(status, code, root) {
  return {
    schema: PROJECT_RESET_PLAN_SCHEMA,
    status,
    code,
    root,
    authorityTier: null,
    remove: [],
    keep: [],
    neverTouched: NEVER_TOUCHED,
    planSha256: null,
  };
}

// Projection kinds proven, by the renderer source cited below, to emit a
// COMPLETE file body independent of any pre-existing file -- so the whole
// file is Pipeline prose, never project content:
//   - `codex-custom-agent-v3`: `codexCustomAgentSeed()`
//     (runtime-projection-v3.mjs:47) renders name/description/both model
//     fields/developer_instructions from static role metadata alone; the V3
//     renderer only ever patches on top of that self-seeded body.
//   - `codex-advisor-agent-v3`: its renderer builds all six owned keys from
//     the routing `intent` alone, the same shape one level up.
// Every OTHER owned-keys projection (`human-role-display-v3`,
// `claude-model-routing-v3`) instead REQUIRES a pre-existing baseline and
// preserves every unowned byte of it -- it patches keys into a document the
// PROJECT owns. `ownedKeys.length` cannot be the signal that tells these two
// families apart: the whole-file kind lists only the route-owned keys
// (`model`, `model_reasoning_effort`), never the static fields it also
// wrote, so its `ownedKeys` count is systematically smaller than the file it
// produced. The `projection` kind -- a manifest field, never a path -- is
// the only signal that actually reflects which renderer produced the file.
const WHOLE_FILE_SEED_PROJECTIONS = Object.freeze(new Set([
  "codex-custom-agent-v3",
  "codex-advisor-agent-v3",
]));

/**
 * Classify a runtime-projection manifest target's FILE PROVENANCE -- did the
 * Pipeline create this file wholesale, or does it merely own keys inside a
 * file the project owns -- from the manifest's own `projection` field.
 * Deliberately takes only `{ projection, ownedKeys }`: it cannot special-case
 * a path because it is never given one.
 */
export function classifyRuntimeProjectionProvenance({ projection, ownedKeys }) {
  if (!Array.isArray(ownedKeys) || ownedKeys.length === 0) return "preserve";
  return WHOLE_FILE_SEED_PROJECTIONS.has(projection) ? "file" : "keys";
}

/**
 * Plan a project reset: derive the three closed sets for the project rooted
 * at `rootDir`. Never writes; never throws for an expected refusal -- every
 * outcome (including a refusal) is a typed, exit-code-bearing result.
 */
export function planProjectReset({ rootDir } = {}) {
  if (typeof rootDir !== "string" || rootDir.length === 0) {
    return refusal("root-unsafe", "PROJECT-RESET-ROOT-REQUIRED", null);
  }
  const requested = resolve(rootDir);
  let info;
  try { info = lstatSync(requested); }
  catch { return refusal("root-unsafe", "PROJECT-RESET-ROOT-UNAVAILABLE", requested); }
  if (info.isSymbolicLink()) return refusal("root-unsafe", "PROJECT-RESET-ROOT-SYMLINK", requested);
  if (!info.isDirectory()) return refusal("root-unsafe", "PROJECT-RESET-ROOT-NOT-DIRECTORY", requested);
  const root = realpathSync(requested);

  const manifestArtifact = resolveAuthorityArtifactPath("manifest", { rootDir: root });
  if (manifestArtifact.authorityStatus === "invalid") {
    return refusal("authority-unreadable", "PROJECT-RESET-AUTHORITY-UNREADABLE", root);
  }
  const neutralManifestExists = existsSync(join(root, NEUTRAL_MANIFEST));
  const legacyManifestExists = existsSync(join(root, LEGACY_MANIFEST));
  if (!neutralManifestExists && !legacyManifestExists) {
    return refusal("not-a-project", "PROJECT-RESET-NOT-A-PROJECT", root);
  }

  const remove = [];
  const keep = [];
  let authorityTier = null;
  for (const kind of AUTHORITY_KINDS) {
    const resolved = resolveAuthorityArtifactPath(kind, { rootDir: root });
    if (kind === "manifest") authorityTier = resolved.source;
    remove.push({ path: resolved.relPath, kind, type: "file", existed: resolved.exists });
    const artifact = AUTHORITY_ARTIFACTS[kind];
    const alternate = resolved.source === "neutral" ? artifact.legacy : artifact.neutral;
    if (existsSync(join(root, alternate))) {
      keep.push({
        path: alternate,
        kind,
        type: "file",
        existed: true,
        reason: "compatibility artifact retained at the non-selected authority tier; a reset removes only the tier currently resolved as authoritative",
      });
    }
  }

  // The handover path is CONFIGURABLE (calibration.handover); docs/state.md
  // is the documented default only, never a fact. A malformed or absent
  // calibration falls back to the default rather than refusing the plan --
  // consistent with resolveAuthorityArtifactPath never becoming stricter by
  // being routed.
  let handoverPath = DEFAULT_HANDOVER_PATH;
  const calibrationArtifact = resolveAuthorityArtifactPath("calibration", { rootDir: root });
  if (calibrationArtifact.exists) {
    try {
      const parsed = JSON.parse(readFileSync(calibrationArtifact.path, "utf8"));
      if (isObject(parsed) && isSafeHandoverPath(parsed.handover)) handoverPath = parsed.handover;
    } catch { /* malformed calibration: fall back to the documented default */ }
  }
  remove.push({ path: handoverPath, kind: "handover", type: "file", existed: existsSync(join(root, handoverPath)) });

  // Private Pipeline state (`.git/agent-pipeline/`) is a directory the
  // Pipeline creates wholesale -- the one case where a directory, not a
  // file, is a valid `remove` entry. It is only removed when it resolves
  // INSIDE this project root: a linked worktree's Git common directory is
  // shared with other worktrees, and a project-scoped reset must not delete
  // state another worktree still depends on.
  const commonDir = resolveGitCommonDir(root);
  if (commonDir) {
    const ordinaryGitDir = join(root, ".git");
    let isOrdinary = false;
    if (existsSync(ordinaryGitDir)) {
      try { isOrdinary = realpathSync(ordinaryGitDir) === commonDir; } catch { isOrdinary = false; }
    }
    const privateDir = join(commonDir, "agent-pipeline");
    if (isOrdinary) {
      remove.push({ path: ".git/agent-pipeline", kind: "privateState", type: "directory", existed: existsSync(privateDir) });
    } else {
      keep.push({
        path: privateDir,
        kind: "privateState",
        type: "directory",
        existed: existsSync(privateDir),
        reason: "private Pipeline state resolves outside this project root (a linked worktree's Git common directory); a project-scoped reset does not remove state shared with other worktrees",
      });
    }
  }

  // PROVISIONAL KICKOFF ANCHORS (R3). An anchor the Pipeline seeded for an
  // attempted kickoff is removed like `.git/agent-pipeline`: the whole
  // directory, matched by SHAPE (see KICKOFF_ANCHOR_DIRNAME_RE above), never
  // a startsWith string test (AC-1).
  //
  // AC-4 DECISION, STATED HERE. A PROMOTED anchor -- one already carrying
  // the supersession marker a promotion writes, naming its successor -- is
  // `keep`, not `remove`. It is a provenance record, not litter from a
  // FAILED attempt: the promotion transaction itself declined to remove it
  // when it retired the anchor (see the docstring at
  // onboarding-continuity.mjs:4331 -- "Removal was the other route and this
  // transaction cannot offer it honestly"), and this Pipeline's pattern
  // elsewhere is append-only provenance (HISTORY entries, the discarded-
  // feature record) over silent deletion of a record naming what replaced
  // it. An UNPROMOTED anchor carries no such record -- removing it erases
  // nothing but the litter itself, which is the whole point of this item.
  const specsDir = join(root, "specs");
  if (existsSync(specsDir)) {
    let specsEntries = [];
    try { specsEntries = readdirSync(specsDir, { withFileTypes: true }); } catch { specsEntries = []; }
    const anchorDirs = specsEntries
      .filter((entry) => entry.isDirectory() && KICKOFF_ANCHOR_DIRNAME_RE.test(entry.name))
      .map((entry) => entry.name)
      .sort();
    for (const name of anchorDirs) {
      const anchorPath = `specs/${name}`;
      const promoted = existsSync(join(specsDir, name, KICKOFF_SUPERSESSION_MARKER_BASENAME));
      if (promoted) {
        keep.push({
          path: anchorPath,
          kind: "kickoffAnchorPromoted",
          type: "directory",
          existed: true,
          reason: "a promoted kickoff anchor carries the supersession marker naming its successor; it is a provenance record, not litter from a failed attempt, so a reset preserves it",
        });
      } else {
        remove.push({ path: anchorPath, kind: "kickoffAnchor", type: "directory", existed: true });
      }
    }
  }

  // RUNTIME-PROJECTION TARGETS (R2B). Derived from the unfiltered manifest --
  // never a `.claude/`- or `.codex/`-only literal -- so a future filter that
  // narrowed the reset to one runner would fail the runner-neutral test
  // rather than silently ship. `claimedPaths` is exactly the set of paths
  // the authority loop above already put in `remove` or `keep`; skipping
  // those keeps every path classified exactly once (see the header comment).
  const claimedPaths = new Set([...remove, ...keep].map((entry) => entry.path));
  const runtimeTargets = [...loadRuntimeProjectionV3OwnedKeys().targets]
    .sort((left, right) => left.path.localeCompare(right.path));
  for (const target of runtimeTargets) {
    if (claimedPaths.has(target.path)) continue;
    const existed = existsSync(join(root, target.path));
    const provenance = classifyRuntimeProjectionProvenance(target);
    if (provenance === "preserve") {
      // `preserve-only`: the Pipeline projects nothing into this file --
      // it is the runner's own configuration, never touched by a reset.
      keep.push({
        path: target.path,
        kind: "runtimePreserveOnly",
        type: "file",
        existed,
        reason: "runtime-projection target the Pipeline owns no key of; the runner's own configuration, left untouched by a reset",
      });
    } else if (provenance === "file") {
      // Whole-file-seed projection: the entire file is Pipeline prose (see
      // classifyRuntimeProjectionProvenance), so removal targets the file,
      // never a keys-level entry that would leave a Pipeline-authored stub
      // behind.
      remove.push({
        path: target.path,
        kind: "runtimeSeededFile",
        type: "file",
        existed,
      });
    } else {
      // Keys-patch projection: name the exact owned keys, never the file --
      // the file is project-owned. `apply` (R2C) does not implement key
      // surgery; a surviving entry of this kind is a typed refusal.
      remove.push({
        path: target.path,
        kind: "runtimeOwnedKeys",
        type: "keys",
        existed,
        ownedKeys: [...target.ownedKeys],
      });
    }
  }

  const canonical = {
    schema: PROJECT_RESET_PLAN_SCHEMA,
    status: "ready",
    code: null,
    root,
    authorityTier,
    remove,
    keep,
    neverTouched: NEVER_TOUCHED,
  };
  return { ...canonical, planSha256: canonicalSha256(canonical) };
}

function refuseApply(code, root, authorityTier = null) {
  return {
    schema: PROJECT_RESET_APPLY_RESULT_SCHEMA,
    status: "refused",
    code,
    root,
    authorityTier,
    remove: [],
    keep: [],
    neverTouched: NEVER_TOUCHED,
    planSha256: null,
  };
}

function fsyncDirectory(path) {
  let fd;
  try {
    fd = openSync(path, "r");
    fsyncSync(fd);
  } catch (error) {
    if (!(process.platform === "win32"
      && ["EPERM", "EINVAL", "EISDIR", "ENOTSUP", "EBADF"].includes(error?.code))) {
      throw error;
    }
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function writeControlFileSynced(finalPath, bytes) {
  const temporary = `${finalPath}.tmp`;
  let fd;
  try {
    fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC, 0o600);
    writeFileSync(fd, bytes);
    fsyncSync(fd);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  return temporary;
}

/**
 * Walk every path segment from `root` to `root/relPath`, refusing (rather
 * than following) a symlink anywhere in the chain -- the parent may have
 * become a symlink between plan and apply, not only the target itself
 * (AC-6). Returns "ok", "symlink", or "vanished" (a segment no longer
 * exists or is no longer the expected kind -- treated as "already gone
 * since the plan was derived", never as a refusal on its own).
 */
function physicalTargetState(root, relPath) {
  const parts = relPath.split("/");
  let cursor = root;
  for (let index = 0; index < parts.length; index += 1) {
    cursor = join(cursor, parts[index]);
    let info;
    try { info = lstatSync(cursor); } catch { return "vanished"; }
    if (info.isSymbolicLink()) return "symlink";
    const isLast = index === parts.length - 1;
    if (!isLast && !info.isDirectory()) return "vanished";
  }
  return "ok";
}

/**
 * Apply a project reset, atomically or not at all (R2D). See the module
 * header for the four-stage mechanism: digest-bound plan re-derivation,
 * a durably-flushed journal naming exactly what will move, one rename per
 * target into a quarantine directory inside the root, then quarantine
 * removal and journal removal as the last two acts. `deps.crashAt` (one of
 * RESET_APPLY_FAULT_STAGES) and `deps.crashAtOccurrence` (for "move", which
 * fires once per moved target) exist for the fault-injection test suite
 * only -- production callers never set them.
 */
export function applyProjectReset({ rootDir, expectedPlanSha256, deps = {} } = {}) {
  if (typeof rootDir !== "string" || rootDir.length === 0) {
    return refuseApply("PROJECT-RESET-APPLY-ROOT-REQUIRED", null);
  }
  if (!SHA256_RE.test(expectedPlanSha256 ?? "")) {
    return refuseApply("PROJECT-RESET-APPLY-DIGEST-REQUIRED", null);
  }
  let root;
  try {
    const requested = resolve(rootDir);
    const info = lstatSync(requested);
    if (info.isSymbolicLink() || !info.isDirectory()) {
      return refuseApply("PROJECT-RESET-APPLY-ROOT-UNSAFE", requested);
    }
    root = realpathSync(requested);
  } catch {
    return refuseApply("PROJECT-RESET-APPLY-ROOT-UNAVAILABLE", null);
  }

  const fault = (point, occurrence) => {
    if (deps.crashAt === point
      && (deps.crashAtOccurrence === undefined || deps.crashAtOccurrence === occurrence)) {
      const error = new Error(`simulated fault at ${point}`);
      error.code = "PROJECT-RESET-APPLY-SIMULATED-FAULT";
      throw error;
    }
  };

  // Replay: a prior successful `apply` already wrote a completion receipt.
  // Honored ONLY for the same digest -- a different digest against a
  // receipted root is a distinct condition (a different reset already ran
  // here), never approximated as either "already done" or a bare refusal.
  const receiptPath = join(root, RESET_RECEIPT_BASENAME);
  if (existsSync(receiptPath)) {
    let receipt = null;
    try { receipt = JSON.parse(readFileSync(receiptPath, "utf8")); } catch { receipt = null; }
    if (isObject(receipt) && receipt.schema === PROJECT_RESET_APPLY_RESULT_SCHEMA
      && receipt.planSha256 === expectedPlanSha256) {
      return { ...receipt, status: "replayed", code: null };
    }
    return refuseApply("PROJECT-RESET-APPLY-RECEIPT-DIGEST-MISMATCH", root, receipt?.authorityTier ?? null);
  }

  const journalPath = join(root, RESET_JOURNAL_BASENAME);
  const quarantineDir = join(root, RESET_QUARANTINE_DIRNAME);
  let journal;

  if (existsSync(journalPath)) {
    let parsed = null;
    try { parsed = JSON.parse(readFileSync(journalPath, "utf8")); } catch { parsed = null; }
    if (!isObject(parsed) || parsed.schema !== RESET_JOURNAL_SCHEMA || parsed.root !== root) {
      return refuseApply("PROJECT-RESET-APPLY-JOURNAL-UNREADABLE", root);
    }
    if (parsed.planSha256 !== expectedPlanSha256) {
      return refuseApply("PROJECT-RESET-APPLY-JOURNAL-DIGEST-MISMATCH", root, parsed.authorityTier ?? null);
    }
    journal = parsed;
  } else {
    const plan = planProjectReset({ rootDir: root });
    if (plan.status !== "ready") return refuseApply(plan.code, plan.root, plan.authorityTier);
    if (plan.planSha256 !== expectedPlanSha256) {
      return refuseApply("PROJECT-RESET-APPLY-DIGEST-MISMATCH", root, plan.authorityTier);
    }
    if (plan.remove.some((entry) => entry.type === "keys")) {
      return refuseApply("PROJECT-RESET-APPLY-KEYS-UNIMPLEMENTED", root, plan.authorityTier);
    }
    for (const reserved of [RESET_QUARANTINE_DIRNAME, RESET_JOURNAL_BASENAME, RESET_RECEIPT_BASENAME]) {
      const collides = (entry) => entry.path === reserved || entry.path.startsWith(`${reserved}/`);
      if (plan.remove.some(collides) || plan.keep.some(collides)) {
        return refuseApply("PROJECT-RESET-APPLY-CONTROL-COLLISION", root, plan.authorityTier);
      }
    }
    const remove = [];
    for (const entry of plan.remove) {
      if (!entry.existed) { remove.push(entry); continue; }
      const state = physicalTargetState(root, entry.path);
      if (state === "symlink") return refuseApply("PROJECT-RESET-APPLY-SYMLINK-REFUSED", root, plan.authorityTier);
      remove.push(state === "vanished" ? { ...entry, existed: false } : entry);
    }
    journal = {
      schema: RESET_JOURNAL_SCHEMA,
      root,
      planSha256: expectedPlanSha256,
      authorityTier: plan.authorityTier,
      remove,
      keep: plan.keep,
      neverTouched: plan.neverTouched,
    };
    const bytes = Buffer.from(`${JSON.stringify(journal, null, 2)}\n`, "utf8");
    const temporary = writeControlFileSynced(journalPath, bytes);
    try {
      fault("journal-temp-fsync");
      renameSync(temporary, journalPath);
    } catch (error) {
      if (error?.code === "PROJECT-RESET-APPLY-SIMULATED-FAULT" && !existsSync(journalPath)) {
        try { unlinkSync(temporary); } catch { /* best effort: orphaned temp file, harmless litter */ }
      }
      throw error;
    }
    fault("journal-rename");
    fsyncDirectory(root);
    fault("journal-directory-fsync");
  }

  const moveable = journal.remove
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.existed && entry.type !== "keys");
  const quarantineAlreadyExists = existsSync(quarantineDir);
  const anyStillAtOrigin = moveable.some(({ entry }) => existsSync(join(root, entry.path)));
  if (quarantineAlreadyExists || anyStillAtOrigin) {
    if (!quarantineAlreadyExists) mkdirSync(quarantineDir, { mode: 0o700 });
    for (const { entry, index } of moveable) {
      const source = join(root, entry.path);
      const destination = join(quarantineDir, String(index));
      const sourceExists = existsSync(source);
      const destinationExists = existsSync(destination);
      if (sourceExists && destinationExists) {
        return refuseApply("PROJECT-RESET-APPLY-STATE-INDETERMINATE", root, journal.authorityTier);
      }
      if (sourceExists) {
        renameSync(source, destination);
        fault("move", index);
      }
    }
    fault("quarantine-remove");
    rmSync(quarantineDir, { recursive: true, force: false });
    fsyncDirectory(root);
  }

  if (existsSync(journalPath)) {
    fault("journal-remove");
    unlinkSync(journalPath);
    fsyncDirectory(root);
  }

  const result = {
    schema: PROJECT_RESET_APPLY_RESULT_SCHEMA,
    status: "applied",
    code: null,
    root,
    authorityTier: journal.authorityTier,
    remove: journal.remove,
    keep: journal.keep,
    neverTouched: journal.neverTouched,
    planSha256: expectedPlanSha256,
  };
  const receiptBytes = Buffer.from(`${JSON.stringify(result, null, 2)}\n`, "utf8");
  const temporaryReceipt = writeControlFileSynced(receiptPath, receiptBytes);
  renameSync(temporaryReceipt, receiptPath);
  fsyncDirectory(root);
  return result;
}

function parseArgs(argv) {
  const command = argv[0];
  if (command !== "plan" && command !== "apply") {
    return { error: "the only supported commands are 'plan' and 'apply'" };
  }
  const values = { command };
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--root") {
      const value = argv[index + 1];
      if (value === undefined) return { error: "--root requires a value" };
      values.root = value;
      index += 1;
    } else if (flag === "--plan-sha256" && command === "apply") {
      const value = argv[index + 1];
      if (value === undefined) return { error: "--plan-sha256 requires a value" };
      values.planSha256 = value;
      index += 1;
    } else {
      return { error: `unknown argument: ${flag}` };
    }
  }
  if (!values.root) return { error: "--root is required" };
  if (command === "apply" && !values.planSha256) return { error: "--plan-sha256 is required" };
  return values;
}

if (isDirectInvocation(import.meta.url)) {
  const parsed = parseArgs(process.argv.slice(2));
  const usage = "Usage: node project-reset.mjs plan --root <project-dir>\n"
    + "       node project-reset.mjs apply --root <project-dir> --plan-sha256 <digest>\n";
  if (parsed.error) {
    process.stderr.write(`${parsed.error}\n${usage}`);
    process.exitCode = 2;
  } else if (parsed.command === "plan") {
    const result = planProjectReset({ rootDir: parsed.root });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.status === "ready" ? 0 : 1;
  } else {
    const result = applyProjectReset({ rootDir: parsed.root, expectedPlanSha256: parsed.planSha256 });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = (result.status === "applied" || result.status === "replayed") ? 0 : 1;
  }
}
