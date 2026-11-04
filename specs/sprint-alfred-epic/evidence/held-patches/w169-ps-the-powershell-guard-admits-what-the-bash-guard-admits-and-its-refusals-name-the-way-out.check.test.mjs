import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

// The patch is a delta on top of the held patch w166 (same guard files), so it applies to the real checkout only after w166 is applied.
// This check therefore reads the patch and does not run `git apply` against the repository.
const patch = resolve(import.meta.dirname, 'w169-ps-the-powershell-guard-admits-what-the-bash-guard-admits-and-its-refusals-name-the-way-out.patch');
const allowedPrefixes = ['plugins/pipeline-core/lib/guard/'];
const allowedFiles = [
  'plugins/pipeline-core/hooks/antigravity-pretool-guard.mjs',
  'plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs',
  'plugins/pipeline-core/hooks/guard-devplan.mjs',
  'plugins/pipeline-core/lib/powershell-bash-guard-parity.test.mjs',
  'harness/verify-suites.json',
  'docs/product-capability-inventory.json',
];

test('the patch exists and is non-empty', () => {
  assert.ok(existsSync(patch));
  assert.ok(statSync(patch).size > 0);
});

test('the patch touches only the named guard, test and registration files', () => {
  const files = [...readFileSync(patch, 'utf8').matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0);
  for (const f of files) {
    assert.ok(allowedFiles.includes(f) || allowedPrefixes.some((prefix) => f.startsWith(prefix)), `unexpected file ${f}`);
  }
});

test('the patch carries the new parity suite', () => {
  assert.match(readFileSync(patch, 'utf8'), /^diff --git a\/plugins\/pipeline-core\/lib\/powershell-bash-guard-parity\.test\.mjs /m);
});
