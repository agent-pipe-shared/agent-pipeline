// SPDX-License-Identifier: SUL-1.0
/**
 * Explicit, repository-free Claude Code alias observation for a fresh-session
 * host. This is not a catalogue, a role assignment, or model compatibility
 * evidence. It reports only which exact model a successful minimal Claude Code
 * call actually used. The caller must keep the result local until approved.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { claudeCodeObservedModelIds } from "./model-role-session.mjs";
import { resolveTrustedSystemExecutable } from "./trusted-tool-resolution.mjs";

const ALIASES = new Set(["opus", "sonnet", "haiku"]);
const MAX_BYTES = 65_536;
const PROBE_PROMPT = "Reply exactly OK.";

function unavailable(code) {
  return { ok: false, code, modelCalls: 0, observation: null };
}

export function observeClaudeModelAlias({ alias, executableResult, resolveExecutable = resolveTrustedSystemExecutable,
  run = spawnSync, makeTemp = mkdtempSync, removeTemp = rmdirSync,
  now = () => new Date().toISOString() } = {}) {
  if (!ALIASES.has(alias)) return unavailable("MODEL-ROLE-CLAUDE-ALIAS-INVALID");
  const executable = executableResult ?? resolveExecutable("claude");
  if (!executable?.ok || typeof executable.path !== "string") {
    return unavailable("MODEL-ROLE-CLAUDE-EXECUTABLE-UNAVAILABLE");
  }
  let workingDirectory;
  let launched = false;
  try {
    workingDirectory = makeTemp(join(tmpdir(), "pipeline-claude-model-probe-"));
    launched = true;
    const result = run(executable.path, ["--print", "--output-format", "json",
      "--no-session-persistence", "--tools", "", "--setting-sources", "",
      "--model", alias, PROBE_PROMPT], {
      cwd: workingDirectory, shell: false, encoding: "utf8", timeout: 30_000,
      maxBuffer: MAX_BYTES, windowsHide: true,
    });
    if (result?.error || result?.status !== 0 || typeof result.stdout !== "string"
      || Buffer.byteLength(result.stdout, "utf8") > MAX_BYTES) {
      return { ...unavailable("MODEL-ROLE-CLAUDE-PROBE-UNAVAILABLE"), modelCalls: 1 };
    }
    let parsed;
    try { parsed = JSON.parse(result.stdout); }
    catch { return { ...unavailable("MODEL-ROLE-CLAUDE-PROBE-MALFORMED"), modelCalls: 1 }; }
    const observed = claudeCodeObservedModelIds(parsed);
    if (!observed.ok || observed.availableModelIds.length !== 1) {
      return { ...unavailable("MODEL-ROLE-CLAUDE-MODEL-UNOBSERVED"), modelCalls: 1 };
    }
    const observedAt = now();
    if (typeof observedAt !== "string"
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(observedAt)
      || !Number.isFinite(Date.parse(observedAt))
      || new Date(observedAt).toISOString() !== observedAt) {
      return { ...unavailable("MODEL-ROLE-CLAUDE-CLOCK-UNAVAILABLE"), modelCalls: 1 };
    }
    const observation = { schema: "pipeline.claude-model-host-observation.v1",
      alias, modelId: observed.availableModelIds[0], observedAt,
      assurance: "host-observed-single-call-not-provider-attested" };
    return { ok: true, code: "MODEL-ROLE-CLAUDE-ALIAS-OBSERVED", modelCalls: 1,
      observation, observationSha256: createHash("sha256").update(JSON.stringify(observation)).digest("hex") };
  } catch {
    return { ...unavailable("MODEL-ROLE-CLAUDE-PROBE-UNAVAILABLE"), modelCalls: launched ? 1 : 0 };
  } finally {
    if (workingDirectory !== undefined) {
      try { removeTemp(workingDirectory); } catch { /* Never erase an unexpected nonempty directory. */ }
    }
  }
}
