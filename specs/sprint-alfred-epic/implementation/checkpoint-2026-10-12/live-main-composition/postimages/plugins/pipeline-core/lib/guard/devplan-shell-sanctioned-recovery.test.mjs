// SPDX-License-Identifier: SUL-1.0
// Independent draft-shell regression. Observation and lifecycle verdict are
// injected seams; parsing, closed action matching and shell lane are real.
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const { devPlanShellRefusalHit } = await import(new URL('./devplan-shell-lane.mjs', import.meta.url));
const { parseGuardCommand } = await import(new URL('../../hooks/guard-command-grammar.mjs', import.meta.url));
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


const { mkdirSync } = await import('node:fs');
mkdirSync(root, { recursive: true }); // graph-owned repository Scratch only
const onboardingScript = fileURLToPath(new URL('../../scripts/project-onboarding-v3.mjs', import.meta.url));
const recoveryCommandFor = value => [value.executable, ...value.argv].map(word => "'" + word.replaceAll("'", "'\\''") + "'").join(' ');
const digest = 'a'.repeat(64);
const recoveries = [
  ['inspect', onboardingScript, ['inspect', '--root', root, '--intent', 'session', '--runner', 'codex'], false, false],
  ['repair planner', onboardingScript, ['plan-repair', '--root', root, '--intent', 'session', '--runner', 'codex'], false, false],
  ['intake answers', onboardingScript, ['intake-design-questions-apply', '--root', root, '--answers-json', '{"choice":"git push is data"}', '--activate', '--runner', 'codex'], true, true],
  ['marker planner', onboardingScript, ['intake-spec-marker-plan', '--root', root, '--intent', 'session', '--runner', 'codex'], false, false],
  ['marker apply', onboardingScript, ['intake-spec-marker-apply', '--root', root, '--plan-sha256', digest, '--activate', '--runner', 'codex'], true, true],
  ['reopen', script, ['reopen-design', '--by', 'fixture-actor'], true, true],
];
for (const [name, entry, argv, mutation, requiresConfirmation] of recoveries) {
  for (const executable of [process.execPath, '/opt/producer-node/bin/node']) {
    check('offered ' + name + ' with ' + (executable === process.execPath ? 'guard Node' : 'producer Node'), () => {
      const published = { kind: 'command', executable, argv: [entry, ...argv], mutation, requiresConfirmation };
      const observation = { ...observed, nextAction: published };
      const deps = dependencies(observation);
      const command = recoveryCommandFor(published);
      assert.equal(isExactObservedOnboardingNextAction(command, root, deps), true,
        'the actual published argv must pass the existing closed validator');
      assert.equal(isSanctionedLifecycleCommand(command, root, { ...deps, processExecPath: executable }), true,
        'real closed argv validator accepts the producer executable when explicitly bound');
      assert.equal(devPlanShellRefusalHit(command, root, deps), null,
        'route classification must not invent an implementation write; writer still owns confirmation/digest authority');
    });
  }
}
const marker = { kind: 'command', executable: '/opt/producer-node/bin/node',
  argv: [onboardingScript, 'intake-spec-marker-apply', '--root', root, '--plan-sha256', digest, '--activate', '--runner', 'codex'],
  mutation: true, requiresConfirmation: true };
const offeredMarker = { ...observed, nextAction: marker };
const recoveryNegatives = [
  ['unoffered action', marker, { ...offeredMarker, nextAction: action }],
  ['foreign observation', marker, { ...offeredMarker, root: join(root, 'foreign') }],
  ['stale observation', marker, { ...offeredMarker, status: 'ready', nextAction: null }],
  ['malformed observation', marker, { ...offeredMarker, schema: 'invalid' }],
  ['extra argv', { ...marker, argv: [...marker.argv, '--unexpected'] }, offeredMarker],
  ['wrong digest', { ...marker, argv: marker.argv.map(word => word === digest ? 'b'.repeat(64) : word) }, offeredMarker],
  ['invalid digest even when offered', { ...marker, argv: marker.argv.map(word => word === digest ? 'not-a-digest' : word) }, null],
  ['mutation metadata alone', { ...action, mutation: true, requiresConfirmation: true }, null],
  ['arbitrary published script', { ...marker, argv: [join(root, 'arbitrary.mjs'), '--activate'] }, null],
];
for (const [name, attempted, supplied] of recoveryNegatives) check('refuses recovery ' + name, () => {
  const deps = dependencies(supplied ?? { ...observed, nextAction: attempted });
  const command = recoveryCommandFor(attempted);
  assert.equal(isExactObservedOnboardingNextAction(command, root, deps), name === 'mutation metadata alone',
    'metadata does not confer writer permission even where the historical planner matcher recognizes shape');
  assert.equal(devPlanShellRefusalHit(command, root, deps)?.verdict, 'block');
});
for (const [name, suffix] of [
  ['substitution', ' "$(printf injected)"'],
  ['redirect', ' > ' + join(root, 'implementation.mjs')],
]) check('refuses recovery ' + name, () => {
  const deps = dependencies(offeredMarker);
  const command = recoveryCommandFor(marker) + suffix;
  assert.equal(isExactObservedOnboardingNextAction(command, root, deps), false);
  if (name === 'substitution') {
    // DLR035: unsupported executable expansion belongs to the real closed grammar.
    // The string is never evaluated; the top guard consumes this denied parse.
    const parsed = parseGuardCommand(command, root, { platform: 'linux' });
    assert.equal(parsed.parseStatus, 'denied');
    assert.equal(parsed.denialCode, 'GUARD-PARSE-UNSUPPORTED');
    assert.deepEqual(parsed.segments, [], 'unsupported substitution has no authoritative argv');
  } else {
  const hit = devPlanShellRefusalHit(command, root, deps);
  assert.ok(hit?.fault === true || hit?.verdict === 'block', 'actual parser/lane must not admit extra executable syntax');
  }
});

registerTestCaseCompletion({ cases, fd: 3, maxBytes: 16384 });
