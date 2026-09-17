#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Model-free producer for the native Critic's physical tuple and smoke proof.
 * It intentionally has no selected-review input and never sends turn/start.
 */
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { arch, release, type } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

import { classifyPlatform } from "./codex-sandbox-preflight.mjs";
import { NATIVE_CRITIC_POLICY, nativeCriticCanonicalDigest } from "../lib/codex-native-critic-policy.mjs";
import {
  NATIVE_CRITIC_REDUCING_CONFIG,
  nativeCriticReducingCliArgs,
  nativeCriticToolSurfaceConfigDigest,
  nativeCriticToolSurfaceObservationDigest,
  reduceDiscoveredNativeMcpServers,
  validateNativeFeaturePages,
  validateNativeMcpPages,
} from "../lib/codex-native-critic-tools.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MAX_PAGES = 10;
const MAX_BYTES = 1024 * 1024;
const TIMEOUT_MS = 45_000;
const OS_DENIAL = /^(?:EROFS|EACCES|EPERM)$/;
const REQUIRED_METHODS = Object.freeze(["initialize", "thread/start", "experimentalFeature/list", "mcpServerStatus/list", "command/exec"]);

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function fail(code, detail) { const error = new Error(detail); error.code = code; throw error; }
function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function cleanText(value) { return typeof value === "string" ? value.replaceAll(/\/home\/[^/\s]+/g, "/home/<redacted>") : null; }
function physicalDir(path, label) {
  if (typeof path !== "string" || !path.startsWith("/")) fail("input-invalid", `${label} is not absolute`);
  let prefix = ""; for (const segment of path.split("/").filter(Boolean)) { prefix = `${prefix}/${segment}`; if (lstatSync(prefix).isSymbolicLink()) fail("input-invalid", `${label} contains a symlink`); }
  const actual = realpathSync(path); if (!statSync(actual).isDirectory()) fail("input-invalid", `${label} is not a directory`);
  return actual;
}
function physicalFile(path, label) {
  if (typeof path !== "string" || !path.startsWith("/")) fail("input-invalid", `${label} is not absolute`);
  const actual = realpathSync(path); if (!statSync(actual).isFile()) fail("input-invalid", `${label} is not a file`);
  return actual;
}
function isInside(root, path) { const suffix = relative(resolve(root), resolve(path)); return suffix === "" || (!suffix.startsWith(`..${"/"}`) && suffix !== ".."); }

/** Canonically hashes the entire generated bundle, not a caller supplied schema. */
export function generatedSchemaDigest(schemaDir, dependencies = {}) {
  const read = dependencies.readFileSync ?? readFileSync;
  const v1 = read(join(schemaDir, "codex_app_server_protocol.schemas.json"), "utf8");
  const bundle = read(join(schemaDir, "codex_app_server_protocol.v2.schemas.json"), "utf8");
  let parsed; let parsedV1; try { parsed = JSON.parse(bundle); parsedV1 = JSON.parse(v1); } catch { fail("schema-invalid", "generated protocol bundle is invalid JSON"); }
  const requestBranches = parsed?.definitions?.ClientRequest?.oneOf;
  const methods = Array.isArray(requestBranches) ? requestBranches.map((branch) => branch?.properties?.method?.enum?.[0]).filter(Boolean) : [];
  for (const method of REQUIRED_METHODS) if (!methods.includes(method)) fail("schema-invalid", `generated protocol omits ${method}`);
  const definition = (name) => parsed?.definitions?.[`v2/${name}`] ?? parsed?.definitions?.[name];
  const command = definition("CommandExecParams");
  const sandbox = command?.properties?.sandboxPolicy;
  const thread = definition("ThreadStartParams");
  const features = definition("ExperimentalFeatureListParams");
  const mcp = definition("ListMcpServerStatusParams");
  const sandboxPolicy = definition("SandboxPolicy") ?? parsed?.definitions?.SandboxPolicy;
  if (!command || !command.required?.includes("command") || !sandbox || !JSON.stringify({ sandbox, sandboxPolicy }).includes("readOnly")
    || !thread?.properties?.sandbox || !features?.properties?.threadId || !mcp?.properties?.threadId) {
    fail("schema-invalid", "generated protocol does not attest standalone read-only command execution");
  }
  return sha256(nativeCriticCanonicalDigest({ v1: parsedV1, v2: parsed }));
}

export function observeNativeHost({ cliPath, candidateRoot }, dependencies = {}) {
  const read = dependencies.readFileSync ?? readFileSync;
  const exec = dependencies.execFileSync ?? execFileSync;
  const procVersion = read("/proc/version", "utf8");
  const mountInfo = read("/proc/self/mountinfo", "utf8");
  const platform = classifyPlatform({ procVersion, mountInfo, candidateRoot });
  if (platform.os !== "linux" || platform.kernelClass !== "wsl2" || platform.filesystemClass !== "wsl-native") fail("host-unavailable", "host is not WSL2-native");
  const boot = read("/proc/sys/kernel/random/boot_id", "utf8").trim();
  const version = exec(cliPath, ["--version"], { encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "ignore"] }).trim();
  if (!boot || !version) fail("host-unavailable", "native host identity is incomplete");
  return Object.freeze({
    cli: { version, sha256: sha256(read(cliPath)) },
    host: { platformClass: "linux-wsl2", kernel: { sysname: type(), release: release(), machine: arch() }, filesystemClass: "wsl2-native", bootIdSha256: sha256(boot) },
  });
}

function page(result, kind) {
  if (!object(result) || !Array.isArray(result.data) || (result.nextCursor != null && typeof result.nextCursor !== "string")) fail("protocol-invalid", `${kind} page is malformed`);
  return { data: result.data, nextCursor: result.nextCursor ?? null };
}
async function allPages(rpc, method, params, kind) {
  const pages = []; const cursors = new Set(); let cursor = null;
  for (;;) {
    const result = await rpc.request(method, { ...params, ...(cursor === null ? {} : { cursor }) });
    const next = page(result, kind); pages.push(next);
    if (pages.length > MAX_PAGES || cursors.has(cursor ?? "<first>")) fail("protocol-invalid", `${kind} pagination loop`);
    cursors.add(cursor ?? "<first>");
    if (next.nextCursor === null) return pages;
    if (cursors.has(next.nextCursor)) fail("protocol-invalid", `${kind} pagination loop`);
    cursor = next.nextCursor;
  }
}

class RpcProcess {
  constructor(command, argv, options, dependencies = {}) {
    this.spawn = dependencies.spawn ?? spawn; this.onNotification = dependencies.onNotification ?? null; this.timeoutMs = dependencies.timeoutMs ?? TIMEOUT_MS; this.nextId = 1; this.pending = new Map(); this.bytes = 0; this.failure = null; this.closing = false;
    this.child = this.spawn(command, argv, { ...options, shell: false, stdio: ["pipe", "pipe", "pipe"] });
    this.closed = new Promise((resolveClose) => this.child.once("close", (code, signal) => resolveClose({ code, signal })));
    this.child.once("error", (error) => this.finish(error)); this.child.once("close", () => { if (!this.closing) this.finish(new Error("protocol closed")); });
    const lines = createInterface({ input: this.child.stdout });
    lines.on("line", (line) => this.receive(line));
    this.child.stderr.on("data", (chunk) => { this.bytes += chunk.length; if (this.bytes > MAX_BYTES) this.finish(new Error("stderr overflow")); });
    this.child.stdin.on("error", (error) => this.finish(Object.assign(new Error("stdin write failed"), { code: "stdin-error", cause: error })));
  }
  receive(line) {
    this.bytes += Buffer.byteLength(line); if (this.bytes > MAX_BYTES) return this.finish(new Error("stdout overflow"));
    let value; try { value = JSON.parse(line); } catch { return this.finish(Object.assign(new Error("protocol JSON is malformed"), { code: "protocol-invalid" })); }
    if (!object(value)) return this.finish(Object.assign(new Error("protocol frame is not an object"), { code: "protocol-invalid" }));
    if (typeof value.method === "string") {
      if (typeof this.onNotification === "function") this.onNotification({ method: value.method, isRequest: Object.hasOwn(value, "id") });
      if (Object.hasOwn(value, "id")) return this.finish(new Error("server request is not admitted"));
      if (!["thread/started", "thread/status/changed", "thread/closed", "mcpServer/startupStatus/updated", "remoteControl/status/changed", "configWarning", "deprecationNotice", "warning"].includes(value.method)) return this.finish(new Error("notification is not admitted"));
      return;
    }
    if (!Object.hasOwn(value, "id")) return;
    const pending = this.pending.get(value.id); if (!pending) return this.finish(new Error("unexpected protocol response"));
    this.pending.delete(value.id);
    if (value.error) pending.reject(Object.assign(new Error(cleanText(value.error.message) ?? "protocol error"), { code: "protocol-error", rpcError: value.error }));
    else pending.resolve(value.result);
  }
  request(method, params) {
    if (this.failure !== null) return Promise.reject(this.failure);
    const id = this.nextId++; const payload = JSON.stringify({ id, method, params });
    return new Promise((resolveRequest, rejectRequest) => {
      if (this.failure !== null) { rejectRequest(this.failure); return; }
      const timer = setTimeout(() => { this.pending.delete(id); rejectRequest(Object.assign(new Error(`${method} timed out`), { code: "timed-out" })); this.finish(new Error("protocol timed out")); }, this.timeoutMs); timer.unref();
      this.pending.set(id, { resolve: (value) => { clearTimeout(timer); resolveRequest(value); }, reject: (error) => { clearTimeout(timer); rejectRequest(error); } });
      try { this.child.stdin.write(`${payload}\n`); } catch (error) { this.finish(Object.assign(new Error("stdin write failed"), { code: "stdin-error", cause: error })); }
    });
  }
  notify(method, params = undefined) { if (this.failure !== null) return; try { this.child.stdin.write(`${JSON.stringify(params === undefined ? { method } : { method, params })}\n`); } catch (error) { this.finish(Object.assign(new Error("stdin write failed"), { code: "stdin-error", cause: error })); } }
  finish(error = new Error("protocol closed")) { const first = this.failure ?? error; if (this.failure === null) this.failure = error; for (const pending of this.pending.values()) pending.reject(first); this.pending.clear(); try { this.child.stdin.end(); } catch {} try { this.child.kill("SIGTERM"); } catch {} }
  async close() { this.closing = true; try { this.child.stdin.end(); } catch (error) { this.finish(Object.assign(new Error("stdin close failed"), { code: "stdin-error", cause: error })); } const wait = (ms, value) => new Promise((resolveTimeout) => { const timer = setTimeout(() => resolveTimeout(value), ms); timer.unref(); }); const terminal = await Promise.race([this.closed, wait(this.timeoutMs, null)]); if (terminal) return terminal; try { this.child.kill("SIGTERM"); } catch {} const stopped = await Promise.race([this.closed, wait(2_000, null)]); if (stopped) return stopped; try { this.child.kill("SIGKILL"); } catch {} return await Promise.race([this.closed, wait(2_000, { code: null, signal: "SIGKILL" })]); }
}

function startThreadResult(result, priorThread = null) {
  if (!object(result) || typeof result.thread?.id !== "string" || result.thread.id.length === 0 || result.thread.id === priorThread
    || result.sandbox?.type !== "readOnly" || result.sandbox?.networkAccess !== false) fail("protocol-invalid", "thread/start response lacks the requested read-only policy");
  return result.thread.id;
}
function commandResult(result) {
  if (!object(result) || !Number.isInteger(result.exitCode) || typeof result.stdout !== "string" || typeof result.stderr !== "string") fail("protocol-invalid", "command/exec response is malformed");
  return result;
}
function nativeCommand(command, cwd) { return { command, cwd, sandboxPolicy: { type: "readOnly", networkAccess: false }, timeoutMs: 10_000, outputBytesCap: 16_384 }; }
function normalizeMcpPages(pages) {
  return pages.map((entry) => ({ data: entry.data.map((row) => ({ runtimeStatus: row?.runtimeStatus, toolsEmpty: object(row?.tools) && Object.keys(row.tools).length === 0, resourcesEmpty: Array.isArray(row?.resources) && row.resources.length === 0, resourceTemplatesEmpty: Array.isArray(row?.resourceTemplates) && row.resourceTemplates.length === 0, catalogFree: row?.serverInfo === null && row?.pluginId === null })), nextCursor: entry.nextCursor }));
}
function sourceIdentity(root, dependencies = {}) {
  const exec = dependencies.execFileSync ?? execFileSync;
  const tree = exec("git", ["rev-parse", "HEAD^{tree}"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  const dirty = sha256(exec("git", ["diff", "--binary", "--no-ext-diff", "HEAD"], { cwd: root, encoding: null, stdio: ["ignore", "pipe", "ignore"] }));
  if (!/^[a-f0-9]{40}$/.test(tree)) fail("source-unavailable", "candidate source identity is invalid");
  return { tree, dirty };
}

/** Performs protocol-schema-backed metadata discovery plus native command smoke. */
async function runNativeCriticPreflightInternal(input, dependencies = {}) {
  const now = dependencies.now ?? (() => new Date());
  const candidateRoot = physicalDir(input.candidateRoot, "candidate root");
  const scratchRoot = physicalDir(input.scratchPath, "scratch");
  const permittedScratch = physicalDir(join(candidateRoot, "scratch"), "repository scratch");
  if (!isInside(permittedScratch, scratchRoot) && scratchRoot !== permittedScratch) fail("input-invalid", "scratch root is outside repository scratch");
  const cliPath = physicalFile(input.codexPath, "Codex executable");
  const scratch = realpathSync(mkdtempSync(join(scratchRoot, "native-critic-preflight-")));
  const schemaDir = join(scratch, "protocol-schema");
  const sourcePath = physicalFile(input.sourcePath ?? fileURLToPath(import.meta.url), "preflight source");
  const beforeSource = sourceIdentity(candidateRoot, dependencies); const beforeScript = sha256(readFileSync(sourcePath));
  const canary = join(scratch, ".native-critic-canary"); const hostControl = join(scratch, ".native-critic-host-control");
  let rpc = null; let terminal = { exitCode: null, signal: null, spawnFailed: false }; const notificationMethods = [];
  let initialized = false; let readObserved = false; let writeObserved = false; let nativeWriteDenied = false; let hostWriteControl = false;
  try {
    mkdirSync(schemaDir, { recursive: true });
    try { (dependencies.execFileSync ?? execFileSync)(cliPath, ["app-server", "generate-json-schema", "--out", schemaDir], { encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] }); }
    catch (error) { fail("schema-generation-failed", cleanText(error?.stderr?.toString()) ?? "schema generation failed"); }
    const protocolSchemaSha256 = generatedSchemaDigest(schemaDir, dependencies);
    const host = (dependencies.observeNativeHost ?? observeNativeHost)({ cliPath, candidateRoot }, dependencies);
    writeFileSync(canary, "native-critic-canary\n", "utf8"); const originalCanary = sha256(readFileSync(canary));
    writeFileSync(canary, "host-positive-control\n", "utf8"); writeFileSync(canary, "native-critic-canary\n", "utf8");
    hostWriteControl = sha256(readFileSync(canary)) === originalCanary;
    rpc = new RpcProcess(cliPath, ["app-server", ...nativeCriticReducingCliArgs()], { cwd: scratch }, { ...dependencies, onNotification: (event) => { if (dependencies.diagnosticNotifications === true && notificationMethods.length < 4) notificationMethods.push({ method: event.method, isRequest: event.isRequest }); } });
    const init = await rpc.request("initialize", { clientInfo: { name: "agent-pipeline-native-critic-preflight", version: "1" }, capabilities: { experimentalApi: true, requestAttestation: false } });
    if (!object(init)) fail("protocol-invalid", "initialize response is malformed"); initialized = true; rpc.notify("initialized");
    const discovery = startThreadResult(await rpc.request("thread/start", { cwd: scratch, sandbox: "read-only", approvalPolicy: "never", ephemeral: true }));
    const discoveredPages = await allPages(rpc, "mcpServerStatus/list", { threadId: discovery, limit: 100, detail: "toolsAndAuthOnly" }, "MCP discovery");
    const reduction = reduceDiscoveredNativeMcpServers(discoveredPages);
    const threadId = startThreadResult(await rpc.request("thread/start", { cwd: scratch, sandbox: "read-only", approvalPolicy: "never", ephemeral: true, config: { ...NATIVE_CRITIC_REDUCING_CONFIG, ...reduction.config } }), discovery);
    const featurePages = await allPages(rpc, "experimentalFeature/list", { threadId, limit: 100 }, "feature");
    const mcpPages = await allPages(rpc, "mcpServerStatus/list", { threadId, limit: 100, detail: "toolsAndAuthOnly" }, "MCP");
    const featureSnapshot = validateNativeFeaturePages(featurePages); const mcpSnapshot = validateNativeMcpPages(normalizeMcpPages(mcpPages));
    const read = commandResult(await rpc.request("command/exec", nativeCommand(["/bin/cat", canary], scratch)));
    readObserved = read.exitCode === 0 && read.stdout === "native-critic-canary\n";
    const attempted = commandResult(await rpc.request("command/exec", nativeCommand([process.execPath, "-e", "const fs=require('node:fs');process.stdout.write('attempted-write\\n');try{fs.writeFileSync(process.argv[1],'mutated\\n');process.exit(9)}catch(error){process.stderr.write(error.code||'UNKNOWN');process.exit(1)}", canary], scratch)));
    writeObserved = attempted.stdout.includes("attempted-write") && attempted.exitCode === 1; nativeWriteDenied = writeObserved && OS_DENIAL.test(attempted.stderr.trim());
    const canaryUnchanged = sha256(readFileSync(canary)) === originalCanary;
    const afterSource = sourceIdentity(candidateRoot, dependencies); const sourceUnchanged = beforeSource.tree === afterSource.tree && beforeSource.dirty === afterSource.dirty && sha256(readFileSync(sourcePath)) === beforeScript;
    terminal = await rpc.close();
    if (rpc.failure !== null) fail("protocol-invalid", "native protocol terminated with a sticky failure");
    rpc = null;
    const observed = { initialized, readObserved, writeObserved, nativeWriteDenied, canaryUnchanged, hostWriteControl, sourceUnchanged, protocolError: false, guardDenial: false, sandboxLaunchDenied: false, timedOut: false, cleanupComplete: terminal.code === 0 && terminal.signal === null, terminal: { exitCode: terminal.code, signal: terminal.signal, spawnFailed: false } };
    if (!Object.values({ initialized, readObserved, writeObserved, nativeWriteDenied, canaryUnchanged, hostWriteControl, sourceUnchanged }).every(Boolean) || !observed.cleanupComplete) fail("smoke-failed", "native command smoke did not prove every required fact");
    const tuple = { cli: host.cli, protocolSchemaSha256, host: host.host, policy: NATIVE_CRITIC_POLICY, toolSurface: { configSha256: nativeCriticToolSurfaceConfigDigest(reduction), observationSha256: nativeCriticToolSurfaceObservationDigest(featureSnapshot, mcpSnapshot) } };
    const smokeReceipt = { schema: "pipeline.codex-native-critic-smoke.v1", status: "passed", tuple, observed, capturedAt: now().toISOString() };
    return { schema: "pipeline.codex-native-critic-preflight.v1", status: "passed", tuple, smokeReceipt, smokeReceiptSha256: nativeCriticCanonicalDigest(smokeReceipt), metadata: { featurePages: featureSnapshot.pageCount, mcpPages: mcpSnapshot.pageCount, discoveryMcpPages: discoveredPages.length, turnsStarted: 0 } };
  } catch (error) {
    if (rpc) terminal = await rpc.close();
    return { schema: "pipeline.codex-native-critic-preflight.v1", status: "unavailable", code: error?.code ?? "preflight-failed", detail: cleanText(error?.message) ?? "preflight failed", ...(dependencies.diagnosticNotifications === true ? { notificationMethods } : {}), terminal: { exitCode: terminal.code, signal: terminal.signal, spawnFailed: terminal.code === null && terminal.signal === null } };
  } finally { try { rmSync(canary, { force: true }); rmSync(hostControl, { force: true }); } catch {} }
}

export async function runNativeCriticPreflight(input, dependencies = {}) {
  try { return await runNativeCriticPreflightInternal(input, dependencies); }
  catch (error) { return { schema: "pipeline.codex-native-critic-preflight.v1", status: "unavailable", code: error?.code ?? "input-invalid", detail: cleanText(error?.message) ?? "preflight input failed", terminal: { exitCode: null, signal: null, spawnFailed: false } }; }
}

function cliArgs(argv) {
  const diagnosticNotifications = argv.at(-1) === "--diagnostic-notifications";
  const values = diagnosticNotifications ? argv.slice(0, -1) : argv;
  if (values.length !== 6 || values[0] !== "--scratch" || values[2] !== "--candidate-root" || values[4] !== "--codex") fail("input-invalid", "usage: --scratch <absolute-dir> --candidate-root <absolute-dir> --codex <absolute-path> [--diagnostic-notifications]");
  return { input: { scratchPath: values[1], candidateRoot: values[3], codexPath: values[5] }, dependencies: { diagnosticNotifications } };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { input, dependencies } = cliArgs(process.argv.slice(2));
  runNativeCriticPreflight(input, dependencies).then((result) => { process.stdout.write(`${JSON.stringify(result)}\n`); process.exitCode = result.status === "passed" ? 0 : 1; });
}
