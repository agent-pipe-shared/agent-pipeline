#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { runObservedCriticPreflight } from "./observe-critic-preflight.mjs";

const here = new URL(".", import.meta.url);
const observed = new URL("observe-critic-preflight.mjs", here).pathname;
const direct = new URL("critic-dispatch-preflight.mjs", here).pathname;
const workspace = process.cwd();
function git(root, args) { return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim(); }
function commit(root, message) {
  git(root, ["add", "."]);
  git(root, ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", message]);
  return git(root, ["rev-parse", "HEAD"]);
}
function run(script, args) { return spawnSync(process.execPath, [script, ...args], { encoding: "utf8" }); }
function fixture() {
  const root = mkdtempSync("scratch/observed-critic-preflight-");
  for (const path of ["project", "specs/sprint-alfred-epic", ".claude", "governance/guidelines", "governance/policies", "evidence"]) mkdirSync(join(root, path), { recursive: true });
  // Use the repository's already-valid neutral authority bytes; the fixture
  // changes only an unrelated candidate file, so its bound spec remains exact.
  for (const path of ["project/pipeline.yaml", "project/pipeline-state.json", "project/pipeline.json", "project/guard-config.json", "project/guard-override.log.jsonl", "specs/sprint-alfred-epic/spec.md"])
    cpSync(join(workspace, path), join(root, path));
  writeFileSync(join(root, ".claude/pipeline.yaml"), "governance:\n  guidelines_path: governance/guidelines\n  policies_path: governance/policies\n");
  writeFileSync(join(root, "governance/guidelines/review.md"), "Review changed code.\n");
  writeFileSync(join(root, "governance/policies/checklist.md"), "- verify\n");
  writeFileSync(join(root, "work.txt"), "base\n");
  git(root, ["init", "-q"]);
  const base = commit(root, "base");
  writeFileSync(join(root, "work.txt"), "candidate\n");
  const candidate = commit(root, "candidate");
  const tree = git(root, ["rev-parse", "HEAD^{tree}"]);
  writeFileSync(join(root, "evidence/verify.json"), `${JSON.stringify({ candidate: { commit: candidate, tree } })}\n`);
  return { root, base, candidate };
}
function args(fx, evidence = true) {
  const result = ["--root", fx.root, "--base", fx.base, "--candidate", fx.candidate, "--spec", "specs/sprint-alfred-epic/spec.md"];
  if (evidence) result.push("--evidence", "evidence/verify.json");
  return result;
}

test("observed controller preserves real rejected producer bytes and retains same-lineage immutable receipts", () => {
  const fx = fixture();
  try {
    const create = run(observed, ["create", "--root", fx.root, "--spec", "specs/sprint-alfred-epic/spec.md"]);
    assert.equal(create.status, 0, `${create.stdout}${create.stderr}`);
    const operationId = JSON.parse(create.stdout).handle.operationId;
    const producerArgs = args(fx, false);
    const bare = run(direct, producerArgs);
    const api = runObservedCriticPreflight({ root: fx.root, operationId, argv: producerArgs.slice(2) });
    assert.equal(api.collection.status, "created", JSON.stringify(api.collection));
    const observedRun = run(observed, ["run", "--root", fx.root, "--operation", operationId, "--", ...producerArgs.slice(2)]);
    assert.equal(observedRun.status, bare.status);
    assert.equal(observedRun.stdout, bare.stdout);
    assert.equal(observedRun.stderr, bare.stderr);
    const retry = run(observed, ["run", "--root", fx.root, "--operation", operationId, "--", ...producerArgs.slice(2)]);
    assert.equal(retry.stderr, bare.stderr);
    const receipts = readdirSync(join(fx.root, "evidence/interruption-receipts"));
    assert.equal(receipts.length, 3);
    const lineage = receipts.map((entry) => JSON.parse(readFileSync(join(fx.root, "evidence/interruption-receipts", entry, "receipt.json"), "utf8")).lineageId);
    assert.equal(new Set(lineage).size, 1);
    const status = run(observed, ["status", "--root", fx.root, "--operation", operationId]);
    assert.equal(status.status, 0, status.stderr);
    assert.equal(JSON.parse(status.stdout).operation.status, "observed");
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});

test("packet-ready and the direct CLI never auto-write an observation", () => {
  const fx = fixture();
  try {
    const bare = run(direct, args(fx));
    assert.equal(bare.status, 0, bare.stderr);
    assert.equal(existsSync(join(fx.root, "evidence/interruption-collection")), false);
    assert.equal(existsSync(join(fx.root, "evidence/interruption-receipts")), false);
    const create = run(observed, ["create", "--root", fx.root, "--spec", "specs/sprint-alfred-epic/spec.md"]);
    const operationId = JSON.parse(create.stdout).handle.operationId;
    const result = run(observed, ["run", "--root", fx.root, "--operation", operationId, "--", ...args(fx).slice(2)]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(fx.root, "evidence/interruption-receipts")), true);
    assert.deepEqual(readdirSync(join(fx.root, "evidence/interruption-receipts")), []);
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});

test("owner phase changes retain the operation lineage while recording the current phase", () => {
  const fx = fixture();
  try {
    const create = run(observed, ["create", "--root", fx.root, "--spec", "specs/sprint-alfred-epic/spec.md"]);
    assert.equal(create.status, 0, `${create.stdout}${create.stderr}`);
    const operationId = JSON.parse(create.stdout).handle.operationId;
    const producerArgs = args(fx, false).slice(2);
    const bareBefore = run(direct, ["--root", fx.root, ...producerArgs]);
    const first = run(observed, ["run", "--root", fx.root, "--operation", operationId, "--", ...producerArgs]);
    assert.equal(first.status, bareBefore.status);
    assert.equal(first.stdout, bareBefore.stdout);
    assert.equal(first.stderr, bareBefore.stderr);
    const statePath = join(fx.root, "project/pipeline-state.json");
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    state.activeFeature.phase = "verification";
    writeFileSync(statePath, `${JSON.stringify(state)}\n`);
    const bareAfter = run(direct, ["--root", fx.root, ...producerArgs]);
    assert.equal(bareAfter.status, bareBefore.status);
    assert.equal(bareAfter.stdout, bareBefore.stdout);
    assert.equal(bareAfter.stderr, bareBefore.stderr);
    const second = run(observed, ["run", "--root", fx.root, "--operation", operationId, "--", ...producerArgs]);
    assert.equal(second.status, bareAfter.status);
    assert.equal(second.stdout, bareAfter.stdout);
    assert.equal(second.stderr, bareAfter.stderr);
    const receipts = readdirSync(join(fx.root, "evidence/interruption-receipts"));
    assert.equal(receipts.length, 2);
    const entries = receipts.map((entry) => JSON.parse(readFileSync(join(fx.root, "evidence/interruption-receipts", entry, "receipt.json"), "utf8")));
    assert.equal(new Set(entries.map((entry) => entry.lineageId)).size, 1);
    assert.deepEqual(new Set(entries.map((entry) => entry.scope.phase)), new Set(["implementation", "verification"]));
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});
