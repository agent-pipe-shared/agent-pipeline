# ADR-0014: Critic-Kontrakt

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

**In brief (English):** This ADR institutes a formal contract for the "Critic" review role: mandatory triggers by risk level, strict input limited to spec + diff + guardrails (never chat history or the implementor's own reasoning, to avoid contamination and self-confirmation bias), a structured, evidence-based findings list (no numeric score) that must include a "deliberately not flagged" rubric plus a trajectory check (were the claimed checks actually run?), and an anti-overreporting clause so CI-enforced checks aren't re-flagged. A later revision (2026-07-04) addresses an infrastructure discovery — subagents auto-load the full project CLAUDE.md and a stale git-status snapshot at spawn — by keeping that autoload as-is but adding a disclosure duty and banning use of the injected snapshot as a freshness reference.

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 2 · Stand 2026-07-03

**Status:** akzeptiert (2026-07-03, Checkpoint 1) · **revidiert um CLAUDE.md-Autoload-Disclosure-Pflicht + Snapshot-Verbot (the PO, 2026-07-04 — s. Abschnitt „Revision")** · **Grundlage:** Register E12 + Auflage A10

## Kontext

Frischer Reviewer-Kontext ist offiziell dreifach begründet (Selbstbestätigung, Kontamination, Anchoring); **Overreporting** ist der dokumentierte Failure-Mode: „A reviewer prompted to find gaps will usually report some, even when the work is sound". Die Google-Essenz ergänzt die Trajektorien-Prüfung — wurden die behaupteten Checks wirklich ausgeführt? Der Bestand hat Critic-Substanz ohne Institution. Critic-Befund L2-04 → Auflage A10 (Rubrik-Benennung).

## Entscheidung (E12, wortgetreu)

> Critic-Kontrakt: Pflicht-Trigger nach Risikostufe; nie Chat-Verlauf als Input; Befundliste mit Evidenz + „Bewusst nicht beanstandet"-Rubrik + Trajektorien-Prüfung; Anti-Overreporting

Präzisierung:

- **Input strikt:** Spec + Diff + Guardrails (+ Evidenz-Artefakte). Nie Chat-Verlauf, nie Implementor-Begründungen. Isolationsstufen → [ADR-0003](0003-rollen-implementierung-subagents.md).
- **Output:** strukturierte Befundliste (Gap/Risiko + Evidenz mit `file:line` + Spec-Bezug); kein Score; Pass/Fail nur, wo ein Gesamturteil nötig ist.
- **Rubrik (Auflage A10):** Der read-only-Critic führt „**Bewusst nicht beanstandet**" (er ändert nichts); „Bewusst NICHT geändert" bleibt die Rubrik schreibender Rollen (Goldfish-Bericht).
- **Anti-Overreporting-Klausel** + Skip-Regel: nichts flaggen, was CI/deterministische Gates bereits erzwingen.
- **Pflicht-Trigger nach Risikostufe** („Risikostufe" heißt im operating-model.md §4.2 „Risikoklasse"; die Klassen hoch/mittel/niedrig sind dort definiert). Kanonischer Trigger-Wortlaut (wortgleich mit operating-model.md §4.2/§3.3 und [ADR-0003](0003-rollen-implementierung-subagents.md)): „Jeder Architektur-/Guardrail-/Security-Diff läuft mit Critic Fable 5 / `max` UND zusätzlich in `--bare`-Isolation. Rigor-Stufe 2 macht den Critic zur Pflicht (Standard: Sonnet 5 / `max`); Fable 5 / `max` gilt dort nur, wenn zusätzlich die Risikoklasse hoch ist ODER ein Architektur-/Guardrail-/Security-Diff vorliegt." — Isolationsstufe → ADR-0003, Modelle → [ADR-0006](0006-modell-effort-policy.md).
- **Evidenz-Nachtrag (<PROJECT_B> S39, 2026-07-05):** Ein Critic der Standard-Isolationsstufe (Modell dort: Fable 5 per riskZone-Trigger; ob Sonnet dieselben Befunde gefunden hätte, ist die offene A/B-Frage, s. Retro-Item) fing auf einem riskZone-Diff (<PROJECT_B>, Projekt-Constraint `packages/**`) 2 BLOCKER der Klasse „Interaktion NEU↔BESTAND" — eine neue Funktion machte eine geplant nicht-abbrechbare Aktion sprach-/Google-abbrechbar, und eine unangetastete Bestandsautomation umging deterministisch ein neues Wach-Gate —, die der Implementor-Blick allein plausibel nicht sah. Belegt empirisch die Pflicht-Trigger-Zeilen oben.

## Konsequenzen

**Positiv:** Unabhängigkeit wird Institution statt Rohform; Befunde sind evidenzbasiert nachprüfbar; die Trajektorien-Prüfung schließt die Lücke „Gates behauptet statt ausgeführt".

**Negativ:** Kosten pro Review (Modelle gemäß ADR-0006); Pflege der Trigger-Tabelle je Risikostufe.

**Risiko:** Anti-Overreporting kann in Under-Reporting kippen — die Rubrik „Bewusst nicht beanstandet" macht Auslassungen explizit und damit prüfbar.

## Verworfene Alternativen

- **Score-basiertes Judging** — belegter Bias-Katalog (Position, Verbosity, Self-Preference); Anthropics eigene Praxis: ein Call gegen eine feste Rubrik war konsistenter als mehrere Judges.
- **Critic mit Chat-Verlauf** — Kontamination; exakt der Bias, den frischer Kontext offiziell vermeiden soll.
- **Nur CI statt Critic** — CI prüft Maschinencheckbares; Spec-Treue, Scope und Edge Cases brauchen Judgment.

## Revision (the PO, 2026-07-04): CLAUDE.md-Autoload — dokumentierte Akzeptanz + Disclosure-Pflicht + Snapshot-Verbot

Monitoring der <PROJECT_B>-Migration (2026-07-04) deckte auf, dass jeder Subagent (Goldfish/Critic) beim Spawn automatisch die volle CLAUDE.md des Projekts sowie einen Git-Status-Snapshot injiziert bekommt — offiziell bestätigt und ohne Abschalt-Parameter ([`code.claude.com/docs/en/sub-agents.md`](https://code.claude.com/docs/en/sub-agents.md): „Explore and Plan are the only subagents that omit CLAUDE.md and git status. There is no frontmatter field or per-agent setting to change which agents skip them."). Eine Ist-Vermessung (AP-P4-PROBE-1) belegte zusätzlich, dass der injizierte Git-Status ein **Snapshot vom Start der Elephant-Parent-Session** ist, nicht der Stand beim Spawn des Subagents.

the PO akzeptiert die Elephant-Empfehlung (2026-07-04, AP-Sprint): **Autoload bleibt, wie er ist** — CLAUDE.md ist der Prüfmaßstab, gegen den der Critic prüft; die E12-kritische Kontamination (Elephant-Framing/Begründungen) verhindert die Subagent-Isolation ohnehin. Mit zwei Auflagen:

1. **Disclosure-Pflicht:** Der Critic benennt den bei Spawn injizierten Kontext (CLAUDE.md, User-Memory, Git-Status-Snapshot u. Ä.) explizit im Report.
2. **Verbot der Snapshot-Nutzung als Frische-Referenz:** Der injizierte Git-Status (Parent-Session-Start-Stand) darf NIE als Frische-Referenz dienen — Diff-Range/Commit-Liste kommt ausschließlich aus dem Briefing; den tatsächlichen Repo-Zustand erhebt der Critic selbst per `git`-Kommando.

Beide Auflagen gelten für den Critic-Kontrakt und das Dispatch-Template (`templates/prompts/critic-review.md`) gleichermaßen. Diese Revision ersetzt keinen Bestandteil des ADR-Bodys oben (Never-Rewrite-Konvention, `docs/adr/README.md`), sie ergänzt ihn.

**Querverweis (E24, Welle 2):** Critic-Stufung (Mechanik-Auto-Pass, Sonnet-Kaskade bei Klasse mittel, EIN gebündelter Critic je Welle) revidiert das E12-Pflicht-Trigger-Staffing — eigenes ADR, keine Wiederholung hier: [ADR-0024](0024-critic-stufung-datenbasiert.md), Register E24.

## Wiedervorlage

Keine. Critic als aufrufbarer Baustein (Prompt + Schema): Phase 3.
