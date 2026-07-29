#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";

import {
  advisoryEvidenceBundleSha256,
  buildAdvisoryEvidenceBundle,
} from "../lib/advisory-lifecycle-v2.mjs";
import { invokeCodexAdvisoryAppServer } from "./codex-advisory-app-server.mjs";

function payload() {
  const evidenceBundle = buildAdvisoryEvidenceBundle(process.cwd(), [
    "plugins/pipeline-core/scripts/codex-advisory-app-server.mjs",
  ]);
  const referenceSetSha256 = advisoryEvidenceBundleSha256(evidenceBundle);
  return {
    question: "What is the smallest safe bootstrap fix?",
    evidenceBundle,
    sandboxTransport: {
      selectionId: "css_test", selectionSha256: "a".repeat(64), repoFingerprint: "b".repeat(64), duty: "advisory",
      dispatch: { queueRevision: 1, candidateCommit: "c".repeat(40), candidateTree: "d".repeat(40), referenceSetSha256, requestSha256: "f".repeat(64) },
      requested: { runner: "codex", model: "gpt-5.6-sol" },
      toolchain: { cliSha256: "1".repeat(64) },
      profile: { base: ":read-only", network: { enabled: true }, sha256: "2".repeat(64), scratchRootSha256: "3".repeat(64) },
      scratch: { path: "/tmp/advisory", sha256: "3".repeat(64), sandboxStateJson: "{}", sandboxStateSha256: "4".repeat(64), repoRoot: process.cwd(), codexPath: "/codex" },
    },
  };
}

function fakeSpawn(result, terminal = { code: 0, signal: null }, onRequest = () => {}) {
  return () => {
    const child = new EventEmitter();
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    const chunks = [];
    child.stdin.on("data", (chunk) => chunks.push(chunk));
    child.stdin.on("finish", () => {
      onRequest(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      child.stdout.end(`${JSON.stringify(result)}\n`);
      queueMicrotask(() => child.emit("close", terminal.code, terminal.signal));
    });
    return child;
  };
}

function answered(overrides = {}) {
  return {
    schema: "pipeline.codex-advisory-app-server-child.v1", ok: true, code: "answered", answer: "Use the closed launcher.",
    observed: { provider: "openai", model: "gpt-5.6-sol", effort: "max", initialized: true, threadStarted: true, turnStarted: true, turnCompleted: true, stdinEnded: true, exitCode: 0, signal: null, cleanup: "complete" },
    ...overrides,
  };
}

test("native adapter accepts only a complete openai/gpt-5.6-sol App-Server turn bound to the selected profile", async () => {
  let childRequest;
  const result = await invokeCodexAdvisoryAppServer(payload(), {
    buildSandboxInvocationFn: () => ({ command: "/codex", argv: ["sandbox"], options: { shell: false } }),
    spawnFn: fakeSpawn(answered(), { code: 0, signal: null }, (request) => { childRequest = request; }),
  });
  assert.equal(result.status, "answered");
  assert.deepEqual(result.identity, { provider: "openai", modelId: "gpt-5.6-sol", effort: "max" });
  assert.equal(result.sandboxExecution.terminal.cleanupStatus, "complete");
  assert.deepEqual(childRequest.evidenceBundle, payload().evidenceBundle);
  assert.equal(childRequest.evidenceSha256, payload().sandboxTransport.dispatch.referenceSetSha256);
});

test("missing, tampered or selection-drifted evidence never starts the App Server child", async () => {
  const physicallyForeign = payload();
  physicallyForeign.evidenceBundle.references[0].content = "internally valid but not repository evidence\n";
  physicallyForeign.evidenceBundle.references[0].bytes = Buffer.byteLength(
    physicallyForeign.evidenceBundle.references[0].content,
  );
  physicallyForeign.evidenceBundle.references[0].sha256 = createHash("sha256")
    .update(physicallyForeign.evidenceBundle.references[0].content)
    .digest("hex");
  physicallyForeign.sandboxTransport.dispatch.referenceSetSha256 = advisoryEvidenceBundleSha256(
    physicallyForeign.evidenceBundle,
  );
  for (const value of [
    { ...payload(), evidenceBundle: null },
    { ...payload(), evidenceBundle: { ...payload().evidenceBundle, references: [] } },
    { ...payload(), sandboxTransport: { ...payload().sandboxTransport, dispatch: { ...payload().sandboxTransport.dispatch, referenceSetSha256: "f".repeat(64) } } },
    physicallyForeign,
  ]) {
    let spawned = false;
    await assert.rejects(invokeCodexAdvisoryAppServer(value, { spawnFn: () => { spawned = true; } }), /evidence|transport/u);
    assert.equal(spawned, false);
  }
});

test("wrong model, protocol failure, write attempt, incomplete stdio/exit or cleanup never becomes success", async () => {
  for (const result of [
    answered({ observed: { ...answered().observed, model: "gpt-5.6-terra" } }),
    answered({ observed: { ...answered().observed, effort: "high" } }),
    { ...answered(), ok: false, code: "protocol-error", answer: null },
    { ...answered(), ok: false, code: "write-attempt", answer: null },
    answered({ observed: { ...answered().observed, stdinEnded: false } }),
    answered({ observed: { ...answered().observed, cleanup: "incomplete" } }),
  ]) {
    const actual = await invokeCodexAdvisoryAppServer(payload(), {
      buildSandboxInvocationFn: () => ({ command: "/codex", argv: ["sandbox"], options: { shell: false } }),
      spawnFn: fakeSpawn(result),
    });
    assert.deepEqual(actual, { status: "unavailable", childStarted: true });
  }
});
