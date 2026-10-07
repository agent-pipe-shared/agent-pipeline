/**
 * Pins the CLI `scripts/scratch-sweep.mjs` (PO decision P, sprint-alfred slice
 * C-S2): the explicitly invoked front end of `lib/scratch-retention.mjs`
 * (`assessScratchDurability`, `planSweep`). Every case drives the CLI as a child
 * process with `--root <fixture repository>` and an injectable clock
 * `--now <ISO-8601>`.
 *
 * Contract pinned here:
 *
 *   --check (the default with no mode flag)
 *     stdout is exactly one JSON object
 *       { schema: "pipeline.scratch-sweep.v1", mode: "check",
 *         durability: <assessScratchDurability result>, plan: <planSweep result> }
 *     exit 0 -- also when durability warnings exist; nothing on disk changes.
 *   --sweep
 *     the same shape with mode "sweep"; a PLAN only, nothing on disk changes.
 *   --apply
 *     deletes EXACTLY the files of a plan recomputed at apply time, nothing else
 *     (no directory, nothing outside scratch/); stdout is a JSON object with
 *     mode "apply" and `deleted`: the repo-relative paths removed; exit 0. It
 *     never deletes anything under scratch/dispatch/, never follows or deletes a
 *     symlink or junction, never deletes a referenced file or one younger than
 *     14 days.
 *   Refusal (unknown flag, two mode flags, a --root that is not a git work tree)
 *     stdout is one JSON object { status: "refused", code }, exit 1, no deletion.
 *     Codes: SCRATCH-SWEEP-USAGE, SCRATCH-SWEEP-NOT-A-REPOSITORY.
 *
 * Whether the `plan` of a --check/--sweep report lists files under
 * scratch/dispatch/ is not part of the contract, so no fixture that compares a
 * plan holds such a file.
 *
 * Every case builds its own throwaway git repository under the hardened private
 * temp root, and runs the CLI from a different, neutral working directory so a
 * CLI that ignored `--root` could never reach this repository's own scratch/.
 * The fixed NOW lies years after the real clock on purpose: a CLI that ignores
 * `--now` and reads the wall clock sees every fixture mtime in the future and
 * fails the age cases.
 *
 * This file is RED by design until `scripts/scratch-sweep.mjs` exists.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { assessScratchDurability, planSweep } from '../lib/scratch-retention.mjs';
import { privateMkdtemp } from '../lib/test-private-tmp.mjs';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), 'scratch-sweep.mjs');
const SCHEMA = 'pipeline.scratch-sweep.v1';
const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2031-03-15T08:00:00.000Z');
const GIT_IDENTITY = ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid'];

const ageDate = (days) => new Date(NOW.getTime() - days * DAY_MS);
const sorted = (list) => [...list].sort();
const roundTrip = (value) => JSON.parse(JSON.stringify(value));

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
}

function setAge(file, days) {
  const when = ageDate(days);
  fs.utimesSync(file, when, when);
}

/** A throwaway directory (a git repository unless `repo: false`) with helpers. */
function createFixture({ repo = true } = {}) {
  const root = fs.realpathSync(privateMkdtemp('scratch-sweep-test-'));
  const cwd = fs.realpathSync(privateMkdtemp('scratch-sweep-cwd-'));
  const cleanups = [];
  const fx = {
    root,
    /** The neutral, non-repository working directory the CLI is started from. */
    cwd,
    abs: (rel) => path.join(root, ...rel.split('/')),
    /** Write a file; with `ageDays`, set its mtime to NOW minus that many days. */
    write(rel, content, ageDays) {
      const file = fx.abs(rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content ?? `${rel}\n`);
      if (ageDays !== undefined) setAge(file, ageDays);
      return file;
    },
    exists: (rel) => fs.existsSync(fx.abs(rel)),
    /** Write files, `git add` exactly them, and commit. Hooks are pointed at a path that holds none. */
    commitFiles(files) {
      for (const [rel, content] of Object.entries(files)) fx.write(rel, content);
      git(root, ['add', '--', ...Object.keys(files)]);
      git(root, [
        ...GIT_IDENTITY,
        '-c', 'commit.gpgsign=false',
        '-c', `core.hooksPath=${path.join(root, '.no-hooks')}`,
        'commit', '-q', '-m', 'fixture',
      ]);
    },
    onCleanup(fn) {
      cleanups.push(fn);
    },
    /** A directory outside the repository, removed with the fixture. */
    outsideDir() {
      const dir = fs.realpathSync(privateMkdtemp('scratch-sweep-outside-'));
      cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
      return dir;
    },
    cleanup() {
      for (const fn of cleanups.splice(0).reverse()) {
        try {
          fn();
        } catch {
          // best effort: a leftover temp directory is not part of the contract
        }
      }
      for (const dir of [root, cwd]) {
        try {
          fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
        } catch {
          // best effort
        }
      }
    },
  };
  if (repo) {
    git(root, ['init', '-q']);
    fx.commitFiles({ 'README.md': 'fixture\n', '.gitignore': 'scratch/\n' });
  }
  return fx;
}

async function inFixture(options, body) {
  const fx = createFixture(options);
  try {
    return await body(fx);
  } finally {
    fx.cleanup();
  }
}

/** Run the CLI as a child process from the neutral directory; never throws on a non-zero exit. */
function runCli(fx, args) {
  assert.ok(fs.existsSync(CLI), `the CLI under test does not exist yet: ${path.basename(CLI)}`);
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: fx.cwd,
    env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(fx.root) },
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120_000,
  });
  assert.equal(result.error, undefined, `the CLI could not be run: ${result.error?.message}`);
  return result;
}

/** stdout must be exactly one JSON object. */
function parseStdout(result) {
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    assert.fail(`stdout is not one JSON object (exit ${result.status})\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  }
  assert.ok(parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed), 'stdout is a JSON object');
  return parsed;
}

/** Flags every case passes: the fixture as --root and the injectable clock. */
const baseArgs = (fx) => ['--root', fx.root, '--now', NOW.toISOString()];

/** What a --check/--sweep report must be, computed from the library on the untouched fixture. */
function expectedReport(fx, mode) {
  return roundTrip({
    schema: SCHEMA,
    mode,
    durability: assessScratchDurability({ root: fx.root, now: NOW }),
    plan: planSweep({ root: fx.root, now: NOW }),
  });
}

function assertRefused(result, code, label) {
  assert.equal(result.status, 1, `${label}: exit 1 (stderr: ${result.stderr})`);
  const refusal = parseStdout(result);
  assert.equal(refusal.status, 'refused', `${label}: status`);
  assert.equal(refusal.code, code, `${label}: typed code`);
  assert.ok(!('deleted' in refusal), `${label}: a refusal reports no deletion`);
}

/** Every path in `list` must be repo-relative, forward-slash and under `scratch/`. */
function assertScratchRelative(list, label) {
  assert.ok(Array.isArray(list), `${label} is an array`);
  for (const entry of list) {
    assert.equal(typeof entry, 'string', `${label} entries are strings`);
    assert.ok(!entry.includes('\\'), `${label} entry uses forward slashes: ${entry}`);
    assert.ok(!path.isAbsolute(entry) && !/^[A-Za-z]:/u.test(entry), `${label} entry is repo-relative: ${entry}`);
    assert.ok(entry.startsWith('scratch/'), `${label} entry lies under scratch/: ${entry}`);
  }
}

/** Sorted `path|description` lines for everything under `root` except the top-level `.git`. */
function snapshotTree(root) {
  const lines = [];
  const walk = (dir, prefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (prefix === '' && entry.name === '.git') continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        lines.push(`${rel}|symlink`);
      } else if (entry.isDirectory()) {
        lines.push(`${rel}|dir`);
        walk(full, rel);
      } else {
        const stat = fs.lstatSync(full);
        lines.push(`${rel}|file:${stat.size}:${stat.mtimeMs}`);
      }
    }
  };
  walk(root, '');
  return lines.sort();
}

function tryCreateSymlink(target, linkPath, type) {
  try {
    fs.symlinkSync(target, linkPath, type);
    return null;
  } catch (error) {
    return error;
  }
}

function removeLink(linkPath) {
  try {
    fs.unlinkSync(linkPath);
  } catch {
    fs.rmdirSync(linkPath);
  }
}

function isLink(linkPath) {
  try {
    return fs.lstatSync(linkPath).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * One repository carrying every class at once. Returns the expected partition.
 * Referenced: tracked .md (backtick / link / sentence-final / backslash forms),
 * .json and .txt; the young file is referenced too. Outside the root-level
 * scratch/ directory sit old files that no sweep may ever touch.
 */
function buildMixed(fx, { realClock = false } = {}) {
  const put = (rel, content, days) => (realClock ? writeAged(fx, rel, days, content) : fx.write(rel, content, days));
  const age = realClock ? setRealAge : setAge;
  put('scratch/notes/a.md', undefined, 30);
  put('scratch/data/b.json', undefined, 30);
  put('scratch/c.txt', undefined, 30);
  put('scratch/fresh-ref.md', undefined, 1);
  put('scratch/win/w.md', undefined, 30);
  put('scratch/old-unref.md', undefined, 15);
  put('scratch/sub/deep/old-unref2.md', undefined, 40);
  put('scratch/recent-unref.md', undefined, 13);
  put('scratch/today.md', undefined, 0);
  put('stray-old.txt', undefined, 100);
  put('src/scratch/nested-old.md', undefined, 100);
  put('scratch-notes/old.md', undefined, 100);
  fx.commitFiles({
    'docs/plan.md':
      'Draft in `scratch/notes/a.md`, data in [b](scratch/data/b.json), fresh in scratch/fresh-ref.md.\n'
      + 'Windows spelling: scratch\\win\\w.md\n',
    'config/refs.json': '{"artifact": "scratch/c.txt"}\n',
    'docs/old-tracked.md': 'tracked and old\n',
  });
  age(fx.abs('docs/old-tracked.md'), 100);
  return {
    referenced: sorted([
      'scratch/notes/a.md',
      'scratch/data/b.json',
      'scratch/c.txt',
      'scratch/fresh-ref.md',
      'scratch/win/w.md',
    ]),
    unreferencedOld: sorted(['scratch/old-unref.md', 'scratch/sub/deep/old-unref2.md']),
    neither: sorted(['scratch/recent-unref.md', 'scratch/today.md']),
  };
}

// ---------------------------------------------------------------------------
// Helpers of the C-S-T3 cases (Critic round 1, scratch-sweep-round1.md).
//
// --apply refuses --now (F3), so a C-S-T3 case never passes --now to any mode
// and ages its files against the REAL clock instead: the ages used (30-60 days)
// sit far from the 14-day threshold, so the real clock cannot flip a verdict.
// ---------------------------------------------------------------------------

/** mtime = real now minus `days`. */
function setRealAge(file, days) {
  const when = new Date(Date.now() - days * DAY_MS);
  fs.utimesSync(file, when, when);
}

/** Write a file (content defaults to its own repo-relative path) aged against the real clock. */
function writeAged(fx, rel, days, content) {
  const file = fx.write(rel, content);
  setRealAge(file, days);
  return file;
}

/** The only flag every C-S-T3 case passes besides its mode: the fixture as --root. Never --now. */
const realClockArgs = (fx) => ['--root', fx.root];

/** runCli with extra child environment variables and extra node arguments (e.g. --import). */
function runCliWith(fx, args, { env = {}, nodeArgs = [] } = {}) {
  assert.ok(fs.existsSync(CLI), `the CLI under test does not exist yet: ${path.basename(CLI)}`);
  const result = spawnSync(process.execPath, [...nodeArgs, CLI, ...args], {
    cwd: fx.cwd,
    env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(fx.root), ...env },
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120_000,
  });
  assert.equal(result.error, undefined, `the CLI could not be run: ${result.error?.message}`);
  return result;
}

/**
 * Make a committed file unreadable for the current user (chmod 000 elsewhere, a deny-read ACE on
 * win32) and register the restore with the fixture. Returns `{ skip: reason }` when the platform
 * cannot make the file unreadable reliably (e.g. a privileged user), `{}` when it did.
 */
function makeUnreadable(fx, rel) {
  const file = fx.abs(rel);
  let restore;
  if (process.platform === 'win32') {
    const account = process.env.USERDOMAIN && process.env.USERNAME
      ? `${process.env.USERDOMAIN}\\${process.env.USERNAME}`
      : os.userInfo().username;
    try {
      execFileSync('icacls', [file, '/deny', `${account}:(RD)`], { stdio: 'ignore', windowsHide: true });
    } catch (error) {
      return { skip: `icacls refused to deny read access (${error.message})` };
    }
    restore = () => execFileSync('icacls', [file, '/remove:d', account], { stdio: 'ignore', windowsHide: true });
  } else {
    fs.chmodSync(file, 0o000);
    restore = () => fs.chmodSync(file, 0o644);
  }
  fx.onCleanup(restore);
  try {
    fs.readFileSync(file);
  } catch {
    return {};
  }
  return { skip: 'the file is still readable after the permission change (privileged user?)' };
}

/**
 * Preload (node --import) that swaps a directory for a link at one exact moment: the first
 * realpath call on the planned file, which the CLI makes AFTER it has planned the file and
 * lstat-ed it as a regular file. That is the plan-to-unlink window of a swapped parent, hit
 * deterministically -- no timing race. A marker file proves the swap happened.
 */
const SWAP_HOOK_SOURCE = [
  "import fs from 'node:fs';",
  "import { syncBuiltinESMExports } from 'node:module';",
  "import path from 'node:path';",
  'const target = path.resolve(process.env.C_S_T3_SWAP_TARGET).toLowerCase();',
  'let fired = false;',
  'function swap() {',
  '  fired = true;',
  '  fs.rmSync(process.env.C_S_T3_SWAP_DIR, { recursive: true, force: true });',
  '  fs.symlinkSync(process.env.C_S_T3_SWAP_LINK_TARGET, process.env.C_S_T3_SWAP_DIR, process.env.C_S_T3_SWAP_TYPE);',
  "  fs.writeFileSync(process.env.C_S_T3_SWAP_MARKER, 'swapped\\n');",
  '}',
  'function wrap(original) {',
  '  return function (p, ...rest) {',
  "    if (!fired && typeof p === 'string' && path.resolve(p).toLowerCase() === target) swap();",
  '    return original.call(this, p, ...rest);',
  '  };',
  '}',
  'const wrapped = wrap(fs.realpathSync);',
  'wrapped.native = wrap(fs.realpathSync.native);',
  'fs.realpathSync = wrapped;',
  'syncBuiltinESMExports();',
].join('\n');

// ---------------------------------------------------------------------------
// Helpers of the C-S-T5 cases (Critic delta findings on the scratch sweep).
//
// The F2 swap pin above (SWAP_HOOK_SOURCE) fires on the FIRST realpath call on the planned file,
// and the physical-scratch-boundary walk of the planning phase already makes that call -- so it
// swaps during planning and the plan simply never lists the file. Nothing in that case reaches the
// containment branch of applyPlan (the realpath-and-relative check just before unlinkSync). The
// hook below swaps in the APPLY phase only: on the first realpath call on the target made after
// the first unlink of the run. Planning never unlinks, so that call is applyPlan's own, made after
// lstat saw a regular file and before unlinkSync. The fixtures keep a control file that sorts
// before the victim, so its deletion opens the apply phase before the victim is looked at.
// ---------------------------------------------------------------------------

const APPLY_SWAP_HOOK_SOURCE = [
  "import fs from 'node:fs';",
  "import { syncBuiltinESMExports } from 'node:module';",
  "import path from 'node:path';",
  'const target = path.resolve(process.env.C_S_T5_SWAP_TARGET).toLowerCase();',
  'let unlinks = 0;',
  'let targetCalls = 0;',
  'let fired = false;',
  'function swap() {',
  '  fired = true;',
  '  fs.rmSync(process.env.C_S_T5_SWAP_DIR, { recursive: true, force: true });',
  '  fs.symlinkSync(process.env.C_S_T5_SWAP_LINK_TARGET, process.env.C_S_T5_SWAP_DIR, process.env.C_S_T5_SWAP_TYPE);',
  "  fs.writeFileSync(process.env.C_S_T5_SWAP_MARKER, JSON.stringify({ unlinksBefore: unlinks, targetRealpathCallsBefore: targetCalls }) + '\\n');",
  '}',
  'function wrapRealpath(original) {',
  '  return function (p, ...rest) {',
  "    if (!fired && typeof p === 'string' && path.resolve(p).toLowerCase() === target) {",
  '      if (unlinks > 0) swap();',
  '      else targetCalls += 1;',
  '    }',
  '    return original.call(this, p, ...rest);',
  '  };',
  '}',
  'const originalUnlink = fs.unlinkSync;',
  'fs.unlinkSync = function (p, ...rest) {',
  '  const result = originalUnlink.call(this, p, ...rest);',
  '  if (!fired) unlinks += 1;',
  '  return result;',
  '};',
  'const wrapped = wrapRealpath(fs.realpathSync);',
  'wrapped.native = wrapRealpath(fs.realpathSync.native);',
  'fs.realpathSync = wrapped;',
  'syncBuiltinESMExports();',
].join('\n');

const T5_REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** The upper-case drive letter of an absolute win32 path, or null. */
const driveLetter = (p) => /^([A-Za-z]):/u.exec(path.resolve(p))?.[1].toUpperCase() ?? null;

/**
 * A fresh directory on a volume other than the fixture's, win32 only (elsewhere path.relative never
 * returns an absolute path, so there is no cross-volume case to pin). Prefers a fresh directory under
 * this repository's own scratch/ when the repository lives on another volume than the fixture, then
 * falls back to the first writable root of any other existing drive letter D: to Z:. Returns
 * `{ dir }` (removed with the fixture) or `{ skip: reason }`.
 */
function createCrossVolumeDirectory(fx) {
  if (process.platform !== 'win32') {
    return { skip: 'a cross-volume path.relative() result (an absolute path) exists only on win32; this platform has one root' };
  }
  const fixtureDrive = driveLetter(fx.root);
  const bases = [];
  if (driveLetter(T5_REPO_ROOT) !== fixtureDrive && fs.existsSync(path.join(T5_REPO_ROOT, '.git'))) {
    bases.push(path.join(T5_REPO_ROOT, 'scratch'));
  }
  for (let code = 'D'.charCodeAt(0); code <= 'Z'.charCodeAt(0); code += 1) {
    const letter = String.fromCharCode(code);
    if (letter !== fixtureDrive && fs.existsSync(`${letter}:\\`)) bases.push(`${letter}:\\`);
  }
  for (const base of bases) {
    try {
      fs.mkdirSync(base, { recursive: true });
      const dir = fs.realpathSync(fs.mkdtempSync(path.join(base, 'c-s-t5-outside-')));
      fx.onCleanup(() => fs.rmSync(dir, { recursive: true, force: true }));
      return { dir };
    } catch {
      // this volume is not writable for us: try the next one
    }
  }
  return { skip: `no second writable volume besides ${fixtureDrive ?? 'the fixture volume'}: (candidates tried: ${bases.join(', ') || 'none exist'})` };
}

describe('scratch-sweep CLI (PO decision P, slice C-S2)', () => {
  const savedGitEnv = new Map();

  before(() => {
    // A parent git process (hook, worktree) leaks GIT_DIR and friends into children; the
    // throwaway repositories must be addressed by their own cwd and --root alone.
    for (const key of Object.keys(process.env)) {
      if (key.toUpperCase().startsWith('GIT_')) {
        savedGitEnv.set(key, process.env[key]);
        delete process.env[key];
      }
    }
  });

  after(() => {
    for (const [key, value] of savedGitEnv) process.env[key] = value;
  });

  describe('read-only modes', () => {
    test('with no mode flag the CLI runs --check: one JSON object, exit 0 despite durability warnings, nothing on disk changes', () =>
      inFixture({}, (fx) => {
        const expected = buildMixed(fx);
        const expectedCheck = expectedReport(fx, 'check');
        const treeBefore = snapshotTree(fx.root);

        const implicit = runCli(fx, baseArgs(fx));
        const explicit = runCli(fx, [...baseArgs(fx), '--check']);

        assert.equal(implicit.status, 0, `exit 0 (stderr: ${implicit.stderr})`);
        assert.equal(explicit.status, 0, `exit 0 with an explicit --check (stderr: ${explicit.stderr})`);
        const report = parseStdout(implicit);
        assert.deepEqual(report, expectedCheck, 'the report is exactly the schema/mode envelope around the two library results');
        assert.deepEqual(parseStdout(explicit), report, 'an explicit --check equals the default');
        assert.deepEqual(sorted(report.durability.referenced), expected.referenced, 'the durability warnings are present, yet the exit code is 0');
        assert.deepEqual(sorted(report.plan.delete), expected.unreferencedOld);
        assert.deepEqual(snapshotTree(fx.root), treeBefore, 'nothing on disk changed');
      }));

    test('--sweep reports the same shape with mode "sweep" and plans only: nothing on disk changes', () =>
      inFixture({}, (fx) => {
        const expected = buildMixed(fx);
        const expectedSweep = expectedReport(fx, 'sweep');
        const treeBefore = snapshotTree(fx.root);

        const result = runCli(fx, [...baseArgs(fx), '--sweep']);

        assert.equal(result.status, 0, `exit 0 (stderr: ${result.stderr})`);
        const report = parseStdout(result);
        assert.deepEqual(report, expectedSweep);
        assert.equal(report.mode, 'sweep');
        assert.deepEqual(sorted(report.plan.delete), expected.unreferencedOld);
        for (const rel of expected.unreferencedOld) assert.ok(fx.exists(rel), `${rel} is still on disk after --sweep`);
        assert.deepEqual(snapshotTree(fx.root), treeBefore, 'nothing on disk changed');
      }));

    test('--now injects the clock: the same file is planned at one instant and not at an earlier one', () =>
      inFixture({}, (fx) => {
        fx.write('scratch/age-15.md', undefined, 15);
        const planAt = (when) => parseStdout(runCli(fx, ['--root', fx.root, '--now', when.toISOString(), '--check'])).plan.delete;

        assert.deepEqual(planAt(NOW), ['scratch/age-15.md'], '15 days old at the injected clock');
        assert.deepEqual(planAt(new Date(NOW.getTime() - 2 * DAY_MS)), [], '13 days old at an earlier injected clock');
      }));
  });

  describe('--apply', () => {
    test('deletes exactly the files of the plan: no directory, nothing outside scratch/, no referenced or recent file; a second run deletes nothing', () =>
      inFixture({}, (fx) => {
        const expected = buildMixed(fx, { realClock: true });
        const treeBefore = snapshotTree(fx.root);

        const result = runCli(fx, [...realClockArgs(fx), '--apply']);

        assert.equal(result.status, 0, `exit 0 (stderr: ${result.stderr})`);
        const report = parseStdout(result);
        assert.equal(report.mode, 'apply');
        assertScratchRelative(report.deleted, 'deleted');
        assert.deepEqual(sorted(report.deleted), expected.unreferencedOld);
        for (const rel of [...expected.referenced, ...expected.neither]) {
          assert.ok(!report.deleted.includes(rel), `${rel} is never reported deleted`);
          assert.ok(fx.exists(rel), `${rel} is still on disk`);
        }
        const expectedTree = treeBefore.filter((line) => !expected.unreferencedOld.some((rel) => line.startsWith(`${rel}|`)));
        assert.deepEqual(snapshotTree(fx.root), expectedTree, 'only the planned files vanished; their now-empty directories and every other path remain');

        const again = runCli(fx, [...realClockArgs(fx), '--apply']);
        assert.equal(again.status, 0, `a second --apply exits 0 (stderr: ${again.stderr})`);
        assert.deepEqual(parseStdout(again).deleted, [], 'a second --apply has nothing left to delete');
        assert.deepEqual(snapshotTree(fx.root), expectedTree);
      }));

    test('recomputes the plan at apply time: a file that became referenced or fresh after --sweep survives', () =>
      inFixture({}, (fx) => {
        writeAged(fx, 'scratch/stays-old.md', 30);
        writeAged(fx, 'scratch/becomes-referenced.md', 30);
        writeAged(fx, 'scratch/becomes-fresh.md', 30);
        const planned = parseStdout(runCli(fx, [...realClockArgs(fx), '--sweep'])).plan.delete;
        assert.deepEqual(sorted(planned), [
          'scratch/becomes-fresh.md',
          'scratch/becomes-referenced.md',
          'scratch/stays-old.md',
        ]);
        fx.commitFiles({ 'docs/late-reference.md': 'now durable: scratch/becomes-referenced.md\n' });
        setRealAge(fx.abs('scratch/becomes-fresh.md'), 1);

        const result = runCli(fx, [...realClockArgs(fx), '--apply']);

        assert.equal(result.status, 0, `exit 0 (stderr: ${result.stderr})`);
        assert.deepEqual(parseStdout(result).deleted, ['scratch/stays-old.md']);
        assert.ok(!fx.exists('scratch/stays-old.md'));
        assert.ok(fx.exists('scratch/becomes-referenced.md'), 'the newly referenced file survives');
        assert.ok(fx.exists('scratch/becomes-fresh.md'), 'the newly fresh file survives');
      }));

    test('never deletes anything under scratch/dispatch/, however old and unreferenced, but still sweeps a look-alike sibling directory', () =>
      inFixture({}, (fx) => {
        writeAged(fx, 'scratch/dispatch/briefing-live.md', 40);
        writeAged(fx, 'scratch/dispatch/C-S2/notes/run.json', 60);
        writeAged(fx, 'scratch/old-elsewhere.md', 40);
        writeAged(fx, 'scratch/dispatch-notes/old.md', 40);

        const result = runCli(fx, [...realClockArgs(fx), '--apply']);

        assert.equal(result.status, 0, `exit 0 (stderr: ${result.stderr})`);
        const report = parseStdout(result);
        assert.deepEqual(sorted(report.deleted), ['scratch/dispatch-notes/old.md', 'scratch/old-elsewhere.md']);
        assert.ok(fx.exists('scratch/dispatch/briefing-live.md'), 'a dispatch file survives');
        assert.ok(fx.exists('scratch/dispatch/C-S2/notes/run.json'), 'a nested dispatch file survives');
        for (const entry of report.deleted) assert.ok(!entry.startsWith('scratch/dispatch/'), `${entry} is not under scratch/dispatch/`);
      }));

    test('never follows or deletes a directory link (a junction on win32) inside scratch/', (t) =>
      inFixture({}, (fx) => {
        const outside = fx.outsideDir();
        const outsideFile = path.join(outside, 'sub', 'outside-old.md');
        fs.mkdirSync(path.dirname(outsideFile), { recursive: true });
        fs.writeFileSync(outsideFile, 'outside\n');
        setRealAge(outsideFile, 40);
        writeAged(fx, 'scratch/real-old.md', 20);
        const link = fx.abs('scratch/linked-dir');
        // A junction needs no privilege on win32; elsewhere a plain directory symlink is allowed.
        const failure = tryCreateSymlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
        if (failure) {
          if (process.platform === 'win32') {
            t.skip(`directory link creation refused on win32 (${failure.code ?? failure.message})`);
            return;
          }
          throw failure;
        }
        fx.onCleanup(() => removeLink(link));
        const outsideBefore = snapshotTree(outside);

        const result = runCli(fx, [...realClockArgs(fx), '--apply']);

        assert.equal(result.status, 0, `exit 0 (stderr: ${result.stderr})`);
        assert.deepEqual(parseStdout(result).deleted, ['scratch/real-old.md']);
        assert.ok(isLink(link), 'the link itself is still there');
        assert.ok(fs.existsSync(outsideFile), 'the file behind the link is untouched');
        assert.deepEqual(snapshotTree(outside), outsideBefore, 'nothing behind the link changed');
      }));

    test('never follows or deletes a file symlink inside scratch/', (t) =>
      inFixture({}, (fx) => {
        const outside = fx.outsideDir();
        const outsideFile = path.join(outside, 'outside-old.md');
        fs.writeFileSync(outsideFile, 'outside\n');
        setRealAge(outsideFile, 40);
        writeAged(fx, 'scratch/real-old.md', 20);
        const link = fx.abs('scratch/linked-file.md');
        const failure = tryCreateSymlink(outsideFile, link, 'file');
        if (failure) {
          if (process.platform === 'win32') {
            t.skip(`file symlink creation refused on win32 (${failure.code ?? failure.message})`);
            return;
          }
          throw failure;
        }
        fx.onCleanup(() => removeLink(link));
        try {
          fs.lutimesSync(link, new Date(Date.now() - 40 * DAY_MS), new Date(Date.now() - 40 * DAY_MS));
        } catch {
          // the link's own mtime is real-clock old relative to NOW anyway
        }

        const result = runCli(fx, [...realClockArgs(fx), '--apply']);

        assert.equal(result.status, 0, `exit 0 (stderr: ${result.stderr})`);
        assert.deepEqual(parseStdout(result).deleted, ['scratch/real-old.md']);
        assert.ok(isLink(link), 'the link itself is still there');
        assert.ok(fs.existsSync(outsideFile), 'the file behind the link is untouched');
      }));

    test('deletes nothing when scratch/ itself is a link to a directory outside the repository', (t) =>
      inFixture({}, (fx) => {
        const outside = fx.outsideDir();
        for (const [rel, days] of [['old.md', 40], ['nested/old-too.md', 60]]) {
          const file = path.join(outside, ...rel.split('/'));
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, 'outside\n');
          setRealAge(file, days);
        }
        const link = fx.abs('scratch');
        const failure = tryCreateSymlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
        if (failure) {
          if (process.platform === 'win32') {
            t.skip(`directory link creation refused on win32 (${failure.code ?? failure.message})`);
            return;
          }
          throw failure;
        }
        fx.onCleanup(() => removeLink(link));
        const outsideBefore = snapshotTree(outside);

        const result = runCli(fx, [...realClockArgs(fx), '--apply']);

        assert.equal(result.status, 0, `exit 0 (stderr: ${result.stderr})`);
        assert.deepEqual(parseStdout(result).deleted, []);
        assert.ok(isLink(link), 'scratch/ is still the link');
        assert.deepEqual(snapshotTree(outside), outsideBefore, 'nothing behind the link changed');
      }));
  });

  describe('typed refusals', () => {
    test('an unknown flag is refused with SCRATCH-SWEEP-USAGE, exit 1, and nothing is deleted, wherever it sits and even next to --apply', () =>
      inFixture({}, (fx) => {
        writeAged(fx, 'scratch/old.md', 40);
        const treeBefore = snapshotTree(fx.root);
        const variants = [
          [...realClockArgs(fx), '--bogus'],
          ['--bogus', ...realClockArgs(fx)],
          [...realClockArgs(fx), '--apply', '--bogus'],
          [...realClockArgs(fx), '--max-age', '1', '--apply'],
        ];

        for (const args of variants) {
          assertRefused(runCli(fx, args), 'SCRATCH-SWEEP-USAGE', args.join(' '));
          assert.ok(fx.exists('scratch/old.md'), `nothing deleted by: ${args.join(' ')}`);
        }
        assert.deepEqual(snapshotTree(fx.root), treeBefore);
      }));

    test('two mode flags are refused with SCRATCH-SWEEP-USAGE, exit 1, and nothing is deleted', () =>
      inFixture({}, (fx) => {
        writeAged(fx, 'scratch/old.md', 40);
        const treeBefore = snapshotTree(fx.root);
        const pairs = [
          ['--check', '--sweep'],
          ['--sweep', '--apply'],
          ['--apply', '--check'],
          ['--apply', '--sweep'],
        ];

        for (const pair of pairs) {
          assertRefused(runCli(fx, [...realClockArgs(fx), ...pair]), 'SCRATCH-SWEEP-USAGE', pair.join(' '));
          assert.ok(fx.exists('scratch/old.md'), `nothing deleted by: ${pair.join(' ')}`);
        }
        assert.deepEqual(snapshotTree(fx.root), treeBefore);
      }));

    test('a --root that is not a git work tree is refused with SCRATCH-SWEEP-NOT-A-REPOSITORY in every mode, exit 1, nothing deleted', () =>
      inFixture({ repo: false }, (fx) => {
        writeAged(fx, 'scratch/old.md', 40);
        const treeBefore = snapshotTree(fx.root);

        for (const modeArgs of [[], ['--check'], ['--sweep'], ['--apply']]) {
          assertRefused(runCli(fx, [...realClockArgs(fx), ...modeArgs]), 'SCRATCH-SWEEP-NOT-A-REPOSITORY', `mode ${modeArgs.join('') || 'default'}`);
          assert.ok(fx.exists('scratch/old.md'), `nothing deleted in mode ${modeArgs.join('') || 'default'}`);
        }
        assert.deepEqual(snapshotTree(fx.root), treeBefore);
      }));
  });

  /**
   * C-S-T3: the settled rules from the Critic's round-1 record
   * (specs/sprint-alfred-epic/evidence/critic-2026-10-07/scratch-sweep-round1.md).
   * Written against the CLI as it stood when the findings were raised, so cases for
   * F1, F3, F4, F6 and F7 are RED until the fix dispatch lands; F2 pins behaviour that
   * already holds and must keep holding.
   */
  describe('C-S-T3: Critic round-1 findings', () => {
    describe('F1: a live plugin root under scratch/ is never planned and never deleted', () => {
      /**
       * "Live" is what lib/physical-scratch-boundary.mjs scratchLivePluginRoots() says: the
       * executing module's own installation plus $CLAUDE_PLUGIN_ROOT when that directory has
       * a hooks/ directory and a .claude-plugin/plugin.json file. The fixture therefore
       * builds exactly that shape under scratch/ and hands the CLI the root through the
       * environment variable the boundary module reads -- no production change needed.
       */
      function buildLiveRoot(fx) {
        const live = 'scratch/installs/live-pipeline-core';
        const liveFiles = [
          `${live}/hooks/guard.mjs`,
          `${live}/.claude-plugin/plugin.json`,
          `${live}/lib/deep/helper.md`,
          `${live}/notes.md`,
        ];
        for (const rel of liveFiles) writeAged(fx, rel, 40);
        const stale = [
          'scratch/installs/live-pipeline-core-old/stale.md',
          'scratch/installs/other/stale.md',
          'scratch/stale-sibling.md',
        ];
        for (const rel of stale) writeAged(fx, rel, 40);
        return { liveDir: fx.abs(live), liveFiles, stale: sorted(stale) };
      }

      test('C-S-T3 F1: --check, --sweep and --apply leave a live plugin root alone, however old and unreferenced, and still sweep its look-alike siblings', () =>
        inFixture({}, (fx) => {
          const { liveDir, liveFiles, stale } = buildLiveRoot(fx);
          const env = { CLAUDE_PLUGIN_ROOT: liveDir };

          for (const mode of ['--check', '--sweep']) {
            const result = runCliWith(fx, [...realClockArgs(fx), mode], { env });
            assert.equal(result.status, 0, `${mode}: exit 0 (stderr: ${result.stderr})`);
            const planned = parseStdout(result).plan.delete;
            assert.deepEqual(sorted(planned), stale, `${mode}: the plan lists the stale files and nothing under the live root`);
          }

          const liveBefore = snapshotTree(liveDir);
          const applied = runCliWith(fx, [...realClockArgs(fx), '--apply'], { env });
          assert.equal(applied.status, 0, `--apply: exit 0 (stderr: ${applied.stderr})`);
          assert.deepEqual(sorted(parseStdout(applied).deleted), stale, '--apply deletes the stale files and nothing under the live root');
          for (const rel of liveFiles) assert.ok(fx.exists(rel), `${rel} is still on disk`);
          for (const rel of stale) assert.ok(!fx.exists(rel), `${rel} was swept`);
          assert.deepEqual(snapshotTree(liveDir), liveBefore, 'the live root is untouched');
        }));
    });

    describe('F3: --apply always uses the real clock', () => {
      test('C-S-T3 F3: --apply together with --now is refused with SCRATCH-SWEEP-USAGE, exit 1, and nothing is deleted', () =>
        inFixture({}, (fx) => {
          writeAged(fx, 'scratch/old.md', 40);
          const treeBefore = snapshotTree(fx.root);
          const farFuture = '2099-01-01T00:00:00.000Z';
          const variants = [
            [...realClockArgs(fx), '--apply', '--now', NOW.toISOString()],
            [...realClockArgs(fx), '--now', NOW.toISOString(), '--apply'],
            ['--now', farFuture, ...realClockArgs(fx), '--apply'],
          ];

          for (const args of variants) {
            assertRefused(runCli(fx, args), 'SCRATCH-SWEEP-USAGE', args.join(' '));
            assert.ok(fx.exists('scratch/old.md'), `nothing deleted by: ${args.join(' ')}`);
          }
          assert.deepEqual(snapshotTree(fx.root), treeBefore);

          const plain = runCli(fx, [...realClockArgs(fx), '--apply']);
          assert.equal(plain.status, 0, `--apply without --now still works (stderr: ${plain.stderr})`);
          assert.deepEqual(parseStdout(plain).deleted, ['scratch/old.md'], 'the same tree is swept once --now is gone');
        }));
    });

    describe('F4: the previewed plan is the set --apply deletes', () => {
      test('C-S-T3 F4: --check and --sweep never list a file under scratch/dispatch/, and their plan equals the set --apply deletes on the same tree', () =>
        inFixture({}, (fx) => {
          writeAged(fx, 'scratch/dispatch/briefing-live.md', 40);
          writeAged(fx, 'scratch/dispatch/C-S2/notes/run.json', 60);
          writeAged(fx, 'scratch/old-elsewhere.md', 40);
          writeAged(fx, 'scratch/dispatch-notes/old.md', 40);
          const expected = ['scratch/dispatch-notes/old.md', 'scratch/old-elsewhere.md'];

          const previews = {};
          for (const mode of ['--check', '--sweep']) {
            const result = runCli(fx, [...realClockArgs(fx), mode]);
            assert.equal(result.status, 0, `${mode}: exit 0 (stderr: ${result.stderr})`);
            previews[mode] = sorted(parseStdout(result).plan.delete);
            for (const entry of previews[mode]) assert.ok(!entry.startsWith('scratch/dispatch/'), `${mode}: ${entry} is under scratch/dispatch/`);
            assert.deepEqual(previews[mode], expected, `${mode}: the look-alike sibling stays in the plan`);
          }

          const applied = runCli(fx, [...realClockArgs(fx), '--apply']);
          assert.equal(applied.status, 0, `--apply: exit 0 (stderr: ${applied.stderr})`);
          assert.deepEqual(sorted(parseStdout(applied).deleted), previews['--sweep'], 'the previewed plan equals the applied set');
          assert.ok(fx.exists('scratch/dispatch/briefing-live.md'), 'a dispatch file survives');
          assert.ok(fx.exists('scratch/dispatch/C-S2/notes/run.json'), 'a nested dispatch file survives');
        }));
    });

    describe('F6: an unreadable tracked reference document makes nothing deletable', () => {
      test('C-S-T3 F6: with one tracked .md unreadable the plan is empty, durability carries a warning, and --apply deletes nothing', (t) =>
        inFixture({}, (fx) => {
          fx.commitFiles({ 'docs/keeps.md': 'The notes live in scratch/protected-by-doc.md\n' });
          writeAged(fx, 'scratch/protected-by-doc.md', 40);
          writeAged(fx, 'scratch/other-old.md', 40);
          const made = makeUnreadable(fx, 'docs/keeps.md');
          if (made.skip) {
            t.skip(made.skip);
            return;
          }
          const treeBefore = snapshotTree(fx.root);

          for (const mode of ['--check', '--sweep']) {
            const result = runCli(fx, [...realClockArgs(fx), mode]);
            assert.equal(result.status, 0, `${mode}: exit 0 (stderr: ${result.stderr})`);
            const report = parseStdout(result);
            assert.deepEqual(report.plan.delete, [], `${mode}: nothing is deletable while a reference document is unreadable`);
            assert.ok(report.durability.warning, `${mode}: the durability result carries a warning`);
          }

          const applied = runCli(fx, [...realClockArgs(fx), '--apply']);
          assert.deepEqual(parseStdout(applied).deleted ?? [], [], '--apply deletes nothing');
          assert.deepEqual(snapshotTree(fx.root), treeBefore, 'nothing on disk changed');
        }));
    });

    describe('F7: files tracked by git are never sweep candidates', () => {
      test('C-S-T3 F7: tracked files under a non-ignored scratch/ are never planned or deleted; an untracked sibling still is', () =>
        inFixture({}, (fx) => {
          // scratch/ is NOT ignored here, so git can track files under it.
          fx.commitFiles({ '.gitignore': '# nothing is ignored\n' });
          const tracked = [
            'scratch/tracked-old.md',
            'scratch/tracked dir/old note.json',
            'scratch/tracked-sub/deep/old.txt',
          ];
          // Content that does not name its own path: a self-reference would count as a durable reference.
          fx.commitFiles(Object.fromEntries(tracked.map((rel) => [rel, 'tracked scratch note\n'])));
          for (const rel of tracked) setRealAge(fx.abs(rel), 40);
          writeAged(fx, 'scratch/untracked-old.md', 40);

          for (const mode of ['--check', '--sweep']) {
            const result = runCli(fx, [...realClockArgs(fx), mode]);
            assert.equal(result.status, 0, `${mode}: exit 0 (stderr: ${result.stderr})`);
            assert.deepEqual(parseStdout(result).plan.delete, ['scratch/untracked-old.md'], `${mode}: only the untracked file is planned`);
          }

          const applied = runCli(fx, [...realClockArgs(fx), '--apply']);
          assert.equal(applied.status, 0, `--apply: exit 0 (stderr: ${applied.stderr})`);
          assert.deepEqual(parseStdout(applied).deleted, ['scratch/untracked-old.md']);
          for (const rel of tracked) assert.ok(fx.exists(rel), `${rel} is still on disk`);
          assert.deepEqual(
            git(fx.root, ['status', '--porcelain', '--untracked-files=no']).trim(),
            '',
            'git sees no deleted tracked file',
          );
        }));
    });

    describe('F2: the pre-unlink containment check holds when a parent directory is swapped for a link', () => {
      const linkType = process.platform === 'win32' ? 'junction' : 'dir';

      function skipOrThrow(t, failure) {
        if (process.platform === 'win32') {
          t.skip(`directory link creation refused on win32 (${failure.code ?? failure.message})`);
          return true;
        }
        throw failure;
      }

      for (const scenario of ['outside the repository', 'inside the repository but outside scratch/']) {
        test(`C-S-T3 F2: a planned file whose parent directory became a link to a directory ${scenario} is not deleted (swapped before --apply)`, (t) =>
          inFixture({}, (fx) => {
            const outsideRepo = scenario === 'outside the repository';
            const targetDir = outsideRepo ? fx.outsideDir() : fx.abs('src');
            const beyondFile = path.join(targetDir, 'old.md');
            fs.mkdirSync(targetDir, { recursive: true });
            fs.writeFileSync(beyondFile, 'beyond scratch\n');
            setRealAge(beyondFile, 40);
            writeAged(fx, 'scratch/victim/old.md', 40);
            writeAged(fx, 'scratch/control-old.md', 40);
            const planned = parseStdout(runCli(fx, [...realClockArgs(fx), '--sweep'])).plan.delete;
            assert.deepEqual(sorted(planned), ['scratch/control-old.md', 'scratch/victim/old.md'], 'the file is a planned candidate before the swap');

            fs.rmSync(fx.abs('scratch/victim'), { recursive: true, force: true });
            const link = fx.abs('scratch/victim');
            const failure = tryCreateSymlink(targetDir, link, linkType);
            if (failure && skipOrThrow(t, failure)) return;
            fx.onCleanup(() => removeLink(link));
            const beyondBefore = snapshotTree(targetDir);

            const result = runCli(fx, [...realClockArgs(fx), '--apply']);

            assert.equal(result.status, 0, `exit 0 (stderr: ${result.stderr})`);
            assert.deepEqual(parseStdout(result).deleted, ['scratch/control-old.md']);
            assert.ok(isLink(link), 'the link itself is still there');
            assert.ok(fs.existsSync(beyondFile), 'the file behind the link survives');
            assert.deepEqual(snapshotTree(targetDir), beyondBefore, 'nothing behind the link changed');
          }));
      }

      test('C-S-T3 F2: a parent directory swapped for a link between planning and unlinking (in-process, no race) leaves the outside file alone', (t) =>
        inFixture({}, (fx) => {
          const outside = fx.outsideDir();
          const outsideFile = path.join(outside, 'old.md');
          fs.writeFileSync(outsideFile, 'beyond scratch\n');
          setRealAge(outsideFile, 40);
          writeAged(fx, 'scratch/victim/old.md', 40);
          writeAged(fx, 'scratch/control-old.md', 40);
          const probe = path.join(fx.cwd, 'link-probe');
          const failure = tryCreateSymlink(outside, probe, linkType);
          if (failure && skipOrThrow(t, failure)) return;
          removeLink(probe);

          const hook = path.join(fx.cwd, 'swap-hook.mjs');
          const marker = path.join(fx.cwd, 'swap-fired.txt');
          fs.writeFileSync(hook, `${SWAP_HOOK_SOURCE}\n`);
          const victimDir = fx.abs('scratch/victim');
          fx.onCleanup(() => removeLink(victimDir));
          const outsideBefore = snapshotTree(outside);

          const result = runCliWith(fx, [...realClockArgs(fx), '--apply'], {
            nodeArgs: ['--import', pathToFileURL(hook).href],
            env: {
              C_S_T3_SWAP_TARGET: fx.abs('scratch/victim/old.md'),
              C_S_T3_SWAP_DIR: victimDir,
              C_S_T3_SWAP_LINK_TARGET: outside,
              C_S_T3_SWAP_TYPE: linkType,
              C_S_T3_SWAP_MARKER: marker,
            },
          });

          assert.ok(fs.existsSync(marker), `the swap happened inside the CLI run (stderr: ${result.stderr})`);
          assert.equal(result.status, 0, `exit 0 (stderr: ${result.stderr})`);
          assert.ok(!parseStdout(result).deleted.includes('scratch/victim/old.md'), 'the swapped file is not reported deleted');
          assert.ok(isLink(victimDir), 'the link itself is still there');
          assert.ok(fs.existsSync(outsideFile), 'the file behind the link survives');
          assert.deepEqual(snapshotTree(outside), outsideBefore, 'nothing behind the link changed');
        }));
    });
  });

  /**
   * C-S-T5: the containment check of applyPlan itself (realpath of the planned file, then
   * relative() against the physical scratch/), reached AFTER planning. The C-S-T3 F2 hook can no
   * longer reach it (the planning walk calls realpath first), so these cases swap the parent
   * directory for a link only in the apply phase (APPLY_SWAP_HOOK_SOURCE) and prove it three
   * ways: the hook's marker, the apply report's own `plan` still listing the victim (so the swap
   * came after planning), and the victim missing from `deleted` while the outside file survives.
   */
  describe('C-S-T5: the apply-time containment check', () => {
    const linkType = process.platform === 'win32' ? 'junction' : 'dir';

    /**
     * Shared body. `outside` is `{ dir }` or `{ skip }`; `acceptRelative(rel)` states the precondition
     * that makes the case what it claims to be (the relative() result of the swap target against the
     * physical scratch/): `..`-prefixed for the same-volume control, an absolute path across volumes.
     */
    function swapAfterPlanning(t, fx, outside, acceptRelative, relativeLabel) {
      if (outside.skip) {
        t.skip(outside.skip);
        return;
      }
      const outsideFile = path.join(outside.dir, 'old.md');
      fs.writeFileSync(outsideFile, 'beyond scratch\n');
      setRealAge(outsideFile, 40);
      // The control sorts before the victim, so its deletion opens the apply phase first.
      writeAged(fx, 'scratch/a-control-old.md', 40);
      writeAged(fx, 'scratch/victim/old.md', 40);
      const probe = path.join(fx.cwd, 'link-probe');
      const failure = tryCreateSymlink(outside.dir, probe, linkType);
      if (failure) {
        if (process.platform === 'win32') {
          t.skip(`directory link creation refused on win32 (${failure.code ?? failure.message})`);
          return;
        }
        throw failure;
      }
      removeLink(probe);

      const relativeToScratch = path.relative(fs.realpathSync(fx.abs('scratch')), outsideFile);
      assert.ok(acceptRelative(relativeToScratch), `precondition: relative(physical scratch/, swap target file) ${relativeLabel}: ${relativeToScratch}`);
      const planned = parseStdout(runCli(fx, [...realClockArgs(fx), '--sweep'])).plan.delete;
      assert.deepEqual(planned, ['scratch/a-control-old.md', 'scratch/victim/old.md'], 'both files are planned candidates before the swap');

      const hook = path.join(fx.cwd, 'apply-swap-hook.mjs');
      const marker = path.join(fx.cwd, 'apply-swap-fired.json');
      fs.writeFileSync(hook, `${APPLY_SWAP_HOOK_SOURCE}\n`);
      const victimDir = fx.abs('scratch/victim');
      fx.onCleanup(() => removeLink(victimDir));
      const outsideBefore = snapshotTree(outside.dir);

      const result = runCliWith(fx, [...realClockArgs(fx), '--apply'], {
        nodeArgs: ['--import', pathToFileURL(hook).href],
        env: {
          C_S_T5_SWAP_TARGET: fx.abs('scratch/victim/old.md'),
          C_S_T5_SWAP_DIR: victimDir,
          C_S_T5_SWAP_LINK_TARGET: outside.dir,
          C_S_T5_SWAP_TYPE: linkType,
          C_S_T5_SWAP_MARKER: marker,
        },
      });

      // 1. The swap happened, inside the CLI run, in the apply phase (a prior unlink) after planning looked at the file.
      assert.ok(fs.existsSync(marker), `the swap happened inside the CLI run (stderr: ${result.stderr})`);
      const swapped = JSON.parse(fs.readFileSync(marker, 'utf8'));
      assert.ok(swapped.unlinksBefore >= 1, `the swap came after the first deletion, i.e. in the apply phase (${JSON.stringify(swapped)})`);
      assert.ok(swapped.targetRealpathCallsBefore >= 1, `planning had already resolved the file before the swap (${JSON.stringify(swapped)})`);
      assert.equal(result.status, 0, `exit 0 (stderr: ${result.stderr})`);
      const report = parseStdout(result);
      // 2. The plan inside the very same apply report still lists the victim: the swap came after planning.
      assert.ok(report.plan.delete.includes('scratch/victim/old.md'), `the apply report's own plan lists the victim (so the swap did not precede planning): ${JSON.stringify(report.plan.delete)}`);
      // 3. The swapped file is neither deleted nor reported, and nothing behind the link was touched.
      assert.ok(isLink(victimDir), 'the link itself is still there');
      assert.ok(fs.existsSync(outsideFile), 'the file behind the link survives the apply-time containment check');
      assert.deepEqual(snapshotTree(outside.dir), outsideBefore, 'nothing behind the link changed');
      assert.ok(!report.deleted.includes('scratch/victim/old.md'), `the swapped file is not reported deleted: ${JSON.stringify(report.deleted)}`);
      assert.deepEqual(report.deleted, ['scratch/a-control-old.md'], 'the control file is still swept');
    }

    test('C-S-T5: same-volume control: a parent directory swapped for a link to a directory outside scratch/ AFTER planning is refused at apply time and the outside file survives', (t) =>
      inFixture({}, (fx) => {
        swapAfterPlanning(t, fx, { dir: fx.outsideDir() }, (rel) => rel.startsWith('..'), 'climbs out of scratch/ with ..');
      }));

    test('C-S-T5: cross-volume: a parent directory swapped for a junction to a directory on ANOTHER volume AFTER planning is refused at apply time and the outside file survives', (t) =>
      inFixture({}, (fx) => {
        swapAfterPlanning(t, fx, createCrossVolumeDirectory(fx), (rel) => path.isAbsolute(rel), 'is an absolute path (different volume)');
      }));
  });
});
