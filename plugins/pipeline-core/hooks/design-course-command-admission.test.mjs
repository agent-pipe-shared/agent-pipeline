// SPDX-License-Identifier: SUL-1.0
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync as runFixtureGit } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerTestCaseCompletion } from '../lib/test-case-completion.mjs';
import { isDirectInvocation } from '../lib/entrypoint.mjs';
import { main as guardMain, isSanctionedLifecycleCommand } from './guard-lifecycle-ready.mjs';
import { run, statePath } from '../scripts/pipeline-state.mjs';
import { main as courseMain } from '../scripts/design-course-session.mjs';
import { observeGovernanceScope } from '../lib/governance-scope.mjs';
import { ProjectOnboardingReadyError } from '../lib/project-onboarding-ready-gate.mjs';

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const courseScript = join(pluginRoot, 'scripts/design-course-session.mjs');
const stateScript = join(pluginRoot, 'scripts/pipeline-state.mjs');
const names = ['input', 'prd', 'spec', 'design', 'traceability'];
const digest = value => createHash('sha256').update(value).digest('hex');
const candidate = { commit: 'a'.repeat(40), tree: 'b'.repeat(40) };
const quote = value => `'${value.replaceAll("'", "'\"'\"'")}'`;
const render = action => [action.executable, ...action.argv].map(quote).join(' ');
function capture(fn) {
  const stdout = []; const stderr = [];
  const beforeLog = console.log; const beforeError = console.error;
  console.log = (...values) => stdout.push(values.join(' '));
  console.error = (...values) => stderr.push(values.join(' '));
  try { return { code: fn(), stdout: stdout.join('\n'), stderr: stderr.join('\n') }; }
  finally { console.log = beforeLog; console.error = beforeError; }
}
export function fixture(profile = 'feature') {
  const root = mkdtempSync(join(tmpdir(), 'k3-guard-regression-'));
  runFixtureGit('git', ['init', '-q', root], { env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))) });
  const featureId = 'feature-test'; const authoringDispatchId = 'authoring-1';
  const planPath = `specs/${featureId}/prd.md`; const specPath = `specs/${featureId}/spec.md`;
  const now = '2026-10-03T00:00:00.000Z';
  mkdirSync(join(root, 'project'), { recursive: true });
  mkdirSync(join(root, `specs/${featureId}`), { recursive: true });
  mkdirSync(join(root, '.agent-pipeline'), { recursive: true });
  writeFileSync(join(root, '.agent-pipeline/onboarding-consent.json'), JSON.stringify({
    schema: 'pipeline.onboarding-consent-marker.v1', status: 'consent-given-onboarding-incomplete', consentGivenAt: now,
  }));
  const spec = '# Technical Spec\nGuard admission regression.\n';
  const plan = `<!-- po-language: en -->\n<!-- technical-spec-sha256: ${digest(spec)} -->\n# PRD\n${featureId}\n`;
  const sourcePaths = { input: `specs/${featureId}/design-input.md`, prd: planPath, spec: specPath,
    design: `specs/${featureId}/design.md`, traceability: `specs/${featureId}/traceability.md` };
  for (const name of names) writeFileSync(join(root, sourcePaths[name]), name === 'prd' ? plan : name === 'spec' ? spec : `${name} fixture bytes\n`);
  const sources = Object.fromEntries(names.map(name => [name, { path: sourcePaths[name], sha256: digest(readFileSync(join(root, sourcePaths[name]))) }]));
  const evidence = { schema: 'pipeline.po-gate-authority-evidence.v1', humanFacing: 'en',
    sourceSha256: '1'.repeat(64), runtimeSha256: '2'.repeat(64), receiptSha256: '3'.repeat(64), repositoryFingerprint: '4'.repeat(64) };
  const continuity = { schema: 'pipeline.continuity.v0', featureId, revision: 0,
    runtime: { humanFacingLanguage: 'en', activeDuty: 'Coordinator', sessionCleanup: null },
    authority: { prd: { path: planPath, sha256: sources.prd.sha256 }, spec: { path: specPath, sha256: sources.spec.sha256 }, result: null },
    queueHead: { packageId: 'initial-planning', actionId: 'review-plan', nextAction: 'review', productRetryCount: 0, environmentRerouteCount: 0, dispatch: null },
    blocker: null, acknowledgedFinal: null, resume: { mode: 'immediate', sourceRevision: 0, reasonCode: 'active-turn' }, recovery: null, decisionTxn: null,
    capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: 'defer' } };
  writeFileSync(statePath(root), JSON.stringify({ schema: 'pipeline.state.v0', activeFeature: { id: featureId, planPath, phase: 'design' }, planApproved: false, continuity, updatedAt: now }));
  const deps = { dir: root, now: () => now, gitCandidate: () => ({ ok: true, ...candidate }),
    gitHead: () => ({ ok: true, commit: candidate.commit }),
    gitUserName: () => 'Fixture', poGateProfile: () => ({ ok: true, value: evidence }),
    poGateAuthority: () => ({ ok: true, value: { ...evidence, schema: 'pipeline.po-gate-authority.v2', planPath, planSha256: sources.prd.sha256, specPath, specSha256: sources.spec.sha256 } }),
    designAdvisoryAdmission: () => ({ ok: true, id: 'a'.repeat(64) }), runner: 'codex' };
  const submitted = capture(() => run(['submit-plan', '--by', 'coordinator', '--profile', profile], deps));
  assert.equal(submitted.code, 0, submitted.stderr);
  const state = JSON.parse(readFileSync(statePath(root), 'utf8'));
  state.continuity.queueHead.dispatch = { dispatchId: authoringDispatchId };
  writeFileSync(statePath(root), JSON.stringify(state));
  const execFileSync = (_executable, args, options) => {
    if (args.includes('--show-toplevel')) return root;
    if (args.at(-1) === 'HEAD') return candidate.commit;
    if (args.at(-1) === 'HEAD^{tree}') return candidate.tree;
    if (args[0] === 'show') return readFileSync(join(root, args[1].slice(args[1].indexOf(':') + 1)));
    throw new Error(`UNEXPECTED-FIXTURE-GIT:${args.join(' ')}`);
  };
  return { root, deps, state, sources, featureId, authoringDispatchId, profile, execFileSync,
    cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
function commitApprovalPolicy(f, source) {
  writeFileSync(join(f.root, 'pipeline.user.yaml'), source);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  runFixtureGit('git', ['-C', f.root, 'add', '--', 'pipeline.user.yaml'], { env });
  runFixtureGit('git', ['-C', f.root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    'commit', '-q', '-m', 'Record disposable fixture approval policy', '--', 'pipeline.user.yaml'], { env });
}
function inspectState(f, extras = {}) {
  const observed = capture(() => run(['inspect'], { ...f.deps, ...extras }));
  assert.equal(observed.code, 0, observed.stderr);
  return JSON.parse(observed.stdout);
}
export const guardDecisions = [];
export function actualGuard(action, root, { ready = false, tty = false } = {}) {
  const scope = observeGovernanceScope({ rootDir: root });
  assert.equal(scope.requiresEnforcement, true, JSON.stringify(scope));
  let stderr = ''; let readinessCalls = 0;
  const code = guardMain({ tool_name: 'Bash', tool_input: { command: render(action), tty } }, {
    projectDir: root, runner: 'codex',
    requireProjectOnboardingReadyFn: () => {
      readinessCalls += 1;
      if (ready) return { schema: 'pipeline.project-onboarding-ready-gate.v1', status: 'ready', intent: 'session' };
      throw new ProjectOnboardingReadyError('PORG-NOT-READY', 'Design-course recovery fixture is not ready.', { intent: 'session', lifecycleStatus: 'partial' });
    },
    writeErrorFn: value => { stderr += value; },
    recordHumanGuardDenialFn: () => ({ status: 'ineligible' }),
  });
  if (code === 0) assert.equal(readinessCalls, 1, 'a positive must reach the enforcing readiness decision');
  guardDecisions.push({ commandSha256: digest(render(action)), code, readinessCalls, governanceEnforced: scope.requiresEnforcement, ready, tty,
    classifier: isSanctionedLifecycleCommand(render(action), root) });
  return { code, stderr, readinessCalls };
}
export async function advisorAction(f) {
  const action = inspectState(f).nextAction;
  const stdout = [];
  const result = await courseMain(action.argv.slice(1), { stdout: { write: value => stdout.push(value) } }, {
    readState: () => ({ status: 'ok', state: f.state }), execFileSync: f.execFileSync,
  });
  assert.equal(result.status, 'advisor-ready', JSON.stringify(result));
  return result.nextAction;
}
function accepted(action, f) {
  assert.equal(isSanctionedLifecycleCommand(render(action), f.root), true, JSON.stringify(action.argv));
  const decision = actualGuard(action, f.root);
  assert.equal(decision.code, 0, decision.stderr);
  assert.equal(decision.readinessCalls, 1);
}
function refused(action, f, options) {
  assert.equal(isSanctionedLifecycleCommand(render(action), f.root), false, JSON.stringify(action.argv));
  assert.equal(actualGuard(action, f.root, options).code, 2, JSON.stringify(action.argv));
}
function setFlag(action, flag, value) {
  const argv = [...action.argv]; const index = argv.indexOf(flag);
  assert.notEqual(index, -1, flag); argv[index + 1] = value; return { ...action, argv };
}
async function laterAction(f, runner, runV2 = false, resumed = false) {
  const advisor = await advisorAction(f);
  const argv = [...advisor.argv]; argv[argv.indexOf('--runner') + 1] = runner;
  const prefix = `evidence/design-course/${f.featureId}/${runner}`;
  argv[argv.indexOf('--output-prefix') + 1] = prefix;
  if (runV2) { argv.splice(argv.indexOf('--stage'), 2); argv.splice(1, 0, '--run-v2'); }
  else argv[argv.indexOf('--stage') + 1] = 'readiness';
  argv.pop();
  argv.push('--readiness-dispatch-id', 'readiness-1', '--queue-revision', String(f.state.continuity.revision),
    '--receipt', `${prefix}.readiness.json`, '--preparation', `${prefix}.preparation.json`);
  mkdirSync(join(f.root, `evidence/design-course/${f.featureId}`), { recursive: true });
  if (!runV2) writeFileSync(join(f.root, `${prefix}.preparation.json`), '{}\n');
  if (runV2) argv.push('--package', `${prefix}.package.json`);
  if (runner === 'codex') argv.push('--session-id', 'session-1', '--descriptor-sha256', 'c'.repeat(64));
  const refs = {};
  const put = (flag, path, value) => {
    const bytes = typeof value === 'string' ? value : JSON.stringify(value);
    writeFileSync(join(f.root, path), bytes); argv.push(flag, path, digest(bytes)); refs[flag] = { path, sha256: digest(bytes) };
  };
  if (runV2) {
    if (runner === 'codex') {
      put('--disposition', `${prefix}.disposition.json`, { status: 'curated' });
      put('--revisions', `${prefix}.revisions.json`, []);
    } else put('--exception-rationale', `${prefix}.exception-rationale.txt`, 'A specific no-child exception is proposed for the final package only.');
    if (resumed) put('--advisor-result', `${prefix}.advisor-result.json`, { runner, implementationAuthority: false });
  }
  argv.push('--execute'); return { executable: process.execPath, argv, refs };
}
export const cases = [
  { id: 'K3G001', name: 'actual awaiting-approval inspect emits admitted read-only course action for feature and epic', run() {
    for (const profile of ['feature', 'epic']) {
      const f = fixture(profile);
      try {
        const observed = inspectState(f);
        assert.equal(observed.status, 'awaiting-approval');
        assert.deepEqual(observed.nextAction.argv, [courseScript, '--inspect', '--root', f.root, '--runner', 'codex']);
        assert.equal(observed.nextAction.mutation, false);
        assert.equal(isSanctionedLifecycleCommand(render(observed.nextAction), f.root), true, 'the exact state inspect argv must be classified');
        const result = actualGuard(observed.nextAction, f.root);
        assert.equal(result.code, 0, result.stderr);
      } finally { f.cleanup(); }
    }
  } },
  { id: 'K3G002', name: 'actual course inspect emits advisor execute action admitted by real guard entry point', async run() {
    const f = fixture();
    try {
      const action = await advisorAction(f);
      assert.equal(action.argv.at(-1), '--execute');
      assert.equal(action.implementationAuthority, false);
      const result = actualGuard(action, f.root);
      assert.equal(result.code, 0, result.stderr);
      assert.equal(isSanctionedLifecycleCommand(render(action), f.root), true);
    } finally { f.cleanup(); }
  } },
  { id: 'K3G003', name: 'working readiness-stage fixed argv is admitted for every supported runner', async run() {
    const f = fixture();
    try {
      const advisor = await advisorAction(f);
      for (const runner of ['claude', 'codex', 'antigravity']) {
        const argv = [...advisor.argv]; argv[argv.indexOf('--runner') + 1] = runner;
        argv[argv.indexOf('--stage') + 1] = 'readiness';
        argv[argv.indexOf('--output-prefix') + 1] = `evidence/design-course/${f.featureId}/${runner}`;
        argv.pop();
        argv.push('--readiness-dispatch-id', 'readiness-1', '--queue-revision', String(f.state.continuity.revision), '--receipt', `evidence/design-course/${f.featureId}/${runner}.readiness.json`,
          '--preparation', `evidence/design-course/${f.featureId}/${runner}.preparation.json`);
        mkdirSync(join(f.root, `evidence/design-course/${f.featureId}`), { recursive: true });
        writeFileSync(join(f.root, `evidence/design-course/${f.featureId}/${runner}.preparation.json`), '{}\n');
        if (runner === 'codex') argv.push('--session-id', 'session-1', '--descriptor-sha256', 'c'.repeat(64));
        argv.push('--execute');
        const result = actualGuard({ executable: process.execPath, argv }, f.root);
        assert.equal(isSanctionedLifecycleCommand(render({ executable: process.execPath, argv }), f.root), true);
        assert.equal(result.code, 0, result.stderr);
      }
    } finally { f.cleanup(); }
  } },
  { id: 'K3G004', name: 'guard refuses arbitrary script root runner source digest identity output and extra argv', async run() {
    const f = fixture();
    try {
      const action = await advisorAction(f);
      const mutate = (flag, value) => { const argv = [...action.argv]; argv[argv.indexOf(flag) + 1] = value; return argv; };
      const alternatives = [
        [join(f.root, 'design-course-session.mjs'), ...action.argv.slice(1)],
        mutate('--root', dirname(f.root)), mutate('--root', `${f.root}/.`),
        mutate('--runner', 'other'), mutate('--feature-id', 'other-feature'), mutate('--authoring-dispatch-id', 'other-author'),
        mutate('--profile', 'mini'), mutate('--output-prefix', 'evidence/arbitrary'),
        [...action.argv, '--extra', 'yes'], [...action.argv, '--plugin-root', pluginRoot],
        [...action.argv, '--execute'], [...action.argv, '--run-v2'], [...action.argv, '--stage', 'advisor'],
      ];
      const sourceIndex = action.argv.indexOf('--source');
      for (const [offset, value] of [[1, 'arbitrary'], [2, '../outside.md'], [2, '/absolute.md'], [2, 'scratch/input.md'],
        [2, f.sources.prd.path], [3, 'bad'], [3, 'f'.repeat(64)], [3, action.argv[sourceIndex + 3].toUpperCase()]]) {
        const argv = [...action.argv]; argv[sourceIndex + offset] = value; alternatives.push(argv);
      }
      const reordered = [...action.argv];
      reordered.splice(sourceIndex, 8, ...action.argv.slice(sourceIndex + 4, sourceIndex + 8), ...action.argv.slice(sourceIndex, sourceIndex + 4));
      alternatives.push(reordered);
      for (const argv of alternatives) {
        assert.equal(isSanctionedLifecycleCommand(render({ ...action, argv }), f.root), false, JSON.stringify(argv));
        assert.equal(actualGuard({ ...action, argv }, f.root).code, 2, JSON.stringify(argv));
      }
      writeFileSync(join(f.root, f.sources.input.path), 'changed input\n');
      assert.equal(actualGuard(action, f.root).code, 2, 'changed physical source bytes must invalidate admission');
    } finally { f.cleanup(); }
  } },
  { id: 'K3G005', name: 'inspect rejects extra flags and every agent signing shape including run-v2', run() {
    const f = fixture();
    try {
      const action = inspectState(f).nextAction;
      for (const extra of [['--plugin-root', pluginRoot], ['--execute'], ['--help'], ['--run-v2'], ['--stage', 'advisor'], ['--runner', 'claude']]) {
        assert.equal(actualGuard({ ...action, argv: [...action.argv, ...extra] }, f.root).code, 2);
      }
      for (const argv of [
        [join(pluginRoot, 'scripts/po-human-approval.mjs'), 'sign-intent', '--repo-root', f.root, '--intent-sha256', 'a'.repeat(64)],
        [courseScript, '--root', f.root, '--runner', 'codex', '--stage', 'sign', '--execute'],
        [courseScript, '--run-v2', '--root', f.root, '--runner', 'codex', '--execute'],
      ]) assert.equal(actualGuard({ executable: process.execPath, argv }, f.root).code, 2);
    } finally { f.cleanup(); }
  } },
  { id: 'K3G006', name: 'mini and existing package routes remain on present-plan while absent runner stays typed', run() {
    const mini = fixture('mini');
    try {
      const action = inspectState(mini).nextAction;
      if (action.kind === 'collect-input' && !action.applyAction) assert.match(action.guidance, /present-plan --by/u);
      else {
        const concrete = action.kind === 'collect-input' ? action.applyAction : action;
        assert.deepEqual(concrete.argv.slice(0, 2), [stateScript, 'present-plan']);
        assert.equal(concrete.argv.includes(courseScript), false);
      }
    } finally { mini.cleanup(); }
    const f = fixture();
    try {
      const path = 'evidence/design-workflow-package.json';
      const action = inspectState(f, { designWorkflowPackagePath: path }).nextAction;
      const concrete = action.kind === 'collect-input' ? action.applyAction : action;
      assert.deepEqual(concrete.argv.slice(0, 2), [stateScript, 'present-plan']);
      assert.deepEqual(concrete.argv.slice(-2), ['--design-workflow-package', path]);
      const missing = inspectState(f, { runner: undefined, env: {} });
      assert.equal(missing.nextAction.code, 'DESIGN-COURSE-RUNNER-SELECTION-REQUIRED');
      assert.equal(missing.nextAction.kind, 'agent-owned-coordination-required');
    } finally { f.cleanup(); }
  } },
  { id: 'K3G007', name: 'fixed run-v2 argv is strictly admitted for all runners with bound curation and optional resume result', async run() {
    const f = fixture();
    try {
      for (const runner of ['claude', 'codex', 'antigravity']) for (const resumed of [false, true]) {
        const action = await laterAction(f, runner, true, resumed);
        accepted(action, f);
      }
    } finally { f.cleanup(); }
  } },
  { id: 'K3G008', name: 'readiness requires current queue and distinct dispatch plus bounded receipt preparation and Codex descriptor', async run() {
    const f = fixture();
    try {
      const action = await laterAction(f, 'codex'); accepted(action, f);
      for (const [flag, value] of [
        ['--readiness-dispatch-id', f.authoringDispatchId], ['--readiness-dispatch-id', '../other'],
        ['--queue-revision', String(f.state.continuity.revision + 1)], ['--queue-revision', '00'],
        ['--receipt', 'evidence/other.readiness.json'], ['--receipt', '../receipt.json'],
        ['--preparation', 'evidence/other.preparation.json'], ['--session-id', 'a/b'],
        ['--descriptor-sha256', 'C'.repeat(64)], ['--runner', 'unknown'], ['--profile', 'mini'],
      ]) refused(setFlag(action, flag, value), f);
      const noDescriptor = [...action.argv]; noDescriptor.splice(noDescriptor.indexOf('--descriptor-sha256'), 2);
      refused({ ...action, argv: noDescriptor }, f);
      const noPreparation = [...action.argv]; noPreparation.splice(noPreparation.indexOf('--preparation'), 2);
      refused({ ...action, argv: noPreparation }, f);
      refused({ ...action, argv: [...action.argv, '--approve'] }, f);
    } finally { f.cleanup(); }
  } },
  { id: 'K3G009', name: 'run-v2 rejects extra signing collision and stale or foreign curation references', async run() {
    const f = fixture();
    try {
      const action = await laterAction(f, 'codex', true, true); accepted(action, f);
      for (const [flag, value] of [['--package', 'evidence/other.package.json'], ['--package', action.argv[action.argv.indexOf('--receipt') + 1]],
        ['--root', `${f.root}/.`], ['--feature-id', 'other'], ['--authoring-dispatch-id', 'other'],
        ['--disposition', 'scratch/disposition.json'], ['--advisor-result', 'evidence/foreign.json']]) refused(setFlag(action, flag, value), f);
      for (const flag of ['--disposition', '--revisions', '--advisor-result']) {
        const changed = [...action.argv]; changed[changed.indexOf(flag) + 2] = 'f'.repeat(64);
        refused({ ...action, argv: changed }, f);
      }
      for (const extra of [['--sign-intent'], ['--approve'], ['--plugin-root', pluginRoot], ['--execute'], ['--stage', 'advisor']]) {
        refused({ ...action, argv: [...action.argv, ...extra] }, f);
      }
      writeFileSync(join(f.root, action.refs['--disposition'].path), '{"status":"changed"}');
      refused(action, f);
    } finally { f.cleanup(); }
  } },
  { id: 'K3G010', name: 'physical source and preparation aliases never gain admission', async run() {
    const f = fixture();
    try {
      const action = await advisorAction(f);
      const source = join(f.root, f.sources.input.path); const other = `${source}.saved`;
      renameSync(source, other); symlinkSync(other, source); refused(action, f);
      rmSync(source); renameSync(other, source);
      const readiness = await laterAction(f, 'claude'); accepted(readiness, f);
      const preparation = join(f.root, readiness.argv[readiness.argv.indexOf('--preparation') + 1]);
      const alias = `${preparation}.saved`; renameSync(preparation, alias); symlinkSync(alias, preparation);
      refused(readiness, f);
    } finally { f.cleanup(); }
  } },
  { id: 'K3G011', name: 'source and current submission changes invalidate previously emitted commands', async run() {
    const f = fixture();
    try {
      const action = await advisorAction(f); accepted(action, f);
      const original = readFileSync(join(f.root, f.sources.input.path));
      writeFileSync(join(f.root, f.sources.input.path), 'changed source\n'); refused(action, f);
      writeFileSync(join(f.root, f.sources.input.path), original);
      const state = JSON.parse(readFileSync(statePath(f.root), 'utf8'));
      state.continuity.queueHead.dispatch.dispatchId = 'different-author'; writeFileSync(statePath(f.root), JSON.stringify(state)); refused(action, f);
      state.continuity.queueHead.dispatch.dispatchId = f.authoringDispatchId; state.planApproved = true;
      writeFileSync(statePath(f.root), JSON.stringify(state)); refused(action, f);
    } finally { f.cleanup(); }
  } },
  { id: 'K3G012', name: 'profile acknowledgement plan remains a strict agent diagnostic with indivisible profile reason pair', run() {
    const f = fixture();
    try {
      const basic = { executable: process.execPath, argv: [stateScript, 'po-authority-acknowledge-plan', '--root', f.root, '--by', 'Fixture', '--runner', 'codex'] };
      accepted(basic, f);
      for (const profile of ['epic', 'feature', 'mini']) accepted({ ...basic, argv: [...basic.argv, '--profile', profile, '--reason', 'Current work is bounded to this approved profile.'] }, f);
      accepted({ ...basic, argv: [stateScript, 'po-authority-acknowledge-plan', '--reason', 'Bounded work.', '--profile', 'feature',
        '--runner', 'codex', '--by', 'Fixture', '--root', f.root] }, f);
      for (const extra of [['--profile', 'feature'], ['--reason', 'reason'], ['--profile', 'other', '--reason', 'reason'],
        ['--profile', 'feature', '--reason', ''], ['--profile', 'feature', '--reason', 'line\nline'],
        ['--profile', 'feature', '--reason', 'x'.repeat(2049)], ['--profile', 'feature', '--reason', 'why', '--reason', 'duplicate']]) {
        refused({ ...basic, argv: [...basic.argv, ...extra] }, f);
      }
    } finally { f.cleanup(); }
  } },
  { id: 'K3G013', name: 'profile acknowledgement apply stays human-only for agent tools with ready tty and malformed or reordered flags', run() {
    const f = fixture();
    try {
      const basic = { executable: process.execPath, argv: [stateScript, 'po-authority-acknowledge-apply', '--root', f.root,
        '--plan-sha256', 'a'.repeat(64), '--updated-at', '2026-10-03T00:00:00.000Z', '--by', 'Fixture', '--activate', '--runner', 'codex'] };
      accepted(basic, f);
      const change = { ...basic, argv: [...basic.argv, '--profile', 'feature', '--reason', 'Human approved this profile change.'] };
      const alternatives = [change, { ...change, argv: [stateScript, 'po-authority-acknowledge-apply', '--profile', 'feature', '--reason', 'why', ...basic.argv.slice(2)] },
        { ...basic, argv: [...basic.argv, '--profile', 'feature'] }, { ...basic, argv: [...basic.argv, '--reason', 'why'] },
        { ...basic, argv: [...basic.argv, '--profile=feature'] }, { ...basic, argv: [stateScript, 'po-authority-acknowledge-apply', '--profile', 'feature'] }];
      for (const action of alternatives) {
        refused(action, f, { ready: true, tty: true });
        assert.match(actualGuard(action, f.root, { ready: true, tty: true }).stderr, /PO-PROFILE-CHANGE-HUMAN-ONLY/u);
      }
    } finally { f.cleanup(); }
  } },
  { id: 'K3G014', name: 'same guarded inspect advisor and resumed v2 argv execute real coordinator CLI to one unsigned request', async run() {
    const f = fixture();
    try {
      const prefix = `evidence/design-course/${f.featureId}/claude`;
      mkdirSync(join(f.root, `evidence/design-course/${f.featureId}`), { recursive: true });
      const initial = { featureId: f.featureId, authoringDispatchId: f.authoringDispatchId, initialCandidate: candidate, sources: f.sources };
      const failure = { schema: 'pipeline.design-advisor-failure.v1', code: 'native-initial-answer-provenance-unavailable',
        childStarted: false, inputSubmitted: false, attemptCount: 0 };
      const put = (path, value) => { const bytes = JSON.stringify(value); writeFileSync(join(f.root, path), bytes); return { path, sha256: digest(bytes) }; };
      const advisorResult = { ok: false, status: 'unavailable-pending-final-approval', code: failure.code, runner: 'claude',
        profile: f.profile, route: { model: null, effort: null, sourceSha256: 'c'.repeat(64), candidateCommit: candidate.commit },
        courseBinding: { courseId: 'course-test' }, hostReceipt: null,
        artifacts: { initial: put(`${prefix}.initial.json`, initial), failure: put(`${prefix}.failure.json`, failure) }, implementationAuthority: false };
      const stages = [];
      const dependencies = { readState: () => ({ status: 'ok', state: f.state }),
        execFileSync: (executable, argv, options) => argv[0] === 'check-ignore' ? '' : f.execFileSync(executable, argv, options),
        canonicalJson: JSON.stringify,
        readPreparation: async input => {
          const value = JSON.parse(readFileSync(join(f.root, input.packagePath), 'utf8'));
          assert.equal(value.featureId, f.featureId); assert.deepEqual(value.sources, f.sources);
          assert.equal(value.advisor.status, 'unavailable');
          return { ok: true, advisorObservation: { candidate, sources: f.sources } };
        },
        spawnSync: (executable, argv, options) => {
          assert.equal(executable, process.execPath); assert.equal(options.shell, false); assert.equal(options.cwd, f.root);
          if (argv[0] === join(pluginRoot, 'scripts/design-advisory-coordinator.mjs')) {
            stages.push('advisor'); return { status: 2, signal: null, stdout: JSON.stringify(advisorResult), stderr: '' };
          }
          assert.equal(argv[0], join(pluginRoot, 'scripts/runner-design-readiness-bootstrap.mjs'));
          assert.equal(argv[argv.indexOf('--receipt') + 1], `${prefix}.readiness.json`);
          assert.equal(argv[argv.indexOf('--advisor-preparation') + 1], `${prefix}.preparation.json`);
          stages.push('readiness');
          return { status: 0, signal: null, stdout: JSON.stringify({ ok: true, code: 'DESIGN-READINESS-RECEIPT-PUBLISHED', runner: 'claude',
            candidate, path: `${prefix}.readiness.json`, dispatchId: 'readiness-1' }), stderr: '' };
        },
        buildPackageV2: async input => {
          assert.equal(input.packagePath, `${prefix}.package.json`); assert.equal(input.readinessPath, `${prefix}.readiness.json`);
          assert.deepEqual(input.expectedSources, f.sources);
          return { ok: true, code: 'DWP2-PACKAGE-BUILT', packagePath: input.packagePath, packageSha256: 'e'.repeat(64), candidate,
            packageRead: { implementationAuthority: false }, advisorStatus: 'unavailable', advisorExceptionRequired: true };
        },
        approvalModule: { createDesignWorkflowPackageApprovalRequest: input => {
          assert.equal(input.planPath, f.sources.prd.path); assert.equal(input.specPath, f.sources.spec.path);
          assert.equal(JSON.parse(readFileSync(statePath(f.root), 'utf8')).planApproved, false);
          return { ok: true, packageRead: { implementationAuthority: false, packageSha256: 'e'.repeat(64) },
            request: { packageSha256: 'e'.repeat(64), approvalIntent: { sha256: 'f'.repeat(64), value: { decision: 'approve' } } } };
        } },
      };
      const invoke = async action => {
        accepted(action, f);
        const output = []; const io = { stdout: { write: value => output.push(value) }, exitCode: 0 };
        const result = await courseMain(action.argv.slice(1), io, dependencies);
        assert.equal(io.exitCode, 0, JSON.stringify(result)); assert.equal(result.implementationAuthority, false);
        assert.deepEqual(JSON.parse(output.at(-1)), result); return result;
      };
      const inspected = await invoke({ executable: process.execPath, argv: [courseScript, '--inspect', '--root', f.root, '--runner', 'claude'] });
      const advised = await invoke(inspected.nextAction);
      assert.equal(advised.status, 'advisor-unavailable-no-child');
      assert.equal(advised.nextAction.kind, 'agent-authored-unavailability-rationale');
      const resume = await laterAction(f, 'claude', true, true);
      const resultIndex = resume.argv.indexOf('--advisor-result');
      const ref = put(resume.argv[resultIndex + 1], advised.execution.producerResult); resume.argv[resultIndex + 2] = ref.sha256;
      const final = await invoke(resume);
      assert.equal(final.status, 'final-po-review-ready'); assert.equal(final.approvalCountBeforeFinalPackage, 0);
      assert.equal(final.nextAction.kind, 'present-final-design-workflow-package-to-po');
      assert.deepEqual(stages, ['advisor', 'readiness']);
      assert.equal(JSON.parse(readFileSync(statePath(f.root), 'utf8')).planApproved, false);
    } finally { f.cleanup(); }
  } },
  { id: 'K3G015', name: 'trusted approve-push chat argv reaches the real guard under committed global policy', run() {
    const f = fixture();
    try {
      // This is an explicit global policy at Git HEAD, not an action-local waiver
      // or a fabricated approval. The writer still owns recording and bindings.
      commitApprovalPolicy(f, 'schema: "pipeline.user.v3"\ngates:\n  human_approval: "chat"\n  push_approval: "signature"\n');
      const stateBefore = readFileSync(statePath(f.root), 'utf8');
      for (const argv of [
        [stateScript, 'approve-push', '--by', 'PO chat acknowledgement', '--remote', 'origin', '--destination', 'refs/heads/main'],
        [stateScript, 'approve-push', '--destination', 'refs/heads/main', '--remote', 'origin', '--by', 'PO chat acknowledgement'],
      ]) {
        const action = { executable: process.execPath, argv };
        assert.equal(isSanctionedLifecycleCommand(render(action), f.root), true, JSON.stringify(argv));
        const result = actualGuard(action, f.root, { ready: true });
        assert.equal(result.code, 0, result.stderr);
        assert.equal(result.readinessCalls, 1);
      }
      assert.equal(isSanctionedLifecycleCommand(render({ executable: 'git', argv: ['push', 'origin', 'HEAD:refs/heads/main'] }), f.root), false,
        'typed approval admission must not classify direct git push as a lifecycle writer');
      assert.equal(readFileSync(statePath(f.root), 'utf8'), stateBefore,
        'guard admission must not itself record approval');
    } finally { f.cleanup(); }
  } },
  { id: 'K3G016', name: 'global chat push admission rejects malformed duplicate extra root-spoof and foreign script argv', run() {
    const f = fixture();
    try {
      commitApprovalPolicy(f, 'schema: "pipeline.user.v3"\ngates:\n  human_approval: "chat"\n');
      const basic = { executable: process.execPath, argv: [stateScript, 'approve-push', '--by', 'PO', '--remote', 'origin', '--destination', 'refs/heads/main'] };
      const alternatives = [
        { ...basic, argv: [join(f.root, 'pipeline-state.mjs'), ...basic.argv.slice(1)] },
        { ...basic, argv: ['plugins/pipeline-core/scripts/pipeline-state.mjs', ...basic.argv.slice(1)] },
        ...[['--root', f.root], ['--root', dirname(f.root)], ['--repo-root', f.root], ['--extra', 'yes'],
          ['--by', 'duplicate'], ['--remote', 'other'], ['--destination', 'refs/heads/other'],
          ['--proof', 'evidence/proof.json'], ['unexpected']].map(extra => ({ ...basic, argv: [...basic.argv, ...extra] })),
        { ...basic, argv: basic.argv.slice(0, -2) },
        { ...basic, argv: basic.argv.slice(0, -1) },
        { ...basic, argv: [stateScript, 'approve-push', '--by=PO', ...basic.argv.slice(4)] },
      ];
      for (const [flag, value] of [['--by', ''], ['--by', '--root'], ['--by', 'x'.repeat(501)], ['--remote', 'origin/other'],
        ['--remote', 'origin other'], ['--remote', '--root'], ['--destination', 'main'], ['--destination', 'refs/tags/v1'],
        ['--destination', 'refs/heads/main other']]) alternatives.push(setFlag(basic, flag, value));
      // An unclassified shape must not gain this incomplete fixture's typed
      // lifecycle recovery route. Ready-session human policy belongs to the
      // adapter and writer and remains covered by the full AGY suite.
      for (const action of alternatives) refused(action, f);
    } finally { f.cleanup(); }
  } },
  { id: 'K3G017', name: 'signature legacy default and uncommitted or invalid chat policies never admit agent push approval', run() {
    for (const [source, committed] of [
      ['schema: "pipeline.user.v3"\ngates:\n  human_approval: "signature"\n', true],
      ['schema: "pipeline.user.v3"\ngates:\n  push_approval: "chat"\n', true],
      [null, false],
      ['schema: "pipeline.user.v3"\ngates:\n  human_approval: "chat"\n', false],
      ['schema: "pipeline.user.v3"\ngates:\n  human_approval: "other"\n', true],
      ['gates: [unterminated\n', true],
    ]) {
      const f = fixture();
      try {
        if (committed) commitApprovalPolicy(f, source);
        else if (source !== null) writeFileSync(join(f.root, 'pipeline.user.yaml'), source);
        const action = { executable: process.execPath, argv: [stateScript, 'approve-push', '--by', 'PO', '--remote', 'origin', '--destination', 'refs/heads/main'] };
        refused(action, f);
      } finally { f.cleanup(); }
    }
  } },
];
if (isDirectInvocation(import.meta.url)) {
  registerTestCaseCompletion({ cases: cases.map(entry => ({ ...entry, async run() {
    try { return await entry.run(); }
    catch (error) { process.stderr.write(`${entry.id}: ${error.stack}\n`); throw error; }
  } })), fd: 3, maxBytes: 65536 });
}
