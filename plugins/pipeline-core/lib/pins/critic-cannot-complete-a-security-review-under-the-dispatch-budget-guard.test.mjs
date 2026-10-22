// SPDX-License-Identifier: SUL-1.0
/**
 * Regression pin: pipeline.critic-cannot-complete-a-security-review-under-the-dispatch-budget-guard (AC-141).
 *
 * Acceptance of the original item, one block of cases each:
 *   (A) "Template and guard must state one number": the Critic agent definition's maxTurns, the guard's
 *       working cap derived from it, and the number the Critic briefing template states are the same;
 *   (B) the Proposal's open decision (Bash notes write in the closing lane) is settled as "Write/Edit is the
 *       only route": the template says so and the guard's closing lane refuses a Bash notes write while it
 *       still admits the bounded git add / git commit forms;
 *   (C) the Critic is confined to its own notes file for Write/Edit (typed refusal for anything else);
 *   (D) verification: a Critic reaching the closing lane can persist its notes through Write/Edit
 *       (POSIX-only, needs directory mode bits: held on this Windows host, see HOST_LIMITATION).
 *
 * The guard is only ever run as a CHILD process (real hook, real counter file); the pure core is imported
 * for case A. Fixtures live under the repository scratch/ directory, never the OS temp dir. RED proofs run the
 * same checker against a mutated scratch mirror and require it to fail; production is never edited.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { applyGovernanceScopeDecision, planGovernanceScopeDecision } from "../governance-scope.mjs";
import { readAgentMaxTurns } from "../dispatch-budget-binding.mjs";
import * as realCore from "../dispatch-budget-core.mjs";
import { evaluateLifecycleReadyGuard } from "../../hooks/guard-lifecycle-ready.mjs";

const GUARD = fileURLToPath(new URL("../../hooks/guard-dispatch-budget.mjs", import.meta.url));
const CORE_PATH = fileURLToPath(new URL("../dispatch-budget-core.mjs", import.meta.url));
const PLUGIN_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const TEMPLATE_PATH = join(REPO_ROOT, "templates", "prompts", "critic-review.md");
const AGENT_PATH = join(PLUGIN_ROOT, "agents", "critic.md");
const SCRATCH_ROOT = join(REPO_ROOT, "scratch");
mkdirSync(SCRATCH_ROOT, { recursive: true });
const FIXTURE = mkdtempSync(join(SCRATCH_ROOT, "critic-budget-pin-"));
process.on("exit", () => { try { rmSync(FIXTURE, { recursive: true, force: true }); } catch { /* best effort */ } });

const CRITIC = "pipeline-core:critic";
const GOLDFISH = "pipeline-core:goldfish-deep";
const HOST_LIMITATION = process.platform === "win32"
  ? "HOST-LIMITATION: the notes directory is created 0700 and read back by mode; native Windows has no directory mode bits. Owner Coordinator, due 2026-10-19 (Linux/WSL run, PO decision K7)"
  : false;

const MAX_TURNS = readAgentMaxTurns("critic", PLUGIN_ROOT);
const TEMPLATE = readFileSync(TEMPLATE_PATH, "utf8");
const AGENT = readFileSync(AGENT_PATH, "utf8");

// ------------------------------------------------------------------ fixtures
let seq = 0;
function consumerRoot(prefix) {
  const root = mkdtempSync(join(FIXTURE, `${prefix}-${++seq}-`));
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  const plan = planGovernanceScopeDecision({ rootDir: root, decision: "enroll", by: "Critic budget pin fixture" });
  assert.equal(applyGovernanceScopeDecision(plan, { activate: true, planSha256: plan.planSha256 }).state, "active");
  return root;
}
function seed(root, { agentId, count, baseCalls = 15 }) {
  const dir = join(root, ".git", "agent-pipeline", "dispatch-budget");
  mkdirSync(dir, { recursive: true });
  const workingCap = Math.min(baseCalls, MAX_TURNS - 15);
  writeFileSync(join(dir, `${agentId}.json`), `${JSON.stringify({ schema: "pipeline.dispatch-budget-counter.v1", agentId, agentType: CRITIC, maxTurns: MAX_TURNS, baseCalls, workingCap, count }, null, 2)}\n`);
}
function seedMeta(root, agentId) {
  const dir = join(root, "parent", "subagents");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `agent-${agentId}.meta.json`), JSON.stringify({ spawnDepth: 1, agentType: CRITIC, toolUseId: "toolu_pin" }));
}
function call(root, agentId, toolName, toolInput, agentType = CRITIC) {
  const payload = { session_id: "pin-session", transcript_path: join(root, "parent.jsonl"), tool_name: toolName, tool_input: toolInput, agent_id: agentId, agent_type: agentType };
  const res = spawnSync(process.execPath, [GUARD], { input: JSON.stringify(payload), encoding: "utf8", timeout: 60000, cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
  return { status: res.status, stderr: res.stderr ?? "", stdout: res.stdout ?? "" };
}

// ------------------------------------------------------------------ case A: one number
function checkOneNumber(core, maxTurns, template) {
  const cap = core.dispatchWorkingCap(maxTurns);
  assert.equal(cap, maxTurns - 15, "working cap = maxTurns - 5 closing - 10 safety");
  assert.ok(cap >= 30, "the template's default base cap of 30 must fit under the guard's working cap");
  assert.equal(core.effectiveDispatchBaseCap(30, maxTurns), 30, "a briefed 30 is honored, not clipped to a smaller number");
  assert.equal(core.effectiveDispatchBaseCap(cap, maxTurns), cap, "the full working cap is usable");
  assert.ok(template.includes(`ships \`maxTurns: ${maxTurns}\``), "template states the shipped maxTurns");
  assert.ok(template.includes(`at most ${cap}`), "template states the same effective working cap the guard derives");
  assert.ok(template.includes(`${maxTurns} − 5 − 10`), "template states the derivation");
  assert.doesNotMatch(template, /working cap of 12|cap of 12 tool uses/u, "the stale 12 is gone");
}

test("A1 template, agent definition and guard state one working-cap number", () => {
  assert.equal(MAX_TURNS, 65);
  assert.match(AGENT, new RegExp(`^maxTurns: ${MAX_TURNS}$`, "mu"));
  checkOneNumber(realCore, MAX_TURNS, TEMPLATE);
});

test("A2 RED: the number checker fails against a mutated core mirror and a mutated template", async () => {
  const mirrorPath = join(FIXTURE, "core-mirror.mjs");
  const source = readFileSync(CORE_PATH, "utf8");
  assert.ok(source.includes("export const SAFETY_MARGIN = 10;"));
  writeFileSync(mirrorPath, source.replace("export const SAFETY_MARGIN = 10;", "export const SAFETY_MARGIN = 53;"));
  const mirror = await import(pathToFileURL(mirrorPath).href);
  assert.throws(() => checkOneNumber(mirror, MAX_TURNS, TEMPLATE), "a guard working cap below the template's number must be caught");
  assert.throws(() => checkOneNumber(realCore, MAX_TURNS, TEMPLATE.replace(`at most ${MAX_TURNS - 15}`, "at most 12")), "a template stating a different number must be caught");
});

// ------------------------------------------------------------------ case B: Bash notes route decision
function checkBashNotesDecision(template) {
  assert.ok(template.includes("Write/Edit only; no Bash notes"), "the template documents Write/Edit as the only notes route");
}

test("B1 the template documents Write/Edit as the only notes route (RED on a mutated copy)", () => {
  checkBashNotesDecision(TEMPLATE);
  assert.throws(() => checkBashNotesDecision(TEMPLATE.replace("Write/Edit only; no Bash notes", "")));
  assert.match(AGENT, /^tools:.*\bWrite\b.*\bEdit\b/mu, "the Critic definition carries the Write and Edit tools the notes route needs");
});

test("B2 closing lane: Bash notes write is refused; bounded git add / git commit remain admitted", () => {
  const root = consumerRoot("closing");
  const id = "cb";
  const notes = `scratch/dispatch/critic-${id}/critic-notes.md`;
  const cases = [
    { label: "echo redirect to notes", command: `echo done > ${notes}`, admitted: false },
    { label: "tee to notes", command: `cat x | tee ${notes}`, admitted: false },
    { label: "git add", command: "git add -- scratch/x.md", admitted: true },
    { label: "git commit", command: "git commit -F scratch/msg.txt -- scratch/x.md", admitted: true },
    { label: "chained git add", command: "git add -- scratch/x.md && echo done > " + notes, admitted: false },
  ];
  for (const { label, command, admitted } of cases) {
    seed(root, { agentId: id, count: 15 });
    const result = call(root, id, "Bash", { command });
    if (admitted) assert.equal(result.status, 0, `${label} admitted in the closing lane: ${result.stderr}`);
    else {
      assert.equal(result.status, 2, `${label} refused in the closing lane`);
      assert.match(result.stderr, /DISPATCH-BUDGET-EXHAUSTED/u);
      assert.match(result.stderr, /critic-notes\.md/u, "the refusal still names the Write/Edit notes route");
    }
  }
  seed(root, { agentId: id, count: 20 });
  const past = call(root, id, "Bash", { command: "git add -- scratch/x.md" });
  assert.equal(past.status, 2, "after the 5-call closing allowance even a git add is refused");
});

// ------------------------------------------------------------------ case C: write confinement
test("C1 a Critic's Write/Edit to anything but its own notes file gets the typed confinement refusal", () => {
  const root = consumerRoot("confine");
  const id = "cc";
  const own = join(root, "scratch", "dispatch", `critic-${id}`, "critic-notes.md");
  const others = [
    join(root, "src", "x.mjs"),
    join(root, "scratch", "dispatch", "critic-other", "critic-notes.md"),
    join(root, "scratch", "dispatch", `critic-${id}`, "other.md"),
    join(root, "scratch", "dispatch", `critic-${id}`, "critic-notes.md.bak"),
  ];
  for (const toolName of ["Write", "Edit"]) {
    for (const target of others) {
      seed(root, { agentId: id, count: 2 });
      const input = toolName === "Write" ? { file_path: target, content: "x" } : { file_path: target, old_string: "a", new_string: "b" };
      const result = call(root, id, toolName, input);
      assert.equal(result.status, 2, `${toolName} ${target} refused`);
      assert.match(result.stderr, /DISPATCH-BUDGET-CRITIC-WRITE-CONFINED/u);
      assert.match(result.stderr, new RegExp(`scratch/dispatch/critic-${id}/critic-notes\\.md`, "u"), "the refusal names the owned target");
    }
  }
  seed(root, { agentId: id, count: 2 });
  const ownWrite = call(root, id, "Write", { file_path: own, content: "x" });
  assert.doesNotMatch(ownWrite.stderr, /DISPATCH-BUDGET-CRITIC-WRITE-CONFINED/u, "the owned notes file is never refused as confined");
  const goldfish = join(root, ".git", "agent-pipeline", "dispatch-budget");
  writeFileSync(join(goldfish, "gf.json"), JSON.stringify({ schema: "pipeline.dispatch-budget-counter.v1", agentId: "gf", agentType: GOLDFISH, maxTurns: 80, baseCalls: 20, workingCap: 20, count: 2 }));
  const gf = call(root, "gf", "Write", { file_path: join(root, "src", "x.mjs"), content: "x" }, GOLDFISH);
  assert.doesNotMatch(gf.stderr, /CRITIC-WRITE-CONFINED/u, "confinement is the Critic's only");
});

// ------------------------------------------------------------------ case E: refusals that spend Critic budget
// The item's second "observed again" paragraph names two classes: counter-lock-busy on parallel calls and
// rg/Glob/Grep read-scope refusals. E1 pins the read half end to end: the read shapes a Critic uses on a diff are
// admitted by the real lifecycle read-scope check (so none of them is a refusal that spends budget for nothing) and
// the real budget guard counts each exactly once. E2 ties the lock half to the suite that owns it.
const readCounter = (root, id) => JSON.parse(readFileSync(join(root, ".git", "agent-pipeline", "dispatch-budget", `${id}.json`), "utf8")).count;

test("E1 the read shapes a Critic uses are admitted by the read-scope check and each costs exactly one budget call", () => {
  const root = consumerRoot("reads");
  const id = "ce";
  mkdirSync(join(root, "plugins", "x"), { recursive: true });
  writeFileSync(join(root, "plugins", "x", "a.mjs"), "export const needle = 1;\n");
  seed(root, { agentId: id, count: 0 });
  const calls = [
    { tool_name: "Read", tool_input: { file_path: join(root, "plugins", "x", "a.mjs") } },
    { tool_name: "Grep", tool_input: { pattern: "needle", path: join(root, "plugins", "x", "a.mjs") } },
    { tool_name: "Glob", tool_input: { pattern: "plugins/x/*.mjs" } },
    { tool_name: "Bash", tool_input: { command: "rg -n needle plugins/x" } },
    { tool_name: "Bash", tool_input: { command: "cat plugins/x/a.mjs" } },
  ];
  calls.forEach((input, index) => {
    const verdict = evaluateLifecycleReadyGuard(input, { projectDir: root });
    assert.equal(verdict.exitCode, 0, `read-scope refused a Critic read shape: ${JSON.stringify(input)}\n${verdict.stderr ?? ""}`);
    const counted = call(root, id, input.tool_name, input.tool_input);
    assert.equal(counted.status, 0, `${JSON.stringify(input)}: ${counted.stderr}`);
    assert.equal(readCounter(root, id), index + 1, "one call, one count");
  });
});

test("E2 the counter-lock half is owned by the dispatch-budget suite: busy locks wait, a timeout is refused uncounted", () => {
  const suite = readFileSync(join(PLUGIN_ROOT, "hooks", "guard-dispatch-budget.test.mjs"), "utf8");
  for (const title of [
    "R7-11a: N concurrent tool calls of one subagent that all meet a live lock holder are all admitted",
    "R7-11d: at hook level a live holder beyond the bound refuses with counter-lock-timeout, names the holder age and counts nothing",
  ]) assert.ok(suite.includes(title), `the owning suite no longer carries: ${title}`);
  assert.match(readFileSync(GUARD, "utf8"), /This call was not counted and the persisted counter was left unchanged; retry the same call/u);
});

// ------------------------------------------------------------------ case D: notes persist in the closing lane
test("D1 a Critic at the end of its working budget persists notes through Write then Edit", { skip: HOST_LIMITATION }, () => {
  const root = consumerRoot("persist");
  const id = "cd";
  seedMeta(root, id);
  const own = join(root, "scratch", "dispatch", `critic-${id}`, "critic-notes.md");
  seed(root, { agentId: id, count: 15 });
  const written = call(root, id, "Write", { file_path: own, content: "interim notes" });
  assert.equal(written.status, 0, `Write admitted in the closing lane: ${written.stderr}`);
  const dir = join(root, "scratch", "dispatch", `critic-${id}`);
  assert.ok(lstatSync(dir).isDirectory(), "the guard created the owned notes directory");
  assert.equal(lstatSync(dir).mode & 0o7777, 0o700);
  writeFileSync(own, "interim notes");
  const edited = call(root, id, "Edit", { file_path: own, old_string: "interim", new_string: "final" });
  assert.equal(edited.status, 0, `Edit admitted: ${edited.stderr}`);
  assert.ok(existsSync(own));
  const other = call(root, id, "Write", { file_path: join(root, "elsewhere.md"), content: "x" });
  assert.equal(other.status, 2);
});
