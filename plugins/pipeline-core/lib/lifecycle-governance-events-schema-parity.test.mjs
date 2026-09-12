#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { LifecycleGovernanceEventError, validateLifecycleGovernanceEvent } from "./lifecycle-governance-events.mjs";

const schema = JSON.parse(readFileSync(new URL("../../../governance/schemas/lifecycle-governance-event.schema.json", import.meta.url), "utf8"));
const correlationSchema = schema.$defs.correlation;
const correlationFields = ["packageId", "dispatchId", "attemptId", "workerId", "correlationId", "queueRevision"];
const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };

function event(correlation) {
  return {
    eventId: "lifecycle-parity-1",
    kind: "dispatch",
    status: "active",
    reasonCode: "DISPATCHED",
    correlation,
    candidate,
    invalidatesEventId: null,
    supersedesEventId: null,
  };
}

function correlation() {
  return {
    packageId: "package-1",
    dispatchId: "dispatch-1",
    attemptId: "attempt-1",
    workerId: "worker-1",
    correlationId: "correlation-1",
    queueRevision: 0,
  };
}

function resolveRef(node) {
  if (node.$ref === undefined) return node;
  assert.match(node.$ref, /^#\/\$defs\/[A-Za-z0-9_-]+$/u);
  return schema.$defs[node.$ref.split("/").at(-1)];
}

function schemaAcceptsCorrelation(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  if (correlationSchema.additionalProperties === false
    && Object.keys(value).some((key) => !Object.hasOwn(correlationSchema.properties, key))) return false;
  if (correlationSchema.required.some((key) => !Object.hasOwn(value, key))) return false;
  for (const [key, rawRule] of Object.entries(correlationSchema.properties)) {
    const rule = resolveRef(rawRule);
    const field = value[key];
    if (rule.type === "string" && (typeof field !== "string" || !(new RegExp(rule.pattern, "u")).test(field))) return false;
    if (rule.type === "integer" && (!Number.isInteger(field) || field < rule.minimum || field > rule.maximum)) return false;
  }
  return true;
}

function runtimeAcceptsCorrelation(value) {
  try {
    validateLifecycleGovernanceEvent(event(value));
    return true;
  } catch (error) {
    assert.ok(error instanceof LifecycleGovernanceEventError);
    return false;
  }
}

test("LND-0 publishes the runtime's exact six-field correlation shape", () => {
  assert.equal(correlationSchema.type, "object");
  assert.equal(correlationSchema.additionalProperties, false);
  assert.deepEqual(correlationSchema.required, correlationFields);
  assert.deepEqual(Object.keys(correlationSchema.properties), correlationFields);
  for (const field of correlationFields.slice(0, 5)) {
    assert.deepEqual(correlationSchema.properties[field], { $ref: "#/$defs/id" });
  }
  assert.deepEqual(correlationSchema.properties.queueRevision, {
    type: "integer",
    minimum: 0,
    maximum: Number.MAX_SAFE_INTEGER,
  });
});

test("LND-0 schema and runtime accept the same positive correlation boundaries", () => {
  for (const valid of [
    correlation(),
    { ...correlation(), packageId: "A", correlationId: `z${"0".repeat(127)}` },
    { ...correlation(), queueRevision: Number.MAX_SAFE_INTEGER },
  ]) {
    assert.equal(schemaAcceptsCorrelation(valid), true, JSON.stringify(valid));
    assert.equal(runtimeAcceptsCorrelation(valid), true, JSON.stringify(valid));
  }
});

test("LND-0 schema and runtime reject every missing, extra or malformed correlation field", () => {
  const invalid = [];
  for (const field of correlationFields) {
    const value = correlation();
    delete value[field];
    invalid.push(value);
  }
  invalid.push(
    { ...correlation(), extra: "not-closed" },
    { ...correlation(), packageId: "" },
    { ...correlation(), dispatchId: "-dispatch" },
    { ...correlation(), attemptId: "/private/path" },
    { ...correlation(), workerId: `w${"0".repeat(128)}` },
    { ...correlation(), correlationId: null },
    { ...correlation(), queueRevision: -1 },
    { ...correlation(), queueRevision: 1.5 },
    { ...correlation(), queueRevision: "0" },
    { ...correlation(), queueRevision: Number.MAX_SAFE_INTEGER + 1 },
    null,
    [],
  );
  for (const value of invalid) {
    const published = schemaAcceptsCorrelation(value);
    const runtime = runtimeAcceptsCorrelation(value);
    assert.equal(published, false, `published schema admitted ${JSON.stringify(value)}`);
    assert.equal(runtime, false, `runtime admitted ${JSON.stringify(value)}`);
    assert.equal(published, runtime, `schema/runtime drift for ${JSON.stringify(value)}`);
  }
});
