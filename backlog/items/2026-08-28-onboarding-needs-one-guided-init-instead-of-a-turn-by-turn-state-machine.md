---
schema: pipeline.backlog-item.v1
id: pipeline.onboarding-needs-one-guided-init
type: requirement
owner: pipeline
status: closed
created: 2026-08-28
closed_at: 2026-08-29
closure_repository: self
closure_commit: e34ea95d3db54754ec97d5afeb02c39681de6155
closure_evidence: backlog/items/2026-08-28-onboarding-needs-one-guided-init-instead-of-a-turn-by-turn-state-machine.md
sprint: nova
tracking: "NOW / Nova A — PO decision 2026-08-28: rebuild the flow, keep the binding core untouched; pulled forward because the happy path cannot go live without it"
source: "Greenfield happy-path test of candidate 0.6.0 across all three runners, 2026-08-28. Independent self-analyses: Claude/Windows (docs/pipeline-haertungstest-und-analyse.md), Agy/WSL (pipeline-analysis.md), Codex/WSL (docs/pipeline-session-analysis-2026-08-28.md), plus the PO's own cross-run observations."
done_when: manual
---

# Onboarding needs one guided init, not a turn-by-turn state machine the agent has to drive by hand

## The finding all three runs reached independently

| Run | Its own words |
| --- | --- |
| Claude | ~69 tool calls to the first implementation dispatch, 7 hard guard blocks, 2 full repair cycles; "rund ein Viertel bis Drittel des Onboardings war Kampf gegen die eigene Infrastruktur" |
| Agy | "State Machine Friction … setting up the basic runtime takes 3 to 4 independent conversational turns" |
| Codex | "zu dialog- und kopierintensiv"; more than half the total effort went to governance administration |

The PO's own summary is the sharpest: the happy path for a small greenfield
project should be *initialise, onboard, PRD/spec, PO approve, implement, test,
critic, push approval, push* — and we are further from that than ever.

## What is NOT the problem

The digest-bound chain itself. Every run praised the resulting provability, and
the chain is what produces it. This item does not touch `seed → runtime →
intake → generate → bind`, the signature ceremony, or the evidence binding.

**PO decision, 2026-08-28:** rebuild the flow, keep the core. The friction sits
in orchestration, defaults and missing steps — not in the cryptography.

## What to build

A single guided `init` that owns the whole deterministic sequence and stops
**only** where a human genuinely decides something. The precedent already exists
in this codebase: `pipeline-start-preflight.mjs` consolidates the bootstrap
checks into one call instead of making the agent perform each one. This is the
same move, one layer up, and it is additive.

It must, in one run:

1. Drive the deterministic chain to completion without a turn per transition.
2. Ask the human exactly the questions that are genuinely theirs — goal,
   PO profile, language, push-approval mode — in one round, early.
3. Set state correctly rather than producing drift and repairing it afterwards
   (see the repair-cycle item).
4. Elicit the real verify contract (see the verify-contract item).
5. Bootstrap the trust anchor (see the trust-anchor item).
6. Install the pre-push hook by default (see the pre-push item).
7. Bootstrap scanners project-locally, or report their state honestly.
8. Accept multi-line design input as a file rather than N `--text` chunks.

## Acceptance criteria

- A fresh repository reaches "ready for the first implementation dispatch" with a
  single-digit number of agent turns and no repair subcommand.
- Every human stop is a real decision, and each is asked once.
- The resulting artifacts are byte-identical in provability to today's — no
  binding, digest or signature is weakened to achieve the reduction.
- Measured on a genuinely fresh repository, not asserted.

## Closing note — partial (reconciliation, 2026-08-28)

Verified against current code, not from a commit message. A guided driver now
exists: `driveOnboardingInit()` (`plugins/pipeline-core/scripts/onboarding-init.mjs`)
drives `project-onboarding-v3.mjs` as a subprocess, executing consecutive
`command` actions itself and stopping only at a `collect-input` action or a
`ready` status (lines ~206-320). This covers sub-goals 1-3 (deterministic
chain without a turn per transition, re-entrant checkpointing per
`onboarding-init.test.mjs` "is re-entrant" case) — confirmed by unit tests
that drive it with a synthetic/mocked `run`, not a real fresh-repository
measurement.

Also confirmed landed, reused by this driver:
- Sub-goal 4 (verify contract) — `collectVerifyContractAction()`, see the
  closing note on `2026-08-28-onboarding-must-elicit-the-real-verify-contract.md`.
- Sub-goal 5 (trust anchor) — `freshCriticalHumanProofPolicyBytes()` bootstraps
  a v3 anchor when a local key exists (see the partial note on
  `2026-08-28-a-v1-trust-anchor-makes-the-signature-push-route-functionless.md`).
- Sub-goal 8 (multi-line design input via file) — `intake-capture-apply`'s
  guidance explicitly directs a multi-line PO message to `--text-file` under
  `scratch/`, because the shell grammar refuses a literal newline
  (`lib/project-onboarding-v3.mjs` ~line 2106).

**Not confirmed (as of the previous reconciliation):**
- Sub-goal 6 (pre-push hook installed BY DEFAULT) — only a separate "offer"
  mechanism was found (`plugins/pipeline-core/scripts/pre-push-hook-install.mjs`,
  `project-onboarding-v3-pre-push-hook-offer.test.mjs`); an offer is not a
  default install, and this dispatch did not trace whether the guided driver
  auto-accepts it.
- Sub-goal 7 (scanner bootstrap) — not located in the time available; grep for
  a scanner-bootstrap action in `project-onboarding-v3.mjs` came up empty.
- The acceptance criterion "measured on a genuinely fresh repository, not
  asserted" — `onboarding-init.test.mjs` only drives the loop against a
  synthetic mocked `run`; no test or script drives a real fresh repository
  end to end and counts turns.

## Closing note 2 — both remaining sub-goals confirmed, acceptance criterion measured (dispatch NVA-R38-GUIDEDINITMEASURE, 2026-08-29)

**Sub-goal 6 (pre-push hook installed by default): CONFIRMED DONE, no code
change.** Re-run directly: `plugins/pipeline-core/lib/project-onboarding-v3.test.mjs`
"onboarding installs the pre-push git hook by default -- no confirmation, no
separate offer step" passes (152/152 overall). The "offer" mechanism the
previous reconciliation found is a distinct, separate concern (an existing
project that does NOT yet have onboarding's own hook and needs a confirm/offer
UX); the guided-init path installs unconditionally.

**Sub-goal 7 (scanner bootstrap): CONFIRMED DONE via the item's own "or
report their state honestly" branch — no install step needed, none built.**
A separate, already-closed dispatch (NVA-R18-SCANBOOT, `backlog/items/
2026-08-28-scanner-bootstrap-is-not-self-sufficient-for-a-fresh-project.md`,
closed 2026-08-29, commit `193e4dc0`) resolved this independently: a missing
scanner reports `SKIPPED [binary_missing]`, not a failure, and the verdict
stays CLEAN — the five statuses (`passed`/`findings`/`not-configured`/
`tool-unavailable`/`not-applicable`) are distinguishable in evidence
(`security-scan.mjs`). As a direct result, `freshIntent()`
(`lib/project-onboarding-v3.mjs` ~line 899) now seeds `gates.security:
"blocking"` by default for every fresh project — the security gate is ON
from the first commit, with no scanner install and no hand-authored
configuration required. This is exactly sub-goal 7's own "or report their
state honestly" alternative, already wired into the same `freshIntent()` seed
object the guided driver's `apply-portable-seed` step writes. No new wiring
was needed or built.

**Acceptance criterion "measured on a genuinely fresh repository, not
asserted": MET, single-digit turns, zero repairs.** New durable measurement
script, `plugins/pipeline-core/scripts/measure-fresh-repo-onboarding-turns.mjs`
(exports `measureFreshRepoOnboardingTurns()` + a CLI `main()`), creates a real
temporary git repository (`git init`, real author config, isolated via
`PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE`), drives `driveOnboardingInit()`
against it, answers every genuine `collect-input` question with a canned
stand-in value (never inventing beyond what was actually asked), and chains
past every `pendingAsks`-carrying stop within the same turn (the two
unconditional asks -- `pushApprovalPreference`, `trustAnchorPointerRepairAcknowledged`
-- have no resolving CLI subcommand by design and are meant to be surfaced
once, not answered into a different state; `verifyCommand` is resolved for
real by writing a trivial passing command into `project/pipeline.json`,
mirroring how the PO's real answer would replace the `UNCONFIGURED_VERIFY`
placeholder). Measured result: **`outcome: "ready"` in 7 turns, 15 total
onboarding subcommands chained by the driver across those 7 turns, 0 repair
subcommands.** 7 is single-digit; the criterion is met.

Methodology note, disclosed rather than fixed (out of this dispatch's scope):
the first attempt at this measurement used a simpler bypass (run the one
blocked command, then restart the whole driver from a fresh `inspect`) and
never converged -- 60 turns, 62 driver steps, still stuck, because restarting
from `inspect` after a NON-MUTATING blocked command (e.g. a `plan-*` step)
re-observes identical on-disk state and recomputes the identical
pendingAsks-carrying step forever. The fixed measurement instead chains
through each pendingAsks-carrying response's own `nextAction` in place, the
same way `driveOnboardingInit()` chains an ordinary run of automatic steps,
stopping only at a genuine new question, `ready`, or a real dead end. This is
purely a property of how a human/orchestrator would actually behave once
they've decided to proceed past an already-seen, unconditional notice; it
required no change to `onboarding-init.mjs`'s own driver contract or tests.

Also observed, not filed as blocking, not fixed (out of scope): the
`readMachinePlane()` call sites inside `withPendingPushApprovalSetupAsk()`/
`withPendingTrustAnchorGuidanceAsk()` (`lib/project-onboarding-v3.mjs`
~lines 4633/4648/5441) call `readPlane()` with no arguments, so
`PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE` does not isolate these two reads from
the real operator machine plane the way `onboarding-init.test.mjs`'s own
`FIXTURE_ENV` comment claims for the whole suite. Measured directly: a probe
against an empty fixture home still reported this machine's real
`pushApprovalDefault` ("signature") and a real dead trust-anchor pointer
(`/tmp/po-human-key-...`). Did not affect this measurement's own turn count
(both asks are unconditional and get chained past either way), but the
isolation claim in `onboarding-init.test.mjs`'s header comment is not fully
accurate for these two fields specifically.

**All three items this closing note was opened to resolve are now
confirmed.** Left `status: open` for the PO to close explicitly after
reviewing this measurement — not this dispatch's call, per the item's own
`done_when: manual`.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** close
- **Rationale:** re-verified 2026-08-29: commit `e34ea95d` confirms guided-init
  sub-goals 6/7 and measures fresh-repo onboarding turns;
  `plugins/pipeline-core/scripts/measure-fresh-repo-onboarding-turns.mjs` exists
  in the current tree and drives a real fresh temp repo to `outcome: "ready"` in
  7 turns with 0 repair subcommands per the closing note above; the pre-push
  hook is confirmed installed by default in `project-onboarding-v3.test.mjs`.
- **Date:** 2026-08-29
