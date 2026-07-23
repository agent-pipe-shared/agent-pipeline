#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Local, observable host entry point for the approved three-run probe protocol. */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runProbeSplit } from "./codex-critic-probe-split.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ARTIFACTS = Object.freeze([
  "plugins/pipeline-core/scripts/codex-critic-isolation.mjs",
  "plugins/pipeline-core/scripts/codex-critic-isolation.test.mjs",
  "plugins/pipeline-core/scripts/run-codex-critic-isolation.mjs",
  "plugins/pipeline-core/scripts/codex-critic-probe-split.mjs",
  "plugins/pipeline-core/scripts/codex-critic-probe-split.test.mjs",
  "plugins/pipeline-core/scripts/run-codex-critic-probe-split.mjs",
  "plugins/pipeline-core/scripts/critic-verdict.schema.json",
  "harness/scripts/verify.mjs",
]);

export function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== "--commit" || !/^[0-9a-f]{40}$/u.test(argv[1])) throw new Error("--commit requires an exact 40-hex SHA");
  return Object.freeze({ commit: argv[1] });
}

export async function run({ commit, repoRoot = root } = {}) {
  return runProbeSplit({
    repoRoot, candidateCommit: commit, artifactPaths: ARTIFACTS,
    onHeartbeat({ taskType, elapsedMs, stdoutBytes, stderrBytes }) {
      process.stderr.write(`codex-critic-probe-split: ${taskType} ${Math.floor(elapsedMs / 1000)}s stdout=${stdoutBytes} stderr=${stderrBytes}\n`);
    },
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await run(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = result.ok ? 0 : 2;
  } catch (error) {
    process.stderr.write(`codex-critic-probe-split: ${error.message}\n`);
    process.exitCode = 1;
  }
}
