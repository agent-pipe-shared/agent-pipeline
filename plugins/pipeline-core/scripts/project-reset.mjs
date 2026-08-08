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
 * or a directory the Pipeline creates wholesale (`.git/agent-pipeline/` is
 * the only such case; the individual seeded file is named, never a
 * container the Pipeline merely writes into, e.g. `docs/` or `specs/`).
 * `keep`: paths inside the Pipeline's own footprint the reset deliberately
 * leaves -- a compatibility copy at the authority tier that is NOT currently
 * selected (retained by design, see project-authority.mjs), and private
 * state that resolves outside this project root (a linked worktree's Git
 * common directory, shared with other worktrees). `neverTouched`: fixed
 * categories the reset does not enter at all -- this repository's own git
 * history, the adopter's own files, and any design package under `specs/`.
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
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import {
  AUTHORITY_ARTIFACTS,
  LEGACY_MANIFEST,
  NEUTRAL_MANIFEST,
  resolveAuthorityArtifactPath,
} from "../lib/project-authority.mjs";

export const PROJECT_RESET_PLAN_SCHEMA = "pipeline.project-reset-plan.v1";

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
    description: "any design package under specs/, including a PRD and specification a kickoff or promotion seeded there",
  }),
]);

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

function parseArgs(argv) {
  if (argv[0] !== "plan") return { error: "the only supported command is 'plan'" };
  const values = {};
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--root") {
      const value = argv[index + 1];
      if (value === undefined) return { error: "--root requires a value" };
      values.root = value;
      index += 1;
    } else {
      return { error: `unknown argument: ${flag}` };
    }
  }
  if (!values.root) return { error: "--root is required" };
  return values;
}

if (isDirectInvocation(import.meta.url)) {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) {
    process.stderr.write(`${parsed.error}\nUsage: node project-reset.mjs plan --root <project-dir>\n`);
    process.exitCode = 2;
  } else {
    const result = planProjectReset({ rootDir: parsed.root });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.status === "ready" ? 0 : 1;
  }
}
