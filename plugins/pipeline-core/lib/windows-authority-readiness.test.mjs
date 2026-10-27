// SPDX-License-Identifier: SUL-1.0
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { registerTestCaseCompletion } from './test-case-completion.mjs';
import * as readiness from './windows-authority-readiness.mjs';
import { assessWindowsAuthorityReadiness, windowsAuthorityCause } from './windows-authority-readiness.mjs';
import { assessWindowsPrivateRoot } from './windows-private-state.mjs';

const roots = {
  projectRoot: 'D:\\work\\repo',
  pluginRoot: 'C:\\Users\\owner\\plugins\\pipeline-core',
  privateRoot: 'D:\\work\\repo\\.git\\agent-pipeline',
  // The private-state root verdict is an injected seam (D168-S7b); the fixtures never reach a native observer.
  assessPrivateRoot: () => ({ status: 'secure', reason: 'fixture', rootPath: 'D:\\work\\repo\\project' }),
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
const STATE_ROOT = 'D:\\work\\repo\\project';
const okProbe = () => syntheticObservation();
const withVerdict = (verdict, extra = {}) => {
  const seen = [];
  const result = assessWindowsAuthorityReadiness({ ...roots, exists: () => true, probe: okProbe, ...extra,
    assessPrivateRoot: (path) => { seen.push(path); return { ...verdict, rootPath: path }; } });
  return { result, seen };
};

test('D168-S7b a secure private-state root verdict yields ready and the seam is called once with the project\\ path', () => {
  const { result, seen } = withVerdict({ status: 'secure', reason: 'private' });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.causes, []);
  assert.deepEqual(seen, [STATE_ROOT]);
});

test('D168-S7b an insecure private-state root yields one WIN-AUTH-PRIVATE-ROOT cause with the exact icacls instruction', () => {
  const { result } = withVerdict({ status: 'insecure', reason: 'inherited Authenticated Users' });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.causes.length, 1);
  const cause = result.causes[0];
  assert.equal(cause.pathClass, 'private-state');
  assert.equal(cause.reason, 'WIN-AUTH-PRIVATE-ROOT');
  assert.equal(cause.path, STATE_ROOT);
  assert.equal(cause.nextAction.kind, 'operator-review');
  assert.equal(cause.nextAction.mutation, false);
  const preview = cause.nextAction.repairPreview;
  assert.equal(preview.folder, STATE_ROOT);
  assert.equal(preview.commands.length, 2);
  for (const command of preview.commands) {
    assert.ok(command.command.includes('"' + STATE_ROOT + '"'));
    assert.ok(command.command.includes('/inheritance:r'));
    assert.ok(command.command.includes('(OI)(CI)F'));
  }
  assert.deepEqual(preview.commands.map(row => row.shell), ['powershell', 'cmd']);
  assert.ok(preview.commands[0].command.includes('$(whoami)'));
  assert.ok(preview.commands[1].command.includes('%USERNAME%'));
  assert.match(preview.reason, /inherited/u);
  assert.match(preview.afterwards, /next preflight reads the folder back/u);
});

test('D168-S7b an unobservable private-state root fails closed without offering an icacls command', () => {
  const { result } = withVerdict({ status: 'unavailable', reason: 'no observation' });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.causes.length, 1);
  assert.equal(result.causes[0].reason, 'WIN-AUTH-OBSERVATION-UNAVAILABLE');
  assert.equal(result.causes[0].pathClass, 'private-state');
  assert.equal(result.causes[0].nextAction.repairPreview, null);
});

test('D168-S7b an absent project\\ folder is skipped silently and a quote in the folder yields no command', () => {
  const seen = [];
  const absent = assessWindowsAuthorityReadiness({ ...roots, exists: path => path !== STATE_ROOT, probe: okProbe,
    assessPrivateRoot: path => { seen.push(path); return { status: 'insecure', reason: 'x', rootPath: path }; } });
  assert.equal(absent.status, 'ready');
  assert.deepEqual(seen, []);
  const quoted = assessWindowsAuthorityReadiness({ ...roots, projectRoot: 'D:\\wo"rk\\repo', privateRoot: 'D:\\wo"rk\\repo\\.git\\agent-pipeline',
    exists: () => true, probe: okProbe,
    assessPrivateRoot: path => ({ status: 'insecure', reason: 'x', rootPath: path }) });
  const cause = quoted.causes.find(row => row.reason === 'WIN-AUTH-PRIVATE-ROOT');
  assert.ok(cause);
  assert.deepEqual(cause.nextAction.repairPreview.commands, []);
  assert.ok(cause.nextAction.repairPreview.reason.length > 0);
});

test('D168-S7b preflight and runtime judge the private-state root with the same function', () => {
  const me = 'DESKTOP\\agent';
  const obs = (principals, inheritedFlags) => ({ currentOwner: me, owner: me, reparsePoint: false, principals, inheritedFlags });
  const judge = (suffix, observation) => assessWindowsAuthorityReadiness({ ...roots, exists: () => true, probe: okProbe,
    assessPrivateRoot: path => assessWindowsPrivateRoot(path, { observe: () => ({ status: null, reason: null, observation }), identity: () => 'id-' + suffix }) });
  const broad = judge('broad', obs([me, 'NT AUTHORITY\\Authenticated Users'], [false, true]));
  assert.equal(broad.status, 'unavailable');
  assert.equal(broad.causes[0].reason, 'WIN-AUTH-PRIVATE-ROOT');
  const hardened = judge('hardened', obs([me], [false]));
  assert.equal(hardened.status, 'ready');
});

const windowsAuthorityDetail = (error) => readiness.windowsAuthorityDetail(error);
const DETAILS = ['WIN-AUTH-DACL-EMPTY', 'WIN-AUTH-DACL-UNPROTECTED', 'WIN-AUTH-DACL-ACE', 'WIN-AUTH-DACL-FOREIGN'];
const privateFailure = (error) => assessWindowsAuthorityReadiness({ ...roots, exists: () => true,
  probe({ path }) { if (path === roots.privateRoot) throw error; return syntheticObservation(); } });

test('D50 each private DACL detail code surfaces as detail while the reason stays the WIN-AUTH-DACL family', () => {
  for (const detail of DETAILS) {
    const result = privateFailure(Object.assign(new Error('closed'), { reason: 'WIN-AUTH-DACL', detail }));
    const cause = result.causes.find(row => row.path === roots.privateRoot);
    assert.equal(cause.reason, 'WIN-AUTH-DACL', detail);
    assert.equal(cause.detail, detail);
  }
});

test('D50 a bare WIN-AUTH-DACL refusal stays a family-only cause without a detail key', () => {
  const result = privateFailure(Object.assign(new Error('closed'), { reason: 'WIN-AUTH-DACL' }));
  const cause = result.causes.find(row => row.path === roots.privateRoot);
  assert.equal(cause.reason, 'WIN-AUTH-DACL');
  assert.equal('detail' in cause, false);
});

test('D50 a detail outside the closed set is dropped, never copied through', () => {
  const result = privateFailure(Object.assign(new Error('closed'), { reason: 'WIN-AUTH-DACL', detail: 'WIN-AUTH-DACL-C-USERS-OWNER' }));
  const cause = result.causes.find(row => row.path === roots.privateRoot);
  assert.equal(cause.reason, 'WIN-AUTH-DACL');
  assert.equal('detail' in cause, false);
});

test('D50 windowsAuthorityDetail returns only a closed DACL detail', () => {
  assert.equal(windowsAuthorityDetail({ reason: 'WIN-AUTH-DACL', detail: 'WIN-AUTH-DACL-FOREIGN' }), 'WIN-AUTH-DACL-FOREIGN');
  assert.equal(windowsAuthorityDetail({ reason: 'WIN-AUTH-DACL', detail: 'anything else' }), null);
  assert.equal(windowsAuthorityDetail({ reason: 'WIN-AUTH-OWNER', detail: 'WIN-AUTH-DACL-EMPTY' }), null);
  assert.equal(windowsAuthorityDetail(undefined), null);
});

registerTestCaseCompletion({ cases, fd: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD ?? '3'), maxBytes: 65536 });
