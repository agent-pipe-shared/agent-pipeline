#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

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
import { canonicalJson } from "../lib/codex-sandbox-compatibility.mjs";
import { executeSandboxedReadonlyDuty, runSandboxedReadonlyHostBridge } from "./sandboxed-readonly-host-bridge.mjs";
import { sandboxSelectionDigest } from "./codex-sandbox-select.mjs";
import { createCodexSandboxRuntimeTransport } from "./codex-sandbox-runtime.mjs";
import { invokeCodexAdvisoryAppServer } from "./codex-advisory-app-server.mjs";
import { AdvisoryReceiptAssuranceError, persistAdvisoryReceipt } from "../lib/advisory-receipt-assurance.mjs";

const USAGE = "usage: advisory-host-bridge.mjs --input <json> --receipt <json> [--timeout-ms <1000..600000>]";
const SHA256 = /^[a-f0-9]{64}$/;

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) throw new Error(`${label} is not closed`);
}
function equal(left, right) { return canonicalJson(left) === canonicalJson(right); }
function sandboxExecutionEvidence(value, selection) {
  exactKeys(value, ["schema", "selectionId", "selectionSha256", "repoFingerprint", "duty", "dispatch", "observed", "terminal"], "sandbox execution evidence");
  if (value.schema !== "pipeline.codex-sandbox-host-execution.v1" || value.selectionId !== selection.selectionId
    || value.selectionSha256 !== sandboxSelectionDigest(selection) || value.repoFingerprint !== selection.repoFingerprint
    || value.duty !== "advisory" || !equal(value.dispatch, selection.dispatch)) throw new Error("sandbox execution evidence does not bind the selected advisory");
  exactKeys(value.observed, ["cliSha256", "profileSha256", "networkEnabled", "scratchRootSha256"], "sandbox execution observation");
  if (value.observed.cliSha256 !== selection.toolchain.cliSha256 || value.observed.profileSha256 !== selection.profile.sha256
    || value.observed.networkEnabled !== true || value.observed.scratchRootSha256 !== selection.profile.scratchRootSha256) {
    throw new Error("sandbox execution observation does not read back the selected profile");
  }
  exactKeys(value.terminal, ["childStarted", "exitCode", "stdioStatus", "cleanupStatus"], "sandbox execution terminal");
  if (value.terminal.childStarted !== true || value.terminal.exitCode !== 0
    || value.terminal.stdioStatus !== "complete" || value.terminal.cleanupStatus !== "complete") {
    throw new Error("sandbox execution terminal is not a started child observation");
  }
  return value;
}

/**
 * Explicit affected-Codex advisory call site. Selection is supplied by the
 * committed prelaunch selector; the generic bridge returns execution receipt
 * evidence bound to the same advisory dispatch before coordinator invocation.
 */
export async function runSelectedAdvisoryHost({ selectionId, requested, references = [] }, transport) {
  return runSandboxedReadonlyHostBridge({ selectionId, duty: "advisory", requested, references }, transport);
}

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function advisoryReceiptBytes(receipt) { return Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8"); }

/**
 * Production Codex advisory call path. The coordinator cannot see an adapter
 * until an exact selector record has been read back by the generic bridge.
 */
export async function runCodexAdvisoryThroughSelectedSandbox(input, adapter, transport = {}) {
  const context = input?.sandboxContext;
  if (!context || typeof context !== "object" || Array.isArray(context)
    || JSON.stringify(Object.keys(context).sort()) !== JSON.stringify(["referenceSetSha256", "repoFingerprint"])
    || !SHA256.test(context.repoFingerprint) || !SHA256.test(context.referenceSetSha256)) {
    throw new Error("Codex advisory selection context is unavailable");
  }
  const { sandboxContext: _sandboxContext, advisorExport, ...coordinatorInput } = input;
  let advisoryResult = null;
  let launchedEvidence = null;
  let adapterInvoked = false;
  const selected = await (transport.executeSandboxedReadonlyDuty ?? executeSandboxedReadonlyDuty)({
    duty: "advisory",
    repoFingerprint: context.repoFingerprint,
    dispatch: {
      queueRevision: coordinatorInput.dispatch.queueRevision,
      candidateCommit: coordinatorInput.dispatch.candidateCommit,
      candidateTree: coordinatorInput.dispatch.candidateTree,
      referenceSetSha256: context.referenceSetSha256,
    },
    requested: { runner: "codex", model: "gpt-5.6-sol" },
    references: [],
  }, {
    selection: transport.selection,
    store: transport.store,
    bridge: {
      ...transport.bridge,
      launch: async ({ selection, requested, references, profile, scratch }) => {
      const selectedAdapter = async (payload) => {
        adapterInvoked = true;
        const response = await adapter({
          ...payload,
          sandboxTransport: {
            selectionId: selection.selectionId,
            selectionSha256: sandboxSelectionDigest(selection),
            repoFingerprint: selection.repoFingerprint,
            duty: "advisory",
            dispatch: structuredClone(selection.dispatch),
            requested: structuredClone(requested),
            toolchain: structuredClone(selection.toolchain),
            profile: structuredClone(profile),
            scratch: structuredClone(scratch),
            references: [...references],
          },
        });
        if (response?.sandboxExecution !== undefined) launchedEvidence = response.sandboxExecution;
        if (!response || typeof response !== "object") return response;
        const { sandboxExecution: _sandboxExecution, ...coordinatorResponse } = response;
        return coordinatorResponse;
      };
      advisoryResult = await coordinateAdvisory({
        ...coordinatorInput,
        sandbox: {
          selectionId: selection.selectionId,
          selectionSha256: sandboxSelectionDigest(selection),
          requestSha256: selection.dispatch.requestSha256,
          assurance: selection.assurance,
        },
      }, { invokeNative: selectedAdapter, invokeConsult: selectedAdapter, advisorExport });
      if (!launchedEvidence) return { childStarted: false };
      const evidence = sandboxExecutionEvidence(launchedEvidence, selection);
      return { childStarted: true, evidence };
      },
      finalize: async ({ selection, requested, launched }) => ({
        schema: "pipeline.codex-sandbox-execution-receipt.v1",
        selectionId: selection.selectionId,
        selectionSha256: sandboxSelectionDigest(selection),
        repoFingerprint: selection.repoFingerprint,
        duty: "advisory",
        dispatch: structuredClone(selection.dispatch),
        requested: structuredClone(requested),
        observed: structuredClone(launched.evidence.observed),
        terminal: structuredClone(launched.evidence.terminal),
        assurance: structuredClone(selection.assurance),
        dutyReceipt: {
          schema: "pipeline.advisory-receipt.v1",
          sha256: sha256(advisoryReceiptBytes(advisoryResult?.receipt ?? { code: advisoryResult?.code ?? "adapter-failed" })),
          status: advisoryResult?.ok ? "answered" : "error",
        },
        createdAt: new Date().toISOString(),
      }),
    },
  });
  if (!selected.childStarted) {
    // A selected host adapter may already have received a question but failed
    // to attest its child. Retrying that case through the substitute route
    // could create two advisor turns. Only a pre-dispatch selection failure
    // is eligible for the one fresh host-consult fallback below.
    return {
      advisoryResult: {
        ok: false,
        code: adapterInvoked ? "sandbox_execution_unattested" : "sandbox_selection_unavailable",
        answer: null,
        receipt: null,
        attempts: [],
      },
      execution: null,
    };
  }
  return { advisoryResult, execution: selected };
}

/** Compatibility export retained for callers of the former composition seam.
 * The selected sandbox is now the only Bash-capable Codex transport; there is
 * deliberately no unbound host-shell fallback.
 */
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
  const adapter = dependencies.makeHostAdapter?.(iterator, args.timeoutMs) ?? makeHostAdapter(iterator, args.timeoutMs);
  try {
    let result;
    let execution = null;
    const advisorExport = input?.advisorExport;
    const advisoryDisabled = advisorExport && typeof advisorExport === "object" && !Array.isArray(advisorExport)
      && Object.keys(advisorExport).length === 1 && advisorExport.consent === "declined";
    if (advisoryDisabled) {
      // An explicit decline is a normal optional state. The
      // coordinator returns the typed disabled result before any adapter,
      // selected-sandbox probe, child, export, or receipt.
      result = await coordinateAdvisory(input, { advisorExport });
    } else if (input.runner === "codex") {
      try {
        const transport = dependencies.createCodexSandboxRuntimeTransport?.(input) ?? createCodexSandboxRuntimeTransport(input);
        const nativeAdapter = dependencies.invokeCodexAdvisoryAppServer ?? invokeCodexAdvisoryAppServer;
        const outcome = await runCodexAdvisoryWithHostFallback(input, nativeAdapter, transport);
        result = outcome.advisoryResult;
        execution = outcome.execution;
      } catch (error) {
        if (process.env.PIPELINE_DEBUG_SANDBOX === "1") throw error;
        // Produce one sanitized exhausted receipt without emitting an adapter
        // request. The unavailable selected transport never authorizes an
        // unbound host shell or a second consult.
        result = await coordinateAdvisory(input, {
          advisorExport,
          invokeConsult: async () => ({ status: "unavailable" }),
        });
      }
    } else result = await coordinateAdvisory(input, { invokeNative: adapter, invokeConsult: adapter, advisorExport });
    let reported = result;
    let receiptPath = null;
    if (result.receipt) {
      try {
        writeReceiptAtomic(args.receipt, result.receipt);
        receiptPath = resolve(args.receipt);
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
      answer: reported.answer,
      receiptPath,
      attempts: reported.attempts,
      sandboxBinding: execution?.childStarted === true ? {
        selectionId: execution.selectionId,
        selectionSha256: execution.selectionSha256,
        executionReceiptSha256: execution.executionReceiptSha256,
        dutyReceiptSha256: execution.dutyReceiptSha256,
      } : null,
    });
    return reported.ok ? 0 : 2;
  } finally {
    lines.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAdvisoryHostBridge().then(
    (code) => { process.exitCode = code; },
    (error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = error.message === USAGE ? 64 : 70;
    },
  );
}
