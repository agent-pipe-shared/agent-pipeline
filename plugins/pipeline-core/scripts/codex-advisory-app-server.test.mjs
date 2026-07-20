#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";

import { invokeCodexAdvisoryAppServer } from "./codex-advisory-app-server.mjs";

function payload() {
  return {
    question: "What is the smallest safe bootstrap fix?",
    sandboxTransport: {
      selectionId: "css_test", selectionSha256: "a".repeat(64), repoFingerprint: "b".repeat(64), duty: "advisory",
      dispatch: { queueRevision: 1, candidateCommit: "c".repeat(40), candidateTree: "d".repeat(40), referenceSetSha256: "e".repeat(64), requestSha256: "f".repeat(64) },
      requested: { runner: "codex", model: "gpt-5.6-sol" },
      toolchain: { cliSha256: "1".repeat(64) },
      profile: { base: ":read-only", network: { enabled: true }, sha256: "2".repeat(64), scratchRootSha256: "3".repeat(64) },
      scratch: { path: "/tmp/advisory", sha256: "3".repeat(64), sandboxStateJson: "{}", sandboxStateSha256: "4".repeat(64), repoRoot: "/repo", codexPath: "/codex" },
    },
  };
}

function fakeSpawn(result, terminal = { code: 0, signal: null }) {
  return () => {
    const child = new EventEmitter();
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.stdin.on("finish", () => {
      child.stdout.end(`${JSON.stringify(result)}\n`);
      queueMicrotask(() => child.emit("close", terminal.code, terminal.signal));
    });
    return child;
  };
}

function answered(overrides = {}) {
  return {
    schema: "pipeline.codex-advisory-app-server-child.v1", ok: true, code: "answered", answer: "Use the closed launcher.",
    observed: { provider: "openai", model: "gpt-5.6-sol", initialized: true, threadStarted: true, turnStarted: true, turnCompleted: true, stdinEnded: true, exitCode: 0, signal: null, cleanup: "complete" },
    ...overrides,
  };
}

test("native adapter accepts only a complete openai/gpt-5.6-sol App-Server turn bound to the selected profile", async () => {
  const result = await invokeCodexAdvisoryAppServer(payload(), {
    buildSandboxInvocationFn: () => ({ command: "/codex", argv: ["sandbox"], options: { shell: false } }),
    spawnFn: fakeSpawn(answered()),
  });
  assert.equal(result.status, "answered");
  assert.deepEqual(result.identity, { provider: "openai", modelId: "gpt-5.6-sol", effort: "not-applicable" });
  assert.equal(result.sandboxExecution.terminal.cleanupStatus, "complete");
});

test("wrong model, protocol failure, write attempt, incomplete stdio/exit or cleanup never becomes success", async () => {
  for (const result of [
    answered({ observed: { ...answered().observed, model: "gpt-5.6-terra" } }),
    { ...answered(), ok: false, code: "protocol-error", answer: null },
    { ...answered(), ok: false, code: "write-attempt", answer: null },
    answered({ observed: { ...answered().observed, stdinEnded: false } }),
    answered({ observed: { ...answered().observed, cleanup: "incomplete" } }),
  ]) {
    const actual = await invokeCodexAdvisoryAppServer(payload(), {
      buildSandboxInvocationFn: () => ({ command: "/codex", argv: ["sandbox"], options: { shell: false } }),
      spawnFn: fakeSpawn(result),
    });
    assert.deepEqual(actual, { status: "unavailable" });
  }
});
