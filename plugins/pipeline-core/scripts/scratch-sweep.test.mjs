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
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

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
function buildMixed(fx) {
  fx.write('scratch/notes/a.md', undefined, 30);
  fx.write('scratch/data/b.json', undefined, 30);
  fx.write('scratch/c.txt', undefined, 30);
  fx.write('scratch/fresh-ref.md', undefined, 1);
  fx.write('scratch/win/w.md', undefined, 30);
  fx.write('scratch/old-unref.md', undefined, 15);
  fx.write('scratch/sub/deep/old-unref2.md', undefined, 40);
  fx.write('scratch/recent-unref.md', undefined, 13);
  fx.write('scratch/today.md', undefined, 0);
  fx.write('stray-old.txt', undefined, 100);
  fx.write('src/scratch/nested-old.md', undefined, 100);
  fx.write('scratch-notes/old.md', undefined, 100);
  fx.commitFiles({
    'docs/plan.md':
      'Draft in `scratch/notes/a.md`, data in [b](scratch/data/b.json), fresh in scratch/fresh-ref.md.\n'
      + 'Windows spelling: scratch\\win\\w.md\n',
    'config/refs.json': '{"artifact": "scratch/c.txt"}\n',
    'docs/old-tracked.md': 'tracked and old\n',
  });
  setAge(fx.abs('docs/old-tracked.md'), 100);
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
        const expected = buildMixed(fx);
        const treeBefore = snapshotTree(fx.root);

        const result = runCli(fx, [...baseArgs(fx), '--apply']);

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

        const again = runCli(fx, [...baseArgs(fx), '--apply']);
        assert.equal(again.status, 0, `a second --apply exits 0 (stderr: ${again.stderr})`);
        assert.deepEqual(parseStdout(again).deleted, [], 'a second --apply has nothing left to delete');
        assert.deepEqual(snapshotTree(fx.root), expectedTree);
      }));

    test('recomputes the plan at apply time: a file that became referenced or fresh after --sweep survives', () =>
      inFixture({}, (fx) => {
        fx.write('scratch/stays-old.md', undefined, 30);
        fx.write('scratch/becomes-referenced.md', undefined, 30);
        fx.write('scratch/becomes-fresh.md', undefined, 30);
        const planned = parseStdout(runCli(fx, [...baseArgs(fx), '--sweep'])).plan.delete;
        assert.deepEqual(sorted(planned), [
          'scratch/becomes-fresh.md',
          'scratch/becomes-referenced.md',
          'scratch/stays-old.md',
        ]);
        fx.commitFiles({ 'docs/late-reference.md': 'now durable: scratch/becomes-referenced.md\n' });
        setAge(fx.abs('scratch/becomes-fresh.md'), 1);

        const result = runCli(fx, [...baseArgs(fx), '--apply']);

        assert.equal(result.status, 0, `exit 0 (stderr: ${result.stderr})`);
        assert.deepEqual(parseStdout(result).deleted, ['scratch/stays-old.md']);
        assert.ok(!fx.exists('scratch/stays-old.md'));
        assert.ok(fx.exists('scratch/becomes-referenced.md'), 'the newly referenced file survives');
        assert.ok(fx.exists('scratch/becomes-fresh.md'), 'the newly fresh file survives');
      }));

    test('never deletes anything under scratch/dispatch/, however old and unreferenced, but still sweeps a look-alike sibling directory', () =>
      inFixture({}, (fx) => {
        fx.write('scratch/dispatch/briefing-live.md', undefined, 40);
        fx.write('scratch/dispatch/C-S2/notes/run.json', undefined, 60);
        fx.write('scratch/old-elsewhere.md', undefined, 40);
        fx.write('scratch/dispatch-notes/old.md', undefined, 40);

        const result = runCli(fx, [...baseArgs(fx), '--apply']);

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
        setAge(outsideFile, 40);
        fx.write('scratch/real-old.md', undefined, 20);
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

        const result = runCli(fx, [...baseArgs(fx), '--apply']);

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
        setAge(outsideFile, 40);
        fx.write('scratch/real-old.md', undefined, 20);
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
          fs.lutimesSync(link, ageDate(40), ageDate(40));
        } catch {
          // the link's own mtime is real-clock old relative to NOW anyway
        }

        const result = runCli(fx, [...baseArgs(fx), '--apply']);

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
          setAge(file, days);
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

        const result = runCli(fx, [...baseArgs(fx), '--apply']);

        assert.equal(result.status, 0, `exit 0 (stderr: ${result.stderr})`);
        assert.deepEqual(parseStdout(result).deleted, []);
        assert.ok(isLink(link), 'scratch/ is still the link');
        assert.deepEqual(snapshotTree(outside), outsideBefore, 'nothing behind the link changed');
      }));
  });

  describe('typed refusals', () => {
    test('an unknown flag is refused with SCRATCH-SWEEP-USAGE, exit 1, and nothing is deleted, wherever it sits and even next to --apply', () =>
      inFixture({}, (fx) => {
        fx.write('scratch/old.md', undefined, 40);
        const treeBefore = snapshotTree(fx.root);
        const variants = [
          [...baseArgs(fx), '--bogus'],
          ['--bogus', ...baseArgs(fx)],
          [...baseArgs(fx), '--apply', '--bogus'],
          [...baseArgs(fx), '--max-age', '1', '--apply'],
        ];

        for (const args of variants) {
          assertRefused(runCli(fx, args), 'SCRATCH-SWEEP-USAGE', args.join(' '));
          assert.ok(fx.exists('scratch/old.md'), `nothing deleted by: ${args.join(' ')}`);
        }
        assert.deepEqual(snapshotTree(fx.root), treeBefore);
      }));

    test('two mode flags are refused with SCRATCH-SWEEP-USAGE, exit 1, and nothing is deleted', () =>
      inFixture({}, (fx) => {
        fx.write('scratch/old.md', undefined, 40);
        const treeBefore = snapshotTree(fx.root);
        const pairs = [
          ['--check', '--sweep'],
          ['--sweep', '--apply'],
          ['--apply', '--check'],
          ['--apply', '--sweep'],
        ];

        for (const pair of pairs) {
          assertRefused(runCli(fx, [...baseArgs(fx), ...pair]), 'SCRATCH-SWEEP-USAGE', pair.join(' '));
          assert.ok(fx.exists('scratch/old.md'), `nothing deleted by: ${pair.join(' ')}`);
        }
        assert.deepEqual(snapshotTree(fx.root), treeBefore);
      }));

    test('a --root that is not a git work tree is refused with SCRATCH-SWEEP-NOT-A-REPOSITORY in every mode, exit 1, nothing deleted', () =>
      inFixture({ repo: false }, (fx) => {
        fx.write('scratch/old.md', undefined, 40);
        const treeBefore = snapshotTree(fx.root);

        for (const modeArgs of [[], ['--check'], ['--sweep'], ['--apply']]) {
          assertRefused(runCli(fx, [...baseArgs(fx), ...modeArgs]), 'SCRATCH-SWEEP-NOT-A-REPOSITORY', `mode ${modeArgs.join('') || 'default'}`);
          assert.ok(fx.exists('scratch/old.md'), `nothing deleted in mode ${modeArgs.join('') || 'default'}`);
        }
        assert.deepEqual(snapshotTree(fx.root), treeBefore);
      }));
  });
});
