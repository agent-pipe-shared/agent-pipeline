#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Generic exact-selection transport for Codex read-only duties. */
import { createHash } from "node:crypto";

import { canonicalJson } from "../lib/codex-sandbox-compatibility.mjs";
import { NO_USABLE_REVIEW_ASSURANCE, bindSandboxedReadonlyDuty, buildSandboxedReadonlyRequest, validateSandboxedExecutionReceipt } from "../lib/sandboxed-readonly-duty.mjs";
import { sandboxSelectionDigest, selectCodexSandbox, validateSandboxJournal, validateSandboxSelection } from "./codex-sandbox-select.mjs";

const DUTIES = new Set(["advisory", "readiness", "critic"]);
const ID = /^css_[a-z2-7]{25}[aeimquy4]$/;

function fail(message) { throw new Error(message); }
function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(`${label} is not closed`);
}
function equal(left, right) { return canonicalJson(left) === canonicalJson(right); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function dutyReceiptSchema(duty) { return duty === "advisory" ? "pipeline.advisory-receipt.v1" : `pipeline.${duty}-receipt.v1`; }
function usableDutyStatus(duty) { return duty === "advisory" ? "answered" : "reviewed"; }
function requestedRoute(value) {
  exactKeys(value, ["runner", "model"], "requested route");
  if (value.runner !== "codex" || typeof value.model !== "string" || value.model.length === 0) fail("requested route is invalid");
  return value;
}
function refsOnly(values) {
  if (!Array.isArray(values)) fail("bridge references are invalid");
  const normalized = values.map((value) => {
    if (typeof value !== "string" || value.length === 0 || value !== value.trim() || value.includes("\\") || value.startsWith("/")) {
      fail("bridge reference is invalid");
    }
    const parts = value.split("/");
    if (parts.some((part) => part === "" || part === "." || part === "..")) fail("bridge reference is not repository-relative");
    return value;
  });
  if (new Set(normalized).size !== normalized.length) fail("bridge references contain duplicates");
  return normalized;
}
function noChild(selection, duty, requested) {
  return validateSandboxedExecutionReceipt({
    schema: "pipeline.codex-sandbox-execution-receipt.v1",
    selectionId: selection.selectionId,
    selectionSha256: sandboxSelectionDigest(selection),
    repoFingerprint: selection.repoFingerprint,
    duty,
    dispatch: structuredClone(selection.dispatch),
    requested: structuredClone(requested),
    observed: { cliSha256: null, profileSha256: null, networkEnabled: null, scratchRootSha256: null },
    terminal: { childStarted: false, exitCode: null, stdioStatus: "not-started", cleanupStatus: "not-started" },
    assurance: { ...NO_USABLE_REVIEW_ASSURANCE },
    dutyReceipt: { schema: dutyReceiptSchema(duty), sha256: null, status: "unavailable" },
    createdAt: new Date().toISOString(),
  });
}
function postLaunchFailure(selection, duty, requested) {
  return validateSandboxedExecutionReceipt({
    schema: "pipeline.codex-sandbox-execution-receipt.v1",
    selectionId: selection.selectionId,
    selectionSha256: sandboxSelectionDigest(selection),
    repoFingerprint: selection.repoFingerprint,
    duty,
    dispatch: structuredClone(selection.dispatch),
    requested: structuredClone(requested),
    observed: {
      cliSha256: selection.toolchain.cliSha256,
      profileSha256: selection.profile.sha256,
      networkEnabled: selection.profile.network.enabled,
      scratchRootSha256: selection.profile.scratchRootSha256,
    },
    terminal: { childStarted: true, exitCode: null, stdioStatus: "lost", cleanupStatus: "pending" },
    assurance: structuredClone(selection.assurance),
    dutyReceipt: {
      schema: dutyReceiptSchema(duty),
      sha256: sha256(canonicalJson({ schema: "pipeline.codex-sandbox-transport-failure.v1", selectionId: selection.selectionId, phase: "finalize" })),
      status: "error",
    },
    createdAt: new Date().toISOString(),
  });
}
function selectionProfile(selection) {
  const profile = selection?.profile;
  exactKeys(profile, ["id", "sha256", "base", "network", "writableRootClass", "scratchRootSha256"], "selected profile");
  exactKeys(profile.network, ["enabled"], "selected profile network");
  if (profile.id !== "codex-critic-intermediate.v1" || profile.base !== ":read-only" || profile.network.enabled !== true
    || profile.writableRootClass !== "coordinator-scratch-only" || typeof profile.scratchRootSha256 !== "string") fail("selected profile is not the documented transport");
  return profile;
}

/** Exact-ID selection lookup. Retention state is checked before any read. */
export async function showSandboxSelection({ selectionId, retention, readSelection } = {}) {
  if (!ID.test(selectionId ?? "")) fail("selection ID is invalid");
  if (retention && (retention.active !== false || retention.sessionBound !== true)) fail("selection retention does not permit lookup/prune");
  if (typeof readSelection !== "function") fail("exact selection lookup is unavailable");
  const value = await readSelection(selectionId);
  if (!value || value.selectionId !== selectionId) fail("exact selection lookup drifted");
  return value;
}

/**
 * Exact-ID lookup -> profile readback -> fixed selected launch. Every normal
 * return is a complete execution receipt; an unknown lookup is an error rather
 * than a forged no-child receipt with invented dispatch facts.
 */
export async function runSandboxedReadonlyHostBridge({ selectionId, duty, requested, references = [] }, dependencies = {}) {
  if (!ID.test(selectionId ?? "") || !DUTIES.has(duty)) fail("bridge request is invalid");
  requestedRoute(requested);
  const safeReferences = refsOnly(references);
  const selection = await showSandboxSelection({ selectionId, readSelection: dependencies.readSelection });
  if (!selection || selection.selectionId !== selectionId || selection.duty !== duty) fail("exact selection lookup drifted");
  validateSandboxSelection(selection);
  if (selection.status !== "selected") return noChild(selection, duty, requested);
  let profile;
  try { profile = selectionProfile(selection); } catch { return noChild(selection, duty, requested); }
  let readback;
  try { readback = await dependencies.readback?.({ selectionId, duty, profile: structuredClone(profile) }); } catch { return noChild(selection, duty, requested); }
  if (!equal(readback, profile)) return noChild(selection, duty, requested);
  if (typeof dependencies.launch !== "function" || typeof dependencies.finalize !== "function") return noChild(selection, duty, requested);
  if (typeof dependencies.resolveScratch !== "function" || typeof dependencies.resealScratch !== "function") return noChild(selection, duty, requested);
  let scratch = null;
  try { scratch = await dependencies.resolveScratch({ selectionId, duty, profile: structuredClone(profile) }); } catch { return noChild(selection, duty, requested); }
  if (!scratch || scratch.sha256 !== profile.scratchRootSha256) return noChild(selection, duty, requested);
  let launched;
  try {
    launched = await dependencies.launch({ selectionId, duty, selection: structuredClone(selection), requested: structuredClone(requested), references: [...safeReferences], profile: structuredClone(profile), scratch: structuredClone(scratch) });
  } catch {
    try { await dependencies.resealScratch({ selectionId, duty, profile: structuredClone(profile) }); } catch {}
    return postLaunchFailure(selection, duty, requested);
  }
  if (launched?.childStarted !== true) {
    if (launched?.childStarted === false) return noChild(selection, duty, requested);
    return postLaunchFailure(selection, duty, requested);
  }
  let execution;
  try {
    execution = validateSandboxedExecutionReceipt(await dependencies.finalize({ selection, launched, requested: structuredClone(requested), profile: structuredClone(profile) }));
  } catch {
    try { await dependencies.resealScratch({ selectionId, duty, profile: structuredClone(profile) }); } catch {}
    return postLaunchFailure(selection, duty, requested);
  }
  try { await dependencies.resealScratch({ selectionId, duty, profile: structuredClone(profile) }); } catch { return postLaunchFailure(selection, duty, requested); }
  return execution;
}

/**
 * Production composition seam shared by advisory, readiness and Critic. It is
 * the only path that turns refs-only duty facts into a selected Codex child.
 */
export async function executeSandboxedReadonlyDuty(request, dependencies = {}) {
  const { references = [], ...selectionRequest } = request ?? {};
  const built = buildSandboxedReadonlyRequest(selectionRequest);
  const selection = await selectCodexSandbox({
    repoFingerprint: built.repoFingerprint,
    duty: built.duty,
    queueRevision: built.dispatch.queueRevision,
    candidateCommit: built.dispatch.candidateCommit,
    candidateTree: built.dispatch.candidateTree,
    referenceSetSha256: built.dispatch.referenceSetSha256,
    runner: built.requested.runner,
    model: built.requested.model,
  }, {
    ...dependencies.selection,
    persist: async (selection, compatibility, scratch) => {
      if (!dependencies.store || typeof dependencies.store.writeSelection !== "function") fail("durable sandbox selection store is unavailable");
      return dependencies.store.writeSelection(selection, compatibility, scratch);
    },
  });
  if (selection.status !== "selected") {
    return { status: "unavailable", failureClass: selection.failureClass, childStarted: false, selectionId: selection.selectionId, assurance: structuredClone(selection.assurance) };
  }
  if (!dependencies.store || typeof dependencies.store.readSelection !== "function" || typeof dependencies.store.readJournal !== "function"
    || typeof dependencies.store.readExecution !== "function" || typeof dependencies.store.writeExecution !== "function"
    || typeof dependencies.store.bindDuty !== "function" || typeof dependencies.store.runSerialized !== "function") {
    fail("durable sandbox execution store is unavailable");
  }
  const resultForExecution = (execution, journal = null) => {
    const common = {
      childStarted: true,
      selectionId: selection.selectionId,
      selectionSha256: sandboxSelectionDigest(selection),
      executionReceiptSha256: sha256(canonicalJson(execution)),
      dutyReceiptSha256: execution.dutyReceipt.sha256,
      assurance: structuredClone(execution.assurance),
    };
    if (execution.dutyReceipt.status !== usableDutyStatus(built.duty)) return { status: "error", ...common };
    return { status: usableDutyStatus(built.duty), ...common, journal };
  };
  return dependencies.store.runSerialized(selection.selectionId, async () => {
    const current = dependencies.store.readJournal(selection.selectionId);
    if (current.phase === "duty-bound") {
      const execution = dependencies.store.readExecution(selection.selectionId);
      bindSandboxedReadonlyDuty({ selection, execution });
      return resultForExecution(execution, current);
    }
    if (current.phase === "executed") {
      const execution = dependencies.store.readExecution(selection.selectionId);
      if (execution.dutyReceipt.status !== usableDutyStatus(built.duty)) return resultForExecution(execution);
      const binding = bindSandboxedReadonlyDuty({ selection, execution });
      const journal = await dependencies.store.bindDuty({ selection, execution, binding });
      return resultForExecution(execution, journal);
    }
    if (current.phase !== "selected") fail("sandbox journal phase is invalid");
    const execution = await runSandboxedReadonlyHostBridge({ selectionId: selection.selectionId, duty: built.duty, requested: built.requested, references }, {
      ...dependencies.bridge,
      readSelection: async (selectionId) => dependencies.store.readSelection(selectionId),
    });
    if (!execution.terminal.childStarted) {
      return { status: "unavailable", failureClass: "host-mode-unavailable", childStarted: false, selectionId: selection.selectionId, assurance: structuredClone(execution.assurance) };
    }
    await dependencies.store.writeExecution({ selection, execution });
    if (execution.dutyReceipt.status !== usableDutyStatus(built.duty)) return resultForExecution(execution);
    const binding = bindSandboxedReadonlyDuty({ selection, execution });
    const journal = await dependencies.store.bindDuty({ selection, execution, binding });
    return resultForExecution(execution, journal);
  });
}

/** Recover only the next durable journal phase through the exact-ID store. */
export async function recoverSandboxJournal(journal, dependencies = {}) {
  validateSandboxJournal(journal);
  if (!dependencies.store || typeof dependencies.store.readJournal !== "function" || typeof dependencies.store.recoverJournal !== "function") {
    fail("sandbox journal recovery store is unavailable");
  }
  const durable = dependencies.store.readJournal(journal.selectionId);
  if (canonicalJson(durable) !== canonicalJson(journal)) fail("sandbox journal recovery bytes drifted");
  const recovered = dependencies.store.recoverJournal(journal.selectionId);
  validateSandboxJournal(recovered);
  return recovered;
}
