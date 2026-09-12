// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AGY_ERROR_TAXONOMY, discoverAgyPath, invokeAgy, parseAgyOutput } from "./antigravity-execution-host.mjs";
import { ROLE_DISPATCH_REQUEST_SCHEMA } from "./role-dispatch-preflight.mjs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";

const cases = [];
function check(label, run) {
  const separator = label.indexOf(" ");
  cases.push({ id: label.slice(0, separator), name: label.slice(separator + 1), run });
}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const roles = [
  "afk-claude-worker", "consult-advisor", "critic", "goldfish-deep",
  "goldfish-implementor", "goldfish-mechanic", "plan-verifier", "readiness-reviewer",
];
const criticPrompt = `Independent review from frozen references.
Ruleset-SHA: local-test; Model: gemini-observed; effort high.
- **Tool budget (hard cap, first-class field):** ≤24 tool uses.`;
const goldfishPrompt = `## Briefing
### 1. Goal
Inspect the required path.
### 2. Context files
- input.txt
### 3. DoD checks
- Return a bounded result.
### 4. Forbidden
- Do not edit files.
### 5. Stop conditions
- Required input unavailable.
### 6. Dispatch-Metadata
Model: gemini-observed; effort medium; Ruleset-SHA: local-test.
- **Tool budget (TB-09, hard cap, first-class field):** ≤40 tool uses.`;
const promptFor = (role, suffix = "") => `${role.includes("goldfish") ? goldfishPrompt : role === "critic" ? criticPrompt : "Inspect input.txt. Model: gemini-observed; Ruleset-SHA: local-test."}${suffix}`;

const mockProgram = `#!/usr/bin/env node
const { appendFileSync } = require("node:fs");
const args = process.argv.slice(2);
appendFileSync(process.env.AGY_SPAWN_LOG, JSON.stringify(args) + "\\n");
const prompt = args[args.indexOf("--prompt") + 1];
if (prompt.includes("--timeout-test")) setTimeout(() => {}, 5000);
else if (prompt.includes("--slow-test")) setTimeout(() => console.log(JSON.stringify({ result: "done", model: "gemini-observed", usage: { input_tokens: 5, output_tokens: 10, cached_tokens: 0 }})), 1200);
else if (prompt.includes("--auth-test")) { console.error("Please login to Vertex"); process.exit(1); }
else if (prompt.includes("--fail-test")) process.exit(2);
else if (prompt.includes("--malformed-test")) console.log("no json for you");
else console.log(JSON.stringify({ result: "done", model: "gemini-observed", usage: { input_tokens: 5, output_tokens: 10, cached_tokens: 0 }}));
`;

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "test-agy-exec-"));
  const mockAgy = join(root, "agy-mock");
  const spawnLog = join(root, "spawn.log");
  writeFileSync(mockAgy, mockProgram);
  chmodSync(mockAgy, 0o755);
  writeFileSync(join(root, "input.txt"), "input\n");
  mkdirSync(join(root, "results"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "agy@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Agy fixture"], { cwd: root });
  execFileSync("git", ["add", "input.txt"], { cwd: root });
  execFileSync("git", ["commit", "-q", "-m", "fixture"], { cwd: root });
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const tree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: root, encoding: "utf8" }).trim();
  return { root, mockAgy, spawnLog, commit, tree };
}

async function withFixture(run) {
  const fixture = createFixture();
  try { return await run(fixture); }
  finally { rmSync(fixture.root, { recursive: true, force: true }); }
}

function packetFor(fixture, role = "consult-advisor", suffix = "", requiredPaths = ["input.txt"]) {
  return {
    schema: ROLE_DISPATCH_REQUEST_SCHEMA,
    dispatchId: `agy-${role}-${Math.random().toString(16).slice(2)}`,
    transport: "antigravity",
    role: `pipeline-core:${role}`,
    prompt: promptFor(role, suffix),
    candidate: { commit: fixture.commit, tree: fixture.tree },
    requiredPaths,
    requiredPathSha256: Object.fromEntries(requiredPaths.map((path) => [path, path === "input.txt" ? sha256("input\n") : "0".repeat(64)])),
    resultDestination: { kind: "return" },
  };
}
function launchArgs(fixture, packet, overrides = {}) {
  return { root: fixture.root, packet, agyPath: fixture.mockAgy, timeoutMs: 1000,
    env: { ...process.env, AGY_SPAWN_LOG: fixture.spawnLog }, ...overrides };
}
function spawnRows(fixture) {
  return existsSync(fixture.spawnLog)
    ? readFileSync(fixture.spawnLog, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse)
    : [];
}

check("EPH01 discovery accepts an existing configured binary", () => {
  assert.equal(discoverAgyPath({ AGY_PATH: process.execPath, PATH: "" }), process.execPath);
});
check("EPH02 parses the last valid JSON line", () => {
  const parsed = parseAgyOutput('log\n{"status":"running"}\n{"result":"success","usage":{"input_tokens":10}}\n');
  assert.equal(parsed.result, "success");
  assert.equal(parsed.usage.input_tokens, 10);
});
check("EPH03 rejects malformed output", () => {
  assert.throws(() => parseAgyOutput("no json"), (error) => error.code === AGY_ERROR_TAXONOMY.OUTPUT_MALFORMED);
});

check("EPH04 valid packet launches exactly once with its prompt byte-for-byte", () => withFixture(async (fixture) => {
  const packet = packetFor(fixture);
  const result = await invokeAgy(launchArgs(fixture, packet));
  assert.equal(result.ok, true);
  assert.equal(result.launcherCalls, 1);
  assert.equal(result.modelCalls, 1);
  const rows = spawnRows(fixture);
  assert.equal(rows.length, 1);
  assert.equal(rows[0][rows[0].indexOf("--prompt") + 1], packet.prompt);
}));

const zeroSpawnCases = [
  ["EPH05 invalid packet shape", (packet) => { delete packet.candidate; }, "RDP-PACKET-SHAPE"],
  ["EPH06 stale candidate tree", (packet) => { packet.candidate.tree = "0".repeat(40); }, "RDP-CANDIDATE-TREE"],
  ["EPH07 wrong transport", (packet) => { packet.transport = "direct"; }, "AGY-DISPATCH-TRANSPORT"],
  ["EPH08 unusable result destination", (packet) => { packet.resultDestination = { kind: "file", path: "missing/result.json" }; }, "RDP-RESULT-DESTINATION"],
];
for (const [name, mutate, code] of zeroSpawnCases) {
  check(`${name} fails under five seconds with zero spawn`, () => withFixture(async (fixture) => {
    const packet = packetFor(fixture);
    mutate(packet);
    const before = spawnRows(fixture).length;
    const started = Date.now();
    const result = await invokeAgy(launchArgs(fixture, packet));
    assert.ok(Date.now() - started < 5000);
    assert.equal(result.code, code);
    assert.equal(result.launcherCalls, 0);
    assert.equal(result.modelCalls, 0);
    assert.equal(spawnRows(fixture).length, before);
  }));
}

check("EPH09 dirty required input fails under five seconds with zero spawn", () => withFixture(async (fixture) => {
  const packet = packetFor(fixture);
  const before = spawnRows(fixture).length;
  writeFileSync(join(fixture.root, "input.txt"), "dirty\n");
  try {
    const started = Date.now();
    const result = await invokeAgy(launchArgs(fixture, packet));
    assert.ok(Date.now() - started < 5000);
    assert.equal(result.code, "RDP-REQUIRED-PATH-DRIFT");
    assert.equal(result.launcherCalls, 0);
    assert.equal(spawnRows(fixture).length, before);
  } finally { writeFileSync(join(fixture.root, "input.txt"), "input\n"); }
}));

check("EPH10 all eight roles reject an invalid required path under five seconds with zero spawn", () => withFixture(async (fixture) => {
  const before = spawnRows(fixture).length;
  const started = Date.now();
  for (const role of roles) {
    const result = await invokeAgy(launchArgs(fixture, packetFor(fixture, role, "", ["missing.txt"])));
    assert.equal(result.code, "RDP-REQUIRED-PATH", role);
    assert.equal(result.launcherCalls, 0, role);
    assert.equal(result.modelCalls, 0, role);
  }
  assert.ok(Date.now() - started < 5000);
  assert.equal(spawnRows(fixture).length, before);
}));

const executionCases = [
  ["EPH11 detects auth requirement", "--auth-test", undefined, AGY_ERROR_TAXONOMY.AUTH_REQUIRED],
  ["EPH12 detects non-zero exit", "--fail-test", undefined, AGY_ERROR_TAXONOMY.NONZERO_EXIT],
  ["EPH13 detects malformed output", "--malformed-test", undefined, AGY_ERROR_TAXONOMY.OUTPUT_MALFORMED],
  ["EPH14 detects model mismatch", "", "gemini-requested", AGY_ERROR_TAXONOMY.MODEL_MISMATCH],
];
for (const [name, suffix, model, code] of executionCases) {
  check(name, () => withFixture(async (fixture) => {
    const result = await invokeAgy(launchArgs(fixture, packetFor(fixture, "consult-advisor", suffix), { model }));
    assert.equal(result.ok, false);
    assert.equal(result.code, code);
    assert.equal(result.launcherCalls, 1);
  }));
}
check("EPH15 detects timeout", () => withFixture(async (fixture) => {
  const result = await invokeAgy(launchArgs(fixture, packetFor(fixture, "consult-advisor", "--timeout-test"), { timeoutMs: 200 }));
  assert.equal(result.code, AGY_ERROR_TAXONOMY.TIMEOUT);
  assert.equal(result.launcherCalls, 1);
}));
check("EPH16 detects missing binary only after packet preparation", () => withFixture(async (fixture) => {
  const result = await invokeAgy(launchArgs(fixture, packetFor(fixture), { agyPath: "/does/not/exist/agy" }));
  assert.equal(result.code, AGY_ERROR_TAXONOMY.NOT_INSTALLED);
  assert.equal(result.launcherCalls, 0);
  assert.equal(result.modelCalls, 0);
}));
check("EPH17 accepts the observed model", () => withFixture(async (fixture) => {
  assert.equal((await invokeAgy(launchArgs(fixture, packetFor(fixture), { model: "gemini-observed" }))).ok, true);
}));
check("EPH18 slow execution remains bound to the fixture", () => withFixture(async (fixture) => {
  const result = await invokeAgy(launchArgs(fixture, packetFor(fixture, "consult-advisor", "--slow-test"), { model: "gemini-observed", timeoutMs: 2500 }));
  assert.equal(result.ok, true);
}));

assert.equal(cases.length, 18, "the complete Antigravity execution host corpus must be registered before execution begins");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({
  cases: cases,
  fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536"),
});
