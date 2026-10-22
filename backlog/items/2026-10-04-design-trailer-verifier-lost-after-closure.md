---
schema: pipeline.backlog-item.v1
id: pipeline.design-trailer-verifier-lost-after-closure
type: defect
owner: pipeline
status: open
created: 2026-10-04
source: "Alfred triage batch A (2026-10-04), confirmed by the Elephant with git log -S on the current branch."
sprint: alfred
done_when: manual
---

# The design-commit trailer verifier was lost after its item was closed

## Description

The backlog item `2026-08-27-no-sanctioned-dispatch-trailer-form-exists-for-direct-elephant-design-commits`
was closed on the claim that `dispatch-authorship-verify.mjs` exports `ELEPHANT_DESIGN_ID` and verifies
`Dispatch: design (elephant)` commits. At HEAD, neither `plugins/pipeline-core` nor `harness/scripts`
contains `ELEPHANT_DESIGN_ID`. `lib/commit-message-policy.mjs` rejects the `design (elephant)` form;
live on 2026-10-04 only `stage-0 (elephant)` was accepted. `templates/prompts/agent-obligations.md:176`
still prints the rejected form, which a separate open item records.

`git log -S ELEPHANT_DESIGN_ID` on the current branch lists the adding commits `7535e631f` and
`f17cc5bb0`, plus the two closure commits. It lists no removing non-merge commit, and `7535e631f` is an
ancestor of HEAD. The verifier was most likely dropped by a merge or source import (`git log -S` skips
merges by default).

This means a closed item is not proof that its change still exists. Other closures may have been lost
the same way.

## Acceptance

- The merge or import that dropped the verifier is identified (`git log -S ELEPHANT_DESIGN_ID -m`).
- The trailer grammar is fixed in one place (Spec §21.5 trailer bullet). Either the
  `design (elephant)` form is admitted, path-scoped and verified, or it is removed from every printed
  example and generator.
- A merge-survival check compares the code needles of the closed items' `done_when` / closure
  evidence against HEAD, and fails when a needle disappears.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**

## Measured 2026-10-20: the dropping merge

`git log -S ELEPHANT_DESIGN_ID -m --all` lists two merges. Counting the needle with
`git grep -c -e ELEPHANT_DESIGN_ID <commit> -- plugins harness` in each merge and its parents:

| Commit | Role | `dispatch-authorship-verify.mjs` / `.test.mjs` |
|---|---|---|
| `7322abf52` (chore(alfred): merge remote feature branch) | merge | 3 / 1 |
| `cc1470ffa` | its first parent | 3 / 1 |
| `0aeaef18f` (merge(nova): integriert aktuellen Nova-Stand, 2026-09-20) | merge | 0 / 0 |
| `ff904be97` | its first parent | 3 / 1 |
| `14ebe5ec8` | its second parent | 0 / 0 |

The merge `0aeaef18f` dropped the verifier: it took the second parent's version of both files.
The first acceptance bullet is met by this measurement. The other two (one trailer grammar, a
merge-survival check) remain open.

## Reconciled 2026-10-22: the three bullets against the current tree

The "remain open" sentence above is superseded; all three acceptance bullets hold at the current head and are pinned by
`plugins/pipeline-core/lib/pins/design-trailer-verifier-lost-after-closure.test.mjs` (`node --test`, Linux host: 8 cases,
8 pass, 0 fail, 0 skip).

- Bullet 1 (the dropping merge): met by the 2026-10-20 measurement above (`0aeaef18f` took the second parent's version).
  A one-off forensic act; it has no code property to pin.
- Bullet 2 (one trailer grammar): decided by PO decision 2026-10-16 #12, which admits exactly `Dispatch: design (elephant)`
  next to `Dispatch: stage-0 (elephant)`. The verifier (`scripts/dispatch-authorship-verify.mjs`) passes both Elephant ids
  within the stage-0 size bound and refuses every other Elephant id (`elephant-direct-nonstandard-id`); the commit-message
  policy refuses the near-misses as `GIT-03-DISPATCH-MALFORMED` in both the finished-message and the `--trailer` lane
  (cases AC-A1 to AC-A3). The printed obligations carry the form with its bounds (AC-A5), and no non-test source emits a
  malformed design variant (AC-A4). The lost symbol `ELEPHANT_DESIGN_ID` is intentionally not restored: the verifier names the
  id `design` directly, and AC-A4 keeps the old symbol gone.
- Bullet 3 (merge-survival check): the `done_when: contains <path> <needle>` predicate of closed items is evaluated for the
  whole backlog by `scripts/check-backlog-done-predicate.mjs` (a step of `harness/scripts/verify.mjs`). Cases AC-B1 and AC-B2
  prove it fails when a needle or its file disappears, and AC-B3 runs it over the real backlog at head: no closed item loses
  a needle beyond the one recorded pre-existing loss (`2026-08-29-approve-announce-test-fixture-missing-present-plan-step`).
  The related open item on the printed example (`installed-design-trailer-example-is-rejected-by-git-guard`) carries the
  real-hook run of every printed example.

Not verified here: that every closed item carries a machine `done_when` (the sweep evaluates the declared predicates only;
items without one are counted as undeclared, not checked).
