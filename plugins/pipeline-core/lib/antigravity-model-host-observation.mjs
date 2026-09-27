// SPDX-License-Identifier: SUL-1.0
/** Repository-free, bounded observation of the installed Antigravity CLI list. */
import { spawnSync } from "node:child_process";
import { antigravityAvailableModelIds } from "./model-role-session.mjs";
import { resolveTrustedSystemExecutable } from "./trusted-tool-resolution.mjs";

export function observeAntigravityModels({ executableResult,
  resolveExecutable = resolveTrustedSystemExecutable, run = spawnSync } = {}) {
  const executable = executableResult ?? resolveExecutable("agy");
  if (!executable?.ok || typeof executable.path !== "string") {
    return { ok: false, code: "MODEL-ROLE-AGY-EXECUTABLE-UNAVAILABLE", availableModelIds: [] };
  }
  try {
    const result = run(executable.path, ["models"], { shell: false, encoding: "utf8",
      timeout: 10_000, maxBuffer: 65_536, windowsHide: true });
    if (result?.error || result?.status !== 0 || typeof result.stdout !== "string") {
      return { ok: false, code: "MODEL-ROLE-AGY-CATALOGUE-UNAVAILABLE", availableModelIds: [] };
    }
    const observed = antigravityAvailableModelIds(result.stdout);
    return observed.ok ? { ...observed, assurance: "installed-host-observed" }
      : { ok: false, code: observed.code, availableModelIds: [] };
  } catch {
    return { ok: false, code: "MODEL-ROLE-AGY-CATALOGUE-UNAVAILABLE", availableModelIds: [] };
  }
}
