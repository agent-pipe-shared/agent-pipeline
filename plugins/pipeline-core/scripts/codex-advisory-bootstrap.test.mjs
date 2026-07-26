#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveSystemExecutable } from "../../../harness/scripts/security-readiness/tool-identity.mjs";
import { derivePoGateRepositoryFingerprint, resolvePoGateRepositoryTopology } from "../lib/po-gate-authority.mjs";
import {
  PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES,
  ProjectOnboardingReadyError,
} from "../lib/project-onboarding-ready-gate.mjs";
import { runCodexAdvisoryBootstrap } from "./codex-advisory-bootstrap.mjs";

test("closed launcher reads the V3 opt-out authority and constructs one native candidate-bound request without node -e", async () => {
  let captured;
  const gateCalls = [];
  const code = await runCodexAdvisoryBootstrap([
    "--profile", "epic",
    "--dispatch-id", "bootstrap-test",
    "--queue-revision", "2",
    "--session-id", "session-test",
    "--expected-descriptor-sha256", "a".repeat(64),
    "--receipt", "/tmp/bootstrap-test-receipt.json",
    "--reference", "plugins/pipeline-core/scripts/advisory-host-bridge.mjs",
  ], {
    requireProjectOnboardingReadyFn(options) {
      gateCalls.push(options);
      return { status: "ready" };
    },
    readQuestionBytesFn: async () => Buffer.from("Which bootstrap boundary is safe?", "utf8"),
    resolveExecutableFn: () => resolveSystemExecutable("codex"),
    runAdvisoryHostBridgeFn: async (argv) => {
      captured = JSON.parse(readFileSync(argv[1], "utf8"));
      return 0;
    },
  });
  assert.equal(code, 0);
  assert.deepEqual(gateCalls, [{ rootDir: process.cwd(), intent: "dispatch" }]);
  assert.deepEqual(captured.advisorExport, { consent: "approved" });
  assert.equal(captured.runner, "codex");
  assert.equal(captured.question, "Which bootstrap boundary is safe?");
  assert.deepEqual(captured.references, ["plugins/pipeline-core/scripts/advisory-host-bridge.mjs"]);
  assert.equal(captured.dispatch.queueRevision, 2);
  assert.match(captured.dispatch.candidateCommit, /^[a-f0-9]{40}$/u);
  assert.match(captured.dispatch.candidateTree, /^[a-f0-9]{40}$/u);
  const topology = resolvePoGateRepositoryTopology(process.cwd());
  assert.equal(captured.sandboxContext.repoFingerprint, derivePoGateRepositoryFingerprint({
    gitCommonDir: topology.gitCommonDir,
    primaryRoot: topology.primaryRoot,
  }));
  assert.equal(captured.sandboxRuntime.schema, "pipeline.codex-sandbox-runtime.v1");
});

test("launcher rejects absent, oversized, or invalid UTF-8 stdin before creating an advisory request", async () => {
  const argv = [
    "--profile", "feature", "--dispatch-id", "bootstrap-stdin-test", "--queue-revision", "0",
    "--session-id", "session-test", "--expected-descriptor-sha256", "a".repeat(64),
    "--receipt", "/tmp/bootstrap-stdin-test-receipt.json",
  ];
  for (const bytes of [Buffer.alloc(0), Buffer.alloc(262_145, 0x61), Buffer.from([0xc3, 0x28])]) {
    let invoked = false;
    await assert.rejects(runCodexAdvisoryBootstrap(argv, {
      requireProjectOnboardingReadyFn: () => ({ status: "ready" }),
      readQuestionBytesFn: async () => bytes,
      resolveExecutableFn: () => resolveSystemExecutable("codex"),
      runAdvisoryHostBridgeFn: async () => { invoked = true; return 0; },
    }), /advisory/u);
    assert.equal(invoked, false);
  }
});

test("dispatch readiness failure precedes question, temporary input, executable resolution, and host consult", async () => {
  const argv = [
    "--profile", "feature", "--dispatch-id", "bootstrap-ready-gate", "--queue-revision", "0",
    "--session-id", "session-test", "--expected-descriptor-sha256", "a".repeat(64),
    "--receipt", "/tmp/bootstrap-ready-gate-receipt.json",
  ];
  let questions = 0;
  let temporaries = 0;
  let executables = 0;
  let consults = 0;
  for (const status of PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES) {
    await assert.rejects(runCodexAdvisoryBootstrap(argv, {
      requireProjectOnboardingReadyFn({ rootDir, intent }) {
        assert.equal(rootDir, process.cwd());
        assert.equal(intent, "dispatch");
        throw new ProjectOnboardingReadyError(
          "PORG-NOT-READY",
          `Project onboarding lifecycle is not ready for intent dispatch (status ${status}).`,
          { intent: "dispatch", lifecycleStatus: status },
        );
      },
      readQuestionBytesFn: async () => { questions += 1; throw new Error("question must not be read"); },
      mkdtempFn: () => { temporaries += 1; throw new Error("temporary must not be created"); },
      resolveExecutableFn: () => { executables += 1; throw new Error("executable must not be resolved"); },
      runAdvisoryHostBridgeFn: async () => { consults += 1; return 0; },
    }), (error) => error instanceof ProjectOnboardingReadyError
      && error.code === "PORG-NOT-READY"
      && error.lifecycleStatus === status);
  }
  for (const code of ["PORG-INVALID-OBSERVATION", "PORG-OBSERVATION-UNAVAILABLE"]) {
    await assert.rejects(runCodexAdvisoryBootstrap(argv, {
      requireProjectOnboardingReadyFn() {
        throw new ProjectOnboardingReadyError(
          code,
          `raw readiness detail for ${code} at /private/root`,
          { intent: "dispatch" },
        );
      },
      readQuestionBytesFn: async () => { questions += 1; throw new Error("question must not be read"); },
      mkdtempFn: () => { temporaries += 1; throw new Error("temporary must not be created"); },
      resolveExecutableFn: () => { executables += 1; throw new Error("executable must not be resolved"); },
      runAdvisoryHostBridgeFn: async () => { consults += 1; return 0; },
    }), (error) => error instanceof ProjectOnboardingReadyError && error.code === code);
  }
  assert.deepEqual({ questions, temporaries, executables, consults }, {
    questions: 0,
    temporaries: 0,
    executables: 0,
    consults: 0,
  });
});
