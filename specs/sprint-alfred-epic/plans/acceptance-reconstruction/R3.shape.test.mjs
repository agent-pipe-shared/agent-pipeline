import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const file = new URL('./R3.md', import.meta.url);
const text = readFileSync(file, 'utf8');
const ids = ['AC-153', 'AC-166', 'AC-187'];
const labels = [
  'Original search:',
  'Reconstructed acceptance:',
  'Evidence consulted:',
  'Already landed:',
  'PO question:',
];

const headings = [...text.matchAll(/^## (AC-\d+)\b.*$/gm)];
const sections = headings.map((m, i) => ({
  id: m[1],
  body: text.slice(m.index + m[0].length, i + 1 < headings.length ? headings[i + 1].index : text.length),
}));

test('one section per AC id, in order', () => {
  assert.deepEqual(sections.map((s) => s.id), ids);
});

test('every section has all five labelled bullets non-empty', () => {
  assert.equal(sections.length, ids.length);
  for (const s of sections) {
    for (const label of labels) {
      const re = new RegExp(`^- ${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ \\t]*(\\S.*)$`, 'm');
      assert.match(s.body, re, `${s.id}: bullet "${label}" missing or empty`);
    }
  }
});

test('header marks the draft status', () => {
  const header = headings.length ? text.slice(0, headings[0].index) : text;
  assert.ok(header.includes('DRAFT - pending PO release'));
});

test('no absolute host path', () => {
  assert.doesNotMatch(text, /\b[A-Za-z]:[\\/]/);
  assert.ok(!text.includes('/home/'));
  assert.ok(!text.includes('/Users/'));
});
