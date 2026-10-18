// SPDX-License-Identifier: SUL-1.0
// Source target: plugins/pipeline-core/lib/agy-central-snapshot.mjs
//
// Per-user central agy snapshot (design note specs/sprint-alfred-epic/design/agy-snapshot-central-2026-10-08.md, section 3).
// Layout, next to the machine plane file:
//   <anchor dir>/agy-snapshot/plugin-<snapshotSha256>/   the copied plugin tree plus snapshot.json
//   <anchor dir>/agy-snapshot/current.json               the pointer ({schema, snapshotSha256, version, publishedAt})
// snapshotSha256 is the sha256 of the exact bytes of snapshot.json, so every manifest field is part of the digest.
// Failures are thrown Errors carrying `.code` (AGS-*); agySnapshotRoot and classifyAgySnapshot never throw.
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, rmSync, unlinkSync, writeFileSync, writeSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { machinePlaneFilePath } from './machine-plane.mjs';
import { fsyncDirectoryDurable } from './fs-durability.mjs';
import { hardenWindowsPrivateDirectory } from './windows-private-state.mjs';

const SNAPSHOT_SCHEMA = 'pipeline.agy-snapshot.v1';
const POINTER_SCHEMA = 'pipeline.agy-snapshot-current.v1';
const OWNER_SCHEMA = 'pipeline.agy-snapshot-temp-owner.v1';
const OWNER_NAME = 'pipeline-core';
const OWNER_FILE = '.snapshot-temp-owner.json';
const MANIFEST = 'snapshot.json';
const POINTER = 'current.json';
const DIGEST = /^[a-f0-9]{64}$/;
const DIGEST_DIR = /^plugin-[a-f0-9]{64}$/;
const TEMP_DIR = /^plugin-tmp-[a-f0-9]{16}$/;
const EXCLUDED_DIRS = new Set(['.git', 'tests', 'fixtures']);
const MAX_FILES = 8192;
const DEFAULT_BUDGET_MS = 80000;
const LOCK_FILE = 'publish.lock';
const LOCK_SCHEMA = 'pipeline.agy-snapshot-publish-lock.v1';
const RECLAIM_MARKER = `${LOCK_FILE}.reclaim`;
const RECLAIM_SCHEMA = 'pipeline.agy-snapshot-publish-lock-reclaim.v1';
const LOCK_STALE_MS = 2 * DEFAULT_BUDGET_MS;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;

function fail(code, detail) {
  return Object.assign(new Error(detail ? `${code}: ${detail}` : code), { code });
}
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const isWin = () => process.platform === 'win32';

/** `<anchor dir>/agy-snapshot` or null; the anchor is derived only through machinePlaneFilePath. */
export function agySnapshotRoot(deps = {}) {
  const plane = machinePlaneFilePath(deps);
  return plane === null ? null : join(dirname(plane), 'agy-snapshot');
}
function requireRoot(deps) {
  const root = agySnapshotRoot(deps);
  if (root === null) throw fail('AGS-ANCHOR-UNRESOLVED');
  return root;
}

// ---- source inventory -------------------------------------------------------------------------------------------------
// Whole plugin tree minus .git, tests/, fixtures/ and *.test.mjs. A symlink is refused, never skipped.
// One source file, read the way git-hook-footprint reads a physical file: refuse a hardlink (nlink !== 1) and anything above
// 1 MiB (32 MiB across the inventory) BEFORE reading, open without following a symlink where the platform has O_NOFOLLOW,
// require the fd to be the object the earlier lstat saw (dev/ino/nlink), and detect growth or a swap during the read.
// deps.afterSourceOpen(absolutePath, relativePath) is a test seam: called once per file after the descriptor was opened and
// fstat-ed and before the first read.
function readSourceFile(path, relPath, pre, budget, deps) {
  if (!pre.isFile() || pre.nlink !== 1) throw fail('AGS-SOURCE-UNSAFE', relPath);
  if (pre.size > MAX_FILE_BYTES || budget.used + pre.size > MAX_TOTAL_BYTES) throw fail('AGS-SOURCE-TOO-LARGE', relPath);
  let fd;
  try { fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)); } catch (e) {
    if (e?.code === 'ELOOP' || e?.code === 'EMLINK') throw fail('AGS-SOURCE-UNSAFE', relPath);
    throw e;
  }
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.nlink !== 1 || before.dev !== pre.dev || before.ino !== pre.ino) throw fail('AGS-SOURCE-UNSAFE', relPath);
    if (before.size !== pre.size) throw fail('AGS-SOURCE-DRIFT', relPath);
    if (typeof deps?.afterSourceOpen === 'function') deps.afterSourceOpen(path, relPath);
    // The fstat length plus one sentinel byte: growth past it is still seen, and no maximum-size buffer is touched per file.
    const buffer = Buffer.alloc(before.size + 1);
    let count = 0;
    while (count < buffer.length) {
      const n = readSync(fd, buffer, count, buffer.length - count, null);
      if (n === 0) break;
      count += n;
    }
    if (count !== before.size) throw fail('AGS-SOURCE-DRIFT', relPath);
    const after = fstatSync(fd);
    const now = lstatSync(path);
    if (now.isSymbolicLink() || now.dev !== after.dev || now.ino !== after.ino || now.nlink !== 1) throw fail('AGS-SOURCE-UNSAFE', relPath);
    if (after.size !== count || now.size !== count || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) throw fail('AGS-SOURCE-DRIFT', relPath);
    budget.used += count;
    return buffer.subarray(0, count);
  } finally { closeSync(fd); }
}
function readSourceInventory(sourceRoot, deps = {}) {
  const items = [];
  const budget = { used: 0 };
  const walk = (dir, rel) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const path = join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw fail('AGS-SOURCE-SYMLINK', relPath);
      if (stat.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name)) walk(path, relPath);
      } else if (stat.isFile()) {
        if (entry.name.endsWith('.test.mjs')) continue;
        const bytes = readSourceFile(path, relPath, stat, budget, deps);
        items.push({ path: relPath, sha256: sha256(bytes), bytes });
        if (items.length > MAX_FILES) throw fail('AGS-SOURCE-TOO-LARGE');
      } else {
        throw fail('AGS-SOURCE-SPECIAL-FILE', relPath);
      }
    }
  };
  walk(sourceRoot, '');
  items.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return items;
}
const publicRows = (items) => items.map(({ path, sha256: digest }) => ({ path, sha256: digest }));

function versionOf(items) {
  const row = items.find((item) => item.path === 'plugin.json');
  let version;
  try { version = JSON.parse(row.bytes.toString('utf8')).version; } catch { version = undefined; }
  if (typeof version !== 'string' || !/^\d+(\.\d+)*/.test(version)) throw fail('AGS-SOURCE-INVALID', 'plugin.json version');
  return version;
}
function compareVersions(a, b) {
  const parts = (v) => v.split(/[-+]/)[0].split('.').map((n) => Number.parseInt(n, 10) || 0);
  const left = parts(a);
  const right = parts(b);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

// ---- verification -----------------------------------------------------------------------------------------------------
function listTree(root, allowOwnerFile) {
  const files = [];
  const walk = (dir, rel) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      const stat = lstatSync(join(dir, entry.name));
      if (stat.isSymbolicLink()) throw fail('AGS-SNAPSHOT-FOREIGN', `symlink ${relPath}`);
      if (stat.isDirectory()) walk(join(dir, entry.name), relPath);
      else if (stat.isFile()) files.push(relPath);
      else throw fail('AGS-SNAPSHOT-FOREIGN', `special ${relPath}`);
    }
  };
  walk(root, '');
  return files.filter((f) => f !== MANIFEST && !(allowOwnerFile && f === OWNER_FILE)).sort();
}
function safeRelative(path) {
  return typeof path === 'string' && path !== '' && !path.includes('\\') && !path.includes('\0') && !path.startsWith('/') && !/^[A-Za-z]:/.test(path)
    && !path.split('/').some((s) => s === '' || s === '.' || s === '..');
}
function verifyTree(root, snapshotSha256, allowOwnerFile) {
  if (typeof snapshotSha256 !== 'string' || !DIGEST.test(snapshotSha256)) throw fail('AGS-SNAPSHOT-FOREIGN', 'digest');
  let stat;
  try { stat = lstatSync(root); } catch (e) {
    if (e?.code === 'ENOENT' || e?.code === 'ENOTDIR') throw fail('AGS-SNAPSHOT-MISSING');
    throw fail('AGS-SNAPSHOT-FOREIGN', 'root unreadable');
  }
  if (!stat.isDirectory()) throw fail('AGS-SNAPSHOT-FOREIGN', 'root not a directory');
  try {
    const raw = readFileSync(join(root, MANIFEST));
    if (sha256(raw) !== snapshotSha256) throw fail('AGS-SNAPSHOT-FOREIGN', 'manifest digest');
    const manifest = JSON.parse(raw.toString('utf8'));
    if (manifest === null || typeof manifest !== 'object' || Object.keys(manifest).sort().join('|') !== 'inventory|owner|schema') throw fail('AGS-SNAPSHOT-FOREIGN', 'manifest keys');
    if (manifest.schema !== SNAPSHOT_SCHEMA) throw fail('AGS-SNAPSHOT-FOREIGN', 'schema');
    if (manifest.owner !== OWNER_NAME) throw fail('AGS-SNAPSHOT-FOREIGN', 'owner');
    const inventory = manifest.inventory;
    if (!Array.isArray(inventory) || inventory.length > MAX_FILES) throw fail('AGS-SNAPSHOT-FOREIGN', 'inventory');
    const paths = inventory.map((row) => row?.path);
    if (inventory.some((row) => !row || Object.keys(row).sort().join('|') !== 'path|sha256' || !safeRelative(row.path) || !DIGEST.test(row.sha256))
      || new Set(paths).size !== paths.length || JSON.stringify(paths) !== JSON.stringify([...paths].sort())) throw fail('AGS-SNAPSHOT-FOREIGN', 'inventory rows');
    const onDisk = listTree(root, allowOwnerFile);
    if (JSON.stringify(onDisk) !== JSON.stringify(paths)) throw fail('AGS-SNAPSHOT-FOREIGN', 'file set');
    for (const row of inventory) {
      if (sha256(readFileSync(join(root, row.path))) !== row.sha256) throw fail('AGS-SNAPSHOT-FOREIGN', `content ${row.path}`);
    }
    return { manifest, version: versionFromDisk(root) };
  } catch (e) {
    if (typeof e?.code === 'string' && e.code.startsWith('AGS-')) throw e;
    throw fail('AGS-SNAPSHOT-FOREIGN', 'unreadable');
  }
}
function versionFromDisk(root) {
  try { return JSON.parse(readFileSync(join(root, 'plugin.json'), 'utf8')).version ?? null; } catch { return null; }
}
export function verifyAgySnapshot({ root, snapshotSha256 } = {}) {
  const { version } = verifyTree(root, snapshotSha256, false);
  return { status: 'verified', root, snapshotSha256, version };
}

// ---- pointer ----------------------------------------------------------------------------------------------------------
function readPointerState(root) {
  const path = join(root, POINTER);
  let raw;
  try { raw = readFileSync(path, 'utf8'); } catch (e) {
    return e?.code === 'ENOENT' ? { state: 'absent', pointer: null, raw: null } : { state: 'invalid', pointer: null, raw: null };
  }
  try {
    const pointer = JSON.parse(raw);
    if (pointer?.schema === POINTER_SCHEMA && typeof pointer.snapshotSha256 === 'string' && DIGEST.test(pointer.snapshotSha256)) return { state: 'ok', pointer, raw };
  } catch { /* falls through to invalid */ }
  return { state: 'invalid', pointer: null, raw };
}
/** The parsed current pointer, or null when absent or invalid. Never throws. */
export function readCurrentAgySnapshot(deps = {}) {
  const root = agySnapshotRoot(deps);
  return root === null ? null : readPointerState(root).pointer;
}
function syncFile(path) {
  const fd = openSync(path, isWin() ? 'r+' : 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
function writeSyncedFile(path, bytes) {
  const fd = openSync(path, 'wx', 0o600);
  try {
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
    fsyncSync(fd);
  } finally { closeSync(fd); }
}
// One directory flush, at every publish call site. deps.fsyncDirectoryFn(directory) replaces fsyncDirectoryDurable (test
// seam) and returns its outcome: only 'confirmed' and 'unsupported' (the win32 tolerance) are success; anything else fails
// the publish with a typed error, so a pointer never moves over a directory entry whose flush was not confirmed.
function flushDirectory(directory, deps) {
  const flush = typeof deps?.fsyncDirectoryFn === 'function' ? deps.fsyncDirectoryFn : fsyncDirectoryDurable;
  const outcome = flush(directory);
  if (outcome !== 'confirmed' && outcome !== 'unsupported') throw fail('AGS-DIRECTORY-FSYNC', `outcome ${typeof outcome === 'string' ? outcome : 'unknown'}`);
}
/** Temp + fsync + readback + preimage check + rename. The old pointer stays intact on every failure. */
export function setCurrentAgySnapshot({ snapshotSha256 } = {}, deps = {}) {
  const root = requireRoot(deps);
  const { version } = verifyTree(join(root, `plugin-${snapshotSha256}`), snapshotSha256, false);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const path = join(root, POINTER);
  const before = readPointerState(root);
  const pointer = { schema: POINTER_SCHEMA, snapshotSha256, version, publishedAt: new Date().toISOString() };
  const temporary = `${path}.tmp-${randomBytes(8).toString('hex')}`;
  try {
    writeSyncedFile(temporary, Buffer.from(`${JSON.stringify(pointer, null, 2)}\n`));
    const readback = typeof deps.readbackFn === 'function' ? deps.readbackFn(temporary) : JSON.parse(readFileSync(temporary, 'utf8'));
    if (readback?.snapshotSha256 !== snapshotSha256 || readback?.schema !== POINTER_SCHEMA) throw fail('AGS-POINTER-READBACK');
    if (typeof deps.beforePointerWrite === 'function') deps.beforePointerWrite(path);
    const now = readPointerState(root);
    if (now.raw !== before.raw) throw fail('AGS-POINTER-DRIFT');
    renameSync(temporary, path);
  } catch (e) {
    try { unlinkSync(temporary); } catch { /* nothing to remove */ }
    throw e;
  }
  flushDirectory(root, deps);
  return pointer;
}

// ---- publish ----------------------------------------------------------------------------------------------------------
function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e?.code !== 'ESRCH'; }
}
// Only a temp directory whose owner file names a dead pid is swept; anything else is retained.
function sweepStaleTemps(root) {
  let names;
  try { names = readdirSync(root).filter((n) => TEMP_DIR.test(n)); } catch { return; }
  for (const name of names) {
    try {
      const owner = JSON.parse(readFileSync(join(root, name, OWNER_FILE), 'utf8'));
      if (owner?.schema === OWNER_SCHEMA && Number.isSafeInteger(owner.pid) && owner.pid > 0 && !pidAlive(owner.pid)) rmSync(join(root, name), { recursive: true, force: true });
    } catch { /* uncertain ownership: retain */ }
  }
}
function pruneSnapshots(root, keep) {
  for (const name of readdirSync(root)) {
    if (DIGEST_DIR.test(name) && !keep.has(name.slice('plugin-'.length))) rmSync(join(root, name), { recursive: true, force: true });
  }
}

// Publish lock: <root>/publish.lock = {schema, pid, startedAt}, created exclusively (wx) when a publish starts and removed
// when it ends, ok or not. A lock whose owner pid is dead is reclaimed (the temp sweep's liveness rule); a live owner
// refuses AGS-PUBLISH-BUSY with no change. A lock of uncertain ownership (unreadable, a directory, unknown shape) is
// retained until it is older than twice the publish budget, so a crash between create and write cannot wedge publishing for
// good. AGS-PUBLISH-BUSY names the lock path relative to the snapshot root and the owner pid when the owner is live.
//
// Reclaiming a lock judged stale is exclusive: <root>/publish.lock.reclaim is created with wx by the one reclaimer that acts
// (a fresh marker means another reclaimer is acting, so this publisher yields; one older than twice the publish budget was
// left by a crashed reclaimer and is removed). Under the marker the lock is judged again, and only the exact lock that was
// judged stale is deleted - a lock that changed in the meantime is never touched and the publisher yields. The lock path is
// never emptied by a rename-and-restore, so no third publisher can acquire in a window the reclaimer opened.
// deps.afterLockObserved(lockPath) is a test seam: called after the lock was judged stale and before any reclaim step.
function createLockFile(path, bytes) {
  let fd;
  try { fd = openSync(path, 'wx', 0o600); } catch (e) {
    if (e?.code === 'EEXIST') return false;
    throw e;
  }
  try {
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
    fsyncSync(fd);
  } catch (e) {
    try { closeSync(fd); } catch { /* nothing to close */ }
    try { unlinkSync(path); } catch { /* nothing to remove */ }
    throw e;
  }
  closeSync(fd);
  return true;
}
/** null when there is no lock; otherwise {stamp, pid, live}. `stamp` identifies exactly what was judged. */
function observeLock(path) {
  let raw = null;
  try { raw = readFileSync(path, 'utf8'); } catch (e) { if (e?.code === 'ENOENT') return null; }
  if (raw !== null) {
    try {
      const lock = JSON.parse(raw);
      if (lock?.schema === LOCK_SCHEMA && Number.isSafeInteger(lock.pid) && lock.pid > 0) return { stamp: raw, pid: lock.pid, live: pidAlive(lock.pid) };
    } catch { /* uncertain ownership: judged by age below */ }
  }
  try {
    const stat = lstatSync(path);
    return { stamp: raw ?? `unreadable:${stat.dev}:${stat.ino}:${stat.mtimeMs}`, pid: null, live: Date.now() - stat.mtimeMs < LOCK_STALE_MS };
  } catch { return null; }
}
function busy(pid, note) {
  const held = Number.isSafeInteger(pid) ? `${LOCK_FILE} held by pid ${pid}` : `${LOCK_FILE} held`;
  return fail('AGS-PUBLISH-BUSY', note ? `${held}; ${note}` : held);
}
function removeLockPath(path) {
  try {
    if (lstatSync(path).isDirectory()) rmSync(path, { recursive: true, force: true });
    else unlinkSync(path);
  } catch { /* retained: the next attempt judges it again */ }
}
function releaseReclaimMarker(markerPath, markerRaw) {
  try { if (readFileSync(markerPath, 'utf8') === markerRaw) unlinkSync(markerPath); } catch { /* already gone or taken over: nothing of ours */ }
}
// Returns normally when the caller should look at the lock again; throws AGS-PUBLISH-BUSY when this publisher must yield.
function reclaimStaleLock(path, held) {
  const markerPath = `${path}.reclaim`;
  const markerRaw = `${JSON.stringify({ schema: RECLAIM_SCHEMA, pid: process.pid, nonce: randomBytes(8).toString('hex'), startedAt: new Date().toISOString() })}\n`;
  if (!createLockFile(markerPath, Buffer.from(markerRaw))) {
    let seen;
    try { seen = lstatSync(markerPath); } catch { return; }
    if (Date.now() - seen.mtimeMs < LOCK_STALE_MS) throw busy(null, `reclaim in progress (${RECLAIM_MARKER})`);
    try { if (lstatSync(markerPath).mtimeMs === seen.mtimeMs) unlinkSync(markerPath); } catch { /* retained: the next attempt judges it again */ }
    return;
  }
  try {
    const again = observeLock(path);
    if (again === null) return;
    if (again.live || again.stamp !== held.stamp) throw busy(again.live ? again.pid : null, 'the lock changed while it was being reclaimed');
    removeLockPath(path);
  } finally { releaseReclaimMarker(markerPath, markerRaw); }
}
function acquirePublishLock(root, deps = {}) {
  const path = join(root, LOCK_FILE);
  const raw = `${JSON.stringify({ schema: LOCK_SCHEMA, pid: process.pid, startedAt: new Date().toISOString() })}\n`;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (createLockFile(path, Buffer.from(raw))) {
      return () => { try { if (readFileSync(path, 'utf8') === raw) unlinkSync(path); } catch { /* already gone or taken over: nothing of ours */ } };
    }
    const held = observeLock(path);
    if (held === null) continue;
    if (held.live) throw busy(held.pid);
    if (typeof deps.afterLockObserved === 'function') deps.afterLockObserved(path);
    reclaimStaleLock(path, held);
  }
  throw busy(null);
}

export function publishAgySnapshot({ sourcePluginRoot, attestationSourceRoot, deps = {}, timeBudgetMs = DEFAULT_BUDGET_MS } = {}) {
  const root = requireRoot(deps);
  if (typeof sourcePluginRoot !== 'string' || sourcePluginRoot === '' || typeof attestationSourceRoot !== 'string' || attestationSourceRoot === '') throw fail('AGS-SOURCE-INVALID', 'roots');
  const deadline = Date.now() + (Number.isFinite(timeBudgetMs) && timeBudgetMs > 0 ? Math.min(timeBudgetMs, DEFAULT_BUDGET_MS) : DEFAULT_BUDGET_MS);
  const budget = () => { if (Date.now() > deadline) throw fail('AGS-TIME-BUDGET'); };

  const first = readSnapshotInventory(sourcePluginRoot, deps);
  const version = versionOf(first);
  const manifestBytes = Buffer.from(`${JSON.stringify({ schema: SNAPSHOT_SCHEMA, owner: OWNER_NAME, inventory: publicRows(first) })}\n`);
  const snapshotSha256 = sha256(manifestBytes);
  const name = `plugin-${snapshotSha256}`;
  const destination = join(root, name);

  mkdirSync(root, { recursive: true, mode: 0o700 });
  const release = acquirePublishLock(root, deps);
  try {
    // Everything below runs under the publish lock: the pointer read, the downgrade check and the prune keep-set all come
    // from reads taken while no lock-respecting publisher can move the pointer.
    const locked = readPointerState(root).pointer;
    const refuseDowngrade = (pointer) => {
      if (pointer && typeof pointer.version === 'string' && compareVersions(version, pointer.version) < 0) throw fail('AGS-DOWNGRADE-REFUSED', `${version} < ${pointer.version}`);
    };
    refuseDowngrade(locked);
    sweepStaleTemps(root);
    const assertSourceUnchanged = () => {
      budget();
      const second = readSnapshotInventory(sourcePluginRoot, deps);
      if (JSON.stringify(publicRows(second)) !== JSON.stringify(publicRows(first))) throw fail('AGS-SOURCE-DRIFT');
    };

    let published = false;
    try { lstatSync(destination); published = true; } catch { published = false; }
    if (!published) {
      const temporary = join(root, `plugin-tmp-${randomBytes(8).toString('hex')}`);
      mkdirSync(temporary, { mode: 0o700 });
      try {
        if (isWin() && hardenWindowsPrivateDirectory(temporary).status !== 'secure') throw fail('AGS-PRIVATE-MODE');
        writeSyncedFile(join(temporary, OWNER_FILE), Buffer.from(`${JSON.stringify({ schema: OWNER_SCHEMA, pid: process.pid, nonce: randomBytes(16).toString('hex') })}\n`));
        const directories = new Set([temporary]);
        for (const item of first) {
          budget();
          const target = join(temporary, ...item.path.split('/'));
          if (!directories.has(dirname(target))) {
            mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
            let d = dirname(target);
            while (d.length > temporary.length) { directories.add(d); d = dirname(d); }
          }
          writeSyncedFile(target, item.bytes);
        }
        writeSyncedFile(join(temporary, MANIFEST), manifestBytes);
        verifyTree(temporary, snapshotSha256, true);
        if (typeof deps.betweenSourcePasses === 'function') deps.betweenSourcePasses(sourcePluginRoot);
        assertSourceUnchanged();
        if (typeof deps.beforeRename === 'function') deps.beforeRename(temporary);
        for (const dir of [...directories].sort((a, b) => b.length - a.length)) flushDirectory(dir, deps);
        if (typeof deps.afterDirectoryFsync === 'function') deps.afterDirectoryFsync(temporary);
        // A same-version publisher that reached the rename first leaves a digest directory with these exact bytes: verify it
        // and converge on it instead of renaming over it.
        const converged = () => {
          try { lstatSync(destination); } catch { return false; }
          verifyTree(destination, snapshotSha256, false);
          return true;
        };
        let renamed = false;
        if (!converged()) {
          // The owner file goes immediately before the rename, so a crash anywhere earlier leaves a temp the sweep can attribute.
          unlinkSync(join(temporary, OWNER_FILE));
          if (typeof deps.beforeRenameCall === 'function') deps.beforeRenameCall(temporary);
          try { renameSync(temporary, destination); renamed = true; } catch (e) { if (!converged()) throw e; }
        }
        if (!renamed) rmSync(temporary, { recursive: true, force: true });
      } catch (e) {
        try { rmSync(temporary, { recursive: true, force: true }); } catch { /* retained for the next sweep */ }
        throw e;
      }
      flushDirectory(root, deps);
    } else {
      verifyTree(destination, snapshotSha256, false);
      assertSourceUnchanged();
    }

    // Re-read once more immediately before moving the pointer: a pointer that now names a newer version is never overwritten.
    const latest = readPointerState(root).pointer;
    refuseDowngrade(latest);
    if (latest?.snapshotSha256 !== snapshotSha256) {
      setCurrentAgySnapshot({ snapshotSha256 }, deps);
      const keep = new Set([snapshotSha256]);
      for (const pointer of [locked, latest]) if (pointer) keep.add(pointer.snapshotSha256);
      pruneSnapshots(root, keep);
    }
    return { root: destination, snapshotSha256, version };
  } finally {
    release();
  }
}

// ---- classification ---------------------------------------------------------------------------------------------------
function retainedDigests(root) {
  try { return readdirSync(root).filter((n) => DIGEST_DIR.test(n)).map((n) => n.slice('plugin-'.length)); } catch { return []; }
}
/** {status: current|missing|stale|foreign|unverifiable, code}. Never throws. */
export function classifyAgySnapshot({ observation = {}, deps = {} } = {}) {
  try {
    const root = agySnapshotRoot(deps);
    if (root === null) return { status: 'unverifiable', code: 'AGS-ANCHOR-UNRESOLVED' };
    const { state, pointer } = readPointerState(root);
    if (state === 'absent') return { status: 'missing', code: 'AGS-SNAPSHOT-MISSING' };
    if (state === 'invalid') return { status: 'foreign', code: 'AGS-SNAPSHOT-FOREIGN' };
    try { verifyTree(join(root, `plugin-${pointer.snapshotSha256}`), pointer.snapshotSha256, false); } catch (e) {
      return e?.code === 'AGS-SNAPSHOT-MISSING' ? { status: 'missing', code: 'AGS-SNAPSHOT-MISSING' } : { status: 'foreign', code: 'AGS-SNAPSHOT-FOREIGN' };
    }
    const managed = observation?.managedCopySha256;
    if (typeof managed === 'string' && managed !== pointer.snapshotSha256) {
      return retainedDigests(root).includes(managed) ? { status: 'stale', code: 'AGS-SNAPSHOT-STALE' } : { status: 'foreign', code: 'AGS-SNAPSHOT-FOREIGN' };
    }
    const attested = observation?.attestedSourceSnapshotSha256;
    if (typeof attested === 'string' && attested !== pointer.snapshotSha256) return { status: 'stale', code: 'AGS-SNAPSHOT-STALE' };
    return { status: 'current', code: null };
  } catch {
    return { status: 'unverifiable', code: 'AGS-SNAPSHOT-UNVERIFIABLE' };
  }
}

// ---- Antigravity runner view ------------------------------------------------------------------------------------------
// Antigravity 1.4.2 `plugin validate` rejects `model: sonnet` / `model: haiku` in agents/*.md, while Claude Code needs them in
// the same shared files. The global install therefore validates and installs a GENERATED copy: byte-identical to the approved
// source (tests included) except the single frontmatter `model:` line of agents/*.md, rewritten through ONE closed table.
// Every comparison of the managed copy with the approved source goes through this deterministic transform, never through the
// raw source bytes. It is not the central snapshot: that one drops tests/ and *.test.mjs and exceeds the view's byte-identity.
// Layout: <anchor dir>/agy-runner-view/view-<viewSha256>/ - the tree IS the plugin, no manifest file is added to it.
// The table is PO decision D13 (Antigravity model tier mapping): sonnet and haiku run on the flash tier, opus on the pro tier.
// `inherit` is not a target, and every other `model:` value (inherit, flash, pro, any full model id) is a typed refusal.
export const AGY_RUNNER_MODEL_MAP = Object.freeze({ sonnet: 'flash', haiku: 'flash', opus: 'pro' });
const VIEW_DIR = 'agy-runner-view';
const VIEW_MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const AGENT_FILE = /^agents\/[^/]+\.md$/;

/** The bytes the runner view carries for `relPath`: the same Buffer object when nothing changes, a typed AGV-* refusal otherwise. */
export function transformAgyRunnerAgent(relPath, bytes) {
  if (!AGENT_FILE.test(relPath)) return bytes;
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) throw fail('AGV-AGENT-ENCODING', relPath);
  const lines = text.split('\n');
  if (lines[0].replace(/\r$/, '') !== '---') return bytes;
  const close = lines.findIndex((line, index) => index > 0 && line.replace(/\r$/, '') === '---');
  if (close === -1) return bytes;
  const hits = [];
  for (let index = 1; index < close; index++) if (/^model:/.test(lines[index])) hits.push(index);
  if (hits.length === 0) return bytes;
  if (hits.length > 1) throw fail('AGV-AGENT-MODEL-AMBIGUOUS', relPath);
  const match = /^model:[ \t]*(.*?)[ \t]*(\r?)$/.exec(lines[hits[0]]);
  if (!match || !Object.hasOwn(AGY_RUNNER_MODEL_MAP, match[1])) throw fail('AGV-AGENT-MODEL-UNMAPPED', relPath);
  lines[hits[0]] = `model: ${AGY_RUNNER_MODEL_MAP[match[1]]}${match[2]}`;
  return Buffer.from(lines.join('\n'), 'utf8');
}

// The whole tree, no exclusions. readSourceFile keeps its physical checks and its 1 MiB per-file cap; its running total is
// reset per file because the view enforces its own total cap (the topology's 64 MiB bound) here.
function readViewTree(root, deps) {
  const items = [];
  const budget = { used: 0 };
  let total = 0;
  const walk = (dir, rel) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw fail('AGS-SOURCE-SYMLINK', relPath);
      if (stat.isDirectory()) walk(path, relPath);
      else if (stat.isFile()) {
        budget.used = 0;
        const bytes = readSourceFile(path, relPath, stat, budget, deps);
        total += bytes.length;
        if (total > VIEW_MAX_TOTAL_BYTES || items.length >= MAX_FILES) throw fail('AGS-SOURCE-TOO-LARGE', relPath);
        items.push({ path: relPath, sha256: sha256(bytes), bytes });
      } else throw fail('AGS-SOURCE-SPECIAL-FILE', relPath);
    }
  };
  walk(root, '');
  return items.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
const withRunnerAgentBytes = (item) => {
  const bytes = transformAgyRunnerAgent(item.path, item.bytes);
  return bytes === item.bytes ? item : { path: item.path, sha256: sha256(bytes), bytes };
};
/** The deterministic transform of a source tree: the exact inventory its runner view must carry. */
export function buildAgyRunnerViewInventory(sourcePluginRoot, deps = {}) {
  return readViewTree(sourcePluginRoot, deps).map(withRunnerAgentBytes);
}
// The central snapshot is installed into Antigravity as well, so it carries the same model lines as the runner view: the
// transform runs before the inventory is digested, which keeps snapshot.json describing the bytes actually written (verifyTree
// still compares every file on disk with its inventory row) and keeps the two source passes comparable.
function readSnapshotInventory(sourceRoot, deps) {
  return readSourceInventory(sourceRoot, deps).map(withRunnerAgentBytes);
}
const viewDigest = (items) => sha256(Buffer.from(JSON.stringify(publicRows(items))));
const sameRows = (left, right) => JSON.stringify(publicRows(left)) === JSON.stringify(publicRows(right));
const viewMatches = (root, items, deps) => { try { return sameRows(readViewTree(root, deps), items); } catch { return false; } };

/** `<anchor dir>/agy-runner-view` or null; the anchor is derived only through the snapshot root, hence machinePlaneFilePath. */
export function agyRunnerViewRoot(deps = {}) {
  const snapshotRoot = agySnapshotRoot(deps);
  return snapshotRoot === null ? null : join(dirname(snapshotRoot), VIEW_DIR);
}

/** Throws AGV-VIEW-MISMATCH unless the physical tree at `viewRoot` (a view or an installed copy of it) is exactly the transform of the source. */
export function assertAgyRunnerViewMatchesSource({ sourcePluginRoot, viewRoot, deps = {} } = {}) {
  const expected = buildAgyRunnerViewInventory(sourcePluginRoot, deps);
  if (!viewMatches(viewRoot, expected, deps)) throw fail('AGV-VIEW-MISMATCH');
  return { viewSha256: viewDigest(expected), version: versionOf(expected) };
}

/** Generate (or converge on) the runner view of `sourcePluginRoot`: temp tree, readback, source re-read, rename. A foreign tree at the digest path is refused, never overwritten. */
export function publishAgyRunnerView({ sourcePluginRoot, deps = {} } = {}) {
  const base = agyRunnerViewRoot(deps);
  if (base === null) throw fail('AGS-ANCHOR-UNRESOLVED');
  if (typeof sourcePluginRoot !== 'string' || sourcePluginRoot === '') throw fail('AGV-SOURCE-INVALID', 'root');
  const items = buildAgyRunnerViewInventory(sourcePluginRoot, deps);
  const version = versionOf(items);
  const viewSha256 = viewDigest(items);
  const destination = join(base, `view-${viewSha256}`);
  let present = true;
  try { lstatSync(destination); } catch (e) { if (e?.code !== 'ENOENT') throw e; present = false; }
  if (present) {
    if (!viewMatches(destination, items, deps)) throw fail('AGV-VIEW-FOREIGN');
    return { root: destination, viewSha256, version };
  }
  mkdirSync(base, { recursive: true, mode: 0o700 });
  const temporary = join(base, `view-tmp-${randomBytes(8).toString('hex')}`);
  mkdirSync(temporary, { mode: 0o700 });
  try {
    for (const item of items) {
      const target = join(temporary, ...item.path.split('/'));
      mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
      writeSyncedFile(target, item.bytes);
    }
    if (viewDigest(buildAgyRunnerViewInventory(sourcePluginRoot, deps)) !== viewSha256) throw fail('AGV-SOURCE-DRIFT');
    if (!viewMatches(temporary, items, deps)) throw fail('AGV-VIEW-MISMATCH');
    try { renameSync(temporary, destination); } catch (e) {
      if (!viewMatches(destination, items, deps)) throw e;
      rmSync(temporary, { recursive: true, force: true });
    }
  } catch (e) {
    try { rmSync(temporary, { recursive: true, force: true }); } catch { /* retained: a stale view-tmp directory is harmless */ }
    throw e;
  }
  flushDirectory(base, deps);
  return { root: destination, viewSha256, version };
}

const VIEW_NAME = /^view-([a-f0-9]{64})$/;
/** The view digest a physical tree has: the sha that names its `view-<sha>` directory. Throws a typed AGS-* code on an unsafe tree. */
export function agyRunnerViewDigestOfTree(root, deps = {}) {
  return viewDigest(readViewTree(root, deps));
}
// The `view-<sha>` directory a path lies in or on, or null when the path is outside the view base.
function viewNameWithin(base, path) {
  if (typeof path !== 'string' || path === '') return null;
  const rel = relative(base, resolve(path));
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  return rel.split(sep)[0];
}

/**
 * Bounded storage: remove the runner views the Pipeline created and nothing references any more.
 * `keepPaths` are the roots (or paths inside them) the caller observed as still referenced - the view just installed, registry
 * entries, import sources; `keepDigests` are view digests an installed copy has. A directory is removed only when ALL of these hold: it is a real
 * directory (not a link) directly under the view base, it is named `view-<64 hex>`, and its own content digests to that very name,
 * which only a view this module published can do. Anything else - view-tmp-* leftovers, a foreign or edited directory, a file -
 * is retained untouched. Returns the names removed and retained; one failing directory never stops the others.
 */
export function pruneAgyRunnerViews({ keepPaths = [], keepDigests = [], deps = {} } = {}) {
  const removed = [];
  const retained = [];
  const base = agyRunnerViewRoot(deps);
  if (base === null) return { removed, retained };
  let names;
  try { names = readdirSync(base); } catch (e) {
    if (e?.code === 'ENOENT') return { removed, retained };
    throw e;
  }
  const keep = new Set([...keepPaths.map((path) => viewNameWithin(base, path)).filter((name) => name !== null), ...keepDigests.map((digest) => `view-${digest}`)]);
  for (const name of names.sort()) {
    const match = VIEW_NAME.exec(name);
    if (match === null) continue;
    if (keep.has(name)) { retained.push(name); continue; }
    try {
      const path = join(base, name);
      if (!lstatSync(path).isDirectory() || viewDigest(readViewTree(path, deps)) !== match[1]) { retained.push(name); continue; }
      rmSync(path, { recursive: true, force: true });
      removed.push(name);
    } catch { retained.push(name); }
  }
  return { removed, retained };
}
