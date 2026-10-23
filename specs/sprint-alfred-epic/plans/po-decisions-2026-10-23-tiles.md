# PO decisions from the decision tiles, 2026-10-23

Answers to the entries of `po-list-afk-2026-10-22.md`, given by the PO in chat through question tiles after the AFK window.
Each line names the PO list row, the ceremony or item, the decision and the consequence. Nothing here is signed or applied:
protected patches still go through the bundled sitting.

| Batch | Row | Topic | Decision | Consequence |
|---|---|---|---|---|
| 1 | 27 | K1D / C26 private closed-feature release member step | Take C26; D73 E is extended to the private closed-feature release | Sitting applies the C26 pair (protected first, then the test case); raise the `onboarding-continuity.mjs` ratchet (69 lines over); the Critic reads the extra snapshot-admission rule; K1D closes after the sitting |
| 1 | 28 | K8 / C24 `evaluate.mjs` shared onboarding observation | Take C24 | Sitting applies the patch; K8 closes once C21, C22 and C24 are applied and counted green |
| 1 | 24 | K2 / C25 adapter purity split | Take C25 | Sitting applies the protected patch first, then the unprotected one; raise the `guard-maintenance-window.mjs` ratchet by one line; K2 then keeps only row 23 |
| 2 | 29 | K8 GS-1 on `pipeline.user.yaml` | PO rule: "every deadlock must stay repairable by signature in the user repo" (chat wording: "Jeder deadlock muss reparierbar bleiben per Signatur im user repo") | GS-1 on `pipeline.user.yaml` stays liftable by signature: the two Antigravity cases keep expecting the signature route, and the product's `HGO-NARROWER-USER-CONFIG-REFUSED` answer needs a signed-override repair route (protected product patch, K92); the two cases are NOT restated |
| 2 | 30 | K9 supervisor CLI suite | Extend D66 (a) | LWSC01 and LWSC03 to LWSC10 become typed pending cases naming a backlog item, assertions byte-identical; journal-phase design after 0.7.0 (K94, unprotected test file) |
| 2 | 25 | K12 S3 binding refusal choices | Confirm all three | Unjudgeable owner counts as running; unreadable scope only warns; no transitive import closure |
| 2 | 25 | K12 S2 guard default | Build now: the guard enforces overlap refusal without a slice queue and the refusal names the repair directly | Protected diff in `hooks/guard-dispatch.mjs` (K93): default enforce, message names the overlapping paths and the exact repair; new ceremony row |
| 3 | 23 | K2 `measure-tofu-push-e2e` | Option (b): typed, bounded measurement stop at the design-course boundary | The e2e measures up to the ADR-0085 single-review course boundary and stops typed; it names what the Greenfield test measures instead (D63 decision; unprotected test file) |
| 3 | 22 | D75 cancel classes (C19) | Confirm all three | `take-over` carries one `--class` for all freed slices; `checkCancelClass` accepts a class only on a cancelled slice; `unclassified` is read-only |
| 3 | 22 | D75 (A) recon before re-dispatch | Yes, build as a generator check | The briefing generator requires a recon-note reference for a re-dispatch of the same slice after a `wrong-premise` stop and refuses with a repair hint otherwise (needs the C19 classes; protection to be checked; K95) |
| 3 | 21 | Architecture ratchets | Raise in the sitting, one protected-delta step | `architecture/boundary-policy.json` accepted lines are raised to the new counts in the same step as the patches (as `6738a8f8d` did); no splitting before the stamp |
| 3 | 31 | D78 hook default | Row withdrawn: it is already built as a warning (`ff028b6ca`, PO 2026-10-21, refusal with 0.7.1) | No patch; ledger text for K13 corrected |
| 4 | 32 | D93 missing `dispatch-record-ALF-ADOPTION-PROOF.json` | Accept the absence and document it | Nothing is written retroactively; the plan/ledger and the Critic batch name the gap |
| 4 | 32 | `VSA-PRIOR-ENTRY-CHANGED` (`b7c660282`) | Accept as intended | Entered as a decision: the changes to prior verify-suites entries in the signed quality-package import were operator-approved; the Critic batch reads them |
| 4 | 34 | D124 meaning | Typed baseline-only carry as built | Rejected at release Verify, admitted as a typed carry at implementation entry; no protected source change; the pin header is restated to this decision (K96, unprotected) |
| 4 | 34 | D129 provenance-debt scope | Confirm 368 commits (exact stage-0 trailer, admission commit `8e7dce0f4` or ancestor, every changed path under `specs/`) | The note and the AC4 pin stay as committed |
| 5 | 33 | Deferrals: forensics (AC-175), greenfield-comparisons (AC-190), lifecycle-read-scope (AC-209) | Confirm all three as deferred past 0.7.0 (D63 a / D21) | The matrix rows are carried as deferred; the built forensics parts stay documented |
| 5 | 33 | `agy-el01` three fail-open conditions | 0.7.1, as D86 says | Named residual risks; the Critic batch does the D86 security read |
| 5 | 33 | Quick route (`verify.quick`) | After 0.7.0 per ADR-0088 / D69 | The generator keeps reporting "quick route: missing" typed; item stays open with that reason |
| 5 | 33 | Elephant context before/after | Live sessions only; measured in the Greenfield test | Item stays at its stage without a before/after number until then |
| 6 | 16 | Triage `first-enrollment-enters-retirement-before-consent` | Mark as built (pending PO acceptance) | Triage block: built, evidence the 23/23 governance-scope callbacks and continuity 306/306; acceptance in the Greenfield test |
| 6 | 16 | Triage `three-runner-happy-path-with-two-po-approvals` | Keep open: Greenfield acceptance | Acceptance criterion of the Greenfield tests on all three runners |
| 6 | 16 | Triage `codex-wsl-required-advisor-has-no-completable-route` | Keep open: real Codex/WSL run | Host run in the Greenfield test |
| 6 | 16 | Triage `design-generator-repeats-large-source-material` | Built once C18 is applied (follows the C18 decision) | Triage block written after the sitting |
| 6 | 16 | Triage `read-blocks-and-misleading-denial-texts-across-runners` | Decide M7 now (see next rows); stays open for U3 (Windows run) | See M5 and M7 |
| 6 | 16 | M7 credential-read refusal text | Own typed code naming the path as cause and a repair (a human provides the content or releases the path by override) | Protected patch in `lib/guard/evaluate.mjs`; the M7 todo case becomes a plain pass (K97) |
| 6 | 16 | M5 Antigravity native `view_file` of credential files | Secure the native read tools against the same credential check | Protected adapter patch; the AGY adapter test that pins "all read-only tools allowed" is restated (K97) |
| 6 | 15 | AP11 `git show HEAD:<path> -- \| head` | Widen the grammar | Protected grammar patch admitting the bounded `git show … \| head -N` form; the closed grammar keeps every other pipe refused (K98); item `advertised-git-to-head-pipeline-is-refused` closes with it |
| 6 | 13 | Security scan scope | Exclude `scratch/clones` | The scan source is the repository without `scratch/`; re-run on a quiet machine (K99, unprotected unless the scan config is protected) |
| 6 | 11 | CLAUDE.md lines | Take both lines; the wording is delivered at the sitting | The agent may not edit `CLAUDE.md`; wording goes into the sitting notes |
| 6 | 14 | German README box | The Reader course handles it | Finding for the 2+1 Reader course (D140) |
| 6 | 20 | C18 | Apply at the sitting, before C26 | Design-generator pin 13/13 after |
| 7 | 7 | Dirty `project/pipeline-state.json` after a push | The refusals (CPO-FOREIGN-CHANGES, GIT-03) name the working form | Message-only change; no new write right (K100, protected scripts as a held diff where needed) |
| 7 | 8 | MP-04 readback | Sanctioned set/unset readback of `CLAUDE_CODE_SUBAGENT_MODEL` in the Elephant preflight | Plugin script change, no value is printed (K100) |
| 7 | 10 | Stale hooks at start | The installer refreshes the hook snapshots as part of its apply | Installer change (K100) |
| 7 | 1, 2 | Refusal texts: chat-mode `approve-push` with a catalogue (D74), `TRUST-ANCHOR-MACHINE-PLANE-UNAVAILABLE` | Improve both now | (1) a concrete runnable repair, (2) the missing home directory in the message; held as a new ceremony (K100) |
| 1 | 19 | K6 / C28 Critic preimage re-pin | Re-pin at the end, right before the stamp, after the Critic batch | Test stays red until then; the re-pin patch is regenerated from the digests at that moment (never applied earlier) |
