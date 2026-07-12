# The model in one read

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

This is the middle layer. The [README](../README.md) tells you what the
Agent-Pipeline is in a minute; [`docs/operating-model.md`](operating-model.md)
is the full normative rulebook. This page sits between them: enough to
understand how the model actually works before you open the rulebook, and
enough to decide whether it fits how you build.

## From intent to closed change

Every change moves through the same shape. Most steps scale with how much is at
stake (see "How much ceremony" below), but the shape is constant.

1. **Intent.** You bring a need — feature, fix, refactor — to the Elephant, the
   long-lived orchestrator session.

2. **Triage.** The Elephant classifies the work: a *rigor level* (0, 1, 2)
   setting how much specification it earns, and a *risk class* (low / medium /
   high) setting how hard it gets reviewed — decided up front and written down.

3. **Interview → spec.** For anything above a trivial fix, the Elephant
   interviews you into a spec: what, why, explicit non-goals, and
   **acceptance criteria** — the checkable conditions that define "done"
   (mandatory as checkable criteria from rigor level 1 up). No implementation
   yet; the AI's first design proposal is how you find out whether the system
   was actually understood.

4. **Readiness check.** Before a line is written, a fresh, read-only Goldfish
   reads only the spec and its referenced files — no chat history — and tries to
   explain the change back and find the gaps. A spec a fresh context can't
   implement from alone is not ready; gaps go back into the doc and a *new*
   fresh context checks again.

5. **PO gate.** For work that matters, you sign off on the plan — a short
   product rationale (what, why, scope, non-goals, risks, alternatives) —
   before any implementation is dispatched. This front-end human gate catches a
   wrong direction while it's still cheap.

6. **Dispatch.** The Elephant hands the task to a Goldfish through a fixed
   briefing — goal, exact context files, Definition-of-Done checks,
   prohibitions, stop conditions, model/effort for the run. The briefing is the
   only channel; a Goldfish knows nothing else.

7. **Deterministic gates.** The Goldfish implements, then runs the project's one
   `verify` command: format → lint → typecheck → tests → build, plus an
   optional security scan. The result is a **machine-written evidence
   artifact** — command, output, exit code. "Done" without that artifact
   doesn't count.

8. **Critic.** Only what passes the gates can reach the Critic: an independent,
   read-only reviewer in a fresh context that never sees the chat, the
   reasoning, or the implementer's own report. It gets spec, diff, guardrails,
   and evidence, builds its own view, and reports findings. Whether a Critic
   runs, and on which model, is set by risk class; purely mechanical diffs skip
   it entirely.

9. **Gate decision.** The Elephant disposes of every finding — fix, reject with
   a written reason, or escalate. This decision is the Elephant's alone; Critic
   findings are input, never a verdict it rubber-stamps.

10. **Merge and human gate.** The change merges, docs sync, and — where the
    stakes call for it (live systems, irreversible or costly actions,
    architecture or guardrail changes) — you give the final sign-off. "Delivered"
    (gates green, Critic passed) and "accepted" (you signed off) are
    deliberately different words.

11. **Close.** The block ends with a ritual, not a fade-out: the handover file
    is brought current, a short retro is written (one concrete improvement or an
    explicit "nothing" — silence is not allowed), and the durable artifacts
    (spec, acceptance criteria, result) are archived. The next session
    bootstraps from the handover in seconds.

## How much ceremony: rigor and risk

The process isn't one-size-fits-all — that's what kills adoption. Two dials
calibrate it:

- **Rigor level** decides how much specification a task earns. Level 0 is a
  fast path for genuine small fixes (a couple of files, trivially revertible,
  no touch to architecture, schema, public APIs, tests, guardrails,
  dependencies, or the security surface) — a short brief instead of a full
  spec. Level 1 gets a delta-spec; level 2 gets a full, maintained spec. Two
  invariants never scale away: the `verify` gate and the machine evidence are
  mandatory at *every* level.

- **Risk class** decides how hard the review is, independent of size. A
  three-line change to a guardrail hook is still a guardrail change and gets
  the strongest reviewer regardless of how small it is. Size buys a lighter
  spec; it never buys you out of review.

A hosted project's own architecture guidelines feed the same dial: a diff
touching an architecture principle under
[`governance/examples/`](../governance/examples/README.md) counts as risk
class high and forces the mandatory Critic, independent of diff size — see the
[worked example](../governance/examples/worked-example.md) for how a guideline
becomes an enforced policy end to end.

## The four roles, a little deeper

- **Product Owner (you).** You own intent, priority, and the two human gates —
  plan sign-off up front, completion sign-off at the end. You never delegate
  judgment down: architecture trade-offs, ambiguity, and anything irreversible
  or costly stay with you. The pipeline's job is to make each of those
  decisions cheap and well-prepared, not to make them for you.

- **Elephant — the orchestrator.** One long-lived session that turns intent
  into specs, decomposes work into independent Goldfish-sized tasks, dispatches
  them, decides the gate, and keeps the handover current. It writes no
  production code — that keeps it lean and unbiased for the call it has to
  make. "The Elephant is the document, not the session": everything that
  matters lives in files, so a fresh session can pick up where a dead one left
  off.

- **Goldfish — the implementer.** A fresh context doing exactly one
  clearly-bounded task. It follows the plan, doesn't redesign it. It delivers
  with machine evidence or stops and reports honestly — nothing in between, and
  a clean stop is a first-class result. It never touches the tests that gate
  its own work, and has no memory across tasks by design: the pipeline learns
  through its versioned rules, not through agent memory.

- **Critic — the independent reviewer.** A read-only, fresh context whose whole
  reason to exist is neutralizing the bias of whoever wrote the code. It
  receives references only — spec, diff, guardrails, evidence — and constructs
  its own view; framing it ("this should be fine, just check X") counts as a
  defect in the dispatch. It searches hard on the working assumption the
  artifact is flawed, then reports only findings that carry evidence, an anchor
  in the spec or a guardrail, and a concrete consequence. "No findings" is a
  valid, welcome result.

## Two-stage review: machines before judgment

The review is deliberately two-stage, and the order matters: **deterministic
before probabilistic.**

- **Stage 1 — the gates.** One `verify` script per project runs the same fixed
  chain everywhere — the Goldfish runs it, the stop hook runs it, CI runs it. It
  is binary and blocking: green or not green, no "warn-only" that quietly rots.
  Every gate also documents what it does *not* check, so green never
  overclaims. The output is a machine-written artifact, never model prose.

- **Stage 2 — the Critic.** Only what survives the gates reaches LLM judgment.
  An expensive reviewer should never spend attention on something a test could
  have caught; the Critic is explicitly forbidden from flagging anything the
  gates already enforce. Machines handle what machines can decide; the Critic
  adds only the judgment they cannot.

## The escalation ladder

Failure has a fixed path upward, with hard stop criteria at each rung so
nothing grinds indefinitely:

1. **Goldfish.** A red `verify` gets at most two attempts at the same cause.
   The second failure ends the series — no third variation. The Goldfish stops
   and reports the failure state honestly.

2. **Critic.** Findings only. No dialogue with the implementer, no fixes of its
   own. Reports once, to the Elephant.

3. **Elephant.** Before re-dispatching or reaching for a bigger model, it
   debugs the *harness* first — was the briefing complete, the context clean,
   the tools right-sized, the hooks wired? Most agent failures are
   configuration failures. Rework is a *new* dispatch with a fresh context and
   a sharpened brief, never continued work in the failed one — capped at two
   cycles per task.

4. **Product Owner.** Blockers, more than two rework cycles, spec-versus-reality
   conflicts, and anything irreversible, externally visible, or costly escalate
   to you. These are exactly the judgments that aren't delegable.

## The close ritual

A block doesn't end when the code merges; it ends when the record is
trustworthy again. Close brings the single handover file current, writes the
retro (the session's own author, not a question thrown at you), archives the
three durable artifacts, and records a short telemetry line. The discipline
behind it: a session is a cache over persisted files, so what isn't written
down doesn't exist.

## What this is, and isn't

This is a **Tier 2** review system: a structured, two-stage self- and
Critic-review layer built into the day-to-day workflow (deterministic gates,
then an independent LLM reviewer with a fresh context). It is not a certified
or enterprise-grade assurance system, and doesn't claim to be one. See
[`docs/operating-model.md`](operating-model.md), "Enterprise expansion paths",
for the documented, optional upgrade paths (a scheduled audit pass, a semantic
pre-execution gate) beyond what this repo ships by default.

## Where things live

- [`docs/operating-model.md`](operating-model.md) — the full normative model:
  roles, SDLC, review system, session lifecycle, handover, feedback loop,
  project calibration. When this overview and the operating model disagree, the
  operating model wins.
- [`docs/design-decisions.md`](design-decisions.md) — the *why* behind each
  choice, in plain language.
- [`roles/`](../roles/) — the standalone role contracts (`elephant.md`,
  `goldfish.md`, `critic.md`) you dispatch against.
- [`guardrails/`](../guardrails/) — the provable rules: git, security, quality
  gates, token budget, and the global baseline.
- [`README.md`](../README.md) and [`SETUP.md`](../SETUP.md) — what the pipeline
  is, and how to adopt it.
- [`docs/deploy/README.md`](deploy/README.md) — the optional Release/Promotion
  phase: an adapter-based tail phase (test → prod, with mandatory evidence and
  a deploy log) that a project opts into by declaring a `release` section in
  its manifest; zero added behavior if you never touch it.
- Day-to-day operation is covered in [`docs/usage.md`](usage.md); bringing an
  existing project under the pipeline in [`docs/migration.md`](migration.md); and
  the boundary between what is portable and what is Claude-Code-specific in
  [`docs/runtime-boundary.md`](runtime-boundary.md).

---

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

# Das Modell in einem Durchgang

Dies ist die mittlere Ebene. Die [README](../README.md) erklärt in einer Minute,
was die Agent-Pipeline ist; [`docs/operating-model.md`](operating-model.md) ist
das vollständige, verbindliche Regelwerk. Diese Seite liegt dazwischen: genug,
um zu verstehen, wie das Modell tatsächlich arbeitet, bevor du das Regelwerk
öffnest — und genug, um zu entscheiden, ob es zu deiner Arbeitsweise passt.

## Von der Absicht zur abgeschlossenen Änderung

Jede Änderung nimmt denselben Weg. Die meisten Schritte skalieren damit, was auf
dem Spiel steht (siehe „Wie viel Formalität" unten), aber der Ablauf bleibt
gleich.

1. **Absicht.** Du bringst einen Bedarf — ein Feature, einen Fix, ein
   Refactoring — zum Elephant, der langlebigen Orchestrator-Sitzung.

2. **Triage.** Der Elephant stuft die Arbeit ein: eine *Rigor-Stufe* (0, 1, 2),
   die festlegt, wie viel Spezifikation eine Aufgabe verdient, und eine
   *Risikoklasse* (niedrig / mittel / hoch), die festlegt, wie streng geprüft
   wird. Ein einzeiliger Tippfehler-Fix und eine Änderung an einem
   Authentifizierungspfad verdienen nicht denselben Prozess; in der Triage wird
   das entschieden — vorab und schriftlich.

3. **Interview → Spec.** Für alles jenseits eines trivialen Fixes führt der
   Elephant dich per Interview zu einer Spec: was die Änderung ist, warum, was
   ausdrücklich außerhalb des Scopes liegt, und eine Reihe von
   **Akzeptanzkriterien** — die konkreten, prüfbaren Bedingungen, die „fertig"
   definieren (ab Rigor-Stufe 1 als prüfbare Akzeptanzkriterien). Es wird noch nichts
   implementiert; die KI schlägt den ersten Entwurf vor — so zeigt sich, ob das
   System wirklich verstanden wurde.

4. **Readiness-Check.** Bevor eine Zeile geschrieben wird, liest ein frischer
   Goldfish mit reinem Lesezugriff ausschließlich die Spec und die dort
   referenzierten Dateien — keinen Chat-Verlauf — und versucht, die Änderung zu
   erklären und die Lücken zu finden. Kann ein frischer Kontext allein aus der
   Spec nicht implementieren, ist die Spec nicht reif. Lücken wandern zurück ins
   Dokument; danach prüft ein *neuer* frischer Kontext erneut.

5. **PO-Gate.** Bei Arbeit, auf die es ankommt, gibst du den Plan frei — eine
   kurze Produkt-Begründung (Was, Warum, Scope, Nicht-Ziele, Risiken,
   Alternativen) — bevor irgendeine Umsetzung beauftragt wird. Das ist das
   vordere menschliche Gate: Es fängt eine falsche Richtung ab, solange sie noch
   billig ist.

6. **Dispatch.** Der Elephant übergibt die Aufgabe an einen Goldfish über ein
   festes Briefing: das Ziel, die genauen Kontext-Dateien, die
   Definition-of-Done-Checks, die Verbote, die Stop-Bedingungen und Modell/Effort
   für den Lauf. Das Briefing ist der einzige Kanal — ein Goldfish weiß sonst
   nichts.

7. **Deterministische Gates.** Der Goldfish implementiert und führt dann den
   einen `verify`-Befehl des Projekts aus: eine feste Kette aus Format → Lint →
   Typecheck → Tests → Build, dazu ein optionaler Security-Scan. Das Ergebnis ist
   ein **maschinell geschriebenes Nachweis-Artefakt** — der tatsächliche Befehl,
   seine Ausgabe, sein Exit-Code. Ein „fertig" ohne dieses Artefakt zählt nicht.

8. **Critic.** Was die Gates besteht — und nur das — kann den Critic erreichen:
   einen unabhängigen Prüfer mit reinem Lesezugriff in frischem Kontext, der
   weder den Chat noch die Begründungen noch den eigenen Bericht des
   Implementierers je zu sehen bekommt. Er erhält die Spec, den Diff, die
   Guardrails und den Nachweis, bildet sich sein eigenes Urteil und meldet
   Befunde. Ob ein Critic läuft und auf welchem Modell, entscheidet die
   Risikoklasse; rein mechanische Diffs überspringen ihn ganz.

9. **Gate-Entscheid.** Der Elephant disponiert jeden Befund — beheben lassen, mit
   schriftlicher Begründung ablehnen oder eskalieren. Diese Entscheidung liegt
   allein beim Elephant; Critic-Befunde sind Eingabe, nie ein Urteil, das er
   blind abnickt.

10. **Merge und menschliches Gate.** Die Änderung wird gemergt, die Doku zieht
    nach, und — wo die Stakes es verlangen (Live-Systeme, irreversible oder
    kostenpflichtige Aktionen, Architektur- oder Guardrail-Änderungen) — erteilst
    du die finale Freigabe für das fertige Ergebnis. „Geliefert" (Gates grün,
    Critic bestanden) und „abgenommen" (von dir freigegeben) sind bewusst zwei
    verschiedene Wörter.

11. **Abschluss.** Der Block endet mit einem Ritual, nicht mit einem Ausklang:
    Die Handover-Datei wird auf Stand gebracht, ein kurzes Retro wird geschrieben
    (eine konkrete Verbesserung oder ein ausdrückliches „nichts" — Schweigen ist
    nicht erlaubt), und die dauerhaften Artefakte (Spec, Akzeptanzkriterien,
    Ergebnis) werden archiviert. Die nächste Sitzung startet in Sekunden aus dem
    Handover.

## Wie viel Formalität: Rigor und Risiko

Der Prozess behandelt nicht jede Aufgabe gleich — genau das würde die Übernahme
abwürgen. Zwei Stellschrauben kalibrieren ihn:

- **Die Rigor-Stufe** entscheidet, wie viel Spezifikation eine Aufgabe verdient.
  Stufe 0 ist ein Schnellweg für echte Kleinigkeiten (ein paar Dateien, trivial
  rückrollbar, kein Eingriff in Architektur, Schema, öffentliche APIs, Tests,
  Guardrails, Abhängigkeiten oder die Security-Oberfläche) — ein kurzes Briefing
  statt einer vollen Spec. Stufe 1 bekommt eine Delta-Spec, Stufe 2 eine
  vollständige, gepflegte Spec. Die zwei Invarianten, die nie wegskaliert werden:
  Das `verify`-Gate und der maschinelle Nachweis sind auf *jeder* Stufe Pflicht.

- **Die Risikoklasse** entscheidet, wie streng geprüft wird — unabhängig von der
  Größe. Eine dreizeilige Änderung an einem Guardrail-Hook ist trotzdem eine
  Guardrail-Änderung und bekommt den stärksten Prüfer, egal wie klein sie ist.
  Größe erkauft dir eine leichtere Spec; aus dem Review kauft sie dich nie frei.

Die eigenen Architekturvorgaben eines betreuten Projekts bedienen dieselbe
Stellschraube: Ein Diff, der einen Architektur-Grundsatz unter
[`governance/examples/`](../governance/examples/README.md) berührt, zählt als
Risikoklasse hoch und erzwingt den Pflicht-Critic — unabhängig davon, wie klein
der Diff ist. Wie aus einer Guideline eine erzwungene Policy wird, zeigt das
[Worked Example](../governance/examples/worked-example.md) komplett
durchgespielt.

## Die vier Rollen, etwas genauer

- **Product Owner (du).** Dir gehören Absicht, Priorität und die zwei
  menschlichen Gates — die Plan-Freigabe vorn und die Abnahme am Ende. Dein
  Urteil gibst du nie nach unten ab: Architektur-Abwägungen, Mehrdeutigkeit und
  alles Irreversible oder Kostenpflichtige bleiben bei dir. Die Pipeline sorgt
  dafür, dass jede dieser Entscheidungen billig und gut vorbereitet ist — sie
  nimmt sie dir nicht ab.

- **Elephant — der Orchestrator.** Eine langlebige Sitzung, die aus Absicht Specs
  macht, Arbeit in unabhängige, Goldfish-große Aufgaben zerlegt, sie beauftragt,
  das Gate entscheidet und das Handover aktuell hält. Er schreibt keinen
  Produktionscode — das hält ihn schlank und unvoreingenommen für die
  Entscheidung, die er treffen muss. Entscheidend: „Der Elephant ist das
  Dokument, nicht die Sitzung" — alles Wesentliche liegt in Dateien, sodass eine
  frische Sitzung dort weitermacht, wo eine abgestürzte aufgehört hat.

- **Goldfish — der Implementierer.** Ein frischer Kontext, der genau eine klar
  umrissene Aufgabe erledigt. Er folgt dem Plan, er entwirft ihn nicht neu. Er
  liefert mit maschinellem Nachweis oder er stoppt und meldet ehrlich —
  dazwischen gibt es nichts, und ein sauberer Stopp ist ein vollwertiges
  Ergebnis. Er fasst nie die Tests an, die seine eigene Arbeit prüfen, und er hat
  bewusst kein Gedächtnis über Aufgaben hinweg: Die Pipeline lernt über ihr
  versioniertes Regelwerk, nicht über Agenten-Gedächtnis.

- **Critic — der unabhängige Prüfer.** Ein frischer Kontext mit reinem
  Lesezugriff, dessen ganzer Daseinszweck es ist, die Voreingenommenheit dessen
  auszuhebeln, der den Code geschrieben hat. Er bekommt nur Verweise — Spec,
  Diff, Guardrails, Nachweis — und baut sich daraus sein eigenes Urteil; ihn zu
  rahmen („das passt schon, prüf nur X") gilt als Mangel im Dispatch. Er sucht
  scharf unter der Arbeitsannahme, das Artefakt sei fehlerhaft, und meldet dann
  nur Befunde, die einen Nachweis, einen Anker in Spec oder Guardrail und eine
  konkrete Konsequenz tragen. „Keine Befunde" ist ein gültiges, erwünschtes
  Ergebnis.

## Zweistufiges Review: Maschinen vor Urteil

Das Review ist bewusst zweistufig, und die Reihenfolge zählt: **deterministisch
vor probabilistisch.**

- **Stufe 1 — die Gates.** Ein `verify`-Skript pro Projekt fährt überall dieselbe
  feste Kette — der Goldfish fährt sie, der Stop-Hook fährt sie, die CI fährt
  sie. Sie ist binär und blockierend: grün oder nicht grün, kein „warn-only", das
  leise verrottet. Jedes Gate dokumentiert außerdem, was es *nicht* prüft, damit
  Grün nie zu viel verspricht. Die Ausgabe ist ein maschinell geschriebenes
  Artefakt, nie Modell-Prosa.

- **Stufe 2 — der Critic.** Nur was die Gates übersteht, erreicht das
  LLM-Urteil. Das ist der ganze Sinn: Ein teurer Prüfer soll seine Aufmerksamkeit
  nie an etwas verschwenden, das ein Test hätte fangen können — und dem Critic
  ist ausdrücklich verboten, etwas zu beanstanden, das die Gates ohnehin
  erzwingen. Maschinen erledigen, was Maschinen entscheiden können; der Critic
  ergänzt nur das Urteil, das sie nicht leisten.

## Die Eskalationsleiter

Ein Fehler hat einen festen Weg nach oben, mit harten Abbruchkriterien auf jeder
Sprosse, damit nichts endlos festläuft:

1. **Goldfish.** Ein rotes `verify` bekommt höchstens zwei Versuche an derselben
   Ursache. Der zweite Fehlschlag beendet die Serie — keine dritte Variante. Der
   Goldfish stoppt und meldet den Fehlstand ehrlich.

2. **Critic.** Nur Befunde. Kein Dialog mit dem Implementierer, keine eigenen
   Fixes. Er meldet einmal, an den Elephant.

3. **Elephant.** Bevor er neu beauftragt oder zu einem größeren Modell greift,
   debuggt er zuerst den *Harness* — war das Briefing vollständig, der Kontext
   sauber, die Werkzeuge passend zugeschnitten, die Hooks verdrahtet? Die meisten
   Agenten-Fehler sind Konfigurationsfehler. Nacharbeit ist ein *neuer* Dispatch
   mit frischem Kontext und geschärftem Briefing, nie Weiterarbeit im
   gescheiterten — gedeckelt auf zwei Zyklen je Aufgabe.

4. **Product Owner.** Blocker, mehr als zwei Nacharbeitszyklen, Konflikte
   zwischen Spec und Realität und alles Irreversible, nach außen Wirksame oder
   Kostenpflichtige eskalieren zu dir. Das sind genau die Urteile, die sich nicht
   delegieren lassen.

## Das Abschluss-Ritual

Ein Block endet nicht, wenn der Code gemergt ist; er endet, wenn der Stand wieder
verlässlich ist. Der Abschluss bringt die eine Handover-Datei auf Stand, schreibt
das Retro (verfasst von der Sitzung selbst, nicht als Frage an dich), archiviert
die drei dauerhaften Artefakte und hält eine kurze Telemetrie-Zeile fest. Die
Disziplin dahinter ist einfach: Eine Sitzung ist nur ein Zwischenspeicher auf
persistierten Dateien — was nicht festgehalten ist, existiert nicht.

## Was das ist – und was nicht

Das hier ist ein **Tier-2**-Review-System: eine strukturierte, zweistufige
Self- und Critic-Review-Schicht, fest im Alltagsworkflow verankert
(deterministische Gates, dann ein unabhängiger LLM-Prüfer mit frischem
Kontext). Es ist kein zertifiziertes oder Enterprise-taugliches
Assurance-System und erhebt diesen Anspruch auch nicht. Siehe
[`docs/operating-model.md`](operating-model.md), Abschnitt
„Enterprise-Ausbaupfade", für die dokumentierten, optionalen Ausbaustufen (ein
planmäßiger Audit-Durchlauf, ein semantisches Pre-Execution-Gate) über das
hinaus, was dieses Repo standardmäßig mitbringt.

## Wo was liegt

- [`docs/operating-model.md`](operating-model.md) — das vollständige,
  verbindliche Modell: Rollen, SDLC, Review-System, Session-Lifecycle, Handover,
  Feedback-Loop, Projekt-Kalibrierung. Bei Widerspruch zwischen dieser Übersicht
  und dem Operating Model gewinnt das Operating Model.
- [`docs/design-decisions.md`](design-decisions.md) — das *Warum* hinter jeder
  Entscheidung, in einfacher Sprache.
- [`roles/`](../roles/) — die eigenständigen Rollen-Verträge (`elephant.md`,
  `goldfish.md`, `critic.md`) hinter den drei Agenten-Rollen.
- [`guardrails/`](../guardrails/) — die beweisbaren Regeln: git, Security,
  Quality-Gates, Token-Budget und die globale Grundlinie.
- [`README.md`](../README.md) und [`SETUP.md`](../SETUP.md) — was die Pipeline
  ist und wie du sie übernimmst.
- [`docs/deploy/README.md`](deploy/README.md) — die optionale
  Release/Promotion-Phase: eine adapter-basierte Tail-Phase (Test → Prod, mit
  Pflicht-Nachweis und Deploy-Log), in die ein Projekt einsteigt, indem es
  einen `release`-Abschnitt im Manifest erklärt; ohne diesen Abschnitt keine
  zusätzliche Wirkung.
- Der Alltagsbetrieb steht in [`docs/usage.md`](usage.md); wie du ein bestehendes
  Projekt unter die Pipeline bringst, in [`docs/migration.md`](migration.md); und
  die Grenze zwischen dem, was übertragbar ist, und dem, was
  Claude-Code-spezifisch ist, in [`docs/runtime-boundary.md`](runtime-boundary.md).

---

Die deutsche Fassung ist eine Übersetzung des englischen Originals.
