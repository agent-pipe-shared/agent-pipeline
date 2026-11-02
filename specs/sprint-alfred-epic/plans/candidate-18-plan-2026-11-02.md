# Candidate 18 plan (written 2026-11-02, at the PC transfer after candidate 17)

Candidate 17 (runner neutrality across Claude, Codex and Antigravity, plus the first consumer-run findings) is delivered as held patches w48 to w73 and one apply script,
`specs/sprint-alfred-epic/evidence/held-patches/po-apply-0.7-candidate17.sh` (run from the repository root with `bash`; header lines list every step). Everything below is what
candidate 17 did NOT contain, in the order to take it up on the next machine. State and decisions: `docs/state.md`. This file is the plan, not the record.

## Decisions already taken by the PO on 2026-11-02

- The runner capability table appears in the start preflight readback as a pointer only (schema and reader script), not as the table. Built as w72.
- The close orchestration is a helper or driver in the spirit of the onboarding driver: it simplifies the flow and replaces none of the running commands. Built as w73 (`close-coordinator.mjs drive`).
- Content commits after the last Critic round only warn at the freeze (w48 stays as built).
- Antigravity may implement natively, built "with labelled assumptions": the draft below, NOT finished and NOT part of candidate 17.

## Consumer findings to take up FIRST (PO instruction 2026-11-02: all majors and blockers of the fifth Claude greenfield run)

Source: the run's own pipeline analysis (one Claude Code session as Elephant plus 13 subagents, native Windows, 4.5 h work time, 6 h PO wait, pipeline version not evidenced because of `DBG-RULESET-FALLBACK`).
The report stays in the consumer repository; its evidence is carried here (no consumer name or path in this repository). The analysis is by the same Elephant that ran the work, so its judgements are not independent;
its codes and counts come from the transcript. Measure from the consumer's own stop-failure and dispatch records before changing code.

| # | Class | Finding | Evidence | Direction |
|---|---|---|---|---|
| C18-1 | blocker (this is Intake 1q) | None of the 9 Goldfish host commits landed; the Elephant committed every result itself (`Commit-Act: orchestrator`), so the task-to-commit link hangs on the trailer alone and the slice queue kept every slice `ready` | stop failures `NGHR-FINAL-SHAPE` (G1, G2), `AGY-HOST-COMMIT-PATH-MISMATCH` (G3), `SDC-ROOT` (G4, G5, G6), `AGY-HOST-COMMIT-DRIFT` (G7), `NGHF-COMMIT-EXCEPTION` (G8), none for G9 | Measure first. Hypotheses, unconfirmed: `SDC-ROOT` is the repository binding (`primaryRoot`/`commonDir`) differing from the observed one, which fits the open Windows root-spelling class; `-PATH-MISMATCH` and `-DRIFT` fit Elephant writes to the tree during a Goldfish run. Then: a host-commit recover command that writes the orchestrator commit with the same trailer scheme and a pointer to the stop-failure record; show the stop failure in the Agent tool result at once, not hours later in a hook hint; one table per code (cause, repair) in the docs |
| C18-2 | blocker | `verify: null` is found late and the sanctioned way to set it is hard to find | `VEP-NO-COMMAND` (critic Verify needs configured product verification) and `GS-10` (calibration must not be edited directly) do not name `configure-verify --verify-command <cmd>`; only `pipeline-state inspect` does. Editing `project/pipeline.json` directly hit `GS-10` | Name `configure-verify` in both refusals; ask for the verify command at intake; warn at plan submit when `verify` is null |
| C18-3 | blocker (real bug) | `verify-evidence-producer --mode candidate` poisons its own run | five `status: dirty` failures. (1) untracked `slice-queue.json` (guard-created) keeps `git status --porcelain` non-empty (`verify-evidence-producer.mjs` about lines 154-157 treat clean as no porcelain output). (2) the cleanliness check (about line 402) runs before the producer deletes its own previous output (about line 415), so the failed attempt's untracked output makes every later run dirty; `git clean` was blocked by `GG-08`. (3) after a heal the authority was open again (`WIN-AUTH-OPEN`). (4) a run aborted with TaskStop left the tracked output file deleted | Write the output under an ignored path and register it only on success; exempt the producer's own target and `slice-queue.json` from the cleanliness check; clean up on abort |
| C18-4 | major | The feature close needs several PO actions and its first errors point at the wrong route | `CLOSE-RESULT` (Continuity authority.result is null), `SDC-AUTHORITY-UNAVAILABLE`, `COR-REQUESTER-UNAVAILABLE`, after a heal `COR-NO-CATALOGUE`; real cause was dispatch reservations not cleaned up after the missing host commits (C18-1) | One ordered list of every missing PO action and a dry run that checks feasibility without state change. w73 (`close-coordinator.mjs drive`) names the coordinator chain but NOT the Result bootstrap or the reconcile signature: extend it |
| C18-5 | major | Two independent approval gates, the second invisible | the pipeline named `configure-verify` with `requiresConfirmation: true`; the runner's auto-mode classifier then refused the same call; the answer to the follow-up question took 361 minutes | Name the approving instance in `inspect`; document that both gates exist; consider one narrowly scoped pre-granted rule per action |
| C18-6 | major (Windows) | `routine-repair heal` ends `SAR-HEAL-INCOMPLETE` although it cleaned up, and needs manual repair | `EPERM` on directory fsync (`native-goldfish:namespace-drift`), `DBG-SETTLED-PENDING-HEAL` at every briefing build, the PO ran `session-authority-repair inspect/heal` and an `icacls` command by hand | Do not treat directory fsync as a hard error on Windows ("succeeded with warning"); heal automatically after a hook stop with an integrated commit; automate the `icacls` step |
| C18-7 | major (docs/agent contradiction) | The runner demands a `Co-Authored-By` trailer, `guard-git` refuses it (`GIT-03-PROVIDER-COAUTHOR`); a missing `Dispatch:` trailer is refused too (`GIT-03-DISPATCH-MISSING`) | at least three refused Elephant commits | The `conventional-commit` skill prints the complete guard-conformant trailer set per context (Elephant, Goldfish, orchestrator) and says that the runner's own attribution line must not be added here |
| C18-8 | major | Guard and refusal texts that cost time | `CDP-ARGUMENT` refuses with no text (full commit SHAs worked, short ones did not); `FPR-DIAG-PATH`: the help of `critic-diagnostic-evidence.mjs` says `evidence/...` while registration wants `specs/<feature>/evidence/`; `GUARD-PARSE-UNSUPPORTED` for `cd ... && node --test ... \| tail` | Refusal with flag name and reason; help texts with the paths the registration checks; one example line per script that really passes the guard |

Smaller findings of the same run, take them along where cheap: the readiness reviewer advised a wrong architecture scope and cost a second PO signature (`ARCHITECTURE-DESIGN-SCOPE-MISMATCH`; let the reviewer phrase scope advice only as a question or dry-run it); an Edit to the approved design source is not blocked up front, only the next edit (`DAA-DESIGN-SOURCE-DRIFT`);
the PO had to give the intake material twice; no mandatory visual step per item; no security scan, no ADR and no fitness run happened in the run, and no gate forces them; the consumer's own `docs/state.md` was stale at the end and the Critic report lived only in the transcript.
What worked and must not regress: role separation held (the Elephant wrote no product line), test-first held, the independent Critic found three major and five minor defects that all green tests missed.
The session's verdict: worth it for one team with a present PO and a configured verify command once C18-1 to C18-4 are fixed; not mature for all teams.

## Scope for candidate 18

1. **Native Antigravity implementation admission (draft).** `candidate-18-drafts/agy-native-implementation-admission.draft.patch` applies on top of the candidate-17 chain and adds
   `lib/agy-native-implementation-admission.mjs` plus the wiring in `hooks/antigravity-pretool-guard.mjs`. Design: still deny by default. A native `invoke_subagent` that names an implementation role is admitted only
   with (a) a hook payload that names a session, (b) a live session owner and a valid stored v1 session consent for exactly that session, (c) a SIGNED consent scope carrying
   `nativeImplementation: { schema: "pipeline.agy-native-implementation-scope.v1", models: [flash_lite | flash | pro] }`, and (d) role and Model alias inside that grant. A model-family (v2) consent is refused here.
   The consent ceremony already takes the subject as an external JSON file, so the grant needs no ceremony change.
   Unmeasured assumption, to be kept labelled everywhere: that the hook payload's session id identifies the parent session. Missing before it can ship: unit tests of the module with injected dependencies
   (deny reasons in order, admit with a grant), guard test cases (deny without a grant, admit with one, the existing denial text pins), the documented subject example in
   `references/antigravity-native-dispatch.md`, suite registration in `harness/verify-suites.json` and `docs/product-capability-inventory.json`, and a chain rehearsal.
   The interrupted run of `hooks/antigravity-pretool-guard.test.mjs` on the draft was not seen green; treat the draft as untested.
2. **Measurement-bound items (need a real run, so they stay open until one exists):**
   - tool budget counter for Codex and Antigravity (needs a captured child hook payload; today both runners say "nothing counts it");
   - the Antigravity Critic host (needs a real Antigravity run; the end-turn sentence and the read-only carrier names are in w60);
   - Intake 1q, "Claude dispatches that never commit" (needs the consumer's dispatch records or blockers file; the fifth Claude run committed fine, so it is not reproduced);
   - Windows root-argument class beyond the forward-slash spelling: drive-letter case and 8.3 short names (needs a native Windows run; w61 and w69 cover the slash spelling).
3. **PO decisions still open:** whether `project/push-threat-model.md` belongs in the Close commit; consent for any further Antigravity experiment beyond the draft above.
4. **Gates still open for candidate 17:** Full Verify on the final tree, the batch Critic (paused by the PO until further notice), native Windows runs, real Codex and Antigravity runs, PO acceptance,
   and the security scan (needs `--remote upstream`; 148 tracked findings are unassessed). Name these in every report; none is "done".

## Method notes for the next machine (the working tools live in untracked scratch, copies are kept here)

- `candidate-18-drafts/tools/` holds the slice-build helpers verbatim. Put them in `scratch/agent-out/` (`rehearse.mjs` in `scratch/agent-out/w24reh/`) before use. Flow per slice: `clone-of.mjs` a clone of the
  applied chain, edit in the clone, `test-in.mjs <clone> <test files>`, `commit-in.mjs`, `save-patch.mjs <clone> <base> <rev> <out>`, then notes, a commit message file, a `step2` line in the apply script and a
  full-chain rehearsal with `rehearse.mjs`.
- Single-slice tests never run the whole-chain checks. Always run on the rehearsal clone: suite registration, case-completion (VCR01), vendored-canon check, skill size (PSV08, 24 KiB) and the lazy-loading pin (PSV02),
  the product-capability inventory, the language and reference-path checks.
- Lessons from candidate 17: a literal backtick inside a regex literal confuses the case-completion masker (write it as `\x60`); the three PCI cases of the inventory test are red in every slice clone until the derived-files commit refreshes the baseline;
  editing a canon document (for example `docs/push-release-flow.md`) needs `generate-vendored-canon.mjs` for its plugin copy; a new test suite needs a `verify-suites.json` entry and exactly one capability assignment.
- Never write the consumer repositories' names, accounts or local paths into docs or commits. Chat with the PO is German; repository artifacts are English.
- The session-only observer for the fifth Claude consumer report does not travel; that report has already been received and is summarised in the candidate-17 intake notes (untracked) as product-only, no pipeline blocker.
