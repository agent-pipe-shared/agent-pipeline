#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

import { bindSandboxedReadonlyDuty, buildSandboxedReadonlyRequest, validateSandboxedExecutionReceipt } from "./sandboxed-readonly-duty.mjs";
import { sandboxSelectionDigest } from "../scripts/codex-sandbox-select.mjs";

const D = "a".repeat(64);
const DISPATCH = Object.freeze({
  queueRevision: 7,
  candidateCommit: "b".repeat(40),
  candidateTree: "c".repeat(40),
  referenceSetSha256: "d".repeat(64),
});

function request(duty) {
  return buildSandboxedReadonlyRequest({
    duty,
    repoFingerprint: D,
    dispatch: DISPATCH,
    requested: { runner: "codex", model: "gpt-5.6-sol" },
  });
}

function selection(duty) {
  return {
    schema: "pipeline.codex-sandbox-selection.v1",
    selectionId: "css_aaaaaaaaaaaaaaaaaaaaaaaaae",
    repoFingerprint: D,
    duty,
    dispatch: { ...DISPATCH, requestSha256: request(duty).requestSha256 },
    toolchain: { cliVersion: "0.144.6", cliSha256: "0".repeat(64), sandboxHelperSha256: "1".repeat(64), selectionSchemaSha256: "2".repeat(64) },
    host: { platformClass: "linux-wsl2", kernel: { sysname: "Linux", release: "6", machine: "x86_64" }, filesystemClass: "wsl2-native", bootIdSha256: "3".repeat(64) },
    profile: { id: "codex-critic-intermediate.v1", sha256: "4".repeat(64), base: ":read-only", network: { enabled: true }, writableRootClass: "coordinator-scratch-only", scratchRootSha256: "5".repeat(64) },
    preflight: { receiptSha256: "6".repeat(64), eligibility: "intermediate", terminalCode: "eligible", observedAt: "2026-07-19T00:00:00.000Z" },
    compatibilityReceiptSha256: "7".repeat(64),
    status: "selected",
    assurance: {
      class: "sandbox-read-only-except-coordinator-scratch-network-open",
      literal: "sandbox-read-only-except-coordinator-scratch; input/network isolation not asserted",
    },
    failureClass: null,
    observedAt: "2026-07-19T00:00:00.000Z",
  };
}

function execution(duty) {
  const current = selection(duty);
  return {
    schema: "pipeline.codex-sandbox-execution-receipt.v1",
    selectionId: current.selectionId,
    selectionSha256: sandboxSelectionDigest(current),
    repoFingerprint: current.repoFingerprint,
    duty,
    dispatch: current.dispatch,
    requested: { runner: "codex", model: "gpt-5.6-sol" },
    observed: {
      cliSha256: current.toolchain.cliSha256,
      profileSha256: current.profile.sha256,
      networkEnabled: current.profile.network.enabled,
      scratchRootSha256: current.profile.scratchRootSha256,
    },
    terminal: { childStarted: true, exitCode: 0, stdioStatus: "complete", cleanupStatus: "complete" },
    assurance: current.assurance,
    dutyReceipt: { schema: `pipeline.${duty}-receipt.v1`, sha256: "4".repeat(64), status: duty === "advisory" ? "answered" : "reviewed" },
    createdAt: "2026-07-19T00:00:00.000Z",
  };
}

test("all Codex read-only duties build one closed selector request from refs-only dispatch evidence", () => {
  for (const duty of ["advisory", "readiness", "critic"]) {
    const value = request(duty);
    assert.equal(value.duty, duty);
    assert.deepEqual(value.dispatch, DISPATCH);
    assert.match(value.requestSha256, /^[a-f0-9]{64}$/u);
    assert.throws(() => buildSandboxedReadonlyRequest({
      duty, repoFingerprint: D, dispatch: DISPATCH, requested: { runner: "codex", model: "gpt-5.6-sol" }, userProse: "network enabled please",
    }));
  }
});

test("all three duties bind exact selection, execution, and duty receipts to one dispatch", () => {
  for (const duty of ["advisory", "readiness", "critic"]) {
    const currentSelection = selection(duty);
    const currentExecution = execution(duty);
    assert.equal(validateSandboxedExecutionReceipt(currentExecution), currentExecution);
    const bound = bindSandboxedReadonlyDuty({ selection: currentSelection, execution: currentExecution });
    assert.equal(bound.selectionSha256, currentExecution.selectionSha256);
    assert.equal(bound.dutyReceipt.sha256, currentExecution.dutyReceipt.sha256);
    assert.throws(() => bindSandboxedReadonlyDuty({
      selection: currentSelection,
      execution: { ...currentExecution, dispatch: { ...currentExecution.dispatch, queueRevision: 8 } },
    }));
    assert.throws(() => bindSandboxedReadonlyDuty({
      selection: currentSelection,
      execution: { ...currentExecution, requested: { runner: "codex", model: "gpt-5.6-terra" } },
    }), /transport evidence drifted/);
    for (const observed of [
      { ...currentExecution.observed, cliSha256: "9".repeat(64) },
      { ...currentExecution.observed, profileSha256: "8".repeat(64) },
      { ...currentExecution.observed, networkEnabled: false },
      { ...currentExecution.observed, scratchRootSha256: "7".repeat(64) },
    ]) {
      assert.throws(() => bindSandboxedReadonlyDuty({
        selection: currentSelection,
        execution: { ...currentExecution, observed },
      }));
    }
  }
});

test("unavailable selection has no child and cannot manufacture a usable duty receipt", () => {
  const value = {
    ...execution("advisory"),
    observed: { cliSha256: null, profileSha256: null, networkEnabled: null, scratchRootSha256: null },
    terminal: { childStarted: false, exitCode: null, stdioStatus: "not-started", cleanupStatus: "not-started" },
    assurance: { class: "no-usable-review", literal: null },
    dutyReceipt: { schema: "pipeline.advisory-receipt.v1", sha256: null, status: "unavailable" },
  };
  assert.equal(validateSandboxedExecutionReceipt(value), value);
  assert.throws(() => bindSandboxedReadonlyDuty({ selection: { ...selection("advisory"), status: "unavailable" }, execution: value }));
});

test("a started child with an error receipt cannot become a usable duty binding", () => {
  for (const duty of ["advisory", "readiness", "critic"]) {
    const currentSelection = selection(duty);
    const currentExecution = { ...execution(duty), dutyReceipt: { ...execution(duty).dutyReceipt, status: "error" } };
    assert.equal(validateSandboxedExecutionReceipt(currentExecution), currentExecution);
    assert.throws(() => bindSandboxedReadonlyDuty({ selection: currentSelection, execution: currentExecution }), /transport evidence drifted/);
  }
});
