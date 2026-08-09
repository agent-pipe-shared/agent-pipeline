---
schema: pipeline.backlog-item.v1
id: pipeline.over-broad-ignore-rule-swallows-closure-evidence
type: defect
owner: pipeline
status: closed
created: 2026-08-08
due: 2026-08-15
source: "Hit while closing two backlog items on 2026-08-08: git add refused the closure evidence file the ledger reconciliation had just demanded."
closed_at: 2026-08-09
closure_repository: self
closure_commit: f9d52fe33b7797c7c86eea1bd93c35b0458d26a0
closure_evidence: backlog/evidence/2026-08-09-closure-evidence-trackedness.md
---

# An unanchored ignore rule swallows the closure evidence the backlog gate requires

## What happens

`reconcile-backlog-ledger.mjs` refuses to record a closed item that lacks
`closure_evidence`, and the convention — visible in every previously closed item
— is that the field points at a file under `backlog/evidence/`. Writing that file
and staging it fails:

```
The following paths are ignored by one of your .gitignore files:
backlog/evidence
```

`git check-ignore -v` names the rule:

```
.gitignore:25:evidence/   backlog/evidence/2026-08-08-restart-barrier-runner-exemption-verification.md
```

The pattern `evidence/` has no leading slash, so it matches a directory of that
name **at any depth**. It was written for the repository-root `evidence/`
directory, which holds dispatch records and working artifacts and is correctly
untracked. It also matches `backlog/evidence/`, which is the opposite: tracked,
referenced by the backlog schema, and required by the closure contract.

## Why it stayed invisible

Fourteen files in `backlog/evidence/` are tracked, added before the rule existed.
Git does not re-evaluate ignore rules against already-tracked files, so the
directory looks healthy and the existing `closure_evidence` references all
resolve. Only a *new* closure hits it.

The failure is silent in the dangerous direction, and this is the part that
matters more than the ignore rule itself:

- `git add` without `-f` fails loudly — which is how this was found.
- But if the file is simply left untracked, **the gate still passes**. The
  reconciliation checks that the `closure_evidence` field is set, and the file
  exists on the local disk, so the local run is green. Every other checkout has
  a closed item whose cited evidence does not exist. The ledger records a
  closure bound to a file nobody else can read.

Whether the reconciliation verifies that the referenced path is *tracked*, rather
than merely present, has not been established and is the first thing to check.

## Affected artifacts

- `.gitignore` line 25 — `evidence/`, unanchored.
- `plugins/pipeline-core/scripts/reconcile-backlog-ledger.mjs` — the presence
  check for `closure_evidence`.
- `backlog/evidence/` — fourteen tracked files that predate the rule, plus
  `backlog/evidence/2026-08-08-restart-barrier-runner-exemption-verification.md`,
  which is tracked only because it was added with `-f` in commit `7700248`.

## Direction, not a design

1. **Anchor the rule.** `/evidence/` matches the intended root directory only.
   Verify no other unanchored rule in the file has the same collateral reach —
   the same one-character omission is likely to appear more than once.
2. **Make the gate check trackedness, not presence.** A `closure_evidence`
   pointing at an untracked path is a broken citation, and the gate is the only
   thing positioned to catch it. This is the half that prevents recurrence; the
   anchoring alone does not.
3. **Sweep the existing closures** for `closure_evidence` references that are
   untracked today, and report the count. It may well be zero.

## Related

- `2026-08-08-no-governed-directory-contract-so-every-session-invents-one.md` —
  this is instance 3 of that item's evidence, and its "how is the ignore rule
  anchored" question is exactly this defect generalized.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, all three legs.
- **Rationale:** leg 1 alone leaves the silent direction open — `git add`
  refusing is loud, never staging the file is not, and the item said so.
- **Assignment (if accepted):** Elephant, GF-057 follow-on.
- **Date:** 2026-08-09

## Resolution

- **Leg 1, anchor the rule** — `4be63c87`. `.gitignore:34` is `/evidence/`; the
  reasoning sits above it in the file. The same sweep confirmed no other rule in
  the file has that collateral reach.
- **Leg 2, trackedness rather than presence** — `f9d52fe3`.
  `repositoryTrackingState()` in `check-backlog-state.mjs` is the single owner;
  `reconcile-backlog-ledger.mjs` imports it. Three-valued, so a non-Git project
  is told the question is unavailable rather than that its citations are broken.
  Four call sites: the checker's closed-item sweep, `applyBacklogTransition`,
  `applyBacklogEvidenceAmendment`, and the reconciler's `closureFindings`.
  Trackedness is index membership, so the write-stage-reconcile-commit flow is
  unchanged.
- **Leg 3, sweep the existing closures** — count is **zero**: 27 closed items, 0
  citing an absent or untracked path. The checker's loop is now that sweep and
  runs on every Verify, so no one-off script was kept.

Evidence: `backlog/evidence/2026-08-09-closure-evidence-trackedness.md`.
