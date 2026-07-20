// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { spawnSync as nodeSpawnSync } from "node:child_process";

export function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
export function resolveSystemExecutable(name, { platform = process.platform, homeDir = homedir() } = {}) {
  const paths = platform === "win32"
    ? ["C:\\Program Files\\Git\\cmd", "C:\\Program Files\\Git\\bin", "C:\\Windows\\System32"]
    : platform === "darwin"
      ? ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", join(homeDir, ".local", "bin"), join(homeDir, "go", "bin")]
      : ["/usr/local/bin", "/usr/bin", "/bin", join(homeDir, ".local", "bin"), join(homeDir, "go", "bin")];
  const names = platform === "win32" ? [`${name}.exe`, `${name}.cmd`, name] : [name];
  for (const root of paths) for (const candidate of names) {
    const path = join(root, candidate);
    if (existsSync(path)) return path;
  }
  return null;
}
export function executableIdentity(path) {
  let lexical;
  try { lexical = lstatSync(path); } catch (error) { return { ok: false, status: error?.code === "ENOENT" ? "binary_missing" : "probe_error" }; }
  if (lexical.isSymbolicLink()) {
    // Resolve the final system-link once, but never accept an alias supplied by a manifest.
    try { path = realpathSync(path); lexical = lstatSync(path); } catch { return { ok: false, status: "probe_error" }; }
  }
  if (!lexical.isFile()) return { ok: false, status: "probe_error" };
  const info = statSync(path, { bigint: true });
  const identity = { realPath: realpathSync(path), device: info.dev.toString(), inode: info.ino.toString(), size: Number(info.size), mtimeNs: info.mtimeNs.toString(), sha256: sha256(readFileSync(path)) };
  return { ok: true, identity };
}
export function sameExecutable(handle) {
  const observed = executableIdentity(handle?.identity?.realPath);
  return observed.ok && JSON.stringify(observed.identity) === JSON.stringify(handle.identity);
}
export function closedProbeEnv(tempDir, probeEnv = {}) {
  const allowed = new Set(["SEMGREP_LOG_FILE", "SEMGREP_SETTINGS_FILE", "SEMGREP_SEND_METRICS", "SEMGREP_VERSION_CACHE_PATH"]);
  for (const [key, value] of Object.entries(probeEnv)) {
    if (!allowed.has(key) || typeof value !== "string" || value.includes("\0")) throw new Error("unsupported probe environment");
  }
  const fixedPath = process.platform === "win32"
    ? ["C:\\Windows\\System32", "C:\\Windows"].join(delimiter)
    : ["/usr/local/bin", "/usr/bin", "/bin"].join(delimiter);
  return { LANG: "C", LC_ALL: "C", PATH: fixedPath, TMPDIR: tempDir, TEMP: tempDir, TMP: tempDir, ...probeEnv };
}
export function runProbe(executable, args, { cwd, tempDir, spawnFn = nodeSpawnSync, timeoutMs = 5000, acceptSuccessfulEperm = false, probeEnv = {} } = {}) {
  let result;
  try { result = spawnFn(executable, args, { cwd, encoding: "utf8", env: closedProbeEnv(tempDir, probeEnv), timeout: timeoutMs, shell: false, maxBuffer: 4 * 1024 * 1024 }); }
  catch (error) { return { ok: false, status: error?.code === "EACCES" || error?.code === "EPERM" ? "execution_environment" : "probe_error" }; }
  if (result.error?.code === "ETIMEDOUT") return { ok: false, status: "probe_timeout" };
  // Node can surface EPERM after a sandboxed child has already completed.  This
  // exception is opt-in and requires the sole conclusive success signal: status 0.
  // All other errors, absent status, and non-zero exits remain fail-closed.
  const successfulEperm = acceptSuccessfulEperm === true
    && result.status === 0
    && result.error?.code === "EPERM";
  if (result.error && !successfulEperm) return { ok: false, status: result.error.code === "EACCES" || result.error.code === "EPERM" ? "execution_environment" : "probe_error" };
  if (result.status !== 0) return { ok: false, status: "probe_error" };
  return { ok: true, stdout: String(result.stdout ?? ""), stderr: String(result.stderr ?? "") };
}
export function buildHandle(tool, identity, version, capabilities, probedAt) {
  const bound = { schema: "pipeline.prepared-tool.v1", tool, identity, version, capabilities, probedAt };
  return { ...bound, digest: sha256(JSON.stringify(bound)) };
}
