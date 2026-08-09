---
schema: pipeline.backlog-item.v1
id: pipeline.decouple-hosted-project-document-language-from-operator-facing-language
type: enhancement
owner: pipeline
status: open
created: 2026-08-09
source: "PO directive during the 2026-08-09 Codex/Claude happy-path evaluation: for a HOSTED/consumer project (not this Pipeline repo, which stays ADR-0011 EN-canonical), the PRD/Spec document language should be free to differ from the project's operator-facing (chat/session) language, which itself stays a hard de/en choice per setup. Explicit follow-up refinement: keep the change thorough but minimally invasive, no new follow-on problems, an English structure/scaffold with only the prose content translated is an acceptable (preferred) shape, and the kickoff flow should actively ask which document language(s) a hosted project's PRD/Spec should use rather than silently assuming it equals the operator-facing choice."
due: 2026-08-16
---

# Decouple a hosted project's document (PRD/Spec) language from its operator-facing language

## Problem

Today, exactly one language value drives four different things at once:

1. `pipeline.user.yaml`'s `language.human_facing` (operator-facing config, de/en only).
2. The projected runtime manifest's mirrored `human_facing` scalar (must agree with 1 exactly — `configuredLanguage()`, `po-gate-authority.mjs:263-275`).
3. `continuity.runtime.humanFacingLanguage` (session runtime state, de/en only — `continuity-state.mjs:94`).
4. The promoted PRD's `<!-- po-language: (de|en) -->` marker.

`onboarding-continuity.mjs`'s promotion flow (`buildKickoffPromotionPlan`, ~line 4039-4040) takes whatever `po-language` marker the promoted PRD declares and **overwrites** `continuity.runtime.humanFacingLanguage` with it. `po-gate-authority.mjs`'s `validatePoGateAuthority`/`prdAuthority` (~line 766, 696-705) then requires every subsequent read of that PRD to show a marker **exactly equal** to the configured operator-facing language, else `PO-GATE-PRD-LANGUAGE-MISMATCH`. `pipeline-state.mjs`'s `validCurrentDecisionDocuments` (~line 3915-3930, used by the spec-revision re-approval decision-plan flow, `buildPoAuthorityDecisionPlan`) enforces the identical equality independently, via its own duplicated marker regex (`PO_LANGUAGE_MARKER_RE`, line 3828).

For a hosted/consumer project, this means the PRD/Spec **cannot** be written in French, Chinese, or any language outside `{de, en}` — the marker's own regex is `(de|en)` in every one of these three independent sites, and even if it were widened, the write-side (item 4 above) would still force the operator-facing runtime language to match it, and the two read-side checks would still demand exact equality to whatever the operator-facing language currently is.

## Why it matters

This Pipeline governs consumer projects whose team, PO, or target audience may want PRD/Spec documents in a language that has nothing to do with which language the *operator* (the human running the agent session) chats in. The PO's explicit ask: keep the operator-facing axis a hard de/en choice (unchanged, low-risk, matches how the runtime/config/session-language machinery already works), but let the **document** axis be free — while doing so with the smallest possible blast radius, since this coupling touches PRD-authority validation code that gates every plan/spec read.

## Scope decision (Elephant, 2026-08-09, after reading every marker-check site)

**In scope — four production files, all additive/optional, zero behavior change when unused:**

1. **`plugins/pipeline-core/lib/continuity-state.mjs`** — add an **optional** `documentLanguage` key to `RUNTIME_KEYS` (line 21), validated by a new, separate, wider pattern (`/^[a-z]{2}$/`) that does **not** touch `HUMAN_FACING_LANGUAGES` (line 94, stays exactly `{de, en}`) or the existing `humanFacingLanguage` validation in `validRuntime` (line 160-167). Not in `validRuntime`'s required-keys list, so every existing runtime object without it stays valid unchanged. The existing negative test at `continuity-state.test.mjs:535` (`humanFacingLanguage = "fr"` must still fail as "unsupported runtime language") must keep passing unmodified — it is the regression guard that the operator-facing axis truly stays hard-locked.

2. **`plugins/pipeline-core/lib/po-gate-authority.mjs`**:
   - Widen `PRD_LANGUAGE_MARKER` (line 61) from `(de|en)` to a general two-letter pattern, e.g. `/^<!-- po-language: ([a-z]{2}) -->$/gmu`.
   - `activeFeatureState()` (line 632-648) already `JSON.parse`s the full state to read `activeFeature`; extend it to also read and return `state?.continuity?.runtime?.documentLanguage ?? null` from the **same already-parsed object** (no new I/O).
   - `validatePoGateAuthority()` (line 739-769): compute `const expectedDocumentLanguage = active.documentLanguage ?? profileEvidence.humanFacing;` and pass that (not `profileEvidence.humanFacing` directly) as `prdAuthority`'s third argument (line 766). Falls back to today's exact behavior whenever `documentLanguage` is unset.
   - `onboarding-continuity.mjs`'s `promotionArtifacts()` (line 3700-3761) already imports this same `PRD_LANGUAGE_MARKER` — confirmed via its own comment ("imported from po-gate-authority.mjs, never re-declared, so the two checks cannot drift apart") — so widening it here is sufficient for both files; do not re-declare or duplicate the regex.

3. **`plugins/pipeline-core/scripts/pipeline-state.mjs`**:
   - Widen `PO_LANGUAGE_MARKER_RE` (line 3828) the same way (this one **is** an independent duplicate, unlike the promotion-flow regex above).
   - `validCurrentDecisionDocuments()` (line 3915-3930, feeds `buildPoAuthorityDecisionPlan`, the spec-revision re-approval flow): change line 3929 from `languages[0] === profile.humanFacing` to `languages[0] === (state.continuity?.runtime?.documentLanguage ?? profile.humanFacing)` — `state` is already this function's first parameter, no new plumbing needed.
   - Do **not** touch `validCurrentPoProfile()` (line 3901-3913, still hard `{de, en}` — correctly operator-facing-only) or the AC-047-28 stale-spec-marker rebind (`buildPoAuthorityRebindPlan`, ~line 3990-4063) — that transaction only ever rewrites the `technical-spec-sha256` marker (`replaceRebindMarker`, line 3873-3880), never the `po-language` one; it is unaffected and must stay that way.

4. **`plugins/pipeline-core/lib/onboarding-continuity.mjs`**:
   - `validatePromotionPlan()` (line 3793-3801): widen the `poLanguage` enum check from `new Set(["de", "en", null]).has(...)` to `(value === null || /^[a-z]{2}$/u.test(value))`.
   - The state-transition write (~line 4039-4040, inside `buildKickoffPromotionPlan`): today it unconditionally does `next.continuity.runtime = { ...next.continuity.runtime, humanFacingLanguage: authority.poLanguage }` whenever `authority.poLanguage !== null`. Change to branch: if `authority.poLanguage` is in `{de, en}`, keep today's exact behavior (still overwrites `humanFacingLanguage` — a de/en PRD still drives the operator-facing axis, unchanged); otherwise, set `documentLanguage: authority.poLanguage` on `continuity.runtime` instead, and **leave `humanFacingLanguage` untouched**.
   - No CLI flag, no new plan-schema field, no change to `promotionArtifacts()` itself (it merely extracts whatever marker is already in the file — see point 2 above) or to the **pristine kickoff scaffold** (`initialPrdContent`, `initialContinuity`, `buildOnboardingKickoffPlan`, the `--language <de|en>` CLI flag GF-066 added) — the provisional `specs/kickoff-*` files are throwaway placeholders per `kickoff-design.md` and always stay bound to the operator-facing language, exactly as today. The document-language axis only becomes reachable at **promotion** time, when a human/agent is actually authoring real PRD/Spec content and writes the marker into the file directly (see below) — there is no CLI param to add because the marker is free-form file content, not a structured input.

**Explicitly out of scope for this item** (deliberate, not an oversight):
- `pipeline.user.yaml` schema, `runtime-projection-v3.mjs`'s manifest generator, `po-gate-profile-repair.mjs` — all three govern the operator-facing axis only and must not change.
- The pristine/provisional kickoff scaffold (`kickoff plan`/`kickoff apply`, `--language` flag) — stays de/en-only, unchanged, per above.
- A dedicated "change an already-promoted document's language later" repair command — none is built here. If a promoted document's language needs to change after the fact, that goes through the ordinary reviewed rebind/promotion path already documented in `kickoff-design.md` (editing the marker and re-promoting), the same discipline any other material PRD change already requires.
- A document written in `de`/`en` while the operator-facing language is the *other* one of that pair (e.g. English chat, German PRD) — the PO's ask was specifically for languages **outside** the operator's own configurable set (French, Chinese, ...); within `{de, en}` the existing 1:1 coupling stays exactly as today.

## Bootstrap/guidance change (documentation only, no code)

`plugins/pipeline-core/skills/pipeline-start/references/kickoff-design.md`'s existing bootstrap-question text (lines 10-22) already asks one language question and frames it as covering "the PRD, Spec, and this project's working documents" — conflating the two axes in its own wording, not just in code. Update it to:
- Keep the existing operator-facing question exactly as worded (still de/en, still asked first, still bound the same way).
- Add a **second, separate, explicitly-asked** question before drafting the real (promoted) PRD/Spec for a hosted project: which language the *document* itself should be written in, offering "same as the operator-facing choice" as the default/recommended answer but accepting any language the PO names. Bind the answer by writing that language's lowercase two-letter code directly into the `<!-- po-language: ... -->` marker while drafting — exactly the existing binding instruction, just no longer restricted to `(de|en)` in wording.
- State explicitly that the document's own **structure/section headings stay in English** regardless of the chosen document language — this is not new: the current text already says the scaffold is "still-English... underneath either way" for the de/en case; this just names it as the general rule for any document language, so only prose content is translated, never the machine-oriented section headings. No validator anywhere depends on heading text (confirmed by direct code reading — see the diff snapshot filed with the fix commit for the file:line evidence), so this is a documentary convention, not an enforced schema.

## Verification requirements

- Every existing test in `continuity-state.test.mjs`, `po-gate-authority.test.mjs`, `pipeline-state.test.mjs`, `onboarding-continuity.test.mjs` (and any suite importing them) passes unmodified — this is an additive/optional-field change, not a schema migration; nothing existing should need updating.
- New regression coverage: (a) a promoted PRD with a non-de/en document-language marker (e.g. `fr`) is accepted at promotion, sets `continuity.runtime.documentLanguage` and leaves `humanFacingLanguage` untouched; (b) `validatePoGateAuthority` then reads that same PRD back successfully against its `fr` marker; (c) a promoted PRD with a de/en marker still overwrites `humanFacingLanguage` exactly as before (preserved-behavior regression guard); (d) the existing `humanFacingLanguage = "fr"` negative test keeps failing — proof the operator-facing axis is still hard-locked.
- Full Verify (`node harness/scripts/verify.mjs`) green, exactly bound to the implementing commit(s).
- This diff touches PRD/authority-validation logic (`po-gate-authority.mjs`, `pipeline-state.mjs`) — architecture/guardrail-adjacent per MP-07 — and needs an independent Critic review before being considered done, mirroring the GF-067/GF-069 pattern.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
