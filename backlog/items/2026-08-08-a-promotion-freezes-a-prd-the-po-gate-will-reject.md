---
schema: pipeline.backlog-item.v1
id: pipeline.promotion-freezes-a-prd-the-po-gate-will-reject
type: defect
owner: pipeline
status: open
created: 2026-08-08
due: 2026-08-15
source: "PO, 2026-08-08, two independent unhappy-path transcripts against the 0.5.4 local candidate, one per runner, on separate greenfield browser-game projects. The Claude session reached a deadlock it could not leave without the human running `sed -i` by hand; the Codex session reached a circular gate block with no typed recovery and stopped correctly."
---

# The promotion freezes a PRD the PO gate will then reject, and repairing it bricks the session

## The mechanism, traced in code rather than inferred

Three facts, each verified at a line:

1. **The kickoff seed writes the marker itself.** `initialPrdContent()`
   (`plugins/pipeline-core/lib/onboarding-continuity.mjs:2884`) emits
   `<!-- technical-spec-sha256: ${specSha256} -->` as line 2 of the provisional
   `specs/kickoff-*/prd_*.md`, right under `<!-- po-language: … -->`. The
   provisional artifact satisfies the gate by construction.
2. **The PO gate requires that marker.** `po-gate-authority.mjs:59` matches
   `^<!-- technical-spec-sha256: ([0-9a-f]{64}) -->$` and `:91` spells the
   requirement out in its refusal text.
3. **The promotion never checks for it.** `promotionArtifacts()`
   (`onboarding-continuity.mjs:3487`) validates that the three files exist, that
   the plan is the PRD and not the spec, that the spec is the neighbouring
   `spec.md`, that all three share a directory, and that none of them reuses a
   kickoff artifact. It reads their bytes, takes their SHA-256, and binds them.
   It does not look inside the PRD.

And the instruction the human-facing side gives:

4. **`skills/pipeline-start/SKILL.md` never mentions either marker.** It
   specifies the directory (`specs/YYYY-MM-DD_short-topic/`), the three
   filenames, what `design-input.md` must and must not contain, the PRD and Spec
   section lists, the traceability table, and when a Mermaid diagram is
   warranted. The two HTML-comment markers that decide whether the result can
   pass the gate appear nowhere.

## What follows, and it is not a user error

An agent that follows the instruction exactly produces a PRD without the marker,
promotes it, and only then learns from the gate that the marker is required.
Adding it changes the PRD's bytes, so the promotion's recorded hash no longer
matches the file. The continuity reader fails, session readiness becomes
`continuity-observation-unavailable`, and the lifecycle guard refuses every write
and nearly every shell command in that state.

The observed session recorded both hashes:

```
bound (promotion history): 0b2513ae35d8eaca824bf3cc196cb8ca89e4…
actually on disk:          06e0737c255c03458e3b86c7c4c47c5f4a68b2108d42e8de7b79421497154b4a
```

From there the agent could not act at all. There is deliberately no human
override for this readiness class. `git restore` was unavailable because a
freshly onboarded repository has no commit yet — the greenfield case has no undo.
The only way out was the human typing:

```
sed -i '2d' <path>/specs/<package>/prd_<feature>.md
```

That is the shape to weigh: **the documented path leads into a state whose only
exit is a human editing a file by hand.**

## The second runner reproduced it without touching anything

A Codex session on a separate greenfield project reached the same wall from the
same instruction, and its transcript is the cleaner evidence because it never
edited the bound PRD at all. It wrote `design-input.md`, `prd_amon-sul.md` (with
`<!-- po-language: en -->`, without the spec marker) and `spec.md`; ran
`kickoff promote plan`, which **validated**; ran `kickoff promote apply`, which
**bound**; then ran `submit-plan` and was refused with
`PO-GATE-PRD-SPEC-MISMATCH`.

It then tried every typed recovery the plugin offers and found each one closed:

| Attempt | Result | Why it cannot apply |
| --- | --- | --- |
| `po-authority-rebind-plan` | `PO-REBIND-STATE`, zero mutation | the rebind family is scoped to an already-approved implementation plan |
| `bind-plan-spec` | requires `--expected-plan-sha256` / `--expected-spec-sha256` | those come from `planApproval.poGateAuthority`, which cannot exist because `submit-plan` is blocked |
| `continuity-cas`, `plan-repair`, `document-binding.mjs` | nothing applicable | none addresses a pre-approval authority binding |

That is a **circular block**: `submit-plan` demands the marker; the marker cannot
be added because the bytes are bound; the rebind demands an approval that cannot
exist because `submit-plan` is blocked. The session stopped and asked the human
for permission to repair the Pipeline itself — the correct behaviour, and also
the proof that no sanctioned path was reachable.

**The generalisation this forces.** Every typed recovery in the authority family
begins *after* plan approval. The error class demonstrated here is created
*before* it. A lifecycle whose repair vocabulary starts one state later than its
first failure has, by construction, no exit from that first failure.

**Two runners, one instruction, the same marker-less PRD.** Neither transcript is
a mishandling to be corrected by a better-behaved agent: both followed
`SKILL.md` and both produced a file the gate refuses.

## The error name sends both readers the wrong way

`PO-GATE-PRD-SPEC-MISMATCH` names a *mismatch* between two hashes. The condition
it actually reports here is an *absent line*. The two sessions failed in the two
directions the name invites: the Claude session read it as "add the marker" and
broke the binding doing so; the Codex session read it as "rebind the hashes" and
spent its budget looking for a rebind that does not cover this state. A code that
names the wrong condition costs more than a silent one, because it is confidently
misleading. Whatever else changes, this refusal must distinguish "the marker is
missing" from "the marker disagrees with the spec", and say which one it means.

## The refusal text names two routes, and the observed state is a third

`SPEC_REPAIR` (`plugins/pipeline-core/lib/po-gate-authority.mjs:89`) is not
silent — it is carefully written, and it is wrong for exactly this state. It
offers:

- *"Bring those two documents back into agreement"* — which is what the Claude
  session did, and which breaks the promotion's byte binding and costs the
  session its readiness;
- *"If the plan is already approved and the Spec changed during implementation,
  use the sanctioned rebind"* — which is what the Codex session tried, and which
  refuses with `PO-REBIND-STATE` because no approval exists.

The text models two lifecycle states: not-yet-bound (edit freely) and
approved-and-drifted (rebind). The observed state is a third — **promoted and
byte-bound, not yet approved** — where the first instruction is destructive and
the second is inapplicable. Both agents followed the advice in front of them and
both failed, in the two different ways the two sentences invite.

Whatever else changes, this message must recognise the promoted-unapproved state
and must not tell that state's reader to edit the bound documents.

## Why it is not enough to fix the instruction

Adding the two markers to `SKILL.md` closes the observed run and leaves the trap
in place, because the trap is that a byte-binding transaction accepts a subject
it can already tell will fail the gate it is binding the subject *for*. Any other
route to a marker-less PRD — a template, a copied package, a hand edit, a future
authoring path — reaches the same dead end. The instruction is a contributing
cause; the missing precondition check is the defect.

## Direction, not a design

1. **`kickoff promote plan` refuses a PRD that cannot pass the gate it is being
   promoted into.** The check belongs at plan time, before anything is frozen,
   and its refusal names the exact line to add and the value it must carry. One
   check converts a session-bricking dead end into a one-line refusal.
2. **Check both markers, not only the spec binding.** `po-language` has the same
   shape: required by the gate, seeded into the provisional artifact, absent from
   the instruction, and byte-bound after promotion. The observed session hit this
   one too, as a second blocker at the same gate.
3. **State the markers in `SKILL.md`** where the design package is specified —
   as part of the file contract, not as a footnote. This is the cheap half and
   should not wait for (1).
4. **Decide whether the promotion should write the markers rather than demand
   them.** The seed already computes both values; the promotion knows the spec's
   hash because it is hashing it. Requiring a human-authored file to carry a
   value the transaction is computing anyway is a question worth asking once,
   rather than assuming the requirement is load-bearing. Note the counter-case
   before deciding: a promotion that edits its own subject changes the bytes it
   is about to bind, which is the same class of problem read from the other end.
5. **Give the authority family a recovery that covers the pre-approval state.**
   Even with (1) in place, a bound package that cannot pass its gate must have a
   typed way out that does not require a human to edit a file or delete a
   directory. The Codex transcript shows the current vocabulary starts one
   lifecycle state too late; that gap is independent of how the package got
   there.
6. **Separate "marker absent" from "marker disagrees" in the refusal**, per the
   section above. Cheap, and it is what decides which of the two wrong recoveries
   an agent reaches for.

## Related

- `2026-08-08-no-design-to-implementation-handover-exists.md`
- `2026-08-08-a-promoted-feature-can-never-pass-the-plan-gate.md` (2026-08-07) —
  closed by `b649567`; this item is a different failure at the same gate, reached
  after that fix, not a regression of it.
- `2026-08-08-a-permitted-edit-drops-the-session-into-an-unrecoverable-readiness-class.md`
  — the second half of the observed deadlock: what happens once the marker is
  added.
- `2026-08-08-there-is-no-sanctioned-way-to-start-over.md` — what the session had
  to do next, once it was stuck.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
