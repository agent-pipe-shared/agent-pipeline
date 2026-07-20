# ADR-0042: Global observation intake and document-lifecycle governance

**Status:** accepted · **Date:** 2026-07-20 · **Decision owner:** Product Owner

## Context

Public observations were previously split between chat, repository backlog,
known-issue prose, and issue templates. Documentation cleanup could likewise
start from a few named files without proving the complete `docs/` surface,
audience, inbound links, current V3 authority, or retention lifecycle. Branch-
local state cannot safely become an alternate intake authority because GitHub
Issues are repository-global.

## Decision

- A public GitHub Issue is the repository-global, branch-independent single
  source for an observation from intake through triage and disposition. Intake
  is unconfirmed and never asserts a bug, root cause, or known error.
- The public Issue Form applies only `kind:observation` and
  `triage:needs-review`. It collects the shared sanitized behavior and observed
  environment fields and routes any possible security boundary failure to
  private vulnerability reporting before public creation. Controlled
  automation may add one verified `area:*` label.
- The lifecycle is observation → triage → confirmed → optional known-error
  classification → backlog link. Rejection, deferral, and duplicate decisions
  stay on the Issue with rationale. Backlog promotion is explicit, never
  automatic, and occurs only after triage against a stable Public branch. The
  Issue and backlog item link each other; the backlog owns delivery, not the
  original observation.
- A private overlay contains only private deltas and links to the Public Issue
  or backlog item. It neither duplicates nor replaces Public intake authority.
- Every file below `docs/` is classified on two independent machine-readable
  axes. Audience is `public-user`, `maintainer`, or `machine`; lifecycle is
  `maintained`, `normative-record`, `compatibility-redirect`, or
  `review-candidate`. Documentation triage checks the complete inventory,
  inbound links, V3 authority, and retention/redirect/migration/removal
  lifecycle before deletion. Short redirects, indexes, and superseded ADRs are
  not automatically obsolete.
- The repository checker fails closed on a missing, malformed, incomplete,
  duplicate, or stale inventory and on drift in the Issue Form, chooser,
  lifecycle, branch, or overlay contract. The Agent-Pipeline bootstrap and
  close rituals run that checker proactively. The existing documentation-
  contract Verify phase invokes the same checker, so new or changed governed
  artifacts cannot pass unnoticed.

## Consequences

One durable Issue preserves public evidence and triage independently of branch
lifetime. Accepted work remains separately prioritizable without copying the
observation. Documentation removal becomes evidence-based and reversible, and
new files make the inventory gate fail until their audience and lifecycle are
classified. No label, Issue, backlog item, or private report is created by the
checker.

The initial inventory is provisional triage evidence, not deletion authority.
Evidence snapshots and current-branch handover prose may be archive/relocation
candidates; duplicated explanatory prose may be a merge candidate; maintained
security contracts, machine evidence, and the public runtime boundary remain
distinct keep/refresh classes. This decision relocates or deletes none of them.

## Discarded alternatives

- Backlog-first intake was rejected because an untriaged observation is not an
  implementation commitment and branch-local backlog state is not global.
- Mirroring complete observations into a private overlay was rejected because
  it creates competing authorities and unnecessary private/public drift.
- Pattern-only documentation categories were rejected because broad patterns
  can silently admit a new artifact under the wrong audience or lifecycle.
- Immediate deletion of short or apparently legacy documents was rejected
  because inbound links, compatibility windows, and normative history may
  require retention.

## Resubmission

Revisit when GitHub Issue Forms support trusted dynamic area labels or when the
Public branch/release model changes. Any change to the single-source,
privacy-routing, promotion, overlay, or inventory boundary requires a
superseding ADR.

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation. -->

# ADR-0042: Globale Observation-Aufnahme und Dokument-Lifecycle-Governance

**Status:** akzeptiert · **Datum:** 2026-07-20 · **Entscheidungsowner:** Product Owner

## Kontext

Öffentliche Observations waren bisher auf Chat, Repository-Backlog,
Known-Issue-Prosa und Issue-Templates verteilt. Eine Doku-Bereinigung konnte
außerdem von wenigen genannten Dateien ausgehen, ohne die vollständige
`docs/`-Fläche, Zielgruppen, eingehende Links, aktuelle V3-Authority oder den
Aufbewahrungs-Lifecycle nachzuweisen. Branch-lokaler Zustand kann keine sichere
alternative Intake-Authority sein, weil GitHub Issues repository-global sind.

## Entscheidung

- Ein öffentliches GitHub Issue ist die repository-globale,
  branch-unabhängige Single Source einer Observation von Aufnahme über Triage
  bis zur Disposition. Die Aufnahme ist unbestätigt und behauptet weder Bug,
  Root Cause noch Known Error.
- Das öffentliche Issue Form setzt nur `kind:observation` und
  `triage:needs-review`. Es erfasst die gemeinsamen sanitisierten Verhaltens-
  und beobachteten Umgebungsfelder und leitet jede mögliche Verletzung einer
  Security-Grenze vor öffentlicher Erstellung an Private Vulnerability
  Reporting. Kontrollierte Automation darf ein geprüftes `area:*`-Label
  ergänzen.
- Der Lifecycle lautet Observation → Triage → Confirmed → optionale
  Known-Error-Klassifikation → Backlog-Link. Ablehnung, Zurückstellung und
  Duplikatentscheidung bleiben mit Begründung im Issue. Backlog-Promotion ist
  explizit, nie automatisch und erfolgt erst nach Triage gegen einen stabilen
  Public-Zweig. Issue und Backlog-Eintrag verlinken einander; der Backlog
  verantwortet Delivery, nicht die ursprüngliche Observation.
- Ein privates Overlay enthält nur private Deltas und Links zum öffentlichen
  Issue oder Backlog-Eintrag. Es dupliziert oder ersetzt die öffentliche
  Intake-Authority nicht.
- Jede Datei unter `docs/` wird auf zwei unabhängigen maschinenlesbaren Achsen
  klassifiziert. Zielgruppe ist `public-user`, `maintainer` oder `machine`;
  Lifecycle ist `maintained`, `normative-record`, `compatibility-redirect` oder
  `review-candidate`. Doku-Triage prüft vor einer Löschung das vollständige
  Inventar, eingehende Links, V3-Authority sowie Aufbewahrungs-, Redirect-,
  Migrations- und Entfernungs-Lifecycle. Kurze Redirects, Indizes und ersetzte
  ADRs sind nicht automatisch obsolet.
- Der Repository-Checker stoppt bei fehlendem, fehlerhaftem, unvollständigem,
  doppeltem oder veraltetem Inventar sowie Drift in Issue Form, Chooser,
  Lifecycle, Branch- oder Overlay-Vertrag. Bootstrap und Close der
  Agent-Pipeline führen ihn proaktiv aus. Die bestehende Documentation-
  Contract-Verify-Phase ruft denselben Checker auf, sodass neue oder geänderte
  Governance-Artefakte nicht unbemerkt passieren.

## Folgen

Ein dauerhaftes Issue bewahrt öffentliche Evidenz und Triage unabhängig von
der Lebensdauer eines Branches. Akzeptierte Arbeit bleibt separat
priorisierbar, ohne die Observation zu kopieren. Doku-Entfernung wird
evidenzbasiert und reversibel; neue Dateien lassen das Inventar-Gate scheitern,
bis Zielgruppe und Lifecycle klassifiziert sind. Der Checker erstellt keine
Labels, Issues, Backlog-Einträge oder privaten Meldungen.

Das erste Inventar ist vorläufige Triage-Evidenz, keine Lösch-Authority.
Evidenz-Snapshots und aktueller Branch-Handover-Text können Archiv-/
Verschiebekandidaten sein; doppelte Erklärung kann ein Merge-Kandidat sein;
gepflegte Security-Verträge, maschinelle Evidenz und die öffentliche
Runtime-Grenze bleiben getrennte Keep-/Refresh-Klassen. Diese Entscheidung
verschiebt oder löscht keine dieser Dateien.

## Verworfene Alternativen

- Backlog-first Intake wurde verworfen, weil eine untriagierte Observation
  keine Implementierungszusage und branch-lokaler Backlog-Zustand nicht global
  ist.
- Vollständige Observations in ein privates Overlay zu spiegeln wurde
  verworfen, weil konkurrierende Authorities und unnötiger Drift entstehen.
- Reine Musterregeln für Doku-Kategorien wurden verworfen, weil breite Muster
  neue Artefakte still der falschen Zielgruppe oder dem falschen Lifecycle
  zuordnen können.
- Sofortiges Löschen kurzer oder scheinbar alter Dokumente wurde verworfen,
  weil eingehende Links, Kompatibilitätsfenster und normative Historie ihre
  Aufbewahrung verlangen können.

## Wiedervorlage

Erneut prüfen, wenn GitHub Issue Forms vertrauenswürdige dynamische Area-Labels
unterstützen oder sich das Public-Branch-/Release-Modell ändert. Änderungen an
Single Source, Privacy-Routing, Promotion, Overlay- oder Inventargrenze
benötigen eine ersetzende ADR.
