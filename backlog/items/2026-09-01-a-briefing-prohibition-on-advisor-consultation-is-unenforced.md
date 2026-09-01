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
