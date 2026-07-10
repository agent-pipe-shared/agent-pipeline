# ADR-0011: Sprachen-Policy — Deutsch für Menschen, Englisch für Agenten

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

**In brief (English):** This ADR sets the project's language split: German for human-facing documentation (operating model, ADRs, policies, reviews, handover files — anything the product owner reads and approves), and English for agent-facing artifacts (templates, skills, prompts, agent/skill frontmatter, CLAUDE.md templates, and originally commit messages). A later revision (E17, 2026-07-04) reclassified commit messages as PO-facing rather than agent-facing, since the product owner is the primary reader of `git log` in these projects — this is the one correction layered on top of the original decision, not a rewrite of it. The underlying "primary reader" tiebreaker rule for edge cases is unchanged and governs both the original decision and the E17 correction.

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 2 · Stand 2026-07-03

**Status:** akzeptiert (2026-07-03, Checkpoint 1) · **revidiert in der Commit-Klassifikation (E17, der PO, 2026-07-04 — s. Abschnitt „Revision E17")** · **Grundlage:** Kickoff-Arbeitsregel 8 + Auflage A6

## Kontext

Die Kickoff-Vorgabe verlangt, den Sprachen-Default als ADR festzuhalten; Auflage A6 bestätigt das ADR als DoD-Pflicht. Die Praxis existiert bereits und hat sich bewährt: deutsche Doku, englische Commits und Agent-Artefakte in diesem Repo und den Bestandsprojekten.

## Entscheidung (Kickoff-Default, unverändert übernommen und präzisiert)

- **Deutsch — menschengerichtete Doku:** alles, was der PO liest, prüft und abnimmt: Operating Model, ADRs, Policies, Reviews, Zielbilder, Migrationsdossiers, Management-Summaries. Englische Fachbegriffe sind ausdrücklich ok.
- **Englisch — agentengerichtete Artefakte:** alles, was ein Agent zur Laufzeit lädt oder standardisiert erzeugt: Templates, Skills (Description + Body), Prompts, Agent-/Skill-Frontmatter, CLAUDE.md(-Templates), Commit-Messages (Conventional Commits).
- **Primärleser-Regel für Grenzfälle:** Ein Artefakt folgt der Sprache seines primären Lesers. Template-Strukturen und Feldnamen sind englisch; die ausgefüllten Inhalte folgen dem Primärleser (z. B. Handover-/HISTORY-Inhalte deutsch, weil der PO sie liest; Frontmatter englisch).

**Warum:** Modell-Performanz und Wiederverwendbarkeit (englische Laufzeit-Artefakte sind über Projekte portabel und teilbar) an der Wirkstelle — volle Lesbarkeit für den PO an jeder Entscheidungsstelle.

**Prüfweise:** Die Sprachzuordnung neuer Artefakte ist Prüfpunkt im Critic-Review von Pipeline-Deliverables ([ADR-0014](0014-critic-kontrakt.md), [ADR-0015](0015-selbstanwendung.md)).

## Konsequenzen

**Positiv:** beste Modell-Leistung an der Wirkstelle, volle Lesegeschwindigkeit an der Entscheidungsstelle; Artefakte ohne Übersetzung portierbar.

**Negativ:** Sprachgrenze im selben Repo; Doppelbegriffe möglich (Glossar-Bedarf bei Kernbegriffen wie Staffelstab/Handover).

**Risiko:** schleichende Sprachmischung in Misch-Artefakten. Umgesetzt (Phase 3): Die Sprachzuordnung je Template ist in den Template-Köpfen verankert (Language-Note in `templates/CLAUDE.project.md`, `templates/prompts/*`, `backlog/items/TEMPLATE.md`; Telemetrie: Preamble von `telemetry/costs.md`) — für künftige neue Misch-Artefakte gilt die Primärleser-Regel als Default; Prüfpunkt ist Hunt-Kategorie 10 des Critic-Reviews.

## Verworfene Alternativen

- **Alles Deutsch** — kostet Modell-Performanz und jede Wiederverwendbarkeit der Laufzeit-Artefakte außerhalb des deutschsprachigen Kontexts.
- **Alles Englisch** — verfehlt den Zweck menschengerichteter Doku: schnelle, präzise Prüf- und Entscheidbarkeit für den PO.

## Revision E17 (der PO, 2026-07-04): Commit-Messages sind PO-facing, nicht agent-facing

Sprint-1-<PROJECT_A>-Migration, Fable-Critic-Befund F1 (2026-07-04): Die Migrations-Commits liefen auf Deutsch, obwohl GIT-01 (`guardrails/git.md`) bislang „English MUST" für Commit-Messages verlangte — mit Berufung auf genau die Einordnung oben („Commit-Messages (Conventional Commits)" unter „Englisch — agentengerichtete Artefakte"). Der PO entschied die Einordnung andersherum (Register **E17**): Commit-Messages sind **PO-facing**, nicht agent-facing — der PO ist der Primärleser jedes `git log` in seinen Projekten. **Die Primärleser-Regel selbst bleibt unverändert und war schon vorher richtig** (sie ordnete Handover-/HISTORY-Inhalte bereits korrekt als Deutsch ein, s. o.) — diese Revision korrigiert ausschließlich diese EINE Einzelzuordnung; der ADR-Body oben wird nicht umgeschrieben (Konvention `docs/adr/README.md`), sondern durch diesen Abschnitt chirurgisch überschrieben.

**Präzisierte Zuordnung ab E17:**

| PO-facing (Primärleser PO) → Deutsch | Agent↔Agent (Primärleser Agent) → Englisch |
|---|---|
| Commit-Messages (NEU — war vorher fälschlich rechts eingeordnet) | Goldfish-Briefings |
| Handover-Instanzen (`docs/state.md` je Projekt) | Critic-Reports (Berichtsformat — CP2-Entscheid 1, unverändert) |
| Chat-Antworten | Specs (Inhalt — CP2-Entscheid 2, unverändert) |
| PR-Beschreibungen | agent-facing Kanon (Guardrails, Harness, Skills, Agent-Frontmatter) |
| Fragen/Kommentare an den PO | Templates (Struktur/Feldnamen; ausgefüllter Inhalt folgt weiterhin dem Primärleser) |

**E17 bestätigt** zugleich die CP2-Entscheide 1/2 unverändert (Goldfish-/Critic-Berichtssprache Englisch, Spec-Inhalt Englisch) — dort ändert sich nichts.

**Umsetzung:** `guardrails/git.md` GIT-01 (Commit-Sprache); Sweep über `guardrails/`, `templates/`, `harness/`, `plugins/pipeline-core/{skills,agents}/`, `docs/adr/`.

## Wiedervorlage

Keine.
