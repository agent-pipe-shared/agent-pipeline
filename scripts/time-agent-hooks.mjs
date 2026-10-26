// Purpose: time each PreToolUse hook that fires on an Agent dispatch, to find which step of "running PreToolUse hooks n/4" is slow on a host.
// Usage:   node scripts/time-agent-hooks.mjs <plugin-root> [<generated-briefing.md>]
//          <plugin-root> is the installed pipeline-core directory (the one that holds hooks/guard-dispatch.mjs).
//          With a briefing file, the probe sends that briefing plus one extra byte, so guard-dispatch runs its full parse and
//          refuses with DBG-GENERATED-DIGEST-MISMATCH; without one it sends a trivial prompt and is refused early.
// Inputs:  the four hooks guard-dispatch, guard-dispatch-budget, guard-worktree-isolation and guard-slicing from <plugin-root>/hooks.
// Output:  one line per hook: exit code, wall milliseconds, first output line. A refusal writes no queue row and no counter.
// Data:    none written by this script. Run it from the repository root of the project whose dispatch is slow.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pluginRoot = process.argv[2] ? resolve(process.argv[2]) : null;
const briefing = process.argv[3];
if (!pluginRoot) {
  console.error("usage: node scripts/time-agent-hooks.mjs <plugin-root> [<generated-briefing.md>]");
  process.exit(2);
}
const hooks = ["guard-dispatch.mjs", "guard-dispatch-budget.mjs", "guard-worktree-isolation.mjs", "guard-slicing.mjs"];
const toolInput = briefing
  ? { description: "timing probe", subagent_type: "pipeline-core:goldfish-implementor", model: "sonnet", run_in_background: true, prompt: `${readFileSync(briefing, "utf8")}x` }
  : { description: "timing probe", subagent_type: "general-purpose", prompt: "timing probe, not a briefing" };
const payload = JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Agent", session_id: "timing-probe", cwd: resolve("."), tool_input: toolInput });
console.log(briefing ? "payload: generated briefing plus one byte" : "payload: trivial prompt");
let total = 0;
for (const hook of hooks) {
  const started = process.hrtime.bigint();
  const run = spawnSync(process.execPath, [`${pluginRoot}/hooks/${hook}`], { input: payload, encoding: "utf8", cwd: resolve("."), env: { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot }, timeout: 600000 });
  const ms = Number((process.hrtime.bigint() - started) / 1000000n);
  total += ms;
  const first = `${run.stderr || ""}${run.stdout || ""}`.trim().split("\n")[0].slice(0, 110);
  console.log(`${hook.padEnd(32)} exit ${run.status} ${String(ms).padStart(7)} ms  ${first}`);
}
console.log(`total ${total} ms`);
