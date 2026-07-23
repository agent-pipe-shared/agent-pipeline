# ADR-0041: PO-authorized Codex host Advisor

**Status:** accepted · **Date:** 2026-07-20 · **Amended:** 2026-07-23

## Context

ADR-0040 correctly prevents an unbound host-shell fallback and treats an
unavailable selected-sandbox child as non-success. The PO has authorized a
bounded, project-scoped Codex Advisor route that does not claim those missing
attestations.

## Decision

The 2026-07-23 WSL-only and after-failure route is superseded. For every Codex
`epic` or `feature` Advisory entry, the model-free
`codex-host-advisor-route.mjs` selects exactly one direct project-scoped
`consult-advisor` when resolved consent is `default` or `approved`. It has no
platform, WSL, selected-sandbox, App-Server, native-adapter, or fallback
branch. `declined` disables before any child or export; `mini` is disabled.

The custom agent is fresh and read-only, receives exactly one question and
allowlisted repository evidence, and inherits no chat, handover or memory. It
cannot mutate, persist, auto-apply, decide a gate, use a separate network tool
or export to a third party. The configured export of that bounded input to the
configured Codex provider remains the sole export boundary.

Only a candidate-, launch- and question-bound
`pipeline.host-advisor-status.v1` can satisfy the normal Codex Advisory gate.
It is produced by the Elephant-controlled pre/post workspace observations and
one-use launch nonce, never by the advisor. An absent, failed, retried,
mutating or observed separately exporting consult is not success and has no
fallback. Codex emits no `pipeline.advisory-receipt.v1`; that receipt and the
Fable/Opus/consult chain remain Claude authority.

Every successful claim retains: `no attested selected-sandbox execution; OS
isolation and model identity are not asserted`.

Codex selected-sandbox policy for Readiness and Critic duties is unchanged.

## Consequences

This is a narrow, honest Host-Advisor transport, not an attested native
sandbox execution or a general host-shell authority. It does not permit model
or runner substitution, automatic application, retries, or a stronger
isolation/identity claim. The PO may revoke it at any time.

## Verworfene Alternativen

- Eine WSL-Sonderroute oder erst ein Sandbox-Versuch wurde verworfen: beide
  erzeugen den bekannten, nutzlosen Zwischenschritt und sind kein Vorteil.
- Ein erfundener nativer Erfolg oder ungebundene Host-Shell wurde verworfen:
  dafür gibt es keine Isolation- oder Modellidentitätsattestierung.
- Mehrere Fragen, Retries oder ein separater Netzwerkexport wurden verworfen:
  sie würden aus dem begrenzten Advisor einen zweiten Transport machen.

## Deutsche Referenz

Für Codex wird bei `epic` und `feature` mit Consent `default` oder `approved`
sofort genau ein projektgebundener, read-only `consult-advisor` gestartet. Es
gibt davor und danach keinen WSL-, Selected-Sandbox-, App-Server-, Native- oder
Fallback-Versuch. `declined` und `mini` deaktivieren den Advisor ohne Kind oder
Export. Erfolg ist ausschließlich ein vom Elephant erzeugter, kandidaten-,
Launch- und Frage-gebundener `pipeline.host-advisor-status.v1` mit identischem
Workspace vor/nach dem Kind. Claude-Receipt und Claude-Fallback bleiben
unverändert. Jeder Claim sagt: `keine attestierte Selected-Sandbox-Ausführung;
OS-Isolation und Modellidentität werden nicht behauptet`.
