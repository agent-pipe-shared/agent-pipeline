---
schema: pipeline.backlog-item.v1
id: pipeline.a-damaged-continuity-locks-the-session-out-of-the-repair-it-needs
type: requirement
owner: pipeline
status: open
created: 2026-09-06
source: "PO ruling 2026-09-06: sessions still block themselves too often and the repair is still too complicated — an agent has to be able to get out of it alone. Reported from a consumer project driven through a different runner, where two closed features shared one evidence path; the PO explicitly framed it as generic, not as that project's problem."
sprint: nova-b
done_when: manual
---

# A damaged continuity locks the session out of the repair it needs

## Description

A session reached a state it could not leave. Two closed features in the
project state recorded the SAME evidence path with different content digests.
Closing the second feature overwrote that file, so the first feature's
recorded digest no longer matched the bytes on disk. Continuity validation
classified the state as damaged, `guard-lifecycle-ready.mjs` refused every
write and every git command, and the repair map correctly reported that
`GUARD-LIFECYCLE-NOT-READY` admits no in-session override by construction.

The work itself was finished and verified: a full suite green, an independent
review passed with no findings. Only the closing commit was impossible. The
way out was a human running two commands in a terminal, one of them a
hand-written Node one-liner editing the state file.

The PO's requirement is one sentence: an agent has to be able to get out of
this alone.

## Why the current shape produces this

Three separate properties combine, and each is individually defensible:

1. **Nothing prevents two closed features from claiming one evidence path.**
   The second close overwrites the first's proof without anything noticing
   that a digest recorded elsewhere in the same file is now false.
2. **The damage is only detected later, by a validator that gates everything.**
   Continuity validation runs on the way in, and its verdict disables writes
   wholesale rather than the specific operation that would be unsafe.
3. **The repair is itself a write.** Fixing the state file, or restoring the
   evidence file, is exactly what the guard now refuses. That is the deadlock:
   the only actions that could clear the condition are in the set the
   condition forbids.

None of the three is wrong on its own. Together they produce a state whose
only exit is outside the session.

## What "an agent gets out alone" has to mean here

Not a weaker guard, and not an in-session override of a fail-closed
admission gate — the reasons that gate admits no override are good ones and
this item does not ask for them to be relaxed.

What it asks for is that the deadlock stop being reachable, and that where it
is still reachable, the exit be a sanctioned, narrow, self-describing action
rather than a human transcribing a one-liner. Three levels, cheapest first:

**Prevention.** A close that would record an evidence path already claimed by
another closed feature is refused at close time, with the collision named. A
path is a bad key for a per-feature artifact; the close writer knows both
features and can see the clash before it destroys anything. This alone would
have prevented the incident.

**Diagnosis.** When continuity is damaged, the refusal already knows which
entry failed and why (a digest mismatch on a named path). That fact should
reach the agent as a typed, machine-readable diagnosis, not as a generic
not-ready code that sends it to the repair map to rediscover the cause.

**A sanctioned repair path.** The same shape the scratch directory already
uses against this guard: a narrowly-scoped write that stays admitted while
the session is otherwise locked. Restricted to the state file and the
evidence directory, refusing anything else, and leaving its own record of
what it changed and why. The precedent exists — `guard-lifecycle-ready.mjs`
already admits `scratch/` writes at lifecycle statuses where every other
write is refused, precisely so a blocked session is not left with nothing it
can do.

## Affected artifact

- `plugins/pipeline-core/lib/onboarding-continuity.mjs` —
  `validClosedFeatureEntry` and the damaged-continuity verdict.
- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` — the admission
  gate, and the existing scratch exemption that shows the shape a repair
  exemption would take.
- `plugins/pipeline-core/scripts/pipeline-state.mjs` — the close writer, where
  the collision check belongs.
- `plugins/pipeline-core/scripts/repair-map.mjs` — today it correctly reports
  that no lift exists; with a sanctioned repair path it would name one.

## Proposal

Take prevention first, because it is small, mechanical, and removes the whole
class: refuse a close whose evidence path is already claimed by another closed
feature, and say which feature holds it. Then the diagnosis improvement, which
is a message change rather than a behaviour change. The sanctioned repair path
is the largest piece and should be designed against the scratch exemption's
own precedent rather than invented fresh — and it needs its own threat model,
since a repair route into the state file is exactly the kind of surface an
agent must not be able to widen.

Worth stating plainly for whoever picks this up: this is the second time a
fail-closed gate has produced a state whose only exit was a human at a
terminal. The pattern to watch for is a validator whose verdict disables the
actions that would clear the verdict.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
