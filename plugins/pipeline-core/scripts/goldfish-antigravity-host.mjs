#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * E3's deliberately narrow, provider-free Goldfish-to-Antigravity seam.
 *
 * This is not an AGY discovery command.  It accepts an explicitly injected
 * fixture executable rooted in the candidate checkout, probes the repository
 * plugin contract through that executable, and then delegates exactly one
 * prepared packet to invokeAgy.  The boundary never discovers `agy`, reads
 * credentials, or makes a provider request on its own.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { AGY_ERROR_TAXONOMY, invokeAgy, parseAgyOutput } from "../lib/antigravity-execution-host.mjs";
import { ROLE_DISPATCH_PREFLIGHT_SCHEMA, ROLE_DISPATCH_REQUEST_SCHEMA, preflightRoleDispatch } from "../lib/role-dispatch-preflight.mjs";
import { validateControlPlacement } from "./control-placement.mjs";
import { validateRecord } from "./enforcement-conformance.mjs";

export const CROSS_RUNNER_DISPATCH_RECEIPT_SCHEMA = "pipeline.cross-runner-dispatch-receipt.v1";
export const E3_CODES = Object.freeze({
  PACKET: "E3-PACKET",
  FIXTURE_EXECUTABLE: "E3-FIXTURE-EXECUTABLE",
  PRECONDITION: "E3-PRECONDITION-UNAVAILABLE",
  RESULT_DESTINATION: "E3-RESULT-DESTINATION",
  RESULT_OCCUPIED: "E3-RESULT-OCCUPIED",
  PIPELINE_DISCOVERY: "E3-PIPELINE-DISCOVERY-UNAVAILABLE",
  PIPELINE_MARKER_MISSING: "E3-PIPELINE-MARKER-MISSING",
  PIPELINE_MARKER_MISMATCH: "E3-PIPELINE-MARKER-MISMATCH",
  PIPELINE_PROBE_MALFORMED: "E3-PIPELINE-PROBE-MALFORMED",
  COMPLETED: "E3-COMPLETED",
});

const PLUGIN_CONFIG_PATH = ".agents/plugins.json";
const PIPELINE_PLUGIN_PATH = "plugins/pipeline-core";
const HOST_PATH = "plugins/pipeline-core/scripts/goldfish-antigravity-host.mjs";
const RECEIPT_SCHEMA_PATH = "schemas/pipeline.cross-runner-dispatch-receipt.v1.json";
const E3_GATE_READBACK_PATH = "policies/alfred-e3-gate-readback.v1.json";
const A1_RECORD_PATH = "policies/enforcement-conformance.antigravity.json";
const A2_TABLE_PATH = "policies/control-placement.v1.json";
const A3_BASELINE_PATH = "plugins/pipeline-core/protected-baseline.json";
const A5_WRITER_PATH = "plugins/pipeline-core/scripts/pipeline-state.mjs";
const A5_STATE_PATH = "project/pipeline-state.json";
const MARKER_SCHEMA = "pipeline.antigravity-pipeline-start-marker.v1";
const SHA256 = /^[a-f0-9]{64}$/u;

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function isPlainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value, keys) {
  return isPlainObject(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}
function inRoot(root, path) {
  const rel = relative(root, path);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}
function resultPath(packet) {
  if (exactKeys(packet, ["candidate", "dispatchId", "prompt", "requiredPathSha256", "requiredPaths", "resultDestination", "role", "schema", "transport"])
    && exactKeys(packet.resultDestination, ["kind", "path"]) && packet.resultDestination.kind === "file") return packet.resultDestination.path;
  if (exactKeys(packet, ["candidate", "dispatchId", "prompt", "requiredPathSha256", "requiredPaths", "resultPath", "role", "schema", "transport"])) return packet.resultPath;
  return null;
}

function candidateFile(root, candidate, path, expectedSha256) {
  try {
    if (!SHA256.test(expectedSha256)) return null;
    const physical = resolve(root, path);
    if (!inRoot(resolve(root), physical) || !lstatSync(physical).isFile() || lstatSync(physical).isSymbolicLink()) return null;
    const current = readFileSync(physical);
    const blob = spawnSync("git", ["-C", root, "show", `${candidate.commit}:${path}`], { encoding: null, shell: false, timeout: 5_000, maxBuffer: 2 * 1024 * 1024 });
    return blob.status === 0 && Buffer.isBuffer(blob.stdout) && current.equals(blob.stdout) && sha256(current) === expectedSha256 ? current : null;
  } catch { return null; }
}
function boundFile(root, path, expectedSha256) {
  try {
    if (!SHA256.test(expectedSha256)) return null;
    const physical = resolve(root, path);
    if (!inRoot(resolve(root), physical) || !lstatSync(physical).isFile() || lstatSync(physical).isSymbolicLink()) return null;
    const bytes = readFileSync(physical);
    return sha256(bytes) === expectedSha256 ? bytes : null;
  } catch { return null; }
}
const GATE_PATHS = Object.freeze({
  a1: Object.freeze([A1_RECORD_PATH]),
  a2: Object.freeze([A2_TABLE_PATH]),
  a3: Object.freeze([A3_BASELINE_PATH]),
  a5: Object.freeze([A5_WRITER_PATH, A5_STATE_PATH]),
});
function canonicalGateRow(gates, id, status, nullDigests = false) {
  const row = gates?.[id];
  const expectedPaths = GATE_PATHS[id];
  if (!exactKeys(row, ["artifacts", "reasonCode", "status"]) || row.status !== status || typeof row.reasonCode !== "string" || row.reasonCode.length === 0
    || !Array.isArray(row.artifacts) || row.artifacts.length !== expectedPaths.length) return null;
  const artifacts = row.artifacts.map((artifact, index) => {
    if (!exactKeys(artifact, ["path", "sha256"]) || artifact.path !== expectedPaths[index] || (nullDigests ? artifact.sha256 !== null : !SHA256.test(artifact.sha256))) return null;
    return Object.freeze({ path: artifact.path, sha256: artifact.sha256 });
  });
  return artifacts.some((artifact) => artifact === null) ? null : Object.freeze({ status: row.status, reasonCode: row.reasonCode, artifacts: Object.freeze(artifacts) });
}

/**
 * Resolve the four E3 prerequisites from fixed, repository-owned readbacks.
 * Callers cannot supply, substitute, or upgrade this evidence in arguments.
 */
export function readE3GateState({ root, candidate } = {}) {
  try {
    const raw = readFileSync(join(root, E3_GATE_READBACK_PATH));
    const readback = JSON.parse(raw.toString("utf8"));
    if (!exactKeys(readback, ["candidate", "currentReadbackRule", "gates", "schema", "status"]) || readback.schema !== "pipeline.alfred-e3-gate-readback.v1" || typeof readback.currentReadbackRule !== "string" || readback.currentReadbackRule.length === 0 || !exactKeys(readback.gates, ["a1", "a2", "a3", "a5"])) throw new Error("readback shape is invalid");
    if (readback.status === "unavailable") {
      if (!exactKeys(readback.candidate, ["commit", "tree"]) || readback.candidate.commit !== null || readback.candidate.tree !== null
        || !canonicalGateRow(readback.gates, "a1", "unavailable", true) || !canonicalGateRow(readback.gates, "a2", "unavailable", true)
        || !canonicalGateRow(readback.gates, "a3", "unavailable", true) || !canonicalGateRow(readback.gates, "a5", "unavailable", true)) throw new Error("unavailable readback is malformed");
      return Object.freeze({ status: "unavailable", readbackSha256: sha256(raw) });
    }
    if (readback.status !== "current" || !exactKeys(readback.candidate, ["commit", "tree"]) || readback.candidate.commit !== candidate?.commit || readback.candidate.tree !== candidate?.tree) throw new Error("readback is missing or candidate-drifted");
    const a1Gate = canonicalGateRow(readback.gates, "a1", "current"), a2Gate = canonicalGateRow(readback.gates, "a2", "current"), a3Gate = canonicalGateRow(readback.gates, "a3", "current"), a5Gate = canonicalGateRow(readback.gates, "a5", "current");
    if (!a1Gate || !a2Gate || !a3Gate || !a5Gate) throw new Error("current readback gate is invalid");
    const a1Bytes = boundFile(root, A1_RECORD_PATH, a1Gate.artifacts[0].sha256);
    if (!a1Bytes) throw new Error("A1 record digest drifted");
    const a1 = JSON.parse(a1Bytes.toString("utf8"));
    validateRecord(a1);
    if (a1.runner.name !== "antigravity" || a1.layer !== "runner-hook" || a1.measurement.status !== "measured" || a1.evaluator.outcome !== "pass" || a1.staleness.status !== "current" || a1.candidate.commit !== candidate.commit || a1.candidate.tree !== candidate.tree) throw new Error("A1 record is not a current Antigravity measurement");

    const a2Bytes = candidateFile(root, candidate, A2_TABLE_PATH, a2Gate.artifacts[0].sha256);
    if (!a2Bytes) throw new Error("A2 table is not candidate-bound");
    const a2 = JSON.parse(a2Bytes.toString("utf8"));
    validateControlPlacement(a2);
    const e3Row = a2.controls.find((row) => row.controlId === "alfred:e3-cross-runner-agy-host");
    if (!e3Row || !e3Row.protects.includes(HOST_PATH) || !e3Row.protects.includes(RECEIPT_SCHEMA_PATH)
      || !e3Row.enforcedBy.includes("posthoc-verify") || e3Row.perRunnerStatus.find((row) => row.runner === "antigravity")?.status !== "enforced") throw new Error("A2 has no current E3 placement");

    const a3Bytes = candidateFile(root, candidate, A3_BASELINE_PATH, a3Gate.artifacts[0].sha256);
    if (!a3Bytes) throw new Error("A3 baseline is not candidate-bound");
    const a3 = JSON.parse(a3Bytes.toString("utf8"));
    if (!Array.isArray(a3.entries) || ![HOST_PATH, RECEIPT_SCHEMA_PATH].every((path) => a3.entries.some((entry) => typeof entry?.pathPattern === "string" && new RegExp(entry.pathPattern, "i").test(path)))) throw new Error("A3 does not cover E3 surfaces");

    if (!candidateFile(root, candidate, A5_WRITER_PATH, a5Gate.artifacts[0].sha256) || !boundFile(root, A5_STATE_PATH, a5Gate.artifacts[1].sha256)) throw new Error("A5 evidence is not bound");
    return Object.freeze({ status: "current", readbackSha256: sha256(raw), gates: Object.freeze({ a1: a1Gate, a2: a2Gate, a3: a3Gate, a5: a5Gate }) });
  } catch {
    return Object.freeze({ status: "unavailable", readbackSha256: null });
  }
}

function fixtureExecutable(root, executable) {
  if (typeof executable !== "string" || executable.length === 0) return null;
  try {
    const physicalRoot = realpathSync(root);
    const lexical = lstatSync(executable);
    const physicalExecutable = realpathSync(executable);
    const stat = lstatSync(physicalExecutable);
    return lexical.isFile() && !lexical.isSymbolicLink() && stat.isFile() && !stat.isSymbolicLink() && inRoot(physicalRoot, physicalExecutable) ? physicalExecutable : null;
  } catch { return null; }
}

function isCommandHook(hook) {
  return exactKeys(hook, ["command", "timeout", "type"])
    && hook.type === "command"
    && typeof hook.command === "string"
    && hook.command.length > 0
    && Number.isSafeInteger(hook.timeout)
    && hook.timeout > 0;
}

/**
 * Antigravity owns a namespaced manifest, unlike Claude's { hooks: ... }
 * layout. Keep this deliberately exact so a merely parseable JSON object
 * cannot establish the E3 pipeline-start precondition.
 */
function isSupportedAntigravityManifest(hooks) {
  if (!exactKeys(hooks, ["pipeline-core"])) return false;
  const pipelineCore = hooks["pipeline-core"];
  return exactKeys(pipelineCore, ["PreInvocation", "PreToolUse", "Stop", "enabled"])
    && pipelineCore.enabled === true
    && Array.isArray(pipelineCore.PreToolUse)
    && pipelineCore.PreToolUse.length > 0
    && pipelineCore.PreToolUse.every((entry) => exactKeys(entry, ["hooks", "matcher"])
      && typeof entry.matcher === "string"
      && entry.matcher.length > 0
      && Array.isArray(entry.hooks)
      && entry.hooks.length > 0
      && entry.hooks.every(isCommandHook))
    && [pipelineCore.Stop, pipelineCore.PreInvocation].every((entries) => Array.isArray(entries)
      && entries.length > 0
      && entries.every(isCommandHook));
}

function discovery(root) {
  try {
    const configBytes = readFileSync(join(root, PLUGIN_CONFIG_PATH));
    const config = JSON.parse(configBytes.toString("utf8"));
    if (!exactKeys(config, ["entries"]) || !Array.isArray(config.entries)
      || !config.entries.some((entry) => exactKeys(entry, ["path"]) && entry.path === PIPELINE_PLUGIN_PATH)) {
      throw new Error("pipeline plugin is not registered");
    }
    const pluginBytes = readFileSync(join(root, PIPELINE_PLUGIN_PATH, "plugin.json"));
    const plugin = JSON.parse(pluginBytes.toString("utf8"));
    const hooksBytes = readFileSync(join(root, PIPELINE_PLUGIN_PATH, "hooks.json"));
    const hooks = JSON.parse(hooksBytes.toString("utf8"));
    if (!isPlainObject(plugin) || typeof plugin.version !== "string" || plugin.version.length === 0 || !isSupportedAntigravityManifest(hooks)) {
      throw new Error("pipeline plugin manifest is invalid");
    }
    return {
      ok: true,
      pluginVersion: plugin.version,
      inputSha256: sha256(Buffer.concat([configBytes, pluginBytes, hooksBytes])),
    };
  } catch { return { ok: false }; }
}

/** Probe a fixture executable; configuration discovery alone is never measured. */
export function measureAntigravityPipelineStart({ root, executable, env = process.env, timeoutMs = 5_000 } = {}) {
  const discovered = discovery(root);
  if (!discovered.ok) return { status: "unavailable", code: E3_CODES.PIPELINE_DISCOVERY, inputSha256: null, outputSha256: null, probeCalls: 0 };
  const fixture = fixtureExecutable(root, executable);
  if (!fixture) return { status: "refused", code: E3_CODES.FIXTURE_EXECUTABLE, inputSha256: discovered.inputSha256, outputSha256: null, probeCalls: 0 };
  const result = spawnSync(fixture, ["--pipeline-start-probe", "--repo-root", root, "--plugin-root", join(root, PIPELINE_PLUGIN_PATH)], {
    cwd: root, env, encoding: "utf8", timeout: timeoutMs, shell: false, maxBuffer: 64 * 1024,
  });
  const stdout = String(result.stdout ?? "");
  const outputSha256 = sha256(stdout);
  if (result.error || result.status !== 0) return { status: "unavailable", code: E3_CODES.PIPELINE_MARKER_MISSING, inputSha256: discovered.inputSha256, outputSha256, probeCalls: 1 };
  if (stdout.trim() === "") return { status: "refused", code: E3_CODES.PIPELINE_MARKER_MISSING, inputSha256: discovered.inputSha256, outputSha256, probeCalls: 1 };
  let marker;
  try { marker = parseAgyOutput(stdout); } catch { return { status: "refused", code: E3_CODES.PIPELINE_PROBE_MALFORMED, inputSha256: discovered.inputSha256, outputSha256, probeCalls: 1 }; }
  if (!exactKeys(marker, ["pluginPath", "pluginVersion", "schema", "status"]) || marker.schema !== MARKER_SCHEMA || marker.status !== "ready") {
    return { status: "refused", code: E3_CODES.PIPELINE_MARKER_MISSING, inputSha256: discovered.inputSha256, outputSha256, probeCalls: 1 };
  }
  if (marker.pluginPath !== PIPELINE_PLUGIN_PATH || marker.pluginVersion !== discovered.pluginVersion) {
    return { status: "refused", code: E3_CODES.PIPELINE_MARKER_MISMATCH, inputSha256: discovered.inputSha256, outputSha256, probeCalls: 1 };
  }
  return { status: "measured", code: "E3-PIPELINE-MEASURED", inputSha256: discovered.inputSha256, outputSha256, probeCalls: 1 };
}

function terminalStatus(result) {
  if (result.ok === true) return "succeeded";
  if (result.code === AGY_ERROR_TAXONOMY.NOT_INSTALLED) return "unavailable";
  return "failed";
}
function receipt({ packet, requestedModel, gate, probe, result, resultDestination }) {
  return {
    schema: CROSS_RUNNER_DISPATCH_RECEIPT_SCHEMA,
    status: terminalStatus(result),
    code: result.ok === true ? E3_CODES.COMPLETED : result.code,
    binding: {
      candidate: structuredClone(packet.candidate), dispatchId: packet.dispatchId,
      requiredPathSha256: structuredClone(packet.requiredPathSha256), resultPath: resultDestination,
    },
    requestedModel,
    observedModel: result.observedModel ?? null,
    gate: structuredClone(gate),
    probe: { status: probe.status, code: probe.code, inputSha256: probe.inputSha256, outputSha256: probe.outputSha256 },
    launcherCalls: result.launcherCalls ?? 0,
    modelCalls: result.modelCalls ?? 0,
    probeCalls: probe.probeCalls,
    interruption: [AGY_ERROR_TAXONOMY.TIMEOUT, AGY_ERROR_TAXONOMY.CANCELLED].includes(result.code)
      ? { status: "unavailable", code: result.code } : null,
  };
}
function probeReceipt({ packet, requestedModel, gate, probe, resultDestination }) {
  return Object.freeze({
    ...receipt({ packet, requestedModel, gate, probe, result: { ok: false, code: probe.code, launcherCalls: 0, modelCalls: 0 }, resultDestination }),
    status: probe.status,
    code: probe.code,
  });
}
function refused(code, field) {
  return Object.freeze({ schema: ROLE_DISPATCH_PREFLIGHT_SCHEMA, status: "rejected", code, field, launcherCalls: 0, modelCalls: 0, probeCalls: 0 });
}

/**
 * One production caller.  `executable` is purposefully mandatory and must be
 * a regular fixture file underneath `root`; no AGY path discovery is exposed.
 */
export async function dispatchGoldfishToAntigravity({
  root,
  resultRoot,
  packet,
  executable,
  model,
  effort,
  timeoutMs = 300_000,
  env = process.env,
  signal,
} = {}) {
  if (typeof root !== "string" || typeof resultRoot !== "string" || typeof model !== "string" || model.trim() === "") return refused(E3_CODES.PACKET, "request");
  if (!packet || packet.schema !== ROLE_DISPATCH_REQUEST_SCHEMA || packet.transport !== "antigravity" || !/^pipeline-core:goldfish-[a-z0-9-]+$/u.test(packet.role)) return refused(E3_CODES.PACKET, "packet");
  const destination = resultPath(packet);
  if (typeof destination !== "string") return refused(E3_CODES.RESULT_DESTINATION, "resultDestination");
  const prepared = preflightRoleDispatch({ root, resultRoot, packet });
  if (prepared.status !== "prepared") return prepared;
  const gate = readE3GateState({ root, candidate: prepared.candidate });
  if (gate.status !== "current") return refused(E3_CODES.PRECONDITION, "canonical-gate-readback");
  const fixture = fixtureExecutable(root, executable);
  if (!fixture) return refused(E3_CODES.FIXTURE_EXECUTABLE, "executable");
  const probe = measureAntigravityPipelineStart({ root, executable: fixture, env });
  if (probe.status !== "measured") return probeReceipt({ packet: prepared.packet, requestedModel: model, gate, probe, resultDestination: destination });
  const result = await invokeAgy({ root, resultRoot, packet: prepared.packet, agyPath: fixture, model, effort, timeoutMs, env, signal });
  const terminal = receipt({ packet: prepared.packet, requestedModel: model, gate, probe, result, resultDestination: destination });
  try {
    const target = resolve(resultRoot, destination);
    writeFileSync(target, `${JSON.stringify(terminal)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  } catch {
    return Object.freeze({ ...terminal, status: "refused", code: E3_CODES.RESULT_OCCUPIED, persisted: false });
  }
  return Object.freeze({ ...terminal, persisted: true });
}

export async function runGoldfishAntigravityHostCli(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  if (!Array.isArray(argv) || argv.length !== 2 || argv[0] !== "--request" || typeof argv[1] !== "string" || argv[1].length === 0) {
    stderr.write("Usage: goldfish-antigravity-host.mjs --request <sealed-request.json>\n");
    return 64;
  }
  try {
    const requestPath = resolve(argv[1]);
    const stat = lstatSync(requestPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) throw new Error("request is not a regular bounded file");
    const request = JSON.parse(readFileSync(requestPath, "utf8"));
    if (!exactKeys(request, ["effort", "executable", "model", "packet", "resultRoot", "root", "timeoutMs"])) throw new Error("request shape is invalid");
    const result = await dispatchGoldfishToAntigravity(request);
    stdout.write(`${JSON.stringify(result)}\n`);
    return result.status === "succeeded" ? 0 : 1;
  } catch {
    stderr.write("goldfish-antigravity-host: sealed request refused\n");
    return 64;
  }
}

function directInvocation() { return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url); }
if (directInvocation()) {
  process.exitCode = await runGoldfishAntigravityHostCli(process.argv.slice(2));
}
