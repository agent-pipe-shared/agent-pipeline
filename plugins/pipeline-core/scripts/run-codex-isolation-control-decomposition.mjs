#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Local entry point for the one approved control-decomposition acceptance. */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runControlDecomposition } from "./codex-isolation-control-decomposition.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ARTIFACTS = Object.freeze([
  "plugins/pipeline-core/scripts/codex-critic-isolation.mjs",
  "plugins/pipeline-core/scripts/codex-critic-isolation.test.mjs",
  "plugins/pipeline-core/scripts/run-codex-critic-isolation.mjs",
  "plugins/pipeline-core/scripts/critic-verdict.schema.json",
  "harness/scripts/verify.mjs",
]);

export function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== "--commit" || !/^[0-9a-f]{40}$/u.test(argv[1])) throw new Error("--commit requires an exact 40-hex SHA");
  return Object.freeze({ commit: argv[1] });
}

export async function run({ commit, repoRoot = root } = {}) {
  return runControlDecomposition({
    repoRoot, candidateCommit: commit, artifactPaths: ARTIFACTS,
    onHeartbeat({ label, elapsedMs, stdoutBytes, stderrBytes }) {
      process.stderr.write(`codex-isolation-control-decomposition: ${label} ${Math.floor(elapsedMs / 1000)}s stdout=${stdoutBytes} stderr=${stderrBytes}\n`);
    },
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await run(parseArgs(process.argv.slice(2)));
    if (!result.ok) {
      for (const [label, diagnostic] of Object.entries(result.localDiagnostics ?? {})) {
        if (!diagnostic) continue;
        process.stderr.write(`codex-isolation-control-decomposition: local ${label} diagnostics stdout=${diagnostic.stdoutBytes}/${diagnostic.stdoutSha256} stderr=${diagnostic.stderrBytes}/${diagnostic.stderrSha256}\n`);
        if (diagnostic.stderrTail) process.stderr.write(`codex-isolation-control-decomposition: local ${label} stderr tail (do not paste into receipt):\n${diagnostic.stderrTail}\n`);
      }
    }
    const { localDiagnostics, ...publicResult } = result;
    process.stdout.write(`${JSON.stringify(publicResult)}\n`);
    process.exitCode = result.ok ? 0 : 2;
  } catch (error) {
    process.stderr.write(`codex-isolation-control-decomposition: ${error.message}\n`);
    process.exitCode = 1;
  }
}
