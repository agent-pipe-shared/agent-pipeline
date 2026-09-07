#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Executable host bridge for runner-neutral advisory.
 *
 * The coordinator remains the only route/fallback authority. The host receives
 * one JSON-line adapter request at a time on stdout and returns the matching
 * adapter result on stdin. Raw question/answer content exists only on this
 * runtime transport; only the sanitized receipt is written to disk.
 */
import { createHash, randomUUID } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { createInterface } from "node:readline";

import { coordinateAdvisory } from "../lib/advisory-coordinator.mjs";
import { buildAdvisoryDecisionEvent } from "../lib/advisory-decision-event.mjs";
import {
  advisoryEvidenceBundleSha256,
  advisoryConsultationDisposition,
  createAdvisoryConsultationRecord,
  sameAdvisoryEvidenceRepository,
  validateAdvisoryDemand,
  validateAdvisoryEvidenceBundleForRepository,
} from "../lib/advisory-lifecycle-v2.mjs";
import { validateAdvisoryReceipt } from "../lib/advisory-receipt.mjs";
import { AdvisoryReceiptAssuranceError, persistAdvisoryReceipt } from "../lib/advisory-receipt-assurance.mjs";
import { canonicalJson } from "../lib/codex-sandbox-compatibility.mjs";
import { canonicalSha256, parseStrictJson } from "../lib/governance-event.mjs";
import { appendPortableGovernanceEvent, readLocalRepositoryFingerprint } from "../lib/governance-event-store.mjs";
import { readPublicRepositoryFile } from "../lib/threat-model-approval-request.mjs";
import { discoverRepository } from "../lib/worktree-lifecycle.mjs";
import { resolveV3DutyRoute } from "../lib/critic-route-v3.mjs";
import { ROUTES, selectHostAdvisorRoute } from "./codex-host-advisor-route.mjs";
import { invokeCodexAdvisoryAppServer } from "./codex-advisory-app-server.mjs";
import { createCodexSandboxRuntimeTransport } from "./codex-sandbox-runtime.mjs";
import { sandboxSelectionDigest } from "./codex-sandbox-select.mjs";
import { executeSandboxedReadonlyDuty } from "./sandboxed-readonly-host-bridge.mjs";
import { observeHostAdvisorWorkspace } from "./host-advisor-workspace.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

const USAGE = "usage: advisory-host-bridge.mjs --input <json> --receipt <json> [--timeout-ms <1000..600000>]";

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function jsonBytes(value) { return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) throw new Error(`${label} is not closed`);
}
function equal(left, right) { return canonicalJson(left) === canonicalJson(right); }
function hostRouteInput(input) {
  const advisorExport = input?.advisorExport;
  if (advisorExport !== undefined && (advisorExport === null || typeof advisorExport !== "object" || Array.isArray(advisorExport)
    || JSON.stringify(Object.keys(advisorExport).sort()) !== JSON.stringify(["consent"]))) {
    throw Object.assign(new Error("advisor export consent is invalid"), { code: "invalid-route-input" });
  }
  return { runner: input?.runner, profile: input?.profile, consent: advisorExport?.consent ?? "default" };
}

function resolvedAdvisoryRoute(input, rootDir, resolveRoute = resolveV3DutyRoute) {
  try {
    const route = resolveRoute({
      rootDir,
      dutyId: "advisory",
      runner: "codex",
      candidateCommit: input?.dispatch?.candidateCommit,
    });
    exactKeys(route, ["dutyId", "runner", "model", "effort", "state", "sourceSha256", "candidateCommit"], "resolved Codex advisory route");
    if (route.dutyId !== "advisory" || route.runner !== "codex" || route.state !== "default"
      || typeof route.model !== "string" || route.model.length === 0
      || typeof route.effort !== "string" || route.effort.length === 0
      || !/^[a-f0-9]{64}$/.test(route.sourceSha256)
      || route.candidateCommit !== input?.dispatch?.candidateCommit) return null;
    return Object.freeze({ ...route });
  } catch { return null; }
}

function receiptFor(input, advisoryRoute, { status, identity = null, answer = null, fallbackReason = "none" }) {
  const receipt = {
    schema: "pipeline.advisory-receipt.v1",
    receiptId: `advisory-${randomUUID()}`,
    dispatch: structuredClone(input.dispatch),
    duty: "advisory",
    profile: input.profile,
    configuredRoute: { runner: "codex", selector: { kind: "model-id", value: advisoryRoute.model }, effort: advisoryRoute.effort },
    adapter: "consult",
    observed: { status, identity: identity === null ? null : structuredClone(identity) },
    questionSha256: sha256(input.question),
    answerSha256: answer === null ? null : sha256(answer),
    fallback: {
      reason: fallbackReason,
      redactedErrorClass: fallbackReason === "none" ? null : fallbackReason.endsWith("unavailable") ? "unavailable" : "failure",
    },
    emittedAtMs: Date.now(),
  };
  const checked = validateAdvisoryReceipt(receipt);
  if (!checked.ok) throw new Error(`selected advisory receipt is invalid: ${checked.reason}`);
  return receipt;
}

function unavailable(input, advisoryRoute, code, execution = null) {
  return {
    advisoryResult: { ok: false, code, answer: null, receipt: receiptFor(input, advisoryRoute, { status: "unavailable", fallbackReason: "consult-unavailable" }), attempts: [] },
    execution,
    sandboxBinding: null,
  };
}

function selectedAdvisoryHostBridge(input, advisoryRoute, { invokeAppServer = invokeCodexAdvisoryAppServer, repoRoot } = {}) {
  const completed = new Map();
  const bridge = {
    async launch(request) {
      exactKeys(request, ["selectionId", "duty", "selection", "requested", "references", "profile", "scratch"], "selected advisory launch");
      const evidence = validateAdvisoryEvidenceBundleForRepository(
        request.scratch?.repoRoot,
        input.evidenceBundle,
        input.demand.evidenceSha256,
      );
      const evidencePaths = input.evidenceBundle?.references?.map(({ path }) => path);
      if (!evidence.ok || !equal(request.references, evidencePaths)
        || !sameAdvisoryEvidenceRepository(request.scratch?.repoRoot, repoRoot)
        || request.selection.dispatch.referenceSetSha256 !== evidence.bundleSha256) {
        throw new Error("selected advisory evidence binding is invalid");
      }
      const sandboxTransport = {
        selectionId: request.selectionId,
        selectionSha256: sandboxSelectionDigest(request.selection),
        repoFingerprint: request.selection.repoFingerprint,
        duty: request.duty,
        dispatch: structuredClone(request.selection.dispatch),
        requested: structuredClone(request.requested),
        toolchain: structuredClone(request.selection.toolchain),
        profile: structuredClone(request.profile),
        scratch: structuredClone(request.scratch),
      };
      const result = await invokeAppServer({ question: input.question, evidenceBundle: structuredClone(input.evidenceBundle), sandboxTransport, advisoryRoute });
      if (result?.status !== "answered" || typeof result.answer !== "string" || !result.sandboxExecution
        || result.identity?.provider !== "openai" || result.identity?.modelId !== advisoryRoute.model || result.identity?.effort !== advisoryRoute.effort
        || !matchesSelectedHostExecution(result.sandboxExecution, sandboxTransport)) {
        return { childStarted: result?.childStarted === true ? true : undefined };
      }
      completed.set(request.selectionId, { result, sandboxTransport });
      return { childStarted: result.sandboxExecution.terminal?.childStarted === true, selectionId: request.selectionId };
    },
    async finalize({ selection, launched, requested }) {
      const completedResult = completed.get(selection?.selectionId);
      if (!completedResult || launched?.selectionId !== selection.selectionId) throw new Error("selected advisory launch result is unavailable");
      const { result, sandboxTransport } = completedResult;
      if (sandboxTransport.selectionSha256 !== sandboxSelectionDigest(selection)
        || sandboxTransport.repoFingerprint !== selection.repoFingerprint
        || JSON.stringify(sandboxTransport.dispatch) !== JSON.stringify(selection.dispatch)
        || JSON.stringify(sandboxTransport.requested) !== JSON.stringify(requested)) throw new Error("selected advisory binding drifted");
      const receipt = receiptFor(input, advisoryRoute, { status: "answered", identity: result.identity, answer: result.answer });
      const hostExecution = result.sandboxExecution;
      const execution = {
        schema: "pipeline.codex-sandbox-execution-receipt.v1",
        selectionId: selection.selectionId,
        selectionSha256: sandboxSelectionDigest(selection),
        repoFingerprint: selection.repoFingerprint,
        duty: "advisory",
        dispatch: structuredClone(selection.dispatch),
        requested: structuredClone(requested),
        observed: structuredClone(hostExecution.observed),
        terminal: structuredClone(hostExecution.terminal),
        assurance: structuredClone(selection.assurance),
        dutyReceipt: { schema: "pipeline.advisory-receipt.v1", sha256: sha256(JSON.stringify(receipt)), status: "answered" },
        createdAt: new Date().toISOString(),
      };
      completed.set(selection.selectionId, { result, receipt, execution });
      return execution;
    },
    take(selectionId) {
      const result = completed.get(selectionId);
      if (!result?.receipt || !result?.execution) return null;
      return { answer: result.result.answer, receipt: structuredClone(result.receipt), execution: structuredClone(result.execution) };
    },
  };
  return { hostBridge: { launch: bridge.launch, finalize: bridge.finalize }, take: bridge.take };
}

function matchesSelectedHostExecution(value, selected) {
  try {
    exactKeys(value, ["schema", "selectionId", "selectionSha256", "repoFingerprint", "duty", "dispatch", "observed", "terminal"], "selected advisory host execution");
    return value.schema === "pipeline.codex-sandbox-host-execution.v1"
      && value.selectionId === selected.selectionId
      && value.selectionSha256 === selected.selectionSha256
      && value.repoFingerprint === selected.repoFingerprint
      && value.duty === selected.duty
      && equal(value.dispatch, selected.dispatch)
      && equal(value.observed, {
        cliSha256: selected.toolchain.cliSha256,
        profileSha256: selected.profile.sha256,
        networkEnabled: true,
        scratchRootSha256: selected.profile.scratchRootSha256,
      })
      && equal(value.terminal, { childStarted: true, exitCode: 0, stdioStatus: "complete", cleanupStatus: "complete" });
  } catch { return false; }
}

/**
 * The only Codex advisory success path. It composes the repository-private
 * selector before launch and returns an answer only when the resulting durable
 * execution receipt and its selected dispatch bind exactly to that child.
 */
export async function runSelectedAdvisoryHost(input, transport = undefined) {
  const demand = validateAdvisoryDemand(input?.demand, {
    runner: input?.runner,
    profile: input?.profile,
    question: input?.question,
    dispatch: input?.dispatch,
  });
  if (!demand.ok) return demandRejected(demand.code);
  const evidenceRoot = transport?.repoRoot ?? input?.sandboxRuntime?.repoRoot;
  const evidence = validateAdvisoryEvidenceBundleForRepository(
    evidenceRoot,
    input?.evidenceBundle,
    input?.demand?.evidenceSha256 ?? null,
  );
  const evidencePaths = input?.evidenceBundle?.references?.map(({ path }) => path);
  if (!evidence.ok || !equal(input?.references, evidencePaths)
    || input?.sandboxContext?.referenceSetSha256 !== evidence.bundleSha256
    || advisoryEvidenceBundleSha256(input.evidenceBundle) !== input.demand.evidenceSha256) {
    return demandRejected("advisory_evidence_binding_mismatch");
  }
  const disposition = advisoryConsultationDisposition(input.demand, input.priorConsultation);
  if (!disposition.ok) return demandRejected(disposition.code);
  if (disposition.disposition === "reuse-no-repeat") {
    return {
      advisoryResult: {
        ok: true,
        code: "advisory_reused_no_repeat",
        answer: null,
        receipt: null,
        consultationRecord: structuredClone(input.priorConsultation),
        attempts: [],
      },
      execution: null,
      sandboxBinding: null,
    };
  }
  const advisoryRoute = resolvedAdvisoryRoute(
    input,
    evidenceRoot,
    transport?.resolveAdvisoryRoute ?? resolveV3DutyRoute,
  );
  if (advisoryRoute === null) return demandRejected("advisory_route_unavailable");
  const selectedHost = selectedAdvisoryHostBridge(input, advisoryRoute, {
    invokeAppServer: transport?.invokeCodexAdvisoryAppServer ?? invokeCodexAdvisoryAppServer,
    repoRoot: evidenceRoot,
  });
  let dependencies = transport?.dependencies;
  if (dependencies !== undefined) {
    dependencies = {
      ...dependencies,
      bridge: { ...dependencies.bridge, ...selectedHost.hostBridge },
    };
  }
  if (dependencies === undefined) {
    try {
      dependencies = createCodexSandboxRuntimeTransport({
        sandboxContext: structuredClone(input.sandboxContext),
        sandboxRuntime: input.sandboxRuntime,
        hostBridge: selectedHost.hostBridge,
      });
    } catch {
      return unavailable(input, advisoryRoute, "selected-sandbox-required");
    }
  }
  let selected;
  try {
    selected = await (dependencies.executeSandboxedReadonlyDuty ?? executeSandboxedReadonlyDuty)({
      duty: "advisory",
      repoFingerprint: input.sandboxContext.repoFingerprint,
      dispatch: {
        queueRevision: input.dispatch.queueRevision,
        candidateCommit: input.dispatch.candidateCommit,
        candidateTree: input.dispatch.candidateTree,
        referenceSetSha256: input.sandboxContext.referenceSetSha256,
      },
      requested: { runner: "codex", model: advisoryRoute.model },
      references: input.references ?? [],
    }, dependencies);
  } catch {
    return unavailable(input, advisoryRoute, "selected-sandbox-required");
  }
  if (selected?.status !== "answered" || selected.childStarted !== true || typeof selected.selectionId !== "string") {
    return unavailable(input, advisoryRoute, "selected-sandbox-required");
  }
  const completed = selectedHost.take(selected.selectionId);
  if (!completed || completed.execution.selectionId !== selected.selectionId
    || completed.execution.selectionSha256 !== selected.selectionSha256
    || completed.execution.dutyReceipt.sha256 !== selected.dutyReceiptSha256) return unavailable(input, advisoryRoute, "selected-sandbox-required");
  return {
    advisoryResult: { ok: true, code: "answered", answer: completed.answer, receipt: completed.receipt, attempts: [{ adapter: "host-consult", kind: "consult", runner: "codex", status: "answered" }] },
    execution: completed.execution,
    sandboxBinding: {
      selectionId: selected.selectionId,
      selectionSha256: selected.selectionSha256,
      executionReceiptSha256: selected.executionReceiptSha256,
      dutyReceiptSha256: selected.dutyReceiptSha256,
      assurance: structuredClone(selected.assurance),
    },
  };
}
function disabledHostAdvisory(route) {
  return {
    advisoryResult: {
      ok: false,
      code: route === ROUTES.NO_CONSENT ? "advisory_disabled_no_consent" : "advisory_disabled",
      answer: null,
      receipt: null,
      attempts: [],
    },
    execution: null,
  };
}

function demandRejected(code) {
  return {
    advisoryResult: { ok: false, code, answer: null, receipt: null, consultationRecord: null, attempts: [] },
    execution: null,
    sandboxBinding: null,
  };
}

function bindConsultationRecord(input, outcome) {
  const result = outcome.advisoryResult;
  if (result.consultationRecord || !result.receipt) return outcome;
  const record = createAdvisoryConsultationRecord({
    demand: input.demand,
    receipt: result.receipt,
    outcome: result.receipt.observed.status,
    completedAtMs: Date.now(),
  });
  return record.ok
    ? { ...outcome, advisoryResult: { ...result, consultationRecord: record.record } }
    : demandRejected(record.code);
}

/**
 * Production Codex advisory call path. The coordinator cannot see an adapter
 * until an exact selector record has been read back by the generic bridge.
 */
export async function runCodexAdvisoryThroughSelectedSandbox(input, adapter, transport = {}) {
  const route = selectHostAdvisorRoute(hostRouteInput(input));
  if (route !== ROUTES.HOST) return disabledHostAdvisory(route);
  const demand = validateAdvisoryDemand(input?.demand, {
    runner: input?.runner,
    profile: input?.profile,
    question: input?.question,
    dispatch: input?.dispatch,
  });
  if (!demand.ok) return demandRejected(demand.code);
  const disposition = advisoryConsultationDisposition(input.demand, input.priorConsultation);
  if (!disposition.ok) return demandRejected(disposition.code);
  if (disposition.disposition === "reuse-no-repeat") {
    return {
      advisoryResult: {
        ok: true,
        code: "advisory_reused_no_repeat",
        answer: null,
        receipt: null,
        consultationRecord: structuredClone(input.priorConsultation),
        attempts: [],
      },
      execution: null,
      sandboxBinding: null,
    };
  }
  const root = transport.repoRoot ?? process.cwd();
  const advisoryRoute = resolvedAdvisoryRoute(
    input,
    root,
    transport.resolveAdvisoryRoute ?? resolveV3DutyRoute,
  );
  if (advisoryRoute === null) return demandRejected("advisory_route_unavailable");
  const observe = transport.observeWorkspace ?? observeHostAdvisorWorkspace;
  let before;
  try { before = observe(root); } catch { return bindConsultationRecord(input, unavailable(input, advisoryRoute, "host-observation-unavailable")); }
  // A JSON reply from a host adapter carries neither an exact sandbox selection
  // nor a child/identity attestation. It is intentionally ignored.
  void adapter;
  const outcome = await runSelectedAdvisoryHost(input, transport);
  let after;
  try { after = observe(root); } catch { return bindConsultationRecord(input, unavailable(input, advisoryRoute, "host-observation-unavailable", outcome.execution)); }
  if (before.workspaceSha256 !== after.workspaceSha256) {
    return bindConsultationRecord(input, unavailable(input, advisoryRoute, "workspace-drift-unavailable", outcome.execution));
  }
  return bindConsultationRecord(input, outcome);
}

/** Compatibility export retained for callers of the former composition seam. */
export async function runCodexAdvisoryWithHostFallback(input, adapter, transport = {}) {
  return runCodexAdvisoryThroughSelectedSandbox(input, adapter, transport);
}

function parseArgs(argv) {
  // Native advisory turns can legitimately spend longer in startup and
  // reasoning than the adapter protocol itself. This remains one attempt.
  const parsed = { timeoutMs: 180_000 };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--input") parsed.input = argv[++index];
    else if (token === "--receipt") parsed.receipt = argv[++index];
    else if (token === "--timeout-ms") parsed.timeoutMs = Number(argv[++index]);
    else throw new Error(USAGE);
  }
  if (!parsed.input || !parsed.receipt || !Number.isSafeInteger(parsed.timeoutMs)
    || parsed.timeoutMs < 1_000 || parsed.timeoutMs > 600_000) throw new Error(USAGE);
  return parsed;
}

function emit(event) {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

function makeHostAdapter(iterator, timeoutMs) {
  return async (payload) => {
    const requestId = `host-${randomUUID()}`;
    emit({ schema: "pipeline.advisory-host.v1", type: "adapter.request", requestId, payload });
    let timer;
    try {
      const next = await Promise.race([
        iterator.next(),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            const error = new Error("host adapter response timed out");
            error.code = "ETIMEDOUT";
            reject(error);
          }, timeoutMs);
        }),
      ]);
      if (next.done) {
        const error = new Error("host adapter response stream closed");
        error.code = "EUNAVAILABLE";
        throw error;
      }
      let response;
      try {
        response = JSON.parse(next.value);
      } catch {
        const error = new Error("host adapter response is not JSON");
        error.code = "EPROTOCOL";
        throw error;
      }
      if (response?.schema !== "pipeline.advisory-host.v1"
        || response.type !== "adapter.result" || response.requestId !== requestId
        || !response.result || typeof response.result !== "object") {
        const error = new Error("host adapter response does not match the request");
        error.code = "EPROTOCOL";
        throw error;
      }
      return response.result;
    } finally {
      clearTimeout(timer);
    }
  };
}

function writeJsonAtomic(path, value) {
  const target = resolve(path);
  const temporaryName = `.${basename(target)}.tmp-${process.pid}-${randomUUID()}`;
  return persistAdvisoryReceipt({ target, bytes: jsonBytes(value), temporaryName });
}

/** No key on this envelope has anything to report at this call site; the same typed-state marker names that honestly, once, for every one of them. */
const AGENT_DECISION_UNAVAILABLE = Object.freeze({ state: "unavailable" });

/** Mirrors human-authority-grant.mjs's capturePolicyDigestFor: the exact digest governance-event-store.mjs's own agent-origin binding check requires. */
function capturePolicyDigestFor(primaryRoot) {
  return canonicalSha256(parseStrictJson(readPublicRepositoryFile(primaryRoot, "governance/events/capture-policy.json")));
}

/**
 * A-AC-05: translate an answered advisory receipt into a validated
 * agent-decision event and durably append it to the portable "agent"
 * governance stream (governance-event-store.mjs). Deliberately fail-open:
 * this event's represented classes are exactly `candidate`/`privacy`
 * (agent-decision-journal.mjs's `representedEventClasses`, for a `selection`/
 * `fallback` kind), both `fail-open` in `JOURNALING_UNAVAILABLE_DISPOSITIONS`
 * (A-AC-10). A translation or append failure is therefore reported back as a
 * typed gap marker -- never thrown past this function, and never allowed to
 * withhold the advisory answer itself, which is the caller's actual duty.
 */
async function recordAdvisoryDecisionEvent(receipt, { repoRoot }) {
  try {
    const event = buildAdvisoryDecisionEvent({ receipt });
    const repo = discoverRepository(repoRoot);
    const fingerprint = await readLocalRepositoryFingerprint({ repositoryRoot: repo.primaryRoot });
    const intent = {
      schema: "pipeline.governance-event-envelope.v1",
      payloadSchema: "pipeline.agent-decision-event.v1",
      canonicalization: "RFC8785",
      digestAlgorithm: "sha-256",
      eventId: event.eventId,
      idempotencyKey: event.eventId,
      origin: "agent",
      authorityClass: "non-authoritative",
      eventType: `agent.${event.kind}`,
      occurredAtEpochMs: receipt.emittedAtMs,
      observedAtEpochMs: Date.now(),
      timeAssurance: "locally-observed",
      repositoryFingerprint: fingerprint,
      sourceUri: `urn:pipeline:repository:${fingerprint}`,
      streamId: "agent",
      correlation: {
        featureId: AGENT_DECISION_UNAVAILABLE,
        packageId: AGENT_DECISION_UNAVAILABLE,
        requestId: AGENT_DECISION_UNAVAILABLE,
        sessionId: AGENT_DECISION_UNAVAILABLE,
        dispatchId: receipt.dispatch.dispatchId,
        traceId: AGENT_DECISION_UNAVAILABLE,
      },
      candidate: { commit: receipt.dispatch.candidateCommit, tree: receipt.dispatch.candidateTree },
      // No artifact is bound to an advisory decision: the module header states
      // raw question/answer content never reaches disk, so there is nothing
      // here for an artifact reference to point at -- an honest empty list,
      // not an omitted/unavailable placeholder for something that could exist.
      artifacts: [],
      policy: {
        policyDigest: AGENT_DECISION_UNAVAILABLE,
        configurationDigest: AGENT_DECISION_UNAVAILABLE,
        capturePolicyDigest: capturePolicyDigestFor(repo.primaryRoot),
        redactionPolicyDigest: AGENT_DECISION_UNAVAILABLE,
      },
      classification: "repository-public-safe",
      storageProfile: "repository-public-safe",
      retentionCompatibility: "repository-retained",
      disclosureClass: "repository-visible",
      payload: event,
    };
    const receipted = await appendPortableGovernanceEvent({ repositoryRoot: repo.primaryRoot, repositoryFingerprint: fingerprint, intent });
    return { appended: true, eventId: event.eventId, eventPath: receipted.eventPath, outcome: receipted.outcome };
  } catch (error) {
    return { appended: false, code: error?.code ?? "AGENT_DECISION_EVENT_UNAVAILABLE" };
  }
}

export async function runAdvisoryHostBridge(argv = process.argv.slice(2), dependencies = {}) {
  const args = parseArgs(argv);
  const inputPath = resolve(args.input);
  const rawInput = await readFile(inputPath, "utf8");
  // Consume raw content before an adapter can run so ordinary failures,
  // timeouts and host-protocol errors cannot strand the question on disk.
  await unlink(inputPath);
  const input = JSON.parse(rawInput);
  const consultationRecordPath = resolve(`${args.receipt}.consultation-v2.json`);
  if (input.priorConsultation === undefined) {
    try {
      input.priorConsultation = JSON.parse(await readFile(consultationRecordPath, "utf8"));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const iterator = lines[Symbol.asyncIterator]();
  try {
    let result;
    let execution = null;
    let agentDecisionEvent = null;
    const advisorExport = input?.advisorExport;
    if (input.runner === "codex") {
      const outcome = await runCodexAdvisoryWithHostFallback(input, null, { repoRoot: process.cwd() });
      result = outcome.advisoryResult;
      execution = outcome.execution;
      var sandboxBinding = outcome.sandboxBinding;
    } else {
      const adapter = dependencies.makeHostAdapter?.(iterator, args.timeoutMs) ?? makeHostAdapter(iterator, args.timeoutMs);
      result = await coordinateAdvisory(input, { invokeNative: adapter, invokeConsult: adapter, advisorExport });
      // A-AC-05: only a coordinateAdvisory outcome that actually observed an
      // identity is translatable (buildAdvisoryDecisionEvent's own
      // ADE-RECEIPT-UNANSWERED refusal); every other outcome (disabled,
      // reuse-no-repeat, exhausted route) leaves agentDecisionEvent at its
      // honest default of null rather than reporting a gap for a decision
      // that was never actually made.
      if (result.ok === true && result.receipt?.observed?.status === "answered") {
        agentDecisionEvent = await recordAdvisoryDecisionEvent(result.receipt, { repoRoot: dependencies.repoRoot ?? process.cwd() });
      }
    }
    let reported = result;
    let receiptPath = null;
    let directoryDurability = null;
    if (execution?.schema === "pipeline.host-advisor-status.v1") {
      const persisted = writeJsonAtomic(args.receipt, execution);
      receiptPath = resolve(args.receipt);
      directoryDurability = persisted?.directoryDurability ?? null;
    } else if (result.receipt) {
      try {
        const persisted = writeJsonAtomic(args.receipt, result.receipt);
        receiptPath = resolve(args.receipt);
        directoryDurability = persisted?.directoryDurability ?? null;
      } catch (error) {
        if (!(error instanceof AdvisoryReceiptAssuranceError)) throw error;
        reported = {
          ...result,
          ok: false,
          code: `advisory_receipt_${error.status}`,
          answer: null,
          receipt: null,
          consultationRecord: null,
        };
      }
    }
    let persistedConsultationRecordPath = null;
    if (reported.consultationRecord && reported.code !== "advisory_reused_no_repeat") {
      writeJsonAtomic(consultationRecordPath, reported.consultationRecord);
      persistedConsultationRecordPath = consultationRecordPath;
    } else if (reported.consultationRecord) {
      persistedConsultationRecordPath = consultationRecordPath;
    }
    emit({
      schema: "pipeline.advisory-host.v1",
      type: "advisory.completed",
      ok: reported.ok,
      code: reported.code,
      answer: execution?.schema === "pipeline.host-advisor-status.v1" ? null : reported.answer,
      receiptPath,
      directoryDurability,
      attempts: reported.attempts,
      consultationRecord: reported.consultationRecord ?? null,
      consultationRecordPath: persistedConsultationRecordPath,
      sandboxBinding: sandboxBinding ?? null,
      agentDecisionEvent,
    });
    return reported.ok ? 0 : 2;
  } finally {
    lines.close();
  }
}

if (isDirectInvocation(import.meta.url)) {
  runAdvisoryHostBridge().then(
    (code) => { process.exitCode = code; },
    (error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = error.message === USAGE ? 64 : 70;
    },
  );
}
