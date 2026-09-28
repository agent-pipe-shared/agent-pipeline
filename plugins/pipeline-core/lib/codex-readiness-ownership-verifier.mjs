// SPDX-License-Identifier: SUL-1.0
// Verify the registered Codex process ownership chain.
import { hostDigest, readHostJournal, listOwnedSession, sameProcess } from './codex-host-process-journal.mjs';

const exact = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
const same = (left, right) => hostDigest(left) === hostDigest(right);
const names = ['intent', 'launcher', 'admission', 'child-intent', 'worker', 'child', 'exec-admission', 'execution', 'terminal'];
const kernelKeys = ['pid', 'start', 'group', 'session', 'uid', 'bootSha256'];

/** Expected coordinates must originate from the private caller, not the model. */
export function verifyRegisteredCodexOwnership(directory, expected) {
  try {
    if (!exact(expected, ['receiptId', 'repoFingerprint', 'dispatchId', 'candidateCommit', 'requestSha256', 'executableSha256'])) return null;
    const first = Object.fromEntries(names.map(name => [name, readHostJournal(directory, name)]));
    const second = Object.fromEntries(names.map(name => [name, readHostJournal(directory, name)]));
    if (!names.every(name => first[name] && second[name] && first[name].sha256 === second[name].sha256)) return null;
    if (readHostJournal(directory, 'recovery')) return null;
    const value = name => first[name].value;
    const digest = name => first[name].sha256;
    const intent = value('intent'), launcher = value('launcher'), worker = value('worker'), child = value('child'), execution = value('execution');
    const runId = intent.runId;
    if (!/^[a-f0-9]{64}$/.test(runId) || intent.receiptId !== expected.receiptId
      || intent.schema !== 'pipeline.codex-host-process-intent.v1'
      || !same(intent.binding, { repoFingerprint: expected.repoFingerprint, dispatchId: expected.dispatchId,
        candidateCommit: expected.candidateCommit, requestSha256: expected.requestSha256 })
      || intent.executable.sha256 !== expected.executableSha256) return null;
    const schemas = { launcher: 'pipeline.codex-host-launcher.v1', admission: 'pipeline.codex-host-admission.v1',
      'child-intent': 'pipeline.codex-host-child-intent.v1', worker: 'pipeline.codex-host-worker.v1',
      child: 'pipeline.codex-host-child.v1', 'exec-admission': 'pipeline.codex-host-exec-admission.v1',
      execution: 'pipeline.codex-host-execution.v1', terminal: 'pipeline.codex-host-terminal.v1' };
    if (Object.entries(schemas).some(([name, schema]) => value(name).schema !== schema || value(name).runId !== runId)) return null;
    if (launcher.intentSha256 !== digest('intent') || launcher.process.pid !== launcher.process.group
      || launcher.process.pid !== launcher.process.session || launcher.process.executable !== intent.nodeExecutable.path
      || launcher.process.argvSha256 !== hostDigest([intent.nodeExecutable.path, intent.launcher.path, directory, runId])) return null;
    if (value('admission').intentSha256 !== digest('intent') || value('admission').launcherSha256 !== digest('launcher')
      || value('child-intent').launcherSha256 !== digest('launcher') || value('child-intent').admissionSha256 !== digest('admission')
      || value('child-intent').executableSha256 !== expected.executableSha256
      || value('child-intent').argvSha256 !== hostDigest([intent.executable.path, ...intent.args])) return null;
    if (worker.intentSha256 !== digest('intent') || worker.launcherSha256 !== digest('launcher')
      || worker.process.executable !== intent.nodeExecutable.path
      || worker.process.argvSha256 !== hostDigest([intent.nodeExecutable.path, intent.worker.path, directory, runId])
      || worker.process.group !== launcher.process.group || worker.process.session !== launcher.process.session
      || worker.process.uid !== launcher.process.uid || worker.process.bootSha256 !== launcher.process.bootSha256
      || BigInt(worker.process.start) < BigInt(launcher.process.start)) return null;
    if (child.launcherSha256 !== digest('launcher') || child.admissionSha256 !== digest('admission')
      || child.workerSha256 !== digest('worker') || !sameProcess(worker.process, child.process)
      || child.target.executable !== intent.executable.path || child.target.argvSha256 !== value('child-intent').argvSha256
      || value('exec-admission').childSha256 !== digest('child')
      || execution.launcherSha256 !== digest('launcher') || execution.childSha256 !== digest('child')
      || !kernelKeys.every(key => child.process[key] === execution.process[key])
      || execution.process.executable !== child.target.executable || execution.process.argvSha256 !== child.target.argvSha256) return null;
    const terminal = value('terminal');
    if (terminal.intentSha256 !== digest('intent') || terminal.launcherSha256 !== digest('launcher')
      || terminal.childSha256 !== digest('child') || terminal.executionSha256 !== digest('execution')
      || terminal.registered !== true || terminal.exitCode !== 0 || terminal.signal !== null
      || listOwnedSession(launcher.process).length !== 0) return null;
    return { intentReceiptSha256: digest('intent'), boundProcessReceiptSha256: digest('execution'),
      terminalReceiptSha256: digest('terminal'), status: 'closed' };
  } catch { return null; }
}
