# Claude re-measurement, 2026-10-16

HEAD: `20e3055c6`. Items: 174. JSON SHA256: `87c8b39c78a87626f9839f099c45f370b2bf109493161d74da2c87cdfb22758e`.

Same stage meanings as the 2026-10-12 matrix. Eight read-only readers; no test was rerun;
stage changes cite committed pins and their commit messages. This is engineering progress, not acceptance.
Baseline column = the 2026-10-12 matrix `currentEngineering` stage. The reader input carried
`originalStage` by mistake; only one row depended on it and is corrected below.

Known reader inconsistency: some readers gave 75 to fully covered pins whose commit message
states no pass count, while others held such rows at 50. Batch review must confirm every 75.

## Elephant adjudications

- pipeline.signing-toolchain-readiness: reader 25 -> 50. input-builder defect: the reader saw originalStage 25 as baseline; the 2026-10-12 matrix currentEngineering stage is 50 and no commit since contradicts it, so the keep-baseline rule yields 50.
- pipeline.merge-commit-message-skips-conventional-type-check: reader UNKNOWN -> 50. reader held the acceptance as an unreleased reconstruction; PO decision 2026-10-16 #21 released the reconstructed original acceptances R1-R5 as a block, so the acceptance maps to the committed pin 15b5b2341af7; no pass counts stated, so 50, not the 75 baseline.
- pipeline.domain-scanner-findings-need-reproduction-before-remedy: reader UNKNOWN -> 50. same PO decision #21 maps AC-166 to the committed 9/9 pin 7eebbe101bc5; real gitleaks reproduction stays held, so 50.

| Stage | 2026-10-12 | 2026-10-16 |
|---|---:|---:|
| 25 | 55 | 16 |
| 50 | 75 | 141 |
| 75 | 9 | 9 |
| 100 | 0 | 0 |
| UNKNOWN | 35 | 8 |
| Index | 33.33% | 46.70% |

Integrity: missing 0, extra 0, invalid stage 0.

## Moves

| Item | From | To | Reason |
|---|---|---|---|
| pipeline.a-read-only-probe-can-dump-the-process-environment-into-a-transcript | 25 | 75 | Commit pins every proposal clause: env/printenv/set/export -p/env: drive/GetEnvironmentVariables/proc environ/whole process.env refused with GUARD-ENV-DUMP, main+subagent, no override route, plus Goldfish and Critic data-only sentences. No counts in message, so GREEN is inferred from the committed pin + mutants; confirm run at batch review. Wrapper forms (sudo env, bash -c env, xargs) documented out of reach, not an original clause. |
| pipeline.advertised-git-to-head-pipeline-is-refused | UNKNOWN | 50 | Fix committed with GREEN pin (42 pass) covering git show HEAD:path / head -n N and advertised-example pairing; unexplained adjacent guard suite failures and host skips keep it at 50. Raised from UNKNOWN on this commit. |
| pipeline.advisor-question-contract-and-final-source-binding-conflict | 25 | 50 | Shared question contract, unchanged sources, revision after advice, wrong question, unrelated candidate, forged chain and no-child masking are GREEN (10 pass), but the item's central end-to-end clause is only a typed skip, so 75 is not allowed. |
| pipeline.agent-obligations-recommends-a-commit-spelling-guard-push-refuses | 25 | 50 | Commit adds a contract case extracting the generated recommendation and running it through guard-push expecting admission (targeted green evidence for the main clause); missing path/counts and guard-union scope keep it at 50. |
| pipeline.agent-obligations-says-no-and-and-while-the-guard-admits-six-segments | 50 | 75 | Pin covers the item's required agreement: canonical and vendored obligations text equal the guard's six-segment bound and generated file matches fresh generation (source fix 7b1b4083b per Triage); optional 'export grammar from guard' improvement not a required clause. No counts in message — confirm run at batch review; host checklist is manual acceptance only. |
| pipeline.agy-imported-plugin-snapshot-shadows-registered-plugin | 25 | 50 | A Windows wiring-ownership repair is committed with a RED-to-GREEN case (code + targeted green evidence), but the commit fixes one defect while the backlog item's acceptance (spikes, topology observer, remediation, docs, version-correct run) is largely uncovered. |
| pipeline.agy-managed-copy-first-start-lacks-attestation | 25 | 50 | Receipt creation, byte-for-byte copy match, partial failure, global-scope refusal and manual recovery for a gitless source are GREEN, but the acceptance requires a native fresh-runner observation and there are 2 typed skips, so 75 is not allowed. |
| pipeline.approval-verification-demands-head-equals-candidate | UNKNOWN | 50 | Flag-forwarding and mirror cases are committed (repair with targeted evidence), but the core candidate-binding suites are typed skips on Windows, which blocks 75. Raised from UNKNOWN on this commit. |
| pipeline.approved-lifecycle-state-refuses-its-own-recovery-and-backlog-writes | 25 | 75 | All three proposal clauses GREEN: valid observation in approved and implementing, PORG-INVALID-OBSERVATION recovery admitted in four states, backlog/docs/scratch writes admitted in every state with src/ refused. The single skip is an extra link-escape security case, not an original clause; 'consider removing approved state' is an optional input, not acceptance. Run on native Windows — confirm at batch review. |
| pipeline.auto-install-pre-push-hook-with-the-plugin | 25 | 75 | Clone provisioning path now installs a missing pre-push (current untouched, foreign preserved, failure non-gating) with 6/6 + 18/18 GREEN, and the plugin install path already did, so the whole 'provision during install or clone' proposal is covered. Pin written post-fix, RED-to-GREEN not shown (left to batch Critic) — a review risk for batch review, not a held clause. |
| pipeline.bootstrap-should-refresh-hooks-when-the-plugin-updated | 25 | 50 | Stale-hook non-ready with one refresh action, Goldfish/Critic unaffected and refresh limited to stale managed hooks are GREEN (14 pass), but the actual refresh/install route is only skip-covered and the confirmation-line gate is unevidenced, so 50. |
| pipeline.bounded-reader-terminal-binding | 25 | 50 | The acceptance fixture clause (four rounds + terminal correction passes; unresolved finding, fifth round, mismatched commit/digest, changed document fail) is GREEN 11/11 on contained real-Git fixtures, but the real-course binding clause is not covered, so 75 is not allowed. |
| pipeline.budget-checkpoint-fires-below-the-briefed-cap | 25 | 75 | Triage narrowed the item to documentation (state which source wins); the pin covers min(briefed, maxTurns-15), ceil(0.8 x cap) checkpoint for caps 1..200, the 45->35 case, and that the Goldfish template states the clamp rule. No counts in message — confirm run at batch review. |
| pipeline.capability-inventory-checker-is-red-at-head | UNKNOWN | 50 | Inventory re-baselined, reader and sort defects fixed, and the pin asserts no other finding class remains, but the item's goal (checker not red) is still held as todo. Raised from UNKNOWN to 50 on this commit. |
| pipeline.capture-evidence-does-not-normalize-windows-npm-launch | 75 | 50 | PATHEXT fix and RED-to-GREEN pin are committed (code + green targeted evidence), but baseline 75 is lowered because the original acceptance cannot be mapped from a public original and the baseline itself lists native Windows qualification as open, which the 75 definition does not allow. |
| pipeline.catalogue-admit-prescribed-lifecycle-verbs | 25 | 50 | Raised from 25 on f7c7e9240ca0 with green admission cases for most prescribed verbs; not 75 because continuity writes are not shown admitted and one case is skipped. |
| pipeline.claude-design-readiness-cannot-start-on-windows | 25 | 50 | Raised from 25 on 7fa1b4332448: K5-10, K3-17, K5-12 green, but the R4-9/R4-10 typed sub-reason clause is explicitly not present. |
| pipeline.claude-greenfield-seeds-unselected-codex-targets | UNKNOWN | 50 | Acceptance now maps to a green plan-level pin, so UNKNOWN becomes 50; plan-only fakes leave platform matrix and real apply uncovered. |
| pipeline.claude-session-start-emits-codex-transcript-recovery-hint | 25 | 50 | Hook wiring and runner-neutral output are green with a positive control; the staleness-ref check is only weakly guarded, so not 75. |
| pipeline.claude-windows-greenfield-lifecycle-not-walkable | 25 | 50 | V-9, V-12, V-13 green with RED proofs; V-10 todo and happy-path skip keep it below 75. |
| pipeline.codex-advisor-evidence-fails-after-host-update | 25 | 50 | Bounded first-failing-subcheck diagnostic has 4 green cases and four failing mutants; three skips and installed replay keep it below 75. |
| pipeline.codex-advisor-shared-namespace-rejects-fresh-repository-identity | UNKNOWN | 50 | Acceptance maps to committed partly green pins; refusal clauses are typed skips and no counts stated. |
| pipeline.codex-bootstrap-in-the-typed-next-action | UNKNOWN | 50 | Pin is green but qualifies only the deferral; the inclusion clause is held. |
| pipeline.codex-design-readiness-child-rejects-valid-review | 25 | 50 | Retirement, typed failures and schema binding green; a todo and 3 skips cover original clauses. |
| pipeline.codex-own-session-audit-export-missing | 75 | 50 | Lowered from 75: the positive export path is covered only by typed skips, which do not qualify. |
| pipeline.codex-wsl-required-advisor-has-no-completable-route | 25 | 50 | Honest unavailable route and no-throw green; receipts, trail, real run and answered path held. |
| pipeline.configure-verify-output-lacks-a-walkable-commit-route | 75 | UNKNOWN | Lowered from 75: pin neither tracked nor present and the acceptance is only a reconstructed draft. |
| pipeline.critic-scratch-notes-write-is-refused-again | 25 | 50 | Windows owned-notes fix committed with RED-then-green pin; skips and open live check keep it below 75. |
| pipeline.cross-runner-chat-intake-reference-needs-host-capture | 25 | 50 | Checkpoint-binding clause covered with 5 green; expiry, adapters and end-to-end proof held. |
| pipeline.declared-system-skill-read-requires-human-override | UNKNOWN | 50 | Acceptance maps to a committed pin with 4 green; six clauses typed skips. |
| pipeline.denial-names-a-diagnosis-it-refuses | 25 | 50 | Partial coverage of the proposal; named diagnosis command and general rule uncovered. |
| pipeline.design-bootstrap-verify-state-contradicts-deferred-contract | UNKNOWN | 25 | Maps to a pin but no counts and the enforcement clause is only recorded. |
| pipeline.design-course-run-v2-refuses-its-own-documented-routes | 25 | 50 | Seven green cases show retirement mapping; two skips hold it at 50. |
| pipeline.design-intake-generator-omits-question-answers | 75 | 50 | Pin covers verbatim ordered answers and binding, but the acceptance measured against was a draft at measurement, contradicting baseline 75. |
| pipeline.design-phase-runs-critic-advisor-and-readiness-instead-of-one-review | 25 | 50 | Six green cases; present-plan path and RED mirrors are admitted gaps. |
| pipeline.design-workflow-package-omits-contract | 25 | 50 | Five-source binding and refusals pinned; several clauses text-only. |
| pipeline.design-workflow-package-v2-readiness-fixture-fails-on-windows | UNKNOWN | 50 | Cause measured (deliberate win32 platform gate); coverage loss converted to a skip; Linux run pending. |
| pipeline.desktop-app-support-is-unverified | 25 | 50 | Doc-contract clauses green; all four live points typed skips. |
| pipeline.disjoint-signed-hgo-actions-invalidate-one-another | UNKNOWN | 25 | Code repair committed but no counted GREEN evidence or pin. |
| pipeline.dispatch-record-log-stays-empty-despite-mandatory-phase-entries | 25 | 50 | Mechanical empty-log refusal implemented and pinned; measurement and fold-in parts and todos remain. |
| pipeline.dispatch-records-land-under-specs-evidence | 25 | 75 | Both proposal clauses covered by 15 green cases with RED mirrors. |
| pipeline.domain-scanner-findings-need-reproduction-before-remedy | UNKNOWN | 50 | 9 green seam cases pin AC-166 behaviour, but the original acceptance could not be mapped. |
| pipeline.elephant-main-context-spent-on-wake-ups-and-inline-reads | UNKNOWN | 25 | Commit adds measurement script; message states no tests and leaves real-data measurements open. Mapped to AC-168 requirement text, no GREEN evidence; backlog not read. |
| pipeline.every-dispatch-pays-a-bootstrap-receipt-detour | UNKNOWN | 50 | Template fix committed with pin 7 pass, but message keeps the fresh-dispatch first-write proof open. Backlog not read. |
| pipeline.existing-signing-key-reuse-deadlocks-onboarding | 25 | 50 | Key-pair mismatch fix committed with targeted cases passing; security review and consumer verification open. Backlog not read. |
| pipeline.git-for-windows-2-56-rejects-git-config-global-nul | UNKNOWN | 50 | Commit fixes the last two win32 NUL sites with GREEN source-scan test, but real-git spawn regression and host checks held. Backlog read. |
| pipeline.git-hook-runtime-snapshots-go-stale-after-plugin-changes | 25 | 50 | Staleness reporting committed with pin 5 pass/1 skip; code and targeted evidence exist but stale-admission clause unqualified. Backlog not read. |
| pipeline.goldfish-budgets-omit-the-closing-ceremony | 25 | 50 | Fix and pin committed with RED-to-GREEN producer case; consumer verification open. Backlog not read. |
| pipeline.goldfish-test-briefs-lack-targeted-and-quick-command-routes | 25 | 50 | Template pin 7 pass, commit labels AC-187 (partial), consumer coverage open. Backlog file does not exist; used AC-187 excerpt and matrix. |
| pipeline.greenfield-approval-policy-applies-after-intake-transition | 25 | 50 | GREEN 8/8 matrix on real driver, CLI and guard; historical-sequence and trust-anchor clauses uncovered. |
| pipeline.greenfield-machine-output-and-skill-budget | 25 | 50 | 11-pass budget pin with negative control; help-action clause not evidenced. |
| pipeline.handover-doc-committed-without-governance-classification | UNKNOWN | 25 | Acceptance maps to a pin, but no counts. |
| pipeline.host-crash-during-verify-leaves-a-descriptor-no-recovery-verb-can-clear | 25 | 50 | 6-pass pin for zero-authority archive and refusals; crash simulation and reachable route unproven. |
| pipeline.lifecycle-coordination-commands-refused-as-implementation-writes | 25 | 50 | 20-pass pin for scaffold admission; several clauses uncovered and three skips. |
| pipeline.merge-commit-message-skips-conventional-type-check | 75 | 50 | No backlog file; AC-211 points to portable-original-requirements.json; the commit says acceptance was reconstructed, so baseline 75 cannot be mapped. |
| pipeline.model-family-approval-with-automatic-version-upgrades | 25 | 50 | A1-A6, B1-B3, D1-D4, C1-C4 green; installed-host clause only a skip. |
| pipeline.onboarding-init-greenfield-matrix-is-serial-and-slow | UNKNOWN | 50 | 19 cells, cell-selective failure and real cell run pinned; wall-time skip. |
| pipeline.opus-critic-only-batched-for-architecture-and-security | 25 | 50 | Opus-rationale refusal committed and green; rules 2-3 and triage items open. |
| pipeline.parallel-work-in-one-checkout-is-unsafe | UNKNOWN | 50 | Code and 8 green cases for counter lock and batch-critic slice; coverage partial. |
| pipeline.passive-read-policy-admits-uncovered-credential-files-and-rg-follow | 75 | 50 | The first acceptance clause names /etc/shadow and is only a typed skip here; baseline 75 contradicted. |
| pipeline.pipeline-hooks-act-in-repositories-that-never-opted-in | UNKNOWN | 50 | Real hook entrypoints and scope predicate pinned for git fixtures; non-git skip. |
| pipeline.plan-submission-must-not-require-separate-po-approval | 25 | 50 | Central acceptance and negatives pinned; no counts and two clauses unmentioned. |
| pipeline.powershell-bypasses-onboarding-read-boundary | UNKNOWN | 50 | Maps to all four bullets; native and installed open, no counts. |
| pipeline.project-calibration-retains-new-project-placeholder | 75 | UNKNOWN | Pin that would support baseline 75 is absent on HEAD; baseline contradicted. |
| pipeline.push-classifier-does-not-model-powershell-backtick-escapes | 50 | 75 | 19/19 GREEN pin committed with the fix covers backtick escape and executed here-strings; rated 75 with lineage caveat. |
| pipeline.read-only-guard-admits-execution-and-output-options | 25 | 50 | fetch, git -C, git config escapes closed with 40 green; skips and lanes remain. |
| pipeline.readiness-input-omits-current-advisor-observation | UNKNOWN | 50 | 6 green; 3 clauses typed skips. |
| pipeline.revised-native-design-cannot-reach-a-new-advisor-course | UNKNOWN | 50 | Route retired; surviving observer 5 green; 2 skips. |
| pipeline.role-route-preflight-with-self-dispatch-fallback | 25 | 50 | Per-runner preflight and fallback pinned 9/9; point 2b held. |
| pipeline.scratch-has-no-retention-and-no-durability-check | UNKNOWN | 50 | Sweep, staging, WARN-only durability 12 green; skip and matrix held. |
| pipeline.scratch-must-remain-writable-across-lifecycle-states | 25 | 50 | All-state scratch matrix pinned; skips, counts and native sweeps hold 50. |
| pipeline.semgrep-console-coverage-note-has-no-test | UNKNOWN | 50 | Proposal maps fully; without counts not 75. |
| pipeline.session-readiness-drops-to-partial-after-bootstrap-ready | UNKNOWN | 50 | Routing and concurrency pinned; typed-reason and root-cause clauses uncovered. |
| pipeline.shell-grammar-file-is-a-kernel-path-without-capability-placement | UNKNOWN | 50 | Placement suite registered and pinned; fixture clause and counts missing. |
| pipeline.sign-intent-bare-openssl-spawn-searches-the-working-directory-on-windows | UNKNOWN | 50 | Absolute-path resolver committed; only baseline portable controls are green evidence. |
| pipeline.unasked-advisor-export-consent-in-fresh-seed | 25 | 50 | Declined seed, first-round question, binding and refusal pinned; guard-admission clause missing. |
| pipeline.windows-greenfield-scratch-write-denied | UNKNOWN | 50 | Guard fix and pins map the acceptance; cross-platform and fresh intake held. |
| pipeline.windows-os-temp-root-dacl-fails-private-state-assurance-for-test-fixtures | 25 | 50 | Assurance refusal and private root pinned; suite-wide effect unproven. |
| pipeline.windows-portable-seed-rolls-back-with-hidden-worktree-error | UNKNOWN | 50 | First two clauses mapped; driver, onboarding and installed observation held. |
| pipeline.windows-pre-push-installer-fsync-and-relative-action | UNKNOWN | 50 | Durable write, absolute argv, marker, real push block green; skip and smoke runs block 75. |
| pipeline.worktrees-share-onboarding-private-state-with-root-bound-intake | 25 | 50 | One of five clauses gets targeted evidence on code the baseline marked present. |
