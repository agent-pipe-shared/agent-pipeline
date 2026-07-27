# Sprint Phoenix independent review record

Status: privacy and comprehensive correction re-reviews passed; Product Owner gate pending

Date: 2026-07-26

## Initial fixed candidate

| Field | Value |
| --- | --- |
| Candidate commit | `e9f742d1ceeadf6c39b6e67ec149c4d33285b63f` |
| Candidate tree | `c60a03da5383393a529f9d86b1b26ef90ffbecd2` |
| Base | `9d1b3dc108eb77629ace5b82002120f5539abd8d` |
| Ruleset | `9d1b3dc108eb77629ace5b82002120f5539abd8d` |
| Assurance | `functional-equivalent-read-only; OS isolation not asserted` |
| Dispatch | paths/refs only; uncontaminated |
| Reviewer mutation | none |
| Verdict | FAIL |

The selected external host-bridge attempt was denied by the environment
approval boundary before a child or export. It was not retried or bypassed.
The Product Owner-authorized functional-equivalent lane then ran one fresh
higher-capability Critic with no chat history, no delegation, and no invoked
write tool. Effective model identity and OS isolation are not asserted.

## Findings and dispositions

| ID | Severity | Finding | Required disposition |
| --- | --- | --- | --- |
| PHX-CR-01 | blocker | Event-digest preimage was undefined and a replaceable head could not prove suffix completeness. | Define the exact domain-separated preimage and require an independently retained candidate-bound checkpoint; prefix-only verification is never gate-capable. |
| PHX-CR-02 | blocker | Direct mutable authority readers were omitted and the dual-read window had no owner/expiry. | Inventory every direct plan/push/deploy/release/override reader, require ledger-first dual evaluation, name the owner, and expire the window. |
| PHX-CR-03 | blocker | Configured privacy review was pending with no independent sign-off target. | Add the complete privacy processing/flow/fixture contract and obtain a separate fixed-candidate read-only privacy verdict. |
| PHX-CR-04 | major | The recovery authority named a command absent from the public operation contract. | Add the closed `governance-event recover` request, authority, journal, pre/postimage, readback, and no-delete contract. |
| PHX-CR-05 | major | Phoenix had no lifecycle manifest and #22 provided no writer. | Add a valid current manifest and make transactional manifest-writer closure the first blocking Phoenix delivery. |
| PHX-CR-06 | major | The supplied design evidence was authored Markdown rather than machine-bound evidence. | Retain exact Verify/Security evidence, pass those files directly on re-review, and record their candidate/tree/hash binding. |

No finding is accepted as residual design debt. Every row must be fixed and
freshly re-reviewed. The initial report also confirmed that no existing test
was weakened, no dependency was added, no private path/secret/raw transcript
was committed, the 145 criteria were unique/contiguous, and all eight live
issues remained in scope.

## Re-review contract

The correction re-review receives only the corrected fixed diff, this prior
finding record, the normative Spec, calibration/governance paths, exact
machine Verify/Security evidence, and the required assurance metadata. It
checks only these findings, their fixes, and direct regressions.

## Independent privacy review — first verdict

| Field | Value |
| --- | --- |
| Candidate commit | `1b7860616c16c3879fc67dd964f1dd48a4a58100` |
| Candidate tree | `374248edea18bea452532771821cf6e669949b9f` |
| Contract | `design/privacy-review.md` |
| Assurance | `functional-equivalent-read-only; OS isolation not asserted` |
| Dispatch | paths/refs only; uncontaminated |
| Reviewer mutation | none |
| Machine trajectory | consistent; exact Verify/Security candidate binding confirmed |
| Verdict | FAIL |

The privacy reviewer reported:

1. **PHX-PR-01 / blocker:** ordinary repository/Git reads bypassed the
   claimed per-stream access policy because the three canonical streams were
   ordinary files in one repository.
2. **PHX-PR-02 / major:** immutable portable human records could include
   personal/pseudonymous attribution and free-form rationale, while the
   operation and implementation inventory had no erasable restricted store,
   deletion, or key-destruction contract.

Both findings are accepted without waiver. The corrected design now:

- declares Git to be one coarse repository-wide access/retention trust zone,
  and describes the query service only as the sanctioned semantic source;
- admits portable records only when the complete bytes are proven
  `repository-public-safe`, non-personal, and compatible with repository
  retention;
- rejects natural-person identifiers, joinable pseudonyms, free-form
  rationale, uncertain contextual identifiability, and finite-erasure or
  narrower-access requirements before any portable temporary/final file;
- defines a separately protected machine-local profile for the complete
  restricted event, with no portable counterpart or join handle;
- closes the restricted schema/store/CLI inventory and exact
  expiry/erase/key-destruction/readback/limitation tests.

A fresh privacy re-review receives only the privacy correction diff, this
prior finding record, configured governance paths, and exact machine evidence.
It checks PHX-PR-01/02, their corrections, and direct regressions.

## Independent privacy correction re-review — second verdict

| Field | Value |
| --- | --- |
| Candidate commit | `2891205e21f4f3f17e0c94b488c40a7e6fd80ca7` |
| Candidate tree | `0ef439f5f0885ac808b9799717f971a1d257b961` |
| Correction range | `1b7860616c16c3879fc67dd964f1dd48a4a58100..2891205e21f4f3f17e0c94b488c40a7e6fd80ca7` |
| Assurance | `functional-equivalent-read-only; OS isolation not asserted` |
| Reviewer mutation | none |
| Machine trajectory | consistent |
| Verdict | FAIL |

The correction re-review accepted neither an ambiguity nor an inventory
exception:

1. **PHX-PR-03 / blocker:** bound Spec §§4.4–4.5 could still be implemented as
   independent per-stream access/retention plus an exclusive read boundary,
   contradicting the repository-wide Git trust-zone correction.
2. **PHX-PR-04 / major:** H-AC-06 required every authority decision to remain
   unchanged and gain an appended disposition, but restricted records require
   expiry, erase, and key destruction.
3. **PHX-PR-05 / major:** the architecture added five restricted-store files
   outside bound Spec §7, even though that Spec requires an update before
   dispatching any unlisted implementation file.

All three findings are accepted without waiver. The second correction:

- makes A-AC-12 the explicit normative interpretation of Spec §§4.4–4.5:
  independent policy means capture and downstream projection choices within a
  storage profile, while “sole read boundary” is semantic rather than physical;
- scopes H-AC-06 and architecture G-4 append-only preservation to
  `repository-public-safe` records, with restricted expiry/erase/key
  destruction, sanitized non-correlating receipts, and fail-closed dependent
  authority;
- removes every out-of-inventory restricted-store file and assigns the
  restricted profile only to the event envelope, capture policy, human
  decision schema, event store, `governance-event` CLI, tests, and
  documentation already listed in bound Spec §§7.3–7.4.

The next privacy re-review is bounded to PHX-PR-01..05, these corrections, and
direct regressions. No prior failed entry is reclassified as a pass.

## Independent privacy correction re-review — final verdict

| Field | Value |
| --- | --- |
| Candidate commit | `643c7d0623a43333b4597013ba96fa7c5990bdba` |
| Candidate tree | `449465e59ef250d2739140b60e95f0d774474c83` |
| Correction range | `2891205e21f4f3f17e0c94b488c40a7e6fd80ca7..643c7d0623a43333b4597013ba96fa7c5990bdba` |
| Verify evidence SHA-256 | `540203c7708df1968a24334232e06eca1e5215db28d26b855f33be514600264b` |
| Security evidence SHA-256 | `beeae93bb4229fae2e0004d71aef4dd5208ba038eaa7824c150d4b1e54211059` |
| Assurance | `functional-equivalent-read-only; OS isolation not asserted` |
| Reviewer mutation / delegation | none / none |
| Machine trajectory | consistent |
| Verdict | PASS |

The fresh Critic reported no findings. It deliberately cleared:

- PHX-PR-01/03 through the Acceptance matrix's normative interpretation of
  Spec §§4.4–4.5;
- PHX-PR-02/04 through portable-only append semantics plus restricted
  expiry/erase/key-destruction and fail-closed reconstruction;
- PHX-PR-05 through ownership solely in Spec §§7.3–7.4 inventory files;
- direct scope, test-integrity, failure-path, security, dependency, language,
  governance, and lifecycle-hash regressions.

The pass satisfies the design privacy gate only. The initial broad Critic's six
findings still require one comprehensive correction re-review before the
Product Owner gate.

## Comprehensive original-finding correction re-review — first verdict

| Field | Value |
| --- | --- |
| Candidate commit | `4dad856c216e3a55cba658ee1ea9d9752144674a` |
| Candidate tree | `a1f22a2c308a2593b8d03b234078c9bccac14d49` |
| Correction range | `e9f742d1ceeadf6c39b6e67ec149c4d33285b63f..4dad856c216e3a55cba658ee1ea9d9752144674a` |
| Assurance | `functional-equivalent-read-only; OS isolation not asserted` |
| Reviewer mutation / delegation | none / none |
| Machine trajectory | consistent |
| Verdict | FAIL |

The fresh comprehensive Critic cleared PHX-CR-01 through PHX-CR-04,
PHX-CR-06, PHX-PR-01 through PHX-PR-05, and every direct scope, privacy,
security, dependency, language, test-integrity, machine-evidence, and
lifecycle-hash regression. One major finding remained:

- **PHX-CR-05R / major:** bound Spec §7.10 assigned `lifecycle.json`
  creation/update to the `#22 lifecycle writer`, but #22 shipped no mutating
  writer and the architecture had introduced four writer/CLI files outside
  the Spec's closed implementation inventory.

The finding is accepted without waiver. The correction does not edit the
bound Spec and does not introduce another implementation file. It defines
`#22 lifecycle writer` as the missing capability over #22's existing
unmodified topology validator/planner and assigns its transactional
inspect/plan/apply/status/recover surface exclusively to the already
inventoried `harness/scripts/pipeline-state.mjs` and
`harness/scripts/pipeline-state.test.mjs`, with topology/document/Verify
support only in the already listed Spec §7.1 files. Acceptance P-AC-08 makes
this inventory binding normative. A fresh bounded re-review must clear
PHX-CR-05R and direct regressions; this FAIL is never rewritten as a pass.

## Lifecycle-writer inventory correction re-review — first verdict

| Field | Value |
| --- | --- |
| Candidate commit | `df0387a2b62e85e5cc881e6a41ddff596fe42db3` |
| Candidate tree | `0cfbff6fedd0eb3fcb7b127aca28d362ff71cbc2` |
| Correction range | `4dad856c216e3a55cba658ee1ea9d9752144674a..df0387a2b62e85e5cc881e6a41ddff596fe42db3` |
| Verify evidence SHA-256 | `308c60512d942956e66efa217cbcecdcf6544d228d02686cd95b5af08150a78f` |
| Security evidence SHA-256 | `8917d5b943fcc7a88eee684d6b99c778384a4368972de866d1125e1be985bf71` |
| Assurance | `functional-equivalent-read-only; OS isolation not asserted` |
| Reviewer mutation / delegation | none / none |
| Machine trajectory | consistent |
| Verdict | FAIL |

The fresh higher-capability Critic accepted the Spec-file inventory
correction, transaction/recovery semantics, test matrix, governance
disposition, lifecycle hashes, and exact Verify/Security trajectory. It
retained one major direct regression:

- **PHX-CR-05S / major:** architecture made writer closure a separate package
  before PHX-0, while bound Spec §4.6 makes PHX-0 the first implementation
  package. That admitted a Spec-bound PHX-0 dispatch before the architecture's
  blocking prerequisite and created contradictory sequence authority.

The finding is accepted without waiver. The correction keeps Spec §4.6
unchanged and makes writer closure the mandatory first ordered slice of the
single PHX-0 package. The PHX-0 ruleset-trust-root slice cannot start until
writer Verify/Critic passes, and PHX-1..6 cannot start until PHX-0 completes.
Acceptance P-AC-08 carries the same normative sequencing. A fresh bounded
re-review must clear PHX-CR-05S and direct regressions; this FAIL is never
rewritten.

## PHX-0 sequencing correction re-review — final verdict

| Field | Value |
| --- | --- |
| Candidate commit | `49c1a167c70a83e7e45422ee4407bfd8293d387d` |
| Candidate tree | `2d2990bb98d4ed98bca527ddd1019155213d8cd4` |
| Correction range | `df0387a2b62e85e5cc881e6a41ddff596fe42db3..49c1a167c70a83e7e45422ee4407bfd8293d387d` |
| Verify evidence SHA-256 | `9e5160d9e4375dc529886b31f48988a90b5ccae84e40fa69a3b6c53c0e19787d` |
| Security evidence SHA-256 | `30bf538b1deed29dacc76337e9456aaebd647a53814508b8fbc69dfc13ddae18` |
| Assurance | `functional-equivalent-read-only; OS isolation not asserted` |
| Reviewer mutation / delegation | none / none |
| Machine trajectory | consistent |
| Verdict | PASS |

The fresh higher-capability Critic reported no findings. It explicitly cleared
PHX-CR-05S: writer and trust-root work are ordered slices A/B of one PHX-0
package, PHX-1 is gated on complete PHX-0, Spec §4.6 remains coherent, and
P-AC-08 supplies the normative slice-level constraint. It also cleared direct
scope, test-integrity, failure-path, security, dependency, language,
governance-policy, lifecycle-hash, and machine-evidence regressions.

This PASS closes the comprehensive Phoenix design Critic course gate. It does
not rewrite any prior FAIL, establish native OS isolation or effective model
identity, approve the plan, authorize implementation, or perform a remote
write.

## External-handoff design revision review — corrective verdict

| Field | Value |
| --- | --- |
| Candidate commit | `5eb98b99665bb074242d4084bec4839186fd08d5` |
| Candidate tree | `2a322ca16a7cce1658dcd67e066da90acd360035` |
| Correction range | `60369c766ddc940925a3eeccc93819423c9d7541..5eb98b99665bb074242d4084bec4839186fd08d5` |
| Assurance | `functional-equivalent-read-only; OS isolation not asserted` |
| Reviewer mutation / delegation | none / none |
| Machine trajectory | inconsistent: exact Security was clean, aggregate Verify failed |
| Verdict | FAIL |

The fresh independent Critic found three unwaived corrective items:

1. **Blocker:** the exact-candidate aggregate Verify failed because the
   Recovery record linked a Git-ignored local evidence artifact. Therefore the
   candidate had no passing aggregate-gate evidence.
2. **Major:** the canonical handover said that only Product Owner approval
   remained, while valid Continuity revision `5` named `review` and Recovery
   required fresh review before a renewed Product Owner gate.
3. **Major:** R-13 did not bind its earlier blocking Security observation to
   an exact candidate or artifact identity, while the supplied exact-candidate
   Security evidence was clean.

No finding is waived. The correction removes the untracked Markdown target,
reconciles the handover to the persisted review action, and records the two
Security observations by exact candidate without inferring a product defect or
adding a speculative Security implementation scope. A fresh Critic must review
the corrected exact candidate and the new aggregate evidence before a renewed
Product Owner plan gate.
