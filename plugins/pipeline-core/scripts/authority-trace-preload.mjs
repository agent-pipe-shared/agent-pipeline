#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * authority-trace-preload.mjs -- opt-in diagnostic that makes ANY Node process of this plugin (a PreToolUse hook, a script)
 * report the same authority counters `pipeline-state.mjs` prints with PIPELINE_AUTHORITY_TRACE=1, without editing the process.
 *
 * Why: the trace of `pipeline-state.mjs` showed that a state command spends about 88 percent of its time in native Windows
 * observations (one PowerShell per call). The minutes of the PreToolUse step of an Agent dispatch belong to hook processes,
 * which never printed that trace, and a real `guard-dispatch` run reserves a slice, so it cannot be timed from outside without
 * side effects. This module is loaded by Node itself, so no protected hook file changes.
 *
 * Use (PowerShell; start the runner from this shell so its hook processes inherit the variables):
 *   $env:PIPELINE_AUTHORITY_TRACE = '1'
 *   $env:PIPELINE_AUTHORITY_TRACE_FILE = "$env:TEMP\hook-authority-trace.jsonl"      # optional; default is stderr
 *   $env:NODE_OPTIONS = '--import file:///<plugin root>/scripts/authority-trace-preload.mjs'
 * Then run one Agent dispatch and read the file: one JSON line per Node process that ended, `pipeline.hook-authority-trace.v1`.
 * Nothing happens unless PIPELINE_AUTHORITY_TRACE is exactly "1". Stderr of a hook that exits 0 is not shown by the runner,
 * which is why the file route exists. The counters are process-local: this file imports the three counter modules by the
 * same relative paths the hooks use, so both see one module instance.
 */
import { appendFileSync } from "node:fs";
import { basename } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

if (process.env.PIPELINE_AUTHORITY_TRACE === "1") {
  const load = async (relative, name) => {
    try { return (await import(new URL(relative, import.meta.url).href))[name]; } catch { return null; }
  };
  const custody = await load("../lib/worktree-lifecycle.mjs", "custodyInspectionStats");
  const observed = await load("../lib/windows-private-state.mjs", "nativeObservationStats");
  const authority = await load("../lib/windows-owned-authority-backend.mjs", "nativeAuthorityStats");
  const startedAt = performance.now();
  const preloadWorkMs = Math.round(startedAt);
  let written = false;
  process.on("exit", (code) => {
    if (written) return;
    written = true;
    try {
      const c = custody?.() ?? { count: 0, ms: 0, maxMs: 0 };
      const o = observed?.() ?? { count: 0, ms: 0, maxMs: 0, failed: 0 };
      const a = authority?.() ?? { count: 0, ms: 0, maxMs: 0, failed: 0, byOperation: {} };
      const trace = {
        schema: "pipeline.hook-authority-trace.v1",
        hook: basename(process.argv[1] ?? "") || "(stdin)",
        pid: process.pid,
        exitCode: typeof code === "number" ? code : 0,
        processMs: Math.round(performance.now()),
        preloadMs: preloadWorkMs,
        custodyInspections: { count: c.count ?? 0, ms: c.ms ?? 0, maxMs: c.maxMs ?? 0 },
        nativeObservations: {
          count: (o.count ?? 0) + (a.count ?? 0),
          ms: (o.ms ?? 0) + (a.ms ?? 0),
          maxMs: Math.max(o.maxMs ?? 0, a.maxMs ?? 0),
          failed: (o.failed ?? 0) + (a.failed ?? 0),
          byOperation: a.byOperation ?? {},
        },
        authorityMemo: { hits: a.authorityMemoHits ?? 0, misses: a.authorityMemoMisses ?? 0, size: a.authorityMemoSize ?? 0 },
        counters: { custody: custody !== null, observed: observed !== null, authority: authority !== null },
      };
      const line = `${JSON.stringify(trace)}\n`;
      const file = process.env.PIPELINE_AUTHORITY_TRACE_FILE;
      if (typeof file === "string" && file !== "") appendFileSync(file, line);
      else process.stderr.write(`AUTHORITY-TRACE ${line}`);
    } catch { /* a diagnostic never changes the exit of the process it observes */ }
  });
}

export const AUTHORITY_TRACE_PRELOAD_PATH = fileURLToPath(import.meta.url);
