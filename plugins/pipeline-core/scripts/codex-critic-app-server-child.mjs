#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Fixed child payload for one ephemeral Codex Critic turn, briefed with paths
 * and refs only (never embedded evidence content). Mirrors
 * codex-advisory-app-server-child.mjs's protocol-observation discipline; the
 * verdict-shape check itself is the host's job (codex-critic-app-server.mjs),
 * not this child's -- this file only reports what actually happened on the
 * wire.
 */
import { spawn } from "node:child_process";

const MAX_BYTES = 8 * 1024 * 1024;
const PROVIDER = "openai";
const COMMIT_SHA = /^[0-9a-f]{40}$/;
const TREE_SHA = /^[0-9a-f]{40,64}$/;

function write(value) { process.stdout.write(`${JSON.stringify(value)}\n`); }
function fail(code) { write({ schema: "pipeline.codex-critic-app-server-child.v1", ok: false, code }); process.exitCode = 2; }

function renderCriticPrompt(request) {
  const lines = [
    "You are the Agent-Pipeline Critic, operating at the read-only isolation level.",
    "This is a fresh session with no memory of any other session.",
    `Role contract (read first): ${request.roleContractPath}`,
    `Prompt contract (read second): ${request.promptContractPath}`,
    `Review base commit: ${request.reviewBase}`,
    `Candidate commit: ${request.candidateCommit}`,
    `Candidate tree: ${request.candidateTree}`,
    "Reference paths to inspect, relative to your working directory:",
    ...request.referencePaths.map((path) => `- ${path}`),
    `Produce exactly one final message: a single JSON object matching the schema at ${request.verdictSchemaPath}, and nothing else -- no prose, no markdown code fence.`,
    "Never modify any file, git state, or external system.",
  ];
  return lines.join("\n");
}

let request;
try {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  request = JSON.parse(Buffer.concat(chunks).toString("utf8"));
} catch { fail("request-invalid"); }

if (!process.exitCode) {
  const closedShape = request && typeof request === "object" && !Array.isArray(request)
    && JSON.stringify(Object.keys(request).sort()) === JSON.stringify(["candidateCommit", "candidateTree", "codexPath", "cwd", "effort", "model", "promptContractPath", "referencePaths", "reviewBase", "roleContractPath", "scratchPath", "verdictSchemaPath"])
    && typeof request.codexPath === "string" && request.codexPath.startsWith("/")
    && typeof request.cwd === "string" && request.cwd.startsWith("/")
    && typeof request.scratchPath === "string" && request.scratchPath.startsWith("/")
    && typeof request.roleContractPath === "string" && request.roleContractPath.startsWith("/")
    && typeof request.promptContractPath === "string" && request.promptContractPath.startsWith("/")
    && typeof request.verdictSchemaPath === "string" && request.verdictSchemaPath.startsWith("/")
    && typeof request.model === "string" && request.model.length > 0
    && typeof request.effort === "string" && request.effort.length > 0
    && Array.isArray(request.referencePaths) && request.referencePaths.length > 0
    && request.referencePaths.every((path) => typeof path === "string" && path.length > 0 && !path.startsWith("/"))
    && COMMIT_SHA.test(request.candidateCommit) && TREE_SHA.test(request.candidateTree) && COMMIT_SHA.test(request.reviewBase);
  if (!closedShape) fail("request-invalid");
}

let modelInput;
if (!process.exitCode) {
  try { modelInput = renderCriticPrompt(request); }
  catch { fail("prompt-invalid"); }
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
  let writeAttemptKind = null;
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
    if (item.type === "fileChange") { writeAttempt = true; writeAttemptKind ??= "file-change"; return; }
    if (item.type === "commandExecution") {
      if (!Array.isArray(item.commandActions)
        || item.commandActions.some((action) => !["read", "listFiles", "search"].includes(action?.type))) {
        writeAttempt = true; writeAttemptKind ??= "command-action";
      }
    }
    if (item.type === "agentMessage") {
      if (typeof item.text !== "string") { protocolError = true; return; }
      // Codex 0.153.4 emits commentary before final_answer. Missing phase is
      // accepted only as the single legacy answer; multiple unknown replies
      // never become a verdict by accident.
      if (item.phase === "commentary") return;
      if (item.phase === "final_answer" || item.phase === undefined || item.phase === null) {
        if (answer !== null) protocolError = true;
        else answer = item.text;
        return;
      }
      protocolError = true;
    }
  };
  const onMessage = (value) => {
    if (value?.method && value?.id !== undefined) { writeAttempt = true; writeAttemptKind ??= "server-rpc-request"; finishProtocol(); return; }
    if (value?.id === 1) {
      if (value.error || !value.result || initialized) { protocolError = true; finishProtocol(); return; }
      initialized = true;
      send({ method: "initialized" });
      send({ id: 2, method: "thread/start", params: {
        cwd: request.cwd,
        model: request.model,
        allowProviderModelFallback: false,
        ephemeral: true,
        approvalPolicy: "never",
        sandbox: "read-only",
        developerInstructions: "One fresh read-only Critic review. Inspect only the named repository paths. Never modify files, configuration, git state, or external systems. Return exactly one final JSON verdict message.",
      } });
      return;
    }
    if (value?.id === 2) {
      const result = value.result;
      if (value.error || result?.model !== request.model || result?.modelProvider !== PROVIDER
        || result?.approvalPolicy !== "never" || typeof result?.thread?.id !== "string") {
        protocolError = true; finishProtocol(); return;
      }
      threadId = result.thread.id;
      send({ id: 3, method: "turn/start", params: {
        threadId,
        input: [{ type: "text", text: modelInput }],
        model: request.model,
        effort: request.effort,
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
  send({ id: 1, method: "initialize", params: { clientInfo: { name: "agent-pipeline-critic", title: null, version: "1" }, capabilities: { experimentalApi: false, requestAttestation: false } } });
  // One child turn, not a retry loop. Matches HOST_LIMITS.maxElapsedMs
  // (codex-critic-host.mjs) rather than the shorter advisory budget.
  const timeout = setTimeout(() => { protocolError = true; finishProtocol(); child.kill("SIGTERM"); }, 480_000);
  const close = await new Promise((resolve) => {
    child.once("error", (error) => resolve({ code: null, signal: null, spawnError: error?.code ?? "spawn-error" }));
    child.once("close", (code, signal) => resolve({ code, signal, spawnError: null }));
  });
  clearTimeout(timeout);
  const ok = initialized && threadId && turnId && turnCompleted && answer !== null && !writeAttempt && !protocolError
    && close.spawnError === null && close.code === 0 && close.signal === null && child.stdin.writableEnded;
  write({
    schema: "pipeline.codex-critic-app-server-child.v1",
    ok,
    code: ok ? "answered" : writeAttempt ? "write-attempt" : protocolError ? "protocol-error" : "child-exit-error",
    answer: ok ? answer : null,
    observed: { provider: ok ? PROVIDER : null, model: ok ? request.model : null, effort: ok ? request.effort : null, initialized, threadStarted: threadId !== null, turnStarted: turnId !== null, turnCompleted, stdinEnded: child.stdin.writableEnded, exitCode: close.code, signal: close.signal, cleanup: close.spawnError === null && close.signal === null ? "complete" : "incomplete", writeAttemptKind },
  });
  process.exitCode = ok ? 0 : 2;
}
