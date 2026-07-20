// SPDX-License-Identifier: Apache-2.0

/** Native one-turn adapter executed inside the already-selected Codex sandbox. */
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { buildSandboxInvocation } from "./codex-sandbox-preflight.mjs";

const CHILD = realpathSync(fileURLToPath(new URL("./codex-advisory-app-server-child.mjs", import.meta.url)));
const MODEL = "gpt-5.6-sol";
const PROVIDER = "openai";

export async function invokeCodexAdvisoryAppServer(payload, dependencies = {}) {
  const selected = payload?.sandboxTransport;
  if (!selected || selected.requested?.runner !== "codex" || selected.requested?.model !== MODEL
    || selected.profile?.base !== ":read-only" || selected.profile?.network?.enabled !== true
    || selected.profile?.scratchRootSha256 !== selected.scratch?.sha256
    || typeof selected.scratch?.sandboxStateJson !== "string" || typeof selected.scratch?.sandboxStateSha256 !== "string") {
    throw new Error("selected Codex advisory transport is invalid");
  }
  const invocation = (dependencies.buildSandboxInvocationFn ?? buildSandboxInvocation)({
    codexPath: selected.scratch.codexPath,
    sandboxStateJson: selected.scratch.sandboxStateJson,
    sandboxStateSha256: selected.scratch.sandboxStateSha256,
    nodePath: process.execPath,
    payloadPath: CHILD,
  });
  const spawnFn = dependencies.spawnFn ?? spawn;
  const child = spawnFn(invocation.command, invocation.argv, {
    cwd: selected.scratch.repoRoot,
    env: process.env,
    shell: false,
    detached: false,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const chunks = [];
  let bytes = 0;
  child.stdout.on("data", (chunk) => { bytes += chunk.length; if (bytes <= 8 * 1024 * 1024) chunks.push(chunk); });
  child.stderr.on("data", () => {});
  const close = new Promise((resolve) => {
    child.once("error", (error) => resolve({ code: null, signal: null, error: error?.code ?? "spawn-error" }));
    child.once("close", (code, signal) => resolve({ code, signal, error: null }));
  });
  child.stdin.end(JSON.stringify({ codexPath: selected.scratch.codexPath, cwd: selected.scratch.repoRoot, scratchPath: selected.scratch.path, question: payload.question }));
  const terminal = await close;
  let result = null;
  if (bytes <= 8 * 1024 * 1024) {
    const lines = Buffer.concat(chunks).toString("utf8").trim().split("\n").filter(Boolean);
    try { if (lines.length === 1) result = JSON.parse(lines[0]); } catch { result = null; }
  }
  const success = terminal.code === 0 && terminal.signal === null && terminal.error === null
    && result?.schema === "pipeline.codex-advisory-app-server-child.v1" && result.ok === true
    && result.code === "answered" && result.observed?.provider === PROVIDER && result.observed?.model === MODEL
    && result.observed?.initialized === true && result.observed?.threadStarted === true
    && result.observed?.turnStarted === true && result.observed?.turnCompleted === true
    && result.observed?.stdinEnded === true && result.observed?.exitCode === 0
    && result.observed?.signal === null && result.observed?.cleanup === "complete"
    && typeof result.answer === "string";
  if (!success) return { status: "unavailable" };
  return {
    status: "answered",
    answer: result.answer,
    identity: { provider: PROVIDER, modelId: MODEL, effort: "not-applicable" },
    sandboxExecution: {
      schema: "pipeline.codex-sandbox-host-execution.v1",
      selectionId: selected.selectionId,
      selectionSha256: selected.selectionSha256,
      repoFingerprint: selected.repoFingerprint,
      duty: selected.duty,
      dispatch: selected.dispatch,
      observed: { cliSha256: selected.toolchain.cliSha256, profileSha256: selected.profile.sha256, networkEnabled: true, scratchRootSha256: selected.profile.scratchRootSha256 },
      terminal: { childStarted: true, exitCode: 0, stdioStatus: "complete", cleanupStatus: "complete" },
    },
  };
}
