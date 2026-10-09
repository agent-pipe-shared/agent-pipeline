// SPDX-License-Identifier: SUL-1.0
// Test-only RED pins for the shared continuity capacity contract.
// The follow-up implementation may add the normalizer and canonical shape, but
// must not edit these acceptance cases (QG-04).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { validateAgainstSchema } from "./schema-lite.mjs";

const moduleUrl = (relative) => new URL(relative, import.meta.url).href;

async function loadModule(relative) {
  try {
    return await import(moduleUrl(relative));
  } catch (error) {
    return assert.fail(`RED: cannot import ${relative} (${error?.code ?? error?.name})`);
  }
}

async function loadNormalizer() {
  const mod = await loadModule("./continuity-state.mjs");
  if (!Object.hasOwn(mod, "normalizeContinuityCapacity") || mod.normalizeContinuityCapacity === undefined) {
    assert.fail("RED: missing export normalizeContinuityCapacity in ./continuity-state.mjs");
  }
  assert.equal(typeof mod.normalizeContinuityCapacity, "function");
  return mod.normalizeContinuityCapacity;
}

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const D = "d".repeat(64);
const FEATURE = "capacity-compat-fixture";

function capacity(limit = 10, fallbackPolicy = "defer") {
  return { concurrencyLimit: limit, allocation: "shared", fallbackPolicy };
}

function legacyCapacity(limit = 10, fallbackPolicy = "defer") {
  return {
    concurrencyLimit: limit,
    reservedCriticSlots: 1,
    reservedRecoverySlots: 1,
    fallbackPolicy,
  };
}

function continuityState(capacityValue = legacyCapacity()) {
  return {
    schema: "pipeline.continuity.v0",
    featureId: FEATURE,
    revision: 7,
    runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator", sessionCleanup: null },
    authority: {
      prd: { path: "specs/prd.md", sha256: A },
      spec: { path: "specs/spec.md", sha256: B },
      result: { path: "specs/result.md", sha256: C },
    },
    queueHead: {
      packageId: "P1",
      actionId: "capacity-reader",
      nextAction: "poll",
      productRetryCount: 0,
      environmentRerouteCount: 0,
      dispatch: {
        featureId: FEATURE,
        queueRevision: 7,
        packageId: "P1",
        actionId: "capacity-reader",
        dispatchId: "dispatch-capacity-01",
        attemptId: "attempt-01",
        authorityDigests: { prdSha256: A, specSha256: B, resultSha256: C },
        routeRequestSha256: D,
        mayDelegate: false,
      },
    },
    blocker: null,
    acknowledgedFinal: null,
    resume: { mode: "immediate", sourceRevision: 7, reasonCode: "active-turn" },
    recovery: null,
    decisionTxn: null,
    closeTransition: null,
    capacity: capacityValue,
  };
}

function schemaLiteView(value) {
  if (Array.isArray(value)) return value.map(schemaLiteView);
  if (value === null || typeof value !== "object") return value;
  const copy = {};
  for (const [key, child] of Object.entries(value)) {
    copy[key] = key === "type" && child === "integer" ? "number" : schemaLiteView(child);
  }
  return copy;
}

const schema = JSON.parse(readFileSync(fileURLToPath(new URL("../scripts/continuity-state.schema.json", import.meta.url)), "utf8"));
const capacitySchema = schema.properties.capacity;
const schemaLiteCapacitySchema = schemaLiteView(capacitySchema);

test("legacy full continuity state remains readable", async () => {
  const { validateContinuityState } = await loadModule("./continuity-state.mjs");
  assert.equal(validateContinuityState(continuityState(legacyCapacity())).ok, true);
});

test("canonical full continuity state validates with the runtime validator", async () => {
  const { validateContinuityState } = await loadModule("./continuity-state.mjs");
  assert.equal(validateContinuityState(continuityState(capacity())).ok, true);
});

test("formal capacity schema accepts the exact canonical and legacy objects", () => {
  assert.equal(validateAgainstSchema(legacyCapacity(), schemaLiteCapacitySchema).valid, true);
  assert.equal(validateAgainstSchema(capacity(), schemaLiteCapacitySchema).valid, true);
});

test("formal capacity schema rejects mixed and unknown capacity keys", () => {
  const legacyControl = legacyCapacity();
  const canonicalControl = capacity();
  assert.equal(validateAgainstSchema(legacyControl, schemaLiteCapacitySchema).valid, true);
  assert.equal(validateAgainstSchema(canonicalControl, schemaLiteCapacitySchema).valid, true);
  assert.equal(validateAgainstSchema({ ...canonicalControl, reservedCriticSlots: 1, reservedRecoverySlots: 1 }, schemaLiteCapacitySchema).valid, false);
  assert.equal(validateAgainstSchema({ ...canonicalControl, operatorOverride: true }, schemaLiteCapacitySchema).valid, false);
});

test("canonical and legacy pure reads normalize to the same shared shape", async () => {
  const normalize = await loadNormalizer();
  const expected = { ok: true, capacity: capacity() };
  assert.deepEqual(normalize(capacity()), expected);
  assert.deepEqual(normalize(legacyCapacity()), expected);
});

test("normalization preserves operator ceilings for legacy and canonical values", async () => {
  const normalize = await loadNormalizer();
  for (const limit of [2, 10, 12, 64]) {
    assert.deepEqual(normalize(capacity(limit)), { ok: true, capacity: capacity(limit) });
    assert.deepEqual(normalize(legacyCapacity(limit)), { ok: true, capacity: capacity(limit) });
  }
});

test("normalization refuses malformed numeric values from a valid canonical control", async () => {
  const normalize = await loadNormalizer();
  assert.deepEqual(normalize(capacity()), { ok: true, capacity: capacity() });
  for (const limit of [1, 65, 2.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    const invalid = { ...capacity(), concurrencyLimit: limit };
    assert.deepEqual(normalize(invalid), { ok: false, code: "CS-CAPACITY-SHAPE" }, `limit ${String(limit)}`);
  }
});

test("normalization refuses bad fallback, mixed legacy fields and unknown keys", async () => {
  const normalize = await loadNormalizer();
  assert.deepEqual(normalize(capacity()), { ok: true, capacity: capacity() });
  const invalidValues = [
    { ...capacity(), fallbackPolicy: "automatic" },
    { ...capacity(), reservedCriticSlots: 1, reservedRecoverySlots: 1 },
    { ...capacity(), operatorOverride: true },
  ];
  for (const invalid of invalidValues) {
    assert.deepEqual(normalize(invalid), { ok: false, code: "CS-CAPACITY-SHAPE" });
  }
});

test("normalization leaves deeply frozen caller state and its authority, approval, history and revision byte-identical", async () => {
  const normalize = await loadNormalizer();
  const caller = {
    state: continuityState(capacity(12, "pre-authorized-mapped-fallback")),
    approval: { decision: "approved", digest: A },
    history: [{ revision: 6, resultDigest: B }, { revision: 7, resultDigest: C }],
    revision: 7,
  };
  const freezeDeep = (value) => {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      for (const child of Object.values(value)) freezeDeep(child);
      Object.freeze(value);
    }
    return value;
  };
  const before = Buffer.from(JSON.stringify(caller));
  freezeDeep(caller);
  assert.deepEqual(normalize(caller.state.capacity), {
    ok: true,
    capacity: capacity(12, "pre-authorized-mapped-fallback"),
  });
  assert.deepEqual(Buffer.from(JSON.stringify(caller)), before);
});

test("runtime validator rejects bad integer limits while schema-lite documents its integer adaptation", async () => {
  const { validateContinuityState } = await loadModule("./continuity-state.mjs");
  const legacyControl = continuityState(legacyCapacity());
  assert.equal(validateContinuityState(legacyControl).ok, true);
  const fractional = continuityState(legacyCapacity(2.5));
  assert.equal(validateAgainstSchema(fractional.capacity, schemaLiteCapacitySchema).valid, true);
  assert.equal(validateContinuityState(fractional).ok, false);
  for (const limit of [1, 65, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(validateContinuityState(continuityState(legacyCapacity(limit))).ok, false, `limit ${String(limit)}`);
  }
});

