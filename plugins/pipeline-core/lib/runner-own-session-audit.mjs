// SPDX-License-Identifier: SUL-1.0
// Private implementation of runner-transcript-recovery's consented metadata lane.
import { constants, lstatSync, realpathSync, opendirSync, openSync, closeSync, fstatSync, readSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { resolveModelRoleHostSessionIdentity } from './model-role-host-identity.mjs';

const LIMIT = { entries: 4096, directories: 256, depth: 8, prefix: 512 * 1024, file: 8 * 1024 * 1024, total: 64 * 1024 * 1024 };
const digest = value => createHash('sha256').update(value).digest('hex');
const result = reason => ({ schema: 'pipeline.runner-own-session-audit.v1', runner: 'codex', status: 'unavailable', reason });
const fail = code => { throw new Error(code); };

function physical(path, directory) {
  const resolved = resolve(path);
  if (realpathSync(resolved) !== resolved) fail('path-alias');
  for (let part = resolved; ; part = dirname(part)) {
    if (lstatSync(part).isSymbolicLink()) fail('path-alias');
    if (dirname(part) === part) break;
  }
  const stat = lstatSync(resolved);
  if (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1) fail('path-alias');
  return resolved;
}

function snapshot(path, cap, budget) {
  physical(path, false);
  if (constants.O_NOFOLLOW === undefined) fail('nofollow-unavailable');
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.nlink !== 1) fail('path-alias');
    const count = Math.min(before.size, cap);
    budget.bytes += count;
    if (budget.bytes > LIMIT.total) fail('scan-bound-exceeded');
    const bytes = Buffer.alloc(count);
    let offset = 0;
    while (offset < count) {
      const got = readSync(fd, bytes, offset, count - offset, offset);
      if (!got) fail('snapshot-changed');
      offset += got;
    }
    const after = fstatSync(fd), pathname = lstatSync(path);
    if (before.dev !== pathname.dev || before.ino !== pathname.ino || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) fail('snapshot-changed');
    return { bytes, size: before.size, identity: `${before.dev}:${before.ino}:${before.size}:${before.mtimeMs}:${before.ctimeMs}` };
  } finally { closeSync(fd); }
}

function records(bytes, complete) {
  const lines = bytes.toString('utf8').split('\n');
  if (!complete) lines.pop(); // Never parse a clipped or in-progress record.
  const parsed = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    if (Buffer.byteLength(line) > LIMIT.prefix) fail('record-bound-exceeded');
    try { parsed.push(JSON.parse(line)); } catch { fail('metadata-malformed'); }
  }
  return parsed;
}

function authenticate(entries, sessionId, root) {
  const metas = entries.filter(row => row?.type === 'session_meta');
  if (!metas.length) return false;
  const matching = metas.filter(row => row?.payload?.id === sessionId);
  if (!matching.length) return false;
  if (metas.length !== 1 || typeof matching[0].payload.cwd !== 'string'
    || !isAbsolute(matching[0].payload.cwd) || physical(matching[0].payload.cwd, true) !== root) fail('session-repository-conflict');
  return true;
}

/** No supplied session selector, storage pathname, transcript body, or read grant. */
export function auditCurrentRunnerSession(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || Object.keys(options).some(key => !['rootDir', 'runner', 'metadataConsent', 'operation'].includes(key))
    || (options.operation !== undefined && options.operation !== 'audit-current')) return result('invalid-invocation');
  const { rootDir, runner, metadataConsent } = options;
  if (metadataConsent !== 'approved') return result('metadata-consent-required');
  if (runner !== 'codex') return result('runner-unavailable');
  const identity = resolveModelRoleHostSessionIdentity({ runner });
  if (!identity.ok) return result(identity.code);
  try {
    if (typeof rootDir !== 'string' || !isAbsolute(rootDir)) fail('repository-unavailable');
    const root = physical(rootDir, true);
    const configured = process.env.CODEX_HOME;
    if (configured !== undefined && !isAbsolute(configured)) fail('storage-unavailable');
    const storage = physical(join(configured ?? join(homedir(), '.codex'), 'sessions'), true);
    const queue = [{ path: storage, depth: 0 }], budget = { bytes: 0 };
    let entries = 0, directories = 0, selected = null;
    while (queue.length) {
      const directory = queue.pop();
      if (++directories > LIMIT.directories || directory.depth > LIMIT.depth) fail('scan-bound-exceeded');
      physical(directory.path, true);
      const handle = opendirSync(directory.path);
      try { for (let entry; (entry = handle.readSync()) !== null;) {
        if (++entries > LIMIT.entries) fail('scan-bound-exceeded');
        if (entry.isSymbolicLink()) fail('path-alias');
        const path = join(directory.path, entry.name);
        if (entry.isDirectory()) queue.push({ path, depth: directory.depth + 1 });
        else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          const prefix = snapshot(path, LIMIT.prefix, budget);
          if (authenticate(records(prefix.bytes, prefix.size <= LIMIT.prefix && prefix.bytes.at(-1) === 10), identity.sessionId, root)) {
            if (selected) fail('session-identity-ambiguous');
            selected = { path, prefix };
          }
        }
      } } finally { handle.closeSync(); }
    }
    if (!selected) fail('current-session-unavailable');
    if (selected.prefix.size > LIMIT.file) fail('session-bound-exceeded');
    const current = snapshot(selected.path, LIMIT.file, budget);
    if (current.identity !== selected.prefix.identity) fail('snapshot-changed');
    const observed = records(current.bytes, current.bytes.at(-1) === 10);
    if (!authenticate(observed, identity.sessionId, root)) fail('session-identity-changed');
    let modelIdentity = 'unavailable', tokenCounters = 'unavailable';
    for (const row of observed) {
      if (row?.type === 'turn_context' && typeof row.payload?.model === 'string'
        && /^(?:gpt-|codex-|o[1-9])[A-Za-z0-9._-]{1,80}$/u.test(row.payload.model)) modelIdentity = row.payload.model;
      if (row?.type === 'event_msg' && row.payload?.type === 'token_count') {
        const usage = row.payload.info?.total_token_usage;
        const keys = ['input_tokens', 'cached_input_tokens', 'output_tokens', 'reasoning_output_tokens', 'total_tokens'];
        if (usage && keys.every(key => Number.isSafeInteger(usage[key]) && usage[key] >= 0)) {
          tokenCounters = Object.fromEntries(keys.map(key => [key, usage[key]]));
        } else tokenCounters = 'unavailable';
      }
    }
    const fresh = resolveModelRoleHostSessionIdentity({ runner });
    if (!fresh.ok || fresh.sessionId !== identity.sessionId || physical(root, true) !== root
      || physical(storage, true) !== storage) fail('session-identity-changed');
    return { schema: 'pipeline.runner-own-session-audit.v1', runner, status: 'available',
      identityAssurance: 'host-environment-and-local-session-metadata',
      sessionSha256: digest(identity.sessionId), repositorySha256: digest(root),
      modelIdentity, phaseWallTime: 'unavailable', tokenCounters };
  } catch (error) {
    const known = new Set(['path-alias', 'nofollow-unavailable', 'scan-bound-exceeded', 'snapshot-changed',
      'record-bound-exceeded', 'metadata-malformed', 'session-repository-conflict', 'repository-unavailable',
      'storage-unavailable', 'session-identity-ambiguous', 'current-session-unavailable', 'session-bound-exceeded', 'session-identity-changed']);
    return result(known.has(error.message) ? error.message : 'host-metadata-unavailable');
  }
}
