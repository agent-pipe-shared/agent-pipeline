---
schema: pipeline.backlog-item.v1
id: pipeline.kickoff-apply-action-drops-runner
type: defect
owner: pipeline
status: closed
created: 2026-08-08
due: 2026-08-15
closed_at: 2026-08-17
closure_repository: self
closure_commit: 5918d9d6b6d6b0ca72acd19a90cb2cfc6207728d
closure_evidence: backlog/items/2026-08-08-kickoff-apply-action-drops-the-runner-the-plan-was-made-for.md
source: "Happy-path test of the local 0.5.4 build in a fresh directory, 2026-08-08. Observed by the PO; located in the source afterwards."
---

# The runner does not survive the onboarding call chain

*Scope note: filed for the kickoff apply argv alone. A structured handover from the
same greenfield run then established a second, more serious mechanism and one
amplifier, so this item now covers the class. File name and id are unchanged
because the transition ledger references them.*

## Three mechanisms, not one bug

| # | Mechanism | Severity |
|---|---|---|
| A | The promotion entry points accept no runner at all and inspect as Codex | blocker, no workaround |
| B | The kickoff apply action's argv omits `--runner` | workaround exists |
| C | A failed attestation sits in the CLI's exit-0 list | amplifier for B |

## A — the promotion entry points never take a runner

`planProjectOnboardingKickoffPromotionV4` and
`applyProjectOnboardingKickoffPromotionV4`
(`plugins/pipeline-core/lib/project-onboarding-v3.mjs:3949` and `:3961`) have no
`runner` parameter at all, and call `v4Inspection(rootDir, fs, "onboarding")` with
no runner argument (`:3953`, `:3966`, `:3975`), so the inspection defaults to
`codex`. The CLI branches at `plugins/pipeline-core/scripts/project-onboarding-v3.mjs:133`
and `:137` do not forward `options.runner` either: the parser accepts the flag and
the branch discards it.

**Consequence: promotion is unreachable for every non-Codex runner.** A Claude
project is observed as Codex, reports `runtime-attestation-required`, and the
promotion aborts before reading anything. The provisional `specs/kickoff-*`
anchors then stay in place permanently and the real design package is never bound.
No flag reaches the parameter, so there is no workaround.

The contrast is the strongest evidence that this is an oversight rather than a
design. The kickoff entry points sixty lines above (`:3900`, `:3918`) do take
`runner`, and the comment introducing them (`:3894`) describes this exact failure
class in advance:

> a runner without a native runtime readback would be told it owes a Codex
> attestation and could never reach a kickoff at all

The guard was written for the kickoff pair and never applied to the promotion pair.

## C — the failure is reported as success

`plugins/pipeline-core/scripts/project-onboarding-v3.mjs:169` returns exit `0` for
a status list that includes `runtime-attestation-required`. So mechanism B yields a
mutating step that writes nothing, reports a non-ready status inside its JSON, and
exits `0`. A human reading the JSON sees the problem; a scripting caller sees
success.

This is what turns an inconvenient bug into a silent one, and it is worth fixing on
its own terms: `runtime-attestation-required` after an *apply* is a failed
transaction, whatever produced it.

## B — what was originally observed

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
6. **Take the exit code out of the success list.** `runtime-attestation-required`
   after an apply is a failed transaction. Whether the whole status list at
   `scripts/project-onboarding-v3.mjs:169` should be split per operation, rather
   than shared between plan-shaped and apply-shaped commands, is the question
   behind it — a status that is a legitimate resting point for `inspect` is not
   one for `apply`.
7. **Give A its own fix ahead of the rest.** Mechanism A blocks promotion outright
   and needs only the parameter that its sibling functions already have. It should
   not wait on the constructor and the enumerating test, which are the durable
   part but the slower one.

## Resolved 2026-08-08, and what the sweep left behind

Mechanisms A, B and C are closed in `94b8a72`, with the structural part the PO asked
for rather than three patches:

- `planBoundApplyAction()` is now the single construction site for these actions and
  takes `runner` as a required argument, throwing `APPLY-ACTION-RUNNER-REQUIRED` when
  it is absent — omission is a construction error, not a failure in someone's fresh
  project.
- `runner` participates in the plan binding, not only the argv, so a plan produced
  for one runner cannot validate an apply reconstructed for another. The digest
  mismatch refuses; nothing is silently substituted.
- An enumerating check discovers the plan builders from the module's own exports and
  asserts each resolved action carries the runner. It was demonstrated red by
  dropping the runner from one call site, not merely asserted to work.
- The exit-0 split reuses the same `APPLY_SHAPED_COMMANDS` set the `--activate`
  validity check already uses, so the two cannot drift apart.

**Direction 4's sweep returned a negative result for the kickoff/promotion argvs** —
no other plan-bound parameter is dropped — and one adjacent finding that is
deliberately still open:

`applyProjectOnboardingManifestRepairV4` has the identical no-runner-parameter shape
as mechanism A, for a different command. It was left alone because it is outside this
item's named scope, which is the right call for a dispatch and the wrong place to
leave the knowledge. It is the next instance of the class and belongs to
`2026-08-08-runner-neutrality-must-hold-before-a-third-runner-lands.md`.

Two further construction sites were examined and deliberately exempted, each with a
named reason rather than silence: the lifecycle-family `lifecycleArgv` site, whose
own documented design tolerates an absent runner, and the cleanup/recovery action
builders, which have no runner concept. The enumerating check names its exemption
explicitly, so a future reader sees a decision rather than a gap.

This item stays **open** until the manifest-repair instance is triaged.

## Triggering situation

Fresh directory, local `0.5.4+claude` build, Claude runner, first kickoff after a
successful runtime initialization. Not reproducible in this repository, which is
already past kickoff.

## Related

- `2026-08-08-the-harness-classifier-blocks-the-onboarding-action-the-pipeline-just-authorized.md`
  — same run; that item is about the second gate refusing the action, this one is
  about the action itself being incomplete.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** close — the item's own stated remaining blocker
  ("stays open until the manifest-repair instance is triaged") is now
  satisfied and more: `applyProjectOnboardingManifestRepairV4`
  (`project-onboarding-v3.mjs:2955-2965`) now takes `runner` and calls
  `requireRunner(runner, "applyProjectOnboardingManifestRepairV4")` at
  `:2962` — not merely triaged elsewhere, actually fixed, in the same
  commit/day as mechanisms A/B/C.
- **Rationale:** verified live via `git blame` on the exact lines —
  `requireRunner` was added by commit `5918d9d6b6d6b0ca72acd19a90cb2cfc6207728d`
  (2026-08-08), the same day as the item's own recorded `94b8a72` resolution.
- **Assignment (if accepted):** none — no further code change.
- **Date:** 2026-08-17

## Closure (2026-08-17)

All three original mechanisms (A/B/C) were already closed in `94b8a72`
(2026-08-08, recorded above). The one condition this item was deliberately
kept open for — the identical no-runner-parameter shape in
`applyProjectOnboardingManifestRepairV4` — is now also fixed, in commit
`5918d9d6b6d6b0ca72acd19a90cb2cfc6207728d` (same day). Closing.
