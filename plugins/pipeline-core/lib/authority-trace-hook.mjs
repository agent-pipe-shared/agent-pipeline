// SPDX-License-Identifier: SUL-1.0
/**
 * authority-trace-hook.mjs -- opt-in exit-time authority trace for any Node process of this plugin (a PreToolUse hook, a script).
 *
 * When PIPELINE_AUTHORITY_TRACE is exactly "1", installHookAuthorityTrace({ hook }) registers ONE process 'exit' writer that
 * appends one `pipeline.hook-authority-trace.v1` JSON line to PIPELINE_AUTHORITY_TRACE_FILE when set, else to stderr as
 * `AUTHORITY-TRACE <json>`. Otherwise the call does nothing and imports nothing. It is idempotent per process (a global
 * Symbol.for marker, shared with scripts/authority-trace-preload.mjs), never throws and never changes the exit code. The three
 * counter modules are imported lazily by the same relative paths the hooks use, so hook and writer share one module instance.
 */
import { appendFileSync } from "node:fs";
import { basename } from "node:path";
import { performance } from "node:perf_hooks";

const MARKER = Symbol.for("pipeline.authority-trace-hook.installed");
const loadedAt = performance.now();

/**
 * @param {{ hook?: string, pluginRootUrl?: URL }} [options] pluginRootUrl: directory URL holding lib/ (default: this plugin).
 * @returns {Promise<boolean>} true when this call installed the writer.
 */
export async function installHookAuthorityTrace(options = {}) {
  try {
    if (process.env.PIPELINE_AUTHORITY_TRACE !== "1") return false;
    if (globalThis[MARKER]) return false;
    globalThis[MARKER] = true;
    const base = options.pluginRootUrl ?? new URL("../", import.meta.url);
    const load = async (relative, name) => {
      try { return (await import(new URL(relative, base).href))[name]; } catch { return null; }
    };
    const custody = await load("lib/worktree-lifecycle.mjs", "custodyInspectionStats");
    const observed = await load("lib/windows-private-state.mjs", "nativeObservationStats");
    const authority = await load("lib/windows-owned-authority-backend.mjs", "nativeAuthorityStats");
    const hook = options.hook ?? (basename(process.argv[1] ?? "") || "(stdin)");
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
          hook,
          pid: process.pid,
          exitCode: typeof code === "number" ? code : 0,
          processMs: Math.round(performance.now()),
          wallMs: Math.round(performance.now() - loadedAt),
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
    return true;
  } catch {
    return false;
  }
}
