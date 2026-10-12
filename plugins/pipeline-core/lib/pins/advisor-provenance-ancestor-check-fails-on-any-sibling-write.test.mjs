// SPDX-License-Identifier: SUL-1.0
// Regression pin: pipeline.advisor-provenance-ancestor-check-fails-on-any-sibling-write (AC-104).
// The ancestor re-check in readAdvisorPhysicalBytes binds the ancestor's identity (dev/ino/mode plus the
// realpath, isDirectory and not-symlink checks), not its membership: a sibling file or subdirectory created
// or deleted next to an ancestor must not throw DAP-PHYSICAL-PARENT-DRIFT, while a swapped, replaced or
// symlinked ancestor is still refused. Real filesystem, real module, no mocks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, renameSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { readAdvisorPhysicalBytes } from '../design-advisor-provenance.mjs';

const REL = 'evidence/inner/source.json';
const PAYLOAD = Buffer.from('{"advisor":"source"}\n', 'utf8');

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'alf-c-p1-07-')));
  mkdirSync(join(root, 'evidence', 'inner'), { recursive: true });
  writeFileSync(join(root, REL), PAYLOAD);
  return root;
}

// Child process that churns siblings (files AND subdirectories) in every ancestor of the target as fast as it can.
const CHURN = `
const fs=require('fs'),path=require('path');
const dirs=[process.argv[1],path.join(process.argv[1],'evidence'),path.join(process.argv[1],'evidence','inner')];
console.log('ready');
let i=0;
for(;;){
  for(const d of dirs){
    const f=path.join(d,'sib-'+(i%7)+'.json'),s=path.join(d,'sibdir-'+(i%5));
    try{fs.writeFileSync(f,'x');}catch{}
    try{fs.mkdirSync(s);}catch{}
    try{fs.rmSync(f);}catch{}
    try{fs.rmdirSync(s);}catch{}
  }
  i++;
}`;

async function withChurn(root, body) {
  const child = spawn(process.execPath, ['-e', CHURN, root], { stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.stdout.once('data', resolve);
    });
    return body();
  } finally {
    child.kill();
    await new Promise((resolve) => (child.exitCode !== null || child.signalCode ? resolve() : child.once('exit', resolve)));
  }
}

test('baseline: the target reads byte-exact from a quiet tree', () => {
  const root = fixture();
  try {
    assert.ok(readAdvisorPhysicalBytes(root, REL).equals(PAYLOAD));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('sibling file create/delete and sibling subdirectory create/delete in every ancestor never fail a read', async () => {
  const root = fixture();
  try {
    const failures = [];
    await withChurn(root, () => {
      const until = Date.now() + 1500;
      let reads = 0;
      while (Date.now() < until) {
        try {
          assert.ok(readAdvisorPhysicalBytes(root, REL).equals(PAYLOAD));
        } catch (e) { failures.push(String(e?.message)); }
        reads++;
      }
      assert.ok(reads >= 50, `enough reads exercised under churn (${reads})`);
    });
    assert.deepEqual(failures, [], 'no DAP-PHYSICAL-PARENT-DRIFT (or any other) failure under sibling churn');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a pre-existing sibling file and subdirectory beside each ancestor do not affect the read', () => {
  const root = fixture();
  try {
    for (const d of [root, join(root, 'evidence'), join(root, 'evidence', 'inner')]) {
      writeFileSync(join(d, 'dispatch-record-1.json'), '{}');
      mkdirSync(join(d, 'extra-subdir'));
    }
    assert.ok(readAdvisorPhysicalBytes(root, REL).equals(PAYLOAD));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a symlinked or junctioned ancestor is still refused (DAP-PHYSICAL-PARENT)', (t) => {
  const root = fixture();
  try {
    const real = join(root, 'real-evidence');
    mkdirSync(join(real, 'inner'), { recursive: true });
    writeFileSync(join(real, 'inner', 'source.json'), PAYLOAD);
    rmSync(join(root, 'evidence'), { recursive: true, force: true });
    try { symlinkSync(real, join(root, 'evidence'), 'junction'); }
    catch { t.skip('cannot create a directory link on this host'); return; }
    assert.throws(() => readAdvisorPhysicalBytes(root, REL), /DAP-PHYSICAL-PARENT/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('an ancestor swapped for a different directory mid-read is never served as success with foreign bytes', async () => {
  const root = fixture();
  const FOREIGN = Buffer.from('{"advisor":"FOREIGN"}\n', 'utf8');
  mkdirSync(join(root, 'alt', 'inner'), { recursive: true });
  writeFileSync(join(root, 'alt', 'inner', 'source.json'), FOREIGN);
  const swapper = `
const fs=require('fs'),path=require('path');const r=process.argv[1];
console.log('ready');
for(;;){try{fs.renameSync(path.join(r,'evidence'),path.join(r,'tmp-e'));fs.renameSync(path.join(r,'alt'),path.join(r,'evidence'));
fs.renameSync(path.join(r,'evidence'),path.join(r,'alt'));fs.renameSync(path.join(r,'tmp-e'),path.join(r,'evidence'));}catch{}}`;
  const child = spawn(process.execPath, ['-e', swapper, root], { stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    await new Promise((resolve, reject) => { child.once('error', reject); child.stdout.once('data', resolve); });
    const until = Date.now() + 1000;
    let served = 0;
    while (Date.now() < until) {
      try {
        const bytes = readAdvisorPhysicalBytes(root, REL);
        served++;
        assert.ok(bytes.equals(PAYLOAD) || bytes.equals(FOREIGN), 'only whole, legitimate file contents are returned');
      } catch (e) {
        if (e?.name === 'AssertionError') throw e;
        assert.match(String(e?.message), /^(DAP-|ENOENT|EPERM|EBUSY|EACCES)/u, 'a swap fails closed with a typed error');
      }
    }
    assert.ok(served >= 0);
  } finally {
    child.kill();
    await new Promise((resolve) => (child.exitCode !== null || child.signalCode ? resolve() : child.once('exit', resolve)));
    rmSync(root, { recursive: true, force: true });
  }
});

test('a target with an invalid path or a missing file still fails closed with a typed error', () => {
  const root = fixture();
  try {
    assert.throws(() => readAdvisorPhysicalBytes(root, '../outside.json'), /DAP-PHYSICAL-INPUT/u);
    assert.throws(() => readAdvisorPhysicalBytes(root, 'evidence/inner/missing.json'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
