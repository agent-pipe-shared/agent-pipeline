#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Print a non-terminal, read-only continuity status projection as JSON.
 *
 * The command only calls the sanctioned `readState()` reader.  It never calls
 * the pipeline-state writer, acquires a lock, runs a child process or creates a
 * file.  In a host without background wakeups (the default), an active result
 * reports `resume-on-next-turn` rather than claiming that work will continue
 * invisibly after this command exits.
 *
 * Usage: node plugins/pipeline-core/scripts/continuity-status.mjs [--root <project-dir>] [--host-supports-background]
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { projectDir, readState } from "../../../harness/scripts/pipeline-state.mjs";
import { projectReadContinuityStatus } from "../lib/continuity-status.mjs";
import { readGateEstimateEvidence } from "../lib/gate-estimate.mjs";
import { observeGitSource } from "../lib/source-observation.mjs";

function parseArgs(argv) {
  const options = { root: projectDir(), hostSupportsBackground: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) return { ok: false, error: "--root requires a directory" };
      options.root = resolve(value);
      index += 1;
    } else if (arg === "--host-supports-background") {
      options.hostSupportsBackground = true;
    } else {
      return { ok: false, error: `unknown argument: ${arg}` };
    }
  }
  return { ok: true, options };
}

/** Run the status command; dependency injection makes its no-write boundary testable. */
export function run(argv = process.argv.slice(2), { read = readState, write = process.stdout.write.bind(process.stdout) } = {}) {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    process.stderr.write(`Error: ${parsed.error}\n`);
    return 2;
  }
  const readResult = read(parsed.options.root);
  let gateEstimateContext = null;
  if (readResult.status === "ok" && readResult.state?.gateEstimate !== undefined) {
    const observation = observeGitSource(parsed.options.root);
    let evidence;
    try { evidence = readGateEstimateEvidence(parsed.options.root, readResult.state.gateEstimate?.evidence?.path); }
    catch { evidence = { ok: false, code: "GE-EVIDENCE-READ" }; }
    gateEstimateContext = { observation, evidence };
  }
  const result = projectReadContinuityStatus(readResult, {
    hostSupportsBackground: parsed.options.hostSupportsBackground,
    gateEstimateContext,
  });
  write(`${JSON.stringify(result)}\n`);
  return result.stateStatus === "malformed" ? 2 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = run();
}
