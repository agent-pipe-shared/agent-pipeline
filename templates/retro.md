<!--
═══════════════════════════════════════════════════════════════════════════
TEMPLATE: Block/session retro — Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 3 · 2026-07-03
Source of truth: docs/operating-model.md §7 (feedback loop: mandatory question,
maturity metrics, growth rule, three-artifact archive), §3.2 step 11,
policies/model-policy.md MP-20 (telemetry line), tooling-policy G1 (rule → artifact).
Language note (ADR-0011): template structure/instructions English; FILLED content
GERMAN (primary readers: the PO + future human review of lessons).

USAGE
1. Produced at block/session close as part of the /close ritual (until the skill
   ships: filled manually). Destination: the block's HISTORY.md entry (sections
   1–4 map into the entry) — no separate retro file archive needed; the retro IS
   part of the journal.
2. Fill in German. Delete this comment block.

HARD RULES (checkable)
- The mandatory question (section 1) MUST be answered: a concrete item OR a
  deliberate „nichts". Silence is not an option.
  Why: the lessons loop is the only cross-session learning mechanism; without
  the forced answer it silts up (operating-model §7).
  Check: close report contains the answered question; empty section = ritual failed.
- Every Lehre MUST carry an escalation decision (section 3, column „Eskalation").
  Why: a lesson without a landing artifact evaporates — the growth rule requires
  each rule-shaped lesson to change CLAUDE.md/hook/skill/ADR (G1 assignment).
  Check: the named artifact was actually changed in the same or next commit,
  or a backlog item exists.
- Metrics (section 2) come from the telemetry lines of this block (MP-20,
  `telemetry/costs.md`), not from memory.
  Check: telemetry rows for this block exist; numbers match.
═══════════════════════════════════════════════════════════════════════════
-->

# Retro — {{PROJECT_NAME}} · {{SESSION_ODER_BLOCK_ID}} · {{YYYY-MM-DD}}

## 1. Elephant-Retro (vom Session-Elephant selbst verfasst, operating-model §7)

Leitfrage (wörtlich): **„Was soll die Pipeline nächstes Mal besser machen?"**

> Antwort des Session-Elephant: {{KONKRETES_ITEM oder bewusst „nichts" — Schweigen ist keine Option.}}

the PO wird dazu NICHT abgefragt — eigene the PO-Beobachtungen kommen nebenbei über seinen eigenen Kanal.

Falls Item: als `workflow-improvement` ins Pipeline-Backlog übernommen bzw. als Transfer-Item an den Pipeline-Elephant?
{{ja → BACKLOG_ITEM_REF / nein → Begründung}}

## 2. Reifemetriken (aus telemetry/costs.md dieses Blocks, MP-20)

| Metrik | Wert | Trend/Notiz |
|---|---|---|
| First-Pass-Quote (Goldfish-Abgaben ohne Nacharbeitszyklus) | {{n von m}} | {{sinkt sie: zuerst Harness debuggen, P1}} |
| Look-away (Eingriffe nötig? je Dispatch) | {{n von m ohne Eingriff}} | {{steigt sie: Briefings werden besser}} |
| Nacharbeitszyklen gesamt | {{ZAHL}} | {{>2 je Task = Eskalationsfall gewesen?}} |
| Besonderheiten (Eskalationen MP-05/MP-07, Cache, Fallbacks) | {{KURZNOTIZ oder —}} | |

## 3. Lehren → Eskalationspfad

Pfad je Lehre (tooling-policy G1): **Fakt/Konvention** → CLAUDE.md (Constraint
nummeriert, mit Manifestations-Datum) · **Deterministisch erzwingbar** → Hook/
Permission · **Prozedur** → Skill · **Grundsatzentscheidung** → ADR (+ Register
bei Pipeline-Ebene) · **Pipeline-Arbeitsweise** → `workflow-improvement`-Item.

| Lehre (1–2 Sätze, konkret) | Auslöser (Task/Fund) | Eskalation (Artefakt + Ref) |
|---|---|---|
| {{LEHRE_1}} | {{AUSLOESER}} | {{z. B. "CLAUDE.md Constraint 14 (manifestiert {{DATUM}})" / "ADR-NNNN" / "backlog/NNN"}} |
| {{LEHRE_2}} | {{...}} | {{...}} |

## 4. Abschluss-Checks (Close-Ritual-Anteil)

- [ ] Drei-Artefakte-Ablage ab Rigor-Stufe 1 erfolgt: Spec/Problembeschreibung ·
      Akzeptanzkriterien · Ergebnis/Abschlussbericht (KEINE Chatlogs — §7).
- [ ] Handover-Datei aktualisiert (Merge-Abschluss-Gate, §6).
- [ ] CLAUDE.md-Längen-Gate grün ({{LIMIT}} Zeilen).
- [ ] Telemetrie-Zeile(n) geschrieben (MP-20).
- [ ] Memory-Spiegel widerspruchsfrei zum Repo (Widerspruch → Repo gewinnt).
- [ ] Habe ich die Diffs wirklich gelesen oder nur Critic-Verdikte abgenickt?
      (Lesefähigkeit erhalten; „nur abgenickt" → als Lehre in Abschnitt 3)
- [ ] Auto-Compaction in diesem Block? {{nein / ja → Prozessfehler: „warum wurde
      der Schnitt verpasst?" als Lehre in Abschnitt 3}}
