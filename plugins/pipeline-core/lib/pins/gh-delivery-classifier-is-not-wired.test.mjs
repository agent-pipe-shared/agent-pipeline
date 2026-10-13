// SPDX-License-Identifier: SUL-1.0
/**
 * Regression pin: pipeline.gh-delivery-classifier-is-not-wired (ALF-C-P2-08, AC-176).
 *
 * Original finding: lib/gh-cmd.mjs existed but nothing called it, so it guarded nothing.
 * Acceptance: a `gh pr merge` in a ready session is refused by the push guard.
 *
 * Every point is exercised through the real guard-push.mjs process (stdin hook payload, exit code,
 * stderr) and the real classifier; the only source reads are wiring checks on the other adapters
 * and the hook registration, which have no process-level seam without a full host.
 *
 * Run: node --test plugins/pipeline-core/lib/pins/gh-delivery-classifier-is-not-wired.test.mjs
 */
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { classifyGhCommand } from "../gh-cmd.mjs";

const HOOKS = fileURLToPath(new URL("../../hooks/", import.meta.url));
const GUARD = join(HOOKS, "guard-push.mjs");
const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

// Fixture under the repository scratch/ (host fact: OS temp root is protected for the guard read scope).
const SCRATCH = join(REPO_ROOT, "scratch");
mkdirSync(SCRATCH, { recursive: true });
const WORK = mkdtempSync(join(SCRATCH, "gh-wired-pin-"));
after(() => rmSync(WORK, { recursive: true, force: true }));

function runGuard(command) {
  const res = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8",
    cwd: WORK,
    env: { ...process.env, CLAUDE_PROJECT_DIR: WORK },
    timeout: 20000,
  });
  return { code: res.status, stderr: res.stderr ?? "" };
}

test("AC point 1: gh pr merge is refused by guard-push (exit 2, typed platform-merge code)", () => {
  assert.equal(classifyGhCommand("gh pr merge 12").code, "DELIVERY-UNSUPPORTED-PLATFORM-MERGE");
  const { code, stderr } = runGuard("gh pr merge 12");
  assert.equal(code, 2, stderr);
  assert.match(stderr, /\[guard-push\] DELIVERY-UNSUPPORTED-PLATFORM-MERGE:/);
});

test("AC point 2: disguised and compound merge forms are refused through the same guard", () => {
  for (const command of ["cd repo && gh pr merge 1", "GH_TOKEN=x gh pr merge 1", "gh pr merge --auto --squash 12"]) {
    const { code, stderr } = runGuard(command);
    assert.equal(code, 2, `${command}: ${stderr}`);
    assert.match(stderr, /DELIVERY-UNSUPPORTED-PLATFORM-MERGE/, command);
  }
});

test("AC point 3: other platform-delivery bypasses are refused (api merge, artifact hand-off, unknown gh word)", () => {
  const expected = {
    "gh api -X PUT repos/o/r/pulls/12/merge": "DELIVERY-UNSUPPORTED-PLATFORM-MERGE",
    "gh release upload v1 a.zip": "DELIVERY-UNSUPPORTED-ARTIFACT-HANDOFF",
    "gh pr frobnicate": "DELIVERY-GH-UNCLASSIFIED",
  };
  for (const [command, codeName] of Object.entries(expected)) {
    const { code, stderr } = runGuard(command);
    assert.equal(code, 2, `${command}: ${stderr}`);
    assert.ok(stderr.includes(codeName), `${command}: ${stderr}`);
  }
});

test("safe controls: read-only gh, pr create with explicit head/base, and non-gh commands are not refused", () => {
  for (const command of [
    "gh pr view 12",
    "gh pr list",
    "gh pr checks 12",
    "gh pr create --base main --head feat/x --title t --body b",
    "echo gh pr merge 1",
    "git status",
  ]) {
    const { code, stderr } = runGuard(command);
    assert.equal(code, 0, `${command}: ${stderr}`);
    assert.doesNotMatch(stderr, /DELIVERY-/, command);
  }
});

test("wiring: guard-push imports the classifier and consults it before the git-push fast path", () => {
  const source = readFileSync(GUARD, "utf8");
  assert.match(source, /import \{ classifyGhCommand \} from "\.\.\/lib\/gh-cmd\.mjs";/);
  const callAt = source.indexOf("classifyGhCommand(cmd)");
  const fastPathAt = source.indexOf("if (!isPush) process.exit(0)");
  assert.ok(callAt > 0, "classifier is called on the command");
  assert.ok(fastPathAt > callAt, "classifier runs before the not-a-push fast path");
  assert.match(source, /ghDelivery\.kind === "refused"\) emit\(2,/);
});

test("wiring: Codex and Antigravity adapters route refused gh commands to guard-push", () => {
  for (const file of ["codex-pretool-guard.mjs", "antigravity-pretool-guard.mjs"]) {
    const source = readFileSync(join(HOOKS, file), "utf8");
    assert.match(source, /import \{ classifyGhCommand \} from "\.\.\/lib\/gh-cmd\.mjs";/, file);
    assert.match(
      source,
      /classifyGhCommand\(command\)\.kind === "refused"\) \? \["guard-push\.mjs"\]/,
      `${file} routes refused gh to guard-push`,
    );
  }
});

test("wiring: the Claude hook registration invokes guard-push for Bash", () => {
  const hooks = JSON.parse(readFileSync(join(HOOKS, "hooks.json"), "utf8"));
  const bashEntries = (hooks.hooks?.PreToolUse ?? []).filter((entry) => /Bash/.test(entry.matcher ?? ""));
  const commands = bashEntries.flatMap((entry) => (entry.hooks ?? []).map((hook) => hook.command ?? ""));
  assert.ok(commands.some((command) => command.includes("guard-push.mjs")), "guard-push registered on Bash PreToolUse");
});
