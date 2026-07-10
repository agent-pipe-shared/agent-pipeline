# ADR-0011: Language Policy — German for Humans, English for Agents

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

**Status:** accepted (2026-07-03, Checkpoint 1) · **revised in commit classification (E17, by the PO, 2026-07-04 — see "Revision E17" section)** · **Basis:** Kickoff working rule 8 + condition A6

## Context

The kickoff brief required the language default to be captured as an ADR; condition A6 confirms the ADR as a DoD requirement. The practice already existed and had proven itself: German documentation, English commits and agent artifacts across this repo and the existing projects.

## Decision (kickoff default, carried over unchanged and refined)

- **German — human-facing documentation:** everything the PO reads, reviews, and approves: operating model, ADRs, policies, reviews, target-state docs, migration dossiers, management summaries. English technical terms are explicitly fine.
- **English — agent-facing artifacts:** everything an agent loads at runtime or generates in standardized form: templates, skills (description + body), prompts, agent/skill frontmatter, CLAUDE.md (templates), commit messages (Conventional Commits).
- **Primary-reader rule for edge cases:** an artifact follows the language of its primary reader. Template structures and field names are English; filled-in content follows the primary reader (e.g. handover/HISTORY content is German because the PO reads it; frontmatter is English).

**Why:** model performance and reusability (English runtime artifacts are portable and shareable across projects) at the point of effect — full readability for the PO at every decision point.

**Verification:** the language assignment of new artifacts is a check point in the Critic review of Pipeline deliverables ([ADR-0014](0014-critic-kontrakt.md), [ADR-0015](0015-selbstanwendung.md)).

## Consequences

**Positive:** best model performance at the point of effect, full reading speed at the point of decision; artifacts portable without translation.

**Negative:** a language boundary within the same repo; duplicate terminology possible (glossary need for core terms like Staffelstab/handover).

**Risk:** gradual language drift in mixed artifacts. Implemented (Phase 3): the language assignment per template is anchored in the template headers (Language-Note in `templates/CLAUDE.project.md`, `templates/prompts/*`, `backlog/items/TEMPLATE.md`; telemetry: preamble of `telemetry/costs.md`) — for future new mixed artifacts, the primary-reader rule is the default; the check point is Hunt category 10 of the Critic review.

## Rejected alternatives

- **All German** — costs model performance and any reusability of runtime artifacts outside the German-speaking context.
- **All English** — misses the purpose of human-facing documentation: fast, precise reviewability and decidability for the PO.

## Revision E17 (by the PO, 2026-07-04): commit messages are PO-facing, not agent-facing

Sprint-1 `<PROJECT_A>` migration, Fable-Critic finding F1 (2026-07-04): the migration commits ran in German even though GIT-01 (`guardrails/git.md`) had until then required "English MUST" for commit messages — citing exactly the classification above ("commit messages (Conventional Commits)" under "English — agent-facing artifacts"). The PO decided the classification the other way (register **E17**): commit messages are **PO-facing**, not agent-facing — the PO is the primary reader of every `git log` in his projects. **The primary-reader rule itself is unchanged and was already correct beforehand** (it already correctly classified handover/HISTORY content as German, see above) — this revision corrects exclusively this ONE individual assignment; the ADR body above is not rewritten (convention `docs/adr/README.md`), but surgically overridden by this section.

**Refined assignment as of E17:**

| PO-facing (primary reader: PO) → German | Agent↔agent (primary reader: agent) → English |
|---|---|
| Commit messages (NEW — previously misclassified on the right) | Goldfish briefings |
| Handover instances (`docs/state.md` per project) | Critic reports (report format — CP2 decision 1, unchanged) |
| Chat responses | Specs (content — CP2 decision 2, unchanged) |
| PR descriptions | Agent-facing canon (guardrails, harness, skills, agent frontmatter) |
| Questions/comments to the PO | Templates (structure/field names; filled-in content still follows the primary reader) |

**E17 also confirms** CP2 decisions 1/2 unchanged (Goldfish/Critic report language English, spec content English) — nothing changes there.

**Implementation:** `guardrails/git.md` GIT-01 (commit language); sweep across `guardrails/`, `templates/`, `harness/`, `plugins/pipeline-core/{skills,agents}/`, `docs/adr/`.

## Follow-up

None.

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

# ADR-0011: Sprachen-Policy — Deutsch für Menschen, Englisch für Agenten

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
