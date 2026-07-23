#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Fixed child payload for one ephemeral Codex advisory turn. */
import { spawn } from "node:child_process";

const MAX_BYTES = 8 * 1024 * 1024;
const MODEL = "gpt-5.6-sol";
const PROVIDER = "openai";
const EFFORT = "max";

function write(value) { process.stdout.write(`${JSON.stringify(value)}\n`); }
function fail(code) { write({ schema: "pipeline.codex-advisory-app-server-child.v1", ok: false, code }); process.exitCode = 2; }

let request;
try {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  request = JSON.parse(Buffer.concat(chunks).toString("utf8"));
} catch { fail("request-invalid"); }

if (!process.exitCode) {
  const closedShape = request && typeof request === "object" && !Array.isArray(request)
    && JSON.stringify(Object.keys(request).sort()) === JSON.stringify(["codexPath", "cwd", "question", "scratchPath"])
    && typeof request.codexPath === "string" && request.codexPath.startsWith("/")
    && typeof request.cwd === "string" && request.cwd.startsWith("/")
    && typeof request.scratchPath === "string" && request.scratchPath.startsWith("/")
    && typeof request.question === "string" && request.question.length > 0 && Buffer.byteLength(request.question) <= 262_144;
  if (!closedShape) fail("request-invalid");
}

if (!process.exitCode) {
  const child = spawn(request.codexPath, ["app-server", "--stdio", "--strict-config"], {
    cwd: request.cwd,
    env: {
      ...process.env,
      CODEX_SQLITE_HOME: request.scratchPath,
      TMPDIR: request.scratchPath,
      TMP: request.scratchPath,
      TEMP: request.scratchPath,
    },
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let buffer = "";
  let stderrBytes = 0;
  let stdoutBytes = 0;
  let initialized = false;
  let threadId = null;
  let turnId = null;
  let answer = null;
  let turnCompleted = false;
  let writeAttempt = false;
  let protocolError = false;
  let settled = false;
  const send = (value) => child.stdin.write(`${JSON.stringify(value)}\n`);
  const finishProtocol = () => {
    if (settled) return;
    settled = true;
    child.stdin.end();
  };
  const inspectItem = (item) => {
    if (!item || typeof item !== "object") { protocolError = true; return; }
    if (item.type === "fileChange") { writeAttempt = true; return; }
    if (item.type === "commandExecution") {
      if (!Array.isArray(item.commandActions)
        || item.commandActions.some((action) => !["read", "listFiles", "search"].includes(action?.type))) writeAttempt = true;
    }
    if (item.type === "agentMessage") {
      if (typeof item.text !== "string" || answer !== null) protocolError = true;
      else answer = item.text;
    }
  };
  const onMessage = (value) => {
    if (value?.method && value?.id !== undefined) { writeAttempt = true; finishProtocol(); return; }
    if (value?.id === 1) {
      if (value.error || !value.result || initialized) { protocolError = true; finishProtocol(); return; }
      initialized = true;
      send({ method: "initialized" });
      send({ id: 2, method: "thread/start", params: {
        cwd: request.cwd,
        model: MODEL,
        allowProviderModelFallback: false,
        ephemeral: true,
        approvalPolicy: "never",
        sandbox: "read-only",
        developerInstructions: "One fresh read-only advisory. Inspect only the repository. Never modify files, configuration, git state, or external systems. Return one concise answer.",
      } });
      return;
    }
    if (value?.id === 2) {
      const result = value.result;
      if (value.error || result?.model !== MODEL || result?.modelProvider !== PROVIDER
        || result?.approvalPolicy !== "never" || typeof result?.thread?.id !== "string") {
        protocolError = true; finishProtocol(); return;
      }
      threadId = result.thread.id;
      send({ id: 3, method: "turn/start", params: {
        threadId,
        input: [{ type: "text", text: request.question }],
        model: MODEL,
        effort: EFFORT,
        approvalPolicy: "never",
        sandboxPolicy: { type: "externalSandbox", networkAccess: "enabled" },
        cwd: request.cwd,
      } });
      return;
    }
    if (value?.id === 3) {
      if (value.error || typeof value.result?.turn?.id !== "string") { protocolError = true; finishProtocol(); return; }
      turnId = value.result.turn.id;
      return;
    }
    if (value?.method === "item/completed") {
      if (value.params?.threadId !== threadId || value.params?.turnId !== turnId) protocolError = true;
      else inspectItem(value.params.item);
      return;
    }
    if (value?.method === "turn/completed") {
      if (value.params?.threadId !== threadId || value.params?.turn?.id !== turnId
        || value.params?.turn?.status !== "completed" || answer === null) protocolError = true;
      else turnCompleted = true;
      finishProtocol();
    }
  };
  child.stdout.on("data", (chunk) => {
    stdoutBytes += chunk.length;
    if (stdoutBytes > MAX_BYTES) { protocolError = true; finishProtocol(); return; }
    buffer += chunk.toString("utf8");
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
      if (!line) continue;
      try { onMessage(JSON.parse(line)); } catch { protocolError = true; finishProtocol(); }
    }
  });
  child.stderr.on("data", (chunk) => { stderrBytes += chunk.length; if (stderrBytes > MAX_BYTES) { protocolError = true; finishProtocol(); } });
  send({ id: 1, method: "initialize", params: { clientInfo: { name: "agent-pipeline-advisory", title: null, version: "1" }, capabilities: { experimentalApi: false, requestAttestation: false } } });
  const timeout = setTimeout(() => { protocolError = true; finishProtocol(); child.kill("SIGTERM"); }, 120_000);
  const close = await new Promise((resolve) => {
    child.once("error", (error) => resolve({ code: null, signal: null, spawnError: error?.code ?? "spawn-error" }));
    child.once("close", (code, signal) => resolve({ code, signal, spawnError: null }));
  });
  clearTimeout(timeout);
  const ok = initialized && threadId && turnId && turnCompleted && answer !== null && !writeAttempt && !protocolError
    && close.spawnError === null && close.code === 0 && close.signal === null && child.stdin.writableEnded;
  write({
    schema: "pipeline.codex-advisory-app-server-child.v1",
    ok,
    code: ok ? "answered" : writeAttempt ? "write-attempt" : protocolError ? "protocol-error" : "child-exit-error",
    answer: ok ? answer : null,
    observed: { provider: ok ? PROVIDER : null, model: ok ? MODEL : null, effort: ok ? EFFORT : null, initialized, threadStarted: threadId !== null, turnStarted: turnId !== null, turnCompleted, stdinEnded: child.stdin.writableEnded, exitCode: close.code, signal: close.signal, cleanup: close.spawnError === null && close.signal === null ? "complete" : "incomplete" },
  });
  process.exitCode = ok ? 0 : 2;
}
