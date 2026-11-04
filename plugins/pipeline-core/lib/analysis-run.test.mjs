// SPDX-License-Identifier: SUL-1.0
/**
 * Pins lib/analysis-run.mjs (candidate 19, F2a; criterion AC-108): the registered
 * verify command of a commit runs in a throwaway clone under the git common
 * directory, and a labelled result records whether the real working tree moved.
 * Every case builds its own temporary git repository with a committed
 * project/pipeline.json.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { runAnalysis } from './analysis-run.mjs';
import { privateMkdtemp } from './test-private-tmp.mjs';

const GIT = ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid'];
const git = (cwd, ...args) => spawnSync('git', [...GIT, ...args], { cwd, encoding: 'utf8' });

function fixture(verify) {
  const root = fs.realpathSync(privateMkdtemp('analysis-run-'));
  git(root, 'init', '-q');
  fs.mkdirSync(path.join(root, 'project'));
  const calibration = verify === undefined ? {} : { verify: typeof verify === 'function' ? verify(root) : verify };
  fs.writeFileSync(path.join(root, 'project', 'pipeline.json'), JSON.stringify(calibration));
  fs.writeFileSync(path.join(root, 'a.txt'), 'a\n');
  git(root, 'add', '-A');
  assert.equal(git(root, 'commit', '-q', '-m', 'init').status, 0);
  return root;
}
const readResult = (outcome) => JSON.parse(fs.readFileSync(outcome.resultPath, 'utf8'));

test('a passing verify command gives verdict passed with a labelled result', () => {
  const root = fixture('node -e "console.log(\'MARKER\')"');
  const outcome = runAnalysis({ root });
  assert.equal(outcome.status, 'ok');
  const result = readResult(outcome);
  assert.equal(result.schema, 'pipeline.analysis-run.v1');
  assert.equal(result.kind, 'analysis');
  assert.equal(result.notVerifyEvidence, true);
  assert.equal(result.verdict, 'passed');
  assert.equal(result.exitCode, 0);
  assert.equal(result.workingTreeUnchanged, true);
  assert.match(result.stdout, /MARKER/);
  assert.equal(result.commit, git(root, 'rev-parse', 'HEAD').stdout.trim());
});

test('a failing verify command gives verdict failed with its exit code', () => {
  const root = fixture('node -e "process.exit(1)"');
  const outcome = runAnalysis({ root });
  assert.equal(outcome.status, 'ok');
  const result = readResult(outcome);
  assert.equal(result.verdict, 'failed');
  assert.equal(result.exitCode, 1);
});

test('a verify command past the timeout gives verdict timed-out', () => {
  const root = fixture('node -e "setTimeout(()=>{},30000)"');
  const outcome = runAnalysis({ root, timeoutSeconds: 1 });
  const result = readResult(outcome);
  assert.equal(result.verdict, 'timed-out');
  assert.equal(result.timedOut, true);
});

test('a verify command that writes into the real working tree is refused', () => {
  const root = fixture((dir) => `node -e "require('fs').writeFileSync('${path.join(dir, 'intruder.txt')}','x')"`);
  const outcome = runAnalysis({ root });
  assert.equal(outcome.status, 'refused-working-tree-changed');
  const result = readResult(outcome);
  assert.equal(result.verdict, 'refused-working-tree-changed');
  assert.equal(result.workingTreeUnchanged, false);
  assert.match(result.repair, /review and revert the change in the working tree/);
});

test('a missing or placeholder verify value is refused as not configured', () => {
  for (const verify of [undefined, '', 'the verify contract of this project is not configured']) {
    const root = fixture(verify);
    const outcome = runAnalysis({ root });
    assert.equal(outcome.status, 'refused');
    assert.equal(outcome.code, 'ANALYSIS-VERIFY-NOT-CONFIGURED');
  }
});

test('a root that is not a git repository is refused', () => {
  const dir = privateMkdtemp('analysis-run-nogit-');
  const outcome = runAnalysis({ root: dir });
  assert.equal(outcome.status, 'refused');
  assert.equal(outcome.code, 'ANALYSIS-NOT-A-REPOSITORY');
});

test('the clone lives under the git common directory, not the working tree, and is no worktree', () => {
  const root = fixture('node -e "console.log(1)"');
  const outcome = runAnalysis({ root });
  const common = path.join(root, '.git', 'agent-pipeline', 'analysis');
  assert.ok(outcome.resultPath.startsWith(common + path.sep));
  const clone = path.join(path.dirname(outcome.resultPath), 'clone');
  assert.ok(fs.existsSync(path.join(clone, 'a.txt')));
  const worktrees = git(root, 'worktree', 'list', '--porcelain').stdout;
  assert.ok(!worktrees.includes('clone'));
  assert.equal(git(root, 'status', '--porcelain=v1', '--untracked-files=all').stdout, '');
});

test('the verify command runs in the clone with TMPDIR and CLAUDE_PROJECT_DIR inside it', () => {
  const root = fixture('node -e "console.log(process.cwd()+\'|\'+process.env.TMPDIR+\'|\'+process.env.CLAUDE_PROJECT_DIR)"');
  const result = readResult(runAnalysis({ root }));
  const [cwd, tmp, project] = result.stdout.trim().split('|');
  assert.ok(cwd.endsWith(`${path.sep}clone`));
  assert.equal(project, cwd);
  assert.ok(tmp.startsWith(cwd + path.sep));
});

test('stdout above 65536 bytes is bounded and flagged truncated', () => {
  const root = fixture('node -e "process.stdout.write(\'x\'.repeat(100000))"');
  const result = readResult(runAnalysis({ root }));
  assert.equal(result.stdout.length, 65536);
  assert.equal(result.truncated.stdout, true);
  assert.equal(result.truncated.stderr, false);
});

test('retention keeps the newest 5 runs and removes runs older than 7 days', () => {
  const root = fixture('node -e "console.log(1)"');
  const now = Date.parse('2031-03-15T12:00:00.000Z');
  const dir = path.join(root, '.git', 'agent-pipeline', 'analysis');
  const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]/gu, '').replace(/\.\d+Z$/u, 'Z');
  const make = (ms, tag) => fs.mkdirSync(path.join(dir, `${stamp(ms)}-${tag}`), { recursive: true });
  make(now - 8 * 86400000, '00000000');
  for (let hour = 1; hour <= 6; hour += 1) make(now - hour * 3600000, `0000000${hour}`);
  const outcome = runAnalysis({ root, deps: { now: () => now } });
  assert.equal(outcome.deleted, 3);
  const left = fs.readdirSync(dir);
  assert.equal(left.length, 5);
  assert.ok(left.includes(path.basename(path.dirname(outcome.resultPath))));
});
