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

Root cause, confirmed directly: all 38 events share the exact same
`evidence.commit` value, `933e1a8d17d6c7bed040d13f8fccca2511fff9dc`
(`actor: "backlog-migration"`, `at: "2026-07-20"`, `evidence.kind:
"baseline-migration"` on every one) — this is the single marker commit
recorded when the 37-item legacy backlog was first imported into the
canonical ledger on 2026-07-20. `git cat-file -e
933e1a8d17d6c7bed040d13f8fccca2511fff9dc` returns exit 1: the commit object
does not exist in this local repository at all. Every later ledger event
(39 onward — the events/40 amendment work, GF-111 through NVA-A1214-EXEC-01's
own closures, etc.) is unaffected; only the original 38-event 2026-07-20
baseline-migration batch cites the missing commit.

The most likely explanation, consistent with this session's own prior notes:
the sanctioned 2026-08-01 plan-revocation/R0-rebase history rewrite dropped
this specific early commit from the reachable graph. This is exactly the
kind of history rewrite the ledger's append-only design is meant to survive
by never depending on git reachability for anything but the immediate
evidence-binding check — the check itself is doing its job (failing closed
on missing evidence), it is the referenced commit that is gone.

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

1. **Accept and document.** The baseline-migration batch's `evidence.commit`
   predates and does not survive the 2026-08-01 rebase; treat this as
   permanent, known, historical drift specific to the 37-item legacy import,
   and scope `backlog-state-check`'s expected-clean baseline to exclude these
   38 specific pre-existing sequence numbers (e.g. an explicit allowlist of
   known-unreachable legacy evidence commits, checked once and pinned, rather
   than re-flagged every Verify run as if it were new).
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
