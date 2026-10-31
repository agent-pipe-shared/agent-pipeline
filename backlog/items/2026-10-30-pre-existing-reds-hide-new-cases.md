---
schema: pipeline.backlog-item.v1
id: pipeline.pre-existing-reds-hide-new-cases
type: defect
owner: pipeline
status: open
created: 2026-10-30
priority: P2
release: 0.7.1
sprint: alfred
source: "Elephant observation 2026-10-30, baseline comparisons of the candidate 11 held patches"
done_when: manual
---

# Pre-existing reds hide new cases and make every comparison a name diff

## Evidence

Red on the plain candidate (identical in every baseline clone this session):

1. `plugins/pipeline-core/lib/project-onboarding-v3.test.mjs`: five failing shards in chunk 0 (NVA-R40-PROJDRIFT, the
   seeded push gate, the seeded security gate SECGATE-1, the public onboarding handover with configured verify for
   Codex and for Antigravity). The suite stops after chunk 0, so every case in chunk 1 never runs; the twelve
   reinstall cases RIU-07..12 are proven only in a fast loop.
2. `hooks/guard-push.test.mjs`: 22 failing names (PG09, PG08b, PG10, PG12*, PG13, PG17*, PG26a, PG30, D4a-c), and
   `guard-push-external-ledger` PGXL01/02/04, `guard-push-decision-reference` GPDR01/02, all
   `verify-evidence-not-exact-green`. Held patch R1 (2026-10-31) makes the three named suites green: their allow
   fixtures commit an approved low-rigor state, which waives the publication review as the current rule says. Still
   red, identical to the baseline and of the same fixture class: `guard-push-v2` PGV2-01/06 and
   `guard-push-scratch-advisory` PGSA01..04 (follow-up slice R1b); `worktree-target-binding` WTB002/003 (cause not
   read yet). No hook-level case walks required review, exact-green Verify, a lifecycle-bound Critic and then ALLOW;
   that path is covered only in `critic-verify-lifecycle.test.mjs`.
3. `harness/scripts/pipeline-state.test.mjs` crashes with a TypeError at its line 1252.
4. `project-onboarding-v3-argv-closure` ("mini retains early acknowledgement ..."), `project-onboarding-e2e`
   ("in-process driver ... Codex legacy-advisory approval boundary"), `measure-tofu-push-e2e` (1),
   three-runner happy-path pin (3).
5. `hooks/guard-gate-strength.test.mjs` GST33 (found 2026-10-31 in the N33b downstream sweep): the one shell
   exemption, `scripts/critic-dispatch-preflight.mjs`, is no longer write-free across its import closure. Since
   a31acd0df the preflight imports `evaluateReviewAdmission` from `scripts/check-critic-skip-coverage.mjs`, which
   writes a temp tree for the signed-import parity check and pulls in 362 modules, more than a hundred of them naming a
   write API (`historical-fresh-review-admission`, `pipeline-state`, `project-onboarding-v3`, ...). The exemption's own
   reason ("zero filesystem-write calls") is therefore untrue at the closure level. GST33b caps the accepted
   exceptions at two, so a third exception needs a PO decision; the alternative is a read-only admission module the
   preflight imports instead.

## Wanted

1. Each red is fixed or restated with its intent; the onboarding suite runs every chunk even when one chunk fails.
2. Then RIU-07..12 run inside the full suite once.
