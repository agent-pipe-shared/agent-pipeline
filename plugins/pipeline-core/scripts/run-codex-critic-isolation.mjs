#!/usr/bin/env node
/** Local host entry point for the approved profile-bound isolation acceptance. */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { CODEX_CRITIC_ARTIFACTS, runProfileBoundIsolation } from "./codex-critic-isolation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function usage(stream = process.stdout) {
  stream.write("Usage: node plugins/pipeline-core/scripts/run-codex-critic-isolation.mjs --commit <40-hex-sha> [--debug-log <absolute path>]\n");
}

export function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === "--help") return { help: true };
  if (![2, 4].includes(argv.length) || argv[0] !== "--commit" || !/^[0-9a-f]{40}$/u.test(argv[1])) {
    throw new Error("--commit requires an exact 40-hex SHA");
  }
  if (argv.length === 4 && (argv[2] !== "--debug-log" || !path.isAbsolute(argv[3]))) throw new Error("--debug-log requires an absolute path");
  return { help: false, commit: argv[1], ...(argv.length === 4 ? { debugLog: argv[3] } : {}) };
}

export async function run({ commit, repoRoot = root, debugLog } = {}) {
  let completedSteps = 0;
  const options = {
    repoRoot,
    candidateCommit: commit,
    artifactPaths: CODEX_CRITIC_ARTIFACTS,
    onHeartbeat({ label, elapsedMs, stdoutBytes, stderrBytes }) {
      process.stderr.write(`codex-critic-isolation: ${debugLog ? "debug liveness " : ""}${label} ${Math.floor(elapsedMs / 1000)}s stdout=${stdoutBytes} stderr=${stderrBytes}\n`);
    },
    ...(debugLog === undefined ? {} : { debugContext: {
      tracePath: debugLog,
      forbiddenRoots: [repoRoot],
      onProgress({ step, status }) { completedSteps += 1; process.stderr.write(`codex-critic-isolation: debug progress step=${step} status=${status}\n`); },
      onSummary({ outcome, cause, recordCount }) { process.stderr.write(`codex-critic-isolation: debug summary outcome=${outcome} cause=${cause} completed=${completedSteps} records=${recordCount}\n`); },
    } }),
  };
  const result = await runProfileBoundIsolation(options);
  if (!result.ok) {
    for (const [label, diagnostic] of Object.entries(result.localDiagnostics ?? {})) {
      if (!diagnostic) continue;
      if (label === "preflight") {
        for (const [probe, probeDiagnostic] of Object.entries(diagnostic)) {
          if (!probeDiagnostic) continue;
          process.stderr.write(`codex-critic-isolation: local ${label}/${probe} diagnostics stdout=${probeDiagnostic.stdoutBytes}/${probeDiagnostic.stdoutSha256} stderr=${probeDiagnostic.stderrBytes}/${probeDiagnostic.stderrSha256}\n`);
          if (debugLog === undefined && probeDiagnostic.stderrTail) process.stderr.write(`codex-critic-isolation: local ${label}/${probe} stderr tail (do not paste into receipt):\n${probeDiagnostic.stderrTail}\n`);
        }
      } else {
        process.stderr.write(`codex-critic-isolation: local ${label} diagnostics stdout=${diagnostic.stdoutBytes}/${diagnostic.stdoutSha256} stderr=${diagnostic.stderrBytes}/${diagnostic.stderrSha256}\n`);
        if (debugLog === undefined && diagnostic.stderrTail) process.stderr.write(`codex-critic-isolation: local ${label} stderr tail (do not paste into receipt):\n${diagnostic.stderrTail}\n`);
      }
    }
  }
  const { localDiagnostics, ...publicResult } = result;
  return Object.freeze(publicResult);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  let debugMode = false;
  try {
    const args = parseArgs(process.argv.slice(2));
    debugMode = args.debugLog !== undefined;
    if (args.help) usage();
    else {
      const result = await run({ commit: args.commit, debugLog: args.debugLog });
      process.stdout.write(`${JSON.stringify(result)}\n`);
      process.exitCode = result.ok ? 0 : 2;
    }
  } catch (error) {
    process.stderr.write(`codex-critic-isolation: ${debugMode ? "debug run failed; inspect the structured trace" : error.message}\n`);
    usage(process.stderr);
    process.exitCode = 1;
  }
}
