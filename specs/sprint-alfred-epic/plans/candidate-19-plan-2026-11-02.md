# Candidate 19 plan (opened 2026-11-02, after the Full Verify 5 of candidate 18)

Status: working list, ordered by what can start without the PO. The topics and their reasons are in `candidate-19-seed-2026-11-02.md`; this file tracks the work. Candidate 18 is closed on the Elephant side (Full Verify 5: 4 red, all open by design, no real finding). The PO runs the greenfield tests of candidate 18 in parallel; their findings are added here as they arrive.

Method: the held-patch route of candidate 18 (clone slices under `scratch/`, `wNN-*.patch` + notes + check test, one PO apply script `po-apply-0.7-candidate19.sh`, derived-files refresh as the last step of that script, stamp after the apply). Numbering continues at w115. Elephant builds small items directly (PO exception, valid for candidate 18 only; for 19 the rule is re-confirmed or dispatch via the pipeline Goldfish agents).

## A. Can start now (no PO decision needed)

| ID | Item | Source | State |
|---|---|---|---|
| A1 | Case-completion tools `run-cc` / `cc-sync` in `scripts/clone-slice/` + `docs/operating-tools.md` entry | seed, Full Verify observations | done, `6e93f0350` (no derived-files refresh yet, see end note) |
| A2 | A suite that declares more case ids than its effective policy must fail in a normal run, not only in the Full Verify. Design question first: the declared ids exist only at run time (`registerTestCaseCompletion` cases), so a static registry check cannot see them; options are (a) `registerTestCaseCompletion` compares its ids with the effective policy when no descriptor is announced, (b) a light registry check that runs each required suite's declaration step, (c) a post-run check in `verify.mjs` | seed | built as the pre-stamp tool `scripts/clone-slice/cc-changed.mjs` (`8a8982ac2`): maps the changed test files to their Verify suites, runs `run-cc` for each, lists unregistered test files. Option (a)/(c) (a check in the normal run) stays open |
| A3 | Make `g23-read-help-tests` (case G23C001, `ls -lh ../`) and `agy-item-delivery-tests` independent of the clone location (green below the home directory), or skip with a stated reason | open-by-design reds of 18 | held as w115 (causes measured: agy fixtures five levels up = home / unwritable `/home`; g23 relied on credential-named files in the repository's scratch folder). Green in two clone locations; Full Verify run open |
| A4 | Full Verify keeps bounded logs of red suites in the run record | seed | held as w119 (`logs/<id>.red-excerpt.log`) |
| A5 | Full Verify resume from the progress journal | seed | held as w119 (`full-verify.mjs --resume`, `PIPELINE_VERIFY_RESUME_RUN`); the chained resume is untested |
| A6a | G8 / A18-M5: remedy text on the `prepare-push-subject` path | state.md deferred list | no patch needed: checked 2026-11-02, `pipeline-state.mjs` `prepare-push-subject` already prints the `materialize-push-threat-model` remedy for `CRITICAL-PROOF-BOUND-ARTIFACT-UNAVAILABLE` (as `approve-push` does), and w93 lists the action before the Close commit, which answers the PO question |
| A6b | G1 authorize-critical builder for deploy, publication and release-preflight kinds | state.md deferred list | large (catalog migration): pipeline Goldfish; slice `C19-G1-AUTHORIZE-CRITICAL-BUILDERS-2` delivered/running (result is committed as w122 when verified) |
| A6c | C18-5 pre-granted allowlist rule for the second approval gate | state.md deferred list | PO decision, not built: it changes runner permission settings (what a runner may pre-grant), which is a trust boundary and not the Elephant's call. Recommendation: allow-list only the read-only `inspect`/`prepare-*` calls |
| A6d | C18-12 `--plan` dry run for the readiness reviewer's scope advice | state.md deferred list | held as w116, in another form: no new CLI mode; the existing draft inspection (run at present-plan/submit-plan) now applies the same scope rule, so the refusal comes before the first signature. RED/GREEN case; related pins green; `project-onboarding-e2e` and `pipeline-state` not yet run |
| A6e | C18-6 rest: `heal` defers the retirement while a member is armed (tests encode the opposite, restate under QG-04) | state.md deferred list | held as w118 (Goldfish; `heal` defers the retirement while any producer is in flight; two cases restated under QG-04) |

## B. Needs a PO decision before it starts

| ID | Item | Decision needed |
|---|---|---|
| B1 | Ponytail best practices for the Goldfish (seed section 1) | PO 2026-11-02: logic yes, wording never; own definition. Still open: (1) where the rendered paragraph lives (Elephant recommendation: canonical rule in `roles/goldfish.md`, short paragraph rendered by the briefing generator, conditional on the task kind); (2) a bloat finding class for the Critic (recommendation: yes, narrow and evidence-gated; bundle with the PO's pending Critic pin re-pin). Built as opt-in w120 (`roles/goldfish.md` GF-10, Critic search item "unrequested addition") and w121 (a `smallestChangeParagraph` in the briefing generator); applied only with `APPLY_LEAN_RULE=1`; effect unmeasured |
| B2 | Work split | DECIDED (PO 2026-11-02): small items the Elephant builds itself, large ones via the pipeline Goldfish agents |

## C. From the greenfield tests of candidate 18

The written report is not there yet; first oral observations (PO 2026-11-03), same on all three runners (Claude, Codex, Antigravity):

| ID | Severity | Observation | Elephant reading (measured in the source 2026-11-03) |
|---|---|---|---|
| C19-G1 | major | The runners do not use a design driver that leads them step by step through the design phase; all three maneuver themselves into locks and then search for commands | Corrected after reading the source: a driver exists. `pipeline-state.mjs inspect` publishes a structural `nextAction` for `draft` -> `awaiting-approval` -> `approved` -> `implementing` (`buildInspectNextAction`; the `draft` step derives `--by` and `--profile` from onboarding, NVA-Q2-DRAFTDERIVE) and the close has `close-coordinator.mjs drive`. What is missing is not known without the runners' transcripts: either the runners do not call `inspect` before acting, or `nextAction` does not cover the steps where they get stuck (an edit on a bound document, `reopen-design`, rebind, the readiness review). To measure from the PO's report/transcripts: which command each runner ran at the first refusal, and what `inspect` printed at that moment. Candidate fix after that: make the refusals themselves (`GUARD-LIFECYCLE-AUTHORITY-BOUND` and neighbours) carry the `inspect` call as their typed retry action, and extend `nextAction` to the uncovered steps |
| C19-G2 | major (core issue) | The early binding of PRD/Spec produces the sequences: after `bootstrap-bind-apply` / `kickoff promote apply` the PRD, Spec and `design-input.md` are the bound authority documents (`continuity.authority.prd/.spec`), a direct edit is refused with `GUARD-LIFECYCLE-AUTHORITY-BOUND`, and the sanctioned route is `reopen-design --by <name>`, edit, `submit-plan --by <name> --profile ...`, `approve-plan --by <name>`; every `--by` must be a name the PO supplied (EL-36), so the agent cannot walk it alone | PO question: bind hard only in the step where the signature for the real release comes, not earlier. Analysis below |
| C19-G3 | major | Claude saw a drift after the bound documents changed and concluded it was blocked and wanted to stop; the drift would have gone away by itself with a plain `submit-plan` (PO 2026-11-03) | Measured in the source: when the continuity observation fails the session gets `continuity-observation-unavailable` with `nextAction: null` and the diagnostic "no cause is established here ... inspect read-only" (`lib/project-onboarding-v3.mjs`, the `continuity.status !== "valid"` branch). The cause IS known to the observer (`observeDetailed` in `lib/onboarding-continuity.mjs` holds the `KickoffError` code, e.g. `KICKOFF-PROMOTION-AUTHORITY-DRIFT`, and `classifyOnboardingContinuity` drops it). A drift of an edited, un-reopened bound document therefore reads as a dead end. Fix: carry the cause code to the diagnostic and, for the drift codes, name the two typed exits (`submit-plan --by <name> --profile <p>` rebinds; `authority-restore restore` returns the approved bytes) and put the first into a typed `nextAction`; the same sentence in the `GUARD-LIFECYCLE-AUTHORITY-BOUND` refusal text ("the design lock engages") which today names only restore; `inspect` should also state "drift is not terminal". Rule for all refusals: a state that a typed command lifts must never be worded as a block. Larger than a small item (continuity shape is digest-pinned): pipeline Goldfish, deep tier |

### C19-G2 analysis: bind late (draft, then seal)

Today two things are tied together that need not be: the bind at the end of onboarding (digests of PRD, Spec and design-input written into `continuity.authority`) and the approval (PRD release, EL-19). The approval signature already covers the exact bytes it releases. The early bind therefore protects nothing nobody relies on yet; between bind and approval it only costs: a lock on files that are still being worked on.

Proposal: two states of the design package. `draft`: the paths are registered in State, no digest bound, normal edits admitted (the credential and provenance rules stay; `design-input.md` stays immutable once captured). `sealed`: one agent-prepared, digest-bound step binds the digests in the same transaction as the approval, so the PO signs one thing. After the seal everything stays as today (lock, `reopen-design`, rebind).

Consequences:
- Gain: no lock trap before the approval, one ceremony instead of two, the runner needs no knowledge of the rebind sequence.
- Cost: the bound digests are read in about 70 files (continuity observation, readiness review, design advisory, Critic preflight, close, guard tripwire). Each reader needs a defined behaviour for a package without digests ("not yet sealed"), the drift detectors must tolerate a draft, and readiness reviews and advisories must bind the digest of the version they read (so a later edit makes them stale, which is the same invariant as today). Projects already bound need a migration (sealed stays sealed).
- Risk: between bind and approval the guard no longer protects the files; the protection moves to the review and approval digests. This is a trust-model statement and needs an ADR (EL-04) and the PO's decision.
- Not a small patch: do not squeeze it into the end of candidate 19 without a design review.

Recommendation: (1) now, in 19, the cheap relief that also answers C19-G1: a design-phase driver plus, while no approval exists yet, a single agent-executable `design-amend` step that hides reopen, edit window and resubmit from the runner (needs a decision on the `--by` label for unapproved drafts, since no human act is being replaced before the first approval); (2) the late binding as a drafted ADR with an independent review, built in 19 only if the review is positive, else 0.7.1. Greenfield transcripts of the three runners are needed to see which exact refusals they hit; the PO's report is the source.

Status 2026-11-03: the cheap relief for G3 is held as w117 (cause named, "not terminal", both exits). The late binding is drafted as `docs/adr/draft-late-binding-of-prd-and-spec-at-the-approval.md` (proposed, not built, `cb915f3d4`); it needs an independent review and the PO's decision. G1 (design driver) stays open: `nextAction` is unchanged by w117; the runners' transcripts are still needed.

C19-G4 (minor, found while building candidate 19): a Goldfish dispatched on the clone-slice route cannot land its host commit (`NGHF-PENDING-UNAVAILABLE`, `NGHF-COMMIT-EXCEPTION`); the Elephant verifies the three deliverable files and commits them itself. Not a defect of the delivered work; record for the dispatch tooling.

## Order of work

A3 and A2 first (both remove noise from every future Full Verify), then A4/A5, then A6, then B1 when decided. Greenfield findings jump the queue by severity.

## Full Verify 6 on the applied state (2026-11-03)

Clone below the home directory with an `upstream` remote, built by rehearsing `po-apply-0.7-candidate19.sh` (default, without the lean rule) from HEAD `b61d60a87`; 1154 steps, 6565 s, 4 red. Rerun alone, one at a time:

- `codex-pretool-guard-tests`: green alone (272 s); red only inside the full run, so load.
- `g23-read-help-tests`: green alone (4 s), red in the full run with `VERIFY-CASE-COMPLETION-DECLARATION`: the suite declares G23C001 to G23C004 (G23C004 came with C18-8), its policy in `harness/verify-suites.json` listed three ids. A real finding, fixed by w125 (one line, applies after w124, rehearsed clean). Measured with the real parser on the recorded stream: without G23C004 rejected (`VERIFY-CASE-COMPLETION-DECLARATION`), with w125 accepted. Not re-run as a whole Full Verify; `run-cc.mjs` does not read `verify-suites.json` policies (tool follow-up).
- `codex-isolated-critic-protected-preimage-tests`: red, open by design (PO re-pin; never re-pinned by the Elephant).
- `security-scan`: red, `remote-ambiguous` with two remotes in the clone; open by design (run with `--remote upstream`).

One real finding (g23), one patch (w125). Not covered by this run: main-tree checks, batch Critic (paused), native Windows runs, real Codex/Antigravity runs, hook activation on a real promotion, parallel host commits in a real run, PO acceptance.

## PO decisions after the apply (2026-11-03)

Candidate 19 is applied (`4924916bf`; w120/w121 not). Decisions: GF-10 is measured on two or three past slices before any adoption; the late-binding ADR gets an independent review, then the PO decides; C18-5 (pre-granted allowlist) is not introduced; next is waiting for the greenfield reports, with no stamp and no main-tree Full Verify until they are in. The GF-10 measurement and the ADR review are queued preparation, not started.

## End note: derived files

Adding or removing a script, suite or skill drifts the inventory baseline and the Reader inputs (`node scripts/refresh-derived-files.mjs --check` reports `inventory-baseline: DRIFT` since A1). The refresh touches `plugins/pipeline-core/` and is therefore part of the PO apply script (last step), not a separate commit by the Elephant.
