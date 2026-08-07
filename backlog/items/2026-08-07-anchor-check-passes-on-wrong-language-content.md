---
schema: pipeline.backlog-item.v1
id: pipeline.anchor-check-passes-on-wrong-language-content
type: defect
owner: pipeline
status: open
created: 2026-08-07
source: "Measured by the PHX-R3-RESCOPE dispatch and re-verified independently by the Elephant. PO decision (APS, 2026-08-07): accepted for implementation."
---

# The doc-contract anchor check can report green while a link points at German content

## Description

`harness/scripts/check-doc-contracts.mjs` validates that a Markdown link's
fragment resolves to an anchor in the target file. It does not check *which*
anchor, in a file that deliberately contains two parallel heading sets.

`docs/operating-model.md` is bilingual: the English content runs to the
DE-reference marker, and a full German reference translation follows it (the
German half begins around `:340`). `collectAnchors` returns **31 anchors for 20
headings**, with English and German slugs sharing one namespace. On top of that,
two hand-planted alias anchors sit inside the German half — verified
independently:

```
563:<a id="7-feedback-loop"></a>
583:<a id="8-projekt-kalibrierungsschicht"></a>
```

The measured consequence: `backlog/README.md` already uses the anchor-link form,
and **4 of its 5 links name headings that no longer exist** — yet the gate is
green, because those two aliases resolve them into the German half.

## Why this is a gate-honesty defect, not a link-hygiene one

The failure is not that some links are stale. It is that the check reports
success for a link a human following it would find broken or in the wrong
language. A gate whose green means less than a reader assumes is worse than no
gate on that dimension, because it displaces the manual check that would have
caught it.

It also refutes a design assumption that was about to be relied on: the residual
design proposed replacing drift-prone `§N.M` prose citations with anchor links
*because* anchor links are machine-checked and therefore cannot silently drift.
The remedy still stands on other grounds, but that justification does not — an
anchor link in this repository can drift exactly as silently, and the existing
anchor-link user demonstrates it today. CLAUDE.md's own bilingual-skip
convention says agents must not read below the marker, which makes a link that
lands there additionally wrong for the intended reader.

## Triggering situation

Found 2026-08-07 while re-deriving residual R3's citation inventory against the
operating model's real heading structure. Recorded as a follow-up rather than
fixed in that dispatch, whose scope was design-only. The two alias anchors and
the German-half boundary were re-verified by the Elephant before this item was
written.

## Affected artifact

`harness/scripts/check-doc-contracts.mjs` (`collectAnchors` and the fragment
resolution that consumes it), `docs/operating-model.md` (`:563`, `:583`, and the
bilingual structure generally), and `backlog/README.md` as the currently
affected consumer.

## Proposal

**Owner: PO.** Accepted for implementation; the shape is a real choice.

1. **Scope anchors to the authoritative half.** When a file carries the
   DE-reference marker, collect anchors only from above it, so a link into the
   German half fails. Closest to what the convention already asserts, and it
   makes the two planted aliases fail loudly rather than silently succeed —
   which is the point, but it means `backlog/README.md`'s four links go red on
   the same commit and must be fixed together.
2. **Keep both halves resolvable but require the fragment to match a real
   heading slug**, dropping bare `<a id>` aliases from the anchor set. Narrower;
   it catches the alias case without changing bilingual behaviour, but leaves a
   correctly-slugged German heading resolvable from an English context.
3. **Report rather than fail** on a cross-marker resolution for one release, to
   size the blast radius before turning it into an error.

Whichever is chosen, the fix and the four `backlog/README.md` links belong in
the same change: turning the check honest while leaving its first four findings
unfixed would leave the gate red for everyone else.

**Sequencing note.** This is one of three follow-ups the PO accepted together;
the sibling citation lint (`§N` / `§N.M` prose references) is the one that makes
the defect class non-recurring, while this one makes the existing gate mean what
it says. They are independent and can land in either order.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** ACCEPTED for implementation. PO decision (APS, 2026-08-07),
  taken together with the citation lint and the operator-visible fix string in
  `harness/scripts/check-claude-md-lines.mjs:59`.
- **Rationale:**
- **Assignment (if accepted):**
- **Date:** 2026-08-07
