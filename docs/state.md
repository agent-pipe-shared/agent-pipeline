# Project state — Agent-Pipeline

> Canonical operational handover for this repository. It contains public
> repository state only; durable decisions remain in the ADR register.

## Archived history

| Date range | Summary | Archive |
|---|---|---|
| 2026-08-28 | Phoenix-line handover pointer stub; its body was rotated earlier and lives in the archive already | [docs/state-archive/2026-08-28--phoenix-line-history-superseded-by-the-nova-line-above-prese.md](state-archive/2026-08-28--phoenix-line-history-superseded-by-the-nova-line-above-prese.md) |
| 2026-08-28 | 0.6.0 local candidate green in one run (EP07 root cause fixed); AK status incl. the unwireable AK-5 guard; open combined-release decision carried forward into the current handover | [docs/state-archive/2026-08-28--prior-handover-verify-is-green-in-one-run-candidate-0-6-0-lo.md](state-archive/2026-08-28--prior-handover-verify-is-green-in-one-run-candidate-0-6-0-lo.md) |
| 2026-08-28 | Nova line: backlog-ledger merge semantics (ADR-0068), ADR renumbering (ADR-0069) and the first handover rotation | [docs/state-archive/2026-08-28--prior-handover-ledger-merge-capability-adr-renumbering-hando.md](state-archive/2026-08-28--prior-handover-ledger-merge-capability-adr-renumbering-hando.md) |
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

**Session facts:** pipeline 0.6.0+claude.20260827211222.562aadb
(local-development; the 2026-08-28 `/reload-plugins` moved it off
`…181725.5071b04`), onboarding `ready`/continuity `valid` re-verified after
the switch. Verify is present but currently refuses with
`VERIFY-CLEANUP-REGISTRATION-REQUIRED` (no session identity to bind a cleanup
descriptor) — irrelevant to design work, unresolved. Pre-push hook installed in this clone (untracked, `.git/hooks`).
PO trust anchor verified byte-identical to the configured
`local-po-key` (`2de20a39…`) — nothing to add. Push target later:
`git push -u origin feat/sprint-alfred:sprint_alfred`; rebase onto
`origin/main` only after Nova lands there, before implementation.

**Design phase is running under an explicit PO go** (2026-08-27, ahead of
Nova/Phoenix go-live — a deliberate PO decision deviating from ADR-0043's
"once Phoenix and Nova are live" ordering for the *design* work only; the
implementation start stays gated on the Nova rebase). Session model: Fable 5
at effort `max`, PO-set (MP-01 named exception) — briefly switched to Opus 5
(1M)/`xhigh` at the gate on 2026-08-28, then **set back to Fable-max by the
PO the same day for the gate-1 rework** (design/po-input-2026-08-28.md); the
cheap-configuration switch moves to the next gate presentation. Deliverable under construction:
`specs/sprint-alfred-epic/` (PRD, spec, acceptance, design analyses) from the 9
`sprint:alfred` GitHub issues (#99 #101–#106 #108 #109), the open
`sprint: alfred` backlog items (24 at intake, **27 today** — composition in
`acceptance.md` AC-13), and external research — ≥1 independent Critic round
per design document before the PO gate. The intake conflicts and #108's #100
entry condition were all decided at the gate: see the PO decision register
below.

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

**PO gate answered (2026-08-28).** All five PRD §9 decisions are decided and
applied; the model switch is done (see above). Register:

1. **Sprint-assignment conflicts → moved.** `2026-08-12-stale-checkout…` and
   `2026-08-08-the-bootstrap-skill-grows…` now declare `sprint: nightwing`,
   following their own 2026-08-17 Triage (`e4c3f2db`). The line the PO
   applied, reusable at the next triage: *test- and evidence-discipline is
   Alfred; product and onboarding experience is Nightwing.*
2. **`managed-onboarding-success-contract` → accepted**, as an
   acceptance-review rule (`acceptance.md` AC-16/§D), not a work package,
   with the PO's constraint that its target set is re-derived **after the
   Nova rebase** because the onboarding surface changed in the Nova line. Two
   mechanical findings recorded with it: ledger event 41's rescoped byte-pin
   refuses a `sprint:` line in that item's frontmatter, and `deferred` has no
   forward transition — so it stays outside AC-13's closure set by mechanism.
3. **#100 → verified and commented; the PO closes it.** The premise of both
   offered options was stale: `2ae06d91` is an ancestor of `origin/main`, the
   scope-4 fixtures (`PG11c`, `PG11e`, `PG28`, `PG29`, `PG30`) are on `main`,
   and `guard-push-tests` is registered in `harness/scripts/verify.mjs`
   there. Only AC-7 (closing comment) was outstanding; the evidence comment
   is posted (`#issuecomment-5448916870`), the issue deliberately left open.
   Read-verified, not run-verified — stated as such in the comment itself.
4. **`sprint:NONE` prerequisites → none beyond #100**, and the portfolio was
   cleaned at the same time: #107, #92, #52, #13 moved to `sprint:batman`
   (each previewed and read back through `github-issue-operations.mjs`); #72
   (hardware-blocked Nova follow-up) and #100 (P0 hotfix) deliberately left
   `sprint:NONE`.
5. **Scope trims → none.** C2's range-mode tail and B2(viii) stay in; the
   tail remains the first drop candidate at a wave boundary, with a
   re-triage note, not now.

**The answers cannot yet reach the PRD/spec — a sixth measured gap.**
`GUARD-LIFECYCLE-AUTHORITY-BOUND` refuses direct edits to the bound PRD and
Spec, and the release route that refusal names (`reopen-design`) is a
zero-write replay in a never-submitted design phase: `planInvalidation` has
exactly one writer and its only reaching branch needs a `planSubmission`,
while continuity must bind PRD/Spec before the first `submit-plan`. Filed as
`backlog/items/2026-08-28-a-design-phase-prd-and-spec-are-frozen-by-their-own-continuity-binding.md`
(`9e436147`, ledger `50ce3f89`). Everything not bound is already updated
(`bfa7cac8`).

**Gate-1 outcome (2026-08-28, after the §9 answers): PRD REJECTED — rework
directed.** The PO's verdict: far too shallow on the primary mandate
(agentic architecture); the elementary requirements of #99/#104/#106/#109
are missing from the PRD's own text; governance is bycatch, not the
headline. Directive + four test questions captured in
`specs/sprint-alfred-epic/design/po-input-2026-08-28.md`. The rework wave
delivered the same day: a full issue re-read (snapshot verified current),
the line-level audit `design/gap-analysis-2026-08-28.md` (per-issue
coverage verdicts + the exact PRD/spec/acceptance integration map §D), and
the absorbed doctrine `design/agent-first-architecture.md` (property
catalog, knowledge estate + re-entry contract, enforcement mechanics,
user-facing representation, greenfield/brownfield paths). **The morning's
`po-authority-acknowledge-apply` command (plan `6616d6fe…`) is obsolete and
must NOT be run** — the PO must never acknowledge content-soundness of
rejected bytes.

**Rework review cycle CLOSED (2026-08-28):** round 1 full review
(claude-opus-5 at max, candidate `2c867ea9`) **FAIL** — F1/F2 major
(a "verbatim" field list dropping a field; the eleven contract-sufficiency
signals audited missing but not absorbed), F3–F5 minor; fixed in
`e3613ffe`, F4 dispositioned (stage-0 trailer would be a false fast-path
claim; canon-gap item carries it). Round 2 bounded delta **PASS** (scoped),
two minor residue findings fixed post-PASS in `361d6dc6` with an honest
reviewed-surface statement. Evidence: `evidence/critic/rework-round-*`
(`86d9e70f`, `d59c5a3b`). Fresh live evidence recorded there for two filed
defects: Critic scratch persistence is structurally unsatisfiable in the
lane (no Write tool, `>` refused, `node -e` refused even for exempt
`scratch/`), and 4/16 round-2 tool uses were guard-refusal tax. Owned
dispatch defect + corrected rule: a delta dispatch's bound base is always
the enumerated head's parent.

**PO re-review feedback (2026-08-28, gate in progress):** direction
accepted — "deutlich besser, insbesondere mit dem neuen zusätzlichen
Dokument". Two directives, both executed at the design level the same day:
(1) the doctrine must enter the PRD as **mandatory normative basis** — it
was mentioned nowhere in PRD or spec (verified zero-hit search);
gap-analysis §D gained the preamble normative-basis anchor + §10
traceability row (commit `2b0ee8c7`). (2) the **ADR concept must migrate
explicitly in brownfield adoption**; doctrine §6 gained the rule
(mechanism installs with the standard, baseline as first record, on-touch
capture of inherited decisions, honestly dated) routed via §D into spec
§7.1 (commit `9c9d9819`). Both were graduated into the PRD and spec in
`eba804e6`; the PO approved the package the same day (below).

**Carried forward from the rotated 0.6.0 prior-handover section
(extraction pass 2026-08-28):** (a) OPEN PO release decision — 0.6.0 is a
combined Nova+Phoenix number (PO 2026-08-26, ADR-0043): intake Phoenix and
release combined, or release Nova alone under a different number; blocks
calling a published artifact "0.6.0", not local `0.6.0+...` candidates.
(b) AK-5: `guard-dispatch-budget.mjs` built but unwireable
(`hooks/hooks.json` on `NEVER_LIFTABLE_KERNEL_PATHS`); prepared PO
hand-edit at `scratch/AK-5-hooks-json-patch-for-the-PO.md`. (c) AK-6 ready
to re-dispatch against `pipeline-user-v3.schema.json` (first attempt
withdrawn `1d6dec55`, scaffolding kept `8316dbd8`). Details:
`docs/state-archive/2026-08-28--prior-handover-verify-is-green-in-one-run-candidate-0-6-0-lo.md`.

**PO approval of the doctrine, and the route executed (2026-08-28).** The PO
approved the reworked package. The bound-document route then ran end to end:

1. **Attended acknowledge — two ceremonies, one defect found.** The first
   (plan `2775affd`) failed its postimage readback and rolled back cleanly.
   Root cause, isolated read-only by eliminating the other four predicates:
   `resolvePoRebindRunner` defaults to `codex` whenever `CLAUDECODE` is
   unset — which is exactly the attended non-Claude-Code terminal the gate
   demands — and the codex V4 inspection is `runtime-attestation-required`
   on this host, so `v4Intents` can never pass. Retried with an explicit
   `--runner claude` on a fresh plan (`980f6bd2`): `PO-ACK-APPLIED`,
   continuity revision 1 (`010c21f4`). Filed as
   `backlog/items/2026-08-28-the-attended-po-acknowledge-gate-defaults-to-a-runner-that-cannot-satisfy-it.md`
   (`8df61e7a`, ledger `e4f25146`) — the sixth defect this design phase
   filed, taking the live Alfred set to 28.
2. **`submit-plan` → `reopen-design`** (`f8998d9a`) released
   `GUARD-LIFECYCLE-AUTHORITY-BOUND` as designed.
3. **Graduation applied** (`eba804e6`, count correction `c1a57c44`): the
   gap-analysis §D integration map plus the queued §9-decision edits, across
   PRD, spec and acceptance; `technical-spec-sha256` recomputed to
   `fc653b72…`.

**Graduation Critic round 1 — FAIL (scoped), fixed** (`2da2d609`,
`6dd2e8cd`). ARCHITECTURE route, fable at max, enumerated SHAs `2b0ee8c7`,
`9c9d9819`, `eba804e6`. F1 (major) is the one that matters: the gap analysis
§E had explicitly promised the PRD §9 rework would put a sequencing choice to
the PO, and the graduation instead defaulted it to the design's own
recommendation and wrote "Open at this gate: none". Restored as PRD §9
decision 6 with its cost stated. F2 (major, unfixed by design): no
`Dispatch:` trailer form exists for direct Elephant design commits — stamping
`stage-0 (elephant)` on a 474-line authority rework would be a false
classification, worse than the honest `UNVERIFIABLE`; the canon gap item
carries it. F3–F5 minor: duplicate list number and dangling `(§2.9)` fixed;
the spec's re-entry reading order replaced with doctrine §3.2's own six steps
under the conflict rule; the integration map corrected to the executed
deviations. Third live measurement of the Critic scratch-persistence defect
(no write lane at all — report persisted by the Elephant). Owned dispatch
defect: a commit-adjacency claim asserted from memory instead of read from
`git log`.

**PO decision 6 answered (2026-08-28): the wave order stands** — D-track is
not pulled ahead of Wave 2 (recommendation followed; recorded in PRD §9 and
closed in gap-analysis §E, commit `18777c84`). §9 now carries no open item.
Plan resubmitted (`9ddd118d`), lifecycle `awaiting-approval`, scope bound to
PRD `aa730465` + spec `6e6c8713`.

**Next:** (1) PO `approve-plan --by "<name>"` — the last gate act; the agent
never runs it, the `--by` attribution is the PO's own. (2) Then the phase
transition to `implementation`. Implementation stays gated
on Nova landing on `main` + rebase. Standing gate-visible items: the
Dispatch-trailer canon gap (`evidence/critic/round-1-response.md`) and the
six defect items this design phase filed.

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

