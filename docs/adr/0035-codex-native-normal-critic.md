# ADR-0035: Codex normal Critic through a native host boundary

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

> Agent-Pipeline v0.3 candidate · 2026-07-15

**Status:** accepted (PO-approved Phase-2 close design, 2026-07-15)

## Context

The existing Critic contract assumes a fresh read-only reviewer and requires a
stronger isolated run for architecture, guardrail, and security changes. Codex
CLI isolation research produced useful fail-closed controls, but the external
review process repeatedly stalled after its turn began and returned no verdict.
That research must remain available without making the normal review path
depend on a non-working nested CLI lifecycle.

Codex also needs an explicit review duty. The prior runner mapping proved only
the alias `Fable -> gpt-5.6-sol` at an unchanged effort; it intentionally made
no complete Codex duty claim.

## Decision

Add the provider-neutral host duty `criticNormal` and map it for Codex to
`gpt-5.6-sol/xhigh`. Existing Claude Critic assignments stay unchanged.

The v0.3 implementation is deliberately a maintainer/self-application gate.
Both prepare and finalize require an explicit clean, full Shared ruleset Git
checkout that is physically separate from the candidate source and at the same
exact commit. The executing harness, routing projection, configurations, and
validator schemas must be byte-identical to that pinned checkout. Hidden index
flags are rejected. An installed plugin cache is not silently treated as
equivalent provenance; a future cache-native projection needs its own
manifest/cache-evidence contract.

For a `T1` dispatch the strict request also carries a sanitized named-PO-waiver
binding: authority role, risk ID, bounded scope, authorization evidence hash,
and the exact authorized candidate commit. Prepare rejects a missing, malformed,
or stale binding. The sanitized receipt repeats it so the private close gate can
verify the underlying decision without disclosing private decision prose.

The normal Codex path is split across a deterministic coordinator harness and
the native host agent surface:

1. `codex-critic-host.mjs prepare` validates an exact full-SHA candidate,
   creates an independent disposable checkout, removes every Git remote, runs
   the calibrated verify command under a stripped environment, binds
   source-qualified references and content fingerprints, generates a bounded
   deterministic reference containing the exact ordered commit SHAs between
   review base and candidate. That reference path is coordinator-reserved and
   can never be supplied as request evidence. Prepare then writes a `0600`
   dispatch packet plus an undisclosed consumption record below a private,
   symlink-safe coordinator control directory. The candidate, ruleset, and the
   mandatory `private` and `shared` observers are captured before and checked
   after every candidate-controlled subprocess.
2. The Elephant starts exactly one fresh native host Critic with no chat
   history. The host owns dispatch, progress observations, interrupt, and at
   most one recovery. Repository code never starts an agent process.
3. The Elephant captures exactly one structured result. Only
   `codex-critic-host.mjs finalize` may validate it and create the sanitized
   receipt after checking route, nonce, candidate, liveness, verdict,
   references, ignored/untracked content, Git-administration and object
   inventories, and after-fingerprints.
   Finalization uses an exclusive, crash-recoverable single-use publication
   transaction with atomic no-overwrite publication and durable markers. PASS
   and FAIL both produce a disposition receipt; free-form finding text remains in the private host
   return, while the receipt keeps only closed citations, severities, IDs, and
   hashes.

The receipt states the achieved level verbatim:

`normal-contractual-read-only; OS isolation not asserted`

The host currently provides no cryptographic attestation of model identity or
tool use. The receipt distinguishes the requested/coordinator-confirmed route
from provider attestation and keeps the latter false.

The read-only Critic has no writer diff to use as a heartbeat. Its lease is
therefore evidence-based: first concrete evidence within 60 seconds, then a
new content-bound review milestone within 180 seconds, with an unchanged total
lease of 480 seconds. Writer lanes instead use diff/test/evidence progress and
must not treat elapsed wall time alone as a stall.

Trajectory consistency concerns the calibrated verify artifacts and reviewed
commit. Fresh-context dispatch and host execution are validated after the
Critic result by the coordinator envelope; their absence from candidate
evidence or commit trailers is not by itself a trajectory gap.

## Consequences

- A working Codex normal-review gate no longer depends on nested CLI process
  completion.
- Hash binding, no-remote review material, mandatory identity-bound observers,
  strict schemas, recoverable single-use publication, evidence-bound liveness,
  and content-aware worktree-directory plus Git-administration mutation
  detection fail closed.
- The controls do not prove absence of private reads, write-then-restore,
  writes outside observed roots, hidden tools, network effects, prompt
  injection, provider fallback, or escaped processes.
- Final fingerprints are sequential point-in-time snapshots. An escaped process
  can make them stale after capture; the receipt does not claim a transactional
  cross-repository snapshot.
- Review-checkout cleanup is a separate best-effort hygiene step after the
  receipt is durable; cleanup success is not part of the review verdict.
- This lane does **not** satisfy the mandatory isolated T1 path. Using it in
  place of T1 requires a named, scope-bounded PO risk waiver. It never creates
  an isolation or Codex-conformance claim.
- The deferred sandbox implementation remains separate research and may be
  resumed only through its explicit backlog re-entry triggers.

## Rejected alternatives

- Keep retrying the nested sandbox Critic: rejected for the v0.3 close after
  repeated bounded runs produced no verdict.
- Relabel net-state checks as isolation: rejected because detection is not
  confinement.
- Remove independent review: rejected because the native host Critic remains a
  useful and functioning semantic gate.
- Change the existing Claude Critic route: rejected; this decision adds one
  Codex host duty and leaves Claude assignments intact.

## Revisit

Re-evaluate when Codex exposes stable structured lifecycle/tool telemetry, a
separately approved OS isolation adapter exists, or a newer CLI demonstrably
fixes the archived post-turn stall.

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

# ADR-0035: Normaler Codex-Critic über eine native Host-Grenze

> Agent-Pipeline v0.3 candidate · 2026-07-15

**Status:** akzeptiert (vom PO freigegebenes Phase-2-Close-Design, 2026-07-15)

## Kontext

Der bestehende Critic-Vertrag setzt einen frischen Read-only-Reviewer voraus und
fordert für Architektur-, Guardrail- und Sicherheitsänderungen einen stärkeren
isolierten Lauf. Die Codex-CLI-Isolationsforschung lieferte nützliche
fail-closed Kontrollen, doch der externe Review-Prozess blieb wiederholt nach
Turn-Beginn stehen und lieferte kein Verdict. Diese Forschung bleibt erhalten,
ohne dass der normale Review-Pfad von einem nicht funktionierenden verschachtelten
CLI-Lebenszyklus abhängt.

Codex braucht außerdem eine explizite Review-Duty. Das bisherige Runner-Mapping
belegt nur den Alias `Fable -> gpt-5.6-sol` bei unverändertem Effort; es erhob
bewusst keinen vollständigen Codex-Duty-Claim.

## Entscheidung

Die providerneutrale Host-Duty `criticNormal` wird ergänzt und für Codex auf
`gpt-5.6-sol/xhigh` abgebildet. Bestehende Claude-Critic-Zuweisungen bleiben
unverändert.

Die v0.3-Implementierung ist bewusst ein Maintainer-/Self-Application-Gate.
Prepare und Finalize verlangen beide einen expliziten sauberen vollständigen
Shared-Ruleset-Git-Checkout, der physisch von der Kandidatenquelle getrennt ist
und auf demselben exakten Commit steht. Ausführender Harness, Routing-Projektion,
Konfigurationen und Validator-Schemas müssen byteidentisch zum gepinnten Checkout
sein. Versteckte Index-Flags werden abgewiesen. Ein installierter Plugin-Cache
gilt nicht stillschweigend als gleichwertige Provenienz; eine spätere
cache-native Projektion benötigt einen eigenen Manifest-/Cache-Evidence-Vertrag.

Für einen `T1`-Dispatch trägt der strikte Request zusätzlich eine sanitisierte
Named-PO-Waiver-Bindung: Authority-Rolle, Risk-ID, begrenzter Scope,
Autorisierungs-Evidence-Hash und exakt autorisierter Kandidatencommit. Prepare
weist fehlende, fehlerhafte oder veraltete Bindungen ab. Das sanitisierte Receipt
wiederholt sie, damit das private Close-Gate die zugrunde liegende Entscheidung
ohne private Entscheidungstexte prüfen kann.

Der normale Codex-Pfad ist zwischen deterministischem Coordinator-Harness und
nativer Host-Agent-Oberfläche aufgeteilt:

1. `codex-critic-host.mjs prepare` validiert einen exakten Full-SHA-Kandidaten,
   erstellt einen unabhängigen disponiblen Checkout, entfernt alle Git-Remotes,
   führt das kalibrierte Verify unter einer bereinigten Umgebung aus, bindet
   quellenqualifizierte Referenzen und Content-Fingerprints und erzeugt eine
   begrenzte deterministische Referenz mit den exakten geordneten Commit-SHAs
   zwischen Review-Base und Kandidat. Dieser Referenzpfad ist für den
   Coordinator reserviert und darf nie als Request-Evidence geliefert werden.
   Prepare schreibt danach ein `0600`-Dispatch-Paket und einen nicht offengelegten
   Consumption-Record unterhalb eines privaten symlinksicheren
   Coordinator-Control-Verzeichnisses. Kandidat, Ruleset und die verpflichtenden
   `private`- und `shared`-Observer werden vor und nach jedem kandidatenkontrollierten
   Subprozess erfasst.
2. Der Elephant startet genau einen frischen nativen Host-Critic ohne Chat-Historie.
   Der Host verantwortet Dispatch, Fortschrittsbeobachtung, Interrupt und höchstens
   eine Recovery. Repository-Code startet keinen Agent-Prozess.
3. Der Elephant erfasst genau ein strukturiertes Resultat. Nur
   `codex-critic-host.mjs finalize` darf es validieren und danach das sanitisierte
   Receipt erzeugen; geprüft werden Route, Nonce, Kandidat, Liveness, Verdict,
   Referenzen, ignored/untracked Content, Worktree-Verzeichnisse,
   Git-Administration, Objektinventare und After-Fingerprints. Finalize nutzt
   eine exklusive, crash-recoverable Single-use-Publikationstransaktion mit
   atomarer No-overwrite-Publikation und dauerhaften Markern. PASS und FAIL
   erzeugen beide ein Disposition-Receipt; freier Finding-Text bleibt im privaten
   Host-Return, während das Receipt nur geschlossene Zitate, Schweregrade, IDs
   und Hashes enthält.

Das Receipt nennt das erreichte Niveau wörtlich:

`normal-contractual-read-only; OS isolation not asserted`

Der Host liefert derzeit keine kryptographische Attestierung der Modellidentität
oder Tool-Nutzung. Das Receipt trennt die angeforderte/coordinator-bestätigte
Route von einer Provider-Attestierung und hält letztere auf `false`.

Der Read-only-Critic besitzt keinen Writer-Diff als Heartbeat. Seine Lease ist
daher evidence-basiert: erste konkrete Evidence binnen 60 Sekunden, danach ein
neuer content-gebundener Review-Meilenstein binnen 180 Sekunden bei unveränderter
Gesamtlease von 480 Sekunden. Writer-Lanes nutzen stattdessen Diff-/Test-/Evidence-
Fortschritt und dürfen reine vergangene Wall-Time nicht als Stall werten.

Trajectory-Konsistenz betrifft die kalibrierten Verify-Artefakte und den
reviewten Commit. Frischkontext-Dispatch und Host-Ausführung validiert der
Coordinator-Umschlag erst nach dem Critic-Resultat; ihr Fehlen in
Kandidaten-Evidence oder Commit-Trailern ist für sich keine Trajectory-Lücke.

## Konsequenzen

- Ein funktionierendes normales Codex-Review-Gate hängt nicht länger von der
  Beendigung eines verschachtelten CLI-Prozesses ab.
- Hash-Bindung, Remote-loses Review-Material, verpflichtende identitätsgebundene
  Observer, strikte Schemas, recoverable Single-use-Publikation,
  evidence-gebundene Liveness sowie content-sensitive Worktree-Verzeichnis- und
  Git-Administrations-Mutationserkennung fail-closen.
- Die Kontrollen beweisen nicht die Abwesenheit privater Reads, von
  Write-then-restore, Writes außerhalb beobachteter Roots, versteckter Tools,
  Netzwerkeffekten, Prompt-Injection, Provider-Fallback oder entkommener Prozesse.
- Finale Fingerprints sind sequenzielle Point-in-time-Snapshots. Ein entkommener
  Prozess kann sie nach der Erfassung veralten lassen; das Receipt behauptet
  keinen transaktionalen Cross-Repository-Snapshot.
- Cleanup des Review-Checkouts ist ein separater Best-effort-Hygieneschritt,
  nachdem das Receipt dauerhaft ist; sein Erfolg ist kein Teil des Review-Verdicts.
- Diese Lane erfüllt den verpflichtenden isolierten T1-Pfad **nicht**. Ihre
  Nutzung anstelle von T1 verlangt einen Named, scope-bounded PO-Risk-Waiver.
  Sie erzeugt nie einen Isolation- oder Codex-Conformance-Claim.
- Die aufgeschobene Sandbox-Implementierung bleibt getrennte Forschung und darf
  nur über ihre expliziten Backlog-Re-entry-Trigger fortgesetzt werden.

## Verworfene Alternativen

- Den verschachtelten Sandbox-Critic weiter wiederholen: für den v0.3-Close
  verworfen, nachdem wiederholte begrenzte Läufe kein Verdict erzeugten.
- Net-State-Checks als Isolation umbenennen: verworfen, weil Erkennung keine
  Einschließung ist.
- Unabhängiges Review entfernen: verworfen, weil der native Host-Critic ein
  nützliches und funktionierendes semantisches Gate bleibt.
- Die bestehende Claude-Critic-Route ändern: verworfen; diese Entscheidung fügt
  eine Codex-Host-Duty hinzu und lässt Claude-Zuweisungen unverändert.

## Wiedervorlage

Erneut bewerten, wenn Codex stabile strukturierte Lifecycle-/Tool-Telemetrie
exponiert, ein separat freigegebener OS-Isolationsadapter existiert oder eine
neuere CLI den archivierten Stall nach Turn-Beginn nachweislich behebt.
