import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const patch = resolve(import.meta.dirname, 'w30k08-accepted-prd-risk-trace-table.patch');
const allowed = [
  'specs/sprint-alfred-epic/plans/accepted-prd-risk-trace-table-2026-11-18.md',
];

test('the patch exists and is non-empty', () => {
  assert.ok(existsSync(patch));
  assert.ok(statSync(patch).size > 0);
});

// The patch is a delta on the integrated 30j tree, so it is deliberately not applied to the repository here.
test('the patch touches only the named files', () => {
  const files = [...readFileSync(patch, 'utf8').matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0);
  for (const f of files) assert.ok(allowed.includes(f), `unexpected file ${f}`);
});
