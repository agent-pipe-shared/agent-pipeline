---
schema: pipeline.backlog-item.v1
id: pipeline.candidate-22-open-follow-ups
type: defect
owner: pipeline
status: open
created: 2026-11-09
source: Elephant triage of the Claude and Codex greenfield reports and their loop chapters while building candidate 22; the chain is in specs/sprint-alfred-epic/evidence/held-patches/c22-chain/
sprint: alfred
done_when: manual
---

# Candidate 22: what was built only partly, what was not built, and what the next greenfield must recheck

## Description

Candidate 22 (40 patches, stamp `ef16e1b86`) carries the P0 to P2 findings of the Claude report (CGR-01 to CGR-22) and the cheap loop topics of both reports. This item keeps what stayed open so none of it lives only in chat. Status: implementation complete, PO acceptance pending. No Full Verify and no Critic ran on this state, and none of the close changes has run in a live close.

## PO decisions of 2026-11-09 for the follow-up build (22b)

- **CGF-06:** wire the classifier narrowly. A scanner finding is discounted only when the file carries a known Pipeline schema and the finding lies in a digest field. Everything else keeps blocking.
- **CGF-08:** when the two disagree, the blocking check alone decides the gate. The stored view stays beside it as report-only and open, with its date.
- **CGR-13:** commits stay as they are. The close result and the audit bundle count product and evidence commits separately.
- **CGR-19:** one narrow command moves `repositoryMode` from `local-only` to `remote-tracked`, only with a configured remote. Every other direction stays on the guard-override route.
- **Read grammar:** combined short flags are admitted by checking each flag against the existing list.
- **Stay in 0.7.1:** CGF-16, CGF-24, CGF-25 with CGF-01, CGF-26, CGF-36, the CGR-07 queue, straight-run tests 1, 2, 3 and 5.

## Built only partly

- **CGF-08:** the verdict labels are delivered and the preflight orientation carries one, but Verify does not print them yet. The single architecture projection needs an authority decision on which verdict wins.
- **CGF-03:** the critical profile shows a named notice and the existing exception route. A real Codex CLI session prints the conditional form because the CLI takes no receipt flag. Whether every report producer avoids a stronger word was not checked.
- **CGR-19:** no sanctioned writer exists for `repositoryMode` after onboarding. The notice names the guard-override route.
- **CGR-18:** an unchanged threat model blocks only in the critical profile (`PUSH-THREAT-MODEL-TEMPLATE-UNCHANGED`). Other profiles get a notice.
- **w303:** the acceptance record is appended with an amendment rebind. Open checks come from `--open-checks` plus a standing one. A live close is not proven.
- **LOOP-A1:** a round-trip test is missing for several signature kinds and needs one consumer fixture per kind.

## Measured, not built

- **CGR-13:** evidence commits are bound, so bundling would change a binding.
- **CGF-11:** the actor-label guidance was not built.

## Accepted risk

- **w307:** a single unreachable foreign Antigravity descriptor is inferred as the session's own. It is labelled `inferred-single-antigravity-descriptor` and affects only the status `unavailable`. The `ls-files` probe runs for 4 s after a 4.5 s deadline.

## Recheck in the next greenfield

- **LOOP-A3:** `verifyTestInventory` and `antigravity-native-dispatch-consume.mjs` do not exist in the tree. `FCA-PACKAGE` comes from `lib/feature-close-audit-preflight.mjs`.
- CGF-17 and CGF-18 from the Codex report item.

## Behaviour that stays by design

- **CGR-10:** `catalog-unavailable` is expected outside the Pipeline repository and is labelled, with the rules shown.
- **CGR-09:** the marker punctuation is delivered. "PASS with briefing note" stays a deliberate rule.
- **CGR-03:** the count is the number of files in `binding.unreviewedSourceDelta`.
- **CGR-24, CGR-25, CGR-28, CGR-30, CGR-32:** judged no build. CGR-28 and CGR-30 go with the 0.7.1 export.
- **CGR-08, CGR-11, CGR-26, CGR-33, LOOP-A6, LOOP-A8:** verified, no change needed.

## Build notes

- Patch 40 of the chain was aligned by hand with the applied tree, because the build clone never runs the reader-input sync. A re-export overwrites that edit.
- The chain has three commits with several concerns: `a47bfbd3f`, `6fa9369d0` and `ccfa24643`.
- The Reader-review policy digest changed in this chain, because an evidence-only commit no longer needs its own review round.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** the PO asked on 2026-11-09 for every finding to be secured and worked through, with only very expensive points moved to 0.7.1.
- **Assignment (if accepted):** the PO tile on CGF-06, then candidate 23 or 0.7.1 per the greenfield results.
- **Date:** 2026-11-09
