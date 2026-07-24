#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runAdvisoryHostBridge, runCodexAdvisoryThroughSelectedSandbox } from "./advisory-host-bridge.mjs";
import { buildSandboxRequest, sandboxSelectionDigest } from "./codex-sandbox-select.mjs";

const dispatch = { dispatchId: "bridge-test", queueRevision: 1, candidateCommit: "a".repeat(40), candidateTree: "b".repeat(40) };
const base = () => ({ profile: "epic", runner: "codex", question: "Which boundary is safest?", dispatch, advisorExport: { consent: "approved" }, sandboxContext: { repoFingerprint: "c".repeat(64), referenceSetSha256: "d".repeat(64) } });
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function selectedAdvisory() {
  const requestSha256 = buildSandboxRequest({
    repoFingerprint: "c".repeat(64), duty: "advisory", queueRevision: 1, candidateCommit: "a".repeat(40), candidateTree: "b".repeat(40),
    referenceSetSha256: "d".repeat(64), runner: "codex", model: "gpt-5.6-sol",
  }).requestSha256;
  return {
    schema: "pipeline.codex-sandbox-selection.v1", selectionId: "css_aaaaaaaaaaaaaaaaaaaaaaaaae", repoFingerprint: "c".repeat(64), duty: "advisory",
    dispatch: { queueRevision: 1, candidateCommit: "a".repeat(40), candidateTree: "b".repeat(40), referenceSetSha256: "d".repeat(64), requestSha256 },
    toolchain: { cliVersion: "0.144.6", cliSha256: "0".repeat(64), observedHelperSha256: "1".repeat(64), selectionSchemaSha256: "2".repeat(64) },
    host: { platformClass: "linux-wsl2", kernel: { sysname: "Linux", release: "6", machine: "x86_64" }, filesystemClass: "wsl2-native", bootIdSha256: "3".repeat(64) },
    profile: { id: "codex-critic-intermediate.v1", sha256: "4".repeat(64), base: ":read-only", network: { enabled: true }, writableRootClass: "coordinator-scratch-only", scratchRootSha256: "5".repeat(64) },
    preflight: { receiptSha256: "6".repeat(64), eligibility: "intermediate", terminalCode: "eligible", observedAt: "2026-07-19T00:00:00.000Z" },
    compatibilityReceiptSha256: "7".repeat(64), assurance: { class: "sandbox-read-only-except-coordinator-scratch-network-open", literal: "sandbox-read-only-except-coordinator-scratch; input/network isolation not asserted" },
    status: "selected", failureClass: null, observedAt: "2026-07-19T00:00:00.000Z",
  };
}

function selectedTransport() {
  return {
    dependencies: {
      async executeSandboxedReadonlyDuty(request, dependencies) {
        const selection = selectedAdvisory();
        const launched = await dependencies.bridge.launch({
          selectionId: selection.selectionId, duty: "advisory", selection, requested: request.requested, references: [], profile: selection.profile,
          scratch: { path: "/tmp/advisory-scratch", sha256: selection.profile.scratchRootSha256, sandboxStateJson: "{}", sandboxStateSha256: "8".repeat(64), repoRoot: "/repo", codexPath: "/codex" },
        });
        const execution = await dependencies.bridge.finalize({ selection, launched, requested: request.requested, profile: selection.profile });
        return {
          status: "answered", childStarted: true, selectionId: selection.selectionId, selectionSha256: sandboxSelectionDigest(selection),
          executionReceiptSha256: sha256(JSON.stringify(execution)), dutyReceiptSha256: execution.dutyReceipt.sha256, assurance: selection.assurance,
        };
      },
    },
    async invokeCodexAdvisoryAppServer({ sandboxTransport }) {
      return {
        status: "answered", answer: "Use the selected transport.", identity: { provider: "openai", modelId: "gpt-5.6-sol", effort: "max" },
        sandboxExecution: {
          schema: "pipeline.codex-sandbox-host-execution.v1", selectionId: sandboxTransport.selectionId, selectionSha256: sandboxTransport.selectionSha256,
          repoFingerprint: sandboxTransport.repoFingerprint, duty: "advisory", dispatch: sandboxTransport.dispatch,
          observed: { cliSha256: sandboxTransport.toolchain.cliSha256, profileSha256: sandboxTransport.profile.sha256, networkEnabled: true, scratchRootSha256: sandboxTransport.profile.scratchRootSha256 },
          terminal: { childStarted: true, exitCode: 0, stdioStatus: "complete", cleanupStatus: "complete" },
        },
      };
    },
  };
}

test("an unbound direct host adapter never starts a Codex advisory or claims an answer", async () => {
  let calls = 0; let payload;
  const result = await runCodexAdvisoryThroughSelectedSandbox(base(), async (value) => { calls += 1; payload = value; return { status: "answered", answer: "Keep it closed." }; }, { repoRoot: process.cwd(), observeWorkspace: () => ({ workspaceSha256: "9".repeat(64) }) });
  assert.equal(calls, 0); assert.equal(payload, undefined);
  assert.equal(result.advisoryResult.ok, false); assert.equal(result.advisoryResult.code, "selected-sandbox-required"); assert.equal(result.execution, null);
  assert.equal(result.advisoryResult.receipt.schema, "pipeline.advisory-receipt.v1");
});

test("workspace observation failure remains typed no-child evidence", async () => {
  let n = 0;
  const result = await runCodexAdvisoryThroughSelectedSandbox(base(), async () => ({ status: "answered", answer: "must be discarded" }), {
    repoRoot: process.cwd(),
    observeWorkspace: () => { n += 1; return { workspaceSha256: n === 1 ? "1".repeat(64) : "2".repeat(64) }; },
  });
  assert.equal(result.advisoryResult.ok, false); assert.equal(result.advisoryResult.answer, null); assert.equal(result.execution, null);
  assert.equal(result.advisoryResult.receipt.observed.status, "unavailable");
});

test("an adapter response cannot alter the typed no-child result", async () => {
  for (const response of [{ status: "unavailable" }, { status: "answered" }, null]) {
    let calls = 0;
    const result = await runCodexAdvisoryThroughSelectedSandbox(base(), async () => { calls += 1; return response; }, { repoRoot: process.cwd(), observeWorkspace: () => ({ workspaceSha256: "9".repeat(64) }) });
    assert.equal(calls, 0); assert.equal(result.advisoryResult.ok, false); assert.equal(result.advisoryResult.code, "selected-sandbox-required");
    assert.equal(result.execution, null);
  }
});

test("route authority disables mini and declined input before any child and rejects malformed consent", async () => {
  for (const input of [{ ...base(), profile: "mini" }, { ...base(), advisorExport: { consent: "declined" } }]) {
    let calls = 0;
    const result = await runCodexAdvisoryThroughSelectedSandbox(input, async () => { calls += 1; return { status: "answered", answer: "must not run" }; }, { repoRoot: process.cwd() });
    assert.equal(calls, 0); assert.equal(result.advisoryResult.ok, false); assert.equal(result.execution, null);
  }
  let calls = 0;
  await assert.rejects(runCodexAdvisoryThroughSelectedSandbox({ ...base(), advisorExport: { consent: "approved", extra: true } }, async () => { calls += 1; }, { repoRoot: process.cwd() }), { code: "invalid-route-input" });
  assert.equal(calls, 0);
});

test("production bridge persists typed no-child receipt without accepting a raw answer", async () => {
  const root = await mkdtemp(join(tmpdir(), "host-advisor-")); const inputPath = join(root, "input.json"); const receiptPath = join(root, "status.json");
  try {
    await writeFile(inputPath, JSON.stringify({ ...base(), sandboxRuntime: { sessionCleanup: { sessionId: "session-test" } } }));
    const code = await runAdvisoryHostBridge(["--input", inputPath, "--receipt", receiptPath], { makeHostAdapter: () => async () => ({ status: "answered", answer: "private answer" }) });
    assert.equal(code, 2); await assert.rejects(readFile(inputPath));
    const status = JSON.parse(await readFile(receiptPath, "utf8")); assert.equal(status.schema, "pipeline.advisory-receipt.v1"); assert.equal(status.observed.status, "unavailable"); assert.equal(JSON.stringify(status).includes("private answer"), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("only a selected child with matching selection, identity, and durable receipt returns advisory content", async () => {
  let adapterCalls = 0;
  const transport = { repoRoot: process.cwd(), observeWorkspace: () => ({ workspaceSha256: "9".repeat(64) }), ...selectedTransport() };
  const result = await runCodexAdvisoryThroughSelectedSandbox(base(), async () => { adapterCalls += 1; return { status: "answered", answer: "unbound" }; }, transport);
  assert.equal(adapterCalls, 0);
  assert.equal(result.advisoryResult.ok, true, JSON.stringify(result));
  assert.equal(result.advisoryResult.answer, "Use the selected transport.");
  assert.equal(result.advisoryResult.receipt.observed.identity.modelId, "gpt-5.6-sol");
  assert.equal(result.execution.dutyReceipt.status, "answered");
  assert.equal(result.sandboxBinding.selectionId, result.execution.selectionId);
  assert.equal(result.sandboxBinding.dutyReceiptSha256, result.execution.dutyReceipt.sha256);
});

test("a selected child with the wrong model identity fails closed without returning its answer", async () => {
  const transport = selectedTransport();
  transport.invokeCodexAdvisoryAppServer = async ({ sandboxTransport }) => ({
    status: "answered", answer: "must be discarded", identity: { provider: "openai", modelId: "gpt-5.6-terra", effort: "max" },
    sandboxExecution: {
      schema: "pipeline.codex-sandbox-host-execution.v1", selectionId: sandboxTransport.selectionId, selectionSha256: sandboxTransport.selectionSha256,
      repoFingerprint: sandboxTransport.repoFingerprint, duty: "advisory", dispatch: sandboxTransport.dispatch,
      observed: { cliSha256: sandboxTransport.toolchain.cliSha256, profileSha256: sandboxTransport.profile.sha256, networkEnabled: true, scratchRootSha256: sandboxTransport.profile.scratchRootSha256 },
      terminal: { childStarted: true, exitCode: 0, stdioStatus: "complete", cleanupStatus: "complete" },
    },
  });
  const result = await runCodexAdvisoryThroughSelectedSandbox(base(), async () => ({ status: "answered", answer: "unbound" }), {
    repoRoot: process.cwd(), observeWorkspace: () => ({ workspaceSha256: "9".repeat(64) }), ...transport,
  });
  assert.equal(result.advisoryResult.ok, false);
  assert.equal(result.advisoryResult.answer, null);
  assert.equal(result.advisoryResult.code, "selected-sandbox-required");
});
