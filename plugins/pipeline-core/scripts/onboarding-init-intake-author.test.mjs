// SPDX-License-Identifier: SUL-1.0

/**
 * D98 (ALF-K2-GITAUTHOR): a Git author the typed intake record already holds is not asked again,
 * and the first-answers receipt (which carries the author to the first commit) takes it from the
 * record when no author flags are given. Kept in its own file because onboarding-init.test.mjs sits
 * over its architecture line bound.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { applyInitialOnboardingAnswers, driveOnboardingInit } from "./onboarding-init.mjs";
import { applyOnboardingIntakeConsent } from "../lib/onboarding-continuity.mjs";
import { unresolvedAuthorIdentityKeys } from "../lib/project-onboarding-v3-author-identity.mjs";

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
