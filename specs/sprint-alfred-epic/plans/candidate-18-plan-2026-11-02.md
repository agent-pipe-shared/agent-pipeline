# Candidate 18 plan (written 2026-11-02, at the PC transfer after candidate 17)

Candidate 17 (runner neutrality across Claude, Codex and Antigravity, plus the first consumer-run findings) is delivered as held patches w48 to w73 and one apply script,
`specs/sprint-alfred-epic/evidence/held-patches/po-apply-0.7-candidate17.sh` (run from the repository root with `bash`; header lines list every step). Everything below is what
candidate 17 did NOT contain, in the order to take it up on the next machine. State and decisions: `docs/state.md`. This file is the plan, not the record.

## Decisions already taken by the PO on 2026-11-02

- The runner capability table appears in the start preflight readback as a pointer only (schema and reader script), not as the table. Built as w72.
- The close orchestration is a helper or driver in the spirit of the onboarding driver: it simplifies the flow and replaces none of the running commands. Built as w73 (`close-coordinator.mjs drive`).
- Content commits after the last Critic round only warn at the freeze (w48 stays as built).
- Antigravity may implement natively, built "with labelled assumptions": the draft below, NOT finished and NOT part of candidate 17.

## Scope for candidate 18

1. **Native Antigravity implementation admission (draft, first item).** `candidate-18-drafts/agy-native-implementation-admission.draft.patch` applies on top of the candidate-17 chain and adds
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
