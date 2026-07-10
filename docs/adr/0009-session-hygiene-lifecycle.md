# ADR-0009: Session Hygiene and Session Lifecycle

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

## Context

Cache economics are measurable: model/effort switches and `/compact` invalidate the entire cache — the official rule of thumb is "pick your model and effort level at the top of a session." Abort criteria are mandatory — after more than two failed attempts at the same problem, fresh context is cheaper than further iteration. Marathon sessions mixing topics are a documented anti-pattern from prior experience. A PO follow-up question (2026-07-03) makes session-lifecycle policy a mandatory part of the operating model: every Elephant session must be able to explain how it handles a full context window.

## Decision (E9, verbatim)

> Session hygiene: /clear+/rename on topic change; /compact only at task boundaries; two-failed-attempts rule; fix model+effort at session start

**Additionally canonicalized — session lifecycle policy (PO follow-up):**

- **Planned cut instead of emergency compaction:** Elephant sessions end at task boundaries via a deliberate cut (update handover → end), not via forced `/compact` once context is already full.
- **Handover-based re-bootstrapping:** the successor session bootstraps from the versioned handover file ([ADR-0012](0012-handover-canonicalization.md)) via the bootstrap protocol ([ADR-0010](0010-session-bootstrap.md)) — never from chat history.
- **Goldfish cadence:** token-intensive execution work runs in fresh Goldfish sub-sessions per task; Elephant context stays reserved for orchestration and decisions.

Full articulation of the lifecycle policy: [operating-model.md §5](../operating-model.md).

## Consequences

**Positive:** predictable, cheap context cuts instead of expensive emergency compaction; the Elephant stays long-lived and cache-stable; knowledge is file-persisted and survives every cut.

**Negative:** discipline cost — handover upkeep before every cut, foresight in timing `/compact`.

**Risk:** these rules are partly advisory-only (prose). Mitigation: a SessionStart hook (matcher `compact`) re-injects pipeline state; deterministic parts move into hooks/building blocks in Phase 3; the ability to account for this policy is part of the bootstrap self-confirmation ([ADR-0010](0010-session-bootstrap.md)).

## Rejected alternatives

- **Free practice without codified rules** — documented anti-pattern (marathon sessions, context drift, triple-maintained state).
- **Emergency compaction as the default mechanism** — `/compact` invalidates the cache by design and loses context uncontrollably; acceptable as an emergency measure, not as policy.

## Addendum 2026-07-06 (PO directive — E9 addendum)

`/compact` gains a **checkpoint-window rule** (append-only; the wording decided above stays unchanged): at every task boundary — package/wave boundary with Critic PASS + commit/push, PRD gate passed, or before the first dispatch of a new package — the Elephant checks context fill level. At ≥ ~100k tokens, presenting a compact block (literal `/compact` + one focus line) is MANDATORY, no longer just an emergency valve. Target window: 100–150k; > 150k counts as an overdue cut, to be named honestly. Trigger: project evidence that "/compact helped a lot" when applied deliberately at a boundary; counter-evidence of 69% usage > 150k from another project. The existing principle "`/compact` only at task boundaries" (E9, above) stays unchanged — the addendum turns it into an active duty at the window boundary rather than a mere permission. Full articulation: `docs/operating-model.md` §5.2, `roles/elephant.md` EL-25, `policies/model-policy.md` MP-19, `guardrails/token-budget.md` TB-02/TB-07.

**Status:** accepted (2026-07-03, Checkpoint 1; addendum 2026-07-06) · **Basis:** Register E9 + session lifecycle directive

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

# ADR-0009: Session-Hygiene und Session-Lifecycle

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 2 · Stand 2026-07-03

**Status:** akzeptiert (2026-07-03, Checkpoint 1) · **Grundlage:** Register E9 + Session-Lifecycle-Direktive

## Kontext

Cache-Ökonomie ist messbar: Modell-/Effort-Wechsel und `/compact` invalidieren den kompletten Cache; offizielle Faustregel „Pick your model and effort level at the top of a session". Abbruchkriterien sind Pflicht — nach mehr als zwei Fehlversuchen am selben Problem ist frischer Kontext billiger als weiteres Iterieren. Marathon-Sessions mit gemischten Themen sind ein belegtes Anti-Pattern des Bestands. Die Rückfrage des PO (2026-07-03) macht die Session-Lifecycle-Politik zum Pflichtteil des Operating Model: Jede Elephant-Session muss auskunftsfähig beherrschen, wie sie mit vollem Kontext umgeht.

## Entscheidung (E9, wortgetreu)

> Session-Hygiene: /clear+/rename bei Themenwechsel; /compact nur an Aufgabengrenzen; Zwei-Fehlversuche-Regel; Modell+Effort am Sessionanfang fixieren

**Ergänzend kanonisiert — Session-Lifecycle-Politik (Rückfrage des PO):**

- **Geplanter Schnitt statt Not-Kompaktierung:** Elephant-Sessions enden an Aufgabengrenzen durch bewussten Schnitt (Handover aktualisieren → beenden), nicht durch erzwungenes `/compact` bei vollem Kontext.
- **Handover-basiertes Re-Bootstrapping:** Die Nachfolge-Session bootstrappt aus der versionierten Handover-Datei ([ADR-0012](0012-handover-canonicalization.md)) über das Bootstrap-Protokoll ([ADR-0010](0010-session-bootstrap.md)) — nie aus dem Chat-Verlauf.
- **Goldfish-Kadenz:** Token-intensive Ausführungsarbeit läuft in frischen Goldfischen pro Task; der Elephant-Kontext bleibt für Orchestrierung und Entscheidungen reserviert.

Ausformulierung der Lifecycle-Politik: [operating-model.md §5](../operating-model.md).

## Konsequenzen

**Positiv:** planbare, billige Kontextschnitte statt teurer Not-Kompaktierung; der Elephant bleibt langlebig und cache-stabil; Wissen ist dateibasiert gesichert und überlebt jeden Schnitt.

**Negativ:** Disziplinkosten — Handover-Pflege vor jedem Schnitt, Voraussicht beim Timing von `/compact`.

**Risiko:** Diese Regeln sind teils nur advisory (Prosa). Mitigation: SessionStart-Hook (Matcher `compact`) re-injiziert den Pipeline-Zustand; deterministische Anteile wandern in Phase 3 in Hooks/Bausteine; die Auskunftsfähigkeit über diese Politik ist Teil der Bootstrap-Selbstbestätigung ([ADR-0010](0010-session-bootstrap.md)).

## Verworfene Alternativen

- **Freie Praxis ohne kodifizierte Regeln** — belegtes Anti-Pattern (Marathon-Sessions, Kontext-Drift, dreifach gepflegter Stand).
- **Not-Kompaktierung als Standardmechanismus** — `/compact` invalidiert den Cache per Design und verliert unkontrolliert Kontext; als Notfall akzeptabel, nicht als Politik.

## Wiedervorlage

Keine.

## Nachtrag 2026-07-06 (PO-Direktive — E9-Nachtrag)

`/compact` wird um eine **Checkpoint-Fenster-Regel** ergänzt (append-only, der oben entschiedene Wortlaut bleibt unverändert): An jeder Aufgabengrenze — Paket-/Wellen-Grenze mit Critic PASS + Commit/Push, PRD-Gate bestanden, oder vor dem ersten Dispatch eines neuen Pakets — prüft der Elephant den Kontext-Füllstand. Bei ≥ ~100k Tokens ist die Präsentation eines Compact-Blocks (wörtliches `/compact` + eine Fokus-Zeile) PFLICHT, nicht mehr nur ein Notfall-Ventil. Zielfenster: 100–150k; > 150k gilt als überfälliger Schnitt, ehrlich zu benennen. Anlass: <PROJECT_A>-B-Beleg „/compact hat viel gebracht" bei bewusster Anwendung an einer Grenze; <PROJECT_C>-Gegenbeleg 69 % Nutzung > 150k. Der bestehende Grundsatz „`/compact` nur an Aufgabengrenzen" (E9, oben) bleibt unverändert — die Ergänzung macht daraus an der Fenster-Grenze eine aktive Pflicht statt einer bloßen Erlaubnis. Ausformulierung: `docs/operating-model.md` §5.2 (Zeilen 383/385/388/403), `roles/elephant.md` EL-25, `policies/model-policy.md` MP-19, `guardrails/token-budget.md` TB-02/TB-07.
