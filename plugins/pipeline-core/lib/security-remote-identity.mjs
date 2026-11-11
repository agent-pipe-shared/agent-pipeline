// SPDX-License-Identifier: SUL-1.0
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

/**
 * The configured remote Git pushes the current branch to, in Git's own order, or null when no such remote is configured
 * (a detached HEAD, a branch with no upstream, or a value that names no remote of this repository).
 */
function pushRemoteOfCurrentBranch(run, remotes) {
  const branch = (run(["symbolic-ref", "--quiet", "--short", "HEAD"]) ?? "").trim();
  if (branch === "") return null;
  for (const key of [`branch.${branch}.pushRemote`, "remote.pushDefault", `branch.${branch}.remote`]) {
    const value = (run(["config", "--get", key]) ?? "").trim();
    if (value !== "") return remotes.includes(value) ? value : null;
  }
  return null;
}

/** Resolve one effective Git push destination without publishing its URL. */
export function resolveSecurityRemoteIdentity(rootDir, remoteName = null, spawn = spawnSync) {
  const run = (args) => {
    try {
      const result = spawn("git", ["-C", rootDir, ...args], {
        encoding: "utf8", timeout: 5000, shell: false,
      });
      return result.status === 0 ? result.stdout : null;
    } catch { return null; }
  };
  const remoteOutput = run(["remote"]);
  if (remoteOutput === null) return { ok: false, reason: "remote-list-unavailable" };
  const remotes = remoteOutput.split(/\r?\n/u).filter(Boolean);
  if (remoteName !== null && (typeof remoteName !== "string" || !remotes.includes(remoteName))) {
    return { ok: false, reason: "remote-not-configured" };
  }
  // PO decision 2026-11-10: with several remotes and no name given, the remote the current branch pushes to decides; without one the scan refuses.
  const branchRemote = remoteName === null && remotes.length > 1 ? pushRemoteOfCurrentBranch(run, remotes) : null;
  if (remoteName === null && remotes.length !== 1 && branchRemote === null) {
    return { ok: false, reason: remotes.length === 0 ? "remote-missing" : "remote-ambiguous" };
  }
  const selected = remoteName ?? branchRemote ?? remotes[0];
  const output = run(["remote", "get-url", "--push", "--all", selected]);
  if (output === null) return { ok: false, reason: "push-destination-unavailable" };
  const urls = output.split(/\r?\n/u).filter(Boolean);
  if (urls.length !== 1) return { ok: false, reason: "push-destination-ambiguous" };
  return {
    ok: true,
    repositorySha256: createHash("sha256").update(urls[0]).digest("hex"),
  };
}
