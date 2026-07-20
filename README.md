# Agent-Pipeline

A versioned operating model for agentic software development — clone it, run one
setup script, and adopt a battle-tested set of roles, review gates, and guardrails
for your own projects.

*Where this stands: an actively developed public core, shaped through public
feature branches and dogfooding rounds. Feedback welcome.*

> **A note on language.** This operating model was first built in German and then
> made English-first for release. The docs are English-primary — bilingual files
> keep a full German reference below a skip marker — but because of that origin,
> stray German may still surface here and there (a comment, an example, an internal
> label, or the odd directive). It's harmless, corrections/PRs are welcome, and you
> pick the language the pipeline works in for you (commits, reviews, PRDs) via the
> `language.human_facing` setting.

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

> **Newcomer path:** This README is the single entry point. For adoption, the only
> required next document is `SETUP.md`; deeper and conceptual documentation
> is optional reference.

## The problem

Teams building with coding agents tend to reinvent the same conventions per repo —
review rituals, git guardrails, handover files — copied by hand and drifting
project to project. There's no independent reviewer separate from whoever wrote
the code, and no shared discipline over which model does which kind of work at
what cost. This repo is that missing shared layer: one versioned source, adopted
by reference instead of copy-pasted.

## What you get

Four deliberately separated roles carry the model:

- **Product Owner (you)** — the human gate. Sets direction, reviews outcomes, holds
  final sign-off.
- **Elephant** — the long-lived orchestrator session. Turns your intent into a spec,
  breaks it into small tasks, dispatches them, and makes the go/no-go call.
- **Goldfish** — a fresh-context implementor subagent. Executes exactly one clearly
  defined task and reports back only with evidence, never a bare claim.
- **Critic** — an independent, read-only reviewer with a fresh context. Never sees
  chat history or reasoning — only the result, judged on its own.

Around those roles:

- **Two-stage review** — deterministic gates (tests, security scan, lint) run
  *before* any LLM judgment; only what survives the gates reaches a Critic.
- **Specs with checkable acceptance criteria** — every task has a Definition of
  Done something or someone can actually check, not a "done"-on-a-feeling.
- **Git guardrails** — a hook layer that blocks force-pushes, history rewrites,
  deleted protected branches, and skipped hooks, regardless of what any agent asks
  for.
- **A model/token policy** — role-tiered model routing (design / implement /
  mechanic / review / optional advisor) configured to your own subscription, so
  cost tracks task complexity instead of one model doing everything.
- **Evidence discipline** — "done" means a machine-written log or output, the exact
  command, and its exit code — never a model-formulated claim that something
  "should work."
- **Two human gates, not a stream of approvals** — plan sign-off up front and
  completion sign-off at the end are the only two required stops for you.
  Deliberately few and deliberately placed: your attention is the scarce
  resource, and a long queue of small approvals trains reflexive clicking, not
  actual review.

## How it works

### Three roots, one direction of dependency

**Public Core** is the portable, committed contract: methodology, plugin,
templates, and the public `pipeline.user.yaml` authority. Develop it on public
feature branches. A separately versioned, ignored **Private Extension** (also
called the Private Overlay) consumes one pinned, immutable Public-Core SHA; it
does not feed account, owner, repository, or path coordinates back into the
core. **Local user, PC, and runtime-data roots** hold credentials, marketplace
and account mappings, absolute paths, local settings, caches, and session data.
They stay ignored and are never compiled into a public projection. This keeps a
second device reproducible from the public snapshot plus its matching private
pin, without copying secrets or local history.

`pipeline.user.yaml` is the public source of setup intent. `node setup.mjs`
compiles its owned runtime projections; **never hand-edit generated runtime
configuration**. Change the source, then rerun setup or the explicit V3
migration below. The compiler detects drift rather than silently treating a
local edit as authority.

V3 has registered routes for both Claude and Codex. Claude Code is the
full-enforcement runtime: its plugin and hooks can enforce configured guards.
Codex and other CLIs can use the same roles, evidence, and review methodology,
but this does not claim Claude hooks, plugin installation, automatic guards, or
model identity. For Codex, every duty assigned to Fable resolves to
`gpt-5.6-sol` at the same effort tier; Claude assignments remain unchanged.
See [`docs/runtime-boundary.md`](docs/runtime-boundary.md) for the exact
division of responsibility.

The native Codex selected-sandbox route remains the preferred, attested route;
this README does **not** claim that its current host limitation is fixed. After
exactly one typed `no-child` or `unavailable` result, a PO-authorized exception
may run one fresh, internal, hard-read-only consult on the same single question.
It permits no handover, memory, mutation, network export, raw-answer retention,
auto-apply, second question, or retry. A successful exception is only a
functional-equivalent pass, never native sandbox success: `no attested
selected-sandbox execution; OS isolation and model identity are not asserted`.

Model routing lives in V3 profiles (`epic`, `feature`, `mini`), with model and
effort selected per phase and runner.

```mermaid
flowchart LR
    PO["Product Owner<br/>(you)"] -->|"intent / brief"| Elephant["Elephant<br/>(orchestrator)"]
    Elephant -->|"spec + dispatch"| Goldfish["Goldfish<br/>(fresh-context implementor)"]
    Goldfish -->|"evidence"| Gates["Deterministic gates<br/>(tests, security, lint)"]
    Gates -.->|"fail"| Goldfish
    Gates -->|"pass"| Critic["Critic<br/>(independent reviewer)"]
    Critic -->|"findings"| Elephant
    Elephant -->|"decision"| PO
```

## How a run flows end to end

```mermaid
flowchart TD
    ID["Idea"] --> P
    ID -.->|"optional, advisory"| DS["Design pre-stage<br/>(self-service,<br/>docs/design/)"]
    DS -.-> P
    P["Profile / model decision"] --> PL["Plan artifact +<br/>human plan gate"]
    PL --> R["Readiness check"]
    R --> D["Dispatch<br/>(fresh context, briefing)"]
    D --> G["Deterministic gates<br/>(verify, security scan)"]
    G --> C["Risk-class-dependent Critic"]
    C --> H["Human completion gate"]
    H --> M["Merge + doc sync"]
    M -.->|"optional, if manifest declares release"| REL["Release/Promotion<br/>(optional, §3.5)"]
```

Order matters: deterministic gates always run *before* any LLM judgment — a
Critic never reviews a diff that hasn't already cleared the machine chain.

An optional Release/Promotion tail can hook in after the merge (`REL` above) once
a project's manifest declares a `release` section — detail in
[`docs/deploy/README.md`](docs/deploy/README.md).

## The front door: optional design pre-stage

Before the pipeline itself there's deliberately no mandatory step, just a
front door (the dotted branch in the diagram above): idea → optional design
brainstorming with any chat AI (guide + standard prompt + lean export
template under [`docs/design/README.md`](docs/design/README.md)) →
requirements export → feeds the pipeline. If a requirement looks large at
triage (multiple modules/projects affected, new architecture, several
plausible options, a larger security/data surface), the Elephant flags it
**non-blocking** and links the guide — you can always skip the design
pre-stage and go straight to work. An external design export never gets a
free pass: the Elephant challenges it and re-derives it through the normal
path (interview → spec → readiness) instead of adopting it as an
already-approved design. For large topics, the Elephant also proposes a cut
into several self-contained backlog items and waits for confirmation or
correction — the existing per-item PRD review stays the only check point,
nothing new is added. Details: [`docs/operating-model.md`](docs/operating-model.md) §3.2.

## Bring your own architecture rules & guardrails

A project can bring its own house rules, split into two classes: **guidelines**
are recommended principles you may deliberately deviate from, as long as the
deviation is named; **policies** are binding rules that block a gate the moment
they're violated. Both live under
[`governance/examples/`](governance/examples/README.md), wired in through the
`governance` block in `.claude/pipeline.yaml`.

Enforcement differs by class: guidelines feed into every plan and are the
Critic's review benchmark — an unnamed deviation is the finding, not the
deviation itself. Machine-checkable policies automatically fail the
security-scan gate; the non-machine-checkable checklist gets ticked off by the
Critic before every push. A pattern played all the way through — from house
rule to enforced rule — lives in the
[worked example](governance/examples/worked-example.md).

## Three dials, not one size fits all

Same method, calibrated strictness — from a weekend hack to an enterprise
codebase. Three independent dials set that:

- **Rigor per task** — issue-only / delta-spec / spec-anchored
- **Governance mode per rule set** — advisory / enforcing / off
- **Session profile per session** — design / advisor / speed (model, effort,
  and advisor per profile: `pipeline.user.yaml` → `worktypes`)

## Why this holds up at enterprise scale

What comes together here is more than an agent setup: a repeatable architecture
through the governance layer, machine-checkable gates instead of promises,
mandatory documentation artifacts instead of word-of-mouth knowledge, an
independent review kept separate from the executing context, and a model/cost
policy that scales effort to risk. The reasoning behind it: attention is the
scarcest resource — so strictness gets invested where mistakes are expensive,
and consciously spared elsewhere. The final judgment still always stays with the
human.

## Quick start

See [`SETUP.md`](SETUP.md) for the full walkthrough: clone, run `node setup.mjs`,
bind the plugin, start your first session.

### Command lifecycle

Run these commands from the indicated checkout; they are the concise, normal
lifecycle rather than a replacement for the detailed setup guide.

| When | Exact command |
| --- | --- |
| Initial pipeline-source setup | `node setup.mjs` |
| Normal session start | `/pipeline-core:pipeline-start` |
| Verify the current change | `node harness/scripts/verify.mjs` |
| Close a completed block | `/pipeline-core:close-block` |
| Update a Claude Code binding, then reload the running host | `claude plugin marketplace update agent-pipeline`<br>`claude plugin update pipeline-core@agent-pipeline --scope project`<br>`/reload-plugins` |
| Inspect a V3 authority (pipeline source only) | `node plugins/pipeline-core/scripts/runner-profile-migration-v3.mjs inspect --root "$PWD"` |
| Plan its V3-owned changes (pipeline source only) | `node plugins/pipeline-core/scripts/runner-profile-migration-v3.mjs plan --root "$PWD"` |
| Explicitly activate the reviewed V3 plan (pipeline source only) | `node plugins/pipeline-core/scripts/runner-profile-migration-v3.mjs apply --root "$PWD" --activate` |

The V3 sequence is deliberately inspect → plan → explicit activation; `apply
--activate` is its only write step. Read it back with `node setup.mjs`. Do not
use these source-authority commands in an arbitrary application repository.

Before your first big feature, a quick look at
[`docs/design/README.md`](docs/design/README.md) pays off — a self-service
guide for brainstorming a solid requirement before it enters the pipeline
(optional, recommended).

## Runtime

Built for [Claude Code](https://claude.com/claude-code) — the git-guard hooks, the
session-bootstrap check, and gate enforcement all rely on its hook and plugin
system. The underlying methodology (roles, SDLC, review contract) is portable to
other agent runtimes without that enforcement layer; see
[`docs/runtime-boundary.md`](docs/runtime-boundary.md) for the boundary between
what's always portable and what's Claude-Code-specific.

## Learn more

- [`SETUP.md`](SETUP.md) — onboarding: prerequisites, setup steps, troubleshooting.
- [`docs/overview.md`](docs/overview.md) — the model in one read: how the roles,
  gates, and close ritual fit together end to end.
- [`docs/usage.md`](docs/usage.md) — a day in the pipeline: what an ordinary
  working session looks like from the inside.
- [`docs/migration.md`](docs/migration.md) — bringing an existing repo under the
  pipeline, one gate at a time.
- [`docs/design-decisions.md`](docs/design-decisions.md) — the "why" behind the
  model, in plain language.
- [`docs/operating-model.md`](docs/operating-model.md) — the full normative
  document: roles, SDLC, review system, session lifecycle, handover, project
  calibration.
- [`LICENSE`](LICENSE) and [`LICENSE-DOCS`](LICENSE-DOCS) use the source-available Sustainable Use License 1.0 (SUL-1.0); see [`docs/licensing.md`](docs/licensing.md).

## Acknowledgments

This operating model is a synthesis, not an invention. It adapts and builds on
the ideas in three published works, and we thank their authors for the thinking
that shaped it:

- [Dave Rensin, **“Elephants, Goldfish and the New Golden Age of Software Engineering”**](https://research.google/pubs/elephants-goldfish-and-the-new-golden-age-of-software-engineering/) — source of the Elephant and Goldfish roles and the principle that the document, not the session, carries the knowledge;
- [Addy Osmani, Shubham Saboo, Sokratis Kartakis, **“The New SDLC With Vibe Coding”**](https://addyosmani.com/blog/new-sdlc-vibe-coding/) — source of *Agent = Model + Harness*, the orchestrator capability model, and stakes-driven discipline;
- [Google/Kaggle, **“Spec-Driven Production Grade Development in the Age of Vibe Coding”**](https://www.kaggle.com/whitepaper-spec-driven-production-grade-development-in-the-age-of-vibe-coding) — source of the approval-fatigue analysis behind the deliberately minimal set of human gates.

Where this repository departs from these sources — for example, recasting the
Goldfish as an executor rather than a checker — it says so, and why, in
[`docs/operating-model.md`](docs/operating-model.md) and
[`docs/design-decisions.md`](docs/design-decisions.md).

---

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

# Agent-Pipeline (Deutsch)

Ein versioniertes Operating Model für agentische Softwareentwicklung — klonen,
ein Setup-Skript ausführen und ein erprobtes Set aus Rollen, Review-Gates und
Guardrails für die eigenen Projekte übernehmen.

*Wo das gerade steht: ein aktiv entwickelter Public Core, der über öffentliche
Feature-Branches und Dogfooding-Runden weiterentwickelt wird. Feedback
willkommen.*

> **Zur Sprache.** Dieses Operating Model entstand zuerst auf Deutsch und wurde für
> die Veröffentlichung auf Englisch-first umgestellt. Die Doku ist englisch-primär —
> zweisprachige Dateien führen unterhalb eines Skip-Markers eine vollständige
> deutsche Referenz —, aber durch diese Herkunft können vereinzelt noch deutsche
> Reste auftauchen (ein Kommentar, ein Beispiel, ein internes Label oder mal eine
> Direktive). Das ist unkritisch, Korrekturen/PRs sind willkommen, und welche
> Sprache die Pipeline für dich verwendet (Commits, Reviews, PRDs), wählst du über
> die Einstellung `language.human_facing`.

> **Einstieg für Neue:** Diese README ist der einzige Einstieg. Für die Übernahme ist
> als Nächstes nur `SETUP.md` erforderlich; weiterführende und
> konzeptionelle Dokumentation ist optionales Nachschlagewerk.

## Das Problem

Teams, die mit Coding-Agents arbeiten, erfinden dieselben Konventionen in jedem
Repo neu — Review-Rituale, git-Guardrails, Handover-Dateien — und kopieren sie
von Hand zwischen Projekten. Kopien driften auseinander. Es gibt keine
unabhängige Prüfinstanz, die getrennt von den Autoren des Codes urteilt, und
keine gemeinsame Linie dafür, welches Modell welche Art von Arbeit zu welchen
Kosten übernimmt. Dieses Repo ist genau diese fehlende, gemeinsame Schicht:
eine versionierte Quelle, per Referenz übernommen statt kopiert.

## Was du bekommst

Vier bewusst getrennte Rollen tragen das Modell:

- **Product Owner (du)** — das menschliche Gate. Gibt die Richtung vor, prüft
  Ergebnisse, erteilt die finale Freigabe.
- **Elephant** — die langlebige Orchestrator-Sitzung. Formt aus deiner Absicht eine
  Spezifikation, zerlegt sie in kleine Aufgaben, delegiert sie und entscheidet am
  Ende über Go/No-Go.
- **Goldfish** — ein Subagent mit frischem Kontext. Führt genau eine klar
  umrissene Aufgabe aus und meldet sich nur mit Nachweis zurück, nie mit einer
  bloßen Behauptung.
- **Critic** — ein unabhängiger Prüfer mit reinem Lesezugriff und frischem
  Kontext. Sieht nie Chat-Verlauf oder Begründungen — nur das Ergebnis, das er
  für sich beurteilt.

Ergänzend dazu:

- **Zweistufiges Review** — deterministische Gates (Tests, Security-Scan, Lint)
  laufen *vor* jedem LLM-Urteil; nur was die Gates übersteht, erreicht einen
  Critic.
- **Specs mit prüfbaren Akzeptanzkriterien** — keine Aufgabe ist „fertig" nach
  Gefühl; jede Aufgabe hat eine Definition of Done, die sich tatsächlich prüfen
  lässt.
- **Git-Guardrails** — eine Hook-Schicht, die Force-Pushes, History-Rewrites,
  gelöschte geschützte Branches und übersprungene Hooks blockiert, unabhängig
  davon, worum ein Agent bittet.
- **Eine Modell-/Token-Policy** — rollenabgestuftes Modell-Routing (Design /
  Implementierung / Mechanik / Review / optionaler Advisor), die du auf dein
  eigenes Abo einstellst, sodass sich die Kosten nach der Aufgabenkomplexität
  richten, statt dass ein einziges Modell alles übernimmt.
- **Nachweispflicht** — „fertig" heißt: ein maschinell geschriebenes Log oder
  Ergebnis, dazu der exakte Befehl und dessen Exit-Code — nie eine vom Modell
  formulierte Behauptung, etwas „sollte funktionieren".
- **Zwei menschliche Gates statt eines Freigabe-Dauerstroms** — die Plan-Freigabe
  vorn und die Abnahme am Ende sind die einzigen zwei Pflichthalte für dich.
  Bewusst wenige, bewusst platziert: Deine Aufmerksamkeit ist die knappe
  Ressource, und eine lange Schlange kleiner Freigaben trainiert reflexartiges
  Wegklicken, kein echtes Prüfen.

## Wie es funktioniert

### Drei Wurzeln, eine Abhängigkeitsrichtung

Der **Public Core** ist der portable, committete Vertrag: Methodik, Plugin,
Templates und die öffentliche `pipeline.user.yaml`-Autorität. Seine Entwicklung
findet auf öffentlichen Feature-Branches statt. Eine separat versionierte,
ignorierte **Private Extension** (auch Private Overlay genannt) konsumiert genau
einen gepinnten, unveränderlichen Public-Core-SHA; sie liefert keine Account-,
Owner-, Repository- oder Pfadkoordinaten zurück in den Core. **Lokale User-,
PC- und Runtime-Datenwurzeln** enthalten Zugangsdaten, Marketplace- und
Account-Mappings, absolute Pfade, lokale Einstellungen, Caches und Session-Daten.
Sie bleiben ignoriert und werden nie in eine öffentliche Projektion kompiliert.
So ist ein zweites Gerät aus dem öffentlichen Snapshot plus passendem Private-Pin
reproduzierbar, ohne Secrets oder lokale Historie zu kopieren.

`pipeline.user.yaml` ist die öffentliche Quelle der Setup-Absicht. `node
setup.mjs` kompiliert die zugehörigen Runtime-Projektionen; **generierte
Runtime-Konfiguration wird nie von Hand bearbeitet**. Ändere die Quelle und
führe danach Setup oder die explizite V3-Migration unten erneut aus. Der
Compiler erkennt Drift, statt eine lokale Änderung stillschweigend zur Autorität
zu machen.

V3 hat registrierte Routen für Claude und Codex. Claude Code ist die
Full-Enforcement-Laufzeit: Plugin und Hooks können konfigurierte Guardrails
durchsetzen. Codex und andere CLIs können dieselbe Rollen-, Evidenz- und
Review-Methodik nutzen, aber daraus folgt weder ein Anspruch auf Claude-Hooks,
Plugin-Installation, automatische Guardrails noch Modellidentität. In Codex
wird jede Fable-Aufgabe bei gleichem Effort-Tier zu `gpt-5.6-sol` aufgelöst;
Claude-Zuweisungen bleiben unverändert. Die genaue Zuständigkeitsgrenze steht in
[`docs/runtime-boundary.md`](docs/runtime-boundary.md).

Die native Codex-Selected-Sandbox-Route bleibt der bevorzugte, attestierte Weg;
diese README behauptet **nicht**, dass die aktuelle Host-Einschränkung behoben
ist. Nach genau einem typisierten Ergebnis `no-child` oder `unavailable` darf
eine PO-autorisierte Ausnahme genau einen frischen, internen,
hard-read-only-Consult zur selben einzelnen Frage ausführen. Sie erlaubt weder
Handover noch Memory, Mutation, Netzwerkexport, Rohantwort-Aufbewahrung,
Auto-Apply, zweite Frage oder Retry. Ein erfolgreicher Ausnahmefall ist nur ein
Funktionsäquivalenz-Pass, nie ein nativer Sandbox-Erfolg: `keine attestierte
Selected-Sandbox-Ausführung; OS-Isolation und Modellidentität werden nicht
behauptet`.

Das Modellrouting liegt in V3-Profilen (`epic`, `feature`, `mini`); Modell und
Effort werden je Phase und Runner ausgewählt.

```mermaid
flowchart LR
    PO["Product Owner<br/>(du)"] -->|"Absicht / Auftrag"| Elephant["Elephant<br/>(Orchestrator)"]
    Elephant -->|"Spec + Dispatch"| Goldfish["Goldfish<br/>(frischer Kontext)"]
    Goldfish -->|"Nachweis"| Gates["Deterministische Gates<br/>(Tests, Security, Lint)"]
    Gates -.->|"fehlgeschlagen"| Goldfish
    Gates -->|"bestanden"| Critic["Critic<br/>(unabhängiger Prüfer)"]
    Critic -->|"Befunde"| Elephant
    Elephant -->|"Entscheidung"| PO
```

## Wie ein Durchlauf abläuft

```mermaid
flowchart TD
    ID["Idee"] --> P
    ID -.->|"optional, advisory"| DS["Design-Vorstufe<br/>(Selbstbedienung,<br/>docs/design/)"]
    DS -.-> P
    P["Profil-/Modell-Entscheid"] --> PL["Plan-Artefakt +<br/>menschliches Plan-Gate"]
    PL --> R["Readiness-Check"]
    R --> D["Dispatch<br/>(frischer Kontext, Briefing)"]
    D --> G["Deterministische Gates<br/>(verify, Security-Scan)"]
    G --> C["Risikoklassen-abhängiger Critic"]
    C --> H["Menschliches Abschluss-Gate"]
    H --> M["Merge + Doku-Sync"]
    M -.->|"optional, falls Manifest Release erklärt"| REL["Release/Promotion<br/>(optional, §3.5)"]
```

Entscheidend ist die Reihenfolge: Die maschinellen Gates laufen immer VOR jedem
Urteil eines LLM — ein Critic bewertet nie einen Diff, der die deterministische
Kette noch nicht durchlaufen hat.

Ein optionaler Release/Promotion-Ausklang kann nach dem Merge andocken (`REL`
oben), sobald das Manifest eines Projekts einen `release`-Abschnitt erklärt —
Details in [`docs/deploy/README.md`](docs/deploy/README.md).

## Die Vordertür: optionale Design-Vorstufe

Vor der eigentlichen Pipeline steht bewusst kein Pflichtschritt, sondern eine
Vordertür (im Diagramm oben der gestrichelte Zweig): Idee → optionales
Design-Brainstorming mit einer beliebigen Chat-KI (Guide + Standard-Prompt +
schlankes Export-Template unter [`docs/design/README.md`](docs/design/README.md))
→ Requirements-Export → speist die Pipeline. Wirkt eine Anforderung bei der
Triage umfangreich (mehrere Module/Projekte betroffen, neue Architektur,
mehrere plausible Optionen, größere Security-/Datenfläche), weist der
Elephant **nicht-blockierend** darauf hin und verlinkt den Guide — wer sofort
ohne Design weiterarbeiten will, kann das jederzeit tun. Ein externer
Design-Export bekommt dabei nie einen Vertrauensvorschuss: Der Elephant
challenged ihn und leitet ihn über den normalen Weg (Interview → Spec →
Readiness) neu her, statt ihn als fertig genehmigtes Design zu übernehmen.
Bei großen Themen schlägt der Elephant zusätzlich einen Schnitt in mehrere
eigenständige Backlog-Items vor und wartet auf Bestätigung oder Korrektur —
das bestehende PRD-Review pro Item bleibt der einzige Prüfpunkt, es kommt
nichts Neues hinzu. Details: [`docs/operating-model.md`](docs/operating-model.md) §3.2.

## Eigene Architekturvorgaben & Guardrails

Ein Projekt kann eigene Hausregeln mitbringen — getrennt in zwei Klassen:
**Guidelines** sind empfohlene Prinzipien, von denen bewusst und benannt
abgewichen werden darf; **Policies** sind verbindliche Regeln, die ein Gate
blockieren, sobald sie verletzt werden. Beide leben unter
[`governance/examples/`](governance/examples/README.md) und werden über den
`governance`-Block in `.claude/pipeline.yaml` eingebunden.

Durchgesetzt wird jede Klasse unterschiedlich: Guidelines fließen in jeden Plan
ein und sind der Prüf-Maßstab des Critic — eine unbenannte Abweichung ist der
Befund, nicht die Abweichung selbst. Maschinell prüfbare Policies blockieren
automatisch das Security-Scan-Gate; die nicht-maschinelle Checkliste hakt der
Critic vor jedem Push ab. Ein Muster komplett durchgespielt — von der
Hausregel bis zur erzwungenen Regel — steht im
[Worked Example](governance/examples/worked-example.md).

## Drei Drehregler statt einer Einheitsgröße

Gleiche Methode, kalibrierte Strenge — vom Wochenend-Hack bis zur
Enterprise-Codebasis. Drei unabhängige Regler stellen das ein:

- **Rigor pro Aufgabe** — Issue-only / Delta-Spec / Spec-verankert
- **Governance-Modus pro Regelwerk** — advisory / enforcing / off
- **Session-Profil pro Sitzung** — Design / Advisor / Speed (Modell, Effort
  und Advisor je Profil: `pipeline.user.yaml` → `worktypes`)

## Warum das auch im Unternehmenskontext trägt

Was hier zusammenkommt, ist mehr als ein Agent-Setup: eine wiederholbare
Architektur durch die Governance-Schicht, maschinell prüfbare Gates statt
Versprechen, Pflicht-Dokumentationsartefakte statt Zuruf-Wissen, ein
unabhängiges Review getrennt vom ausführenden Kontext und eine
Modell-/Kosten-Policy, die Aufwand nach Risiko staffelt. Der Grund dahinter:
Aufmerksamkeit ist die knappste Ressource — Strenge wird also dort
investiert, wo Fehler teuer sind, und woanders bewusst gespart. Das letzte
Urteil bleibt trotzdem immer beim Menschen.

## Schnellstart

Der vollständige Ablauf steht in [`SETUP.md`](SETUP.md): klonen, `node setup.mjs`
ausführen, Plugin binden, erste Session starten.

### Befehls-Lebenszyklus

Führe die Befehle im jeweils genannten Checkout aus; sie bilden den kompakten
normalen Ablauf ab und ersetzen nicht den detaillierten Setup-Guide.

| Wann | Exakter Befehl |
| --- | --- |
| Initiales Pipeline-Source-Setup | `node setup.mjs` |
| Normaler Session-Start | `/pipeline-core:pipeline-start` |
| Aktuelle Änderung verifizieren | `node harness/scripts/verify.mjs` |
| Fertigen Block abschließen | `/pipeline-core:close-block` |
| Claude-Code-Binding aktualisieren und laufenden Host neu laden | `claude plugin marketplace update agent-pipeline`<br>`claude plugin update pipeline-core@agent-pipeline --scope project`<br>`/reload-plugins` |
| V3-Autorität inspizieren (nur Pipeline Source) | `node plugins/pipeline-core/scripts/runner-profile-migration-v3.mjs inspect --root "$PWD"` |
| Ihre V3-eigenen Änderungen planen (nur Pipeline Source) | `node plugins/pipeline-core/scripts/runner-profile-migration-v3.mjs plan --root "$PWD"` |
| Geprüften V3-Plan explizit aktivieren (nur Pipeline Source) | `node plugins/pipeline-core/scripts/runner-profile-migration-v3.mjs apply --root "$PWD" --activate` |

Die V3-Reihenfolge ist bewusst Inspect → Plan → explizite Aktivierung;
`apply --activate` ist ihr einziger Write-Schritt. Lies anschließend mit `node
setup.mjs` zurück. Nutze diese Source-Autoritätsbefehle nicht in einem beliebigen
Anwendungs-Repository.

Vor dem ersten großen Feature lohnt ein kurzer Blick in
[`docs/design/README.md`](docs/design/README.md) — der Selbstbedienungs-Guide
zum Brainstorming einer soliden Anforderung, bevor sie in die Pipeline geht
(optional, empfohlen).

## Laufzeitumgebung

Gebaut für [Claude Code](https://claude.com/claude-code) — die git-Guard-Hooks, der
Session-Bootstrap-Check und die Gate-Durchsetzung setzen auf dessen Hook- und
Plugin-System auf. Die zugrunde liegende Methodik (Rollen, SDLC, Review-Vertrag)
ist auf andere Agent-Laufzeitumgebungen übertragbar, allerdings ohne diese
Durchsetzungsschicht; siehe [`docs/runtime-boundary.md`](docs/runtime-boundary.md)
für die Grenze zwischen dem, was immer übertragbar ist, und dem, was
Claude-Code-spezifisch ist.

## Mehr erfahren

- [`SETUP.md`](SETUP.md) — Onboarding: Voraussetzungen, Setup-Schritte,
  Fehlerbehebung.
- [`docs/overview.md`](docs/overview.md) — das Modell in einem Durchgang: wie
  Rollen, Gates und Abschluss-Ritual von Anfang bis Ende zusammenspielen.
- [`docs/usage.md`](docs/usage.md) — ein Tag in der Pipeline: wie eine gewöhnliche
  Arbeitssitzung von innen aussieht.
- [`docs/migration.md`](docs/migration.md) — ein bestehendes Repo Schritt für
  Schritt unter die Pipeline bringen.
- [`docs/design-decisions.md`](docs/design-decisions.md) — das „Warum" hinter dem
  Modell, in einfacher Sprache.
- [`docs/operating-model.md`](docs/operating-model.md) — das vollständige
  normative Dokument: Rollen, SDLC, Review-System, Session-Lifecycle, Handover,
  Projekt-Kalibrierung.
- [`LICENSE`](LICENSE) und [`LICENSE-DOCS`](LICENSE-DOCS) verwenden die source-available Sustainable Use License 1.0 (SUL-1.0); siehe [`docs/licensing.md`](docs/licensing.md).

## Danksagung

Dieses Operating Model ist eine Synthese, keine Erfindung. Es adaptiert die
Ideen aus drei veröffentlichten Arbeiten und baut auf ihnen auf; wir danken
ihren Autorinnen und Autoren für die Denkarbeit, die es geprägt hat:

- [Dave Rensin, **„Elephants, Goldfish and the New Golden Age of Software Engineering“**](https://research.google/pubs/elephants-goldfish-and-the-new-golden-age-of-software-engineering/) — Quelle der Elephant- und Goldfish-Rollen und des Prinzips, dass das Dokument, nicht die Session, das Wissen trägt;
- [Addy Osmani, Shubham Saboo, Sokratis Kartakis, **„The New SDLC With Vibe Coding“**](https://addyosmani.com/blog/new-sdlc-vibe-coding/) — Quelle von *Agent = Model + Harness*, des Orchestrator-Capability-Modells und der stakes-getriebenen Disziplin;
- [Google/Kaggle, **„Spec-Driven Production Grade Development in the Age of Vibe Coding“**](https://www.kaggle.com/whitepaper-spec-driven-production-grade-development-in-the-age-of-vibe-coding) — Quelle der Approval-Fatigue-Analyse hinter dem bewusst minimalen Satz an Human-Gates.

Wo dieses Repository von diesen Quellen abweicht — etwa indem der Goldfish als
Ausführender statt als Prüfer neu geschnitten wird —, sagt es das und warum, in
[`docs/operating-model.md`](docs/operating-model.md) und
[`docs/design-decisions.md`](docs/design-decisions.md).

---

Die deutsche Fassung ist eine Übersetzung des englischen Originals.
