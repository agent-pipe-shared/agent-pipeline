// SPDX-License-Identifier: SUL-1.0
/**
 * Trace of accepted risks in a Spec (candidate 30k, lane K16; stages S1/S2 of specs/sprint-alfred-epic/plans/accepted-prd-risk-trace-table-2026-11-18.md).
 *
 * WHY. A risk accepted in a PRD is prose: nothing names it and nothing fails when it materialises. A PRD is never parsed (that would be a heuristic
 * gate). The Spec is the approved, digest-bound document, so ONE closed table in the Spec carries one row per accepted risk or assumption.
 *
 * WHAT IT READS. Only the Spec text, plus two injected reads. Pure and derive-only: nothing is stored, written, run or fetched; the Spec bytes
 * are the only state (same shape as spec-journey-coverage.mjs). It reports and never refuses.
 *
 * THE CLOSED MARKER. A markdown table, outside any fenced block, whose header row is exactly `| id | source | statement | trace |` (case and
 * spacing free), then its separator row, then data rows up to the first line that is not a table row. `trace` is exactly one of:
 *   a test path (`*.test.mjs|cjs|js`)            covered when the file exists, stale when it does not
 *   `command:<id>`                                 covered (the plan hand-off already requires a named command id to be registered; a supplied
 *                                                  `deps.isCommandRegistered` makes an unregistered id stale)
 *   `residual: backlog/items/<item>.md`            residual-stated when the item exists, stale when it does not
 *   `not-applicable: <reason>`                     not-applicable (a stated reason is the trace)
 * An empty cell, an unfilled placeholder (`<...>`, `{{...}}`) or a form with no value is `untraced`; any other cell, a row without exactly four
 * cells, a bad id or a repeated id is `malformed`. No table (or a table without rows) reads `not-applicable`, never missing, so a Spec older than
 * the table is not flipped.
 *
 * deps.exists(rel) -> boolean is called only for a row that names a path; it is required then, and a throwing reader propagates (the caller
 * maps that to "unknown": the reader never claims what it cannot read). deps.isCommandRegistered(id) -> boolean is optional.
 */

export const RISK_TRACE_HEADER = '| id | source | statement | trace |';

const HEADER_CELLS = Object.freeze(['id', 'source', 'statement', 'trace']);
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/u;
const SEPARATOR = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/u;
const ROW_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const PLACEHOLDER = /<[^>]*>|\{\{|REPLACE/u;
const TEST_PATH = /^[A-Za-z0-9_./-]+\.test\.(?:mjs|cjs|js)$/u;
const BACKLOG_ITEM = /^backlog\/items\/[A-Za-z0-9][A-Za-z0-9._-]*\.md$/u;
const COMMAND = /^command:([A-Za-z0-9][A-Za-z0-9._:-]{0,127})$/u;

/** The cells of one table line (`\|` is a literal pipe); the leading and trailing pipe are not cells. */
function cellsOf(line) {
  const text = line.trim();
  const parts = [];
  let current = '';
  for (let index = 0; index < text.length; index++) {
    if (text[index] === '\\' && text[index + 1] === '|') { current += '|'; index++; } else if (text[index] === '|') { parts.push(current); current = ''; } else current += text[index];
  }
  parts.push(current);
  if (text.startsWith('|')) parts.shift();
  if (text.endsWith('|') && !text.endsWith('\\|') && parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
  return parts.map((part) => part.trim());
}

const unwrap = (cell) => { const match = /^`([^`]*)`$/u.exec(cell); return match === null ? cell : match[1].trim(); };
const isHeader = (line) => { const cells = cellsOf(line); return line.trim().startsWith('|') && cells.length === HEADER_CELLS.length && cells.every((cell, index) => cell.toLowerCase() === HEADER_CELLS[index]); };

/** The data rows of every closed table outside a fenced block: arrays of raw cells. */
function tableRows(source) {
  const rows = [];
  let fence = null;
  let state = 'outside'; // outside | separator | rows
  for (const line of source.split(/\r?\n/u)) {
    const open = FENCE_OPEN.exec(line);
    if (fence !== null) {
      if (open !== null && open[1][0] === fence.char && open[1].length >= fence.length && line.trim() === open[1]) fence = null;
      continue;
    }
    if (open !== null) { fence = { char: open[1][0], length: open[1].length }; state = 'outside'; continue; }
    if (state === 'separator') {
      if (SEPARATOR.test(line)) { state = 'rows'; continue; }
      state = 'outside';
    } else if (state === 'rows') {
      if (line.trim().startsWith('|')) { rows.push(cellsOf(line)); continue; }
      state = 'outside';
    }
    if (isHeader(line)) state = 'separator';
  }
  return rows;
}

function classify(trace, deps) {
  const exists = (rel) => {
    if (typeof deps?.exists !== 'function') throw new TypeError('inspectSpecRiskTrace needs deps.exists(rel) to resolve a named path');
    return deps.exists(rel) === true;
  };
  const value = unwrap(trace);
  if (value === '' || PLACEHOLDER.test(value)) return { status: 'untraced', reason: 'the trace cell names nothing' };
  const form = /^(not-applicable|residual):\s*(.*)$/iu.exec(value);
  if (form !== null) {
    const rest = unwrap(form[2].trim());
    if (rest === '') return { status: 'untraced', reason: `\`${form[1].toLowerCase()}:\` names nothing` };
    if (form[1].toLowerCase() === 'not-applicable') return { status: 'not-applicable' };
    if (!BACKLOG_ITEM.test(rest)) return { status: 'malformed', reason: 'a residual names one backlog/items/<item>.md path' };
    return exists(rest) ? { status: 'residual-stated' } : { status: 'stale', reason: `the backlog item ${rest} does not exist` };
  }
  const command = COMMAND.exec(value);
  if (command !== null) {
    if (typeof deps?.isCommandRegistered === 'function' && deps.isCommandRegistered(command[1]) !== true) return { status: 'stale', reason: `command ${command[1]} is not registered` };
    return { status: 'covered' };
  }
  if (TEST_PATH.test(value) && !value.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    return exists(value) ? { status: 'covered' } : { status: 'stale', reason: `the test file ${value} does not exist` };
  }
  return { status: 'malformed', reason: 'the trace is none of: a test path, command:<id>, residual: backlog/items/<item>.md, not-applicable: <reason>' };
}

/**
 * @param {string} specText the Spec text
 * @param {{exists?: (rel: string) => boolean, isCommandRegistered?: (id: string) => boolean}} [deps]
 * @returns {{status: 'not-applicable'|'applicable', rows: {id: string, status: 'covered'|'residual-stated'|'not-applicable'|'untraced'|'stale'|'malformed', trace: string, reason?: string}[], open: string[]}}
 */
export function inspectSpecRiskTrace(specText, deps = {}) {
  const raw = tableRows(String(specText));
  if (raw.length === 0) return { status: 'not-applicable', rows: [], open: [] };
  const seen = new Set();
  const rows = raw.map((cells, index) => {
    const id = unwrap(cells[0] ?? '') || `#${index + 1}`;
    const trace = cells.length === HEADER_CELLS.length ? unwrap(cells[3]) : '';
    if (cells.length !== HEADER_CELLS.length) return { id, status: 'malformed', trace, reason: `a risk row has exactly ${HEADER_CELLS.length} cells (${HEADER_CELLS.join(', ')})` };
    if (!ROW_ID.test(id)) return { id, status: 'malformed', trace, reason: 'the id is a short token such as R-1' };
    if (seen.has(id)) return { id, status: 'malformed', trace, reason: 'the id is already used by an earlier row' };
    seen.add(id);
    return { id, trace, ...classify(trace, deps) };
  });
  return { status: 'applicable', rows, open: rows.filter((row) => ['untraced', 'stale', 'malformed'].includes(row.status)).map((row) => row.id) };
}
