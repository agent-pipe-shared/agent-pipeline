// SPDX-License-Identifier: SUL-1.0
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePrepareDispatchArgv, prepareCriticDispatch, prepareGoldfishDispatch } from "./prepare-dispatch.mjs";
import * as criticBriefingLib from "../lib/critic-briefing-build.mjs";
import { dispatchFindings } from "../lib/dispatch-policy.mjs";
import { CRITIC_DISPATCH_PROSE } from "../hooks/antigravity-pretool-guard.mjs";

const TEMPLATE = readFileSync(fileURLToPath(new URL("../templates/prompts/critic-review.md", import.meta.url)), "utf8");

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
  // Antigravity greenfield 2026-11-10: the run chose Workspace "inherit" and was refused AGY-NATIVE-WORKSPACE-NOT-ISOLATED.
  assert.match(result.next.arguments, /Workspace is "branch"/u);
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
const BASE = "b".repeat(40);
const PACKET_READY = { status: "packet-ready", base: { commit: BASE }, candidate: { commit: CANDIDATE }, nextStep: "write and admit",
  dispatch: { reviewerInput: { baseCommit: BASE, candidateCommit: CANDIDATE, rulesetSha: CANDIDATE, specPath: "specs/f/spec.md", governanceConstraintPaths: [], guardrailPaths: ["guardrails/git.md"], evidencePaths: ["specs/f/evidence/suite.json"] } },
  admitRequest: { packetId: "c".repeat(32), sessionId: "<FILL sessionId: hint>", taskId: "T1" }, admitCommand: ["node", "${PIPELINE_PLUGIN_ROOT}/scripts/session-critic-finalizer.mjs", "admit"] };
const REV_LIST = { status: 0, stdout: `${CANDIDATE}\n`, stderr: "" };
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
  const answers = { "git log": { status: 0, stdout: `${commit}\n`, stderr: "" }, "critic-dispatch-preflight.mjs": ok(PACKET_READY), "git rev-list": REV_LIST };
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
  const steps = stub({ "git log": { status: 0, stdout: `${commit}\n`, stderr: "" }, "critic-dispatch-preflight.mjs": ok(PACKET_READY), "git rev-list": REV_LIST });
  const result = prepareCriticDispatch(CRITIC, { mkdir: () => {}, writeFile: (path, text) => written.push([path, text]), exists: (path) => !String(path).endsWith("finalization-request.json"), readFile: () => SAME_CANDIDATE, runCommand: steps.runCommand });
  assert.equal(result.status, "ready");
  assert.equal(result.packetId, "c".repeat(32));
  assert.deepEqual(result.next.placeholders, ["sessionId"]);
  assert.match(result.next.admitCommand[1], /session-critic-finalizer\.mjs$/u);
  assert.doesNotMatch(result.next.admitCommand[1], /PIPELINE_PLUGIN_ROOT/u);
  const argv = steps.calls.find((call) => call.key === "critic-dispatch-preflight.mjs").argv;
  assert.equal(argv.includes("--registration-commit"), false, "the preflight derives it: in a correction round it is the later delta registration, not the evidence commit");
  assert.equal(argv[argv.indexOf("--evidence") + 1], "specs/f/evidence/suite.json");
  assert.equal(written.length, 2, "the admit request and one Critic briefing");
  assert.deepEqual(JSON.parse(written[0][1]), PACKET_READY.admitRequest);
  assert.match(written[1][0].replace(/\\/gu, "/"), /scratch\/critic-briefing\/bbbbbbbbbbbb-aaaaaaaaaaaa\/critic\.briefing\.md$/u);
  assert.deepEqual(result.next.briefings.map(({ path, entryId }) => [path, entryId]), [["scratch/critic-briefing/bbbbbbbbbbbb-aaaaaaaaaaaa/critic.briefing.md", null]]);
});

test("a preflight refusal keeps its own code and reason", () => {
  const steps = stub({ "critic-dispatch-preflight.mjs": no({ status: "rejected", code: "CDP-EVIDENCE", reason: "no evidence", repair: "produce it" }, 1) });
  const result = prepareCriticDispatch({ ...CRITIC, label: null, command: [], evidence: ["e.json"] }, { ...noFiles, runCommand: steps.runCommand });
  assert.deepEqual(result.stop, { step: "preflight", code: "CDP-EVIDENCE", reason: "no evidence", repair: "produce it" });
});

test("an explicit registration commit passes through, and a step with a code but no words shows its output", () => {
  const given = "9".repeat(40);
  const passed = stub({ "critic-dispatch-preflight.mjs": ok(PACKET_READY), "git rev-list": REV_LIST });
  prepareCriticDispatch({ ...CRITIC, label: null, command: [], evidence: ["e.json"], registrationCommit: given }, { ...noFiles, runCommand: passed.runCommand });
  const argv = passed.calls.find((call) => call.key === "critic-dispatch-preflight.mjs").argv;
  assert.equal(argv[argv.indexOf("--registration-commit") + 1], given);
  const silent = stub({ "critic-dispatch-preflight.mjs": no({ code: "CDP-GIT" }, 1) });
  const result = prepareCriticDispatch({ ...CRITIC, label: null, command: [], evidence: ["e.json"] }, { ...noFiles, runCommand: silent.runCommand });
  assert.equal(result.stop.code, "CDP-GIT");
  assert.match(result.stop.reason, /CDP-GIT/u);
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

// --- PO tile 2026-11-10: the Critic preparation writes the filled briefing. Two greenfield runs hand-wrote it the same day: one Critic got no
// correction input bindings and was then resumed with a message naming the earlier round's outcome, which made it withhold its verdict. ---

const PREV = "1".repeat(40), MID = "2".repeat(40), HEAD = "3".repeat(40);
const REGISTRATION = "4".repeat(40), SOURCE_SHA = "5".repeat(64), DECISION_SHA = "6".repeat(64), PACKET = "7".repeat(32);
const DELTA_REQUEST = "specs/f/evidence/critic-delta-request-x.json", PRIOR = "specs/f/evidence/critic-prior.json";
const reviewerInput = (over = {}) => ({ baseCommit: PREV, candidateCommit: HEAD, candidateTree: "8".repeat(40), rulesetSha: HEAD, specPath: "specs/f/spec.md",
  governanceConstraintPaths: [], guardrailPaths: ["guardrails/git.md"], evidencePaths: ["specs/f/evidence/suite-2.json"], ...over });
function deltaSplitPreflight() {
  const entry = (id, paths) => ({ id, moduleId: null, paths, scopeMarker: `scope:${id}`, reviewerInput: reviewerInput({ changedPaths: paths }),
    batchScopeLine: `Batch scope (MP-07): path group ${id} of the reviewed range ${PREV.slice(0, 12)}..${HEAD.slice(0, 12)} (1 of 2 changed files), part 1 of 2 of one split review round.` });
  return { status: "packet-ready", base: { commit: PREV }, candidate: { commit: HEAD },
    correctionInputBindings: { path: null, derived: true, digestSha256: "9".repeat(64) },
    coordinatorOnly: { priorCriticEvidence: { path: PRIOR }, courseAdmission: { featureId: "f", registrationCommit: REGISTRATION, sourceSha256: SOURCE_SHA, decisionSha256: DECISION_SHA, round: 2, correctionCommits: 1 } },
    dispatch: { reviewerInput: reviewerInput() },
    admitRequest: { packetId: PACKET, trigger: "T1", review: { priorCriticEvidencePath: PRIOR, deltaRequest: DELTA_REQUEST } },
    criticDispatchPromptLines: [`Batch scope (MP-07): the reviewed range ${PREV.slice(0, 12)}..${HEAD.slice(0, 12)} (2 changed files in 2 top-level paths), one batch.`,
      "Rationale (MP-07): the registered Critic route duty.critic_high_risk requests opus at effort max; it is used for critical architecture or security checks of this one batch only."],
    split: { entries: [entry("group-1", ["a.mjs"]), entry("group-2", ["b.mjs"])] } };
}
const BINDINGS_FILE = `scratch/critic-briefing/${PREV.slice(0, 12)}-${HEAD.slice(0, 12)}/correction-input-bindings.json`;
const FORBIDDEN = [PACKET, REGISTRATION, SOURCE_SHA, DECISION_SHA, DELTA_REQUEST, PRIOR];

test("a split correction round gets one filled briefing per entry with its scope, ordinal, range and bindings, and nothing from earlier rounds", () => {
  const { renderCriticBriefings } = criticBriefingLib;
  const { briefings } = renderCriticBriefings({ preflight: deltaSplitPreflight(), templateText: TEMPLATE, commits: [MID, HEAD], bindingsPath: BINDINGS_FILE, runner: "claude", root: ROOT, projectName: "p" });
  assert.deepEqual(briefings.map((entry) => entry.entryId), ["group-1", "group-2"]);
  for (const [index, { text, placeholders }] of briefings.entries()) {
    const id = `group-${index + 1}`;
    assert.match(text, new RegExp(`^- Batch scope \\(MP-07\\): path group ${id} of the reviewed range .* Paths of this part: \`${index === 0 ? "a" : "b"}\\.mjs\`\\. Begin trajectory_evidence with "scope:${id} "\\.$`, "mu"));
    assert.match(text, /^- Rationale \(MP-07\): .*critical architecture or security/mu, "the Opus MP-07 rationale sits in the briefing");
    assert.match(text, new RegExp(`^- Re-critic \\(MP-07\\): ${PREV}\\.\\.${HEAD}$`, "mu"));
    assert.match(text, /^- Review ordinal: 2$/mu);
    assert.ok(text.includes(BINDINGS_FILE), "the correction input bindings are named");
    assert.ok(text.includes(`${MID}, ${HEAD}`), "the enumerated commits");
    assert.ok(text.includes("- Spec (the contract): specs/f/spec.md"));
    assert.doesNotMatch(text, /\{\{/u, "no template placeholder is left");
    assert.doesNotMatch(text, /Generic exact-range batch registration \(Coordinator only\)/u, "the Coordinator-only section is cut off");
    for (const value of FORBIDDEN) assert.equal(text.includes(value), false, `the briefing carries ${value}`);
    assert.deepEqual(placeholders, ["MODEL_ID", "EFFORT"]);
    // What the dispatcher sends: the briefing with its two values filled. The dispatch policy admits it as a clean Opus Critic prompt.
    const prompt = text.replace("<FILL MODEL_ID: the concrete model id the dispatch call passes as model>", "claude-opus-4-1").replace("<FILL EFFORT: the effort the dispatch call requests>", "max");
    const codes = dispatchFindings({ subagentType: "critic", prompt: `Model/effort for this run: claude-opus-4-1 / max\n${prompt}` }).findings.map(({ code }) => code);
    assert.deepEqual(codes.filter((code) => code.startsWith("DISPATCH-CONTAMINATION") || code === "DISPATCH-OPUS-NO-BATCH-RATIONALE" || code.startsWith("DISPATCH-RECRITIC")), [], codes.join(", "));
  }
});

test("a first full review gets no re-critic or ordinal line and states that no bindings apply", () => {
  const preflight = { ...deltaSplitPreflight(), coordinatorOnly: { priorCriticEvidence: null, courseAdmission: { round: 1 } }, correctionInputBindings: undefined, split: undefined, criticDispatchPromptLines: undefined };
  const [{ text, entryId }] = criticBriefingLib.renderCriticBriefings({ preflight, templateText: TEMPLATE, commits: [MID, HEAD], runner: "claude", root: ROOT, projectName: "p" }).briefings;
  assert.equal(entryId, null);
  assert.doesNotMatch(text, /^- Re-critic/mu);
  assert.doesNotMatch(text, /^- Review ordinal/mu);
  assert.doesNotMatch(text, /^- Rationale \(MP-07\)/mu);
  assert.match(text, /Correction input bindings \(when retained prior results occur in the range\):\n\s+not applicable\./u);
  assert.match(text, /^- Batch scope \(MP-07\): the reviewed range 111111111111\.\.333333333333, one batch\.$/mu);
});

test("Antigravity gets the template's paths-only envelope with absolute paths, which the Contamination Rule admits", () => {
  const { briefings } = criticBriefingLib.renderCriticBriefings({ preflight: { ...deltaSplitPreflight(), split: undefined }, templateText: TEMPLATE, commits: [MID, HEAD], bindingsPath: BINDINGS_FILE, runner: "antigravity", root: "/repo/root", projectName: "p" });
  const [{ text, placeholders }] = briefings;
  const lines = text.trimEnd().split("\n");
  assert.equal(lines[0], "templates/prompts/critic-review.md", "the first line stays the canonical template path");
  assert.ok(lines.includes("spec: /repo/root/specs/f/spec.md"));
  assert.ok(lines.includes(`commit: ${MID}`) && lines.includes(`commit: ${HEAD}`), "one commit row per enumerated commit");
  assert.ok(lines.includes("guardrail: /repo/root/guardrails/git.md"));
  assert.ok(lines.includes(`evidence: /repo/root/${BINDINGS_FILE}`), "the bindings travel as an evidence row");
  assert.ok(lines.includes("route: T1") && lines.includes(`ruleset-sha: ${HEAD}`));
  assert.deepEqual(placeholders, ["MODEL"]);
  assert.doesNotMatch(text, CRITIC_DISPATCH_PROSE);
  assert.doesNotMatch(text, /Repository root|Rationale|Batch scope/u, "no prose and no Claude MP-07 line in the envelope");
  for (const value of FORBIDDEN) assert.equal(text.includes(value), false, `the envelope carries ${value}`);
});

test("R14 (Antigravity run 3): on Antigravity the briefing use names the prepare step a read-only Critic call needs", () => {
  const steps = stub({ "critic-dispatch-preflight.mjs": ok({ ...deltaSplitPreflight(), split: undefined }), "critic-correction-input-bindings.mjs derive": ok({ digestSha256: "9".repeat(64), path: BINDINGS_FILE }), "git rev-list": { status: 0, stdout: `${MID}\n${HEAD}\n`, stderr: "" } });
  const result = prepareCriticDispatch({ root: ROOT, spec: "specs/f/spec.md", base: PREV, candidate: HEAD, evidence: ["specs/f/evidence/suite-2.json"] },
    { exists: () => false, mkdir: () => {}, writeFile: () => {}, env: { AI_AGENT: "antigravity" }, runCommand: steps.runCommand });
  assert.equal(result.status, "ready", JSON.stringify(result.stop ?? null));
  assert.match(result.next.briefingUse, /antigravity-native-dispatch-prepare\.mjs prepare --root <root> --request <file>/u);
  assert.match(result.next.briefingUse, /AGY-NATIVE-ARTIFACT-MISSING/u);
  assert.match(result.next.briefingUse, /TypeName critic, no Model/u);
});

test("a template that lost its copy marker or holds an unknown placeholder refuses instead of handing on an unfilled briefing", () => {
  const render = (templateText) => () => criticBriefingLib.renderCriticBriefings({ preflight: { ...deltaSplitPreflight(), split: undefined }, templateText, commits: [MID, HEAD], runner: "claude", root: ROOT, projectName: "p" });
  assert.throws(render(TEMPLATE.replace("COPY EVERYTHING BELOW THIS LINE", "COPY BELOW")), { code: "CBB-TEMPLATE-MARKER" });
  assert.throws(render(TEMPLATE.replace("- Spec (the contract): {{SPEC_PATH}}", "- Spec (the contract): {{NEW_FIELD}}")), { code: "CBB-TEMPLATE-PLACEHOLDER" });
});

test("prepare-dispatch derives the bindings file once, writes one briefing per split entry and names them in next", () => {
  const written = [];
  const steps = stub({ "critic-dispatch-preflight.mjs": ok(deltaSplitPreflight()), "critic-correction-input-bindings.mjs derive": ok({ digestSha256: "9".repeat(64), path: BINDINGS_FILE }), "git rev-list": { status: 0, stdout: `${MID}\n${HEAD}\n`, stderr: "" } });
  const result = prepareCriticDispatch({ root: ROOT, spec: "specs/f/spec.md", base: PREV, candidate: HEAD, evidence: ["specs/f/evidence/suite-2.json"] },
    { exists: () => false, mkdir: () => {}, writeFile: (path, text) => written.push([path.replace(/\\/gu, "/"), text]), env: { CLAUDE_CODE_SESSION_ID: "s" }, runCommand: steps.runCommand });
  assert.equal(result.status, "ready", JSON.stringify(result.stop ?? null));
  const derive = steps.calls.find((call) => call.key === "critic-correction-input-bindings.mjs derive").argv;
  assert.equal(derive[derive.indexOf("--out") + 1], BINDINGS_FILE);
  assert.deepEqual(result.next.briefings.map(({ entryId }) => entryId), ["group-1", "group-2"]);
  assert.equal(result.next.correctionInputBindings, BINDINGS_FILE);
  assert.match(result.next.briefingUse, /Add nothing to it: no earlier round, no verdict/u);
  assert.equal(Object.hasOwn(result.next, "criticDispatchPromptLines"), false, "the MP-07 lines live in the briefings, not beside them");
  assert.equal(written.filter(([path]) => path.endsWith(".briefing.md")).length, 2);
  // A bindings file on disk with another digest is refused, never silently used.
  const stale = stub({ "critic-dispatch-preflight.mjs": ok(deltaSplitPreflight()), "git rev-list": { status: 0, stdout: `${MID}\n${HEAD}\n`, stderr: "" } });
  const refused = prepareCriticDispatch({ root: ROOT, spec: "specs/f/spec.md", base: PREV, candidate: HEAD, evidence: ["e.json"] },
    { exists: (path) => String(path).endsWith("correction-input-bindings.json"), readFile: () => JSON.stringify({ digestSha256: "0".repeat(64) }), mkdir: () => {}, writeFile: () => {}, runCommand: stale.runCommand });
  assert.equal(refused.stop.code, "PREP-BINDINGS-DIGEST");
});

// --- C28-CRITIC-TOIL (AC-108, PO decisions 2026-11-10 on the greenfield run reports) ---

const budgetOf = (text) => Number(/Tool budget \(hard cap, first-class field\):\*\* ≤(\d+) tool uses/u.exec(text)?.[1]);
const entryOf = (id, paths) => ({ id, moduleId: null, paths, scopeMarker: `scope:${id}`, reviewerInput: reviewerInput({ changedPaths: paths }),
  batchScopeLine: `Batch scope (MP-07): path group ${id} of the reviewed range ${PREV.slice(0, 12)}..${HEAD.slice(0, 12)} (${paths.length} of 20 changed files), part 1 of 2 of one split review round.` });

test("C28 the briefed tool budget of a part scales with its path count and never passes the working cap", async () => {
  const { criticToolBudget } = await import("../lib/critic-split.mjs");
  const render = (preflight, extra = {}) => criticBriefingLib.renderCriticBriefings({ preflight, templateText: TEMPLATE, commits: [MID, HEAD], bindingsPath: BINDINGS_FILE, runner: "claude", root: ROOT, projectName: "p", ...extra }).briefings;
  const paths = (count) => Array.from({ length: count }, (_, index) => `src/m${index}.mjs`);
  const small = budgetOf(render({ ...deltaSplitPreflight(), split: { entries: [entryOf("group-1", paths(2))] } })[0].text);
  const large = budgetOf(render({ ...deltaSplitPreflight(), split: { entries: [entryOf("group-1", paths(14))] } })[0].text);
  assert.equal(small, criticToolBudget(2));
  assert.equal(large, criticToolBudget(14));
  assert.ok(small < large && large <= 50, `${small} < ${large} <= 50`);
  const unsplit = budgetOf(render({ ...deltaSplitPreflight(), split: undefined }, { reviewPaths: paths(5) })[0].text);
  assert.equal(unsplit, criticToolBudget(5), "an unsplit range is sized by the paths the preflight printed");
  assert.equal(budgetOf(render({ ...deltaSplitPreflight(), split: undefined })[0].text), 30, "without a path count the template default stays");
});

test("C28 the briefing names the review paths and a diff command without any excluded path, and the bindings are required where the preflight derived them", () => {
  const render = (preflight, extra = {}) => criticBriefingLib.renderCriticBriefings({ preflight, templateText: TEMPLATE, commits: [MID, HEAD], bindingsPath: BINDINGS_FILE, runner: "claude", root: ROOT, projectName: "p", ...extra }).briefings;
  const split = render(deltaSplitPreflight());
  assert.ok(split[0].text.includes(`git diff --no-textconv --no-ext-diff ${PREV} ${HEAD} -- a.mjs`), "a part reads its own paths, literal pathspecs");
  assert.ok(split[1].text.includes(`git diff --no-textconv --no-ext-diff ${PREV} ${HEAD} -- b.mjs`));
  assert.equal(split[0].text.includes("b.mjs"), false, "a part names nothing of another part");
  const whole = render({ ...deltaSplitPreflight(), split: undefined }, { reviewPaths: ["src/a.mjs", "src/b.mjs"] })[0].text;
  assert.ok(whole.includes(`git diff --no-textconv --no-ext-diff ${PREV} ${HEAD} -- src/a.mjs src/b.mjs`));
  assert.equal(whole.includes("evidence/critic/"), false, "the retained prior result the bindings exclude is in no path the briefing gives");
  assert.throws(() => render({ ...deltaSplitPreflight(), split: undefined }, { bindingsPath: null }), { code: "CBB-BINDINGS-MISSING" });
  assert.doesNotThrow(() => render({ ...deltaSplitPreflight(), split: undefined, correctionInputBindings: undefined }, { bindingsPath: null }), "a range without exclusions needs no bindings");
});

test("C28 prepare-dispatch hands the preflight's review paths to the briefing, and a delta round asks for no bindings file", () => {
  const written = [];
  const preflight = { ...deltaSplitPreflight(), split: undefined, criticReviewPaths: ["src/a.mjs", "src/b.mjs"] };
  const steps = stub({ "critic-dispatch-preflight.mjs": ok(preflight), "critic-correction-input-bindings.mjs derive": ok({ digestSha256: "9".repeat(64), path: BINDINGS_FILE }), "git rev-list": { status: 0, stdout: `${MID}\n${HEAD}\n`, stderr: "" } });
  const result = prepareCriticDispatch({ root: ROOT, spec: "specs/f/spec.md", base: PREV, candidate: HEAD, evidence: ["specs/f/evidence/suite-2.json"], deltaRequest: DELTA_REQUEST },
    { exists: () => false, mkdir: () => {}, writeFile: (path, text) => written.push([path.replace(/\\/gu, "/"), text]), env: { CLAUDE_CODE_SESSION_ID: "s" }, runCommand: steps.runCommand });
  assert.equal(result.status, "ready", JSON.stringify(result.stop ?? null));
  assert.equal(steps.calls.find((call) => call.key === "critic-dispatch-preflight.mjs").argv.includes("--correction-input-bindings"), false, "no route asks for a bindings file: the preflight derives them from the range");
  assert.equal(result.next.correctionInputBindings, BINDINGS_FILE);
  const briefing = written.find(([path]) => path.endsWith(".briefing.md"))[1];
  assert.ok(briefing.includes(BINDINGS_FILE));
  assert.ok(briefing.includes(`-- src/a.mjs src/b.mjs`));
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
