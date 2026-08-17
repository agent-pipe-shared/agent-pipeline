# NVA-CONTREP-2 closure evidence

Backlog item: `pipeline.continuity-repair-has-no-case-for-an-established-project-missing-only-pipeline-state-json`
Closure commit: `28c1ba0c3d3c2f5c27b519dba7adc42907ef6462`

## What changed vs. the original Proposal

The Proposal asked for a repair case gated on "the project's calibration/
authority can independently establish valid PO authority" — i.e. an
automatic derivation. A first dispatch, NVA-CONTREP-1, investigated this and
stopped: no sound, non-fabricating path to `activeFeature.id`/PRD/Spec
exists anywhere in a project once `pipeline-state.json` itself is absent
(`establishedContinuity()` only ever copies `activeFeature` from an
already-present `state` object; `po-gate-authority.mjs`'s own independent
validator still reads `activeFeature.id`/`planPath` out of the same absent
file; feature IDs are free-form at promotion time with no fixed path
convention; `docs/state.md` carries only advisory prose). Full trace in
`evidence/dispatch-record-NVA-CONTREP-1.json` (local, gitignored).

The delivered design (NVA-CONTREP-2) is therefore **operator-confirmed**,
not independently derived: `planOnboardingContinuityRepair()` returns
`status: "operator-authority-required"` (a `collect-input`-shaped ask,
mirroring the existing `collectAuthorIdentityAction()` pattern) until the
operator states `featureId`/`planPath`/`prdPath`/`specPath`/`language`
once. Every one of those values is then independently validated (path
safety, existence, digest binding via `repairArtifact()`) before a
`pipeline-state.json` is synthesized — never blindly trusted. The
synthesized state deliberately does NOT claim `planApproved: true` (no
approval evidence exists for a project this old); it lands at
`phase: "design"`, leaving re-approval to `submit-plan`/`approve-plan`,
exactly like a fresh kickoff's own resting point.

This is a stricter, more honest fulfillment of the Proposal's core
requirement ("never inventing an `activeFeature`/authority pair that isn't
independently evidenced") than the Proposal's own suggested mechanism, which
turned out to be unsound.

## Evidence

- `node --test plugins/pipeline-core/lib/onboarding-continuity.test.mjs` —
  exit 0, 153/153 passed (elephant-independent re-run, matches the goldfish's
  own captured result).
- `node --test plugins/pipeline-core/lib/project-onboarding-v3.test.mjs` —
  exit 0, 121/121 passed (elephant-independent re-run).
- Full `node harness/scripts/verify.mjs`, exact-bound to `28c1ba0c`
  (`evidence/verify-latest.json`, `candidate.binding: "exact"`): 268/269
  steps pass; the one failure (`human-guard-override-tests`) is the
  pre-existing, unrelated local-marketplace content-staleness issue tracked
  in `backlog/items/2026-08-17-this-hosts-local-marketplace-copy-is-not-symlinked-to-source.md`.

## Review disposition

Reviewed by a consolidated Critic dispatch alongside NVA-PAWINACL-1 and
NVA-MKTHASH-1 (`scratch/critic-nva-94027c4e/critic-notes.md`, opus at max).
Verdict: **PASS with 2 minor findings** — F-6 (a pre-existing CLI test was
rewritten inside the same commit rather than a separate one; no coverage
lost, procedural QG-04 note only, no further action) and F-7 (this backlog
item's Proposal recorded the original, unsound derivation approach rather
than the final delivered operator-confirmed design — resolved by this
closure note). No further Critic dispatch was run for this reconciliation
(PO directive: one consolidated Critic run, not a re-review per fix).
