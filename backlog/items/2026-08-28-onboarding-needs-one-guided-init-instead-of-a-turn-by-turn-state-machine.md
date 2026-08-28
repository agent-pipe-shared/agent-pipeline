---
schema: pipeline.backlog-item.v1
id: pipeline.onboarding-needs-one-guided-init
type: requirement
owner: pipeline
status: open
created: 2026-08-28
sprint: nova
tracking: "NOW / Nova A — PO decision 2026-08-28: rebuild the flow, keep the binding core untouched; pulled forward because the happy path cannot go live without it"
source: "Greenfield happy-path test of candidate 0.6.0 across all three runners, 2026-08-28. Independent self-analyses: Claude/Windows (docs/pipeline-haertungstest-und-analyse.md), Agy/WSL (pipeline-analysis.md), Codex/WSL (docs/pipeline-session-analysis-2026-08-28.md), plus the PO's own cross-run observations."
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

**Not confirmed:**
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

Left `status: open`: the core orchestration mechanism this item asked for
exists and several sub-goals are done, but the item's own acceptance
criterion (a real fresh-repo measurement) is not met, and two sub-goals
(pre-push default, scanner bootstrap) are unconfirmed.
