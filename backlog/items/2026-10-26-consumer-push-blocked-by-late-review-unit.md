---
schema: pipeline.backlog-item.v1
id: pipeline.consumer-push-blocked-by-late-review-unit
type: defect
owner: pipeline
status: open
created: 2026-10-26
sprint: alfred
priority: P0
release: 0.7.0
source: "PO relay of a consumer handover (push block), 2026-10-26, plugin 0.7.0+claude.20261026134650.9ce6c23 local-development; preflight and onboarding ready, hooks refreshed"
done_when: manual
---

# Consumer cannot push: a late review unit excludes the delivered code from the Critic (PF-75, PF-58 addendum 2)

The consumer project is ready to deliver: lint, typecheck, unit, scaffold, integration, pgTAP and build are
green, the security scan has no findings, push approval mode is `signature`. Every push, also to the feature
branch, is refused. The cause is in the Pipeline. Interim-candidate priority (D165).

## PF-75 (critical): a review unit added after delivery leaves no admissible review range over the delivered code

1. The feature was fully delivered while no review unit existed (PF-58).
2. After the update, `register-feature-package.mjs --root <root> --add-review-unit` adds it: status
   `review-unit-added`, criteria such as `AC-E1-01-01` are now accepted. Its output says: "That commit is the
   earliest base a Critic review of this feature course can use: start the course's first review from it."
3. The two `commitPaths` (`lifecycle.json`, `design/critic-review-unit.json`) were committed in one commit as told.
4. `critic-dispatch-preflight.mjs` with Spec and critic-mode Verify evidence bound exactly to the candidate:
   - `--base <last published main> --candidate <unit commit>`: refused `CCA-REVIEW-UNIT-REQUIRED`; the repair
     again names the unit commit as base.
   - `--base <unit commit> --candidate <same commit>`: rejected `CDP-RANGE`.

Effect: the first admissible range contains only commits after the unit. The Critic reviews only the diff, so
the delivered feature code can never be reviewed. Evidence from such a range (a few doc commits) would satisfy
`critic-bound-verify` at push formally without a real review; the Elephant correctly refuses that (EL-37).

Expected, one of: (a) for a late-added unit the first review may use the merge base with main (last published
state) as base; or (b) a sanctioned route binds the unit to an earlier base commit.

Also to check: the generated unit carries `deliveryBoundary.mainRef: refs/heads/feat/<branch>`, but the PO
pushes to `refs/heads/main` where the release workflow runs. Does `push-init` with destination main fail on a
delivery-boundary mismatch? The unit is registered immutable; the consumer cannot adjust it.

## PF-58 addendum 2 (critical, cause of PF-75): push block without a Critic route

- `push-init.mjs --by <name> --remote origin --destination refs/heads/main` and the same with
  `refs/heads/feat/<branch>` return `precondition-unmet`; the check `critic-bound-verify` reports qualification
  unavailable (`private-critic-binding-unavailable`).
- The Verify evidence was exact and green (head evidence and the private record under
  `<git-common-dir>/agent-pipeline/critic-verify-...` were produced by the regular flow).
- `repair-map.mjs` offers no route for this check.
- A week earlier pushes went through without this block. A project that delivered without a Critic route
  cannot publish at all after the update. Before the update, adding the unit already failed with
  `...-UNAVAILABLE` ("names no AC-<n> criterion id") for criteria in the format `AC-E<epic>-<story>-<nn>`.
  (Parts of the relayed text were cut off in the paste; the PO can resend the full section.)

## Design memo and second blocker (2026-10-26)

`specs/sprint-alfred-epic/evidence/pf75-late-review-unit-design.md` (commit `2d0047cf7`) ranks the options. Chosen
under D165: read the unit at its introducing commit (the base if it already lists the unit, else the first commit
in `base..candidate` whose manifest lists an entry at the unit path), with the existing binding checks applied at
that commit unchanged. The first review may then use the merge base with the publication target. Implemented as
two held-patch slices: (A) optional `declarationCommit` in `readCriticReviewUnit`/`reviewUnitSource`
(`lib/critic-generic-batch.mjs`), (B) `featureReviewUnit` in `lib/critic-course-admission.mjs` plus the two texts.

Second blocker the memo found, independent of PF-75: `reviewUnitSource` requires `deliveryBoundary.mainRef` to equal
the primary checkout's `symbolic-ref HEAD` at review time and the candidate to be an ancestor of it
(`CGB-MAIN-INTEGRATION`). A consumer whose primary checkout sits on `main` while the unit names
`refs/heads/feat/<branch>` fails even after PF-75 is fixed, and the unit is immutable. PO question: on which branch
does the consumer's primary checkout sit when the review runs? Also surface the 512-commit `CCA-RANGE-BOUND` for a
long-delivered feature. `push-init` itself has no `mainRef` comparison.

## Wish beyond PF-75

When `critic-bound-verify` refuses, it and `repair-map` name the concrete route to the evidence (the
preflight call with an admissible base) instead of only "independent Critic review".
