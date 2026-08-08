---
schema: pipeline.backlog-item.v1
id: pipeline.over-broad-ignore-rule-swallows-closure-evidence
type: defect
owner: pipeline
status: open
created: 2026-08-08
due: 2026-08-15
source: "Hit while closing two backlog items on 2026-08-08: git add refused the closure evidence file the ledger reconciliation had just demanded."
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

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
