// SPDX-License-Identifier: SUL-1.0
/**
 * Pin for pipeline.critic-scratch-notes-write-is-refused-again (AC-144, ALF-C-P9-04B).
 * A dispatched Critic must be able to persist its notes at its OWN source-owned target
 * scratch/dispatch/critic-<agentId>/critic-notes.md (create, then append), while every other
 * path stays confined and Bash is never a notes route. Exercised black-box: a real
 * `node guard-dispatch-budget.mjs` child per call. Fixtures live under the repository's scratch/.
 *
 * Host limitation (owner Coordinator, due 2026-10-19, PO decision K7): cases that need POSIX
 * directory mode bits or directory symlinks are skipped on native Windows and must run on Linux/WSL.
 * The own-create case is NOT skipped on Windows and is GREEN there: prepareOwnedCriticNotesDirectory() applies the
 * 0o700/0o600 mode comparisons off Windows only (Windows reports synthetic mode bits), through the injected
 * `platform` dependency (default process.platform). The off-Windows mode refusals are exercised in-process at the
 * end of this file by injecting platform "linux" against the real Windows filesystem (synthetic 0o777/0o666 bits).
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { persistPendingDispatchBudgetBindings, readAgentMaxTurns } from "../dispatch-budget-binding.mjs";
import { dispatchBudgetBinding, dispatchBudgetLineForRole } from "../dispatch-policy.mjs";
import { applyGovernanceScopeDecision, planGovernanceScopeDecision } from "../governance-scope.mjs";

const PLUGIN_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const REPO_ROOT = join(PLUGIN_ROOT, "..", "..");
const GUARD = process.env.CRITIC_NOTES_PIN_GUARD || join(PLUGIN_ROOT, "hooks", "guard-dispatch-budget.mjs");
const CRITIC = "pipeline-core:critic";
const GOLDFISH = "pipeline-core:goldfish-implementor";
const IS_WINDOWS = process.platform === "win32";
const HOST_LIMIT = "host limitation: needs POSIX directory mode bits or directory symlinks; owner Coordinator, due 2026-10-19 (Linux/WSL run, PO decision K7)";
const CRITIC_MAX_TURNS = readAgentMaxTurns("critic", PLUGIN_ROOT);

const scratchBase = join(REPO_ROOT, "scratch");
mkdirSync(scratchBase, { recursive: true });
const roots = [];
process.on("exit", () => { for (const r of roots) { try { rmSync(r, { recursive: true, force: true }); } catch { /* best effort */ } } });

const ID = "crit1";
const notesRel = (id = ID) => `scratch/dispatch/critic-${id}/critic-notes.md`;

/** A governance-enrolled throw-away repo under scratch/ with a Critic native binding for agent `crit1`. */
function criticRoot({ meta = true } = {}) {
  const root = mkdtempSync(join(scratchBase, "critic-notes-pin-"));
  roots.push(root);
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  const plan = planGovernanceScopeDecision({ rootDir: root, decision: "enroll", by: "Critic notes pin fixture" });
  assert.equal(applyGovernanceScopeDecision(plan, { activate: true, planSha256: plan.planSha256 }).state, "active");
  const binding = dispatchBudgetBinding({ subagentType: CRITIC, prompt: dispatchBudgetLineForRole(CRITIC), pluginRoot: PLUGIN_ROOT });
  assert.equal(binding.status, "prepared");
  const toolUseId = `toolu-critic-notes-${Date.now()}`;
  const persisted = persistPendingDispatchBudgetBindings({
    commonDir: join(root, ".git"), toolUseId,
    bindings: [{ agentType: "critic", baseCalls: binding.baseCalls, maxTurns: binding.maxTurns, effectiveCap: binding.effectiveCap }],
  });
  assert.equal(persisted.status, "prepared");
  if (meta) {
    const metaDir = join(root, "parent-session", "subagents");
    mkdirSync(metaDir, { recursive: true });
    writeFileSync(join(metaDir, `agent-${ID}.meta.json`), JSON.stringify({ agentType: CRITIC, description: "x", toolUseId, spawnDepth: 1 }));
  }
  return root;
}

function call(root, toolName, toolInput, { agentId = ID, agentType = CRITIC } = {}) {
  const payload = { session_id: "notes-pin-session", transcript_path: join(root, "parent-session.jsonl"), tool_name: toolName, tool_input: toolInput, agent_id: agentId, agent_type: agentType };
  const res = spawnSync(process.execPath, [GUARD], { input: JSON.stringify(payload), encoding: "utf8", timeout: 60000, cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
  return { status: res.status, stderr: res.stderr ?? "", stdout: res.stdout ?? "" };
}
const write = (root, rel, opts) => call(root, "Write", { file_path: join(root, rel), content: "# notes\n" }, opts);
const edit = (root, rel, opts) => call(root, "Edit", { file_path: join(root, rel), old_string: "# notes", new_string: "# notes 2" }, opts);

const receiptOf = (root) => join(root, ".git", "agent-pipeline", "dispatch-budget", `${ID}.json.notes-directory.json`);

test("own-create: the Critic's first Write to its own notes target is admitted; directory and receipt are created", () => {
  const root = criticRoot();
  const res = write(root, notesRel());
  assert.equal(res.status, 0, `own-create refused (exit ${res.status}): ${res.stderr}`);
  assert.ok(existsSync(join(root, "scratch", "dispatch", `critic-${ID}`)), "notes directory created");
  assert.ok(existsSync(receiptOf(root)), "ownership receipt created");
});

test("own-append: a second Write and an Edit to the same notes file are both admitted", () => {
  const root = criticRoot();
  const first = write(root, notesRel());
  assert.equal(first.status, 0, `own-create precondition refused: ${first.stderr}`);
  writeFileSync(join(root, notesRel()), "# notes\n"); // the host performs the admitted Write
  const second = write(root, notesRel());
  assert.equal(second.status, 0, `second Write refused: ${second.stderr}`);
  const third = edit(root, notesRel());
  assert.equal(third.status, 0, `Edit refused: ${third.stderr}`);
});

for (const [label, relOf] of [
  ["another agent's directory", () => notesRel("crit2")],
  ["critic-review-1 directory", () => "scratch/dispatch/critic-review-1/critic-notes.md"],
  ["deeper path under own directory", () => `scratch/dispatch/critic-${ID}/deeper/critic-notes.md`],
  [".bak sibling", () => `scratch/dispatch/critic-${ID}/critic-notes.md.bak`],
  ["other file name in own directory", () => `scratch/dispatch/critic-${ID}/other.md`],
  [".. traversal", () => `scratch/dispatch/critic-${ID}/../critic-crit2/critic-notes.md`],
  ["repository file", () => "README.md"],
]) {
  test(`another-directory refusal: ${label} is DISPATCH-BUDGET-CRITIC-WRITE-CONFINED`, () => {
    const root = criticRoot();
    for (const tool of ["Write", "Edit"]) {
      const res = tool === "Write" ? write(root, relOf()) : edit(root, relOf());
      assert.equal(res.status, 2, `${tool} must be refused: ${res.stdout}`);
      assert.match(res.stderr, /DISPATCH-BUDGET-CRITIC-WRITE-CONFINED/u);
    }
    assert.equal(existsSync(join(root, "scratch", "dispatch", `critic-${ID}`)), false, "a refused write must not create the own directory");
  });
}

test("another-directory refusal: an absolute path outside the project root is confined", () => {
  const root = criticRoot();
  const outside = join(root, "..", `critic-notes-pin-outside-${Date.now()}.md`);
  const res = call(root, "Write", { file_path: outside, content: "x" });
  assert.equal(res.status, 2);
  assert.match(res.stderr, /DISPATCH-BUDGET-CRITIC-WRITE-CONFINED/u);
  assert.equal(existsSync(outside), false);
});

test("foreign pre-existing directory at the own target is refused as critic-notes-directory-owned-elsewhere", () => {
  const root = criticRoot();
  mkdirSync(join(root, "scratch", "dispatch", `critic-${ID}`), { recursive: true });
  const res = write(root, notesRel());
  assert.equal(res.status, 2, res.stderr);
  assert.match(res.stderr, /DISPATCH-BUDGET-CRITIC-NOTES-UNAVAILABLE/u);
  assert.match(res.stderr, /critic-notes-directory-owned-elsewhere/u);
  assert.equal(existsSync(receiptOf(root)), false, "a foreign directory is never adopted with a receipt");
});

test("missing native meta: the write is refused with a typed code (agent-meta-missing), no directory created", () => {
  const root = criticRoot({ meta: false });
  const res = write(root, notesRel());
  assert.equal(res.status, 2, res.stderr);
  assert.match(res.stderr, /DISPATCH-BUDGET-INPUT-INVALID/u);
  assert.match(res.stderr, /agent-meta-missing/u);
  assert.equal(existsSync(join(root, "scratch", "dispatch", `critic-${ID}`)), false);
});

test("the NOTES-UNAVAILABLE text forbids a Bash retry and adopting another directory", () => {
  const root = criticRoot();
  mkdirSync(join(root, "scratch", "dispatch", `critic-${ID}`), { recursive: true }); // foreign directory: a host-independent trigger
  const res = write(root, notesRel());
  assert.match(res.stderr, /DISPATCH-BUDGET-CRITIC-NOTES-UNAVAILABLE/u);
  assert.match(res.stderr, /do not retry with Bash or adopt another directory/u);
});

test("a Goldfish never gets the Critic notes lane: its Write creates no critic notes directory or receipt", () => {
  const root = criticRoot();
  const res = write(root, notesRel(), { agentType: GOLDFISH });
  assert.doesNotMatch(res.stderr, /DISPATCH-BUDGET-CRITIC/u, "Critic-only codes must not apply to a Goldfish");
  assert.equal(existsSync(join(root, "scratch", "dispatch", `critic-${ID}`)), false);
  assert.equal(existsSync(receiptOf(root)), false);
});

test("Bash is never a notes route: a Critic Bash call creates neither the notes directory nor the file", () => {
  const root = criticRoot();
  call(root, "Bash", { command: `mkdir -p ${join(root, "scratch", "dispatch", `critic-${ID}`).replaceAll("\\", "/")}` });
  assert.equal(existsSync(join(root, "scratch", "dispatch", `critic-${ID}`)), false, "the guard must not materialise the notes lane for Bash");
  assert.equal(existsSync(receiptOf(root)), false);
});

test("a symlinked own directory is never admitted as the notes target", { skip: IS_WINDOWS ? HOST_LIMIT : false }, () => {
  const root = criticRoot();
  const elsewhere = join(root, "elsewhere");
  mkdirSync(elsewhere, { recursive: true });
  mkdirSync(join(root, "scratch", "dispatch"), { recursive: true });
  symlinkSync(elsewhere, join(root, "scratch", "dispatch", `critic-${ID}`), "dir");
  const res = write(root, notesRel());
  assert.equal(res.status, 2, res.stderr);
  assert.match(res.stderr, /DISPATCH-BUDGET-CRITIC-WRITE-CONFINED/u);
  assert.equal(existsSync(join(elsewhere, "critic-notes.md")), false);
});

// --- Critic C6b F3 correction: off-Windows mode checks via the injected platform (in-process, real filesystem) ---
const SYNTHETIC_MODE_ONLY = IS_WINDOWS ? false : "needs a host reporting synthetic mode bits (native Windows); on POSIX the real modes are correct and the mode cases above cover admission";
const lockSeams = { acquireDispatchBudgetCounterLockFn: () => ({ status: "acquired", lock: {} }), releaseDispatchBudgetCounterLockFn: () => true };
async function inProcess(root, platform) {
  const { evaluateDispatchBudgetGuard } = await import("../../hooks/guard-dispatch-budget.mjs");
  const input = { session_id: "notes-pin-session", transcript_path: join(root, "parent-session.jsonl"), tool_name: "Write", tool_input: { file_path: join(root, notesRel()), content: "# notes\n" }, agent_id: ID, agent_type: CRITIC };
  return evaluateDispatchBudgetGuard(input, { rootDir: root, platform, ...lockSeams });
}

test("injected platform linux: a wrong-mode notes directory (synthetic 0777 from the real fs) is refused, never adopted", { skip: SYNTHETIC_MODE_ONLY }, async () => {
  const root = criticRoot();
  const res = await inProcess(root, "linux");
  assert.equal(res.exitCode, 2, res.stderr);
  assert.match(res.stderr, /DISPATCH-BUDGET-CRITIC-NOTES-UNAVAILABLE: critic-notes-partial-held/u);
  assert.equal(existsSync(receiptOf(root)), false, "no receipt is published for a wrong-mode directory");
});

test("injected platform linux: a wrong-mode receipt (synthetic 0666) is refused on re-entry", { skip: SYNTHETIC_MODE_ONLY }, async () => {
  const root = criticRoot();
  const first = await inProcess(root, "win32"); // the Windows rule creates directory and receipt
  assert.equal(first.exitCode, 0, first.stderr);
  assert.ok(existsSync(receiptOf(root)));
  const second = await inProcess(root, "linux");
  assert.equal(second.exitCode, 2, second.stderr);
  assert.match(second.stderr, /DISPATCH-BUDGET-CRITIC-NOTES-UNAVAILABLE: critic-notes-binding-unavailable/u);
});

test("own directory is created with mode 0700 and the receipt with 0600", { skip: IS_WINDOWS ? HOST_LIMIT : false }, async () => {
  const { statSync } = await import("node:fs");
  const root = criticRoot();
  assert.equal(write(root, notesRel()).status, 0);
  assert.equal(statSync(join(root, "scratch", "dispatch", `critic-${ID}`)).mode & 0o7777, 0o700);
  assert.equal(statSync(receiptOf(root)).mode & 0o7777, 0o600);
  assert.ok(readFileSync(receiptOf(root), "utf8").includes("pipeline.critic-notes-directory.v1"));
});
