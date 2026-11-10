#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// LOOP-A4 (Antigravity greenfield 2026-11-09): `Workspace: "branch"` cuts the child's worktree from the COMMITTED HEAD, so untracked files of the
// parent are not in it, and a run lost a PO turn to them. The prepare step names them before it reports `prepared` and says the step that
// resolves it. It never refuses on them (the guard's own check deliberately ignores untracked files) and says nothing for a call that does not
// ask for a branch workspace.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { ROLE_DISPATCH_REQUEST_SCHEMA } from "../lib/role-dispatch-preflight.mjs";
import { prepareFromRequest } from "./antigravity-native-dispatch-prepare.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const git = (root, ...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const prepareScript = join(dirname(fileURLToPath(import.meta.url)), "antigravity-native-dispatch-prepare.mjs");

function withRepository(run) {
  const parent = process.env.PIPELINE_TEST_TMPDIR ?? join(process.cwd(), "scratch");
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, "agy-prepare-untracked-"));
  try {
    writeFileSync(join(root, "input-a.txt"), "a\n");
    writeFileSync(join(root, ".gitignore"), "ignored-dir/\n");
    git(root, "init", "-q");
    git(root, "config", "user.name", "Fixture");
    git(root, "config", "user.email", "fixture@example.invalid");
    git(root, "add", "input-a.txt", ".gitignore");
    git(root, "commit", "-q", "-m", "fixture");
    run(root);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function flatRequest(root, extra = {}) {
  const native = { TypeName: "consult-advisor", Role: "Advisor", Prompt: "Inspect input-a.txt. Model: gemini-3.7; Ruleset-SHA: local.", Model: "pro", ...extra };
  const packet = {
    schema: ROLE_DISPATCH_REQUEST_SCHEMA,
    dispatchId: "agy-native-0",
    transport: "antigravity",
    role: `pipeline-core:${native.TypeName}`,
    prompt: native.Prompt,
    candidate: { commit: git(root, "rev-parse", "HEAD"), tree: git(root, "rev-parse", "HEAD^{tree}") },
    requiredPaths: ["input-a.txt"],
    requiredPathSha256: { "input-a.txt": hash("a\n") },
    resultDestination: { kind: "return" },
  };
  return { packets: [packet], ...native };
}

test("C23: --help and -h print the usage with the request shape and exit 0", () => {
  for (const flag of ["--help", "-h"]) {
    const res = spawnSync(process.execPath, [prepareScript, flag], { encoding: "utf8" });
    assert.equal(res.status, 0, res.stderr);
    for (const needle of ["prepare --root", "--request", "packets", "Subagents", "resultDestination", "antigravity-native-dispatch.md"]) assert.ok(res.stdout.includes(needle), needle);
  }
  const combined = spawnSync(process.execPath, [prepareScript, "--help", "extra"], { encoding: "utf8" });
  assert.equal(combined.status, 2, "help combines with nothing");
  assert.match(combined.stdout, /AGY-NATIVE-REQUEST-JSON/u);
});

test("A4: a branch workspace with untracked files is prepared, names the files and the step, and does not refuse", () => withRepository((root) => {
  mkdirSync(join(root, "scratch"));
  writeFileSync(join(root, "scratch", "notes.txt"), "n\n");
  writeFileSync(join(root, "scratch", "a name with spaces.txt"), "n\n");
  const result = prepareFromRequest(flatRequest(root, { Workspace: "branch" }), root);
  assert.equal(result.status, "prepared", JSON.stringify(result));
  assert.equal(result.untrackedBeforeBranch.count, 2);
  assert.deepEqual(result.untrackedBeforeBranch.files, ["scratch/a name with spaces.txt", "scratch/notes.txt"]);
  assert.match(result.untrackedBeforeBranch.step, /commit them/u);
  assert.match(result.untrackedBeforeBranch.step, /\.gitignore/u);
  assert.match(result.untrackedBeforeBranch.step, /Workspace: "branch"/u);
}));

test("A4: a clean tree, an ignored file and a call without a branch workspace carry no notice", () => withRepository((root) => {
  assert.equal(Object.hasOwn(prepareFromRequest(flatRequest(root, { Workspace: "branch" }), root), "untrackedBeforeBranch"), false, "a clean tree says nothing");
  mkdirSync(join(root, "ignored-dir"));
  writeFileSync(join(root, "ignored-dir", "x.txt"), "x\n");
  assert.equal(Object.hasOwn(prepareFromRequest(flatRequest(root, { Workspace: "branch" }), root), "untrackedBeforeBranch"), false, "an ignored file is not untracked");
  writeFileSync(join(root, "loose.txt"), "x\n");
  for (const extra of [{}, { Workspace: "inherit" }, { Workspace: "share" }]) {
    const result = prepareFromRequest(flatRequest(root, extra), root);
    assert.equal(result.status, "prepared", JSON.stringify(result));
    assert.equal(Object.hasOwn(result, "untrackedBeforeBranch"), false, JSON.stringify(extra));
  }
}));

test("A4: a long list is bounded and the CLI never counts its own request file", () => withRepository((root) => {
  for (let index = 0; index < 8; index += 1) writeFileSync(join(root, `loose-${index}.txt`), "x\n");
  writeFileSync(join(root, "agy-request.json"), `${JSON.stringify(flatRequest(root, { Workspace: "branch" }))}\n`);
  const run = spawnSync(process.execPath, [prepareScript, "prepare", "--root", root, "--request", "agy-request.json"], { cwd: root, encoding: "utf8", shell: false });
  assert.equal(run.status, 0, run.stderr);
  const output = JSON.parse(run.stdout);
  assert.equal(output.status, "prepared");
  assert.equal(output.untrackedBeforeBranch.count, 8, "the request file the agent itself wrote is not one of the files to resolve");
  assert.equal(output.untrackedBeforeBranch.files.length, 5);
  assert.ok(!output.untrackedBeforeBranch.files.includes("agy-request.json"));
}));
