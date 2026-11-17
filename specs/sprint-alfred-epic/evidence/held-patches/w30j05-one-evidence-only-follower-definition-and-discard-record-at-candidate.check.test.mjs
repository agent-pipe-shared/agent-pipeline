import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const patch = resolve(import.meta.dirname, 'w30j05-one-evidence-only-follower-definition-and-discard-record-at-candidate.patch');
const allowed = [
  'plugins/pipeline-core/lib/critic-course-admission.mjs',
  'plugins/pipeline-core/lib/critic-course-admission.test.mjs',
  'plugins/pipeline-core/lib/critic-diagnostic-producer.mjs',
  'plugins/pipeline-core/lib/critic-diagnostic-producer.test.mjs',
  'plugins/pipeline-core/lib/critic-diagnostic-evidence.test.mjs',
  'plugins/pipeline-core/lib/pins/critic-course-consumer-chain-walk.test.mjs',
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
