// SPDX-License-Identifier: SUL-1.0

/** A no-child route decision is distinct from an actual Advisor attempt. */
import { createHash } from "node:crypto";

export const ADVISORY_ROUTE_SELECTION_SCHEMA = "pipeline.advisory-route-selection.v1";
const SHA256 = /^[a-f0-9]{64}$/u;
const OID = /^[a-f0-9]{40,64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const STATUS_FOR_CODE = Object.freeze({
  "ordinary-consult-host-callback-unavailable": "unavailable",
  "ordinary-consult-host-route-unavailable": "unavailable",
  "advisor-repository-export-declined": "permission-denied",
  "advisor-host-export-denied": "permission-denied",
});
function exact(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

/** The caller must persist receipt bytes before it creates this binding. */
export function createAdvisoryRouteSelection({ receipt, receiptBytes, code, evidenceSha256 = null } = {}) {
  const value = {
    schema: ADVISORY_ROUTE_SELECTION_SCHEMA,
    dispatchId: receipt?.dispatch?.dispatchId,
    receiptSha256: Buffer.isBuffer(receiptBytes) ? digest(receiptBytes) : null,
    candidate: { commit: receipt?.dispatch?.candidateCommit, tree: receipt?.dispatch?.candidateTree },
    runner: receipt?.configuredRoute?.runner,
    route: "ordinary-fresh-consult",
    status: receipt?.observed?.status,
    code,
    questionSha256: receipt?.questionSha256,
    evidenceSha256,
    childStarted: false,
    attemptCount: 0,
  };
  const checked = validateAdvisoryRouteSelection({ selection: value, receipt, receiptBytes });
  if (!checked.ok) throw new Error(checked.code);
  return value;
}

export function validateAdvisoryRouteSelection({ selection, receipt, receiptBytes } = {}) {
  if (!exact(selection, ["schema", "dispatchId", "receiptSha256", "candidate", "runner", "route", "status", "code", "questionSha256", "evidenceSha256", "childStarted", "attemptCount"])
    || selection.schema !== ADVISORY_ROUTE_SELECTION_SCHEMA
    || !ID.test(selection.dispatchId ?? "") || !SHA256.test(selection.receiptSha256 ?? "")
    || !exact(selection.candidate, ["commit", "tree"])
    || !OID.test(selection.candidate.commit ?? "") || !OID.test(selection.candidate.tree ?? "")
    || selection.runner !== "codex" || selection.route !== "ordinary-fresh-consult"
    || !["unavailable", "permission-denied"].includes(selection.status)
    || !Object.hasOwn(STATUS_FOR_CODE, selection.code)
    || !SHA256.test(selection.questionSha256 ?? "")
    || (selection.evidenceSha256 !== null && !SHA256.test(selection.evidenceSha256 ?? ""))
    || selection.childStarted !== false || selection.attemptCount !== 0
    || !Buffer.isBuffer(receiptBytes) || selection.receiptSha256 !== digest(receiptBytes)
    || selection.dispatchId !== receipt?.dispatch?.dispatchId
    || selection.candidate.commit !== receipt?.dispatch?.candidateCommit
    || selection.candidate.tree !== receipt?.dispatch?.candidateTree
    || selection.questionSha256 !== receipt?.questionSha256
    || selection.runner !== receipt?.configuredRoute?.runner
    || selection.status !== receipt?.observed?.status
    || receipt?.adapter !== "consult" || receipt?.answerSha256 !== null
    || receipt?.observed?.identity !== null) return { ok: false, code: "advisor-route-selection-binding" };
  if (selection.status !== STATUS_FOR_CODE[selection.code]) {
    return { ok: false, code: "advisor-route-selection-status" };
  }
  return { ok: true };
}
