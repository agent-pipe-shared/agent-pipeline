// SPDX-License-Identifier: SUL-1.0

/**
 * D98 (ALF-K2-GITAUTHOR): a Git author the typed intake record already holds is not asked again,
 * and the first-answers receipt (which carries the author to the first commit) takes it from the
 * record when no author flags are given. Kept in its own file because onboarding-init.test.mjs sits
 * over its architecture line bound.
 */
import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { applyInitialOnboardingAnswers, driveOnboardingInit } from "./onboarding-init.mjs";
import { applyOnboardingIntakeConsent } from "../lib/onboarding-continuity.mjs";
import { unresolvedAuthorIdentityKeys } from "../lib/project-onboarding-v3-author-identity.mjs";
import {
  PIPELINE_ACTOR_ASSIGNMENT_SCHEMA, PIPELINE_ACTOR_ATTRIBUTION_SCOPES, PIPELINE_HELD_IDENTITY_CHOICE_SCHEMA,
  heldIdentityChoice, normalizePipelineActorAssignment, pipelineActorAssignmentPath, readPipelineActorAssignment,
  writePipelineActorAssignment,
} from "../lib/pipeline-actor-assignment.mjs";

const fresh = (label) => mkdtempSync(join(tmpdir(), `onboarding-init-intake-author-${label}-`));
const dispose = (path) => rmSync(path, { recursive: true, force: true });
const inputNames = (action) => (action?.inputs ?? []).map((input) => input?.name);
const environment = (home) => {
  const env = { ...process.env, PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: home, CODEX_THREAD_ID: "ambient-codex-fixture" };
  for (const key of ["CLAUDECODE", "ANTIGRAVITY_AGENT", "AI_AGENT", "CODEX_SESSION_ID"]) delete env[key];
  return env;
};

test("the initial answers fall back to the Git author the intake record holds, and an explicit author wins", () => {
  const recorded = { name: "Intake PO", email: "intake@example.invalid" };
  const receiptOf = (root) => JSON.parse(readFileSync(join(root, ".git", "agent-pipeline", "onboarding-initial-answers.json"), "utf8"));
  for (const explicit of [null, { name: "Explicit PO", email: "explicit@example.invalid" }]) {
    const root = fresh("root");
    const home = fresh("home");
    try {
      const env = environment(home);
      assert.equal(driveOnboardingInit({ rootDir: root, runner: "claude", env }).outcome, "pending-asks");
      applyOnboardingIntakeConsent({ rootDir: root, granted: true, gitAuthor: recorded, language: "en", activate: true });
      if (explicit === null) {
        const asked = driveOnboardingInit({ rootDir: root, runner: "claude", env });
        assert.equal(asked.outcome, "pending-asks", JSON.stringify(asked));
        const names = inputNames(asked.pendingAsks[0]);
        assert.equal(names.includes("gitAuthorName") || names.includes("gitAuthorEmail"), false, `the held author is not asked again: ${names.join(",")}`);
      }
      const applied = applyInitialOnboardingAnswers({
        rootDir: root, runner: "claude", env, pushApproval: "chat", language: "en",
        ...(explicit === null ? {} : { gitAuthorName: explicit.name, gitAuthorEmail: explicit.email }),
      });
      assert.equal(applied.ok, true, JSON.stringify(applied));
      const held = receiptOf(root);
      const expected = explicit ?? recorded;
      assert.deepEqual([held.gitAuthorName, held.gitAuthorEmail], [expected.name, expected.email]);
    } finally {
      dispose(root);
      dispose(home);
    }
  }
});

test("a one-sided or absent Git author in the intake record is still asked, and a one-sided explicit author is refused", () => {
  const noFiles = { existsSync: () => false, spawnSync: () => ({ status: 1, stdout: "", stderr: "" }) };
  const withRecord = (gitAuthor) => ({ ...noFiles, readOnboardingIntakeCheckpoint: () => ({ status: "present", value: { values: { gitAuthor } } }) });
  const keys = (fs) => unresolvedAuthorIdentityKeys("/nonexistent-root", false, fs);
  assert.deepEqual(keys(withRecord({ name: "Both", email: "both@example.invalid" })), []);
  assert.deepEqual(keys(withRecord({ name: "Only Name", email: "" })), ["user.name", "user.email"]);
  assert.deepEqual(keys(withRecord({ name: "", email: "only@example.invalid" })), ["user.name", "user.email"]);
  assert.deepEqual(keys(withRecord(null)), ["user.name", "user.email"]);
  assert.deepEqual(keys({ ...noFiles, readOnboardingIntakeCheckpoint: () => ({ status: "absent" }) }), ["user.name", "user.email"]);
  assert.deepEqual(keys({ ...noFiles, readOnboardingIntakeCheckpoint: () => { throw new Error("unreadable"); } }), ["user.name", "user.email"]);
  const root = fresh("root");
  const home = fresh("home");
  try {
    const env = environment(home);
    assert.equal(driveOnboardingInit({ rootDir: root, runner: "claude", env }).outcome, "pending-asks");
    assert.deepEqual(applyInitialOnboardingAnswers({ rootDir: root, runner: "claude", env, pushApproval: "chat", language: "en", gitAuthorName: "Only Name" }),
      { ok: false, code: "INITIAL-ANSWERS-GIT-IDENTITY-INCOMPLETE" });
  } finally {
    dispose(root);
    dispose(home);
  }
});

// --- W3-R2-IDENTITY-ACTOR-REUSE (AC-264; related AC-258): kernel-independent cases -----------------------
// The driver-dependent cases (joint ask, persisted assignment, held identity choice) travel with the held patch.
// "Restart-shaped" means: the answers were given and applied, then onboarding is re-entered through a
// brand-new driver call with a fresh environment object that carries a different host thread id.
const RESTART_AUTHOR = { name: "Restart PO", email: "restart-po@example.invalid" };
const RESTART_ACTOR = "Restart Presenter";
const restartShaped = (home) => ({ ...environment(home), CODEX_THREAD_ID: "restarted-codex-fixture" });
const askedNames = (result) => [...(result.pendingAsks ?? []), ...(result.collectInput ? [result.collectInput] : [])]
  .flatMap((action) => inputNames(action));
const receiptPathOf = (root) => join(root, ".git", "agent-pipeline", "onboarding-initial-answers.json");
test("a Git identity supplied in the first round is not asked again after a restart-shaped re-entry", () => {
  const root = fresh("root");
  const home = fresh("home");
  try {
    const first = driveOnboardingInit({ rootDir: root, runner: "claude", env: environment(home) });
    assert.equal(first.outcome, "pending-asks");
    assert.ok(askedNames(first).includes("gitAuthorName") && askedNames(first).includes("gitAuthorEmail"), "the first round does ask for the identity");
    const applied = applyInitialOnboardingAnswers({
      rootDir: root, runner: "claude", env: environment(home), pushApproval: "chat", language: "en",
      gitAuthorName: RESTART_AUTHOR.name, gitAuthorEmail: RESTART_AUTHOR.email,
    });
    assert.equal(applied.ok, true, JSON.stringify(applied));
    const restarted = driveOnboardingInit({ rootDir: root, runner: "claude", env: restartShaped(home) });
    assert.notEqual(restarted.outcome, "error", JSON.stringify(restarted.error ?? null));
    const names = askedNames(restarted);
    assert.equal(names.includes("gitAuthorName") || names.includes("gitAuthorEmail"), false, `the held identity is not asked again: ${names.join(",")}`);
    const receipt = JSON.parse(readFileSync(receiptPathOf(root), "utf8"));
    assert.deepEqual([receipt.gitAuthorName, receipt.gitAuthorEmail, receipt.root], [RESTART_AUTHOR.name, RESTART_AUTHOR.email, root]);
    assert.deepEqual(unresolvedAuthorIdentityKeys(root, false, { existsSync, lstatSync: (path) => statSync(path), readFileSync, spawnSync: () => ({ status: 1, stdout: "", stderr: "" }) }), [],
      "a root-bound receipt answers the identity question without any Git config having been written");
  } finally {
    dispose(root);
    dispose(home);
  }
});
const privateRoot = (label) => {
  const root = fresh(label);
  assert.equal(spawnSync("git", ["init", "-q"], { cwd: root, stdio: "ignore" }).status, 0);
  mkdirSync(join(root, ".git", "agent-pipeline"), { recursive: true });
  return root;
};
const FS = { existsSync, lstatSync, readFileSync };

test("an actor assignment is attribution only: no approval verb is a scope, an invalid label is refused", () => {
  for (const scope of ["approve-plan", "approve-push", "revoke-plan", "discard-feature", "po-authority-acknowledge-apply", "bogus-verb"]) {
    assert.equal(normalizePipelineActorAssignment({ label: "Any Label", scopes: [scope] }).ok, false, `${scope} is not an attribution scope`);
  }
  for (const label of ["", "   ", "two\nlines", "nul\0byte", "x".repeat(321), null, 7]) {
    assert.equal(normalizePipelineActorAssignment({ label }).ok, false);
  }
  const ok = normalizePipelineActorAssignment({ label: "  Any Label " });
  assert.deepEqual([ok.ok, ok.assignment.label, ok.assignment.scopes], [true, "Any Label", [...PIPELINE_ACTOR_ATTRIBUTION_SCOPES].sort()]);
  assert.equal(PIPELINE_ACTOR_ATTRIBUTION_SCOPES.some((scope) => /approve|revoke|discard|signature|acknowledge/u.test(scope)), false);
});

test("an actor assignment round-trips through private 0600 state, is idempotent, and a foreign root reads null", () => {
  const root = privateRoot("root");
  const other = privateRoot("root");
  try {
    assert.equal(readPipelineActorAssignment(root, "local", FS), null);
    assert.deepEqual(writePipelineActorAssignment({ root, label: "two\nlines" }), { ok: false, code: "PIPELINE-ACTOR-LABEL-INVALID" });
    assert.equal(existsSync(pipelineActorAssignmentPath(root, "local")), false, "an invalid label stores nothing");
    const first = writePipelineActorAssignment({ root, label: "Restart Presenter", assignedAt: "2026-10-26T00:00:00.000Z" });
    assert.deepEqual([first.ok, first.written], [true, true]);
    const path = pipelineActorAssignmentPath(root, "local");
    assert.ok(path.startsWith(join(root, ".git")), "the assignment lives in repository-private state");
    assert.equal(statSync(path).mode & 0o777, 0o600);
    const record = JSON.parse(readFileSync(path, "utf8"));
    assert.deepEqual(Object.keys(record).sort(), ["assignedAt", "authority", "label", "root", "schema", "scopes"]);
    assert.deepEqual([record.schema, record.root, record.authority], [PIPELINE_ACTOR_ASSIGNMENT_SCHEMA, root, "attribution-only"]);
    const again = writePipelineActorAssignment({ root, label: "Restart Presenter", assignedAt: "2027-01-01T00:00:00.000Z" });
    assert.deepEqual([again.ok, again.written, again.assignment.assignedAt], [true, false, "2026-10-26T00:00:00.000Z"]);
    assert.equal(readPipelineActorAssignment(root, "local", FS).label, "Restart Presenter");
    assert.equal(readPipelineActorAssignment(other, "local", FS), null, "a record bound to another root is not offered back");
  } finally {
    dispose(root);
    dispose(other);
  }
});

test("heldIdentityChoice offers the stored actor jointly, as attribution only, and is null when nothing is held", () => {
  const root = privateRoot("root");
  try {
    assert.equal(heldIdentityChoice(root, "local", FS), null);
    assert.equal(writePipelineActorAssignment({ root, label: "Restart Presenter" }).ok, true);
    const choice = heldIdentityChoice(root, "local", FS);
    assert.deepEqual(choice, {
      schema: PIPELINE_HELD_IDENTITY_CHOICE_SCHEMA,
      gitAuthor: null,
      pipelineActor: { label: "Restart Presenter", scopes: [...PIPELINE_ACTOR_ATTRIBUTION_SCOPES].sort() },
      authority: "attribution-only",
      guidance: choice?.guidance,
    });
    assert.equal(typeof choice.guidance, "string");
  } finally {
    dispose(root);
  }
});
