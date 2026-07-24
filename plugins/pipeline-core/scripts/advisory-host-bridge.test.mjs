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

test("direct Codex advisory performs exactly one fresh consult and binds host status", async () => {
  let calls = 0; let payload;
  const result = await runCodexAdvisoryThroughSelectedSandbox(base(), async (value) => { calls += 1; payload = value; return { status: "answered", answer: "Keep it closed." }; }, { repoRoot: process.cwd() });
  assert.equal(calls, 1); assert.equal(payload.role, "consult-advisor"); assert.equal(payload.oneQuestion, true); assert.equal(payload.freshContext, true); assert.equal(payload.sandbox_mode, "read-only"); assert.deepEqual(payload.tools, ["Read", "Grep", "Glob"]);
  assert.equal(result.advisoryResult.ok, true); assert.equal(result.execution.schema, "pipeline.host-advisor-status.v1"); assert.equal(result.execution.outcome, "answered");
  assert.deepEqual(result.execution.candidate, { commit: dispatch.candidateCommit, tree: dispatch.candidateTree });
  assert.equal(result.execution.boundary.selectedSandboxAttempts, 0); assert.equal(result.execution.boundary.nativeAdapterAttempts, 0);
});

test("post-consult workspace drift is non-success and never returns the answer", async () => {
  let n = 0;
  const result = await runCodexAdvisoryThroughSelectedSandbox(base(), async () => ({ status: "answered", answer: "must be discarded" }), {
    repoRoot: process.cwd(),
    observeWorkspace: () => { n += 1; return { workspaceSha256: n === 1 ? "1".repeat(64) : "2".repeat(64) }; },
  });
  assert.equal(result.advisoryResult.ok, false); assert.equal(result.advisoryResult.answer, null); assert.equal(result.execution.outcome, "failed");
  assert.equal(result.execution.boundary.workspaceBeforeSha256, "1".repeat(64)); assert.equal(result.execution.boundary.workspaceAfterSha256, "2".repeat(64));
});

test("unavailable, malformed, or mutating consults fail closed without fallback", async () => {
  for (const response of [{ status: "unavailable" }, { status: "answered" }, null]) {
    let calls = 0;
    const result = await runCodexAdvisoryThroughSelectedSandbox(base(), async () => { calls += 1; return response; }, { repoRoot: process.cwd() });
    assert.equal(calls, 1); assert.equal(result.advisoryResult.ok, false); assert.notEqual(result.advisoryResult.code, "host-consult-fallback");
    assert.equal(result.execution.outcome, response?.status === "unavailable" ? "unavailable" : "failed");
  }
});

test("production bridge consumes raw input and persists only sanitized host status", async () => {
  const root = await mkdtemp(join(tmpdir(), "host-advisor-")); const inputPath = join(root, "input.json"); const receiptPath = join(root, "status.json");
  try {
    await writeFile(inputPath, JSON.stringify({ ...base(), sandboxRuntime: { sessionCleanup: { sessionId: "session-test" } } }));
    const code = await runAdvisoryHostBridge(["--input", inputPath, "--receipt", receiptPath], { makeHostAdapter: () => async () => ({ status: "answered", answer: "private answer" }) });
    assert.equal(code, 0); await assert.rejects(readFile(inputPath));
    const status = JSON.parse(await readFile(receiptPath, "utf8")); assert.equal(status.schema, "pipeline.host-advisor-status.v1"); assert.equal(JSON.stringify(status).includes("private answer"), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
