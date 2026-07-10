# Bringing an existing project under the pipeline

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

[`SETUP.md`](../SETUP.md) covers standing up your own copy of the pipeline repo.
This guide covers the other half: onboarding one of your **existing** code repos
so its sessions run under the same roles, gates, and guardrails.

Onboarding is deliberately gradual: point the pipeline at the repo, let it
observe, add a thin committed calibration layer, and turn gates on one at a
time — starting with the cheapest, most valuable ones. Nothing here is
all-or-nothing.

## Start read-only

Bind the pipeline to your project before granting it any write autonomy. Bind
the plugin, open a session, and let the bootstrap check and the roles read the
repo — producing specs, plans, and reviews — while writes stay gated. Calibrate
and prove the setup against a real codebase first; broad write autonomy comes
after, once you trust what the gates enforce.

This costs little in safety while you get there: the git-guard union (below)
ships with the plugin and blocks destructive git operations from the very
first commit, regardless of what any agent asks for — so "read-mostly" is the
floor, not a fragile promise. Start with a conservative `autonomy` value in
your calibration (see below) and widen it as confidence grows.

## Bind the plugin

The mechanics are identical to [`SETUP.md`](../SETUP.md) step 3 — run them from
your **project** repo, pointing the marketplace at your own copy of the
pipeline repo:

```
# GitHub
claude plugin marketplace add <owner>/<repo> --scope project
claude plugin install pipeline-core@agent-pipeline --scope project
```

`--scope project` matters — the binding belongs to the repo, not your user
profile. Commit the resulting `.claude/settings.json` (`extraKnownMarketplaces`
and `enabledPlugins` entries) so every clone and CI run resolves the same
plugin. Verify with `claude plugin list --json`.

Unlike the pipeline repo, a project repo has no `setup.mjs` — that script lives
in your pipeline copy and personalizes *that* repo. In a project repo you
author the thin calibration layer by hand, copying from the templates
described next.

## Create the project calibration

The calibration is a small, committed file — `.claude/pipeline.json` — that
tells the central ritual skills how *this* project differs. Everything
universal (roles, review contract, rituals, git-guard union) stays in the
plugin; only project-specific dials live here. Copy the canonical example and
adapt it:

```
cp <pipeline-repo>/templates/pipeline.json.example .claude/pipeline.json
```

Fill in at least these fields:

| Field | What it is | Example values |
|---|---|---|
| `project` | the repo's short name | `"acme-notes"` |
| `verify` | the ONE gate command (see below) | `"pnpm verify"` |
| `autonomy` | how much runs without a human touch | `"interactive"` · `"night-branch-only"` · `"remote"` |
| `branchModel` | how change reaches the main line | `"pr-flow"` · `"direct-push+staging"` |
| `worktree` | whether writing tasks run in a git worktree | `"on-write"` · `"off"` · `"always"` |
| `stakes` | risk tier of the project (drives discipline) | `"low"` · `"medium"` · `"high"` |
| `constraints` | the project's "do not revert" rules | `["No breaking API change without an ADR"]` |
| `handover` | *(optional)* the project's single state file | `"docs/state.md"` (the default when omitted) |

Keys beginning with `$` in the example are documentation and are ignored by
the skills — read them, then delete or keep as you like. If the file is
missing, the skills fall back to safe defaults and announce themselves as
*uncalibrated* rather than guessing silently.

While you're here, copy
[`templates/CLAUDE.project.md`](../templates/CLAUDE.project.md) to your repo
root as `CLAUDE.md` and replace its placeholders — the lean, length-capped
agent context that points every session at this calibration and your handover
file.

One boundary worth stating up front: **project denies do not live in
`pipeline.json`.** Paths and files an agent must never touch (secrets,
generated output, content packs) belong in the committed `.claude/settings.json`
and the git-guard config — the calibration file carries dials, not
prohibitions. See [`docs/operating-model.md`](operating-model.md) §8 for the
full central-vs-calibrated split.

## Adopt gates incrementally

Turn gates on in order of value-per-effort. You do not need the full set on
day one.

**1. The one verify command + the git-guard union.** The foundation, wanted
first:

- **`verify`** — a single command running your full deterministic chain
  (format → lint → typecheck → tests → build, whichever apply). Named once in
  `pipeline.json` and called identically by every consumer, so "green" never
  means two different things. If your repo has no such command yet, writing
  one *is* the first onboarding task. Nothing is "done" while `verify` is red.
- **The git-guard union** — ships with the plugin, needs no configuration.
  Blocks force-pushes, history rewrites, deletion of protected branches and
  tags, blanket discards of uncommitted work, and the standard hook-skip forms
  (`--no-verify`, `git commit -n`, `core.hooksPath` rebinds; other bypass
  vectors documented in `guardrails/git.md` GIT-07, not claimed impossible) —
  for every agent, in every session, from the first commit.

**2. The dev-plan and push gates.** Once verify and the guard are in place,
add the two human gates. Declared in the additive manifest
`.claude/pipeline.yaml` under `gates`, each carrying a `mode` of `blocking`,
`warn`, or `off`:

- **`dev-plan`** — blocks implementation edits on a feature until that
  feature's plan is approved, turning "did we agree on a plan first?" from a
  habit into an enforced step. Drafting the plan itself, and touching docs or
  config, are exempt.
- **`push`** — governs pushes to your remote. Can carry a *standing approval*
  so routine pushes at work-package boundaries proceed without a per-push
  human touch, while the git-guard union still blocks the destructive
  operations underneath it.

Start either gate in `warn` mode to see where it *would* fire without blocking
anyone, then promote to `blocking` once the signal is clean. A gate is meant
to be binary at any moment — `blocking` or `off`; `warn` is a documented,
temporary step on the way to `blocking`, not a resting state. Both gates are
opt-in: with no manifest, or with a gate set to `off`, they fail open and
change nothing.

## Per-project calibration

Beyond gate wiring, a handful of fields tune how strict and targeted the
pipeline is for this specific repo:

- **`stakes`** (`low` / `medium` / `high`, in `pipeline.json`) — the project's
  position on the vibe-to-engineering spectrum. Higher stakes pull the whole
  process toward more rigor: more reviews, tighter gates, less autonomy.
- **`constraints`** (in `pipeline.json`) — numbered "do not revert" rules
  earned from real decisions and failures. Goldfish briefings quote them so
  an implementor can't undo them by accident; the Critic uses them as a
  measuring stick.
- **`riskZones`** (glob paths in `pipeline.json`, e.g. `["app/api/**",
  "prisma/**"]`) — diffs touching these paths raise the risk class during
  triage, pulling in a Critic review where a change to a leaf component
  wouldn't. Point them at your genuinely sensitive surfaces.
- **`protectedTestPaths`** (in `.claude/guard-config.json`, *not*
  `pipeline.json`) — the tests and gate scripts that define "green." A
  PreToolUse guard blocks Edit and Write against these paths so an
  implementor can never weaken its own examiner; a real test change becomes a
  separate, deliberately briefed task. Own copy step — `cp <pipeline-repo>/
  templates/guard-config.json.example .claude/guard-config.json` — then fill
  in your paths; see
  [`templates/guard-config.json.example`](../templates/guard-config.json.example)
  for the field format.

Set these to match the repo in front of you, not a generic ideal. A small
internal tool and a payment service should not carry the same `stakes`,
`riskZones`, or autonomy — that calibrated variety is the point, and it's
what keeps the shared core honest across very different projects.

## Where to go next

- [`SETUP.md`](../SETUP.md) — standing up your pipeline copy and the plugin binding
  in full.
- [`docs/operating-model.md`](operating-model.md) §8 — the normative
  central-vs-calibration split this guide operationalizes.
- [`docs/usage.md`](usage.md) — how a day-to-day session runs once the repo is
  onboarded.
- [`docs/overview.md`](overview.md) — the roles and the flow between them, end to
  end.

---

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

# Ein bestehendes Projekt unter die Pipeline holen

[`SETUP.md`](../SETUP.md) beschreibt, wie du deine eigene Kopie des
Pipeline-Repos aufsetzt. Dieser Leitfaden behandelt die andere Hälfte: eines
deiner **bestehenden** Code-Repos anzubinden, damit dessen Sessions unter
denselben Rollen, Gates und Guardrails laufen.

Die Anbindung erfolgt bewusst schrittweise. Du richtest die Pipeline auf das Repo
aus, lässt sie mitlesen, ergänzt eine dünne, committete Kalibrierungsschicht und
schaltest die Gates einzeln scharf — beginnend mit den günstigsten und
wirksamsten. Nichts hier ist Alles-oder-nichts.

## Zunächst mit reinem Lesezugriff

Binde die Pipeline an dein Projekt, bevor du ihr Schreibrechte gibst. Plugin
binden, Session öffnen und den Bootstrap-Check sowie die Rollen das Repo lesen
lassen — Specs, Pläne und Reviews entstehen —, während Schreibzugriffe noch
gegated bleiben. So kalibrierst und erprobst du das Setup erst an einer echten
Codebasis; breite Schreib-Autonomie kommt danach, sobald du dem vertraust, was die
Gates durchsetzen.

Das kostet dich unterwegs kaum Sicherheit. Die git-Guard-Union (siehe
unten) kommt mit dem Plugin und blockiert destruktive git-Operationen ab dem
ersten Commit, egal worum ein Agent bittet — „überwiegend lesend" ist damit die
Untergrenze, kein brüchiges Versprechen. Starte mit einem konservativen
`autonomy`-Wert in deiner Kalibrierung (siehe unten) und weite ihn aus, wie dein
Vertrauen wächst.

## Plugin binden

Die Mechanik ist identisch zu [`SETUP.md`](../SETUP.md) Schritt 3 — führe sie aus
deinem **Projekt**-Repo aus und richte den Marketplace auf deine eigene Kopie des
Pipeline-Repos:

```
# GitHub
claude plugin marketplace add <owner>/<repo> --scope project
claude plugin install pipeline-core@agent-pipeline --scope project
```

`--scope project` ist entscheidend — die Bindung gehört zum Repo, nicht zu deinem
Nutzerprofil. Committe die entstandene `.claude/settings.json` (die Einträge
`extraKnownMarketplaces` und `enabledPlugins`), damit jeder Klon und jeder
CI-Lauf dasselbe Plugin auflöst. Prüfen mit `claude plugin list --json`.

Anders als das Pipeline-Repo hat ein Projekt-Repo kein `setup.mjs` — dieses Skript
liegt in deiner Pipeline-Kopie und personalisiert *jenes* Repo. In einem
Projekt-Repo schreibst du die dünne Kalibrierungsschicht von Hand und kopierst sie
aus den Vorlagen, die als Nächstes beschrieben werden.

## Projekt-Kalibrierung anlegen

Die Kalibrierung ist eine kleine, committete Datei — `.claude/pipeline.json` —,
die den zentralen Ritual-Skills sagt, worin sich *dieses* Projekt unterscheidet.
Alles Allgemeine (die Rollen, der Review-Vertrag, die Rituale, die
git-Guard-Union) bleibt im Plugin; nur die projektspezifischen Stellschrauben
stehen hier. Kopiere das kanonische Beispiel und passe es an:

```
cp <pipeline-repo>/templates/pipeline.json.example .claude/pipeline.json
```

Fülle mindestens diese Felder aus:

| Feld | Was es ist | Beispielwerte |
|---|---|---|
| `project` | der Kurzname des Repos | `"acme-notes"` |
| `verify` | das EINE Gate-Kommando (siehe unten) | `"pnpm verify"` |
| `autonomy` | wie viel ohne menschlichen Eingriff läuft | `"interactive"` · `"night-branch-only"` · `"remote"` |
| `branchModel` | wie Änderungen die Hauptlinie erreichen | `"pr-flow"` · `"direct-push+staging"` |
| `worktree` | ob schreibende Tasks in einem git-Worktree laufen | `"on-write"` · `"off"` · `"always"` |
| `stakes` | Risikostufe des Projekts (steuert die Strenge) | `"low"` · `"medium"` · `"high"` |
| `constraints` | die „nicht zurückdrehen"-Regeln des Projekts | `["Keine Breaking-API-Änderung ohne ADR"]` |
| `handover` | *(optional)* die eine Statusdatei des Projekts | `"docs/state.md"` (der Default, wenn weggelassen) |

Schlüssel, die im Beispiel mit `$` beginnen, sind Dokumentation und werden von den
Skills ignoriert — lies sie, dann lösche oder behalte sie, wie du magst. Fehlt die
Datei, greifen die Skills auf sichere Defaults zurück und melden sich ausdrücklich
als *unkalibriert*, statt still zu raten.

Kopiere bei der Gelegenheit gleich
[`templates/CLAUDE.project.md`](../templates/CLAUDE.project.md) als `CLAUDE.md` in
dein Repo-Wurzelverzeichnis und ersetze die Platzhalter — das ist der schlanke,
längenbegrenzte Agent-Kontext, der jede Session auf diese Kalibrierung und deine
Handover-Datei verweist.

Eine Grenze gleich vorweg: **Projekt-Denies stehen nicht in `pipeline.json`.**
Pfade und Dateien, die ein Agent nie anfassen darf (Secrets, generierte Ausgaben,
Content-Packs), gehören in die committete `.claude/settings.json` und die
git-Guard-Config — die Kalibrierungsdatei trägt Stellschrauben, keine Verbote.
Die vollständige Aufteilung zwischen zentral und kalibriert steht in
[`docs/operating-model.md`](operating-model.md) §8.

## Gates schrittweise übernehmen

Schalte Gates in der Reihenfolge ihres Nutzens pro Aufwand scharf. Du brauchst
nicht das ganze Set am ersten Tag.

**1. Das eine Verify-Kommando und die git-Guard-Union.** Sie sind das Fundament und
sollten zuerst stehen:

- **`verify`** — ein einziges Kommando, das deine vollständige deterministische
  Kette ausführt (Format → Lint → Typecheck → Tests → Build, soweit zutreffend). Es
  steht einmal in `pipeline.json` und wird von jedem Verbraucher identisch
  aufgerufen, sodass „grün" nie zweierlei bedeutet. Hat dein Repo noch kein solches
  Kommando, *ist* das Schreiben eines solchen der erste Anbindungs-Task. Nichts ist
  „fertig", solange `verify` rot ist.
- **Die git-Guard-Union** — kommt mit dem Plugin und braucht keine Konfiguration.
  Sie blockiert Force-Pushes, History-Rewrites, das Löschen geschützter Branches
  und Tags, pauschales Verwerfen uncommitteter Arbeit und die gängigen
  Hook-Skip-Formen (`--no-verify`, `git commit -n`, `core.hooksPath`-Umbiegung; weitere
  Vektoren dokumentiert in `guardrails/git.md` GIT-07, nicht als unmöglich behauptet) —
  für jeden Agenten, in jeder Session, ab dem ersten Commit.

**2. Das Dev-Plan- und das Push-Gate.** Sobald Verify und Guard stehen, ergänze die
beiden menschlichen Gates. Sie werden im additiven Manifest `.claude/pipeline.yaml`
unter `gates` deklariert und tragen je einen `mode` aus `blocking`, `warn` oder
`off`:

- **`dev-plan`** — blockiert Implementierungs-Edits an einem Feature, bis dessen
  Planung freigegeben ist, und macht aus „haben wir uns erst auf einen Plan
  geeinigt?" statt einer Gewohnheit einen erzwungenen Schritt. Der Plan selbst sowie
  Docs und Config sind ausgenommen.
- **`push`** — regelt Pushes auf dein Remote. Es kann eine *stehende Freigabe*
  tragen, sodass routinemäßige Pushes an Arbeitspaket-Grenzen ohne einzelnen
  menschlichen Eingriff durchgehen, während die git-Guard-Union die destruktiven
  Operationen darunter weiterhin blockiert.

Starte jedes Gate im Modus `warn`, um zu sehen, wo es *feuern würde*, ohne jemanden
zu blockieren, und hebe es auf `blocking`, sobald das Signal sauber ist. Ein Gate
soll zu jedem Zeitpunkt binär sein — `blocking` oder `off`; `warn` ist ein
dokumentierter, vorübergehender Zwischenschritt auf dem Weg zu `blocking`, kein
Dauerzustand. Beide Gates sind opt-in: ohne Manifest, oder wenn ein Gate auf `off`
steht, greifen sie fail-open und ändern nichts.

## Kalibrierung pro Projekt

Über die Gate-Verdrahtung hinaus gibt es einige Felder, mit denen du einstellst,
wie streng und wie gezielt die Pipeline für genau dieses Repo arbeitet:

- **`stakes`** (`low` / `medium` / `high`, in `pipeline.json`) — die Position des
  Projekts auf der Skala zwischen Vibe und Engineering. Höhere Stakes ziehen den
  ganzen Prozess Richtung mehr Sorgfalt: mehr Reviews, engere Gates, weniger
  Autonomie.
- **`constraints`** (in `pipeline.json`) — die nummerierten „nicht
  zurückdrehen"-Regeln aus echten Entscheidungen und Fehlern. Goldfish-Briefings
  zitieren sie, damit ein Implementor sie nicht versehentlich aufhebt; der Critic
  nutzt sie als Maßstab.
- **`riskZones`** (Glob-Pfade in `pipeline.json`, z. B. `["app/api/**",
  "prisma/**"]`) — Diffs, die diese Pfade berühren, heben die Risikoklasse in der
  Einordnung und ziehen ein Critic-Review nach, wo eine Änderung an einer
  Blatt-Komponente das nicht täte. Richte sie auf deine tatsächlich heiklen Flächen.
- **`protectedTestPaths`** (in `.claude/guard-config.json`, *nicht* in
  `pipeline.json`) — die Tests und Gate-Skripte, die „grün" definieren. Ein
  PreToolUse-Guard blockiert Edit und Write auf diesen Pfaden, damit ein Implementor
  seinen eigenen Prüfer nie schwächen kann; eine echte Teständerung wird zu einem
  eigenen, bewusst gebrieften Task. Diese Config hat einen eigenen Kopierschritt —
  `cp <pipeline-repo>/templates/guard-config.json.example .claude/guard-config.json` —,
  danach trägst du deine Pfade ein; das Feldformat zeigt
  [`templates/guard-config.json.example`](../templates/guard-config.json.example).

Stelle das auf das Repo vor dir ein, nicht auf ein generisches Ideal. Ein kleines
internes Tool und ein Zahlungsdienst sollten nicht dieselben `stakes`, dieselben
`riskZones` oder dieselbe Autonomie tragen — diese kalibrierte Vielfalt ist der
Sinn der Sache, und sie sorgt dafür, dass der gemeinsame Kern über sehr
unterschiedliche Projekte hinweg konsistent bleibt.

## Wie es weitergeht

- [`SETUP.md`](../SETUP.md) — deine Pipeline-Kopie aufsetzen und das Plugin
  vollständig binden.
- [`docs/operating-model.md`](operating-model.md) §8 — die normative Aufteilung
  zwischen zentral und Kalibrierung, die dieser Leitfaden umsetzt.
- [`docs/usage.md`](usage.md) — wie eine alltägliche Session abläuft, sobald das
  Repo angebunden ist.
- [`docs/overview.md`](overview.md) — die Rollen und der Fluss zwischen ihnen, von
  Anfang bis Ende.

---

Die deutsche Fassung ist eine Übersetzung des englischen Originals.
