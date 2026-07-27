# PO Sentinel closure disposition — 2026-07-24

## Authority and scope

The PO explicitly dispositioned Sprint Sentinel as completely closed on
2026-07-24. This evidence closes the six remaining Sentinel delivery records:

- `pipeline.sentinel-go-live-completion`
- `pipeline.push-guard-worktree-target`
- `pipeline.windows-directory-durability`
- `pipeline.windows-private-state-assurance`
- `pipeline.windows-trusted-tool-resolution`
- `pipeline.windows-verify-reproducibility`

It does not bulk-close unrelated workflow improvements that were merely
recovered from the historical Sentinel baseline and are now assigned to later
Sprints.

## Released candidate and remote readback

- Public release: `v0.4.1`
- Commit: `81cc5f1a6cb384057fd49dd1a340e93c3aec3efb`
- Tree: `ec4fcf2e84b15a580dbc13d98198204e8cfca429`
- GitHub Release published: `2026-07-24T17:37:25Z`
- Read-only remote observation on 2026-07-24 found `main`,
  `refs/tags/v0.4.1^{}` and
  `refs/heads/feat/sprint-nova-codex` at the same commit.
- `evidence/verify-latest.json` binds the exact commit and tree with
  `exitCode: 0`.
- `evidence/security-latest.json` binds the exact commit and tree with
  `exitCode: 0`.

The earlier `v0.4.0` release and its exact main/tag readback are documented in
`docs/release-0.4-readiness.md`; `v0.4.1` is the accepted hotfix baseline from
which the Nova and Cyborg branches start.

## Sentinel Issue disposition

The Public GitHub Issues carrying `sprint:sentinel` are closed. In particular,
the four native-Windows delivery Issues `#34`, `#35`, `#36`, and `#37` are
closed, and the released tree contains their Windows durability,
private-state, capability/Verify, and trusted-tool implementation and
registered test surfaces.

## Evidence boundary

This record preserves the difference between evidence and PO authority:

- it records the final PO product acceptance and canonical backlog
  disposition;
- it cites the exact released candidate, current Verify/Security evidence,
  remote/tag readback, and closed Public Issues;
- it does not invent a missing platform-specific receipt, model identity,
  selected-sandbox assurance, or independent-review artifact; and
- older Specs, matrices, handover text, or Issue comments that still say
  `open`, `release-pending`, or `not closing` are historical pre-release
  statements and do not override this later PO disposition.

The known historical ledger reachability defect for events 39 and 40 remains
separate: their recorded commits are not reachable from the current Public
repository. This closure does not rewrite those append-only events.
