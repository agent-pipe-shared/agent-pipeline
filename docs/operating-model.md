# Agent-Pipeline Operating Model (V3)

> _A German reader copy follows below. English is the normative text._

Agent-Pipeline is a versioned operating model for building software with AI
agents. It gives a project one repeatable way to turn an intent into a
reviewed, evidenced and traceable change. It is deliberately a method and a
set of repo-local controls—not a claim that an AI system is safe, correct, or
autonomous by itself.

This document is the normative process contract. [README](../README.md) is the
product entry point, [PIPELINE_FLOW](../PIPELINE_FLOW.md) is the maintained
user journey, and [SETUP](../SETUP.md) is the task guide. When they disagree,
this document and the applicable ADRs take precedence.

## 1. What the model protects

Agent work often fails in mundane ways: the goal lives only in chat, the agent
checks its own work, a test was never run, a second person cannot reconstruct
why a change happened, or every repository invents a different process. The
model addresses those failure modes with five rules:

1. **The document outlives the chat.** A spec, decision, evidence artifact and
   handover carry the working state; a session is only a cache.
2. **Separate creation from evaluation.** An implementor and a Critic receive
   fresh contexts. A Critic sees the candidate, constraints and evidence—not
   the implementor's reasoning.
3. **Prefer deterministic checks.** Format, lint, types, tests, build and
   configured security checks run before semantic review.
4. **Match ceremony to stakes.** Rigor determines the needed specification;
   risk determines the review depth. Small does not make a security or
   guardrail change low risk.
5. **Keep human judgment explicit.** A human decision role owns priority,
   ambiguous trade-offs, irreversible or externally consequential actions and
   required acceptance. The default display name is `PO`; it is a role, not an
   identity or access-control system.

## 2. Roles and boundaries

| Role | Owns | Does not own |
| --- | --- | --- |
| Human decision role (`PO`) | Intent, priority, scope decisions, plan approval where required, acceptance and exceptions. | Rubber-stamping agent claims or acting as an implementation relay. |
| Elephant | Triage, specification, decomposition, dispatch, finding disposition, continuity and close. | Quiet policy decisions or ordinary production implementation. |
| Goldfish | One bounded, independently briefed task and its evidence. | Chat-history inheritance, open-ended scope expansion or weakening its own examiner. |
| Critic | Independent, read-only assessment of a finished candidate and its evidence. | Implementation, access to implementor reasoning, or an unsupported finding. |

“EGM” means the Elephants & Goldfish model: durable written context is more
reliable than a long conversation. In Agent-Pipeline, **Goldfish** is the
fresh-context executor; a separate fresh read-only duty performs spec
readiness, and the **Critic** evaluates the result.

The concrete runner integration differs by host. Claude has the richer native
plugin/hook surface. Codex has its own plugin manifest and pre-tool guard
adapter. Other runtimes can use the methodology, but must not claim equivalent
hook, tool, isolation or model-routing enforcement without their own evidence.

## 3. V3 routing: profiles, duties and phases

`pipeline.user.v3` is the routing authority. Generated runtime projections are
derived from it; they are not a second source of truth. A requested model route
is not proof of the model that actually answered.

### Profiles

Profiles describe the size and lifecycle shape of the current topic, not a
person or model:

| Profile | Use it for | Process effect |
| --- | --- | --- |
| `mini` | A genuinely small, bounded, reversible change. | Light process; advisory is disabled. Deterministic checks still apply. |
| `feature` | One coherent product or engineering change. | Full feature lifecycle; advisory is required. |
| `epic` | Multi-block, architectural or cross-cutting work. | Full lifecycle and advisory; plan work is decomposed into smaller deliverable blocks. |

Every profile has a `design_phase` and an `execution_phase`. A **phase** is a
lifecycle state; it is not a profile. A **Sprint** is a planning window that
groups work. Neither term changes a runner or authorizes a shortcut.

### Duties

The route registry distinguishes duties such as `implement`, `mechanic`,
`deep`, `test_author`, `readiness`, `critic_normal`, `critic_high_risk` and
`advisory`. Optional duties are opt-in. Advisory is required for `feature` and
`epic`, disabled for `mini`, and emits a bound advisory receipt rather than an
implementation decision.

## 4. The lifecycle

The maintained visual version is in [PIPELINE_FLOW](../PIPELINE_FLOW.md). The
normative shape is:

1. **Bootstrap.** Confirm the loaded ruleset, V3 authority, calibration,
   current state and verify command before writable work.
2. **Intent and triage.** Classify profile, rigor and risk. An optional design
   pre-stage may clarify a large idea; it never pre-approves a design.
3. **Spec and readiness.** For work above the light path, record outcome,
   non-goals and checkable acceptance criteria. A fresh read-only readiness
   duty tests whether the material is implementable without chat context.
4. **Human plan gate.** Where the project/risk/rigor requires it, present a
   readable PRD and wait for explicit approval before implementation.
   Approval is recorded before the first implementation dispatch; it is never
   inferred from chat, an old plan, or an implementor's confidence.
5. **Dispatch.** Give a Goldfish one outcome, exact context paths, DoD checks,
   prohibitions, stop conditions and route metadata. Independent tasks may run
   in parallel when their files and state do not conflict.
6. **Verify.** Run the project's single configured verify command. The result
   is machine evidence containing the command and result, not “looks good”.
7. **Critic.** Review the delta only after the applicable deterministic chain
   is green. High-risk, architecture, guardrail and security changes receive
   the required stronger review path. Findings need evidence and a disposition.
8. **Close.** Synchronize handover and history, preserve evidence, perform the
   required retro and run close extensions. A feature lifecycle is closed only
   after its tracked work is actually complete.

## 5. Rigor, risk and gates

**Rigor** answers “how much written definition does this change earn?”

| Rigor | Minimum shape |
| --- | --- |
| 0 | Small bounded change: short brief and evidence. It never waives verify. |
| 1 | Delta specification with checkable criteria. |
| 2 | Full maintained specification for consequential or broad work. |

**Risk** answers “how independently must it be checked?” A path classified as
architecture, security or guardrail remains high risk even if the diff is one
line. Project calibration and governance rules can raise risk; they do not
silently lower it.

The core gates are: V3/bootstrap authority, required plan approval, the one
verify command, applicable security checks, and Critic review. A skipped
optional security tool is reported as `SKIPPED`, never as `PASS`. A typed
unavailable runner capability stops that capability honestly; it is not an
invitation to weaken permissions, invent evidence or change runner/model.

## 6. Evidence, review and recovery

Evidence binds a result to its candidate and records what was actually
observed. It is intentionally narrower than a transcript and should not expose
credentials, private coordinates or unnecessary prompts.

The Critic works from paths/refs, the candidate, constraints and evidence. It
first hunts for defects, then reports only findings it can support. “No
findings” is valid. The Elephant decides whether each finding is fixed,
accepted with a reason, or escalated; it must not silently discard one.

If a duty is unavailable, a precondition drifts, evidence is stale, a stop
condition fires or the same attempt repeatedly fails, stop the affected work.
Recover from the named artifact or start a newly briefed task; do not continue
by relying on remembered chat context. Destructive Git operations remain
guarded even when a model or prompt asks for them.

## 7. Project calibration and extensions

The portable core is shared; each repository supplies a small committed
calibration in `.claude/pipeline.json` and, where used, a declarative
`.claude/pipeline.yaml`. The V3 source selects language, routing, profiles,
duties and policy defaults. Use the templates rather than copying an existing
repo's private details.

Typical repository dials are:

- the single `verify` command;
- autonomy, branch and worktree model;
- stakes, constraints and risk zones;
- plan, push and security gate modes;
- human-facing language;
- project-owned guidelines and machine-checkable policies;
- protected test paths and approved ritual extensions.

Extensions are optional and bounded: custom PRD/spec/ADR/handover templates,
governance guidelines, policy checks, release/deploy adapters, UI/security
phases and organization-private adapters. They must be configured through the
documented extension points, tested in the adopting repository and kept out of
the public core when they contain private coordinates, credentials or
organization-specific data.

`roles.po.display_label` is an optional V3 presentation setting for the human
decision role. It is plain display text—not an authority mechanism, personal
identity, or non-repudiation claim. The machine role key, approvals, receipts,
and evidence remain exactly `po`; omitted configuration renders the default
`PO`.

`language.human_facing` is the single human-facing language authority in the
compiled runtime. The PO-gate language projection is checked with
`node harness/scripts/check-po-gate-authority.mjs`; user-facing copies must not
invent a competing language or approval form.

## 8. Operating shapes

| Shape | Practical use | Boundary |
| --- | --- | --- |
| Solo developer | One person can hold the human decision and maintainer responsibilities while fresh execution/review contexts retain useful separation. | The model does not create independent human oversight. |
| Small team | Split decision, implementation and review responsibilities; share calibration, WIP limits, branch policy and push gates. | It does not replace code review, employment responsibilities or access controls. |
| Multi-team organization | Reuse central guidelines, policies and templates; let each repository calibrate local phases, gates and adapters. | It is not IAM, authenticated identity, a legal control framework or a central control plane. |

## 9. Authority precedence

1. The applicable security/host constraints and project configuration.
2. The approved spec/PRD and recorded PO decisions for the active feature.
3. This Operating Model and applicable ADRs.
4. Templates, examples, prompts and user documentation.
5. Chat instructions, memory and unrecorded assumptions.

An exception is valid only when it is explicit, scoped and recorded in the
project's durable state. It does not silently change the underlying rule.

The error register remains the **sole public concrete form authority** for its
bounded triage content; it is not briefing context for a Goldfish or Critic.

## 10. Glossary

- **Acceptance criteria / DoD:** observable checks that define completion.
- **Advisory:** a fresh, bounded second opinion for Feature/Epic; not approval.
- **Calibration:** the repo-local configuration that adapts the shared model.
- **Critic:** independent fresh-context read-only reviewer.
- **Duty:** a routed unit of work, such as implement or readiness.
- **EGM:** Elephants & Goldfish model; durable documents over conversational
  memory.
- **Evidence:** a machine or receipt-bound record of an observed check/result.
- **Goldfish:** fresh-context executor for one bounded dispatch.
- **Elephant:** long-lived orchestrator for the project lifecycle.
- **Phase:** lifecycle state such as design or execution.
- **Profile:** `mini`, `feature` or `epic` process shape.
- **Rigor:** required depth of written definition (0, 1 or 2).
- **Risk:** required review depth; independent of diff size.
- **Sprint:** a planning window, not a routing profile or permission.

---

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a complete German reader copy. English above is normative. -->

# Agent-Pipeline Operating Model (V3)

> _Oben steht die normative englische Fassung. Dieser Abschnitt ist die vollständige deutsche Lesefassung._

Agent-Pipeline ist ein versioniertes Operating Model für Softwareentwicklung
mit KI-Agenten. Es gibt einem Projekt einen wiederholbaren Weg von einer
Absicht zu einer geprüften, belegten und nachvollziehbaren Änderung. Es ist
bewusst eine Methode mit repo-lokalen Kontrollen—keine Behauptung, dass ein
KI-System von allein sicher, korrekt oder autonom ist.

Dieses Dokument ist der normative Prozessvertrag. Das [README](../README.md)
ist der Produkteinstieg, der [PIPELINE_FLOW](../PIPELINE_FLOW.md) die gepflegte
Nutzerreise und [SETUP](../SETUP.md) der Aufgabenleitfaden. Bei Widerspruch
gehen dieses Dokument und die passenden ADRs vor.

## 1. Was das Modell schützt

Agentenarbeit scheitert oft banal: Das Ziel lebt nur im Chat, ein Agent prüft
sich selbst, ein Test lief nie, eine zweite Person kann die Änderung nicht
nachvollziehen oder jedes Repository erfindet einen anderen Ablauf. Das Modell
begegnet diesen Fehlern mit fünf Regeln:

1. **Das Dokument überlebt den Chat.** Spec, Entscheidung, Evidenz und
   Handover tragen den Arbeitsstand; eine Session ist nur ein Cache.
2. **Erzeugung und Bewertung bleiben getrennt.** Implementierung und Critic
   erhalten frischen Kontext. Der Critic sieht Kandidat, Grenzen und Evidenz,
   nicht die Begründung des Implementierenden.
3. **Deterministische Checks gehen vor.** Format, Lint, Typen, Tests, Build
   und konfigurierte Security-Checks laufen vor der semantischen Prüfung.
4. **Der Einsatz bestimmt die Zeremonie.** Rigor bestimmt die notwendige Spec;
   Risiko bestimmt die Reviewtiefe. Klein macht einen Security- oder
   Guardrail-Change nicht risikoarm.
5. **Menschliches Urteil bleibt sichtbar.** Eine menschliche Entscheidungsrolle
   verantwortet Priorität, mehrdeutige Abwägungen, irreversible oder externe
   Folgen und notwendige Abnahme. Die Standardanzeige ist `PO`; das ist eine
   Rolle, kein Identitäts- oder Zugriffssystem.

## 2. Rollen und Grenzen

| Rolle | Verantwortet | Verantwortet nicht |
| --- | --- | --- |
| Menschliche Entscheidungsrolle (`PO`) | Absicht, Priorität, Scope-Entscheidungen, nötige Planfreigabe, Abnahme und Ausnahmen. | Agentenbehauptungen abzunicken oder als Implementierungs-Relay zu dienen. |
| Elephant | Triage, Spezifikation, Zerlegung, Dispatch, Befunddisposition, Kontinuität und Close. | Stille Policy-Entscheidungen oder normale Produktionsimplementierung. |
| Goldfish | Eine klar begrenzte, unabhängig gebriefte Aufgabe samt Evidenz. | Chat-Historie zu erben, Scope offen auszuweiten oder den eigenen Prüfer zu schwächen. |
| Critic | Unabhängige Read-only-Bewertung eines fertigen Kandidaten und seiner Evidenz. | Implementierung, Zugriff auf Implementierungsbegründungen oder unbelegte Befunde. |

„EGM“ bedeutet Elephants-&-Goldfish-Modell: dauerhafte schriftliche Kontexte
sind verlässlicher als ein langes Gespräch. Bei Agent-Pipeline ist der
**Goldfish** der Ausführer mit frischem Kontext; eine getrennte frische
Read-only-Duty prüft die Readiness einer Spec und der **Critic** bewertet das
Ergebnis.

Die konkrete Runner-Integration hängt vom Host ab. Claude besitzt die
umfangreichere native Plugin-/Hook-Oberfläche. Codex besitzt ein eigenes
Plugin-Manifest und einen PreTool-Guard-Adapter. Andere Runtimes können die
Methode nutzen, dürfen aber ohne eigene Evidenz keine gleichwertige Hook-,
Tool-, Isolations- oder Model-Routing-Durchsetzung behaupten.

## 3. V3-Routing: Profile, Duties und Phasen

`pipeline.user.v3` ist die Routing-Autorität. Generierte Runtime-Projektionen
werden daraus abgeleitet; sie sind keine zweite Wahrheitsquelle. Eine
angeforderte Modellroute beweist nicht, welches Modell tatsächlich geantwortet
hat.

### Profile

Profile beschreiben Größe und Lifecycle-Form des aktuellen Themas, keine Person
und kein Modell:

| Profil | Verwende es für | Prozesseffekt |
| --- | --- | --- |
| `mini` | Eine wirklich kleine, begrenzte und reversible Änderung. | Leichter Prozess; Advisory ist deaktiviert. Deterministische Checks bleiben Pflicht. |
| `feature` | Eine zusammenhängende Produkt- oder Engineering-Änderung. | Voller Feature-Lifecycle; Advisory ist erforderlich. |
| `epic` | Mehrblock-, Architektur- oder querschnittliche Arbeit. | Voller Lifecycle und Advisory; der Plan wird in kleinere lieferbare Blöcke zerlegt. |

Jedes Profil hat eine `design_phase` und eine `execution_phase`. Eine **Phase**
ist ein Lifecycle-Zustand, kein Profil. Ein **Sprint** ist ein
Planungszeitraum. Keiner der Begriffe ändert einen Runner oder erlaubt eine
Abkürzung.

### Duties

Die Route Registry unterscheidet Duties wie `implement`, `mechanic`, `deep`,
`test_author`, `readiness`, `critic_normal`, `critic_high_risk` und
`advisory`. Optionale Duties sind Opt-in. Advisory ist für `feature` und
`epic` erforderlich, für `mini` deaktiviert und erzeugt eine gebundene
Advisory-Receipt statt einer Implementierungsentscheidung.

## 4. Der Lifecycle

Die gepflegte visuelle Fassung steht im [PIPELINE_FLOW](../PIPELINE_FLOW.md).
Die normative Form lautet:

1. **Bootstrap.** Vor schreibender Arbeit Ruleset, V3-Autorität,
   Kalibrierung, aktuellen Stand und Verify-Befehl bestätigen.
2. **Absicht und Triage.** Profil, Rigor und Risiko klassifizieren. Eine
   optionale Design-Vorstufe darf eine große Idee klären, aber nie ein Design
   vorab freigeben.
3. **Spec und Readiness.** Oberhalb des leichten Pfads Outcome, Nicht-Ziele
   und prüfbare Akzeptanzkriterien festhalten. Eine frische Read-only-Duty
   prüft, ob das Material ohne Chat-Kontext implementierbar ist.
4. **Menschliches Plan-Gate.** Wo Projekt, Risiko oder Rigor es verlangen,
   eine lesbare PRD präsentieren und vor Implementierung auf ausdrückliche
   Freigabe warten.
   Die Freigabe wird vor dem ersten Implementierungs-Dispatch aufgezeichnet;
   sie wird nie aus Chat, einem alten Plan oder Zuversicht der implementierenden
   Person abgeleitet.
5. **Dispatch.** Einem Goldfish genau ein Outcome, Kontextpfade, DoD-Checks,
   Verbote, Stop-Bedingungen und Route-Metadaten geben. Unabhängige Aufgaben
   dürfen parallel laufen, wenn Dateien und Zustand nicht kollidieren.
6. **Verify.** Den einen konfigurierten Verify-Befehl ausführen. Das Ergebnis
   ist maschinelle Evidenz mit Befehl und Resultat, nicht „sieht gut aus“.
7. **Critic.** Den Delta erst nach grüner deterministischer Kette prüfen.
   High-Risk-, Architektur-, Guardrail- und Security-Änderungen erhalten den
   vorgeschriebenen stärkeren Reviewpfad. Jeder Befund braucht Evidenz und
   Disposition.
8. **Close.** Handover und Historie synchronisieren, Evidenz bewahren, die
   nötige Retro durchführen und Close-Erweiterungen ausführen. Ein Feature
   endet erst, wenn seine verfolgte Arbeit wirklich abgeschlossen ist.

## 5. Rigor, Risiko und Gates

**Rigor** beantwortet: „Wie viel schriftliche Definition verdient diese
Änderung?“

| Rigor | Mindestform |
| --- | --- |
| 0 | Kleine begrenzte Änderung: kurzer Brief plus Evidenz. Verify entfällt nie. |
| 1 | Delta-Spezifikation mit prüfbaren Kriterien. |
| 2 | Vollständig gepflegte Spezifikation für folgenreiche oder breite Arbeit. |

**Risiko** beantwortet: „Wie unabhängig muss dies geprüft werden?“ Ein als
Architektur, Security oder Guardrail klassifizierter Pfad bleibt High Risk,
auch wenn der Diff nur eine Zeile hat. Projektkalibrierung und Governance-Regeln
können Risiko anheben, aber nicht still absenken.

Die Kerngates sind: V3-/Bootstrap-Autorität, nötige Planfreigabe, der eine
Verify-Befehl, passende Security-Checks und Critic-Review. Ein übersprungenes
optionales Security-Tool erscheint als `SKIPPED`, nie als `PASS`. Eine typisierte
nicht verfügbare Runner-Fähigkeit stoppt diese Fähigkeit ehrlich; sie ist keine
Einladung, Berechtigungen zu lockern, Evidenz zu erfinden oder Runner/Modell zu
wechseln.

<a id="7-feedback-loop"></a>

## 6. Evidenz, Review und Recovery

Evidenz bindet ein Ergebnis an seinen Kandidaten und hält fest, was wirklich
beobachtet wurde. Sie ist absichtlich schmaler als ein Transkript und soll
keine Credentials, privaten Koordinaten oder unnötige Prompts offenlegen.

Der Critic arbeitet aus Pfaden/Refs, Kandidat, Grenzen und Evidenz. Zuerst
sucht er nach Fehlern, dann meldet er nur belegbare Befunde. „Keine Befunde“
ist gültig. Der Elephant entscheidet, ob jeder Befund behoben, mit Begründung
akzeptiert oder eskaliert wird; er darf keinen still verwerfen.

Ist eine Duty nicht verfügbar, driftet eine Vorbedingung, ist Evidenz veraltet,
tritt eine Stop-Bedingung auf oder scheitert derselbe Versuch wiederholt, wird
die betroffene Arbeit gestoppt. Recovery erfolgt aus dem benannten Artefakt
oder über einen neu gebrief­ten Task, nicht aus erinnerter Chat-Historie.
Destruktive Git-Operationen bleiben geschützt, auch wenn ein Modell oder Prompt
sie verlangt.

<a id="8-projekt-kalibrierungsschicht"></a>

## 7. Projektkalibrierung und Erweiterungen

Der portable Kern ist gemeinsam; jedes Repository liefert eine kleine
committete Kalibrierung in `.claude/pipeline.json` und, wo genutzt, ein
deklaratives `.claude/pipeline.yaml`. Die V3-Quelle wählt Sprache, Routing,
Profile, Duties und Policy-Defaults. Nutze die Templates, statt private Details
eines anderen Repos zu kopieren.

Typische Repository-Stellschrauben sind:

- der eine `verify`-Befehl;
- Autonomie-, Branch- und Worktree-Modell;
- Stakes, Constraints und Risk Zones;
- Modi für Plan-, Push- und Security-Gates;
- menschlich lesbare Sprache;
- projektspezifische Guidelines und maschinenprüfbare Policies;
- geschützte Testpfade und freigegebene Ritual-Erweiterungen.

Erweiterungen sind optional und begrenzt: eigene PRD-/Spec-/ADR-/Handover-
Templates, Governance-Guidelines, Policy-Checks, Release-/Deploy-Adapter,
UI-/Security-Phasen und organisationsprivate Adapter. Sie müssen über die
dokumentierten Erweiterungspunkte konfiguriert, im übernehmenden Repository
getestet und bei privaten Koordinaten, Credentials oder Organisationsdaten aus
dem öffentlichen Kern herausgehalten werden.

`roles.po.display_label` ist eine optionale V3-Präsentationseinstellung für die
menschliche Entscheidungsrolle. Sie ist sichtbarer Klartext—kein
Autoritätsmechanismus, keine persönliche Identität und keine
Nichtabstreitbarkeitsbehauptung. Maschinen-Rollenschlüssel, Freigaben, Receipts
und Evidenz bleiben exakt `po`; ohne Konfiguration erscheint standardmäßig
`PO`.

`language.human_facing` ist die alleinige öffentliche konkrete Formautorität
für die menschlich sichtbare Sprache der kompilierten Laufzeit. Die
PO-Gate-Sprachprojektion prüft
`node harness/scripts/check-po-gate-authority.mjs`; Nutzertexte dürfen keine
zweite Sprache oder Freigabeform erfinden.

## 8. Betriebsformen

| Form | Praktische Nutzung | Grenze |
| --- | --- | --- |
| Solo-Entwicklung | Eine Person kann Entscheidungs- und Maintainer-Verantwortung tragen; frische Ausführungs-/Review-Kontexte schaffen trotzdem Trennung. | Das Modell erzeugt keine unabhängige menschliche Aufsicht. |
| Kleines Team | Entscheidung, Implementierung und Review aufteilen; Kalibrierung, WIP-Limits, Branch-Policy und Push-Gates gemeinsam nutzen. | Es ersetzt weder Code Review noch Arbeitsverantwortung oder Zugriffskontrollen. |
| Multi-Team-Organisation | Zentrale Guidelines, Policies und Templates wiederverwenden; jedes Repo kalibriert lokale Phasen, Gates und Adapter. | Es ist kein IAM, keine authentifizierte Identität, kein Rechtskontrollrahmen und keine zentrale Control Plane. |

## 9. Autoritätsreihenfolge

1. Geltende Sicherheits-/Host-Grenzen und Projektkonfiguration.
2. Freigegebene Spec/PRD und aufgezeichnete PO-Entscheidungen des aktiven Features.
3. Dieses Operating Model und passende ADRs.
4. Templates, Beispiele, Prompts und Nutzerdokumentation.
5. Chat-Anweisungen, Memory und nicht dokumentierte Annahmen.

Eine Ausnahme ist nur gültig, wenn sie explizit, begrenzt und im dauerhaften
Projektstand aufgezeichnet ist. Sie ändert die zugrunde liegende Regel nicht
still.

Das Error Register bleibt die **alleinige öffentliche konkrete Formautorität**
für seine begrenzten Triage-Inhalte; Goldfish und Critic erhalten es nicht als
Briefing-Kontext.

## 10. Glossar

- **Acceptance Criteria / DoD:** Beobachtbare Checks, die Abschluss definieren.
- **Advisory:** Frische, begrenzte zweite Meinung für Feature/Epic, keine Freigabe.
- **Calibration:** Repo-lokale Konfiguration zur Anpassung des gemeinsamen Modells.
- **Critic:** Unabhängiger Read-only-Reviewer mit frischem Kontext.
- **Duty:** Geroutete Arbeitseinheit, etwa Implementierung oder Readiness.
- **EGM:** Elephants-&-Goldfish-Modell; dauerhafte Dokumente statt Gesprächsmemory.
- **Evidence:** Maschinen- oder Receipt-gebundener Nachweis eines beobachteten Ergebnisses.
- **Goldfish:** Ausführer mit frischem Kontext für einen begrenzten Dispatch.
- **Elephant:** Langlebiger Orchestrator des Projekt-Lifecycles.
- **Phase:** Lifecycle-Zustand wie Design oder Execution.
- **Profile:** Prozessform `mini`, `feature` oder `epic`.
- **Rigor:** Tiefe der nötigen schriftlichen Definition (0, 1 oder 2).
- **Risk:** Nötige Reviewtiefe, unabhängig von der Diffgröße.
- **Sprint:** Planungszeitraum, kein Routingprofil und keine Berechtigung.
