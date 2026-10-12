import assert from 'node:assert/strict';
import { mkdirSync, lstatSync, realpathSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { main as onboardingMain } from '../project-onboarding-v3.mjs';
import { inspectProjectOnboardingV3, renderProjectOnboardingAction } from '../../lib/project-onboarding-v3.mjs';
import { readOnboardingIntakeCheckpoint } from '../../lib/onboarding-continuity.mjs';
import { evaluateLifecycleReadyGuard } from '../../lib/guard/evaluate.mjs';
import { requireProjectOnboardingReady } from '../../lib/project-onboarding-ready-gate.mjs';
import { parseYaml } from '../../lib/yaml-lite.mjs';

const controller = fileURLToPath(new URL('../project-onboarding-v3.mjs', import.meta.url));
let prepared;
function publicBytes(root) {
  const rows = [];
  function walk(path, relative) {
    for (const name of readdirSync(path).sort()) {
      if (relative === '' && name === '.git') continue;
      const next = join(path, name), rel = relative ? `${relative}/${name}` : name;
      const st = lstatSync(next);
      assert.equal(st.isSymbolicLink(), false);
      if (st.isDirectory()) walk(next, rel);
      else if (st.isFile()) rows.push([rel, st.ino, st.mode, st.nlink, createHash('sha256').update(readFileSync(next)).digest('hex')]);
    }
  }
  walk(root, ''); return rows;
}
export function prepareStoppedClaudeProject() {
  if (prepared) return prepared;
  const parent = process.env.PSBN_FIXTURE_PARENT;
  assert.ok(parent && realpathSync(parent) === parent);
  const info = lstatSync(parent);
  assert.ok(info.isDirectory() && !info.isSymbolicLink() && (info.mode & 0o077) === 0);
  const root = join(parent, 'project'), machineRoot = join(parent, 'machine');
  mkdirSync(root, { mode: 0o700 }); mkdirSync(machineRoot, { mode: 0o700 });
  const deps = { homedir: () => machineRoot };
  const observations = [];
  function cli(args) {
    let output = '', error = '';
    const status = onboardingMain(args, { deps, env: process.env, write: s => { output += s; }, writeError: s => { error += s; } });
    let value; try { value = JSON.parse(output); } catch { throw new Error(`PSBN-CONSTRUCTOR-OUTPUT:${args[0]}:status=${status}`); }
    observations.push({ step: args[0], status, schema: value.schema, state: value.status });
    assert.equal(status, 0, `PSBN-CONSTRUCTOR:${args[0]}:${value.status}:${error.slice(0, 120)}`);
    return value;
  }
  function returned(action, expectedCommand) {
    assert.equal(action?.kind, 'command'); assert.equal(action.executable, 'node');
    assert.equal(resolve(action.argv[0]), controller); assert.equal(action.argv[1], expectedCommand);
    assert.equal(action.argv.filter(value => value === '--root').length, 1);
    assert.equal(action.argv[action.argv.indexOf('--root') + 1], root);
    assert.equal(action.argv.filter(value => value === '--runner').length, 1);
    assert.equal(action.argv[action.argv.indexOf('--runner') + 1], 'claude');
    return cli(action.argv.slice(1));
  }
  returned(cli(['plan', '--root', root, '--runner', 'claude']).nextAction, 'apply-portable-seed');
  returned(cli(['plan-runtime', '--root', root, '--runner', 'claude']).nextAction, 'initialize-runtime');
  const source = parseYaml(readFileSync(join(root, 'pipeline.user.yaml'), 'utf8'));
  const language = source.language.human_facing;
  assert.ok(['en', 'de'].includes(language));
  cli(['intake-consent-apply', '--root', root, '--runner', 'claude', '--granted', '--git-author-name', 'Synthetic Fixture', '--git-author-email', 'fixture@example.invalid', '--language', language, '--profile', 'feature', '--text', 'Synthetic bounded lifecycle fixture; implement a public text report without external integrations.', '--activate']);
  cli(['intake-design-questions-apply', '--root', root, '--runner', 'claude', '--answers-json', '{"disposition":"no-open-questions"}', '--activate']);
  const generatedPlan = cli(['intake-generate-plan', '--root', root, '--runner', 'claude', '--verbose']);
  returned(generatedPlan.nextAction, 'intake-generate-apply');
  const observed = cli(['inspect', '--root', root, '--runner', 'claude', '--intent', 'session']);
  assert.equal(observed.status, 'bootstrap-binding-required');
  assert.equal(observed.root, realpathSync(root));
  const checkpoint = readOnboardingIntakeCheckpoint({ rootDir: root, repositoryCapability: 'local' });
  assert.equal(checkpoint.status, 'present'); assert.equal(checkpoint.value.transactionState, 'generated');
  assert.equal(observed.nextAction?.kind, 'command');
  prepared = { root, machineRoot, deps, observed, checkpoint: checkpoint.value, bytes: publicBytes(root), observations };
  return prepared;
}
function conserved(f) {
  assert.deepEqual(publicBytes(f.root), f.bytes);
  assert.deepEqual(readOnboardingIntakeCheckpoint({ rootDir: f.root, repositoryCapability: 'local' }).value, f.checkpoint);
}
function defaultObservation(f) {
  // Match the guard's genuine default observer, without the constructor's homedir
  // seam, readiness substitution, or a caller-supplied inspector.
  const observed = inspectProjectOnboardingV3({ rootDir: f.root, runner: 'claude', intent: 'session' });
  assert.equal(observed.status, 'bootstrap-binding-required');
  assert.equal(observed.root, f.root);
  assert.deepEqual(observed.nextAction, f.observed.nextAction);
  assert.throws(
    () => requireProjectOnboardingReady({ rootDir: f.root, runner: 'claude', intent: 'session' }),
    error => error.code === 'PORG-NOT-READY'
      && error.intent === 'session'
      && error.lifecycleStatus === 'bootstrap-binding-required',
  );
  return observed;
}
function noFixturePathDisclosure(f, value) {
  assert.equal(value.includes(f.root), false);
  assert.equal(value.includes(f.machineRoot), false);
}
function guard(f, tool_name, command) {
  return evaluateLifecycleReadyGuard({ tool_name, tool_input: { command } }, { projectDir: f.root, runner: 'claude' });
}
export const cases = [
  { id: 'PSBN001', name: 'Real stopped project is generated and unbound', run() {
    const f = prepareStoppedClaudeProject();
    const observed = inspectProjectOnboardingV3({ rootDir: f.root, runner: 'claude', intent: 'session', deps: f.deps });
    assert.equal(observed.status, 'bootstrap-binding-required');
    assert.equal(observed.continuity.status, 'absent-pristine');
    assert.equal(observed.root, f.root); conserved(f);
  } },
  { id: 'PSBN002', name: 'Both shell lanes refuse unrelated production mutation on genuine non-ready project', run() {
    const f = prepareStoppedClaudeProject();
    const bash = guard(f, 'Bash', 'touch production.txt');
    const powershell = guard(f, 'PowerShell', 'Set-Content -LiteralPath production.txt -Value blocked');
    assert.equal(bash.exitCode, 2); assert.equal(powershell.exitCode, 2);
    assert.match(bash.stderr, /GUARD-LIFECYCLE-NOT-READY: Pipeline session readiness is bootstrap-binding-required\./);
    assert.match(bash.stderr, /Re-run the typed project-onboarding-v3 inspection with intent session and use only its returned nextAction\./);
    assert.doesNotMatch(bash.stderr, /GUARD-(?:PARSE|OPERATOR|REDIRECT|POWERSHELL)/);
    // This exact PowerShell write is refused by its closed write grammar before
    // lifecycle observation. It must truthfully name confinement, not claim a
    // lifecycle denial that this lane never produced.
    assert.equal(powershell.stderr, 'BLOCKED (guard-lifecycle-ready, plugin pipeline-core): GUARD-POWERSHELL-GRAMMAR: content writes are limited to physically contained scratch files.\n');
    noFixturePathDisclosure(f, bash.stderr); noFixturePathDisclosure(f, powershell.stderr);
    conserved(f);
  } },
  { id: 'PSBN003', name: 'Exact source-returned onboarding action is admitted on supported shell lanes', run() {
    const f = prepareStoppedClaudeProject();
    const observed = defaultObservation(f);
    const command = renderProjectOnboardingAction(observed.nextAction);
    assert.equal(guard(f, 'Bash', command).exitCode, 0);
    assert.equal(guard(f, 'PowerShell', `& ${command}`).exitCode, 0); conserved(f);
  } },
  { id: 'PSBN004', name: 'Foreign same-basename script and composition do not inherit observed action authority', run() {
    const f = prepareStoppedClaudeProject();
    const action = f.observed.nextAction;
    const changed = { ...action, argv: [join(f.root, 'foreign', 'project-onboarding-v3.mjs'), ...action.argv.slice(1)] };
    assert.equal(guard(f, 'Bash', renderProjectOnboardingAction(changed)).exitCode, 2);
    assert.equal(guard(f, 'PowerShell', `& ${renderProjectOnboardingAction(changed)}`).exitCode, 2);
    assert.equal(guard(f, 'PowerShell', `${renderProjectOnboardingAction(action)}; Set-Content production.txt blocked`).exitCode, 2); conserved(f);
  } },
];
