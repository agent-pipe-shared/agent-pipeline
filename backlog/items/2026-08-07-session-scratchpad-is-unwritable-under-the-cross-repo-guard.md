---
schema: pipeline.backlog-item.v1
id: pipeline.session-scratchpad-is-unwritable-under-the-cross-repo-guard
type: defect
owner: pipeline
status: open
created: 2026-08-07
source: "PO, 2026-08-07, on watching the guard refuse a scratchpad write: 'eigentlich solltest du auf tmp zugriff haben'. The Critic-contract half of the finding was observed independently the same day."
due: 2026-09-06
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

**A third instance, and a different casualty (2026-08-08).** The same refusal
also blocks the agent's own **cross-session memory store**, which lives outside
the project root by design. The PO asked, with visible irritation and fairly,
that a machine-local path be remembered rather than re-established every session;
the write was refused as `GUARD-CROSS-REPO-MUTATION`, so it could not be.

This is worse than the scratchpad case in one specific way. A missing scratchpad
degrades a single dispatch and the dispatch says so. A missing memory store
degrades **every future session silently** — nothing reports that a fact was
supposed to be retained and was not, and the cost lands on the human as a
repeated question. It also cannot be worked around the way the scratchpad can:
dispatches now park working files under `.git/`, but a memory store deliberately
sits outside the repository so that it survives the repository, and relocating it
inside would defeat its purpose.

Two further observations from that instance, both relevant to whichever option is
chosen: the refusal has no carve-out for a path the runtime itself designates as
the session's own store, and it does not distinguish a *write to another
repository* (the risk the rule exists for) from a *write to agent-private state
that belongs to no repository at all*.

**Half of this item is already being solved elsewhere, and the split matters
(PO, 2026-08-08).** Nova is building a **repository-internal, gitignored
scratchpad** that becomes the standard location for anything transitional —
inside the repository's own directory structure, so nothing can mutate outward.
That is the right answer to the scratchpad case and supersedes the `.git/`
convention dispatches have been improvising; when it lands, the Critic-contract
clause this item opens with is satisfiable again.

**It does not address the memory case, and cannot.** A repo-internal store is
by construction scoped to the repository, while a cross-session memory store
exists precisely to outlive it: it holds facts about the *human and the machine*
— which key directory this repository's anchor pins, how the PO prefers commands
delivered — that are not properties of the checkout and would be lost with it.
Relocating memory inside the repository would also publish machine-local paths
into tracked content, which this repository's own language and secrets rules
forbid.

So the two halves need different answers, and closing this item on the
scratchpad fix alone would silently drop the one whose cost is invisible.

**Explicitly out of scope, so it cannot be misread later (PO, 2026-08-08): the
signing key stays outside the repository, unconditionally.** Two different things
live outside the project root here — the PO's Ed25519 key material and the
agent's memory store — and only the second is under discussion. Nothing in this
item proposes moving key material inward, and no repair of it may have that
effect: the private key living outside the repository is the property the whole
signature gate rests on ([ADR-0056](../../docs/adr/0056-push-approval-mode.md)).

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
2. **Keep the guard and put the scratch space inside the repository instead —
   created at setup, briefed to agents, outside git, with cleanup rules.**
   Proposed by the PO on 2026-08-07. This is the strongest candidate on
   inspection, because most of it already half-exists and was never wired up:

   - `scratch/` is **already** in `.gitignore` (alongside `evidence/`), so the
     "outside git" half is done.
   - `templates/pipeline.yaml.example:58` already carries `scratch/` as a
     commented-out example entry in a cleanup allowlist — the intended shape
     was sketched and never activated.
   - The cleanup machinery the PO's proposal needs is **built and in use**:
     `plugins/pipeline-core/lib/session-cleanup-recovery.mjs` implements
     session-scoped descriptors, per-session cleanup manifests, allowlisted
     descriptor-bound deletion, orphan retirement with a write-ahead journal
     and lock, and PO-confirmed rebinding. It was written for worktrees; a
     scratch directory is the same lifecycle problem with a simpler target.

   What is genuinely missing is small by comparison: nothing *creates* the
   directory during setup/onboarding, nothing *briefs* it as the working
   location (the agent-facing text still points at the host temp path), and no
   cleanup descriptor binds it.

   Two questions a design has to answer rather than assume:

   - **Per-dispatch subdirectories.** `roles/critic.md:53` requires per-dispatch
     isolation, not merely a writable directory. `scratch/<dispatch-id>/` gives
     that, but the naming has to be collision-free across parallel dispatches
     sharing one checkout — the same failure that produced the shared-index
     collision recorded in
     `2026-08-07-push-release-flow-unusable-for-third-party-adopters.md`.
   - **Contamination, honestly.** This puts a contractually isolated reviewer's
     uncommitted fixtures inside the tree it is reviewing. Gitignored is not the
     same as invisible: the Critic reads the working tree. The isolation clause
     would need rewriting to say what is actually true, not silently
     reinterpreted — and `git status` cleanliness checks, Verify's candidate
     binding, and the security scan all need to agree that `scratch/` is
     out of scope, or the scratch directory starts breaking gates.

   Cleanup rules the PO named as a requirement, and the shape they most likely
   take given the existing machinery: bind a scratch descriptor at session
   start, delete only descriptor-bound allowlisted paths at close, retire
   orphans from crashed sessions on a later bootstrap rather than broadly
   clearing the directory, and never delete anything a descriptor does not
   claim.
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
