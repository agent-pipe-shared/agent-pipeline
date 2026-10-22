// SPDX-License-Identifier: SUL-1.0
/**
 * Regression pin for backlog item pipeline.scratch-has-no-retention-and-no-durability-check
 * (Alfred AC-246). Two original acceptance points:
 *
 *   P1  A sanctioned scratch sweep removes staging copies once their package
 *       commit exists (lib/scratch-retention.mjs planSweep, lib/scratch-package-staging.mjs,
 *       scripts/scratch-sweep.mjs).
 *   P2  A handover/push check warns (never refuses) while scratch/ holds *.md
 *       files or files marked durable with no tracked counterpart
 *       (lib/scratch-custody-report.mjs, scripts/scratch-custody-check.mjs,
 *       consumed by hooks/guard-push.mjs and the close-block skill).
 *
 * Every case runs the real module or CLI against a throwaway git repository
 * created under the repository's own scratch/test-tmp/ (never the OS temp dir).
 *
 * RED proof: SCRATCH_PIN_RETENTION_URL may point at a scratch MIRROR of
 * scratch-retention.mjs (a documented test seam of this file only); a mirror
 * with its reference check removed must fail the P1 cases. Production is never edited.
 *
 * Host limitation (PO decision K7): exec-bit cases need POSIX mode bits. They are
 * skipped on win32 with owner Coordinator, due 2026-10-19 (Linux/WSL run).
 */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { reportScratchCustody } from '../scratch-custody-report.mjs';
import { mkdtempTestScratch } from '../test-tmpdir.mjs';
import { hardenWindowsPrivateDirectory } from '../windows-private-state.mjs';

const retentionUrl = process.env.SCRATCH_PIN_RETENTION_URL
  ?? new URL('../scratch-retention.mjs', import.meta.url).href;
const { assessScratchDurability, planSweep } = await import(retentionUrl);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN = path.resolve(HERE, '..', '..');
const SWEEP_CLI = path.join(PLUGIN, 'scripts', 'scratch-sweep.mjs');
const CUSTODY_CLI = path.join(PLUGIN, 'scripts', 'scratch-custody-check.mjs');
const DAY_MS = 24 * 60 * 60 * 1000;
const HOST_LIMIT_MODE_BITS = 'host-limitation: POSIX mode bits unavailable on win32; owner Coordinator; due 2026-10-19 (Linux/WSL run, PO decision K7)';

const fixtures = [];
after(() => {
  for (const root of fixtures.splice(0)) {
    try { fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); } catch { /* best effort */ }
  }
});

function git(cwd, args) {
  return execFileSync('git', [
    '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false',
    '-c', 'core.autocrlf=false', '-c', `core.hooksPath=${path.join(cwd, '.no-hooks')}`, ...args,
  ], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
}

function makeRepo() {
  const root = fs.realpathSync(mkdtempTestScratch('scratch-pin-'));
  fixtures.push(root);
  // Windows: the fixture root inherits a broad DACL that the unchanged private-state assurance rates
  // insecure (SPC-STORAGE-CUSTODY); harden it BEFORE git init so .git inherits the owner-only DACL.
  if (process.platform === 'win32') assert.equal(hardenWindowsPrivateDirectory(root).status, 'secure');
  git(root, ['init', '-q']);
  const fx = {
    root,
    abs: (rel) => path.join(root, ...rel.split('/')),
    exists: (rel) => fs.existsSync(fx.abs(rel)),
    write(rel, content, ageMs) {
      const file = fx.abs(rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
      if (ageMs !== undefined) {
        const when = new Date(Date.now() - ageMs);
        fs.utimesSync(file, when, when);
      }
      return file;
    },
    commit(files, { force = false } = {}) {
      for (const [rel, content] of Object.entries(files)) fx.write(rel, content);
      git(root, ['add', ...(force ? ['-f'] : []), '--', ...Object.keys(files)]);
      git(root, ['commit', '-q', '-m', 'fixture']);
      return git(root, ['rev-parse', 'HEAD']).trim();
    },
  };
  fx.commit({ 'README.md': 'fixture\n', '.gitignore': 'scratch/\n' });
  return fx;
}

function sweepCli(root, ...args) {
  const run = spawnSync(process.execPath, [SWEEP_CLI, ...args, '--root', root], { encoding: 'utf8', windowsHide: true });
  return { status: run.status, json: run.stdout.trim() ? JSON.parse(run.stdout) : null };
}

describe('P1: sanctioned scratch sweep (retention + package staging)', () => {
  test('planSweep plans only old unreferenced untracked files; never referenced, tracked, recent or dispatch/ files', () => {
    const fx = makeRepo();
    fx.write('scratch/old-unref.txt', 'x', 30 * DAY_MS);
    fx.write('scratch/old-ref.txt', 'x', 30 * DAY_MS);
    fx.write('scratch/recent.txt', 'x', 1 * DAY_MS);
    fx.write('scratch/dispatch/old.txt', 'x', 30 * DAY_MS);
    fx.write('scratch/old-tracked.txt', 'x', 30 * DAY_MS);
    fx.commit({ 'docs/notes.md': 'see scratch/old-ref.txt\n' });
    git(fx.root, ['add', '-f', '--', 'scratch/old-tracked.txt']);
    git(fx.root, ['commit', '-q', '-m', 'track one scratch file']);
    const now = new Date();
    const plan = planSweep({ root: fx.root, now });
    assert.deepEqual(plan.delete, ['scratch/old-unref.txt']);
    assert.equal(plan.warning, undefined);
    const durability = assessScratchDurability({ root: fx.root, now });
    assert.ok(durability.referenced.includes('scratch/old-ref.txt'), 'a tracked document reference is reported as durability-relevant');
    assert.ok(!durability.unreferencedOld.includes('scratch/old-ref.txt'));
  });

  test('CLI --check previews and --apply deletes exactly the plan, with the real clock; a second run deletes nothing', () => {
    const fx = makeRepo();
    fx.write('scratch/old-unref.txt', 'x', 30 * DAY_MS);
    fx.write('scratch/recent.txt', 'x', 1 * DAY_MS);
    fx.write('scratch/dispatch/old.txt', 'x', 30 * DAY_MS);
    const preview = sweepCli(fx.root, '--sweep');
    assert.equal(preview.status, 0);
    assert.deepEqual(preview.json.plan.delete, ['scratch/old-unref.txt']);
    assert.ok(fx.exists('scratch/old-unref.txt'), 'preview deletes nothing');
    const applied = sweepCli(fx.root, '--apply');
    assert.equal(applied.status, 0);
    assert.deepEqual(applied.json.deleted, ['scratch/old-unref.txt']);
    assert.ok(!fx.exists('scratch/old-unref.txt'));
    assert.ok(fx.exists('scratch/recent.txt') && fx.exists('scratch/dispatch/old.txt'));
    assert.deepEqual(sweepCli(fx.root, '--apply').json.deleted, []);
  });

  test('a staging copy of a committed package is registered and then swept, even when younger than 14 days', () => {
    const fx = makeRepo();
    const commit = fx.commit({ 'pkg/a.txt': 'alpha\n', 'pkg/sub/b.txt': 'beta\n' });
    fx.write('scratch/stage1/a.txt', 'alpha\n');
    fx.write('scratch/stage1/sub/b.txt', 'beta\n');
    fx.write('scratch/unrelated-recent.txt', 'x', 1 * DAY_MS);
    const register = sweepCli(fx.root, '--register-staging', '--staging-path', 'scratch/stage1', '--package-commit', commit, '--public-prefix', 'pkg');
    assert.equal(register.json.ok, true, JSON.stringify(register.json));
    assert.equal(register.json.memberCount, 2);
    const preview = sweepCli(fx.root, '--sweep');
    assert.deepEqual(preview.json.plan.delete, ['scratch/stage1/a.txt', 'scratch/stage1/sub/b.txt']);
    const applied = sweepCli(fx.root, '--apply');
    assert.deepEqual(applied.json.deleted, ['scratch/stage1/a.txt', 'scratch/stage1/sub/b.txt']);
    assert.ok(!fx.exists('scratch/stage1/a.txt') && !fx.exists('scratch/stage1/sub/b.txt'));
    assert.ok(fx.exists('pkg/a.txt') && fx.exists('pkg/sub/b.txt'), 'the committed package copy is never touched');
    assert.ok(fx.exists('scratch/unrelated-recent.txt'));
  });

  test('registration is refused while the package commit does not match the staging copy (no commit, no sweep)', () => {
    const fx = makeRepo();
    const commit = fx.commit({ 'pkg/a.txt': 'alpha\n' });
    fx.write('scratch/stage2/a.txt', 'DIVERGED\n');
    const refused = sweepCli(fx.root, '--register-staging', '--staging-path', 'scratch/stage2', '--package-commit', commit, '--public-prefix', 'pkg');
    assert.equal(refused.json.ok, false);
    assert.equal(refused.json.code, 'SPC-SUFFIX-SET');
    assert.equal(refused.status, 1);
    assert.deepEqual(sweepCli(fx.root, '--sweep').json.plan.delete, [], 'a fresh unregistered staging copy is not swept');
  });

  test('a registered staging copy edited after registration is held, not deleted', () => {
    const fx = makeRepo();
    const commit = fx.commit({ 'pkg/a.txt': 'alpha\n' });
    fx.write('scratch/stage3/a.txt', 'alpha\n');
    assert.equal(sweepCli(fx.root, '--register-staging', '--staging-path', 'scratch/stage3', '--package-commit', commit, '--public-prefix', 'pkg').json.ok, true);
    fx.write('scratch/stage3/a.txt', 'alpha edited after registration\n');
    const applied = sweepCli(fx.root, '--apply');
    assert.deepEqual(applied.json.deleted, []);
    assert.ok(fx.exists('scratch/stage3/a.txt'), 'edited staging content survives');
    assert.ok(Array.isArray(applied.json.plan.delete));
  });
});

describe('P2: durability check warns while scratch holds markdown/durable files with no tracked counterpart', () => {
  const sha = (text) => createHash('sha256').update(text).digest('hex');
  const manifest = (entries) => `${JSON.stringify({ schema: 'pipeline.scratch-custody.v1', entries })}\n`;
  const view = (report, name) => report.views.find((v) => v.view === name);
  const codes = (report) => report.warnings.map((w) => w.code);

  test('with no manifest every scratch markdown file is reported unclassified, and the report is warnings only', () => {
    const fx = makeRepo();
    fx.write('scratch/plan.md', '# plan\n');
    fx.write('scratch/notes/decision.md', '# decision\n');
    const before = git(fx.root, ['status', '--porcelain', '--ignored']);
    const report = reportScratchCustody({ root: fx.root });
    assert.equal(report.mode, 'report-only');
    assert.equal(report.schema, 'pipeline.scratch-custody-report.v1');
    const unclassified = report.warnings.find((w) => w.code === 'unclassified-markdown' && w.view === 'HEAD');
    assert.deepEqual(unclassified.paths, ['scratch/notes/decision.md', 'scratch/plan.md']);
    assert.ok(codes(report).includes('manifest-unavailable') || codes(report).includes('manifest-untracked'));
    assert.equal(git(fx.root, ['status', '--porcelain', '--ignored']), before, 'the report writes, stages and removes nothing');
    assert.ok(fx.exists('scratch/plan.md'));
  });

  test('a manifest-marked durable file with an identical tracked counterpart is durable at HEAD; unlisted markdown still warns', () => {
    const fx = makeRepo();
    const body = '# plan\n';
    fx.write('scratch/plan.md', body);
    fx.write('scratch/other.md', '# other\n');
    fx.commit({
      'docs/plan.md': body,
      'project/scratch-custody.v1.json': manifest([{ path: 'scratch/plan.md', disposition: 'durable', counterpartPath: 'docs/plan.md', reason: null, sha256: sha(body) }]),
    });
    const report = reportScratchCustody({ root: fx.root });
    const head = view(report, 'HEAD');
    assert.equal(head.status, 'checked');
    assert.equal(head.entries[0].status, 'durable');
    assert.deepEqual(head.unclassifiedMarkdown, ['scratch/other.md']);
    assert.ok(!report.warnings.some((w) => w.view === 'HEAD' && w.code === 'custody-durable'));
    assert.ok(report.warnings.some((w) => w.code === 'unclassified-markdown' && w.view === 'HEAD'));
    assert.ok(report.warnings.some((w) => w.code === 'custody-scratch-only' && w.view === 'scratch-only'), 'the scratch-only view still flags the file until its counterpart is committed');
  });

  test('a durable entry whose counterpart is missing or differs from the scratch bytes warns', () => {
    const fx = makeRepo();
    const body = '# plan\n';
    fx.write('scratch/plan.md', body);
    fx.write('scratch/lost.md', '# lost\n');
    fx.commit({
      'docs/plan.md': 'DIFFERENT\n',
      'project/scratch-custody.v1.json': manifest([
        { path: 'scratch/plan.md', disposition: 'durable', counterpartPath: 'docs/plan.md', reason: null, sha256: sha(body) },
        { path: 'scratch/lost.md', disposition: 'durable', counterpartPath: 'docs/lost.md', reason: null, sha256: sha('# lost\n') },
      ]),
    });
    const head = view(reportScratchCustody({ root: fx.root }), 'HEAD');
    const byPath = Object.fromEntries(head.entries.map((e) => [e.path, e.status]));
    assert.equal(byPath['scratch/plan.md'], 'counterpart-mismatch');
    assert.equal(byPath['scratch/lost.md'], 'missing-or-unreadable');
  });

  test('a not-durable entry is classified (no unclassified warning) and carries its typed reason', () => {
    const fx = makeRepo();
    fx.write('scratch/tmp.md', '# tmp\n');
    fx.commit({ 'project/scratch-custody.v1.json': manifest([{ path: 'scratch/tmp.md', disposition: 'not-durable', counterpartPath: null, reason: 'throwaway-draft', sha256: sha('# tmp\n') }]) });
    const head = view(reportScratchCustody({ root: fx.root }), 'HEAD');
    assert.equal(head.entries[0].status, 'not-durable');
    assert.equal(head.entries[0].reason, 'throwaway-draft');
    assert.deepEqual(head.unclassifiedMarkdown, []);
  });

  test('with a push commit the pushed view reports durable-for-push; without one it is candidate-unavailable', () => {
    const fx = makeRepo();
    const body = '# plan\n';
    fx.write('scratch/plan.md', body);
    const commit = fx.commit({
      'docs/plan.md': body,
      'project/scratch-custody.v1.json': manifest([{ path: 'scratch/plan.md', disposition: 'durable', counterpartPath: 'docs/plan.md', reason: null, sha256: sha(body) }]),
    });
    assert.equal(view(reportScratchCustody({ root: fx.root }), 'pushed').status, 'candidate-unavailable');
    const pushed = view(reportScratchCustody({ root: fx.root, pushCommit: commit }), 'pushed');
    assert.equal(pushed.entries[0].status, 'durable-for-push');
  });

  test('CLI scratch-custody-check is WARN only: exit 0 with findings, exit 0 with an unusable root, exit 2 on usage error', () => {
    const fx = makeRepo();
    fx.write('scratch/plan.md', '# plan\n');
    const warned = spawnSync(process.execPath, [CUSTODY_CLI, '--root', fx.root], { encoding: 'utf8', windowsHide: true });
    assert.equal(warned.status, 0);
    const report = JSON.parse(warned.stdout);
    assert.ok(codes(report).includes('unclassified-markdown'));
    assert.match(warned.stderr, /WARN/u);
    const unusable = spawnSync(process.execPath, [CUSTODY_CLI, '--root', path.join(fx.root, 'does-not-exist')], { encoding: 'utf8', windowsHide: true });
    assert.equal(unusable.status, 0);
    assert.deepEqual(codes(JSON.parse(unusable.stdout)), ['observer-unavailable']);
    assert.equal(spawnSync(process.execPath, [CUSTODY_CLI], { encoding: 'utf8', windowsHide: true }).status, 2);
  });

  test('the check is wired into the handover close ritual and the push guard as report-only', () => {
    const close = fs.readFileSync(path.join(PLUGIN, 'skills', 'close-block', 'SKILL.md'), 'utf8');
    assert.match(close, /scratch-custody-check\.mjs --root/u);
    assert.match(close, /\(WARN only\)/u);
    assert.match(close, /does not refuse the close/u);
    const push = fs.readFileSync(path.join(PLUGIN, 'hooks', 'guard-push.mjs'), 'utf8');
    assert.match(push, /import \{ reportScratchCustody \} from "\.\.\/lib\/scratch-custody-report\.mjs"/u);
    assert.match(push, /does not change Push-Gate policy or refuse the push/u);
  });

  test('counterpart exec-bit mismatch is reported (needs POSIX mode bits)', { skip: process.platform === 'win32' ? HOST_LIMIT_MODE_BITS : false }, () => {
    const fx = makeRepo();
    const body = '#!/bin/sh\n';
    fx.write('scratch/run.md', body);
    fx.write('docs/run.md', body);
    fs.chmodSync(fx.abs('docs/run.md'), 0o755);
    fx.commit({ 'project/scratch-custody.v1.json': manifest([{ path: 'scratch/run.md', disposition: 'durable', counterpartPath: 'docs/run.md', reason: null, sha256: sha(body) }]) });
    git(fx.root, ['add', '--chmod=+x', '--', 'docs/run.md']);
    git(fx.root, ['commit', '-q', '-m', 'exec counterpart']);
    const head = view(reportScratchCustody({ root: fx.root }), 'HEAD');
    assert.equal(head.entries[0].status, 'counterpart-mode-mismatch');
  });
});
