# Setup

How to adopt this repo as the Agent-Pipeline for your own projects: clone it,
personalize it, bind the plugin, start a session.

## Prerequisites

- **Node.js >= 24** — `setup.mjs` is dependency-free (Node builtins only, no `npm
  install` step).
- **git**
- **Claude Code**
- Optional: **`gh`** (GitHub CLI) or **`glab`** (GitLab CLI). Setup detects your
  git host from `git remote -v`, falling back to whichever of the two is on your
  `PATH` if there's no remote yet; the detected choice is recorded in
  `pipeline.user.yaml` (`platform.cli`) for your own PR/MR workflows later.

## Steps

### 1. Clone your own copy

Fork, mirror, or otherwise create your own copy of this repo under your own
GitHub org/user or GitLab group. That copy becomes the one canonical source your
projects bind to as a plugin.

### 2. Run `node setup.mjs`

From the repo root:

```
node setup.mjs
```

Interactive mode asks five questions — everything else (your OS, your git host)
is *detected*, never asked:

| Question | Values | Feeds |
|---|---|---|
| Runtime | `claude-code` (full hook/gate enforcement) or `other` (methodology only) | `agent_runtime` |
| Identity | your name, your repo's owner (org/user or GitLab group), your repo's name | `identity` |
| Language | human-facing (commits, reviews, new docs) and agent-facing (roles, guardrails, skills), each `de`/`en` | `language` |
| Subscription tier | `pro`, `max`, or `api`/own — picks a model preset per role | `models` |
| Autonomy preset | `conservative` (gated push, feature branches) or `autonomous` (standing-approved push, direct-to-main, advisor on) | `autonomy` |

`max` is the recommended default preset: an Opus design/orchestrator tier plus a
Sonnet three-tier (implement / mechanic / review) for everything else. `api`/own
starts you from the same Max preset — edit the model names directly in
`pipeline.user.yaml` afterwards and re-run setup.

Setup writes `pipeline.user.yaml`, then immediately compiles it into the three
runtime configs (see "What setup wrote" below).

**Non-interactive path:** `node setup.mjs --defaults` writes the conservative
defaults with no prompts — useful for a first dry run or a CI check.

**Changed your mind later?** Edit `pipeline.user.yaml` by hand and run
`node setup.mjs` again — it's drift-safe: files it can recompile cleanly are
overwritten freely, but a compiled file you hand-edited yourself (without
touching `pipeline.user.yaml`) triggers a confirmation before it's overwritten
(non-interactive mode never overwrites it at all).

### 3. Bind the plugin

The compiled `.claude/settings.json` already declares the marketplace and the
plugin, so opening/trusting the repo folder in Claude Code should prompt you to
install it automatically. For a deterministic, scriptable path — or if that
prompt doesn't appear — run:

```
# GitHub
claude plugin marketplace add <owner>/<repo> --scope project

# GitLab (gitlab.com or self-hosted)
claude plugin marketplace add https://<host>/<owner>/<repo>.git --scope project

# either host, once the marketplace is added
claude plugin install pipeline-core@agent-pipeline --scope project
```

`--scope project` matters: these subcommands default to `--scope user`, but the
binding belongs at project scope. Verify with `claude plugin list --json` — it
should show `pipeline-core@agent-pipeline` installed and enabled.

### 4. Start a session

Open a Claude Code session in the repo. A `SessionStart` hook surfaces a reminder —
*run `/pipeline-core:pipeline-start` before any work* — but the reminder itself checks
nothing. You then run `/pipeline-core:pipeline-start`, and that skill performs the
bootstrap: it confirms the ruleset state, your project calibration, and the handover
file before work begins.

## What setup wrote

| File | Compiled from (`pipeline.user.yaml`) | Read by |
|---|---|---|
| `.claude/settings.json` | `identity`, `platform` | Claude Code itself — plugin/marketplace binding, permissions, status line |
| `.claude/pipeline.json` | `autonomy`, `gates` | project calibration — the bootstrap check and the `pipeline-start`/`close-block` skills |
| `.claude/pipeline.yaml` | `models`, `gates`, `autonomy` | the declarative manifest layer — the PreToolUse guard hooks (`guard-devplan`, `guard-push`), the `stop-suggest` Stop-event hook (next-phase suggestion + context-budget warnings), and model routing; validated by `harness/scripts/validate-manifest.mjs` |

Every compiled file carries a `GENERATED from pipeline.user.yaml` marker so
re-runs can tell a stale compile from a real hand-edit.

## Troubleshooting

**"Setup nicht abgeschlossen" reminder at session start.** If you open a session
before finishing setup, you'll see something like:

```
Setup nicht abgeschlossen — `node setup.mjs` ausführen (siehe SETUP.md).
```

This fires in exactly two cases: `pipeline.user.yaml` doesn't exist yet (a fresh
clone), or it exists but still carries a committed default marker
(`identity.owner_name: "Your Name"` or `identity.repo_owner: "your-org"`). Note
this specific reminder is currently emitted in German regardless of your chosen
`language` setting — the fix is the same either way: run `node setup.mjs` and
answer at least the identity question. The check never blocks your session; it's
a reminder, not a gate.

---

# Setup (Deutsch)

So übernimmst du dieses Repo als Agent-Pipeline für deine eigenen Projekte:
klonen, personalisieren, Plugin binden, Session starten.

## Voraussetzungen

- **Node.js >= 24** — `setup.mjs` ist abhängigkeitsfrei (nur Node-Bordmittel,
  kein `npm install`-Schritt).
- **git**
- **Claude Code**
- Optional: **`gh`** (GitHub-CLI) oder **`glab`** (GitLab-CLI). Setup erkennt
  deinen Git-Host aus `git remote -v` und greift, falls noch kein Remote
  existiert, auf die CLI zurück, die auf deinem `PATH` liegt; die erkannte
  Wahl landet in `pipeline.user.yaml` (`platform.cli`) für deine eigenen
  PR-/MR-Abläufe später.

## Schritte

### 1. Eigene Kopie klonen

Fork, Mirror oder auf andere Weise eine eigene Kopie dieses Repos unter deiner
eigenen GitHub-Org/deinem User bzw. deiner GitLab-Gruppe anlegen. Diese Kopie
wird zur einzigen kanonischen Quelle, an die sich deine Projekte als Plugin
binden.

### 2. `node setup.mjs` ausführen

Im Repo-Root:

```
node setup.mjs
```

Der interaktive Modus stellt fünf Fragen — alles andere (Betriebssystem,
Git-Host) wird *erkannt*, nie gefragt:

| Frage | Werte | Fließt in |
|---|---|---|
| Runtime | `claude-code` (volles Hook-/Gate-Enforcement) oder `other` (nur Methodik) | `agent_runtime` |
| Identität | dein Name, Owner deines Repos (Org/User bzw. GitLab-Gruppe), Repo-Name | `identity` |
| Sprache | human-facing (Commits, Reviews, neue Docs) und agent-facing (Rollen, Guardrails, Skills), je `de`/`en` | `language` |
| Abo-Stufe | `pro`, `max` oder `api`/eigene — legt ein Modell-Preset je Rolle fest | `models` |
| Autonomie-Preset | `konservativ` (gated Push, Feature-Branches) oder `autonom` (standing-approved Push, direkt auf main, Advisor an) | `autonomy` |

`max` ist das empfohlene Default-Preset: eine Opus-Design-/Orchestrator-Stufe
plus ein Sonnet-Dreistufer (Implementierung / Mechanik / Review) für alles
andere. `api`/eigene startet vom selben Max-Preset — trage die Modellnamen
danach direkt in `pipeline.user.yaml` ein und führe Setup erneut aus.

Setup schreibt `pipeline.user.yaml` und kompiliert daraus sofort die drei
Laufzeit-Configs (siehe „Was Setup geschrieben hat" unten).

**Nicht-interaktiver Weg:** `node setup.mjs --defaults` schreibt die
konservativen Defaults ohne Rückfragen — nützlich für einen ersten Trockenlauf
oder eine CI-Prüfung.

**Später umentschieden?** `pipeline.user.yaml` von Hand bearbeiten und
`node setup.mjs` erneut ausführen — es ist driftsicher: sauber neu kompilierbare
Dateien werden frei überschrieben, aber eine von Hand bearbeitete kompilierte
Datei (ohne Änderung an `pipeline.user.yaml`) löst vor dem Überschreiben eine
Rückfrage aus (der nicht-interaktive Modus überschreibt sie nie).

### 3. Plugin binden

Die kompilierte `.claude/settings.json` deklariert Marketplace und Plugin
bereits, sodass das Öffnen des Repo-Ordners und seine Bestätigung als
vertrauenswürdig in Claude Code automatisch zur Installation auffordern sollte. Für einen deterministischen, skriptbaren Weg
— oder falls diese Aufforderung ausbleibt:

```
# GitHub
claude plugin marketplace add <owner>/<repo> --scope project

# GitLab (gitlab.com oder self-hosted)
claude plugin marketplace add https://<host>/<owner>/<repo>.git --scope project

# für beide Hosts, sobald der Marketplace hinzugefügt ist
claude plugin install pipeline-core@agent-pipeline --scope project
```

`--scope project` ist wichtig: diese Subkommandos verwenden standardmäßig
`--scope user`, die Bindung gehört aber in den Projekt-Scope. Prüfen mit
`claude plugin list --json` — es sollte `pipeline-core@agent-pipeline` als
installiert und aktiviert zeigen.

### 4. Session starten

Eine Claude-Code-Session im Repo öffnen. Beim Sitzungsstart blendet ein
`SessionStart`-Hook eine Erinnerung ein — *`/pipeline-core:pipeline-start` vor jeder
Arbeit ausführen* —, die Erinnerung selbst prüft aber nichts. Erst wenn du
`/pipeline-core:pipeline-start` ausführst, läuft der eigentliche Bootstrap: Der Skill
bestätigt Regelwerk-Stand, Projekt-Kalibrierung und Handover-Datei, bevor die Arbeit
beginnt.

## Was Setup geschrieben hat

| Datei | Kompiliert aus (`pipeline.user.yaml`) | Gelesen von |
|---|---|---|
| `.claude/settings.json` | `identity`, `platform` | Claude Code selbst — Plugin-/Marketplace-Bindung, Permissions, Status-Zeile |
| `.claude/pipeline.json` | `autonomy`, `gates` | Projekt-Kalibrierung — der Bootstrap-Check sowie die Skills `pipeline-start`/`close-block` |
| `.claude/pipeline.yaml` | `models`, `gates`, `autonomy` | die deklarative Manifest-Schicht — die PreToolUse-Guard-Hooks (`guard-devplan`, `guard-push`), der `stop-suggest`-Stop-Hook (Vorschlag der nächsten Phase + Kontext-Budget-Warnungen) sowie Modell-Routing; validiert über `harness/scripts/validate-manifest.mjs` |

Jede kompilierte Datei trägt einen `GENERATED from pipeline.user.yaml`-Marker,
damit ein erneuter Lauf einen veralteten Kompilat-Stand von einem echten
Hand-Edit unterscheiden kann.

## Fehlerbehebung

**Hinweis „Setup nicht abgeschlossen" beim Sitzungsstart.** Startest du eine
Session vor Abschluss des Setups, erscheint etwa:

```
Setup nicht abgeschlossen — `node setup.mjs` ausführen (siehe SETUP.md).
```

Das passiert in genau zwei Fällen: `pipeline.user.yaml` existiert noch nicht
(frischer Klon), oder sie existiert, trägt aber noch einen committeten
Default-Marker (`identity.owner_name: "Your Name"` oder
`identity.repo_owner: "your-org"`). Dieser konkrete Hinweis erscheint derzeit
unabhängig von deiner gewählten `language`-Einstellung auf Deutsch — die
Lösung ist in jedem Fall dieselbe: `node setup.mjs` ausführen und mindestens
die Identitätsfrage beantworten. Der Check blockiert die Session nie; er ist
ein Hinweis, kein Gate.

---

Die deutsche Fassung ist eine Übersetzung des englischen Originals.
