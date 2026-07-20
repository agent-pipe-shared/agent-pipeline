// SPDX-License-Identifier: Apache-2.0
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

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
import { createAfkWorkerResult } from "./afk-capability-worker.mjs";
import {
  executeAfkActivationHostTransaction,
  executeAfkReviewHostTransaction,
} from "./afk-transaction-host.mjs";
import { canonicalJsonFile } from "./afk-assumption-mode.mjs";
import { finalizeClaudeWorker, prepareClaudeWorker, validateClaudeWorkerDefinition } from "../scripts/afk-claude-host.mjs";

const ACTIVATION = "d".repeat(32);
const ADAPTER = Buffer.from(`---\nname: afk-claude-worker\ntools: Read, Grep, Glob\n---\nReturn closed JSON only.\n`);
const BEFORE = Buffer.from("before\n");
const FIRST = Buffer.from("first provisional\n");
const SECOND = Buffer.from("second rejected\n");

function git(root, ...args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
    },
  }).trim();
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "afk-host-e2e-"));
  execFileSync("git", ["init", "-b", "feat/batman", root]);
  git(root, "config", "user.name", "Host Test");
  git(root, "config", "user.email", "host@example.invalid");
  mkdirSync(join(root, "plugins/pipeline-core/agents"), { recursive: true });
  mkdirSync(join(root, "plugins/pipeline-core/lib"), { recursive: true });
  writeFileSync(join(root, "plugins/pipeline-core/agents/afk-claude-worker.md"), ADAPTER);
  writeFileSync(join(root, "plugins/pipeline-core/lib/target.mjs"), BEFORE);
  git(root, "add", ".");
  git(root, "commit", "-m", "base");
  const baseCommit = git(root, "rev-parse", "HEAD");
  const baseTree = git(root, "rev-parse", "HEAD^{tree}");
  git(root, "checkout", "--detach", baseCommit);
  const files = {
    prd: { path: "specs/batman/prd.md", bytes: Buffer.from("prd\n") },
    spec: { path: "specs/batman/spec.md", bytes: Buffer.from("spec\n") },
    courseBrief: { path: "specs/batman/course.md", bytes: Buffer.from("course\n") },
  };
  const statePreimage = Buffer.from(`${JSON.stringify({
    schema: "pipeline.state.v0",
    activeFeature: { id: "batman", planPath: files.prd.path, phase: "implementation" },
  })}\n`);
  const instruction = {
    schema: INSTRUCTION_SCHEMA,
    attributedBy: "po",
    expiresAt: "2026-07-18T23:00:00.000Z",
    finalGate: FINAL_GATE,
    feature: { id: "batman", ref: "refs/heads/feat/batman" },
    base: { commit: baseCommit, tree: baseTree, objectFormat: "sha1" },
    statePreimageSha256: sha256Raw(statePreimage),
    authority: Object.fromEntries(Object.entries(files).map(([key, value]) => [key, { path: value.path, sha256: sha256Raw(value.bytes) }])),
    packages: ["pipeline-core"],
    pathAllowlist: { read: ["plugins/pipeline-core"], write: ["plugins/pipeline-core/lib"] },
    surface: {
      provider: "claude", adapterId: SUPPORTED_ADAPTER, adapterSha256: sha256Raw(ADAPTER),
      tools: [...SUPPORTED_TOOLS], toolInventorySha256: sha256Canonical(SUPPORTED_TOOLS),
    },
    budgets: { entries: 3, files: 2, bytes: 4096 },
    deny: [...REQUIRED_DENY_SET],
  };
  const receipt = prepareAfkActivation({
    instruction,
    activationId: ACTIVATION,
    activatedAt: "2026-07-18T20:00:00.000Z",
    statePreimage,
    authority: files,
    surface: { provider: "claude", adapterId: SUPPORTED_ADAPTER, adapterBytes: ADAPTER, tools: [...SUPPORTED_TOOLS] },
    git: {
      objectFormat: "sha1", head: baseCommit, tree: baseTree, indexTree: baseTree, worktreeTree: baseTree,
      detached: true, clean: true, featureRefCheckouts: 0, worktreeInventory: Buffer.from("inventory\0"), worktreeCount: 1,
    },
  }).receipt;
  return { root, baseCommit, baseTree, receipt };
}

function snapshot(repository, commit, bytes) {
  const path = "plugins/pipeline-core/lib/target.mjs";
  return [{ path, mode: "100644", blobOid: git(repository.root, "rev-parse", `${commit}:${path}`), sha256: sha256Raw(bytes) }];
}

test("A2 host finalization drives A3 private commits and A4 keeps a rejected suffix out of feature history", () => {
  const repository = fixture();
  const projections = [];
  const refreshProjection = (value) => { projections.push(value); };
  const activated = executeAfkActivationHostTransaction({
    root: repository.root,
    receipt: repository.receipt,
    recordedAt: "2026-07-18T20:00:00.000Z",
    refreshProjection,
  });
  assert.equal(activated.ok, true);
  assert.equal(git(repository.root, "rev-parse", `refs/agent-pipeline/afk/${ACTIVATION}`), repository.baseCommit);

  const firstPrepared = prepareClaudeWorker({
    receipt: repository.receipt,
    sequence: 1,
    dispatchId: "dispatch-1",
    attempt: 1,
    current: { commit: repository.baseCommit, tree: repository.baseTree, objectFormat: "sha1" },
    prior: null,
    readSnapshot: snapshot(repository, repository.baseCommit, BEFORE),
  }, { root: repository.root });
  return Promise.resolve(firstPrepared).then(async (preparedOne) => {
    assert.equal(preparedOne.ok, true);
    const resultOne = createAfkWorkerResult({
      finding: { id: "finding-1", failureSignature: sha256Raw("failure-1") },
      options: [
        { id: "apply", title: "Apply", reason: "Evidence supports it.", effect: "First content.", rejectionConsequence: "Base remains.", recommended: true },
        { id: "reject", title: "Reject", reason: "Contrary evidence.", effect: "Base remains.", rejectionConsequence: "First applies.", recommended: false },
      ],
      recommendation: "apply", provisionalChoice: "apply",
      writes: [{
        operation: "put", path: "plugins/pipeline-core/lib/target.mjs", baseMode: "100644",
        baseBlobOid: git(repository.root, "rev-parse", `${repository.baseCommit}:plugins/pipeline-core/lib/target.mjs`),
        resultMode: "100644", resultContentBase64: FIRST.toString("base64"), resultSha256: sha256Raw(FIRST),
      }],
    }, preparedOne.request).result;
    assert.equal(validateClaudeWorkerDefinition(readFileSync(join(repository.root, "plugins/pipeline-core/agents/afk-claude-worker.md"))), true);
    assert.equal(sha256Raw(readFileSync(join(repository.root, "plugins/pipeline-core/agents/afk-claude-worker.md"))), preparedOne.request.adapter.sha256);
    assert.equal(git(repository.root, "rev-parse", `refs/agent-pipeline/afk/${ACTIVATION}`), preparedOne.request.current.commit);
    assert.equal(git(repository.root, "rev-parse", `refs/agent-pipeline/afk/${ACTIVATION}^{tree}`), preparedOne.request.current.tree);
    const finalizedOne = await finalizeClaudeWorker(canonicalJsonFile(resultOne), preparedOne.request.requestSha256, {
      root: repository.root, refreshProjection, now: () => new Date("2026-07-18T20:05:00.000Z"),
    });
    assert.equal(finalizedOne.ok, true, JSON.stringify(finalizedOne));
    const firstCommit = git(repository.root, "rev-parse", `refs/agent-pipeline/afk/${ACTIVATION}`);
    assert.notEqual(firstCommit, repository.baseCommit);

    const firstTree = git(repository.root, "rev-parse", `${firstCommit}^{tree}`);
    const preparedTwo = await prepareClaudeWorker({
      receipt: repository.receipt,
      sequence: 2,
      dispatchId: "dispatch-2",
      attempt: 1,
      current: { commit: firstCommit, tree: firstTree, objectFormat: "sha1" },
      prior: { entryId: "entry-000001", resultSha256: resultOne.resultSha256 },
      readSnapshot: snapshot(repository, firstCommit, FIRST),
    }, { root: repository.root });
    assert.equal(preparedTwo.ok, true);
    const resultTwo = createAfkWorkerResult({
      finding: { id: "finding-2", failureSignature: sha256Raw("failure-2") },
      options: [
        { id: "apply", title: "Apply", reason: "Evidence supports it.", effect: "Second content.", rejectionConsequence: "First remains.", recommended: true },
        { id: "reject", title: "Reject", reason: "Contrary evidence.", effect: "First remains.", rejectionConsequence: "Second applies.", recommended: false },
      ],
      recommendation: "apply", provisionalChoice: "apply",
      writes: [{
        operation: "put", path: "plugins/pipeline-core/lib/target.mjs", baseMode: "100644",
        baseBlobOid: git(repository.root, "rev-parse", `${firstCommit}:plugins/pipeline-core/lib/target.mjs`),
        resultMode: "100644", resultContentBase64: SECOND.toString("base64"), resultSha256: sha256Raw(SECOND),
      }],
    }, preparedTwo.request).result;
    const finalizedTwo = await finalizeClaudeWorker(canonicalJsonFile(resultTwo), preparedTwo.request.requestSha256, {
      root: repository.root, refreshProjection, now: () => new Date("2026-07-18T20:10:00.000Z"),
    });
    assert.equal(finalizedTwo.ok, true, JSON.stringify(finalizedTwo));
    const secondCommit = git(repository.root, "rev-parse", `refs/agent-pipeline/afk/${ACTIVATION}`);
    assert.equal(git(repository.root, "show", `${secondCommit}:plugins/pipeline-core/lib/target.mjs`), "second rejected");
    assert.equal(git(repository.root, "rev-parse", "refs/heads/feat/batman"), repository.baseCommit);

    const reviewed = executeAfkReviewHostTransaction({
      root: repository.root,
      activationId: ACTIVATION,
      reviewInput: {
        reviewId: "review-1",
        cause: "explicit-review",
        attributedBy: "po",
        reviewedAt: "2026-07-18T21:00:00.000Z",
        dispositions: [
          { entryId: "entry-000001", sequence: 1, decision: "accept" },
          { entryId: "entry-000002", sequence: 2, decision: "reject" },
        ],
      },
      refreshProjection,
    });
    assert.equal(reviewed.ok, true, JSON.stringify(reviewed));
    assert.equal(git(repository.root, "rev-parse", "refs/heads/feat/batman"), firstCommit);
    assert.equal(git(repository.root, "show", `refs/heads/feat/batman:plugins/pipeline-core/lib/target.mjs`), "first provisional");
    assert.equal(git(repository.root, "rev-parse", `refs/agent-pipeline/afk/${ACTIVATION}`), secondCommit);
    assert.equal(projections.at(-1).status, "complete");
  });
});

test("production defaults fail closed before WAL when the protected projection writer is not integrated", async () => {
  const repository = fixture();
  const outcome = executeAfkActivationHostTransaction({
    root: repository.root,
    receipt: repository.receipt,
    recordedAt: "2026-07-18T20:00:00.000Z",
  });
  assert.equal(outcome.code, "AFK-PROJECTION-WRITER-UNAVAILABLE");
  assert.throws(() => git(repository.root, "show-ref", `refs/agent-pipeline/afk/${ACTIVATION}`));
});
