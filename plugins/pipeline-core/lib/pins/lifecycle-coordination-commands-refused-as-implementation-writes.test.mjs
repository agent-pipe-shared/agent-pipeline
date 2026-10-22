// SPDX-License-Identifier: SUL-1.0
// Pin for backlog item pipeline.lifecycle-coordination-commands-refused-as-implementation-writes (AC-207, ALF-C-P20-04).
// Real shell lane (devPlanShellRefusalHit), real closed-argv catalogue, real lifecycle verdict against a
// scratch draft fixture, real staged-path evaluator. Only the documented onboarding-observation seam is injected.
// Cases naming an acceptance point the CURRENT source does not satisfy are kept RED on purpose (marked [RED]);
// no source is fixed here (out of write scope).
// Host-limitation: no case needs directory mode bits or directory symlinks, so none is skipped; the point-5
// end-to-end design course on Git Bash is not a unit case here and is reported held for the Linux/WSL run
// (owner Coordinator, due 2026-10-19, PO decision K7).
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { run } from '../../scripts/pipeline-state.mjs';

const repo = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const { devPlanShellRefusalHit } = await import(new URL('../guard/devplan-shell-lane.mjs', import.meta.url));
const { isSanctionedLifecycleCommand } = await import(new URL('../guard/command-catalogue.mjs', import.meta.url));
const { evaluateStagedDevPlanPaths } = await import(new URL('../guard-devplan-policy.mjs', import.meta.url));
const constants = await import(new URL('../guard/constants.mjs', import.meta.url));

mkdirSync(join(repo, 'scratch'), { recursive: true });
const root = mkdtempSync(join(repo, 'scratch', 'alf-c-p20-04-fixture-'));
test.after(() => rmSync(root, { recursive: true, force: true }));
mkdirSync(join(root, '.claude'), { recursive: true });
writeFileSync(join(root, '.claude/pipeline.yaml'), 'schema: pipeline.manifest.v0\ngates:\n  dev-plan:\n    mode: blocking\n    type: human\n');
writeFileSync(join(root, '.claude/pipeline-state.json'), JSON.stringify({ schema: 'pipeline.state.v0',
  activeFeature: { id: 'f', planPath: '.claude/plans/p.md', phase: 'design' }, planApproved: false }));
mkdirSync(join(root, 'harness/scripts'), { recursive: true });

const deps = { inspectProjectOnboardingV3Fn() { throw new Error('fixture: no onboarding observation'); } };
const q = word => `"${word}"`;
const state = constants.PIPELINE_STATE_SCRIPT;
const sha = 'a'.repeat(64);
const forward = value => value.replaceAll('\\', '/');
const msys = value => value.replace(/^([A-Za-z]):[\\/]/u, (_m, d) => `/${d.toLowerCase()}/`).replaceAll('\\', '/');
const refused = command => devPlanShellRefusalHit(command, root, deps)?.lane === 'opaque-script-execution';
const admittedByClosedArgv = command => isSanctionedLifecycleCommand(command, root, deps) && devPlanShellRefusalHit(command, root, deps) === null;

test('AC-207 point 1: emitted lifecycle commands (native spelling) are admitted by closed argv in the draft lifecycle', () => {
  for (const tail of ['inspect', 'reopen-design --by X', `cancel-submitted-plan --by X --submission-sha256 ${sha}`]) {
    assert.equal(admittedByClosedArgv(`node ${q(state)} ${tail}`), true, tail);
  }
});

test('AC-207 point 1 control: admission stays closed (altered argv, foreign script)', () => {
  assert.equal(refused(`node ${q(state)} inspect --extra`), true);
  assert.equal(refused(`node ${q(state)} cancel-submitted-plan --by X --submission-sha256 short`), true);
  assert.equal(refused(`node ${q(join(root, 'hostile.mjs'))} inspect`), true);
});

test('AC-207 point 1: forward-slash and MSYS spellings of an emitted command are normalised before matching', () => {
  for (const spell of [forward, msys]) {
    assert.equal(admittedByClosedArgv(`node ${q(spell(state))} inspect`), true, `inspect ${spell.name}`);
    assert.equal(admittedByClosedArgv(`node ${q(spell(state))} reopen-design --by X`), true, `reopen-design ${spell.name}`);
  }
});

// PO decision 2026-10-16 #10 (A): the admission lives in sanctioned-args-scripts.mjs (commit-protected;
// signature-bound patch scratch/patches/P22-03B.patch). The two positive cases pass.
const cont = (verb, tail) => `node ${q(state)} ${verb} ${tail}`;
const goodTail = '--expected-revision 3 --request-file scratch/req.json --lock-token tok-1.A_b';

test('AC-207 point 1: continuity-cas and continuity-integrate-final in the exact closed grammar are admitted', () => {
  for (const verb of ['continuity-cas', 'continuity-integrate-final']) {
    assert.equal(admittedByClosedArgv(cont(verb, goodTail)), true, verb);
    assert.equal(admittedByClosedArgv(cont(verb, '--lock-token x --request-file scratch/r-1.json --expected-revision absent')), true, `${verb} reordered/absent`);
  }
});

test('AC-207 point 1 control: continuity near-misses stay refused', () => {
  const nears = {
    'unknown verb': cont('continuity-other', goodTail),
    'integrate-final bare verb': cont('integrate-final', goodTail),
    '--root': cont('continuity-cas', `--root ${q(root)}`),
    'extra flag': cont('continuity-cas', `${goodTail} --force`),
    'repeated flag': cont('continuity-cas', `${goodTail} --lock-token y`),
    'request outside scratch': cont('continuity-cas', '--expected-revision 1 --request-file docs/r.json --lock-token t'),
    'dotdot': cont('continuity-cas', '--expected-revision 1 --request-file scratch/../r.json --lock-token t'),
    'absolute': cont('continuity-cas', '--expected-revision 1 --request-file /tmp/r.json --lock-token t'),
    'nested scratch': cont('continuity-cas', '--expected-revision 1 --request-file scratch/a/r.json --lock-token t'),
    'bad revision': cont('continuity-cas', '--expected-revision -1 --request-file scratch/r.json --lock-token t'),
    'env prefix': `FOO=1 ${cont('continuity-cas', goodTail)}`,
    'composed': `${cont('continuity-cas', goodTail)} && echo x`,
  };
  for (const [name, command] of Object.entries(nears)) assert.equal(admittedByClosedArgv(command), false, name);
});

test('AC-207 point 2: exactly `node scratch/<name>.mjs` is admitted in the draft lifecycle', () => {
  assert.equal(refused('node scratch/forensics.mjs'), false);
  assert.equal(refused('node scratch/a-b_c.1.mjs'), false);
});

test('AC-207 point 2 control: scratch-script near-misses stay refused', () => {
  for (const command of ['node scratch/forensics.mjs arg', 'node scratch/sub/x.mjs', 'node scratch/x.js', 'node scratch/../src/x.mjs', 'node src/x.mjs', 'node /tmp/x.mjs']) {
    assert.equal(refused(command), true, command);
  }
});

test('AC-207 point 2: the recovery-prescribed repository checker is admitted by its absolute spelling', () => {
  assert.equal(admittedByClosedArgv(`node ${q(join(root, 'harness/scripts/check-observation-governance.mjs'))}`), true);
});

test('AC-207 point 2: the checker as the recovery text spells it (repository-relative) is admitted', () => {
  assert.equal(admittedByClosedArgv('node harness/scripts/check-observation-governance.mjs'), true);
});

test('AC-207 point 3: onboarding scaffold paths are committable in the draft lifecycle (control: scratch is)', async (t) => {
  const verdict = path => evaluateStagedDevPlanPaths({ projectDir: root, stagedPaths: [path] }).code;
  assert.equal(verdict('scratch/x'), 'PIPELINE-STAGED-LIFECYCLE-ALLOW');
  // One independent sub-assertion per scaffold path (no stop-at-first).
  for (const path of ['.gitignore', 'AGENTS.md', 'architecture/a.md', 'pipeline.user.yaml', 'project/pipeline.json']) {
    await t.test(`scaffold path ${path}`, () => {
      assert.equal(verdict(path), 'PIPELINE-STAGED-LIFECYCLE-ALLOW', path);
    });
  }
});

test('AC-207 point 3 control: traversal and look-alike spellings of scaffold paths stay blocked in draft', async (t) => {
  const verdict = path => evaluateStagedDevPlanPaths({ projectDir: root, stagedPaths: [path] }).code;
  for (const path of ['AGENTS.md.bak', 'sub/AGENTS.md', 'project/../src/a.ts', 'architecture/../src/a.ts', 'projects/a.md', '.gitignore.x']) {
    await t.test(`blocked ${path}`, () => {
      // Traversal spellings fail closed as UNAVAILABLE (non-canonical path); look-alikes are BLOCKED.
      assert.notEqual(verdict(path), 'PIPELINE-STAGED-LIFECYCLE-ALLOW', path);
      assert.match(verdict(path), /^PIPELINE-STAGED-LIFECYCLE-(BLOCKED|UNAVAILABLE)$/u, path);
    });
  }
});

test('AC-207 point 3 control: a real implementation path stays blocked in draft', () => {
  assert.equal(evaluateStagedDevPlanPaths({ projectDir: root, stagedPaths: ['src/a.ts'] }).code, 'PIPELINE-STAGED-LIFECYCLE-BLOCKED');
});

test('AC-207 point 4: the F6 recovery checker and repair map are reachable without an override (absolute argv)', () => {
  assert.equal(admittedByClosedArgv(`node ${q(constants.REPAIR_MAP_SCRIPT)}`), true);
  assert.equal(admittedByClosedArgv(`node ${q(join(root, 'harness/scripts/check-observation-governance.mjs'))}`), true);
});

// Typed conditional skip: the case is the native Windows Git Bash end-to-end run, which no host has implemented yet.
// The reason names the host class, so a reader sees what is missing instead of an empty body.
test('AC-207 point 5: design-course end-to-end on Git Bash reaches present-plan with zero overrides', (t) => {
  t.skip(process.platform === 'win32'
    ? 'not implemented: the native Windows Git Bash end-to-end run still has to be written on this host class (AC-207 point 5, owner Coordinator, PO decision K7)'
    : `host-limitation: the Git Bash end-to-end run needs a native Windows host with Git for Windows; this host is ${process.platform} (owner Coordinator, PO decision K7). The POSIX admission of every prescribed verb is pinned by catalogue-admit-prescribed-lifecycle-verbs.test.mjs.`);
});


// ---- D64 (0.7.0, major): index changes, working-tree changes and pure observations are classified separately ----
// An unstage of Pipeline-generated files is an index change, not a working-tree write: it must cross the devplan shell
// lane, while every form that can put different bytes in the working tree stays refused.
const draftLaneHit = command => devPlanShellRefusalHit(command, root, deps);

test('D64 index-only git forms are not working-tree writes: the unstage of generated files crosses the draft shell lane', () => {
  for (const command of [
    'git restore --staged -- src/generated.ts',
    'git restore --staged src/generated.ts src/other.ts',
    'git restore -S -- src/generated.ts',
    'git restore --source=HEAD --staged -- src/generated.ts',
    'git restore --source HEAD --staged -- src/generated.ts',
    'git reset -q -- src/generated.ts',
    'git reset HEAD -- src/generated.ts',
    'git reset --mixed HEAD -- src/generated.ts',
    'git rm --cached src/generated.ts',
    'git rm -r --cached -- src',
  ]) assert.equal(draftLaneHit(command), null, command);
});

test('D64 control: every git form that can change working-tree bytes stays refused as a working-tree write', () => {
  for (const command of [
    'git restore src/generated.ts',
    'git restore --worktree src/generated.ts',
    'git restore --staged --worktree src/generated.ts',
    'git restore -SW src/generated.ts',
    'git restore -S -W src/generated.ts',
    'git restore --stag src/generated.ts',
    'git restore --staged --patch src/generated.ts',
    'git restore --source=HEAD src/generated.ts',
    'git checkout -- src/generated.ts',
    'git checkout HEAD -- src/generated.ts',
    'git reset --hard -- src/generated.ts',
    'git reset --merge src/generated.ts',
    'git rm src/generated.ts',
    'git rm --force src/generated.ts',
    'git clean -f src/generated.ts',
    'git stash push src/generated.ts',
  ]) assert.equal(draftLaneHit(command)?.lane, 'git-working-tree-write', command);
});

// State machine (D64): run the proposed action, retry the original, show progress. A recovery whose retry meets the same
// refusal fails. Real git in a disposable repository; the verdict is the real draft shell lane.
function recoveryMakesProgress({ original, recoveries, execute, observe }) {
  const first = draftLaneHit(original);
  if (first === null) return { admittedFirst: true, progress: true };
  for (const recovery of recoveries) {
    assert.equal(draftLaneHit(recovery), null, `the named recovery must itself be admitted: ${recovery}`);
    execute(recovery);
  }
  const retry = draftLaneHit(original);
  return { admittedFirst: false, progress: retry === null || retry.lane !== first.lane || observe() };
}

test('D64 state machine: unstaging generated files makes progress on the first try and leaves the working tree untouched', async () => {
  const { spawnSync } = await import('node:child_process');
  const { readFileSync, existsSync } = await import('node:fs');
  const repoDir = mkdtempSync(join(repo, 'scratch', 'alf-d64-index-'));
  try {
    const git = (...args) => spawnSync('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', ...args], { cwd: repoDir, encoding: 'utf8' });
    assert.equal(git('init', '-q').status, 0);
    // `git restore --staged` needs a resolvable HEAD: give the disposable repository one empty base commit.
    assert.equal(git('commit', '-q', '--allow-empty', '-m', 'fixture base').status, 0);
    mkdirSync(join(repoDir, 'src'), { recursive: true });
    writeFileSync(join(repoDir, 'src/generated.ts'), 'generated bytes\n');
    assert.equal(git('add', '--', 'src/generated.ts').status, 0);
    assert.match(git('diff', '--cached', '--name-only').stdout, /src\/generated\.ts/u, 'precondition: the file is staged');
    const original = 'git restore --staged -- src/generated.ts';
    const outcome = recoveryMakesProgress({
      original, recoveries: [], execute: () => {}, observe: () => false,
    });
    assert.equal(outcome.admittedFirst, true, 'the unstage is admitted without any recovery or override');
    const words = original.split(' ').slice(1);
    assert.equal(git(...words).status, 0, 'the admitted command really runs');
    assert.equal(git('diff', '--cached', '--name-only').stdout.trim(), '', 'progress: nothing is staged any more');
    assert.equal(readFileSync(join(repoDir, 'src/generated.ts'), 'utf8'), 'generated bytes\n', 'the working-tree bytes are untouched');
    assert.equal(existsSync(join(repoDir, 'src/generated.ts')), true);
    // The identical retry meets no refusal (the loop of the observed run is gone).
    assert.equal(draftLaneHit(original), null);
  } finally { rmSync(repoDir, { recursive: true, force: true }); }
});

test('D64 state machine harness fails a recovery whose retry meets the same refusal', () => {
  const original = 'git restore src/generated.ts';
  const outcome = recoveryMakesProgress({
    original, recoveries: ['node scratch/forensics.mjs'], execute: () => {}, observe: () => false,
  });
  assert.equal(outcome.admittedFirst, false);
  assert.equal(outcome.progress, false, 'the same refusal after the recovery is no progress');
});

// ---- D64 (0.7.0, blocker): one integration walk with the REAL guards from a fresh repository to the first implementation dispatch ----
// Every command is spelled exactly as the Pipeline itself renders it (the absolute node executable first, then the script and its
// closed argv) and is put through the real lifecycle-ready guard (guard-lifecycle-ready main) AND the real dev-plan shell lane.
// There is no override: the recording seam answers `ineligible`, so a refusal is a refusal. Any prescribed command a real guard
// still refuses makes this test RED with the exact command and code in its message.
const walkQuote = value => `'${value.replaceAll("'", "'\"'\"'")}'`;
const walkRender = action => [action.executable, ...action.argv].map(walkQuote).join(' ');
const walkAction = (...argv) => ({ executable: process.execPath, argv });
const walkDigest = value => createHash('sha256').update(value).digest('hex');

async function walkSteps(f, { actualGuard }) {
  const { PIPELINE_STATE_SCRIPT, DESIGN_REVIEW_RECEIPT_SCRIPT, MODEL_ROLE_DISPATCH_SELECT_SCRIPT, REGISTER_FEATURE_PACKAGE_SCRIPT, ARCHITECTURE_BASELINE_SCRIPT } = constants;
  const steps = [];
  const check = (label, action) => {
    const rendered = walkRender(action);
    const guard = actualGuard(action, f.root);
    const lane = devPlanShellRefusalHit(rendered, f.root, deps);
    steps.push({ label, rendered, code: guard.code, stderr: guard.stderr, lane: lane?.lane ?? null });
    return guard.code === 0 && lane === null;
  };
  const stateCmd = (...argv) => walkAction(PIPELINE_STATE_SCRIPT, ...argv);
  const out = [];
  const capture = fn => { const lines = []; const before = console.log; console.log = (...v) => lines.push(v.join(' ')); try { return { code: fn(), stdout: lines.join('\n') }; } finally { console.log = before; } };

  // 1. the state readback and the next action inspect renders in the submitted (design, awaiting-approval) state
  check('inspect', stateCmd('inspect'));
  const inspected = capture(() => run(['inspect'], f.deps));
  const next = JSON.parse(inspected.stdout).nextAction;
  if (next?.kind === 'command') check(`inspect next action (${next.code ?? next.kind})`, { executable: next.executable, argv: next.argv });
  // 2. route selection, architecture materialization and baseline diagnosis, documented help
  check('route selection', walkAction(MODEL_ROLE_DISPATCH_SELECT_SCRIPT, '--repo-root', f.root, '--runner', 'codex', '--task-route', 'profile.critic.review'));
  check('architecture materialization', stateCmd('materialize-architecture'));
  check('architecture baseline diagnosis', walkAction(ARCHITECTURE_BASELINE_SCRIPT, '--root', f.root));
  check('pipeline-state --help', stateCmd('--help'));
  // 3. the design-review receipt, produced for real through the spelling the guard admitted
  mkdirSync(join(f.root, 'specs', f.featureId, 'review'), { recursive: true });
  const reportPath = `specs/${f.featureId}/review/design-review-1.md`;
  const receiptPath = `specs/${f.featureId}/review/design-review-receipt-1.json`;
  writeFileSync(join(f.root, reportPath), '# Critic report\n\nVerdict: PASS\n');
  const create = walkAction(DESIGN_REVIEW_RECEIPT_SCRIPT, 'create', '--repo', f.root, '--feature', f.featureId, '--report', reportPath,
    '--prd', f.sources.prd.path, '--spec', f.sources.spec.path, '--out', receiptPath);
  const createAdmitted = check('design-review receipt (initial)', create);
  if (createAdmitted) {
    const made = spawnSync(create.executable, create.argv, { cwd: f.root, encoding: 'utf8', env: { ...process.env, CLAUDECODE: '1' } });
    out.push({ label: 'receipt producer executes', ok: made.status === 0 && existsSync(join(f.root, receiptPath)), detail: `${made.status} ${made.stderr}` });
  }
  // sanitized report: the producer's optional original-report form (D64 digest pair) must be admitted too
  writeFileSync(join(f.root, `specs/${f.featureId}/review/design-review-1.original.md`), 'original report\n');
  check('design-review receipt (sanitized report pair)', walkAction(DESIGN_REVIEW_RECEIPT_SCRIPT, 'create', '--repo', f.root, '--feature', f.featureId, '--report', reportPath,
    '--original-report', `specs/${f.featureId}/review/design-review-1.original.md`, '--prd', f.sources.prd.path, '--spec', f.sources.spec.path, '--out', `specs/${f.featureId}/review/design-review-receipt-2.json`));
  check('design-review receipt (delta)', walkAction(DESIGN_REVIEW_RECEIPT_SCRIPT, 'create', '--repo', f.root, '--feature', f.featureId, '--report', reportPath,
    '--prd', f.sources.prd.path, '--spec', f.sources.spec.path, '--previous', receiptPath, '--open-finding', 'F-1', '--out', `specs/${f.featureId}/review/design-review-receipt-3.json`));
  // 4. present-plan, then the approval transport in the spelling inspect renders after a presentation, then the phase switch
  check('present-plan', stateCmd('present-plan', '--by', 'Fixture', '--review-receipt', receiptPath));
  mkdirSync(join(f.root, 'scratch'), { recursive: true });
  const requestPath = `scratch/design-approval-request-${walkDigest('request')}.json`;
  writeFileSync(join(f.root, requestPath), '{}\n');
  check('approve-plan (signature transport)', stateCmd('approve-plan', '--design-approval-request', requestPath));
  check('approve-plan (attributed transport)', stateCmd('approve-plan', '--by', 'Fixture PO', '--design-approval-request', requestPath));
  check('set-phase implementation', stateCmd('set-phase', '--phase', 'implementation'));
  // 5. feature-package registration, the last step before the first implementation dispatch
  check('feature-package registration', walkAction(REGISTER_FEATURE_PACKAGE_SCRIPT, '--root', f.root));
  return { steps, out };
}

test('D64 integration: from a fresh repository to the first implementation dispatch every prescribed command is admitted by the real guards with zero overrides', async () => {
  const hooks = await import(new URL('../../hooks/design-course-command-admission.test.mjs', import.meta.url));
  const f = hooks.fixture('feature');
  try {
    const { steps, out } = await walkSteps(f, hooks);
    const refusedSteps = steps.filter(step => step.code !== 0 || step.lane !== null);
    assert.deepEqual(refusedSteps.map(step => `${step.label}: guard exit ${step.code}${step.lane ? `, dev-plan lane ${step.lane}` : ''}; command: ${step.rendered}; ${String(step.stderr).split('\n')[0]}`), [],
      'a prescribed command is still refused by a real guard: report each with the file that must change');
    assert.deepEqual(out.filter(entry => !entry.ok).map(entry => `${entry.label}: ${entry.detail}`), []);
    assert.equal(steps.length >= 13, true, 'the walk covers every prescribed step');
  } finally { f.cleanup(); }
});

test('D64 integration (implementation boundary): the next action inspect renders after approval is admitted by the real guards as spelled, absolute node executable included', async () => {
  const { prepareApprovedItemCourseFixture } = await import(new URL('../test-item-approved-course-fixture.mjs', import.meta.url));
  const approvedRoot = mkdtempSync(join(repo, 'scratch', 'alf-k11-approved-'));
  const quiet = fn => { const before = console.log; console.log = () => {}; try { return fn(); } finally { console.log = before; } };
  try {
    quiet(() => prepareApprovedItemCourseFixture({ root: approvedRoot }));
    const lines = [];
    const before = console.log; console.log = (...v) => lines.push(v.join(' '));
    try { assert.equal(run(['inspect'], { dir: approvedRoot, architectureEntryReadiness: () => ({ status: 'ready' }) }), 0); } finally { console.log = before; }
    const inspected = JSON.parse(lines.join('\n'));
    assert.equal(inspected.status, 'implementing');
    const next = inspected.nextAction;
    assert.equal(next.kind, 'command', JSON.stringify(next));
    assert.equal(next.executable, process.execPath, 'the rendered executable is the absolute node path');
    const action = { executable: next.executable, argv: next.argv };
    // The fixture project is not governance-enforced, so the guard hooks would not run at all there; the closed-argv verdict is what an enforced,
    // not-ready project applies to the same rendered command, and that is what must admit it.
    assert.equal(isSanctionedLifecycleCommand(walkRender(action), approvedRoot), true, `the closed-argv catalogue refuses the command the Pipeline itself renders after approval: ${walkRender(action)}`);
    assert.equal(devPlanShellRefusalHit(walkRender(action), approvedRoot, deps), null, `${walkRender(action)} is refused by the dev-plan shell lane after approval`);
  } finally { rmSync(approvedRoot, { recursive: true, force: true }); }
});
