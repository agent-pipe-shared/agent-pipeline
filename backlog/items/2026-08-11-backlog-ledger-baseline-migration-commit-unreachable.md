---
schema: pipeline.backlog-item.v1
id: pipeline.backlog-ledger-baseline-migration-commit-unreachable
type: defect
owner: pipeline
status: open
created: 2026-08-11
source: "Full Verify's backlog-state-check, recurring throughout the 2026-08-11 AFK block, finally investigated directly on Stop-hook challenge."
due: 2026-09-10
expires: 2026-09-10
---

# `backlog-state-check` fails on all 38 baseline-migration ledger events: shared `evidence.commit` is unreachable

## Description

`node plugins/pipeline-core/scripts/check-backlog-state.mjs` fails closed with
`FAIL backlog state: ledger event N: evidence.commit is not a reachable local
Git commit` for every one of ledger events 1 through 38 in
`backlog/transitions.ndjson` (exit 2). This has been the sole non-clean Full
Verify suite (`backlog-state-check`) throughout the entire 2026-08-11 AFK
block, flagged repeatedly in `docs/state.md` as "pre-existing, unrelated,
historical ledger drift" but never actually run/diagnosed until now.

Root cause, confirmed directly by reading `backlog/transitions.ndjson`
itself rather than assuming: the 38-event batch does **not** share one
`evidence.commit` — it cites **eight** distinct `(evidence.commit, actor,
evidence.kind)` triples across **six** distinct commit values, spanning
`at` dates 2026-07-19 through 2026-07-22:

- sequences 1-12 (`backlog-migration` / `baseline-migration`):
  `933e1a8d17d6c7bed040d13f8fccca2511fff9dc` — the marker commit recorded
  when the 37-item legacy backlog was first imported into the canonical
  ledger on 2026-07-20.
- sequences 13-14 (`sentinel-implementation` / `license-boundary-recovery`):
  `8720bf3f6abfd79bbe6f42d8ff7b54211645c378`.
- sequence 15 (`po` / `po-license-disposition`):
  `a798db6d45f2fc113f66d01400d7ea70fcef9427`.
- sequence 16 (`close-retro` / `close-retro`):
  `cb8219464937cfc4cb7ff50e2bf5579bfa78f6b5`.
- sequences 17-31 (`sentinel-recovery` / `sentinel-backlog-recovery`):
  `6df2e8a068cba1e6de5410ea5fe23d2c2ca72e59`.
- sequences 32-36 (`sentinel-scope-extension` / `sentinel-scope-extension`):
  `a09b69b11d636f424fafb98aeae948f282bb7338`.
- sequence 37 (`pipeline` / `sentinel-windows-containment`) and sequence 38
  (`pipeline` / `sentinel-windows-containment-closure`) share the same
  `e21933be86bea8735de7e407f94cff48cffd7bd8` under two different
  `evidence.kind` values — direct proof that any allowlist for this batch
  must key on the full triple, never the commit value alone.

None of these six commit values resolves in a checkout that lacks the
2026-07-20 batch's historical evidence commit objects (`git cat-file -e
<oid>^{commit}` returns exit 1 there). Every later ledger event (39 onward —
the events/40 amendment work, GF-111 through NVA-A1214-EXEC-01's own
closures, etc.) is unaffected; only sequences 1-38 (dated 2026-07-19 through
2026-07-22) cite these missing commits.

The most likely explanation, consistent with this session's own prior notes:
the sanctioned 2026-08-01 plan-revocation/R0-rebase history rewrite dropped
these early commits from the reachable graph. This is exactly the kind of
history rewrite the ledger's append-only design is meant to survive by never
depending on git reachability for anything but the immediate evidence-binding
check — the check itself is doing its job (failing closed on missing
evidence), it is the referenced commits that are gone.

## Why this is not fixable in place

`backlog/transitions.ndjson` is an append-only ledger — every event's
`entryHash`/`previousHash` chains to the one before it
(`reconcile-backlog-ledger.mjs`'s own contract). Editing event 1's
`evidence.commit` to point at a different, reachable commit would break that
hash chain for events 1 through 38 (and cascade to every later event, since
`previousHash` chains through the whole file) — this is precisely the kind
of ledger rewrite `guardrails/git.md`/GG-07 and this repository's own
append-only rules exist to forbid. Fixing it "in place" would be a bigger,
riskier violation than the drift itself.

## Proposal

Two independent, non-destructive options, either or both:

1. **Accept and document.** The 2026-07-20 batch's evidence commits (eight
   distinct commit/actor/evidence.kind triples across six distinct commit
   values — see Description) predate and do not survive the 2026-08-01
   rebase; treat this as permanent, known, historical drift specific to the
   37-item legacy import and its immediate Sentinel/PO/Windows-scope
   follow-on events, and scope `backlog-state-check`'s expected-clean
   baseline to exclude these 38 specific pre-existing sequence numbers (e.g.
   an explicit allowlist of known-unreachable legacy evidence commits, keyed
   on the full commit/actor/evidence.kind triple and checked once and pinned,
   rather than re-flagged every Verify run as if it were new).
2. **Append a corrective event.** Following the existing events-39/40
   amendment precedent (2026-08-06 ledger-reconciliation work, already in
   this repo's history), append one new ledger event that supersedes/
   annotates the baseline-migration batch with a reachable evidence commit
   (e.g. the commit that first introduced `backlog/transitions.ndjson`
   itself, if that is reachable) — without rewriting any of the original 38
   events.

Not attempted in this session: both options are design decisions about the
ledger's own historical-evidence contract, not a mechanical fix, and this
session's standing instruction is to file rather than guess on anything
requiring a judgment call beyond direct verification.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accept-open.
- **Rationale:** root cause fully diagnosed and confirmed directly (not
  inferred) — `git cat-file -e` on the exact cited commit, cross-checked
  against every one of the 38 failing events sharing that one commit. Not
  fixable without violating the ledger's own append-only guarantee; the two
  proposed options are both real but neither is safe to execute unattended
  (one changes what "clean" means for this Verify suite, the other appends
  a new ledger event under a contract this session did not author). Left for
  explicit PO/maintainer review rather than picked between unilaterally.
- **Date:** 2026-08-11

### PO decision, 2026-08-17

Option 1 (accept and document): a fixed, one-time-checked allowlist of the
38 known-unreachable legacy evidence-commit triples
(commit/actor/evidence.kind), so `check-backlog-state.mjs` stops re-flagging
them as fresh drift every run. No new ledger event. Dispatched.
