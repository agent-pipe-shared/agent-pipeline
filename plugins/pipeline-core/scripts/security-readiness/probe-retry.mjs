// SPDX-License-Identifier: SUL-1.0
// W3: a readiness probe that fails with EPERM is retried ONCE before the tool is reported as not ready. A native Windows run saw
// gitleaks fail with EPERM and pass two minutes later (antivirus or indexer holding the freshly installed binary), so one pause and
// one repeat of the same probe is the whole policy; a second failure is reported exactly as before. The pause is injected.
import { runProbe } from "../tool-identity.mjs";

const RETRY_PAUSE_MS = 750;
const pauseMs = (ms) => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };

/** runProbe with one retry when the probe failed because the execution environment refused the spawn (EPERM or EACCES). */
export function runProbeRetryingEperm(executable, args, options = {}) {
  const { sleepFn = pauseMs, ...probeOptions } = options;
  const first = runProbe(executable, args, probeOptions);
  if (first.ok || first.status !== "execution_environment") return first;
  sleepFn(RETRY_PAUSE_MS);
  return runProbe(executable, args, probeOptions);
}
