#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * The deliberately small execution boundary for Hawkeye's registered renderer.
 *
 * This is not a renderer, request stager, response parser, or job-recovery
 * controller.  It owns only the one fixed Linux transient-service invocation.
 * A later coordinator must provide its already-proved user-manager/cgroup
 * availability and owns every private request/output descriptor.
 */
import { spawn } from "node:child_process";
import { lstatSync, realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import { validatePrivateDocumentAdapter } from "./document-adapter.mjs";
import { assessWindowsPrivatePath } from "../lib/windows-private-state.mjs";

export const DOCUMENT_RENDER_SYSTEMD_RUN = "/usr/bin/systemd-run";
export const DOCUMENT_RENDER_RUNTIME_SECONDS = 295;
export const DOCUMENT_RENDER_STOP_SECONDS = 5;

const REQUEST_ID = /^drq_[a-z2-7]{25}[aeimquy4]$/u;
const USER_MANAGER_PROOF = new Set(["userManager", "transientServiceCgroup"]);

export class DocumentRenderControllerError extends Error {
  constructor(code, message) { super(message); this.name = "DocumentRenderControllerError"; this.code = code; }
}

function fail(code, message) { throw new DocumentRenderControllerError(code, message); }
function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value, expected) { return isObject(value) && Object.keys(value).length === expected.size && Object.keys(value).every((key) => expected.has(key)); }
function absolutePhysical(path, label, { stat = lstatSync, realpath = realpathSync } = {}) {
  if (typeof path !== "string" || path.includes("\0") || !isAbsolute(path) || resolve(path) !== path) fail("DR-PATH", `${label} must be canonical absolute`);
  let info;
  try { info = stat(path); } catch { fail("DR-PATH", `${label} is unavailable`); }
  // POSIX mode bits express owner-only exclusivity directly; native Windows has no
  // such mode semantics (mode is a synthetic constant), so the equivalent assurance
  // there is the shared owner-DACL check, never a relaxed/skipped check.
  const posixModeViolation = process.platform !== "win32" && (info.mode & 0o077) !== 0;
  const windowsInsecure = process.platform === "win32" && assessWindowsPrivatePath(path).status !== "secure";
  if (!info.isDirectory() || info.isSymbolicLink() || posixModeViolation || windowsInsecure) fail("DR-PATH", `${label} must be a physical owner-only directory`);
  try { if (realpath(path) !== path) fail("DR-PATH", `${label} must be physical`); }
  catch (error) { if (error instanceof DocumentRenderControllerError) throw error; fail("DR-PATH", `${label} is unavailable`); }
  return path;
}

/**
 * Return only a typed availability result.  Native Windows/macOS and every
 * Linux host without an explicit user-manager transient-cgroup proof are
 * unavailable; this function never attempts a service launch.
 */
export function probeRendererAvailability({
  platform = process.platform,
  systemdRunPath = DOCUMENT_RENDER_SYSTEMD_RUN,
  stat = lstatSync,
  userManagerProbe = () => null,
} = {}) {
  if (platform !== "linux") return { available: false, reason: "adapter-unavailable" };
  try {
    if (typeof systemdRunPath !== "string" || systemdRunPath !== DOCUMENT_RENDER_SYSTEMD_RUN) return { available: false, reason: "adapter-unavailable" };
    const binary = stat(systemdRunPath);
    if (!binary.isFile() || binary.isSymbolicLink()) return { available: false, reason: "adapter-unavailable" };
  } catch { return { available: false, reason: "adapter-unavailable" }; }
  let proof;
  try { proof = userManagerProbe(); } catch { return { available: false, reason: "adapter-unavailable" }; }
  if (!exactKeys(proof, USER_MANAGER_PROOF) || proof.userManager !== true || proof.transientServiceCgroup !== true) {
    return { available: false, reason: "adapter-unavailable" };
  }
  return { available: true, reason: null };
}

/** Derive the sole permitted opaque transient unit name from a coordinator ID. */
export function rendererUnitName(requestId) {
  if (typeof requestId !== "string" || !REQUEST_ID.test(requestId)) fail("DR-REQUEST", "renderer request ID is not canonical");
  return `agent-pipeline-document-${requestId}.service`;
}

/**
 * Build, but do not execute, the closed systemd-run command.  No request data,
 * executable override, arbitrary environment, or renderer argument is accepted.
 */
export function buildFixedRendererLaunch(adapter, {
  requestId,
  workingDirectory,
  availability,
  systemdRunPath = DOCUMENT_RENDER_SYSTEMD_RUN,
} = {}) {
  if (!isObject(availability) || availability.available !== true || availability.reason !== null) fail("DR-UNAVAILABLE", "renderer adapter is unavailable");
  if (systemdRunPath !== DOCUMENT_RENDER_SYSTEMD_RUN) fail("DR-SYSTEMD", "renderer systemd executable is fixed");
  const trusted = validatePrivateDocumentAdapter(adapter);
  const cwd = absolutePhysical(workingDirectory, "renderer working directory");
  const unit = rendererUnitName(requestId);
  return {
    command: DOCUMENT_RENDER_SYSTEMD_RUN,
    args: [
      "--user", "--pipe", "--wait", "--collect", "--quiet", "--unit", unit,
      `--property=RuntimeMaxSec=${DOCUMENT_RENDER_RUNTIME_SECONDS}s`,
      "--property=KillMode=control-group",
      `--property=TimeoutStopSec=${DOCUMENT_RENDER_STOP_SECONDS}s`,
      "--", trusted.executablePath, "--stdio-v1",
    ],
    options: {
      shell: false,
      cwd,
      // Do not inherit tokens, proxy credentials, loader paths, or user input.
      env: { LANG: "C", PATH: "/usr/bin:/bin" },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    },
  };
}

/**
 * Start exactly the launch built above.  Caller-owned code must bound and frame
 * stdin/stdout/stderr, prove unit identity, and drain the returned cgroup.
 */
export function startFixedRenderer(adapter, options = {}) {
  const availability = probeRendererAvailability({
    platform: options.platform,
    stat: options.stat,
    userManagerProbe: options.userManagerProbe,
  });
  const launch = buildFixedRendererLaunch(adapter, { ...options, availability });
  const spawnChild = options.spawnChild ?? spawn;
  if (typeof spawnChild !== "function") fail("DR-SPAWN", "renderer spawn primitive is invalid");
  const child = spawnChild(launch.command, launch.args, launch.options);
  if (!child || !Number.isSafeInteger(child.pid) || child.pid < 1 || !child.stdin || !child.stdout || !child.stderr) {
    fail("DR-SPAWN", "renderer transient-service child did not start with private pipes");
  }
  return child;
}
