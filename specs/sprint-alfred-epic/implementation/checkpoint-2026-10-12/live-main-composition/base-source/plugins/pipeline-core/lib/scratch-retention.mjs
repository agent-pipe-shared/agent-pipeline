// SPDX-License-Identifier: SUL-1.0
// Scratch retention (PO decision P): a read-only durability assessment of the
// root-level `scratch/` directory and a sweep PLAN. Nothing in this module
// deletes, creates or touches a file; applying a plan is a separate step.
import { execFileSync } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

import { isPhysicalScratchTarget, scratchLivePluginRoots } from './physical-scratch-boundary.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_AGE_DAYS = 14;
const REFERENCE_EXTENSIONS = /\.(?:md|json|txt)$/iu;
// Never swept, whatever its age (compared case-insensitively: on a case-insensitive
// file system `scratch/Dispatch/` is the same directory as `scratch/dispatch/`).
const DISPATCH_PREFIX = 'scratch/dispatch/';
const MAX_NAMED_UNREADABLE = 5;

const pathKey = (p) => p.normalize('NFC').toLowerCase();

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

/**
 * What git tracks, or null when git cannot say: `text` is the concatenated, slash-normalized
 * content of every readable tracked .md/.json/.txt file; `tracked` is the set of tracked path
 * keys (see pathKey); `unreadable` names the tracked reference documents that exist in the
 * working tree but could not be read (a document that is merely absent from the working tree
 * holds no readable reference and is not reported).
 */
function readTrackedState(root) {
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
  const tracked = new Set();
  const unreadable = [];
  for (const name of listing.split('\0')) {
    if (!name) continue;
    tracked.add(pathKey(name));
    if (!REFERENCE_EXTENSIONS.test(name)) continue;
    const full = resolve(root, name);
    let stat;
    try {
      stat = lstatSync(full);
    } catch (error) {
      if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') unreadable.push(name);
      continue;
    }
    if (!stat.isFile()) continue;
    try {
      chunks.push(readFileSync(full, 'utf8').replaceAll('\\', '/'));
    } catch {
      unreadable.push(name);
    }
  }
  unreadable.sort();
  return { text: chunks.join('\n'), tracked, unreadable };
}

/** True when git tracks `rel` itself or any directory above it (a tracked path may be a submodule). */
function isTrackedPath(tracked, rel) {
  const key = pathKey(rel);
  if (tracked.has(key)) return true;
  for (let slash = key.indexOf('/'); slash !== -1; slash = key.indexOf('/', slash + 1)) {
    if (tracked.has(key.slice(0, slash))) return true;
  }
  return false;
}

function unreadableWarning(unreadable) {
  const named = unreadable.slice(0, MAX_NAMED_UNREADABLE).join(', ');
  const more = unreadable.length > MAX_NAMED_UNREADABLE ? `, and ${unreadable.length - MAX_NAMED_UNREADABLE} more` : '';
  return `${unreadable.length} tracked reference document(s) could not be read (${named}${more}): references are incomplete, so no scratch file may be declared deletable`;
}

function assess(root, now, maxAgeDays) {
  const files = listScratchFiles(root);
  const state = readTrackedState(root);
  if (state === null) {
    return {
      referenced: [],
      unreferencedOld: [],
      warning: 'not a git repository (or git unavailable): tracked references are unknown, so no scratch file may be declared deletable',
    };
  }
  const { text, tracked, unreadable } = state;
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const liveRoots = scratchLivePluginRoots();
  // A sweep candidate is more than "old and unreferenced": it is never under scratch/dispatch/,
  // never tracked by git, and never a live plugin root, alias or multiply-linked file (the
  // physical scratch boundary decides that last part). Cheap checks first.
  const isCandidate = (rel) => !pathKey(rel).startsWith(DISPATCH_PREFIX)
    && !isTrackedPath(tracked, rel)
    && isPhysicalScratchTarget(rel, { rootDir: root, liveRoots });
  const referenced = [];
  const unreferencedOld = [];
  for (const { rel, mtimeMs } of files) {
    if (text.includes(rel)) referenced.push(rel);
    else if (unreadable.length === 0 && nowMs - mtimeMs > maxAgeDays * DAY_MS && isCandidate(rel)) unreferencedOld.push(rel);
  }
  referenced.sort();
  unreferencedOld.sort();
  if (unreadable.length > 0) return { referenced, unreferencedOld, warning: unreadableWarning(unreadable) };
  return { referenced, unreferencedOld };
}

/**
 * `referenced`: scratch files a tracked document points at (durability warning list);
 * `unreferencedOld`: sweep candidates older than 14 days and unreferenced -- never a file under
 * scratch/dispatch/, a file git tracks, or anything the physical scratch boundary refuses (a live
 * plugin root, a link, a multiply-linked file); empty, with a `warning`, whenever the references
 * cannot be known (no git, or a tracked reference document that exists but cannot be read).
 */
export function assessScratchDurability({ root, now = new Date() } = {}) {
  return assess(root, now, DEFAULT_MAX_AGE_DAYS);
}

/** A PLAN only: the sweep candidates that are old enough and unreferenced (see assessScratchDurability). Never deletes. */
export function planSweep({ root, now = new Date(), maxAgeDays = DEFAULT_MAX_AGE_DAYS } = {}) {
  const result = assess(root, now, maxAgeDays);
  const plan = { delete: result.unreferencedOld };
  if (result.warning) plan.warning = result.warning;
  return plan;
}
