---
schema: pipeline.backlog-item.v1
id: pipeline.critical-human-proof-policy-seeded-without-trust-anchor
type: idea
owner: pipeline
status: open
created: 2026-08-09
source: "Critic review (round 2, PASS) of GF-062/GF-065's critical-human-proof.json onboarding fix, scratch/critic-1f03ce024c82/critic-notes.md, deliberately not flagged as a finding of that diff."
---

# The seeded `critical-human-proof.json` policy has no `trustAnchor`, so signature mode accepts any well-formed externally supplied key

## What happened

`project-onboarding-v3.mjs` now seeds `project/critical-human-proof.json`
(schema v1, `requiredKinds: ["push"]`) for every freshly onboarded project,
regardless of `push_approval` mode
(`2026-08-09-critical-human-proof-not-materialized-for-signature-mode.md`,
closed). The seeded policy carries no `trustAnchor`, so
`pipeline-state.mjs`'s `trustAnchor` check (around line 2736) is skipped
entirely, and a `signature`-mode project's `approve-push` accepts any
well-formed externally supplied proof key — not specifically the PO's own.

The reviewing Critic examined this and explicitly did not report it as a
defect of that diff: the prior default (no policy file at all) was an
unclearable gate that had already produced one real unapproved push in this
repository's own history (`pipeline-state.mjs:5299-5302`); the Pipeline
holds no human key to seed a real trust anchor with; and the boundary is
already stated with rationale in the code
(`project-onboarding-v3.mjs:931-935`). The observation is a genuine
tightening opportunity, not a bug in the diff that created it.

## Direction

Not yet worked out. Two directions worth exploring, not mutually exclusive:

1. A first-use trust-anchor-pinning flow (like SSH's "trust on first use"),
   where the first accepted signature for a project becomes the pinned
   anchor for subsequent approvals.
2. An explicit, loud "no trust anchor configured" disclosure surfaced to the
   PO at the point signature mode is chosen (or at first `approve-push`),
   rather than a silent skip — makes the current, deliberate boundary
   visible instead of implicit.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Neither of this item's own two original directions (TOFU
  pinning of a single global anchor, or loud disclosure of the current
  no-anchor state) — the PO rejected both as insufficient. Accepted instead:
  **trust-on-first-use PER KEY, gated by the same signature-or-chat ceremony
  already used for other critical gates** (`gates.push_approval` config).
  A new, unrecognized-but-well-formed key triggers an explicit human
  confirmation (signature or chat, matching cluster C's same duality) before
  being trusted; once confirmed it stays trusted. Supports multiple
  legitimate keys (cross-repo team work) while an agent can never add or
  invent a trusted key itself — the confirmation step is structurally
  identical to every other critical-gate ceremony in this repo, not something
  an agent can fake or skip.
- **Rationale:** PO, 2026-08-11, verbatim objection to the original two
  options: "widerspricht mE der design policy 'gegen den Agent und nicht
  gegen Human'... es muss alleine wegen Cross-Repo-Teamarbeit die Möglichkeit
  geben, dass verschiedene Schlüssel vom Human nutzbar sind, aber ein Agent
  darf niemals selber einen erfinden." Re-designed with three new candidates
  presented (external agent-unwritable key list; trust-on-first-use per key
  via signature-or-chat; cryptographic trust-chain/delegation) — PO selected
  the second, the Elephant's own recommendation, for reusing existing
  ceremony machinery and cleanly satisfying both hard requirements (multiple
  keys, agent can never originate trust).
- **Assignment (if accepted):** Unassigned — real design + implementation
  work on `pipeline-state.mjs`'s `trustAnchor` check (around line 2736) and
  wherever `approve-push` currently accepts any well-formed key unconditioned.
  Needs to define: what "new, unrecognized key" detection looks like
  concretely, and how the signature-or-chat confirmation binds to that
  specific key going forward (a per-key trust record, not a single global
  anchor field).
- **Date:** 2026-08-11

### Sprint assignment, 2026-08-17

- **Decision:** deferred to Sprint Alfred.
- **Rationale:** matches Alfred's confirmed scope — "control integrity" —
  directly; real design + implementation work, not urgent (the current
  no-anchor boundary is a deliberate, already-accepted tradeoff, not an
  active gap).
- **Assignment (if accepted):** next available Alfred slot.
- **Date:** 2026-08-17
