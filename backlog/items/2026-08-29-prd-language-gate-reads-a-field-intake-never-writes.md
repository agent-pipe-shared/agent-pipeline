---
schema: pipeline.backlog-item.v1
id: pipeline.prd-language-gate-reads-a-field-intake-never-writes
type: defect
owner: pipeline
status: open
created: 2026-08-29
sprint: nova
done_when: contains plugins/pipeline-core/lib/onboarding-continuity.mjs pipeline.po-language-propagated-to-configured-pair
source: "Claude/Windows self-audit report (sections 2 and 3.2), reproduced on two independent runners during the 2026-08-29 three-runner greenfield test; diagnosis corrected the same day against the source after the PO restated the intended two-axis language design."
---

# PO-GATE-PRD-LANGUAGE-MISMATCH blocks the happy path, and the obvious fix would destroy a working capability

## What happened

Two of three runners in the 2026-08-29 greenfield test were refused at
`submit-plan` with `PO-GATE-PRD-LANGUAGE-MISMATCH`, after the PO had answered
the language question during intake. Neither could get past it.

**Read the next section before proposing anything.** The first triage of this
finding — and the first draft of this item — diagnosed it as two disconnected
fields that should be collapsed into one. That diagnosis was wrong, and acting
on it would have removed a capability the product is supposed to have.

## The design is deliberate, and it is NOT the defect

The PO restated the intent on 2026-08-29: **document structure is English;
user-facing content may be in any language, `fr` explicitly named as an
example.** That requires two independent axes, and the code implements exactly
two:

| Field | Meaning | Accepted values |
|---|---|---|
| `continuity.runtime.humanFacingLanguage` | the language the agent converses with the human in | `SUPPORTED_LANGUAGES = new Set(["de", "en"])` — `po-gate-authority.mjs` line 73 |
| `continuity.runtime.documentLanguage` | the language of document CONTENT | `DOCUMENT_LANGUAGE = /^[a-z]{2}$/` — `continuity-state.mjs` line 99, i.e. **any** code |

So the branch in `plugins/pipeline-core/lib/onboarding-continuity.mjs`
lines 4752–4756 —

```js
if (new Set(["de", "en"]).has(authority.poLanguage)) { … humanFacingLanguage … }
else if (authority.poLanguage !== null)              { … documentLanguage  … }
```

— is **routing, not an incomplete fix**: `de`/`en` belong to the operator axis,
everything else is a content language. `po-gate-authority.mjs` lines 791–793
says so in its own words:

> Absent whenever the promoted PRD's own marker was {de, en} (the operator-facing
> axis drove humanFacingLanguage instead, unchanged) or whenever no promotion has
> set it at all.

`documentLanguage` being unset for `de`/`en` is correct behaviour. It is not the
bug.

## Where the defect actually is

The `de`/`en` fallback. `po-gate-authority.mjs` line 943:

```js
const expectedDocumentLanguage = active.documentLanguage ?? profileEvidence.humanFacing;
```

For `de`/`en`, `documentLanguage` is legitimately absent, so this resolves
through `configuredLanguage()` (lines 322–334), which is strict on two counts:

```js
if (!SUPPORTED_LANGUAGES.has(sourceLanguage) || !SUPPORTED_LANGUAGES.has(runtimeLanguage)) return null;
if (sourceLanguage !== runtimeLanguage) return null;
```

It reads `language.human_facing` from **both** `pipeline.user.yaml` (source) and
the runtime manifest, and yields nothing unless both are supported **and equal**.

**Working hypothesis, NOT yet confirmed:** intake stores the PO's answer in
`continuity.runtime.humanFacingLanguage` but never propagates it into that
`language.human_facing` pair. Those files keep their seeded `en` while the PO
answered `de`; the gate compares and refuses. Consistent with the audit's
observation that the fallback value was "silently defaulted to `en` and never
asked about".

**The decisive check, still outstanding — do this first:** determine whether ANY
onboarding path writes `language.human_facing` into `pipeline.user.yaml` and the
runtime manifest. If none does, that is the defect and it is narrow. Do not
write a fix before this is answered; the whole shape of the fix depends on it.

## The likely reason no path writes it — and why F07 may be the cause, not a consequence

`pipeline.user.yaml` is **GS-1**, the first entry in `GATE_STRENGTH_PATHS`
(`plugins/pipeline-core/hooks/guard-gate-strength.mjs`), protected in its
entirety on account of one unrelated field, `gates.push_approval`.

If the correct fix is "onboarding must write the PO's answered language into
`pipeline.user.yaml`", then **onboarding is structurally unable to perform it**:
the write lane refuses the Edit, and the shell lane refuses any command naming
the file. That would make
`pipeline.pipeline-user-yaml-file-level-protection-forces-signature-ceremony`
(F07) not a downstream cost of fixing this item, but its **cause** — reversing
the F05 → F06 → F07 ordering the triage assumed. Verify before acting: this is a
hypothesis that fits the evidence, not a conclusion that has been read.

## Proposal

Deliberately not fixed here — the decisive check above comes first. What IS
settled is the constraint every candidate fix must satisfy.

**Forbidden, and this is the point of the item:** any fix that collapses the two
axes. Specifically rejected —

- making the gate read `humanFacingLanguage` instead of `documentLanguage`
  (`humanFacingLanguage` is closed to `{de, en}`, so `fr` content becomes
  unrepresentable);
- writing both fields unconditionally, removing the `if`/`else if` split (the
  split is what keeps a content language from being forced into the operator
  set).

Both of these appeared in this item's own first draft. They would turn a green
gate into a lost capability, and the loss would be silent — nothing tests `fr`
today, so nothing would fail.

The fix direction that stays within the design: make the `de`/`en` path's
fallback resolve from the value the PO actually answered, by propagating that
answer into whatever `configuredLanguage()` reads — or by giving the gate a
source for it that does not depend on a file onboarding cannot write.

## Acceptance

- The decisive check above is answered in writing, with the file and function
  named, before any code changes.
- A test drives an ordinary intake with a PO answer of `de`, then asserts
  `submit-plan` does NOT raise `PO-GATE-PRD-LANGUAGE-MISMATCH` for a PRD genuinely
  in that language — reproducing, then closing, what both runners hit.
- **A test proves a content language outside `{de, en}` still works end to end.**
  `fr` is the named example. This criterion exists specifically to fail any fix
  that collapses the axes, and it must be written BEFORE the fix, because the
  capability is currently untested and would otherwise be lost without a red test.
- `humanFacingLanguage` remains closed to `{de, en}` and `documentLanguage`
  remains open to `/^[a-z]{2}$/` after the fix — asserted, not inspected.
- Existing kickoff-promotion coverage continues to pass.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** Reproduced on two independent runners. The mechanism was then
  read directly in the source, and the FIRST reading was wrong — a deliberate
  two-axis routing was mistaken for an incomplete fix. The corrected reading is
  recorded above along with the wrong one, because the wrong one is the natural
  reading and the next session will otherwise arrive at it again. The remaining
  uncertainty is named as the first task rather than papered over.
- **Assignment:** `sprint: nova`; blocks the 0.6.0 candidate — it is one of the
  two findings that stopped the happy path outright. Chain members:
  `pipeline.prd-binding-precedes-framing-with-no-reopen-path-back` (F05) and
  `pipeline.pipeline-user-yaml-file-level-protection-forces-signature-ceremony`
  (F07), the latter possibly this item's cause rather than its consequence.
- **Date:** 2026-08-29
