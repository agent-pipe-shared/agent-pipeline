// SPDX-License-Identifier: SUL-1.0
// AL-T2b: pins for the typed pre-launch fallback of runSelectedCriticHost.
//
// Contract source: specs/sprint-alfred-epic/design/codex-critic-lane-2026-10-08.md
// (section 3 changes 2-4, typed codes), plus the dispatcher ruling that
// resolved AL-T2's stop:
//   - the persisted selection is read through an injected
//     transport.readSelection(selectionId) returning { selectionId, preflight: { terminalCode } };
//     a throwing or missing reader maps to CLF-SELECTION-UNREADABLE;
//   - the fallback RESULT carries { fallback, laneRecord }; the Claude-lane
//     receipt writer is a later slice and is not pinned here;
//   - profile-drift maps to CLF-EVIDENCE-STALE (design note :78).
// Every case drives runSelectedCriticHost with stand-ins only; the app-server
// invoker is a spy that must never be reached (zero real spawns).
//
// AL-T2d: every runSelectedCriticHost case first asserts that the run got past
// the activation/route early return ("selected-critic-route-invalid"), so a
// RED that comes from that early return is visible as such and cannot be
// mistaken for a missing-fallback RED. On win32 the activation observer
// (lib/model-family-runtime-host.mjs, directoryPathChain) currently reports
// MODEL-FAMILY-GIT-COMMON-DIR-UNAVAILABLE for any Git repository, so these
// cases stop at that guard on Windows; this fixture cannot inject around it.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";

import { decideCriticLaneFallback, validateLaneRecord } from "../lib/critic-lane-fallback.mjs";
import { runSelectedCriticHost } from "./codex-critic-selected-host.mjs";

const NATIVE_LANE = "codex-sandbox-selected";
const FALLBACK_LANE = "claude-fresh-session";
const SELECTION_ID = "css_bbbbbbbbbbbbbbbbbbbbbbbbbi";
const CANDIDATE_COMMIT = "c".repeat(40);
const CANDIDATE_TREE = "d".repeat(40);
const REVIEW_BASE = "b".repeat(40);
const CRITIC_ROUTE = Object.freeze({
  dutyId: "critic_high_risk", runner: "codex", model: "gpt-6-sol", effort: "max", sourceSha256: "a".repeat(64), candidateCommit: null,
});
const ROUTE_INVALID = "selected-critic-route-invalid";
const ROUTE_INVALID_MESSAGE = "wrong-reason RED: runSelectedCriticHost returned at the activation/route early return before the pre-launch path";

const scratchRoots = [];
after(() => { for (const dir of scratchRoots) rmSync(dir, { recursive: true, force: true }); });

// A physical repository root holding the single required reference path: the
// selected host reads and digests it before the (stood-in) sandbox executor runs.
function criticInput() {
  const created = mkdtempSync(join(tmpdir(), "al-t2b-"));
  scratchRoots.push(created);
  const repoRoot = process.platform === "win32" ? realpathSync.native(created) : created;
  mkdirSync(join(repoRoot, "roles"), { recursive: true });
  writeFileSync(join(repoRoot, "roles", "critic.md"), "# critic fixture\n");
  // The activation check requires a real Git repository at the root.
  const git = (...args) => execFileSync("git", args, { cwd: repoRoot, stdio: "ignore" });
  git("init", "-q");
  git("add", "roles/critic.md");
  git("-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "fixture");
  return {
    repoFingerprint: "b".repeat(64),
    dispatch: { queueRevision: 1, candidateCommit: CANDIDATE_COMMIT, candidateTree: CANDIDATE_TREE, referenceSetSha256: "e".repeat(64) },
    referencePaths: ["roles/critic.md"],
    reviewBase: REVIEW_BASE,
    sandboxRuntime: { repoRoot },
  };
}

function stubTransport({ executeSandboxedReadonlyDuty, readSelection }) {
  const spawns = { count: 0 };
  const transport = {
    resolveCriticRoute: ({ candidateCommit }) => ({ ...CRITIC_ROUTE, candidateCommit }),
    preflightRoleDispatch: ({ packet }) => ({ status: "prepared", packet }),
    invokeCodexCriticAppServer: () => { spawns.count += 1; throw new Error("AL-T2b: a real Codex child must never be started"); },
    dependencies: { executeSandboxedReadonlyDuty },
  };
  if (readSelection !== undefined) transport.readSelection = readSelection;
  return { transport, spawns };
}

// The no-child outcome the real executeSandboxedReadonlyDuty returns when the
// persisted selection records a failure (shape of codex-critic-host.test.mjs
// "returns selected-sandbox-required ... observes no child started").
function noChild(failureClass) {
  return async () => ({ status: "unavailable", failureClass, childStarted: false, selectionId: SELECTION_ID });
}

function selectionReader(terminalCode) {
  const reads = [];
  const readSelection = async (selectionId) => {
    reads.push(selectionId);
    return { selectionId, preflight: { terminalCode } };
  };
  return { reads, readSelection };
}

const PRE_LAUNCH_OUTCOMES = [
  { failureClass: "policy-drift", terminalCode: null, code: "CLF-HOST-UNSUPPORTED" },
  { failureClass: "host-unsupported", terminalCode: null, code: "CLF-HOST-UNSUPPORTED" },
  { failureClass: "evidence-stale", terminalCode: null, code: "CLF-EVIDENCE-STALE" },
  { failureClass: "preflight-failed", terminalCode: "child-stdio-error", code: "CLF-PREFLIGHT-FAILED" },
  { failureClass: "host-mode-unavailable", terminalCode: "profile-unavailable", code: "CLF-PROFILE-UNAVAILABLE" },
];

// Case 1.
for (const outcome of PRE_LAUNCH_OUTCOMES) {
  test(`AL-T2b: pre-launch ${outcome.failureClass} returns the typed fallback ${outcome.code}, never selected-sandbox-required`, async () => {
    const { reads, readSelection } = selectionReader(outcome.terminalCode);
    const { transport, spawns } = stubTransport({ executeSandboxedReadonlyDuty: noChild(outcome.failureClass), readSelection });
    const result = await runSelectedCriticHost(criticInput(), transport);
    assert.notEqual(result.code, ROUTE_INVALID, ROUTE_INVALID_MESSAGE);
    assert.equal(result.ok, false);
    assert.ok(result.fallback, "a typed fallback must be present");
    assert.deepEqual(result.fallback, {
      code: outcome.code,
      from: NATIVE_LANE,
      to: FALLBACK_LANE,
      selectionId: SELECTION_ID,
      failureClass: outcome.failureClass,
      terminalCode: outcome.terminalCode,
    });
    assert.deepEqual(reads, [SELECTION_ID]);
    assert.equal(spawns.count, 0);
  });
}

// Case 2.
test("AL-T2b: unavailableResult carries failureClass and the persisted terminalCode on the result itself", async () => {
  const { readSelection } = selectionReader("child-stdio-error");
  const { transport } = stubTransport({ executeSandboxedReadonlyDuty: noChild("preflight-failed"), readSelection });
  const result = await runSelectedCriticHost(criticInput(), transport);
  assert.notEqual(result.code, ROUTE_INVALID, ROUTE_INVALID_MESSAGE);
  assert.equal(result.failureClass, "preflight-failed");
  assert.equal(result.terminalCode, "child-stdio-error");
  assert.equal(result.selectionId, SELECTION_ID);
  assert.equal(result.sandboxBinding, null);
});

test("AL-T2b: unavailableResult carries an explicit null terminalCode when the persisted selection has none", async () => {
  const { readSelection } = selectionReader(null);
  const { transport } = stubTransport({ executeSandboxedReadonlyDuty: noChild("evidence-stale"), readSelection });
  const result = await runSelectedCriticHost(criticInput(), transport);
  assert.notEqual(result.code, ROUTE_INVALID, ROUTE_INVALID_MESSAGE);
  assert.equal(result.failureClass, "evidence-stale");
  assert.equal(Object.hasOwn(result, "terminalCode"), true);
  assert.equal(result.terminalCode, null);
});

// Case 3.
const UNREADABLE_SELECTIONS = [
  { label: "a synchronously throwing", readSelection: () => { throw new Error("selection store unreadable"); } },
  { label: "a rejecting", readSelection: async () => { throw new Error("selection store unreadable"); } },
  { label: "a missing", readSelection: undefined },
];
for (const { label, readSelection } of UNREADABLE_SELECTIONS) {
  test(`AL-T2b: ${label} readSelection falls back with CLF-SELECTION-UNREADABLE and no terminal code`, async () => {
    const { transport, spawns } = stubTransport({ executeSandboxedReadonlyDuty: noChild("preflight-failed"), readSelection });
    const result = await runSelectedCriticHost(criticInput(), transport);
    assert.notEqual(result.code, ROUTE_INVALID, ROUTE_INVALID_MESSAGE);
    assert.equal(result.ok, false);
    assert.ok(result.fallback, "a typed fallback must be present");
    assert.equal(result.fallback?.code, "CLF-SELECTION-UNREADABLE");
    assert.equal(result.fallback?.from, NATIVE_LANE);
    assert.equal(result.fallback?.to, FALLBACK_LANE);
    assert.equal(result.fallback?.selectionId, SELECTION_ID);
    assert.equal(result.fallback?.terminalCode, null);
    assert.equal(spawns.count, 0);
  });
}

// Case 4.
function assertValidFallbackLaneRecord(result) {
  assert.deepEqual(validateLaneRecord(result.laneRecord), { ok: true, code: null });
  assert.deepEqual(Object.keys(result.laneRecord).sort(), [
    "assuranceClass", "executionReceiptSha256", "fallback", "filesystemClass", "platformClass", "requested", "schema", "selectionSha256", "used",
  ]);
  assert.equal(result.laneRecord.requested, NATIVE_LANE);
  assert.equal(result.laneRecord.used, FALLBACK_LANE);
  assert.equal(result.laneRecord.assuranceClass, "fresh-session");
  assert.deepEqual(result.laneRecord.fallback, result.fallback);
}

test("AL-T2b: the fallback result carries a laneRecord that validates (typed pre-launch failure)", async () => {
  const { readSelection } = selectionReader("child-stdio-error");
  const { transport } = stubTransport({ executeSandboxedReadonlyDuty: noChild("preflight-failed"), readSelection });
  const result = await runSelectedCriticHost(criticInput(), transport);
  assert.notEqual(result.code, ROUTE_INVALID, ROUTE_INVALID_MESSAGE);
  assert.equal(result.fallback?.code, "CLF-PREFLIGHT-FAILED");
  assertValidFallbackLaneRecord(result);
});

test("AL-T2b: the fallback result carries a laneRecord that validates (unreadable selection)", async () => {
  const { transport } = stubTransport({ executeSandboxedReadonlyDuty: noChild("preflight-failed"), readSelection: undefined });
  const result = await runSelectedCriticHost(criticInput(), transport);
  assert.notEqual(result.code, ROUTE_INVALID, ROUTE_INVALID_MESSAGE);
  assert.equal(result.fallback?.code, "CLF-SELECTION-UNREADABLE");
  assertValidFallbackLaneRecord(result);
});

// Case 5.
test("AL-T2b: a post-launch failure (child started) preserves selected-critic-transport-failed and does not fall back", async () => {
  const failedAssurance = { class: "sandbox-read-only-except-coordinator-scratch-network-open", literal: "sandbox-read-only-except-coordinator-scratch; input/network isolation not asserted" };
  const { reads, readSelection } = selectionReader("host-error");
  const { transport, spawns } = stubTransport({
    readSelection,
    executeSandboxedReadonlyDuty: async () => ({
      status: "error", childStarted: true, selectionId: SELECTION_ID, selectionSha256: "1".repeat(64),
      executionReceiptSha256: "2".repeat(64), dutyReceiptSha256: "3".repeat(64), assurance: failedAssurance,
    }),
  });
  const result = await runSelectedCriticHost(criticInput(), transport);
  assert.notEqual(result.code, ROUTE_INVALID, ROUTE_INVALID_MESSAGE);
  assert.equal(result.ok, false);
  assert.equal(result.code, "selected-critic-transport-failed");
  assert.equal(result.selectionId, SELECTION_ID);
  assert.deepEqual(result.sandboxBinding, {
    selectionId: SELECTION_ID,
    selectionSha256: "1".repeat(64),
    executionReceiptSha256: "2".repeat(64),
    dutyReceiptSha256: "3".repeat(64),
    assurance: failedAssurance,
  });
  assert.equal(Object.hasOwn(result, "fallback"), false);
  assert.equal(Object.hasOwn(result, "laneRecord"), false);
  assert.equal(spawns.count, 0);
});

// Case 6.
test("AL-T2b: decideCriticLaneFallback maps failureClass profile-drift to CLF-EVIDENCE-STALE", () => {
  const decision = decideCriticLaneFallback({
    selected: { status: "unavailable", childStarted: false, selectionId: SELECTION_ID, failureClass: "profile-drift" },
    selection: { selectionId: SELECTION_ID, preflight: { terminalCode: null } },
  });
  assert.deepEqual(decision, { fallback: true, code: "CLF-EVIDENCE-STALE", from: NATIVE_LANE, to: FALLBACK_LANE, selectionId: SELECTION_ID });
});
