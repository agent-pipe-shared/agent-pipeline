---
schema: pipeline.backlog-item.v1
id: pipeline.copy-safe-renderer-wrap-point-is-path-length-sensitive
type: defect
owner: pipeline
status: open
created: "2026-08-31"
sprint: nova-b
source: "Found 2026-08-31 by the Nova Elephant while verifying dispatch NVA-CIVERIFY: a single-assertion regex failure (guard-lifecycle-ready.test.mjs, NOVA-LCR-HGO-1) reproduced identically in two independent clones at longer checkout paths, and did not reproduce in the shorter main checkout."
---

# The copy-safe renderer's wrap point is path-length sensitive

## What was measured

`guard-lifecycle-ready.test.mjs`, test `NOVA-LCR-HGO-1: with nothing armed, the
grammar denial names the mode-appropriate next command`:

| Checkout | Path length | Result |
|---|---|---|
| main checkout `/home/skar667/src/agent-pipeline-shared_nova` | 41 chars | 188/188 PASS, run twice (by the dispatch) |
| `scratch/ci-repro` (dispatch's clone) | ~60 chars | 187/188 FAIL |
| `scratch/ci-verify2` (Elephant's own independent clone at `ed491309`) | ~63 chars | FAIL — sole red entry in an otherwise 505-suite run |

Two independent clones, two independent runs, same single assertion.

The assertion is a regex `/guard-human-override\.mjs/u` against the denial text.
`boundedCopySafeCommand` wraps the rendered command at a fixed column, and WHERE
it wraps depends on the absolute path embedded in the command. At a long enough
path the script filename is split across a wrap boundary, so the name is no
longer present as a contiguous string.

A third data point was since obtained, at a SHORT path: the full `verify.mjs` run
in the short-path main checkout at commit `4defe09e` recorded no failing entry
for `guard-lifecycle-ready-tests`. This is the third short-path pass, and it is
consistent with the path-length hypothesis (short path -> no wrap-induced split)
rather than with a genuine regression (which would be expected to fail
regardless of checkout path). A third data point at a SHORT path OUTSIDE the
repository — settling whether the effect is specific to this repository's own
path shape or general to path length — is still missing.

## Why this may be more than a test artifact

The dispatch classified it as "an artifact of reproduction path depth" while
explicitly disclosing that it had not isolated it. That classification may be
right about the TEST and wrong about the BEHAVIOR:

- The wrapped form stays functionally correct — it is reassembled through `eval`.
- But ADR-0059 Decision 4 requires a denial to NAME its next step, and a human
  reading the denial in a consumer project with a long checkout path does not
  see a contiguous `guard-human-override.mjs` to recognise or search for.
- That is this repository's own named defect class: the mechanism works, the
  path to the mechanism does not (`a33ea0cc`).

## What has NOT been done

- No third data point at a SHORT path OUTSIDE the repository (a clone to a short
  path would settle it; the containment guard refuses a write outside the project
  root, so it needs an operator or a different approach). The in-repository third
  short-path data point above (commit `4defe09e`) is consistent with the
  hypothesis but does not settle whether the effect generalizes past this
  repository's own path shape.
- Not filed as a backlog item until now; no ledger entry until this item is
  reconciled.

## Separately established in the same pass

A related, independent finding from the same verification pass — the Resume-Hint
card reddening `resume-consumption-check` in the main checkout only — is filed
separately as
`backlog/items/2026-08-31-a-captured-resume-hint-card-reds-the-verify-gate.md`;
see that item for the full analysis, which does not belong here.

## Affected artifact

- `boundedCopySafeCommand` (the copy-safe command renderer referenced by
  ADR-0059 Decision 4 ceremony guidance across the HGO-routed guard family).
- `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`,
  `NOVA-LCR-HGO-1`.

## Proposal

Owner: PO, for assignment. Ordered by cost, and deliberately not pre-deciding.

1. **Obtain the missing short-path-outside-repository data point.** Only an
   attended operator can create a short-path clone outside the project root
   (the containment guard refuses this from within a session). Until that
   third data point exists, "artifact of reproduction path depth" remains a
   classification, not a settled conclusion.
2. **If the path-length sensitivity is confirmed general (not repository-shape
   specific), make the wrap point path-length-independent** — e.g. never split
   a bare script filename across a wrap boundary, or reserve enough column
   budget for the longest expected consumer-project path before wrapping at
   all.
3. **Do not weaken or relax the test assertion** to tolerate a wrapped filename
   — that would hide the human-facing regression (an unrecognisable denial in
   a consumer project) rather than fix it.
