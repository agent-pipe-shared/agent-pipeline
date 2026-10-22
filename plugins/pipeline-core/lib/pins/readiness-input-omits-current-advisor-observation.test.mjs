// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.readiness-input-omits-current-advisor-observation (AC-241).
// Independent Readiness receives a bounded, declared, verified Advisor observation
// next to the same five normative sources. Real modules; only the documented
// `invokeHost` / `readCommittedSource` seams are injected. Fixtures live under scratch/.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, linkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../codex-sandbox-compatibility.mjs';
import { createAdvisoryRouteSelection } from '../advisory-route-selection.mjs';
import { readCurrentReadinessAdvisorObservation, rereadCurrentReadinessAdvisorObservation } from '../codex-readiness-finalization.mjs';
import { buildCodexToolFreeReadinessRequest, runCodexToolFreeDesignReadiness, verifyCodexToolFreeBindingFromSources } from '../codex-tool-free-design-readiness.mjs';
// Managed-host cases (points 6, 2, 3) reuse the green fixtures of codex-readiness-finalization.test.mjs.
import { readinessFixture } from '../codex-readiness-finalization.fixture.mjs';
import { advisorHostFixture } from '../codex-advisor-host.fixture.mjs';
import { createCodexDesignReadinessHostStore } from '../codex-design-readiness-host-store.mjs';
import { verifyDesignReadinessHostExecution } from '../design-readiness-host-evidence.mjs';
import { runIsolatedStructuredHost } from '../codex-isolated-structured-host.mjs';
import { designAdvisorValueSha256 } from '../design-advisor-course.mjs';
import { coordinateInitialDesignAdvisory } from '../design-advisory-coordinator-v2.mjs';
import { createNativeInitialAdvisorExecution } from '../native-initial-advisor-execution.mjs';
import { loadRunnerProfilesV3Registry } from '../runner-profiles-v3.mjs';
import { readDesignReadinessPreparationFromRepository } from '../design-workflow-package-v2.mjs';
import { exportCodexDesignAdvisorArtifacts } from '../../scripts/codex-design-advisor-bootstrap.mjs';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const scratchRoot = join(repoRoot, 'scratch');
const names = ['input', 'prd', 'spec', 'design', 'traceability'];
const sha = value => createHash('sha256').update(value).digest('hex');
const MARKER = 'SUPPLEMENTAL_UNTRUSTED_ADVISOR_OBSERVATION_JSON';
// The managed-host cases need the linux-only private readiness store (uid/mode bits) and a real managed child process.
const NON_LINUX = process.platform === 'linux' ? false : 'host-limitation: needs the linux-only private readiness store and managed host process; owner Coordinator, due 2026-11-04 (Linux/WSL run, PO decision K7)';

function fixture(t) {
  mkdirSync(scratchRoot, { recursive: true });
  const root = realpathSync(mkdtempSync(join(scratchRoot, 'pin-readiness-advisor-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sources = Object.fromEntries(names.map(name => {
    const content = `Synthetic ${name} document.\n`; writeFileSync(join(root, `${name}.md`), content);
    return [name, { path: `${name}.md`, sha256: sha(content) }];
  }));
  const candidate = { commit: 'a'.repeat(40), tree: 'b'.repeat(40) };
  const receipt = { schema: 'pipeline.advisory-receipt.v1', receiptId: 'current-advisor',
    dispatch: { dispatchId: 'current-advisor', queueRevision: 0, candidateCommit: candidate.commit, candidateTree: candidate.tree },
    duty: 'advisory', profile: 'feature', configuredRoute: { runner: 'codex', selector: { kind: 'model-id', value: 'fixture-model' }, effort: 'high' },
    adapter: 'consult', observed: { status: 'unavailable', identity: null }, questionSha256: sources.design.sha256, answerSha256: null,
    fallback: { reason: 'consult-unavailable', redactedErrorClass: 'unavailable' }, emittedAtMs: 1000 };
  const receiptBytes = Buffer.from(canonicalJson(receipt));
  const route = createAdvisoryRouteSelection({ receipt, receiptBytes, code: 'ordinary-consult-host-callback-unavailable' });
  const routeBytes = Buffer.from(canonicalJson(route));
  writeFileSync(join(root, 'advisor.receipt.json'), receiptBytes); writeFileSync(join(root, 'advisor.route.json'), routeBytes);
  const refs = { receiptRef: { path: 'advisor.receipt.json', sha256: sha(receiptBytes) }, routeRef: { path: 'advisor.route.json', sha256: sha(routeBytes) } };
  const readerArgs = { repoRoot: root, candidate, sources, ...refs };
  const hostRoute = { model: 'fixture-model', effort: 'high', sourceSha256: 'c'.repeat(64), candidateCommit: candidate.commit };
  const content = Object.fromEntries(names.map(n => [n, { ...sources[n], content: readFileSync(join(root, sources[n].path), 'utf8') }]));
  const runArgs = { repoRoot: root, repoFingerprint: 'd'.repeat(64), dispatchId: 'pin-dispatch', candidate, sources, route: hostRoute,
    codexPath: process.execPath, inputDirectory: root, store: { processRoot: root }, readCandidate: () => candidate,
    readCommittedSource: (_r, _c, path) => Buffer.from(`Synthetic ${path.slice(0, -3)} document.\n`) };
  return { root, sources, candidate, receipt, route, refs, readerArgs, hostRoute, content, runArgs,
    observation: readCurrentReadinessAdvisorObservation(readerArgs) };
}

// Acceptance 1: declared observation reaches the request next to exactly five sources.
function assertRequestCarriesObservation(build, f) {
  const base = { dispatchId: 'review', candidate: f.candidate, sources: f.sources, route: f.hostRoute, sourceContent: f.content };
  const plain = build(base), supplied = build({ ...base, advisorObservation: f.observation });
  assert.notEqual(plain.requestSha256, supplied.requestSha256);
  assert.ok(supplied.prompt.includes(MARKER));
  assert.ok(supplied.prompt.includes(canonicalJson(f.observation)));
  assert.equal(Object.keys(supplied.outputSchema.properties.sources.properties).length, 5);
  assert.deepEqual(supplied.outputSchema, plain.outputSchema);
}

test('AC-241 point 1: request carries the declared observation beside exactly the five sources', t => {
  const f = fixture(t);
  assertRequestCarriesObservation(buildCodexToolFreeReadinessRequest, f);
  const plain = buildCodexToolFreeReadinessRequest({ dispatchId: 'review', candidate: f.candidate, sources: f.sources, route: f.hostRoute, sourceContent: f.content });
  assert.ok(!plain.prompt.includes(MARKER), 'absent observation adds no hidden block');
  assert.ok(f.observation.route.childStarted === false && f.observation.route.attemptCount === 0 && f.observation.receipt.observed.status === 'unavailable',
    'no-child unavailable stays truthful');
});

test('AC-241 RED proof: the request check fails against a mirror that drops the observation', t => {
  const f = fixture(t);
  const mirror = args => buildCodexToolFreeReadinessRequest({ ...args, advisorObservation: null });
  assert.throws(() => assertRequestCarriesObservation(mirror, f), assert.AssertionError);
});

test('AC-241 point 2: receipt/route/candidate/question binding is verified before transmission', t => {
  const f = fixture(t);
  assert.throws(() => readCurrentReadinessAdvisorObservation({ ...f.readerArgs, candidate: { ...f.candidate, commit: '0'.repeat(40) } }));
  assert.throws(() => readCurrentReadinessAdvisorObservation({ ...f.readerArgs, candidate: { ...f.candidate, tree: '0'.repeat(40) } }));
  assert.throws(() => readCurrentReadinessAdvisorObservation({ ...f.readerArgs, sources: { ...f.sources, design: { ...f.sources.design, sha256: '0'.repeat(64) } } }), 'wrong question');
  assert.throws(() => readCurrentReadinessAdvisorObservation({ ...f.readerArgs, routeRef: { ...f.refs.routeRef, sha256: '0'.repeat(64) } }), 'substituted route');
  assert.throws(() => readCurrentReadinessAdvisorObservation({ ...f.readerArgs, receiptRef: { ...f.refs.receiptRef, sha256: '0'.repeat(64) } }), 'substituted receipt');
  assert.throws(() => readCurrentReadinessAdvisorObservation({ ...f.readerArgs, routeRef: f.refs.receiptRef }), 'same file as receipt and route');
  // A consistent receipt whose route claims a started child is not a valid no-child observation.
  const bad = { ...f.route, childStarted: true, attemptCount: 1 };
  const badBytes = Buffer.from(canonicalJson(bad)); writeFileSync(join(f.root, 'advisor.route.json'), badBytes);
  assert.throws(() => readCurrentReadinessAdvisorObservation({ ...f.readerArgs, routeRef: { path: 'advisor.route.json', sha256: sha(badBytes) } }));
});

test('AC-241 point 3: observation is re-read fresh; context drift and caller-forged copies are refused', t => {
  const f = fixture(t);
  assert.deepEqual(rereadCurrentReadinessAdvisorObservation(f.root, f.observation, f.sources), f.observation);
  const claimed = structuredClone(f.observation); claimed.route.childStarted = true;
  assert.throws(() => rereadCurrentReadinessAdvisorObservation(f.root, claimed, f.sources), 'caller assertion cannot replace the re-read');
  const model = structuredClone(f.observation); model.receipt.configuredRoute.selector.value = 'fabricated-model';
  assert.throws(() => rereadCurrentReadinessAdvisorObservation(f.root, model, f.sources), 'model identity claim');
  assert.throws(() => rereadCurrentReadinessAdvisorObservation(f.root, { schema: 'pipeline.readiness-advisor-observation.v2', garbage: true }, f.sources), 'fabricated v2 context');
  writeFileSync(join(f.root, 'advisor.route.json'), readFileSync(join(f.root, 'advisor.route.json'), 'utf8') + ' ');
  assert.throws(() => rereadCurrentReadinessAdvisorObservation(f.root, f.observation, f.sources), 'context drift after publication');
});

test('AC-241 point 5: oversized, duplicate-key, missing and hard-linked alias inputs are refused', t => {
  const f = fixture(t), path = join(f.root, f.refs.receiptRef.path), original = readFileSync(path);
  linkSync(path, join(f.root, 'receipt-alias'));
  assert.throws(() => readCurrentReadinessAdvisorObservation(f.readerArgs), 'alias (nlink>1)'); unlinkSync(join(f.root, 'receipt-alias'));
  writeFileSync(path, Buffer.alloc(65537, 32)); assert.throws(() => readCurrentReadinessAdvisorObservation(f.readerArgs), 'oversized');
  writeFileSync(path, '{"schema":"a","schema":"b"}'); assert.throws(() => readCurrentReadinessAdvisorObservation(f.readerArgs), 'duplicate key');
  writeFileSync(path, original); assert.deepEqual(readCurrentReadinessAdvisorObservation(f.readerArgs), f.observation);
  unlinkSync(path); assert.throws(() => readCurrentReadinessAdvisorObservation(f.readerArgs), 'missing context');
  assert.throws(() => readCurrentReadinessAdvisorObservation({ ...f.readerArgs, receiptRef: { path: '../advisor.receipt.json', sha256: f.refs.receiptRef.sha256 } }), 'path escape');
});

test('AC-241 points 1+3: the host entry transmits the verified observation and refuses a forged one before any child launch', async t => {
  const f = fixture(t); let calls = 0, seen = null;
  const spy = req => { calls += 1; seen = req; return { ok: false, code: 'host-pin-stop' }; };
  const viaRefs = await runCodexToolFreeDesignReadiness({ ...f.runArgs, invokeHost: spy, advisorObservationRefs: f.refs });
  assert.equal(calls, 1); assert.equal(viaRefs.status, 'unavailable');
  assert.ok(seen.prompt.includes(MARKER)); assert.deepEqual(seen.readinessAdvisorObservation, f.observation);
  assert.equal(Object.keys(seen.outputSchema.properties.sources.properties).length, 5);
  const none = await runCodexToolFreeDesignReadiness({ ...f.runArgs, invokeHost: spy });
  assert.equal(calls, 2); assert.equal(none.status, 'unavailable'); assert.ok(!seen.prompt.includes(MARKER)); assert.equal(seen.readinessAdvisorObservation, null);
  const forged = structuredClone(f.observation); forged.route.childStarted = true;
  const refused = await runCodexToolFreeDesignReadiness({ ...f.runArgs, invokeHost: spy, advisorObservation: forged });
  assert.equal(refused.status, 'unavailable'); assert.equal(refused.receiptId, null); assert.equal(calls, 2, 'forgery never reaches the host');
  const wrongCandidate = await runCodexToolFreeDesignReadiness({ ...f.runArgs, invokeHost: spy, advisorObservationRefs: { ...f.refs, routeRef: { ...f.refs.routeRef, sha256: '0'.repeat(64) } } });
  assert.equal(wrongCandidate.status, 'unavailable'); assert.equal(calls, 2);
  const both = await runCodexToolFreeDesignReadiness({ ...f.runArgs, invokeHost: spy, advisorObservation: f.observation, advisorObservationRefs: f.refs });
  assert.equal(both.code, 'CTFR-ADVISOR-OBSERVATION-AMBIGUOUS'); assert.equal(calls, 2);
});

// ---- managed-host helpers: the fixture app-server is a real Node child speaking the app-server protocol; no provider is contacted ----
const CHILD_ANCHOR = 'const p=m.params.outputSchema.properties, lit=value=>value.enum[0];';
const COMPLETED_ANCHOR = "send({method:'turn/completed'";
const ownerOnly = path => { const s = statSync(path); return s.uid === process.getuid() && (s.mode & 0o077) === 0; };
const receiptFileOf = (f, receiptId) => join(f.store.processRoot, '..', 'receipts', `${receiptId}.json`);
const sourceBytesOf = f => Object.fromEntries(names.map(n => [n, { path: f.sources[n].path, bytes: readFileSync(join(f.root, f.sources[n].path)) }]));
const sourceContentOf = f => Object.fromEntries(names.map(n => [n, { ...f.sources[n], content: readFileSync(join(f.root, f.sources[n].path), 'utf8') }]));
const requestFor = (f, advisorObservation, dispatchId) => buildCodexToolFreeReadinessRequest({ dispatchId, candidate: f.candidate, sources: f.sources, route: f.route, sourceContent: sourceContentOf(f), advisorObservation });
const patchChild = (f, edit) => { const script = join(f.input, 'app-server'); writeFileSync(script, edit(readFileSync(script, 'utf8'))); };
// The child exits 23 unless the supplemental block arrives, 24 unless the delivered observation satisfies `predicate` (evaluated in the child on `supplied`).
function demandObservation(source, predicate) {
  assert.ok(source.includes(CHILD_ANCHOR), 'fixture app-server anchor present');
  return source.replace(CHILD_ANCHOR, () => `${CHILD_ANCHOR}
const marker='${MARKER}\\n';const raw=m.params.input[0].text.split(marker)[1];
if(!raw)process.exit(23);const supplied=JSON.parse(raw.slice(raw.indexOf('{')));if(!(${predicate}))process.exit(24);`);
}
// The child appends one byte to `path` after answering and before it announces turn/completed.
function driftBeforeCompletion(source, path) {
  assert.ok(source.includes(COMPLETED_ANCHOR), 'fixture app-server completion anchor present');
  return source.replace(COMPLETED_ANCHOR, () => `require('node:fs').appendFileSync(${JSON.stringify(path)},' ');${COMPLETED_ANCHOR}`);
}
// Same receipt + route files and refs as the declared current Advisor evidence of the finalization test, over a real committed readiness fixture.
function advisorContextFor(f) {
  const receipt = { schema: 'pipeline.advisory-receipt.v1', receiptId: 'current-advisor',
    dispatch: { dispatchId: 'current-advisor', queueRevision: 0, candidateCommit: f.candidate.commit, candidateTree: f.candidate.tree },
    duty: 'advisory', profile: 'feature', configuredRoute: { runner: 'codex', selector: { kind: 'model-id', value: 'fixture-model' }, effort: 'high' },
    adapter: 'consult', observed: { status: 'unavailable', identity: null }, questionSha256: f.sources.design.sha256, answerSha256: null,
    fallback: { reason: 'consult-unavailable', redactedErrorClass: 'unavailable' }, emittedAtMs: 1000 };
  const receiptBytes = Buffer.from(canonicalJson(receipt));
  const route = createAdvisoryRouteSelection({ receipt, receiptBytes, code: 'ordinary-consult-host-callback-unavailable' }), routeBytes = Buffer.from(canonicalJson(route));
  writeFileSync(join(f.root, 'advisor.receipt.json'), receiptBytes); writeFileSync(join(f.root, 'advisor.route.json'), routeBytes);
  const refs = { receiptRef: { path: 'advisor.receipt.json', sha256: sha(receiptBytes) }, routeRef: { path: 'advisor.route.json', sha256: sha(routeBytes) } };
  return { receipt, route, refs, observation: readCurrentReadinessAdvisorObservation({ repoRoot: f.root, candidate: f.candidate, sources: f.sources, ...refs }) };
}
// Native Claude path: the coordinator proves a no-child failure; the published preparation is read back into an observation.
async function nativeUnavailableObservation(f) {
  const route = { model: null, effort: null, sourceSha256: designAdvisorValueSha256(loadRunnerProfilesV3Registry()), candidateCommit: f.candidate.commit };
  const coordination = await coordinateInitialDesignAdvisory({ repoRoot: f.root, runner: 'claude', featureId: 'verified-feature', authoringDispatchId: 'verified-author', sources: f.sources,
    reason: 'risk-review', profile: 'feature', dispatch: { dispatchId: 'initial-no-child', queueRevision: 0, candidateCommit: f.candidate.commit, candidateTree: f.candidate.tree },
    route, hostExecution: createNativeInitialAdvisorExecution({ runner: 'claude' }) });
  assert.equal(coordination.status, 'unavailable-pending-final-approval', JSON.stringify(coordination));
  mkdirSync(join(f.root, 'evidence'));
  const artifacts = exportCodexDesignAdvisorArtifacts(f.root, 'evidence/failure', coordination);
  const preparation = { schema: 'pipeline.design-readiness-preparation.v2', featureId: 'verified-feature', authoringDispatchId: 'verified-author', candidate: f.candidate, sources: f.sources,
    advisor: { status: 'unavailable', runner: 'claude', profile: 'feature', route, initialContext: artifacts.initial, courseBinding: coordination.courseBinding, consultation: null, hostReceipt: null,
      receipt: null, report: null, disposition: null, revisions: [], failureEvidence: artifacts.failure,
      proposedException: { kind: 'advisor-unavailable', approval: 'final', oneTime: true, rationale: 'Review the proved no-child failure.' } }, createdAt: new Date().toISOString() };
  writeFileSync(join(f.root, 'evidence', 'preparation.json'), canonicalJson(preparation));
  const prepared = readDesignReadinessPreparationFromRepository({ repoRoot: f.root, packagePath: 'evidence/preparation.json' });
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  return prepared.advisorObservation;
}
// Codex path: a real managed advisor child answers; the Elephant's disposition is published; the preparation is read back with the trusted executable.
async function answeredObservation(answered) {
  const consultation = await coordinateInitialDesignAdvisory({ repoRoot: answered.root, featureId: 'advisor-feature', authoringDispatchId: 'elephant-author', sources: answered.sources,
    reason: 'risk-review', profile: 'feature', dispatch: answered.args.dispatch, route: answered.route, hostExecution: answered.execution });
  assert.equal(consultation.ok, true, JSON.stringify(consultation));
  mkdirSync(join(answered.root, 'evidence'));
  const artifacts = exportCodexDesignAdvisorArtifacts(answered.root, 'evidence/answer', consultation);
  const preparation = { schema: 'pipeline.design-readiness-preparation.v2', featureId: 'advisor-feature', authoringDispatchId: 'elephant-author', candidate: answered.candidate, sources: answered.sources,
    advisor: { status: 'answered', runner: 'codex', profile: 'feature', route: answered.route, initialContext: artifacts.initial, courseBinding: consultation.courseBinding,
      consultation: consultation.consultation, hostReceipt: consultation.hostReceipt, receipt: artifacts.receipt, report: artifacts.report,
      disposition: { schema: 'pipeline.design-advisor-disposition.v1', courseId: consultation.courseBinding.courseId, consultationSha256: designAdvisorValueSha256(consultation.consultation),
        proposalSetSha256: consultation.consultation.proposalSetSha256, items: [{ proposalId: 'proposal-1', decision: 'reject', rationale: 'Retain the documented design.', revisionCommit: null }],
        ownerDispatchId: 'elephant-author', createdAt: new Date().toISOString() }, revisions: [] }, createdAt: new Date().toISOString() };
  writeFileSync(join(answered.root, 'evidence', 'preparation.json'), canonicalJson(preparation));
  const prepared = readDesignReadinessPreparationFromRepository({ repoRoot: answered.root, packagePath: 'evidence/preparation.json', trustedAdvisorExecutablePath: process.execPath });
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  return prepared.advisorObservation;
}

test('AC-241 point 6: bootstrap-to-host-to-fresh-verifier delivery with private custody (managed child, fresh verifier)', { skip: NON_LINUX }, async t => {
  const f = readinessFixture(t), a = advisorContextFor(f);
  const demands = `supplied.receipt.observed.status==='unavailable'&&supplied.route.childStarted===false&&supplied.receipt.questionSha256===${JSON.stringify(f.sources.design.sha256)}`;
  patchChild(f, source => demandObservation(source, demands));
  // Control: a separate fixture whose child demands the same block never receives it, so the child exits and nothing is published.
  const c = readinessFixture(t); patchChild(c, source => demandObservation(source, demands));
  const control = await runCodexToolFreeDesignReadiness({ ...c.args });
  assert.equal(control.status, 'unavailable', JSON.stringify(control)); assert.equal(control.report, null); assert.equal(control.code, 'CTFR-HOST-UNAVAILABLE');
  assert.equal(existsSync(receiptFileOf(c, control.receiptId)), false, 'no private readiness record without the delivered observation');

  const result = await runCodexToolFreeDesignReadiness({ ...f.args, advisorObservationRefs: a.refs });
  assert.equal(result.status, 'reviewed', JSON.stringify(result));
  assert.equal(Object.keys(result.report.sources).length, 5); assert.equal(Object.hasOwn(result.report, 'advisorObservation'), false);
  const saved = f.store.read(result.receiptId, result.expected); assert.ok(saved);
  const withObservation = requestFor(f, a.observation, f.args.dispatchId), plain = requestFor(f, null, f.args.dispatchId);
  assert.equal(saved.value.requestSha256, withObservation.requestSha256, 'the managed child was started on the request that carries the observation');
  assert.notEqual(saved.value.requestSha256, plain.requestSha256);
  // Private custody: journal directory, every journal entry and the receipt file are owner-only.
  const journal = join(f.store.processRoot, `codex-host-${result.receiptId}`), entries = readdirSync(journal);
  assert.ok(entries.includes('readiness-finalization.json'));
  for (const path of [journal, receiptFileOf(f, result.receiptId), ...entries.map(name => join(journal, name))]) assert.ok(ownerOnly(path), `owner-only: ${basename(path)}`);

  // Fresh verifier: a new store over the same .git, the declared refs and independently supplied source bytes.
  const fresh = createCodexDesignReadinessHostStore({ gitCommonDir: join(f.root, '.git'), repoFingerprint: f.repoFingerprint, trustedExecutablePath: process.execPath });
  assert.equal(fresh.read(result.receiptId, result.expected).sha256, saved.sha256);
  const bind = extra => verifyCodexToolFreeBindingFromSources({ repoRoot: f.root, hostExecution: result.report.hostExecution, report: result.report, candidate: f.candidate, sources: f.sources,
    sourceBytes: sourceBytesOf(f), route: f.route, store: fresh, repoFingerprint: f.repoFingerprint, ...extra });
  assert.equal(bind({ advisorObservationRefs: a.refs }).ok, true);
  assert.equal(bind({ advisorObservationRefs: null }).ok, false, 'the fresh verifier cannot silently omit context bound into the actual request');
  assert.equal(bind({ advisorObservation: structuredClone(a.observation) }).ok, true, 'a faithful copy is re-read and accepted');
  const forged = structuredClone(a.observation); forged.route.childStarted = true;
  assert.equal(bind({ advisorObservation: forged }).ok, false, 'a caller-forged copy cannot stand in for the re-read');
  const verifyArgs = { repoRoot: f.root, hostExecution: result.report.hostExecution, readinessReceipt: result.report, candidate: f.candidate, sources: f.sources, sourceBytes: sourceBytesOf(f),
    advisorObservationRefs: a.refs, resolveRoute: () => ({ state: 'default', runner: 'codex', ...f.route }), resolveCodexExecutable: () => process.execPath };
  assert.equal(verifyDesignReadinessHostExecution(verifyArgs).ok, true);
  assert.equal(verifyDesignReadinessHostExecution({ ...verifyArgs, advisorObservationRefs: null }).ok, false);
  // A hash-consistent route file that now claims a started child is a forged context, not a drifted one.
  const routePath = join(f.root, 'advisor.route.json'), originalRoute = readFileSync(routePath);
  const forgedRouteBytes = Buffer.from(canonicalJson({ ...a.route, childStarted: true, attemptCount: 1 })); writeFileSync(routePath, forgedRouteBytes);
  const forgedRefs = { ...a.refs, routeRef: { path: 'advisor.route.json', sha256: sha(forgedRouteBytes) } };
  assert.equal(bind({ advisorObservationRefs: forgedRefs }).ok, false); assert.equal(verifyDesignReadinessHostExecution({ ...verifyArgs, advisorObservationRefs: forgedRefs }).ok, false);
  writeFileSync(routePath, originalRoute); assert.equal(bind({ advisorObservationRefs: a.refs }).ok, true, 'restored context verifies again');
  // Drift of the declared route file after publication (last: it stays drifted).
  writeFileSync(routePath, Buffer.concat([originalRoute, Buffer.from(' ')]));
  assert.equal(bind({ advisorObservationRefs: a.refs }).ok, false); assert.equal(verifyDesignReadinessHostExecution(verifyArgs).ok, false);
});

test('AC-241 point 2: answered observation (private course/disposition) distinct from no-child unavailable', { skip: NON_LINUX }, async t => {
  const f = readinessFixture(t), readinessChild = readFileSync(join(f.input, 'app-server'), 'utf8');
  const unavailable = await nativeUnavailableObservation(f);
  assert.equal(unavailable.advisor.status, 'unavailable'); assert.equal(unavailable.failure.childStarted, false);
  for (const field of ['consultation', 'hostReceipt', 'disposition']) assert.equal(unavailable.advisor[field], null, `unavailable carries no ${field}`);

  // The answered course runs a real managed advisor child; the readiness child must then be launched from inside that store's own repository.
  const answered = advisorHostFixture(t);
  const inputs = join(answered.root, '.git', 'agent-pipeline', 'design-readiness-inputs', answered.repoFingerprint); mkdirSync(inputs, { recursive: true, mode: 0o700 });
  const answeredInput = mkdtempSync(join(inputs, 'input-'));
  const answer = await answeredObservation(answered);
  assert.equal(answer.advisor.status, 'answered');
  for (const field of ['consultation', 'hostReceipt', 'disposition']) assert.notEqual(answer.advisor[field], null, `answered carries ${field}`);
  assert.deepEqual(rereadCurrentReadinessAdvisorObservation(answered.root, answer, answered.sources, process.execPath), answer);
  assert.deepEqual(rereadCurrentReadinessAdvisorObservation(f.root, unavailable, f.sources, process.execPath), unavailable);

  // The two observations change the request, and differ from each other and from the plain request.
  const digests = [requestFor(f, null, 'distinct').requestSha256, requestFor(f, unavailable, 'distinct').requestSha256, requestFor(f, answer, 'distinct').requestSha256];
  assert.equal(new Set(digests).size, 3, 'plain, unavailable and answered requests are pairwise distinct');

  // Each managed child demands the status it is supposed to receive (exit 24 otherwise), so a swapped observation cannot reach a passing run.
  patchChild(f, () => demandObservation(readinessChild, "supplied.advisor.status==='unavailable'&&supplied.failure.childStarted===false&&supplied.advisor.consultation===null&&supplied.advisor.disposition===null"));
  const answeredChild = demandObservation(readinessChild, "supplied.advisor.status==='answered'&&supplied.advisor.consultation!==null&&supplied.advisor.hostReceipt!==null&&supplied.advisor.disposition!==null");
  writeFileSync(join(answeredInput, 'app-server'), answeredChild);
  const answeredArgs = dispatchId => ({ repoRoot: answered.root, repoFingerprint: answered.repoFingerprint, dispatchId, candidate: answered.candidate, sources: answered.sources, route: answered.route,
    codexPath: process.execPath, store: answered.store, inputDirectory: answeredInput, readCandidate: () => answered.candidate });
  const noChild = await runCodexToolFreeDesignReadiness({ ...f.args, advisorObservation: unavailable });
  assert.equal(noChild.status, 'reviewed', JSON.stringify(noChild));
  assert.equal(f.store.read(noChild.receiptId, noChild.expected).value.requestSha256, requestFor(f, unavailable, f.args.dispatchId).requestSha256);
  const answeredRun = await runCodexToolFreeDesignReadiness({ ...answeredArgs('answered-final-readiness'), advisorObservation: answer });
  assert.equal(answeredRun.status, 'reviewed', JSON.stringify(answeredRun));
  assert.equal(answered.store.read(answeredRun.receiptId, answeredRun.expected).value.requestSha256, requestFor(answered, answer, 'answered-final-readiness').requestSha256);

  // Relabelling either observation to the other status is refused before any child launch (the same call accepts the unrelabelled one).
  const asAnswered = structuredClone(unavailable); asAnswered.advisor.status = 'answered';
  assert.throws(() => rereadCurrentReadinessAdvisorObservation(f.root, asAnswered, f.sources, process.execPath));
  const refusedAsAnswered = await runCodexToolFreeDesignReadiness({ ...f.args, dispatchId: 'relabelled-unavailable', advisorObservation: asAnswered });
  assert.equal(refusedAsAnswered.status, 'unavailable'); assert.equal(refusedAsAnswered.receiptId, null);
  const asUnavailable = structuredClone(answer); asUnavailable.advisor.status = 'unavailable';
  assert.throws(() => rereadCurrentReadinessAdvisorObservation(answered.root, asUnavailable, answered.sources, process.execPath));
  const refusedAsUnavailable = await runCodexToolFreeDesignReadiness({ ...answeredArgs('relabelled-answered'), advisorObservation: asUnavailable });
  assert.equal(refusedAsUnavailable.status, 'unavailable'); assert.equal(refusedAsUnavailable.receiptId, null);
});

test('AC-241 point 3: drift after the actual turn refuses publication and the private readiness record', { skip: NON_LINUX }, async t => {
  // drifting: null (control) | { file, when: 'in-child' (the app-server appends a byte before turn/completed) | 'after-host' (appended after the host returned ok, before publication) }
  const attempt = async drifting => {
    const f = readinessFixture(t), a = advisorContextFor(f), path = join(f.root, drifting?.file ?? 'advisor.receipt.json'), original = readFileSync(path);
    if (drifting?.when === 'in-child') patchChild(f, source => driftBeforeCompletion(source, path));
    let invoked = 0, receiptId = null, host = null;
    const result = await runCodexToolFreeDesignReadiness({ ...f.args, advisorObservationRefs: a.refs, invokeHost: async input => {
      invoked += 1; receiptId = input.managedProcess.receiptId; host = await runIsolatedStructuredHost(input);
      if (drifting?.when === 'after-host') writeFileSync(path, Buffer.concat([original, Buffer.from(' ')]));
      return host; } });
    return { f, result, invoked, receiptId, host, drifted: !readFileSync(path).equals(original) };
  };
  // Control: no drift, the same flow publishes the private readiness record.
  const control = await attempt(null);
  assert.equal(control.result.status, 'reviewed', JSON.stringify(control.result)); assert.equal(control.drifted, false); assert.equal(control.host.ok, true);
  assert.equal(existsSync(receiptFileOf(control.f, control.receiptId)), true); assert.equal(control.result.receiptId, control.receiptId);
  for (const file of ['advisor.receipt.json', 'advisor.route.json']) {
    // Drift before completion: the host's own finalization refuses it after the child's turn, and nothing is published.
    const drift = await attempt({ file, when: 'in-child' });
    assert.equal(drift.invoked, 1, file); assert.equal(drift.drifted, true, `${file}: the child appended its byte`);
    assert.equal(drift.host.ok, false, file); assert.equal(drift.host.code, 'host-readiness-finalization-unavailable', file);
    assert.equal(drift.host.observed.turnId, 'fresh-fixture-turn', `${file}: the actual turn ran`); assert.equal(drift.host.observed.ownership.status, 'closed', `${file}: the child was reaped`);
    assert.equal(drift.result.status, 'unavailable', file); assert.equal(drift.result.report, null, file);
    assert.equal(drift.result.code, 'CTFR-HOST-UNAVAILABLE', file); assert.equal(drift.result.transportCode, drift.host.code, file);
    assert.equal(drift.result.receiptId, drift.receiptId, 'the receipt id was assigned before the host was invoked');
    assert.equal(existsSync(receiptFileOf(drift.f, drift.receiptId)), false, `${file}: no private readiness record is published`);
    // Drift after a successful host run, at the publication gate itself.
    const late = await attempt({ file, when: 'after-host' });
    assert.equal(late.host.ok, true, file); assert.equal(late.drifted, true, file);
    assert.equal(late.result.status, 'unavailable', file); assert.equal(late.result.report, null, file);
    assert.notEqual(late.result.code, 'CTFR-HOST-UNAVAILABLE', `${file}: refused at publication, not by the host`);
    assert.equal(existsSync(receiptFileOf(late.f, late.receiptId)), false, `${file}: no private readiness record is published`);
  }
});

// Acceptance 5 (historical preservation): the old not-ready reports stay as recorded failures. Byte digests pin them as unchanged
// public receipts; no ready report may reuse a not-ready report's dispatch or candidate (a manual conversion would have to).
// Final package validation of a not-ready report is counted coverage of design-workflow-package.test.mjs (DWP02, DWP-READINESS-BINDING).
const HISTORICAL = {
  'design-readiness-08ef241a-20260928a.json': ['2145305cef32223b27030446e22cc88f7de51f47d63804bab256e61ea2896920', 'not-ready'],
  'design-readiness-3b05a045-20260928.json': ['a40d44e3dcb8149fb059a349f5640b0de44ea75ee08ff1693cd1175b17533252', 'not-ready'],
  'design-readiness-628df5aa-20260928c.json': ['b82512c75810865347bf6b33e63491ab50557a88d5f44ba6f70be57cbfa3f855', 'not-ready'],
  'design-readiness-9a416793-20260928b.json': ['8b8c53a5b76ac8f3a1eee2a89f58879111cd8052f6c6e8167b57a86b6d4349cc', 'not-ready'],
  'design-readiness-c22c1cd2-20260928.json': ['cb6e6371330f6b9a8408e6da35880a72e8ae710aaa5ffbcfb1bf34e0f2c6e00d', 'ready-for-po-review'],
  'design-readiness-f038d96e-20260928d.json': ['926bf9396d3976f42dddb215c7649a9651f0290c42cf6ab3dbfbd8a1c1f6a491', 'ready-for-po-review'],
};
test('AC-241 point 5: old not-ready Readiness reports are preserved unchanged and none was converted to ready', () => {
  const dir = join(repoRoot, 'specs', 'sprint-alfred-epic', 'evidence');
  const reports = Object.entries(HISTORICAL).map(([file, [digest, outcome]]) => {
    const bytes = readFileSync(join(dir, file));
    assert.equal(sha(bytes), digest, `${file}: the public receipt bytes changed`);
    const report = JSON.parse(bytes.toString('utf8'));
    assert.equal(report.outcome, outcome, file);
    assert.equal(report.schema, 'pipeline.design-readiness-receipt.v1', file);
    return { file, report };
  });
  const notReady = reports.filter(({ report }) => report.outcome === 'not-ready'), ready = reports.filter(({ report }) => report.outcome === 'ready-for-po-review');
  assert.equal(notReady.length, 4); assert.equal(ready.length, 2);
  for (const { file, report } of notReady) assert.equal(report.findings.some(f => f.severity === 'blocking') && report.findings.length > 0, true, `${file}: a not-ready report keeps its blocking findings`);
  for (const { file, report } of ready) assert.deepEqual(report.findings.filter(f => f.severity === 'blocking'), [], `${file}: a ready report carries no blocking finding`);
  for (const { report: r } of ready) for (const { file, report: o } of notReady) {
    assert.notEqual(r.dispatchId, o.dispatchId, `${file}: a ready report reuses its dispatch`);
    assert.notEqual(r.candidate.commit, o.candidate.commit, `${file}: a ready report claims its candidate`);
  }
  // The two reports named by the item still record the missing current Advisor binding, not a waiver of it.
  const codes = file => notReady.find(entry => entry.file === file).report.findings.map(f => f.code);
  assert.deepEqual(codes('design-readiness-9a416793-20260928b.json'), ['CURRENT_ADVISOR_BINDING_MISSING', 'SUBMISSION_ACK_GATE_CONFLICT']);
  assert.deepEqual(codes('design-readiness-628df5aa-20260928c.json'), ['ADVISOR-CURRENT-BINDING-MISSING']);
});
