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
import { pathToFileURL } from "node:url";

import { coordinateAdvisory } from "../lib/advisory-coordinator.mjs";
import { validateAdvisoryReceipt } from "../lib/advisory-receipt.mjs";
import { AdvisoryReceiptAssuranceError, persistAdvisoryReceipt } from "../lib/advisory-receipt-assurance.mjs";
import { ROUTES, selectHostAdvisorRoute } from "./codex-host-advisor-route.mjs";
import { invokeCodexAdvisoryAppServer } from "./codex-advisory-app-server.mjs";
import { createCodexSandboxRuntimeTransport } from "./codex-sandbox-runtime.mjs";
import { sandboxSelectionDigest } from "./codex-sandbox-select.mjs";
import { executeSandboxedReadonlyDuty } from "./sandboxed-readonly-host-bridge.mjs";
import { observeHostAdvisorWorkspace } from "./host-advisor-workspace.mjs";

const USAGE = "usage: advisory-host-bridge.mjs --input <json> --receipt <json> [--timeout-ms <1000..600000>]";

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function advisoryReceiptBytes(receipt) { return Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8"); }
function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) throw new Error(`${label} is not closed`);
}
function hostRouteInput(input) {
  const advisorExport = input?.advisorExport;
  if (advisorExport !== undefined && (advisorExport === null || typeof advisorExport !== "object" || Array.isArray(advisorExport)
    || JSON.stringify(Object.keys(advisorExport).sort()) !== JSON.stringify(["consent"]))) {
    throw Object.assign(new Error("advisor export consent is invalid"), { code: "invalid-route-input" });
  }
  return { runner: input?.runner, profile: input?.profile, consent: advisorExport?.consent ?? "default" };
}

function receiptFor(input, { status, identity = null, answer = null, fallbackReason = "none" }) {
  const receipt = {
    schema: "pipeline.advisory-receipt.v1",
    receiptId: `advisory-${randomUUID()}`,
    dispatch: structuredClone(input.dispatch),
    duty: "advisory",
    profile: input.profile,
    configuredRoute: { runner: "codex", selector: { kind: "model-id", value: "gpt-5.6-sol" }, effort: "max" },
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

function unavailable(input, code, execution = null) {
  return {
    advisoryResult: { ok: false, code, answer: null, receipt: receiptFor(input, { status: "unavailable", fallbackReason: "consult-unavailable" }), attempts: [] },
    execution,
    sandboxBinding: null,
  };
}

function selectedAdvisoryHostBridge(input, { invokeAppServer = invokeCodexAdvisoryAppServer } = {}) {
  const completed = new Map();
  return {
    async launch(request) {
      exactKeys(request, ["selectionId", "duty", "selection", "requested", "references", "profile", "scratch"], "selected advisory launch");
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
      const result = await invokeAppServer({ question: input.question, sandboxTransport });
      if (result?.status !== "answered" || typeof result.answer !== "string" || !result.sandboxExecution
        || result.identity?.provider !== "openai" || result.identity?.modelId !== "gpt-5.6-sol" || result.identity?.effort !== "max") {
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
      const receipt = receiptFor(input, { status: "answered", identity: result.identity, answer: result.answer });
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
}

/**
 * The only Codex advisory success path. It composes the repository-private
 * selector before launch and returns an answer only when the resulting durable
 * execution receipt and its selected dispatch bind exactly to that child.
 */
export async function runSelectedAdvisoryHost(input, transport = undefined) {
  const selectedHost = selectedAdvisoryHostBridge(input, { invokeAppServer: transport?.invokeCodexAdvisoryAppServer ?? invokeCodexAdvisoryAppServer });
  let dependencies = transport?.dependencies;
  if (dependencies !== undefined) {
    dependencies = {
      ...dependencies,
      bridge: { ...dependencies.bridge, ...selectedHost },
    };
  }
  if (dependencies === undefined) {
    try {
      dependencies = createCodexSandboxRuntimeTransport({
        sandboxContext: structuredClone(input.sandboxContext),
        sandboxRuntime: input.sandboxRuntime,
        hostBridge: selectedHost,
      });
    } catch {
      return unavailable(input, "selected-sandbox-required");
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
      requested: { runner: "codex", model: "gpt-5.6-sol" },
      references: input.references ?? [],
    }, dependencies);
  } catch {
    return unavailable(input, "selected-sandbox-required");
  }
  if (selected?.status !== "answered" || selected.childStarted !== true || typeof selected.selectionId !== "string") {
    return unavailable(input, "selected-sandbox-required");
  }
  const completed = selectedHost.take(selected.selectionId);
  if (!completed || completed.execution.selectionId !== selected.selectionId
    || completed.execution.selectionSha256 !== selected.selectionSha256
    || completed.execution.dutyReceipt.sha256 !== selected.dutyReceiptSha256) return unavailable(input, "selected-sandbox-required");
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

/**
 * Production Codex advisory call path. The coordinator cannot see an adapter
 * until an exact selector record has been read back by the generic bridge.
 */
export async function runCodexAdvisoryThroughSelectedSandbox(input, adapter, transport = {}) {
  const route = selectHostAdvisorRoute(hostRouteInput(input));
  if (route !== ROUTES.HOST) return disabledHostAdvisory(route);
  const root = transport.repoRoot ?? process.cwd();
  const observe = transport.observeWorkspace ?? observeHostAdvisorWorkspace;
  let before;
  try { before = observe(root); } catch { return unavailable(input, "host-observation-unavailable"); }
  // A JSON reply from a host adapter carries neither an exact sandbox selection
  // nor a child/identity attestation. It is intentionally ignored.
  void adapter;
  const outcome = await runSelectedAdvisoryHost(input, transport);
  let after;
  try { after = observe(root); } catch { return unavailable(input, "host-observation-unavailable", outcome.execution); }
  if (before.workspaceSha256 !== after.workspaceSha256) return unavailable(input, "workspace-drift-unavailable", outcome.execution);
  return outcome;
}

/** Compatibility export retained for callers of the former composition seam. */
export async function runCodexAdvisoryWithHostFallback(input, adapter, transport = {}) {
  return runCodexAdvisoryThroughSelectedSandbox(input, adapter, transport);
}

function parseArgs(argv) {
  const parsed = { timeoutMs: 120_000 };
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

function writeReceiptAtomic(path, receipt) {
  const target = resolve(path);
  const temporaryName = `.${basename(target)}.tmp-${process.pid}-${randomUUID()}`;
  return persistAdvisoryReceipt({ target, bytes: advisoryReceiptBytes(receipt), temporaryName });
}

export async function runAdvisoryHostBridge(argv = process.argv.slice(2), dependencies = {}) {
  const args = parseArgs(argv);
  const inputPath = resolve(args.input);
  const rawInput = await readFile(inputPath, "utf8");
  // Consume raw content before an adapter can run so ordinary failures,
  // timeouts and host-protocol errors cannot strand the question on disk.
  await unlink(inputPath);
  const input = JSON.parse(rawInput);
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const iterator = lines[Symbol.asyncIterator]();
  try {
    let result;
    let execution = null;
    const advisorExport = input?.advisorExport;
    if (input.runner === "codex") {
      const outcome = await runCodexAdvisoryWithHostFallback(input, null, { repoRoot: process.cwd() });
      result = outcome.advisoryResult;
      execution = outcome.execution;
      var sandboxBinding = outcome.sandboxBinding;
    } else {
      const adapter = dependencies.makeHostAdapter?.(iterator, args.timeoutMs) ?? makeHostAdapter(iterator, args.timeoutMs);
      result = await coordinateAdvisory(input, { invokeNative: adapter, invokeConsult: adapter, advisorExport });
    }
    let reported = result;
    let receiptPath = null;
    let directoryDurability = null;
    if (execution?.schema === "pipeline.host-advisor-status.v1") {
      const persisted = writeReceiptAtomic(args.receipt, execution);
      receiptPath = resolve(args.receipt);
      directoryDurability = persisted?.directoryDurability ?? null;
    } else if (result.receipt) {
      try {
        const persisted = writeReceiptAtomic(args.receipt, result.receipt);
        receiptPath = resolve(args.receipt);
        directoryDurability = persisted?.directoryDurability ?? null;
      } catch (error) {
        if (!(error instanceof AdvisoryReceiptAssuranceError)) throw error;
        reported = { ...result, ok: false, code: `advisory_receipt_${error.status}`, answer: null, receipt: null };
      }
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
      sandboxBinding: sandboxBinding ?? null,
    });
    return reported.ok ? 0 : 2;
  } finally {
    lines.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAdvisoryHostBridge().then(
    (code) => { process.exitCode = code; },
    (error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = error.message === USAGE ? 64 : 70;
    },
  );
}
