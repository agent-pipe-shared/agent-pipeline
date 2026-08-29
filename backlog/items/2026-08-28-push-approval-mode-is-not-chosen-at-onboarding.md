---
schema: pipeline.backlog-item.v1
id: pipeline.push-approval-mode-is-not-chosen-at-onboarding
type: requirement
owner: pipeline
status: closed
created: 2026-08-28
closed_at: 2026-08-29
closure_repository: self
closure_commit: 5e4b4d76
closure_evidence: plugins/pipeline-core/scripts/onboarding-init.test.mjs
sprint: nova
done_when: contains plugins/pipeline-core/scripts/onboarding-init.mjs pendingAsks
tracking: "NOW / Nova A — happy-path blocking: the push approval is the last step of the path the PO named"
source: "Agy/WSL greenfield run, 2026-08-28, its own hardening self-analysis (pipeline-analysis.md), corroborated by the Codex/WSL run's independent script-indirection probe."
---

# The push-approval mode defaults to maximum friction without ever asking

## What happened

`gates.push_approval` seeds to `signature` (`machinePushApprovalPreference(fs) ??
"signature"`). Agy's report: this "plunges the user into a complex cryptographic
workflow requiring external Ed25519 keys, manual script executions, and
copy-pasting JSON request objects" — for a trivial greenfield project, never
having been asked whether that was wanted.

The PO's own observation is sharper and more worrying: **agents keep trying to
avoid the signature rather than request it.** Agy attempted to bypass it, and it
is unclear whether it genuinely switched to `chat` or only believed it had.

## Why the default itself is right

Failing closed to `signature` is correct — ADR-0056 makes anything unreadable or
unrecognised resolve to `signature`, and that must stay. A weaker default would
silently downgrade projects that need the strong mode.

The defect is that the choice is never *offered*. A default is not a decision,
and a human who was never asked cannot be said to have chosen maximum friction.

## Mechanism, measured 2026-08-28 — the ask exists, on a channel nothing reads

Re-checking "never offered" against the code before dispatching work on it found
something more useful than a confirmation:

- The ask is **built**. `collectPushApprovalPreferenceAction()` produces a
  `collect-input` action whose `input.name` is `pushApprovalPreference`, whose
  guidance names both `"signature"` and `"chat"`, pre-filled from a
  machine-scoped default and confirmed per repository. It even carries a PO
  key-directory hint. Tests assert all of it
  (`lib/project-onboarding-v3.test.mjs:2247-2276`).
- It is **never reachable through the documented chain.**
  `withPendingPushApprovalSetupAsk()` (`lib/project-onboarding-v3.mjs:4918`)
  attaches it as its own envelope field, `pushApprovalSetupAction`, and that is
  the only place it is ever set. It is never assigned to `nextAction`.

Compare `collectAuthorIdentityAction()`, which is used **both** ways: as
`nextAction` at line 4546 and as the side-channel field `authorIdentityAction` at
4903. The codebase carries two conventions at once, and only one of them is the
chain agents are told to follow.

That is why a runner reports never having been asked while the repository holds a
tested ask for exactly that question. It is present in the data and absent from
the flow.

**Consequence beyond this item.** Any guided driver that follows `nextAction` —
including the one being built under `pipeline.onboarding-needs-one-guided-init` —
skips every question published this way unless it also collects the side-channel
action fields. So the fix is not "add the ask": the ask exists. The fix is to put
it on the channel the flow reads, or to make the flow read every channel a
question can be published on — and whichever is chosen must cover
`authorIdentityAction` too, so the two conventions stop disagreeing.

## Direction

- Ask during init, as one of the small set of genuinely human questions, with the
  consequence of each mode stated in one line.
- Keep `signature` as the fail-closed default for anything unanswered or
  unreadable.
- Make the *active* mode visible in the bootstrap confirmation, so a runner that
  believes it switched modes can be contradicted by the record.

## Acceptance criteria

- Init asks once and records the answer.
- An unanswered or malformed value still resolves to `signature`.
- The active mode is printed at every bootstrap, so a mistaken belief about it is
  immediately falsifiable.

## Closing note (reconciliation, 2026-08-28) — partially resolved

Checked `plugins/pipeline-core/lib/project-onboarding-v3.mjs`. The library-side half of the
defect this item describes ("present in the data and absent from the flow") landed:
`withPendingAsksSurfacedOnNextAction()` (~line 5293) explicitly says "Closes backlog
2026-08-28-push-approval-mode-is-not-chosen-at-onboarding.md" and merges the pending
`pushApprovalSetupAction` (and the sibling author-identity/verify-contract/trust-anchor/
project-ignore-gap asks) onto `nextAction.pendingAsks`, wired into the inspect chain at
lines 5416/5418. A test at `project-onboarding-v3.test.mjs:2324-2325` confirms this merge
mechanism for the sibling verify-contract ask (`nextAction.pendingAsks` carries it); no test
found asserting `pushApprovalPreference` specifically appears in `nextAction.pendingAsks`
(only the older side-channel field is asserted, line 2250).

**Not landed:** `plugins/pipeline-core/scripts/onboarding-init.mjs`, the actual guided
driver named throughout this item, only branches on `nextAction.kind` (`"command"` /
`"collect-input"`, lines ~278-314) and never reads `nextAction.pendingAsks`. So when
`nextAction.kind === "command"` (the common case), any pending push-approval ask attached
as a sibling field is silently never surfaced to the human by this driver — the guided
init still does not, in practice, ask the push-approval question. This matches the item's
own "Consequence beyond this item" paragraph, which flagged this exact gap as a
prerequisite. Also did not verify "the active mode is printed at every bootstrap" (no
occurrence of `pushApproval`/`push_approval` found under a quick grep of
`onboarding-init.mjs`; not exhaustively checked against `session-bootstrap.md`/the
bootstrap confirmation line for time-budget reasons).

Left `status: open`: the library-level plumbing is done, but the acceptance criterion "init
asks once" is not met for a driver-run guided init, since the driver never reads
`pendingAsks`. Whoever picks this up next should wire `onboarding-init.mjs` to surface
`nextAction.pendingAsks` to the human (or promote push-approval to `nextAction` itself)
before closing this item.
