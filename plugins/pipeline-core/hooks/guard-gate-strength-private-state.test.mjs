// SPDX-License-Identifier: SUL-1.0
// D247 follow-up at the guard: hooks/guard-gate-strength.mjs refuses an agent's own Write/Edit into the pipeline-owned
// private state (.git/agent-pipeline/**), where the host records what it observed (a design review's model, readiness
// receipts). A live probe on 2026-11-13 showed such a Write admitted; a record an agent can write proves nothing.
// The guard is spawned as the host spawns it, in a fixture repository; the refusal plans no human-override ceremony.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PRIVATE_STATE_AGENT_WRITE, privateStateWriteRefusal } from "../lib/private-state-write-guard.mjs";

const GUARD = join(dirname(fileURLToPath(import.meta.url)), "guard-gate-strength.mjs");
const roots = [];
process.on("exit", () => { for (const root of roots) { try { rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ } } });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "gate-strength-private-"));
  roots.push(root);
  const init = spawnSync("git", ["init", "-q"], { cwd: root, encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr);
  mkdirSync(join(root, "scratch"), { recursive: true });
  return root;
}

function ask(root, toolName, toolInput) {
  const result = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_name: toolName, tool_input: toolInput, cwd: root }),
    encoding: "utf8",
    cwd: root,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  assert.equal(result.error, undefined, String(result.error));
  return { status: result.status, stderr: result.stderr ?? "" };
}

const refused = (answer, label) => {
  assert.equal(answer.status, 2, `${label}: ${answer.stderr}`);
  assert.match(answer.stderr, new RegExp(PRIVATE_STATE_AGENT_WRITE, "u"), label);
  assert.doesNotMatch(answer.stderr, /guard-human-override|Human override|human-authorized override/iu, `${label}: no override ceremony is offered`);
};

test("the predicate refuses .git/agent-pipeline targets, lexical or resolved, and nothing else", () => {
  assert.equal(privateStateWriteRefusal({ target: "/r/.git/agent-pipeline/design-review-observations/x.json" })?.code, PRIVATE_STATE_AGENT_WRITE);
  assert.equal(privateStateWriteRefusal({ target: "C:\\r\\.git\\agent-pipeline\\x.json" })?.code, PRIVATE_STATE_AGENT_WRITE);
  assert.equal(privateStateWriteRefusal({ target: "/r/scratch/link/x.json", realTarget: "/r/.git/agent-pipeline/x.json" })?.code, PRIVATE_STATE_AGENT_WRITE);
  for (const target of ["/r/scratch/agent-pipeline/x.json", "/r/.git/config", "/r/docs/.git-agent-pipeline.md", "/r/.gitx/agent-pipeline/x"]) {
    assert.equal(privateStateWriteRefusal({ target, realTarget: target }), null, target);
  }
  assert.equal(privateStateWriteRefusal(), null);
  assert.equal(privateStateWriteRefusal({ target: 5 }), null);
});

test("a Write or Edit into the private state is refused, also through a symlink, and nothing is written", () => {
  const root = fixture();
  const store = join(root, ".git", "agent-pipeline", "design-review-observations");
  const forged = JSON.stringify({ schema: "pipeline.design-review-observation.v1", runner: "claude", assurance: "host-observed-tool-use" });
  refused(ask(root, "Write", { file_path: join(store, `${"a".repeat(64)}.json`), content: forged }), "a forged observation");
  refused(ask(root, "Write", { file_path: ".git/agent-pipeline/design-readiness/x.json", content: "{}" }), "a relative path");
  mkdirSync(store, { recursive: true });
  writeFileSync(join(store, "existing.json"), "{}");
  refused(ask(root, "Edit", { file_path: join(store, "existing.json"), old_string: "{}", new_string: forged }), "an edit of an existing record");
  symlinkSync(join(root, ".git"), join(root, "scratch", "g"));
  refused(ask(root, "Write", { file_path: join(root, "scratch", "g", "agent-pipeline", "new", "x.json"), content: "{}" }), "a symlink into .git");
  assert.equal(existsSync(join(store, `${"a".repeat(64)}.json`)), false);
});

test("ordinary writes pass, including a folder named agent-pipeline outside .git", () => {
  const root = fixture();
  assert.equal(ask(root, "Write", { file_path: join(root, "scratch", "note.md"), content: "x\n" }).status, 0);
  assert.equal(ask(root, "Write", { file_path: join(root, "scratch", "agent-pipeline", "note.md"), content: "x\n" }).status, 0);
});
