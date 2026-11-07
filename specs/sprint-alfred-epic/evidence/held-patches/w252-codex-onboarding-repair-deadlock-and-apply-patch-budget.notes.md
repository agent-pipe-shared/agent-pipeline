# w252: the Codex onboarding repair deadlock and the apply-patch guard budget (candidate 20)

Base: `72ef2e315` (19m applied, stamped and installed; greenfield running). Built by the Elephant in the slice clone `scratch/agent-out/w252`.
The PO started the 19m greenfield and then asked for fixes of what is already visible ("du kannst die fehler aus dem greenfield schon anfangen
das zu korrigieren was wir schon sehen"). Held for candidate 20; no apply script yet, more greenfield findings may join it.

## G20-1 (P0): the guard refused the repair the inspection returned

- **Seen:** a Codex greenfield session at `bootstrap-binding-required` got `intake-spec-marker-apply` as inspect's nextAction. The lifecycle
  guard refused exactly that command (`GUARD-LIFECYCLE-NOT-READY`), and also `plan-repair`. The session could not continue.
- **Cause:** `observedOnboardingCommandMatch` (`lib/guard/command-catalogue.mjs`) required the command's interpreter to equal
  `nextAction.executable` byte for byte. That value is the `process.execPath` of whichever process inspected. The guard inspects inside the
  hook, under the hook's Node (a version-manager Node). The agent's escalated-sandbox shell resolved `node` to a different installation and
  used that path. The argv was identical; only the interpreter differed.
- **Fix:** equality stays the first rule. In addition, `sameNodeInterpreter` admits a different interpreter only when the observed executable
  is itself a Node (basename `node`/`node.exe`) and the command names either `node` from PATH or an absolute `node`/`node.exe` that resolves
  to an executable regular file outside the project root. The argv stays byte-exact.
- **What this admits that was refused before:** the same exact command run by another real Node installation of this machine. It does not
  admit a Node-named file inside the repository (so an agent cannot plant its own `scratch/node`), a non-Node interpreter, a changed argv,
  or any interpreter swap when the observed executable is not a Node.
- **Tests:** `onboarding-inspect-prefilter.test.mjs`. The legacy-equivalence table is restated in place (QG-04, no case dropped): every legacy
  match is still returned identically, and a legacy refusal may match now only when the interpreter word alone differs and
  `sameNodeInterpreter` admits it. New case for the deadlock and for the refusals that remain. 76/76 green with the two devplan recovery suites.

## G20-2 (P1): the 4 s child cap of guard-apply-patch

- **Seen:** every Codex design write (`apply_patch` on the staging PRD and Spec) failed with `Guard timed out` while the machine was busy.
- **Measured:** `guard-lifecycle-ready` alone takes 3.7 to 4.9 s on this Linux machine without the sandbox, and 3.1 to 3.7 s with the 19h
  plugin, so this is not a 19m regression. The cap of 4 s per child left no margin.
- **Fix:** each child guard gets 12 s. The whole script stays bounded by the 36 s cap `codex-pretool-guard.mjs` gives it. A shared 30 s
  deadline was tried and rejected: the lifecycle children run one per path in order, and the multi-file fan-out test showed that a patch over
  many files legitimately needs the sum. The timeout message now names the guard that ran out of time and how to retry.
- **Tests:** `guard-apply-patch.test.mjs` 29/29. The extracted `runGuard` harness gets the 12 s value and the new `childTimeoutMs`.
  New GAP-BUDGET01 pins the value, the timer use, the fit inside the outer cap and the message.

## G20-3 (P2, Antigravity): a guessed plugin path was refused as a credential problem

- **Seen:** in one agy greenfield run, seven native Reads of plugin files were refused with `GUARD-READ-TARGET: use an exact passive path
  outside protected credential roots`. All seven paths were inside the agy runner view (the registered plugin root) and none of them exists
  (for example `lib/architecture-design-package.mjs`, `PIPELINE_FLOW.md`, `templates/architecture/adr-template.md`). No skill names them.
  The agent had guessed, and the refusal sent it looking for a credential or root problem.
- **Fix:** `readToolScopeVerdict` (`lib/guard/read-scope.mjs`) names a Read of a missing file lexically inside a registered plugin root
  as `GUARD-READ-TARGET-MISSING`, with the relative plugin path and the nearest existing plugin directory to list with Glob. The read stays
  refused. The credential-labelled refusal (K105) keeps precedence, and missing paths outside the plugin root keep their label.
- **Tests:** the registered-plugin read test in `guard-lifecycle-ready.test.mjs` is extended. The full suite is green (427 pass, 0 fail,
  3 skipped).

## G20-5 (P0, Claude on Windows): greenfield architecture entry steered into the brownfield adoption route

- **Seen:** after a signed `approve-plan`, `set-phase --phase implementation` was refused with `GUARD-ARCHITECTURE-ADOPTION-UNRESOLVED`
  and "Record one PO-owned approved-scoped or partial adoption decision". The preflight readback said `design-pending` and "record a
  scoped architecture disposition". The PRD carried a valid `pipeline-architecture-design` block, so the sanctioned next step was the
  agent-run `pipeline-state.mjs materialize-architecture`. The session took the adoption route instead: a PO adoption signature, a
  refused `apply`, two human-override ceremonies, about eight PO terminal commands. It then ended in `ARCHITECTURE-DESIGN-EXISTING-ESTATE`
  because `architecture/adoption-state.json` now sat beside the scaffold.
- **Confirmed:** a copy of that project (read-only source, modes normalised) reports `ARCHITECTURE-DESIGN-EXISTING-ESTATE` with the
  adoption record and `materialization-required` with 14 targets without it.
- **Cause:** `checkPlanningAdoptionDisposition` fell through to `adoption-required` while the approved design was still
  `materialization-required`. The readiness library already returned `materialize-architecture` as its nextAction, but the guard sits in
  front of `set-phase` and only echoed the adoption text.
- **Fix:**
  - `checkPlanningAdoptionDisposition` returns the disposition `materialization-required` with an error naming the exact
    `pipeline-state.mjs materialize-architecture` path. It is still `ok: false`; implementation authority still needs the materialized design.
  - The guard's trailing line depends on the disposition: "This is not an adoption decision … Materialize it, then retry the same
    set-phase" for that disposition, the unchanged PO-adoption line for every other one.
  - `architecture-adoption.mjs prepare|apply` refuse with `ADOPTION-GREENFIELD-MATERIALIZE` while an approved design awaits
    materialization, before anything is written.
  - `ARCHITECTURE-DESIGN-EXISTING-ESTATE` is no longer a bare code: the readiness nextAction is `repair-required` and lists the foreign
    entries under `architecture/` plus the move-aside and materialize repair.
  - The `design-pending` orientation text, `references/architecture-orientation.md` and the `references/happy-path.md` index name the
    materialization step and warn off the adoption route for a greenfield repository.
- **Brownfield time sink (same transcript):**
  - `apply` asked again for `--scope/--rationale/--decision-ref` although the signed request carries them. It now reads every omitted
    field from the request's subject. The existing subject digest comparison still binds each value to the signature.
  - **Policy reversal, stated plainly:** D165 S1 kept `architecture-adoption.mjs apply` out of the guard catalogue on purpose, so the
    agent needed a human-override ceremony to record a decision the PO had just signed. It is now admitted in exactly one shape:
    `apply --root <root> --decision approved-scoped|partial --request scratch/<x>.json --proof scratch/<y>.json [--json]`. The script
    verifies the Ed25519 proof against the request (`verifyAdoptionAuthority`, `requireCurrent`) and the subject digest. It stays refused
    with `--chat-approval` (an attribution record, not a proof), with `--by` (EL-36), with `--scope/--rationale/--decision-ref`, with
    `deferred`, a non-scratch, dot-segment or non-JSON path, a foreign root or an extra word.
- **Tests:** new pin `lib/pins/greenfield-architecture-entry-names-materialization.test.mjs` (disposition, guard text for both cases,
  CLI refusal predicate, orientation text). `architecture-entry-readiness.test.mjs` gains the EXISTING-ESTATE repair case. The D165-S1
  tables in `guard-lifecycle-ready.test.mjs` are restated in place (QG-04): the signed shape moves to the admitted list, and the refused
  list gains every widening above.

## G20-7 (P2, Antigravity): the documented ADR checks were refused in the draft phase

- **Seen:** the architecture-decision skill tells the agent to validate each ADR sidecar and to compile the decision summary. In the draft
  phase `architecture-baseline.mjs --validate docs/adr/<x>.json` (never admitted) and `--compile-summary --format json` (refused for the
  format flag) each ended in a human-override offer, five times in one run.
- **Fix:** `--validate <one docs/adr/*.json>` (relative, or absolute inside the root) is admitted; it only reads that file.
  `--compile-summary` admits a trailing `--format json|text`; the output file is the same fixed path as before.
- **Tests:** `catalogue-admit-prescribed-lifecycle-verbs.test.mjs`: the D115 "with a format" case is restated as admitted (QG-04),
  with unknown, empty and repeated formats added as refused; a new `--validate` test pins every other read target as refused.
- **Not changed, for the PO:** the sidecar schema `pipeline.architecture-decision.v1` is not shipped in the plugin (it exists only under the
  repository's `schemas/`), so consumer agents keep guessing its path, and `--validate` in a consumer checks only the built-in fields.
  Shipping the schema would make consumer validation stricter; held back as a decision.

## G20-9 (P3, Codex Goldfish children): a missing canon pointer did not name the plugin copy

- **Seen:** each Codex Goldfish child first read `templates/prompts/agent-obligations.md` or `templates/prompts/goldfish-task.md` at the
  project path, was refused with `GUARD-READ-TARGET-MISSING` ("check the spelling or create it first") and then searched for the file.
  Canon pointers mean the repository file when it exists, else the plugin's own copy.
- **Fix:** both missing-target refusals (native Read in `read-scope.mjs`, the shell lane in `evaluate.mjs`) name the running plugin's
  copy when the missing project-relative path exists there as a regular file. Same code and prefix; the read stays refused. No copy is
  offered for a dot or hidden segment, a path outside the project, a directory or a link.
- **Tests:** new pin `lib/pins/missing-canon-pointer-names-the-plugin-copy.test.mjs`; `guard-lifecycle-ready.test.mjs` 427/0/3 and the
  eight suites that pin the old text are rerun.

## G20-10 (P3, Codex Critic path): `CGB-REFERENCE` named no path

- **Seen:** the session-critic finalizer refused with only "Generic Critic batch is unavailable or refused". The cause was one
  `--guardrail .claude/settings.json`; the session read `lib/critic-generic-batch.mjs` to find that out.
- **Fix:** both `CGB-REFERENCE` refusals in `reference()` name the path, its role and the rule (hidden or scratch/evidence path; not a
  regular committed file at the commit) and the repair. Code unchanged.
- **Tests:** `critic-generic-batch.test.mjs` asserts both texts next to the existing refusals.
- **Noted, not changed:** `critic-diagnostic-evidence.mjs --guardrail project/pipeline.json` is refused by the gate-strength shell lane
  for naming the file. The script writes its `--out`/`--log`, so it cannot join the write-free exemption list. It cost one retry; the
  session dropped that guardrail input. Whether the Critic packet still carries the calibration was not checked: open for the PO.

## G20-4 (P2, Full Verify under load): the stop-pair terminal release ran out of rounds

- **Seen:** in the 19m Full Verify, NGSP7 landed its host commit and then ended `recovery-required` at the terminal release
  (`domain-membership-race`). Green when run alone.
- **Cause:** `nativeBoundaryRounds` repeats the terminal write boundary at most 8 times with 100 to 700 ms pauses, about 2.8 s in total. Under
  full load a sibling stop's post-commit writes outside the lock take longer than that, although the stop itself still has up to 90 s of
  lock-wait budget.
- **Fix:** `nativeBoundaryRounds` takes an optional `budgetMs`. A sibling race is retried past the count bound while that budget lasts, with the
  pause capped at one second, and the last race is raised once the next pause would overrun it. The terminal release passes what is left of
  the stop's own wait budget (`nativeStopWaitBudgetMs()`, itself bounded by the 240 s stop ceiling). Without a budget the old count bound
  holds. A refusal that is not a sibling race is still raised at once. **Cost:** a genuine, lasting conflict now surfaces after the stop's
  remaining budget instead of after about 2.8 s; the refusal is the same.
- **Tests:** `native-goldfish-host-state-fanout.test.mjs` NGFO01 is extended in place: a race ridden out inside the budget, the one-second pause
  cap, the budget ending the rounds without overrun, and no retry of a foreign refusal. 8/8; `native-goldfish-host-stop-pair.test.mjs` 13/13
  alone. The load case itself is shown only by the next Full Verify.

## G20-11 (P1, Codex Critic path): reader-review reports were bound as Critic source

- **Seen:** the first independent Critic of the Codex greenfield stopped before any substantive review with a briefing violation: the
  correction-input bindings listed the retained reader-review reports (`specs/<feature>/evidence/reader-review/phase-one/2.md`, `phase-two/2.md`)
  as source paths. `pass: false`, no findings; the session recorded the blocked review and stopped.
- **Cause:** `RETAINED_PATTERN` in `lib/critic-correction-input-bindings.mjs` knew only the Critic's own result layout. The reader-review skill
  writes its reports under `specs/<feature-id>/evidence/reader-review/` (`skills/reader-review/SKILL.md`, `lib/doc-reader-plan-scope.mjs`).
- **Fix:** that layout is a retained prior result: exclusion-bound by exact path, blob digest and mode, never read as source.
- **Tests:** `critic-dispatch-preflight.test.mjs` new CCI (2d) with look-alikes (a sibling `.md`, a non-evidence folder, a near-miss folder
  name, a root `docs/` path) that stay source. CCI cases 20/20.
- **Noted, not changed:** `finalize` then refused with `SCF-ORIGINAL-SOURCE-UNAVAILABLE`. The text already names
  `--allow-caller-authored-fallback`, and the session rightly did not take the weaker marker on its own. No runner issues a Source return
  record yet, so every finalize meets this refusal first; whether the labelled fallback should be the default is a PO decision.

Not yet: live greenfield retest of all of the above, Full Verify, Critic, PO acceptance.
