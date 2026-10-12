// SPDX-License-Identifier: SUL-1.0
// Owned Linux process supervision; final receipts belong to readiness composition.
import { spawn } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHostJournal, hostDigest, hostFault, journalExecutable, observeLinuxProcess,
  sameProcess, readHostJournal, writeHostJournal, listOwnedSession } from './codex-host-process-journal.mjs';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const launcherPath = realpathSync(fileURLToPath(new URL('./codex-host-process-launcher.mjs', import.meta.url)));
const workerPath = realpathSync(fileURLToPath(new URL('./codex-host-process-exec-worker.mjs', import.meta.url)));

export async function spawnManagedCodexHost({ journalParent, executablePath, args, cwd, binding,
  startupTimeoutMs = 20_000, receiptId } = {}) {
  if (process.platform !== 'linux' || typeof process.execve !== 'function') throw hostFault('host-process-platform-unavailable');
  if (!Array.isArray(args) || args.length > 150 || args.some(value => typeof value !== 'string' || value.includes('\0'))
    || JSON.stringify(args).length > 64_000 || typeof binding !== 'object' || binding === null
    || Object.keys(binding).sort().join(',') !== ['repoFingerprint', 'dispatchId', 'candidateCommit', 'requestSha256'].sort().join(',')
    || !/^[a-f0-9]{64}$/.test(binding.repoFingerprint) || !/^[a-f0-9]{64}$/.test(binding.requestSha256)
    || !/^[a-f0-9]{40,64}$/.test(binding.candidateCommit) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(binding.dispatchId)
    || realpathSync(cwd) !== cwd) throw hostFault('host-process-request-invalid');
  const executable = journalExecutable(executablePath), nodeExecutable = journalExecutable(process.execPath);
  const journal = createHostJournal(journalParent, { binding, executable, nodeExecutable,
    launcher: { path: launcherPath, sha256: hostDigest(readFileSync(launcherPath)) },
    worker: { path: workerPath, sha256: hostDigest(readFileSync(workerPath)) }, args, cwd }, { receiptId });
  const child = spawn(nodeExecutable.path, [launcherPath, journal.directory, journal.intent.value.runId], {
    cwd, env: process.env, shell: false, detached: true, stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
  });
  let launcherRead = null, childRead = null, processRead = null, closed = false, terminalObserved = null;
  const terminal = new Promise(resolve => {
    child.once('error', () => { closed = true; terminalObserved = { exitCode: null, signal: null, spawnError: true }; resolve(terminalObserved); });
    child.once('close', (exitCode, signal) => { closed = true; terminalObserved = { exitCode, signal, spawnError: false }; resolve(terminalObserved); });
  });
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(hostFault('host-process-registration-timeout')), startupTimeoutMs);
    const done = (error, value) => { clearTimeout(timeout); error ? reject(error) : resolve(value); };
    child.once('error', () => done(hostFault('host-process-spawn-failed')));
    child.once('close', () => { if (!processRead) done(hostFault('host-process-closed-before-admission')); });
    child.on('message', message => {
      try {
        if (message?.type === 'registered' && !launcherRead) {
          launcherRead = readHostJournal(journal.directory, 'launcher');
          if (!launcherRead || launcherRead.sha256 !== message.launcherSha256
            || launcherRead.value.intentSha256 !== journal.intent.sha256
            || launcherRead.value.runId !== journal.intent.value.runId
            || launcherRead.value.process.pid !== child.pid
            || !sameProcess(launcherRead.value.process, observeLinuxProcess(child.pid))) throw hostFault('host-launcher-readback-invalid');
          const admission = writeHostJournal(journal.directory, 'admission', { schema: 'pipeline.codex-host-admission.v1',
            runId: journal.intent.value.runId, intentSha256: journal.intent.sha256, launcherSha256: launcherRead.sha256 });
          child.send({ type: 'admit', sha256: admission.sha256 });
        } else if (message?.type === 'child-registered' && launcherRead && !childRead) {
          childRead = readHostJournal(journal.directory, 'child');
          if (!childRead || childRead.sha256 !== message.childSha256 || childRead.value.runId !== journal.intent.value.runId
            || childRead.value.launcherSha256 !== launcherRead.sha256
            || !sameProcess(childRead.value.process, observeLinuxProcess(childRead.value.process.pid))) throw hostFault('host-worker-readback-invalid');
          const executionAdmission = writeHostJournal(journal.directory, 'exec-admission', {
            schema: 'pipeline.codex-host-exec-admission.v1', runId: journal.intent.value.runId, childSha256: childRead.sha256 });
          child.send({ type: 'execute', sha256: executionAdmission.sha256 });
        } else if (message?.type === 'ready' && launcherRead && childRead && !processRead) {
          processRead = readHostJournal(journal.directory, 'execution');
          if (!processRead || processRead.sha256 !== message.executionSha256
            || processRead.value.runId !== journal.intent.value.runId
            || processRead.value.launcherSha256 !== launcherRead.sha256
            || !sameProcess(processRead.value.process, observeLinuxProcess(processRead.value.process.pid))) throw hostFault('host-child-readback-invalid');
          done(null, true);
        } else if (message?.type === 'unavailable') done(hostFault('host-launcher-unavailable'));
      } catch (error) { done(error); }
    });
  });
  async function stop() {
    if (closed) return;
    const launcher = launcherRead?.value.process ?? observeLinuxProcess(child.pid);
    if (!launcher || launcher.pid !== child.pid || launcher.group !== child.pid || launcher.session !== child.pid
      || launcher.argvSha256 !== hostDigest([nodeExecutable.path, launcherPath, journal.directory, journal.intent.value.runId])) throw hostFault('host-stop-ownership-unverified');
    function liveAnchor() {
      const leader = observeLinuxProcess(launcher.pid);
      if (leader && !sameProcess(launcher, leader)) throw hostFault('host-stop-session-reused');
      if (sameProcess(launcher, leader)) return launcher;
      const registered = processRead?.value.process;
      if (registered && sameProcess(registered, observeLinuxProcess(registered.pid))) return registered;
      const beforeExec = childRead?.value.process;
      const current = beforeExec ? observeLinuxProcess(beforeExec.pid) : null;
      if (beforeExec && current && ['pid', 'start', 'group', 'session', 'uid', 'bootSha256'].every(key => beforeExec[key] === current[key])
        && (sameProcess(beforeExec, current) || current.executable === childRead.value.target.executable
          && current.argvSha256 === childRead.value.target.argvSha256)) return current;
      return null;
    }
    if (!liveAnchor()) throw hostFault('host-stop-ownership-unverified');
    process.kill(-launcher.group, 'SIGTERM');
    await Promise.race([terminal, wait(1_500)]);
    if (!closed) {
      if (!liveAnchor()) {
        if (listOwnedSession(launcher).length === 0) return;
        throw hostFault('host-stop-ownership-changed');
      }
      process.kill(-launcher.group, 'SIGKILL');
      await Promise.race([terminal, wait(1_500)]);
      if (!closed) throw hostFault('host-stop-terminal-timeout');
    }
  }
  try { await ready; }
  catch (error) {
    try { await stop(); } catch { /* retain journal; restart recovery is mandatory */ }
    error.journalDirectory = journal.directory;
    throw error;
  }
  async function finish() {
    await terminal;
    const names = ['intent', 'launcher', 'admission', 'worker', 'child', 'exec-admission', 'execution', 'terminal'];
    const reads = Object.fromEntries(names.map(name => [name, readHostJournal(journal.directory, name)]));
    const repeated = Object.fromEntries(names.map(name => [name, readHostJournal(journal.directory, name)]));
    const stableChain = names.every(name => reads[name] && repeated[name] && reads[name].sha256 === repeated[name].sha256)
      && reads.intent.sha256 === journal.intent.sha256 && reads.launcher.sha256 === launcherRead.sha256
      && reads.child.sha256 === childRead.sha256 && reads.execution.sha256 === processRead.sha256
      && reads.admission.sha256 === childRead.value.admissionSha256 && reads.worker.sha256 === childRead.value.workerSha256
      && reads['exec-admission'].value.runId === journal.intent.value.runId
      && reads['exec-admission'].value.childSha256 === childRead.sha256;
    const first = readHostJournal(journal.directory, 'terminal');
    const second = readHostJournal(journal.directory, 'terminal');
    const clean = stableChain && terminalObserved.exitCode === 0 && terminalObserved.signal === null && !terminalObserved.spawnError
      && first && second && first.sha256 === second.sha256 && first.value.runId === journal.intent.value.runId
      && first.value.intentSha256 === journal.intent.sha256 && first.value.launcherSha256 === launcherRead.sha256
      && first.value.childSha256 === childRead.sha256 && first.value.executionSha256 === processRead.sha256
      && first.value.exitCode === 0 && first.value.signal === null
      && first.value.registered === true && listOwnedSession(launcherRead.value.process).length === 0;
    return { clean: Boolean(clean), journalDirectory: journal.directory,
      ownership: clean ? { intentReceiptSha256: journal.intent.sha256, boundProcessReceiptSha256: processRead.sha256,
        terminalReceiptSha256: first.sha256, status: 'closed' } : null };
  }
  return { child, directory: journal.directory, receiptId: journal.intent.value.receiptId, terminal, stop, finish };
}

/** Recovery never promotes interrupted work to a successful review. */
export async function recoverManagedCodexHost(directory, { terminate = false, graceMs = 1_500 } = {}) {
  const intent = readHostJournal(directory, 'intent');
  if (!intent || intent.value.schema !== 'pipeline.codex-host-process-intent.v1') throw hostFault('host-recovery-intent-invalid');
  const previous = readHostJournal(directory, 'recovery');
  if (sameProcess(intent.value.controller, observeLinuxProcess(intent.value.controller.pid))) throw hostFault('host-recovery-controller-live');
  if (previous) {
    if (previous.value.schema !== 'pipeline.codex-host-recovery.v1' || previous.value.runId !== intent.value.runId
      || previous.value.intentSha256 !== intent.sha256 || previous.value.reviewSuccessful !== false
      || !['closed-interrupted', 'unavailable-no-launcher-binding'].includes(previous.value.status)) throw hostFault('host-recovery-record-invalid');
    const registered = readHostJournal(directory, 'launcher');
    if (previous.value.status === 'closed-interrupted' && registered
      && listOwnedSession(registered.value.process).length !== 0) throw hostFault('host-recovery-terminal-drift');
    return { status: previous.value.status, reviewSuccessful: false, sha256: previous.sha256 };
  }
  const launcherRead = readHostJournal(directory, 'launcher');
  if (!launcherRead || launcherRead.value.intentSha256 !== intent.sha256 || launcherRead.value.runId !== intent.value.runId) {
    // Without a durable launcher identity there is no authority to signal a
    // process. A late launcher also checks owner liveness and this recovery gate.
    const result = writeHostJournal(directory, 'recovery', { schema: 'pipeline.codex-host-recovery.v1',
      runId: intent.value.runId, intentSha256: intent.sha256, status: 'unavailable-no-launcher-binding',
      signaled: false, reviewSuccessful: false, closedAt: new Date().toISOString() });
    return { status: result.value.status, reviewSuccessful: false, sha256: result.sha256 };
  }
  const launcher = launcherRead.value.process;
  if (launcher.group !== launcher.pid || launcher.session !== launcher.pid
    || launcher.executable !== intent.value.nodeExecutable.path
    || launcher.argvSha256 !== hostDigest([intent.value.nodeExecutable.path, intent.value.launcher.path, directory, intent.value.runId])) {
    throw hostFault('host-recovery-launcher-invalid');
  }
  const currentLeader = observeLinuxProcess(launcher.pid);
  if (currentLeader && !sameProcess(launcher, currentLeader)) throw hostFault('host-recovery-session-reused');
  let members = listOwnedSession(launcher);
  let signaled = false;
  if (members.length > 0) {
    if (!terminate) return { status: 'owned-process-live', reviewSuccessful: false, members: members.length };
    const originalChild = readHostJournal(directory, 'child');
    const execution = readHostJournal(directory, 'execution');
    let anchor = members.find(member => sameProcess(launcher, member));
    if (!anchor && originalChild && originalChild.value.runId === intent.value.runId
      && originalChild.value.launcherSha256 === launcherRead.sha256) {
      const preExec = originalChild.value.process;
      anchor = members.find(member => sameProcess(preExec, member)
        || ['pid', 'start', 'group', 'session', 'uid', 'bootSha256'].every(key => preExec[key] === member[key])
          && member.executable === originalChild.value.target?.executable && member.argvSha256 === originalChild.value.target?.argvSha256);
    }
    if (!anchor && execution?.value.runId === intent.value.runId && execution.value.launcherSha256 === launcherRead.sha256) {
      anchor = members.find(member => sameProcess(execution.value.process, member));
    }
    if (!anchor || !sameProcess(anchor, observeLinuxProcess(anchor.pid))) throw hostFault('host-recovery-anchor-unverified');
    process.kill(-launcher.group, 'SIGTERM'); signaled = true;
    const deadline = Date.now() + graceMs;
    do { await wait(25); members = listOwnedSession(launcher); } while (members.length && Date.now() < deadline);
    if (members.length) {
      // Do not signal a reused PID/group after the original anchor vanished.
      if (!sameProcess(anchor, observeLinuxProcess(anchor.pid))) throw hostFault('host-recovery-anchor-changed');
      process.kill(-launcher.group, 'SIGKILL');
      const killDeadline = Date.now() + graceMs;
      do { await wait(25); members = listOwnedSession(launcher); } while (members.length && Date.now() < killDeadline);
      if (members.length) throw hostFault('host-recovery-terminal-timeout');
    }
  }
  const result = writeHostJournal(directory, 'recovery', { schema: 'pipeline.codex-host-recovery.v1',
    runId: intent.value.runId, intentSha256: intent.sha256, status: 'closed-interrupted', signaled,
    reviewSuccessful: false, closedAt: new Date().toISOString() });
  return { status: result.value.status, reviewSuccessful: false, sha256: result.sha256 };
}
