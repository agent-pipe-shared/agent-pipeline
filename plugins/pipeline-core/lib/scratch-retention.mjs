// SPDX-License-Identifier: SUL-1.0
// Scratch retention (PO decision P): a read-only durability assessment of the
// root-level `scratch/` directory and a sweep PLAN. Nothing in this module
// deletes, creates or touches a file; applying a plan is a separate step.
import { execFileSync } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_AGE_DAYS = 14;
const REFERENCE_EXTENSIONS = /\.(?:md|json|txt)$/iu;

function isInside(parent, child) {
  const rel = relative(parent, child);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !/^[A-Za-z]:/u.test(rel) && !rel.startsWith(sep);
}

/** Regular files under `<root>/scratch`, repo-relative with forward slashes, with mtimes. Links are never listed or followed. */
function listScratchFiles(root) {
  const scratch = join(root, 'scratch');
  let top;
  try {
    top = lstatSync(scratch);
  } catch {
    return [];
  }
  if (!top.isDirectory() || top.isSymbolicLink()) return [];
  let physicalRoot;
  let physicalScratch;
  try {
    physicalRoot = realpathSync(root);
    physicalScratch = realpathSync(scratch);
  } catch {
    return [];
  }
  if (!isInside(physicalRoot, physicalScratch)) return [];

  const files = [];
  const walk = (dir, prefix) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const full = join(dir, entry.name);
      const rel = `${prefix}/${entry.name}`;
      let stat;
      try {
        stat = lstatSync(full);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) walk(full, rel);
      else if (stat.isFile()) files.push({ rel, mtimeMs: stat.mtimeMs });
    }
  };
  walk(scratch, 'scratch');
  return files;
}

/** Concatenated, slash-normalized text of every tracked .md/.json/.txt file, or null when git cannot say. */
function trackedReferenceText(root) {
  let listing;
  try {
    listing = execFileSync('git', ['ls-files', '-z'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch {
    return null;
  }
  const chunks = [];
  for (const name of listing.split('\0')) {
    if (!name || !REFERENCE_EXTENSIONS.test(name)) continue;
    const full = resolve(root, name);
    try {
      if (!lstatSync(full).isFile()) continue;
      chunks.push(readFileSync(full, 'utf8').replaceAll('\\', '/'));
    } catch {
      // a tracked file missing from the working tree holds no readable reference
    }
  }
  return chunks.join('\n');
}

function assess(root, now, maxAgeDays) {
  const files = listScratchFiles(root);
  const text = trackedReferenceText(root);
  if (text === null) {
    return {
      referenced: [],
      unreferencedOld: [],
      warning: 'not a git repository (or git unavailable): tracked references are unknown, so no scratch file may be declared deletable',
    };
  }
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const referenced = [];
  const unreferencedOld = [];
  for (const { rel, mtimeMs } of files) {
    if (text.includes(rel)) referenced.push(rel);
    else if (nowMs - mtimeMs > maxAgeDays * DAY_MS) unreferencedOld.push(rel);
  }
  referenced.sort();
  unreferencedOld.sort();
  return { referenced, unreferencedOld };
}

/** `referenced`: scratch files a tracked document points at (durability warning list); `unreferencedOld`: older than 14 days, unreferenced. */
export function assessScratchDurability({ root, now = new Date() } = {}) {
  return assess(root, now, DEFAULT_MAX_AGE_DAYS);
}

/** A PLAN only: the scratch files that are old enough and unreferenced. Never deletes. */
export function planSweep({ root, now = new Date(), maxAgeDays = DEFAULT_MAX_AGE_DAYS } = {}) {
  const result = assess(root, now, maxAgeDays);
  const plan = { delete: result.unreferencedOld };
  if (result.warning) plan.warning = result.warning;
  return plan;
}
