// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";
const completionCases = [];
function test(name, run) {
  if (arguments.length !== 2 || typeof run !== "function") throw new TypeError("Required completion expects preserved two-argument registration");
  completionCases.push({ id: "ARS" + String(completionCases.length + 1).padStart(3, "0"), name, run });
}
import { createAdvisoryRouteSelection, validateAdvisoryRouteSelection } from "./advisory-route-selection.mjs";
import { devNull } from "node:os";

function fixture(status) {
  const receipt = {
    dispatch: { dispatchId: "dispatch-1", candidateCommit: "a".repeat(40), candidateTree: "b".repeat(40) },
    configuredRoute: { runner: "codex" }, adapter: "consult",
    observed: { status, identity: null }, questionSha256: "c".repeat(64), answerSha256: null,
  };
  return { receipt, receiptBytes: Buffer.from(`${JSON.stringify(receipt)}\n`) };
}

test("only matching no-child route codes and statuses validate", () => {
  for (const [code, status] of [
    ["ordinary-consult-host-callback-unavailable", "unavailable"],
    ["ordinary-consult-host-route-unavailable", "unavailable"],
    ["advisor-repository-export-declined", "permission-denied"],
    ["advisor-host-export-denied", "permission-denied"],
  ]) {
    const input = fixture(status);
    const selection = createAdvisoryRouteSelection({ ...input, code });
    assert.equal(validateAdvisoryRouteSelection({ selection, ...input }).ok, true);
    assert.equal(selection.childStarted, false);
    assert.equal(selection.attemptCount, 0);
    const forged = { ...selection, status: status === "unavailable" ? "permission-denied" : "unavailable" };
    assert.equal(validateAdvisoryRouteSelection({ selection: forged, ...input }).ok, false);
  }
});

test("an answer or child claim cannot be reclassified as route selection", () => {
  const input = fixture("unavailable");
  const selection = createAdvisoryRouteSelection({ ...input, code: "ordinary-consult-host-callback-unavailable" });
  assert.equal(validateAdvisoryRouteSelection({ ...input, selection: { ...selection, childStarted: true } }).ok, false);
  assert.equal(validateAdvisoryRouteSelection({ ...input, receipt: { ...input.receipt, answerSha256: "d".repeat(64) }, selection }).ok, false);
});

if (completionCases.length !== 2) throw new Error("Required completion declared case count drift");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
