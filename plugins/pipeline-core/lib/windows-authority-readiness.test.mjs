// SPDX-License-Identifier: SUL-1.0
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { registerTestCaseCompletion } from './test-case-completion.mjs';
import { assessWindowsAuthorityReadiness, windowsAuthorityCause } from './windows-authority-readiness.mjs';

const roots = {
  projectRoot: 'D:\\work\\repo',
  pluginRoot: 'C:\\Users\\owner\\plugins\\pipeline-core',
  privateRoot: 'D:\\work\\repo\\.git\\agent-pipeline',
};
const cases = [];
function test(name, run) { cases.push({ id: `WAR${String(cases.length + 1).padStart(3, '0')}`, name, run }); }
function syntheticObservation() {
  const nativeFacts = 'synthetic-observation-for-readiness-seam';
  return { nativeFacts, nativeFactsSha256: createHash('sha256').update(nativeFacts).digest('hex'), helperSha256: 'a'.repeat(64), committed: false };
}

test('a synthetic valid project-root observation advances readiness without losing its boundary', () => {
  const calls = [];
  const result = assessWindowsAuthorityReadiness({ ...roots, exists: () => true,
    probe(input) { calls.push(input); return syntheticObservation(); },
  });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.causes, []);
  assert.equal(calls.find(row => row.path === roots.projectRoot && row.pathClass === 'project').boundaryRoot, roots.projectRoot);
  assert.equal(calls.find(row => row.path === roots.pluginRoot).boundaryRoot, null,
    'the installed plugin directory is not silently treated as a proven repository root');
  assert.equal(calls.some(row => row.privatePath), true, 'private authority still receives its distinct strict inspection');
});

test('synthetic valid project, plugin and private observations advance readiness without mutation', () => {
  const calls = [];
  const result = assessWindowsAuthorityReadiness({ ...roots, exists: () => true, probe: row => { calls.push(row); return syntheticObservation(); } });
  assert.deepEqual(result, { schema: 'pipeline.windows-authority-readiness.v1', status: 'ready', causes: [] });
  assert.equal(calls.filter(row => row.privatePath).length, 1);
  assert.ok(calls.some(row => row.pathClass === 'project' && row.path === 'D:\\' && row.boundaryRoot === roots.projectRoot));
});

test('ordinary observation faults and private custody failures remain unavailable', () => {
  const failures = new Map([
    [roots.projectRoot, 'WIN-AUTH-OBSERVATION-UNAVAILABLE'],
    [roots.pluginRoot, 'WIN-AUTH-OPEN'],
    [roots.privateRoot, 'WIN-AUTH-DACL'],
  ]);
  const result = assessWindowsAuthorityReadiness({ ...roots, exists: () => true,
    probe({ path }) {
      if (failures.has(path)) throw Object.assign(new Error('closed'), { reason: failures.get(path) });
      return syntheticObservation();
    },
  });
  assert.equal(result.status, 'unavailable');
  for (const [path, reason] of failures)
    assert.ok(result.causes.some(row => row.path === path && row.reason === reason), 'expected mapped refusal at ' + path + ' with ' + reason);
});

test('a synthetic valid plugin-ancestor observation advances readiness without refusing dispatch', () => {
  const ancestor = 'C:\\Users\\owner\\plugins';
  const calls = [];
  const result = assessWindowsAuthorityReadiness({ ...roots, exists: () => true,
    probe(input) { calls.push(input); return syntheticObservation(); },
  });
  assert.equal(result.status, 'ready');
  assert.ok(calls.some(row => row.pathClass === 'plugin' && row.path === ancestor));
  assert.equal(result.causes.some(row => row.pathClass === 'plugin' && row.path === ancestor), false);
});

test('missing private namespace does not manufacture an ACL failure, while its parent is inspected', () => {
  const calls = [];
  const result = assessWindowsAuthorityReadiness({ ...roots,
    exists: path => path !== roots.privateRoot,
    probe: row => { calls.push(row); return syntheticObservation(); },
  });
  assert.equal(result.status, 'ready');
  assert.equal(calls.some(row => row.privatePath), false);
  assert.ok(calls.some(row => row.path === 'D:\\work\\repo\\.git'));
});

test('missing plugin prerequisite remains unavailable', () => {
  const result = assessWindowsAuthorityReadiness({ ...roots,
    exists: path => path !== roots.pluginRoot,
    probe: () => syntheticObservation(),
  });
  assert.equal(result.status, 'unavailable');
  assert.ok(result.causes.some(row => row.pathClass === 'plugin' && row.reason === 'WIN-AUTH-OPEN'));
});

test('unknown native failures close without copying arbitrary exception text', () => {
  const result = assessWindowsAuthorityReadiness({ ...roots, exists: () => true,
    probe() { throw Object.assign(new Error('private machine path'), { reason: 'private machine path' }); },
  });
  assert.equal(result.status, 'unavailable');
  assert.ok(result.causes.every(row => row.reason === 'WIN-AUTH-OBSERVATION-UNAVAILABLE'));
  assert.doesNotMatch(JSON.stringify(result), /private machine path/u);
  for (const probe of [() => undefined, () => ({ nativeFacts: 'forged' })]) {
    const missing = assessWindowsAuthorityReadiness({ ...roots, exists: () => true, probe });
    assert.equal(missing.status, 'unavailable');
    assert.ok(missing.causes.every(row => row.reason === 'WIN-AUTH-OBSERVATION-UNAVAILABLE'));
  }
});

test('a pristine project can inspect existing roots before Git creates its private namespace', () => {
  const result = assessWindowsAuthorityReadiness({ ...roots,
    exists: path => !path.toLowerCase().includes('\\.git'),
    probe: () => syntheticObservation(),
  });
  assert.equal(result.status, 'ready');
});

test('direct consumers receive only closed native causes', () => {
  assert.equal(windowsAuthorityCause({ reason: 'WIN-AUTH-ANCESTOR-MUTATION' }), 'WIN-AUTH-ANCESTOR-MUTATION');
  assert.equal(windowsAuthorityCause({ reason: 'private path and SID' }), 'WIN-AUTH-OBSERVATION-UNAVAILABLE');
});

if (cases.length !== 9) throw new Error('Windows authority readiness case count drift');
registerTestCaseCompletion({ cases, fd: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD ?? '3'), maxBytes: 65536 });
