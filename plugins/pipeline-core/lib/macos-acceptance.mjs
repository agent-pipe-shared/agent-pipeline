// SPDX-License-Identifier: SUL-1.0

import { createHash } from "node:crypto";

export const MACOS_ACCEPTANCE_SCHEMA = "pipeline.macos-acceptance.v1";

const SHA256 = /^[a-f0-9]{64}$/u;
const GIT_OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SAFE_PATH = /^(?!\/)(?!.*\\)(?!.*\/\/)(?!.*\.{1,2}(?:\/|$))(?!.*(?:^|\/)(?:Users|home|private|var)(?:\/|$))[A-Za-z0-9._/@:-]{1,512}$/u;
const SANITIZED_TEXT = /^(?!.*(?:keychain|secret|password|token|account|private|serial|\/Users\/|\/home\/|~\/|[A-Za-z]:\\\\))[A-Za-z0-9._+ -]{1,160}$/iu;
const ROOT = [
  "schema", "acceptanceId", "candidate", "hardwareClass", "os", "toolchain", "bootstrapSha256",
  "filesystem", "runnerReports", "lifecycle", "gates", "cleanup", "evidence", "status", "recordSha256",
];
const HARDWARE = new Set(["apple-silicon", "intel", "hosted-ci", "synthetic"]);
const OBSERVATION = new Set(["observed", "not-observed", "denied", "unavailable"]);
const KEEP_AWAKE = new Set(["not-requested", "observed-active", "denied", "unavailable", "expired"]);
const INTERRUPTION = new Set(["not-interrupted", "interrupted", "resumed"]);
const DELIVERY = new Set(["not-delivered", "delivered", "denied", "unavailable"]);
const STAGES = new Set(["not-started", "bootstrapped", "running", "interrupted", "completed", "cleaned"]);
const GATE_STATUS = new Set(["passed", "failed", "unavailable", "not-run"]);
const CLEANUP = new Set(["not-requested", "completed", "denied", "unavailable"]);
const STATUS = new Set(["recorded", "failed", "unavailable", "native-closure-passed"]);

const exact = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const sortedUnique = (values, key) => Array.isArray(values) && values.length <= 128
  && values.every((value, index) => index === 0 || key(values[index - 1]) < key(value));
const text = (value) => typeof value === "string" && SANITIZED_TEXT.test(value);

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export function canonicalMacosJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalMacosJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalMacosJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function macosAcceptanceDigest(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const { recordSha256, ...semantic } = record;
  return createHash("sha256").update(`${MACOS_ACCEPTANCE_SCHEMA}\0${canonicalMacosJson(semantic)}`, "utf8").digest("hex");
}

function validEvidence(value) {
  return exact(value, ["kind", "path", "fileSha256", "recordSha256"])
    && SAFE_ID.test(value.kind ?? "")
    && (value.path === null || (typeof value.path === "string" && SAFE_PATH.test(value.path)))
    && SHA256.test(value.fileSha256 ?? "")
    && (value.recordSha256 === null || SHA256.test(value.recordSha256));
}

function validEvidenceSet(values) {
  return sortedUnique(values, (entry) => `${entry.kind}\0${entry.path ?? ""}\0${entry.fileSha256}\0${entry.recordSha256 ?? ""}`)
    && values.every(validEvidence);
}

function validLifecycle(value) {
  if (!exact(value, [
    "stage", "keepAwakeRequested", "keepAwakeObserved", "keepAwakeBoundMs", "inputAuthoritySha256",
    "interruptionState", "completionDelivery", "resumeTokenSha256", "backgroundInputChannel",
  ]) || !STAGES.has(value.stage) || !KEEP_AWAKE.has(value.keepAwakeRequested)
    || !KEEP_AWAKE.has(value.keepAwakeObserved) || !Number.isSafeInteger(value.keepAwakeBoundMs)
    || value.keepAwakeBoundMs < 0 || !INTERRUPTION.has(value.interruptionState)
    || !DELIVERY.has(value.completionDelivery) || value.backgroundInputChannel !== "none"
    || !(value.inputAuthoritySha256 === null || SHA256.test(value.inputAuthoritySha256))
    || !(value.resumeTokenSha256 === null || SHA256.test(value.resumeTokenSha256))) return false;
  if (value.keepAwakeObserved === "observed-active" && value.keepAwakeBoundMs === 0) return false;
  if (value.keepAwakeObserved !== "observed-active" && value.keepAwakeBoundMs !== 0) return false;
  if (value.interruptionState === "resumed") return value.resumeTokenSha256 !== null && value.inputAuthoritySha256 !== null;
  return value.resumeTokenSha256 === null;
}

function nativeClosure(record) {
  const { lifecycle } = record;
  return record.hardwareClass === "apple-silicon"
    && record.status === "native-closure-passed"
    && lifecycle.stage === "cleaned"
    && lifecycle.keepAwakeObserved !== "denied" && lifecycle.keepAwakeObserved !== "unavailable"
    && lifecycle.completionDelivery === "delivered"
    && lifecycle.inputAuthoritySha256 !== null
    && lifecycle.interruptionState !== "interrupted"
    && (lifecycle.interruptionState !== "resumed" || lifecycle.resumeTokenSha256 !== null)
    && record.gates.length > 0 && record.gates.every((gate) => gate.status === "passed")
    && record.cleanup.status === "completed";
}

function validationCode(record, verifyDigest = true) {
  if (!exact(record, ROOT)) return "SHAPE:macos-root";
  if (record.schema !== MACOS_ACCEPTANCE_SCHEMA) return "SCHEMA:macos-acceptance";
  if (!SAFE_ID.test(record.acceptanceId ?? "") || !HARDWARE.has(record.hardwareClass)
    || !SHA256.test(record.bootstrapSha256 ?? "") || !STATUS.has(record.status) || !SHA256.test(record.recordSha256 ?? "")) return "SHAPE:macos-scalars";
  if (!exact(record.candidate, ["commit", "tree"]) || !GIT_OID.test(record.candidate.commit ?? "") || !GIT_OID.test(record.candidate.tree ?? "")) return "BOUND:macos-candidate";
  if (!exact(record.os, ["version", "build", "architecture"]) || !text(record.os.version) || !text(record.os.build) || !text(record.os.architecture)) return "PRIVACY:macos-os";
  if (!sortedUnique(record.toolchain, (item) => item.tool) || !record.toolchain.every((item) => exact(item, ["tool", "version", "executableSha256"])
    && SAFE_ID.test(item.tool ?? "") && text(item.version) && SHA256.test(item.executableSha256 ?? ""))) return "BOUND:macos-toolchain";
  if (!sortedUnique(record.filesystem, (item) => item.capability) || !record.filesystem.every((item) => exact(item, ["capability", "status", "evidenceSha256"])
    && SAFE_ID.test(item.capability ?? "") && OBSERVATION.has(item.status) && (item.evidenceSha256 === null || SHA256.test(item.evidenceSha256))
    && ((item.status === "observed") === (item.evidenceSha256 !== null)))) return "BOUND:macos-filesystem";
  if (!sortedUnique(record.runnerReports, (item) => item.reportId) || !record.runnerReports.every((item) => exact(item, ["reportId", "recordSha256", "status"])
    && SAFE_ID.test(item.reportId ?? "") && SHA256.test(item.recordSha256 ?? "") && OBSERVATION.has(item.status))) return "BOUND:macos-runner-reports";
  if (!validLifecycle(record.lifecycle)) return "BOUND:macos-lifecycle";
  if (!sortedUnique(record.gates, (item) => item.gate) || !record.gates.every((item) => exact(item, ["gate", "status", "evidenceSha256"])
    && SAFE_ID.test(item.gate ?? "") && GATE_STATUS.has(item.status) && (item.evidenceSha256 === null || SHA256.test(item.evidenceSha256))
    && ((item.status === "passed") === (item.evidenceSha256 !== null)))) return "BOUND:macos-gates";
  if (!exact(record.cleanup, ["status", "evidenceSha256"]) || !CLEANUP.has(record.cleanup.status)
    || !(record.cleanup.evidenceSha256 === null || SHA256.test(record.cleanup.evidenceSha256))
    || ((record.cleanup.status === "completed") !== (record.cleanup.evidenceSha256 !== null))) return "BOUND:macos-cleanup";
  if (!validEvidenceSet(record.evidence)) return "PRIVACY:macos-evidence";
  if (record.status === "native-closure-passed" && !nativeClosure(record)) return "NATIVE:macos-closure";
  if (record.status !== "native-closure-passed" && record.hardwareClass !== "apple-silicon" && nativeClosure(record)) return "NATIVE:macos-hardware";
  if (record.status === "native-closure-passed" && ["denied", "unavailable"].includes(record.lifecycle.keepAwakeObserved)) return "NATIVE:macos-lifecycle";
  if (verifyDigest && macosAcceptanceDigest(record) !== record.recordSha256) return "CONFLICT:macos-digest";
  return null;
}

export function validateMacosAcceptance(record) {
  const code = validationCode(record);
  return code ? { ok: false, code } : { ok: true, code: null };
}

export function sealMacosAcceptance(draft) {
  if (!draft || typeof draft !== "object" || Array.isArray(draft) || Object.hasOwn(draft, "schema") || Object.hasOwn(draft, "recordSha256")) throw new Error("SHAPE:macos-draft");
  const record = { schema: MACOS_ACCEPTANCE_SCHEMA, ...structuredClone(draft), recordSha256: "0".repeat(64) };
  const code = validationCode(record, false);
  if (code) throw new Error(code);
  record.recordSha256 = macosAcceptanceDigest(record);
  return freeze(record);
}

/** Compile an externally supplied record only after its closed semantic validation. */
export function compileMacosAcceptance(record) {
  const result = validateMacosAcceptance(record);
  if (!result.ok) throw new Error(result.code);
  return freeze(structuredClone(record));
}

export function isNativeMacosClosure(record) {
  return validateMacosAcceptance(record).ok && nativeClosure(record);
}

export const MACOS_HARDWARE_CLASSES = Object.freeze([...HARDWARE]);
