---
schema: pipeline.backlog-item.v1
id: pipeline.greenfield-approval-policy-applies-after-intake-transition
type: defect
owner: pipeline
status: open
created: 2026-09-27
source: "Codex/WSL greenfield review B4 and Claude/Windows greenfield review F-03, 2026-09-27; Codex historical ordering remains unverified, Claude reports guard refusals in three lifecycle phases."
sprint: alfred
done_when: manual
---

# Greenfield approval preference can be applied only after an intake phase transition

## Description

The Codex greenfield review reports that the PO had already selected signed
plan and push approval, while `pipeline.user.yaml` still declared `chat`.
The returned policy action was refused by the intake lifecycle guard, then a
later driver call applied the same preference but returned `no-progress` with
exit 1 despite a ready/signature readback. The current consumer tree has the
signature values, so the historical ordering and return-code mismatch need
a controlled reproduction before calling the product defect fully proved.
The independent Claude/Windows run also reported that `onboarding-init.mjs`
published a `pendingAsks[].applyAction` for approval mode and trust-anchor
setup, but the guard refused that action in three phases. The driver advertises
an answer channel that the phase admission does not reliably allow.

## Triggering situation

The 2026-09-27 Codex/WSL fresh Feature onboarding. The source review is
`specs/sprint-alfred-epic/evidence/0.7-codex-greenfield-advisor-triage-2026-09-27.md`.

## Affected artifact

`onboarding-init.mjs`, the intake checkpoint and gate-preference application,
`project-onboarding-v3.mjs`, and the lifecycle admission for returned actions.

## Proposal

Replay the exact fresh-intake sequence with a PO answer selecting signature
approval. Apply the preference atomically before the state moves beyond the
permitted intake phase, or return a typed repair action admitted in that phase.
Make the driver result agree with its readback: a successful policy mutation
cannot be reported as `no-progress`.

## Acceptance

- A fresh Codex/WSL project records the answered approval modes before any
  plan signing or export decision; no second ask is required.
- The returned action is executable in the phase that returns it.
- A replay covers the previously refused action and the ready-but-exit-1 case;
  a successful repair exits successfully with a matching readback.
- The prior report's exact historical sequence is verified or explicitly
  corrected before a product fix is claimed.
- Every published `pendingAsks[].applyAction` is admitted in the phase that
  publishes it, including trust-anchor and approval-mode changes, or the ask
  is withheld with a typed executable recovery action.

The Claude report is at `scratch/pipeline-greenfield-review-2026-09-27.md`
in the external consumer project.

## Triage

## Confirmed producer/guard mismatch and preparation (2026-09-28)

`initialGitAuthorAction` always publishes the confirmed or placeholder
`--language` argument with shared approval answers. The driver accepts only
de/en; canonical `sanctionedDriverArgs` omits this argument from its initial
answer shape, so even a correctly answered published action cannot match.
This proves an argv mismatch; it does not independently prove the reported
historical phase sequence or ready-but-exit-1 outcome.

`scratch/onboarding-driver-language.patch` adds bounded de/en parity to that
shape and prepares guard fixtures for intake/bootstrap phases, omitted or
complete identity, invalid language, duplicate fields and incomplete identity.
Three exact proposed-qualifier tests pass, including existing/new external
trust-anchor shapes and negative root/enum/policy checks. They do not replace
full guard/producer replay or the pending driver exit-code reproduction.
The item remains open; source integration and live Codex readback are pending.
