// SPDX-License-Identifier: SUL-1.0
// Bind this PID durably, then replace its image without changing PID/starttime.
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hostDigest, observeLinuxProcess, sameProcess, readHostJournal, writeHostJournal } from './codex-host-process-journal.mjs';
const [directory, runId] = process.argv.slice(2);
const fail = () => process.exit(78);
const timer = setTimeout(fail, 15_000);
process.on('disconnect', fail);
try {
  const intent = readHostJournal(directory, 'intent');
  const launcher = readHostJournal(directory, 'launcher');
  const ownPath = realpathSync(fileURLToPath(import.meta.url));
  const own = observeLinuxProcess(process.pid);
  if (typeof process.execve !== 'function' || !intent || !launcher || intent.value.runId !== runId
    || readHostJournal(directory, 'recovery') || ownPath !== intent.value.worker.path
    || hostDigest(readFileSync(ownPath)) !== intent.value.worker.sha256
    || !sameProcess(launcher.value.process, observeLinuxProcess(process.ppid))
    || !sameProcess(intent.value.controller, observeLinuxProcess(intent.value.controller.pid))
    || own.group !== launcher.value.process.group || own.session !== launcher.value.process.session) fail();
  const worker = writeHostJournal(directory, 'worker', { schema: 'pipeline.codex-host-worker.v1', runId,
    launcherSha256: launcher.sha256, intentSha256: intent.sha256, process: own });
  process.send({ type: 'worker-bound', sha256: worker.sha256 });
  process.on('message', message => {
    try {
      const admission = readHostJournal(directory, 'exec-admission');
      const child = readHostJournal(directory, 'child');
      if (message?.type !== 'execute' || !admission || !child || admission.sha256 !== message.sha256
        || admission.value.runId !== runId || admission.value.childSha256 !== child.sha256
        || child.value.workerSha256 !== worker.sha256 || readHostJournal(directory, 'recovery')
        || !sameProcess(intent.value.controller, observeLinuxProcess(intent.value.controller.pid))
        || !sameProcess(launcher.value.process, observeLinuxProcess(process.ppid))
        || hostDigest(readFileSync(intent.value.executable.path)) !== intent.value.executable.sha256) fail();
      clearTimeout(timer);
      const fields = intent.value;
      // execve drops IPC and all descriptors except standard streams. The
      // launcher observes the same PID with the intended image before ready.
      process.execve(fields.executable.path, [fields.executable.path, ...fields.args], process.env);
      fail();
    } catch { fail(); }
  });
} catch { fail(); }
