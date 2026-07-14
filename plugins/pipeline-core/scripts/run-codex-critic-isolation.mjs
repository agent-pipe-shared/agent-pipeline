#!/usr/bin/env node
/** Local host entry point for the approved profile-bound isolation acceptance. */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CODEX_CRITIC_ARTIFACTS, runProfileBoundIsolation } from "./codex-critic-isolation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function usage(stream = process.stdout) {
  stream.write("Usage: node plugins/pipeline-core/scripts/run-codex-critic-isolation.mjs --commit <40-hex-sha>\n");
}

export function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === "--help") return { help: true };
  if (argv.length !== 2 || argv[0] !== "--commit" || !/^[0-9a-f]{40}$/u.test(argv[1])) {
    throw new Error("--commit requires an exact 40-hex SHA");
  }
  return { help: false, commit: argv[1] };
}

export async function run({ commit, repoRoot = root } = {}) {
  const result = await runProfileBoundIsolation({
    repoRoot,
    candidateCommit: commit,
    artifactPaths: CODEX_CRITIC_ARTIFACTS,
    onHeartbeat({ label, elapsedMs, stdoutBytes, stderrBytes }) {
      process.stderr.write(`codex-critic-isolation: ${label} ${Math.floor(elapsedMs / 1000)}s stdout=${stdoutBytes} stderr=${stderrBytes}\n`);
    },
  });
  if (!result.ok) {
    for (const [label, diagnostic] of Object.entries(result.localDiagnostics ?? {})) {
      if (!diagnostic) continue;
      if (label === "preflight") {
        for (const [probe, probeDiagnostic] of Object.entries(diagnostic)) {
          if (!probeDiagnostic) continue;
          process.stderr.write(`codex-critic-isolation: local ${label}/${probe} diagnostics stdout=${probeDiagnostic.stdoutBytes}/${probeDiagnostic.stdoutSha256} stderr=${probeDiagnostic.stderrBytes}/${probeDiagnostic.stderrSha256}\n`);
          if (probeDiagnostic.stderrTail) process.stderr.write(`codex-critic-isolation: local ${label}/${probe} stderr tail (do not paste into receipt):\n${probeDiagnostic.stderrTail}\n`);
        }
      } else {
        process.stderr.write(`codex-critic-isolation: local ${label} diagnostics stdout=${diagnostic.stdoutBytes}/${diagnostic.stdoutSha256} stderr=${diagnostic.stderrBytes}/${diagnostic.stderrSha256}\n`);
        if (diagnostic.stderrTail) process.stderr.write(`codex-critic-isolation: local ${label} stderr tail (do not paste into receipt):\n${diagnostic.stderrTail}\n`);
      }
    }
  }
  const { localDiagnostics, ...publicResult } = result;
  return Object.freeze(publicResult);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) usage();
    else {
      const result = await run({ commit: args.commit });
      process.stdout.write(`${JSON.stringify(result)}\n`);
      process.exitCode = result.ok ? 0 : 2;
    }
  } catch (error) {
    process.stderr.write(`codex-critic-isolation: ${error.message}\n`);
    usage(process.stderr);
    process.exitCode = 1;
  }
}
