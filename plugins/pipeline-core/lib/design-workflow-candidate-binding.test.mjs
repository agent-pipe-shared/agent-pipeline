// SPDX-License-Identifier: SUL-1.0
// CANDBIND-T-20261008 -- RED pins for the approval-verification candidate-binding
// defect (backlog/items/2026-10-08-approval-verification-demands-head-equals-candidate.md).
//
// Defect: at the implementation boundary the caller passes requireCurrentCandidate:false,
// but the readiness verifier's supplemental Advisor re-read
// (rereadReadinessAdvisorContextV2 -> verifyReadinessAdvisorObservationV2) drops it and
// demands HEAD == the approved candidate commit, so an unavailable-advisor v2 package whose
// readiness was observed by a non-Codex runner dies as soon as one commit lands past it.
//
// Every import below is a RELATIVE import of the repository SOURCE, never the installed plugin.
// The fixture is real Git + the real private Advisor course store (advisorHostFixture); only
// the non-Codex readiness runner receipt is hand-built the way design-readiness-host-evidence.test.mjs
// builds it, but bound to the real supplemental Advisor request so the verifier's request-digest
// check is genuinely exercised.
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
import { createDesignReadinessRunnerHostStore } from './design-readiness-runner-host-store.mjs';
import { buildRunnerDesignReadinessPrompt } from './runner-readiness-request.mjs';
import { ADVISORY_EVIDENCE_BUNDLE_SCHEMA } from './advisory-lifecycle-v2.mjs';
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
const RUNNER = 'claude';
const READINESS_DISPATCH_ID = 'failure-final-readiness';

// Typed platform skip for the whole file. advisorHostFixture builds a Codex readiness host store whose
// constructor is Linux-only (codex-design-readiness-host-store.mjs refuses any other process.platform),
// so off Linux every case would die in fixture setup before reaching an assertion about the defect.
// A typed skip reports "skipped: <reason>" instead of a failure that looks like the defect.
const PLATFORM_SKIP = process.platform !== 'linux' ? 'CANDBIND fixture store is linux-only (codex-design-readiness-host-store)' : false;
const test = (name, body) => nodeTest(name, { skip: PLATFORM_SKIP }, body);

/**
 * Build a Claude-runner (no-child Advisor unavailability) v2 package whose final independent
 * Readiness is bound to a real local runner host receipt, then hand back the pieces the cases need.
 */
async function unavailableAdvisorPackage(t) {
  const failed = advisorHostFixture(t, 'cross-citation');
  const advisorRoute = { model: null, effort: null, sourceSha256: designAdvisorValueSha256(loadRunnerProfilesV3Registry()), candidateCommit: failed.candidate.commit };
  const failure = await coordinateInitialDesignAdvisory({
    repoRoot: failed.root, runner: RUNNER, featureId: 'advisor-feature', authoringDispatchId: 'elephant-author',
    sources: failed.sources, reason: 'risk-review', profile: 'feature', dispatch: failed.args.dispatch,
    route: advisorRoute, hostExecution: createNativeInitialAdvisorExecution({ runner: RUNNER }),
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
    advisor: { status: 'unavailable', runner: RUNNER, profile: 'feature', route: advisorRoute, initialContext: artifacts.initial, courseBinding: failure.courseBinding,
      consultation: null, hostReceipt: failure.hostReceipt, receipt: artifacts.receipt ?? null, report: null, disposition: null, revisions: [], failureEvidence: artifacts.failure,
      proposedException: { kind: 'advisor-unavailable', approval: 'final', oneTime: true, rationale: 'Review the final design with the recorded Advisor failure.' } },
    createdAt: new Date().toISOString(),
  };
  writeFileSync(join(root, 'evidence/preparation.json'), canonicalJson(preparation));
  const prepared = readDesignReadinessPreparationFromRepository({ repoRoot: root, packagePath: 'evidence/preparation.json', trustedAdvisorExecutablePath: process.execPath });
  assert.equal(prepared.ok, true, `fixture preparation: ${brief(prepared)}`);
  const advisorObservation = prepared.advisorObservation;

  // Non-Codex readiness: a local, host-observed runner receipt bound to the exact supplemental request.
  const sourceBytes = Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, { path: source.path, bytes: readFileSync(join(root, source.path)) }]));
  const evidenceBundle = { schema: ADVISORY_EVIDENCE_BUNDLE_SCHEMA, references: Object.values(sources).map((source) => {
    const entry = Object.values(sourceBytes).find((candidateEntry) => candidateEntry.path === source.path);
    return { path: source.path, sha256: source.sha256, bytes: entry.bytes.length, content: entry.bytes.toString('utf8') };
  }).sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0)) };
  const route = { model: 'opus', effort: 'high', sourceSha256: 'd'.repeat(64), candidateCommit: candidate.commit };
  const report = { schema: 'pipeline.design-readiness-receipt.v1', dispatchId: READINESS_DISPATCH_ID, runner: RUNNER, candidate, sources,
    outcome: 'ready-for-po-review', findings: [], unresolvedChoices: [], summary: 'The exact design source set is ready for PO review.' };
  const prompt = buildRunnerDesignReadinessPrompt({ runner: RUNNER, dispatchId: READINESS_DISPATCH_ID, candidate, sources, route, evidenceBundle, advisorObservation });
  const topology = resolvePoGateRepositoryTopology(root);
  const repoFingerprint = derivePoGateRepositoryFingerprint({ gitCommonDir: topology.gitCommonDir, primaryRoot: topology.primaryRoot });
  const selectionId = `drh_${'1'.repeat(32)}`;
  const record = { schema: 'pipeline.design-readiness-runner-host-receipt.v1', receiptId: selectionId, runner: RUNNER, repoFingerprint, dispatchId: READINESS_DISPATCH_ID,
    candidate, sources, route, executableSha256: 'e'.repeat(64), requestSha256: sha(Buffer.from(prompt, 'utf8')), responseSha256: '1'.repeat(64),
    dutyReceiptSha256: designReadinessReportSha256(report),
    child: { started: true, exitCode: 0, signal: null, stdoutStatus: 'complete', writeToolsObserved: false }, createdAt: '2026-10-08T12:00:00.000Z' };
  const stored = createDesignReadinessRunnerHostStore({ gitCommonDir: topology.gitCommonDir, repoFingerprint }).write(record);
  const hostExecution = { schema: 'pipeline.design-readiness-host-execution.v1', runner: RUNNER, repoFingerprint, selectionId,
    selectionSha256: designReadinessRunnerSelectionSha256(record), executionReceiptSha256: stored.sha256, dutyReceiptSha256: record.dutyReceiptSha256, route };
  const readinessReceipt = { ...report, hostExecution };
  const readinessBytes = Buffer.from(canonicalJson(readinessReceipt));
  writeFileSync(join(root, 'evidence/readiness.json'), readinessBytes);
  const readiness = { path: 'evidence/readiness.json', sha256: sha(readinessBytes), dispatchId: READINESS_DISPATCH_ID };
  writeFileSync(join(root, 'evidence/package.json'), canonicalJson({ ...preparation, schema: 'pipeline.design-workflow-package.v2', readiness }));
  const resolveRoute = ({ dutyId, runner, candidateCommit }) => ({ dutyId, runner, state: 'default', ...route, candidateCommit });
  const input = { repoRoot: root, packagePath: 'evidence/package.json', trustedAdvisorExecutablePath: process.execPath,
    verifyReadinessExecution: (verifierInput) => verifyDesignReadinessHostExecution({ ...verifierInput, resolveRoute }) };
  const moveHead = () => {
    writeFileSync(join(root, 'unrelated-later-work.md'), 'Work committed after the design candidate.\n');
    git(root, ['add', 'unrelated-later-work.md']);
    git(root, ['commit', '-qm', 'unrelated work after the design candidate']);
    assert.equal(git(root, ['rev-parse', 'HEAD^']), candidate.commit, 'HEAD must be a direct descendant of the package candidate');
    assert.notEqual(observeAdvisorCandidate(root).commit, candidate.commit, 'HEAD must have moved past the package candidate');
  };
  const verifySupplemental = (extra = {}) => verifyDesignReadinessHostExecution({ repoRoot: root, hostExecution, readinessReceipt, candidate, sources, sourceBytes, advisorObservation, resolveRoute, ...extra });
  return { root, candidate, input, moveHead, verifySupplemental, sources };
}

test('CANDBIND-a implementation-boundary read of an unavailable-advisor v2 package verifies after HEAD moves past the candidate (requireCurrentCandidate:false)', async (t) => {
  const fixture = await unavailableAdvisorPackage(t);
  const control = readDesignWorkflowPackageV2FromRepository({ ...fixture.input, requireCurrentCandidate: false });
  assert.equal(control.ok, true, `control at HEAD == candidate must verify, got ${brief(control)}`);
  fixture.moveHead();
  const moved = readDesignWorkflowPackageV2FromRepository({ ...fixture.input, requireCurrentCandidate: false });
  assert.equal(moved.ok, true, `with requireCurrentCandidate:false a HEAD descended from the candidate must verify, got ${brief(moved)}`);
  assert.deepEqual(moved.candidate, fixture.candidate, 'the recorded design candidate stays the provenance; later HEAD is never substituted into it');
});

test('CANDBIND-b the default (strict) read of the same package still refuses a HEAD that moved past the candidate', async (t) => {
  const fixture = await unavailableAdvisorPackage(t);
  const control = readDesignWorkflowPackageV2FromRepository(fixture.input);
  assert.equal(control.ok, true, `strict control at HEAD == candidate must verify, got ${brief(control)}`);
  fixture.moveHead();
  const moved = readDesignWorkflowPackageV2FromRepository(fixture.input);
  assert.equal(moved.ok, false, 'the default must stay strict: a moved HEAD is not the approved candidate');
  assert.equal(moved.code, 'DWP2-CURRENT-CANDIDATE');
});

test('CANDBIND-c the host verifier\'s supplemental Advisor re-read stays strict by default once HEAD moved past the candidate', async (t) => {
  // Only the strict half is reachable one level down without a new seam: relaxing the re-read needs
  // a caller-visible option on verifyDesignReadinessHostExecution, which does not exist yet.
  const fixture = await unavailableAdvisorPackage(t);
  const control = fixture.verifySupplemental();
  assert.equal(control.ok, true, `control at HEAD == candidate must verify, got ${brief(control)}`);
  assert.equal(control.assurance, 'host-observed-local');
  fixture.moveHead();
  const moved = fixture.verifySupplemental();
  assert.equal(moved.ok, false, 'the default re-read must stay strict once HEAD moved past the candidate');
});
