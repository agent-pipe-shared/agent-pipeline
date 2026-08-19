---
schema: pipeline.backlog-item.v1
id: pipeline.sentinel-epic-acceptance-matrix-archive-drift
type: defect
owner: pipeline
status: closed
created: 2026-08-19
source: "Surfaced by the Nova Wave 4 candidate verify run (2026-08-19): check-spec-retention.mjs FAILs 'sprint-sentinel-epic archive bytes differ from active acceptance authority' / 'archive digest is stale for acceptance'. Confirmed pre-existing and unrelated to Wave 4/5 work by commit c1434d49 ('revert(spec-retention): restore sprint-sentinel-epic's frozen PRD content', 2026-08-18), which already verified the drift predates that session entirely -- specs/2026-07-19-sprint-sentinel-epic/backlog-acceptance-matrix.md's last edit before that was commit 86deb0cb ('chore(release): prepare 0.4.0 candidate', 2026-07-24)."
---

# Sentinel-epic acceptance-matrix archive drift

## Description

`governance/spec-retention.json`'s `sprint-sentinel-epic` entry byte-pins
`specs/2026-07-19-sprint-sentinel-epic/backlog-acceptance-matrix.md` against
`docs/spec-archive/2026-07-20-sentinel-recovery/manifest.json`. The live
source file has drifted from the archived snapshot since at least
2026-07-24 (commit 86deb0cb), well before Wave 3 or Wave 4. This makes
`check-spec-retention.mjs` (verify suite `spec-retention-check`) fail with
two findings for the `acceptance` key: archive bytes differ, and the
archive digest is stale.

Commit c1434d49 already reverted the sibling `prd` drift (a genuine
Wave-3-introduced edit to the frozen PRD) but explicitly left this
`acceptance` drift untouched as out of scope, predating that session.

## Triggering situation

Discovered while diagnosing a failed full-verify run for the Nova Wave 4
local candidate stamp (candidate commit 79007f73f4c4bb2abb51206e8ea97d96283e305b),
2026-08-19. Not caused by, and unrelated to, any Wave 4/5 or Nova A work --
`sprint-sentinel-epic` is a separate, closed feature.

## Triage

Two resolution paths, neither attempted here (closed-sprint frozen-authority
edits are out of scope for an unrelated candidate stamp):

1. Re-archive: regenerate `docs/spec-archive/2026-07-20-sentinel-recovery/manifest.json`'s
   `acceptance` entry (path + sha256) from the CURRENT
   `backlog-acceptance-matrix.md` bytes, accepting the live file as the new
   frozen record.
2. Restore: revert `backlog-acceptance-matrix.md` to the byte content the
   existing archive manifest already pins, mirroring how c1434d49 restored
   the PRD.

Needs a PO call on which of the two reflects the intended state of the
frozen Sentinel record before either is executed.

## Closure, 2026-08-19

**Decision:** PO chose Restore (option 2), matching the c1434d49 precedent.

**Executed:** `specs/2026-07-19-sprint-sentinel-epic/backlog-acceptance-matrix.md`
overwritten with the exact bytes of
`docs/spec-archive/2026-07-20-sentinel-recovery/backlog-acceptance-matrix.md`
(the archive-manifest-pinned copy, sha256 `c606a6a2…ebda`). `node
plugins/pipeline-core/scripts/check-spec-retention.mjs` now reports "Spec
retention authority and archive bindings are valid."; `node --test
plugins/pipeline-core/scripts/check-spec-retention.test.mjs` 6/6 pass.

**Correction to this item's own `source` field, found while executing the
restore:** the claim that c1434d49 "left [the acceptance matrix] untouched"
is inaccurate — `git show c1434d49 -- .../backlog-acceptance-matrix.md`
shows that commit DID edit this file, in two ways: (a) it correctly reverted
four rows' `PO-disposition: functionally complete, release-pending` language
back to `open`/`partial`/`in_progress` wording that does NOT match the
archive pin either (a third, previously-undocumented drift, now also
resolved by this restore); (b) it reverted `pipeline.t1-governance-path-preflight`'s
row text, discarding the accurate 2026-08-18 wording that dispatch
`NVA-W3-12` (commit `c2286d65`) had added ("Governance-path clause is proven
closed … the AC's stale gate-ETA clause is retired"), back to the older,
less complete text. This restore keeps that reversion (the row now reads
the original archived text again) — consistent with treating this file as a
closed sprint's frozen authority document, the same principle c1434d49
itself states for the PRD ("needs a different, mutable home, not by editing
Sentinel's frozen PRD"). No information is actually lost from the repo: the
accurate T1 disposition (clause 1 proven closed, clause 2 retired,
tool-setup AC remaining) is recorded independently, and in more detail, in
`backlog/items/2026-07-19-t1-governance-path-preflight.md`'s own
"PO-decision implementation, 2026-08-18 (wave 3, dispatch NVA-W3-12)"
section — the live, mutable, correct home for it.
