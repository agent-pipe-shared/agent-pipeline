// SPDX-License-Identifier: SUL-1.0

/**
 * D98 (ALF-K2-GITAUTHOR): a Git author the typed intake record already holds is not asked again,
 * and the first-answers receipt (which carries the author to the first commit) takes it from the
 * record when no author flags are given. Kept in its own file because onboarding-init.test.mjs sits
 * over its architecture line bound.
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
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

// --- W1-R2-IDENTITY-ACTOR-REUSE (AC-264; related AC-258): restart-shaped cases -----------------------
// "Restart-shaped" means: the answers were given and applied, then onboarding is re-entered through a
// brand-new driver call with a fresh environment object that carries a different host thread id.
const RESTART_AUTHOR = { name: "Restart PO", email: "restart-po@example.invalid" };
const RESTART_ACTOR = "Restart Presenter";
const restartShaped = (home) => ({ ...environment(home), CODEX_THREAD_ID: "restarted-codex-fixture" });
const askedNames = (result) => [...(result.pendingAsks ?? []), ...(result.collectInput ? [result.collectInput] : [])]
  .flatMap((action) => inputNames(action));
const receiptPathOf = (root) => join(root, ".git", "agent-pipeline", "onboarding-initial-answers.json");
function walkFiles(directory, skipGit) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    if (skipGit && entry === ".git") continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...walkFiles(path, skipGit));
    else found.push(path);
  }
  return found;
}

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

test("one explicitly scoped actor assignment is asked once with the Git author, kept root-bound in private state and offered back jointly after restart", async () => {
  const actorLib = await import("../lib/pipeline-actor-assignment.mjs");
  const root = fresh("root");
  const home = fresh("home");
  try {
    const first = driveOnboardingInit({ rootDir: root, runner: "claude", env: environment(home) });
    assert.equal(first.outcome, "pending-asks");
    const ask = first.pendingAsks.find((action) => inputNames(action).includes("gitAuthorName"));
    assert.ok(inputNames(ask).includes("pipelineActorLabel"), `the actor label is part of the same joint ask: ${inputNames(ask).join(",")}`);
    assert.ok(ask.applyAction.argv.includes("--pipeline-actor"), "the one apply action carries the actor flag");
    const applied = applyInitialOnboardingAnswers({
      rootDir: root, runner: "claude", env: environment(home), pushApproval: "chat", language: "en",
      gitAuthorName: RESTART_AUTHOR.name, gitAuthorEmail: RESTART_AUTHOR.email, pipelineActor: RESTART_ACTOR,
    });
    assert.equal(applied.ok, true, JSON.stringify(applied));
    const path = actorLib.pipelineActorAssignmentPath(root, "local");
    assert.ok(path.startsWith(join(root, ".git")), "the assignment lives in repository-private state");
    const record = JSON.parse(readFileSync(path, "utf8"));
    assert.deepEqual(Object.keys(record).sort(), ["assignedAt", "authority", "label", "root", "schema", "scopes"]);
    assert.deepEqual([record.schema, record.root, record.label, record.authority], [actorLib.PIPELINE_ACTOR_ASSIGNMENT_SCHEMA, root, RESTART_ACTOR, "attribution-only"]);
    assert.deepEqual(record.scopes, [...actorLib.PIPELINE_ACTOR_ATTRIBUTION_SCOPES].sort());

    const restarted = driveOnboardingInit({ rootDir: root, runner: "claude", env: restartShaped(home) });
    const names = askedNames(restarted);
    for (const name of ["gitAuthorName", "gitAuthorEmail", "pipelineActorLabel"]) assert.equal(names.includes(name), false, `${name} is not asked again after restart`);
    assert.deepEqual(restarted.heldIdentityChoice, {
      schema: actorLib.PIPELINE_HELD_IDENTITY_CHOICE_SCHEMA,
      gitAuthor: { name: RESTART_AUTHOR.name, email: RESTART_AUTHOR.email },
      pipelineActor: { label: RESTART_ACTOR, scopes: [...actorLib.PIPELINE_ACTOR_ATTRIBUTION_SCOPES].sort() },
      authority: "attribution-only",
      guidance: restarted.heldIdentityChoice?.guidance,
    });
    assert.equal(typeof restarted.heldIdentityChoice.guidance, "string");
    // A record bound to another root is not offered back.
    const other = fresh("root");
    try {
      assert.equal(actorLib.readPipelineActorAssignment(other, "local", { existsSync, lstatSync: statSync, readFileSync }), null);
    } finally {
      dispose(other);
    }
  } finally {
    dispose(root);
    dispose(home);
  }
});

test("an actor assignment is attribution only: it cannot cover an approval verb, changes no gate, and leaks nothing into tracked files or Resume-Hints", async () => {
  const actorLib = await import("../lib/pipeline-actor-assignment.mjs");
  for (const scope of ["approve-plan", "approve-push", "revoke-plan", "discard-feature", "po-authority-acknowledge-apply", "bogus-verb"]) {
    assert.equal(actorLib.normalizePipelineActorAssignment({ label: "Any Label", scopes: [scope] }).ok, false, `${scope} is not an attribution scope`);
  }
  for (const label of ["", "   ", "two\nlines", "nul\0byte", "x".repeat(321), null, 7]) {
    assert.equal(actorLib.normalizePipelineActorAssignment({ label }).ok, false);
  }
  assert.equal(actorLib.normalizePipelineActorAssignment({ label: "Any Label" }).ok, true);
  assert.equal(actorLib.PIPELINE_ACTOR_ATTRIBUTION_SCOPES.some((scope) => /approve|revoke|discard|signature|acknowledge/u.test(scope)), false);

  const gateLines = (root) => readFileSync(join(root, "pipeline.user.yaml"), "utf8").split("\n").filter((line) => /(push_approval|human_approval)/u.test(line));
  const withActor = fresh("root");
  const without = fresh("root");
  const home = fresh("home");
  try {
    for (const [root, pipelineActor] of [[withActor, RESTART_ACTOR], [without, undefined]]) {
      assert.equal(driveOnboardingInit({ rootDir: root, runner: "claude", env: environment(home) }).outcome, "pending-asks");
      const applied = applyInitialOnboardingAnswers({
        rootDir: root, runner: "claude", env: environment(home), pushApproval: "signature", language: "en",
        gitAuthorName: RESTART_AUTHOR.name, gitAuthorEmail: RESTART_AUTHOR.email, ...(pipelineActor === undefined ? {} : { pipelineActor }),
      });
      assert.equal(applied.ok, true, JSON.stringify(applied));
    }
    assert.deepEqual(gateLines(withActor), gateLines(without), "naming an actor changes no approval gate");
    assert.ok(gateLines(withActor).length >= 1);
    assert.equal(JSON.parse(readFileSync(receiptPathOf(withActor), "utf8")).pushApprovalPreference, "signature");

    const personal = [RESTART_ACTOR, RESTART_AUTHOR.name, RESTART_AUTHOR.email];
    for (const file of walkFiles(withActor, true)) {
      const text = readFileSync(file, "utf8");
      for (const value of personal) assert.equal(text.includes(value), false, "nothing personal in a tracked or working-tree file");
    }
    for (const file of walkFiles(join(withActor, ".git"), false).filter((path) => /resume-hint/u.test(path))) {
      const text = readFileSync(file, "utf8");
      for (const value of personal) assert.equal(text.includes(value), false, "nothing personal in a Resume-Hint");
    }
    assert.deepEqual(applyInitialOnboardingAnswers({
      rootDir: without, runner: "claude", env: environment(home), pushApproval: "signature", language: "en",
      gitAuthorName: RESTART_AUTHOR.name, gitAuthorEmail: RESTART_AUTHOR.email, pipelineActor: "two\nlines",
    }), { ok: false, code: "INITIAL-ANSWERS-ACTOR-INVALID" });
    assert.equal(existsSync(actorLib.pipelineActorAssignmentPath(without, "local")), false, "an invalid label stores nothing");
  } finally {
    dispose(withActor);
    dispose(without);
    dispose(home);
  }
});

import { mkdtempSync as __actorMkdtemp, readdirSync as __actorReaddir, rmSync as __actorRm } from "node:fs";
import { tmpdir as __actorTmpdir } from "node:os";
import { join as __actorJoin } from "node:path";
import { test as __actorTest } from "node:test";
import __actorAssert from "node:assert/strict";
import { main as __actorMain } from "./onboarding-init.mjs";

__actorTest("main refuses an invalid --pipeline-actor label before any write", () => {
  const root = __actorMkdtemp(__actorJoin(__actorTmpdir(), "actor-argv-"));
  try {
    let out = "";
    __actorMain(["--root", root, "--runner", "codex", "--git-author-name", "Fixture", "--git-author-email", "fixture@example.invalid",
      "--human-approval", "chat", "--advisor-export-consent", "declined", "--language", "en", "--pipeline-actor", "bad\nlabel"], {
      write: (text) => { out += text; },
      writeError: (text) => { out += text; },
      drive: () => { throw new Error("drive must not run"); },
    });
    __actorAssert.match(out, /INITIAL-ANSWERS-ACTOR-INVALID/u);
    __actorAssert.deepEqual(__actorReaddir(root), []);
  } finally { __actorRm(root, { recursive: true, force: true }); }
});
