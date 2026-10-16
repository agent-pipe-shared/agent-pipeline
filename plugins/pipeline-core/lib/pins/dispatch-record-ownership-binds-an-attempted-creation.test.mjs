// SPDX-License-Identifier: SUL-1.0
// Pin for backlog item pipeline.dispatch-record-ownership-binds-an-attempted-creation (AC-164).
// Acceptance: dispatch-record ownership must hold across linked worktrees that share ONE claim registry (RC-1: the owner keeps writing its own
// record, RC-2: a foreign writer is refused), and the landed (source-owned, v2) creation must bind ownership only to a creation that actually landed.
// Real module, no mocks of the behaviour under test. Fixtures live under the repository's scratch/ (the OS temp root is a protected read scope).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { devNull } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  checkDispatchRecordCollision, claimDispatchRecordOwnership, createControlledDispatchRecordCreationFixture,
  createSourceOwnedDispatchRecord, LANDED_DISPATCH_RECORD_OWNER_SCHEMA,
} from "../guard/dispatch-record-lane.mjs";
import { hardenWindowsPrivateDirectory } from "../windows-private-state.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const git = (cwd, ...args) => {
  const r = spawnSync("git", ["-C", cwd, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "-c", `core.hooksPath=${devNull}`, ...args], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};
const repoRoot = realpathSync(git(here, "rev-parse", "--show-toplevel"));
const OWNER = "ownership-agent-owner", OTHER = "ownership-agent-other", TYPE = "pipeline-core:goldfish-deep";
const input = agentId => ({ tool_name: "Write", tool_input: {}, transcript_path: "/parent/session.jsonl", ...(agentId === null ? {} : { agent_id: agentId, agent_type: TYPE }) });
const rel = id => `evidence/dispatch-record-${id}.json`;
// readFileSyncFn is the module's documented read seam. Without it the claim reader uses physicalCreationFile(), which demands POSIX mode bits
// (no group/other write) and therefore fail-closes on native Windows for EVERY claim, including the owner's own (reported as a host limitation).
const deps = { gitCommitForTaskIdFn: () => null, readFileSyncFn: readFileSync };

function twoLinkedWorktrees() {
  const parent = join(repoRoot, "scratch", "dispatch-record-ownership-pins");
  mkdirSync(parent, { recursive: true });
  const base = realpathSync(mkdtempSync(join(parent, "case-")));
  const a = join(base, "wt-a"), b = join(base, "wt-b");
  mkdirSync(a);
  git(a, "init", "-q");
  git(a, "commit", "--allow-empty", "-q", "-m", "fixture");
  git(a, "worktree", "add", "-q", "--detach", b);
  mkdirSync(join(a, "evidence"), { recursive: true });
  mkdirSync(join(b, "evidence"), { recursive: true });
  const commonDir = realpathSync(join(a, ".git"));
  return { a, b, commonDir, claim: id => join(commonDir, "agent-pipeline", "dispatch-record-owner", id + ".json"),
    file: (root, id) => join(root, rel(id)), cleanup: () => rmSync(base, { recursive: true, force: true }) };
}
const open = id => JSON.stringify({ taskId: id, outcome: "in-progress", commits: [], log: [] });
const collide = (fx, root, id, agentId, payload = open(id)) => checkDispatchRecordCollision({
  relPath: rel(id), requested: fx.file(root, id), payload, root, input: input(agentId), dependencies: deps });

test("OWN-1 two linked worktrees resolve to ONE claim registry, and a claim made in one is visible in the other", () => {
  const fx = twoLinkedWorktrees();
  try {
    const id = "OWN-SHARED-1";
    const claimed = claimDispatchRecordOwnership({ relPath: rel(id), requested: fx.file(fx.a, id), root: fx.a, input: input(OWNER) });
    assert.equal(claimed.status, "claimed");
    assert.equal(existsSync(fx.claim(id)), true, "claim lives under the shared git common dir, not inside either worktree");
    assert.equal(existsSync(join(fx.b, ".git", "agent-pipeline")), false);
    const stored = JSON.parse(readFileSync(fx.claim(id), "utf8"));
    assert.equal(stored.schema, "pipeline.dispatch-record-owner.v1");
    assert.equal(stored.bindingKind, "attempted-native-write", "the native v1 claim is honestly labelled an attempt, not a landed witness");
    assert.equal(stored.agentId, OWNER);
    // The second worktree sees the same registry: it can neither take over the claim nor adopt a record.
    assert.equal(claimDispatchRecordOwnership({ relPath: rel(id), requested: fx.file(fx.b, id), root: fx.b, input: input(OTHER) }).status, "claim-exists");
    assert.equal(JSON.parse(readFileSync(fx.claim(id), "utf8")).agentId, OWNER);
  } finally { fx.cleanup(); }
});

test("OWN-2 RC-1 holds across worktrees: the owner is admitted from the OTHER worktree, also after its own commit cites the task id", () => {
  const fx = twoLinkedWorktrees();
  try {
    const id = "OWN-RC1-2";
    assert.equal(claimDispatchRecordOwnership({ relPath: rel(id), requested: fx.file(fx.a, id), root: fx.a, input: input(OWNER) }).status, "claimed");
    assert.equal(collide(fx, fx.a, id, OWNER), null);
    assert.equal(collide(fx, fx.b, id, OWNER), null, "owner admitted from the second worktree");
    const withHistory = { ...deps, gitCommitForTaskIdFn: () => "f262a5c712345678" };
    assert.equal(checkDispatchRecordCollision({ relPath: rel(id), requested: fx.file(fx.b, id), payload: open(id), root: fx.b, input: input(OWNER), dependencies: withHistory }), null,
      "a claimed record is decided by ownership, not by the git-history test");
  } finally { fx.cleanup(); }
});

test("OWN-3 RC-2 holds across worktrees: a foreign dispatch, the orchestrator and an unresolved identity are refused from either worktree", () => {
  const fx = twoLinkedWorktrees();
  try {
    const id = "OWN-RC2-3";
    assert.equal(claimDispatchRecordOwnership({ relPath: rel(id), requested: fx.file(fx.a, id), root: fx.a, input: input(OWNER) }).status, "claimed");
    for (const root of [fx.a, fx.b]) {
      for (const who of [OTHER, null]) {
        const hit = collide(fx, root, id, who);
        assert.notEqual(hit, null, String(who));
        assert.equal(hit.taskId, id);
        assert.match(hit.reason, /owned by dispatch agent ownership-agent-owner/u);
      }
    }
    const unresolved = checkDispatchRecordCollision({ relPath: rel(id), requested: fx.file(fx.b, id), payload: open(id), root: fx.b,
      input: { ...input(OTHER), agent_id: "../traversal" }, dependencies: deps });
    assert.match(unresolved.reason, /owned by dispatch agent/u);
  } finally { fx.cleanup(); }
});

test("OWN-4 the attempt is bound, not a landed record: a record that already landed is never adopted, and a claim without a landed record still protects the id in the sibling worktree", () => {
  const fx = twoLinkedWorktrees();
  try {
    const landed = "OWN-LANDED-4";
    writeFileSync(fx.file(fx.b, landed), open(landed));
    assert.equal(claimDispatchRecordOwnership({ relPath: rel(landed), requested: fx.file(fx.b, landed), root: fx.b, input: input(OWNER) }).status, "record-exists");
    assert.equal(existsSync(fx.claim(landed)), false, "an existing record is never adopted into a claim");
    const attempted = "OWN-ATTEMPT-4";
    assert.equal(claimDispatchRecordOwnership({ relPath: rel(attempted), requested: fx.file(fx.a, attempted), root: fx.a, input: input(OWNER) }).status, "claimed");
    assert.equal(existsSync(fx.file(fx.a, attempted)), false, "the record never landed");
    assert.equal(existsSync(fx.file(fx.b, attempted)), false);
    assert.notEqual(collide(fx, fx.b, attempted, OTHER), null, "the sibling worktree cannot take over an id whose creation was only attempted");
    assert.equal(collide(fx, fx.b, attempted, OWNER), null, "the owner may retry its own opening write from either worktree");
    // A payload with no resolvable identity never creates a claim.
    assert.equal(claimDispatchRecordOwnership({ relPath: rel("OWN-NOID-4"), requested: fx.file(fx.a, "OWN-NOID-4"), root: fx.a, input: input(null) }).status, "no-identity");
    assert.equal(existsSync(fx.claim("OWN-NOID-4")), false);
  } finally { fx.cleanup(); }
});

// The guard calls the claim reader with NO readFileSyncFn seam, so the claim is read through physicalCreationFile(). That reader demanded POSIX mode bits
// (no group/other write); native Windows reports every file as 0o666, so it refused every claim, the owner's own included. On win32 that one term is
// replaced by the repository's existing native private-state assessment (owner + DACL, assessWindowsPrivatePath); an attacker-writable claim is still
// refused on every platform. The Windows fixture hardens the repository-private root first, as ensureAgentPipelineRoot does in a provisioned checkout.
const production = { gitCommitForTaskIdFn: () => null };
const collideProduction = (fx, root, id, agentId) => checkDispatchRecordCollision({
  relPath: rel(id), requested: fx.file(root, id), payload: open(id), root, input: input(agentId), dependencies: production });
function hardenRegistryRoot(fx) {
  if (process.platform !== "win32") return;
  const root = join(fx.commonDir, "agent-pipeline");
  mkdirSync(root);
  assert.equal(hardenWindowsPrivateDirectory(root).status, "secure", "fixture: the repository-private root must end private");
}
function makeClaimAttackerWritable(path) {
  if (process.platform !== "win32") { chmodSync(path, 0o666); return; }
  const grant = spawnSync("icacls", [path, "/grant", "*S-1-1-0:(M)"], { encoding: "utf8", windowsHide: true });
  assert.equal(grant.status, 0, String(grant.stderr || grant.stdout));
}

test("OWN-7 the production claim reader (no readFileSyncFn seam) admits the owner, refuses everyone else, and fails closed on an attacker-writable claim", () => {
  const fx = twoLinkedWorktrees();
  try {
    const id = "OWN-PROD-7";
    hardenRegistryRoot(fx);
    assert.equal(claimDispatchRecordOwnership({ relPath: rel(id), requested: fx.file(fx.a, id), root: fx.a, input: input(OWNER) }).status, "claimed");
    assert.equal(collideProduction(fx, fx.a, id, OWNER), null, "the owner is admitted through the production claim reader");
    assert.equal(collideProduction(fx, fx.b, id, OWNER), null, "the owner is admitted from the linked worktree too");
    for (const who of [OTHER, null]) {
      const hit = collideProduction(fx, fx.b, id, who);
      assert.notEqual(hit, null, String(who));
      assert.match(hit.reason, /owned by dispatch agent ownership-agent-owner/u, String(who));
    }
    makeClaimAttackerWritable(fx.claim(id));
    for (const who of [OWNER, OTHER, null]) assert.notEqual(collideProduction(fx, fx.a, id, who), null, "an attacker-writable claim is never honoured, not even for the owner: " + String(who));
  } finally { fx.cleanup(); }
});

// The landed (v2) creation needs POSIX directory mode bits, O_DIRECTORY and directory fsync (secureDirectory / syncCreationDirectory), which native
// Windows does not provide; there it is a typed host limitation, not a pass. On POSIX the cases run for real.
const HOST_LIMIT = process.platform === "win32" ? "host-limitation: landed creation requires POSIX directory mode bits and O_DIRECTORY; unavailable on native Windows" : false;

async function landedCreation(fault, id) {
  const fx = twoLinkedWorktrees();
  const control = createControlledDispatchRecordCreationFixture({ rootDir: fx.a, fixtureId: "own-" + fault, sessionId: "own-session-" + fault, fault });
  try {
    const result = await control.run(() => createSourceOwnedDispatchRecord({ rootDir: fx.a, taskId: id, content: open(id) }));
    return { fx, result, control };
  } catch (error) { await control.dispose(); fx.cleanup(); throw error; }
}

test("OWN-5 a landed creation publishes a v2 claim bound to the physical record (dev/ino + sha256), and the sibling worktree sees it", { skip: HOST_LIMIT }, async () => {
  const id = "OWN-V2-5";
  const { fx, result, control } = await landedCreation("none", id);
  try {
    assert.equal(result.status, "created-and-owned");
    const claim = JSON.parse(readFileSync(fx.claim(id), "utf8"));
    assert.equal(claim.schema, LANDED_DISPATCH_RECORD_OWNER_SCHEMA);
    assert.equal(claim.recordSha256, result.recordSha256);
    assert.equal(Number.isSafeInteger(claim.recordIdentity.ino), true);
    assert.notEqual(collide(fx, fx.b, id, OTHER), null, "a foreign writer is refused from the linked worktree");
  } finally { await control.dispose(); fx.cleanup(); }
});

for (const [fault, status] of [["remove-created-record", "landed-unclaimed"], ["replace-created-inode", "landed-unclaimed"], ["change-created-bytes", "landed-unclaimed"],
  ["occupy-record-path", "unavailable-or-refused"], ["occupy-owner-path", "landed-unclaimed"]]) {
  test(`OWN-6 ${fault}: ownership is never published for a creation that did not land intact (${status})`, { skip: HOST_LIMIT }, async () => {
    const id = "OWN-F-" + fault;
    const { fx, result, control } = await landedCreation(fault, id);
    try {
      assert.equal(result.status, status);
      if (fault !== "occupy-owner-path") assert.equal(existsSync(fx.claim(id)), false, "no v2 owner claim for a creation that did not land");
      assert.equal(existsSync(join(dirname(fx.claim(id)), id + ".pending")), false, "the reservation is removed");
    } finally { await control.dispose(); fx.cleanup(); }
  });
}
