import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const text = readFileSync(join(here, 'R5.md'), 'utf8');
const IDS = ['AC-134', 'AC-154'];
const LABELS = ['Original search', 'Reconstructed acceptance', 'Evidence consulted', 'Already landed', 'PO question'];

const headings = [...text.matchAll(/^## (AC-\d+)\b.*$/gm)];
const sections = headings.map((m, i) => ({
  id: m[1],
  body: text.slice(m.index + m[0].length, i + 1 < headings.length ? headings[i + 1].index : text.length),
}));

test('one section per AC id, in order', () => {
  assert.deepEqual(sections.map((s) => s.id), IDS);
});

test('every section has all five labelled bullets, non-empty', () => {
  assert.equal(sections.length, IDS.length);
  for (const s of sections) {
    for (const label of LABELS) {
      const m = s.body.match(new RegExp(`^- ${label}:[ \\t]*(\\S.*)$`, 'm'));
      assert.ok(m, `${s.id} is missing a non-empty "- ${label}:" bullet`);
    }
  }
});

test('header says RELEASED by PO decision K6', () => {
  const header = headings.length ? text.slice(0, headings[0].index) : text;
  assert.ok(header.includes('Status: RELEASED - PO decision 2026-10-16 (K6)'));
  assert.ok(!header.includes('DRAFT'));
  assert.ok(!header.includes('until the PO releases'));
});

test('no absolute host path', () => {
  assert.doesNotMatch(text, /[A-Za-z]:[\\/]/);
  assert.ok(!text.includes('/home/'));
  assert.ok(!text.includes('/Users/'));
});
