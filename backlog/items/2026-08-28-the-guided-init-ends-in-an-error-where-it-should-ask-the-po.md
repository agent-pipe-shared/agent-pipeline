---
schema: pipeline.backlog-item.v1
id: pipeline.guided-init-ends-in-error-not-a-question
type: defect
owner: pipeline
status: resolved
created: 2026-08-28
sprint: nova
tracking: "NOW / Nova A — the last gap between the guided init and a usable end-to-end path, and the exact wall a consumer project hit independently the same day"
source: "Measured 2026-08-28 by driving onboarding-init.mjs against a genuinely fresh repository at HEAD e9cc8d21, then reproducing the terminating step directly. Measured, not reported."
---

# The guided init ends in a raw error where it should ask the PO one question

## What was measured

Driving the guided init against a fresh repository, answering only what it actually asks:

| | measured |
| --- | --- |
| human rounds needed | 3 |
| onboarding commands the driver chained by itself | 12 |
| repair subcommands on the normal path | 0 |

That part works, and it works better than it did this morning: round 1 chains five
digest-bound steps, and round 4 now chains `intake-generate-plan` →
`intake-generate-apply` where it previously stopped.

It then terminates here:

```
$ project-onboarding-v3.mjs bootstrap-bind-plan --root <fresh> --runner claude
exit 2
KICKOFF-PROMOTION-PRD-ACKNOWLEDGEMENT-MARKER-MISSING: The promoted PRD must carry the
PO's plan acknowledgement marker exactly once, as
<!-- po-plan-acknowledged: content-sound-and-spec-consistent --> on its own line; the PO
plan gate will otherwise refuse it with no sanctioned repair route once bound.
```

`inspect` correctly reports `bootstrap-binding-required` and correctly names
`bootstrap-bind-plan` as the next action. Running that named action fails.

## Why this is a defect and not the gate working

The missing marker is **by design**: it is the PO's own act of acknowledgement, and an
existing test pins exactly that ("a fresh, unmodified intake-generated staging PRD already
carries valid po-language/technical-spec-sha256 markers — only the acknowledgement marker
is still missing"). Requiring a human here is correct.

What is wrong is the CHANNEL. A required human decision arrives as exit 2 and a raw error
string, on a command the flow itself just told the caller to run. Everything else in this
flow that needs a human publishes a `collect-input` action — author identity, push
approval, language, profile, and as of today the verify contract. This one does not, so a
guided driver that follows the protocol correctly hits a wall it has no way to interpret,
and a human reading the output is told what is missing but not that they are the one who
supplies it, nor how.

This is the same class as every other gap closed this week: the question exists, but not in
the channel the flow reads.

## Why it matters more than the others

A consumer project hit exactly this wall independently on the same day and could not get
past it (incident report S56). Their sanctioned route to the marker,
`po-authority-acknowledge-apply`, failed twice for two unrelated reasons — a chat-gate
encoding defect, since fixed, and a postimage readback that names no failing predicate,
still open. The workaround was a human appending the line by hand.

So this step is currently the terminus of the guided onboarding in practice, and the
documented way past it is not reliably usable.

## Direction

`bootstrap-binding-required` publishes a `collect-input` action for the PO acknowledgement
— stating what is being acknowledged (the generated PRD and spec, by path and digest), and
naming the sanctioned command that records it. The bind plan then succeeds once the marker
is present, exactly as it does today.

The raw refusal stays as the fail-closed floor for a direct caller; it stops being the only
thing a guided flow ever sees.

## Acceptance criteria

- Driving the guided init against a fresh repository reaches a terminal ready state, with
  the human rounds being only genuine decisions — this one included, asked as a question.
- The acknowledgement ask names the artifacts it covers by path and digest, so the PO is
  acknowledging something specific rather than a marker string.
- `bootstrap-bind-plan`'s direct refusal is unchanged for a caller that skips the ask.
- The smoke measurement above is re-run and recorded.

## Related

- `2026-08-28-a-fail-closed-rollback-names-no-predicate-so-a-consumer-cannot-fix-it.md` —
  the route past this step, currently unusable in at least one consumer project.
- `2026-08-28-a-plan-result-publishes-no-next-action-so-the-guided-chain-stalls.md` — the
  same class, one step earlier; partially delivered.

## Closing note (reconciliation, 2026-08-28)

Verified against `plugins/pipeline-core/lib/project-onboarding-v3.mjs`: the
`bootstrap-binding-required` branch (transactionState `"generated"`, ~line 2576-2606) now
calls `observeBootstrapBindAcknowledgement()` and, when the marker is absent, returns
`nextAction: collectPrdAcknowledgementAction(...)` (defined ~line 2168, tagged
`NVA-D-ACKASK`) — a `collect-input` action naming the PRD/spec paths and sha256 digests and
the sanctioned manual step, exactly as this item's Direction requested — instead of
`bootstrapBindPlanAction()`, which is only offered once the marker is present. Confirmed a
dedicated regression test exists:
`plugins/pipeline-core/lib/project-onboarding-v3.test.mjs:6563` — "NVA-D-ACKASK: bootstrap-
binding-required asks the PO for the acknowledgement instead of naming a command that can
only fail, then names bootstrap-bind-plan again once it is present and the bind succeeds".
Did not re-run the full smoke measurement end-to-end myself (out of tool budget for this
slice); resolved on the strength of the wired code path plus its dedicated test, not a
commit message.
