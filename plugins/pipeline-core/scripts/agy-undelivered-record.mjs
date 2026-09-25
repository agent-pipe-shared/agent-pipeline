// SPDX-License-Identifier: SUL-1.0
/** Publish only a truthful terminal observation; this never attests authorship. */
import { createHash, randomBytes } from "node:crypto";
import { CRITIC_REQUIRED_SCHEMA, CRITIC_TRIGGER_INPUT_SCHEMA } from "../lib/critic-skip-decision.mjs";
import { isSafeTaskId, reportSha256 } from "../lib/dispatch-record.mjs";
import { agyAgentTypeForRole } from "../lib/agy-final-return.mjs";
import { writeDispatchRecordObject } from "./dispatch-record-write.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const SAFE_MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,127}$/u;

function matchesPublishedBytes(receipt, record) {
  const bytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`, "utf8");
  return receipt.target === `evidence/dispatch-record-${record.taskId}.json`
    && receipt.sha256 === createHash("sha256").update(bytes).digest("hex")
    && receipt.bytes === bytes.length;
}

export function publishAgyUndeliveredRecord({ root, taskId, role, candidateCommit, observedModel,
  requestedEffort, routePolicySha256, status, modelCalls } = {}, dependencies = {}) {
  const agentType = agyAgentTypeForRole(role);
  if (typeof root !== "string" || root.length === 0 || !isSafeTaskId(taskId) || !agentType
    || !COMMIT.test(candidateCommit ?? "") || !SHA256.test(routePolicySha256 ?? "")
    || !SAFE_MODEL.test(observedModel ?? "unknown")
    || typeof requestedEffort !== "string" || !/^[a-z][a-z0-9-]*$/u.test(requestedEffort)
    || status !== "completed-undelivered" || !Number.isSafeInteger(modelCalls) || modelCalls < 1) {
    return { ok: false, code: "AGY-UNDELIVERED-RECORD-INPUT" };
  }
  const attemptId = (dependencies.randomBytes ?? randomBytes)(16).toString("hex");
  const record = {
    schema: "pipeline.dispatch-record.v4",
    taskId,
    agentType,
    runner: "antigravity",
    model: observedModel ?? "unknown",
    effort: requestedEffort,
    rulesetSha: routePolicySha256,
    dispatcher: "Elephant",
    candidateCommit,
    resultSha256: null,
    outcome: "completed-no-delivery",
    commits: [],
    log: [],
    report: null,
    outcomeClassification: { schema: "pipeline.dispatch-outcome-classification.v1", kind: "completed-undelivered" },
    observationIdentity: { dispatchId: taskId, attemptId },
    criticRequired: {
      schema: CRITIC_REQUIRED_SCHEMA,
      trigger: {
        schema: CRITIC_TRIGGER_INPUT_SCHEMA,
        rigorLevel: 0,
        riskClass: "low",
        // Non-delivery itself is a host-observed risk, not a model-declared path.
        riskFlag: true,
        diff: { mechanical: false, architecture: false, guardrails: false, security: false },
      },
      appliedRow: "T4",
      reason: "The host observed no attributable delivery; independent review remains required.",
    },
  };
  try {
    const receipt = (dependencies.writeDispatchRecordObject ?? writeDispatchRecordObject)({
      repoRoot: root, target: `evidence/dispatch-record-${taskId}.json`, record,
    });
    if (receipt.schema !== "pipeline.dispatch-record-write-receipt.v2"
      || !matchesPublishedBytes(receipt, record)
      || receipt.outcomeClassification?.kind !== "completed-undelivered"
      || receipt.resultSha256 !== null || receipt.taskId !== taskId
      || receipt.candidateCommit !== candidateCommit
      || receipt.observationIdentity?.dispatchId !== taskId
      || receipt.observationIdentity?.attemptId !== attemptId) {
      return { ok: false, code: "AGY-UNDELIVERED-RECORD-READBACK" };
    }
    return { ok: true, code: "AGY-UNDELIVERED-RECORD-PUBLISHED", target: receipt.target, sha256: receipt.sha256, attemptId };
  } catch {
    return { ok: false, code: "AGY-UNDELIVERED-RECORD-WRITE-FAILED" };
  }
}

/** A launched child that stopped before a Final Return is not a completed invocation. */
export function publishAgyInterruptedRecord({ root, taskId, role, candidateCommit, observedModel,
  requestedEffort, routePolicySha256, modelCalls, reasonCode } = {}, dependencies = {}) {
  const reasons = new Set(["AGY-NONZERO-EXIT", "AGY-TIMEOUT", "AGY-CANCELLED",
    "AGY-AUTH-REQUIRED", "AGY-PERMISSION-REQUIRED", "AGY-OUTPUT-MALFORMED",
    "AGY-OUTPUT-TOO-LARGE", "AGY-REPORTED-FAILURE", "AGY-MODEL-MISMATCH",
    "AGY-DISPATCH-TRANSPORT"]);
  const agentType = agyAgentTypeForRole(role);
  if (typeof root !== "string" || root.length === 0 || !isSafeTaskId(taskId) || !agentType
    || !COMMIT.test(candidateCommit ?? "") || !SHA256.test(routePolicySha256 ?? "")
    || !SAFE_MODEL.test(observedModel ?? "unknown")
    || typeof requestedEffort !== "string" || !/^[a-z][a-z0-9-]*$/u.test(requestedEffort)
    || !Number.isSafeInteger(modelCalls) || modelCalls < 1) {
    return { ok: false, code: "AGY-INTERRUPTION-RECORD-INPUT" };
  }
  const attemptId = (dependencies.randomBytes ?? randomBytes)(16).toString("hex");
  const reason = reasons.has(reasonCode) ? reasonCode : "AGY-INTERRUPTED-UNKNOWN";
  const reportText = `Host observation: Agy invocation interrupted before a validated Final Return. Reason: ${reason}. Attempt: ${attemptId}. No commit or delivered result is attributed to this dispatch.`;
  const record = {
    schema: "pipeline.dispatch-record.v4", taskId, agentType,
    runner: "antigravity", model: observedModel ?? "unknown", effort: requestedEffort,
    rulesetSha: routePolicySha256, dispatcher: "Elephant", candidateCommit,
    resultSha256: reportSha256(reportText), outcome: "stopped-without-commit",
    commits: [], log: [{ phase: "interrupted", toolUseCount: modelCalls,
      note: `attempt:${attemptId};reason:${reason}` }],
    report: { text: reportText, changedFiles: [] },
    outcomeClassification: { schema: "pipeline.dispatch-outcome-classification.v1", kind: "stopped-without-commit" },
    criticRequired: {
      schema: CRITIC_REQUIRED_SCHEMA,
      trigger: { schema: CRITIC_TRIGGER_INPUT_SCHEMA, rigorLevel: 0, riskClass: "low",
        riskFlag: true, diff: { mechanical: false, architecture: false, guardrails: false, security: false } },
      appliedRow: "T4",
      reason: "The host observed an interrupted Agy invocation; independent review remains required.",
    },
  };
  try {
    const receipt = (dependencies.writeDispatchRecordObject ?? writeDispatchRecordObject)({
      repoRoot: root, target: `evidence/dispatch-record-${taskId}.json`, record,
    });
    if (receipt.schema !== "pipeline.dispatch-record-write-receipt.v2"
      || !matchesPublishedBytes(receipt, record)
      || receipt.outcomeClassification?.kind !== "stopped-without-commit"
      || receipt.resultSha256 !== record.resultSha256 || receipt.taskId !== taskId
      || receipt.candidateCommit !== candidateCommit) {
      return { ok: false, code: "AGY-INTERRUPTION-RECORD-READBACK" };
    }
    return { ok: true, code: "AGY-INTERRUPTION-RECORD-PUBLISHED",
      target: receipt.target, sha256: receipt.sha256, attemptId };
  } catch {
    return { ok: false, code: "AGY-INTERRUPTION-RECORD-WRITE-FAILED" };
  }
}
