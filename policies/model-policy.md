# Modell-Policy — Rollen, Effort, Workflows, Budget, Telemetrie

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 2 · Stand 2026-07-03

Diese Policy operationalisiert die Rollen-Modell-Matrix, die Ultracode-/Workflow-Regeln, die Cache-Disziplin sowie die Vorgaben zu acceptEdits-Vorbedingungen und Kosten-Telemetrie aus dem eigenen Entscheidungsregister (falls vorhanden). Bei Widerspruch gewinnt das eigene Entscheidungsregister. Diese Policy ist bewusst **modellagnostisch** formuliert: Regeln sprechen von Rollen-Tiers (Design/Implement/Mechanic/Review/Advisor, s. `pipeline.user.yaml` → `models.*`), nicht von Produktnamen — konkrete Modellnamen erscheinen ausschließlich als mitgelieferter Default-Preset (Abschnitt 1).

Schwester-Dokumente dieser Phase: `docs/operating-model.md` (Rollen, Rituale, Session-Lifecycle), `policies/tooling-policy.md` (Versionsanforderungen, Tooling-Radar), `harness/session-bootstrap.md` (Session-Start-Protokoll), `docs/adr/` (Formalisierung als ADRs).

Alle Regeln tragen IDs (**MP-xx**) und folgen dem Muster **Gebot/Verbot → Warum → Prüfweise**.

---

## 1. Rollen-Tier-Effort-Matrix

### Mitgelieferter Default (Preset, `pipeline.user.yaml` → `models.*`)

Die Pipeline unterscheidet fünf Rollen-Tiers. `setup.mjs` schreibt beim Setup ein Preset passend zur Abo-Stufe des PO; das **Max-Preset** unten ist der empfohlene Startpunkt und der committete Default-Zustand dieses Repos:

| Tier (Config-Key)  | Rolle                              | Default-Modell (Max-Preset) | Default-Effort |
|---------------------|-------------------------------------|------------------------------|-----------------|
| `models.design`     | Elephant (Orchestrator)            | opus                         | high            |
| `models.implement`  | Goldfish (Implementor)             | sonnet                       | medium          |
| `models.mechanic`   | Goldfish (Mechanic)                | sonnet                       | low             |
| `models.review`     | Critic                             | sonnet                       | max             |
| `models.advisor`    | optionaler Second-Opinion-Advisor  | — (standardmäßig **deaktiviert**) | — |

Alle Werte sind in `pipeline.user.yaml` überschreibbar — das Preset „Pro" fährt z. B. alle Rollen auf dem günstigeren Modell mit gestaffeltem Effort (siehe Kommentar in `pipeline.user.yaml`). Ab hier spricht diese Policy nur noch von **Tiers**, nicht von Produktnamen. **`goldfish-deep` ist KEIN eigener Config-Tier:** Er ist Implement-Tier-Arbeit mit vollem Denkbudget → läuft auf dem Implement-Tier-Modell bei Effort `xhigh` (bei echtem Design-Spielraum ggf. auf dem Design-Tier-Modell).

### MP-01 — Design-Tier: fixiertes Modell/Effort je Session, Wechsel nur an einer benannten Gate-Stelle

- **Gebot:** Das Design-Tier-Modell (Elephant/Orchestrator) läuft während der Design-Phase (Triage → Interview/Spec → Readiness, MP-22) durchgehend auf dem konfigurierten Design-Tier-Modell bei Standard-Effort `high`–`xhigh`. Modell UND Effort werden zu Sessionbeginn gesetzt und bleiben bis zur nächsten Phasen-/Profilgrenze stabil (MP-17) — kein stiller Wechsel mitten in der Session.
- **Ausführungsphase — konfigurierbares Profil:** Ab dem Goldfish-Dispatch (Ausführungsphase) erlaubt die Pipeline zwei Betriebsweisen, je Projekt/Session bewusst gewählt:
  1. **Durchgehend:** das Design-Tier-Modell bleibt auch für die Ausführungsphasen-Orchestrierung aktiv (höhere Fähigkeit, höhere Kosten über die ganze Session).
  2. **Gate-Wechsel (sanktionierte EINE Ausnahme):** die Orchestrierung wechselt GENAU EINMAL, exakt am PRD-Freigabe-Gate, auf eine günstigere/schnellere Konfiguration für die Ausführungsphase — typischerweise begründet durch das Abrechnungsmodell des gewählten Providers (Kosten-pro-Aufgabe-Kalkül, MP-13). Ein Rück-Wechsel zurück auf das teurere Design-Tier-Modell MITTEN in der Ausführungsphase bleibt ohne Ausnahme verboten (Cache-Invalidierung, MP-17/MP-18).
  Die Wahl der Betriebsweise ist eine bewusste, dokumentierte Entscheidung (nie impliziter Default) — token-intensive Arbeit wird ohnehin an Goldfische delegiert statt das Orchestrator-Modell zu wechseln (MP-18).
- **Gebot (Effort):** Standard-Effort für das Design-Tier ist `high`–`xhigh` (offizielle Guidance vieler Anbieter: `xhigh`/vergleichbare hohe Stufen gelten als Sweet Spot für die meisten agentischen Coding-Aufgaben; die jeweils höchste Stufe zeigt „diminishing returns" und ist sparsam für die härtesten Einzelfälle zu reservieren). Die höchste Stufe ist eine benannte Session-Ausnahme, keine Dauereinstellung — der Effort-Wechsel selbst invalidiert den Cache (MP-17), Wechsel-Empfehlungen also nur an Session-/Blockgrenzen aussprechen. Die Entscheidung trifft immer der PO (User-Kommando), nie stiller Weiterlauf im falschen Modus.
- **Modell-Identitäts-Härtung:** Die aktive Modell-Identität wird aus BEOBACHTETER Evidenz bestätigt (z. B. eine Modell-Statusausgabe der Runtime oder eine explizite PO-Bestätigung), nie angenommen — insbesondere unmittelbar nach Limit-/Fallback-Ereignissen.
- **Warum:** Ein teureres, fähigeres Orchestrator-Modell verbraucht in Summe oft WENIGER Tokens, weil es bei der Lösungsfindung effektiver ist und Iterationsschleifen spart — auch bei höherem Preis pro Token (Kosten pro Aufgabe zählen, nicht $/MTok, MP-13).
- **Betriebsnotiz (generische Vorsicht, providerabhängig):** Manche Modelle rechnen Thinking-Tokens verdeckt als teuren Output ab, oder fallen bei bestimmten Trigger-Bedingungen (z. B. einem Safety-Classifier) automatisch auf ein anderes Modell zurück — das invalidiert den Cache und gehört, falls beobachtet, in die Telemetrie-Spalte „Besonderheiten" (MP-19). Das eigene Provider-Verhalten vor Sessionbeginn verifizieren, nicht annehmen.
- **Prüfweise:** Session-Bootstrap (`harness/session-bootstrap.md`) setzt und verifiziert Modell+Effort als Pflichtschritt — Effort ist session-only und muss bei jedem Start neu gesetzt werden; die höchste Effort-Stufe gilt nur als korrekt konfiguriert, wenn die Session-Ausnahme benannt ist. Telemetrie-Zeile weist Modell/Effort aus; ausgesprochene bzw. unterlassene Wechsel-Hinweise bei erkannten Großblöcken sind Critic-/Retro-prüfbar.

### MP-02 — Goldfish: Modell-Untergrenze = Mechanic-Tier-Modell, Effort siehe MP-27

- **Gebot:** Goldfische laufen NIE unterhalb des konfigurierten Mechanic-Tier-Modells (Modell-Untergrenze, hart — kein Downgrade auf eine kleinere/billigere Modellklasse, auch nicht für triviale Tasks). Die Effort-Zuteilung selbst folgt der 3-Stufen-Matrix in MP-27, nicht mehr einem einzelnen Pauschal-Effort.
- **Umsetzung:** Subagent-Frontmatter setzt Modell + Effort explizit je Subagent (Plugin-Ebene) — nie implizite Vererbung vom Hauptmodell (verwandte Falle: MP-04, globale Modell-Override-Env-Var).
- **Prüfweise:** Frontmatter der versionierten Plugin-Agents zeigt die Modell-Untergrenze; Telemetrie-Zeile je Goldfish-Block.

### MP-27 — Goldfish 3-Stufen-Effort-Matrix

- **Gebot:** Goldfish-Dispatches laufen auf einem von drei eigenen Subagenten, je mit fest zugeordnetem Effort (Frontmatter, nicht Prosa):
  - **`goldfish-mechanic`** — Effort **`low`**: mechanische, gleichförmige, reine Plan-Ausführung ohne In-Task-Designentscheidungen, voll spezifiziertes Briefing.
  - **`goldfish-implementor`** — Effort **`medium`** — Standard für klar gebriefte Implementierungsaufgaben.
  - **`goldfish-deep`** — Effort **`xhigh`**: Test-Suite-/Verify-Autorenschaft, Guardrail-/Hook-/Kanon-Code, Aufgaben mit echtem In-Task-Design-Spielraum, Klasse-hoch-Arbeit.
  Planung/Design und Analyse-Synthese bleiben unverändert auf Design-Tier-Ebene mit `xhigh`+ (MP-01/MP-22/MP-23 unangetastet).
- **Vorautorisierter Rück-Revisions-Pfad:** Steigt die Fehlerquote messbar (Erstpass-Quote-Messreihe), ist eine datierte Rück-Revision von `medium` auf `xhigh` für den Implementor-Tier vorab freigegeben — braucht nur einen datierten Eintrag im eigenen Projekt-Entscheidungsprotokoll + Telemetrie-Beleg, kein neues Gate.
- **Cross-Note (Critic-Matrix, MP-07 unangetastet):** Mit sinkendem Goldfish-Implementierungs-Effort STEIGT die Bedeutung des Review-Gates, statt sich zu verringern — die Trigger-Kriterien und Modellwahl in MP-07 bleiben dabei unverändert.
- **Warum:** Klar gebriefte, plan-treue Ausführung braucht nicht dasselbe Denkbudget wie Guardrail-/Design-Arbeit; die Matrix spiegelt das 1:1 auf drei benannte, versionierte Subagenten statt auf ein Effort-Feld im Dispatch-Prompt.
- **Prüfweise:** `grep` über die drei Agent-Frontmatter (`plugins/pipeline-core/agents/goldfish-mechanic.md`, `-implementor.md`, `-deep.md`) zeigt die drei Effort-Werte exakt; Dispatch-Metadaten benennen den gewählten Subagenten; Erstpass-Quote fließt in die nächste periodische Sichtung (Abschnitt 5) ein.

### MP-28 — `speed`-Profil: Implement-Tier-Modell bei Effort `max` + Design-Tier-Advisor ab Sessionstart (NEU)

*(English in the source — agent-facing profile/dispatch rule, same convention as MP-22/23/24.)*

- **Gebot (model pairing):** A third session-start profile, defined ALONGSIDE the existing `design-first` and `advisor` profiles (MP-01, MP-26): **`speed`** — the mini-feature/hotfix profile. Model pairing: the **Implement-Tier model at effort `max`** runs as the session's MAIN model — an inversion of the usual pattern where the Design-Tier model orchestrates the session — paired with the **Design-Tier model active as advisor from session start** (MP-26(b) already defines the advisor as Design-Tier model class; `speed` is the profile that keeps that advisor engaged from the very first turn, on top of a cheaper main model). Any tier below the Mechanic tier once floated for this profile stays FUTURE ONLY and requires a dedicated measurement run first — do NOT enable it here; this does not create a fourth exception to MP-03's below-Mechanic-tier ban.
- **Scope (hard limits):** `speed` is bounded to ≤5 files touched, NO guardrail/canon files (`guardrails/`, `roles/`, `policies/`, `docs/operating-model.md`, hooks, `.claude/` settings), and no new dependencies. Breaching any of these three limits mid-task is a MANDATORY escalation to the full profile (`design-first` or `advisor`) — not a judgment call the session talks itself out of. Guard hooks stay active UNCONDITIONALLY under `speed` — the profile trims ceremony, never the deterministic guard layer (`policies/tooling-policy.md` G1/W3).
- **Bootstrap (cross-ref):** the lightweight bootstrap ritual for `speed` — ruleset version, calibration file, verify availability, the operative handover head, ONE confirmation line instead of three, no profile ceremony — is defined in `harness/session-bootstrap.md` §6.5; this policy governs model/effort and scope only, that section governs the ritual.
- **Process:** no PRD document required; direct dispatch (or a mini-edit path for the smallest fixes); a light review stage replaces the full Design-Tier review; a short close replaces the full close ceremony. This is a proportionality trade for genuinely small, bounded work — it does NOT exempt a `speed`-profile task from the MP-07 criticality triggers (architecture/guardrails/security still force Design-Tier/`max` review regardless of profile).
- **Why:** Mini-features and hotfixes were paying the same session-ceremony cost as full-feature work. A proportionate profile for genuinely small, bounded diffs closes that gap without touching the below-Mechanic-tier ban (MP-03) or the guard layer (G1). The PO confirmed the model pairing verbatim: "speed profile = Implement-Tier/`max` + Design-Tier advisor."
- **Prüfweise:** Bootstrap Schritt 1b (profile selection) offers `speed` as a third option; dispatch metadata for a `speed`-profile session names the profile explicitly; a session that exceeds ≤5 files, touches a guardrail/canon file, or adds a dependency without a logged escalation to the full profile is a bootstrap/process defect, flagged at close.

### MP-03 — VERBOT: Modelle unterhalb des Mechanic-Tiers für Implementierung/Judgment/Review

- **Verbot (hart):** Kein Modell unterhalb der Mechanic-Tier-Klasse für Implementierungs-, Judgment- oder Review-Arbeit in der Pipeline — nicht als Goldfish, nicht als Critic, nicht als Workflow-Stage, die Artefakte erzeugt oder bewertet. Die drei Ausnahmen unten sind abschließend.
- **Warum:** (a) Qualitätsrisiko erzeugt Iterationsschleifen, die die nominale Ersparnis auffressen — der Kostenhebel der Pipeline ist Modell-Preis + Cache-Disziplin + kleine Goldfish-Kontexte, nicht ein schwächeres Modell. (b) Die kleinste Modellklasse hat typischerweise keinen Effort-Parameter, kein Adaptive Thinking und einen kleineren Kontext — für Diffs/Implementierungen mit Substanz ungeeignet.
- **Ausnahme (a) — eingebaute Runtime-Mechanismen:** Ausgenommen sind eingebaute Mechanismen der Agenten-Runtime, die intern eine kleinere Modellklasse nutzen (z. B. ein `/goal`-Evaluator) — das ist keine Rollenbesetzung.
- **Ausnahme (b) — harness-interner Read-only-Summarizer:** WebFetch-/WebSearch-Zusammenfassung darf intern auf der kleinsten Modellklasse laufen — sanktioniert-aber-notiert, solange die Ausgabe reine Fetch-Zusammenfassung bleibt (kein Judgment, keine Artefakt-Erzeugung). Telemetrie darf das Modell ausweisen, ohne dass das als Verstoß zählt.
- **Ausnahme (c) — Research-Fetcher-Klasse:** eng begrenzte, read-only Websuche/Fetch/Extraktions-Dispatches ohne Judgment/Synthese/Artefakt-Erzeugung dürfen explizit als Research-Fetcher auf der kleinsten Modellklasse laufen — Voraussetzungen und Messbasis: siehe MP-25.
- **Prüfweise:** `grep` über die versionierten Agent-/Skill-Frontmatter des Plugins: kein Modell unterhalb der Mechanic-Tier-Klasse außerhalb der drei benannten Ausnahmen. Zusätzlich MP-04 (Env-Var-Verbot). Critic-Review von Guardrail-Änderungen prüft dies mit.

### MP-25 — Research-Fetcher-Klasse: read-only Dispatches auf der kleinsten Modellklasse

- **Gebot:** Read-only Websuche-/Fetch-/Extraktions-Dispatches — keine Repo-Schreibzugriffe, keine Artefakte, kein Judgment — DÜRFEN auf der kleinsten verfügbaren Modellklasse laufen. Erfordert explizite Dispatch-Metadaten: `role=research-fetcher`. Synthese oder Bewertung des abgerufenen Materials bleibt mindestens Mechanic-Tier (nie darunter) — die Research-Fetcher-Klasse deckt AUSSCHLIESSLICH den reinen Fetch-/Extraktions-Schritt ab; MP-03s Verbot bleibt ansonsten unverändert.
- **Warum:** Ein reiner Fetch-/Extraktions-Schritt braucht kein Judgment-Budget; die Klasse ist bewusst eng gefasst — sie lockert MP-02/MP-03 für nichts über den reinen Fetch-Schritt hinaus. Messbasis: In eigenen Vergleichsmessungen lieferte ein Research-Fetcher-Dispatch brauchbare Ergebnisse in einem Bruchteil der Zeit und Tokens eines vergleichbaren Mechanic-/Implement-Tier-Dispatches derselben Aufgabenklasse — eigene Zahlen im Projekt-Telemetrie-Log führen, nicht diese Policy als Zahlenquelle nutzen.
- **Prüfweise:** Dispatch-Metadaten benennen `role=research-fetcher` explizit; jeder Dispatch, der aus dem abgerufenen Material synthetisiert, bewertet oder ein committetes Artefakt erzeugt, ist KEIN Research-Fetcher-Dispatch und muss mindestens Mechanic-Tier laufen (MP-02/MP-03).

### MP-04 — VERBOT: globale Modell-Override-Env-Var setzen

- **Verbot:** Eine Environment-Variable, die das Frontmatter ALLER Subagents überschreibt, wird nicht global gesetzt (in Claude Code: `CLAUDE_CODE_SUBAGENT_MODEL`).
- **Warum:** Ein globaler Override auf eine kleinere oder größere Modellklasse würde die differenzierte Tier-Matrix (Goldfish ≠ Critic ≠ kritischer Critic) still aushebeln.
- **Prüfweise:** Session-Bootstrap prüft, dass die Var nicht gesetzt ist (`harness/session-bootstrap.md`).

### MP-05 — Eskalation Goldfish → höheres Tier

- **Gebot:** Der Design-Tier-Orchestrator entscheidet die Eskalation BEIM DISPATCH und protokolliert sie im Briefing als „Modell-Begründung" im Pflichtfeld „Dispatch-Metadaten" (kanonische Briefing-Feldliste: `docs/operating-model.md` §2.3). Eskalationskriterien (eines genügt):
  1. Aufgabe überspannt mehrere Subsysteme oder sehr viele Dateien (Richtwert: > 15 Dateien oder erwartetes Diff > 800 Zeilen — Startwerte, per Telemetrie zu kalibrieren);
  2. Lösungsweg bleibt trotz Spec ambig (mehrere plausible Umsetzungen, Briefing kann nicht alle Entscheidungen vorwegnehmen);
  3. dieselbe Task-Klasse ist zuvor auf dem Implement-Tier-Modell trotz nachgebessertem Briefing gescheitert (Zwei-Fehlversuche-Regel durchlaufen, Eskalation an den Orchestrator hat kein besseres Briefing ergeben → nächster Hebel ist das Modell);
  4. lange autonome Läufe mit sehr großem Token-Budget, wo ein höheres Tier lange Kontextfenster bei niedrigeren Kosten pro Token unterstützt.
  Eskaliertes Ziel-Tier ist typischerweise das Design-Tier-Modell (mehr Fähigkeit für „sehr Umfangreiches").
- **Warum:** Ohne benannte Kriterien würde die Eskalation ad hoc und unauditierbar.
- **Prüfweise:** Briefing-Feld vorhanden; Telemetrie-Zeile zeigt das eskalierte Modell + Aufgabenkürzel; periodische Sichtung vergleicht Eskalationsquote und -erfolg.

### MP-06 — Deeskalation innerhalb der Matrix

- **Gebot:** Deeskalation heißt ausschließlich niedrigerer Effort (nie ein niedrigeres Tier/Modell). Für mechanische/gleichförmige Goldfish-Tasks (klarer Plan, kleine Diffs, keine Designentscheidungen) ist der `goldfish-mechanic`-Subagent (Effort `low`, MP-27) das Deeskalationsziel. Modell-Untergrenzen (Goldfish/Critic: Mechanic-Tier-Modell; Design-Tier: das konfigurierte Design-Tier-Modell) werden nie unterschritten.
- **Warum:** Effort steuert die Gesamttoken-Bereitschaft — das ist der legitime Sparhebel; ein Wechsel auf eine niedrigere Modellklasse verletzt die Tier-Matrix. Achtung: Die Effort-Skala ist PRO MODELL kalibriert — „high" auf einem kleineren Modell ≠ „high" auf einem größeren; Effort-Level nicht modellübergreifend vergleichen.
- **Prüfweise:** Telemetrie; Frontmatter-Defaults im Plugin.

### MP-07 — Critic-Staffelung: Review-Tier Standard, Eskalation bei Kritikalität

- **Gebot:** Critic-Reviews laufen standardmäßig auf dem Review-Tier-Modell / Effort `max`. **Eskalation auf ein höheres Tier (Design-Tier-Modell) ist PFLICHT**, wenn der Prüfgegenstand eines der folgenden berührt:
  - **Architektur:** ADR-pflichtige Entscheidungen, Kernverträge, Operating-Model-Änderungen;
  - **Guardrails:** Hooks (insb. git-guard), Permissions/Settings, Permission-Modi, Workflow-Vorbedingungen;
  - **Security:** Secrets/Credentials, Auth, Netz-Exposition, History-Rewrites — sowie alles, was reale Geräte oder Produktivsysteme steuern kann.
  Zusätzlich DARF der Orchestrator nach Judgment eskalieren (z. B. ungewöhnlich großer Blast-Radius). Deeskalation unter das Review-Tier-Modell ist verboten (MP-03).
- **Warum:** Der Critic-Input ist klein (Spec + Diff + Guardrails, nie Chat-Verlauf), daher dominiert Modellqualität über Inputkosten. Bei kritischen Reviews ist ein übersehener Befund um Größenordnungen teurer als die Tier-Differenz.
- **Prüfweise:** Critic-Briefing-Template enthält „Kritikalität → Modell" als bedingten Teil des Pflichtfelds „Dispatch-Metadaten" (kanonische Briefing-Feldliste: `docs/operating-model.md` §2.3); Telemetrie-Zeile weist das Critic-Modell aus. EIN Critic-Agent + Invocation-Parameter `model` (`plugins/pipeline-core/agents/critic.md`) — kein Fork für den kritischen Fall; die Eskalation setzt der Orchestrator pro Dispatch.
- **Ergänzung (MP-27):** Mit sinkendem Goldfish-Implementierungs-Effort (MP-27) STEIGT die Bedeutung dieses Review-Gates, statt sich zu verringern — die Trigger-Kriterien und Modellwahl oben bleiben dabei UNVERÄNDERT (Kritikalität entscheidet weiterhin über Architektur/Guardrails/Security, nicht der Goldfish-Effort).

### MP-22 — Minimum-tier principle: phase-scoped (design vs. execution)

*(English in the source — agent-facing dispatch rule.)*

- **Design phase — Design-Tier model mandatory (session effort per MP-01; Design-Tier subagent dispatches `max` per MP-07):** Everything from Triage through Interview→Spec to the Spec-Readiness-Check (`docs/operating-model.md` §3.2 steps 1–3) — interview/requirements clarification, best-practice and solution-path research, architecture debate, spec/plan authoring, path decisions, spec-readiness evaluation — runs on the Design-Tier model. This includes research goldfish dispatched during the design phase: they default to the Design-Tier model, with the briefing's model-justification field stating "design-phase quality" (MP-05 field).
- **Execution phase — Implement-/Mechanic-Tier default; orchestrator tier per the chosen profile (MP-01):** From Goldfish-Dispatch through Merge (`docs/operating-model.md` §3.2 steps 4–8) — implementation against a finished plan, mechanical edits, bulk/grunt work, status updates, formatting, doc-sync — dispatches to the Implement-/Mechanic-Tier model (MP-02/MP-27). The orchestrator itself may keep running the execution phase on the Design-Tier model or switch to a cheaper configuration per the chosen profile (MP-01) — the Design-Tier model's irreducible core in the execution phase shrinks to the Review-Tier escalation cases (MP-07) and Readiness-check subagent dispatches, which stay Design-Tier regardless of profile; everything else sensibly delegable goes to the Implement-/Mechanic-Tier — including workflow `agent()` calls, which MUST set the model explicitly (silent model inheritance is a known cost driver).
- **Bundling:** small interlinked feature bundles are dispatched as ONE bundled briefing — context economy through bundling, never through self-implementation; "small/interlinked" is never grounds for the orchestrator to implement it itself.
- **Why:** design-phase quality spend is legitimate; silent-inheritance waste in the execution phase is not. Splitting the principle by SDLC phase keeps the legitimate spend and cuts the waste. Leaves MP-01 (orchestrator model) and MP-02 (Goldfish default) unchanged.
- **Check:** Design-phase dispatches (Triage/Spec/Readiness) show the Design-Tier model in the dispatch metadata field without needing a justification (it's the default for that phase); execution-phase dispatch briefings and workflow `agent()` invocations carry an explicit `model` field defaulting to the Implement-/Mechanic-Tier; a Design-Tier dispatch in the execution phase requires a stated model justification (MP-05).

### MP-23 — Implement-tier-first / Design-tier-first presumption, scoped by phase

- **Execution phase:** "When in doubt whether a dispatch needs the Design-Tier model, it does not — draft on the Implement-/Mechanic-Tier, have the orchestrator review; Design-Tier authorship only for genuine architecture/guardrail/security single cases with a stated rationale (MP-05) — in practice this is where the Review-Tier escalation / Readiness-check subagent dispatches (MP-07) sit."
- **Design phase (reversed):** When in doubt whether a design-phase step (interview, research, architecture debate, spec authoring, readiness evaluation) needs the Design-Tier model, it does — stay on the Design-Tier model (effort per MP-01 standard) rather than downgrading, per MP-22.
- **Why:** A single "when in doubt, cheaper tier" rule would silently erode the design-phase quality guarantee MP-22 sets explicitly; the presumption inverts by phase instead of applying uniformly.
- **Check:** Same as MP-22; Critic review of Spec-Readiness / architecture artifacts flags a design-phase step that ran on a lower tier without an explicit, documented reason.

---

## 2. Ultracode & Dynamic Workflows

Begriffsklärung: Ultracode ist kein API-Effort-Level, sondern ein Runtime-Setting — es sendet Effort `xhigh` und erlaubt der Hauptsession, Dynamic Workflows (Multi-Agent-Orchestrierung per Skript) zu planen. **Abgrenzung: Ultracode ≠ Subagents.** Goldfische und Critics sind normale Subagents und funktionieren IMMER, völlig unabhängig davon, ob Ultracode aktiv ist; Ultracode betrifft ausschließlich die Workflow-Orchestrierung der Hauptsession (MP-08). „Ultracode aus" schwächt also weder Dispatches noch Reviews.

### MP-08 — Niedrigschwelliger Task-Opt-in mit Indikationsliste

- **Gebot:** Ultracode/Workflows werden **pro Task** aktiviert (Keyword `ultracode` im Prompt bzw. „use a workflow"), niedrigschwellig und ohne Zeremonie, wenn die Aufgabe auf der Indikationsliste steht:
  - **initiale Recherchen** (z. B. Deep-Research-Aufträge, Cross-Check-Recherche),
  - **Vorgehensmodell-/Architektur-Exploration** (Alternativen parallel ausleuchten),
  - **Audits** (codebase-weite Prüfungen, Konsistenz-Checks),
  - **Migrationen** (viele gleichförmige Änderungen).
  **Gegenindikation:** normale Feature-Implementierung und Tasks mit starken Abhängigkeiten untereinander — offizielle Guidance nennt hier ausdrücklich „die meisten Coding-Tasks" als Gegenindikation.
- **Verbot:** `/effort ultracode` als Dauerzustand der Design-Tier-Session. Session-weites Ultracode nur für einen abgegrenzten Workflow-Block mit sofortigem Rückweg — besser: große Workflow-Läufe in einer eigenen Session bzw. aus einem Goldfish heraus starten, damit der Orchestrator-Cache die Effort-Wechsel nicht doppelt bezahlt (Effort-Wechsel invalidiert den Cache, MP-17).
- **Warum:** Die Stärke des Werkzeugs ohne Token-Blindflug nutzen; die positiven Indikationen sind genau die parallelisierbaren, kontextsprengenden Aufgabentypen.
- **Prüfweise:** Workflow-Läufe erscheinen als eigene Telemetrie-Zeile (Rolle „Workflow"); ein Live-Statuskommando zeigt Token pro Agent während des Laufs.

### MP-09 — Kalibrierlauf bei neuartigen großen Workflows (empfohlen, keine Pflicht-Hürde)

- **Gebot (soll):** Vor einem neuartigen großen Workflow-Run einen Small-Slice-Kalibrierlauf fahren — ein Verzeichnis statt des ganzen Repos, eine enge Frage statt einer breiten; Token-Verbrauch beobachten; Abbruch verliert keine fertigen Teilergebnisse (offizielle Empfehlung).
- **Warum:** „A single run can use meaningfully more tokens than working through the same task in conversation." Der Kalibrierlauf ist bewusst eine Empfehlung, keine Pflicht — bei bekannten, erprobten Workflow-Typen entfällt er.
- **Prüfweise:** Bei neuartigen Workflows > erwartete 30 Min Laufzeit dokumentiert die Telemetrie-Zeile, ob kalibriert wurde („Besonderheiten").

### MP-10 — HARTE Vorbedingung für schreibende Workflows

- **Gebot (hart, blockierend):** Ein Workflow, der Dateien ändert, darf NUR starten, wenn alle drei Vorbedingungen erfüllt sind:
  1. **Hook-Guardrails installiert** — die git-guard-Union als PreToolUse-Hook aktiv;
  2. **enge Bash-Allowlist** — nur die für den Task nötigen Kommandos freigegeben;
  3. **Worktree** — der Run arbeitet in einem isolierten Worktree, nie auf dem Haupt-Checkout.
- **Warum:** Workflow-Subagents laufen **immer in `acceptEdits`** und erben die Tool-Allowlist der Session — Permission-Modi (`plan`, `ask`, Projekt-`defaultMode`) greifen dort NICHT. Der einzige wirksame Schutz liegt auf Hook-, Allowlist- und Isolations-Ebene.
- **Hochrisiko-Projekt-Sonderregel:** Bei <PROJECT_B> (reale Geräte, hohe Stakes) sind schreibende Workflows bis zum Abschluss der Guard-Migration nur mit expliziter PO-Freigabe zulässig — zusätzlich zu den drei Vorbedingungen. Ob die je Projekt bestehenden, ggf. abweichenden git-guard-Inkarnationen als Übergangs-Voraussetzung genügen, bis eine gemeinsame Union ausgeliefert ist, regelt die projektspezifische Kalibrierung — im Zweifel den PO fragen.
- **Prüfweise:** Workflow-Startprompt benennt die drei Vorbedingungen explizit; Bootstrap-Check verifiziert Hook-Installation; lesende Workflows (Recherche, Audit ohne Fixes) sind von MP-10 ausgenommen.

### MP-11 — Parallel-Limit: 3–5 Agents als Default

- **Gebot:** Workflows und manuelle Subagent-Fan-outs laufen standardmäßig mit **3–5 parallelen Agents**. Mehr (technisch oft weit darüber möglich) nur mit expliziter Begründung im Workflow-Prompt UND vorherigem Kalibrierlauf (MP-09).
- **Warum:** 3–5 deckt sich mit dem gängigen Referenzmuster (ein Lead-Agent spawnt 3–5 Subagents) und mit dem eigenen WIP-Limit für das serielle PO-Gate. Darüber leiden Koordinationsqualität und Kostenkontrolle.
- **Prüfweise:** Agent-Zahl steht im Workflow-Prompt; ein Live-Statuskommando während des Runs zeigt die tatsächliche Zahl.

### MP-12 — Erprobte Workflows versionieren

- **Gebot:** Erfolgreiche Workflow-Läufe als Command unter `.claude/workflows/` des jeweiligen Repos speichern.
- **Warum:** Reproduzierbare Orchestrierung statt Neu-Improvisation — exakt der „versioniertes Operating Model"-Ansatz der Pipeline.
- **Prüfweise:** Wiederholte Workflow-Typen ohne versionierten Command fallen in der periodischen Telemetrie-Sichtung auf.

---

## 3. Token-Budget-Leitplanken

### MP-13 — Kosten pro AUFGABE messen, nie pro MTok

- **Gebot:** Kostenvergleiche und -entscheidungen ausschließlich auf Aufgabenebene (Gesamt-Tokens/-Kosten pro Task) führen. **Verbot:** $/MTok-Vergleiche über Tokenizer-/Modell-Generationen hinweg.
- **Warum (Tokenizer-Falle):** Neuere Modell-Generationen produzieren für denselben Text oft spürbar mehr Tokens als ältere — MTok-Preise sind zwischen Modell-Generationen nicht direkt vergleichbar. Ein „teureres Modell spart Iterationstokens"-Argument ist deshalb nur auf Task-Ebene überprüfbar, nie am reinen MTok-Preis.
- **Prüfweise:** Die Telemetrie (Abschnitt 5) erfasst Tokens pro Session/Block/Aufgabe — das ist die Messbasis für jeden periodischen Preis-Review (MP-21).

### MP-14 — Small-Slice-Kalibrierung vor großen Runs

- **Gebot:** Vor jedem großen Run (Workflow ODER langer autonomer Einzel-Lauf) den Spend auf einer kleinen Teilmenge messen (ein Verzeichnis, eine enge Frage) — offizielle Empfehlung.
- **Warum:** Der Verbrauch großer Läufe ist vorab kaum schätzbar; die Kalibrierung liefert die Hochrechnung, bevor das Budget weg ist.
- **Prüfweise:** Telemetrie-Zeile des großen Runs referenziert den Kalibrierlauf („Besonderheiten").

### MP-15 — `/goal` nur mit Stop-Klausel

- **Gebot:** Jede `/goal`-Bedingung für autonome Läufe enthält eine explizite Stop-Klausel (z. B. „… or stop after 20 turns"). `/goal` ohne Argument zeigt Turns + Token-Spend des laufenden Ziels — bei langen Läufen regelmäßig prüfen.
- **Warum:** Ohne Stop-Klausel gibt es keine strukturelle Obergrenze für einen fehlgeleiteten autonomen Lauf.
- **Prüfweise:** Stop-Klausel ist Teil des Briefing-Templates für autonome Läufe (`docs/operating-model.md`: „Stop-Bedingungen" sind ohnehin Pflichtteil jedes Briefings).

### MP-16 — Limits & Monitoring

- **Gebot:** Einen Nutzungs-/Kosten-Status mindestens beim Session-Abschluss abrufen (Datenquelle der Telemetrie, Abschnitt 5); Kontext-Füllstand vor großen Runs prüfen. Als Obergrenzen dienen die offiziellen Mechanismen des jeweiligen Providers (z. B. ein Monatslimit im Abo bzw. Workspace-Spend-Limits bei API-Abrechnung).
- **Verbot:** Budget-Steuerung auf undokumentierte Direktiven stützen — ein informell behaupteter Token-Budget-Bonus oder ein nicht offiziell belegtes CLI-Flag zur Budgeterhöhung gilt als UNSICHER, bis am eigenen Provider verifiziert.
- **Merkposten:** Manche Provider-APIs bieten ein Beta-Budgetfeld nur für die programmatische Messages-API an, nicht für die interaktive CLI — erst relevant, falls die Pipeline später headless/SDK-basiert orchestriert.
- **Prüfweise:** Limit gesetzt = einmalig im Bootstrap-Check dokumentiert; Nutzungswerte erscheinen in jeder Telemetrie-Zeile.

### MP-24 — Route trivial questions away from the Design-Tier session

*(English in the source — operational rule, session-routing.)*

- **Rule:** "Do not ask the orchestrator about the weather: quick questions from mobile that need no orchestrator context belong in a separate session/chat — every message to the Design-Tier session costs Design-Tier tokens and context."
- **Why:** Model and effort are session properties (MP-01, MP-17) fixed for the whole session — except the ONE sanctioned profile switch-point (PRD-gate, MP-01/MP-17/MP-18) — there is no per-message model downgrade. The fix for per-request model switching is delegation via a separate, cheaper session, not a lighter orchestrator session.
- **Check:** Session topic drift is a bootstrap/close-ritual check item (`docs/operating-model.md` §5); a Design-Tier session containing unrelated one-off/status questions is a lifecycle violation flagged at close, not a modeling problem.

### MP-26 — Advisor-Regeln (optionales Second-Opinion-Muster)

- **Gebot:**
  (a) Der Advisor wird nur genutzt, wenn `models.advisor.enabled: true` konfiguriert ist (oder per datierter Projekt-Ausnahme) — Default ist AUS (s. Preset, Abschnitt 1).
  (b) Advisor = Design-Tier-Modellklasse als Second Opinion, injiziert an Urteils-Gates. Wird der Advisor als projektweiter Standard-Betrieb gewählt (Design-Tier-Orchestrator + Advisor durchgehend aktiv statt nur punktuell), bleibt das eine ECHTE, bewusst getroffene Wahl je Projekt — niemals ein stiller Auto-Default.
  (c) Jede Telemetrie-Zeile erfasst Advisor-Aufrufzahl/-Kostenanteil, soweit die Nutzungsanzeige des Providers das ausweist.
  (d) Goldfish-/Critic-Briefings in Advisor-Sessions tragen bei Bedarf eine explizite Verbotszeile „Do not consult the advisor", bis eigene Messdaten den Nutzen bestätigen.
  (d2) Die Subagent-Modell-Matrix bleibt UNANGETASTET: Goldfish/Critic laufen immer auf dem im Dispatch explizit genannten Tier-Modell (MP-02/MP-07) — Advisor-Vererbung betrifft ausschließlich die Verfügbarkeit des Advisor-TOOLS innerhalb eines Subagenten, nie dessen eigenes Modell.
  (d3) Advisor-Hygiene präsentiert NIE blind ein globales Advisor-Aus (das kann parallele Advisor-Sessions anderer Projekte auf derselben Maschine stumm beenden). Reihenfolge: (1) nach parallelen Advisor-Sessions anderer Projekte auf dieser Maschine fragen; (2) einen projekt-lokalen Off-Schalter bevorzugen, falls die Runtime einen anbietet; (3) einen globalen Advisor-Aus-Schalter NUR nutzen, wenn keine parallele Session betroffen ist; (4) weicht der TATSÄCHLICHE Advisor-Zustand vom beabsichtigten Zustand des gewählten Profils ab, ist das eine Pflichtfrage an den PO, keine stille Korrektur.
  (d4) Nach jedem Kontext-Kompaktierungsschritt (`/compact` o. Ä.) in einer Advisor-aktiven Session MUSS die Advisor-Verfügbarkeit aktiv geprüft und im Session-Protokoll notiert werden — Kompaktierung × Advisor-Wechselwirkung ist ein bekannter blinder Fleck, den diese Prüfpflicht schließt.
  (e) Der Orchestrator SOLLTE Advisor-Konsultation an Urteils-Gates aktiv anfordern (Dispositionen, Readiness-Triage, Inzident-Entscheide) statt sich allein auf modellgesteuertes Timing zu verlassen.
  (f) Advisor-Effort ist nicht separat konfigurierbar (er läuft auf dem festen Design-Tier-Effort).
  (g) **Advisor-Ausfall-Workaround (gehärtet):** Meldet ein Advisor-Aufruf in einer Advisor-aktiven Session einen Fehler/`unavailable`, gilt in dieser Reihenfolge:
  1. SOFORT-Meldung an den PO beim ERSTEN Fehlschlag — nie stilles Weiterlaufen ohne Advisor.
  2. **PFLICHT-PRIMÄRPFAD, kein optionaler Vorschlag:** der Orchestrator dispatcht UNMITTELBAR einen read-only Advisor-Consult-Subagenten als Ersatz (Design-Tier-Modellklasse, Dispatch-Metadaten `role=consult-advisor` — der gebundene Fallback-Agent heißt in diesem Plugin `consult-advisor`, `plugins/pipeline-core/agents/consult-advisor.md`), GENAU eine Frage je Consult, keine Repo-Schreibzugriffe; die Antwort fließt in das Orchestrator-Urteil ein, wird nie automatisch angewandt.
  3. Zusätzlich, NICHT alternativ, bietet der Orchestrator dem PO einen Umschalt-Block auf ein alternatives Advisor-Modell als OPTIONALES ANGEBOT an — Entscheidung liegt beim PO, kein Orchestrator-Alleingang.
  **Verbot (explizit):** (i) stilles Weglassen der Advisor-Konsultation und (ii) ein einseitiger Wechsel des HAUPTMODELLS als Reaktion auf den Advisor-Ausfall sind KEINE zulässigen Ersatzhandlungen für Schritt 2 — beide wurden real beobachtet und sind genau die Lücke, die diese Härtung schließt.
- **Warum:** Advisor-Kosten skalieren mit der Kontextlänge (ungecachte Full-Conversation-Reads); ohne diese Leitplanken würde das Advisor-Muster die Kostendisziplin unterlaufen, die die Tier-Matrix herstellen soll. Die Hygiene-Reihenfolge (d3) verhindert, dass ein blindes globales Advisor-Aus Nachbarsessions beschädigt.
- **Prüfweise:** Dispatch-Metadaten und Briefings zeigen die Verbotszeile in Advisor-Sessions, wo zutreffend; Telemetrie-Zeile weist Advisor-Aufrufe aus („Besonderheiten"); der Bootstrap-Schritt zur Advisor-Konfiguration prüft die Hygiene-Reihenfolge inkl. der Pflichtfrage bei Divergenz; Session-Notizen tragen den Post-Kompaktierungs-Advisor-Check (d4); ein Advisor-Ausfall löst binnen desselben Turns die (g)-Meldung UND binnen desselben oder des nächsten Turns den Consult-Advisor-Dispatch aus — stilles Weiterlaufen ohne Advisor, oder ein einseitiger Modellwechsel statt des Dispatches, ist ein Bootstrap-/Prozessfehler, kein Judgment Call.

---

## 4. Cache-Disziplin

### MP-17 — Modell + Effort am Sessionanfang fixieren

- **Gebot:** Modell und Effort werden zu Sessionbeginn gesetzt (Design-Phase: Design-Tier-Modell + Standard-Effort, MP-01) und bleiben bis zur nächsten Phasen-/Profilgrenze stabil. **Sanktionierte EINE Ausnahme:** im Gate-Wechsel-Profil (MP-01) genau EIN Wechsel auf die günstigere Ausführungsphasen-Konfiguration unmittelbar am PRD-Freigabe-Gate. Der Rück-Wechsel zurück auf das teurere Design-Tier-Modell mitten in der Session bleibt VERBOTEN. Jeder andere Wechsel — falls unvermeidbar — nur an Aufgabengrenzen.
- **Warum:** Ein Modell- oder Effort-Wechsel invalidiert den kompletten Prompt-Cache; bei langen Sessions heißt das eine volle, teure Neuverarbeitung des Verlaufs. Ebenfalls Invalidatoren (providerabhängig, vor Sessionbeginn verifizieren): Fast-Mode-Wechsel, MCP-Connect/Disconnect (nicht-deferred), Deny-Regel auf blanke Toolnamen, Kontext-Kompaktierung, Runtime-Upgrade mitten in einer Session.
- **Prüfweise:** Bootstrap-Pflichtschritt (`harness/session-bootstrap.md`); Cache-Gesundheit messbar über das Verhältnis Cache-Read- zu Cache-Creation-Tokens (hohes Read-zu-Write-Verhältnis = gesund; dauerhaft hohe Creation = Invalidator suchen).

### MP-18 — Subagenten-Schnitt statt Modellwechsel

- **Gebot:** Braucht eine Aufgabe ein anderes Modell oder viel Token-Durchsatz, wird sie an einen Subagent (Goldfish/Critic) geschnitten — nie per Modellwechsel-Kommando in der laufenden Design-Tier-Session gewechselt.
- **Verbot:** Ein eingebauter „Plan auf großem Modell, Exec auf kleinem Modell"-Auto-Toggle-Alias wird in der Pipeline nicht verwendet.
- **Sanktionierte Ausnahme:** Der EINE Gate-Wechsel am PRD-Freigabe-Gate (MP-01) ist von diesem Verbot ausgenommen — er ist ein geplantes, im Dispatch-Ledger dokumentiertes Ereignis, kein Modellwechsel „in der laufenden Session" im Sinne dieser Regel. Der Rück-Wechsel bleibt ohne Ausnahme verboten.
- **Warum:** Subagents haben einen eigenen, kurzlebigen Cache; der Parent-Cache bleibt intakt — ein Modellwechsel in der Session zerstört ihn dagegen komplett. Deshalb ist ein durchgehend teureres Design-Tier-Modell mit der Cache-Ökonomie verträglich: Der Orchestrator-Kontext wird als billiger Cache-Read wiederverwendet, die token-intensive Arbeit läuft in billigen, frischen Goldfish-Kontexten. Ein Auto-Toggle-Alias wechselt das Modell bei jedem Plan↔Exec-Übergang und bezahlt jedes Mal den Cache neu.
- **Prüfweise:** Ein Modellwechsel in der Telemetrie ist NUR dann eine Auffälligkeit, wenn er NICHT das dokumentierte PRD-Gate-Wechsel-Ereignis ist — dieses wird als ERWARTETES Ereignis mit Ledger-Eintrag + Identitätsverifikation geführt, keine Anomalie. Jeder andere Modellwechsel bleibt Auffälligkeits-Kandidat. Statusanzeige/Nutzungs-Kommando zeigen das Cache-Verhältnis.

### MP-19 — Kontext-Hygiene: Clear/Compact/Rewind-Regeln

- **Gebote:**
  1. **Themenwechsel → neue/umbenannte Session** (vorher umbenennen zur Wiederauffindbarkeit). „Stale context wastes tokens on every subsequent message."
  2. **Kompaktierung nur an natürlichen Aufgabengrenzen**, immer mit Fokus-Argument — nie Auto-Kompaktierung mitten im Task treiben lassen. **Checkpoint-Regel:** an jeder Aufgabengrenze (Paket-/Wellen-Grenze, PRD-Gate, vor dem ersten Dispatch eines neuen Pakets) mit hohem Kontext-Füllstand ist eine fokussierte Kompaktierung PFLICHT-Checkpoint, kein Notfall-Ventil; deutlich darüber gilt als überfälliger Schnitt. **Cache-Ökonomie-Notiz:** Kompaktierung baut den warmen Cache NEU auf (voller Reprocessing-Kostenblock) — daher nur an Grenzen setzen, wo der Rebuild sich amortisiert, konsistent mit MP-17 und ohne Widerspruch zum dort sanktionierten EINEN Gate-Wechsel (der Compact-Checkpoint ist eine Cache-Rebuild-Entscheidung, keine zusätzliche Modellwechsel-Ausnahme).
  3. **Rücksprung auf einen gecachten Prefix statt Kompaktierung**, wenn ein Lösungsweg komplett verworfen wird — das ist billiger als eine Neuverdichtung.
  4. CLAUDE.md-/Memory-Edits sind cache-safe, greifen aber erst nach dem nächsten Clear/Compact/Restart — nicht wundern, nicht doppelt patchen.
  5. Ein automatischer Modell-Fallback (z. B. ein Safety-Classifier-Downgrade) = Cache-Verlust → in Telemetrie-„Besonderheiten" vermerken, falls beobachtet.
- **Hinweis Worktrees:** Der Cache gilt pro Maschine + Arbeitsverzeichnis — jeder Worktree hat einen eigenen Cache. Bei paralleler Goldfish-Planung als Kostenfaktor einkalkulieren.
- **Warum:** Kontext-Hygiene ist der zweitgrößte Kostenhebel nach der Modellwahl; die Regeln sind offizielle Faustregeln, keine Pipeline-Erfindung.
- **Prüfweise:** Session-Lifecycle-Politik im Operating Model (`docs/operating-model.md`) macht diese Regeln zum Pflichtwissen jeder Design-Tier-Session; Verstöße werden über das Cache-Verhältnis (MP-17) sichtbar; ein Kompaktierungs-Block an einer Aufgabengrenze mit hohem Füllstand ist im Dispatch-Ledger/Handover sichtbar.

---

## 5. Kosten-Telemetrie

### MP-20 — Instrument: `telemetry/costs.md` je Projekt, geschrieben beim Sessionabschluss

- **Gebot:** Jedes Pipeline-Projekt (auch das eigene Meta-Repo, sofern es die Pipeline auf sich selbst anwendet) führt eine versionierte Datei **`telemetry/costs.md`**. Beim Session-Abschluss (`/close`-Ritual) wird pro Session bzw. pro abgeschlossenem Block **eine Zeile** angehängt:

  | Datum | Session/Block | Rolle | Modell/Effort | Aufgabe (kurz) | Tokens | First-Pass (j/n) | Eingriffe nötig (j/n) | Besonderheiten |
  |---|---|---|---|---|---|---|---|---|
  | JJJJ-MM-TT | S4/B2 | Elephant | Design-Tier / high | Phase-2-Dispatch Policies | 1,1M in (Cache-R 90 %) / 60k out | — | — | — |
  | JJJJ-MM-TT | S4/B2-G1 | Goldfish | Implement-Tier / medium | model-policy verfasst | 250k in / 30k out | j | n | — |

  Konventionen: Rolle ∈ {Elephant, Goldfish, Critic, Workflow}; „Tokens" = Input/Output plus Cache-Read-Anteil, so wie die Nutzungsanzeige des Providers sie ausweist (Subagent-/Skill-Attribution nutzen, wo verfügbar); „Besonderheiten" = Eskalationen (MP-05/MP-07), Modell-Fallback, Cache-Auffälligkeiten, Kalibrierläufe, Workflow-Agent-Zahl.
- **Reifemetrik-Erhebung (Nutzen-/Selbst-Messgröße, `docs/operating-model.md` §7):** Die Spalten **„First-Pass (j/n)"** (Abgabe ging ohne Nacharbeitszyklus durchs Gate) und **„Eingriffe nötig (j/n)"** (manuelle Eingriffe/Kurskorrekturen während des Laufs) werden **je Goldfish-Dispatch** gepflegt; Elephant-/Critic-Zeilen tragen „—".
- **Headless-Konvention:** Headless-/Bare-Läufe (`policies/tooling-policy.md`) tragen zusätzlich einen von der Runtime maschinenlesbar gelieferten Gesamtkostenwert in die Token-Spalte ein (als $-Wert kennzeichnen), soweit die Runtime das liefert.
- **Subagent-Token-Konvention:** Dispatch-Zeilen tragen Subagent-Tokens in der Tokens-Spalte, annotiert „(subagent)"; bei über Resume/mehrere Turns fortgesetzten Dispatches ist der ausgewiesene Wert KUMULATIV und mit „(kumulativ)" zu kennzeichnen — nie über mehrere Zeilen hinweg doppelt aufsummieren.
- **Budget-Eskalationskriterium (Referenzziel von `docs/operating-model.md` §4.3, Stufe 4):** Budget-Überschreitung liegt vor, wenn das Monatslimit erreicht ist ODER die Hochrechnung eines Kalibrierlaufs (MP-09/MP-14) die Erwartung deutlich übersteigt → Stop + Eskalation an den PO.
- **Übergangsregel:** Solange kein Automatismus die Zeile schreibt, wird sie manuell beim Session-Abschluss gepflegt. Sobald ein Close-Skill/Ledger-Script (z. B. `harness/scripts/usage-ledger.mjs`) verfügbar ist, übernimmt es die Token-Hälfte automatisch; die $-Spalte bleibt dann eine markiert GESCHÄTZTE Rechenhilfe aus einer lokalen Preistabelle (z. B. `harness/scripts/model-prices.json`) — der MP-13-Vorbehalt „Kosten pro Aufgabe, nie pro MTok" bleibt unverändert, die Schätzung ist eine Rechenhilfe, kein MTok-Vergleich. Ein später eintreffender echter Beleg wird als datierter Nachtrag in die bestehende Zeile eingearbeitet (echte Zahl überschreibt die Schätzung, die Schätzung bleibt als Kalibrierdatum sichtbar — MP-21-Review nutzt diese Drift-Daten). Die lokale Preistabelle ist an den MP-21-Preis-Review gekoppelt: jeder Review aktualisiert BEIDES, Abschnitt 6 dieser Policy und die Preistabellen-Datei.
- **Periodische Sichtung:** Die erste Design-Tier-Session eines Turnus (z. B. Monatsanfang) sichtet die Vorperioden-Zeilen und hängt 3–5 Zeilen Befund unter `## Sichtung JJJJ-MM` an die Datei an (Auffälligkeiten, Eskalationsquote, Cache-Gesundheit, grobe $-Schätzung über die lokale Preistabelle — als Schätzung kennzeichnen, MP-13 beachten). Pflichtteil der Sichtung: **First-Pass-Quote und Nacharbeitsaufwand** über die Goldfish-Zeilen auswerten.
- **Warum:** „Kosten-Telemetrie ab Tag 1" bleibt ohne Instrument ein Soft-TODO; ein Preis-Review braucht reale Task-Kosten-Daten, keine MTok-Rechnungen.
- **Prüfweise:** Datei existiert und wächst (Git-Log); ein Close-Automatismus (falls vorhanden) erzwingt den Schritt; ein Drift-Check des Abschluss-Rituals deckt vergessene Zeilen auf.

---

## 6. Kostenrichtwerte & Preis-Review

Diese Policy führt bewusst KEINE fest verdrahtete $/MTok-Tabelle mehr — Modellpreise ändern sich häufiger als diese Policy und unterscheiden sich je Provider/Tier. Stattdessen gilt:

- **Höhere Fähigkeitsklassen kosten pro Token in der Regel mehr** — Effort ist der wirksamste Kostenhebel innerhalb eines Tiers (nicht die Tier-Wahl selbst herunterschrauben, MP-06); Kostenentscheidungen immer auf Task-Ebene treffen, nie am reinen $/MTok-Wert (MP-13).
- **Vor jeder Kostenentscheidung die aktuelle Preisseite des eigenen Providers gegenprüfen** — diese Policy nennt bewusst keine Snapshot-Zahlen, die veralten würden. Konkrete, für dein Setup gültige Zahlen gehören in deine lokale Preistabelle (z. B. `harness/scripts/model-prices.json`, falls vorhanden) oder eine eigene Kalkulationsnotiz — nicht in diese Datei.
- **Modell-/Provider-Betriebsnotiz (generische Vorsicht):** Manche Modelle rechnen Thinking-Tokens verdeckt als teuren Output ab, oder haben abweichende Cache-Break-even-Punkte, Kontextfenster-Aufschläge, Batch-Rabatte oder eine andere Tokenizer-Effizienz gegenüber älteren Generationen — vor einer Kostenannahme das TATSÄCHLICHE Verhalten des konfigurierten Modells verifizieren, nicht das eines anderen Modells unterstellen.
- **Abrechnungsmodell beachten:** Manche Provider führen einzelne Modelle außerhalb des Plan-Kontingents (Overage/Credits), andere Modelle bleiben im Kontingent — das beeinflusst, welches Tier sich für Dauerbetrieb eignet (relevant für die Profilwahl in MP-01) und ist am eigenen Account zu prüfen, nicht anzunehmen.

### MP-21 — Periodischer Preis-Review + Anpassungsvorbehalt

- **Gebot:** Ein Preis-Review findet periodisch statt (z. B. quartalsweise, oder ausgelöst durch eine Provider-Preisänderung bzw. das Auslaufen einer Einführungskondition) — Termin und Anlass im eigenen Projekt-Entscheidungsprotokoll festhalten. Input: Telemetrie-Daten aus MP-20 (Task-Kosten je Rolle), Eskalationsquoten, Cache-Verhältnis. Gegenstand: das gesamte Preset in Abschnitt 1, der Goldfish-Effort-Default, die Eskalationskriterien.
- **Anpassungsvorbehalt:** Das Preset gilt unter Vorbehalt — Anpassung ausdrücklich vorbehalten, falls ein Tier sich als zu teuer für die erzielte Qualität erweist. Zwischenbefunde der periodischen Sichtung (MP-20) können den Review vorziehen.
- **Prüfweise:** Der Review-Termin ist im eigenen Projekt-Entscheidungsprotokoll verankert; die erste Sichtung nach Fälligkeit MUSS den Review-Befund dokumentieren.

---

*Formalisierung: Die tier- und workflow-übergreifenden Anteile dieser Policy werden bei Bedarf in `docs/adr/` als ADRs festgeschrieben (u. a. Workflow-Vorbedingungen für acceptEdits und die Hochrisiko-Projekt-Sonderregel). Rangfolge unverändert: das eigene Entscheidungsregister (falls vorhanden) > ADR > diese Policy-Ausformulierung.*
