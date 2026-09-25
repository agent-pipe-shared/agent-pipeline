// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AGY_ERROR_TAXONOMY, AGY_MAX_OUTPUT_BYTES, createAgyStreamCollector, discoverAgyPath, invokeAgy, parseAgyOutput } from "./antigravity-execution-host.mjs";
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
const prompt = args.at(-1).slice("--print=".length);
if (prompt.includes("--timeout-test")) setTimeout(() => {}, 5000);
else if (prompt.includes("--slow-test")) setTimeout(() => console.log(JSON.stringify({ status: "SUCCESS", response: "done", model: "gemini-observed", usage: { input_tokens: 5, output_tokens: 10, cached_tokens: 0 }})), 1200);
else if (prompt.includes("--auth-test")) { console.error("Please login to Vertex"); process.exit(1); }
else if (prompt.includes("--fail-test")) process.exit(2);
else if (prompt.includes("--malformed-test")) console.log("no json for you");
else if (prompt.includes("--reported-error-test")) console.log(JSON.stringify({ status: "ERROR", response: "", error: "private child diagnostic" }));
else if (prompt.includes("--permission-test")) { console.error('jetski: a tool required the "command" permission and was auto-denied'); process.exit(2); }
else if (prompt.includes("--permission-noise-test")) { console.error("permission may be needed later: /home/alice/private.txt"); process.exit(2); }
else if (prompt.includes("--oversized-stdout-test")) console.log("x".repeat(65537));
else if (prompt.includes("--oversized-stderr-test")) { console.error("y".repeat(65537)); process.exit(2); }
else console.log(JSON.stringify({ status: "SUCCESS", response: "done", model: "gemini-observed", usage: { input_tokens: 5, output_tokens: 10, cached_tokens: 0 }}));
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
  for (const output of ["null", "true", "1", '"ok"', "[]", '[{"result":"ok"}]']) {
    assert.throws(() => parseAgyOutput(output), (error) => error.code === AGY_ERROR_TAXONOMY.OUTPUT_MALFORMED, output);
    assert.throws(() => parseAgyOutput(`{"status":"running"}\n${output}`), (error) => error.code === AGY_ERROR_TAXONOMY.OUTPUT_MALFORMED, output);
  }
  const init = '{"event":"init","conversation_id":"session-one","init":{"model":"gemini-observed"}}\n';
  const step = '{"event":"step_update","step_update":{"text_delta":"private tool data"}}\n';
  const terminal = '{"event":"result","result":{"conversation_id":"session-one","status":"SUCCESS","response":"done"}}\n';
  const stream = createAgyStreamCollector("gemini-observed");
  for (const byte of Buffer.from(init + step + terminal)) stream.write(Buffer.from([byte]));
  assert.deepEqual(stream.finish(), { payload: { conversation_id: "session-one", status: "SUCCESS", response: "done" }, observedModel: "gemini-observed" });
  assert.doesNotMatch(JSON.stringify(stream.finish()), /private tool data/u);
  const mismatched = createAgyStreamCollector("gemini-other");
  assert.throws(() => mismatched.write(init), (error) => error.code === AGY_ERROR_TAXONOMY.MODEL_MISMATCH);
  const missing = createAgyStreamCollector("gemini-observed");
  missing.write(init);
  assert.throws(() => missing.finish(), (error) => error.code === AGY_ERROR_TAXONOMY.OUTPUT_MALFORMED);
  const wrongConversation = createAgyStreamCollector("gemini-observed");
  wrongConversation.write(init);
  assert.throws(() => wrongConversation.write(terminal.replace("session-one", "session-two")), (error) => error.code === AGY_ERROR_TAXONOMY.OUTPUT_MALFORMED);
});
check("EPH04 rejects oversized parser input before attempting JSON", () => {
  assert.throws(() => parseAgyOutput("x".repeat(AGY_MAX_OUTPUT_BYTES + 1)), (error) => error.code === AGY_ERROR_TAXONOMY.OUTPUT_TOO_LARGE);
});

check("EPH05 valid packet launches exactly once with its prompt byte-for-byte", () => withFixture(async (fixture) => {
  const packet = packetFor(fixture);
  const result = await invokeAgy(launchArgs(fixture, packet));
  assert.equal(result.ok, true);
  assert.equal(result.launcherCalls, 1);
  assert.equal(result.modelCalls, 1);
  const rows = spawnRows(fixture);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].includes("--prompt"), false);
  assert.equal(rows[0].includes("--print"), false, "a bare --print would consume the following option");
  assert.equal(rows[0].at(-1), `--print=${packet.prompt}`);
  assert.ok(rows[0].indexOf("--output-format") < rows[0].length - 1);
  assert.ok(rows[0].indexOf("--sandbox") < rows[0].length - 1);
}));

const zeroSpawnCases = [
  ["EPH06 invalid packet shape", (packet) => { delete packet.candidate; }, "RDP-PACKET-SHAPE"],
  ["EPH07 stale candidate tree", (packet) => { packet.candidate.tree = "0".repeat(40); }, "RDP-CANDIDATE-TREE"],
  ["EPH08 wrong transport", (packet) => { packet.transport = "direct"; }, "AGY-DISPATCH-TRANSPORT"],
  ["EPH09 unusable result destination", (packet) => { packet.resultDestination = { kind: "file", path: "missing/result.json" }; }, "RDP-RESULT-DESTINATION"],
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

check("EPH10 dirty required input fails under five seconds with zero spawn", () => withFixture(async (fixture) => {
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

check("EPH11 all eight roles reject an invalid required path under five seconds with zero spawn", () => withFixture(async (fixture) => {
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
  ["EPH12 detects auth requirement", "--auth-test", undefined, AGY_ERROR_TAXONOMY.AUTH_REQUIRED],
  ["EPH13 detects non-zero exit", "--fail-test", undefined, AGY_ERROR_TAXONOMY.NONZERO_EXIT],
  ["EPH14 detects malformed output", "--malformed-test", undefined, AGY_ERROR_TAXONOMY.OUTPUT_MALFORMED],
  ["EPH15 detects model mismatch", "", "gemini-requested", AGY_ERROR_TAXONOMY.MODEL_MISMATCH],
];
for (const [name, suffix, model, code] of executionCases) {
  check(name, () => withFixture(async (fixture) => {
    const result = await invokeAgy(launchArgs(fixture, packetFor(fixture, "consult-advisor", suffix), { model }));
    assert.equal(result.ok, false);
    assert.equal(result.code, code);
    assert.equal(result.launcherCalls, 1);
    if (name.startsWith("EPH14")) {
      const reported = await invokeAgy(launchArgs(fixture, packetFor(fixture, "consult-advisor", "--reported-error-test")));
      assert.equal(reported.ok, false);
      assert.equal(reported.code, AGY_ERROR_TAXONOMY.REPORTED_FAILURE);
      assert.doesNotMatch(JSON.stringify(reported), /private child diagnostic/u);
    }
  }));
}
check("EPH16 detects timeout", () => withFixture(async (fixture) => {
  const result = await invokeAgy(launchArgs(fixture, packetFor(fixture, "consult-advisor", "--timeout-test"), { timeoutMs: 200 }));
  assert.equal(result.code, AGY_ERROR_TAXONOMY.TIMEOUT);
  assert.equal(result.launcherCalls, 1);
}));
check("EPH17 detects missing binary only after packet preparation", () => withFixture(async (fixture) => {
  const result = await invokeAgy(launchArgs(fixture, packetFor(fixture), { agyPath: "/does/not/exist/agy" }));
  assert.equal(result.code, AGY_ERROR_TAXONOMY.NOT_INSTALLED);
  assert.equal(result.launcherCalls, 0);
  assert.equal(result.modelCalls, 0);
}));
check("EPH18 accepts the observed model", () => withFixture(async (fixture) => {
  assert.equal((await invokeAgy(launchArgs(fixture, packetFor(fixture), { model: "gemini-observed" }))).ok, true);
}));
check("EPH19 slow execution remains bound to the fixture", () => withFixture(async (fixture) => {
  const result = await invokeAgy(launchArgs(fixture, packetFor(fixture, "consult-advisor", "--slow-test"), { model: "gemini-observed", timeoutMs: 2500 }));
  assert.equal(result.ok, true);
}));

check("EPH20 public failures never retain raw child diagnostics", () => withFixture(async (fixture) => {
  for (const suffix of ["--auth-test", "--fail-test", "--malformed-test", "--permission-test"]) {
    const result = await invokeAgy(launchArgs(fixture, packetFor(fixture, "consult-advisor", suffix)));
    assert.equal(result.ok, false, suffix);
    assert.equal(Object.hasOwn(result, "stdout"), false, suffix);
    assert.equal(Object.hasOwn(result, "stderr"), false, suffix);
    assert.doesNotMatch(JSON.stringify(result), /\/home\/|[A-Za-z]:\\|\\\\wsl\$|jetski/i, suffix);
  }
}));
check("EPH21 exact permission denial is typed without child text", () => withFixture(async (fixture) => {
  const result = await invokeAgy(launchArgs(fixture, packetFor(fixture, "consult-advisor", "--permission-test")));
  assert.equal(result.code, AGY_ERROR_TAXONOMY.PERMISSION_REQUIRED);
  assert.equal(result.message, "Antigravity requires attended command permission");
  assert.equal(Object.hasOwn(result, "stderr"), false);
}));
check("EPH22 arbitrary permission prose is not reclassified", () => withFixture(async (fixture) => {
  const result = await invokeAgy(launchArgs(fixture, packetFor(fixture, "consult-advisor", "--permission-noise-test")));
  assert.equal(result.code, AGY_ERROR_TAXONOMY.NONZERO_EXIT);
  assert.doesNotMatch(JSON.stringify(result), /private|permission may/i);
}));
for (const [id, suffix] of [["EPH23", "--oversized-stdout-test"], ["EPH24", "--oversized-stderr-test"]]) {
  check(`${id} oversized child stream fails closed`, () => withFixture(async (fixture) => {
    const result = await invokeAgy(launchArgs(fixture, packetFor(fixture, "consult-advisor", suffix)));
    assert.equal(result.code, AGY_ERROR_TAXONOMY.OUTPUT_TOO_LARGE);
    assert.equal(result.launcherCalls, 1);
    assert.equal(Object.hasOwn(result, "stdout"), false);
    assert.equal(Object.hasOwn(result, "stderr"), false);
    assert.equal(spawnRows(fixture).length, 1);
  }));
}

assert.equal(cases.length, 24, "the complete Antigravity execution host corpus must be registered before execution begins");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({
  cases: cases,
  fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536"),
});
