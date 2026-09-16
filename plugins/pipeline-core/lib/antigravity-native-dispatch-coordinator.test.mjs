#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import {
  antigravityNativeDispatchInternals,
  prepareAntigravityNativeDispatch,
  verifyAntigravityNativeDispatch,
} from "./antigravity-native-dispatch-coordinator.mjs";
import { ROLE_DISPATCH_REQUEST_SCHEMA } from "./role-dispatch-preflight.mjs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const git = (root, ...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const prepareScript = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "antigravity-native-dispatch-prepare.mjs");
const cases = [];
const test = (name, run) => cases.push({ id: `ANDC${String(cases.length + 1).padStart(2, "0")}`, name, run });

function fixture() {
  const fixtureParent = process.env.PIPELINE_TEST_TMPDIR ?? join(process.cwd(), "scratch");
  mkdirSync(fixtureParent, { recursive: true });
  const root = mkdtempSync(join(fixtureParent, "agy-native-dispatch-"));
  writeFileSync(join(root, "input-a.txt"), "a\n");
  writeFileSync(join(root, "input-b.txt"), "b\n");
  git(root, "init", "-q");
  git(root, "config", "user.name", "Fixture");
  git(root, "config", "user.email", "fixture@example.invalid");
  git(root, "add", "input-a.txt", "input-b.txt");
  git(root, "commit", "-q", "-m", "fixture");
  return root;
}

function request(root) {
  const commit = git(root, "rev-parse", "HEAD");
  const tree = git(root, "rev-parse", "HEAD^{tree}");
  const nativeSubagents = [
    { TypeName: "consult-advisor", Role: "Advisor", Prompt: "Inspect input-a.txt. Model: gemini-3.7; Ruleset-SHA: local." },
    { TypeName: "afk-claude-worker", Role: "Worker", Prompt: "Inspect input-b.txt. Model: gemini-3.7; Ruleset-SHA: local." },
  ];
  const packets = nativeSubagents.map((entry, index) => ({
    schema: ROLE_DISPATCH_REQUEST_SCHEMA,
    dispatchId: `agy-native-${index}`,
    transport: "antigravity",
    role: `pipeline-core:${entry.TypeName}`,
    prompt: entry.Prompt,
    candidate: { commit, tree },
    requiredPaths: [`input-${index === 0 ? "a" : "b"}.txt`],
    requiredPathSha256: { [`input-${index === 0 ? "a" : "b"}.txt`]: hash(`${index === 0 ? "a" : "b"}\n`) },
    resultDestination: { kind: "return" },
  }));
  return { root, packets, nativeSubagents };
}

function withFixture(run) {
  const root = fixture();
  try { run(request(root)); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

test("valid full array is prepared and revalidated without changing role, prompt, order or workspace", () => withFixture((value) => {
  const prepared = prepareAntigravityNativeDispatch({ ...value, nowEpochMs: 1000 });
  assert.equal(prepared.status, "prepared");
  assert.deepEqual(prepared.invocation, { Subagents: value.nativeSubagents });
  const verified = verifyAntigravityNativeDispatch({ root: value.root, nativeSubagents: prepared.invocation.Subagents, nowEpochMs: 1001 });
  assert.equal(verified.status, "prepared");
  assert.deepEqual(verified.nativeSubagents, value.nativeSubagents);
  assert.deepEqual(verified.packets, value.packets);
  assert.equal(verified.workspace, value.root);
  assert.equal(verified.modelCalls, 0);
  assert.equal(verified.launcherCalls, 0);
  assert.equal(verifyAntigravityNativeDispatch({ root: value.root, nativeSubagents: value.nativeSubagents, nowEpochMs: 1002 }).code, "AGY-NATIVE-ARTIFACT-MISSING");
}));

test("artifact publication is create-only and cannot replace an outstanding authorization", () => withFixture((value) => {
  const first = prepareAntigravityNativeDispatch(value);
  const second = prepareAntigravityNativeDispatch(value);
  assert.equal(first.status, "prepared");
  assert.equal(second.code, "AGY-NATIVE-ARTIFACT-EXISTS");
  assert.equal(verifyAntigravityNativeDispatch(value).artifactSha256, first.artifactSha256);
}));

test("an authenticated expired authorization is retired so a fresh preparation cannot deadlock", () => withFixture((value) => {
  const expired = prepareAntigravityNativeDispatch({ ...value, nowEpochMs: 1_000, ttlMs: 1_000 });
  const fresh = prepareAntigravityNativeDispatch({ ...value, nowEpochMs: 2_001, ttlMs: 1_000 });
  assert.equal(expired.status, "prepared");
  assert.equal(fresh.status, "prepared");
  assert.notEqual(fresh.artifactSha256, expired.artifactSha256);
  assert.equal(verifyAntigravityNativeDispatch({
    root: value.root,
    nativeSubagents: value.nativeSubagents,
    nowEpochMs: 2_002,
  }).artifactSha256, fresh.artifactSha256);
}));

test("an authenticated stale-candidate authorization is retired for the new exact candidate", () => withFixture((value) => {
  const stale = prepareAntigravityNativeDispatch(value);
  assert.equal(stale.status, "prepared");
  writeFileSync(join(value.root, "later.txt"), "later\n");
  git(value.root, "add", "later.txt");
  git(value.root, "commit", "-q", "-m", "later");
  const current = request(value.root);
  const fresh = prepareAntigravityNativeDispatch(current);
  assert.equal(fresh.status, "prepared");
  assert.notEqual(fresh.artifactSha256, stale.artifactSha256);
  assert.equal(verifyAntigravityNativeDispatch(current).artifactSha256, fresh.artifactSha256);
}));

test("a forged expired artifact cannot be retired or replaced", () => withFixture((value) => {
  assert.equal(prepareAntigravityNativeDispatch({ ...value, nowEpochMs: 1_000, ttlMs: 1_000 }).status, "prepared");
  const common = git(value.root, "rev-parse", "--path-format=absolute", "--git-common-dir");
  const path = antigravityNativeDispatchInternals.artifactPath(common, value.nativeSubagents, value.root);
  const forged = JSON.parse(readFileSync(path, "utf8"));
  forged.packets[0].dispatchId = "forged-expired";
  writeFileSync(path, `${JSON.stringify(forged)}\n`);
  assert.equal(prepareAntigravityNativeDispatch({ ...value, nowEpochMs: 2_001 }).code, "AGY-NATIVE-ARTIFACT-EXISTS");
  assert.equal(verifyAntigravityNativeDispatch({ ...value, nowEpochMs: 2_001 }).code, "AGY-NATIVE-ARTIFACT-DIGEST");
}));

test("serial repository Git probes share one five-second preparation deadline", () => withFixture((value) => {
  const actualGit = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
  const fakeBin = mkdtempSync(join(process.env.PIPELINE_TEST_TMPDIR ?? join(process.cwd(), "scratch"), "agy-slow-git-"));
  const fakeGit = join(fakeBin, "git");
  writeFileSync(fakeGit, `#!/usr/bin/env node\nimport { spawnSync } from "node:child_process";\nconst wait = new Int32Array(new SharedArrayBuffer(4));\nAtomics.wait(wait, 0, 0, 2000);\nconst result = spawnSync(${JSON.stringify(actualGit)}, process.argv.slice(2), { stdio: "inherit" });\nprocess.exit(result.status ?? 1);\n`);
  chmodSync(fakeGit, 0o755);
  const priorPath = process.env.PATH;
  const started = performance.now();
  let result;
  try {
    process.env.PATH = `${fakeBin}:${priorPath ?? ""}`;
    result = prepareAntigravityNativeDispatch(value);
  } finally {
    process.env.PATH = priorPath;
    rmSync(fakeBin, { recursive: true, force: true });
  }
  const elapsedMs = performance.now() - started;
  assert.equal(result.code, "AGY-NATIVE-ROOT");
  assert.ok(elapsedMs >= 4_000, `deadline fired unexpectedly early at ${elapsedMs.toFixed(0)}ms`);
  assert.ok(elapsedMs < 5_000, `serial Git timeouts exceeded the five-second PREPARE bound: ${elapsedMs.toFixed(0)}ms`);
  process.stdout.write(`# measured shared preparation deadline: ${elapsedMs.toFixed(0)}ms\n`);
}));

test("repository and batch-preflight Git probes share one five-second preparation deadline", () => withFixture((value) => {
  const actualGit = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
  const fakeBin = mkdtempSync(join(process.env.PIPELINE_TEST_TMPDIR ?? join(process.cwd(), "scratch"), "agy-slow-batch-git-"));
  const fakeGit = join(fakeBin, "git");
  const batchProbeLog = join(fakeBin, "batch-probes.log");
  writeFileSync(fakeGit, `#!/usr/bin/env node\nimport { appendFileSync } from "node:fs";\nimport { spawnSync } from "node:child_process";\nif (process.argv[2] === "-C") {\n  appendFileSync(${JSON.stringify(batchProbeLog)}, process.argv.slice(2).join(" ") + "\\n");\n  const wait = new Int32Array(new SharedArrayBuffer(4));\n  Atomics.wait(wait, 0, 0, 2000);\n}\nconst result = spawnSync(${JSON.stringify(actualGit)}, process.argv.slice(2), { stdio: "inherit" });\nprocess.exit(result.status ?? 1);\n`);
  chmodSync(fakeGit, 0o755);
  const priorPath = process.env.PATH;
  const started = performance.now();
  let result;
  let nativeCalls = 0;
  try {
    process.env.PATH = `${fakeBin}:${priorPath ?? ""}`;
    result = prepareAntigravityNativeDispatch(value);
    if (result.status === "prepared") nativeCalls += 1;
  } finally {
    process.env.PATH = priorPath;
  }
  const elapsedMs = performance.now() - started;
  const batchProbes = readFileSync(batchProbeLog, "utf8").trim().split("\n");
  rmSync(fakeBin, { recursive: true, force: true });
  assert.equal(result.code, "RDB-PREPARATION-FAILED");
  assert.equal(result.preparation.preparations[0].code, "RDP-DEADLINE");
  assert.ok(batchProbes.length >= 2, `expected the timeout inside batch preflight, saw ${batchProbes.length} Git probes`);
  assert.equal(nativeCalls, 0);
  assert.equal(result.modelCalls, 0);
  assert.equal(result.launcherCalls, 0);
  assert.ok(elapsedMs >= 4_000, `deadline fired unexpectedly early at ${elapsedMs.toFixed(0)}ms`);
  assert.ok(elapsedMs < 5_000, `repository plus batch preflight exceeded the five-second PREPARE bound: ${elapsedMs.toFixed(0)}ms`);
  process.stdout.write(`# measured repository-plus-batch preparation deadline: ${elapsedMs.toFixed(0)}ms\n`);
}));

test("CLI prepares a repository-contained request file without launching another CLI or model", () => withFixture((value) => {
  const requestPath = join(value.root, "agy-dispatch-request.json");
  writeFileSync(requestPath, `${JSON.stringify({ packets: value.packets, Subagents: value.nativeSubagents })}\n`);
  const result = spawnSync(process.execPath, [prepareScript, "prepare", "--root", value.root, "--request", "agy-dispatch-request.json"], {
    cwd: value.root, encoding: "utf8", shell: false,
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, "prepared");
  assert.deepEqual(output.invocation, { Subagents: value.nativeSubagents });
  assert.equal(output.modelCalls, 0);
  assert.equal(output.launcherCalls, 0);
  assert.equal(verifyAntigravityNativeDispatch(value).status, "prepared");
}));

test("missing prepared artifact rejects the entire array", () => withFixture((value) => {
  assert.equal(verifyAntigravityNativeDispatch(value).code, "AGY-NATIVE-ARTIFACT-MISSING");
}));

test("a partial array cannot reuse the full-array artifact", () => withFixture((value) => {
  assert.equal(prepareAntigravityNativeDispatch(value).status, "prepared");
  assert.equal(verifyAntigravityNativeDispatch({ root: value.root, nativeSubagents: value.nativeSubagents.slice(0, 1) }).code, "AGY-NATIVE-ARTIFACT-MISSING");
}));

test("a reordered array cannot reuse the prepared artifact", () => withFixture((value) => {
  assert.equal(prepareAntigravityNativeDispatch(value).status, "prepared");
  assert.equal(verifyAntigravityNativeDispatch({ root: value.root, nativeSubagents: [...value.nativeSubagents].reverse() }).code, "AGY-NATIVE-ARTIFACT-MISSING");
}));

test("a changed prompt cannot reuse the prepared artifact", () => withFixture((value) => {
  assert.equal(prepareAntigravityNativeDispatch(value).status, "prepared");
  const mutated = structuredClone(value.nativeSubagents);
  mutated[1].Prompt += " changed";
  assert.equal(verifyAntigravityNativeDispatch({ root: value.root, nativeSubagents: mutated }).code, "AGY-NATIVE-ARTIFACT-MISSING");
}));

test("a forged artifact digest fails closed", () => withFixture((value) => {
  assert.equal(prepareAntigravityNativeDispatch(value).status, "prepared");
  const common = git(value.root, "rev-parse", "--path-format=absolute", "--git-common-dir");
  const path = antigravityNativeDispatchInternals.artifactPath(common, value.nativeSubagents, value.root);
  const artifact = JSON.parse(readFileSync(path, "utf8"));
  artifact.packets[0].dispatchId = "forged";
  writeFileSync(path, `${JSON.stringify(artifact)}\n`);
  assert.equal(verifyAntigravityNativeDispatch(value).code, "AGY-NATIVE-ARTIFACT-DIGEST");
}));

test("candidate movement makes an otherwise intact artifact stale", () => withFixture((value) => {
  assert.equal(prepareAntigravityNativeDispatch(value).status, "prepared");
  writeFileSync(join(value.root, "later.txt"), "later\n");
  git(value.root, "add", "later.txt");
  git(value.root, "commit", "-q", "-m", "later");
  assert.equal(verifyAntigravityNativeDispatch(value).code, "AGY-NATIVE-ARTIFACT-STALE");
}));

test("required input movement invalidates all entries at revalidation", () => withFixture((value) => {
  assert.equal(prepareAntigravityNativeDispatch(value).status, "prepared");
  writeFileSync(join(value.root, "input-b.txt"), "dirty\n");
  const verdict = verifyAntigravityNativeDispatch(value);
  assert.equal(verdict.code, "AGY-NATIVE-BATCH-STALE");
  assert.equal(verdict.modelCalls, 0);
  assert.equal(verdict.launcherCalls, 0);
}));

test("expired artifacts fail closed", () => withFixture((value) => {
  assert.equal(prepareAntigravityNativeDispatch({ ...value, nowEpochMs: 1000, ttlMs: 1000 }).status, "prepared");
  assert.equal(verifyAntigravityNativeDispatch({ root: value.root, nativeSubagents: value.nativeSubagents, nowEpochMs: 2001 }).code, "AGY-NATIVE-ARTIFACT-EXPIRED");
}));

test("preparation rejects partial packet arrays", () => withFixture((value) => {
  assert.equal(prepareAntigravityNativeDispatch({ ...value, packets: value.packets.slice(0, 1) }).code, "AGY-NATIVE-ARRAY-MISMATCH");
}));

test("preparation rejects non-return native results", () => withFixture((value) => {
  value.packets[0].resultDestination = { kind: "stream" };
  assert.equal(prepareAntigravityNativeDispatch(value).code, "AGY-NATIVE-PACKET-BOUNDARY");
}));

test("preparation rejects a recursive/non-native transport", () => withFixture((value) => {
  value.packets[0].transport = "direct";
  assert.equal(prepareAntigravityNativeDispatch(value).code, "AGY-NATIVE-PACKET-BOUNDARY");
}));

test("artifact is private and kept outside the working tree", () => withFixture((value) => {
  assert.equal(prepareAntigravityNativeDispatch(value).status, "prepared");
  const common = git(value.root, "rev-parse", "--path-format=absolute", "--git-common-dir");
  const path = antigravityNativeDispatchInternals.artifactPath(common, value.nativeSubagents, value.root);
  assert.equal((lstatSync(path).mode & 0o077), 0);
  assert.equal(path.startsWith(join(common, "agent-pipeline", "run")), true);
}));

assert.equal(cases.length, 20, "the complete Antigravity native dispatch coordinator corpus must register before execution");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: cases, fd: completionFd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
