# Ledger event 403 accepted-drift review brief

Review the change from its fixed base through the candidate against these
criteria:

1. The append-only transition ledger and the closed item's correct full
   `closure_commit` remain byte-for-byte unchanged.
2. The two drift findings caused by ledger event 403's abbreviated commit OID
   receive one explicit, machine-readable accepted disposition.
3. Acceptance is bound to the exact immutable event: physical position,
   sequence, item id, transition, date, actor, chain hashes, and evidence
   tuple. A lookalike or later abbreviated OID remains undispositioned.
4. The existing accepted historical unreachable-commit batch retains its
   existing label and gains an explicit accepted disposition without changing
   blocking severity.
5. Hash-chain damage and every finding outside these recorded acceptances
   continue to fail or remain visibly undispositioned under the existing
   classification rules.
6. The command-line report names the accepted reason plainly and the focused
   regression suite covers both the real record and negative mutations.

The change must not widen an amendment authorization, append a repair event,
accept abbreviated OIDs generally, or suppress drift output.

If the accepted-drift behavior regresses, revert implementation commit
`7a4a60725abb3acb5dec8a2e9e747ea42f9f501a`. That commit does not edit or
append to the ledger, so its revert restores the prior labels and CLI wording
without a ledger repair or migration. This later documentation correction can
remain in place or be reverted independently.
