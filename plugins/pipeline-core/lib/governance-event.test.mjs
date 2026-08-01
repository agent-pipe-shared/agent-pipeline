#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Focused contract tests for the PHX-1 schema/registry foundation. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  GOVERNANCE_EVENT_DIGEST_DOMAIN,
  MAX_GOVERNANCE_EVENT_BYTES,
  MAX_GOVERNANCE_PAYLOAD_BYTES,
  canonicalizeJson,
  eventDigest,
  parseStrictJson,
  sealGovernanceEvent,
  validateGovernanceEventEnvelope,
} from "./governance-event.mjs";

const repositoryRoot = new URL("../../../", import.meta.url);
const loadJson = (relativePath) => JSON.parse(readFileSync(new URL(relativePath, repositoryRoot), "utf8"));
const sha256 = /^[a-f0-9]{64}$/u;

const envelope = loadJson("governance/schemas/governance-event-envelope.schema.json");
const registrySchema = loadJson("governance/schemas/governance-stream-registry.schema.json");
const receipt = loadJson("governance/schemas/governance-event-receipt.schema.json");
const capturePolicy = loadJson("governance/schemas/governance-capture-policy.schema.json");
const registry = loadJson("governance/events/registry.json");
const pipelineState = loadJson("project/pipeline-state.json");

function assertClosed(schema, label) {
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema", `${label} must identify its draft`);
  assert.equal(schema.type, "object", `${label} must be an object`);
  assert.equal(schema.additionalProperties, false, `${label} must reject unknown top-level fields`);
  assert.ok(Array.isArray(schema.required) && schema.required.length > 0, `${label} must have required fields`);
  for (const name of schema.required) assert.ok(Object.hasOwn(schema.properties, name), `${label} requires declared ${name}`);
}

function assertObjectClosed(schema, label) {
  if (schema && typeof schema === "object") {
    if (schema.type === "object" && schema.properties && label !== "envelope.payload") {
      assert.equal(schema.additionalProperties, false, `${label} must be closed`);
    }
    if (schema.properties) {
      for (const [key, child] of Object.entries(schema.properties)) assertObjectClosed(child, `${label}.${key}`);
    }
    if (schema.$defs) {
      for (const [key, child] of Object.entries(schema.$defs)) assertObjectClosed(child, `${label}.$defs.${key}`);
    }
    if (schema.items) assertObjectClosed(schema.items, `${label}.items`);
    for (const key of ["allOf", "oneOf"]) {
      for (const child of schema[key] ?? []) assertObjectClosed(child, `${label}.${key}`);
    }
    if (schema.if) assertObjectClosed(schema.if, `${label}.if`);
    if (schema.then) assertObjectClosed(schema.then, `${label}.then`);
  }
}

function eventFixture(overrides = {}) {
  const unavailable = { state: "not-applicable" };
  return {
    schema: "pipeline.governance-event-envelope.v1",
    payloadSchema: "pipeline.lifecycle-governance-event.v1",
    canonicalization: "RFC8785",
    digestAlgorithm: "sha-256",
    eventId: "evt-1",
    idempotencyKey: "idem-1",
    origin: "lifecycle",
    authorityClass: "non-authoritative",
    eventType: "lifecycle.started",
    occurredAtEpochMs: 0,
    observedAtEpochMs: 0,
    timeAssurance: "unknown",
    repositoryFingerprint: registry.repositoryFingerprint,
    sourceUri: `urn:pipeline:repository:${registry.repositoryFingerprint}`,
    streamId: "lifecycle",
    sequence: 1,
    previousEventDigest: null,
    eventDigest: "a".repeat(64),
    correlation: {
      featureId: unavailable,
      packageId: unavailable,
      requestId: unavailable,
      sessionId: unavailable,
      dispatchId: unavailable,
      traceId: unavailable,
    },
    candidate: unavailable,
    artifacts: [unavailable],
    policy: {
      policyDigest: unavailable,
      configurationDigest: unavailable,
      capturePolicyDigest: unavailable,
      redactionPolicyDigest: unavailable,
    },
    classification: "repository-public-safe",
    storageProfile: "repository-public-safe",
    retentionCompatibility: "repository-retained",
    disclosureClass: "repository-visible",
    payloadDigest: "b".repeat(64),
    payload: {},
    ...overrides,
  };
}

function validateFocusedEnvelope(value) {
  const required = envelope.required;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (Object.keys(value).length !== required.length || Object.keys(value).some((key) => !required.includes(key))) return false;
  if (value.schema !== envelope.properties.schema.const || value.canonicalization !== "RFC8785" || value.digestAlgorithm !== "sha-256") return false;
  if (!sha256.test(value.repositoryFingerprint) || value.sourceUri !== `urn:pipeline:repository:${value.repositoryFingerprint}`) return false;
  if (!Number.isSafeInteger(value.sequence) || value.sequence < 1 || !sha256.test(value.eventDigest) || !sha256.test(value.payloadDigest)) return false;
  const expectedPayload = {
    human: "pipeline.human-governance-decision.v1",
    agent: "pipeline.agent-decision-event.v1",
    lifecycle: "pipeline.lifecycle-governance-event.v1",
  };
  if (expectedPayload[value.origin] !== value.payloadSchema) return false;
  if ((value.origin === "human") !== (value.authorityClass === "human-authority")) return false;
  if (value.storageProfile === "repository-public-safe" && (value.classification !== "repository-public-safe" || value.retentionCompatibility !== "repository-retained")) return false;
  if (value.storageProfile === "restricted-machine-local" && (value.classification !== "restricted" || value.retentionCompatibility !== "machine-local-expiring")) return false;
  return true;
}

test("all four v1 contracts are closed Draft 2020-12 schemas with stable identities", () => {
  const contracts = [
    [envelope, "pipeline.governance-event-envelope.v1"],
    [registrySchema, "pipeline.governance-stream-registry.v1"],
    [receipt, "pipeline.governance-event-receipt.v1"],
    [capturePolicy, "pipeline.governance-capture-policy.v1"],
  ];
  for (const [schema, identity] of contracts) {
    assertClosed(schema, identity);
    assert.match(schema.$id, new RegExp(`${identity.replaceAll(".", "\\.")}\\.json$`, "u"));
    assertObjectClosed(schema, identity);
  }
});

test("envelope binds each origin to its payload and cannot collapse authority", () => {
  assert.equal(validateFocusedEnvelope(eventFixture()), true);
  assert.equal(validateFocusedEnvelope(eventFixture({ origin: "human" })), false);
  assert.equal(validateFocusedEnvelope(eventFixture({ authorityClass: "human-authority" })), false);
  assert.equal(validateFocusedEnvelope(eventFixture({ payloadSchema: "pipeline.agent-decision-event.v1" })), false);
});

test("envelope rejects unknown fields and preserves the six exact typed absence states", () => {
  assert.equal(validateFocusedEnvelope({ ...eventFixture(), privatePath: "/home/private" }), false);
  const states = envelope.$defs.typedState.properties.state.enum;
  assert.deepEqual(states, ["unknown", "unavailable", "omitted-by-policy", "redacted", "invalid", "not-applicable"]);
  for (const state of states) {
    const fixture = eventFixture({ correlation: { ...eventFixture().correlation, traceId: { state } } });
    assert.equal(validateFocusedEnvelope(fixture), true, `${state} must remain a typed state`);
  }
});

test("checked-in registry is repository-bound genesis, not a mutable head", () => {
  assert.equal(registry.schema, "pipeline.governance-stream-registry.v1");
  assert.match(registry.repositoryFingerprint, sha256);
  assert.equal(registry.repositoryFingerprint, pipelineState.planApproval.poGateAuthority.repositoryFingerprint);
  assert.equal(registry.storageRoot, "governance/events");
  assert.equal(registry.eventDigestDomain, "pipeline.governance-event.v1\0");
  assert.deepEqual(registry.streams.map((stream) => stream.streamId), ["human", "agent", "lifecycle"]);
  for (const stream of registry.streams) {
    assert.equal(stream.origin, stream.streamId);
    assert.equal(stream.relativeRoot, stream.streamId);
    assert.deepEqual(stream.genesis, { sequence: 0, eventDigest: null });
    assert.equal(stream.storageProfile, "repository-public-safe");
  }
  assert.equal(registry.streams[0].authorityClass, "human-authority");
  assert.ok(registry.streams.slice(1).every((stream) => stream.authorityClass === "non-authoritative"));
  assert.ok(!Object.hasOwn(registry, "head"));
  assert.ok(!Object.hasOwn(registry, "heads"));
});

test("capture policy is default-deny and represents portable, restricted, and denied capture without reason text", () => {
  assert.equal(capturePolicy.properties.defaultAction.const, "deny");
  const stream = capturePolicy.$defs.streamPolicy;
  assert.deepEqual(stream.properties.storageProfile.enum, ["repository-public-safe", "restricted-machine-local", "deny"]);
  assert.deepEqual(stream.properties.personalIdentifiability.enum, ["prohibited", "restricted-only"]);
  assert.equal(capturePolicy.$defs.receiptPolicy.properties.allowReasonText.const, false);
  const portable = stream.allOf[0].then.properties;
  assert.equal(portable.personalIdentifiability.const, "prohibited");
  assert.equal(portable.contextualIdentifiability.const, "prohibited");
  assert.equal(portable.retention.const, "repository-retained");
  const restricted = stream.allOf[1].then.properties;
  assert.equal(restricted.retention.const, "machine-local-expiring");
  assert.ok(restricted.disclosure.enum.includes("machine-local-only"));
});

test("receipt checkpoint is independently repository and candidate bound", () => {
  const checkpoint = receipt.$defs.checkpoint;
  assert.deepEqual(checkpoint.required, ["repositoryFingerprint", "streamId", "sequence", "eventDigest", "candidateCommit", "candidateTree"]);
  assert.match(receipt.properties.eventPath.pattern, /^\^governance\/events\//u);
  assert.deepEqual(receipt.properties.operation.enum, ["append", "recover"]);
  assert.deepEqual(receipt.properties.outcome.enum, ["appended", "idempotent-replay", "recovered"]);
});

test("RFC 8785-compatible canonicalization sorts member names and uses one UTF-8 representation", () => {
  assert.equal(canonicalizeJson({ z: [3, true], a: "é", b: 1 }), "{\"a\":\"é\",\"b\":1,\"z\":[3,true]}");
  assert.equal(canonicalizeJson({ control: "\u000f", zero: -0 }), "{\"control\":\"\\u000f\",\"zero\":0}");
  const sealed = sealGovernanceEvent(eventFixture());
  assert.equal(sealed.payloadDigest, "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a");
  assert.equal(sealed.eventDigest, eventDigest(sealed));
  assert.equal(validateGovernanceEventEnvelope(sealed).valid, true);
  assert.equal(eventDigest({ ...sealed, eventDigest: "f".repeat(64) }), sealed.eventDigest);
  assert.equal(GOVERNANCE_EVENT_DIGEST_DOMAIN, "pipeline.governance-event.v1\0");
});

test("strict JSON rejects duplicate keys, malformed UTF-8, and lone Unicode surrogates", () => {
  assert.throws(() => parseStrictJson("{\"key\":1,\"key\":2}"), /GE-JSON-DUPLICATE-KEY/u);
  assert.throws(() => parseStrictJson(new Uint8Array([0xc3, 0x28])), /TypeError/u);
  assert.throws(() => parseStrictJson("\"\\ud800\""), /GE-UNICODE/u);
  assert.throws(() => canonicalizeJson("\ud800"), /GE-UNICODE/u);
  assert.equal(parseStrictJson("{\"b\":2,\"a\":1}").a, 1);
});

test("primitive validation rejects unknown fields, cross-origin payloads, and digest tampering", () => {
  const sealed = sealGovernanceEvent(eventFixture());
  const unknown = validateGovernanceEventEnvelope({ ...sealed, untrusted: "value" });
  assert.equal(unknown.valid, false);
  assert.ok(unknown.errors.includes("envelope-unknown-or-missing-field"));
  const crossOrigin = validateGovernanceEventEnvelope({ ...sealed, origin: "agent" });
  assert.equal(crossOrigin.valid, false);
  assert.ok(crossOrigin.errors.includes("origin-payload-schema"));
  const modifiedPayload = validateGovernanceEventEnvelope({ ...sealed, payload: { changed: true } });
  assert.equal(modifiedPayload.valid, false);
  assert.ok(modifiedPayload.errors.includes("payload-digest-mismatch"));
  assert.ok(modifiedPayload.errors.includes("event-digest-mismatch"));
});

test("primitive validation enforces payload and full-envelope size limits before storage", () => {
  const oversizedPayload = eventFixture({ payload: { data: "x".repeat(MAX_GOVERNANCE_PAYLOAD_BYTES) } });
  const payloadResult = validateGovernanceEventEnvelope(oversizedPayload, { verifyDigests: false });
  assert.equal(payloadResult.valid, false);
  assert.ok(payloadResult.errors.includes("payload-size-limit"));
  const oversizedEnvelope = eventFixture({ payload: { data: "x".repeat(MAX_GOVERNANCE_EVENT_BYTES) } });
  const envelopeResult = validateGovernanceEventEnvelope(oversizedEnvelope, { verifyDigests: false });
  assert.equal(envelopeResult.valid, false);
  assert.ok(envelopeResult.errors.includes("event-size-limit"));
});
