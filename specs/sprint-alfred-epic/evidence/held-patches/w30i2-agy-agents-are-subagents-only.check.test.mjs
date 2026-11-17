// SPDX-License-Identifier: SUL-1.0
// Check for held patch w30i2 (C30I-S1B, AC-108): the patch exists, is non-empty and touches only the briefed files.
// It is a delta on the 30h chain plus the skill split, so it is deliberately NOT applied to the real checkout here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PATCH = join(import.meta.dirname, 'w30i2-agy-agents-are-subagents-only.patch');
const ALLOWED = new Set([
  'plugins/pipeline-core/lib/agy-central-snapshot.mjs',
  'plugins/pipeline-core/lib/pins/antigravity-global-refresh-recovers-and-installs-a-runner-view.test.mjs',
  'plugins/pipeline-core/install-agy.test.mjs',
  'plugins/pipeline-core/skills/pipeline-start/references/antigravity-native-dispatch.md',
]);

test('the patch exists and is non-empty', () => {
  assert.ok(statSync(PATCH).size > 0);
});

test('the patch touches only the briefed files and carries the transform change', () => {
  const text = readFileSync(PATCH, 'utf8');
  const touched = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)].flatMap((m) => [m[1], m[2]]);
  assert.ok(touched.length > 0);
  for (const path of touched) assert.ok(ALLOWED.has(path), `unexpected file in the patch: ${path}`);
  assert.ok(touched.includes('plugins/pipeline-core/lib/agy-central-snapshot.mjs'));
  assert.match(text, /AGV-AGENT-KEY-CONFLICT/);
});
