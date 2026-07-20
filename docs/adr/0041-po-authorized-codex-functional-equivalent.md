# ADR-0041: PO-authorized Codex functional-equivalent gate pass

**Status:** accepted · **Date:** 2026-07-20

## Context

ADR-0040 correctly rejects unbound host-shell fallbacks and treats a missing
Codex selected-sandbox child as non-success. The current Codex CLI host can
produce that typed no-child/unavailable result even where an operator still
requires a bounded local advisory decision to proceed. The PO has explicitly
and permanently authorized a narrow operational equivalence for this repository.

## Decision

- After exactly one typed Codex selected-sandbox `no-child` or `unavailable`
  result, one fresh local internal hard-read-only `consult-advisor` subagent
  may receive the same single question.
- If that one consult answers without handover, memory, repository mutation,
  network export, raw-answer persistence, or auto-apply, it is a
  **PO-authorized functional-equivalent pass**. It is gate-capable for the
  affected PO gate, bootstrap/readiness decision, Critic prerequisite, and
  Epic-close prerequisite.
- The pass remains valid until the PO revokes it or a functional Codex CLI
  selected sandbox becomes available. At that point the registered selected
  transport is required again.
- It is not an attested native Codex sandbox execution. Every claim must state:
  `no attested selected-sandbox execution; OS isolation and model identity are
  not asserted`.
- The local pass emits no `pipeline.advisory-receipt.v1`, no selected-sandbox
  execution attestation, and no raw transport artifact. At most a sanitized
  candidate-bound functional-equivalent status record with question/answer
  digests may be retained.
- A local failure, second question, mutation, export, or retry is not a pass
  and has no further fallback.

## Consequences

This supersedes ADR-0040's no-gate/no-fallback outcome only for the precise
PO-authorized functional equivalent above. It does not permit an unbound host
shell, a fabricated native success, a runner/model substitution, automatic
application, or a stronger isolation/identity claim. ADR-0038 remains the
route and coordinator authority; ADR-0040 remains the consent and selected
Bash authority.

## Discarded alternatives

- Reporting the local consult as an attested sandbox success was rejected: no
  child, OS-isolation, or model-identity evidence exists.
- Unlimited local retries or multiple questions were rejected because they
  would convert a continuity exception into an alternate transport.
- Networked export or retaining raw advisory data was rejected because the PO
  authorization is for a local, bounded read-only consult only.

## Resubmission

This decision is automatically reconsidered when a functional Codex CLI
selected sandbox becomes available, and may be revoked at any time by the PO.

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation. -->

# ADR-0041: PO-autorisierter Codex-Funktionsäquivalenz-Pass für Gates

**Status:** akzeptiert · **Datum:** 2026-07-20

## Kontext

ADR-0040 verwirft zu Recht ungebundene Host-Shell-Fallbacks und wertet ein
fehlendes Codex-Selected-Sandbox-Kind als Nicht-Erfolg. Der aktuelle Codex-CLI-
Host kann diesen typisierten No-child/Unavailable-Zustand liefern, obwohl ein
Operator für eine begrenzte lokale Advisory-Entscheidung fortfahren muss. Der
PO hat für dieses Repository ausdrücklich und dauerhaft eine enge operative
Äquivalenz autorisiert.

## Entscheidung

- Nach genau einem typisierten Codex-Selected-Sandbox-Ergebnis `no-child` oder
  `unavailable` darf ein frischer lokaler interner hard-read-only
  `consult-advisor` dieselbe einzelne Frage erhalten.
- Beantwortet dieser eine Consult die Frage ohne Handover, Memory,
  Repository-Mutation, Netzwerkexport, Rohantwort-Persistenz oder Auto-Apply,
  ist er ein **PO-autorisierter Funktionsäquivalenz-Pass**. Er ist gatefähig
  für das betroffene PO-Gate, die Bootstrap-/Readiness-Entscheidung, eine
  Critic-Voraussetzung und eine Epic-Close-Voraussetzung.
- Der Pass bleibt gültig bis zum Widerruf durch den PO oder bis eine
  funktionsfähige Codex-CLI-Selected-Sandbox verfügbar ist. Dann ist wieder der
  registrierte Selected-Transport erforderlich.
- Er ist keine attestierte native Codex-Sandbox-Ausführung. Jeder Claim muss
  aussagen: `keine attestierte Selected-Sandbox-Ausführung; OS-Isolation und
  Modellidentität werden nicht behauptet`.
- Der lokale Pass erzeugt kein `pipeline.advisory-receipt.v1`, keine
  Selected-Sandbox-Ausführungsattestierung und kein rohes Transportartefakt.
  Höchstens ein sanitierter, kandidatengebundener Funktionsäquivalenz-Status
  mit Frage-/Antwort-Digests darf erhalten bleiben.
- Ein lokaler Fehlschlag, eine zweite Frage, Mutation, Export oder Retry ist
  kein Pass und erhält keinen weiteren Fallback.

## Folgen

Diese ADR ersetzt das No-gate/No-fallback-Ergebnis von ADR-0040 ausschließlich
für den oben präzise beschriebenen PO-autorisierten Funktionsäquivalenten. Sie
erlaubt weder eine ungebundene Host-Shell noch einen erfundenen nativen Erfolg,
eine Runner-/Modellsubstitution, automatische Anwendung oder einen stärkeren
Isolations-/Identitätsclaim. ADR-0038 bleibt Route- und Coordinator-Autorität;
ADR-0040 bleibt Consent- und Selected-Bash-Autorität.

## Verworfene Alternativen

- Den lokalen Consult als attestierten Sandbox-Erfolg auszugeben, wurde
  verworfen: Es gibt keine Kind-, OS-Isolations- oder Modellidentitätsevidenz.
- Unbegrenzte lokale Retries oder mehrere Fragen wurden verworfen, weil daraus
  statt einer Kontinuitätsausnahme ein alternativer Transport würde.
- Netzwerkexport oder das Behalten roher Advisory-Daten wurde verworfen, weil
  die PO-Autorisierung nur einen lokalen, begrenzten Read-only-Consult betrifft.

## Wiedervorlage

Diese Entscheidung wird automatisch erneut vorgelegt, sobald eine
funktionsfähige Codex-CLI-Selected-Sandbox verfügbar ist, und kann jederzeit
durch den PO widerrufen werden.
