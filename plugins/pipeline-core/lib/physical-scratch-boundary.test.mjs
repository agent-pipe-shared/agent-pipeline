import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";

const completionCases = [];
function test(name, run) {
  if (arguments.length !== 2 || typeof run !== "function") throw new TypeError("Required completion expects the preserved two-argument test registration");
  completionCases.push({ id: "RC18C" + String(completionCases.length + 1).padStart(3, "0"), name, run });
}
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, symlinkSync, linkSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { isPhysicalScratchTarget as permits, isBoundedScratchOnlyWords } from './physical-scratch-boundary.mjs';

function fixture(t, scratch = true) {
  const root = mkdtempSync(join(tmpdir(), 'scratch-boundary-fixture-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'live'));
  writeFileSync(join(root, 'live', 'guard.mjs'), 'live');
  if (scratch) mkdirSync(join(root, 'scratch'));
  return root;
}
test('inert protected-name copies and new nested files are scratch', t => {
  const root = fixture(t);
  mkdirSync(join(root, 'scratch', 'copy', 'hooks'), { recursive: true });
  writeFileSync(join(root, 'scratch', 'copy', 'hooks', 'guard-lifecycle-ready.mjs'), 'inert');
  for (const path of ['scratch/copy/hooks/guard-lifecycle-ready.mjs', 'scratch/copy/hooks/hooks.json', 'scratch/new/nested/test.mjs']) {
    assert.equal(permits(path, { rootDir: root, liveRoots: [join(root, 'live')] }), true);
  }
});
test('live roots beneath scratch remain protected', t => {
  const root = fixture(t);
  const liveRoot = join(root, 'scratch', 'active-plugin');
  mkdirSync(liveRoot);
  assert.equal(permits('scratch/active-plugin/new.mjs', { rootDir: root, liveRoots: [liveRoot] }), false);
});
test('scratch root creation is explicit; outside and traversal denied', t => {
  const root = fixture(t, false);
  assert.equal(permits('scratch/new/file', { rootDir: root }), true);
  assert.equal(permits(join(root, 'scratch', 'new', 'file'), { rootDir: root }), true);
  assert.equal(permits('scratch', { rootDir: root }), false);
  assert.equal(permits('scratch', { rootDir: root, allowScratchRoot: true }), true);
  for (const path of ['scratch/../live/guard.mjs', '../outside', 'scratch-other/file', 'C:\\scratch\\file', 'scratch\\file', 'scratch/\0file']) {
    assert.equal(permits(path, { rootDir: root }), false, path);
  }
});
test('root, descendant, contained and dangling symlink aliases denied', t => {
  const root = fixture(t);
  const directoryLinkType = process.platform === 'win32' ? 'junction' : 'dir';
  symlinkSync(join(root, 'live'), join(root, 'scratch', 'out'), directoryLinkType);
  symlinkSync(join(root, 'scratch'), join(root, 'scratch', 'inside'), directoryLinkType);
  const rejected = ['scratch/out/guard.mjs', 'scratch/inside/new'];
  if (process.platform !== 'win32') {
    symlinkSync(join(root, 'missing'), join(root, 'scratch', 'broken'), 'dir');
    rejected.push('scratch/broken/new');
  }
  for (const path of rejected) {
    assert.equal(permits(path, { rootDir: root }), false);
  }
  const second = fixture(t, false);
  symlinkSync(join(second, 'live'), join(second, 'scratch'), directoryLinkType);
  assert.equal(permits('scratch/new', { rootDir: second }), false);
  if (process.platform !== 'win32') {
    // macOS commonly resolves /var to /private/var. An alias in an ancestor
    // of the repo must not make all otherwise safe scratch writes fail.
    const container = mkdtempSync(join(tmpdir(), 'scratch-boundary-parent-'));
    const alias = `${container}-alias`;
    t.after(() => { rmSync(alias, { force: true }); rmSync(container, { recursive: true, force: true }); });
    mkdirSync(join(container, 'repo', 'scratch'), { recursive: true });
    symlinkSync(container, alias);
    assert.equal(permits(join(alias, 'repo', 'scratch', 'new.txt'), {
      rootDir: join(alias, 'repo'), liveRoots: [],
    }), true);
  }
});
test('hardlinked live file cannot be edited through scratch', t => {
  const root = fixture(t);
  linkSync(join(root, 'live', 'guard.mjs'), join(root, 'scratch', 'copy.mjs'));
  assert.equal(permits('scratch/copy.mjs', { rootDir: root }), false);
});
test('file ancestors and IO errors fail closed', t => {
  const root = fixture(t);
  writeFileSync(join(root, 'scratch', 'file'), 'x');
  assert.equal(permits('scratch/file/child', { rootDir: root }), false);
  assert.equal(permits('scratch/new', { rootDir: root, lstat: () => { throw Object.assign(new Error(), { code: 'EACCES' }); } }), false);
});
test('shell exception admits only exact parsed scratch writes', t => {
  const root = fixture(t);
  const context = { rootDir: root, liveRoots: [join(root, 'live')] };
  for (const words of [['mkdir', '-p', 'scratch/nested'], ['touch', 'scratch/hooks.json'], ['cp', '--', 'live/guard.mjs', 'scratch/copy.mjs']]) {
    assert.equal(isBoundedScratchOnlyWords(words, context), true);
  }
  assert.equal(isBoundedScratchOnlyWords(['touch', join(root, 'scratch', 'absolute.txt')], context), true);
  if (process.platform === 'win32') {
    const windowsAbsolute = join(root, 'scratch', 'windows.txt');
    const alternateDriveCase = windowsAbsolute[0] === windowsAbsolute[0].toLowerCase()
      ? windowsAbsolute[0].toUpperCase() + windowsAbsolute.slice(1)
      : windowsAbsolute[0].toLowerCase() + windowsAbsolute.slice(1);
    assert.equal(permits(windowsAbsolute, context), true, 'native absolute Write-tool path');
    assert.equal(permits(alternateDriveCase, context), true, 'drive-letter case differs');
    assert.equal(permits('scratch\\nested\\windows.txt', context), true, 'native relative shell path');
    assert.equal(permits('C:relative\\scratch.txt', context), false, 'drive-relative paths are ambiguous');
  }
  for (const words of [['cp', '--', 'scratch/copy', 'live/guard.mjs'], ['touch', 'scratch/one', 'live/guard.mjs'],
    ['node', '-e', 'write("scratch/hooks.json")'], ['cp', '-r', 'live', 'scratch/copy'],
    ['/untrusted/cp', '--', 'source', 'scratch/copy'], ['mkdir', '-p', 'scratch/../live/new'], ['touch', '-r', 'scratch/a']]) {
    assert.equal(isBoundedScratchOnlyWords(words, context), false, JSON.stringify(words));
  }
});

// Each original sibling callback is registered individually; no envelope case.
if (completionCases.length !== 7) throw new Error("Required completion declared case count drift");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
