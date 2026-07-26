<!-- po-language: de -->

# PRD — Claude Code als vollwertiger Runner im V3/V4-Onboarding-Lifecycle

> Product Review Document (PO-Gate). Erstellt nach Lösungs-Recherche, vor
> Implementierung. Status: `entwurf` bis der PO `freigegeben` markiert; dieser
> Marker autorisiert genau einen ersten Implementierungs-Dispatch.
> Akzeptanzkriterien: siehe `spec.md` (agentenseitig). Task: `CLAUDE-RUNNER-01`
> · Rigor 2 / Klasse hoch (verändert bestehende Guard-/Onboarding-Kernlogik).

## What

Das 0.4.6-Onboarding-System (der Teil, der prüft "ist dieses Projekt startklar,
darf implementiert werden") geht an mehreren Stellen fest davon aus, dass der
Runner Codex ist — nicht nur als Standardwert, sondern als **harte
Ablehnung**: Ein Projekt, dessen Konfiguration explizit "Claude" statt "Codex"
sagt, wird an mindestens zwei unabhängigen Stellen mit einem Fehler blockiert,
der wörtlich vorschlägt, "Codex über die Quellautorität auszuwählen" — obwohl
Claude Code der tatsächlich genutzte Runner ist und dieser Vorschlag falsch
wäre. Zusätzlich verlangt das System an drei weiteren Stellen unbedingt einen
Nachweis, dass ein Codex-eigener Hintergrunddienst ("App-Server") läuft bzw.
neu gestartet wurde — ein Konzept, das es für Claude Code gar nicht gibt und
das ein reines Claude-Projekt technisch niemals erfüllen kann.
*(Technisch: `project-onboarding-v3.mjs`, `project-onboarding-ready-gate.mjs`,
`codex-onboarding-app-server.mjs`, `v3-bootstrap-authority.mjs`.)*

Diese Änderung macht Claude Code zu einem echten, gleichwertigen zweiten
Runner in genau diesem Lifecycle — nicht nur beim Modell-Routing, wo Claude
bereits vollwertig unterstützt ist, sondern auch beim Onboarding/Bootstrap
selbst.

## Why

Dieses Repository (`agent-pipeline-share`) wird ausschließlich mit Claude Code
gearbeitet — `pipeline.user.yaml` hat bereits `runners.default: "claude"`
gesetzt. Sobald das Onboarding-System diesen Zustand als "unvollständige
Migration" einstuft (ein Zustand, der real vorkommen kann, z. B. nach einem
Plugin-Update oder bei einem frisch geklonten Checkout), würde die harte
Codex-Ablehnung greifen — mit falscher Handlungsempfehlung und ohne
Recovery-Pfad. Das wurde beim 0.4.6-Rebase auf diesem Branch als reales,
nicht-hypothetisches Risiko entdeckt (Diagnose 2026-07-26), nicht als
theoretisches Szenario konstruiert.

Erfolg heißt: ein Claude-Code-Projekt durchläuft dieselben
Onboarding-Zustände (fertig, Migration nötig, Runtime-Reparatur nötig usw.)
wie ein Codex-Projekt, ohne an einer Codex-spezifischen Prüfung hängen zu
bleiben, die für Claude schlicht nicht zutrifft.

## Scope

- `plugins/pipeline-core/lib/project-onboarding-v3.mjs` — Runner-Default und
  die harte `selectedRunnerIsCodex`-Ablehnung.
- `plugins/pipeline-core/lib/project-onboarding-ready-gate.mjs` — zweite,
  unabhängige harte Codex-Prüfung, die selbst einen sonst "fertigen" Zustand
  ablehnt.
- `plugins/pipeline-core/lib/codex-onboarding-app-server.mjs` und
  `plugins/pipeline-core/scripts/v3-bootstrap-authority.mjs` — App-Server-/
  Restart-Nachweis so anpassen, dass er nur für Runner gilt, die dieses
  Konzept tatsächlich haben.
- `plugins/pipeline-core/lib/codex-onboarding-runtime.mjs` — Restart-/
  Readback-Mechanismus entsprechend runner-bedingt machen.
- `plugins/pipeline-core/lib/runner-profiles-v3.mjs`,
  `runner-profile-migration-v3.mjs` — falls die Lösung `agent_runtime` als
  echten Entscheidungsfaktor einführt (aktuell nur geschrieben, nie gelesen —
  siehe Spec §2 für die Design-Entscheidung).
- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` (+ ggf.
  `hooks/hooks.json`) — heute ausschließlich in Codex' eigener Hook-Kette
  verdrahtet; ob Claude eine gleichwertige Durchsetzung an dieser Stelle
  bekommt, ist eine offene Entscheidung (siehe Punkt 1 unten).
- Bestehende Claude-seitige Hooks/Guards (`guard-push.mjs` u. a.) bleiben
  inhaltlich unverändert — sie sind bereits runner-neutral, das war die
  richtige Einschätzung.
- Portabilität: die Lösung darf keine Windows-spezifische Abkürzung nehmen,
  obwohl der einzige aktive Nutzer aktuell auf Windows arbeitet — macOS/Linux
  müssen mitgedacht werden.

## Non-goals

- Kein Umbau des Modell-Routings (`routing-projection.mjs`) — das behandelt
  Claude bereits vollwertig, wird nicht angefasst.
- Keine Änderung an `guard-push.mjs`'s eigener Logik — nur ggf. neue
  Verdrahtung in `hooks.json`, falls Punkt 1 unten das erfordert.
- Kein gleichzeitiger Hotfix nach `main` — laut PO-Entscheidung wird das
  gemeinsam über den Cyborg-Branch ausgeliefert, ein Hotfix nach `main`
  erfolgt erst danach, separat.
- Keine Wiederaufnahme der pausierten Cyborg-Wave-3-Arbeit (CYB-2D
  semgrep/license-check), bis dieses Paket abgeschlossen ist.

## Risks & mitigation

1. **Zwei unabhängige Codex-Hard-Blocks statt einem.** Wird nur einer
   gefixt, bleibt das Projekt trotzdem blockiert. Mitigation: Spec listet
   beide Fundstellen explizit als Pflicht-Dateien (siehe Scope), Critic prüft
   gegen genau diese Liste.
2. **App-Server-Konzept hat kein Claude-Äquivalent.** Ein zu enger Fix
   (z. B. "Claude bekommt einen Fake-App-Server-Status") würde eine falsche
   Erfolgs-Behauptung erzeugen. Mitigation: Spec verlangt einen echten
   "not-required-for-this-runner"-Zustand, keine vorgetäuschte Erfüllung.
3. **`guard-lifecycle-ready.mjs`-Frage bleibt ungeklärt, wenn nicht explizit
   entschieden.** Ohne Entscheidung entsteht stillschweigend eine Lücke
   (Claude-Projekte hätten dann GAR KEINE Durchsetzung dieser Prüfung, wo
   Codex-Projekte eine haben). Mitigation: als expliziter
   Entscheidungspunkt unten aufgenommen, nicht dem Goldfish überlassen.
4. **Portabilität wird nachträglich vergessen**, weil aktuell nur Windows
   getestet wird. Mitigation: Spec-DoD verlangt, dass keine der Änderungen
   eine plattformspezifische Bedingung einbaut, die nicht bereits im
   bestehenden Code als Muster existiert (z. B. `process.platform`-Zweige
   nur dort, wo das bestehende Codex-Äquivalent das auch schon tut).

## Alternatives considered

- **Schneller Einzeil-Patch nur an `selectedRunnerIsCodex`.** Verworfen: löst
  nur einen der beiden Hard-Blocks; die App-Server-Pflicht würde ein
  Claude-Projekt weiterhin dauerhaft in `bootstrap`/`session`/`dispatch`
  blockieren. Kein echter Fix, nur Symptomverschiebung.
- **Separater Sofort-Hotfix nach `main`, vor Cyborg-Rebase-Fortsetzung.**
  Verworfen laut expliziter PO-Entscheidung 2026-07-26: alles gemeinsam über
  den Cyborg-Branch liefern, `main`-Hotfix erst danach.
- **`agent_runtime` ignorieren, nur `runners.default` als Entscheidungsfaktor
  nutzen.** Verworfen als alleinige Lösung: `agent_runtime` ist der
  schema-seitig vorgesehene Diskriminator (`"claude-code"` vs. `"other"`),
  wird aber aktuell nirgends gelesen — ihn zu ignorieren hieße, dauerhaft
  totes Feld neben der echten Prüflogik zu behalten. Spec entscheidet, ob
  er aktiviert wird.

## DoD (release criteria)

Siehe `spec.md` Abschnitt 6 (Definition of Done) für die vollständige,
technische Fassung. Aus PO-Sicht: ein Claude-Code-Projekt mit
`agent_runtime: "claude-code"` und `runners.default: "claude"` durchläuft den
V3/V4-Lifecycle bis zum `ready`-Zustand, ohne an einer Codex-spezifischen
Prüfung hängenzubleiben — nachgewiesen durch neue, gezielte Testfälle, nicht
nur durch Prosa-Behauptung.

## Decision points

1. **`guard-lifecycle-ready.mjs`-Verdrahtung für Claude:** Soll Claude Code
   eine gleichwertige Durchsetzung dieser Prüfung bekommen (neuer Eintrag in
   `hooks/hooks.json`, analog — nicht identisch — zu Codex' Wirkung über
   `codex-hooks.json`), oder reicht es, dass der Lifecycle selbst für Claude
   korrekt `ready` meldet, ohne dass ein Hook das aktiv erzwingt?
   **Empfehlung:** ja, gleichwertige Durchsetzung für den `Edit|Write`-Fall —
   sonst hätte Claude dauerhaft eine schwächere Durchsetzung als Codex an
   genau der Stelle, die "darf implementiert werden" entscheidet. **Bewusst
   NICHT Teil dieses Pakets:** Codex' Durchsetzung deckt zusätzlich auch
   Bash-Befehle ab; dieses Paket deckt nur Edit/Write ab, die
   Bash-Gleichstellung ist ein benannter Folgeschritt, kein stiller
   Teilumfang.
2. **`config/runtime-projection-v3-owned-keys.json`:** Sollen die
   `.codex/*`-Zieldateien conditional auf `runners.enabled` werden (ein
   reines Claude-Projekt bekäme dann keine leeren `.codex/*`-Dateien mehr),
   oder bleibt die Projektion unverändert unbedingt für alle sieben Ziele?
   **Empfehlung:** unverändert lassen für dieses Paket — das ist eine
   eigenständige, kleinere Optimierung ohne funktionalen Blocker-Charakter;
   nicht mit dem eigentlichen Fix vermischen, um den Scope klein zu halten.
