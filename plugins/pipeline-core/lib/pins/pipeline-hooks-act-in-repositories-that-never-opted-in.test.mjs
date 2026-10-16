// SPDX-License-Identifier: SUL-1.0
// Pin for backlog item pipeline.pipeline-hooks-act-in-repositories-that-never-opted-in (AC-226).
// Every case drives the real hook entrypoints / governance-scope module; nothing under test is mocked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const pluginRoot = resolve(here, "../..");
const repoRoot = resolve(pluginRoot, "../..");
const hookRoot = join(pluginRoot, "hooks");
const scopeUrl = pathToFileURL(join(pluginRoot, "lib/governance-scope.mjs")).href;
const sha = (b) => createHash("sha256").update(b).digest("hex");

// Host limitation (PO decision K7): directory mode bits / directory symlinks are unavailable on this native
// Windows host. No case below needs them; any future case that does must skip with this typed reason.
export const HOST_LIMITATION = { code: "HOST-LIMIT-NO-DIR-MODE-OR-SYMLINK", owner: "Coordinator", due: "2026-10-19", run: "Linux/WSL" };

// Hook runtime set is derived from the real wiring files, so a newly wired hook is covered automatically.
const WIRING = ["hooks/hooks.json", "hooks/codex-hooks.json", "hooks.json"];
function wiredHooks() {
  const wired = new Set();
  const walk = (v) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object")
      for (const [k, x] of Object.entries(v)) {
        if (["command", "commandWindows"].includes(k) && typeof x === "string")
          for (const m of x.matchAll(/hooks\/([A-Za-z0-9.-]+\.mjs)/g)) wired.add(m[1]);
        else walk(x);
      }
  };
  for (const p of WIRING) walk(JSON.parse(readFileSync(join(pluginRoot, p), "utf8")));
  return [...wired].sort();
}

function tree(root, prefix = "") {
  return readdirSync(join(root, prefix), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? tree(root, join(prefix, e.name)) : [[join(prefix, e.name), sha(readFileSync(join(root, prefix, e.name)))]]);
}
function cleanEnv() {
  const env = { ...process.env };
  for (const k of ["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR"]) delete env[k];
  return env;
}
function mkdirScratch(t, prefix) {
  const scratch = join(repoRoot, "scratch");
  mkdirSync(scratch, { recursive: true });
  const dir = mkdtempSync(join(scratch, prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function fixture(t, { active = false, git = true } = {}) {
  const dir = mkdirScratch(t, "never-opted-in-");
  if (git) execFileSync("git", ["init", "--quiet", "--template="], { cwd: dir, env: cleanEnv(), stdio: ["ignore", "pipe", "pipe"] });
  if (active) {
    mkdirSync(join(dir, ".agent-pipeline"));
    writeFileSync(join(dir, ".agent-pipeline/onboarding-consent.json"), JSON.stringify({
      schema: "pipeline.onboarding-consent-marker.v1", status: "consent-given-onboarding-incomplete", consentGivenAt: new Date().toISOString() }));
  }
  return dir;
}
function call(dir, name, input = "not JSON", home) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: dir, NODE_OPTIONS: "", NODE_PATH: "" };
  if (home) { env.HOME = home; env.USERPROFILE = home; }
  return spawnSync(process.execPath, [join(hookRoot, name)], {
    cwd: dir, input: typeof input === "string" ? input : JSON.stringify(input), encoding: "utf8", timeout: 30000, maxBuffer: 524288, env });
}
const git = (dir, args) => execFileSync("git", args, { cwd: dir, env: cleanEnv(), stdio: ["ignore", "pipe", "pipe"] });
async function decide(dir, decision) {
  const m = await import(scopeUrl);
  const plan = m.planGovernanceScopeDecision({ rootDir: dir, decision, by: "Synthetic fixture operator" });
  const applied = m.applyGovernanceScopeDecision(plan, { activate: true, planSha256: plan.planSha256 });
  return { m, applied };
}

test("AC-226 point 1: one shared predicate returns governed/ungoverned/declined-style states from one module", async (t) => {
  const dir = fixture(t);
  const m = await import(scopeUrl);
  assert.equal(typeof m.observeGovernanceScope, "function");
  const before = tree(dir);
  const ungoverned = m.observeGovernanceScope({ rootDir: dir });
  assert.notEqual(ungoverned.state, "active");
  assert.notEqual(ungoverned.state, "declined");
  assert.deepEqual(tree(dir), before, "observation must not write");
  const { applied } = await decide(dir, "decline");
  assert.equal(m.observeGovernanceScope({ rootDir: dir }).state, "declined", JSON.stringify(applied));
});

test("AC-226 point 2: ungoverned means inert for every wired hook entry (exit 0, no stderr noise, zero writes incl. .git and HOME)", (t) => {
  const dir = fixture(t);
  const home = mkdirScratch(t, "never-opted-in-home-");
  writeFileSync(join(dir, "AGENTS.md"), "Agent-Pipeline pointer only");
  const before = tree(dir), homeBefore = tree(home);
  const hooks = wiredHooks();
  assert.ok(hooks.length > 10, "wiring enumeration must find the runner hook set");
  for (const name of hooks) {
    if (name === "native-slicing.mjs") continue; // wrapper-only helper; reached through the runner entries below
    const r = call(dir, name, "not JSON", home);
    assert.equal(r.status, 0, name + ": " + r.stderr);
    assert.doesNotMatch(r.stderr, /BLOCKED|HGO|mandatory.bootstrap/i, name);
    assert.deepEqual(tree(dir), before, name + " wrote into an ungoverned repository");
    assert.deepEqual(tree(home), homeBefore, name + " wrote into HOME");
  }
});

test("AC-226 F1/F2/F3/F4/F6/F10: realistic payloads in an ungoverned repo neither block, inject instructions, nor write state", (t) => {
  const dir = fixture(t);
  const before = tree(dir);
  const write = call(dir, "guard-lifecycle-ready.mjs", { tool_name: "Write", tool_input: { file_path: "src/impl.mjs" }, session_id: "s1" });
  assert.equal(write.status, 0, write.stderr);
  assert.doesNotMatch(write.stdout + write.stderr, /CONSENT|BLOCKED/);
  assert.equal(existsSync(join(dir, ".claude")), false, "no consent marker may be written into the working tree");
  for (const [name, payload] of [
    ["staleness-check.mjs", { hook_event_name: "SessionStart", session_id: "s1" }],
    ["setup-check.mjs", { hook_event_name: "SessionStart", session_id: "s1" }],
    ["post-compact-reground.mjs", { hook_event_name: "SessionStart", source: "compact", session_id: "s1" }],
    ["guard-dispatch.mjs", { tool_name: "Task", tool_input: { subagent_type: "my-critic", prompt: "review" }, session_id: "s1" }],
    ["guard-dispatch-budget.mjs", { tool_name: "Bash", tool_input: { command: "ls" }, session_id: "s1" }],
    ["native-goldfish-host.mjs", { hook_event_name: "PostToolUse", tool_name: "Task", session_id: "s1" }],
  ]) {
    const r = call(dir, name, payload);
    assert.equal(r.status, 0, name + ": " + r.stderr);
    assert.doesNotMatch(r.stdout, /run \/pipeline-core|setup\.mjs|POST_COMPACT_REGROUND|Goldfish host commit|DISPATCH-NO/, name + " injected Pipeline instructions");
    assert.doesNotMatch(r.stderr, /BLOCKED|OBSERVE|DISPATCH-NO|common-dir-unresolved/, name);
    assert.deepEqual(tree(dir), before, name + " left a footprint");
  }
});

test("AC-226 point 2 (non-git folder under a governed ancestor): scope resolves to the enrolled ancestor and keeps enforcing", async (t) => {
  // scratch/ lives inside this governed checkout, so a plain folder there is NOT ungoverned: it inherits the ancestor.
  const dir = fixture(t, { git: false });
  const m = await import(scopeUrl);
  assert.equal(m.observeGovernanceScope({ rootDir: dir }).state, "active");
  assert.equal(call(dir, "guard-lifecycle-ready.mjs", { tool_name: "Write", tool_input: { file_path: "a.txt" } }).status, 2);
});

// Pure non-git inert case needs a folder outside any governed ancestor (OS temp), which the host brief forbids here.
const NONGIT_SKIP = "HOST-LIMIT-NONGIT-FIXTURE-OUTSIDE-GOVERNED-ANCESTOR: owner Coordinator, due 2026-10-19, rerun on Linux/WSL with an out-of-tree fixture root";
test("AC-226 point 2 (non-git folder): hooks stay inert and quiet in a plain directory", { skip: process.env.PIPELINE_PIN_NONGIT_ROOT ? false : NONGIT_SKIP }, (t) => {
  const base = resolve(process.env.PIPELINE_PIN_NONGIT_ROOT);
  const dir = mkdtempSync(join(base, "never-opted-in-nongit-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const before = tree(dir);
  for (const name of ["guard-dispatch-budget.mjs", "guard-lifecycle-ready.mjs", "staleness-check.mjs", "antigravity-pretool-guard.mjs"]) {
    const r = call(dir, name, { tool_name: "Write", tool_input: { file_path: "a.txt" }, session_id: "s1" });
    assert.equal(r.status, 0, name + ": " + r.stderr);
    assert.doesNotMatch(r.stderr, /OBSERVE|common-dir-unresolved|BLOCKED/, name);
    assert.deepEqual(tree(dir), before, name);
  }
});

test("AC-226 exception (a): destructive git union stays always-on in an ungoverned repo through every wrapper", (t) => {
  const dir = fixture(t);
  const before = tree(dir);
  for (const command of ["git reset --hard", "git push --force", 'bash -c "git reset --hard"']) {
    const legacy = call(dir, "guard-git.mjs", { tool_input: { command } });
    assert.equal(legacy.status, 2, command + ": " + legacy.stderr);
    assert.match(legacy.stderr, /GG-/);
    const codex = call(dir, "codex-pretool-guard.mjs", { tool_name: "Bash", tool_input: { command }, cwd: dir });
    assert.equal(JSON.parse(codex.stdout).hookSpecificOutput.permissionDecision, "deny");
    const agy = call(dir, "antigravity-pretool-guard.mjs", { toolCall: { name: "run_command", args: { CommandLine: command, Cwd: dir } }, workspacePaths: [dir] });
    assert.equal(agy.status, 2);
    assert.match(agy.stdout + agy.stderr, /GG-/);
  }
  assert.deepEqual(tree(dir), before, "denial must not create audit keys or overrides in a foreign repo");
});

test("AC-226 item 3 (F8/F9): Pipeline process rules (GIT-03 trailers, publication route) apply only after enrollment", (t) => {
  const inactive = fixture(t), active = fixture(t, { active: true });
  const commit = 'git commit -m "fix: fixture" -m "Session-Id: synthetic-session"';
  for (const command of ["git commit -m \"ordinary message\"", "git push origin HEAD", "git push origin main"])
    for (const name of ["guard-git.mjs", "guard-push.mjs"])
      assert.equal(call(inactive, name, { tool_input: { command } }).status, 0, name + " " + command);
  assert.equal(call(inactive, "guard-git.mjs", { tool_input: { command: commit } }).status, 0);
  const enforced = call(active, "guard-git.mjs", { tool_input: { command: commit } });
  assert.equal(enforced.status, 2, enforced.stderr);
  assert.match(enforced.stderr, /GIT-03|session/i);
});

test("AC-226: ordinary hooksPath config reads are not destructive, but a combined unset still is (GG-20)", (t) => {
  const dir = fixture(t);
  for (const command of ["git config --get core.hooksPath", "git config core.hooksPath", "git config --local --get-all core.hooksPath"])
    assert.equal(call(dir, "guard-git.mjs", { tool_input: { command } }).status, 0, command);
  const combined = call(dir, "guard-git.mjs", { tool_input: { command: "git config --get core.hooksPath; git config --unset core.hooksPath" } });
  assert.equal(combined.status, 2);
  assert.match(combined.stderr, /GG-20/);
});

test("AC-226 items 4/5 (F13): a durable decline lives outside the working tree and silences hints, budget and telemetry", async (t) => {
  const dir = fixture(t, { active: true });
  const { m, applied } = await decide(dir, "decline");
  assert.equal(m.observeGovernanceScope({ rootDir: dir }).state, "declined", JSON.stringify(applied));
  const before = tree(dir);
  for (const name of ["codex-session-start-hint.mjs", "antigravity-start-hint.mjs", "guard-dispatch-budget.mjs", "staleness-check.mjs", "stop-suggest.mjs"]) {
    const r = call(dir, name, { invocationNum: 0, workspacePaths: [dir], cwd: dir, session_id: "fixture", tool_name: "Write", tool_input: { file_path: "src/a" } });
    assert.equal(r.status, 0, name + r.stderr);
    assert.doesNotMatch(r.stdout + r.stderr, /optional project workflow|install it|mandatory.bootstrap|BLOCKED|HGO/i);
    assert.deepEqual(tree(dir), before, name + " mutated a declined repository");
  }
  // decline is durable across a fresh process observation
  const fresh = spawnSync(process.execPath, ["--input-type=module", "-e",
    `const m=await import(${JSON.stringify(scopeUrl)});process.stdout.write(m.observeGovernanceScope({rootDir:${JSON.stringify(dir)}}).state)`], { encoding: "utf8", cwd: dir });
  assert.equal(fresh.stdout, "declined");
});

test("AC-226 exception (b): the opt-in hint still fires in a never-asked ungoverned repo (suppressed only after decline)", (t) => {
  const dir = fixture(t);
  const r = call(dir, "codex-session-start-hint.mjs", { hook_event_name: "SessionStart", cwd: dir, session_id: "s1" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout + r.stderr, /Agent.?Pipeline|install|optional project workflow/i, "undecided repo must still receive the opt-in hint");
});

test("AC-226 item 6 (F7/F12): runner wrapper fail-closed input checks sit behind the scope predicate", async (t) => {
  const inactive = fixture(t), declined = fixture(t, { active: true }), activeDir = fixture(t, { active: true });
  await decide(declined, "decline");
  const big = "x".repeat(1024 * 1024 + 1);
  for (const dir of [inactive, declined]) {
    const before = tree(dir);
    const o = call(dir, "antigravity-pretool-guard.mjs", big);
    assert.equal(o.status, 0, o.stderr);
    assert.equal(JSON.parse(o.stdout).decision, "allow");
    assert.equal(o.stderr, "");
    const inline = call(dir, "antigravity-pretool-guard.mjs", { toolCall: { name: "run_command", args: { CommandLine: 'node -e "1"', Cwd: dir } }, workspacePaths: [dir] });
    assert.equal(inline.status, 0, inline.stdout + inline.stderr);
    const c = call(dir, "codex-pretool-guard.mjs", "malformed");
    assert.notEqual(JSON.parse(c.stdout || "{}").hookSpecificOutput?.permissionDecision, "deny");
    assert.deepEqual(tree(dir), before);
  }
  // governed path keeps enforcing: the predicate is not a blanket disarm
  assert.equal(JSON.parse(call(activeDir, "codex-pretool-guard.mjs", "malformed").stdout).hookSpecificOutput.permissionDecision, "deny");
  assert.equal(call(activeDir, "antigravity-pretool-guard.mjs", big).status, 2);
  assert.equal(call(activeDir, "guard-lifecycle-ready.mjs", { tool_name: "Write", tool_input: { file_path: "src/impl.mjs" } }).status, 2);
});

test("AC-226 item 7: governed enrollment keeps enforcing; record drift fails toward active (unverifiable-active), never inert", async (t) => {
  const dir = fixture(t);
  git(dir, ["config", "user.name", "Synthetic fixture"]); git(dir, ["config", "user.email", "fixture@example.invalid"]);
  git(dir, ["commit", "--allow-empty", "--quiet", "-m", "Synthetic fixture"]);
  const { m } = await decide(dir, "enroll");
  const enrolled = m.observeGovernanceScope({ rootDir: dir });
  assert.equal(enrolled.state, "active");
  git(dir, ["config", "--local", `agent-pipeline.activation-${enrolled.scopeKey}.record`, "{broken"]);
  assert.equal(m.observeGovernanceScope({ rootDir: dir }).state, "unverifiable-active");
  assert.equal(JSON.parse(call(dir, "codex-pretool-guard.mjs", "malformed").stdout).hookSpecificOutput.permissionDecision, "deny");
});

test("AC-226 item 7: wiring enumeration covers every hook command of all three runners (new hooks are noticed)", () => {
  const hooks = wiredHooks();
  for (const must of ["guard-git.mjs", "guard-lifecycle-ready.mjs", "codex-pretool-guard.mjs", "antigravity-pretool-guard.mjs", "staleness-check.mjs"])
    assert.ok(hooks.includes(must), must + " missing from wiring enumeration");
  for (const name of hooks) assert.ok(existsSync(join(hookRoot, name)), "wired hook file missing: " + name);
});
