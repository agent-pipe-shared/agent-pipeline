// SPDX-License-Identifier: SUL-1.0
// Source target: plugins/pipeline-core/lib/agy-central-snapshot.mjs
//
// Per-user central agy snapshot (design note specs/sprint-alfred-epic/design/agy-snapshot-central-2026-10-08.md, section 3).
// Layout, next to the machine plane file:
//   <anchor dir>/agy-snapshot/plugin-<snapshotSha256>/   the copied plugin tree plus snapshot.json
//   <anchor dir>/agy-snapshot/current.json               the pointer ({schema, snapshotSha256, version, publishedAt})
// snapshotSha256 is the sha256 of the exact bytes of snapshot.json, so every manifest field is part of the digest.
// Failures are thrown Errors carrying `.code` (AGS-*); agySnapshotRoot and classifyAgySnapshot never throw.
import { closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, unlinkSync, writeFileSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';
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
function readSourceInventory(sourceRoot) {
  const items = [];
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
        const bytes = readFileSync(path);
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
  fsyncDirectoryDurable(root);
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

export function publishAgySnapshot({ sourcePluginRoot, attestationSourceRoot, deps = {}, timeBudgetMs = DEFAULT_BUDGET_MS } = {}) {
  const root = requireRoot(deps);
  if (typeof sourcePluginRoot !== 'string' || sourcePluginRoot === '' || typeof attestationSourceRoot !== 'string' || attestationSourceRoot === '') throw fail('AGS-SOURCE-INVALID', 'roots');
  const deadline = Date.now() + (Number.isFinite(timeBudgetMs) && timeBudgetMs > 0 ? Math.min(timeBudgetMs, DEFAULT_BUDGET_MS) : DEFAULT_BUDGET_MS);
  const budget = () => { if (Date.now() > deadline) throw fail('AGS-TIME-BUDGET'); };

  const first = readSourceInventory(sourcePluginRoot);
  const version = versionOf(first);
  const manifestBytes = Buffer.from(`${JSON.stringify({ schema: SNAPSHOT_SCHEMA, owner: OWNER_NAME, inventory: publicRows(first) })}\n`);
  const snapshotSha256 = sha256(manifestBytes);
  const name = `plugin-${snapshotSha256}`;
  const destination = join(root, name);

  const existing = readPointerState(root).pointer;
  if (existing && typeof existing.version === 'string' && compareVersions(version, existing.version) < 0) throw fail('AGS-DOWNGRADE-REFUSED', `${version} < ${existing.version}`);

  mkdirSync(root, { recursive: true, mode: 0o700 });
  sweepStaleTemps(root);
  const assertSourceUnchanged = () => {
    budget();
    const second = readSourceInventory(sourcePluginRoot);
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
      unlinkSync(join(temporary, OWNER_FILE));
      for (const dir of [...directories].sort((a, b) => b.length - a.length)) fsyncDirectoryDurable(dir);
      renameSync(temporary, destination);
    } catch (e) {
      try { rmSync(temporary, { recursive: true, force: true }); } catch { /* retained for the next sweep */ }
      throw e;
    }
    fsyncDirectoryDurable(root);
  } else {
    verifyTree(destination, snapshotSha256, false);
    assertSourceUnchanged();
  }

  if (existing?.snapshotSha256 !== snapshotSha256) {
    setCurrentAgySnapshot({ snapshotSha256 }, deps);
    const keep = new Set([snapshotSha256]);
    if (existing) keep.add(existing.snapshotSha256);
    pruneSnapshots(root, keep);
  }
  return { root: destination, snapshotSha256, version };
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
