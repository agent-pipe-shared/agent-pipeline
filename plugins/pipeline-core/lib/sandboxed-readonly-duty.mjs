// SPDX-License-Identifier: Apache-2.0

/** Closed binding shared by the three Codex read-only pipeline duties. */
import { createHash } from "node:crypto";

import { INTERMEDIATE_LITERAL, canonicalJson } from "./codex-sandbox-compatibility.mjs";
import { sandboxSelectionDigest, validateSandboxSelection } from "../scripts/codex-sandbox-select.mjs";

const DUTIES = new Set(["advisory", "readiness", "critic"]);
const SHA256 = /^[a-f0-9]{64}$/;
const OID = /^[a-f0-9]{40,64}$/;
const WEAK_ASSURANCE = Object.freeze({
  class: "sandbox-read-only-except-coordinator-scratch-network-open",
  literal: INTERMEDIATE_LITERAL,
});
const UNAVAILABLE_ASSURANCE = Object.freeze({ class: "no-usable-review", literal: null });

function fail(message) { throw new Error(message); }
function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(`${label} is not closed`);
}
function digest(domain, value) {
  return createHash("sha256").update(Buffer.from(`${domain}\0${canonicalJson(value)}`, "utf8")).digest("hex");
}
function usableDutyStatus(duty) { return duty === "advisory" ? "answered" : "reviewed"; }
function checkDigest(value, label, nullable = false) {
  if (nullable && value === null) return;
  if (typeof value !== "string" || !SHA256.test(value)) fail(`${label} must be SHA-256`);
}
function validateDispatch(value, { request = false } = {}) {
  exactKeys(value, request
    ? ["queueRevision", "candidateCommit", "candidateTree", "referenceSetSha256", "requestSha256"]
    : ["queueRevision", "candidateCommit", "candidateTree", "referenceSetSha256"], "dispatch");
  if (!Number.isSafeInteger(value.queueRevision) || value.queueRevision < 0 || !OID.test(value.candidateCommit)
    || !OID.test(value.candidateTree)) fail("dispatch identity is invalid");
  checkDigest(value.referenceSetSha256, "referenceSetSha256");
  if (request) checkDigest(value.requestSha256, "requestSha256");
  return value;
}
function equal(left, right) { return canonicalJson(left) === canonicalJson(right); }
function validateAssurance(value, unavailable = false) {
  exactKeys(value, ["class", "literal"], "assurance");
  if (!equal(value, unavailable ? UNAVAILABLE_ASSURANCE : WEAK_ASSURANCE)) fail("assurance is not the documented weaker boundary");
}

/** Builds the one closed selector request from refs-only duty facts. */
export function buildSandboxedReadonlyRequest(value) {
  exactKeys(value, ["duty", "repoFingerprint", "dispatch", "requested"], "read-only duty request");
  if (!DUTIES.has(value.duty) || !SHA256.test(value.repoFingerprint)) fail("duty request is invalid");
  validateDispatch(value.dispatch);
  exactKeys(value.requested, ["runner", "model"], "requested route");
  if (value.requested.runner !== "codex" || typeof value.requested.model !== "string" || value.requested.model.length === 0) fail("requested route is invalid");
  const request = {
    schema: "pipeline.codex-sandbox-request.v1",
    repoFingerprint: value.repoFingerprint,
    duty: value.duty,
    queueRevision: value.dispatch.queueRevision,
    candidateCommit: value.dispatch.candidateCommit,
    candidateTree: value.dispatch.candidateTree,
    referenceSetSha256: value.dispatch.referenceSetSha256,
    runner: value.requested.runner,
    model: value.requested.model,
  };
  return {
    duty: value.duty,
    repoFingerprint: value.repoFingerprint,
    dispatch: structuredClone(value.dispatch),
    requested: structuredClone(value.requested),
    requestSha256: digest("pipeline.codex-sandbox-request.v1", request),
  };
}

/** Rejects execution receipts that carry raw content, drifted dispatch, or claims. */
export function validateSandboxedExecutionReceipt(value) {
  exactKeys(value, ["schema", "selectionId", "selectionSha256", "repoFingerprint", "duty", "dispatch", "requested", "observed", "terminal", "assurance", "dutyReceipt", "createdAt"], "execution receipt");
  if (value.schema !== "pipeline.codex-sandbox-execution-receipt.v1" || !/^css_[a-z2-7]{25}[aeimquy4]$/.test(value.selectionId)
    || !SHA256.test(value.selectionSha256) || !SHA256.test(value.repoFingerprint) || !DUTIES.has(value.duty)
    || Number.isNaN(Date.parse(value.createdAt))) fail("execution receipt header is invalid");
  validateDispatch(value.dispatch, { request: true });
  exactKeys(value.requested, ["runner", "model"], "requested route");
  if (value.requested.runner !== "codex" || typeof value.requested.model !== "string" || value.requested.model.length === 0) fail("execution request is invalid");
  exactKeys(value.observed, ["cliSha256", "profileSha256", "networkEnabled", "scratchRootSha256"], "observed sandbox");
  checkDigest(value.observed.cliSha256, "observed cli", true); checkDigest(value.observed.profileSha256, "observed profile", true);
  checkDigest(value.observed.scratchRootSha256, "observed scratch", true);
  if (![true, false, null].includes(value.observed.networkEnabled)) fail("observed network is invalid");
  exactKeys(value.terminal, ["childStarted", "exitCode", "stdioStatus", "cleanupStatus"], "execution terminal");
  if (typeof value.terminal.childStarted !== "boolean" || !["complete", "lost", "not-started"].includes(value.terminal.stdioStatus)
    || !["complete", "pending", "not-started"].includes(value.terminal.cleanupStatus)
    || !(value.terminal.exitCode === null || Number.isSafeInteger(value.terminal.exitCode))) fail("execution terminal is invalid");
  exactKeys(value.dutyReceipt, ["schema", "sha256", "status"], "duty receipt");
  checkDigest(value.dutyReceipt.sha256, "duty receipt digest", true);
  if (![`pipeline.${value.duty}-receipt.v1`, "pipeline.advisory-receipt.v1"].includes(value.dutyReceipt.schema)
    || !["answered", "reviewed", "unavailable", "error"].includes(value.dutyReceipt.status)) fail("duty receipt is invalid");
  if (value.terminal.childStarted) {
    if (value.observed.cliSha256 === null || value.observed.profileSha256 === null || value.observed.networkEnabled !== true
      || value.observed.scratchRootSha256 === null || value.terminal.stdioStatus === "not-started"
      || value.terminal.cleanupStatus === "not-started" || value.dutyReceipt.sha256 === null
      || !["answered", "reviewed", "error"].includes(value.dutyReceipt.status)) fail("started child lacks observed selected transport");
    validateAssurance(value.assurance);
  } else {
    if (value.terminal.exitCode !== null || value.terminal.stdioStatus !== "not-started" || value.terminal.cleanupStatus !== "not-started"
      || value.observed.cliSha256 !== null || value.observed.profileSha256 !== null || value.observed.networkEnabled !== null
      || value.observed.scratchRootSha256 !== null || value.dutyReceipt.sha256 !== null
      || !["unavailable", "error"].includes(value.dutyReceipt.status)) fail("no-child execution contradicts its evidence");
    validateAssurance(value.assurance, true);
  }
  return value;
}

/** Binds exactly one selected dispatch, execution receipt and duty receipt. */
export function bindSandboxedReadonlyDuty({ selection, execution }) {
  if (!selection || typeof selection !== "object" || selection.status !== "selected" || !DUTIES.has(selection.duty)) fail("only selected duties can bind execution");
  validateSandboxSelection(selection);
  const selectionSha256 = sandboxSelectionDigest(selection);
  validateDispatch(selection.dispatch, { request: true });
  validateSandboxedExecutionReceipt(execution);
  const expectedRequest = buildSandboxedReadonlyRequest({
    duty: selection.duty,
    repoFingerprint: selection.repoFingerprint,
    dispatch: {
      queueRevision: selection.dispatch.queueRevision,
      candidateCommit: selection.dispatch.candidateCommit,
      candidateTree: selection.dispatch.candidateTree,
      referenceSetSha256: selection.dispatch.referenceSetSha256,
    },
    requested: execution.requested,
  });
  if (selection.selectionId !== execution.selectionId || selectionSha256 !== execution.selectionSha256
    || selection.repoFingerprint !== execution.repoFingerprint || selection.duty !== execution.duty
    || !equal(selection.dispatch, execution.dispatch) || execution.terminal.childStarted !== true
    || expectedRequest.requestSha256 !== selection.dispatch.requestSha256
    || execution.observed.cliSha256 !== selection.toolchain.cliSha256
    || execution.observed.profileSha256 !== selection.profile.sha256
    || execution.observed.networkEnabled !== selection.profile.network.enabled
    || execution.observed.scratchRootSha256 !== selection.profile.scratchRootSha256
    || execution.terminal.exitCode !== 0
    || execution.terminal.stdioStatus !== "complete"
    || execution.terminal.cleanupStatus !== "complete"
    || execution.dutyReceipt.status !== usableDutyStatus(selection.duty)) fail("selection/execution transport evidence drifted");
  return { selectionId: selection.selectionId, selectionSha256, dutyReceipt: structuredClone(execution.dutyReceipt) };
}

export const SANDBOXED_READONLY_ASSURANCE = WEAK_ASSURANCE;
export const NO_USABLE_REVIEW_ASSURANCE = UNAVAILABLE_ASSURANCE;
