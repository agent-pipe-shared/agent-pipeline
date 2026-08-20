#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Extract apply_patch paths and run the existing write-path guards per path. */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const GUARDS = [
  { path: fileURLToPath(new URL("./guard-testpath.mjs", import.meta.url)), args: [] },
  { path: fileURLToPath(new URL("./guard-devplan.mjs", import.meta.url)), args: [] },
  // Authoritative, not inferred (ADR-0051): guard-lifecycle-ready.mjs is
  // reachable only through this script, which is itself spawned only from
  // codex-pretool-guard.mjs (a Codex-only hook target, registered in no hook
  // config of either runner). A stray CLAUDECODE=1 inherited via the
  // propagated environment below must not silently reassign the runner this
  // per-file admission decision is made for.
  { path: fileURLToPath(new URL("./guard-lifecycle-ready.mjs", import.meta.url)), args: ["--runner", "codex"] },
];
const MAX_PARALLEL_GUARDS = 12;
const CHILD_TIMEOUT_MS = 4_000;

function killGuardProcess(child) {
  if (child.pid === undefined) return;
  if (process.platform !== "win32") {
    try { process.kill(-child.pid, "SIGKILL"); return; } catch {}
  }
  try { child.kill("SIGKILL"); } catch {}
}

function runGuard({ path, args, input }) {
  return new Promise((resolve) => {
    let settled = false;
    let stderr = "";
    const child = spawn(process.execPath, [path, ...args], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["pipe", "ignore", "pipe"],
      detached: process.platform !== "win32",
    });
    const timer = setTimeout(() => {
      child.stdin.destroy();
      child.stderr.destroy();
      killGuardProcess(child);
      finish({ status: null, signal: "SIGKILL", timedOut: true });
    }, CHILD_TIMEOUT_MS);
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...result, stderr });
    };
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => finish({ status: null, error }));
    child.on("close", (status, signal) => finish({ status, signal }));
    child.stdin.end(input);
  });
}

async function runGuardsInParallel(jobs) {
  const results = [];
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const job = jobs[next++];
      results.push({ job, result: await runGuard(job) });
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL_GUARDS, jobs.length) }, worker));
  return results;
}

function block(reason) {
  process.stderr.write(`BLOCKED (guard-apply-patch, plugin pipeline-core): ${reason}\n`);
  process.exit(2);
}
let input;
try { input = JSON.parse(readFileSync(0, "utf8")); }
catch { block("apply_patch input is not valid JSON."); }
const toolName = String(input?.tool_name ?? "");
const command = typeof input?.tool_input?.command === "string" ? input.tool_input.command : "";
if (toolName !== "apply_patch") process.exit(0);
if (command === "") block("apply_patch command is missing or malformed.");

const lines = command.replace(/\r\n/g, "\n").split("\n");
const first = lines.findIndex((line) => line !== "");
let last = lines.length - 1;
while (last >= 0 && lines[last] === "") last--;
if (first < 0 || lines[first] !== "*** Begin Patch" || lines[last] !== "*** End Patch") block("apply_patch envelope is missing or ambiguous.");

const paths = [];
let operation = null;
let beginCount = 0;
let endCount = 0;
for (let index = 0; index < lines.length; index++) {
  const line = lines[index];
  if (line === "*** Begin Patch") { beginCount++; if (index !== first || beginCount > 1) block(`ambiguous Begin Patch header at line ${index + 1}.`); continue; }
  if (line === "*** End Patch") { endCount++; if (index !== last || endCount > 1) block(`ambiguous End Patch header at line ${index + 1}.`); continue; }
  const header = line.match(/^\*\*\* (Add File|Update File|Delete File|Move to):(.*)$/);
  if (header) {
    const kind = header[1];
    const suffix = header[2];
    if (!suffix.startsWith(" ") || suffix.startsWith("  ")) block(`ambiguous ${kind} path at line ${index + 1}.`);
    const filePath = suffix.slice(1);
    const normalized = filePath.replace(/\\/g, "/");
    const segments = normalized.split("/");
    if (filePath === "" || filePath !== filePath.trim() || filePath.includes("\0") || normalized.endsWith("/") || normalized.includes("//") || segments.some((segment) => [".", ".."].includes(segment))) block(`empty, traversal, or ambiguous ${kind} path at line ${index + 1}.`);
    if (kind === "Move to" && operation !== "Update File") block(`Move to header without a preceding Update File at line ${index + 1}.`);
    operation = kind;
    paths.push(filePath);
    continue;
  }
  if (line.startsWith("*** ")) block(`unknown or ambiguous patch header at line ${index + 1}: ${line}`);
  if (index > first && index < last && operation === null) {
    block(`patch content appears before the first file operation at line ${index + 1}.`);
  }
}
if (beginCount !== 1 || endCount !== 1 || paths.length === 0) block("non-empty apply_patch payload contains no unambiguous file paths.");

// ARCHITECTURAL INVARIANT, permanent (backlog:
// raw-apply_patch-is-unconditionally-admitted-by-the-outer-lifecycle-gate,
// PO decision: option A). guard-lifecycle-ready.mjs's own outer tool-name
// gate -- `if (![...SHELL_TOOLS, ...WRITE_TOOLS].includes(toolName)) return
// verdict(0);` in evaluateLifecycleReadyGuard() -- does NOT recognize
// "apply_patch". A raw apply_patch tool call that reached
// evaluateLifecycleReadyGuard() directly would be admitted unconditionally,
// before any lifecycle-readiness, write-target, or governance check ever
// ran. This loop is deliberately the SOLE enforcement boundary that closes
// that gap: it never forwards the original apply_patch tool call as-is --
// for every touched path it synthesizes a `{tool_name: "Edit", tool_input:
// {file_path}}` shape THAT DOES pass through guard-lifecycle-ready.mjs's
// gate correctly, and it is spawned with an explicit `--runner codex`
// (ADR-0051) so that shape reaches the guard on every invocation, restart-
// required or not. If this file's wiring ever stops translating -- a
// refactor of this loop, a different call site, or a change to Codex's own
// hook configuration (codex-hooks.json / codex-pretool-guard.mjs) that lets
// an apply_patch call reach guard-lifecycle-ready.mjs some other way --
// lifecycle enforcement for Codex writes would silently stop applying: no
// error, no warning, just an admitted write. Widening
// evaluateLifecycleReadyGuard's own outer gate to also recognize
// apply_patch directly (defense in depth) is a separate, deliberately
// deferred decision (option B) -- out of scope here and NOT a substitute
// for this comment holding. Regression coverage in
// guard-apply-patch.test.mjs pins both halves: the literal synthesized
// shape below is never a raw pass-through of the original tool_name, and
// evaluateLifecycleReadyGuard's outer gate still does not recognize
// apply_patch on its own -- either fact changing should make that suite
// fail, forcing a reader to reconsider this comment rather than silently
// drift past it.
const jobs = paths.flatMap((filePath) => GUARDS.map((guard) => ({
  ...guard,
  filePath,
      input: JSON.stringify({
        tool_name: "Edit",
        session_id: input.session_id ?? input.sessionId,
        tool_input: { file_path: filePath },
      }),
})));
let exitCode = 0;
const stderr = [];
const results = await runGuardsInParallel(jobs);
for (const { job, result } of results) {
  if (result.stderr) stderr.push(result.stderr.trimEnd());
  if (result.timedOut) {
    exitCode = 2;
    stderr.push(`[guard-apply-patch] Guard timed out for ${job.filePath}.`);
  } else if (result.status === 2) exitCode = 2;
  else if (result.status === 1 && exitCode === 0) exitCode = 1;
  else if (![0, 1, 2].includes(result.status)) {
    exitCode = 2;
    stderr.push(`[guard-apply-patch] Guard failed for ${job.filePath}.`);
  }
}
if (stderr.length > 0) process.stderr.write(`${stderr.filter(Boolean).join("\n")}\n`);
process.exit(exitCode);
