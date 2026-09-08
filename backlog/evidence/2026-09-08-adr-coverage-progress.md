# ADR coverage progress — 2026-09-08

At commit `b9460f7f5870fb16d235aa71e3396fae553f9e0d`, the numbered corpus
contains 80 ADRs: 75 accepted, 3 superseded/historical, 1 provisional and
1 proposed. Nineteen accepted ADRs declare Governs paths; 56 do not yet.

The previous 74-accepted denominator was incorrect. Its status heuristic
classified ADR-0062 as draft because explanatory text says accepted as drafted.
The replacement inventory reads normative content before reference translations,
supports inline and section status forms, and keeps ADR-0017/0022/0031 as
superseded, ADR-0021 provisional and ADR-0039 proposed.

All 80 source hashes were checked against the actual files, and git confirmed
the ADR tree matches the named commit. The full compact inventory includes
status, category, source hash, Governs globs and matched tracked-path count in
`scratch/NVA-B-ADR-COVERAGE-STATUS-2/source-hash-rows-final.json`. Its SHA-256 is
`66824c4496ff05b38b07f59a1b4f6c1a17810e6171a5ad21d5c56da758befc60`.
Binding readback: `scratch/adr-inventory-bound-20260908.json`.

The first seven additions are ADR-0070, 0050, 0052, 0053, 0001, 0002 and
0011. Their evidence files explain exact owning paths and residual exclusions;
parser/body checks prove no accepted decision text was rewritten. A declared
path hit is not a claim that every implementation obligation of an ADR is
complete or that all its relevant paths have been discovered.

An independent isolated Git fixture exercises actual reconciliation for the
new ADR-0050 declaration. Missing, uncommitted, stale and unrelated records
are rejected; only the committed descendant record for the exact candidate
passes. See `backlog/evidence/2026-09-08-new-adr-coverage-reconciliation-proof.md`.
This acceptance test does not stand in for final source-candidate reconciliation.

Queue item 12 remains incomplete. Continue precise coverage of the 56 accepted
uncovered ADRs, retain explicit historical/provisional/proposed exclusions,
and finish source-candidate reconciliation before claiming coverage complete
or depending on it for reader-review release binding.
