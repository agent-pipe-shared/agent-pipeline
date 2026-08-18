// SPDX-License-Identifier: SUL-1.0

import { createHash } from "node:crypto";

export const BOOTSTRAP_PAYLOAD_SCHEMA = "pipeline.bootstrap-payload-measurement.v1";
/**
 * THE single owner of the bootstrap payload budget: every call site imports this
 * constant, none restates it. It was raised on 2026-08-08 (GF-057) on the PO's
 * explicit authorization, with the reasoning recorded above the assertion in
 * skills/pipeline-start/pipeline-start-v3.test.mjs. That raise reached only one
 * of the then-five copies, and the disagreeing copies are exactly what this
 * constant now prevents: bootstrap-payload-measure.test.mjs asserts that no
 * consumer carries a second literal of this number. Raised again 2026-08-18
 * (PO decision) from 18,000 to 45,000, in the same step that raised
 * `HANDOVER_MAX_BYTES` (`lib/handover-rotation.mjs`) from 12,000 to 30,000 --
 * preserving that constant's original 1.5x-headroom relationship to this one
 * (18,000/12,000 = 45,000/30,000 = 1.5) rather than letting the handover cap
 * alone exceed the whole bootstrap budget.
 */
export const BOOTSTRAP_PAYLOAD_MAX_BYTES = 45_000;

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
