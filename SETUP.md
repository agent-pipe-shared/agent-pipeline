# Setup

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

How to adopt this repo as the Agent-Pipeline for your own projects: clone it,
personalize it, bind the plugin, start a session.

## Prerequisites

- **Node.js >= 24** — `setup.mjs` is dependency-free (Node builtins only, no `npm install` step).
- **git**
- **Claude Code**
- Optional: **`gh`** or **`glab`**. Marketplace coordinates, credentials, account state and absolute paths are machine-local; do not put them in Public Core.

## Steps

### 1. Clone your own copy

Fork, mirror, or otherwise create your own copy of this repo under your own GitHub org/user or GitLab group. That copy becomes the one canonical source your projects bind to as a plugin.

### 2. Run `node setup.mjs`

From the repo root:

```
node setup.mjs
```

Interactive mode asks public setup intent, runtime, language, subscription tier and autonomy. Personal coordinates are not collected:

| Question | Values | Feeds |
|---|---|---|
| Runtime | `claude-code` (full hook/gate enforcement) or `other` (methodology only) | `agent_runtime` |
| Setup intent | `consumer` or `maintainer` | `setup.intent` |
| Language | human-facing (commits, reviews, new docs) and agent-facing (roles, guardrails, skills), each `de`/`en` | `language` |
| Subscription tier | `pro`, `max`, or `api`/own — picks a model preset per work method and dispatch tier | `worktypes`, `models` |
| Autonomy preset | `conservative` (gated push, feature branches) or `autonomous` (standing-approved push, direct-to-main, advisor on) | `autonomy` |

`max` is the recommended default preset: an Opus orchestrator (routed per work method — see below) plus a Sonnet three-tier dispatch palette (implement / mechanic / deep) and Sonnet review. `api`/own starts from the same Max preset — edit the model names directly in `pipeline.user.yaml` afterwards and re-run setup.

**Route models per work method?** → `pipeline.user.yaml` → `worktypes`. That block is THE single place to set which model/effort/advisor runs for each of the three session profiles (design-first, advisor, speed) — see the comments in the file itself.

Before any write, create the ignored Private Overlay `.pipeline/private-overlay.yaml` with only the immutable Public-Core reference:

```
shared:
  sha: <exact-40-hex-checked-out-sha>
```

The lock must exactly match `git rev-parse HEAD`; missing, abbreviated or mismatched locks fail before source or runtime mutation. Keep marketplace/account/path mapping separately in ignored `.pipeline/machine-local.yaml`; setup never reads or projects it. Setup then writes `pipeline.user.yaml` and compiles the runtime configs.

**Non-interactive path:** `node setup.mjs --defaults` writes the conservative defaults with no prompts — useful for a first dry run or a CI check.

**Changed your mind later?** Edit `pipeline.user.yaml` by hand and run `node setup.mjs` again — it's drift-safe: cleanly-recompilable files are overwritten freely, but a compiled file you hand-edited yourself (without touching `pipeline.user.yaml`) triggers a confirmation before being overwritten (non-interactive mode never overwrites it at all).

### 3. Bind the plugin

The Public-Core `.claude/settings.json` enables the plugin but deliberately contains no marketplace coordinates. Use your ignored machine-local mapping to supply the appropriate local command:

```
# GitHub
claude plugin marketplace add <owner>/<repo> --scope project

# GitLab (gitlab.com or self-hosted)
claude plugin marketplace add https://<host>/<owner>/<repo>.git --scope project

# either host, once the marketplace is added
claude plugin install pipeline-core@agent-pipeline --scope project
```

`--scope project` matters: these subcommands default to `--scope user`, but the binding belongs at project scope. Verify with `claude plugin list --json` — it should show `pipeline-core@agent-pipeline` installed and enabled.

**Keeping the plugin current.** Project scope is the only canonical install *and* update scope — an extra user-scope install is never a shortcut, just a second, staler copy with its own update path. Refresh with this three-step ritual, always in this order:

```
claude plugin marketplace update agent-pipeline
claude plugin update pipeline-core@agent-pipeline --scope project
/reload-plugins
```

`/reload-plugins` is the step that actually reloads an already-running session — the two update commands alone don't.

**Native auto-update toggle (`/plugin → Marketplaces`) — optional, per machine, not committable.** It's a convenience switch, not a replacement for the ritual above, with one caveat: background updates need `GITHUB_TOKEN`/`GH_TOKEN` in the environment for a **private** marketplace repo, or they fail silently at startup — no error, just a stale state left behind. Against the **public** upstream marketplace repo the toggle needs no token. If you bind the pipeline to your own **private** fork or repo instead, the token caveat applies there. `/reload-plugins` stays a manual step either way.

### 4. Start a session

Open a Claude Code session in the repo. A `SessionStart` hook surfaces a reminder — *run `/pipeline-core:pipeline-start` before any work* — but the reminder itself checks nothing. Running `/pipeline-core:pipeline-start` performs the actual bootstrap: it confirms ruleset state, project calibration, and the handover file before work begins.

Before your first big feature, a quick look at [`docs/design/README.md`](docs/design/README.md) pays off — a self-service guide for brainstorming a solid requirement before it enters the pipeline (optional, advisory).

## What setup wrote

| File | Compiled from (`pipeline.user.yaml`) | Read by |
|---|---|---|
| `.claude/settings.json` | `autonomy` only where applicable | Claude Code itself — plugin enablement, permissions, status line; no marketplace coordinates |
| `.claude/pipeline.json` | `autonomy`, `gates` | project calibration — the bootstrap check and the `pipeline-start`/`close-block` skills |
| `.claude/pipeline.yaml` | `worktypes`, `models`, `gates`, `autonomy` | the declarative manifest layer — the PreToolUse guard hooks (`guard-devplan`, `guard-push`), the `stop-suggest` Stop-event hook (next-phase suggestion + context-budget warnings), and model routing; validated by `harness/scripts/validate-manifest.mjs` |

Every compiled file carries a `GENERATED from pipeline.user.yaml` marker so re-runs can tell a stale compile from a real hand-edit.
Before setup writes any of these files, the complete generated manifest passes the same
parse, schema, and semantic validation used by the runtime validator. A failed preflight
leaves both `pipeline.user.yaml` and all runtime projections unchanged.

## Troubleshooting

**"Setup not complete" reminder at session start.** If you open a session before finishing setup, you'll see something like:

```
Setup not complete — run `node setup.mjs` (see SETUP.md).
```

This fires in exactly two cases: `pipeline.user.yaml` doesn't exist yet (a fresh clone), or it still carries `setup.intent: unconfigured`. The check never blocks; the immutable Private-Overlay SHA preflight is the fail-closed setup gate.

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

---

# Setup (Deutsch)

So übernimmst du dieses Repo als Agent-Pipeline für deine eigenen Projekte:
klonen, personalisieren, Plugin binden, Session starten.

## Voraussetzungen

- **Node.js >= 24** — `setup.mjs` ist abhängigkeitsfrei (nur Node-Bordmittel,
  kein `npm install`-Schritt).
- **git**
- **Claude Code**
- Optional: **`gh`** (GitHub-CLI) oder **`glab`** (GitLab-CLI).
  Marketplace-Koordinaten, Zugangsdaten, Account-Status und absolute Pfade
  bleiben maschinenlokal; sie gehören nicht in den Public Core.

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

Der interaktive Modus fragt nach öffentlicher Setup-Absicht, Runtime, Sprache,
Abo-Stufe und Autonomie. Persönliche Koordinaten werden nicht erhoben:

| Frage | Werte | Fließt in |
|---|---|---|
| Runtime | `claude-code` (volles Hook-/Gate-Enforcement) oder `other` (nur Methodik) | `agent_runtime` |
| Setup-Absicht | `consumer` oder `maintainer` | `setup.intent` |
| Sprache | human-facing (Commits, Reviews, neue Docs) und agent-facing (Rollen, Guardrails, Skills), je `de`/`en` | `language` |
| Abo-Stufe | `pro`, `max` oder `api`/eigene — legt ein Modell-Preset je Arbeitsmethode und Dispatch-Stufe fest | `worktypes`, `models` |
| Autonomie-Preset | `konservativ` (gated Push, Feature-Branches) oder `autonom` (standing-approved Push, direkt auf main, Advisor an) | `autonomy` |

`max` ist das empfohlene Default-Preset: ein Opus-Orchestrator (geroutet je
Arbeitsmethode — siehe unten) plus eine Sonnet-Dreistufer-Dispatch-Palette
(Implementierung / Mechanik / Deep) sowie Sonnet-Review. `api`/eigene startet
vom selben Max-Preset — trage die Modellnamen danach direkt in
`pipeline.user.yaml` ein und führe Setup erneut aus.

**Modelle je Arbeitsmethode routen?** → `pipeline.user.yaml` → `worktypes`.
Dieser Block ist DIE eine Stelle, an der du Modell/Effort/Advisor für jedes
der drei Session-Profile (Design-first, Advisor, Speed) festlegst — siehe die
Kommentare direkt in der Datei.

Vor jedem Write legst du das ignorierte Private Overlay
`.pipeline/private-overlay.yaml` an. Es enthält nur die unveränderliche
Public-Core-Referenz:

```
shared:
  sha: <exakter-geprüfter-40-hex-SHA>
```

Der Lock muss exakt `git rev-parse HEAD` entsprechen; fehlende, abgekürzte oder
abweichende Locks schlagen vor Source- oder Runtime-Mutationen fehl. Marketplace-,
Account- und Pfad-Mapping bleibt separat in der ignorierten
`.pipeline/machine-local.yaml`; Setup liest oder projiziert sie nicht. Danach
schreibt Setup `pipeline.user.yaml` und kompiliert die Laufzeit-Configs.

**Nicht-interaktiver Weg:** `node setup.mjs --defaults` schreibt die
konservativen Defaults ohne Rückfragen — nützlich für einen ersten Trockenlauf
oder eine CI-Prüfung.

**Später umentschieden?** `pipeline.user.yaml` von Hand bearbeiten und
`node setup.mjs` erneut ausführen — es ist driftsicher: sauber neu kompilierbare
Dateien werden frei überschrieben, aber eine von Hand bearbeitete kompilierte
Datei (ohne Änderung an `pipeline.user.yaml`) löst vor dem Überschreiben eine
Rückfrage aus (der nicht-interaktive Modus überschreibt sie nie).

### 3. Plugin binden

Die Public-Core-`.claude/settings.json` aktiviert das Plugin, enthält aber
absichtlich keine Marketplace-Koordinaten. Nutze dein ignoriertes
maschinenlokales Mapping für den passenden lokalen Befehl:

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

**Plugin aktuell halten.** Project-Scope ist der einzige kanonische Install-
*und* Update-Scope — ein zusätzlicher User-Scope-Install ist nie eine
Abkürzung, sondern nur eine zweite, veraltende Kopie mit eigenem Update-Pfad.
Refresh über dieses Drei-Schritte-Ritual, immer in dieser Reihenfolge:

```
claude plugin marketplace update agent-pipeline
claude plugin update pipeline-core@agent-pipeline --scope project
/reload-plugins
```

`/reload-plugins` ist der Schritt, der eine bereits laufende Session
tatsächlich neu lädt — die beiden Update-Kommandos allein tun das nicht.

**Nativer Auto-Update-Toggle (`/plugin → Marketplaces`) — optional, pro
Maschine, nicht committbar.** Er ist ein Komfort-Schalter, kein Ersatz für
das Ritual oben, mit einem Vorbehalt: Hintergrund-Updates brauchen
`GITHUB_TOKEN`/`GH_TOKEN` in der Umgebung für ein **privates**
Marketplace-Repo, sonst scheitern sie still beim Start — kein Fehlerhinweis,
einfach ein veralteter Stand. Gegen das **öffentliche** Upstream-Marketplace-Repo
braucht der Toggle keinen Token. Bindest du die Pipeline stattdessen an deinen
eigenen **privaten** Fork bzw. ein privates Repo, greift der Token-Vorbehalt
dort. `/reload-plugins` bleibt so oder so ein manueller Schritt.

### 4. Session starten

Eine Claude-Code-Session im Repo öffnen. Beim Sitzungsstart blendet ein
`SessionStart`-Hook eine Erinnerung ein — *`/pipeline-core:pipeline-start` vor jeder
Arbeit ausführen* —, die Erinnerung selbst prüft aber nichts. Erst wenn du
`/pipeline-core:pipeline-start` ausführst, läuft der eigentliche Bootstrap: Der Skill
bestätigt Regelwerk-Stand, Projekt-Kalibrierung und Handover-Datei, bevor die Arbeit
beginnt.

Vor dem ersten großen Feature lohnt ein kurzer Blick in
[`docs/design/README.md`](docs/design/README.md) — der Selbstbedienungs-Guide
zum Brainstorming einer soliden Anforderung, bevor sie in die Pipeline geht
(optional, empfohlen).

## Was Setup geschrieben hat

| Datei | Kompiliert aus (`pipeline.user.yaml`) | Gelesen von |
|---|---|---|
| `.claude/settings.json` | gegebenenfalls nur `autonomy` | Claude Code selbst — Plugin-Aktivierung, Permissions, Status-Zeile; keine Marketplace-Koordinaten |
| `.claude/pipeline.json` | `autonomy`, `gates` | Projekt-Kalibrierung — der Bootstrap-Check sowie die Skills `pipeline-start`/`close-block` |
| `.claude/pipeline.yaml` | `worktypes`, `models`, `gates`, `autonomy` | die deklarative Manifest-Schicht — die PreToolUse-Guard-Hooks (`guard-devplan`, `guard-push`), der `stop-suggest`-Stop-Hook (Vorschlag der nächsten Phase + Kontext-Budget-Warnungen) sowie Modell-Routing; validiert über `harness/scripts/validate-manifest.mjs` |

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
(frischer Klon), oder sie trägt noch `setup.intent: unconfigured`. Der Check
blockiert die Session nie; der unveränderliche Private-Overlay-SHA-Preflight ist
das fail-closed Setup-Gate.

---

Die deutsche Fassung ist eine Übersetzung des englischen Originals.
