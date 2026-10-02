# Project state — Agent-Pipeline

> Canonical operational handover for this repository. It contains public
> repository state only; durable decisions remain in the ADR register.

**Release state:** version `0.6.3` · tag `v0.6.3` · commit `bca8f61571f8f6ce9bdae740bc1ecb11ca6dba6d` · tree `6821503f8f4fd72ed31459cb843d97bf8bfaa049` · status `published`

**Current transfer 2026-10-02:** [Frozen local 0.7 test candidate and next-session handover](0.7-local-test-handover-2026-10-02.md). PO installation/testing may proceed in parallel; final source qualification remains open.

**Transfer 2026-09-30:** [Alfred 0.7 feature checkpoint and exact resume notes](0.7-alfred-transfer-2026-09-30.md). This branch transfer is not a qualified release.

## Archived history

| Date range | Summary | Archive |
|---|---|---|
| 2026-09-27 | Überholter Kandidaten-Checkpoint; offene Abnahme und Installationsreihenfolge bleiben im aktuellen Abschnitt erhalten. | [docs/state-archive/2026-10-01--superseded-local-candidate-2026-09-27.md](state-archive/2026-10-01--superseded-local-candidate-2026-09-27.md) |
| 2026-09-01 bis 2026-09-19 | Historischer Nova-Checkpoint; aktueller Alfred-Intake bleibt live. | [docs/state-archive/2026-09-20--nova-historical-checkpoint.md](state-archive/2026-09-20--nova-historical-checkpoint.md) |
| 2026-09-09 | Archive superseded 2026-09-09 candidate and lifecycle checkpoints | [Archive](state-archive/2026-09-14--superseded-lifecycle-and-candidate-checkpoints.md) |
| 2026-09-06 | Historical candidate assembly; current decisions and remaining rules retained in the live handover. | [Archive](state-archive/2026-09-07--nova-candidate-assembly-2026-09-06.md) |
| 2026-09-06 | Closed Nova-B blocks 2026-09-02..06: rebase deadlock, evidence-slot fix, worktree liveness, read containment, full gate green, five Critic-cleared items | [Archive](state-archive/2026-09-06--closed-blocks-2026-09-02-06.md) |
| 2026-09-02 | The 0.6.0-to-0.6.1 release run, the overnight Nova B block, and the four dispatcher errors it recurred: superseded by the 0.6.1 release entry. | [Archive](state-archive/2026-09-02--where-the-release-stands-interim-update-2026-09-01-evening.md) |
| 2026-09-01 | The 2026-08-31 interim-release handover: the 0.6.0 candidate pushed to nova and stopped one step short of main, the nine ordered PO terminal actions, the privacy sweep disposition, and the carried-forward open questions. Extraction pass performed first and recorded in the survey behind commit 53262b1d; its homeless durable rules and still-live carry-forwards were re-stated in the 2026-09-01 handover. | [Archive](state-archive/2026-09-01--current-handover-0-6-0-is-an-interim-release-nova-b-continue.md) |
| 2026-08-25 to 2026-08-26 | The 2026-08-25/26 chat-gate-ceremony standardization block: AGY-HGOFIX-2/3, the four chat-gate regressions and their closure, the Agent-tool worktree-isolation incident, the 17-agent AFK sweep and its reconciliation, and the 2026-08-26 sprint_agy push. Extraction pass performed first: every durable rule in it already lives in CLAUDE.md or its own backlog item; the single carry-forward with no home (GWM has no chat-mode activation path) was moved into the current handover before rotation. | [Archive](state-archive/2026-09-01--chat-gate-standardization-and-afk-sweep.md) |
| 2026-08-23 | The Phoenix-line pointer block: a preamble stating that Nova became the authoritative line and that Phoenix's own checkpoints 61-71 are history. Its content was already archived separately and indexed; the block itself carried no live carry-forward. | [Archive](state-archive/2026-09-01--phoenix-line-pointer-block.md) |
| 2026-08-31 | The CI release blocker: diagnosis, the measured repair at ed491309, the PO decision to repair rather than bypass, and the inverted push-before-CI sequencing. Its live carry-forwards were extracted into the 2026-08-31 release handover before rotation. | [Archive](state-archive/2026-08-31--ci-release-blocker-diagnosed-and-repaired.md) |
| 2026-08-31 | The 2026-08-30 block: the 6a93fec2 candidate stamp at 501/503, the six closed retrospective follow-up items, ADR-0076, and the unapproved emergency push of both branches. Its two live carry-forwards -- retro items 7 and 8 deferred to Nova B, and the unresolved Critic FAIL on the sandbox quickfix -- were extracted into the 2026-08-31 handover first. | [Archive](state-archive/2026-08-31--prior-current-handover-nova-0-6-0-local-candidate-stamped-re.md) |
| 2026-08-31 | The 2026-08-28 three-runner greenfield block: rounds A-U2, the ready-gate blocker T, the 2+2 Critic round, and the candidate's state on the night of 2026-08-28/29. Its still-live carry-forward items were extracted into the 2026-08-31 handover before rotation. | [Archive](state-archive/2026-08-31--prior-current-handover-the-three-runner-greenfield-findings-.md) |
| 2026-08-28 | Ledger merge across parallel sprints (ADR-0068), ADR renumbering at acceptance (ADR-0069), and the first handover rotation; its four live open items -- ADR collision 0063, the unregistered check-adr-consistency, BS25/BS26 durability, and the Nova A candidate list -- are carried forward to the current handover. | [Archive](state-archive/2026-08-28--earlier-handover-ledger-merge-capability-adr-renumbering-han.md) |
| 2026-08-28 | Verify green 471/471 in one run at candidate 5fd963fc; EP07 tree-dirtying cause named and fixed; +build stamp convention restored; AK-5 closed, AK-6 ready to re-dispatch; the open 0.6.0 combined-release decision carried forward to the current handover. | [Archive](state-archive/2026-08-28--prior-handover-verify-is-green-in-one-run-candidate-0-6-0-lo.md) |
| 2026-08-27 | sprint_agy fetch, fast-forward, and the 2026-08-26 clean local candidate | [Archive](state-archive/2026-08-27--prior-handover-sprint-agy-fetch-fast-forward-and-clean-local.md) |
| 2026-08-19 through 2026-08-23 | Phoenix-line checkpoints 61-71 (2026-08-19 through 2026-08-23), preserved verbatim as history after the Nova merge made the Nova line authoritative. | [Archive](state-archive/2026-08-27--phoenix-checkpoints-61-71.md) |
| through 2026-08-19 | First real rotation: everything from the 2026-08-08 restart checkpoint through the inherited Nova/Cyborg-release history and every older era down to the open-items tail — extraction pass completed first (original pre-rotation line range 4977–19155; see the archive file's own provenance section and the ADR-0064 addendum dated 2026-08-19) | [state-archive/2026-08-19--pre-restart-and-nova-inherited-history.md](state-archive/2026-08-19--pre-restart-and-nova-inherited-history.md) |
| 2026-08-11 to 2026-08-19 | Checkpoints 1-60 (2026-08-11 through 2026-08-19 checkpoint 60): superseded session narrative; durable decisions already live in ADRs/backlog/guardrails per this repo's own standing convention, not uniquely in this prose. | [Archive](state-archive/2026-08-19--checkpoints-1-through-60.md) |
| 2026-08-26 | 2026-08-25 Antigravity chat-gate-ceremony standardization, verify-tuner stage 2 acceptance, sprint-agy-runner delta4 Critic fix and candidate status | [Archive](state-archive/2026-08-26--agy-runner-2026-08-25-handover.md) |

## Aktuelle Arbeit — 0.7-Greenfield-Korrekturen, 2026-09-29

**PO-Ergänzung 2026-09-30:** [Modellfamilien einmal freigeben und neue Versionen automatisch einsetzen](../backlog/items/2026-09-30-model-family-approval-with-automatic-version-upgrades.md); Umsetzung und Abnahme sind offen. Die aktuelle Codex-Zuordnung Sol 6.1/Luna 6 ist signiert und im Host bestätigt.

**Fortsetzung:** Der [ADR-Entwurf](adr/draft-model-family-approval-and-automatic-version-upgrades.md) und die synthetischen Entwurfsprototypen unter `scratch/model-family-upgrade-proposal/` sind vorbereitet; die Automatik ist noch nicht produktiv eingebaut. Neue Versionen müssen ohne weitere PO-Bestätigung und ohne manuell ergänzten Eintrag je Release erkannt werden.
**Kandidatenfortschritt, 2026-10-01:** Die isolierte Reparaturserie ist konsolidiert: 41 Dateien, Diff-SHA256 `986195ff3969be484ca781a5783d7d892a1852a09780e25a0ae347a6b3e03485`, 543 ausgeführte Fälle bestanden. Sie repariert unter anderem den nativen Codex-Typ `worker`, die Caller-/Template-Bindung, den bereits geprüften Ruleset-Digest und die begrenzte Materializer-Zulassung. Kein voller Verify-PASS; die Signatur `c2a6765d…` deckt nur ihren ursprünglichen Teilumfang. Das angeforderte direkte Operator-Skript unter `scratch/live-hook-repair-20261001/repair.mjs` ist eingefroren und mit 19/19 Fällen an Wegwerfkopien geprüft: Sicherung, synchronisierte 26 Source-/25 Cache-Ziele und Rollback. Noch kein Live-Aufruf bestätigt, keine Quellintegration oder Installation. Modellfamilien-Automatik, finale Signatur-/Review-Bindung und Gesamtqualifikation bleiben offen. Ein separater Backlog-Audit ist auf PO-Wunsch gestoppt; bestehende Ledger- und State-Änderungen bleiben erhalten. Kein qualifizierter lokaler 0.7-Kandidat.

**Weiter geltende Abnahme:** Der [Abschlussplan](../specs/sprint-alfred-epic/design/local-candidate-completion-plan.md), die [Alfred-Matrix mit 25 ACs und 4 Incident-Kriterien](../specs/sprint-alfred-epic/evidence/0.7-local-candidate-handover-2026-09-27.md) und die [Nova-Issue-Matrix](../specs/sprint-nova-epic/implementation/issue-acceptance-matrix.md) bleiben maßgeblich. Historische Lieferung ist kein PASS am finalen Kandidaten; NVA-A8 benötigt eine neue Bindung. Erst den vollständigen Source-Kandidaten qualifizieren und stempeln, dann PO-Installation und runner-eigene Host-Abnahme. AC-24/E3 braucht den A1-Beleg, AC-19 zwei Runner-Readbacks und AC-25 echte Host-Beobachtung. Finale Verify-, Security-, Reader-, Critic- und AC-Belege müssen den exakten Kandidaten nennen; Push, Tag und Veröffentlichung bleiben ohne Freigabe.

**PO-Auftrag:** Den genehmigten 0.7-Umfang als lokalen Kandidaten fertigstellen.
Der PO installiert den gestempelten Build selbst; keine Veröffentlichung.

Reguläre **Implementation**, Revision 13, gilt seit 2026-09-28; Autorität:
`project/pipeline-state.json` und das unveränderte
[Designpaket](../specs/sprint-alfred-epic/evidence/design-workflow-package-c22c1cd281b1.json).
Planfreigabe gilt; Advisor-Ausnahme akzeptiert, kein Advisor-PASS.
Installed Recovery: `f9ebdd5b` / `20260928194946.0cace08c`; kein finaler Kandidat.

Quellintegration `26fef9e7`: 244 Dateien im signierten Qualitätspaket committet.
Der PO hat die anschließenden Claude-Befunde ausdrücklich für den nächsten
lokalen Kandidaten freigegeben. Die aktuelle, noch uncommittete Korrekturserie
enthält Windows- und Agy-Greenfield-Reparaturen, drei Main-basierte
Update-Kanäle, private-Identifier-Pre-Commit-Prüfung, Release-State-Abgleich,
scratchfreie Commit-Hinweise und AC-18-Push-/Checkpoint-Schuldenlogik.
Die betroffenen OKF-Modulkonzepte und die generierte Übersicht sind nachgeführt.
Onboarding-Init 43/43, AC-18-Push 5/5 und Planungsprüfung 16/16 grün;
Verify-Registrierung 696/696. Der PO hat die eng begrenzte Registrierung der
drei AC-18-Tests im geschützten Verify-Gate signiert. Voller Verify, Security,
Critic, Build-Stempel, kandidatengebundene Gesamtqualifikation und Installation
sind noch offen. Keine weitere Reader-Korrekturrunde. Release-Push, Tag und
Veröffentlichung haben keine Freigabe.

## Durable rules carried forward — these have no other home

### Candidate assembly rules retained before archiving the September 6 checkpoint

- User documentation describes the next release, never a local candidate or
  branch. D.2–D.6 use the committed September 6 positioning inputs under
  `specs/sprint-nova-epic/design/` and the reader-review findings.
- Distinguish Verify suite span from run envelope. The remaining process-global
  suites are not established eviction candidates; consult the lane annotations
  and `backlog/evidence/2026-09-06-verify-lane-achievable-win.md` before tuning.
- Critic briefs provide independently checkable paths, not prior conclusions.
  Absence claims state their search boundary. Give a worker the valid completion
  criterion, never an instruction merely to silence a check. Treat a disclosed
  implementation limitation as a finding to investigate.
- D.1 commits `94277a0b`, `a82a1415`, `9a3c188f` and T1 CLI `b3b7cb7e` still
  need their independent review accounted for; the new candidate delta alone
  must not imply that those earlier packages were reviewed.
- Remaining September 6 investigations include error-code collapse in
  `advisory-host-bridge.mjs`, the selection layer's T1 fallback composition, and
  an ADR-0063 disposition for force-added evidence captures. Their historical
  measurements remain in the archived checkpoint and referenced backlog records.

Searched for in `CLAUDE.md`, `docs/adr/`, `guardrails/`, `backlog/items/`;
found in none. Condensed 2026-09-06 (was verbose since 2026-08-31/09-02) —
each still needs a real permanent home, not further compression.

1. Release sequence: commits → security scan → full verify → Critic →
   signature ceremony → push feature branch → CI → `main`/tag/release
   (version-manifest stamp in the pre-verify batch). Not in
   `docs/push-release-flow.md`.
2. `git push --no-verify` stays available as a PO-only manual escape outside
   Pipeline authority, never agent-usable, no retroactive `approve-push`
   record — resolved 2026-09-01, [ADR-0079](adr/0079-hook-bypass-is-never-agent-overridable.md),
   but the rule itself isn't restated anywhere else.
3. A `resume-hint` receipt proves only that a card's bytes were read, never
   understood/acted on; a `--resume` restart's same session id makes
   capture-then-consumption indistinguishable from false re-grounding.
4. "GS-6" (a cited human-only mutation-adjacent rule) has no text anywhere —
   stale id or a rule never given a home.
5. `push-prepare`'s `authorize-critical` command has an `--expires-at`
   window: re-run immediately before signing, never reuse a printout.
   `docs/push-release-flow.md` names the flag but not this operational
   warning.
6. TP-5 owes nothing until re-established — no backlog item names a
   surviving carve-out; what the maintenance window owes is four suite
   registrations plus promoting `check-suite-registration.mjs` to a gate
   step (TP-3, signature-gated).
7. A Critic's input must be an authorship-only dispatch-record projection
   (`taskId`/`agentType`/`dispatcher`/`commits` only) — not stated in
   `CLAUDE.md`, `critic-review.md`, or `roles/critic.md`.

## Open — 2026-09-06 design threads

**B1 (`#21`) descoped by PO decision** — `docs/adr/draft-b1-worker-pool-superseded-by-workflow-tool.md`
(`90405d8b`). The runner's Workflow tool supersedes the Pipeline's own
parallel worker pool, so NVA-B21-1/6/9 are *withdrawn*, not merely unmet.
**Amended same day (`4876185d`, PO challenge, correct):** that holds only for
Claude Code — Codex/AGY have no Workflow tool, so the B1-I supervisor is
RETAINED for runner neutrality. It has never run a real provider
(`codex-exec` needs `allowProviderExecution: true`, never passed); a one-site
live probe is offered, not approved. Workflow tool still uncertified vs `#7`.

**Parallel-dispatch slicing enforcement — designed, cleared to build**
(`9e40548b`, corrections `f17a63d1`, opus/max). Answers the four open
questions of
`2026-08-29-the-pipeline-defaults-to-sequential-work-with-no-enforced-task-slicing.md`
with a conjunctive Parallel-Safety Predicate and a staged notion of
"enforced". Two T1 Critic rounds: round 1 **FAIL** on F1, the Elephant's own
error — it struck the design's blocking probe and wrote "the build may
proceed" on documentation-only evidence. Closing round **PASS** with four
more, F-A major (PSP-3 cited from two wrong incidents). All corrected except
F-D, filed as its own item. Cap exhausted; the Elephant self-verifies.
Registries: `backlog/evidence/2026-09-06-nva-b-parallelslicing-design-1*`.

**Channel probe PASSED 2026-09-06 — the build is unblocked.** A `PreToolUse`
exit-0 `additionalContext` does reach the model here. The probe session knew
the marker, so what carries the result is an accidental negative control:
~15 `Bash` calls silent under a `Read`-only matcher, the first real `Read`
fired. Detail and the residual caveat in the ADR's step-1 result block.
Untouched and still unevidenced: that a *non-blocking* nudge changes
behaviour. Increment 1 is built as a hypothesis the ledger measures.

**Verify runtime measured** (analysis only). Wall clock 674.6s; the 60-member
serial lane sums to 673.8s — the lane *is* the runtime, so raising
concurrency or deleting fast suites cannot help. The lane was filled by a
sweep flagging "plausibly unsafe", never proven. **The four-module lever is
refuted** (audit `1b5b2793`): `pipeline-state` and `human-guard-override` are
process-global — `projectDir()` is `CLAUDE_PROJECT_DIR` or `cwd()`, and that
CLI has no `--repo` flag at all — so the two heavy suites the win was
expected from are ineligible. 12 members are eligible on that criterion
alone; two further modules still gate them. Tracked at
`2026-09-01-verify-runtime-is-concentrated-in-ten-suites-not-spread-across-many.md`
(open).

## PO decisions and todos — collected during the autonomous run, not waited on

Per the PO's 2026-09-02 instruction. None blocks further Nova-B work.

1. **A machine-specific path is in published history.** `79bc79b8` carries this
   machine's repository path seven times in an evidence artifact; the working
   tree was sanitised in `68c164e8` but the bytes remain. The only remedy is a
   history rewrite, which the guard union forbids — so this is a PO call on an
   accepted exposure, not a task. Prevention is filed as its own item.
2. **Hook-bypass override removal (ADR-0079) needs one PO sentence:** does the
   decision cover `git commit` and `git push`, or push only? Also scheduled for
   the maintenance window, and its test file is TP-1 protected.
3. **Vendored-canon drift** names two options and decides neither. The effective
   one is a pre-commit hook — new enforcement surface, which a standing
   constraint holds back until the current diff is reviewed.
4. **Three `hooks.json` edits await one shared TP-4 ceremony** rather than three:
   the worktree-isolation matcher, the resume-hint delivery hook, and the
   handover-size guard's registration. Deliberately not seeded — a ceremony is
   seeded only when the PO can sign immediately.
5. **GIT-01 does not admit `revert`.** Deliberate or oversight? Two reverts this
   week were committed as `fix` with the reason in the body.
6. **Superseded count:** the 2026-09-06 snapshot contained 68 open Nova-B
   items. The current audit started at 61 open and 54 closed; its first two
   sanctioned reconciliation batches plus the Codex-dispatch duplicate,
   tilde-mutation, write-lane disposition, ADR-coverage, runtime-identity and
   reader-review and dispatch-record Critic-projection closures leave 49 open
   and 66 closed at that checkpoint; the 2026-09-11 reconciliation now records
   39 open and 69 closed. Frontmatter plus
   the append-only ledger remains authoritative, and each further change needs
   checked completion evidence.
7. **Installed-copy action completed:** the local Codex plugin is running the
   0.6.2 development build that contains the read-scope and GG-22 corrections.
   Later Nova-B commits still require a fresh local candidate sync before they
   can be claimed as installed behavior.
8. **Open from the 2026-09-06 design work:** whether the slicing nudge stays
   non-blocking if the channel probe fails.

### 2026-09-11 scope and Verify update

- Native Codex sandbox and App Server evidence under WSL is deferred to the
  three existing `sprint: none` items linked in the current decision above. It
  is neither Nova-B acceptance evidence nor a Nova-B blocker. Platform-neutral
  contracts and the ordinary fresh-session Critic remain in scope.
- Boundary-aware impacted Verify is closed by ADR-0081, implementation
  `2c890778`, correction `5c826023`, and a PASS delta Critic. Invalid impact
  bases force full execution and the push guard independently verifies strict
  ancestry; release and publication remain full-only.
- The current Main-Verify consumer-safe-path false positive was corrected in
  `23f178b2`; its repository check and 35 focused tests pass.

### 2026-09-12 Nova-B design update

- The non-dispatch governance-action design is accepted as
  `docs/adr/0083-governance-action-events.md`. It keeps dispatch/status on the
  existing dispatch-correlated lifecycle payload and introduces a separate,
  closed `pipeline.governance-action-event.v1` payload in the same stream for
  verification, review, gate, recovery, and reconciliation actions. The
  candidate binding, envelope equalities, ID derivation and complete
  kind/status/reason matrix are specified. The LND-1 schema/runtime payload
  foundation is prepared with focused tests; envelope, store, reader, and
  producer integration is not claimed. The prior claimed Critic pass was not
  candidate- or trajectory-bound, so no reviewed-design or PASS claim is
  active.
- LND-0 still repairs the measured four-versus-six lifecycle correlation schema
  drift. Exact-candidate deterministic evidence and a fresh refs-only review
  belong with the next stable candidate. Actual native Codex sandbox, App
  Server, IPC, and isolation execution under WSL is deferred to a future
  native-Windows package and is not an input, acceptance criterion, blocker, or
  readiness claim for this work. Runner-neutral and offline contracts and the
  ordinary fresh-session Critic remain in scope.

## Operational head

- Project calibration: [`project/pipeline.json`](../project/pipeline.json).
- Required gate: `node harness/scripts/verify.mjs`.
- Formal decisions: [`docs/adr/README.md`](adr/README.md); no state-local
  override is active.
- No reusable full-bootstrap receipt is stored publicly; run the full
  bootstrap. Machine-local installation details and private receipts are not
  versioned here.
- Active Sentinel authority and retention are governed by
  `governance/spec-retention.json` and the linked recovery package; no
  completion or go-live claim is made by this handover.
- Nova B is the active line of work; 0.6.0 ships as an interim release.

### Sentinel Links

Retained per `backlog/items/2026-07-20-spec-retention-on-close.md`,
enforced by `governance/spec-retention.json` + `check-spec-retention.mjs` —
keep linking all seven; do not prune (note carried over from the Phoenix
line's own checkpoint 71).

- specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md
- specs/2026-07-19-sprint-sentinel-epic/spec.md
- specs/2026-07-19-sprint-sentinel-epic/backlog-acceptance-matrix.md
- specs/2026-07-19-sprint-sentinel-epic/public-private-reconciliation-design.md
- specs/2026-07-19-sprint-sentinel-epic/RECOVERY.md
- specs/2026-07-19-sprint-sentinel-epic/platform-support-contract.md
- specs/2026-07-19-sprint-sentinel-epic/windows-blockers-scope.md

## 2026-09-19 — Nova-B Übergabe an Alfred

**PO-Entscheidung:** Arbeit, die in diesem Abschnitt ausdrücklich an Alfred
übergeben ist, gilt für Nova-B als erledigt. Sie bleibt als eigenständiger
Alfred-Umfang nachverfolgbar; Nova-B darf daraus keine nicht vorhandene
native Ausführung oder globale Evidenzheilung ableiten.

### Alfred: nächster lokaler Kandidat

1. **B9 / NVA-G19 — Awaiting-approval-Recovery:** Implementiere eine atomare,
   replay-sichere `cancel-submitted-plan`-Transition für genau eine aktuelle,
   unbestätigte Plan-Einreichung. Sie muss einen dauerhaften
   `pipeline.plan-cancellation.v1`-Datensatz hinterlassen, die lebende
   Einreichung entfernen, die Kontinuität genau einmal erhöhen und fremde,
   stale, genehmigte oder wiederholte Anfragen verweigern. Keine manuelle
   Änderung von `project/pipeline-state.json`, keine synthetische
   Bootstrap-Quittung und keine Policy-Abschwächung. Der geprüfte Entwurf lag
   bei Übergabe als `scratch/nova-b-audit/B9-repair-v7.diff` mit SHA-256
   `d3c04b951b6e48ae3b4c39372c234c744ec3f1763144603417bced1405bb1800` vor;
   der Vertrag, nicht diese Scratch-Datei, ist maßgeblich.
2. **B9.1 / historischer v4-Mischzustand — eigene Recovery-Migration:** Nova
   steht nach einem älteren `reopen-design` in einer Zustandsform, die B9
   absichtlich nicht konsumieren darf: `activeFeature.phase="design"`,
   `planApproved=false`, eine gültige aktuelle `planSubmission`, eine
   historische `pipeline.plan-approval.v4` und eine ältere
   `planInvalidation`. Die Lifecycle-Projektion ist deshalb `draft`, während
   beide aktive Referenzen weiterhin physisch vorhanden sind. Die neue B9
   Stornierung muss diese Form verweigern, weil sie ausschließlich eine
   aktuelle, unfreigegebene `awaiting-approval`-Einreichung ohne
   Approval-Referenz annimmt.

   Implementiere deshalb **nicht** einen manuellen JSON-Eingriff und erweitere
   B9 nicht stillschweigend. Füge eine eigene, plan-/apply-gebundene,
   CAS-geschützte Recovery-Transition hinzu. Sie darf nur den exakt
   nachgewiesenen v4-Mischzustand akzeptieren, muss die Hashes von
   `planSubmission`, `planApproval` und `planInvalidation` in einem neuen
   dauerhaften Recovery-Receipt binden, die historische Invalidation erhalten,
   die lebende Submission und Approval-Referenz atomar entfernen und die
   Continuity genau einmal erhöhen. Sie darf keine Approval-Evidenz erzeugen,
   keinen Push-/Release-Status ändern und keinen generischen Shell- oder
   Lifecycle-Bypass einführen. Ein Re-Run darf nur für denselben Receipt ein
   Zero-write-Replay sein.

   Negative Tests müssen mindestens normale B9-fähige `awaiting-approval`-
   Zustände, aktuelle/genehmigte Approvals, fehlende oder fremde alte
   Invalidation, nicht passende Hashes, malformed State und CAS-Drift
   verweigern. Der positive CLI-Test bindet Plan und Apply, bestätigt die
   einmalige Continuity-Erhöhung und zeigt anschließend den regulären Weg:
   `po-authority-acknowledge-plan`, Submit, PO-Freigabe und
   Implementierungsphase. Aktualisiere die Lifecycle-Guard-Admission nur für
   diese geschlossene Befehlsform. Danach sind Full Verify, Security-Scan,
   unabhängiger Critic und der wahrheitsgemäße Candidate-Close erneut möglich.
3. **Native Ausführung:** Übernimm direkte Antigravity-Ausführung (`#69`) und
   native Apple-Silicon-Lifecycle-/Evidenzarbeit (`#72`). Nova-B schließt nur
   die vorhandenen Runner- und Plattformverträge; keine 3x3-Nativzertifizierung
   wird behauptet.
4. **Architektur:** Die Architekturadoption bleibt bis zu Alfreds Close
   deferred. Alfred erfasst beim eigenen Abschluss eine neue Disposition samt
   Review-Zeitpunkt.
5. **Historischer Evidenzdrift:** Untersuche und repariere separat den Drift
   von `specs/2026-07-27-agent-pipeline-0.4.7-hotfix/result.md` (erwartet
   `d2367448d8b72d1466ff995dd7c8dfa54a470334643afd290aa12cb19ddd9cf2`,
   beobachtet `41d2d6543407e75cc98bff6701225a8564ec6cccc833c240cc6f988e41642817`).
   Das ist kein Nova-B-Abschlussbeweis und darf nicht nachträglich kaschiert
   werden.

### Nova-B Rest und Abschlussregel

- Die unzugehörige AGY-Migrationsänderung in `pipeline.user.yaml` wird vor dem
  Nova-B-Abschluss ausgeschlossen; Alfred verantwortet die AGY-Integration.
- NVA-G20/B10 (kanonischer, bytegebundener Security-Eingabevertrag für
  Promotionen) ist mit dieser Abschlussübergabe an Alfred übertragen. Die
  vorhandenen Quell- und Teständerungen sind ein unfertiger Kandidat, kein
  Abschlussbeweis.

### Finaler Intake-Pfad für Alfred

1. **Nova einfrieren und vollständig übernehmen:** Arbeite von
   `/home/skar667/src/agent-pipeline-share_nova` aus einer eigenen Alfred-
   Arbeitskopie bzw. einem eigenen Intake-Branch. Übernimm den vollständigen
   aktuell getrackten Diff einschließlich `project/pipeline-state.json`,
   `specs/sprint-nova-epic/`, `governance/events/` und der B10-Dateien unter
   `plugins/pipeline-core/`. Bewahre die ungefilterten Governance-Ereignisse
   als Audit-Spur. `pipeline.user.yaml` gehört nicht in den Nova-Kandidaten;
   seine AGY-Migration ist Alfreds eigener Konfigurationsumfang.
2. **Zustand zuerst reparieren:** Führe Alfreds regulären Pipeline-Start aus,
   lese diese Übergabe, `project/pipeline-state.json` und die Nova-Spezifikation.
   Implementiere und prüfe zuerst B9 und B9.1 aus diesem Abschnitt. Keine
   direkte JSON-Manipulation und keine Wiederverwendung früherer PO-Signaturen.
   Erst der neue, gebundene Recovery-Receipt darf den Mischzustand in einen
   regulär fortsetzbaren Zustand überführen.
3. **Eigene, frische Autorität herstellen:** Nach erfolgreicher Recovery
   erstellt Alfred einen neuen Plan gegen den übernommenen Umfang, reicht ihn
   ein und holt eine neue PO-Freigabe ein. Alte Freigaben, Push-Intentions oder
   Security-Evidenz binden keinen Alfred-Kandidaten.
4. **Nova-Bestand implementieren und verifizieren:** Übernimm B10 samt
   `release-promotion-envelope`, `push-prepare` und `guard-push`-Tests sowie
   die Punkte 3 bis 5 dieser Übergabe als Alfred-Arbeit. Erzeuge aus einem
   sauberen, commitgebundenen Kandidaten Full Verify, Security-Scan und einen
   frischen unabhängigen Critic. Repariere den historischen Evidenzdrift
   getrennt und behaupte keine nicht ausgeführte 3x3-Nativzertifizierung.
5. **Wahrheitsgemäß schließen:** Erst wenn diese Evidenz den exakten
   Alfred-Kandidaten bindet, darf Alfred seinen Feature-Close durchführen und
   einen neuen, exakt gebundenen Feature-Branch-Push vorbereiten. Merge,
   Release, Deploy und Publication bleiben jeweils eigene spätere Aktionen.

Nova führt nach dieser Übergabe keine weitere Implementierung, State-Recovery,
Prüfung, Signaturzeremonie, Candidate-Close oder Push-Vorbereitung aus. Der
gezeigte Nova-Status bleibt ein wahrheitsgemäßer eingefrorener Übergabestand,
kein abgeschlossener Lifecycle.
