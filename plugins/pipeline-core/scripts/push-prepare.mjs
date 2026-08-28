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
 * network. Everything it prints is a report or a command for a HUMAN or a
 * LATER agent call to run; this script itself runs none of them.
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
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { readCriticalHumanProofPolicy } from "../lib/critical-human-proof-policy.mjs";
import { gateConfig, loadManifestSafe } from "../lib/manifest.mjs";
import { derivePoGateRepositoryFingerprint } from "../lib/po-gate-authority.mjs";
import { resolveAuthorityArtifactPath } from "../lib/project-authority.mjs";
import { authorizeCriticalPushCommand, parseHumanArgs } from "./po-human-approval.mjs";
import { projectDir, readState, run as pipelineStateRun } from "./pipeline-state.mjs";
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
 */
export function checkCriticalHumanProofPolicy(dir, deps = {}) {
  const readPolicy = deps.readCriticalHumanProofPolicy ?? readCriticalHumanProofPolicy;
  const policy = readPolicy(dir);
  const id = "critical-human-proof-policy";
  if (!policy.ok) {
    return { id, ok: false, message: `project/critical-human-proof.json could not be read (${policy.code}).`, remedy: "fix or remove project/critical-human-proof.json" };
  }
  const anchors = policy.trustAnchors !== null ? policy.trustAnchors : (policy.trustAnchor ? [policy.trustAnchor] : []);
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
 * F7 rendering rule (skills/pipeline-start/references/failure-cases.md): one
 * logical segment per physical line, every line but the last ending in a
 * single trailing backslash, continuation lines indented by two spaces, never
 * splitting a token or an absolute path across lines.
 */
export function renderF7Lines(segments) {
  return segments.map((segment, index) => {
    const body = index === 0 ? segment : `  ${segment}`;
    return index === segments.length - 1 ? body : `${body} \\`;
  });
}

/** Groups a node-script argv into F7 segments: exe, script, subcommand, then one "--flag value" pair per line. */
export function segmentsForNodeCommand(executable, argv) {
  const segments = [executable, argv[0], argv[1]];
  for (let index = 2; index < argv.length; index += 2) segments.push(`${argv[index]} ${argv[index + 1]}`);
  return segments;
}

export function pushPrepareReport(argv, deps = {}) {
  const dir = deps.dir ?? projectDir();
  const parsed = parseArgs(argv);
  if (parsed.error) return { ok: false, error: parsed.error };
  const { by, remote, destination } = parsed;

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
  const authorizeLines = renderF7Lines(segmentsForNodeCommand(authorize.executable, authorize.argv));

  const artifacts = criticalArtifactPaths(dir, directory, deps);
  const approveArgv = [
    "plugins/pipeline-core/scripts/pipeline-state.mjs", "approve-push",
    "--by", by, "--remote", remote, "--destination", destination,
    "--proof-request", artifacts.request, "--proof-authority", artifacts.authority, "--proof", artifacts.proof,
  ];
  const approveLines = renderF7Lines(segmentsForNodeCommand("node", approveArgv));

  const gitPushLine = `git push ${remote} HEAD:${destination}`;

  report.subjectSha256 = subjectSha256;
  return { ok: true, report, lines: { authorize: authorizeLines, approvePush: approveLines, gitPush: gitPushLine } };
}

function printReport(result) {
  process.stdout.write(`${JSON.stringify(result.report, null, 2)}\n`);
  if (result.lines) {
    process.stdout.write("\n# Copy-paste commands (F7 rendering: one token per line, trailing backslash continuation)\n\n");
    process.stdout.write("## 1) HUMAN, at their own terminal: authorize-critical (prepares + signs, one invocation)\n\n");
    process.stdout.write(`${result.lines.authorize.join("\n")}\n\n`);
    process.stdout.write("## 2) AGENT: consume the proof into pipeline state\n\n");
    process.stdout.write(`${result.lines.approvePush.join("\n")}\n\n`);
    process.stdout.write("## 3) AGENT: push\n\n");
    process.stdout.write(`${result.lines.gitPush}\n`);
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
