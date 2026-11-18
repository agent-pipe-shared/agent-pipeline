import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

// The patch is a delta on the base clone of candidate 31 (the clone int), so it is NOT applied to the repository here; the notes state the required order.
const patch = resolve(import.meta.dirname, 'w311-the-close-derives-the-adr-state-and-names-the-create-adr-command.patch');
const allowed = [
  'plugins/pipeline-core/lib/close-quality-readback.mjs',
  'plugins/pipeline-core/lib/close-quality-readback.test.mjs',
  'plugins/pipeline-core/scripts/close-coordinator.mjs',
  'plugins/pipeline-core/scripts/close-coordinator.test.mjs',
];

test('the patch exists and is non-empty', () => {
  assert.ok(existsSync(patch));
  assert.ok(statSync(patch).size > 0);
});

test('the patch touches only the named files', () => {
  const files = [...readFileSync(patch, 'utf8').matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0);
  for (const f of files) assert.ok(allowed.includes(f), `unexpected file ${f}`);
});
