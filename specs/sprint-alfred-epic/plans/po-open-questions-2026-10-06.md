# Open PO questions across the Alfred design and plan files (index)

Purpose: one place that lists every open PO question found in the Alfred design and plan files, each with its source anchor.
Date: 2026-10-06. **Index only; the sources are canonical.** Nothing here is a decision, ranking or recommendation of the
index author; the "Source recommendation" column quotes the source only. Where a source records a question as already
decided, the row says `decided (path:line)` instead of open. Questions in `s3-state-split-plan.md` are as of commit
`4ae2fb8382abf3120478765713f32cccefcef89f` (HEAD at read time); that file may be edited afterwards, so re-check its anchors.

Summary (rows per source; open + decided):

| Source | Rows | Open | Decided |
|---|---|---|---|
| `plans/0.7-execution-order.md` | 11 | 10 | 1 (partly) |
| `design/feature-branch-push-signature-design.md` (PUSHSIG) | 5 | 5 | 0 |
| `design/fanout-enforcement-design.md` (FANOUT) | 7 | 7 | 0 |
| `design/bootstrap-hook-refresh-design.md` (HOOKREFRESH) | 7 | 7 | 0 |
| `design/s2-guard-split-plan.md` | 5 | 2 | 3 |
| `design/s3-state-split-plan.md` | 13 | 12 | 1 |
| `design/verify-registration-package-1/README.md` | 1 (the Q11 pair) | 1 | 0 |
| Backlog item: semgrep partial parsing | 1 | 1 | 0 |
| Backlog item: push classifier deny-list | 1 | 1 | 0 |

Paths below are repository-relative to `specs/sprint-alfred-epic/` unless they start with `backlog/`.

## 1. `plans/0.7-execution-order.md`

The file also points at PUSHSIG Q1-Q5, FANOUT Q1-Q7 and HOOKREFRESH questions 1-7; those are indexed in sections 2-4.

| ID | Question | Options named | Source recommendation | Anchor |
|---|---|---|---|---|
| Q8 | Do dispatch-time refusals need their own authorisation (ADR-0080 marks them "not authorized here")? | none named | none stated | plans/0.7-execution-order.md:239 |
| Q9 | How should the fan-out config supply `commonDir` to the Stop adapter, which now requires an absolute host path? | (1) dispatch guard writes resolved common dir to a private untracked runtime file; (2) Stop adapter derives it from `.git` by file reads only | none stated | plans/0.7-execution-order.md:254 |
| Q10 | `requiresEnforcement`: the default route still spawns git via `observeGovernanceScope`; resolve how? | same two options as Q9 | none stated | plans/0.7-execution-order.md:257 |
| Q11 | Two suites (`hardened-private-directory-install-tests`, `gitleaks-repair-ignore-cli-tests`) lack the case-completion protocol; migrate or other disposition? | migrate both test files to the protocol; or record a different disposition | "migrate both ... (recommended)" | plans/0.7-execution-order.md:259 |
| Q12 | Push classifier (`commandIsGitPush`): keep patching shapes, or invert to an allowlist of plain commands? | (A) keep patching shape by shape; (B) invert to allowlist | "(B) **recommended**" | plans/0.7-execution-order.md:277 |
| GL-09 category | Which GL-09 category applies to the fail-open Stop governor that blocks in enforce? | none named | none stated | plans/0.7-execution-order.md:240 |
| Slice-less read-only dispatch | Is a read-only Goldfish dispatch without `Slice:` refused in enforce? | refuse / admit | decided (plans/0.7-execution-order.md:240-241): "kept conservative: yes" (listed under PO decisions added) | plans/0.7-execution-order.md:240 |
| Bootstrap receipt | Where is the bootstrap receipt produced for a dispatch; this changes the receipt's meaning. | A synthetic guard call at SubagentStart; B export the writer in the signed package; C keep step-0 preflight | none stated | plans/0.7-execution-order.md:205 |
| Ancestor predicate | Narrow the advisor-provenance ancestor check to `dev`/`ino`/`mode` (a security-predicate change)? | narrow / keep | none stated | plans/0.7-execution-order.md:207 |
| Insecure common dir | Existing insecure `<common>/agent-pipeline` directories are refused by installers with no repair route: accept manual repair or add a repair verb? | accept manual repair; add a repair verb | none stated | plans/0.7-execution-order.md:209 |
| FX5(d) | `dispatch-record-ALF-ADOPTION-PROOF.json` is missing on this PC and the recovery-index checker is a closed signed scheme; how to proceed? | check the laptop for the record before any schema change | "Check the laptop for the record before any schema change" | plans/0.7-execution-order.md:211 |

Row count: 11 = Q8-Q12, GL-09, slice-less, and the four queued items (10 open, 1 decided).

## 2. PUSHSIG: `design/feature-branch-push-signature-design.md` (section 11, line 208)

| ID | Question | Options named | Source recommendation | Anchor |
|---|---|---|---|---|
| PUSHSIG Q1 | Should `chat` mode checkpoint pushes require a recorded chat clearance, or stay unsigned and unrecorded? | require recorded chat clearance; stay as designed | none stated | design/feature-branch-push-signature-design.md:210 |
| PUSHSIG Q2 | Extend the hook's PROTECTED-lane check to verify the signature too (one extra call)? | extend / not | "recommended as the next item" | design/feature-branch-push-signature-design.md:211 |
| PUSHSIG Q3 | Accept up to two housekeeping commits per signed checkpoint, or fund a larger change recording approvals outside the tracked state file? | accept two commits; larger change (protected `pipeline-state.mjs`) | none stated | design/feature-branch-push-signature-design.md:212 |
| PUSHSIG Q4 | Is an explicit "checkpoint" profile inside the signed subject worth the protected-file cost? | profile in subject; agent-side printout only | none stated (section 5 line 71 calls it an "optional follow-up") | design/feature-branch-push-signature-design.md:213 |
| PUSHSIG Q5 | Checkpoints before any approved plan cannot be signed; accept that, or keep the unsigned lane for the pre-plan draft phase? | accept; keep unsigned lane pre-plan | none stated | design/feature-branch-push-signature-design.md:214 |

## 3. FANOUT: `design/fanout-enforcement-design.md` (section 9, line 417)

| ID | Question | Options named | Source recommendation | Anchor |
|---|---|---|---|---|
| FANOUT Q1 | Amend ADR-0080 Decision 5 to allow a Stop-time governor for the turn-end case, with declare-instead-of-defy escape? | yes / no (ceiling stays `advisory`) | none stated | design/fanout-enforcement-design.md:419 |
| FANOUT Q2 | Default `target` 4 with ceiling 6 needs an EL-11 amendment; keep 5 as the ceiling? | ceiling 6 with amendment; ceiling 5 | none stated | design/fanout-enforcement-design.md:421 |
| FANOUT Q3 | Wiring ceremony for the `Stop` command in `hooks/hooks.json`: acceptable after a shadow period; how long? | shadow period length | "suggest 3 sessions or 1 week" | design/fanout-enforcement-design.md:422 |
| FANOUT Q4 | Register the S1-S6 tests in `harness/verify-suites.json` through one signed protected package? | yes / no | none stated | design/fanout-enforcement-design.md:424 |
| FANOUT Q5 | Accept `diff-only` plus Elephant integrator as the sustained-refill route until R4, or prioritise R4 (worktree per Goldfish)? | accept diff-only; prioritise R4 | none stated | design/fanout-enforcement-design.md:425 |
| FANOUT Q6 | Is an Elephant-recorded pause (`by: elephant`, max 4 h) acceptable, or only the PO's config switch? | Elephant pause; PO switch only | none stated | design/fanout-enforcement-design.md:426 |
| FANOUT Q7 | Queue location: `planPath`-sibling `slice-queue.json` per feature, or one repo-wide file? | sibling per feature; one repo-wide file | none stated | design/fanout-enforcement-design.md:427 |

## 4. HOOKREFRESH: `design/bootstrap-hook-refresh-design.md` (section 5, line 201)

| ID | Question | Options named | Source recommendation | Anchor |
|---|---|---|---|---|
| HOOKREFRESH Q1 | Should the stale-hook refresh be advisory or gating? | advisory with typed `nextAction`; gating | "Recommended: advisory ... never `hook-provisioning-blocked`" | design/bootstrap-hook-refresh-design.md:203 |
| HOOKREFRESH Q2 | Should the refresh action carry `requiresConfirmation` false or true? | false (like pre-push `installCommand`); true (like `clone-hook-readiness --apply`) | none stated | design/bootstrap-hook-refresh-design.md:204 |
| HOOKREFRESH Q3 | Downgrade policy: accept "loaded plugin = truth", or add version ordering with a marker-compat plan? | accept current model; add ordering | none stated | design/bootstrap-hook-refresh-design.md:205 |
| HOOKREFRESH Q4 | Confirm that a decline is never auto-overridden by a refresh? | confirm | "(recommended)" | design/bootstrap-hook-refresh-design.md:207 |
| HOOKREFRESH Q5 | May the catalogue admit pre-commit/commit-msg refresh like pre-push `--install`; does it need the PO's blessing in the decision register? | admit with blessing; not | none stated | design/bootstrap-hook-refresh-design.md:208 |
| HOOKREFRESH Q6 | Shared checkout across Windows and WSL: which OS refreshes, and is cross-OS stale detection in scope? | none named | none stated | design/bootstrap-hook-refresh-design.md:210 |
| HOOKREFRESH Q7 | Wedge S5: fix first, or accept until S1-S4 land? | fix first; accept until S1-S4 | none stated | design/bootstrap-hook-refresh-design.md:211 |

## 5. `design/s2-guard-split-plan.md` (table rows, lines 317-321)

| ID | Question | Options named | Source recommendation | Anchor |
|---|---|---|---|---|
| S2 Q1 | Extend the PB-GUARD-HOOKS pattern to `lib/guard/*.mjs`? | yes / no | "**Yes**, in package 1" - decided (plans/0.7-execution-order.md:142-143: "S2 decisions taken by the Elephant per the plan's recommendations: Q1 yes") | design/s2-guard-split-plan.md:317 |
| S2 Q2 | Core in the facade or in `evaluate.mjs`? | facade; `evaluate.mjs` | "`evaluate.mjs`" - decided (plans/0.7-execution-order.md:143: "Q2 core in `evaluate.mjs`") | design/s2-guard-split-plan.md:318 |
| S2 Q3 | Do the 23 pure-addition modules need to be inside the signed package? | inside package; ordinary commits | "Try ordinary commits first; run `check-protected-delta` ... before requesting a signature" | design/s2-guard-split-plan.md:319 |
| S2 Q4 | Two PO signatures for "S2+R1+R2"? | two signatures; single package | "Yes (package 1 move, package 2 behaviour)" - decided (plans/0.7-execution-order.md:143: "Q4 two packages") | design/s2-guard-split-plan.md:320 |
| S2 Q5 | Should lane tests move out of the 11.8k-line suite? | in S2; follow-up slice | "Not in S2 ... a follow-up slice" | design/s2-guard-split-plan.md:321 |

## 6. `design/s3-state-split-plan.md` (as of commit `4ae2fb8382abf3120478765713f32cccefcef89f`; open-questions table, lines 475-491)

| ID | Question | Options named | Source recommendation | Anchor |
|---|---|---|---|---|
| S3 Q1 | Extract the 26 inline handlers into verb modules in package 1, or keep `run` verbatim and extract in package 2? | extract in package 1; keep verbatim (option B) | "Extract in package 1, last wave" | design/s3-state-split-plan.md:479 |
| S3 Q2 | Extend `PB-SANCTIONED-WRITER` to `lib/state/[^/]+\.mjs`? | yes / no | "Yes, in package 1"; follow whatever S2 decided | design/s3-state-split-plan.md:480 |
| S3 Q3 | New whitelisted transform b2 for the 21 self-path sites, or a shared `WRITER_SCRIPT` constant? | transform b2; shared constant | "b2" | design/s3-state-split-plan.md:481 |
| S3 Q4 | Repoint the four guard importers in package 1 or package 2? | package 1; package 2 | three `lib/guard/*` importers as ordinary commits before the flip; hook in package 2 unless the startup gate fails | design/s3-state-split-plan.md:482 |
| S3 Q5 | 36 modules, or merge by layer to about 28? | 36; ~28 merged | "Start with 36 ... merge only if the startup gate or the slice count hurts" | design/s3-state-split-plan.md:483 |
| S3 Q6 | Two PO signatures (package 1 move, package 2 behaviour), and what happens to existing `approved` states? | two signatures; typed migration and replay decision | "Two signatures"; package 2 needs a typed migration and a PO decision on `approve-plan` replay | design/s3-state-split-plan.md:484 |
| S3 Q7 | The four red suites: leave red through package 1 and fix in package 2, or fix first? Does each encode target or stale behaviour? | leave red; fix first | "Leave red in package 1"; direction "not determinable from the inputs" | design/s3-state-split-plan.md:485 |
| S3 Q8 | Facade budget with the ~367-line header comment. | keep comment in facade | decided (design/s3-state-split-plan.md:486: "Resolved by design"); only "Confirm keeping the comment in the facade" remains | design/s3-state-split-plan.md:486 |
| S3 Q9 | Which route edits the TP-5 protected `pipeline-state.test.mjs` (PS06a0)? | human override; author repair; signed package | "PO/Elephant choice with `repair-map.mjs`" | design/s3-state-split-plan.md:487 |
| S3 Q10 | Keep `PIPELINE_STATE_COMMANDS` verbatim (72 listed) with five `listed:false` rows in package 1, or list them now? | verbatim; list now (changes help text) | "Verbatim in package 1, derive in package 2" | design/s3-state-split-plan.md:488 |
| S3 Q11 | What does "simplified design-course ledger with `revise`" mean: which collections go, what does `revise` do, who may call it? | none named | "Needs a PO-level spec before package 2" | design/s3-state-split-plan.md:489 |
| S3 Q12 | After `approved` is removed, do `set-phase implementation`, `seal-plan-approval`, `present-plan` stay, become replays, or go? | stay; replay; remove | "Keep `set-phase implementation` as idempotent replay for one release"; decide the other two with 5.1 | design/s3-state-split-plan.md:490 |
| S3 Q13 | Preserve the quirk that a malformed state file exits 2 before `help`, and fix it in package 2? | preserve in package 1; fix in package 2 | "Preserve in package 1; fix in package 2 with a test" | design/s3-state-split-plan.md:491 |

## 7. `design/verify-registration-package-1/README.md`

| ID | Question | Options named | Source recommendation | Anchor |
|---|---|---|---|---|
| Q11 (deferred pair) | How to treat `hardened-private-directory-install-tests` and `gitleaks-repair-ignore-cli-tests`, not registered because they lack the case-completion protocol? | migrate both test files to the protocol; a different disposition | none stated here (plans/0.7-execution-order.md:259 says migrate "(recommended)") | design/verify-registration-package-1/README.md:44-47 |

## 8. Backlog items (Proposal options only)

| ID | Question | Options named | Source recommendation | Anchor |
|---|---|---|---|---|
| Semgrep partial parsing | PO decision on security-gate semantics: how should warn-level partial-parsing `errors[]` entries affect the scan? | (A) keep fail-closed on every entry, exclude or restructure unparsable files; (B) treat `level: warn` entries as degraded coverage with a visible coverage note, `error`/timeouts stay `scanner_error` | none stated | backlog/items/2026-10-06-semgrep-partial-parsing-warnings-fail-the-whole-scan.md:35-40 |
| Push classifier deny-list | Whether to invert the push classifier to an allowlist of plain commands (source names Q12 of the execution order). | invert to allowlist and delete shape-specific checks (the only option the Proposal states; A/B are in Q12 above) | none stated beyond the proposal itself | backlog/items/2026-10-06-push-classifier-deny-list-does-not-converge.md:37-43 |
