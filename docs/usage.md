# Usage — a day in the pipeline

You've run `node setup.mjs`, bound the plugin, and opened a session (if not, start
with [`SETUP.md`](../SETUP.md)). This is what an ordinary working session looks like
from the inside: one intent in, reviewed and committed work out. Most of the
machinery runs without you — the few moments that need a human are called out
explicitly.

## The shape of a session

1. **Start** — open a Claude Code session, then run the bootstrap check.
2. **Say what you want** — one plain-language intent.
3. **Approve the plan** — the Elephant turns intent into a spec and waits for your
   go-ahead. *(your gate)*
4. **Watch it run** — the Elephant dispatches a Goldfish per task; deterministic
   gates and a Critic do the checking.
5. **Decide the exceptions** — you're pulled back in only for escalations and
   high-stakes sign-off. *(your gate)*
6. **Close** — you run the close ritual; state is persisted, the session ends clean.

The rest of this page walks each step with the exact commands you touch.

## 1. Start a session

Open Claude Code in your project. At session start a `SessionStart` hook surfaces a
reminder line — *run `/pipeline-core:pipeline-start` before any work* (plus an upgrade
notice if your installed plugin is behind the marketplace remote). The reminder itself
checks nothing; you run `/pipeline-core:pipeline-start`, and that skill performs the
bootstrap (re-run it by hand after a `/clear` or a plugin refresh). It verifies that
the ruleset is loaded and matches the marketplace remote, that your
`.claude/pipeline.json` calibration is present, that the handover file is current, and
that the verify gate is runnable. It then asks you **one** question — which
cost/quality profile this session should run in — and shows you the exact `/model` and
`/effort` commands to paste for that profile.

Nothing starts until the check prints its confirmation line. That line is the
auditable proof the session was bootstrapped; a session without it counts as not
bootstrapped. If the ruleset is stale or the calibration is missing, the check says
so and names the fix instead of quietly proceeding.

## 2. Say what you want

Give the Elephant your intent in plain language — "add rate limiting to the public
API", not a task breakdown. The Elephant is the long-lived orchestrator: where the
intent is ambiguous it interviews you (and it's built to push back, not just agree),
then turns the result into a **spec with checkable acceptance criteria**. Nothing is
"done" on a feeling — every task gets a Definition of Done that a script or a person
can actually verify.

This is the **no-code phase**: no implementation happens until the spec exists. For
anything beyond a trivial fix, the spec first goes through a **readiness check** — a
fresh, read-only subagent reads only the spec and asks, "could someone implement
this correctly from the document alone?" Gaps go back into the document before a
line of code is written.

## 3. Approve the plan — your gate

Before the first implementation task, the Elephant brings you the plan: a short,
readable product rationale (what, why, scope, non-goals, risks) — delivered to you,
not left as a file path to go find. It then waits for your explicit approval and
dispatches nothing until it arrives.

This is the human gate that matters most. It's a hold on the *designed plan*, before
any expensive (mis-)implementation — the cheapest place to catch a wrong direction.
Approve it, ask for a change, or reject it; the Elephant acts only on a clear
go-ahead.

## 4. Watch it run

Once you've approved, the Elephant decomposes the work into small, independent tasks
and dispatches a **Goldfish** for each — a fresh-context subagent that gets exactly
one task through a self-contained briefing (goal, context files, done-checks,
prohibitions, stop conditions). A Goldfish never inherits chat history and is never
micromanaged step by step; independent tasks run in parallel (typically a handful at
once, on disjoint files or isolated worktrees).

Each result runs the **two-stage review**:

- **Deterministic gates first** — format, lint, typecheck, tests, build (and an
  optional security scan) run *before* any model judgment. A Goldfish's "done" means
  a machine-written log, the exact command, and its exit code — never a claim that
  something "should work." Red gates bounce back to a fresh attempt.
- **Then a Critic** — an independent, read-only reviewer with a fresh context. It
  sees the spec, the diff, the guardrails, and the evidence — never the chat history
  or the implementor's reasoning. It hunts hard, then reports only findings it can
  anchor to evidence and a spec rule. "No findings" is a valid, common result.

The Elephant takes the Critic's findings and makes the call: merge, or rework.
Rework is a *new* dispatch with a sharper briefing, never continued work in the
context that already went wrong — capped at two cycles before it comes to you.

Throughout, the git guardrails hold regardless of what any agent asks for: no
force-push, no history rewrite, no deleted protected branches, no skipped hooks.
Commits are conventional and atomic; `/pipeline-core:conventional-commit` proposes a
message from your staged diff, but never commits for you.

## 5. Decide the exceptions

You are not in the loop for every task — by design. The Elephant pulls you back in
only for the judgment classes that can't be delegated: a blocker, more than two
rework cycles on one task, anything irreversible or externally visible or costly, or
a spec-versus-reality conflict. High-stakes work (live systems, architecture or
guardrail changes) also gets a **human sign-off** on the finished result — the work
can merge and sit at a "🟡 awaiting your verification" status without blocking the
rest, but it isn't "done" until you accept it.

Communication is outcome-first: findings, gates, incidents, results — not a
play-by-play of every dispatch.

## 6. Close the session

When the block is done, you run **`/pipeline-core:close-block`**. The close ritual is
where the session's truth gets persisted. It:

- runs the verify gate one last time and records the machine evidence;
- runs the drift checks — handover freshness, CLAUDE.md length, stale worktrees;
- updates the **handover file** (the single source of "current state / open / next");
- appends a telemetry line (cost and first-pass metrics);
- writes a **mandatory self-retro** — at least one concrete improvement, or an
  explicit "nothing"; silence is not an option;
- makes the final commit (and pushes, if your autonomy preset stands that approval).

## Between sessions

The handover file — not the chat — is the record of truth. The next session
bootstraps straight from it, on any machine. That's why you close deliberately at a
boundary rather than letting a session drift into auto-compaction: a clean handover
makes the next start a thirty-second operation. One topic per session; a topic
switch is a new session, not a longer one.

## What you actually touch

| Moment | You do | Command |
|---|---|---|
| Start | open the session, run the check, pick the profile | `/pipeline-core:pipeline-start` |
| Intent | describe the outcome | — |
| Plan gate | approve / change / reject | — |
| Run | nothing — the pipeline works | — |
| Exceptions | decide escalations, sign off high-stakes | — |
| Close | run the close ritual | `/pipeline-core:close-block` |

Everything else — spec authoring, dispatch, gates, review, the merge decision — is
the pipeline's job, not yours.

## See also

- [`SETUP.md`](../SETUP.md) — get set up (prerequisites, `node setup.mjs`, binding
  the plugin).
- [`docs/overview.md`](overview.md) — the roles and concepts in one place.
- [`docs/migration.md`](migration.md) — bringing the pipeline into an existing
  project.
- [`docs/operating-model.md`](operating-model.md) — the full normative detail behind
  every step above.
- [`docs/design-decisions.md`](design-decisions.md) — why the model is shaped this
  way.

---

# Nutzung — ein Tag in der Pipeline

Du hast `node setup.mjs` ausgeführt, das Plugin gebunden und eine Session geöffnet
(falls nicht: fang mit [`SETUP.md`](../SETUP.md) an). So sieht eine gewöhnliche
Arbeitssession von innen aus: eine Absicht rein, geprüfte und committete Arbeit
raus. Das meiste läuft ohne dich — die wenigen Momente, die einen Menschen brauchen,
sind ausdrücklich benannt.

## Der Ablauf einer Session

1. **Start** — Claude-Code-Session öffnen, dann den Bootstrap-Check ausführen.
2. **Absicht nennen** — eine Absicht in klarer Sprache.
3. **Plan freigeben** — der Elephant formt aus der Absicht eine Spec und wartet auf
   dein Go. *(dein Gate)*
4. **Laufen lassen** — der Elephant dispatcht je Aufgabe einen Goldfish;
   deterministische Gates und ein Critic übernehmen die Prüfung.
5. **Ausnahmen entscheiden** — du bist nur bei Eskalationen und Freigaben mit hohen
   Stakes gefragt. *(dein Gate)*
6. **Abschließen** — du startest das Close-Ritual; der Stand wird persistiert, die
   Session endet sauber.

Der Rest dieser Seite geht jeden Schritt mit den konkreten Kommandos durch, die du
anfasst.

## 1. Session starten

Öffne Claude Code in deinem Projekt. Beim Sitzungsstart blendet ein
`SessionStart`-Hook eine Erinnerungszeile ein — *`/pipeline-core:pipeline-start` vor
jeder Arbeit ausführen* (plus einen Update-Hinweis, falls dein installiertes Plugin
hinter dem Marketplace-Remote liegt). Die Erinnerung prüft selbst nichts; du führst
`/pipeline-core:pipeline-start` aus, und dieser Skill erledigt den Bootstrap (nach
einem `/clear` oder einem Plugin-Refresh führst du ihn von Hand erneut aus). Er prüft,
ob das Regelwerk geladen ist und sich mit dem Marketplace-Remote deckt, ob deine
`.claude/pipeline.json`-Kalibrierung vorliegt, ob die Handover-Datei aktuell ist und ob
das verify-Gate läuft. Danach stellt er dir **eine** Frage — in welchem
Kosten-/Qualitätsprofil diese Session laufen soll — und zeigt dir die exakten
`/model`- und `/effort`-Kommandos zum Einfügen.

Bevor der Check seine Bestätigungszeile ausgibt, beginnt nichts. Diese Zeile ist der
prüfbare Beleg, dass die Session gebootstrappt wurde; eine Session ohne sie gilt als
nicht gebootstrappt. Ist das Regelwerk veraltet oder die Kalibrierung nicht
vorhanden, sagt der Check das und nennt die Lösung, statt stillschweigend
weiterzumachen.

## 2. Absicht nennen

Gib dem Elephant deine Absicht in klarer Sprache — „Rate-Limiting für die
öffentliche API", keine Aufgabenzerlegung. Der Elephant ist der langlebige
Orchestrator: Wo die Absicht mehrdeutig ist, befragt er dich (und er ist darauf
ausgelegt, zu widersprechen statt bloß zuzustimmen) und formt das Ergebnis dann in
eine **Spec mit prüfbaren Akzeptanzkriterien**. Nichts ist „fertig" nach Gefühl —
jede Aufgabe bekommt eine Definition of Done, die ein Skript oder ein Mensch
tatsächlich prüfen kann.

Das ist die **No-Code-Phase**: keine Implementierung, bevor die Spec steht. Bei
allem jenseits eines trivialen Fixes durchläuft die Spec zuerst einen
**Readiness-Check** — ein frischer Subagent mit reinem Lesezugriff liest nur die
Spec und fragt: „Ließe sich das allein aus dem Dokument korrekt umsetzen?" Lücken
wandern zurück ins Dokument, bevor eine Zeile Code entsteht.

## 3. Plan freigeben — dein Gate

Vor der ersten Implementierungsaufgabe legt dir der Elephant den Plan vor: eine
kurze, lesbare Produkt-Begründung (Was, Warum, Scope, Nicht-Ziele, Risiken) — an
dich geliefert, nicht als Dateipfad zum Selbersuchen. Dann wartet er auf deine
ausdrückliche Freigabe und dispatcht nichts, bevor sie eintrifft.

Das ist das wichtigste menschliche Gate. Es ist ein Halt am *entworfenen Plan*, vor
jeder teuren Fehl-Implementierung — die günstigste Stelle, um eine falsche Richtung
abzufangen. Freigeben, eine Änderung verlangen oder ablehnen; der Elephant handelt
nur auf ein klares Go.

## 4. Laufen lassen

Nach deiner Freigabe zerlegt der Elephant die Arbeit in kleine, unabhängige Aufgaben
und dispatcht für jede einen **Goldfish** — einen Subagenten mit frischem Kontext,
der genau eine Aufgabe über ein in sich geschlossenes Briefing bekommt (Ziel,
Kontext-Dateien, DoD-Checks, Verbote, Stop-Bedingungen). Ein Goldfish erbt nie den
Chat-Verlauf und wird nie Schritt für Schritt mikromanagt; unabhängige Aufgaben
laufen parallel (typisch eine Handvoll gleichzeitig, auf getrennten Dateien oder
isolierten Worktrees).

Jedes Ergebnis durchläuft das **zweistufige Review**:

- **Zuerst die deterministischen Gates** — Format, Lint, Typecheck, Tests, Build
  (und optional ein Security-Scan) laufen *vor* jedem Modell-Urteil. „Fertig" heißt
  bei einem Goldfish: ein maschinell geschriebenes Log, der exakte Befehl und dessen
  Exit-Code — nie die Behauptung, etwas „sollte funktionieren". Rote Gates gehen als
  frischer Versuch zurück.
- **Dann ein Critic** — ein unabhängiger Prüfer mit reinem Lesezugriff und frischem
  Kontext. Er sieht Spec, Diff, Guardrails und Nachweis — nie den Chat-Verlauf oder
  die Begründung des Implementierenden. Er sucht scharf und meldet dann nur Befunde,
  die er an Nachweis und eine Spec-Regel binden kann. „Keine Befunde" ist ein
  gültiges, häufiges Ergebnis.

Der Elephant nimmt die Befunde des Critic und entscheidet: mergen oder nacharbeiten.
Nacharbeit ist ein *neuer* Dispatch mit schärferem Briefing, nie weitergeführte
Arbeit im bereits verunglückten Kontext — gedeckelt auf zwei Runden, dann landet es
bei dir.

Durchgängig halten die git-Guardrails, egal worum ein Agent bittet: kein
Force-Push, kein History-Rewrite, keine gelöschten geschützten Branches, keine
übersprungenen Hooks. Commits sind konventionell und atomar;
`/pipeline-core:conventional-commit` schlägt aus deinem gestagten Diff eine Nachricht
vor, committet aber nie für dich.

## 5. Ausnahmen entscheiden

Du bist bewusst nicht bei jeder Aufgabe im Spiel. Der Elephant holt dich nur für die
nicht delegierbaren Urteilsklassen zurück: einen Blocker, mehr als zwei
Nacharbeitsrunden an einer Aufgabe, alles Irreversible, nach außen Wirkende oder
Kostenpflichtige, oder einen Widerspruch zwischen Spec und Realität. Arbeit mit
hohen Stakes (Live-Systeme, Architektur- oder Guardrail-Änderungen) bekommt
zusätzlich eine **menschliche Abnahme** des fertigen Ergebnisses — die Arbeit darf
mergen und auf dem Status „🟡 wartet auf deine Verifikation" liegen, ohne den Rest zu
blockieren, ist aber erst „fertig", wenn du sie abnimmst.

Die Kommunikation ist ergebnisorientiert: Befunde, Gates, Vorfälle, Ergebnisse — keine
Schritt-für-Schritt-Erzählung jedes Dispatches.

## 6. Session abschließen

Ist der Block fertig, startest du **`/pipeline-core:close-block`**. Im Close-Ritual
wird der Stand der Session festgehalten. Es:

- lässt das verify-Gate ein letztes Mal laufen und hält den maschinellen Nachweis
  fest;
- führt die Drift-Checks aus — Handover-Aktualität, CLAUDE.md-Länge, verwaiste
  Worktrees;
- aktualisiert die **Handover-Datei** (die einzige Quelle für „aktueller Stand /
  offen / nächstes");
- hängt eine Telemetrie-Zeile an (Kosten- und First-Pass-Kennzahlen);
- schreibt ein **verpflichtendes Selbst-Retro** — mindestens ein konkretes
  Verbesserungs-Item oder ein ausdrückliches „nichts"; Schweigen ist keine Option;
- erstellt den finalen Commit (und pusht, sofern dein Autonomie-Preset den Push
  dauerhaft deckt).

## Zwischen den Sessions

Die Handover-Datei — nicht der Chat — ist die maßgebliche Quelle. Die nächste
Session bootstrappt direkt aus ihr, auf jeder Maschine. Genau deshalb schließt du
bewusst an einer Grenze ab, statt eine Session in die automatische Kompaktierung
driften zu lassen: Ein sauberes Handover macht den nächsten Start zur
30-Sekunden-Sache. Ein Thema pro Session; ein Themenwechsel ist eine neue Session,
keine längere.

## Was du tatsächlich anfasst

| Moment | Du tust | Kommando |
|---|---|---|
| Start | Session öffnen, Check ausführen, Profil wählen | `/pipeline-core:pipeline-start` |
| Absicht | das Ergebnis beschreiben | — |
| Plan-Gate | freigeben / ändern / ablehnen | — |
| Lauf | nichts — die Pipeline arbeitet | — |
| Ausnahmen | Eskalationen entscheiden, hohe Stakes abnehmen | — |
| Abschluss | das Close-Ritual starten | `/pipeline-core:close-block` |

Alles andere — Spec-Erstellung, Dispatch, Gates, Review, die Merge-Entscheidung —
ist Sache der Pipeline, nicht deine.

## Siehe auch

- [`SETUP.md`](../SETUP.md) — Einrichtung (Voraussetzungen, `node setup.mjs`, Plugin
  binden).
- [`docs/overview.md`](overview.md) — Rollen und Konzepte an einem Ort.
- [`docs/migration.md`](migration.md) — die Pipeline in ein bestehendes Projekt
  holen.
- [`docs/operating-model.md`](operating-model.md) — die vollständige normative Tiefe
  hinter jedem Schritt oben.
- [`docs/design-decisions.md`](design-decisions.md) — warum das Modell so geformt
  ist.

---

Die deutsche Fassung ist eine Übersetzung des englischen Originals.
