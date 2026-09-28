// SPDX-License-Identifier: SUL-1.0
// Linux process journal for owned Codex readiness sessions.
import { createHash, randomBytes } from 'node:crypto';
import { closeSync, constants, fstatSync, fsyncSync, linkSync, lstatSync, mkdirSync,
  openSync, readFileSync, readSync, readdirSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from './codex-sandbox-compatibility.mjs';
import { parseStrictJson } from './governance-event.mjs';

export const hostDigest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value)
  ? value : canonicalJson(value)).digest('hex');
export const hostFault = code => Object.assign(new Error(code), { code });
export function parseLinuxProcessStat(text) {
  // comm can contain spaces and closing parentheses. Fields after its last
  // closing parenthesis start with field 3 (state); starttime is field 22.
  const end = text.lastIndexOf(')');
  const pid = Number(text.slice(0, text.indexOf(' ')));
  const fields = text.slice(end + 2).trim().split(/\s+/);
  if (end < 0 || !Number.isSafeInteger(pid) || pid < 1 || fields.length < 20
    || !/^\d+$/.test(fields[19])) throw hostFault('host-proc-stat-invalid');
  return { pid, state: fields[0], parentPid: Number(fields[1]), group: Number(fields[2]),
    session: Number(fields[3]), start: fields[19] };
}
export function observeLinuxProcess(pid) {
  if (process.platform !== 'linux' || !Number.isSafeInteger(pid) || pid < 1) throw hostFault('host-process-platform-unavailable');
  try {
    const before = parseLinuxProcessStat(readFileSync(`/proc/${pid}/stat`, 'utf8'));
    const status = readFileSync(`/proc/${pid}/status`, 'utf8');
    const uid = Number(/^Uid:\s+(\d+)/m.exec(status)?.[1]);
    const argv = readFileSync(`/proc/${pid}/cmdline`).toString('utf8').split('\0').filter(Boolean);
    const executable = realpathSync(`/proc/${pid}/exe`);
    const after = parseLinuxProcessStat(readFileSync(`/proc/${pid}/stat`, 'utf8'));
    if (before.start !== after.start || before.group !== after.group || before.session !== after.session
      || !Number.isSafeInteger(uid)) throw hostFault('host-process-identity-changed');
    return { ...after, uid, executable, argvSha256: hostDigest(argv),
      bootSha256: hostDigest(readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim()) };
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ESRCH') return null;
    throw error;
  }
}
export function sameProcess(expected, observed) {
  return observed !== null && ['pid', 'start', 'group', 'session', 'uid', 'executable', 'argvSha256', 'bootSha256']
    .every(key => expected?.[key] === observed[key]) && !['Z', 'X'].includes(observed.state);
}
export function checkedHostDirectory(path) {
  const absolute = resolve(path), stat = lstatSync(absolute);
  if (absolute !== path || realpathSync(path) !== path || stat.isSymbolicLink() || !stat.isDirectory()
    || stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0) throw hostFault('host-journal-directory-unsafe');
  return path;
}
// Registration is local to this controller. The private caller supplies the
// authoritative Git common directory; this helper is not repository discovery.
const registeredProcessRoots = new Map();
function rootIdentity(path, privateMode) {
  const stat = lstatSync(path);
  if (typeof path !== 'string' || resolve(path) !== path || realpathSync(path) !== path
    || !stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid()
    || (stat.mode & 0o022) !== 0 || privateMode && (stat.mode & 0o077) !== 0) throw hostFault('host-process-root-unsafe');
  return { path, dev: stat.dev, ino: stat.ino, uid: stat.uid, mode: stat.mode, privateMode };
}
function sameRootIdentity(expected) {
  const current = rootIdentity(expected.path, expected.privateMode);
  return ['dev', 'ino', 'uid', 'mode'].every(key => current[key] === expected[key]);
}
/** Called by the sealed controller before createHostJournal, including re-entry. */
export function registerCodexHostProcessRoot({ gitCommonDir, repoFingerprint, purpose = 'design-readiness' } = {}) {
  if (process.platform !== 'linux') throw hostFault('host-process-platform-unavailable');
  if (typeof gitCommonDir !== 'string' || typeof repoFingerprint !== 'string'
    || !/^[a-f0-9]{64}$/.test(repoFingerprint) || !['design-readiness', 'advisor'].includes(purpose)) {
    throw hostFault('host-process-root-registration-invalid');
  }
  const roots = [rootIdentity(gitCommonDir, false)];
  const namespace = purpose === 'advisor' ? 'advisor-codex' : 'design-readiness-codex';
  let path = gitCommonDir;
  for (const segment of ['agent-pipeline', namespace, repoFingerprint, 'processes']) {
    path = join(path, segment);
    try { mkdirSync(path, { mode: 0o700 }); } catch (error) { if (error?.code !== 'EEXIST') throw error; }
    // The shared parent is also used by sanctioned governance writers (0755).
    // Duty, repository and process directories remain owner-private.
    roots.push(rootIdentity(path, segment !== 'agent-pipeline'));
    const fd = openSync(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY);
    try { fsyncSync(fd); } finally { closeSync(fd); }
  }
  if (!roots.every(sameRootIdentity)) throw hostFault('host-process-root-changed');
  registeredProcessRoots.set(path, { purpose, repoFingerprint, roots });
  return path;
}
function assertProcessRoot(parent, binding) {
  // Preserve the existing Readiness admission boundary and default behavior.
  if (/\/agent-pipeline\/design-readiness-codex\/[a-f0-9]{64}\/processes$/.test(parent)) return;
  const registration = registeredProcessRoots.get(parent);
  if (!registration || registration.purpose !== 'advisor'
    || binding?.repoFingerprint !== registration.repoFingerprint) throw hostFault('host-process-root-unregistered');
  if (!registration.roots.every(sameRootIdentity)) throw hostFault('host-process-root-changed');
}
const names = new Set(['intent', 'launcher', 'admission', 'child-intent', 'worker', 'child', 'exec-admission', 'execution', 'terminal', 'recovered-child', 'recovery']);
export function writeHostJournal(directory, name, value) {
  checkedHostDirectory(directory);
  if (!names.has(name)) throw hostFault('host-journal-name-invalid');
  const bytes = Buffer.from(canonicalJson(value));
  const temporary = join(directory, `.pending-${randomBytes(16).toString('hex')}`);
  let fd;
  try {
    fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    writeFileSync(fd, bytes); fsyncSync(fd); closeSync(fd); fd = undefined;
    linkSync(temporary, join(directory, `${name}.json`));
    const parent = openSync(directory, constants.O_RDONLY | constants.O_DIRECTORY);
    try { fsyncSync(parent); } finally { closeSync(parent); }
  } finally {
    if (fd !== undefined) closeSync(fd);
    try { unlinkSync(temporary); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
    // Persist temporary-link removal before a caller may spawn. Otherwise a
    // crash can resurrect nlink=2 and invalidate the registered identity.
    const parent = openSync(directory, constants.O_RDONLY | constants.O_DIRECTORY);
    try { fsyncSync(parent); } finally { closeSync(parent); }
  }
  return { value, sha256: hostDigest(bytes) };
}
export function readHostJournal(directory, name) {
  checkedHostDirectory(directory);
  if (!names.has(name)) throw hostFault('host-journal-name-invalid');
  const path = join(directory, `${name}.json`);
  let fd;
  try {
    const before = lstatSync(path, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.size > 524288n || (before.mode & 0o077n) !== 0n
      || before.uid !== BigInt(process.getuid())) throw hostFault('host-journal-file-unsafe');
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = fstatSync(fd, { bigint: true });
    const fields = ['dev', 'ino', 'mode', 'uid', 'nlink', 'size', 'mtimeNs', 'ctimeNs'];
    const same = stat => fields.every(key => stat[key] === before[key]);
    if (!same(opened)) throw hostFault('host-journal-file-changed');
    // The overflow byte bounds actual reads even if the file grows after fstat.
    const buffer = Buffer.alloc(524289);
    let length = 0;
    while (length < buffer.length) {
      const count = readSync(fd, buffer, length, buffer.length - length, length);
      if (count === 0) break;
      length += count;
    }
    if (length > 524288) throw hostFault('host-journal-file-unsafe');
    const after = lstatSync(path, { bigint: true });
    const final = fstatSync(fd, { bigint: true });
    if (BigInt(length) !== before.size || ![after, final].every(same)) throw hostFault('host-journal-file-changed');
    const bytes = buffer.subarray(0, length);
    const value = parseStrictJson(bytes);
    if (canonicalJson(value) !== bytes.toString('utf8')) throw hostFault('host-journal-noncanonical');
    return { value, sha256: hostDigest(bytes) };
  } catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
  finally { if (fd !== undefined) closeSync(fd); }
}
export function createHostJournal(parent, fields, { receiptId = `drh_${randomBytes(16).toString('hex')}` } = {}) {
  if (process.platform !== 'linux') throw hostFault('host-process-platform-unavailable');
  checkedHostDirectory(parent);
  assertProcessRoot(parent, fields?.binding);
  if (!fields || Object.keys(fields).sort().join(',') !== ['binding', 'executable', 'nodeExecutable', 'launcher', 'worker', 'args', 'cwd'].sort().join(',')) {
    throw hostFault('host-process-intent-invalid');
  }
  if (!/^drh_[a-f0-9]{32}$/.test(receiptId)) throw hostFault('host-process-receipt-id-invalid');
  const directory = join(parent, `codex-host-${receiptId}`);
  mkdirSync(directory, { mode: 0o700 });
  assertProcessRoot(parent, fields.binding);
  const parentFd = openSync(parent, constants.O_RDONLY | constants.O_DIRECTORY);
  try { fsyncSync(parentFd); } finally { closeSync(parentFd); }
  const runId = randomBytes(32).toString('hex');
  const record = { schema: 'pipeline.codex-host-process-intent.v1', runId, receiptId, ...fields,
    controller: observeLinuxProcess(process.pid), createdAt: new Date().toISOString() };
  const intent = writeHostJournal(directory, 'intent', record);
  assertProcessRoot(parent, fields.binding);
  return { directory, intent };
}
export function listOwnedSession(launcher) {
  const members = [];
  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) continue;
    let stat;
    try { stat = parseLinuxProcessStat(readFileSync(`/proc/${entry}/stat`, 'utf8')); }
    catch (error) { if (error?.code === 'ENOENT' || error?.code === 'ESRCH') continue; throw error; }
    if (stat.session !== launcher.session || stat.group !== launcher.group || ['Z', 'X'].includes(stat.state)) continue;
    const observed = observeLinuxProcess(stat.pid);
    if (!observed) continue;
    if (observed.uid !== launcher.uid || observed.bootSha256 !== launcher.bootSha256
      || BigInt(observed.start) < BigInt(launcher.start)) throw hostFault('host-session-ownership-unverified');
    members.push(observed);
  }
  return members;
}
export function journalExecutable(path) {
  const physical = realpathSync(path), stat = lstatSync(physical);
  if (!stat.isFile() || stat.uid !== process.getuid() && stat.uid !== 0 || !(stat.mode & 0o111)) throw hostFault('host-executable-invalid');
  return { path: physical, sha256: hostDigest(readFileSync(physical)) };
}
