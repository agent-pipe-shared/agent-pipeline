#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Sanitised HAW-B command boundary.
 *
 * The durable-record slice deliberately starts no host-power child until the
 * controller handshake slice is present.  A configured request therefore
 * receives the explicit `startup-failed` unavailable state, never a guessed
 * success or an untracked child.  `status` remains useful today and all four
 * operation spellings/output/exit contracts are frozen here for that next
 * slice.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import net from "node:net";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parseYaml } from "../lib/yaml-lite.mjs";
import {
  SessionPowerError,
  activateSessionPowerRecord,
  createDisabledSessionPowerRecord,
  createUnavailableSessionPowerRecord,
  createStartingSessionPowerRecord,
  readLinuxProcessIdentity,
  readSessionPowerRecord,
  recoverSessionPowerRecord,
  resolveSessionPowerContext,
  sessionPowerCommandResult,
  stopSessionPowerRecord,
  withSessionPowerLock,
  writeSessionPowerRecord,
} from "../lib/session-power.mjs";
import {
  readFrame,
  validateStartupAcknowledgement,
  writeFrame,
} from "./session-power-controller.mjs";

const USAGE = "Usage: session-power.mjs <start|status|recover|stop> --session-id <id> --expected-descriptor-sha256 <sha256>";
const OPERATIONS = new Set(["start", "status", "recover", "stop"]);
const HERE = dirname(fileURLToPath(import.meta.url));
const CONTROLLER_PATH = join(HERE, "session-power-controller.mjs");
const HELPER_PATH = join(HERE, "session-power-helper.mjs");

function parseArgs(argv) {
  const [operation, ...rest] = argv;
  if (!OPERATIONS.has(operation) || rest.length !== 4) throw new SessionPowerError("SP-ARGUMENT", USAGE);
  const flags = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) throw new SessionPowerError("SP-ARGUMENT", USAGE);
    const name = key.slice(2);
    if (!new Set(["session-id", "expected-descriptor-sha256"]).has(name) || Object.hasOwn(flags, name)) {
      throw new SessionPowerError("SP-ARGUMENT", USAGE);
    }
    flags[name] = value;
  }
  if (!flags["session-id"] || !flags["expected-descriptor-sha256"]) throw new SessionPowerError("SP-ARGUMENT", USAGE);
  return { operation, flags };
}

/** A closed projection reader: missing/unknown is disabled, never enabled. */
export function projectedKeepAwake(rootDir) {
  const path = join(rootDir, ".claude", "pipeline.yaml");
  if (!existsSync(path)) return false;
  try {
    const manifest = parseYaml(readFileSync(path, "utf8"));
    return manifest?.session?.keep_awake === true;
  } catch {
    return false;
  }
}

function resultExit(record) {
  if (record.status === "cleanup-pending" || record.status === "unavailable") return 3;
  return 0;
}

function initial(context, now) {
  return createDisabledSessionPowerRecord({
    repoFingerprint: context.repoFingerprint,
    sessionId: context.sessionId,
    descriptorSha256: context.descriptorSha256,
  }, now);
}

function tupleFromAck(ack) {
  return Object.fromEntries(["activationNonce", "adapterId", "platform", "hostBootId", "controllerPid", "controllerStart", "controllerExecutableSha256", "childPid", "childStart", "childExecutableSha256", "handleId", "startedAt"].map((key) => [key, ack[key]]));
}
function endpointProof(record) {
  return Object.fromEntries(["activationNonce", "controllerPid", "controllerStart", "controllerExecutableSha256", "childPid", "childStart", "childExecutableSha256", "handleId"].map((key) => [key, record[key]]));
}
function nonce() { return randomBytes(32).toString("hex"); }

function assertPrivateSocket(path) {
  const info = lstatSync(path);
  if (info.isSymbolicLink() || !info.isSocket() || (info.mode & 0o077) !== 0) throw new SessionPowerError("SP-ENDPOINT", "controller endpoint is not a private socket");
}

export async function controllerEndpointRequest(path, request) {
  assertPrivateSocket(path);
  const socket = net.createConnection(path);
  try {
    await new Promise((resolveConnect, reject) => { socket.once("connect", resolveConnect); socket.once("error", reject); });
    writeFrame(socket, request);
    return await readFrame(socket, { timeoutMs: 2_000 });
  } finally {
    socket.destroy();
  }
}

/**
 * Reconcile a disabled V3 projection without broad process authority.  A
 * previously enabled session may have an exact controller record; disabling
 * the projection must drain that one record rather than silently leaving the
 * inhibitor active.  Starting records first need the controller's committed
 * proof before they can use the same endpoint-gated stop transition.
 */
export async function disableProjectedSessionPower(current, context, {
  now = new Date(),
  endpointRequest = controllerEndpointRequest,
} = {}) {
  if (!current || !new Set(["starting", "active"]).has(current.status)) return current;

  let proof = null;
  try {
    proof = await endpointRequest(context.controlPath, { type: "proof", activationNonce: current.activationNonce });
    if (proof?.type !== "proof" || proof.committed !== true) proof = null;
  } catch { proof = null; }
  const reconciled = recoverSessionPowerRecord(current, { now, endpointProof: proof });
  if (reconciled.status !== "active") return reconciled;

  let stopProof = null;
  try {
    stopProof = await endpointRequest(context.controlPath, { type: "stop", ...endpointProof(reconciled) });
    if (stopProof?.type !== "stopped") stopProof = null;
  } catch { stopProof = null; }
  return stopSessionPowerRecord(reconciled, { now, endpointProof: stopProof });
}

function assertFixedStarterFile(path, label) {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new SessionPowerError("SP-START", `${label} is not a regular shipped file`);
}

/**
 * Starts only the shipped Linux controller with a private inherited pipe.
 * The public CLI does not accept executable, argv, environment, or pipe-name
 * overrides; `deps` is test-only dependency injection.
 */
export async function launchLinuxController(context, { now = new Date(), deps = {} } = {}) {
  const spawnController = deps.spawnController ?? spawn;
  const identityForPid = deps.identityForPid ?? readLinuxProcessIdentity;
  const controllerPath = deps.controllerPath ?? CONTROLLER_PATH;
  const helperPath = deps.helperPath ?? HELPER_PATH;
  const nodePath = deps.nodePath ?? process.execPath;
  assertFixedStarterFile(nodePath, "Node executable");
  assertFixedStarterFile(controllerPath, "controller");
  assertFixedStarterFile(helperPath, "helper");
  const child = spawnController(nodePath, [controllerPath], {
    shell: false,
    detached: true,
    stdio: ["ignore", "ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  if (!child?.pid || !child.stdio?.[3]) throw new SessionPowerError("SP-START", "controller did not expose its private pipe");
  const controller = identityForPid(child.pid);
  if (controller.platform !== "linux") throw new SessionPowerError("SP-START", "controller platform identity is not Linux");
  const config = {
    schema: "pipeline.session-power-controller-config.v1",
    activationNonce: nonce(),
    controller: { pid: child.pid, start: controller.start, executableSha256: controller.executableSha256 },
    context: {
      repoFingerprint: context.repoFingerprint,
      sessionId: context.sessionId,
      descriptorSha256: context.descriptorSha256,
      directory: context.directory,
      recordPath: context.recordPath,
      lockPath: context.lockPath,
      controlPath: context.controlPath,
    },
    nodePath,
    helperPath,
    controlPath: context.controlPath,
    leaseSeconds: 43_200,
  };
  try {
    writeFrame(child.stdio[3], config);
    const ack = validateStartupAcknowledgement(await readFrame(child.stdio[3], { timeoutMs: 5_000 }), config);
    const starting = createStartingSessionPowerRecord({
      repoFingerprint: context.repoFingerprint,
      sessionId: context.sessionId,
      descriptorSha256: context.descriptorSha256,
    }, tupleFromAck(ack), now);
    writeSessionPowerRecord(context, starting);
    writeFrame(child.stdio[3], { type: "commit", activationNonce: ack.activationNonce, ...endpointProof(starting) });
    const committed = await readFrame(child.stdio[3], { timeoutMs: 5_000 });
    if (!committed || committed.type !== "committed-ack" || Object.entries(endpointProof(starting)).some(([key, value]) => committed[key] !== value)) {
      throw new SessionPowerError("SP-START", "controller commit acknowledgement is invalid");
    }
    const active = activateSessionPowerRecord(starting, { expectedRevision: starting.revision, now });
    writeSessionPowerRecord(context, active);
    child.unref?.();
    return active;
  } catch (error) {
    child.stdio[3].destroy?.();
    throw error;
  }
}

export async function main(argv = process.argv.slice(2), { rootDir = process.cwd(), now = new Date() } = {}) {
  const { operation, flags } = parseArgs(argv);
  const context = resolveSessionPowerContext(rootDir, flags["session-id"], flags["expected-descriptor-sha256"]);
  const record = await withSessionPowerLock(context, async () => {
    const current = readSessionPowerRecord(context);
    if (operation === "status") return current ?? initial(context, now);
    if (operation === "start") {
      if (current?.status === "cleanup-pending") return current;
      if (!projectedKeepAwake(context.repo.primaryRoot)) {
        const disabled = await disableProjectedSessionPower(current, context, { now });
        if (disabled && JSON.stringify(disabled) !== JSON.stringify(current)) writeSessionPowerRecord(context, disabled);
        return disabled ?? initial(context, now);
      }
      if (process.platform !== "linux") {
        const unavailable = createUnavailableSessionPowerRecord({
          repoFingerprint: context.repoFingerprint,
          sessionId: context.sessionId,
          descriptorSha256: context.descriptorSha256,
        }, "platform-unsupported", { observed: { platform: process.platform }, now });
        if (current) unavailable.revision = current.revision + 1;
        writeSessionPowerRecord(context, unavailable);
        return unavailable;
      }
      if (current?.status === "active" || current?.status === "starting") {
        let proof = null;
        try {
          proof = await controllerEndpointRequest(context.controlPath, { type: "proof", activationNonce: current.activationNonce });
          if (proof.committed !== true) proof = null;
        } catch { proof = null; }
        const recovered = recoverSessionPowerRecord(current, { now, endpointProof: proof });
        if (JSON.stringify(recovered) !== JSON.stringify(current)) writeSessionPowerRecord(context, recovered);
        return recovered;
      }
      try {
        return await launchLinuxController(context, { now });
      } catch {
        const observed = readSessionPowerRecord(context);
        if (observed?.status === "starting") {
          const pending = recoverSessionPowerRecord(observed, { now, endpointProof: null });
          writeSessionPowerRecord(context, pending);
          return pending;
        }
        const unavailable = createUnavailableSessionPowerRecord({
          repoFingerprint: context.repoFingerprint,
          sessionId: context.sessionId,
          descriptorSha256: context.descriptorSha256,
        }, "startup-failed", { observed: { platform: "linux" }, now });
        if (current) unavailable.revision = current.revision + 1;
        writeSessionPowerRecord(context, unavailable);
        return unavailable;
      }
    }
    if (!current) return initial(context, now);
    let proof = null;
    try {
      proof = await controllerEndpointRequest(context.controlPath, operation === "stop"
        ? { type: "stop", ...endpointProof(current) }
        : { type: "proof", activationNonce: current.activationNonce });
      if (operation === "recover" && proof.committed !== true) proof = null;
    } catch { proof = null; }
    const next = operation === "recover"
      ? recoverSessionPowerRecord(current, { now, endpointProof: proof })
      : stopSessionPowerRecord(current, { now, endpointProof: proof });
    if (JSON.stringify(next) !== JSON.stringify(current)) writeSessionPowerRecord(context, next);
    return next;
  });
  process.stdout.write(`${JSON.stringify(sessionPowerCommandResult(operation, record))}\n`);
  return resultExit(record);
}

const direct = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (direct) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    process.stderr.write(`${error instanceof SessionPowerError ? error.code : "SP-ARGUMENT"}: ${error.message}\n`);
    process.exitCode = 2;
  });
}
