# Alfred WSL intake and continuation — 2026-10-09

This supplements the [interim wrap-up](handover-2026-10-09-interim-wrapup.md).
It records intake and bounded measurements, not a qualified or PO-accepted
0.7.0 candidate. The approved PRD and Spec remain unchanged.

## Windows preparation recovered

The operator's completed snapshot reports identical Windows and WSL HEAD:
`c1cde98afd5b841178f3d4511f9f93fa28064519`. It contains 56,963 copied files:
2,020 identical, 291 different, and 54,652 absent locally; 37 entries were
excluded. The absent set contains 412 evidence files and 54,240 scratch files,
mostly old repository copies and test fixtures. The snapshot is isolated under
`scratch/windows-intake/2026-10-09T08-50-21.803Z-212716/`; it is working storage,
not a replacement for durable evidence. No bulk restore was applied.

The only tracked Windows delta is `project/pipeline-state.json`, recording a
consumed checkpoint-push proof and pending audit write. Its captured patch was
preserved, not applied to the WSL lifecycle or reused for a future push.

All 36 differing root dispatch records have equal `outcome`,
`outcomeClassification` and `commits` fields in the snapshot and the restored
local files. This bounded comparison does not assert byte-identical reports,
successful delivery, or complete review of every raw log.

Reuse the existing LE-F2 commit, parked MECH-HAIKU patch, tranche-2 GREP-PUSH and
CRITIC-CKPT post-images, and committed ONB/WIN-HARDEN RED pins. The wrap-up's
late-return corrections supersede earlier completion claims.

## Durable evidence requirement

The PO requires important evidence to survive Git transfer. The existing M1
migration in [the ADR-0085 removal note](../design/adr-0085-removal-2026-10-08.md)
already addresses this for the approved package. Its four bound files are
restored byte-identically at their original paths and tracked there by M1 commit
`10e146f033c9455bc6d6eb86d008f2743eb9c6b5`:

| Original path below `evidence/design-course/sprint-alfred-epic/` | SHA-256 |
| --- | --- |
| `r5d.package.json` | `539629da3e3208d2c3cb2c1ffc16dffe3b4d8b956ec049e8007aadf28b50faa7` |
| `r5d.readiness.json` | `2d93d4871098bc255e2d5851c5a76bdd71a11cdad194abb07952c611da87a853` |
| `claude-r5d.failure.json` | `85400f4172236afe175790c06bf0689bf11a7cc8420af8a1dd74eae48d16f324` |
| `claude-r5d.initial.json` | `1502f9982f9c6ac9961f7cc2783c4071b3373dfafc4ee0b8bbed49e7014fc718` |

Tracked copies also exist under `../evidence/design-course-rev5/`. M1 preserves
the recorded original paths, with exact-path `-text` attributes. The
[14-case check](../evidence/wsl-intake-2026-10-09/m1-durability.txt) passed, and a
[fresh checkout](../evidence/wsl-intake-2026-10-09/m1-fresh-checkout.txt) with
`core.autocrlf=true` retains all four hashes and verifies the original signature
without a private course store. Do not relocate or rewrite approved bytes.

The Goldfish returned a successful, uncommitted result. The native host hook
produced no commit or host-observed authorship record; the Coordinator performed
the ordinary exact-path commit with `Commit-Act: orchestrator`. The
[delivery checkpoint](../evidence/wsl-intake-2026-10-09/m1-delivery-checkpoint.json)
preserves this limitation and the returned report. It is not a substitute v4
authorship receipt. Independent review and qualified provenance remain pending.

The root `/evidence/` ignore rule hides durable dispatch provenance as well as
regenerated status. Global `*.log` and `*.jsonl` rules also affect new files in
durable evidence folders. A narrow working proposal passes 19 real-Git ignore
checks but has not been applied. Durable publication still requires explicit
tracking, privacy review where needed, and fresh-checkout resolution; changing
ignore rules alone is insufficient. Keep private runtime state and disposable
fixtures local. Do not import the full snapshot into Git.

## Current approval and continuity

Actual read-only diagnostic against the persisted authority:

Machine-written [approval portability capture](../evidence/wsl-intake-2026-10-09/approval-portability.txt).

- Installed and source `designAdvisoryAdmission` both accept the original
  signature with `mode: approved-workflow-package-signature`.
- Source `verifyFinalDesignWorkflowApproval`, including its explicit rebind
  variant, fails `DWP2-REPOSITORY-IDENTITY` on this transferred checkout.
- The diagnostic leaves State unchanged. A plugin refresh alone cannot repair
  this divergence in the current source. Do not reopen the approved design or
  manufacture private course receipts merely to work around this reader defect.

The installed onboarding driver's earlier empty-output fault is no longer
reproducible; it now returns valid collect-input JSON. Its onboarding read still
requests reopening the design. This remains an unresolved reader defect.
Goldfish/Critic validate preflight and do not execute onboarding, as explicitly
required by the installed pipeline-start skill.

The transferred queue still named `ALFRED-REV5C-AUTHOR-20261007`. Its public
authoring-route record has SHA-256
`24ae419fada9ed6c3dc77f866bac0decf1bb51c87c1b5e63c1bfd75be8e18466`, exactly
the persisted `routeRequestSha256`. The State reader confirms the feature has
been approved and implementing since 2026-10-07. A sanctioned `continuity-cas`
advanced revision31 to revision32, retired that design pointer, and resumed
`dispatch` for the same implementation package/action. Authority, approval,
acknowledgement and retry counters were preserved. No provider-native final was
invented or acknowledged. The native final is unavailable in this transfer.

## Bounded measurements and remaining slices

Measurements below refer to clean `c1cde98af`, tree
`d41928ed0ffd19cf1ef7a6b3641d55a18a2e63a3`, before the continuity-only change.

- LE-F2 language case: 1/1 PASS ([capture](../evidence/wsl-intake-2026-10-09/le-f2-language.txt)). Remaining key shard was interrupted with
  exit130 after more than twelve minutes with a live OpenSSL child; all observed
  capture/test/OpenSSL PIDs were absent afterwards. No complete shard capture
  was produced. This is not a PASS or a normal assertion failure. Separate
  bounded cases remain necessary.
- Existing migration pins: RPM01 and RPM17 RED (`invalid-source`); RPM51 GREEN
  ([capture](../evidence/wsl-intake-2026-10-09/mech-haiku-migration-baseline.txt)).
  The committed v0/v1 fixtures request Haiku/medium. Migration V0_MODELS and
  directRoute, plus the V2 selector schema, do not admit Haiku. These are
  production compatibility gaps, not merely stale expectations.
- RP31 still compares against the old Sonnet/low projection. Keep its test-only
  correction separate from migration fixes. The V2 mechanic registry remains
  Sonnet/low; V3's Claude mechanic cell is Haiku/high, requiring reconciliation
  with the recorded medium decision. Retain historical Sonnet input acceptance.

Full Verify, Security, independent Reader/Critic review, E2E acceptance, map
refresh, architecture adoption, tranche-2 signing and final host tests remain
open. Use the existing living PO list; no push, tag or release is authorized by
this handover. The three linked captures above are promoted byte-identically;
they preserve their original candidate binding. Any further working capture
must likewise be published before it is cited as durable gate evidence.

The stored-signature verifier already uses the portable re-read in current
source. Its eleven existing S1–S11 pins pass on clean `e02641365`
([capture](../evidence/wsl-intake-2026-10-09/stored-signature-current.txt)), including
forged signature, changed source and stale exception denials. The historical
ADR-0085 design inventory and the read-only worker's signature-path statement
are stale on this point. Do not duplicate F2b; the remaining final-reader defect
is the `architecture-design.mjs` repository reader call.
