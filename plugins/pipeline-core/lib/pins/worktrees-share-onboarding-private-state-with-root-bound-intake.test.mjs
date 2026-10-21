// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.worktrees-share-onboarding-private-state-with-root-bound-intake (AC-274, ALF-C-W1-07B).
// One case per acceptance clause, each driven through the real onboarding owners
// (onboarding-continuity.mjs, codex-onboarding-runtime.mjs) plus the governance
// controller and the pipeline-state retirement writer, on disposable two-worktree
// fixtures. Every fixture lives under the repository scratch/ directory with its own
// `git init`, one commit and `git worktree add`; GIT_CEILING_DIRECTORIES keeps git
// discovery from ever reaching this repository.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { resolveOnboardingIntakeScope } from "../codex-onboarding-runtime.mjs";
import {
  prepareEnrollmentRetirement, retirementArchiveEntry, validateRetirementArchive,
} from "../enrollment-retirement-coordinator.mjs";
import { createGovernanceScopeController, readGovernanceEnrollmentRetirement } from "../governance-scope.mjs";
import {
  applyOnboardingIntakeConsent, observeEnrollmentRetirementIntake, observeOnboardingEnrollmentHistory,
  readOnboardingIntakeCheckpoint, retireEnrollmentIntake, withEnrollmentRetirementIntakeLock,
} from "../onboarding-continuity.mjs";
import { applyProjectOnboardingV3, planProjectOnboardingV3 } from "../project-onboarding-v3.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(here, "../../../..");
const STATE_SCRIPT = resolve(here, "../../scripts/pipeline-state.mjs");
const SCRATCH = join(REPO, "scratch");
const BY = "disposable-fixture";
const SLOW = { timeout: 600_000 };

const sha = (value) => createHash("sha256").update(value).digest("hex");
const GENERATION = sha("alf-c-w1-07b-generation");
const git = (cwd, ...args) => spawnSync("git", ["-c", `user.name=${BY}`, "-c", "user.email=fixture@example.invalid", ...args], { cwd, encoding: "utf8" });
const must = (run, label) => { assert.equal(run.status, 0, `${label}: ${run.stderr}`); return run; };
const refuses = (code, operation, label = code) => assert.throws(operation, (error) => error?.code === code, label);
const now = () => new Date().toISOString();
/** The runtime scope identity also carries its path; journals and archives bind only device and inode. */
const identityOf = ({ dev, ino }) => ({ dev, ino });

let priorCeiling;
before(() => {
  priorCeiling = process.env.GIT_CEILING_DIRECTORIES;
  process.env.GIT_CEILING_DIRECTORIES = SCRATCH.replaceAll("\\", "/");
});
after(() => {
  if (priorCeiling === undefined) delete process.env.GIT_CEILING_DIRECTORIES;
  else process.env.GIT_CEILING_DIRECTORIES = priorCeiling;
});

/** A root worktree and a sibling worktree of one disposable Git repository. */
function twoWorktrees(label) {
  mkdirSync(SCRATCH, { recursive: true });
  const base = mkdtempSync(join(SCRATCH, `alf07b-${label}-`));
  const root = join(base, "root");
  const sibling = join(base, "sibling");
  mkdirSync(root);
  must(git(root, "init", "--initial-branch=main"), "init");
  must(git(root, "commit", "--allow-empty", "-m", "fixture base"), "commit");
  must(git(root, "worktree", "add", "--detach", sibling, "HEAD"), "worktree add");
  return {
    base, root, sibling,
    dispose() {
      git(root, "worktree", "remove", "--force", sibling);
      rmSync(base, { recursive: true, force: true, maxRetries: 5 });
    },
  };
}

const grant = (rootDir, extra = {}) => applyOnboardingIntakeConsent({ rootDir, granted: true, language: "en", profile: "feature", activate: true, ...extra });
const scopeOf = (rootDir) => resolveOnboardingIntakeScope(rootDir, "local");
const checkpointBytes = (rootDir) => readFileSync(readOnboardingIntakeCheckpoint({ rootDir }).paths.checkpoint);
const listTree = (directory) => (existsSync(directory) ? readdirSync(directory, { recursive: true }).sort() : []);

/** Rebuilds the pre-scoping layout: the root's consumed intake sits in the shared Git-common slot. */
function relocateToLegacy(rootDir) {
  const selected = scopeOf(rootDir);
  const current = join(selected.directory, "intake-checkpoint.json");
  const bytes = readFileSync(current);
  const legacy = join(selected.legacyDirectory, "intake-checkpoint.json");
  const evidence = join(selected.directory, "intake-checkpoint-evidence");
  writeFileSync(legacy, bytes, { mode: 0o600 });
  if (existsSync(evidence)) cpSync(evidence, join(selected.legacyDirectory, "intake-checkpoint-evidence"), { recursive: true });
  rmSync(current);
  rmSync(evidence, { recursive: true, force: true });
  return { bytes, legacy, selected };
}

function decline(fixture, rootDir) {
  const controller = createGovernanceScopeController({ hostStateRoot: join(fixture.base, "unused-host") });
  const plan = controller.planDecision({ rootDir, decision: "decline", by: BY });
  return { controller, declined: controller.applyDecision(plan, { activate: true, planSha256: plan.planSha256 }) };
}

/** `commonRoot` is the main worktree: only it carries the shared `.git/config` the barrier digest binds. */
function runRetirement(subcommand, rootDir, scopeKey, commonRoot) {
  const barrier = sha(readFileSync(join(commonRoot, ".git", "config")));
  return spawnSync(process.execPath, [STATE_SCRIPT, subcommand, "--root", rootDir, "--scope-key", scopeKey, "--barrier-sha256", barrier, "--by", BY], { cwd: rootDir, encoding: "utf8" });
}

// Clause 1: legacy root-only state migrates through the sanctioned owner; the sibling never adopts it.
test("AC-274 legacy root-only state migrates under exact CAS and the sibling never adopts it", () => {
  const fixture = twoWorktrees("legacy");
  try {
    const first = grant(fixture.root, { text: "Legacy retained intake material." });
    const evidenceRelative = first.checkpoint.materialInput[0].evidencePath;
    const { bytes, legacy, selected } = relocateToLegacy(fixture.root);
    const seen = readOnboardingIntakeCheckpoint({ rootDir: fixture.root });
    assert.equal(seen.status, "present", "the owning root keeps reading its active legacy authority");
    assert.equal(seen.paths.checkpoint, legacy);
    assert.equal(seen.sha256, sha(bytes));
    const foreign = readOnboardingIntakeCheckpoint({ rootDir: fixture.sibling });
    assert.equal(foreign.status, "absent", "the sibling must not adopt the root's legacy slot");
    assert.notEqual(foreign.paths.checkpoint, legacy);
    assert.equal(observeOnboardingEnrollmentHistory({ rootDir: fixture.sibling }).retained, false);
    assert.equal(observeOnboardingEnrollmentHistory({ rootDir: fixture.root }).retained, true);

    decline(fixture, fixture.root);
    withEnrollmentRetirementIntakeLock({ rootDir: fixture.root }, (capability) => {
      const snapshot = observeEnrollmentRetirementIntake({ rootDir: fixture.root });
      assert.equal(snapshot.sha256, sha(bytes));
      // A copied receipt (another root's digest) cannot stand in for the exact owned preimage.
      refuses("ER-INTAKE-MIGRATION-CAS", () => retireEnrollmentIntake({
        rootDir: fixture.root, generationSha256: GENERATION, expectedSha256: sha("copied receipt"), at: now(), capability,
      }));
      assert.deepEqual(readFileSync(legacy), bytes, "a refused migration leaves the legacy bytes untouched");
      assert.equal(existsSync(join(selected.directory, "intake-checkpoint.json")), false);
      const done = retireEnrollmentIntake({
        rootDir: fixture.root, generationSha256: GENERATION, expectedSha256: snapshot.sha256, at: now(), capability,
      });
      assert.equal(done.mutated, true);
    });
    assert.equal(existsSync(legacy), false, "the exactly owned legacy slot moved out");
    const retired = readOnboardingIntakeCheckpoint({ rootDir: fixture.root });
    assert.equal(retired.paths.checkpoint, join(selected.directory, "intake-checkpoint.json"));
    assert.equal(retired.value.retiredEnrollmentGenerationSha256, GENERATION);
    assert.equal(retired.value.consent, null, "retirement leaves no consent behind");
    assert.equal(existsSync(join(selected.directory, evidenceRelative)), true, "material evidence followed the migrated intake");
    assert.equal(readOnboardingIntakeCheckpoint({ rootDir: fixture.sibling }).status, "absent");
    assert.equal(existsSync(selected.legacyDirectory), true, "the shared common slot is never reset");
  } finally { fixture.dispose(); }
});

// Clause 2: a sibling's intake in the shared legacy slot is foreign history, never adopted or rewritten.
test("AC-274 foreign sibling history in the shared slot is isolated, preserved, and a malformed slot refuses with a typed code", () => {
  const fixture = twoWorktrees("foreign");
  try {
    grant(fixture.sibling, { text: "Sibling consent that predates scoped storage." });
    const foreignSlot = relocateToLegacy(fixture.sibling);
    grant(fixture.root);
    const rootSelected = scopeOf(fixture.root);
    const rootRead = readOnboardingIntakeCheckpoint({ rootDir: fixture.root });
    assert.equal(rootRead.paths.checkpoint, join(rootSelected.directory, "intake-checkpoint.json"), "the root addresses only its own slot");
    const history = observeOnboardingEnrollmentHistory({ rootDir: fixture.root });
    assert.equal(history.paths.includes(foreignSlot.legacy), false, "the sibling's legacy slot is not the root's history");
    assert.equal(readOnboardingIntakeCheckpoint({ rootDir: fixture.sibling }).paths.checkpoint, foreignSlot.legacy);

    decline(fixture, fixture.root);
    withEnrollmentRetirementIntakeLock({ rootDir: fixture.root }, (capability) => {
      const snapshot = observeEnrollmentRetirementIntake({ rootDir: fixture.root });
      assert.equal(retireEnrollmentIntake({
        rootDir: fixture.root, generationSha256: GENERATION, expectedSha256: snapshot.sha256, at: now(), capability,
      }).mutated, true);
    });
    assert.deepEqual(readFileSync(foreignSlot.legacy), foreignSlot.bytes, "retiring the root preserves the foreign worktree's exact bytes");
    assert.equal(readOnboardingIntakeCheckpoint({ rootDir: fixture.sibling }).sha256, sha(foreignSlot.bytes));

    // A slot nobody can attribute fails closed with a typed code instead of being adopted.
    writeFileSync(foreignSlot.legacy, "{ not an intake checkpoint");
    refuses("INTAKE-CHECKPOINT-MALFORMED", () => readOnboardingIntakeCheckpoint({ rootDir: fixture.sibling }));
    assert.equal(readOnboardingIntakeCheckpoint({ rootDir: fixture.root }).status, "present", "the root's own selected slot is unaffected");
  } finally { fixture.dispose(); }
});

// Clause 3: repeated enrollment is idempotent per root and never disturbs the other root.
test("AC-274 repeated enrollment is idempotent per root and replayed retirement never clears fresh consent", () => {
  const fixture = twoWorktrees("repeat");
  try {
    const first = grant(fixture.root);
    assert.equal(first.mutated, true);
    const rootBytes = checkpointBytes(fixture.root);
    assert.equal(grant(fixture.root).mutated, false, "re-enrolling the same root is a no-op");
    assert.equal(grant(fixture.root, { language: "de" }).checkpoint.values.language, "en", "a repeat never overwrites captured values");
    assert.deepEqual(checkpointBytes(fixture.root), rootBytes);
    const sibling = grant(fixture.sibling);
    assert.equal(sibling.mutated, true, "the sibling's first enrollment is its own");
    assert.deepEqual(checkpointBytes(fixture.root), rootBytes, "enrolling the sibling leaves the root's bytes untouched");
    const siblingBytes = checkpointBytes(fixture.sibling);
    assert.equal(grant(fixture.root).mutated, false);
    assert.deepEqual(checkpointBytes(fixture.sibling), siblingBytes);
    assert.equal(first.checkpoint.revision, 0);

    decline(fixture, fixture.root);
    withEnrollmentRetirementIntakeLock({ rootDir: fixture.root }, (capability) => {
      const snapshot = observeEnrollmentRetirementIntake({ rootDir: fixture.root });
      const request = { rootDir: fixture.root, generationSha256: GENERATION, expectedSha256: snapshot.sha256, at: now(), capability };
      assert.equal(retireEnrollmentIntake(request).mutated, true);
      assert.equal(retireEnrollmentIntake(request).mutated, false, "replaying the same retirement changes nothing");
    });
    grant(fixture.root);
    const fresh = checkpointBytes(fixture.root);
    withEnrollmentRetirementIntakeLock({ rootDir: fixture.root }, (capability) => {
      refuses("ER-INTAKE-FRESH-DRIFT", () => retireEnrollmentIntake({
        rootDir: fixture.root, generationSha256: GENERATION, expectedSha256: sha("archived"), at: now(), capability,
      }), "a replay must never clear freshly collected consent");
    });
    assert.deepEqual(checkpointBytes(fixture.root), fresh);
    assert.deepEqual(checkpointBytes(fixture.sibling), siblingBytes);
  } finally { fixture.dispose(); }
});

// Clause 4: a declined barrier is per physical root.
test("AC-274 a declined barrier in one root neither blocks nor leaks into the other", () => {
  const fixture = twoWorktrees("barrier");
  try {
    const { controller, declined } = decline(fixture, fixture.root);
    assert.equal(declined.state, "declined");
    const siblingScope = controller.observe({ rootDir: fixture.sibling });
    assert.notEqual(siblingScope.state, "declined", JSON.stringify(siblingScope));
    assert.equal(grant(fixture.sibling).mutated, true, "the sibling can still enroll");
    refuses("ER-INTAKE-DECLINED", () => withEnrollmentRetirementIntakeLock({ rootDir: fixture.sibling }, () => assert.fail("the sibling must not enter retirement")),
      "the root's decline is not a barrier the sibling can retire against");
    withEnrollmentRetirementIntakeLock({ rootDir: fixture.root }, (capability) => {
      assert.equal(capability.root, fixture.root);
    });
    assert.equal(controller.observe({ rootDir: fixture.root }).state, "declined", "sibling activity leaves the root's barrier in place");
    assert.equal(controller.observe({ rootDir: fixture.root }).scopeKey, declined.scopeKey);
    assert.notEqual(controller.observe({ rootDir: fixture.sibling }).scopeKey, declined.scopeKey, "each root owns its own scope key");
  } finally { fixture.dispose(); }
});

// Clause 5: the retirement archive and journal are bound to the retiring root.
test("AC-274 archived history stays bound to its root and a repeated retirement replays", SLOW, () => {
  const fixture = twoWorktrees("archive");
  try {
    grant(fixture.root, { text: "Consumed intake that retirement must archive." });
    const original = checkpointBytes(fixture.root);
    grant(fixture.sibling);
    const siblingBytes = checkpointBytes(fixture.sibling);
    const { declined } = decline(fixture, fixture.root);
    const retired = runRetirement("retire-enrollment", fixture.root, declined.scopeKey, fixture.root);
    assert.equal(retired.status, 0, retired.stderr);
    assert.equal(JSON.parse(retired.stdout).status, "retired");

    const selected = scopeOf(fixture.root);
    const journal = readGovernanceEnrollmentRetirement({ rootDir: fixture.root });
    assert.equal(journal.phase, "pending");
    assert.equal(journal.root, fixture.root);
    assert.equal(journal.scopeKey, declined.scopeKey);
    assert.deepEqual(journal.rootIdentity, identityOf(selected.rootIdentity));
    assert.deepEqual(journal.commonIdentity, identityOf(selected.commonIdentity));
    const archive = JSON.parse(readFileSync(join(selected.directory, "enrollment-retirement-archives", `${journal.generationSha256}.json`), "utf8"));
    assert.equal(validateRetirementArchive(archive), true);
    assert.equal(archive.root, fixture.root);
    assert.equal(archive.scopeKey, declined.scopeKey);
    const intake = archive.entries.find((entry) => entry.slot === "intake");
    assert.equal(intake.sha256, sha(original), "the archive holds the exact consumed intake bytes");
    assert.deepEqual(Buffer.from(intake.bytesBase64, "base64"), original);

    const siblingSelected = scopeOf(fixture.sibling);
    assert.notEqual(siblingSelected.directory, selected.directory);
    assert.equal(readGovernanceEnrollmentRetirement({ rootDir: fixture.sibling }), null, "the sibling has no retirement generation");
    assert.equal(existsSync(join(siblingSelected.directory, "enrollment-retirement-archives")), false);
    assert.deepEqual(checkpointBytes(fixture.sibling), siblingBytes, "the sibling's intake bytes are untouched");
    const history = observeOnboardingEnrollmentHistory({ rootDir: fixture.root });
    assert.equal(history.paths.some((path) => path.includes("enrollment-retirement-archives")), true);
    assert.equal(observeOnboardingEnrollmentHistory({ rootDir: fixture.sibling }).paths.some((path) => path.includes("enrollment-retirement")), false);

    const journalPath = join(selected.directory, "enrollment-retirement.json");
    const journalBytes = readFileSync(journalPath);
    const replay = runRetirement("retire-enrollment", fixture.root, declined.scopeKey, fixture.root);
    assert.equal(replay.status, 0, replay.stderr);
    assert.deepEqual(readFileSync(journalPath), journalBytes, "a repeated retirement replays without rewriting the journal");
    const crossed = runRetirement("retire-enrollment", fixture.sibling, declined.scopeKey, fixture.root);
    assert.equal(crossed.status, 2, "the root's scope key cannot retire the sibling");
    assert.deepEqual(readFileSync(journalPath), journalBytes);
    assert.deepEqual(checkpointBytes(fixture.sibling), siblingBytes);
  } finally { fixture.dispose(); }
});

// Clause 6: an interrupted generation is detected in its own root and does not corrupt the other.
test("AC-274 an interrupted generation is detected in its own root and does not corrupt the other", () => {
  const fixture = twoWorktrees("interrupted");
  try {
    // Interrupted intake publication: a crash after the atomic rename strands that root's writer lock.
    const crashing = (() => { try { grant(fixture.root, { deps: { crashAt: "rename" } }); } catch (error) { return error; } return null; })();
    assert.equal(crashing?.code, "INTAKE-CHECKPOINT-SIMULATED-CRASH");
    const rootSelected = scopeOf(fixture.root);
    assert.equal(existsSync(join(rootSelected.directory, ".intake-checkpoint.lock")), true, "the interrupted writer is detectable");
    const rootBytes = checkpointBytes(fixture.root);
    const sibling = grant(fixture.sibling);
    assert.equal(sibling.mutated, true, "a stranded writer lock in one root does not block the other");
    assert.deepEqual(checkpointBytes(fixture.root), rootBytes);
    const recovered = grant(fixture.root, { deps: { lockStaleMs: 0, nowMs: Date.now() + 60_000 } });
    assert.equal(recovered.checkpoint.values.language, "en");
    assert.equal(existsSync(join(rootSelected.directory, ".intake-checkpoint.lock")), false, "the retry reclaims its own stale lock");

    // Interrupted generation publication: an unfinished retirement journal holds fresh intake closed for that root only.
    const archivedEntries = ["state", "intake", "consent"].map((slot) => retirementArchiveEntry({ slot, path: slot, bytes: null }));
    const { journal } = prepareEnrollmentRetirement({
      root: fixture.root, rootIdentity: identityOf(rootSelected.rootIdentity), commonIdentity: identityOf(rootSelected.commonIdentity),
      scopeKey: sha("scope"), barrierSha256: sha("barrier"), by: BY, at: now(), entries: archivedEntries,
    });
    const journalPath = join(rootSelected.directory, "enrollment-retirement.json");
    writeFileSync(journalPath, `${JSON.stringify(journal)}\n`, { mode: 0o600 });
    refuses("ER-INTAKE-RETIREMENT-BUSY", () => grant(fixture.root), "fresh intake waits for the interrupted generation");
    assert.equal(grant(fixture.sibling).mutated, false);
    assert.equal(existsSync(join(scopeOf(fixture.sibling).directory, "enrollment-retirement.json")), false);
    assert.deepEqual(checkpointBytes(fixture.root), rootBytes, "a refused write leaves the root's bytes unchanged");

    // Mixed ownership: a journal that names the other physical root is refused, not trusted.
    writeFileSync(journalPath, `${JSON.stringify({ ...journal, root: fixture.sibling })}\n`, { mode: 0o600 });
    refuses("ER-INTAKE-JOURNAL", () => grant(fixture.root));
    assert.deepEqual(checkpointBytes(fixture.root), rootBytes);
  } finally { fixture.dispose(); }
});

// Clause 7: first enrollment and unverifiable retained history produce their typed canonical routes.
test("AC-274 first enrollment follows the repository-capability route and unverifiable history gets a supported route", () => {
  const fixture = twoWorktrees("first");
  const plain = mkdtempSync(join(SCRATCH, "alf07b-plain-"));
  try {
    grant(fixture.root);
    const rootBytes = checkpointBytes(fixture.root);
    const history = observeOnboardingEnrollmentHistory({ rootDir: fixture.sibling });
    assert.equal(history.retained, false, "another worktree's history is not this root's history");
    assert.deepEqual(history.paths, []);
    const plan = planProjectOnboardingV3({ rootDir: fixture.sibling, runner: "codex" });
    assert.equal(plan.status, "ready", JSON.stringify(plan));
    const applied = applyProjectOnboardingV3(plan, { rootDir: fixture.sibling, activate: true });
    assert.equal(applied.status, "applied", JSON.stringify(applied));
    assert.equal(applied.governanceEnrollment.state, "active");
    assert.equal(existsSync(join(scopeOf(fixture.sibling).directory, "enrollment-retirement.json")), false, "a first enrollment creates no retirement generation");
    assert.equal(readOnboardingIntakeCheckpoint({ rootDir: fixture.sibling }).status, "absent", "and manufactures no consent");
    assert.deepEqual(checkpointBytes(fixture.root), rootBytes);

    // A plain folder with retained history: no invented capability or private storage root, a concrete route instead.
    // The plain folder is not a repository, so the ceiling that keeps the git-init'd fixtures away from this checkout
    // must not apply to it: with it, git reports "not a repository" while the governance scope's own ancestor walk still
    // finds this checkout's .git and refuses (GS-GIT-UNAVAILABLE). The sibling pin first-enrollment-enters-retirement-before-consent
    // runs the same plain-folder scenario without a ceiling.
    delete process.env.GIT_CEILING_DIRECTORIES;
    mkdirSync(join(plain, ".agent-pipeline"));
    const retained = join(plain, ".agent-pipeline", "onboarding-consent.json");
    const retainedBytes = Buffer.from('{"retained":"fixture"}\n');
    writeFileSync(retained, retainedBytes);
    const plainPlan = planProjectOnboardingV3({ rootDir: plain, runner: "codex" });
    assert.equal(plainPlan.status, "ready", JSON.stringify(plainPlan));
    const refused = applyProjectOnboardingV3(plainPlan, { rootDir: plain, activate: true });
    assert.equal(refused.status, "activation-required", JSON.stringify(refused));
    assert.equal(refused.diagnostics[0].code, "retained_enrollment_history");
    assert.ok(refused.nextAction.argv.includes("plan-enrollment-git-creation"), "the supported route is named");
    assert.equal(existsSync(join(plain, ".git")), false, "no repository capability was invented");
    assert.deepEqual(listTree(plain), [".agent-pipeline", join(".agent-pipeline", "onboarding-consent.json")]);
    assert.deepEqual(readFileSync(retained), retainedBytes);
  } finally { fixture.dispose(); rmSync(plain, { recursive: true, force: true, maxRetries: 5 }); }
});
