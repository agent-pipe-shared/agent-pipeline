# ADR-0038: Runner-neutral advisory duty v3

**Status:** accepted · **Date:** 2026-07-19

## Context

The unactivated V2 bridge preserved the legacy profile cell
`design.advisor: off`. Activating it would therefore suppress the advisory
capability that Batman had already selected. It also mixed a runner capability
with a work profile and did not define one common evidence contract for native
and consult adapters.

## Decision

V2 is not activated. A one-way V3 migration replaces it:

- the profiles are `epic`, `feature`, and `mini`; legacy `design` maps once to
  `epic`;
- advisory is a runner-neutral duty, required for Epic and Feature and disabled
  for Mini;
- Claude uses native Fable, then the explicit same-runner native Opus fallback
  after bounded repeated Fable failure, then a fresh read-only same-runner
  consult if the native adapters fail;
- Codex uses a fresh read-only Sol consult as its primary adapter; no native
  Codex advisor is invented;
- no adapter may silently switch runner, main model, role, or fallback order;
- every attempt returns the common sanitized
  `pipeline.advisory-receipt.v1`; raw questions, answers, prompts, traces, and
  errors are not persisted;
- an executable stdio host bridge drives the coordinator's registered sequence,
  binds observed provider, model and effort to the configured route, consumes
  its raw temporary input before dispatch and persists only the sanitized
  receipt;
- V3 source and owned runtime projections are changed only by an explicit,
  digest-bound `apply --activate`, with runtime written before source.
- V3 also owns a closed Critic-export allowlist and projects only its digest and
  visible external-gate boundary. A pure pre-export check binds policy, packet,
  candidate, provider and assurance; it never suppresses host/provider gates.

## Consequences

ADR-0036 remains the historical V2 record but is not an activation authority.
Fresh sessions must validate `pipeline.user.v3`, a no-op runtime projection,
the selected V3 profile, and the advisory receipt before writable work. Missing
or invalid advisory evidence fails closed and cannot create a review, readiness,
gate, or conformance claim.

## Discarded alternatives

- Reinterpreting V2 in place was rejected because it would change a frozen
  contract without a version boundary.
- Setting the legacy Design advisor to `off` was rejected because it would
  bypass the accepted Batman capability.
- A fabricated native Codex advisor or a cross-runner fallback was rejected
  because neither has an attested host capability or stable trust boundary.

## Resubmission

Revisit only when a runner adds a newly attested native advisory capability or
when the receipt/fallback trust boundary materially changes. Such a change
requires a new versioned decision and migration.

The public details and acceptance boundary are fixed by the
[decision above](#decision); no separate private migration design is required
to interpret this ADR.

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation. -->

# ADR-0038: Runner-neutrale Advisory-Duty v3

**Status:** akzeptiert · **Datum:** 2026-07-19

## Kontext

Die nicht aktivierte V2-Brücke konservierte die alte Profilzelle
`design.advisor: off`. Ihre Aktivierung hätte damit genau die in Batman bereits
gewählte Advisory-Fähigkeit unterdrückt. Außerdem vermischte sie eine Runner-
Fähigkeit mit einem Arbeitsprofil und definierte keinen gemeinsamen
Evidenzvertrag für native und Consult-Adapter.

## Entscheidung

V2 wird nicht aktiviert. Eine One-way-Migration nach V3 ersetzt sie:

- Die Profile heißen `epic`, `feature` und `mini`; das alte `design` wird
  einmalig auf `epic` abgebildet.
- Advisory ist eine runner-neutrale Duty, für Epic und Feature verpflichtend
  und für Mini deaktiviert.
- Claude nutzt natives Fable, nach begrenzt wiederholtem Fable-Ausfall den
  expliziten nativen Opus-Fallback desselben Runners und bei Ausfall der nativen
  Adapter einen frischen read-only Consult desselben Runners.
- Codex nutzt einen frischen read-only Sol-Consult als primären Adapter; ein
  nativer Codex-Advisor wird nicht erfunden.
- Kein Adapter darf Runner, Hauptmodell, Rolle oder Fallback-Reihenfolge still
  wechseln.
- Jeder Versuch liefert das gemeinsame redigierte
  `pipeline.advisory-receipt.v1`; rohe Fragen, Antworten, Prompts, Traces und
  Fehler werden nicht persistiert.
- Ein ausführbarer Stdio-Host-Bridge steuert die registrierte Coordinator-
  Reihenfolge, bindet beobachteten Provider, Modell und Effort an die
  konfigurierte Route, verbraucht seine rohe temporäre Eingabe vor dem Dispatch
  und persistiert nur das redigierte Receipt.
- V3-Quelle und eigene Runtime-Projektionen ändern sich nur über ein explizites,
  digestgebundenes `apply --activate`, Runtime vor Quelle.
- V3 besitzt außerdem eine geschlossene Critic-Export-Allowlist und projiziert
  nur deren Digest sowie die sichtbare externe Gate-Grenze. Ein reiner Pre-
  Export-Check bindet Policy, Paket, Kandidat, Provider und Assurance; Host-/
  Provider-Gates werden niemals unterdrückt.

## Folgen

ADR-0036 bleibt der historische V2-Eintrag, ist aber keine
Aktivierungsautorität. Frische Sessions müssen `pipeline.user.v3`, eine
No-op-Runtime-Projektion, das gewählte V3-Profil und das Advisory-Receipt vor
schreibender Arbeit validieren. Fehlende oder ungültige Advisory-Evidenz fällt
geschlossen aus und erzeugt keinen Review-, Readiness-, Gate- oder
Conformance-Claim.

## Verworfene Alternativen

- Eine rückwirkende V2-Umdeutung wurde verworfen, weil sie einen eingefrorenen
  Vertrag ohne Versionsgrenze verändern würde.
- `off` für den alten Design-Advisor wurde verworfen, weil es die akzeptierte
  Batman-Fähigkeit umgehen würde.
- Ein erfundener nativer Codex-Advisor oder ein runnerübergreifender Fallback
  wurde verworfen, weil dafür weder attestierte Host-Fähigkeit noch stabile
  Vertrauensgrenze existieren.

## Wiedervorlage

Nur erneut vorlegen, wenn ein Runner eine neu attestierte native Advisory-
Fähigkeit erhält oder sich die Receipt-/Fallback-Vertrauensgrenze materiell
ändert. Das erfordert eine neue versionierte Entscheidung und Migration.
