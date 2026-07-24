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
import { AdvisoryReceiptAssuranceError, persistAdvisoryReceipt } from "../lib/advisory-receipt-assurance.mjs";
import { createHostAdvisorLaunch, createHostAdvisorStatus, validateHostAdvisorStatus } from "../lib/host-advisor-status.mjs";
import { observeHostAdvisorWorkspace } from "./host-advisor-workspace.mjs";

const USAGE = "usage: advisory-host-bridge.mjs --input <json> --receipt <json> [--timeout-ms <1000..600000>]";

/** Compatibility seam: selected-sandbox advisory is intentionally unavailable. */
export async function runSelectedAdvisoryHost() { throw Object.assign(new Error("selected sandbox is not an advisory route"), { code: "host_route_required" }); }

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function advisoryReceiptBytes(receipt) { return Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8"); }

/**
 * Production Codex advisory call path. The coordinator cannot see an adapter
 * until an exact selector record has been read back by the generic bridge.
 */
export async function runCodexAdvisoryThroughSelectedSandbox(input, adapter, transport = {}) {
  const root = transport.repoRoot ?? process.cwd();
  const observe = transport.observeWorkspace ?? observeHostAdvisorWorkspace;
  const before = observe(root);
  const launch = createHostAdvisorLaunch(input.sessionId ?? input.sandboxRuntime?.sessionCleanup?.sessionId ?? "codex-session");
  const payload = { role: "consult-advisor", subagentType: "consult-advisor", runner: "codex", model: "gpt-5.6-sol", effort: "max", question: input.question, dispatch: structuredClone(input.dispatch), oneQuestion: true, freshContext: true, contextPolicy: "fresh-no-handover-no-chat-history-no-implementor-rationale", tools: ["Read", "Grep", "Glob"], memory: false, autoApply: false, sandbox_mode: "read-only" };
  let result;
  try { result = await adapter(payload); } catch { result = { status: "unavailable" }; }
  let after; let observationFailed = false;
  try { after = observe(root); } catch { observationFailed = true; after = { workspaceSha256: before.workspaceSha256 }; }
  const drifted = observationFailed || after.workspaceSha256 !== before.workspaceSha256;
  const outcome = !drifted && result?.status === "answered" && typeof result.answer === "string" ? "answered" : (observationFailed || result?.status === "unavailable" ? "unavailable" : "failed");
  let status;
  try { status = createHostAdvisorStatus({ candidate: { commit: input.dispatch.candidateCommit, tree: input.dispatch.candidateTree }, launch, questionSha256: sha256(input.question), answerSha256: outcome === "answered" ? sha256(result.answer) : null, workspaceBeforeSha256: before.workspaceSha256, workspaceAfterSha256: after.workspaceSha256, outcome }); }
  catch { status = createHostAdvisorStatus({ candidate: { commit: input.dispatch.candidateCommit, tree: input.dispatch.candidateTree }, launch, questionSha256: sha256(input.question), answerSha256: null, workspaceBeforeSha256: before.workspaceSha256, workspaceAfterSha256: after.workspaceSha256 === before.workspaceSha256 ? `${"0".repeat(63)}1` : after.workspaceSha256, outcome: "failed" }); }
  status = validateHostAdvisorStatus(status, { commit: input.dispatch.candidateCommit, tree: input.dispatch.candidateTree }, launch, sha256(input.question));
  return { advisoryResult: { ok: outcome === "answered", code: outcome, answer: outcome === "answered" ? result.answer : null, receipt: null, attempts: [] }, execution: status };
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
  const adapter = dependencies.makeHostAdapter?.(iterator, args.timeoutMs) ?? makeHostAdapter(iterator, args.timeoutMs);
  try {
    let result;
    let execution = null;
    const advisorExport = input?.advisorExport;
    const advisoryDisabled = advisorExport && typeof advisorExport === "object" && !Array.isArray(advisorExport)
      && Object.keys(advisorExport).length === 1 && advisorExport.consent === "declined";
    if (advisoryDisabled) {
      // An explicit decline is a normal optional state. The
      // Coordinator returns the typed disabled result before any adapter,
      // child, export, or receipt.
      result = await coordinateAdvisory(input, { advisorExport });
    } else if (input.runner === "codex") {
      const outcome = await runCodexAdvisoryWithHostFallback(input, adapter, { repoRoot: process.cwd() });
      result = outcome.advisoryResult;
      execution = outcome.execution;
    } else result = await coordinateAdvisory(input, { invokeNative: adapter, invokeConsult: adapter, advisorExport });
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
      sandboxBinding: null,
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
