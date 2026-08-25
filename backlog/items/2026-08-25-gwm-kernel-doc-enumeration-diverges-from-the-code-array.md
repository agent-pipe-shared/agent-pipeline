---
schema: pipeline.backlog-item.v1
id: pipeline.gwm-kernel-doc-enumeration-diverges-from-the-code-array
type: defect
owner: pipeline
status: open
created: 2026-08-25
source: "AGY-GWMKERNEL-1 (goldfish-deep) own report, 2026-08-25, Deliverable section 4 (Deliberately NOT changed) -- found while fixing the chat-gate-ceremony.mjs kernel-closure gap, explicitly flagged as pre-existing and out of that dispatch's scope"
---

# `NEVER_LIFTABLE_KERNEL_PATHS` (code) and the GWM threat-model doc's prose enumeration have drifted apart -- 13 code entries are undocumented

## Description

ADR-0058 Decision 3 states the kernel-closure array
(`NEVER_LIFTABLE_KERNEL_PATHS`, `plugins/pipeline-core/lib/guard-maintenance-window.mjs`)
and `docs/guard-maintenance-window-threat-model.md`'s "Protected assets"
prose list are meant to carry "the SAME enumeration" -- the doc is the
authoritative human-readable copy, the code is the test-enforced one
(`guard-maintenance-window-kernel-closure.test.mjs`, GMWKC01), and they
should never disagree.

While fixing AGY-GWMKERNEL-1 (adding `chat-gate-ceremony.mjs` to both), the
dispatch found -- and explicitly left alone, as out of its own narrowly
scoped briefing -- a pre-existing divergence: 13 entries present in the code
array have no mention anywhere in the doc's prose list:

- `lib/guard-devplan-policy.mjs` (missing from the primary 7-entry kernel
  bullet, not the transitive-closure list)
- `lib/feature-package-topology.mjs`
- `lib/private-boundary.mjs`
- `lib/protected-test-paths.mjs`
- `lib/publication-authority.mjs`
- `lib/publication-bundle.mjs`
- `lib/publication-bundle-v2.mjs`
- `lib/publication-capability-preflight.mjs`
- `lib/review-economy.mjs`
- `scripts/pipeline-state.mjs`
- `scripts/po-gate-profile-repair.mjs`
- `scripts/project-onboarding-v3.mjs`
- `scripts/publication-close-journal.mjs`

Derived mechanically by the dispatch via a scratch diff script (not
committed, gitignored/ephemeral) comparing the array's contents against the
doc's listed paths.

## Impact

GMWKC01 does not catch this because it only checks that the code array is
*closed under import* (nothing unlisted is reachable from a listed entry) --
it says nothing about whether the doc's prose transcription of that array is
complete. The practical risk is a human (the PO, a future Critic, an
auditor) reading the threat-model doc to understand what GWM can never touch
and getting an incomplete picture -- 13 real protections are invisible there.

## Proposal

Either (a) regenerate the doc's prose list mechanically from the code array
at doc-build/lint time so the two structurally cannot drift again, or (b) a
one-off dispatch reconciling the 13 missing entries into the doc by hand,
plus a lightweight check (script or test) asserting the doc's listed paths
are a superset of the code array going forward. Option (a) is stronger and
closes the class of defect, not just this instance.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** deferred
- **Rationale:** not blocking -- the code-side invariant (GMWKC01) is what
  actually gates GWM's safety property; this is a documentation-completeness
  gap, not a security hole. Filed immediately so the finding is not lost
  before AGY-GWMKERNEL-1's own report/transcript ages out.
- **Assignment (if accepted):** unscheduled.
- **Date:** 2026-08-25
