---
schema: pipeline.backlog-item.v1
id: pipeline.maintenance-window-signature-voided-by-unrelated-write
type: defect
owner: pipeline
status: closed
created: 2026-08-08
due: 2026-08-22
closed_at: "2026-08-18"
closure_repository: "self"
closure_commit: "e2151461"
closure_evidence: "plugins/pipeline-core/lib/guard-maintenance-window.test.mjs"
source: "Observed live while opening a Guard Maintenance Window for an AFK hardening session, 2026-08-08. The PO had already signed; the install failed."
---

# A maintenance-window signature is voided by a file write the human never authorized anything about

## What happened

`guard-maintenance-window.mjs prepare` bound `openingTreeSha256` to the live
plugin tree at preparation time. The PO read the confirmation, typed `approve`,
entered their passphrase, and produced a valid Ed25519 signature over the exact
intent digest. Between those two moments a parallel Goldfish wrote one unrelated
source file. `install` then refused:

    GUARD-MAINTENANCE-WINDOW-FAILED: live plugin tree drifted since the request was prepared

The signature was not forged, not replayed, not expired, and not mis-scoped. It
was simply useless, and the only route forward is to ask the same human for the
same decision a second time.

## Why this is a defect and not a working control

[ADR-0061](../../docs/adr/0061-uniform-human-approval-ceremony.md) records the
PO's binding order: one approval covers every layer of the command it authorizes
and **does not get consumed before the human's intent is finished**. The intent
here was "open a maintenance window for tonight's work". That intent was not
finished — it had not even started. What consumed the approval was an event the
human was never asked about and could not have anticipated: an ordinary write by
the very work the window exists to enable.

This is the same failure shape already recorded for the `GG-03` token in
`docs/state.md` (2026-08-07, fact 1): an approval spent by machinery rather than
by the approved action. Same family, different mechanism.

There is a second, sharper edge in the AFK case. The parallel-dispatch model the
Pipeline itself recommends makes plugin-tree writes *continuous* while work is in
flight. A prepare/sign/install ceremony that requires a frozen tree is therefore
not merely inconvenient during parallel work — it is close to unsatisfiable
during it, and gets harder the more the operating model is followed. The window
must be opened during a quiet moment that the work itself keeps destroying.

## What the binding is presumably for, and why it does not need this

`openingTreeSha256` plausibly exists so the audit record states what the tree
looked like when the lift was granted, and so a lift cannot be prepared against
one tree and silently installed against a very different one much later.

Both of those survive a weaker binding. The signed subject already carries
`repoFingerprintSha256`, the scope rule ids, an absolute `expiresAtMs`, a nonce,
and the feature/plan/spec identity. The tree hash adds provenance to the record;
it is not what makes the lift safe, and the expiry is what bounds it in time.

## Direction, not a design

Not designed here. The questions, in the order they matter:

1. **Should `openingTreeSha256` be an admission precondition at all, or only a
   recorded observation?** Recording the tree at install time — both the prepared
   and the observed hash — keeps the whole audit value without making an
   unrelated write void a human decision.
2. **If it must remain a precondition, what is the tolerated delta?** A drift
   confined to paths already inside the window's own scope is not evidence of
   tampering; it is evidence of the work proceeding. That is the same shape as
   the `approval-pending` tolerance the candidate freeze already accepts.
3. **Can `prepare` be made idempotent against its own intent?** If re-preparing
   after drift produced the *same* intent digest whenever scope, expiry, reason
   and feature are unchanged, the existing signature would still apply and the
   human would not be asked twice for one decision.

Option 3 is the one that most directly serves ADR-0061 and deserves the first
look; it is also the one with the most careful reasoning to do, since the intent
digest is what the signature covers.

## Triggering situation

Opening a 4-hour window (scope `GS-6`, `TP-1`, `TP-3`, `TP-5`) for an unattended
hardening session, with four Goldfish dispatches in flight. Reproduced
immediately and reliably: any plugin-tree write between `prepare` and `install`
does it.

## Related

- `2026-08-07-push-release-flow-unusable-for-third-party-adopters.md` — the same
  ceremony-cost thread.
- [ADR-0058](../../docs/adr/0058-guard-maintenance-window.md) — the window's own
  contract, which is where the binding is defined.
- [ADR-0061](../../docs/adr/0061-uniform-human-approval-ceremony.md) — the order
  this violates.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Option 3 — make `prepare` idempotent against its own signed
  intent digest, so a re-prepare after drift yields the same digest when
  scope/expiry/reason/feature are unchanged and the existing signature
  still applies.
- **Rationale:** PO, 2026-08-12: "option 3 aber ggf prüfen ob vorhin schon
  mit anderem item gelöst." Checked: `GG-03` (the other token/override
  mechanism referenced in `docs/state.md`) is a harness-classifier-denial
  double-confirmation override, an unrelated mechanism to this item's
  `openingTreeSha256` maintenance-window precondition — no overlap found,
  this item is not already solved elsewhere.
- **Assignment (if accepted):** SECURITY/GUARDRAIL-class (MP-07 max-tier
  model), queued for implementation this session.
- **Date:** 2026-08-12

### Verification result (NVA-BL-73, 2026-08-12) — already fixed for file writes; a narrower gap remains for commits

Investigated before implementing: the Option-3 fix (idempotent `prepare`
against its own signed intent digest) **already exists at HEAD**, landed by
an earlier, unrelated hardening pass (commits `23d93b0a`, `64450b35`).
`reusablePreparedRequest()` returns the stored request verbatim when a
re-prepare's scope/expiry-basis/reason/feature are unchanged, so an
UNRELATED FILE WRITE between prepare and install — the exact reproduction
this item was filed from — no longer voids the signature. Verified with a
new regression test (`GMW20b`, commit `d18257f3`) covering the one gap
found in existing coverage (a changed plan/spec digest correctly still
requires a fresh signature). No production code needed changing.

**A narrower version of the same user-visible symptom remains, found during
verification, not yet fixed:** `prepare` still rebuilds its `candidate`
(commit + tree) from live `git rev-parse HEAD` on every call. A COMMIT
(not just a file write) landing between prepare and install still produces
a fresh digest and `install` refuses with `GMW-CANDIDATE-COMMIT-MISMATCH`
— voiding the signature exactly as before, just for a narrower trigger
(commits, not all writes). This is confirmed deliberate: the
commit/tree-binding check was added by a LATER commit specifically after a
Critic review, so loosening it is a real security judgment call, not a
Goldfish-level fix — it directly trades off against the guarantee that
binding exists to provide.

**Status:** left `open`. The item's original, most-frequent trigger (file
writes during AFK parallel-dispatch work) is fixed. The residual
commit-landing case needs a PO decision: is `GMW-CANDIDATE-COMMIT-MISMATCH`
also unnecessarily strict for the AFK scenario (extend the idempotency to
tolerate a commit, provided the same safety properties hold), or is
binding to the exact candidate commit intentional and should stay strict
even at the cost of re-signing during active dispatch waves?

### PO decision, 2026-08-17

Option A: extend the idempotency to tolerate an intervening commit, using
the same scope/expiry/reason/feature-bound analysis that already made the
file-write case safe (`23d93b0a`, `64450b35`) — the new commit must remain
within the already-authorized scope. This is a security-tier change
(MP-07) and needs the same careful design/Critic treatment as the original
fix. Dispatched.

### Implementation landed (NVA-GMWFIX-3, 2026-08-17) — status stays `open`, Critic review pending

Dispatch `NVA-GMWFIX-3` (goldfish-deep) implemented
`intervenedCommitsStayWithinScope()`: an intervening commit (or a short
linear chain of them) between `prepare` and `install` no longer trips
`GMW-CANDIDATE-COMMIT-MISMATCH`, provided every file every commit in the
range touches is provably inside the window's own already-signed scope
(`GS-6`, or a `TP-*` id resolved via `guard-testpath.mjs`'s own
`protectedTestPaths` config — reused, not reinvented). Positive, narrow
proof only: fails closed on a merge/root commit, a rename (even when both
halves are individually in-scope), an out-of-scope file, an unparseable
diff, or any git invocation that does not succeed as expected. The
unchanged-commit path keeps its original `GMW-CANDIDATE-TREE-MISMATCH`
defense-in-depth check unchanged.

Run truncated after GREEN, before its own commit/report — Elephant
closeout: diff reviewed directly, `node --test
plugins/pipeline-core/lib/guard-maintenance-window.test.mjs` independently
rerun, 41/41 pass (35 prior + 6 new: `GMW33`-`GMW38`, covering the
in-scope-commit admission, an out-of-scope file still refusing, a merge
commit still refusing, a rename still refusing, a failed git invocation
still refusing, and the `TP-*` scope path). Commit `c8acb6a6`.

**Status stays `open`, not `closed`:** per the original dispatch's own
explicit instruction, this security-tier change needs a Critic review
before being treated as complete — not yet scheduled. Do not close this
item on the implementation alone.

### Closure, 2026-08-18 — the required Critic review already ran, as part of the Slice A7 gate chain

A dedicated 3rd Critic-review dispatch was launched against the
`c8acb6a6` candidate this session before this closure note was written.
It correctly returned **FAIL**: F1 (blocker) — `pathWithinScope()` never
consulted `isNeverLiftableKernelPath()`, so a commit rewriting the guard
kernel itself (`guard-maintenance-window.mjs` or a sibling
`NEVER_LIFTABLE_KERNEL_PATHS` entry) could be wrongly tolerated as
in-scope; F2 (major) — the `TP-*` scope-pattern set was re-read live at
install time instead of frozen at prepare time, a TOCTOU break of
ADR-0058 Decision 5's binding guarantee.

Both findings were **already fixed one commit later than the reviewed
candidate**, before this dispatch even ran: `NVA-GMWFIX-4`
(`e2151461`, "close two GMW commit-tolerance holes: kernel exclusion,
frozen TP-* patterns"), independently corroborated by the reviewer's
own commit-message match. That fix, and this exact file's kernel-closure
invariant, were then independently covered by this same session's Slice
A7 comprehensive Critic-review chain: round 4 **ran the kernel-closure
test directly rather than trusting a claim** (`GMWKC01`/`GMWKC02`, both
pass) and returned PASS with no findings on `guard-maintenance-window.mjs`
plus its full diff since round 2; round 5 closed the chain's one
remaining disclosed gap elsewhere. `docs/state.md` (2026-08-18, "continued
3") records both rounds and the fix. `e2151461` is an ancestor of the
current candidate HEAD.

The stale, pre-`e2151461` 3rd dispatch's FAIL verdict is therefore
superseded, not disregarded: it reviewed real code that genuinely had
the defect, at a commit that predates the actual fix — its finding and
the fix that resolved it are consistent, not contradictory. No further
Critic dispatch is needed; re-running one against the current candidate
would re-derive the same already-recorded PASS. Original trigger (a
signature voided by an unrelated file write) fixed by `23d93b0a`/
`64450b35`; the narrower commit-landing case fixed by `NVA-GMWFIX-3`
(`c8acb6a6`) and hardened by `NVA-GMWFIX-4` (`e2151461`); both
independently Critic-verified. Closed.
