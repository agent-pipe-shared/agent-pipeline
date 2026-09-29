// SPDX-License-Identifier: SUL-1.0
// Proposed telemetry only. Linux descriptor anchors avoid following a replaced
// pathname; other hosts return unavailable. This is not an authority store.
import * as fs from 'node:fs';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { isAbsolute, join, resolve } from 'node:path';
import { assertPrivateRegularFile } from './private-boundary.mjs';

const SCHEMA = 'pipeline.lifecycle-denial-loop.v1';
const HEX = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const STATUSES = new Set(('portable-seed-required runtime-initialization-required runtime-attestation-required restart-required kickoff-required host-repository-init-required partial invalid unsafe migration-required adoption-required repository-mount-read-only repository-control-path-invalid git-capability-unavailable project-root-read-only repository-mode-unsupported session-capability-unavailable worktree-capability-unavailable runtime-target-read-only runtime-readback-unavailable projection-drift continuity-damaged repository-observation-unavailable continuity-observation-unavailable app-server-execution-denied app-server-not-running app-server-unavailable intake-required intake-design-questions-required bootstrap-binding-required recovery-required').split(' '));
const REASONS = new Set(['PORG-NOT-READY', 'PORG-INVALID-OBSERVATION', 'PORG-OBSERVATION-UNAVAILABLE']);
const KINDS = new Set(['command', 'collect-input', 'restart-process', 'external-operator']);
const STATE_FIELDS = ['sourceSha256', 'targetsSha256', 'barrierSha256', 'readbackSha256', 'stateSha256', 'handoverSha256', 'historySha256', 'checkpointSha256', 'planSha256'];
const failure = () => ({ status: 'unavailable', loop: false, count: 0 });
const exact = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const mac = (key, value) => createHmac('sha256', Buffer.from(key, 'hex')).update(JSON.stringify(value)).digest('hex');
const sameIdentity = (a, b) => a.dev === b.dev && a.ino === b.ino && a.mode === b.mode;

function projection(input) {
  if (!exact(input.scope, ['sessionId', 'agentId']) || typeof input.scope.sessionId !== 'string' || !ID.test(input.scope.sessionId)
    || !(input.scope.agentId === null || typeof input.scope.agentId === 'string' && ID.test(input.scope.agentId))) throw new Error('identity');
  if (!['deny', 'admit'].includes(input.outcome)) throw new Error('outcome');
  const scope = hash(JSON.stringify([input.scope.sessionId, input.scope.agentId]));
  if (input.outcome === 'admit') return { scope, reset: true };
  // Equality is explicitly established by the host adapter; this module cannot
  // infer that a caller attempted the currently offered action from a payload.
  if (typeof input.offeredActionMatched !== 'boolean') throw new Error('match observation');
  if (input.offeredActionMatched !== true) return { scope, reset: true, foreign: true };
  if (!STATUSES.has(input.lifecycleStatus) || !REASONS.has(input.reason)) throw new Error('reason/status');
  const action = input.action;
  if (!exact(action, ['kind', 'executable', 'argv']) || !KINDS.has(action.kind)
    || typeof action.executable !== 'string' || action.executable.length === 0 || action.executable.length > 4096
    || !Array.isArray(action.argv) || action.argv.length > 96
    || action.argv.some(value => typeof value !== 'string' || Buffer.byteLength(value) > 16384)
    || Buffer.byteLength(JSON.stringify(action)) > 65536) throw new Error('action');
  if (!exact(input.state, STATE_FIELDS)) throw new Error('state');
  const state = STATE_FIELDS.map(field => {
    const value = input.state[field];
    if (!(value === null || typeof value === 'string' && HEX.test(value))) throw new Error('state digest');
    return value;
  });
  return { scope, status: input.lifecycleStatus, reason: input.reason, kind: action.kind,
    action: [action.kind, action.executable, action.argv], state };
}

function physicalRoot(commonDir) {
  if (typeof commonDir !== 'string' || !isAbsolute(commonDir) || resolve(commonDir) !== commonDir) throw new Error('root');
  const info = fs.lstatSync(commonDir);
  if (!info.isDirectory() || info.isSymbolicLink() || fs.realpathSync(commonDir) !== commonDir) throw new Error('root alias');
  // realpath equality checks every existing ancestor, not just the leaf.
  return info;
}

function anchoredDirectory(commonDir, descriptors) {
  if (process.platform !== 'linux') throw new Error('descriptor anchors unavailable');
  const rootInfo = physicalRoot(commonDir);
  const rootFd = fs.openSync(commonDir, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
  descriptors.push(rootFd);
  if (!sameIdentity(rootInfo, fs.fstatSync(rootFd))) throw new Error('root race');
  let fd = rootFd;
  let physical = commonDir;
  const check = () => {
    if (!sameIdentity(rootInfo, physicalRoot(commonDir))) throw new Error('root changed');
    for (const descriptor of descriptors) {
      const resolved = fs.realpathSync(`/proc/self/fd/${descriptor}`);
      const stat = fs.fstatSync(descriptor);
      if (!stat.isDirectory() || fs.realpathSync(resolved) !== resolved
        || !sameIdentity(stat, fs.lstatSync(resolved))) throw new Error('directory changed');
    }
    if (fs.realpathSync(`/proc/self/fd/${fd}`) !== physical) throw new Error('parent moved');
  };
  for (const name of ['agent-pipeline', 'lifecycle-denial-loop']) {
    check();
    const anchored = `/proc/self/fd/${fd}/${name}`;
    try { fs.mkdirSync(anchored, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const info = fs.lstatSync(anchored);
    if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) throw new Error('private directory');
    const next = fs.openSync(anchored, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
    descriptors.push(next);
    if (!sameIdentity(info, fs.fstatSync(next))) throw new Error('directory race');
    fd = next; physical = join(physical, name);
  }
  check();
  return { path: `/proc/self/fd/${fd}`, fd, check };
}

function readRecord(path) {
  let before;
  try { before = assertPrivateRegularFile(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (before.size > 2048) throw new Error('record bound');
  const fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const opened = fs.fstatSync(fd);
    if (!sameIdentity(before, opened) || opened.size !== before.size || opened.mtimeMs !== before.mtimeMs) throw new Error('read race');
    const bytes = Buffer.alloc(before.size + 1);
    const used = fs.readSync(fd, bytes, 0, bytes.length, 0);
    const after = assertPrivateRegularFile(path);
    if (used !== before.size || !sameIdentity(before, after) || after.size !== before.size
      || after.mtimeMs !== before.mtimeMs || !sameIdentity(opened, fs.fstatSync(fd))) throw new Error('read race');
    const value = JSON.parse(bytes.subarray(0, used).toString('utf8'));
    if (!exact(value, ['schema', 'scope', 'key', 'status', 'reason', 'kind', 'action', 'state', 'count'])
      || value.schema !== SCHEMA || !HEX.test(value.scope) || !HEX.test(value.key)
      || !STATUSES.has(value.status) || !REASONS.has(value.reason) || !KINDS.has(value.kind)
      || !HEX.test(value.action) || !HEX.test(value.state) || ![1, 2].includes(value.count)) throw new Error('record schema');
    return { value, identity: after, bytes: bytes.subarray(0, used) };
  } finally { fs.closeSync(fd); }
}

/** Never admits/denies tools. Adapter owns matching and actual verdict.
 * bounded one record + one transient lock/temp per scope; no event history.
 * Other hosts, busy/crashed locks and all IO/shape failures yield unavailable.
 * Linux pathname checks plus descriptor anchors contain redirection races;
 * this is not an authentication guarantee against an actor controlling Git state.
 */
function recordLifecycleDenial(input, { beforePublish = () => {}, afterPublish = () => {} } = {}) {
  const descriptors = [];
  let directory; let lock; let lockIdentity; let lockBytes; let temporary; let tempIdentity; let tempBytes;
  try {
    const value = projection(input);
    directory = anchoredDirectory(input.commonDir, descriptors);
    const target = `${directory.path}/${value.scope}.json`;
    lock = `${directory.path}/${value.scope}.lock`;
    const lockFd = fs.openSync(lock, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    try { lockBytes = randomBytes(32); fs.writeFileSync(lockFd, lockBytes); lockIdentity = fs.fstatSync(lockFd); }
    finally { fs.closeSync(lockFd); }
    const checkLock = () => {
      const current = assertPrivateRegularFile(lock);
      if (!sameIdentity(current, lockIdentity) || current.size !== lockBytes.length
        || !fs.readFileSync(lock).equals(lockBytes)) throw new Error('lock ownership changed');
    };
    directory.check();
    const prior = readRecord(target);
    if (prior && prior.value.scope !== value.scope) throw new Error('scope conflict');
    if (value.reset) {
      if (prior) {
        directory.check();
        checkLock();
        if (!sameIdentity(prior.identity, assertPrivateRegularFile(target))) throw new Error('reset race');
        fs.unlinkSync(target); fs.fsyncSync(directory.fd);
      }
      directory.check();
      return {status: 'reset', loop: false, count: 0};
    }
    const key = prior?.value.key ?? randomBytes(32).toString('hex');
    const action = mac(key, value.action);
    const state = mac(key, value.state);
    const same = prior && prior.value.action === action && prior.value.state === state
      && prior.value.status === value.status && prior.value.reason === value.reason && prior.value.kind === value.kind;
    // Rotate the scope-local key when the observed state/action changes.
    const nextKey = prior && !same ? randomBytes(32).toString('hex') : key;
    const record = {schema: SCHEMA, scope: value.scope, key: nextKey, status: value.status, reason: value.reason,
      kind: value.kind, action: mac(nextKey, value.action), state: mac(nextKey, value.state), count: same ? 2 : 1};
    temporary = `${directory.path}/${value.scope}.tmp`;
    const tempFd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    try { tempBytes = Buffer.from(JSON.stringify(record) + '\n'); fs.writeFileSync(tempFd, tempBytes); fs.fsyncSync(tempFd); tempIdentity = fs.fstatSync(tempFd); }
    finally { fs.closeSync(tempFd); }
    beforePublish();
    directory.check();
    checkLock();
    const current = readRecord(target);
    if ((prior === null) !== (current === null) || prior && (!sameIdentity(prior.identity, current.identity)
      || !prior.bytes.equals(current.bytes))) throw new Error('publication race');
    if (!sameIdentity(tempIdentity, assertPrivateRegularFile(temporary))) throw new Error('temp race');
    fs.renameSync(temporary, target); temporary = null; fs.fsyncSync(directory.fd);
    afterPublish();
    directory.check();
    checkLock();
    const readback = readRecord(target);
    if (!readback || JSON.stringify(readback.value) !== JSON.stringify(record)) throw new Error('readback');
    return {status: 'recorded', loop: record.count === 2, count: record.count,
      actionFingerprint: record.action, stateFingerprint: record.state};
  } catch { return failure(); }
  finally {
    // Never delete a raced-in foreign artifact. Descriptor anchors keep cleanup
    // inside the original opened directory even if its public path was moved.
    for (const [path, identity, bytes] of [[temporary, tempIdentity, tempBytes], [lock, lockIdentity, lockBytes]]) {
      if (!path || !identity) continue;
      try {
        const current = fs.lstatSync(path);
        if (sameIdentity(current, identity) && current.isFile() && current.nlink === 1 && current.size === bytes.length
          && fs.readFileSync(path).equals(bytes)) fs.unlinkSync(path);
      } catch {}
    }
    for (const fd of descriptors.reverse()) { try { fs.closeSync(fd); } catch {} }
  }
}

export function observeReturnedActionDenial({commonDir, scope, offeredActionMatches, state, reason, status, action}, deps = {}) {
  const observed = recordLifecycleDenial({commonDir, scope, offeredActionMatched: offeredActionMatches,
    state, reason, lifecycleStatus: status, action, outcome: 'deny'}, deps);
  return observed.status !== 'recorded' ? null : {
    code: observed.loop ? 'GUARD-LIFECYCLE-RETURNED-ACTION-LOOP' : null,
    count: observed.count, actionFingerprint: observed.actionFingerprint, stateFingerprint: observed.stateFingerprint,
  };
}

export function resetLifecycleDenial({commonDir, scope}) {
  return recordLifecycleDenial({commonDir, scope, outcome: 'admit'}).status === 'reset';
}
