// SPDX-License-Identifier: SUL-1.0

/**
 * Pure admission predicate for the design-stage Advisor gate.
 *
 * This module deliberately does not dispatch an Advisor, make a runner claim,
 * or persist an approval.  It only validates the bounded, digest-based facts
 * produced by those other surfaces.
 */
import { createHash } from "node:crypto";
import { validateAdvisoryReceipt } from "./advisory-receipt.mjs";

export const DESIGN_ADVISORY_ADMISSION_SCHEMA = "pipeline.design-advisory-admission.v1";
const SHA256 = /^[a-f0-9]{64}$/;
const GIT = /^[a-f0-9]{40,64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const RUNNERS = ["claude", "codex", "antigravity"];
const FAILURES = ["capacity-unavailable", "permission-denied", "timeout", "invalid-output", "route-unavailable"];

function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function keys(value, expected) {
  return object(value) && Object.keys(value).length === expected.length
    && expected.every((key) => Object.hasOwn(value, key));
}
function text(value) { return typeof value === "string" && value.length > 0; }
function digest(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function fail(code, detail = code) { return { ok: false, code, detail }; }

export function designAdvisoryDigest(value) { return digest(value); }

function validWorkflow(value) {
  return keys(value, ["schema", "phase", "dispatchId", "candidateCommit", "candidateTree", "designSha256", "evidenceSha256"])
    && value.schema === DESIGN_ADVISORY_ADMISSION_SCHEMA
    && value.phase === "initial-design"
    && ID.test(value.dispatchId ?? "")
    && GIT.test(value.candidateCommit ?? "") && GIT.test(value.candidateTree ?? "")
    && SHA256.test(value.designSha256 ?? "") && SHA256.test(value.evidenceSha256 ?? "");
}

function expectedRoute(runner, nativeAvailable) {
  if (runner === "claude" && nativeAvailable === true) return "native";
  if (RUNNERS.includes(runner)) return "generic-consult";
  return null;
}

function validReceipt(receipt, workflow, runner, route, status) {
  if (!object(receipt) || !validateAdvisoryReceipt(receipt).ok
    || receipt.dispatch.dispatchId !== workflow.dispatchId
    || receipt.dispatch.candidateCommit !== workflow.candidateCommit
    || receipt.dispatch.candidateTree !== workflow.candidateTree
    || receipt.questionSha256 !== workflow.designSha256
    || receipt.configuredRoute.runner !== runner
    || receipt.adapter !== (route === "native" ? "native" : "consult")) return false;
  if (status === "complete") return receipt.observed.status === "answered";
  return receipt.observed.status !== "answered";
}

function validDisposition(value, workflow, receiptSha256) {
  if (!keys(value, ["decision", "rationale", "dispatchId", "designSha256", "evidenceSha256", "advisorReceiptSha256"])) return false;
  return ["accept", "decline"].includes(value.decision) && text(value.rationale)
    && value.dispatchId === workflow.dispatchId && value.designSha256 === workflow.designSha256
    && value.evidenceSha256 === workflow.evidenceSha256 && value.advisorReceiptSha256 === receiptSha256;
}

function validFinalException(value, workflow, failure) {
  return keys(value, ["kind", "approval", "oneTime", "approved", "rationale", "dispatchId", "designSha256", "evidenceSha256", "failureCode"])
    && value.kind === "advisor-unavailable" && value.approval === "final" && value.oneTime === true
    && value.approved === true && text(value.rationale) && value.dispatchId === workflow.dispatchId
    && value.designSha256 === workflow.designSha256 && value.evidenceSha256 === workflow.evidenceSha256
    && value.failureCode === failure;
}

/**
 * @returns {{ok:true, mode:string, route:string, consumesFinalException:boolean}|{ok:false,code:string,detail?:string}}
 */
export function evaluateDesignAdvisoryAdmission(input) {
  if (!keys(input, ["workflow", "runner", "nativeAvailable", "advisor", "advisorReceipt", "elephant", "finalException"])) return fail("input-shape");
  const { workflow, runner, nativeAvailable, advisor, advisorReceipt, elephant, finalException } = input;
  if (!validWorkflow(workflow)) return fail("workflow-binding");
  if (!RUNNERS.includes(runner)) return fail("runner-invalid");
  if (typeof nativeAvailable !== "boolean") return fail("capability-unobserved");
  const route = expectedRoute(runner, nativeAvailable);
  if (route === null) return fail("runner-invalid");
  if (!keys(advisor, ["status", "route", "mode", "readOnly", "dispatchId", "candidateCommit", "candidateTree", "designSha256", "evidenceSha256", "receiptSha256", "failureCode"])) return fail("advisor-shape");
  if (advisor.dispatchId !== workflow.dispatchId || advisor.candidateCommit !== workflow.candidateCommit || advisor.candidateTree !== workflow.candidateTree
    || advisor.designSha256 !== workflow.designSha256 || advisor.evidenceSha256 !== workflow.evidenceSha256) return fail("advisor-binding");
  if (advisor.status === "complete") {
    if (advisor.route !== route || advisor.mode !== "fresh-read-only" || advisor.readOnly !== true
      || !SHA256.test(advisor.receiptSha256 ?? "") || digest(advisorReceipt) !== advisor.receiptSha256
      || !validReceipt(advisorReceipt, workflow, runner, route, "complete")
      || advisor.failureCode !== null) return fail("advisor-not-fresh-read-only");
    if (!validDisposition(elephant, workflow, advisor.receiptSha256)) return fail("elephant-disposition-required");
    if (finalException !== null) return fail("unavailable-exception-unexpected");
    return { ok: true, mode: "consulted", route, consumesFinalException: false };
  }
  if (advisor.status !== "unavailable" || advisor.route !== route || advisor.mode !== "fresh-read-only"
    || advisor.readOnly !== true || !SHA256.test(advisor.receiptSha256 ?? "")
    || digest(advisorReceipt) !== advisor.receiptSha256
    || !validReceipt(advisorReceipt, workflow, runner, route, "unavailable")
    || !FAILURES.includes(advisor.failureCode)) return fail("advisor-unavailable-untyped");
  if (elephant !== null) return fail("elephant-disposition-without-advisor");
  if (!validFinalException(finalException, workflow, advisor.failureCode)) return fail("final-unavailable-approval-required");
  return { ok: true, mode: "advisor-unavailable-exception", route, consumesFinalException: true };
}
