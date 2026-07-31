// SPDX-License-Identifier: SUL-1.0

import { createHash } from "node:crypto";

export const SELECTED_SANDBOX_DISPOSITION_SCHEMA = "pipeline.selected-sandbox-disposition.v1";

const SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/u;
const ROOT = ["schema", "dispositionId", "duty", "transport", "fingerprint", "state", "failure", "attempt", "challenge", "childReceipt", "expiry", "forceReprobe", "assurance", "previousSha256", "recordSha256"];
const FINGERPRINT = ["runnerSha256", "hostBootSha256", "platformClass", "architectureClass", "sandboxSha256", "profileSha256", "policySha256", "duty", "contractVersion"];
const ASSURANCE_VALUE = "sandbox-read-only-except-coordinator-scratch-network-open";

const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const string = (value) => typeof value === "string" && value.length > 0;
const id = (value) => typeof value === "string" && SAFE_ID.test(value);
const safeReceiptPath = (value) => string(value) && Buffer.byteLength(value, "utf8") <= 512
  && !value.startsWith("/") && !value.includes("\\") && !value.includes("//")
  && !value.split("/").some((part) => part === "." || part === "..")
  && !/(?:^|\/)(?:Users|home|private|var)(?:\/|$)/u.test(value);
const clone = (value) => JSON.parse(JSON.stringify(value));
const freeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
};

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function selectedSandboxDispositionDigest(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const { recordSha256, ...semantic } = record;
  return createHash("sha256").update(canonicalJson(semantic), "utf8").digest("hex");
}

function fingerprintDigest(fingerprint) {
  return createHash("sha256").update(canonicalJson(fingerprint), "utf8").digest("hex");
}

function validFingerprint(value) {
  return exact(value, FINGERPRINT) && SHA256.test(value.runnerSha256) && SHA256.test(value.hostBootSha256)
    && id(value.platformClass) && id(value.architectureClass) && SHA256.test(value.sandboxSha256)
    && SHA256.test(value.profileSha256) && SHA256.test(value.policySha256) && id(value.duty) && id(value.contractVersion);
}
function validAttempt(value) {
  return exact(value, ["attemptId", "index", "startedMonotonicMs"]) && id(value.attemptId)
    && Number.isSafeInteger(value.index) && value.index >= 0 && Number.isSafeInteger(value.startedMonotonicMs) && value.startedMonotonicMs >= 0;
}
function validChallenge(value) { return exact(value, ["nonceSha256", "bits"]) && SHA256.test(value.nonceSha256) && value.bits === 256; }
function validReceipt(value) {
  return exact(value, ["childIdSha256", "attemptId", "nonceSha256", "duty", "transport", "subjectSha256", "assurance", "resultSha256", "terminal"])
    && SHA256.test(value.childIdSha256) && id(value.attemptId) && SHA256.test(value.nonceSha256)
    && id(value.duty) && id(value.transport) && SHA256.test(value.subjectSha256)
    && value.assurance === ASSURANCE_VALUE && SHA256.test(value.resultSha256) && value.terminal === true;
}
function validAuthority(value) {
  return exact(value, ["kind", "decisionId", "receiptPath", "receiptSha256"]) && value.kind === "po-force-reprobe"
    && id(value.decisionId) && safeReceiptPath(value.receiptPath) && SHA256.test(value.receiptSha256);
}
function validAssurance(value) {
  return exact(value, ["requested", "observed", "evidenceSha256"]) && value.requested === "selected-sandbox"
    && (value.observed === "not-observed" || value.observed === ASSURANCE_VALUE)
    && (value.evidenceSha256 === null || SHA256.test(value.evidenceSha256))
    && (value.observed === "not-observed" ? value.evidenceSha256 === null : SHA256.test(value.evidenceSha256));
}
function notObservedAssurance(value) {
  return value.observed === "not-observed" && value.evidenceSha256 === null;
}

function validationCode(record, verifyDigest = true) {
  if (!exact(record, ROOT)) return "SHAPE:root";
  if (record.schema !== SELECTED_SANDBOX_DISPOSITION_SCHEMA) return "SCHEMA:version";
  if (!id(record.dispositionId) || !id(record.duty) || !id(record.transport) || !SHA256.test(record.recordSha256)) return "SHAPE:scalar";
  if (!validFingerprint(record.fingerprint) || record.fingerprint.duty !== record.duty) return "BOUND:fingerprint";
  if (!validAssurance(record.assurance)) return "SHAPE:assurance";
  if (!exact(record.expiry, ["kind", "eligibleAfterMonotonicMs"]) || !["session", "transient-ttl", "fingerprint-drift", "none"].includes(record.expiry.kind)
    || !(record.expiry.eligibleAfterMonotonicMs === null || (Number.isSafeInteger(record.expiry.eligibleAfterMonotonicMs) && record.expiry.eligibleAfterMonotonicMs >= 0))) return "SHAPE:expiry";
  if (!(record.failure === null || (exact(record.failure, ["class", "observationReceiptSha256"])
    && ["transient-unavailable", "terminal-unavailable"].includes(record.failure.class) && SHA256.test(record.failure.observationReceiptSha256)))) return "SHAPE:failure";
  if (!(record.attempt === null || validAttempt(record.attempt)) || !(record.challenge === null || validChallenge(record.challenge))
    || !(record.childReceipt === null || validReceipt(record.childReceipt)) || !(record.forceReprobe === null || validAuthority(record.forceReprobe))
    || !(record.previousSha256 === null || SHA256.test(record.previousSha256))) return "SHAPE:nested";
  const hasProbe = record.attempt !== null && record.challenge !== null;
  if (["probing", "available-attested"].includes(record.state) !== hasProbe) return "BOUND:probe";
  if (!(["unprobed", "probing", "available-attested", "transient-unavailable", "terminal-unavailable", "invalidated"].includes(record.state))) return "BOUND:state";
  if (record.state === "available-attested") {
    if (!record.childReceipt || record.failure !== null || record.expiry.kind !== "none" || record.assurance.observed !== ASSURANCE_VALUE
      || record.assurance.evidenceSha256 === null || !SHA256.test(record.previousSha256) || record.childReceipt.attemptId !== record.attempt.attemptId
      || record.childReceipt.nonceSha256 !== record.challenge.nonceSha256 || record.childReceipt.duty !== record.duty
      || record.childReceipt.transport !== record.transport || record.childReceipt.subjectSha256 !== fingerprintDigest(record.fingerprint)
      || record.childReceipt.resultSha256 !== record.assurance.evidenceSha256) return "AUTHORITY:attestation";
  } else if (record.childReceipt !== null || (record.state !== "probing" && hasProbe)) return "BOUND:state-material";
  if (record.state === "unprobed" && (record.failure !== null || record.attempt !== null || record.challenge !== null || record.childReceipt !== null
    || record.forceReprobe !== null || record.previousSha256 !== null || record.expiry.kind !== "none"
    || record.expiry.eligibleAfterMonotonicMs !== null || !notObservedAssurance(record.assurance))) return "BOUND:unprobed";
  if (record.state === "probing" && (record.failure !== null || record.childReceipt !== null || record.expiry.kind !== "none"
    || record.expiry.eligibleAfterMonotonicMs !== null || !SHA256.test(record.previousSha256)
    || !notObservedAssurance(record.assurance))) return "BOUND:probing";
  if (record.state === "transient-unavailable" && (!record.failure || record.failure.class !== "transient-unavailable" || !record.attempt || record.challenge !== null
    || record.childReceipt !== null || record.expiry.kind !== "transient-ttl" || record.expiry.eligibleAfterMonotonicMs === null
    || !SHA256.test(record.previousSha256) || !notObservedAssurance(record.assurance))) return "BOUND:transient";
  if (record.state === "terminal-unavailable" && (!record.failure || record.failure.class !== "terminal-unavailable" || !record.attempt || record.challenge !== null
    || record.childReceipt !== null || record.expiry.kind !== "session" || record.expiry.eligibleAfterMonotonicMs !== null
    || !SHA256.test(record.previousSha256) || !notObservedAssurance(record.assurance))) return "BOUND:terminal";
  if (record.state === "invalidated" && (record.failure !== null || record.attempt !== null || record.challenge !== null || record.childReceipt !== null
    || record.forceReprobe !== null || record.expiry.kind !== "fingerprint-drift" || record.expiry.eligibleAfterMonotonicMs !== null
    || !SHA256.test(record.previousSha256) || !notObservedAssurance(record.assurance))) return "BOUND:invalidated";
  if (verifyDigest && selectedSandboxDispositionDigest(record) !== record.recordSha256) return "CONFLICT:digest";
  return null;
}

export function validateSelectedSandboxDisposition(record) {
  const failure = validationCode(record);
  return failure ? { ok: false, code: failure } : { ok: true, code: null };
}

function seal(record, previousSha256 = null) {
  const next = { ...record, previousSha256, recordSha256: "0".repeat(64) };
  const failure = validationCode(next, false);
  if (failure) throw new Error(failure);
  next.recordSha256 = selectedSandboxDispositionDigest(next);
  return freeze(next);
}

export function createSelectedSandboxDisposition(input) {
  if (!exact(input, ["dispositionId", "duty", "transport", "fingerprint", "assurance", "nowMonotonicMs"])
    || !Number.isSafeInteger(input.nowMonotonicMs) || input.nowMonotonicMs < 0 || !validFingerprint(input.fingerprint)
    || input.fingerprint.duty !== input.duty || !validAssurance(input.assurance)) throw new Error("SHAPE:input");
  return seal({ schema: SELECTED_SANDBOX_DISPOSITION_SCHEMA, dispositionId: input.dispositionId, duty: input.duty, transport: input.transport,
    fingerprint: clone(input.fingerprint), state: "unprobed", failure: null, attempt: null, challenge: null, childReceipt: null,
    expiry: { kind: "none", eligibleAfterMonotonicMs: null }, forceReprobe: null, assurance: clone(input.assurance) });
}

function reject(code) { return { ok: false, code, disposition: null, launch: false }; }
function advance(record, patch) { return seal({ ...record, ...patch }, record.recordSha256); }
function validStart(event) { return exact(event, ["kind", "attempt", "challenge"]) && event.kind === "probe-start" && validAttempt(event.attempt) && validChallenge(event.challenge); }
function toProbing(record, event, forceReprobe = record.forceReprobe) {
  if (!validStart(event)) return null;
  if (record.attempt && (event.attempt.index <= record.attempt.index || event.attempt.attemptId === record.attempt.attemptId)) return null;
  if (!record.attempt && event.attempt.index !== 0 && record.state === "unprobed") return null;
  return advance(record, { state: "probing", failure: null, attempt: clone(event.attempt), challenge: clone(event.challenge), childReceipt: null,
    expiry: { kind: "none", eligibleAfterMonotonicMs: null }, forceReprobe, assurance: { requested: "selected-sandbox", observed: "not-observed", evidenceSha256: null } });
}

export function reduceSelectedSandboxDisposition(record, event) {
  const invalid = validationCode(record);
  if (invalid) return reject(invalid);
  if (!event || typeof event !== "object" || Array.isArray(event) || !string(event.kind)) return reject("SHAPE:event");
  if (record.state === "probing" && event.kind === "probe-start") return validStart(event) ? { ok: true, code: null, disposition: record, launch: false } : reject("SHAPE:probe-start");
  if (event.kind === "fingerprint-drift") {
    if (!exact(event, ["kind", "fingerprint"]) || !validFingerprint(event.fingerprint) || event.fingerprint.duty !== record.duty) return reject("SHAPE:fingerprint-drift");
    if (canonicalJson(event.fingerprint) === canonicalJson(record.fingerprint)) return reject("REPLAY:fingerprint-drift");
    const disposition = advance(record, { fingerprint: clone(event.fingerprint), state: "invalidated", failure: null, attempt: null, challenge: null, childReceipt: null,
      expiry: { kind: "fingerprint-drift", eligibleAfterMonotonicMs: null }, forceReprobe: null,
      assurance: { requested: "selected-sandbox", observed: "not-observed", evidenceSha256: null } });
    return { ok: true, code: null, disposition, launch: false };
  }
  if (record.state === "probing" && event.kind === "probe-success") {
    if (!exact(event, ["kind", "selectedChildIdSha256", "childReceipt", "observationReceiptSha256"]) || !SHA256.test(event.selectedChildIdSha256)
      || !SHA256.test(event.observationReceiptSha256) || !validReceipt(event.childReceipt)) return reject("SHAPE:probe-success");
    const receipt = event.childReceipt;
    if (receipt.childIdSha256 !== event.selectedChildIdSha256 || receipt.attemptId !== record.attempt.attemptId || receipt.nonceSha256 !== record.challenge.nonceSha256
      || receipt.duty !== record.duty || receipt.transport !== record.transport || receipt.subjectSha256 !== fingerprintDigest(record.fingerprint)
      || receipt.resultSha256 !== event.observationReceiptSha256) return reject("AUTHORITY:receipt-binding");
    const disposition = advance(record, { state: "available-attested", childReceipt: clone(receipt), assurance: { requested: "selected-sandbox", observed: receipt.assurance, evidenceSha256: event.observationReceiptSha256 } });
    return { ok: true, code: null, disposition, launch: false };
  }
  if (record.state === "probing" && event.kind === "probe-failure") {
    if (!exact(event, ["kind", "failure", "observationReceiptSha256", "nowMonotonicMs"]) || !["transient-unavailable", "terminal-unavailable"].includes(event.failure)
      || !SHA256.test(event.observationReceiptSha256) || !Number.isSafeInteger(event.nowMonotonicMs) || event.nowMonotonicMs < record.attempt.startedMonotonicMs) return reject("SHAPE:probe-failure");
    const transient = event.failure === "transient-unavailable";
    const disposition = advance(record, { state: event.failure, failure: { class: event.failure, observationReceiptSha256: event.observationReceiptSha256 }, attempt: clone(record.attempt), challenge: null,
      expiry: transient ? { kind: "transient-ttl", eligibleAfterMonotonicMs: event.nowMonotonicMs + 300000 } : { kind: "session", eligibleAfterMonotonicMs: null } });
    return { ok: true, code: null, disposition, launch: false };
  }
  if (record.state === "terminal-unavailable" && event.kind === "force-reprobe") {
    if (!exact(event, ["kind", "authority", "attempt", "challenge"]) || !validAuthority(event.authority) || !validAttempt(event.attempt) || !validChallenge(event.challenge)) return reject("SHAPE:force-reprobe");
    const disposition = toProbing(record, { kind: "probe-start", attempt: event.attempt, challenge: event.challenge }, clone(event.authority));
    return disposition ? { ok: true, code: null, disposition, launch: true } : reject("BOUND:force-reprobe");
  }
  if (["unprobed", "invalidated"].includes(record.state) && event.kind === "probe-start") {
    const disposition = toProbing(record, event);
    return disposition ? { ok: true, code: null, disposition, launch: true } : reject("BOUND:probe-start");
  }
  if (record.state === "transient-unavailable" && event.kind === "probe-start") {
    if (!validStart(event)) return reject("SHAPE:probe-start");
    if (event.attempt.startedMonotonicMs < record.expiry.eligibleAfterMonotonicMs) return reject("UNAVAILABLE:transient-ttl");
    const disposition = toProbing(record, event);
    return disposition ? { ok: true, code: null, disposition, launch: true } : reject("BOUND:probe-start");
  }
  if (record.state === "terminal-unavailable") return reject("UNAVAILABLE:terminal");
  if (record.state === "available-attested") return reject(event.kind === "probe-success" ? "REPLAY:attestation" : "UNAVAILABLE:attested");
  return reject("CONFLICT:transition");
}
