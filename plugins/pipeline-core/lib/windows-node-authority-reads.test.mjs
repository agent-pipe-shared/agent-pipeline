// SPDX-License-Identifier: SUL-1.0
// C19I-W239 (AC-108, PO decision 2026-11-06): on Windows the private read and inspect observations are answered in Node (lstat identity,
// symlink/junction refusal, final-path equality, before/after identity and hash of a read) instead of one powershell.exe start each, native
// PowerShell stays for create / publish / remove, and the ancestor chain is observed natively only at the boundary roots. The native helper is
// not runnable on Linux, so every case drives the backend through its platform/spawn test seam (`nodeReads: true` selects the Node answers; a
// seam with a spawn and no such flag keeps the native answers the older memo cases rely on) with a fake spawn that counts what still starts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, parse, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as backend from './windows-owned-authority-backend.mjs';
import * as owner from './session-authority-domain-owner.mjs';

const FACTS = /^[0-9]+:[0-9]+:[0-9]+:[0-9]+:[0-9]+:(?:directory|[0-9]+:[0-9]+):[0-9]+:[0-9]+:(?:directory|[0-9]+:[0-9]+):[a-f0-9]{64}$/u;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function nativeFacts(path, directory) {
  const s = lstatSync(path, { bigint: true }), ino = BigInt.asUintN(64, s.ino);
  return [s.dev, ino >> 32n, ino & 0xffffffffn, s.nlink, 32, ...(directory ? ['directory'] : [0, s.size]), 1, 2, ...(directory ? ['directory'] : [3, 4]), 'b'.repeat(64)].join(':');
}

// Fake native helper: answers like the real one would for a real temp tree and records every operation that still starts.
function fixture(run, { nodeReads = true, afterFirstPass } = {}) {
  const dir = join(realpathSync(tmpdir()), `c19i-node-reads-${process.pid}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  const calls = [];
  const spawn = (_executable, _args, options) => {
    const request = JSON.parse(options.input);
    calls.push(request.operation);
    const reply = (body, status = 0) => ({ status, signal: null, stderr: '', stdout: JSON.stringify(body) });
    const refuse = (code) => reply({ ok: false, code, committed: false }, 1);
    switch (request.operation) {
      case 'read': case 'read-source': return reply({ ok: true, facts: nativeFacts(request.path, false), bytes: readFileSync(request.path).toString('base64'), committed: false });
      case 'inspect': return reply({ ok: true, facts: nativeFacts(request.path, request.directory), bytes: null, committed: false });
      case 'ancestor': case 'ancestor-above-root': return reply({ ok: true, facts: nativeFacts(request.path, true), bytes: null, committed: false });
      case 'create-directory': mkdirSync(request.path); return reply({ ok: true, facts: nativeFacts(request.path, true), bytes: null, committed: true });
      case 'publish':
        if (request.expectedFacts === null ? existsSync(request.path) : request.expectedFacts !== nativeFacts(request.path, false)) return refuse(request.expectedFacts === null ? 'WIN-AUTH-EXPECTED-ABSENT' : 'WIN-AUTH-CAS');
        writeFileSync(request.path, Buffer.from(request.bytes, 'base64'));
        return reply({ ok: true, facts: nativeFacts(request.path, false), bytes: null, committed: true });
      case 'remove':
        if (request.expectedFacts !== nativeFacts(request.path, false)) return refuse('WIN-AUTH-CAS');
        unlinkSync(request.path);
        return reply({ ok: true, facts: 'removed', bytes: null, committed: true });
      default: return refuse('WIN-AUTH-OPERATION');
    }
  };
  backend.setWindowsOwnedAuthorityBackendTestSeam({ platform: 'win32', spawn, nodeReads, afterFirstPass });
  backend.resetWindowsOwnedAuthorityBackendMemo();
  try { return run({ dir, calls, file: join(dir, 'a.txt') }); }
  finally { backend.setWindowsOwnedAuthorityBackendTestSeam(undefined); backend.resetWindowsOwnedAuthorityBackendMemo(); rmSync(dir, { recursive: true, force: true }); }
}
const refused = (fn, reason) => assert.throws(fn, (error) => error.name === 'SessionAuthorityError' && error.reason === reason, `expected ${reason}`);

test('NR01 a private read and an inspect are answered in Node: no native start, facts of the native shape, bytes and digests intact', () => fixture(({ dir, calls, file }) => {
  writeFileSync(file, 'hello');
  const before = backend.nativeAuthorityStats().count;
  const read = backend.readWindowsOwnedAuthorityFile({ path: file, maxBytes: 100 });
  const file1 = backend.inspectWindowsOwnedAuthorityPath({ path: file, directory: false });
  const directory = backend.inspectWindowsOwnedAuthorityPath({ path: dir, directory: true });
  assert.deepEqual(calls, [], 'no operation starts PowerShell');
  assert.equal(backend.nativeAuthorityStats().count, before);
  assert.deepEqual(read.bytes, Buffer.from('hello'));
  for (const facts of [read.nativeFacts, file1.nativeFacts, directory.nativeFacts]) assert.match(facts, FACTS);
  assert.equal(read.nativeFacts, file1.nativeFacts, 'a read and an inspect of the unchanged file agree');
  assert.equal(read.nativeFactsSha256, sha256(read.nativeFacts));
  const s = lstatSync(file, { bigint: true }), parts = read.nativeFacts.split(':');
  assert.equal(BigInt(parts[0]), s.dev);
  assert.equal((BigInt(parts[1]) << 32n) + BigInt(parts[2]), s.ino, 'device and file id join the lstat identity');
  writeFileSync(file, 'hello!');
  assert.notEqual(backend.inspectWindowsOwnedAuthorityPath({ path: file, directory: false }).nativeFacts, read.nativeFacts, 'a changed file changes its facts');
}));

test('NR02 a symlink, a link to a directory and a file below a linked directory are refused by read and inspect', () => fixture(({ dir, calls, file }) => {
  writeFileSync(file, 'x');
  const link = join(dir, 'link.txt');
  symlinkSync(file, link);
  refused(() => backend.readWindowsOwnedAuthorityFile({ path: link, maxBytes: 100 }), 'WIN-AUTH-ALIAS');
  refused(() => backend.inspectWindowsOwnedAuthorityPath({ path: link, directory: false }), 'WIN-AUTH-ALIAS');
  const real = join(dir, 'real');
  mkdirSync(real);
  writeFileSync(join(real, 'b.txt'), 'y');
  const junction = join(dir, 'junction');
  symlinkSync(real, junction, 'junction');
  refused(() => backend.inspectWindowsOwnedAuthorityPath({ path: junction, directory: true }), 'WIN-AUTH-ALIAS');
  refused(() => backend.readWindowsOwnedAuthorityFile({ path: join(junction, 'b.txt'), maxBytes: 100 }), 'WIN-AUTH-ALIAS');
  assert.deepEqual(calls, [], 'refused in Node, nothing started');
}));

test('NR03 a hard-linked file, a wrong object kind, an oversize file and a missing file are refused with the native codes', () => fixture(({ dir, file }) => {
  writeFileSync(file, 'abcdef');
  linkSync(file, join(dir, 'twin.txt'));
  refused(() => backend.readWindowsOwnedAuthorityFile({ path: file, maxBytes: 100 }), 'WIN-AUTH-ALIAS');
  const single = join(dir, 'single.txt');
  writeFileSync(single, 'abcdef');
  refused(() => backend.inspectWindowsOwnedAuthorityPath({ path: single, directory: true }), 'WIN-AUTH-ALIAS');
  refused(() => backend.inspectWindowsOwnedAuthorityPath({ path: dir, directory: false }), 'WIN-AUTH-ALIAS');
  refused(() => backend.readWindowsOwnedAuthorityFile({ path: single, maxBytes: 3 }), 'WIN-AUTH-SIZE');
  try { backend.readWindowsOwnedAuthorityFile({ path: join(dir, 'absent.txt'), maxBytes: 100 }); assert.fail('absent file read'); } catch (error) {
    assert.equal(error.reason, 'WIN-AUTH-OPEN');
    assert.equal(error.failedPath, join(dir, 'absent.txt'), 'the failed path rides on the refusal as it did natively');
  }
}));

test('NR04 a file replaced or rewritten while it is read is refused by the before/after identity and the second pass', () => {
  let swap;
  fixture(({ file }) => {
    writeFileSync(file, 'first');
    swap = () => writeFileSync(file, 'other contents of a different size');
    refused(() => backend.readWindowsOwnedAuthorityFile({ path: file, maxBytes: 100 }), 'WIN-AUTH-RACE');
    swap = () => { const before = readFileSync(file); writeFileSync(file, Buffer.from(before.map((b) => b ^ 1))); };
    writeFileSync(file, 'sixsix');
    refused(() => backend.readWindowsOwnedAuthorityFile({ path: file, maxBytes: 100 }), 'WIN-AUTH-RACE');
  }, { afterFirstPass: () => swap() });
});

test('NR05 publish, create and remove still start PowerShell; a compare-and-swap publish and a remove first take the native facts of the current file', () => fixture(({ dir, calls, file }) => {
  const created = backend.createWindowsOwnedAuthorityDirectory({ path: join(dir, 'sub') });
  assert.deepEqual(calls, ['create-directory']);
  assert.match(created.nativeFacts, FACTS);
  assert.equal(created.nativeFacts, backend.inspectWindowsOwnedAuthorityPath({ path: join(dir, 'sub'), directory: true }).nativeFacts, 'the create returns the facts a later inspect sees');
  calls.length = 0;
  const first = backend.createWindowsOwnedAuthorityExclusiveFile({ path: file, bytes: Buffer.from('one') });
  assert.deepEqual(calls, ['publish'], 'an exclusive create is one native start');
  assert.equal(first.committed, true);
  assert.equal(first.nativeFacts, backend.readWindowsOwnedAuthorityFile({ path: file, maxBytes: 100 }).nativeFacts, 'publish returns the facts the next read sees (publication read-back)');
  calls.length = 0;
  const witness = backend.readWindowsOwnedAuthorityFile({ path: file, maxBytes: 100 });
  const second = backend.publishWindowsOwnedAuthorityFile({ path: file, bytes: Buffer.from('two!'), expectedSha256: sha256('one'), expectedFacts: witness.nativeFacts });
  assert.deepEqual(calls, ['read', 'publish'], 'the swap takes the native facts once, then publishes');
  assert.equal(readFileSync(file, 'utf8'), 'two!');
  assert.equal(second.nativeFacts, backend.readWindowsOwnedAuthorityFile({ path: file, maxBytes: 100 }).nativeFacts);
  calls.length = 0;
  const removed = backend.removeWindowsOwnedAuthorityFile({ path: file, expectedSha256: sha256('two!'), expectedFacts: second.nativeFacts });
  assert.deepEqual(calls, ['read', 'remove']);
  assert.equal(removed.nativeFacts, 'removed');
  assert.equal(existsSync(file), false);
}));

test('NR06 a publish or remove against a file that changed since the witness is refused in Node before anything is published', () => fixture(({ calls, file }) => {
  writeFileSync(file, 'one');
  const witness = backend.readWindowsOwnedAuthorityFile({ path: file, maxBytes: 100 });
  writeFileSync(file, 'one but changed');
  calls.length = 0;
  refused(() => backend.publishWindowsOwnedAuthorityFile({ path: file, bytes: Buffer.from('x'), expectedSha256: witness.nativeFactsSha256.replace(/./u, '0'), expectedFacts: witness.nativeFacts }), 'WIN-AUTH-CAS');
  refused(() => backend.publishWindowsOwnedAuthorityFile({ path: file, bytes: Buffer.from('x'), expectedSha256: sha256('one'), expectedFacts: witness.nativeFacts }), 'WIN-AUTH-CAS');
  refused(() => backend.removeWindowsOwnedAuthorityFile({ path: file, expectedSha256: sha256('one'), expectedFacts: witness.nativeFacts }), 'WIN-AUTH-CAS');
  assert.equal(calls.includes('publish') || calls.includes('remove'), false, 'no native mutation started');
  assert.equal(readFileSync(file, 'utf8'), 'one but changed');
}));

test('NR07 the ancestor and read-source observations still start PowerShell, and the Node answers need the Windows platform', () => fixture(({ dir, calls, file }) => {
  writeFileSync(file, 'src');
  backend.observeWindowsAuthorityAncestor({ path: dir });
  backend.readWindowsAuthoritySourceModule({ path: file, maxBytes: 100 });
  assert.deepEqual(calls, ['ancestor', 'read-source']);
  backend.setWindowsOwnedAuthorityBackendTestSeam({ platform: 'linux', spawn: () => assert.fail('no start'), nodeReads: true });
  refused(() => backend.readWindowsOwnedAuthorityFile({ path: file, maxBytes: 100 }), 'WIN-AUTH-PLATFORM-UNAVAILABLE');
  refused(() => backend.inspectWindowsOwnedAuthorityPath({ path: file, directory: false }), 'WIN-AUTH-PLATFORM-UNAVAILABLE');
}));

// ---- O1a: the ancestor chain is observed natively only at the boundary roots ----
function chainFixture(run) {
  return fixture(({ dir, calls }) => {
    const repo = join(dir, 'repo'), authority = join(repo, '.git', 'agent-pipeline'), state = join(authority, 'state', 'leaf');
    mkdirSync(state, { recursive: true });
    return run({ dir, calls, repo, authority, state });
  });
}

test('NR08 the chain starts the native ancestor observation only for the repository root and the .git agent-pipeline root', () => chainFixture(({ calls, repo, authority, state }) => {
  assert.equal(typeof owner.observedWindowsChain, 'function');
  const result = owner.observedWindowsChain(state, repo);
  assert.equal(result.present, true);
  const names = calls.filter((name) => name === 'ancestor' || name === 'ancestor-above-root');
  assert.equal(names.length, 2, `native ancestor observations: ${calls.join(',')}`);
  const withFacts = result.rows.filter((row) => row.nativeFactsSha256 !== undefined);
  assert.equal(withFacts.length, 2);
  assert.ok(result.rows.length > 4, 'every component still has a row from the JS lstat');
  assert.deepEqual(result.rows.filter((row) => row.nativeFactsSha256 === undefined).every((row) => typeof row.pathSha256 === 'string' && row.identity.ino !== undefined), true);
  const depth = (target) => relative(parse(target).root, target).split(sep).length; // row 0 is the file-system root
  assert.deepEqual(result.rows.flatMap((row, at) => (row.nativeFactsSha256 === undefined ? [] : [at])), [depth(repo), depth(authority)], 'the native rows are the repository root and the .git agent-pipeline root');
  assert.deepEqual(owner.observedWindowsChain(state, repo), result, 'a second walk yields identical rows');
}));

test('NR09 with no repository boundary only the .git agent-pipeline root starts anything; a plugin-root boundary is a boundary root', () => chainFixture(({ calls, state }) => {
  owner.observedWindowsChain(state, null);
  assert.equal(calls.filter((name) => name.startsWith('ancestor')).length, 1, 'with no repository root only the .git agent-pipeline root is observed');
  calls.length = 0;
  // A source module under the plugin root is read with the plugin root as the boundary (readModuleContext derives it): the one native observation.
  const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const result = owner.observedWindowsChain(join(pluginRoot, 'lib'), pluginRoot);
  assert.equal(calls.filter((name) => name.startsWith('ancestor')).length, 1, 'the plugin root is the one native observation');
  assert.deepEqual(result.rows.flatMap((row, at) => (row.nativeFactsSha256 === undefined ? [] : [at])), [relative(parse(pluginRoot).root, pluginRoot).split(sep).length]);
}));

test('NR10 an intermediate component that is a link or not a directory is still refused by the JS lstat', () => chainFixture(({ dir, calls, repo }) => {
  const real = join(dir, 'real-mid');
  mkdirSync(join(real, 'deep'), { recursive: true });
  symlinkSync(real, join(repo, 'mid'), 'junction');
  refused(() => owner.observedWindowsChain(join(repo, 'mid', 'deep'), repo), 'domain-ancestor-unsafe');
  writeFileSync(join(repo, 'plain'), 'x');
  refused(() => owner.observedWindowsChain(join(repo, 'plain', 'deep'), repo), 'domain-ancestor-unsafe');
  assert.equal(calls.filter((name) => name.startsWith('ancestor')).length <= 2, true, 'at most the repository root of each of the two walks started anything');
}));
