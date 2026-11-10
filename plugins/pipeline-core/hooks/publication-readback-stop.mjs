#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Stop hook on all three runners: writes the publication readback for a push made during the turn (lib/publication-readback-stop.mjs). It never blocks a Stop,
 * prints no finding and always exits 0, because a failed bookkeeping step must not stop an agent. `{}` is the one stdout every runner reads as "no decision".
 */
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { observeGovernanceScope } from "../lib/governance-scope.mjs";
import { recordPushesAtStop } from "../lib/publication-readback-stop.mjs";

const MAX_INPUT_BYTES = 1024 * 1024;

/** Antigravity names `workspacePaths`, Codex and Claude name `cwd`. */
export function stopHookDirectory(input, env = process.env, fallback = process.cwd()) {
  const first = Array.isArray(input?.workspacePaths) ? input.workspacePaths[0] : undefined;
  return [first, input?.cwd, env.CLAUDE_PROJECT_DIR, fallback].find((value) => typeof value === "string" && value.trim() !== "");
}

async function readInput() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_INPUT_BYTES) return {};
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return {}; }
}

if (isDirectInvocation(import.meta.url)) {
  try {
    const directory = stopHookDirectory(await readInput());
    if (observeGovernanceScope({ rootDir: directory }).requiresEnforcement) await recordPushesAtStop({ cwd: directory });
  } catch {
    // The readback is bookkeeping; the manual `publication-readback.mjs record` remains.
  }
  process.stdout.write("{}\n");
  process.exit(0);
}
