#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveSystemExecutable } from "../../../harness/scripts/security-readiness/tool-identity.mjs";
import {
  advisoryEvidenceBundleSha256,
  buildAdvisoryEvidenceBundle,
} from "../lib/advisory-lifecycle-v2.mjs";
import { derivePoGateRepositoryFingerprint, resolvePoGateRepositoryTopology } from "../lib/po-gate-authority.mjs";
import {
  PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES,
  ProjectOnboardingReadyError,
} from "../lib/project-onboarding-ready-gate.mjs";
import { runCodexAdvisoryBootstrap } from "./codex-advisory-bootstrap.mjs";

const REFERENCE = "plugins/pipeline-core/scripts/advisory-host-bridge.mjs";
const EVIDENCE_BUNDLE = buildAdvisoryEvidenceBundle(process.cwd(), [REFERENCE]);
const EVIDENCE_SHA256 = advisoryEvidenceBundleSha256(EVIDENCE_BUNDLE);

test("closed launcher requires a concrete reason and constructs one demand-bound request without node -e", async () => {
  let captured;
  const gateCalls = [];
  const code = await runCodexAdvisoryBootstrap([
    "--profile", "epic",
    "--reason", "risk-review",
    "--evidence-sha256", EVIDENCE_SHA256,
    "--dispatch-id", "bootstrap-test",
    "--queue-revision", "2",
    "--session-id", "session-test",
    "--expected-descriptor-sha256", "a".repeat(64),
    "--receipt", "/tmp/bootstrap-test-receipt.json",
    "--reference", REFERENCE,
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
  assert.equal(captured.demand.schema, "pipeline.advisory-demand.v2");
  assert.equal(captured.demand.reason, "risk-review");
  assert.equal(captured.demand.evidenceSha256, EVIDENCE_SHA256);
  assert.deepEqual(captured.references, [REFERENCE]);
  assert.deepEqual(captured.evidenceBundle, EVIDENCE_BUNDLE);
  assert.equal(captured.sandboxContext.referenceSetSha256, EVIDENCE_SHA256);
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
    "--profile", "feature", "--reason", "risk-review", "--evidence-sha256", EVIDENCE_SHA256,
    "--dispatch-id", "bootstrap-stdin-test", "--queue-revision", "0",
    "--session-id", "session-test", "--expected-descriptor-sha256", "a".repeat(64),
    "--receipt", "/tmp/bootstrap-stdin-test-receipt.json",
    "--reference", REFERENCE,
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

test("physical evidence digest mismatch stops before question or host consultation", async () => {
  let questions = 0; let consults = 0;
  await assert.rejects(runCodexAdvisoryBootstrap([
    "--profile", "feature", "--reason", "risk-review", "--evidence-sha256", "f".repeat(64),
    "--dispatch-id", "bootstrap-evidence-drift", "--queue-revision", "0",
    "--session-id", "session-test", "--expected-descriptor-sha256", "a".repeat(64),
    "--receipt", "/tmp/bootstrap-evidence-drift-receipt.json", "--reference", REFERENCE,
  ], {
    requireProjectOnboardingReadyFn: () => ({ status: "ready" }),
    readQuestionBytesFn: async () => { questions += 1; return Buffer.from("must not read"); },
    runAdvisoryHostBridgeFn: async () => { consults += 1; return 0; },
  }), /physical allowlisted bundle/u);
  assert.deepEqual({ questions, consults }, { questions: 0, consults: 0 });
});

test("dispatch readiness failure precedes question, temporary input, executable resolution, and host consult", async () => {
  const argv = [
    "--profile", "feature", "--reason", "risk-review", "--evidence-sha256", EVIDENCE_SHA256,
    "--dispatch-id", "bootstrap-ready-gate", "--queue-revision", "0",
    "--session-id", "session-test", "--expected-descriptor-sha256", "a".repeat(64),
    "--receipt", "/tmp/bootstrap-ready-gate-receipt.json",
    "--reference", REFERENCE,
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
