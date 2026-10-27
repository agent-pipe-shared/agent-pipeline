// SPDX-License-Identifier: SUL-1.0
// NMIR: the native-goldfish namespace read is reused only while every file is provably unchanged, outside the racy window,
// and younger than the max age. A rewrite, a fresh write, or an elapsed age always reads the files again.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readNativeManagedInventory } from './native-managed-authority-support.mjs';
import { inspectSignedDescriptorCustodyRepository } from './worktree-lifecycle.mjs';

const linuxOnly = { skip: process.platform !== 'linux' && 'the signature reuse is POSIX-only' };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const hex = c => c.repeat(64);
const ownerRecord = bindingChar => ({ schema: 'pipeline.native-goldfish-authority-owner.v1', pendingSha256: hex('a'), association: { state: 'unbound', target: null }, bindingSha256: hex(bindingChar) });

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'native-inventory-reuse-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = args => execFileSync('git', args, { cwd: root, timeout: 10000, maxBuffer: 524288, stdio: ['ignore', 'pipe', 'pipe'] });
  git(['init', '--quiet']);
  git(['-c', 'user.email=fixture@example.invalid', '-c', 'user.name=Synthetic fixture', 'commit', '--allow-empty', '--quiet', '-m', 'pin']);
  const repository = inspectSignedDescriptorCustodyRepository(root);
  const directory = join(repository.commonDir, 'agent-pipeline/run/native-goldfish-host-commit');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, `authority-owner-${hex('b')}.json`);
  const write = bindingChar => writeFileSync(file, JSON.stringify(ownerRecord(bindingChar)), { mode: 0o600 });
  write('c');
  return { repository, write };
}
// Short windows keep the suite fast; the production defaults are 2 s (racy) and 1 s (max age).
const fast = { reuseRacyMs: 300, reuseMaxAgeMs: 5000 };

test('NMIR01 an unchanged namespace outside the racy window is read once and reused', linuxOnly, async t => {
  const { repository } = fixture(t);
  await sleep(450);
  const first = readNativeManagedInventory(repository, 'native-goldfish', fast);
  const second = readNativeManagedInventory(repository, 'native-goldfish', fast);
  assert.equal(second, first);
  assert.equal(first[0].entries.length, 1);
});

test('NMIR02 a rewrite of the same size is never served from the earlier read', linuxOnly, async t => {
  const { repository, write } = fixture(t);
  await sleep(450);
  const first = readNativeManagedInventory(repository, 'native-goldfish', fast);
  assert.equal(first[0].entries[0].value.bindingSha256, hex('c'));
  write('d');
  const second = readNativeManagedInventory(repository, 'native-goldfish', fast);
  assert.notEqual(second, first);
  assert.equal(second[0].entries[0].value.bindingSha256, hex('d'));
});

test('NMIR03 a read taken inside the racy window is not reusable, so a same-tick rewrite is always seen', linuxOnly, t => {
  const { repository, write } = fixture(t);
  const first = readNativeManagedInventory(repository, 'native-goldfish', { reuseRacyMs: 60000, reuseMaxAgeMs: 60000 });
  write('e');
  const second = readNativeManagedInventory(repository, 'native-goldfish', { reuseRacyMs: 60000, reuseMaxAgeMs: 60000 });
  assert.notEqual(second, first);
  assert.equal(second[0].entries[0].value.bindingSha256, hex('e'));
});

test('NMIR04 a read older than the max age is repeated even when nothing changed', linuxOnly, async t => {
  const { repository } = fixture(t);
  await sleep(450);
  const first = readNativeManagedInventory(repository, 'native-goldfish', { reuseRacyMs: 300, reuseMaxAgeMs: 100 });
  await sleep(150);
  const second = readNativeManagedInventory(repository, 'native-goldfish', { reuseRacyMs: 300, reuseMaxAgeMs: 100 });
  assert.notEqual(second, first);
  assert.equal(second[0].entries.length, 1);
});

test('NMIR05 an added file changes the namespace signature and is read', linuxOnly, async t => {
  const { repository } = fixture(t);
  await sleep(450);
  const first = readNativeManagedInventory(repository, 'native-goldfish', fast);
  const directory = join(repository.commonDir, 'agent-pipeline/run/native-goldfish-host-commit');
  writeFileSync(join(directory, `authority-owner-${hex('f')}.json`), JSON.stringify(ownerRecord('1')), { mode: 0o600 });
  const second = readNativeManagedInventory(repository, 'native-goldfish', fast);
  assert.notEqual(second, first);
  assert.equal(second[0].entries.length, 2);
});
