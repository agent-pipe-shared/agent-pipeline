#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  chmodSync,
  closeSync,
  fsyncSync,
  lstatSync,
  openSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";

export const DIAGNOSIS_SCHEMA = "pipeline.public-baseline-diagnosis.v1";
export const HOST_SCHEMA = "pipeline.public-baseline-host-calibration.v1";
export const TOOLCHAIN_SCHEMA = "pipeline.toolchain-preflight-receipt.v1";
export const CAPS = Object.freeze({ firstStepMs: 60_000, noProgressMs: 180_000, outerMs: 900_000 });
export const EXECUTION_SCHEMA = "pipeline.public-baseline-process-run.v1";
export const PROCESS_CAPS = Object.freeze({
  ...CAPS,
  terminateGraceMs: 2_000,
  maxOutputTailBytes: 32_768,
  maxEvents: 4_096,
  maxSemanticLineBytes: 8_192,
});
export const FULL_VERIFY_COMMAND = Object.freeze(["node", "harness/scripts/verify.mjs"]);
const HEX40_64 = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const HEX64 = /^[0-9a-f]{64}$/;
const INPUT_KEYS = ["repositoryFingerprint", "remoteFingerprint", "ref", "commit", "tree", "commandDigest", "toolchain", "hostCalibration", "attempts", "verify", "security", "priorEvidence"];
const VERIFY_KEYS = ["exitCode", "signal", "firstStepTimedOut", "noProgressTimedOut", "outerTimedOut", "productStepStarted", "hostClassifier", "hostClassifierEvidenceDigest", "productVerdict", "focused", "failureSignature", "eventsDigest", "outputTailDigest"];
const RECORD_KEYS = ["schema", "classification", "reason", "caps", "repositoryFingerprint", "remoteFingerprint", "ref", "commit", "tree", "commandDigest", "toolchainReceiptDigest", "hostCalibrationReceiptDigest", "attemptsDigest", "verifyEventsDigest", "securityArtifactDigest", "outputTailDigest", "priorEvidenceStatus", "priorSourceDigest", "failureSignature", "recordDigest"];
const PROCESS_KEYS = ["schema", "caps", "fullVerify", "focused", "confirmationAttempted", "requiredToolsReady", "runDigest"];
const COMMAND_KEYS = ["kind", "commandDigest", "status", "startedAt", "endedAt", "durationMs", "events", "exitCode", "signal", "spawnError", "productStepStarted", "failureSignatureDigest", "outputTailDigest", "receiptDigest"];
const EVENT_KEYS = ["sequence", "type", "elapsedMs", "stepDigest", "stream", "contentDigest", "byteLength"];
const PROCESS_STATUSES = new Set(["completed", "first-step-timeout", "no-progress-timeout", "outer-timeout", "event-overflow", "spawn-error"]);
const EVENT_TYPES = new Set(["process-start", "step-start", "step-progress", "step-end", "process-end", "process-stop"]);
const SIGNALS = new Set([null, "SIGTERM", "SIGKILL", "OTHER"]);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
const sha = (value) => createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");
export const diagnosisDigest = sha;
function assertKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} invalid`);
  const actual = Object.keys(value).sort(), wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new Error(`${label} keys invalid`);
}
function assertHex(value, label, exact64 = false) { if (!(exact64 ? HEX64 : HEX40_64).test(value ?? "")) throw new Error(`${label} invalid`); }

function validateInput(input) {
  assertKeys(input, INPUT_KEYS, "diagnosis input");
  for (const key of ["repositoryFingerprint", "remoteFingerprint", "commandDigest"]) assertHex(input[key], key, true);
  for (const key of ["commit", "tree"]) assertHex(input[key], key);
  if (!/^refs\/heads\/[A-Za-z0-9._/-]+$/.test(input.ref) || input.ref.includes("..")) throw new Error("ref invalid");
  assertKeys(input.toolchain, ["schema", "status", "receiptPath", "rawDigest", "missing", "scanners"], "toolchain");
  if (input.toolchain.schema !== TOOLCHAIN_SCHEMA || !new Set(["ready", "blocked"]).has(input.toolchain.status) || typeof input.toolchain.receiptPath !== "string" || !Array.isArray(input.toolchain.missing) || !Array.isArray(input.toolchain.scanners)) throw new Error("toolchain invalid");
  assertHex(input.toolchain.rawDigest, "toolchain.rawDigest", true);
  input.toolchain.scanners.forEach((scanner) => { assertKeys(scanner, ["id", "status"], "scanner"); if (typeof scanner.id !== "string" || !new Set(["PASS", "FAIL", "SKIPPED", "ERROR"]).has(scanner.status)) throw new Error("scanner invalid"); });
  assertKeys(input.hostCalibration, ["schema", "status", "receiptPath", "rawDigest", "node", "git", "platform", "filesystem", "controlsDigest"], "host calibration");
  if (input.hostCalibration.schema !== HOST_SCHEMA || !new Set(["ready", "blocked"]).has(input.hostCalibration.status)) throw new Error("host calibration invalid");
  for (const key of ["rawDigest", "controlsDigest"]) assertHex(input.hostCalibration[key], `hostCalibration.${key}`, true);
  for (const key of ["receiptPath", "node", "git", "platform", "filesystem"]) if (typeof input.hostCalibration[key] !== "string" || input.hostCalibration[key] === "") throw new Error(`hostCalibration.${key} invalid`);
  if (!Array.isArray(input.attempts) || input.attempts.length < 1 || input.attempts.length > 2) throw new Error("attempt count invalid");
  input.attempts.forEach((attempt) => { assertKeys(attempt, ["id", "startedAt", "endedAt", "failureSignature"], "attempt"); if (typeof attempt.id !== "string" || !Number.isSafeInteger(attempt.startedAt) || !Number.isSafeInteger(attempt.endedAt) || attempt.endedAt < attempt.startedAt || (attempt.failureSignature !== null && !HEX64.test(attempt.failureSignature))) throw new Error("attempt invalid"); });
  assertKeys(input.verify, VERIFY_KEYS, "verify");
  if (![null, 0, 1, 2].includes(input.verify.exitCode) || ![null, "SIGTERM", "SIGKILL"].includes(input.verify.signal)) throw new Error("verify termination invalid");
  for (const key of ["firstStepTimedOut", "noProgressTimedOut", "outerTimedOut", "productStepStarted"]) if (typeof input.verify[key] !== "boolean") throw new Error(`verify.${key} invalid`);
  for (const key of ["eventsDigest", "outputTailDigest"]) assertHex(input.verify[key], `verify.${key}`, true);
  if (![null, "trusted-environment"].includes(input.verify.hostClassifier) || ![null, "PASS", "FAIL", "ERROR"].includes(input.verify.productVerdict)) throw new Error("verify classifier/verdict invalid");
  if (input.verify.hostClassifier === "trusted-environment" ? !HEX64.test(input.verify.hostClassifierEvidenceDigest ?? "") : input.verify.hostClassifierEvidenceDigest !== null) throw new Error("host classifier evidence invalid");
  if (input.verify.failureSignature !== null && (typeof input.verify.failureSignature !== "string" || input.verify.failureSignature.length > 500)) throw new Error("failure signature invalid");
  if (input.verify.focused !== null) {
    assertKeys(input.verify.focused, ["exitCode", "requiredToolsReady", "commandDigest", "failureSignature", "productStep"], "focused reproduction");
    if (!Number.isInteger(input.verify.focused.exitCode) || typeof input.verify.focused.requiredToolsReady !== "boolean" || typeof input.verify.focused.failureSignature !== "string" || input.verify.focused.failureSignature === "" || typeof input.verify.focused.productStep !== "string" || input.verify.focused.productStep === "") throw new Error("focused reproduction invalid");
    assertHex(input.verify.focused.commandDigest, "focused.commandDigest", true);
  }
  if (input.security !== null) {
    assertKeys(input.security, ["path", "rawDigest", "commit", "tree", "adapters"], "security");
    if (typeof input.security.path !== "string" || !Array.isArray(input.security.adapters)) throw new Error("security invalid");
    assertHex(input.security.rawDigest, "security.rawDigest", true);
    assertHex(input.security.commit, "security.commit");
    assertHex(input.security.tree, "security.tree");
    input.security.adapters.forEach((adapter) => { assertKeys(adapter, ["id", "status"], "security adapter"); if (!new Set(["PASS", "FAIL", "SKIPPED", "ERROR"]).has(adapter.status)) throw new Error("security adapter invalid"); });
  }
  assertKeys(input.priorEvidence, ["status", "stormSourceDigest"], "prior evidence");
  if (!new Set(["available", "unavailable"]).has(input.priorEvidence.status)) throw new Error("prior evidence invalid");
  assertHex(input.priorEvidence.stormSourceDigest, "priorEvidence.stormSourceDigest", true);
}

function validBoundSecurity(value, commit, tree) {
  return value && value.commit === commit && value.tree === tree && value.adapters.length > 0 && value.adapters.every((adapter) => adapter.status === "PASS");
}

export function classifyPublicBaseline(input) {
  try { validateInput(input); } catch (error) { return { classification: "ambiguous", reason: `invalid-contract:${error.message}` }; }
  if (input.hostCalibration.status !== "ready") return { classification: "ambiguous", reason: "host-calibration-invalid" };
  if (input.toolchain.status !== "ready" || input.toolchain.missing.length || input.toolchain.scanners.length === 0 || input.toolchain.scanners.some((scanner) => scanner.status !== "PASS")) return { classification: "ambiguous", reason: "required-tool-unavailable" };
  const verify = input.verify;
  if (verify.outerTimedOut) return { classification: "ambiguous", reason: "outer-timeout" };
  if (verify.noProgressTimedOut) return { classification: "ambiguous", reason: "no-progress-timeout" };
  if (verify.firstStepTimedOut) return { classification: "ambiguous", reason: "first-step-timeout" };
  if (verify.exitCode === 0 && verify.signal === null) {
    if (!validBoundSecurity(input.security, input.commit, input.tree)) return { classification: "ambiguous", reason: "security-evidence-invalid" };
    return { classification: "not-reproduced", reason: "green-exact-rerun" };
  }
  if (verify.productStepStarted === false && verify.hostClassifier === "trusted-environment" && verify.productVerdict === null) return { classification: "environment-confirmed", reason: "pre-product-host-failure" };
  const normalizedFailure = (value) => typeof value === "string" ? sha(value.trim().toLowerCase()) : null;
  if (verify.productStepStarted === true && verify.focused?.exitCode !== 0 && verify.focused?.requiredToolsReady === true && normalizedFailure(verify.focused.failureSignature) === normalizedFailure(verify.failureSignature) && normalizedFailure(verify.failureSignature) !== null) return { classification: "product-confirmed", reason: "focused-reproduction" };
  return { classification: "ambiguous", reason: "mixed-or-untrusted-evidence" };
}

export function buildDiagnosis(input) {
  validateInput(input);
  const result = classifyPublicBaseline(input);
  const record = {
    schema: DIAGNOSIS_SCHEMA, ...result, caps: CAPS,
    repositoryFingerprint: input.repositoryFingerprint, remoteFingerprint: input.remoteFingerprint,
    ref: input.ref, commit: input.commit, tree: input.tree, commandDigest: input.commandDigest,
    toolchainReceiptDigest: input.toolchain.rawDigest, hostCalibrationReceiptDigest: input.hostCalibration.rawDigest,
    attemptsDigest: sha(input.attempts), verifyEventsDigest: input.verify.eventsDigest,
    securityArtifactDigest: input.security?.rawDigest ?? null, outputTailDigest: input.verify.outputTailDigest,
    priorEvidenceStatus: input.priorEvidence.status, priorSourceDigest: input.priorEvidence.stormSourceDigest,
    failureSignature: input.verify.failureSignature === null ? null : sha(input.verify.failureSignature.trim().toLowerCase()),
    recordDigest: null,
  };
  record.recordDigest = sha(record);
  validateDiagnosis(record);
  return record;
}

export function validateDiagnosis(record) {
  assertKeys(record, RECORD_KEYS, "diagnosis record");
  if (record.schema !== DIAGNOSIS_SCHEMA || !new Set(["not-reproduced", "environment-confirmed", "product-confirmed", "ambiguous"]).has(record.classification) || canonical(record.caps) !== canonical(CAPS)) throw new Error("diagnosis record invalid");
  for (const key of ["repositoryFingerprint", "remoteFingerprint", "commandDigest", "toolchainReceiptDigest", "hostCalibrationReceiptDigest", "attemptsDigest", "verifyEventsDigest", "outputTailDigest", "priorSourceDigest"]) assertHex(record[key], key, true);
  if (record.securityArtifactDigest !== null) assertHex(record.securityArtifactDigest, "securityArtifactDigest", true);
  if (record.failureSignature !== null) assertHex(record.failureSignature, "failureSignature", true);
  if (record.recordDigest !== sha({ ...record, recordDigest: null })) throw new Error("diagnosis record digest mismatch");
  return true;
}

export function mayConfirmAgain(priorAttempts, signature) {
  if (!Array.isArray(priorAttempts) || !HEX64.test(signature ?? "")) return false;
  return priorAttempts.filter((attempt) => attempt?.failureSignature === signature).length < 2;
}

function safeProcessEnvironment(source = process.env) {
  const result = { CI: "1", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" };
  for (const key of ["PATH", "LANG", "LC_ALL", "TMPDIR", "SYSTEMROOT", "WINDIR", "PATHEXT"]) {
    if (typeof source[key] === "string") result[key] = source[key];
  }
  return result;
}

function normalizeSignal(signal) {
  if (signal === null || signal === undefined) return null;
  return signal === "SIGTERM" || signal === "SIGKILL" ? signal : "OTHER";
}

function normalizeSpawnError(error) {
  if (error?.code === "ENOENT") return "binary-unavailable";
  if (error?.code === "EACCES" || error?.code === "EPERM") return "permission-denied";
  if (error?.code === "ENOMEM" || error?.code === "EAGAIN") return "resource-exhausted";
  return "unknown";
}

function normalizeFailureLine(value) {
  return value
    .replaceAll("\\", "/")
    .replace(/(?:[A-Za-z]:)?\/(?:[^\s:()]+\/)+[^\s:()]*/g, "<path>")
    .replace(/\b\d{4}-\d\d-\d\d[T ][0-9:.+-]+Z?\b/g, "<time>")
    .replace(/\b[0-9a-f]{16,}\b/gi, "<hex>")
    .replace(/:\d+(?::\d+)?\b/g, ":<line>")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function commandDefinition(rootDir, kind, focusedRelativeFile) {
  if (kind === "full-verify") {
    const script = resolve(rootDir, FULL_VERIFY_COMMAND[1]);
    const real = realpathSync(script);
    const realRel = relative(rootDir, real);
    if (realRel === "" || realRel === ".." || realRel.startsWith(`..${sep}`)) throw new Error("full verify entry resolves outside repository");
    const info = lstatSync(script);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("full verify entry is not a regular file");
    return { executable: process.execPath, args: [real], portable: FULL_VERIFY_COMMAND };
  }
  if (kind !== "focused") throw new Error("command kind invalid");
  if (typeof focusedRelativeFile !== "string" || focusedRelativeFile === "" || isAbsolute(focusedRelativeFile)) throw new Error("focused file must be repository-relative");
  const candidate = resolve(rootDir, focusedRelativeFile);
  const rel = relative(rootDir, candidate);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`)) throw new Error("focused file escapes repository");
  const real = realpathSync(candidate);
  const realRel = relative(rootDir, real);
  if (realRel === "" || realRel === ".." || realRel.startsWith(`..${sep}`)) throw new Error("focused file resolves outside repository");
  const info = lstatSync(candidate);
  if (!info.isFile() || info.isSymbolicLink() || !realRel.endsWith(".mjs")) throw new Error("focused file is not a regular .mjs file");
  const portable = Object.freeze(["node", realRel.split(sep).join("/")]);
  return { executable: process.execPath, args: [real], portable };
}

function appendTail(existing, chunk) {
  const combined = existing.length === 0 ? Buffer.from(chunk) : Buffer.concat([existing, chunk]);
  return combined.length <= PROCESS_CAPS.maxOutputTailBytes
    ? combined
    : combined.subarray(combined.length - PROCESS_CAPS.maxOutputTailBytes);
}

function killOwnedProcessGroup(child, signal, killFn) {
  if (!Number.isSafeInteger(child?.pid) || child.pid <= 0) return;
  try {
    if (process.platform === "win32") killFn(child.pid, signal);
    else killFn(-child.pid, signal);
  } catch {
    // A process that already exited needs no cleanup. Never widen the target.
  }
}

function validateCommandReceipt(receipt) {
  assertKeys(receipt, COMMAND_KEYS, "process receipt");
  if (!new Set(["full-verify", "focused"]).has(receipt.kind) || !PROCESS_STATUSES.has(receipt.status)) throw new Error("process receipt identity invalid");
  assertHex(receipt.commandDigest, "process commandDigest", true);
  if (!Number.isSafeInteger(receipt.startedAt) || !Number.isSafeInteger(receipt.endedAt) || receipt.endedAt < receipt.startedAt || receipt.durationMs !== receipt.endedAt - receipt.startedAt) throw new Error("process receipt time invalid");
  if (!Array.isArray(receipt.events) || receipt.events.length < 2 || receipt.events.length > PROCESS_CAPS.maxEvents) throw new Error("process receipt events invalid");
  receipt.events.forEach((event, index) => {
    assertKeys(event, EVENT_KEYS, "process event");
    if (event.sequence !== index + 1 || !EVENT_TYPES.has(event.type) || !Number.isSafeInteger(event.elapsedMs) || event.elapsedMs < 0 || (event.stepDigest !== null && !HEX64.test(event.stepDigest)) || !new Set([null, "stdout", "stderr"]).has(event.stream) || (event.contentDigest !== null && !HEX64.test(event.contentDigest)) || !Number.isSafeInteger(event.byteLength) || event.byteLength < 0) throw new Error("process event invalid");
  });
  if (!(receipt.exitCode === null || (Number.isSafeInteger(receipt.exitCode) && receipt.exitCode >= 0)) || !SIGNALS.has(receipt.signal) || !new Set([null, "binary-unavailable", "permission-denied", "resource-exhausted", "unknown"]).has(receipt.spawnError) || typeof receipt.productStepStarted !== "boolean") throw new Error("process termination invalid");
  if (receipt.failureSignatureDigest !== null) assertHex(receipt.failureSignatureDigest, "failureSignatureDigest", true);
  assertHex(receipt.outputTailDigest, "process outputTailDigest", true);
  if (receipt.receiptDigest !== sha({ ...receipt, receiptDigest: null })) throw new Error("process receipt digest mismatch");
  return true;
}

export function validateProcessRun(receipt) {
  assertKeys(receipt, PROCESS_KEYS, "process run");
  if (receipt.schema !== EXECUTION_SCHEMA || canonical(receipt.caps) !== canonical(PROCESS_CAPS) || typeof receipt.confirmationAttempted !== "boolean" || typeof receipt.requiredToolsReady !== "boolean") throw new Error("process run invalid");
  validateCommandReceipt(receipt.fullVerify);
  if (receipt.focused !== null) validateCommandReceipt(receipt.focused);
  if (receipt.confirmationAttempted !== (receipt.focused !== null)) throw new Error("confirmation state invalid");
  if (receipt.focused !== null && (!receipt.requiredToolsReady || receipt.fullVerify.status !== "completed" || receipt.fullVerify.exitCode === 0 || receipt.fullVerify.productStepStarted !== true)) throw new Error("focused execution precondition invalid");
  if (receipt.runDigest !== sha({ ...receipt, runDigest: null })) throw new Error("process run digest mismatch");
  return true;
}

/**
 * Execute one fixed E0 command without a shell. Dependencies exist only to make
 * process/timer boundaries fault-injectable; they cannot alter budgets or argv.
 */
export async function runPublicBaselineCommand({ rootDir, kind, focusedRelativeFile = null }, deps = {}) {
  const root = realpathSync(resolve(rootDir));
  const command = commandDefinition(root, kind, focusedRelativeFile);
  const spawnFn = deps.spawnFn ?? spawn;
  const setTimeoutFn = deps.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = deps.clearTimeoutFn ?? clearTimeout;
  const nowFn = deps.nowFn ?? Date.now;
  const killFn = deps.killFn ?? process.kill.bind(process);
  const startedAt = nowFn();
  if (!Number.isSafeInteger(startedAt)) throw new Error("clock returned an invalid time");

  return new Promise((resolveReceipt) => {
    let child = null;
    let settled = false;
    let stopReason = null;
    let activeStep = null;
    let productStepStarted = false;
    let outputTail = Buffer.alloc(0);
    let failureLines = [];
    let eventOverflow = false;
    const events = [];
    const timers = { first: null, progress: null, outer: null, grace: null };
    const decoders = { stdout: new StringDecoder("utf8"), stderr: new StringDecoder("utf8") };
    const pending = { stdout: "", stderr: "" };

    const elapsed = () => Math.max(0, nowFn() - startedAt);
    const event = (type, { stepDigest = null, stream = null, contentDigest = null, byteLength = 0 } = {}) => {
      if (events.length >= PROCESS_CAPS.maxEvents) {
        eventOverflow = true;
        return false;
      }
      events.push({ sequence: events.length + 1, type, elapsedMs: elapsed(), stepDigest, stream, contentDigest, byteLength });
      return true;
    };
    const clear = (key) => { if (timers[key] !== null) clearTimeoutFn(timers[key]); timers[key] = null; };
    const clearAll = () => { for (const key of Object.keys(timers)) clear(key); };
    const requestStop = (reason) => {
      if (stopReason !== null || settled) return;
      stopReason = reason;
      event("process-stop", { contentDigest: sha(reason), byteLength: Buffer.byteLength(reason) });
      killOwnedProcessGroup(child, "SIGTERM", killFn);
      timers.grace = setTimeoutFn(() => killOwnedProcessGroup(child, "SIGKILL", killFn), PROCESS_CAPS.terminateGraceMs);
    };
    const armProgress = () => {
      clear("progress");
      timers.progress = setTimeoutFn(() => requestStop("no-progress-timeout"), PROCESS_CAPS.noProgressMs);
    };
    const semanticLine = (line, stream) => {
      const bounded = Buffer.from(line).subarray(0, PROCESS_CAPS.maxSemanticLineBytes).toString("utf8");
      const normalized = normalizeFailureLine(bounded);
      if (normalized === "") return;
      const stepMatch = bounded.match(/^\s*===\s+([A-Za-z0-9._-]+)\s+\(/);
      if (stepMatch) {
        if (activeStep !== null) event("step-end", { stepDigest: activeStep });
        activeStep = sha(stepMatch[1]);
        productStepStarted = true;
        clear("first");
        event("step-start", { stepDigest: activeStep, stream, contentDigest: sha(normalized), byteLength: Buffer.byteLength(bounded) });
      } else if (activeStep !== null) {
        event("step-progress", { stepDigest: activeStep, stream, contentDigest: sha(normalized), byteLength: Buffer.byteLength(bounded) });
      }
      if (activeStep !== null) armProgress();
      if (/\b(?:fail(?:ed|ure)?|error|assertion)\b/i.test(normalized)) failureLines = [...failureLines.slice(-31), normalized];
      if (eventOverflow) requestStop("event-overflow");
    };
    const consume = (chunk, stream) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      outputTail = appendTail(outputTail, bytes);
      pending[stream] += decoders[stream].write(bytes);
      while (pending[stream].includes("\n")) {
        const index = pending[stream].indexOf("\n");
        const line = pending[stream].slice(0, index).replace(/\r$/, "");
        pending[stream] = pending[stream].slice(index + 1);
        semanticLine(line, stream);
      }
      while (Buffer.byteLength(pending[stream]) > PROCESS_CAPS.maxSemanticLineBytes) {
        const part = pending[stream].slice(0, PROCESS_CAPS.maxSemanticLineBytes);
        pending[stream] = pending[stream].slice(PROCESS_CAPS.maxSemanticLineBytes);
        semanticLine(part, stream);
      }
    };
    const finish = (exitCode, signal, spawnError = null) => {
      if (settled) return;
      settled = true;
      clearAll();
      for (const stream of ["stdout", "stderr"]) {
        pending[stream] += decoders[stream].end();
        if (pending[stream] !== "") semanticLine(pending[stream], stream);
      }
      if (activeStep !== null) event("step-end", { stepDigest: activeStep });
      event("process-end", { contentDigest: sha(`${exitCode ?? "null"}:${signal ?? "null"}`) });
      const endedAt = nowFn();
      const status = eventOverflow ? "event-overflow" : stopReason ?? (spawnError === null ? "completed" : "spawn-error");
      const signatureSource = failureLines.length > 0 ? failureLines.join("\n") : outputTail.length > 0 ? normalizeFailureLine(outputTail.toString("utf8")) : "";
      const receipt = {
        kind,
        commandDigest: sha(command.portable),
        status,
        startedAt,
        endedAt,
        durationMs: endedAt - startedAt,
        events,
        exitCode: Number.isSafeInteger(exitCode) ? exitCode : null,
        signal: normalizeSignal(signal),
        spawnError,
        productStepStarted,
        failureSignatureDigest: Number.isSafeInteger(exitCode) && exitCode === 0 && status === "completed" ? null : signatureSource === "" ? null : sha(signatureSource),
        outputTailDigest: sha(outputTail),
        receiptDigest: null,
      };
      receipt.receiptDigest = sha(receipt);
      validateCommandReceipt(receipt);
      resolveReceipt(receipt);
    };

    try {
      child = spawnFn(command.executable, command.args, {
        cwd: root,
        shell: false,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
        env: safeProcessEnvironment(deps.environment ?? process.env),
      });
      event("process-start", { contentDigest: sha(command.portable) });
      timers.first = setTimeoutFn(() => requestStop("first-step-timeout"), PROCESS_CAPS.firstStepMs);
      timers.outer = setTimeoutFn(() => requestStop("outer-timeout"), PROCESS_CAPS.outerMs);
      child.stdout?.on("data", (chunk) => consume(chunk, "stdout"));
      child.stderr?.on("data", (chunk) => consume(chunk, "stderr"));
      child.once("error", (error) => finish(null, null, normalizeSpawnError(error)));
      child.once("close", (code, signal) => finish(code, signal));
    } catch (error) {
      event("process-start", { contentDigest: sha(command.portable) });
      finish(null, null, normalizeSpawnError(error));
    }
  });
}

export async function runPublicBaselineProcesses({ rootDir, focusedRelativeFile = null, requiredToolsReady = false }, deps = {}) {
  if (typeof requiredToolsReady !== "boolean") throw new Error("requiredToolsReady must be boolean");
  const fullVerify = await runPublicBaselineCommand({ rootDir, kind: "full-verify" }, deps);
  const mayRunFocused = focusedRelativeFile !== null
    && requiredToolsReady
    && fullVerify.status === "completed"
    && Number.isSafeInteger(fullVerify.exitCode)
    && fullVerify.exitCode > 0
    && fullVerify.productStepStarted;
  const focused = mayRunFocused
    ? await runPublicBaselineCommand({ rootDir, kind: "focused", focusedRelativeFile }, deps)
    : null;
  const receipt = {
    schema: EXECUTION_SCHEMA,
    caps: PROCESS_CAPS,
    fullVerify,
    focused,
    confirmationAttempted: focused !== null,
    requiredToolsReady,
    runDigest: null,
  };
  receipt.runDigest = sha(receipt);
  validateProcessRun(receipt);
  return receipt;
}

export function persistProcessRun(receiptPath, receipt) {
  validateProcessRun(receipt);
  const target = resolve(receiptPath);
  let fd = null;
  try {
    fd = openSync(target, "wx", 0o600);
    writeFileSync(fd, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8" });
    fsyncSync(fd);
  } finally {
    if (fd !== null) closeSync(fd);
  }
  chmodSync(target, 0o600);
  const info = lstatSync(target);
  if (!info.isFile() || info.isSymbolicLink() || (process.platform !== "win32" && (info.mode & 0o777) !== 0o600)) throw new Error("receipt persistence is not private");
  return receipt.runDigest;
}

function parseCli(argv) {
  if (argv[0] !== "run") throw new Error("Usage: public-baseline-diagnose.mjs run --root <checkout> --receipt <private-file> [--focused-file <repository-relative.mjs> --required-tools-ready]");
  let rootDir = null, receiptPath = null, focusedRelativeFile = null, requiredToolsReady = false;
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--required-tools-ready") { requiredToolsReady = true; continue; }
    if (!new Set(["--root", "--receipt", "--focused-file"]).has(token) || !argv[index + 1]) throw new Error("invalid command argument");
    const value = argv[++index];
    if (token === "--root") rootDir = value;
    if (token === "--receipt") receiptPath = value;
    if (token === "--focused-file") focusedRelativeFile = value;
  }
  if (rootDir === null || receiptPath === null || (requiredToolsReady && focusedRelativeFile === null) || (!requiredToolsReady && focusedRelativeFile !== null)) throw new Error("incomplete command arguments");
  return { rootDir, receiptPath, focusedRelativeFile, requiredToolsReady };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { receiptPath, ...options } = parseCli(process.argv.slice(2));
    const receipt = await runPublicBaselineProcesses(options);
    persistProcessRun(receiptPath, receipt);
    process.stdout.write(`${JSON.stringify({ schema: receipt.schema, runDigest: receipt.runDigest, status: receipt.fullVerify.status, exitCode: receipt.fullVerify.exitCode, confirmationAttempted: receipt.confirmationAttempted })}\n`);
    process.exitCode = receipt.fullVerify.status === "completed" && receipt.fullVerify.exitCode === 0 ? 0 : 2;
  } catch (error) {
    process.stderr.write(`public-baseline-diagnose: ${error.message}\n`);
    process.exitCode = 2;
  }
}
