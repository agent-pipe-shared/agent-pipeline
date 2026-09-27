// SPDX-License-Identifier: SUL-1.0
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = fileURLToPath(new URL("./antigravity-start-hint.mjs", import.meta.url));
const PRETOOL = fileURLToPath(new URL("./antigravity-pretool-guard.mjs", import.meta.url));

function initializedRoot() {
  const root = mkdtempSync(join(tmpdir(), "agy-start-hint-git-"));
  const git = spawnSync("git", ["init", "-q", root], { encoding: "utf8" });
  assert.equal(git.status, 0, git.stderr);
  return root;
}

function markGoverned(root) {
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(join(root, ".claude", "pipeline.yaml"), "schema: fixture\n");
}

test("antigravity-start-hint: relative workspace paths fail-closed", () => {
  const input = { invocationNum: 1, workspacePaths: ["."] };
  const res = spawnSync("node", [HOOK], { input: JSON.stringify(input), encoding: "utf8" });
  assert.equal(res.status, 0);
  assert.match(res.stderr, /AGY-REPOSITORY-CONTEXT-UNAVAILABLE/);
});

test("antigravity-start-hint: missing workspace paths fail-closed", () => {
  const input = { invocationNum: 1 };
  const res = spawnSync("node", [HOOK], { input: JSON.stringify(input), encoding: "utf8" });
  assert.equal(res.status, 0);
  assert.match(res.stderr, /AGY-REPOSITORY-CONTEXT-UNAVAILABLE/);
});

test("antigravity-start-hint: absolute ungoverned workspace remains an onboarding hint without creating Git", () => {
  const root = mkdtempSync(join(tmpdir(), "agy-start-hint-"));
  try {
    const input = { invocationNum: 1, workspacePaths: [root], conversationId: "fixture" };
    const res = spawnSync("node", [HOOK], { input: JSON.stringify(input), encoding: "utf8" });
    assert.equal(res.status, 0, res.stderr);
    const output = JSON.parse(res.stdout);
    assert.equal(typeof output.injectSteps?.[0]?.ephemeralMessage, "string");
    assert.match(output.injectSteps[0].ephemeralMessage, /pipeline-start|Pipeline/u);
    assert.equal(existsSync(join(root, ".git")), false, "an onboarding hint must not manufacture a Git control directory");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("antigravity-start-hint: conversationId arms the lock consumed by the pretool guard", () => {
  const root = initializedRoot();
  try {
    markGoverned(root);
    const session = "agy-conversation-1";
    const start = spawnSync(process.execPath, [HOOK], {
      input: JSON.stringify({ invocationNum: 1, workspacePaths: [root], conversationId: session }), encoding: "utf8",
    });
    assert.equal(start.status, 0, start.stderr);
    assert.match(JSON.parse(start.stdout).injectSteps[0].ephemeralMessage,
      /--runner antigravity --host-session-id/u);
    assert.match(JSON.parse(start.stdout).injectSteps[0].ephemeralMessage,
      /agy-conversation-1/u);
    assert.equal(existsSync(join(root, ".git", "agent-pipeline", "run", `session-${session}`, "requires-bootstrap.lock")), true);
    const tool = spawnSync(process.execPath, [PRETOOL], {
      cwd: root,
      input: JSON.stringify({
        workspacePaths: [root], conversationId: session,
        toolCall: { name: "run_command", args: { CommandLine: "node scratch/script.mjs" } },
      }),
      encoding: "utf8",
    });
    assert.equal(tool.status, 2, tool.stderr);
    assert.match(tool.stderr, /Mandatory Session Bootstrap/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("antigravity-start-hint: path-shaped conversationId cannot create a bootstrap path", () => {
  const root = initializedRoot();
  try {
    markGoverned(root);
    const start = spawnSync(process.execPath, [HOOK], {
      input: JSON.stringify({ invocationNum: 1, workspacePaths: [root], conversationId: "x/../../outside" }),
      encoding: "utf8",
    });
    assert.equal(start.status, 0);
    assert.match(start.stderr, /AGY-SESSION-IDENTITY-UNAVAILABLE/u);
    assert.equal(existsSync(join(root, ".git", "agent-pipeline", "outside")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("antigravity-start-hint: initialized but ungoverned Git root remains optional", () => {
  const root = initializedRoot();
  try {
    const session = "optional-git";
    const start = spawnSync(process.execPath, [HOOK], {
      input: JSON.stringify({ invocationNum: 1, workspacePaths: [root], conversationId: session }),
      encoding: "utf8",
    });
    assert.equal(start.status, 0, start.stderr);
    assert.match(start.stdout, /optional project workflow/u);
    assert.equal(existsSync(join(root, ".git", "agent-pipeline", "run", `session-${session}`)), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
