---
schema: pipeline.backlog-item.v1
id: pipeline.two-manifest-literals-bypass-the-single-seed-owner
type: defect
owner: pipeline
status: closed
created: 2026-08-08
due: 2026-08-22
closed_at: 2026-08-19
closure_repository: self
closure_commit: 77aef463aa4a80d1ad153f901873630747ee21f0
closure_evidence: backlog/items/2026-08-08-two-manifest-literals-still-bypass-the-single-seed-owner.md
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

### Measurement result (NVA-BL-67, 2026-08-12)

Reproduced the host-managed-Codex fresh-project branch with a real
filesystem root (genuine read-only empty `.codex/` directory). The literal
byte divergence between `LEGACY_V3_RUNTIME_SEEDS[".claude/pipeline.yaml"]`
and `freshManifestBytes()` is real and confirmed (the legacy seed carries
no `gates:` chapter at all, ~900 bytes shorter) — but it is **inert on
this branch**: `planRunnerProfileMigrationV3()` filters every `.claude/*`
path out of the final target list whenever `hostManagedCodex` is true, so
`.claude/pipeline.yaml` is never written to disk with the divergent
content, or with any content, on this specific path. `readProjectAuthority`
prefers the neutral tier seeded correctly elsewhere, which is why this was
already masked in practice.

**Disposition:** the specific divergence this item was measuring is
measured-and-safe for the fresh-project host-managed-Codex branch. Left
`status: open` rather than closed, because the item's own Directions 2 and
3 (separating "fresh project" vs. "existing project repair" semantics;
asserting the invariant structurally rather than per-instance) are
unresolved design questions this measurement does not answer, and a
separate, unconfirmed finding surfaced during the same investigation (see
`2026-08-12-host-managed-codex-apply-may-fail-its-own-target-boundary-invariant.md`)
that should be resolved or ruled out before this item is fully closed.
- **Date:** 2026-08-12

### Design/Implementation, 2026-08-18 (wave 2, dispatch NVA-W2-5)

Checked the named sibling finding
(`2026-08-12-host-managed-codex-apply-may-fail-its-own-target-boundary-invariant.md`)
first, per this item's own dependency note: unresolved and out of scope
for this dispatch — does not block Direction 3, which is independent of
it (Direction 3 is about the seed dictionaries, not the target-boundary
invariant).

**Direction 3 (assert the invariant structurally) implemented for the
`.claude/pipeline.yaml` key**, the one both remaining literals name:
`runner-profile-migration-v3.mjs` gained `resolveLegacyRuntimeSeed()`, a
single function both the `legacy` (v0/v1/v2 first-materialization) and
`hostManagedCodex` branches of `runtimeBaselines()` now call instead of
indexing `LEGACY_V3_RUNTIME_SEEDS[".claude/pipeline.yaml"]` directly; for
that one key it resolves through `freshManifestBytes()` (the same single
owner `slimRuntimeSeed()` already uses), for every other key it still
returns the literal dictionary entry unchanged.

This closes the actually-reachable gap: the `legacy` branch (a v0/v1/v2
source with no prior `.claude/pipeline.yaml`, an intentionally supported
"cold" first materialization) was NOT covered by the 2026-08-12
measurement above — that measurement covered only the `hostManagedCodex`
branch, on which the write is filtered out before reaching disk. On the
`legacy` branch nothing filters the write, so the old gates-less literal
did reach disk for any legacy project materializing `.claude/pipeline.yaml`
for the first time. The `hostManagedCodex` call site is also routed
through the same function for structural consistency (Direction 3's own
"one dictionary, one owner" ask), even though that branch's write is
still filtered and therefore inert either way.

Direction 2 (separating fresh-vs-repair manifest semantics) remains
open — not attempted, genuinely a separate design question this fix does
not resolve.

New regression test
(`runner-profile-migration-v3.test.mjs`, "legacy first materialization of
an absent .claude/pipeline.yaml resolves gates from the single
fresh-manifest owner") drives all three legacy source kinds (v0/v1/v2)
through a fixture with `.claude/pipeline.yaml` omitted and asserts the
written manifest's `dev-plan` gate chapter matches
`freshManifestBytes()`'s own. Full suite re-run:
`runner-profile-migration-v3.test.mjs` — 44/44 pass (43 pre-existing + 1
new). No guard/protected-file boundary reached; no TP-3/TP-4 stop.
Status left `open` (Direction 2 still unresolved; no Closure section
added per DoD).
- **Date:** 2026-08-18

### Documentation, 2026-08-19 (wave 5, dispatch NVA-W5-08)

Direction 2 answered as a documentation-only follow-up: a code comment was
added in `plugins/pipeline-core/lib/runner-profile-migration-v3.mjs`,
directly after `slimRuntimeSeed()`, explaining — with evidence, not a
guess — why `SLIM_V3_RUNTIME_SEEDS`/`slimRuntimeSeed()` (fresh project) and
`LEGACY_V3_RUNTIME_SEEDS`/`resolveLegacyRuntimeSeed()` (existing project's
absent-target repair) remain two separate seed tables rather than one. The
`.claude/pipeline.yaml` sub-question both tables shared is already unified
(both resolve it from `freshManifestBytes()`, per the wave-2 fix above); the
remaining divergence, on `.claude/pipeline.json`, is real and load-bearing:
`slimRuntimeSeed()`'s `overlayCalibration` parameter answers a
fresh-initialization-only question ("is this caller the private overlay
activating itself") that a legacy/repair caller cannot ever be true for, so
unifying the tables would mean plumbing overlay-activation intent into
code paths where it has no meaning. Not attempted: any runtime-behavior
change (comment-only per DoD). Verified unaffected:
`runner-profile-migration-v3.test.mjs` — 44/44 pass, same count as before
this dispatch; `check-consumer-safe-paths.test.mjs` — 9/9 pass. Status left
`open` (this item's own Triage/status is reserved for the Elephant).
- **Date:** 2026-08-19

## Closure, 2026-08-19

All three Directions confirmed independently: Direction 1 (measurement,
2026-08-12), Direction 3 (`resolveLegacyRuntimeSeed()`, NVA-W2-5,
`runner-profile-migration-v3.mjs:124`, 44/44 tests), Direction 2
(the `overlayCalibration` documentation comment, NVA-W5-08,
`runner-profile-migration-v3.mjs:177-222`). Re-verified live via grep that
both functions/comments are present in the current tree. Closing.
