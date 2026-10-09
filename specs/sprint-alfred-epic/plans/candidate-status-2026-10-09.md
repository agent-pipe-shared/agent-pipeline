# Candidate status board 2026-10-09: 0.7.0 acceptance criteria and open backlog items

Built at HEAD `b20f9123c75f1e17e159f3933e610b2f11d8bcd1` (short `b20f9123c`) on 2026-10-09; the dispatch briefing named candidate `4fedcd69e`. Every `landed` claim below was re-checked by resolving its commit in the ancestry of that HEAD (0 commit references resolved, 0 unresolved). Nothing here is PO-accepted; implementation complete is not done.

## Method and limits

- AC list: the spec carries no AC ids of its own (only AC-25 and AC-32 are mentioned in it); the 37 ACs and 4 incident-derived IR criteria are those of `specs/sprint-alfred-epic/acceptance.md`, mapped to spec sections by `traceability.md`. IR-1..IR-4 are listed but not surveyed.
- Section A statuses for AC-1..AC-5, AC-7, AC-8, AC-10, AC-12, AC-16..AC-24 rest on the 2026-10-07 reconciliation (RECON-2A: file presence, tests not run) because no later commit touches them by name; they are marked `unverified` or `landed (file presence)`, never as accepted. Statuses for AC-6 and AC-26..AC-37 combine RECON-2A with the execution-order rulings (to Ruling 158) and the git log since 2026-10-06.
- Section B reads frontmatter (`status`, `sprint`) of every item under `backlog/items/` and classifies each open, non-Batman, non-Nightwing item with the 2026-10-08 survey class (a/b/c/d), the (d) dispositions and the PROBE-A/B/C results. Item bodies and Triage text were not re-read; no Triage was changed. For survey class (b) the status is inherited from the owning AC row (owner mapping only; the item itself was not re-tested).
- Vocabulary: landed (SHA) / implementation-complete awaiting review / in flight (slice) / open (planned slice) / host-check (H-row) / deferred / unverified / not surveyed. The Batman and Nightwing sprints are excluded by their frontmatter `sprint` (decision BN).

## Section A: acceptance criteria

| AC | Criterion (short) | Status | Slices | Evidence pointer |
|---|---|---|---|---|
| AC-1 | Enforcement-conformance records; placement rows consistent | landed (file presence only; per-runner host records and a fresh green run not established) | A1, A2 | [1 tracked file(s) matching `enforcement-conformance.test`, last `fddf9ca78`] [1 tracked file(s) matching `control-placement.test`, last `ef471b03f`] `policies/control-placement.v1.json` (present, last `ef471b03f`) |
| AC-2 | No agent route mutates protected, approved or closed bytes | unverified (partial per RECON-2A; A3/A4/A5 fixtures not confirmed by name; no later slice in the log) | A3, A4, A5 | [1 tracked file(s) matching `protected-baseline.test`, last `26fef9e7d`] |
| AC-3 | Every pipeline-state verb passes every readiness observer | landed (file presence only; green not re-run) | A5 | [1 tracked file(s) matching `pipeline-state-observer-conformance.test`, last `ef471b03f`] |
| AC-4 | submit/approve-plan refuse pre-authority staging paths | unverified (no A4-named fixture found by RECON-2A) | A4 | none located |
| AC-5 | Closed-evidence drift: detect, fail closed, repair verbs | unverified (partial; 2026-08-27 replay not found by RECON-2A) | A5 | `backlog/evidence/2026-09-13-discard-feature-observer-conformance.md` (present, last `2ccc006f7`) |
| AC-6 | Interruption baseline and promotion evidence with explicit PO approval | in flight (evaluator and baseline writer landed; promotion-record reader planned; writer cases host-only; PO approval still owed) | AC6-F, AC6-F2, AC6-F3, DESIGN-AC6-PROMO, AC-6 promotion record reader (next-actions section 3, decision BB), host-check H2 | `eca10d71d` `88ec01bc7` `39896509e` `1e475885a` `417d27630` `5ae19bbd7` |
| AC-7 | Rigor floor deterministic; disagreement log before enforcement | unverified (partial; disagreement log not confirmed) | B1 | [1 tracked file(s) matching `rigor-floor.test`, last `b10a5b7c3`] `specs/sprint-alfred-epic/evidence/b1-minimum-rigor-floor.md` (present, last `cb7c910d8`) |
| AC-8 | Greenfield resolves inherited-agent-first; custom profile honoured | unverified (partial; custom-profile case unconfirmed) | D2, D3 | [1 tracked file(s) matching `architecture-adoption.test`, last `b10a5b7c3`] `architecture/agent-first-profile.v1.json` (MISSING) |
| AC-9 | Dogfood D4 adoption flow end to end in this repository | open (PO action: durable adoption decision and evidence set; orientation shows adoption deferred, decision po-0.7.0-release-defer-2026-09-20) | D4 | none yet |
| AC-10 | Model-judged evaluator output can never be pass | unverified (partial; fixture name unconfirmed) | D3 | [1 tracked file(s) matching `architecture-fitness.test`, last `26fef9e7d`] |
| AC-11 | Eight B2 routes; refusals name their route | unverified (partial; R7-6 realignment pins and tranche-1 signed package exist, per-route coverage not re-checked) | B2, R7-6 | `017df6cd5` `dbe72ffd5` `da20519dd` |
| AC-12 | Rules-as-code sweep: GG-22 defined, strip tool, push-flow doc | unverified (partial; strip stale-prose cases unconfirmed) | B3 | [1 tracked file(s) matching `backlog-item-strip-for-dispatch.test`, last `1202ca55c`] `guardrails/git.md` (present, last `b7c660282`) |
| AC-13 | Every sprint backlog item closed or PO-visibly re-triaged; ledger reconciled | open (close-time act; this board is the live survey of the set; live count and GitHub trail at close) | backlog sweep (Section B) | `specs/sprint-alfred-epic/plans/backlog-reconciliation-2026-10-07.md` (present, last `0571fc432`) `0571fc432` |
| AC-14 | Every wave passes at least one independent Critic round | in flight (continuous; rule since Rulings 156/158: one batched Critic per batch, follow-ups on the delta diff only) | per-package Critic rounds | [92 tracked file(s) matching `evidence/critic-`, last `72ce39400`] |
| AC-15 | Per-issue documentation acceptance on the candidate | open (close-time, candidate-bound) | close-out | none yet |
| AC-16 | Host-layout onboarding tests assert the success contract | unverified (post-Nova re-derivation not located by RECON-2A) | - | `specs/sprint-alfred-epic/evidence/wave0-post-rebase-rederivation.md` (present, last `b0bd5df56`) |
| AC-17 | No implementation authority with an unresolved architecture disposition | unverified (partial; planning-boundary run unconfirmed) | D4 | [1 tracked file(s) matching `architecture-adoption-orientation.test`, last `b10a5b7c3`] |
| AC-18 | Stale map fails closed; checkpoint push records debt | unverified (partial; class-7 fixtures unconfirmed) | D3 | [1 tracked file(s) matching `architecture-adoption.test`, last `b10a5b7c3`] |
| AC-19 | Decision parity across runners | unverified (partial; two-runner replay unconfirmed) | D1 | [1 tracked file(s) matching `architecture-effective-decisions.test`, last `ef471b03f`] |
| AC-20 | Critic catches a token ADR that does not match its implementation | unverified (partial; #99 section 7 fixture unconfirmed) | D1 | [1 tracked file(s) matching `architecture-fitness.test`, last `26fef9e7d`] |
| AC-21 | Anti-fragmentation: tiny-module shredding is rejected | unverified (partial; #104 fixture unconfirmed) | D3 | [1 tracked file(s) matching `module-inventory.test`, last `ef471b03f`] |
| AC-22 | Planning findings carry remedy options | landed (file presence; comparison generator test present) | D2 | [1 tracked file(s) matching `architecture-remedy.test`, last `b10a5b7c3`] |
| AC-23 | AGENTS.md links the map bundle; re-entry order resolves | unverified (partial; walkthrough evidence missing) | D2 | none located |
| AC-24 | Provider-free AGY dispatch seam with typed receipt | landed (file presence; fake-executable cases not individually checked) | E3 | [1 tracked file(s) matching `goldfish-antigravity-host.test`, last `25a449c30`] [1 tracked file(s) matching `agy-session-dispatch.test`, last `b7c660282`] `schemas/pipeline.cross-runner-dispatch-receipt.v1.json` (present, last `d1b2d4073`) |
| AC-25 | Native Claude/Codex Goldfish host-commit | landed (file presence; a fresh clone stays UNVERIFIABLE by design) | E4 | [11 tracked file(s) matching `native-goldfish-host-`, last `425bd046e`] |
| AC-26 | Lifecycle-command admission (R1-1..R1-9) | in flight (push-classifier and read-admission work landed; R1 catalogue slice is protected and TR-B/TR-C/TR-G post-images await the signed tranche 2; mapping of TR slices to this AC is the Elephant judgment) | R1 catalogue (tranche), TR-B, TR-C, TR-G, Q12 | `49d6f928d` `e694f8509` `d9b4bf031` `2e8f28979` `1774bf07a` `05ff95626` |
| AC-27 | Read policy (R2-1..R2-5) | in flight (TR-B read-grammar post-images landed unsigned, rg -g kept refused by Ruling 145; R2 case coverage and WSL UNC files unverified) | TR-B | `2e8f28979` `3ca198f4e` |
| AC-28 | Two-decision ceremonies (R3-1..R3-7) | in flight (tranche 1 signed; TR-S1 encrypted-key gate and key-pointer chain continue, TR-S1-F3b next) | TR-S1-F3, TR-S1-F3b, R7-6 | `da20519dd` `0388fd0fe` `546e8c513` `56d8b25bc` `c1ef8d69a` |
| AC-29 | Runner and platform parity (R4-1..R4-10) | in flight (role-route preflight module and close-side route evidence landed; R4 S3b/S4/S5, WINMF and AL follow-ups open; AL-2 and R4-12 measurement need host H9) | R4-S1..S5, WINMF, AL, AM-W | `bec5c83db` `345a65770` `ba6e46f5e` `314359cf6` `4cead36e4` `eb1c5e06c` |
| AC-30 | Design-course contract (R5-1..R5-8) | in flight (answers-file and asked-once landed; R5-F2 guard part is protected and goes to a tranche; status of PO question N14 not re-read) | R5-F1..F7, R5-F2 | `3344bb075` `3204da549` `4c555b5d7` `825ebd998` `a42e4c120` |
| AC-31 | Forensics and audit (R6-1..R6-5) | in flight (R6-2 continuity drift projection landed; State inspect wiring R6-F2b and the audit-index script planned) | R6-D, R6-F2b, audit index | `3dd46ac9f` `fb3b8ff66` `49d91f868` |
| AC-32 | Three-runner end-to-end happy path on the stamped candidate | host-check (PO-run host sessions on the matrix; the H-rows of the host checklist) | H1-H12 | `specs/sprint-alfred-epic/plans/candidate-host-checklist-2026-10-08.md` (present, last `03e86f419`) |
| AC-33 | Recovery availability (RV-1..RV-11) | in flight (RV S1-S5 and S7 landed; RV-S6 forward-only recovery implementation and S8-S11 open) | RV-S1..S11 | `81c288f32` `a3399a2d7` `02aa75cd4` `e8f2e0abf` `cfe695a5d` `98682d7c4` `6684a3cb9` |
| AC-34 | Uninstall refuses a foreign hook (PU-FOREIGN-HOOK-CONFLICT) | implementation-complete awaiting review (AC34-F2 self-verified per ruling 29; POSIX run is host row H12) | AC34-T/F/Fb/F2, host-check H12 | `697aa4b30` `eb7cd7e63` `aa395e32e` |
| AC-35 | Model-family approval and role mechanism (extends AC-29) | in flight (drive-letter fix landed; R4-12 hook measurement and AL-2 pending, host H9) | WINMF, R4 | `4cead36e4` |
| AC-36 | PO-decision ceremonies (extends AC-28) | in flight (signing-window and chat-mode cases ride the TR-S1 / R7-6 chain) | TR-S1, R7-6 | `0388fd0fe` `546e8c513` |
| AC-37 | Agent-recoverable operation and device portability (R7-1..R7-11e) | in flight (R7-1, R7-3 gate and bound-path classification, R7-5 library, R7-6 tranche 1, R7-7, R7-11 landed; R7-3-F1e held, R7-5 verb integration and R7-6 part 3 open; device-switch walk not reached) | R7-x slices | `2532a96fe` `77bd8dad8` `605defa6c` `225944f2e` `cfeb1ceea` `35d876a11` `4311c6f96` `975352801` |
| IR-1 | Post-close write to a bound Result refused/detected (incident class) | not surveyed (incident-derived criterion, not in the briefed AC list) | - | - |
| IR-2 | discard-feature on active continuity ends in a ready session | not surveyed (incident-derived criterion) | - | - |
| IR-3 | Four seed interruption classes emit correct receipts | not surveyed (incident-derived criterion) | - | - |
| IR-4 | Bounded read-only interpreter probe admitted; opaque write denied | not surveyed (incident-derived criterion) | - | - |

## Section B: open backlog items outside Batman and Nightwing (169)

| Item | Sprint | Survey class | Status | Slices | Evidence |
|---|---|---|---|---|---|
| `2026-09-06-the-t1-fallback-waits-for-failure-codes-the-route-collapses-before-they-arrive` | none | (c) next-actions only | landed (typed pre-launch fallback; AL-2 stays host-check H9) | AL-F2 | `eb1c5e06c` `9a317fa56` |
| `2026-09-27-installed-design-trailer-example-is-rejected-by-git-guard` | alfred | (a) fixed in source | landed (cited commits verified in HEAD ancestry; item stays open until the host-checklist close batch) | mechanical Triage slice | `2a466fa59` |
| `2026-09-28-design-approval-validator-rejects-json-key-reordering` | alfred | (d) not covered | landed (probe: canonical compare) | PROBE-B | `3d9ffe770` |
| `2026-09-28-model-role-confirmation-prompt-obscures-required-digest` | alfred | (d) not covered | landed (probe: fixed in source) | PROBE-B | `26fef9e7d` |
| `2026-09-28-onboarding-home-override-does-not-bind-machine-plane` | none | (d) not covered | landed (probe: fixed in source) | PROBE-B | `26fef9e7d` |
| `2026-09-28-prepared-codex-readiness-receipt-does-not-bind-finalized-output` | none | (a) fixed in source | landed (cited commits verified in HEAD ancestry; item stays open until the host-checklist close batch) | mechanical Triage slice | `8b5dcf4fb` |
| `2026-09-28-stale-hgo-capability-shadows-current-authorization` | none | (d) not covered | landed (fixed in source and pinned; re-check recorded) | HGO-STALE-T | `26fef9e7d` `83d9caf97` |
| `2026-09-28-worktree-process-start-parser-misreads-spaced-comm` | alfred | (d) not covered | landed (source fix plus start-tick pin) | PROCSTART | `26fef9e7d` `7082974ea` |
| `2026-09-29-antigravity-1-2-13-blocks-managed-refresh` | alfred | (a) fixed in source | landed (cited commits verified in HEAD ancestry; item stays open until the host-checklist close batch) | mechanical Triage slice | `d1a015ff5` |
| `2026-09-29-claude-greenfield-seeds-unselected-codex-targets` | alfred | (d) not covered | landed (enabledRunners gate plus the Claude-only pin) | GREENFIELD-TARGETS | `d1a015ff5` `dfa9aba6a` |
| `2026-09-29-commit-grammar-hint-still-requires-scratch-message-file` | alfred | (a) fixed in source | landed (cited commits verified in HEAD ancestry; item stays open until the host-checklist close batch) | mechanical Triage slice | `15722ce6a` |
| `2026-09-29-git-hook-runtime-snapshot-omits-protected-baseline-catalog` | alfred | (a) fixed in source | landed (host run still owed; item stays open until the host-checklist close batch) | mechanical Triage slice | `26fef9e7d` (host run) |
| `2026-09-29-governance-scope-rejects-readonly-host-git-control` | alfred | (d) not covered | landed (probe: fixed in source; host-check) | PROBE-B, host checklist | `26fef9e7d` |
| `2026-09-29-native-patch-rename-drops-protected-content-markers` | alfred | (a) fixed in source | landed (host run still owed; item stays open until the host-checklist close batch) | mechanical Triage slice | `26fef9e7d` (host run) |
| `2026-09-29-nongit-retirement-reader-calls-inaccessible-controller-helper` | alfred | (d) not covered | landed (probe: fixed) | PROBE-B | `26fef9e7d` |
| `2026-09-29-onboarding-test-runner-reports-async-pass-before-settlement` | alfred | (a) fixed in source | landed (host run still owed; item stays open until the host-checklist close batch) | mechanical Triage slice | `26fef9e7d` (host run) |
| `2026-09-29-protected-baseline-rejects-canonical-discarded-idle-state` | alfred | (a) fixed in source | landed (host run still owed; item stays open until the host-checklist close batch) | mechanical Triage slice | `26fef9e7d` (host run) |
| `2026-09-29-retirement-reader-masks-typed-unsafe-layout-inspection` | alfred | (a) fixed in source | landed (host run still owed; item stays open until the host-checklist close batch) | mechanical Triage slice | `26fef9e7d` (host run) |
| `2026-09-29-semgrep-default-version-check-blocks-offline-local-rules-scan` | none | (a) fixed in source | landed (cited commits verified in HEAD ancestry; item stays open until the host-checklist close batch) | mechanical Triage slice | `26fef9e7d` (4/156 fail on host) |
| `2026-09-29-worktrees-share-onboarding-private-state-with-root-bound-intake` | alfred | (d) not covered | landed (probe: fixed in source) | PROBE-B | `26fef9e7d` |
| `2026-10-03-dispatch-guard-rejects-built-in-capitalized-agent-types` | alfred | (a) fixed in source | landed (cited commits verified in HEAD ancestry; item stays open until the host-checklist close batch) | mechanical Triage slice | `57e397b0f` |
| `2026-10-04-brownfield-implementation-entry-demands-a-greenfield-design-block` | alfred | (a) fixed in source | landed (cited commits verified in HEAD ancestry; item stays open until the host-checklist close batch) | mechanical Triage slice | `21fee38d1` |
| `2026-10-05-agent-obligations-says-no-and-and-while-the-guard-admits-six-segments` | alfred | (a) fixed in source | landed (cited commits verified in HEAD ancestry; item stays open until the host-checklist close batch) | mechanical Triage slice | `7b1b4083b` |
| `2026-10-05-budget-checkpoint-fires-below-the-briefed-cap` | alfred | (a) fixed in source | landed (cited commits verified in HEAD ancestry; item stays open until the host-checklist close batch) | mechanical Triage slice | `b89e26e0f` `573b5355b` |
| `2026-10-05-commit-producer-path-order-failures-count-against-the-tool-cap` | alfred | (a) fixed in source | landed (cited commits verified in HEAD ancestry; item stays open until the host-checklist close batch) | mechanical Triage slice | `c277e4aac` |
| `2026-10-05-completion-fd-suites-cannot-run-as-single-files` | alfred | (a) fixed in source | landed (cited commits verified in HEAD ancestry; item stays open until the host-checklist close batch) | mechanical Triage slice | `2f0c00932` |
| `2026-10-05-gitleaks-content-suppression-does-not-match-on-windows` | alfred | (a) fixed in source | landed (cited commits verified in HEAD ancestry; item stays open until the host-checklist close batch) | mechanical Triage slice | `e92635db7` |
| `2026-10-05-gitleaks-repair-ignore-cli-is-a-no-op-on-windows` | alfred | (a) fixed in source | landed (cited commits verified in HEAD ancestry; item stays open until the host-checklist close batch) | mechanical Triage slice | `c30c005d8` |
| `2026-10-05-guard-push-treats-gitleaks-as-a-git-command` | alfred | (a) fixed in source | landed (cited commits verified in HEAD ancestry; item stays open until the host-checklist close batch) | mechanical Triage slice | `6b0413700` `6ca4474d3` |
| `2026-10-05-kernel-closure-check-masks-violations-after-the-first` | alfred | (d) not covered | landed (every violation reported in one run; computed-site edges) | CLOSURE-ALL | `3ea6cf67a` `8fea94671` |
| `2026-10-05-node-v24-on-windows-creates-a-real-nul-file` | alfred | (a) fixed in source | landed (cited commits verified in HEAD ancestry; item stays open until the host-checklist close batch) | mechanical Triage slice | `866be2139` `12ac0a7af` |
| `2026-10-05-push-classifier-misreads-backslash-escaped-quotes` | alfred | (a) fixed in source | landed (cited commits verified in HEAD ancestry; item stays open until the host-checklist close batch) | mechanical Triage slice | `6b0413700` `a2857ac3a` |
| `2026-10-05-source-agent-definition-change-locks-that-agent-until-install` | alfred | (a) fixed in source | landed (cited commits verified in HEAD ancestry; item stays open until the host-checklist close batch) | mechanical Triage slice | `337492443` |
| `2026-10-05-verify-on-a-wsl-mnt-drive-checkout-hides-its-reason` | alfred | (a) fixed in source | landed (cited commits verified in HEAD ancestry; item stays open until the host-checklist close batch) | mechanical Triage slice | `dac8d1314` |
| `2026-10-06-critic-scratch-name-randomness-has-no-admitted-command` | alfred | (a) fixed in source | landed (cited commits verified in HEAD ancestry; item stays open until the host-checklist close batch) | mechanical Triage slice | `f95fc6998` |
| `2026-10-06-critic-scratch-notes-write-is-refused-again` | alfred | (a) fixed in source | landed (cited commits verified in HEAD ancestry; item stays open until the host-checklist close batch) | mechanical Triage slice | `f95fc6998` |
| `2026-10-06-git-for-windows-2-56-rejects-git-config-global-nul` | alfred | (a) fixed in source | landed (cited commits verified in HEAD ancestry; item stays open until the host-checklist close batch) | mechanical Triage slice | `12ac0a7af` `2532a96fe` |
| `2026-10-06-goldfish-bugfix-module-conflicts-with-qg-04` | alfred | (a) fixed in source | landed (cited commits verified in HEAD ancestry; item stays open until the host-checklist close batch) | mechanical Triage slice | `b3cabc7f8` |
| `2026-10-06-mandatory-hook-readiness-returned-refusal-skips-rollback` | alfred | (a) fixed in source | landed (cited commits verified in HEAD ancestry; item stays open until the host-checklist close batch) | mechanical Triage slice | `ddabe0ae3` |
| `2026-10-06-push-classifier-deny-list-does-not-converge` | alfred | (a) fixed in source | landed (cited commits verified in HEAD ancestry; item stays open until the host-checklist close batch) | mechanical Triage slice | `d9b4bf031` `49d6f928d` |
| `2026-10-06-push-classifier-does-not-model-powershell-backtick-escapes` | alfred | (a) fixed in source | landed (cited commits verified in HEAD ancestry; item stays open until the host-checklist close batch) | mechanical Triage slice | `c9b9d0101` `d9b4bf031` |
| `2026-10-06-push-classifier-misses-nested-quotes-and-redirect-before-push` | alfred | (a) fixed in source | landed (cited commits verified in HEAD ancestry; item stays open until the host-checklist close batch) | mechanical Triage slice | `7b0bb402a` `49d6f928d` |
| `2026-10-06-semgrep-partial-parsing-warnings-fail-the-whole-scan` | alfred | (a) fixed in source | landed (cited commits verified in HEAD ancestry; item stays open until the host-checklist close batch) | mechanical Triage slice | `28eac0677` `d69d39ad5` |
| `2026-10-07-a-read-only-probe-can-dump-the-process-environment-into-a-transcript` | alfred | (a) fixed in source | landed (cited commits verified in HEAD ancestry; item stays open until the host-checklist close batch) | mechanical Triage slice | `da20519dd` |
| `2026-10-07-design-workflow-package-v2-readiness-fixture-fails-on-windows` | alfred | (d) not covered | landed (typed win32 skip naming the WSL route) | WIN-SKIPS-T | `2d2950803` |
| `2026-10-07-heredoc-fed-to-non-shell-command-runners-is-data-to-the-push-classifier` | alfred | (a) fixed in source | landed (cited commits verified in HEAD ancestry; item stays open until the host-checklist close batch) | mechanical Triage slice | `e694f8509` |
| `2026-10-07-private-temp-root-not-secure-branch-has-no-test-seam` | alfred | (d) not covered | landed (injectable seams and the NOT_SECURE pin) | TEMP-SEAM | `885016ac4` `552cbd2c4` `0407f3d4a` |
| `2026-10-07-semgrep-console-coverage-note-has-no-test` | alfred | (d) not covered | landed (formatter export and degraded-line pin; independent review pending) | SEMGREP-NOTE-T/T2/T3 | `32c8cda31` `f2ea9ed4e` |
| `2026-10-07-signing-default-test-fixture-root-escapes-the-repository` | alfred | (a) fixed in source | landed (cited commits verified in HEAD ancestry; item stays open until the host-checklist close batch) | mechanical Triage slice | `32169fca8` |
| `2026-10-07-vim-es-and-busybox-heredoc-runners-are-data-to-the-push-classifier` | alfred | (a) fixed in source | landed (cited commits verified in HEAD ancestry; item stays open until the host-checklist close batch) | mechanical Triage slice | `8fafb1e99` |
| `2026-10-08-approval-verification-demands-head-equals-candidate` | alfred | (c) next-actions only | landed (pins and fix) | Wave 1 | `ce6b30031` `975352801` |
| `2026-10-08-evidence-artifacts-carry-no-commit-identity` | alfred | (a) fixed in source | landed (cited commits verified in HEAD ancestry; item stays open until the host-checklist close batch) | mechanical Triage slice | `be0bd4a91` |
| `2026-10-08-git-push-classifier-misses-env-s-and-editor-bang` | alfred | (a) fixed in source | landed (cited commits verified in HEAD ancestry; item stays open until the host-checklist close batch) | mechanical Triage slice | `9bc217fe9` `d256c7e81` |
| `2026-10-08-model-role-bootstrap-is-always-unavailable-on-native-windows` | alfred | (a) fixed in source | landed (cited commits verified in HEAD ancestry; item stays open until the host-checklist close batch) | mechanical Triage slice | `4cead36e4` |
| `2026-10-09-a-dead-owner-audit-lock-is-permanently-ambiguous-on-windows` | none | filed after survey | landed (win32 liveness decision; recovery path rendering) | T90 | `58a30b844` `b6c0b087d` `eca42af19` |
| `2026-10-09-agent-obligations-recommends-a-commit-spelling-guard-push-refuses` | alfred | filed after survey | landed (message-file commit route emitted and documented) | commit-flow producer | `6b3acec96` `5fc1abc5d` `03f32e339` |
| `2026-09-06-the-selected-critic-lane-briefs-contract-files-it-neither-pins-nor-binds` | none | (c) next-actions only | implementation-complete awaiting review (AL work; AL-2 needs host H9) | AL | `eb1c5e06c` `a3af12b0c` |
| `2026-09-28-agy-imported-plugin-snapshot-shadows-registered-plugin` | alfred | (b) spec-owned | implementation-complete (follows AC-34; owner mapping only, item itself not re-tested) | see AC-34 | owner: §18, AM-W |
| `2026-09-28-no-uninstall-path-for-a-repository-that-once-opted-in` | alfred | (b) spec-owned | implementation-complete (follows AC-34; owner mapping only, item itself not re-tested) | see AC-34 | owner: §18, AC-34 |
| `2026-09-28-pipeline-hooks-act-in-repositories-that-never-opted-in` | alfred | (b) spec-owned | implementation-complete (follows AC-34; owner mapping only, item itself not re-tested) | see AC-34 | owner: §18 |
| `2026-09-29-agy-managed-copy-first-start-lacks-attestation` | none | (b) spec-owned | implementation-complete (follows AC-34; owner mapping only, item itself not re-tested) | see AC-34 | owner: §18 (weak), AM-W |
| `2026-09-29-reconnect-sandbox-empty-child-output-breaks-bootstrap` | alfred | (d) not covered | implementation-complete awaiting review (GS-RETRY typed one-shot retry; Critic round recorded) | GS-RETRY | `9ac936236` `bd0dea586` `d1a015ff5` `specs/sprint-alfred-epic/evidence/critic-GS-RETRY-20261009.md` (present, last `16af5328e`) |
| `2026-09-29-security-scanner-failures-lose-executable-and-timeout-provenance` | none | (d) not covered | implementation-complete awaiting review (six delivered files located and verified in PROBE-C; protected successor and native scanner acceptance open) | SCANNER-PROV, SEMGREP-SEAM | `1ba019d0b` |
| `2026-10-04-git-hook-runtime-snapshots-go-stale-after-plugin-changes` | alfred | (d) not covered | implementation-complete awaiting review (same HOOKREFRESH landing) | HOOKREFRESH-E | `5a3fe2eec` `eb2478e24` `c974ed27c` |
| `2026-10-05-bootstrap-should-refresh-hooks-when-the-plugin-updated` | alfred | (d) not covered | implementation-complete awaiting review (preflight enforces the refresh with a typed action; S3 helper admission is a later GUARDRAIL slice for the tranche) | HOOKREFRESH-E, HOOKREFRESH S3 | `5a3fe2eec` `fa8aaf39d` `72a9f81c5` `eb2478e24` |
| `2026-10-06-gitleaks-repair-does-not-check-that-the-moved-value-is-the-reviewed-one` | alfred | (a) fixed in source | implementation-complete awaiting review (registration pending) | mechanical Triage slice | `2c2aafccd` (registration pending) |
| `2026-09-28-advisor-demand-reuse-has-no-design-course-bound` | none | (b) spec-owned | in flight (follows the ADR-0085 stack; owner mapping only) | ADR0085-* | owner: §17 (ADR-0085) |
| `2026-09-28-advisor-question-contract-and-final-source-binding-conflict` | none | (b) spec-owned | in flight (follows the ADR-0085 stack; owner mapping only) | ADR0085-* | owner: §17 (ADR-0085) |
| `2026-09-28-codex-design-readiness-child-rejects-valid-review` | alfred | (b) spec-owned | in flight (follows the ADR-0085 stack; owner mapping only) | ADR0085-* | owner: §17 (ADR-0085) |
| `2026-09-28-declared-system-skill-read-requires-human-override` | none | (d) not covered | in flight (folded into the TR-B read grammar; post-images landed, tranche-2 signature pending) | TOILRES TR-B | `2e8f28979` `3ca198f4e` |
| `2026-09-28-design-workflow-package-omits-contract` | alfred | (b) spec-owned | in flight (follows the ADR-0085 stack; owner mapping only) | ADR0085-* | owner: §17 (ADR-0085) |
| `2026-09-28-lifecycle-inspect-omits-current-plan-spec-digests` | none | (b) spec-owned | in flight (follows AC-31; owner mapping only, item itself not re-tested) | see AC-31 | owner: R6-2 |
| `2026-09-28-lifecycle-read-scope-blocks-host-declared-system-skill` | alfred | (d) not covered | in flight (folded into the TR-B read grammar; post-images landed, tranche-2 signature pending) | TOILRES TR-B | `2e8f28979` `3ca198f4e` |
| `2026-09-28-plan-submission-must-not-require-separate-po-approval` | none | (b) spec-owned | in flight (follows the ADR-0085 stack; owner mapping only) | ADR0085-* | owner: §17 |
| `2026-09-28-readiness-input-omits-current-advisor-observation` | none | (d) not covered | in flight (superseded by ADR-0085; closes when the removal lands) | ADR0085-D3b, T0a-c | `913d2ac8c` `3d76cd186` |
| `2026-09-29-codex-advisor-evidence-fails-after-host-update` | alfred | (d) not covered | in flight (ADR-0085 P8 retires the reader) | ADR0085-D3b, T0a-c | `913d2ac8c` |
| `2026-09-29-codex-own-session-audit-export-missing` | alfred | (b) spec-owned | in flight (follows AC-31; owner mapping only, item itself not re-tested) | see AC-31 | owner: R6-1 (weak) |
| `2026-09-29-existing-signing-key-reuse-deadlocks-onboarding` | alfred | (b) spec-owned | in flight (follows AC-28; owner mapping only, item itself not re-tested) | see AC-28 | owner: R3-1/R7-6 (weak) |
| `2026-09-29-first-enrollment-enters-retirement-before-consent` | alfred | (b) spec-owned | in flight (follows AC-28; owner mapping only, item itself not re-tested) | see AC-28 | owner: §21.0, R3-1 |
| `2026-09-29-greenfield-design-course-cost-and-proportionality` | alfred | (b) spec-owned | in flight (follows AC-30; owner mapping only, item itself not re-tested) | see AC-30 | owner: R5-1 (ADR-0085) |
| `2026-09-29-greenfield-machine-output-and-skill-budget` | alfred | (b) spec-owned | in flight (follows AC-29; owner mapping only, item itself not re-tested) | see AC-29 | owner: R4-6 |
| `2026-09-29-unasked-advisor-export-consent-in-fresh-seed` | alfred | (b) spec-owned | in flight (follows the ADR-0085 stack; owner mapping only) | ADR0085-* | owner: §17 (ADR-0085) |
| `2026-09-29-unrelated-directory-entry-changes-reject-approved-design-package` | none | (b) spec-owned | in flight (follows the ADR-0085 stack; owner mapping only) | ADR0085-* | owner: §17, R7-5 |
| `2026-09-29-windows-greenfield-scratch-write-denied` | alfred | (b) spec-owned | in flight (follows AC-26; owner mapping only, item itself not re-tested) | see AC-26 | owner: R1-4 |
| `2026-09-29-windows-pre-push-installer-fsync-and-relative-action` | alfred | (b) spec-owned | in flight (follows AC-29; owner mapping only, item itself not re-tested) | see AC-29 | owner: K3-13, K6-2 |
| `2026-09-30-model-family-approval-with-automatic-version-upgrades` | alfred | (b) spec-owned | in flight (follows AC-29; owner mapping only, item itself not re-tested) | see AC-29 | owner: R4-11 |
| `2026-09-30-read-only-guard-admits-execution-and-output-options` | alfred | (b) spec-owned | in flight (follows AC-27; owner mapping only, item itself not re-tested) | see AC-27 | owner: R2-3 (weak) |
| `2026-10-03-advertised-git-to-head-pipeline-is-refused` | alfred | (b) spec-owned | in flight (follows AC-27; owner mapping only, item itself not re-tested) | see AC-27 | owner: R2-4 |
| `2026-10-03-agy-driver-dispatch-and-design-routes-incomplete` | alfred | (b) spec-owned | in flight (follows AC-29; owner mapping only, item itself not re-tested) | see AC-29 | owner: R4-3 |
| `2026-10-03-claude-session-start-emits-codex-transcript-recovery-hint` | alfred | (b) spec-owned | in flight (follows AC-29; owner mapping only, item itself not re-tested) | see AC-29 | owner: R4-6 |
| `2026-10-03-claude-windows-greenfield-lifecycle-not-walkable` | alfred | (b) spec-owned | in flight (follows AC-30; owner mapping only, item itself not re-tested) | see AC-30 | owner: R5-3, R1-1 |
| `2026-10-03-claude-windows-guard-refuses-every-in-repo-read` | alfred | (b) spec-owned | in flight (follows AC-27; owner mapping only, item itself not re-tested) | see AC-27 | owner: R2-1 |
| `2026-10-03-dispatch-budget-lock-refuses-every-subagent-call-on-windows` | alfred | (b) spec-owned | in flight (follows AC-29; owner mapping only, item itself not re-tested) | see AC-29 | owner: R4-4, R7-11 |
| `2026-10-03-draft-phase-guard-blocks-mandatory-bootstrap-preflight` | alfred | (b) spec-owned | in flight (follows AC-26; owner mapping only, item itself not re-tested) | see AC-26 | owner: R1-3 |
| `2026-10-03-feature-branch-push-admitted-without-signature-approval` | alfred | (b) spec-owned | in flight (follows AC-28; owner mapping only, item itself not re-tested) | see AC-28 | owner: R3-2 |
| `2026-10-03-forensics-and-audit-evidence-not-reconstructable` | alfred | (b) spec-owned | in flight (follows AC-31; owner mapping only, item itself not re-tested) | see AC-31 | owner: R6-1…R6-5 |
| `2026-10-03-git-stash-list-classified-as-working-tree-write` | alfred | (b) spec-owned | in flight (follows AC-26; owner mapping only, item itself not re-tested) | see AC-26 | owner: R1-5 |
| `2026-10-03-guard-override-request-digest-drifts-after-arming` | alfred | (b) spec-owned | in flight (follows AC-28; owner mapping only, item itself not re-tested) | see AC-28 | owner: R3-3 |
| `2026-10-03-handover-doc-committed-without-governance-classification` | alfred | (b) spec-owned | in flight (follows AC-31; owner mapping only, item itself not re-tested) | see AC-31 | owner: R6-3 |
| `2026-10-03-lifecycle-coordination-commands-refused-as-implementation-writes` | alfred | (b) spec-owned | in flight (follows AC-26; owner mapping only, item itself not re-tested) | see AC-26 | owner: R1-1/R1-2 |
| `2026-10-03-read-blocks-and-misleading-denial-texts-across-runners` | alfred | (b) spec-owned | in flight (follows AC-27; owner mapping only, item itself not re-tested) | see AC-27 | owner: R2-5 |
| `2026-10-03-role-route-preflight-with-self-dispatch-fallback` | alfred | (b) spec-owned | in flight (follows AC-29; owner mapping only, item itself not re-tested) | see AC-29 | owner: R4-1/R4-2 |
| `2026-10-03-session-readiness-drops-to-partial-after-bootstrap-ready` | alfred | (b) spec-owned | in flight (follows AC-26; owner mapping only, item itself not re-tested) | see AC-26 | owner: R1-9 |
| `2026-10-03-signature-ceremony-requires-operator-work-and-breaks` | alfred | (b) spec-owned | in flight (follows AC-28; owner mapping only, item itself not re-tested) | see AC-28 | owner: R3-4/R3-5 |
| `2026-10-04-approved-lifecycle-state-refuses-its-own-recovery-and-backlog-writes` | alfred | (b) spec-owned | in flight (follows AC-37; owner mapping only, item itself not re-tested) | see AC-37 | owner: R7-4 |
| `2026-10-04-claude-design-readiness-cannot-start-on-windows` | alfred | (b) spec-owned | in flight (follows AC-29; owner mapping only, item itself not re-tested) | see AC-29 | owner: R4-9/R4-10 (ADR-0085) |
| `2026-10-04-design-course-run-v2-refuses-its-own-documented-routes` | alfred | (b) spec-owned | in flight (follows AC-30; owner mapping only, item itself not re-tested) | see AC-30 | owner: R5-8 (ADR-0085) |
| `2026-10-04-design-trailer-verifier-lost-after-closure` | alfred | (b) spec-owned | in flight (follows AC-30; owner mapping only, item itself not re-tested) | see AC-30 | owner: R5-2 |
| `2026-10-04-guard-suite-fails-60-tests-on-native-windows` | alfred | (b) spec-owned | in flight (follows AC-29; owner mapping only, item itself not re-tested) | see AC-29 | owner: R4-8 (weak) |
| `2026-10-04-parallel-work-in-one-checkout-is-unsafe` | alfred | (b) spec-owned | in flight (follows AC-37; owner mapping only, item itself not re-tested) | see AC-37 | owner: R7-11, N5/N10 |
| `2026-10-04-passive-read-policy-admits-uncovered-credential-files-and-rg-follow` | alfred | (b) spec-owned | in flight (follows AC-27; owner mapping only, item itself not re-tested) | see AC-27 | owner: R2-2 |
| `2026-10-04-revised-native-design-cannot-reach-a-new-advisor-course` | alfred | (b) spec-owned | in flight (follows AC-30; owner mapping only, item itself not re-tested) | see AC-30 | owner: R5-6 (ADR-0085) |
| `2026-10-04-signed-quality-package-route-is-not-agent-operable-on-windows` | alfred | (b) spec-owned | in flight (follows AC-37; owner mapping only, item itself not re-tested) | see AC-37 | owner: R7-6 (weak) |
| `2026-10-05-advisor-provenance-ancestor-check-fails-on-any-sibling-write` | alfred | (d) not covered | in flight (ADR-0085 removal) | ADR0085-D3b, T0a-c | `913d2ac8c` |
| `2026-10-05-critic-cannot-complete-a-security-review-under-the-dispatch-budget-guard` | alfred | (b) spec-owned | in flight (follows AC-29; owner mapping only, item itself not re-tested) | see AC-29 | owner: K3-12 (weak) |
| `2026-10-05-every-dispatch-pays-a-bootstrap-receipt-detour` | alfred | (b) spec-owned | in flight (follows AC-37; owner mapping only, item itself not re-tested) | see AC-37 | owner: R7-11e |
| `2026-10-05-host-crash-during-verify-leaves-a-descriptor-no-recovery-verb-can-clear` | alfred | (b) spec-owned | in flight (follows AC-33; owner mapping only, item itself not re-tested) | see AC-33 | owner: §20 RV, AC-33, R7-2 |
| `2026-10-05-outside-root-read-label-skips-option-value-file-tokens` | alfred | (d) not covered | in flight (read-grammar family, TR-B) | TOILRES TR-B | `2e8f28979` |
| `2026-10-05-preflight-with-a-forward-slash-plugin-path-records-no-bootstrap-receipt` | alfred | (b) spec-owned | in flight (follows AC-26; owner mapping only, item itself not re-tested) | see AC-26 | owner: R1-3, R7-11e |
| `2026-10-05-scratch-has-no-retention-and-no-durability-check` | alfred | (d) not covered | in flight (retention library and sweep CLI landed; durability check open) | SCRATCH | `27e172a64` `dea126ba9` |
| `2026-10-05-shell-classifier-faults-on-heredoc-body-text` | alfred | (d) not covered | in flight (comments and heredoc bodies fixed; guard part protected, signed tranche) | TRANCHE, TR-C | `d9b4bf031` `35a1369f8` |
| `2026-10-05-windows-os-temp-root-dacl-fails-private-state-assurance-for-test-fixtures` | alfred | (b) spec-owned | in flight (follows AC-29; owner mapping only, item itself not re-tested) | see AC-29 | owner: K3-10 (weak) |
| `2026-10-06-approval-bound-design-package-lives-in-an-ignored-directory` | alfred | (b) spec-owned | in flight (follows AC-37; owner mapping only, item itself not re-tested) | see AC-37 | owner: R7-3 |
| `2026-10-06-preflight-hides-the-git-error-behind-gs-git-unavailable` | alfred | (b) spec-owned | in flight (follows AC-37; owner mapping only, item itself not re-tested) | see AC-37 | owner: R7-1b/c |
| `2026-10-07-design-phase-runs-critic-advisor-and-readiness-instead-of-one-review` | alfred | (d) not covered | in flight (ADR-0085: additive U1-U3 and v8 record landed; removal slices pending; Ruling 157 settled items 3 and 4) | ADR0085-D3b, T0a-c, F-order | `fad3b88e1` `3d76cd186` `913d2ac8c` |
| `2026-10-07-sign-intent-bare-openssl-spawn-searches-the-working-directory-on-windows` | alfred | (b) spec-owned | in flight (follows AC-37; owner mapping only, item itself not re-tested) | see AC-37 | owner: R7-6e |
| `2026-10-08-auto-install-pre-push-hook-with-the-plugin` | alfred | (b) spec-owned | in flight (follows AC-37; owner mapping only, item itself not re-tested) | see AC-37 | owner: K6-2, R7-7e |
| `2026-10-08-catalogue-admit-prescribed-lifecycle-verbs` | alfred | (b) spec-owned | in flight (follows AC-26; owner mapping only, item itself not re-tested) | see AC-26 | owner: R1-1/R1-2, R7-9c |
| `2026-10-08-denial-names-a-diagnosis-it-refuses` | alfred | (b) spec-owned | in flight (follows AC-37; owner mapping only, item itself not re-tested) | see AC-37 | owner: R7-4 |
| `2026-10-08-machine-wide-key-directory-resolution` | alfred | (b) spec-owned | in flight (follows AC-37; owner mapping only, item itself not re-tested) | see AC-37 | owner: R7-6 (recurred) |
| `2026-10-08-signing-toolchain-readiness` | alfred | (b) spec-owned | in flight (follows AC-37; owner mapping only, item itself not re-tested) | see AC-37 | owner: R7-6, R7-7 |
| `2026-10-08-transfer-redaction-alters-digest-bound-files` | alfred | (b) spec-owned | in flight (follows AC-37; owner mapping only, item itself not re-tested) | see AC-37 | owner: R7-3 (weak) |
| `2026-10-09-concurrent-session-warning-never-fires-on-native-windows` | alfred | filed after survey | in flight (CSW-T pin landed; CSW-F planned) | CSW-T, CSW-F | `5f1434105` |
| `2026-10-09-restricted-governance-put-re-hardens-the-root-on-every-write` | alfred | filed after survey | in flight (hardening made idempotent and DACL-judged; WIN-HARDEN-F continues) | WIN-HARDEN-F, WIN-GES-F5 | `5a72c9b61` `f70f97ec6` |
| `2026-09-29-cross-runner-chat-intake-reference-needs-host-capture` | alfred | (d) not covered | open (planned slice HOST-TURN; probe verdict not fixed) | HOST-TURN | PROBE-B |
| `2026-09-29-disjoint-signed-hgo-actions-invalidate-one-another` | alfred | (d) not covered | open (planned slice HGO-DISJOINT, GUARDRAIL class; probe verdict not fixed) | HGO-DISJOINT | PROBE-B |
| `2026-09-29-onboarding-init-greenfield-matrix-is-serial-and-slow` | alfred | (d) not covered | open (test-only: split cells after a coverage-equality assert) | - | PROBE-C row |
| `2026-10-01-hooks-enforce-available-parallel-dispatch` | none | (d) not covered | open (design line and probe first; PO choice FANOUT; hooks/ tranche) | - | PROBE-C row |
| `2026-10-04-signing-prompt-prints-the-whole-review-package` | alfred | (d) not covered | open (planned slice SIGN-PROMPT, serialised after TR-S1) | SIGN-PROMPT | PROBE-C row |
| `2026-10-05-dispatch-record-log-stays-empty-despite-mandatory-phase-entries` | alfred | (d) not covered | open (planned slice DREC-LOG; probe verdict not fixed) | DREC-LOG | PROBE-B |
| `2026-10-05-dispatch-record-ownership-binds-an-attempted-creation` | alfred | (c) next-actions only | open (planned N10; design note landed) | N10 | `190c62d99` |
| `2026-10-05-dispatch-records-land-under-specs-evidence` | alfred | (d) not covered | open (guard part is protected: signed tranche) | TRANCHE | `9fcda03f6` |
| `2026-10-05-elephant-main-context-spent-on-wake-ups-and-inline-reads` | alfred | (d) not covered | open (doc-only; body not read in this pass) | - | PROBE-C row |
| `2026-10-05-guard-push-refuses-a-read-only-git-grep-no-index-as-ambiguous-push-target` | alfred | (d) not covered | open (PO decided in Ruling 157: exempt markers for non-push subcommands; GREP-PUSH-T then GREP-PUSH-F planned, not yet in the log) | GREP-PUSH-T, GREP-PUSH-F | Ruling 157 |
| `2026-10-05-script-mediated-writes-bypass-protected-test-paths` | alfred | (c) next-actions only | open (planned N6; design note landed) | N6 | `7811b4f4e` |
| `2026-10-05-shell-grammar-file-is-a-kernel-path-without-capability-placement` | alfred | (d) not covered | open (item underspecified; probe first; kernel package) | - | PROBE-C row |
| `2026-10-07-critic-round-cap-and-delta-scope-are-not-enforced` | alfred | (d) not covered | open (accepted for 0.7.0; needs a design line, then failing dispatch-guard tests; tranche) | critic-round-cap | PROBE-C row |
| `2026-10-08-codex-bootstrap-in-the-typed-next-action` | alfred | (d) not covered | open (planned slice CODEX-NEXT; premise probe first) | CODEX-NEXT | PROBE-B |
| `2026-10-08-gh-delivery-classifier-is-not-wired` | alfred | (c) next-actions only | open (N11 wiring; classifier landed; tranche 2) | N11 | `cf9ed9f53` |
| `2026-10-08-sign-intent-disclosure-scan-blocks-for-minutes` | alfred | (c) next-actions only | open (R7-6 part 3; protected signing path, tranche) | R7-6 part 3 | next-actions section 0 item 2 |
| `2026-10-08-typed-plugin-update-next-action` | alfred | (d) not covered | open (HOOKREFRESH-D2 design note first) | HOOKREFRESH-D2 | `83083a070` |
| `2026-10-09-empty-trust-anchors-admit-any-self-made-key-at-the-design-approval-boundary` | alfred | filed after survey | open (PO decided by design in Ruling 157; the item is to be closed as by-design) | - | Ruling 157 |
| `2026-10-09-foreign-worktree-closes-the-implementation-gate` | alfred | filed after survey | open (T87 class; interim rule: no dispatch creates a worktree; no fix in the log) | T87 | Ruling 68 |
| `2026-10-09-goldfish-budgets-omit-the-closing-ceremony` | alfred | filed after survey | open (T123 states the hook caps in briefings; no code fix located) | T123 | Ruling 158 |
| `2026-10-09-guard-push-refuses-read-only-git-without-push` | alfred | filed after survey | open (same family as GREP-PUSH; Ruling 157 decision applies) | GREP-PUSH-T, GREP-PUSH-F | Ruling 157 |
| `2026-09-29-windows-portable-seed-rolls-back-with-hidden-worktree-error` | none | (d) not covered | host-check (host checklist C; needs a real host replay) | host checklist | dispositions C |
| `2026-10-03-three-runner-happy-path-with-two-po-approvals` | alfred | (b) spec-owned | host-check (follows AC-32; owner mapping only, item itself not re-tested) | see AC-32 | owner: AC-32, R3-1 |
| `2026-10-07-desktop-app-support-is-unverified` | alfred | (d) not covered | host-check (PO host check; docs landed) | host checklist | `dab757674` |
| `2026-08-30-codex-worker-supervisor-hardcodes-a-sandbox-mode-that-blocks-git-spawn` | none | (d) not covered | deferred (PO deferral 2026-09-11 to the native-Windows Codex package; not Batman/Nightwing; confirm in the PO list) | - | dispositions A-live |
| `2026-09-27-bounded-reader-terminal-binding` | alfred | (b) spec-owned | unverified (owner section has no AC id) | - | owner: §16 E |
| `2026-09-27-codex-wsl-required-advisor-has-no-completable-route` | alfred | (b) spec-owned | unverified (owner section has no AC id) | - | owner: §16 A, §17 (ADR-0085) |
| `2026-09-27-design-bootstrap-verify-state-contradicts-deferred-contract` | none | (b) spec-owned | unverified (owner section has no AC id) | - | owner: §16 D, R5-4 |
| `2026-09-27-design-generator-repeats-large-source-material` | none | (b) spec-owned | unverified (owner section has no AC id) | - | owner: §16 D |
| `2026-09-27-greenfield-approval-policy-applies-after-intake-transition` | alfred | (b) spec-owned | unverified (owner section has no AC id) | - | owner: §16 C |
| `2026-09-27-hgo-patch-preflight-before-signature` | alfred | (b) spec-owned | unverified (owner section has no AC id) | - | owner: §16 B |
| `2026-09-27-powershell-bypasses-onboarding-read-boundary` | alfred | (b) spec-owned | unverified (owner section has no AC id) | - | owner: §16 B, R7-8 |
| `2026-09-27-scratch-must-remain-writable-across-lifecycle-states` | alfred | (b) spec-owned | unverified (owner section has no AC id) | - | owner: §16 B, R1-4 |
| `2026-09-28-codex-advisor-shared-namespace-rejects-fresh-repository-identity` | none | (a) fixed in source | unverified (survey marks the fix tentative) | mechanical Triage slice | `8b5dcf4fb` (tentative) |
| `2026-10-05-capability-inventory-checker-is-red-at-head` | alfred | (c) next-actions only | unverified (partial; baseline refresh pending the tranche-2 registrations) | baseline refresh | `392dfab78` |

## Section C: counts and PO decisions

Counts by status category (the first words of each status cell):

| Category | AC rows (41) | Backlog rows (169) |
|---|---|---|
| landed | 5 | 56 |
| implementation-complete | 1 | 10 |
| in flight | 12 | 68 |
| open | 3 | 21 |
| host-check | 1 | 3 |
| deferred | 0 | 1 |
| unverified | 15 | 10 |
| not surveyed | 4 | 0 |

Backlog population: 872 item files (closed 664, deferred 11, open 193, rejected 3, (none) 1); 24 open items excluded because their sprint is batman or nightwing; 1 items in the 2026-10-08 survey are no longer open; 0 survey slugs have no file.

### Needs a PO decision (rulings that say so, not decided by Ruling 157)

- AC-9: the dogfood D4 adoption decision and evidence set (adoption is currently deferred by po-0.7.0-release-defer-2026-09-20).
- AC-6: explicit PO approval of the interruption-promotion record (decision BB; the signed record reader is not yet built).
- AC-32, AC-13, AC-15: PO-run host sessions and close-time acts (acts, not open questions).
- `codex-worker-supervisor-hardcodes-a-sandbox-mode-that-blocks-git-spawn`: the dispositions ask the PO to confirm the standing deferral.
- Not re-read in this pass (status unverified): the open PO questions N1-N15 in `po-open-questions-2026-10-07-night.md` and the living `plans/po-list-2026-10-08.md`. Ruling 157 settled D0, D1, the Ruling 132 seam, the e51844ab8 provenance, GREP-PUSH, TR-S2 exemptScripts, the Critic notes grant, the concurrent-session probe, Ruling 65 and ADR-0085 removal items 3 and 4; the trust-anchor item was ruled by design.
