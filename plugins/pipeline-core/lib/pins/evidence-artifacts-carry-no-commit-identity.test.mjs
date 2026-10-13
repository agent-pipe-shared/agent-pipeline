// SPDX-License-Identifier: SUL-1.0
// Regression pin: pipeline.evidence-artifacts-carry-no-commit-identity (ALF-C-P2-07, AC-170).
// Original acceptance (backlog 2026-10-08): the evidence header written by capture-evidence.mjs
// records HEAD, tree and a dirty flag, so a Critic can bind a captured trajectory to a SHA; a test
// pins it. Every case drives the real module / real CLI; fixtures are throwaway repos under scratch/.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { captureEvidence, formatArtifact, readHeadIdentity } from "../../scripts/capture-evidence.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = resolve(HERE, "../../scripts/capture-evidence.mjs");
const SCRATCH = resolve(HERE, "../../../../scratch");
const OID = /^[0-9a-f]{40}$/u;

function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout.trim();
}

function makeFixtureRepo() {
  mkdirSync(SCRATCH, { recursive: true });
  const dir = mkdtempSync(join(SCRATCH, "evidence-identity-pin-"));
  git(dir, ["init"]);
  writeFileSync(join(dir, "tracked.txt"), "one\n");
  git(dir, ["add", "tracked.txt"]);
  git(dir, ["-c", "user.name=Pin", "-c", "user.email=pin@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", "init"]);
  return dir;
}

function runCli(cwd, childScript = "process.exit(0)") {
  const result = spawnSync(
    process.execPath,
    [CLI_PATH, "--out", "evidence.txt", "--label", "identity-pin", "--", "node", "-e", childScript],
    { cwd, encoding: "utf8" },
  );
  const artifactPath = join(cwd, "evidence.txt");
  return { result, artifact: existsSync(artifactPath) ? readFileSync(artifactPath, "utf8") : null };
}

function withFixture(fn) {
  const dir = makeFixtureRepo();
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("identity pin: header head equals git rev-parse HEAD (40-hex)", () => withFixture((dir) => {
  const { result, artifact } = runCli(dir);
  assert.equal(result.status, 0, result.stderr);
  const head = git(dir, ["rev-parse", "HEAD"]);
  assert.match(head, OID);
  assert.ok(artifact.split("\n").includes(`head: ${head}`));
}));

test("identity pin: header tree equals git rev-parse HEAD^{tree} (40-hex)", () => withFixture((dir) => {
  const { artifact } = runCli(dir);
  const tree = git(dir, ["rev-parse", "HEAD^{tree}"]);
  assert.match(tree, OID);
  assert.ok(artifact.split("\n").includes(`tree: ${tree}`));
}));

test("identity pin: dirty is false on a clean repository", () => withFixture((dir) => {
  const { artifact } = runCli(dir);
  assert.ok(artifact.split("\n").includes("dirty: false"));
}));

test("identity pin: dirty is true after a tracked file is modified", () => withFixture((dir) => {
  writeFileSync(join(dir, "tracked.txt"), "two\n");
  const { artifact } = runCli(dir);
  assert.ok(artifact.split("\n").includes("dirty: true"));
}));

test("identity pin: dirty is true with only an untracked file present", () => withFixture((dir) => {
  writeFileSync(join(dir, "untracked.txt"), "x\n");
  const { artifact } = runCli(dir);
  assert.ok(artifact.split("\n").includes("dirty: true"));
}));

test("identity pin: head/tree track a new commit (not a cached value)", () => withFixture((dir) => {
  const before = runCli(dir).artifact;
  rmSync(join(dir, "evidence.txt"), { force: true });
  writeFileSync(join(dir, "tracked.txt"), "three\n");
  git(dir, ["add", "tracked.txt"]);
  git(dir, ["-c", "user.name=Pin", "-c", "user.email=pin@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", "second"]);
  const after = runCli(dir).artifact;
  assert.notEqual(before.match(/^head: .*$/m)[0], after.match(/^head: .*$/m)[0]);
  assert.notEqual(before.match(/^tree: .*$/m)[0], after.match(/^tree: .*$/m)[0]);
  assert.ok(after.split("\n").includes(`head: ${git(dir, ["rev-parse", "HEAD"])}`));
}));

test("identity pin: head, tree, dirty sit together after exitCode and before stdout, in order", () => withFixture((dir) => {
  writeFileSync(join(dir, "tracked.txt"), "two\n");
  const { artifact } = runCli(dir, "console.log('hi');process.exit(3)");
  const lines = artifact.split("\n");
  const header = lines.slice(0, lines.indexOf("--- stdout ---"));
  assert.deepEqual(header.map((l) => l.slice(0, l.indexOf(":"))), ["command", "label", "exitCode", "head", "tree", "dirty"]);
  assert.ok(header.includes("exitCode: 3"), "identity must not displace the recorded exit code");
}));

test("identity pin: the CLI still exits with the wrapped exit code while recording identity", () => withFixture((dir) => {
  const { result, artifact } = runCli(dir, "process.exit(3)");
  assert.equal(result.status, 3);
  assert.match(artifact, /^head: [0-9a-f]{40}$/m);
}));

test("identity pin: readHeadIdentity returns the exact HEAD/tree/dirty strings and is frozen", () => withFixture((dir) => {
  const identity = readHeadIdentity(dir);
  assert.deepEqual({ ...identity }, {
    head: git(dir, ["rev-parse", "HEAD"]),
    tree: git(dir, ["rev-parse", "HEAD^{tree}"]),
    dirty: "false",
  });
  assert.ok(Object.isFrozen(identity));
}));

test("identity pin: outside a Git repository all three identity lines read unavailable", () => {
  mkdirSync(SCRATCH, { recursive: true });
  const dir = mkdtempSync(join(SCRATCH, "evidence-identity-pin-nogit-"));
  const previous = process.env.GIT_CEILING_DIRECTORIES;
  // The fixture lives inside the outer checkout; a ceiling at scratch/ stops git discovery there.
  process.env.GIT_CEILING_DIRECTORIES = SCRATCH;
  try {
    captureEvidence({
      command: ["node", "-e", "process.exit(0)"],
      label: "identity-pin",
      out: "evidence.txt",
      cwd: dir,
      repoRoot: join(SCRATCH, "synthetic-root"),
      homeDir: join(SCRATCH, "synthetic-home"),
    });
    const lines = readFileSync(join(dir, "evidence.txt"), "utf8").split("\n");
    assert.ok(lines.includes("head: unavailable"));
    assert.ok(lines.includes("tree: unavailable"));
    assert.ok(lines.includes("dirty: unavailable"));
  } finally {
    if (previous === undefined) delete process.env.GIT_CEILING_DIRECTORIES;
    else process.env.GIT_CEILING_DIRECTORIES = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("identity pin: formatArtifact writes the identity lines only when supplied", () => {
  const identity = { head: "a".repeat(40), tree: "b".repeat(40), dirty: "false" };
  const withIdentity = formatArtifact({ command: "c", label: "l", exitCode: 0, stdout: "", stderr: "", identity });
  assert.ok(withIdentity.startsWith(`command: c\nlabel: l\nexitCode: 0\nhead: ${identity.head}\ntree: ${identity.tree}\ndirty: false\n--- stdout ---`));
  const without = formatArtifact({ command: "c", label: "l", exitCode: 0, stdout: "", stderr: "" });
  assert.ok(!/^head:/m.test(without));
});

test("identity pin: JSON format binds the candidate commit and tree, and refuses a dirty worktree", () => withFixture((dir) => {
  const jsonRun = () => spawnSync(
    process.execPath,
    [CLI_PATH, "--out", "evidence.json", "--label", "identity-pin", "--format", "json", "--", "node", "-e", "process.exit(0)"],
    { cwd: dir, encoding: "utf8" },
  );
  const clean = jsonRun();
  assert.equal(clean.status, 0, clean.stderr);
  const parsed = JSON.parse(readFileSync(join(dir, "evidence.json"), "utf8"));
  assert.deepEqual(parsed.candidate, { commit: git(dir, ["rev-parse", "HEAD"]), tree: git(dir, ["rev-parse", "HEAD^{tree}"]) });
  rmSync(join(dir, "evidence.json"), { force: true });
  writeFileSync(join(dir, "tracked.txt"), "dirty\n");
  const dirty = jsonRun();
  assert.equal(dirty.status, 1);
  assert.match(dirty.stderr, /clean worktree/);
  assert.ok(!existsSync(join(dir, "evidence.json")), "a dirty JSON capture must write no artifact");
}));
