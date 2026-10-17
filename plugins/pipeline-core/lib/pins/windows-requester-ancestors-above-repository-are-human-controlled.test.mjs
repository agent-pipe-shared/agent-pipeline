// SPDX-License-Identifier: SUL-1.0
// Criterion-bound pin (QG-04) for item
// pipeline.host-crash-during-verify-leaves-a-descriptor-no-recovery-verb-can-clear, governing criterion AC-203
// (specs/sprint-alfred-epic/spec.md, bytes 216884..217056), applying the PO decision of 2026-10-17
// (specs/sprint-alfred-epic/plans/po-decisions-2026-10-12.md, "Windows authority ancestors above the repository"):
// directories STRICTLY ABOVE the repository root are human-controlled. Their owner/ACL are still observed and bound into the
// native facts, but a foreign owner or foreign write grant there no longer refuses. The repository root, every directory below
// it and the private state keep every strict check.
//
// Commit b554c495c applied the decision to verify-journal only. The requester/controller callers walked the ancestor chain of a
// repository path without the repository root as boundary, so the real controlled-method fixture refused with
// WIN-AUTH-ANCESTOR-MUTATION on any host whose drive root or first-level directory is writable by Authenticated Users.
//
// Cases drive the real requester storage and the real createControlledMethodRuntimeFixture on a real NTFS fixture: a git
// repository below a base directory that deliberately grants a foreign principal write (the human-controlled ancestor).
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, realpathSync, rmSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const checkoutScratch = resolve(pluginRoot, '..', '..', 'scratch');
const isWindows = process.platform === 'win32';
const HOST_LIMITATION = 'HOST-LIMITATION(windows-only): native Windows DACL, owner and requester-storage fixtures need a win32 host; owner: ALF-C-ANCESTOR-CALLERS Windows qualification; due: 2026-10-31; runs on: any native Windows host';
const FOREIGN = '*S-1-5-11'; // Authenticated Users: a principal that is neither the current user, SYSTEM nor Administrators
const systemExe = (name) => join(process.env.SystemRoot || 'C:\\Windows', 'System32', name);

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, {encoding: 'utf8', windowsHide: true, ...options});
  assert.equal(result.status, 0, `${executable} ${args.join(' ')} -> ${result.status}: ${result.stdout}${result.stderr}`);
  return result.stdout;
}

const fixture = {};
const loaded = {};
const ceilingBefore = {had: false, value: undefined};

async function load() {
  if (loaded.backend) return loaded;
  const modules = (name) => import(pathToFileURL(join(pluginRoot, 'lib', name)).href);
  loaded.backend = await modules('windows-owned-authority-backend.mjs');
  loaded.runtime = await modules('windows-requester-runtime.mjs');
  loaded.bridge = await modules('session-requester-bridge.mjs');
  loaded.lifecycle = await modules('worktree-lifecycle.mjs');
  return loaded;
}

function protect(directory) {
  run(systemExe('icacls.exe'), [directory, '/inheritance:r']);
  run(systemExe('icacls.exe'), [directory, '/grant:r', `*${fixture.sid}:(OI)(CI)F`]);
}
function grantForeignWrite(directory) {
  run(systemExe('icacls.exe'), [directory, '/grant', `${FOREIGN}:(OI)(CI)M`]);
}
// Every git call of the fixture runs under a ceiling at the fixture base so discovery can never reach the checkout.
function git(cwd, args) {
  return run('git', args, {cwd, env: {...process.env, GIT_CEILING_DIRECTORIES: fixture.base}});
}
function makeRepository(name, {rootClean, gitClean}) {
  const root = join(fixture.base, name);
  mkdirSync(root);
  if (rootClean) protect(root); // otherwise the root inherits the foreign write grant from the fixture base above it
  git(root, ['init', '-q']);
  const dotGit = join(root, '.git');
  if (!gitClean) grantForeignWrite(dotGit);
  return {root, dotGit};
}
function refusal(error) {
  return error?.code === 'SDC-AUTHORITY-UNAVAILABLE' && /^WIN-AUTH-ANCESTOR-(?:MUTATION|OWNER)$/u.test(error.reason ?? '');
}
function custody(repository) {
  return loaded.lifecycle.inspectSignedDescriptorCustodyRepository(repository.root);
}

test.before(async () => {
  if (!isWindows) return;
  mkdirSync(checkoutScratch, {recursive: true});
  fixture.base = realpathSync(mkdtempSync(join(checkoutScratch, 'alf-req-anc-')));
  fixture.sid = run(systemExe('whoami.exe'), ['/user', '/fo', 'csv', '/nh']).match(/"(S-1-5-[0-9-]+)"/u)?.[1];
  assert.ok(fixture.sid, 'current SID');
  ceilingBefore.had = Object.hasOwn(process.env, 'GIT_CEILING_DIRECTORIES');
  ceilingBefore.value = process.env.GIT_CEILING_DIRECTORIES;
  process.env.GIT_CEILING_DIRECTORIES = fixture.base; // in-process git calls of the modules under test stay inside the fixture
  // The directory ABOVE every fixture repository grants a foreign principal write: the human-controlled ancestor.
  grantForeignWrite(fixture.base);
  fixture.clean = makeRepository('clean', {rootClean: true, gitClean: true});
  fixture.rootBad = makeRepository('root-bad', {rootClean: false, gitClean: true});
  fixture.belowBad = makeRepository('below-bad', {rootClean: true, gitClean: false});
  await load();
});
test.after(() => {
  if (!isWindows) return;
  if (ceilingBefore.had) process.env.GIT_CEILING_DIRECTORIES = ceilingBefore.value;
  else delete process.env.GIT_CEILING_DIRECTORIES;
  if (fixture.base) rmSync(fixture.base, {recursive: true, force: true});
});

const winTest = (name, fn) => test(name, {skip: isWindows ? false : HOST_LIMITATION, timeout: 240000}, fn);
const fixtureRootFor = (repository, name) => join(repository.dotGit, 'agent-pipeline', 'controlled-method-fixtures', name);
const sessionId = 'ancestor-pin-session';

winTest('control: the fixture base really grants a foreign principal write and the strict ancestor check refuses it', async () => {
  const {backend} = await load();
  assert.throws(() => backend.observeWindowsAuthorityAncestor({path: fixture.base}), refusal);
});

winTest('requester storage walks the ancestors of a repository path with the repository root as boundary and keeps its CAS deterministic', async () => {
  const {runtime} = await load();
  const storage = runtime.createWindowsRequesterStorage({repository: custody(fixture.clean)});
  assert.equal(typeof runtime.ensureWindowsRequesterNamespace(storage).namespaceSha256, 'string');
  const path = '.git/agent-pipeline/run/session-requesters/ancestor-pin.1.json';
  const published = runtime.publishWindowsRequesterPrivateRecord({storage, path, value: {schema: 'ancestor-pin'}, expectedRef: null});
  assert.equal(published.committed, true);
  // The same boundary applies before and after the operation, so the read-back CAS holds.
  const read = runtime.readWindowsRequesterPrivateRef({storage, ref: published.ref});
  assert.deepEqual(read.value, {schema: 'ancestor-pin'});
  assert.equal(read.ref.sha256, published.ref.sha256);
});

winTest('createControlledMethodRuntimeFixture is not refused by a foreign-writable ancestor strictly above the repository root', async () => {
  const {bridge} = await load();
  const repository = custody(fixture.clean);
  const controlled = bridge.createControlledMethodRuntimeFixture({repository, fixtureRoot: fixtureRootFor(fixture.clean, 'fx-ancestor-pin'), sessionId});
  try {
    assert.equal(typeof controlled.run, 'function');
    assert.equal(typeof controlled.requesterHandle, 'object'); // the binding result carries requesterHandle/bindingRef, not a status
    // Re-reading the bound requester inside the controlled context re-walks the private requester records and their ancestors.
    const context = controlled.run(() => bridge.readSourceOwnedAuthorityContext({repository}));
    assert.equal(context.status, 'bound');
    assert.equal(context.requesterHandle, controlled.requesterHandle);
  } finally {
    await controlled.dispose();
  }
});

winTest('control: a foreign write grant at the repository root still refuses requester storage and the controlled fixture', async () => {
  const {runtime, bridge} = await load();
  const repository = custody(fixture.rootBad);
  assert.throws(() => runtime.ensureWindowsRequesterNamespace(runtime.createWindowsRequesterStorage({repository})), refusal);
  assert.throws(() => bridge.createControlledMethodRuntimeFixture({repository, fixtureRoot: fixtureRootFor(fixture.rootBad, 'fx-ancestor-pin'), sessionId}), refusal);
});

winTest('control: a foreign write grant below the repository root (the common directory) still refuses requester storage and the controlled fixture', async () => {
  const {runtime, bridge} = await load();
  const repository = custody(fixture.belowBad);
  assert.throws(() => runtime.ensureWindowsRequesterNamespace(runtime.createWindowsRequesterStorage({repository})), refusal);
  assert.throws(() => bridge.createControlledMethodRuntimeFixture({repository, fixtureRoot: fixtureRootFor(fixture.belowBad, 'fx-ancestor-pin'), sessionId}), refusal);
});
