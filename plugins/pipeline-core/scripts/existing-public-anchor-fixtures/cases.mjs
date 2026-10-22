// SPDX-License-Identifier: SUL-1.0
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, lstatSync, realpathSync, readdirSync, chmodSync, unlinkSync, symlinkSync, linkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { applyInitialOnboardingAnswers, planExistingPublicTrustAnchorMaterialization as plan, applyExistingPublicTrustAnchorMaterialization as apply } from '../onboarding-init.mjs';
import { main } from '../project-onboarding-v3.mjs';
import { inspectProjectOnboardingV3, renderProjectOnboardingAction } from '../../lib/project-onboarding-v3.mjs';
import { readMachinePlane, writeMachinePlane, machinePlaneFilePath } from '../../lib/machine-plane.mjs';
import { resolveInitialAnswersState } from '../../lib/onboarding-initial-answers-state.mjs';
import { requireProjectOnboardingReady } from '../../lib/project-onboarding-ready-gate.mjs';
import { evaluateLifecycleReadyGuard } from '../../lib/guard/evaluate.mjs';
import { parseYaml } from '../../lib/yaml-lite.mjs';

const schema = 'pipeline.existing-public-trust-anchor-materialization.v1';
const anchor = Object.freeze({ keyReference: 'synthetic-public-authority', publicKeySha256: 'a'.repeat(64) });
const missingPolicy = '{\n  "schema": "pipeline.critical-human-proof-policy.v3",\n  "requiredKinds" : [ "push" ],\n  "waivedKinds" : [ ]\n}\n';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function file(path, value) { writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); chmodSync(path, 0o600); }
function snap(path) { const s = lstatSync(path); return { sha256: hash(readFileSync(path)), ino: String(s.ino), mode: s.mode & 0o777, nlink: s.nlink }; }
function snapshots(f) { return Object.fromEntries(f.readset.map(path => [path, snap(path)])); }
function unchanged(f, before, except = []) { for (const path of f.readset) if (!except.includes(path)) assert.deepEqual(snap(path), before[path]); }
function refused(result, code) { assert.equal(result.schema, schema); assert.equal(result.status, 'refused'); assert.equal(result.ok, false); assert.equal(result.code, code); assert.equal(result.stateDisposition, 'unchanged'); assert.equal(result.nextAction, null); }
function planned(f) { const p = plan({ rootDir: f.root, runner: 'claude' }); assert.equal(p.status, 'planned'); assert.equal(p.ok, true); assert.match(p.planSha256, /^[a-f0-9]{64}$/); return p; }
function cli(f, args) { let output = '', error = ''; const status = main(args, { deps: f.deps, env: process.env, write: s => { output += s; }, writeError: s => { error += s; } }); let value = null; if (status === 2) { assert.ok(output.includes('Usage: node plugins/pipeline-core/scripts/project-onboarding-v3.mjs ')); const parseError = output.trim().split('\n').at(-1); assert.match(parseError, /^(?:unknown argument: .+|existing public anchor command has an invalid closed argv shape|--plan-sha256 requires a lowercase SHA-256 digest)$/); } else if (output.trim()) value = JSON.parse(output); return { status, output, error, value }; }
async function fixture(id, { choice = 'signature', answer = true } = {}) {
  const parent = process.env.EPA_FIXTURE_PARENT;
  assert.ok(parent && realpathSync(parent) === parent);
  assert.equal(lstatSync(parent).mode & 0o077, 0);
  const caseParent = join(parent, id); mkdirSync(caseParent, { mode: 0o700 });
  process.env.PSBN_FIXTURE_PARENT = caseParent;
  // A fresh instance only avoids the original prefix's per-module cache. None of
  // its four already-qualified callback bodies are invoked.
  const prefix = await import(new URL('./stopped-project.mjs?epa=' + id, import.meta.url));
  const f = prefix.prepareStoppedClaudeProject();
  process.env.PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE = f.machineRoot;
  const source = parseYaml(readFileSync(join(f.root, 'pipeline.user.yaml'), 'utf8'));
  if (answer) {
    const result = applyInitialOnboardingAnswers({ rootDir: f.root, runner: 'claude', gitAuthorName: 'Synthetic Fixture', gitAuthorEmail: 'fixture@example.invalid', pushApproval: choice, language: source.language.human_facing, advisorExportConsent: 'declined', trustAnchor: null });
    assert.equal(result.ok, true, 'actual initial-answer producer must succeed');
    assert.equal(result.code, 'INITIAL-ANSWERS-APPLIED');
  }
  const keys = join(caseParent, 'configured-public-authority'); mkdirSync(keys, { mode: 0o700 });
  const authority = join(keys, 'trust-policy.json'); file(authority, anchor);
  const deps = { homedirFn: () => f.machineRoot };
  const observedPlane = readMachinePlane(deps);
  assert.ok(observedPlane.status === 'valid' || (!answer && observedPlane.status === 'absent'));
  const plane = observedPlane.status === 'valid' ? observedPlane.plane : { schema: 'pipeline.machine-plane.v1', poKeyDirectory: null, pushApprovalDefault: choice, routing: null, language: source.language.human_facing, session: null, usage: null, updatedAt: '2026-10-11T00:00:00.000Z' };
  writeMachinePlane({ ...plane, poKeyDirectory: keys, pushApprovalDefault: choice, language: source.language.human_facing, updatedAt: '2026-10-11T00:00:00.000Z' }, deps);
  const state = resolveInitialAnswersState(f.root, 'local', { requireGit: true });
  const pointer = join(dirname(state.receipt), 'po-key-directory.json');
  // This is disposable public metadata, not a setup/signature/authority grant.
  file(pointer, { schema: 'pipeline.po-key-directory.v1', poKeyDirectory: keys, updatedAt: '2026-10-11T00:00:00.000Z' });
  const policy = join(f.root, 'project', 'critical-human-proof.json');
  // Explicit controlled existing-policy layout. This is not evidence of an
  // actual historical installation or a Human-approved trust anchor.
  file(policy, missingPolicy);
  const machine = machinePlaneFilePath(deps);
  return { ...f, caseParent, keys, authority, pointer, policy, receipt: state.receipt, machine, readset: [state.receipt, join(f.root, 'pipeline.user.yaml'), join(f.root, 'project', 'pipeline.yaml'), machine, authority, pointer, policy].filter(path => answer || path !== state.receipt) };
}
async function isolated(id, fn, options) {
  const oldHome = process.env.PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE, oldParent = process.env.PSBN_FIXTURE_PARENT;
  try { return await fn(await fixture(id, options)); }
  finally { if (oldHome === undefined) delete process.env.PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE; else process.env.PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE = oldHome; if (oldParent === undefined) delete process.env.PSBN_FIXTURE_PARENT; else process.env.PSBN_FIXTURE_PARENT = oldParent; }
}

export const cases = [
  { id: 'EPA001', name: 'Actual initial answers and physical public configuration materialize only the first anchor', run: () => isolated('EPA001', f => {
    const before = snapshots(f), p = planned(f), result = apply(p);
    assert.equal(result.status, 'materialized'); assert.equal(result.ok, true); assert.equal(result.nextAction, null);
    assert.deepEqual(JSON.parse(readFileSync(f.policy, 'utf8')).trustAnchors, [anchor]);
    assert.notEqual(snap(f.policy).ino, before[f.policy].ino); unchanged(f, before, [f.policy]);
  }) },
  { id: 'EPA002', name: 'Verified same-anchor no-op retains policy inode and bytes', run: () => isolated('EPA002', f => {
    assert.equal(apply(planned(f)).status, 'materialized'); const before = snapshots(f);
    const result = apply(planned(f)); assert.equal(result.status, 'no-op'); assert.equal(result.alreadyComplete, true); unchanged(f, before);
  }) },
  { id: 'EPA003', name: 'Serialized plan and replay never reproduce the private single-use grant', run: () => isolated('EPA003', f => {
    const p = planned(f), before = snapshots(f); refused(apply(JSON.parse(JSON.stringify(p))), 'TRUST-ANCHOR-INVALID-PRIVATE-PLAN'); unchanged(f, before);
    assert.equal(apply(p).status, 'materialized'); const after = snapshots(f); refused(apply(p), 'TRUST-ANCHOR-INVALID-PRIVATE-PLAN'); unchanged(f, after);
  }) },
  { id: 'EPA004', name: 'Foreign root, runner and answer-choice disagreement refuse without effects', run: () => isolated('EPA004', f => {
    const original = readFileSync(f.receipt, 'utf8');
    for (const change of [{ root: f.caseParent }, { runner: 'codex' }, { pushApprovalPreference: 'chat' }]) {
      file(f.receipt, { ...JSON.parse(original), ...change }); const before = snapshots(f);
      refused(plan({ rootDir: f.root, runner: 'claude' }), 'TRUST-ANCHOR-INITIAL-ANSWERS-CONFLICT'); unchanged(f, before);
    }
    file(f.receipt, 'not-json'); const malformed = snapshots(f); refused(plan({ rootDir: f.root, runner: 'claude' }), 'TRUST-ANCHOR-EXISTING-AUTHORITY-UNAVAILABLE'); unchanged(f, malformed);
    const policy = snap(f.policy); unlinkSync(f.receipt); refused(plan({ rootDir: f.root, runner: 'claude' }), 'TRUST-ANCHOR-EXISTING-AUTHORITY-UNAVAILABLE'); assert.deepEqual(snap(f.policy), policy);
  }) },
  { id: 'EPA005', name: 'Real chat answers need neither signing anchor nor acknowledgment', run: () => isolated('EPA005', f => {
    unlinkSync(f.authority); const policy = snap(f.policy), pointer = snap(f.pointer), machine = snap(f.machine);
    const result = plan({ rootDir: f.root, runner: 'claude' }); assert.equal(result.status, 'not-required'); assert.equal(result.ok, true); assert.equal(result.nextAction, null);
    assert.deepEqual(snap(f.policy), policy); assert.deepEqual(snap(f.pointer), pointer); assert.deepEqual(snap(f.machine), machine);
    const observed = inspectProjectOnboardingV3({ rootDir: f.root, runner: 'claude', intent: 'session', deps: f.deps });
    assert.equal(observed.trustAnchorGuidanceAction ?? null, null);
  }, { choice: 'chat' }) },
  { id: 'EPA006', name: 'Pointer mismatch and conflicting anchor cannot initiate setup or repair', run: () => isolated('EPA006', f => {
    file(f.pointer, { schema: 'pipeline.po-key-directory.v1', poKeyDirectory: f.machineRoot, updatedAt: '2026-10-11T00:00:00.000Z' }); const before = snapshots(f);
    refused(plan({ rootDir: f.root, runner: 'claude' }), 'TRUST-ANCHOR-REPOSITORY-CONFLICT'); unchanged(f, before);
    file(f.pointer, { schema: 'pipeline.po-key-directory.v1', poKeyDirectory: f.keys, updatedAt: '2026-10-11T00:00:00.000Z' });
    file(f.policy, { schema: 'pipeline.critical-human-proof-policy.v3', requiredKinds: ['push'], waivedKinds: [], trustAnchors: [{ ...anchor, publicKeySha256: 'b'.repeat(64) }] });
    const conflict = snapshots(f); refused(plan({ rootDir: f.root, runner: 'claude' }), 'TRUST-ANCHOR-REPOSITORY-CONFLICT'); unchanged(f, conflict);
    file(f.policy, missingPolicy); file(f.authority, { ...anchor, callerGrant: true }); const malformed = snapshots(f);
    refused(plan({ rootDir: f.root, runner: 'claude' }), 'TRUST-ANCHOR-EXISTING-AUTHORITY-UNAVAILABLE'); unchanged(f, malformed);
  }) },
  { id: 'EPA007', name: 'Every physical input drift consumes and refuses its authentic plan', run: () => isolated('EPA007', f => {
    for (const path of f.readset) {
      const original = readFileSync(path), p = planned(f); writeFileSync(path, Buffer.concat([original, Buffer.from('\n')]));
      const drifted = snapshots(f); refused(apply(p), 'TRUST-ANCHOR-PLAN-DRIFT'); unchanged(f, drifted);
      refused(apply(p), 'TRUST-ANCHOR-INVALID-PRIVATE-PLAN'); writeFileSync(path, original);
    }
  }) },
  { id: 'EPA008', name: 'Alias, hardlink and writable public preimages refuse before effects', run: () => isolated('EPA008', f => {
    const original = readFileSync(f.authority), copy = join(f.keys, 'public-copy.json'); file(copy, original.toString());
    unlinkSync(f.authority); symlinkSync(copy, f.authority); const policy = snap(f.policy);
    refused(plan({ rootDir: f.root, runner: 'claude' }), 'TRUST-ANCHOR-TRANSACTION-PREIMAGE-UNSAFE'); assert.deepEqual(snap(f.policy), policy);
    unlinkSync(f.authority); linkSync(copy, f.authority);
    refused(plan({ rootDir: f.root, runner: 'claude' }), 'TRUST-ANCHOR-TRANSACTION-PREIMAGE-UNSAFE'); assert.deepEqual(snap(f.policy), policy);
    unlinkSync(f.authority); file(f.authority, original.toString()); chmodSync(f.authority, 0o666);
    refused(plan({ rootDir: f.root, runner: 'claude' }), 'TRUST-ANCHOR-TRANSACTION-PREIMAGE-UNSAFE'); assert.deepEqual(snap(f.policy), policy);
  }) },
  { id: 'EPA009', name: 'Kinds, waivers and existing byte spans survive; malformed policy is not empty', run: () => isolated('EPA009', f => {
    const waiver = '[ { "kind": "push", "reason": "Synthetic existing waiver for controlled policy preservation only." } ]';
    file(f.policy, missingPolicy.replace('[ ]', waiver));
    assert.equal(apply(planned(f)).status, 'materialized'); const text = readFileSync(f.policy, 'utf8');
    assert.ok(text.includes('"requiredKinds" : [ "push" ]')); assert.ok(text.includes('"waivedKinds" : ' + waiver));
    file(f.policy, '{"schema":"pipeline.critical-human-proof-policy.v3","requiredKinds":["push"],"waivedKinds":[],"unexpected":true}');
    const before = snapshots(f); refused(plan({ rootDir: f.root, runner: 'claude' }), 'TRUST-ANCHOR-REPOSITORY-POLICY-INVALID'); unchanged(f, before);
  }) },
  { id: 'EPA010', name: 'Native owned-directory write refusal cannot become materialization success', run: () => isolated('EPA010', f => {
    assert.equal(process.platform === 'win32', false, 'POSIX-only filesystem refusal control'); assert.notEqual(process.getuid(), 0, 'Root must use ordinary non-root fixture owner');
    const directory = join(f.root, 'project'); chmodSync(directory, 0o500);
    try { const p = planned(f), before = snapshots(f); refused(apply(p), 'TRUST-ANCHOR-REPOSITORY-MATERIALIZATION-WRITE-FAILED'); unchanged(f, before); refused(apply(p), 'TRUST-ANCHOR-INVALID-PRIVATE-PLAN'); }
    finally { chmodSync(directory, 0o700); }
  }) },
  { id: 'EPA011', name: 'Public plan and CLI output disclose no machine authority or private selector', run: () => isolated('EPA011', f => {
    const before = snapshots(f), result = cli(f, ['plan-existing-trust-anchor', '--root', f.root, '--runner', 'claude']); assert.equal(result.status, 0); assert.equal(result.value.status, 'planned');
    for (const secret of [f.machineRoot, f.keys, anchor.keyReference, anchor.publicKeySha256, 'private.pem']) assert.equal(result.output.includes(secret), false);
    assert.deepEqual(Object.keys(result.value).sort(), ['schema', 'status', 'ok', 'root', 'runner', 'planSha256', 'nextAction'].sort()); unchanged(f, before);
    const bad = cli(f, ['plan-existing-trust-anchor', '--root', f.root, '--runner', 'claude', '--trust-anchor-directory', f.keys]); assert.notEqual(bad.status, 0); unchanged(f, before);
  }) },
  { id: 'EPA012', name: 'Returned apply route is closed and actual CLI reinspection rejects stale digest', run: () => isolated('EPA012', f => {
    const p = planned(f), args = p.nextAction.argv.slice(1), before = snapshots(f);
    for (const invalid of [args.filter(value => value !== '--activate'), [...args, '--activate'], [...args, '--intent', 'session'], args.map(value => value === p.planSha256 ? 'bad-digest' : value)]) { const result = cli(f, invalid); assert.notEqual(result.status, 0); unchanged(f, before); }
    const stale = cli(f, args.map(value => value === p.planSha256 ? 'f'.repeat(64) : value)); assert.equal(stale.status, 1); refused(stale.value, 'TRUST-ANCHOR-PLAN-DRIFT'); unchanged(f, before);
    assert.notEqual(cli(f, args.map(value => value === f.root ? f.caseParent : value)).status, 0); unchanged(f, before);
    const action = renderProjectOnboardingAction(p.nextAction); assert.equal(evaluateLifecycleReadyGuard({ tool_name: 'Bash', tool_input: { command: action } }, { projectDir: f.root, runner: 'claude' }).exitCode, 0);
    const foreign = renderProjectOnboardingAction({ ...p.nextAction, argv: [join(f.root, 'foreign', 'project-onboarding-v3.mjs'), ...p.nextAction.argv.slice(1)] });
    assert.equal(evaluateLifecycleReadyGuard({ tool_name: 'Bash', tool_input: { command: foreign } }, { projectDir: f.root, runner: 'claude' }).exitCode, 2);
    const result = cli(f, args); assert.equal(result.status, 0); assert.equal(result.value.status, 'materialized'); unchanged(f, before, [f.policy]);
  }) },
  { id: 'EPA013', name: 'Unanswered initial choices remain actual pending inputs instead of an apply grant', run: () => isolated('EPA013', f => {
    const before = snapshots(f); const observed = inspectProjectOnboardingV3({ rootDir: f.root, runner: 'claude', intent: 'session', deps: f.deps });
    const actions = [observed.nextAction, ...(observed.nextAction?.pendingAsks ?? [])];
    assert.ok(actions.some(action => action?.kind === 'collect-input'), 'genuine unanswered input must remain');
    assert.notEqual(observed.nextAction?.argv?.[1], 'materialize-existing-trust-anchor');
    assert.equal(plan({ rootDir: f.root, runner: 'claude' }).ok, false); unchanged(f, before);
  }, { answer: false }) },
  { id: 'EPA014', name: 'Public-only apply leaves configured inputs and authority directory untouched', run: () => isolated('EPA014', f => {
    const before = snapshots(f), names = readdirSync(f.keys).sort(); assert.deepEqual(names, ['trust-policy.json']);
    assert.equal(apply(planned(f)).status, 'materialized'); unchanged(f, before, [f.policy]); assert.deepEqual(readdirSync(f.keys).sort(), names);
    assert.equal(readdirSync(join(f.root, 'project')).some(name => name.startsWith('critical-human-proof.json.existing-public-anchor-')), false);
  }) },
  { id: 'EPA015', name: 'Materialization returns through normal inspector and never fabricates Ready or approval', run: () => isolated('EPA015', f => {
    const observed = inspectProjectOnboardingV3({ rootDir: f.root, runner: 'claude', intent: 'session', deps: f.deps });
    assert.equal(Object.hasOwn(observed, 'trustAnchorGuidanceAction'), false, 'closed public inspector omits internal sidechannels');
    assert.equal(observed.nextAction?.argv?.[1], 'plan-existing-trust-anchor');
    const plannedResult = cli(f, observed.nextAction.argv.slice(1)); assert.equal(plannedResult.status, 0); assert.equal(plannedResult.value.status, 'planned');
    const result = cli(f, plannedResult.value.nextAction.argv.slice(1)); assert.equal(result.status, 0); assert.equal(result.value.status, 'materialized');
    const after = inspectProjectOnboardingV3({ rootDir: f.root, runner: 'claude', intent: 'session', deps: f.deps });
    assert.equal(after.status, 'bootstrap-binding-required'); assert.equal(Object.hasOwn(after, 'trustAnchorGuidanceAction'), false, 'reinspection preserves closed public projection'); assert.notEqual(after.nextAction?.argv?.[1], 'materialize-existing-trust-anchor');
    assert.throws(() => requireProjectOnboardingReady({ rootDir: f.root, runner: 'claude', intent: 'session', deps: f.deps }), error => error.code === 'PORG-NOT-READY');
    assert.equal(lstatSync(join(f.root, 'project', 'critical-human-proof.json')).isFile(), true);
  }) },
];
