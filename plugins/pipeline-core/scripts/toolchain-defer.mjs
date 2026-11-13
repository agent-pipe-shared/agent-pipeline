#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * C28e (PO tile 2026-11-12): records on this machine that the person deferred installing a required tool, with their answer word for word.
 *
 *   node toolchain-defer.mjs --tool <id> --answer "<the person's answer, verbatim>"   record a deferral
 *   node toolchain-defer.mjs --clear <id>                                               remove it (installed, or ask again)
 *   node toolchain-defer.mjs --list                                                     print the deferrals of this machine
 *
 * The agent runs it only after the person said they install the tool later. A deferral never makes a readiness finding ok and never lifts the
 * plan or close check of a critical calibration (lib/toolchain-deferrals.mjs). Prints one JSON line.
 */
import { clearToolDeferral, readToolchainDeferrals, recordToolDeferral } from "../lib/toolchain-deferrals.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

const USAGE = "Usage: toolchain-defer.mjs --tool <id> --answer <verbatim answer> | --clear <id> | --list";

export function runToolchainDefer(argv, dependencies = {}) {
  if (argv.length === 1 && argv[0] === "--list") {
    const read = readToolchainDeferrals(dependencies);
    return { status: read.status, tools: read.deferrals?.tools ?? {} };
  }
  if (argv.length === 2 && argv[0] === "--clear") return clearToolDeferral(argv[1], dependencies);
  if (argv.length === 4 && argv[0] === "--tool" && argv[2] === "--answer") return recordToolDeferral(argv[1], argv[3], dependencies);
  throw new Error(USAGE);
}

if (isDirectInvocation(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(runToolchainDefer(process.argv.slice(2)))}\n`);
  } catch (error) {
    process.stderr.write(`toolchain-defer: ${error.message}\n`);
    process.exitCode = 2;
  }
}
