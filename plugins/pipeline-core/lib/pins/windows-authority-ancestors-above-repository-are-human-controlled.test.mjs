// SPDX-License-Identifier: SUL-1.0
// Criterion-bound pin (QG-04) for item
// pipeline.windows-os-temp-root-dacl-fails-private-state-assurance-for-test-fixtures,
// governing criterion AC-270 (specs/sprint-alfred-epic/spec.md, bytes 233790..233964), narrowed by the PO decision of
// 2026-10-17 (specs/sprint-alfred-epic/plans/po-decisions-2026-10-12.md, "Windows authority ancestors above the repository"):
// directories STRICTLY ABOVE the repository root are human-controlled. They are still observed and their owner/ACL facts stay
// bound into the native facts, but a foreign owner or foreign write grant there no longer refuses. The repository root, every
// directory below it and the private state keep every existing strict check; reparse points and non-directories stay refused.
//
// Cases drive the real backend, the real native helper and the real verify-journal registration path on a real NTFS fixture.
// PIPELINE_ANCESTOR_PIN_CODE_ROOT is a replay seam only: it points the pin at a scratch mirror of an earlier source state
// (layout <root>/lib and <root>/scripts) so the pin can be proven RED without editing production.
import test from 'node:test';
import {registerTestCaseCompletion} from '../test-case-completion.mjs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, rmdirSync, symlinkSync, writeFileSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const codeRoot = process.env.PIPELINE_ANCESTOR_PIN_CODE_ROOT || pluginRoot;
const isWindows = process.platform === 'win32';
const HOST_LIMITATION = 'HOST-LIMITATION(windows-only): native Windows DACL, owner and reparse fixtures need a win32 host; owner: ALF-C-WIN-ANCESTOR Windows qualification; due: 2026-10-31; runs on: any native Windows host';
const FOREIGN = '*S-1-5-11'; // Authenticated Users: a principal that is neither the current user, SYSTEM nor Administrators
const FACTS = /^[0-9]+:[0-9]+:[0-9]+:[0-9]+:[0-9]+:directory:[0-9]+:[0-9]+:directory:[a-f0-9]{64}$/u;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const systemExe = (name) => join(process.env.SystemRoot || 'C:\\Windows', 'System32', name);

function run(executable, args) {
  const result = spawnSync(executable, args, {encoding: 'utf8', windowsHide: true});
  assert.equal(result.status, 0, `${executable} ${args.join(' ')} -> ${result.status}: ${result.stdout}${result.stderr}`);
  return result.stdout;
}

const fixture = {};
const loaded = {};

async function load() {
  if (loaded.backend) return loaded;
  loaded.backend = await import(pathToFileURL(join(codeRoot, 'lib', 'windows-owned-authority-backend.mjs')).href);
  loaded.journal = await import(pathToFileURL(join(codeRoot, 'scripts', 'verify-journal.mjs')).href);
  loaded.state = await import(pathToFileURL(join(codeRoot, 'lib', 'windows-private-state.mjs')).href);
  return loaded;
}

function protect(directory) {
  run(systemExe('icacls.exe'), [directory, '/inheritance:r']);
  run(systemExe('icacls.exe'), [directory, '/grant:r', `*${fixture.sid}:(OI)(CI)F`]);
}
function grantForeignWrite(directory) {
  run(systemExe('icacls.exe'), [directory, '/grant', `${FOREIGN}:(OI)(CI)M`]);
}
function makeRepository(name, {rootClean, gitClean}) {
  const root = join(fixture.base, name);
  mkdirSync(root);
  if (rootClean) protect(root); // otherwise the root inherits the foreign write grant from the fixture base above it
  const git = join(root, '.git');
  mkdirSync(git);
  if (gitClean && !rootClean) protect(git);
  if (!gitClean && rootClean) grantForeignWrite(git);
  return {root, git};
}
function refusal(reason) {
  return (error) => error?.code === 'SDC-AUTHORITY-UNAVAILABLE' && error.reason === reason;
}

test.before(async () => {
  if (!isWindows) return;
  fixture.base = realpathSync(mkdtempSync(join(tmpdir(), 'alf-anc-')));
  fixture.sid = run(systemExe('whoami.exe'), ['/user', '/fo', 'csv', '/nh']).match(/"(S-1-5-[0-9-]+)"/u)?.[1];
  assert.ok(fixture.sid, 'current SID');
  // The directory ABOVE every fixture repository grants a foreign principal write: the human-controlled ancestor.
  grantForeignWrite(fixture.base);
  fixture.clean = makeRepository('clean', {rootClean: true, gitClean: true});
  fixture.rootBad = makeRepository('root-bad', {rootClean: false, gitClean: true});
  fixture.belowBad = makeRepository('below-bad', {rootClean: true, gitClean: false});
  await load();
});
test.after(() => {
  if (!isWindows || !fixture.base) return;
  try { rmdirSync(join(fixture.base, 'link')); } catch { /* junction may not exist */ }
  rmSync(fixture.base, {recursive: true, force: true});
});

// Cases are registered through the case-completion protocol (registerTestCaseCompletion at the end of this file).
// Ids are stable and in registration order; never renumber, append new cases at the end. Off win32 each case is
// declared and disposed as a skip carrying the HOST-LIMITATION reason, exactly as the former `skip` option did.
const cases = [];
const winTest = (id, name, fn) => cases.push({
  id,
  name,
  run: async (context) => {
    if (!isWindows) { context.skip(HOST_LIMITATION); return; }
    await fn(context);
  },
});

winTest('WAA001', 'control: the fixture ancestor really grants a foreign principal write and the strict ancestor check refuses it', async () => {
  const {backend} = await load();
  assert.throws(() => backend.observeWindowsAuthorityAncestor({path: fixture.base}), refusal('WIN-AUTH-ANCESTOR-MUTATION'));
});

winTest('WAA002', 'an ancestor strictly above the repository root that grants a foreign principal write is accepted and its ACL stays bound into the facts', async () => {
  const {backend} = await load();
  const observed = backend.observeWindowsAuthorityAncestor({path: fixture.base, boundaryRoot: fixture.clean.root});
  assert.match(observed.nativeFacts, FACTS);
  assert.equal(observed.nativeFactsSha256, sha256(observed.nativeFacts));
  assert.equal(observed.helperSha256, sha256(readFileSync(join(codeRoot, 'lib', 'windows-owned-authority-native.ps1'))));
  assert.equal(observed.committed, false);
  // Drift stays detectable: changing the descriptor changes the bound facts even though nothing refuses.
  const again = backend.observeWindowsAuthorityAncestor({path: fixture.base, boundaryRoot: fixture.clean.root});
  assert.equal(again.nativeFacts, observed.nativeFacts);
  run(systemExe('icacls.exe'), [fixture.base, '/grant', '*S-1-1-0:(RX)']);
  const drifted = backend.observeWindowsAuthorityAncestor({path: fixture.base, boundaryRoot: fixture.clean.root});
  assert.notEqual(drifted.nativeFacts, observed.nativeFacts);
  run(systemExe('icacls.exe'), [fixture.base, '/remove:g', '*S-1-1-0']);
});

winTest('WAA003', 'the same foreign write grant at or below the repository root is still refused with the existing code', async () => {
  const {backend} = await load();
  for (const [path, boundaryRoot] of [
    [fixture.rootBad.root, fixture.rootBad.root], // the root itself
    [fixture.belowBad.git, fixture.belowBad.root], // below the root
    [fixture.belowBad.git, fixture.clean.root], // unrelated to the root: no proof, no relaxation
  ]) {
    assert.throws(() => backend.observeWindowsAuthorityAncestor({path}), refusal('WIN-AUTH-ANCESTOR-MUTATION'), `strict ${path}`);
    assert.throws(() => backend.observeWindowsAuthorityAncestor({path, boundaryRoot}), refusal('WIN-AUTH-ANCESTOR-MUTATION'), `bounded ${path}`);
  }
});

winTest('WAA004', 'a reparse point or a non-directory ancestor above the root is still refused', async () => {
  const {backend} = await load();
  const target = join(fixture.base, 'target');
  const link = join(fixture.base, 'link');
  const file = join(fixture.base, 'file.txt');
  mkdirSync(target);
  symlinkSync(target, link, 'junction');
  writeFileSync(file, 'x');
  assert.throws(() => backend.observeWindowsAuthorityAncestor({path: link, boundaryRoot: join(link, 'inner')}), refusal('WIN-AUTH-ALIAS'));
  assert.throws(() => backend.observeWindowsAuthorityAncestor({path: file, boundaryRoot: join(file, 'inner')}), refusal('WIN-AUTH-ALIAS'));
});

winTest('WAA005', 'the boundary input is closed: unknown keys and relative or malformed roots are refused before any native call', async () => {
  const {backend} = await load();
  for (const input of [
    {path: fixture.base, boundaryRoot: 'relative\\root'},
    {path: fixture.base, boundaryRoot: 'D:\\x\\..\\y'},
    {path: fixture.base, boundaryRoot: fixture.clean.root, humanControlled: true},
    {path: fixture.base, root: fixture.clean.root},
  ]) assert.throws(() => backend.observeWindowsAuthorityAncestor(input), refusal(input.boundaryRoot === 'relative\\root' || input.boundaryRoot === 'D:\\x\\..\\y' ? 'WIN-AUTH-PATH' : 'WIN-AUTH-INPUT'));
});

winTest('WAA006', 'the native helper re-proves the relation itself: a path that is not strictly above the root is refused even if the JS layer is bypassed', async () => {
  const {state} = await load();
  const executable = state.WINDOWS_POWERSHELL_PATHS.find((candidate) => existsSync(candidate));
  assert.ok(executable, 'Windows PowerShell');
  const script = readFileSync(join(codeRoot, 'lib', 'windows-owned-authority-native.ps1'), 'utf8');
  const ask = (request) => {
    const result = spawnSync(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {input: JSON.stringify(request), encoding: 'utf8', timeout: 30000, windowsHide: true, env: state.sanitizeChildEnvironment(process.env)});
    return JSON.parse(result.stdout);
  };
  assert.deepEqual(ask({operation: 'ancestor-above-root', path: fixture.rootBad.root, boundaryRoot: fixture.rootBad.root}).code, 'WIN-AUTH-INPUT');
  assert.deepEqual(ask({operation: 'ancestor-above-root', path: fixture.belowBad.git, boundaryRoot: fixture.belowBad.root}).code, 'WIN-AUTH-INPUT');
  assert.equal(ask({operation: 'ancestor-above-root', path: fixture.base, boundaryRoot: fixture.clean.root}).ok, true);
});

winTest('WAA007', 'verify-journal registration (the Full Verify journal step) accepts a foreign-writable ancestor above the repository root', async () => {
  const {journal} = await load();
  const common = fixture.clean.git;
  const runId = 'ancestor-pin-run';
  const records = join(common, 'agent-pipeline', 'verify', 'records');
  const result = journal.registerRunRecordOwner({
    gitCommonDir: common,
    runId,
    runPath: join(common, 'agent-pipeline', 'verify', 'runs', runId),
    registerRecord: ({ensureDirectory}) => { ensureDirectory(records); return {recordSha256: 'a'.repeat(64)}; },
  });
  assert.equal(result.receipt.status, 'registered');
  assert.equal(result.receipt.runId, runId);
  assert.ok(existsSync(records));
});

winTest('WAA008', 'verify-journal registration still refuses a foreign write grant at the repository root or below it', async () => {
  const {journal} = await load();
  for (const repository of [fixture.rootBad, fixture.belowBad]) {
    assert.throws(() => journal.registerRunRecordOwner({
      gitCommonDir: repository.git,
      runId: 'ancestor-pin-refused',
      runPath: join(repository.git, 'agent-pipeline', 'verify', 'runs', 'ancestor-pin-refused'),
      registerRecord: ({ensureDirectory}) => { ensureDirectory(join(repository.git, 'agent-pipeline', 'verify', 'records')); return {recordSha256: 'a'.repeat(64)}; },
    }), /VERIFY-CLEANUP-REGISTRATION-REQUIRED \(cause: WIN-AUTH-ANCESTOR-MUTATION\)/u, repository.root);
  }
});

registerTestCaseCompletion({cases, fd: 3, maxBytes: 65536});
