// SPDX-License-Identifier: SUL-1.0
// Independent draft-shell regression. Observation and lifecycle verdict are
// injected seams; parsing, closed action matching and shell lane are real.
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const { devPlanShellRefusalHit } = await import(new URL('./devplan-shell-lane.mjs', import.meta.url));
const { isExactObservedOnboardingNextAction, isSanctionedLifecycleCommand } = await import(new URL('./command-catalogue.mjs', import.meta.url));
import { registerTestCaseCompletion } from '../test-case-completion.mjs';
const repository = fileURLToPath(new URL('../../../../', import.meta.url));
// No fixture is materialized; these paths only anchor injected observations.
const root = join(repository, 'scratch/.devplan-shell-lane-recovery-fixture');
const script = fileURLToPath(new URL('../../scripts/pipeline-state.mjs', import.meta.url));
const cases = [];
function check(name, run) {
  cases.push({ id: `DLR${String(cases.length + 1).padStart(3, '0')}`, name, run });
}
const action = Object.freeze({ kind: 'command', executable: '/opt/producer-node/bin/node',
  argv: Object.freeze([script, 'po-authority-rebind-plan']), mutation: false, requiresConfirmation: false });
const observed = Object.freeze({ schema: 'pipeline.project-onboarding.v4', status: 'partial', root,
  intent: 'session', diagnostics: [{ code: 'po_authority_rebind_unavailable' }], nextAction: action });
const commandFor = value => [value.executable, ...value.argv].map(word => JSON.stringify(word)).join(' ');
function dependencies(observation = observed) {
  let reads = 0;
  return {
    inspectProjectOnboardingV3Fn(input) {
      assert.equal(input.rootDir, root);
      assert.equal(input.intent, 'session');
      reads += 1;
      if (observation instanceof Error) throw observation;
      return observation;
    },
    devPlanGateVerdictFn(input) {
      assert.equal(input.projectDir, root);
      return { verdict: 'block', reason: 'fixture draft lifecycle', lifecycleStatus: 'draft' };
    },
    reads: () => reads,
  };
}
check('currently offered exact read-only rebind planner crosses draft shell lane', () => {
  const deps = dependencies();
  const command = commandFor(action);
  assert.equal(isSanctionedLifecycleCommand(command, root, deps), false,
    'rebind planner must not become a broad lifecycle allowance');
  assert.equal(isExactObservedOnboardingNextAction(command, root, deps), true);
  assert.equal(deps.reads(), 1, 'matching uses a current inspection, not cached receipt data');
  assert.equal(devPlanShellRefusalHit(command, root, deps), null,
    'the exact read-only recovery action must not be blocked as opaque implementation');
});
const controls = [
  ['changed executable', { ...action, executable: '/opt/other-node/bin/node' }, observed],
  ['changed argv', { ...action, argv: [...action.argv, '--unexpected'] }, observed],
  ['unoffered mutation', { ...action, argv: [script, 'po-authority-rebind-apply', '--activate'], mutation: true, requiresConfirmation: true }, observed],
  ['hostile published script', { ...action, argv: [join(root, 'hostile.mjs'), 'apply'], mutation: true, requiresConfirmation: true }, null],
  ['rejected planner', action, { ...observed, diagnostics: [{ code: 'po_authority_rebind_planner_rejected' }], nextAction: null }],
  ['stale action after ready readback', action, { ...observed, status: 'ready', nextAction: null }],
  ['foreign-root readback', action, { ...observed, root: join(root, 'foreign') }],
  ['wrong-intent readback', action, { ...observed, intent: 'bootstrap' }],
  ['malformed readback', action, { ...observed, schema: 'foreign.schema' }],
  ['inspection fault', action, new Error('fixture inspection unavailable')],
];
for (const [name, attempted, supplied] of controls) check(`draft shell refuses ${name}`, () => {
  const deps = dependencies(supplied ?? { ...observed, nextAction: attempted });
  const command = commandFor(attempted);
  assert.equal(isExactObservedOnboardingNextAction(command, root, deps), false);
  const hit = devPlanShellRefusalHit(command, root, deps);
  assert.equal(hit?.verdict, 'block');
  assert.equal(hit?.lifecycleStatus, 'draft');
  assert.equal(hit?.lane, 'opaque-script-execution');
});
for (const [name, metadata] of [
  ['matching planner marked mutating', { mutation: true, requiresConfirmation: true }],
  ['matching planner requiring confirmation', { mutation: false, requiresConfirmation: true }],
]) check(`draft shell refuses ${name}`, () => {
  const published = { ...action, ...metadata };
  const deps = dependencies({ ...observed, nextAction: published });
  const hit = devPlanShellRefusalHit(commandFor(published), root, deps);
  assert.equal(hit?.verdict, 'block', 'the draft recovery corridor is read-only and confirmation-free');
  assert.equal(hit?.lane, 'opaque-script-execution');
});

registerTestCaseCompletion({ cases, fd: 3, maxBytes: 16384 });
