// SPDX-License-Identifier: SUL-1.0
/**
 * Pure PHX-1 governance-event primitives.
 *
 * This module deliberately performs no file, process, environment, or clock
 * access. Callers must supply an already classified request and use the store
 * as the sole persistence boundary.
 */
import { createHash } from "node:crypto";

export const GOVERNANCE_EVENT_SCHEMA = "pipeline.governance-event-envelope.v1";
export const GOVERNANCE_EVENT_CANONICALIZATION = "RFC8785";
export const GOVERNANCE_EVENT_DIGEST_ALGORITHM = "sha-256";
export const GOVERNANCE_EVENT_DIGEST_DOMAIN = "pipeline.governance-event.v1\0";
export const MAX_GOVERNANCE_EVENT_BYTES = 65_536;
export const MAX_GOVERNANCE_PAYLOAD_BYTES = 49_152;

const SHA256 = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const STREAM_ID = /^[a-z][a-z0-9-]{0,63}$/u;
const EVENT_TYPE = /^[a-z][a-z0-9.-]{0,127}$/u;
const ARTIFACT_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9][A-Za-z0-9._\/-]{0,255}$/u;
const TYPED_STATES = new Set(["unknown", "unavailable", "omitted-by-policy", "redacted", "invalid", "not-applicable"]);
const REQUIRED_ENVELOPE_KEYS = Object.freeze([
  "schema", "payloadSchema", "canonicalization", "digestAlgorithm", "eventId", "idempotencyKey", "origin", "authorityClass",
  "eventType", "occurredAtEpochMs", "observedAtEpochMs", "timeAssurance", "repositoryFingerprint", "sourceUri", "streamId",
  "sequence", "previousEventDigest", "eventDigest", "correlation", "candidate", "artifacts", "policy", "classification",
  "storageProfile", "retentionCompatibility", "disclosureClass", "payloadDigest", "payload",
]);
const CORRELATION_KEYS = Object.freeze(["featureId", "packageId", "requestId", "sessionId", "dispatchId", "traceId"]);
const POLICY_KEYS = Object.freeze(["policyDigest", "configurationDigest", "capturePolicyDigest", "redactionPolicyDigest"]);

export class GovernanceEventValidationError extends Error {
  constructor(errors) {
    super("Governance event validation failed.");
    this.name = "GovernanceEventValidationError";
    this.code = "GE-INVALID";
    this.errors = Object.freeze([...errors]);
  }
}

function isPlainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, expected) {
  return isPlainRecord(value)
    && Object.keys(value).length === expected.length
    && expected.every((key) => Object.hasOwn(value, key));
}

function isUnicodeScalarString(value) {
  if (typeof value !== "string") return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const low = value.charCodeAt(index + 1);
      if (!(low >= 0xdc00 && low <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function assertUnicodeScalarString(value) {
  if (!isUnicodeScalarString(value)) throw new TypeError("GE-UNICODE: strings must contain Unicode scalar values");
}

/** RFC 8785-compatible serialization for the JSON subset admitted by PHX-1. */
export function canonicalizeJson(value) {
  const stack = new Set();
  function encode(current) {
    if (current === null || typeof current === "boolean") return JSON.stringify(current);
    if (typeof current === "string") {
      assertUnicodeScalarString(current);
      return JSON.stringify(current);
    }
    if (typeof current === "number") {
      if (!Number.isFinite(current)) throw new TypeError("GE-NUMBER: non-finite numbers are forbidden");
      return JSON.stringify(current);
    }
    if (Array.isArray(current)) {
      if (stack.has(current)) throw new TypeError("GE-CYCLE: cyclic values are forbidden");
      stack.add(current);
      const result = `[${current.map((entry) => encode(entry)).join(",")}]`;
      stack.delete(current);
      return result;
    }
    if (!isPlainRecord(current)) throw new TypeError("GE-JSON-TYPE: only plain JSON objects are allowed");
    if (stack.has(current)) throw new TypeError("GE-CYCLE: cyclic values are forbidden");
    stack.add(current);
    const keys = Object.keys(current).sort(); // JCS sorts member names by UTF-16 code units.
    const result = `{${keys.map((key) => {
      assertUnicodeScalarString(key);
      return `${JSON.stringify(key)}:${encode(current[key])}`;
    }).join(",")}}`;
    stack.delete(current);
    return result;
  }
  return encode(value);
}

export function sha256Utf8(value) {
  if (typeof value !== "string") throw new TypeError("GE-HASH-INPUT: a UTF-8 string is required");
  assertUnicodeScalarString(value);
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function canonicalSha256(value) {
  return sha256Utf8(canonicalizeJson(value));
}

function typedState(value) {
  return exactKeys(value, ["state"]) && TYPED_STATES.has(value.state);
}

function idOrTypedState(value) {
  return (typeof value === "string" && ID.test(value)) || typedState(value);
}

function digestOrTypedState(value) {
  return (typeof value === "string" && SHA256.test(value)) || typedState(value);
}

function validateArtifact(value) {
  return typedState(value)
    || (exactKeys(value, ["path", "sha256"])
      && typeof value.path === "string"
      && ARTIFACT_PATH.test(value.path)
      && SHA256.test(value.sha256));
}

function validateCandidate(value) {
  return typedState(value)
    || (exactKeys(value, ["commit", "tree"])
      && typeof value.commit === "string"
      && typeof value.tree === "string"
      && OID.test(value.commit)
      && OID.test(value.tree));
}

function validateCorrelation(value) {
  return exactKeys(value, CORRELATION_KEYS) && CORRELATION_KEYS.every((key) => idOrTypedState(value[key]));
}

function validatePolicy(value) {
  return exactKeys(value, POLICY_KEYS) && POLICY_KEYS.every((key) => digestOrTypedState(value[key]));
}

function add(errors, code) { errors.push(code); }

function validateEnvelopeShape(value, errors) {
  if (!exactKeys(value, REQUIRED_ENVELOPE_KEYS)) {
    add(errors, "envelope-unknown-or-missing-field");
    return;
  }
  if (value.schema !== GOVERNANCE_EVENT_SCHEMA) add(errors, "schema");
  if (value.canonicalization !== GOVERNANCE_EVENT_CANONICALIZATION) add(errors, "canonicalization");
  if (value.digestAlgorithm !== GOVERNANCE_EVENT_DIGEST_ALGORITHM) add(errors, "digest-algorithm");
  if (typeof value.eventId !== "string" || !ID.test(value.eventId)) add(errors, "event-id");
  if (typeof value.idempotencyKey !== "string" || !ID.test(value.idempotencyKey)) add(errors, "idempotency-key");
  // The human stream carries two decision classes: the plan-era decision and
  // the bounded role exception. Every other origin stays single-class.
  const payloadByOrigin = {
    human: ["pipeline.human-governance-decision.v1", "pipeline.human-role-exception-decision.v1"],
    agent: ["pipeline.agent-decision-event.v1"],
    lifecycle: ["pipeline.lifecycle-governance-event.v1"],
  };
  if (!Object.hasOwn(payloadByOrigin, value.origin) || !payloadByOrigin[value.origin].includes(value.payloadSchema)) add(errors, "origin-payload-schema");
  if ((value.origin === "human" && value.authorityClass !== "human-authority") || (value.origin !== "human" && value.authorityClass !== "non-authoritative")) add(errors, "origin-authority-class");
  if (typeof value.eventType !== "string" || !EVENT_TYPE.test(value.eventType)) add(errors, "event-type");
  if (![value.occurredAtEpochMs, value.observedAtEpochMs, value.sequence].every((number) => Number.isSafeInteger(number) && number >= 0)) add(errors, "integer-range");
  if (value.sequence < 1) add(errors, "sequence");
  if (!["locally-observed", "externally-attested", "unknown"].includes(value.timeAssurance)) add(errors, "time-assurance");
  if (typeof value.repositoryFingerprint !== "string" || !SHA256.test(value.repositoryFingerprint)) add(errors, "repository-fingerprint");
  if (value.sourceUri !== `urn:pipeline:repository:${value.repositoryFingerprint}`) add(errors, "source-uri");
  if (typeof value.streamId !== "string" || !STREAM_ID.test(value.streamId) || value.streamId !== value.origin) add(errors, "stream-id");
  if (value.previousEventDigest !== null && (typeof value.previousEventDigest !== "string" || !SHA256.test(value.previousEventDigest))) add(errors, "previous-event-digest");
  if (typeof value.eventDigest !== "string" || !SHA256.test(value.eventDigest)) add(errors, "event-digest");
  if (!validateCorrelation(value.correlation)) add(errors, "correlation");
  if (!validateCandidate(value.candidate)) add(errors, "candidate");
  if (!Array.isArray(value.artifacts) || value.artifacts.length > 128 || !value.artifacts.every(validateArtifact)) add(errors, "artifacts");
  if (!validatePolicy(value.policy)) add(errors, "policy");
  if (!isPlainRecord(value.payload)) add(errors, "payload");
  if (typeof value.payloadDigest !== "string" || !SHA256.test(value.payloadDigest)) add(errors, "payload-digest");
  const portable = value.storageProfile === "repository-public-safe";
  const restricted = value.storageProfile === "restricted-machine-local";
  if (!portable && !restricted) add(errors, "storage-profile");
  if (portable && (value.classification !== "repository-public-safe" || value.retentionCompatibility !== "repository-retained" || !["repository-visible", "redacted", "omitted-by-policy"].includes(value.disclosureClass))) add(errors, "portable-policy-coherence");
  if (restricted && (value.classification !== "restricted" || value.retentionCompatibility !== "machine-local-expiring" || !["machine-local-only", "redacted", "omitted-by-policy"].includes(value.disclosureClass))) add(errors, "restricted-policy-coherence");
}

function canonicalBytes(value) {
  return Buffer.byteLength(canonicalizeJson(value), "utf8");
}

/** Return only typed public-safe error codes; never echo invalid user content. */
export function validateGovernanceEventEnvelope(value, { verifyDigests = true, enforceSizeLimits = true } = {}) {
  const errors = [];
  validateEnvelopeShape(value, errors);
  if (errors.length > 0) return { valid: false, errors };
  let payloadCanonical;
  let envelopeCanonical;
  try {
    payloadCanonical = canonicalizeJson(value.payload);
    envelopeCanonical = canonicalizeJson(value);
  } catch (error) {
    return { valid: false, errors: [error instanceof TypeError && error.message.startsWith("GE-") ? error.message.slice(0, error.message.indexOf(":")) : "canonicalization"] };
  }
  if (enforceSizeLimits) {
    if (Buffer.byteLength(payloadCanonical, "utf8") > MAX_GOVERNANCE_PAYLOAD_BYTES) errors.push("payload-size-limit");
    if (Buffer.byteLength(envelopeCanonical, "utf8") > MAX_GOVERNANCE_EVENT_BYTES) errors.push("event-size-limit");
  }
  if (verifyDigests) {
    if (value.payloadDigest !== sha256Utf8(payloadCanonical)) errors.push("payload-digest-mismatch");
    if (value.eventDigest !== eventDigest(value)) errors.push("event-digest-mismatch");
  }
  return { valid: errors.length === 0, errors };
}

/** Exact v1 preimage: omit only eventDigest, never substitute a placeholder. */
export function eventDigest(envelope) {
  if (!isPlainRecord(envelope) || !Object.hasOwn(envelope, "eventDigest")) throw new TypeError("GE-EVENT-DIGEST: an envelope with eventDigest is required");
  const preimage = Object.fromEntries(Object.entries(envelope).filter(([key]) => key !== "eventDigest"));
  return sha256Utf8(`${GOVERNANCE_EVENT_DIGEST_DOMAIN}${canonicalizeJson(preimage)}`);
}

/** Seal a structurally valid draft into a persisted envelope without mutating caller input. */
export function sealGovernanceEvent(draft) {
  const shape = validateGovernanceEventEnvelope(draft, { verifyDigests: false });
  if (!shape.valid) throw new GovernanceEventValidationError(shape.errors);
  const payloadDigest = canonicalSha256(draft.payload);
  const withPayloadDigest = { ...draft, payloadDigest };
  const sealed = { ...withPayloadDigest, eventDigest: eventDigest(withPayloadDigest) };
  const validated = validateGovernanceEventEnvelope(sealed);
  if (!validated.valid) throw new GovernanceEventValidationError(validated.errors);
  return Object.freeze(sealed);
}

/** Parse UTF-8 JSON while rejecting duplicate keys and non-scalar strings. */
export function parseStrictJson(input) {
  const source = input instanceof Uint8Array ? new TextDecoder("utf-8", { fatal: true }).decode(input) : input;
  if (typeof source !== "string" || source.startsWith("\ufeff")) throw new TypeError("GE-JSON: input must be BOM-free UTF-8 JSON");
  let offset = 0;
  const whitespace = () => { while (/[\u0009\u000a\u000d\u0020]/u.test(source[offset] ?? "")) offset += 1; };
  const fail = () => { throw new TypeError("GE-JSON: malformed JSON"); };
  const string = () => {
    if (source[offset] !== "\"") fail();
    offset += 1;
    let result = "";
    while (offset < source.length) {
      const char = source[offset++];
      if (char === "\"") {
        assertUnicodeScalarString(result);
        return result;
      }
      if (char < " ") fail();
      if (char !== "\\") { result += char; continue; }
      const escape = source[offset++];
      const simple = { "\"": "\"", "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
      if (Object.hasOwn(simple, escape)) { result += simple[escape]; continue; }
      if (escape !== "u") fail();
      const hex = source.slice(offset, offset + 4);
      if (!/^[0-9a-fA-F]{4}$/u.test(hex)) fail();
      result += String.fromCharCode(Number.parseInt(hex, 16));
      offset += 4;
    }
    fail();
  };
  const value = () => {
    whitespace();
    if (source[offset] === "\"") return string();
    if (source[offset] === "{") {
      offset += 1; whitespace();
      const object = Object.create(null); const keys = new Set();
      if (source[offset] === "}") { offset += 1; return object; }
      while (true) {
        whitespace(); const key = string(); whitespace(); if (source[offset++] !== ":") fail();
        if (keys.has(key)) throw new TypeError("GE-JSON-DUPLICATE-KEY: duplicate JSON object key");
        keys.add(key); object[key] = value(); whitespace();
        if (source[offset] === "}") { offset += 1; return object; }
        if (source[offset++] !== ",") fail();
      }
    }
    if (source[offset] === "[") {
      offset += 1; whitespace(); const array = [];
      if (source[offset] === "]") { offset += 1; return array; }
      while (true) { array.push(value()); whitespace(); if (source[offset] === "]") { offset += 1; return array; } if (source[offset++] !== ",") fail(); }
    }
    const token = source.slice(offset).match(/^(?:-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|true|false|null)/u)?.[0];
    if (!token) fail();
    offset += token.length;
    if (token === "true") return true;
    if (token === "false") return false;
    if (token === "null") return null;
    const number = Number(token);
    if (!Number.isFinite(number)) fail();
    return number;
  };
  const parsed = value(); whitespace(); if (offset !== source.length) fail(); return parsed;
}
