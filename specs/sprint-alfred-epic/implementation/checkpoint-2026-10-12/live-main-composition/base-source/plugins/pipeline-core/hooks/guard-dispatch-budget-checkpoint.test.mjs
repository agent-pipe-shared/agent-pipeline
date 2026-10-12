// SPDX-License-Identifier: SUL-1.0
/**
 * ALFRED-BUDGET-20261005: checkpoint notice, closing-lane hand-back and orchestrator
 * budget grant. The hook is exercised black-box (real `node guard-dispatch-budget.mjs`
 * child, stdin payload, exit code + stdout + stderr) so the actual PreToolUse
 * contract is what is pinned; the guard module is never imported here (the
 * module-scope-import hazard documented in guard-dispatch-budget.test.mjs). The pure
 * policy core and the grant script have no entrypoint side effect and are imported.
 * Fixtures are throw-away consumer-style git repositories under the OS temp dir.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, devNull } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { grantDispatchBudget } from "../scripts/dispatch-budget-grant.mjs";
import { persistPendingDispatchBudgetBindings, readAgentMaxTurns } from "../lib/dispatch-budget-binding.mjs";
import { dispatchBudgetBinding, dispatchBudgetLineForRole } from "../lib/dispatch-policy.mjs";
import { applyGovernanceScopeDecision, planGovernanceScopeDecision } from "../lib/governance-scope.mjs";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import {
  DENIAL_CODE,
  MAX_GRANT_ENTRIES,
  appendGrant,
  decideDispatchBudgetCall,
  dispatchCheckpointDecision,
  dispatchCheckpointThreshold,
  dispatchGrantHeadroom,
  effectiveDispatchWorkingCap,
  validateGrantRecord,
} from "../lib/dispatch-budget-core.mjs";

const GUARD = fileURLToPath(new URL("./guard-dispatch-budget.mjs", import.meta.url));
const GRANT_SCRIPT = fileURLToPath(new URL("../scripts/dispatch-budget-grant.mjs", import.meta.url));
const roots = [];
process.on("exit", () => { for (const root of roots) { try { rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ } } });

// Cases are declared with stable ids and registered together through the completion protocol at the end of the file.
const cases = [];
function register(id, name, run) {
  cases.push({ id, name, run });
}

// A consumer-style repository: governance-enrolled, with NO plugins/pipeline-core of its own.
function consumerRoot(prefix) {
  const root = mkdtempSync(join(tmpdir(), `budget-ckpt-${prefix}-`));
  roots.push(root);
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  const plan = planGovernanceScopeDecision({ rootDir: root, decision: "enroll", by: "Dispatch budget checkpoint fixture" });
  assert.equal(applyGovernanceScopeDecision(plan, { activate: true, planSha256: plan.planSha256 }).state, "active");
  return root;
}

// The guard resolves agent definitions from its own plugin, so these fixtures deliberately
// carry none: a definition planted under the project root would be dead data.
function activeRoot(prefix) {
  return consumerRoot(prefix);
}

const budgetDir = (root) => join(root, ".git", "agent-pipeline", "dispatch-budget");
const counterFile = (root, agentId) => join(budgetDir(root), `${agentId}.json`);
const GOLDFISH = "pipeline-core:goldfish-deep";
const CRITIC = "pipeline-core:critic";

function seed(root, { agentId, agentType = GOLDFISH, maxTurns = 80, baseCalls = 20, count, workingCap = Math.min(baseCalls, maxTurns - 15) }) {
  mkdirSync(budgetDir(root), { recursive: true });
  writeFileSync(counterFile(root, agentId), `${JSON.stringify({ schema: "pipeline.dispatch-budget-counter.v1", agentId, agentType, maxTurns, baseCalls, workingCap, count }, null, 2)}\n`);
}

function subagentCall(root, agentId, agentType, toolName, toolInput) {
  return { session_id: "ckpt-session", transcript_path: join(root, "parent-session.jsonl"), tool_name: toolName, tool_input: toolInput, agent_id: agentId, agent_type: agentType };
}

function callGuard(root, payload) {
  const res = spawnSync(process.execPath, [GUARD], { input: JSON.stringify(payload), encoding: "utf8", timeout: 60000, cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
  return { status: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

const read = (root, agentId, agentType = GOLDFISH) => callGuard(root, subagentCall(root, agentId, agentType, "Read", { file_path: join(root, "x.txt") }));

// ------------------------------------------- maxTurns single source, consumer repo
// The guard resolves a dispatched agent's maxTurns from the definition in ITS OWN plugin
// (module-relative), never from <project root>/plugins/pipeline-core -- a consumer repository
// has no such directory, and a checkout's copy can differ from the installed plugin that Claude
// actually dispatches with. The expected values are read from that plugin through the one reader.

const PLUGIN_ROOT = fileURLToPath(new URL("..", import.meta.url));
const DEEP_MAX_TURNS = readAgentMaxTurns("goldfish-deep", PLUGIN_ROOT);
const CRITIC_MAX_TURNS = readAgentMaxTurns("critic", PLUGIN_ROOT);

const RESOLVE_RUNNER_SOURCE = [
  "const { guardUrl, agentType, rootDir, pluginRoot, files } = JSON.parse(process.env.RESOLVE_CASE);",
  "const mod = await import(guardUrl);",
  "const fs = new Map(Object.entries(files));",
  "const fakeFs = { existsSyncFn: (p) => fs.has(p), readFileSyncFn: (p) => fs.get(p) };",
  "console.log('RESULT: ' + JSON.stringify({",
  "  injectedRoot: mod.resolveMaxTurns(agentType, rootDir, { pluginRoot }),",
  "  moduleRelative: mod.resolveMaxTurns(agentType, rootDir),",
  "  injectedFilesystem: mod.resolveMaxTurns(agentType, rootDir, fakeFs),",
  "}));",
].join("\n");

register("GDBC01", "consumer repo: no plugins/pipeline-core under the project root, and the guard still enforces the plugin's own tier", () => {
  assert.ok(Number.isSafeInteger(DEEP_MAX_TURNS) && DEEP_MAX_TURNS > 0, "the plugin's own goldfish-deep definition resolves");
  const root = consumerRoot("consumer");
  assert.equal(existsSync(join(root, "plugins")), false);
  seed(root, { agentId: "co1", agentType: GOLDFISH, maxTurns: DEEP_MAX_TURNS, baseCalls: 20, count: 20 });
  const denied = read(root, "co1");
  assert.equal(denied.status, 2, `an exhausted counter must deny, not fail open: ${denied.stderr}`);
  assert.ok(denied.stderr.includes(DENIAL_CODE));
  assert.equal(existsSync(join(budgetDir(root), "unresolved-observations")), false, "the call must not be recorded as max-turns-unresolved");
});

register("GDBC02", "consumer repo, Critic first call: a project-root copy of the definition at another tier is never read; the plugin's own tier binds", () => {
  const root = consumerRoot("critic-binding");
  const decoyAgents = join(root, "plugins", "pipeline-core", "agents");
  mkdirSync(decoyAgents, { recursive: true });
  writeFileSync(join(decoyAgents, "critic.md"), `---\nname: critic\nmaxTurns: ${CRITIC_MAX_TURNS - 15}\n---\nbody\n`);
  const binding = dispatchBudgetBinding({ subagentType: CRITIC, prompt: dispatchBudgetLineForRole(CRITIC), pluginRoot: PLUGIN_ROOT });
  assert.equal(binding.status, "prepared");
  assert.equal(binding.maxTurns, CRITIC_MAX_TURNS);
  const toolUseId = "toolu-critic-consumer-1";
  const persisted = persistPendingDispatchBudgetBindings({
    commonDir: join(root, ".git"),
    toolUseId,
    bindings: [{ agentType: "critic", baseCalls: binding.baseCalls, maxTurns: binding.maxTurns, effectiveCap: binding.effectiveCap }],
  });
  assert.equal(persisted.status, "prepared");
  const metaDir = join(root, "parent-session", "subagents");
  mkdirSync(metaDir, { recursive: true });
  writeFileSync(join(metaDir, "agent-crit1.meta.json"), JSON.stringify({ agentType: CRITIC, description: "x", toolUseId, spawnDepth: 1 }));
  const first = read(root, "crit1", CRITIC);
  assert.equal(first.status, 0, first.stderr);
  assert.ok(!first.stderr.includes("budget-tier-max-turns-conflict"), first.stderr);
  assert.ok(!first.stderr.includes("pending-binding-tier-conflict"), first.stderr);
  const counter = JSON.parse(readFileSync(counterFile(root, "crit1"), "utf8"));
  assert.equal(counter.maxTurns, CRITIC_MAX_TURNS);
  assert.equal(counter.count, 1);
});

register("GDBC03", "resolveMaxTurns: an injected plugin root wins; the default is the guard's own plugin, never the project root", () => {
  const root = consumerRoot("resolve");
  const altPlugin = join(root, "alt-plugin");
  mkdirSync(join(altPlugin, "agents"), { recursive: true });
  writeFileSync(join(altPlugin, "agents", "goldfish-deep.md"), "---\nname: goldfish-deep\nmaxTurns: 33\n---\nbody\n");
  const harnessDefinition = join(root, "plugins", "pipeline-core", "agents", "goldfish-deep.md");
  const runnerPath = join(root, "resolve-runner.mjs");
  writeFileSync(runnerPath, RESOLVE_RUNNER_SOURCE);
  const res = spawnSync(process.execPath, [runnerPath], {
    encoding: "utf8", timeout: 60000, cwd: root,
    env: {
      ...process.env,
      RESOLVE_CASE: JSON.stringify({
        guardUrl: pathToFileURL(GUARD).href, agentType: GOLDFISH, rootDir: root, pluginRoot: altPlugin,
        files: {
          [harnessDefinition]: "---\nname: goldfish-deep\nmaxTurns: 77\n---\nbody\n",
          [join(PLUGIN_ROOT, "agents", "goldfish-deep.md")]: "---\nname: goldfish-deep\nmaxTurns: 55\n---\nbody\n",
        },
      }),
    },
  });
  assert.equal(res.status, 0, res.stderr);
  const line = String(res.stdout).split("\n").find((entry) => entry.startsWith("RESULT: "));
  assert.ok(line, `runner printed no RESULT line: ${res.stdout} ${res.stderr}`);
  const result = JSON.parse(line.slice("RESULT: ".length));
  assert.equal(result.injectedRoot, 33, "an explicitly injected plugin root wins");
  assert.equal(result.moduleRelative, DEEP_MAX_TURNS, "the default is the guard's own plugin, not <rootDir>/plugins/pipeline-core");
  assert.equal(result.injectedFilesystem, 55,"an injected filesystem without pluginRoot resolves to the guard's own plugin, never under the project root");
});

// ---------------------------------------------------------------- pure core

register("GDBC04", "core: checkpoint threshold is ceil(0.8 x cap) in integer arithmetic", () => {
  assert.deepEqual([35, 20, 65, 15, 3, 1].map(dispatchCheckpointThreshold), [28, 16, 52, 12, 3, 1]);
  assert.equal(dispatchCheckpointThreshold(0), null);
  assert.equal(dispatchCheckpointThreshold(1.5), null);
});

register("GDBC05", "core: the notice fires at the threshold and on the last 3 working calls, never below, never on closing/denied calls", () => {
  const fired = (workingCap, decision = "working") => Array.from({ length: workingCap + 2 }, (_, i) => i + 1)
    .filter((nextCount) => dispatchCheckpointDecision({ workingCap, nextCount, decision }).notice);
  assert.deepEqual(fired(20), [16, 18, 19, 20]);
  assert.deepEqual(fired(35), [28, 33, 34, 35]);
  assert.deepEqual(fired(3), [3]);
  assert.deepEqual(fired(20, "closing"), []);
  assert.deepEqual(fired(20, "exhausted"), []);
  assert.equal(dispatchCheckpointDecision({ workingCap: 20, nextCount: 18 }).remainingWorkingCalls, 2);
});

register("GDBC06", "core: a grant raises the working cap, never beyond maxTurns - closing allowance - 1", () => {
  assert.equal(effectiveDispatchWorkingCap(20, 80, 0), 20);
  assert.equal(effectiveDispatchWorkingCap(20, 80, 10), 30);
  assert.equal(effectiveDispatchWorkingCap(20, 80, 1000), 74);
  assert.equal(effectiveDispatchWorkingCap(70, 80, 10), 74);
  assert.equal(effectiveDispatchWorkingCap(20, 80, 1000) + 5, 79);
  assert.equal(dispatchGrantHeadroom(20, 80), 54);
  assert.equal(dispatchGrantHeadroom(15, 30), 9);
  const granted = decideDispatchBudgetCall({ maxTurns: 80, baseCalls: 20, currentCount: 20, isClosingAct: false, grantedCalls: 10 });
  assert.deepEqual(granted, { allowed: true, decision: "working", nextCount: 21, workingCap: 30 });
  const ungranted = decideDispatchBudgetCall({ maxTurns: 80, baseCalls: 20, currentCount: 20, isClosingAct: false });
  assert.equal(ungranted.decision, "exhausted");
  assert.equal(decideDispatchBudgetCall({ maxTurns: 80, baseCalls: 20, currentCount: 20, isClosingAct: false, grantedCalls: -1 }).decision, "invalid-input");
});

register("GDBC07", "core: grant records reject malformed, oversized, tampered and duplicate-digest histories", () => {
  const first = appendGrant({ agentId: "ag1", extra: 5, reason: "continue", grantedAt: "2026-10-05T10:00:00.000Z" });
  assert.equal(first.ok, true);
  const second = appendGrant({ record: first.record, agentId: "ag1", extra: 7, reason: "again", grantedAt: "2026-10-05T11:00:00.000Z" });
  assert.equal(second.ok, true);
  assert.equal(second.record.totalExtra, 12);
  assert.deepEqual(second.record.grants[0], first.record.grants[0], "append-only: the earlier entry is unchanged");
  assert.deepEqual(validateGrantRecord(second.record, "ag1"), { ok: true, totalExtra: 12 });
  const clone = () => JSON.parse(JSON.stringify(second.record));
  assert.equal(validateGrantRecord(second.record, "other").code, "grant-record-agent-mismatch");
  assert.equal(validateGrantRecord({ ...clone(), surplus: 1 }, "ag1").code, "grant-record-shape");
  assert.equal(validateGrantRecord(null, "ag1").code, "grant-record-shape");
  const inflated = clone(); inflated.grants[0].extra = 40; inflated.totalExtra = 47;
  assert.equal(validateGrantRecord(inflated, "ag1").code, "grant-entry-digest-mismatch");
  const retotalled = clone(); retotalled.totalExtra = 99;
  assert.equal(validateGrantRecord(retotalled, "ag1").code, "grant-record-total-or-digest");
  const duplicate = clone(); duplicate.grants[1].digest = duplicate.grants[0].digest;
  assert.equal(validateGrantRecord(duplicate, "ag1").code, "grant-entry-duplicate-digest");
  const oversized = clone(); oversized.grants = Array.from({ length: MAX_GRANT_ENTRIES + 1 }, () => oversized.grants[0]);
  assert.equal(validateGrantRecord(oversized, "ag1").code, "grant-record-oversized");
  let record = null;
  for (let index = 0; index < MAX_GRANT_ENTRIES; index += 1) {
    const step = appendGrant({ record, agentId: "ag1", extra: 1, reason: `r${index}`, grantedAt: "2026-10-05T10:00:00Z" });
    assert.equal(step.ok, true);
    record = step.record;
  }
  assert.equal(appendGrant({ record, agentId: "ag1", extra: 1, reason: "one too many", grantedAt: "2026-10-05T10:00:00Z" }).code, "grant-record-oversized");
  for (const bad of [0, 41, 1.5, "5"]) assert.equal(appendGrant({ agentId: "ag1", extra: bad, reason: "r", grantedAt: "2026-10-05T10:00:00Z" }).code, "grant-extra-out-of-range");
  assert.equal(appendGrant({ agentId: "ag1", extra: 1, reason: "x".repeat(501), grantedAt: "2026-10-05T10:00:00Z" }).code, "grant-reason-invalid");
  assert.equal(appendGrant({ agentId: "ag1", extra: 1, reason: "line\nbreak", grantedAt: "2026-10-05T10:00:00Z" }).code, "grant-reason-invalid");
  assert.equal(appendGrant({ agentId: "../ag1", extra: 1, reason: "r", grantedAt: "2026-10-05T10:00:00Z" }).code, "grant-agent-id-invalid");
});

// -------------------------------------------------------------- hook, black-box

register("GDBC08", "hook: checkpoint notice at exactly ceil(0.8 x cap) and on the last 3 working calls; allow JSON shape; denial at the cap unchanged", () => {
  const root = activeRoot("notice");
  seed(root, { agentId: "n1", count: 13 });
  const outcomes = Array.from({ length: 8 }, () => read(root, "n1"));
  const counted = (index) => 14 + index;
  const expectedNotice = new Map([[16, 4], [18, 2], [19, 1], [20, 0]]);
  outcomes.forEach((outcome, index) => {
    const n = counted(index);
    if (n === 21) {
      assert.equal(outcome.status, 2, "the call past the cap is still denied");
      assert.match(outcome.stderr, /DISPATCH-BUDGET-EXHAUSTED/u);
      assert.equal(outcome.stdout, "");
    } else if (expectedNotice.has(n)) {
      assert.equal(outcome.status, 0, `call ${n}`);
      assert.equal(outcome.stderr, "");
      assert.ok(outcome.stdout.endsWith("\n") && outcome.stdout.trim().split("\n").length === 1, "exactly one JSON line");
      const parsed = JSON.parse(outcome.stdout);
      assert.deepEqual(Object.keys(parsed), ["hookSpecificOutput"]);
      assert.deepEqual(Object.keys(parsed.hookSpecificOutput), ["hookEventName", "permissionDecision", "additionalContext"]);
      assert.equal(parsed.hookSpecificOutput.hookEventName, "PreToolUse");
      assert.equal(parsed.hookSpecificOutput.permissionDecision, "allow");
      const text = parsed.hookSpecificOutput.additionalContext;
      const remaining = expectedNotice.get(n);
      assert.match(text, new RegExp(`${remaining} calls? of your working budget remain`, "u"));
      assert.match(text, /commit what is already green/u);
      assert.match(text, /interim report \(done \/ remaining \/ next step\)/u);
      assert.match(text, /dispatch record/u);
      assert.match(text, /end your turn/u);
      assert.match(text, /dispatcher decides/u);
    } else {
      assert.equal(outcome.status, 0, `call ${n}`);
      assert.equal(outcome.stdout, "", `call ${n} carries no notice`);
      assert.equal(outcome.stderr, "");
    }
  });
});

register("GDBC09", "hook: the orchestrator is never given a notice or counted", () => {
  const root = activeRoot("orch");
  const result = callGuard(root, { session_id: "s", transcript_path: join(root, "top.jsonl"), tool_name: "Read", tool_input: { file_path: join(root, "x.txt") } });
  assert.deepEqual([result.status, result.stdout], [0, ""]);
});

register("GDBC10", "hook: a Critic notice names critic-notes.md; the closing lane admits only the Critic's own exact notes file", () => {
  const root = activeRoot("critic");
  seed(root, { agentId: "cn", agentType: CRITIC, maxTurns: CRITIC_MAX_TURNS, baseCalls: 15, count: 11 });
  const notice = read(root, "cn", CRITIC);
  assert.equal(notice.status, 0);
  const text = JSON.parse(notice.stdout).hookSpecificOutput.additionalContext;
  assert.match(text, /critic-notes\.md/u);
  assert.doesNotMatch(text, /commit what is already green/u);

  const notes = (rel) => (rel.startsWith("ABS:") ? join(root, rel.slice(4)) : rel);
  const write = (agentId, agentType, rel, toolName = "Write") => callGuard(root, subagentCall(root, agentId, agentType, toolName, { file_path: notes(rel), content: "x" }));
  const admitted = [
    "ABS:scratch/dispatch/review-1/critic-notes.md",
    "scratch/dispatch/review-1/critic-notes.md",
  ];
  admitted.forEach((rel, index) => {
    seed(root, { agentId: `ca${index}`, agentType: CRITIC, maxTurns: CRITIC_MAX_TURNS, baseCalls: 15, count: 15 });
    assert.equal(write(`ca${index}`, CRITIC, rel).status, 0, `admitted ${rel}`);
  });
  seed(root, { agentId: "ca-edit", agentType: CRITIC, maxTurns: CRITIC_MAX_TURNS, baseCalls: 15, count: 15 });
  assert.equal(callGuard(root, subagentCall(root, "ca-edit", CRITIC, "Edit", { file_path: notes("ABS:scratch/dispatch/review-1/critic-notes.md"), old_string: "a", new_string: "b" })).status, 0);
  const refused = [
    "ABS:scratch/dispatch/review-1/notes.md",
    "ABS:scratch/dispatch/review-1/critic-notes.md.bak",
    "ABS:scratch/dispatch/critic-notes.md",
    "ABS:scratch/dispatch/review-1/deeper/critic-notes.md",
    "ABS:scratch/other/review-1/critic-notes.md",
    "ABS:plugins/pipeline-core/hooks/critic-notes.md",
    "scratch/dispatch/review-1/../review-2/critic-notes.md",
    "scratch/dispatch/../critic-notes.md",
    "../scratch/dispatch/review-1/critic-notes.md",
  ];
  refused.forEach((rel, index) => {
    seed(root, { agentId: `cr${index}`, agentType: CRITIC, maxTurns: CRITIC_MAX_TURNS, baseCalls: 15, count: 15 });
    const result = write(`cr${index}`, CRITIC, rel);
    assert.equal(result.status, 2, `refused ${rel}`);
    assert.match(result.stderr, /DISPATCH-BUDGET-EXHAUSTED/u);
    assert.match(result.stderr, /critic-notes\.md/u, "the denial names the Critic's hand-back file");
  });
  seed(root, { agentId: "gf", agentType: GOLDFISH, count: 20 });
  assert.equal(write("gf", GOLDFISH, "ABS:scratch/dispatch/review-1/critic-notes.md").status, 2, "a Goldfish never gets the Critic's notes lane");
  assert.doesNotMatch(callGuard(root, subagentCall(root, "gf", GOLDFISH, "Read", { file_path: "x" })).stderr, /critic-notes/u, "non-Critic denial text is unchanged");
});

register("GDBC11", "hook: a grant lets the same agent state continue where an ungranted agent is denied", () => {
  const root = activeRoot("grant");
  seed(root, { agentId: "plain", count: 20 });
  seed(root, { agentId: "granted", count: 20 });
  const granted = grantDispatchBudget(["--agent-id", "granted", "--extra", "10", "--reason", "continue after checkpoint", "--root", root]);
  assert.equal(granted.status, "granted", JSON.stringify(granted));
  assert.equal(granted.result.workingCapBefore, 20);
  assert.equal(granted.result.workingCapAfter, 30);
  assert.equal(read(root, "plain").status, 2);
  const resumed = read(root, "granted");
  assert.deepEqual([resumed.status, resumed.stdout, resumed.stderr], [0, "", ""]);
});

register("GDBC12", "hook: the granted cap is bounded by maxTurns - 1 including the closing allowance", () => {
  const root = activeRoot("bound");
  seed(root, { agentId: "b1", count: 0 });
  const grant = (extra) => grantDispatchBudget(["--agent-id", "b1", "--extra", String(extra), "--reason", "bounded", "--root", root]);
  assert.equal(grant(40).status, "granted");
  const over = grant(40);
  assert.deepEqual([over.status, over.code], ["refused", "grant-exceeds-headroom"]);
  const last = grant(14);
  assert.equal(last.status, "granted");
  assert.equal(last.result.workingCapAfter, 74);
  assert.equal(grant(1).code, "grant-exceeds-headroom");
  seed(root, { agentId: "b1", count: 73 });
  assert.equal(read(root, "b1").status, 0, "call 74 is the last working call");
  const past = read(root, "b1");
  assert.equal(past.status, 2, "call 75 is denied");
  assert.match(past.stderr, /working cap of 74/u);
  // The documented ceiling: 74 working + 5 closing = 79 = maxTurns - 1.
  assert.equal(74 + 5, 80 - 1);
});

register("GDBC13", "hook: a malformed or tampered grant record on disk grants nothing", () => {
  const root = activeRoot("tamper");
  seed(root, { agentId: "t1", count: 20 });
  assert.equal(grantDispatchBudget(["--agent-id", "t1", "--extra", "10", "--reason", "ok", "--root", root]).status, "granted");
  const file = join(budgetDir(root), "grants", "t1.json");
  const record = JSON.parse(readFileSync(file, "utf8"));
  record.grants[0].extra = 40; record.totalExtra = 40;
  writeFileSync(file, `${JSON.stringify(record)}\n`);
  assert.equal(read(root, "t1").status, 2, "tampered record is ignored");
  seed(root, { agentId: "t2", count: 20 });
  mkdirSync(join(budgetDir(root), "grants"), { recursive: true });
  writeFileSync(join(budgetDir(root), "grants", "t2.json"), "{not json");
  assert.equal(read(root, "t2").status, 2, "garbage record is ignored");
});

register("GDBC14", "hook: a dispatched agent cannot reach the grant script or the grant store; the orchestrator can", () => {
  const root = activeRoot("forbid");
  seed(root, { agentId: "f1", count: 0 });
  const command = `node plugins/pipeline-core/scripts/dispatch-budget-grant.mjs --agent-id f1 --extra 5 --reason self-grant`;
  const viaBash = callGuard(root, subagentCall(root, "f1", GOLDFISH, "Bash", { command }));
  assert.equal(viaBash.status, 2);
  assert.match(viaBash.stderr, /DISPATCH-BUDGET-GRANT-ORCHESTRATOR-ONLY/u);
  const viaWrite = callGuard(root, subagentCall(root, "f1", GOLDFISH, "Write", { file_path: join(budgetDir(root), "grants", "f1.json"), content: "{}" }));
  assert.equal(viaWrite.status, 2);
  assert.match(viaWrite.stderr, /DISPATCH-BUDGET-GRANT-ORCHESTRATOR-ONLY/u);
  const partial = callGuard(root, { session_id: "s", transcript_path: join(root, "p.jsonl"), tool_name: "Bash", tool_input: { command }, agent_type: GOLDFISH });
  assert.equal(partial.status, 2, "a partial (agent_type without agent_id) identity is not the orchestrator either");
  const unrelated = callGuard(root, subagentCall(root, "f1", GOLDFISH, "Bash", { command: "node --test plugins/pipeline-core/scripts/dispatch-budget-grant.test.mjs" }));
  assert.equal(unrelated.status, 0, "naming a sibling test file is not the grant script");
  const orchestrator = callGuard(root, { session_id: "s", transcript_path: join(root, "top.jsonl"), tool_name: "Bash", tool_input: { command } });
  assert.deepEqual([orchestrator.status, orchestrator.stdout], [0, ""]);
});

// ------------------------------------------------------------- grant script

register("GDBC15", "grant script: refuses malformed arguments, an unknown agent and an unverifiable record; resolves the repo of its working directory", () => {
  const root = activeRoot("script");
  seed(root, { agentId: "s1", count: 3 });
  const base = ["--agent-id", "s1", "--reason", "why", "--root", root];
  const code = (extra) => grantDispatchBudget(["--extra", ...extra, ...base]).code;
  assert.equal(code(["0"]), "extra-out-of-range");
  assert.equal(code(["41"]), "extra-out-of-range");
  assert.equal(code(["abc"]), "extra-out-of-range");
  assert.equal(code(["-3"]), "extra-out-of-range");
  assert.equal(grantDispatchBudget(["--extra", "5", "--agent-id", "nope", "--reason", "why", "--root", root]).code, "agent-counter-missing");
  assert.equal(grantDispatchBudget(["--extra", "5", "--agent-id", "../s1", "--reason", "why", "--root", root]).code, "agent-id-invalid");
  assert.equal(grantDispatchBudget(["--extra", "5", "--agent-id", "s1", "--reason", "line\nbreak", "--root", root]).code, "grant-reason-invalid");
  assert.equal(grantDispatchBudget(["--extra", "5", "--agent-id", "s1", "--reason", "x".repeat(501), "--root", root]).code, "grant-reason-invalid");
  assert.equal(grantDispatchBudget(["--extra", "5", "--bogus", "1", ...base]).code, "unknown-argument");
  assert.equal(grantDispatchBudget(["--extra", "5", "--extra", "6", ...base]).code, "duplicate-argument");
  assert.equal(grantDispatchBudget(["--extra", "5", "--agent-id", "s1", "--root", root]).code, "missing-argument");
  assert.equal(readdirSafe(join(budgetDir(root), "grants")), null, "no refused call wrote a record");
  seed(root, { agentId: "small", agentType: "pipeline-core:plan-verifier", maxTurns: 15, baseCalls: 10, workingCap: 10, count: 0 });
  assert.equal(grantDispatchBudget(["--extra", "5", "--agent-id", "small", "--reason", "why", "--root", root]).code, "grant-exceeds-headroom", "the small-role lane has no headroom");

  const viaCli = spawnSync(process.execPath, [GRANT_SCRIPT, "--agent-id", "s1", "--extra", "5", "--reason", "cli from the repo cwd"], { cwd: root, encoding: "utf8", timeout: 60000 });
  assert.equal(viaCli.status, 0, viaCli.stderr);
  const printed = JSON.parse(viaCli.stdout);
  assert.deepEqual([printed.schema, printed.status, printed.agentId, printed.totalExtra], ["pipeline.dispatch-budget-grant-result.v1", "granted", "s1", 5]);
  const second = grantDispatchBudget(["--extra", "3", ...base]);
  assert.equal(second.result.totalExtra, 8, "the history appends");
  const file = join(budgetDir(root), "grants", "s1.json");
  const kept = readFileSync(file, "utf8");
  const broken = JSON.parse(kept); broken.grants[1].reason = "edited";
  writeFileSync(file, `${JSON.stringify(broken)}\n`);
  assert.equal(grantDispatchBudget(["--extra", "1", ...base]).code, "grant-entry-digest-mismatch", "an unverifiable record is never extended");
  const refusedCli = spawnSync(process.execPath, [GRANT_SCRIPT, "--agent-id", "s1", "--extra", "0", "--reason", "x"], { cwd: root, encoding: "utf8", timeout: 60000 });
  assert.equal(refusedCli.status, 2);
  assert.match(refusedCli.stderr, /^DISPATCH-BUDGET-GRANT-REFUSED: extra-out-of-range: /u);
});

function readdirSafe(dir) {
  try { return readFileSync(dir); } catch { return null; }
}

assert.equal(cases.length, 15, "the complete dispatch-budget checkpoint corpus must register before execution");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: cases, fd: completionFd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
