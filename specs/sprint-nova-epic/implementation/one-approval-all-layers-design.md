# One approval, all layers — implementation design for ADR-0061

> Agent-Pipeline · Sprint Nova · 2026-08-07 · implements
> [ADR-0061](../../../docs/adr/0061-uniform-human-approval-ceremony.md)
> Decision 6, which deliberately left the mechanism open.

PO order, verbatim, on the day of the v0.5.3 release:

> *"passt diese ganzen bescheuerten guardrails und harnesse so an, dass eine
> einmalige freigabe für alle ebenen des befehls gilt und sich nicht mehr
> verbraucht bevor das intent des human erledigt ist"*

Two requirements, and they are different mechanisms:

- **R1 — one approval covers every layer of the same command.** The human
  authorizes *the thing*, not each guard that happens to sit in front of it.
- **R2 — an approval is not spent before the human's intent is fulfilled.** A
  refused attempt, a rejected remote, a retry: none of these may burn it.

Everything here is bounded by ADR-0061 Decision 5 — the gate stays, the
signature stays unforgeable by the agent, `chat` stays opt-in — and by its
Decision 0 disposal test: for every step, name the agent behaviour it prevents.

## What the current mechanism actually is

Established by reading, not assumed:

- **The signature** (`authorizeRecordedPush`, `critical-action-authorization.mjs:224`)
  binds `{kind, candidate:{commit,tree}, subject:{sourceCommit, remote,
  destination, threatModel:{path,sha256}}}` against the trust anchor committed
  at `project/critical-human-proof.json`. It verifies the recorded proof, the
  threat model's *current* bytes, and that the proof was consumed in the same
  transaction that recorded the approval. Per-commit, per-destination,
  unforgeable by the agent.
- **`approve-push`** (`pipeline-state.mjs:5140`) verifies the proof, then writes
  `pushApproval.lastApproved` and a `criticalProofConsumption` entry into
  `project/pipeline-state.json`, which is **tracked**.
- **GG-03** (`guard-git.mjs:276`) matches any `git push … :refs/heads/main` and
  blocks it. It is lifted only by an inline `PIPELINE_GUARD_OVERRIDE=
  "GG-03|<token>|<reason>"`, consumed **once**, ledgered to
  `project/guard-override.log.jsonl`, and the consumption is recorded at match
  time — before anything downstream has decided whether the command runs.
- **Verify** refuses a dirty candidate outright (`verify.mjs:462`).

The four measured failures of the v0.5.3 release follow mechanically from that
list, and each maps to one change below.

## Change 1 (R1) — a verified push signature IS the GG-03 confirmation

**Today:** the human signs a per-commit, per-destination Ed25519 proof for
`kind: push`, and *then* types `OVERRIDE GG-03` and the agent arms a token.

**Decision-0 test:** what agent behaviour does the typed phrase prevent that the
signature does not? None. The signature is strictly stronger: it names the
commit and the destination ref, it cannot be produced by the agent, and it is
verified against a committed anchor. The phrase is a human re-confirming a
decision they already signed — the definition of mothering in ADR-0061.

**Change:** in `guard-git.mjs`, when the matched rule set is exactly `{GG-03}`
and the command is a `git push`, the guard calls `authorizeRecordedPush` with
the observed candidate, the parsed remote, and the parsed destination. On
`authorized: true` it allows the push and writes an audit entry recording the
authorization it relied on (`keyReference`, `forCommit`, `destination`). No
token, no phrase, no extra human act.

**What stays:** GG-03 blocks exactly as before whenever there is no verified
approval for *this* commit and *this* destination — which is the unattended-agent
case it was built for. The `PIPELINE_GUARD_OVERRIDE` route stays for every other
rule and as the fallback when no signature is in play. A `--force`/`+refspec`
push still matches GG-01/GG-02, and the "every matching rule must be the single
armed rule" invariant is preserved: this admission applies only when GG-03 is
the *only* match.

**Parsing constraint:** the destination must be read from the command, and a
push that does not write out its destination ref cannot be matched against an
attestation. The existing requirement to push `HEAD:refs/heads/<branch>` (or an
explicit sha) therefore stays, and the denial must now *say so*, which today it
does not.

## Change 2 (R2) — an override token survives a failed attempt

**Today:** `findConsumption` treats any prior ledger entry for `rule|token` as
final. The v0.5.3 release burned two tokens on commands that never ran: one
refused by the Claude Code harness classifier *after* the guard had consumed it,
one rejected by the remote's ruleset.

**Change:** the ledger entry gains a binding and a lifetime. On first match the
guard appends `{ts, rule, token, reason, command, commandSha256, candidateCommit,
status:"armed", expiresAt}`. On re-presentation the guard admits the same token
**only** when all of: same `rule`, same `token`, identical `commandSha256`,
identical `candidateCommit`, `now < expiresAt`, and the same physical project
target (the existing `targetSha256` check). Each admission appends a `retry`
entry, so the audit trail gains detail rather than losing it. Anything that
differs — a different command, a moved HEAD, an expired arming — needs a fresh
token exactly as today.

**Why this is not a weakening:** the authorization the human gave was for *that
command against that candidate*. Re-running the identical command against the
identical candidate is the same authorized act, not a second one. What the
one-time rule actually prevented was reuse for a *different* act, and the
binding above prevents that far more precisely than an unbound counter did.

**TTL:** `expiresAt` defaults to 60 minutes from arming, configurable per repo.
An arming that outlives the session that requested it is not a retry window.

## Change 3 (R2) — the approval must not invalidate itself

**Today:** `approve-push` writes into tracked `project/pipeline-state.json`, so
every approved push dirties the tree; `verify.mjs:462` then refuses the
candidate; committing the record moves `HEAD` past the `forCommit` the approval
names. Approve → verify → push cannot all three be walked. This is finding 7c.

**Change:** the candidate freeze tolerates exactly one shape of dirt — a
modification confined to `project/pipeline-state.json` whose diff against `HEAD`
is a valid push-approval transition for the *current* `HEAD`, validated by the
same library that writes it. Any other modified path, and any state diff that is
not that transition, still refuses. The evidence binding for such a run is
labelled (`approval-pending` rather than `exact`) so a Verify run under an
armed approval is never mistaken for a run on a pristine tree.

**Rejected alternative:** moving the approval record out of the tracked state
file. The record is authority — it is what `authorizeRecordedPush` reads — and
untracking it would make the authorization unauditable in history to remove a
scheduling inconvenience.

## Change 4 (ADR-0061 Decisions 1/4) — one command, and it says what it signs

**Today:** `po-approval-gate.mjs prepare-critical` (eight flags, agent-blocked
in practice by `GUARD-CROSS-REPO-MUTATION`) followed by
`po-human-approval.mjs approve-critical`. A failed prepare plus a successful
sign yields a confidently signed *stale* request — measured this session.

**Change:** one human-run command that prepares and signs in a single
transaction, printing what is about to be signed — action, candidate commit,
destination, expiry, and what the approval will *not* cover — immediately before
the passphrase prompt. The request file remains a written artifact, but it is
never a separate human step, so there is no window in which a stale one can be
signed. `prepare-critical` stays for programmatic use and gains a field-naming
validation error (today it says only `critical approval request is invalid`).

**Human's part afterwards:** paste one command, read what it states, enter the
passphrase. Three acts, per ADR-0061 Decision 1.

## Sequencing, and what each stage is worth on its own

1. **Change 1** — removes one human act and the whole token ritual from the
   signed-push path. Independently shippable.
2. **Change 2** — removes the token burn. Independently shippable, and still
   worth having for every rule that has no signature route.
3. **Change 3** — makes approve → verify → push walkable. Independent.
4. **Change 4** — collapses two commands into one and closes the stale-request
   failure mode. Independent, largest surface.

## Verification obligations

Every change here is guardrail- or security-class, so each carries: new cases in
the owning suite (`guard-git.test.mjs`, `nova-candidate-freeze.test.mjs`, the
approval-gate suites), registration in `verify.mjs` where a new suite appears, a
full Verify run on a fixed candidate, and an independent Critic review under
[ADR-0014](../../../docs/adr/0014-critic-contract.md) before the PO gate. The
adversarial cases that must exist, stated up front so they cannot be quietly
skipped:

- Change 1: a push whose destination differs from the signed one; a push at a
  commit that is not `forCommit`; a `--force` push carrying a valid approval
  (must still block on GG-01); a tampered `project/pipeline-state.json`; a
  missing/edited threat-model file; an absent anchor.
- Change 2: the same token against a different command; the same command after
  `HEAD` moved; an expired arming; a token presented in a different physical
  project root.
- Change 3: a dirty tree with any second modified path; a state diff that is not
  an approval transition; an approval whose `forCommit` is not `HEAD`.
- Change 4: a signature attempted against a request that failed to prepare (must
  be impossible by construction, not by ordering).

## Prerequisite

All four changes touch `plugins/pipeline-core/**` and their protected test
paths, which GS-6 and the TP-* rules refuse unconditionally in a self-hosted
session. A signed Guard Maintenance Window ([ADR-0058](../../../docs/adr/0058-guard-maintenance-window.md))
scoped to `GS-6` and the relevant `TP-*` ids is required before any of this can
be written — one command for the PO, one passphrase.
