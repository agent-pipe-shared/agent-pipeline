# w235: the cross-process memo keeps the byte-less inspect and ancestor observations, and the trace reports persisted hits

Elephant-built small item, the most likely latency fix from the options analysis (`specs/sprint-alfred-epic/evidence/native-checks-options-2026-11-05.md`, option O3 (i); recommendation in `native-checks-recommendation-2026-11-05.md`). **Held for PO consent:** it is applied only by its own script `po-apply-0.7-candidate19h-w235.sh`, after the PO agrees, never by the main 19h script. Order: w233, w234, then w235. Criterion binding: AC-108 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## Found

The cross-process memo (w226, in the measured 19g stamp) accepted only persisted values whose `bytes` is a base64 string. The real Windows helper answers `inspect`, `ancestor` and `ancestor-above-root` with `bytes: null` (`windows-owned-authority-native.ps1`, lines 243 and 256 to 258). So the two hottest sites of the 19g measurement were never kept across hook processes: the registry closure walk (37 inspects per admission) and the ancestor chain (15). The w226 tests did not see this, because their fake spawn answered every operation with bytes. Also, the authority trace dropped `authorityMemoPersistedHits`, so the measurement could not tell persisted hits apart.

## What it changes

- `persistedValueShape` accepts, for exactly the three byte-less operations, the helper's real shape `{ok, facts, bytes: null, committed: false}`. A byte-less operation stored with bytes is refused on load. Every other rule is unchanged: an entry answers only while the object's current lstat identity (device, file id, mode, links, size, mtime, ctime, birthtime) equals the stored one, writes drop the entries around them, and `PIPELINE_AUTHORITY_NO_MEMO=1` still turns the layer off.
- `authority-trace-hook.mjs` and the trace preload report `authorityMemo.persistedHits`.

## What it gives up (stated for the PO)

The same trust w226 already accepted for read operations, now also for inspect and ancestor: a persisted hit trusts the unchanged lstat identity instead of observing owner, descriptor and final path again. A descriptor or alias change that leaves the whole identity tuple equal goes unseen until the object changes. On NTFS a security-descriptor change moves ChangeTime, which is part of the tuple (inferred, not measured: options document open question 8). Under the PO's threat model (the pipeline confines the agent, not the human) this needs an agent write route into the private directory, which the analysis leaves open (its open question 5). Nothing new is given up against the human.

## Checks

- SAS25 (new, `session-authority-repair.test.mjs`): inspect of a file and a directory and an ancestor observation are answered by a new process from the persisted file with no native start (3 persisted hits). A new entry in the directory makes the directory observations miss while the unchanged file still hits. A tampered file where an inspect carries bytes is not trusted.
- The memo fixture now answers the byte-less operations with `bytes: null`, as the real helper does (SAS11 to SAS24 unchanged and green).
- APT3 of `authority-trace-preload.test.mjs` expects `persistedHits: 0`. The case-completion pin of session-authority-repair moves 319 to 324 (extension only).
- Suites on the slice clone, one at a time: session-authority-repair 46/46, authority-trace-preload 9/9, win-authority-rest 21/21, check-verify-case-completion 32/32.

## Not changed / not proven

- No Windows run. How many of the 37 closure inspects and 15 ancestors become persisted hits depends on how many registry entries keep their identity between hook processes; the next measurement shows it with the new `persistedHits` field.
- The about 41 s to 45 s of each warm admission that native spawns do not explain stay unexplained.
- No full Verify run, no independent Critic review.
