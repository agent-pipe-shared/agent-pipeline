// SPDX-License-Identifier: SUL-1.0
// ALF-C-P9-06 / AC-114 -- regression pin for
// backlog/items/2026-10-08-approval-verification-demands-head-equals-candidate.md
//
// Acceptance points (Proposal): the caller's requireCurrentCandidate is forwarded through every readiness
// re-read (verifyReadinessAdvisorObservationV2, rereadReadinessAdvisorContextV2, the Codex branch helper
// rereadCurrentReadinessAdvisorObservation, both verifyReadinessExecution call sites of the package reader,
// and verifyDesignReadinessHostExecution), while the DEFAULT stays strict (true) for preparation,
// presentation and approval.
//
// Host limitation: the fixtures of the adjacent behavioural tests (design-workflow-candidate-binding*.test.mjs)
// need the Linux-only Codex readiness host store, so the full-package cases run only on Linux/WSL. The cases that
// run everywhere use a bogus-digest but schema-valid package/observation: the candidate check fires BEFORE any
// content verification, so a strict read answers DWP2-CURRENT-CANDIDATE while a relaxed read gets past it and is
// refused (if at all) for another reason. That distinguishes "flag forwarded" from "flag dropped" with real modules.
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyReadinessAdvisorObservationV2, readDesignWorkflowPackageV2FromRepository } from '../design-workflow-package-v2.mjs';
import { rereadReadinessAdvisorContextV2 } from '../readiness-advisor-context-v2.mjs';
import { rereadCurrentReadinessAdvisorObservation } from '../codex-readiness-finalization.mjs';

const LIB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = resolve(LIB, '../../..');
const STRICT = 'DWP2-CURRENT-CANDIDATE';
const HOST_LIMIT = 'host-limitation: Linux-only Codex readiness host store fixture (uid/mode bits); owner Coordinator, due 2026-10-19, Linux/WSL run (PO decision K7)';
const git = (root, argv) => execFileSync('git', ['-C', root, '-c', 'user.name=pin', '-c', 'user.email=pin@example.invalid', '-c', 'commit.gpgsign=false', ...argv], { encoding: 'utf8', timeout: 20000 }).trim();
const h = (c) => c.repeat(64);

function fixture(t) {
  const root = join(REPO, 'scratch', `alf-c-p9-06-${process.pid}-${Date.now()}`);
  mkdirSync(join(root, 'evidence'), { recursive: true });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '-q']);
  writeFileSync(join(root, 'README.md'), 'head\n');
  const source = (n) => ({ path: `docs/${n}.md`, sha256: h('1') });
  const sources = { input: source('input'), prd: source('prd'), spec: source('spec'), design: source('design'), traceability: source('traceability') };
  const candidate = { commit: 'a'.repeat(40), tree: 'b'.repeat(40) }; // deliberately not HEAD
  const advisor = { status: 'unavailable', runner: 'claude', profile: 'feature', route: { model: null, effort: null, sourceSha256: h('2'), candidateCommit: candidate.commit },
    initialContext: { path: 'evidence/initial.json', sha256: h('3') }, courseBinding: { courseId: 'c1', initialContextSha256: h('3'), reservationId: 'r1', slot: 0, routeStepSha256: h('4') },
    consultation: null, hostReceipt: null, receipt: null, report: null, disposition: null, revisions: [],
    failureEvidence: { path: 'evidence/failure.json', sha256: h('5') },
    proposedException: { kind: 'advisor-unavailable', approval: 'final', oneTime: true, rationale: 'pin' } };
  const createdAt = '2026-10-08T12:00:00.000Z';
  const observation = { schema: 'pipeline.readiness-advisor-observation.v2', candidate, sources, featureId: 'pin-feature', authoringDispatchId: 'pin-author', advisor,
    initialContext: { featureId: 'pin-feature', authoringDispatchId: 'pin-author', createdAt }, receipt: null, report: null, failure: null };
  const pkg = { schema: 'pipeline.design-workflow-package.v2', featureId: 'pin-feature', authoringDispatchId: 'pin-author', candidate, sources, advisor,
    readiness: { path: 'evidence/readiness.json', sha256: h('6'), dispatchId: 'pin-ready' }, createdAt };
  writeFileSync(join(root, 'evidence/package.json'), JSON.stringify(pkg));
  git(root, ['add', '-A']);
  git(root, ['commit', '-qm', 'head differs from the recorded candidate']);
  assert.notEqual(git(root, ['rev-parse', 'HEAD']), candidate.commit);
  return { root, sources, observation };
}
const code = (r) => (r?.ok ? 'ok' : r?.code);
const thrown = (fn) => { try { fn(); return null; } catch (e) { return String(e?.message); } };

test('AC-114-a: verifyReadinessAdvisorObservationV2 is strict by default and honours requireCurrentCandidate:false', (t) => {
  const f = fixture(t);
  const base = { repoRoot: f.root, observation: f.observation, sources: f.sources, trustedAdvisorExecutablePath: process.execPath };
  assert.equal(code(verifyReadinessAdvisorObservationV2(base)), STRICT, 'default must stay strict');
  assert.equal(code(verifyReadinessAdvisorObservationV2({ ...base, requireCurrentCandidate: true })), STRICT);
  assert.notEqual(code(verifyReadinessAdvisorObservationV2({ ...base, requireCurrentCandidate: false })), STRICT, 'false must get past the candidate check');
});

test('AC-114-b: rereadReadinessAdvisorContextV2 forwards the flag (strict default, relaxed past the candidate check)', (t) => {
  const f = fixture(t);
  assert.equal(thrown(() => rereadReadinessAdvisorContextV2(f.root, f.observation, f.sources, process.execPath)), STRICT);
  assert.equal(thrown(() => rereadReadinessAdvisorContextV2(f.root, f.observation, f.sources, process.execPath, true)), STRICT);
  const relaxed = thrown(() => rereadReadinessAdvisorContextV2(f.root, f.observation, f.sources, process.execPath, false));
  assert.notEqual(relaxed, STRICT, 'a dropped flag would surface the strict code here');
});

test('AC-114-c: the Codex branch helper rereadCurrentReadinessAdvisorObservation forwards the flag for v2 observations', (t) => {
  const f = fixture(t);
  assert.equal(thrown(() => rereadCurrentReadinessAdvisorObservation(f.root, f.observation, f.sources, process.execPath)), STRICT);
  const relaxed = thrown(() => rereadCurrentReadinessAdvisorObservation(f.root, f.observation, f.sources, process.execPath, false));
  assert.notEqual(relaxed, STRICT);
});

test('AC-114-d: the package reader entry point is strict by default (presentation/approval) and relaxable at the implementation boundary', (t) => {
  const f = fixture(t);
  const input = { repoRoot: f.root, packagePath: 'evidence/package.json', trustedAdvisorExecutablePath: process.execPath };
  assert.equal(code(readDesignWorkflowPackageV2FromRepository(input)), STRICT);
  assert.equal(code(readDesignWorkflowPackageV2FromRepository({ ...input, requireCurrentCandidate: true })), STRICT);
  assert.notEqual(code(readDesignWorkflowPackageV2FromRepository({ ...input, requireCurrentCandidate: false })), STRICT);
});

test('AC-114-e: the package reader hands the (possibly relaxed) flag to the readiness verifier at the unavailable-advisor call site', (t) => {
  // The relaxed read of the bogus package is refused before the verifier is reached on this fixture, so the
  // call-site forwarding is pinned at source level (both call sites) and behaviourally by the Linux cases below.
  const src = readFileSync(join(LIB, 'design-workflow-package-v2.mjs'), 'utf8');
  const sites = src.match(/verifyReadinessExecution\(\{[^}]*\bsourceBytes:sourceEntries[^}]*\}\)/g) ?? [];
  assert.equal(sites.length, 2, 'both verifyReadinessExecution call sites must exist');
  for (const s of sites) assert.match(s, /\brequireCurrentCandidate\b/, `call site drops the flag: ${s.slice(0, 80)}`);
  assert.match(src, /function verifyReadinessAdvisorObservationV2\(\{[^}]*requireCurrentCandidate=true\}/, 'default must stay true');
  assert.match(src, /readDesignWorkflowPackageV2FromRepository\(\{repoRoot,trustedAdvisorExecutablePath,requireCurrentCandidate,/, 'inline re-read must forward the flag');
});

test('AC-114-f: host verifier, tool-free Codex verifier and finalization helper forward the flag (source contract; default true)', () => {
  const host = readFileSync(join(LIB, 'design-readiness-host-evidence.mjs'), 'utf8');
  assert.match(host, /advisorObservation = null, requireCurrentCandidate = true,/, 'verifyDesignReadinessHostExecution defaults strict');
  assert.match(host, /trustedAdvisorExecutablePath:trustedExecutablePath,requireCurrentCandidate\}\)/, 'Codex branch forwards the flag');
  assert.match(host, /rereadReadinessAdvisorContextV2\(repoRoot,advisorObservation,sources,null,requireCurrentCandidate\)/, 'non-Codex branch forwards the flag');
  const free = readFileSync(join(LIB, 'codex-tool-free-design-readiness.mjs'), 'utf8');
  assert.match(free, /trustedAdvisorExecutablePath = null, requireCurrentCandidate = true/);
  assert.match(free, /rereadCurrentReadinessAdvisorObservation\(repoRoot,advisorObservation,sources,trustedAdvisorExecutablePath,requireCurrentCandidate\)/);
  const fin = readFileSync(join(LIB, 'codex-readiness-finalization.mjs'), 'utf8');
  assert.match(fin, /trustedAdvisorExecutablePath=null,requireCurrentCandidate=true\)\{if\(observation\?\.schema==='pipeline\.readiness-advisor-observation\.v2'\)return rereadReadinessAdvisorContextV2\([^)]*,requireCurrentCandidate\)/);
  const ctx = readFileSync(join(LIB, 'readiness-advisor-context-v2.mjs'), 'utf8');
  assert.match(ctx, /requireCurrentCandidate=true\)/);
  assert.match(ctx, /verifyReadinessAdvisorObservationV2\(\{[^}]*requireCurrentCandidate\}\)/);
});

test('AC-114-g (RED proof): the assertions can fail against a scratch mirror that drops the flag', (t) => {
  const f = fixture(t);
  // Mirror of rereadReadinessAdvisorContextV2 minus the forwarding -- exactly the original defect.
  const mirror = (root, obs, srcs, exe, _flag = true) => {
    const checked = verifyReadinessAdvisorObservationV2({ repoRoot: root, observation: obs, sources: srcs, trustedAdvisorExecutablePath: exe });
    if (!checked.ok) throw Error(checked.code);
    return checked.advisorObservation;
  };
  assert.equal(thrown(() => mirror(f.root, f.observation, f.sources, process.execPath, false)), STRICT, 'the defective mirror refuses a relaxed read: AC-114-b would be RED against it');
  // Same for source contract: stripping the forwarding from the call-site text defeats the regex.
  const src = readFileSync(join(LIB, 'readiness-advisor-context-v2.mjs'), 'utf8').replace(',requireCurrentCandidate});', '});');
  assert.doesNotMatch(src, /verifyReadinessAdvisorObservationV2\(\{[^}]*requireCurrentCandidate\}\)/);
});

const linux = process.platform === 'linux';
for (const file of ['design-workflow-candidate-binding.test.mjs', 'design-workflow-candidate-binding-codex.test.mjs']) {
  test(`AC-114-h: full-package behaviour (HEAD past the candidate verifies relaxed, refuses strict) -- ${file}`, { skip: linux ? false : HOST_LIMIT }, () => {
    const run = spawnSync(process.execPath, ['--test', join(LIB, file)], { encoding: 'utf8', timeout: 120000 });
    const out = `${run.stdout}${run.stderr}`;
    assert.equal(run.status, 0, out.slice(-600));
    assert.match(out, /ℹ fail 0/);
    assert.match(out, /ℹ skipped 0/, 'no case may be skipped on Linux');
    assert.match(out, /ℹ pass [1-9]/);
  });
}
