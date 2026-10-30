// SPDX-License-Identifier: SUL-1.0
// AC-190 (D209): runner comparisons rest on published, sanitized observation inputs.
// Cases are written from the backlog item "Greenfield comparisons need reproducible public
// evidence" (comparison cites public evidence only; each evidence file names the Pipeline
// version, the runner and the measured values and carries no private identifier or machine
// path), never from the implementation. Fixtures mirror the real input shape.
import {test, describe} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, realpathSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {
  GREENFIELD_INPUT_SCHEMA,
  GREENFIELD_COMPARISON_SCHEMA,
  readGreenfieldPublicComparisonInput,
  buildGreenfieldPublicComparison,
  publishGreenfieldPublicComparison
} from './greenfield-public-comparison.mjs';
import {screenPublicTransferArtifact} from './bound-artifact-transfer.mjs';
import {runGreenfieldPublicComparison} from '../scripts/greenfield-public-comparison.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = v => v === null || typeof v !== 'object' ? JSON.stringify(v)
  : Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']'
    : '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
const A = 'a'.repeat(64);

function row(caseId, over = {}) {
  return {
    caseId, runner: 'claude', pipeline: 'pipeline', rulesetSha256: null, taskSha256: A,
    window: {
      start: '2026-10-25T10:00:00.000Z', end: '2026-10-25T11:00:00.000Z', firstCode: null, initialBuild: null,
      turnStart: 1, turnEnd: 10, toolStart: 1, toolEnd: 20, phase: 'full', includesAnalysis: false, denominator: 'input-output'
    },
    metrics: {turns: 10, tools: 20, inputTokens: 100, outputTokens: 50, cacheReadTokens: null, cacheWriteTokens: null, activeMs: 1800000, waitMs: 600000},
    coverage: {status: 'complete-reported', methodId: 'method-a'}, result: 'unknown',
    fidelity: {rawSha256: null, derivativeSha256: null},
    ...over
  };
}
const input = (cases = [row('case-a'), row('case-b', {runner: 'codex'})], over = {}) =>
  ({schema: GREENFIELD_INPUT_SCHEMA, comparisonId: 'fixture-comparison', cases, ...over});

function fixtureRoot() {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'gfpc-'));
  mkdirSync(join(root, 'docs'));
  mkdirSync(join(root, 'evidence', 'greenfield-public'), {recursive: true});
  mkdirSync(join(root, 'scratch'));
  return root;
}
function put(root, path, value) {
  const bytes = Buffer.from(typeof value === 'string' ? value : canonical(value) + '\n');
  writeFileSync(join(root, path), bytes);
  return sha(bytes);
}
function readOf(root, value, path = 'docs/in.json') {
  const digest = put(root, path, value);
  return {digest, result: readGreenfieldPublicComparisonInput({rootDir: root, inputPath: path, inputSha256: digest})};
}
const heldCode = (root, value) => readOf(root, value).result;

describe('schema validation (v1, no new fields)', () => {
  test('a valid v1 input without refusalCodes, phasesReached or pipelineVersion reads, builds and publishes', () => {
    const root = fixtureRoot();
    try {
      const {result} = readOf(root, input());
      assert.equal(result.status, 'read');
      const built = buildGreenfieldPublicComparison({inputHandle: result.handle});
      assert.equal(built.status, 'built');
      const published = publishGreenfieldPublicComparison({rootDir: root, outputPath: 'evidence/greenfield-public/out.json', built});
      assert.equal(published.status, 'published');
      const out = JSON.parse(readFileSync(join(root, 'evidence/greenfield-public/out.json'), 'utf8'));
      assert.equal(out.schema, GREENFIELD_COMPARISON_SCHEMA);
      assert.equal(sha(readFileSync(join(root, 'evidence/greenfield-public/out.json'))), published.reportSha256);
      assert.equal(out.conclusions, 'descriptive-only-no-ROI-or-security-or-regression-guarantee');
      for (const pair of out.pairs) assert.equal(pair.causalInference, 'unsupported');
    } finally { rmSync(root, {recursive: true, force: true}); }
  });

  test('structural violations are held with the typed schema code', () => {
    const root = fixtureRoot();
    try {
      const cases = [
        ['one case only', input([row('case-a')])],
        ['unknown top-level key', {...input(), extra: 1}],
        ['wrong schema id', input(undefined, {schema: 'pipeline.greenfield-public-observations.v0'})],
        ['unknown runner', input([row('case-a'), row('case-b', {runner: 'gemini'})])],
        ['unknown case key', input([row('case-a'), {...row('case-b'), note: 'x'}])],
        ['no-pipeline run carrying a ruleset digest', input([row('case-a'), row('case-b', {pipeline: 'no-pipeline', rulesetSha256: A})])],
        ['window end not after start', input([row('case-a'), row('case-b', {window: {...row('x').window, end: '2026-10-25T10:00:00.000Z'}})])],
        ['activeMs plus waitMs above the wall interval', input([row('case-a'), row('case-b', {metrics: {...row('x').metrics, activeMs: 3000000, waitMs: 1000000}})])],
        ['instant without milliseconds', input([row('case-a'), row('case-b', {window: {...row('x').window, start: '2026-10-25T10:00:00Z'}})])],
        ['negative metric', input([row('case-a'), row('case-b', {metrics: {...row('x').metrics, tools: -1}})])],
        ['half-open turn boundary', input([row('case-a'), row('case-b', {window: {...row('x').window, turnEnd: null}})])]
      ];
      for (const [label, value] of cases) {
        const r = heldCode(root, value);
        assert.equal(r.status, 'held', label);
        assert.equal(r.code, 'GPC-SCHEMA', label);
      }
      assert.equal(heldCode(root, input([row('case-a'), row('case-a', {runner: 'codex'})])).code, 'GPC-DUPLICATE');
    } finally { rmSync(root, {recursive: true, force: true}); }
  });

  test('bytes that are not the canonical serialization are held', () => {
    const root = fixtureRoot();
    try {
      const pretty = JSON.stringify(input(), null, 2) + '\n';
      assert.equal(readOf(root, pretty).result.code, 'GPC-CANONICAL');
      assert.equal(readOf(root, canonical(input())).result.code, 'GPC-CANONICAL');
    } finally { rmSync(root, {recursive: true, force: true}); }
  });
});

describe('additive fields: pipelineVersion, phasesReached, refusalCodes', () => {
  const extra = {
    pipelineVersion: '0.7.0+claude.20261025134513.977dad8',
    phasesReached: ['onboarding', 'design', 'implementation'],
    refusalCodes: [{code: 'CAC-REGISTRATION-INVALID', count: 1}, {code: 'GUARD-READ-TARGET', count: 6}]
  };
  const withExtra = over => input([row('case-a', {...extra, ...over}), row('case-b', {runner: 'codex'})]);

  test('valid fields are accepted and carried into the published comparison unchanged', () => {
    const root = fixtureRoot();
    try {
      const {result} = readOf(root, withExtra({}));
      assert.equal(result.status, 'read');
      const built = buildGreenfieldPublicComparison({inputHandle: result.handle});
      assert.equal(built.status, 'built');
      publishGreenfieldPublicComparison({rootDir: root, outputPath: 'evidence/greenfield-public/out.json', built});
      const out = JSON.parse(readFileSync(join(root, 'evidence/greenfield-public/out.json'), 'utf8'));
      const a = out.cases.find(c => c.caseId === 'case-a');
      assert.deepEqual(a.refusalCodes, extra.refusalCodes);
      assert.deepEqual(a.phasesReached, extra.phasesReached);
      assert.equal(a.pipelineVersion, extra.pipelineVersion);
      const b = out.cases.find(c => c.caseId === 'case-b');
      assert.equal(Object.hasOwn(b, 'refusalCodes'), false);
    } finally { rmSync(root, {recursive: true, force: true}); }
  });

  test('empty lists are valid and mean "none reached / none refused"', () => {
    const root = fixtureRoot();
    try {
      assert.equal(readOf(root, withExtra({phasesReached: [], refusalCodes: []})).result.status, 'read');
    } finally { rmSync(root, {recursive: true, force: true}); }
  });

  test('malformed values are held as GPC-SCHEMA', () => {
    const root = fixtureRoot();
    try {
      const bad = [
        ['refusal codes not sorted', {refusalCodes: [{code: 'GUARD-READ-TARGET', count: 1}, {code: 'CAC-REGISTRATION-INVALID', count: 1}]}],
        ['refusal code repeated', {refusalCodes: [{code: 'GUARD-READ-TARGET', count: 1}, {code: 'GUARD-READ-TARGET', count: 2}]}],
        ['refusal code not typed (lowercase)', {refusalCodes: [{code: 'guard-read-target', count: 1}]}],
        ['refusal code without a hyphen part', {refusalCodes: [{code: 'GUARD', count: 1}]}],
        ['refusal count zero', {refusalCodes: [{code: 'GUARD-READ-TARGET', count: 0}]}],
        ['refusal count fractional', {refusalCodes: [{code: 'GUARD-READ-TARGET', count: 1.5}]}],
        ['refusal entry with extra key', {refusalCodes: [{code: 'GUARD-READ-TARGET', count: 1, path: 'x'}]}],
        ['refusal codes not an array', {refusalCodes: {code: 'GUARD-READ-TARGET', count: 1}}],
        ['phase repeated', {phasesReached: ['design', 'design']}],
        ['phase id with uppercase', {phasesReached: ['Design']}],
        ['phases not an array', {phasesReached: 'design'}],
        ['version is free text', {pipelineVersion: 'latest'}],
        ['version carries a path', {pipelineVersion: '0.7.0+a/b'}]
      ];
      for (const [label, over] of bad) {
        const r = heldCode(root, withExtra(over));
        assert.equal(r.status, 'held', label);
        assert.equal(r.code, 'GPC-SCHEMA', label);
      }
    } finally { rmSync(root, {recursive: true, force: true}); }
  });

  test('a no-pipeline run cannot name a Pipeline version', () => {
    const root = fixtureRoot();
    try {
      const control = row('case-b', {runner: 'codex', pipeline: 'no-pipeline', pipelineVersion: '0.7.0'});
      assert.equal(heldCode(root, input([row('case-a'), control])).code, 'GPC-SCHEMA');
      const ok = row('case-b', {runner: 'codex', pipeline: 'no-pipeline', pipelineVersion: null});
      assert.equal(heldCode(root, input([row('case-a'), ok])).status, 'read');
    } finally { rmSync(root, {recursive: true, force: true}); }
  });
});

describe('private-identifier and absolute-path screen', () => {
  test('machine paths, drive paths and credential-shaped text in the input are held before any parsing', () => {
    const root = fixtureRoot();
    try {
      const probes = [
        // Built at run time so this file itself never carries a literal machine path.
        ['posix home path', ['', 'home', 'someone', 'project', 'notes.md'].join('/')],
        ['macOS user path', ['', 'Users', 'someone', 'notes.md'].join('/')],
        ['windows drive path', ['C:', 'Users', 'someone', 'notes.md'].join('\\')],
        ['file url', 'file:' + '//' + '/srv/data/notes.md'],
        ['credential assignment', 'password=hunter2'],
        ['bare absolute path', ' /var/lib/data/x.json']
      ];
      for (const [label, text] of probes) {
        const r = heldCode(root, {...input(), note: text});
        assert.deepEqual([label, r.status, r.code], [label, 'held', 'GPC-PUBLIC-SCREEN']);
      }
    } finally { rmSync(root, {recursive: true, force: true}); }
  });

  test('a clean fixture passes the same screen', () => {
    assert.equal(screenPublicTransferArtifact(Buffer.from(canonical(input()) + '\n')).status, 'screened');
  });
});

describe('public path scope and physical path safety', () => {
  test('input and output paths outside docs/, evidence/ and public/ are held', () => {
    const root = fixtureRoot();
    try {
      const digest = put(root, 'scratch/in.json', input());
      assert.equal(readGreenfieldPublicComparisonInput({rootDir: root, inputPath: 'scratch/in.json', inputSha256: digest}).code, 'GPC-PUBLIC-SCOPE');
      const {result} = readOf(root, input());
      const built = buildGreenfieldPublicComparison({inputHandle: result.handle});
      const out = publishGreenfieldPublicComparison({rootDir: root, outputPath: 'scratch/out.json', built});
      assert.equal(out.code, 'GPC-PUBLIC-SCOPE');
      assert.equal(existsSync(join(root, 'scratch/out.json')), false);
    } finally { rmSync(root, {recursive: true, force: true}); }
  });

  test('traversal, absolute, backslash and dot segments are held as GPC-PATH', () => {
    const root = fixtureRoot();
    try {
      const digest = put(root, 'docs/in.json', input());
      for (const p of ['docs/../scratch/in.json', '/docs/in.json', 'docs\\in.json', 'docs/./in.json', 'docs//in.json', '']) {
        const r = readGreenfieldPublicComparisonInput({rootDir: root, inputPath: p, inputSha256: digest});
        assert.deepEqual([p, r.status, r.code], [p, 'held', 'GPC-PATH']);
      }
    } finally { rmSync(root, {recursive: true, force: true}); }
  });

  test('a symlinked input is held as GPC-PHYSICAL', () => {
    const root = fixtureRoot();
    try {
      const digest = put(root, 'docs/real.json', input());
      symlinkSync(join(root, 'docs/real.json'), join(root, 'docs/link.json'));
      const r = readGreenfieldPublicComparisonInput({rootDir: root, inputPath: 'docs/link.json', inputSha256: digest});
      assert.deepEqual([r.status, r.code], ['held', 'GPC-PHYSICAL']);
    } finally { rmSync(root, {recursive: true, force: true}); }
  });

  test('a root that is not its own real path is held as GPC-ROOT', () => {
    const root = fixtureRoot();
    try {
      const digest = put(root, 'docs/in.json', input());
      symlinkSync(root, root + '-link');
      const r = readGreenfieldPublicComparisonInput({rootDir: root + '-link', inputPath: 'docs/in.json', inputSha256: digest});
      rmSync(root + '-link');
      assert.deepEqual([r.status, r.code], ['held', 'GPC-ROOT']);
    } finally { rmSync(root, {recursive: true, force: true}); }
  });
});

describe('input digest binding', () => {
  test('a wrong or malformed digest holds the read', () => {
    const root = fixtureRoot();
    try {
      put(root, 'docs/in.json', input());
      for (const d of ['b'.repeat(64), 'xyz', '', undefined]) {
        const r = readGreenfieldPublicComparisonInput({rootDir: root, inputPath: 'docs/in.json', inputSha256: d});
        assert.deepEqual([String(d), r.status, r.code], [String(d), 'held', 'GPC-DIGEST']);
      }
    } finally { rmSync(root, {recursive: true, force: true}); }
  });

  test('the comparison records the digest of the exact input bytes it was built from', () => {
    const root = fixtureRoot();
    try {
      const {digest, result} = readOf(root, input());
      const built = buildGreenfieldPublicComparison({inputHandle: result.handle});
      publishGreenfieldPublicComparison({rootDir: root, outputPath: 'evidence/greenfield-public/out.json', built});
      const out = JSON.parse(readFileSync(join(root, 'evidence/greenfield-public/out.json'), 'utf8'));
      assert.equal(out.inputSha256, digest);
    } finally { rmSync(root, {recursive: true, force: true}); }
  });

  test('an input changed after the read is held at build and never reaches the output', () => {
    const root = fixtureRoot();
    try {
      const {result} = readOf(root, input());
      put(root, 'docs/in.json', input([row('case-a'), row('case-b', {runner: 'codex', result: 'failed-reported'})]));
      const built = buildGreenfieldPublicComparison({inputHandle: result.handle});
      assert.deepEqual([built.status, built.code], ['held', 'GPC-DIGEST']);
    } finally { rmSync(root, {recursive: true, force: true}); }
  });

  test('build and publish accept only source-minted handles', () => {
    const root = fixtureRoot();
    try {
      const {result} = readOf(root, input());
      assert.equal(buildGreenfieldPublicComparison({inputHandle: {...result.handle}}).code, 'GPC-HANDLE');
      assert.equal(buildGreenfieldPublicComparison({}).code, 'GPC-HANDLE');
      const forged = {status: 'built', reportSha256: A, byteLength: 10};
      assert.equal(publishGreenfieldPublicComparison({rootDir: root, outputPath: 'evidence/greenfield-public/out.json', built: forged}).code, 'GPC-HANDLE');
      assert.equal(existsSync(join(root, 'evidence/greenfield-public/out.json')), false);
    } finally { rmSync(root, {recursive: true, force: true}); }
  });
});

describe('publish compare-and-swap', () => {
  test('an input changed between build and publish is held and nothing is written', () => {
    const root = fixtureRoot();
    try {
      const {result} = readOf(root, input());
      const built = buildGreenfieldPublicComparison({inputHandle: result.handle});
      put(root, 'docs/in.json', input([row('case-a'), row('case-b', {runner: 'codex', result: 'stopped-reported'})]));
      const out = publishGreenfieldPublicComparison({rootDir: root, outputPath: 'evidence/greenfield-public/out.json', built});
      assert.deepEqual([out.status, out.code], ['held', 'GPC-DIGEST']);
      assert.equal(existsSync(join(root, 'evidence/greenfield-public/out.json')), false);
    } finally { rmSync(root, {recursive: true, force: true}); }
  });

  test('an existing output is preserved byte for byte (exclusive create)', () => {
    const root = fixtureRoot();
    try {
      const {result} = readOf(root, input());
      const built = buildGreenfieldPublicComparison({inputHandle: result.handle});
      writeFileSync(join(root, 'evidence/greenfield-public/out.json'), 'previous\n');
      const out = publishGreenfieldPublicComparison({rootDir: root, outputPath: 'evidence/greenfield-public/out.json', built});
      assert.deepEqual([out.status, out.code], ['held', 'GPC-PUBLICATION-UNAVAILABLE']);
      assert.equal(readFileSync(join(root, 'evidence/greenfield-public/out.json'), 'utf8'), 'previous\n');
    } finally { rmSync(root, {recursive: true, force: true}); }
  });

  test('the parent must already exist and the leaf must be a plain .json name', () => {
    const root = fixtureRoot();
    try {
      const {result} = readOf(root, input());
      const built = buildGreenfieldPublicComparison({inputHandle: result.handle});
      assert.equal(publishGreenfieldPublicComparison({rootDir: root, outputPath: 'evidence/new-dir/out.json', built}).status, 'held');
      assert.equal(existsSync(join(root, 'evidence/new-dir')), false);
      assert.equal(publishGreenfieldPublicComparison({rootDir: root, outputPath: 'evidence/greenfield-public/out.txt', built}).code, 'GPC-PATH');
      assert.equal(publishGreenfieldPublicComparison({rootDir: root, outputPath: 'out.json', built}).code, 'GPC-PATH');
    } finally { rmSync(root, {recursive: true, force: true}); }
  });

  test('the published bytes hash to the digest the build reported', () => {
    const root = fixtureRoot();
    try {
      const {result} = readOf(root, input());
      const built = buildGreenfieldPublicComparison({inputHandle: result.handle});
      const out = publishGreenfieldPublicComparison({rootDir: root, outputPath: 'evidence/greenfield-public/out.json', built});
      const bytes = readFileSync(join(root, 'evidence/greenfield-public/out.json'));
      assert.equal(sha(bytes), built.reportSha256);
      assert.equal(out.byteLength, bytes.length);
      assert.equal(bytes.toString('utf8'), canonical(JSON.parse(bytes.toString('utf8'))) + '\n');
    } finally { rmSync(root, {recursive: true, force: true}); }
  });
});

describe('comparison semantics', () => {
  test('different runners, windows or methods leave the pair unresolved with named reasons', () => {
    const root = fixtureRoot();
    try {
      const b = row('case-b', {runner: 'codex', coverage: {status: 'partial-reported', methodId: 'method-b'}, window: {...row('x').window, end: '2026-10-25T11:30:00.000Z'}});
      const {result} = readOf(root, input([row('case-a'), b]));
      const built = buildGreenfieldPublicComparison({inputHandle: result.handle});
      publishGreenfieldPublicComparison({rootDir: root, outputPath: 'evidence/greenfield-public/out.json', built});
      const out = JSON.parse(readFileSync(join(root, 'evidence/greenfield-public/out.json'), 'utf8'));
      assert.equal(out.pairs.length, 1);
      assert.equal(out.pairs[0].sameWindow, 'unresolved');
      assert.ok(out.pairs[0].reasons.includes('different-window-end'));
      assert.ok(out.pairs[0].reasons.includes('incomplete-coverage'));
      assert.ok(out.pairs[0].reasons.includes('different-or-unknown-method'));
      assert.equal(out.pairs[0].runnerDifference, true);
      assert.equal(out.assurance.cost, 'unknown-no-billing-source');
      assert.equal(out.assurance.originalCustody, 'unavailable');
    } finally { rmSync(root, {recursive: true, force: true}); }
  });

  test('identical declared windows, task and complete method are declared matching', () => {
    const root = fixtureRoot();
    try {
      const {result} = readOf(root, input([row('case-a'), row('case-b', {runner: 'codex'})]));
      const built = buildGreenfieldPublicComparison({inputHandle: result.handle});
      publishGreenfieldPublicComparison({rootDir: root, outputPath: 'evidence/greenfield-public/out.json', built});
      const out = JSON.parse(readFileSync(join(root, 'evidence/greenfield-public/out.json'), 'utf8'));
      assert.equal(out.pairs[0].sameWindow, 'declared-matching');
      assert.deepEqual(out.pairs[0].reasons, []);
    } finally { rmSync(root, {recursive: true, force: true}); }
  });

  test('category shares are arithmetic on reported counters, unknown when a counter is missing', () => {
    const root = fixtureRoot();
    try {
      const unknown = row('case-b', {runner: 'codex', metrics: {...row('x').metrics, inputTokens: null}});
      const {result} = readOf(root, input([row('case-a'), unknown]));
      const built = buildGreenfieldPublicComparison({inputHandle: result.handle});
      publishGreenfieldPublicComparison({rootDir: root, outputPath: 'evidence/greenfield-public/out.json', built});
      const out = JSON.parse(readFileSync(join(root, 'evidence/greenfield-public/out.json'), 'utf8'));
      const a = out.cases.find(c => c.caseId === 'case-a'), b = out.cases.find(c => c.caseId === 'case-b');
      assert.equal(a.categoryShares.denominator, 150);
      assert.equal(a.categoryShares.shares.inputTokens, 100 / 150);
      assert.equal(b.categoryShares.status, 'unknown');
      assert.equal(a.intervals.wallMs, 3600000);
    } finally { rmSync(root, {recursive: true, force: true}); }
  });

  test('case order is by code unit, independent of the process locale (reproducible digest)', () => {
    const root = fixtureRoot();
    try {
      const {result} = readOf(root, input([row('a1'), row('B1', {runner: 'codex'}), row('a-2', {runner: 'antigravity'})]));
      const built = buildGreenfieldPublicComparison({inputHandle: result.handle});
      publishGreenfieldPublicComparison({rootDir: root, outputPath: 'evidence/greenfield-public/out.json', built});
      const out = JSON.parse(readFileSync(join(root, 'evidence/greenfield-public/out.json'), 'utf8'));
      assert.deepEqual(out.cases.map(c => c.caseId), ['B1', 'a-2', 'a1']);
    } finally { rmSync(root, {recursive: true, force: true}); }
  });
});

describe('CLI', () => {
  const run = (root, argv) => {
    let out = '';
    const code = runGreenfieldPublicComparison(argv, {stdout: {write: s => { out += s; }}, rootDir: root});
    return {code, json: JSON.parse(out)};
  };
  test('the exact flag shape publishes and exits 0', () => {
    const root = fixtureRoot();
    try {
      const digest = put(root, 'docs/in.json', input());
      const r = run(root, ['--input', 'docs/in.json', '--input-sha256', digest, '--output', 'evidence/greenfield-public/out.json']);
      assert.equal(r.code, 0);
      assert.equal(r.json.status, 'published');
      assert.equal(sha(readFileSync(join(root, 'evidence/greenfield-public/out.json'))), r.json.reportSha256);
    } finally { rmSync(root, {recursive: true, force: true}); }
  });
  test('any other flag shape is held as GPC-ARGS and a bad digest as GPC-DIGEST, both exit 2', () => {
    const root = fixtureRoot();
    try {
      const digest = put(root, 'docs/in.json', input());
      assert.deepEqual(run(root, ['--input', 'docs/in.json']).json, {status: 'held', code: 'GPC-ARGS'});
      assert.equal(run(root, ['--input-sha256', digest, '--input', 'docs/in.json', '--output', 'evidence/greenfield-public/out.json']).code, 2);
      const bad = run(root, ['--input', 'docs/in.json', '--input-sha256', 'c'.repeat(64), '--output', 'evidence/greenfield-public/out.json']);
      assert.deepEqual([bad.code, bad.json.code], [2, 'GPC-DIGEST']);
      assert.equal(existsSync(join(root, 'evidence/greenfield-public/out.json')), false);
    } finally { rmSync(root, {recursive: true, force: true}); }
  });
});

describe('the first published set (greenfield second run)', () => {
  const root = realpathSync(resolve(import.meta.dirname, '../../..'));
  const dir = 'evidence/greenfield-public';
  const files = {
    claude: `${dir}/observations-claude-second-run.json`,
    codex: `${dir}/observations-codex-second-run.json`,
    antigravity: `${dir}/observations-antigravity-second-run.json`
  };
  const comparisonPath = `${dir}/comparison-second-run.json`;
  const readmePath = `${dir}/README.md`;
  const bytesOf = p => readFileSync(join(root, p));
  const ledger = JSON.parse(bytesOf('specs/sprint-alfred-epic/evidence/greenfield-second-run-2026-10-25/findings.json'));
  const ledgerRow = key => ledger.reports.find(r => r.runner === key);
  const ledgerKey = {claude: 'claude', codex: 'codex', antigravity: 'agy'};
  const VERSIONS = {
    claude: '0.7.0+claude.20261025134513.977dad8',
    codex: '0.7.0+codex.20261025134513.977dad8',
    antigravity: '0.7.0'
  };
  const CASE_IDS = ['antigravity-pipeline-second-run', 'claude-pipeline-second-run', 'codex-no-pipeline-control', 'codex-pipeline-second-run'];
  const caseOf = (parsed, runner) => parsed.cases.find(c => c.pipeline === 'pipeline' && c.runner === runner);

  test('the three observation files, the comparison and the README exist', () => {
    for (const p of [...Object.values(files), comparisonPath, readmePath]) assert.ok(existsSync(join(root, p)), p);
  });

  for (const runner of ['claude', 'codex', 'antigravity']) {
    test(`${runner}: validates against the schema, names version, runner and measured values`, () => {
      const bytes = bytesOf(files[runner]);
      const r = readGreenfieldPublicComparisonInput({rootDir: root, inputPath: files[runner], inputSha256: sha(bytes)});
      assert.equal(r.status, 'read', JSON.stringify(r));
      const parsed = JSON.parse(bytes.toString('utf8'));
      assert.equal(parsed.schema, GREENFIELD_INPUT_SCHEMA);
      const c = caseOf(parsed, runner);
      assert.ok(c, 'the runner pipeline case');
      assert.equal(c.pipelineVersion, VERSIONS[runner]);
      assert.ok(Array.isArray(c.phasesReached) && c.phasesReached.length > 0);
      assert.ok(Array.isArray(c.refusalCodes));
      assert.ok(c.metrics.turns > 0 && c.metrics.tools > 0 && c.metrics.outputTokens > 0 && c.metrics.activeMs > 0);
      const control = parsed.cases.find(x => x.pipeline === 'no-pipeline');
      assert.ok(control && control.pipelineVersion === null && control.rulesetSha256 === null);
    });

    test(`${runner}: fidelity digests equal the ledger entries and the committed report bytes`, () => {
      const c = caseOf(JSON.parse(bytesOf(files[runner])), runner);
      const entry = ledgerRow(ledgerKey[runner]);
      assert.equal(c.fidelity.rawSha256, entry.originalSha256);
      assert.equal(c.fidelity.derivativeSha256, entry.sha256);
      assert.equal(sha(bytesOf(entry.derivative)), entry.sha256);
    });
  }

  test('the no-pipeline control is the same row in all three files and is bound to the ledger', () => {
    const rows = Object.values(files).map(p => JSON.parse(bytesOf(p)).cases.find(c => c.pipeline === 'no-pipeline'));
    assert.deepEqual(rows[1], rows[0]);
    assert.deepEqual(rows[2], rows[0]);
    const entry = ledgerRow('control');
    assert.equal(rows[0].fidelity.rawSha256, entry.originalSha256);
    assert.equal(rows[0].fidelity.derivativeSha256, entry.sha256);
    assert.equal(sha(bytesOf(entry.derivative)), entry.sha256);
  });

  test('every task digest is the digest of the label printed in the README', () => {
    const readme = bytesOf(readmePath).toString('utf8');
    const label = /^Task identity label: `([^`]+)`$/mu.exec(readme)?.[1];
    assert.ok(label, 'README prints the task identity label');
    for (const p of Object.values(files)) for (const c of JSON.parse(bytesOf(p)).cases) assert.equal(c.taskSha256, sha(Buffer.from(label)));
  });

  // Consumer repository names come from the sanitized reports themselves (their first line ends in the
  // analysed repository name), so this file never has to spell one.
  const consumerNames = ledger.reports.map(r => {
    const first = bytesOf(r.derivative).toString('utf8').split('\n', 1)[0];
    return first.trim().split(/\s+/u).pop().replace(/[^A-Za-z0-9_]/gu, '');
  });

  test('the consumer names derived from the reports are real names (guards the derivation itself)', () => {
    assert.equal(consumerNames.length, 4);
    for (const name of consumerNames) assert.match(name, /^[A-Za-z0-9]+(?:_[A-Za-z0-9]+){2,}$/u);
  });

  test('published files hold no private identifier, person, account, machine or consumer name, and no absolute path', () => {
    for (const p of [...Object.values(files), comparisonPath]) {
      const bytes = bytesOf(p);
      assert.equal(screenPublicTransferArtifact(bytes).status, 'screened', p);
      // Closed vocabulary: every string value is a typed id, instant, digest, version, code or enumeration.
      const allowed = [
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u, /^[a-f0-9]{64}$/u, /^0\.7\.0(?:\+(?:claude|codex)\.\d{14}\.[0-9a-f]{7})?$/u,
        /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/u, /^pipeline\.greenfield-public-(?:observations|comparison)\.v1$/u
      ];
      const known = new Set([
        ...CASE_IDS, 'onboarding', 'design', 'vertical-slice', 'implementation', 'verify',
        ...['start', 'end', 'turnStart', 'turnEnd', 'toolStart', 'toolEnd', 'phase', 'includesAnalysis', 'denominator'].map(k => 'different-window-' + k), 'claude', 'codex', 'antigravity', 'pipeline', 'no-pipeline', 'full', 'input-output', 'input-output-cache',
        'complete-reported', 'partial-reported', 'unknown', 'succeeded-reported', 'failed-reported', 'stopped-reported',
        'second-run-claude-main-transcript', 'second-run-codex-main-transcript', 'second-run-antigravity-main-transcript',
        'second-run-codex-control-main-transcript', 'declared-matching', 'unresolved', 'arithmetic-from-reported-counters',
        'reported-unverified', 'digest-claims-unverified-original-not-read', 'deterministic-public-projection-screen-only',
        'unavailable', 'timestamp-and-counter-arithmetic-only', 'unknown-no-billing-source', 'unknown-no-controlled-product-proof',
        'unsupported', 'descriptive-only-no-ROI-or-security-or-regression-guarantee',
        'different-task', 'incomplete-coverage', 'different-or-unknown-method', 'unknown-boundaries'
      ]);
      const walk = (v, key) => {
        if (typeof v === 'string') {
          const ok = known.has(v) || allowed.some(re => re.test(v))
            || (key === 'comparisonId' && /^greenfield-second-run-[a-z0-9-]+$/u.test(v));
          assert.ok(ok, `${p}: unexpected string value under ${key}`);
        } else if (Array.isArray(v)) v.forEach(x => walk(x, key));
        else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k);
      };
      walk(JSON.parse(bytes.toString('utf8')), '$');
    }
    for (const p of [...Object.values(files), comparisonPath, readmePath]) {
      const text = bytesOf(p).toString('utf8');
      assert.equal(screenPublicTransferArtifact(Buffer.from(text)).status, 'screened', p);
      for (const name of consumerNames) assert.ok(!text.includes(name), `${p}: carries a consumer repository name`);
      assert.doesNotMatch(text, /[A-Za-z0-9._+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/u, p);
      assert.doesNotMatch(text, /\/home\/|\/Users\/|[A-Za-z]:\\|\\\\|file:\/\//u, p);
      assert.doesNotMatch(text, /<runtime-id>|\.system_generated|brain\//u, p);
    }
  });

  test('the committed comparison is exactly what the library rebuilds from its input (reproducible, digest-bound)', () => {
    const inputBytes = bytesOf(files.codex);
    const committed = bytesOf(comparisonPath);
    const r = readGreenfieldPublicComparisonInput({rootDir: root, inputPath: files.codex, inputSha256: sha(inputBytes)});
    assert.equal(r.status, 'read');
    const built = buildGreenfieldPublicComparison({inputHandle: r.handle});
    assert.equal(built.status, 'built');
    assert.equal(built.reportSha256, sha(committed));
    const parsed = JSON.parse(committed.toString('utf8'));
    assert.equal(parsed.schema, GREENFIELD_COMPARISON_SCHEMA);
    assert.equal(parsed.inputSha256, sha(inputBytes));
    assert.deepEqual(parsed.cases.map(c => c.caseId), ['codex-no-pipeline-control', 'codex-pipeline-second-run']);
    assert.equal(parsed.pairs[0].causalInference, 'unsupported');
  });

  test('the README names the Pipeline versions, states the limits and lists every published file', () => {
    const readme = bytesOf(readmePath).toString('utf8');
    for (const v of Object.values(VERSIONS)) assert.ok(readme.includes(v), v);
    for (const p of [...Object.values(files), comparisonPath]) assert.ok(readme.includes(p.split('/').pop()), p);
    assert.match(readme, /not a (?:full )?refusal census/iu);
    assert.match(readme, /one input per comparison/iu);
  });
});
