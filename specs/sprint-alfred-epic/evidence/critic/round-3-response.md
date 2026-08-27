# Round-3 response — finding-by-finding disposition (fix commit `0181fe4b`)

Round 3 (delta, base `03d97ac5`, route claude-opus-5 at max): **FAIL** with
exactly one minor finding; R2-F1, R2-F2, and the marker invariant all
`resolved`. Full verbatim report: `round-3-2026-08-27.md`. Neutral registry
(round-4 input): `round-3-findings-registry.md`. The fix lands in commit
`0181fe4b` (touches only the authoring record; `spec.md` unchanged, marker
untouched).

| Finding | Severity | Disposition |
|---|---|---|
| R3-F1 | minor | **Fixed in `0181fe4b` — by removing the defect class, not by patching the instance.** The failed formulation resolved through `commits[]`, which can never contain the very commit that recomputes the marker (self-reference: a commit's sha does not exist while its tree is being authored), so the fact was structurally false at each marker-recomputing commit and true only one bookkeeping commit later. The declared fact now states the invariant directly and commit-independently: since `584acbda` introduced the PRD/spec pair, every commit changing `spec.md` recomputes the marker in that same commit, so `sha256(spec.md)` equals the committed marker at every commit of the design line — verifiable by recomputation at any commit, with no dependency on `commits[]` at all. (`commits[]` remains authorship bookkeeping and is extended for `0181fe4b` in the evidence commit alongside this file, as before — no longer load-bearing for any declared fact.) |

## Round 4

A delta re-review (round 4 — the last of at most four rounds per package)
is dispatched on `0181fe4b` with `round-3-findings-registry.md` as the
neutral input; invariants: R3-F1 plus the marker invariant. R2-F3 (commit
trailer) stays excluded per its standing disposition
(`round-1-response.md`, `round-2-response.md`). Its report will be
persisted beside this file on arrival.
