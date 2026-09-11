# ADR-0082: Damaged continuity has one evidence-preserving self-repair

**Governs:** plugins/pipeline-core/lib/onboarding-continuity.mjs, plugins/pipeline-core/lib/project-onboarding-v3.mjs, plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs, plugins/pipeline-core/scripts/repair-map.mjs, plugins/pipeline-core/scripts/repair-map.schema.json

> Agent-Pipeline · Nova sprint (`sprint-nova-epic`) · 2026-09-12

**Status:** accepted (2026-09-12, PO requirement that an agent can leave the
legacy shared-close-evidence deadlock without a human editing State).

## Context

Older State files can contain two closed features whose `continuityClose`
records name the same close-evidence path with different digests. The current
file bytes can satisfy only one assertion. Continuity correctly fails closed,
but that verdict also blocks ordinary writes, including the State correction
needed to leave the deadlock. New closes already reject this collision; older
damaged repositories still need a bounded exit.

ADR-0010 requires machine-readable bootstrap recovery. ADR-0068's amendment
principle provides the precedent for preserving former assertions instead of
rewriting history. ADR-0070's local supervisor repair protocol provides the
precedent for bounded locking and honest readback; this decision does not move
portable Pipeline State into the supervisor's machine-local store.

## Decision

Continuity inspection emits a structured diagnosis for this legacy shape. It
names every claimant's exact RFC 6901 JSON pointer, feature, artifact kind, path,
expected digest, observed digest and match status.

The automatic repair is available only when exactly one close-evidence path is
shared, exactly one claimant matches the current bytes, and every unrelated
State field and artifact is valid. It preserves the matching claimant, removes
only the mismatching live `continuityClose` assertions, and appends an immutable
`pipeline.state-repair-record.v1` carrying their former bindings, the reason,
affected feature IDs, evidence observation, State preimage, plan digest and the
source State timestamp. `sourceUpdatedAt` describes the preimage's provenance;
it is not a claim about the repair's execution time. Read-only planning and
apply recomputation must produce the same timestamp and postimage without an
unbound clock value or another CLI authority field.

The repair plan binds the complete diagnosis, State preimage, evidence
observation and logical postimage. One observation of the shared path supplies
all claimant comparisons within a diagnosis. Apply reuses the existing State
lock, compare-and-swap check, exclusive temporary file, atomic rename, directory
sync and exact readback. It rechecks the complete binding under the lock both
before temporary-file preparation and immediately before replacement. It never
writes the evidence path. The plan digest's
self-reference in the appended record is canonicalized to 64 zeroes only for
digest calculation; the committed record carries the actual digest and exact
postimage readback remains mandatory.

The lifecycle guard admits only `apply-repair` with the repository root, a
64-character plan digest, `--activate`, and the already closed optional intent
field (plus the pre-existing all-or-none operator-authority form). Ambiguous,
missing, unsafe, unrelated-invalid, drifted, locked and failed-readback cases
remain typed refusals. The repair map names the read-only `plan-repair` route;
the agent may execute its returned apply action without a new human gate. The
general lifecycle override remains unavailable.

## Bounded threat model

| Attempt or failure | Required behavior |
| --- | --- |
| Zero or several matching claimants, or several shared paths | Refuse; never choose by feature age or array order. |
| Unrelated invalid State, Result, or close-evidence binding | Refuse before replacement; no broad repair or artifact rebinding. |
| Traversal, symlink, non-file, or missing evidence | Return typed evidence refusal; never follow an alternative path or create proof. |
| Altered plan, State, calibration, handover, history, or evidence | Reject the digest or full preimage check; preserve the existing State. |
| Foreign or malformed State lock | Return the existing typed lock refusal; no new bypass or retry loop. |
| Readback bytes differ, even if continuity independently validates | Return committed readback failure; never report ready or overwrite a later writer by rolling back. |
| Forged quarantine relationships | Resolve every pointer to the same unique live feature ID; require the preserved live assertion's exact path/digest and absent quarantined live assertions. Reject nonexistent or unrelated entries and any claimant ID or pointer reused across records. |
| Extra flags, foreign root/script, missing activation or digest | Keep the lifecycle guard's closed argument grammar. |

Earlier repair records remain byte-for-byte values in subsequent replacements.
Their live closed-feature entries remain the identity anchors. A proposed
repair that would reuse one of those entries is refused before State is
replaced; only repairs over disjoint claimant sets may append another record.
Their former assertions are historical evidence, never executable authority or
new live artifact bindings. This is an append-only writer contract, not a
claim that an attacker with arbitrary State write access cannot replace history.
The State lock serializes cooperating writers. It cannot lock external editors
of evidence; full rechecks and final readback detect observed drift, and a
failure after the atomic replacement reports `committed: true`.

## Rollback and final-candidate approval

Before the atomic State replacement, a refused or interrupted repair leaves
the preimage intact and removes only its own temporary file when ownership is
known. After replacement, a readback or durability failure reports
`committed: true`; it must not restore the old State over a later writer,
remove the audit record, reinstate mismatching assertions, or rewrite evidence.
Preserve the observed bytes and use a separately specified, authorized forward
correction if the committed result needs repair. This feature supplies no
automatic post-commit rollback command.

To withdraw the implementation, prepare a forward code revert of this repair
slice against the actual current candidate and run its required Verify,
Security and independent Critic checks. The revert must preserve existing
repair records and valid repaired States; withdrawing the planner/apply route
does not authorize deleting runtime history. Any remote publication of the
revert remains subject to the configured push authorization.

Detached threat-model approval binds the exact final candidate and its push
boundary. Prepare that approval only after implementation and correction are
frozen and the final candidate is known. This ADR, a review result, a draft
digest, or an implementation dispatch is not a provisional approval. Any
subsequent candidate change requires a fresh exact-candidate approval before
the corresponding push; no provisional approval is fabricated or reused.

## Consequences

A session can recover the known legacy collision without changing proof bytes
or weakening lifecycle readiness. Reviewers retain both the assertion that
still matches reality and an append-only account of every assertion removed
from the live validation surface.

The mechanism deliberately cannot choose among two matching claimants, restore
missing evidence, repair multiple collision groups, accept an unsafe path, or
fix unrelated State or artifact damage.

## Discarded alternatives

- Rewriting the evidence file would make one historical claim true by making
  another false and would destroy the only observed bytes.
- Deleting the older feature entry would erase unrelated closure history.
- Allowing arbitrary State edits while continuity is damaged would turn a
  narrow recovery into a lifecycle bypass.
- Asking a human to transcribe a one-off editor command would preserve the
  deadlock that prompted this decision.

## Follow-up

If another recoverable continuity corruption appears, it needs its own closed
diagnosis and threat-model review. It does not automatically widen this route.
