# ADR-0043: Post-go-live Sprint model and common-base branch rule

**Status:** accepted · **Date:** 2026-07-22 · **Decision owner:** Product Owner

**Governs:** docs/operating-model.md, plugins/pipeline-core/lib/scheduling-lifecycle.mjs, plugins/pipeline-core/lib/scheduling-lifecycle.test.mjs, plugins/pipeline-core/scripts/scheduling-lifecycle.schema.json, plugins/pipeline-core/scripts/check-backlog-sprint-assignment.mjs, plugins/pipeline-core/scripts/check-backlog-sprint-assignment.test.mjs, plugins/pipeline-core/scripts/check-backlog-done-predicate.mjs, plugins/pipeline-core/scripts/check-backlog-done-predicate.test.mjs, plugins/pipeline-core/lib/parallel-sprint-integration.mjs, plugins/pipeline-core/lib/parallel-sprint-integration.test.mjs, plugins/pipeline-core/scripts/close-coordinator.mjs, plugins/pipeline-core/scripts/close-coordinator.test.mjs, plugins/pipeline-core/scripts/pipeline-state.mjs, plugins/pipeline-core/scripts/pipeline-state.test.mjs, harness/scripts/verify.mjs, harness/scripts/check-verify-suite-registration.mjs, harness/scripts/check-verify-suite-registration.test.mjs, .github/workflows/verify.yml

## Context

Sentinel is the shared delivery line for the current go-live. Follow-up work
needs three independently closable planning windows without treating a Sprint
as a lifecycle profile, runner selection, permission grant, or assurance
shortcut. A pre-go-live Sentinel candidate cannot be a safe common base: it
could silently carry unpublished sibling dependencies or bypass go-live
acceptance.

After a fresh fetch of the Public remote, the complete locally available
authoritative history and tree contain no prior Sprint identities `Nightwing`,
`Phoenix`, or `Nova`.

## Decision

- A Sprint remains a planning window. `mini`, `feature`, and `epic` remain
  lifecycle profiles. A Sprint codename selects neither profile nor runner,
  permission, or assurance level.
- The canonical follow-up planning windows are **Sprint Nightwing**
  (`nightwing`, optional GitHub label `sprint:nightwing`), **Sprint Phoenix**
  (`phoenix`, `sprint:phoenix`), and **Sprint Nova** (`nova`,
  `sprint:nova`). A single epic-profile lifecycle may use the feature ID
  `sprint-<slug>-epic`; the suffix describes only that lifecycle profile.
- Sentinel, its human go-live gates, and the accepted `main` go-live commit
  come first. Only after the accepted main OID is recorded may dedicated
  `feat/sprint-<slug>-<runner>` branches be cut from that same OID. This ADR
  creates no branch, release, label, Issue edit, or public write.
- Each follow-up Sprint must be independently closable: dedicated branch and
  paths/contracts; own PRD/spec, readiness, Verify, Security, Critic, close
  evidence, and PO acceptance; no unpublished sibling cherry-pick; and shared
  behavior only from the accepted base or a separately approved merged
  contract. Runner and effective-model observations are evidence, not scope.
  Resource and WIP limits remain binding. Two candidate runners for one Sprint
  require explicit PO selection or reconciliation before either is merged.
- Sentinel retains existing blockers `#22`, `#28`, `#33`–`#37` and adds the
  shared branch-cut prerequisites `#10` (minimum control/execution exchange)
  and `#27` (least-privilege Actions baseline). Their already-read-back Issue
  state is accepted as external evidence; this decision authorizes no further
  GitHub Issue maintenance.

| Planning window | Public issue membership | Outcome and independence boundary |
| --- | --- | --- |
| Nightwing | `#3`, `#4`, `#6`, `#11`, `#19`, `#20`, `#25`, `#26` | Product front door, safe configuration, onboarding, documentation and PR-facing adoption. `#6` closes from sanitized artifacts without `#5`; `#4`/`#26` may depend on `#25` only within this Sprint. |
| Phoenix | `#5`, `#9`, `#17`, `#23`, `#24`, `#30`, `#31`, `#32` | Evidence, governance, decisions, audit export and traceability. `#17` consumes the minimum `#10` exchange, not unpublished `#14`; `#31`/`#32` may build on `#30`/`#17`, and `#23`/`#24` on `#9`, within this Sprint. |
| Nova | `#7`, `#8`, `#12`, `#14`, `#16`, `#18`, `#21` | Execution boundary, conformance, scheduling, isolation, remote execution and worker pool. `#21` is acceptable from the minimum `#10` receipt/event envelope without the full `#17` replay model. |

`#13` is a post-parallel integration pilot; `#15` is a separately approved
post-go-live runner integration; and `#2`/`#29` remain triage observations.
None blocks independent completion of the three planning windows. If later
authorized, all three optional labels use color `5319E7` and their recorded
descriptions; labels are not created empty or by this ADR.

## Consequences

The accepted go-live OID is the only common base, preventing accidental
dependency absorption. The minimum contract in `#10` and least-privilege
baseline in `#27` are Sentinel prerequisites rather than private agreements
between later branches. Sprint scope is stable even if a runner or sibling
fails, pauses, or is rejected.

Before promotion, the active and archived Sentinel reconciliation design use
the same neutral wording for the private extension repository. Their required
byte equality and archive digest remain separately machine-verified.

## Discarded alternatives

- Cutting branches from an unfinished Sentinel candidate was rejected because
  it makes unpublished dependencies a hidden common base.
- An `epic:*` label or Sprint name selecting lifecycle/runner semantics was
  rejected because it overloads independent concepts.
- A fourth enterprise planning window was rejected; `#23` and `#24` belong to
  Phoenix.

## Resubmission

Revisit only when an accepted go-live OID exists, a shared contract must
change after go-live, or the Sprint taxonomy changes. Any further issue,
branch, label, merge, release, or promotion action uses its own authority and
gates.

## Amendment (2026-08-17) — three further planning windows: Alfred, Nightwing, Batman

The PO confirmed (2026-08-17) three further canonical planning windows,
already carrying live GitHub Issues and sprint labels in this repository:
**Sprint Alfred** (`alfred`, `sprint:alfred`), **Sprint Nightwing**
(`nightwing`, `sprint:nightwing` — same codename this ADR already reserved
above; its scope is confirmed, not new), and **Sprint Batman** (`batman`,
`sprint:batman`). The label descriptions are the authoritative scope
statement, not a table hand-copied into this ADR (issue membership under a
label changes over time; query `gh issue list --label sprint:<name>` for the
live set rather than trusting a snapshot here):

| Sprint | Label description (authoritative scope) |
| --- | --- |
| Alfred | Agent-first architecture, mechanical governance, measurable rigor, and control integrity. |
| Nightwing | Product experience: onboarding, configuration, documentation and low-friction adoption. |
| Batman | Optional capabilities: governed adapters, built-in tools, recommendations, and safe pilots. |

**Batman name reuse:** this is a second, distinct use of the codename
"Batman" — [ADR-0037](0037-batman-bounded-assurance.md) is an unrelated,
already-completed v0.3 sprint (AFK bounded-assurance architecture). The two
share a name and nothing else; ADR-0037 is not reopened or superseded by
this amendment.

**Order and current status (PO, 2026-08-17):** Cyborg is complete. Phoenix is
at approximately 90% completion and is now closed to new scope — no further
backlog item is assigned into Phoenix while it finishes. Alfred, Nightwing,
and Batman follow, in that order, once Phoenix and Nova are live; Alfred
before Nightwing, Batman last. A backlog item may be assigned into one of
these three windows ahead of its own start — the same non-scope-changing
"Sprint assignment" recording this ADR already establishes in
[the 2026-07-24 portfolio assignment evidence](../../backlog/evidence/2026-07-24-sprint-portfolio-assignment.md)
— when its content matches the window's scope and it is not needed
near-term. This creates no branch, no re-sequencing of Phoenix/Nova, and no
new lifecycle profile; the rules already stated in this ADR's Decision
section (independent branch/PRD/spec/gates per Sprint, no unpublished
sibling dependency) apply unchanged to all three.

## Amendment (2026-08-30) — Nova A / Nova B backlog windows

The PO requires Nova's two planning horizons to be machine-distinguishable in
backlog frontmatter, rather than inferred from free-form tracking prose. The
closed `sprint:` vocabulary therefore adds **Nova A** (`nova-a`) and **Nova
B** (`nova-b`). They are Nova planning windows, not lifecycle profiles,
runner selections, permission grants, branches, or a release action.

The existing `nova` value remains valid and means *deliberately unpartitioned
Nova*: it records Nova ownership without silently choosing A or B. An item
uses `nova-a` or `nova-b` once that phase is decided; otherwise it stays
`nova` and is presented for PO prioritisation. `tracking:` may explain a
decision but no longer carries the canonical A/B assignment.

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation. -->

# ADR-0043: Post-Go-live-Sprint-Modell und Common-Base-Branch-Regel

**Status:** akzeptiert · **Datum:** 2026-07-22 · **Entscheidungsowner:** Product Owner

## Kontext

Sentinel ist die gemeinsame Delivery-Line bis zum aktuellen Go-live. Die drei
folgenden Planungsfenster müssen unabhängig schließbar sein, ohne Sprint mit
Lifecycle-Profil, Runner-Wahl, Berechtigung oder Assurance-Abkürzung zu
verwechseln. Ein Sentinel-Kandidat vor Go-live ist keine sichere gemeinsame
Basis, weil er unveröffentlichte Geschwisterabhängigkeiten tragen könnte.

Nach frischem Fetch des Public-Remote enthalten die vollständig lokal
verfügbaren autoritativen History- und Tree-Refs keine frühere Sprint-Identität
`Nightwing`, `Phoenix` oder `Nova`.

## Entscheidung

- Sprint bleibt ein Planungsfenster; `mini`, `feature` und `epic` bleiben
  Lifecycle-Profile. Ein Codename wählt weder Profil noch Runner,
  Berechtigung oder Assurance.
- Die kanonischen Fenster sind **Sprint Nightwing** (`nightwing`, optional
  `sprint:nightwing`), **Sprint Phoenix** (`phoenix`, `sprint:phoenix`) und
  **Sprint Nova** (`nova`, `sprint:nova`). Ein einzelner Epic-Lifecycle darf
  `sprint-<slug>-epic` heißen; der Suffix beschreibt nur sein Profil.
- Sentinel, seine Human-Go-live-Gates und der akzeptierte Main-OID kommen
  zuerst. Erst danach dürfen Branches `feat/sprint-<slug>-<runner>` exakt von
  diesem OID geschnitten werden. Dieses ADR erzeugt weder Branch, Release,
  Label, Issue-Edit noch Public Write.
- Jeder Sprint braucht eigenen Branch und eigene Pfad-/Contract-Grenzen sowie
  PRD/Spec, Readiness, Verify, Security, Critic, Close-Evidenz und
  PO-Akzeptanz. Kein unveröffentlichter Sibling-Cherry-pick ist zulässig;
  gemeinsame Eigenschaften kommen ausschließlich von der akzeptierten Basis
  oder separat gemergten Contracts. Runner-/Modellbeobachtungen sind Evidenz,
  nicht Scope. WIP-Limits gelten weiter. Zwei Runner-Kandidaten eines Sprints
  brauchen vor Merge eine explizite PO-Auswahl oder -Abstimmung.
- Sentinel behält `#22`, `#28`, `#33`–`#37` und die Branch-Cut-Voraussetzungen
  `#10` (minimaler Control/Execution-Austausch) und `#27`
  (Least-Privilege-Actions-Basis). Der gelesene Issue-Stand ist externe
  Evidenz; dieses ADR autorisiert keine weiteren GitHub-Issue-Änderungen.

| Planungsfenster | Öffentliche Issue-Mitgliedschaft | Ergebnis und Unabhängigkeitsgrenze |
| --- | --- | --- |
| Nightwing | `#3`, `#4`, `#6`, `#11`, `#19`, `#20`, `#25`, `#26` | Product Front Door, sichere Konfiguration, Onboarding, Dokumentation und PR-Adoption. `#6` schließt mit sanitisierten Artefakten ohne `#5`; `#4`/`#26` dürfen nur Sprint-intern auf `#25` aufbauen. |
| Phoenix | `#5`, `#9`, `#17`, `#23`, `#24`, `#30`, `#31`, `#32` | Evidenz, Governance, Entscheidungen, Audit-Export und Traceability. `#17` konsumiert den minimalen `#10`-Austausch, nicht unveröffentlichtes `#14`; die genannten Sprint-internen Abhängigkeiten bleiben begrenzt. |
| Nova | `#7`, `#8`, `#12`, `#14`, `#16`, `#18`, `#21` | Execution Boundary, Conformance, Scheduling, Isolation, Remote Execution und Worker Pool. `#21` ist mit dem minimalen `#10`-Receipt/Event-Envelope ohne vollständiges `#17`-Replay akzeptabel. |

`#13` bleibt Post-Parallel-Integrationspilot, `#15` eine separat genehmigte
Post-Go-live-Runner-Integration und `#2`/`#29` Triage-Observations. Sie
blockieren keinen der drei Sprints. Spätere optionale Labels verwenden Farbe
`5319E7` und die dokumentierten Beschreibungen; sie entstehen nicht leer und
nicht durch dieses ADR.

## Folgen

Der akzeptierte Go-live-OID ist die einzige gemeinsame Basis. `#10` und `#27`
sind Sentinel-Voraussetzungen statt privater Absprachen zwischen späteren
Branches. Sprint-Scope bleibt stabil, wenn ein Runner oder Sibling ausfällt,
pausiert oder abgelehnt wird.

Vor Promotion verwenden aktives und archiviertes Sentinel-Reconciliation-
Design dieselbe neutrale Benennung des privaten Erweiterungs-Repositorys. Die
erforderliche Byte-Gleichheit und das Archiv-Digest bleiben maschinell
verifiziert.

## Verworfene Alternativen

- Branches aus unfertigem Sentinel wurden wegen verdeckter Abhängigkeiten
  verworfen.
- Sprint-/`epic:*`-Namen als Lifecycle- oder Runner-Semantik wurden verworfen.
- Ein viertes Enterprise-Planungsfenster wurde verworfen; `#23` und `#24`
  gehören zu Phoenix.

## Wiedervorlage

Erst bei akzeptiertem Go-live-OID, notwendiger Post-Go-live-Contract-Änderung
oder geänderter Sprint-Taxonomie erneut vorlegen. Jeder weitere Issue-,
Branch-, Label-, Merge-, Release- oder Promotion-Schritt benötigt eigene
Authority und Gates.

## Ergänzung (2026-08-30) — Nova-A-/Nova-B-Backlog-Fenster

Der PO verlangt, dass die beiden Nova-Planungshorizonte im Backlog-Frontmatter
maschinell unterscheidbar sind, statt aus Freitext in `tracking:` abgeleitet
zu werden. Der geschlossene `sprint:`-Wortschatz ergänzt daher **Nova A**
(`nova-a`) und **Nova B** (`nova-b`). Das sind Nova-Planungsfenster, keine
Lifecycle-Profile, Runner-Wahlen, Berechtigungen, Branches oder Release-Aktionen.

Der bestehende Wert `nova` bleibt gültig und bedeutet *bewusst nicht
aufgeteiltes Nova*: er ordnet Nova zu, ohne still A oder B zu wählen. Sobald
die Phase entschieden ist, wird `nova-a` oder `nova-b` gesetzt; andernfalls
bleibt das Item `nova` und wird dem PO zur Priorisierung vorgelegt.
`tracking:` kann eine Entscheidung erklären, ist aber nicht mehr die
kanonische A/B-Zuordnung.
