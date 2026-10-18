// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.codex-readiness-private-receipt-omits-output-custody (AC-134), readiness launch prerequisite.
// Every managed Codex readiness launch failed with host-process-root-unregistered because the readiness host store
// created its process root but never registered it with the process journal (only the advisor registered its root).
// The store must register the root at creation and expose exactly the path the registry returns; an unregistered
// sibling must stay refused. Linux-only, because the store itself is Linux-only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, realpathSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {resolvePoGateRepositoryTopology, derivePoGateRepositoryFingerprint} from '../po-gate-authority.mjs';
import {createCodexDesignReadinessHostStore} from '../codex-design-readiness-host-store.mjs';
import {createHostJournal, hostDigest, journalExecutable, readHostJournal, registerCodexHostProcessRoot} from '../codex-host-process-journal.mjs';
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
