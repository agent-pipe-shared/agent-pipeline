// SPDX-License-Identifier: SUL-1.0

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

export const NODE_SANDBOX_PROBE_SCHEMA = "pipeline.node-sandbox-probe.v1";
const NODE_SANDBOX_REMEDY =
  "One-time remedy: the resolved node lives under a version-manager path (fnm, nvm, volta, asdf, mise) that a runner's " +
  "default sandbox or background daemon often cannot reach, so hooks never start (exit 127). Install or link node at a " +
  "stable system path (for example /usr/local/bin/node, or Program Files on Windows) that is on the daemon's PATH, or allow " +
  "the version-manager directory in the runner's sandbox configuration, then restart the runner.";
const NODE_NO_STABLE_REMEDY =
  "One-time remedy: the resolved node lives under a version-manager path that a runner's default sandbox or background " +
  "daemon often cannot reach, and no stable system node was found beside it. Detect which package manager this machine uses, " +
  "propose the official install source for node, let the user run it themselves, then re-run this preflight. " +
  "Alternatively allow the version-manager directory in the runner's sandbox configuration and restart the runner.";
const POSIX_STABLE_CANDIDATES = ["/usr/bin/node", "/usr/local/bin/node", "/opt/homebrew/bin/node"];
const NODE_VERSION_MANAGER_PATTERN =
  /(?:^|\/)(?:\.?fnm(?:_multishells)?|\.nvm|nvm|\.volta|\.asdf|\.?mise|\.nodenv|\.n)(?:\/|$)/u;

/**
 * AC-108 (1): reports whether the resolved `node` sits at a path the runner's default sandbox is
 * known not to reach (a version-manager install), and names the one-time remedy. Read-only
 * (one bounded `node --version` child, no shell, no writes), runner- and platform-neutral
 * (path separators and case are normalized; no runner or OS branch). `unknown` -- an empty path
 * or a probe that failed or timed out -- is reported as unknown and is never `ready`. Never throws.
 */
export function observeNodeSandboxProbe({
  execPath = process.execPath, spawn = spawnSync, platform = process.platform, env = process.env,
  exists = existsSync, stableCandidates,
} = {}) {
  const base = { schema: NODE_SANDBOX_PROBE_SCHEMA };
  try {
    if (typeof execPath !== "string" || execPath.trim() === "") return { ...base, status: "unknown", ready: false };
    const probe = spawn(execPath, ["--version"], { encoding: "utf8", shell: false, timeout: 3_000, windowsHide: true });
    if (probe?.error || probe?.status !== 0) return { ...base, status: "unknown", ready: false };
    const normalized = execPath.replaceAll("\\", "/").toLowerCase();
    if (NODE_VERSION_MANAGER_PATTERN.test(normalized)) {
      const stableNode = findStableNode({ platform, env, exists, spawn, stableCandidates });
      return {
        ...base, status: "version-manager-path", ready: false, code: "NODE-SANDBOX-UNREACHABLE", stableNode,
        remedy: stableNode.found ? NODE_SANDBOX_REMEDY : NODE_NO_STABLE_REMEDY,
      };
    }
    return { ...base, status: "stable-path", ready: true };
  } catch {
    return { ...base, status: "unknown", ready: false };
  }
}

/** Wanted 3: first existing stable-path node that answers a bounded `--version`; never throws, never reports ready. */
function findStableNode({ platform, env, exists, spawn, stableCandidates }) {
  try {
    const candidates = Array.isArray(stableCandidates) ? stableCandidates
      : platform === "win32" ? (env?.ProgramFiles ? [`${env.ProgramFiles}\\nodejs\\node.exe`] : [])
        : POSIX_STABLE_CANDIDATES;
    for (const path of candidates) {
      try {
        if (!exists(path)) continue;
        const run = spawn(path, ["--version"], { encoding: "utf8", shell: false, timeout: 3_000, windowsHide: true });
        if (!run?.error && run?.status === 0) return { found: true, path };
      } catch { /* an unreadable candidate is simply not found */ }
    }
  } catch { /* fall through */ }
  return { found: false };
}
