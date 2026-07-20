// SPDX-License-Identifier: Apache-2.0

/**
 * A runner-neutral, sanitized evidence contract for advisory work.
 *
 * This is intentionally separate from route-receipt: advisory has two valid
 * adapters (native and fresh consult) and must record the chosen adapter and
 * any fallback without retaining the question or answer themselves.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { validateAgainstSchema } from "./schema-lite.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(HERE, "..", "scripts", "advisory-receipt.schema.json");
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const GIT_OBJECT = /^[a-f0-9]{40,64}$/;

export const ADVISORY_RECEIPT_SCHEMA = "pipeline.advisory-receipt.v1";
export const ADVISORY_PROFILES = Object.freeze(["epic", "feature", "mini"]);
export const ADVISORY_ADAPTERS = Object.freeze(["native", "consult"]);

export function loadAdvisoryReceiptSchema(path = SCHEMA_PATH) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function exactKeys(value, names) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === names.length
    && names.every((name) => Object.prototype.hasOwnProperty.call(value, name));
}

function providerForRunner(runner) {
  return runner === "claude" ? "anthropic" : runner === "codex" ? "openai" : null;
}

function validIdentity(identity) {
  return exactKeys(identity, ["provider", "modelId", "effort"])
    && ["anthropic", "openai"].includes(identity.provider)
    && MODEL_ID.test(identity.modelId ?? "")
    && ["low", "medium", "high", "xhigh", "max", "not-applicable"].includes(identity.effort);
}

function semanticFailure(reason) {
  if (reason === "none") return null;
  if (reason.endsWith("unavailable")) return "unavailable";
  if (reason.endsWith("timeout")) return "timeout";
  if (reason.endsWith("permission-denied")) return "permission-denied";
  return "failure";
}

/**
 * Validate a receipt without treating an agent's self-report as route
 * attestation. Callers that need route attestation must bind this receipt to
 * their own dispatch/route evidence separately.
 */
export function validateAdvisoryReceipt(receipt, schema = loadAdvisoryReceiptSchema()) {
  try {
    const structural = validateAgainstSchema(receipt, schema);
    if (!structural.valid) return { ok: false, reason: "schema", errors: structural.errors };
  } catch {
    return { ok: false, reason: "schema", errors: [] };
  }

  const { dispatch, configuredRoute, observed, fallback } = receipt;
  if (receipt.schema !== ADVISORY_RECEIPT_SCHEMA
    || !ID.test(receipt.receiptId ?? "")
    || receipt.duty !== "advisory"
    || !ADVISORY_PROFILES.includes(receipt.profile)
    || !Number.isSafeInteger(receipt.emittedAtMs) || receipt.emittedAtMs < 0) {
    return { ok: false, reason: "header" };
  }
  if (!exactKeys(dispatch, ["dispatchId", "queueRevision", "candidateCommit", "candidateTree"])
    || !ID.test(dispatch.dispatchId ?? "")
    || !Number.isSafeInteger(dispatch.queueRevision) || dispatch.queueRevision < 0
    || !GIT_OBJECT.test(dispatch.candidateCommit ?? "") || !GIT_OBJECT.test(dispatch.candidateTree ?? "")) {
    return { ok: false, reason: "dispatch-binding" };
  }
  if (!exactKeys(configuredRoute, ["runner", "selector", "effort"])
    || !["claude", "codex"].includes(configuredRoute.runner)
    || !exactKeys(configuredRoute.selector, ["kind", "value"])
    || !["alias", "model-id"].includes(configuredRoute.selector.kind)
    || !MODEL_ID.test(configuredRoute.selector.value ?? "")
    || !["low", "medium", "high", "xhigh", "max", "not-applicable"].includes(configuredRoute.effort)
    || !ADVISORY_ADAPTERS.includes(receipt.adapter)) {
    return { ok: false, reason: "configured-route" };
  }
  if (!exactKeys(observed, ["status", "identity"])
    || !["answered", "unavailable", "failed", "timed-out", "permission-denied"].includes(observed.status)
    || (observed.identity !== null && !validIdentity(observed.identity))) {
    return { ok: false, reason: "observed" };
  }
  if (observed.identity !== null && observed.identity.provider !== providerForRunner(configuredRoute.runner)) {
    return { ok: false, reason: "observed-runner-drift" };
  }
  if (!SHA256.test(receipt.questionSha256 ?? "")
    || (receipt.answerSha256 !== null && !SHA256.test(receipt.answerSha256 ?? ""))) {
    return { ok: false, reason: "content-digest" };
  }
  if (observed.status === "answered") {
    if (observed.identity === null || receipt.answerSha256 === null) return { ok: false, reason: "answered-incomplete" };
  } else if (receipt.answerSha256 !== null) {
    return { ok: false, reason: "failure-answer" };
  }
  if (!exactKeys(fallback, ["reason", "redactedErrorClass"])) return { ok: false, reason: "fallback" };
  const requiredErrorClass = semanticFailure(fallback.reason);
  if (requiredErrorClass === null ? fallback.redactedErrorClass !== null : fallback.redactedErrorClass !== requiredErrorClass) {
    return { ok: false, reason: "fallback-binding" };
  }
  return { ok: true };
}
