// SPDX-License-Identifier: SUL-1.0
import assert from 'node:assert/strict';
import { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { registerTestCaseCompletion } from './test-case-completion.mjs';
const cases = [];
function test(id, name, run) {
  cases.push({ id, name, run });
}
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { captureEvidence } from '../scripts/capture-evidence.mjs';
import { produceCriticDiagnostic } from './critic-diagnostic-producer.mjs';
import { validateCriticDiagnostic, diagnosticDigest, CRITIC_DIAGNOSTIC_SCHEMA } from './critic-diagnostic-evidence.mjs';
import { planVerifySelection, verifyEvidenceSatisfiesBoundary } from './verify-selection.mjs';
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const scratch = join(repoRoot, 'scratch'); mkdirSync(scratch, { recursive: true });
const work = mkdtempSync(join(scratch, 'critic-capture-header-'));
after(() => rmSync(work, { recursive: true, force: true }));
const cliScript = fileURLToPath(new URL('../scripts/critic-diagnostic-evidence.mjs', import.meta.url));
function git(root, args) {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr); return r.stdout.trim();
}
function fixture(context, ignoreEvidence = true) {
  const root = mkdtempSync(join(work, 'case-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '-q']);
  writeFileSync(join(root, 'spec.md'), 'Frozen specification\n');
  writeFileSync(join(root, 'guard.md'), 'Frozen guardrail\n');
  writeFileSync(join(root, '.gitignore'), ignoreEvidence ? 'evidence/\n' : '');
  git(root, ['add', '--', 'spec.md', 'guard.md', '.gitignore']);
  git(root, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture']);
  return { root, candidate: { commit: git(root, ['rev-parse', 'HEAD']), tree: git(root, ['rev-parse', 'HEAD^{tree}']) } };
}
const command = [process.execPath, '-e', "console.log('actual failed targeted output'); console.error('actual stderr'); process.exit(7)"];
const options = f => ({ root: f.root, specPath: 'spec.md', guardrailPaths: ['guard.md'], command, label: 'targeted-check', logPath: 'evidence/targeted.log' });
function captured(f) {
  const result = captureEvidence({ command, label: 'targeted-check', out: 'evidence/captured.log', cwd: f.root, repoRoot: f.root });
  assert.equal(result.exitCode, 7);
  const bytes = readFileSync(result.out), text = bytes.toString('utf8');
  assert.ok(text.includes(`\nhead: ${f.candidate.commit}\ntree: ${f.candidate.tree}\ndirty: false\n--- stdout ---\n`));
  assert.ok(text.includes('actual failed targeted output')); assert.ok(text.includes('actual stderr'));
  const ref = path => ({ path, sha256: diagnosticDigest(readFileSync(join(f.root, path))) });
  const value = { schema: CRITIC_DIAGNOSTIC_SCHEMA, producer: 'critic-diagnostic-evidence', assurance: 'captured-process-output-not-host-attested', candidate: f.candidate, spec: ref('spec.md'), guardrails: [ref('guard.md')], fullVerify: { status: 'not-run', evidence: null }, targeted: { label: 'targeted-check', status: 'failed', exitCode: 7, log: ref('evidence/captured.log') }, pending: ['full-verify'] };
  assert.equal(value.targeted.log.sha256, diagnosticDigest(bytes));
  writeFileSync(join(f.root, 'evidence/reader-input.json'), JSON.stringify(value, null, 2) + '\n');
  return { value, bytes };
}
test('CDH001', 'reader accepts an actual failed identity-bearing capture with matching candidate and digest', (context) => {
  const f = fixture(context), { value } = captured(f);
  const result = validateCriticDiagnostic(value, f);
  assert.equal(result.targeted.status, 'failed'); assert.equal(result.targeted.exitCode, 7);
  assert.equal(result.fullVerify, 'not-run'); assert.deepEqual(result.pending, ['full-verify']);
  for (const boundary of ['candidate', 'push', 'release']) assert.equal(verifyEvidenceSatisfiesBoundary(value, boundary), false);
});
test('CDH002', 'producer returns honest diagnostic evidence after executing a failed process', (context) => {
  const f = fixture(context);
  const value = produceCriticDiagnostic(options(f));
  assert.equal(value.targeted.exitCode, 7); assert.equal(value.targeted.status, 'failed');
  assert.equal(value.fullVerify.status, 'not-run'); assert.deepEqual(value.pending, ['full-verify']);
  assert.equal(validateCriticDiagnostic(value, f).targeted.status, 'failed');
});
test('CDH003', 'digest, label, exit and candidate/source bindings remain closed', (context) => {
  const f = fixture(context), { value } = captured(f);
  const controls = [
    ['wrong-digest', v => v.targeted.log.sha256 = 'f'.repeat(64), 'CDI-DIGEST'],
    ['wrong-label', v => v.targeted.label = 'different-check', 'CDI-DIGEST'],
    ['wrong-exit', v => v.targeted.exitCode = 8, 'CDI-DIGEST'],
    ['contradictory-exit', v => v.targeted.exitCode = 0, 'CDI-TARGETED'],
    ['wrong-candidate', v => v.candidate.commit = 'f'.repeat(40), 'CDI-BINDING'],
    ['wrong-tree', v => v.candidate.tree = 'f'.repeat(40), 'CDI-BINDING'],
    ['wrong-spec', v => v.spec.sha256 = 'f'.repeat(64), 'CDI-SOURCE-DIGEST'],
    ['wrong-guardrail', v => v.guardrails[0].sha256 = 'f'.repeat(64), 'CDI-SOURCE-DIGEST'],
    ['extra-envelope-field', v => v.extra = true, 'CDI-BINDING'],
  ];
  const observations = [];
  for (const [name, mutate, code] of controls) {
    const bad = structuredClone(value); mutate(bad);
    assert.throws(() => validateCriticDiagnostic(bad, f), e => { observations.push({ name, observedCode: e.code }); return e.code === code; });
  }
  writeFileSync(join(f.root, 'evidence/control-results.json'), JSON.stringify(observations, null, 2) + '\n');
});
test('CDH004', 'malformed or extra capture identity headers remain rejected even with recomputed digest', (context) => {
  const f = fixture(context), { value, bytes } = captured(f);
  const text = bytes.toString('utf8');
  const mutations = [
    ['malformed-head', text.replace(`head: ${f.candidate.commit}`, 'head: invalid')],
    ['wrong-header-head', text.replace(`head: ${f.candidate.commit}`, `head: ${'f'.repeat(40)}`)],
    ['wrong-header-tree', text.replace(`tree: ${f.candidate.tree}`, `tree: ${'f'.repeat(40)}`)],
    ['malformed-dirty', text.replace('dirty: false', 'dirty: maybe')],
    ['extra-header', text.replace('--- stdout ---', 'unexpected: field\n--- stdout ---')],
    ['duplicate-head', text.replace('dirty: false', `head: ${f.candidate.commit}\ndirty: false`)],
    ['missing-stderr', text.replace('--- stderr ---', 'missing stderr')],
  ];
  for (const [name, changed] of mutations) {
    const path = `evidence/${name}.log`; writeFileSync(join(f.root, path), changed);
    const bad = structuredClone(value); bad.targeted.log = { path, sha256: diagnosticDigest(changed) };
    assert.throws(() => validateCriticDiagnostic(bad, f), /CDI-DIGEST/);
  }
});
test('CDH005', 'selection integrity and diagnostic-only boundary remain checked', (context) => {
  const f = fixture(context);
  const selection = planVerifySelection({ mode: 'critic', candidateCommit: f.candidate.commit, registeredSuiteIds: ['check'], policy: { schema: 'pipeline.verify-selection.v1', baseline: ['check'], areas: [{ id: 'all', paths: ['**'], suites: ['check'] }] } });
  const value = { schema: 'pipeline.verify-evidence.v0', ...f.candidate, selection, exitCode: 7, steps: [{ name: 'check', exitCode: 7 }] };
  const { inspectCriticVerifyDiagnostic } = diagnosticExports;
  assert.equal(inspectCriticVerifyDiagnostic(value, f.candidate).status, 'failed');
  assert.throws(() => inspectCriticVerifyDiagnostic({ ...value, selection: { ...selection, selectionSha256: 'f'.repeat(64) } }, f.candidate), /CDI-VERIFY/);
  assert.throws(() => inspectCriticVerifyDiagnostic({ ...value, selection: { ...selection, extra: true } }, f.candidate), /CDI-VERIFY/);
  for (const boundary of ['critic', 'candidate', 'push', 'release']) assert.equal(verifyEvidenceSatisfiesBoundary(value, boundary), false);
});
import * as diagnosticExports from './critic-diagnostic-evidence.mjs';
test('CDH006', 'real producer rejects absent execution, dirty candidate, and existing output without replacing bytes', (context) => {
  const f = fixture(context);
  assert.throws(() => produceCriticDiagnostic({ ...options(f), command: [] }), /CDI-CAPTURE-INPUT/);
  assert.throws(() => produceCriticDiagnostic({ ...options(f), command: ['pipeline-fixture-no-such-executable'] }), /did not run to completion/);
  assert.equal(existsSync(join(f.root, 'evidence/targeted.log')), false);
  mkdirSync(join(f.root, 'evidence'), { recursive: true });
  const sentinel = 'existing evidence must survive\n'; writeFileSync(join(f.root, 'evidence/targeted.log'), sentinel);
  assert.throws(() => produceCriticDiagnostic(options(f)), /CDI-OUTPUT-EXISTS/);
  assert.equal(readFileSync(join(f.root, 'evidence/targeted.log'), 'utf8'), sentinel);
  writeFileSync(join(f.root, 'spec.md'), 'dirty');
  assert.throws(() => produceCriticDiagnostic({ ...options(f), logPath: 'evidence/dirty.log' }), /CDI-DIRTY-CANDIDATE/);
  assert.equal(existsSync(join(f.root, 'evidence/dirty.log')), false);
});
test('CDH007', 'real CLI emits output and repeat invocation preserves both output artifacts', (context) => {
  const f = fixture(context), script = cliScript;
  const args = [script, '--root', f.root, '--spec', 'spec.md', '--guardrail', 'guard.md', '--log', 'evidence/cli.log', '--out', 'evidence/cli.json', '--', ...command];
  const r = spawnSync(process.execPath, args, { encoding: 'utf8' });
  writeFileSync(join(f.root, 'evidence/cli-process.json'), JSON.stringify({ status: r.status, stdout: r.stdout, stderr: r.stderr }, null, 2) + '\n');
  assert.equal(r.status, 0, r.stderr);
  const log = readFileSync(join(f.root, 'evidence/cli.log')), output = readFileSync(join(f.root, 'evidence/cli.json'));
  const value = JSON.parse(output); assert.equal(value.targeted.exitCode, 7); assert.equal(validateCriticDiagnostic(value, f).targeted.status, 'failed');
  assert.equal(JSON.parse(r.stdout).releaseQualified, false);
  assert.notEqual(spawnSync(process.execPath, args).status, 0);
  assert.deepEqual(readFileSync(join(f.root, 'evidence/cli.log')), log); assert.deepEqual(readFileSync(join(f.root, 'evidence/cli.json')), output);
});
test('CDH008', 'CLI refuses preexisting JSON output before process or log creation', (context) => {
  const f = fixture(context); mkdirSync(join(f.root, 'evidence'));
  const sentinel = 'preserve output\n'; writeFileSync(join(f.root, 'evidence/cli.json'), sentinel);
  const script = cliScript;
  const args = [script, '--root', f.root, '--spec', 'spec.md', '--log', 'evidence/cli.log', '--out', 'evidence/cli.json', '--', ...command];
  const r = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.notEqual(r.status, 0); assert.ok(r.stderr.includes('CDI-OUTPUT-EXISTS'));
  assert.equal(readFileSync(join(f.root, 'evidence/cli.json'), 'utf8'), sentinel); assert.equal(existsSync(join(f.root, 'evidence/cli.log')), false);
});

// Integration contract: capture status includes untracked evidence; producer
// candidate protection checks tracked changes before and after actual execution.
test('CDH009', 'real producer permits untracked evidence while refusing tracked mutations before and during capture', (context) => {
  const before = fixture(context, false);
  writeFileSync(join(before.root, 'spec.md'), 'tracked mutation before capture\n');
  const markerCommand = [process.execPath, '-e', "require('node:fs').mkdirSync('evidence', { recursive: true }); require('node:fs').writeFileSync('evidence/process-ran', 'ran'); process.exit(7)"];
  assert.throws(() => produceCriticDiagnostic({ ...options(before), command: markerCommand, logPath: 'evidence/before.log' }), /CDI-DIRTY-CANDIDATE/);
  assert.equal(existsSync(join(before.root, 'evidence/process-ran')), false);
  assert.equal(existsSync(join(before.root, 'evidence/before.log')), false);

  const during = fixture(context, false);
  const mutatingCommand = [process.execPath, '-e', "require('node:fs').writeFileSync('spec.md', 'tracked mutation during capture\\n'); console.log('actual tracked mutation'); process.exit(7)"];
  assert.throws(() => produceCriticDiagnostic({ ...options(during), command: mutatingCommand, logPath: 'evidence/during.log' }), /CDI-DIRTY-CANDIDATE/);
  assert.equal(readFileSync(join(during.root, 'spec.md'), 'utf8'), 'tracked mutation during capture\n');
  assert.ok(readFileSync(join(during.root, 'evidence/during.log'), 'utf8').includes('actual tracked mutation'));
  assert.equal(git(during.root, ['rev-parse', 'HEAD']), during.candidate.commit);
  assert.equal(git(during.root, ['diff', '--name-only', during.candidate.commit, '--']), 'spec.md');

  const f = fixture(context, false);
  mkdirSync(join(f.root, 'evidence'));
  const publicEvidence = 'existing public fixture evidence\n';
  writeFileSync(join(f.root, 'evidence/dispatch-record.json'), publicEvidence);
  assert.equal(git(f.root, ['status', '--porcelain=v1']), '?? evidence/');
  assert.equal(git(f.root, ['diff', '--name-only', f.candidate.commit, '--']), '');
  assert.equal(git(f.root, ['rev-parse', 'HEAD']), f.candidate.commit);
  assert.equal(git(f.root, ['rev-parse', 'HEAD^{tree}']), f.candidate.tree);
  const value = produceCriticDiagnostic(options(f));
  assert.equal(readFileSync(join(f.root, 'evidence/dispatch-record.json'), 'utf8'), publicEvidence);
  const log = readFileSync(join(f.root, value.targeted.log.path));
  assert.ok(log.toString('utf8').includes('\ndirty: true\n--- stdout ---\n'));
  assert.equal(value.targeted.log.sha256, diagnosticDigest(log));
  assert.deepEqual(value.candidate, f.candidate);
  assert.equal(value.targeted.status, 'failed'); assert.equal(value.targeted.exitCode, 7);
  assert.equal(value.fullVerify.status, 'not-run'); assert.deepEqual(value.pending, ['full-verify']);
  assert.equal(validateCriticDiagnostic(value, f).targeted.status, 'failed');
  assert.equal(git(f.root, ['diff', '--name-only', f.candidate.commit, '--']), '');
  for (const boundary of ['candidate', 'push', 'release']) assert.equal(verifyEvidenceSatisfiesBoundary(value, boundary), false);
});

// Direct Node execution preserves the inherited Verify completion descriptor.
registerTestCaseCompletion({ cases, fd: 3, maxBytes: 8192 });
