// SPDX-License-Identifier: SUL-1.0
// C29e (ADR-0103): the toolchain readiness probe of Trivy. It reads the version and the `config` help and never scans. It runs in the closed
// probe environment (tool-identity.mjs: fixed PATH, private temp directory, no HOME and no TRIVY_* variable); neither call touches a cache.
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { buildHandle, executableIdentity } from "../tool-identity.mjs";
import { runProbeRetryingEperm as runProbe } from "./probe-retry.mjs";

/** The switches the close scan passes (security-adapters/trivy.mjs); a release without one of them cannot run that scan. */
export const TRIVY_REQUIRED_FLAGS = Object.freeze(["--format", "--skip-check-update", "--cache-dir", "--ignorefile", "--disable-telemetry", "--skip-version-check"]);

export function probeTrivy({ executablePath, rootDir, tempDir }, deps = {}) {
  const observed = executableIdentity(executablePath); if (!observed.ok) return observed;
  const scratch = mkdtempSync(join(tempDir, "pipeline-trivy-preflight-"));
  try {
    const options = { cwd: rootDir, tempDir: scratch, timeoutMs: 30000, ...deps };
    const version = runProbe(observed.identity.realPath, ["--version"], options); if (!version.ok) return version;
    const help = runProbe(observed.identity.realPath, ["config", "--help"], options); if (!help.ok) return help;
    const text = `${version.stdout}\n${version.stderr}`; const match = text.match(/(?:^|\s)v?(\d+\.\d+\.\d+)(?:\s|$)/u); const helpText = `${help.stdout}\n${help.stderr}`;
    return { ok: true, status: "ready", handle: buildHandle("trivy", observed.identity, match?.[1] ?? null, TRIVY_REQUIRED_FLAGS.filter((flag) => helpText.includes(flag)), (deps.now ?? new Date()).toISOString()) };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
