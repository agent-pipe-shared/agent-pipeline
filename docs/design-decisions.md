# Design decisions — the "why" behind the method

This method rests on a few long-lived foundational decisions. This document sums
them up in plain language: it explains the *why*. The binding *how* lives in the
rulesets (`policies/`, `guardrails/`, `roles/`).

## Separated roles

The model is carried by a **Product Owner** — you, the human gate — plus three
deliberately separated agent roles:

- **Elephant — the orchestrator.** The long-lived session. Out of the
  conversation with the Product Owner it shapes a specification, breaks it into
  small tasks, dispatches them, and makes the final go/no-go call.
- **Goldfish — the implementor.** A fresh, tightly-scoped context that carries
  out exactly one task and hands back only with evidence.
- **Critic — the independent reviewer.** A read-only instance with a fresh
  context that knows neither the chat history nor the reasoning behind the
  implementation.

The Product Owner keeps the two human gates — sign-off on the plan up front and
sign-off on the result at the end — and never hands that judgment down.

The separation is deliberate: whoever implements does not review their own work.
A reviewer who has already heard the rationale inherits its blind spots. A fresh
context on the Goldfish and the Critic keeps a wrong assumption from threading
unnoticed through the whole chain.

## Delegate first

The Elephant does not carry out implementation work itself; it hands it to fresh
Goldfish contexts. That keeps its scarce, long-lived context free for overview,
decision, and quality — instead of filling up with implementation detail and
losing its judgment along the way.

## One canonical verify gate and mandatory evidence

There is exactly one authoritative check gate ("verify") that measures a change
against live behavior — not just tests or a typecheck, but demonstrated proof
that the change actually does what it is meant to. No task counts as done without
that proof; the bare claim that "it runs," with no evidence, does not count.

## Push gate

Before any push to the shared remote there is a deliberate checkpoint. Whether
routine pushes need explicit approval or are standing-approved is a
project-specific setting. Either way, certain actions stay forbidden always:
force-push, rewriting history, deleting protected branches or tags, and bypassing
hooks.

## Small, atomic Conventional Commits

Every commit carries exactly one concern and follows the Conventional Commits
format. Small, self-contained steps are easier to review, to roll back
deliberately, and to read in the history than large catch-all commits.

## Planned context checkpoints

A long-lived orchestrator session accumulates context over time and loses its
edge. So state, decisions, and insights are recorded continuously in files — not
in the chat history. A session is therefore only a cache over the persisted
artifact, never the actual source of truth. At planned points it can be reloaded
cleanly, without losing knowledge.

## Model-tier routing (`pipeline.user.yaml`)

Roles do not run fixed on one particular model but on configurable model tiers,
set centrally in `pipeline.user.yaml`: a more capable design tier for the
orchestrator, an implement tier for execution, a leaner mechanic tier for simple
work, a review tier for checking, and optionally an advisor tier for an
independent second opinion. The method ships sensible defaults; each team
overrides them in this one file to match its subscription and budget. The primary
cost lever here is the configured thinking depth (effort), measured by the
effective cost per task — not the raw price per token.

## Security-scan gate

Before a change is closed out there is a dedicated security gate. It checks
specifically for secrets, tokens, and typical weaknesses before code leaves the
repo. Security is thus a fixed step in the flow, not an afterthought.

## Governance layer: advisory guidelines vs. enforcing policies

Rules for a hosted project fall deliberately into two classes. **Advisory
guidelines** are recommendations: they give orientation but block nothing.
**Enforcing policies** are machine-checked and blocking: violate one and you do
not get through. Each hosted project decides per rule which class it falls into —
so strictness can be dialed without rewriting the method.

---

# Design-Entscheidungen — das „Warum" der Methodik

Diese Methodik ruht auf wenigen, langlebigen Grundentscheidungen. Dieses Dokument
fasst sie in einfacher Sprache zusammen: Es erklärt das *Warum*. Das verbindliche
*Wie* steht in den Regelwerken (`policies/`, `guardrails/`, `roles/`).

## Getrennte Rollen

Das Modell tragen ein **Product Owner** — du, das menschliche Gate — und drei
bewusst getrennte Agenten-Rollen:

- **Elephant — der Orchestrator.** Die langlebige Sitzung. Aus dem Gespräch mit
  dem Product Owner formt er eine Spezifikation, zerlegt sie in kleine Aufgaben,
  beauftragt diese und entscheidet am Ende über die Freigabe.
- **Goldfish — der Implementierer.** Ein frischer, eng umrissener Kontext, der
  genau eine Aufgabe ausführt und nur mit Nachweis abgibt.
- **Critic — der unabhängige Prüfer.** Eine reine Lese-Instanz mit frischem
  Kontext, die weder den Chat-Verlauf noch die Begründungen der Umsetzung kennt.

Der Product Owner behält die zwei menschlichen Gates — die Freigabe des Plans
vorn und die Abnahme des Ergebnisses am Ende — und gibt dieses Urteil nie nach
unten ab.

Die Trennung ist Absicht: Wer implementiert, prüft sich nicht selbst. Ein Prüfer,
der die Begründung bereits gehört hat, übernimmt deren blinde Flecken. Frischer
Kontext bei Goldfish und Critic verhindert, dass sich eine falsche Annahme
unbemerkt durch die gesamte Kette zieht.

## Delegieren zuerst

Der Elephant führt Umsetzungsarbeit nicht selbst aus, sondern gibt sie an frische
Goldfish-Kontexte. So bleibt sein knapper, langlebiger Kontext für Überblick,
Entscheidung und Qualität frei — statt sich mit Umsetzungsdetails zu füllen und
dabei an Urteilskraft zu verlieren.

## Ein kanonisches verify-Gate und Nachweispflicht

Es gibt genau ein maßgebliches Prüf-Gate („verify"), das eine Änderung am
laufenden Verhalten misst — nicht nur Tests oder Typecheck, sondern der belegte
Nachweis, dass die Änderung tatsächlich das Beabsichtigte tut. Keine Aufgabe gilt
als fertig ohne diesen Nachweis; die bloße Behauptung „läuft" ohne Evidenz zählt
nicht.

## Push-Gate

Vor dem Push in das geteilte Remote steht ein bewusster Kontrollpunkt. Ob
Routine-Pushes eine ausdrückliche Freigabe brauchen oder dauerhaft freigegeben
sind, ist eine projektspezifische Einstellung. Unabhängig davon bleiben bestimmte
Aktionen immer verboten: force-push, das Umschreiben von Historie, das Löschen
geschützter Branches oder Tags und das Umgehen von Hooks.

## Kleine, atomare Conventional Commits

Jeder Commit trägt genau ein Anliegen und folgt dem Conventional-Commits-Format.
Kleine, in sich abgeschlossene Schritte sind leichter zu prüfen, gezielt
zurückzurollen und in der Historie zu lesen als große Sammel-Commits.

## Geplante Kontext-Checkpoints

Eine langlebige Orchestrator-Sitzung sammelt mit der Zeit Kontext an und verliert
an Schärfe. Darum werden Zustand, Entscheidungen und Erkenntnisse laufend in
Dateien festgehalten — nicht im Chat-Verlauf. Eine Sitzung ist damit nur ein
Zwischenspeicher auf dem persistierten Artefakt, nie die eigentliche Quelle der
Wahrheit. An geplanten Punkten kann so sauber neu geladen werden, ohne Wissen zu
verlieren.

## Modell-Tier-Routing (`pipeline.user.yaml`)

Rollen laufen nicht fest auf einem bestimmten Modell, sondern auf konfigurierbaren
Modell-Stufen (Tiers), die zentral in `pipeline.user.yaml` festgelegt werden: eine
höher belastbare Design-Stufe für den Orchestrator, eine Implement-Stufe für
Umsetzung, eine sparsamere Mechanic-Stufe für einfache Arbeit, eine Review-Stufe
für die Prüfung und optional eine Advisor-Stufe für eine unabhängige Zweitmeinung.
Die Methodik liefert sinnvolle Standardwerte mit; jedes Team überschreibt sie in
dieser einen Datei nach seinem Abo und Budget. Als primärer Kostenhebel gilt dabei
die eingestellte Denk-Tiefe (Effort), gemessen an den effektiven Kosten pro
Aufgabe — nicht der reine Preis pro Token.

## Security-Scan-Gate

Vor dem Abschluss einer Änderung steht ein eigenes Sicherheits-Gate. Es prüft
gezielt auf Geheimnisse, Tokens und typische Schwachstellen, bevor Code das Repo
verlässt. Sicherheit ist damit ein fester Schritt im Ablauf, kein nachträglicher
Gedanke.

## Governance-Schicht: beratende Leitlinien vs. erzwingende Policies

Regeln für ein betreutes Projekt fallen bewusst in zwei Klassen. **Beratende
Leitlinien** sind Empfehlungen: Sie geben Orientierung, blockieren aber nichts.
**Erzwingende Policies** sind maschinell geprüft und blockierend: Wer sie
verletzt, kommt nicht weiter. Jedes betreute Projekt entscheidet pro Regel, in
welche Klasse sie fällt — so lässt sich Strenge dosieren, ohne die Methodik
umzuschreiben.

---

Die deutsche Fassung ist eine Übersetzung des englischen Originals.
