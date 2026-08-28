# Project state — Agent-Pipeline

> Canonical operational handover for this repository. It contains public
> repository state only; durable decisions remain in the ADR register.

## Archived history

| Date range | Summary | Archive |
|---|---|---|
| 2026-08-27 | sprint_agy fetch, fast-forward, and the 2026-08-26 clean local candidate | [docs/state-archive/2026-08-27--prior-handover-sprint-agy-fetch-fast-forward-and-clean-local.md](state-archive/2026-08-27--prior-handover-sprint-agy-fetch-fast-forward-and-clean-local.md) |
| 2026-08-19 through 2026-08-23 | Phoenix-line checkpoints 61-71 (2026-08-19 through 2026-08-23), preserved verbatim as history after the Nova merge made the Nova line authoritative. | [docs/state-archive/2026-08-27--phoenix-checkpoints-61-71.md](state-archive/2026-08-27--phoenix-checkpoints-61-71.md) |
| through 2026-08-19 | First real rotation: everything from the 2026-08-08 restart checkpoint through the inherited Nova/Cyborg-release history and every older era down to the open-items tail — extraction pass completed first (original pre-rotation line range 4977–19155; see the archive file's own provenance section and the ADR-0064 addendum dated 2026-08-19) | [state-archive/2026-08-19--pre-restart-and-nova-inherited-history.md](state-archive/2026-08-19--pre-restart-and-nova-inherited-history.md) |
| 2026-08-11 to 2026-08-19 | Checkpoints 1-60 (2026-08-11 through 2026-08-19 checkpoint 60): superseded session narrative; durable decisions already live in ADRs/backlog/guardrails per this repo's own standing convention, not uniquely in this prose. | [docs/state-archive/2026-08-19--checkpoints-1-through-60.md](state-archive/2026-08-19--checkpoints-1-through-60.md) |
| 2026-08-26 | 2026-08-25 Antigravity chat-gate-ceremony standardization, verify-tuner stage 2 acceptance, sprint-agy-runner delta4 Critic fix and candidate status | [docs/state-archive/2026-08-26--agy-runner-2026-08-25-handover.md](state-archive/2026-08-26--agy-runner-2026-08-25-handover.md) |

## Current handover — Alfred clone: sprint-alfred-epic opened in design (2026-08-27, evening)

**READ THIS FIRST on the `feat/sprint-alfred` branch.** This clone switched its
machine state from the inherited `sprint-nova-epic` to **`sprint-alfred-epic`**
(phase `design`, `planApproved: false`) on PO release: `discard-feature --by
APS` (Nova continues in its own repo; the discard is an honest abandonment
record on this branch only, `discardedFeatures[0]`), then `set-feature`.
Base `a50c8093`; state transition committed as `0d0031ea`.

**The switch exposed two control-integrity defects, both filed with
`sprint: alfred` (commit `f8431081`, ledger `ef9fa2f7`):**

1. *A closed Result can be amended after close with no detection and no
   repair* — the 0.4.7-hotfix Result was amended by `d545ae4a` ten hours after
   its close; the Phoenix merge carried the drifted bytes here; an active
   continuity masked the pin mismatch for four weeks; the discard unmasked it
   as `continuity-damaged` with `plan-repair` honestly answering
   `continuity_repair_unavailable`. PO repaired by restoring the closed bytes
   (`git checkout d545ae4a^ -- specs/2026-07-27-agent-pipeline-0.4.7-hotfix/result.md`,
   committed `c3a9e203`). The amendment text (owner + 2026-08-31 review date
   for the #21 worker-pool gap) survives in `d545ae4a` and still needs a
   legitimate home in that backlog item.
2. *`discard-feature` writes a state shape `observeSessionCleanupState`
   rejects* — readiness `partial`, `guard-lifecycle-ready` then blocks every
   tool call including the `set-feature` that exits the condition;
   `plan-human-recovery` offers only non-mutating candidates. Escape: the PO
   ran `set-feature` in their own shell. Line-verified root cause in the item.

**Session facts:** pipeline 0.6.0+claude.20260827181725.5071b04
(local-development), onboarding `ready`/continuity `valid` re-verified after
the switch. Pre-push hook installed in this clone (untracked, `.git/hooks`).
PO trust anchor verified byte-identical to the configured
`local-po-key` (`2de20a39…`) — nothing to add. Push target later:
`git push -u origin feat/sprint-alfred:sprint_alfred`; rebase onto
`origin/main` only after Nova lands there, before implementation.

**Design phase is running under an explicit PO go** (2026-08-27, ahead of
Nova/Phoenix go-live — a deliberate PO decision deviating from ADR-0043's
"once Phoenix and Nova are live" ordering for the *design* work only; the
implementation start stays gated on the Nova rebase). Session model for the
design-authoring phase up to the Haltepunkt: Fable 5 at effort `max`, PO-set —
the MP-01 named session exception. **The announced gate switch was executed by
the PO at the PRD gate on 2026-08-28:** the session model is now Opus 5 (1M
context) at effort `xhigh`; Fable 5 is off. Everything from the PRD gate
onward (PO decisions, implementation dispatches) runs under that
configuration. Deliverable under construction:
`specs/sprint-alfred-epic/` (PRD, spec, acceptance, design analyses) from the 9
`sprint:alfred` GitHub issues (#99 #101–#106 #108 #109), 24 open
`sprint: alfred` backlog items, and external research — ≥1 independent Critic
round per design document before the PO gate. Known intake conflicts needing a
PO word at the gate: two items whose frontmatter says `alfred` but whose own
Triage prose says Nightwing (`2026-08-12-stale-checkout…`,
`2026-08-08-the-bootstrap-skill-grows…`), and
`2026-07-25-managed-onboarding-success-contract` (deferred, Alfred per this
branch's triage, Nova/general per the Phoenix-line cross-triage).
`#108`'s entry condition `#100` (P0, fail-closed push-approval absence) is
still OPEN on GitHub — tracked as an entry condition, outside Alfred.

**Design package + review round 1 (2026-08-27, late evening):** package
committed — intake analyses `74e5a4d4` (po-input, issue-intake,
backlog-intake, external-research), PRD/spec/acceptance `584acbda`, issue
snapshot + authoring record `56cda4c7`. Round-1 Critic reviews: 1A intakes
(claude-sonnet-5 at max) **PASS**, 2 minor findings; 1B PRD/spec/acceptance
(claude-opus-5 at max, ARCHITECTURE functional-equivalent lane) **FAIL**, 3
major + 7 minor. Every finding fixed or dispositioned in **`ea392b28`**
(PRD spec-sha256 marker recomputed, now `e57a2d1f…3223`); verbatim reports,
the neutral findings registry, and the disposition map persisted under
`specs/sprint-alfred-epic/evidence/critic/` (`007f9669`). Two further
process defects filed from the round (`553e43d7`, ledger `c2f3eeed`):
critic scratch-note persistence is structurally unavailable (defeats
CR-06-D truncation recovery), and no sanctioned `Dispatch:` trailer form
exists for direct Elephant design-phase commits. **Round 2** (delta
re-review per template item 4, claude-opus-5 at max, candidate `ea392b28`,
registry as neutral input): **FAIL** — 11/13 invariants resolved, but the
round-1 B-F3 fix had substituted a route the generated obligations doc rules
out for plugin source (`author-repair-required`, stop condition) — new major
R2-F1, plus three minors. Fixed in **`03d97ac5`** (TP-4 `$comment` edit
redesigned as a PO-performed act, pointer declared non-load-bearing with a
typed A2 residual when deferred; §B header re-dated; authoring-record fact
made evergreen; marker recomputed `4133223e…a503b6`). Round-2
report/registry/response persisted beside round 1. **Round 3** (delta,
claude-opus-5 at max, candidate `03d97ac5`): **FAIL with exactly one
minor** — R2-F1/R2-F2/marker resolved; R2-F4's "evergreen" reformulation
was still false at its own commit (`commits[]` can never contain the
marker-recomputing commit itself — self-reference lag). Fixed in
**`0181fe4b`**: the declared fact is now commit-independent (sha256(spec.md)
== committed marker at every commit of the line since `584acbda`; no
`commits[]` dependency). **Round 4** (delta, claude-opus-5 at max,
candidate `0181fe4b`, invariants R3-F1 + marker — the LAST of max four
rounds for this package) dispatched.

**Post-compact observation (extra evidence for defect 2 above):** after a
`/compact`, the SessionStart reground classifier reported
`PCR-CONTINUITY-MISSING` with `workResumptionAllowed: false` and
`dispatchEligibility CS-INVALID` against a state the live observers accept
(`inspect --intent session`: active feature, phase `design`, lifecycle
`draft`, `PLAN-LIFECYCLE-CURRENT`) — same root class (observer coverage of
the discarded→fresh-design shape), new surface (post-compact reground).
Recorded here instead of editing the committed item, to avoid ledger DRIFT
noise; fold into the item at its next legitimate touch.

**Round 4 (final): PASS**, scoped to `0181fe4b` — both invariants resolved;
the design-review cycle is closed at 4/4 rounds (cycle table + reviewed-
surface statement: `evidence/critic/round-4-response.md`, commit
`3f2fcb31`). Every design-authored document byte at head is Critic-reviewed.

**Road to submit-plan (three more measured lifecycle gaps, evening):**
(1) `PO-PROFILE-RECEIPT-INVALID` — the machine-local receipt never survives
a clone; republished via the typed route `setup.mjs --publish-po-profile`.
(2) `PLAN-SUBMIT-CONTINUITY-INVALID` — `set-feature` leaves no continuity;
bridged per the Phoenix-documented two-step workflow with `continuity-init`
(revision 0, design shape, authority bound to current PRD/spec digests;
state commit `ffb096a7`). (3) Items filed for both gap classes plus the
clone-provisioning class: `516a9392`, ledger `9b16de71`.
`submit-plan` now stops exactly at the intended PO gate:
**`PO-GATE-PRD-ACKNOWLEDGEMENT-MISSING`** — the PRD needs the PO's
acknowledgement marker `<!-- po-plan-acknowledged:
content-sound-and-spec-consistent -->` exactly once, a PO judgment no agent
may fabricate.

**Next (Haltepunkt presented, awaiting the PO):** 1. PO reviews the PRD
(EL-19) and answers PRD §9's five decisions; 2. on the PO's word, the
acknowledgement marker line is added to the PRD and committed; 3.
`pipeline-state.mjs submit-plan --by Elephant --profile epic` (rebinds
continuity authority to the acknowledged bytes itself); 4. PO approval
(`approve-plan`) and the MP-01 gate switch away from Fable-max. Standing
gate-visible items: the Dispatch-trailer canon gap (disposition in
`evidence/critic/round-1-response.md`) and the four defect items filed
today.

## Prior handover — Verify is green in one run; candidate 0.6.0 local (2026-08-27)

**READ THIS FIRST.** Verify passes 471/471, exit 0, in a **single** run with a
clean tree before and after — candidate `5fd963fc`. The two-run requirement is
gone, and its cause is named rather than worked around.

**The cause.** `lib/entrypoint.test.mjs` case EP07 pointed `CLAUDE_PROJECT_DIR`
at this repository while spawning the gate-strength guard twice, so the guard
recorded two REAL denials against the checkout and appended four governance
events plus an advanced `heads.json` on every run. That dirtied the tree
mid-flight, which made `security-scan` (all four adapters ERROR, exit 2) and
`candidate-binding` fail on an artifact rather than a defect. Identified with a
temporary probe in `appendOverrideDeniedLedgerEvent`, the only writer of
`governance/events/human/**` — two earlier attributions (`repair-map.test.mjs`,
`guard-gate-strength.test.mjs`) were disproved by measurement first. Fixed in
`a18cbafe` via `apply-pending-protected-edits.mjs` (TP-8), verified green in
`--preview` before the operator applied it.

**Stamp convention corrected.** The morning's `-prerelease` stamp was reverted
to the documented `+build` form (`9e23430f`). The reasoning behind it was wrong
about the mechanism: `docs/claude-local-plugin-development.md` states that
`claude plugin install` names the cache directory after the version string with
`+` replaced by `-`, so it is directory naming, not SemVer precedence. The same
passage explains the six-day staleness measured that morning — pinning does not
hold for a directory-sourced marketplace, the rsync had simply not been run.

**AK status.** AK-9/10/11 met (full green run; both manifests + `VERSION` at
0.6.0; every declared hook *wired* and byte-identical to the installed copy).
AK-14 filed for Nova B. **AK-5 is the one true inert guard**:
`guard-dispatch-budget.mjs` is built, 15/15, Verify-registered — but
`hooks/hooks.json` is on `NEVER_LIFTABLE_KERNEL_PATHS`, so no maintenance window
can wire it (the guard's own header wrongly claims one can). Prepared PO hand-edit:
`scratch/AK-5-hooks-json-patch-for-the-PO.md`. **AK-6** is ready to re-dispatch
against `pipeline-user-v3.schema.json` (the first attempt used the pre-v3 schema
and would have flagged a correct calibration as drifted; withdrawn in `1d6dec55`,
scaffolding kept at `8316dbd8`).

**Open release decision, carried forward from the 2026-08-26 section rotated on
2026-08-27** (surfaced by that rotation's extraction pass, and recorded here so
it survives): the PO corrected on 2026-08-26 that **0.6.0 is a combined
Nova+Phoenix release number, not a Nova-only one** — Phoenix
([ADR-0043](adr/0043-post-go-live-sprint-model.md)) was intended to land
alongside Nova under it. Undecided: intake Phoenix now and release combined, or
release Nova alone under a different number. `0.5.7` is not a candidate —
`VERSION` and every stamp already say 0.6.0. This does NOT block a local test
candidate stamped `0.6.0+...`; it blocks calling a published artifact "0.6.0"
without resolving it first. Nova B is confirmed NOT a blocker either way
(`specs/sprint-nova-epic/plans/nova-b.md` slice B3-A scoped its Agy touchpoint
as a deliberate non-functional stub, deferring the real work to the dedicated
Agy sprint since fetched).

**Backlog.** Five items filed, one closed (`0641d0d2`, ledger `6e20daa1`). One
inherited claim was corrected twice before it was right: "nine suites never run
in Verify" is **three**, not nine and not one — six are false positives from
`check-suite-registration.mjs`, which is blind to `verify.mjs`'s scoped
registration block. That is now its own item, alongside the three real gaps.

## Prior handover — ledger-merge capability, ADR renumbering, handover rotation (2026-08-27)

**READ THIS FIRST.** Three connected pieces of work, all committed, all on
`feat/sprint-nova-codex-v046`.

**1. The backlog ledger can now be merged across parallel sprints** — the
capability the Phoenix merge proved missing. [ADR-0068](adr/0068-backlog-ledger-merge-semantics.md)
records the decision; the defect it fixes was a contradiction sitting unnoticed
in one module, because it is invisible while nothing moves: chain validation
demanded an amendment's `from`/`to` equal the item's CURRENT status, while
supersession recognition and the planners demanded the status frozen in a
registry. Both readings coincide until a second line advances the item, and then
they are mutually unsatisfiable. An amendment is now status-neutral and binds
its target by `entryHash` rather than physical position. All 38 Phoenix
reachability amendments migrated; the measurement that matters is that the same
append took `check-backlog-state.mjs` from 13 findings to 73 before the change
and leaves it unchanged after. `backlog-state.test.mjs` 55/55 including BS26,
which can finally exercise what it was written for. Commits `87203a08`,
`e8e65eb4`, `14f028bb`, `72c1c48d`, `086c3430`.

**2. The six duplicate ADR numbers the merge produced are being resolved.**
[ADR-0069](adr/0069-adr-numbers-are-allocated-at-acceptance.md): numbers are
allocated at ACCEPTANCE, never at drafting, and carry no sprint prefix. Five of
six done — 0062→0071, 0064→0073, 0065→0074, 0066→0075, 0061→0070. **0063 is
still open** and is the largest (97 files, ~185 ambiguous bare references);
expect `repository-directory-contract` to keep the number on reference load.

**3. `docs/state.md` is editable again** — it was 48,825 bytes against its own
30,000-byte cap, which blocked every session that follows the bootstrap
protocol. Checkpoints 61–71 rotated to `docs/state-archive/2026-08-27--phoenix-checkpoints-61-71.md` (`da70d0df`).

### Still open, in order

1. **Collision 0063 → 0072.** The only remaining `DUPLICATE-NUMBER` finding.
2. **Register `check-adr-consistency.mjs` in `verify.mjs`** (ADR-0069 D3). The
   checker already existed and already worked; `verify.mjs` simply never ran it,
   which is why six collisions could land unreported. Do this AFTER 0063, or
   Verify goes red by design.
3. **BS25/BS26 durability** (ADR-0068 D6, not yet written): three positional
   lookups remain (`backlog-state.mjs:1326`, `:1504`, and the test's fixture).
   Two can bind by `entryHash`; `amendsSequence` has no hash in its event shape
   and needs an additive `amendsEntryHash`. The test fixture must stay
   positional — it needs a contiguous valid chain — so the prefix invariant
   becomes a NAMED check instead of a silent assumption.
4. **Full `verify.mjs` run** once the above land.

### Recommended for this candidate (Nova A), everything else Nova B

- `handover-file-exceeds-its-own-size-cap` — **done above**, close it.
- `long-dispatches-truncate-before-emitting-their-report` — hit **five times**
  in the 2026-08-27 session alone; two dispatches lost their report entirely and
  one nearly lost its work. The closing-allowance fix is already designed.
- `existing-repos-drift-on-agy-pipeline-user-yaml-update` — adoption blocker for
  every existing repo once 0.6.0 ships.
- `gitleaks-content-fingerprint-breaks-on-any-line-insertion` — presents as an
  unexplained blocking secret scan.
- `antigravity-hard-enforcement-layer-has-two-fail-open-paths` — **PO
  instruction 2026-08-27: the agy security items belong in the candidate.** The
  residual path is not small: the entire Antigravity hard-enforcement layer
  (PreToolUse guards, mandatory-bootstrap hard block) is inert whenever the
  daemon cannot resolve `node`, and it fails SILENTLY because the hook that
  would report it is the one that does not run. Its own QG-06 review horizon
  (`due: 2026-08-30`) is three days out.

Five further items are finished but not closed (ledger-merge, BS26,
claude-start-time, tp-guard-restore, intake-generate-coordinator — the last is a
status/Triage contradiction). Closing them is bookkeeping, but until it happens
every backlog overview is wrong.

### Ledger discipline — extracted 2026-08-27, applies to the closures above

Both rules existed ONLY in the rotated checkpoints and are now filed
(`f5a77841`): a `reconcile-backlog-ledger.mjs --activate` result is committed
ALONE, because GG-22 inspects the whole staged index rather than the commit's
pathspec; and `check-backlog-state.mjs` runs BEFORE committing a ledger change,
since an uncommitted bad reconciliation is undone with `git checkout --` on the
three projection files while a committed one needs the heavy evidence-amendment
machinery. `closure_commit` needs a FULL lowercase OID.

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
- For this task, Nova B is explicitly out of scope.

**Last updated:** 2026-08-25 — chat-gate-ceremony standardization
(`enforce-kickoff-po-questions`, PO decision: standardize push/kickoff/
PRD-Spec approval onto ONE mechanism, `plugins/pipeline-core/lib/
chat-gate-ceremony.mjs`). Landed and independently reverified this session:
(A) push self-approval fix (closed), (B) kickoff `--language`/`--profile`
gate (closed), (C) PRD/Spec acknowledgement gate (`po-authority-
acknowledge-apply` now requires the ceremony, commits `01b10848`
cherry-picked + `550b21d7`), push-approval preference now confirmed
per-repository pre-filled from the machine default instead of asked once
and never applied (closed, commit `cefd5dcb`). GWM kernel-closure gap for
`chat-gate-ceremony.mjs` fixed (`f6c9800a`). **HGO's `authorize --activate`
chat-mode path now DONE** (`AGY-HGOFIX-2`, commit `69d608fe`,
independently reverified 76/76): `authorizeHumanGuardOverride()` requires
the attended-chat-gate confirmation in chat mode, unchanged in signature
mode. Its own collateral regression (3 dependent test files calling the
now-gated function in chat mode without the seam) was chased down:
`guard-lifecycle-ready.test.mjs` fixed (`AGY-HGOFIX-3`, commit `60805fab`,
127/127). **Still open:** `guard-gate-strength.test.mjs` (4 tests,
GST21/25/26/27) and `guard-testpath-override.test.mjs` (4 tests,
OT10/11/12/13) stay regressed — both are empirically confirmed TP-6/TP-7
guard-protected test paths with no in-session override route
(`status=author-repair-required`); fixing them needs a human-run
author-repair ceremony or a follow-up dispatch scoped with that authority.
GWM itself has no chat-mode activation path yet (barely started, reverted,
not picked back up — not blocking anything currently in flight).
**Live incident this session, recovered, filed:**
`isolation: "worktree"` (Agent tool) never actually created a separate
worktree — three parallel dispatches raced on the shared checkout, causing
three zero-commit truncations and a detached-HEAD incident (a self-heal
step ran `git checkout --detach` against the shared tree). No work lost;
recovered by hand (cherry-pick + selective revert). See backlog:
`2026-08-25-workflow-tool-isolation-worktree-never-created-a-worktree-this-session.md`.
**Until that's resolved, dispatch serially in this repo, not via
`isolation: "worktree"`.** Also filed this session: a confirmed, reproduced
`guard-dispatch.mjs` fail-open on the Antigravity `Subagents`/`TypeName`/
`Prompt` payload shape (live defect, not theoretical); a GWM
kernel-doc/code enumeration drift (13 undocumented entries); a general
"guards are tool-level, not OS-level sandboxing" idea (Nova B, deferred).
**Correction/narrower finding after further testing:** the broken mechanism
was specifically the Agent tool's own `isolation: "worktree"` parameter —
the **Workflow tool**'s `agent()` `opts.isolation: 'worktree'` DOES create
real separate worktrees (confirmed live via `git worktree list` showing
distinct `.claude/worktrees/wf_*` entries), matching
`workflow-dispatch.md`'s own documented live-tested behavior. Prefer the
Workflow tool for any future worktree-isolated parallel dispatch in this
repo; the Agent-tool-direct path stays suspect until separately verified.

**AFK backlog sweep — COMPLETE and reconciled (PO directive, chat,
2026-08-25).** `codex-runner-has-no-real-support-on-native-windows` closed
separately first (won't-fix, PO: no Windows daemon exists, existing
mitigation suffices). The 17-item Workflow-tool sweep (Run ID
`wf_3ec6e465-da5`) landed; 8 of 17 agents failed to call `StructuredOutput`
(harness-level truncation) but several still committed real work in their
worktree — every one of the 17 worktrees was individually checked via
`git worktree list`/diff, not just the returned JSON, per
`workflow-dispatch.md`'s "never trust a returned result alone" rule.
Reconciled onto `sprint_agy`: **6 fixes cherry-picked and independently
re-verified** (own test suite run directly, not the dispatch's self-report)
— a real Antigravity `Subagents`-payload dispatch-guard bypass fix (15/15,
matches the live-reproduced finding from earlier this session), the GWM
kernel-doc/code enumeration drift (13 missing entries, 3/3 incl. new
GMWKC03 regression guard), a `backlog-strip-for-dispatch` section-dropping
bug fix (12/12), a `verify.mjs` Tier-B promotion for two more suites
(35/35), a goldfish/critic template hardening against silent turn-end
abandonment (the exact `long-dispatches-truncate` failure mode this same
sweep run itself hit for 8/17 agents — 4/4+36/36), and the missing
`intake-generate`/`bootstrap-bind` coordinator skill-reference doc. Plus 6
Triage-only re-triage/correction notes (stale-claim corrections, evidence
re-checks) and one doc-only workflow-dispatch policy addition. Closed with
fresh evidence: `orchestrator-authored-production-commits-have-no-
deterministic-control` (GIT-01/GG-22 confirmed live, 230/230; its
undelivered Part B split into its own item,
`2026-08-25-verify-range-mode-registration-for-orchestrator-commit-
control.md`), `guard-dispatch-fails-open-on-the-antigravity-subagents-
payload-shape`, `gwm-kernel-doc-enumeration-diverges-from-the-code-array`.
**One post-merge regression caught and fixed on the integrated tree**
(not present in any individual worktree): the new
`docs/human-authorization-inventory.md` doc was unclassified in
`governance/observation-doc-governance.json`'s inventory, tripping
`check-doc-contracts.test.mjs`'s observation-governance pass
(`OG-DOC-UNCLASSIFIED`) — fixed, 36/36 green (`02014041`). **Confirmed
still blocked, re-verified live rather than trusted from inheritance:**
`mp22-orchestrator-self-implementation-has-no-enforcement` (Sprint Alfred),
`regulated-document-hooks` (Sprint Phoenix HAW-E batch),
`session-keep-awake` + `afk-assumption-mode` (both bound to the Nova A
candidate freeze), `kickoff-promotion-cleanup-readback` (needs a dedicated
authorized pass touching `human-guard-override.mjs`/
`codex-pretool-guard.mjs`), `scratch-cleanup-mechanism` (points 1 and 3
remain genuinely open). Backlog ledger reconciled (`6d62f964`); security
scan and `check-backlog-state.mjs` both clean on the final tree; all 17
sweep worktrees removed. 25 commits landed this reconciliation pass.

**Pushed, 2026-08-26.** The two remaining chat-gate regressions from
`AGY-HGOFIX-2` are now closed. TP-6 (`guard-gate-strength.test.mjs`) and
TP-7 (`guard-testpath-override.test.mjs`) are Pipeline plugin source with
NO in-session override route at all — `pipeline-author-repair` mode is
structurally unreachable in this repo's self-application topology
(`plugins/pipeline-core` has no independent git toplevel of its own,
confirmed live); `repair-map.mjs` itself reports `command: (none)` for
`HGO-AUTHOR-ROOT-REQUIRED`. The PO applied the same `dependencies` seam
directly in their own terminal, outside this session, via a script this
session prepared with pre/post verification (`6f073ecf`); independently
re-verified here (36/36, 19/19, plus 76/76 and 127/127 no-regression
checks). A full `verify.mjs` run ahead of the push then caught a FOURTH,
previously-unflagged chat-gate regression the two prior dispatches never
covered: `codex-pretool-guard.test.mjs` (2 failures) arms its capability
via a real detached subprocess spawn of `guard-human-override.mjs`, which
can never satisfy an attended-terminal check by design — fixed by calling
the CLI's exported `main()` in-process instead, injecting the identical
test-only seam (`1a2dbb0a`). Also found and fixed: the machine-scoped
`poKeyDirectory` (`~/.agent-pipeline/machine.json`, outside repo scope)
still pointed at a stale key directory from 2026-08-10 that no longer
matches the pinned trust anchor — the code deliberately refuses to
auto-overwrite this once set (by design, prevents silent key-directory
swaps), so it needed explicit PO confirmation, given, then corrected by
hand. Full `verify.mjs` 385/385 green, security scan clean, push-prepare
fully green, PO signed via `authorize-critical` in their own terminal.
Pushed `origin/sprint_agy`: `2887e774..1a2dbb0a` (214 commits,
fast-forward). `pipeline-state.mjs approve-push` recorded the approval
before the push ran.

### Sentinel Links

Retained per `backlog/items/2026-07-20-spec-retention-on-close.md`,
enforced by `governance/spec-retention.json` + `check-spec-retention.mjs` —
keep linking all seven; do not prune (note carried over from the Phoenix
line's own checkpoint 71, see the history section below).

- specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md
- specs/2026-07-19-sprint-sentinel-epic/spec.md
- specs/2026-07-19-sprint-sentinel-epic/backlog-acceptance-matrix.md
- specs/2026-07-19-sprint-sentinel-epic/public-private-reconciliation-design.md
- specs/2026-07-19-sprint-sentinel-epic/RECOVERY.md
- specs/2026-07-19-sprint-sentinel-epic/platform-support-contract.md
- specs/2026-07-19-sprint-sentinel-epic/windows-blockers-scope.md

---

## Phoenix-line history (superseded by the Nova line above — preserved in full, not deleted)

> **Nova is the active state.** Below is `sprint_phoenix`'s own handover
> exactly as it stood at that branch's last checkpoint (71, 2026-08-23)
> before this merge — kept in full per PO instruction, as HISTORY. Any
> "(READ THIS FIRST)"/"Next step" text inside it was live only on the
> Phoenix line; the "Current handover" section above is the live one now.
> Phoenix's own "Archived history" table and Sentinel-links list are
> already folded into the sections above, not repeated here.

**Last updated (Phoenix line):** 2026-08-23 (checkpoint 71)

---

