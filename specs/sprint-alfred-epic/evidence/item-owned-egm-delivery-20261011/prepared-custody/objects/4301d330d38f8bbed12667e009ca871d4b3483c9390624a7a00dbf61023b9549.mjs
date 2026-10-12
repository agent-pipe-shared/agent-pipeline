// SPDX-License-Identifier: SUL-1.0
// Transport fidelity only. A caller's binding is not approval verification.
import { createHash } from 'node:crypto';

export const REQUEST_SCHEMA = 'pipeline.bound-artifact-transfer-request.v1';
export const BUNDLE_SCHEMA = 'pipeline.bound-artifact-transfer.v1';
export const MAX_ARTIFACT_BYTES = 1024 * 1024;
export const MAX_TOTAL_BYTES = 8 * MAX_ARTIFACT_BYTES;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => object(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
const digest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const id = (value) => typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/u.test(value);
const screenedArtifacts = new WeakMap();

export function transferSourcePath(value) {
  if (typeof value !== 'string' || value.length > 240 || !/^[a-zA-Z0-9_./-]+$/u.test(value)) return false;
  const parts = value.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..' || part.startsWith('.'))) return false;
  // This route is for declared public evidence/documents; never sessions or key stores.
  if (!['evidence', 'specs', 'docs', 'backlog'].includes(parts[0])) return false;
  return !parts.some((part) => /(?:session|transcript|credential|secret|private|key)/iu.test(part))
    && /\.(?:json|md|txt)$/u.test(value);
}

export function validateTransferRequest(request) {
  if (!exact(request, ['schema', 'artifacts']) || request.schema !== REQUEST_SCHEMA
    || !Array.isArray(request.artifacts) || request.artifacts.length < 1 || request.artifacts.length > 64) return false;
  const seen = new Set();
  return request.artifacts.every((entry) => {
    if (!exact(entry, ['id', 'sourcePath', 'classification', 'binding']) || !id(entry.id) || seen.has(entry.id)
      || !['public', 'private', 'unknown'].includes(entry.classification)
      || !exact(entry.binding, ['kind', 'sha256']) || !['state', 'approval', 'gate-receipt'].includes(entry.binding.kind)
      || !digest(entry.binding.sha256)) return false;
    // A private/unknown reference is never consumed or echoed. It can be an origin-only locator.
    if (typeof entry.sourcePath !== 'string' || entry.sourcePath.length < 1 || entry.sourcePath.length > 4096) return false;
    seen.add(entry.id);
    return true;
  });
}

// A refusal screen, not a redactor: it cannot silently alter any bound bytes.
// Drive-letter matches require an actual slash after ':' and cannot span a newline.
// POSIX matches require the real home prefixes, not fragments such as `ly:\n-`.
export function hasPrivateTransferContent(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_ARTIFACT_BYTES) return true;
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) return true; // no binary/unclassifiable export
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/u.test(text)) return true;
  return /(?:^|[^A-Za-z0-9])[A-Za-z]:[\\/][^\s"'<>]*|(?:^|[^A-Za-z0-9])(?:\/home\/|\/Users\/|~\/)[^\s"'<>]+|\\\\[^\s\\/]+[\\/][^\s]+/u.test(text)
    || /(?:^|[\s"'(=:])\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+|\bfile:(?:\/|\\){2,}[^\s"'<>]+/u.test(text)
    || /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9_-]{16,}|AKIA[A-Z0-9]{16})\b/iu.test(text)
    || /(?:password|passwd|api[_-]?key|access[_-]?token|authorization|credential|secret)\s*["']?\s*[:=]\s*["']?[^\s"',}\]]+/iu.test(text)
    || /["'](?:messages|transcript|rawSession|session_id|sessionId|prompt)["']\s*:/iu.test(text);
}

// In-process source-owned screening witness. A shape clone or `screened:true`
// cannot stand in for the exact byte snapshot this producer inspected.
export function screenPublicTransferArtifact(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_ARTIFACT_BYTES) return { status: 'held', code: 'BT-PRIVACY' };
  const snapshot = Buffer.from(bytes);
  if (hasPrivateTransferContent(snapshot)) return { status: 'held', code: 'BT-PRIVACY' };
  const handle = Object.freeze({ schema: 'pipeline.transfer-screened-artifact.v1',
    sha256: sha(snapshot), byteLength: snapshot.length });
  screenedArtifacts.set(handle, snapshot);
  return { status: 'screened', handle };
}

export function readScreenedTransferArtifact(handle, expectedSha256) {
  if (!object(handle) || !digest(expectedSha256)) return null;
  const snapshot = screenedArtifacts.get(handle);
  if (!snapshot || handle.sha256 !== expectedSha256 || sha(snapshot) !== expectedSha256) return null;
  return Buffer.from(snapshot);
}

function held(entry, code, actualSha256 = null) {
  return { id: entry.id, classification: entry.classification, bindingKind: entry.binding.kind,
    expectedSha256: entry.binding.sha256, actualSha256, status: 'held', code,
    recovery: 'must be copied from the origin device' };
}

/** readArtifact is invoked only for a safe, explicitly public reference.
 * Returns a separate public projection and byte-exact transport payloads.
 * Never returns sourcePath, input text, or exception text in the projection.
 */
export function prepareBoundArtifactTransfer(request, readArtifact) {
  if (!validateTransferRequest(request) || typeof readArtifact !== 'function') {
    return { schema: BUNDLE_SCHEMA, status: 'refused', code: 'BT-REQUEST', publicProjection: null, payloads: [] };
  }
  let total = 0;
  const entries = [];
  const payloads = [];
  for (const entry of request.artifacts) {
    if (entry.classification !== 'public') {
      entries.push(held(entry, entry.classification === 'private' ? 'BT-PRIVATE' : 'BT-CLASSIFICATION-UNKNOWN'));
      continue;
    }
    if (!transferSourcePath(entry.sourcePath)) { entries.push(held(entry, 'BT-SOURCE-PATH')); continue; }
    let bytes;
    try { bytes = readArtifact(entry.sourcePath, MAX_ARTIFACT_BYTES); } catch { entries.push(held(entry, 'BT-SOURCE-UNAVAILABLE')); continue; }
    if (!Buffer.isBuffer(bytes) || bytes.length > MAX_ARTIFACT_BYTES) { entries.push(held(entry, 'BT-BYTE-LIMIT')); continue; }
    bytes = Buffer.from(bytes);
    const actualSha256 = sha(bytes);
    if (actualSha256 !== entry.binding.sha256) { entries.push(held(entry, 'BT-DIGEST-MISMATCH', actualSha256)); continue; }
    const screened = screenPublicTransferArtifact(bytes);
    if (screened.status !== 'screened') { entries.push(held(entry, 'BT-PRIVACY')); continue; }
    if (total + bytes.length > MAX_TOTAL_BYTES) { entries.push(held(entry, 'BT-TOTAL-LIMIT')); continue; }
    total += bytes.length;
    entries.push({ id: entry.id, classification: 'public', bindingKind: entry.binding.kind,
      expectedSha256: entry.binding.sha256, actualSha256, bytes: bytes.length,
      status: 'carried-byte-exact', code: null, recovery: null });
    payloads.push({ id: entry.id, sha256: actualSha256, bytes: readScreenedTransferArtifact(screened.handle, actualSha256) });
  }
  const publicProjection = { schema: 'pipeline.bound-artifact-transfer-public.v1',
    authority: 'transport-fidelity-only', status: entries.some((entry) => entry.status === 'held') ? 'held' : 'ready', entries };
  return { schema: BUNDLE_SCHEMA, status: publicProjection.status, code: null,
    publicProjection, payloads, publicProjectionSha256: sha(Buffer.from(JSON.stringify(publicProjection) + '\n')) };
}

export function verifyTransferredArtifact(bytes, expectedSha256) {
  return Buffer.isBuffer(bytes) && digest(expectedSha256) && sha(bytes) === expectedSha256;
}
