// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { applyHeldGitAuthor } from "./held-git-author.mjs";
import { resolveInitialAnswersState } from "./onboarding-initial-answers-state.mjs";
import { PROJECT_ONBOARDING_INITIAL_ANSWERS_RECEIPT_SCHEMA } from "./project-onboarding-v3-author-identity.mjs";

function withRepository(run) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "held-author-")));
  try { execFileSync("git", ["init", "-q"], { cwd: root }); return run(root); }
  finally { rmSync(root, { recursive: true, force: true }); }
}
const local = (root, key) => spawnSync("git", ["config", "--local", "--get", key], { cwd: root, encoding: "utf8" }).stdout.trim();
const held = (name, email) => ({ initialAnswersReceipt: () => ({ gitAuthorName: name, gitAuthorEmail: email }), readOnboardingIntakeCheckpoint: () => ({ status: "absent" }) });

test("the answered author reaches the local config before the first commit, and a later commit carries it", () => withRepository((root) => {
  assert.deepEqual(applyHeldGitAuthor(root, held("Synthetic Author", "author@example.invalid")), { status: "applied", keys: ["user.name", "user.email"] });
  assert.equal(local(root, "user.name"), "Synthetic Author");
  execFileSync("git", ["commit", "-q", "--allow-empty", "-m", "first"], { cwd: root, env: { ...process.env, GIT_CONFIG_GLOBAL: join(root, "no-global") } });
  assert.equal(execFileSync("git", ["log", "-1", "--format=%an <%ae>"], { cwd: root, encoding: "utf8" }).trim(), "Synthetic Author <author@example.invalid>");
}));

test("an author the intake record holds is used when the receipt has none", () => withRepository((root) => {
  const deps = { initialAnswersReceipt: () => null, readOnboardingIntakeCheckpoint: () => ({ status: "present", value: { values: { gitAuthor: { name: "Intake Author", email: "intake@example.invalid" } } } }) };
  assert.equal(applyHeldGitAuthor(root, deps).status, "applied");
  assert.equal(local(root, "user.email"), "intake@example.invalid");
}));

test("a value the repository already sets is never replaced; only the missing key is written", () => withRepository((root) => {
  execFileSync("git", ["config", "--local", "user.name", "Own Name"], { cwd: root });
  assert.deepEqual(applyHeldGitAuthor(root, held("Other", "other@example.invalid")), { status: "applied", keys: ["user.email"] });
  assert.equal(local(root, "user.name"), "Own Name");
  assert.deepEqual(applyHeldGitAuthor(root, held("Other", "other@example.invalid")), { status: "already-configured" });
}));

test("the git guard writes the real held receipt before an agent's git commit runs in an enrolled project", () => withRepository((root) => {
  mkdirSync(join(root, ".agent-pipeline"));
  mkdirSync(join(root, ".claude"));
  writeFileSync(join(root, ".claude", "guard-config.json"), JSON.stringify({ commitTrailerPolicy: "off" }));
  writeFileSync(join(root, ".agent-pipeline", "onboarding-consent.json"), JSON.stringify({ schema: "pipeline.onboarding-consent-marker.v1", status: "consent-given-onboarding-incomplete", consentGivenAt: "2026-09-29T00:00:00.000Z" }));
  const receipt = resolveInitialAnswersState(root, "local").receipt;
  mkdirSync(dirname(receipt), { recursive: true });
  writeFileSync(receipt, JSON.stringify({ schema: PROJECT_ONBOARDING_INITIAL_ANSWERS_RECEIPT_SCHEMA, root, pushApprovalPreference: "chat", gitAuthorName: "Receipt Author", gitAuthorEmail: "receipt@example.invalid" }));
  const hook = fileURLToPath(new URL("../hooks/guard-git.mjs", import.meta.url));
  const run = spawnSync(process.execPath, [hook], { cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "git commit -m 'chore: first'" }, cwd: root, hook_event_name: "PreToolUse" }), encoding: "utf8", timeout: 30_000 });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(local(root, "user.name"), "Receipt Author");
  assert.equal(local(root, "user.email"), "receipt@example.invalid");
}));

test("nothing is invented when no answer is held, and a failing Git never stops the commit", () => withRepository((root) => {
  assert.deepEqual(applyHeldGitAuthor(root, { initialAnswersReceipt: () => null, readOnboardingIntakeCheckpoint: () => ({ status: "absent" }) }), { status: "nothing-held" });
  assert.equal(local(root, "user.name"), "");
  assert.deepEqual(applyHeldGitAuthor(root, { spawn: () => { throw new Error("no git"); } }), { status: "unavailable" });
}));
