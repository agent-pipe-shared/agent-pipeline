// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { openCodexAppServerUnixClient, reconcileCodexGoal, reconcileCodexNativeContinuation, reconcileCodexNativeContinuationViaAppServer, renderCodexGoalBlockedNotice, renderCodexGoalObjective, resolveActiveCodexThreadId } from "./codex-goal-host.mjs";
const D = "a".repeat(64);
const input = { threadId: "thread-1", action: "set", subject: { featureId: "nova", phase: "implementation", packageId: "b0", actionId: "implement" }, generation: 2, objective: { conditionSha256: D } };
let passed = 0;
function check(name, fn) { return Promise.resolve(fn()).then(() => { passed += 1; process.stdout.write(`ok ${passed} - ${name}\n`); }); }
const objective = renderCodexGoalObjective(input);
function continuity() {
  return { schema: "pipeline.continuity.v0", featureId: "nova-b", revision: 3, runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator", sessionCleanup: null }, authority: { prd: { path: "specs/prd.md", sha256: D }, plan: { path: "specs/plan.md", sha256: D }, spec: { path: "specs/spec.md", sha256: D }, result: { path: "specs/result.md", sha256: D } }, queueHead: { packageId: "b0", actionId: "implement", nextAction: "verify", productRetryCount: 0, environmentRerouteCount: 0, dispatch: null }, blocker: null, acknowledgedFinal: null, resume: { mode: "immediate", sourceRevision: 3, reasonCode: "active-turn" }, recovery: null, decisionTxn: null, closeTransition: null, capacity: { concurrencyLimit: 3, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" } };
}
await check("set performs a mandatory matching get readback", async () => {
  const calls = []; let getCount = 0;
  const result = await reconcileCodexGoal(input, { request: async (method, params) => { calls.push([method, params]); if (method === "thread/goal/set") return { goal: {} }; getCount += 1; return { goal: getCount === 1 ? null : { threadId: "thread-1", objective, status: "active" } }; } });
  assert.equal(result.ok, true); assert.deepEqual(calls.map(([method]) => method), ["thread/goal/get", "thread/goal/set", "thread/goal/get"]);
  assert.match(result.readback.observedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
});
await check("matching active goal is read back without a duplicate set", async () => {
  const calls = [];
  const result = await reconcileCodexGoal(input, { request: async (method) => { calls.push(method); return { goal: { threadId: "thread-1", objective, status: "active" } }; } });
  assert.equal(result.ok, true); assert.deepEqual(calls, ["thread/goal/get", "thread/goal/get"]);
});
await check("blocked native goal stops automation and gives an explicit CLI-resume notice", async () => {
  const calls = [];
  const result = await reconcileCodexGoal(input, { request: async (method) => {
    calls.push(method);
    return { goal: { threadId: "thread-1", objective, status: "blocked" } };
  } });
  assert.deepEqual(calls, ["thread/goal/get"]);
  assert.equal(result.ok, false);
  assert.equal(result.code, "CGH-BLOCKED-RESUME-REQUIRED");
  assert.equal(result.status, "blocked");
  assert.match(result.notice, /automated Pipeline work is stopped/u);
  assert.match(result.notice, /If the same blocker is resolved, resume/u);
  assert.match(result.notice, /\/goal <new objective>/u);
  assert.equal(renderCodexGoalBlockedNotice({ threadId: "thread-1", objective, status: "blocked" }), result.notice);
});
await check("a blocked goal with another objective cannot impersonate the requested generation", async () => {
  const calls = [];
  const result = await reconcileCodexGoal(input, { request: async (method) => {
    calls.push(method);
    return { goal: { threadId: "thread-1", objective: "Pipeline continuation: feature=other", status: "blocked" } };
  } });
  assert.deepEqual(calls, ["thread/goal/get"]);
  assert.deepEqual(result, { ok: false, code: "CGH-BLOCKED-IDENTITY-MISMATCH", status: "unavailable", readback: null });
});
await check("a stale active Pipeline goal cannot impersonate the current continuation", async () => {
  const calls = [];
  const oldObjective = "Pipeline continuation: feature=nova; phase=implementation; package=b0; action=implement; generation=1; condition=old.";
  const result = await reconcileCodexGoal(input, { request: async (method) => {
    calls.push(method);
    return { goal: { threadId: "thread-1", objective: oldObjective, status: "active" } };
  } });
  assert.deepEqual(calls, ["thread/goal/get"]);
  assert.deepEqual(result, { ok: false, code: "CGH-ACTIVE-IDENTITY-MISMATCH", status: "unavailable", readback: null });
});
await check("an active user-controlled goal is never overwritten by Pipeline activation", async () => {
  const calls = [];
  const result = await reconcileCodexGoal(input, { request: async (method) => {
    calls.push(method);
    return { goal: { threadId: "thread-1", objective: "User objective", status: "active" } };
  } });
  assert.deepEqual(calls, ["thread/goal/get"]);
  assert.deepEqual(result, { ok: false, code: "CGH-ACTIVE-IDENTITY-MISMATCH", status: "unavailable", readback: null });
});
await check("wrong readback never claims protected continuation", async () => {
  let getCount = 0;
  const result = await reconcileCodexGoal(input, { request: async (method) => {
    if (method === "thread/goal/set") return { goal: {} };
    getCount += 1;
    return { goal: getCount === 1 ? null : { threadId: "thread-1", objective: "wrong", status: "active" } };
  } });
  assert.deepEqual(result, { ok: false, code: "CGH-READBACK", status: "unavailable", readback: null });
});
await check("clear requires a null goal readback", async () => {
  const result = await reconcileCodexGoal({ ...input, action: "clear" }, { request: async (method) => method === "thread/goal/clear" ? { cleared: true } : { goal: null } });
  assert.equal(result.status, "cleared");
});
await check("continuity host binding uses only the supplied current thread client", async () => {
  let goal = null;
  const result = await reconcileCodexNativeContinuation({ continuity: continuity(), activeFeature: { id: "nova-b", phase: "implementation" }, continuationId: "nova-b0", runner: { runnerId: "codex", adapterVersion: "v2", capability: "available" }, event: { kind: "activate", atRevision: 3 } }, { threadId: "thread-1", request: async (method, params) => {
    if (method === "thread/goal/get") return { goal };
    if (method === "thread/goal/set") { goal = { threadId: params.threadId, objective: params.objective, status: "active" }; return { goal }; }
    throw new Error("unexpected method");
  } });
  assert.equal(result.ok, true); assert.equal(result.next.nativeContinuation.status, "active");
});
await check("app-server resolution accepts exactly one active thread in the current project", async () => {
  const result = await resolveActiveCodexThreadId({ rootDir: "/repo", request: async (method, params) => {
    assert.equal(method, "thread/list");
    assert.deepEqual(params, { cwd: "/repo", archived: false, limit: 32, sortDirection: "desc", useStateDbOnly: true });
    return { data: [{ id: "thread-1", cwd: "/repo", status: { type: "active" } }, { id: "thread-2", cwd: "/other", status: { type: "active" } }] };
  } });
  assert.deepEqual(result, { ok: true, code: "CGH-THREAD-RESOLVED", threadId: "thread-1" });
});
await check("app-server resolution rejects ambiguous active project threads", async () => {
  const result = await resolveActiveCodexThreadId({ rootDir: "/repo", request: async () => ({ data: [{ id: "thread-1", cwd: "/repo", status: { type: "active" } }, { id: "thread-2", cwd: "/repo", status: { type: "active" } }] }) });
  assert.deepEqual(result, { ok: false, code: "CGH-THREAD-AMBIGUOUS", threadId: null });
});
await check("app-server bridge never overwrites the resolved active user goal", async () => {
  const calls = []; let closed = false;
  const result = await reconcileCodexNativeContinuationViaAppServer({ continuity: continuity(), activeFeature: { id: "nova-b", phase: "implementation" }, continuationId: "nova-b0", runner: { runnerId: "codex", adapterVersion: "v2", capability: "available" }, event: { kind: "activate", atRevision: 3 } }, {
    rootDir: "/repo", socketPath: "/private.sock", openClient: async () => ({
      request: async (method) => { calls.push(method); if (method === "thread/list") return { data: [{ id: "thread-1", cwd: "/repo", status: { type: "active" } }] }; if (method === "thread/goal/get") return { goal: { threadId: "thread-1", objective: "User objective", status: "active" } }; throw new Error("unexpected method"); },
      close: () => { closed = true; },
    }),
  });
  assert.equal(result.ok, true); assert.equal(result.code, "RNC-SET"); assert.equal(result.continuation.status, "unavailable");
  assert.deepEqual(calls, ["thread/list", "thread/goal/get"]); assert.equal(closed, true);
});
await check("private Unix WebSocket client initializes then makes bounded app-server calls", async () => {
  let received = Buffer.alloc(0); const methods = [];
  const frame = (value) => { const body = Buffer.from(JSON.stringify(value)); return Buffer.concat([Buffer.from([0x81, body.length]), body]); };
  class Socket extends EventEmitter {
    write(value) {
      if (typeof value === "string") {
        const key = /^sec-websocket-key:\s*([^\r\n]+)\s*$/imu.exec(value)?.[1]; assert.ok(key);
        queueMicrotask(() => this.emit("data", Buffer.from(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64")}\r\n\r\n`)));
        return true;
      }
      received = Buffer.concat([received, value]);
      while (received.length >= 2) {
        let size = received[1] & 0x7f; let offset = 2; if (size === 126) { if (received.length < 4) return true; size = received.readUInt16BE(2); offset = 4; } else if (size === 127) throw new Error("unexpected large test frame");
        const header = offset + 4; if (received.length < header + size) return true;
        const mask = received.subarray(offset, header); const body = Buffer.alloc(size); for (let index = 0; index < size; index += 1) body[index] = received[header + index] ^ mask[index % 4]; received = received.subarray(header + size);
        const message = JSON.parse(body.toString("utf8")); if (!message.id) continue; methods.push(message.method);
        queueMicrotask(() => this.emit("data", frame({ id: message.id, result: message.method === "thread/list" ? { data: [] } : { userAgent: "test" } })));
      }
      return true;
    }
    destroy() { queueMicrotask(() => this.emit("close")); }
  }
  const socket = new Socket(); queueMicrotask(() => socket.emit("connect"));
  const client = await openCodexAppServerUnixClient({ socketPath: "/private.sock", timeoutMs: 1_000, connect: () => socket, assertSocket: () => {} });
  assert.deepEqual(await client.request("thread/list", { cwd: "/repo" }), { data: [] }); client.close();
  assert.deepEqual(methods, ["initialize", "thread/list"]);
});
process.stdout.write(`1..${passed}\n`);
