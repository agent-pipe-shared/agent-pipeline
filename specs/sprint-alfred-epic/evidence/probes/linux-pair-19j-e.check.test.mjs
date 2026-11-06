import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const target = new URL('./linux-pair-19j-e.md', import.meta.url);

test('probe e evidence file exists and contains the fixed line', () => {
  assert.ok(existsSync(target));
  assert.ok(readFileSync(target, 'utf8').includes('linux simultaneous pair probe e'));
});
