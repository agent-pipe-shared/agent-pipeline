#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runAdvisoryHostBridge, runCodexAdvisoryThroughSelectedSandbox } from "./advisory-host-bridge.mjs";

const dispatch = { dispatchId: "bridge-test", queueRevision: 1, candidateCommit: "a".repeat(40), candidateTree: "b".repeat(40) };
const base = () => ({ profile: "epic", runner: "codex", question: "Which boundary is safest?", dispatch, advisorExport: { consent: "approved" }, sandboxContext: { repoFingerprint: "c".repeat(64), referenceSetSha256: "d".repeat(64) } });

test("an unbound direct host adapter never starts a Codex advisory or claims an answer", async () => {
  let calls = 0; let payload;
  const result = await runCodexAdvisoryThroughSelectedSandbox(base(), async (value) => { calls += 1; payload = value; return { status: "answered", answer: "Keep it closed." }; }, { repoRoot: process.cwd() });
  assert.equal(calls, 0); assert.equal(payload, undefined);
  assert.equal(result.advisoryResult.ok, false); assert.equal(result.advisoryResult.code, "selected-sandbox-required"); assert.equal(result.execution.schema, "pipeline.host-advisor-status.v1"); assert.equal(result.execution.outcome, "unavailable");
  assert.deepEqual(result.execution.candidate, { commit: dispatch.candidateCommit, tree: dispatch.candidateTree });
  assert.equal(result.execution.boundary.selectedSandboxAttempts, 0); assert.equal(result.execution.boundary.nativeAdapterAttempts, 0);
});

test("workspace observation failure remains typed no-child evidence", async () => {
  let n = 0;
  const result = await runCodexAdvisoryThroughSelectedSandbox(base(), async () => ({ status: "answered", answer: "must be discarded" }), {
    repoRoot: process.cwd(),
    observeWorkspace: () => { n += 1; return { workspaceSha256: n === 1 ? "1".repeat(64) : "2".repeat(64) }; },
  });
  assert.equal(result.advisoryResult.ok, false); assert.equal(result.advisoryResult.answer, null); assert.equal(result.execution.outcome, "unavailable");
  assert.equal(result.execution.boundary.workspaceBeforeSha256, "1".repeat(64)); assert.equal(result.execution.boundary.workspaceAfterSha256, "2".repeat(64));
});

test("an adapter response cannot alter the typed no-child result", async () => {
  for (const response of [{ status: "unavailable" }, { status: "answered" }, null]) {
    let calls = 0;
    const result = await runCodexAdvisoryThroughSelectedSandbox(base(), async () => { calls += 1; return response; }, { repoRoot: process.cwd() });
    assert.equal(calls, 0); assert.equal(result.advisoryResult.ok, false); assert.equal(result.advisoryResult.code, "selected-sandbox-required");
    assert.equal(result.execution.outcome, "unavailable");
  }
});

test("route authority disables mini and declined input before any child and rejects malformed consent", async () => {
  for (const input of [{ ...base(), profile: "mini" }, { ...base(), advisorExport: { consent: "declined" } }]) {
    let calls = 0;
    const result = await runCodexAdvisoryThroughSelectedSandbox(input, async () => { calls += 1; return { status: "answered", answer: "must not run" }; }, { repoRoot: process.cwd() });
    assert.equal(calls, 0); assert.equal(result.advisoryResult.ok, false); assert.equal(result.execution, null);
  }
  let calls = 0;
  await assert.rejects(runCodexAdvisoryThroughSelectedSandbox({ ...base(), advisorExport: { consent: "approved", extra: true } }, async () => { calls += 1; }, { repoRoot: process.cwd() }), { code: "invalid-route-input" });
  assert.equal(calls, 0);
});

test("production bridge persists typed no-child status without accepting a raw answer", async () => {
  const root = await mkdtemp(join(tmpdir(), "host-advisor-")); const inputPath = join(root, "input.json"); const receiptPath = join(root, "status.json");
  try {
    await writeFile(inputPath, JSON.stringify({ ...base(), sandboxRuntime: { sessionCleanup: { sessionId: "session-test" } } }));
    const code = await runAdvisoryHostBridge(["--input", inputPath, "--receipt", receiptPath], { makeHostAdapter: () => async () => ({ status: "answered", answer: "private answer" }) });
    assert.equal(code, 2); await assert.rejects(readFile(inputPath));
    const status = JSON.parse(await readFile(receiptPath, "utf8")); assert.equal(status.schema, "pipeline.host-advisor-status.v1"); assert.equal(status.outcome, "unavailable"); assert.equal(JSON.stringify(status).includes("private answer"), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
