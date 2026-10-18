// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.codex-readiness-private-receipt-omits-output-custody (AC-134), readiness launch prerequisite.
// Every managed Codex readiness launch failed with host-process-root-unregistered because the readiness host store
// created its process root but never registered it with the process journal (only the advisor registered its root).
// The store must register the root at creation and expose exactly the path the registry returns; an unregistered
// sibling must stay refused. Linux-only, because the store itself is Linux-only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, realpathSync, rmSync, unlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {resolvePoGateRepositoryTopology, derivePoGateRepositoryFingerprint} from '../po-gate-authority.mjs';
import {createCodexDesignReadinessHostStore} from '../codex-design-readiness-host-store.mjs';
import {createHostJournal, createManagedCodexAuthorityProducerPort, hostDigest, journalExecutable, readHostJournal, registerCodexHostProcessRoot} from '../codex-host-process-journal.mjs';
import {readNativeManagedInventory} from '../native-managed-authority-support.mjs';
import {inspectSignedDescriptorCustodyRepository} from '../worktree-lifecycle.mjs';
import {spawnManagedCodexHost} from '../codex-host-process-supervisor.mjs';

const linuxOnly = {skip: process.platform !== 'linux' && 'the readiness host store is Linux-only'};
const h = c => c.repeat(64);

function repositoryFixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'readiness-root-registration-')));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const git = args => execFileSync('git', args, {cwd: root, timeout: 10000, maxBuffer: 524288, stdio: ['ignore', 'pipe', 'pipe']});
  git(['init', '--quiet']);
  git(['-c', 'user.email=fixture@example.invalid', '-c', 'user.name=Synthetic fixture', 'commit', '--allow-empty', '--quiet', '-m', 'pin']);
  const commit = git(['rev-parse', 'HEAD']).toString().trim();
  const topology = resolvePoGateRepositoryTopology(root);
  const repoFingerprint = derivePoGateRepositoryFingerprint({gitCommonDir: topology.gitCommonDir, primaryRoot: topology.primaryRoot});
  const store = createCodexDesignReadinessHostStore({gitCommonDir: topology.gitCommonDir, repoFingerprint, trustedExecutablePath: process.execPath});
  return {root, commit, topology, repoFingerprint, store};
}
function journalFields({root, commit, repoFingerprint}) {
  const executable = journalExecutable(process.execPath), helper = {path: executable.path, sha256: hostDigest('pin helper')};
  return {binding: {repoFingerprint, dispatchId: 'pin', candidateCommit: commit, requestSha256: h('9')},
    executable, nodeExecutable: executable, launcher: helper, worker: helper, args: [], cwd: root};
}

test('the readiness store registers its process root, so the journal accepts it for a managed launch', linuxOnly, t => {
  const fixture = repositoryFixture(t);
  const receiptId = 'drh_' + 'a'.repeat(32);
  const journal = createHostJournal(fixture.store.processRoot, journalFields(fixture), {receiptId});
  assert.equal(journal.directory, join(fixture.store.processRoot, 'codex-host-' + receiptId));
  assert.equal(readHostJournal(journal.directory, 'intent').value.receiptId, receiptId);
});

test('the exposed process root is exactly the path the registry returns for the readiness purpose', linuxOnly, t => {
  const fixture = repositoryFixture(t);
  const registered = registerCodexHostProcessRoot({gitCommonDir: fixture.topology.gitCommonDir, repoFingerprint: fixture.repoFingerprint, purpose: 'design-readiness'});
  assert.equal(fixture.store.processRoot, registered);
  assert.equal(fixture.store.processRoot, join(fixture.topology.gitCommonDir, 'agent-pipeline', 'design-readiness-codex', fixture.repoFingerprint, 'processes'));
});

test('an unregistered sibling process root is still refused, by the journal and by the supervisor', linuxOnly, async t => {
  const fixture = repositoryFixture(t);
  const siblings = [
    join(dirname(fixture.store.processRoot), 'processes-sibling'),
    join(dirname(dirname(fixture.store.processRoot)), h('f'), 'processes'),
    join(dirname(dirname(dirname(fixture.store.processRoot))), 'advisor-codex', fixture.repoFingerprint, 'processes'),
  ];
  for (const sibling of siblings) {
    mkdirSync(sibling, {recursive: true, mode: 0o700});
    assert.throws(() => createHostJournal(sibling, journalFields(fixture)), {code: 'host-process-root-unregistered'}, sibling);
    await assert.rejects(spawnManagedCodexHost({journalParent: sibling, executablePath: process.execPath, args: [], cwd: fixture.root,
      binding: journalFields(fixture).binding}), {code: 'host-process-root-unregistered'}, sibling);
  }
});

// The production readiness host launches from a directory it creates inside the registered processes directory,
// that is, inside the Git common directory. Repository inspection from there must resolve the registered repository.
test('a managed journal whose cwd lies inside the registered processes directory is accepted', linuxOnly, t => {
  const fixture = repositoryFixture(t);
  const inputDirectory = realpathSync(mkdtempSync(join(fixture.store.processRoot, 'input-')));
  const receiptId = 'drh_' + 'b'.repeat(32);
  const journal = createHostJournal(fixture.store.processRoot, {...journalFields(fixture), cwd: inputDirectory}, {receiptId});
  assert.equal(readHostJournal(journal.directory, 'intent').value.cwd, inputDirectory);
});

test('a managed journal whose cwd lies in a different repository is still refused as repository drift', linuxOnly, t => {
  const fixture = repositoryFixture(t), other = repositoryFixture(t);
  const foreignInput = realpathSync(mkdtempSync(join(other.store.processRoot, 'input-')));
  for (const cwd of [other.root, foreignInput, other.topology.gitCommonDir]) {
    assert.throws(() => createHostJournal(fixture.store.processRoot, {...journalFields(fixture), cwd}),
      {code: 'host-process-repository-drift'}, cwd);
  }
});

// A complete readiness run leaves its private receipt in <fingerprint>/receipts/, next to processes/. The managed
// inventory used to refuse that file as an unknown managed entry, so the NEXT managed launch in the same repository
// ended in SDC-AUTHORITY-UNAVAILABLE. The receipt is admitted by exact path shape and exact identity; it stays part of
// the namespace membership, but it is not an operation journal entry.
const receiptSchema = 'pipeline.codex-readiness-host-receipt.v2';
const reasonOf = run => { try { run(); } catch (error) { return error.reason; } return null; };
function receiptFixture(t) {
  const fixture = repositoryFixture(t);
  const receiptId = 'drh_' + 'd'.repeat(32);
  const directory = join(dirname(fixture.store.processRoot), 'receipts');
  const record = {schema: receiptSchema, receiptId, runner: 'codex', repoFingerprint: fixture.repoFingerprint};
  return {...fixture, receiptId, directory, record, path: join(directory, receiptId + '.json'),
    repository: inspectSignedDescriptorCustodyRepository(fixture.root)};
}
const writeRecord = (file, value) => writeFileSync(file, JSON.stringify(value), {mode: 0o600});

test('a readiness receipt left by a complete run does not refuse the next managed launch', linuxOnly, t => {
  const f = receiptFixture(t);
  assert.equal(reasonOf(() => readNativeManagedInventory(f.repository, 'managed-codex')), null);
  writeRecord(f.path, f.record);
  assert.equal(reasonOf(() => readNativeManagedInventory(f.repository, 'managed-codex')), null);
  assert.equal(reasonOf(() => createManagedCodexAuthorityProducerPort({repository: f.repository}).readBaseline()), null);
  const readiness = readNativeManagedInventory(f.repository, 'managed-codex').find(scan => scan.membership.namespaceId === 'design-readiness-processes');
  assert.equal(readiness.membership.entryCount, 1, 'the receipt stays part of the physical membership; it is classified, not skipped');
  assert.equal(readiness.entries.length, 0, 'the receipt is not an operation journal entry');
});

test('a receipt-named file with another schema or identity, and an unknown name in receipts/, are still refused', linuxOnly, t => {
  const f = receiptFixture(t);
  const refused = [
    ['another schema', f.path, {...f.record, schema: 'pipeline.codex-readiness-finalization.v1'}, 'native-managed-managed-schema'],
    ['another receipt id inside', f.path, {...f.record, receiptId: 'drh_' + 'e'.repeat(32)}, 'native-managed-managed-schema'],
    ['another repository fingerprint inside', f.path, {...f.record, repoFingerprint: h('f')}, 'native-managed-managed-schema'],
    ['an unknown name', join(f.directory, 'notes.json'), f.record, 'native-managed-unknown-managed-entry'],
    ['a receipt name that is not an id', join(f.directory, 'receipt.json'), f.record, 'native-managed-unknown-managed-entry'],
    ['an id of the wrong length', join(f.directory, 'drh_' + 'd'.repeat(31) + '.json'), f.record, 'native-managed-unknown-managed-entry'],
  ];
  for (const [label, file, value, reason] of refused) {
    writeRecord(file, value);
    assert.equal(reasonOf(() => readNativeManagedInventory(f.repository, 'managed-codex')), reason, label);
    unlinkSync(file);
    assert.equal(reasonOf(() => readNativeManagedInventory(f.repository, 'managed-codex')), null, label + ' (removed)');
  }
});

test('the receipt shape is admitted only in the readiness namespace, under the fingerprint directory itself', linuxOnly, t => {
  const f = receiptFixture(t);
  const namespaces = dirname(dirname(f.store.processRoot));
  const advisorReceipts = join(dirname(namespaces), 'advisor-codex', f.repoFingerprint, 'receipts');
  mkdirSync(advisorReceipts, {recursive: true, mode: 0o700});
  writeRecord(join(advisorReceipts, f.receiptId + '.json'), f.record);
  assert.equal(reasonOf(() => readNativeManagedInventory(f.repository, 'managed-codex')), 'native-managed-unknown-managed-entry', 'advisor namespace');
  unlinkSync(join(advisorReceipts, f.receiptId + '.json'));
  const nested = join(f.directory, 'nested');
  mkdirSync(nested, {mode: 0o700});
  writeRecord(join(nested, f.receiptId + '.json'), f.record);
  assert.equal(reasonOf(() => readNativeManagedInventory(f.repository, 'managed-codex')), 'native-managed-unknown-managed-entry', 'nested below receipts');
});
