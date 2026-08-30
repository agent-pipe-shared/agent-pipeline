#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * NVA-B-GUIDEDINIT: one guided entry point that drives project-onboarding-v3.mjs's
 * deterministic onboarding chain (the ~31-entry `ONBOARDING_SUBCOMMANDS` table) to
 * completion in ONE invocation, stopping only where a human genuinely decides something.
 *
 * Same move, one layer up, as pipeline-start-preflight.mjs
 * (`plugins/pipeline-core/scripts/pipeline-start-preflight.mjs`): that file consolidates
 * the bootstrap checks into one call instead of making the agent perform each one by
 * hand. This file does the identical thing for the onboarding chain -- purely additive,
 * nothing existing changes behaviour.
 *
 * GENERIC OVER THE nextAction PROTOCOL, NO DOMAIN KNOWLEDGE: this driver never reasons
 * about what any individual onboarding status (`kickoff-required`, `intake-required`,
 * `portable-seed-required`, ...) actually means. It only reads the `nextAction` field
 * every onboarding-cli result carries (lib/project-onboarding-v3.mjs) and recognizes
 * exactly two of its kinds:
 *   - `kind: "command"`  -- a ready-to-run `{ executable, argv }` this driver executes
 *     itself, then loops back to read the new state.
 *   - `kind: "collect-input"` -- a genuine human question. The driver stops here and
 *     returns that action's own `inputs`/`input`/`guidance` fields VERBATIM (via the raw
 *     final onboarding-cli response, never re-worded or summarized).
 *
 * SURFACES PUBLISHED PENDING ASKS, NEVER INVENTS ANSWERS: any `nextAction` (of either kind
 * above) can additionally carry a `pendingAsks` array (the library's own
 * `withPendingAsksSurfacedOnNextAction()` side-channel merge). The driver reads it
 * generically -- a well-formed entry is any object with a string `kind`, the same shape a
 * `collect-input` action already has -- and on a `command` step with a non-empty
 * `pendingAsks`, stops and reports `outcome: "pending-asks"` INSTEAD OF executing the
 * command, so a published ask is never silently stepped past. On a `collect-input` step, any
 * sibling `pendingAsks` is surfaced alongside the primary question, not dropped. It still
 * never invents an answer. One explicit re-entry surface is deliberately domain-specific:
 * the first-anchor collect-input action returns this driver's closed `--trust-anchor-*`
 * argv. Once the runner substitutes the PO's four answers and invokes that exact action,
 * the driver performs the one attended setup transaction and re-enters the generic loop.
 *
 * RE-ANCHORS AFTER A SILENT SUCCESS, INSTEAD OF STOPPING THERE: a step this driver just
 * EXECUTED (a `command` action it ran, not the bootstrap `inspect` itself) can come back
 * successful with no `nextAction` and a `status` other than `"ready"` -- some plan/apply
 * builders settle without naming what comes next. Rather than stopping there, the driver
 * re-runs the same bare `inspect --root <root>` it starts every invocation with, and
 * continues the loop from whatever that reveals. This holds no domain knowledge either:
 * "after acting, re-read the state" is generic control flow, not a routing table over
 * onboarding statuses -- the driver still never names one.
 *
 * Two things bound the re-anchor so it cannot become the very loop it exists to shortcut:
 *   - It only fires once per executed step. If the anchoring `inspect` ITSELF is the one
 *     that rests with no `nextAction`, that is the standalone-response case below, not
 *     another re-anchor -- re-anchoring an anchor would spin on the identical command
 *     forever without ever executing anything new.
 *   - Progress is verified, not assumed. Each re-anchor's `inspect` response is compared,
 *     full canonical (key-sorted) equality, against the immediately preceding anchor's
 *     response. Equivalent means the executed step in between changed nothing the CLI's
 *     own state reports, so the driver stops with its own `"no-progress"` outcome instead
 *     of retrying toward the step cap -- this is exactly the shape of an earlier defect
 *     (`inspect` -> `bootstrap-bind-plan` -> `inspect` -> ... forever), caught after the
 *     first repeat rather than after fifty wasted commands.
 *
 * Anything else it cannot safely act on, so it also stops rather than guessing:
 *   - `nextAction` absent/null while `status` is not `"ready"`, reached from the
 *     anchoring `inspect` itself with no executed step since the last anchor -- e.g. a
 *     standalone recovery command's own plan response (`plan-partial-authority`'s
 *     `"selection-required"`, which uses a `selection` field instead of `nextAction` and
 *     is never reached by a fresh repository's own `inspect` walk in the first place).
 *   - any `nextAction.kind` other than `"command"`/`"collect-input"` (e.g.
 *     `"restart-process"`), which needs an attended external terminal this driver cannot
 *     provide.
 *
 * NEVER INVENTS A VALUE. Not a language, not a profile, not a git author identity, not a
 * goal -- those are the human's. This driver holds no logic that could fabricate one: a
 * `collect-input` stop always returns the action untouched.
 *
 * RE-ENTRANT BY CONSTRUCTION, not by any state this file itself keeps. Every invocation
 * starts a fresh `inspect --root <root>` and walks forward from whatever the underlying
 * CLI's own durable, on-disk state says right now. A human supplying an answer means
 * someone runs the specific mutating command the `collect-input` action named, with the
 * real answer values, exactly once; re-running this driver afterward picks up from the new
 * state. The first-anchor action names this driver itself, which performs setup and then
 * continues from a fresh inspect in that same invocation. There is nothing to double-apply,
 * because durable repository/machine readback -- not process memory -- records progress.
 */

import { spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import {
  CRITICAL_HUMAN_PROOF_POLICY_PATH,
  CRITICAL_HUMAN_PROOF_POLICY_V3,
} from "../lib/critical-human-proof-policy.mjs";
import {
  MACHINE_PLANE_SCHEMA,
  machinePlaneFilePath,
  readMachinePlane,
  writeMachinePlane,
} from "../lib/machine-plane.mjs";

export const SCHEMA = "pipeline.onboarding-init.v1";

// "roughly thirty subcommands" (this task's own briefing) is the real chain length a
// fresh repository walks; this cap gives headroom above that without being unbounded, so
// a malformed or non-converging chain (a `nextAction` that keeps pointing back at itself)
// cannot spin forever.
export const DEFAULT_STEP_CAP = 50;

const ONBOARDING_SCRIPT_PATH = fileURLToPath(new URL("./project-onboarding-v3.mjs", import.meta.url));
const PO_HUMAN_APPROVAL_SCRIPT_PATH = fileURLToPath(new URL("./po-human-approval.mjs", import.meta.url));
const TRUST_ANCHOR_MODES = new Set(["existing", "new"]);
const TRUST_ANCHOR_RECOVERY_SCHEMA = "pipeline.first-anchor-bootstrap-recovery.v1";

function usage() {
  return "Usage: node plugins/pipeline-core/scripts/onboarding-init.mjs --root <project-dir> [--runner claude|codex|antigravity] [--step-cap <n>] [--trust-anchor-mode existing|new --trust-anchor-directory <absolute-external-dir> --trust-anchor-human-name <name> --trust-anchor-existing-key <absolute-key-path|none>]";
}

// The runner lane, pinned rather than inherited.
//
// The onboarding CLI resolves its runner from the ENVIRONMENT when `--runner` is absent
// (`resolveActiveRunner`, scripts/project-onboarding-v3.mjs): `CLAUDECODE=1` means claude,
// an Antigravity marker means antigravity, and everything else falls into an else-branch
// that answers `codex` -- including a plain human terminal, which is no runner at all.
//
// That guess reaches this driver as a real behavioural difference, not a label: a fresh
// repository resolved as codex is handed a Codex restart barrier, whose `nextAction.kind`
// is `restart-process`, which this driver correctly refuses to execute. The identical
// invocation therefore reaches a `collect-input` question inside a Claude Code session and
// `unsupported-next-action` in the operator's own shell -- measured 2026-08-28, where this
// file's own suite passed eight times under an agent and failed deterministically under
// `env -u CLAUDECODE`.
//
// So the lane is a caller decision here, threaded into the first `inspect` (every later
// command is constructed BY the CLI, which carries its own resolved runner forward). An
// omitted `--runner` keeps the CLI's existing environment resolution unchanged -- this adds
// a way to be explicit, it does not change the default -- and the resolved-or-null value is
// reported in the result so a caller can see which lane it is on instead of assuming.
const RUNNERS = new Set(["claude", "codex", "antigravity"]);

function parseArgs(argv) {
  const output = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) return { error: "--root requires a project directory" };
      output.root = value;
      index += 1;
    } else if (arg === "--runner") {
      const value = argv[index + 1];
      if (!RUNNERS.has(value)) return { error: `--runner requires one of: ${[...RUNNERS].join(", ")}` };
      output.runner = value;
      index += 1;
    } else if (arg === "--step-cap") {
      const raw = argv[index + 1];
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 1) return { error: "--step-cap requires a positive integer" };
      output.stepCap = value;
      index += 1;
    } else if (arg === "--trust-anchor-mode") {
      const value = argv[index + 1];
      if (!TRUST_ANCHOR_MODES.has(value)) return { error: "--trust-anchor-mode requires existing or new" };
      output.trustAnchorMode = value;
      index += 1;
    } else if (arg === "--trust-anchor-directory") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--") || !isAbsolute(value)) return { error: "--trust-anchor-directory requires an absolute path" };
      output.trustAnchorDirectory = value;
      index += 1;
    } else if (arg === "--trust-anchor-human-name") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--") || value.trim().length === 0) return { error: "--trust-anchor-human-name requires a non-empty attribution" };
      output.trustAnchorHumanName = value;
      index += 1;
    } else if (arg === "--trust-anchor-existing-key") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) return { error: "--trust-anchor-existing-key requires an absolute path or the literal none" };
      output.trustAnchorExistingKey = value;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      output.help = true;
    } else {
      return { error: `unknown argument: ${arg}` };
    }
  }
  if (!output.help && !output.root) return { error: "--root is required" };
  const setupValues = [output.trustAnchorMode, output.trustAnchorDirectory, output.trustAnchorHumanName, output.trustAnchorExistingKey];
  if (setupValues.some((value) => value !== undefined)) {
    if (setupValues.some((value) => value === undefined)) return { error: "trust-anchor bootstrap requires all four --trust-anchor-* flags" };
    if (!output.runner) return { error: "trust-anchor bootstrap requires an explicit --runner" };
    if (output.stepCap !== undefined) return { error: "trust-anchor bootstrap does not accept --step-cap" };
    if (output.trustAnchorMode === "existing" && !isAbsolute(output.trustAnchorExistingKey)) {
      return { error: "existing trust-anchor bootstrap requires an absolute --trust-anchor-existing-key path" };
    }
    if (output.trustAnchorMode === "new" && output.trustAnchorExistingKey !== "none") {
      return { error: "new trust-anchor bootstrap requires --trust-anchor-existing-key none" };
    }
  }
  return output;
}

function childEnvironment(env) {
  if (!env) return null;
  const override = env.PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE;
  return typeof override === "string" && override.length > 0
    ? { ...env, HOME: override, USERPROFILE: override }
    : env;
}

function parseJsonFile(path, read) {
  try { return JSON.parse(read(path, "utf8")); } catch { return null; }
}

function repositoryAnchors(policy) {
  if (policy?.schema === CRITICAL_HUMAN_PROOF_POLICY_V3 && Array.isArray(policy.trustAnchors)) return policy.trustAnchors;
  return policy?.trustAnchor && typeof policy.trustAnchor === "object" ? [policy.trustAnchor] : [];
}

function validAuthority(authority, humanName) {
  return typeof authority?.keyReference === "string"
    && typeof authority?.publicKeySha256 === "string"
    && /^[a-f0-9]{64}$/u.test(authority.publicKeySha256)
    && authority.humanName === humanName;
}

function recoveryReceiptMatches(receipt, { root, directory, authority, humanName }) {
  return receipt?.schema === TRUST_ANCHOR_RECOVERY_SCHEMA
    && receipt.root === root
    && receipt.directory === directory
    && receipt.humanName === humanName
    && receipt.keyReference === authority?.keyReference
    && receipt.publicKeySha256 === authority?.publicKeySha256;
}

function fileSnapshot(path, { exists, lstat, read }) {
  if (!exists(path)) return { path, present: false, bytes: null, mode: null };
  const stat = lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) return null;
  return { path, present: true, bytes: read(path), mode: stat.mode & 0o777 };
}

function atomicReplaceFile(path, bytes, mode = 0o600) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.trust-anchor-bootstrap-${process.pid}`;
  const fd = openSync(temporary, "wx", mode);
  try { writeFileSync(fd, bytes); }
  finally { closeSync(fd); }
  renameSync(temporary, path);
}

function restoreSnapshots(snapshots, exists = existsSync) {
  try {
    for (const snapshot of [...snapshots].reverse()) {
      if (snapshot.present) atomicReplaceFile(snapshot.path, snapshot.bytes, snapshot.mode);
      else if (exists(snapshot.path)) unlinkSync(snapshot.path);
    }
    return true;
  } catch {
    return false;
  }
}

function removeOwnedPemImportDirectory(directory, { exists, lstat }) {
  if (!exists(directory)) return true;
  const allowed = new Set(["po-private.pem", "po-public.pem", "trust-policy.json"]);
  try {
    const names = readdirSync(directory);
    if (names.some((name) => !allowed.has(name))) return false;
    for (const name of names) {
      const path = join(directory, name);
      const stat = lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) return false;
    }
    for (const name of names) unlinkSync(join(directory, name));
    rmdirSync(directory);
    return true;
  } catch {
    return false;
  }
}

/**
 * One attended first-anchor transaction owned by the public onboarding driver. The
 * underlying setup command is deliberately not published as a raw shell command: this
 * function supplies its exact argv, suppresses its JSON stdout (which contains filesystem
 * paths), verifies both durable directory pointers, and materializes only the public
 * key-reference/digest pair into the repository policy. The parent driver never reads or
 * returns private-key bytes; the attended po-human-approval child exclusively owns key
 * generation/import, and that child's ordinary stdout is suppressed from the driver JSON.
 */
export function applyTrustAnchorBootstrap({
  rootDir,
  mode,
  directory,
  humanName,
  existingKey,
  env = null,
  runSetup = spawnSync,
  runGit = spawnSync,
  read = readFileSync,
  exists = existsSync,
  lstat = lstatSync,
  writeMachine = writeMachinePlane,
  writePolicy = atomicReplaceFile,
} = {}) {
  const root = resolve(rootDir);
  const targetDirectory = resolve(directory);
  const targetDirectoryExisted = exists(targetDirectory);
  const effectiveEnv = childEnvironment(env) ?? process.env;
  const policyPath = join(root, CRITICAL_HUMAN_PROOF_POLICY_PATH);
  const existingPolicy = exists(policyPath) ? parseJsonFile(policyPath, read) : null;
  if (exists(policyPath) && existingPolicy === null) return { ok: false, code: "TRUST-ANCHOR-REPOSITORY-POLICY-INVALID" };

  const home = effectiveEnv.PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE
    ?? effectiveEnv.HOME
    ?? effectiveEnv.USERPROFILE
    ?? homedir();
  const machineDependencies = { homedirFn: () => home };
  const machinePath = machinePlaneFilePath(machineDependencies);
  if (machinePath === null) return { ok: false, code: "TRUST-ANCHOR-MACHINE-PLANE-UNAVAILABLE" };
  const common = runGit("git", ["-C", root, "rev-parse", "--path-format=absolute", "--git-common-dir"], {
    encoding: "utf8", shell: false, env: effectiveEnv,
  });
  if (common?.status !== 0) return { ok: false, code: "TRUST-ANCHOR-REPOSITORY-POINTER-READBACK-FAILED" };
  const commonDir = resolve(root, String(common.stdout ?? "").trim());
  const repositoryPointerPath = join(commonDir, "agent-pipeline", "po-key-directory.json");
  const recoveryPath = join(commonDir, "agent-pipeline", "first-anchor-bootstrap-recovery.json");
  const snapshots = [policyPath, machinePath, repositoryPointerPath]
    .map((path) => fileSnapshot(path, { exists, lstat, read }));
  if (snapshots.some((snapshot) => snapshot === null)) return { ok: false, code: "TRUST-ANCHOR-TRANSACTION-PREIMAGE-UNSAFE" };
  let setupStarted = false;
  const fail = (code) => {
    if (!setupStarted) return { ok: false, code };
    const stateRestored = restoreSnapshots(snapshots, exists);
    const importedCopyRestored = mode !== "existing" || targetDirectoryExisted
      || removeOwnedPemImportDirectory(targetDirectory, { exists, lstat });
    return stateRestored && importedCopyRestored
      ? { ok: false, code }
      : { ok: false, code: `${code}-ROLLBACK-FAILED` };
  };

  const observedPlane = readMachinePlane(machineDependencies);
  if (observedPlane.status === "invalid") return fail("TRUST-ANCHOR-MACHINE-PLANE-INVALID");
  if (observedPlane.status === "valid"
    && typeof observedPlane.plane.poKeyDirectory === "string"
    && observedPlane.plane.poKeyDirectory.length > 0
    && resolve(observedPlane.plane.poKeyDirectory) !== targetDirectory) {
    return fail("TRUST-ANCHOR-MACHINE-CONFLICT");
  }
  const beforeRepositoryPointer = parseJsonFile(repositoryPointerPath, read);
  if (beforeRepositoryPointer !== null
    && resolve(beforeRepositoryPointer.poKeyDirectory ?? ".") !== targetDirectory) {
    return fail("TRUST-ANCHOR-REPOSITORY-POINTER-CONFLICT");
  }
  const beforeAuthority = parseJsonFile(join(targetDirectory, "trust-policy.json"), read);
  const recoveryReceipt = parseJsonFile(recoveryPath, read);
  if (exists(recoveryPath)
    && (mode !== "new" || !validAuthority(beforeAuthority, humanName)
      || !recoveryReceiptMatches(recoveryReceipt, {
        root, directory: targetDirectory, authority: beforeAuthority, humanName,
      }))) {
    return fail("TRUST-ANCHOR-RECOVERY-RECEIPT-CONFLICT");
  }
  const recoveringNewAuthority = mode === "new" && recoveryReceipt !== null
    && validAuthority(beforeAuthority, humanName)
    && recoveryReceiptMatches(recoveryReceipt, {
      root, directory: targetDirectory, authority: beforeAuthority, humanName,
    });
  const currentAnchors = repositoryAnchors(existingPolicy);
  if (currentAnchors.length > 0) {
    const same = currentAnchors.length === 1
      && beforeAuthority !== null
      && currentAnchors[0].keyReference === beforeAuthority.keyReference
      && currentAnchors[0].publicKeySha256 === beforeAuthority.publicKeySha256;
    if (!same) return fail("TRUST-ANCHOR-REPOSITORY-CONFLICT");
    const pointersMatch = observedPlane.status === "valid"
      && resolve(observedPlane.plane.poKeyDirectory ?? ".") === targetDirectory
      && resolve(beforeRepositoryPointer?.poKeyDirectory ?? ".") === targetDirectory;
    if (pointersMatch) {
      if (recoveringNewAuthority) {
        try { unlinkSync(recoveryPath); } catch { return fail("TRUST-ANCHOR-RECOVERY-RECEIPT-CLEANUP-FAILED"); }
      }
      return { ok: true, code: "TRUST-ANCHOR-BOOTSTRAP-COMPLETE", mode, alreadyComplete: true };
    }
    return fail("TRUST-ANCHOR-PARTIAL-STATE-REQUIRES-NOVA-B");
  }

  const setupArgs = [
    PO_HUMAN_APPROVAL_SCRIPT_PATH,
    "setup",
    "--repo-root", root,
    "--directory", targetDirectory,
    "--human-name", humanName,
  ];
  if (mode === "existing") setupArgs.push("--existing-key", resolve(existingKey));
  setupStarted = true;
  if (!recoveringNewAuthority) {
    const setup = runSetup(process.execPath, setupArgs, {
      shell: false,
      stdio: ["inherit", "ignore", "inherit"],
      env: effectiveEnv,
    });
    if (setup?.error || setup?.status !== 0) return fail("TRUST-ANCHOR-SETUP-FAILED");
  }

  const authority = parseJsonFile(join(targetDirectory, "trust-policy.json"), read);
  if (!validAuthority(authority, humanName)) {
    return fail("TRUST-ANCHOR-AUTHORITY-READBACK-FAILED");
  }
  if (mode === "new" && !recoveringNewAuthority) {
    try {
      atomicReplaceFile(recoveryPath, `${JSON.stringify({
        schema: TRUST_ANCHOR_RECOVERY_SCHEMA,
        root,
        directory: targetDirectory,
        humanName,
        keyReference: authority.keyReference,
        publicKeySha256: authority.publicKeySha256,
      }, null, 2)}\n`);
    } catch {
      return fail("TRUST-ANCHOR-RECOVERY-RECEIPT-WRITE-FAILED");
    }
  }

  const anchoredAlready = currentAnchors.length === 1
    && currentAnchors[0].keyReference === authority.keyReference
    && currentAnchors[0].publicKeySha256 === authority.publicKeySha256;
  if (currentAnchors.length > 0 && !anchoredAlready) return fail("TRUST-ANCHOR-REPOSITORY-CONFLICT");

  if (recoveringNewAuthority) {
    try {
      atomicReplaceFile(repositoryPointerPath, `${JSON.stringify({
        schema: "pipeline.po-key-directory.v1",
        poKeyDirectory: targetDirectory,
        updatedAt: new Date().toISOString(),
      }, null, 2)}\n`);
    } catch {
      return fail("TRUST-ANCHOR-REPOSITORY-POINTER-WRITE-FAILED");
    }
  }
  const repositoryPointer = parseJsonFile(repositoryPointerPath, read);
  if (resolve(repositoryPointer?.poKeyDirectory ?? ".") !== targetDirectory) {
    return fail("TRUST-ANCHOR-REPOSITORY-POINTER-READBACK-FAILED");
  }
  const nextPlane = observedPlane.status === "valid"
    ? { ...observedPlane.plane, poKeyDirectory: targetDirectory, updatedAt: new Date().toISOString() }
    : {
      schema: MACHINE_PLANE_SCHEMA,
      poKeyDirectory: targetDirectory,
      pushApprovalDefault: "signature",
      routing: null,
      language: null,
      session: null,
      usage: null,
      updatedAt: new Date().toISOString(),
    };
  try { writeMachine(nextPlane, machineDependencies); }
  catch { return fail("TRUST-ANCHOR-MACHINE-POINTER-WRITE-FAILED"); }
  const machinePlane = readMachinePlane(machineDependencies);
  if (machinePlane.status !== "valid" || resolve(machinePlane.plane.poKeyDirectory ?? ".") !== targetDirectory) {
    return fail("TRUST-ANCHOR-MACHINE-POINTER-READBACK-FAILED");
  }

  if (!exists(policyPath)) return fail("TRUST-ANCHOR-REPOSITORY-POLICY-MISSING");
  const stat = lstat(policyPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    return fail("TRUST-ANCHOR-REPOSITORY-POLICY-UNSAFE");
  }
  if (!anchoredAlready) {
    const nextPolicy = {
      ...existingPolicy,
      schema: CRITICAL_HUMAN_PROOF_POLICY_V3,
      trustAnchors: [{ keyReference: authority.keyReference, publicKeySha256: authority.publicKeySha256 }],
    };
    delete nextPolicy.trustAnchor;
    try { writePolicy(policyPath, `${JSON.stringify(nextPolicy, null, 2)}\n`, stat.mode & 0o777); }
    catch { return fail("TRUST-ANCHOR-REPOSITORY-MATERIALIZATION-WRITE-FAILED"); }
  }
  const readback = parseJsonFile(policyPath, read);
  const anchors = repositoryAnchors(readback);
  if (anchors.length !== 1
    || anchors[0].keyReference !== authority.keyReference
    || anchors[0].publicKeySha256 !== authority.publicKeySha256) {
    return fail("TRUST-ANCHOR-REPOSITORY-MATERIALIZATION-READBACK-FAILED");
  }
  if (mode === "new" && exists(recoveryPath)) {
    try { unlinkSync(recoveryPath); }
    catch { return fail("TRUST-ANCHOR-RECOVERY-RECEIPT-CLEANUP-FAILED"); }
  }
  return { ok: true, code: "TRUST-ANCHOR-BOOTSTRAP-COMPLETE", mode };
}

/**
 * Runs one onboarding-cli invocation and classifies the outcome. Never throws: every
 * failure mode (the process itself could not start, stdout was not valid JSON, or the
 * process exited non-zero) is folded into a typed `ok: false` result the caller reports
 * rather than crashes on.
 */
function runOnboardingStep({ executable, argv, run, env = null }) {
  const options = { encoding: "utf8", shell: false, maxBuffer: 8 * 1024 * 1024 };
  // Opt-in only: omitting `env` (the default) leaves `options` exactly as before this
  // seam existed, so a caller that never supplies one gets byte-identical behaviour --
  // the child inherits the real process environment via spawnSync's own default, same as
  // it always did. Supplying `env` is the seam a caller uses to override what the spawned
  // `project-onboarding-v3.mjs` CLI resolves its homedir against (see that script's own
  // `PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE` handling), extending across the process
  // boundary the same injected-dependency pattern the in-process library callers already
  // have (lib/machine-plane.mjs `homedirFn`).
  if (env) {
    const homedirOverride = env.PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE;
    // The project-onboarding CLI consumes the explicit variable above, while a few
    // machine-plane helpers it delegates to still reach Node's process-level
    // `os.homedir()` default. Keep both reads on the same caller-selected fixture home:
    // POSIX resolves that default through HOME and Windows through USERPROFILE. Without
    // this bridge, a driver call carrying an explicit hermetic home could still seed the
    // real operator's registered key into the disposable project. No override means no
    // env object here at all, preserving ordinary child inheritance byte-for-byte.
    options.env = typeof homedirOverride === "string" && homedirOverride.length > 0
      ? { ...env, HOME: homedirOverride, USERPROFILE: homedirOverride }
      : env;
  }
  const result = run(executable, argv, options);
  if (result?.error) {
    return { ok: false, faultCode: "spawn-failed", exitCode: result.status ?? null, stderr: String(result.error?.message ?? "") };
  }
  const exitCode = result?.status ?? null;
  let parsed = null;
  let parseFailed = false;
  try {
    parsed = JSON.parse(String(result?.stdout ?? ""));
  } catch {
    parseFailed = true;
  }
  if (parseFailed) {
    return {
      ok: false,
      faultCode: "unparseable-output",
      exitCode,
      stdout: String(result?.stdout ?? "").slice(0, 4000),
      stderr: String(result?.stderr ?? "").slice(0, 4000),
    };
  }
  if (exitCode !== 0) {
    return { ok: false, faultCode: "nonzero-exit", exitCode, output: parsed, stderr: String(result?.stderr ?? "").slice(0, 4000) };
  }
  return { ok: true, exitCode, output: parsed };
}

function isPlainSuccessfulCommandOutput(stepResult) {
  if (stepResult?.faultCode !== "unparseable-output" || stepResult.exitCode !== 0) return false;
  const trimmed = String(stepResult.stdout ?? "").trimStart();
  // A JSON-shaped document that failed parsing is malformed protocol output,
  // never a successful human-text command. Empty stdout and ordinary CLI
  // status prose are both legitimate success shapes for a published command
  // whose durable effect is observed by the following fresh inspect.
  return !trimmed.startsWith("{") && !trimmed.startsWith("[");
}

function buildInspectArgv(root, runner) {
  return runner === null
    ? [ONBOARDING_SCRIPT_PATH, "inspect", "--root", root]
    : [ONBOARDING_SCRIPT_PATH, "inspect", "--root", root, "--runner", runner];
}

/**
 * Deterministic, key-sorted JSON serialization used only to compare two `inspect`
 * responses for equivalence (the re-anchor progress check in `driveOnboardingInit`). Plain
 * `JSON.stringify` equality would already hold for two same-shaped objects produced by the
 * same code path, but sorting keys first removes any dependence on insertion order, which
 * is not part of the onboarding CLI's contract -- so this cannot flag a false "no progress"
 * over a harmless key-ordering difference.
 */
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Reads `nextAction.pendingAsks` (the library's own sibling-ask channel;
 * lib/project-onboarding-v3.mjs `withPendingAsksSurfacedOnNextAction()`) generically: this
 * driver holds no knowledge of what any individual ask MEANS, only that a well-formed
 * pending ask is an object carrying a string `kind` -- the same shape every `collect-input`
 * action already uses elsewhere in this protocol, so recognizing it is protocol handling,
 * not domain knowledge. Absent is not malformed -- most `nextAction`s carry none.
 * Present-but-not-an-array, or an array with any entry that is not itself an object with a
 * string `kind`, is malformed: reported rather than either crashed on or silently treated
 * as "no pending asks" (NVA-V3-PENDINGASKS DoD 4).
 */
function extractPendingAsks(nextAction) {
  const raw = nextAction && typeof nextAction === "object" ? nextAction.pendingAsks : undefined;
  if (raw === undefined) return { present: false, malformed: false, asks: [] };
  if (!Array.isArray(raw)) return { present: true, malformed: true, asks: [] };
  const wellShaped = raw.every((entry) => entry !== null && typeof entry === "object" && typeof entry.kind === "string");
  if (!wellShaped) return { present: true, malformed: true, asks: [] };
  return { present: true, malformed: false, asks: raw };
}

/**
 * The driver loop itself. `run` (spawnSync-shaped: `(executable, argv, options) =>
 * { status, stdout, stderr, error }`) is the sole injection seam, so tests can either
 * spawn the real onboarding CLI against a real temporary directory, or supply a synthetic
 * responder to exercise the step-cap path without a genuinely non-converging real chain.
 *
 * `env`, when supplied, is threaded into every spawned step's own `options.env`
 * (`runOnboardingStep`) -- a caller-supplied override the default `spawnSync` respects
 * exactly like any other spawn option. Left `null` (the default), a step's options carry
 * no `env` key at all, so the child inherits the real process environment exactly as
 * before this parameter existed. The intended use is threading a fixture `HOME` (via
 * `PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE`, honoured by `project-onboarding-v3.mjs`'s own
 * `main()`) across the process boundary, so this driver's result does not depend on
 * whatever machine-plane state happens to live under the real caller's `$HOME`
 * (backlog: 2026-08-28-a-verify-gate-suite-reads-real-machine-state-through-a-subprocess).
 */
export function driveOnboardingInit({ rootDir, runner = null, stepCap = DEFAULT_STEP_CAP, run = spawnSync, env = null } = {}) {
  const root = resolve(rootDir);
  const steps = [];
  let executable = "node";
  let argv = buildInspectArgv(root, runner);

  // `isAnchorStep` marks the step about to run as the bootstrap/re-anchor `inspect` call,
  // as opposed to a `command` action being executed from a previous result. `lastAnchorOutput`
  // holds the most recent anchor's own response (null before the first one completes), for
  // the progress comparison below. `executedSinceAnchor` becomes true once at least one
  // non-anchor step has run since the last anchor -- re-anchoring requires it, so an anchor
  // can never immediately re-anchor itself (see header comment).
  let isAnchorStep = true;
  let lastAnchorOutput = null;
  let executedSinceAnchor = false;

  for (let stepIndex = 0; stepIndex < stepCap; stepIndex += 1) {
    const stepResult = runOnboardingStep({ executable, argv, run, env });
    steps.push({
      executable,
      argv,
      exitCode: stepResult.exitCode,
      faultCode: stepResult.ok ? null : stepResult.faultCode,
    });

    if (!stepResult.ok) {
      if (!isAnchorStep && isPlainSuccessfulCommandOutput(stepResult)) {
        // A command action is allowed to be an ordinary human-facing CLI, not
        // another JSON protocol endpoint. Exit 0 is the success contract; its
        // durable result is established by re-entering through the public
        // inspect anchor, exactly like a parsed successful command that
        // settles without nextAction. Never apply this to the anchor itself:
        // inspect owns the JSON protocol and malformed/plain output there is
        // still an error.
        steps[steps.length - 1].faultCode = null;
        steps[steps.length - 1].outputKind = "plain-success";
        executable = "node";
        argv = buildInspectArgv(root, runner);
        isAnchorStep = true;
        continue;
      }
      return {
        schema: SCHEMA,
        runner,
        root,
        outcome: "error",
        stepCap,
        stepsExecuted: steps.length,
        steps,
        error: {
          faultCode: stepResult.faultCode,
          exitCode: stepResult.exitCode,
          stderr: stepResult.stderr ?? null,
          stdout: stepResult.stdout ?? null,
        },
        final: stepResult.output ?? null,
      };
    }

    const output = stepResult.output;
    const nextAction = output && typeof output === "object" ? output.nextAction : undefined;

    const wasAnchorStep = isAnchorStep;
    isAnchorStep = false;
    if (wasAnchorStep) {
      const previousAnchorOutput = lastAnchorOutput;
      lastAnchorOutput = output;
      executedSinceAnchor = false;
      if (previousAnchorOutput !== null && canonicalJson(output) === canonicalJson(previousAnchorOutput)) {
        // The step(s) executed since the previous anchor changed nothing the CLI's own
        // state reports -- stop and say so explicitly rather than spending the remaining
        // step cap re-anchoring at the same non-converging state (see header comment).
        return {
          schema: SCHEMA,
          runner,
          root,
          outcome: "no-progress",
          stepCap,
          stepsExecuted: steps.length,
          steps,
          final: output,
        };
      }
    } else {
      executedSinceAnchor = true;
    }

    if (nextAction && typeof nextAction === "object" && nextAction.kind === "command") {
      const pendingAsksInfo = extractPendingAsks(nextAction);
      if (pendingAsksInfo.malformed) {
        // Not stop-worthy -- malformed metadata cannot honestly be presented to a human as
        // a question -- but not silently swallowed either: visible on the step record that
        // is already carried in every terminal return below.
        steps[steps.length - 1].pendingAsksFault = "malformed-pending-asks-ignored";
      } else if (pendingAsksInfo.asks.length > 0) {
        // A published pending ask exists on this exact step -- stop and surface it rather
        // than executing straight past it (NVA-V3-PENDINGASKS). The command itself is left
        // untouched on disk; a re-entrant run continues once the human (or the CLI command
        // the ask names) resolves whatever made it pending.
        return {
          schema: SCHEMA,
          runner,
          root,
          outcome: "pending-asks",
          stepCap,
          stepsExecuted: steps.length,
          steps,
          pendingAsks: pendingAsksInfo.asks,
          final: output,
        };
      }

      const argvValid = typeof nextAction.executable === "string"
        && Array.isArray(nextAction.argv)
        && nextAction.argv.every((part) => typeof part === "string");
      if (!argvValid) {
        return {
          schema: SCHEMA,
          runner,
          root,
          outcome: "error",
          stepCap,
          stepsExecuted: steps.length,
          steps,
          error: { faultCode: "malformed-command-action", exitCode: null, stderr: null, stdout: null },
          final: output,
        };
      }
      executable = nextAction.executable;
      argv = nextAction.argv;
      continue;
    }

    if (nextAction && typeof nextAction === "object" && nextAction.kind === "collect-input") {
      const pendingAsksInfo = extractPendingAsks(nextAction);
      if (pendingAsksInfo.malformed) {
        steps[steps.length - 1].pendingAsksFault = "malformed-pending-asks-ignored";
      }
      return {
        schema: SCHEMA,
        runner,
        root,
        outcome: "collect-input",
        stepCap,
        stepsExecuted: steps.length,
        steps,
        collectInput: nextAction,
        // A collect-input action can ALSO carry sibling pendingAsks (a genuine question of
        // its own, plus an unrelated pending ask on the same step) -- both are surfaced,
        // neither lost (NVA-V3-PENDINGASKS DoD 3).
        pendingAsks: pendingAsksInfo.asks,
        final: output,
      };
    }

    if ((nextAction === null || nextAction === undefined) && output?.status === "ready") {
      return { schema: SCHEMA, runner, root, outcome: "ready", stepCap, stepsExecuted: steps.length, steps, final: output };
    }

    if (nextAction === null || nextAction === undefined) {
      if (executedSinceAnchor) {
        // A step this driver EXECUTED settled with no `nextAction` and a non-"ready"
        // status -- re-anchor on a fresh `inspect` rather than stopping (see header
        // comment). This is the only place `isAnchorStep`/`argv` are reset outside the
        // initial setup above.
        executable = "node";
        argv = buildInspectArgv(root, runner);
        isAnchorStep = true;
        continue;
      }
      // Reached with no executed step since the last anchor -- the anchoring `inspect`
      // itself rested here (its own resting response, or a re-anchor that already passed
      // the progress check above). Never re-anchor from here: that would re-run the
      // identical anchor command with nothing having executed in between. E.g. a
      // standalone recovery command's own plan response (`plan-partial-authority`'s
      // `"selection-required"`, which uses a `selection` field instead of `nextAction`) --
      // not reachable by a fresh repository's own `inspect` walk, but never guessed at if
      // it somehow is: report and stop.
      return {
        schema: SCHEMA,
        runner,
        root,
        outcome: "no-automatic-next-step",
        stepCap,
        stepsExecuted: steps.length,
        steps,
        final: output,
      };
    }

    // A `nextAction` with a kind this driver does not execute (e.g. `restart-process`,
    // which needs an attended external terminal) -- reported honestly, never attempted.
    return {
      schema: SCHEMA,
      runner,
      root,
      outcome: "unsupported-next-action",
      stepCap,
      stepsExecuted: steps.length,
      steps,
      final: output,
    };
  }

  return { schema: SCHEMA, runner, root, outcome: "step-cap-exceeded", stepCap, stepsExecuted: steps.length, steps, final: null };
}

export function main(args = process.argv.slice(2), {
  write = process.stdout.write.bind(process.stdout),
  writeError = process.stderr.write.bind(process.stderr),
} = {}) {
  const options = parseArgs(args);
  if (options.help) {
    write(`${usage()}\n`);
    return 0;
  }
  if (options.error) {
    writeError(`${usage()}\n${options.error}\n`);
    return 2;
  }
  let bootstrap = null;
  if (options.trustAnchorMode) {
    bootstrap = applyTrustAnchorBootstrap({
      rootDir: options.root,
      mode: options.trustAnchorMode,
      directory: options.trustAnchorDirectory,
      humanName: options.trustAnchorHumanName,
      existingKey: options.trustAnchorExistingKey,
    });
    if (!bootstrap.ok) {
      write(`${JSON.stringify({ schema: SCHEMA, runner: options.runner, root: resolve(options.root), outcome: "error", bootstrap }, null, 2)}\n`);
      return 1;
    }
  }
  const result = driveOnboardingInit({ rootDir: options.root, runner: options.runner ?? null, stepCap: options.stepCap });
  if (bootstrap) result.bootstrap = bootstrap;
  write(`${JSON.stringify(result, null, 2)}\n`);
  return result.outcome === "ready" || result.outcome === "collect-input" || result.outcome === "pending-asks" ? 0 : 1;
}

if (isDirectInvocation(import.meta.url)) process.exit(main());
