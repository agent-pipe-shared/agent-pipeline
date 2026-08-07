// SPDX-License-Identifier: SUL-1.0
/** Bounded Codex App Server `thread/goal/*` adapter with mandatory readback. */
import { createHash, randomBytes } from "node:crypto";
import { lstatSync } from "node:fs";
import net from "node:net";
import { reconcileRunnerNativeContinuation } from "../lib/continuity-state.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const ACTIONS = new Set(["set", "pause", "clear"]);
const GOAL_STATES = new Set(["active", "paused", "blocked", "complete"]);
const APP_SERVER_TIMEOUT_MS = 3_000;
// Client frames use the bounded 16-bit WebSocket length form; keep the limit
// below 65,536 rather than silently truncating a larger payload.
const APP_SERVER_MAX_FRAME_BYTES = 60 * 1024;
const WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) { return object(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function digest(value) { return typeof value === "string" && SHA256.test(value); }
function id(value) { return typeof value === "string" && SAFE_ID.test(value); }
function hash(value) { return createHash("sha256").update(value, "utf8").digest("hex"); }
function nonEmpty(value) { return typeof value === "string" && value.length > 0; }
function absolutePath(value) { return nonEmpty(value) && value.startsWith("/") && value.length <= 4096 && !value.includes("\0"); }

function assertPrivateAppServerSocket(socketPath) {
  if (!absolutePath(socketPath)) throw new Error("invalid app-server socket path");
  const info = lstatSync(socketPath);
  if (info.isSymbolicLink() || !info.isSocket() || info.uid !== process.getuid() || (info.mode & 0o077) !== 0) {
    throw new Error("app-server socket is not private");
  }
}

function websocketAccept(key) { return createHash("sha1").update(`${key}${WEBSOCKET_GUID}`, "utf8").digest("base64"); }

function websocketClientFrame(payload, opcode = 0x1) {
  const body = Buffer.from(payload, "utf8");
  if (body.length > APP_SERVER_MAX_FRAME_BYTES) throw new Error("app-server request exceeds frame limit");
  const mask = randomBytes(4);
  const header = body.length < 126 ? Buffer.from([0x80 | opcode, 0x80 | body.length]) : Buffer.from([0x80 | opcode, 0x80 | 126, body.length >> 8, body.length & 0xff]);
  const masked = Buffer.alloc(body.length);
  for (let index = 0; index < body.length; index += 1) masked[index] = body[index] ^ mask[index % 4];
  return Buffer.concat([header, mask, masked]);
}

function consumeWebsocketFrames(buffer, onFrame) {
  let cursor = 0;
  while (buffer.length - cursor >= 2) {
    const first = buffer[cursor]; const second = buffer[cursor + 1];
    const fin = (first & 0x80) !== 0; const opcode = first & 0x0f; const masked = (second & 0x80) !== 0;
    let size = second & 0x7f; let header = 2;
    if (!fin || masked) throw new Error("invalid app-server websocket frame");
    if (size === 126) {
      if (buffer.length - cursor < 4) break;
      size = buffer.readUInt16BE(cursor + 2); header = 4;
    } else if (size === 127) throw new Error("oversized app-server websocket frame");
    if (size > APP_SERVER_MAX_FRAME_BYTES) throw new Error("oversized app-server websocket frame");
    if (buffer.length - cursor < header + size) break;
    onFrame(opcode, buffer.subarray(cursor + header, cursor + header + size));
    cursor += header + size;
  }
  return buffer.subarray(cursor);
}

/**
 * Open the already-running local Codex App Server over its private Unix socket.
 * This is a client only: it never starts/restarts an App Server and accepts no
 * endpoint discovered from untrusted project files. Callers must supply the
 * in-memory daemon socket observation returned by the sanctioned health check.
 */
export async function openCodexAppServerUnixClient({ socketPath, timeoutMs = APP_SERVER_TIMEOUT_MS, connect = net.createConnection, assertSocket = assertPrivateAppServerSocket } = {}) {
  assertSocket(socketPath);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 10_000) throw new Error("invalid app-server timeout");
  const socket = connect(socketPath);
  const pending = new Map(); let nextId = 1; let closed = false; let handshake = Buffer.alloc(0); let frames = Buffer.alloc(0); let handshakeReady = null;
  const fail = (error) => {
    if (closed) return;
    closed = true;
    handshakeReady?.reject(error);
    for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(error); }
    pending.clear(); socket.destroy();
  };
  const request = (method, params = {}) => new Promise((resolve, reject) => {
    if (closed || !nonEmpty(method)) { reject(new Error("app-server client is closed")); return; }
    const id = nextId; nextId += 1;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("app-server request timed out")); }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    try { socket.write(websocketClientFrame(JSON.stringify({ method, id, params }))); } catch (error) { pending.delete(id); clearTimeout(timer); reject(error); }
  });
  socket.on("error", fail);
  socket.on("close", () => { if (!closed) fail(new Error("app-server socket closed")); });
  socket.on("data", (chunk) => {
    try {
      if (handshake !== null) {
        handshake = Buffer.concat([handshake, chunk]);
        const end = handshake.indexOf("\r\n\r\n");
        if (end < 0) { if (handshake.length > 16 * 1024) throw new Error("oversized app-server handshake"); return; }
        const header = handshake.subarray(0, end).toString("utf8"); const rest = handshake.subarray(end + 4); handshake = null;
        if (!/^HTTP\/1\.1 101\b/mu.test(header) || !/^upgrade:\s*websocket\s*$/imu.test(header)) throw new Error("app-server websocket upgrade rejected");
        const expected = websocketAccept(socket.__pipelineWebsocketKey);
        const accepted = /^sec-websocket-accept:\s*([^\r\n]+)\s*$/imu.exec(header)?.[1] ?? "";
        if (accepted !== expected) throw new Error("app-server websocket accept mismatch");
        frames = rest;
        handshakeReady?.resolve();
      } else frames = Buffer.concat([frames, chunk]);
      if (handshake === null) frames = consumeWebsocketFrames(frames, (opcode, body) => {
        if (opcode === 0x8) throw new Error("app-server closed websocket");
        if (opcode === 0x9) { socket.write(websocketClientFrame(body.toString("utf8"), 0xA)); return; }
        if (opcode !== 0x1) throw new Error("unsupported app-server websocket frame");
        const message = JSON.parse(body.toString("utf8"));
        if (!Number.isSafeInteger(message?.id) || !pending.has(message.id)) return;
        const entry = pending.get(message.id); pending.delete(message.id); clearTimeout(entry.timer);
        if (object(message.error)) entry.reject(new Error("app-server request failed")); else entry.resolve(message.result);
      });
    } catch (error) { fail(error); }
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("app-server connection timed out")), timeoutMs);
    socket.once("connect", () => { clearTimeout(timer); resolve(); });
    socket.once("error", (error) => { clearTimeout(timer); reject(error); });
  });
  const key = randomBytes(16).toString("base64"); socket.__pipelineWebsocketKey = key;
  const handshakePromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("app-server handshake timed out")), timeoutMs);
    handshakeReady = { resolve: () => { clearTimeout(timer); resolve(); }, reject: (error) => { clearTimeout(timer); reject(error); } };
  });
  socket.write(`GET / HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
  await handshakePromise;
  await request("initialize", { clientInfo: { name: "agent-pipeline-native-continuation", title: null, version: "1" }, capabilities: { experimentalApi: false, requestAttestation: false } });
  socket.write(websocketClientFrame(JSON.stringify({ method: "initialized", params: {} })));
  return { request, close: () => { if (!closed) { closed = true; socket.destroy(); } } };
}

function activeThreadIds(listed, rootDir) {
  if (!object(listed) || !Array.isArray(listed.data) || listed.data.length > 32) return null;
  const matches = listed.data.filter((thread) => object(thread) && id(thread.id) && thread.cwd === rootDir && thread.status?.type === "active");
  return matches.map((thread) => thread.id);
}

/** Resolve exactly one active current-project thread without retaining its raw id. */
export async function resolveActiveCodexThreadId({ rootDir, request } = {}) {
  if (!absolutePath(rootDir) || typeof request !== "function") return { ok: false, code: "CGH-THREAD-INPUT", threadId: null };
  try {
    const ids = activeThreadIds(await request("thread/list", { cwd: rootDir, archived: false, limit: 32, sortDirection: "desc", useStateDbOnly: true }), rootDir);
    if (ids === null) return { ok: false, code: "CGH-THREAD-READBACK", threadId: null };
    if (ids.length === 0) return { ok: false, code: "CGH-THREAD-NONE", threadId: null };
    if (ids.length !== 1) return { ok: false, code: "CGH-THREAD-AMBIGUOUS", threadId: null };
    return { ok: true, code: "CGH-THREAD-RESOLVED", threadId: ids[0] };
  } catch { return { ok: false, code: "CGH-THREAD-TRANSPORT", threadId: null }; }
}

/**
 * Reconcile through the single pre-existing local App Server. The endpoint and
 * thread id live only for this call; neither is written to Pipeline state.
 */
export async function reconcileCodexNativeContinuationViaAppServer(input, { rootDir, socketPath, openClient = openCodexAppServerUnixClient } = {}) {
  let client;
  try { client = await openClient({ socketPath }); } catch { return { ok: false, code: "RNC-CODEX-TRANSPORT", action: "none", expectedRevision: null, next: null, continuation: null }; }
  try {
    const resolved = await resolveActiveCodexThreadId({ rootDir, request: client.request });
    if (!resolved.ok) return { ok: false, code: resolved.code, action: "none", expectedRevision: null, next: null, continuation: null };
    return await reconcileCodexNativeContinuation(input, { threadId: resolved.threadId, request: client.request });
  } finally { client.close?.(); }
}

/** Render a bounded, non-secret native objective from an already-approved contract. */
export function renderCodexGoalObjective({ subject, generation, objective }) {
  if (!exact(subject, ["featureId", "phase", "packageId", "actionId"]) || !Object.values(subject).every(id)
    || !Number.isSafeInteger(generation) || generation < 0 || !digest(objective?.conditionSha256)) return null;
  return `Pipeline continuation: feature=${subject.featureId}; phase=${subject.phase}; package=${subject.packageId}; action=${subject.actionId}; generation=${generation}; condition=${objective.conditionSha256}. Continue only until verified completion, named PO gate, typed blocker, or explicit user control.`;
}

function validInput(value) {
  return exact(value, ["threadId", "action", "subject", "generation", "objective"])
    && typeof value.threadId === "string" && value.threadId.length > 0 && value.threadId.length <= 256
    && ACTIONS.has(value.action) && Number.isSafeInteger(value.generation) && value.generation >= 0
    && object(value.objective) && digest(value.objective.conditionSha256)
    && exact(value.subject, ["featureId", "phase", "packageId", "actionId"]) && Object.values(value.subject).every(id);
}

function unavailable(code) { return { ok: false, code, status: "unavailable", readback: null }; }

/**
 * A native blocked goal is a host-control stop, never an invitation to create
 * a replacement goal or silently continue work. The caller must surface this
 * exact operator action before another automatic pipeline step is attempted.
 */
export function renderCodexGoalBlockedNotice(goal) {
  if (!object(goal) || typeof goal.threadId !== "string" || typeof goal.objective !== "string" || goal.status !== "blocked") return null;
  return "Codex goal is blocked: automated Pipeline work is stopped. If the same blocker is resolved, resume this goal in the Codex CLI. If the objective or scope changed, set a short replacement with /goal <new objective> instead; mobile/read-only surfaces may not provide either control.";
}

function sameNativeGoal(goal, threadId, objective) {
  return object(goal) && goal.threadId === threadId && goal.objective === objective;
}

/**
 * Execute exactly one requested native goal action followed by `thread/goal/get`.
 * `request` is the already-authenticated App Server JSON-RPC client; this adapter
 * intentionally does not start a second host or change its policy.
 */
export async function reconcileCodexGoal(input, { request } = {}) {
  if (!validInput(input) || typeof request !== "function") return unavailable("CGH-INPUT");
  const objective = renderCodexGoalObjective(input);
  if (objective === null) return unavailable("CGH-OBJECTIVE");
  try {
    if (input.action === "set") {
      const current = await request("thread/goal/get", { threadId: input.threadId });
      const goal = current?.goal ?? null;
      if (sameNativeGoal(goal, input.threadId, objective) && goal.status === "blocked") {
        return {
          ok: false,
          code: "CGH-BLOCKED-RESUME-REQUIRED",
          status: "blocked",
          readback: { goalIdSha256: hash(`${goal.threadId}\n${goal.objective}`), generation: input.generation, observedAt: new Date().toISOString(), status: "blocked" },
          notice: renderCodexGoalBlockedNotice(goal),
        };
      }
      if (object(goal) && goal.threadId === input.threadId && goal.status === "blocked") {
        return unavailable("CGH-BLOCKED-IDENTITY-MISMATCH");
      }
      if (object(goal) && goal.threadId === input.threadId && !sameNativeGoal(goal, input.threadId, objective)) {
        return unavailable(goal.status === "active" ? "CGH-ACTIVE-IDENTITY-MISMATCH" : "CGH-GOAL-IDENTITY-MISMATCH");
      }
      if (!(sameNativeGoal(goal, input.threadId, objective) && goal.status === "active")) {
        const set = await request("thread/goal/set", { threadId: input.threadId, objective, status: "active", tokenBudget: null });
        if (!object(set?.goal)) return unavailable("CGH-SET");
      }
    } else if (input.action === "pause") {
      const current = await request("thread/goal/get", { threadId: input.threadId });
      const goal = current?.goal ?? null;
      if (!sameNativeGoal(goal, input.threadId, objective) || !["active", "paused"].includes(goal.status)) {
        return unavailable("CGH-PAUSE-IDENTITY-MISMATCH");
      }
      if (goal.status === "active") {
        const paused = await request("thread/goal/set", { threadId: input.threadId, objective, status: "paused", tokenBudget: null });
        if (!object(paused?.goal)) return unavailable("CGH-PAUSE");
      }
    } else {
      const cleared = await request("thread/goal/clear", { threadId: input.threadId });
      if (cleared?.cleared !== true) return unavailable("CGH-CLEAR");
    }
    const observed = await request("thread/goal/get", { threadId: input.threadId });
    const goal = observed?.goal ?? null;
    if (input.action === "clear") {
      return goal === null ? { ok: true, code: "CGH-CLEARED", status: "cleared", readback: { goalIdSha256: null, generation: input.generation, status: "cleared" } } : unavailable("CGH-CLEAR-READBACK");
    }
    const expectedStatus = input.action === "pause" ? "paused" : "active";
    if (!object(goal) || !sameNativeGoal(goal, input.threadId, objective) || goal.status !== expectedStatus
      || !GOAL_STATES.has(goal.status)) return unavailable("CGH-READBACK");
    return { ok: true, code: input.action === "pause" ? "CGH-PAUSED" : "CGH-ACTIVE", status: expectedStatus, readback: { goalIdSha256: hash(`${goal.threadId}\n${goal.objective}`), generation: input.generation, observedAt: new Date().toISOString(), status: expectedStatus } };
  } catch { return unavailable("CGH-TRANSPORT"); }
}

/**
 * Bind a validated continuity proposal to the current Codex App Server thread.
 * The host-local thread handle is consumed only by the adapter and is never
 * persisted in the continuation record returned for the sanctioned CAS.
 */
export async function reconcileCodexNativeContinuation(input, { threadId, request } = {}) {
  if (typeof threadId !== "string" || threadId.length === 0 || typeof request !== "function") {
    return { ok: false, code: "RNC-CODEX-HOST", action: "none", expectedRevision: null, next: null, continuation: null };
  }
  return reconcileRunnerNativeContinuation({
    ...input,
    adapter: (goal) => reconcileCodexGoal({
      action: goal.action,
      generation: goal.generation,
      objective: goal.objective,
      subject: {
        featureId: goal.subject.featureId,
        phase: goal.subject.phase,
        packageId: goal.subject.packageId,
        actionId: goal.subject.actionId,
      },
      threadId,
    }, { request }),
  });
}
