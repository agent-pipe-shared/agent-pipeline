// SPDX-License-Identifier: SUL-1.0
// ALF-W4-DEVPLAN-MATERIALIZE-PIN / AC-115: pin for backlog item
// pipeline.approved-lifecycle-state-refuses-its-own-recovery-and-backlog-writes.
// The architecture materialization step the onboarding plan emits must cross the devplan shell
// lane while the lifecycle verdict blocks; its retired spelling and opaque interpreter routes
// must not. Observation and lifecycle verdict are injected; parsing, catalogue and lane are real.
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const { devPlanShellRefusalHit } = await import(new URL('../guard/devplan-shell-lane.mjs', import.meta.url));
import { registerTestCaseCompletion } from '../test-case-completion.mjs';
const repository = fileURLToPath(new URL('../../../../', import.meta.url));
// No fixture is materialized; this path only anchors injected observations.
const root = join(repository, 'scratch/.devplan-materialize-pin-fixture');
const script = fileURLToPath(new URL('../../scripts/pipeline-state.mjs', import.meta.url));
const cases = [];
function check(name, run, mode) {
  cases.push({ id: `DMP${String(cases.length + 1).padStart(3, '0')}`, name, run, ...(mode ? { mode } : {}) });
}
// Exactly the producer shape: lib/architecture-entry-readiness.mjs proposalAction().
const action = Object.freeze({ kind: 'command', executable: 'node',
  argv: Object.freeze([script, 'materialize-architecture']), mutation: true, requiresConfirmation: false,
  expected: Object.freeze({ schema: 'pipeline.architecture-design-materialization.v1', statuses: ['materialized'] }) });
const observed = Object.freeze({ schema: 'pipeline.project-onboarding.v4', status: 'partial', root,
  intent: 'session', diagnostics: [], nextAction: action });
const commandFor = value => [value.executable, ...value.argv].map(word => JSON.stringify(word)).join(' ');
function dependencies(observation = observed) {
  return {
    inspectProjectOnboardingV3Fn(input) {
      assert.equal(input.rootDir, root);
      return observation;
    },
    devPlanGateVerdictFn(input) {
      assert.equal(input.projectDir, root);
      return { verdict: 'block', reason: 'fixture approved lifecycle', lifecycleStatus: 'approved' };
    },
  };
}
check('producer-spelled materialize-architecture crosses the blocking devplan lane', () => {
  const hit = devPlanShellRefusalHit(commandFor(action), root, dependencies());
  assert.equal(hit, null, `unexpected hit: ${JSON.stringify(hit)}`);
});
check('retired --input spelling is not admitted', () => {
  const command = `${commandFor(action)} --input scratch/arch.json`;
  const hit = devPlanShellRefusalHit(command, root, dependencies());
  assert.notEqual(hit, null, 'the retired spelling must not be admitted');
  assert.ok(hit?.fault === true || hit?.verdict === 'block');
});
// Other script interpreters are no wider than `node <scratch script>`: opaqueScriptExecutionCandidate()
// classifies perl/ruby/php/lua like python and the shells (0.7.0 acceptance of
// backlog/items/2026-10-04-approved-lifecycle-state-refuses-its-own-recovery-and-backlog-writes.md).
check('opaque perl interpreter route is not admitted', () => {
  const hit = devPlanShellRefusalHit('perl scratch/run-materialize.pl', root, dependencies());
  assert.notEqual(hit, null, `perl route admitted: lane returned ${JSON.stringify(hit)}`);
});
check('every other script interpreter (ruby, php, lua, inline perl code) is refused like node', () => {
  for (const command of ['ruby scratch/run.rb', 'php scratch/run.php', 'lua scratch/run.lua', 'perl.exe scratch/run.pl', 'perl -e "print 1"']) {
    const hit = devPlanShellRefusalHit(command, root, dependencies());
    assert.notEqual(hit, null, `${command}: admitted, lane returned ${JSON.stringify(hit)}`);
  }
});
check('interpreter version probes stay admitted', () => {
  for (const command of ['perl --version', 'ruby --version', 'php --version', 'lua -v']) {
    assert.equal(devPlanShellRefusalHit(command, root, dependencies()), null, command);
  }
});
check('node scratch script with an extra argument is not admitted', () => {
  const hit = devPlanShellRefusalHit('node scratch/x.mjs extra-arg', root, dependencies());
  assert.notEqual(hit, null, `node scratch with extra arg admitted: lane returned ${JSON.stringify(hit)}`);
});

registerTestCaseCompletion({ cases, fd: 3, maxBytes: 16384 });
