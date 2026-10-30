// SPDX-License-Identifier: SUL-1.0
// AC-190 (D209): a release or retro may claim one runner's greenfield course differs from another's
// only by citing a published comparison file by path and sha256. Cases come from the backlog item
// "Greenfield comparisons need reproducible public evidence" (a comparison cites public evidence
// files only), not from the checker's code.
import {test, describe} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, realpathSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {checkGreenfieldComparisonCitations, runCitationCheck} from './check-greenfield-comparison-citations.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const PUBLIC = 'evidence/greenfield-public';
const COMPARISON = `${PUBLIC}/comparison-fixture.json`;
const comparisonBytes = Buffer.from(JSON.stringify({schema: 'pipeline.greenfield-public-comparison.v1', comparisonId: 'fixture', cases: [], pairs: []}) + '\n');
const marker = (path, digest) => `<!-- runner-comparison path=${path} sha256=${digest} -->`;

function fixtureRoot() {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'gfcc-'));
  mkdirSync(join(root, PUBLIC), {recursive: true});
  mkdirSync(join(root, 'docs'));
  mkdirSync(join(root, 'scratch'));
  writeFileSync(join(root, COMPARISON), comparisonBytes);
  writeFileSync(join(root, `${PUBLIC}/observations-fixture.json`), '{"schema":"pipeline.greenfield-public-observations.v1"}\n');
  writeFileSync(join(root, 'scratch/private.json'), comparisonBytes);
  return root;
}
const doc = (root, lines, name = 'docs/retro.md') => { writeFileSync(join(root, name), lines.join('\n') + '\n'); return name; };
const codes = result => result.findings.map(f => f.code);
const withRoot = fn => { const root = fixtureRoot(); try { return fn(root); } finally { rmSync(root, {recursive: true, force: true}); } };

describe('claim markers and citations', () => {
  test('a marked claim citing a published comparison by path and sha256 passes', () => withRoot(root => {
    const md = doc(root, ['# Retro', 'Codex was slower with the Pipeline in this run. ' + marker(COMPARISON, sha(comparisonBytes))]);
    const r = checkGreenfieldComparisonCitations({rootDir: root, markdownPath: md});
    assert.deepEqual([r.status, r.claims, r.findings], ['ok', 1, []]);
  }));

  test('a document without any marked claim passes with zero claims', () => withRoot(root => {
    const md = doc(root, ['# Retro', 'No runner comparison is made here.']);
    const r = checkGreenfieldComparisonCitations({rootDir: root, markdownPath: md});
    assert.deepEqual([r.status, r.claims], ['ok', 0]);
  }));

  test('several claims are checked independently and each finding names its line', () => withRoot(root => {
    const md = doc(root, [
      'good ' + marker(COMPARISON, sha(comparisonBytes)),
      'text',
      'bad digest ' + marker(COMPARISON, 'd'.repeat(64)),
      'bare <!-- runner-comparison -->'
    ]);
    const r = checkGreenfieldComparisonCitations({rootDir: root, markdownPath: md});
    assert.equal(r.status, 'held');
    assert.equal(r.claims, 3);
    assert.deepEqual(r.findings.map(f => [f.line, f.code]), [[3, 'GFC-SHA-MISMATCH'], [4, 'GFC-NO-CITATION']]);
  }));

  test('a marker with only a path or only a digest is a missing citation', () => withRoot(root => {
    const md = doc(root, [
      `a <!-- runner-comparison path=${COMPARISON} -->`,
      `b <!-- runner-comparison sha256=${sha(comparisonBytes)} -->`
    ]);
    assert.deepEqual(codes(checkGreenfieldComparisonCitations({rootDir: root, markdownPath: md})), ['GFC-NO-CITATION', 'GFC-NO-CITATION']);
  }));
});

describe('unknown and private paths are refused with a typed code', () => {
  test('paths outside the published folder or not named comparison-*.json are not published', () => withRoot(root => {
    for (const p of ['scratch/private.json', 'docs/comparison-x.json', `${PUBLIC}/observations-fixture.json`, 'specs/x/comparison-x.json', `${PUBLIC}/sub/comparison-x.json`]) {
      const md = doc(root, ['claim ' + marker(p, sha(comparisonBytes))]);
      assert.deepEqual([p, ...codes(checkGreenfieldComparisonCitations({rootDir: root, markdownPath: md}))], [p, 'GFC-PATH-NOT-PUBLISHED']);
    }
  }));

  test('absolute, drive, url, backslash and traversal paths are invalid paths', () => withRoot(root => {
    const bad = [
      ['', 'tmp', 'x', 'comparison-x.json'].join('/'),
      ['C:', 'x', 'comparison-x.json'].join('\\'),
      'file:' + '//host/x/comparison-x.json',
      `${PUBLIC}\\comparison-fixture.json`,
      `${PUBLIC}/../../scratch/private.json`,
      `./${COMPARISON}`
    ];
    for (const p of bad) {
      const md = doc(root, ['claim ' + marker(p, sha(comparisonBytes))]);
      assert.deepEqual([p, ...codes(checkGreenfieldComparisonCitations({rootDir: root, markdownPath: md}))], [p, 'GFC-PATH-INVALID']);
    }
  }));

  test('a missing file, a symlink and a directory are not found', () => withRoot(root => {
    symlinkSync(join(root, COMPARISON), join(root, `${PUBLIC}/comparison-link.json`));
    mkdirSync(join(root, `${PUBLIC}/comparison-dir.json`));
    for (const p of [`${PUBLIC}/comparison-missing.json`, `${PUBLIC}/comparison-link.json`, `${PUBLIC}/comparison-dir.json`]) {
      const md = doc(root, ['claim ' + marker(p, sha(comparisonBytes))]);
      assert.deepEqual([p, ...codes(checkGreenfieldComparisonCitations({rootDir: root, markdownPath: md}))], [p, 'GFC-NOT-FOUND']);
    }
  }));

  test('a malformed digest and a digest of other bytes are different typed findings', () => withRoot(root => {
    const md = doc(root, [
      'short ' + marker(COMPARISON, 'abc'),
      'upper ' + marker(COMPARISON, sha(comparisonBytes).toUpperCase()),
      'other ' + marker(COMPARISON, sha(Buffer.from('other')))
    ]);
    assert.deepEqual(codes(checkGreenfieldComparisonCitations({rootDir: root, markdownPath: md})), ['GFC-SHA-INVALID', 'GFC-SHA-INVALID', 'GFC-SHA-MISMATCH']);
  }));

  test('a file with the right name and digest that is not a comparison document is refused', () => withRoot(root => {
    const fake = Buffer.from('{"schema":"pipeline.greenfield-public-observations.v1"}\n');
    writeFileSync(join(root, `${PUBLIC}/comparison-fake.json`), fake);
    writeFileSync(join(root, `${PUBLIC}/comparison-text.json`), 'not json\n');
    const md = doc(root, [
      'a ' + marker(`${PUBLIC}/comparison-fake.json`, sha(fake)),
      'b ' + marker(`${PUBLIC}/comparison-text.json`, sha(Buffer.from('not json\n')))
    ]);
    assert.deepEqual(codes(checkGreenfieldComparisonCitations({rootDir: root, markdownPath: md})), ['GFC-NOT-A-COMPARISON', 'GFC-NOT-A-COMPARISON']);
  }));
});

describe('malformed markers and unscreened files', () => {
  test('an unknown or repeated attribute makes the marker malformed', () => withRoot(root => {
    const d = sha(comparisonBytes);
    const md = doc(root, [
      `a <!-- runner-comparison path=${COMPARISON} sha256=${d} note=x -->`,
      `b <!-- runner-comparison path=${COMPARISON} path=${COMPARISON} sha256=${d} -->`,
      `c <!-- runner-comparison ${COMPARISON} -->`
    ]);
    assert.deepEqual(codes(checkGreenfieldComparisonCitations({rootDir: root, markdownPath: md})), ['GFC-MARKER-MALFORMED', 'GFC-MARKER-MALFORMED', 'GFC-MARKER-MALFORMED']);
  }));

  test('a comparison file that carries a machine path fails the public screen even with the right digest', () => withRoot(root => {
    const dirty = Buffer.from(JSON.stringify({schema: 'pipeline.greenfield-public-comparison.v1', note: ['', 'home', 'someone', 'x'].join('/')}) + '\n');
    writeFileSync(join(root, `${PUBLIC}/comparison-dirty.json`), dirty);
    const md = doc(root, ['claim ' + marker(`${PUBLIC}/comparison-dirty.json`, sha(dirty))]);
    assert.deepEqual(codes(checkGreenfieldComparisonCitations({rootDir: root, markdownPath: md})), ['GFC-NOT-SCREENED']);
  }));
});

describe('the markdown input itself', () => {
  test('a missing, escaping or non-markdown file is unavailable', () => withRoot(root => {
    for (const p of ['docs/missing.md', '../outside.md', 'docs/retro.txt', ['', 'tmp', 'x.md'].join('/')]) {
      const r = checkGreenfieldComparisonCitations({rootDir: root, markdownPath: p});
      assert.deepEqual([p, r.status, ...codes(r)], [p, 'held', 'GFC-MARKDOWN-UNAVAILABLE']);
    }
  }));
});

describe('command line', () => {
  const run = (root, argv) => {
    let out = '';
    const code = runCitationCheck(argv, {stdout: {write: s => { out += s; }}, rootDir: root});
    return {code, json: JSON.parse(out)};
  };
  test('exit 0 when every claim cites, 1 on findings, 2 on usage errors', () => withRoot(root => {
    const good = doc(root, ['x ' + marker(COMPARISON, sha(comparisonBytes))], 'docs/good.md');
    const bad = doc(root, ['x ' + marker(COMPARISON, 'e'.repeat(64))], 'docs/bad.md');
    assert.equal(run(root, [good]).code, 0);
    const r = run(root, [bad]);
    assert.equal(r.code, 1);
    assert.equal(r.json.findings[0].code, 'GFC-SHA-MISMATCH');
    assert.deepEqual(run(root, []).json, {status: 'held', findings: [{code: 'GFC-ARGS', line: 0}], claims: 0});
    assert.equal(run(root, []).code, 2);
    assert.equal(run(root, [good, bad]).code, 2);
    assert.equal(run(root, ['docs/missing.md']).code, 2);
  }));
});

describe('the repository own published set', () => {
  const root = realpathSync(resolve(import.meta.dirname, '..'));
  test('the evidence README states its comparison claim with a citation that checks out', () => {
    const r = checkGreenfieldComparisonCitations({rootDir: root, markdownPath: `${PUBLIC}/README.md`});
    assert.deepEqual([r.status, r.findings], ['ok', []]);
    assert.ok(r.claims >= 1);
    const cited = /path=(\S+) sha256=([a-f0-9]{64})/u.exec(readFileSync(join(root, `${PUBLIC}/README.md`), 'utf8'));
    assert.equal(sha(readFileSync(join(root, cited[1]))), cited[2]);
  });
});
