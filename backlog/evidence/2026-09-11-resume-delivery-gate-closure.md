# Resume-Hint delivery gate closure

Final implementation candidate:
`b757f6a6f8321ac607e4765c2480173242a4eca3`.

The repair introduces a private digest-bound delivery marker so Verify can
distinguish a freshly captured card from a card that a later bootstrap began
surfacing. The hook persists delivery before exposing content and then records
consumption. Missing identity or failed delivery persistence leaves both the
content and marker pending. Failed consumption after persisted delivery remains
fatal. Malformed markers fail closed; a well-formed marker for a replaced card
does not attach to the new digest.

Focused host-bound verification:

- Resume-Hint library: 27 passed, 0 failed.
- Any-session checker and CLI: 26 passed, 0 failed.
- SessionStart output and real private-state integration: 48 passed, 0 failed.
  The no-session case directly asserts `RH-CHECK-PENDING-DELIVERY` after the
  hook returns.
- Verify suite registration: 528 registered, 0 unregistered.
- `git diff --check`: clean.

The first independent Critic round found that invalid or unavailable delivery
state could be mistaken for a never-delivered card. Commit `63d66cfe` separated
malformed markers and withheld content when marker persistence fails. The
second independent Critic round found that the placeholder no-session identity
still created an unavoidable missing-receipt failure and that rollback was not
documented. Commit `b757f6a6` leaves no-identity delivery pending, adds the exact
hook-to-Verify regression assertion, and records rollback in the item.

After the two substantive rounds, QG-13 ends further review loops. The final
self-check was restricted to `21220c90..b757f6a6` and the direct consequences
named by both findings. It confirmed that the hook has only three outcomes:
pending without exposure, exposed with delivery plus receipt, or exposed with
delivery and a missing receipt that Verify rejects. No native Codex sandbox
claim is part of this evidence.

Rollback is to revert the Nova B Resume-Hint delivery series beginning at
`6988f1ed` while retaining the registered conservative consumption check. The
private marker is non-authoritative, so the prior reader ignores it and no
migration is needed.
