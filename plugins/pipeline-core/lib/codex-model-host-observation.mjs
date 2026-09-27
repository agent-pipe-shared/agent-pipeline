// SPDX-License-Identifier: SUL-1.0
/** Bounded, read-only Codex App Server model/list observation. */
import { spawn } from "node:child_process";
import { codexAvailableModelIds } from "./model-role-session.mjs";
import { resolveTrustedSystemExecutable } from "./trusted-tool-resolution.mjs";

const MAX_BYTES = 1024 * 1024;
const MAX_PAGES = 32;
const TIMEOUT_MS = 15_000;
const unavailable = (code) => ({ ok: false, code, availableModelIds: [] });

export async function observeCodexModels({ effort, executableResult,
  resolveExecutable = resolveTrustedSystemExecutable, spawnProcess = spawn,
  timeoutMs = TIMEOUT_MS } = {}) {
  const executable = executableResult ?? resolveExecutable("codex");
  if (!executable?.ok || typeof executable.path !== "string") {
    return unavailable("MODEL-ROLE-CODEX-EXECUTABLE-UNAVAILABLE");
  }
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnProcess(executable.path, ["app-server", "--stdio", "--strict-config"],
        { shell: false, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    } catch { resolve(unavailable("MODEL-ROLE-CODEX-CATALOGUE-UNAVAILABLE")); return; }
    let settled = false;
    let buffer = "";
    let bytes = 0;
    let initialized = false;
    let pageCount = 0;
    let pendingId = 2;
    let data = [];
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { child.stdin.end(); } catch {}
      try { child.kill(); } catch {}
      resolve(result);
    };
    const send = (message) => {
      try { child.stdin.write(`${JSON.stringify(message)}\n`); }
      catch { finish(unavailable("MODEL-ROLE-CODEX-CATALOGUE-UNAVAILABLE")); }
    };
    const timer = setTimeout(() => finish(unavailable("MODEL-ROLE-CODEX-CATALOGUE-TIMEOUT")),
      Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= TIMEOUT_MS ? timeoutMs : TIMEOUT_MS);
    child.on("error", () => finish(unavailable("MODEL-ROLE-CODEX-CATALOGUE-UNAVAILABLE")));
    child.on("close", () => finish(unavailable("MODEL-ROLE-CODEX-CATALOGUE-UNAVAILABLE")));
    child.stderr.on("data", () => {});
    child.stdout.on("data", (chunk) => {
      if (settled) return;
      bytes += chunk.length;
      if (bytes > MAX_BYTES) { finish(unavailable("MODEL-ROLE-CODEX-CATALOGUE-BOUNDS")); return; }
      buffer += chunk.toString("utf8");
      let newline;
      while (!settled && (newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        if (line === "") continue;
        let message;
        try { message = JSON.parse(line); }
        catch { finish(unavailable("MODEL-ROLE-CODEX-CATALOGUE-PROTOCOL")); return; }
        if (message.id === 1) {
          if (initialized || message.error || !message.result) {
            finish(unavailable("MODEL-ROLE-CODEX-CATALOGUE-PROTOCOL")); return;
          }
          initialized = true;
          send({ method: "initialized" });
          send({ id: pendingId, method: "model/list", params: { limit: 100, includeHidden: false } });
        } else if (message.id === pendingId && initialized) {
          const result = message.result;
          if (message.error || !result || !Array.isArray(result.data)
            || result.data.length > 100 || !(result.nextCursor === null
              || typeof result.nextCursor === "string" && result.nextCursor.length > 0)) {
            finish(unavailable("MODEL-ROLE-CODEX-CATALOGUE-PROTOCOL")); return;
          }
          pageCount += 1;
          data = data.concat(result.data);
          if (pageCount > MAX_PAGES || data.length > 3200) {
            finish(unavailable("MODEL-ROLE-CODEX-CATALOGUE-BOUNDS")); return;
          }
          if (result.nextCursor !== null) {
            if (pageCount === MAX_PAGES) { finish(unavailable("MODEL-ROLE-CODEX-CATALOGUE-BOUNDS")); return; }
            pendingId += 1;
            send({ id: pendingId, method: "model/list", params: {
              limit: 100, includeHidden: false, cursor: result.nextCursor } });
          } else {
            const parsed = codexAvailableModelIds({ data, nextCursor: null }, effort);
            finish(parsed.ok ? { ...parsed, assurance: "installed-host-observed" } : parsed);
          }
        }
      }
    });
    send({ id: 1, method: "initialize", params: { clientInfo: {
      name: "agent-pipeline-model-catalogue", title: null, version: "1" },
    capabilities: { experimentalApi: false, requestAttestation: false } } });
  });
}
