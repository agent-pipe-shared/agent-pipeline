// SPDX-License-Identifier: SUL-1.0
// Targeted check for C19H-NATIVE-OPTIONS (criterion AC-108, fresh bounded attempt): the result-neutral options
// analysis of the per-operation native authority checks on Windows exists and has the agreed shape.
// Run: node --test specs/sprint-alfred-epic/evidence/native-checks-options-2026-11-05.check.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const documentPath = join(dirname(fileURLToPath(import.meta.url)), 'native-checks-options-2026-11-05.md');
const SECTIONS = ['Scope and threat model', 'Checks', 'Options', 'Open questions'];

function read() {
  assert.ok(existsSync(documentPath), 'the options document exists');
  return readFileSync(documentPath, 'utf8');
}

// The body of a section: from its heading line to the next heading of the same or a higher level.
function section(text, title) {
  const lines = text.split(/\r?\n/u);
  const heading = /^(#{1,6})\s+(.*?)\s*$/u;
  const start = lines.findIndex((line) => {
    const match = heading.exec(line);
    return match !== null && match[2].replace(/^\d+[.)]?\s*/u, '').toLowerCase() === title.toLowerCase();
  });
  assert.ok(start >= 0, `the document has the section heading "${title}"`);
  const level = heading.exec(lines[start])[1].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const match = heading.exec(lines[i]);
    if (match !== null && match[1].length <= level) { end = i; break; }
  }
  return lines.slice(start + 1, end).join('\n');
}

test('the document exists', () => {
  read();
});

test('it has the four section headings', () => {
  const text = read();
  for (const title of SECTIONS) section(text, title);
});

test('the Checks section holds a markdown table with at least 6 data rows', () => {
  const rows = section(read(), 'Checks').split('\n').map((line) => line.trim()).filter((line) => line.startsWith('|'));
  // header row + separator row + data rows
  assert.ok(rows.length >= 2 && /^\|[\s:|-]+\|$/u.test(rows[1]), 'a table with a header and a separator row');
  assert.ok(rows.length - 2 >= 6, `at least 6 data rows (found ${rows.length - 2})`);
});

test('the Options section names directory roots, lock and doing nothing', () => {
  const options = section(read(), 'Options').toLowerCase();
  for (const needle of ['directory roots', 'lock', 'doing nothing']) {
    assert.ok(options.includes(needle), `the Options section names "${needle}"`);
  }
});

test('the document contains no absolute host path', () => {
  const offending = read().split(/\r?\n/u).filter((line) => /\/home\/|[A-Z]:\\/u.test(line));
  assert.deepEqual(offending, []);
});
