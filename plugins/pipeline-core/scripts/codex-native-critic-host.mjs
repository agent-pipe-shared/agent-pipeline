// SPDX-License-Identifier: SUL-1.0

/**
 * Bounded consumer for the native model-tool Critic child. This is deliberately
 * separate from the legacy outer-sandbox route: native tool policy is proved
 * by the child before its turn, while this host binds that proof to a selected
 * V3 route and current physical host facts.
 */
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { arch, release, type } from "node:os";

import { classifyPlatform } from "./codex-sandbox-preflight.mjs";
import { validateAgainstSchema } from "../lib/schema-lite.mjs";
import {
  NATIVE_CRITIC_ASSURANCE,
  NATIVE_CRITIC_POLICY,
  nativeCriticCanonicalDigest,
  validateNativeCriticSelection,
  validateNativeCriticTuple,
} from "../lib/codex-native-critic-policy.mjs";
import { NATIVE_CRITIC_PROHIBITED_FEATURES, NATIVE_CRITIC_REDUCING_CONFIG_SHA256, nativeCriticToolSurfaceConfigDigest, nativeCriticToolSurfaceObservationDigest } from "../lib/codex-native-critic-tools.mjs";
import { resolveCriticHighRiskRoute } from "../lib/critic-route-v3.mjs";
import { repositoryFingerprint } from "../lib/codex-onboarding-runtime.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = realpathSync(resolve(HERE, ".."));
const CHILD = realpathSync(resolve(HERE, "codex-critic-app-server-child.mjs"));
const ROLE = "roles/critic.md";
const PROMPT = "templates/prompts/critic-review.md";
const VERDICT = "scripts/critic-verdict.schema.json";
const PROVIDER = "openai";
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_ELAPSED_MS = 480_000;
const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const TREE = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const SIGNALS = new Set(["SIGHUP", "SIGINT", "SIGTERM", "SIGKILL", "SIGABRT", "SIGSEGV", "SIGPIPE"]);
const FAILURE_CODES = new Set([
  "input-invalid", "selection-invalid", "route-invalid", "physical-proof-unavailable", "physical-proof-drift",
  "child-spawn-failed", "child-timeout", "child-stream-overflow", "child-output-invalid", "child-policy-invalid",
  "child-lifecycle-invalid", "child-verdict-invalid", "child-write-attempt", "child-terminal-invalid",
]);

function fail(message) { throw new Error(`native Critic host: ${message}`); }
function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(`${label} is not closed`);
}
function equal(left, right) { return nativeCriticCanonicalDigest(left) === nativeCriticCanonicalDigest(right); }
function inside(root, path) {
  const result = relative(root, path);
  return result !== "" && result !== ".." && !result.startsWith(`..${"/"}`);
}
function regularRealpath(path, label) {
  if (typeof path !== "string" || !path.startsWith("/")) fail(`${label} path is invalid`);
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) fail(`${label} is not a regular file`);
  return realpathSync(path);
}
function directoryRealpath(path, label) {
  if (typeof path !== "string" || !path.startsWith("/")) fail(`${label} path is invalid`);
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail(`${label} is not a physical directory`);
  return realpathSync(path);
}
function physicalPluginFile(path) {
  const actual = regularRealpath(resolve(PLUGIN_ROOT, path), "ruleset reference");
  if (!inside(PLUGIN_ROOT, actual)) fail("ruleset reference escaped executing plugin");
  return actual;
}
function hashFile(path) { return createHash("sha256").update(readFileSync(path)).digest("hex"); }
function childTerminal(value) {
  return {
    childStarted: value?.started === true,
    exitCode: Number.isInteger(value?.code) ? value.code : null,
    signal: SIGNALS.has(value?.signal) ? value.signal : null,
    cleanupStatus: value?.cleanup === "complete" ? "complete" : "incomplete",
  };
}
function boundedFailure(code, selection = null, terminal = null, lifecycle = {}) {
  return {
    schema: "pipeline.codex-native-critic-host-failure.v1",
    status: "unavailable",
    code: FAILURE_CODES.has(code) ? code : "child-output-invalid",
    selectionId: selection?.selectionId ?? null,
    terminal: terminal ?? { childStarted: false, exitCode: null, signal: null, cleanupStatus: "not-started" },
    lifecycle: {
      initialized: lifecycle.initialized === true,
      threadStarted: lifecycle.threadStarted === true,
      turnStarted: lifecycle.turnStarted === true,
      turnCompleted: lifecycle.turnCompleted === true,
      stdinEnded: lifecycle.stdinEnded === true,
      stdoutBytes: Number.isSafeInteger(lifecycle.stdoutBytes) && lifecycle.stdoutBytes >= 0 ? lifecycle.stdoutBytes : 0,
      stderrBytes: Number.isSafeInteger(lifecycle.stderrBytes) && lifecycle.stderrBytes >= 0 ? lifecycle.stderrBytes : 0,
    },
  };
}

function validateInput(value) {
  exactKeys(value, ["selection", "expectedTuple", "repository", "coordinatorScratch", "referencePaths", "referenceRecords", "reviewBase"], "native Critic host input");
  exactKeys(value.repository, ["root", "cliPath"], "native Critic repository");
  exactKeys(value.coordinatorScratch, ["path"], "native Critic coordinator scratch");
  if (!Array.isArray(value.referencePaths) || value.referencePaths.length === 0 || new Set(value.referencePaths).size !== value.referencePaths.length
    || value.referencePaths.some((path) => typeof path !== "string" || path.length === 0 || path.startsWith("/") || path.includes("\\") || path.split("/").some((part) => !part || part === "." || part === ".."))) fail("native Critic references are invalid");
  if (!COMMIT.test(value.reviewBase)) fail("native Critic review base is invalid");
  if (!Array.isArray(value.referenceRecords) || value.referenceRecords.length !== value.referencePaths.length || value.referenceRecords.length > 128) fail("native Critic reference records are invalid");
  const recordPaths = value.referenceRecords.map((record) => record?.path);
  if (JSON.stringify(recordPaths) !== JSON.stringify(value.referencePaths)) fail("native Critic record paths drifted");
  for (const record of value.referenceRecords) {
    if (record?.blobOid !== undefined) {
      exactKeys(record, ["path", "blobOid", "sha256"], "native source reference");
      if (!TREE.test(record.blobOid) || !SHA256.test(record.sha256)) fail("native source record is invalid");
    } else {
      exactKeys(record, ["path", "sha256", "candidate"], "native evidence reference");
      exactKeys(record.candidate, ["commit", "tree"], "native evidence candidate");
      if (!SHA256.test(record.sha256) || !COMMIT.test(record.candidate.commit) || !TREE.test(record.candidate.tree)) fail("native evidence record is invalid");
    }
  }
  if (value.selection?.dispatch?.referenceSetSha256 !== nativeCriticCanonicalDigest(value.referenceRecords)) fail("native Critic reference-set digest drifted");
  validateNativeCriticTuple(value.expectedTuple);
  return value;
}

function observePhysical(input, dependencies) {
  // A named observation seam exists solely for deterministic child-transport
  // tests. Production always enters the physical observations below.
  if (typeof dependencies.observePhysical === "function") return dependencies.observePhysical(input);
  const repoRoot = directoryRealpath(input.repository.root, "repository");
  if (repositoryFingerprint(repoRoot) !== input.selection.repoFingerprint) fail("repository fingerprint drifted");
  const scratch = directoryRealpath(input.coordinatorScratch.path, "coordinator scratch");
  const cliPath = regularRealpath(input.repository.cliPath, "Codex executable");
  if ((lstatSync(cliPath).mode & 0o111) === 0) fail("Codex executable is not executable");
  const referencePaths = input.referencePaths.map((reference) => {
    const actual = regularRealpath(resolve(repoRoot, reference), "critic reference");
    if (!inside(repoRoot, actual)) fail("critic reference escaped physical repository");
    return reference;
  });
  const readText = dependencies.readFileSync ?? readFileSync;
  const exec = dependencies.execFileSync ?? execFileSync;
  const procVersion = readText("/proc/version", "utf8");
  const mountInfo = readText("/proc/self/mountinfo", "utf8");
  const platform = classifyPlatform({ procVersion, mountInfo, candidateRoot: repoRoot });
  if (platform.os !== "linux" || platform.kernelClass !== "wsl2" || platform.filesystemClass !== "wsl-native") fail("native Critic host is not WSL2-native");
  const version = exec(cliPath, ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  if (!version) fail("Codex version is unavailable");
  const bootId = readText("/proc/sys/kernel/random/boot_id", "utf8").trim();
  if (!bootId) fail("boot identifier is unavailable");
  const candidateTree = exec("git", ["rev-parse", `${input.selection.dispatch.candidateCommit}^{tree}`], { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  exec("git", ["cat-file", "-e", `${input.reviewBase}^{commit}`], { cwd: repoRoot, stdio: "ignore" });
  if (candidateTree !== input.selection.dispatch.candidateTree) fail("candidate tree drifted");
  for (const record of input.referenceRecords) {
    const absolute = resolve(repoRoot, record.path);
    const bytes = readFileSync(absolute);
    if (createHash("sha256").update(bytes).digest("hex") !== record.sha256) fail("reference bytes drifted");
    if (record.blobOid !== undefined) {
      const blobOid = exec("git", ["rev-parse", `${input.selection.dispatch.candidateCommit}:${record.path}`], { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      const candidateBytes = exec("git", ["show", `${input.selection.dispatch.candidateCommit}:${record.path}`], { cwd: repoRoot, encoding: null, stdio: ["ignore", "pipe", "ignore"] });
      if (blobOid !== record.blobOid || createHash("sha256").update(candidateBytes).digest("hex") !== record.sha256) fail("candidate source reference drifted");
    } else {
      let evidence;
      try { evidence = JSON.parse(bytes); } catch { fail("candidate evidence is not JSON"); }
      const candidate = evidence?.candidate && typeof evidence.candidate === "object" ? evidence.candidate : evidence;
      if (candidate?.commit !== input.selection.dispatch.candidateCommit || candidate?.tree !== input.selection.dispatch.candidateTree
        || record.candidate.commit !== candidate.commit || record.candidate.tree !== candidate.tree) fail("candidate evidence drifted");
    }
  }
  const expected = input.expectedTuple;
  const current = {
    cli: { version, sha256: hashFile(cliPath) },
    // The coordinator's smoke derives this from the actual app-server schema.
    // Bind that evidence; never relabel a Critic verdict schema as protocol.
    protocolSchemaSha256: expected.protocolSchemaSha256,
    host: { platformClass: "linux-wsl2", kernel: { sysname: type(), release: release(), machine: arch() }, filesystemClass: "wsl2-native", bootIdSha256: createHash("sha256").update(bootId).digest("hex") },
    policy: NATIVE_CRITIC_POLICY,
    // The bounded per-thread MCP reduction is discovered by the child on its
    // metadata-only thread. Its digest therefore arrives in the independently
    // selected tuple and is checked against the child below; the host never
    // reconstructs a server identity or pretends a feature-only digest binds it.
    toolSurface: { configSha256: expected.toolSurface.configSha256, observationSha256: expected.toolSurface.observationSha256 },
  };
  if (!equal(current, expected)) fail("current native tuple drifted");
  return { repoRoot, scratch, cliPath, referencePaths, rolePath: physicalPluginFile(ROLE), promptPath: physicalPluginFile(PROMPT), verdictPath: physicalPluginFile(VERDICT) };
}

async function runFixedChild(request, dependencies) {
  if (typeof dependencies.runChild === "function") return dependencies.runChild(structuredClone(request));
  const spawnFn = dependencies.spawnFn ?? spawn;
  const child = spawnFn(process.execPath, [CHILD], { cwd: request.cwd, env: process.env, shell: false, detached: true, stdio: ["pipe", "pipe", "pipe"] });
  let stdoutBytes = 0; let stderrBytes = 0; const chunks = []; let overflow = false; let timedOut = false;
  let killTimer = null; let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    try { process.kill(-child.pid, "SIGTERM"); } catch { try { child.kill("SIGTERM"); } catch {} }
    killTimer = setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch { try { child.kill("SIGKILL"); } catch {} } }, 500);
  };
  child.stdout.on("data", (chunk) => { stdoutBytes += chunk.length; if (stdoutBytes <= MAX_BYTES) chunks.push(chunk); else { overflow = true; stop(); } });
  child.stderr.on("data", (chunk) => { stderrBytes += chunk.length; if (stderrBytes > MAX_BYTES) { overflow = true; stop(); } });
  const close = new Promise((resolveClose) => {
    child.once("error", (error) => resolveClose({ code: null, signal: null, error: error?.code ?? "spawn-error" }));
    child.once("close", (code, signal) => resolveClose({ code, signal, error: null }));
  });
  const timer = setTimeout(() => { timedOut = true; stop(); }, MAX_ELAPSED_MS);
  child.stdin.end(JSON.stringify(request));
  const terminal = await close;
  clearTimeout(timer);
  if (killTimer !== null) clearTimeout(killTimer);
  let result = null;
  if (!overflow) {
    const lines = Buffer.concat(chunks).toString("utf8").trim().split("\n").filter(Boolean);
    try { if (lines.length === 1) result = JSON.parse(lines[0]); } catch { result = null; }
  }
  return { result, terminal: { ...terminal, started: terminal.error === null, cleanup: terminal.error === null && terminal.signal === null ? "complete" : "incomplete" }, stdoutBytes, stderrBytes, overflow, timedOut };
}

function validateChild(result, selection, tuple, verdictSchema, terminal) {
  const observed = result?.observed;
  const lifecycle = { ...observed, stdoutBytes: terminal.stdoutBytes, stderrBytes: terminal.stderrBytes };
  if (!result || typeof result !== "object" || Array.isArray(result)) return { ok: false, code: "child-output-invalid", lifecycle };
  try { exactKeys(result, ["schema", "ok", "code", "answer", "observed"], "native child output"); } catch { return { ok: false, code: "child-output-invalid", lifecycle }; }
  if (result.schema !== "pipeline.codex-native-critic-app-server-child.v1") return { ok: false, code: "child-output-invalid", lifecycle };
  if (result.ok !== true || result.code !== "answered" || typeof result.answer !== "string") return { ok: false, code: result.code === "write-attempt" ? "child-write-attempt" : "child-output-invalid", lifecycle };
  exactKeys(observed, ["provider", "model", "effort", "initialized", "threadStarted", "turnStarted", "turnCompleted", "stdinEnded", "exitCode", "signal", "cleanup", "writeAttemptKind", "requestedNativePolicy", "requestedToolReduction", "observedThreadSandbox", "observedThreadReasoningEffort", "toolSurface"], "native child observation");
  exactKeys(observed.requestedNativePolicy, ["threadSandbox", "turn"], "native child requested policy");
  exactKeys(observed.requestedNativePolicy.turn, ["type", "networkAccess"], "native child requested turn policy");
  exactKeys(observed.observedThreadSandbox, ["type", "networkAccess"], "native child observed sandbox");
  exactKeys(observed.requestedToolReduction, ["featureConfigSha256", "mcpReductionCount", "mcpReductionConfigSha256"], "native child requested reduction");
  exactKeys(observed.toolSurface, ["configSha256", "observationSha256", "mcpReductionCount", "featureSnapshot", "mcpSnapshot", "snapshotLimitation"], "native child tool surface");
  for (const snapshot of [observed.toolSurface.featureSnapshot, observed.toolSurface.mcpSnapshot]) exactKeys(snapshot, ["pageCount", "dataCount", "digest"], "native child tool snapshot");
  const policyOk = equal(observed.requestedNativePolicy, { threadSandbox: "read-only", turn: NATIVE_CRITIC_POLICY.turn })
    && equal(observed.observedThreadSandbox, NATIVE_CRITIC_POLICY.turn)
    && observed.toolSurface.configSha256 === tuple.toolSurface.configSha256
    && observed.toolSurface.observationSha256 === tuple.toolSurface.observationSha256
    && observed.requestedToolReduction.featureConfigSha256 === NATIVE_CRITIC_REDUCING_CONFIG_SHA256
    && Number.isSafeInteger(observed.requestedToolReduction.mcpReductionCount) && observed.requestedToolReduction.mcpReductionCount >= 0
    && SHA256.test(observed.requestedToolReduction.mcpReductionConfigSha256)
    && observed.toolSurface.configSha256 === nativeCriticToolSurfaceConfigDigest({ dataCount: observed.requestedToolReduction.mcpReductionCount, configSha256: observed.requestedToolReduction.mcpReductionConfigSha256 })
    && Number.isSafeInteger(observed.toolSurface.featureSnapshot.pageCount) && observed.toolSurface.featureSnapshot.pageCount > 0
    && Number.isSafeInteger(observed.toolSurface.featureSnapshot.dataCount) && observed.toolSurface.featureSnapshot.dataCount >= NATIVE_CRITIC_PROHIBITED_FEATURES.length
    && Number.isSafeInteger(observed.toolSurface.mcpSnapshot.pageCount) && observed.toolSurface.mcpSnapshot.pageCount > 0
    && Number.isSafeInteger(observed.toolSurface.mcpReductionCount) && observed.toolSurface.mcpReductionCount >= 0
    && observed.toolSurface.mcpSnapshot.dataCount === observed.toolSurface.mcpReductionCount
    && observed.toolSurface.mcpReductionCount === observed.requestedToolReduction.mcpReductionCount
    && SHA256.test(observed.toolSurface.featureSnapshot.digest) && SHA256.test(observed.toolSurface.mcpSnapshot.digest)
    && observed.toolSurface.observationSha256 === nativeCriticToolSurfaceObservationDigest(observed.toolSurface.featureSnapshot, observed.toolSurface.mcpSnapshot)
    && observed.toolSurface.snapshotLimitation === "pre-turn thread configuration snapshot; not atomic with turn start";
  if (!policyOk) return { ok: false, code: "child-policy-invalid", lifecycle };
  const lifeOk = observed.provider === PROVIDER && observed.model === selection.route.model && observed.effort === selection.route.effort && observed.observedThreadReasoningEffort === selection.route.effort
    && observed.initialized === true && observed.threadStarted === true && observed.turnStarted === true && observed.turnCompleted === true && observed.stdinEnded === true
    && observed.exitCode === 0 && observed.signal === null && observed.cleanup === "complete" && observed.writeAttemptKind === null;
  if (!lifeOk) return { ok: false, code: "child-lifecycle-invalid", lifecycle };
  let verdict;
  try { verdict = JSON.parse(result.answer); } catch { return { ok: false, code: "child-verdict-invalid", lifecycle }; }
  if (!verdict || typeof verdict !== "object" || Array.isArray(verdict) || !validateAgainstSchema(verdict, verdictSchema).valid) return { ok: false, code: "child-verdict-invalid", lifecycle };
  return { ok: true, verdict, observed, lifecycle };
}

/**
 * Runs one selected native Critic child. Invalid inputs and unavailable host
 * proofs return a closed unavailable record; no legacy sandbox route exists.
 */
export async function invokeCodexNativeCriticHost(rawInput, dependencies = {}) {
  let input; let selection;
  try { input = validateInput(rawInput); selection = input.selection; }
  catch { return boundedFailure("input-invalid"); }
  const nowMs = dependencies.nowMs ?? Date.now();
  const resolveRoute = dependencies.resolveRoute ?? resolveCriticHighRiskRoute;
  try {
    const validateRoute = (route) => resolveRoute({ rootDir: realpathSync(input.repository.root), candidateCommit: input.selection.dispatch.candidateCommit, ...(dependencies.authorityDependencies ?? {}) });
    validateNativeCriticSelection(selection, { validateRoute, expectedTuple: input.expectedTuple, nowMs, maxSmokeAgeMs: dependencies.maxSmokeAgeMs ?? 300_000 });
  } catch { return boundedFailure("selection-invalid", selection); }
  let physical;
  try { physical = observePhysical(input, dependencies); }
  catch { return boundedFailure("physical-proof-unavailable", selection); }
  const request = {
    codexPath: physical.cliPath, cwd: physical.repoRoot, scratchPath: physical.scratch,
    model: selection.route.model, effort: selection.route.effort, referencePaths: physical.referencePaths,
    roleContractPath: physical.rolePath, promptContractPath: physical.promptPath, verdictSchemaPath: physical.verdictPath,
    candidateCommit: selection.dispatch.candidateCommit, candidateTree: selection.dispatch.candidateTree, reviewBase: input.reviewBase,
    sandboxMode: "native-tools-read-only",
  };
  let child;
  try { child = await runFixedChild(request, dependencies); }
  catch { return boundedFailure("child-spawn-failed", selection); }
  const terminal = childTerminal(child.terminal);
  const lifecycle = { ...(child.result?.observed ?? {}), stdoutBytes: child.stdoutBytes, stderrBytes: child.stderrBytes };
  if (child.timedOut) return boundedFailure("child-timeout", selection, terminal, lifecycle);
  if (child.overflow) return boundedFailure("child-stream-overflow", selection, terminal, lifecycle);
  if (child.terminal.error !== null || child.terminal.code !== 0 || child.terminal.signal !== null) return boundedFailure("child-terminal-invalid", selection, terminal, lifecycle);
  let verdictSchema;
  try { verdictSchema = JSON.parse(readFileSync(physical.verdictPath, "utf8")); }
  catch { return boundedFailure("physical-proof-unavailable", selection, terminal, lifecycle); }
  let checked;
  try { checked = validateChild(child.result, selection, input.expectedTuple, verdictSchema, { ...child, stdoutBytes: child.stdoutBytes, stderrBytes: child.stderrBytes }); }
  catch { return boundedFailure("child-output-invalid", selection, terminal, lifecycle); }
  if (!checked.ok) return boundedFailure(checked.code, selection, terminal, checked.lifecycle);
  const receipt = {
    schema: "pipeline.codex-native-critic-execution-receipt.v1",
    status: "reviewed",
    selectionId: selection.selectionId,
    selectionSha256: nativeCriticCanonicalDigest(selection),
    repoFingerprint: selection.repoFingerprint,
    dispatch: structuredClone(selection.dispatch),
    route: structuredClone(selection.route),
    tuple: structuredClone(input.expectedTuple),
    smokeReceiptSha256: selection.smokeReceiptSha256,
    requestedPolicy: structuredClone(NATIVE_CRITIC_POLICY),
    observed: structuredClone(checked.observed),
    terminal,
    verdictSha256: nativeCriticCanonicalDigest(checked.verdict),
    assurance: structuredClone(NATIVE_CRITIC_ASSURANCE),
  };
  return { schema: "pipeline.codex-native-critic-host-result.v1", status: "reviewed", verdict: checked.verdict, receipt };
}
