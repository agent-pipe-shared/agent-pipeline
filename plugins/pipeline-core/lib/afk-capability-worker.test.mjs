// SPDX-License-Identifier: SUL-1.0
import test from "node:test";
import assert from "node:assert/strict";

import {
  FINAL_GATE,
  INSTRUCTION_SCHEMA,
  REQUIRED_DENY_SET,
  SUPPORTED_ADAPTER,
  SUPPORTED_TOOLS,
  prepareAfkActivation,
  sha256Canonical,
  sha256Raw,
} from "./afk-assumption-mode.mjs";
import {
  createAfkWorkerRequest,
  createAfkWorkerResult,
  validateAfkWorkerRequest,
  validateAfkWorkerResult,
} from "./afk-capability-worker.mjs";

const ADAPTER = Buffer.from("bounded claude worker\n");
const EXISTING = Buffer.from("before\n");
const AFTER = Buffer.from("after\n");

function activation(bytes = 1024) {
  const authority = {
    prd: { path: "specs/batman/prd.md", bytes: Buffer.from("prd\n") },
    spec: { path: "specs/batman/spec.md", bytes: Buffer.from("spec\n") },
    courseBrief: { path: "specs/batman/course.md", bytes: Buffer.from("course\n") },
  };
  const statePreimage = Buffer.from(`${JSON.stringify({
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
    statePreimageSha256: sha256Raw(statePreimage),
    authority: Object.fromEntries(Object.entries(authority).map(([key, value]) => [key, {
      path: value.path, sha256: sha256Raw(value.bytes),
    }])),
    packages: ["pipeline-core"],
    pathAllowlist: {
      read: ["plugins/pipeline-core", "specs/batman"],
      write: ["plugins/pipeline-core/lib", "plugins/pipeline-core/scripts"],
    },
    surface: {
      provider: "claude",
      adapterId: SUPPORTED_ADAPTER,
      adapterSha256: sha256Raw(ADAPTER),
      tools: [...SUPPORTED_TOOLS],
      toolInventorySha256: sha256Canonical(SUPPORTED_TOOLS),
    },
    budgets: { entries: 2, files: 3, bytes },
    deny: [...REQUIRED_DENY_SET],
  };
  return prepareAfkActivation({
    instruction,
    activationId: "c".repeat(32),
    activatedAt: "2026-07-18T20:00:00.000Z",
    statePreimage,
    authority,
    surface: { provider: "claude", adapterId: SUPPORTED_ADAPTER, adapterBytes: ADAPTER, tools: [...SUPPORTED_TOOLS] },
    git: {
      objectFormat: "sha1", head: instruction.base.commit, tree: instruction.base.tree,
      indexTree: instruction.base.tree, worktreeTree: instruction.base.tree,
      detached: true, clean: true, featureRefCheckouts: 0,
      worktreeInventory: Buffer.from("worktree inventory\0"), worktreeCount: 1,
    },
  }).receipt;
}

function request(bytes = 1024) {
  return createAfkWorkerRequest({
    receipt: activation(bytes),
    sequence: 1,
    dispatchId: "dispatch-001",
    attempt: 1,
    current: { commit: "d".repeat(40), tree: "e".repeat(40), objectFormat: "sha1" },
    readSnapshot: [{
      path: "plugins/pipeline-core/lib/target.mjs",
      mode: "100644",
      blobOid: "f".repeat(40),
      sha256: sha256Raw(EXISTING),
    }],
    adapterSha256: sha256Raw(ADAPTER),
  }).request;
}

function proposal(overrides = {}) {
  return {
    finding: { id: "finding-001", failureSignature: sha256Raw("stable failure") },
    options: [
      {
        id: "apply", title: "Apply bounded change", reason: "The evidence supports it.",
        effect: "The local defect is corrected.", rejectionConsequence: "The defect remains.", recommended: true,
      },
      {
        id: "no-change", title: "Leave unchanged", reason: "Use when evidence is incomplete.",
        effect: "No repository bytes change.", rejectionConsequence: "The bounded correction proceeds.", recommended: false,
      },
    ],
    recommendation: "apply",
    provisionalChoice: "apply",
    writes: [{
      operation: "put",
      path: "plugins/pipeline-core/lib/target.mjs",
      baseMode: "100644",
      baseBlobOid: "f".repeat(40),
      resultMode: "100644",
      resultContentBase64: AFTER.toString("base64"),
      resultSha256: sha256Raw(AFTER),
    }],
    ...overrides,
  };
}

function valid() {
  return createAfkWorkerResult(proposal(), request()).result;
}

test("closed request binds activation, adapter, snapshot and budgets", () => {
  const value = request();
  assert.equal(validateAfkWorkerRequest(value).ok, true);
  assert.equal(value.activationReceiptSha256, activation().receiptSha256);
  assert.deepEqual(value.adapter.tools, ["Glob", "Grep", "Read"]);
  assert.equal(value.budgets.bytes, 1024);
});

test("one valid recommendation returns only an inert bounded proposal", () => {
  const checked = createAfkWorkerResult(proposal(), request());
  assert.equal(checked.ok, true);
  assert.equal(checked.totalBytes, AFTER.length);
  assert.equal(checked.proposal.recommendation, "apply");
  assert.equal(Object.hasOwn(checked.proposal, "command"), false);
});

test("unknown or process-shaped fields fail the closed result", () => {
  for (const extra of [{ command: "git status" }, { argv: ["node"] }, { url: "https://invalid" }]) {
    const changed = { ...valid(), ...extra };
    assert.equal(validateAfkWorkerResult(changed, request()).code, "AFK-WORKER-RESULT-INVALID");
  }
});

test("recommendation must equal the sole recommended option and provisional choice", () => {
  assert.equal(createAfkWorkerResult(proposal({ recommendation: "no-change" }), request()).code,
    "AFK-WORKER-RESULT-INVALID");
  assert.equal(createAfkWorkerResult(proposal({ provisionalChoice: "no-change" }), request()).code,
    "AFK-WORKER-RESULT-INVALID");
  const options = structuredClone(proposal().options);
  options[1].recommended = true;
  assert.equal(createAfkWorkerResult(proposal({ options }), request()).code, "AFK-WORKER-RESULT-INVALID");
});

test("write paths outside the receipt allowlist and prefix conflicts fail", () => {
  const outside = structuredClone(proposal().writes);
  outside[0].path = "docs/target.md";
  assert.equal(createAfkWorkerResult(proposal({ writes: outside }), request()).code, "AFK-WORKER-WRITE-INVALID");

  const prefix = structuredClone(proposal().writes);
  prefix.push({
    operation: "put", path: `${prefix[0].path}/child`, baseMode: null, baseBlobOid: null,
    resultMode: "100644", resultContentBase64: AFTER.toString("base64"), resultSha256: sha256Raw(AFTER),
  });
  assert.equal(createAfkWorkerResult(proposal({ writes: prefix }), request()).code, "AFK-WORKER-RESULT-INVALID");
});

test("existing mode and base blob are immutable", () => {
  for (const mutation of [
    (write) => { write.baseBlobOid = "1".repeat(40); },
    (write) => { write.resultMode = "100755"; },
    (write) => { write.baseMode = null; },
  ]) {
    const writes = structuredClone(proposal().writes);
    mutation(writes[0]);
    assert.equal(createAfkWorkerResult(proposal({ writes }), request()).code, "AFK-WORKER-WRITE-INVALID");
  }
});

test("new files are regular 100644 and deletes bind the exact base", () => {
  const created = [{
    operation: "put", path: "plugins/pipeline-core/scripts/new.json", baseMode: null, baseBlobOid: null,
    resultMode: "100644", resultContentBase64: AFTER.toString("base64"), resultSha256: sha256Raw(AFTER),
  }];
  assert.equal(createAfkWorkerResult(proposal({ writes: created }), request()).ok, true);
  created[0].resultMode = "100755";
  assert.equal(createAfkWorkerResult(proposal({ writes: created }), request()).code, "AFK-WORKER-WRITE-INVALID");

  const deleted = [{
    operation: "delete", path: "plugins/pipeline-core/lib/target.mjs", baseMode: "100644",
    baseBlobOid: "f".repeat(40), resultMode: null, resultContentBase64: null, resultSha256: null,
  }];
  assert.equal(createAfkWorkerResult(proposal({ writes: deleted }), request()).ok, true);
});

test("content digest, canonical base64 and byte budget are enforced", () => {
  const writes = structuredClone(proposal().writes);
  writes[0].resultSha256 = "0".repeat(64);
  assert.equal(createAfkWorkerResult(proposal({ writes }), request()).code, "AFK-WORKER-WRITE-INVALID");

  assert.equal(createAfkWorkerResult(proposal(), request(1)).code, "AFK-WORKER-BUDGET-EXCEEDED");
});

test("one-byte request or result digest drift is rejected", () => {
  const req = request();
  req.attempt += 1;
  assert.equal(validateAfkWorkerRequest(req).ok, false);
  const result = valid();
  result.finding.failureSignature = "0".repeat(64);
  assert.equal(validateAfkWorkerResult(result, request()).code, "AFK-WORKER-RESULT-DIGEST-MISMATCH");
});
