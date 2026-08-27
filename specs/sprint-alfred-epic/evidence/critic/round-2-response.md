# Round-2 response — finding-by-finding disposition (fix commit `03d97ac5`)

Round 2 (delta, base `ea392b28`, route claude-opus-5 at max): **FAIL** — 1
major + 3 minor; 11 of 13 round-1 invariants `resolved`, the two trailer
invariants `still-open` (the disposition artifact is inadmissible Critic
input by design, so no round can upgrade them from inside the boundary).
Full verbatim report: `round-2-2026-08-27.md`. Neutral registry (round-3
input): `round-2-findings-registry.md`. Fixes land in commit `03d97ac5`;
the PRD marker was recomputed there
(`4133223e309c32bb4a52502ba76068a8408181d0969437de9f5e673954a503b6`).

| Finding | Severity | Disposition |
|---|---|---|
| R2-F1 | major | **Fixed in `03d97ac5`.** The false claim is withdrawn. Spec §4.1 now states the guard-derived reality (plugin source in a source checkout ⇒ `author-repair-required`; needing a TP path is a dispatch stop condition, `agent-obligations.md` §2) and redesigns the step as a **PO-performed act**: A1 prepares the exact contiguous replacement, the PO applies it in their own shell outside the agent boundary (spec §1 human-owner clause; §10 "PO-executable routes"). The pointer edit is declared non-load-bearing — the A1 record is authoritative over the `$comment` from the moment it exists — so a deferred PO edit blocks no gate and is carried as a typed A2 residual row. This removes both halves of the risk: no unavailable route is claimed, and Wave 0 cannot stall on the edit. |
| R2-F2 | minor | **Fixed in `03d97ac5`.** §B header re-titled "(live-measured classes)"; IR-3 cites the per-class dates/provenance in `design/issue-intake.md` #103. |
| R2-F3 | minor | **Standing disposition, unchanged** (see `round-1-response.md`, A-F1/B-F10 row): stage-0 is definitionally out of reach (≤2 files/≤25 lines, operating-model §3.3), a goldfish trailer would be false, and the canon gap is filed as the open backlog item `2026-08-27-no-sanctioned-dispatch-trailer-form-exists-for-direct-elephant-design-commits.md`. No document change intended; the `still-open` invariant rows are the expected, honest steady state until the canon decides. Surfaced to the PO at the design gate. |
| R2-F4 | minor | **Fixed in `03d97ac5`.** The declared fact is restated evergreen: the marker binds `spec.md` as committed in the newest `commits[]` entry that lists `spec.md` — true at every future recompute, no re-staling. |

## Additional measurement from this round (existing item, new evidence)

The round-2 Critic hit the scratch-note persistence wall through **two new
lanes**: `GUARD-TESTPATH-SHELL` fired on the note *text* merely quoting a
protected path's filename, and `guard-devplan` resolved a `node -e` write
target as `File: -e` instead of the actual `scratch/` path (a prefix on its
own exempt list). Recorded here as further evidence for the open item
`2026-08-27-critic-dispatches-cannot-persist-their-scratch-notes.md`
(item file deliberately not edited — ledger DRIFT hygiene; fold in at its
next legitimate touch).

## Round 3

A delta re-review (round 3 of at most 4 per package) is dispatched on
`03d97ac5` with `round-2-findings-registry.md` as the neutral input,
invariants R2-F1, R2-F2, R2-F4 plus the marker invariant; R2-F3 is excluded
from the invariant set (no document change intended; tracked as an open
backlog defect). Its report will be persisted beside this file on arrival.
