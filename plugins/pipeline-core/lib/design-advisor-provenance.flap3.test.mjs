// SPDX-License-Identifier: SUL-1.0
// FLAP3: bounded re-observation of the one confirmed transient class
// (DAP-PHYSICAL-PARENT-DRIFT, a sibling write in an ancestor directory between the
// ancestor walk and the ancestor re-check). Everything else must stay fail-closed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as provenance from './design-advisor-provenance.mjs';

const reobserve = provenance.reobserveAdvisorPhysicalDrift;
const parentDrift = () => new Error('DAP-PHYSICAL-PARENT-DRIFT');

function harness(script) {
  const state = {calls: 0, sleeps: []};
  const read = () => {
    const step = script[Math.min(state.calls, script.length - 1)];
    state.calls++;
    if (step instanceof Error) throw step;
    return step;
  };
  return {state, read, options: {sleep: ms => state.sleeps.push(ms)}};
}

test('the re-observation helper is exported', () => {
  assert.equal(typeof reobserve, 'function');
});

test('a read that succeeds first time is not retried and never sleeps', () => {
  const h = harness([Buffer.from('ok')]);
  assert.deepEqual(reobserve(h.read, h.options), Buffer.from('ok'));
  assert.equal(h.state.calls, 1);
  assert.deepEqual(h.state.sleeps, []);
});

test('two ancestor-drift observations then a clean one return the clean bytes (3 calls, 50 then 100 ms)', () => {
  const h = harness([parentDrift(), parentDrift(), Buffer.from('stable')]);
  assert.deepEqual(reobserve(h.read, h.options), Buffer.from('stable'));
  assert.equal(h.state.calls, 3);
  assert.deepEqual(h.state.sleeps, [50, 100]);
});

test('persistent ancestor drift is re-thrown unchanged after exactly 3 attempts', () => {
  const h = harness([parentDrift()]);
  assert.throws(() => reobserve(h.read, h.options), error => error.message === 'DAP-PHYSICAL-PARENT-DRIFT');
  assert.equal(h.state.calls, 3);
  assert.deepEqual(h.state.sleeps, [50, 100]);
});

test('every other failure class is re-thrown immediately with no retry (fail-closed)', () => {
  const coded = (code, message) => Object.assign(new Error(message ?? code), {code});
  for (const error of [
    new Error('DAP-PHYSICAL-DRIFT'),
    new Error('DAP-PHYSICAL-OPEN'),
    new Error('DAP-PHYSICAL-FILE'),
    new Error('DAP-PHYSICAL-ESCAPE'),
    new Error('DAP-PHYSICAL-BOUND'),
    new Error('DAP-UTF8'),
    new Error('DAP-PHYSICAL-INPUT'),
    new Error('DAP-PHYSICAL-PARENT'),
    coded('EBUSY'), coded('EPERM'), coded('EACCES'), coded('ENOENT'),
    coded('ETIMEDOUT', 'spawnSync git ETIMEDOUT'),
  ]) {
    const h = harness([error]);
    assert.throws(() => reobserve(h.read, h.options), e => e === error, error.message);
    assert.equal(h.state.calls, 1, error.message);
    assert.deepEqual(h.state.sleeps, [], error.message);
  }
});

test('a different failure after a drift observation stops the retry series at once', () => {
  const h = harness([parentDrift(), new Error('DAP-PHYSICAL-DRIFT'), Buffer.from('never')]);
  assert.throws(() => reobserve(h.read, h.options), error => error.message === 'DAP-PHYSICAL-DRIFT');
  assert.equal(h.state.calls, 2);
  assert.deepEqual(h.state.sleeps, [50]);
});

test('readAdvisorPhysicalBytes still reads a physical file and still fails closed on a missing one', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'flap3-unit-')));
  try {
    mkdirSync(join(root, 'evidence'));
    writeFileSync(join(root, 'evidence', 'pkg.json'), '{"a":1}\n');
    assert.deepEqual(provenance.readAdvisorPhysicalBytes(root, 'evidence/pkg.json'), Buffer.from('{"a":1}\n'));
    assert.throws(() => provenance.readAdvisorPhysicalBytes(root, 'evidence/missing.json'), error => error.code === 'ENOENT');
    assert.throws(() => provenance.readAdvisorPhysicalBytes(root, '../escape.json'), error => error.message === 'DAP-PHYSICAL-INPUT');
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});
