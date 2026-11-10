// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { inspectPublicationReadback, recordPublicationReadback } from "./publication-readback.mjs";

const SCRIPT = fileURLToPath(new URL("./publication-readback.mjs", import.meta.url));
const DESTINATION = "refs/heads/main";

function fixture(run) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "publication-readback-")));
  const root = join(base, "work"), bare = join(base, "remote.git");
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  try {
    execFileSync("git", ["init", "-q", "--bare", bare]);
    execFileSync("git", ["init", "-q", root]);
    git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
    const commit = (name) => { writeFileSync(join(root, name), `${name}\n`); git("add", name); git("commit", "-qm", name); return git("rev-parse", "HEAD"); };
    const head = commit("one.txt");
    git("remote", "add", "publish", bare);
    git("push", "-q", "publish", `HEAD:${DESTINATION}`);
    run({ root, git, commit, head, records: join(root, ".git", "agent-pipeline", "publication-readback", "records.jsonl") });
  } finally { rmSync(base, { recursive: true, force: true }); }
}
const record = (context, deps) => recordPublicationReadback({ root: context.root, remote: "publish", destination: DESTINATION }, deps);

test("records what the remote really holds, privately, with the working tree untouched and no URL written", () => fixture((context) => {
  assert.equal(inspectPublicationReadback(context).result.status, "no-record");
  const { exitCode, result } = record(context);
  assert.equal(exitCode, 0);
  assert.equal(result.status, "confirmed");
  assert.equal(result.record.remoteCommit, context.head);
  assert.match(result.handoverLine, /refs\/heads\/main on remote publish holds/u);
  assert.equal(context.git("status", "--porcelain"), "", "a pushed project needs no commit to say so");
  assert.doesNotMatch(readFileSync(context.records, "utf8"), /remote\.git/u, "the URL can carry a credential");
  assert.equal(inspectPublicationReadback(context).result.latest.status, "confirmed");
}));

test("an identical repeat appends nothing; a later local commit is told apart and chained", () => fixture((context) => {
  record(context);
  assert.equal(record(context).result.unchanged, true);
  assert.equal(readFileSync(context.records, "utf8").trim().split("\n").length, 1);
  context.commit("two.txt");
  const ahead = record(context);
  assert.equal(ahead.exitCode, 0);
  assert.equal(ahead.result.status, "local-ahead");
  assert.equal(inspectPublicationReadback(context).result.count, 2);
  assert.notEqual(ahead.result.record.previousSha256, null);
}));

test("a remote holding something else is a typed differs with a non-zero exit", () => fixture((context) => {
  context.git("checkout", "-q", "--orphan", "other");
  const other = context.commit("other.txt");
  const result = record(context);
  assert.equal(result.exitCode, 1);
  assert.equal(result.result.status, "differs");
  assert.notEqual(result.result.record.remoteCommit, other);
}));

test("a changed or removed line is detected and nothing more is written", () => fixture((context) => {
  record(context);
  context.commit("two.txt");
  record(context);
  const lines = readFileSync(context.records, "utf8").trim().split("\n");
  writeFileSync(context.records, `${lines[1]}\n`);
  const damaged = record(context);
  assert.equal(damaged.exitCode, 1);
  assert.equal(damaged.result.code, "PRB-RECORDS-DAMAGED");
  assert.equal(readFileSync(context.records, "utf8").trim().split("\n").length, 1, "append-only, also when refusing");
  assert.equal(inspectPublicationReadback(context).result.code, "PRB-RECORDS-DAMAGED");
}));

test("an unknown remote or an unreadable answer refuses and writes nothing", () => fixture((context) => {
  assert.equal(recordPublicationReadback({ root: context.root, remote: "nope", destination: DESTINATION }).result.code, "PRB-REMOTE-UNKNOWN");
  assert.equal(recordPublicationReadback({ root: context.root, remote: "publish", destination: "refs/heads/absent" }).result.code, "PRB-REMOTE-UNREADABLE");
  assert.equal(inspectPublicationReadback(context).result.status, "no-record");
}));

test("the command line: one JSON line, usage is typed, --help is free", () => fixture((context) => {
  const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
  const done = run("record", "--root", context.root, "--remote", "publish", "--destination", DESTINATION);
  assert.equal(done.status, 0, done.stdout);
  assert.equal(JSON.parse(done.stdout).status, "confirmed");
  assert.equal(JSON.parse(run("inspect", "--root", context.root).stdout).status, "read");
  assert.equal(run("record", "--root", context.root, "--remote", "publish", "--destination", "main").status, 2, "a bare branch name is no destination");
  assert.equal(run("record", "--root", context.root, "--root", context.root, "--remote", "publish", "--destination", DESTINATION).status, 2);
  const help = run("--help");
  assert.equal(help.status, 0);
  assert.match(help.stdout, /^usage: /u);
}));
