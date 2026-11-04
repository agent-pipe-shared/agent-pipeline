#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Usage: node analysis-run.mjs --root <dir> [--commit <rev>] [--timeout-seconds <n>]
 *
 * Runs the registered verify command of <rev> (default HEAD) in a throwaway clone
 * under the git common directory and records a labelled analysis result
 * (never Verify evidence). Nothing else is accepted: any other flag or positional
 * is refused. Timeout default 600, maximum 1800 seconds.
 * Prints one JSON line. Exit 0: verdict passed or failed. Exit 2: refusal,
 * timeout-free refusal codes (ANALYSIS-*), or a changed working tree.
 */
import { runAnalysis } from '../lib/analysis-run.mjs';

function parse(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (!['--root', '--commit', '--timeout-seconds'].includes(flag) || value === undefined || flag in values) return null;
    values[flag] = value;
  }
  return values;
}

function main(argv) {
  const values = parse(argv);
  const timeout = values?.['--timeout-seconds'];
  if (values === null || !('--root' in values) || (timeout !== undefined && !/^\d+$/u.test(timeout))) {
    console.log(JSON.stringify({ status: 'refused', code: 'ANALYSIS-USAGE' }));
    return 2;
  }
  const outcome = runAnalysis({
    root: values['--root'],
    ...(values['--commit'] !== undefined ? { commit: values['--commit'] } : {}),
    ...(timeout !== undefined ? { timeoutSeconds: Number(timeout) } : {}),
  });
  if (outcome.status === 'refused') {
    console.log(JSON.stringify({ status: 'refused', code: outcome.code }));
    return 2;
  }
  console.log(JSON.stringify({ status: outcome.status, verdict: outcome.verdict, resultPath: outcome.resultPath, deleted: outcome.deleted }));
  return outcome.status === 'ok' ? 0 : 2;
}

process.exitCode = main(process.argv.slice(2));
