# ADR-0040: Explicit advisor export consent and sandbox-bound Bash

**Status:** accepted · **Date:** 2026-07-19

## Context

ADR-0038 made advisory mandatory for Epic and Feature, but the distribution did
not establish repository-owner consent before exporting a question and scoped
repository material to an advisor. On Codex, the available fresh consult lane
also exposes Bash rather than native Read/Grep/Glob tools. Treating either gap
as success makes a newly installed Pipeline unusable or invites an unapproved
export/tool substitution.

## Decision

- Setup asks for explicit repository-level advisor export consent and records
  the public-safe decision in `pipeline.user.yaml`.
- Missing or declined consent leaves advisory off. Advisory is optional until
  consent is explicitly enabled; no bootstrap probe, child, export, or receipt
  may be fabricated for the disabled state.
- Consent applies to configured same-runner advisors for that repository. It
  never authorizes secrets, credentials, unrelated paths, persistence of raw
  questions/answers, or a runner/model substitution.
- A Codex advisor may receive Bash in addition to Read/Grep/Glob only through
  the exact selected `network-open/read-only` sandbox transport. Repository
  writes remain denied by the compiled profile; the coordinator scratch is the
  sole writable root.
- An unbound host shell is not a fallback. No-child, profile drift, wrong
  identity, incomplete stdio/cleanup, or missing execution attestation remains
  a typed non-success.
- Setup/toolchain diagnostics actively name each missing prerequisite and print
  a copyable installation command. The Pipeline never auto-installs tools and
  never reports a missing prerequisite as ready.
- Existing V3 repositories without the new consent field migrate
  conservatively to advisory-off and receive the explicit configuration
  command; they are not silently opted in.

## Consequences

ADR-0038 remains the route, fallback, and receipt authority, but its mandatory
Epic/Feature advisory rule is superseded by the consent gate in this ADR.
Projects that approve export receive the full registered advisory duty.
Projects that do not approve it retain a functional Pipeline with advisory
visibly disabled. Bash availability does not weaken the selected sandbox or
the execution-evidence gate.

## Discarded alternatives

- Implicit consent from installing the plugin was rejected because installation
  is not informed repository-data export approval.
- Keeping Epic/Feature bootstrap blocked until consent was granted was rejected
  because the PO requires advisory to remain optional.
- Allowing arbitrary host Bash as a functional-equivalent fallback was rejected
  because it would bypass the selected read-only profile and child evidence.
- Automatically installing missing binaries was rejected because package
  management is a host mutation requiring operator authority.

## Resubmission

Revisit if Codex exposes a native enforceable Read/Grep/Glob-only child lane or
if the advisor export/data-class contract changes.

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation. -->

# ADR-0040: Explizite Advisor-Exportfreigabe und Sandbox-gebundenes Bash

**Status:** akzeptiert · **Datum:** 2026-07-19

## Kontext

ADR-0038 machte Advisory für Epic und Feature verpflichtend, ohne dass die
Distribution vorher eine Repository-Freigabe für den Export von Frage und
begrenztem Repository-Material einholte. Auf Codex stellt die verfügbare frische
Consult-Lane außerdem Bash statt nativer Read/Grep/Glob-Werkzeuge bereit. Beide
Lücken dürfen weder als Erfolg noch als still erlaubte Substitution gelten.

## Entscheidung

- Setup fragt explizit nach der repositoryweiten Advisor-Exportfreigabe und
  speichert die öffentlich sichere Entscheidung in `pipeline.user.yaml`.
- Fehlende oder abgelehnte Zustimmung lässt Advisory ausgeschaltet. Advisory
  bleibt bis zur ausdrücklichen Aktivierung optional; es gibt dann keinen Probe,
  Kindstart, Export oder erfundenes Receipt.
- Die Freigabe gilt für konfigurierte Same-Runner-Advisor dieses Repositories.
  Sie erlaubt keine Secrets, Credentials, fremden Pfade, rohe Q&A-Persistenz
  oder Runner-/Modellsubstitution.
- Ein Codex-Advisor darf Bash zusätzlich zu Read/Grep/Glob nur im exakt
  ausgewählten `network-open/read-only`-Sandbox-Transport erhalten. Der Checkout
  bleibt schreibgeschützt; nur Coordinator-Scratch ist beschreibbar.
- Eine ungebundene Host-Shell ist kein Fallback. No-child, Profildrift, falsche
  Identität, unvollständige stdio-/Cleanup-Evidenz oder fehlende Attestierung
  bleiben typisierte Nicht-Erfolge.
- Setup-/Toolchain-Diagnosen nennen jede fehlende Voraussetzung aktiv und geben
  einen kopierbaren Installationsbefehl aus. Die Pipeline installiert nie
  automatisch und meldet fehlende Werkzeuge nie als bereit.
- Bestehende V3-Repositories ohne Consent-Feld migrieren konservativ zu
  Advisory-off und erhalten den expliziten Konfigurationsbefehl.

## Folgen

ADR-0038 bleibt Route-, Fallback- und Receipt-Autorität; seine Pflicht für Epic
und Feature wird jedoch durch dieses Consent-Gate ersetzt. Mit Zustimmung läuft
die registrierte Duty vollständig. Ohne Zustimmung bleibt die Pipeline
funktionsfähig und Advisory sichtbar deaktiviert. Bash schwächt weder Sandbox
noch Ausführungsevidenz.

## Verworfene Alternativen

- Plugin-Installation als implizite Zustimmung wurde verworfen.
- Ein bis zur Zustimmung blockierter Epic-/Feature-Bootstrap wurde verworfen,
  weil Advisory optional bleiben soll.
- Beliebiges Host-Bash als Fallback wurde verworfen, weil es Profil und
  Kind-Evidenz umgehen würde.
- Automatische Tool-Installation wurde als nicht autorisierte Host-Mutation
  verworfen.

## Wiedervorlage

Bei einer nativ erzwingbaren Read/Grep/Glob-only-Codex-Lane oder einer Änderung
des Export-/Datenklassenvertrags erneut prüfen.
