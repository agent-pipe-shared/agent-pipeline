# ADR-0041: PO-authorized Codex selected-sandbox Advisor

**Status:** accepted · **Date:** 2026-07-20 · **Amended:** 2026-07-23

## Context

ADR-0040 correctly prevents an unbound host-shell fallback and treats an
unavailable selected-sandbox child as non-success. The PO has authorized a
bounded, project-scoped Codex Advisor route only when it carries the selected
sandbox's exact selection, child, model-identity and cleanup evidence.

## Decision

For every Codex `epic` or `feature` Advisory entry, the model-free
`codex-host-advisor-route.mjs` selects exactly one project-scoped
`consult-advisor` when resolved consent is `default` or `approved`. The route
first creates and durably reads back an exact selected `network-open/read-only`
sandbox record, then launches one App-Server child through that record.
`declined` disables before any child or export; `mini` is disabled.

The custom agent is fresh and read-only, receives exactly one question and
allowlisted repository evidence, and inherits no chat, handover or memory. It
cannot mutate, persist, auto-apply, decide a gate, use a separate network tool
or export to a third party. The configured export of that bounded input to the
configured Codex provider remains the sole export boundary.

Only a candidate- and question-bound `pipeline.advisory-receipt.v1` together
with its exact `pipeline.codex-sandbox-execution-receipt.v1` can satisfy the
normal Codex Advisory gate. The bridge binds both to the persisted selection,
requires the configured Sol identity, completed child stdio/cleanup and equal
pre/post workspace observations. An absent, failed, retried, mutating or
unbound consult is not success and has no fallback.

Every successful claim retains the documented weaker boundary:
`sandbox-read-only-except-coordinator-scratch-network-open`; it does not claim
input/network isolation beyond that selected profile.

## Consequences

This is a narrow, selected-sandbox Host-Advisor transport, not a general
host-shell authority. It does not permit model or runner substitution,
automatic application, retries, or a stronger isolation claim. The PO may
revoke it at any time.

## Verworfene Alternativen

- Eine ungebundene Host-Shell oder eine Route ohne ausgewählte Sandbox wurde
  verworfen: sie kann weder Child noch Modellidentität attestieren.
- Ein erfundener nativer Erfolg oder ungebundene Host-Shell wurde verworfen:
  dafür gibt es keine Isolation- oder Modellidentitätsattestierung.
- Mehrere Fragen, Retries oder ein separater Netzwerkexport wurden verworfen:
  sie würden aus dem begrenzten Advisor einen zweiten Transport machen.

## Deutsche Referenz

Für Codex wird bei `epic` und `feature` mit Consent `default` oder `approved`
genau ein projektgebundener `consult-advisor` über die persistent ausgewählte
`network-open/read-only` Sandbox gestartet. `declined` und `mini` deaktivieren
den Advisor ohne Kind oder Export. Erfolg ist ausschließlich eine kandidaten-
und fragegebundene Advisory-Receipt zusammen mit der exakt gebundenen Sandbox-
Execution-Receipt, attestierter Sol-Identität und vollständigem Cleanup.
Claude-Receipt und Claude-Fallback bleiben unverändert.
