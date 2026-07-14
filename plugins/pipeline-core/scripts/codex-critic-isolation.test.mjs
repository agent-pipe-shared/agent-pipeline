#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync, spawn as spawnProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";

import {
  CODEX_CRITIC_ARTIFACTS,
  CODEX_CRITIC_POLICY,
  buildCodexCriticInvocation,
  buildExactFixture,
  buildPermissionProfile,
  buildProfileBoundCodexCriticInvocation,
  buildReviewBundle,
  criticPrompt,
  inspectCodexBinary,
  inspectToolFreeJsonl,
  localFailureDiagnostic,
  runCodexCritic,
  runPermissionProfilePreflight,
  runProfileBoundIsolation,
  sanitizeEnvironment,
  verifyProfileContract,
} from "./codex-critic-isolation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const verdict = {
  findings: [], deliberately_not_flagged: ["synthetic fixture"], trajectory_verdict: "consistent",
  trajectory_evidence: "synthetic adapter result", briefing_violations: [], pass: true,
};
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed += 1; process.stdout.write(`PASS  ${name}\n`); }
  catch (error) { failures.push(`${name}: ${error.stack ?? error.message}`); process.stdout.write(`FAIL  ${name} -- ${error.message}\n`); }
}

function fixtureProfile() { return buildPermissionProfile({ fixtureRoot: "/tmp/profile-fixture", runtimeRoot: "/opt/codex/releases/0.144.4-test" }); }

await check("profile is root-deny, read-scoped, network-off and contains no write grant", () => {
  const profile = fixtureProfile();
  assert.equal(profile.normalized.filesystem[0].path, ":root");
  assert.equal(profile.normalized.filesystem[0].access, "deny");
  assert.equal(profile.normalized.network.enabled, false);
  assert.equal(profile.normalized.filesystem.some((entry) => entry.access === "write"), false);
  assert.match(profile.hash, /^[0-9a-f]{64}$/u);
  assert.ok(profile.config.some((entry) => entry.includes('":root"="deny"')));
  assert.ok(profile.config.includes("permissions.pipeline-critic.network.enabled=false"));
});

await check("profile rejects roots, overlapping runtime and invalid identifiers", () => {
  assert.throws(() => buildPermissionProfile({ fixtureRoot: "/", runtimeRoot: "/opt/runtime" }));
  assert.throws(() => buildPermissionProfile({ fixtureRoot: "/tmp/same", runtimeRoot: "/tmp/same" }));
  assert.throws(() => buildPermissionProfile({ fixtureRoot: "/tmp/a", runtimeRoot: "/tmp/a/runtime" }));
  assert.throws(() => buildPermissionProfile({ fixtureRoot: os.homedir(), runtimeRoot: "/opt/codex/releases/0.144.4-test" }));
  assert.throws(() => buildPermissionProfile({ fixtureRoot: "/tmp/a", runtimeRoot: "/tmp/b", profileId: "BAD" }));
});

await check("profile validation rejects root-deny, private-read, write, network and hash drift", () => {
  const valid = fixtureProfile();
  const invoke = (profile) => buildProfileBoundCodexCriticInvocation({ fixtureRoot: "/tmp/profile-fixture", schemaPath: "/tmp/schema.json", resultPath: "/tmp/result.json", permissionProfile: profile, codexBinary: "/opt/codex/bin/codex", env: { PATH: "/bin" } });
  const clone = () => structuredClone(valid);
  const missingRoot = clone(); missingRoot.normalized.filesystem.shift(); assert.throws(() => invoke(missingRoot), /root deny/u);
  const privateRead = clone(); privateRead.normalized.filesystem.push({ path: "/home/private/state", access: "read" }); assert.throws(() => invoke(privateRead), /extra/u);
  const write = clone(); write.normalized.filesystem[2].access = "write"; assert.throws(() => invoke(write), /writable/u);
  const network = clone(); network.normalized.network.enabled = true; assert.throws(() => invoke(network), /network/u);
  const hashDrift = clone(); hashDrift.hash = "f".repeat(64); assert.throws(() => invoke(hashDrift), /drifted/u);
});

await check("profile-bound invocation fixes Sol/max and forbids legacy sandbox", () => {
  const invocation = buildProfileBoundCodexCriticInvocation({ fixtureRoot: "/tmp/profile-fixture", schemaPath: "/tmp/schema.json", resultPath: "/tmp/result.json", permissionProfile: fixtureProfile(), codexBinary: "/opt/codex/bin/codex", env: { PATH: "/bin", HOME: "/home/test", GITHUB_TOKEN: "no" } });
  for (const required of ["--ignore-user-config", "--ignore-rules", "--strict-config", "--ephemeral", "--json", "--output-schema", "--output-last-message"]) assert.ok(invocation.args.includes(required));
  assert.equal(invocation.args.includes("--sandbox"), false);
  assert.ok(invocation.args.includes('model_reasoning_effort="max"'));
  assert.ok(invocation.args.includes('approval_policy="never"'));
  assert.ok(invocation.args.includes('web_search="disabled"'));
  assert.ok(invocation.args.includes('shell_environment_policy.inherit="none"'));
  assert.deepEqual(invocation.options.env, { PATH: "/bin", HOME: "/home/test" });
});

await check("historical invocation remains isolated from the new acceptance builder", () => {
  const legacy = buildCodexCriticInvocation({ fixtureRoot: "/tmp/f", schemaPath: "/tmp/s", resultPath: "/tmp/r", env: { PATH: "/bin" } });
  assert.ok(legacy.args.includes("--sandbox"));
  assert.throws(() => buildProfileBoundCodexCriticInvocation({ fixtureRoot: "/tmp/f", schemaPath: "/tmp/s", resultPath: "/tmp/r", permissionProfile: null, codexBinary: "/tmp/codex", env: { PATH: "/bin" } }));
});

await check("environment allowlist removes credentials, proxies and arbitrary variables", () => {
  assert.deepEqual(sanitizeEnvironment({ PATH: "/bin", HOME: "/home/test", LANG: "C", CI: "true", GH_TOKEN: "x", HTTPS_PROXY: "x", CUSTOM: "x" }), { PATH: "/bin", HOME: "/home/test", LANG: "C" });
});

await check("binary inspection requires the pinned standalone release layout", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "profile-binary-test-"));
  try {
    const binary = path.join(temp, "releases", "0.144.4-test", "bin", "codex");
    await mkdir(path.dirname(binary), { recursive: true }); await writeFile(binary, "binary"); await chmod(binary, 0o700);
    const info = await inspectCodexBinary({ codexBinary: binary, execFileSync: () => `${CODEX_CRITIC_POLICY.requiredVersion}\n` });
    assert.match(info.binarySha256, /^[0-9a-f]{64}$/u); assert.equal(info.runtimeRoot, path.dirname(path.dirname(binary)));
    const loose = path.join(temp, "codex"); await writeFile(loose, "binary"); await chmod(loose, 0o700);
    await assert.rejects(() => inspectCodexBinary({ codexBinary: loose, execFileSync: () => `${CODEX_CRITIC_POLICY.requiredVersion}\n` }), /standalone layout/u);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

await check("profile contract requires named profiles and tool-free exec controls", () => {
  const fake = (_binary, args) => args[0] === "sandbox"
    ? "Run commands within a Codex-provided sandbox\n-P, --permission-profile <NAME>\n"
    : "--ignore-user-config --ignore-rules --strict-config --ephemeral --json --output-schema --output-last-message";
  assert.match(verifyProfileContract({ codexBinary: "/tmp/codex", execFileSync: fake }).contractSha256, /^[0-9a-f]{64}$/u);
  assert.throws(() => verifyProfileContract({ codexBinary: "/tmp/codex", execFileSync: () => "missing" }));
});

await check("exact fixture and review bundle carry full committed UTF-8 content", async () => {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const fixture = await buildExactFixture({ repoRoot: root, candidateCommit: head, artifactPaths: ["plugins/pipeline-core/scripts/critic-verdict.schema.json"] });
  try {
    const bundle = await buildReviewBundle(fixture);
    assert.equal(bundle.value.artifacts.length, 1);
    assert.match(bundle.value.artifacts[0].content, /Critic verdict/u);
    assert.equal(bundle.value.artifacts[0].content.length > 0, true);
    assert.match(bundle.hash, /^[0-9a-f]{64}$/u);
    assert.throws(() => criticPrompt({ bundle: { hash: bundle.hash }, taskId: "task", nonce: fixture.manifest.nonce, candidateCommit: head, candidateTree: fixture.manifest.tree, candidateParent: fixture.manifest.parent, candidateParentTree: fixture.manifest.parentTree }));
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
});

await check("fixture rejects traversal and duplicate artifact inputs before acceptance", async () => {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  await assert.rejects(() => buildExactFixture({ repoRoot: root, candidateCommit: head, artifactPaths: ["../private"] }), /normalized relative/u);
  await assert.rejects(() => buildExactFixture({ repoRoot: root, candidateCommit: head, artifactPaths: ["harness/scripts/verify.mjs", "harness/scripts/verify.mjs"] }), /unique/u);
});

function childProcess(exitCode, afterSpawn = async () => {}) {
  const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.pid = null; child.kill = () => true;
  queueMicrotask(async () => { await afterSpawn(child); child.stdout.end(); child.stderr.end(); child.emit("exit", exitCode, null); });
  return child;
}

await check("direct profile preflight accepts read-allow/read-deny/write-deny and unchanged canaries", async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "profile-preflight-fixture-"));
  const runtime = await mkdtemp(path.join(os.tmpdir(), "profile-preflight-runtime-"));
  const external = await mkdtemp(path.join(os.tmpdir(), "profile-preflight-parent-"));
  try {
    const profile = buildPermissionProfile({ fixtureRoot: fixture, runtimeRoot: runtime });
    const result = await runPermissionProfilePreflight({ codexBinary: "/tmp/codex", permissionProfile: profile, fixtureRoot: fixture, externalParent: external, env: { PATH: "/bin", HOME: "/home/test" }, spawn(_command, args, options) {
      assert.equal(options.env.CODEX_HOME.startsWith(os.tmpdir()), true);
      assert.ok(args.includes("-P")); assert.equal(args.includes("--sandbox"), false);
      const script = args[args.indexOf("--") + 3];
      return childProcess(script.includes("printf") ? 2 : 0);
    } });
    assert.equal(result.ok, true); assert.deepEqual(result.canaries, { fixtureUnchanged: true, externalUnchanged: true, writeTargetAbsent: true });
    assert.equal(JSON.stringify(result).includes(external), false);
  } finally { await rm(fixture, { recursive: true, force: true }); await rm(runtime, { recursive: true, force: true }); await rm(external, { recursive: true, force: true }); }
});

await check("preflight fails closed on a successful forbidden write outcome", async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "profile-preflight-red-")); const runtime = await mkdtemp(path.join(os.tmpdir(), "profile-runtime-red-")); const external = await mkdtemp(path.join(os.tmpdir(), "profile-external-red-"));
  try {
    const result = await runPermissionProfilePreflight({ codexBinary: "/tmp/codex", permissionProfile: buildPermissionProfile({ fixtureRoot: fixture, runtimeRoot: runtime }), fixtureRoot: fixture, externalParent: external, env: { PATH: "/bin" }, spawn: () => childProcess(0) });
    assert.equal(result.ok, false); assert.equal(result.category, "profile-preflight-failed");
  } finally { await rm(fixture, { recursive: true, force: true }); await rm(runtime, { recursive: true, force: true }); await rm(external, { recursive: true, force: true }); }
});

await check("JSONL parser enforces order, cardinality and no tool/post-terminal events", () => {
  const clean = [
    { type: "thread.started" }, { type: "turn.started" }, { type: "item.started", item: { type: "reasoning" } },
    { type: "item.completed", item: { type: "agent_message", text: "{}" } }, { type: "turn.completed" },
  ].map(JSON.stringify).join("\n");
  assert.equal(inspectToolFreeJsonl(clean).ok, true);
  assert.equal(inspectToolFreeJsonl(`${clean}\n${JSON.stringify({ type: "item.started", item: { type: "command_execution" } })}`).ok, false);
  assert.equal(inspectToolFreeJsonl(`${JSON.stringify({ type: "turn.started" })}\n${clean}`).ok, false);
  assert.equal(inspectToolFreeJsonl(clean.replace(JSON.stringify({ type: "turn.completed" }), "not-json")).ok, false);
  for (const type of ["command_execution", "file_change", "mcp_tool_call", "web_search", "app_call", "browser_action", "plan", "unknown"]) {
    const injected = clean.replace(JSON.stringify({ type: "turn.completed" }), `${JSON.stringify({ type: "item.started", item: { type } })}\n${JSON.stringify({ type: "turn.completed" })}`);
    assert.equal(inspectToolFreeJsonl(injected).ok, false, type);
  }
  assert.equal(inspectToolFreeJsonl(clean.replace(JSON.stringify({ type: "turn.completed" }), `${JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "{}" } })}\n${JSON.stringify({ type: "turn.completed" })}`)).ok, false);
});

function criticSpawn({ toolEvent = false, badBinding = false, badVerdict = false, schemaInvalid = false, missingResult = false, oversizedResult = false, differentMessage = false, oversizedStream = false, exitCode = 0, capturePrompt = null } = {}) {
  return (_command, args) => {
    const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.pid = null; child.kill = () => true;
    const chunks = []; child.stdin.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    child.stdin.on("finish", async () => {
      const prompt = Buffer.concat(chunks).toString("utf8"); if (capturePrompt) capturePrompt(prompt);
      const value = (key) => new RegExp(`^${key}=(.+)$`, "mu").exec(prompt)?.[1];
      const output = args[args.indexOf("--output-last-message") + 1];
      const wrapper = {
        task_id: badBinding ? "wrong" : value("TASK_ID"), nonce: value("NONCE"), candidate_commit: value("CANDIDATE_COMMIT"), candidate_tree: value("CANDIDATE_TREE"), candidate_parent: value("CANDIDATE_PARENT"), candidate_parent_tree: value("CANDIDATE_PARENT_TREE"), bundle_sha256: value("REVIEW_BUNDLE_SHA256"), review_contract_sha256: value("REVIEW_CONTRACT_SHA256"),
        verdict: badVerdict ? { ...verdict, pass: false } : verdict,
      };
      if (schemaInvalid) delete wrapper.nonce;
      if (!missingResult) await writeFile(output, oversizedResult ? "x".repeat(70 * 1024) : JSON.stringify(wrapper));
      const events = [{ type: "thread.started" }, { type: "turn.started" }, { type: "item.started", item: { type: "reasoning" } }];
      if (toolEvent) events.push({ type: "item.started", item: { type: "command_execution" } });
      events.push({ type: "item.completed", item: { type: "agent_message", text: differentMessage ? "{}" : JSON.stringify(wrapper) } }, { type: "turn.completed" });
      child.stdout.write(oversizedStream ? "x".repeat(300 * 1024) : `${events.map(JSON.stringify).join("\n")}\n`); child.stdout.end(); child.stderr.end(); child.emit("exit", exitCode, null);
    });
    return child;
  };
}

await check("tool-less critic receives full content and accepts only bound clean verdict", async () => {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const fixture = await buildExactFixture({ repoRoot: root, candidateCommit: head, artifactPaths: ["plugins/pipeline-core/scripts/critic-verdict.schema.json"] });
  const runtime = await mkdtemp(path.join(os.tmpdir(), "profile-critic-runtime-"));
  try {
    const bundle = await buildReviewBundle(fixture); let prompt = "";
    const result = await runCodexCritic({ fixture, reviewBundle: bundle, permissionProfile: buildPermissionProfile({ fixtureRoot: fixture.root, runtimeRoot: runtime }), codexBinary: "/tmp/codex", schemaPath: path.join(fixture.root, "plugins/pipeline-core/scripts/critic-verdict.schema.json"), env: { PATH: "/bin" }, spawn: criticSpawn({ capturePrompt: (value) => { prompt = value; } }) });
    assert.equal(result.ok, true); assert.equal(result.stream.toolFree, true); assert.match(prompt, /Critic verdict/u); assert.match(prompt, /REVIEW_BUNDLE_SHA256=/u);
  } finally { await rm(fixture.root, { recursive: true, force: true }); await rm(runtime, { recursive: true, force: true }); }
});

await check("tool events, replay binding and unclean verdict each fail closed", async () => {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const fixture = await buildExactFixture({ repoRoot: root, candidateCommit: head, artifactPaths: ["plugins/pipeline-core/scripts/critic-verdict.schema.json"] }); const runtime = await mkdtemp(path.join(os.tmpdir(), "profile-critic-red-"));
  try {
    const bundle = await buildReviewBundle(fixture); const profile = buildPermissionProfile({ fixtureRoot: fixture.root, runtimeRoot: runtime }); const schemaPath = path.join(fixture.root, "plugins/pipeline-core/scripts/critic-verdict.schema.json");
    for (const options of [{ toolEvent: true }, { badBinding: true }, { badVerdict: true }, { schemaInvalid: true }, { missingResult: true }, { oversizedResult: true }, { differentMessage: true }, { oversizedStream: true }, { exitCode: 2 }]) {
      const result = await runCodexCritic({ fixture, reviewBundle: bundle, permissionProfile: profile, codexBinary: "/tmp/codex", schemaPath, env: { PATH: "/bin" }, spawn: criticSpawn(options) });
      assert.equal(result.ok, false);
    }
  } finally { await rm(fixture.root, { recursive: true, force: true }); await rm(runtime, { recursive: true, force: true }); }
});

await check("critic timeout terminates its owned process group and fails closed", async () => {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const fixture = await buildExactFixture({ repoRoot: root, candidateCommit: head, artifactPaths: ["plugins/pipeline-core/scripts/critic-verdict.schema.json"] });
  const runtime = await mkdtemp(path.join(os.tmpdir(), "profile-timeout-runtime-"));
  try {
    const bundle = await buildReviewBundle(fixture);
    const result = await runCodexCritic({ fixture, reviewBundle: bundle, permissionProfile: buildPermissionProfile({ fixtureRoot: fixture.root, runtimeRoot: runtime }), codexBinary: "/tmp/codex", schemaPath: path.join(fixture.root, "plugins/pipeline-core/scripts/critic-verdict.schema.json"), leaseMs: 20, env: { PATH: "/bin" }, spawn: (_command, _args, options) => spawnProcess("/bin/sh", ["-c", "sleep 5"], options) });
    assert.equal(result.ok, false); assert.equal(result.category, "lease-timeout"); assert.equal(result.process.timedOut, true); assert.equal(result.process.ownedProcessTreeGone, true);
  } finally { await rm(fixture.root, { recursive: true, force: true }); await rm(runtime, { recursive: true, force: true }); }
});

async function syntheticRepo() {
  const repo = await mkdtemp(path.join(os.tmpdir(), "profile-aggregate-repo-"));
  execFileSync("git", ["init", "-q"], { cwd: repo }); execFileSync("git", ["config", "user.name", "Fixture"], { cwd: repo }); execFileSync("git", ["config", "user.email", "fixture@example.invalid"], { cwd: repo });
  await writeFile(path.join(repo, "seed.txt"), "parent\n"); execFileSync("git", ["add", "--", "seed.txt"], { cwd: repo }); execFileSync("git", ["commit", "-qm", "parent"], { cwd: repo });
  for (const file of CODEX_CRITIC_ARTIFACTS) {
    const destination = path.join(repo, file); await mkdir(path.dirname(destination), { recursive: true });
    const bytes = file.endsWith("critic-verdict.schema.json") ? await readFile(path.join(root, file)) : Buffer.from(`public fixture ${file}\n`);
    await writeFile(destination, bytes);
  }
  execFileSync("git", ["add", "--", ...CODEX_CRITIC_ARTIFACTS], { cwd: repo }); execFileSync("git", ["commit", "-qm", "fixture"], { cwd: repo });
  return { repo, head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim() };
}

async function commitPath(repo, file, bytes, message) {
  await writeFile(path.join(repo, file), bytes);
  execFileSync("git", ["add", "--", file], { cwd: repo }); execFileSync("git", ["commit", "-qm", message], { cwd: repo });
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
}

await check("fixture fails closed on missing, symlink, invalid UTF-8 and oversized artifacts", async () => {
  const missing = await syntheticRepo();
  try { await assert.rejects(() => buildExactFixture({ repoRoot: missing.repo, candidateCommit: missing.head, artifactPaths: ["missing-public-artifact.txt"] }), /missing/u); }
  finally { await rm(missing.repo, { recursive: true, force: true }); }

  const linked = await syntheticRepo();
  try {
    const file = CODEX_CRITIC_ARTIFACTS[0]; await rm(path.join(linked.repo, file)); await symlink("neutral-synthetic-target", path.join(linked.repo, file));
    execFileSync("git", ["add", "--", file], { cwd: linked.repo }); execFileSync("git", ["commit", "-qm", "symlink"], { cwd: linked.repo });
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: linked.repo, encoding: "utf8" }).trim();
    await assert.rejects(() => buildExactFixture({ repoRoot: linked.repo, candidateCommit: head, artifactPaths: [file] }), /symlinked/u);
  } finally { await rm(linked.repo, { recursive: true, force: true }); }

  const invalid = await syntheticRepo();
  try {
    const file = CODEX_CRITIC_ARTIFACTS[4]; const head = await commitPath(invalid.repo, file, Buffer.from([0xc3, 0x28]), "invalid utf8");
    const fixture = await buildExactFixture({ repoRoot: invalid.repo, candidateCommit: head, artifactPaths: [file] });
    try { await assert.rejects(() => buildReviewBundle(fixture), /UTF-8/u); } finally { await rm(fixture.root, { recursive: true, force: true }); }
  } finally { await rm(invalid.repo, { recursive: true, force: true }); }

  const oversized = await syntheticRepo();
  try {
    const file = CODEX_CRITIC_ARTIFACTS[4]; const head = await commitPath(oversized.repo, file, Buffer.alloc(512 * 1024 + 1, 0x61), "oversized");
    await assert.rejects(() => buildExactFixture({ repoRoot: oversized.repo, candidateCommit: head, artifactPaths: [file] }), /exceeds/u);
  } finally { await rm(oversized.repo, { recursive: true, force: true }); }
});

function aggregateSpawn() {
  return (_command, args, options) => {
    if (args[0] === "sandbox") { const script = args[args.indexOf("--") + 3]; return childProcess(script.includes("printf") ? 2 : 0); }
    return criticSpawn()(_command, args, options);
  };
}

await check("aggregate binds exact HEAD/five artifacts and emits path-free public evidence", async () => {
  const { repo, head } = await syntheticRepo(); const runtime = await mkdtemp(path.join(os.tmpdir(), "profile-aggregate-runtime-"));
  try {
    const binaryInspection = { binarySha256: "a".repeat(64), versionSha256: "b".repeat(64), runtimeRoot: runtime, runtimeRootSha256: "c".repeat(64), runtimeManifestSha256: "e".repeat(64), runtimeEntries: 1 };
    const result = await runProfileBoundIsolation({ repoRoot: repo, candidateCommit: head, artifactPaths: CODEX_CRITIC_ARTIFACTS, externalParent: path.dirname(repo), resolvedBinary: "/tmp/codex", binaryInspection, inspectBinary: async () => binaryInspection, contractInspection: { contractSha256: "d".repeat(64) }, env: { PATH: "/bin", GITHUB_TOKEN: "private-token-canary" }, spawn: aggregateSpawn() });
    assert.equal(result.ok, true); assert.equal(result.envelope.preflight.ok, true); assert.equal(result.envelope.critic.ok, true);
    const publicEnvelope = JSON.stringify(result.envelope);
    assert.equal(publicEnvelope.includes(repo), false); assert.equal(publicEnvelope.includes(runtime), false); assert.equal(publicEnvelope.includes("private-token-canary"), false);
    for (const forbidden of ["stdoutTail", "stderrTail", "localDiagnostics", "REVIEW_BUNDLE_SHA256=", "agent_message"]) assert.equal(publicEnvelope.includes(forbidden), false, forbidden);
    await assert.rejects(() => runProfileBoundIsolation({ repoRoot: repo, candidateCommit: "f".repeat(40), artifactPaths: CODEX_CRITIC_ARTIFACTS }), /current Shared HEAD/u);
  } finally { await rm(repo, { recursive: true, force: true }); await rm(runtime, { recursive: true, force: true }); }
});

await check("aggregate blocks binary/runtime drift after preflight and before critic", async () => {
  const { repo, head } = await syntheticRepo(); const runtime = await mkdtemp(path.join(os.tmpdir(), "profile-drift-runtime-"));
  try {
    const binaryInspection = { binarySha256: "a".repeat(64), versionSha256: "b".repeat(64), runtimeRoot: runtime, runtimeRootSha256: "c".repeat(64), runtimeManifestSha256: "d".repeat(64), runtimeEntries: 1 };
    const drifted = { ...binaryInspection, runtimeManifestSha256: "e".repeat(64) };
    const result = await runProfileBoundIsolation({ repoRoot: repo, candidateCommit: head, artifactPaths: CODEX_CRITIC_ARTIFACTS, externalParent: path.dirname(repo), resolvedBinary: "/tmp/codex", binaryInspection, inspectBinary: async () => drifted, contractInspection: { contractSha256: "f".repeat(64) }, env: { PATH: "/bin" }, spawn: aggregateSpawn() });
    assert.equal(result.ok, false); assert.equal(result.envelope.bindingStableBeforeCritic, false); assert.equal(result.envelope.critic, null);
  } finally { await rm(repo, { recursive: true, force: true }); await rm(runtime, { recursive: true, force: true }); }
});

await check("aggregate rejects wrong artifact set and dirty exact artifacts before spawn", async () => {
  const { repo, head } = await syntheticRepo();
  try {
    await assert.rejects(() => runProfileBoundIsolation({ repoRoot: repo, candidateCommit: head, artifactPaths: CODEX_CRITIC_ARTIFACTS.slice(0, 4) }), /exact five/u);
    await writeFile(path.join(repo, CODEX_CRITIC_ARTIFACTS[0]), "dirty\n");
    await assert.rejects(() => runProfileBoundIsolation({ repoRoot: repo, candidateCommit: head, artifactPaths: CODEX_CRITIC_ARTIFACTS }), /must be clean/u);
  } finally { await rm(repo, { recursive: true, force: true }); }
});

await check("local failure diagnostics are bounded and remain separate from public evidence", () => {
  const stdout = { bytes: 3, totalBytes: 3, parts: [Buffer.from("abc")] }; const stderr = { bytes: 5, totalBytes: 5, parts: [Buffer.from("error")] };
  const diagnostic = localFailureDiagnostic(stdout, stderr); assert.equal(diagnostic.stdoutTail, "abc"); assert.match(diagnostic.stderrSha256, /^[0-9a-f]{64}$/u);
});

process.stdout.write(`\n${passed}/${passed + failures.length} checks passed.\n`);
if (failures.length) { process.stdout.write(`${failures.join("\n")}\n`); process.exitCode = 1; }
