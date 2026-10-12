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

import { scratchLivePluginRoots } from '../lib/physical-scratch-boundary.mjs';
import { assessScratchDurability, planSweep } from '../lib/scratch-retention.mjs';
import { registerPackageStaging, inspectPackageStaging, beginPackageSweep, isPackageSweepMember,
  recheckPackageSweepMember, recordPackageSweepDeletion, closePackageSweep } from '../lib/scratch-package-staging.mjs';

const SCHEMA = 'pipeline.scratch-sweep.v1';
const MODES = new Set(['--check', '--sweep', '--apply', '--register-staging']);

function refuse(code, message) {
  process.stdout.write(`${JSON.stringify({ status: 'refused', code, message })}\n`);
  process.exitCode = 1;
}

function parseArgs(argv) {
  const modes = [];
  let root = null;
  let now = null;
  const values = {}, seen = new Set();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (MODES.has(arg)) {
      modes.push(arg.slice(2));
    } else if (['--root', '--now', '--staging-path', '--package-commit', '--public-prefix'].includes(arg)) {
      if (seen.has(arg)) return { error: 'duplicate value flag' };
      seen.add(arg);
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) return { error: `${arg} needs a value` };
      i += 1;
      if (arg === '--root') root = value;
      else if (arg === '--now') now = value;
      else values[arg.slice(2)] = value;
    } else {
      return { error: 'unknown argument' };
    }
  }
  if (modes.length > 1) return { error: 'at most one mode flag is allowed' };
  // --now would let a caller age every file past the 14-day floor; a deletion uses the real clock.
  if (['apply', 'register-staging'].includes(modes[0]) && now !== null) return { error: '--now cannot enter registration or deletion' };
  const registrationKeys = ['staging-path', 'package-commit', 'public-prefix'];
  if (modes[0] === 'register-staging') {
    if (!registrationKeys.every(key => typeof values[key] === 'string')) return { error: 'registration requires staging path, full package commit and public prefix' };
  } else if (Object.keys(values).length > 0) return { error: 'registration arguments cannot enter check, sweep or apply' };
  let nowDate = new Date();
  if (now !== null) {
    nowDate = new Date(now);
    if (Number.isNaN(nowDate.getTime())) return { error: '--now must be an ISO-8601 timestamp' };
  }
  return { mode: modes[0] ?? 'check', root: resolve(root ?? process.cwd()), now: nowDate, registration: values };
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

function insideRoot(rootPath, target) {
  const rel = relative(rootPath, target);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function applyPlan(root, now) {
  const plan = planSweep({ root, now });
  const packageOperation = beginPackageSweep({ root });
  const packages = packageOperation.inspection;
  const blocked = rel => packages.blockedStagingPaths.some(path => normalize(rel) === normalize(path)
    || normalize(rel).startsWith(`${normalize(path)}/`));
  plan.delete = packages.unknownScope ? [] : [...new Set([
    ...plan.delete.filter(rel => !blocked(rel)), ...packages.delete])].sort();
  const deleted = [];
  let interruption = null;
  try {
  const physicalScratch = realpathSync(join(root, 'scratch'));
  const liveRoots = scratchLivePluginRoots().flatMap((liveRoot) => {
    try { return [liveRoot, realpathSync(liveRoot)]; } catch { return [liveRoot]; }
  });
  for (const rel of plan.delete) {
    // The library plan already excludes scratch/dispatch/; this guard is the second, independent line.
    if (!rel.startsWith('scratch/') || rel.toLowerCase().startsWith('scratch/dispatch/')) continue;
    const full = join(root, ...rel.split('/'));
    const packageMember = packages.delete.includes(rel);
    try {
      if (packageMember) {
        recheckPackageSweepMember(packageOperation.handle, rel);
        unlinkSync(full);
        deleted.push(rel);
        recordPackageSweepDeletion(packageOperation.handle, rel);
        continue;
      }
      const stat = lstatSync(full);
      if (stat.isSymbolicLink() || !stat.isFile()) continue;
      const target = realpathSync(full);
      const inner = relative(physicalScratch, target);
      if (inner === '' || inner === '..' || inner.startsWith(`..${sep}`) || inner.startsWith(sep) || isAbsolute(inner)) continue;
      if (process.platform === 'win32' && /^[A-Za-z]:/u.test(inner)) continue;
      // Re-apply the exclusions to the RESOLVED target: a parent link may land in dispatch/ or a live plugin root.
      if (/^dispatch[\\/]/iu.test(inner)) continue;
      if (liveRoots.some((liveRoot) => insideRoot(liveRoot, target))) continue;
      unlinkSync(full);
      deleted.push(rel);
    } catch (error) {
      if (packageMember) {
        interruption = /^SPC-[A-Z-]{1,60}$/u.test(error?.code ?? '') ? error.code : 'SPC-APPLY-INTERRUPTED';
        break;
      }
      // Original ordinary age-only behavior: vanished/unreadable is not deleted.
    }
  }
  } finally { closePackageSweep(packageOperation.handle); }
  return { schema: SCHEMA, mode: 'apply', plan, deleted,
    ...(packages.holds.length ? { packageStagingHolds: packages.holds } : {}),
    ...(interruption === null ? {} : { status: deleted.length ? 'partial' : 'held', interruption,
      retained: plan.delete.filter(path => !deleted.includes(path)) }) };
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) return refuse('SCRATCH-SWEEP-USAGE', parsed.error);
  const { mode, root, now, registration } = parsed;
  if (!isRepositoryRoot(root)) return refuse('SCRATCH-SWEEP-NOT-A-REPOSITORY', 'the root is not a git work tree');

  if (mode === 'register-staging') {
    const result = registerPackageStaging({ root, stagingPath: registration['staging-path'],
      packageCommit: registration['package-commit'], publicPrefix: registration['public-prefix'] });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (!result.ok) process.exitCode = 1;
    return undefined;
  }

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
  const packageStaging = inspectPackageStaging({ root });
  const report = {
    schema: SCHEMA,
    mode,
    durability: assessScratchDurability({ root, now }),
    plan: planSweep({ root, now }),
    ...(packageStaging.holds.length ? { packageStagingHolds: packageStaging.holds } : {}),
  };
  process.stdout.write(`${JSON.stringify(report)}\n`);
  return undefined;
}

main();
