#!/usr/bin/env node
// Read-only behavioural probe: run every shipped Pipeline hook (Claude, Codex,
// Antigravity wiring) against fresh UNGOVERNED fixtures and record whether the
// hook blocks, injects context, or writes files. Fixtures and HOME live under
// the base dir given as argv[2]; the real HOME and real repos are never used.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const PLUGIN = resolve(process.argv[3] ?? "plugins/pipeline-core");
const BASE = resolve(process.argv[2]);
mkdirSync(BASE, { recursive: true });

function snapshot(dir, prefix = "", out = new Map()) {
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (rel === ".git/objects" || rel === ".git/hooks" || rel === ".git/logs" || rel === ".git/refs") continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) snapshot(full, rel, out);
    else { try { const s = statSync(full); out.set(rel, `${s.size}:${s.mtimeMs}`); } catch {} }
  }
  return out;
}
function diff(a, b) {
  const changes = [];
  for (const [k, v] of b) if (!a.has(k)) changes.push(`+${k}`); else if (a.get(k) !== v) changes.push(`~${k}`);
  for (const k of a.keys()) if (!b.has(k)) changes.push(`-${k}`);
  return changes;
}

function fixture(kind) {
  const dir = mkdtempSync(join(BASE, `${kind}-`));
  const repo = join(dir, "repo");
  const home = join(dir, "home");
  mkdirSync(repo); mkdirSync(join(home, ".claude", "projects", "p"), { recursive: true });
  writeFileSync(join(repo, "README.md"), "hello\n");
  if (kind === "git") {
    const g = (args) => spawnSync("git", args, { cwd: repo, encoding: "utf8", env: { ...process.env, HOME: home } });
    g(["init", "-q", "-b", "main"]);
    g(["-c", "user.email=p@x", "-c", "user.name=p", "add", "."]);
    g(["-c", "user.email=p@x", "-c", "user.name=p", "commit", "-q", "-m", "init"]);
  }
  return { repo, home };
}

function baseEnv(runner, fx) {
  const env = { ...process.env, HOME: fx.home, USERPROFILE: fx.home };
  for (const k of Object.keys(env)) {
    if (/^(CLAUDE|CODEX|ANTIGRAVITY|AI_AGENT|PIPELINE_)/.test(k)) delete env[k];
  }
  if (runner === "claude") { env.CLAUDECODE = "1"; env.CLAUDE_PROJECT_DIR = fx.repo; env.CLAUDE_PLUGIN_ROOT = PLUGIN; }
  if (runner === "codex") { env.PLUGIN_ROOT = PLUGIN; env.CODEX_SESSION_ID = "probe-sess"; }
  if (runner === "antigravity") { env.ANTIGRAVITY_AGENT = "1"; }
  return env;
}

function run(runner, fx, command, payload, cwd) {
  const before = new Map([...snapshot(fx.repo, "repo"), ...snapshot(fx.home, "home")]);
  const r = spawnSync("/bin/sh", ["-c", command], {
    cwd, env: baseEnv(runner, fx), input: JSON.stringify(payload), encoding: "utf8", timeout: 60000,
  });
  const after = new Map([...snapshot(fx.repo, "repo"), ...snapshot(fx.home, "home")]);
  return {
    exit: r.status ?? `signal:${r.signal}`,
    stdout: (r.stdout ?? "").trim().slice(0, 400),
    stderr: (r.stderr ?? "").trim().slice(0, 400),
    files: diff(before, after),
  };
}

// ---- tool cases --------------------------------------------------------------
const claudeTools = (fx) => [
  ["Bash ls", "Bash", { command: "ls" }],
  ["Bash python -c", "Bash", { command: "python3 -c 'print(1)'" }],
  ["Bash node -e", "Bash", { command: "node -e 1" }],
  ["Bash bash -c", "Bash", { command: "bash -c 'echo hi'" }],
  ["Bash pipe+redirect", "Bash", { command: "ls | head -3 > out.txt" }],
  ["Bash read outside root", "Bash", { command: "cat /etc/hostname" }],
  ["Bash npm test", "Bash", { command: "npm test" }],
  ["Bash git status", "Bash", { command: "git status" }],
  ["Bash git commit", "Bash", { command: "git commit -m x" }],
  ["Bash git push origin main", "Bash", { command: "git push origin main" }],
  ["Bash git push --force (guard-git expected)", "Bash", { command: "git push --force origin main" }],
  ["Write src file", "Write", { file_path: join(fx.repo, "src", "a.js"), content: "x\n" }],
  ["Write test file", "Write", { file_path: join(fx.repo, "tests", "a.test.js"), content: "x\n" }],
  ["Write docs/state.md", "Write", { file_path: join(fx.repo, "docs", "state.md"), content: "x\n".repeat(50) }],
  ["Write outside root", "Write", { file_path: join(fx.home, "note.txt"), content: "x\n" }],
  ["Edit README", "Edit", { file_path: join(fx.repo, "README.md"), old_string: "hello", new_string: "hi" }],
  ["Read file", "Read", { file_path: join(fx.repo, "README.md") }],
  ["Task generic", "Task", { subagent_type: "general-purpose", description: "x", prompt: "Please look at the code and summarize it." }],
  ["Task own critic", "Task", { subagent_type: "my-critic", description: "x", prompt: "You are a reviewer, please review src/." }],
  ["Agent generic", "Agent", { subagent_type: "general-purpose", description: "x", prompt: "Please review the diff." }],
  ["TodoWrite", "TodoWrite", { todos: [{ content: "a", status: "pending", activeForm: "a" }] }],
];

function matches(matcher, tool) {
  if (matcher === undefined || matcher === "" || matcher === "*") return true;
  return new RegExp(`^(?:${matcher})$`).test(tool);
}

const results = [];
function record(runner, fixtureKind, event, caseName, hook, res) {
  results.push({ runner, fixture: fixtureKind, event, case: caseName, hook, ...res });
}

// ---- Claude ------------------------------------------------------------------
const claudeHooks = JSON.parse(readFileSync(join(PLUGIN, "hooks", "hooks.json"), "utf8")).hooks;
const claudeCmd = (c) => c.replaceAll("${CLAUDE_PLUGIN_ROOT}", PLUGIN);
for (const kind of ["git", "nogit"]) {
  for (const [caseName, tool, toolInput] of claudeTools(fixture(kind))) {
    for (const group of claudeHooks.PreToolUse) {
      if (!matches(group.matcher, tool)) continue;
      for (const h of group.hooks) {
        const fx = fixture(kind);
        const ti = JSON.parse(JSON.stringify(toolInput).replaceAll(/\/[^"]*\/(repo|home)(?=[/"])/g, (m, which) => fx[which]));
        const payload = { session_id: "probe-sess", transcript_path: join(fx.home, ".claude", "projects", "p", "probe-sess.jsonl"),
          cwd: fx.repo, hook_event_name: "PreToolUse", permission_mode: "default", tool_name: tool, tool_input: ti };
        record("claude", kind, "PreToolUse", caseName, h.command.split("/hooks/")[1] ?? h.command, run("claude", fx, claudeCmd(h.command), payload, fx.repo));
      }
    }
  }
  for (const [event, source] of [["SessionStart", "startup"], ["SessionStart", "compact"], ["Stop", null]]) {
    for (const group of claudeHooks[event] ?? []) {
      if (source && !matches(group.matcher, source)) continue;
      for (const h of group.hooks) {
        const fx = fixture(kind);
        const payload = { session_id: "probe-sess", transcript_path: join(fx.home, ".claude", "projects", "p", "probe-sess.jsonl"),
          cwd: fx.repo, hook_event_name: event, ...(source ? { source } : { stop_hook_active: false }) };
        record("claude", kind, event + (source ? `:${source}` : ""), "-", h.command.split("/hooks/")[1] ?? h.command, run("claude", fx, claudeCmd(h.command), payload, fx.repo));
      }
    }
  }
  for (const group of claudeHooks.PostToolUse ?? []) {
    for (const h of group.hooks) {
      const fx = fixture(kind);
      const payload = { session_id: "probe-sess", transcript_path: join(fx.home, ".claude", "projects", "p", "probe-sess.jsonl"),
        cwd: fx.repo, hook_event_name: "PostToolUse", tool_name: "Task",
        tool_input: { subagent_type: "general-purpose", description: "x", prompt: "Summarize." }, tool_response: { content: "done" } };
      record("claude", kind, "PostToolUse", "Task", h.command.split("/hooks/")[1] ?? h.command, run("claude", fx, claudeCmd(h.command), payload, fx.repo));
    }
  }
}

// ---- Codex -------------------------------------------------------------------
const codexHooks = JSON.parse(readFileSync(join(PLUGIN, "hooks", "codex-hooks.json"), "utf8")).hooks;
const codexCmd = (c) => c.replaceAll("${PLUGIN_ROOT}", PLUGIN);
const codexTools = (fx) => [
  ["Bash ls", "Bash", { command: "ls" }],
  ["Bash python -c", "Bash", { command: "python3 -c 'print(1)'" }],
  ["Bash pipe+redirect", "Bash", { command: "ls | head -3 > out.txt" }],
  ["Bash read outside root", "Bash", { command: "cat /etc/hostname" }],
  ["Bash git commit", "Bash", { command: "git commit -m x" }],
  ["Bash git push origin main", "Bash", { command: "git push origin main" }],
  ["Bash git push --force (guard-git expected)", "Bash", { command: "git push --force origin main" }],
  ["apply_patch", "apply_patch", { command: `*** Begin Patch\n*** Add File: ${join(fx.repo, "src", "a.js")}\n+x\n*** End Patch\n` }],
  ["Write src file", "Write", { file_path: join(fx.repo, "src", "a.js"), content: "x\n" }],
  ["Edit README", "Edit", { file_path: join(fx.repo, "README.md"), old_string: "hello", new_string: "hi" }],
  ["spawn_agent", "spawn_agent", { message: "Please review the code.", agent_type: "default" }],
  ["update_plan", "update_plan", { plan: [{ step: "a", status: "pending" }] }],
];
for (const kind of ["git", "nogit"]) {
  for (const [event, groups] of Object.entries(codexHooks)) {
    const cases = event === "PreToolUse" ? codexTools(fixture(kind)) : [["-", null, null]];
    for (const [caseName, tool, toolInput] of cases) {
      for (const group of groups) {
        if (event === "PreToolUse" && !matches(group.matcher, tool)) continue;
        if (event === "SessionStart" && !matches(group.matcher, "startup")) continue;
        for (const h of group.hooks) {
          const fx = fixture(kind);
          const ti = toolInput && JSON.parse(JSON.stringify(toolInput).replaceAll(/\/[^"\\]*\/(repo|home)(?=[/"\\])/g, (m, which) => fx[which]));
          const payload = { session_id: "probe-sess", cwd: fx.repo, hook_event_name: event,
            ...(event === "SessionStart" ? { source: "startup" } : {}),
            ...(tool ? { tool_name: tool, tool_input: ti } : {}),
            ...(event === "PostToolUse" ? { tool_name: "Bash", tool_input: { command: "ls" }, tool_response: {} } : {}) };
          record("codex", kind, event, caseName, h.command.split("/hooks/")[1] ?? h.command, run("codex", fx, codexCmd(h.command), payload, fx.repo));
        }
      }
    }
  }
}

// ---- Antigravity ---------------------------------------------------------------
const agyHooks = JSON.parse(readFileSync(join(PLUGIN, "hooks.json"), "utf8"))["pipeline-core"];
const agyTools = (fx) => [
  ["run_command ls", { name: "run_command", args: { CommandLine: "ls", Cwd: fx.repo } }],
  ["run_command python -c", { name: "run_command", args: { CommandLine: "python3 -c 'print(1)'", Cwd: fx.repo } }],
  ["run_command bash -c", { name: "run_command", args: { CommandLine: "bash -c 'echo hi'", Cwd: fx.repo } }],
  ["run_command pipe+redirect", { name: "run_command", args: { CommandLine: "ls | head -3 > out.txt", Cwd: fx.repo } }],
  ["run_command read outside root", { name: "run_command", args: { CommandLine: "cat /etc/hostname", Cwd: fx.repo } }],
  ["run_command git commit", { name: "run_command", args: { CommandLine: "git commit -m x", Cwd: fx.repo } }],
  ["run_command git push --force (guard-git expected)", { name: "run_command", args: { CommandLine: "git push --force origin main", Cwd: fx.repo } }],
  ["write_to_file src", { name: "write_to_file", args: { TargetFile: join(fx.repo, "src", "a.js"), CodeContent: "x\n" } }],
  ["write_to_file test", { name: "write_to_file", args: { TargetFile: join(fx.repo, "tests", "a.test.js"), CodeContent: "x\n" } }],
  ["replace_file_content README", { name: "replace_file_content", args: { TargetFile: join(fx.repo, "README.md"), TargetContent: "hello", ReplacementContent: "hi" } }],
  ["invoke_subagent generic", { name: "invoke_subagent", args: { Subagents: [{ TypeName: "general", Prompt: "Please review the code." }] } }],
  ["invoke_subagent own critic", { name: "invoke_subagent", args: { Subagents: [{ TypeName: "my-critic", Prompt: "You are a reviewer, please review src/." }] } }],
];
for (const kind of ["git", "nogit"]) {
  for (const [caseName, toolCall] of agyTools(fixture(kind))) {
    for (const group of agyHooks.PreToolUse) {
      if (!matches(group.matcher, toolCall.name)) continue;
      for (const h of group.hooks) {
        const fx = fixture(kind);
        const tc = JSON.parse(JSON.stringify(toolCall).replaceAll(/\/[^"\\]*\/(repo|home)(?=[/"\\])/g, (m, which) => fx[which]));
        const payload = { conversationId: "probe-sess", invocationNum: 2, workspacePaths: [fx.repo], cwd: fx.repo, toolCall: tc };
        record("antigravity", kind, "PreToolUse", caseName, h.command, run("antigravity", fx, h.command, payload, PLUGIN));
      }
    }
  }
  for (const event of ["PreInvocation", "Stop"]) {
    for (const h of agyHooks[event]) {
      const fx = fixture(kind);
      const payload = { conversationId: "probe-sess", invocationNum: 1, workspacePaths: [fx.repo], cwd: fx.repo };
      record("antigravity", kind, event, "-", h.command, run("antigravity", fx, h.command, payload, PLUGIN));
    }
  }
}

writeFileSync(join(BASE, "results.json"), JSON.stringify(results, null, 2));
const interesting = results.filter((r) => r.exit !== 0 || r.stdout !== "" && r.stdout !== "{}" || r.files.length > 0 || r.stderr !== "");
console.log(`total runs: ${results.length}; non-silent: ${interesting.length}`);
for (const r of interesting) {
  console.log(`\n[${r.runner}/${r.fixture}] ${r.event} | ${r.case} | ${r.hook}\n  exit=${r.exit} files=${JSON.stringify(r.files)}`
    + (r.stdout ? `\n  stdout=${r.stdout.replaceAll("\n", " ").slice(0, 250)}` : "")
    + (r.stderr ? `\n  stderr=${r.stderr.replaceAll("\n", " ").slice(0, 250)}` : ""));
}
