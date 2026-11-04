// SPDX-License-Identifier: SUL-1.0
// Held-patch check for w146 (F2a analysis-run): the patch exists, applies to the
// repository root and touches only the four named files.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const REPO = path.resolve(import.meta.dirname, '..', '..', '..', '..');
const PATCH = path.join(import.meta.dirname, 'w146-f2a-the-analysis-run-command-runs-the-registered-verify-command-in-a-throwaway-clone.patch');
const ALLOWED = [
  'plugins/pipeline-core/lib/analysis-run.mjs',
  'plugins/pipeline-core/lib/analysis-run.test.mjs',
  'plugins/pipeline-core/scripts/analysis-run.mjs',
  'plugins/pipeline-core/scripts/analysis-run.test.mjs',
];

test('the patch exists and is non-empty', () => {
  assert.ok(fs.statSync(PATCH).size > 0);
});

test('the patch applies to the repository root', () => {
  const out = spawnSync('git', ['apply', '--check', PATCH], { cwd: REPO, encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr);
});

test('the patch touches only the four named files', () => {
  const out = spawnSync('git', ['apply', '--numstat', PATCH], { cwd: REPO, encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr);
  const files = out.stdout.split('\n').filter(Boolean).map((line) => line.split('\t')[2]).sort();
  assert.deepEqual(files, [...ALLOWED].sort());
});
