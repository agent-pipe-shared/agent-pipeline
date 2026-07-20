# ADR-0039: Hawkeye adoption, host-compatibility, and lifecycle boundaries

> _A German reference follows below._

**Status:** proposed for the Hawkeye PRD gate (2026-07-19)
**Decision owner:** Product Owner through the sole German Hawkeye PRD
**Related:** ADR-0009, ADR-0010, ADR-0011, ADR-0029, ADR-0030, ADR-0032, ADR-0037

## Context

Hawkeye adds host/project lifecycle capabilities and a public-adoption surface
to the V3 pipeline.
Session keep-awake has an operating-system side effect that must outlive a
one-shot bootstrap command without becoming an unbounded orphan. Regulated
document checks combine public enforcement configuration with private triggers,
templates, outputs, and review evidence. Existing cleanup manifests are
file-oriented, artifact lifecycle v1 is closed, and governance already separates
Policies from personal user configuration.

## Decision

1. Session power is personal V3 intent projected from
   `pipeline.user.yaml`. After the read-only bootstrap confirmation, a one-shot
   CLI starts a shipped, repository/session-bound controller. The controller,
   not bootstrap, owns fixed platform adapters and pipes. It has an exact private
   record, CAS lock, executable/PID/start bindings, immediate normal Close, and
   a non-renewable 12-hour safety lease. Missing platform capability is honest
   `unavailable`; ambiguous cleanup is `cleanup-pending` and blocks Close. Its
   only post-start record write is a restricted heartbeat CAS that cannot renew
   the lease or change identity/status.
2. Regulated-document configuration is an enforcing typed Policy inside the
   configured repo `governance.policies_path`, following ADR-0030's Policy
   category. User scope cannot issue it. ADR-0030's Managed layer remains an
   external deployment concern; Hawkeye ships no managed source/issuer and
   makes no independent managed-precedence claim. The
   public Policy contains only generic classes, opaque binding IDs, mode, and
   lifecycle events. Each configured class/event pair is an independent
   evidence unit and the public lifecycle is the exact deterministic Policy
   expansion. Mandatory unresolved state blocks; advisory lifecycle status is
   recorded but never blocks Verify/CAS/Close or contributes a success claim.
   Multiple review jobs and unaffected rationales are resolved only by their
   journalled monotonically revised current pointers, never timestamps. An
   expired rationale may be renewed for an unchanged candidate/diff only through
   a fresh evidence record and pointer CAS. Trigger paths, adapter coordinates, content, outputs, review
   evidence, and HMAC keys remain mode-`0600` below one physical Git-common-dir
   namespace using the existing canonical repository fingerprint.
3. Private bindings and adapters are atomically created as owner-only records;
   adapters are explicitly registered by executable identity and use a fixed
   stdio protocol with `shell:false`. Data never supplies an executable or argv.
   The coordinator streams the bounded renderer output into owned staging;
   renderers receive no output path. Adapters remain explicitly trusted code in the
   adopting organisation's OS-user boundary; Hawkeye does not claim sandbox or
   confidentiality against them. Rendering is available only where a Linux
   transient systemd service supplies a kernel-enforced five-minute cgroup
   descendant boundary; other platforms report unavailable. Public Results contain only generic state and an HMAC commitment
   to a candidate-bound private receipt.
4. Artifact lifecycle v1 remains byte/shape compatible. Hawkeye introduces
   artifact lifecycle v2 with a required `documentLifecycle` projection and a
   four-digest versioned close transition. An absent Policy is represented by a
   typed, hashed no-op projection, not by an ambiguous optional field.
5. Stage-1 Verify, Result intent, locked State CAS, and final Verify bind the
   same document lifecycle and candidate. Unresolved mandatory state cannot
   produce success. After attributed plan revocation, typed abandonment may
   unblock a separately typed, verified `rolled-back` terminal transition but
   never produces Close, delivery, review, or conformance success; affected
   backlog items remain open.
   No rollback transition contains the commit/tree hash of bytes that contain
   that transition: committed down-migration candidate, state-CAS verification,
   terminal state audit, and private terminal receipt are separate bindings.
   The terminal commit is verified and its private receipt made durable before
   its ref is CAS-published. Compatibility readers/recovery remain as an inert
   migration bridge; rollback does not remove its own recovery authority.
   Terminal ref publication derives the current symbolic branch, respects the
   existing branch guard/worktree boundary and uses full OIDs for the repository
   object format. The intent binds the ref name; only after both commit identities
   exist does an expiring one-shot local-ref authorization bind expected/new OIDs
   and exact `update-ref`. Detached, dirty, protected-unapproved or multiply
   checked-out targets fail before publication.
6. The public documentation path is README (benefit-first entry for readers
   without SDLC/EGM knowledge), PIPELINE_FLOW (sole maintained user-facing V3
   option flow), and Operating Model (smoothed normative contract). Exactly
   these three carry complete English authority followed by a complete German
   reader copy with checked semantic parity. A fresh early read-only technical
   Critic and evidence-bound capability/content/authority inventories precede
   prose reduction; only evidenced support/benefit claims enter the front
   doors, and redirect stubs remain for one release. Setup separately covers
   first installation, per-repository activation, existing-repository migration
   and schema-backed extension points. Setup/Flow also carry schema-validated
   end-to-end document/session journeys and typed safe sandbox remediation.
   Capability evidence is reconciled to the integrated product candidate before
   prose and to active anchors after prose. README distinguishes solo, small-team
   and multi-team governance without claiming an IAM or central control plane.
7. Actor/`--by` fields are audit attribution inside the existing trusted host
   and repository boundary, not authenticated identity, authorization, or
   non-repudiation. Private-operation attribution remains private; tracked
   state/HISTORY uses only the opaque operation reference. Hawkeye adds no
   authentication mechanism (ADR-0037). Optional V3
   `roles.po.display_label` changes only the safe human-facing address and
   defaults to `PO`; all machine authorities remain literal `po`, and the label
   is never persisted as identity/evidence.
8. Every Hawkeye transition spanning more than one durable resource has one
   private write-ahead journal with closed adjacent phases, exact pre/post bytes,
   CAS recovery and a fail-closed third-state rule. Runtime activation, binding
   creation, evidence import/current pointers, render commit, abandonment,
   rollback, joint branch/tag publication and three-item backlog close do not
   assume filesystem/Git/private-store cross-file atomicity.
9. On a Codex host tuple for which the committed compatibility policy and
   current model-free preflight prove the network-denied child/stdio defect,
   every sandboxed read-only advisory, readiness and Critic duty enters one
   generic bridge and selects the existing exact
   network-open/read-only intermediate profile before its first child. The
   selection and observed execution are separately receipt-bound to the duty
   dispatch. User prose is never launch authority; missing/drifted evidence
   fails before model invocation. `danger-full-access`, runner/model changes and
   any strong isolation claim remain forbidden. The exact assurance stays
   `sandbox-read-only-except-coordinator-scratch; input/network isolation not asserted`.
   This is a host-compatibility activation, not the upstream-gated strong Critic
   route activation from ADR-0037.
10. Hawkeye implementation packages are independently testable/revertible only
    before integration. Product delivery, Result, rollback and backlog close
    are one atomic Epic boundary. The three item records plus ledger/STATUS/index
    close through one Result-bound recoverable batch writer; no sequence of three
    independent item transitions may claim success. No partial Hawkeye success
    or per-workstream authority is introduced; a failed/revoked integrated
    candidate leaves all three product backlog items open.
11. Hawkeye's release version is shared by the private working repository and
    neutral-public export. A closed plan derives the next minor above the
    greater freshly fetched stable SemVer baseline (currently expected
    `v0.4.0`) and requires equality across VERSION, both plugin manifests, the
    versions resolved through both marketplace entries and both immutable tag
    names. The plan binds non-circular product identities. After both separate
    consents, private Result/state bookkeeping is constructed and verified
    off-ref; a joint authorization then maps product identities to exact channel
    delivery commits, the exact private local branch/worktree CAS, annotated tag
    objects, branch/tag commands and readbacks. V2 push authority is selected
    through one fixed owner-only Git-common-dir pointer in each channel
    repository, never through caller path input or a tracked-State mutation
    after delivery Verify; v1's tracked projection remains unchanged.
    Observations are at most 15 minutes old and the 24-hour current review/
    rationale evidence is rechecked at that authorization instant. Both
    approvals precede off-ref Result construction and every ref/tag mutation.
    Prepublication expiry rearms evidence/plan/approvals; after the first
    private local ref CAS only immutable recovery or a higher synchronized
    compensating release is allowed. One-channel or version-divergent publication is
    incomplete and cannot close Hawkeye.
12. The separate source-available commercial-licensing backlog item remains
    outside Hawkeye authority but is a hard prerequisite to either release
    consent or Result intent. It must close under its own approval and both
    candidate trees must pass the license gate. Any overlap with Hawkeye-owned
    documentation is rebased, re-inventoried and delta-readied; this ADR grants
    no relicensing, contribution, trademark or commercial-term authority.

PRD approval accepts this proposed ADR. Any later change to these boundaries
requires a superseding ADR or renewed PO gate; implementation details that stay
inside them remain governed by the level-2 Spec.

## Consequences

- Host effects are bounded and exactly owned, but a crashed session may retain
  an inhibitor until recovery or the 12-hour lease expires.
- Public repositories can enforce lifecycle completeness without receiving
  organisational coordinates or raw private receipt digests.
- A second artifact-lifecycle version and explicit down-migration increase
  implementation/test cost while preserving v1 compatibility.
- Private adapters and receipt retention remain the adopting organisation's
  responsibility; the public core asserts integrity, not legal sufficiency or
  authorship.
- Private review, rationale, and lifecycle receipts are candidate-bound and
  expire after 24 hours under the monotonic private observer record; exact
  review/rationale current pointers prevent timestamp races and permit explicit
  same-candidate rationale renewal after expiry.
- A known Codex host defect is handled from machine evidence rather than PO
  memory, while network/input isolation remains explicitly unclaimed.
- Public product claims become easier to understand and harder to overstate:
  an early technical audit and checked capability/support map precede the
  benefit-first bilingual prose.
- Teams may use their real decision-role title in conversation without changing
  machine authority or implying authenticated personal identity.
- Vertical package rollback stays cheap before integration; the public product
  has no ambiguous partially delivered Hawkeye state.
- Dual-channel release consistency is explicit, but separate push/tag consent
  remains required; non-circular off-ref delivery construction and a joint
  authorization plus fixed private guard pointers add machinery, while expired
  evidence can still be rearmed before the first private local ref mutation.
- Hawkeye implementation can reach a verified candidate while publication waits
  for separately governed licensing; overlapping changes require renewed
  candidate evidence rather than implicit scope expansion.

## Rejected alternatives

- A generic shell hook bus: excessive execution authority.
- A power child owned by bootstrap: bootstrap exits too early.
- An unbounded/auto-renewed daemon: indefinite orphan risk.
- Reusing Policy Lock/private overlay for document content: authority breach.
- Widening artifact lifecycle v1: violates its closed contract.
- Publishing trigger paths or raw receipt digests: privacy/correlation leak.
- Trying the known-broken network-denied Codex sandbox first and asking the PO
  for the workaround after failure: machine-known incompatibility must not
  depend on operator memory.
- Per-workstream Hawkeye Results and closes: they conflict with the selected
  single active-feature/WIP authority and add a second lifecycle model.
- An unverified marketing feature list: it can omit shipped value or overclaim
  planned/host-dependent support.
- Free-text renaming of the machine `po` role: presentation must not redefine
  gates, actors or evidence.
- Independent private/public version numbers: they create an ambiguous support
  surface even when both channels contain the same product release.

## Follow-up

- PO decision at the Hawkeye PRD gate.
- Redirect-stub removal review on 2026-09-01.
- Native platform claims remain limited to executed evidence; fixture-only
  adapters are labeled as such.

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line. -->

# ADR-0039: Hawkeye-Grenzen für Adoption, Host-Kompatibilität und Lifecycle

**Status:** vorgeschlagen für das Hawkeye-PRD-Gate (2026-07-19)

## Kontext

Das sessiongebundene Wachhalten muss einen kurzen Bootstrap-Aufruf überleben,
darf nach einem Absturz aber nicht unbegrenzt bestehen. Regulierte Dokumente
benötigen gleichzeitig öffentliche Durchsetzungsregeln und strikt private
Auslöser, Inhalte und Nachweise. Die bestehenden Cleanup- und Artifact-Verträge
sind dafür bewusst zu eng.

## Entscheidung
Das Wachhalten wird nach der read-only Bestätigung von einem festen, exakt
gebundenen Controller übernommen. Normaler Close beendet ihn sofort; ohne
Recovery endet er spätestens nach zwölf Stunden; sein eng begrenzter Heartbeat
darf weder Identität noch Frist verändern. Regulierte Dokumente nutzen
eine typisierte Policy im vorhandenen Policies-Pfad, während Trigger, Adapter,
Inhalte und Receipts mode-`0600` in einem kanonischen Git-Common-Dir bleiben.
Jedes konfigurierte Klassen-/Ereignispaar ist eine eigene Nachweiseinheit.
Offene Pflichtzustände blockieren; Advisory-Zustände werden ohne Erfolgsclaim
und ohne Verify-/CAS-/Close-Block festgehalten. Bei mehreren Review-Jobs oder
Begründungen gilt nur der jeweilige journalgebundene monotone Current-Pointer,
nie der Zeitstempel; eine unveränderte Begründung kann erst nach Ablauf mit
frischer Evidenz und CAS erneuert werden.
Bindings und Adapter entstehen atomar; der Coordinator streamt begrenzten
Renderer-Output in kontrolliertes Staging. Adapter bleiben aber ausdrücklich vertrauenswürdiger
Code innerhalb der privaten OS-Nutzergrenze und sind nicht sandbox-isoliert.
Renderer laufen nur auf Linux mit nachgewiesener transienter systemd-Cgroup-
Grenze; andere Plattformen melden die Fähigkeit als nicht verfügbar. Alle
Übergänge über mehrere dauerhafte Ressourcen besitzen ein privates, phasenweises
Journal mit exakten Vor-/Nachbildern und fail-closed Recovery.
Öffentliche Results tragen nur generische Zustände und eine
HMAC-Verpflichtung. Artifact Lifecycle
v1 bleibt unverändert; Hawkeye führt eine getrennte v2 mit verpflichtendem
Document-Lifecycle-Digest ein. Offene Pflichtnachweise blockieren Erfolg;
attributierte Aufgabe nach Planwiderruf erlaubt nur einen eigenen verifizierten
Terminalzustand `rolled-back`, nie Close, Delivery oder einen Erfolgsclaim.
Down-Migration, State-CAS-Nachweis, Terminal-Audit und privater Receipt werden
getrennt gebunden; kein Git-Objekt enthält seinen eigenen Hash. Der vorbereitete
Terminal-Commit wird vor seiner Ref-Freigabe verifiziert und privat quittiert;
die Ref-Bezeichnung wird im Intent, die erwartete/neue OID erst später in einer
kurzlebigen einmaligen Local-Ref-Autorisierung gebunden. Die inaktive
Kompatibilitäts-/Recovery-Brücke bleibt erhalten.
README, Flow und Operating Model bilden die drei öffentlichen Einstiegsebenen.
Genau diese drei tragen vollständiges maßgebliches Englisch und darunter eine
vollständige deutsche Lesefassung mit Paritätsprüfung. Ein früher frischer
technischer Read-only-Critic sowie evidenzgebundene Funktions-, Inhalts- und
Authority-Inventare gehen jeder Kürzung voraus. Das README beginnt für Leser
ohne SDLC-/EGM-Vorwissen mit Problem, Nutzen und nächstem Schritt und erklärt
Einzelentwickler-, Kleinteam- und Multi-Team-Governance ohne IAM- oder zentrale
Control-Plane-Behauptung. Setup trennt Erstinstallation, Aktivierung je Repo,
Bestandsmigration und schemageprüfte Erweiterungen. Setup und Flow zeigen
außerdem vollständige schemageprüfte Dokument-/Session-
Bedienerreisen und sichere typisierte Sandbox-Abhilfe. Das Funktionsinventar
wird vor und nach der Doku gegen den stabilen Produktkandidaten abgeglichen. Die optionale
V3-Bezeichnung `roles.po.display_label` ändert nur die sichere menschliche
Anrede; alle Maschinenverträge bleiben `po` und die Anzeige ist kein
Identitäts- oder Berechtigungsnachweis.
Auf nachweislich betroffenen Codex-Hosts wird vor dem ersten sandboxed
Advisory-, Readiness- oder Critic-Aufruf über eine gemeinsame Bridge automatisch
das dokumentierte netzoffene Zwischenprofil
gewählt; fehlende oder driftende Evidenz stoppt vor dem Modell. Nutzerprosa ist
keine Modus-Autorität, `danger-full-access` und ein starker Isolationsclaim
bleiben verboten. Umsetzungspakete sind nur bis zur Integration einzeln
rücknehmbar; Result, Auslieferung, Rollback und Backlog-Abschluss bilden einen
atomaren Hawkeye-Epic-Zustand. Die drei Items sowie Ledger/STATUS/Index schließen
nur über einen gemeinsamen Result-gebundenen Recovery-Writer. Privater
Arbeitsstand und neutraler öffentlicher Export erhalten über einen geschlossenen
Plan dieselbe nächste Minor-Version oberhalb beider Baselines, aktuell erwartbar
`v0.4.0`. Der Plan bindet Produktidentitäten; nach beiden getrennten Freigaben
wird das private Result-/State-Delta off-ref gebaut und verifiziert, bevor eine
gemeinsame Autorisierung Delivery-Commits, den exakten privaten lokalen Branch-/
Worktree-CAS, annotierte Tags, vier entfernte Befehle und Readbacks bindet. Der
v2-Push-Guard liest je Kanal nur einen festen privaten Git-Common-Dir-Pointer,
nie einen Aufruferpfad oder nach der Delivery-Verifikation geänderten tracked
State; die v1-Projektion bleibt unverändert. Kanalbeobachtung und 24-Stunden-
Dokumente werden an diesem Zeitpunkt erneut geprüft; Ablauf vor dem ersten
privaten lokalen Ref-CAS erneuert Evidenz, Plan und Freigaben. Ein einzelner oder
abweichend versionierter Kanal schließt Hawkeye nicht.
Das separate Source-available-Licensing-Item bleibt außerhalb der Hawkeye-
Autorität, muss aber unter eigener Freigabe vor beiden Releasefreigaben und dem
Result-Intent schließen. Beide Kandidaten bestehen danach das Lizenz-Gate;
überlappende Hawkeye-Dokumente werden neu gebunden und delta-readied.

## Folgen

Ein Crash kann den Wachhalter bis zur Recovery oder höchstens zwölf Stunden
stehen lassen. Der öffentliche Core kann Vollständigkeit prüfen, ohne private
Organisationsdaten zu erhalten. Versionierung, Down-Migration und private
Adapter erhöhen den Aufwand; rechtliche Eignung und Aufbewahrung bleiben in der
Verantwortung der einführenden Organisation.
Die verständlichere zweisprachige Produktoberfläche kostet zusätzliche
Inventar-, Paritäts- und Reviewpflege, begrenzt dafür aber ausgelassene
Funktionen und unbelegte Marketingclaims. Eine gemeinsame Releaseversion macht
Support eindeutig, kann den Abschluss jedoch bis zu beiden getrennten
Kanal-Freigaben am Gate warten lassen. Nicht-zirkuläre off-ref-Auslieferung,
lokaler Branch-/Worktree-CAS und feste private Guard-Pointer erhöhen den
Mechanikaufwand; vor dem ersten lokalen Ref-CAS kann abgelaufene Evidenz noch
vollständig neu gebunden werden.
