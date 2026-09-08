# ADR-0061: every human gate is the same ceremony — one command, one word, one PIN

> Agent-Pipeline · Sprint Nova · as of 2026-08-07

**Status:** accepted as a binding requirement (2026-08-07, PO instruction, chat,
issued as an explicit order during the v0.5.3 release), open for its mechanism.
**Constrains** [ADR-0055](0055-critical-human-proof-waiver.md),
[ADR-0056](0056-push-approval-mode.md),
[ADR-0058](0058-guard-maintenance-window.md),
[ADR-0059](0059-signed-human-guard-override.md); every future gate design
inherits it.

**Governs:** plugins/pipeline-core/scripts/po-human-approval.mjs, plugins/pipeline-core/scripts/po-human-approval.test.mjs, plugins/pipeline-core/lib/critical-action-approval-request.mjs, plugins/pipeline-core/lib/critical-action-approval-request.test.mjs, plugins/pipeline-core/scripts/po-approval-gate.mjs, plugins/pipeline-core/scripts/po-approval-gate.test.mjs, plugins/pipeline-core/lib/critical-human-proof-policy.mjs, plugins/pipeline-core/lib/critical-human-proof-policy.test.mjs, plugins/pipeline-core/lib/copy-safe-command.mjs, plugins/pipeline-core/lib/copy-safe-command.test.mjs, plugins/pipeline-core/lib/chat-gate-ceremony.mjs, plugins/pipeline-core/lib/chat-gate-ceremony.test.mjs, plugins/pipeline-core/lib/po-gate-authority.mjs, plugins/pipeline-core/lib/po-gate-authority.test.mjs, plugins/pipeline-core/lib/plan-spec-state-v2.mjs, plugins/pipeline-core/lib/plan-spec-state-v2.test.mjs, plugins/pipeline-core/lib/project-onboarding-v3.mjs, plugins/pipeline-core/lib/project-onboarding-v3.test.mjs, plugins/pipeline-core/scripts/pipeline-state.mjs, plugins/pipeline-core/scripts/pipeline-state.test.mjs, plugins/pipeline-core/scripts/push-prepare.mjs, plugins/pipeline-core/scripts/push-prepare.test.mjs, plugins/pipeline-core/scripts/release-preflight.mjs, plugins/pipeline-core/scripts/release-preflight.test.mjs, plugins/pipeline-core/scripts/release-preflight-cli.mjs, plugins/pipeline-core/scripts/release-preflight-cli.test.mjs, plugins/pipeline-core/lib/human-guard-override.mjs, plugins/pipeline-core/lib/human-guard-override.test.mjs, plugins/pipeline-core/lib/guard-maintenance-window.mjs, plugins/pipeline-core/lib/guard-maintenance-window.test.mjs, plugins/pipeline-core/hooks/guard-devplan.mjs, plugins/pipeline-core/hooks/guard-devplan.test.mjs, plugins/pipeline-core/hooks/guard-push.mjs, plugins/pipeline-core/hooks/guard-push.test.mjs, plugins/pipeline-core/hooks/guard-git.mjs, plugins/pipeline-core/hooks/guard-git.test.mjs, pipeline.user.yaml, project/critical-human-proof.json, docs/push-release-flow.md, guardrails/git.md, roles/elephant.md

The instruction, verbatim, because paraphrasing it has already failed once:

> *"das es human gates gibt ist gut! und es ist wichtig das der human informiert
> ist und so freigeben kann per signatur das der agent es nicht fälscht weil er
> helfen will (ausser der PO geht aktiv auf 'chat' level) ABER DICKES ABER ==>
> einmal befehl kopieren, approve schreiben, pin eingeben!!!!!! egal ob design
> phase schließt, etwas übergangsweise aufgehoben wird, ob man pushed oder
> released. DAS IST EIN PO BEFEHL!!!!"*

and, immediately after:

> *"der human prüft und gibt FREI — er gibt damit sein okay und das muss
> brauchbare UX haben"*

and, closing the same exchange, the threat model the rest of it rests on:

> *"diese pipeline schützt vor AGENTEN die sachen missbrauchen, sie bemuttert
> nicht den HUMAN. wir gehen davon aus, dass der weiß was er tut und wenn der
> etwas kontrolliert hat, dann gibt er das einmalig frei und sonst fragt er.
> diese schleifen sind einfach nur hardcore ätzend und so will das keiner
> benutzen"*

## Context

The gates themselves are not in question and are not to be weakened. The PO's
position is explicit on both halves: human gates are *good*; the signature is
what stops a well-meaning agent from approving on the human's behalf; `chat`
mode is legitimate only where the PO has actively chosen it
([ADR-0056](0056-push-approval-mode.md)). What is in question is the *shape* of
the human's part.

That shape was measured end to end during the v0.5.3 release, on one candidate,
by an attended PO sitting next to the session. Publishing one already-verified
commit required, from the human:

1. a `po-approval-gate.mjs prepare-critical` invocation with eight flags,
   constructed by the agent and pasted by the human, whose validation failure
   names no field;
2. a separate `po-human-approval.mjs approve-critical` invocation, which signed
   the *stale* request left on disk by step 1's silent failure without noticing
   — the confirmation text looked entirely normal, and only the candidate hash
   inside it revealed the wrong subject;
3. the literal phrase `OVERRIDE GG-03`, an independent ritual with its own
   one-time token, on top of the signature already verified;
4. a further external decision — a GitHub repository ruleset forbidding merge
   commits on `main` — discovered only by the remote rejecting the push.

Earlier the same day, the same session had already spent a *separate* signature
on a guard maintenance window, and needed the release signature only because the
first signature's own follow-up work produced commits that invalidated it.

None of this is a failure of any individual layer. Each was designed carefully,
most are documented, and the composition is what the PO is ruling on. The
underlying finding has been open since the 0.5.2 release
(`backlog/items/2026-08-07-push-release-flow-unusable-for-third-party-adopters.md`),
has been restated by the PO three times with increasing sharpness, and each
restatement has so far produced documentation rather than a changed ceremony.
This ADR exists so the requirement stops being re-derived from chat history and
becomes something a design has to satisfy.

## Decision

**0. The adversary is the agent, not the human — and this governs every decision
below.** Gates exist because an agent that wants to be helpful will approve on
the human's behalf, sign what it was asked to verify, or route around a refusal
it believes is a false positive. They do not exist to protect the human from
their own decision. The operating assumption is that the human knows what they
are doing: once they have checked something, they release it **once**, and if
they have not checked it, they ask rather than being asked. Any mechanism that
re-confirms a decision the human has already made is not a safeguard — it is
mothering, it produces exactly the loops this ADR is ruling against, and it
buys nothing against the actual adversary, because an agent was never the one
being asked to confirm twice.

The practical test follows directly: for each step a gate imposes, name the
agent behaviour it prevents. A step that cannot name one is not load-bearing.
`OVERRIDE GG-03` after a verified, per-commit, per-destination Ed25519
signature for `kind: push` is the clearest current example — the signature
already proves the human decided; the phrase asks the human to decide again.
`GG-03` on its own, with no signature in play, does prevent an unattended agent
from overwriting `main`, and that is the form worth keeping.

**1. One ceremony, and it is exactly three human acts.** Copy one command, type
the approval word, enter the PIN/passphrase. Nothing else is asked of the human:
no second command, no separately-typed literal phrase, no manually assembled
flags, no hash pasted from one output into another input.

**2. The ceremony is invariant across gate kinds.** Closing a design phase,
lifting a guard temporarily, pushing, releasing — the human's part looks the
same every time. A gate may differ in *what* it authorizes and in how it is
recorded; it may not differ in what the human has to do. A new gate that
introduces its own ritual is, by this decision, incorrectly designed.

**3. Everything computable is the agent's part.** Digests, subject construction,
candidate binding, expiry, request preparation, proof consumption, ledger
entries, and the authorized action itself are agent work. The human contributes
review and consent, and nothing that a machine could have derived. Where a guard
today blocks the agent from a step whose own design intent says the agent may
perform it, the guard's scope is the defect — not the human's time.

**4. The command informs at the moment of approval.** *"Der human prüft und gibt
FREI"* — the review is part of the ceremony, not a preceding chat message the
human is expected to have read. What is being approved (action, candidate, scope,
expiry, and what the approval will and will not cover) is stated by the single
command's own output, immediately before the PIN is asked for. An approval the
human can only understand by having followed the session transcript is a blind
signature, which is separately filed
(`backlog/items/2026-08-07-human-approval-ux-directory-clarity-and-single-command.md`).

**5. What this explicitly does NOT relax.** The gate stays. The agent stays
cryptographically incapable of producing the proof in `signature` mode
([ADR-0055](0055-critical-human-proof-waiver.md)). `chat` mode remains available
only where the repository has genuinely configured it
([ADR-0056](0056-push-approval-mode.md)), and remains an attribution record
rather than proof. This ADR reduces the number of human *actions*, never the
strength of the human *decision*.

**6. The mechanism is not designed here, and the reason is deliberate.**
Collapsing prepare+sign into one command, deciding what a single approval
legitimately covers (one action, one candidate, or one bounded unit of work),
and folding `OVERRIDE <rule-id>` into the same ceremony are three coupled design
questions with real security consequences — in particular, the candidate binding
is what makes a proof meaningful, and any widening of scope has to answer what
replaces it. That design is tracked as requirement 7 of
`backlog/items/2026-08-07-push-release-flow-unusable-for-third-party-adopters.md`,
together with the two items that already carry its adjacent halves
(`backlog/items/2026-08-02-unified-human-authorization-ux.md` for one shape
across all intents, `backlog/items/2026-08-07-human-approval-ux-directory-clarity-and-single-command.md`
for what the command must show and how many commands there may be), and belongs
to a dispatched design round, not to a release session improvising under time
pressure.

## Consequences

**Positive.** Gate design gains two acceptance criteria that are testable rather
than aspirational. Count the human's actions: three is conformant, four is a
finding. And for each step, name the agent behaviour it prevents (Decision 0):
a step with no answer is removable. These are the first statements of the
requirement that a Critic can review a gate *against*, instead of reviewing each
gate only against its own internal consistency — which is exactly how five
individually-sound layers accumulated without anyone rejecting one.

**Negative, and immediate.** Every gate shipped today violates this ADR. The
push path violates it most (Decision 1 by four actions, Decision 2 by the
`OVERRIDE GG-03` ritual, Decision 4 by the unattributed validation error), the
maintenance window less, the design-phase close is unmeasured. Accepting this
ADR therefore creates a known non-conformance across shipped surface rather than
resolving one, and the gap stays open until Decision 6's design round runs.

**A constraint on that design round.** Decision 5 forbids the cheapest way to
satisfy Decisions 1–2 — defaulting the repository to `chat` mode. That is not a
fix; it is the removal of the property the PO named as the reason gates are good
in the first place.

## Alternatives considered

**Treat this as ergonomics and file it as a backlog item.** Already done, three
times, across two release sessions, and each time the requirement was restated
by the PO because the sessions in between read the backlog as a wish list. A
requirement that gate designs must satisfy is normative, and normative content
belongs in an ADR ([ADR-0060](0060-handover-placement-and-rotation.md),
Decision 3). The backlog item remains, as the tracker for the *design*, which is
its correct role.

**Design the mechanism here, in this ADR.** Rejected on the repository's own
rule: a guardrail- and security-class change is Critic-mandatory and belongs to
a dispatched round with a fresh reviewer, not to the session that is holding a
signed, expiring approval and wants to be finished.

**Cap the number of human actions at some agreed larger number.** Rejected
because it invites exactly the accretion that produced the current state: every
individual layer can always argue it is only one more. Three is the number the
PO named, and it has the property that any addition is visible.
