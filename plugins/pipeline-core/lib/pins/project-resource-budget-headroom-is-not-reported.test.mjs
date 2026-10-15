// SPDX-License-Identifier: SUL-1.0
/**
 * Pin: pipeline.project-resource-budget-headroom-is-not-reported (AC-233).
 *
 * No public original body exists; the acceptance pinned here is the
 * reconstruction in specs/sprint-alfred-epic/plans/acceptance-reconstruction/R1.md:
 *   A1 the bundled read-only reporter reports remaining headroom against a
 *      declared budget (limit - measured), from a bounded public observation input;
 *   A2 missing / stale / malformed observations report headroom as unknown
 *      (null) or are refused - never an invented figure;
 *   A3 the report never claims compliance and the reporter is read-only;
 *   A4 the reporter is reachable as a read-only command (CLI + guard route).
 * The reporter's own contract: report arithmetic over declared observations.
 *
 * HEADROOM_PIN_LIB / HEADROOM_PIN_SCRIPT point the pin at a scratch mirror so a
 * mutated copy can prove the cases fail (RED); production is never edited.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, lstatSync, linkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repository = fileURLToPath(new URL('../../../../', import.meta.url));
const libUrl = process.env.HEADROOM_PIN_LIB
  ? pathToFileURL(process.env.HEADROOM_PIN_LIB).href
  : new URL('../project-resource-headroom.mjs', import.meta.url).href;
const scriptPath = process.env.HEADROOM_PIN_SCRIPT
  ?? fileURLToPath(new URL('../../scripts/report-resource-headroom.mjs', import.meta.url));
const { reportProjectResourceHeadroom, ResourceHeadroomError } = await import(libUrl);
const cli = process.env.HEADROOM_PIN_SCRIPT
  ? await import(pathToFileURL(scriptPath).href)
  : await import('../../scripts/report-resource-headroom.mjs');

const HOST_LIMITATION = 'host-limitation: native Windows host cannot create directory symlinks or mode bits; '
  + 'owner Coordinator, due 2026-10-19, to be run on the Linux/WSL host (PO decision K7)';

const base = join(repository, 'scratch', 'headroom-pin-fixtures');
mkdirSync(base, { recursive: true });
const fixture = () => {
  const root = mkdtempSync(join(base, 'case-'));
  mkdirSync(join(root, 'inputs'));
  return root;
};

const C1 = { commit: 'a'.repeat(40), tree: 'b'.repeat(40) };
const SRC = { path: 'docs/budget.md', sha256: 'c'.repeat(64), locator: 'section 2' };
const limit = (value = 100, unit = 'ms') => ({ value, unit, sourceRef: { ...SRC } });
const meas = (value, over = {}) => ({
  value, unit: 'ms', candidate: { ...C1 }, limitSourceSha256: SRC.sha256,
  command: 'node --test x', artifactRef: { path: 'evidence/m.json', sha256: 'd'.repeat(64) }, exitCode: 0, ...over,
});
const doc = (resources) => ({ schema: 'pipeline.project-resource-observations.v1', candidate: { ...C1 }, resources });
const one = (resource) => reportProjectResourceHeadroom(doc([resource])).resources[0];

test('A1 headroom is limit minus measured, with provenance echoed', () => {
  const r = one({ id: 'build-time', limit: limit(100), measurement: meas(40) });
  assert.equal(r.status, 'within-limit');
  assert.equal(r.headroom, 60);
  assert.equal(r.limit, 100);
  assert.equal(r.measured, 40);
  assert.equal(r.unit, 'ms');
  assert.deepEqual(r.limitSourceRef, SRC);
  assert.equal(r.measurementCommand, 'node --test x');
  assert.equal(r.measurementExitCode, 0);
});

test('A1 exactly at the limit is zero headroom within-limit; over the limit is negative and exceeded', () => {
  assert.deepEqual([one({ id: 'a', limit: limit(100), measurement: meas(100) })].map(r => [r.status, r.headroom]), [['within-limit', 0]]);
  const over = one({ id: 'a', limit: limit(100), measurement: meas(130) });
  assert.equal(over.status, 'exceeded');
  assert.equal(over.headroom, -30);
});

test('A2 missing limit or missing measurement reports unknown with null headroom', () => {
  for (const resource of [
    { id: 'a', limit: null, measurement: meas(5) },
    { id: 'a', limit: limit(100), measurement: null },
    { id: 'a', limit: null, measurement: null },
  ]) {
    const r = one(resource);
    assert.equal(r.status, 'unknown');
    assert.equal(r.headroom, null);
  }
});

test('A2 a measurement from another candidate or against another limit source is stale, no figure', () => {
  for (const over of [
    { candidate: { commit: 'e'.repeat(40), tree: C1.tree } },
    { candidate: { commit: C1.commit, tree: 'e'.repeat(40) } },
    { limitSourceSha256: 'f'.repeat(64) },
  ]) {
    const r = one({ id: 'a', limit: limit(100), measurement: meas(10, over) });
    assert.equal(r.status, 'stale');
    assert.equal(r.headroom, null);
  }
});

test('A2 incompatible units and failed measurements yield no headroom figure', () => {
  const units = one({ id: 'a', limit: limit(100, 'ms'), measurement: meas(10, { unit: 's' }) });
  assert.equal(units.status, 'incompatible-units');
  assert.equal(units.headroom, null);
  const failed = one({ id: 'a', limit: limit(100), measurement: meas(10, { exitCode: 1 }) });
  assert.equal(failed.status, 'measurement-failed');
  assert.equal(failed.headroom, null);
});

test('A2 malformed input is refused with the typed error, and one bad resource refuses the whole document', () => {
  const good = { id: 'ok', limit: limit(100), measurement: meas(1) };
  const bad = [
    null, [], { ...doc([good]), schema: 'other' }, { ...doc([good]), extra: 1 },
    { ...doc([good]), candidate: { commit: 'xyz', tree: C1.tree } },
    doc('nope'),
    doc([good, { id: 'bad id!', limit: null, measurement: null }]),
    doc([good, { id: 'neg', limit: limit(-1), measurement: null }]),
    doc([good, { id: 'nan', limit: limit(Number.NaN), measurement: null }]),
    doc([good, { id: 'm', limit: null, measurement: meas(Infinity) }]),
    doc([good, { id: 'm', limit: null, measurement: meas(1, { exitCode: 0.5 }) }]),
    doc([good, { id: 'p', limit: { ...limit(1), sourceRef: { ...SRC, path: '../x' } }, measurement: null }]),
    doc([good, { id: 'p', limit: { ...limit(1), sourceRef: { ...SRC, path: 'C:/x' } }, measurement: null }]),
    doc([good, { id: 'e', limit: null }]),
  ];
  for (const input of bad) {
    assert.throws(() => reportProjectResourceHeadroom(input), error => error instanceof ResourceHeadroomError && error.code === 'RESOURCE-HEADROOM-INPUT');
  }
});

test('A3 the report never certifies compliance and does not mutate its input', () => {
  const input = doc([{ id: 'a', limit: limit(100), measurement: meas(10) }, { id: 'b', limit: null, measurement: null }]);
  const before = JSON.stringify(input);
  const report = reportProjectResourceHeadroom(input);
  assert.equal(report.schema, 'pipeline.project-resource-headroom-report.v1');
  assert.equal(report.compliance, 'not-certified');
  assert.equal(report.assurance, 'declared-observations');
  assert.deepEqual(report.candidate, C1);
  assert.equal(JSON.stringify(input), before);
  report.resources[0].limitSourceRef.path = 'mutated';
  assert.equal(JSON.stringify(input), before);
});

function runMain(root, argv, stdinText) {
  let out = ''; let err = '';
  const stdin = stdinText === undefined ? (async function* () {})() : (async function* () { yield Buffer.from(stdinText); })();
  return cli.main({ argv, stdin, stdout: { write: s => { out += s; } }, stderr: { write: s => { err += s; } }, cwd: root })
    .then(code => ({ code, out, err }));
}

test('A1/A4 CLI --input reports headroom as JSON with exit 0 (in-process main)', async () => {
  const root = fixture();
  writeFileSync(join(root, 'inputs', 'obs.json'), JSON.stringify(doc([{ id: 'a', limit: limit(100), measurement: meas(25) }])), { flag: 'wx' });
  const { code, out, err } = await runMain(root, ['--input', 'inputs/obs.json']);
  assert.equal(code, 0);
  assert.equal(err, '');
  const report = JSON.parse(out);
  assert.equal(report.resources[0].headroom, 75);
  assert.equal(report.compliance, 'not-certified');
});

test('A1/A4 CLI as a real subprocess: file input and stdin both work and exit 0', () => {
  const root = fixture();
  const payload = JSON.stringify(doc([{ id: 'a', limit: limit(100), measurement: meas(25) }, { id: 'b', limit: null, measurement: null }]));
  writeFileSync(join(root, 'inputs', 'obs.json'), payload, { flag: 'wx' });
  const viaFile = spawnSync(process.execPath, [scriptPath, '--input', 'inputs/obs.json'], { cwd: root, encoding: 'utf8' });
  assert.equal(viaFile.status, 0, viaFile.stderr);
  const viaStdin = spawnSync(process.execPath, [scriptPath], { cwd: root, encoding: 'utf8', input: payload });
  assert.equal(viaStdin.status, 0, viaStdin.stderr);
  for (const run of [viaFile, viaStdin]) {
    const report = JSON.parse(run.stdout);
    assert.deepEqual(report.resources.map(r => [r.id, r.status, r.headroom]), [['a', 'within-limit', 75], ['b', 'unknown', null]]);
  }
});

test('A2/A3 CLI refuses malformed, non-UTF-8 and oversize input with exit 2, an empty stdout and no echo of the input', async () => {
  const root = fixture();
  const secret = 'SECRET-MARKER-9137';
  writeFileSync(join(root, 'inputs', 'bad.json'), JSON.stringify({ schema: secret }), { flag: 'wx' });
  writeFileSync(join(root, 'inputs', 'notjson.json'), `{${secret}`, { flag: 'wx' });
  writeFileSync(join(root, 'inputs', 'bin.json'), Buffer.from([0xff, 0xfe, 0x7b]), { flag: 'wx' });
  writeFileSync(join(root, 'inputs', 'big.json'), Buffer.alloc(65537, 0x20), { flag: 'wx' });
  for (const name of ['bad', 'notjson', 'bin', 'big']) {
    const r = await runMain(root, ['--input', `inputs/${name}.json`]);
    assert.equal(r.code, 2, name);
    assert.equal(r.out, '', name);
    assert.match(r.err, /^RESOURCE-HEADROOM-INPUT: /u, name);
    assert.equal(r.err.includes(secret), false, name);
  }
  const missing = await runMain(root, ['--input', 'inputs/absent.json']);
  assert.equal(missing.code, 2);
  assert.equal(missing.out, '');
  const stdinBad = await runMain(root, [], '{"schema":"nope"}');
  assert.equal(stdinBad.code, 2);
  assert.equal(stdinBad.out, '');
  const stdinBig = await runMain(root, [], ' '.repeat(65537));
  assert.equal(stdinBig.code, 2);
});

test('A3 CLI argument grammar admits only --input <public repository-relative .json path>', () => {
  assert.deepEqual(cli.parseResourceHeadroomArgs([]), { input: null });
  assert.deepEqual(cli.parseResourceHeadroomArgs(['--input', 'a/b.json']), { input: 'a/b.json' });
  for (const argv of [
    ['--input'], ['--input', 'a.json', 'x'], ['--other', 'a.json'], ['a.json'],
    ['--input', 'a.txt'], ['--input', '../a.json'], ['--input', 'a/../b.json'], ['--input', './a.json'],
    ['--input', 'a//b.json'], ['--input', '/abs/a.json'], ['--input', 'C:/a.json'], ['--input', 'a\\b.json'],
    ['--input', '.git/x.json'], ['--input', '.claude/x.json'], ['--input', '.ssh/x.json'], ['--input', '.pipeline/x.json'],
    ['--input', ''], ['--input', 'a\u0000.json'],
  ]) {
    assert.throws(() => cli.parseResourceHeadroomArgs(argv), error => error instanceof ResourceHeadroomError, JSON.stringify(argv));
  }
  assert.throws(() => cli.parseResourceHeadroomArgs('x'), ResourceHeadroomError);
});

test('A3 CLI is read-only: running it leaves the input file unchanged and creates nothing beside it', async () => {
  const root = fixture();
  const file = join(root, 'inputs', 'obs.json');
  const payload = JSON.stringify(doc([{ id: 'a', limit: limit(10), measurement: meas(1) }]));
  writeFileSync(file, payload, { flag: 'wx' });
  const stat = lstatSync(file);
  await runMain(root, ['--input', 'inputs/obs.json']);
  assert.equal(readFileSync(file, 'utf8'), payload);
  assert.equal(lstatSync(file).mtimeMs, stat.mtimeMs);
  const listing = spawnSync(process.execPath, ['-e', "console.log(JSON.stringify(require('node:fs').readdirSync('inputs')))"], { cwd: root, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(listing.stdout), ['obs.json']);
});

test('A4 the guard admits the bundled reporter as a read-only command and refuses lookalikes', async () => {
  const { isReadOnlyDiagnosticCommand } = await import('../guard/shell-grammar.mjs');
  const root = fixture();
  writeFileSync(join(root, 'inputs', 'obs.json'), '{}\n', { flag: 'wx' });
  const real = fileURLToPath(new URL('../../scripts/report-resource-headroom.mjs', import.meta.url));
  const cmd = (script, input = 'inputs/obs.json') => ['node', script, '--input', input].map(w => JSON.stringify(w)).join(' ');
  assert.equal(isReadOnlyDiagnosticCommand(cmd(real), root), true);
  const foreign = join(root, 'report-resource-headroom.mjs');
  writeFileSync(foreign, '// inert\n', { flag: 'wx' });
  assert.equal(isReadOnlyDiagnosticCommand(cmd(foreign), root), false);
  assert.equal(isReadOnlyDiagnosticCommand(`${cmd(real)} > inputs/out.json`, root), false);
  assert.equal(isReadOnlyDiagnosticCommand(`${cmd(real)} ; node foreign.mjs`, root), false);
  assert.equal(isReadOnlyDiagnosticCommand(cmd(real, '../escape.json'), root), false);
});

test('A3 CLI refuses an input reached through a symlinked parent or aliased file', { skip: HOST_LIMITATION }, () => {});
test('A3 CLI refuses a hard-linked input (nlink != 1)', async () => {
  const root = fixture();
  const file = join(root, 'inputs', 'obs.json');
  writeFileSync(file, JSON.stringify(doc([])), { flag: 'wx' });
  linkSync(file, join(root, 'inputs', 'alias.json'));
  const r = await runMain(root, ['--input', 'inputs/obs.json']);
  assert.equal(r.code, 2);
  assert.equal(r.out, '');
});
