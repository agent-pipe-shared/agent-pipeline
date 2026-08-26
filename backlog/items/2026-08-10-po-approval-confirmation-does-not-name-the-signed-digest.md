---
schema: pipeline.backlog-item.v1
id: pipeline.po-approval-confirmation-missing-intent-digest
type: defect
owner: pipeline
status: closed
created: 2026-08-10
source: "Found on 2026-08-10 by the K-AC-05 round-4 (final) Critic review of the fork-disposition approval mechanism (commit 4673ff8a under review), while checking whether a tampered approvalIntent could still reach signing after that round's F2 fix. The Critic scoped it explicitly as a pre-existing defect in the shared signing ceremony, outside the reviewed delta's three changed files, and recommended routing it as its own work package rather than folding it into K-AC-05's exhausted Critic cap. Verified independently by the Elephant against source before filing."
due: 2026-09-09
closed_at: "2026-08-18"
closure_repository: "self"
closure_commit: "141550c32f29a5d771f9638a7aaa0823904fb699"
closure_evidence: "backlog/items/2026-08-10-po-approval-confirmation-does-not-name-the-signed-digest.md"
---

# The `approve`/`approve-critical` confirmation summary never shows the digest OpenSSL is about to sign

## Description

`plugins/pipeline-core/scripts/po-human-approval.mjs:303-316` (`approve`/`approve-critical`, and by
delegation `approve-fork-disposition`) reads `intentSha256` verbatim from the on-disk request file's
`approvalIntent.sha256` field with only a shape check (`SHA.test`, `:305`), builds a human-readable
confirmation `summary` array (`:309-313`) that shows `kind`, `candidate commit`, and — for critical
actions — `action subject sha256` and `action expires at`, then signs `intentSha256` with the private
key (`:315-316`) once the human types `approve`.

**The confirmation summary never displays `intentSha256` itself — the value actually signed.**

## Why this is exploitable, not merely inelegant

An actor with write access to the external request file directory (`--directory`, the PO's own
external approval directory) can leave every displayed field (`kind`, `candidate`, `subject sha256`,
`expiresAt`) correct and matching what the human expects to approve, while substituting
`approvalIntent.sha256` with the intent digest of a *different* critical request — for example, a
`push` action's intent digest, computed the same way from different `approvalIntent.value` content.
The human sees a summary that looks exactly like the fork-disposition (or push, or deploy) approval
they intended, types `approve`, and the private key signs a digest they never saw and cannot verify
from the terminal output. `plugins/pipeline-core/lib/critical-action-approval-request.mjs:104-113`
only catches the mismatch at *verify* time — against the substituted request itself, which is
internally self-consistent — never against whatever the attacker's other, real request needed signed.

Confirmed against source (not assumed): `approvalRequestFromExternalJson` (`po-approval-request.mjs:52-55`)
is a shape-only unwrapper, performing no digest re-derivation from `approvalIntent.value`. The sibling
`sign-intent` ceremony already does the right thing for comparison — its confirmation names the digest
being signed (`scratch/verify-WP-K-AC05-F1F2FIX.txt`: "after an accepted confirmation naming the
digest") — `approve`/`approve-critical` do not.

## Scope: the shared ceremony, not any one kind

This is not specific to the fork-disposition mechanism (ADR-0063) that surfaced it. `approve` and
`approve-critical` are the one shared signing branch for `push`, `deploy`, `publication`, and (via
`approve-fork-disposition`'s delegation) `governance-fork-disposition` — fixing it correctly improves
every kind's confirmation, and any fix must be re-verified against all of them, not just the one that
found the gap. That is why it is filed here rather than reopened against K-AC-05: K-AC-05's own
4-round Critic cap is exhausted (round 4, final, PASS) and this defect's blast radius exceeds that
package's scope.

## Proposed repair

Add the intent digest to the confirmation `summary` array before `requireExplicitConfirmation` is
called, for every signing path (`approve`, `approve-critical`, and transitively
`approve-fork-disposition`):

```js
const summary = [`kind: ${kind}`, `candidate commit: ${request?.candidate?.commit}`, `intent sha256: ${intentSha256}`];
```

Mechanical, one line, applies uniformly. Needs a fresh, dedicated Critic cycle (this is a genuinely
separate concern from K-AC-05's fork-disposition mechanism, not a continuation of its cap) covering
the shared ceremony and re-verified against the push/deploy/publication test suites, not only the
fork-disposition ones.

## Related

- `plugins/pipeline-core/scripts/po-human-approval.mjs` — the ceremony this item is scoped against.
- `docs/adr/0063-fork-disposition-approval-proof.md` — the track whose round-4 Critic review found this.
- `docs/po-human-approval.md` — the human-facing operating doc for this ceremony; would need updating
  alongside any fix.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Accept and fix.
- **Rationale:** Added `` `intent sha256: ${intentSha256}` `` to the `approve`/`approve-critical` (and by delegation `approve-fork-disposition`) confirmation `summary` array in `plugins/pipeline-core/scripts/po-human-approval.mjs`, placed right after the `kind:` line, matching the sibling `sign-intent` command's existing digest-naming style. Verified with a test asserting the confirmation prompt matches the intent digest actually signed.
- **Assignment:** this dispatch (PHX-WP-POHUMAN-SIGNING-ERGO)
- **Date:** 2026-08-18
- **Closure commit:** this commit (fix and closure land together; see this dispatch's commit for the `approve`/`approve-critical` summary array).
