# Project state — Agent-Pipeline

Current runner-neutral handover ([calibration](../project/pipeline.json)) and
open/next authority. [Previous state](../specs/sprint-alfred-epic/plans/state-archive-before-pc-transfer-2026-10-25.md)
is historical (superseded goals and counts).

## Archived history

| Date range | Summary | Archive |
|---|---|---|
| 2026-11-15 | Matrix status history 2026-10-26 to 2026-11-01: amendment-by-amendment stage movements, candidate stamps and held-bundle status of the 0.7.0 matrix before candidate 15c; superseded by the current matrix document and candidates 15c to 29e. | [docs/state-archive/2026-11-15--matrix-status-history.md](state-archive/2026-11-15--matrix-status-history.md) |
| 2026-11-08 | 2026-10-25 transfer-era qualification snapshot (AC168, G24/R3/G27, G9a, Critic preparation, Phoenix entry, Verify checkout, READY guard, dispatch helper); superseded by candidates 13 to 20b. | [docs/state-archive/2026-11-08--committed-source-and-actual-qualification.md](state-archive/2026-11-08--committed-source-and-actual-qualification.md) |
| 2026-11-02 | WSL PC autonomous round 2026-10-26: held kernel patches for sitting C29 committed, Q22 dispatch lock blocker resolved under D159, report 05 triaged, decisions D160-D162 taken; closed history, superseded by candidates 13 to 17. | [docs/state-archive/2026-11-02--wsl-pc-autonomous-round-2026-10-26-po-away.md](state-archive/2026-11-02--wsl-pc-autonomous-round-2026-10-26-po-away.md) |
| 2026-10-26 | WSL PC re-entry 2026-10-26: two metadata-only commits from the original machine (64dbc35d0, 6f089c41b) to merge normally, never reset; P1 item push-approval-record-always-trails-the-signed-commit (AC-37) documented not fixed; one-time operator push exception not approved; chat:member-source-drift cleared by the sanctioned move-aside after PO confirmed workers stopped. | [docs/state-archive/2026-10-31--off-machine-follow-up-wsl-pc-re-entry-2026-10-26.md](state-archive/2026-10-31--off-machine-follow-up-wsl-pc-re-entry-2026-10-26.md) |

## Active goal and matrix

**START HERE (2026-11-15): candidate 29e applied (`b70f5e337`), stamped (`15ae7796c`), installed (readback `72fc6db`).** Results: [29e handover](../specs/sprint-alfred-epic/evidence/held-patches/c29e-wip-handover/README.md). **PO 2026-11-16:** the open content items of candidate 30 are built now (C30-6 design review as one full round plus two diff rounds, then C30-1, C30-5; C30-2 stays out); the aborted Full Verify of 29e is not rerun first; the design-review cap reverses part of ADR-0085 amendment D246 and needs a new amendment. Candidate 30 queue (C30-1 onboarding consent text, C30-2 private names and paths out of the repo, C30-4 greenfield toil, C30-5 automatic cleanup of test and Verify folders, C30-6 design-review round cap): [plan](../specs/sprint-alfred-epic/plans/candidate-30-queue-2026-11-15.md). **Build 2026-11-16: C30-6, C30-1 and C30-5 implementation complete as a held chain (`evidence/held-patches/candidate30/apply-candidate30.mjs`, rehearsed clean); the PO applies, the stamp and install follow on the PO's word.** **PO 2026-11-16: the Critic is suspended permanently (no Critic round for candidates unless the PO asks); Full Verify runs only after the install.** **Full Verify of the stamped candidate 30 ran 2026-11-16 (`fv30`): 1229 steps, 15 red; 12 green alone (load), 3 red before candidate 30 too** (license headers of two plugin files, two stale gitleaks ignore lines, `architecture-public-greenfield-route` JSON parse), findings and fixes in the queue under C30-3. Open: those three fixes (held patch), native proof, acceptance; Critic not run (suspended).
**Candidate 15c installed 2026-11-01** (29 patches `e4966002f`-`9618f9b4b`, stamp `c7c95b905`). Open: Full Verify, Critic, native, D231 slice 2, acceptance.
**Candidates 17 and 18**: moved verbatim to [candidate 18 delivered](../specs/sprint-alfred-epic/plans/candidate-18-delivered-2026-11-02.md).
**Candidates 21f and 21g installed 2026-11-09** (stamps `18fcaf244`, `3f5c51843`; 21e2 travels with them). 21f: first Codex report findings, and a coordinator-bound `close-feature` may run in a catalogue project (extends PF-54 / D51 (1) to that entry, chosen without a tile because the Claude greenfield was blocked; the PO applied it). 21g removes a 21f regression at the commit boundary. Full Verify, Critic, greenfields, native Windows proof and PO acceptance pending. PO tile decisions 2026-11-09: [Codex report item](../backlog/items/2026-11-09-codex-greenfield-report-findings.md), "Scope decided by the PO"; Codex second Critic role `critic-high-risk`; rewind plus hardening; 21b relaxations stay; Live-Critic after the happy path on all three runners. Close findings: [item](../backlog/items/2026-11-09-close-feature-refused-in-a-catalogue-project.md).
**Candidate 22 installed 2026-11-09** (40 patches, stamp `ef16e1b86`); 22b installed (stamp `b92ff8a46`). No 22c: live findings and the three reports go into 23. Full Verify, Critic, native Windows proof, acceptance pending. [Open follow-ups](../backlog/items/2026-11-09-candidate-22-open-follow-ups.md).
**[ADR-0089](adr/0089-project-routing-is-user-owned.md) accepted 2026-11-10 (PO tile, D234):** a project's `pipeline.user.yaml` owns its model and effort routing. Built in candidate 23; a live dispatch on a changed route is still unobserved.
**[ADR-0090](adr/0090-evidence-follows-every-push-and-a-release-includes-its-push.md) accepted 2026-11-10 (PO tiles, D237 to D239):** the close exports the Critic reports, one follow-up commit carries the proof and the final records after any signed push, and a release includes its push. Built in candidate 27; never run on a real repository or a real signature.
**[ADR-0091](adr/0091-the-software-bill-of-materials-is-part-of-every-feature-close.md) accepted 2026-11-11 (PO tiles, D240):** the feature close checks or writes the SBOM (CycloneDX 1.6 and SPDX 2.3 from pinned lockfiles, or an explicit `not-applicable`) and the audit bundle carries it; `stale`, `invalid`, `partial` and `unsupported` stop the close unless the PO's signed override for exactly those findings is recorded. Built in candidate 28c for npm, Python, Go and Rust; the amendment of 2026-11-12 (PO tiles) adds the other common lockfiles and Maven by pom plus CycloneDX in candidate 28d. Never run on a real repository. Candidate 28e corrects the readers after the Advisor review and adds `packages.config` (PO tile 2026-11-12, D243).
**[ADR-0092](adr/0092-the-tools-the-pipeline-needs-are-one-registry-asked-for-at-onboarding.md) accepted 2026-11-12 (PO tiles, D241):** one tool registry feeds `docs/toolchain.md`, the preflight floors and the readiness findings; required on every machine: Node.js, Git, gitleaks, osv-scanner, semgrep (Trivy only with infrastructure files, with its adapter), OpenSSL where the PO signs; onboarding asks for a missing one, the person installs it or defers it, the deferral is recorded on the machine and lifts no check. Built in candidate 28e, never run in a real onboarding. **[ADR-0093](adr/0093-a-semgrep-finding-blocks-only-when-the-feature-introduced-it.md) accepted 2026-11-12 (PO tile, D242):** a Semgrep finding at a blocking severity blocks only when the feature introduced it (a second `--baseline-commit` pass against the start of the active or last closed feature's range, in its own worktree); older findings are listed, not blocking; any doubt falls back to blocking everything, labelled. Built in candidate 28e, never run on a consumer repository. **[ADR-0094](adr/0094-the-semgrep-default-pack-blocks-the-severe-classes-in-eight-languages.md) accepted 2026-11-12 (PO tile, D244):** the offline Semgrep default pack gains 61 `pipeline-<language>-<class>` rules for Java, C#, Python, Go, JavaScript/TypeScript, Kotlin, PHP and Ruby; SQL and command injection, insecure deserialization, disabled TLS verification, XXE, path traversal and SSRF are ERROR and block, weak cryptography is WARNING; test-shaped paths are excluded, each rule has a firing and a quiet fixture. Built in candidate 28e; the false-positive rate on real Java/.NET code is unmeasured. **[ADR-0095](adr/0095-a-spec-correction-during-implementation-is-a-signed-addendum.md) accepted 2026-11-13 (PO tiles, D245):** a Spec correction found by a Critic round during implementation is a separate file `specs/<feature>/spec-addendum-<NN>.md` whose header binds the approved Spec digest, the Critic packet and its findings; the Spec stays byte-identical, the criterion set may not change (that stays the PO's `reopen-design`); the PO approves each addendum in the `gates.human_approval` mode, the approval is committed evidence, the next Critic round is a delta round over it, and the Goldfish briefing, the close and the audit bundle read it. Built in candidate 28e, never run on a consumer repository.
**[ADR-0085 amendment](adr/0085-one-review-one-signature-design-approval.md#amendment-2026-11-13-delta-rounds-until-pass-no-signature-over-an-open-review-d246) accepted 2026-11-13 (PO tiles, D246, Claude test run 3 finding L3):** design review delta rounds continue until a round passes (no round cap; 64 is only the structural chain bound), and `present-plan` refuses while the latest receipt leaves findings open (`PLAN-DESIGN-REVIEW-OPEN`); an approval already signed over open findings keeps verifying, and drift after any passing delta round stays a knowingly signed `unreviewedSourceDelta`. Built in candidate 29c; the host-observed reviewer model of the same tile is a separate slice.
**[ADR-0085 amendment](adr/0085-one-review-one-signature-design-approval.md#amendment-2026-11-13-the-reviewer-model-is-host-observed-where-a-route-exists-d247) accepted 2026-11-13 (PO tiles, D247, L3 part 3):** the design review receipt's reviewer model is host-observed where a route exists, labelled elsewhere: on Claude the plugin hooks record each `readiness-reviewer` dispatch (foreground resolved model, background child transcript, read by the hook and never into the agent's context), `export-report` writes the returned text as the report and `create` stamps `reviewerObservation`; Codex and Antigravity receipts say `unobserved` visibly. `present-plan` refuses an unobserved Claude round (`PLAN-DESIGN-REVIEW-UNOBSERVED`); fallback receipts pass; binding bytes unchanged. Built in candidate 29c.
**[ADR-0096](adr/0096-a-gate-definition-change-needs-a-bound-proof-at-commit-and-at-close.md) accepted 2026-11-13 (PO tiles, D248, Claude test run 3 finding L4):** `architecture/boundary-policy.json` (GS-16) and `architecture/fitness-model.json` (GS-17) join the gate-strength table (first creation free, re-materialization through the writer's own commit capability); the close walks every change of the gate-definition set in the feature range and derives a proof (first appearance, committed materialization, configure-verify labelled "confirmed via runner prompt, not signed", a consumed override), refuses an unproven one with no cut-off (`CLOSE-GATE-CHANGE-UNPROVEN`), and offers one PO acknowledgement of the unproven list per range as the repair; inspect lists the gaps early, and the bundle and the Critic input carry every change with its proof. Built in candidate 29c, never run on a consumer repository.
**[ADR-0097](adr/0097-a-pre-existing-red-check-is-repaired-by-a-maintenance-dispatch.md) accepted 2026-11-13 (PO tiles, D249, consumer finding K-28):** a red check that no criterion of the approved Spec covers is repaired by a maintenance dispatch: the item binding names `maintenance` instead of a criterion, exactly one check (the red one), a write scope of test- or tooling-shaped dependencies of that check outside every gate-strength path and the approved PRD/Spec; the host requires a red observation of the check on the real checkout at the dispatch candidate and proof that it was red before the feature (a red Verify receipt at or before the plan-approval commit, otherwise one signed PO acknowledgement `acknowledge-maintenance-red-check`, labelled; the PO chose both routes); the check must be green after delivery; the Critic packet names maintenance slices as their own kind. Built in candidate 29c, never run on a consumer repository.
**[ADR-0098](adr/0098-design-checks-and-the-unpublished-review-original-have-fixed-locations.md) accepted 2026-11-13 (PO tile "fixed locations", D250, consumer findings G3/G4):** `node tools/checks/<name>.mjs|.cjs|.js [args]` is no opaque script run in any lifecycle state when the file sits directly in `tools/checks/`, no path part is a link, git tracks it and it is unchanged against HEAD (in draft the agent cannot write there, so it is reviewed project content); the unpublished original of a sanitized design review report lives under the git-ignored `evidence/` (`--original-report evidence/<name>.md`), `scratch/` stays refused. Built in candidate 29d, never run on a consumer repository.
**[ADR-0099](adr/0099-an-antigravity-branch-result-lands-with-the-childs-own-commits.md) accepted 2026-11-13 (PO tile "R5: build a harvest command", D251, Antigravity test run 3):** `agy-native-integrate.mjs apply --keep-authorship <dispatch id>` lands an Antigravity `Workspace: "branch"` child's own commits unchanged by `git merge --ff-only`, only when the branch was cut from the current HEAD and every commit carries exactly one `Dispatch: <id> (goldfish)` trailer (same id) and `AI-Assisted: true`; otherwise the patch route stays. The dispatch record is still written by the attested writer over exactly those commits and says `orchestrator-attested`; binding the host's per-child descriptor is not built (open PO question). Built in candidate 29d, never run in a real Antigravity session.
**[ADR-0100](adr/0100-configure-verify-may-replace-the-verify-command-with-one-signature.md) accepted 2026-11-13 (PO tile 3 after the 28d test round, "configure-verify replaces, 1 signature", D252, finding C6):** `configure-verify --verify-command <new> --replace --by <label>` replaces a configured verify command during implementation: the new command runs once on a tree with no tracked change and must pass and leave the tree unchanged (private test-run receipt); one critical-action approval of kind `replace-verify-command` (signature, or chat-attributed and labelled in chat mode) covers both calibration mirrors' exact post-images; the Pipeline writes them through the existing configure-verify commit transition with a `replacement` member; the close counts the change as proof kind `verify-replacement` (unlabelled when signed); a maintenance slice's green receipt counts only under the base commit's verify command (amends ADR-0096 Decision 3 and ADR-0097 Decision 4). The GS-10/GS-11 refusal names the route instead of two overrides. Built in candidate 29d, never run on a consumer repository.
**[ADR-0101](adr/0101-the-stage-0-fast-path-admits-small-changes-with-tests-at-any-rigor.md) accepted 2026-11-14 (PO tile G-T1 round 3, "Medium + tests", D253):** the stage-0 fast path admits an Elephant change at any rigor with at most 3 files, at most 60 changed lines, one concern and at most 25 lines of production logic; tests and pins may change, except a test that checks the Elephant's own new logic from the same change; no new public API, schema, dependency or security surface; affected tests green, trailer `Dispatch: stage-0 (elephant)`, no extra Critic; above that a Goldfish. "Tier-0" is retired. The provenance check enforces 3/60 and the 25-line code cap; the guard maintenance window keeps refusing test files. Built in candidate 29e.

**[ADR-0102](adr/0102-the-main-session-is-reminded-to-work-in-parallel.md) accepted 2026-11-14 (PO tile "idea one", D254):** the main session gets one short parallel-by-default line, with its limits, from three existing hooks: setup-check at session start when it has nothing else to say, the post-compact re-grounding, and the dispatch budget guard on every N-th main-session tool call as context only, never a permission decision. `session.parallel_reminder_every` in pipeline.user.yaml sets N (0..1000, 0 = off, default 25). Claude Code only at all three points; not runner-neutral. Built in candidate 29e.

**[ADR-0103](adr/0103-the-close-scans-infrastructure-files-with-trivy-and-blocks-only-new-findings.md) accepted 2026-11-14 (PO tiles 28d 4/5, 29d T8b, 29e, D255):** the close scan runs Trivy (`trivy config`, offline built-in rules, neutral config/ignore file/environment, no telemetry or update check) as a fifth, default-enabled scanner for `cap.iac` wherever the tracked files hold a Dockerfile/Containerfile, a Terraform file or a Kubernetes manifest; elsewhere it reads not applicable and spawns nothing. It fails closed on a stray error line or an unscanned trigger file. A finding blocks only when the feature added it: the feature's base commit is scanned in a temporary worktree and a finding with the same rule and path there is listed, not blocking; without a base every blocking-severity finding blocks. Inline `trivy:ignore` comments are listed, never applied as a block. The registry class `required-with-infrastructure` makes the toolchain preflight and the onboarding consent ask for Trivy only in such projects; no start-time readiness finding. Built rules beyond the tiles (List/Kustomization/template files are no triggers, tracked files only, telemetry off) are marked in the ADR. Built in candidate 29e, not yet run on a consumer repository.
Candidate 18/19 verification (Full Verify 5 and 6): moved verbatim to the [candidate 19 plan](../specs/sprint-alfred-epic/plans/candidate-19-plan-2026-11-02.md) end.
**Candidate 20** (all greenfield blocker/major findings, clone w252) applied and stamped 2026-11-07; Full Verify fv20 26 red; Critic, macOS, agy M4c and PO acceptance pending. Detail: [candidate 19 plan](../specs/sprint-alfred-epic/plans/candidate-19-plan-2026-11-02.md) (candidate 20 section).
**Candidate 20b** (26 held patches, `held-patches/c20b-chain/`, G20-46..59 and the fv20 reds) applied (e9864cb29), stamped (5d863287a) and installed 2026-11-08.
**Candidate 20c** (G20-60/61/62/64, `c20c-chain/`) applied, stamped (`9443438b0`) and installed 2026-11-08; `rebind-approval` verified without a signature. Codex 0.167.0 runs no PreToolUse hook for `spawn_agent` (G20-63).
**Candidate 20d applied 2026-11-08** (`b3cc480a5`, 12 patches from `held-patches/c20d-chain/`): G20-66 writers arm their commit, P3 one-shot close with signed proofs in `audit-bundles/`, G20-63 Codex prepare, G20-65 docs-only check, G20-45 consent scope, G20-67 missing read is a probe. G20-68: real blockers were hook refusals (G20-49). **PC switch (PO tiles):** 20d travels stamped on the feature branch (push signed by the PO); the other machine builds 20e first from `held-patches/c20e-handover/` (README: part 1 chain G20-70/73/75 rehearsed clean, packages w277 G20-69+71, w281 G20-72 split, w282 audit push proof, w283 G20-76 the signature wait counts only the expected subject; G20-74 watched, not built). **20e with Full Verify follow-up applied and stamped 2026-11-08** (`b2acff5b7`); 20j installed; 21 (`c21-chain/`) stamped `80eacca09`, installed. Full Verify, Critic, greenfields on all runners, PO acceptance pending.
Details, decisions and gates: [candidate 18 delivered](../specs/sprint-alfred-epic/plans/candidate-18-delivered-2026-11-02.md); [candidate 19 seed](../specs/sprint-alfred-epic/plans/candidate-19-seed-2026-11-02.md). Current matrix: [delivery-status-current](../specs/sprint-alfred-epic/evidence/delivery-status-current.md).

## Portable unfinished work and next order

[Portable package and replay instructions](../specs/sprint-alfred-epic/evidence/pc-runner-transfer-2026-10-25/README.md)
preserve188 artifacts, exact postimages, patches, captures, dependencies and
full briefings. Seven groups are inert. Do not apply partial patches to Main.

The subsequent rigorous portability audit additionally preserves
[525 briefing/spec/context/launcher inputs](../specs/sprint-alfred-epic/evidence/pc-transfer-briefing-history-2026-10-25/README.md)
and closes [three Scratch-only matrix capture dependencies](../specs/sprint-alfred-epic/evidence/pc-transfer-dependency-closure-2026-10-25/README.md).
The new immutable matrix snapshot changes seven locators, no stages.
Historical `source` paths inside custody/old logs are provenance, not files
the next runtime must find locally; use each recorded tracked transport.
The [detailed portability audit](../specs/sprint-alfred-epic/evidence/pc-transfer-portability-audit-2026-10-25/README.md)
covers the Evidence tree, all354 local repository roots, archival link limits
and exclusions. [Workspace inventory](../specs/sprint-alfred-epic/evidence/pc-transfer-workspace-inventory-2026-10-25/README.md)
preserves public deltas and postimages separately from qualified Main Source.
No current continuation requires the original special worktrees or clones.
Use new inert candidates restored from tracked transports; never blindly
merge an old rehearsal or rejected overlay.

1. Re-enter through AGENTS.md, architecture map, touched concepts, compiled
   decisions and the new runtime's own pipeline-start. Last actual Codex
   readback here was `0.7.0+codex.20261025134513.977dad8`, content identity
   `1d11178192a9c68453084d1ae05f4863bf05ebd9e4608e1f52e8c0b926e26dfe`;
   onboarding readback-current, continuity valid, CAS-READY. Optional model-role
   bootstrap unavailable. Committed Source is newer than this installed build.
   No new stamp or borrowed runtime readiness follows from this transfer.
2. Resume G8/finalizer together in new inert candidates. G8 has17owned files,
   active design9/14; full Model loaded35/pass33/todo2, one later test separately
   green. Exact pre-edit loaded test SHA is unavailable. Finalizer has3owned
   files,15pass/10positive RED. Its static adapter→Codex-host import creates
   an ESM cycle. A full lazy-reader continuation briefing is preserved but
   never dispatched. Retain exact prelaunch packet/claim binding and live
   original Source context; never reconstruct handles from caller JSON.
3. AGY original return remains open. D154/D156 each authorized one native
   experiment, each executed once. v2 observed one PreTool invocation, two
   stream updates of that same step, empty children and no PostTool. The
   second state is an unknown hashed transition, not DONE. Parent SUCCESS
   is not child settlement. The PO manual probe showed a carrier refusal
   before execution. Next test needs a valid generated Goldfish/Critic carrier.
   No third external model call is authorized by these approvals.
   [Sanitized observation](../specs/sprint-alfred-epic/evidence/pc-runner-transfer-2026-10-25/agy-manual-carrier-observation.md).
4. Original controller:full216 baseline201pass/15fail; calibration five focused
   cases now green, two private-Critic binding cases remain RED. Settle focused
   qualification before a full rerun. G9b hook-cwd2/2 green but original pin31/34,
   three receipt/readback failures open.
5. G33 prevention is committed; safe recovery of damaged State is in progress
   as a held patch (bounded fifth continuity repair; provenance must be in the
   State itself; see the WSL round above). Preserve all23 below75 rows, including
   behavioral oracle, architecture scope before signing, Critic recovery,
   lifecycle and native/provider outcomes. Scope next fanouts from row evidence;
   no silent deferral to0.7.1.

## Authority and isolation

[D143–D157](../specs/sprint-alfred-epic/plans/po-decisions-2026-10-25-fix-wave.md)
record PO decisions. Method-only workers and checked integration are authorized;
no native model/dispatch/budget attestation follows. PRD/Spec are unchanged.
Public tests use unique owned `/tmp` children; private synthetic tests require
the separately Source-validated private parent. Recreate prerequisites on the
new host through the appropriate operator route.

Live handles, signing keys, real stores and private cleanup pointers are not
portable. Unknown-live AGY/G8 fixtures remain on the original machine; do not
delete without settlement and ownership evidence. Earlier account-namespace
test effects remain unknown:historical metadata audit220unattributed entries,
contentRead=false,cleanupPermission=false. Do not inspect keys/anchors or claim
clean Git proves private-profile cleanup. Live-edit/overlap captures remain
excluded as passes.

Feature remains active in implementation. Push preparation follows after all
handover writes are committed; no new candidate-bound signature is claimed
here. Read actual local/remote Git OIDs on the next machine rather than
inferring a completed transfer from this plan.

Retained Sentinel Epic authority (`governance/spec-retention.json`, archive
`docs/spec-archive/2026-07-20-sentinel-recovery/`):
[PRD](../specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md),
[Spec](../specs/2026-07-19-sprint-sentinel-epic/spec.md),
[acceptance matrix](../specs/2026-07-19-sprint-sentinel-epic/backlog-acceptance-matrix.md),
[reconciliation design](../specs/2026-07-19-sprint-sentinel-epic/public-private-reconciliation-design.md),
[recovery](../specs/2026-07-19-sprint-sentinel-epic/RECOVERY.md),
[platform support](../specs/2026-07-19-sprint-sentinel-epic/platform-support-contract.md),
[Windows blockers](../specs/2026-07-19-sprint-sentinel-epic/windows-blockers-scope.md).
