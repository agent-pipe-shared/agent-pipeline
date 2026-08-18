---
schema: pipeline.backlog-item.v1
id: pipeline.greenfield-onboarding-writes-mixed-authority-tiers
type: defect
owner: pipeline
status: open
created: 2026-08-07
due: 2026-08-21
source: "PO, live greenfield onboarding of an empty repository with the Claude runner, 2026-08-07: 'da liegen trotz frischem repo wieder dateien auf die sich die pipeline bezieht im .claude ordner und nicht in .arbetheon'."
---

# A brand-new repository is onboarded into the legacy authority tier, not the neutral one

## Description

`plugins/pipeline-core/lib/project-authority.mjs` is explicit about the two
tiers: `project/*` is the runner-neutral authority, and `.claude/*` is a
**legacy compatibility input** that exists only until a repository has been
migrated (`LEGACY_MANIFEST = ".claude/pipeline.yaml"`, `LEGACY_CALIBRATION =
".claude/pipeline.json"`, and the module header states legacy "remains a
compatibility input until the neutral `project/` authority has been committed
and read back").

A repository created from nothing on 2026-08-07 nevertheless ended up reading
its **manifest** from `.claude/pipeline.yaml` while its **calibration** came
from `project/pipeline.json` — reported in the session's own confirmation table:

| Fact | Source it named |
|---|---|
| Profile / model routing | `.claude/pipeline.yaml` |
| Calibration | `project/pipeline.json` |

There is no legacy history in a repository that did not exist an hour earlier.
Nothing should have been written into a compatibility tier that exists purely to
migrate away from.

## Why this matters beyond tidiness

The authority resolver has a dedicated **`mixed`** status for exactly this shape
and refuses to treat it as ready in several branches ("neutral authority has no
neutral State while legacy lifecycle State remains", and the sibling checks for
calibration, guard config and guard audit). Onboarding that produces a mixed
layout by construction means every new project starts one step away from a state
the resolver is designed to reject, and the migration machinery
(`migrate-legacy` / `adopt-existing-neutral`) exists to fix a situation that
should never have been created.

It also silently changes which file a reader trusts. A project whose model
routing lives in the legacy tier and whose calibration lives in the neutral tier
has two authorities, and which one wins is a function of resolver precedence
rather than of anyone's decision.

## Triggering situation

Greenfield onboarding of `rune_test1_claude_052_28` with the Claude runner
against the local `0.5.3+claude.20260807221336.14e7b97` build, 2026-08-07.

**Not independently reproduced in this repository** — this item records the
PO's live observation and the code facts that make it a defect rather than a
preference. First step for whoever picks it up: onboard an empty directory and
list what lands where, before designing anything.

## Affected artifact

The onboarding write path in `plugins/pipeline-core/lib/project-onboarding-v3.mjs`
and whatever it uses to choose a destination tier, against
`plugins/pipeline-core/lib/project-authority.mjs`'s tier definitions and
[ADR-0054](../../docs/adr/0054-arbitheon-authority-directory-and-precedence-chain.md).

## Proposal

Not designed here. The questions to answer first, in order:

1. **Which component picks the tier during onboarding, and does it pick at all?**
   A hardcoded legacy path would be one defect; a resolver that reports `legacy`
   because the neutral tier is not yet populated, and a writer that then follows
   that report, would be a different and more interesting one.
2. **A repository with no history must be created neutral.** Whatever the cause,
   the outcome for a greenfield project is not in question: nothing belongs in
   `.claude/` on day one.
3. **Check whether the mixed state is even legal to reach.** If onboarding can
   produce a layout that `authority()` classifies as `mixed`, the writer and the
   reader disagree about what is valid, and a check that fails closed on that
   disagreement is worth more than fixing this one path.

Related: [ADR-0054](../../docs/adr/0054-arbitheon-authority-directory-and-precedence-chain.md)'s
own open follow-up already notes that steps 2–4 (third tier + configurable name,
writes to the top tier, completeness-gated cleanup) are unbuilt, and that the
lower tiers may not be deleted until the completeness check is green. This item
is evidence that the *entry* path needs settling before that cleanup can mean
anything.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Stays OPEN. The report is substantiated in part and the correction
  is deliberately NOT made inside the 0.5.4 hardening block — it returns here.
- **Rationale:** The two artifacts behave differently and an earlier triage on this
  item wrongly generalised from one to the other. Measured on a real fresh
  onboarding plus runtime initialisation:
  - `project/pipeline.json` is written and `.claude/pipeline.json` is **not**. A
    check seeds a blank root and asserts exactly that, plus that
    `readProjectAuthority` resolves `source: "neutral"`.
  - `.claude/pipeline.yaml` **is** written on day one, alongside
    `project/pipeline.yaml`. Both tiers carry a manifest in a repository with no
    history — which is what this item reports.

  A second trap is worth naming because it produced the wrong generalisation: the
  `.claude/*` keys in `freshBaselines` are logical names that the calibration write
  path maps onto the neutral tier, so reading that function alone suggests the
  opposite of what it does for `pipeline.json` — while `pipeline.yaml` really does
  land in both.

  Commit `7a99a18` made the two manifests byte-identical and added a check
  asserting that `.claude/pipeline.yaml` exists and matches. That closes a real
  divergence which had already caused one authority-binding defect, and it is the
  right fix for *that* problem — but it also makes the legacy-tier write a guarded
  invariant. A later change that stops writing it on day one now has a green check
  standing in its way. That consequence was not decided; it fell out.
- **Assignment (if accepted):** Two steps, in order. First enumerate every path a
  fresh greenfield onboarding leaves under `.claude/`, and decide per path whether
  it is runner-owned (legitimate) or authority-owned (the defect). Then decide
  whether day-one legacy-tier manifests should exist at all, and if not, retire the
  invariant added in `7a99a18` deliberately rather than by deleting a check that
  currently protects something real.
- **Date:** 2026-08-08

> **Note for dispatchers.** Do not hand this file to a Critic as a spec reference
> while this section states a conclusion about a commit under review: a verdict
> inside an admissible reference is contamination, and it reached one Critic that
> way on 2026-08-08. Reference the sections above the Triage, or the item at a
> pre-triage revision.

### Dispatch confirmation, 2026-08-18

**Decision:** Confirmed queued for dispatch, current scope, not deferred to
any named future sprint — the "Assignment (if accepted)" two-step plan
already recorded above (2026-08-08) stands unchanged: (1) enumerate every
path a fresh greenfield onboarding leaves under `.claude/`, deciding per
path whether it is runner-owned or authority-owned; (2) decide whether
day-one legacy-tier manifests should exist at all, and if not, retire the
`7a99a18` invariant deliberately. Touches the onboarding write path
(`project-onboarding-v3.mjs`) and an existing guarded invariant — real
implementation plus a test run required, not attempted in this read-only
triage pass.
- **Date:** 2026-08-18
