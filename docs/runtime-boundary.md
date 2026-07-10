# Runtime boundary — Claude Code vs. portable methodology

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

The Agent-Pipeline is two layers stacked on top of each other:

- a **methodology** — roles, an SDLC, a review contract, and a handful of
  disciplines (spec, evidence, model/token) that describe *how* work moves from
  intent to a shipped change; and
- an **enforcement layer** — a set of hooks and a plugin that make some of those
  disciplines hard to skip by accident.

The methodology is portable. It is prose and practice; it runs wherever you and
an agent can read and follow it. The enforcement layer is not portable: it is
wired into Claude Code's hook and plugin system, and nothing outside Claude Code
runs it. This page draws that line precisely — so you know exactly what you keep,
and what you take over yourself, if you run the pipeline on a different agent
runtime.

## The one setting that names your side of the line

`pipeline.user.yaml` has a single field for this:

```yaml
agent_runtime: claude-code   # claude-code (full enforcement) | other (methodology only)
```

- **`claude-code`** — the default. The plugin's hooks are live and the gates
  below actually block.
- **`other`** — you run the methodology by hand. `setup.mjs` records the choice
  and prints a one-line reminder pointing here.

One point worth stating plainly: choosing `other` does not strip anything out of
the compiled config. The hooks run through Claude Code's hook system; on any
other runtime there is simply no hook system to invoke them, so they are
inherently absent. The setting is a declaration of intent — it names which half
of the pipeline you are relying on. It is not a switch that rewrites the guards.

## What requires Claude Code — the enforcement layer

Everything in this section is a hook or a plugin component. It exists because
Claude Code exposes `PreToolUse`, `SessionStart`, and `Stop` hook points and a
plugin/skill system. Take that away and none of it fires.

### Guard hooks (`PreToolUse`)

| Guard | Fires on | What it blocks |
|---|---|---|
| **`guard-git`** | `Bash` / `PowerShell` | Force-pushes, history rewrites, deletion of protected branches or tags, and skipped hooks — regardless of what any agent asks for. |
| **`guard-push`** | `Bash` / `PowerShell` (after `guard-git`) | A `git push` when the verify/security evidence is missing, stale (recorded against a commit that is not `HEAD`), or red — or when the required human approval is absent. |
| **`guard-testpath`** | `Edit` / `Write` | Edits to the test files that gate an implementation, so an implementor cannot quietly weaken or delete its own checks. Config-driven; with no configured paths it does nothing. |
| **`guard-devplan`** | `Edit` / `Write` (after `guard-testpath`) | Implementation edits while the active feature's plan is not yet approved. Docs, specs, `.claude/`, and backlog paths are exempt. |

All four fail *open*: without a manifest or state file they allow the action
rather than block on missing config.

### Lifecycle hooks (`SessionStart`, `Stop`)

| Hook | Fires on | What it does |
|---|---|---|
| **`staleness-check`** | session start / resume / clear | Compares the installed `pipeline-core` plugin against the marketplace remote and surfaces a bootstrap line (fresh) or an upgrade notice (stale). |
| **`setup-check`** | session start / resume / clear | Reminds you to run `node setup.mjs` if the repo still carries its committed default identity — i.e. personalization has not happened yet. Never blocks. |
| **`post-compact-reground`** | after `/compact` | Re-grounds the session with a short message naming the active role, feature, and phase, so a compacted session does not lose the thread. Never blocks. |
| **`stop-suggest`** | end of each turn (`Stop`) | Suggests the next pipeline phase or gate, and raises staged context-budget warnings as the session's token use climbs. |

### Plugin, skills, statusline

The whole thing ships as the `pipeline-core` Claude Code plugin. Beyond the
hooks, that includes:

- **Skills** you invoke by name — `pipeline-start` (the session bootstrap
  protocol), `close-block` (the block-close ritual), `critic-review` (an
  independent read-only Critic pass), `conventional-commit` (proposes a commit
  message from the staged diff), and `advisor-consult` (the read-only
  second-opinion workaround).
- **Bound subagents** — a fresh-context Critic and the Goldfish
  implementor/mechanic tiers, dispatched as Claude Code subagents.
- **A statusline** configured in `.claude/settings.json`.

None of these have an equivalent outside Claude Code. On another runtime they
become things you do by hand, if you do them at all.

## What is portable — the methodology

This is the part with no dependency on any runtime. It is documents and habits;
it travels with the repo and works under any agent that can read a spec and run
a command.

- **The four roles.** Product Owner (the human gate), Elephant (the long-lived
  orchestrator), Goldfish (a fresh-context implementor that reports evidence,
  not claims), and Critic (an independent read-only reviewer that sees only the
  result). You can seat these roles under any runtime; they are a division of
  responsibility, not a feature.
- **The SDLC.** Intent to spec to small tasks to implement to review to
  decision. The flow lives in [`operating-model.md`](operating-model.md) and
  depends on nothing Claude-Code-specific.
- **The two-stage review contract.** Deterministic checks (tests, security scan,
  lint) run first; only what survives reaches a reviewer. On Claude Code the
  first stage is partly hook-enforced; as a *practice* it is just "run the checks
  before you ask anyone to judge the work," which you can do anywhere.
- **Spec discipline.** Every task carries acceptance criteria that something or
  someone can actually check. That is a way of writing specs, not a tool.
- **Evidence discipline.** "Done" means a machine-written log or output, the
  exact command, and its exit code — never a model's assurance that something
  "should work." Portable by definition.
- **The model/token policy as a practice.** Route design, implementation,
  mechanical, and review work to models that match their complexity, and keep an
  eye on cost. On another runtime you lose the routing *hooks* but keep the
  *rule*.
- **Handover discipline.** One canonical handover file that wins on conflict,
  updated as state changes rather than reconstructed from chat history.

## Running on `other`: you become the enforcement layer

Pick `agent_runtime: other` and the methodology is intact, but nothing is
stopping you from cutting a corner. In practice that means turning each
blocked-by-hook gate into a manual step you own:

| On Claude Code, enforced by… | On another runtime, you do this by hand |
|---|---|
| `guard-git` | Keep your own git hygiene — no force-push, no history rewrite on shared branches, no `--no-verify`. |
| `guard-push` | Do not push until the tests and security scan are green *for the exact commit you are pushing*, and the human gate has signed off. |
| `guard-devplan` | Do not start implementing until the plan for the feature is approved. |
| `guard-testpath` | Do not let the implementor rewrite the tests that judge its own work — review test diffs separately. |
| two-stage review | Run the deterministic checks yourself, then have a separate, fresh-context reviewer look only at the result. |
| `stop-suggest` / bootstrap | Keep the handover file current and re-read it at the start of each session. |

The trade is straightforward: on `other` you get the same discipline with none
of the safety net. That is a fine place to evaluate the methodology, or to run it
under an agent you already trust — just go in knowing the guards are advisory,
not active.

## See also

- [`README.md`](../README.md) — what the pipeline is, and the role diagram.
- [`overview.md`](overview.md) — the roles and the flow between them, end to end.
- [`SETUP.md`](../SETUP.md) — running `setup.mjs`, the runtime question, and what
  it compiles.
- [`migration.md`](migration.md) — bringing an existing project under the pipeline.
- [`usage.md`](usage.md) — how a day-to-day session runs once a repo is onboarded.
- [`operating-model.md`](operating-model.md) — the full normative methodology:
  roles, SDLC, review system, handover.
- [`design-decisions.md`](design-decisions.md) — the "why" behind the model.

---

# Laufzeitgrenze — Claude Code vs. übertragbare Methodik

Die Agent-Pipeline besteht aus zwei aufeinanderliegenden Schichten:

- einer **Methodik** — Rollen, ein SDLC, ein Review-Vertrag und eine Handvoll
  Disziplinen (Spec, Nachweis, Modell/Token), die beschreiben, *wie* Arbeit von
  der Absicht zur ausgelieferten Änderung wandert; und
- einer **Durchsetzungsschicht** — einem Satz Hooks und einem Plugin, die einige
  dieser Disziplinen praktisch unumgehbar machen.

Die Methodik ist übertragbar. Sie ist Text und Praxis; sie läuft überall dort,
wo du und ein Agent sie lesen und befolgen könnt. Die Durchsetzungsschicht ist
nicht übertragbar: Sie hängt am Hook- und Plugin-System von Claude Code, und
außerhalb von Claude Code führt sie niemand aus. Diese Seite zieht genau diese
Grenze — damit du weißt, was du behältst und was du selbst übernimmst, wenn du
die Pipeline auf einer anderen Agent-Laufzeitumgebung betreibst.

## Die eine Einstellung, die deine Seite der Grenze benennt

`pipeline.user.yaml` hat dafür genau ein Feld:

```yaml
agent_runtime: claude-code   # claude-code (volles Enforcement) | other (nur Methodik)
```

- **`claude-code`** — der Default. Die Hooks des Plugins sind aktiv, und die
  Gates unten blockieren tatsächlich.
- **`other`** — du führst die Methodik von Hand aus. `setup.mjs` hält die Wahl
  fest und gibt einen einzeiligen Hinweis aus, der hierher verweist.

Ein Punkt, den man klar aussprechen sollte: `other` entfernt nichts aus der
kompilierten Config. Die Hooks laufen über das Hook-System von Claude Code; auf
jeder anderen Laufzeitumgebung existiert schlicht kein Hook-System, das sie
aufrufen könnte, also fehlen sie von Natur aus. Die Einstellung ist eine
Absichtserklärung — sie benennt, auf welche Hälfte der Pipeline du dich
verlässt. Sie ist kein Schalter, der die Guards umschreibt.

## Was Claude Code voraussetzt — die Durchsetzungsschicht

Alles in diesem Abschnitt ist ein Hook oder ein Plugin-Bestandteil. Es existiert,
weil Claude Code die Hook-Punkte `PreToolUse`, `SessionStart` und `Stop` sowie
ein Plugin-/Skill-System bereitstellt. Nimmt man das weg, feuert nichts davon.

### Guard-Hooks (`PreToolUse`)

| Guard | Feuert bei | Was er blockiert |
|---|---|---|
| **`guard-git`** | `Bash` / `PowerShell` | Force-Pushes, History-Rewrites, das Löschen geschützter Branches oder Tags und übersprungene Hooks — egal, worum ein Agent bittet. |
| **`guard-push`** | `Bash` / `PowerShell` (nach `guard-git`) | Einen `git push`, wenn der Verify-/Security-Nachweis fehlt, veraltet ist (für einen Commit erfasst, der nicht `HEAD` ist) oder rot ist — oder wenn die nötige menschliche Freigabe fehlt. |
| **`guard-testpath`** | `Edit` / `Write` | Änderungen an den Testdateien, die eine Implementierung absichern, damit ein Implementierer seine eigenen Prüfungen nicht klammheimlich aufweicht oder löscht. Konfigurationsgesteuert; ohne konfigurierte Pfade tut er nichts. |
| **`guard-devplan`** | `Edit` / `Write` (nach `guard-testpath`) | Implementierungs-Edits, solange der Plan des aktiven Features noch nicht freigegeben ist. Docs, Specs, `.claude/` und Backlog-Pfade sind ausgenommen. |

Alle vier lassen im Zweifel durch (fail-open): Ohne Manifest oder State-Datei
erlauben sie die Aktion, statt bei fehlender Config zu blockieren.

### Lifecycle-Hooks (`SessionStart`, `Stop`)

| Hook | Feuert bei | Was er tut |
|---|---|---|
| **`staleness-check`** | Session-Start / Resume / Clear | Vergleicht das installierte `pipeline-core`-Plugin mit dem Marketplace-Remote und zeigt eine Bootstrap-Zeile (aktuell) oder einen Upgrade-Hinweis (veraltet). |
| **`setup-check`** | Session-Start / Resume / Clear | Erinnert an `node setup.mjs`, wenn das Repo noch seine committete Default-Identität trägt — die Personalisierung also noch aussteht. Blockiert nie. |
| **`post-compact-reground`** | nach `/compact` | Verankert die Session mit einer kurzen Nachricht neu, die aktive Rolle, Feature und Phase benennt, damit eine komprimierte Session den Faden nicht verliert. Blockiert nie. |
| **`stop-suggest`** | Ende jedes Turns (`Stop`) | Schlägt die nächste Pipeline-Phase oder das nächste Gate vor und meldet gestaffelte Kontext-Budget-Warnungen, wenn der Token-Verbrauch der Session steigt. |

### Plugin, Skills, Statusline

Das Ganze wird als das Claude-Code-Plugin `pipeline-core` ausgeliefert. Neben den
Hooks gehören dazu:

- **Skills**, die du namentlich aufrufst — `pipeline-start` (das
  Session-Bootstrap-Protokoll), `close-block` (das Ritual zum Block-Abschluss),
  `critic-review` (ein unabhängiger Critic-Durchgang mit reinem Lesezugriff),
  `conventional-commit` (schlägt eine Commit-Nachricht aus dem gestageten Diff
  vor) und `advisor-consult` (der Zweitmeinungs-Behelf mit reinem Lesezugriff).
- **Gebundene Subagents** — ein Critic mit frischem Kontext sowie die
  Goldfish-Stufen für Implementierung und Mechanik, jeweils als
  Claude-Code-Subagent dispatcht.
- **Eine Statusline**, konfiguriert in `.claude/settings.json`.

Nichts davon hat außerhalb von Claude Code ein Gegenstück. Auf einer anderen
Laufzeitumgebung werden daraus Dinge, die du von Hand erledigst — falls du sie
überhaupt erledigst.

## Was übertragbar ist — die Methodik

Das ist der Teil ohne Abhängigkeit von irgendeiner Laufzeitumgebung. Es sind
Dokumente und Gewohnheiten; sie reisen mit dem Repo und funktionieren unter jedem
Agenten, der eine Spec lesen und einen Befehl ausführen kann.

- **Die vier Rollen.** Product Owner (das menschliche Gate), Elephant (der
  langlebige Orchestrator), Goldfish (ein Implementierer mit frischem Kontext,
  der Nachweis liefert statt Behauptungen) und Critic (ein unabhängiger Prüfer
  mit reinem Lesezugriff, der nur das Ergebnis sieht). Diese Rollen lassen sich
  unter jeder Laufzeitumgebung besetzen; sie sind eine Aufteilung von
  Verantwortung, kein Feature.
- **Das SDLC.** Absicht zu Spec zu kleinen Aufgaben zu Implementierung zu Review
  zu Entscheidung. Der Ablauf steht in
  [`operating-model.md`](operating-model.md) und hängt an nichts
  Claude-Code-Spezifischem.
- **Der zweistufige Review-Vertrag.** Deterministische Prüfungen (Tests,
  Security-Scan, Lint) laufen zuerst; nur was sie übersteht, erreicht einen
  Prüfer. Auf Claude Code ist die erste Stufe teils per Hook durchgesetzt; als
  *Praxis* heißt sie schlicht „lass die Prüfungen laufen, bevor du jemanden um
  ein Urteil bittest" — und das geht überall.
- **Spec-Disziplin.** Jede Aufgabe trägt Akzeptanzkriterien, die sich
  tatsächlich prüfen lassen. Das ist eine Art, Specs zu schreiben, kein Werkzeug.
- **Nachweis-Disziplin.** „Fertig" heißt: ein maschinell geschriebenes Log oder
  Ergebnis, der exakte Befehl und dessen Exit-Code — nie die Zusicherung eines
  Modells, etwas „sollte funktionieren". Übertragbar per Definition.
- **Die Modell-/Token-Policy als Praxis.** Leite Design-, Implementierungs-,
  Mechanik- und Review-Arbeit an Modelle, die zu ihrer Komplexität passen, und
  behalte die Kosten im Blick. Auf einer anderen Laufzeitumgebung verlierst du
  die Routing-*Hooks*, behältst aber die *Regel*.
- **Handover-Disziplin.** Eine kanonische Handover-Datei, die im Konfliktfall
  gewinnt und bei Zustandsänderungen fortgeschrieben wird, statt aus dem
  Chat-Verlauf rekonstruiert zu werden.

## Betrieb auf `other`: Du wirst selbst zur Durchsetzungsschicht

Wähle `agent_runtime: other`, und die Methodik bleibt vollständig — aber nichts
hält dich davon ab, eine Abkürzung zu nehmen. In der Praxis heißt das: Jedes
Gate, das sonst ein Hook blockiert, wird zu einem manuellen Schritt in deiner
Verantwortung.

| Auf Claude Code durchgesetzt von… | Auf einer anderen Laufzeitumgebung machst du das von Hand |
|---|---|
| `guard-git` | Halte deine eigene Git-Hygiene — kein Force-Push, kein History-Rewrite auf geteilten Branches, kein `--no-verify`. |
| `guard-push` | Push erst, wenn Tests und Security-Scan *für genau den Commit, den du pushst* grün sind und das menschliche Gate freigegeben hat. |
| `guard-devplan` | Beginne nicht mit der Implementierung, bevor der Plan des Features freigegeben ist. |
| `guard-testpath` | Lass den Implementierer nicht die Tests umschreiben, die seine eigene Arbeit beurteilen — prüfe Test-Diffs getrennt. |
| zweistufiges Review | Lass die deterministischen Prüfungen selbst laufen und dann einen separaten Prüfer mit frischem Kontext nur auf das Ergebnis blicken. |
| `stop-suggest` / Bootstrap | Halte die Handover-Datei aktuell und lies sie zu Beginn jeder Session erneut. |

Der Kompromiss ist klar: Auf `other` bekommst du dieselbe Disziplin ohne das
Sicherheitsnetz. Das ist ein guter Ort, um die Methodik zu bewerten oder sie
unter einem Agenten zu fahren, dem du ohnehin vertraust — geh nur mit dem Wissen
hinein, dass die Guards beratend sind, nicht aktiv.

## Siehe auch

- [`README.md`](../README.md) — was die Pipeline ist, samt Rollendiagramm.
- [`overview.md`](overview.md) — die Rollen und der Fluss zwischen ihnen, von
  Anfang bis Ende.
- [`SETUP.md`](../SETUP.md) — `setup.mjs` ausführen, die Runtime-Frage und was
  dabei kompiliert wird.
- [`migration.md`](migration.md) — ein bestehendes Projekt unter die Pipeline holen.
- [`usage.md`](usage.md) — wie eine alltägliche Session abläuft, sobald ein Repo
  angebunden ist.
- [`operating-model.md`](operating-model.md) — die vollständige normative
  Methodik: Rollen, SDLC, Review-System, Handover.
- [`design-decisions.md`](design-decisions.md) — das „Warum" hinter dem Modell.

---

Die deutsche Fassung ist eine Übersetzung des englischen Originals.
