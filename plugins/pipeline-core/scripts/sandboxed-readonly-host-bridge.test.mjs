#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { canonicalJson, compatibilityReceiptDigest, loadCompatibilityPolicy } from "../lib/codex-sandbox-compatibility.mjs";
import { buildSandboxRequest, createSandboxSelectionStore, sandboxSelectionDigest, SELECTION_SCHEMA_SHA256 } from "./codex-sandbox-select.mjs";
import { executeSandboxedReadonlyDuty, recoverSandboxJournal, runSandboxedReadonlyHostBridge, showSandboxSelection } from "./sandboxed-readonly-host-bridge.mjs";
import { hardenWindowsPrivateDirectory } from "../lib/windows-private-state.mjs";

// On native Windows a fresh mkdtemp dir inherits SYSTEM/Administrators ACEs, so the
// sandbox store correctly refuses it as insecure. A real caller supplies a hardened
// private root; harden every fixture root to match that contract (no-op on POSIX).
async function hardenedMkdtemp(prefix) {
  const root = await mkdtemp(prefix);
  if (process.platform === "win32") hardenWindowsPrivateDirectory(root);
  return root;
}

const D = "a".repeat(64);
const SELECTION_ID = "css_aaaaaaaaaaaaaaaaaaaaaaaaae";
const sha = (value) => createHash("sha256").update(value).digest("hex");
function makeSelection(overrides = {}) {
  const requestSha256 = buildSandboxRequest({
    repoFingerprint: D, duty: "readiness", queueRevision: 2, candidateCommit: "c".repeat(40), candidateTree: "d".repeat(40),
    referenceSetSha256: "e".repeat(64), runner: "codex", model: "gpt-5.6-sol",
  }).requestSha256;
  const value = {
    schema: "pipeline.codex-sandbox-selection.v1", selectionId: SELECTION_ID, repoFingerprint: D, duty: "readiness",
    dispatch: { queueRevision: 2, candidateCommit: "c".repeat(40), candidateTree: "d".repeat(40), referenceSetSha256: "e".repeat(64), requestSha256 },
    toolchain: { cliVersion: "0.144.6", cliSha256: "0".repeat(64), observedHelperSha256: "1".repeat(64), selectionSchemaSha256: "2".repeat(64) },
    host: { platformClass: "linux-wsl2", kernel: { sysname: "Linux", release: "6", machine: "x86_64" }, filesystemClass: "wsl2-native", bootIdSha256: "3".repeat(64) },
    profile: { id: "codex-critic-intermediate.v1", sha256: "4".repeat(64), base: ":read-only", network: { enabled: true }, writableRootClass: "coordinator-scratch-only", scratchRootSha256: "5".repeat(64) },
    preflight: { receiptSha256: "6".repeat(64), eligibility: "intermediate", terminalCode: "eligible", observedAt: "2026-07-19T00:00:00.000Z" },
    compatibilityReceiptSha256: "7".repeat(64), assurance: { class: "sandbox-read-only-except-coordinator-scratch-network-open", literal: "sandbox-read-only-except-coordinator-scratch; input/network isolation not asserted" },
    status: "selected", failureClass: null, observedAt: "2026-07-19T00:00:00.000Z", ...overrides,
  };
  return value;
}
const selection = Object.freeze(makeSelection());

function completedExecution(selected = selection) {
  return {
    schema: "pipeline.codex-sandbox-execution-receipt.v1", selectionId: selected.selectionId, selectionSha256: sandboxSelectionDigest(selected),
    repoFingerprint: D, duty: "readiness", dispatch: selected.dispatch, requested: { runner: "codex", model: "gpt-5.6-sol" },
    observed: { cliSha256: selected.toolchain.cliSha256, profileSha256: selected.profile.sha256, networkEnabled: true, scratchRootSha256: selected.profile.scratchRootSha256 },
    terminal: { childStarted: true, exitCode: 0, stdioStatus: "complete", cleanupStatus: "complete" }, assurance: selected.assurance,
    dutyReceipt: { schema: "pipeline.readiness-receipt.v1", sha256: "8".repeat(64), status: "reviewed" }, createdAt: "2026-07-19T00:00:00.000Z",
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

test("the bridge reads the exact selection ID, verifies nested readback, and launches only the selected network-open profile", async () => {
  const events = [];
  const result = await runSandboxedReadonlyHostBridge({ selectionId: SELECTION_ID, duty: "readiness", requested: { runner: "codex", model: "gpt-5.6-sol" } }, {
    readSelection: async (id) => { events.push(`show:${id}`); return selection; },
    readback: async () => { events.push("readback"); return selection.profile; },
    resolveScratch: async () => ({ sha256: selection.profile.scratchRootSha256 }),
    resealScratch: async () => {},
    launch: async (input) => { events.push("launch"); return { childStarted: true, input }; },
    finalize: async () => completedExecution(),
  });
  assert.equal(result.selectionId, SELECTION_ID);
  assert.deepEqual(events, [`show:${SELECTION_ID}`, "readback", "launch"]);
  assert.equal(events.some((entry) => entry.startsWith("scan:")), false);
});

test("readback drift or unavailable selection returns a typed no-child result", async () => {
  const unavailable = makeSelection({
    status: "unavailable", failureClass: "host-mode-unavailable", compatibilityReceiptSha256: null,
    profile: { ...selection.profile, scratchRootSha256: null }, preflight: { ...selection.preflight, receiptSha256: null, eligibility: "none", observedAt: null },
    assurance: { class: "no-usable-review", literal: null },
  });
  for (const selected of [selection, unavailable]) {
    let launches = 0;
    const result = await runSandboxedReadonlyHostBridge({ selectionId: SELECTION_ID, duty: "readiness", requested: { runner: "codex", model: "gpt-5.6-sol" } }, {
      readSelection: async () => selected,
      readback: async () => ({ ...selection.profile, network: { enabled: false } }),
      launch: async () => { launches += 1; }, finalize: async () => completedExecution(),
    });
    assert.equal(result.terminal.childStarted, false);
    assert.equal(result.assurance.class, "no-usable-review");
    assert.equal(launches, 0);
  }
});

test("the selected transport rejects absolute, escaping, and duplicate reference paths before lookup or launch", async () => {
  for (const references of [["/private/input"], ["../private/input"], ["spec.md", "spec.md"], ["spec\\input"]]) {
    let lookedUp = 0;
    await assert.rejects(runSandboxedReadonlyHostBridge({ selectionId: SELECTION_ID, duty: "readiness", requested: { runner: "codex", model: "gpt-5.6-sol" }, references }, {
      readSelection: async () => { lookedUp += 1; return selection; },
    }));
    assert.equal(lookedUp, 0);
  }
});

test("an ambiguous launch or finalize exception remains a started cleanup-pending incident", async () => {
  let launchReseals = 0;
  const launchFailure = await runSandboxedReadonlyHostBridge({ selectionId: SELECTION_ID, duty: "readiness", requested: { runner: "codex", model: "gpt-5.6-sol" } }, {
    readSelection: async () => selection, readback: async () => selection.profile,
    resolveScratch: async () => ({ sha256: selection.profile.scratchRootSha256 }),
    resealScratch: async () => { launchReseals += 1; },
    launch: async () => { throw new Error("launch failed"); }, finalize: async () => completedExecution(),
  });
  assert.equal(launchFailure.terminal.childStarted, true);
  assert.equal(launchFailure.terminal.stdioStatus, "lost");
  assert.equal(launchFailure.dutyReceipt.status, "error");
  assert.equal(launchReseals, 1);

  const malformedLaunch = await runSandboxedReadonlyHostBridge({ selectionId: SELECTION_ID, duty: "readiness", requested: { runner: "codex", model: "gpt-5.6-sol" } }, {
    readSelection: async () => selection, readback: async () => selection.profile,
    resolveScratch: async () => ({ sha256: selection.profile.scratchRootSha256 }), resealScratch: async () => {},
    launch: async () => ({}), finalize: async () => completedExecution(),
  });
  assert.equal(malformedLaunch.terminal.childStarted, true);
  assert.equal(malformedLaunch.dutyReceipt.status, "error");

  const finalizeFailure = await runSandboxedReadonlyHostBridge({ selectionId: SELECTION_ID, duty: "readiness", requested: { runner: "codex", model: "gpt-5.6-sol" } }, {
    readSelection: async () => selection, readback: async () => selection.profile,
    resolveScratch: async () => ({ sha256: selection.profile.scratchRootSha256 }),
    resealScratch: async () => {},
    launch: async () => ({ childStarted: true }), finalize: async () => { throw new Error("finalize failed"); },
  });
  assert.equal(finalizeFailure.terminal.childStarted, true);
  assert.equal(finalizeFailure.terminal.stdioStatus, "lost");
  assert.equal(finalizeFailure.terminal.cleanupStatus, "pending");
  assert.equal(finalizeFailure.dutyReceipt.status, "error");
});

test("a selected transport without a lifecycle reseal hook cannot launch", async () => {
  let launches = 0;
  const result = await runSandboxedReadonlyHostBridge({ selectionId: SELECTION_ID, duty: "readiness", requested: { runner: "codex", model: "gpt-5.6-sol" } }, {
    readSelection: async () => selection, readback: async () => selection.profile,
    resolveScratch: async () => ({ sha256: selection.profile.scratchRootSha256 }),
    launch: async () => { launches += 1; return { childStarted: true }; }, finalize: async () => completedExecution(),
  });
  assert.equal(result.terminal.childStarted, false);
  assert.equal(launches, 0);
});

test("a successful child is resealed after finalization, including when a wrapper supplies finalize", async () => {
  let resealed = 0;
  const result = await runSandboxedReadonlyHostBridge({ selectionId: SELECTION_ID, duty: "readiness", requested: { runner: "codex", model: "gpt-5.6-sol" } }, {
    readSelection: async () => selection, readback: async () => selection.profile,
    resolveScratch: async () => ({ sha256: selection.profile.scratchRootSha256 }),
    launch: async () => ({ childStarted: true }), finalize: async () => completedExecution(),
    resealScratch: async () => { resealed += 1; },
  });
  assert.equal(result.terminal.childStarted, true);
  assert.equal(resealed, 1);
});

test("generic production composition persists the selector record, ignores caller selection authority, then journals execution and duty binding", async () => {
  const root = await hardenedMkdtemp(join(tmpdir(), "hawkeye-generic-"));
  try {
    const receiptSession = { sessionId: "session-hawkeye", descriptorSha256: "9".repeat(64) };
    let closure = { status: "active", closedAt: null };
    const store = createSandboxSelectionStore({
      root,
      now: () => "2026-07-19T00:00:00.000Z",
      receiptSession,
      sessionClosure: () => closure,
    });
    let launches = 0;
    const result = await executeSandboxedReadonlyDuty({
      duty: "readiness", repoFingerprint: D,
      dispatch: { queueRevision: 2, candidateCommit: "c".repeat(40), candidateTree: "d".repeat(40), referenceSetSha256: "e".repeat(64) },
      requested: { runner: "codex", model: "gpt-5.6-sol" }, references: ["spec.md"],
    }, {
      selection: {
        now: () => 1_784_563_200_000, observeHost: async () => currentHostEvidence(),
        runPreflight: async () => ({ eligibility: "intermediate", terminalCode: "eligible", receiptSha256: "6".repeat(64) }),
        createCoordinatorScratch: async () => ({ sha256: "7".repeat(64) }),
        readbackProfile: async ({ profile }) => profile,
      },
      store,
      bridge: {
        // This deliberately must not be reached: generic composition reads only
        // the durable exact-ID store it just populated.
        showSelection: async () => { throw new Error("caller selection authority must not be used"); },
        readback: async ({ profile }) => profile,
        resolveScratch: async ({ profile }) => ({ sha256: profile.scratchRootSha256 }),
        resealScratch: async () => {},
        launch: async ({ references }) => { launches += 1; assert.deepEqual(references, ["spec.md"]); return { childStarted: true }; },
        finalize: async ({ selection: selected }) => completedExecution(selected),
      },
    });
    assert.equal(launches, 1);
    assert.equal(result.status, "reviewed");
    assert.equal(store.readJournal(result.selectionId).phase, "duty-bound");
    const badTerminal = completedExecution(store.readSelection(result.selectionId));
    badTerminal.terminal = { ...badTerminal.terminal, exitCode: 1 };
    assert.throws(() => store.writeExecution({ selection: store.readSelection(result.selectionId), execution: badTerminal }), /cannot advance to execution/);
    assert.deepEqual(store.readReceiptSession(receiptSession.sessionId).selectionIds, [result.selectionId]);
    assert.throws(() => store.prune({ sessionId: receiptSession.sessionId, selectionId: result.selectionId }), /active session/);
    closure = { status: "closed", closedAt: "2026-06-18T00:00:00.000Z" };
    assert.deepEqual(store.prune({ sessionId: receiptSession.sessionId, selectionId: result.selectionId }), {
      status: "pruned", sessionId: receiptSession.sessionId, selectionId: result.selectionId,
    });
    assert.throws(() => store.readSelection(result.selectionId));
    assert.throws(() => store.readReceiptSession(receiptSession.sessionId));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("concurrent exact replays share one selection and one started child", async () => {
  const root = await hardenedMkdtemp(join(tmpdir(), "hawkeye-replay-"));
  try {
    const store = createSandboxSelectionStore({ root, now: () => "2026-07-19T00:00:00.000Z" });
    let launches = 0;
    const request = {
      duty: "readiness", repoFingerprint: D,
      dispatch: { queueRevision: 2, candidateCommit: "c".repeat(40), candidateTree: "d".repeat(40), referenceSetSha256: "e".repeat(64) },
      requested: { runner: "codex", model: "gpt-5.6-sol" }, references: ["spec.md"],
    };
    const dependencies = {
      selection: {
        now: () => 1_784_563_200_000, observeHost: async () => currentHostEvidence(),
        runPreflight: async () => ({ eligibility: "intermediate", terminalCode: "eligible", receiptSha256: "6".repeat(64) }),
        createCoordinatorScratch: async () => ({ sha256: "7".repeat(64) }), readbackProfile: async ({ profile }) => profile,
      },
      store,
      bridge: {
        readback: async ({ profile }) => profile, resolveScratch: async ({ profile }) => ({ sha256: profile.scratchRootSha256 }), resealScratch: async () => {},
        launch: async () => { launches += 1; return { childStarted: true }; },
        finalize: async ({ selection: selected }) => completedExecution(selected),
      },
    };
    const [first, replay] = await Promise.all([executeSandboxedReadonlyDuty(request, dependencies), executeSandboxedReadonlyDuty(request, dependencies)]);
    assert.equal(launches, 1);
    assert.equal(first.selectionId, replay.selectionId);
    assert.equal(first.status, "reviewed");
    assert.equal(replay.status, "reviewed");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("journal recovery and retention are exact-ID only and reject third states", async () => {
  const root = await hardenedMkdtemp(join(tmpdir(), "hawkeye-journal-"));
  try {
    const receiptSession = { sessionId: "session-recovery", descriptorSha256: "9".repeat(64) };
    const store = createSandboxSelectionStore({ root, now: () => "2026-07-19T00:00:00.000Z", receiptSession });
    const projection = {
      schema: "pipeline.codex-sandbox-compatibility-receipt.v1", policySha256: "9".repeat(64), entryId: "fixture", runnerId: "codex",
      primaryLaneId: "primary", fallbackLaneId: "fallback", state: "intermediate-preflight-eligible", bootId: "fixture", observedAtMs: 1,
      evidence: { preflightSha256: "8".repeat(64), runnerReceiptSha256: null, shadowReceiptSha256: null }, activationReceiptSha256: null, routePostimageSha256: null,
    };
    const selected = makeSelection({ compatibilityReceiptSha256: compatibilityReceiptDigest(projection) });
    await store.writeSelection(selected, projection);
    store.writeExecution({ selection: selected, execution: completedExecution(selected) });
    const executed = store.readJournal(SELECTION_ID);
    assert.equal(executed.phase, "executed");
    const recovered = await recoverSandboxJournal(executed, { store });
    assert.equal(recovered.phase, "duty-bound");
    assert.deepEqual(store.readReceiptSession(receiptSession.sessionId).selectionIds, [SELECTION_ID]);
    await assert.rejects(recoverSandboxJournal({ ...executed, phase: "unknown" }, { store }));
  } finally { await rm(root, { recursive: true, force: true }); }
  await assert.rejects(showSandboxSelection({ selectionId: SELECTION_ID, retention: { active: true } }));
  await assert.rejects(showSandboxSelection({ selectionId: SELECTION_ID, retention: { active: false, sessionBound: false } }));
});

test("an error duty receipt is retained as execution evidence but can never become a usable bound review", async () => {
  const root = await hardenedMkdtemp(join(tmpdir(), "hawkeye-error-receipt-"));
  try {
    const store = createSandboxSelectionStore({ root, now: () => "2026-07-19T00:00:00.000Z" });
    const result = await executeSandboxedReadonlyDuty({
      duty: "readiness", repoFingerprint: D,
      dispatch: { queueRevision: 2, candidateCommit: "c".repeat(40), candidateTree: "d".repeat(40), referenceSetSha256: "e".repeat(64) },
      requested: { runner: "codex", model: "gpt-5.6-sol" }, references: ["spec.md"],
    }, {
      selection: {
        now: () => 1_784_563_200_000, observeHost: async () => currentHostEvidence(),
        runPreflight: async () => ({ eligibility: "intermediate", terminalCode: "eligible", receiptSha256: "6".repeat(64) }),
        createCoordinatorScratch: async () => ({ sha256: "7".repeat(64) }),
        readbackProfile: async ({ profile }) => profile,
      },
      store,
      bridge: {
        readback: async ({ profile }) => profile,
        resolveScratch: async ({ profile }) => ({ sha256: profile.scratchRootSha256 }),
        resealScratch: async () => {},
        launch: async () => ({ childStarted: true }),
        finalize: async ({ selection: selected }) => ({
          ...completedExecution(selected),
          terminal: { childStarted: true, exitCode: null, stdioStatus: "lost", cleanupStatus: "pending" },
          dutyReceipt: { schema: "pipeline.readiness-receipt.v1", sha256: "8".repeat(64), status: "error" },
        }),
      },
    });
    assert.equal(result.status, "error");
    assert.equal(store.readJournal(result.selectionId).phase, "executed");
    assert.deepEqual(store.readExecution(result.selectionId).terminal, { childStarted: true, exitCode: null, stdioStatus: "lost", cleanupStatus: "pending" });
    assert.throws(() => store.bindDuty({
      selection: store.readSelection(result.selectionId), execution: store.readExecution(result.selectionId),
    }), /not a usable duty result/);
    assert.equal((await recoverSandboxJournal(store.readJournal(result.selectionId), { store })).phase, "executed");
  } finally { await rm(root, { recursive: true, force: true }); }
});
