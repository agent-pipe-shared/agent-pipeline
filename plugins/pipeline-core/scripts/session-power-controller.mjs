#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Linux-only owner of HAW-B's fixed inhibitor child and authenticated endpoint.
 *
 * It receives its complete startup configuration on inherited FD 3.  Nothing
 * mutable is accepted through argv or environment.  The starter alone writes
 * starting/active/stopped records; after commit this controller may only make
 * the restricted heartbeat CAS and otherwise exits on any mismatch.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, lstatSync, unlinkSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import net, { Socket } from "node:net";
import { pathToFileURL } from "node:url";

import {
  SESSION_POWER_HEARTBEAT_SECONDS,
  SESSION_POWER_LEASE_SECONDS,
  SessionPowerError,
  fixedAdapterLaunch,
  heartbeatSessionPowerRecord,
  readLinuxProcessIdentity,
  readSessionPowerRecord,
  withSessionPowerLock,
  writeSessionPowerRecord,
} from "../lib/session-power.mjs";

const CONFIG_SCHEMA = "pipeline.session-power-controller-config.v1";
const ACK_SCHEMA = "pipeline.session-power-controller-ack.v1";
const HEX = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/u;
const MAX_FRAME_BYTES = 16_384;

function fail(message) { throw new SessionPowerError("SP-CONTROLLER", message); }
function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value, keys) { return isObject(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function absolute(path) { return typeof path === "string" && isAbsolute(path) && resolve(path) === path && !path.includes("\0"); }
function safePid(value) { return Number.isSafeInteger(value) && value >= 1; }
function sha(value) { return createHash("sha256").update(value).digest("hex"); }

export function validateControllerConfig(value) {
  const top = ["schema", "activationNonce", "controller", "context", "nodePath", "helperPath", "controlPath", "leaseSeconds"];
  const contextKeys = ["repoFingerprint", "sessionId", "descriptorSha256", "directory", "recordPath", "lockPath", "controlPath"];
  if (!exactKeys(value, top) || value.schema !== CONFIG_SCHEMA || !HEX.test(value.activationNonce ?? "")
    || !exactKeys(value.controller, ["pid", "start", "executableSha256"])
    || !exactKeys(value.context, contextKeys)
    || !safePid(value.controller.pid) || typeof value.controller.start !== "string" || !HEX.test(value.controller.executableSha256 ?? "")
    || !HEX.test(value.context.repoFingerprint ?? "") || !SAFE_ID.test(value.context.sessionId ?? "") || !HEX.test(value.context.descriptorSha256 ?? "")
    || ![value.context.directory, value.context.recordPath, value.context.lockPath, value.context.controlPath, value.nodePath, value.helperPath, value.controlPath].every(absolute)
    || value.context.controlPath !== value.controlPath || value.leaseSeconds !== SESSION_POWER_LEASE_SECONDS) {
    fail("controller configuration is invalid");
  }
  return structuredClone(value);
}

function assertRegular(path, label) {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink()) fail(`${label} is not a regular file`);
}

export function startupAcknowledgement(config, child, { identityForPid = readLinuxProcessIdentity, now = new Date() } = {}) {
  const controllerIdentity = identityForPid(config.controller.pid);
  const childIdentity = identityForPid(child.pid);
  if (controllerIdentity.platform !== "linux" || controllerIdentity.start !== config.controller.start
    || controllerIdentity.executableSha256 !== config.controller.executableSha256 || childIdentity.platform !== "linux") {
    fail("controller or child identity changed before acknowledgement");
  }
  const handleId = sha(`${config.activationNonce}:${config.controller.pid}:${config.controller.start}:${child.pid}:${childIdentity.start}:${randomBytes(16).toString("hex")}`);
  return {
    schema: ACK_SCHEMA,
    type: "startup-ack",
    activationNonce: config.activationNonce,
    adapterId: "linux-systemd-inhibit-v1",
    platform: "linux",
    hostBootId: controllerIdentity.hostBootId,
    controllerPid: config.controller.pid,
    controllerStart: controllerIdentity.start,
    controllerExecutableSha256: controllerIdentity.executableSha256,
    childPid: child.pid,
    childStart: childIdentity.start,
    childExecutableSha256: childIdentity.executableSha256,
    handleId,
    startedAt: new Date(now).toISOString(),
  };
}

export function validateStartupAcknowledgement(value, config) {
  const keys = ["schema", "type", "activationNonce", "adapterId", "platform", "hostBootId", "controllerPid", "controllerStart", "controllerExecutableSha256", "childPid", "childStart", "childExecutableSha256", "handleId", "startedAt"];
  if (!exactKeys(value, keys) || value.schema !== ACK_SCHEMA || value.type !== "startup-ack"
    || value.activationNonce !== config.activationNonce || value.adapterId !== "linux-systemd-inhibit-v1" || value.platform !== "linux"
    || value.controllerPid !== config.controller.pid || value.controllerStart !== config.controller.start
    || value.controllerExecutableSha256 !== config.controller.executableSha256
    || !safePid(value.childPid) || typeof value.childStart !== "string" || !HEX.test(value.childExecutableSha256 ?? "")
    || !HEX.test(value.handleId ?? "") || typeof value.hostBootId !== "string" || !/^\d{4}-\d{2}-\d{2}T/u.test(value.startedAt ?? "")) fail("startup acknowledgement is invalid");
  return structuredClone(value);
}

export function writeFrame(stream, value) {
  const bytes = JSON.stringify(value);
  if (Buffer.byteLength(bytes, "utf8") > MAX_FRAME_BYTES) fail("private frame exceeds bound");
  stream.write(`${bytes}\n`);
}

export function readFrame(stream, { timeoutMs = 5_000 } = {}) {
  return new Promise((resolveFrame, reject) => {
    let bytes = "";
    const timer = setTimeout(() => done(new SessionPowerError("SP-CONTROLLER", "private pipe timed out")), timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      stream.off("data", onData); stream.off("error", onError); stream.off("end", onEnd); stream.off("close", onClose);
    }
    function done(error, value) { cleanup(); if (error) reject(error); else resolveFrame(value); }
    function onData(chunk) {
      bytes += chunk.toString("utf8");
      if (Buffer.byteLength(bytes, "utf8") > MAX_FRAME_BYTES || (bytes.match(/\n/gu) ?? []).length > 1) return done(new SessionPowerError("SP-CONTROLLER", "private frame is malformed"));
      if (!bytes.endsWith("\n")) return;
      try { done(null, JSON.parse(bytes.slice(0, -1))); } catch { done(new SessionPowerError("SP-CONTROLLER", "private frame is not JSON")); }
    }
    function onError() { done(new SessionPowerError("SP-CONTROLLER", "private pipe failed")); }
    function onEnd() { done(new SessionPowerError("SP-CONTROLLER", "private pipe closed before commit")); }
    function onClose() { done(new SessionPowerError("SP-CONTROLLER", "private pipe closed before commit")); }
    stream.on("data", onData); stream.once("error", onError); stream.once("end", onEnd); stream.once("close", onClose);
  });
}

function exactProof(ack) {
  return Object.fromEntries(["activationNonce", "controllerPid", "controllerStart", "controllerExecutableSha256", "childPid", "childStart", "childExecutableSha256", "handleId"].map((key) => [key, ack[key]]));
}
function equalProof(left, right) {
  return isObject(left) && Object.entries(exactProof(right)).every(([key, value]) => left[key] === value);
}

async function listenEndpoint(path, handler) {
  if (existsSync(path)) fail("control endpoint already exists");
  const server = net.createServer((socket) => {
    readFrame(socket, { timeoutMs: 2_000 }).then((request) => handler(request, socket)).catch(() => socket.destroy());
  });
  await new Promise((resolveListen, reject) => { server.once("error", reject); server.listen(path, resolveListen); });
  try { chmodSync(path, 0o600); } catch { await new Promise((resolveClose) => server.close(resolveClose)); fail("control endpoint mode could not be set"); }
  return server;
}

/** Starts the child only after every fixed Linux identity/argv check has passed. */
export async function runController(configInput, pipe, deps = {}) {
  const config = validateControllerConfig(configInput);
  const identityForPid = deps.identityForPid ?? readLinuxProcessIdentity;
  const spawnChild = deps.spawnChild ?? spawn;
  const clock = deps.now ?? (() => new Date());
  if (process.platform !== "linux") fail("controller platform is unavailable");
  const self = identityForPid(process.pid);
  if (self.start !== config.controller.start || self.executableSha256 !== config.controller.executableSha256) fail("controller self identity mismatch");
  assertRegular("/usr/bin/systemd-inhibit", "systemd-inhibit");
  assertRegular(config.helperPath, "session-power helper");
  const launch = fixedAdapterLaunch({ platform: "linux", nodePath: config.nodePath, helperPath: config.helperPath, controllerPid: process.pid, controllerStart: self.start });
  const child = spawnChild(launch.command, launch.args, { shell: false, detached: false, stdio: "ignore", windowsHide: true });
  if (!child?.pid || !safePid(child.pid)) fail("fixed adapter child did not start");
  const ack = startupAcknowledgement(config, child, { identityForPid, now: clock() });
  let committed = false;
  let stopping = false;
  let heartbeatTimer = null;
  let leaseTimer = null;
  let server = null;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (leaseTimer) clearTimeout(leaseTimer);
    if (server) await new Promise((resolveClose) => server.close(resolveClose));
    try { if (existsSync(config.controlPath)) unlinkSync(config.controlPath); } catch { /* controller owns only its endpoint */ }
    try { child.kill("SIGTERM"); } catch { /* owned child may have already exited */ }
    pipe.destroy();
  };
  server = await listenEndpoint(config.controlPath, async (request, socket) => {
    if (!isObject(request) || request.activationNonce !== ack.activationNonce) return socket.destroy();
    if (request.type === "proof") {
      writeFrame(socket, { schema: ACK_SCHEMA, type: "proof", committed, ...exactProof(ack) });
      socket.end();
      return;
    }
    if (request.type === "stop" && committed && equalProof(request, ack)) {
      writeFrame(socket, { schema: ACK_SCHEMA, type: "stopped", ...exactProof(ack) });
      socket.end();
      await shutdown();
      return;
    }
    socket.destroy();
  });
  child.once("exit", () => { if (!stopping) void shutdown(); });
  writeFrame(pipe, ack);
  let commit;
  try { commit = await readFrame(pipe, { timeoutMs: 5_000 }); } catch (error) { await shutdown(); throw error; }
  if (!isObject(commit) || commit.type !== "commit" || commit.activationNonce !== ack.activationNonce || !equalProof(commit, ack)) {
    await shutdown();
    fail("commit acknowledgement is invalid");
  }
  committed = true;
  writeFrame(pipe, { schema: ACK_SCHEMA, type: "committed-ack", ...exactProof(ack) });
  heartbeatTimer = setInterval(() => {
    try {
      withSessionPowerLock(config.context, () => {
        const current = readSessionPowerRecord(config.context);
        if (!current || current.status !== "active" || !equalProof(current, ack)) fail("heartbeat tuple mismatch");
        writeSessionPowerRecord(config.context, heartbeatSessionPowerRecord(current, { expectedRevision: current.revision, now: clock() }));
      });
    } catch { void shutdown(); }
  }, SESSION_POWER_HEARTBEAT_SECONDS * 1_000);
  leaseTimer = setTimeout(() => { void shutdown(); }, SESSION_POWER_LEASE_SECONDS * 1_000);
  return { ack, shutdown };
}

async function direct() {
  const pipe = new Socket({ fd: 3, readable: true, writable: true, allowHalfOpen: true });
  const config = validateControllerConfig(await readFrame(pipe));
  await runController(config, pipe);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  direct().catch(() => { process.exitCode = 3; });
}
