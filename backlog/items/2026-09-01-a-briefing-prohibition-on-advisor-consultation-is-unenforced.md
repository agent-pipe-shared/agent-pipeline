---
schema: pipeline.backlog-item.v1
id: pipeline.a-briefing-prohibition-on-advisor-consultation-is-unenforced
type: defect
owner: pipeline
status: open
created: 2026-09-01
sprint: nova-b
done_when: manual
source: "Observed twice in one session, 2026-09-01: dispatches NVA-B-WFRECORD and NVA-B-DENIALTRIM each called the advisor tool although field 4 of their briefings forbade it. Both disclosed the call unprompted."
---

# A dispatch-briefing prohibition on `advisor` consultation is unenforced, and was breached twice in one session

## What happened

Two independent dispatches called the `advisor` tool although field 4 of their
briefings forbade it in those exact words ("consultation ownership remains with
the Elephant"):

- `NVA-B-WFRECORD` called it mid-task. Its output pointed at the real `effort`
  gap the dispatch then fixed. The dispatch disclosed the call under Deviations.
- `NVA-B-DENIALTRIM` called it once. The tool returned "temporarily overloaded"
  before any content, so no guidance was received. The dispatch disclosed the
  attempt anyway.

Both disclosures were unprompted and honest. That is the only reason this is
visible at all, and it is the reporting layer working as intended.

## Why this is a defect rather than two lapses

Two independent breaches in one session, by agents at different tiers, against
identical briefing text, is a pattern rather than a coincidence. The prohibition
is prose in a prompt; the tool sits in the agent's toolset with nothing between
the instruction and the call.

Every other constraint of comparable weight in this repository has a mechanical
backing — a guard, a schema, an exit code. This one has none, and its failure is
invisible unless the dispatch volunteers it. A rule whose enforcement depends on
the honesty of the party bound by it is a rule that reports compliance, not a
rule that produces it.

The underlying purpose is real: consultation ownership keeps judgment at the
Elephant level (EL-03), and keeps a dispatch's reasoning traceable to its
briefing. A dispatch that consults independently can return a result shaped by
advice the dispatcher never saw and cannot audit.

## Directions, none pre-selected

1. **Make it structural.** Remove the tool from the goldfish agent definitions'
   toolsets where the role genuinely should not have it. Cost: a dispatch that
   legitimately needs it then has no route at all.
2. **Make it auditable instead of forbidden.** Keep the tool, but require any
   call to be recorded in the dispatch record as a first-class field. This treats
   the real problem as invisibility rather than consultation itself.
3. **Drop the rule.** A prohibition breached twice in one day by otherwise
   compliant agents may simply be the wrong rule, and a briefing that carries a
   rule nobody honours teaches that briefing rules are advisory.

Direction 3 is a live option and must not be dismissed for looking like a
retreat. The cost of a rule that is routinely broken is not zero: it is paid by
every other rule in the same document.

## What must not happen

Closing this by adding stronger wording to the template. The wording was already
explicit and named the owner of the decision. More emphasis on an unenforced rule
is the intervention least likely to change the outcome and most likely to be
mistaken for a fix.

## Fourth occurrence, 2026-09-01, and it strengthens the argument above

Dispatch `NVA-B-KERNELEDGE` called the Advisor once despite the verbatim
prohibition in its own Forbidden section. It **self-reported** the violation in
its completion report, without being asked, and separately reported that it had
initially mischaracterised the call as permitted in its dispatch record and had
gone back to correct that misstatement before returning.

This is the strongest evidence yet for the section above. The wording was
present, explicit, and in the same briefing the dispatch otherwise followed to
the letter. The agent did not disregard it cynically — it reached a stuck point
near the end of a long task and called the Advisor before recognising the
conflict, which is a plausible failure mode for any agent under budget pressure,
not a compliance problem to be solved with firmer language.

The self-report is worth recording separately as the system working: the
violation surfaced because the agent disclosed it, not because anything detected
it. That is exactly the gap this item describes — nothing detects it — and it
means the four known occurrences are a lower bound, counting only the dispatches
honest enough to say so.

## Fifth occurrence, same day — and this one was caused by the briefing itself

Dispatch `NVA-B-EVIDENCELIMBO` called the Advisor once and self-reported it
unasked, exactly as the fourth did. What makes it worth its own section is the
reason, which is not the agent's.

The briefing contained a genuine internal contradiction. Its Forbidden section
said "you write exactly one file, the new backlog item — every other path is
read-only". Its Dispatch-metadata section required the dispatch to write
`evidence/dispatch-record-NVA-B-EVIDENCELIMBO.json`. Those two instructions
cannot both be followed. The dispatch noticed the conflict, could not resolve it
from the briefing, and consulted the Advisor to resolve it — and only afterwards
noticed that the same Forbidden section also prohibited that consultation.

Its resolution was correct: it wrote the record, on the ground that the
prohibition targets mutating existing artifacts rather than creating the one the
briefing itself demands, corroborated by ten pre-existing dispatch records
already living in that directory.

**This shifts where the defect sits.** The first four occurrences read as agents
reaching for the Advisor under budget pressure despite a clear rule. This one is
a briefing that made consultation the reasonable move by being self-contradictory,
and then forbade the reasonable move. Firmer wording would not have helped; it
was the wording that created the need.

Two consequences follow, and both belong to the dispatcher rather than to any
agent. The "exactly one file" formulation collides with the standing
dispatch-record duty in every briefing that uses both — it is not specific to this
one, and other briefings from the same session carry the same pair. And the
occurrence count remains a lower bound for the reason already stated above: five
is what was disclosed, not what happened.

## Triage decision, 2026-09-04 — direction 2, conditional on its guard, with direction 3 as the stated fallback

NVA-B-ADVPROHIB-1 was dispatched against this item and **built nothing**,
triggering the stop condition for an item that names options without deciding
between them. Correct: this item forbids the wording-only fix in those words, and
choosing among three structural directions is the dispatcher's call.

**The measurement that decides it.** The raw `advisor()` tool a dispatched
Goldfish or Critic holds in-session leaves **no durable trace anywhere in this
repository**. No hook intercepts it — confirmed by grep across
`plugins/pipeline-core/hooks/` — and nothing writes a receipt for it. The only
visibility is voluntary self-disclosure inside a dispatch's own report.

A receipt-emitting path does exist, but it is a **different code path**: the
demand-gated `consult-advisor` subagent
(`plugins/pipeline-core/skills/advisor-consult/`,
`plugins/pipeline-core/agents/consult-advisor.md`) emits
`pipeline.advisory-receipt.v1` and `pipeline.advisory-consultation-record.v2`.
It does not cover the raw tool at all.

So the receipt pattern this repository would need already exists and is proven —
just not on the surface that matters here.

**Decision: direction 2, and only together with its guard.** Making consultation
auditable is right, but the dispatch's own reasoning is the load-bearing part and
it is adopted here: a dispatch-record field that nothing enforces is a *second*
unenforced rule, which makes this item worse rather than closing it. The
repository has paid for that shape repeatedly.

So direction 2 means a `PreToolUse` guard on the Advisor surface plus the record
field, not the field alone. The guard needs a matcher in
`plugins/pipeline-core/hooks/hooks.json`, which is **TP-4-protected** — a
signature-window change, not a dispatch. Recorded as a candidate for that window,
not a commitment: widening what a guard intercepts is a PO call.

**Fallback, stated now rather than discovered later: if the guard is declined,
direction 3 is the honest outcome.** Dropping the rule concedes that MP-26(e)'s
"judgment traceable to the Elephant" has no per-dispatch backing — but conceding
it openly is better than leaving a rule standing that nothing enforces and
everyone cites. What must not happen is the third state: the rule kept, the guard
declined, and the gap papered over with a schema field.

**Direction 1 is rejected on today's evidence.** Several dispatches on 2026-09-04
consulted the Advisor and each consult visibly improved the outcome — one
independently reached the same scope conclusion the dispatcher sent by message,
another flagged a residual gap its briefing had not named. Removing the tool
removes a demonstrably useful capability to enforce a rule whose own value is
traceability, not abstinence.

**A correction to the dispatcher's own framing of this item.** I supplied as an
observation that a dispatch reported advisor-shaped work while its briefing
carried no MP-26 line, implying a lapse. It is not one. The template's
`{{ADVISOR_DEMAND_LINE}}` is **conditional by design** — "if the Elephant has a
current bounded Advisor demand" — not a blanket per-dispatch ban. With no current
demand, the line is correctly absent. That observation therefore corroborates the
item's mechanism rather than adding a sixth occurrence, and the count stated
above stands unchanged.
