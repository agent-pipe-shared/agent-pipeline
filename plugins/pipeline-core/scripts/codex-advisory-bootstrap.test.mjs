#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveSystemExecutable } from "../../../harness/scripts/security-readiness/tool-identity.mjs";
import { derivePoGateRepositoryFingerprint, resolvePoGateRepositoryTopology } from "../lib/po-gate-authority.mjs";
import { runCodexAdvisoryBootstrap } from "./codex-advisory-bootstrap.mjs";

test("closed launcher reads the V3 opt-out authority and constructs one native candidate-bound request without node -e", async () => {
  let captured;
  const code = await runCodexAdvisoryBootstrap([
    "--profile", "epic",
    "--dispatch-id", "bootstrap-test",
    "--queue-revision", "2",
    "--session-id", "session-test",
    "--expected-descriptor-sha256", "a".repeat(64),
    "--receipt", "/tmp/bootstrap-test-receipt.json",
    "--reference", "plugins/pipeline-core/scripts/advisory-host-bridge.mjs",
  ], {
    readQuestionBytesFn: async () => Buffer.from("Which bootstrap boundary is safe?", "utf8"),
    resolveExecutableFn: () => resolveSystemExecutable("codex"),
    runAdvisoryHostBridgeFn: async (argv) => {
      captured = JSON.parse(readFileSync(argv[1], "utf8"));
      return 0;
    },
  });
  assert.equal(code, 0);
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
      readQuestionBytesFn: async () => bytes,
      resolveExecutableFn: () => resolveSystemExecutable("codex"),
      runAdvisoryHostBridgeFn: async () => { invoked = true; return 0; },
    }), /advisory/u);
    assert.equal(invoked, false);
  }
});
