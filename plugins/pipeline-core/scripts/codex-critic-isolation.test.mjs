#!/usr/bin/env node
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CODEX_CRITIC_POLICY,
  buildCodexCriticInvocation,
  buildExactFixture,
  criticPrompt,
  runCodexCritic,
  sanitizeEnvironment,
} from "./codex-critic-isolation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed += 1; process.stdout.write(`PASS  ${name}\n`); }
  catch (error) { failures.push(`${name}: ${error.message}`); process.stdout.write(`FAIL  ${name} -- ${error.message}\n`); }
}

const verdict = {
  findings: [], deliberately_not_flagged: ["synthetic fixture"], trajectory_verdict: "consistent",
  trajectory_evidence: "synthetic adapter result", briefing_violations: [], pass: true,
};

function fakeSpawn({ valid = true, observeAttempts = true } = {}) {
  return (_command, args) => {
    const child = new EventEmitter();
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.pid = null;
    queueMicrotask(async () => {
      const output = args[args.indexOf("--output-last-message") + 1];
      const nonce = path.basename(output).replace(/\.result\.json$/u, "");
      if (observeAttempts) child.stdout.write(`WRITE-CANARY-${nonce}.txt ${path.join(path.dirname(output), `${nonce}.external-canary.txt`)}`);
      await writeFile(output, valid ? JSON.stringify(verdict) : "{bad json", "utf8");
      child.stdout.end(); child.stderr.end(); child.emit("exit", 0, null);
    });
    return child;
  };
}

await check("policy fixes Sol/max and a read-only ephemeral no-approval invocation", () => {
  const invocation = buildCodexCriticInvocation({ fixtureRoot: "/tmp/fixture", schemaPath: "/tmp/schema.json", resultPath: "/tmp/result.json", env: { PATH: "/bin", GITHUB_TOKEN: "no", AWS_SECRET_ACCESS_KEY: "no" } });
  assert.equal(invocation.command, "codex");
  assert.deepEqual(invocation.options, {
    cwd: "/tmp/fixture", shell: false, windowsHide: true, detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"], env: { PATH: "/bin" },
  });
  for (const required of ["--ignore-user-config", "--strict-config", "--ephemeral", "--model", CODEX_CRITIC_POLICY.model, "--sandbox", "read-only", "--skip-git-repo-check", "--output-schema", "--output-last-message"]) assert.ok(invocation.args.includes(required));
  assert.equal(invocation.args.includes("--dangerously-bypass-approvals-and-sandbox"), false);
  assert.equal(invocation.args.includes("--dangerously-bypass-hook-trust"), false);
  assert.ok(invocation.args.includes('model_reasoning_effort="max"'));
  assert.ok(invocation.args.includes('approval_policy="never"'));
});

await check("environment is an explicit allowlist and removes credential/provider variables", () => {
  assert.deepEqual(sanitizeEnvironment({ PATH: "/bin", HOME: "/home/test", LANG: "C", CI: "true", GH_TOKEN: "x", HTTPS_PROXY: "x", CUSTOM: "x" }), { PATH: "/bin", HOME: "/home/test", LANG: "C" });
});

await check("constructor rejects a fallback effort and non-absolute output sinks", () => {
  assert.throws(() => buildCodexCriticInvocation({ fixtureRoot: "/tmp/f", schemaPath: "/tmp/s", resultPath: "/tmp/r", effort: "high", env: { PATH: "/bin" } }));
  assert.throws(() => buildCodexCriticInvocation({ fixtureRoot: "/tmp/f", schemaPath: "/tmp/s", resultPath: "relative", env: { PATH: "/bin" } }));
});

await check("exact fixture binds committed blobs and rejects path traversal before Git reads", async () => {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  await assert.rejects(() => buildExactFixture({ repoRoot: root, candidateCommit: head, artifactPaths: ["../private"] }), /normalized relative path/u);
  const fixture = await buildExactFixture({ repoRoot: root, candidateCommit: head, artifactPaths: ["plugins/pipeline-core/scripts/critic-verdict.schema.json"] });
  try {
    assert.equal(fixture.manifest.candidateCommit, head);
    assert.equal(fixture.manifest.artifacts.length, 1);
    assert.match(fixture.manifest.artifacts[0].blob, /^[0-9a-f]{40}$/u);
    assert.match(fixture.manifestHash, /^[0-9a-f]{64}$/u);
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
});

await check("prompt names both mandatory denied writes without exposing it in the envelope API", () => {
  const prompt = criticPrompt({ nonce: "a".repeat(32), externalCanaryPath: "/tmp/coordinator/external-canary" });
  assert.match(prompt, /WRITE-CANARY-/u); assert.match(prompt, /external-canary/u); assert.match(prompt, /Do not retry/u);
});

await check("synthetic child yields a pass only with observed attempts and unchanged canaries", async () => {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const fixture = await buildExactFixture({ repoRoot: root, candidateCommit: head, artifactPaths: ["plugins/pipeline-core/scripts/critic-verdict.schema.json"] });
  try {
    const result = await runCodexCritic({ fixture, spawn: fakeSpawn(), env: { PATH: process.env.PATH ?? "/bin" } });
    assert.equal(result.ok, true); assert.equal(result.envelope.verdict, "pass");
    assert.equal(result.envelope.canaries.fileToolAttemptObserved, true); assert.equal(result.envelope.canaries.shellAttemptObserved, true);
    assert.equal(result.envelope.canaries.fixtureUnchanged, true); assert.equal(result.envelope.process.ownedProcessTreeGone, true);
    assert.equal(JSON.stringify(result.envelope).includes("/tmp/"), false);
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
});

await check("missing observed shell attempt and malformed output fail closed", async () => {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const fixture = await buildExactFixture({ repoRoot: root, candidateCommit: head, artifactPaths: ["plugins/pipeline-core/scripts/critic-verdict.schema.json"] });
  try {
    const noAttempt = await runCodexCritic({ fixture, spawn: fakeSpawn({ observeAttempts: false }), env: { PATH: process.env.PATH ?? "/bin" } });
    assert.equal(noAttempt.ok, false);
    const malformed = await runCodexCritic({ fixture, spawn: fakeSpawn({ valid: false }), env: { PATH: process.env.PATH ?? "/bin" } });
    assert.equal(malformed.ok, false); assert.equal(malformed.envelope.verdict, "invalid-or-failed");
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
});

await check("spawn failure is categorical and does not fabricate an envelope", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "codex-critic-spawn-test-"));
  const fixture = { root: fixtureRoot, manifest: { nonce: "b".repeat(32) } };
  try {
    const result = await runCodexCritic({ fixture, spawn() { throw new Error("unavailable"); }, env: { PATH: "/bin" } });
    assert.equal(result.ok, false); assert.match(result.reason, /spawn failed/u);
  } finally { await rm(fixtureRoot, { recursive: true, force: true }); }
});

process.stdout.write(`\n${passed}/${passed + failures.length} checks passed.\n`);
if (failures.length) { process.stdout.write(`${failures.join("\n")}\n`); process.exitCode = 1; }
