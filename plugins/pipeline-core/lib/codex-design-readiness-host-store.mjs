// SPDX-License-Identifier: SUL-1.0
// Immutable private Codex host observations; never provider attestation.
import { closeSync, constants, fstatSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync,
  readSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from './codex-sandbox-compatibility.mjs';
import { parseStrictJson } from './governance-event.mjs';
import { hostDigest, hostFault, checkedHostDirectory } from './codex-host-process-journal.mjs';
import { validateCodexReadinessHostRecord } from './codex-readiness-host-record.mjs';
import { readFinalizedReadinessObservation } from './codex-readiness-finalization.mjs';
import { readHostJournal } from './codex-host-process-journal.mjs';
import { verifyRegisteredCodexOwnership } from './codex-readiness-ownership-verifier.mjs';

const idPattern = /^drh_[a-f0-9]{32}$/;
function syncDirectory(directory) {
  const fd = openSync(directory, constants.O_RDONLY | constants.O_DIRECTORY);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
function checkedFile(path) {
  let fd;
  try {
    const before = lstatSync(path, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.size > 524288n
      || before.uid !== BigInt(process.getuid()) || (before.mode & 0o077n) !== 0n) return null;
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = fstatSync(fd, { bigint: true });
    const keys = ['dev', 'ino', 'mode', 'uid', 'nlink', 'size', 'mtimeNs', 'ctimeNs'];
    const same = stat => keys.every(key => stat[key] === before[key]);
    if (!same(opened)) return null;
    // Read at most the limit plus one overflow byte, even after racing growth.
    const buffer = Buffer.alloc(524289);
    let length = 0;
    while (length < buffer.length) {
      const count = readSync(fd, buffer, length, buffer.length - length, length);
      if (count === 0) break;
      length += count;
    }
    if (length > 524288) return null;
    const after = lstatSync(path, { bigint: true });
    const final = fstatSync(fd, { bigint: true });
    if (BigInt(length) !== before.size || ![after, final].every(same)) return null;
    const bytes = buffer.subarray(0, length);
    const value = parseStrictJson(bytes);
    if (canonicalJson(value) !== bytes.toString('utf8')) return null;
    return { value, sha256: hostDigest(bytes) };
  } catch { return null; }
  finally { if (fd !== undefined) closeSync(fd); }
}
function writeOnce(directory, path, record) {
  const temporary = join(directory, `.pending-${randomBytes(16).toString('hex')}`);
  let fd;
  try {
    fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    writeFileSync(fd, canonicalJson(record)); fsyncSync(fd); closeSync(fd); fd = undefined;
    linkSync(temporary, path);
  } finally {
    if (fd !== undefined) closeSync(fd);
    try { unlinkSync(temporary); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
    syncDirectory(directory);
  }
}

export function createCodexDesignReadinessHostStore({ gitCommonDir, repoFingerprint, trustedExecutablePath = null } = {}) {
  if (process.platform !== 'linux' || !/^[a-f0-9]{64}$/.test(repoFingerprint ?? '')) throw hostFault('CRHS-INPUT');
  if (typeof gitCommonDir !== 'string' || resolve(gitCommonDir) !== gitCommonDir || realpathSync(gitCommonDir) !== gitCommonDir) throw hostFault('CRHS-COMMON-DIR');
  const common = lstatSync(gitCommonDir);
  if (!common.isDirectory() || common.isSymbolicLink() || common.uid !== process.getuid() || (common.mode & 0o022) !== 0) throw hostFault('CRHS-COMMON-DIR');
  const shared = join(gitCommonDir, 'agent-pipeline');
  try { mkdirSync(shared, {mode:0o700}); } catch(error) { if(error?.code !== 'EEXIST') throw error; }
  const sharedStat = lstatSync(shared);
  if (!sharedStat.isDirectory() || sharedStat.isSymbolicLink() || realpathSync(shared) !== shared || sharedStat.uid !== process.getuid() || (sharedStat.mode & 0o022) !== 0) throw hostFault('CRHS-SHARED-DIRECTORY');
  // Shared coordinates may be 0755 but must remain the same owner-owned roots.
  const sharedRoots = [[gitCommonDir, common], [shared, sharedStat]].map(([path, stat]) => ({
    path, dev: stat.dev, ino: stat.ino, uid: stat.uid, mode: stat.mode,
  }));
  function assertSharedRoots() {
    try {
      for (const expected of sharedRoots) {
        const current = lstatSync(expected.path);
        if (!current.isDirectory() || current.isSymbolicLink() || realpathSync(expected.path) !== expected.path
          || current.uid !== process.getuid() || (current.mode & 0o022) !== 0
          || !['dev', 'ino', 'uid', 'mode'].every(key => current[key] === expected[key])) throw hostFault('CRHS-ROOT-DRIFT');
      }
    } catch { throw hostFault('CRHS-ROOT-DRIFT'); }
  }
  const namespace = join(shared, 'design-readiness-codex'), repository = join(namespace, repoFingerprint);
  const directory = join(repository, 'receipts'), processRoot = join(repository, 'processes');
  for(const path of [namespace,repository,directory,processRoot]) {
    try { mkdirSync(path,{mode:0o700}); } catch(error) { if(error?.code !== 'EEXIST') throw error; }
    checkedHostDirectory(path);
    syncDirectory(dirname(path));
  }
  assertSharedRoots();
  function pathFor(receiptId) {
    if (!idPattern.test(receiptId ?? '')) throw hostFault('CRHS-ID');
    assertSharedRoots();
    checkedHostDirectory(directory);
    return join(directory, `${receiptId}.json`);
  }
  function owns(record, expected) {
    try {
    if (!record || !validateCodexReadinessHostRecord(record, expected)) return false;
    if (typeof trustedExecutablePath !== 'string' || realpathSync(trustedExecutablePath) !== trustedExecutablePath
      || !lstatSync(trustedExecutablePath).isFile() || hostDigest(readFileSync(trustedExecutablePath)) !== expected.executableSha256) return false;
    const processDirectory = join(processRoot, `codex-host-${record.receiptId}`);
    const intent = readHostJournal(processDirectory, 'intent');
    if (!intent || intent.value.executable.path !== trustedExecutablePath) return false;
    const finalization = readFinalizedReadinessObservation(processDirectory, expected);
    if (!finalization || finalization.sha256 !== record.finalizationSha256
      || !['session','controls','terminal','inputDisposition','ownership','outputCustody'].every(key => canonicalJson(record[key]) === canonicalJson(finalization.value[key]))) return false;
    assertSharedRoots();
    if (!record || record.repoFingerprint !== repoFingerprint || !validateCodexReadinessHostRecord(record, expected)) return false;
    const observed = verifyRegisteredCodexOwnership(join(processRoot, `codex-host-${record.receiptId}`), {
      receiptId: record.receiptId, repoFingerprint, dispatchId: expected.dispatchId,
      candidateCommit: expected.candidate.commit, requestSha256: expected.requestSha256,
      executableSha256: expected.executableSha256,
    });
    assertSharedRoots();
    return observed !== null && canonicalJson(observed) === canonicalJson(record.ownership);
    } catch { return false; }
  }
  const read = (receiptId, expected) => {
    try {
      const first = checkedFile(pathFor(receiptId)), second = checkedFile(pathFor(receiptId));
      if (!first || !second || first.sha256 !== second.sha256 || first.value.receiptId !== receiptId
        || !owns(first.value, expected) || !owns(second.value, expected)) return null;
      assertSharedRoots();
      return first;
    } catch { return null; }
  };
  return Object.freeze({
    processRoot,
    read,
    readForBinding(receiptId, context) {
      try {
        assertSharedRoots();
        const keys = ['repoFingerprint', 'dispatchId', 'candidate', 'sources', 'route', 'requestSha256', 'reportSha256'];
        if (!context || Object.keys(context).sort().join('\0') !== keys.sort().join('\0') || context.repoFingerprint !== repoFingerprint) return null;
        const first = checkedFile(pathFor(receiptId));
        if (!first || first.value.receiptId !== receiptId) return null;
        const ownership = verifyRegisteredCodexOwnership(join(processRoot, `codex-host-${receiptId}`), {
          receiptId, repoFingerprint, dispatchId: context.dispatchId, candidateCommit: context.candidate.commit,
          requestSha256: context.requestSha256, executableSha256: first.value.executableSha256,
        });
        if (!ownership) return null;
        const expected = { repoFingerprint, dispatchId: context.dispatchId, candidate: context.candidate, sources: context.sources,
          route: context.route, executableSha256: hostDigest(readFileSync(trustedExecutablePath)), requestSha256: context.requestSha256,
          responseSha256: context.reportSha256, dutyReceiptSha256: context.reportSha256, ownership };
        const reread = read(receiptId, expected);
        return reread && reread.sha256 === first.sha256 ? reread : null;
      } catch { return null; }
    },
    write(record, expected) {
      const path = pathFor(record?.receiptId);
      if (!owns(record, expected)) throw hostFault('CRHS-RECORD-OR-OWNERSHIP-INVALID');
      writeOnce(directory, path, record);
      const readback = read(record.receiptId, expected);
      if (!readback || canonicalJson(readback.value) !== canonicalJson(record)) throw hostFault('CRHS-WRITE-READBACK');
      return { path, sha256: readback.sha256, directoryDurability: 'confirmed' };
    },
  });
}
