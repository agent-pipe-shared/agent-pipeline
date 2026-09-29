// SPDX-License-Identifier: SUL-1.0
// Scratch-only ordering seam. Capabilities are sealed host integration dependencies,
// never stdin input. This module launches nothing and grants no host authority.
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { TextDecoder } from 'node:util';
import { canonicalJson, sha256 } from './codex-sandbox-compatibility.mjs';
import { parseYaml } from './yaml-lite.mjs';

export const CODEX_ADVISOR_ADMISSION_SCHEMA = 'pipeline.codex-advisor-admission-proposal.v1';
export const CODEX_ADVISOR_CONSENT_MAX_BYTES = 65536;
export const CODEX_ADVISOR_ADMISSION_OPERATION_TIMEOUT_MS = 5000;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA = /^[a-f0-9]{64}$/;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const REASONS = ['architecture-tradeoff', 'decision-ambiguity', 'evidence-conflict', 'recovery-choice', 'risk-review'];
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const matches = (regex, value) => typeof value === 'string' && regex.test(value);
const exact = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value))
  && canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort());
const same = (left, right) => canonicalJson(left) === canonicalJson(right);
const fault = () => { throw new Error('CADM-CONSENT-UNAVAILABLE'); };
function freeze(value) { for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child); return Object.freeze(value); }
function metadataValid(value) {
  if (!exact(value, ['dispatch', 'profile', 'reason', 'packageSha256', 'questionSha256', 'evidenceSha256'])
    || !['epic', 'feature'].includes(value.profile) || !REASONS.includes(value.reason)
    || !['packageSha256', 'questionSha256', 'evidenceSha256'].every(key => matches(SHA,value[key]))) return false;
  const d = value.dispatch;
  return exact(d, ['dispatchId', 'queueRevision', 'candidateCommit', 'candidateTree'])
    && matches(ID,d.dispatchId) && Number.isSafeInteger(d.queueRevision) && d.queueRevision >= 0
    && matches(OID,d.candidateCommit) && matches(OID,d.candidateTree);
}
function routeValid(route, metadata) {
  return exact(route, ['model','effort','sourceSha256','candidateCommit'])
    && matches(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/,route.model)
    && EFFORTS.includes(route.effort) && matches(SHA,route.sourceSha256)
    && route.candidateCommit === metadata.dispatch.candidateCommit;
}
function sameIdentity(a,b) {
  return ['dev','ino','mode','nlink','size','mtimeNs','ctimeNs'].every(key => a[key] === b[key]);
}
async function boundedOperation(operation,argument,timeoutMs) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_,reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('CADM-OPERATION-TIMEOUT')); },timeoutMs);
  });
  try {
    return await Promise.race([Promise.resolve().then(() => operation(argument,controller.signal)),deadline]);
  } finally { clearTimeout(timer); }
}
/** Physical, single-link, bounded config snapshot; no fallback/default consent. */
export function readPhysicalCodexAdvisorConsent(root) {
  let descriptor;
  try {
    if (typeof root !== 'string' || !isAbsolute(root) || resolve(root) !== root || realpathSync(root) !== root) fault();
    const rootBefore = lstatSync(root,{bigint:true});
    if (!rootBefore.isDirectory() || rootBefore.isSymbolicLink()) fault();
    const path = join(root,'pipeline.user.yaml');
    const before = lstatSync(path,{bigint:true});
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.size > BigInt(CODEX_ADVISOR_CONSENT_MAX_BYTES) || realpathSync(path) !== path) fault();
    descriptor = openSync(path,constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = fstatSync(descriptor,{bigint:true});
    if (!sameIdentity(before,opened)) fault();
    // Bound the actual read as well as stat.size: a racing growth cannot allocate
    // or consume unbounded bytes. The extra byte detects overflow explicitly.
    const storage = Buffer.alloc(CODEX_ADVISOR_CONSENT_MAX_BYTES + 1);
    let count = 0;
    while (count < storage.length) {
      const read = readSync(descriptor,storage,count,storage.length-count,null);
      if (read === 0) break;
      count += read;
    }
    const bytes = storage.subarray(0,count);
    const afterOpen = fstatSync(descriptor,{bigint:true});
    const after = lstatSync(path,{bigint:true});
    if (bytes.length > CODEX_ADVISOR_CONSENT_MAX_BYTES || BigInt(bytes.length) !== opened.size
      || !sameIdentity(opened,afterOpen) || !sameIdentity(opened,after) || realpathSync(path) !== path
      || !sameIdentity(rootBefore,lstatSync(root,{bigint:true}))) fault();
    const text = new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
    if (text.includes('\0') || !Buffer.from(text,'utf8').equals(bytes)) fault();
    const parsed = parseYaml(text);
    if (!exact(parsed?.advisor_export,['consent']) || !['approved','declined'].includes(parsed.advisor_export.consent)) fault();
    return freeze({ consent:parsed.advisor_export.consent, sourceSha256:sha256(bytes) });
  } catch { fault(); } finally { if (descriptor !== undefined) { try { closeSync(descriptor); } catch { /* no private diagnostic export */ } } }
}
