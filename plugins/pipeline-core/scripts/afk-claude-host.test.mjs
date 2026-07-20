// SPDX-License-Identifier: Apache-2.0
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  FINAL_GATE,
  INSTRUCTION_SCHEMA,
  REQUIRED_DENY_SET,
  SUPPORTED_ADAPTER,
  SUPPORTED_TOOLS,
  canonicalJsonFile,
  prepareAfkActivation,
  sha256Canonical,
  sha256Raw,
} from "../lib/afk-assumption-mode.mjs";
import { createAfkWorkerResult } from "../lib/afk-capability-worker.mjs";
import {
  finalizeClaudeWorker,
  prepareClaudeWorker,
  validateClaudeWorkerDefinition,
} from "./afk-claude-host.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFINITION = readFileSync(join(HERE, "..", "agents", "afk-claude-worker.md"));
const CURRENT = { commit: "d".repeat(40), tree: "e".repeat(40), objectFormat: "sha1" };

function receipt() {
  const authority = {
    prd: { path: "specs/batman/prd.md", bytes: Buffer.from("prd\n") },
    spec: { path: "specs/batman/spec.md", bytes: Buffer.from("spec\n") },
    courseBrief: { path: "specs/batman/course.md", bytes: Buffer.from("course\n") },
  };
  const state = Buffer.from(`${JSON.stringify({
    schema: "pipeline.state.v0",
    activeFeature: { id: "batman", planPath: authority.prd.path, phase: "implementation" },
  })}\n`);
  const instruction = {
    schema: INSTRUCTION_SCHEMA,
    attributedBy: "po",
    expiresAt: "2026-07-18T23:00:00.000Z",
    finalGate: FINAL_GATE,
    feature: { id: "batman", ref: "refs/heads/feat/batman" },
    base: { commit: "a".repeat(40), tree: "b".repeat(40), objectFormat: "sha1" },
    statePreimageSha256: sha256Raw(state),
    authority: Object.fromEntries(Object.entries(authority).map(([key, value]) => [key, {
      path: value.path, sha256: sha256Raw(value.bytes),
    }])),
    packages: ["pipeline-core"],
    pathAllowlist: { read: ["plugins/pipeline-core"], write: ["plugins/pipeline-core/lib"] },
    surface: {
      provider: "claude", adapterId: SUPPORTED_ADAPTER, adapterSha256: sha256Raw(DEFINITION),
      tools: [...SUPPORTED_TOOLS], toolInventorySha256: sha256Canonical(SUPPORTED_TOOLS),
    },
    budgets: { entries: 2, files: 2, bytes: 2048 },
    deny: [...REQUIRED_DENY_SET],
  };
  return prepareAfkActivation({
    instruction, activationId: "c".repeat(32), activatedAt: "2026-07-18T20:00:00.000Z",
    statePreimage: state, authority,
    surface: { provider: "claude", adapterId: SUPPORTED_ADAPTER, adapterBytes: DEFINITION, tools: [...SUPPORTED_TOOLS] },
    git: {
      objectFormat: "sha1", head: instruction.base.commit, tree: instruction.base.tree,
      indexTree: instruction.base.tree, worktreeTree: instruction.base.tree,
      detached: true, clean: true, featureRefCheckouts: 0,
      worktreeInventory: Buffer.from("inventory\0"), worktreeCount: 1,
    },
  }).receipt;
}

function envelope() {
  return {
    receipt: receipt(), sequence: 1, dispatchId: "dispatch-001", attempt: 1,
    current: CURRENT, prior: null,
    readSnapshot: [{
      path: "plugins/pipeline-core/lib/target.mjs", mode: "100644",
      blobOid: "f".repeat(40), sha256: sha256Raw("before\n"),
    }],
  };
}

function proposal(request) {
  const content = Buffer.from("after\n");
  return createAfkWorkerResult({
    finding: { id: "finding-001", failureSignature: sha256Raw("failure") },
    options: [
      { id: "apply", title: "Apply", reason: "Evidence supports it.", effect: "Corrected.", rejectionConsequence: "Remains.", recommended: true },
      { id: "no-change", title: "No change", reason: "Use if blocked.", effect: "Unchanged.", rejectionConsequence: "Correction proceeds.", recommended: false },
    ],
    recommendation: "apply", provisionalChoice: "apply",
    writes: [{
      operation: "put", path: "plugins/pipeline-core/lib/target.mjs",
      baseMode: "100644", baseBlobOid: "f".repeat(40), resultMode: "100644",
      resultContentBase64: content.toString("base64"), resultSha256: sha256Raw(content),
    }],
  }, request).result;
}

async function prepared(overrides = {}) {
  let stored = null;
  const outcome = await prepareClaudeWorker(envelope(), {
    root: "/trusted/repository",
    adapterBytes: DEFINITION,
    observeCurrent: async () => structuredClone(CURRENT),
    storePrepared: async (request) => { stored = structuredClone(request); },
    ...overrides,
  });
  return { outcome, stored };
}

test("agent definition exposes exactly Read, Grep and Glob without hidden capability fields", () => {
  assert.equal(validateClaudeWorkerDefinition(DEFINITION), true);
  assert.equal(validateClaudeWorkerDefinition(Buffer.from(DEFINITION.toString().replace(
    "tools: Read, Grep, Glob", "tools: Read, Grep, Glob, Bash",
  ))), false);
  assert.equal(validateClaudeWorkerDefinition(Buffer.from(DEFINITION.toString().replace(
    "maxTurns: 20", "maxTurns: 20\nmemory: project",
  ))), false);
});

test("prepare validates receipt, exact definition digest and observed private ref before storage", async () => {
  const { outcome, stored } = await prepared();
  assert.equal(outcome.ok, true);
  assert.equal(outcome.code, "AFK-WORKER-REQUEST-PREPARED");
  assert.equal(stored.requestSha256, outcome.request.requestSha256);
  assert.equal(stored.adapter.sha256, sha256Raw(DEFINITION));
});

test("definition or private-ref drift prevents prepared request creation", async () => {
  assert.equal((await prepared({ adapterBytes: Buffer.concat([DEFINITION, Buffer.from(" ")]) })).outcome.code,
    "AFK-WORKER-SURFACE-DRIFT");
  assert.equal((await prepared({ observeCurrent: async () => ({ ...CURRENT, tree: "0".repeat(40) }) })).outcome.code,
    "AFK-WORKER-SURFACE-DRIFT");
});

test("finalize accepts only canonical result and records one A3 proposal", async () => {
  const { stored } = await prepared();
  const calls = [];
  const result = proposal(stored);
  const outcome = await finalizeClaudeWorker(canonicalJsonFile(result), stored.requestSha256, {
    root: "/trusted/repository",
    adapterBytes: DEFINITION,
    loadPrepared: async () => structuredClone(stored),
    observeCurrent: async () => structuredClone(CURRENT),
    entryTransaction: async (input) => { calls.push(input); return { ok: true, status: "entry-applied" }; },
  });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.status, "entry-applied");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].proposal.resultSha256, result.resultSha256);
});

test("noncanonical, malformed and oversize results never invoke A3", async () => {
  const { stored } = await prepared();
  let transactions = 0;
  const deps = {
    root: "/trusted/repository", adapterBytes: DEFINITION,
    loadPrepared: async () => stored, observeCurrent: async () => CURRENT,
    entryTransaction: async () => { transactions += 1; return { ok: true }; },
  };
  const result = proposal(stored);
  assert.equal((await finalizeClaudeWorker(`${JSON.stringify(result)}\n`, stored.requestSha256, deps)).code,
    "AFK-WORKER-RESULT-INVALID");
  assert.equal((await finalizeClaudeWorker(Buffer.alloc(512 * 1024 + 1, 0x61), stored.requestSha256, deps)).code,
    "AFK-WORKER-RESULT-INVALID");
  assert.equal(transactions, 0);
});

test("stale definition/current and missing A3 integration fail closed", async () => {
  const { stored } = await prepared();
  const result = canonicalJsonFile(proposal(stored));
  assert.equal((await finalizeClaudeWorker(result, stored.requestSha256, {
    root: "/trusted/repository", adapterBytes: DEFINITION,
    loadPrepared: async () => stored, observeCurrent: async () => ({ ...CURRENT, commit: "0".repeat(40) }),
  })).code, "AFK-WORKER-SURFACE-DRIFT");
  assert.equal((await finalizeClaudeWorker(result, stored.requestSha256, {
    root: "/trusted/repository", adapterBytes: DEFINITION,
    loadPrepared: async () => stored, observeCurrent: async () => CURRENT,
  })).code, "AFK-PROJECTION-WRITER-UNAVAILABLE");
});

test("host passes shell-looking file content only as inert base64 proposal data", async () => {
  const { stored } = await prepared();
  const hostile = Buffer.from("$(touch /tmp/nope); `whoami`; rm -rf -- /\n");
  const input = proposal(stored);
  input.writes[0].resultContentBase64 = hostile.toString("base64");
  input.writes[0].resultSha256 = sha256Raw(hostile);
  const recreated = createAfkWorkerResult({
    finding: input.finding, options: input.options, recommendation: input.recommendation,
    provisionalChoice: input.provisionalChoice, writes: input.writes,
  }, stored);
  assert.equal(recreated.ok, true);
  assert.equal(Buffer.from(recreated.result.writes[0].resultContentBase64, "base64").equals(hostile), true);
});
