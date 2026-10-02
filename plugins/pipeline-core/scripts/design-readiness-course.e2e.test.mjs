// SPDX-License-Identifier: SUL-1.0
// Bounded initial Advisor route, including native runners without a trusted
// answer channel. No provider calls are made by these synthetic fixtures.
import {registerTestCaseCompletion} from '../lib/test-case-completion.mjs';
import {openSync as openCompletionDescriptor} from 'node:fs';
import assert from 'node:assert/strict';
import {advisorHostFixture} from '../lib/codex-advisor-host.fixture.mjs';
import {coordinateInitialDesignAdvisory} from '../lib/design-advisory-coordinator-v2.mjs';
import {createNativeInitialAdvisorExecution} from '../lib/native-initial-advisor-execution.mjs';
import {designAdvisorValueSha256} from '../lib/design-advisor-course.mjs';
import {loadRunnerProfilesV3Registry} from '../lib/runner-profiles-v3.mjs';
import {createDesignWorkflowPackageApprovalRequest} from '../lib/design-workflow-approval.mjs';

const completionCases=[];
function test(name,run){completionCases.push({id:'DREC001',name,run});}

test('each native runner has a terminal no-child Advisor route and cannot loop into plan approval', async t => {
  for (const runner of ['claude', 'antigravity']) {
    const fixture = advisorHostFixture(t);
    const route = {
      model: null, effort: null,
      sourceSha256: designAdvisorValueSha256(loadRunnerProfilesV3Registry()),
      candidateCommit: fixture.candidate.commit,
    };
    const input = {
      repoRoot: fixture.root, runner, featureId: 'advisor-feature',
      authoringDispatchId: 'elephant-author', sources: fixture.sources,
      reason: 'risk-review', profile: 'feature', dispatch: fixture.args.dispatch,
      route, hostExecution: createNativeInitialAdvisorExecution({runner}),
    };
    const first = await coordinateInitialDesignAdvisory(input);
    assert.equal(first.status, 'unavailable-pending-final-approval', JSON.stringify(first));
    assert.equal(first.course.attempts.length, 0);
    assert.equal(first.failureEvidence.childStarted, false);
    assert.equal(first.failureEvidence.inputSubmitted, false);
    assert.equal(first.implementationAuthority, false);

    const second = await coordinateInitialDesignAdvisory({
      ...input, dispatch: {...input.dispatch, dispatchId: `${runner}-restart`},
      hostExecution: createNativeInitialAdvisorExecution({runner}),
    });
    assert.equal(second.status, 'reuse-terminal', JSON.stringify(second));
    assert.equal(second.course.courseId, first.course.courseId);
    assert.equal(second.implementationAuthority, false);

    const approval = createDesignWorkflowPackageApprovalRequest({
      repoRoot: fixture.root, packagePath: 'evidence/package.json',
      featureId: 'advisor-feature',
      planPath: fixture.sources.prd.path, planSha256: fixture.sources.prd.sha256,
      specPath: fixture.sources.spec.path, specSha256: fixture.sources.spec.sha256,
      readCandidate: () => fixture.candidate,
    });
    assert.equal(approval.ok, false, 'no PO request without disposition and independent final readiness');
  }
});

const completionFd=process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD===undefined
 ?openCompletionDescriptor(process.platform==='win32'?'NUL':'/dev/null','w')
 :Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({cases:completionCases,fd:completionFd,
 maxBytes:Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES??'65536')});
