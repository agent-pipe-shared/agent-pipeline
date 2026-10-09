// SPDX-License-Identifier: SUL-1.0
// Source target: plugins/pipeline-core/lib/governance-scope-win32-acl.test.mjs
//
// WINACL-T: pin the win32 ACL path of governance-scope privacy.
//
// On win32 the POSIX mode bits cannot express privacy, so `privatePath` in
// governance-scope.mjs delegates the whole decision to `assessWindowsPrivatePath`
// (the DACL). governance-scope.test.mjs only ever sees secure records on win32
// (its chmod-based cases are no-ops there), so a fail-open in that delegation
// would go unnoticed. This file feeds the seam a record whose ACL is genuinely
// widened and requires the controller to fail closed.
//
// Assumptions (named, not silent):
//   1. The enrolled non-Git record lives at <hostStateRoot>/<scopeKey>.json, the
//      same location governance-scope.test.mjs case RC14C009 mutates.
//   2. `icacls <record> /grant *S-1-1-0:R` adds an explicit allow ACE for Everyone
//      (S-1-1-0), so the singular assessor (Get-Acl script) must report a
//      non-owner principal and return a status other than "secure".
//   3. A host where the native DACL observer itself is "unavailable" (no fixed
//      Windows PowerShell) is a host limitation, not a fail-open, and skips. Any
//      other non-secure baseline is a RED fixture-precondition failure.
//   4. The widened ACL touches only a record under this test's own temp directory.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, openSync, rmSync} from 'node:fs';
import {tmpdir, devNull} from 'node:os';
import {join} from 'node:path';
import {createGovernanceScopeController} from './governance-scope.mjs';
import {assessWindowsPrivatePath} from './windows-private-state.mjs';
import {registerTestCaseCompletion} from './test-case-completion.mjs';

const completionCases = [];
function test(name, run) {
  completionCases.push({id: 'WINACL' + String(completionCases.length + 1).padStart(3, '0'), name, run});
}

// Exact capability probe: a typed "host limitation: ..." reason when this host cannot run the pin, else null.
function icaclsHostLimitation() {
  if (process.platform !== 'win32') return 'host limitation: the ACL pin needs native win32 (platform is ' + process.platform + ')';
  const probe = spawnSync('icacls', ['/?'], {encoding: 'utf8', shell: false, windowsHide: true, timeout: 15000});
  if (probe.error || probe.status !== 0) {
    return 'host limitation: icacls is unavailable (' + (probe.error?.code ?? 'exit ' + probe.status) + ')';
  }
  return null;
}

test('win32: a record whose ACL is widened to Everyone is not secure and the controller fails closed', t => {
  const limitation = icaclsHostLimitation();
  if (limitation) { t.skip(limitation); return; }

  const base = mkdtempSync(join(tmpdir(), 'governance-scope-win32-acl-'));
  t.after(() => rmSync(base, {recursive: true, force: true}));
  const observer = assessWindowsPrivatePath(base);
  if (observer.status === 'unavailable') { t.skip('host limitation: native Windows DACL observation is unavailable (' + observer.reason + ')'); return; }

  const root = join(base, 'repo'), host = join(base, 'host-store');
  mkdirSync(root);
  const controller = createGovernanceScopeController({hostStateRoot: host});
  const plan = controller.planDecision({rootDir: root, decision: 'enroll', by: 'Fixture human answer'});
  const active = controller.applyDecision(plan, {activate: true, planSha256: plan.planSha256});
  assert.equal(active.state, 'active', 'fixture precondition: the non-Git enrollment must apply as active: ' + JSON.stringify(active));
  const record = join(host, active.scopeKey + '.json');

  // Baseline control: without it a red below could mean "host cannot harden the fixture" rather than "fail-open".
  const before = assessWindowsPrivatePath(record);
  assert.equal(before.status, 'secure', 'fixture precondition: the freshly enrolled record must assess secure: ' + JSON.stringify(before));
  const baseline = controller.observe({rootDir: root});
  assert.equal(baseline.state, 'active', 'fixture precondition: the secure record must observe active: ' + JSON.stringify({state: baseline.state, diagnostics: baseline.diagnostics}));

  const grant = spawnSync('icacls', [record, '/grant', '*S-1-1-0:R'], {encoding: 'utf8', shell: false, windowsHide: true, timeout: 15000});
  assert.equal(grant.status, 0, 'fixture could not widen the record ACL: ' + JSON.stringify({status: grant.status, stdout: grant.stdout, stderr: grant.stderr, error: grant.error?.code}));

  const assessed = assessWindowsPrivatePath(record);
  const observed = controller.observe({rootDir: root});
  assert.notEqual(assessed.status, 'secure', 'FAIL-OPEN: assessWindowsPrivatePath still reports secure after Everyone:R was granted: ' + JSON.stringify(assessed));
  assert.equal(observed.state, 'unverifiable-active', 'FAIL-OPEN: observe() did not fail closed on a widened record: ' + JSON.stringify({state: observed.state, requiresEnforcement: observed.requiresEnforcement, diagnostics: observed.diagnostics, assessed}));
  assert.ok(observed.diagnostics.includes('GS-PRIVATE-MODE'), 'the closed state must come from the privacy check: ' + JSON.stringify({diagnostics: observed.diagnostics, assessed}));
});

if (completionCases.length !== 1) throw new Error('Required completion declared case count drift');
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, 'w')
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({cases: completionCases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? '65536')});
