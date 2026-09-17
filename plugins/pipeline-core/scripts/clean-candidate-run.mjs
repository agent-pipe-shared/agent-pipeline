#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * clean-candidate-run.mjs — single entry point for the detached-worktree
 * clean-candidate route (backlog:
 * a-checkout-that-cannot-be-clean-defeats-every-cleanliness-gate).
 *
 * Two tracked files in the primary checkout (`.claude/settings.json`,
 * `project/resume-hint.json`) are permanently runtime-modified and never
 * committed, so any tool that gates on a clean working tree
 * (`harness/scripts/verify.mjs`'s candidate preflight,
 * `po-approval-request.mjs`'s `observeCleanCandidate`) refuses to run from
 * the primary tree by construction — not because anything is wrong with the
 * candidate. This entry point creates a detached worktree at an exact
 * candidate commit by reusing `../lib/worktree-lifecycle.mjs`'s
 * `createDetachedWorktree` (the same function `worktree-create.mjs`'s CLI
 * itself calls — worktree creation is never reimplemented here), runs the
 * requested command inside that worktree, copies back the complete known
 * evidence artifact set (`evidence/verify-latest.json` plus the
 * `security-latest` trio — whichever the command actually produced), and
 * removes the worktree via the paired teardown (`cleanupSession`) —
 * replacing the manually-remembered `.git/phx-verify` procedure (and its
 * two documented failure modes: a dirty-tree refusal and a partial artifact
 * copy) with one supported command.
 *
 * Usage:
 *   clean-candidate-run.mjs --repo <checkout> --oid <candidate-ref>
 *     [--purpose <label>] [--runner claude|codex] -- <command> [args...]
 *
 * A pre-existing worktree at the exact canonical (purpose, oid) target —
 * only reachable from an earlier interrupted run of this exact command — is
 * reused rather than treated as a conflict, and is removed with a direct
 * `git worktree remove` afterward, since no manifest resource was
 * registered for it under this invocation's own session.
 *
 * --runner names the invoking runner explicitly for the project-onboarding
 * readiness gate (ADR-0051), mirroring worktree-create.mjs; an explicit
 * --runner always wins, and absent one this CLI entry boundary derives it
 * from CLAUDECODE in its own environment.
 */
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

import {
  ProjectOnboardingReadyError,
  requireProjectOnboardingReady,
} from "../lib/project-onboarding-ready-gate.mjs";
import { checkSecurityCompleteness } from "../lib/security-completeness-gate.mjs";
import { verifyEvidenceSatisfiesBoundary } from "../lib/verify-selection.mjs";
import {
  WorktreeLifecycleError,
  canonicalDetachedTarget,
  canonicalJson,
  cleanupSession,
  createDetachedWorktree,
  discoverRepository,
  runGit,
} from "../lib/worktree-lifecycle.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { gateConfig, loadManifestSafe } from "../lib/manifest.mjs";
import { parseArgs as parsePushInitArgs } from "./push-init.mjs";

const USAGE = `Usage:
  clean-candidate-run.mjs --repo <checkout> --oid <candidate-ref> [--purpose <label>] [--runner claude|codex] -- <command> [args...]

Creates (or reuses) a detached worktree at the exact candidate commit, runs
<command> inside it with that worktree as its working directory, copies back
the complete known evidence artifact set (evidence/verify-latest.json,
evidence/security-latest.json, evidence/security-latest.v2.json,
evidence/security-latest.v2.verdict.json -- whichever <command> actually
produced) into <checkout>, then removes the worktree.
`;

const RUNNERS = new Set(["claude", "codex"]);
const KNOWN_ARTIFACTS = [
  "evidence/verify-latest.json",
  "evidence/security-latest.json",
  "evidence/security-latest.v2.json",
  "evidence/security-latest.v2.verdict.json",
];

const PUSH_INIT_EVIDENCE = [
  "evidence/verify-latest.json",
  "evidence/security-latest.json",
  "evidence/security-latest.v2.json",
  "evidence/security-latest.v2.verdict.json",
];
const MAX_EVIDENCE_BYTES = 16 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

function validSha256(value) {
  return typeof value === "string" && SHA256.test(value);
}

function safeArtifactPath(root, relPath) {
  const path = resolve(root, relPath);
  if (relative(root, path).startsWith("..") || relative(root, path) === "") {
    fail("CCR-EVIDENCE-PATH", `evidence path escapes its repository root: ${relPath}`);
  }
  return path;
}

function readTrustedJson(root, relPath) {
  const path = safeArtifactPath(root, relPath);
  let first;
  try {
    first = lstatSync(path);
  } catch {
    fail("CCR-EVIDENCE-MISSING", `${relPath} is required for the clean-candidate push-init handoff`);
  }
  if (!first.isFile() || first.isSymbolicLink() || first.size > MAX_EVIDENCE_BYTES || (first.mode & 0o022) !== 0) {
    fail("CCR-EVIDENCE-UNTRUSTED", `${relPath} is not a bounded regular owner-writable evidence file`);
  }
  const raw = readFileSync(path);
  const second = lstatSync(path);
  if (!second.isFile() || second.isSymbolicLink() || second.dev !== first.dev || second.ino !== first.ino || second.size !== first.size) {
    fail("CCR-EVIDENCE-UNTRUSTED", `${relPath} changed while its handoff input was being read`);
  }
  try {
    return { raw, data: JSON.parse(raw.toString("utf8")) };
  } catch {
    fail("CCR-EVIDENCE-INVALID", `${relPath} is not valid JSON`);
  }
}

function exactCandidateBinding(data, oid, tree) {
  return data?.commit === oid
    && data?.candidate?.status === "clean"
    && data.candidate.commit === oid
    && data.candidate.tree === tree;
}

function validateVerifyEvidence(data, oid, tree) {
  if (data?.exitCode !== 0 || data?.tree !== tree || !exactCandidateBinding({ ...data, candidate: data?.candidate?.finish }, oid, tree)
    || data?.candidate?.start?.status !== "clean" || data.candidate.start.commit !== oid || data.candidate.start.tree !== tree
    || data?.candidate?.binding !== "exact" || !verifyEvidenceSatisfiesBoundary(data, "push")) {
    fail("CCR-VERIFY-EVIDENCE-MISMATCH", "verify-latest.json is not a successful, exact push-bound candidate result");
  }
}

function validateSecurityEvidence(data, oid, tree) {
  const candidate = data?.candidate;
  const { payloadSha256, ...payload } = data ?? {};
  if (data?.schema !== "pipeline.security-evidence.v1" || data?.exitCode !== 0 || data?.commit !== oid
    || candidate?.status !== "clean" || candidate?.commit !== oid || candidate?.tree !== tree
    || !validSha256(candidate?.inputSha256) || !validSha256(candidate?.repositorySha256)
    || !Number.isSafeInteger(candidate?.inventory?.entries) || candidate.inventory.entries < 0
    || candidate.inventory.symlinkPolicy !== "reject" || candidate.inventory.submodulePolicy !== "reject"
    || candidate?.snapshot?.method !== "git-detached-worktree.v1" || candidate.snapshot.verifiedBeforeAfter !== true
    || !validSha256(data?.policy?.configurationSha256) || !validSha256(data?.policy?.sha256)
    || !validSha256(payloadSha256) || payloadSha256 !== createHash("sha256").update(canonicalJson(payload)).digest("hex")) {
    fail("CCR-SECURITY-EVIDENCE-MISMATCH", "security-latest.json is not a successful, exact immutable candidate result");
  }
}

function securityGateIsActive(worktreePath) {
  const manifest = loadManifestSafe(worktreePath);
  const gate = gateConfig(manifest, "security");
  return Boolean(gate && gate.mode !== "off");
}

function hasExactlyOneRootArg(command) {
  return command.reduce((count, value) => count + (value === "--root" ? 1 : 0), 0) === 1;
}

/**
 * Only a direct Node invocation of the documented push-init script gains the
 * evidence handoff.  Other clean-candidate commands retain their existing
 * generic behavior.  The script's own strict parser is the authoritative
 * grammar; this wrapper only changes the one root operand from the primary
 * checkout to the newly-created detached candidate.
 */
function preparePushInitCommand(command, repo, worktreePath) {
  if (!(["node", process.execPath].includes(command[0])) || !isAbsolute(command[1] ?? "") || basename(command[1]) !== "push-init.mjs") return null;
  const parsed = parsePushInitArgs(command.slice(2));
  if (parsed.error || parsed.help || !hasExactlyOneRootArg(command)) {
    fail("CCR-PUSH-INIT-ARGV", "push-init handoff requires one valid, non-help push-init argv with exactly one --root");
  }
  if (resolve(parsed.root) !== repo) {
    fail("CCR-PUSH-INIT-ROOT", "push-init handoff may only replace an exact --root naming the primary checkout");
  }
  const remapped = command.map((value, index) => command[index - 1] === "--root" ? worktreePath : value);
  return { command: remapped, needsEvidence: parsed.checkpoint !== true };
}

function writeSeededArtifact(worktreePath, relPath, raw) {
  const destination = safeArtifactPath(worktreePath, relPath);
  const evidenceDir = dirname(destination);
  if (existsSync(evidenceDir) && (!lstatSync(evidenceDir).isDirectory() || lstatSync(evidenceDir).isSymbolicLink())) {
    fail("CCR-EVIDENCE-DESTINATION-UNTRUSTED", `${dirname(relPath)} is not a real directory in the detached candidate`);
  }
  mkdirSync(evidenceDir, { recursive: true });
  if (existsSync(destination) && (!lstatSync(destination).isFile() || lstatSync(destination).isSymbolicLink())) {
    fail("CCR-EVIDENCE-DESTINATION-UNTRUSTED", `${relPath} is not a regular file destination in the detached candidate`);
  }
  writeFileSync(destination, raw, { mode: 0o600 });
}

function seedPushInitEvidence(repo, worktreePath, oid) {
  const tree = String(runGit(repo, ["rev-parse", `${oid}^{tree}`]).stdout).trim();
  const verify = readTrustedJson(repo, "evidence/verify-latest.json");
  validateVerifyEvidence(verify.data, oid, tree);
  const seeded = ["evidence/verify-latest.json"];
  const inputs = [["evidence/verify-latest.json", verify.raw]];
  if (securityGateIsActive(worktreePath)) {
    const security = readTrustedJson(repo, "evidence/security-latest.json");
    validateSecurityEvidence(security.data, oid, tree);
    const envelope = readTrustedJson(repo, "evidence/security-latest.v2.json");
    const verdict = readTrustedJson(repo, "evidence/security-latest.v2.verdict.json");
    // Validate the full v2 pair against the PRIMARY candidate before copying;
    // the same helper is what the push hook consults after the handoff.
    if (checkSecurityCompleteness({ projectDir: repo, commit: oid, tree }).length > 0) {
      fail("CCR-SECURITY-EVIDENCE-MISMATCH", "security evidence is not policy-complete for the detached candidate");
    }
    inputs.push(
      ["evidence/security-latest.json", security.raw],
      ["evidence/security-latest.v2.json", envelope.raw],
      ["evidence/security-latest.v2.verdict.json", verdict.raw],
    );
    seeded.push(...PUSH_INIT_EVIDENCE.slice(1));
  }
  for (const [relPath, raw] of inputs) writeSeededArtifact(worktreePath, relPath, raw);
  return seeded;
}

function parseArgs(argv) {
  const sep = argv.indexOf("--");
  if (sep === -1) throw new Error(USAGE);
  const head = argv.slice(0, sep);
  const command = argv.slice(sep + 1);
  if (command.length === 0) throw new Error(USAGE);
  const flags = {};
  for (let index = 0; index < head.length; index += 2) {
    const key = head[index];
    const value = head[index + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) throw new Error(USAGE);
    const name = key.slice(2);
    if (name in flags) throw new Error(`Duplicate option: ${key}`);
    flags[name] = value;
  }
  const allowed = new Set(["repo", "oid", "purpose", "runner"]);
  for (const name of Object.keys(flags)) if (!allowed.has(name)) throw new Error(`Unknown option: --${name}`);
  return { flags, command };
}

function required(flags, name) {
  if (!flags[name]) throw new Error(`Missing --${name}\n${USAGE}`);
  return flags[name];
}

/**
 * Resolve the invoking runner at this CLI entry boundary (ADR-0051): an
 * explicit --runner always wins; absent one, the ambient CLAUDECODE marker
 * is the legitimate source here (mirrors worktree-create.mjs).
 */
function resolveRunner(flags, env) {
  if (flags.runner !== undefined) {
    if (!RUNNERS.has(flags.runner)) throw new Error(`Invalid --runner: ${flags.runner}\n${USAGE}`);
    return flags.runner;
  }
  return env.CLAUDECODE === "1" ? "claude" : "codex";
}

function resolveOid(cwd, oidish, runGitFn) {
  const oid = String(runGitFn(cwd, ["rev-parse", "--verify", `${oidish}^{commit}`]).stdout).trim();
  if (!/^[0-9a-f]{40}$/.test(oid) && !/^[0-9a-f]{64}$/.test(oid)) {
    throw new WorktreeLifecycleError("WT-INVALID-OID", "candidate ref did not resolve to a canonical commit OID");
  }
  return oid;
}

/**
 * Acquire the worktree named by exactly one deterministic (purpose, oid)
 * pair: create it fresh through the reused lifecycle (registered, and torn
 * down through its paired `cleanupSession`), or -- only when the identical
 * canonical target already exists -- reuse it and tear it down with a
 * direct `git worktree remove` since it carries no manifest resource under
 * this invocation's own session.
 */
function acquireWorktree(repo, purpose, oidish, sessionId, ownerNonce, dependencies) {
  const createDetached = dependencies.createDetachedWorktreeFn ?? createDetachedWorktree;
  try {
    const created = createDetached(repo, purpose, oidish, { sessionId, ownerNonce }, {});
    return { physicalPath: created.physicalPath, oid: created.oid, managed: true };
  } catch (error) {
    if (!(error instanceof WorktreeLifecycleError) || error.code !== "WT-TARGET-EXISTS") throw error;
    const repository = discoverRepository(repo);
    const oid = resolveOid(repository.primaryRoot, oidish, runGit);
    const mapping = canonicalDetachedTarget(repository.primaryRoot, purpose, oid);
    const head = String(runGit(mapping.target, ["rev-parse", "HEAD"]).stdout).trim();
    if (head !== oid) {
      throw new WorktreeLifecycleError("WT-REUSE-MISMATCH", "existing worktree at the canonical target is not at the requested candidate");
    }
    return { physicalPath: mapping.target, oid, managed: false };
  }
}

function releaseWorktree(repo, worktree, sessionId, ownerNonce, dependencies) {
  // Purge everything the run left behind (already copied out above) so the
  // registered-worktree cleanliness check below never sees runtime residue
  // (evidence/ is git-ignored, so an untracked/ignored artifact is exactly
  // what a fresh run leaves and exactly what `git clean` is for here).
  runGit(worktree.physicalPath, ["clean", "-xdff"]);
  if (worktree.managed) {
    const cleanup = (dependencies.cleanupSessionFn ?? cleanupSession)(repo, { sessionId, ownerNonce }, {});
    if (!cleanup.ok) throw new WorktreeLifecycleError("WT-CLEANUP-BLOCKED", "worktree cleanup did not complete");
    return cleanup.receipt;
  }
  runGit(repo, ["worktree", "remove", worktree.physicalPath]);
  if (existsSync(worktree.physicalPath)) fail("WT-CLEANUP-FAILED", "Git retained the reused worktree path");
  return { schema: "pipeline.clean-candidate-reused-cleanup.v1", status: "removed" };
}

function fail(code, message) {
  throw new WorktreeLifecycleError(code, message);
}

function copyArtifacts(worktreePath, repo) {
  const copied = [];
  for (const relative of KNOWN_ARTIFACTS) {
    const source = join(worktreePath, relative);
    if (!existsSync(source)) continue;
    const destination = join(repo, relative);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, readFileSync(source));
    copied.push(relative);
  }
  return copied;
}

export function main(argv = process.argv.slice(2), env = process.env, dependencies = {}) {
  const { flags, command } = parseArgs(argv);
  const repo = resolve(required(flags, "repo"));
  const oidish = required(flags, "oid");
  const purpose = flags.purpose ?? "clean-run";
  const runner = resolveRunner(flags, env);
  const requireReady = dependencies.requireProjectOnboardingReadyFn ?? requireProjectOnboardingReady;
  const spawn = dependencies.spawnFn ?? spawnSync;
  const write = dependencies.writeFn ?? ((value) => process.stdout.write(value));

  requireReady({ rootDir: repo, intent: "dispatch", runner });

  const sessionId = dependencies.sessionId ?? `clean-candidate-${randomBytes(8).toString("hex")}`;
  const ownerNonce = dependencies.ownerNonce ?? randomBytes(32).toString("base64url");

  const worktree = acquireWorktree(repo, purpose, oidish, sessionId, ownerNonce, dependencies);
  let commandResult;
  let copied = [];
  let seeded = [];
  let executedCommand = command;
  try {
    const pushInit = preparePushInitCommand(command, repo, worktree.physicalPath);
    if (pushInit !== null) {
      executedCommand = pushInit.command;
      if (pushInit.needsEvidence) seeded = seedPushInitEvidence(repo, worktree.physicalPath, worktree.oid);
    }
    commandResult = spawn(executedCommand[0], executedCommand.slice(1), {
      cwd: worktree.physicalPath,
      env,
      stdio: "inherit",
    });
    if (commandResult.error) throw commandResult.error;
    copied = copyArtifacts(worktree.physicalPath, repo);
  } finally {
    releaseWorktree(repo, worktree, sessionId, ownerNonce, dependencies);
  }

  const exitCode = commandResult.status ?? 1;
  const output = {
    schema: "pipeline.clean-candidate-run-result.v1",
    repo,
    oid: worktree.oid,
    purpose,
    reusedExistingWorktree: !worktree.managed,
    command: executedCommand,
    commandExitCode: exitCode,
    seededArtifacts: seeded,
    copiedArtifacts: copied,
  };
  write(canonicalJson(output));
  return exitCode;
}

const invokedDirectly = isDirectInvocation(import.meta.url);
if (invokedDirectly) {
  try {
    process.exitCode = main();
  } catch (error) {
    const code = error instanceof WorktreeLifecycleError || error instanceof ProjectOnboardingReadyError
      ? error.code
      : "CCR-ARGUMENT";
    const detail = error instanceof ProjectOnboardingReadyError
      ? "project onboarding readiness denied clean-candidate worktree creation"
      : error.message;
    process.stderr.write(`${code}: ${detail}\n`);
    process.exitCode = 2;
  }
}
