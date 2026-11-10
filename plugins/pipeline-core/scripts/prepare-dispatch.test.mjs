// SPDX-License-Identifier: SUL-1.0
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePrepareDispatchArgv, prepareCriticDispatch, prepareGoldfishDispatch } from "./prepare-dispatch.mjs";

const SCRIPT = fileURLToPath(new URL("./prepare-dispatch.mjs", import.meta.url));
const ROOT = join(tmpdir(), "prepare-dispatch-root");
const CANDIDATE = "a".repeat(40);
const ok = (value) => ({ status: 0, stdout: JSON.stringify(value), stderr: "" });
const no = (value, status = 2) => ({ status, stdout: JSON.stringify(value), stderr: "" });

/** A step runner answering by script name and first argument; `calls` records "script verb" in order. */
function stub(answers) {
  const calls = [];
  const runCommand = (executable, argv) => {
    const name = executable === "git" ? "git" : basename(argv[0]);
    const verb = executable === "git" ? argv[0] : argv[1]?.startsWith("--") ? "" : argv[1];
    const key = `${name} ${verb ?? ""}`.trim();
    calls.push({ key, argv });
    const answer = answers[key];
    assert.ok(answer !== undefined, `unexpected step ${key}`);
    return typeof answer === "function" ? answer(calls.filter((call) => call.key === key).length) : answer;
  };
  return { runCommand, calls, keys: () => calls.map((call) => call.key) };
}

const READY = { ready: true, findings: [], warnings: [] };
const BUILT = { ok: true, sha256: "b".repeat(64), warnings: [{ code: "W" }], dispatchCall: { tool: "Agent", subagent_type: "pipeline-core:goldfish-deep", promptPointer: "pointer" } };
const input = { root: ROOT, packagePath: "scratch/w1.package.json" };
const withRunner = (runner) => ({ readFile: () => JSON.stringify({ runner }) });

test("Goldfish ready on Claude names the Agent call and the default briefing path", () => {
  const steps = stub({ "dispatch-briefing.mjs probe": ok(READY), "dispatch-briefing.mjs build": ok(BUILT) });
  const result = prepareGoldfishDispatch(input, { ...withRunner("claude"), runCommand: steps.runCommand });
  assert.equal(result.status, "ready");
  assert.equal(result.briefing, "scratch/w1.briefing.md");
  assert.deepEqual(result.next, BUILT.dispatchCall);
  assert.deepEqual(result.warnings, [{ code: "W" }]);
  assert.deepEqual(steps.keys(), ["dispatch-briefing.mjs probe", "dispatch-briefing.mjs build"]);
});

test("Goldfish on Codex runs the native preparation and returns its spawn_agent fields", () => {
  const steps = stub({ "dispatch-briefing.mjs probe": ok(READY), "dispatch-briefing.mjs build": ok({ ...BUILT, dispatchCall: { tool: "spawn_agent" } }),
    "codex-native-dispatch-prepare.mjs prepare": ok({ status: "prepared", bindWindowSeconds: 90, spawn_agent: { agent_type: "worker", message: "text" }, next: "call it" }) });
  const result = prepareGoldfishDispatch(input, { ...withRunner("codex"), runCommand: steps.runCommand });
  assert.equal(result.status, "ready");
  assert.deepEqual(result.next, { tool: "spawn_agent", agent_type: "worker", message: "text", bindWindowSeconds: 90, note: "call it" });
  assert.ok(steps.calls[2].argv.includes("scratch/w1.briefing.md"));
});

test("Goldfish on Codex keeps a refused preparation's own code and repair", () => {
  const steps = stub({ "dispatch-briefing.mjs probe": ok(READY), "dispatch-briefing.mjs build": ok(BUILT),
    "codex-native-dispatch-prepare.mjs prepare": no({ status: "refused", code: "GUARD-X", reason: "because", repair: "do this" }) });
  const result = prepareGoldfishDispatch(input, { ...withRunner("codex"), runCommand: steps.runCommand });
  assert.equal(result.status, "stopped");
  assert.deepEqual(result.stop, { step: "codex-prepare", code: "GUARD-X", reason: "because", repair: "do this" });
});

test("Goldfish on Antigravity names invoke_subagent and adds no preparation step", () => {
  const steps = stub({ "dispatch-briefing.mjs probe": ok(READY), "dispatch-briefing.mjs build": ok({ ...BUILT, dispatchCall: null }) });
  const result = prepareGoldfishDispatch(input, { ...withRunner("antigravity"), runCommand: steps.runCommand });
  assert.equal(result.next.tool, "invoke_subagent");
  assert.equal(result.next.briefing, "scratch/w1.briefing.md");
  assert.equal(steps.calls.length, 2);
});

test("a failing probe stops with all failures and runs no build", () => {
  const findings = [{ code: "A", message: "first", repair: "fix a" }, { code: "B", message: "second", repair: "fix b" }];
  const steps = stub({ "dispatch-briefing.mjs probe": no({ ready: false, findings, warnings: [] }) });
  const result = prepareGoldfishDispatch(input, { ...withRunner("claude"), runCommand: steps.runCommand });
  assert.equal(result.status, "stopped");
  assert.equal(result.stop.code, "A");
  assert.equal(result.stop.repair, "fix a");
  assert.deepEqual(result.findings, findings);
  assert.deepEqual(steps.keys(), ["dispatch-briefing.mjs probe"]);
});

const HEAL_WARNING = { code: "DBG-SETTLED-PENDING-HEAL", message: "1 settled remain; run before dispatching: node /x/routine-repair.mjs run heal --root /r --reason retire settled pending states before dispatch" };

test("a pending heal without --no-goldfish-running runs nothing and names the command", () => {
  const steps = stub({ "dispatch-briefing.mjs probe": ok({ ...READY, warnings: [HEAL_WARNING] }), "dispatch-briefing.mjs build": ok(BUILT) });
  const result = prepareGoldfishDispatch(input, { ...withRunner("claude"), runCommand: steps.runCommand });
  assert.equal(result.status, "ready");
  assert.match(result.beforeDispatch, /^node \/x\/routine-repair\.mjs run heal/u);
  assert.equal(steps.keys().includes("routine-repair.mjs run"), false);
});

test("a heal command in a plugin path with a space is still handed over, as the whole warning", () => {
  const warning = { code: "DBG-SETTLED-PENDING-HEAL", message: "run before dispatching: node C:/Program Files/x/routine-repair.mjs run heal" };
  const steps = stub({ "dispatch-briefing.mjs probe": ok({ ...READY, warnings: [warning] }), "dispatch-briefing.mjs build": ok(BUILT) });
  const result = prepareGoldfishDispatch(input, { ...withRunner("claude"), runCommand: steps.runCommand });
  assert.equal(result.beforeDispatch, warning.message);
});

test("--no-goldfish-running heals once, probes again and clears the named command", () => {
  const steps = stub({ "dispatch-briefing.mjs probe": (count) => ok(count === 1 ? { ...READY, warnings: [HEAL_WARNING] } : READY), "routine-repair.mjs run": ok({ status: "ok" }), "dispatch-briefing.mjs build": ok(BUILT) });
  const result = prepareGoldfishDispatch({ ...input, noGoldfishRunning: true }, { ...withRunner("claude"), runCommand: steps.runCommand });
  assert.equal(result.status, "ready");
  assert.equal(result.beforeDispatch, undefined);
  assert.deepEqual(steps.keys(), ["dispatch-briefing.mjs probe", "routine-repair.mjs run", "dispatch-briefing.mjs probe", "dispatch-briefing.mjs build"]);
});

const CRITIC = { root: ROOT, spec: "specs/f/spec.md", base: "b".repeat(40), candidate: CANDIDATE, guardrails: ["guardrails/git.md"], label: "suite", command: ["node", "--test", "x.test.mjs"] };
const PACKET_READY = { status: "packet-ready", candidate: { commit: CANDIDATE }, nextStep: "write and admit",
  admitRequest: { packetId: "c".repeat(32), sessionId: "<FILL sessionId: hint>", taskId: "T1" }, admitCommand: ["node", "${PIPELINE_PLUGIN_ROOT}/scripts/session-critic-finalizer.mjs", "admit"] };
const noFiles = { exists: () => false, mkdir: () => {}, writeFile: () => {} };
const SAME_CANDIDATE = JSON.stringify({ candidate: { commit: CANDIDATE } });

test("the first Critic call produces and registers evidence, stops once with the exact paths and commits nothing", () => {
  const steps = stub({ "git log": { status: 0, stdout: "\n", stderr: "" }, "critic-diagnostic-evidence.mjs": ok({ path: "x" }),
    "register-feature-package.mjs": ok({ status: "registered", commitPaths: ["specs/f/manifest.json"] }) });
  const result = prepareCriticDispatch(CRITIC, { ...noFiles, runCommand: steps.runCommand });
  assert.equal(result.status, "commit-required");
  assert.deepEqual(result.commitPaths, ["specs/f/evidence/suite.json", "specs/f/evidence/suite.log", "specs/f/manifest.json"]);
  assert.deepEqual(result.rerun.argv.slice(1, 3), ["critic", "--root"]);
  assert.deepEqual(result.rerun.argv.slice(-4), ["--", "node", "--test", "x.test.mjs"]);
  assert.equal(steps.keys().some((key) => key.startsWith("git commit") || key.startsWith("git add")), false);
});

test("a registered evidence that is still uncommitted is registered again and asks for the same commit, without producing it twice", () => {
  const steps = stub({ "git log": { status: 0, stdout: "", stderr: "" }, "register-feature-package.mjs": ok({ status: "registered", commitPaths: [] }) });
  const result = prepareCriticDispatch(CRITIC, { ...noFiles, exists: () => true, readFile: () => SAME_CANDIDATE, runCommand: steps.runCommand });
  assert.equal(result.status, "commit-required");
  assert.deepEqual(steps.keys(), ["git log", "register-feature-package.mjs"]);
});

test("a label that recorded another candidate is refused before anything runs", () => {
  const steps = stub({});
  const result = prepareCriticDispatch(CRITIC, { ...noFiles, exists: () => true, readFile: () => JSON.stringify({ candidate: { commit: "e".repeat(40) } }), runCommand: steps.runCommand });
  assert.equal(result.stop.code, "PREP-LABEL-OTHER-CANDIDATE");
  assert.deepEqual(steps.calls, []);
});

test("a rerun keeps a request the agent already filled and replaces an untouched draft", () => {
  const commit = "d".repeat(40);
  const answers = { "git log": { status: 0, stdout: `${commit}\n`, stderr: "" }, "critic-dispatch-preflight.mjs": ok(PACKET_READY) };
  const requestOr = (request) => (path) => (String(path).endsWith("session-critic-finalization-request.json") ? JSON.stringify(request) : SAME_CANDIDATE);
  const renamed = [];
  const files = { mkdir: () => {}, writeFile: () => {}, exists: () => true, rename: (from, to) => renamed.push([from, to]) };
  const filled = prepareCriticDispatch(CRITIC, { ...files, readFile: requestOr({ packetId: "old-packet", sessionId: "s1" }), runCommand: stub(answers).runCommand });
  assert.equal(filled.previousRequest, "scratch/session-critic-finalization-request.old-packet.json");
  assert.match(renamed[0][1], /session-critic-finalization-request\.old-packet\.json$/u);
  const draft = prepareCriticDispatch(CRITIC, { ...files, readFile: requestOr(PACKET_READY.admitRequest), runCommand: stub(answers).runCommand });
  assert.equal(draft.previousRequest, undefined);
  assert.equal(renamed.length, 1);
});

test("the identical rerun finds the evidence commit, reaches packet-ready and writes the admit request", () => {
  const commit = "d".repeat(40);
  const written = [];
  const steps = stub({ "git log": { status: 0, stdout: `${commit}\n`, stderr: "" }, "critic-dispatch-preflight.mjs": ok(PACKET_READY) });
  const result = prepareCriticDispatch(CRITIC, { mkdir: () => {}, writeFile: (path, text) => written.push([path, text]), exists: (path) => !String(path).endsWith("finalization-request.json"), readFile: () => SAME_CANDIDATE, runCommand: steps.runCommand });
  assert.equal(result.status, "ready");
  assert.equal(result.packetId, "c".repeat(32));
  assert.deepEqual(result.next.placeholders, ["sessionId"]);
  assert.match(result.next.admitCommand[1], /session-critic-finalizer\.mjs$/u);
  assert.doesNotMatch(result.next.admitCommand[1], /PIPELINE_PLUGIN_ROOT/u);
  const argv = steps.calls.at(-1).argv;
  assert.equal(argv[argv.indexOf("--registration-commit") + 1], commit);
  assert.equal(argv[argv.indexOf("--evidence") + 1], "specs/f/evidence/suite.json");
  assert.equal(written.length, 1);
  assert.deepEqual(JSON.parse(written[0][1]), PACKET_READY.admitRequest);
});

test("a preflight refusal keeps its own code and reason", () => {
  const steps = stub({ "critic-dispatch-preflight.mjs": no({ status: "rejected", code: "CDP-EVIDENCE", reason: "no evidence", repair: "produce it" }, 1) });
  const result = prepareCriticDispatch({ ...CRITIC, label: null, command: [], evidence: ["e.json"] }, { ...noFiles, runCommand: steps.runCommand });
  assert.deepEqual(result.stop, { step: "preflight", code: "CDP-EVIDENCE", reason: "no evidence", repair: "produce it" });
});

test("a symbolic candidate is refused before any step, because the evidence commit moves HEAD", () => {
  const steps = stub({});
  const result = prepareCriticDispatch({ ...CRITIC, candidate: "HEAD" }, { ...noFiles, runCommand: steps.runCommand });
  assert.equal(result.stop.code, "PREP-CANDIDATE-NOT-COMMIT");
  assert.deepEqual(steps.calls, []);
});

test("the argument parser takes the check command after the separator and refuses an unknown flag", () => {
  const parsed = parsePrepareDispatchArgv(["critic", "--root", ROOT, "--spec", "s", "--guardrail", "a", "--guardrail", "b", "--label", "l", "--", "node", "--test"]);
  assert.deepEqual(parsed.options.guardrails, ["a", "b"]);
  assert.deepEqual(parsed.options.command, ["node", "--test"]);
  assert.match(parsePrepareDispatchArgv(["goldfish", "--root", ROOT, "--nope", "x"]).error, /unknown flag/u);
  assert.match(parsePrepareDispatchArgv(["goldfish"]).error, /--root is required/u);
});

test("--help works in an empty directory and names both verbs", () => {
  const empty = mkdtempSync(join(tmpdir(), "prepare-dispatch-help-"));
  try {
    for (const flag of ["--help", "-h"]) {
      const run = spawnSync(process.execPath, [SCRIPT, flag], { cwd: empty, encoding: "utf8" });
      assert.equal(run.status, 0, run.stderr);
      assert.match(run.stdout, /goldfish --root/u);
      assert.match(run.stdout, /critic --root/u);
      assert.match(run.stdout, /dispatch-briefing\.mjs --help/u);
    }
  } finally { rmSync(empty, { recursive: true, force: true }); }
});
