#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * authority-trace-preload.mjs -- opt-in diagnostic that makes ANY Node process of this plugin (a PreToolUse hook, a script)
 * report the same authority counters `pipeline-state.mjs` prints with PIPELINE_AUTHORITY_TRACE=1, without editing the process.
 *
 * The writer itself lives in lib/authority-trace-hook.mjs (installHookAuthorityTrace); the Agent PreToolUse hooks call it
 * directly, so a dispatch needs only PIPELINE_AUTHORITY_TRACE=1 (+ PIPELINE_AUTHORITY_TRACE_FILE) and no NODE_OPTIONS. This
 * preload remains for processes that do not call the installer; the installer is idempotent per process, so a process that
 * has both writes ONE line.
 *
 * Use (PowerShell; start the runner from this shell so its hook processes inherit the variables):
 *   $env:PIPELINE_AUTHORITY_TRACE = '1'
 *   $env:PIPELINE_AUTHORITY_TRACE_FILE = "$env:TEMP\hook-authority-trace.jsonl"      # optional; default is stderr
 *   $env:NODE_OPTIONS = '--import file:///<plugin root>/scripts/authority-trace-preload.mjs'
 * A copy of ONLY this file works with
 *   $env:PIPELINE_AUTHORITY_TRACE_PLUGIN_ROOT = '<installed plugin root>'      # the directory that holds lib/
 * Without it a copy still writes its line, with the counters reported as not loaded.
 * Nothing happens unless PIPELINE_AUTHORITY_TRACE is exactly "1".
 */
import { appendFileSync } from "node:fs";
import { basename } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

if (process.env.PIPELINE_AUTHORITY_TRACE === "1") {
  const rootOverride = process.env.PIPELINE_AUTHORITY_TRACE_PLUGIN_ROOT;
  const base = typeof rootOverride === "string" && rootOverride !== ""
    ? pathToFileURL(rootOverride.endsWith("/") || rootOverride.endsWith("\\") ? rootOverride : `${rootOverride}/`)
    : new URL("../", import.meta.url);
  let installer = null;
  try { installer = (await import(new URL("lib/authority-trace-hook.mjs", base).href)).installHookAuthorityTrace; } catch { installer = null; }
  if (typeof installer === "function") {
    await installer({ pluginRootUrl: base });
  } else if (!globalThis[Symbol.for("pipeline.authority-trace-hook.installed")]) {
    // A lone copy of this file with no reachable plugin: still leave the line, counters reported as not loaded.
    globalThis[Symbol.for("pipeline.authority-trace-hook.installed")] = true;
    process.on("exit", (code) => {
      try {
        const zero = { count: 0, ms: 0, maxMs: 0 };
        const trace = {
          schema: "pipeline.hook-authority-trace.v1",
          hook: basename(process.argv[1] ?? "") || "(stdin)",
          pid: process.pid,
          exitCode: typeof code === "number" ? code : 0,
          processMs: Math.round(performance.now()),
          wallMs: Math.round(performance.now()),
          custodyInspections: zero,
          nativeObservations: { ...zero, failed: 0, byOperation: {} },
          authorityMemo: { hits: 0, misses: 0, size: 0 },
          counters: { custody: false, observed: false, authority: false },
        };
        const line = `${JSON.stringify(trace)}\n`;
        const file = process.env.PIPELINE_AUTHORITY_TRACE_FILE;
        if (typeof file === "string" && file !== "") appendFileSync(file, line);
        else process.stderr.write(`AUTHORITY-TRACE ${line}`);
      } catch { /* a diagnostic never changes the exit of the process it observes */ }
    });
  }
}

export const AUTHORITY_TRACE_PRELOAD_PATH = fileURLToPath(import.meta.url);
