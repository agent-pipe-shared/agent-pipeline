// SPDX-License-Identifier: SUL-1.0

import { createHash } from "node:crypto";

export const BOOTSTRAP_PAYLOAD_SCHEMA = "pipeline.bootstrap-payload-measurement.v1";
export const BOOTSTRAP_PAYLOAD_MAX_BYTES = 15_000;

function text(value) {
  return typeof value === "string" ? value : JSON.stringify(value ?? null);
}

/**
 * Conservative runner-neutral upper bound: one UTF-8 byte is one token unit.
 * It intentionally never claims to be a model tokenizer measurement.
 */
export function measureBootstrapPayload(value, { mode = "normal", runner = "runner-neutral" } = {}) {
  const serialized = text(value);
  const bytes = Buffer.byteLength(serialized, "utf8");
  return Object.freeze({
    schema: BOOTSTRAP_PAYLOAD_SCHEMA,
    metric: "utf8-byte-upper-bound",
    exactModelTokens: false,
    mode,
    runner,
    bytes,
    upperBoundUnits: bytes,
    maxUpperBoundUnits: BOOTSTRAP_PAYLOAD_MAX_BYTES,
    withinBudget: bytes <= BOOTSTRAP_PAYLOAD_MAX_BYTES,
    digestSha256: createHash("sha256").update(serialized).digest("hex"),
  });
}

export function measureBootstrapBytes(bytes, { mode = "normal", runner = "runner-neutral" } = {}) {
  const upperBoundUnits = Number(bytes);
  return Object.freeze({
    schema: BOOTSTRAP_PAYLOAD_SCHEMA,
    metric: "utf8-byte-upper-bound",
    exactModelTokens: false,
    mode,
    runner,
    bytes: upperBoundUnits,
    upperBoundUnits,
    maxUpperBoundUnits: BOOTSTRAP_PAYLOAD_MAX_BYTES,
    withinBudget: upperBoundUnits <= BOOTSTRAP_PAYLOAD_MAX_BYTES,
  });
}

export function boundedPayload(value, options = {}) {
  const originalMeasurement = measureBootstrapPayload(value, options);
  if (originalMeasurement.withinBudget) {
    return {
      value,
      measurement: originalMeasurement,
      originalMeasurement,
      emittedMeasurement: originalMeasurement,
      overBudget: false,
      truncated: false,
    };
  }
  const compact = {
    code: value?.code ?? null,
    featureId: value?.featureId ?? null,
    phase: value?.phase ?? null,
    revision: value?.revision ?? null,
    workResumptionAllowed: value?.workResumptionAllowed === true,
  };
  const emittedMeasurement = measureBootstrapPayload(compact, options);
  return {
    value: compact,
    measurement: emittedMeasurement,
    originalMeasurement,
    emittedMeasurement,
    overBudget: true,
    truncated: true,
  };
}

export function selectLazyReferences({ code, role = "elephant", ready = false } = {}) {
  if (ready || code === "PCR-READY") return [];
  const refs = ["references/onboarding-recovery.md"];
  if (["critic", "goldfish"].includes(role)) refs.push("references/role-specific.md");
  if (code === "PCR-DECISION-PENDING" || code === "PCR-BLOCKED") refs.push("references/continuation.md");
  return refs;
}
