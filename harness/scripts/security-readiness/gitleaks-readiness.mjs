// SPDX-License-Identifier: SUL-1.0
import { buildHandle, executableIdentity, resolveSystemExecutable, runProbe } from "./tool-identity.mjs";

const GITLEAKS_MODULE = "github.com/zricethezav/gitleaks/v8";

function embeddedGoVersion(executablePath, { cwd, tempDir }, deps) {
  const resolver = deps.resolveExecutableFn ?? resolveSystemExecutable;
  const goPath = resolver("go");
  if (goPath === null) return null;
  const embedded = runProbe(goPath, ["version", "-m", executablePath], { cwd, tempDir, ...deps });
  if (!embedded.ok) return null;
  const lines = `${embedded.stdout}\n${embedded.stderr}`.split(/\r?\n/u).map((line) => line.trim());
  if (!lines.includes(`path\t${GITLEAKS_MODULE}`)) return null;
  const moduleLine = lines.find((line) => line.startsWith(`mod\t${GITLEAKS_MODULE}\t`));
  const fields = moduleLine?.split("\t") ?? [];
  return fields[1] === GITLEAKS_MODULE ? fields[2]?.match(/^v(\d+\.\d+\.\d+)(?:[-+].*)?$/u)?.[1] ?? null : null;
}

export function probeGitleaks({ executablePath, rootDir, tempDir }, deps = {}) {
  const observed = executableIdentity(executablePath); if (!observed.ok) return observed;
  const version = runProbe(observed.identity.realPath, ["version"], { cwd: rootDir, tempDir, ...deps }); if (!version.ok) return version;
  const text = `${version.stdout}\n${version.stderr}`;
  const directVersion = text.match(/(?:^|\s)v?(\d+\.\d+\.\d+)(?:\s|$)/)?.[1] ?? null;
  // `go install` builds Gitleaks without release ldflags, so its `version`
  // command has no semver. Go still authenticates the main module and version
  // in the executable build metadata; accept only the canonical v8 module.
  const detectedVersion = directVersion ?? embeddedGoVersion(observed.identity.realPath, { cwd: rootDir, tempDir }, deps);
  const help = runProbe(observed.identity.realPath, ["detect", "--help"], { cwd: rootDir, tempDir, ...deps }); if (!help.ok) return help;
  return { ok: true, status: "ready", handle: buildHandle("gitleaks", observed.identity, detectedVersion, ["--source", "--report-format", "--report-path", "--no-banner", "--exit-code"].filter((flag) => help.stdout.includes(flag) || help.stderr.includes(flag)), (deps.now ?? new Date()).toISOString()) };
}
