# ADR-0037: Batman bounded assurance, static Verify extension and typed delivery

> Agent-Pipeline v0.3 candidate · 2026-07-18

**Status:** accepted (PO decision of 2026-07-18)

## Context

Fresh second readiness passes rejected all five initial Batman slice Specs. The
failures shared three causes: repository hooks were described as stronger than
their real provider/tool boundary, multi-resource transactions claimed guarantees
without one recovery authority, and mutable repository content attempted to
authenticate itself. Publication additionally still had an open one-versus-two
lifecycle decision.

The PO requires Batman to retain the five confirmed Storm follow-up items and to
continue toward a PRD gate without introducing an unapproved OS sandbox,
credential broker, authenticated human capability, external registry authority,
generic plugin-activation subsystem or second publication lifecycle.

## Decision

Batman adopts the following bounded architecture:

1. **AFK assurance:** a provider-specific capability-bounded worker exposes only
   a closed declarative adapter. It makes guarantees only about the enumerated
   supported provider/tool surface. It does not claim OS isolation or universal
   network, process, credential or secret exclusion.
2. **AFK recovery:** one durable write-ahead ledger is the recovery authority.
   Private refs, machine state and eventual feature-branch movement are
   idempotent effects reconciled from explicit intermediate states. No cross-file
   atomicity is claimed.
3. **Human attribution:** `--by po` and equivalent fields remain audit
   attribution, not authentication. The existing external EL-19 PO process gate
   remains the authority. Batman adds no signature, secret or host capability.
4. **Verify extension:** the six missing Storm suites plus the explicit
   PO-gate-authority check are installed as one exact, independently reviewed
   static postimage of the existing verifier. The PO applies the fixed patch
   directly. Batman adds no reusable registry or self-authorizing mutation API.
5. **Plugin activation scope:** BTM-D owns literal linked-worktree target binding
   and a mandatory native update/reload/new-session readback prerequisite. A
   generic cross-provider activation subsystem is not part of Batman.
6. **Publication:** one Batman lifecycle owns two non-substitutable typed channel
   state machines, `private` and `neutral-public`. Each has separate intent,
   evidence, approval attribution, push observation and exact fetch-back. The
   aggregate lifecycle closes only after both channel receipts validate.
7. **Task cut:** the five product backlog items remain unchanged. Their broad
   Specs are replaced by smaller internal child contracts, each owning one trust
   or transaction boundary and receiving fresh readiness.
8. **PO artifact authority:** one active feature has exactly one PRD at the
   machine state's `planPath`, written in the repository-scoped configured PO
   language. Internal Epic slices remain Specs and cannot create parallel PRD
   gates. The Git-common-dir receipt is published from the canonical primary's
   narrow language projection; stale branch-local copies neither override it nor
   force runner-v2 migration.
9. **Worktree lifecycle:** pipeline-created persistent worktrees live only below
   `<primary-root>/branch/<ref-segments>` (or the bounded detached namespace).
   `/tmp` is ephemeral and session-owned only. Full and light close both end with
   safe owned-resource cleanup plus a post-commit clean-repository gate.
10. **Interaction continuity:** informational questions and additive PO input do
   not clear or replace active work. The Coordinator answers or incorporates
   them, then continues the persisted next action. Bootstrap and compact/resume
   re-ground this duty from machine state; only an explicit pause/cancel/replace,
   a named gate or a typed blocker may stop.
11. **Bounded Batman T1 override:** while strong Codex isolation remains
   unavailable, one exact Batman candidate may satisfy T1 through a
   PO-attributed, machine-readable override. The primary lane is the tested
   network-open/read-only sandbox with literal
   `sandbox-read-only-except-coordinator-scratch; input/network isolation not
   asserted`; exactly one same-runner contractual
   fallback is allowed only after an allowlisted technical pre-verdict failure.
   The override keeps the higher-capability `gpt-5.6-sol`/`max` route, fresh
   context, immutable packet, schema verdict and every finding-disposition duty.
   It is not a standing exception and never permits `danger-full-access`, a
   runner switch or a strong-isolation claim.

## Consequences

- Batman can provide useful AFK continuation without representing tripwire hooks
  as a sandbox.
- Recovery work must define every ledger-first intermediate state and replay;
  implementations cannot hide partial progress behind an atomicity claim.
- The Verify change is deliberately one-time and static. Future extensibility
  requires a new product decision and an independent external trust root.
- Provider update/reload remains a visible human operational prerequisite and
  never becomes implied by PRD approval.
- Private and public delivery remain separately gated and evidenced even though
  they share one aggregate Epic lifecycle.
- Specs and PRDs must state that process attribution is not authenticated caller
  identity.
- Important feature documents remain discoverable below the repository's
  canonical worktree tree; arbitrary durable `/tmp` or sibling worktrees are not
  valid pipeline placements.
- Language/cardinality and cleanup become machine-checked gate inputs instead of
  prose-only close discipline.
- Auto-compaction and ordinary dialogue are not task boundaries and cannot
  silently turn an active phase into a terminal response.
- A Batman T1 PASS may therefore carry intermediate or contractual assurance
  only when the exact candidate, packet, preflight and one-shot PO attribution
  validate. Missing verdict or mismatched evidence remains no usable review.

## Rejected alternatives

- Review-only AFK: safer but rejected because it removes the unattended mutation
  utility the PO selected for Batman.
- Git-ref authority for AFK recovery: viable but rejected because disposition and
  audit metadata would become derived and harder to recover deterministically.
- Externally anchored reusable Verify registry: rejected for Batman because it
  introduces a new external authority and product cut.
- Two publication child lifecycles plus a parent aggregator: rejected because it
  adds gate topology and coordination without a current product need.
- Authenticated PO signatures/capabilities and OS isolation: excluded from this
  decision because neither exists in the Storm baseline and both require separate
  discovery and approval.

## Follow-up

Replace the five broad Batman Specs with the internal task tree recorded in the
architecture course gate. Run readiness for every child before presenting the
single PO-readable feature PRD. Any request for stronger isolation, authenticated human
authority, reusable Verify registration, generic provider activation or separate
publication lifecycles requires a superseding ADR and PO product decision.

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation. -->

# ADR-0037: Batman — begrenzte Absicherung, statische Verify-Erweiterung und typisierte Auslieferung

**Status:** akzeptiert (PO-Entscheidung vom 18.07.2026)

## Kontext

Die frischen zweiten Readiness-Prüfungen lehnten alle fünf ursprünglichen
Batman-Slice-Specs ab. Gemeinsame Ursachen waren überhöhte Aussagen über Hooks,
fehlende Recovery-Autorität für Transaktionen über mehrere Ressourcen und der
Versuch, veränderliche Repository-Inhalte durch sich selbst zu authentifizieren.
Auch die Publikations-Topologie war noch offen.

## Entscheidung

1. AFK verwendet einen providerspezifischen Worker mit geschlossenem deklarativem
   Adapter. Garantiert wird nur die aufgezählte Provider-/Tool-Oberfläche, keine
   OS-Isolation oder universelle Netzwerk-/Secret-Sperre.
2. Ein dauerhaftes Write-ahead Ledger ist die AFK-Recovery-Autorität. Git-Refs,
   State und Branch-Bewegung sind abgleichbare Effekte; dateiübergreifende
   Atomarität wird nicht behauptet.
3. `--by po` bleibt Attribution, nicht Authentifizierung. Autorität bleibt der
   bestehende externe EL-19-Prozess.
4. Die sechs Storm-Suites und der explizite PO-Gate-Authority-Check werden durch
   einen exakt geprüften, statischen Patch im bestehenden Verifier ergänzt.
   Batman baut keine wiederverwendbare Registry.
5. BTM-D umfasst Linked-Worktree-Bindung und den nativen Update-/Reload-/Readback-
   Schritt, aber kein allgemeines Provider-Aktivierungssystem.
6. Ein Batman-Lifecycle enthält zwei nicht austauschbare Channel-State-Machines
   für private und neutral-öffentliche Auslieferung. Abschluss erfolgt erst nach
   zwei exakten Readbacks.
7. Die fünf Backlog-Items bleiben erhalten und werden intern in kleinere,
   jeweils separat Readiness-geprüfte Verträge zerlegt.
8. Ein aktives Feature besitzt genau ein PRD am maschinell gebundenen `planPath`
   in der repositoryweit gültigen PO-Sprache. Die Sprache stammt aus dem engen
   Primary-Receipt und ist von der Runner-v2-Migration entkoppelt. Interne Slices
   bleiben Specs.
9. Dauerhafte zusätzliche Worktrees liegen ausschließlich unter
   `<primary-root>/branch/...`. `/tmp` ist nur für registrierte kurzlebige
   Ressourcen zulässig; Full Close und Close-light prüfen Cleanup und einen
   sauberen Endzustand.
10. Informationsfragen und additive PO-Hinweise lassen aktive Arbeit bestehen.
    Nach der Antwort wird der gespeicherte nächste Schritt fortgesetzt; Bootstrap
    und Compact-/Resume-Re-Grounding laden diese Pflicht aus dem Machine-State.
11. Solange starke Codex-Isolation nicht nutzbar ist, darf genau ein gebundener
    Batman-Kandidat T1 über ein maschinenlesbares, dem PO zugeschriebenes
    Override erfüllen. Ist F2 grün, läuft primär die Sandbox mit offenem
    Netzwerk und genau einem Coordinator-Scratch-Write-Root unter dem Literal
    `sandbox-read-only-except-coordinator-scratch; input/network isolation not
    asserted`. Belegt F2 bereits einen erlaubten technischen Fehler vor
    Verdict-Bytes, bindet das Override diese Nichtverfügbarkeit und darf den
    gleichgerouteten vertraglichen Fallback einmalig direkt starten; derselbe
    Fallback bleibt nach einem entsprechenden Primärfehler zulässig. Sol/`max`,
    frischer Kontext, unveränderliches Paket und Schema-Verdict bleiben Pflicht.
    Das ist keine Dauer-Ausnahme und erlaubt weder `danger-full-access`,
    Runnerwechsel noch einen starken Isolationsclaim.

## Folgen

Batman ermöglicht nützliche AFK-Fortsetzung, ohne Tripwire-Hooks als Sandbox
darzustellen. Recovery muss alle Ledger-Zwischenzustände beschreiben. Verify bleibt
bewusst statisch. Plugin-Aktivierung und beide Pushes bleiben eigene sichtbare
Human-Gates. Stärkere Isolation, authentifizierte PO-Capabilities, eine
wiederverwendbare Verify-Registry oder zwei Publikations-Lifecycles benötigen eine
neue PO-Entscheidung und ein ersetzendes ADR.

## Verworfene Alternativen

Review-only AFK, Git-Ref als alleinige Recovery-Autorität, eine extern verankerte
Verify-Registry, zwei Publikations-Lifecycles sowie neue Signatur-/Sandbox-Systeme
wurden für Batman verworfen beziehungsweise ausdrücklich aus dem Sprint-Scope
ausgeschlossen.
