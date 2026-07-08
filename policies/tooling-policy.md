# Tooling-Policy — Werkzeugwahl im Claude-Code-Harness

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 2

**Zweck.** Diese Policy legt fest, WELCHES Claude-Code-Primitiv für WELCHE Art von Regel oder Arbeit eingesetzt wird — damit Regeln dort landen, wo sie garantiert gelten, und Kontext dort gespart wird, wo er am knappsten ist. Sie gilt für alle Projekte (<PROJECT_A>, <PROJECT_B>, <PROJECT_C>, künftige) und per Selbstanwendung für das Pipeline-Repo selbst.

**Einordnung.** Rollen, SDLC und Session-Lifecycle: `docs/operating-model.md` · Modell/Effort/Kosten inkl. Ultracode-Indikationsliste: `policies/model-policy.md` · Session-Start-Protokoll und Plugin-Staleness-Check: `harness/session-bootstrap.md` · Formalisierte Einzelentscheidungen: `docs/adr/`. Bei Konflikt gilt der kanonische Entscheidungsstand in `docs/state.md`. Diese Policy operationalisiert insbesondere die Plugin-Verteilung, Goldfish/Critic als Subagents, Workflows, Permissions/Worktree/Plan Mode, die git-guard-Union sowie den Tooling-Radar.

---

## 1. Grundsatz

### G1 — Deterministisches gehört in Settings/Hooks, nicht in Prosa

- **Gebot:** Jede Regel, die IMMER gelten muss (Verbote, Schutzpfade, Gates), wird als Permission-Rule oder Hook implementiert — nie ausschließlich als Text in CLAUDE.md oder einer Policy.
- **Warum:** CLAUDE.md ist offiziell „context, not enforced configuration" — advisory, kein Enforcement-Layer. Nur ein PreToolUse-deny-Hook blockiert garantiert, sogar im `bypassPermissions`-Modus. Prosa-Regeln haben in the PO's Projekten nachweislich versagt (→ Anti-Pattern AP-T2, §3).
- **Prüfweise:** Jede als MUSS/NIE/IMMER formulierte Regel in CLAUDE.md oder Projekt-Doku hat ein benanntes durchsetzendes Artefakt (Permission-Rule, Hook, CI-Check) — oder trägt die explizite Markierung „advisory". Der Critic prüft das bei Guardrail-Reviews; der Drift-Check im `/close` bei Regeländerungen.

### G2 — Bei Agent-Fehlern zuerst den Harness debuggen

- **Gebot:** Wenn ein Agent falsch arbeitet, wird in dieser Reihenfolge geprüft, BEVOR Modell oder Effort gewechselt wird: (1) Briefing/Spec vollständig und widerspruchsfrei? (2) Kontext sauber (CLAUDE.md-Länge, Stand-Drift, Themenmix)? (3) Tools/Permissions passend geschnitten — fehlt etwas oder ist etwas zu weit offen? (4) Hooks/Gates korrekt verdrahtet und wirklich gelaufen?
- **Warum:** „Agent = Model + Harness" — das Verhalten wird vom Harness dominiert, Agent-Fehler sind meist Konfigurationsfehler (Google-Leitprinzip). Ein Modellwechsel bei kaputtem Harness verbrennt Tokens und maskiert die Ursache.
- **Prüfweise:** Die Zwei-Fehlversuche-Regel eskaliert an den Elephant; dessen Eskalationsprotokoll (→ `docs/operating-model.md`) beginnt mit dieser Harness-Checkliste. Modell-/Effort-Änderungen als Fehlerreaktion sind begründungspflichtig gegen `policies/model-policy.md`.

### G3 — Zugesagte Kontrollen sind Verträge (Watchdog-Pflicht)

- **Gebot:** Hintergrund-Läufe ohne Zwischenoutput werden NIE ohne automatischen Watchdog gestartet (Monitor/Timeout/Idle-Erkennung mit Auto-Kill und lautem Fehlreport). Eine zugesagte Kontrolle („ich prüfe in 5 Minuten") wird **im selben Zug mechanisiert** (Monitor, Scheduler, Hook) — oder die Zusage wird explizit zurückgezogen. **Der PO ist nie der Watchdog.**
- **Warum:** In einem dokumentierten Vorfall wurde eine versprochene 5-Minuten-Kontrolle nicht gebaut; the PO musste zweimal selbst pollen, zwei Headless-Läufe hingen still (15+ min, 0 Bytes Output). Ein Versprechen ist Prosa; nur ein Mechanismus kontrolliert — G1-Logik, angewandt auf Prozess-Zusagen statt Regeln.
- **Prüfweise:** Jeder Background-Start hat in der Trajektorie einen benannten, sichtbaren Watchdog-Mechanismus; die goldfish-dispatch-Checkliste führt den Punkt; der Critic flaggt Background-Läufe ohne Watchdog in der Trajektorienprüfung.

### G4 — Smoke-Test-Pflicht für neue Transportwege

- **Gebot:** Bevor ein teurer oder langer Lauf an einen NEUEN Transportweg gehängt wird (Headless-CLI, Background-Ausführung, stdin-/cwd-/Auth-Konstellation, CI-Pfad), läuft ein ~30-Sekunden-Trivialaufruf durch den **vollen** Pfad — gleiche Flags, gleicher Ausführungskontext (Background ja/nein, stdin-Quelle, Arbeitsverzeichnis, Credentials). Erst grüner Smoke-Test, dann Nutzlast.
- **Warum:** Alle drei dokumentierten Headless-Defekte (`--bare`-Credential-Bug, Workspace-Deadlock ohne `--add-dir`, stdin-Pipe-Hänger im Background) hätte ein 30-Sekunden-Test durch den vollen Pfad vorab gefunden — stattdessen kosteten sie zwei stille Hänger in einer Arbeitssession.
- **Prüfweise:** Die Erstnutzung eines Transportwegs zeigt in der Trajektorie den Trivialaufruf VOR dem Erstlauf; die Telemetrie-Spalte „Besonderheiten" vermerkt den Smoke-Test bei neuen Pfaden.

---

## 2. Werkzeug-Matrix

Übersicht: Aufgabentyp → Werkzeug. Die verbindlichen Regeln je Werkzeug (W1–W9) folgen darunter.

| Aufgabentyp | Werkzeug | Warum | Beispiel aus the PO's Projekten |
|---|---|---|---|
| Ritual/Prozedur, vom Menschen getimed | **Skill** mit `disable-model-invocation: true` | Body lädt erst bei Aufruf (Progressive Disclosure); Mensch kontrolliert Nebenwirkungen | `/new-block-review` + `/close` (alle drei Projekte) |
| Prozedurales Wissen für das Modell | **Skill** (default bzw. `user-invocable: false`) | Nur die description kostet dauerhaft Kontext | Spec-Schreib-Protokoll, Critic-Aufrufprozedur (Phase 3) |
| Abgegrenzte Umsetzung, frischer Kontext | **Subagent** (Goldfish) | Eigenes Kontextfenster, keine History-Leaks, Summary-Rückgabe | Ein geschnittener <PROJECT_A>-Block als Ein-Auftrag-Run |
| Unabhängige Prüfung | **Subagent read-only** (Critic); `--bare`-Stufe für kritische Diffs | Kontext-Isolation vom Bau-Kontext; `--bare` = totale Input-Kontrolle | Adversariale Reviews vor <PROJECT_B>-Live-Umbauten (bisher ad hoc) |
| Verbose Arbeit (Testläufe, Logs, Doku-Fetches) | **Subagent** | Output verstopft nicht den Hauptkontext | Playwright-Lauf-Analyse in <PROJECT_A> |
| Unverhandelbare Regel | **Hook** (PreToolUse-deny, Stop-Gate, SessionStart) | Einzige Ebene, die auch in `bypassPermissions` hält | `guard-git`, `lint-on-stop` (<PROJECT_A>), `cpp-compile-on-stop` (<PROJECT_C>) |
| Erlaubnis-Grenzen je Repo | **settings.json-Permissions** (committed) | allow/ask/deny deterministisch, versioniert, klon-reproduzierbar | <PROJECT_B>: deny auf `secrets.yaml`/`.storage`; <PROJECT_A>: allow `Bash(npm run *)` |
| Teure Fehländerungen vermeiden | **Plan Mode** (`defaultMode: plan`) | Read-only-Exploration vor jedem Edit | <PROJECT_B> (lebendes Haus) + <PROJECT_C> (Engine-Code) |
| Massiv-parallele Recherche / Audit / Migration | **Dynamic Workflow / Ultracode** (Task-Opt-in) | Zwischenergebnisse leben im Skript, nicht im Kontext | <PROJECT_C>-weite API-Migration; <PROJECT_B>-Config-Audit; Sprint-0-Tiefenrecherche |
| Reproduzierbarer Prüflauf / CI | **Headless** `claude -p --bare` / GitHub Action | Kein Auto-Discovery, maschinenlesbares Verdikt, Kosten pro Lauf messbar | Critic-`--bare`-Stufe; perspektivisch PR-Checks in <PROJECT_C> |
| Schreibende Parallel-Arbeit isolieren | **git worktree** (gemäß Projekt-Kalibrierung) | Parallele Goldfische kollidieren nicht; revertierbar | Nacht-Build-Muster der <PROJECT_A> („nur auf Branch") als Worktree-Nachfolger |
| Fremdsystem ohne brauchbare CLI | **MCP** (Minimalismus) | Nur dann rechtfertigt der Kontextpreis den Anschluss | `mcp-unreal` in <PROJECT_C> (Editor-API hat keine CLI) |

### W1 — Skill

- **Gebot:** Rituale und Prozeduren leben als versionierte Skills im Plugin — nie als Prosa-Abschnitt in CLAUDE.md. Skills mit Nebenwirkungen, die der Mensch timen soll (Close, Merge, Radar), bekommen `disable-model-invocation: true`; reines Hintergrundwissen `user-invocable: false`.
- **Warum:** Progressive Disclosure — nur die description ist dauerhaft im Kontext, der Body lädt bei Invokation. Genau das löst die CLAUDE.md-Wucherung (AP-T2).
- **Beispiel:** Das Ritual-Paar `/new-block-review` + `/close` existiert bereits in allen drei Projekten als Skill — die Pipeline zentralisiert es parametrisiert (Mechanismus → `docs/operating-model.md`).
- **Prüfweise:** CLAUDE.md der Projekte enthält Fakten, Kommandos und Verweise — keine Schritt-für-Schritt-Prozeduren (Längen-Gate). Frontmatter-Review der Invocation-Schalter im Critic-Durchgang von Phase 3.

### W2 — Subagent (Goldfish / Critic / verbose Arbeit)

- **Gebot:** Goldfish = Custom Subagent OHNE `memory`-Feld. Warum kein memory: Das Feld aktiviert automatisch Write/Edit und widerspricht der Goldfish-Definition „frischer Kontext, vergisst".
- **Gebot:** Critic = read-only Subagent (Tool-Allowlist ohne Write/Edit, kein memory); für Architektur-/Guardrail-/Security-Diffs die härtere `--bare`-Stufe (W7). Der Critic sieht nie den Chat-Verlauf.
- **Gebot:** Verbose Arbeit (Testsuiten, Log-Analysen, Doku-Fetches) in Subagents auslagern; nur die Summary kehrt zurück.
- **Gebot (Read-only technisch erzwingen):** Dispatches, die nichts schreiben sollen (Text-Return-Drafts, Recherche, Review-Vorbereitung), laufen auf einem **read-only Agent-Typ** (Tool-Allowlist ohne Write/Edit) — nie mit bloßem Schreibverbot im Briefing-Text. **Beleg:** In einem dokumentierten Vorfall schrieben zwei Drafter trotz expliziter Read-only-Anweisung direkt auf Disk. Prosa begrenzt nicht; Toolsets begrenzen. **Prüfweise:** Dispatch-Metadaten nennen den Agent-Typ; ein Briefing mit Schreibverbot auf schreibfähigem Agent-Typ flaggt der Critic als Dispatch-Fehler des Elephant.
- **Achtung:** Custom Subagents laden CLAUDE.md + Git-Status automatisch — das Goldfish-Briefing muss also nur die Task-Spec enthalten, nicht die Projektregeln; wer volle Input-Isolation braucht, nimmt die `--bare`-Stufe.
- **Beispiel:** Die wirksamen Ad-hoc-Adversarial-Reviews aus <PROJECT_A>/<PROJECT_B> werden als Critic-Subagent institutionalisiert; ein <PROJECT_A>-Block wird als Ein-Auftrag-Goldfish umgesetzt statt in der Marathon-Session (AP-T3).
- **Prüfweise:** Frontmatter-Kontrolle der Plugin-Agents (Phase 3): `goldfish` ohne `memory`, `critic` ohne Write/Edit. Der Critic-Kontrakt prüft zusätzlich die Trajektorie.

### W3 — Hook

- **Gebot:** Unverhandelbare Regeln als Hooks: (1) git-guard als PreToolUse-deny — zentrale **Union** aller drei Projekt-Inkarnationen + Projekt-Deny-Config; (2) Stop-Gates, die das EINE verify-Skript des Projekts fahren; (3) SessionStart-Reinjection (Matcher `compact`) für den Pipeline-Zustand langlebiger Elephant-Sessions.
- **Design-Regeln (aus dem Bestand übernommen):** fail-open als Sicherheitsnetz, exit 2 mit Klartext-Begründung, Warum-Header in jedem Guard; Stop-Hook-Block-Cap und `stop_hook_active` beachten.
- **Warum:** PreToolUse-deny hält auch in `bypassPermissions` — die einzige Ebene, die für Workflow-Subagents in `acceptEdits` trägt (W6).
- **Beispiel:** `guard-git.mjs` existiert dreifach divergiert, keine Kopie ist Superset — der klarste Beleg, warum Hooks zentral versioniert und verteilt werden müssen.
- **Prüfweise:** Hooks liegen in `hooks/hooks.json` des Plugins; je Deny-Regel existiert ein Testfall (Block- + Allow-Gegenfall: `plugins/pipeline-core/hooks/guard-git.test.mjs`, Lauf mit `node`); Hook-Ausführung ist in der Trajektorie sichtbar und wird vom Critic geprüft. Das Stop-Hook-Gate-Framework (Punkt 2) ist OFFEN (Phase 4).

### W4 — settings.json-Permissions

- **Gebot:** allow/ask/deny je Repo in `.claude/settings.json` committed; persönliche Lockerungen nur in `settings.local.json` (nicht committet).
- **Verbot:** Sicherheit über fragile Bash-Argument-Patterns bauen. Stattdessen: eng geschnittene denies + `WebFetch(domain:…)`-Allowlist oder PreToolUse-Validator-Hook (offizielle Warnung).
- **Warum:** Auswertung deny → ask → allow, first match; ein deny ist auf keiner Ebene aufhebbar — deshalb denies eng schneiden statt breit + Ausnahme.
- **Beispiel:** <PROJECT_B>: deny auf `secrets.yaml`/`.storage` (heute im guard-git, künftig zusätzlich als Permission); <PROJECT_C>: Content-Pack-Denies; <PROJECT_A>: allow `Bash(npm run *)`.
- **Prüfweise:** Frischer-Klon-Test: ein frisch geklontes Projekt-Repo hat identische Permission-Grenzen ohne Handarbeit (Bootstrap-Check → `harness/session-bootstrap.md`).

### W5 — Plan Mode

- **Gebot:** `defaultMode: plan` in der committeten settings.json von **<PROJECT_B> und <PROJECT_C>** — überall, wo eine falsche Änderung teuer ist (scharfes Alarmsystem/Live-Geräte bzw. Engine-Code mit Buildkosten und PIE-Abnahme).
- **Warum:** Plan Mode ist ein Permission-Mode: read-only-Exploration, Plan-Vorschlag, erst die Freigabe schaltet in den Ausführungsmodus; die Recherche läuft im Plan-Subagent und flutet den Hauptkontext nicht.
- **Gate-Grenze ehrlich benennen:** Plan Mode schützt Quellcode — genehmigte explorative Bash-Kommandos können trotzdem Seiteneffekte haben. Er ersetzt weder git-guard noch Zustimmungsregeln.
- **Prüfweise:** `defaultMode` steht in der committeten settings.json beider Repos (Umsetzung in Phase 4).

### W6 — Dynamic Workflows / Ultracode

- **Gebot:** Niedrigschwelliger **Task-Opt-in** gemäß der positiven Indikationsliste in `policies/model-policy.md`: initiale Recherchen, Vorgehensmodell-/Architektur-Exploration, Audits, Migrationen. Kalibrierlauf bei neuartigen großen Workflows empfohlen, keine Pflicht.
- **Verbot:** Schreibende Workflows ohne die drei Vorbedingungen: installierte Hook-Guardrails (git-guard-Union, W3) + enge Bash-Allowlist (W4) + Worktree (W8). **Grund:** Workflow-Subagents laufen technisch IMMER in `acceptEdits` und erben die Tool-Allowlist — `plan`/`ask` greifen dort nicht. Die Schutzebene ist also ausschließlich Hook + Allowlist + Isolation.
- **Sonderregel <PROJECT_B>:** Bis zur Guard-Migration laufen schreibende Workflows in <PROJECT_B> nur mit expliziter the PO-Freigabe.
- **Versionsvoraussetzungen (normativ):** Dynamic Workflows ≥ Claude Code **2.1.154**; `/goal` ≥ **2.1.139**. Der Radar-Lauf (§4, R3) prüft diese min-version-Marker auf Aktualität.
- **Formalisierung:** Workflow-ADR mit diesen Vorbedingungen → `docs/adr/`.
- **Prüfweise:** Vor jedem schreibenden Workflow-Start: Drei-Vorbedingungen-Check (Teil des Workflow-ADR); Token-Verbrauch landet in der Kosten-Telemetrie (→ `policies/model-policy.md`).

### W7 — Headless / CI

- **Gebot:** Reproduzierbare Prüfläufe als `claude -p --bare` mit `--json-schema` und `--permission-mode dontAsk`: kein Auto-Discovery von Hooks/Skills/Plugins/MCP/CLAUDE.md → totale Input-Kontrolle, maschinenlesbares Verdikt. Das ist die `--bare`-Stufe des Critic für kritische Diffs.
- **Gebot:** `total_cost_usd` aus `--output-format json` fließt in die Kosten-Telemetrie (Instrument → `policies/model-policy.md`).
- **GitHub Action:** Wo CI-Automation gewünscht ist: `anthropics/claude-code-action@v1` mit den offiziellen Sicherheits-Defaults — enge `--allowedTools`, `--max-turns`, Least-Privilege-Permissions, Secrets statt Keys. Actions werden SHA-gepinnt (Lehre aus <PROJECT_B>s nie erledigtem Pin-TODO).
- **OFFEN (Phase 4):** Ob und in welchen Projekten die GitHub Action eingesetzt wird (nur <PROJECT_C> hat einen PR-Flow als natürlichen Andockpunkt; Kosten-Nutzen je Projekt im Migrationsdossier).
- **Prüfweise:** Der Critic-`--bare`-Aufruf existiert als versioniertes Skript mit festem `--json-schema` — OFFEN (Phase 4); bis dahin gilt der Kommentar-Kontrakt in `templates/prompts/critic-review.md`. CI-Workflows referenzieren Actions nur per SHA.

### W8 — git worktree

- **Gebot:** Schreibende Goldfische werden per Worktree isoliert (`isolation: worktree` bzw. `claude --worktree`) — **gemäß Projekt-Kalibrierung, nicht pauschal**.
- **Warum:** Parallele Schreibarbeit ohne Kollision, offiziell first-class unterstützt. Die Windows-Praxis (lange Pfade, node_modules-Duplizierung) ist ⚠ UNSICHER — nur Community-Erfahrung, keine offizielle Aussage; deshalb Kalibrierung statt Pauschale.
- **Projekt-Vorbehalte:** <PROJECT_C>: das Editor-gebundene Compile-Gate ist im Worktree fail-open — Worktree-Einsatz dort erst nach validierter Fallback-Stufe. <PROJECT_A>: Setup-Kosten je Worktree (npm install) einkalkulieren, `.worktreeinclude` für `.env.local`.
- **OFFEN (Phase 4):** Worktree-Stufe + Fallback je Projekt validieren und in der Projekt-Kalibrierungsdatei festschreiben. <PROJECT_C>s Stale-Worktree-Check aus dem `/close` wird generalisiert (WIP-Regel → `docs/operating-model.md`).
- **Prüfweise:** Die Projekt-Kalibrierungsdatei nennt die Worktree-Stufe explizit; `/close` enthält den Stale-Worktree-Check.

### W9 — MCP

- **Gebot:** MCP NUR anschließen, wo keine CLI und kein versioniertes Skript dasselbe leisten. Merkregel: **„gh schlägt MCP"** — GitHub-Operationen laufen überall über die `gh`-CLI, nicht über einen GitHub-MCP-Server (offizielle Heuristik „connect a server when you find yourself copying data into chat").
- **Gebot:** Tool Search angelassen (Default: deferred loading); `alwaysLoad` nur mit Begründung. Warum: Tool-Definitionen vieler Server können Hunderttausende Tokens kosten; Progressive Disclosure reduzierte ein offizielles Beispiel um 98,7 %.
- **Gebot:** Scoping nach Kontextpreis: projektspezifische Server committed in `.mcp.json` des Projekts; rollenspezifische Server per `mcpServers:`-Frontmatter NUR im Subagent, der sie braucht — der Elephant-Kontext bleibt frei.
- **Beispiel:** <PROJECT_C>s `mcp-unreal` bleibt — die Editor-API hat keine CLI, genau der legitime MCP-Fall. Deterministische Tool-Brücken wie <PROJECT_B>s `<project-b>-*.ps1`-Skripte sind der bevorzugte Nicht-MCP-Weg.
- **OFFEN (Phase 4):** MCP-Bestand jedes Projekts gegen diese Kriterien prüfen; ob <PROJECT_B> einen MCP-Server für die home-automation platform rechtfertigt, entscheidet der CLI-Vergleich dort.
- **Prüfweise:** Jeder committete MCP-Server trägt einen Begründungs-Kommentar „warum keine CLI"; der Tooling-Radar (§4) prüft Bestandsserver bei MCP-relevanten Releases erneut.

---

## 3. Anti-Patterns (Verbote)

Alle vier sind im Bestand nachgewiesen — sie sind der Grund, warum diese Policy existiert.

### AP-T1 — Arbeitsweise per Copy-Paste vererben

- **Verbot:** Kein `.claude/`-Artefakt der Pipeline (Hooks, Skills, Agents, Settings-Blöcke) wird manuell zwischen Repos kopiert.
- **Beleg:** `guard-git` existiert dreifach divergiert, keine Kopie ist Superset — jede Lücke einer Kopie ist ein ungeschütztes Projekt.
- **Struktureller Weg:** Verteilung ausschließlich über Plugin/Marketplace mit committeter Bindung je Projekt; Updates = git push im Pipeline-Repo.
- **Prüfweise:** Pipeline-Artefakte existieren genau einmal (im Plugin); Projekt-Repos enthalten nur Bindung + Kalibrierung. Staleness-Check beim Bootstrap (→ `harness/session-bootstrap.md`).

### AP-T2 — Regeln nur in Prosa

- **Verbot:** Harte Regeln ohne durchsetzendes Artefakt (= Verstoß gegen G1).
- **Beleg:** <PROJECT_B>s CLAUDE.md wucherte auf 578 Zeilen und verletzte die eigene Schlank-Regel — Prosa diszipliniert nicht einmal ihren eigenen Autor; CLAUDE.md ist offiziell advisory.
- **Struktureller Weg:** G1-Zuordnung dieser Matrix; CLAUDE.md-Längen-Gate als deterministischer Check.
- **Prüfweise:** wie G1.

### AP-T3 — Marathon-Sessions mit Themenmix

- **Verbot:** Mehrere Themen in einer Session/einem Kontext abarbeiten, statt zu schneiden und zu delegieren.
- **Beleg:** In <PROJECT_B> mischte eine Session evcc-Bringup + Dashboard + Sidebar + Tarif-Analyse + §14a (~30 Commits) — Revert-Granularität verloren, Kontext vergiftet.
- **Struktureller Weg (Tooling-Antwort):** Ein Goldfish = EIN Auftrag im Subagent (W2); Themenwechsel im Elephant = `/clear` + `/rename` statt Weiterwursteln; Session-Hygiene-Regeln im Detail → `docs/operating-model.md`.
- **Prüfweise:** Blöcke sind einzeln revertierbar (ein Merge/PR je Auftrag); der Critic flaggt Diffs mit erkennbarem Themenmix.

### AP-T4 — Unversionierte Memory-Abhängigkeiten

- **Verbot:** Kein Ritual, Skill oder Briefing darf Pflicht-Artefakte außerhalb des Repos voraussetzen (User-Scope-Memory, maschinenspezifische Pfade).
- **Beleg:** <PROJECT_A> verlangt Pflichtlektüre zweier Memory-Dateien, die nicht existieren; <PROJECT_B>s Memory-Pfad fehlt auf frischem Klon; <PROJECT_C>s Memory ist an den lokalen Repo-Pfad gekoppelt — der Workflow bricht auf jeder zweiten Maschine. Für the PO's Zwei-Rechner-Betrieb unmittelbar praxisrelevant.
- **Struktureller Weg:** EINE versionierte Handover-Datei je Projekt, Memory ist nur Spiegel; Goldfish ohne `memory`-Feld; zentrale Artefakte pfadunabhängig.
- **Prüfweise:** Existenz-Check aller referenzierten Pflicht-Artefakte im Start-Ritual (fehlt → benennen, nicht überspringen); Frischer-Klon-Test als Bootstrap-Kriterium (→ `harness/session-bootstrap.md`).

---

## 4. Tooling-Radar

Claude Code entwickelt sich schneller als jede Policy: Features wie Dynamic Workflows, Tool Search oder das `if`-Feld sind alle jünger als ein Jahr. Ohne institutionalisierten Radar veralten ADR-Grundlagen unbemerkt — und ungeankerte „regelmäßig prüfen"-Vorsätze werden zu permanenten TODOs. Deshalb:

### R1 — Ablageort

Eigene Backlog-Kategorie **`tooling-radar`** in `backlog/` des Pipeline-Repos. Die Backlog-Struktur entsteht in Phase 3; diese Policy definiert Kategorie und Kontrakt vorab.

### R2 — Intervall und Anker

- **Gebot:** Prüfintervall **monatlich**. Fester Anker: der **erste `/close` eines Kalendermonats im Pipeline-Repo** MUSS den Radar-Lauf enthalten; zusätzlich ist jederzeit ein expliziter **`/radar`-Lauf** möglich.
- **Nachhol-Regel:** Der `/close` vergleicht das Datum des letzten protokollierten Radar-Laufs mit dem aktuellen Monat; liegt der letzte Lauf länger als einen Kalendermonat zurück, wird nachgeholt — der Anker kann also nicht still verfallen. **Anker implementiert:** Prüfschritt „Tooling-Radar fällig?" im close-block-Skill, Schritt 7 (`plugins/pipeline-core/skills/close-block/SKILL.md`) + Checklisten-Punkt in `harness/checklists/session-close.md`.
- **Warum dieser Anker:** `/close` ist das einzige deterministisch wiederkehrende Ritual im Pipeline-Repo; ein Kalender-Reminder wäre eine unversionierte Abhängigkeit (AP-T4).

### R3 — Prüfquellen (feste Liste)

1. **Claude-Code-Changelog / Release Notes** (offizielles claude-code-Repo) — neue Features, Breaking Changes, min-version-Marker.
2. **Anthropic News + Engineering-Blog** — neue Produkte/Muster (z. B. war Dynamic Workflows dort zuerst).
3. **Modell-/Preisübersicht der offiziellen Docs** — neue Modelle, Preisänderungen, auslaufende Einführungspreise.

Erweiterung der Liste nur per Backlog-Item, nicht ad hoc.

### R4 — Output-Kontrakt

- **Gebot:** Je relevantem Feature genau EIN Backlog-Item mit drei Pflichtfeldern:
  1. **Was ist neu** — 1–3 Sätze + Quelle + Versionsnummer/Datum.
  2. **Betrifft welche Pipeline-Regel/ADR** — konkrete Referenz (Policy-Abschnitt, ADR-Nummer, Hook/Skill) oder explizit „keine".
  3. **Empfehlung** — genau eines von `prüfen` / `adoptieren` / `ignorieren`, mit Ein-Satz-Begründung.
- **Gebot:** Ergebnislose Läufe erzeugen ein Null-Item („Radar-Lauf YYYY-MM: keine relevanten Änderungen") — sonst ist Nicht-Gelaufen von Nichts-Gefunden nicht unterscheidbar.

### R5 — Sonderregel: ADR-Wiedervorlage

- **Gebot:** Features, die die **Grundlage einer bestehenden ADR ändern** — z. B. Permission-Semantik, Subagent-Frontmatter-Felder, Hook-Events, Plugin-/Marketplace-Mechanik, Modellpreise/-verfügbarkeit — triggern eine **ADR-Wiedervorlage**: Das Backlog-Item wird entsprechend markiert, die betroffene ADR erhält den Status „Wiedervorlage", und der Entscheid (bestätigen/revidieren) fällt durch Elephant + the PO-Gate — nie still im Radar-Lauf selbst.
- **Typischer Auslöser:** eine **Preis-Review**, sobald der Einführungspreis eines konfigurierten Modells ausläuft (Instrument und Daten → `policies/model-policy.md`). Ein solches Item wird mit Fälligkeitsdatum in der Kategorie `tooling-radar` angelegt, sobald `backlog/` existiert (Phase 3).

### Prüfweise (gesamter Radar)

`backlog/`-Kategorie `tooling-radar` enthält je Kalendermonat mindestens ein Item (ggf. Null-Item) — maschinell prüfbar; der Konsistenz-Pass bzw. Critic kann Lücken mechanisch finden. Wiedervorlage-Items referenzieren eine existierende ADR-Nummer.

**OFFEN (Phase 4):** Implementierung des `/radar`-Skills und das formale Dateischema der Backlog-Items (Frontmatter-Felder). Die `/close`-Integration der Nachhol-Regel ist geliefert: Prüfschritt „Tooling-Radar fällig?" in `plugins/pipeline-core/skills/close-block/SKILL.md` Schritt 7 + `harness/checklists/session-close.md`.

---

## Änderungsverlauf

| Datum | Änderung |
|---|---|
| 2026-07-03 | Erstfassung (Sprint 0 Phase 2). |
