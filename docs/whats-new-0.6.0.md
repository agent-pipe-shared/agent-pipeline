# What's new in 0.6.0 (release candidate)

> **Note.** `0.6.0` was never tagged or published. `0.6.1` (2026-09-02,
> `v0.6.1`) is the release that carries this scope; the CHANGELOG entry for
> `0.6.1` is the authoritative record.

`0.6.0` was the source and plugin release candidate that preceded `0.6.1`. It
was never a published release, marketplace publication, or
production-installation recommendation. A release claim needed the final
candidate's own verification, independent review, approval, and remote
readback; evidence for an earlier tree did not carry forward automatically.

## The product baseline: Phoenix is integrated

Phoenix is the completed, integrated product strand in this candidate. It
supplies the durable delivery controls that the rest of the pipeline uses:

- a traceable path from intent and specification to bounded work, deterministic
  checks, independent review, and close;
- evidence and approvals bound to the candidate and their declared decision,
  rather than an agent's summary of what happened;
- runner-aware trust boundaries for local controls and external actions, with
  typed non-success whenever the required proof is absent, stale, malformed, or
  mismatched; and
- public-safe operational records that let a later session or teammate recover
  the decision without treating chat history as authority.

Those controls are deliberately fail-closed. They make a missing proof visible;
they do not prove a runner's native sandbox isolation, model identity, or
platform support unless runner-specific evidence says so.

## The 0.6.0 Nova increment: the usable path forward

Nova remains an active product stream. `0.6.0` carries the candidate-ready
portion of that work, rather than declaring Nova complete:

- **Guided Greenfield adoption.** The public onboarding Driver leads an empty
  directory through its returned actions. It owns the sequence; runners follow
  the action and replace only the named human-input placeholders instead of
  reconstructing private CLI calls.
- **A practical first project.** The path collects project and author details,
  accepts either an existing first trust-anchor key or a newly created one,
  preserves supplied onboarding context across a restart, gathers the
  design/intake input, records plan approval, installs a real verify command,
  and reaches the first implementation step.
- **Runner-aware delivery.** The Driver's structured contract is exercised for
  Claude, Codex, and Antigravity. The same delivery model supports independently
  scoped work packages running in parallel when their ownership does not
  conflict; deterministic evidence still precedes independent review.

The Greenfield contract is intentionally an end-to-end discoverability test: it
checks that a fresh runner can find the next public action. It does not merely
prove that an expert can invoke private scripts in the right order.

## What remains open

Nova B continues the user-experience and operational follow-up: smoother plan
amendment and close flows, clearer cross-runner approval and verification
guidance, stronger delivery-loop observability, and remaining platform- or
runner-specific evidence. These are roadmap items, not hidden release claims.

In particular, `0.6.0` does not claim:

- publication, a Git tag, marketplace availability, or production support;
- universal or equivalent enforcement across every host and platform;
- that a successful automated run substitutes for the final candidate-bound
  Verify, security checks, Critic review, approval, and remote readback; or
- that all Nova work is finished.

For the user journey, see [Usage](usage.md) and
[PIPELINE_FLOW](../PIPELINE_FLOW.md). The normative roles and gates are in the
[Operating Model](operating-model.md); exact runner boundaries are in
[Runtime boundary](runtime-boundary.md).

---

## Deutsche Lesefassung (nicht normativ)

`0.6.0` ist der aktuelle Release-Kandidat für Source und Plugin. Er ist noch
kein veröffentlichtes Release, keine Marketplace-Veröffentlichung und keine
Empfehlung für eine Produktivinstallation. Eine Release-Behauptung braucht die
abschließende kandidatengebundene Verifikation, unabhängige Prüfung,
Freigabe und das Remote-Readback. Evidenz für einen älteren Tree wird nicht
automatisch übernommen.

**Phoenix ist der abgeschlossene, integrierte Produktstrang dieses
Kandidaten.** Er stellt die dauerhaften Delivery-Kontrollen bereit: den
nachvollziehbaren Weg von Absicht und Spezifikation über deterministische
Prüfungen und unabhängiges Review bis zum Abschluss, kandidatengebundene
Evidenz und Freigaben sowie runner-bewusste Grenzen für lokale Kontrollen und
externe Aktionen. Fehlt ein Nachweis, ist er veraltet, fehlerhaft oder passt
nicht zum Kandidaten, bleibt das Ergebnis ein typisierter Nicht-Erfolg. Das
belegt für sich allein weder native Sandbox-Isolation noch Modellidentität oder
Plattformunterstützung.

**Nova bleibt ein aktiver Produktstrang.** `0.6.0` enthält dessen
kandidatreife Ergebnisse, nicht den Abschluss von Nova: Der öffentliche
Onboarding-Driver führt ein leeres Verzeichnis über eigene strukturierte
Aktionen. Runner folgen diesen Aktionen und ersetzen nur ausgewiesene
menschliche Platzhalter, statt interne CLI-Aufrufe zu erraten. Der Weg umfasst
Projekt- und Autor-Daten, einen vorhandenen oder neuen ersten Trust Anchor,
gespeicherten Onboarding-Kontext über einen Neustart, Intake/Design,
Planfreigabe, ein echtes Verify-Kommando und den Start der ersten
Implementierung. Der Vertrag wird für Claude, Codex und Antigravity getestet
und prüft bewusst, ob ein frischer Runner den nächsten öffentlichen Schritt
finden kann.

Nova B bleibt für UX- und Betriebsverbesserungen offen, etwa Planänderungen und
Feature-Abschluss, klarere runnerübergreifende Freigabe-/Verify-Hinweise,
Delivery-Beobachtbarkeit sowie plattform- oder runnerspezifische Evidenz.
`0.6.0` behauptet weder Veröffentlichung oder universelle Host-Unterstützung
noch den Abschluss aller Nova-Arbeit. Ein automatischer Testlauf ersetzt nicht
die abschließende kandidatengebundene Verify-, Security-, Critic-, Freigabe-
und Remote-Readback-Evidenz.
