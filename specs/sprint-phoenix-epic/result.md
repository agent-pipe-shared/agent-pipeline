# Sprint Phoenix append-only Result

This file records package outcomes. It is not a replacement for the PRD, Spec,
acceptance criteria, Product Owner approval, implementation evidence, or final
Epic acceptance. Existing entries are never rewritten; later outcomes append a
new entry.

## Entry 1 — Initial design candidate review

| Field | Value |
| --- | --- |
| Date | 2026-07-26 |
| Candidate commit | `e9f742d1ceeadf6c39b6e67ec149c4d33285b63f` |
| Candidate tree | `c60a03da5383393a529f9d86b1b26ef90ffbecd2` |
| Full Verify | exit 0; exact machine evidence retained |
| Security | exit 0; candidate CLEAN; exact machine evidence retained |
| Independent Critic | FAIL under `functional-equivalent-read-only; OS isolation not asserted` |
| Remote write | none |

The initial fixed candidate did not reach the Product Owner gate. The Critic
reported three blockers and three major findings covering event-chain
completeness, legacy authority readers/expiry, independent privacy review,
recovery command closure, feature-package lifecycle authority, and
machine-bound trajectory evidence. The exact dispositions are maintained in
[design/critic-review.md](design/critic-review.md).

No implementation package is authorized while these findings or the literal
Product Owner plan gate remain open.

## Entry 2 — First independent privacy review

| Field | Value |
| --- | --- |
| Date | 2026-07-26 |
| Candidate commit | `1b7860616c16c3879fc67dd964f1dd48a4a58100` |
| Candidate tree | `374248edea18bea452532771821cf6e669949b9f` |
| Full Verify | exit 0; machine evidence binds the exact candidate/tree |
| Security | exit 0 / CLEAN; machine evidence binds the exact candidate/tree |
| Independent privacy review | FAIL under `functional-equivalent-read-only; OS isolation not asserted` |
| Remote write | none |

The reviewer found one blocker and one major: portable Git files could not
enforce the claimed per-stream access boundary, and personal/pseudonymous
attribution or free-form rationale had no separately erasable storage and
operation contract. The findings are accepted and corrected in the normative
acceptance and architecture documents. A fresh bounded privacy re-review is
required; this failed entry is never rewritten into a pass.

## Entry 3 — First privacy correction re-review

| Field | Value |
| --- | --- |
| Date | 2026-07-26 |
| Candidate commit | `2891205e21f4f3f17e0c94b488c40a7e6fd80ca7` |
| Candidate tree | `0ef439f5f0885ac808b9799717f971a1d257b961` |
| Correction range | `1b7860616c16c3879fc67dd964f1dd48a4a58100..2891205e21f4f3f17e0c94b488c40a7e6fd80ca7` |
| Full Verify | exit 0; evidence SHA-256 `cce4f4b83f0b52e8e58dfc5359bc9743f878060f190752faf212593224fa7e2b` |
| Security | exit 0 / CLEAN; evidence SHA-256 `fd894dba9ffa36b8c29c02c3036f36ffba3275bce29e83709f3f80b14bf06af6` |
| Independent privacy re-review | FAIL under `functional-equivalent-read-only; OS isolation not asserted` |
| Machine trajectory | consistent |
| Remote write | none |

The reviewer found one blocker and two majors: the bound Spec still admitted a
false per-stream confidentiality interpretation, append-only H-AC-06 conflicted
with restricted erasure/key destruction, and five restricted-store files were
outside the bound Spec inventory. All findings are accepted. The next candidate
uses the normative Acceptance matrix to disambiguate Spec §§4.4–4.5, limits
append-only preservation to portable records, and implements the restricted
profile only through already inventoried kernel/ledger files. A fresh privacy
re-review remains mandatory; this failed entry is never rewritten.

## Entry 4 — Final privacy correction re-review

| Field | Value |
| --- | --- |
| Date | 2026-07-26 |
| Candidate commit | `643c7d0623a43333b4597013ba96fa7c5990bdba` |
| Candidate tree | `449465e59ef250d2739140b60e95f0d774474c83` |
| Correction range | `2891205e21f4f3f17e0c94b488c40a7e6fd80ca7..643c7d0623a43333b4597013ba96fa7c5990bdba` |
| Full Verify | exit 0; evidence SHA-256 `540203c7708df1968a24334232e06eca1e5215db28d26b855f33be514600264b` |
| Security | exit 0 / CLEAN; evidence SHA-256 `beeae93bb4229fae2e0004d71aef4dd5208ba038eaa7824c150d4b1e54211059` |
| Independent privacy re-review | PASS under `functional-equivalent-read-only; OS isolation not asserted` |
| Machine trajectory | consistent |
| Reviewer mutation / delegation | none / none |
| Remote write | none |

The reviewer reported no findings and explicitly cleared PHX-PR-01..05, their
fixes, and direct regressions. This entry closes the Phoenix design privacy
gate only. It does not reclassify Entries 1–3, approve the plan, authorize
implementation, or satisfy the comprehensive original-finding re-review.

## Entry 5 — Comprehensive correction re-review, first verdict

| Field | Value |
| --- | --- |
| Date | 2026-07-26 |
| Candidate commit | `4dad856c216e3a55cba658ee1ea9d9752144674a` |
| Candidate tree | `a1f22a2c308a2593b8d03b234078c9bccac14d49` |
| Correction range | `e9f742d1ceeadf6c39b6e67ec149c4d33285b63f..4dad856c216e3a55cba658ee1ea9d9752144674a` |
| Independent comprehensive re-review | FAIL under `functional-equivalent-read-only; OS isolation not asserted` |
| Machine trajectory | consistent |
| Reviewer mutation / delegation | none / none |
| Remote write | none |

The reviewer cleared five of the six original findings and all five privacy
findings, but retained PHX-CR-05 as one major inventory/authority gap: the
architecture's four proposed lifecycle-writer files were outside the bound
Spec inventory while #22 itself had no writer. Phoenix accepted the finding
without waiver and reassigned the entire writer capability to already
inventoried lifecycle state-writer/test and topology-support files. A fresh
re-review is mandatory; this entry does not approve the plan or authorize
implementation.

## Entry 6 — Lifecycle-writer inventory correction re-review

| Field | Value |
| --- | --- |
| Date | 2026-07-26 |
| Candidate commit | `df0387a2b62e85e5cc881e6a41ddff596fe42db3` |
| Candidate tree | `0cfbff6fedd0eb3fcb7b127aca28d362ff71cbc2` |
| Correction range | `4dad856c216e3a55cba658ee1ea9d9752144674a..df0387a2b62e85e5cc881e6a41ddff596fe42db3` |
| Full Verify | exit 0; evidence SHA-256 `308c60512d942956e66efa217cbcecdcf6544d228d02686cd95b5af08150a78f` |
| Security | exit 0 / CLEAN; evidence SHA-256 `8917d5b943fcc7a88eee684d6b99c778384a4368972de866d1125e1be985bf71` |
| Independent re-review | FAIL under `functional-equivalent-read-only; OS isolation not asserted` |
| Machine trajectory | consistent |
| Reviewer mutation / delegation | none / none |
| Remote write | none |

The reviewer accepted the in-inventory writer design but found one sequencing
major: architecture placed writer closure in a package before PHX-0 even
though bound Spec §4.6 makes PHX-0 the first implementation package. Phoenix
accepted the finding and moved writer closure into mandatory PHX-0 slice A,
before the ruleset trust-root slice and every PHX-1..6 package. A fresh
re-review remains mandatory; this entry creates no approval or implementation
authority.
