# Native authority checks on Windows: the Elephant's recommendation

2026-11-05, written on the result-neutral options document `native-checks-options-2026-11-05.md` (slice C19H-NATIVE-OPTIONS). Option and check names (O0 to O10, C1 to C12) refer to that document. Threat model per the PO: the pipeline confines the agent, not the human; agent and human run as the same OS user (SEC-10).

## Three facts that frame every option

1. **The cost is the PowerShell start, not the check.** One native operation costs about 470 ms because it starts `powershell.exe`. The checks inside it take microseconds. Dropping a check whose adversary does not exist under the threat model therefore saves no time on its own: owner, DACL and allow-only-current-SID for private authority (O5a) have no same-user adversary, but the spawn is still needed for the handle custody and the alias check. Time is saved only by fewer spawns (O3, O4, O7, O8, O9) or cheaper spawns (O6).
2. **There is a floor no spawn option removes.** 145 natives x 0.47 s explain about 68 s of the measured 108.8 s to 113.3 s warm admission. About 41 s to 45 s are not native spawns: git calls, the per-attempt PowerShell process-identity probe of the lock (C8, outside the native counters), Node start-up. Even removing every native would not reach the 60 s threshold until that remainder is attributed. The next measurement must split it.
3. **The memo is already live and blind to the two hottest sites.** The cross-process memo (w226) is in the measured stamp, but `inspect`, `ancestor` and `ancestor-above-root` return no bytes and are never persisted across processes. The closure walk (C3, 37 natives) and the ancestor chain (C6, 15 natives) are cached only within one process, and every hook is a new process.

## Recommendation

**Build now, without giving up protection (candidate patch w235, held, applied only with PO consent):**

- **Measurement first:** the authority trace forwards `authorityMemoPersistedHits` and the per-operation split. Today `authority-trace-hook.mjs` line 80 drops `persistedHits`. Zero protection impact.
- **O3 (i), the cross-process memo also keeps `inspect`, `ancestor` and `ancestor-above-root`:** an entry is answered only for the identical `lstat` identity (volume, file index, mode, links, size, mtime, ctime, birthtime), exactly the trust w226 already accepted for read operations, and it is dropped around every write as today. It targets C3 and C6, about 52 of the 145 natives, of which the unchanged share (ancestors, retained registry members) is cached. It is testable on Linux through the backend's existing test seam (fake platform and spawn). What it gives up beyond w226: a descriptor or alias change that leaves the identity tuple unchanged goes unseen until the object changes. Under the threat model that needs an agent write route into the private directory, which the options document leaves open (its open question 5). Nothing new is given up against the human.

**Decide later, after the next measurement:**

- **O7** (skip the closure's second `inspect` of a file the same boundary already read) and **O8** (entry heal once per process) give up almost nothing, but the registry decides Windows by `process.platform`, so they cannot be exercised on Linux without a platform seam in the registry. Build them with that seam once the measurement shows how much of the 37 they remove.
- **O2 and O10** (read before the lock, a stop reading without the exclusive lock) address the lock contention rather than the spawn count. They come after w234's root cause of the stop failure is known.
- **O6a** (one resident helper per hook process) is the only option that removes most of the spawn cost without giving up any check. It is the largest lever and also high effort with new failure modes. Recommended as the next real latency step if the PO wants the 60 s threshold, after the remainder (fact 2) is attributed.

**Not recommended without a PO decision on scope:** O1a (root-only ancestors), O5a (drop the owner/DACL rule for private authority) and O5c (Node instead of native for private reads). They give up detection of aliases or other-account access. O5a saves no time by itself. O1a and O5c change Windows-only code that cannot be run here.

## Questions for the PO

1. Is another local account (a service, another login) in scope for private authority? A "no" makes O5a and part of O5c protection-neutral; it does not by itself make anything faster.
2. Is a planted junction, `subst` or 8.3 alias an agent action the pipeline must detect? A "no" makes O1a protection-neutral (about 10 natives).
3. After w235 and the next measurement: do we go for O6a (resident helper), or accept the latency?
