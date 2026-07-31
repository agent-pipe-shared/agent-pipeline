#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * The sole network-open companion for PHX-0B freshness on a selected Codex
 * host-authorized WSL boundary.  This is deliberately not a command runner:
 * it accepts only the existing freshness root and performs the one fixed
 * public-marketplace HEAD read internally.
 *
 * The caller is responsible for placing this executable on the boundary
 * selected by pipeline-start.  Running it from an ordinary workspace sandbox
 * conveys no host attestation; the normal freshness CLI therefore never
 * invokes this helper by itself.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  createFreshnessHostAction,
  FRESHNESS_HOST_RESULT_SCHEMA,
  FRESHNESS_HOST_CONTROL_SCHEMA,
  FRESHNESS_HOST_RECEIPT_SCHEMA,
  FRESHNESS_HOST_TRANSPORT_SCHEMA,
  inspectCliRulesetFreshness,
  PUBLIC_MARKETPLACE_URL,
  WSL_FRESHNESS_BOUNDARY_ID,
} from "./ruleset-freshness.mjs";
import { observeCodexRulesetSource } from "../lib/codex-host-plugin-list.mjs";
import { CODEX_APP_SERVER_HEALTH_SCHEMA, observeCodexAppServer } from "./codex-app-server-health.mjs";

const SHA = /^[0-9a-f]{40,64}$/iu;
const DEFAULT_TIMEOUT_MS = 30_000;
// This helper is intentionally WSL-only.  A literal system path and a sterile
// Git environment prevent a user PATH entry or ambient Git configuration from
// retargeting the one reviewed public read.
const WSL_SYSTEM_GIT = "/usr/bin/git";
const WSL_SYSTEM_GIT_ENV = Object.freeze({
  GIT_ASKPASS: "/bin/false",
  GIT_CONFIG_COUNT: "0",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_OPTIONAL_LOCKS: "0",
  GIT_TERMINAL_PROMPT: "0",
  HOME: "/nonexistent",
  LANG: "C",
  LC_ALL: "C",
  PATH: "/usr/bin:/bin",
  SSH_ASKPASS: "/bin/false",
});

function result(action, status, stdout = "", receipt = null) {
  return Object.freeze({
    schema: FRESHNESS_HOST_RESULT_SCHEMA,
    requestSha256: action.requestSha256,
    status,
    stdout,
    receipt,
  });
}

function hostControlBinding(observation) {
  if (observation?.schema !== CODEX_APP_SERVER_HEALTH_SCHEMA
    || observation.status !== "ready"
    || observation.code !== "CAS-READY"
    || observation.phase !== "observe"
    || typeof observation.daemon?.appServerVersion !== "string"
    || observation.daemon.appServerVersion.length === 0) return null;
  // The public receipt intentionally omits the private control socket and
  // executable paths. The ready code and daemon version are sufficient to
  // bind this read to a validated host-control observation.
  return Object.freeze({
    schema: FRESHNESS_HOST_CONTROL_SCHEMA,
    code: "CAS-READY",
    appServerVersion: observation.daemon.appServerVersion,
  });
}

function executionReceipt(action, hostControl, publicHeadOid) {
  return Object.freeze({
    schema: FRESHNESS_HOST_RECEIPT_SCHEMA,
    boundaryId: WSL_FRESHNESS_BOUNDARY_ID,
    action,
    requestSha256: action.requestSha256,
    hostControl,
    childStarted: true,
    executable: WSL_SYSTEM_GIT,
    argv: Object.freeze(["ls-remote", PUBLIC_MARKETPLACE_URL, "HEAD"]),
    exitCode: 0,
    publicHeadOid,
  });
}

/**
 * Execute only the reviewed literal `git ls-remote <public> HEAD` action.
 * The action comparison rejects substituted boundary IDs, URLs, argv and
 * request digests before a process is spawned.
 */
export function executeRulesetFreshnessHostAction(action, { spawn = spawnSync, timeoutMs = DEFAULT_TIMEOUT_MS, observeHostControl = observeCodexAppServer } = {}) {
  const expected = createFreshnessHostAction(WSL_FRESHNESS_BOUNDARY_ID);
  if (expected === null || JSON.stringify(action) !== JSON.stringify(expected)) return null;
  let hostControl;
  try { hostControl = hostControlBinding(observeHostControl()); } catch { hostControl = null; }
  if (hostControl === null) return result(expected, "unavailable");
  let child;
  try {
    child = spawn(WSL_SYSTEM_GIT, ["ls-remote", PUBLIC_MARKETPLACE_URL, "HEAD"], {
      cwd: "/",
      encoding: "utf8",
      timeout: timeoutMs,
      shell: false,
      windowsHide: true,
      env: WSL_SYSTEM_GIT_ENV,
    });
  } catch {
    return result(expected, "unavailable");
  }
  const value = String(child?.stdout ?? "").trim().split(/\s+/u)[0]?.toLowerCase();
  if (!Number.isInteger(child?.pid) || child.pid <= 0 || child?.status !== 0 || !SHA.test(value)) return result(expected, "unavailable");
  // Do not return arbitrary Git output. The envelope contains only the public
  // object identity expected by the common freshness reader. The receipt is
  // Freshness-specific: it binds the selected boundary, fixed action, actual
  // child start, literal system Git completion, and the public HEAD OID.
  return result(expected, "completed", `${value}\tHEAD\n`, executionReceipt(expected, hostControl, value));
}

export function inspectHostRulesetFreshness({ repoPath, loadedPluginRoot, codexObservation, execute = executeRulesetFreshnessHostAction } = {}) {
  if (typeof repoPath !== "string" || repoPath.length === 0 || typeof loadedPluginRoot !== "string" || loadedPluginRoot.length === 0) return null;
  const hostTransport = Object.freeze({
    schema: FRESHNESS_HOST_TRANSPORT_SCHEMA,
    boundaryId: WSL_FRESHNESS_BOUNDARY_ID,
    access: "read-only",
    network: "enabled",
    execute,
  });
  return inspectCliRulesetFreshness({
    repoPath,
    loadedPluginRoot,
    codexObservation,
    networkPreflight: Object.freeze({
      schema: "pipeline.ruleset-freshness-network-preflight.v1",
      network: "restricted",
      boundaryId: WSL_FRESHNESS_BOUNDARY_ID,
    }),
    hostTransport,
  });
}

function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== "--repo" || argv[1].length === 0) return null;
  return resolve(argv[1]);
}

export function main(argv = process.argv.slice(2)) {
  const repoPath = parseArgs(argv);
  if (repoPath === null) {
    process.stderr.write("ruleset-freshness-host: usage: ruleset-freshness-host.mjs --repo <existing-freshness-root>\n");
    return 64;
  }
  const loadedPluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const codexObservation = observeCodexRulesetSource({
    loadedPluginRoot,
    selfApplicationRoot: resolve(loadedPluginRoot, "..", ".."),
  });
  const output = inspectHostRulesetFreshness({ repoPath, loadedPluginRoot, codexObservation });
  process.stdout.write(`${JSON.stringify(output)}\n`);
  return output?.status === "equal" || output?.status === "ahead"
    || output?.status === "remote-unavailable" && output.reason !== "host-transport-required" ? 0 : 2;
}

const invokedDirectly = process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
if (invokedDirectly) process.exitCode = main();
