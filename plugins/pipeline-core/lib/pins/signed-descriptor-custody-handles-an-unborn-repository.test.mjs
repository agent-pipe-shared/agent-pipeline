// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.host-crash-during-verify-leaves-a-descriptor-no-recovery-verb-can-clear (AC-203, unborn-HEAD custody).
// A repository with no first commit (unborn HEAD) is the NORMAL state of a greenfield project at kickoff, so
// signed-descriptor custody (inspectSignedDescriptorCustodyRepository / inspectSignedDescriptorCustodyInputs, the
// preimage of bindOnboardingSessionCleanup) must return a typed unborn candidate instead of throwing WT-GIT-FAILED.
// The unborn representation is the one human-guard-override.mjs already owns (all-zero 40-hex commit sentinel +
// git's empty-tree object id); a born repository must keep producing exactly its real HEAD commit and tree.
// Every fixture lives under scratch/, runs `git init` on its own root first and pins GIT_CEILING_DIRECTORIES to the
// fixture's parent, so no git call can ever reach the project repository.
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectSignedDescriptorCustodyInputs, inspectSignedDescriptorCustodyRepository, startSessionDescriptor} from '../worktree-lifecycle.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const scratchBase = join(projectRoot, 'scratch');
mkdirSync(scratchBase, {recursive: true});
const ZERO_SENTINEL = '0'.repeat(40);
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const fixtures = [];

function makeRepo(label) {
  const root = realpathSync(mkdtempSync(join(scratchBase, `unborn-custody-${label}-`)));
  fixtures.push(root);
  const ceiling = dirname(root);
  const git = (args, options = {}) => {
    const result = spawnSync('git', args, {cwd: root, encoding: 'utf8', shell: false, timeout: 30000, input: options.input,
      env: {...process.env, GIT_CEILING_DIRECTORIES: ceiling, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0'}});
    assert.equal(result.error, undefined, `git ${args[0]} could not start`);
    assert.equal(result.status, 0, `git ${args[0]} failed: ${result.stderr}`);
    return String(result.stdout).trim();
  };
  git(['init', '--quiet', '--initial-branch=main']);
  const commit = () => git(['-c', 'user.name=Unborn Custody Pin Fixture', '-c', 'user.email=pin-fixture@invalid.example',
    '-c', 'commit.gpgsign=false', '-c', `core.hooksPath=${join(root, '.git', 'no-hooks')}`,
    'commit', '--quiet', '--allow-empty', '-m', 'unborn custody pin fixture']);
  return {root, git, commit};
}

after(() => { for (const root of fixtures) rmSync(root, {recursive: true, force: true, maxRetries: 5, retryDelay: 100}); });

test('git itself agrees the pinned unborn tree is the empty-tree object id', () => {
  const {git} = makeRepo('empty-tree');
  assert.equal(git(['hash-object', '-t', 'tree', '--stdin'], {input: ''}), EMPTY_TREE);
});

test('the unborn representation is the one human-guard-override.mjs owns (no second convention)', () => {
  const source = readFileSync(join(projectRoot, 'plugins', 'pipeline-core', 'lib', 'human-guard-override.mjs'), 'utf8');
  assert.match(source, /const UNBORN_TREE_OID = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";/u);
  assert.match(source, /const HGO_SIGNATURE_UNBORN_COMMIT_SENTINEL = "0"\.repeat\(40\);/u);
});

test('custody repository inspection returns a typed unborn candidate for a repository without a first commit', () => {
  const {root, git} = makeRepo('unborn');
  assert.throws(() => git(['rev-parse', 'HEAD']), /unknown revision|ambiguous argument/u, 'fixture precondition: HEAD is unborn');
  const repository = inspectSignedDescriptorCustodyRepository(root);
  assert.deepEqual(Object.keys(repository), ['primaryRoot', 'commonDir', 'candidate']);
  assert.equal(repository.primaryRoot, root);
  assert.deepEqual(Object.keys(repository.candidate), ['commit', 'tree']);
  assert.deepEqual(repository.candidate, {commit: ZERO_SENTINEL, tree: EMPTY_TREE});
  assert.match(repository.candidate.commit, /^[0-9a-f]{40}$/u);
  assert.equal(JSON.stringify(inspectSignedDescriptorCustodyRepository(root)), JSON.stringify(repository), 'the unborn observation is reproducible');
});

test('custody input inspection of an unborn repository carries the same typed unborn candidate', () => {
  const {root} = makeRepo('unborn-inputs');
  const started = startSessionDescriptor(root, {sessionId: 'unborn-custody-session'});
  const inputs = inspectSignedDescriptorCustodyInputs(root, started.sessionId);
  assert.deepEqual(inputs.repository.candidate, {commit: ZERO_SENTINEL, tree: EMPTY_TREE});
  assert.deepEqual(inputs.repository, inspectSignedDescriptorCustodyRepository(root));
  assert.equal(inputs.sessionId, started.sessionId);
  assert.equal(inputs.activePresent, true);
});

test('born control: a repository with a first commit still reports its real HEAD commit and tree, byte-identically', () => {
  const {root, git, commit} = makeRepo('born');
  commit();
  const head = git(['rev-parse', 'HEAD']), tree = git(['rev-parse', 'HEAD^{tree}']);
  assert.match(head, /^[0-9a-f]{40}$/u);
  assert.notEqual(head, ZERO_SENTINEL);
  const repository = inspectSignedDescriptorCustodyRepository(root);
  assert.equal(JSON.stringify(repository.candidate), JSON.stringify({commit: head, tree}));
  assert.equal(JSON.stringify(Object.keys(repository)), JSON.stringify(['primaryRoot', 'commonDir', 'candidate']));
  const started = startSessionDescriptor(root, {sessionId: 'born-custody-session'});
  assert.equal(JSON.stringify(inspectSignedDescriptorCustodyInputs(root, started.sessionId).repository), JSON.stringify(repository));
});

test('the unborn candidate yields to the real commit once the first commit exists', () => {
  const {root, git, commit} = makeRepo('transition');
  assert.equal(inspectSignedDescriptorCustodyRepository(root).candidate.commit, ZERO_SENTINEL);
  commit();
  assert.equal(inspectSignedDescriptorCustodyRepository(root).candidate.commit, git(['rev-parse', 'HEAD']));
});

test('a HEAD that is not an unborn branch (detached at a missing object) still fails closed with the git error', () => {
  const {root, commit} = makeRepo('detached-missing');
  commit();
  writeFileSync(join(root, '.git', 'HEAD'), `${'ab'.repeat(20)}\n`);
  assert.throws(() => inspectSignedDescriptorCustodyRepository(root), error => error?.code === 'WT-GIT-FAILED');
});
