#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Diagnose the local Codex app-server daemon without treating it as a model,
 * worker, or background-wakeup attestation.  A stale daemon is a known local
 * cause of missing visible subagent activity; this adapter offers one bounded
 * restart and an exact re-observation, never a restart loop.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CODEX_APP_SERVER_HEALTH_SCHEMA = "pipeline.codex-app-server-health.v1";
const VERSION_KEYS = ["status", "backend", "managedCodexPath", "managedCodexVersion", "socketPath", "cliVersion", "appServerVersion"];
const OPERATOR_ACTION = "codex app-server daemon restart && codex doctor";

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
export function observeCodexAppServer({ executable = "codex", spawn = spawnSync } = {}) {
  const result = invoke(executable, ["app-server", "daemon", "version"], spawn);
  const failure = executionFailure(result);
  if (failure !== null) return unavailable(failure, "observe", result?.error?.code ?? null);
  if (result.status !== 0) return stale("CAS-DAEMON-UNREACHABLE", "observe", result.stderr?.trim() || null);
  const daemon = parseVersionObservation(result.stdout);
  if (daemon === null) return stale("CAS-DAEMON-INVALID-OBSERVATION", "observe");
  if (daemon.cliVersion !== daemon.appServerVersion || daemon.managedCodexVersion !== daemon.appServerVersion) {
    return stale("CAS-DAEMON-VERSION-DRIFT", "observe", daemon);
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
export function checkCodexAppServer({ recover = false, executable = "codex", spawn = spawnSync } = {}) {
  const first = observeCodexAppServer({ executable, spawn });
  if (first.status === "ready" || recover !== true || first.code === "CAS-CODEX-UNAVAILABLE" || first.code === "CAS-EXECUTION-UNAVAILABLE") return first;
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
  const after = observeCodexAppServer({ executable, spawn });
  if (after.status !== "ready") {
    return { ...after, code: "CAS-DAEMON-RECOVERY-FAILED", phase: "recover", recovery: "failed" };
  }
  return { ...after, phase: "recover", recovery: "restarted" };
}

function parseArgs(argv) {
  if (argv.length === 0) return { recover: false };
  if (argv.length === 1 && argv[0] === "--recover") return { recover: true };
  throw new Error("Usage: codex-app-server-health.mjs [--recover]");
}

export function run(argv = process.argv.slice(2), deps = {}) {
  try {
    const result = checkCodexAppServer({ ...parseArgs(argv), ...deps });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return result.status === "ready" ? 0 : 2;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 64;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = run();
