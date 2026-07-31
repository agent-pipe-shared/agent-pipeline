#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/* Integration proof for Batman decision 7A. Most cases drive the sanctioned
 * State writer directly; one closed fixture runs the fixed executor against a
 * disposable local bare remote and verifies exact reconciliation. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { run, statePath } from "./pipeline-state.mjs";
import {
  beginPublicationExecutionAuthority,
} from "../../plugins/pipeline-core/lib/publication-authority.mjs";
import {
  publicationRemoteFingerprint,
  publicationRepositoryFingerprint,
} from "../../plugins/pipeline-core/scripts/publication-executor.mjs";

const oid = (character, length = 40) => character.repeat(length);
const sha = (value) => createHash("sha256").update(value).digest("hex");
const evidence = (name) => ({ path: `evidence/${name}.json`, rawDigest: sha(name), commit: oid("e"), tree: oid("f") });
const command = ["git", "push", "--porcelain", "origin", `${oid("e")}:refs/heads/main`];
const guardPath = fileURLToPath(new URL("../../plugins/pipeline-core/hooks/guard-push.mjs", import.meta.url));
const executorPath = fileURLToPath(new URL("../../plugins/pipeline-core/scripts/publication-executor.mjs", import.meta.url));
const prepareInput = (transactionId) => ({
  channel: "private", transactionId, repositoryFingerprint: oid("a", 64), sourceCommit: oid("b"), sourceTree: oid("c"),
  remoteFingerprint: oid("d", 64), remoteName: "origin", destinationRef: "refs/heads/main", remotePreimageOid: oid("d"),
  candidateOid: oid("e"), candidateTree: oid("f"), ancestry: { baseOid: oid("d"), candidateOid: oid("e"), descends: true },
  identityProbe: evidence("i"), verifyEvidence: evidence("v"), securityEvidence: evidence("g"),
});

const root = mkdtempSync(join(tmpdir(), "publication-state-authority-"));
const deps = { dir: root, gitCommonDir: () => ({ ok: true, path: root }), now: () => "2026-07-18T20:00:00.000Z" };
let count = 0;
function check(name, fn) { fn(); count++; }
function state() { return JSON.parse(readFileSync(statePath(root), "utf8")); }
function writeRequest(value) { writeFileSync(join(root, "request.json"), `${JSON.stringify(value)}\n`, { mode: 0o600 }); }
function invoke(sub, request, overrides = {}) {
  writeRequest(request);
  return run([sub, "--request-file", "request.json"], { ...deps, ...overrides });
}
function request(transactionId, expectedRevision, expectedStateSha256, input) {
  return { schema: "pipeline.publication-command.v1", transactionId, expectedRevision, expectedStateSha256, input };
}

const recovery = "state-writer-recovery";
check("exact retry repairs State after only the local authority became durable", () => {
  const initial = request(recovery, "absent", null, prepareInput(recovery));
  assert.equal(invoke("publication-prepare", initial, { renameSync: () => { throw new Error("injected State rename fault"); } }), 2);
  assert.equal(invoke("publication-prepare", initial), 0);
  assert.equal(state().publication.channels.private.transactionId, recovery);
});

const first = "state-writer-1";
check("State writer persists only a redacted prepared reference", () => {
  assert.equal(invoke("publication-prepare", request(first, "absent", null, prepareInput(first))), 0);
  const publication = state().publication;
  assert.equal(publication.schema, "pipeline.publication-projection.v1");
  assert.equal(publication.channels.private.phase, "prepared");
  assert.equal(JSON.stringify(publication).includes("remoteFingerprint"), false);
  assert.deepEqual(publication.authorizedPushes, []);
});
let reference = state().publication.channels.private;
check("State writer records a candidate-bound single authorization", () => {
  assert.equal(invoke("publication-approve", request(first, 0, reference.publicationStateSha256, {
    approvalId: "po-1", attribution: "PO", approvedAt: 1_000, expiresAt: 901_000,
  })), 0);
  reference = state().publication.channels.private;
  assert.equal(invoke("publication-authorize", request(first, 1, reference.publicationStateSha256, { now: 2_000, command })), 0);
  const publication = state().publication;
  const authorization = publication.authorizedPushes[0];
  assert.equal(publication.channels.private.phase, "push-authorized");
  assert.equal(authorization.stateDigest, publication.channels.private.publicationStateSha256);
  assert.deepEqual(authorization.command, command);
});

check("Push Guard rejects raw Git even for the State-Writer's exact legacy projection tuple", () => {
  assert.equal(spawnSync("git", ["init", "-q"], { cwd: root }).status, 0);
  const guard = (pushCommand) => spawnSync(process.execPath, [guardPath], {
    cwd: root,
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command: pushCommand } }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  const exact = guard(command.join(" "));
  assert.equal(exact.status, 2, exact.stderr);
  assert.match(exact.stderr, /raw Bash\/Git cannot (?:consume publication authority|publish refs\/heads\/main)/u);
  assert.match(exact.stderr, /publication executor/u);
  const shapedDifferently = guard(`git push --porcelain --verbose origin ${command[4]}`);
  assert.equal(shapedDifferently.status, 2);
  assert.match(shapedDifferently.stderr, /publication (?:mode|boundary)/);
});

check("a pending authorization cannot be orphaned by another transaction", () => {
  const before = readFileSync(statePath(root), "utf8");
  assert.equal(invoke("publication-prepare", request("conflict", "absent", null, prepareInput("conflict"))), 2);
  assert.equal(readFileSync(statePath(root), "utf8"), before);
});

check("State reconciliation projects an executing envelope and removes the legacy raw-push authorization", () => {
  const before = state().publication.channels.private;
  const beforeRejected = readFileSync(statePath(root), "utf8");
  assert.equal(invoke("publication-reconcile", request(first, 2, before.publicationStateSha256, {
    authorityRawSha256: before.projectionRawSha256,
  })), 2);
  assert.equal(readFileSync(statePath(root), "utf8"), beforeRejected);
  const executing = beginPublicationExecutionAuthority({
    gitCommonDir: root,
    transactionId: first,
    channel: "private",
    expectedRawSha256: before.projectionRawSha256,
    expectedRevision: 2,
    expectedStateSha256: before.publicationStateSha256,
    attemptId: "1".repeat(32),
    executorSha256: "2".repeat(64),
    startedAt: 3_000,
  });
  assert.equal(executing.record.status, "executing");
  assert.equal(invoke("publication-reconcile", request(first, 2, before.publicationStateSha256, {
    authorityRawSha256: executing.rawDigest,
  })), 0);
  const publication = state().publication;
  assert.equal(publication.channels.private.projectionRawSha256, executing.rawDigest);
  assert.equal(publication.channels.private.phase, "push-authorized");
  assert.deepEqual(publication.authorizedPushes, []);
});

check("a malformed State cannot fall back from publication uncertainty to standing approval", () => {
  writeFileSync(statePath(root), "{ malformed publication State\n", { mode: 0o600 });
  const result = spawnSync(process.execPath, [guardPath], {
    cwd: root,
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command: command.join(" ") } }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /publication (?:mode.*malformed|boundary)/i);
});

check("fixed executor publishes to a disposable remote and consumed authority reconciles exactly once", () => {
  const parent = mkdtempSync(join(tmpdir(), "publication-state-executor-"));
  const remote = join(parent, "remote.git");
  const work = join(parent, "work");
  const git = (cwd, ...args) => spawnSync("git", args, { cwd, encoding: "utf8" });
  try {
    mkdirSync(work);
    assert.equal(git(parent, "init", "--bare", "--quiet", remote).status, 0);
    assert.equal(git(work, "init", "--quiet", "-b", "main").status, 0);
    assert.equal(git(work, "config", "user.email", "publication-state@example.invalid").status, 0);
    assert.equal(git(work, "config", "user.name", "Publication State Fixture").status, 0);
    writeFileSync(join(work, "base.txt"), "base\n");
    assert.equal(git(work, "add", "base.txt").status, 0);
    assert.equal(git(work, "commit", "--quiet", "-m", "base").status, 0);
    const base = git(work, "rev-parse", "HEAD").stdout.trim();
    assert.equal(git(work, "remote", "add", "origin", remote).status, 0);
    assert.equal(git(work, "push", "--quiet", "origin", `${base}:refs/heads/main`).status, 0);
    writeFileSync(join(work, "candidate.txt"), "candidate\n");
    assert.equal(git(work, "add", "candidate.txt").status, 0);
    assert.equal(git(work, "commit", "--quiet", "-m", "candidate").status, 0);
    const candidate = git(work, "rev-parse", "HEAD").stdout.trim();
    const tree = git(work, "rev-parse", "HEAD^{tree}").stdout.trim();
    const common = realpathSync(join(work, ".git"));
    mkdirSync(join(work, "evidence"));
    const boundEvidence = {};
    for (const [key, marker] of [["identityProbe", "identity"], ["verifyEvidence", "verify"], ["securityEvidence", "security"]]) {
      const path = `evidence/${marker}.json`;
      const bytes = `${JSON.stringify({ schema: `fixture.${marker}.v1`, commit: candidate, tree })}\n`;
      writeFileSync(join(work, path), bytes);
      boundEvidence[key] = { path, rawDigest: sha(bytes), commit: candidate, tree };
    }
    const transactionId = "state-executor-disposable";
    const pushUrl = git(work, "remote", "get-url", "--push", "--all", "origin").stdout.trim();
    const input = {
      channel: "private",
      transactionId,
      repositoryFingerprint: publicationRepositoryFingerprint({ root: realpathSync(work), common }),
      sourceCommit: candidate,
      sourceTree: tree,
      remoteFingerprint: publicationRemoteFingerprint("origin", [pushUrl]),
      remoteName: "origin",
      destinationRef: "refs/heads/main",
      remotePreimageOid: base,
      candidateOid: candidate,
      candidateTree: tree,
      ancestry: { baseOid: base, candidateOid: candidate, descends: true },
      ...boundEvidence,
    };
    const workDeps = {
      dir: work,
      now: () => "2026-07-31T08:00:00.000Z",
    };
    const invokeWork = (sub, value) => {
      writeFileSync(join(work, "request.json"), `${JSON.stringify(value)}\n`, { mode: 0o600 });
      return run([sub, "--request-file", "request.json"], workDeps);
    };
    assert.equal(invokeWork("publication-prepare", request(transactionId, "absent", null, input)), 0);
    let projected = JSON.parse(readFileSync(statePath(work), "utf8")).publication.channels.private;
    const approvedAt = Date.now() - 10_000;
    const expiresAt = Date.now() + 120_000;
    assert.equal(invokeWork("publication-approve", request(transactionId, 0, projected.publicationStateSha256, {
      approvalId: "po-state-executor",
      attribution: "PO",
      approvedAt,
      expiresAt,
    })), 0);
    projected = JSON.parse(readFileSync(statePath(work), "utf8")).publication.channels.private;
    assert.equal(invokeWork("publication-authorize", request(transactionId, 1, projected.publicationStateSha256, {
      now: approvedAt + 1,
      command: ["git", "push", "--porcelain", "origin", `${candidate}:refs/heads/main`],
    })), 0);
    const authorizedState = JSON.parse(readFileSync(statePath(work), "utf8"));
    projected = authorizedState.publication.channels.private;
    assert.equal(authorizedState.publication.authorizedPushes.length, 1);

    const executed = spawnSync(process.execPath, [
      executorPath,
      "execute",
      "--root", realpathSync(work),
      "--transaction-id", transactionId,
      "--channel", "private",
      "--expected-authority-sha256", projected.projectionRawSha256,
    ], { cwd: work, encoding: "utf8" });
    assert.equal(executed.status, 0, executed.stderr);
    const receipt = JSON.parse(executed.stdout);
    assert.equal(receipt.status, "closed");
    assert.equal(receipt.pushAttempted, true);
    assert.equal(git(remote, "rev-parse", "refs/heads/main").stdout.trim(), candidate);

    const reconcile = request(transactionId, 2, projected.publicationStateSha256, {
      authorityRawSha256: receipt.authorityRawSha256,
    });
    assert.equal(invokeWork("publication-reconcile", reconcile), 0);
    const reconciled = JSON.parse(readFileSync(statePath(work), "utf8"));
    assert.equal(reconciled.publication.channels.private.phase, "closed");
    assert.equal(reconciled.publication.channels.private.projectionRawSha256, receipt.authorityRawSha256);
    assert.equal(reconciled.publication.channels.private.receiptDigest, receipt.publicationReceiptDigest);
    assert.deepEqual(reconciled.publication.authorizedPushes, []);
    const beforeReplay = readFileSync(statePath(work), "utf8");
    assert.equal(invokeWork("publication-reconcile", reconcile), 0);
    assert.equal(readFileSync(statePath(work), "utf8"), beforeReplay);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

rmSync(root, { recursive: true, force: true });
console.log(`publication-state-authority: ${count} tests passed`);
