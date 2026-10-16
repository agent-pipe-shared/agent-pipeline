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

test('AC-207 point 1 [RED]: forward-slash and MSYS spellings of an emitted command are normalised before matching', () => {
  for (const spell of [forward, msys]) {
    assert.equal(admittedByClosedArgv(`node ${q(spell(state))} inspect`), true, `inspect ${spell.name}`);
    assert.equal(admittedByClosedArgv(`node ${q(spell(state))} reopen-design --by X`), true, `reopen-design ${spell.name}`);
  }
});

// PO decision 2026-10-16 #10 (A): the admission lives in sanctioned-args-scripts.mjs (commit-protected;
// signature-bound patch scratch/patches/P22-03B.patch). The two positive cases are RED on HEAD until it lands.
const cont = (verb, tail) => `node ${q(state)} ${verb} ${tail}`;
const goodTail = '--expected-revision 3 --request-file scratch/req.json --lock-token tok-1.A_b';

test('AC-207 point 1 [RED until protected patch P22-03B]: continuity-cas and continuity-integrate-final in the exact closed grammar are admitted', () => {
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

test('AC-207 point 2 [RED]: the checker as the recovery text spells it (repository-relative) is admitted', () => {
  assert.equal(admittedByClosedArgv('node harness/scripts/check-observation-governance.mjs'), true);
});

test('AC-207 point 3 [RED]: onboarding scaffold paths are committable in the draft lifecycle (control: scratch is)', async (t) => {
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

test('AC-207 point 5: design-course end-to-end on Git Bash reaches present-plan with zero overrides', { skip: 'held: needs the Windows Git Bash end-to-end run; owner Coordinator, due 2026-10-19 (Linux/WSL run, PO decision K7)' }, () => {});
