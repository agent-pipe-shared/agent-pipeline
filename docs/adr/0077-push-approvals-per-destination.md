# Push approvals are stored per destination, not in a single overwritable slot

> Agent-Pipeline · Sprint Nova · as of 2026-09-01

> **Accepted as ADR-0077 on 2026-09-01.** Written as `draft-push-approvals-per-destination.md`
> and numbered in the act of acceptance, per [ADR-0069](0069-adr-numbers-are-allocated-at-acceptance.md)
> Decision 2 — this file's rename, its index row in `docs/adr/README.md`, and this status change
> are one commit.

**Status:** accepted (2026-09-01, PO decision in session). **Basis:**
`backlog/items/2026-09-01-a-push-approval-occupies-a-single-slot-so-destinations-cannot-be-prepared-together.md`,
filed from a measured live release. **Refines** [ADR-0056](0056-push-approval-mode.md) (the push
gate itself and its `signature`/`chat` clearance modes) without reopening it. **Leaves untouched**
[ADR-0061](0061-uniform-human-approval-ceremony.md)'s one-command/one-word/one-PIN ceremony shape
and [ADR-0074](0074-port-authorize-critical-ceremony.md)'s `authorize-critical` ceremony: this
decision is about where an already-produced approval is *stored* after the ceremony completes,
never about how the ceremony itself runs.

**Governs:** plugins/pipeline-core/scripts/pipeline-state.mjs, plugins/pipeline-core/hooks/guard-push.mjs, plugins/pipeline-core/scripts/push-prepare.mjs

Specifically: `pipeline-state.mjs`'s `approve-push` subcommand and its `pushApproval` state shape,
`guard-push.mjs`'s push-time reader, and `push-prepare.mjs`'s `foldPendingPushApprovalWrite`.

## Context

### The measured problem

Releasing 0.6.0 on 2026-09-01 required pushing one verified candidate to three destinations —
`feat/sprint-nova-codex-v046`, `main`, `stable`. Each destination needed its own complete
sign → `approve-push` → push cycle, with the human present for every one, because a second
`approve-push` call overwrites the first destination's still-pending approval before it has been
consumed by a push. The human could not sign all three back to back in one sitting and let the
agent push them in sequence.

`approve-push` (`plugins/pipeline-core/scripts/pipeline-state.mjs`, ~line 9039) writes:

```js
pushApproval: { lastApproved: approvalRecord }
```

into the state object — a single named slot, not a keyed collection. Approving destination B
replaces `pushApproval.lastApproved` wholesale with B's record; destination A's record, holding
A's own `forCommit`/`remote`/`destination`/`criticalProof` binding, is gone. A subsequent push to
A is then refused by `guard-push.mjs` with "Push approval is bound to a different remote or
destination than this push" (~line 2029) — even though A's proof was validly produced and
consumed.

Compounding it, as the backlog item records: the signed subject binds
`{sourceCommit, remote, destination, threatModel}` (confirmed below), and
`push-prepare.mjs`'s `checkEvidenceFreshness` (~line 158) separately refuses whenever the recorded
evidence's `commit !== HEAD`. Any commit landing between destinations — the push itself moves
HEAD — forces a fresh full Verify run (505 suites, ~10 minutes measured) before the next signature
is even possible. This ADR does **not** touch that binding; see "What this does not fix" below.

### What `guard-push.mjs` actually reads (established by reading the file, not assumed)

At push-authorization time (`plugins/pipeline-core/hooks/guard-push.mjs`, ~lines 1999–2032,
~2109, ~2191), the general-mode push check reads exactly `state.pushApproval.lastApproved` and
requires, in order:

1. `approval.forCommit === sourceCommit` (the pushed source commit) — else "Push approval missing
   or stale";
2. `approval.remote === pushBinding.remote` **and** `approval.destination === pushBinding.destination`
   — else "Push approval is bound to a different remote or destination than this push" (PUSHBIND-1,
   backlog 2026-08-18, deliberately checks both fields, not `forCommit` alone);
3. independently, the recorded `criticalProof` is re-verified (line ~2191 reads
   `state.pushApproval.lastApproved.criticalProof.proofSha256`) — the code's own comment states
   plainly that "a pushApproval in mutable state is never executable authority on its own."

Any storage change must keep satisfying exactly these three checks per stored record — nothing
about *how many* records exist changes what a single record must contain or how it is verified.

### What the signed subject covers (established by reading the signer and the call site)

`criticalActionSubjectSha256({kind, candidate: {commit, tree}, subject})`
(`plugins/pipeline-core/lib/critical-action-approval-request.mjs`, lines 41–47) digests
`{schema, kind, candidate, subject}`. `approve-push`'s call site
(`pipeline-state.mjs`, line ~8989) builds `subject: { sourceCommit: observed.commit, remote,
destination, threatModel: threatModelBinding }`. **The destination is already part of what the
human signs.** A signature produced for destination A cryptographically cannot be presented as a
signature for destination B — this was true before this decision and is unchanged by it. Storing
approvals per destination does not create a new trust relationship; it only stops a second,
independently-signed approval from destroying the record of the first.

### What already protects against replay (established by reading `approve-push`'s consumption logic)

`criticalProofConsumption` (`pipeline-state.mjs`, ~lines 8992–9002, ~9040–9042) is **already a
list**, keyed by `proofSha256`, **shared across kinds** (`push`, `feature-package-reconcile` — not
kind-restricted, per the schema comment at lines 79–83). A proof already present there, of any
kind, refuses a repeat presentation with `CRITICAL-PROOF-REPLAY`. Approving destination A and then
destination B consumes two *different* proofs (each destination requires its own signed subject,
per the previous point), and both consumptions are independently, permanently recorded. **This
list is not the defect.** The defect is entirely in `pushApproval.lastApproved` — the single
*readable* record `guard-push.mjs` matches an attempted push against — not in the underlying
single-use guarantee on the proof itself.

### The precedent already in this file for exactly this shape

`deployApprovals` (schema comment, `pipeline-state.mjs` lines 61–69) solves the identical problem
for the deploy route, already: "a LIST, NOT a single overwritable slot like `pushApproval` — a
slot would silently clobber an unconsumed approval for a different environment/artifact." It is
keyed by `{forArtifact, forEnvironment}`, consumed on use via a dedicated `consume-deploy`
subcommand that sets `usedAt`, and has its own `clear-deploy` housekeeping subcommand for
abandoned/erroneous entries. The comment names `pushApproval` by name as the single-slot shape
being contrasted against — this repository already recognized the general failure mode and fixed
it once, for a sibling gate, without yet applying the same fix to `pushApproval` itself.

### What has no consumption step today (established by reading `foldPendingPushApprovalWrite`)

Unlike `deployApprovals`, `pushApproval.lastApproved` has no `consume-push` analogue anywhere.
`push-prepare.mjs`'s `foldPendingPushApprovalWrite()` (lines 438–498) only clears the transient
`pendingAuditWrite` flag once the approval's `forCommit` no longer equals HEAD (i.e., once the
push it authorized has actually landed and HEAD moved past it) — it never deletes or archives the
approval record itself. Today, an already-used approval simply sits in `lastApproved` until the
*next* `approve-push` call overwrites it. The single-use security property comes entirely from
`criticalProofConsumption` (previous section); `pushApproval` storage has never been the thing
enforcing single use, only the thing `guard-push.mjs` reads to find a currently-matching record.

## Decision

**Store push approvals keyed by `{remote, destination}`, additively, alongside the existing
`lastApproved` slot — and update the reader to resolve the keyed entry first.**

### D1 — Additive schema: `pushApproval.byDestination`

Add `pushApproval.byDestination`, a map keyed by the composite string `` `${remote}\0${destination}` ``
(or equivalent unambiguous composite — the exact separator is an implementation detail, not a
decision this ADR fixes) to `approvalRecord` values of the **same shape** `approve-push` already
builds (`approvedBy`, `approvedAt`, `forCommit`, `criticalProof`, `remote`, `destination`,
`threatModel`, and the optional `humanApproval`/`criticalProofWaiver`/`decisionReference`/
`pendingAuditWrite` fields it already carries). `approve-push` writes to
`pushApproval.byDestination[key]` **in addition to** `pushApproval.lastApproved` (which keeps
receiving the most-recently-approved record, unkeyed, exactly as today) — never a replacement of
the top-level shape, per `pipeline.state.v0`'s "every field beyond `schema` is optional" contract
(schema comment, lines 26–60). A state file written before this decision has no `byDestination`
key at all; that is valid and equivalent to an empty map.

**Divergence from the backlog item's own sketch, stated:** the backlog item (Proposal section)
sketches `pushApproval.byDestination[destination]`, keyed by destination alone. This ADR keys by
`{remote, destination}` instead, because `guard-push.mjs`'s own check (PUSHBIND-1, ~line 2007)
matches on **both** fields — a destination-only key would let two different remotes sharing a ref
name (an edge case, but one the existing reader already distinguishes) collide in the store. Keying
by the same tuple the reader already checks is the smaller, more defensible change.

### D2 — The reader change is part of this decision, not a follow-up

Adding the keyed map without changing what `guard-push.mjs` reads accomplishes nothing: the reader
would still resolve only `pushApproval.lastApproved`, and the defect — a second `approve-push` call
still overwriting the one record the reader looks at — would be unchanged. `guard-push.mjs`'s
push-authorization check must be changed to resolve `pushApproval.byDestination[{remote,
destination}]` **first**, falling back to `pushApproval.lastApproved` only when no keyed entry
matches (so a state file written by an old `approve-push`, with no `byDestination` map at all,
keeps authorizing exactly as it does today — no migration, no re-signing of pre-existing
approvals). This ADR decides both halves together because recording only the schema half would be
a decision that does not achieve its own stated goal.

### D3 — No new consumption step; the existing single-use invariant is untouched and sufficient

The keyed record does **not** need its own `consume-push`/`usedAt` mechanism to preserve
single-use security, because single use was never enforced by `pushApproval` storage in the first
place — it is enforced by `criticalProofConsumption` (Context, above), which is unaffected by this
decision: it already tracked every approved destination's proof independently, additively, before
this ADR and continues to do so after it. Concretely:

- Approving destination A, then destination B, still consumes two distinct proofs into
  `criticalProofConsumption`; a stale or reused proof for either is refused by
  `CRITICAL-PROOF-REPLAY` exactly as today.
- Under the keyed store, A's `byDestination` entry now *survives* B's approval (this is the fix,
  not a new risk) — a later push to A at the same, still-matching HEAD is still authorized, which
  is the intended outcome: the human signed for A once, and that clearance should remain usable
  until A is actually pushed or HEAD moves past `forCommit`.
- A repeated `git push` to a destination that already carries that exact commit is a no-op at the
  git layer; an approval entry that outlives its own consumption (i.e., the push already happened,
  HEAD has not moved) grants no additional capability beyond re-attempting an already-completed,
  idempotent action.
- **Left open, deliberately, as housekeeping rather than security:** an approved-but-never-pushed
  keyed entry has no `clear-push` analogue to `deployApprovals`' `clear-deploy`. This is not a
  correctness gap (a stale entry cannot authorize a push to the wrong commit — D4 below — and
  cannot be replayed as a fresh proof), only an accumulation-hygiene question, named here for a
  future decision rather than folded into this one.

### D4 — Candidate binding: unchanged per-entry, never merged across entries

Each keyed entry carries its own `forCommit`, exactly as `lastApproved` does today; a keyed store
must never let one destination's entry be read against a different destination's `forCommit`, and
must never treat "some entry in the map matches this commit" as sufficient without also matching
the specific `{remote, destination}` key being pushed to. This is not a new constraint — it is the
existing per-record binding (Context, "What `guard-push.mjs` actually reads"), restated to make
explicit that a keyed store must preserve it per entry rather than accidentally pooling fields
across entries.

### D5 — An implementation obligation this decision creates, named so it is not rediscovered live

`push-prepare.mjs`'s `foldPendingPushApprovalWrite()` (lines 438–498) hardcodes the path
`pushApproval.lastApproved.pendingAuditWrite` and folds exactly one record. Under a keyed store
where two or more destinations can be approved (and therefore pending-uncommitted) in the same
sitting, "the record" this function folds is ambiguous — it must be extended to fold every pending
entry across `byDestination` (and `lastApproved`), not silently continue folding only one and
leaving the others' `pendingAuditWrite: true` flags stuck. This ADR does not design that fix; it
names the obligation so the eventual implementation dispatch starts from a known list rather than
finding it live.

## What this decision does NOT do

- **It does not reduce the number of human signatures.** The destination is part of the signed
  subject (Context, above); each destination still needs its own act of signing. What changes is
  that those acts can happen back to back in one sitting, with no push, and therefore no
  intervening commit, forced between them.
- **It does not touch the whole-tree, whole-commit gate binding.** `checkEvidenceFreshness`'s
  `data.commit !== headCommit` refusal (`push-prepare.mjs`, ~line 158) and the signed subject's own
  `sourceCommit` binding are unchanged; this is the general shape recorded in
  `backlog/items/2026-08-16-every-gate-binds-the-whole-tree-so-any-later-commit-voids-it.md`. A
  push that itself moves HEAD still requires a fresh Verify/evidence pass before the *next*
  destination's evidence freshness check passes, even once that destination's approval is already
  safely stored. Multiple pre-signed approvals remove the "sign again from scratch" cost; they do
  not remove the "re-verify from scratch" cost.
- **It does not change ADR-0056's gate strength or ADR-0061's ceremony shape.** `signature` stays
  the default and every failure mode still resolves to it; `chat` stays exactly as weak and exactly
  as declared as before. This decision is entirely about storage after a clearance is already
  produced.

## Alternatives considered

### Considered and REJECTED: one signature over an enumerated destination set

The backlog item's second sketch: a single signed subject naming a SET of destinations —
`{main, stable, feat/sprint-nova-codex-v046}` together — signed once, with each push consuming its
share of that one approval.

**Trade-off, stated honestly.** This would reduce three passphrase entries to one, which the
per-destination store (this decision) does not. But it changes *what a human is attesting to*: a
per-destination signature says "I approve this exact push, to this exact ref, right now"; a
set-subject signature says "I approve this set of pushes, whichever of them eventually happen." That
is a different trust boundary — the human commits to a plan rather than to an act — and ADR-0061's
own framing ("der human prüft und gibt FREI — er gibt damit sein okay", "einmal befehl kopieren,
approve schreiben, pin eingeben") is written in terms of one clearance per act. Widening the
signed subject to a set is exactly the kind of trust-boundary question that deserves its own
decision, deliberately, rather than arriving as a side effect of fixing a storage bug.

**Rejected, not deferred (PO, 2026-09-01):** a push to `main` is rare, so the passphrase-count
saving is both small and rarely collected, while the widened trust boundary would be permanent.
The PO weighed those against each other directly and chose the narrower boundary. Recorded as a
closed question rather than a parked one: reopening it needs a new decision and a new reason, not
merely a later appetite for fewer prompts.

### Considered and rejected: migrate `lastApproved` away instead of keeping it additive

A schema migration that replaces `lastApproved` with the keyed map outright, dropping the unkeyed
field. Rejected: `guard-push.mjs` reads `state.pushApproval.lastApproved` at several points beyond
the general-mode check (chat-mode branches, PUSHBIND-1, the critical-proof re-verification), and a
pre-existing state file recorded before this decision has no `byDestination` map — refusing to
authorize that file's still-valid, still-`forCommit`-matching approval until it is re-signed would
be an availability regression this ADR has no reason to impose. The additive shape (D1) costs
nothing a migration would have saved, and avoids re-litigating every existing reader against a
removed field.

### Considered and rejected: a `consume-push` command mirroring `consume-deploy` exactly, mandatory in this decision

Modeling the fix entirely on `deployApprovals`, including its explicit `usedAt`-setting consume
step. Rejected as *mandatory* for this decision (D3, above): `deployApprovals` needed an explicit
consume step because nothing else in that route enforces single use — there is no external
cryptographic proof binding a deploy approval to one-time use the way `criticalProofConsumption`
already binds every push approval. Importing the consume step here would add a mechanism the push
route does not need to close the defect this ADR was written to fix, at the cost of a second
implementation surface. The housekeeping question (D3's last bullet) is left open rather than
answered by importing a mechanism whose own justification does not carry over.

## Consequences

**Positive.** A human can sign for multiple destinations in one sitting once each destination's
own evidence is fresh; the agent can then push them in sequence without the human being drawn back
in per destination. A destination's approval, once produced, is no longer destroyed by a sibling
destination's approval. No existing state file needs migration or re-signing.

**Negative.** `pushApproval` grows a second, keyed shape alongside the original slot — two readers
to reason about (`lastApproved`, `byDestination`) rather than one, until a future decision retires
the unkeyed slot (not proposed here). `foldPendingPushApprovalWrite()` (D5) needs an implementation
change to keep folding every pending entry rather than only one, and until that lands, a session
approving two destinations in the same sitting could leave a second entry's `pendingAuditWrite`
flag stuck `true` after the first is folded — an implementation defect to guard against at build
time, not a design flaw in this decision. The set-subject alternative's passphrase-count benefit
remains unrealized; this decision trades that benefit for a narrower, better-bounded trust
boundary, deliberately and permanently (PO, 2026-09-01).

## Follow-up

- Implementation dispatch: D1 (schema) + D2 (reader) together, since D2 states they must land
  together to have any effect; D5's fold-multiple-entries fix; negative-corpus coverage for a
  keyed entry whose `forCommit` no longer matches HEAD, and for the `lastApproved`-fallback path
  against a pre-existing state file with no `byDestination` map.
- `backlog/items/2026-08-16-every-gate-binds-the-whole-tree-so-any-later-commit-voids-it.md`
  remains open and is not narrowed by this decision, beyond confirming (Context, above) that the
  push-approval slot defect was one specific, now-decided instance of that general shape.
