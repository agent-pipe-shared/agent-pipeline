#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Diagnose the local Codex app-server daemon without treating it as a model,
 * worker, or background-wakeup attestation.  A stale daemon is a known local
 * cause of missing visible subagent activity; this adapter offers one bounded
 * restart and an exact re-observation, never a restart loop.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { resolveCriticHighRiskRoute } from "../lib/critic-route-v3.mjs";

export const CODEX_APP_SERVER_HEALTH_SCHEMA = "pipeline.codex-app-server-health.v1";
export const CODEX_APP_SERVER_DOCTOR_SCHEMA = "pipeline.codex-app-server-doctor.v1";
const VERSION_KEYS = ["status", "backend", "managedCodexPath", "managedCodexVersion", "socketPath", "cliVersion", "appServerVersion"];
const OPERATOR_ACTION = "codex app-server daemon restart && codex doctor";
const WSL_OPERATOR_ACTION = "Codex app-server daemon lifecycle is Unix-only; run Codex with this pipeline inside WSL (Windows Subsystem for Linux) instead of on native Windows.";
const MODEL_PROBE = fileURLToPath(new URL("./codex-app-server-model-probe.mjs", import.meta.url));

function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function isNonEmptyString(value) { return typeof value === "string" && value.length > 0; }

function parseVersionObservation(stdout) {
  if (!isNonEmptyString(stdout)) return null;
  let parsed;
  try { parsed = JSON.parse(stdout); } catch { return null; }
  if (!isObject(parsed) || Object.keys(parsed).length !== VERSION_KEYS.length || !VERSION_KEYS.every((key) => Object.hasOwn(parsed, key))) return null;
  if (parsed.status !== "running" || !isNonEmptyString(parsed.backend) || !isNonEmptyString(parsed.managedCodexPath)
    || !isNonEmptyString(parsed.managedCodexVersion) || !isNonEmptyString(parsed.socketPath)
    || !isNonEmptyString(parsed.cliVersion) || !isNonEmptyString(parsed.appServerVersion)) return null;
  return parsed;
}

function executionFailure(result) {
  if (result?.error?.code === "ENOENT") return "CAS-CODEX-UNAVAILABLE";
  if (result?.error !== undefined || result?.status === null || result?.status === undefined) return "CAS-EXECUTION-UNAVAILABLE";
  return null;
}

function invoke(executable, args, spawn = spawnSync) {
  return spawn(executable, args, {
    encoding: "utf8",
    shell: false,
    timeout: 15_000,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
  });
}

function observeModelReadiness(daemon, model, spawn = spawnSync) {
  if (typeof model !== "string" || model.length === 0) return false;
  const result = spawn(process.execPath, [MODEL_PROBE, daemon.managedCodexPath, model], {
    encoding: "utf8",
    shell: false,
    timeout: 65_000,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
  });
  if (result?.status !== 0) return false;
  try {
    const value = JSON.parse(String(result.stdout ?? ""));
    return value?.schema === "pipeline.codex-app-server-model-probe.v1" && value.status === "ready" && value.code === "CAS-MODEL-READY";
  } catch { return false; }
}

function unavailable(code, phase, detail = null) {
  return {
    schema: CODEX_APP_SERVER_HEALTH_SCHEMA,
    status: "unavailable",
    code,
    phase,
    daemon: null,
    recovery: "not-attempted",
    operatorAction: code === "CAS-CODEX-UNAVAILABLE" || code === "CAS-EXECUTION-UNAVAILABLE" ? "Run Codex Doctor in an attended local Codex session." : OPERATOR_ACTION,
    detail,
  };
}

function stale(code, phase, detail = null) {
  return {
    schema: CODEX_APP_SERVER_HEALTH_SCHEMA,
    status: "stale",
    code,
    phase,
    daemon: null,
    recovery: "not-attempted",
    operatorAction: OPERATOR_ACTION,
    detail,
  };
}

/** The single read-only daemon version observation. */
export function observeCodexAppServer({ executable = "codex", spawn = spawnSync, requireModelReady = false, criticModel = null } = {}) {
  const result = invoke(executable, ["app-server", "daemon", "version"], spawn);
  const failure = executionFailure(result);
  if (failure !== null) return unavailable(failure, "observe", result?.error?.code ?? null);
  if (result.status !== 0) return stale("CAS-DAEMON-UNREACHABLE", "observe", result.stderr?.trim() || null);
  const daemon = parseVersionObservation(result.stdout);
  if (daemon === null) return stale("CAS-DAEMON-INVALID-OBSERVATION", "observe");
  if (daemon.cliVersion !== daemon.appServerVersion || daemon.managedCodexVersion !== daemon.appServerVersion) {
    return stale("CAS-DAEMON-VERSION-DRIFT", "observe", daemon);
  }
  if (requireModelReady && !observeModelReadiness(daemon, criticModel, spawn)) {
    return stale("CAS-MODEL-UNAVAILABLE", "observe", daemon);
  }
  return {
    schema: CODEX_APP_SERVER_HEALTH_SCHEMA,
    status: "ready",
    code: "CAS-READY",
    phase: "observe",
    daemon,
    recovery: "not-needed",
    operatorAction: null,
    detail: null,
  };
}

/**
 * Run at most one fixed daemon restart, then require a fresh healthy version
 * observation. It never invokes a model, starts a pipeline worker, or claims
 * that the current host exposes background wakeups.
 */
export function checkCodexAppServer({ recover = false, executable = "codex", spawn = spawnSync, requireModelReady = false, criticModel = null, platform = process.platform } = {}) {
  const first = observeCodexAppServer({ executable, spawn, requireModelReady, criticModel });
  if (first.status === "ready" || recover !== true || first.code === "CAS-CODEX-UNAVAILABLE" || first.code === "CAS-EXECUTION-UNAVAILABLE") return first;
  if (platform === "win32") {
    return {
      ...first,
      status: "unsupported",
      code: "CAS-PLATFORM-UNSUPPORTED",
      phase: "recover",
      recovery: "not-applicable",
      operatorAction: WSL_OPERATOR_ACTION,
      detail: "codex app-server daemon restart is Unix-only and cannot run on native Windows (win32); use WSL to run Codex with this pipeline.",
    };
  }
  const restart = invoke(executable, ["app-server", "daemon", "restart"], spawn);
  const failure = executionFailure(restart);
  if (failure !== null || restart.status !== 0) {
    return {
      ...first,
      status: "unavailable",
      code: "CAS-DAEMON-RECOVERY-FAILED",
      phase: "recover",
      recovery: "failed",
      detail: failure ?? (restart.stderr?.trim() || null),
    };
  }
  const after = observeCodexAppServer({ executable, spawn, requireModelReady, criticModel });
  if (after.status !== "ready") {
    return { ...after, code: "CAS-DAEMON-RECOVERY-FAILED", phase: "recover", recovery: "failed" };
  }
  return { ...after, phase: "recover", recovery: "restarted" };
}

/**
 * Run the fixed attended diagnostic once. Completion means only that `codex
 * doctor` exited successfully; it never means that App Server is ready.
 */
export function doctorCodexAppServer({ executable = "codex", spawn = spawnSync } = {}) {
  const result = invoke(executable, ["doctor"], spawn);
  const failure = executionFailure(result);
  if (failure !== null || result.status !== 0) {
    return {
      schema: CODEX_APP_SERVER_DOCTOR_SCHEMA,
      status: "failed",
      code: "CAS-DOCTOR-FAILED",
      detail: failure ?? `exit-${result.status}`,
    };
  }
  return {
    schema: CODEX_APP_SERVER_DOCTOR_SCHEMA,
    status: "completed",
    code: "CAS-DOCTOR-COMPLETED",
    detail: null,
  };
}

function parseArgs(argv) {
  if (argv.length === 0) return { mode: "health", recover: false, requireModelReady: false };
  if (argv.length === 1 && argv[0] === "--recover") return { mode: "health", recover: true, requireModelReady: false };
  if (argv[0] === "--critic-ready") {
    const options = { mode: "health", recover: false, requireModelReady: true, rootDir: resolve(process.cwd()), candidateCommit: null };
    for (let index = 1; index < argv.length; index += 2) {
      const flag = argv[index]; const value = argv[index + 1];
      if (flag === "--root" && typeof value === "string") options.rootDir = resolve(value);
      else if (flag === "--candidate-commit" && /^[a-f0-9]{40}$/u.test(value ?? "")) options.candidateCommit = value;
      else throw new Error("Usage: codex-app-server-health.mjs --critic-ready [--root <project-root>] [--candidate-commit <40-hex>]");
    }
    return options;
  }
  if (argv.length === 1 && argv[0] === "--doctor") return { mode: "doctor", recover: false };
  throw new Error("Usage: codex-app-server-health.mjs [--recover|--critic-ready [--root <project-root>] [--candidate-commit <40-hex>]|--doctor]");
}

export function run(argv = process.argv.slice(2), deps = {}) {
  const write = deps.write ?? process.stdout.write.bind(process.stdout);
  const writeError = deps.writeError ?? process.stderr.write.bind(process.stderr);
  const { write: _write, writeError: _writeError, ...operationDeps } = deps;
  try {
    const parsed = parseArgs(argv);
    if (parsed.requireModelReady) {
      try {
        parsed.criticModel = (operationDeps.resolveCriticRoute ?? resolveCriticHighRiskRoute)({
          rootDir: parsed.rootDir,
          candidateCommit: parsed.candidateCommit,
          ...(operationDeps.authorityDependencies ?? {}),
        }).model;
      } catch {
        const unavailableRoute = stale("CAS-MODEL-ROUTE-UNAVAILABLE", "observe");
        write(`${JSON.stringify(unavailableRoute)}\n`);
        return 2;
      }
    }
    const result = parsed.mode === "doctor"
      ? doctorCodexAppServer(operationDeps)
      : checkCodexAppServer({ recover: parsed.recover, requireModelReady: parsed.requireModelReady, criticModel: parsed.criticModel ?? null, ...operationDeps });
    write(`${JSON.stringify(result)}\n`);
    return result.status === "ready" || result.status === "completed" ? 0 : 2;
  } catch (error) {
    writeError(`${error.message}\n`);
    return 64;
  }
}

if (isDirectInvocation(import.meta.url)) process.exitCode = run();
