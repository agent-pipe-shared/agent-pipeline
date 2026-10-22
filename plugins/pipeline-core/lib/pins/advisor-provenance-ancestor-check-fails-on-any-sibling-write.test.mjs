// SPDX-License-Identifier: SUL-1.0
// Regression pin: pipeline.advisor-provenance-ancestor-check-fails-on-any-sibling-write (AC-104).
// The ancestor re-check in readAdvisorPhysicalBytes binds the ancestor's identity (dev/ino/mode plus the
// realpath, isDirectory and not-symlink checks), not its membership: a sibling file or subdirectory created
// or deleted next to an ancestor must not throw DAP-PHYSICAL-PARENT-DRIFT, while a swapped, replaced or
// symlinked ancestor is still refused. Real filesystem, real module, no mocks of the behavior under test.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs, { mkdtempSync, mkdirSync, writeFileSync, rmSync, renameSync, symlinkSync, realpathSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { readAdvisorPhysicalBytes } from '../design-advisor-provenance.mjs';
import { readDesignWorkflowPackageV2FromRepository } from '../design-workflow-package-v2.mjs';

const REL = 'evidence/inner/source.json';
const PAYLOAD = Buffer.from('{"advisor":"source"}\n', 'utf8');

function fixture() {
  const scratch = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'scratch');
  mkdirSync(scratch, { recursive: true });
  const root = realpathSync(mkdtempSync(join(scratch, 'alf-c-p1-07-')));
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

// Deterministic seam: wrap the real fs.lstatSync so that the FIRST lstat of the target in each read attempt (after
// the ancestor identities were captured, before the file is opened) runs a real filesystem action on an ancestor.
// The module's own logic is untouched; only the observation point is made deterministic.
function hookTargetLstat(root, action) {
  const target = join(root, ...REL.split('/'));
  const real = fs.lstatSync;
  const state = { targetLstats: 0, actions: 0 };
  fs.lstatSync = function patched(path, ...rest) {
    if (path === target) {
      state.targetLstats++;
      if (state.targetLstats % 2 === 1) { // odd = the "before" stat of an attempt; even = the "after" stat
        const n = state.actions;
        if (action(n) !== false) state.actions++;
      }
    }
    return real.call(this, path, ...rest);
  };
  syncBuiltinESMExports();
  return { state, restore() { fs.lstatSync = real; syncBuiltinESMExports(); } };
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

test('sibling file and subdirectory created in every ancestor exactly between ancestor capture and re-check do not fail the read', () => {
  const root = fixture();
  const hook = hookTargetLstat(root, (n) => {
    for (const d of [root, join(root, 'evidence'), join(root, 'evidence', 'inner')]) {
      writeFileSync(join(d, `sib-${n}.json`), 'x');
      mkdirSync(join(d, `sibdir-${n}`));
    }
  });
  try {
    assert.ok(readAdvisorPhysicalBytes(root, REL).equals(PAYLOAD));
    assert.equal(hook.state.actions, 1, 'siblings were written once, on the first and only attempt');
    assert.equal(hook.state.targetLstats, 2, 'no re-observation: ancestor identity held (before + after target stat only)');
  } finally { hook.restore(); rmSync(root, { recursive: true, force: true }); }
});

test('a symlinked or junctioned ancestor is still refused (DAP-PHYSICAL-PARENT)', (t) => {
  const root = fixture();
  try {
    const real = join(root, 'real-evidence');
    mkdirSync(join(real, 'inner'), { recursive: true });
    writeFileSync(join(real, 'inner', 'source.json'), PAYLOAD);
    rmSync(join(root, 'evidence'), { recursive: true, force: true });
    try { symlinkSync(real, join(root, 'evidence'), 'junction'); }
    catch { t.skip('host limitation: cannot create a directory link on this host'); return; }
    assert.throws(() => readAdvisorPhysicalBytes(root, REL), /DAP-PHYSICAL-PARENT/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('an ancestor replaced by a different directory (foreign bytes at the same path) is never served as success', () => {
  const root = fixture();
  const FOREIGN = Buffer.from('{"advisor":"FOREIGN"}\n', 'utf8');
  const hook = hookTargetLstat(root, (n) => {
    renameSync(join(root, 'evidence'), join(root, `old-evidence-${n}`));
    mkdirSync(join(root, 'evidence', 'inner'), { recursive: true });
    writeFileSync(join(root, REL), FOREIGN);
  });
  try {
    let served = null;
    let error = null;
    try { served = readAdvisorPhysicalBytes(root, REL); } catch (e) { error = e; }
    assert.equal(served, null, 'foreign bytes from a replaced ancestor must not be returned as a successful read');
    assert.equal(String(error?.message), 'DAP-PHYSICAL-PARENT-DRIFT', 'fails closed on the ancestor identity check');
    assert.equal(hook.state.actions, 3, 'the bounded re-observation made exactly 3 attempts, each hit by a fresh replacement');
  } finally { hook.restore(); rmSync(root, { recursive: true, force: true }); }
});

test('an ancestor replaced by a new directory that adopts the same target file is refused on ancestor identity alone', () => {
  const root = fixture();
  const hook = hookTargetLstat(root, (n) => {
    renameSync(join(root, 'evidence'), join(root, `old-evidence-${n}`));
    mkdirSync(join(root, 'evidence'));
    renameSync(join(root, `old-evidence-${n}`, 'inner'), join(root, 'evidence', 'inner'));
  });
  try {
    assert.throws(() => readAdvisorPhysicalBytes(root, REL), (e) => e.message === 'DAP-PHYSICAL-PARENT-DRIFT');
    assert.equal(hook.state.actions, 3);
  } finally { hook.restore(); rmSync(root, { recursive: true, force: true }); }
});

test('a single ancestor replacement is re-observed on a fresh walk and then reads the unchanged target', () => {
  const root = fixture();
  const hook = hookTargetLstat(root, (n) => {
    if (n > 0) return false;
    renameSync(join(root, 'evidence'), join(root, 'old-evidence'));
    mkdirSync(join(root, 'evidence'));
    renameSync(join(root, 'old-evidence', 'inner'), join(root, 'evidence', 'inner'));
    return true;
  });
  try {
    assert.ok(readAdvisorPhysicalBytes(root, REL).equals(PAYLOAD));
    assert.ok(hook.state.targetLstats >= 4, 'a second full attempt happened after the drift');
  } finally { hook.restore(); rmSync(root, { recursive: true, force: true }); }
});

test('the DWP2-PHYSICAL-OR-GIT relabel keeps the original ancestor-drift cause as a closed, non-authoritative diagnostic', () => {
  const root = fixture();
  const git = (...args) => spawnSync('git', ['-c', 'user.name=pin', '-c', 'user.email=pin@example.invalid', ...args], { cwd: root, encoding: 'utf8' });
  assert.equal(git('init', '-q').status, 0, 'fixture repository');
  assert.equal(git('add', '-A').status, 0);
  assert.equal(git('commit', '-q', '-m', 'fixture').status, 0, 'fixture commit (a candidate must exist before the package read)');
  const hook = hookTargetLstat(root, (n) => {
    renameSync(join(root, 'evidence'), join(root, `old-evidence-${n}`));
    mkdirSync(join(root, 'evidence'));
    renameSync(join(root, `old-evidence-${n}`, 'inner'), join(root, 'evidence', 'inner'));
  });
  try {
    const result = readDesignWorkflowPackageV2FromRepository({ repoRoot: root, packagePath: REL });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'DWP2-PHYSICAL-OR-GIT', 'the stage code is unchanged (it is the authoritative refusal)');
    assert.equal(hook.state.actions, 3, 'the drift really happened inside the bounded re-observation, not in git');
    assert.equal(result.diagnostic?.schema, 'pipeline.codex-advisor-binding-diagnostic.v1');
    assert.equal(result.diagnostic.subcheck, 'source-provenance');
    assert.equal(result.diagnostic.cause, 'DAP-PHYSICAL-PARENT-DRIFT', 'the underlying cause is kept, not collapsed to a generic label');
    assert.equal(result.diagnostic.repair.kind, 'repeat-bounded-read');
    assert.equal(result.diagnostic.repair.automatic, false);
    assert.equal(result.diagnostic.repair.authority, 'diagnostic-only', 'the cause is advisory and carries no authority');
    assert.equal(JSON.stringify(result.diagnostic).includes(root), false, 'no path crosses the diagnostic boundary');
  } finally { hook.restore(); rmSync(root, { recursive: true, force: true }); }
});

test('a target with an invalid path or a missing file still fails closed with a typed error', () => {
  const root = fixture();
  try {
    assert.throws(() => readAdvisorPhysicalBytes(root, '../outside.json'), /DAP-PHYSICAL-INPUT/u);
    assert.throws(() => readAdvisorPhysicalBytes(root, 'evidence/inner/missing.json'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
