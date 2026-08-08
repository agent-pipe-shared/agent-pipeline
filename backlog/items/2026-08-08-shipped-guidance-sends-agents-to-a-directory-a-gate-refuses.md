---
schema: pipeline.backlog-item.v1
id: pipeline.shipped-guidance-sends-agents-to-a-directory-a-gate-refuses
type: defect
owner: pipeline
status: resolved
created: 2026-08-08
due: 2026-08-15
source: "PO, 2026-08-08, live instance observed against the first 0.5.4 local candidate: Write(scratch/resume-card.json) refused in the draft phase. Verified in code by the Elephant before filing."
---

# The shipped instruction sends every agent to `scratch/`, and a different guard refused it

## Two guards, one directory, and only one of them had been asked

`skills/pipeline-start/SKILL.md` §"Scratch space" tells every agent that
`scratch/` is "the only location the containment guard permits without an
exception", and the Goldfish briefing template says the same thing at greater
length. That claim was true, and about the wrong guard.

`guard-devplan.mjs` kept its own list — `DEFAULT_EXEMPT_PREFIXES = ["docs/",
"specs/", ".claude/", "backlog/"]` — and `scratch/` was not in it. So in the
`draft` phase, which is the phase every fresh project starts in, a write to
`scratch/` was refused by the dev-plan gate with a message about plan approval,
which has nothing to do with writing a throwaway probe script.

An agent following the shipped instruction was therefore refused by a guard the
instruction had never cleared, and sent to look at a plan gate it had no
business in. Same shape as the rest of this block: the assurance held, and the
signpost pointed somewhere else.

## A second, smaller claim that was simply untrue

The same paragraph described `scratch/` as "gitignored". It is — in the
Pipeline's own repository, whose `.gitignore` has the entry at line 20. A fresh
consumer project gets no `.gitignore` from onboarding at all, so nothing there
is ignored, and the shipped sentence asserted a property of the author's
checkout as if it were a property of the reader's.

This is the same class as the `harness/` path references filed in
`2026-08-08-shipped-artifacts-assume-the-pipelines-own-repository.md`: an
artifact written from inside the source checkout, where the claim happens to
hold.

## Resolution (2026-08-08, GF-057)

1. **`scratch/` added to `DEFAULT_EXEMPT_PREFIXES`** in `guard-devplan.mjs`, with
   the reasoning recorded at the constant. It is the safest of the five entries
   rather than the riskiest: the other four are tracked directories whose
   contents ship, while `scratch/` holds throwaways by definition, and code
   smuggled there is not implementation until it moves to a real source path —
   which the gate still catches.
2. **`DP27`/`DP27b` pin the exact phase the consumer meets first.** `DP08` already
   covered the exempt prefixes generically; the new pair fixes the `draft` case
   with the `Write` tool, because that is the shape of the observed refusal, and
   asserts alongside it that a draft-phase write to a real source path is still
   blocked. Suite: 38 → 41 cases.
3. **The skill's two claims corrected**: it now names both guards rather than
   one, and says plainly that onboarding does not add `scratch/` to a project's
   `.gitignore`, because nothing here writes into a `.gitignore` a project
   already owns.

## Not done, and deliberately

Seeding a `.gitignore` entry during onboarding would make the original claim true
rather than correcting it, and that is the better product answer. It is not done
here because it changes the onboarding transaction — a consequential, separately
reviewable change — to fix a documentation defect. Filed as a direction, not
smuggled into this fix:

- **Direction:** decide whether onboarding should append `scratch/` to an
  existing `.gitignore` (and create one if absent), or whether writing into a
  file the project owns is a line the seed should not cross. Either answer is
  defensible; the current state, where the skill tells the reader to do it
  themselves, is the honest interim.

## Related

- `2026-08-08-shipped-artifacts-assume-the-pipelines-own-repository.md` — the
  systematic version of the second defect.
- `2026-08-08-there-is-no-sanctioned-way-to-start-over.md` — same block, same
  shape: a named place absent, so each session invents one.

## Triage

- **Decision:** accepted and fixed in the same session it was filed; the residual
  `.gitignore` question recorded above as a direction rather than closed.
- **Rationale:** the fix is one list entry and two test cases, and the defect
  blocks the very first thing a fresh consumer's agent is told to do.
- **Assignment:** GF-057, Elephant.
- **Date:** 2026-08-08
