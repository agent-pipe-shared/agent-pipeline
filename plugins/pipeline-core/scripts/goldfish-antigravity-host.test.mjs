// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { AGY_ERROR_TAXONOMY } from "../lib/antigravity-execution-host.mjs";
import { ROLE_DISPATCH_REQUEST_SCHEMA } from "../lib/role-dispatch-preflight.mjs";
import { validateAgainstSchema } from "../lib/schema-lite.mjs";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { CROSS_RUNNER_DISPATCH_RECEIPT_SCHEMA, E3_CODES, dispatchGoldfishToAntigravity, measureAntigravityPipelineStart } from "./goldfish-antigravity-host.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const prompt = `## Briefing
### 1. Goal
Inspect input.txt.
### 2. Context files
- input.txt
### 3. DoD checks
- Return a bounded result.
### 4. Forbidden
- Do not edit files.
### 5. Stop conditions
- Input unavailable.
### 6. Dispatch-Metadata
Model: gemini-3.8-flash-medium; effort medium; Ruleset-SHA: fixture.
- **Tool budget (TB-09, hard cap, first-class field):** ≤40 tool uses.`;
const hex = (value = "a") => value.repeat(64);
const hostScript = fileURLToPath(new URL("./goldfish-antigravity-host.mjs", import.meta.url));

function antigravityManifest() {
  return {
    "pipeline-core": {
      enabled: true,
      PreToolUse: [{
        matcher: "run_command|write_to_file|replace_file_content|invoke_subagent",
        hooks: [
          { type: "command", command: "node hooks/antigravity-slicing-hint.mjs observe", timeout: 3 },
          { type: "command", command: "node hooks/antigravity-pretool-guard.mjs", timeout: 30 },
        ],
      }],
      Stop: [{ type: "command", command: "node hooks/antigravity-stop-hook.mjs", timeout: 15 }],
      PreInvocation: [
        { type: "command", command: "node hooks/antigravity-slicing-hint.mjs deliver", timeout: 3 },
        { type: "command", command: "node hooks/antigravity-start-hint.mjs", timeout: 5 },
      ],
    },
  };
}

const mock = `#!/usr/bin/env node
const { appendFileSync } = require("node:fs");
const args = process.argv.slice(2);
appendFileSync(process.env.E3_LOG, JSON.stringify(args) + "\\n");
if (args[0] === "--pipeline-start-probe") {
  if (process.env.E3_MARKER === "missing") process.exit(0);
  const version = process.env.E3_MARKER === "mismatch" ? "wrong" : "fixture-v1";
  console.log(JSON.stringify({ schema: "pipeline.antigravity-pipeline-start-marker.v1", status: "ready", pluginPath: "plugins/pipeline-core", pluginVersion: version }));
  process.exit(0);
}
const prompt = args[args.indexOf("--prompt") + 1];
if (prompt.includes("--malformed")) console.log("not json");
else if (prompt.includes("--slow")) setTimeout(() => console.log(JSON.stringify({ model: "gemini-3.8-flash-medium", result: "ok" })), 5000);
else if (prompt.includes("--wrong-model")) console.log(JSON.stringify({ model: "gemini-other", result: "ok" }));
else console.log(JSON.stringify({ model: "gemini-3.8-flash-medium", result: "ok" }));
`;

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "e3-agy-host-"));
  const executable = join(root, "fake-agy");
  const log = join(root, "calls.log");
  mkdirSync(join(root, ".agents"), { recursive: true });
  mkdirSync(join(root, "plugins", "pipeline-core"), { recursive: true });
  mkdirSync(join(root, "plugins", "pipeline-core", "scripts"));
  mkdirSync(join(root, "policies"));
  mkdirSync(join(root, "project"));
  mkdirSync(join(root, "results"));
  writeFileSync(join(root, ".agents", "plugins.json"), JSON.stringify({ entries: [{ path: "plugins/pipeline-core" }] }));
  writeFileSync(join(root, "plugins", "pipeline-core", "plugin.json"), JSON.stringify({ version: "fixture-v1" }));
  writeFileSync(join(root, "plugins", "pipeline-core", "hooks.json"), JSON.stringify(antigravityManifest()));
  writeFileSync(join(root, "plugins", "pipeline-core", "protected-baseline.json"), JSON.stringify({ entries: [
    { pathPattern: "plugins/pipeline-core/scripts/goldfish-antigravity-host\\.mjs$" },
    { pathPattern: "schemas/pipeline\\.cross-runner-dispatch-receipt\\.v1\\.json$" },
  ] }));
  writeFileSync(join(root, "plugins", "pipeline-core", "scripts", "pipeline-state.mjs"), "fixture state writer\n", { flag: "w" });
  writeFileSync(join(root, "policies", "control-placement.v1.json"), JSON.stringify({ schema: "pipeline.control-placement.v1", revision: 1, controls: [{
    controlId: "alfred:e3-cross-runner-agy-host", protects: ["plugins/pipeline-core/scripts/goldfish-antigravity-host.mjs", "schemas/pipeline.cross-runner-dispatch-receipt.v1.json"], enforcedBy: ["posthoc-verify"],
    perRunnerStatus: ["claude", "codex", "antigravity"].map((runner) => ({ runner, status: "enforced", detail: "fixture" })), residualGaps: [],
  }] }));
  writeFileSync(join(root, "input.txt"), "input\n");
  writeFileSync(executable, mock, { mode: 0o755 });
  chmodSync(executable, 0o755);
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.name", "fixture"], { cwd: root });
  execFileSync("git", ["config", "user.email", "fixture@example.invalid"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root });
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const tree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: root, encoding: "utf8" }).trim();
  const record = { schema: "pipeline.enforcement-conformance.v1", recordId: "antigravity:runner-hook", candidate: { commit, tree, artifactSha256: hex("a") }, runner: { name: "antigravity", version: "fixture", pluginVersion: "fixture-v1" }, layer: "runner-hook", probeSurfaces: ["runner-hook/orchestrator"], measurement: { status: "measured", values: [] }, observations: [{ probeSurface: "runner-hook/orchestrator", hookObservation: "fires", evidenceKind: "deterministic-execution", exitCode: 0, markerSha256: hex("b") }], evaluator: { outcome: "pass", basis: "fixture", acceptanceSha256: null }, staleness: { status: "current", runnerVersion: "fixture", pluginVersion: "fixture-v1", invalidatedBy: null }, sanitization: { policy: "fixture", redactions: [] }, provenance: { commandSha256: hex("c"), fixtureIds: ["fixture"], sourceSha256: hex("d") }, measuredAt: "2026-01-01T00:00:00.000Z" };
  writeFileSync(join(root, "policies", "enforcement-conformance.antigravity.json"), JSON.stringify(record));
  writeFileSync(join(root, "project", "pipeline-state.json"), "fixture authority state\n");
  const digest = (path) => sha256(readFileSync(join(root, path)));
  const gate = (status, reasonCode, paths) => ({ status, reasonCode, artifacts: paths.map((path) => ({ path, sha256: digest(path) })) });
  writeFileSync(join(root, "policies", "alfred-e3-gate-readback.v1.json"), JSON.stringify({ schema: "pipeline.alfred-e3-gate-readback.v1", status: "current", candidate: { commit, tree }, gates: {
    a1: gate("current", "E3-A1-MEASUREMENT-CURRENT", ["policies/enforcement-conformance.antigravity.json"]),
    a2: gate("current", "E3-A2-PLACEMENT-CURRENT", ["policies/control-placement.v1.json"]),
    a3: gate("current", "E3-A3-PROTECTION-CURRENT", ["plugins/pipeline-core/protected-baseline.json"]),
    a5: gate("current", "E3-A5-REPAIR-AUTHORITY-CURRENT", ["plugins/pipeline-core/scripts/pipeline-state.mjs", "project/pipeline-state.json"]),
  }, currentReadbackRule: "fixture candidate-bound readback" }));
  return { root, executable, log, commit, tree };
}
async function withFixture(run) { const value = fixture(); try { return await run(value); } finally { rmSync(value.root, { recursive: true, force: true }); } }
function packet(value, suffix = "", destination = "results/receipt.json") {
  return {
    schema: ROLE_DISPATCH_REQUEST_SCHEMA, dispatchId: "e3-fixture", transport: "antigravity", role: "pipeline-core:goldfish-implementor", prompt: `${prompt}\n${suffix}`,
    candidate: { commit: value.commit, tree: value.tree }, requiredPaths: ["input.txt"], requiredPathSha256: { "input.txt": sha256("input\n") }, resultDestination: { kind: "file", path: destination },
  };
}
function request(value, packetValue, extra = {}) {
  return { root: value.root, resultRoot: value.root, executable: value.executable, model: "gemini-3.8-flash-medium", effort: "medium", packet: packetValue, env: { ...process.env, E3_LOG: value.log }, timeoutMs: 500, ...extra };
}
function calls(value) { return existsSync(value.log) ? readFileSync(value.log, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : []; }

const cases = [];
const injectedFailure = process.env.PIPELINE_E3_AGY_HOST_TEST_INJECT_FAILURE ?? "";
function check(name, run) {
  const id = `E3H${String(cases.length + 1).padStart(2, "0")}`;
  cases.push({
    id,
    name,
    async run() {
      if (injectedFailure === id) assert.fail("intentional E3 Antigravity host case-completion failure");
      await run();
    },
  });
}

check("measures the live Antigravity-shaped pipeline manifest before probing", async () => {
  await withFixture(async (value) => {
  const result = measureAntigravityPipelineStart({ root: value.root, executable: value.executable, env: { ...process.env, E3_LOG: value.log } });
  assert.equal(result.status, "measured");
  assert.equal(result.code, "E3-PIPELINE-MEASURED");
  assert.equal(calls(value).length, 1, "live Antigravity-shaped manifest is discovered before probing");
  });
});

for (const [name, malformedManifest] of [
  ["rejects a hooks-only Antigravity manifest before probing or model execution", { hooks: {} }],
  ["rejects an incomplete namespaced Antigravity manifest before probing or model execution", { "pipeline-core": { enabled: true, PreToolUse: [], Stop: [], PreInvocation: [] } }],
]) {
  check(name, async () => {
  await withFixture(async (value) => {
    writeFileSync(join(value.root, "plugins", "pipeline-core", "hooks.json"), JSON.stringify(malformedManifest));
    const result = await dispatchGoldfishToAntigravity(request(value, packet(value)));
    assert.equal(result.status, "unavailable");
    assert.equal(result.code, E3_CODES.PIPELINE_DISCOVERY);
    assert.equal(result.modelCalls, 0);
    assert.equal(calls(value).length, 0, "unsupported manifests fail before any probe or model call");
  });
  });
}

check("dispatches a valid request and persists the schema-valid receipt", async () => {
  await withFixture(async (value) => {
  const result = await dispatchGoldfishToAntigravity(request(value, packet(value)));
  assert.equal(result.schema, CROSS_RUNNER_DISPATCH_RECEIPT_SCHEMA, JSON.stringify(result));
  assert.equal(result.status, "succeeded");
  assert.equal(result.code, E3_CODES.COMPLETED);
  assert.equal(result.probe.status, "measured");
  assert.equal(result.modelCalls, 1);
  assert.equal(result.persisted, true);
  const { persisted, ...storedReceipt } = result;
  const persistedReceipt = JSON.parse(readFileSync(join(value.root, "results/receipt.json"), "utf8"));
  assert.deepEqual(persistedReceipt, storedReceipt);
  const receiptSchema = JSON.parse(readFileSync(new URL("../../../schemas/pipeline.cross-runner-dispatch-receipt.v1.json", import.meta.url), "utf8"));
  assert.equal(validateAgainstSchema(persistedReceipt, receiptSchema).valid, true);
  assert.equal(calls(value).length, 2, "one probe plus one injected model boundary");
  });
});

check("classifies malformed and wrong-model Antigravity results", async () => {
  for (const [suffix, expected] of [["--malformed", AGY_ERROR_TAXONOMY.OUTPUT_MALFORMED], ["--wrong-model", AGY_ERROR_TAXONOMY.MODEL_MISMATCH]]) {
  await withFixture(async (value) => {
    const result = await dispatchGoldfishToAntigravity(request(value, packet(value, suffix)));
    assert.equal(result.status, "failed");
    assert.equal(result.code, expected);
    assert.equal(result.persisted, true);
  });
  }
});

check("records a timeout as an unavailable interruption", async () => {
  await withFixture(async (value) => {
  const result = await dispatchGoldfishToAntigravity(request(value, packet(value, "--slow"), { timeoutMs: 50 }));
  assert.equal(result.status, "failed");
  assert.equal(result.code, AGY_ERROR_TAXONOMY.TIMEOUT);
  assert.deepEqual(result.interruption, { status: "unavailable", code: AGY_ERROR_TAXONOMY.TIMEOUT });
  });
});

check("records cancellation as an unavailable interruption", async () => {
  await withFixture(async (value) => {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 25);
  const result = await dispatchGoldfishToAntigravity(request(value, packet(value, "--slow"), { signal: controller.signal, timeoutMs: 2_000 }));
  assert.equal(result.status, "failed");
  assert.equal(result.code, AGY_ERROR_TAXONOMY.CANCELLED);
  assert.deepEqual(result.interruption, { status: "unavailable", code: AGY_ERROR_TAXONOMY.CANCELLED });
  });
});

for (const [marker, code, name] of [
  ["missing", E3_CODES.PIPELINE_MARKER_MISSING, "refuses a missing pipeline-start marker before model execution"],
  ["mismatch", E3_CODES.PIPELINE_MARKER_MISMATCH, "refuses a mismatched pipeline-start marker before model execution"],
]) {
  check(name, async () => {
  await withFixture(async (value) => {
    const result = await dispatchGoldfishToAntigravity(request(value, packet(value), { env: { ...process.env, E3_LOG: value.log, E3_MARKER: marker } }));
    assert.equal(result.status, "refused");
    assert.equal(result.code, code);
    assert.equal(result.modelCalls, 0);
    const receiptSchema = JSON.parse(readFileSync(new URL("../../../schemas/pipeline.cross-runner-dispatch-receipt.v1.json", import.meta.url), "utf8"));
    assert.equal(validateAgainstSchema(result, receiptSchema).valid, true);
    assert.equal(existsSync(join(value.root, "results/receipt.json")), false);
    assert.equal(calls(value).length, 1, "probe only");
  });
  });
}

check("supports the sealed CLI request path and receipt persistence", async () => {
  await withFixture(async (value) => {
  const requestPath = join(value.root, "sealed-request.json");
  writeFileSync(requestPath, JSON.stringify({ root: value.root, resultRoot: value.root, executable: value.executable, model: "gemini-3.8-flash-medium", effort: "medium", packet: packet(value), timeoutMs: 500 }));
  const output = execFileSync(process.execPath, [hostScript, "--request", requestPath], { cwd: value.root, env: { ...process.env, E3_LOG: value.log }, encoding: "utf8" });
  const result = JSON.parse(output);
  assert.equal(result.status, "succeeded");
  assert.equal(result.persisted, true);
  });
});

check("refuses forged unavailable precondition readback without executing a model", async () => {
  await withFixture(async (value) => {
  const gatePath = join(value.root, "policies", "alfred-e3-gate-readback.v1.json");
  const forged = JSON.parse(readFileSync(gatePath, "utf8"));
  forged.status = "unavailable";
  forged.candidate = { commit: null, tree: null };
  for (const row of Object.values(forged.gates)) {
    row.status = "unavailable";
    row.reasonCode = "E3-FIXTURE-UNAVAILABLE";
    for (const artifact of row.artifacts) artifact.sha256 = null;
  }
  writeFileSync(gatePath, JSON.stringify(forged));
  const result = await dispatchGoldfishToAntigravity(request(value, packet(value), { preconditions: { a1: { status: "measured" }, a2: { status: "current" }, a3: { status: "covered" }, a5: { status: "authorized", casBound: true } } }));
  assert.equal(result.code, E3_CODES.PRECONDITION);
  assert.equal(result.modelCalls, 0);
  assert.equal(calls(value).length, 0);
  });
});

check("refuses an occupied result destination before executing a model", async () => {
  await withFixture(async (value) => {
  writeFileSync(join(value.root, "results", "receipt.json"), "occupied\n");
  const result = await dispatchGoldfishToAntigravity(request(value, packet(value)));
  assert.equal(result.code, "RDP-RESULT-DESTINATION");
  assert.equal(result.modelCalls, 0);
  assert.equal(calls(value).length, 0);
  });
});

check("refuses an escaping result destination before executing a model", async () => {
  await withFixture(async (value) => {
  const result = await dispatchGoldfishToAntigravity(request(value, packet(value, "", "../receipt.json")));
  assert.equal(result.code, "RDP-RESULT-PATH");
  assert.equal(result.modelCalls, 0);
  assert.equal(calls(value).length, 0);
  });
});

const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({
  cases: cases,
  fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536"),
});
