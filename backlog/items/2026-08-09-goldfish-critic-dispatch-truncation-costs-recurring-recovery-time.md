---
schema: pipeline.backlog-item.v1
id: pipeline.goldfish-critic-dispatch-truncation-costs-recurring-recovery-time
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-09
source: "PO observation during the 2026-08-09 evaluation/fix session: dispatched Goldfish/Critic subagents keep ending their turn mid-task without a final report, each requiring an Elephant-side diagnose-and-resume cycle; explicit PO instruction to defer investigation until after the current local candidate ships, since fixing it now would itself cost more of the time it is meant to save."
due: 2026-08-23
---

# Goldfish/Critic dispatches truncate mid-task often enough to cost real recovery time — needs a dedicated investigation after the current candidate ships

## What happened

In this single session, three separate dispatches ended their turn without
producing the mandatory final report, each requiring the Elephant to
diagnose and resume:

1. **GF-066** (language kickoff parameter) — ended mid-sentence
   ("Now update `applyAction` function definition and its call site:").
   Recovery: read `scratch/dispatch-record-GF-066.json` (thin,
   `outcome: "in-progress"`), ran the affected suites directly, found a real
   bug (a stale 5-parameter call site left over from a signature change),
   sent a purely procedural resume. Cost: one extra diagnostic round-trip.
2. **GF-069's first Critic-review attempt** — not a mid-task truncation, but
   a related dispatch-mechanism failure with the same symptom (no usable
   result on the first attempt): dispatched with Agent-tool
   `isolation: "worktree"`, which put the Critic in a fresh git worktree that
   does not contain this repo's gitignored `scratch/`/`evidence/` directories
   — the Critic correctly fail-closed on a "missing machine evidence" briefing
   violation instead of proceeding. Elephant-side fix: redispatch without
   worktree isolation (see [[feedback-critic-dispatch-must-not-use-worktree-isolation]]
   in the Elephant's own memory, now recorded there). Cost: one full Critic
   dispatch spent on nothing but discovering the wrong isolation mode.
3. **GF-070** (document-language decoupling) — ended mid-sentence ("Now
   let's add the new regression checks near the 'missing, duplicate and
   wrong-language markers' test."), with two of four planned production
   files already edited (uncommitted) in the shared working tree, and its
   dispatch record's `log` field left at only the opening bootstrap entry —
   none of the substantial progress it had made was appended, contrary to
   the briefing's explicit "append to log as you go" instruction. Recovery:
   purely procedural resume naming only what remained.
4. **The redispatched GF-069 Critic review itself**, after the worktree-
   isolation retry, truncated a second time on genuine mid-task grounds —
   ended mid-sentence ("Now let me record Phase A candidates to the
   scratchpad before moving to the evidence gate.") with its own scratch
   subdirectory created but still empty (nothing persisted yet, despite the
   template's own report-durability rule to append candidates as found).
   Recovery: purely procedural resume.

`templates/prompts/goldfish-task.md`'s own USAGE notes already document this
as a known, recurring pattern independent of this session — item 8 names the
read-dispatch-record-then-procedural-resume recovery as the established
practice, and item 9 ("Commit as soon as green, not only at the end") cites
"sixteen truncations" observed in a single prior block as the reason that
rule exists at all. This is not a one-off; it is a standing tax on every
session that dispatches Goldfish/Critic subagents.

## Why it matters

Every truncation costs an Elephant-side diagnostic round-trip (read the
dispatch record, decide whether it is a genuine truncation or a real defect,
compose a purely-procedural resume, wait again) on top of the dispatch's own
runtime. Across a single session this adds up to a meaningful fraction of
total session time and cost — exactly the PO's observation. The template's
own mitigations (dispatch-record-first, commit-as-soon-as-green, log-as-you-go)
are already in place and are still not preventing it, which suggests either
they are not being followed reliably by dispatched agents, or there is a
deeper cause (host/runner turn limits, context-window pressure inside long
dispatches, tool-budget miscalibration) that the existing mitigations only
partially paper over.

## Explicit scope decision (PO, 2026-08-09)

**Do not investigate or fix this now.** The current session's priority is
shipping the sixth local 0.5.4 candidate; a truncation-root-cause
investigation is itself exactly the kind of open-ended, potentially deep
debugging work that would consume more time than it saves if started
mid-release. Revisit this item once the candidate has shipped.

## Direction (for the deferred investigation)

- Collect concrete instances across sessions (this item's three above, plus
  the "sixteen truncations" the template already references) rather than
  theorizing from a single case.
- Distinguish failure modes: (a) genuine turn/output truncation mid-response,
  (b) dispatch-mechanism misconfiguration (like the worktree-isolation case
  above, which is not a truncation at all but presents identically from the
  Elephant's side), (c) the dispatched agent not following its own
  briefing's log/commit-as-you-go discipline even when it has turns left.
- Check whether tool-budget sizing, task complexity/file-count, or effort
  tier correlates with truncation frequency (GF-070's briefing spanned 4
  production files + a doc + new tests across two axes — plausibly near or
  past what fits reliably in one dispatch turn budget at xhigh effort).
- Consider whether the dispatch-record `log` field should be enforced more
  cheaply/automatically rather than relying on the dispatched agent to
  remember to append it under time pressure — the exact failure GF-070 hit.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
