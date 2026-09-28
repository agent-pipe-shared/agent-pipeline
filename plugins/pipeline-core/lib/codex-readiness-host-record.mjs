// SPDX-License-Identifier: SUL-1.0
// Closed Codex readiness record with host-only observations.
import { validateReadinessOutputCustody } from './codex-readiness-finalization.mjs';
import { createHash } from 'node:crypto';
import { canonicalJson } from './codex-sandbox-compatibility.mjs';

const sha = /^[a-f0-9]{64}$/;
const oid = /^[a-f0-9]{40,64}$/;
const id = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const names = ['input', 'prd', 'spec', 'design', 'traceability'];
const exact = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
const digest = value => createHash('sha256').update(canonicalJson(value)).digest('hex');
const validPath = path => typeof path === 'string' && path.length > 0 && !path.startsWith('/')
  && !path.includes('\\') && !path.includes('\0') && !/^[A-Za-z]:/.test(path)
  && path.split('/').every(part => part !== '' && part !== '.' && part !== '..');

/** Trusted host-only record; never part of the model's output schema. */
export function validateCodexReadinessHostRecord(record, expected) {
  try {
    if (!exact(record, ['schema', 'receiptId', 'runner', 'repoFingerprint', 'dispatchId', 'candidate', 'sources',
      'route', 'executableSha256', 'requestSha256', 'responseSha256', 'dutyReceiptSha256', 'isolation', 'session',
      'controls', 'terminal', 'ownership', 'createdAt', 'finalizationSha256', 'outputCustody', 'inputDisposition'])) return false;
    if (record.schema !== 'pipeline.codex-readiness-host-receipt.v2' || record.runner !== 'codex'
      || !/^drh_[a-f0-9]{32}$/.test(record.receiptId) || !sha.test(record.repoFingerprint)
      || !id.test(record.dispatchId)) return false;
    if (!exact(record.candidate, ['commit', 'tree']) || !oid.test(record.candidate.commit) || !oid.test(record.candidate.tree)
      || !exact(record.sources, names) || names.some(name => !exact(record.sources[name], ['path', 'sha256'])
        || !validPath(record.sources[name].path) || !sha.test(record.sources[name].sha256))
      || new Set(names.map(name => record.sources[name].path)).size !== 5) return false;
    if (!exact(record.route, ['model', 'effort', 'sourceSha256', 'candidateCommit']) || !id.test(record.route.model)
      || !['low', 'medium', 'high', 'xhigh', 'max', 'ultra'].includes(record.route.effort)
      || !sha.test(record.route.sourceSha256) || record.route.candidateCommit !== record.candidate.commit) return false;
    if (!sha.test(record.finalizationSha256) || !validateReadinessOutputCustody(record.outputCustody)
      || record.outputCustody.reportCanonicalSha256 !== record.responseSha256 || record.dutyReceiptSha256 !== record.responseSha256
      || !exact(record.inputDisposition, ['contract','status','recheck','submissionCount','requestSha256','recipeSha256'])
      || record.inputDisposition.contract !== 'readiness' || record.inputDisposition.status !== 'acknowledged'
      || record.inputDisposition.recheck !== 'not-required' || record.inputDisposition.submissionCount !== 1
      || record.inputDisposition.requestSha256 !== record.requestSha256 || record.inputDisposition.recipeSha256 !== null) return false;
    for (const key of ['executableSha256', 'requestSha256', 'responseSha256', 'dutyReceiptSha256']) {
      if (!sha.test(record[key])) return false;
    }
    if (!exact(record.isolation, ['class', 'nativeSubagent', 'osSandboxAttestation', 'providerAttestation'])
      || record.isolation.class !== 'host-observed-tool-free'
      || record.isolation.nativeSubagent !== false || record.isolation.osSandboxAttestation !== false
      || record.isolation.providerAttestation !== false) return false;
    if (!exact(record.session, ['threadId', 'turnId', 'freshThreadStarted', 'ephemeralRequested', 'modelObserved', 'providerObserved'])
      || !id.test(record.session.threadId) || !id.test(record.session.turnId)
      || record.session.freshThreadStarted !== true || record.session.ephemeralRequested !== true
      || record.session.modelObserved !== record.route.model || record.session.providerObserved !== 'openai') return false;
    if (!exact(record.controls, ['configurationVerified', 'profileVerified', 'mcpVerified', 'profileIntentSha256',
      'unexpectedToolItems', 'serverRequests', 'sourceReadbackSha256', 'sourceSecondReadbackSha256'])
      || record.controls.configurationVerified !== true || record.controls.profileVerified !== true
      || record.controls.mcpVerified !== true || !sha.test(record.controls.profileIntentSha256)
      || record.controls.unexpectedToolItems !== 0 || record.controls.serverRequests !== 0
      || record.controls.sourceReadbackSha256 !== digest(record.sources)
      || record.controls.sourceSecondReadbackSha256 !== record.controls.sourceReadbackSha256) return false;
    if (!exact(record.terminal, ['exitCode', 'signal', 'spawnError', 'turnStatus', 'stdioStatus'])
      || record.terminal.exitCode !== 0 || record.terminal.signal !== null || record.terminal.spawnError !== false
      || record.terminal.turnStatus !== 'completed' || record.terminal.stdioStatus !== 'complete') return false;
    // Only a sanctioned supervisor can provide these facts. Caller-written
    // booleans alone are not sufficient; verifier must read the private journal.
    if (!exact(record.ownership, ['intentReceiptSha256', 'boundProcessReceiptSha256', 'terminalReceiptSha256', 'status'])
      || !sha.test(record.ownership.intentReceiptSha256) || !sha.test(record.ownership.boundProcessReceiptSha256)
      || !sha.test(record.ownership.terminalReceiptSha256) || record.ownership.status !== 'closed') return false;
    if (typeof record.createdAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(record.createdAt)
      || !Number.isFinite(Date.parse(record.createdAt))) return false;
    if (!exact(expected, ['repoFingerprint', 'dispatchId', 'candidate', 'sources', 'route', 'executableSha256',
      'requestSha256', 'responseSha256', 'dutyReceiptSha256', 'ownership'])) return false;
    return Object.keys(expected).every(key => canonicalJson(record[key]) === canonicalJson(expected[key]));
  } catch { return false; }
}

/** Exact same immutable private record must survive a second host read. */
export function verifyCodexReadinessHostReads(first, second, expected) {
  try {
    return exact(first, ['value', 'sha256']) && exact(second, ['value', 'sha256'])
      && sha.test(first.sha256) && first.sha256 === second.sha256
      && first.sha256 === digest(first.value) && second.sha256 === digest(second.value)
      && validateCodexReadinessHostRecord(first.value, expected)
      && validateCodexReadinessHostRecord(second.value, expected);
  } catch { return false; }
}
