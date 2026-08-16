---
schema: pipeline.backlog-item.v1
id: pipeline.lifecycle-guard-omits-the-partial-authority-repair-it-prescribes
type: defect
owner: pipeline
status: open
created: 2026-08-16
source: "Reported by the PO on 2026-08-16 from a consumer project running the 0.5.5 local candidate installed from the Windows local marketplace root. That session followed the bootstrap ritual, was told by the tooling to run the repair, and had it refused by the guard."
---

# The lifecycle guard omits `plan-partial-authority`, the repair its own tooling prescribes

## What a consumer project hit

A project whose onboarding inspection returns `partial` is told by
`project-onboarding-v3.mjs` to run `plan-partial-authority`. The lifecycle
guard refuses that command, because it is not in the allowlist — so the
session cannot complete a V4 bootstrap, and every subsequent write attempt
meets the same refusal again. Reading and research continue; writing does not.

## Measured in this repository

`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs:1351` admits exactly
seven subcommands:

    "plan", "plan-runtime", "plan-reinstall", "plan-repair",
    "plan-readback", "plan-source-recovery", "plan-manifest-repair"

`plan-partial-authority` is absent from that list while existing as a real
subcommand in both `plugins/pipeline-core/lib/project-onboarding-v3.mjs` and
`plugins/pipeline-core/scripts/project-onboarding-v3.mjs`. Nothing about the
omission looks deliberate: every sibling `plan*` command is admitted, and the
guard's own comment block at `:1362` describes the branch as closing exactly
this defect class for the apply half.

## Why it is worth its own item

Two filed items describe the same shape and neither covers this instance:
`2026-08-08-the-guard-refuses-the-recovery-the-inspection-prescribes.md` is the
general pattern, and
`2026-08-09-guard-lifecycle-ready-runner-allowlist-incomplete.md` is the same
allowlist missing a different entry. That the identical omission has now
recurred on a third command argues the allowlist should be derived from the
CLI's own subcommand table rather than hand-maintained beside it — which is
the fix worth considering, not a third one-line addition.

## Direction, not a design

Two candidates, not a commitment:

1. Add the missing entry. Smallest possible change, and the third time this
   exact repair has been applied to this exact list.
2. Derive the admitted set from the onboarding CLI's own registered
   subcommands, so a new read-only `plan*` command cannot be introduced
   without the guard learning about it. Larger, and it needs care: the guard
   must not silently admit a future WRITING subcommand that happens to share
   the prefix, so the derivation has to key on a declared read-only property
   rather than on the name.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted — direction 1 only (add the missing allowlist entry). Direction 2 (derive the admitted set from the CLI's own subcommand table) is a larger design change with a stated correctness hazard (must key on a declared read-only property, not name/prefix) and is left open for a dedicated design-phase pass, not bundled into this fix.
- **Rationale:** smallest possible change, third recurrence of the identical repair pattern (2026-08-08, 2026-08-09), guardrail-class code so it goes through goldfish-deep + worktree isolation + mandatory Design-tier Critic escalation (MP-07) rather than a same-session edit.
- **Assignment (if accepted):** Nova A AFK-session closeout, folded into the next local 0.5.5 candidate.
- **Date:** 2026-08-16
