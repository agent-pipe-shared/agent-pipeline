# ADR-0020: EL-01 Enforcement — Every Implementation Runs as a Briefed Goldfish Dispatch

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

**Status:** accepted (2026-07-05, PO ruling following the &lt;PROJECT_B&gt;-S39 incident) · **Basis:** Register E20

## Context

A &lt;PROJECT_B&gt;-S39 incident showed the lead agent ("Elephant") self-implementing instead of delegating to a briefed Goldfish sub-agent — with significant extra cost. The PO subsequently ordered a three-layer enforcement plus a migration sweep.

## Decision (E20)

EL-01 Enforcement (PO ruling following the &lt;PROJECT_B&gt;-S39 incident, 2026-07-05): EVERY implementation runs as a briefed Sonnet-Goldfish dispatch; "small/tightly-coupled" is NOT an exception — tightly-coupled small bundles are dispatched as ONE combined briefing (context economy comes from bundling, never from self-implementation); exceptions may be granted only by the PO (the Stage-0 fast path per Operating Model §3.3 is unchanged). Enforcement is three-layered plus a migration sweep:

- (a) bootstrap loads the role prohibitions as mandatory step 1d, with a third confirmation line;
- (b) close runs an authorship check ("who produced this session's production diffs?"; self-authorship outside Stage 0 is an incident, never a discussion point);
- (c) the critic trajectory check carries the authorship question as a standard checkpoint;
- (d) migration kickoffs get a CLAUDE.md onboarding sweep against pre-migration language.

Economic rationale: the S39 cost analysis — $57.80 Fable share (89%, 26.6M cache reads) — is the direct consequence of the violation.

## Consequences

**Positive:** closes the most expensive observed violation class (Elephant self-implementation at Fable's cost) procedurally, on three layers (bootstrap, close, critic).

**Negative:** additional ritual overhead (third confirmation line, authorship check) in every session.

**Risk:** bundling could be abused as a workaround ("one mega-briefing" instead of real delegation). Mitigation: bundling is explicitly permitted for tightly-coupled small pieces, but always remains ONE briefed dispatch, never self-implementation.

## Rejected alternatives

- **Keep allowing exceptions for "small/tightly-coupled"** — this is exactly what enabled the S39 violation; explicitly rejected.
- **Enforcement on only one layer** (e.g. bootstrap hint only) — the register explicitly requires three layers plus a migration sweep.

## Follow-up

None scheduled in the register; spec-bound.

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

# ADR-0020: EL-01-Enforcement — jede Implementierung läuft als gebriefter Goldfish-Dispatch

> Agent-Pipeline v0.1.0-draft · Sprint 1 · Stand 2026-07-06

**Status:** akzeptiert (2026-07-05, the PO-Ruling nach <PROJECT_B>-S39-Inzident) · **Grundlage:** Register E20

## Kontext

Ein <PROJECT_B>-S39-Inzident zeigte Selbst-Implementierung durch den Elephant statt Delegation an einen gebriefte Goldfish — mit erheblichen Zusatzkosten. the PO ordnete daraufhin eine dreistufige Durchsetzung plus Migrations-Sweep an.

## Entscheidung (E20, wortgetreu)

> EL-01-Enforcement (the PO-Ruling nach <PROJECT_B>-S39-Inzident, 2026-07-05): JEDE Implementierung läuft als gebriefter Sonnet-Goldfish-Dispatch; „klein/verzahnt" ist KEINE Ausnahme — verzahnte Kleinbündel werden als EIN gebündeltes Briefing dispatcht (Kontext-Ökonomie durch Bündelung, nie durch Selbst-Implementierung); Ausnahmen erteilt ausschließlich der PO (Stufe-0-Fast-Path per OM §3.3 unverändert). Enforcement dreistufig + Migrations-Sweep: (a) Bootstrap lädt Rollen-Verbote als Pflichtschritt 1d mit dritter Bestätigungszeile, (b) Close führt Autorschafts-Check („Von wem stammen die Produktions-Diffs dieser Session?"; Selbst-Autorschaft außerhalb Stufe 0 = Inzident, nie Diskussionspunkt), (c) Critic-Trajektorien-Check trägt die Autorschaftsfrage als Standard-Prüfpunkt, (d) Migrations-Kickoffs erhalten CLAUDE.md-Onboarding-Sweep gegen Vor-Migrations-Sprache. Ökonomische Begründung: S39-Kostenanalyse — $57,80 Fable-Anteil (89 %, 26,6M cache-reads) ist die direkte Verstoß-Folge.

## Konsequenzen

**Positiv:** Schließt die teuerste beobachtete Verstoßklasse (Elephant-Selbstimplementierung auf Fable-Kosten) prozessual auf drei Ebenen (Bootstrap, Close, Critic).

**Negativ:** Zusätzlicher Ritual-Aufwand (dritte Bestätigungszeile, Autorschafts-Check) in jeder Session.

**Risiko:** Bündelung könnte als Umgehungsweg missbraucht werden („ein Mega-Briefing" statt echter Delegation). Mitigation: Bündelung ist ausdrücklich für verzahnte Kleinteile erlaubt, bleibt aber immer EIN gebrieftes Dispatch, nie Selbstimplementierung.

## Verworfene Alternativen

- **Weiterhin Ausnahmen für „klein/verzahnt" zulassen** — genau das ermöglichte den S39-Verstoß; ausdrücklich verworfen.
- **Enforcement auf nur einer Ebene** (z. B. nur Bootstrap-Hinweis) — Register verlangt explizit drei Ebenen plus Migrations-Sweep.

## Wiedervorlage

Keine terminiert im Register; spec-gebunden.
