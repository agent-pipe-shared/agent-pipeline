import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Called by Antigravity PreInvocation only after native session identity and
 * initialized Git control path have been validated. The proof lock attests
 * only that this hook wrote it; the pending file is a separate one-shot guard
 * barrier and is not evidence that every configured hook fired. */
export function armAntigravityBootstrapSession(sessionDir, version, {
  readFileSyncFn = readFileSync,
  writeFileSyncFn = writeFileSync,
} = {}) {
  const proofLock = join(sessionDir, "requires-bootstrap.lock");
  const pendingBarrier = join(sessionDir, "requires-bootstrap.pending");
  try {
    const previous = JSON.parse(readFileSyncFn(proofLock, "utf8"));
    if (previous?.locked === true && previous?.version === version) {
      return { status: "already-armed", proofLock, pendingBarrier, wrote: false };
    }
  } catch {
    // Missing, malformed, or stale-build proof is replaced by the hook.
  }
  writeFileSyncFn(proofLock, `${JSON.stringify({ locked: true, version })}\n`, "utf8");
  writeFileSyncFn(pendingBarrier, `${JSON.stringify({ pending: true, version })}\n`, "utf8");
  return { status: "armed", proofLock, pendingBarrier, wrote: true };
}
