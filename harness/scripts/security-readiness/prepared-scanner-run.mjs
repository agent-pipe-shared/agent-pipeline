// SPDX-License-Identifier: SUL-1.0
import * as gitleaks from "../security-adapters/gitleaks.mjs";
import * as osv from "../security-adapters/osv-scanner.mjs";
import * as semgrep from "../security-adapters/semgrep.mjs";
import { sameExecutable, sha256 } from "./tool-identity.mjs";

const ADAPTERS = Object.freeze({ gitleaks, "osv-scanner": osv, semgrep });
/** Revalidate a prepared handle, then pass its exact path to the unchanged scanner adapter. */
export async function runPreparedScanner(tool, handle, options = {}) {
  const adapter = ADAPTERS[tool];
  if (!adapter || handle?.tool !== tool || handle.schema !== "pipeline.prepared-tool.v1") return { status: "ERROR", classification: "execution_environment", findings: [], raw: null, reason: "invalid prepared tool handle" };
  const { digest, ...bound } = handle;
  if (sha256(JSON.stringify(bound)) !== digest || !sameExecutable(handle)) return { status: "ERROR", classification: "execution_environment", findings: [], raw: null, reason: "prepared executable identity changed" };
  return adapter.run({ ...options, config: { ...(options.config ?? {}), binaryPath: handle.identity.realPath }, env: { LANG: "C", LC_ALL: "C", TMPDIR: options.tempDir } });
}
