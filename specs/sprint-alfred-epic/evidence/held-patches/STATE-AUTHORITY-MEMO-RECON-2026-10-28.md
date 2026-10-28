# State authority route: a process-local memo for read-only native observations (recon draft, 2026-10-28)

## Premise (verified in source; the measurement is still to come from the trace of the previous slice)

`windows-owned-authority-backend.mjs` `invoke()` starts one fixed PowerShell per operation. Each start loads the cached native type (reads the cache assembly, checks its ACL, hashes it,
loads it) before doing the single filesystem operation. Read-only operations (`inspect`, `ancestor`, `ancestor-above-root`, `read`, `read-source`, `inspect-source-image`) repeat the same
path many times in one command run: the registry walk, every record read, the private-directory chain on each lock acquisition, and five modules that walk every ancestor up to the drive root.

## Existing precedent

`windows-private-state.mjs` already keeps a process-local memo of successful native observations keyed on the object's lstat identity (path, dev, ino, type), re-validated by a fresh lstat on every
lookup, dropped on mismatch, bounded to 256 entries, bypassed by `fresh: true` and by injected test seams. The rationale there: an object that passed the private-state policy cannot have its
DACL or owner changed by a foreign principal, and a replaced object (new ino) or type change yields another key.

## Design

- Memoize ONLY read-only operations of the backend: `inspect`, `ancestor`, `ancestor-above-root`, `read`, `read-source`, `inspect-source-image`.
- Key: operation, path, directory flag, boundaryRoot (when present), `maxBytes` (for reads), and the object's lstat identity read with `bigint: true`: dev, ino, mode, nlink, size, mtimeNs, ctimeNs,
  birthtimeNs. ctime is the NTFS change time, which a DACL or owner change updates.
- A lookup does a fresh lstat first; any difference in the identity tuple, a missing object or a non-regular/non-directory type is a miss and drops the entry. The native call result is stored only
  when the identity tuple read AFTER the native call equals the tuple read BEFORE it (the object did not move while it was observed).
- Any mutating operation of the same module (`publish`, `create-directory`, `remove`) clears the whole memo before and after it. Simple and safe; read-only runs (the measured case) keep every hit.
- Never persisted, never shared across processes, bounded (512 entries, oldest dropped), an environment switch `PIPELINE_AUTHORITY_NO_MEMO=1` disables it for diagnosis.
- `read`/`read-source` hits return a copy of the stored bytes (Buffer copy), never the same buffer.
- Counters of the previous slice gain `memoHits` and `memoMisses`, so the next consumer trace shows the effect.

## Residual risk (named, accepted by the PO direction of 2026-10-28 to cache like elsewhere)

A change that does not move the identity tuple (a same-size rewrite within one timestamp tick by the same user, or a timestamp set explicitly) is not seen within the lifetime of one process. The
same assumption stands behind the existing private-state memo. The window is one command run (seconds), and a mutation by this process clears the memo. Not cached: any operation with side effects.

## Not in this slice

Batching several paths into one PowerShell call (needs a change to the hash-pinned helper script, cannot be exercised without Windows); caching the HEAD read of the custody inspection (a
deliberate non-memo, its drift check is the point). Windows measurement before and after stays a gate with the consumer.
