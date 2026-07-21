# History

## 2026-07-21 — Recovery timeout quickfix and feature-branch delivery

- Added a bounded synchronous callback timeout to the recovery-preview
  attestation. Async callbacks, malformed acknowledgements, replay, digest
  drift, and timeout remain fail-closed without raw timing output.
- Registered and installed the Public plugin as
  `0.2.0+codex.20260721050314` from the current feature-branch marketplace
  source.
- Full Host Verify and Security passed with exit 0; the machine-written
  evidence binds the exact candidate `d5f7406109c50854de0b43850c1192ba158e5437`.
  That candidate was pushed and HTTPS-read back exactly on
  `feat/v3-public-core-foundation`.
- The independent Critic did not approve the broader recovery package: replay
  acknowledgement state, consumer API migration, and candidate-bound review
  evidence remain open. No Sentinel go-live or final PO-gate completion is
  claimed.

### Lessons

- A bounded synchronous timeout can make a callback duration fail closed, but
  it cannot pre-empt a callback that never returns; a future asynchronous
  boundary must preserve the same acknowledgement and replay contract.
- Plugin registration must read back the installed source and cachebuster
  before a new session trusts the refreshed runtime.

### Open / next

See the canonical [handover](docs/state.md) for the remaining Sentinel backlog
and the Critic findings that still prevent closure.

## 2026-07-21 — Public-Core quickfixes and PO disposition

- Corrected the WSL/externally configured SSH transport handling in Public-Core
  freshness probes and kept the exact transport context for the direct-OID
  fallback; failed or uncertain transport resolution remains `unknown`.
- Removed the incompatible explicit Codex sandbox-helper injection while
  retaining `sandboxCwd`, network-enabled read-only permissions, and the
  fail-closed intermediate assurance boundary. The real CLI/helper A/B and
  Public-Core regression suites pass.
- Persisted repository-scoped advisor-export consent as an explicit approved
  source value with bounded setup readback and no raw export material.
- Recorded the PO's SUL-1.0 licensing decision and closed the commercial-license
  backlog item. No custom lawyer-reviewed two-user license is claimed.
- Refreshed the Public plugin cachebuster to
  `0.2.0+codex.20260720222336`. The configured local marketplace snapshot still
  exposes the preceding version until the pushed feature branch is refreshed.
- Close-pre found that the recovered Sentinel PRD archive was stale after the
  approved authority correction; the archive was refreshed byte-for-byte and
  its manifest digest was updated.
- Full Verify and Security passed with exit 0 before the close metadata commit.

### Lessons

- Authority corrections must refresh every retained byte-bound copy before a
  delivery tail; a close-pre digest check is the right fail-closed boundary.
- Durable consent needs an explicit safe status readback so setup can prove the
  policy state without exposing the data that policy permits.

### Open / next

See the canonical [handover](docs/state.md) for the remaining Sentinel backlog,
plugin refresh/new-thread bootstrap, and the exact feature-branch delivery tail.

## 2026-07-20 — Public V3 repository normalization and overlay boundary

- Finalized the Public V3 Foundation candidate, anonymized the Codex plugin
  manifest, refreshed its cache-safe version, installed it from the Shared
  feature branch, and verified source/cache byte identity. A new session is
  required before the refreshed plugin is treated as loaded.
- Audited portable work from Multi-CLI 0.3, Storm, Batman, and Hawkeye; no
  portable implementation file was missing. Remaining Sentinel obligations and
  bounded Multi-CLI efficiency pilots were recorded as Public backlog work.
- Reduced the Public remote to unchanged `main` plus the V3 feature branch.
  Anonymous obsolete histories received recovery tags; histories containing
  non-neutral authorship were retained offline instead of republished.
- Reduced the separate private repository to a pinned 12-file consumer overlay
  on `main`, with all former branch tips preserved as ancestors and in local
  recovery artifacts. No private material was copied into Public Core.
- Recorded that the overlay lock is declarative but not yet automatically
  activated by the installed plugin. Bootstrap and go-live claims remain
  fail-closed pending the Public activation adapter.
- Used one PO-confirmed GG-03 override solely for a normal private `main`
  fast-forward. The close residue check found that the cross-repository audit
  ledger initially bound to the coordinator checkout; the private record was
  preserved locally and no private command data entered Public history.
- Pre-close Full Verify completed through the approved host boundary with 101
  steps and exact Verify/Security evidence at `d85cae3`. The sandbox-only
  attempt failed on local process/socket `EPERM` and was not counted as gate
  evidence.

### Lessons

- Public archive tags need an anonymity scan of all newly reachable commit
  metadata before publication; an offline bundle is the correct archive for a
  history that fails that boundary.
- A pinned overlay lock without a loader and validator is a declaration, not a
  runtime binding or bootstrap proof.
- Cross-repository guard evaluation and its one-time audit ledger must resolve
  the same physical target before an override is admitted.

### Open / next

See the canonical [handover](docs/state.md) for the exact delivery tail and the
bounded go-live backlog.

## 2026-07-20 — Public V3 Foundation stabilization

- Reconciled Public Core self-application, marketplace, inventory, portable
  Verify, documentation-link, and Gitleaks-fixture drift from baseline
  `89c3c2e`; no private user, machine, secret, or runtime data was transferred.
- Kept recovery-preview callback attestation and evidence-bound review retries
  as explicit P1/P2 public backlog design work, not as a false completion claim.
- Documented the PO-authorized temporary TP-3/TP-5 removal and exact restoration.
  That course authorization is not a Critic PASS, review verdict, or release
  approval.
- An independent Critic identified a missing rollback path and a conflict between
  stale public-language guidance and ADR-0011. The rollback path and the
  English-canonical Public Core boundary were corrected; a final fresh Critic
  review remains required for the exact close candidate.
- The seven formerly missing `Dispatch:` trailers on unpublished Goldfish
  delivery commits were corrected by rewording them with factual task
  identifiers and anonymous `AI-Assisted: true` markers. No retroactively
  created dispatch record is claimed; the public backlog items remain
  preventive process follow-ups.
- A separate clean P2.6 worktree was verified as fully synchronized, preserved
  as a Git bundle and source archive, then removed without force. Its branch and
  remote ref remain outside this stabilization block.
- Pre-close Full Verify completed with exit 0 and machine-written Verify/Security
  evidence at `6b423d1`; no push, merge, tag, or release was performed.

### Lessons

- Public language policy must be enforced from ADR-0011 at the Public Core
  boundary; private-overlay conventions cannot silently redefine public
  backlog or history language.
- Independent Critic review is only credible when active monitoring cannot
  inject coordinator prose into the review context; a contaminated attempt must
  be discarded rather than relabeled as independent.

### Open / next

See the canonical [handover](docs/state.md) for the exact final Verify, fresh
Critic, and feature-branch delivery sequence.

## 2026-07-19 — Hawkeye formaler Scope-Transfer

- Den aktiven Feature-Lifecycle `sprint-hawkeye-epic` als PO-gesteuerten
  Scope-Transfer geschlossen; kein Release, Tag, Push oder Backlog-Close wird
  daraus abgeleitet.
- Der grüne Kandidat umfasst die überarbeitete Nutzerdokumentation,
  Codex-Sandbox-Kompatibilität, PO-Anzeige, Keep-Awake und die dokumentierte
  öffentliche Dokument-Hook-Grundlage.
- Die unvollständige regulierte Dokumenten-Vertikale und der Releasepfad wurden
  nicht als Produktfähigkeit beworben. Ihr nächster Vertrag ist
  `/tmp/control-contracts-go-live-designphase.md`; die PO-Festlegung erhält
  HAW-C und HAW-E gemeinsam als vollständigen nächsten Feature-Sprint.
- Full Verify des Übergabestands: 96 Schritte, Exit 0.

### Lessons

- Ein Epic darf durch einen expliziten Scope-Transfer enden, aber offene
  Backlog-Items und nicht vertikal vollständige Sicherheitsfunktionen bleiben
  sichtbar offen; ein grüner Teiltest ersetzt keinen Produktabschluss.

### Open / next

Siehe den kanonischen [Handover](docs/state.md) und den dort referenzierten
Feature-/Go-Live-Vertrag.

## 2026-07-19 — Hawkeye Epic bis zum PRD-Gate vorbereitet

- Hawkeye wurde auf dem geschlossenen Batman-/V3-Commit als eigenes
  Epic-Feature im Designzustand angelegt; es gibt genau ein deutsches PRD.
- Die Level-2-Spec schließt Dokumentationskonsolidierung, private regulierte
  Dokument-Hooks und sessiongebundenes Wachhalten in fünf vertikalen Slices.
- Mehrere frische Readiness-Runden deckten fehlende Crash-Journale,
  Prozessnachfahren-, TOCTOU-, Größen- und Kandidatenbindungen auf. Die finale
  Fassung besitzt geschlossene Recovery-Verträge und erhielt von Architektur
  und Security jeweils `READY` ohne Blocker oder Major.
- Der PRD-Gate-Zwischenstand enthält keine Produktimplementierung und keine
  Remote-Aktion; die PO-Freigabe von 1A–7A bleibt der nächste Schritt.

### Lessons

- Multi-Ressourcen-Übergänge brauchen bereits vor Readiness eine explizite
  Ressourcen-/Phasenmatrix mit genau einer Recovery-Autorität; das Wort
  „atomar“ ersetzt keine Crashfenster.
- Ein Zeit- oder Größenlimit ist erst belastbar, wenn die gewählte Architektur
  das Überschreiten technisch vor dem unerlaubten Seiteneffekt verhindert.
- Kandidatenfelder in getrackten Zustandsobjekten müssen Implementierungs- und
  Post-Bookkeeping-Kandidaten trennen, damit kein Selbsthash entsteht.

### Open / next

PO-Gate und Wiedereinstieg stehen ausschließlich im kanonischen
[Handover](docs/state.md).

## 2026-07-20 — SNT-A-Brücke und Beobachtungsaufnahme geschlossen

- SNT-A1 bis SNT-A4 wurden im Public Core implementiert, exact-candidate
  verifiziert und unabhängig kritisch geprüft. Der cachebustete Pluginstand ist
  `0.2.0+codex.20260720163405`; Veröffentlichung, Reinstall und private
  Aktivierung bleiben der nächsten Session vorbehalten.
- Die globale Beobachtungsaufnahme ist als branch-unabhängige GitHub-Issue-
  Quelle dokumentiert. Der bounded Privacy-Review des letzten Korrektur-Deltas
  ist **DATA-PRIVACY PASS**; 19/19 fokussierte Tests sind grün.
- Der Close aktualisiert den kanonischen Handover und hinterlässt einen
  kopierbaren Setup-Prompt für die nächste Bridge-Session.

### Lessons

- Öffentliche Intake-Grenzen sollten zuerst geschlossene strukturierte Kanäle
  mit fail-closed Freitext-Ablehnung verwenden; Variantenparser werden nur für
  konkret akzeptierte Eingaben ergänzt.
- Die wiederholten Critics wurden auf Korrektur-Deltas begrenzt. Eine weitere
  Vollprüfung ist nach einem abgeschlossenen Delta nicht erforderlich.

### Open / next

Siehe den kanonischen [Handover](docs/state.md) und den
[Setup-Prompt](docs/next-session-setup-prompt.md). Die nächste Session muss
die bereits installierte Bridge bootstrappen, explizit aktivieren, den
Readback durchführen und danach die Issue-Publikation starten.

## 2026-07-19 — Batman und Runner-V3-Cutover geschlossen

- Batman liefert die bestätigten Epic-/Feature-/Mini-Profile, runner-neutrale
  Advisory-Duty, belastbare Continuity, kanonische Worktree-/PO-Autorität,
  AFK-Grenzen und den gestuften Critic-Pfad.
- Die nie aktivierte V2-Brücke wurde durch `pipeline.user.v3` ersetzt. Codex
  verwendet Sol-Consult; Claude verwendet Fable mit explizitem Opus- und
  Same-Runner-Consult-Fallback. Receipts verhindern stille Rollen-, Modell- und
  Assurance-Wechsel.
- Der Critic-Export bindet Kandidat, Basis und materialisierten Diff. TTL,
  Snapshot und persistierte Autorisierung werden unmittelbar vor dem
  Provider-Handoff erneut geprüft.
- Der exakte Implementierungscommit `9df52a65cb4dcb151b30c8714b0a41b25cd8c442`
  bestand Full Verify und Security Evidence. Die native Codex-Installation und
  eine frische V3-Sitzung bestätigten die neue Basis.
- Das V3-Cutover-Backlog-Item und der Feature-Lifecycle wurden über die
  sanktionierten Writer geschlossen. Private und neutrale Public-Publikation
  bleiben getrennte, nachgelagerte Readback-Vorgänge.

### Lessons

- Exportautorisierung muss am letzten Punkt vor Offenlegung erneut gegen Zeit,
  Kandidat und durable Policy geprüft werden; eine Prüfung im Finalizer ist zu
  spät.
- Ein Plugin-Quellstand ist erst nach nativem Reinstall und frischer
  Session-Provenienz die Basis der nächsten Pipeline-Sitzung.
- Direkte Elephant-Korrekturen bleiben ein zu dokumentierender Ausnahmefall;
  unabhängige Reviews fanden hier mehrere reale Grenzlücken und rechtfertigten
  die zusätzliche Runde.

### Open / next

Hawkeye startet im Epic-/Design-Modus mit genau einem deutschen PRD. Scope und
Wiedereinstieg stehen im kanonischen [Handover](docs/state.md).

## 2026-07-18 — Batman design checkpoint

- Anchored Batman on the completed Storm commit and confirmed a five-slice Epic
  decomposition for AFK, preflight, Verify, activation and publication.
- Completed one independent readiness pass per slice. All five drafts were
  revised from their findings. Fresh second passes then rejected all five broad
  cuts and opened an architecture course gate rather than a third correction grind.
- The PO fixed the bounded course: capability-bounded AFK with ledger authority,
  one static six-suite Verify postimage, one lifecycle with two typed channels,
  and process attribution without a new authentication mechanism. ADR-0037 owns
  the decision; internal child-contract readiness is next.
- No implementation, plugin/cache mutation or remote action occurred.

### Lessons

- Stateful guard designs need their authority receipt, durable storage, crash
  recovery and exact enforcement surfaces in the first slice draft; operation
  labels and broad file lists are not implementation contracts.
- Provider activation must model the first stale-cache transition separately:
  an old loaded guard cannot prove that its own replacement is active.

### Open / next

See the canonical [handover](docs/state.md); it is the sole source of current
and next-state information.

## 2026-07-18 — Storm publication remediation started

- Verified the two local GitHub identities and bound the calibrated public alias
  to the dedicated public account.
- Reinstalled Pipeline Core from a persistent Storm marketplace source so a new
  Codex session loads the worktree-aware guard implementation rather than the
  earlier cache snapshot.
- Split attributable private delivery from the separately curated neutral public
  delivery. No remote publication is claimed until a newly loaded session has
  completed the normal guarded push and fetch-back readback.
- The PO re-scoped the uncompleted delivery to Batman and the regulated
  document/adoption work to Hawkeye; the new roadmap allocation is the durable
  successor to this preparation package.

## 2026-07-18 — Storm operational control local close

- Closed the local Storm feature at product candidate
  `7602e99dd3a6668ceab687d8806fd0892096e7e4` after exact-candidate Full Verify
  (58 registered steps, exit 0), focused-suite evidence, and explicit PO
  acceptance of the bounded TP-3 exception.
- The feature lifecycle was closed through the sanctioned state writer. Its
  post-close publication remediation is tracked separately; publication is not
  claimed by this local-close entry.

### Lessons

- A protected aggregate gate needs a task-scoped, auditable additive-registration
  path; a PO exception must transfer the missing mechanism into a real open
  backlog item rather than turning it into an implicit completion claim.
- Public publication needs an identity-alias preflight before it becomes part of
  a close promise.
- A push guard must resolve the actual Git target worktree before it evaluates
  candidate Evidence; otherwise a clean feature branch can be blocked by stale
  sibling state.

### Open / next

See the canonical [handover](docs/state.md); it is the sole source of current
and next-state information.

## 2026-07-17 — Sprint P3B implementation close

- Closed the local P3B implementation feature at candidate
  `620b7f0d8a1ccf4a8fdbc4eaeda59f5ec66490fb` after exact-candidate Full Verify
  (58 steps, exit 0) and explicit PO acceptance of the documented exceptions.
- No merge, push, tag, release, or other remote action occurred.

### Lessons

- A T1 packet must derive and include every manifest-declared governance path
  before the reviewer is dispatched; a formal review rejection is costly even
  when the PO accepts the phase-level outcome.
- Intermediate status questions must not interrupt autonomous approved work;
  the active plan resumes until its defined gate.

### Open / next

See the canonical [handover](docs/state.md); it is the sole source of current
and next-state information.
