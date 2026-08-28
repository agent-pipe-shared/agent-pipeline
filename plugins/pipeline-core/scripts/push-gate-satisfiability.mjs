#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * push-gate-satisfiability.mjs -- NVA-B-PUSHPREFLIGHT.
 *
 * Answers ONE question before any human signature is requested for the push
 * gate: is it satisfiable RIGHT NOW? Strictly READ-ONLY -- it never writes,
 * never mutates the preimage it inspects, never dirties the working tree.
 *
 * WHY THIS EXISTS. A human signature is the most expensive resource in this
 * system: it needs a person, an external key, and a bounded time window.
 * Two separate incidents motivate this tool. In the greenfield run a
 * signature was obtained BEFORE the verify contract was fixed, and expired
 * unused while the deadlock was worked through. In this repository a live PO
 * passphrase entry was burned on a human-guard-override capability armed
 * against an already-closed window
 * (backlog/items/2026-08-28-an-expired-override-is-armed-instead-of-refused.md):
 * `authorizeHumanGuardOverrideBySignature()` (`lib/human-guard-override.mjs`)
 * used to copy a plan's `expiresAt` into the capability WITHOUT comparing it
 * to now, so it reported `{"status":"armed"}` for a window that had already
 * closed; only `consumeHumanGuardOverride()` checked, at retry time, and the
 * retry then failed looking exactly like a first denial. Commit `87a94007`
 * fixed this at both arming routes (`authorizeHumanGuardOverride()` and
 * `authorizeHumanGuardOverrideBySignature()`) by refusing to arm a capability
 * past its own plan window in the first place. Capabilities armed BEFORE
 * that fix can still exist on disk, still self-reporting `"armed"` with a
 * closed window -- this tool's `signature-window` check independently
 * re-derives the same expiry comparison, advisory-only and read-only, so
 * such a legacy hazard is visible BEFORE a human is asked to sign anything,
 * not discovered by burning a signature on it.
 *
 * FAMILY, NOT DUPLICATION. `push-prepare.mjs` (NVA-PUSH-PREPARE) already
 * answers a similar-shaped question, but it requires `--by/--remote
 * /--destination` and additionally checks the security-evidence binding and
 * builds the ready-to-run `authorize-critical` command -- it is the tool a
 * session runs once it already knows who is pushing where. This tool answers
 * a narrower, earlier question -- "is it even worth constructing that
 * request yet" -- with no flags beyond `--root`, so four of its five checks
 * REUSE `push-prepare.mjs`'s own exported precondition functions
 * (`checkEvidenceFreshness`, `checkCriticalHumanProofPolicy`,
 * `checkPushThreatModel`) rather than re-implementing them, and add typed
 * status classification on top. The verify-contract-configured check and the
 * signature-window check are new: neither has an equivalent in
 * `push-prepare.mjs` today.
 *
 * Usage:
 *   node push-gate-satisfiability.mjs --root <dir>
 *
 * Exit 0: satisfiable. Exit 1: not satisfiable (at least one check failed).
 * Exit 2: usage error.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { resolveAuthorityArtifactPath } from "../lib/project-authority.mjs";
import { VERIFY_EVIDENCE_DEFAULT_PATH } from "../lib/verify-evidence-path.mjs";
import {
  checkCriticalHumanProofPolicy,
  checkEvidenceFreshness,
  checkPushThreatModel,
  resolveHeadCommit,
} from "./push-prepare.mjs";

export const SCHEMA = "pipeline.push-gate-satisfiability.v1";
export const USAGE = "Usage: push-gate-satisfiability.mjs --root <dir>";

/**
 * The exact marker text `UNCONFIGURED_VERIFY` (`lib/project-onboarding-v3.mjs`) always
 * carries. That constant is not exported, so this is a substring match against its stable,
 * documented wording rather than a private import -- a real project verify command
 * legitimately mentioning "not configured" elsewhere would need to reproduce this entire
 * sentence to false-positive here, which is not a realistic accident.
 */
const UNCONFIGURED_VERIFY_MARKER = "the verify contract of this project is not configured";

/**
 * How much room a signing ceremony (read the command, run it, type the passphrase, retry
 * the consuming call) realistically needs. An armed window closing sooner than this is
 * treated the same as already closed: starting a ceremony against it is not meaningfully
 * safer than starting one against a window that already lapsed.
 */
const SIGNATURE_WINDOW_NEAR_EXPIRY_MS = 5 * 60 * 1000;

export function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (typeof flag !== "string" || !flag.startsWith("--") || typeof value !== "string" || value.startsWith("--")) {
      return { error: USAGE };
    }
    values[flag.slice(2)] = value;
  }
  if (typeof values.root !== "string" || values.root.trim() === "") return { error: `${USAGE}\n--root is required.` };
  return { root: resolve(values.root) };
}

/** Read-only: resolves the project calibration's `verify` field and classifies it. Never runs it. */
export function checkVerifyContractConfigured(dir, deps = {}) {
  const id = "verify-contract-configured";
  const resolveArtifact = deps.resolveAuthorityArtifactPath ?? resolveAuthorityArtifactPath;
  let artifact;
  try {
    artifact = resolveArtifact("calibration", { rootDir: dir });
  } catch {
    return { id, status: "missing", ok: false, message: "project calibration could not be resolved." };
  }
  if (!artifact?.exists) {
    return { id, status: "missing", ok: false, message: "no project calibration found; nothing configures a verify command." };
  }
  let parsed;
  try {
    parsed = JSON.parse((deps.readFile ?? readFileSync)(artifact.path, "utf8"));
  } catch {
    return { id, status: "missing", ok: false, message: `${artifact.path} is not valid JSON.` };
  }
  const command = parsed?.verify;
  if (typeof command !== "string" || command.trim() === "") {
    return { id, status: "missing", ok: false, message: "project calibration names no verify command." };
  }
  if (command.includes(UNCONFIGURED_VERIFY_MARKER)) {
    return {
      id, status: "placeholder", ok: false,
      message: "the configured verify command is still the plugin's UNCONFIGURED_VERIFY placeholder -- "
        + "replace project/pipeline.json's verify field with this project's real verification command before requesting a signature.",
    };
  }
  return { id, status: "configured", ok: true, message: `a real verify command is configured: ${command}` };
}

/**
 * Reuses `checkEvidenceFreshness()` from `push-prepare.mjs` for the actual freshness
 * contract (exists, exitCode 0, commit === HEAD) and classifies its fixed, documented
 * message shapes into a distinct typed status -- never re-deriving the freshness logic
 * itself.
 */
export function checkVerifyEvidenceBound(dir, headCommit, deps = {}) {
  const checker = deps.checkEvidenceFreshness ?? checkEvidenceFreshness;
  const check = checker("verify-evidence-bound", VERIFY_EVIDENCE_DEFAULT_PATH, dir, headCommit, deps);
  let status;
  if (check.ok) status = "fresh-and-bound";
  else if (check.message.includes("is missing or unreadable")) status = "missing";
  else if (check.message.includes("exitCode=")) status = "verify-failed";
  else if (check.message.includes("is stale (HEAD is")) status = "stale-commit";
  else status = "unknown-failure";
  return { id: "verify-evidence-bound", status, ok: check.ok, message: check.message, remedy: check.remedy };
}

/** Reuses `checkCriticalHumanProofPolicy()` from `push-prepare.mjs`, typed. */
export function checkTrustAnchorPresent(dir, deps = {}) {
  const checker = deps.checkCriticalHumanProofPolicy ?? checkCriticalHumanProofPolicy;
  const check = checker(dir, deps);
  let status;
  if (!check.ok) {
    if (check.message.includes("could not be read")) status = "policy-unreadable";
    else if (check.message.includes("NOT a member")) status = "not-member";
    else status = "unsatisfied";
  } else if (check.message.includes("posture: unrestricted")) {
    status = "unrestricted";
  } else if (check.message.includes("IS a member")) {
    status = "pinned-member";
  } else if (check.message.includes("could not be resolved") || check.message.includes("no local authority record exists yet")) {
    status = "directory-unresolved";
  } else {
    status = "satisfied";
  }
  return { id: "trust-anchor-present", status, ok: check.ok, message: check.message, remedy: check.remedy };
}

/** Reuses `checkPushThreatModel()` from `push-prepare.mjs`, typed. */
export function checkPushThreatModelMaterialized(dir, deps = {}) {
  const checker = deps.checkPushThreatModel ?? checkPushThreatModel;
  const check = checker(dir, deps);
  return { id: "push-threat-model-materialized", status: check.ok ? "present" : "absent", ok: check.ok, message: check.message, remedy: check.remedy };
}

function gitOutput(dir, args, deps) {
  const spawn = deps.spawn ?? spawnSync;
  const result = spawn("git", ["-C", dir, ...args], { encoding: "utf8" });
  if (result.error || result.status !== 0 || typeof result.stdout !== "string") return null;
  return result.stdout.trim();
}

/** Read-only. Never the authoritative resolver (that lives in `human-guard-override.mjs`'s
 * private `topology()`) -- just enough to locate the same well-known store path for an
 * advisory, best-effort read. */
export function resolveGitCommonDir(dir, deps = {}) {
  if (typeof deps.gitCommonDir === "function") return deps.gitCommonDir(dir);
  const raw = gitOutput(dir, ["rev-parse", "--git-common-dir"], deps);
  if (raw === null) return null;
  try {
    return (deps.realpath ?? realpathSync)(resolve(dir, raw));
  } catch {
    return null;
  }
}

/**
 * Advisory-only, read-only re-derivation of the expiry comparison `consumeHumanGuardOverride()`
 * performs at retry time (`lib/human-guard-override.mjs`): whether an armed capability's
 * `expiresAt` has already passed, or is about to. Both arming routes now refuse to arm a
 * capability past its own plan window in the first place (commit `87a94007`), but a capability
 * armed BEFORE that fix can still exist on disk, still self-reporting `"armed"` with a closed
 * window (confirmed live 2026-08-28) -- this check catches exactly that legacy case. Reads the
 * capability store directly (no MAC verification -- that is the authoritative system's own
 * integrity concern at consumption time, not this preflight's; a record this function cannot
 * parse or that carries no armed/expiresAt shape is skipped, never treated as a hazard it
 * cannot support). Never the deciding word on whether a capability is valid -- only on whether
 * spending a fresh signature into this store right now is safe.
 */
export function checkSignatureWindow(dir, deps = {}) {
  const id = "signature-window";
  const resolveCommonDir = deps.resolveGitCommonDir ?? resolveGitCommonDir;
  const gitCommonDir = resolveCommonDir(dir, deps);
  if (!gitCommonDir) {
    return {
      id, status: "unreadable", ok: true,
      message: "git-common-dir could not be resolved; no pending human-guard-override ceremony could be inspected (advisory-only, non-blocking).",
    };
  }
  const capabilitiesDir = join(gitCommonDir, "agent-pipeline", "human-guard-overrides", "capabilities");
  const readdir = deps.readdir ?? readdirSync;
  let entries;
  try {
    entries = readdir(capabilitiesDir).filter((name) => name.endsWith(".json")).sort();
  } catch {
    return { id, status: "none-pending", ok: true, message: "no human-guard-override capability store found; no ceremony is currently in flight." };
  }
  const readFile = deps.readFile ?? readFileSync;
  const nowMs = (deps.now ?? Date.now)();
  let selected = { severity: 0, status: "none-pending", ok: true, message: "no armed human-guard-override capability was found; no ceremony is currently in flight." };
  for (const name of entries) {
    let capability;
    try {
      capability = JSON.parse(readFile(join(capabilitiesDir, name), "utf8"));
    } catch {
      continue; // unreadable/malformed -- advisory-only, never a false positive from a record this function cannot even parse
    }
    if (!capability || capability.status !== "armed" || typeof capability.expiresAt !== "string") continue;
    const expiresAtMs = Date.parse(capability.expiresAt);
    if (!Number.isFinite(expiresAtMs)) continue;
    const remainingMs = expiresAtMs - nowMs;
    let candidate;
    if (remainingMs <= 0) {
      candidate = {
        severity: 3, status: "expired-armed-capability", ok: false,
        message: `${name} self-reports status "armed" but its window closed at ${capability.expiresAt} `
          + `(now ${new Date(nowMs).toISOString()}); consuming or signing against it would burn a human signature for nothing -- `
          + "this is a capability armed before commit 87a94007 fixed arming to refuse past its own plan window; only "
          + "consumeHumanGuardOverride() still checks such a legacy capability, at retry time (plugins/pipeline-core/lib/"
          + "human-guard-override.mjs). Re-plan and re-sign with a fresh window instead.",
      };
    } else if (remainingMs <= SIGNATURE_WINDOW_NEAR_EXPIRY_MS) {
      candidate = {
        severity: 2, status: "near-expiry", ok: false,
        message: `${name} is armed but its window closes at ${capability.expiresAt}, `
          + `${Math.round(remainingMs / 1000)}s from now -- too little room left to complete a human ceremony `
          + "(read the command, run it, retry) safely; treat as unsatisfiable until re-armed with a fresh window.",
      };
    } else {
      candidate = {
        severity: 1, status: "healthy", ok: true,
        message: `${name} is armed with ${Math.round(remainingMs / 1000)}s remaining before its window closes at ${capability.expiresAt}.`,
      };
    }
    if (candidate.severity > selected.severity) selected = candidate;
  }
  return { id, status: selected.status, ok: selected.ok, message: selected.message };
}

/**
 * Assembles the one typed verdict. Strictly read-only: every check above only reads files
 * and spawns read-only git subcommands; nothing here writes, and nothing mutates the
 * preimage (HEAD, tree, or any evidence/state file) it inspects.
 */
export function assessPushGateSatisfiability(argv, deps = {}) {
  const parsed = parseArgs(argv);
  if (parsed.error) return { ok: false, error: parsed.error };
  const dir = parsed.root;
  const headCommitResolver = deps.resolveHeadCommit ?? resolveHeadCommit;
  const headCommit = headCommitResolver(dir, deps);

  const checks = [];
  checks.push(checkVerifyContractConfigured(dir, deps));
  if (headCommit) {
    checks.push(checkVerifyEvidenceBound(dir, headCommit, deps));
  } else {
    checks.push({
      id: "verify-evidence-bound", status: "head-unresolved", ok: false,
      message: "HEAD commit could not be determined (git rev-parse HEAD failed); verify evidence cannot be checked against an unknown commit.",
    });
  }
  checks.push(checkTrustAnchorPresent(dir, deps));
  checks.push(checkPushThreatModelMaterialized(dir, deps));
  checks.push(checkSignatureWindow(dir, deps));

  const satisfiable = checks.every((check) => check.ok);
  return {
    ok: true,
    report: { schema: SCHEMA, root: dir, headCommit: headCommit ?? null, satisfiable, checks },
  };
}

if (isDirectInvocation(import.meta.url)) {
  const result = assessPushGateSatisfiability(process.argv.slice(2));
  if (!result.ok) {
    process.stderr.write(`${result.error}\n`);
    process.exit(2);
  }
  process.stdout.write(`${JSON.stringify(result.report, null, 2)}\n`);
  process.exit(result.report.satisfiable ? 0 : 1);
}
