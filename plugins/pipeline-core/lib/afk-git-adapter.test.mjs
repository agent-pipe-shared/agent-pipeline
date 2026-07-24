// SPDX-License-Identifier: SUL-1.0
import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
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
import { createAfkWorkerRequest, createAfkWorkerResult } from "./afk-capability-worker.mjs";
import {
  applyAfkEntryPlan,
  executeAfkEntryTransaction,
  observeAfkGitAuthority,
  planAfkEntry,
} from "./afk-git-adapter.mjs";
import { symlinkSkip } from "./symlink-capability.mjs";

const ACTIVATION = "c".repeat(32);
const ADAPTER = Buffer.from("bounded worker\n");
const AFTER = Buffer.from("after\n");
const CREATED = Buffer.from("created without filter\n");

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

function createRepo(objectFormat = "sha1") {
  const root = mkdtempSync(join(tmpdir(), `afk-git-${objectFormat}-`));
  execFileSync("git", ["init", `--object-format=${objectFormat}`, "-b", "feat/batman", root]);
  git(root, "config", "user.name", "Test User");
  git(root, "config", "user.email", "test@example.invalid");
  mkdirSync(join(root, "plugins/pipeline-core/lib"), { recursive: true });
  mkdirSync(join(root, "plugins/pipeline-core/scripts"), { recursive: true });
  writeFileSync(join(root, "plugins/pipeline-core/lib/target.mjs"), "before\n");
  writeFileSync(join(root, "plugins/pipeline-core/lib/delete.mjs"), "delete me\n");
  writeFileSync(join(root, "plugins/pipeline-core/lib/executable.mjs"), "#!/bin/sh\nexit 0\n");
  chmodSync(join(root, "plugins/pipeline-core/lib/executable.mjs"), 0o755);
  symlinkSync("target.mjs", join(root, "plugins/pipeline-core/lib/link.mjs"));
  writeFileSync(join(root, ".gitattributes"), "*.txt filter=hostile\n");
  git(root, "add", ".");
  git(root, "commit", "-m", "base");
  git(root, "config", "filter.hostile.clean", "false");
  git(root, "config", "filter.hostile.required", "true");
  const baseCommit = git(root, "rev-parse", "HEAD");
  const baseTree = git(root, "rev-parse", "HEAD^{tree}");
  git(root, "checkout", "--detach", baseCommit);
  git(root, "update-ref", `refs/agent-pipeline/afk/${ACTIVATION}`, baseCommit);
  return { root, objectFormat, baseCommit, baseTree };
}

function receipt(repo) {
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
    expiresAt: "2026-07-19T00:00:00.000Z",
    finalGate: FINAL_GATE,
    feature: { id: "batman", ref: "refs/heads/feat/batman" },
    base: { commit: repo.baseCommit, tree: repo.baseTree, objectFormat: repo.objectFormat },
    statePreimageSha256: sha256Raw(statePreimage),
    authority: Object.fromEntries(Object.entries(files).map(([key, value]) => [key, { path: value.path, sha256: sha256Raw(value.bytes) }])),
    packages: ["pipeline-core"],
    pathAllowlist: {
      read: ["plugins/pipeline-core"],
      write: ["plugins/pipeline-core/lib", "plugins/pipeline-core/scripts"],
    },
    surface: {
      provider: "claude", adapterId: SUPPORTED_ADAPTER, adapterSha256: sha256Raw(ADAPTER),
      tools: [...SUPPORTED_TOOLS], toolInventorySha256: sha256Canonical(SUPPORTED_TOOLS),
    },
    budgets: { entries: 3, files: 5, bytes: 4096 },
    deny: [...REQUIRED_DENY_SET],
  };
  return prepareAfkActivation({
    instruction,
    activationId: ACTIVATION,
    activatedAt: "2026-07-18T20:00:00.000Z",
    statePreimage,
    authority: files,
    surface: { provider: "claude", adapterId: SUPPORTED_ADAPTER, adapterBytes: ADAPTER, tools: [...SUPPORTED_TOOLS] },
    git: {
      objectFormat: repo.objectFormat, head: repo.baseCommit, tree: repo.baseTree,
      indexTree: repo.baseTree, worktreeTree: repo.baseTree, detached: true, clean: true,
      featureRefCheckouts: 0, worktreeInventory: Buffer.from("inventory\0"), worktreeCount: 1,
    },
  }).receipt;
}

function blob(repo, path) {
  return git(repo.root, "rev-parse", `${repo.baseCommit}:${path}`);
}

function requestAndProposal(repo) {
  const targetPath = "plugins/pipeline-core/lib/target.mjs";
  const deletePath = "plugins/pipeline-core/lib/delete.mjs";
  const request = createAfkWorkerRequest({
    receipt: receipt(repo),
    sequence: 1,
    dispatchId: "dispatch-1",
    attempt: 1,
    current: { commit: repo.baseCommit, tree: repo.baseTree, objectFormat: repo.objectFormat },
    readSnapshot: [
      { path: deletePath, mode: "100644", blobOid: blob(repo, deletePath), sha256: sha256Raw(Buffer.from("delete me\n")) },
      { path: targetPath, mode: "100644", blobOid: blob(repo, targetPath), sha256: sha256Raw(Buffer.from("before\n")) },
    ],
    adapterSha256: sha256Raw(ADAPTER),
  }).request;
  const made = createAfkWorkerResult({
    finding: { id: "finding-1", failureSignature: sha256Raw("failure") },
    options: [
      { id: "apply", title: "Apply", reason: "Evidence is complete.", effect: "Files change.", rejectionConsequence: "Defect remains.", recommended: true },
      { id: "reject", title: "Reject", reason: "Use on contrary evidence.", effect: "No change.", rejectionConsequence: "Proposal applies.", recommended: false },
    ],
    recommendation: "apply",
    provisionalChoice: "apply",
    writes: [
      {
        operation: "delete", path: deletePath, baseMode: "100644", baseBlobOid: blob(repo, deletePath),
        resultMode: null, resultContentBase64: null, resultSha256: null,
      },
      {
        operation: "put", path: targetPath, baseMode: "100644", baseBlobOid: blob(repo, targetPath),
        resultMode: "100644", resultContentBase64: AFTER.toString("base64"), resultSha256: sha256Raw(AFTER),
      },
      {
        operation: "put", path: "plugins/pipeline-core/scripts/new.txt", baseMode: null, baseBlobOid: null,
        resultMode: "100644", resultContentBase64: CREATED.toString("base64"), resultSha256: sha256Raw(CREATED),
      },
    ],
  }, request);
  assert.equal(made.ok, true);
  return { request, proposal: made.proposal };
}

test("planning is read-only and derives one deterministic sorted tree and commit", { skip: symlinkSkip() }, () => {
  const repo = createRepo();
  const { request, proposal } = requestAndProposal(repo);
  const featureBefore = git(repo.root, "rev-parse", "refs/heads/feat/batman");
  const planned = planAfkEntry({
    root: repo.root, request, proposal, entryId: "entry-1", gitTimestamp: "1784404800 +0000",
  });
  assert.equal(planned.ok, true);
  assert.deepEqual(planned.body.writes.map((entry) => entry.path), [
    "plugins/pipeline-core/lib/delete.mjs",
    "plugins/pipeline-core/lib/target.mjs",
    "plugins/pipeline-core/scripts/new.txt",
  ]);
  assert.throws(() => git(repo.root, "cat-file", "-e", planned.body.resultCommit));
  assert.equal(git(repo.root, "rev-parse", `refs/agent-pipeline/afk/${ACTIVATION}`), repo.baseCommit);
  assert.equal(git(repo.root, "rev-parse", "refs/heads/feat/batman"), featureBefore);
});

test("intent precedes all object/ref effects and one CAS moves only the private ref", { skip: symlinkSkip() }, () => {
  const repo = createRepo();
  const { request, proposal } = requestAndProposal(repo);
  const calls = [];
  const featureBefore = git(repo.root, "rev-parse", "refs/heads/feat/batman");
  const outcome = executeAfkEntryTransaction({
    root: repo.root,
    request,
    proposal,
    entryId: "entry-1",
    gitTimestamp: "1784404800 +0000",
    recordedAt: "2026-07-18T20:00:00.000Z",
    appendRecord(type, body) {
      calls.push({ type, body, privateRef: git(repo.root, "rev-parse", `refs/agent-pipeline/afk/${ACTIVATION}`) });
      return { ok: true, sequence: calls.length, headSha256: sha256Raw(type) };
    },
  });
  assert.equal(outcome.ok, true);
  assert.deepEqual(calls.map((entry) => entry.type), ["entry-intent", "entry-applied"]);
  assert.equal(calls[0].privateRef, repo.baseCommit);
  assert.equal(git(repo.root, "rev-parse", `refs/agent-pipeline/afk/${ACTIVATION}`), outcome.intent.resultCommit);
  assert.equal(git(repo.root, "rev-parse", "refs/heads/feat/batman"), featureBefore);
  assert.equal(git(repo.root, "show", `${outcome.intent.resultCommit}:plugins/pipeline-core/lib/target.mjs`), "after");
  assert.throws(() => git(repo.root, "show", `${outcome.intent.resultCommit}:plugins/pipeline-core/lib/delete.mjs`));
  assert.equal(git(repo.root, "show", `${outcome.intent.resultCommit}:plugins/pipeline-core/scripts/new.txt`), "created without filter");
  assert.equal(git(repo.root, "cat-file", "-t", `${outcome.intent.resultCommit}:plugins/pipeline-core/lib/link.mjs`), "blob");
});

test("crash after objects is replayable and exact duplicate performs zero ref write", { skip: symlinkSkip() }, () => {
  const repo = createRepo();
  const { request, proposal } = requestAndProposal(repo);
  const planned = planAfkEntry({ root: repo.root, request, proposal, entryId: "entry-1", gitTimestamp: "1784404800 +0000" });
  const crashed = applyAfkEntryPlan({
    root: repo.root, activationId: ACTIVATION, intent: planned.body,
    fault(stage) { if (stage === "after-commit") throw new Error("crash"); },
  });
  assert.equal(crashed.ok, false);
  assert.equal(git(repo.root, "rev-parse", `refs/agent-pipeline/afk/${ACTIVATION}`), repo.baseCommit);
  assert.equal(git(repo.root, "cat-file", "-t", planned.body.resultCommit), "commit");
  const recovered = applyAfkEntryPlan({ root: repo.root, activationId: ACTIVATION, intent: planned.body });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.status, "applied");
  const duplicate = applyAfkEntryPlan({ root: repo.root, activationId: ACTIVATION, intent: planned.body });
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.status, "duplicate");
  assert.equal(duplicate.mutation, "none");
});

test("ref drift blocks without reset, merge or alternate recovery", { skip: symlinkSkip() }, () => {
  const repo = createRepo();
  const { request, proposal } = requestAndProposal(repo);
  const planned = planAfkEntry({ root: repo.root, request, proposal, entryId: "entry-1", gitTimestamp: "1784404800 +0000" });
  const other = git(repo.root, "commit-tree", repo.baseTree, "-p", repo.baseCommit, "-m", "other");
  git(repo.root, "update-ref", `refs/agent-pipeline/afk/${ACTIVATION}`, other, repo.baseCommit);
  const blocked = applyAfkEntryPlan({ root: repo.root, activationId: ACTIVATION, intent: planned.body });
  assert.equal(blocked.code, "AFK-GIT-REF-CONFLICT");
  assert.equal(git(repo.root, "rev-parse", `refs/agent-pipeline/afk/${ACTIVATION}`), other);
  assert.equal(git(repo.root, "rev-list", "--count", "refs/heads/feat/batman"), "1");
});

test("fault after private-ref CAS is recognized and records the missing applied boundary", { skip: symlinkSkip() }, () => {
  const repo = createRepo();
  const { request, proposal } = requestAndProposal(repo);
  const calls = [];
  const outcome = executeAfkEntryTransaction({
    root: repo.root, request, proposal, entryId: "entry-1", gitTimestamp: "1784404800 +0000",
    recordedAt: "2026-07-18T20:00:00.000Z",
    appendRecord(type) { calls.push(type); return { ok: true }; },
    fault(stage) { if (stage === "after-ref") throw new Error("lost acknowledgement"); },
  });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.status, "applied-unconfirmed");
  assert.deepEqual(calls, ["entry-intent", "entry-applied"]);
});

test("SHA-256 repository uses native 64-hex blobs, trees, commits and CAS", { skip: symlinkSkip() || (() => {
  try {
    const probe = mkdtempSync(join(tmpdir(), "afk-sha256-probe-"));
    execFileSync("git", ["init", "--object-format=sha256", probe], { stdio: "ignore" });
    return false;
  } catch { return true; }
})() }, () => {
  const repo = createRepo("sha256");
  const { request, proposal } = requestAndProposal(repo);
  const planned = planAfkEntry({ root: repo.root, request, proposal, entryId: "entry-1", gitTimestamp: "1784404800 +0000" });
  assert.equal(planned.ok, true);
  assert.equal(planned.body.resultCommit.length, 64);
  assert.equal(planned.body.resultTree.length, 64);
  assert.equal(planned.body.writes.find((entry) => entry.operation === "put").resultBlobOid.length, 64);
  const applied = applyAfkEntryPlan({ root: repo.root, activationId: ACTIVATION, intent: planned.body });
  assert.equal(applied.ok, true);
  assert.equal(observeAfkGitAuthority(repo.root, `refs/agent-pipeline/afk/${ACTIVATION}`).refOid, planned.body.resultCommit);
});
