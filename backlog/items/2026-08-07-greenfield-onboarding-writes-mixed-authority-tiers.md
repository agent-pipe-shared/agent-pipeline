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

- **Decision:** Stays OPEN, but the reported cause is refuted and the item needs
  re-grounding before anyone works it.
- **Rationale:** Commit `674b1c0` added a check that seeds a blank root and then
  asserts directly on the result: `project/pipeline.json` exists,
  `.claude/pipeline.json` does **not**, and `readProjectAuthority` resolves
  `source: "neutral"` with `calibration: "project/pipeline.json"`. It passes. The
  `.claude/*` keys in `freshBaselines` are logical names that the write path maps
  onto the neutral tier, which is why reading the seed function alone suggests the
  opposite of what the seed does — a trap worth naming, since it is what made this
  look like a tier-selection defect in the first place. A separate check pins that
  a project already carrying the legacy tier keeps resolving there unchanged.
  So a fresh project's *calibration* was already neutral-tier before this block,
  and is now pinned. The independent Critic round reached the same place from the
  other direction: no commit touches `lib/project-authority.mjs` or the
  tier-selection write path, because there was nothing there to fix.
  What the reporting session actually saw in `.claude/` is therefore still
  unidentified. `.claude/settings.json` is seeded and legitimately belongs to the
  runner rather than to the Pipeline's authority tiers, which makes it the first
  candidate — but that is a hypothesis, not an observation, and this item must not
  be closed on it.
- **Assignment (if accepted):** Re-ground first: enumerate every path a fresh
  greenfield onboarding leaves under `.claude/`, decide per path whether it is
  runner-owned or authority-owned, and rewrite the item's description against that
  list. Only then is there a defect to fix, or an item to close.
- **Date:** 2026-08-08
