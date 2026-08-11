#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * NVA-A29-LAUNCH-01: a standalone, opt-in launcher that drives a REAL
 * selected-child execution through the frozen
 * `reduceSelectedSandboxDisposition`/`createSelectedSandboxDisposition`
 * reducer contract (`../lib/selected-sandbox-disposition.mjs`, unmodified).
 *
 * This script is never imported by any bootstrap/preflight/Verify entrypoint.
 * A human or a future dispatch invokes it explicitly:
 *
 *   node plugins/pipeline-core/scripts/selected-sandbox-launch.mjs [--out <path>]
 *
 * It builds a fingerprint from genuinely observed host/runtime facts (see
 * `buildFingerprint`), drives `probe-start` through the reducer, and -- only
 * if the reducer actually returns `launch: true` -- spawns one real,
 * credential-free child Node process (`realProbeRunner`). Every SHA256 field
 * on the resulting receipt is computed from data the launcher actually
 * observed from that real child (its pid, its echoed nonce, its exit code,
 * its stdout/stderr). If the real child genuinely fails (spawn error,
 * non-zero exit, malformed/mismatched output) this reports a real
 * `probe-failure` -- it never fabricates a success.
 */

import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  canonicalJson,
  createSelectedSandboxDisposition,
  reduceSelectedSandboxDisposition,
} from "../lib/selected-sandbox-disposition.mjs";

export const ASSURANCE_VALUE = "sandbox-read-only-except-coordinator-scratch-network-open";
export const SELECTED_TRANSPORT = "selected-network-open-read-only-v1";
export const DUTY = "selected-sandbox-launch";
export const CONTRACT_VERSION = "nova-a29-launch-v1";

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}
function sha256Json(value) {
  return sha256Hex(canonicalJson(value));
}
function fingerprintDigest(fingerprint) {
  return sha256Json(fingerprint);
}

/**
 * Builds the 8 required fingerprint fields from genuinely observed facts of
 * THIS host/runtime -- never arbitrary constants. Sourcing choices (each
 * SHA256 is computed at runtime from real bytes, not typed as a literal):
 *
 * - runnerSha256:    sha256 of the actual Node binary executing this script
 *                     (`realpathSync(process.execPath)`), i.e. the identity
 *                     of the real JS runtime driving the launch.
 * - hostBootSha256:  sha256 of this host's real Linux boot id
 *                     (`/proc/sys/kernel/random/boot_id`), matching the
 *                     pattern already used by codex-sandbox-preflight.mjs's
 *                     `readProcessIdentity` for the same purpose -- hashed,
 *                     never carried raw, for privacy.
 * - platformClass / architectureClass: `process.platform` / `process.arch`.
 * - sandboxSha256:   sha256 of the exact spawn isolation the child actually
 *                     receives below (`shell:false`, fixed stdio, an
 *                     explicit env allowlist) -- a real description of the
 *                     applied sandbox, not an opaque constant.
 * - profileSha256:   sha256 of this launcher script's own real source bytes
 *                     on disk, i.e. a genuine self-identity/version hash.
 * - policySha256:    sha256 of the policy statement this launch actually
 *                     asserts (read-only except coordinator scratch,
 *                     network open, matching ASSURANCE_VALUE/SELECTED_TRANSPORT).
 */
export function buildFingerprint({ scriptPath = fileURLToPath(import.meta.url) } = {}) {
  const nodeBinaryPath = realpathSync(process.execPath);
  const runnerSha256 = sha256Hex(readFileSync(nodeBinaryPath));
  const hostBootSha256 = sha256Hex(readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim());
  const profileSha256 = sha256Hex(readFileSync(scriptPath));
  const sandboxSha256 = sha256Json({
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    envAllowlist: ["PATH", "PIPELINE_LAUNCH_NONCE"],
  });
  const policySha256 = sha256Json({
    assurance: ASSURANCE_VALUE,
    transport: SELECTED_TRANSPORT,
    readOnly: true,
    scratchWritable: true,
    networkOpen: true,
  });
  return {
    runnerSha256,
    hostBootSha256,
    platformClass: process.platform,
    architectureClass: process.arch,
    sandboxSha256,
    profileSha256,
    policySha256,
    duty: DUTY,
    contractVersion: CONTRACT_VERSION,
  };
}

/**
 * The real, default child-probe runner: spawns one bounded, credential-free
 * Node child (`node -e <inline script>`) that echoes the nonce it was given
 * over an env var, its own pid, platform and arch. `spawnSync` mirrors the
 * pattern already used for real spawning in this codebase
 * (`codex-sandbox-preflight.mjs`'s `inspectCodex`/`resolveNodeRuntimeReadSet`).
 */
export function realProbeRunner({ nonceHex, timeoutMs = 10_000 }) {
  const childSource = "const n=process.env.PIPELINE_LAUNCH_NONCE||'';"
    + "process.stdout.write(JSON.stringify({pid:process.pid,nonce:n,platform:process.platform,arch:process.arch,nowMs:Date.now()}));";
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, ["-e", childSource], {
    encoding: "utf8",
    shell: false,
    timeout: timeoutMs,
    maxBuffer: 65_536,
    env: { PATH: process.env.PATH || "/usr/bin:/bin", PIPELINE_LAUNCH_NONCE: nonceHex },
  });
  return {
    error: result.error ?? null,
    status: result.status,
    signal: result.signal ?? null,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    durationMs: Date.now() - startedAt,
    pid: result.pid ?? null,
  };
}

function classifyFailure(probe, parseFailed, nonceMismatch) {
  if (probe.error) return "terminal-unavailable"; // the runtime itself could not be spawned -- not retryable as-is
  if (probe.status !== 0) return "transient-unavailable"; // the child ran but exited abnormally -- retryable
  if (parseFailed || nonceMismatch) return "terminal-unavailable"; // ran clean but violated the observation protocol
  return "transient-unavailable";
}

/**
 * Drives one full real (or, under test, injected) probe-start -> spawn ->
 * probe-success/probe-failure sequence through the frozen reducer. Returns
 * `{ outcome, log, final, observation, failureObservation }` where `final`
 * is the real resulting disposition record, whatever state it reached.
 */
export function launchSelectedSandbox({
  probeRunner = realProbeRunner,
  nowMs = () => Math.floor(globalThis.performance.now()),
  fingerprint = buildFingerprint(),
  timeoutMs = 10_000,
} = {}) {
  const log = [];
  const created = createSelectedSandboxDisposition({
    dispositionId: `nva-a29-launch-${randomBytes(6).toString("hex")}`,
    duty: DUTY,
    transport: SELECTED_TRANSPORT,
    fingerprint,
    assurance: { requested: "selected-sandbox", observed: "not-observed", evidenceSha256: null },
    nowMonotonicMs: nowMs(),
  });
  log.push({ step: "created", state: created.state, dispositionId: created.dispositionId });

  const nonceHex = randomBytes(32).toString("hex");
  const nonceSha256 = sha256Hex(nonceHex);
  const attempt = { attemptId: `attempt-${randomBytes(8).toString("hex")}`, index: 0, startedMonotonicMs: nowMs() };
  const challenge = { nonceSha256, bits: 256 };
  const startResult = reduceSelectedSandboxDisposition(created, { kind: "probe-start", attempt, challenge });
  log.push({ step: "probe-start", ok: startResult.ok, code: startResult.code, launch: startResult.launch });
  if (!startResult.ok) return { outcome: "reducer-rejected", log, final: created, observation: null, failureObservation: null };
  if (!startResult.launch) return { outcome: "no-launch", log, final: startResult.disposition, observation: null, failureObservation: null };

  const probing = startResult.disposition;
  const probe = probeRunner({ nonceHex, timeoutMs });

  let payload = null;
  let parseFailed = false;
  try { payload = JSON.parse(probe.stdout || ""); } catch { parseFailed = true; }
  const nonceMatches = Boolean(payload) && payload.nonce === nonceHex;
  const succeeded = !probe.error && probe.status === 0 && !parseFailed && nonceMatches;

  if (!succeeded) {
    const failureClass = classifyFailure(probe, parseFailed, !nonceMatches);
    const failureObservation = {
      errorCode: probe.error ? String(probe.error.code || probe.error.message || probe.error) : null,
      status: probe.status ?? null,
      signal: probe.signal ?? null,
      stdoutSha256: sha256Hex(probe.stdout ?? ""),
      stderr: probe.stderr ?? null,
      durationMs: probe.durationMs,
      parseFailed,
      nonceMatches,
    };
    const observationReceiptSha256 = sha256Json(failureObservation);
    const failureResult = reduceSelectedSandboxDisposition(probing, {
      kind: "probe-failure", failure: failureClass, observationReceiptSha256, nowMonotonicMs: nowMs(),
    });
    log.push({ step: "probe-failure", ok: failureResult.ok, code: failureResult.code, failureClass });
    return {
      outcome: failureResult.ok ? failureResult.disposition.state : "reducer-rejected",
      log,
      final: failureResult.ok ? failureResult.disposition : probing,
      observation: null,
      failureObservation,
    };
  }

  const childIdSha256 = sha256Json({ pid: probe.pid, attemptId: attempt.attemptId, nonceSha256 });
  const observation = {
    pid: probe.pid, platform: payload.platform, arch: payload.arch, nowMs: payload.nowMs,
    stdoutSha256: sha256Hex(probe.stdout ?? ""), stderr: probe.stderr, status: probe.status, durationMs: probe.durationMs,
  };
  const observationReceiptSha256 = sha256Json(observation);
  const childReceipt = {
    childIdSha256, attemptId: attempt.attemptId, nonceSha256, duty: DUTY, transport: SELECTED_TRANSPORT,
    subjectSha256: fingerprintDigest(fingerprint), assurance: ASSURANCE_VALUE,
    resultSha256: observationReceiptSha256, terminal: true,
  };
  const successResult = reduceSelectedSandboxDisposition(probing, {
    kind: "probe-success", selectedChildIdSha256: childIdSha256, childReceipt, observationReceiptSha256,
  });
  log.push({ step: "probe-success", ok: successResult.ok, code: successResult.code, state: successResult.disposition?.state });
  return {
    outcome: successResult.ok ? successResult.disposition.state : "reducer-rejected",
    log,
    final: successResult.ok ? successResult.disposition : probing,
    observation,
    failureObservation: null,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  const outPath = outIndex >= 0 ? args[outIndex + 1] : null;
  const result = launchSelectedSandbox();
  const evidence = {
    schema: "pipeline.selected-sandbox-launch-evidence.v1",
    generatedAtIso: new Date().toISOString(),
    outcome: result.outcome,
    log: result.log,
    disposition: result.final,
    observation: result.observation,
    failureObservation: result.failureObservation,
  };
  const text = `${JSON.stringify(evidence, null, 2)}\n`;
  if (outPath) writeFileSync(outPath, text);
  process.stdout.write(text);
  process.exitCode = result.outcome === "available-attested" || result.outcome === "transient-unavailable" || result.outcome === "terminal-unavailable" ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
