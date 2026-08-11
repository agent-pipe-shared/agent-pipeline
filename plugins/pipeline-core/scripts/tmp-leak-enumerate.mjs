#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * tmp-leak-enumerate.mjs -- repeatable, complete enumeration of a temp directory's top-level
 * entries grouped by prefix, with counts.
 *
 * WHY. backlog/items/2026-08-08-temp-directories-leak-until-the-filesystem-refuses-every-write.md
 * Direction point 1: "Enumerate the prefixes completely before fixing any of them." Both wrong
 * answers in that investigation came from sampling (`ls | head -40` showed one prefix, the full
 * listing was truncated at 1MB). This script replaces ad-hoc shell one-liners with a repeatable,
 * complete, machine-readable enumeration -- implemented in Node (readdirSync) rather than
 * shelling out to `find`/`sed`/`sort`/`uniq`, so there is no output-truncation risk and no
 * dependency on external tools being on PATH.
 *
 * GROUPING. Mirrors the item's own suggested shape (`sed 's/-[A-Za-z0-9]*$//'`): a trailing
 * `-<alnum-suffix>` (the random per-instance token every one of these fixture prefixes uses,
 * e.g. `actions-permissions-x7k2p9`) is stripped from each entry name to derive its prefix. An
 * entry with no such trailing suffix groups under its own full name.
 *
 * CLI: `node plugins/pipeline-core/scripts/tmp-leak-enumerate.mjs [--root <dir>] [--out <path>]`
 *   --root  directory to enumerate (default: the OS temp directory, `node:os` tmpdir()).
 *   --out   evidence file to write (default: <cwd>/evidence/tmp-leak-enumeration-<ISO-date>.json).
 * Prints a human-readable summary (prefix, count) sorted by count descending, then the evidence
 * path. Exit code is always 0 -- this is a diagnostic, not a gate.
 */
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { isDirectInvocation } from "../lib/entrypoint.mjs";

const SUFFIX_PATTERN = /-[A-Za-z0-9]+$/;

/** Strips a trailing `-<alnum>` random-instance suffix, mirroring the item's own `sed` rule. */
export function prefixOf(entryName) {
  return entryName.replace(SUFFIX_PATTERN, "");
}

/**
 * Enumerates top-level entries of `root`, grouped by prefix with counts. Never throws: an
 * unreadable/absent root yields an empty groups list plus a `reason`. Directories and files are
 * both counted (the item's own leak class was directories, but a complete enumeration should not
 * silently hide a file-shaped leak of the same kind).
 */
export function enumerateTmpDirectories(root) {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch (err) {
    return {
      schema: "pipeline.tmp-leak-enumeration.v1",
      root,
      totalEntries: 0,
      groups: [],
      reason: `could not read root: ${err?.message ?? err}`,
      generatedAt: new Date().toISOString(),
    };
  }
  const counts = new Map();
  for (const entry of entries) {
    const prefix = prefixOf(entry.name);
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
  }
  const groups = [...counts.entries()]
    .map(([prefix, count]) => ({ prefix, count }))
    .sort((a, b) => b.count - a.count || a.prefix.localeCompare(b.prefix));
  return {
    schema: "pipeline.tmp-leak-enumeration.v1",
    root,
    totalEntries: entries.length,
    groups,
    reason: null,
    generatedAt: new Date().toISOString(),
  };
}

function parseArgs(argv) {
  const opts = { root: tmpdir(), out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root") opts.root = argv[++i];
    else if (a === "--out") opts.out = argv[++i];
    else throw new Error(`unknown argument: ${a}`);
  }
  return opts;
}

function defaultOutPath() {
  const isoDate = new Date().toISOString().slice(0, 10);
  return join(process.cwd(), "evidence", `tmp-leak-enumeration-${isoDate}.json`);
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
  const report = enumerateTmpDirectories(root);
  const outPath = resolve(opts.out ?? defaultOutPath());
  mkdirSync(join(outPath, ".."), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`root: ${report.root}`);
  console.log(`totalEntries: ${report.totalEntries}`);
  if (report.reason) console.log(`reason: ${report.reason}`);
  for (const { prefix, count } of report.groups) {
    console.log(`${String(count).padStart(6)}  ${prefix}`);
  }
  console.log(`\nEvidence written: ${outPath}`);
}

if (isDirectInvocation(import.meta.url)) {
  main();
}
