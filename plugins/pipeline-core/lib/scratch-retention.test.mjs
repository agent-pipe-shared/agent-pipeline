/**
 * Pins the API of `lib/scratch-retention.mjs` (PO decision P, sprint-alfred
 * slice C-S1): a read-only durability assessment of `scratch/` and a sweep
 * PLAN. Neither function deletes anything -- applying a plan is a separate,
 * explicitly invoked step (slice C-S2) and is not part of this contract.
 *
 * Contract pinned here:
 *
 *   assessScratchDurability({ root, now })
 *     -> { referenced: string[], unreferencedOld: string[] }  (+ `warning`)
 *   planSweep({ root, now, maxAgeDays = 14 }) -> { delete: string[] }
 *
 *   - `root` is the repository top level; `now` is a Date. Every returned path
 *     is repo-relative with forward slashes and lies under `scratch/`.
 *   - A scratch file is "referenced" when a TRACKED .md/.json/.txt file holds
 *     the literal `scratch/<path>` (a backslash spelling counts too),
 *     whatever the file's age. References from untracked files do not count.
 *   - `unreferencedOld` = unreferenced files strictly older than 14 days.
 *   - `planSweep(...).delete` equals `unreferencedOld` at the default age; it
 *     never lists a referenced file, nothing outside the root-level `scratch/`
 *     directory, and never follows a symlink that leaves `scratch/`.
 *   - A directory that is not a git repository yields a `warning` and empty
 *     lists instead of a throw: without tracked-reference data nothing may be
 *     declared deletable.
 *
 * Every case builds its own throwaway git repository under the OS temp
 * directory with controlled mtimes. The fixed `NOW` lies years after the real
 * clock on purpose, so an implementation that ignores `now` and reads the wall
 * clock sees every fixture mtime in the future and fails the age cases.
 *
 * This file is RED by design until `scratch-retention.mjs` exists.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

import { assessScratchDurability, planSweep } from './scratch-retention.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2031-03-15T08:00:00.000Z');
const GIT_IDENTITY = ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid'];

const ageDate = (days) => new Date(NOW.getTime() - days * DAY_MS);
const sorted = (list) => [...list].sort();

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
function createFixture({ repo = true, ignoreScratch = true } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scratch-retention-test-')));
  const cleanups = [];
  const fx = {
    root,
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
      const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scratch-retention-outside-')));
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
      try {
        fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
      } catch {
        // best effort
      }
    },
  };
  if (repo) {
    git(root, ['init', '-q']);
    fx.commitFiles(
      ignoreScratch
        ? { 'README.md': 'fixture\n', '.gitignore': 'scratch/\n' }
        : { 'README.md': 'fixture\n' },
    );
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

/** Sorted `path|description` lines for everything under `root` except `.git`. */
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

function withGitCeiling(dir, fn) {
  const previous = process.env.GIT_CEILING_DIRECTORIES;
  process.env.GIT_CEILING_DIRECTORIES = dir;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.GIT_CEILING_DIRECTORIES;
    else process.env.GIT_CEILING_DIRECTORIES = previous;
  }
}

/**
 * One repository carrying every class at once. Returns the expected partition.
 * Referenced: tracked .md (backtick / link / sentence-final / backslash forms),
 * .json and .txt; the young file is referenced too.
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
  fx.commitFiles({
    'docs/plan.md':
      'Draft in `scratch/notes/a.md`, data in [b](scratch/data/b.json), fresh in scratch/fresh-ref.md.\n'
      + 'Windows spelling: scratch\\win\\w.md\n',
    'config/refs.json': '{"artifact": "scratch/c.txt"}\n',
  });
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

describe('scratch-retention (PO decision P)', () => {
  const savedGitEnv = new Map();

  before(() => {
    // A parent git process (hook, worktree) leaks GIT_DIR and friends into children; the
    // throwaway repositories must be addressed by their own cwd alone.
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

  describe('assessScratchDurability', () => {
    test('a literal scratch/<path> reference from a tracked .md, .json or .txt keeps a 30-day-old file in referenced only', () =>
      inFixture({}, (fx) => {
        fx.write('scratch/notes/a.md', undefined, 30);
        fx.write('scratch/data/b.json', undefined, 30);
        fx.write('scratch/logs/run.txt', undefined, 30);
        fx.write('scratch/json-ref.md', undefined, 30);
        fx.write('scratch/txt-ref.md', undefined, 30);
        fx.commitFiles({
          'docs/plan.md':
            'Draft in `scratch/notes/a.md`; data in [b](scratch/data/b.json). Log: scratch/logs/run.txt.\n',
          'config/refs.json': '{"artifact": "scratch/json-ref.md"}\n',
          'notes.txt': 'keep scratch/txt-ref.md around\n',
        });

        const result = assessScratchDurability({ root: fx.root, now: NOW });

        assert.deepEqual(sorted(result.referenced), sorted([
          'scratch/notes/a.md',
          'scratch/data/b.json',
          'scratch/logs/run.txt',
          'scratch/json-ref.md',
          'scratch/txt-ref.md',
        ]));
        assert.deepEqual(result.unreferencedOld, []);
      }));

    test('a reference written with backslashes counts as a reference', () =>
      inFixture({}, (fx) => {
        fx.write('scratch/notes/a.md', undefined, 30);
        fx.commitFiles({ 'docs/windows.md': 'The draft is at scratch\\notes\\a.md on that machine.\n' });

        const result = assessScratchDurability({ root: fx.root, now: NOW });

        assert.deepEqual(result.referenced, ['scratch/notes/a.md']);
        assert.deepEqual(result.unreferencedOld, []);
      }));

    test('an unreferenced file 15 days old is unreferencedOld; one 13 days old (or newer) is in neither list', () =>
      inFixture({}, (fx) => {
        fx.write('scratch/old-15.md', undefined, 15);
        fx.write('scratch/recent-13.md', undefined, 13);
        fx.write('scratch/today.md', undefined, 0);

        const result = assessScratchDurability({ root: fx.root, now: NOW });

        assert.deepEqual(result.unreferencedOld, ['scratch/old-15.md']);
        assert.deepEqual(result.referenced, []);
      }));

    test('a reference only from an UNTRACKED file does not count', () =>
      inFixture({}, (fx) => {
        fx.write('scratch/only-untracked-ref.md', undefined, 30);
        fx.write('scratch/index.md', 'see scratch/only-untracked-ref.md\n', 20);
        fx.write('untracked-notes.md', 'draft: scratch/only-untracked-ref.md\n');

        const result = assessScratchDurability({ root: fx.root, now: NOW });

        assert.deepEqual(result.referenced, []);
        assert.deepEqual(sorted(result.unreferencedOld), ['scratch/index.md', 'scratch/only-untracked-ref.md']);
      }));

    for (const ignoreScratch of [true, false]) {
      test(`partitions a mixed scratch/ (scratch/ ${ignoreScratch ? 'git-ignored' : 'not ignored'}): referenced, old unreferenced, recent`, () =>
        inFixture({ ignoreScratch }, (fx) => {
          const expected = buildMixed(fx);

          const result = assessScratchDurability({ root: fx.root, now: NOW });

          assertScratchRelative(result.referenced, 'referenced');
          assertScratchRelative(result.unreferencedOld, 'unreferencedOld');
          assert.deepEqual(sorted(result.referenced), expected.referenced);
          assert.deepEqual(sorted(result.unreferencedOld), expected.unreferencedOld);
          for (const entry of expected.neither) {
            assert.ok(!result.referenced.includes(entry) && !result.unreferencedOld.includes(entry), `${entry} is in neither list`);
          }
          assert.ok(!result.warning, 'a healthy repository carries no warning');
        }));
    }

    test('a git repository without a scratch/ directory yields empty lists', () =>
      inFixture({}, (fx) => {
        const result = assessScratchDurability({ root: fx.root, now: NOW });

        assert.deepEqual(result.referenced, []);
        assert.deepEqual(result.unreferencedOld, []);
      }));

    test('a directory that is not a git repository returns a warning and empty lists instead of throwing', () =>
      inFixture({ repo: false }, (fx) => {
        fx.write('scratch/old-unreferenced.md', undefined, 30);
        let result;

        withGitCeiling(path.dirname(fx.root), () => {
          assert.doesNotThrow(() => {
            result = assessScratchDurability({ root: fx.root, now: NOW });
          });
        });

        assert.ok('warning' in result, 'the result has a warning field');
        assert.ok(result.warning, 'the warning is not empty');
        assert.deepEqual(result.referenced, []);
        assert.deepEqual(result.unreferencedOld, []);
        assert.ok(fx.exists('scratch/old-unreferenced.md'));
      }));
  });

  describe('planSweep', () => {
    test('delete equals unreferencedOld at the default age and never lists a referenced file', () =>
      inFixture({}, (fx) => {
        const expected = buildMixed(fx);

        const assessed = assessScratchDurability({ root: fx.root, now: NOW });
        const plan = planSweep({ root: fx.root, now: NOW });

        assert.ok(Array.isArray(plan.delete));
        assertScratchRelative(plan.delete, 'delete');
        assert.deepEqual(sorted(plan.delete), sorted(assessed.unreferencedOld));
        assert.deepEqual(sorted(plan.delete), expected.unreferencedOld);
        for (const entry of expected.referenced) {
          assert.ok(!plan.delete.includes(entry), `referenced ${entry} is never planned for deletion`);
        }
        for (const entry of expected.neither) {
          assert.ok(!plan.delete.includes(entry), `recent ${entry} is never planned for deletion`);
        }
      }));

    test('never lists a path outside the root-level scratch/ directory, however old', () =>
      inFixture({}, (fx) => {
        fx.write('scratch/ok-old.md', undefined, 20);
        fx.write('stray-old.txt', undefined, 100);
        fx.write('src/scratch/nested-old.md', undefined, 100);
        fx.write('scratch-notes/old.md', undefined, 100);
        fx.commitFiles({ 'docs/old-tracked.md': 'tracked and old\n' });
        setAge(fx.abs('docs/old-tracked.md'), 100);

        const plan = planSweep({ root: fx.root, now: NOW });

        assert.deepEqual(plan.delete, ['scratch/ok-old.md']);
      }));

    test('maxAgeDays moves the threshold in both directions and never reaches a referenced file', () =>
      inFixture({}, (fx) => {
        fx.write('scratch/age-5.md', undefined, 5);
        fx.write('scratch/age-13.md', undefined, 13);
        fx.write('scratch/age-15.md', undefined, 15);
        fx.write('scratch/referenced-30.md', undefined, 30);
        fx.commitFiles({ 'docs/keep.md': 'kept: scratch/referenced-30.md\n' });

        const sevenDays = planSweep({ root: fx.root, now: NOW, maxAgeDays: 7 });
        const fourteenDays = planSweep({ root: fx.root, now: NOW, maxAgeDays: 14 });
        const defaulted = planSweep({ root: fx.root, now: NOW });
        const twentyDays = planSweep({ root: fx.root, now: NOW, maxAgeDays: 20 });

        assert.deepEqual(sorted(sevenDays.delete), ['scratch/age-13.md', 'scratch/age-15.md']);
        assert.deepEqual(fourteenDays.delete, ['scratch/age-15.md']);
        assert.deepEqual(defaulted.delete, fourteenDays.delete);
        assert.deepEqual(twentyDays.delete, []);
      }));

    test('skips, and does not follow, a symlink inside scratch/ that points to a directory outside the repository', (t) =>
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

        assert.doesNotThrow(() => assessScratchDurability({ root: fx.root, now: NOW }));
        const plan = planSweep({ root: fx.root, now: NOW });

        assert.deepEqual(plan.delete, ['scratch/real-old.md']);
        assert.ok(fs.existsSync(outsideFile), 'the file behind the link is untouched');
      }));

    test('skips, and does not follow, a symlink inside scratch/ that points to a file outside the repository', (t) =>
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

        assert.doesNotThrow(() => assessScratchDurability({ root: fx.root, now: NOW }));
        const plan = planSweep({ root: fx.root, now: NOW });

        assert.deepEqual(plan.delete, ['scratch/real-old.md']);
        assert.ok(fs.existsSync(outsideFile), 'the file behind the link is untouched');
      }));

    test('a directory that is not a git repository plans no deletion (an empty plan or a refusal, never a listing)', () =>
      inFixture({ repo: false }, (fx) => {
        fx.write('scratch/old-unreferenced.md', undefined, 30);
        let plan;

        withGitCeiling(path.dirname(fx.root), () => {
          try {
            plan = planSweep({ root: fx.root, now: NOW });
          } catch {
            plan = { delete: [] };
          }
        });

        assert.deepEqual(plan.delete, []);
        assert.ok(fx.exists('scratch/old-unreferenced.md'));
      }));
  });

  describe('no side effects', () => {
    test('neither function deletes, creates or touches anything', () =>
      inFixture({}, (fx) => {
        buildMixed(fx);
        const allFiles = fx.exists('scratch/old-unref.md') && fx.exists('scratch/sub/deep/old-unref2.md');
        assert.ok(allFiles, 'fixture holds the old unreferenced files before the calls');
        const treeBefore = snapshotTree(fx.root);

        assessScratchDurability({ root: fx.root, now: NOW });
        planSweep({ root: fx.root, now: NOW });
        planSweep({ root: fx.root, now: NOW, maxAgeDays: 1 });

        assert.deepEqual(snapshotTree(fx.root), treeBefore);
        assert.ok(fx.exists('scratch/old-unref.md'));
        assert.ok(fx.exists('scratch/sub/deep/old-unref2.md'));
        assert.ok(fx.exists('scratch/notes/a.md'));
      }));
  });

  /**
   * C-S-T3: the library half of the rules settled by the Critic's round-1 record
   * (specs/sprint-alfred-epic/evidence/critic-2026-10-07/scratch-sweep-round1.md):
   * F1 (a live plugin root is never planned), F6 (an unreadable tracked reference
   * document makes nothing deletable) and F7 (tracked files are never candidates).
   * The CLI-only rules (F2, F3, F4) are pinned in scripts/scratch-sweep.test.mjs.
   * Written against the library as it stood when the findings were raised, so
   * these cases are RED until the fix dispatch lands.
   */
  describe('C-S-T3: Critic round-1 findings', () => {
    function withEnv(name, value, fn) {
      const previous = process.env[name];
      process.env[name] = value;
      try {
        return fn();
      } finally {
        if (previous === undefined) delete process.env[name];
        else process.env[name] = previous;
      }
    }

    /**
     * Make a committed file unreadable for the current user (chmod 000 elsewhere, a deny-read ACE
     * on win32) and register the restore with the fixture. Returns `{ skip: reason }` when the
     * platform cannot make the file unreadable reliably (e.g. a privileged user), `{}` when it did.
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

    test('C-S-T3 F1: planSweep never lists a file under a live plugin root (scratchLivePluginRoots), however old and unreferenced, and still plans its look-alike siblings', () =>
      inFixture({}, (fx) => {
        // "Live" is what lib/physical-scratch-boundary.mjs scratchLivePluginRoots() says: this
        // module's own installation plus $CLAUDE_PLUGIN_ROOT when that directory holds a hooks/
        // directory and a .claude-plugin/plugin.json file. The fixture builds that shape.
        const live = 'scratch/installs/live-pipeline-core';
        const liveFiles = [
          `${live}/hooks/guard.mjs`,
          `${live}/.claude-plugin/plugin.json`,
          `${live}/lib/deep/helper.md`,
          `${live}/notes.md`,
        ];
        const stale = [
          'scratch/installs/live-pipeline-core-old/stale.md',
          'scratch/installs/other/stale.md',
          'scratch/stale-sibling.md',
        ];
        for (const rel of [...liveFiles, ...stale]) fx.write(rel, undefined, 40);

        const plan = withEnv('CLAUDE_PLUGIN_ROOT', fx.abs(live), () => planSweep({ root: fx.root, now: NOW }));

        assert.deepEqual(sorted(plan.delete), sorted(stale));
        for (const rel of liveFiles) assert.ok(fx.exists(rel), `${rel} is untouched`);
      }));

    test('C-S-T3 F6: with one tracked reference document unreadable the durability result carries a warning and nothing is deletable', (t) =>
      inFixture({}, (fx) => {
        fx.commitFiles({ 'docs/keeps.md': 'The notes live in scratch/protected-by-doc.md\n' });
        fx.write('scratch/protected-by-doc.md', undefined, 40);
        fx.write('scratch/other-old.md', undefined, 40);
        const made = makeUnreadable(fx, 'docs/keeps.md');
        if (made.skip) {
          t.skip(made.skip);
          return;
        }
        let assessed;
        let plan;

        assert.doesNotThrow(() => {
          assessed = assessScratchDurability({ root: fx.root, now: NOW });
          plan = planSweep({ root: fx.root, now: NOW });
        });

        assert.ok(assessed.warning, 'the durability result carries a warning');
        assert.deepEqual(assessed.unreferencedOld, [], 'no file may be declared deletable');
        assert.deepEqual(plan.delete, [], 'the plan is empty');
        assert.ok(fx.exists('scratch/protected-by-doc.md') && fx.exists('scratch/other-old.md'));
      }));

    test('C-S-T3 F7: files tracked by git under a non-ignored scratch/ are never planned; an untracked sibling still is', () =>
      inFixture({ ignoreScratch: false }, (fx) => {
        const tracked = [
          'scratch/tracked-old.md',
          'scratch/tracked dir/old note.json',
          'scratch/tracked-sub/deep/old.txt',
        ];
        // Content that does not name its own path: a self-reference would count as a durable reference.
        fx.commitFiles(Object.fromEntries(tracked.map((rel) => [rel, 'tracked scratch note\n'])));
        for (const rel of tracked) setAge(fx.abs(rel), 40);
        fx.write('scratch/untracked-old.md', undefined, 40);

        const plan = planSweep({ root: fx.root, now: NOW });

        assert.deepEqual(plan.delete, ['scratch/untracked-old.md']);
        for (const rel of tracked) assert.ok(fx.exists(rel), `${rel} is untouched`);
      }));
  });
});
