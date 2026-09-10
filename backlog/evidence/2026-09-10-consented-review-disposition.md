# Consented native review results — 10 September 2026

The user explicitly confirmed storage of the previously disclosed standing
project/service consent. The supported host permission mechanism accepted the
local record operation and both subsequent native review invocations. Full
Access was not enabled. The project-private decision is attribution of the user
instruction, not an independently minted host permission. Each invocation
checked its actual selected paths, digests and candidate against the same plan.

Both runs reviewed commit `5387843b8ce7718c1d1aa9ae4baebf4b91273871`, tree
`0198aed8e7ae190ae155a24350083421549f0c54`. The preceding full Verify completed
517 suites with exit 0, zero reuse and exact clean start/finish bindings:
`evidence/verify-1789036890779-ef60863bad3b469d.json` in the main checkout.

## Actual native results

- [Inventory and public targets](2026-09-10-consented-critic-inventory.json):
  completed in 548 seconds; FAIL, three findings, no briefing violations.
  Eight named source artifacts were covered. Canonical nested receipt digest:
  `83ff98e82111e223e45b79655b718d897ede6ed17e582224ddc8356ddefabc13`.
- [Reader integration and compatibility](2026-09-10-consented-critic-reader-integration.json):
  completed in 901 seconds; FAIL, two findings, no briefing violations.
  Eleven named source artifacts were covered. Canonical nested receipt digest:
  `f249d46428d2539832c7efb76ba2b33f9aab5932958c0f019a07ede25b59d78f`.

Both results have a completed turn, native child exit 0, no terminal signal,
and complete cleanup. Their verdict hashes, exact candidate bindings and all
named source blobs/hashes were independently read back by the coordinator.
The launcher exits 1 for a substantive FAIL despite successful execution.
Missing historical authorship proof remains unverified; no lifecycle violation
or model-identity assurance is inferred from that absence.

## Finding dispositions

| Finding | Disposition | Repair scope |
| --- | --- | --- |
| Template copy can replace existing project instructions | Fix | SETUP adoption instructions preserve existing calibration and CLAUDE.md |
| Consumer health commands assume a source checkout | Fix | SETUP uses the absolute installed plugin root |
| German flow mandates consultation on every Epic/Feature | Fix | PIPELINE_FLOW separates capability preflight and demand-driven consultation |
| Release output follows symlinks outside the repository | Fixed, directly verified | Actual CLI output-path validation and regression tests |
| External proof can alias repository contents through an ancestor symlink | Fixed, directly verified | Actual CLI external-proof reader and regression tests |

The three documentation corrections were prepared while the second review
still ran and applied only after both native children had completed. Their
documentation, consumer-path and scoped whitespace checks passed; commit
`3517ec09` retains them. Actual CLI regressions first reproduced five failures
(final, ancestor and dangling output symlinks; external request and proof aliases).
The repaired suite completed with exit 0; red and green captures are
`scratch/NVA-RELEASE-CLI-PATH-REPAIR-2/red.txt` and `green.txt` in the repair
checkout. The output writer preserves ordinary public evidence permissions;
this static-path repair does not claim protection against concurrent hostile
filesystem replacement. Final candidate gates remain outstanding at this checkpoint.

## Completion boundary

These are substantive re-reviews of the earlier nineteen-artifact package,
partitioned into its eight and eleven named artifacts. Partitioning does not
reset QG-13. Further repairs are directly self-verified; a third automatic
Critic round is not implied by a changed task name. Failed native receipts
must not be converted into a passing inventory attestation.

The capability-completion contract separately requires a genuine passing
inventory receipt before activation and the subsequent two-stage reader review.
That receipt is still absent. The new standing-consent implementation is also
outside these named source scopes; these results do not assert its independent
technical review. The local build and delivered-candidate claim remain pending.
