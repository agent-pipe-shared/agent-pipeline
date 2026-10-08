// SPDX-License-Identifier: SUL-1.0
// CANDBIND-T3-20261008 -- RED pin for the CODEX tool-free readiness branch of the approval-verification
// candidate-binding defect (companion to design-workflow-candidate-binding.test.mjs, which pins the
// non-Codex branch; ruling 65, CANDBIND Critic finding F1).
//
// Defect: at the implementation boundary the caller passes requireCurrentCandidate:false. For a readiness
// observed by a non-Codex runner verifyDesignReadinessHostExecution forwards that flag to the supplemental
// Advisor re-read. For a readiness observed on the Codex tool-free route it does NOT:
//   design-readiness-host-evidence.mjs (codex drh_ branch, verifyCodexToolFreeBindingFromSources call)
//   -> codex-tool-free-design-readiness.mjs (rereadCurrentReadinessAdvisorObservation call)
//   -> codex-readiness-finalization.mjs (rereadReadinessAdvisorContextV2 call, 4 arguments)
// so the v2 reader re-enters with its strict default and refuses a HEAD that moved past the candidate.
// Observed refusal chain: DWP2-CURRENT-CANDIDATE is thrown, swallowed to CTFR-SOURCE-BINDING in the
// tool-free verifier, surfaced as DWP-READINESS-HOST-RECEIPT-MISMATCH by the host-evidence verifier.
//
// Every import below is a RELATIVE import of the repository SOURCE, never the installed plugin. The fixture
// is real Git + the real private Advisor course store (advisorHostFixture); only the Codex host custody
// store is a seam double (the verifier injects it through codexHostStoreFactory). The double answers only
// when the request digest the verifier reconstructs from the sources, the Advisor observation and the
// route equals the digest recorded in the receipt, so the verifier's request check is genuinely exercised.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import nodeTest from 'node:test';

import { advisorHostFixture } from './codex-advisor-host.fixture.mjs';
import { coordinateInitialDesignAdvisory } from './design-advisory-coordinator-v2.mjs';
import { readDesignWorkflowPackageV2FromRepository, readDesignReadinessPreparationFromRepository } from './design-workflow-package-v2.mjs';
import { designReadinessReportSha256, designReadinessRunnerSelectionSha256, verifyDesignReadinessHostExecution } from './design-readiness-host-evidence.mjs';
import { buildCodexToolFreeReadinessRequest } from './codex-tool-free-design-readiness.mjs';
import { rereadCurrentReadinessAdvisorObservation } from './codex-readiness-finalization.mjs';
import { rereadReadinessAdvisorContextV2 } from './readiness-advisor-context-v2.mjs';
import { observeAdvisorCandidate, observeInitialAdvisorSources } from './design-advisor-provenance.mjs';
import { designAdvisorValueSha256 } from './design-advisor-course.mjs';
import { canonicalJson } from './codex-sandbox-compatibility.mjs';
import { createNativeInitialAdvisorExecution } from './native-initial-advisor-execution.mjs';
import { loadRunnerProfilesV3Registry } from './runner-profiles-v3.mjs';
import { derivePoGateRepositoryFingerprint, resolvePoGateRepositoryTopology } from './po-gate-authority.mjs';
import { exportCodexDesignAdvisorArtifacts } from '../scripts/codex-design-advisor-bootstrap.mjs';

const sha = (value) => createHash('sha256').update(value).digest('hex');
const git = (root, argv) => execFileSync('git', ['-C', root, ...argv], { encoding: 'utf8', timeout: 10000 }).trim();
const brief = (result) => (result?.ok ? 'ok' : `refused:${result?.code}`);
const ADVISOR_RUNNER = 'claude';
const READINESS_DISPATCH_ID = 'failure-final-readiness';
const SOURCE_NAMES = ['input', 'prd', 'spec', 'design', 'traceability'];

// Typed platform skip for the whole file. advisorHostFixture builds a Codex readiness host store whose
// constructor is Linux-only (codex-design-readiness-host-store.mjs refuses any other process.platform),
// so off Linux every case would die in fixture setup before reaching an assertion about the defect.
const PLATFORM_SKIP = process.platform !== 'linux' ? 'CANDBINDX fixture store is linux-only (codex-design-readiness-host-store)' : false;
const test = (name, body) => nodeTest(name, { skip: PLATFORM_SKIP }, body);

/**
 * Build a package whose Advisor is unavailable (no-child, native runner) and whose final independent
 * Readiness was observed on the Codex tool-free route (runner 'codex', private drh_ receipt), then hand back
 * the pieces the cases need. The control assertions inside each case prove this fixture verifies at
 * HEAD == candidate, so a red after moveHead() is the candidate rule and not fixture setup.
 */
async function codexReadinessPackage(t) {
  const failed = advisorHostFixture(t, 'cross-citation');
  const advisorRoute = { model: null, effort: null, sourceSha256: designAdvisorValueSha256(loadRunnerProfilesV3Registry()), candidateCommit: failed.candidate.commit };
  const failure = await coordinateInitialDesignAdvisory({
    repoRoot: failed.root, runner: ADVISOR_RUNNER, featureId: 'advisor-feature', authoringDispatchId: 'elephant-author',
    sources: failed.sources, reason: 'risk-review', profile: 'feature', dispatch: failed.args.dispatch,
    route: advisorRoute, hostExecution: createNativeInitialAdvisorExecution({ runner: ADVISOR_RUNNER }),
  });
  assert.equal(failure.status, 'unavailable-pending-final-approval', JSON.stringify(failure));
  const root = failed.root;
  const candidate = observeAdvisorCandidate(root);
  const sources = observeInitialAdvisorSources({ repoRoot: root, candidate,
    sourcePaths: Object.fromEntries(Object.entries(failed.sources).map(([name, source]) => [name, source.path])) }).sources;
  mkdirSync(join(root, 'evidence'));
  const artifacts = exportCodexDesignAdvisorArtifacts(root, 'evidence/failure', failure);
  const preparation = {
    schema: 'pipeline.design-readiness-preparation.v2', featureId: 'advisor-feature', authoringDispatchId: 'elephant-author', candidate, sources,
    advisor: { status: 'unavailable', runner: ADVISOR_RUNNER, profile: 'feature', route: advisorRoute, initialContext: artifacts.initial, courseBinding: failure.courseBinding,
      consultation: null, hostReceipt: failure.hostReceipt, receipt: artifacts.receipt ?? null, report: null, disposition: null, revisions: [], failureEvidence: artifacts.failure,
      proposedException: { kind: 'advisor-unavailable', approval: 'final', oneTime: true, rationale: 'Review the final design with the recorded Advisor failure.' } },
    createdAt: new Date().toISOString(),
  };
  writeFileSync(join(root, 'evidence/preparation.json'), canonicalJson(preparation));
  const prepared = readDesignReadinessPreparationFromRepository({ repoRoot: root, packagePath: 'evidence/preparation.json', trustedAdvisorExecutablePath: process.execPath });
  assert.equal(prepared.ok, true, `fixture preparation: ${brief(prepared)}`);
  const advisorObservation = prepared.advisorObservation;

  // Codex tool-free readiness: the report the model returned plus a private host receipt bound to the exact
  // request (five source contents + the supplemental Advisor observation + the route).
  const sourceBytes = Object.fromEntries(SOURCE_NAMES.map((name) => [name, { path: sources[name].path, bytes: readFileSync(join(root, sources[name].path)) }]));
  const sourceContent = Object.fromEntries(SOURCE_NAMES.map((name) => [name, { path: sources[name].path, sha256: sources[name].sha256, content: sourceBytes[name].bytes.toString('utf8') }]));
  const route = { model: 'gpt-codex-test', effort: 'high', sourceSha256: 'd'.repeat(64), candidateCommit: candidate.commit };
  const report = { schema: 'pipeline.design-readiness-receipt.v1', dispatchId: READINESS_DISPATCH_ID, runner: 'codex', candidate, sources,
    outcome: 'ready-for-po-review', findings: [], unresolvedChoices: [], summary: 'The exact design source set is ready for PO review.' };
  const reportSha256 = designReadinessReportSha256(report);
  const request = buildCodexToolFreeReadinessRequest({ dispatchId: READINESS_DISPATCH_ID, candidate, sources, route, sourceContent, advisorObservation });
  const topology = resolvePoGateRepositoryTopology(root);
  const repoFingerprint = derivePoGateRepositoryFingerprint({ gitCommonDir: topology.gitCommonDir, primaryRoot: topology.primaryRoot });
  const selectionId = `drh_${'2'.repeat(32)}`;
  const record = { schema: 'pipeline.codex-readiness-host-receipt.v2', receiptId: selectionId, runner: 'codex', repoFingerprint, dispatchId: READINESS_DISPATCH_ID,
    candidate, sources, route, executableSha256: 'e'.repeat(64), requestSha256: request.requestSha256, responseSha256: reportSha256, dutyReceiptSha256: reportSha256,
    ownership: { status: 'closed' }, createdAt: '2026-10-08T12:00:00.000Z' };
  const saved = { value: record, sha256: sha(Buffer.from(canonicalJson(record), 'utf8')) };
  // Seam double for the Codex host custody store: answers only for this receipt AND only when the verifier's
  // independently reconstructed request digest equals the recorded one (never a store that says yes to anything).
  const store = {
    readForBinding: (id, context) => (id === selectionId && context?.requestSha256 === record.requestSha256 && context?.reportSha256 === reportSha256
      && context?.repoFingerprint === repoFingerprint && context?.dispatchId === READINESS_DISPATCH_ID ? saved : null),
    read: (id, expected) => (id === selectionId && expected?.requestSha256 === record.requestSha256 && expected?.dutyReceiptSha256 === reportSha256 ? saved : null),
  };
  const hostExecution = { schema: 'pipeline.design-readiness-host-execution.v1', runner: 'codex', repoFingerprint, selectionId,
    selectionSha256: designReadinessRunnerSelectionSha256(record), executionReceiptSha256: saved.sha256, dutyReceiptSha256: reportSha256, route };
  const readinessReceipt = { ...report, hostExecution };
  const readinessBytes = Buffer.from(canonicalJson(readinessReceipt));
  writeFileSync(join(root, 'evidence/readiness.json'), readinessBytes);
  const readiness = { path: 'evidence/readiness.json', sha256: sha(readinessBytes), dispatchId: READINESS_DISPATCH_ID };
  writeFileSync(join(root, 'evidence/package.json'), canonicalJson({ ...preparation, schema: 'pipeline.design-workflow-package.v2', readiness }));
  const resolveRoute = ({ dutyId, runner, candidateCommit }) => ({ dutyId, runner, state: 'default', ...route, candidateCommit });
  const seams = { resolveRoute, resolveCodexExecutable: () => process.execPath, codexHostStoreFactory: () => store };
  const input = { repoRoot: root, packagePath: 'evidence/package.json', trustedAdvisorExecutablePath: process.execPath,
    verifyReadinessExecution: (verifierInput) => verifyDesignReadinessHostExecution({ ...verifierInput, ...seams }) };
  const moveHead = () => {
    writeFileSync(join(root, 'unrelated-later-work.md'), 'Work committed after the design candidate.\n');
    git(root, ['add', 'unrelated-later-work.md']);
    git(root, ['commit', '-qm', 'unrelated work after the design candidate']);
    assert.equal(git(root, ['rev-parse', 'HEAD^']), candidate.commit, 'HEAD must be a direct descendant of the package candidate');
    assert.notEqual(observeAdvisorCandidate(root).commit, candidate.commit, 'HEAD must have moved past the package candidate');
  };
  const verifySupplemental = (extra = {}) => verifyDesignReadinessHostExecution({ repoRoot: root, hostExecution, readinessReceipt, candidate, sources, sourceBytes, advisorObservation, ...seams, ...extra });
  return { root, candidate, input, moveHead, verifySupplemental, sources, advisorObservation };
}

test('CANDBINDX-a implementation-boundary read of a Codex-readiness v2 package verifies after HEAD moves past the candidate (requireCurrentCandidate:false)', async (t) => {
  const fixture = await codexReadinessPackage(t);
  const control = readDesignWorkflowPackageV2FromRepository({ ...fixture.input, requireCurrentCandidate: false });
  assert.equal(control.ok, true, `control at HEAD == candidate must verify, got ${brief(control)}`);
  fixture.moveHead();
  const moved = readDesignWorkflowPackageV2FromRepository({ ...fixture.input, requireCurrentCandidate: false });
  assert.equal(moved.ok, true, `with requireCurrentCandidate:false a HEAD descended from the candidate must verify on the Codex tool-free route too, got ${brief(moved)}`);
  assert.deepEqual(moved.candidate, fixture.candidate, 'the recorded design candidate stays the provenance; later HEAD is never substituted into it');
});

test('CANDBINDX-b the default (strict) read of the same Codex-readiness package still refuses a HEAD that moved past the candidate', async (t) => {
  const fixture = await codexReadinessPackage(t);
  const control = readDesignWorkflowPackageV2FromRepository(fixture.input);
  assert.equal(control.ok, true, `strict control at HEAD == candidate must verify, got ${brief(control)}`);
  fixture.moveHead();
  const moved = readDesignWorkflowPackageV2FromRepository(fixture.input);
  assert.equal(moved.ok, false, 'the default must stay strict: a moved HEAD is not the approved candidate');
  assert.equal(moved.code, 'DWP2-CURRENT-CANDIDATE');
});

test('CANDBINDX-c the host verifier\'s Codex branch honours requireCurrentCandidate:false for the supplemental Advisor re-read and stays strict by default', async (t) => {
  const fixture = await codexReadinessPackage(t);
  const control = fixture.verifySupplemental();
  assert.equal(control.ok, true, `control at HEAD == candidate must verify, got ${brief(control)}`);
  assert.equal(control.assurance, 'host-observed-tool-free');
  fixture.moveHead();
  const strict = fixture.verifySupplemental();
  assert.equal(strict.ok, false, 'the default re-read must stay strict once HEAD moved past the candidate');
  const relaxed = fixture.verifySupplemental({ requireCurrentCandidate: false });
  assert.equal(relaxed.ok, true, `requireCurrentCandidate:false must reach the Codex branch's Advisor re-read, got ${brief(relaxed)}`);
});

test('CANDBINDX-d (diagnostic) the Codex branch\'s re-read helper refuses a moved HEAD only because it does not forward the flag the v2 reader accepts', async (t) => {
  const fixture = await codexReadinessPackage(t);
  fixture.moveHead();
  // The helper the Codex branch calls (4 arguments, no flag) refuses with the strict-default code ...
  assert.throws(() => rereadCurrentReadinessAdvisorObservation(fixture.root, fixture.advisorObservation, fixture.sources, process.execPath),
    (error) => /DWP2-CURRENT-CANDIDATE/.test(String(error?.message)), 'the Codex re-read helper must fail with the strict current-candidate code');
  // ... while the same observation re-reads cleanly through the v2 reader when the flag is passed.
  const relaxed = rereadReadinessAdvisorContextV2(fixture.root, fixture.advisorObservation, fixture.sources, null, false);
  assert.deepEqual(relaxed, fixture.advisorObservation, 'the v2 reader accepts a descendant HEAD when the flag is forwarded, so the Codex failure is the dropped flag alone');
});
