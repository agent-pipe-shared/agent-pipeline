#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Explicit live AGY implementation host.  This is intentionally separate from
 * the E3 fixture host: it discovers the already-installed local CLI, while the
 * session-dispatch library owns consent, candidate binding and result safety.
 */
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { discoverAgyPath } from "../lib/antigravity-execution-host.mjs";
import { dispatchAgySession, verifyAgySessionResultReadback, dispatchAgyFamilyNativeContext, readAgyFamilyNativeContext, observeAgyFamilyDispatchActivation, prepareAgyFamilyVerifiedReturn } from "../lib/agy-session-dispatch.mjs";
import { assessAgyHostCommit, captureAgyHostCommitBaseline, observeAgyHostHead } from "../lib/agy-host-commit-admission.mjs";
import { agyAgentTypeForRole, preflightAgyAuthoredRecord } from "../lib/agy-final-return.mjs";
import { classifyCriticChangedPaths, CRITIC_REQUIRED_SCHEMA, CRITIC_TRIGGER_INPUT_SCHEMA,
  evaluateCriticTriggerRow } from "../lib/critic-skip-decision.mjs";
import { isSafeTaskId } from "../lib/dispatch-record.mjs";
import { digest, loadLiveSession, loadStoredConsent, validateConsentRecord, validateDispatchBinding } from "../lib/agy-session-authority.mjs";
import { publishAgyInterruptedRecord, publishAgyUndeliveredRecord } from "./agy-undelivered-record.mjs";

export const LIVE_REQUEST_SCHEMA = "pipeline.agy-session-live-request.v1";
export const LIVE_REQUEST_SEAL = "elephant-agy-implementation-dispatch.v1";
const familyLiveRequests = new WeakMap();

/** Internal same-process seal. No request JSON contains callable authority. */
export function sealAgyFamilyLiveRequest(request, context) {
  const checked = readAgyFamilyNativeContext(context);
  if (!checked.ok || checked.receipt.sessionId !== request?.sessionId || checked.receipt.selectedModelId !== request?.requestedModel
    || checked.receipt.effort !== request?.effort || checked.receipt.invocationId !== request?.packet?.dispatchId) return { ok: false, code: "AGY-LIVE-FAMILY-CONTEXT" };
  familyLiveRequests.set(request, { context, wireSha256: digest(request) }); return { ok: true, request };
}

function exact(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function readRequest(path) {
  const absolute = resolve(path);
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(absolute) !== absolute || stat.size > 2 * 1024 * 1024) throw new Error("request is not a bounded physical file");
  return JSON.parse(readFileSync(absolute, "utf8"));
}

function recordTargetPreflight(root, taskId) {
  if (!isSafeTaskId(taskId)) return "AGY-RECORD-TASK-ID-UNSAFE";
  const evidence = join(root, "evidence");
  try {
    const parent = lstatSync(evidence);
    if (!parent.isDirectory() || parent.isSymbolicLink()) return "AGY-RECORD-PARENT-UNAVAILABLE";
  } catch { return "AGY-RECORD-PARENT-UNAVAILABLE"; }
  try { lstatSync(join(evidence, `dispatch-record-${taskId}.json`)); return "AGY-RECORD-TARGET-EXISTS"; }
  catch (error) { return error?.code === "ENOENT" ? null : "AGY-RECORD-TARGET-UNAVAILABLE"; }
}

export async function runGoldfishAntigravityLiveHost(request, dependencies = {}) {
  const keys = ["schema", "seal", "root", "resultRoot", "resultPath", "packet", "sessionId", "descriptorSha256", "consent", "requestedModel", "effort", "scope", "inputSha256", "routePolicySha256", "timeoutMs"];
  if (!exact(request, keys) || request.schema !== LIVE_REQUEST_SCHEMA) return { schema: LIVE_REQUEST_SCHEMA, status: "rejected", code: "AGY-LIVE-REQUEST-SHAPE", modelCalls: 0, launcherCalls: 0 };
  if (request.seal !== LIVE_REQUEST_SEAL) return { schema: LIVE_REQUEST_SCHEMA, status: "rejected", code: "AGY-LIVE-REQUEST-UNSEALED", modelCalls: 0, launcherCalls: 0 };
  if (request.consent === null) return { schema: LIVE_REQUEST_SCHEMA, status: "rejected", code: "AGY-SESSION-CONSENT-REQUIRED", modelCalls: 0, launcherCalls: 0 };
  if (request.consent !== "stored") return { schema: LIVE_REQUEST_SCHEMA, status: "rejected", code: "AGY-SESSION-CONSENT-SUPPLIED", modelCalls: 0, launcherCalls: 0 };
  const familySeal = familyLiveRequests.get(request), familyContext = familySeal?.context;
  if (familySeal && familySeal.wireSha256 !== digest(request)) return { schema: LIVE_REQUEST_SCHEMA, status: "rejected", code: "AGY-LIVE-FAMILY-REQUEST-CHANGED", modelCalls: 0, launcherCalls: 0 };
  const activation = observeAgyFamilyDispatchActivation(request.root);
  if (familyContext || !activation.ok || activation.status === "active") {
    if (!activation.ok) return { schema: LIVE_REQUEST_SCHEMA, status: "unavailable", code: activation.code, modelCalls: 0, launcherCalls: 0 };
    if (!familyContext) return { schema: LIVE_REQUEST_SCHEMA, status: "rejected", code: "AGY-LIVE-FAMILY-CONTEXT-REQUIRED", modelCalls: 0, launcherCalls: 0 };
    const captured = captureAgyHostCommitBaseline({ root: request.root, candidateCommit: request.packet?.candidate?.commit, resultPath: request.resultPath });
    if (!captured.ok) return { schema: LIVE_REQUEST_SCHEMA, status: "rejected", code: captured.code, modelCalls: 0, launcherCalls: 0 };
    const launched = await dispatchAgyFamilyNativeContext({ context: familyContext, inputSha256: request.inputSha256,
      timeoutMs: request.timeoutMs, nowEpochMs: dependencies.nowEpochMs ?? Date.now(), resultRoot: request.resultRoot });
    if (launched.code !== "AGY-SESSION-FAMILY-RETURN-CONTRACT-UNQUALIFIED" || !dependencies.familyExecutionPorts) return launched;
    const verified = await prepareAgyFamilyVerifiedReturn({ context: familyContext, ports: dependencies.familyExecutionPorts,
      observedAtMs: dependencies.nowEpochMs ?? Date.now(), routePolicySha256: request.routePolicySha256, inputSha256: request.inputSha256 });
    if (!verified.ok) return { ...launched, code: verified.code, status: "recovery-required" };
    const admission = assessAgyHostCommit({ baseline: captured.baseline, final: verified.final, allowedPaths: verified.witness.family.consentBinding.allowedPaths });
    if (!admission.ok) return { ...launched, code: admission.code, status: "recovery-required", result: verified.result };
    const trigger = { schema: CRITIC_TRIGGER_INPUT_SCHEMA, rigorLevel: 2, riskClass: "low", riskFlag: true, diff: classifyCriticChangedPaths(admission.paths) };
    const criticRequired = { schema: CRITIC_REQUIRED_SCHEMA, trigger, appliedRow: evaluateCriticTriggerRow(trigger), reason: "Host-observed Agy implementation requires independent Critic evidence." };
    const recordPreflight = preflightAgyAuthoredRecord({ taskId: request.packet.dispatchId, agentType: agyAgentTypeForRole(request.packet.role),
      observedModel: verified.witness.model, effort: request.effort, rulesetSha: request.routePolicySha256,
      baselineCommit: request.packet.candidate.commit, final: verified.final, criticRequired });
    if (!recordPreflight.ok) return { ...launched, code: recordPreflight.code, status: "recovery-required", result: verified.result };
    const pending = { ...launched, status: "final-pending-host-commit", code: "AGY-FAMILY-FINAL-VALIDATED", result: verified.result, final: verified.final,
      familyReturnHandle: verified.handle, observed: { provider: "google", model: verified.witness.model, effectiveSandbox: "unknown" },
      commitAdmission: { ...admission, baseline: captured.baseline, final: verified.final, criticRequired, recordPreflight, modelWitness: verified.witness } };
    const { finalizeAgyFamilyHostObservedReturn } = await import("./agy-host-observed-finalize.mjs");
    return { ...pending, ...await finalizeAgyFamilyHostObservedReturn({ sealed: request, launched: pending }) };
  }
  let live;
  try { live = loadLiveSession(request.root, request.sessionId, request.descriptorSha256); } catch { return { schema: LIVE_REQUEST_SCHEMA, status: "unavailable", code: "AGY-SESSION-OWNER-UNAVAILABLE", modelCalls: 0, launcherCalls: 0 }; }
  if (!live.ok) return { schema: LIVE_REQUEST_SCHEMA, status: "unavailable", code: live.code, modelCalls: 0, launcherCalls: 0 };
  let stored;
  try { stored = loadStoredConsent(request.root, request.sessionId, request.descriptorSha256); } catch { return { schema: LIVE_REQUEST_SCHEMA, status: "unavailable", code: "AGY-SESSION-CONSENT-UNAVAILABLE", modelCalls: 0, launcherCalls: 0 }; }
  if (!stored.record) return { schema: LIVE_REQUEST_SCHEMA, status: "rejected", code: "AGY-SESSION-CONSENT-REQUIRED", modelCalls: 0, launcherCalls: 0 };
  const authority = validateConsentRecord(stored.record, { root: request.root, repository: stored.descriptor.repo, session: live.session, nowEpochMs: dependencies.nowEpochMs ?? Date.now() });
  if (!authority.ok) return { schema: LIVE_REQUEST_SCHEMA, status: "rejected", code: authority.code, modelCalls: 0, launcherCalls: 0 };
  const binding = validateDispatchBinding(stored.record, { requestedModel: request.requestedModel, role: request.packet.role, scope: request.scope, requiredPaths: request.packet.requiredPaths ?? [], nowEpochMs: dependencies.nowEpochMs ?? Date.now() });
  if (!binding.ok) return { schema: LIVE_REQUEST_SCHEMA, status: "rejected", code: binding.code, modelCalls: 0, launcherCalls: 0 };
  const recordTargetFinding = recordTargetPreflight(request.root, request.packet?.dispatchId);
  if (recordTargetFinding) return { schema: LIVE_REQUEST_SCHEMA, status: "rejected", code: recordTargetFinding, modelCalls: 0, launcherCalls: 0 };
  const agyPath = dependencies.agyPath ?? discoverAgyPath(dependencies.env ?? process.env);
  if (!agyPath) return { schema: LIVE_REQUEST_SCHEMA, status: "unavailable", code: "AGY-NOT-INSTALLED", modelCalls: 0, launcherCalls: 0 };
  const captured = captureAgyHostCommitBaseline({ root: request.root, candidateCommit: request.packet?.candidate?.commit, resultPath: request.resultPath });
  if (!captured.ok) return { schema: LIVE_REQUEST_SCHEMA, status: "rejected", code: captured.code, modelCalls: 0, launcherCalls: 0 };
  const dispatchConsent = { schema: "pipeline.agy-session-consent.v1", status: "approved", decisionId: stored.record.decisionId, sessionId: live.session.id, runner: "antigravity", provider: "google", model: stored.record.model, role: request.packet.role, scope: request.scope, subjectSha256: stored.record.subjectSha256, approvedAtMs: stored.record.approvedAtMs ?? 0, expiresAtMs: stored.record.expiresAtMs };
  const launched = await (dependencies.dispatchAgySession ?? dispatchAgySession)({ ...request, session: { id: live.session.id, source: "runtime", observed: true }, consent: dispatchConsent, verifyAuthority: () => true, agyPath, env: dependencies.env ?? process.env, nowEpochMs: dependencies.nowEpochMs ?? Date.now(), signal: dependencies.signal, requireObservedModel: true, streamJson: true, requireStructuredFinal: true });
  function closeUndelivered(observation) {
    // A terminal no-delivery record is durable even if the outer dispatch
    // later rejects its receipt. Do not publish it from an unverified route
    // model, zero model calls, or a contradictory delivered Final Return.
    if (launched.observed?.model !== request.requestedModel
      || !Number.isSafeInteger(launched.modelCalls) || launched.modelCalls < 1) {
      return { ...observation, status: "recovery-required",
        code: "AGY-UNDELIVERED-MODEL-UNVERIFIED", record: null };
    }
    if (launched.final !== null) return { ...observation, status: "recovery-required",
      code: "AGY-UNDELIVERED-FINAL-CONFLICT", record: null };
    const head = (dependencies.observeAgyHostHead ?? observeAgyHostHead)({ baseline: captured.baseline });
    if (!head?.ok) return { ...observation, status: "recovery-required",
      code: "AGY-UNDELIVERED-HEAD-UNVERIFIED", record: null };
    let published;
    try {
      published = (dependencies.publishUndeliveredRecord ?? publishAgyUndeliveredRecord)({
        root: request.root, taskId: request.packet.dispatchId, role: request.packet.role,
        candidateCommit: request.packet.candidate.commit,
        observedModel: launched.observed?.model,
        requestedEffort: request.effort, routePolicySha256: request.routePolicySha256,
        status: "completed-undelivered", modelCalls: launched.modelCalls,
      });
    } catch {
      published = null;
    }
    if (!published?.ok) return { ...observation, status: "recovery-required",
      code: "AGY-UNDELIVERED-RECORD-UNVERIFIED", record: null };
    return { ...observation, status: "completed-undelivered", record: {
      target: published.target, sha256: published.sha256, attemptId: published.attemptId, authorship: "not-applicable",
    } };
  }
  // A delivered Final Return that fails a later authority or byte-binding
  // check is not an undelivered invocation. Preserve it for explicit recovery
  // without publishing a contradictory no-result/no-commit record.
  const holdFinal = (observation, code) => ({ ...observation, status: "recovery-required", code, record: null });
  if (launched.status === "completed-undelivered") return closeUndelivered(launched);
  if (launched.status !== "final-pending-host-commit") {
    // Only an interrupted invocation with no Final Return and no result may
    // claim this non-authoring close. The call count proves an attempted
    // launch, not that the provider served the request.
    if (launched.status === "unavailable" && launched.processStarted === true
      && launched.processClosed === true
      && Number.isSafeInteger(launched.modelCalls)
      && launched.modelCalls > 0 && launched.final === null && launched.result === null
      && launched.transportResultObserved !== true) {
      const head = (dependencies.observeAgyHostHead ?? observeAgyHostHead)({ baseline: captured.baseline });
      if (!head?.ok) return { ...launched, status: "recovery-required",
        code: "AGY-INTERRUPTION-HEAD-UNVERIFIED", record: null };
      let published;
      try {
        published = (dependencies.publishInterruptedRecord ?? publishAgyInterruptedRecord)({
          root: request.root, taskId: request.packet.dispatchId, role: request.packet.role,
          candidateCommit: request.packet.candidate.commit,
          observedModel: launched.observed?.model === request.requestedModel
            ? request.requestedModel : "unknown",
          requestedEffort: request.effort, routePolicySha256: request.routePolicySha256,
          modelCalls: launched.modelCalls, reasonCode: launched.code,
        });
      } catch { published = null; }
      if (!published?.ok) return { ...launched, status: "recovery-required",
        code: "AGY-INTERRUPTION-RECORD-UNVERIFIED", record: null };
      return { ...launched, status: "interrupted-recorded", code: "AGY-INTERRUPTION-RECORDED",
        record: { target: published.target, sha256: published.sha256,
          attemptId: published.attemptId, authorship: "not-applicable" } };
    }
    return launched.modelCalls > 0 ? { ...launched, status: "recovery-required",
      code: "AGY-MODEL-CALL-NO-DURABLE-CLOSURE", record: null } : launched;
  }
  let current;
  try { current = loadStoredConsent(request.root, request.sessionId, request.descriptorSha256); }
  catch { return holdFinal(launched, "AGY-SESSION-CONSENT-UNAVAILABLE"); }
  if (!current.record || current.record.decisionId !== stored.record.decisionId || current.record.subjectSha256 !== stored.record.subjectSha256) {
    return holdFinal(launched, "AGY-SESSION-CONSENT-CHANGED");
  }
  const currentAuthority = validateConsentRecord(current.record, { root: request.root, repository: current.descriptor.repo, session: live.session, nowEpochMs: dependencies.nowEpochMs ?? Date.now() });
  if (!currentAuthority.ok) return holdFinal(launched, currentAuthority.code);
  const currentBinding = validateDispatchBinding(current.record, { requestedModel: request.requestedModel, role: request.packet.role, scope: request.scope, requiredPaths: request.packet.requiredPaths ?? [], nowEpochMs: dependencies.nowEpochMs ?? Date.now() });
  if (!currentBinding.ok) return holdFinal(launched, currentBinding.code);
  const resultReadback = verifyAgySessionResultReadback({ resultRoot: request.resultRoot,
    resultPath: request.resultPath, receipt: launched.result, dispatchId: request.packet.dispatchId,
    candidate: request.packet.candidate, sessionId: live.session.id, requestedModel: request.requestedModel,
    expectedFinal: launched.final });
  if (!resultReadback.ok || launched.observed?.model !== resultReadback.model) {
    return holdFinal(launched, resultReadback.ok ? "AGY-RESULT-READBACK-MODEL" : resultReadback.code);
  }
  if (launched.final?.outcome !== "succeeded") return holdFinal(launched, "AGY-FINAL-NONAUTHORING");
  const admission = assessAgyHostCommit({ baseline: captured.baseline, final: launched.final, allowedPaths: stored.record.allowedPaths });
  if (!admission.ok) return holdFinal(launched, admission.code);
  const trigger = { schema: CRITIC_TRIGGER_INPUT_SCHEMA, rigorLevel: 2,
    riskClass: "low", riskFlag: true, diff: classifyCriticChangedPaths(admission.paths) };
  const criticRequired = { schema: CRITIC_REQUIRED_SCHEMA, trigger,
    appliedRow: evaluateCriticTriggerRow(trigger),
    reason: "Host-observed Agy implementation requires independent Critic evidence." };
  const recordPreflight = preflightAgyAuthoredRecord({ taskId: request.packet.dispatchId,
    agentType: agyAgentTypeForRole(request.packet.role), observedModel: resultReadback.model,
    effort: request.effort, rulesetSha: request.routePolicySha256,
    baselineCommit: request.packet.candidate.commit, final: resultReadback.final,
    criticRequired });
  if (!recordPreflight.ok) return holdFinal(launched, recordPreflight.code);
  return { ...launched, commitAdmission: { code: admission.code, candidateCommit: admission.candidateCommit, paths: admission.paths,
    admittedBlobs: admission.admittedBlobs, baseline: captured.baseline,
    criticRequired,
    recordPreflight: { code: recordPreflight.code, reportSha256: recordPreflight.reportSha256 },
    // Only this descriptor-pinned result readback carries the report text
    // forward to the later host-owned authored-record preflight. The outer
    // public dispatch receipt intentionally omits it.
    final: resultReadback.final,
    modelWitness: { schema: "pipeline.agy-host-model-witness.v1", sessionId: live.session.id,
      descriptorSha256: request.descriptorSha256, dispatchId: request.packet.dispatchId,
      candidateCommit: request.packet.candidate.commit, candidateTree: request.packet.candidate.tree,
      role: request.packet.role,
      model: resultReadback.model, effort: request.effort,
      routePolicySha256: request.routePolicySha256,
      resultSha256: resultReadback.resultSha256, resultPath: request.resultPath,
      resultBytes: launched.result.bytes, reportSha256: resultReadback.reportSha256,
      consentSubjectSha256: current.record.subjectSha256, consentDecisionId: current.record.decisionId,
      consentRecordSha256: digest(current.record), scope: structuredClone(request.scope),
      inputSha256: request.inputSha256, observedAtMs: dependencies.nowEpochMs ?? Date.now() } } };
}

export function parseArgs(argv) {
  if (!Array.isArray(argv) || argv.length !== 2 || argv[0] !== "--request" || typeof argv[1] !== "string" || argv[1].trim() === "") throw new Error("usage: goldfish-antigravity-live-host.mjs --request <sealed-request.json>");
  return argv[1];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void readRequest;
  void parseArgs;
  process.stderr.write("goldfish-antigravity-live-host: internal-only; use elephant-implementation-dispatch.mjs\n");
  process.exitCode = 64;
}
