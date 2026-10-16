import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const text = readFileSync(fileURLToPath(new URL('./R1.md', import.meta.url)), 'utf8');
const ids = ['AC-140', 'AC-232', 'AC-233'];
const labels = ['Original search', 'Reconstructed acceptance', 'Evidence consulted', 'Already landed', 'PO question'];

function sections() {
  const parts = text.split(/^## /m).slice(1);
  return parts.map((p) => ({ heading: p.split('\n', 1)[0], body: p }));
}

test('header says RELEASED by PO decision K6', () => {
  assert.ok(text.includes('Status: RELEASED - PO decision 2026-10-16 (K6)'));
  assert.ok(!text.split(/^## /m)[0].includes('DRAFT'));
});

test('one section per AC id, in order', () => {
  const found = sections().map((s) => s.heading.match(/^(AC-\d+)/)?.[1]).filter(Boolean);
  assert.deepEqual(found, ids);
  for (const s of sections()) assert.match(s.heading, /^AC-\d+ - \S/);
});

test('every section has all five labelled bullets non-empty', () => {
  for (const s of sections()) {
    for (const label of labels) {
      const m = s.body.match(new RegExp(`^- ${label}:[ \\t]*(.*)$`, 'm'));
      assert.ok(m, `${s.heading}: missing "- ${label}:"`);
      assert.ok(m[1].trim().length > 0, `${s.heading}: empty "- ${label}:"`);
    }
  }
});

test('no absolute host path', () => {
  assert.doesNotMatch(text, /\b[A-Za-z]:[\\/]/);
  assert.ok(!text.includes('/home/'));
  assert.ok(!text.includes('/Users/'));
});
