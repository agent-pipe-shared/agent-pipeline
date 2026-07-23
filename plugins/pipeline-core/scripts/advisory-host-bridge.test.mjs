#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { canonicalJson, loadCompatibilityPolicy } from "../lib/codex-sandbox-compatibility.mjs";
import { createSandboxSelectionStore, SELECTION_SCHEMA_SHA256 } from "./codex-sandbox-select.mjs";
import { hardenWindowsPrivateDirectory } from "../lib/windows-private-state.mjs";
import { runAdvisoryHostBridge, runCodexAdvisoryThroughSelectedSandbox, runCodexAdvisoryWithHostFallback } from "./advisory-host-bridge.mjs";

const SCRIPT = new URL("./advisory-host-bridge.mjs", import.meta.url);
const DISPATCH = { dispatchId: "bridge-test-01", queueRevision: 1, candidateCommit: "a".repeat(40), candidateTree: "b".repeat(40) };
const sha = (value) => createHash("sha256").update(value).digest("hex");
function input(question = "Which cutover boundary is safest?") {
  return { profile: "epic", runner: "codex", question, dispatch: DISPATCH, advisorExport: { consent: "approved" }, sandboxContext: { repoFingerprint: "c".repeat(64), referenceSetSha256: "d".repeat(64) } };
}
function answeredAdapter(answer, modelId = "gpt-5.6-sol") {
  return async (payload) => {
    const selected = payload.sandboxTransport;
    return {
      status: "answered", answer, identity: { provider: "openai", modelId, effort: "max" },
      sandboxExecution: {
        schema: "pipeline.codex-sandbox-host-execution.v1", selectionId: selected.selectionId, selectionSha256: selected.selectionSha256,
        repoFingerprint: selected.repoFingerprint, duty: "advisory", dispatch: selected.dispatch,
        observed: { cliSha256: selected.toolchain.cliSha256, profileSha256: selected.profile.sha256, networkEnabled: true, scratchRootSha256: selected.profile.scratchRootSha256 },
        terminal: { childStarted: true, exitCode: 0, stdioStatus: "complete", cleanupStatus: "complete" },
      },
    };
  };
}
function currentHostEvidence() {
  const { value: policy } = loadCompatibilityPolicy();
  const entry = policy.entries.find((candidate) => candidate.filesystemClass === "wsl-native");
  const receipt = {
    schema: "pipeline.codex-sandbox-preflight.v1", cli: { version: entry.cliVersion, artifactSha256: entry.releasedArtifactSha256 },
    sandboxTransport: { selection: "codex-cli-owned" }, observedHelper: { role: "diagnostic-only", artifactSha256: "1".repeat(64) }, platform: { os: "linux", kernelClass: entry.kernelClass, filesystemClass: entry.filesystemClass },
    profile: { id: entry.permissionProfileId, rawSha256: entry.permissionProfileSha256, compiledStateSha256: "2".repeat(64) }, networkEnabled: true,
    vectors: { allowedRead: true, externalReadDenied: true, sensitiveReadDenied: true, writeDenied: true, scratchWriteAllowed: true, networkDenied: false, childStdioEquivalent: true, stdinEofEquivalent: true, childExitEquivalent: true, appServerInitEquivalent: true, lifecycleComplete: true },
    canaries: { count: 1, manifestSha256: "3".repeat(64), unchanged: true }, eventChainSha256: "4".repeat(64), durationMs: 1, eligibility: "intermediate", terminalCode: "ok",
  };
  return {
    cliVersion: entry.cliVersion, cliSha256: entry.releasedArtifactSha256, observedHelperSha256: "1".repeat(64), selectionSchemaSha256: SELECTION_SCHEMA_SHA256,
    platformClass: "linux-wsl2", kernel: { sysname: "Linux", release: "6", machine: "x86_64" }, filesystemClass: "wsl2-native", bootIdSha256: sha("boot"),
    compatibilityObservation: {
      runnerId: "codex", cliVersion: entry.cliVersion, releasedArtifactSha256: entry.releasedArtifactSha256, kernelClass: entry.kernelClass, filesystemClass: entry.filesystemClass,
      permissionProfileId: entry.permissionProfileId, permissionProfileSha256: entry.permissionProfileSha256, bootId: "boot", nowMs: 1_784_563_200_000,
      preflight: { bootId: "boot", observedAtMs: 1_784_563_200_000, rawSha256: sha(Buffer.from(canonicalJson(receipt))), schemaSha256: entry.preflightSchemaSha256, receipt }, runner: null, shadow: null, activation: null, routePostimageSha256: null,
    },
  };
}
// On native Windows a fresh mkdtemp dir inherits SYSTEM/Administrators ACEs, so a
// receipt/private write into it is correctly refused as insecure. A real caller
// supplies a hardened private root; harden every fixture root to match that
// contract (no-op on POSIX).
async function hardenedMkdtemp(prefix) {
  const root = await mkdtemp(prefix);
  if (process.platform === "win32") hardenWindowsPrivateDirectory(root);
  return root;
}
async function selectedTransport() {
  const root = await hardenedMkdtemp(join(tmpdir(), "hawkeye-advisory-"));
  return {
    root,
    store: createSandboxSelectionStore({ root, now: () => "2026-07-19T00:00:00.000Z" }),
    selection: {
      now: () => 1_784_563_200_000, observeHost: async () => currentHostEvidence(),
      runPreflight: async () => ({ eligibility: "intermediate", terminalCode: "eligible", receiptSha256: "6".repeat(64) }),
      createCoordinatorScratch: async () => ({ sha256: "7".repeat(64) }),
      readbackProfile: async ({ profile }) => profile,
    },
    bridge: {
      readback: async ({ profile }) => profile,
      resolveScratch: async ({ profile }) => ({ sha256: profile.scratchRootSha256 }),
      resealScratch: async () => {},
    },
  };
}

test("the advisory host bridge delegates affected Codex launches to the selected generic transport", async () => {
  const source = await readFile(SCRIPT, "utf8");
  assert.equal(source.includes("sandboxed-readonly-host-bridge.mjs"), true);
  assert.equal(source.includes("createCodexSandboxRuntimeTransport(input)"), true);
  assert.equal(source.includes("runCodexAdvisoryThroughSelectedSandbox"), true);
  assert.equal(source.includes("sandboxBinding"), true);
  assert.equal(source.includes("executionReceiptSha256"), true);
  assert.equal(source.includes("danger-full-access"), false);
});

test("Codex advisory reads a persisted selected transport before the adapter and binds its sanitized receipt into the duty journal", async () => {
  const question = input().question;
  const answer = "Keep the V3 boundary fail-closed.";
  const transport = await selectedTransport();
  let sandboxTransport = null;
  let consultPayload = null;
  try {
    const result = await runCodexAdvisoryThroughSelectedSandbox(input(question), async (payload) => {
      consultPayload = payload;
      sandboxTransport = payload.sandboxTransport;
      return answeredAdapter(answer)(payload);
    }, transport);
    assert.equal(result.advisoryResult.ok, true);
    assert.equal(result.advisoryResult.answer, answer);
    assert.equal(result.execution.childStarted, true);
    assert.equal(transport.store.readJournal(result.execution.selectionId).phase, "duty-bound");
    assert.equal(result.execution.dutyReceiptSha256, sha(Buffer.from(`${JSON.stringify(result.advisoryResult.receipt, null, 2)}\n`)));
    assert.deepEqual(sandboxTransport.dispatch, {
      queueRevision: DISPATCH.queueRevision,
      candidateCommit: DISPATCH.candidateCommit,
      candidateTree: DISPATCH.candidateTree,
      referenceSetSha256: input().sandboxContext.referenceSetSha256,
      requestSha256: sandboxTransport.dispatch.requestSha256,
    });
    assert.deepEqual(sandboxTransport.requested, { runner: "codex", model: "gpt-5.6-sol" });
    assert.equal(consultPayload.role, "consult-advisor");
    assert.equal(consultPayload.subagentType, "consult-advisor");
    assert.equal(consultPayload.runner, "codex");
    assert.equal(consultPayload.model, "gpt-5.6-sol");
    assert.equal(consultPayload.effort, "max");
    assert.deepEqual(consultPayload.dispatch, DISPATCH);
    assert.equal(consultPayload.oneQuestion, true);
    assert.equal(consultPayload.freshContext, true);
    assert.equal(consultPayload.contextPolicy, "fresh-no-handover-no-chat-history-no-implementor-rationale");
    assert.deepEqual(consultPayload.tools, ["Read", "Grep", "Glob", "Bash"]);
    assert.equal(consultPayload.memory, false);
    assert.equal(consultPayload.autoApply, false);
    const persisted = JSON.stringify(result.advisoryResult.receipt);
    assert.equal(persisted.includes(question), false);
    assert.equal(persisted.includes(answer), false);
  } finally { await rm(transport.root, { recursive: true, force: true }); }
});

test("the production Codex host path consumes raw transport before its receipt-backed host-consult fallback failure", async () => {
  const root = await hardenedMkdtemp(join(tmpdir(), "hawkeye-advisory-raw-"));
  const inputPath = join(root, "input.json");
  const receiptPath = join(root, "receipt.json");
  const question = "repository-private question that must not persist";
  try {
    await writeFile(inputPath, JSON.stringify({
      profile: "epic", runner: "codex", question, dispatch: DISPATCH, advisorExport: { consent: "approved" },
      sandboxContext: { repoFingerprint: "c".repeat(64), referenceSetSha256: "d".repeat(64) },
    }));
    assert.equal(await runAdvisoryHostBridge(["--input", inputPath, "--receipt", receiptPath], {
      makeHostAdapter: () => async () => ({ status: "unavailable" }),
    }), 2);
    await assert.rejects(readFile(inputPath));
    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    assert.equal(receipt.observed.status, "unavailable");
    assert.equal(JSON.stringify(receipt).includes(question), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("production Codex path invokes the native App-Server adapter without a host adapter request", async () => {
  const root = await hardenedMkdtemp(join(tmpdir(), "hawkeye-advisory-native-"));
  const inputPath = join(root, "input.json");
  const receiptPath = join(root, "receipt.json");
  const transport = await selectedTransport();
  let hostAdapterCalls = 0;
  let nativeCalls = 0;
  try {
    await writeFile(inputPath, JSON.stringify(input("Native route?")));
    const code = await runAdvisoryHostBridge(["--input", inputPath, "--receipt", receiptPath], {
      createCodexSandboxRuntimeTransport: () => transport,
      makeHostAdapter: () => async () => { hostAdapterCalls += 1; return { status: "unavailable" }; },
      invokeCodexAdvisoryAppServer: async (payload) => { nativeCalls += 1; return answeredAdapter("Native answer.")(payload); },
    });
    assert.equal(code, 0);
    assert.equal(nativeCalls, 1);
    assert.equal(hostAdapterCalls, 0);
    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    assert.equal(receipt.observed.identity.provider, "openai");
    assert.equal(receipt.observed.identity.modelId, "gpt-5.6-sol");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(transport.root, { recursive: true, force: true });
  }
});

test("selected transport discovery failure cannot fall back to an unbound host consult", async () => {
  const root = await hardenedMkdtemp(join(tmpdir(), "hawkeye-advisory-fallback-"));
  const inputPath = join(root, "input.json");
  const receiptPath = join(root, "receipt.json");
  let payload = null;
  try {
    await writeFile(inputPath, JSON.stringify({
      profile: "epic", runner: "codex", question: "Can the substitute advisor answer?", dispatch: DISPATCH, advisorExport: { consent: "approved" },
      sandboxContext: { repoFingerprint: "c".repeat(64), referenceSetSha256: "d".repeat(64) },
    }));
    const code = await runAdvisoryHostBridge(["--input", inputPath, "--receipt", receiptPath], {
      createCodexSandboxRuntimeTransport: () => { throw Object.assign(new Error("selected transport unavailable"), { code: "EUNAVAILABLE" }); },
      makeHostAdapter: () => async (candidate) => {
        payload = candidate;
        return {
          status: "answered",
          answer: "Yes, through the registered fresh Sol consult.",
          identity: { provider: "openai", modelId: "gpt-5.6-sol", effort: "max" },
        };
      },
    });
    assert.equal(code, 2);
    assert.equal(payload, null);
    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    assert.notEqual(receipt.observed.status, "answered");
    assert.equal(receipt.observed.identity, null);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("wrong same-provider model fails closed through the selected production path", async () => {
  const transport = await selectedTransport();
  try {
    const result = await runCodexAdvisoryThroughSelectedSandbox(input("Route?"), answeredAdapter("drift", "gpt-5.6-terra"), transport);
    assert.equal(result.advisoryResult.ok, false);
    assert.equal(result.advisoryResult.code, "adapter_protocol");
    assert.equal(result.execution.status, "error");
    assert.equal(transport.store.readJournal(result.execution.selectionId).phase, "executed");
  } finally { await rm(transport.root, { recursive: true, force: true }); }
});

test("an adapter result without selected-child execution evidence cannot manufacture or trigger a duplicate Codex advisory", async () => {
  const transport = await selectedTransport();
  let calls = 0;
  try {
    const result = await runCodexAdvisoryWithHostFallback(input("Proof?"), async () => {
      calls += 1;
      return { status: "answered", answer: "unbound", identity: { provider: "openai", modelId: "gpt-5.6-sol", effort: "max" } };
    }, transport);
    assert.equal(result.advisoryResult.ok, false);
    assert.equal(result.advisoryResult.code, "sandbox_execution_unattested");
    assert.equal(result.execution, null);
    assert.equal(calls, 1);
  } finally { await rm(transport.root, { recursive: true, force: true }); }
});

test("a selected-sandbox no-child remains non-success without an unbound host consult", async () => {
  const transport = await selectedTransport();
  transport.selection.observeHost = async () => { throw Object.assign(new Error("host mode unavailable"), { code: "EUNAVAILABLE" }); };
  let payload = null;
  try {
    const result = await runCodexAdvisoryWithHostFallback(input("Fallback question?"), async (candidate) => {
      payload = candidate;
      return {
        status: "answered",
        answer: "The fallback remains a fresh Sol consult.",
        identity: { provider: "openai", modelId: "gpt-5.6-sol", effort: "max" },
      };
    }, transport);
    assert.equal(result.advisoryResult.ok, false);
    assert.equal(result.advisoryResult.code, "sandbox_selection_unavailable");
    assert.equal(result.fallbackTransport, undefined);
    assert.equal(result.execution, null);
    assert.equal(payload, null);
  } finally { await rm(transport.root, { recursive: true, force: true }); }
});
