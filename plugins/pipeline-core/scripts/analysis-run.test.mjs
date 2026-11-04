// SPDX-License-Identifier: SUL-1.0
/**
 * Pins the CLI scripts/analysis-run.mjs (candidate 19, F2a; AC-108): closed
 * argument shape --root <dir> [--commit <rev>] [--timeout-seconds <n>], one JSON
 * line on stdout, exit 0 for passed/failed, exit 2 for a refusal.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { privateMkdtemp } from '../lib/test-private-tmp.mjs';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), 'analysis-run.mjs');
const GIT = ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid'];
const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

function repo(verify) {
  const root = fs.realpathSync(privateMkdtemp('analysis-cli-'));
  spawnSync('git', ['init', '-q'], { cwd: root });
  fs.mkdirSync(path.join(root, 'project'));
  fs.writeFileSync(path.join(root, 'project', 'pipeline.json'), JSON.stringify({ verify }));
  spawnSync('git', [...GIT, 'add', '-A'], { cwd: root });
  spawnSync('git', [...GIT, 'commit', '-q', '-m', 'init'], { cwd: root });
  return root;
}

test('a passing run prints one JSON line with the result path and verdict, exit 0', () => {
  const root = repo('node -e "process.exit(0)"');
  const out = run('--root', root, '--commit', 'HEAD', '--timeout-seconds', '60');
  assert.equal(out.status, 0, out.stderr);
  const line = JSON.parse(out.stdout.trim());
  assert.equal(line.verdict, 'passed');
  assert.equal(line.deleted, 0);
  assert.ok(fs.existsSync(line.resultPath));
});

test('a failing run still exits 0 and names the verdict', () => {
  const root = repo('node -e "process.exit(3)"');
  const out = run('--root', root);
  assert.equal(out.status, 0);
  assert.equal(JSON.parse(out.stdout.trim()).verdict, 'failed');
});

test('unknown flags, positionals, a missing root and a bad timeout are refused with exit 2', () => {
  const root = repo('node -e "process.exit(0)"');
  for (const args of [['--root', root, '--extra', 'x'], ['--root', root, 'positional'], [], ['--root', root, '--timeout-seconds', '99999'], ['--root', root, '--timeout-seconds', 'abc']]) {
    const out = run(...args);
    assert.equal(out.status, 2, args.join(' '));
    assert.equal(JSON.parse(out.stdout.trim()).code, 'ANALYSIS-USAGE');
  }
});

test('a placeholder verify value exits 2 with ANALYSIS-VERIFY-NOT-CONFIGURED', () => {
  const root = repo('the verify contract of this project is not configured');
  const out = run('--root', root);
  assert.equal(out.status, 2);
  assert.equal(JSON.parse(out.stdout.trim()).code, 'ANALYSIS-VERIFY-NOT-CONFIGURED');
});
