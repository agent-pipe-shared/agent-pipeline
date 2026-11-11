# C28 held patch: onboarding asks each question once, at the right time, and push setup needs no later correction

Slice `C28-ONBOARDING-QUESTIONS`. Closest criterion: AC-108. PRD and Spec unchanged. Built in the clone of the candidate 28 integration state
(`a795c822e`), saved as `c28-onboarding-questions.patch` (clone commit `9c582e341`). Nothing was committed in the real checkout. The patch is cut against the
clone base, not the real HEAD (`apply --check` on the real HEAD exited 0 when it was saved). Tests were written first and run red before any production edit.

## What

1. **Advisor consent folded into the first Pipeline consent question (friction 1).**
   - `lib/onboarding-consent-scope.mjs`: new covered item `advisor-export` (no action route). The relayed question gets one sentence ("Your yes also lets me ...";
     German twin) saying the Advisor export is part of using the Pipeline and not asked again separately. A yes record (schema v2, unchanged) carries `advisor-export`
     in its `scope`. New `advisorExportConsentFromRecord(root)`: `"approved"` only for the newest record being a yes whose scope names it, otherwise `null`.
   - `lib/project-onboarding-v3.mjs` (`collectInitialAnswersAction`): with such a record the first round drops the `advisorExportConsent` input and the
     `<approved|declined>` placeholder; the argv keeps `--advisor-export-consent approved`, so the shape `lib/guard/sanctioned-args-scripts.mjs` admits is unchanged (no
     guard file moved). Without such a record (none, v1, an older v2, a no) everything is as before: asked, seed `declined`, nothing inferred. Existing records keep their meaning.
   - `scripts/onboarding-init.mjs`: the rewritten first-round guidance says the consent was already given when folded. `consentRecordAction.guidance`
     (`scripts/pipeline-start-preflight.mjs`) and `skills/pipeline-start/SKILL.md` say: after recording, run the same onboarding-init command once more so the first round is
     read after the record (Codex and Antigravity read it after their restart). Docs: `docs/v3-consumer-onboarding.md`, `skills/advisor-consult/SKILL.md`.
2. **Host route before the first mutating step (friction 2).** `scripts/onboarding-init.mjs`: `probeRoute` seam (default `--version` of a node executable; blocked = no exit status
   plus EPERM/EACCES) checked once before the first step whose action has `mutation: true`; outcome `host-route-required` with `hostRoute {executionBoundary: "host", cause,
   mutationsExecuted, guidance, retryAction}`. A spawn that never started in any step keeps its typed `spawn-failed` fault and also carries `hostRoute`; a child that ran (any exit
   status) does not.
3. **Every first-round field named once with its default (friction 3).** `withFieldsAtOnce(action)` (exported from v3, pure, idempotent) adds `fieldsAtOnce [{name, default}]` (`null` =
   the PO must answer) and one guidance sentence; the driver applies it last (after the actor label and the trust-anchor strip). `followUpIfSignature` names the trust-anchor fields a
   signature answer would otherwise ask in a later round.
4. **Repository mode at the first push (friction 4).** Why it was deferred: the promotion is a commit, the calibration twins are content for the Critic carry, so after the last Critic
   round it ended the carry (`CVL-CARRY-CONTENT-CHANGED`); three texts said "next feature".
   - `lib/critic-evidence-carry.mjs`: `offending()` admits a twin (`project/pipeline.json`, `.claude/pipeline.json`) only when status M, both modes regular, and the reviewed blob run through
     `promoteRepositoryModeBytes` equals the candidate blob byte for byte. **This widens what carries Critic evidence by exactly that one-token change; every near miss stays content (the
     other direction, another field, a line-ending rewrite, host-managed, another path, a mode change, a source file riding along).** It adds an import edge `lib/critic-evidence-carry.mjs`
     to `scripts/repository-mode-promote.mjs`; the kernel-closure suite is green.
   - `scripts/push-prepare.mjs` notice: typed `action` (the promote command, `mutation: true`, `requiresSignature: false`, `recordedAs: "its own commit"`), `then` (commit alone, Verify again,
     push-init again) and "same feature" wording; `finish-feature.mjs` and `critic-dispatch-preflight.mjs` texts agree. Pin restated in place (QG-04) in `finish-feature.test.mjs` ("R9" case).
   - Transport: `lib/machine-plane.mjs` AND its read-only copy `lib/po-human-approval-read.mjs` (two closed validators) accept the optional machine-local key `pushTransport`
     (`{remote: {kind: ssh-key|credential-helper|configured-default, reference}}`), with `readPushTransport` / `recordPushTransport`. `scripts/push-init.mjs`: `--transport-kind` /
     `--transport-reference` and a result field `transport` (`unasked` with the one question and its apply action, `recorded-now`, `recorded`, `refused`), never on the checkpoint lane;
     advice only, the outcome does not move. A name or path is stored, never a key's content, never in a tracked file. `push-approval.md` now says machine-local instead of the handover.

## Guard changes friction 4 needs (outside this slice: `lib/guard/*`, the other Goldfish)

`lib/guard/sanctioned-args-scripts.mjs` must admit the two new push-init flags (`--transport-kind` one of ssh-key|credential-helper|configured-default and `--transport-reference` one
non-flag token), otherwise the agent cannot run the answer action. `hooks/guard-push.mjs` (the `core.sshCommand` / `GIT_SSH_COMMAND` refusal) forbids injecting a transport into the push
line, so the remembered transport is surfaced and read back, not applied; an applying route (for example an agent step adding the named key) would need its own guard decision.

## Why

PO decisions 2026-11-10 by tile on the greenfield reports (candidate 27). Failure classes: a consent asked as its own question and never used; a mid-run failure a read-only probe could
name first; a second question round for fields the first could have listed; a correction deferred by a carry rule, with a transport answer written where it does not belong.

## Deliberately not changed

- The Critic export consent: it is not a question at all (a frozen registry policy; the separate Critic export consent is decided at dispatch time). Reported only.
- `--advisor-export-consent` stays required in `onboarding-init.mjs`, argv shape unchanged (guard lane).
- Existing consent records stay valid and keep their meaning: only a new yes carries `advisor-export`. Migration question for the Elephant: a project that already answered the first round
  keeps its recorded `advisor_export.consent`; nothing is rewritten.
- The Critic preimage pin files, any guard file, `.claude` settings. The driver still spawns the bare `node` its published actions name (changing it moves recorded step shapes).
- No case was added to `lib/pins/unasked-advisor-export-consent-in-fresh-seed.test.mjs`; the with-record case lives in `onboarding-init.test.mjs`.

## Proven (each run alone, printed counts)

New cases were added to registered suites (no new test file): `onboarding-init` (7 cases), `onboarding-consent-mark` (2), `critic-evidence-carry` (1), `push-prepare` (1), `push-init` (2),
`machine-plane` (1). Green after the last edit: onboarding-init 67/67, onboarding-consent-mark 15/15, pipeline-start-preflight 102/102, project-onboarding-v3 1/1 (wrapper, 7.5 min),
push-prepare 100/100, push-init 47/47, repository-mode-promote 20/20, critic-evidence-carry 16/16, machine-plane 32/32, kernel-closure 1/1, critic-dispatch-preflight 114/114, finish-feature
55/55, po-human-approval 217/217, codex session-start-hint 9/9, transport doc pin 5/5, advisor-consult 4/4; the check test 2/2. A first project-onboarding-v3 run failed
(`HOOK-SNAPSHOT-STALE`) only because plugin files were edited while it ran; it was rerun without edits. Two of my own new cases were corrected after their first run (an expected input list that
missed the driver-added actor label; a fixture root without `.git`), neither weakened.

## Not proven

- The carry exception is proven at the `decideCriticEvidenceCarry` level only; no end-to-end run through `critic-verify-lifecycle` and the push gate with a promotion commit.
- The Verify rerun after the promotion commit is named, not exercised.
- Codex, Antigravity and native Windows were not exercised separately for the consent fold, the field list, the probe or the transport.
- The new push-init apply action cannot run until the guard admits its flags (see above).
- Suites outside the list (for example the guard and pretool-guard suites that pin the push-init argv) were not run; they belong to the guard slice.
