---
schema: pipeline.backlog-item.v1
id: pipeline.po-standing-directions-must-be-enforced-not-remembered
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-27
priority: P1
release: 0.8.0
sprint: alfred
source: "Elephant session 2026-10-27: after a context compaction three acknowledged PO directions were dropped; PO direction that hooks, templates and hand-backs carry such rules fresh"
done_when: manual
---

# PO standing directions reach the session through hooks, templates and hand-backs, not through memory

## Observed (2026-10-27)

After a context compaction the Elephant dropped three standing PO directions that had been acknowledged in chat: (1) fan out
read-only analyses for rows still at 25 before dispatching slices, (2) held patches get light verification only (apply check,
Goldfish log counts, new cases; full suites once in Full Verify), (3) every checkpoint/grant/repair mechanism is
runner-neutral. They lived in chat and per-user memory. The Pipeline already has the persistent homes (the state.md decision
register, roles, policies, backlog); what was missing is that the rules reach the acting agent fresh at the moment of action.

The same day the Elephant asked the PO twice for a decision the PO had already given (rows whose only open entries are the
Verify run, the Critic and acceptance count at 75). The rule was in the notes and was not applied.

## PO direction (2026-10-27)

"Die Pipeline hat solche Erinnerungsdateien eigentlich schon ... die hooks und direkten Umsetzungsbelege müssen sowas in den
templates und Rückmeldungen haben, damit es immer frisch ist." No new memory or rules file. The existing canonical sources
are projected into the places the agent reads at the moment it acts.

## Wanted

1. Dispatch templates (`templates/prompts/goldfish-task.md`, `critic-review.md`) and the generated briefings carry the rule
   text that binds that role at dispatch time (for example the light verification duty for held patches and the
   runner-neutral wording duty), generated from the canonical source (roles/, policies/, guardrails/) so the text cannot
   drift from it.
2. Hand-back and hook messages carry the next-step rule at the moment it applies. Examples: the held-patch hand-back says
   which verification the Elephant owes and that full suites are a Full-Verify duty; the budget-checkpoint notice names the
   resume route; a slice-queue refusal names the missing recon note.
3. Session start and post-compact hook output lists the rules of the active sprint decision register that are mechanical to
   restate (one line each, id plus pointer), generated from docs/state.md, so a compacted session starts from the record.
4. Each projected rule has a test that asserts the template, hook or hand-back text contains the id (or the generated text),
   so a drifted or missing projection fails Verify. Mechanical gates where cheap: `slice-queue add` for a row below 75
   requires an existing `reconNote` path; `verify-held-patch.mjs` defaults to light mode and full mode needs a flag; runner
   adapters read back typed `unenforced` instead of silently green.
5. A rule with no projection and no gate is listed as `advisory` in the register, so the gap is visible.

## Not wanted

A new tracked directions file, a longer CLAUDE.md, or reliance on per-user memory.
