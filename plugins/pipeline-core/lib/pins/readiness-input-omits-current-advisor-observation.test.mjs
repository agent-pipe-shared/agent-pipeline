// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.readiness-input-omits-current-advisor-observation (AC-241).
// Independent Readiness receives a bounded, declared, verified Advisor observation
// next to the same five normative sources. Real modules; only the documented
// `invokeHost` / `readCommittedSource` seams are injected. Fixtures live under scratch/.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../codex-sandbox-compatibility.mjs';
import { createAdvisoryRouteSelection } from '../advisory-route-selection.mjs';
import { readCurrentReadinessAdvisorObservation, rereadCurrentReadinessAdvisorObservation } from '../codex-readiness-finalization.mjs';
import { buildCodexToolFreeReadinessRequest, runCodexToolFreeDesignReadiness } from '../codex-tool-free-design-readiness.mjs';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const scratchRoot = join(repoRoot, 'scratch');
const names = ['input', 'prd', 'spec', 'design', 'traceability'];
const sha = value => createHash('sha256').update(value).digest('hex');
const MARKER = 'SUPPLEMENTAL_UNTRUSTED_ADVISOR_OBSERVATION_JSON';
const HOST_LIMIT = 'host-limitation: needs the linux-only private readiness store and managed host process; owner Coordinator, due 2026-10-19 (Linux/WSL run, PO decision K7)';

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

test('AC-241 point 6: bootstrap-to-host-to-fresh-verifier delivery with private custody (managed child, fresh verifier)', { skip: HOST_LIMIT }, () => {});
test('AC-241 point 2: answered observation (private course/disposition) distinct from no-child unavailable', { skip: HOST_LIMIT }, () => {});
test('AC-241 point 3: drift after the actual turn refuses publication and the private readiness record', { skip: HOST_LIMIT }, () => {});
