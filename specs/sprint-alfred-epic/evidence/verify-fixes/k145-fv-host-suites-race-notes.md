# K145-FV-HOST-SUITES-RACE notes (Goldfish, Sonnet 5.5, ruleset 0.7.0+claude.20261023185750.bd9ee06)

Status: partial. Cause ESTABLISHED for codex-design-advisor-host-tests (CADH001); NO fix, NO diff, NO commit delivered.
Stopped on the briefing's own stop condition: the remedy is a design decision on kernel paths that the briefing does not make.
Clone scratch/clones/k145 is clean (diagnostic probes reverted, `git status --short` empty). No k145-check clone made (nothing to apply).

## 1. codex-design-advisor-host-tests (CADH001): product defect, D113 gap
Symptom: test line 98 ENOENT on `.native-advisor-answer.json`. The line before it (`executeInitial`) returned
`{ok:false, code:"MODEL-FAMILY-DISCOVERY-OPERATION-FAILED", outcome:"unavailable"}`; the test never asserts that result
before reading the answer, so the mock app-server never ran and the file never existed.
Chain (measured with temporary probes, reverted):
- plugins/pipeline-core/lib/model-family-runtime-host.mjs:178 swallows the real error (bare catch).
- real error: SessionAuthorityError `domain-transition-registry-concurrent-writer`, session-authority-registry.mjs:1238
  (whole-registry snapshot CAS of catalogue, producer, member and release refs, taken before the effect and compared after the SYNCHRONOUS
  prefix of the effect), then `domain-transition-partial-effect-retained` (registry.mjs:246, lock retained after a synchronous throw).
- who changed the registry inside the prefix: the fixture's launchDriver calls runIsolatedStructuredHost (codex-isolated-structured-host.mjs:162)
  -> spawnManagedCodexHost (codex-host-process-supervisor.mjs:29) -> createHostJournal -> createRegisteredManagedJournal
  (codex-host-process-journal.mjs:285-292) which reserves and advances a MANAGED-CODEX member. That rewrites producers/managed-codex.json
  (966 -> 1963 bytes) and catalogue.json (7669 -> 7670) while the MODEL-FAMILY-HOST ticket is open. The nested boundary is admitted,
  the outer ticket's snapshot CAS then refuses it.
- Introduced by D113 (commit 05d869b9b, 2026-10-22): the BEGIN ticket now closes after the synchronous prefix of an async effect, so a
  nested producer registration in that prefix is checked as a foreign concurrent writer. Not bisected to the exact commit.
- Not an environment effect: deterministic, independent of the private HOME and of TMPDIR.
Fix options (design decision, kernel files session-authority-registry.mjs / session-authority-domain-owner.mjs, protected):
 (a) make the launch effect yield before createHostJournal (so the nested registration is outside BEGIN). SETTLE (settleAsyncPhase) would then
     see another producer's writes outside the mutable set and probably refuse too: needs the managed-codex creations declared in the
     model-family-host transition scope.
 (b) let the BEGIN/terminal snapshot CAS at registry.mjs:1238 exclude a registered nested producer's own refs. Weakens a check: not done.
 (c) restructure launch so the driver is invoked after the BEGIN ticket closes (host-store launch, model-family-host-store.mjs:1090).
Recommended to evaluate first: (a) with a declared creation scope, because it keeps the CAS intact.
Test weakness (separate, unprotected, optional): CADH001 should assert `result.ok` before reading the answer file so the cause is named.

## 2. codex-critic-host-tests (CCH136, CCH137): NOT investigated beyond the raw message
Raw output (scratch/k141-raw/r2): "repository mutation observed during normal Critic run"; CCH137 `protectedChanged=["candidate"]`.
Shared cause with item 1 NOT confirmed: the raw messages name no session-authority or managed-codex path. A re-run with the same temporary
probes (registry snapshot diff) is the next step; it is plausible, not shown.

## 3. po-human-approval-tests (NVA-SIGENTRY-1): NOT investigated beyond the raw message
PO-SIGN-DISCLOSURE-MATERIAL at po-human-approval.mjs:482 (material artifact path over 240 characters, control character or bad sha256).
Not isolated; not tied to items 1 or 2.

## 4. Address-root race (prepareAddressRoot): mechanism from code reading, NOT reproduced, no RED pin, no fix
session-power.mjs:357-381. For `target===directory` the function reads the shared HOME-level namespace `parent` (`~/.apsp`) twice,
lines 365 and 369, and fails `SP-ADDRESS fixed address namespace changed` when the listings differ. Another process on the same HOME
preparing a different repository creates its slot (`mkdirSync(target)` line 371 plus `anchor.json` line 377) in `~/.apsp` between the
two reads: a TOCTOU between two concurrent callers, not (as far as read) the D71/D72 repair verb. Related window: line 367 validates every
existing slot including its anchor.json, so a slot created by a concurrent caller but not yet anchored (mkdir at 371, anchor at 377) is
reported as `foreign fixed address slot`. session-power-address-repair.mjs / scripts/run-quiet.mjs repair NOT checked.
Fix outline (narrowest, namespace check not weakened): on a changed listing, re-validate and accept only if every originally read name is
still present and every new name validates as a slot (bounded retry, 2-3 attempts); anchor creation made atomic (stage dir + rename) so
no half-created slot is observable. RED pin: two concurrent processes on one private HOME, in an already registered session-power suite.

## Open items / risks
- Items 2, 3 and the race fix/pin are untouched for budget. The probes cost the budget (about 40 calls to isolate item 1).
- Probe scripts: scratch/k145-run.mjs (runner derived from k141-run.mjs, runs in a named clone), scratch/k145-revert.mjs; raw output scratch/k145-raw/p1..p5.

implementation not complete: cause established for CADH001, no fix delivered; independent Critic read, operator commit of protected parts and PO acceptance pending
