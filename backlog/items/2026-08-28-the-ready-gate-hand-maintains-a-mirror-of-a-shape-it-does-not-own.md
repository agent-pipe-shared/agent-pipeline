---
schema: pipeline.backlog-item.v1
id: pipeline.ready-gate-hand-maintained-shape-mirror
type: defect
owner: pipeline
status: closed
closed_at: 2026-08-29
closure_repository: self
closure_commit: 4fa77b40f67526c71680305ac987d20851f05186
closure_evidence: plugins/pipeline-core/lib/project-onboarding-ready-gate.test.mjs
created: 2026-08-28
sprint: nova
done_when: contains plugins/pipeline-core/lib/project-onboarding-ready-gate.mjs pipeline.ready-gate-keys-derived-from-producer
tracking: "NOW / Nova A — the second instance blocked every governed write in a ready project and was invisible until the candidate was actually installed. NVA-T-READYKEYS fixes that instance; this item is about the third one."
source: "Found live 2026-08-28 while the PO rsynced the candidate onto the local marketplace mid-session. The first instance is recorded in the file's own comment."
---

# The readiness gate hand-maintains a mirror of a shape it does not own, and has fallen behind twice

## What happens

`lib/project-onboarding-ready-gate.mjs` validates the observation it gets from
`inspectProjectOnboardingV3()` against two hardcoded lists it maintains itself:

- `RESULT_KEYS` — the exact key set the observation may carry, compared with
  `exactKeys()` (no extra, no missing).
- `PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES` — the statuses it accepts as a
  legitimate not-ready lifecycle.

Neither list is derived from the module that produces the shape. Both have now fallen
behind it.

**First instance**, recorded in the file's own comment at the status list: Wave 4 added
three v4Inspection statuses (`intake-required`, `intake-design-questions-required`,
`bootstrap-binding-required`) and the allowlist was not updated, so a repository genuinely
sitting at one of them "failed closed with the wrong typed error
(`PORG-INVALID-OBSERVATION` instead of `PORG-NOT-READY`)". Fixed by appending three
strings.

**Second instance**, found live today: `lib/project-onboarding-v3.mjs` attaches
`pushApprovalMode` and `trustAnchorAvailability` to the `ready` result and to no other
status — deliberately, per its own comment ("they only make sense once a repository is
fully ready ... so they are attached here, and only here"). `RESULT_KEYS` was not updated,
so `exactKeys()` fails **exactly when the project is ready** — the only case the gate can
otherwise pass. Every governed write in every ready project is refused.

## Why it stayed invisible

The installed marketplace copy was an older build. The defect surfaced the moment the
candidate source was actually installed — not in any test, not in Verify, not in review.
This is the "measured in our own checkout" shape recorded in
`2026-08-28-nothing-checks-that-a-shipped-capability-is-reachable.md`: the mechanism was
measured, the deployed path to it was not.

But the deeper reason no test caught it is worth stating exactly, because it decides what
the fix has to be. There are **three** copies of this shape, not two:

| where | keys on a ready result |
|---|---|
| `lib/project-onboarding-v3.mjs` — the producer | 13 |
| `RESULT_KEYS` in the gate | 11 |
| `readyResult()` in `project-onboarding-ready-gate.test.mjs` | 11 |

Every test in that file injects a stubbed `inspect` returning the test's own
`readyResult()`. So the test agrees with the gate, both disagree with the producer, and the
suite is green **precisely because it never asks the real producer what a ready result
looks like.** A fourth hand-written copy in a new test would reproduce this exactly; that
is why the direction below insists the enumeration be derived rather than typed.

## The refusal names the wrong cause

`hooks/guard-lifecycle-ready.mjs` branches specially on `PORG-NOT-READY` only.
`PORG-INVALID-OBSERVATION` falls through to a generic refusal reading "Pipeline-governed
project writes require an exact V4 ready result for session intent" — so an operator whose
project IS ready is told it is not, and diagnoses the wrong thing. Both instances of this
defect rendered identically, which is why the first one's comment describes the same
confusion. Third instance this sprint of a refusal naming no usable cause (see the
rollback-predicate and trust-anchor items).

## Direction

A third manual list update is not a fix; it only resets the clock. Options, in rough order
of strength:

1. Derive the accepted shape from the producer rather than restating it — the gate should
   ask `project-onboarding-v3.mjs` what a result of a given status looks like, so the two
   cannot drift.
2. Failing that, a test that drives a REAL `inspectProjectOnboardingV3()` result for every
   status through `requireProjectOnboardingReady()` and fails when a new key or status
   appears that the gate does not know. The enumeration must be derived from the producer,
   not typed into the test, or it becomes the third hand-maintained list.
3. Either way, `PORG-INVALID-OBSERVATION` must stop rendering as "not ready".

## Acceptance criteria

- Adding a field to a status-specific result in `project-onboarding-v3.mjs`, or a new
  lifecycle status, fails a check rather than silently blocking every governed write.
- The check derives its expectation from the producer; a reviewer can see that no second
  copy of the shape was introduced to satisfy it.
- A refusal caused by an unvalidatable observation says so, distinctly from a refusal
  caused by a not-ready lifecycle.
- Verified against an INSTALLED plugin deployment, not only in this checkout — the
  condition under which both instances hid.

## Related

- `2026-08-28-nothing-checks-that-a-shipped-capability-is-reachable.md` — the class; this
  is an instance measured from the repository's position and invisible from the consumer's.
- `2026-08-28-a-v1-trust-anchor-makes-the-signature-push-route-functionless.md` — two
  readers of one file disagreeing, same family.
- `2026-08-28-a-fail-closed-rollback-names-no-predicate-so-a-consumer-cannot-fix-it.md` —
  the refusal-names-no-cause half.

## Predicate note, 2026-08-29 — the instance is fixed, the pattern is not

A predicate of `contains … trustAnchorAvailability` was declared here and
immediately reported satisfied, which would have argued for closing this item.
It measured the wrong thing, and the commit that satisfies it says so itself.

`b317f139` ("fix(ready-gate): accept the two fields a ready observation
actually carries") added `pushApprovalMode` and `trustAnchorAvailability` to the
gate's accepted key set, fixing the live failure where every governed write in
every *ready* project was refused. Its own message then states, unprompted:

> This fixes the instance. The pattern — three hand-maintained mirrors of a
> shape this module does not own, and a test suite that is green because it
> never asks the real producer — remains open in [this item], whose acceptance
> criteria require the enumeration to be derived rather than typed again.

So the field's presence proves only that the mirror was hand-corrected once
more, which is precisely the behaviour this item exists to end. The next field
`project-onboarding-v3.mjs` attaches will break the gate the same way.

The predicate now names the actual remedy — the enumeration being derived from
its producer rather than typed — via a marker
`pipeline.ready-gate-keys-derived-from-producer`. It is deliberately not
satisfied today.

## Closure, 2026-08-29 (dispatch NVA-R19-READYGATE)

All four Acceptance criteria met, verified by the dispatcher directly:
`project-onboarding-ready-gate.test.mjs` 12/12, `guard-lifecycle-ready.test.mjs`
182/182, `project-onboarding-v3.test.mjs` 147/0, `check-consumer-safe-paths.test.mjs`
9/9.

- **Key set:** `PROJECT_ONBOARDING_BASE_RESULT_KEYS`/`READY_ONLY_RESULT_KEYS`
  now exported from `project-onboarding-v3.mjs` (the real producer) and
  imported by the gate — Direction option 1, as preferred.
- **Status set:** a genuine, documented obstacle blocks option 1 (a `status`
  shorthand bound to a computed ternary at one construction site, not a
  literal — full static derivation would need an AST pass or a ~40-site
  producer rewrite). Falls back to Direction option 2 exactly as specified:
  a new test drives a REAL, non-stubbed `inspectProjectOnboardingV3()`
  result through `requireProjectOnboardingReady()` and confirms an unknown
  status is rejected as `PORG-INVALID-OBSERVATION`, not silently passed.
  This is a disclosed hybrid resolution, not the literal example the item
  gave (an import cycle) — the underlying escape-hatch condition ("a
  genuine obstacle blocks option 1") is met and named in-code.
- **Third copy fixed too:** the test file's own `readyResult()`/
  `readyResultWithPushApprovalKeys()` stubs now derive field names from the
  same imported key lists and throw loudly on any unmapped key, closing the
  exact "green because it never asks the real producer" failure mode the
  item's analysis named.
- **Refusal-text distinction:** found ALREADY correctly wired — no code
  change was needed; `guard-lifecycle-ready.mjs` already names
  `PORG-INVALID-OBSERVATION` distinctly from `PORG-NOT-READY`, confirmed by
  an existing, still-passing test.
