#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * tmp-leak-guard.mjs -- a cheap, standalone guard against the *class* of leaking-temp-directory
 * defect, not the specific instance.
 *
 * WHY. backlog/items/2026-08-08-temp-directories-leak-until-the-filesystem-refuses-every-write.md
 * Direction point 4: "Consider a cheap guard against the class ... a Verify step that fails when
 * a run leaves behind more temp directories than it found. That turns 'someone notices in two
 * days' into 'the run that caused it says so'." This delivery is exactly that guard, built as a
 * STANDALONE diagnostic (deliberately NOT wired into `harness/scripts/verify.mjs` -- a future
 * dispatch's job) that any agent or CI step can invoke around one command/suite: snapshot the
 * directory-entry count of a given root (default: the OS temp directory) before, run the
 * wrapped command, snapshot again after, and report the delta.
 *
 * CLI: `node plugins/pipeline-core/scripts/tmp-leak-guard.mjs [--root <dir>] [--out <path>]
 *   -- <command> [args...]`
 *   --root  directory to snapshot (default: the OS temp directory, `node:os` tmpdir()).
 *   --out   evidence file to write (default: none -- prints the receipt to stdout only).
 *   --      everything after this separator is the wrapped command and its own argv.
 * Exit code: the wrapped command's own exit code, UNLESS it exits 0 and the guard detects a
 * positive leak (afterCount > beforeCount), in which case the guard exits 3 -- distinct from any
 * exit code a wrapped command could plausibly use, so a caller can tell leak-detected apart from
 * "the wrapped command itself failed". A wrapped command that itself exits non-zero keeps that
 * exit code (its own failure is already visible; the guard does not mask it).
 */
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { isDirectInvocation } from "../lib/entrypoint.mjs";

const LEAK_EXIT_CODE = 3;

/** Counts top-level entries of `root`. Never throws: an unreadable root counts as 0. */
export function snapshotCount(root) {
  try {
    return readdirSync(root).length;
  } catch {
    return 0;
  }
}

/**
 * Runs `command`/`args` with cwd unaffected, snapshotting `root`'s entry count before and
 * after. `spawnFn` is an injectable seam for tests (defaults to the real `spawnSync`).
 * Never throws: a spawn error is captured into the receipt's `spawnError` field, `afterCount`
 * still taken so the guard's own diagnostic value survives a wrapped-command launch failure.
 */
export function runTmpLeakGuard({ root = tmpdir(), command, args = [], spawnFn = spawnSync } = {}) {
  if (typeof command !== "string" || command.length === 0) {
    throw new Error("runTmpLeakGuard requires a non-empty `command` string");
  }
  const beforeCount = snapshotCount(root);
  const result = spawnFn(command, args, { encoding: "utf8", shell: false });
  const afterCount = snapshotCount(root);
  const delta = afterCount - beforeCount;
  const commandExitCode = result.error ? null : result.status;
  const leakDetected = delta > 0;

  return {
    schema: "pipeline.tmp-leak-guard.v1",
    root,
    command,
    args,
    beforeCount,
    afterCount,
    delta,
    leakDetected,
    commandExitCode,
    spawnError: result.error ? String(result.error.message ?? result.error) : null,
    generatedAt: new Date().toISOString(),
  };
}

function parseArgs(argv) {
  const opts = { root: tmpdir(), out: null, command: null, commandArgs: [] };
  let i = 0;
  for (; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root") opts.root = argv[++i];
    else if (a === "--out") opts.out = argv[++i];
    else if (a === "--") { i++; break; }
    else throw new Error(`unknown argument: ${a}`);
  }
  const rest = argv.slice(i);
  if (rest.length === 0) throw new Error("no wrapped command given -- pass `-- <command> [args...]`");
  opts.command = rest[0];
  opts.commandArgs = rest.slice(1);
  return opts;
}

export function main(argv = process.argv.slice(2)) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n`);
    process.exitCode = 1;
    return;
  }

  const root = resolve(opts.root);
  const receipt = runTmpLeakGuard({ root, command: opts.command, args: opts.commandArgs });

  if (opts.out) {
    const outPath = resolve(opts.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`);
    console.log(`Evidence written: ${outPath}`);
  }

  console.log(`root: ${receipt.root}`);
  console.log(`before: ${receipt.beforeCount}  after: ${receipt.afterCount}  delta: ${receipt.delta}`);
  if (receipt.spawnError) console.log(`spawnError: ${receipt.spawnError}`);
  if (receipt.leakDetected) {
    console.log(`LEAK DETECTED: run left behind ${receipt.delta} more entr${receipt.delta === 1 ? "y" : "ies"} in ${receipt.root} than it found.`);
  } else {
    console.log("no leak detected");
  }

  if (receipt.commandExitCode !== 0 && receipt.commandExitCode !== null) {
    process.exitCode = receipt.commandExitCode;
  } else if (receipt.leakDetected) {
    process.exitCode = LEAK_EXIT_CODE;
  } else {
    process.exitCode = 0;
  }
}

if (isDirectInvocation(import.meta.url)) {
  main();
}
