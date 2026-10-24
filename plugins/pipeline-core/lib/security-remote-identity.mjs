// SPDX-License-Identifier: SUL-1.0
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

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
  if (remoteName === null && remotes.length !== 1) {
    return { ok: false, reason: remotes.length === 0 ? "remote-missing" : "remote-ambiguous" };
  }
  const selected = remoteName ?? remotes[0];
  const output = run(["remote", "get-url", "--push", "--all", selected]);
  if (output === null) return { ok: false, reason: "push-destination-unavailable" };
  const urls = output.split(/\r?\n/u).filter(Boolean);
  if (urls.length !== 1) return { ok: false, reason: "push-destination-ambiguous" };
  return {
    ok: true,
    repositorySha256: createHash("sha256").update(urls[0]).digest("hex"),
  };
}
