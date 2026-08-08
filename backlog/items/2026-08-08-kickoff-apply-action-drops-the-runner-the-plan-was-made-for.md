---
schema: pipeline.backlog-item.v1
id: pipeline.kickoff-apply-action-drops-runner
type: defect
owner: pipeline
status: open
created: 2026-08-08
due: 2026-08-15
source: "Happy-path test of the local 0.5.4 build in a fresh directory, 2026-08-08. Observed by the PO; located in the source afterwards."
---

# The kickoff apply action drops the runner its own plan was made for

## What happened

A Claude-onboarded project ran `kickoff plan --runner claude`. The plan came back
valid. The agent executed the `applyAction` the plan returned, verbatim and
digest-bound, as it is contractually required to do — and the apply failed
demanding a Codex runtime attestation.

The reason is visible in the returned argv: it carries `--root`, `--goal`,
`--plan-sha256` and `--activate`, and no `--runner`. The apply therefore resolved
the default runner, `codex`, for a plan that had been produced for `claude`.

The transaction stopped before its write, so the repository was left
`absent-pristine` rather than half-written. The agent re-ran the apply with an
explicit `--runner claude`, reached `status: ready`, and the digests matched the
plan exactly. Nothing was corrupted. The cost was a failed mutating step on a new
project's very first transaction, plus the reasoning to work out why.

## Where it is

- `plugins/pipeline-core/lib/onboarding-continuity.mjs:2983` — `applyAction()`
  builds the kickoff apply argv without `--runner`.
- `plugins/pipeline-core/lib/onboarding-continuity.mjs:3319` —
  `promotionApplyAction()` has the same shape and the same omission. The PO
  observed this second site independently, at the PRD binding, after reporting the
  first.

The runtime layer does not have this gap: the `initialize-runtime` action in the
same run carried `--runner claude --intent bootstrap` correctly. So this is a
per-action omission, not a missing convention.

## Why it is a defect and not an operator error

The contract of these plan/apply pairs is that the agent executes the returned
action **exactly**, and the plan digest exists to make any deviation detectable.
An action the caller must amend before it works inverts that contract: either the
agent obeys the contract and fails, or it edits a digest-bound action, which is
the behaviour the digest exists to prevent. The agent in this run did the second
thing and was right to, which is the uncomfortable part.

There is a second-order effect. The failure surfaces as a *Codex runtime
attestation* demand inside a Claude project. That is a misleading diagnosis: it
names a runtime capability rather than a dropped flag, and it points the operator
at Codex onboarding for a problem that has nothing to do with Codex.

## The PO's framing: this is the fourth round, so the fix must not be a fourth patch

The PO confirmed the same loss at the PRD binding — the promotion apply — and named
the pattern rather than the site: *"ist dann die 4. Runde Fixes damit Claude geht,
das muss nachhaltiger werden."*

That is the governing constraint on this item. Repairing two argv literals would
close the two sites a single happy-path run happened to exercise and would leave
the class intact, exactly as the three previous rounds did. What is missing is not
two flags; it is an invariant that a plan-bound action cannot be constructed
without the runner its plan was made under.

## Direction, not a design

1. **Carry the runner into the plan and out through the action.** The apply argv
   must name the runner the plan was produced under. Note that `applyAction`'s
   output is inside the plan digest (`onboarding-continuity.mjs:3130` compares the
   canonical JSON), so plan and validation move together by construction — but
   the runner must first become part of what the plan records.
2. **Make the omission unrepresentable, not merely absent.** Each of these actions
   is built by a hand-written argv array literal, so a new one starts from a copy
   of an old one and inherits whatever the old one forgot. A single constructor
   that takes the runner as a required argument turns the next omission into a
   construction error instead of a runtime failure in someone's fresh project.
3. **Enforce it with an enumerating test, not a review.** A check that walks every
   plan-producing entry point, resolves its returned action, and asserts the
   runner is present is the thing that survives the next contributor. Point 2
   without point 3 is a convention; the previous three rounds were also
   conventions.
4. **Then sweep the remaining plan/apply pairs once** — under that test, so the
   sweep produces a permanent result rather than a list. The open question the
   sweep answers is whether any returned action drops a *different* parameter its
   plan was bound to; the runner is the instance that was observed, not
   necessarily the only one.
5. **Make the wrong-runner failure name the cause.** A Claude-rooted project that
   fails a Codex attestation should say that the action resolved a different
   runner than the plan, not merely that an attestation is missing. This one is
   worth doing even after 1–4, because a future mismatch from any other source
   still surfaces here.

## Triggering situation

Fresh directory, local `0.5.4+claude` build, Claude runner, first kickoff after a
successful runtime initialization. Not reproducible in this repository, which is
already past kickoff.

## Related

- `2026-08-08-the-harness-classifier-blocks-the-onboarding-action-the-pipeline-just-authorized.md`
  — same run; that item is about the second gate refusing the action, this one is
  about the action itself being incomplete.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
