// SPDX-License-Identifier: SUL-1.0
import { lstatSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Keep the existing 30-minute proof freshness contract used by
// pipeline-start-preflight.mjs. Ordinary ready invocations remain write-free.
const PROOF_FRESH_WINDOW_MS = 30 * 60 * 1000;

/** Called by Antigravity PreInvocation only after native session identity and
 * initialized Git control path have been validated. The proof lock attests
 * only that this hook wrote it; the pending file is a separate one-shot guard
 * barrier and is not evidence that every configured hook fired. */
export function armAntigravityBootstrapSession(sessionDir, version, {
  readFileSyncFn = readFileSync,
  writeFileSyncFn = writeFileSync,
  lstatSyncFn = lstatSync,
  nowFn = Date.now,
} = {}) {
  const proofLock = join(sessionDir, "requires-bootstrap.lock");
  const pendingBarrier = join(sessionDir, "requires-bootstrap.pending");
  let previous;
  try {
    previous = JSON.parse(readFileSyncFn(proofLock, "utf8"));
  } catch {
    // Missing, malformed, or stale-build proof is replaced by the hook.
  }
  if (previous?.locked === true && previous?.version === version) {
    const info = lstatSyncFn(proofLock);
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new Error("AGY-PROOF-LOCK-PHYSICAL-UNAVAILABLE");
    }
    const ageMs = nowFn() - info.mtimeMs;
    if (Number.isFinite(ageMs) && ageMs > PROOF_FRESH_WINDOW_MS) {
      // A real resumed hook renews only its expired observation proof. It
      // never re-arms the independent, possibly already consumed barrier.
      writeFileSyncFn(proofLock, `${JSON.stringify({ locked: true, version })}\n`, "utf8");
      return { status: "already-armed", proofLock, pendingBarrier, wrote: true };
    }
    return { status: "already-armed", proofLock, pendingBarrier, wrote: false };
  }
  writeFileSyncFn(proofLock, `${JSON.stringify({ locked: true, version })}\n`, "utf8");
  writeFileSyncFn(pendingBarrier, `${JSON.stringify({ pending: true, version })}\n`, "utf8");
  return { status: "armed", proofLock, pendingBarrier, wrote: true };
}
