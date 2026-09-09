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
import {
  NATIVE_CRITIC_REDUCING_CONFIG,
  NATIVE_CRITIC_REDUCING_CONFIG_SHA256,
  nativeCriticUnknownGitActionMatchesCommand,
  nativeCriticReducingCliArgs,
  nativeCriticToolSurfaceConfigDigest,
  nativeCriticToolSurfaceObservationDigest,
  reduceDiscoveredNativeMcpServers,
  validateNativeFeaturePages,
  validateNativeMcpPages,
} from "../lib/codex-native-critic-tools.mjs";

const MAX_BYTES = 8 * 1024 * 1024;
const PROVIDER = "openai";
const COMMIT_SHA = /^[0-9a-f]{40}$/;
const TREE_SHA = /^[0-9a-f]{40,64}$/;

function write(value) { process.stdout.write(`${JSON.stringify(value)}\n`); }
function heartbeat(stage) {
  if (typeof process.send === "function") process.send({ schema: "pipeline.codex-native-critic-heartbeat.v1", stage });
}
const LEGACY_REQUEST_KEYS = Object.freeze(["candidateCommit", "candidateTree", "codexPath", "cwd", "effort", "model", "promptContractPath", "referencePaths", "reviewBase", "roleContractPath", "scratchPath", "verdictSchemaPath"]);
const NATIVE_SANDBOX_MODE = "native-tools-read-only";
const NATIVE_REQUEST_KEYS = Object.freeze([...LEGACY_REQUEST_KEYS, "sandboxMode"].sort());

function fail(code, native = false) {
  write({ schema: native ? "pipeline.codex-native-critic-app-server-child.v1" : "pipeline.codex-critic-app-server-child.v1", ok: false, code });
  process.exitCode = 2;
}

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
    ...(request.sandboxMode === NATIVE_SANDBOX_MODE ? [
      "Native Git inspection is restricted to these exact direct forms: git --no-optional-locks -c core.pager=cat --no-pager diff --no-ext-diff --no-textconv <base> <candidate> --; the corresponding candidate-only show form; optional path suffixes must be listed paths; rev-parse --verify for the supplied refs; and status --porcelain=v1 --untracked-files=no. Do not use a shell, aliases, other flags, or any other Git command.",
    ] : []),
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
  const native = request?.sandboxMode === NATIVE_SANDBOX_MODE;
  const expectedKeys = native ? NATIVE_REQUEST_KEYS : LEGACY_REQUEST_KEYS;
  const closedShape = request && typeof request === "object" && !Array.isArray(request)
    && JSON.stringify(Object.keys(request).sort()) === JSON.stringify(expectedKeys)
    && (!native || request.sandboxMode === NATIVE_SANDBOX_MODE)
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
  if (!closedShape) fail("request-invalid", native);
}

let modelInput;
if (!process.exitCode) {
  try { modelInput = renderCriticPrompt(request); }
  catch { fail("prompt-invalid"); }
}

if (!process.exitCode) {
  const native = request.sandboxMode === NATIVE_SANDBOX_MODE;
  const child = spawn(request.codexPath, ["app-server", "--stdio", "--strict-config", ...(native ? nativeCriticReducingCliArgs() : [])], {
    cwd: request.cwd,
    env: {
      ...process.env,
      ...(native ? {} : {
        CODEX_SQLITE_HOME: request.scratchPath,
        TMPDIR: request.scratchPath,
        TMP: request.scratchPath,
        TEMP: request.scratchPath,
      }),
    },
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let buffer = "";
  let stderrBytes = 0;
  let stdoutBytes = 0;
  let initialized = false;
  let discoveryThreadId = null;
  let threadId = null;
  let turnId = null;
  let answer = null;
  let turnCompleted = false;
  let writeAttempt = false;
  let writeAttemptKind = null;
  let protocolError = false;
  let settled = false;
  let observedThreadSandbox = null;
  let observedThreadReasoningEffort = null;
  let mcpReduction = null;
  let featureSnapshot = null;
  let mcpSnapshot = null;
  const discoveryMcpPages = [];
  const featurePages = [];
  const mcpPages = [];
  const discoveryMcpCursors = new Set();
  const featureCursors = new Set();
  const mcpCursors = new Set();
  const send = (value) => child.stdin.write(`${JSON.stringify(value)}\n`);
  const finishProtocol = () => {
    if (settled) return;
    settled = true;
    child.stdin.end();
  };
  const sendDiscoveryMcpPage = (cursor = null) => {
    const key = String(cursor);
    if (discoveryMcpCursors.has(key)) { protocolError = true; finishProtocol(); return; }
    discoveryMcpCursors.add(key);
    send({ id: 3, method: "mcpServerStatus/list", params: { threadId: discoveryThreadId, limit: 100, detail: "toolsAndAuthOnly", ...(cursor === null ? {} : { cursor }) } });
  };
  const startReviewThread = () => {
    send({ id: 4, method: "thread/start", params: {
      cwd: request.cwd,
      model: request.model,
      allowProviderModelFallback: false,
      ephemeral: true,
      approvalPolicy: "never",
      sandbox: "read-only",
      config: { ...NATIVE_CRITIC_REDUCING_CONFIG, model_reasoning_effort: request.effort, ...mcpReduction.config },
      developerInstructions: "One fresh read-only Critic review. Inspect only the named repository paths. Never modify files, configuration, git state, or external systems. Return exactly one final JSON verdict message.",
    } });
  };
  const sendFeaturePage = (cursor = null) => {
    const key = String(cursor);
    if (featureCursors.has(key)) { protocolError = true; finishProtocol(); return; }
    featureCursors.add(key);
    send({ id: 5, method: "experimentalFeature/list", params: { threadId, limit: 100, ...(cursor === null ? {} : { cursor }) } });
  };
  const sendMcpPage = (cursor = null) => {
    const key = String(cursor);
    if (mcpCursors.has(key)) { protocolError = true; finishProtocol(); return; }
    mcpCursors.add(key);
    send({ id: 6, method: "mcpServerStatus/list", params: { threadId, limit: 100, detail: "toolsAndAuthOnly", ...(cursor === null ? {} : { cursor }) } });
  };
  const startTurn = () => {
    send({ id: native ? 7 : 3, method: "turn/start", params: {
      threadId,
      input: [{ type: "text", text: modelInput }],
      model: request.model,
      effort: request.effort,
      approvalPolicy: "never",
      sandboxPolicy: native ? { type: "readOnly", networkAccess: false } : { type: "externalSandbox", networkAccess: "enabled" },
      cwd: request.cwd,
    } });
  };
  const sanitizedFeaturePage = (result) => {
    if (!result || typeof result !== "object" || !Array.isArray(result.data)) throw new TypeError("feature response malformed");
    return {
      data: result.data.map((row) => {
        if (!row || typeof row !== "object" || typeof row.name !== "string") throw new TypeError("feature row malformed");
        return { name: row.name, enabled: row.enabled };
      }),
      nextCursor: result.nextCursor,
    };
  };
  const sanitizedMcpPage = (result) => {
    if (!result || typeof result !== "object" || !Array.isArray(result.data)) throw new TypeError("MCP response malformed");
    return {
      data: result.data.map((row) => {
        if (!row || typeof row !== "object" || !row.tools || typeof row.tools !== "object" || Array.isArray(row.tools)
          || !Array.isArray(row.resources) || !Array.isArray(row.resourceTemplates)) throw new TypeError("MCP row malformed");
        return {
          runtimeStatus: row.runtimeStatus,
          toolsEmpty: Object.keys(row.tools).length === 0,
          resourcesEmpty: row.resources.length === 0,
          resourceTemplatesEmpty: row.resourceTemplates.length === 0,
          catalogFree: row.pluginId === null && row.serverInfo === null,
        };
      }),
      nextCursor: result.nextCursor,
    };
  };
  const sanitizedDiscoveryMcpPage = (result) => {
    if (!result || typeof result !== "object" || !Array.isArray(result.data)) throw new TypeError("MCP discovery response malformed");
    return {
      data: result.data.map((row) => {
        if (!row || typeof row !== "object") throw new TypeError("MCP discovery row malformed");
        return { name: row.name };
      }),
      nextCursor: result.nextCursor,
    };
  };
  const inspectItem = (item) => {
    if (!item || typeof item !== "object") { protocolError = true; return; }
    if (native && typeof item.type === "string" && /(mcp|dynamic|collab|tool)/i.test(item.type)) {
      writeAttempt = true; writeAttemptKind ??= "tool-item"; return;
    }
    if (item.type === "fileChange") { writeAttempt = true; writeAttemptKind ??= "file-change"; return; }
    if (item.type === "commandExecution") {
      const knownReadActions = Array.isArray(item.commandActions)
        && item.commandActions.every((action) => ["read", "listFiles", "search"].includes(action?.type));
      const boundedNativeGitRead = native && Array.isArray(item.commandActions) && item.commandActions.length === 1
        && item.commandActions[0]?.type === "unknown"
        && nativeCriticUnknownGitActionMatchesCommand(item.command, item.commandActions[0].command, request);
      if (!knownReadActions && !boundedNativeGitRead) {
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
      if (native) heartbeat("initialized");
      send({ method: "initialized" });
      send({ id: 2, method: "thread/start", params: {
        cwd: request.cwd,
        model: request.model,
        allowProviderModelFallback: false,
        ephemeral: true,
        approvalPolicy: "never",
        sandbox: "read-only",
        ...(native ? { config: { ...NATIVE_CRITIC_REDUCING_CONFIG } } : {}),
        developerInstructions: "One fresh read-only Critic review. Inspect only the named repository paths. Never modify files, configuration, git state, or external systems. Return exactly one final JSON verdict message.",
      } });
      return;
    }
    if (value?.id === 2) {
      const result = value.result;
      if (value.error || result?.model !== request.model || result?.modelProvider !== PROVIDER
        || result?.approvalPolicy !== "never" || typeof result?.thread?.id !== "string"
        || (native && (result?.sandbox?.type !== "readOnly" || result?.sandbox?.networkAccess !== false))) {
        protocolError = true; finishProtocol(); return;
      }
      if (native) {
        discoveryThreadId = result.thread.id;
        heartbeat("discovery-thread-started");
        sendDiscoveryMcpPage();
      } else {
        threadId = result.thread.id;
        startTurn();
      }
      return;
    }
    if (native && value?.id === 3) {
      try {
        const page = sanitizedDiscoveryMcpPage(value.result);
        if (value.error || discoveryMcpPages.length >= 10) throw new TypeError("MCP discovery response invalid");
        discoveryMcpPages.push(page);
        if (page.nextCursor != null) sendDiscoveryMcpPage(page.nextCursor);
        else {
          mcpReduction = reduceDiscoveredNativeMcpServers(discoveryMcpPages);
          startReviewThread();
        }
      } catch { protocolError = true; finishProtocol(); }
      return;
    }
    if (native && value?.id === 4) {
      const result = value.result;
      if (value.error || result?.model !== request.model || result?.modelProvider !== PROVIDER
        || result?.approvalPolicy !== "never" || typeof result?.thread?.id !== "string"
        || result.thread.id === discoveryThreadId
        || result?.sandbox?.type !== "readOnly" || result?.sandbox?.networkAccess !== false
        || result?.reasoningEffort !== request.effort) {
        protocolError = true; finishProtocol(); return;
      }
      threadId = result.thread.id;
      observedThreadSandbox = { type: result.sandbox.type, networkAccess: result.sandbox.networkAccess };
      observedThreadReasoningEffort = result.reasoningEffort;
      heartbeat("review-thread-started");
      sendFeaturePage();
      return;
    }
    if (native && value?.id === 5) {
      try {
        const page = sanitizedFeaturePage(value.result);
        if (value.error || featurePages.length >= 10) throw new TypeError("feature response invalid");
        featurePages.push(page);
        if (page.nextCursor != null) sendFeaturePage(page.nextCursor);
        else {
          featureSnapshot = validateNativeFeaturePages(featurePages);
          sendMcpPage();
        }
      } catch { protocolError = true; finishProtocol(); }
      return;
    }
    if (native && value?.id === 6) {
      try {
        if (value.error || mcpPages.length >= 10) throw new TypeError("MCP response invalid");
        const page = sanitizedMcpPage(value.result);
        mcpPages.push(page);
        if (page.nextCursor != null) sendMcpPage(page.nextCursor);
        else {
          mcpSnapshot = validateNativeMcpPages(mcpPages);
          startTurn();
        }
      } catch { protocolError = true; finishProtocol(); }
      return;
    }
    if (value?.id === (native ? 7 : 3)) {
      if (value.error || typeof value.result?.turn?.id !== "string") { protocolError = true; finishProtocol(); return; }
      turnId = value.result.turn.id;
      if (native) heartbeat("turn-started");
      return;
    }
    if (value?.method === "item/completed") {
      if (value.params?.threadId !== threadId || value.params?.turnId !== turnId) protocolError = true;
      else inspectItem(value.params.item);
      if (native && !protocolError && !writeAttempt) heartbeat("review-progress");
      return;
    }
    if (value?.method === "turn/completed") {
      if (value.params?.threadId !== threadId || value.params?.turn?.id !== turnId
        || value.params?.turn?.status !== "completed" || answer === null) protocolError = true;
      else turnCompleted = true;
      if (native && turnCompleted) heartbeat("turn-completed");
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
  send({ id: 1, method: "initialize", params: { clientInfo: { name: "agent-pipeline-critic", title: null, version: "1" }, capabilities: { experimentalApi: native, requestAttestation: false } } });
  // One child turn, not a retry loop. Matches HOST_LIMITS.maxElapsedMs
  // (codex-critic-host.mjs) rather than the shorter advisory budget.
  const timeout = setTimeout(() => { protocolError = true; finishProtocol(); child.kill("SIGTERM"); }, 480_000);
  const close = await new Promise((resolve) => {
    child.once("error", (error) => resolve({ code: null, signal: null, spawnError: error?.code ?? "spawn-error" }));
    child.once("close", (code, signal) => resolve({ code, signal, spawnError: null }));
  });
  clearTimeout(timeout);
  const lifecycleOk = initialized && threadId && turnId && turnCompleted && answer !== null && !writeAttempt && !protocolError
    && (!native || (discoveryThreadId !== null && observedThreadSandbox !== null && observedThreadReasoningEffort === request.effort && mcpReduction !== null && featureSnapshot !== null && mcpSnapshot !== null))
    && close.spawnError === null && close.code === 0 && close.signal === null && child.stdin.writableEnded;
  const ok = native ? Boolean(lifecycleOk) : lifecycleOk;
  write({
    schema: native ? "pipeline.codex-native-critic-app-server-child.v1" : "pipeline.codex-critic-app-server-child.v1",
    ok,
    code: ok ? "answered" : writeAttempt ? "write-attempt" : protocolError ? "protocol-error" : "child-exit-error",
    answer: ok ? answer : null,
    observed: {
      provider: ok ? PROVIDER : null,
      model: ok ? request.model : null,
      effort: ok ? request.effort : null,
      initialized,
      threadStarted: threadId !== null,
      turnStarted: turnId !== null,
      turnCompleted,
      stdinEnded: child.stdin.writableEnded,
      exitCode: close.code,
      signal: close.signal,
      cleanup: close.spawnError === null && close.signal === null ? "complete" : "incomplete",
      writeAttemptKind,
      ...(native ? {
        requestedNativePolicy: { threadSandbox: "read-only", turn: { type: "readOnly", networkAccess: false } },
        observedThreadSandbox,
        observedThreadReasoningEffort,
        requestedToolReduction: {
          featureConfigSha256: NATIVE_CRITIC_REDUCING_CONFIG_SHA256,
          mcpReductionCount: mcpReduction?.dataCount ?? null,
          mcpReductionConfigSha256: mcpReduction?.configSha256 ?? null,
        },
        toolSurface: {
          configSha256: mcpReduction ? nativeCriticToolSurfaceConfigDigest(mcpReduction) : null,
          observationSha256: featureSnapshot && mcpSnapshot ? nativeCriticToolSurfaceObservationDigest(featureSnapshot, mcpSnapshot) : null,
          mcpReductionCount: mcpReduction?.dataCount ?? null,
          featureSnapshot: featureSnapshot && { pageCount: featureSnapshot.pageCount, dataCount: featureSnapshot.dataCount, digest: featureSnapshot.digest },
          mcpSnapshot: mcpSnapshot && { pageCount: mcpSnapshot.pageCount, dataCount: mcpSnapshot.dataCount, digest: mcpSnapshot.digest },
          snapshotLimitation: "pre-turn thread configuration snapshot; not atomic with turn start",
        },
      } : {}),
    },
  });
  process.exitCode = ok ? 0 : 2;
}
