# W7-R5 -- notes (state: HELD, canon text, built by the Elephant in a scratch clone)

Candidate `7162905db`. Patch: `w7-r5-canon-budget-checkpoint-grant-and-resume.patch` (3 files, `git apply --check` exit 0 on a plain clone). Backlog item: `2026-10-29-a-budget-checkpoint-is-resumed-with-a-grant-not-redispatched.md`, rung R5.

## What it changes (text only)

- `roles/elephant.md` and its byte-identical plugin twin `plugins/pipeline-core/roles/elephant.md`, rule EL-25a: the standard procedure in four steps (plan the grant in the package through `budgetRationale`; a checkpoint is resumed with a recorded grant of up to 30 calls and `SendMessage` to the SAME agent, grants repeatable without a lifetime limit; a successor dispatch only for a new vertical outcome or, with a typed reason, a lost or cornered agent, never as budget recovery; never commit a checkpoint under the original trailer to release the reservation and then re-dispatch) and the lived example in the `Why` (seven successor dispatches for one outcome, 2026-10-29). EL-13b is unchanged and still the cross-reference.
- `plugins/pipeline-core/skills/pipeline-start/references/workflow-dispatch.md`: a new section "A budget checkpoint is resumed with a grant, not re-dispatched" with the grant command, the resume message rule and the typed successor reasons.

The wording matches what is built or pending: the 80/160 base caps, repeatable grants and resume-first (installed), the typed reasons, and the generator refusal of an estimate above the cap without `budgetRationale` (D193, held patch `w7-d193-tier-is-refused-not-raised-above-the-cap`; the sentence is correct once that patch is applied).

## Checks (scratch clone)

- `check-section-citations.test.mjs`, `pins/elephant-main-context-spent-on-wake-ups-and-inline-reads`, `pins/critic-round-cap-and-delta-scope-are-not-enforced` and `pins/agy-el01-write-authorization-gap`: exit 0.
- `harness/scripts/generate-vendored-canon.test.mjs` fails three cases (AC-1, AC-1b, AC-7) both on the baseline and with the patch, with the same stale files: `plugins/pipeline-core/roles/critic.md`, `plugins/pipeline-core/docs/adr/0014-critic-contract.md` and `plugins/pipeline-core/docs/push-release-flow.md`. This drift is NOT caused by the patch (the Elephant role twin is byte-identical to its original after the edit); regenerating the vendored canon (`node harness/scripts/generate-vendored-canon.mjs`) is a separate act that this patch does not do.

## NOT in this patch

- R1 (generator warns or refuses a fresh package over a checkpointed owner), R2 (guard refuses a fresh dispatch over a checkpointed owner unless a typed successor reason is given) and the "no deadlock" test case ("ceiling reached, restart requested, accepted") are NOT built; they need a reader for the checkpointed-owner state. R3 (the checkpoint notice names the grant and resume route) is installed; R4 is largely covered by D193.
- Full Verify, batch Critic and PO acceptance remain pending. Canon and kernel-listed role files: the PO applies it in the same ceremony.
