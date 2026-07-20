// SPDX-License-Identifier: Apache-2.0
import { buildHandle, executableIdentity, runProbe } from "./tool-identity.mjs";
export function probeOsvScanner({ executablePath, rootDir, tempDir }, deps = {}) {
  const observed = executableIdentity(executablePath); if (!observed.ok) return observed;
  const version = runProbe(observed.identity.realPath, ["--version"], { cwd: rootDir, tempDir, ...deps }); if (!version.ok) return version;
  const help = runProbe(observed.identity.realPath, ["scan", "source", "--help"], { cwd: rootDir, tempDir, ...deps }); if (!help.ok) return help;
  const text = `${version.stdout}\n${version.stderr}`; const match = text.match(/(?:^|\s)v?(\d+\.\d+\.\d+)(?:\s|$)/); const helpText = `${help.stdout}\n${help.stderr}`;
  return { ok: true, status: "ready", handle: buildHandle("osv-scanner", observed.identity, match?.[1] ?? null, ["--format", "recursive-source"].filter((flag) => flag === "--format" ? helpText.includes("--format") : /(?:^|\s)(?:-r|--recursive)(?:\s|,)/m.test(helpText)), (deps.now ?? new Date()).toISOString()) };
}
