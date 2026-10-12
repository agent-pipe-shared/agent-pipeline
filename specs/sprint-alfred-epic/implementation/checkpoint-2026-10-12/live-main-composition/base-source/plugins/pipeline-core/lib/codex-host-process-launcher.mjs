// SPDX-License-Identifier: SUL-1.0
// Registered launcher; binds its session before spawning the host process.
import { spawn } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hostDigest, hostFault, observeLinuxProcess, sameProcess, readHostJournal,
  writeHostJournal } from './codex-host-process-journal.mjs';

const [directory, runId] = process.argv.slice(2);
let child = null, finished = false, registered = false, childRead = null, executionRead = null;
const startupTimer = setTimeout(() => stop('startup-timeout'), 15_000);
let killTimer = null;
function notify(value) { if (process.connected) process.send(value); }
function stop(reason) {
  if (finished) return;
  if (child) {
    notify({ type: 'stopping', reason });
    child.kill('SIGTERM');
    killTimer ??= setTimeout(() => {
      // Launcher owns this detached session. SIGKILL cannot be logged by its
      // victim; recovery must observe the resulting terminal state separately.
      try { process.kill(-process.pid, 'SIGKILL'); } catch { process.exit(79); }
    }, 1_000);
  } else { finished = true; process.exit(78); }
}
process.on('disconnect', () => stop('controller-disconnected'));
process.on('SIGTERM', () => stop('launcher-terminated'));
process.on('SIGINT', () => stop('launcher-interrupted'));

try {
  if (process.platform !== 'linux' || process.argv.length !== 4 || !/^[a-f0-9]{64}$/.test(runId ?? '')) throw hostFault('host-launcher-input-invalid');
  const intent = readHostJournal(directory, 'intent');
  if (!intent || intent.value.schema !== 'pipeline.codex-host-process-intent.v1' || intent.value.runId !== runId
    || readHostJournal(directory, 'recovery') || !sameProcess(intent.value.controller, observeLinuxProcess(intent.value.controller.pid))) {
    throw hostFault('host-launcher-owner-unavailable');
  }
  const ownPath = realpathSync(fileURLToPath(import.meta.url));
  const own = observeLinuxProcess(process.pid);
  if (!own || own.group !== own.pid || own.session !== own.pid
    || own.executable !== intent.value.nodeExecutable.path
    || ownPath !== intent.value.launcher.path || hostDigest(readFileSync(ownPath)) !== intent.value.launcher.sha256) {
    throw hostFault('host-launcher-identity-invalid');
  }
  const launcher = writeHostJournal(directory, 'launcher', { schema: 'pipeline.codex-host-launcher.v1',
    runId, intentSha256: intent.sha256, process: own });
  registered = true;
  notify({ type: 'registered', launcherSha256: launcher.sha256 });
  process.on('message', message => {
    if (message?.type === 'execute' && child && childRead && !finished) {
      child.send(message);
      return;
    }
    if (message?.type !== 'admit' || child || finished) return stop('admission-message-invalid');
    try {
      const admission = readHostJournal(directory, 'admission');
      if (!admission || admission.sha256 !== message.sha256 || admission.value.runId !== runId
        || admission.value.intentSha256 !== intent.sha256 || admission.value.launcherSha256 !== launcher.sha256
        || readHostJournal(directory, 'recovery') || !sameProcess(intent.value.controller, observeLinuxProcess(intent.value.controller.pid))) {
        throw hostFault('host-admission-invalid');
      }
      const fields = intent.value;
      if (hostDigest(readFileSync(fields.executable.path)) !== fields.executable.sha256) throw hostFault('host-executable-drift');
      writeHostJournal(directory, 'child-intent', { schema: 'pipeline.codex-host-child-intent.v1', runId,
        launcherSha256: launcher.sha256, admissionSha256: admission.sha256,
        executableSha256: fields.executable.sha256, argvSha256: hostDigest([fields.executable.path, ...fields.args]) });
      if (hostDigest(readFileSync(fields.worker.path)) !== fields.worker.sha256) throw hostFault('host-worker-drift');
      child = spawn(fields.nodeExecutable.path, [fields.worker.path, directory, runId], { cwd: fields.cwd, env: process.env,
        detached: false, shell: false, stdio: [0, 1, 2, 'ipc'] });
      child.on('message', message => {
        try {
          const worker = readHostJournal(directory, 'worker');
          const observed = observeLinuxProcess(child.pid);
          if (message?.type !== 'worker-bound' || childRead || !worker || worker.sha256 !== message.sha256
            || worker.value.runId !== runId || worker.value.launcherSha256 !== launcher.sha256
            || !observed || !sameProcess(worker.value.process, observed)
            || observed.executable !== fields.nodeExecutable.path || observed.uid !== own.uid
            || observed.group !== own.group || observed.session !== own.session
            || observed.argvSha256 !== hostDigest([fields.nodeExecutable.path, fields.worker.path, directory, runId])) throw hostFault('host-child-identity-invalid');
          childRead = writeHostJournal(directory, 'child', { schema: 'pipeline.codex-host-child.v1', runId,
            launcherSha256: launcher.sha256, admissionSha256: admission.sha256, workerSha256: worker.sha256,
            process: observed, target: { executable: fields.executable.path, argvSha256: hostDigest([fields.executable.path, ...fields.args]) } });
          notify({ type: 'child-registered', childSha256: childRead.sha256 });
        } catch { stop('child-registration-failed'); }
      });
      child.once('disconnect', async () => {
        const deadline = Date.now() + 2_000;
        while (!finished && Date.now() < deadline) {
          try {
            const observed = observeLinuxProcess(child.pid);
            const original = childRead?.value.process;
            if (original && observed && observed.start === original.start && observed.uid === original.uid
              && observed.group === original.group && observed.session === original.session
              && observed.bootSha256 === original.bootSha256 && observed.executable === fields.executable.path
              && observed.argvSha256 === childRead.value.target.argvSha256) {
              executionRead = writeHostJournal(directory, 'execution', { schema: 'pipeline.codex-host-execution.v1', runId,
                launcherSha256: launcher.sha256, childSha256: childRead.sha256, process: observed });
              clearTimeout(startupTimer);
              notify({ type: 'ready', executionSha256: executionRead.sha256 });
              return;
            }
          } catch { stop('execution-registration-failed'); return; }
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        if (!finished) stop('execution-identity-unavailable');
      });
      child.once('error', () => stop('child-spawn-failed'));
      child.once('close', (exitCode, signal) => {
        finished = true; clearTimeout(killTimer);
        try {
          const terminal = writeHostJournal(directory, 'terminal', { schema: 'pipeline.codex-host-terminal.v1', runId,
            intentSha256: intent.sha256, launcherSha256: launcher.sha256, childSha256: childRead?.sha256 ?? null,
            executionSha256: executionRead?.sha256 ?? null,
            exitCode, signal, registered: executionRead !== null, closedAt: new Date().toISOString() });
          notify({ type: 'closed', terminalSha256: terminal.sha256 });
        } catch { process.exit(79); }
        if (process.connected) process.disconnect();
        process.exit(Number.isInteger(exitCode) ? exitCode : 79);
      });
    } catch { stop('admission-failed'); }
  });
} catch {
  clearTimeout(startupTimer);
  notify({ type: 'unavailable', registered });
  process.exit(78);
}
