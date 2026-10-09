# Alfred restart checkpoint — shared fanout policy

The PO requested a short stopping point before restarting and resuming Codex.
This is a same-topic handover, not a block/feature close or a qualified candidate.
All six dispatched subagents have completed or stopped; no worker is running.
The checkout was clean at `daf810e40c9f62695da09dba8eeda170c117e82e`, tree
`75afd4514f258cf2727e902a3f8035cead84cd23`, before this documentation checkpoint.

Read this checkpoint, then the [WSL intake](handover-2026-10-09-wsl-intake.md)
and the corrected late-return sections of the
[interim wrap-up](handover-2026-10-09-interim-wrapup.md). Reuse Claude's landed
work and parked post-images rather than implementing them again.

## Latest PO instructions

- Important evidence must survive Git transfer; do not leave gate-cited evidence
  ignored or only in scratch.
- Replace fixed Critic/recovery slot reservations with a shared pool. Available
  places can be used for implementation, review or recovery as needed. Apply
  this centrally and durably to new **and existing consumer/user repositories**,
  including their update/migration route, rather than a session-only exception.
- Keep clear write ownership and dependencies; apply dependent slices and Git
  commits sequentially in the shared checkout. Independent work can fan out.
  Review independence and required review gates remain in force.
- Raise Codex concurrency to 10. The global user config was updated to
  `agents.max_concurrent_threads_per_session = 10` under `[agents]`.
  Original content was preserved and a private sibling backup was saved.
  Exact readback passed, and `codex features list` loaded it successfully on
  `codex-cli 0.162.0`. `codex --strict-config features list` is unsupported;
  it was not a successful strict-schema check.
  Current official documentation defines this number as spawned agents,
  excluding the primary thread. The previous live host still supplied four
  total slots; inspect the new session's actual host limit after restart.
  Do not claim ten slots are available merely because the config says ten.

Official reference:
[Codex agent configuration](https://learn.chatgpt.com/docs/agent-configuration/subagents).
No plugin cache, hook or project calibration was changed by this config update.
The scratch helper `scratch/set-codex-agent-limit.mjs` already applied the change;
do not run it again (it deliberately refuses a duplicate limit).

## Ready continuity and completed work

Feature `sprint-alfred-epic`, phase `implementation`, approved PRD/Spec unchanged;
continuity revision 32, queue `greenfield-0.7-remediation` /
`complete-and-integrate-approved-slices`, next action `dispatch`, dispatch null.
Do not resurrect the obsolete REV5C authoring pointer or reopen approved design.
The paused goal remains completing 0.7.0 and preparing a local test candidate;
no push, tag or release is authorized.

- `e02641365`: durable WSL intake and sanctioned continuity resume.
- `10e146f03`: Goldfish M1 evidence durability; four original approval-bound files
  tracked at their recorded paths with `-text`, exact bytes preserved.
- `daf810e40`: honest M1 delivery/provenance checkpoint and fresh-checkout proof.
  M1's 14 bounded checks and real checkout with `core.autocrlf=true` passed.
  Eleven existing stored-signature S1–S11 tests passed. Do not duplicate F2b.
  Independent review and qualified native provenance remain pending: the native
  host produced no authorship record, so the Coordinator committed the returned
  worker diff with `Commit-Act: orchestrator`. The delivery checkpoint is not v4.

## Shared-capacity change: investigated, not implemented

The three latest investigations made no source changes. Findings are pointers,
not claims that the new policy has shipped:

| Surface | Existing fixed behavior |
| --- | --- |
| `docs/adr/0048-local-goldfish-supervisor.md:87` | Subtracts control reservations and one recovery place. Preserve history; prepare a superseding/amending decision and its bound sidecar. |
| `docs/local-supervisor-state-threat-model.md:23` | Repeats reservation control. |
| `plugins/pipeline-core/lib/local-worker-pool.mjs:70` | Minimum known capacity minus Elephant/Verify/Critic reservations. |
| `plugins/pipeline-core/lib/local-worker-supervisor.mjs:202` and `:582` | Requires recovery reserve 1–16 and subtracts it from admission. |
| `plugins/pipeline-core/scripts/local-worker-supervisor.schema.json:231` | Same recovery minimum. |
| `plugins/pipeline-core/lib/continuity-state.mjs:332` | Requires exactly one Critic and one recovery place. |
| `plugins/pipeline-core/scripts/continuity-state.schema.json:287` | Both values have enum `[1]`. |
| `plugins/pipeline-core/lib/review-economy.mjs:730` | Requires reserved Critic/recovery booleans and distinct free places. |
| `plugins/pipeline-core/lib/workflow-writer-preflight.mjs:441` | Checks fixed recovery value. |
| `plugins/pipeline-core/lib/onboarding-continuity.mjs:1199`, `:1301`, `:4552` | Seeds both reservations as one. |
| `plugins/pipeline-core/scripts/pipeline-state.mjs:10158` | Seeds both as one; this writer is protected (`PB-SANCTIONED-WRITER`). |
| `plugins/pipeline-core/scripts/execution-plane-launch.mjs:180`, `:297` | Reference launch comments/request retain recovery minimum/one. |

`fanout-governor.mjs` itself has no idle Critic/recovery reservation. Its defaults
are target 4, ceiling 6, constrained load 4, other load 6, WSL test cap 2,
simultaneous tier caps Critic 1/deep 2. The fanout design says a Critic uses an
ordinary slot. Preserve actual host/known-bound checks, live occupancy, pressure
and test limits, ownership, wave admission and serial fallback. Distinguish
simultaneous workload limits from idle slots kept permanently unavailable.
Do not blindly subtract or ignore running Coordinator/review/recovery occupancy.

Next: prepare the explicit shared-pool contract and consumer compatibility/migration
plan, then bounded test-only RED slices followed by their implementation slices.
Useful existing test surfaces: `local-worker-pool.test.mjs`,
`local-worker-supervisor.test.mjs`, `continuity-state.test.mjs`,
`review-economy.test.mjs`, `workflow-writer-preflight.test.mjs`,
`onboarding-continuity.test.mjs`. Keep the protected sanctioned-writer delta in
the governed signing tranche if direct admission requires it. Do not silently
rewrite signed PRD/Spec or hand-edit every user's State file.

The fresh selector returned `MODEL-ROLE-SELECT-LEGACY-V3`, `gpt-6-sol/medium`
for `profile.epic.execution_phase`. Resolve again before a fresh dispatch; do
not substitute the parent model by inheritance. Installed ruleset pin:
`81eacf8e8813bbad6dc5916faa88dbaba9c1f3a0611d3e39ce9997a1ef9a551d`.
Existing full-template packet/generator: `scratch/alfred-m1-briefing.md` and
`scratch/prepare-m1-briefing.mjs`; they are M1-specific, not reusable authority
without a newly closed briefing and current candidate binding.

## Bootstrap refusal remains explicit

The policy investigator's Goldfish preflight returned ready. Automatic approval
review rejected preflight execution in the consumer/default and inventory slices
because their explicitly read-only scopes did not authorize the helper's possible
scratch/worktree cleanup or descriptor binding. Both stopped; no indirect retry
or onboarding occurred, and their runtime readiness was not verified.

Reading the installed implementation confirmed that even `--role goldfish`
runs housekeeping after observation. Scratch cleanup is descriptor-bound to
verified-dead sessions; worktree cleanup checks ownership, Git registration and
pipeline-owned paths. No sanctioned cleanup-free CLI entry was established.
Resolve the rejected action openly on re-entry: prove the proposed effects are
within authorization and permitted by review, or obtain the necessary concrete
approval. Do not disguise execution through an imported helper, invent session
identity or run Goldfish onboarding. Optional model-role bootstrap unavailability
remains non-gating; it does not create a new PO gate.

## Candidate inventory and remaining delivery

At `daf810e40`, 169 Alfred items are still open (24 Batman/Nightwing open items
excluded). The board's historical classes match current slugs: 56 landed,
10 implementation-complete, 68 in flight, 21 open, 3 host-check, 1 deferred,
10 unverified. Thus 66 are potential acceptance/review close-out candidates,
not 66 new fixes or 66 items immediately eligible for closure. No item was
closed in these investigations. Check each acceptance and required host evidence.

Remaining independent blocks include the transferred-checkout final approval
reader (`architecture-design.mjs`, not the already-fixed stored-signature path),
MECH-HAIKU compatibility, ONB/WSL walks, Windows hardening/WIN-AP-S5/KL-REBASE,
parked GREP-PUSH and Critic-checkpoint post-images, trust-anchor refusal/setup,
ADR-0085 retirement, E2E, map refresh/adoption and final Verify/Security/reviews.
Use the living PO list: adoption for 0.7.0 is selected, pending its prepared
signature; empty signature trust anchors must refuse with setup guidance;
native Windows Codex sandbox work is explicitly deferred upstream. Do not re-ask
these choices. General durable `.log`/`.jsonl` ignore exceptions remain unapplied.

This pause does not certify completion, release readiness, review or PO acceptance.
