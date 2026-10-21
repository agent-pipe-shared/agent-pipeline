// SPDX-License-Identifier: SUL-1.0
import {readinessFixture} from './codex-readiness-finalization.fixture.mjs';
import {runCodexToolFreeDesignReadiness} from './codex-tool-free-design-readiness.mjs';
import {unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, linkSync, chmodSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { canonicalJson } from './codex-sandbox-compatibility.mjs';
import { createCodexDesignReadinessHostStore } from './codex-design-readiness-host-store.mjs';
import { spawnManagedCodexHost } from './codex-host-process-supervisor.mjs';
import { hostDigest, readHostJournal } from './codex-host-process-journal.mjs';
import { verifyRegisteredCodexOwnership } from './codex-readiness-ownership-verifier.mjs';

const A = 'a'.repeat(64), B = 'b'.repeat(64), C = 'c'.repeat(40);
async function fixture(t) {
  const value = readinessFixture(t);
  const result = await runCodexToolFreeDesignReadiness(value.args);
  assert.equal(result.status, 'reviewed', JSON.stringify(result));
  const record = value.store.read(result.receiptId, result.expected).value;
  // A new immutable receipt must be checked before write; retain genuine
  // independent finalization but remove only this synthetic public store file.
  unlinkSync(join(value.store.processRoot, '..', 'receipts', result.receiptId + '.json'));
  return { ...value, record, expected: result.expected,
    managed: { directory: join(value.store.processRoot, 'codex-host-' + result.receiptId) } };
}

test('private store independently binds real closed ownership, with exact durable reads', async t => {
  const value = await fixture(t);
  const saved = value.store.write(value.record, value.expected);
  const first = value.store.read(value.record.receiptId, value.expected);
  const second = value.store.read(value.record.receiptId, value.expected);
  assert.equal(saved.directoryDurability, 'confirmed');
  assert.equal(saved.sha256, first.sha256); assert.equal(second.sha256, first.sha256);
  assert.equal(canonicalJson(first.value), canonicalJson(value.record));
  assert.equal(readHostJournal(value.managed.directory, 'intent').value.receiptId, value.record.receiptId);
  assert.throws(() => value.store.write(value.record, value.expected), { code: 'EEXIST' });
});
test('valid-looking caller ownership cannot substitute for registered process evidence', async t => {
  const value = await fixture(t);
  for (const field of ['intentReceiptSha256', 'boundProcessReceiptSha256', 'terminalReceiptSha256']) {
    const forged = structuredClone(value.record), expected = structuredClone(value.expected);
    forged.ownership[field] = expected.ownership[field] = B;
    assert.throws(() => value.store.write(forged, expected), { code: 'CRHS-RECORD-OR-OWNERSHIP-INVALID' });
  }
  const alias = structuredClone(value.record); alias.receiptId = `drh_${'f'.repeat(32)}`;
  assert.throws(() => value.store.write(alias, value.expected), { code: 'CRHS-RECORD-OR-OWNERSHIP-INVALID' });
});
test('different source/candidate coordinates, missing expectations and weak assurance are rejected', async t => {
  const value = await fixture(t);
  const wrongCandidate = structuredClone(value.expected); wrongCandidate.candidate.tree = 'd'.repeat(40);
  const wrongSource = structuredClone(value.expected); wrongSource.sources.prd.sha256 = B;
  for (const expected of [wrongCandidate, wrongSource, undefined, {}]) {
    assert.throws(() => value.store.write(value.record, expected), { code: 'CRHS-RECORD-OR-OWNERSHIP-INVALID' });
  }
  const inflated = structuredClone(value.record); inflated.isolation.nativeSubagent = true;
  assert.throws(() => value.store.write(inflated, value.expected), { code: 'CRHS-RECORD-OR-OWNERSHIP-INVALID' });
});
test('receipt hardlinks and nonprivate modes fail closed on read', async t => {
  const value = await fixture(t);
  const saved = value.store.write(value.record, value.expected);
  chmodSync(saved.path, 0o644);
  assert.equal(value.store.read(value.record.receiptId, value.expected), null);
  chmodSync(saved.path, 0o600);
  assert.notEqual(value.store.read(value.record.receiptId, value.expected), null);
  linkSync(saved.path, join(value.root, 'alias.json'));
  assert.equal(value.store.read(value.record.receiptId, value.expected), null);
});
test('drifted ownership chain invalidates an already stored receipt', async t => {
  const value = await fixture(t);
  value.store.write(value.record, value.expected);
  const path = join(value.managed.directory, 'exec-admission.json');
  const record = JSON.parse(readFileSync(path, 'utf8')); record.childSha256 = B;
  writeFileSync(path, canonicalJson(record));
  assert.equal(value.store.read(value.record.receiptId, value.expected), null);
});
test('private store rejects common-dir aliases before any write', t => {
  const root = mkdtempSync(join(tmpdir(), 'codex-private-path-fixture-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const common=join(root,'.git');mkdirSync(common,{mode:0o700});
  const alias=join(root,'alias');symlinkSync(common,alias);
  assert.throws(()=>createCodexDesignReadinessHostStore({gitCommonDir:alias,repoFingerprint:A}),{code:'CRHS-COMMON-DIR'});
});

// AC-134: the receipt reader is bounded, and it checks that the opened descriptor is the path it statted.
import fs, { appendFileSync, renameSync, statSync, unlinkSync as removeFile } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const LINUX = process.platform === 'linux' ? false
  : 'host-limitation: the private readiness receipt store is linux-only; owner Coordinator, due 2026-11-04 (Linux/WSL run)';
const LIMIT = 524288;
// Observe, never replace: the store's named fs imports are live bindings of the builtin, so
// syncBuiltinESMExports publishes these pass-through wrappers to it for the duration of one call.
function observeReader(hooks = {}) {
  const real = { alloc: Buffer.alloc, readSync: fs.readSync, openSync: fs.openSync, fstatSync: fs.fstatSync };
  const seen = { allocs: [], reads: [], opened: new Map(), restore() { Buffer.alloc = real.alloc; Object.assign(fs, { readSync: real.readSync, openSync: real.openSync, fstatSync: real.fstatSync }); syncBuiltinESMExports(); } };
  Buffer.alloc = function (size, ...rest) { seen.allocs.push(size); return real.alloc.call(this, size, ...rest); };
  fs.openSync = function (path, ...rest) { hooks.beforeOpen?.(path); const fd = real.openSync.call(this, path, ...rest); seen.opened.set(fd, path); return fd; };
  fs.fstatSync = function (fd, ...rest) { const stat = real.fstatSync.call(this, fd, ...rest); hooks.afterFstat?.(seen.opened.get(fd), fd, stat); return stat; };
  fs.readSync = function (fd, ...rest) { const count = real.readSync.call(this, fd, ...rest); seen.reads.push({ fd, path: seen.opened.get(fd), length: rest[2], count }); hooks.afterRead?.(seen.opened.get(fd), fd); return count; };
  syncBuiltinESMExports();
  return seen;
}
function observed(run, hooks) { const seen = observeReader(hooks); try { seen.result = run(); } finally { seen.restore(); } return seen; }
const receiptReads = (seen, path) => seen.reads.filter(entry => entry.path === path);

test('receipt reader refuses a stat-declared oversize file before it allocates or reads, and reads with a cap-plus-one buffer otherwise', { skip: LINUX }, async t => {
  const value = await fixture(t), saved = value.store.write(value.record, value.expected), original = readFileSync(saved.path);
  const read = () => value.store.read(value.record.receiptId, value.expected);
  // Control: a genuine receipt is read through the real 524,288-byte cap plus exactly one overflow byte, twice (double read).
  const control = observed(read);
  assert.notEqual(control.result, null);
  // The journal readers behind ownership share the same bound, so allocations cannot be attributed to the receipt alone;
  // the receipt's own descriptor is attributed through its reads.
  assert.ok(control.allocs.filter(size => size === LIMIT + 1).length >= 2, 'a 524,289-byte buffer exists for each checked receipt read');
  const controlReads = receiptReads(control, saved.path);
  assert.ok(controlReads.length >= 2 && controlReads[0].length === LIMIT + 1, 'the receipt read asks for exactly the cap plus one byte');
  assert.ok(controlReads.every(entry => entry.length <= LIMIT + 1), 'no receipt read asks for more than the cap plus one byte');
  // Stat boundary: 524,289 declared bytes are refused before any buffer exists or any byte is read.
  writeFileSync(saved.path, Buffer.alloc(LIMIT + 1, 0x20));
  assert.equal(statSync(saved.path).size, LIMIT + 1);
  const oversize = observed(read);
  assert.equal(oversize.result, null);
  assert.equal(oversize.allocs.includes(LIMIT + 1), false, 'no read buffer is allocated for a stat-declared oversize file');
  assert.equal(receiptReads(oversize, saved.path).length, 0, 'no byte of the oversize file is read');
  // Exactly at the limit the stat gate admits it (non-JSON content is then refused by the parser, not by the size gate).
  writeFileSync(saved.path, Buffer.alloc(LIMIT, 0x20));
  const atLimit = observed(read);
  assert.equal(atLimit.result, null);
  assert.ok(atLimit.allocs.includes(LIMIT + 1), 'a file exactly at the limit passes the stat gate and gets the cap-plus-one buffer');
  writeFileSync(saved.path, original);
  assert.notEqual(read(), null, 'restoring the genuine bytes restores the receipt');
});

test('receipt reader never reads more than the cap plus one byte even when the file grows after the stat', { skip: LINUX }, async t => {
  const value = await fixture(t), saved = value.store.write(value.record, value.expected), ino = BigInt(statSync(saved.path).ino);
  const growth = Buffer.alloc(2 * LIMIT, 0x20);
  let grown = false;
  const seen = observed(() => value.store.read(value.record.receiptId, value.expected), {
    afterFstat(path, _fd, stat) { if (!grown && path === saved.path && BigInt(stat.ino) === ino) { grown = true; appendFileSync(saved.path, growth); } },
  });
  assert.equal(grown, true, 'the file really grew between the identity stat and the read');
  assert.equal(seen.result, null, 'a file that outgrows the cap is refused');
  assert.ok(statSync(saved.path).size > LIMIT + 1);
  const reads = receiptReads(seen, saved.path);
  assert.equal(reads.reduce((total, entry) => total + entry.count, 0), LIMIT + 1, 'exactly the cap plus one overflow byte is consumed, never the whole grown file');
  assert.ok(reads.every(entry => entry.length <= LIMIT + 1));
  assert.equal(seen.allocs.some(size => size > LIMIT + 1), false);
});

test('receipt reader checks descriptor-to-path identity at open, after the read, and refuses a symlinked path', { skip: LINUX }, async t => {
  for (const point of ['before-open', 'after-read', 'symlink']) {
    const value = await fixture(t), saved = value.store.write(value.record, value.expected), bytes = readFileSync(saved.path);
    const read = () => value.store.read(value.record.receiptId, value.expected);
    const replacement = join(value.root, `replacement-${point}.json`), originalIno = statSync(saved.path).ino;
    // Byte-identical, owner-private, single-link content: only the identity of the inode can differ.
    writeFileSync(replacement, bytes, { mode: 0o600 }); chmodSync(replacement, 0o600);
    assert.notEqual(read(), null, `${point}: the genuine receipt reads before any swap`);
    if (point === 'symlink') {
      removeFile(saved.path); symlinkSync(replacement, saved.path);
      assert.equal(read(), null, 'a symlink to a byte-identical receipt is refused');
      continue;
    }
    let swapped = false;
    const swap = () => { if (!swapped) { swapped = true; renameSync(replacement, saved.path); } };
    const seen = observed(read, point === 'before-open'
      ? { beforeOpen(path) { if (path === saved.path) swap(); } }
      : { afterRead(path) { if (path === saved.path) swap(); } });
    assert.equal(swapped, true, `${point}: the path was swapped at the injected point`);
    assert.notEqual(statSync(saved.path).ino, originalIno, `${point}: the path now names a different inode`);
    assert.equal(seen.result, null, `${point}: a different inode behind the same path is refused`);
    assert.notEqual(read(), null, `${point}: the swapped-in bytes are themselves valid, so the refusal was identity, not content`);
  }
});
