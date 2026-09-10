#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { spawnSync } from "node:child_process";
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
    advisoryRoute: {
      dutyId: "advisory", runner: "codex", model: "gpt-6-astra", effort: "max", state: "default",
      sourceSha256: "e".repeat(64), candidateCommit: "c".repeat(40),
    },
    sandboxTransport: {
      selectionId: "css_test", selectionSha256: "a".repeat(64), repoFingerprint: "b".repeat(64), duty: "advisory",
      dispatch: { queueRevision: 1, candidateCommit: "c".repeat(40), candidateTree: "d".repeat(40), referenceSetSha256, requestSha256: "f".repeat(64) },
      requested: { runner: "codex", model: "gpt-6-astra" },
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
    observed: { provider: "openai", model: "gpt-6-astra", effort: "max", initialized: true, threadStarted: true, turnStarted: true, turnCompleted: true, stdinEnded: true, exitCode: 0, signal: null, cleanup: "complete" },
    ...overrides,
  };
}

test("native adapter passes the V3-selected route to a complete matching App-Server turn", async () => {
  let childRequest;
  const result = await invokeCodexAdvisoryAppServer(payload(), {
    buildSandboxInvocationFn: () => ({ command: "/codex", argv: ["sandbox"], options: { shell: false } }),
    spawnFn: fakeSpawn(answered(), { code: 0, signal: null }, (request) => { childRequest = request; }),
  });
  assert.equal(result.status, "answered");
  assert.deepEqual(result.identity, { provider: "openai", modelId: "gpt-6-astra", effort: "max" });
  assert.equal(result.sandboxExecution.terminal.cleanupStatus, "complete");
  assert.deepEqual(childRequest.evidenceBundle, payload().evidenceBundle);
  assert.equal(childRequest.evidenceSha256, payload().sandboxTransport.dispatch.referenceSetSha256);
  assert.deepEqual(childRequest.advisoryRoute, payload().advisoryRoute);
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

function writeFakeAdvisoryAppServer(directory, items) {
  const path = join(directory, "fake-codex-app-server.mjs");
  const source = [
    "#!/usr/bin/env node",
    `const items = ${JSON.stringify(items)};`,
    "let buffer = '';",
    "const send = (value) => process.stdout.write(JSON.stringify(value) + '\\n');",
    "const handle = (value) => {",
    "  if (value.id === 1) return send({ id: 1, result: {} });",
    "  if (value.id === 2) return send({ id: 2, result: { model: 'gpt-6-astra', modelProvider: 'openai', approvalPolicy: 'never', thread: { id: 'thread-1' } } });",
    "  if (value.id !== 3 || value.method !== 'turn/start') return;",
    "  send({ id: 3, result: { turn: { id: 'turn-1' } } });",
    "  for (const item of items) send({ method: 'item/completed', params: { threadId: 'thread-1', turnId: 'turn-1', item } });",
    "  send({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } } });",
    "};",
    "process.stdin.on('data', (chunk) => { buffer += chunk.toString('utf8'); let newline; while ((newline = buffer.indexOf('\\n')) >= 0) { const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1); if (line) handle(JSON.parse(line)); } });",
    "process.stdin.on('end', () => process.exit(0));",
  ].join("\n");
  writeFileSync(path, source, { mode: 0o700 });
  chmodSync(path, 0o700);
  return path;
}

function runActualAdvisoryChild(codexPath, scratchPath) {
  const source = payload();
  const request = {
    question: source.question,
    evidenceBundle: source.evidenceBundle,
    evidenceSha256: source.sandboxTransport.dispatch.referenceSetSha256,
    advisoryRoute: source.advisoryRoute,
    codexPath,
    cwd: process.cwd(),
    scratchPath,
  };
  const run = spawnSync(join(process.execPath), [join(process.cwd(), "plugins/pipeline-core/scripts/codex-advisory-app-server-child.mjs")], {
    cwd: process.cwd(), input: JSON.stringify(request), encoding: "utf8", shell: false, timeout: 5_000,
  });
  assert.equal(run.error, undefined);
  const lines = run.stdout.trim().split("\n").filter(Boolean);
  assert.equal(lines.length, 1, run.stdout);
  return { status: run.status, result: JSON.parse(lines[0]) };
}

test("actual advisory child accepts commentary before one final answer and preserves phase validation", () => {
  const fixture = mkdtempSync(join(process.cwd(), "scratch/advisory-phase-protocol-"));
  try {
    const commentaryThenFinal = [
      { type: "agentMessage", phase: "commentary", text: "intermediate" },
      { type: "agentMessage", phase: "final_answer", text: "final answer" },
    ];
    const fake = writeFakeAdvisoryAppServer(fixture, commentaryThenFinal);
    const green = runActualAdvisoryChild(fake, fixture);
    assert.equal(green.status, 0, JSON.stringify(green));
    assert.equal(green.result.code, "answered");
    assert.equal(green.result.answer, "final answer");

    for (const phase of [undefined, null]) {
      const item = { type: "agentMessage", ...(phase === undefined ? {} : { phase }), text: "legacy answer" };
      const result = runActualAdvisoryChild(writeFakeAdvisoryAppServer(fixture, [item]), fixture);
      assert.equal(result.status, 0, `legacy ${String(phase)} phase`);
      assert.equal(result.result.code, "answered", `legacy ${String(phase)} phase`);
    }
    for (const items of [
      [{ type: "agentMessage", phase: "final_answer", text: "one" }, { type: "agentMessage", phase: "final_answer", text: "two" }],
      [{ type: "agentMessage", phase: "analysis", text: "invalid" }],
    ]) {
      const result = runActualAdvisoryChild(writeFakeAdvisoryAppServer(fixture, items), fixture);
      assert.equal(result.status, 2);
      assert.equal(result.result.code, "protocol-error");
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
