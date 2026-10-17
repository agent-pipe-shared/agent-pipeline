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
import {existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync} from 'node:fs';
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

// ---- ALF-C-ANCESTOR-CALLERS4: the remaining repository-path walkers (domain owner, OSV bridge, host-process journal) ------------
// Decided design: each walker derives or receives the repository root and passes it as boundaryRoot to
// observeWindowsAuthorityAncestor, which relaxes only paths lexically STRICTLY ABOVE it. Case A drives the real domain-owner
// namespace read on the real fixture. Cases B and C are structural: the bridge and journal readers need a full signed
// session-authority catalogue and a live Codex task origin that no cheap fixture reproduces, so the call graph is pinned instead.
const NAMESPACE_ID = 'domain-ancestor-pin';
const NAMESPACE_RECORD = {schema: 'ancestor-pin-record'};
const ownerModule = () => import(pathToFileURL(join(pluginRoot, 'lib', 'session-authority-domain-owner.mjs')).href);
const readNamespace = (owner, rootPath) => owner.readAuthorityNamespace({namespaceId: NAMESPACE_ID, rootPath, classifyEntry: ({value}) => value});
function seedNamespace(repository) {
  const {backend} = loaded;
  const state = join(repository.dotGit, 'agent-pipeline'), namespace = join(state, NAMESPACE_ID);
  if (!existsSync(state)) backend.createWindowsOwnedAuthorityDirectory({path: state});
  backend.createWindowsOwnedAuthorityDirectory({path: namespace});
  backend.createWindowsOwnedAuthorityExclusiveFile({path: join(namespace, 'record.json'), bytes: Buffer.from(JSON.stringify(NAMESPACE_RECORD))});
  return namespace;
}

winTest('case A: readAuthorityNamespace is not refused by a foreign-writable ancestor strictly above the repository root', async () => {
  const owner = await ownerModule();
  const namespace = seedNamespace(fixture.clean);
  const read = readNamespace(owner, namespace);
  assert.equal(read.membership.entryCount, 1);
  assert.deepEqual(read.entries.map((entry) => ({...entry.value})), [NAMESPACE_RECORD]); // parseStrictJson returns null-prototype objects
});

winTest('case A control: readAuthorityNamespace still refuses at and below the repository root and outside any .git/agent-pipeline', async () => {
  const owner = await ownerModule();
  // A foreign write grant on the common directory (below the root), on the root itself, and a directory directly under the
  // foreign-writable base that is not inside any <repository>/.git/agent-pipeline (no boundary is derived, so it stays strict).
  assert.throws(() => readNamespace(owner, join(fixture.belowBad.dotGit, 'agent-pipeline', NAMESPACE_ID)), refusal);
  assert.throws(() => readNamespace(owner, join(fixture.rootBad.dotGit, 'agent-pipeline', NAMESPACE_ID)), refusal);
  const outside = join(fixture.base, 'outside-any-agent-pipeline');
  mkdirSync(outside);
  assert.throws(() => readNamespace(owner, outside), refusal);
});

const libSource = (name) => readFileSync(join(pluginRoot, 'lib', name), 'utf8');
function splitArguments(text) {
  const args = [];
  let depth = 0, quote = null, current = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) { current += ch; if (ch === '\\') current += text[++i] ?? ''; else if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; current += ch; continue; }
    if ('([{'.includes(ch)) depth += 1;
    else if (')]}'.includes(ch)) depth -= 1;
    if (ch === ',' && depth === 0) { args.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  if (current.trim()) args.push(current.trim());
  return args;
}
// Every call of a top-level function with its top-level enclosing function and its top-level arguments (declaration excluded).
function callsOf(source, name) {
  const headers = [...source.matchAll(/^(?:export )?(?:async )?function (\w+)/gmu)].map((match) => ({name: match[1], index: match.index}));
  const calls = [];
  for (const match of source.matchAll(new RegExp(`(?<![\\w.])${name}\\(`, 'gu'))) {
    if (source.slice(Math.max(0, match.index - 9), match.index) === 'function ') continue;
    const open = match.index + name.length;
    let depth = 0, quote = null, end = -1;
    for (let i = open; i < source.length && end < 0; i += 1) {
      const ch = source[i];
      if (quote) { if (ch === '\\') i += 1; else if (ch === quote) quote = null; continue; }
      if (ch === "'" || ch === '"' || ch === '`') quote = ch;
      else if (ch === '(') depth += 1;
      else if (ch === ')' && --depth === 0) end = i;
    }
    assert.ok(end > open, `unterminated call of ${name}`);
    calls.push({caller: headers.filter((header) => header.index < match.index).at(-1)?.name ?? null, args: splitArguments(source.slice(open + 1, end))});
  }
  return calls;
}

test('case B (structural): the OSV bridge bounds only osvWindowsPrivate with the repository root, after a lexical containment check', () => {
  const source = libSource('session-requester-bridge.mjs');
  assert.match(source, /function osvWindowsBoundary\(path,root\)\{/u); // lexical, case-insensitive containment inside the root, else null (strict)
  assert.match(source, /function osvWindowsAncestors\(path,boundaryRoot=null\)\{/u);
  assert.match(source, /function osvWindowsRead\(path,maxBytes,privateFile=false,boundaryRoot=null\)\{/u);
  // osvWindowsRead forwards the identical boundary to the before and the after ancestor read, so its CAS stays deterministic.
  assert.deepEqual(callsOf(source, 'osvWindowsAncestors').map(({caller, args}) => [caller, args.join('|')]), [['osvWindowsRead', 'path|boundaryRoot'], ['osvWindowsRead', 'path|boundaryRoot']]);
  const reads = callsOf(source, 'osvWindowsRead');
  const bounded = reads.filter(({args}) => args.length > 3);
  assert.equal(bounded.length, 1, 'exactly one osvWindowsRead caller passes a boundary');
  assert.equal(bounded[0].caller, 'osvWindowsPrivate');
  assert.equal(bounded[0].args[3], 'osvWindowsBoundary(file,r.primaryRoot)');
  assert.deepEqual(reads.filter((call) => call !== bounded[0]).map(({caller}) => caller).sort(), ['osvWindowsEvidence', 'osvWindowsPhysical', 'osvWindowsPhysicalRef']);
});

test('case C (structural): the host-process journal bounds only the three repository-bearing verification readers', () => {
  const source = libSource('codex-host-process-journal.mjs');
  assert.match(source, /function verificationWindowsBoundary\(path,repository\)\{/u); // contained in repository.primaryRoot, else null (strict)
  assert.match(source, /function verificationWindowsRead\(path,maxBytes,repository=null\)\{/u);
  assert.equal(callsOf(source, 'verificationWindowsBoundary').length, 1);
  // The boundary is computed once per read and reused by the before and the after ancestry, so the CAS stays deterministic.
  // rootIdentity keeps the strict single-path ancestor check; only verificationWindowsRead can pass a boundary.
  assert.deepEqual(callsOf(source, 'observeWindowsAuthorityAncestor').map(({caller, args}) => [caller, args.join('|')]), [['rootIdentity', '{path}'], ['verificationWindowsRead', 'boundaryRoot?{path:cursor,boundaryRoot}:{path:cursor}']]);
  const reads = callsOf(source, 'verificationWindowsRead').map(({caller, args}) => [caller, args.length === 3 ? args[2] : args.length === 2 ? 'strict' : `${args.length} arguments`]);
  assert.deepEqual(reads.sort((a, b) => a[0].localeCompare(b[0])), [
    ['managedWindowsRegistryRecord', 'repository'],
    ['readHostJournal', 'strict'],
    ['verificationReadTask', 'strict'],
    ['verificationWindowsCatalogueRef', 'repository'],
    ['verificationWindowsRecord', 'repository'],
    ['writeHostJournal', 'strict'],
  ]);
});
