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

**Historical implementation note (superseded for current operation):** the
v0.3 design originally required a sanitized named-PO-waiver binding for every
`T1` request: authority role, risk ID, bounded scope, authorization evidence
hash, and exact authorized candidate commit. Prepare rejected a missing,
malformed, or stale binding, and the receipt repeated it for the private close
gate. This records the former one-off-waiver mechanism; it is not the current
multi-runner policy.

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
   after every candidate-controlled subprocess. An instruction file named
   `AGENTS.md` is never opened; a directory using that reserved name is instead
   rejected from directory-entry metadata before it can become an unobserved
   write surface.
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

For the ordinary non-T1 normal lane, the historical v0.3 receipt states the
achieved level verbatim:

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

### Amendment — standing PO runner-equivalence authorization (2026-07-17)

For T1, retain the selected runner and use its usable native isolation first.
When it is technically unavailable or unusable in the current host setup, this
Codex lane is the standing PO-authorized functional equivalent, not a
per-candidate waiver: **one** fresh independently briefed Critic subagent, no
chat/history or implementer reasoning, refs-only bounded input, strict
read-only/no-write/no-subdelegation instruction, fixed candidate commit and
diff, higher-capability route, and a JSON-schema-shaped verdict. The receipt
MUST state `functional-equivalent-read-only; OS isolation not asserted`.
It never claims OS isolation or effective model identity. If the selected
runner cannot provide this contractual fresh read-only review, stop at a PO
course gate; do not silently substitute another runner. All existing T1
triggers, model escalation, evidence, independence, and disposition
requirements remain unchanged.

### Amendment — Codex execution-context matrix (2026-07-17)

The current Agent-Pipeline Codex policy is surface-specific. The Codex Desktop
App may use its managed sandbox. Codex CLI and headless execution MUST use the
approved host context for local verification, implementation, security scans,
and review. WSL/Ubuntu sandbox execution is known unusable; Windows-native CLI
sandbox execution remains unverified and deactivated. Do not retry the CLI or
headless sandbox as a fallback, and do not infer CLI suitability from a Desktop
App success. Deterministic host checks make no sandbox-isolation claim; T1 uses
the standing functional equivalent above, including its literal assurance.

Host-context pipeline commands are limited to pipeline-owned Node entry points
and fixed executable/argument vectors with `shell: false`; they never execute
project-provided package scripts or shell snippets. Existing Git and guard
hooks remain active. This Codex-only decision leaves Claude assignments and
execution policy unchanged.

Re-enabling the Codex CLI/headless sandbox requires an explicit PO decision and
representative same-surface smoke-test evidence. A permission escalation,
host-mode success, Desktop-App success, or different runner does not meet that
requirement.

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
- Under the standing PO runner-equivalence authorization, this lane is the T1
  functional equivalent when Codex native isolation is unavailable or unusable.
  It never creates an OS-isolation, effective-model-identity, or Codex-
  conformance claim.
- CLI/headless sandbox re-enablement remains separate research and may be
  resumed only through its explicit backlog re-entry triggers.

## Rejected alternatives

- Keep retrying the nested CLI/headless sandbox Critic: rejected for the v0.3 close after
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

**Historische Implementierungsnotiz (für den aktuellen Betrieb ersetzt):** Das
v0.3-Design verlangte ursprünglich für jeden `T1`-Request eine sanitisierte
Named-PO-Waiver-Bindung: Authority-Rolle, Risk-ID, begrenzter Scope,
Autorisierungs-Evidence-Hash und exakt autorisierter Kandidatencommit. Prepare
wies eine fehlende, fehlerhafte oder veraltete Bindung ab; das Receipt
wiederholte sie für das private Close-Gate. Dies dokumentiert den früheren
Einzelfall-Waiver-Mechanismus; es ist nicht die aktuelle Multi-Runner-Policy.

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
   Subprozess erfasst. Eine Instruktionsdatei namens `AGENTS.md` wird nie
   geöffnet; ein Verzeichnis mit diesem reservierten Namen wird stattdessen anhand
   seiner Directory-Entry-Metadaten abgewiesen, bevor es eine unbeobachtete
   Schreibfläche werden kann.
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

Für die ordentliche Nicht-T1-Normal-Lane nennt das historische v0.3-Receipt das
erreichte Niveau wörtlich:

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

### Ergänzung — stehende PO-Runner-Equivalence-Autorisierung (2026-07-17)

Für T1 bleibt der ausgewählte Runner erhalten und nutzt zuerst seine nutzbare
native Isolation. Ist sie im aktuellen Host-Setup technisch nicht verfügbar
oder nicht nutzbar, ist diese Codex-Lane die stehende PO-autorisierte
funktionale Entsprechung, kein Kandidat-für-Kandidat-Waiver: **genau ein** frisch
und unabhängig gebriefter Critic-Subagent ohne Chat/History oder
Implementierer-Reasoning, mit begrenzter Refs-only-Eingabe, strikter
Read-only/No-write/No-subdelegation-Anweisung, festem Kandidatencommit und Diff,
einer Route auf höherem Capability-Tier und schemaförmigem JSON-Verdikt. Das Receipt MUSS
`functional-equivalent-read-only; OS isolation not asserted` nennen. Es
behauptet weder OS-Isolation noch Effective-Model-Identity. Kann der ausgewählte
Runner diesen vertraglichen frischen Read-only-Review nicht liefern, stoppt die
Arbeit an einem PO-Kurs-Gate; ein anderer Runner wird nicht still eingesetzt.
Alle bestehenden T1-Trigger, Modell-Eskalationen sowie Evidenz-,
Unabhängigkeits- und Dispositionspflichten bleiben unverändert.

### Ergänzung — Codex-Ausführungskontext-Matrix (2026-07-17)

Die aktuelle Codex-Policy der Agent-Pipeline ist oberflächenspezifisch. Die
Codex Desktop App darf ihre verwaltete Sandbox nutzen. Codex CLI und Headless-
Ausführung MÜSSEN für lokale Verifikation, Implementierung, Security-Scans und
Review den freigegebenen Host-Kontext nutzen. Die Sandbox unter WSL/Ubuntu ist
bekannt nicht nutzbar; die Windows-native CLI-Sandbox ist nicht verifiziert und
bleibt deaktiviert. CLI- oder Headless-Sandbox nicht als Fallback wiederholen
und aus einem Erfolg der Desktop App nicht auf CLI-Tauglichkeit schließen.
Deterministische Host-Checks behaupten keine Sandbox-Isolation; T1 nutzt die
stehende funktionale Entsprechung oben samt ihrer wörtlichen Assurance.

Pipeline-Befehle im Host-Kontext sind auf pipeline-eigene Node-Einstiegspunkte
und feste Executable-/Argument-Vektoren mit `shell: false` begrenzt; sie führen
weder projektspezifische Package-Skripte noch Shell-Snippets aus. Bestehende
Git- und Guard-Hooks bleiben aktiv. Diese nur Codex betreffende Entscheidung
lässt Claude-Zuweisungen und dessen Ausführungspolicy unverändert.

Eine Reaktivierung der Codex-CLI-/Headless-Sandbox verlangt eine explizite
PO-Entscheidung und repräsentative Smoke-Test-Evidenz auf genau dieser
Oberfläche. Permission-Eskalation, Host-Mode-Erfolg, Desktop-App-Erfolg oder
ein anderer Runner reichen nicht aus.

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
- Unter der stehenden PO-Runner-Equivalence-Autorisierung ist diese Lane die
  funktionale T1-Entsprechung, wenn Codex' native Isolation nicht verfügbar
  oder nicht nutzbar ist. Sie erzeugt nie einen OS-Isolations-, Effective-
  Model-Identity- oder Codex-Conformance-Claim.
- Die Reaktivierung der CLI-/Headless-Sandbox bleibt getrennte Forschung und darf
  nur über ihre expliziten Backlog-Re-entry-Trigger fortgesetzt werden.

## Verworfene Alternativen

- Den verschachtelten CLI-/Headless-Sandbox-Critic weiter wiederholen: für den v0.3-Close
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
