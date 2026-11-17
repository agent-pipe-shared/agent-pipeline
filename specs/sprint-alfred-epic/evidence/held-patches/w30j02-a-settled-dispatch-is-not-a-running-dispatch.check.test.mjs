import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const patch = resolve(import.meta.dirname, 'w30j02-a-settled-dispatch-is-not-a-running-dispatch.patch');
const allowed = [
  'plugins/pipeline-core/lib/dispatch-record-liveness.mjs',
  'plugins/pipeline-core/lib/dispatch-record-liveness.test.mjs',
  'plugins/pipeline-core/scripts/dispatch-record-liveness.mjs',
  'plugins/pipeline-core/scripts/dispatch-record-liveness.test.mjs',
  'plugins/pipeline-core/scripts/dispatch-briefing.mjs',
  'plugins/pipeline-core/scripts/dispatch-briefing.test.mjs',
];

test('the patch exists and is non-empty', () => {
  assert.ok(existsSync(patch));
  assert.ok(statSync(patch).size > 0);
});

// The patch is a delta on the integrated 30i tree, so it is deliberately not applied to the repository here.
test('the patch touches only the named files', () => {
  const files = [...readFileSync(patch, 'utf8').matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0);
  for (const f of files) assert.ok(allowed.includes(f), `unexpected file ${f}`);
});
