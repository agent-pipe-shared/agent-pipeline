// SPDX-License-Identifier: SUL-1.0
/**
 * Regression suite for `checkpoint-commit.mjs` (D52): the sanctioned checkpoint-commit route
 * for the Elephant. Cases run against a temporary repository with one initial commit, a
 * repository-local author and a real pre-commit hook, so "the hooks stay on" is observed
 * (the hook leaves a marker file), not assumed.
 *
 * Run: node --test plugins/pipeline-core/scripts/checkpoint-commit.test.mjs
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { runCheckpointCommit } from "./checkpoint-commit.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "checkpoint-commit.mjs");
const roots = [];
after(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

const git = (cwd, args, input) => spawnSync("git", args, { cwd, encoding: "utf8", shell: false, input });
const put = (root, rel, text) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text, "utf8");
};

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), "checkpoint-commit-"));
  roots.push(root);
  git(root, ["init", "-q", "-b", "work"]);
  git(root, ["config", "user.name", "Test Author"]);
  git(root, ["config", "user.email", "author@example.invalid"]);
  git(root, ["config", "commit.gpgsign", "false"]);
  put(root, "README.md", "readme\n");
  put(root, "docs/state.md", "state 1\n");
  put(root, "project/pipeline-state.json", "{\"n\":1}\n");
  git(root, ["add", "--", "README.md", "docs/state.md", "project/pipeline-state.json"]);
  const initial = git(root, ["commit", "-q", "-m", "chore: initial"]);
  assert.equal(initial.status, 0, initial.stderr);
  // A real hook: leaves a marker so a commit that skipped hooks is visible.
  put(root, ".git/hooks/pre-commit", "#!/bin/sh\necho ran > \"$(git rev-parse --git-dir)/hook-ran\"\n");
  chmodSync(join(root, ".git/hooks/pre-commit"), 0o755);
  put(root, "scratch/msg.txt", "chore(state): checkpoint the handover\n\nBody line.\n");
  return root;
}
const head = (root) => git(root, ["rev-parse", "HEAD"]).stdout.trim();
const recordingGit = (log) => (args, options = {}) => {
  log.push(args);
  const r = spawnSync("git", args, { cwd: options.cwd, encoding: "utf8", shell: false, input: options.input });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
};

test("(i) allowlisted paths only: commit created with both trailers, hooks on, no --no-verify", () => {
  const root = makeRepo();
  put(root, "docs/state.md", "state 2\n");
  put(root, "project/pipeline-state.json", "{\"n\":2}\n");
  put(root, "specs/topic/slice-queue.json", "{}\n");
  put(root, "specs/topic/evidence/accepted-delivery-contract-1.json", "{}\n");
  const log = [];
  const before = head(root);
  const out = runCheckpointCommit({ repoRoot: root, messageFile: "scratch/msg.txt", dryRun: false }, { git: recordingGit(log) });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.notEqual(head(root), before);
  assert.equal(out.receipt.commit, head(root));
  const message = git(root, ["log", "-1", "--format=%B"]).stdout.trimEnd().split("\n");
  assert.deepEqual(message.slice(-2), ["AI-Assisted: true", "Checkpoint-Act: elephant"]);
  assert.equal(message.at(-3), "");
  assert.ok(existsSync(join(root, ".git", "hook-ran")), "the pre-commit hook must have run");
  const commitCalls = log.filter((args) => args[0] === "commit");
  assert.equal(commitCalls.length, 1);
  assert.ok(!commitCalls[0].some((a) => a === "--no-verify" || a === "-n"), "commit must not skip hooks");
  const paths = git(root, ["show", "--name-only", "--format=", "HEAD"]).stdout.trim().split("\n").sort();
  assert.deepEqual(paths, ["docs/state.md", "project/pipeline-state.json", "specs/topic/evidence/accepted-delivery-contract-1.json", "specs/topic/slice-queue.json"]);
  assert.equal(git(root, ["status", "--porcelain", "-uall"]).stdout.includes("docs/state.md"), false);
});

test("(ii) one disallowed path (a .mjs under plugins/) refuses and commits nothing", () => {
  const root = makeRepo();
  put(root, "docs/state.md", "state 2\n");
  put(root, "plugins/x/foo.mjs", "export {};\n");
  const before = head(root);
  const out = runCheckpointCommit({ repoRoot: root, messageFile: "scratch/msg.txt", dryRun: false });
  assert.equal(out.ok, false);
  assert.equal(out.code, "CHECKPOINT-PATH-OUTSIDE-ALLOWLIST");
  assert.deepEqual(out.paths, ["plugins/x/foo.mjs"]);
  assert.equal(head(root), before);
  assert.equal(git(root, ["diff", "--cached", "--name-only"]).stdout, "", "nothing may be staged by a refused run");
});

test("(iii) a staged path outside the allowlist refuses", () => {
  const root = makeRepo();
  put(root, "plugins/x/foo.mjs", "export {};\n");
  git(root, ["add", "--", "plugins/x/foo.mjs"]);
  put(root, "docs/state.md", "state 2\n");
  const before = head(root);
  const out = runCheckpointCommit({ repoRoot: root, messageFile: "scratch/msg.txt", dryRun: false });
  assert.equal(out.ok, false);
  assert.equal(out.code, "CHECKPOINT-INDEX-OUTSIDE-ALLOWLIST");
  assert.deepEqual(out.paths, ["plugins/x/foo.mjs"]);
  assert.equal(head(root), before);
});

test("(iv) an empty change refuses", () => {
  const root = makeRepo();
  const before = head(root);
  const out = runCheckpointCommit({ repoRoot: root, messageFile: "scratch/msg.txt", dryRun: false });
  assert.equal(out.ok, false);
  assert.equal(out.code, "CHECKPOINT-EMPTY");
  assert.equal(head(root), before);
});

test("(v) --dry-run prints the receipt shape and commits nothing", () => {
  const root = makeRepo();
  put(root, "docs/state.md", "state 2\n");
  const before = head(root);
  const run = spawnSync(process.execPath, [SCRIPT, "--repo-root", root, "--message-file", "scratch/msg.txt", "--dry-run"], { encoding: "utf8", shell: false });
  assert.equal(run.status, 0, run.stderr);
  const receipt = JSON.parse(run.stdout);
  assert.equal(receipt.schema, "pipeline.checkpoint-commit-receipt.v1");
  assert.equal(receipt.dryRun, true);
  assert.equal(receipt.committed, false);
  assert.deepEqual(receipt.paths, ["docs/state.md"]);
  assert.deepEqual(receipt.trailers, ["AI-Assisted: true", "Checkpoint-Act: elephant"]);
  assert.equal(head(root), before);
  assert.equal(git(root, ["diff", "--cached", "--name-only"]).stdout, "");
  assert.equal(run.stdout.includes(root), false, "a receipt carries no absolute path");
});

test("(viii) a message file outside scratch/ or already carrying provenance trailers refuses", () => {
  const root = makeRepo();
  put(root, "docs/state.md", "state 2\n");
  put(root, "notes.txt", "chore: x\n");
  const outside = runCheckpointCommit({ repoRoot: root, messageFile: "notes.txt", dryRun: false });
  assert.equal(outside.code, "CHECKPOINT-MESSAGE-FILE-INVALID");
  const traversal = runCheckpointCommit({ repoRoot: root, messageFile: "scratch/../notes.txt", dryRun: false });
  assert.equal(traversal.code, "CHECKPOINT-MESSAGE-FILE-INVALID");
  put(root, "scratch/own.txt", "chore: x\n\nDispatch: stage-0 (elephant)\nAI-Assisted: true\n");
  const own = runCheckpointCommit({ repoRoot: root, messageFile: "scratch/own.txt", dryRun: false });
  assert.equal(own.code, "CHECKPOINT-MESSAGE-HAS-PROVENANCE");
  put(root, "scratch/co.txt", "chore: x\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n");
  const co = runCheckpointCommit({ repoRoot: root, messageFile: "scratch/co.txt", dryRun: false });
  assert.equal(co.code, "CHECKPOINT-MESSAGE-CORRELATION");
  assert.equal(readFileSync(join(root, "docs/state.md"), "utf8"), "state 2\n");
});
