// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { stopHookDirectory } from "../hooks/publication-readback-stop.mjs";
import { recordPushesAtStop } from "./publication-readback-stop.mjs";

async function fixture(run) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "publication-stop-")));
  const root = join(base, "work"), bare = join(base, "remote.git");
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  try {
    execFileSync("git", ["init", "-q", "--bare", bare]);
    execFileSync("git", ["init", "-q", "-b", "main", root]);
    git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
    const commit = (name) => { writeFileSync(join(root, name), `${name}\n`); git("add", name); git("commit", "-qm", name); return git("rev-parse", "HEAD"); };
    const head = commit("one.txt");
    git("remote", "add", "publish", bare);
    const directory = join(root, ".git", "agent-pipeline", "publication-readback");
    const lines = () => (existsSync(join(directory, "records.jsonl")) ? readFileSync(join(directory, "records.jsonl"), "utf8").trim().split("\n") : []);
    await run({ base, root, bare, git, commit, head, directory, lines });
  } finally { rmSync(base, { recursive: true, force: true }); }
}

test("a push made during the turn is recorded once, with what the remote holds", () => fixture(async ({ root, git, head, lines }) => {
  git("push", "-q", "publish", "HEAD:refs/heads/main");
  const first = await recordPushesAtStop({ cwd: root });
  assert.deepEqual(first.recorded, [{ remote: "publish", destination: "refs/heads/main", commit: head, status: "confirmed" }]);
  assert.equal(lines().length, 1);
  assert.equal(JSON.parse(lines()[0]).remoteCommit, head);
  assert.equal((await recordPushesAtStop({ cwd: root })).skipped, "nothing-new");
  assert.equal(lines().length, 1);
  assert.equal(git("status", "--porcelain"), "", "a pushed project needs no commit to say so");
}));

test("a later local commit does not add a line, a new push does", () => fixture(async ({ root, git, commit, lines }) => {
  git("push", "-q", "publish", "HEAD:refs/heads/main");
  await recordPushesAtStop({ cwd: root });
  const second = commit("two.txt");
  assert.equal((await recordPushesAtStop({ cwd: root })).skipped, "nothing-new");
  assert.equal(lines().length, 1);
  git("push", "-q", "publish", "HEAD:refs/heads/main");
  assert.equal((await recordPushesAtStop({ cwd: root })).recorded[0].commit, second);
  assert.equal(lines().length, 2);
}));

test("no push and a plain fetch record nothing", () => fixture(async ({ base, root, git, lines }) => {
  assert.equal((await recordPushesAtStop({ cwd: root })).skipped, "no-push");
  const other = join(base, "other");
  execFileSync("git", ["clone", "-q", join(base, "remote.git"), other]);
  execFileSync("git", ["-C", other, "config", "user.name", "Fixture"]);
  execFileSync("git", ["-C", other, "config", "user.email", "fixture@example.invalid"]);
  execFileSync("git", ["-C", other, "commit", "-q", "--allow-empty", "-m", "elsewhere"]);
  execFileSync("git", ["-C", other, "push", "-q", "origin", "HEAD:refs/heads/fetched"]);
  git("fetch", "-q", "publish");
  assert.equal((await recordPushesAtStop({ cwd: root })).skipped, "no-push");
  assert.equal(lines().length, 0);
}));

test("outside a repository nothing happens and nothing throws", async () => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "publication-stop-plain-")));
  try { assert.equal((await recordPushesAtStop({ cwd: base })).skipped, "no-repository"); }
  finally { rmSync(base, { recursive: true, force: true }); }
});

test("an unreachable remote writes no record and is not asked again for 15 minutes", () => fixture(async ({ root, bare, git, directory, lines }) => {
  git("push", "-q", "publish", "HEAD:refs/heads/main");
  rmSync(bare, { recursive: true, force: true });
  const start = new Date("2026-11-10T10:00:00.000Z");
  let calls = 0;
  const failing = () => { calls += 1; return { result: { status: "refused", code: "PRB-REMOTE-UNREADABLE" } }; };
  assert.deepEqual((await recordPushesAtStop({ cwd: root }, { now: () => start, recordReadback: failing })).recorded, []);
  assert.equal(calls, 1);
  assert.equal(lines().length, 0);
  assert.ok(existsSync(join(directory, "stop-attempts.json")));
  assert.equal((await recordPushesAtStop({ cwd: root }, { now: () => new Date(start.getTime() + 60_000), recordReadback: failing })).skipped, "nothing-new");
  assert.equal(calls, 1);
  await recordPushesAtStop({ cwd: root }, { now: () => new Date(start.getTime() + 16 * 60_000), recordReadback: failing });
  assert.equal(calls, 2);
}));

test("a second branch and a second remote resolve to the right destination", () => fixture(async ({ root, base, git, head }) => {
  execFileSync("git", ["init", "-q", "--bare", join(base, "second.git")]);
  git("remote", "add", "publish.two", join(base, "second.git"));
  git("push", "-q", "publish.two", "HEAD:refs/heads/release/one");
  git("push", "-q", "publish", "HEAD:refs/heads/main");
  const { recorded } = await recordPushesAtStop({ cwd: root });
  assert.deepEqual(recorded.map(({ remote, destination }) => `${remote} ${destination}`).sort(), ["publish refs/heads/main", "publish.two refs/heads/release/one"]);
  assert.ok(recorded.every(({ commit }) => commit === head));
}));

test("at most three pushes are recorded per Stop; the rest follow at the next one", () => fixture(async ({ root, git, lines }) => {
  for (const branch of ["a", "b", "c", "d"]) git("push", "-q", "publish", `HEAD:refs/heads/${branch}`);
  assert.equal((await recordPushesAtStop({ cwd: root })).recorded.length, 3);
  assert.equal((await recordPushesAtStop({ cwd: root })).recorded.length, 1);
  assert.equal(lines().length, 4);
}));

const HOOK = fileURLToPath(new URL("../hooks/publication-readback-stop.mjs", import.meta.url));
const runHook = (input, cwd) => spawnSync(process.execPath, [HOOK], { cwd, input: JSON.stringify(input), encoding: "utf8", timeout: 30_000, env: { ...process.env, CLAUDE_PROJECT_DIR: "", NODE_OPTIONS: "" } });

test("the hook process records a push only where the Pipeline is enrolled, and always says no decision", () => fixture(async ({ root, git, lines }) => {
  git("push", "-q", "publish", "HEAD:refs/heads/main");
  const outside = runHook({ cwd: root }, root);
  assert.equal(outside.status, 0, outside.stderr);
  assert.equal(outside.stdout, "{}\n");
  assert.equal(lines().length, 0, "a repository that never opted in is left alone");
  mkdirSync(join(root, ".agent-pipeline"));
  writeFileSync(join(root, ".agent-pipeline", "onboarding-consent.json"), JSON.stringify({ schema: "pipeline.onboarding-consent-marker.v1", status: "consent-given-onboarding-incomplete", consentGivenAt: new Date().toISOString() }));
  const enrolled = runHook({ workspacePaths: [root] }, root);
  assert.equal(enrolled.status, 0, enrolled.stderr);
  assert.equal(enrolled.stdout, "{}\n");
  assert.equal(lines().length, 1);
}));

test("the hook process survives input that is not JSON", () => fixture(async ({ root }) => {
  const result = spawnSync(process.execPath, [HOOK], { cwd: root, input: "not JSON", encoding: "utf8", timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "{}\n");
}));

test("the directory comes from the runner's own field, in that order", () => {
  assert.equal(stopHookDirectory({ workspacePaths: ["/w"], cwd: "/c" }, {}, "/f"), "/w");
  assert.equal(stopHookDirectory({ cwd: "/c" }, { CLAUDE_PROJECT_DIR: "/e" }, "/f"), "/c");
  assert.equal(stopHookDirectory({}, { CLAUDE_PROJECT_DIR: "/e" }, "/f"), "/e");
  assert.equal(stopHookDirectory(null, {}, "/f"), "/f");
});
