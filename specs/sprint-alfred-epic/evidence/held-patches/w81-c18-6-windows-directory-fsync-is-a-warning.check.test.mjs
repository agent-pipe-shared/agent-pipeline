import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../../..');
const patch = resolve(import.meta.dirname, 'w81-c18-6-windows-directory-fsync-is-a-warning.patch');
const allowed = [
  'plugins/pipeline-core/lib/session-authority-registry.mjs',
  'plugins/pipeline-core/lib/session-authority-registry-fsync.test.mjs',
];

test('the patch exists and is non-empty', () => {
  assert.ok(existsSync(patch));
  assert.ok(statSync(patch).size > 0);
});

test('the patch applies to the repository root', () => {
  const r = spawnSync('git', ['apply', '--check', patch], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('the patch touches only the two named files', () => {
  const files = [...readFileSync(patch, 'utf8').matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0);
  for (const f of files) assert.ok(allowed.includes(f), `unexpected file ${f}`);
});
