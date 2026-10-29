#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * probe-hook-updated-input.mjs -- one-dispatch live probe: does Claude Code let a PreToolUse hook REPLACE the prompt of an
 * Agent dispatch (`hookSpecificOutput.updatedInput`), so that the child sees the replacement?
 *
 * Why: decision D183 (briefing by file reference) only works as decided if the guard can hand the child different bytes than
 * the dispatching prompt carried. Reading the code cannot answer that; the runner decides. See
 * specs/sprint-alfred-epic/evidence/recon-2026-10-27/d183-briefing-file-reference-recon.md.
 *
 * Usage (from any directory; needs the `claude` CLI on PATH and an authenticated account; costs one small headless run):
 *   node scripts/probe-hook-updated-input.mjs            run the probe and print the verdict as one JSON object
 *   node scripts/probe-hook-updated-input.mjs --dry-run  write the scratch files and print the command, run nothing
 * The probe writes only under a fresh directory in the OS temp folder, registers a throwaway PreToolUse hook through
 * `--settings` (nothing in this repository or in your user settings changes), and removes the directory at the end.
 * Verdict: UPDATED-INPUT-HONOURED (the child answered the hook's nonce), NOT-HONOURED (it answered the original word),
 * INCONCLUSIVE (hook never ran, or the answer held neither word; the raw tail is printed).
 * Internal: `--hook <dir>` is the hook entry the settings file points at.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const ORIGINAL_WORD = "ORIGINALWORD";

/** The hook answer: allow, with the whole tool input kept except the prompt. Pure, exported for the case. */
export function hookAnswer(toolInput, nonce) {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", updatedInput: { ...toolInput, prompt: `Reply with exactly this text and nothing else: ${nonce}` } } };
}

/** The verdict from the child's answer text, the nonce and whether the hook ever ran. Pure, exported for the case. */
export function verdictOf({ answer, nonce, hookCalls }) {
  if (typeof answer === "string" && answer.includes(nonce)) return "UPDATED-INPUT-HONOURED";
  if (hookCalls === 0) return "INCONCLUSIVE-HOOK-NEVER-RAN";
  if (typeof answer === "string" && answer.includes(ORIGINAL_WORD)) return "NOT-HONOURED";
  return "INCONCLUSIVE";
}

function runHook(dir) {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => { raw += chunk; });
  process.stdin.on("end", () => {
    let payload = null;
    try { payload = JSON.parse(raw); } catch { /* not ours */ }
    const input = payload?.tool_input;
    if (payload && ["Task", "Agent"].includes(payload.tool_name) && input && typeof input.prompt === "string") {
      const nonce = readFileSync(join(dir, "nonce.txt"), "utf8").trim();
      appendFileSync(join(dir, "hook-calls.log"), `${JSON.stringify({ tool: payload.tool_name, subagent: input.subagent_type ?? null })}\n`);
      process.stdout.write(`${JSON.stringify(hookAnswer(input, nonce))}\n`);
    }
    process.exit(0);
  });
}

function main(argv) {
  const dryRun = argv.includes("--dry-run");
  const dir = mkdtempSync(join(tmpdir(), "probe-updated-input-"));
  try {
    const nonce = `NONCE${randomBytes(6).toString("hex").toUpperCase()}`;
    writeFileSync(join(dir, "nonce.txt"), nonce);
    writeFileSync(join(dir, "hook-calls.log"), "");
    const settings = join(dir, "settings.json");
    writeFileSync(settings, JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Task|Agent", hooks: [{ type: "command", command: `node "${SELF}" --hook "${dir}"`, timeout: 30 }] }] } }));
    const task = `Use the Agent tool exactly once with subagent_type "Explore" and the prompt "Reply with the single word ${ORIGINAL_WORD} and nothing else." Then print the subagent's answer verbatim and nothing else.`;
    const args = ["-p", task, "--settings", settings, "--allowedTools", "Agent", "Task", "--output-format", "json"];
    if (dryRun) {
      console.log(JSON.stringify({ status: "dry-run", directory: dir, command: ["claude", ...args.map((a) => (/\s/u.test(a) ? JSON.stringify(a) : a))].join(" ") }, null, 2));
      return 0;
    }
    const version = spawnSync("claude", ["--version"], { encoding: "utf8", shell: process.platform === "win32" });
    if (version.error || version.status !== 0) {
      console.log(JSON.stringify({ status: "claude-cli-unavailable", detail: String(version.error?.message ?? version.stderr).slice(0, 300) }, null, 2));
      return 2;
    }
    const run = spawnSync("claude", args, { encoding: "utf8", shell: process.platform === "win32", timeout: 300000, maxBuffer: 64 * 1024 * 1024 });
    let answer = null;
    try { answer = JSON.parse(run.stdout).result; } catch { answer = run.stdout; }
    const hookCalls = readFileSync(join(dir, "hook-calls.log"), "utf8").split("\n").filter(Boolean).length;
    const verdict = verdictOf({ answer, nonce, hookCalls });
    console.log(JSON.stringify({ status: "probed", verdict, claudeVersion: version.stdout.trim(), hookCalls, exit: run.status, answerTail: String(answer ?? "").slice(-300), stderrTail: String(run.stderr ?? "").slice(-300) }, null, 2));
    return verdict.startsWith("INCONCLUSIVE") ? 1 : 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) {
  const hookAt = process.argv.indexOf("--hook");
  if (hookAt !== -1) runHook(process.argv[hookAt + 1]);
  else process.exitCode = main(process.argv.slice(2));
}
