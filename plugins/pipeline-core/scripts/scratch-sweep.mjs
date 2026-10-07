#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
// Scratch sweep CLI (PO decision P, sprint-alfred slice C-S2): the explicitly
// invoked front end of lib/scratch-retention.mjs (assessScratchDurability,
// planSweep). It deletes only when --apply is invoked; --check (the default)
// and --sweep are read-only.
//
// Usage: scratch-sweep.mjs [--check | --sweep | --apply] [--root <dir>] [--now <ISO-8601>]
//   --check  durability assessment plus sweep plan (default, read-only)
//   --sweep  the same report with mode "sweep" (a plan only, read-only)
//   --apply  recompute the plan now and delete exactly its files; never anything
//            under scratch/dispatch/, a file git tracks, a live plugin root, a
//            link or a directory. The clock is always the real one: --now is
//            refused together with --apply.
// The plan (library planSweep) already excludes all of that, so a --check/--sweep
// preview is the set --apply deletes.
// Output: one JSON object on stdout; paths are repo-relative. Refusals print
// { status: "refused", code } and exit 1 (SCRATCH-SWEEP-USAGE,
// SCRATCH-SWEEP-NOT-A-REPOSITORY).
import { execFileSync } from 'node:child_process';
import { lstatSync, realpathSync, unlinkSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';

import { assessScratchDurability, planSweep } from '../lib/scratch-retention.mjs';

const SCHEMA = 'pipeline.scratch-sweep.v1';
const MODES = new Set(['--check', '--sweep', '--apply']);

function refuse(code, message) {
  process.stdout.write(`${JSON.stringify({ status: 'refused', code, message })}\n`);
  process.exitCode = 1;
}

function parseArgs(argv) {
  const modes = [];
  let root = null;
  let now = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (MODES.has(arg)) {
      modes.push(arg.slice(2));
    } else if (arg === '--root' || arg === '--now') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) return { error: `${arg} needs a value` };
      i += 1;
      if (arg === '--root') root = value;
      else now = value;
    } else {
      return { error: 'unknown argument' };
    }
  }
  if (modes.length > 1) return { error: 'at most one mode flag is allowed' };
  // --now would let a caller age every file past the 14-day floor; a deletion uses the real clock.
  if (modes[0] === 'apply' && now !== null) return { error: '--now cannot be combined with --apply: a deletion always uses the real clock' };
  let nowDate = new Date();
  if (now !== null) {
    nowDate = new Date(now);
    if (Number.isNaN(nowDate.getTime())) return { error: '--now must be an ISO-8601 timestamp' };
  }
  return { mode: modes[0] ?? 'check', root: resolve(root ?? process.cwd()), now: nowDate };
}

const normalize = (p) => p.replaceAll('\\', '/').replace(/\/+$/u, '').toLowerCase();

/** True only when `root` is itself the top level of a git work tree. */
function isRepositoryRoot(root) {
  try {
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    }).trim();
    return top !== '' && normalize(realpathSync(top)) === normalize(realpathSync(root));
  } catch {
    return false;
  }
}

function applyPlan(root, now) {
  const plan = planSweep({ root, now });
  const physicalScratch = realpathSync(join(root, 'scratch'));
  const deleted = [];
  for (const rel of plan.delete) {
    // The library plan already excludes scratch/dispatch/; this guard is the second, independent line.
    if (!rel.startsWith('scratch/') || rel.toLowerCase().startsWith('scratch/dispatch/')) continue;
    const full = join(root, ...rel.split('/'));
    try {
      const stat = lstatSync(full);
      if (stat.isSymbolicLink() || !stat.isFile()) continue;
      const inner = relative(physicalScratch, realpathSync(full));
      if (inner === '' || inner.startsWith('..') || inner.startsWith(sep) || isAbsolute(inner) || /^[A-Za-z]:/u.test(inner)) continue;
      unlinkSync(full);
      deleted.push(rel);
    } catch {
      // vanished or unreadable: not deleted, not reported
    }
  }
  return { schema: SCHEMA, mode: 'apply', plan, deleted };
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) return refuse('SCRATCH-SWEEP-USAGE', parsed.error);
  const { mode, root, now } = parsed;
  if (!isRepositoryRoot(root)) return refuse('SCRATCH-SWEEP-NOT-A-REPOSITORY', 'the root is not a git work tree');

  if (mode === 'apply') {
    let report;
    try {
      report = applyPlan(root, now);
    } catch {
      // no usable scratch/ directory: nothing to delete
      report = { schema: SCHEMA, mode: 'apply', plan: planSweep({ root, now }), deleted: [] };
    }
    process.stdout.write(`${JSON.stringify(report)}\n`);
    return undefined;
  }
  const report = {
    schema: SCHEMA,
    mode,
    durability: assessScratchDurability({ root, now }),
    plan: planSweep({ root, now }),
  };
  process.stdout.write(`${JSON.stringify(report)}\n`);
  return undefined;
}

main();
