#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

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
import { fileURLToPath } from "node:url";

import { parseYaml } from "../lib/yaml-lite.mjs";
import { resolveAuthorityArtifactPath } from "../lib/project-authority.mjs";
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
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { authorityRepositoryFromRoot } from "../lib/session-authority-domain-owner.mjs";
import { inspectSourceOwnedCurrentAuthorityContext, spawnSessionPowerControllerChild, readSourceOwnedSessionPowerControllerStartupAcknowledgement } from "../lib/session-requester-bridge.mjs";

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
  const { path } = resolveAuthorityArtifactPath("manifest", { rootDir });
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
  if (!deps || typeof deps !== "object" || Object.keys(deps).length !== 0) throw new SessionPowerError("SP-START", "controller runtime overrides are unavailable");
  const repository = authorityRepositoryFromRoot(context.repo.primaryRoot);
  const requester = inspectSourceOwnedCurrentAuthorityContext({ repository });
  if (requester.status !== "bound" || requester.currentInvocationHandle === null
    || requester.currentRequester.sessionId !== context.sessionId || requester.currentRequester.descriptorSha256 !== context.descriptorSha256) {
    throw new SessionPowerError("SP-START", "source-owned parent requester is unavailable");
  }
  assertFixedStarterFile(process.execPath, "Node executable");
  assertFixedStarterFile(CONTROLLER_PATH, "controller");
  assertFixedStarterFile(HELPER_PATH, "helper");
  const spawned = await spawnSessionPowerControllerChild({ repository, requesterHandle: requester.requesterHandle }, requester.runtimePort);
  if (spawned.status !== "spawned" || !spawned.child?.stdio?.[3]) throw new SessionPowerError("SP-START", "source-owned Power child is unavailable");
  const child = spawned.child, controller = readLinuxProcessIdentity(child.pid);
  const config = {
    schema: "pipeline.session-power-controller-config.v2",
    activationNonce: nonce(),
    controller: { pid: child.pid, start: controller.start, executableSha256: controller.executableSha256 },
    context: { repoRoot: context.repo.primaryRoot, repoFingerprint: context.repoFingerprint, sessionId: context.sessionId, descriptorSha256: context.descriptorSha256,
      directory: context.directory, recordPath: context.recordPath, lockPath: context.lockPath, controlPath: context.controlPath },
    nodePath: process.execPath, helperPath: HELPER_PATH, controlPath: context.controlPath, leaseSeconds: 43_200,
  };
  let startupRefused = false;
  try {
    writeFrame(child.stdio[3], config);
    const startup = await readSourceOwnedSessionPowerControllerStartupAcknowledgement({ repository, controllerIdentity: config.controller }, requester.runtimePort);
    if (startup?.status === "unavailable") {
      startupRefused = true;
      throw new SessionPowerError("SP-START", "source-owned startup acknowledgement is unavailable");
    }
    const ack = validateStartupAcknowledgement(startup, config);
    const starting = readSessionPowerRecord(context);
    if (!starting || starting.status !== "starting" || Object.entries(endpointProof(ack)).some(([key, value]) => starting[key] !== value)) {
      throw new SessionPowerError("SP-START", "controller-owned starting record is unavailable");
    }
    writeFrame(child.stdio[3], { type: "commit", ...endpointProof(ack) });
    const committed = await readFrame(child.stdio[3], { timeoutMs: 5_000 });
    if (!committed || committed.type !== "committed-ack" || Object.entries(endpointProof(ack)).some(([key, value]) => committed[key] !== value)) {
      throw new SessionPowerError("SP-START", "controller commit acknowledgement is invalid");
    }
    const active = readSessionPowerRecord(context);
    if (!active || active.status !== "active" || Object.entries(endpointProof(ack)).some(([key, value]) => active[key] !== value)) {
      throw new SessionPowerError("SP-START", "controller-owned active record is unavailable");
    }
    child.stdio[3].destroy();
    child.stdout?.resume(); child.stderr?.resume(); child.unref();
    return active;
  } catch (error) {
    if (startupRefused) {
      // Startup remains refused at the original ACK deadline. Allow only the
      // already captured owner to finish its genuine failure settlement.
      // Child close is not a record, member-release or native-success proof.
      let settlementTimer;
      try {
        await Promise.race([spawned.terminal, new Promise((resolveSettlement) => {
          settlementTimer = setTimeout(resolveSettlement, 10_000);
        })]);
      } catch {
        // Unknown settlement preserves the original startup refusal.
      } finally { clearTimeout(settlementTimer); }
    }
    child.stdio[3].destroy();
    // The original controller retains every uncertain partial effect. The
    // starter must not turn a failed handshake into a guessed zero record.
    throw error;
  }
}

async function requestOwnedTransition(context, current, type) {
  if (!current || current.activationNonce === null) return current;
  if (type === "disable") {
    assertPrivateSocket(context.controlPath);
    const socket = net.createConnection(context.controlPath);
    try {
      await new Promise((resolveConnect, reject) => { socket.once("connect", resolveConnect); socket.once("error", reject); });
      writeFrame(socket, { type, ...endpointProof(current) });
      await new Promise((resolveEnd, reject) => { const timer = setTimeout(() => reject(new SessionPowerError("SP-ENDPOINT", "owning disable timed out")), 2_000);
        socket.once("end", () => { clearTimeout(timer); resolveEnd(); }); socket.once("error", error => { clearTimeout(timer); reject(error); }); });
    } finally { socket.destroy(); }
    // An early EOF is not a terminal proof; read the actual no-context record.
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline) {
      const observed = readSessionPowerRecord(context);
      if (observed && ["disabled", "unavailable"].includes(observed.status) && !existsSync(context.controlPath)) return observed;
      await new Promise(resolveWait => setTimeout(resolveWait, 10));
    }
    throw new SessionPowerError("SP-ENDPOINT", "owning no-context terminal is unavailable");
  }
  const response = await controllerEndpointRequest(context.controlPath, { type, ...endpointProof(current) });
  if (!response || response.type !== (type === "stop" ? "stopped" : "recovered") || Object.entries(endpointProof(current)).some(([key, value]) => response[key] !== value)) {
    throw new SessionPowerError("SP-ENDPOINT", "owning controller transition proof is unavailable");
  }
  return readSessionPowerRecord(context);
}

export async function main(argv = process.argv.slice(2), { rootDir = process.cwd(), now = new Date() } = {}) {
  const { operation, flags } = parseArgs(argv);
  const context = resolveSessionPowerContext(rootDir, flags["session-id"], flags["expected-descriptor-sha256"]);
  const current = readSessionPowerRecord(context);
  let record = current ?? initial(context, now);
  if (operation === "start") {
    if (!projectedKeepAwake(context.repo.primaryRoot)) {
      if (current && !["disabled", "unavailable"].includes(current.status)) record = await requestOwnedTransition(context, current, "disable");
    } else if (current?.status === "cleanup-pending") {
      record = current;
    } else if (current && ["starting", "active"].includes(current.status)) {
      record = await requestOwnedTransition(context, current, "recover");
    } else if (process.platform !== "linux") {
      record = createUnavailableSessionPowerRecord(context, "platform-unsupported", { observed: { platform: process.platform }, now });
    } else {
      if (current?.status === "stopped") await requestOwnedTransition(context, current, "disable");
      try { record = await launchLinuxController(context); }
      catch (error) { const observed = readSessionPowerRecord(context); if (observed?.status === "unavailable") record = observed; else throw error; }
    }
  } else if (operation !== "status" && current && !["disabled", "unavailable"].includes(current.status)) {
    record = await requestOwnedTransition(context, current, operation);
  }
  process.stdout.write(`${JSON.stringify(sessionPowerCommandResult(operation, record))}\n`);
  return resultExit(record);
}

const direct = isDirectInvocation(import.meta.url);
if (direct) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    process.stderr.write(`${error instanceof SessionPowerError ? error.code : "SP-ARGUMENT"}: ${error.message}\n`);
    process.exitCode = 2;
  });
}
