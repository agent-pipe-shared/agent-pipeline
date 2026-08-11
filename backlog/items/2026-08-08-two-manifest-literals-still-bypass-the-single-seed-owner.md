---
schema: pipeline.backlog-item.v1
id: pipeline.two-manifest-literals-bypass-the-single-seed-owner
type: defect
owner: pipeline
status: open
created: 2026-08-08
due: 2026-08-22
source: "Self-reported by the implementing dispatch of commit 7a99a18 and independently confirmed as finding F7 of the second Critic round on the 2026-08-08 hardening block."
---

# Two manifest literals still bypass the single seed owner

## What is true and what is not

Commit `7a99a18` made the fresh runtime seed resolve its manifest bytes from one
owner, `freshManifestBytes()`, instead of restating them. That closed a real
divergence which had already produced an authority-binding defect: the PO profile
receipt was bound to one tier's manifest while the gate validated the other's.

It closed that divergence on **one** of the branches that can seed a manifest.
Two literals remain in `runner-profile-migration-v3.mjs`:

- `LEGACY_CLASSIFIER_BASELINES[".claude/pipeline.yaml"]`
- `LEGACY_V3_RUNTIME_SEEDS[".claude/pipeline.yaml"]`

Neither carries a `gates` chapter. The implementing dispatch reported both and
declined to touch them, correctly: they serve legacy v0/v1/v2 migration and a
host-managed renderer baseline, and pointing them at `freshManifestBytes()` would
inject the fresh gate chapter into *existing* projects' manifests — changing what
those manifests mean, which was explicitly out of scope.

The review then established something the implementing dispatch did not: the
second dictionary is selected on the host-managed-Codex branch, which is computed
for `v3`/`v3-refresh` sources with a Codex runtime control mount. That is
reachable by a **fresh** project, not only by a legacy migration. So the class
this commit exists to close is still reachable, on a path nobody has measured.

## Why it is minor rather than urgent

`readProjectAuthority` prefers the neutral tier, so the effective manifest a
reader resolves is still the gated one. What remains is a latent inconsistency
between two files that are supposed to agree, on a branch where nobody has
checked whether they do — which is exactly the shape that produced the earlier
defect, one layer further out.

## Direction, not a design

1. **Measure the host-managed-Codex fresh-project path** the way the divergence
   was measured for the slim path: seed a real root on that branch and compare
   both tiers byte for byte. Until that exists, the size of this is unknown.
2. **Separate the two questions the single owner currently conflates.** "What does
   a *fresh* project get" and "what does an *existing* project's absent target get
   repaired to" are different, and one function answering both is what makes the
   remaining literals feel unsafe to remove. If they need to stay separate, say so
   and name why in the code, so the next reader does not try to unify them again.
3. **Assert the invariant rather than the instance.** A check that every seed
   dictionary able to write `.claude/pipeline.yaml` for a fresh project resolves it
   from one owner would catch the next branch too. The current check covers the one
   branch that was fixed.

## Related

- `2026-08-07-greenfield-onboarding-writes-mixed-authority-tiers.md` — the day-one
  legacy-tier question, which this item does not answer and must not pre-empt.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Accepted — measure the host-managed-Codex fresh-project
  path first (byte-for-byte compare of both seed dictionaries) before
  deciding fix scope, per the item's own Direction 1.
- **Rationale:** PO, 2026-08-12: "okay so machen." Cheap, bounded, no
  design call needed until the measurement result is known.
- **Assignment (if accepted):** queued for implementation this session.
- **Date:** 2026-08-12
