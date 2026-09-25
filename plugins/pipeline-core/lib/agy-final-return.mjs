// SPDX-License-Identifier: SUL-1.0
import { createHash } from "node:crypto";
import { DISPATCH_RECORD_SCHEMA, OUTCOME_CLASSIFICATION_SCHEMA, declaredPaths,
  normalizeDispatchRecordPath, reportSha256, validateDispatchRecord,
  validateDurableDispatchReportText } from "./dispatch-record.mjs";
import { criticDecisionPathFinding } from "./critic-skip-decision.mjs";
import { canonicalizeJson } from "./governance-event.mjs";

export const AGY_FINAL_RETURN_SCHEMA = "pipeline.agy-final-return.v1";
const COMMIT = /^[a-f0-9]{40,64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SHA = /^[a-f0-9]{64}$/u;

export function agyAgentTypeForRole(role) {
  if (role === "pipeline-core:goldfish-implementor") return "goldfish-implementor";
  if (role === "pipeline-core:goldfish-mechanic") return "goldfish-mechanic";
  return null;
}

// This schema guides Agy's --json-schema output. Host validation below is
// authoritative; model-generated schema conformance is not trusted evidence.
export const AGY_FINAL_RETURN_JSON_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    schema: { type: "string", enum: [AGY_FINAL_RETURN_SCHEMA] },
    dispatchId: { type: "string", minLength: 1, maxLength: 128 },
    candidateCommit: { type: "string", minLength: 40, maxLength: 64 },
    outcome: { type: "string", enum: ["succeeded", "failed", "blocked"] },
    report: { type: "string", minLength: 1, maxLength: 16384 },
    changedPaths: { type: "array", maxItems: 64, items: { type: "string", minLength: 1, maxLength: 240 } },
  },
  required: ["schema", "dispatchId", "candidateCommit", "outcome", "report", "changedPaths"],
});

function normalizedPath(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 240
    || /^[A-Za-z]:/u.test(value)) return false;
  try {
    normalizeDispatchRecordPath(value);
    // The authorship reader must see the same exact path after the v4 record
    // stores it. Some otherwise valid Git filenames are not representable by
    // its current path-token grammar; refuse those before a host commit.
    return declaredPaths({ report: { changedFiles: [value] } })?.[0] === value;
  } catch { return false; }
}

function exact(value, fields) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === [...fields].sort().join(",");
}

function matchesHostModelWitness(witness, input) {
  return exact(witness, ["schema", "sessionId", "descriptorSha256", "dispatchId", "candidateCommit", "candidateTree",
    "role", "model", "effort", "routePolicySha256", "resultSha256", "reportSha256",
    "resultPath", "resultBytes", "consentSubjectSha256", "consentDecisionId",
    "consentRecordSha256", "scope", "inputSha256", "observedAtMs"])
    && witness.schema === "pipeline.agy-host-model-witness.v1"
    && ID.test(witness.sessionId ?? "") && SHA.test(witness.descriptorSha256 ?? "")
    && witness.sessionId === input.sessionId
    && witness.descriptorSha256 === input.descriptorSha256
    && witness.dispatchId === input.taskId
    && witness.candidateCommit === input.baselineCommit
    && COMMIT.test(witness.candidateTree ?? "")
    && witness.candidateTree === input.candidateTree
    && witness.role === `pipeline-core:${input.agentType}`
    && witness.model === input.observedModel && witness.effort === input.effort
    && witness.routePolicySha256 === input.rulesetSha
    && SHA.test(witness.consentRecordSha256 ?? "")
    && witness.consentRecordSha256 === input.consentRecordSha256
    && SHA.test(witness.inputSha256 ?? "") && witness.inputSha256 === input.inputSha256
    && Number.isSafeInteger(witness.observedAtMs) && witness.observedAtMs > 0
    && witness.observedAtMs === input.observedAtMs
    && witness.scope !== null && typeof witness.scope === "object" && !Array.isArray(witness.scope)
    && input.scope !== null && typeof input.scope === "object" && !Array.isArray(input.scope)
    && canonicalizeJson(witness.scope) === canonicalizeJson(input.scope)
    && SHA.test(witness.resultSha256 ?? "")
    && witness.resultSha256 === input.resultSha256
    && typeof witness.resultPath === "string" && witness.resultPath === input.resultPath
    && Number.isSafeInteger(witness.resultBytes) && witness.resultBytes === input.resultBytes
    && witness.reportSha256 === input.final.reportSha256
    && SHA.test(witness.consentSubjectSha256 ?? "")
    && witness.consentSubjectSha256 === input.consentSubjectSha256
    && ID.test(witness.consentDecisionId ?? "")
    && witness.consentDecisionId === input.consentDecisionId;
}

function authoredRecord({ taskId, agentType, observedModel, effort, rulesetSha, final, criticRequired }, commit) {
  return {
    schema: DISPATCH_RECORD_SCHEMA, runner: "antigravity", taskId, agentType,
    model: observedModel, effort, rulesetSha, dispatcher: "Elephant",
    candidateCommit: commit, resultSha256: final.reportSha256,
    outcome: "completed", commits: [commit], log: [],
    report: { text: final.report, changedFiles: [...final.changedPaths] },
    outcomeClassification: { schema: OUTCOME_CLASSIFICATION_SCHEMA, kind: "authored-commit" },
    criticRequired,
  };
}

export function validateAgyFinalReturn(envelope, { dispatchId, candidateCommit } = {}) {
  let schemaMatches = false;
  try { schemaMatches = canonicalizeJson(envelope?.json_schema) === canonicalizeJson(AGY_FINAL_RETURN_JSON_SCHEMA); } catch { /* malformed echo */ }
  if (envelope === null || typeof envelope !== "object" || Array.isArray(envelope)
    || typeof envelope.conversation_id !== "string" || envelope.conversation_id.length === 0
    || envelope.status !== "SUCCESS" || typeof envelope.response !== "string"
    || !exact(envelope.structured_output, ["schema", "dispatchId", "candidateCommit", "outcome", "report", "changedPaths"])
    || !schemaMatches) {
    return { ok: false, code: "AGY-FINAL-ENVELOPE-INVALID" };
  }
  const value = envelope.structured_output;
  let durableReport = false;
  try { validateDurableDispatchReportText(value.report); durableReport = true; } catch { /* reject before host commit */ }
  if (value.schema !== AGY_FINAL_RETURN_SCHEMA || !ID.test(value.dispatchId ?? "")
    || !COMMIT.test(value.candidateCommit ?? "")
    || !["succeeded", "failed", "blocked"].includes(value.outcome)
    || !durableReport
    || !Array.isArray(value.changedPaths) || value.changedPaths.length > 64
    || !value.changedPaths.every(normalizedPath)
    || new Set(value.changedPaths).size !== value.changedPaths.length
    || (value.outcome === "succeeded" ? value.changedPaths.length === 0 : value.changedPaths.length !== 0)) {
    return { ok: false, code: "AGY-FINAL-SHAPE-INVALID" };
  }
  if (value.dispatchId !== dispatchId || value.candidateCommit !== candidateCommit) {
    return { ok: false, code: "AGY-FINAL-BINDING-MISMATCH" };
  }
  return {
    ok: true,
    code: "AGY-FINAL-VALIDATED",
    dispatchId: value.dispatchId,
    candidateCommit: value.candidateCommit,
    outcome: value.outcome,
    report: value.report,
    reportSha256: createHash("sha256").update(value.report, "utf8").digest("hex"),
    changedPaths: [...value.changedPaths],
  };
}

/**
 * Check every static v4 field before a host commit exists. The baseline OID
 * stands in for the future commit only inside this discarded preview; this
 * function returns no publishable record and attests neither model identity
 * nor the provenance of its caller-supplied Final Return.
 */
export function preflightAgyAuthoredRecord({ taskId, agentType, observedModel, effort,
  rulesetSha, baselineCommit, final, criticRequired } = {}) {
  if (!agyAgentTypeForRole(`pipeline-core:${agentType}`)
    || final?.ok !== true || final.code !== "AGY-FINAL-VALIDATED" || final.outcome !== "succeeded"
    || final.dispatchId !== taskId || final.candidateCommit !== baselineCommit
    || typeof final.report !== "string" || !Array.isArray(final.changedPaths)
    || final.changedPaths.length === 0 || final.changedPaths.length > 64
    || !final.changedPaths.every(normalizedPath)
    || new Set(final.changedPaths).size !== final.changedPaths.length
    || final.reportSha256 !== reportSha256(final.report)) {
    return { ok: false, code: "AGY-RECORD-PREFLIGHT-FINAL" };
  }
  const pathFinding = criticDecisionPathFinding(criticRequired, final.changedPaths);
  if (pathFinding) return { ok: false, code: "AGY-RECORD-PREFLIGHT-CRITIC-PATH", reasonCode: pathFinding.code };
  const preview = authoredRecord({ taskId, agentType, observedModel, effort, rulesetSha, final, criticRequired }, baselineCommit);
  try { validateDispatchRecord(preview); }
  catch (error) { return { ok: false, code: "AGY-RECORD-PREFLIGHT-INVALID", reasonCode: error?.code ?? "record-invalid" }; }
  return { ok: true, code: "AGY-RECORD-PREFLIGHT-READY", reportSha256: final.reportSha256,
    changedPaths: [...final.changedPaths] };
}

/**
 * Bind the validated child return to an actual host-readback commit. This is
 * only a draft: a caller-supplied commit object and witness are not trusted
 * host authority; only the separate host-only writer may publish after its
 * independent private-receipt and Git readback.
 */
export function draftAgyAuthoredRecordAfterCommit(input = {}) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, code: "AGY-RECORD-DRAFT-INPUT" };
  }
  const prepared = preflightAgyAuthoredRecord(input);
  if (!prepared.ok) return prepared;
  if (!matchesHostModelWitness(input.modelWitness, input)) {
    return { ok: false, code: "AGY-RECORD-DRAFT-MODEL-WITNESS" };
  }
  const { baselineCommit, final, commitReadback } = input;
  if (!agyAgentTypeForRole(`pipeline-core:${input.agentType}`)
    || !exact(commitReadback, ["ok", "code", "commit", "parent", "tree", "paths"])
    || commitReadback.ok !== true || commitReadback.code !== "AGY-HOST-COMMIT-READBACK-VERIFIED"
    || !COMMIT.test(commitReadback.commit ?? "") || commitReadback.commit === baselineCommit
    || commitReadback.parent !== baselineCommit || !COMMIT.test(commitReadback.tree ?? "")
    || !Array.isArray(commitReadback.paths) || commitReadback.paths.length !== final.changedPaths.length
    || !commitReadback.paths.every(normalizedPath)
    || new Set(commitReadback.paths).size !== commitReadback.paths.length
    || [...commitReadback.paths].sort().join("\0") !== [...final.changedPaths].sort().join("\0")) {
    return { ok: false, code: "AGY-RECORD-DRAFT-COMMIT-BINDING" };
  }
  const record = authoredRecord(input, commitReadback.commit);
  try { validateDispatchRecord(record); }
  catch (error) { return { ok: false, code: "AGY-RECORD-DRAFT-INVALID", reasonCode: error?.code ?? "record-invalid" }; }
  return { ok: true, code: "AGY-RECORD-DRAFT-READY", record,
    modelAuthority: "unverified", publicationAuthorized: false };
}
