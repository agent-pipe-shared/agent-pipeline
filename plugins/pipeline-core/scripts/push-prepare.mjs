#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * push-prepare.mjs -- NVA-PUSH-PREPARE.
 *
 * A single READ-ONLY command that assembles everything a push needs. Prints a
 * machine-readable report of every precondition a push to a gated destination
 * must satisfy (docs/push-release-flow.md), names precisely which ones are
 * unmet and the exact command that fixes each, and -- once every precondition
 * is met -- prints the fully-formed `authorize-critical` command (with a
 * correct `--subject-sha256`) plus the two agent-side commands that follow it.
 *
 * Never writes a file, never mutates pipeline state, never touches the
 * network -- with exactly ONE narrow exception (NVA-PUSHFOLD-1):
 * `foldPendingPushApprovalWrite()`, run at the very start of `pushPrepareReport()`,
 * commits a prior `approve-push` run's still-uncommitted trailing state-file write when (and
 * only when) that file is the SOLE dirty path in the tree, that dirtiness is actually
 * `approve-push`'s own trailing write (`pendingAuditWrite === true`, NVA-CF-PUSHFOLD -- never
 * an operator's own unrelated direct edit to the same file), and the recorded approval is not
 * still outstanding for the current HEAD (NVA-CF-PUSHFOLD -- folding while it is would move
 * HEAD past `forCommit` and void the approval). Every other check below still only prints a
 * report or a command for a HUMAN or a LATER agent call to run; this script runs none of those
 * itself.
 *
 * WHY THIS EXISTS: on 2026-08-12 a valid, already-consumed signature was
 * refused anyway because `evidence/verify-latest.json` carried a non-zero
 * exit code -- a layer with no relationship to the approval. Every failure so
 * far surfaced one layer at a time, discovered only by attempting it. This
 * checks every layer up front, in one call.
 *
 * REUSE, NOT REIMPLEMENTATION: the `--subject-sha256` value is never
 * recomputed here. `preparePushSubject()` below calls the real, exported
 * `run()` from `pipeline-state.mjs` with its `prepare-push-subject`
 * subcommand -- the exact function `approve-push` itself verifies against --
 * and reads its printed JSON back. There is no second hashing routine in this
 * file.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { renderHumanCopySafeCommand } from "../lib/copy-safe-command.mjs";
import { readCriticalHumanProofPolicy } from "../lib/critical-human-proof-policy.mjs";
import { readMachinePlane, resolveLocalOperatorKeyAnchor } from "../lib/machine-plane.mjs";
import { gateConfig, loadManifestSafe } from "../lib/manifest.mjs";
import { derivePoGateRepositoryFingerprint } from "../lib/po-gate-authority.mjs";
import { resolveAuthorityArtifactPath } from "../lib/project-authority.mjs";
import { authorizeCriticalPushCommand, parseHumanArgs } from "./po-human-approval.mjs";
import { projectDir, readState, run as pipelineStateRun, statePath } from "./pipeline-state.mjs";
import { VERIFY_EVIDENCE_DEFAULT_PATH } from "../lib/verify-evidence-path.mjs";

export const USAGE = "Usage: push-prepare.mjs --by <name> --remote <remote> --destination refs/heads/<branch>";
const REMOTE_RE = /^[A-Za-z0-9._-]{1,80}$/u;
const DESTINATION_RE = /^refs\/heads\/[A-Za-z0-9._/-]{1,200}$/u;
export const PUSH_THREAT_MODEL_PATH = "project/push-threat-model.md";

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
  if (typeof values.by !== "string" || values.by.trim() === "") return { error: `${USAGE}\n--by is required and must be non-empty.` };
  if (!REMOTE_RE.test(values.remote ?? "")) return { error: `${USAGE}\n--remote must be a safe remote name.` };
  if (!DESTINATION_RE.test(values.destination ?? "")) return { error: `${USAGE}\n--destination must be a full refs/heads/<branch> ref.` };
  return { by: values.by, remote: values.remote, destination: values.destination };
}

function gitOutput(dir, args, deps) {
  const spawn = deps.spawn ?? spawnSync;
  const result = spawn("git", ["-C", dir, ...args], { encoding: "utf8" });
  if (result.error || result.status !== 0 || typeof result.stdout !== "string") return null;
  return result.stdout.trim();
}

/** Untrimmed `git status --porcelain` output (see `foldPendingPushApprovalWrite`'s use). */
function rawGitStatus(dir, deps) {
  const spawn = deps.spawn ?? spawnSync;
  const result = spawn("git", ["-C", dir, "status", "--porcelain"], { encoding: "utf8" });
  if (result.error || result.status !== 0 || typeof result.stdout !== "string") return null;
  return result.stdout;
}

export function resolveHeadCommit(dir, deps = {}) {
  if (typeof deps.gitHead === "function") return deps.gitHead(dir);
  return gitOutput(dir, ["rev-parse", "HEAD"], deps);
}

export function checkWorkingTreeClean(dir, deps = {}) {
  const status = typeof deps.gitStatus === "function" ? deps.gitStatus(dir) : gitOutput(dir, ["status", "--porcelain"], deps);
  if (status === null) {
    return { id: "working-tree-clean", ok: false, message: "could not determine working-tree status (git status --porcelain failed).", remedy: "git status" };
  }
  if (status !== "") {
    return { id: "working-tree-clean", ok: false, message: "the working tree is not clean.", remedy: "git status  # then commit or stash the listed changes" };
  }
  return { id: "working-tree-clean", ok: true, message: "working tree is clean." };
}

function readJson(path, deps) {
  try {
    const raw = (deps.readFile ?? readFileSync)(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Matches `checkEvidenceFreshness()` in `guard-push.mjs` (`exitCode === 0` and
 * `commit === sourceCommit`) exactly -- never a looser approximation. This is
 * the ONLY contract this function checks; it does not reproduce the deeper
 * `checkSecurityEvidenceBinding()` policy-completeness checks guard-push.mjs
 * additionally runs for `evidence/security-latest.json` when a security gate
 * is configured, so a green result here is necessary, not sufficient, for
 * that file -- the same freshness floor both evidence files share.
 *
 * NVA-J-PUSHPREPGATE: `pushPrepareReport()` below calls this for
 * `evidence/security-latest.json` ONLY when `isSecurityGateActive()` says the
 * gate is actually configured and not `"off"` -- mirroring guard-push.mjs's
 * own `securityGate && securityGate.mode !== "off"` condition, so
 * `gates.security: "off"` genuinely removes the requirement here too, rather
 * than being demanded unconditionally regardless of the setting.
 */
/**
 * Resolves the remedy for a stale/missing evidence file to the PROJECT'S OWN
 * calibrated `verify` command -- never a path hardcoded to this repository's
 * own source-only tree layout (AC-11, the consumer-safe-path checker under
 * this repository's own build tooling). Reuses the same calibration-tier
 * resolver `security-scan.mjs` already routes
 * through (`resolveAuthorityArtifactPath`, `../lib/project-authority.mjs`)
 * rather than inventing a second calibration reader. An absent, unreadable, or
 * malformed calibration -- or one with no `verify` key -- degrades honestly:
 * it never invents a command and never falls back to a source-only path.
 */
export function resolveVerifyRemedy(dir, relPath, deps = {}) {
  const resolveArtifact = deps.resolveAuthorityArtifactPath ?? resolveAuthorityArtifactPath;
  try {
    const artifact = resolveArtifact("calibration", { rootDir: dir });
    if (artifact.exists) {
      const raw = (deps.readFile ?? readFileSync)(artifact.path, "utf8");
      const parsed = JSON.parse(raw);
      if (typeof parsed?.verify === "string" && parsed.verify.trim() !== "") {
        return `${parsed.verify}  # regenerates ${relPath}`;
      }
    }
  } catch {
    // absent/unreadable/malformed calibration -- fall through to the honest degradation below.
  }
  return `run this project's own calibrated verify command  # its calibration does not define one; regenerates ${relPath}`;
}

export function checkEvidenceFreshness(id, relPath, dir, headCommit, deps = {}) {
  const path = join(dir, relPath);
  const data = readJson(path, deps);
  const remedy = resolveVerifyRemedy(dir, relPath, deps);
  if (data === null) return { id, ok: false, message: `${relPath} is missing or unreadable.`, remedy };
  if (data.exitCode !== 0) return { id, ok: false, message: `${relPath}: exitCode=${JSON.stringify(data.exitCode)} (expected 0).`, remedy };
  if (data.commit !== headCommit) {
    return { id, ok: false, message: `${relPath}: commit=${JSON.stringify(data.commit)} is stale (HEAD is ${JSON.stringify(headCommit)}).`, remedy };
  }
  return { id, ok: true, message: `${relPath} is fresh and green at HEAD.` };
}

/**
 * NVA-J-PUSHPREPGATE: reads the effective `gates.security` mode via the shared
 * `gateConfig()` reader (`../lib/manifest.mjs`) -- never a second, hand-rolled
 * manifest reader -- and applies the exact same activation rule
 * `guard-push.mjs` already enforces at push time (`securityGate &&
 * securityGate.mode !== "off"`, see that file's `(b) security evidence`
 * comment). No `security` gate configured at all, or configured with mode
 * `"off"`, both mean the gate is inactive; anything else (e.g. `"blocking"`)
 * means it is active.
 */
export function isSecurityGateActive(dir, deps = {}) {
  const loadManifest = deps.loadManifestSafe ?? loadManifestSafe;
  const readGateConfig = deps.gateConfig ?? gateConfig;
  const manifest = loadManifest(dir);
  const securityGate = readGateConfig(manifest, "security");
  return Boolean(securityGate) && securityGate.mode !== "off";
}

export function checkPushThreatModel(dir, deps = {}) {
  const exists = (deps.exists ?? existsSync)(join(dir, PUSH_THREAT_MODEL_PATH));
  if (!exists) {
    return {
      id: "push-threat-model",
      ok: false,
      message: `${PUSH_THREAT_MODEL_PATH} does not exist.`,
      remedy: "node plugins/pipeline-core/scripts/pipeline-state.mjs materialize-push-threat-model  # then review, commit it",
    };
  }
  return { id: "push-threat-model", ok: true, message: `${PUSH_THREAT_MODEL_PATH} is present.` };
}

/**
 * D2(e): reports whether the critical-human-proof posture is an unrestricted
 * set (any well-formed key may sign) or a pinned set, and -- when pinned --
 * whether the key in the resolved local approval directory is a member. This
 * exists because that membership check currently happens only at push time:
 * under a v3 `trustAnchors` policy, `pipeline-state.mjs`'s pre-existing anchor
 * check (~line 2754) reads only the singular `policy.trustAnchor` and is
 * skipped entirely, so a key mismatch surfaces only after the human has
 * already signed.
 *
 * NVA-N-PUSHDIAG: this must resolve every shape of the document EXACTLY the
 * way `trustAnchorsFor()` (`../lib/critical-action-authorization.mjs`) does --
 * that function is the reference; this one used to disagree with it. A v1/v2
 * document with no `trustAnchor` at all used to mean "this route is
 * unavailable" there (`PUSH-PROOF-TRUST-ANCHOR-MISSING`); as of
 * TRUST-ON-FIRST-USE (backlog:
 * 2026-08-28-a-v1-trust-anchor-makes-the-signature-push-route-functionless.md,
 * PO decision 2026-08-29) it instead means "no key pinned YET" -- the first
 * successful push authorizes with any well-formed key and pins it, exactly
 * like a v3 document's explicit empty `trustAnchors: []` for that one call,
 * except the anchor-less case is a ONE-TIME open window (it self-closes the
 * moment a key is pinned) where the v3 empty-array posture stays permanently
 * open.
 *
 * NARROWED (NVA-CF-TOFUFIX, PO decision 2026-08-29, "TOFU-Fix" ->
 * "A: Provenienz verlangen", same-day follow-up to TRUST-ON-FIRST-USE above):
 * `trustAnchorsFor()`'s open-verification window no longer accepts ANY
 * well-formed key on the anchor-less path -- only a signer that resolves to
 * THIS machine's own registered operator key
 * (`resolveLocalOperatorKeyAnchor()`, `../lib/machine-plane.mjs`, the same
 * `readMachinePlane().poKeyDirectory` -> that directory's own
 * `trust-policy.json` two-hop lookup) may consume it at all; every other
 * signer is refused outright, not merely left unpinned
 * (`${prefix}-TRUST-ANCHOR-MISSING`). This diagnostic now AGREES rather than
 * merely describing the posture: for the anchor-less case it independently
 * resolves the same local-machine anchor (via the identical
 * `resolveLocalOperatorKeyAnchor()` resolution, given the SAME `deps` this
 * function already threads through) and reports `ok:true` only when this
 * machine actually has one; when it does not, it reports `ok:false`, a
 * TRUST-ANCHOR-MISSING-shaped precondition-unmet outcome -- never the
 * unconditional `ok:true` this diagnostic used to report for that case. The
 * v3 explicit-empty-set posture below (`anchors.length === 0`) is untouched
 * by this: it was never routed through the narrowing gate either, in the
 * authorization module or here.
 */
export function checkCriticalHumanProofPolicy(dir, deps = {}) {
  const readPolicy = deps.readCriticalHumanProofPolicy ?? readCriticalHumanProofPolicy;
  const policy = readPolicy(dir);
  const id = "critical-human-proof-policy";
  if (!policy.ok) {
    return { id, ok: false, message: `project/critical-human-proof.json could not be read (${policy.code}).`, remedy: "fix or remove project/critical-human-proof.json" };
  }
  // Mirrors `trustAnchorsFor()`'s own branching exactly (see the comment above): a v1/v2
  // document carries no set concept at all (`trustAnchors` stays `null`), so its `trustAnchor`
  // is the only signal -- `null` there means no key has been pinned yet, and the first
  // successful push pins whichever well-formed key signs it (trust-on-first-use).
  if (policy.trustAnchors === null && policy.trustAnchor === null) {
    // NARROWED (see the doc comment above): agree with `trustAnchorsFor()` by resolving the
    // identical local-machine anchor, through the SAME `deps` this function already threads
    // to every other check below -- `resolveLocalOperatorKeyAnchor()`'s dependency-injection
    // keys (`homedirFn`/`realpathSyncFn`/`existsSyncFn`/`readFileSyncFn`) never collide with
    // this file's own flat `exists`/`readFile` keys, so no separate deps namespace is needed;
    // a test that wants a hermetic result overrides `homedirFn` (mirrors
    // `critical-action-authorization.test.mjs`'s `machinePlaneFixture()`), and a production
    // caller that overrides nothing gets the real machine, exactly like `authorizeRecordedPush`.
    const resolveLocalAnchor = deps.resolveLocalOperatorKeyAnchor ?? resolveLocalOperatorKeyAnchor;
    const localAnchor = resolveLocalAnchor(deps);
    if (localAnchor === null) {
      return {
        id, ok: false,
        message: "posture: unrestricted, once (trust-on-first-use) -- but TRUST-ANCHOR-MISSING: project/critical-human-proof.json declares no trustAnchor and no trustAnchors, and this machine has no registered operator key (readMachinePlane()'s poKeyDirectory names none, or its trust-policy.json does not resolve), so the open-verification route is unavailable until one is registered.",
        remedy: "register this machine's operator key, e.g. node plugins/pipeline-core/scripts/po-human-approval.mjs setup --repo-root <repo> --directory <external-dir> --human-name <name>, then record that directory as poKeyDirectory in ~/.agent-pipeline/machine.json",
      };
    }
    // The resolver above proves the key through the machine plane's poKeyDirectory ->
    // trust-policy.json chain. Carry that SAME registered directory forward so the complete
    // push-prepare flow signs with the key whose provenance made this TOFU check green. Do
    // not fall through to parseHumanArgs() here: its higher-precedence repo-scoped tier may
    // legitimately name a different directory, which would discard the provenance binding.
    const readLocalPlane = deps.readMachinePlane ?? readMachinePlane;
    const localPlane = readLocalPlane(deps);
    const directory = localPlane.status === "valid" ? localPlane.plane?.poKeyDirectory : null;
    if (typeof directory !== "string" || directory.length === 0) {
      return {
        id, ok: false,
        message: "posture: unrestricted, once (trust-on-first-use) -- but TRUST-ANCHOR-MISSING: this machine's registered operator key directory could not be resolved consistently.",
        remedy: "fix this machine's poKeyDirectory registration in ~/.agent-pipeline/machine.json",
      };
    }
    return {
      id, ok: true,
      message: "posture: unrestricted, once (trust-on-first-use); project/critical-human-proof.json declares no trustAnchor and no trustAnchors, and this machine's own registered operator key resolves, so the next successful signature push authorizes with it and pins it as this project's trust anchor for every later push.",
      directory,
    };
  }
  const anchors = policy.trustAnchors !== null ? policy.trustAnchors : [policy.trustAnchor];
  const posture = anchors.length === 0 ? "unrestricted (any well-formed key may sign)" : `pinned (${anchors.length} trust anchor(s))`;

  const parseArgsForDirectory = deps.parseHumanArgs ?? parseHumanArgs;
  const resolved = parseArgsForDirectory(["verify", "--repo-root", dir], deps.humanArgsDeps ?? {});
  if (resolved.error) {
    return {
      id, ok: anchors.length === 0,
      message: `posture: ${posture}; the local approval directory could not be resolved (${resolved.error}).`,
      remedy: anchors.length === 0 ? undefined : "node plugins/pipeline-core/scripts/po-human-approval.mjs setup --repo-root <repo> --directory <external-dir> --human-name <name>",
    };
  }
  const authorityPath = join(resolved.directory, "trust-policy.json");
  if (!(deps.exists ?? existsSync)(authorityPath)) {
    return {
      id, ok: anchors.length === 0,
      message: `posture: ${posture}; no local authority record exists yet in the resolved approval directory.`,
      remedy: anchors.length === 0
        ? undefined
        : `node plugins/pipeline-core/scripts/po-human-approval.mjs setup --repo-root <repo> --directory ${resolved.directory} --human-name <name>`,
      directory: resolved.directory,
    };
  }
  if (anchors.length === 0) {
    return { id, ok: true, message: `posture: ${posture}.`, directory: resolved.directory };
  }
  const local = readJson(authorityPath, deps);
  const member = local && anchors.some((anchor) => anchor.keyReference === local.keyReference && anchor.publicKeySha256 === local.publicKeySha256);
  if (!member) {
    return {
      id, ok: false,
      message: `posture: ${posture}; the key in the resolved approval directory is NOT a member of the pinned set.`,
      remedy: "sign with a directory holding one of the pinned trustAnchors, or add this key to project/critical-human-proof.json's trustAnchors",
      directory: resolved.directory,
    };
  }
  return { id, ok: true, message: `posture: ${posture}; the key in the resolved approval directory IS a member.`, directory: resolved.directory };
}

/**
 * READ-ONLY reuse of `pipeline-state.mjs`'s own `prepare-push-subject`
 * subcommand (its own header comment: "the SAME inputs approve-push itself
 * verifies against"). Calls the exported `run()` in-process and captures its
 * `console.log` output rather than reimplementing `criticalActionSubjectSha256`.
 */
export function preparePushSubject({ dir, by, remote, destination }, deps = {}) {
  const runFn = deps.pipelineStateRun ?? pipelineStateRun;
  let captured = "";
  const originalLog = console.log;
  console.log = (message) => { captured += `${message}\n`; };
  let exitCode;
  try {
    exitCode = runFn(["prepare-push-subject", "--by", by, "--remote", remote, "--destination", destination], { dir });
  } finally {
    console.log = originalLog;
  }
  if (exitCode !== 0) return { ok: false, raw: captured };
  try {
    return { ok: true, value: JSON.parse(captured) };
  } catch {
    return { ok: false, raw: captured };
  }
}

export function resolveFeatureContext(dir, deps = {}) {
  const result = (deps.readState ?? readState)(dir);
  const active = result?.status === "ok" ? result.state.activeFeature : null;
  if (!active || typeof active.id !== "string" || active.id === "" || typeof active.planPath !== "string" || active.planPath === "") {
    return { ok: false, message: "no active feature with an id and planPath in pipeline state." };
  }
  const specPath = `${dirname(active.planPath).split(sep).join("/")}/spec.md`;
  return { ok: true, featureId: active.id, planPath: active.planPath, specPath };
}

function resolveGitCommonDirPath(dir, deps = {}) {
  const raw = typeof deps.gitCommonDir === "function" ? deps.gitCommonDir(dir) : gitOutput(dir, ["rev-parse", "--git-common-dir"], deps);
  if (raw === null || raw === undefined) return dir;
  try {
    return realpathSync(resolve(dir, raw));
  } catch {
    return dir;
  }
}

/**
 * Reproduces the exact filenames `po-human-approval.mjs` (`runHumanApproval`)
 * gives the request/proof artifacts for a `kind: push` critical approval --
 * `request-<fingerprint>-critical-push.json` / `proof-<fingerprint>-critical-push.json`,
 * `trust-policy.json` unsuffixed -- by calling the SAME exported
 * `derivePoGateRepositoryFingerprint()` that script imports, never a second
 * fingerprint scheme.
 */
export function criticalArtifactPaths(dir, directory, deps = {}) {
  const gitCommonDir = resolveGitCommonDirPath(dir, deps);
  const deriveFingerprint = deps.derivePoGateRepositoryFingerprint ?? derivePoGateRepositoryFingerprint;
  const fingerprint = deriveFingerprint({ gitCommonDir, primaryRoot: dir }).slice(0, 12);
  const suffix = `-${fingerprint}-critical-push`;
  return {
    request: join(directory, `request${suffix}.json`),
    proof: join(directory, `proof${suffix}.json`),
    authority: join(directory, "trust-policy.json"),
  };
}

/**
 * NVA-PUSHFOLD-1: `approve-push` (`pipeline-state.mjs`) writes `pushApproval.lastApproved`
 * to the project's state file strictly AFTER the signed subject was computed, so that write
 * structurally can never be part of the commit it records
 * (backlog/items/2026-08-26-push-approval-record-always-trails-the-signed-commit.md) --
 * every successful `approve-push` leaves exactly that one file dirty. This folds it in
 * automatically at the START of the next `push-prepare` run (PO decision, 2026-08-29), so a
 * human/session no longer has to notice and commit it by hand.
 *
 * Deliberately narrow, to keep this script's "never mutates" contract true for every OTHER
 * case. The resolved state file being the SOLE dirty path is NECESSARY but not sufficient --
 * three further gates all have to hold before this ever shells out to `git`:
 *
 * 1. (NVA-CF-PUSHFOLD) `pushApproval.lastApproved.pendingAuditWrite` must be exactly `true`.
 *    A state file that is dirty for some OTHER reason (an operator's own direct edit, a
 *    concurrent unrelated write) happens to satisfy "sole dirty path" too, but is not the
 *    shape this fold exists for -- it is left completely alone, never auto-committed.
 * 2. (NVA-CF-PUSHFOLD) `pushApproval.lastApproved.forCommit` must NOT equal the CURRENT HEAD
 *    commit. `forCommit` still equalling HEAD means the push this approval was signed for may
 *    not have happened yet -- we are still between `approve-push` and the actual `git push`.
 *    Folding (committing) in that window would move HEAD past `forCommit` and void the
 *    approval before it is ever used (docs/push-release-flow.md: "Commit nothing between
 *    approve-push and the push"). This becomes safe again once ordinary work moves HEAD on --
 *    the shape a LATER, later-cycle `push-prepare` run actually finds.
 * 3. HEAD itself must be resolvable at all -- if it cannot be determined, this refuses to
 *    fold rather than guess whether gate 2 is satisfied.
 *
 * Any other dirty file alongside the state file (or a dirty tree that is NOT this exact file)
 * is not the shape this fold exists for either -- it is left completely alone, and the
 * pre-existing `checkWorkingTreeClean` check below reports it exactly as before (no behavior
 * change for that case).
 *
 * Also clears the `pendingAuditWrite` hint (see `pipeline-state.mjs`'s `approve-push` case)
 * from `true` to `false` before staging the commit: that flag is the upfront,
 * immediately-visible local marker that the record has not yet been committed, so committing
 * it here without clearing it would leave a permanently stale `true` in history the moment it
 * lands.
 */
export function foldPendingPushApprovalWrite(dir, deps = {}) {
  // Deliberately NOT `gitOutput()` (used by `checkWorkingTreeClean` below): that helper
  // `.trim()`s the whole string, which silently eats porcelain's leading status-code column
  // (" M path" -> "M path") and shifts every fixed-offset slice below by one. Harmless for
  // `checkWorkingTreeClean`'s own dirty/clean check, but this function parses per-line column
  // positions, so it needs the raw, untrimmed output.
  const status = typeof deps.gitStatus === "function" ? deps.gitStatus(dir) : rawGitStatus(dir, deps);
  if (status === null) return { folded: false, reason: "status-unavailable" };
  const lines = status.split("\n").filter((line) => line !== "");
  if (lines.length === 0) return { folded: false, reason: "clean" };
  if (lines.length !== 1) return { folded: false, reason: "other-dirty-paths" };
  const relPath = lines[0].slice(3);
  const resolveStatePath = deps.statePath ?? statePath;
  const stateRelPath = relative(dir, resolveStatePath(dir)).split(sep).join("/");
  if (relPath !== stateRelPath) return { folded: false, reason: "other-dirty-paths" };

  const readFile = deps.readFile ?? readFileSync;
  const writeFile = deps.writeFile ?? writeFileSync;
  const absPath = join(dir, relPath);
  let parsedState;
  try {
    parsedState = JSON.parse(readFile(absPath, "utf8"));
  } catch {
    return { folded: false, reason: "unreadable" };
  }

  // Gate 1 (NVA-CF-PUSHFOLD): only ever fold the exact shape approve-push's own trailing write
  // leaves behind -- never an operator's own unrelated direct edit to this same file.
  if (parsedState?.pushApproval?.lastApproved?.pendingAuditWrite !== true) {
    return { folded: false, reason: "not-pending" };
  }

  // Gate 2+3 (NVA-CF-PUSHFOLD): refuse to fold while the recorded approval is still outstanding
  // for the CURRENT HEAD -- see the function-level comment above for why.
  const headCommit = resolveHeadCommit(dir, deps);
  if (!headCommit) return { folded: false, reason: "head-unavailable" };
  if (parsedState.pushApproval.lastApproved.forCommit === headCommit) {
    return { folded: false, reason: "approval-outstanding" };
  }

  parsedState.pushApproval.lastApproved.pendingAuditWrite = false;
  try {
    writeFile(absPath, `${JSON.stringify(parsedState, null, 2)}\n`);
  } catch {
    return { folded: false, reason: "rewrite-failed" };
  }

  const spawn = deps.spawn ?? spawnSync;
  const add = spawn("git", ["-C", dir, "add", "--", relPath], { encoding: "utf8" });
  if (add.error || add.status !== 0) return { folded: false, reason: "add-failed" };
  const message = "chore(pipeline-state): fold pending push-approval record\n\n"
    + "Auto-folded by push-prepare.mjs at the start of its own run (NVA-PUSHFOLD-1): a prior\n"
    + "approve-push run's trailing state-file write was still uncommitted when this run\n"
    + "started. See backlog/items/2026-08-26-push-approval-record-always-trails-the-signed-\n"
    + "commit.md.\n\n"
    + "AI-Assisted: true\n"
    + "Dispatch: stage-0 (elephant)\n";
  const commit = spawn("git", ["-C", dir, "commit", "-m", message, "--", relPath], { encoding: "utf8" });
  if (commit.error || commit.status !== 0) return { folded: false, reason: "commit-failed" };
  return { folded: true };
}

export function pushPrepareReport(argv, deps = {}) {
  const dir = deps.dir ?? projectDir();
  const parsed = parseArgs(argv);
  if (parsed.error) return { ok: false, error: parsed.error };
  const { by, remote, destination } = parsed;

  // Runs BEFORE anything below that assumes a clean tree (NVA-PUSHFOLD-1): a pending trailing
  // write from a prior `approve-push` is folded in here first, so `checkWorkingTreeClean`
  // never has to be manually chased by a human/session noticing the dirty state file.
  foldPendingPushApprovalWrite(dir, deps);

  const headCommit = resolveHeadCommit(dir, deps);
  const checks = [];
  checks.push(checkWorkingTreeClean(dir, deps));
  const securityGateActive = isSecurityGateActive(dir, deps);
  if (headCommit) {
    checks.push(checkEvidenceFreshness("verify-evidence", VERIFY_EVIDENCE_DEFAULT_PATH, dir, headCommit, deps));
    if (securityGateActive) {
      checks.push(checkEvidenceFreshness("security-evidence", "evidence/security-latest.json", dir, headCommit, deps));
    }
  } else {
    const message = "HEAD commit could not be determined (git rev-parse HEAD failed).";
    checks.push({ id: "verify-evidence", ok: false, message, remedy: "git rev-parse HEAD" });
    if (securityGateActive) {
      checks.push({ id: "security-evidence", ok: false, message, remedy: "git rev-parse HEAD" });
    }
  }
  checks.push(checkPushThreatModel(dir, deps));
  checks.push(checkCriticalHumanProofPolicy(dir, deps));

  const report = {
    schema: "pipeline.push-prepare-report.v1",
    by, remote, destination, headCommit,
    checks: checks.map(({ directory, ...rest }) => rest),
    ready: checks.every((check) => check.ok),
  };

  if (!report.ready) return { ok: true, report, lines: null };

  const subject = preparePushSubject({ dir, by, remote, destination }, deps);
  if (!subject.ok) {
    report.ready = false;
    report.checks.push({
      id: "subject-hash", ok: false, message: "prepare-push-subject did not produce a usable subject hash.",
      remedy: `node plugins/pipeline-core/scripts/pipeline-state.mjs prepare-push-subject --by ${by} --remote ${remote} --destination ${destination}`,
    });
    return { ok: true, report, lines: null };
  }
  const subjectSha256 = subject.value.subjectSha256;

  const feature = resolveFeatureContext(dir, deps);
  if (!feature.ok) {
    report.ready = false;
    report.checks.push({ id: "active-feature", ok: false, message: feature.message, remedy: "node plugins/pipeline-core/scripts/pipeline-state.mjs set-feature --id <id> --plan-path <planPath>" });
    return { ok: true, report, lines: null };
  }

  const humanProofCheck = checks.find((check) => check.id === "critical-human-proof-policy");
  const directory = humanProofCheck.directory;
  if (!directory) {
    report.ready = false;
    report.checks.push({ id: "approval-directory", ok: false, message: "the local approval directory could not be resolved.", remedy: "export PIPELINE_PO_APPROVAL_DIRECTORY=<external-dir>  # or pass --directory to po-human-approval.mjs setup" });
    return { ok: true, report, lines: null };
  }

  const nowFn = deps.now ?? (() => new Date(Date.now() + 3_600_000));
  const expiresAt = nowFn().toISOString();

  const authorizeBuilder = deps.authorizeCriticalPushCommand ?? authorizeCriticalPushCommand;
  const authorize = authorizeBuilder({
    repoRoot: dir, directory, featureId: feature.featureId, plan: feature.planPath, spec: feature.specPath,
    subjectSha256, expiresAt,
  });
  const authorizeCommand = renderHumanCopySafeCommand({
    label: "human authorize-critical",
    executable: authorize.executable,
    argv: authorize.argv,
  });

  const artifacts = criticalArtifactPaths(dir, directory, deps);
  const approveArgv = [
    "plugins/pipeline-core/scripts/pipeline-state.mjs", "approve-push",
    "--by", by, "--remote", remote, "--destination", destination,
    "--proof-request", artifacts.request, "--proof-authority", artifacts.authority, "--proof", artifacts.proof,
  ];
  const approveCommand = renderHumanCopySafeCommand({
    label: "agent approve-push",
    executable: "node",
    argv: approveArgv,
  });
  const gitPushCommand = renderHumanCopySafeCommand({
    label: "agent push",
    executable: "git",
    argv: ["push", remote, `HEAD:${destination}`],
  });

  report.subjectSha256 = subjectSha256;
  return {
    ok: true,
    report,
    lines: {
      authorize: authorizeCommand.text.split("\n"),
      approvePush: approveCommand.text.split("\n"),
      gitPush: gitPushCommand.text,
    },
  };
}

export function printReport(result, io = {}) {
  const write = io.write ?? process.stdout.write.bind(process.stdout);
  const writeError = io.writeError ?? process.stderr.write.bind(process.stderr);
  write(`${JSON.stringify(result.report, null, 2)}\n`);
  if (result.lines) {
    writeError(`${result.lines.authorize.join("\n")}\n\n`);
    writeError(`${result.lines.approvePush.join("\n")}\n\n`);
    writeError(`${result.lines.gitPush}\n`);
  }
}

if (isDirectInvocation(import.meta.url)) {
  const result = pushPrepareReport(process.argv.slice(2));
  if (!result.ok) {
    process.stderr.write(`${result.error}\n`);
    process.exit(2);
  }
  printReport(result);
  process.exit(result.report.ready ? 0 : 1);
}
