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
