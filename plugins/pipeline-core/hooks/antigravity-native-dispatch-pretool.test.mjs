#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, openSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { prepareAntigravityNativeDispatch } from "../lib/antigravity-native-dispatch-coordinator.mjs";
import { ROLE_DISPATCH_REQUEST_SCHEMA } from "../lib/role-dispatch-preflight.mjs";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";

const hook = join(dirname(fileURLToPath(import.meta.url)), "antigravity-pretool-guard.mjs");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const git = (root, ...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

function fixture() {
  const parent = process.env.PIPELINE_TEST_TMPDIR ?? join(process.cwd(), "scratch");
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, "agy-native-hook-"));
  writeFileSync(join(root, "input.txt"), "input\n");
  git(root, "init", "-q");
  git(root, "config", "user.name", "Fixture");
  git(root, "config", "user.email", "fixture@example.invalid");
  git(root, "add", "input.txt");
  git(root, "commit", "-q", "-m", "fixture");
  const nativeSubagents = [{ TypeName: "consult-advisor", Role: "Advisor", Prompt: "input.txt\nmodel: gemini-3.7\nruleset-sha: local" }];
  const packets = [{
    schema: ROLE_DISPATCH_REQUEST_SCHEMA,
    dispatchId: "agy-native-hook-0",
    transport: "antigravity",
    role: "pipeline-core:consult-advisor",
    prompt: nativeSubagents[0].Prompt,
    candidate: { commit: git(root, "rev-parse", "HEAD"), tree: git(root, "rev-parse", "HEAD^{tree}") },
    requiredPaths: ["input.txt"],
    requiredPathSha256: { "input.txt": hash("input\n") },
    resultDestination: { kind: "return" },
  }];
  return { root, nativeSubagents, packets };
}

function invoke(root, nativeSubagents) {
  return spawnSync(process.execPath, [hook], {
    cwd: root,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: "utf8",
    shell: false,
    input: JSON.stringify({ workspacePaths: [root], toolCall: { name: "invoke_subagent", args: { Subagents: nativeSubagents } } }),
    timeout: 8_000,
  });
}

function foreignEntry() {
  return { TypeName: "customer-researcher", Role: "Customer Researcher", Prompt: "Inspect the customer fixture." };
}

function packetFor(value, entry, dispatchId) {
  return {
    schema: ROLE_DISPATCH_REQUEST_SCHEMA,
    dispatchId,
    transport: "antigravity",
    role: entry.TypeName,
    prompt: entry.Prompt,
    candidate: structuredClone(value.packets[0].candidate),
    requiredPaths: ["input.txt"],
    requiredPathSha256: { "input.txt": hash("input\n") },
    resultDestination: { kind: "return" },
  };
}

const cases = [
  ["an unrelated host-defined array remains outside Pipeline artifact authority", ({ root }) => {
    const result = invoke(root, [foreignEntry()]);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stderr, /AGY-NATIVE-ARTIFACT-MISSING/u);
  }],
  ["missing preparation is denied by the immediate native hook", ({ root, nativeSubagents }) => {
    const result = invoke(root, nativeSubagents);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /AGY-NATIVE-ARTIFACT-MISSING/u);
  }],
  ["one complete prepared batch is allowed once", (value) => {
    assert.equal(prepareAntigravityNativeDispatch(value).status, "prepared");
    assert.equal(invoke(value.root, value.nativeSubagents).status, 0);
    const replay = invoke(value.root, value.nativeSubagents);
    assert.equal(replay.status, 2);
    assert.match(replay.stderr, /AGY-NATIVE-ARTIFACT-MISSING/u);
  }],
  ["an expired unconsumed batch is replaced before the immediate hook admits the fresh batch", (value) => {
    assert.equal(prepareAntigravityNativeDispatch({ ...value, nowEpochMs: 1_000, ttlMs: 1_000 }).status, "prepared");
    assert.equal(prepareAntigravityNativeDispatch({ ...value, nowEpochMs: Date.now() }).status, "prepared");
    assert.equal(invoke(value.root, value.nativeSubagents).status, 0);
  }],
  ["a mixed host and Pipeline array requires one preparation for the complete array", (value) => {
    const foreign = foreignEntry();
    const nativeSubagents = [foreign, ...value.nativeSubagents];
    const packets = [packetFor(value, foreign, "agy-native-hook-foreign"), ...value.packets];
    const missing = invoke(value.root, nativeSubagents);
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /AGY-NATIVE-ARTIFACT-MISSING/u);
    assert.equal(prepareAntigravityNativeDispatch({ root: value.root, packets, nativeSubagents }).status, "prepared");
    assert.equal(invoke(value.root, nativeSubagents).status, 0);
  }],
  ["preparing only the Pipeline member cannot authorize a mixed array", (value) => {
    assert.equal(prepareAntigravityNativeDispatch(value).status, "prepared");
    const foreign = foreignEntry();
    const result = invoke(value.root, [foreign, ...value.nativeSubagents]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /AGY-NATIVE-ARTIFACT-MISSING/u);
  }],
  ["a mutated native prompt has zero eligibility", (value) => {
    assert.equal(prepareAntigravityNativeDispatch(value).status, "prepared");
    const changed = structuredClone(value.nativeSubagents);
    changed[0].Prompt += "\nchanged";
    const result = invoke(value.root, changed);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /AGY-NATIVE-ARTIFACT-MISSING/u);
  }],
  ["candidate movement invalidates the prepared batch at the hook", (value) => {
    assert.equal(prepareAntigravityNativeDispatch(value).status, "prepared");
    writeFileSync(join(value.root, "later.txt"), "later\n");
    git(value.root, "add", "later.txt");
    git(value.root, "commit", "-q", "-m", "later");
    const result = invoke(value.root, value.nativeSubagents);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /AGY-NATIVE-ARTIFACT-STALE/u);
  }],
].map(([name, run], index) => ({ id: `ANDP${String(index + 1).padStart(2, "0")}`, name, run }));

for (const entry of cases) {
  const run = entry.run;
  entry.run = () => {
    const value = fixture();
    try { return run(value); }
    finally { rmSync(value.root, { recursive: true, force: true }); }
  };
}
assert.equal(cases.length, 8, "the complete Antigravity native pretool corpus must register before execution");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: cases, fd: completionFd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
