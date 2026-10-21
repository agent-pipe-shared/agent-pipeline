// ALF-C-ORPHAN-DESCRIPTOR3 / AC-203 (PO decision 2026-10-17): session-cleanup must never offer or archive
// the RUNNING session's own descriptor. The Claude hook creates that descriptor as `claude-<id>` with a null
// owner runtime, so its owner status is `unavailable` and, without an identity check, it is indistinguishable
// from a crashed orphan: plan-human-recovery offered it and archive-orphan archived it out from under the
// live session. The CLI now derives the requester's own descriptor id from CLAUDE_CODE_SESSION_ID (injected
// env here) and passes it as requesterSessionId; eligibility refuses it with WT-ORPHAN-ARCHIVE-OWN-SESSION at
// plan AND at apply. A foreign descriptor, or a run with no/unusable session id, is unchanged (still offered
// and archivable). Residual risk, not pinned: a foreign concurrent Claude session's descriptor stays
// indistinguishable from a crashed orphan.
// Fixture: a scratch git repo with its own `git init`; every git call and the process env carry
// GIT_CEILING_DIRECTORIES=<parent of the fixture> so nothing can resolve into the project repository.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { applyOnboardingKickoff, planOnboardingKickoff } from "../onboarding-continuity.mjs";
import {
  discoverRepository,
  listActiveSessionDescriptors,
  startSessionDescriptor,
} from "../worktree-lifecycle.mjs";
import {
  applyOrphanDescriptorArchive,
  planOrphanDescriptorArchive,
  planSessionCleanupRecovery,
} from "../session-cleanup-recovery.mjs";
import { main as sessionCleanupMain } from "../../scripts/session-cleanup.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

const OWN_UUID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const FOREIGN_UUID = "f1e2d3c4-b5a6-4978-8695-a4b3c2d1e0f9";
const OWN_ID = `claude-${OWN_UUID}`;
const FOREIGN_ID = `claude-${FOREIGN_UUID}`;

const NO_READINESS = {
  requireProjectOnboardingReadyFn() { throw new Error("archive verbs must not consult onboarding readiness"); },
};
const NOOP_READINESS = { requireProjectOnboardingReadyFn() {} };

function withFixture(fn) {
  const scratch = join(REPO_ROOT, "scratch");
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, "odr-"));
  const ceiling = dirname(root);
  const priorCeiling = process.env.GIT_CEILING_DIRECTORIES;
  process.env.GIT_CEILING_DIRECTORIES = ceiling;
  try {
    const git = (args) => {
      const r = spawnSync("git", args, { cwd: root, encoding: "utf8", env: { ...process.env, GIT_CEILING_DIRECTORIES: ceiling } });
      assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
    };
    git(["init", "--quiet"]);
    // The apply path reads the onboarding cleanup binding, which needs the same kickoff chain the
    // session-cleanup-recovery RF2A fixture builds (no commit is made in this repository).
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(join(root, ".claude", "pipeline.json"), `${JSON.stringify({
      project: "fixture",
      verify: "node verify.mjs",
      autonomy: "bounded",
      branchModel: "local",
      worktree: "supported",
      stakes: "high",
      constraints: [],
    }, null, 2)}\n`);
    const plan = planOnboardingKickoff({ rootDir: root, goal: "Orphan descriptor never offers the running session" });
    applyOnboardingKickoff({ plan, expectedPlanSha256: plan.planSha256, activate: true });
    return fn(root);
  } finally {
    if (priorCeiling === undefined) delete process.env.GIT_CEILING_DIRECTORIES;
    else process.env.GIT_CEILING_DIRECTORIES = priorCeiling;
    rmSync(root, { recursive: true, force: true });
  }
}

/** The hook's own shape: `claude-<id>`, null owner runtime (so the owner is unobservable => `unavailable`). */
function hookDescriptor(root, sessionId) {
  const started = startSessionDescriptor(root, { sessionId, ownerRuntime: null });
  return { sessionId, path: started.path, sha: started.descriptorSha256, bytes: readFileSync(started.path) };
}

function run(argv, env, readiness = NOOP_READINESS) {
  let out = "";
  sessionCleanupMain(argv, env, { ...readiness, writeFn(value) { out += value; } });
  return JSON.parse(out);
}

const archiveArgv = (root, d) => [
  "archive-orphan", "--repo", root,
  "--session-descriptor", d.sessionId,
  "--expected-descriptor-sha256", d.sha,
  "--by", "po-test", "--reason", "orphaned zero-authority descriptor",
];

const archivedDir = (root) => join(discoverRepository(root).commonDir, "agent-pipeline", "session-descriptors", "archived");
const archivedPath = (root, d) => join(archivedDir(root), `${d.sessionId}.${d.sha}.json`);
const auditPath = (root) => join(discoverRepository(root).commonDir, "agent-pipeline", "session-descriptors", "orphan-archive-audit.jsonl");

const OWN_ENV = { CLAUDE_CODE_SESSION_ID: OWN_UUID };

test("AC-203 own session (a): plan-human-recovery and plan-recovery never offer the running session's own descriptor; a foreign one stays offered", () => withFixture((root) => {
  const own = hookDescriptor(root, OWN_ID);
  const foreign = hookDescriptor(root, FOREIGN_ID);

  const human = run(["plan-human-recovery", "--repo", root], OWN_ENV);
  const offered = human.candidates.filter((candidate) => candidate.id === "archive-orphan-descriptor").map((candidate) => candidate.sessionId);
  assert.deepEqual(offered, [foreign.sessionId], "only the foreign descriptor is offered, never the running session's own");

  // Later contract (PO decision D46 / PF-50): the typed plan skips every hook-shaped claude-<id> anchor, so it is
  // `not-needed`; a real orphan is routed through plan-human-recovery above. AC-203 holds: never names the own id.
  const plan = planSessionCleanupRecovery({ rootDir: root, requesterSessionId: OWN_ID });
  assert.equal(plan.status, "not-needed");
  assert.ok(!(plan.archiveOrphan?.candidates ?? []).map((candidate) => candidate.sessionId).includes(own.sessionId));
  const viaCli = run(["plan-recovery", "--repo", root], OWN_ENV);
  assert.equal(viaCli.status, "not-needed");
  assert.ok(!(viaCli.archiveOrphan?.candidates ?? []).map((candidate) => candidate.sessionId).includes(own.sessionId));

  assert.deepEqual(readFileSync(own.path), own.bytes, "planning never touches the own descriptor");
}));

test("AC-203 own session (a): plan-archive-orphan lists the running session's own descriptor under refusals with WT-ORPHAN-ARCHIVE-OWN-SESSION", () => withFixture((root) => {
  const own = hookDescriptor(root, OWN_ID);
  const foreign = hookDescriptor(root, FOREIGN_ID);

  const listed = run(["plan-archive-orphan", "--repo", root], OWN_ENV, NO_READINESS);
  assert.deepEqual(listed.candidates.map((candidate) => candidate.sessionId), [foreign.sessionId]);
  assert.deepEqual(
    listed.refusals.map((refusal) => [refusal.sessionId, refusal.code]),
    [[own.sessionId, "WT-ORPHAN-ARCHIVE-OWN-SESSION"]],
  );
  assert.deepEqual(readFileSync(own.path), own.bytes);
  assert.equal(listActiveSessionDescriptors(root).length, 2, "plan-archive-orphan is read-only");
}));

test("AC-203 own session (a): archive-orphan with the matching digest is refused with WT-ORPHAN-ARCHIVE-OWN-SESSION and leaves the descriptor byte-identical", () => withFixture((root) => {
  const own = hookDescriptor(root, OWN_ID);
  const foreign = hookDescriptor(root, FOREIGN_ID);

  assert.throws(
    () => run(archiveArgv(root, own), OWN_ENV, NO_READINESS),
    (error) => error.code === "WT-ORPHAN-ARCHIVE-OWN-SESSION",
  );
  assert.deepEqual(readFileSync(own.path), own.bytes, "descriptor bytes unchanged");
  assert.equal(existsSync(archivedPath(root, own)), false, "nothing archived for the own session");
  assert.equal(existsSync(auditPath(root)), false, "no audit record for a refused archive");
  assert.deepEqual(listActiveSessionDescriptors(root).map((entry) => entry.sessionId), [own.sessionId, foreign.sessionId].sort());

  // The foreign descriptor is unaffected by the same identity: it archives normally.
  const applied = run(archiveArgv(root, foreign), OWN_ENV, NO_READINESS);
  assert.equal(applied.status, "archived");
  assert.deepEqual(readFileSync(archivedPath(root, foreign)), foreign.bytes);
  assert.deepEqual(listActiveSessionDescriptors(root).map((entry) => entry.sessionId), [own.sessionId]);
  assert.deepEqual(readFileSync(own.path), own.bytes);
}));

test("AC-203 own session: the library entry points honour requesterSessionId at plan and at apply", () => withFixture((root) => {
  const own = hookDescriptor(root, OWN_ID);
  const offer = planOrphanDescriptorArchive({ rootDir: root, requesterSessionId: OWN_ID });
  assert.equal(offer.status, "none-eligible");
  assert.deepEqual(offer.refusals.map((refusal) => [refusal.sessionId, refusal.code]), [[own.sessionId, "WT-ORPHAN-ARCHIVE-OWN-SESSION"]]);
  assert.throws(
    () => applyOrphanDescriptorArchive({
      rootDir: root, sessionId: own.sessionId, expectedDescriptorSha256: own.sha,
      by: "po-test", reason: "orphaned zero-authority descriptor", requesterSessionId: OWN_ID,
    }),
    (error) => error.code === "WT-ORPHAN-ARCHIVE-OWN-SESSION",
  );
  assert.deepEqual(readFileSync(own.path), own.bytes);
}));

const NOT_OWN_ENVS = [
  ["a different session id", { CLAUDE_CODE_SESSION_ID: FOREIGN_UUID }],
  ["no CLAUDE_CODE_SESSION_ID", {}],
  ["a session id too short to name a hook descriptor", { CLAUDE_CODE_SESSION_ID: "short" }],
];

for (const [label, env] of NOT_OWN_ENVS) {
  test(`AC-203 foreign or absent session (b): with ${label} the descriptor is still offered and archive-orphan archives it byte-exact with an audit record`, () => withFixture((root) => {
    const subject = hookDescriptor(root, OWN_ID);

    const human = run(["plan-human-recovery", "--repo", root], env);
    const offered = human.candidates.filter((candidate) => candidate.id === "archive-orphan-descriptor");
    assert.equal(offered.length, 1);
    assert.equal(offered[0].sessionId, subject.sessionId);
    assert.equal(offered[0].descriptorSha256, subject.sha);

    const listed = run(["plan-archive-orphan", "--repo", root], env, NO_READINESS);
    assert.deepEqual(listed.candidates.map((candidate) => candidate.sessionId), [subject.sessionId]);
    assert.deepEqual(listed.refusals ?? [], []);

    const applied = run(archiveArgv(root, subject), env, NO_READINESS);
    assert.equal(applied.status, "archived");
    assert.deepEqual(readFileSync(archivedPath(root, subject)), subject.bytes, "archived copy is byte-exact");
    const audit = readFileSync(auditPath(root), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
    assert.equal(audit.length, 1);
    assert.equal(audit[0].sessionId, subject.sessionId);
    assert.equal(audit[0].by, "po-test");
    assert.deepEqual(listActiveSessionDescriptors(root), []);
  }));
}
