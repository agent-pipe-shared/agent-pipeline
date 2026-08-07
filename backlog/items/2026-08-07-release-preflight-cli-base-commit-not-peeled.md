---
schema: pipeline.backlog-item.v1
id: pipeline.release-preflight-cli-base-commit-not-peeled
type: defect
owner: pipeline
status: open
created: 2026-08-07
source: "NVA-A54 Critic review, 2026-08-07 (finding 2), reviewing commits 6e2c9b2..d5be0e6."
due: 2026-09-06
expires: 2026-09-06
---

# `release-preflight-cli.mjs` records a tag OID as `base.commit` without peeling to the commit

## Description

`plugins/pipeline-core/scripts/release-preflight-cli.mjs:149` resolves
`base.commit` via a plain `git rev-parse <baseCommit>` with no `^{commit}`
peel, while the adjacent `base.tree` on line 141 correctly uses
`${baseCommit}^{tree}` (which does peel through tags). When `--base` is a
tag (e.g. `v0.5.2`), `git rev-parse v0.5.2` returns the tag object's own
OID, not the commit it points to — so the sealed record pairs a tag OID
under `commit` with the tree of a different, unnamed object.

Concretely: `git rev-parse v0.5.2` = `5a23a2453c4740addf33f7b83a62e7084e9259b0`
(a tag object), while `git rev-parse v0.5.2^{commit}` =
`6e2c9b2868d164ff3b631ab068fa5df20939e07d` (the real commit). The sealed
evidence at `specs/sprint-nova-epic/evidence/nova-a/a6/release-preflight-record-57ee7e9.json:8-11`
carries the tag OID under `base.commit`.

## Triggering situation

Found by the NVA-A54 Critic review (2026-08-07) auditing the Nova A
evidence-sealing wave. The defect is pre-existing in
`release-preflight-cli.mjs` (outside that wave's diff) but the wave's own
`NOVA-A56-EVIDENCE-1` dispatch uncritically sealed the resulting defective
artifact.

## Affected artifact

`plugins/pipeline-core/scripts/release-preflight-cli.mjs:149` (missing
`^{commit}` peel on `base.commit`, unlike the correct `^{tree}` peel on
`base.tree` at line 141); `plugins/pipeline-core/scripts/release-preflight.mjs:59-62`
(`validateCandidate`/`oid()` only checks 40/64-hex format, so nothing
downstream catches the type mismatch).

## Proposal

Peel `base.commit` through `^{commit}` the same way `base.tree` already
peels through `^{tree}`, so a tag `--base` resolves to the actual commit
OID it points to. Add a regression fixture using a tag ref as `--base`
(the exact case that exposed this) to `release-preflight-cli.test.mjs`.
Low severity — per the Critic's own finding, `status`/`reasons` output is
unaffected and no false-ready claim results — but worth fixing since
`pipeline.release-preflight.v1`'s own schema documentation states it is
"exact-candidate bound."

## Triage (filled in by the Elephant of the next Pipeline session)

Not yet triaged. Filed at Critic-review time; not fixed in-session since
`release-preflight-cli.mjs` sits under GS-6 (no in-session edit path) and
severity is minor/non-blocking.
