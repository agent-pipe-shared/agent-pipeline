// SPDX-License-Identifier: SUL-1.0
// Pin for backlog item pipeline.draft-phase-guard-blocks-mandatory-bootstrap-preflight (AC-167).
//
// Every case drives the REAL shell lane (`devPlanShellRefusalHit`) with the real command
// grammar and the real sanctioned-script catalogue. The only injected seam is the lifecycle
// verdict function, fixed to "block" so the fixture IS a gated phase: a command the lane
// classifies as opaque execution is then refused, and a command it recognises never reaches
// the verdict at all (asserted through the call counter).
//
// Cases that name an acceptance point the current source does NOT satisfy are kept as RED
// evidence on purpose (the task rule: do not weaken, do not fix source out of scope).
//
// Host-limitation: no case here needs directory mode bits or directory symlinks, so none is
// skipped. (Linux/WSL run owner Coordinator, due 2026-10-19, K7, is therefore not required
// by this pin.)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const { devPlanShellRefusalHit } = await import(new URL('../guard/devplan-shell-lane.mjs', import.meta.url));
const constants = await import(new URL('../guard/constants.mjs', import.meta.url));
const root = fileURLToPath(new URL('../../../../', import.meta.url)).replace(/[\\/]$/u, '');
const pluginScripts = fileURLToPath(new URL('../../scripts/', import.meta.url));

const quote = (value) => `"${value}"`;
const forwardSlash = (value) => value.replaceAll('\\', '/');
const PHASES = Object.freeze(['draft', 'design', 'implement']);

function dependenciesFor(lifecycleStatus, extra = {}) {
  const calls = [];
  return {
    ...extra,
    calls,
    devPlanGateVerdictFn(input) {
      calls.push(input.filePath);
      return { verdict: 'block', reason: `fixture lifecycle ${lifecycleStatus}`, lifecycleStatus };
    },
    // No onboarding observation exists in the fixture: only closed argv identity may admit.
    inspectProjectOnboardingV3Fn() { throw new Error('fixture: no onboarding observation'); },
  };
}
function hit(command, phase = 'draft', extra = {}) {
  const deps = dependenciesFor(phase, extra);
  return { result: devPlanShellRefusalHit(command, root, deps), deps };
}
function assertAdmitted(command, label, extra = {}) {
  for (const phase of PHASES) {
    const { result, deps } = hit(command, phase, extra);
    assert.equal(result, null, `${label} must not be refused in lifecycle ${phase}: ${JSON.stringify(result?.lane ?? result?.error?.message)}`);
    assert.deepEqual(deps.calls, [], `${label}: admission must not depend on the lifecycle verdict (${phase})`);
  }
}
function assertRefusedAsOpaque(command, label, extra = {}) {
  const { result } = hit(command, 'draft', extra);
  assert.equal(result?.verdict, 'block', `${label} must stay refused (control)`);
  assert.match(result?.lane ?? '', /^opaque-/u);
  assert.equal(result?.lifecycleStatus, 'draft');
}

const preflight = constants.START_PREFLIGHT_SCRIPT;

test('AC-167 point 1: the exact installed-plugin preflight, native spelling, is admitted in every phase', () => {
  assertAdmitted(`node ${quote(preflight)}`, 'native-spelling preflight');
});

test('AC-167 point 1b: the forward-slash spelling of the same preflight is admitted in every phase', () => {
  assertAdmitted(`node ${quote(forwardSlash(preflight))}`, 'forward-slash preflight');
});

test('AC-167 point 2: the lifecycle read commands of the bootstrap sequence are admitted by closed argv identity', () => {
  assertAdmitted(`node ${quote(constants.ONBOARDING_SCRIPT)} inspect --root ${quote(root)}`, 'project-onboarding-v3 inspect');
  assertAdmitted(`node ${quote(constants.OBSERVATION_GOVERNANCE_BOOTSTRAP_SCRIPT)} --root ${quote(root)}`, 'observation-governance-bootstrap');
  assertAdmitted(`node ${quote(constants.PIPELINE_STATE_SCRIPT)} inspect`, 'pipeline-state inspect');
});

test('AC-167 point 3: the full bootstrap sequence runs in a gated phase with zero overrides and zero verdict consultations', () => {
  const sequence = [
    `node ${quote(preflight)}`,
    `node ${quote(constants.ONBOARDING_SCRIPT)} inspect --root ${quote(root)}`,
    `node ${quote(constants.OBSERVATION_GOVERNANCE_BOOTSTRAP_SCRIPT)} --root ${quote(root)}`,
    `node ${quote(constants.PIPELINE_STATE_SCRIPT)} inspect`,
  ];
  const deps = dependenciesFor('draft');
  for (const command of sequence) assert.equal(devPlanShellRefusalHit(command, root, deps), null, command);
  assert.deepEqual(deps.calls, []);
});

test('AC-167 control: admission is closed -- extra argv, a foreign script and inline code stay refused', () => {
  assertRefusedAsOpaque(`node ${quote(preflight)} --extra`, 'preflight with an extra argument');
  assertRefusedAsOpaque(`node ${quote(join(root, 'hostile.mjs'))}`, 'foreign script inside the root');
  assertRefusedAsOpaque(`node ${quote(join(pluginScripts, 'pipeline-start-preflight.mjs') + 'x')}`, 'look-alike script name');
  assertRefusedAsOpaque('node -e "1"', 'inline interpreter code');
});

// ---- Cases below name acceptance points the current source satisfies (they pass) ----

test('AC-167 point 4: the skill-prescribed literal ${PIPELINE_PLUGIN_ROOT} spelling is not refused as opaque execution', () => {
  assertAdmitted('node "${PIPELINE_PLUGIN_ROOT}/scripts/pipeline-start-preflight.mjs"', 'literal-variable preflight');
});

test('AC-167 point 5: the preflight-published hook-provisioning action is executable while a feature is in draft', () => {
  const refresh = join(pluginScripts, 'refresh-mandatory-hooks.mjs');
  assertAdmitted(`node ${quote(refresh)} --root ${quote(root)}`, 'refresh-mandatory-hooks nextAction');
});

// ---- ALF-C-P8-02B additions: the same two points plus a closed-admission control ----
// The literal spelling is only a placeholder the shell expands, so the guard binds it to the one
// physical preflight: with no PIPELINE_PLUGIN_ROOT visible to the guard it is admitted, with one
// that designates THIS plugin it is admitted, and with one that designates anything else it is not.
const pluginRoot = fileURLToPath(new URL('../../', import.meta.url)).replace(/[\\/]$/u, '');
const literalPreflight = '${PIPELINE_PLUGIN_ROOT}/scripts/pipeline-start-preflight.mjs';

// Host dialect: only the native-Windows guard dialect accepts a `${VAR}` word; the POSIX dialect refuses it
// in parseGuardCommand (GUARD-PARSE-UNSUPPORTED) before the lane classifies anything, so the lane unit returns null.
const literalNeedsWin32 = process.platform === 'win32' ? false : 'host-limitation: the POSIX guard dialect refuses ${VAR} words at parse time';
test('AC-167 point 4b: the literal spelling is admitted when PIPELINE_PLUGIN_ROOT designates this plugin, and its case variant follows host path identity', { skip: literalNeedsWin32 }, () => {
  const env = { PIPELINE_PLUGIN_ROOT: pluginRoot };
  assertAdmitted(`node ${quote(literalPreflight)}`, 'literal preflight with the variable set to this plugin', { env });
  const variant = '${pipeline_plugin_root}/SCRIPTS/Pipeline-Start-Preflight.mjs';
  if (process.platform === 'win32') assertAdmitted(`node ${quote(variant)}`, 'win32 case variant', { env });
  else assertRefusedAsOpaque(`node ${quote(variant)}`, 'case variant on a case-sensitive host', { env });
});

test('AC-167 point 5b: the exact published provisioning action, clone-hook-readiness --apply, is executable while a feature is in draft', () => {
  const provision = join(pluginScripts, 'clone-hook-readiness.mjs');
  assertAdmitted(`node ${quote(provision)} --root ${quote(root)} --apply`, 'clone-hook-readiness nextAction');
  assertAdmitted(`node ${quote(forwardSlash(provision))} --root ${quote(root)} --apply`, 'forward-slash clone-hook-readiness nextAction');
});

test('AC-167 control (literal variable): every other literal-variable shape stays refused', { skip: literalNeedsWin32 }, () => {
  const elsewhere = { PIPELINE_PLUGIN_ROOT: join(root, 'no-such-plugin-root') };
  assertRefusedAsOpaque(`node ${quote(literalPreflight)} --extra`, 'literal preflight with an extra argument');
  assertRefusedAsOpaque(`node ${quote('${PIPELINE_PLUGIN_ROOT}/scripts/other.mjs')}`, 'literal variable with a foreign script');
  assertRefusedAsOpaque(`node ${quote(literalPreflight + 'x')}`, 'literal look-alike script name');
  assertRefusedAsOpaque(`node ${quote('${OTHER_ROOT}/scripts/pipeline-start-preflight.mjs')}`, 'a different variable');
  assertRefusedAsOpaque(`node ${quote(literalPreflight)}`, 'literal preflight with the variable set to another directory', { env: elsewhere });
});

test('AC-167 control: the hook-action admissions are closed -- every other shape stays refused', () => {
  const provision = join(pluginScripts, 'clone-hook-readiness.mjs');
  const refresh = join(pluginScripts, 'refresh-mandatory-hooks.mjs');
  assertRefusedAsOpaque(`node ${quote(provision)} --root ${quote(root)}`, 'provisioning without --apply');
  assertRefusedAsOpaque(`node ${quote(provision)} --root ${quote(root)} --apply --extra`, 'provisioning with an extra argument');
  assertRefusedAsOpaque(`node ${quote(provision)} --root ${quote(join(root, 'other'))} --apply`, 'provisioning for a foreign root');
  assertRefusedAsOpaque(`node ${quote(provision)} --apply`, 'provisioning without a root');
  assertRefusedAsOpaque(`node ${quote(refresh)} --root ${quote(root)} --apply`, 'refresh with --apply');
  assertRefusedAsOpaque(`node ${quote(refresh)} --root ${quote(join(root, 'other'))}`, 'refresh for a foreign root');
  assertRefusedAsOpaque(`node ${quote(join(pluginScripts, 'refresh-mandatory-hooks.mjs') + 'x')} --root ${quote(root)}`, 'look-alike refresh script');
});

test('AC-167 point 6: pipeline-start SKILL.md names the hook-provisioning/refresh preflight status it can receive', () => {
  const skill = readFileSync(new URL('../../skills/pipeline-start/SKILL.md', import.meta.url), 'utf8');
  assert.equal(/hook-provisioning-required|hook-refresh-required/u.test(skill), true,
    'SKILL.md does not document the status the preflight emits when mandatory hooks are missing or stale');
});
