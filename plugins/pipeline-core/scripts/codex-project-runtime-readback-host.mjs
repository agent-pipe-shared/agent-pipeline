#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * The sole runtime-readback producer. Its public CLI intentionally exposes no
 * receipt: receipts travel directly to the in-process lifecycle verifier.
 */
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { StringDecoder } from "node:string_decoder";

import {
  HELPER_PATH, LAUNCHER_PATH, READBACK_SCHEMA, authenticateLaunchTicket,
  canonicalJson, canonicalSha256, consumeRuntimeReadback, resolveRuntimeExecutable,
  sha256,
} from "../lib/codex-onboarding-runtime.mjs";
import {
  loadRuntimeProjectionV3OwnedKeys,
  parseRuntimeProjectionV3TomlRoute,
} from "../lib/runtime-projection-v3.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

export const READBACK_STATUS_SCHEMA = "pipeline.codex-project-runtime-readback-status.v1";
const READBACK_STATUS_CODES = new Set([
  "config-origin-invalid", "config-read-invalid", "executable-identity-mismatch",
  "executable-unavailable", "helper-identity-mismatch", "protocol-invalid",
  "receipt-rejected", "request-invalid", "runtime-readback-unavailable",
  "runtime-target-invalid", "same-generation", "ticket-unavailable",
  "transport-oversize", "transport-timeout", "transport-unavailable",
]);
const MAX_TRANSPORT_BYTES = 4 * 1024 * 1024;
const HOST_TIMEOUT_MS = 30_000;
const REMOTE_CONTROL_STATUSES = new Set(["disabled", "connecting", "connected", "errored"]);
const CONFIG_WARNING_KEYS = new Set(["details", "path", "range", "summary"]);

export class RuntimeReadbackError extends Error {
  constructor(code, message, options = undefined) {
    super(message, options);
    this.name = "RuntimeReadbackError";
    this.code = code;
  }
}

function typed(code, message, cause = undefined) {
  return new RuntimeReadbackError(code, message, cause ? { cause } : undefined);
}
function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value, keys) {
  return plainObject(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}
function validTextPosition(value) {
  return exactKeys(value, ["column", "line"])
    && Number.isSafeInteger(value.column) && value.column >= 0
    && Number.isSafeInteger(value.line) && value.line >= 0;
}
function validTextRange(value) {
  return exactKeys(value, ["end", "start"])
    && validTextPosition(value.start)
    && validTextPosition(value.end);
}
function validConfigWarning(params) {
  if (!plainObject(params)
    || typeof params.summary !== "string"
    || Object.keys(params).some((key) => !CONFIG_WARNING_KEYS.has(key))
    || (Object.hasOwn(params, "details") && !(params.details === null || typeof params.details === "string"))
    || (Object.hasOwn(params, "path") && !(params.path === null || typeof params.path === "string"))
    || (Object.hasOwn(params, "range") && !(params.range === null || validTextRange(params.range)))) {
    return false;
  }
  return true;
}
function physicalFile(path, label) {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink()) throw typed("runtime-target-invalid", `${label} is not a regular non-symlink file`);
  return path;
}
function physicalDirectory(path, label) {
  const info = lstatSync(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw typed("config-origin-invalid", `${label} is not a physical directory`);
  return path;
}
function safeProjectPath(root, projectRelative) {
  const candidate = resolve(root, projectRelative);
  const rel = relative(root, candidate);
  if (rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) throw typed("runtime-target-invalid", "runtime target escaped project root");
  let cursor = root;
  for (const part of projectRelative.split("/")) {
    cursor = resolve(cursor, part);
    if (!existsSync(cursor)) throw typed("runtime-target-invalid", "runtime target is absent");
    const info = lstatSync(cursor);
    if (info.isSymbolicLink() || (cursor !== candidate && !info.isDirectory())) throw typed("runtime-target-invalid", "runtime target path is unsafe");
  }
  return physicalFile(candidate, "runtime target");
}
function digestFile(path) { return sha256(readFileSync(path)); }
function expectedTargets(barrier) {
  return new Map(barrier.runtimeTargets.map((target) => [target.path, target.afterSha256]));
}
function validateConfigPostimage(root, barrier) {
  const target = loadRuntimeProjectionV3OwnedKeys().targets.find((entry) => entry.path === ".codex/config.toml");
  const expected = expectedTargets(barrier).get(target?.path);
  if (!target || typeof expected !== "string") throw typed("runtime-target-invalid", "Codex config target is not barrier-bound");
  const path = safeProjectPath(root, target.path);
  if (digestFile(path) !== expected) throw typed("runtime-target-invalid", "Codex config postimage changed");
  return { path, target };
}
function validateAgents(root, barrier) {
  const manifest = loadRuntimeProjectionV3OwnedKeys();
  const expected = expectedTargets(barrier);
  const records = [];
  for (const target of manifest.targets.filter((entry) => entry.path.startsWith(".codex/agents/")).sort((a, b) => a.path.localeCompare(b.path))) {
    const path = safeProjectPath(root, target.path);
    const digest = digestFile(path);
    if (digest !== expected.get(target.path)) throw typed("runtime-target-invalid", "agent postimage changed");
    let route;
    try { route = parseRuntimeProjectionV3TomlRoute(readFileSync(path, "utf8"), target.ownedKeys); }
    catch (error) { throw typed("runtime-target-invalid", "agent route is malformed", error); }
    if (!exactKeys(route, target.ownedKeys)) throw typed("runtime-target-invalid", "agent route fields are not closed");
    if (Object.values(route).some((value) => typeof value !== "string" || value.length === 0)) {
      throw typed("runtime-target-invalid", "agent route value is invalid");
    }
    records.push({ path: target.path, sha256: digest, route });
  }
  return { records, sha256: canonicalSha256(records) };
}
function verifyBoundIdentity(barrier, executablePath) {
  if (digestFile(LAUNCHER_PATH) !== barrier.launcherSha256 || digestFile(HELPER_PATH) !== barrier.helperSha256) {
    throw typed("helper-identity-mismatch", "runtime helper binding drifted");
  }
  let executable;
  try { executable = realpathSync(physicalFile(realpathSync(executablePath), "Codex executable")); }
  catch (error) {
    if (error instanceof RuntimeReadbackError) throw error;
    throw typed("executable-unavailable", "Codex executable is unavailable", error);
  }
  if (digestFile(executable) !== barrier.codexExecutableSha256) {
    throw typed("executable-identity-mismatch", "Codex executable binding drifted");
  }
  return executable;
}
function projectSourceMatches(source, projectFolder) {
  if (!exactKeys(source, ["dotCodexFolder", "type"]) || source.type !== "project" || typeof source.dotCodexFolder !== "string") return false;
  try { return realpathSync(physicalDirectory(source.dotCodexFolder, "project config layer")) === projectFolder; }
  catch { return false; }
}
function validateMetadata(metadata, projectFolder) {
  if (!exactKeys(metadata, ["name", "version"]) || typeof metadata.version !== "string" || metadata.version.length === 0 || !plainObject(metadata.name)) {
    throw typed("config-read-invalid", "config/read metadata is invalid");
  }
  if (metadata.name.type === "project" && !projectSourceMatches(metadata.name, projectFolder)) {
    throw typed("config-origin-invalid", "config/read named a foreign project layer");
  }
  return metadata.name.type === "project";
}
function readOwnedPath(config, key) {
  let value = config;
  for (const part of key.split(".")) {
    if (!plainObject(value) || !Object.hasOwn(value, part)) throw typed("config-read-invalid", `owned effective config key is absent: ${key}`);
    value = value[part];
  }
  return value;
}
function validateConfigReadResult(observed, root, configTarget) {
  if (!exactKeys(observed, ["config", "layers", "origins"]) || !plainObject(observed.config)
    || !plainObject(observed.origins) || !Array.isArray(observed.layers)) {
    throw typed("config-read-invalid", "strict Codex config/read result has the wrong response shape");
  }
  const projectFolder = realpathSync(physicalDirectory(join(root, ".codex"), "project .codex directory"));
  let projectOriginCount = 0;
  for (const metadata of Object.values(observed.origins)) {
    if (validateMetadata(metadata, projectFolder)) projectOriginCount += 1;
  }
  const projectLayers = observed.layers.filter((layer) => {
    if (!plainObject(layer) || typeof layer.version !== "string" || layer.version.length === 0 || !plainObject(layer.name)
      || !Object.hasOwn(layer, "config") || Object.keys(layer).some((key) => !["config", "disabledReason", "name", "version"].includes(key))) {
      throw typed("config-read-invalid", "config/read layer is invalid");
    }
    if (layer.name.type === "project" && !projectSourceMatches(layer.name, projectFolder)) {
      throw typed("config-origin-invalid", "config/read returned a foreign project layer");
    }
    return layer.name.type === "project";
  });
  if (projectLayers.length !== 1 || !plainObject(projectLayers[0].config)) {
    throw typed("config-origin-invalid", "the canonical project config layer was not loaded exactly once");
  }
  if (Object.keys(projectLayers[0].config).length > 0 && projectOriginCount === 0) {
    throw typed("config-origin-invalid", "project config values have no project origin");
  }
  const owned = {};
  for (const key of configTarget.ownedKeys) {
    owned[key] = readOwnedPath(observed.config, key);
    const origin = observed.origins[key];
    if (!origin || !validateMetadata(origin, projectFolder) || origin.name.type !== "project") {
      throw typed("config-origin-invalid", `owned effective config key has no project origin: ${key}`);
    }
  }
  return owned;
}

function transportEnvironment() {
  const env = { ...process.env };
  delete env.PIPELINE_CODEX_ONBOARDING_TICKET_ID;
  delete env.PIPELINE_CODEX_ONBOARDING_TOKEN;
  return env;
}

/** Fixed, bounded production transport. It starts no thread or model turn. */
export function readNativeConfig({ executable, cwd, includeLayers = true, spawnChild = spawn } = {}) {
  if (typeof executable !== "string" || !isAbsolute(executable) || typeof cwd !== "string" || !isAbsolute(cwd) || includeLayers !== true) {
    return Promise.reject(typed("transport-unavailable", "Codex config/read transport request was invalid"));
  }
  return new Promise((resolveRead, rejectRead) => {
    const child = spawnChild(executable, ["--strict-config", "app-server", "--listen", "stdio://"], {
      cwd,
      env: transportEnvironment(),
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const decoder = new StringDecoder("utf8");
    let buffer = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let initialized = false;
    let remoteControlStatusObserved = false;
    let response = null;
    let failure = null;
    let settled = false;
    let hardKill = null;
    const send = (value) => child.stdin.write(`${canonicalJson(value)}\n`);
    const stop = (error, kill = true) => {
      failure = failure ?? error;
      if (!child.stdin.destroyed && !child.stdin.writableEnded) child.stdin.end();
      if (kill && child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
        hardKill ??= setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        }, 500);
      }
    };
    const observeRemoteControlStatus = (value) => {
      const params = value.params;
      if (!initialized || response !== null || remoteControlStatusObserved
        || !exactKeys(value, ["emittedAtMs", "method", "params"])
        || value.method !== "remoteControl/status/changed"
        || !Number.isSafeInteger(value.emittedAtMs) || value.emittedAtMs < 0
        || !exactKeys(params, ["environmentId", "installationId", "serverName", "status"])
        || !(params.environmentId === null || typeof params.environmentId === "string")
        || typeof params.installationId !== "string"
        || typeof params.serverName !== "string"
        || !REMOTE_CONTROL_STATUSES.has(params.status)) {
        stop(typed("protocol-invalid", "Codex config/read remote-control status notification was invalid or out of sequence"));
        return;
      }
      remoteControlStatusObserved = true;
    };
    const observeConfigWarning = (value) => {
      if (!initialized || response !== null
        || !exactKeys(value, ["emittedAtMs", "method", "params"])
        || value.method !== "configWarning"
        || !Number.isSafeInteger(value.emittedAtMs) || value.emittedAtMs < 0
        || !validConfigWarning(value.params)) {
        stop(typed("protocol-invalid", "Codex config/read config warning notification was invalid or out of sequence"));
      }
    };
    const onMessage = (value) => {
      if (failure) return;
      if (!plainObject(value)) {
        stop(typed("protocol-invalid", "Codex config/read emitted a non-object protocol message"));
        return;
      }
      if (Object.hasOwn(value, "method")) {
        if (Object.hasOwn(value, "id")) {
          stop(typed("protocol-invalid", "Codex config/read emitted an unexpected server request"));
          return;
        }
        if (value.method === "configWarning") observeConfigWarning(value);
        else observeRemoteControlStatus(value);
        return;
      }
      if (value.id === 1) {
        if (initialized || value.error || !plainObject(value.result)) {
          stop(typed("protocol-invalid", "Codex initialize response was invalid"));
          return;
        }
        initialized = true;
        send({ method: "initialized" });
        send({ id: 2, method: "config/read", params: { cwd, includeLayers: true } });
      } else if (value.id === 2) {
        if (!initialized || response !== null || value.error || !plainObject(value.result)) {
          stop(typed("protocol-invalid", "Codex config/read response was invalid"));
          return;
        }
        response = value.result;
        if (!child.stdin.destroyed && !child.stdin.writableEnded) child.stdin.end();
      } else stop(typed("protocol-invalid", "Codex config/read emitted an unexpected response"));
    };
    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_TRANSPORT_BYTES) {
        stop(typed("transport-oversize", "Codex config/read stdout exceeded its byte limit"));
        return;
      }
      buffer += decoder.write(chunk);
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        try { onMessage(JSON.parse(line)); }
        catch (error) { stop(error instanceof RuntimeReadbackError ? error : typed("protocol-invalid", "Codex config/read emitted malformed JSONL", error)); }
      }
    });
    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes > MAX_TRANSPORT_BYTES) stop(typed("transport-oversize", "Codex config/read stderr exceeded its byte limit"));
    });
    child.once("error", (error) => stop(typed("transport-unavailable", "Codex config/read child was unavailable", error), false));
    const deadline = setTimeout(() => stop(typed("transport-timeout", "Codex config/read transport timed out")), HOST_TIMEOUT_MS - 500);
    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      if (hardKill !== null) clearTimeout(hardKill);
      buffer += decoder.end();
      if (buffer.trim().length > 0) failure ??= typed("protocol-invalid", "Codex config/read ended with an incomplete JSONL record");
      if (code !== 0 || signal !== null) failure ??= typed("transport-unavailable", "Codex config/read child exited unsuccessfully");
      if (!initialized || !remoteControlStatusObserved || response === null) {
        failure ??= typed("protocol-invalid", "Codex config/read handshake was incomplete");
      }
      if (failure) rejectRead(failure);
      else resolveRead(response);
    });
    send({
      id: 1,
      method: "initialize",
      params: {
        clientInfo: { name: "agent-pipeline-runtime-readback", title: null, version: "1" },
        capabilities: { experimentalApi: false, requestAttestation: false },
      },
    });
  });
}

/**
 * Tests may replace only the child transport/config-read boundary. Production
 * selects `readNativeConfig` plus the fixed Node child adapter internally and
 * accepts no caller-supplied evidence object.
 */
export async function produceRuntimeReadback({
  rootDir, ticketId, token, repositoryCapability = "local", now = Date.now,
  random = randomBytes, configRead = readNativeConfig, childTransport = undefined,
  runtimeOptions = {},
} = {}) {
  const clock = typeof now === "function" ? now : () => now;
  let authenticated;
  try {
    authenticated = authenticateLaunchTicket({
      rootDir, repositoryCapability, ticketId, token, now: clock(), ...runtimeOptions,
    });
  } catch (error) {
    throw typed("ticket-unavailable", "launch ticket is absent, foreign, expired, or replayed", error);
  }
  const { barrier } = authenticated;
  const readerGenerationSha256 = sha256(random(32));
  if (readerGenerationSha256 === barrier.value.writerGenerationSha256) {
    throw typed("same-generation", "same-generation runtime evidence is rejected");
  }
  const root = realpathSync(rootDir);
  const { target: configTarget } = validateConfigPostimage(root, barrier.value);
  let executablePath;
  try {
    executablePath = runtimeOptions.codexExecutablePath ?? resolveRuntimeExecutable().physicalPath;
  } catch (error) {
    throw typed("executable-unavailable", "Codex executable is unavailable", error);
  }
  const executable = verifyBoundIdentity(barrier.value, executablePath);
  let observed;
  try {
    observed = await configRead({
      executable,
      cwd: root,
      includeLayers: true,
      ...(childTransport === undefined ? {} : { spawnChild: childTransport }),
    });
  } catch (error) {
    if (error instanceof RuntimeReadbackError) throw error;
    throw typed("transport-unavailable", "strict Codex config/read transport is unavailable", error);
  }
  verifyBoundIdentity(barrier.value, executable);
  const owned = validateConfigReadResult(observed, root, configTarget);
  const agents = validateAgents(root, barrier.value);
  const observedAtEpochMs = clock();
  const receipt = {
    schema: READBACK_SCHEMA, barrierSha256: barrier.rawSha256, repositoryFingerprint: barrier.value.repositoryFingerprint,
    sourceSha256: barrier.value.sourceSha256, runtimeTargetsSha256: barrier.value.runtimeTargetsSha256,
    readerGenerationSha256, effectiveConfigSha256: canonicalSha256(owned), validatedAgentsSha256: agents.sha256,
    ticketId, observedAtEpochMs,
  };
  return { receipt, agents: agents.records };
}

/** The host helper is both the sole receipt producer and the in-process CAS verifier. */
export async function verifyRuntimeReadback(options = {}) {
  const produced = await produceRuntimeReadback(options);
  let consumed;
  try {
    consumed = consumeRuntimeReadback({
      rootDir: options.rootDir,
      repositoryCapability: options.repositoryCapability ?? "local",
      receipt: produced.receipt,
      ticketId: options.ticketId,
      token: options.token,
      now: produced.receipt.observedAtEpochMs,
      ...(options.runtimeOptions ?? {}),
    });
  } catch (error) {
    throw typed("receipt-rejected", "runtime readback could not consume the authenticated ticket/barrier", error);
  }
  return { ...produced, consumed };
}

function parse(argv) {
  if (argv.length !== 2 || argv[0] !== "--root") throw typed("request-invalid", "Usage: codex-project-runtime-readback-host.mjs --root <project-root>");
  return { rootDir: argv[1] };
}
export async function main(argv = process.argv.slice(2), {
  write = process.stdout.write.bind(process.stdout),
  childTransport = undefined,
} = {}) {
  try {
    const { rootDir } = parse(argv);
    const ticketId = process.env.PIPELINE_CODEX_ONBOARDING_TICKET_ID;
    const rawToken = process.env.PIPELINE_CODEX_ONBOARDING_TOKEN;
    if (!ticketId || !rawToken || !/^[a-f0-9]{64}$/u.test(rawToken)) throw typed("ticket-unavailable", "launch ticket is absent");
    await verifyRuntimeReadback({
      rootDir,
      ticketId,
      token: Buffer.from(rawToken, "hex"),
      now: Date.now,
      ...(childTransport === undefined ? {} : { childTransport }),
    });
    write(`${canonicalJson({ schema: READBACK_STATUS_SCHEMA, status: "produced" })}\n`);
    return 0;
  } catch (error) {
    const code = READBACK_STATUS_CODES.has(error?.code)
      ? error.code
      : "runtime-readback-unavailable";
    write(`${canonicalJson({
      schema: READBACK_STATUS_SCHEMA,
      status: "unavailable",
      code,
    })}\n`);
    return 2;
  }
}

if (isDirectInvocation(import.meta.url)) {
  main().then((code) => { process.exitCode = code; });
}
