# Backlog reconciliation 2 (2026-10-07) — unmapped open items, triage section 2, triage section 6

Read-only companion to [`backlog-reconciliation-2026-10-07.md`](backlog-reconciliation-2026-10-07.md). Source lists:
[`backlog-triage-2026-10-07.md`](backlog-triage-2026-10-07.md) sections 2 and 6, the open `sprint: alfred` items in
`backlog/items`, `git log --oneline 8bb937cf9..HEAD`, [`0.7-execution-order.md`](0.7-execution-order.md),
[`adr-0085-implementation-plan.md`](adr-0085-implementation-plan.md) and PO decision AH in
[`po-decisions-2026-10-07.md`](po-decisions-2026-10-07.md). Nothing is decided or closed here.

Classes: **a** landed · **b** in flight / partial · **c** not started · **d** protected / signed-package work.
Method limits: Part 1 matched by slug words against both earlier files; titles and the execution order were read, item
bodies were not opened (no item carries an Elephant triage text that would change the class). Where unsure the row says
so. Part 3 needs are inferred from entry names and the triage reason, not from item bodies.

## Part 1 — open Alfred items that neither list covers (25)

| File (slug) | Title | Class | Note |
|---|---|---|---|
| bounded-reader-terminal-binding | Bind a terminal Reader correction without another review loop | c | no commit; probably superseded by ADR-0085 (single review) — confirm before work |
| codex-wsl-required-advisor-has-no-completable-route | A required Advisor must have a completable Codex/WSL route or a governed unavailable outcome | c | Advisor stage is removed by ADR-0085 P3/P8; likely superseded, not yet linked |
| hgo-patch-preflight-before-signature | Verify an exact HGO patch before requesting a human signature | c | no commit; touches human-guard-override (protected area) if built — class may become d |
| pipeline-hooks-act-in-repositories-that-never-opted-in | Pipeline hooks act in repositories that never opted in | c | no commit, no slice |
| onboarding-init-greenfield-matrix-is-serial-and-slow | Greenfield onboarding tests serialize independent fixtures | c | onboarding/test infra untouched in range |
| windows-greenfield-scratch-write-denied | Admit physically contained Windows scratch writes during onboarding | d | guard part of R1 "scratch writable sweep" (protected); unsure whether R1 covers the Windows greenfield case |
| model-family-approval-with-automatic-version-upgrades | Model families approved once, new versions used automatically (German title) | c | no commit, no slice |
| agy-driver-dispatch-and-design-routes-incomplete | Antigravity: driver neglects AGY, dispatches unclean, design cannot complete | c | design-route part shrinks with ADR-0085; rest unstarted |
| claude-session-start-emits-codex-transcript-recovery-hint | Claude SessionStart emits a Codex-specific transcript recovery hint | c | no commit, no slice |
| claude-windows-greenfield-lifecycle-not-walkable | Claude on Windows cannot make all required lifecycle calls | d | overlaps R1 lifecycle-coordination / draft-phase-preflight (protected); unsure if fully covered |
| session-readiness-drops-to-partial-after-bootstrap-ready | Session readiness is `partial` after a fully ready bootstrap sequence | c | FLAP2/FLAPW/FLAP3 landed before the range; likely a close-out confirmation, not verified |
| design-trailer-verifier-lost-after-closure | The design-commit trailer verifier was lost after its item was closed | c | `2a466fa59` only dropped the rejected trailer text; verifier not restored |
| git-hook-runtime-snapshots-go-stale-after-plugin-changes | Git hook runtime snapshots go stale after plugin changes; installed-plugin read refused as cross-repo write | b | HOOKREFRESH S1-S7 partial (`c07f177f3`, `3bc3f2e74`, `9aa9ddf89`, `81d0e45d3`); A-S2 named |
| guard-suite-fails-60-tests-on-native-windows | The guard suite fails 60 tests on native Windows | c | no commit; individual fixes (null device, temp root) land elsewhere |
| signed-quality-package-route-is-not-agent-operable-on-windows | The signed quality package route is not agent-operable on native Windows | d | R3 ceremony parts (protected); R7-6 partial (`b365c009a`, `8f5bab8de`) |
| capability-inventory-checker-is-red-at-head | Capability-inventory checker is red at HEAD | d | re-baseline only after the signed registration package (execution order, night 2026-10-05) |
| critic-cannot-complete-a-security-review-under-the-dispatch-budget-guard | Critic cannot complete a security review under the dispatch-budget guard | c | BUDGETCAP `46cc537b5` and R7-11 landed; effect on Critic reviews unconfirmed |
| dispatch-record-log-stays-empty-despite-mandatory-phase-entries | Dispatch-record log stays empty despite the mandatory per-phase entries | c | may fold into the dispatch-record lane (T31, protected); no commit, no slice |
| guard-push-refuses-a-read-only-git-grep-no-index-as-ambiguous-push-target | guard-push refuses read-only `git grep --no-index` as ambiguous push target | d | guard-push is protected; Q12 classifier landed (`d9b4bf031`) but this refusal is in guard-push |
| host-crash-during-verify-leaves-a-descriptor-no-recovery-verb-can-clear | Host crash during a full Verify leaves a descriptor no recovery verb can clear | c | no commit, no slice |
| shell-grammar-file-is-a-kernel-path-without-capability-placement | The shell-grammar file is a kernel path without a capability placement | d | kernel-path/registration work (protected package) |
| critic-scratch-notes-write-is-refused-again | Critic scratch-notes writes are refused again | b | `f95fc6998` aligned the notes route (Write); recurrence not re-measured |
| fanout-ledger-spawns-powershell-on-every-stop-on-windows | The fan-out ledger spawns PowerShell on every Stop evaluation on native Windows | c | pre-range FANOUT-F5b/SF22 spawn pin may already cover it; no in-range commit |
| gitleaks-repair-does-not-check-that-the-moved-value-is-the-reviewed-one | The gitleaks ignore repair does not check that the moved value is the reviewed one | d | GLREP `2c2aafccd` landed pre-range; item stays open until the registration package is signed |
| desktop-app-support-is-unverified | Pipeline support in the Claude Desktop app is unverified | c | filed in `9454821f5`; needs a PO host check, no slice |

Part 1 counts: a 0 · b 2 · c 16 · d 7 · total 25.

## Part 2 — triage section 2 (superseded by ADR-0085, decision I)

No commit in range removes or replaces a superseded design-course mechanism: `f98388740` (plan), `120fba18f` (U2 receipt),
`b716d3fb3` (U1 checker) and `8545160e8` (U3 binding) are additive. Removal belongs to the protected package P0-P9.

| Entry | Class | Evidence (slice) |
|---|---|---|
| advisor-demand-reuse | d | P3 + P8 (Advisor stage removed from `design-course-session.mjs`) |
| advisor-question-contract-binding | d | P3 + P8 (same removal) |
| codex-design-readiness-child | b | readiness child becomes the U1 mechanical check (`b716d3fb3`); removal of the child is P3 |
| design-workflow-package-omits-contract | b | U1 checker + U3 binding add the contract binding; package builder REPLACE is P3 |
| readiness-input-omits-advisor | d | P3 (readiness content gate removed) |
| revised-native-design-new-advisor-course | d | P3 + P8 (no Advisor course in the new route) |
| design-course-run-v2-own-routes (course part) | d | P3 + P8 (`runDesignCourseV2` removed) |
| claude-design-readiness-windows | d | P8 (retire writers, typed stubs) |
| codex-advisor-evidence-after-host-update | d | P8 (Advisor evidence reader retired) |
| greenfield-design-course-cost | d | P3 (course removed; one review) |
| unrelated-directory-entry-package (reader part) | d | P3 (package readers replaced) |
| unasked-advisor-export-consent (advisor half) | d | P8 (Advisor export writer retired) |
| role-route-preflight (Advisor part) | d | P3 + P8 (Advisor stage removal) |
| 2026-10-07-design-phase-runs-critic-advisor-readiness | b | U1-U3 landed; stage removal P3/P8 pending |
| authority-decision-literal (likely) | d | P1 (new record + validator); "likely" stays unconfirmed |
| push-classifier-powershell-backtick (Q12 option B) | a | classifier inverted in `d9b4bf031`, bypasses closed `49d6f928d`, heredoc runners `e694f8509`; guard-push pins protected, close after those pins |
| push-classifier-nested-quotes (Q12 option B) | a | same commits as above |

Part 2 counts: a 2 · b 3 · c 0 · d 12 · total 17.

## Part 3 — triage section 6 (deferred, in scope by PO decision AH)

Needs: `probe` = measure first; `design + PO choice` = design note and options for the PO; `implementation only`;
`PO host run` = needs the PO's own host. Inferred from entry names; item bodies not opened.

| Entry | Needs | Open question (if PO choice) | Note |
|---|---|---|---|
| delivery-is-not-always-a-git-push (Batman) | design + PO choice | Which non-push delivery modes (PR, merge, artifact hand-off) does the pipeline recognise, and who clears each? | Batman-scheduled; touches the push gate |
| three-runners-admin-overhead | design + PO choice | Which admin steps may be dropped or automated per runner without weakening a gate? | was post-0.7 |
| codex-worker-supervisor-sandbox | probe | n/a (measure the native-Windows Codex sandbox first) | native-Windows Codex package; re-triage was 2026-12-15 |
| selected-critic-lane | design + PO choice | Is a Critic lane on native-Windows Codex acceptable at all, and under which fallback? | same package |
| t1-fallback | design + PO choice | What fallback replaces the T1 critical path when the Codex lane is unavailable? | same package |
| author-repair-signed-chain | design + PO choice | Which signature chain authorises an author repair of protected source? | PO authority area |
| every-small-correction-new-hash | implementation only | n/a | follows R3 signing parts |
| orchestrator-write-lease | design + PO choice | Which orchestrator writes need a lease and what is the lease holder model? | named in AH |
| hooks-enforce-parallel-dispatch | design + PO choice | Move FANOUT from shadow to enforce for dispatch (FANOUT Q1-Q7)? | enforce wiring is a PO decision |
| codex-own-session-audit-export | probe | n/a | needs a measured Codex export surface |
| cross-runner-chat-intake | probe | n/a | item says host capture is needed; measure per runner |
| elephant-main-context telemetry | implementation only | n/a | |
| bootstrap-skill-budget | implementation only | n/a | last, after skill content settles |
| agy-imported-plugin-snapshot | design + PO choice | Topology A or B for the Antigravity imported-plugin snapshot? | spike first, then PO topology choice |
| no-uninstall-path | design + PO choice | Which B2 uninstall policy (full removal, retire-in-place, none)? | |
| disjoint-signed-hgo-actions | probe | n/a | probe first per AH |
| existing-signing-key-reuse | probe | n/a | probe first per AH |
| script-mediated-writes integrity | design + PO choice | How are writes through scripts bound to the protected-path rules? | security design |
| dispatch-record-ownership (worktree-per-Goldfish) | design + PO choice | Integration and identity model for one worktree per Goldfish? | R4-sized item |
| three-runner happy path (AC-32 host run) | PO host run | n/a | PO runs Claude/Codex/Antigravity on a host |

Part 3 counts: probe 5 · design + PO choice 11 · implementation only 3 · PO host run 1 · total 20 entries
(codex-worker-supervisor-sandbox, selected-critic-lane and t1-fallback counted separately). PO-choice items: 11.

## Counts and class (c)

Parts 1 and 2 together (42 rows): a 2 · b 5 · c 16 · d 19. Part 3 carries no class; all 20 entries are unstarted.

Class (c) from Part 1 (16): bounded-reader-terminal-binding · codex-wsl-required-advisor-has-no-completable-route ·
hgo-patch-preflight-before-signature · pipeline-hooks-act-in-repositories-that-never-opted-in ·
onboarding-init-greenfield-matrix-is-serial-and-slow · model-family-approval-with-automatic-version-upgrades ·
agy-driver-dispatch-and-design-routes-incomplete · claude-session-start-emits-codex-transcript-recovery-hint ·
session-readiness-drops-to-partial-after-bootstrap-ready · design-trailer-verifier-lost-after-closure ·
guard-suite-fails-60-tests-on-native-windows · critic-cannot-complete-a-security-review-under-the-dispatch-budget-guard ·
dispatch-record-log-stays-empty-despite-mandatory-phase-entries · host-crash-during-verify-leaves-a-descriptor-no-recovery-verb-can-clear ·
fanout-ledger-spawns-powershell-on-every-stop-on-windows · desktop-app-support-is-unverified.

Unstarted by scope (Part 3, 20): every entry in the Part 3 table.

Combined unstarted total: 36 (16 + 20). The earlier reconciliation had 50 class (c); together 86 unstarted entries.
