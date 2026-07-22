#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Closed, model-free selector for the documented affected Codex host tuple.
 *
 * This module intentionally has no child-launch capability.  A caller can
 * receive only a selected, fully read-back transport or a typed unavailable
 * record; the generic host bridge owns the later, fixed child transport.
 */
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, closeSync, existsSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

import {
  INTERMEDIATE_LITERAL,
  buildCompatibilityProjection,
  canonicalJson,
  compatibilityReceiptDigest,
  loadCompatibilityPolicy,
} from "../lib/codex-sandbox-compatibility.mjs";
import { validateAgainstSchema } from "../lib/schema-lite.mjs";
import { resolvePoGateRepositoryTopology } from "../lib/po-gate-authority.mjs";
import { assessWindowsPrivatePath, hardenWindowsPrivateDirectory } from "../lib/windows-private-state.mjs";

const DUTIES = new Set(["advisory", "readiness", "critic"]);
const FAILURE_CLASSES = new Set(["policy-drift", "host-unsupported", "evidence-stale", "preflight-failed", "profile-drift", "host-mode-unavailable"]);
const SHA256 = /^[a-f0-9]{64}$/;
const OID = /^[a-f0-9]{40,64}$/;
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const SELECTION_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";
const SELECTION_TAIL = "aeimquy4";
const RECEIPT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const LOCK_WAIT_MS = 600_000;
export const SANDBOX_ASSURANCE = Object.freeze({
  class: "sandbox-read-only-except-coordinator-scratch-network-open",
  literal: INTERMEDIATE_LITERAL,
});
export const UNAVAILABLE_ASSURANCE = Object.freeze({ class: "no-usable-review", literal: null });

function fail(message) { throw new Error(message); }
function digest(domain, value) {
  return createHash("sha256").update(Buffer.from(`${domain}\0${canonicalJson(value)}`, "utf8")).digest("hex");
}
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
const COMPATIBILITY_RECEIPT_SCHEMA = JSON.parse(readFileSync(new URL("./codex-sandbox-compatibility-receipt.schema.json", import.meta.url), "utf8"));
// schema-lite intentionally has no distinct JSON-Schema integer primitive;
// the projection owner enforces a safe integer and this adapter preserves the
// remaining closed schema constraints through the committed schema bytes.
const COMPATIBILITY_RECEIPT_SCHEMA_FOR_RUNTIME = structuredClone(COMPATIBILITY_RECEIPT_SCHEMA);
COMPATIBILITY_RECEIPT_SCHEMA_FOR_RUNTIME.properties.observedAtMs.type = "number";
export const SELECTION_SCHEMA_SHA256 = sha256(readFileSync(new URL("./codex-sandbox-selection.schema.json", import.meta.url)));
function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(`${label} is not closed`);
}
function checkDigest(value, label, nullable = false) {
  if (nullable && value === null) return;
  if (typeof value !== "string" || !SHA256.test(value)) fail(`${label} must be SHA-256`);
}
function checkDispatch(value, { request = false } = {}) {
  const keys = request
    ? ["queueRevision", "candidateCommit", "candidateTree", "referenceSetSha256", "requestSha256"]
    : ["queueRevision", "candidateCommit", "candidateTree", "referenceSetSha256"];
  exactKeys(value, keys, "dispatch");
  if (!Number.isSafeInteger(value.queueRevision) || value.queueRevision < 0 || !OID.test(value.candidateCommit)
    || !OID.test(value.candidateTree)) fail("dispatch is invalid");
  checkDigest(value.referenceSetSha256, "referenceSetSha256");
  if (request) checkDigest(value.requestSha256, "requestSha256");
}
function nowIso(now) { return new Date(now()).toISOString(); }
function selectionId(bytes = randomBytes(16)) {
  // 128 bits encode to 26 base32 characters.  The final character is set from
  // the closed Hawkeye ID tail alphabet so IDs cannot be confused with input.
  let bits = 0; let value = 0; let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { bits -= 5; output += SELECTION_ALPHABET[(value >>> bits) & 31]; }
  }
  if (bits > 0) output += SELECTION_ALPHABET[(value << (5 - bits)) & 31];
  const stem = output.slice(0, 25).padEnd(25, "a");
  return `css_${stem}${SELECTION_TAIL[bytes[15] & 7]}`;
}
function requestInput(value) {
  exactKeys(value, ["repoFingerprint", "duty", "queueRevision", "candidateCommit", "candidateTree", "referenceSetSha256", "runner", "model"], "sandbox request");
  if (!SHA256.test(value.repoFingerprint) || !DUTIES.has(value.duty) || value.runner !== "codex"
    || typeof value.model !== "string" || value.model.length === 0) fail("sandbox request is invalid");
  checkDispatch({
    queueRevision: value.queueRevision,
    candidateCommit: value.candidateCommit,
    candidateTree: value.candidateTree,
    referenceSetSha256: value.referenceSetSha256,
  });
}
function profile(profileSha256, scratchRootSha256 = null) {
  checkDigest(profileSha256, "committed profile sha256", true);
  return {
    id: "codex-critic-intermediate.v1",
    sha256: profileSha256,
    base: ":read-only",
    network: { enabled: true },
    writableRootClass: "coordinator-scratch-only",
    scratchRootSha256,
  };
}
function toolchain(observed = {}) {
  return {
    cliVersion: observed.cliVersion ?? null,
    cliSha256: observed.cliSha256 ?? null,
    observedHelperSha256: observed.observedHelperSha256 ?? null,
    selectionSchemaSha256: observed.selectionSchemaSha256 ?? null,
  };
}
function host(observed = {}) {
  return {
    platformClass: observed.platformClass ?? null,
    kernel: observed.kernel ?? { sysname: null, release: null, machine: null },
    filesystemClass: observed.filesystemClass ?? null,
    bootIdSha256: observed.bootIdSha256 ?? null,
  };
}
function preflight(value, observedAt, receiptSha256 = null) {
  const terminalCode = value?.terminalCode === "ok" ? "eligible" : value?.terminalCode ?? "host-error";
  return {
    receiptSha256: value?.receiptSha256 ?? receiptSha256,
    eligibility: value?.eligibility === "intermediate" ? "intermediate" : "none",
    terminalCode: ["eligible", "child-stdio-error", "profile-unavailable", "network-unavailable", "host-error"].includes(terminalCode) ? terminalCode : "host-error",
    observedAt: value ? observedAt : null,
  };
}
function unavailableRecord(input, observed, observedAt, failureClass, {
  preflightResult = null,
  profileSha256 = null,
  compatibilityReceiptSha256 = null,
  scratchRootSha256 = null,
} = {}) {
  if (!FAILURE_CLASSES.has(failureClass)) fail("unavailable failure class is invalid");
  checkDigest(compatibilityReceiptSha256, "compatibility receipt", true);
  checkDigest(scratchRootSha256, "scratchRootSha256", true);
  const built = buildSandboxRequest(input);
  return {
    schema: "pipeline.codex-sandbox-selection.v1",
    selectionId: selectionId(),
    repoFingerprint: input.repoFingerprint,
    duty: input.duty,
    dispatch: { queueRevision: input.queueRevision, candidateCommit: input.candidateCommit, candidateTree: input.candidateTree, referenceSetSha256: input.referenceSetSha256, requestSha256: built.requestSha256 },
    toolchain: toolchain(observed),
    host: host(observed),
    profile: profile(profileSha256, scratchRootSha256),
    preflight: preflight(preflightResult, observedAt),
    compatibilityReceiptSha256,
    assurance: { ...UNAVAILABLE_ASSURANCE },
    status: "unavailable",
    failureClass,
    observedAt,
  };
}

function selectionDigest(value) {
  return sha256(Buffer.from(canonicalJson(value), "utf8"));
}
function stableCompatibilityProjection(value) {
  if (value === null) return null;
  const { observedAtMs, ...stable } = value;
  return stable;
}
function sameSelectionEvidence(left, right, leftCompatibility = null, rightCompatibility = null) {
  return canonicalJson({
    toolchain: left.toolchain,
    host: left.host,
    profile: left.profile,
    preflight: { receiptSha256: left.preflight.receiptSha256, eligibility: left.preflight.eligibility, terminalCode: left.preflight.terminalCode },
    compatibility: stableCompatibilityProjection(leftCompatibility),
    assurance: left.assurance,
    status: left.status,
    failureClass: left.failureClass,
  }) === canonicalJson({
    toolchain: right.toolchain,
    host: right.host,
    profile: right.profile,
    preflight: { receiptSha256: right.preflight.receiptSha256, eligibility: right.preflight.eligibility, terminalCode: right.preflight.terminalCode },
    compatibility: stableCompatibilityProjection(rightCompatibility),
    assurance: right.assurance,
    status: right.status,
    failureClass: right.failureClass,
  });
}

function defaultCompatibilityProjection(observed) {
  if (!observed?.compatibilityObservation || typeof observed.compatibilityObservation !== "object") {
    throw new Error("current compatibility observation is unavailable");
  }
  const policy = loadCompatibilityPolicy();
  const projection = buildCompatibilityProjection(policy, observed.compatibilityObservation);
  const schemaResult = validateAgainstSchema(projection, COMPATIBILITY_RECEIPT_SCHEMA_FOR_RUNTIME);
  if (!schemaResult.valid) throw new Error(`compatibility projection schema invalid: ${schemaResult.errors.join("; ")}`);
  const entry = policy.value.entries.find((candidate) => candidate.id === projection.entryId);
  if (!entry || entry.permissionProfileId !== "codex-critic-intermediate.v1") {
    throw new Error("current compatibility projection does not select the documented profile");
  }
  const expectedFilesystem = { "native-linux": "linux-native", "wsl-native": "wsl2-native", drvfs: "wsl2-9p" }[entry.filesystemClass];
  const actual = toolchain(observed);
  const actualHost = host(observed);
  const preflightReceipt = observed.compatibilityObservation.preflight?.receipt;
  if (actual.cliVersion !== entry.cliVersion || actual.cliSha256 !== entry.releasedArtifactSha256
    || actual.selectionSchemaSha256 !== SELECTION_SCHEMA_SHA256 || actual.observedHelperSha256 !== preflightReceipt?.observedHelper?.artifactSha256
    || actualHost.platformClass !== "linux-wsl2" || actualHost.filesystemClass !== expectedFilesystem
    || actualHost.bootIdSha256 !== sha256(String(observed.compatibilityObservation.bootId))) {
    throw new Error("current host/toolchain evidence does not bind the selected compatibility entry");
  }
  return { projection, profileSha256: entry.permissionProfileSha256 };
}

function validatedCompatibility(value) {
  exactKeys(value, ["projection", "profileSha256"], "compatibility selection evidence");
  checkDigest(value.profileSha256, "committed profile sha256");
  if (!value.projection || typeof value.projection !== "object" || value.projection.runnerId !== "codex") {
    throw new Error("compatibility selection is not current Codex evidence");
  }
  if (value.projection.state !== "intermediate-preflight-eligible") {
    const error = new Error("compatibility selection is not current intermediate evidence");
    error.failureClass = value.projection.state === "intermediate-preflight-candidate" ? "evidence-stale" : "profile-drift";
    throw error;
  }
  const compatibilityReceiptSha256 = compatibilityReceiptDigest(value.projection);
  return { ...value, compatibilityReceiptSha256 };
}

function compatibilityFailure(error) {
  if (error?.failureClass && FAILURE_CLASSES.has(error.failureClass)) return error.failureClass;
  if (error?.code === "F4-UNSUPPORTED") return "host-unsupported";
  return "policy-drift";
}
function preflightFailure(flight) {
  if (["profile-unavailable", "network-unavailable"].includes(flight?.terminalCode)) return "host-mode-unavailable";
  return "preflight-failed";
}
function usableDutyReceiptStatus(duty) { return duty === "advisory" ? "answered" : "reviewed"; }

/** Builds the domain-separated request from refs-only dispatch facts. */
export function buildSandboxRequest(input) {
  requestInput(input);
  const request = {
    schema: "pipeline.codex-sandbox-request.v1",
    repoFingerprint: input.repoFingerprint,
    duty: input.duty,
    queueRevision: input.queueRevision,
    candidateCommit: input.candidateCommit,
    candidateTree: input.candidateTree,
    referenceSetSha256: input.referenceSetSha256,
    runner: input.runner,
    model: input.model,
  };
  return { request, requestSha256: digest("pipeline.codex-sandbox-request.v1", request) };
}

/** Validates the selected/unavailable nullability boundary before any child. */
export function validateSandboxSelection(value) {
  exactKeys(value, ["schema", "selectionId", "repoFingerprint", "duty", "dispatch", "toolchain", "host", "profile", "preflight", "compatibilityReceiptSha256", "assurance", "status", "failureClass", "observedAt"], "selection");
  if (value.schema !== "pipeline.codex-sandbox-selection.v1" || !/^css_[a-z2-7]{25}[aeimquy4]$/.test(value.selectionId)
    || !SHA256.test(value.repoFingerprint) || !DUTIES.has(value.duty) || !["selected", "unavailable"].includes(value.status)
    || Number.isNaN(Date.parse(value.observedAt))) fail("selection header is invalid");
  checkDispatch(value.dispatch, { request: true });
  exactKeys(value.toolchain, ["cliVersion", "cliSha256", "observedHelperSha256", "selectionSchemaSha256"], "toolchain");
  if (value.toolchain.cliVersion !== null && (typeof value.toolchain.cliVersion !== "string" || !/^[\x21-\x7e]{1,64}$/.test(value.toolchain.cliVersion))) fail("toolchain version is invalid");
  checkDigest(value.toolchain.cliSha256, "CLI sha256", true); checkDigest(value.toolchain.observedHelperSha256, "observed helper sha256", true); checkDigest(value.toolchain.selectionSchemaSha256, "selection schema sha256", true);
  exactKeys(value.host, ["platformClass", "kernel", "filesystemClass", "bootIdSha256"], "host");
  if (value.host.platformClass !== null && !["linux-native", "linux-wsl2", "macos-native", "windows-native"].includes(value.host.platformClass)
    || value.host.filesystemClass !== null && !["linux-native", "wsl2-native", "wsl2-9p", "macos-apfs", "windows-ntfs"].includes(value.host.filesystemClass)) fail("host class is invalid");
  exactKeys(value.host.kernel, ["sysname", "release", "machine"], "host kernel");
  for (const [name, entry] of Object.entries(value.host.kernel)) {
    if (entry !== null && (typeof entry !== "string" || entry.trim() !== entry || !/^[\x21-\x7e]{1,128}$/.test(entry))) fail(`host kernel ${name} is invalid`);
  }
  checkDigest(value.host.bootIdSha256, "boot identifier sha256", true);
  exactKeys(value.profile, ["id", "sha256", "base", "network", "writableRootClass", "scratchRootSha256"], "profile");
  exactKeys(value.profile.network, ["enabled"], "profile network");
  if (value.profile.id !== "codex-critic-intermediate.v1" || value.profile.base !== ":read-only"
    || value.profile.network.enabled !== true || value.profile.writableRootClass !== "coordinator-scratch-only") fail("profile is not documented network-open/read-only");
  checkDigest(value.profile.sha256, "profile sha256", true); checkDigest(value.profile.scratchRootSha256, "scratchRootSha256", true);
  exactKeys(value.preflight, ["receiptSha256", "eligibility", "terminalCode", "observedAt"], "preflight");
  checkDigest(value.preflight.receiptSha256, "preflight receipt", true);
  if (!['intermediate', 'none'].includes(value.preflight.eligibility) || !["eligible", "child-stdio-error", "profile-unavailable", "network-unavailable", "host-error"].includes(value.preflight.terminalCode)) fail("preflight is invalid");
  if ((value.preflight.receiptSha256 === null) !== (value.preflight.observedAt === null)) fail("preflight receipt/time nullability drifted");
  exactKeys(value.assurance, ["class", "literal"], "assurance");
  checkDigest(value.compatibilityReceiptSha256, "compatibility receipt", true);
  if (value.status === "selected") {
    if (value.failureClass !== null || value.compatibilityReceiptSha256 === null || value.profile.scratchRootSha256 === null
      || value.profile.sha256 === null || value.toolchain.cliVersion === null || value.toolchain.cliSha256 === null || value.toolchain.selectionSchemaSha256 === null
      || value.host.platformClass === null || value.host.filesystemClass === null || value.host.bootIdSha256 === null || Object.values(value.host.kernel).some((entry) => entry === null)
      || value.preflight.receiptSha256 === null || value.preflight.eligibility !== "intermediate" || value.preflight.terminalCode !== "eligible"
      || canonicalJson(value.assurance) !== canonicalJson(SANDBOX_ASSURANCE)) fail("selected record contradicts its evidence");
  } else {
    if (!FAILURE_CLASSES.has(value.failureClass) || canonicalJson(value.assurance) !== canonicalJson(UNAVAILABLE_ASSURANCE)) {
      fail("unavailable record contradicts no-child assurance");
    }
    if (value.compatibilityReceiptSha256 === null) {
      if (value.profile.scratchRootSha256 !== null || value.preflight.receiptSha256 !== null) fail("unavailable record invents post-compatibility evidence");
    } else {
      if (value.preflight.receiptSha256 === null) fail("unavailable record lost completed compatibility/preflight evidence");
      if (value.profile.scratchRootSha256 !== null && value.preflight.terminalCode !== "eligible") fail("unavailable record has scratch without an eligible preflight");
    }
  }
  return value;
}

export function sandboxSelectionDigest(value) {
  return selectionDigest(validateSandboxSelection(value));
}

function rawSha256(bytes) { return sha256(bytes); }
function assertPrivateOwner(stat, label) {
  if (typeof process.getuid === "function" && stat.uid !== process.getuid()) fail(`${label} is not owned by the current user`);
}
function privateFile(path) {
  const lexical = lstatSync(path);
  const posixModeViolation = process.platform !== "win32" && (lexical.mode & 0o777) !== 0o600;
  if (lexical.isSymbolicLink() || !lexical.isFile() || lexical.nlink !== 1 || posixModeViolation) {
    fail("private sandbox record is not a private single-link regular file");
  }
  assertPrivateOwner(lexical, "private sandbox record");
  if (realpathSync(path) !== resolve(path)) fail("private sandbox record crosses a symlink");
  if (process.platform === "win32" && (assessWindowsPrivatePath(path).status !== "secure" || assessWindowsPrivatePath(dirname(path)).status !== "secure")) {
    fail("private sandbox record Windows assurance is unavailable or insecure");
  }
  return lexical;
}
function privateDirectory(path) {
  const existed = existsSync(path);
  if (!existed) mkdirSync(path, { recursive: true, mode: 0o700 });
  const lexical = lstatSync(path);
  if (lexical.isSymbolicLink() || !lexical.isDirectory() || realpathSync(path) !== resolve(path)) {
    fail("private sandbox store path is not a physical directory");
  }
  chmodSync(path, 0o700);
  const stat = statSync(path);
  const posixModeViolation = process.platform !== "win32" && (stat.mode & 0o777) !== 0o700;
  if (!stat.isDirectory() || posixModeViolation || realpathSync(path) !== resolve(path)) fail("private sandbox store path is not a mode-0700 physical directory");
  assertPrivateOwner(stat, "private sandbox store path");
  if (process.platform === "win32") {
    const state = existed ? assessWindowsPrivatePath(path) : hardenWindowsPrivateDirectory(path);
    if (state.status !== "secure") fail("private sandbox store Windows assurance is unavailable or insecure");
  }
  return stat;
}
function canonicalBytes(value) { return Buffer.from(canonicalJson(value), "utf8"); }
function fsyncDirectory(path) {
  let descriptor;
  try {
    privateDirectory(path);
    descriptor = openSync(path, "r");
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}
function lockOwnerBytes() { return Buffer.from(canonicalJson({ pid: process.pid }), "utf8"); }
function privateLockFile(path) {
  const lexical = lstatSync(path);
  // A no-replace hard-link publish has a brief, safe two-link interval before
  // its staging name is removed. Lock ownership remains fully readable there.
  const posixModeViolation = process.platform !== "win32" && (lexical.mode & 0o777) !== 0o600;
  if (lexical.isSymbolicLink() || !lexical.isFile() || ![1, 2].includes(lexical.nlink) || posixModeViolation) {
    fail("private sandbox lock is not a private regular file");
  }
  assertPrivateOwner(lexical, "private sandbox lock");
  if (realpathSync(path) !== resolve(path)) fail("private sandbox lock crosses a symlink");
  if (process.platform === "win32" && (assessWindowsPrivatePath(path).status !== "secure" || assessWindowsPrivatePath(dirname(path)).status !== "secure")) {
    fail("private sandbox lock Windows assurance is unavailable or insecure");
  }
  return lexical;
}
function deadLockOwner(path) {
  try {
    privateLockFile(path);
    const owner = JSON.parse(readFileSync(path, "utf8"));
    exactKeys(owner, ["pid"], "sandbox lock owner");
    if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) return false;
    try {
      process.kill(owner.pid, 0);
      return false;
    } catch (error) {
      return error?.code === "ESRCH";
    }
  } catch {
    return false;
  }
}
function reclaimDeadLock(path) {
  try {
    if (!deadLockOwner(path)) return false;
    unlinkSync(path);
    fsyncDirectory(dirname(path));
    return true;
  } catch {
    return false;
  }
}
function acquirePrivateLock(path) {
  const temporary = `${path}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`;
  let descriptor;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, lockOwnerBytes());
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    // Unlike open("wx") followed by a write, the target is never observable
    // as an empty lock after a controller crash.
    linkSync(temporary, path);
    fsyncDirectory(dirname(path));
    return true;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    try { unlinkSync(temporary); fsyncDirectory(dirname(temporary)); } catch {}
  }
}
function writeExactPrivate(path, bytes) {
  if (existsSync(path)) {
    privateFile(path);
    if (!readFileSync(path).equals(bytes)) fail("exact sandbox record replay conflicts");
    return;
  }
  const temporary = `${path}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`;
  let descriptor;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    // `link` is the portable no-replace half of this same-directory publish:
    // a concurrent exact-ID writer receives EEXIST instead of replacing bytes.
    linkSync(temporary, path);
    unlinkSync(temporary);
    fsyncDirectory(dirname(path));
    privateFile(path);
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    try { unlinkSync(temporary); } catch {}
    throw error;
  }
}
function replacePrivate(path, bytes) {
  const temporary = `${path}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`;
  let descriptor;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    // Journal phase changes are made only while the exact-ID lock is held.
    // The atomic replacement is therefore a locked CAS of one known path.
    renameSync(temporary, path);
    fsyncDirectory(dirname(path));
    privateFile(path);
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    try { unlinkSync(temporary); } catch {}
    throw error;
  }
}
export function validateSandboxJournal(value) {
  exactKeys(value, ["schema", "repoFingerprint", "selectionId", "compatibilityPath", "compatibilityBytesBase64", "compatibilitySha256", "selectionPath", "selectionBytesBase64", "selectionSha256", "executionPath", "executionBytesBase64", "executionSha256", "dutyReceiptSchema", "dutyReceiptSha256", "phase", "createdAt"], "sandbox journal");
  if (value.schema !== "pipeline.codex-sandbox-journal.v1" || !SHA256.test(value.repoFingerprint)
    || !/^css_[a-z2-7]{25}[aeimquy4]$/.test(value.selectionId)
    || !SHA256.test(value.selectionSha256) || !["selected", "executed", "duty-bound"].includes(value.phase)
    || Number.isNaN(Date.parse(value.createdAt))) fail("sandbox journal is invalid");
  const paired = (bytes, digest, label) => {
    if ((bytes === null) !== (digest === null)) fail(`${label} journal bytes/digest nullability drifted`);
    if (bytes !== null && (typeof bytes !== "string" || !SHA256.test(digest))) fail(`${label} journal digest is invalid`);
  };
  paired(value.compatibilityBytesBase64, value.compatibilitySha256, "compatibility");
  paired(value.executionBytesBase64, value.executionSha256, "execution");
  if (value.phase === "selected" && (value.executionBytesBase64 !== null || value.dutyReceiptSchema !== null || value.dutyReceiptSha256 !== null)) fail("selected journal has later evidence");
  if (value.phase === "executed" && (value.executionBytesBase64 === null || value.dutyReceiptSchema !== null || value.dutyReceiptSha256 !== null)) fail("executed journal shape is invalid");
  if (value.phase === "duty-bound" && (value.executionBytesBase64 === null || typeof value.dutyReceiptSchema !== "string" || !SHA256.test(value.dutyReceiptSha256))) fail("duty-bound journal shape is invalid");
  return value;
}

function journalKeys(value) { return validateSandboxJournal(value); }

function validateStoredExecution(selection, execution) {
  const expectedRequest = buildSandboxRequest({
    repoFingerprint: selection.repoFingerprint,
    duty: selection.duty,
    queueRevision: selection.dispatch.queueRevision,
    candidateCommit: selection.dispatch.candidateCommit,
    candidateTree: selection.dispatch.candidateTree,
    referenceSetSha256: selection.dispatch.referenceSetSha256,
    runner: execution?.requested?.runner,
    model: execution?.requested?.model,
  });
  exactKeys(execution, ["schema", "selectionId", "selectionSha256", "repoFingerprint", "duty", "dispatch", "requested", "observed", "terminal", "assurance", "dutyReceipt", "createdAt"], "stored execution receipt");
  if (execution.schema !== "pipeline.codex-sandbox-execution-receipt.v1" || execution.selectionId !== selection.selectionId
    || execution.selectionSha256 !== sandboxSelectionDigest(selection) || execution.repoFingerprint !== selection.repoFingerprint
    || execution.duty !== selection.duty || canonicalJson(execution.dispatch) !== canonicalJson(selection.dispatch)
    || expectedRequest.requestSha256 !== selection.dispatch.requestSha256
    || execution.terminal?.childStarted !== true
    || execution.observed?.cliSha256 !== selection.toolchain.cliSha256
    || execution.observed?.profileSha256 !== selection.profile.sha256
    || execution.observed?.networkEnabled !== selection.profile.network.enabled
    || execution.observed?.scratchRootSha256 !== selection.profile.scratchRootSha256
    || canonicalJson(execution.assurance) !== canonicalJson(selection.assurance)
    || typeof execution.dutyReceipt?.schema !== "string" || !SHA256.test(execution.dutyReceipt?.sha256 ?? "")) {
    fail("stored execution receipt does not bind the exact selected duty");
  }
  return execution;
}

function validateReceiptSession(value) {
  exactKeys(value, ["schema", "sessionId", "descriptorSha256", "selectionIds", "createdAt"], "sandbox receipt session descriptor");
  if (value.schema !== "pipeline.codex-sandbox-receipt-session.v1" || !SESSION_ID.test(value.sessionId)
    || !SHA256.test(value.descriptorSha256) || !Array.isArray(value.selectionIds)
    || value.selectionIds.some((id) => !/^css_[a-z2-7]{25}[aeimquy4]$/.test(id))
    || canonicalJson([...new Set(value.selectionIds)].sort()) !== canonicalJson(value.selectionIds)
    || Number.isNaN(Date.parse(value.createdAt))) fail("sandbox receipt session descriptor is invalid");
  return value;
}
function validateRetention(value) {
  exactKeys(value, ["schema", "sessionId", "descriptorSha256", "selectionId", "boundAt"], "sandbox receipt retention");
  if (value.schema !== "pipeline.codex-sandbox-retention.v1" || !SESSION_ID.test(value.sessionId)
    || !SHA256.test(value.descriptorSha256) || !/^css_[a-z2-7]{25}[aeimquy4]$/.test(value.selectionId)
    || Number.isNaN(Date.parse(value.boundAt))) fail("sandbox receipt retention is invalid");
  return value;
}
function validateRequestIndex(value) {
  exactKeys(value, ["schema", "repoFingerprint", "requestSha256", "selectionId", "selectionSha256"], "sandbox request index");
  if (value.schema !== "pipeline.codex-sandbox-request-index.v1" || !SHA256.test(value.repoFingerprint)
    || !SHA256.test(value.requestSha256) || !/^css_[a-z2-7]{25}[aeimquy4]$/.test(value.selectionId)
    || !SHA256.test(value.selectionSha256)) fail("sandbox request index is invalid");
  return value;
}
function validateScratchBinding(value, selection) {
  exactKeys(value, ["schema", "selectionId", "scratchRootSha256", "path", "resourceId", "sessionId", "descriptorSha256", "sandboxStateSha256", "profileRawSha256"], "sandbox scratch binding");
  if (value.schema !== "pipeline.codex-sandbox-scratch-binding.v1" || value.selectionId !== selection.selectionId
    || value.scratchRootSha256 !== selection.profile.scratchRootSha256 || typeof value.path !== "string"
    || !isAbsolute(value.path) || resolve(value.path) !== value.path || !SESSION_ID.test(value.resourceId)
    || !SESSION_ID.test(value.sessionId) || !SHA256.test(value.descriptorSha256)
    || !SHA256.test(value.sandboxStateSha256) || value.profileRawSha256 !== selection.profile.sha256) {
    fail("sandbox scratch binding is invalid");
  }
  return value;
}
function validateReceiptSessionHandle(value) {
  exactKeys(value, ["sessionId", "descriptorSha256"], "sandbox receipt session handle");
  if (!SESSION_ID.test(value.sessionId) || !SHA256.test(value.descriptorSha256)) fail("sandbox receipt session handle is invalid");
  return value;
}

function verifyJournalBytes(journal, selection, names) {
  if (journal.repoFingerprint !== selection.repoFingerprint || journal.selectionId !== selection.selectionId
    || journal.selectionPath !== names.selection || journal.executionPath !== names.execution
    || journal.compatibilityPath !== names.compatibility) fail("sandbox journal paths or identity drifted");
  const selectionBytes = canonicalBytes(selection);
  if (journal.selectionBytesBase64 !== selectionBytes.toString("base64") || journal.selectionSha256 !== rawSha256(selectionBytes)) {
    fail("sandbox journal selection bytes drifted");
  }
  if (selection.compatibilityReceiptSha256 === null) {
    if (journal.compatibilityBytesBase64 !== null || journal.compatibilitySha256 !== null) fail("unavailable journal has compatibility bytes");
  } else {
    if (journal.compatibilityBytesBase64 === null || journal.compatibilitySha256 !== selection.compatibilityReceiptSha256) {
      fail("sandbox journal compatibility receipt drifted");
    }
    const bytes = Buffer.from(journal.compatibilityBytesBase64, "base64");
    let projection;
    try { projection = JSON.parse(bytes.toString("utf8")); } catch { fail("sandbox journal compatibility JSON is invalid"); }
    if (!bytes.equals(canonicalBytes(projection)) || compatibilityReceiptDigest(projection) !== journal.compatibilitySha256) {
      fail("sandbox journal compatibility bytes drifted");
    }
  }
  if (journal.executionBytesBase64 !== null) {
    const bytes = Buffer.from(journal.executionBytesBase64, "base64");
    if (rawSha256(bytes) !== journal.executionSha256) fail("sandbox journal execution bytes drifted");
  }
  return journal;
}

/** Exact-ID, mode-0600 private persistence for the selected transport. */
export function createSandboxSelectionStore({ root, now = () => new Date().toISOString(), receiptSession = null, sessionClosure = null } = {}) {
  if (typeof root !== "string" || !isAbsolute(root) || resolve(root) !== root) fail("sandbox store root must be an absolute canonical directory");
  if (receiptSession !== null) validateReceiptSessionHandle(receiptSession);
  if (sessionClosure !== null && typeof sessionClosure !== "function") fail("sandbox session closure lookup is invalid");
  privateDirectory(root);
  const directories = Object.freeze({
    compatibility: join(root, "compatibility"), selections: join(root, "selections"), executions: join(root, "executions"), journals: join(root, "journals"), scratch: join(root, "scratch"), locks: join(root, "locks"),
    retention: join(root, "retention"), requests: join(root, "requests"), requestLocks: join(root, "request-locks"), executionLocks: join(root, "execution-locks"),
    receiptSessions: join(root, "receipt-sessions"), receiptSessionLocks: join(root, "receipt-session-locks"),
  });
  for (const path of Object.values(directories)) privateDirectory(path);
  const paths = (selectionId) => {
    if (!/^css_[a-z2-7]{25}[aeimquy4]$/.test(selectionId ?? "")) fail("sandbox store selection ID is invalid");
    return Object.freeze({
      compatibility: join(directories.compatibility, `${selectionId}.json`), selection: join(directories.selections, `${selectionId}.json`),
      execution: join(directories.executions, `${selectionId}.json`), journal: join(directories.journals, `${selectionId}.json`),
      scratch: join(directories.scratch, `${selectionId}.json`),
      retention: join(directories.retention, `${selectionId}.json`),
      lock: join(directories.locks, `${selectionId}.lock`),
    });
  };
  const receiptSessionPath = (sessionId) => {
    if (!SESSION_ID.test(sessionId ?? "")) fail("sandbox receipt session ID is invalid");
    return join(directories.receiptSessions, `${sessionId}.json`);
  };
  const requestPath = (requestSha256) => {
    checkDigest(requestSha256, "sandbox request index digest");
    return join(directories.requests, `${requestSha256}.json`);
  };
  const withReceiptSessionLock = (sessionId, operation) => {
    if (!SESSION_ID.test(sessionId ?? "")) fail("sandbox receipt session ID is invalid");
    const lock = join(directories.receiptSessionLocks, `${sessionId}.lock`);
    let acquired = false;
    try {
      try { acquired = acquirePrivateLock(lock); } catch (error) {
        if (error?.code !== "EEXIST" || !reclaimDeadLock(lock)) throw error;
        acquired = acquirePrivateLock(lock);
      }
      return operation();
    } finally {
      if (acquired) {
        try { unlinkSync(lock); fsyncDirectory(directories.receiptSessionLocks); } catch {}
      }
    }
  };
  const withLock = (selectionId, operation) => {
    const lock = paths(selectionId).lock;
    let acquired = false;
    try {
      try { acquired = acquirePrivateLock(lock); } catch (error) {
        if (error?.code !== "EEXIST" || !reclaimDeadLock(lock)) throw error;
        acquired = acquirePrivateLock(lock);
      }
      return operation();
    } finally {
      if (acquired) {
        try { unlinkSync(lock); fsyncDirectory(directories.locks); } catch {}
      }
    }
  };
  const withRequestLock = async (requestSha256, operation) => {
    const lock = join(directories.requestLocks, `${requestSha256}.lock`);
    let acquired = false;
    try {
      const deadline = Date.now() + LOCK_WAIT_MS;
      while (!acquired) {
        try {
          acquired = acquirePrivateLock(lock);
        } catch (error) {
          if (error?.code !== "EEXIST") throw error;
          if (reclaimDeadLock(lock)) continue;
          if (Date.now() >= deadline) fail("sandbox request serialization lock timed out");
          await new Promise((resolveWait) => setTimeout(resolveWait, 5));
        }
      }
      return await operation();
    } finally {
      if (acquired) {
        try { unlinkSync(lock); fsyncDirectory(directories.requestLocks); } catch {}
      }
    }
  };
  const withExecutionLock = async (selectionId, operation, { reclaimDead = true } = {}) => {
    const lock = join(directories.executionLocks, `${selectionId}.lock`);
    let acquired = false;
    try {
      const deadline = Date.now() + LOCK_WAIT_MS;
      while (!acquired) {
        try {
          acquired = acquirePrivateLock(lock);
        } catch (error) {
          if (error?.code !== "EEXIST") throw error;
          if (!reclaimDead && deadLockOwner(lock)) {
            fail("prior sandbox launch outcome is indeterminate; a new dispatch is required");
          }
          if (reclaimDeadLock(lock)) continue;
          if (Date.now() >= deadline) fail("sandbox execution serialization lock timed out");
          await new Promise((resolveWait) => setTimeout(resolveWait, 5));
        }
      }
      return await operation();
    } finally {
      if (acquired) {
        try { unlinkSync(lock); fsyncDirectory(directories.executionLocks); } catch {}
      }
    }
  };
  const readJournal = (selectionId) => {
    const path = paths(selectionId).journal;
    privateFile(path);
    const journal = journalKeys(JSON.parse(readFileSync(path, "utf8")));
    const selectionPath = paths(selectionId).selection;
    if (existsSync(selectionPath)) {
      privateFile(selectionPath);
      verifyJournalBytes(journal, validateSandboxSelection(JSON.parse(readFileSync(selectionPath, "utf8"))), paths(selectionId));
    }
    return journal;
  };
  const readReceiptSession = (sessionId) => {
    const path = receiptSessionPath(sessionId);
    privateFile(path);
    return validateReceiptSession(JSON.parse(readFileSync(path, "utf8")));
  };
  const registerRetention = (selectionId) => {
    if (receiptSession === null) return;
    const names = paths(selectionId);
    withReceiptSessionLock(receiptSession.sessionId, () => {
      let record;
      if (existsSync(names.retention)) {
        privateFile(names.retention);
        record = validateRetention(JSON.parse(readFileSync(names.retention, "utf8")));
        if (record.sessionId !== receiptSession.sessionId || record.descriptorSha256 !== receiptSession.descriptorSha256 || record.selectionId !== selectionId) {
          fail("sandbox retention binding drifted");
        }
      } else {
        record = {
          schema: "pipeline.codex-sandbox-retention.v1",
          sessionId: receiptSession.sessionId,
          descriptorSha256: receiptSession.descriptorSha256,
          selectionId,
          boundAt: now(),
        };
        writeExactPrivate(names.retention, canonicalBytes(validateRetention(record)));
      }
      const path = receiptSessionPath(receiptSession.sessionId);
      let descriptor;
      if (existsSync(path)) {
        descriptor = readReceiptSession(receiptSession.sessionId);
        if (descriptor.descriptorSha256 !== receiptSession.descriptorSha256) fail("sandbox receipt session descriptor binding drifted");
      } else {
        descriptor = {
          schema: "pipeline.codex-sandbox-receipt-session.v1",
          sessionId: receiptSession.sessionId,
          descriptorSha256: receiptSession.descriptorSha256,
          selectionIds: [],
          createdAt: now(),
        };
      }
      if (!descriptor.selectionIds.includes(selectionId)) {
        const next = { ...descriptor, selectionIds: [...descriptor.selectionIds, selectionId].sort() };
        if (existsSync(path)) replacePrivate(path, canonicalBytes(validateReceiptSession(next)));
        else writeExactPrivate(path, canonicalBytes(validateReceiptSession(next)));
      }
    });
  };
  const compatibilityFor = (selection, supplied = undefined) => {
    if (selection.compatibilityReceiptSha256 === null) {
      if (supplied !== undefined && supplied !== null) fail("unbound compatibility projection was supplied");
      return null;
    }
    let value = supplied;
    if (value === undefined) {
      const path = paths(selection.selectionId).compatibility;
      privateFile(path);
      value = JSON.parse(readFileSync(path, "utf8"));
    }
    if (value === null || compatibilityReceiptDigest(value) !== selection.compatibilityReceiptSha256) {
      fail("selection compatibility bytes do not bind its receipt");
    }
    return value;
  };
  return Object.freeze({
    async writeSelection(selection, compatibility = null, scratch = null) {
      validateSandboxSelection(selection);
      let scratchBinding = null;
      if (scratch !== null) {
        if (!scratch || typeof scratch !== "object" || Array.isArray(scratch)) fail("sandbox scratch input is invalid");
        if (Object.hasOwn(scratch, "path")) scratchBinding = validateScratchBinding({
          schema: "pipeline.codex-sandbox-scratch-binding.v1", selectionId: selection.selectionId,
          scratchRootSha256: scratch.sha256, path: scratch.path, resourceId: scratch.resourceId,
          sessionId: scratch.sessionId, descriptorSha256: scratch.descriptorSha256,
          sandboxStateSha256: scratch.sandboxStateSha256, profileRawSha256: scratch.profileRawSha256,
        }, selection);
        else {
          exactKeys(scratch, ["sha256"], "sandbox scratch input");
          if (scratch.sha256 !== selection.profile.scratchRootSha256) fail("sandbox scratch input drifted");
        }
      }
      const requestSha256 = selection.dispatch.requestSha256;
      return withRequestLock(requestSha256, async () => {
        const indexPath = requestPath(requestSha256);
        if (existsSync(indexPath)) {
          privateFile(indexPath);
          const index = validateRequestIndex(JSON.parse(readFileSync(indexPath, "utf8")));
          if (index.repoFingerprint !== selection.repoFingerprint || index.requestSha256 !== requestSha256) fail("sandbox request index identity drifted");
          const indexedNames = paths(index.selectionId);
          if (!existsSync(indexedNames.selection) || !existsSync(indexedNames.journal)) {
            for (const path of [indexedNames.compatibility, indexedNames.selection, indexedNames.execution, indexedNames.journal, indexedNames.scratch, indexedNames.retention]) {
              if (existsSync(path)) { privateFile(path); unlinkSync(path); }
            }
            unlinkSync(indexPath);
            for (const path of [directories.compatibility, directories.selections, directories.executions, directories.journals, directories.scratch, directories.retention, directories.requests]) fsyncDirectory(path);
          } else {
            const existing = this.readSelection(index.selectionId);
            if (index.selectionSha256 !== sandboxSelectionDigest(existing)
              || canonicalJson(existing.dispatch) !== canonicalJson(selection.dispatch)
              || existing.repoFingerprint !== selection.repoFingerprint || existing.duty !== selection.duty) {
              fail("sandbox request replay conflicts");
            }
            const journal = readJournal(existing.selectionId);
            if (journal.phase !== "selected" || sameSelectionEvidence(
              existing,
              selection,
              compatibilityFor(existing),
              compatibilityFor(selection, compatibility),
            )) return existing;
            // An exact request may replay only identical durable evidence. A
            // changed current observation requires a new dispatch request; it
            // must never erase the prior selection/receipt identity.
            fail("sandbox request replay conflicts");
          }
        }
        const selectionBytes = canonicalBytes(selection);
        const index = validateRequestIndex({
          schema: "pipeline.codex-sandbox-request-index.v1", repoFingerprint: selection.repoFingerprint, requestSha256,
          selectionId: selection.selectionId, selectionSha256: rawSha256(selectionBytes),
        });
        // Publish the request handle before any selection bytes. If a process
        // dies before the journal exists, the next exact request owns and
        // removes this inert handle rather than creating an unindexed record.
        writeExactPrivate(indexPath, canonicalBytes(index));
        const persisted = withLock(selection.selectionId, () => {
          const names = paths(selection.selectionId);
          const selectionSha256 = rawSha256(selectionBytes);
          if (existsSync(names.selection)) {
            privateFile(names.selection);
            if (!readFileSync(names.selection).equals(selectionBytes)) fail("exact sandbox selection replay conflicts");
            return this.readSelection(selection.selectionId);
          }
          let compatibilityBytesBase64 = null;
          let compatibilitySha256 = null;
          if (selection.compatibilityReceiptSha256 !== null) {
            if (!compatibility || compatibilityReceiptDigest(compatibility) !== selection.compatibilityReceiptSha256) fail("selection compatibility bytes do not bind its receipt");
            const compatibilityBytes = canonicalBytes(compatibility);
            compatibilityBytesBase64 = compatibilityBytes.toString("base64");
            compatibilitySha256 = selection.compatibilityReceiptSha256;
            writeExactPrivate(names.compatibility, compatibilityBytes);
          } else if (compatibility !== null) fail("unavailable selection cannot persist unbound compatibility bytes");
          if (scratchBinding !== null) writeExactPrivate(names.scratch, canonicalBytes(scratchBinding));
          writeExactPrivate(names.selection, selectionBytes);
          const journal = {
            schema: "pipeline.codex-sandbox-journal.v1", repoFingerprint: selection.repoFingerprint, selectionId: selection.selectionId,
            compatibilityPath: names.compatibility, compatibilityBytesBase64, compatibilitySha256,
            selectionPath: names.selection, selectionBytesBase64: selectionBytes.toString("base64"), selectionSha256,
            executionPath: names.execution, executionBytesBase64: null, executionSha256: null,
            dutyReceiptSchema: null, dutyReceiptSha256: null, phase: "selected", createdAt: now(),
          };
          writeExactPrivate(names.journal, canonicalBytes(journalKeys(journal)));
          return this.readSelection(selection.selectionId);
        });
        return persisted;
      });
    },
    readSelection(selectionId) {
      const path = paths(selectionId).selection;
      privateFile(path);
      const selection = validateSandboxSelection(JSON.parse(readFileSync(path, "utf8")));
      const journal = readJournal(selectionId);
      if (journal.selectionSha256 !== rawSha256(canonicalBytes(selection))) fail("selection record digest drifted");
      return selection;
    },
    readRequest(requestSha256) {
      const path = requestPath(requestSha256);
      if (!existsSync(path)) return null;
      privateFile(path);
      const index = validateRequestIndex(JSON.parse(readFileSync(path, "utf8")));
      const names = paths(index.selectionId);
      // The index is intentionally published first. Until selection + journal
      // are both durable it is only an inert recovery handle, not a replayable
      // transport; writeSelection owns its exact cleanup on the next attempt.
      if (!existsSync(names.selection) || !existsSync(names.journal)) return null;
      const selection = this.readSelection(index.selectionId);
      if (selection.dispatch.requestSha256 !== requestSha256 || index.selectionSha256 !== sandboxSelectionDigest(selection)) {
        fail("sandbox request index identity drifted");
      }
      return selection;
    },
    readExecution(selectionId) {
      const path = paths(selectionId).execution;
      privateFile(path);
      const bytes = readFileSync(path);
      const journal = readJournal(selectionId);
      if (journal.executionBytesBase64 !== null && (journal.executionBytesBase64 !== bytes.toString("base64") || journal.executionSha256 !== rawSha256(bytes))) {
        fail("execution record digest drifted");
      }
      try { return JSON.parse(bytes.toString("utf8")); } catch { fail("execution record JSON is invalid"); }
    },
    readScratch(selectionId) {
      const selection = this.readSelection(selectionId);
      const path = paths(selectionId).scratch;
      privateFile(path);
      return validateScratchBinding(JSON.parse(readFileSync(path, "utf8")), selection);
    },
    async runSerialized(selectionId, operation) {
      if (typeof operation !== "function") fail("sandbox execution operation is invalid");
      const selection = this.readSelection(selectionId);
      let journal = readJournal(selectionId);
      if (journal.phase === "selected" && existsSync(paths(selectionId).execution)) {
        journal = this.recoverJournal(selectionId);
      }
      return withRequestLock(selection.dispatch.requestSha256, async () => withExecutionLock(selectionId, () => {
        if (readJournal(selectionId).phase === "selected" && existsSync(paths(selectionId).execution)) {
          this.recoverJournal(selectionId);
        }
        return operation();
      }, { reclaimDead: journal.phase !== "selected" }));
    },
    writeExecution({ selection, execution }) {
      validateSandboxSelection(selection);
      validateStoredExecution(selection, execution);
      return withLock(selection.selectionId, () => {
        const names = paths(selection.selectionId);
        const journal = readJournal(selection.selectionId);
        if (journal.phase !== "selected" || journal.selectionSha256 !== sandboxSelectionDigest(selection)) fail("sandbox journal cannot advance to execution");
        const bytes = canonicalBytes(execution);
        writeExactPrivate(names.execution, bytes);
        const next = { ...journal, executionBytesBase64: bytes.toString("base64"), executionSha256: rawSha256(bytes), phase: "executed" };
        replacePrivate(names.journal, canonicalBytes(journalKeys(next)));
        return journalKeys(next);
      });
    },
    bindDuty({ selection, execution }) {
      return withLock(selection.selectionId, () => {
        const journal = readJournal(selection.selectionId);
        if (journal.phase === "duty-bound") return journal;
        if (journal.phase !== "executed") fail("sandbox journal cannot bind duty before execution");
        validateStoredExecution(selection, execution);
        if (execution.dutyReceipt.status !== usableDutyReceiptStatus(selection.duty)) {
          fail("sandbox execution receipt is not a usable duty result");
        }
        registerRetention(selection.selectionId);
        const next = { ...journal, dutyReceiptSchema: execution.dutyReceipt.schema, dutyReceiptSha256: execution.dutyReceipt.sha256, phase: "duty-bound" };
        replacePrivate(paths(selection.selectionId).journal, canonicalBytes(journalKeys(next)));
        return journalKeys(next);
      });
    },
    recoverJournal(selectionId) {
      return withLock(selectionId, () => {
        const journal = readJournal(selectionId);
        if (journal.phase === "duty-bound") return journal;
        const selection = this.readSelection(selectionId);
        const names = paths(selectionId);
        if (journal.phase === "selected") {
          if (!existsSync(names.execution)) return journal;
          const execution = this.readExecution(selectionId);
          validateStoredExecution(selection, execution);
          const bytes = canonicalBytes(execution);
          writeExactPrivate(names.execution, bytes);
          const next = { ...journal, executionBytesBase64: bytes.toString("base64"), executionSha256: rawSha256(bytes), phase: "executed" };
          replacePrivate(names.journal, canonicalBytes(journalKeys(next)));
          return journalKeys(next);
        }
        if (journal.phase === "executed") {
          const execution = this.readExecution(selectionId);
          validateStoredExecution(selection, execution);
          if (execution.dutyReceipt.status !== usableDutyReceiptStatus(selection.duty)) return journal;
          if (!execution?.dutyReceipt || typeof execution.dutyReceipt.schema !== "string" || !SHA256.test(execution.dutyReceipt.sha256 ?? "")) {
            fail("execution journal has no bindable duty receipt");
          }
          registerRetention(selection.selectionId);
          const next = { ...journal, dutyReceiptSchema: execution.dutyReceipt.schema, dutyReceiptSha256: execution.dutyReceipt.sha256, phase: "duty-bound" };
          replacePrivate(names.journal, canonicalBytes(journalKeys(next)));
          return journalKeys(next);
        }
        fail("sandbox journal phase is invalid");
      });
    },
    prune({ sessionId, selectionId }) {
      if (receiptSession === null || sessionClosure === null) fail("sandbox receipt retention is unavailable");
      if (!SESSION_ID.test(sessionId ?? "") || !/^css_[a-z2-7]{25}[aeimquy4]$/.test(selectionId ?? "")) fail("sandbox receipt prune request is invalid");
      return withLock(selectionId, () => {
        privateFile(paths(selectionId).retention);
        const retention = validateRetention(JSON.parse(readFileSync(paths(selectionId).retention, "utf8")));
        if (retention.sessionId !== sessionId || retention.descriptorSha256 !== receiptSession.descriptorSha256) fail("sandbox receipt prune session binding drifted");
        const descriptor = readReceiptSession(sessionId);
        if (descriptor.descriptorSha256 !== retention.descriptorSha256 || !descriptor.selectionIds.includes(selectionId)) fail("sandbox receipt is not enumerated by its session descriptor");
        const journal = readJournal(selectionId);
        if (journal.phase !== "duty-bound") fail("sandbox receipt prune refuses an unbound entry");
        const closure = sessionClosure({ sessionId, descriptorSha256: retention.descriptorSha256 });
        exactKeys(closure, ["status", "closedAt"], "sandbox session closure");
        if (closure.status !== "closed" || typeof closure.closedAt !== "string" || Number.isNaN(Date.parse(closure.closedAt))) fail("sandbox receipt prune refuses an active session");
        const elapsed = Date.parse(now()) - Date.parse(closure.closedAt);
        if (!Number.isFinite(elapsed) || elapsed < RECEIPT_RETENTION_MS) fail("sandbox receipt retention period has not elapsed");
        const names = paths(selectionId);
        const selection = this.readSelection(selectionId);
        const indexPath = requestPath(selection.dispatch.requestSha256);
        privateFile(indexPath);
        const index = validateRequestIndex(JSON.parse(readFileSync(indexPath, "utf8")));
        if (index.selectionId !== selectionId || index.selectionSha256 !== sandboxSelectionDigest(selection)) fail("sandbox request index prune binding drifted");
        const owned = [names.compatibility, names.selection, names.execution, names.journal, names.retention, indexPath];
        if (existsSync(names.scratch)) owned.push(names.scratch);
        for (const path of owned) privateFile(path);
        for (const path of owned) unlinkSync(path);
        for (const path of [directories.compatibility, directories.selections, directories.executions, directories.journals, directories.scratch, directories.retention, directories.requests]) fsyncDirectory(path);
        withReceiptSessionLock(sessionId, () => {
          const current = readReceiptSession(sessionId);
          if (current.descriptorSha256 !== retention.descriptorSha256 || !current.selectionIds.includes(selectionId)) fail("sandbox receipt session descriptor changed during prune");
          const nextIds = current.selectionIds.filter((id) => id !== selectionId);
          const descriptorPath = receiptSessionPath(sessionId);
          if (nextIds.length === 0) unlinkSync(descriptorPath);
          else replacePrivate(descriptorPath, canonicalBytes(validateReceiptSession({ ...current, selectionIds: nextIds })));
          fsyncDirectory(directories.receiptSessions);
        });
        return { status: "pruned", sessionId, selectionId };
      });
    },
    readJournal,
    readReceiptSession,
  });
}

/** Builds the sole repository-private store location from the common Git dir. */
export function createRepositorySandboxSelectionStore({ repoRoot, repoFingerprint, now, topology, receiptSession, sessionClosure } = {}) {
  if (!SHA256.test(repoFingerprint ?? "")) fail("sandbox repository fingerprint is invalid");
  const resolved = topology ?? resolvePoGateRepositoryTopology(repoRoot);
  if (!resolved || typeof resolved.gitCommonDir !== "string" || !isAbsolute(resolved.gitCommonDir)) fail("sandbox repository topology is unavailable");
  return createSandboxSelectionStore({
    root: join(resolved.gitCommonDir, "agent-pipeline", "codex-sandbox", repoFingerprint),
    now,
    receiptSession,
    sessionClosure,
  });
}

async function persistSelection(dependencies, selection, compatibility = null, scratch = null) {
  if (typeof dependencies.persist !== "function") fail("durable sandbox selection persistence is unavailable");
  const persisted = await dependencies.persist(selection, compatibility, scratch);
  return validateSandboxSelection(persisted);
}

/**
 * Runs only model-free preflight, scratch creation and compiled-state readback.
 * `launchChild` is deliberately ignored: selection is the hard prelaunch seam.
 */
export async function selectCodexSandbox(input, dependencies = {}) {
  requestInput(input);
  const now = dependencies.now ?? (() => Date.now());
  const observedAt = nowIso(now);
  let observed;
  try {
    observed = await (dependencies.observeHost?.(input) ?? { registered: false, compatibilityState: "host-unsupported" });
  } catch {
    const record = unavailableRecord(input, {}, observedAt, "host-unsupported");
    return persistSelection(dependencies, record);
  }
  let compatibility;
  try {
    compatibility = validatedCompatibility(defaultCompatibilityProjection(observed));
  } catch (error) {
    const record = unavailableRecord(input, observed, observedAt, compatibilityFailure(error));
    return persistSelection(dependencies, record);
  }
  let flight;
  try {
    flight = await (dependencies.runPreflight?.(input) ?? { eligibility: "none", terminalCode: "host-error" });
  } catch {
    flight = { eligibility: "none", terminalCode: "host-error", receiptSha256: sha256(canonicalJson({ schema: "pipeline.codex-sandbox-preflight-host-error.v1", terminalCode: "host-error" })) };
  }
  const boundFlight = { ...flight, receiptSha256: flight?.receiptSha256 ?? sha256(canonicalJson(flight)) };
  if (flight?.eligibility !== "intermediate" || !["eligible", "ok"].includes(flight?.terminalCode)) {
    const record = unavailableRecord(input, observed, observedAt, preflightFailure(boundFlight), {
      preflightResult: boundFlight,
      profileSha256: compatibility.profileSha256,
      compatibilityReceiptSha256: compatibility.compatibilityReceiptSha256,
    });
    return persistSelection(dependencies, record, compatibility.projection);
  }
  let scratch;
  try { scratch = await (dependencies.createCoordinatorScratch?.(input) ?? null); } catch {
    const record = unavailableRecord(input, observed, observedAt, "host-mode-unavailable", {
      preflightResult: boundFlight,
      profileSha256: compatibility.profileSha256,
      compatibilityReceiptSha256: compatibility.compatibilityReceiptSha256,
    });
    return persistSelection(dependencies, record, compatibility.projection);
  }
  if (!SHA256.test(scratch?.sha256 ?? "")) {
    const record = unavailableRecord(input, observed, observedAt, "host-mode-unavailable", {
      preflightResult: boundFlight,
      profileSha256: compatibility.profileSha256,
      compatibilityReceiptSha256: compatibility.compatibilityReceiptSha256,
    });
    return persistSelection(dependencies, record, compatibility.projection);
  }
  const expectedProfile = profile(compatibility.profileSha256, scratch.sha256);
  let readback;
  try { readback = await (dependencies.readbackProfile?.({ input, profile: expectedProfile }) ?? null); } catch { readback = null; }
  if (canonicalJson(readback) !== canonicalJson(expectedProfile)) {
    const record = unavailableRecord(input, observed, observedAt, "host-mode-unavailable", {
      preflightResult: boundFlight,
      profileSha256: compatibility.profileSha256,
      compatibilityReceiptSha256: compatibility.compatibilityReceiptSha256,
      scratchRootSha256: scratch.sha256,
    });
    return persistSelection(dependencies, record, compatibility.projection, scratch);
  }
  const request = buildSandboxRequest(input);
  const record = {
    schema: "pipeline.codex-sandbox-selection.v1",
    selectionId: selectionId(),
    repoFingerprint: input.repoFingerprint,
    duty: input.duty,
    dispatch: { queueRevision: input.queueRevision, candidateCommit: input.candidateCommit, candidateTree: input.candidateTree, referenceSetSha256: input.referenceSetSha256, requestSha256: request.requestSha256 },
    toolchain: toolchain(observed),
    host: host(observed),
    profile: expectedProfile,
    preflight: preflight(boundFlight, observedAt),
    compatibilityReceiptSha256: compatibility.compatibilityReceiptSha256,
    assurance: { ...SANDBOX_ASSURANCE },
    status: "selected",
    failureClass: null,
    observedAt,
  };
  return persistSelection(dependencies, record, compatibility.projection, scratch);
}
