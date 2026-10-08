// SPDX-License-Identifier: SUL-1.0
// R7-3-T3-20261008 -- RED pins for ruling 65 ("candidate or an evidence-only descendant").
//
// Ruling: at approval time the candidate rule is no longer HEAD == package.candidate. It is
//   HEAD == package.candidate, OR
//   HEAD descends from package.candidate AND every path changed in candidate..HEAD belongs to the
//   package's own bound set (the package file plus the course/readiness artifacts it digests).
// Any other changed path keeps DWP2-CURRENT-CANDIDATE; sources stay bound by digest at the candidate.
// Today design-workflow-package-v2.mjs (the requireCurrentCandidate check, line 108) demands strict
// equality, so a package that is committed AFTER its candidate (which the R7-3 bound-path gate
// requires before present-plan) is refused with DWP2-CURRENT-CANDIDATE.
//
// Cases (A..E follow the briefing letters):
//   A  HEAD == candidate                                         -> accepted   (green control)
//   B  HEAD = candidate + ONE commit adding exactly the bound set -> accepted   (RED today)
//   B0 same fixture as B, requireCurrentCandidate:false           -> accepted   (fixture sanity: proves
//      B's red is the candidate rule and not a broken fixture)
//   C1 HEAD = candidate + one commit touching only an unrelated path     -> refused (green control)
//   C2 HEAD = candidate + one commit adding the bound set AND an unrelated path -> refused (green control)
//   D  HEAD is a SIBLING of the candidate (same tree, different commit, candidate not an ancestor)
//      -> refused (green control; also pins that the fix must test ancestry, not tree equality)
//   E  HEAD = candidate + one commit adding the bound set AND modifying a digest-bound SOURCE
//      -> refused (green control)
//   F, G (R7-3-T2b-20261009): see assumption 5.
//   H  (R7-3-T3-20261009, Critic R7-3-CB F1) HEAD == package.candidate.commit, but package.candidate.tree is a
//      different, valid tree id -> refused with DWP2-CURRENT-CANDIDATE (see assumption 8)
//   I  (R7-3-T3-20261009, ruling 68) a bound artifact already tracked AT the candidate is deleted in a descendant
//      commit, so candidate..HEAD carries a true D entry for a bound path -> refused with DWP2-CURRENT-CANDIDATE
//
// ASSUMPTIONS stated for dispatcher ratification (not silently decided):
//   1. Entry points: every case drives BOTH createDesignWorkflowPackageApprovalRequest (the approval
//      time gate) and readDesignWorkflowPackageV2FromRepository with the default
//      requireCurrentCandidate (true). Both must agree. The approval request is handed
//      readCandidate as a FUNCTION returning the live HEAD candidate; the v1 dispatcher refuses a
//      non-function with DWP-READER-INPUT before the v2 reader is reached.
//   2. Bound set = exactly the paths named inside the package object: the package file itself, the
//      readiness artifact, and the Advisor initial-context, failure-evidence and (when present)
//      receipt artifacts. evidence/preparation.json (a preparation manifest the package does NOT
//      digest) and the five SOURCE files are explicitly NOT in the bound set. The set is derived
//      from the package object, never by globbing evidence/.
//   3. Case B asserts the diff candidate..HEAD equals that bound set exactly and that the candidate
//      is an ancestor, before it calls the reader, so the pin cannot pass or fail for a fixture reason.
//   4. Refusal code: C1, C2, D and E assert code DWP2-CURRENT-CANDIDATE, as the ruling says any other
//      changed path keeps it. For E this is the least certain: a reordered fix could surface
//      DWP2-FINAL-SOURCE instead (the modified source no longer matches its digest). Ratify or relax.
//   5. (R7-3-T2b-20261009, rulings 66 and 68.) Cases A..E pin the "one commit past the candidate" shape.
//      F pins a two-commit evidence-only chain (together exactly the bound set) -> accepted, like B.
//      G pins the natural deletion shape: the bound set is committed, then one bound artifact is removed
//      in a second commit. The gate compares the TREES of candidate and HEAD (git diff-tree), and no bound
//      artifact exists at the candidate, so add-then-delete leaves NO D entry for the deleted path: the
//      D-status branch of ruling 68 is not reachable for a bound path with this fixture. G therefore pins
//      the observable outcome of that shape (see its assertion), not the D branch itself.
//      Merge commits, renames and type changes are NOT pinned here. A true D entry for a bound path is
//      pinned by case I (assumption 8).
//   6. The nested supplemental Advisor re-read inside the readiness verifier is exercised end to end by
//      case B (the same stack as the real gate). If the reader fix lands but the nested re-read still
//      demands equality, B stays red with the same code; that is intended coverage, not a fixture fault.
//   7. Linux only, like the sibling candidate-binding suite (the Codex readiness host store refuses any
//      other platform). The file needs registration in the verify suites manifest; this dispatch does
//      not edit that manifest.
//   8. (R7-3-T3-20261009.) H rewrites ONLY candidate.tree inside the on-disk package file (HEAD does not move, so
//      the empty candidate..HEAD diff is the whole point): the course, readiness and host receipt keep binding the
//      real candidate, so a refusal OTHER than DWP2-CURRENT-CANDIDATE means the candidate rule admitted the
//      package and a downstream binding caught it; the code printed by the assertion is that observation.
//      I needs a bound path that exists in the candidate's tree, which the shared fixture cannot give (it
//      commits the five sources only). The fixture builder takes an opt-in trackedAtCandidate map; when given,
//      the fixture's root candidate commit is amended to carry those files BEFORE the Advisor course is created, so
//      the course, the dispatch and the route all bind the amended commit. I first commits the bound set (the
//      tracked artifact is then an M entry, asserted to be admitted so the fixture is proven sound) and then
//      deletes that artifact in a second commit.
//
// Every import below is a RELATIVE import of the repository SOURCE, never the installed plugin.
// The fixture builder is a copy of the one in design-workflow-candidate-binding.test.mjs (a test file
// cannot be imported without running its cases); it is real Git + the real private Advisor course store.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import nodeTest from 'node:test';

import { advisorHostFixture } from './codex-advisor-host.fixture.mjs';
import { coordinateInitialDesignAdvisory } from './design-advisory-coordinator-v2.mjs';
import { createDesignWorkflowPackageApprovalRequest } from './design-workflow-approval.mjs';
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
const FEATURE_ID = 'advisor-feature';
const PACKAGE_PATH = 'evidence/package.json';
const READINESS_DISPATCH_ID = 'failure-final-readiness';
const REFUSED = 'refused:DWP2-CURRENT-CANDIDATE';

// Typed platform skip for the whole file (see header, assumption 7).
const PLATFORM_SKIP = process.platform !== 'linux' ? 'EVDESC fixture store is linux-only (codex-design-readiness-host-store)' : false;
const test = (name, body) => nodeTest(name, { skip: PLATFORM_SKIP }, body);

const isAncestor = (root, ancestor, descendant) => {
  try { execFileSync('git', ['-C', root, 'merge-base', '--is-ancestor', ancestor, descendant], { timeout: 10000 }); return true; }
  catch (error) { if (error?.status === 1) return false; throw error; }
};
const changedPaths = (root, from, to) => git(root, ['diff', '--name-only', `${from}..${to}`]).split('\n').filter(Boolean).sort();

/**
 * Build a Claude-runner (no-child Advisor unavailability) v2 package whose final independent
 * Readiness is bound to a real local runner host receipt. Nothing is committed past the candidate:
 * the package and its artifacts exist in the working tree at HEAD == candidate. The cases decide
 * what, if anything, is committed afterwards.
 *
 * Opt-in `trackedAtCandidate` (path -> content, default none; assumption 8): the fixture's root candidate commit is
 * amended to carry those files BEFORE the Advisor course is created, so the course, the dispatch and the route all bind
 * the amended commit. With the default the helper is value-identical to what cases A..G always used.
 */
async function unavailableAdvisorPackage(t, { trackedAtCandidate = {} } = {}) {
  const failed = advisorHostFixture(t, 'cross-citation');
  let base = failed.candidate;
  if (Object.keys(trackedAtCandidate).length > 0) {
    for (const [path, content] of Object.entries(trackedAtCandidate)) {
      mkdirSync(dirname(join(failed.root, path)), { recursive: true });
      writeFileSync(join(failed.root, path), content);
    }
    git(failed.root, ['add', '--', ...Object.keys(trackedAtCandidate)]);
    git(failed.root, ['commit', '-q', '--amend', '--no-edit']);
    base = observeAdvisorCandidate(failed.root);
    assert.notEqual(base.commit, failed.candidate.commit, 'fixture precondition: the amend produced a new candidate commit');
  }
  const advisorRoute = { model: null, effort: null, sourceSha256: designAdvisorValueSha256(loadRunnerProfilesV3Registry()), candidateCommit: base.commit };
  const failure = await coordinateInitialDesignAdvisory({
    repoRoot: failed.root, runner: RUNNER, featureId: FEATURE_ID, authoringDispatchId: 'elephant-author',
    sources: failed.sources, reason: 'risk-review', profile: 'feature',
    dispatch: { ...failed.args.dispatch, candidateCommit: base.commit, candidateTree: base.tree },
    route: advisorRoute, hostExecution: createNativeInitialAdvisorExecution({ runner: RUNNER }),
  });
  assert.equal(failure.status, 'unavailable-pending-final-approval', JSON.stringify(failure));
  const root = failed.root;
  const candidate = observeAdvisorCandidate(root);
  const sources = observeInitialAdvisorSources({ repoRoot: root, candidate,
    sourcePaths: Object.fromEntries(Object.entries(failed.sources).map(([name, source]) => [name, source.path])) }).sources;
  mkdirSync(join(root, 'evidence'), { recursive: true });
  const artifacts = exportCodexDesignAdvisorArtifacts(root, 'evidence/failure', failure);
  const preparation = {
    schema: 'pipeline.design-readiness-preparation.v2', featureId: FEATURE_ID, authoringDispatchId: 'elephant-author', candidate, sources,
    advisor: { status: 'unavailable', runner: RUNNER, profile: 'feature', route: advisorRoute, initialContext: artifacts.initial, courseBinding: failure.courseBinding,
      consultation: null, hostReceipt: failure.hostReceipt, receipt: artifacts.receipt ?? null, report: null, disposition: null, revisions: [], failureEvidence: artifacts.failure,
      proposedException: { kind: 'advisor-unavailable', approval: 'final', oneTime: true, rationale: 'Review the final design with the recorded Advisor failure.' } },
    createdAt: new Date().toISOString(),
  };
  writeFileSync(join(root, 'evidence/preparation.json'), canonicalJson(preparation));
  const prepared = readDesignReadinessPreparationFromRepository({ repoRoot: root, packagePath: 'evidence/preparation.json', trustedAdvisorExecutablePath: process.execPath });
  assert.equal(prepared.ok, true, `fixture preparation: ${brief(prepared)}`);
  const advisorObservation = prepared.advisorObservation;

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
  const workflowPackage = { ...preparation, schema: 'pipeline.design-workflow-package.v2', readiness };
  writeFileSync(join(root, PACKAGE_PATH), canonicalJson(workflowPackage));
  const resolveRoute = ({ dutyId, runner, candidateCommit }) => ({ dutyId, runner, state: 'default', ...route, candidateCommit });
  const input = { repoRoot: root, packagePath: PACKAGE_PATH, trustedAdvisorExecutablePath: process.execPath,
    verifyReadinessExecution: (verifierInput) => verifyDesignReadinessHostExecution({ ...verifierInput, resolveRoute }) };

  // The bound set, derived from the package object (assumption 2): never from a directory glob.
  const boundPaths = [...new Set([PACKAGE_PATH, workflowPackage.readiness.path, workflowPackage.advisor.initialContext.path,
    workflowPackage.advisor.failureEvidence.path, ...(workflowPackage.advisor.receipt ? [workflowPackage.advisor.receipt.path] : [])])].sort();
  const sourcePath = (sources.design ?? sources.spec).path;
  const commit = (paths, message) => { git(root, ['add', '--', ...paths]); git(root, ['commit', '-q', '-m', message]); };
  const unrelatedFile = () => { writeFileSync(join(root, 'unrelated-later-work.md'), 'Work committed after the design candidate.\n'); return 'unrelated-later-work.md'; };
  return { root, candidate, sources, input, boundPaths, sourcePath, commit, unrelatedFile };
}

/** Both approval-time entry points, default (strict-by-ruling) requireCurrentCandidate. */
function attempt(fixture) {
  const reader = readDesignWorkflowPackageV2FromRepository(fixture.input);
  const approval = createDesignWorkflowPackageApprovalRequest({
    repoRoot: fixture.root, packagePath: PACKAGE_PATH, featureId: FEATURE_ID,
    planPath: fixture.sources.prd.path, planSha256: fixture.sources.prd.sha256,
    specPath: fixture.sources.spec.path, specSha256: fixture.sources.spec.sha256,
    readCandidate: () => observeAdvisorCandidate(fixture.root),
    verifyReadinessExecution: fixture.input.verifyReadinessExecution, trustedAdvisorExecutablePath: process.execPath,
  });
  return { reader: brief(reader), approval: brief(approval) };
}

test('EVDESC-a HEAD == package.candidate is accepted at both approval-time entry points (green control)', async (t) => {
  const fixture = await unavailableAdvisorPackage(t);
  assert.equal(observeAdvisorCandidate(fixture.root).commit, fixture.candidate.commit, 'precondition: HEAD is the candidate');
  assert.deepEqual(attempt(fixture), { reader: 'ok', approval: 'ok' });
});

test('EVDESC-b HEAD = candidate + one commit adding ONLY the package file and the artifacts it digests is accepted', async (t) => {
  const fixture = await unavailableAdvisorPackage(t);
  fixture.commit(fixture.boundPaths, 'commit the design package and the artifacts it digests');
  // Fixture preconditions (assumption 3): this is exactly an evidence-only descendant.
  const head = observeAdvisorCandidate(fixture.root);
  assert.notEqual(head.commit, fixture.candidate.commit, 'precondition: HEAD moved past the candidate');
  assert.equal(git(fixture.root, ['rev-parse', 'HEAD^']), fixture.candidate.commit, 'precondition: exactly one commit past the candidate');
  assert.equal(isAncestor(fixture.root, fixture.candidate.commit, 'HEAD'), true, 'precondition: HEAD descends from the candidate');
  assert.deepEqual(changedPaths(fixture.root, fixture.candidate.commit, 'HEAD'), fixture.boundPaths, 'precondition: candidate..HEAD is exactly the package bound set');
  assert.deepEqual(attempt(fixture), { reader: 'ok', approval: 'ok' }, 'ruling 65: an evidence-only descendant of the candidate must be accepted');
});

test('EVDESC-b0 fixture sanity: the case-B fixture verifies when the current-candidate requirement is waived', async (t) => {
  const fixture = await unavailableAdvisorPackage(t);
  fixture.commit(fixture.boundPaths, 'commit the design package and the artifacts it digests');
  const relaxed = readDesignWorkflowPackageV2FromRepository({ ...fixture.input, requireCurrentCandidate: false });
  assert.equal(brief(relaxed), 'ok', 'the only thing standing between case B and acceptance must be the candidate rule');
  assert.deepEqual(relaxed.candidate, fixture.candidate, 'the recorded design candidate stays the provenance');
});

test('EVDESC-c1 HEAD = candidate + one commit touching only an unrelated path is refused (green control)', async (t) => {
  const fixture = await unavailableAdvisorPackage(t);
  fixture.commit([fixture.unrelatedFile()], 'unrelated work after the design candidate');
  assert.equal(git(fixture.root, ['rev-parse', 'HEAD^']), fixture.candidate.commit, 'precondition: exactly one commit past the candidate');
  assert.deepEqual(attempt(fixture), { reader: REFUSED, approval: REFUSED });
});

test('EVDESC-c2 an otherwise evidence-only commit that also touches an unrelated path is refused (green control)', async (t) => {
  const fixture = await unavailableAdvisorPackage(t);
  fixture.commit([...fixture.boundPaths, fixture.unrelatedFile()], 'design package plus unrelated work');
  assert.equal(git(fixture.root, ['rev-parse', 'HEAD^']), fixture.candidate.commit, 'precondition: exactly one commit past the candidate');
  assert.deepEqual(attempt(fixture), { reader: REFUSED, approval: REFUSED });
});

test('EVDESC-d a HEAD that is a sibling of the candidate (same tree, not a descendant) is refused (green control)', async (t) => {
  const fixture = await unavailableAdvisorPackage(t);
  git(fixture.root, ['commit', '-q', '--amend', '-m', 'sibling of the design candidate']);
  const head = observeAdvisorCandidate(fixture.root);
  assert.notEqual(head.commit, fixture.candidate.commit, 'precondition: HEAD is a different commit');
  assert.equal(head.tree, fixture.candidate.tree, 'precondition: the tree is identical, so only ancestry can tell them apart');
  assert.equal(isAncestor(fixture.root, fixture.candidate.commit, 'HEAD'), false, 'precondition: the candidate is not an ancestor of HEAD');
  assert.deepEqual(attempt(fixture), { reader: REFUSED, approval: REFUSED });
});

test('EVDESC-e an evidence commit that also modifies a digest-bound SOURCE is refused (green control)', async (t) => {
  const fixture = await unavailableAdvisorPackage(t);
  appendFileSync(join(fixture.root, fixture.sourcePath), '\nA line added after the candidate; the source is bound by digest at the candidate.\n');
  fixture.commit([...fixture.boundPaths, fixture.sourcePath], 'design package plus a changed bound source');
  assert.equal(git(fixture.root, ['rev-parse', 'HEAD^']), fixture.candidate.commit, 'precondition: exactly one commit past the candidate');
  assert.ok(changedPaths(fixture.root, fixture.candidate.commit, 'HEAD').includes(fixture.sourcePath), 'precondition: a bound source changed');
  assert.deepEqual(attempt(fixture), { reader: REFUSED, approval: REFUSED });
});

test('EVDESC-f HEAD = candidate + TWO commits that together add exactly the bound set is accepted (evidence-only chain)', async (t) => {
  const fixture = await unavailableAdvisorPackage(t);
  const artifacts = fixture.boundPaths.filter((path) => path !== PACKAGE_PATH);
  assert.ok(artifacts.length > 0 && artifacts.length < fixture.boundPaths.length, 'precondition: the bound set splits into artifacts and the package file');
  fixture.commit(artifacts, 'commit the artifacts the design package digests');
  fixture.commit([PACKAGE_PATH], 'commit the design package');
  // Fixture preconditions: a real two-commit chain, each commit evidence-only, together exactly the bound set.
  assert.equal(git(fixture.root, ['rev-parse', 'HEAD~2']), fixture.candidate.commit, 'precondition: exactly two commits past the candidate');
  assert.equal(isAncestor(fixture.root, fixture.candidate.commit, 'HEAD'), true, 'precondition: HEAD descends from the candidate');
  assert.deepEqual(changedPaths(fixture.root, fixture.candidate.commit, 'HEAD~1'), artifacts, 'precondition: the first commit adds only the artifacts');
  assert.deepEqual(changedPaths(fixture.root, 'HEAD~1', 'HEAD'), [PACKAGE_PATH], 'precondition: the second commit adds only the package file');
  assert.deepEqual(changedPaths(fixture.root, fixture.candidate.commit, 'HEAD'), fixture.boundPaths, 'precondition: candidate..HEAD is exactly the package bound set');
  assert.deepEqual(attempt(fixture), { reader: 'ok', approval: 'ok' }, 'rulings 65 and 66: an evidence-only chain of several commits must be accepted like case B');
});

// R7-3-T2b-20261009 finding: the briefed code DWP2-CURRENT-CANDIDATE is unreachable for this shape. Ruling 68's gate
// compares the trees of candidate and HEAD; the bound artifacts do not exist at the candidate, so add-then-delete leaves
// no D entry (the net diff is the bound set minus the deleted path, all A) and the descendant is admitted at the
// candidate rule. The package then fails downstream on the missing artifact, with DWP2-PHYSICAL-OR-GIT at both entry
// points (observed). What matters and is pinned: the shape is never accepted.
test('EVDESC-g a chain that adds the bound set and then deletes a bound artifact is refused (net diff has no D entry; refused downstream)', async (t) => {
  const fixture = await unavailableAdvisorPackage(t);
  const deleted = 'evidence/readiness.json';
  assert.ok(fixture.boundPaths.includes(deleted), 'precondition: the deleted path is in the bound set');
  fixture.commit(fixture.boundPaths, 'commit the design package and the artifacts it digests');
  git(fixture.root, ['rm', '-q', '--', deleted]);
  git(fixture.root, ['commit', '-q', '-m', 'delete a bound artifact after the design package was committed']);
  assert.equal(git(fixture.root, ['rev-parse', 'HEAD~2']), fixture.candidate.commit, 'precondition: exactly two commits past the candidate');
  assert.equal(isAncestor(fixture.root, fixture.candidate.commit, 'HEAD'), true, 'precondition: HEAD descends from the candidate');
  assert.deepEqual(git(fixture.root, ['log', '--diff-filter=D', '--name-only', '--format=', `${fixture.candidate.commit}..HEAD`]).split('\n').filter(Boolean), [deleted],
    'precondition: the chain deletes the bound artifact');
  assert.deepEqual(changedPaths(fixture.root, fixture.candidate.commit, 'HEAD'), fixture.boundPaths.filter((path) => path !== deleted),
    'precondition: the tree diff carries no entry for the deleted path (it never existed at the candidate)');
  const refusedDownstream = 'refused:DWP2-PHYSICAL-OR-GIT';
  assert.deepEqual(attempt(fixture), { reader: refusedDownstream, approval: refusedDownstream },
    'rulings 66 and 68: a deleted bound artifact must never be accepted (observed refusal: the artifact is missing, not the candidate rule)');
});

// R7-3-T3-20261009 (Critic R7-3-CB minor F1; assumption 8). HEAD is the candidate COMMIT, but the package records a different,
// valid tree id. The candidate..HEAD diff is empty, so the descendant check has nothing to object to and admits; only a
// downstream binding refuses. Pinned: the candidate rule itself refuses, at both entry points. When this is red, the pair in
// the failure message is the observation (the code each entry point actually returns today).
test('EVDESC-h HEAD == package.candidate.commit but package.candidate.tree is a different valid tree is refused at the candidate rule', async (t) => {
  const fixture = await unavailableAdvisorPackage(t);
  // A real second tree without moving HEAD: stage the bound set, write the tree, restore the index.
  git(fixture.root, ['add', '--', ...fixture.boundPaths]);
  const otherTree = git(fixture.root, ['write-tree']);
  git(fixture.root, ['reset', '-q']);
  assert.equal(git(fixture.root, ['status', '--porcelain', '--untracked-files=no']), '', 'precondition: the index is restored, nothing is staged');
  assert.equal(git(fixture.root, ['cat-file', '-t', otherTree]), 'tree', 'precondition: the substitute tree id is a real tree object');
  assert.notEqual(otherTree, fixture.candidate.tree, 'precondition: the substitute differs from the candidate tree');
  assert.deepEqual(observeAdvisorCandidate(fixture.root), fixture.candidate, 'precondition: HEAD did not move and is still the candidate');
  const packageFile = join(fixture.root, PACKAGE_PATH);
  const workflowPackage = JSON.parse(readFileSync(packageFile, 'utf8'));
  assert.deepEqual(workflowPackage.candidate, fixture.candidate, 'precondition: the package recorded the real candidate before the rewrite');
  writeFileSync(packageFile, canonicalJson({ ...workflowPackage, candidate: { ...workflowPackage.candidate, tree: otherTree } }));
  assert.deepEqual(changedPaths(fixture.root, fixture.candidate.commit, 'HEAD'), [], 'precondition: candidate..HEAD is empty (the empty diff is the whole point)');
  assert.equal(JSON.parse(readFileSync(packageFile, 'utf8')).candidate.tree, otherTree, 'precondition: only candidate.tree was rewritten on disk');
  assert.deepEqual(attempt(fixture), { reader: REFUSED, approval: REFUSED },
    'ruling 65: a package whose candidate.tree is not the tree of HEAD is not the candidate, whatever the (empty) diff says');
});

// R7-3-T3-20261009 (ruling 68). The one shape that produces a TRUE D entry for a bound path: the artifact already exists at the
// candidate (opt-in trackedAtCandidate, assumption 8) and a descendant deletes it. Case G cannot reach this branch.
test('EVDESC-i a bound artifact tracked AT the candidate and deleted in a descendant (true D entry) is refused (green control)', async (t) => {
  const deleted = 'evidence/readiness.json';
  const fixture = await unavailableAdvisorPackage(t, { trackedAtCandidate: { [deleted]: 'A stale readiness artifact tracked at the design candidate.\n' } });
  assert.ok(fixture.boundPaths.includes(deleted), 'precondition: the tracked path is in the bound set');
  assert.equal(git(fixture.root, ['ls-tree', '--name-only', fixture.candidate.commit, '--', deleted]), deleted,
    'precondition: the artifact is tracked at the candidate, so deleting it later is a true D entry (unlike case G)');
  const nameStatus = () => git(fixture.root, ['diff-tree', '-r', '--name-status', '--no-renames', fixture.candidate.commit, 'HEAD']).split('\n').filter(Boolean).sort();
  const expected = (status) => fixture.boundPaths.map((path) => `${path === deleted ? status : 'A'}\t${path}`).sort();
  fixture.commit(fixture.boundPaths, 'commit the design package and the artifacts it digests (one artifact was already tracked)');
  assert.equal(git(fixture.root, ['rev-parse', 'HEAD^']), fixture.candidate.commit, 'precondition: exactly one commit past the candidate');
  assert.deepEqual(nameStatus(), expected('M'), 'precondition: the tracked artifact is an M entry, every other bound path an A entry');
  assert.deepEqual(attempt(fixture), { reader: 'ok', approval: 'ok' }, 'control: the fixture is sound, the M-status bound set is accepted');
  git(fixture.root, ['rm', '-q', '--', deleted]);
  git(fixture.root, ['commit', '-q', '-m', 'delete a bound artifact that was tracked at the design candidate']);
  assert.equal(git(fixture.root, ['rev-parse', 'HEAD~2']), fixture.candidate.commit, 'precondition: exactly two commits past the candidate');
  assert.equal(isAncestor(fixture.root, fixture.candidate.commit, 'HEAD'), true, 'precondition: HEAD descends from the candidate');
  assert.deepEqual(nameStatus(), expected('D'), 'precondition: candidate..HEAD carries a true D entry for the bound artifact, every other bound path an A entry');
  assert.deepEqual(attempt(fixture), { reader: REFUSED, approval: REFUSED }, 'rulings 66 and 68: a D entry for a bound path keeps DWP2-CURRENT-CANDIDATE');
});
