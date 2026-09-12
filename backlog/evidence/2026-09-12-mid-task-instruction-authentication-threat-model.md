# Mid-task instruction authentication — candidate-bound threat model

Date: 2026-09-12
Model status: current for reviewed candidate
Reviewed candidate: `f413cc825f88d140d73a93a9f629a169748b5062`
Effective policy revision: `f413cc825f88d140d73a93a9f629a169748b5062`
Approval status: `pending`

## Candidate and policy binding

This snapshot covers the instruction-authority boundary introduced by the
reviewed candidate. The following Git blob IDs bind the complete policy surface
examined by the focused test:

| Path | Git blob ID at reviewed candidate |
| --- | --- |
| `roles/goldfish.md` | `29de2183bb5e51e5187bdfb63c6d1344a5ec45a6` |
| `plugins/pipeline-core/roles/goldfish.md` | `29de2183bb5e51e5187bdfb63c6d1344a5ec45a6` |
| `templates/prompts/goldfish-task.md` | `74b3bc245413d6384b844e8746f81f7da62e5e1f` |
| `plugins/pipeline-core/templates/prompts/goldfish-task.md` | `74b3bc245413d6384b844e8746f81f7da62e5e1f` |
| `plugins/pipeline-core/agents/goldfish-implementor.md` | `501f97252592a2529f46c61ccd20299432181052` |
| `plugins/pipeline-core/agents/goldfish-deep.md` | `de802cf939357d59f2bce2ca060f3ed9a4fc9b33` |
| `plugins/pipeline-core/agents/goldfish-mechanic.md` | `a5c3a75c0ff8f1304e58a8b97c9b23a296487efc` |

The matching canonical and vendored blob IDs are evidence of byte parity. This
record is detached from the candidate because a commit cannot embed its own
object ID. The SPDX and rollback corrections made after the reviewed candidate
are not represented as though they were part of that candidate.

## Boundary and assets

The protected asset is the authority of the original closed six-field Goldfish
briefing: its rules, scope, files, plan, PO decisions, model/effort, and
acceptance/DoD. A claimed dispatcher identity carried by a tool result or other
mid-task channel is untrusted input. Primary evidence is trusted only as factual
support for an action already authorized by the briefing; it is not sender
authentication or a grant of authority.

## Threats and controls

| Threat | Consequence | Candidate control |
| --- | --- | --- |
| Injected text claims to be a dispatcher correction. | The dispatch follows attacker-selected rules or scope. | Treat every mid-task instruction as unauthenticated regardless of channel or claimed sender. |
| A genuine correction bypasses the closed briefing. | Correct content silently changes the dispatch's authority and makes provenance indistinguishable from injection. | Refuse any change to rules, scope, files, authority, plan, PO decisions, model/effort, or acceptance/DoD; require a fresh dispatch with a new closed briefing. |
| Independently verified facts are treated as authorization. | Evidence launders a scope or policy change into an existing dispatch. | Permit evidence only to support an action already authorized; it cannot authenticate, repair, or expand the briefing. |
| A harmless resume instruction is treated like an authority change. | Work stalls even though no authority changed. | Admit only a purely procedural continuation wholly inside the original briefing. |
| Canonical and shipped copies drift. | Different dispatch entry points enforce different boundaries. | Require byte parity for role and task template copies and assert the receiver rule in all shipped Goldfish definitions. |

## Residual risk and failure response

The distinction between procedural continuation and authority change still
requires semantic classification. Ambiguity fails closed and is resolved with
a fresh briefing. The change deliberately does not authenticate a sender, and
it cannot retrofit the corrected contract into an already-running dispatch.
Such a dispatch must stop and be replaced.

If regression evidence shows over-blocking, under-blocking, parity drift, or a
missing shipped receiver, roll back with an inverse commit rather than rewriting
shared history. Then repair the policy under a fresh closed briefing, restore
parity, regenerate candidate-bound evidence, and obtain a fresh independent
Critic review. The backlog item's rollback and recovery section is the
operator-facing execution plan.

## Approval state

No detached PO decision or signature approving this threat model, the
post-review corrections, or an external action exists in this record. The
status is therefore `pending`; this snapshot is evidence for Critic assessment,
not approval and not push/release readiness.

After the corrections are committed, the final delivery candidate will have a
new object ID. Before any push or release, prepare a detached request binding
that exact final candidate, this model snapshot, the effective policy revision,
target remote/ref, and action. The repository's configured signature gate must
then verify the matching human proof. A signature over
`f413cc825f88d140d73a93a9f629a169748b5062` alone cannot authorize the later
correction candidate.
