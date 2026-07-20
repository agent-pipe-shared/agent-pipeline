// SPDX-License-Identifier: Apache-2.0
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { buildHandle, executableIdentity, runProbe } from "./tool-identity.mjs";
export function probeSemgrep({ executablePath, rootDir, tempDir }, deps = {}) {
  const observed = executableIdentity(executablePath); if (!observed.ok) return observed;
  const scratch = mkdtempSync(join(tempDir, "pipeline-semgrep-preflight-"));
  const probeEnv = {
    SEMGREP_LOG_FILE: join(scratch, "semgrep.log"),
    SEMGREP_SETTINGS_FILE: join(scratch, "settings.yml"),
    SEMGREP_SEND_METRICS: "off",
    SEMGREP_VERSION_CACHE_PATH: join(scratch, "version-cache"),
  };
  try {
    const version = runProbe(observed.identity.realPath, ["--version"], { cwd: rootDir, tempDir: scratch, probeEnv, ...deps }); if (!version.ok) return version;
    const help = runProbe(observed.identity.realPath, ["scan", "--help"], { cwd: rootDir, tempDir: scratch, probeEnv, ...deps }); if (!help.ok) return help;
    const text = `${version.stdout}\n${version.stderr}`; const match = text.match(/(?:^|\s)v?(\d+\.\d+\.\d+)(?:\s|$)/); const helpText = `${help.stdout}\n${help.stderr}`;
    return { ok: true, status: "ready", handle: buildHandle("semgrep", observed.identity, match?.[1] ?? null, ["--json", "--config"].filter((flag) => helpText.includes(flag)), (deps.now ?? new Date()).toISOString()) };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
