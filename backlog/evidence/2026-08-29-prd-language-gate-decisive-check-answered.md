# NVA-P3-LANG — the decisive check, answered

Rescued from a dispatch record that lived only in a temporary worktree's ignored
`evidence/` directory and would have been lost when that worktree was pruned.

Answers the open question in
`backlog/items/2026-08-29-prd-language-gate-reads-a-field-intake-never-writes.md`
and **overturns that item's stated working hypothesis**. No code was changed; the
dispatch stopped at its budget checkpoint with the answer, which the briefing
named as a fully successful outcome.

## The question

Does ANY onboarding path write `language.human_facing` into `pipeline.user.yaml`
and the runtime manifest? The item hypothesised that none does, and that
`pipeline.user.yaml` being GS-1 protected was the likely reason — which would
have made the file-level-protection item (F07) the *cause* of the language defect
rather than a downstream cost.

## The answer: yes, but only on the flow that was not used

**A writer exists and is already correct.**
`plugins/pipeline-core/lib/project-onboarding-v3.mjs`:

- `correctSeededKickoffLanguage()` — line 375
- `correctPromotedLanguage()` — line 405

`correctPromotedLanguage` gates at line 406 on
`resolvedLanguage !== "de" && resolvedLanguage !== "en" → return`, so a content
language such as `fr` is never forced into the operator axis. **The two-axis
design the item exists to protect is precisely what this existing code already
implements.** Any fix must preserve that, not replace it.

Both are wired into:

- `applyProjectOnboardingKickoffV4()` — line 5853
- `applyProjectOnboardingKickoffPromotionV4()` — line 5897

i.e. the **legacy** `kickoff-plan` / `kickoff-apply` / `kickoff-promote-plan` /
`kickoff-promote-apply` CLI commands, both additionally gated on
`observed.repository.mode === "local"`.

## The gap — and it is narrow

`plugins/pipeline-core/lib/onboarding-continuity.mjs`,
`applyOnboardingBootstrapBind()` at line 6121, calls
`applyOnboardingKickoffPromotion()` **directly** at lines 6140–6142 and never
calls `correctPromotedLanguage()` or any equivalent.

That is the Wave-4 coordinator-sourced flow reached via `bootstrap-bind-apply`
(dispatched at `plugins/pipeline-core/scripts/project-onboarding-v3.mjs` lines
662–664), downstream of `intake-consent-apply` → `intake-capture-apply` →
`intake-design-questions-apply` → `intake-generate-apply`.

The CLI script's own comment at lines 718–727 confirms it independently:

> `bootstrap-bind-apply` calls `applyOnboardingKickoffPromotion()` DIRECTLY —
> bypassing the `v4Inspection` wrapper `kickoff-promote-apply` goes through.

**This is the exact flow both blocked greenfield runners used**, and the same one
the sibling item names as the bootstrap-bind-apply sequencing trap. So the defect
is a missing call on one of two promotion entry points — not the absence of any
writer, and not a consequence of GS-1 protection.

## What this changes

- **F07 is not on this item's critical path.** The language fix does not require
  editing `pipeline.user.yaml`, so it does not require a signature ceremony. F07
  remains a valid finding about file-level versus field-level protection; it is
  simply not this item's prerequisite. The chain ordering in the triage
  (F05 → F06 → F07) can stand.
- **The fix is a wiring change, not a new mechanism.** Call the existing,
  already-two-axis-safe correction after `applyOnboardingBootstrapBind()`'s
  promotion succeeds — inline, or as a second step in the CLI dispatch mirroring
  the `applyProjectOnboardingKickoffPromotionV4` pattern.

## Three things the implementing dispatch must settle first

Named by the investigating dispatch as the reasons it did not implement under
remaining budget, and they are real:

1. Whether `correctPromotedLanguage` is exported, and whether
   `onboarding-continuity.mjs` importing from `project-onboarding-v3.mjs` creates
   a circular-import risk given the existing one-way dependency.
2. The red-first `fr` end-to-end test must target **`bootstrap-bind-apply`
   specifically**. Existing coverage in `project-onboarding-v3.test.mjs`
   (~3632–3755) exercises the legacy kickoff path only — which is exactly why it
   did not catch this gap, and why reusing it would not catch a regression either.
3. Whether the `repository.mode === "local"` gate is correct or irrelevant for the
   bootstrap-bind flow.
