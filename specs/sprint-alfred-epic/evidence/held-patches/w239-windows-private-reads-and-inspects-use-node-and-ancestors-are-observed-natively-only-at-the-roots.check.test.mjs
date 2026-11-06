// SPDX-License-Identifier: SUL-1.0
// C19I-W239 (AC-108): the held patch exists, is not empty and touches only the plugin's lib/ and scripts/ directories.
// The behavior itself is pinned by plugins/pipeline-core/lib/windows-node-authority-reads.test.mjs inside the patch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const stem = 'w239-windows-private-reads-and-inspects-use-node-and-ancestors-are-observed-natively-only-at-the-roots';
const patchFile = join(dirname(fileURLToPath(import.meta.url)), `${stem}.patch`);

test('the held patch exists and is not empty', () => {
  assert.equal(existsSync(patchFile), true);
  assert.ok(statSync(patchFile).size > 0);
});

test('the held patch touches only plugins/pipeline-core/lib/ and plugins/pipeline-core/scripts/', () => {
  const text = readFileSync(patchFile, 'utf8');
  const touched = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((match) => [match[1], match[2]]);
  assert.ok(touched.length > 0, 'the patch names at least one file');
  for (const file of touched) assert.match(file, /^plugins\/pipeline-core\/(?:lib|scripts)\/[^/]+$/u, file);
});
