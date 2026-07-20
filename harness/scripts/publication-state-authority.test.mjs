#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
/* Integration proof for Batman decision 7A.  This deliberately drives the
 * sanctioned State writer; it never invokes Git push or a remote. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { run, statePath } from "./pipeline-state.mjs";

const oid = (character, length = 40) => character.repeat(length);
const sha = (value) => createHash("sha256").update(value).digest("hex");
const evidence = (name) => ({ path: `evidence/${name}.json`, rawDigest: sha(name), commit: oid("e"), tree: oid("f") });
const command = ["git", "push", "--porcelain", "origin", `${oid("e")}:refs/heads/main`];
const guardPath = fileURLToPath(new URL("../../plugins/pipeline-core/hooks/guard-push.mjs", import.meta.url));
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

check("Push Guard accepts only the State-Writer's exact projection tuple", () => {
  assert.equal(spawnSync("git", ["init", "-q"], { cwd: root }).status, 0);
  const guard = (pushCommand) => spawnSync(process.execPath, [guardPath], {
    cwd: root,
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command: pushCommand } }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  const exact = guard(command.join(" "));
  assert.equal(exact.status, 0, exact.stderr);
  const shapedDifferently = guard(`git push --porcelain --verbose origin ${command[4]}`);
  assert.equal(shapedDifferently.status, 2);
  assert.match(shapedDifferently.stderr, /publication mode/);
});

check("a pending authorization cannot be orphaned by another transaction", () => {
  const before = readFileSync(statePath(root), "utf8");
  assert.equal(invoke("publication-prepare", request("conflict", "absent", null, prepareInput("conflict"))), 2);
  assert.equal(readFileSync(statePath(root), "utf8"), before);
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
  assert.match(result.stderr, /publication mode.*malformed/i);
});

rmSync(root, { recursive: true, force: true });
console.log(`publication-state-authority: ${count} tests passed`);
