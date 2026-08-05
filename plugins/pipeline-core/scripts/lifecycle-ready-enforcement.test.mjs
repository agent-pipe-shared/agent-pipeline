#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES,
  ProjectOnboardingReadyError,
} from "../lib/project-onboarding-ready-gate.mjs";
import { main as sessionCleanupMain } from "./session-cleanup.mjs";
import { main as worktreeCreateMain } from "./worktree-create.mjs";

function repo() {
  return mkdtempSync(join(tmpdir(), "lifecycle-ready-enforcement-"));
}

function denial(intent, status = "partial") {
  return new ProjectOnboardingReadyError(
    "PORG-NOT-READY",
    `Project onboarding lifecycle is not ready for intent ${intent} (status ${status}).`,
    { intent, lifecycleStatus: status },
  );
}

function gateFailure(intent, code) {
  return new ProjectOnboardingReadyError(
    code,
    `raw readiness detail for ${code} at /private/root`,
    { intent },
  );
}

function worktreeRecord(root, overrides = {}) {
  return {
    schema: "pipeline.worktree-record.v1",
    status: "ready",
    lifecycle: "active",
    physicalPath: join(root, "branch", "fixture"),
    ref: "refs/heads/fixture",
    oid: "a".repeat(40),
    purpose: null,
    sessionId: null,
    ...overrides,
  };
}

test("session start requires exact session readiness before descriptor mutation", () => {
  const root = repo();
  let starts = 0;
  let writes = 0;
  try {
    for (const status of PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES) {
      assert.throws(() => sessionCleanupMain(
        ["start", "--repo", root, "--session", "gate-negative"],
        {},
        {
          requireProjectOnboardingReadyFn({ rootDir, intent }) {
            assert.equal(rootDir, root);
            assert.equal(intent, "session");
            throw denial(intent, status);
          },
          startSessionDescriptorFn() { starts += 1; },
          writeFn() { writes += 1; },
        },
      ), (error) => error instanceof ProjectOnboardingReadyError
        && error.code === "PORG-NOT-READY"
        && error.lifecycleStatus === status);
    }
    for (const code of ["PORG-INVALID-OBSERVATION", "PORG-OBSERVATION-UNAVAILABLE"]) {
      assert.throws(() => sessionCleanupMain(
        ["start", "--repo", root, "--session", "gate-failure"],
        {},
        {
          requireProjectOnboardingReadyFn() { throw gateFailure("session", code); },
          startSessionDescriptorFn() { starts += 1; },
          writeFn() { writes += 1; },
        },
      ), (error) => error instanceof ProjectOnboardingReadyError && error.code === code);
    }
    assert.equal(starts, 0);
    assert.equal(writes, 0);
    assert.equal(existsSync(join(root, ".git", "agent-pipeline")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("session start calls the gate once before its mutation while hygiene remains ungated", () => {
  const root = repo();
  const order = [];
  const output = [];
  try {
    const code = sessionCleanupMain(
      ["start", "--repo", root, "--session", "gate-positive"],
      {},
      {
        requireProjectOnboardingReadyFn(options) {
          order.push(["gate", options]);
          return { status: "ready" };
        },
        readOnboardingSessionCleanupBindingFn({ rootDir }) {
          order.push(["read-binding", { rootDir }]);
          return {
            status: "unbound",
            stateSha256: "b".repeat(64),
            revision: 0,
            sessionCleanup: null,
          };
        },
        listActiveSessionDescriptorsFn(startPath) {
          order.push(["list-descriptors", { startPath }]);
          return [];
        },
        startSessionDescriptorFn(_root, { sessionId }) {
          order.push(["start", { sessionId }]);
          return { sessionId, descriptorSha256: "a".repeat(64) };
        },
        bindOnboardingSessionCleanupFn(request) {
          order.push(["bind", request]);
          return {
            mutated: true,
            sessionCleanup: request.sessionCleanup,
          };
        },
        writeFn(value) { output.push(value); },
      },
    );
    assert.equal(code, 0);
    assert.deepEqual(order, [
      ["gate", { rootDir: root, intent: "session" }],
      ["read-binding", { rootDir: root }],
      ["list-descriptors", { startPath: root }],
      ["start", { sessionId: "gate-positive" }],
      ["bind", {
        rootDir: root,
        expectedStateSha256: "b".repeat(64),
        expectedRevision: 0,
        sessionCleanup: {
          sessionId: "gate-positive",
          descriptorSha256: "a".repeat(64),
        },
      }],
    ]);
    const started = JSON.parse(output.join(""));
    assert.deepEqual(Object.keys(started).sort(), ["code", "descriptorSha256", "ok", "sessionId"]);
    assert.equal(started.code, "WT-SESSION-STARTED");

    let gateCalls = 0;
    const hygieneOutput = [];
    assert.equal(sessionCleanupMain(
      ["hygiene", "--repo", root, "--session", "existing-session"],
      {},
      {
        requireProjectOnboardingReadyFn() { gateCalls += 1; },
        checkSessionHygieneFn() {
          return { ok: true, code: "WT-HYGIENE-CLEAN" };
        },
        writeFn(value) { hygieneOutput.push(value); },
      },
    ), 0);
    assert.equal(gateCalls, 0);
    assert.equal(JSON.parse(hygieneOutput.join("")).code, "WT-HYGIENE-CLEAN");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("every worktree-create operation requires dispatch readiness before mutation", () => {
  const root = repo();
  const cases = [
    ["branch", ["branch", "--repo", root, "--branch", "feat/gate"], "createBranchWorktreeFn"],
    [
      "detached",
      ["detached", "--repo", root, "--purpose", "review", "--oid", "a".repeat(40), "--session", "session-gate"],
      "createDetachedWorktreeFn",
    ],
    ["migrate", ["migrate", "--repo", root, "--source", join(root, "old"), "--branch", "feat/gate"], "migrateBranchWorktreeFn"],
  ];
  try {
    for (const [name, argv, mutationName] of cases) {
      let mutations = 0;
      let writes = 0;
      for (const status of PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES) {
        assert.throws(() => worktreeCreateMain(argv, {
          PIPELINE_SESSION_OWNER_NONCE: "owner-nonce-gate-000001",
        }, {
          requireProjectOnboardingReadyFn({ rootDir, intent }) {
            assert.equal(rootDir, root, name);
            assert.equal(intent, "dispatch", name);
            throw denial(intent, status);
          },
          [mutationName]() { mutations += 1; },
          writeFn() { writes += 1; },
        }), (error) => error instanceof ProjectOnboardingReadyError
          && error.code === "PORG-NOT-READY"
          && error.lifecycleStatus === status);
      }
      for (const code of ["PORG-INVALID-OBSERVATION", "PORG-OBSERVATION-UNAVAILABLE"]) {
        assert.throws(() => worktreeCreateMain(argv, {
          PIPELINE_SESSION_OWNER_NONCE: "owner-nonce-gate-000001",
        }, {
          requireProjectOnboardingReadyFn() { throw gateFailure("dispatch", code); },
          [mutationName]() { mutations += 1; },
          writeFn() { writes += 1; },
        }), (error) => error instanceof ProjectOnboardingReadyError && error.code === code);
      }
      assert.equal(mutations, 0, name);
      assert.equal(writes, 0, name);
    }
    assert.equal(existsSync(join(root, "branch")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("worktree-create binds dispatch once and preserves each existing operation", () => {
  const root = repo();
  const cases = [
    [
      ["branch", "--repo", root, "--branch", "feat/gate"],
      "createBranchWorktreeFn",
      worktreeRecord(root),
    ],
    [
      ["detached", "--repo", root, "--purpose", "review", "--oid", "a".repeat(40), "--session", "session-gate"],
      "createDetachedWorktreeFn",
      worktreeRecord(root, { ref: null, purpose: "review", sessionId: "session-gate" }),
    ],
    [
      ["migrate", "--repo", root, "--source", join(root, "old"), "--branch", "feat/gate"],
      "migrateBranchWorktreeFn",
      worktreeRecord(root),
    ],
  ];
  try {
    for (const [argv, mutationName, record] of cases) {
      const order = [];
      const output = [];
      assert.equal(worktreeCreateMain(argv, {
        PIPELINE_SESSION_OWNER_NONCE: "owner-nonce-gate-000001",
      }, {
        requireProjectOnboardingReadyFn(options) {
          order.push(["gate", options]);
          return { status: "ready" };
        },
        [mutationName]() {
          order.push(["mutation"]);
          return record;
        },
        writeFn(value) { output.push(value); },
      }), 0);
      assert.deepEqual(order, [
        ["gate", { rootDir: root, intent: "dispatch", runner: "codex" }],
        ["mutation"],
      ]);
      assert.equal(JSON.parse(output.join("")).status, "ready");
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
