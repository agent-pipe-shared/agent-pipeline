---
schema: pipeline.backlog-item.v1
id: pipeline.session-scratchpad-is-unwritable-under-the-cross-repo-guard
type: defect
owner: pipeline
status: open
created: 2026-08-07
source: "PO, 2026-08-07, on watching the guard refuse a scratchpad write: 'eigentlich solltest du auf tmp zugriff haben'. The Critic-contract half of the finding was observed independently the same day."
---

# The session scratchpad is unwritable under `GUARD-CROSS-REPO-MUTATION`, which makes a mandatory clause of the Critic contract impossible to satisfy

## Description

Every session is assigned a scratchpad directory outside the repository (under
the host temp root) and is told to use it for all temporary files. Every write
to it is refused:

`isProjectWritePath()` (`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs:334`)
is a pure containment check — `pathInside(root, requested)`, plus a realpath
walk so a symlink cannot smuggle a target back out. There is no scratchpad
concept in it: not an allowlist, not a config key, not an exception. Anything
outside the project root is `GUARD-CROSS-REPO-MUTATION`
(`guard-lifecycle-ready.mjs:1102`), and per
[ADR-0059](../../docs/adr/0059-signed-human-guard-override.md) Decision 5 that
code is one of the deliberately **unliftable** exclusions — so there is not even
a signed way out. It is `isLiftableRuleId`-negative by construction.

For the orchestrator this is friction: temporary scripts, probes and held notes
have to go into the gitignored `evidence/` directory inside the repository
instead, which works but puts throwaway material inside the versioned tree.

For the **Critic it is a contract contradiction**, and that is the part that
matters. `roles/critic.md:53` does not merely permit a scratchpad, it requires
one:

> **Scratchpad isolation (evidence-contamination guard, CR-03 extension):** each
> Critic dispatch works in a FRESH scratchpad subdirectory (per-dispatch
> isolation) to prevent cross-dispatch contamination — before building any
> evidence (fixtures, repros, baselines), create your own fresh subdirectory
> (e.g. `mkdir <scratchpad>/<codename>`) and work ONLY there

The same clause is reproduced verbatim in
`templates/prompts/critic-review.md`, so every dispatch built from the template
carries it. The guard refuses the `mkdir` it names. The consequence is not
cosmetic: a Critic that cannot create a fixture, a repro, or a baseline can only
review **by reading**. Reproduction — the strongest evidence a reviewer can
produce, and the thing that separates a finding from a suspicion — is
unavailable to the role whose entire contract is evidence-gated reporting
(`Phase B`: "It survives ONLY with concrete evidence").

Two properties make this worse than an ordinary block:

1. **It is silent in the direction of weaker review.** The Critic still produces
   a well-formed, evidence-citing report; it simply cites only what can be read.
   Nothing in the output marks the missing capability unless the Critic
   volunteers it as a disclosure item.
2. **Two of the repo's own normative artifacts contradict each other**, and
   neither knows it. The guard is right about what it protects; the Critic
   contract is right about what it needs. Nobody reconciled them.

## Triggering situation

Observed twice on 2026-08-07 in one session. A dispatched Critic reported that
its `mkdir` inside the assigned scratchpad was refused by
`GUARD-CROSS-REPO-MUTATION` and that it "proceeded read-only for the rest of the
review without a scratchpad". Independently, the orchestrator's own attempt to
park held material in the same directory was refused identically, which is what
prompted the PO's remark.

## Affected artifact

`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` —
`isProjectWritePath()` (`:334`) and its call site (`:1102`), read together with
`roles/critic.md:53`, `templates/prompts/critic-review.md` (scratchpad-isolation
block), and [ADR-0059](../../docs/adr/0059-signed-human-guard-override.md)
Decision 5, which keeps this code unliftable.

## Proposal

Not designed here — this is guardrail-class code with an explicit unliftable
status, and the whole point of that status is that it is not adjusted in
passing. Candidates for a deliberate decision, explicitly not a commitment:

1. **Admit exactly one externally-supplied path.** The runtime already knows the
   session scratchpad; treat it as a second write root alongside the project
   root, resolved once at guard start and realpath-checked the same way. Narrow
   and matched to the actual need. The question a decision has to answer is what
   supplies that path and whether an agent can influence it — if it can, the
   exception is the hole, since a writable path the agent names is exactly what
   the guard exists to refuse.
2. **Keep the guard and fix the contract instead.** Move Critic scratch space
   inside the project root under a gitignored, per-dispatch directory. Cheapest
   and needs no guard change, but it puts uncommitted fixtures from a
   contractually isolated reviewer inside the tree under review, which is the
   contamination the isolation clause exists to prevent. Would need the
   isolation clause rewritten to say so, not silently reinterpreted.
3. **Accept the restriction and make it honest.** Change `roles/critic.md` and
   the template from "create a fresh subdirectory" to a stated capability
   limit, and require every report to disclose that no reproduction was possible.
   This closes the contradiction without closing the gap: reviews stay
   read-only, but stop pretending otherwise. Strictly worse than 1 or 2 on
   review quality; strictly better than the status quo on honesty.
4. Whichever is chosen, the second half is the same: ADR-0059's exclusion list
   currently reads as though `GUARD-CROSS-REPO-MUTATION` protects only *other
   repositories*. It also blocks the host temp root, and that consequence is
   nowhere stated in the ADR. Record it there whether or not the behaviour
   changes.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
