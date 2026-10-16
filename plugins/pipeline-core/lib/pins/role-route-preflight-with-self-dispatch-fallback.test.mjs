// SPDX-License-Identifier: SUL-1.0
/**
 * Criterion-bound pin (QG-04) for AC-245 / pipeline.role-route-preflight-with-self-dispatch-fallback.
 *
 * Points, each driven through the real modules (no mock of the behavior under test):
 *  1. evaluateRoleRoutePreflight reports native | fallback-self-dispatch | unavailable per role,
 *     with RRP-* codes; fallback is legal only for the claude advisor.
 *  2a. prepareCanonicalRoleFallback / runCanonicalRoleFallback turn a failed role route into a
 *     method-preparation-only self-dispatch with canonical templates.
 *  3. The fallback is not self-review: a fresh-context subagent of the packet's role, read-only for
 *     Critic/Advisor, with the evidence left to the owning role's intake.
 *  4. The producer failure output is surfaced: runCanonicalRoleFallback returns exitCode/stdout/stderr,
 *     and executeDesignCourseProducer returns a bounded, sanitized stderr TEXT (not only a byte count).
 *
 * HELD (not built here): 2b, the design course accepting a fallback result as the role's evidence.
 * A later run needs the consumer of runCanonicalRoleFallback output in design-course-session.mjs
 * (runDesignCourseV2) to route a "returned" fallback through the owning role's intake.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { evaluateRoleRoutePreflight } from "../role-route-preflight.mjs";
import { registeredFunctionalTaskRoutes } from "../model-role-route-source.mjs";
import {
  ROLE_DISPATCH_REQUEST_SCHEMA,
  prepareCanonicalRoleFallback,
  runCanonicalRoleFallback,
} from "../role-dispatch-preflight.mjs";
import { buildDesignCourseProducerAction, executeDesignCourseProducer } from "../../scripts/design-course-session.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const pluginRoot = resolve(repoRoot, "plugins", "pipeline-core");
const digest = (char) => char.repeat(64);
const observed = (kind, evidenceSha256 = digest("a")) => ({ kind, evidenceSha256, hookRecordedStart: true, hookRecordedTerminal: true });
const ROLES = ["advisor", "critic", "goldfish.implement", "goldfish.mechanic", "goldfish.deep", "readiness", "plan-verifier"];
const headOf = (cwd) => execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();

// --- Point 1: per-role route preflight ---------------------------------------------------------
test("point 1: native, fallback-self-dispatch and unavailable are all reported per role with RRP-* codes", () => {
  const source = registeredFunctionalTaskRoutes();
  assert.equal(source.ok, true, "the real registry source must be registered");
  const result = evaluateRoleRoutePreflight({ source, runner: "claude", hostObservations: {
    advisor: observed("fallback-self-dispatch", digest("b")),
    critic: observed("native"),
  } });
  assert.equal(result.schema, "pipeline.role-route-preflight.v1");
  assert.equal(result.ok, true);
  assert.deepEqual(result.roles.advisor, { state: "fallback-self-dispatch", reasonCode: "RRP-FALLBACK-ADVISOR-CONSULT", evidence: digest("b") });
  assert.equal(result.roles.critic.state, "native");
  assert.match(result.roles.critic.reasonCode, /^RRP-/u);
  assert.equal(result.roles["goldfish.implement"].state, "unavailable");
  assert.match(result.roles["goldfish.implement"].reasonCode, /^RRP-/u);
});

test("point 1: fallback-self-dispatch is legal only for the claude advisor", () => {
  const source = registeredFunctionalTaskRoutes();
  for (const runner of ["claude", "codex", "antigravity"]) {
    for (const role of ROLES.filter((name) => name !== "advisor")) {
      const result = evaluateRoleRoutePreflight({ source, runner, hostObservations: { [role]: observed("fallback-self-dispatch") } });
      assert.equal(result.roles[role].state, "unavailable", `${runner}/${role}`);
      assert.equal(result.roles[role].reasonCode, "RRP-FALLBACK-ROLE-NOT-ALLOWED", `${runner}/${role}`);
    }
  }
  for (const runner of ["codex", "antigravity"]) {
    const result = evaluateRoleRoutePreflight({ source, runner, hostObservations: { advisor: observed("fallback-self-dispatch") } });
    assert.notEqual(result.roles.advisor.state, "fallback-self-dispatch", `${runner} has no advisor fallback route`);
  }
});

// --- Points 2a, 3, 4 (runCanonicalRoleFallback half): git fixture under scratch/ ---------------
const scratchParent = join(repoRoot, "scratch");
mkdirSync(scratchParent, { recursive: true });
const fixture = realpathSync(mkdtempSync(join(scratchParent, "role-fallback-pin-")));
const fixtureEnv = { ...process.env, GIT_CEILING_DIRECTORIES: scratchParent };
const git = (...args) => execFileSync("git", args, { cwd: fixture, env: fixtureEnv, encoding: "utf8" }).trim();
git("init", "-q");
git("config", "user.email", "fixture@example.invalid");
git("config", "user.name", "Fixture");
mkdirSync(join(fixture, "scratch"));
writeFileSync(join(fixture, "input.txt"), "input\n");
git("add", "input.txt");
git("commit", "-q", "-m", "fixture");
const candidate = { commit: git("rev-parse", "HEAD"), tree: git("rev-parse", "HEAD^{tree}") };
const projectHeadBefore = headOf(repoRoot);
test.after(() => {
  rmSync(fixture, { recursive: true, force: true });
  assert.equal(headOf(repoRoot), projectHeadBefore, "project HEAD must be unchanged by the pin");
});

function templateBody(relativePath) {
  const raw = readFileSync(join(pluginRoot, "..", "..", relativePath), "utf8");
  const marker = "COPY EVERYTHING BELOW THIS LINE\n-->";
  const index = raw.indexOf(marker);
  assert.ok(index >= 0, `${relativePath}: copy marker`);
  return raw.slice(index + marker.length)
    .replace(/\{\{MODEL_ID\}\}/g, "claude-sonnet-5-5").replace(/\{\{EFFORT\}\}/g, "medium")
    .replace(/\{\{MODEL_EFFORT[^{}]*\}\}/g, "claude-sonnet-5-5 / medium")
    .replace(/\{\{TOOL_BUDGET[^{}]*\}\}/g, "<=24 tool uses").replace(/\{\{[^{}]*\}\}/g, "FILLED")
    .replace(/opus/gi, "sonnet");
}
const PROMPTS = {
  "consult-advisor": "Inspect input.txt with model codex; Ruleset-SHA: 0f38b425.",
  critic: templateBody("templates/prompts/critic-review.md"),
  "goldfish-implementor": templateBody("templates/prompts/goldfish-task.md"),
};
const packetFor = (role, index) => ({
  schema: ROLE_DISPATCH_REQUEST_SCHEMA, dispatchId: `fallback-${index}`, transport: "direct",
  role: `pipeline-core:${role}`, prompt: PROMPTS[role], candidate,
  requiredPaths: ["input.txt"], requiredPathSha256: { "input.txt": createHash("sha256").update("input\n").digest("hex") },
  resultPath: `scratch/result-${index}.json`,
});

test("point 2a: a failed route is prepared as a canonical self-dispatch fallback (preparation only)", () => {
  const expected = { critic: ["templates/prompts/critic-review.md", "duty.critic_normal"],
    "consult-advisor": ["skills/advisor-consult/SKILL.md", "duty.advisory"],
    "goldfish-implementor": ["templates/prompts/goldfish-task.md", "duty.implement"] };
  let index = 0;
  for (const [role, [path, taskRoute]] of Object.entries(expected)) {
    const result = prepareCanonicalRoleFallback({ root: fixture, packet: packetFor(role, ++index), runner: "claude", reasonCode: "RRP-NO-HOST-OBSERVATION" });
    assert.equal(result.status, "prepared", `${role}: ${result.code}`);
    assert.equal(result.code, "RDF-PREPARED");
    assert.equal(result.route, "fallback-self-dispatch");
    assert.equal(result.reasonCode, "RRP-NO-HOST-OBSERVATION");
    assert.equal(result.assurance, "method-preparation-only");
    assert.equal(result.nativeProof, "unavailable");
    assert.equal(result.taskRoute, taskRoute);
    assert.equal(result.carrier.path, path);
    assert.match(result.carrier.sha256, /^[a-f0-9]{64}$/u);
    assert.ok(result.action.canonicalTemplate.length > 0, "canonical template text is carried");
    assert.equal(result.modelCalls, 0);
    assert.equal(result.launcherCalls, 0);
  }
  const bad = prepareCanonicalRoleFallback({ root: fixture, packet: packetFor("critic", 9), runner: "not-a-runner", reasonCode: "x" });
  assert.equal(bad.status, "unavailable");
  assert.equal(bad.code, "RDF-INPUT");
  assert.equal(bad.route, "fallback-self-dispatch");
});

test("point 3: the fallback is not self-review (fresh context, read-only for Critic/Advisor, intake still required)", async () => {
  let index = 20;
  for (const [role, readOnly] of [["critic", true], ["consult-advisor", true], ["goldfish-implementor", false]]) {
    const launched = [];
    const result = await runCanonicalRoleFallback({ root: fixture, packet: packetFor(role, ++index), runner: "claude",
      reasonCode: "RRP-NO-HOST-OBSERVATION", launch: async (action, packet) => { launched.push({ action, packet }); return { exitCode: 0, stdout: "ok", stderr: "" }; } });
    assert.equal(launched.length, 1, role);
    const { action } = launched[0];
    assert.equal(action.kind, "runner-native-subagent");
    assert.equal(action.subagentType, `pipeline-core:${role}`, "dispatched to the packet's own role, never the caller");
    assert.equal(action.freshContext, true);
    assert.equal(action.readOnly, readOnly, role);
    assert.equal(action.requiredAdmission, "owning-role-course-and-host-gates");
    assert.equal(result.status, "returned");
    assert.equal(result.evidenceStatus, "owning-role-intake-required", "exit zero is not review evidence");
    assert.equal(result.nativeProof, "unavailable");
    assert.equal(result.launcherCalls, 1);
  }
  const noLauncher = await runCanonicalRoleFallback({ root: fixture, packet: packetFor("critic", 40), runner: "claude", reasonCode: "RRP-X" });
  assert.equal(noLauncher.code, "RDF-LAUNCHER");
  assert.equal(noLauncher.launcherCalls, 0, "without an explicit launcher nothing is run");
});

test("point 4a: runCanonicalRoleFallback surfaces exitCode, stdout and stderr of a failed producer", async () => {
  const result = await runCanonicalRoleFallback({ root: fixture, packet: packetFor("critic", 50), runner: "claude",
    reasonCode: "RRP-X", launch: async () => ({ exitCode: 3, stdout: "partial", stderr: "boom" }) });
  assert.equal(result.status, "failed");
  assert.equal(result.code, "RDF-PRODUCER-FAILED");
  assert.deepEqual(result.output, { exitCode: 3, stdout: "partial", stderr: "boom" });
  const thrown = await runCanonicalRoleFallback({ root: fixture, packet: packetFor("critic", 51), runner: "claude",
    reasonCode: "RRP-X", launch: async () => { throw new Error("launcher exploded"); } });
  assert.equal(thrown.code, "RDF-LAUNCH-ERROR");
  assert.equal(thrown.output.stderr, "launcher exploded");
});

// --- Point 4b: executeDesignCourseProducer surfaces a bounded, sanitized stderr text -----------
const sources = Object.fromEntries(["input", "prd", "spec", "design", "traceability"].map((name, index) => [name,
  { path: `docs/${name}.md`, sha256: String(index).repeat(64) }]));
function execute(spawnResult) {
  const action = buildDesignCourseProducerAction({ root: fixture, pluginRoot, candidate, sources, featureId: "feature-x",
    authoringDispatchId: "author-x", profile: "feature", outputPrefix: "evidence/advisor", runner: "claude", stage: "advisor" });
  return executeDesignCourseProducer(action, { execFileSync: () => fixture, readCandidate: () => candidate, spawnSync: () => spawnResult });
}

test("point 4b: a producer failure with unparseable stdout surfaces its stderr text, not only a byte count", () => {
  const result = execute({ status: 1, signal: null, stdout: "not json", stderr: "boom" });
  assert.equal(result.status, "producer-output-invalid");
  assert.equal(result.exitCode, 1);
  assert.equal(result.stderrBytes, 4);
  assert.equal(result.stderr, "boom");
});

test("point 4b: a producer failure with parseable stdout surfaces its stderr text too", () => {
  const result = execute({ status: 1, signal: null, stdout: JSON.stringify({ ok: false, status: "failed" }), stderr: "boom" });
  assert.equal(result.status, "producer-failed");
  assert.equal(result.stderrBytes, 4);
  assert.equal(result.stderr, "boom");
});

test("point 4b: the surfaced stderr is bounded to 4096 bytes with a truncation marker and keeps the true byte count", () => {
  const result = execute({ status: 1, signal: null, stdout: "not json", stderr: "x".repeat(10_000) });
  assert.equal(result.stderrBytes, 10_000);
  assert.ok(Buffer.byteLength(result.stderr) <= 4096, "at most 4096 bytes");
  assert.match(result.stderr, /\[truncated\]$/u);
});

test("point 4b: the surfaced stderr carries no absolute home or drive paths", () => {
  const dirty = "fatal at C:\\Users\\example-user\\work\\x.js:1 and /home/example-user/work/y.js and /Users/example-user/z.js";
  const result = execute({ status: 1, signal: null, stdout: "not json", stderr: dirty });
  assert.match(result.stderr, /fatal at /u);
  assert.doesNotMatch(result.stderr, /example-user/iu);
  assert.doesNotMatch(result.stderr, /[A-Za-z]:\\/u);
  assert.doesNotMatch(result.stderr, /\/home\/|\/Users\//u);
});
