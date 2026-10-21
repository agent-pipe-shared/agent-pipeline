// SPDX-License-Identifier: SUL-1.0

import { spawnSync } from "node:child_process";

export const NODE_SANDBOX_PROBE_SCHEMA = "pipeline.node-sandbox-probe.v1";
const NODE_SANDBOX_REMEDY =
  "One-time remedy: the resolved node lives under a version-manager path (fnm, nvm, volta, asdf, mise) that a runner's " +
  "default sandbox or background daemon often cannot reach, so hooks never start (exit 127). Install or link node at a " +
  "stable system path (for example /usr/local/bin/node, or Program Files on Windows) that is on the daemon's PATH, or allow " +
  "the version-manager directory in the runner's sandbox configuration, then restart the runner.";
const NODE_VERSION_MANAGER_PATTERN =
  /(?:^|\/)(?:\.?fnm(?:_multishells)?|\.nvm|nvm|\.volta|\.asdf|\.?mise|\.nodenv|\.n)(?:\/|$)/u;

/**
 * AC-108 (1): reports whether the resolved `node` sits at a path the runner's default sandbox is
 * known not to reach (a version-manager install), and names the one-time remedy. Read-only
 * (one bounded `node --version` child, no shell, no writes), runner- and platform-neutral
 * (path separators and case are normalized; no runner or OS branch). `unknown` -- an empty path
 * or a probe that failed or timed out -- is reported as unknown and is never `ready`. Never throws.
 */
export function observeNodeSandboxProbe({ execPath = process.execPath, spawn = spawnSync } = {}) {
  const base = { schema: NODE_SANDBOX_PROBE_SCHEMA };
  try {
    if (typeof execPath !== "string" || execPath.trim() === "") return { ...base, status: "unknown", ready: false };
    const probe = spawn(execPath, ["--version"], { encoding: "utf8", shell: false, timeout: 3_000, windowsHide: true });
    if (probe?.error || probe?.status !== 0) return { ...base, status: "unknown", ready: false };
    const normalized = execPath.replaceAll("\\", "/").toLowerCase();
    if (NODE_VERSION_MANAGER_PATTERN.test(normalized)) {
      return { ...base, status: "version-manager-path", ready: false, code: "NODE-SANDBOX-UNREACHABLE", remedy: NODE_SANDBOX_REMEDY };
    }
    return { ...base, status: "stable-path", ready: true };
  } catch {
    return { ...base, status: "unknown", ready: false };
  }
}
