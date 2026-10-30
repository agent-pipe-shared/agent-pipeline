# W7-G15 first onboarding round merged (D210) -- PARTIAL checkpoint notes

Status: checkpoint (tool budget). The patch next to this file applies cleanly on the plain candidate
(apply-check exit 0) but is NOT yet complete: dependent v3/init/pin tests still assert the old two-round shape.

## What the patch does
- `lib/project-onboarding-v3.mjs`: `collectInitialAnswersAction()` reads the intake checkpoint; while consent is
  unrecorded it unions the still-unresolved consent inputs (profile; `projectDescription` off Claude) into the
  initial ask and carries the unchanged `intake-consent-apply` command as `precedingApplyAction`
  (`precedingExistingFileApplyAction` off Claude), `applyOrder: ["precedingApplyAction","applyAction"]`.
  The one `<de|en>` answer fills both commands. No new mutation verb, no changed argv shape.
  `withPendingAsksSurfacedOnNextAction()` replaces a Codex consent collect-input by a read-only inspect command so the
  merged ask is the ONE question (no consent action beside it). Claude keeps material capture separate.
- `scripts/onboarding-init.mjs`: the trust-anchor-stripping rewrite of the initial ask keeps the merged-round guidance.
- `scripts/project-onboarding-e2e.test.mjs`: PO-turn anchor (counts D210-enumerated turns; the trust-anchor key
  ceremony is counted separately, at most 1), restated first-round walk, restated `advanceTypedOnboardingInput`.
- References `kickoff-design.md`, `intake-generate-design.md`: describe the merged round and the turn bounds.

## Evidence so far (clone logs under scratch/agent-out/w7onb)
- RED on plain candidate: `red1.*.log` codex 3 PO turns (> 2).
- Walk past the anchor (verification-only probe copy, deleted, not in patch): codex 2 / claude 3 / antigravity 2, key
  ceremony 1 each (`c1probe.*.log`).
- The full e2e test stays red on a PRE-EXISTING downstream assertion (architecture authoring expects
  `repair-required ARCHITECTURE-DESIGN-AUTHORING-INCOMPLETE`, candidate returns `design-authoring-required`), identical on
  the baseline (`base0.*.log`), so the whole file cannot be green; only the anchor part is.
- Interpretation recorded: the trust-anchor key ceremony is not one of the D210-enumerated turns.

## Update after scope amendment (second checkpoint)
Scope amendment granted (clones only): `lib/project-onboarding-v3.test.mjs`, `scripts/onboarding-init.test.mjs`, pins
`unasked-advisor-export-consent-in-fresh-seed`, `greenfield-approval-policy-applies-after-intake-transition`.
- Production narrowed: the Codex consent collect-input is superseded by the merged ask ONLY when
  `runtime.firstRestartIntake.status === "capture-required"` (the first-restart boundary), so the Claude/Antigravity
  unit states and `onboarding-greenfield-walk` F3 keep their ordinary consent action (F3 failed with the broader rule).
- Done in `lib/project-onboarding-v3.test.mjs` (each with a D210/G15 comment): three "primary action captures original
  input before runtime initialization" cases, the host-control-layout inputs list, and the "all three runners execute
  the exact returned consent ..." case (Codex reads the consent command from the merged ask's precedingApplyAction).
  These restatements are NOT yet run; the patch is re-cut with them (apply-check on the plain candidate exit 0).
- NOT done: `scripts/onboarding-init.test.mjs` restatements (convergence cell lines ~309/311: Codex first stop is now
  `pending-asks` with a `command` primary action; inputs lists at ~453, ~493, ~804 now end
  `language, profile, projectDescription, pipelineActorLabel`; matrix cells near ~973 and the signature-anchor tests
  failed in the clone for the same shape and are unread), the two pins' FIRST_ROUND lists, baseline comparison by
  failing name (base1v3 and base1p logs were started in clone2 and are unread), revert proof, full callers list.
- Pre-existing e2e red (architecture authoring `repair-required` expected, `design-authoring-required` returned) is
  baseline-identical and left as is.

## Third update (clone results after the restatements)
- Narrowing accepted by the coordinator: the merged ask supersedes the Codex consent collect-input only when
  `runtime.firstRestartIntake.status === "capture-required"`. The broader rule (any runner, any consent collect-input)
  broke `onboarding-greenfield-walk` F3 ("the claude consent existingFileApplyAction has one --runner ..."), which
  inspects the Claude consent action in a state with the initial ask also pending.
- Clone results (logs `c2.*`, `c3.*`): v3 suite fails exactly the five baseline cases by name (PROJDRIFT, seeded push
  gate, SECGATE-1, public handover codex, public handover antigravity); `onboarding-init.test.mjs` 58 pass 0 fail
  (baseline 58/0); `onboarding-greenfield-walk` 2/0; `onboarding-init-intake-author` 6/0; pins
  `unasked-advisor-export-consent-in-fresh-seed` 7/0 and `greenfield-approval-policy-applies-after-intake-transition`
  9/0 (both were red in the baseline batch run, see below); `three-runner-happy-path` 3 reds identical to baseline.
- NEEDS A FOLLOW-UP (outside every granted scope): `lib/pins/design-generator-repeats-large-source-material.test.mjs`
  cases "[pendingAsks compaction] the driver prints each published ask once for the collect-input outcome ..." and
  "... the collect-input primary action is printed once; final.nextAction is a resolvable reference" fail in the clone
  (0 failures on the baseline). Their fixture asserts that the Codex fresh first stop is a `collect-input` outcome with
  sibling asks; it is now the `pending-asks` outcome with the single merged ask. The compaction behaviour itself is
  unchanged; the fixture needs a state that still yields a collect-input outcome with sibling asks (for example Codex
  after only the preceding consent command ran, intake-capture collect-input plus the pending initial ask).

## Final status
- Revert proof (`driver revert`, log `revert.project-onboarding-e2e.test.mjs.log`): with both production files reverted to
  the candidate, the restated e2e walk is red at the Codex first stop (`codex:` assertion, the first stop is no longer the
  merged pending ask); production restored byte-equal. The anchor count itself was shown red on the plain candidate before
  the walk was restated (`red1` log: codex 3 PO turns, limit 2), and green on all three runners via the verification-only
  probe (`c1probe` log: codex 2, claude 3, antigravity 2, key ceremony 1 each).
- Related pins run in the clone (`c4.*`): first-enrollment, cross-runner-chat-intake, worktrees-share, plan-submission,
  design-intake-generator, claude-greenfield-seeds, greenfield-design-course, answers-file, machine-output-and-skill-budget,
  init-greenfield-matrix: 0 failures; `claude-windows-greenfield-lifecycle-not-walkable`: 13 V-10 failures, identical by
  name to the baseline; `onboarding-first-restart-intake`, `claude-intake-prompt-capture`,
  `existing-signing-key-reuse-deadlocks-onboarding`: 0 failures.
- RESOLVED after the third grant: the two `design-generator-repeats-large-source-material` compaction cases are restated
  (D210/G15 comment in `driverOutput()`): the fixture now reaches Codex after only the merged ask's preceding consent
  command (without the first project description) ran, which still yields a collect-input outcome with sibling asks; the
  compaction intent and bounds are unchanged. Clone log `c5`: 13 pass 0 fail (baseline 13/0). The follow-up paragraph
  above is therefore superseded.
- Targeted delivery: green except one baseline-identical red. Open: (1) the e2e file's baseline-identical
  architecture-authoring red (left as is, per the coordinator); (2) batch Critic, integrated Verify, native re-walk and PO
  acceptance stay parent-owned. Final patch: 60433 bytes over 10 files, `git apply --check` on the plain candidate exit 0.

## Callers of the changed shapes and the test that pins each
- Initial-answers ask (`collectInitialAnswersAction`): `withPendingAsksSurfacedOnNextAction` (Claude/Antigravity first
  stop, Codex after the boundary supersede), `hostManagedFirstAnswersAction` (host-managed first stop). Pinned by
  `project-onboarding-e2e.test.mjs` (walk + PO-turn anchor, all three runners), `onboarding-init.test.mjs`
  (host-managed x2 at ~453/~493, convergence cell ~309, approval cell ~804), `project-onboarding-v3.test.mjs`
  (host-control layout list, `v4Inspection` fresh repository, three apply-portable-seed cases),
  pins `unasked-advisor-export-consent-in-fresh-seed`, `greenfield-approval-policy-applies-after-intake-transition`.
- Consent command (`intakeConsentAction`) unchanged; reused as `precedingApplyAction` (language placeholder swapped to the
  shared `<de|en>`). Pinned by the same v3 case ("all three runners execute the exact returned consent ...") and
  `onboarding-greenfield-walk` F3/F4 (unchanged, green on baseline and clone).
- `firstRestartIntakeBoundary` (Codex): still publishes the consent action; the merged ask supersedes it only at the
  first-restart boundary (`withPendingAsksSurfacedOnNextAction`). Pinned by the three v3 apply-portable-seed cases and
  `onboarding-first-restart-intake.test.mjs` (baseline log read in base1p).
- `onboarding-init.mjs` `normalizeOnboardingDriverOutput` -> `initialAnswersActionWithoutTrustAnchor`: keeps the merged
  guidance when the trust-anchor flags are stripped; `withPipelineActorAsk` spreads the action so the preceding
  fields survive. Pinned by the e2e walk (inputs end `pipelineActorLabel`).
- Unaffected, with reason: `intake-capture-apply` / `intake-design-questions-apply` actions (unchanged); `resume-hint.mjs`
  (reads inspect, no action shape); `lib/guard/sanctioned-args-onboarding.mjs`, `shell-grammar.mjs`,
  `onboarding-argv-shapes.mjs` (both commands keep their exact argv shapes); `SKILL.md` "One onboarding consent" (project
  consent, a different thing); `measure-fresh-repo-onboarding-turns.mjs` (out of scope, reads turns, not changed).
- Next command after each action: `precedingApplyAction` (consent) -> `applyAction` (initial answers, re-enters the
  public driver) -> trust-anchor ask (signature only) -> Claude `intake-capture` ask or design questions. If the
  consent command is skipped the ordinary consent action is published again (no dead end, no circle).

## Baseline-identical (pre-existing) reds, by name
- v3 suite (`base1v3`): NVA-R40-PROJDRIFT; seeded push gate; seeded security gate (SECGATE-1); public onboarding
  handover codex; same for antigravity. Init suite and author suite: 0 failures on the baseline.
- Pins on the baseline: three-runner-happy-path (AC-264 and two RED mirrors), unasked-advisor-export-consent (claude,
  codex, antigravity cases), greenfield-approval-policy (claude/signature, claude/chat, codex/signature,
  antigravity/chat) are RED on the baseline already; their restatements here are therefore not provable green.
- e2e walk: architecture-authoring assertion (see above).

## Remaining (continuation card; items 1 partly superseded by the update above)
1. Restate in `lib/project-onboarding-v3.test.mjs` (outside this slice's write scope -> needs a scope amendment or a
   follow-up slice): the tests failing on the clone and not (yet) known on the baseline: three "primary action captures
   original input before runtime initialization", "all three runners execute the exact returned consent and
   design-question actions" x3, "v4Inspection routes a genuinely fresh repository...", "recognized read-only host
   control layout" (inputs list now ends `profile`,`projectDescription`). Also `onboarding-init.test.mjs` (lines ~453,
   493, 804 inputs lists), `lib/pins/unasked-advisor-export-consent-in-fresh-seed`, `greenfield-approval-policy-...`
   (FIRST_ROUND list). These files are outside the briefed write scope: STOP condition 3 applies, name them.
2. Run baseline (`clone2`) v3/init/pins, compare failing names; revert proof; downstream sweep notes (SKILL.md line 80
   "One onboarding consent" is the project onboarding consent, unaffected).
