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

// ---------------------------------------------------------------------------
// A5-A7 (ALF-C-P5-04B; PO decisions 2026-10-16 #26/#29): the headroom is surfaced
// where work happens. The budget is a RUN-TIME budget per run, an optional
// calibration field resourceBudget.{quickSeconds,verifySeconds}, compared with the
// measured run time; no valid budget -> unknown; INFORMATION ONLY - it never blocks,
// fails or changes an exit code.
//   A5 within    A6 exceeded (still exit 0, same result)    A7 unknown (no budget /
//   bad input / a throwing reporter), never an invented figure or a changed exit.
// A8 pins the protected harness/scripts/verify.mjs wiring once its signature-bound
// patch is applied (HEADROOM_PIN_VERIFY points the case at a patched scratch mirror).
// ---------------------------------------------------------------------------
const runtimeLib = await import(libUrl);
const { headroomForRun, runHeadroomInfoLine } = runtimeLib;
const needFunctions = () => {
  assert.equal(typeof headroomForRun, 'function', 'headroomForRun is not exported (run-time headroom not implemented)');
  assert.equal(typeof runHeadroomInfoLine, 'function', 'runHeadroomInfoLine is not exported (run-time headroom not implemented)');
};
const PREFIX = 'Resource headroom (run time): ';
const BUDGET = { resourceBudget: { quickSeconds: 120, verifySeconds: 1800 } };
const unknownLine = (key) => `${PREFIX}unknown - no valid run-time budget declared (resourceBudget.${key}) or no valid measurement (information only)`;
const calibrated = (calibration) => {
  const root = fixture();
  mkdirSync(join(root, 'project'));
  if (calibration !== undefined) {
    writeFileSync(join(root, 'project', 'pipeline.json'), typeof calibration === 'string' ? calibration : JSON.stringify(calibration), { flag: 'wx' });
  }
  return root;
};
const runtimeArgs = (kind, value) => ['--run-time', kind, '--measured-seconds', String(value)];
const subprocessRun = (root, argv) => spawnSync(process.execPath, [scriptPath, ...argv], { cwd: root, encoding: 'utf8' });

test('A5 within: the run-time budget minus the measured run time is reported as headroom', () => {
  needFunctions();
  assert.deepEqual(headroomForRun({ budgetSeconds: 120, measuredSeconds: 30 }),
    { status: 'within', budgetSeconds: 120, measuredSeconds: 30, headroomSeconds: 90 });
  assert.deepEqual(headroomForRun({ budgetSeconds: 120, measuredSeconds: 120 }),
    { status: 'within', budgetSeconds: 120, measuredSeconds: 120, headroomSeconds: 0 });
  const quick = runHeadroomInfoLine({ kind: 'quick', measuredSeconds: 30, calibration: BUDGET });
  assert.equal(quick, `${PREFIX}within - budget 120 s, measured 30 s, headroom 90 s (information only)`);
  const verify = runHeadroomInfoLine({ kind: 'verify', measuredSeconds: 600.5, calibration: BUDGET });
  assert.equal(verify, `${PREFIX}within - budget 1800 s, measured 600.5 s, headroom 1199.5 s (information only)`);
  assert.equal(`${quick}${verify}`.includes('\n'), false);
});

test('A5 Quick surface: the CLI run-time mode reads the calibration budget and prints the within line, exit 0', () => {
  const root = calibrated(BUDGET);
  const quick = subprocessRun(root, runtimeArgs('quick', 30));
  assert.equal(quick.status, 0, quick.stderr);
  assert.equal(quick.stderr, '');
  assert.equal(quick.stdout, `${PREFIX}within - budget 120 s, measured 30 s, headroom 90 s (information only)\n`);
  const verify = subprocessRun(root, runtimeArgs('verify', 30));
  assert.equal(verify.status, 0, verify.stderr);
  assert.equal(verify.stdout, `${PREFIX}within - budget 1800 s, measured 30 s, headroom 1770 s (information only)\n`);
});

test('A6 exceeded: negative headroom is reported as exceeded, still exit 0 and the same result', async () => {
  needFunctions();
  assert.deepEqual(headroomForRun({ budgetSeconds: 120, measuredSeconds: 150.25 }),
    { status: 'exceeded', budgetSeconds: 120, measuredSeconds: 150.25, headroomSeconds: -30.25 });
  const line = runHeadroomInfoLine({ kind: 'quick', measuredSeconds: 150.25, calibration: BUDGET });
  assert.equal(line, `${PREFIX}exceeded - budget 120 s, measured 150.25 s, over by 30.25 s (information only; result and exit code unchanged)`);
  const root = calibrated(BUDGET);
  const over = subprocessRun(root, runtimeArgs('quick', 150.25));
  const within = subprocessRun(root, runtimeArgs('quick', 30));
  assert.equal(over.status, 0, over.stderr);
  assert.equal(over.stderr, '');
  assert.equal(over.stdout, `${line}\n`);
  assert.equal(over.status, within.status, 'exceeding the budget must not change the exit code');
  const inProcess = await runMain(root, runtimeArgs('verify', 99999));
  assert.equal(inProcess.code, 0);
  assert.equal(inProcess.err, '');
  assert.match(inProcess.out, /^Resource headroom \(run time\): exceeded - budget 1800 s, measured 99999 s, over by 98199 s /u);
});

test('A7 unknown when no valid budget or measurement exists - never an invented figure', async () => {
  needFunctions();
  for (const budgetSeconds of [undefined, null, 0, -5, Number.NaN, Infinity, '120', true, {}, []]) {
    assert.deepEqual(headroomForRun({ budgetSeconds, measuredSeconds: 30 }),
      { status: 'unknown', budgetSeconds: null, measuredSeconds: 30, headroomSeconds: null }, String(budgetSeconds));
  }
  for (const measuredSeconds of [undefined, null, -1, Number.NaN, Infinity, '30']) {
    assert.deepEqual(headroomForRun({ budgetSeconds: 120, measuredSeconds }),
      { status: 'unknown', budgetSeconds: 120, measuredSeconds: null, headroomSeconds: null }, String(measuredSeconds));
  }
  for (const input of [undefined, null, 'x', 5]) assert.equal(headroomForRun(input).status, 'unknown');
  for (const calibration of [undefined, null, {}, [], 'text', { resourceBudget: null }, { resourceBudget: {} },
    { resourceBudget: { quickSeconds: 'soon' } }, { resourceBudget: { quickSeconds: 0 } }, { resourceBudget: { verifySeconds: 1800 } }]) {
    assert.equal(runHeadroomInfoLine({ kind: 'quick', measuredSeconds: 30, calibration }), unknownLine('quickSeconds'), JSON.stringify(calibration));
  }
  assert.equal(runHeadroomInfoLine({ kind: 'quick', measuredSeconds: undefined, calibration: BUDGET }), unknownLine('quickSeconds'));
  assert.equal(runHeadroomInfoLine({ kind: 'bogus', measuredSeconds: 30, calibration: BUDGET }), `${PREFIX}unknown - run kind not recognised (information only)`);
  // The CLI: no calibration file, none of the key, malformed JSON, a non-object, an invalid budget - all unknown, all exit 0.
  for (const calibration of [undefined, {}, '{not json', '[]', 'null', JSON.stringify({ resourceBudget: { quickSeconds: -1 } })]) {
    const run = subprocessRun(calibrated(calibration), runtimeArgs('quick', 30));
    assert.equal(run.status, 0, String(calibration));
    assert.equal(run.stderr, '', String(calibration));
    assert.equal(run.stdout, `${unknownLine('quickSeconds')}\n`, String(calibration));
  }
  // Bad run-time arguments still print one unknown line and never fail.
  for (const argv of [['--run-time'], ['--run-time', 'quick'], ['--run-time', 'bogus', '--measured-seconds', '1'],
    ['--run-time', 'quick', '--measured-seconds', '-1'], ['--run-time', 'quick', '--measured-seconds', '1e3'],
    ['--run-time', 'quick', '--measured-seconds', 'NaN'], ['--run-time', 'quick', '--measured-seconds', '1', 'x']]) {
    const r = await runMain(calibrated(BUDGET), argv);
    assert.equal(r.code, 0, JSON.stringify(argv));
    assert.equal(r.err, '', JSON.stringify(argv));
    assert.match(r.out, /^Resource headroom \(run time\): unknown - [^\n]*\n$/u, JSON.stringify(argv));
  }
});

test('A7 a throwing reporter prints unknown and never throws or changes the exit code', async () => {
  needFunctions();
  const boom = () => { throw new Error('reporter exploded SECRET-MARKER-5521'); };
  const line = runHeadroomInfoLine({ kind: 'verify', measuredSeconds: 5, calibration: BUDGET, headroom: boom });
  assert.equal(line, `${PREFIX}unknown - headroom could not be computed (information only)`);
  assert.equal(line.includes('SECRET'), false);
  assert.match(runHeadroomInfoLine(null), /^Resource headroom \(run time\): unknown - /u);
  assert.equal(runHeadroomInfoLine({ kind: 'verify', measuredSeconds: 5, calibration: BUDGET, headroom: () => ({ status: 'within', budgetSeconds: 'x' }) }),
    unknownLine('verifySeconds'));
  assert.equal(runHeadroomInfoLine({ kind: 'verify', measuredSeconds: 5, calibration: BUDGET, headroom: () => ({ status: 'within', budgetSeconds: 10, measuredSeconds: 5, headroomSeconds: -5 }) }),
    unknownLine('verifySeconds'));
  const out = [];
  const err = [];
  const code = await cli.main({ argv: runtimeArgs('verify', 5), stdout: { write: s => { out.push(s); } }, stderr: { write: s => { err.push(s); } },
    cwd: calibrated(BUDGET), headroom: boom });
  assert.equal(code, 0);
  assert.deepEqual(err, []);
  assert.equal(out.join(''), `${PREFIX}unknown - headroom could not be computed (information only)\n`);
  const unreadable = await cli.main({ argv: runtimeArgs('quick', 5), stdout: { write: s => { out.push(s); } }, stderr: { write: s => { err.push(s); } },
    cwd: calibrated(BUDGET), readCalibration: async () => { throw new Error('unreadable'); } });
  assert.equal(unreadable, 0);
  assert.equal(out.at(-1), `${unknownLine('quickSeconds')}\n`);
  const closed = await cli.main({ argv: runtimeArgs('quick', 5), stdout: { write: () => { throw new Error('EPIPE'); } }, stderr: { write: () => {} }, cwd: calibrated(BUDGET) });
  assert.equal(closed, 0);
});

const verifyTarget = process.env.HEADROOM_PIN_VERIFY ?? join(repository, 'harness', 'scripts', 'verify.mjs');
const verifySource = readFileSync(verifyTarget, 'utf8');
const WIRING_PENDING = 'signature-bound patch: harness/scripts/verify.mjs is TP-3 protected; the Verify wiring ships as '
  + 'scratch/patches/ALF-C-P5-04B.patch and this case activates once it is applied (or HEADROOM_PIN_VERIFY points at a patched mirror)';
test('A8 Verify prints the run-time headroom line after the result, guarded, without touching the exit code',
  { skip: verifySource.includes('runHeadroomInfoLine') ? false : WIRING_PENDING }, () => {
    const overall = verifySource.indexOf('console.log(`Overall:');
    const call = verifySource.indexOf('runHeadroomInfoLine');
    const exit = verifySource.indexOf('process.exit(finalExitCode)');
    assert.ok(overall >= 0 && overall < call && call < exit, 'the headroom call must sit between the Overall line and the final exit');
    const wired = verifySource.slice(overall, exit);
    assert.match(wired, /try \{[\s\S]*runHeadroomInfoLine[\s\S]*\} catch \{[\s\S]*Resource headroom \(run time\): unknown/u);
    assert.match(wired, /kind: "verify"/u);
    // The block ends where the ORIGINAL `const finalExitCode = ...` begins; nothing in between may touch an exit code.
    const finalDeclaration = verifySource.indexOf('const finalExitCode');
    assert.ok(call < finalDeclaration && finalDeclaration < exit, 'finalExitCode must still be computed after the headroom block');
    assert.equal(/process\.exit|[eE]xitCode\s*=/u.test(verifySource.slice(call, finalDeclaration)), false, 'the headroom block must not touch the exit code');
  });
