# Sprint Alfred Epic — Acceptance criteria

Binding acceptance map: PRD §7 requirement → concrete evidence that
satisfies it. Every row names the artifact/suite that proves it; "evidence"
always means candidate-bound per Nova-spec §2.2 conventions. Member-issue
acceptance lists (#99, #101–#106, #109) apply at each issue's closure —
satisfied, or with deviations explicitly PO-accepted at that closure (PRD §7
criterion 2; the intake's argued deviations are the starting set). This file
adds the epic-level and incident-derived criteria and the fixture inventory
floor. Criterion ids are `AC-*` (epic) and `IR-*` (incident-derived) —
deliberately disjoint from the WP ids (`A1`–`A5`, `B1`–`B3`, `C1`–`C3`,
`D1`–`D4`, `E1`–`E3`), which the Evidence column references freely.

## A. Epic-level criteria

| # | Criterion | Evidence |
|---|---|---|
| AC-1 | Enforcement-conformance records exist for every supported runner used in the sprint, are green in Verify, and every shipped control's placement row is consistent with them | `pipeline.enforcement-conformance.v1` records; `control-placement` Verify check |
| AC-2 | No agent route mutates: a protected-baseline surface, approved PRD/Spec bytes during implementation, or closed-evidence bytes — per supported mutation route fixtures; residual gaps are typed rows, not silence | A3/A4/A5 fixture suites; A2 table `residualGaps[]` |
| AC-3 | Every sanctioned `pipeline-state.mjs` verb yields a state accepted by every readiness observer | `pipeline-state-observer-conformance.test.mjs` green |
| AC-4 | `submit-plan`/`approve-plan` refuse pre-authority staging paths with the typed reason | A4 entry-guard fixtures |
| AC-5 | Closed-evidence drift: detected as a diagnostic on active branches, fail-closed on inactive ones, and repairable via the two PO-gated verbs with audit trail | A5(i) fixtures incl. a replay of the 2026-08-27 incident shape |
| AC-6 | Threshold-dependent promotion has sufficient measured interruption/calibration evidence and explicit PO approval; actual window, coverage and limitations are recorded. No fixed 14-day wait applies (PO decision 2026-09-13); missing evidence or elapsed time alone cannot establish calibrated PASS | `interruption-baseline.json` + evidence-quality and promotion checks that read it |
| AC-7 | Rigor floor: same normalized inputs ⇒ same floor (pinned fixtures); unknown inputs never lower; actual-surface growth escalates/reauthorizes; report-only disagreement log exists before enforcement | B1 fixtures + disagreement log artifact |
| AC-8 | Greenfield resolves to `inherited-agent-first` and produces a machine-readable disposition before implementation authority; a PO custom profile is honored, measured, and never silently replaced | D2/D3 planning fixtures |
| AC-9 | This repository completes the D4 adoption flow end to end: typed state, priced staged proposal, one durable PO decision, evidence recorded | dogfood evidence set under `specs/sprint-alfred-epic/evidence/` |
| AC-10 | Model-judged evaluator output can never be `pass` (deterministic-pass rule) — attempted prompt-only compliance yields `finding`/`unknown` in fixtures | D3 fixture "prompt-only claimed compliance" |
| AC-11 | The eight B2 routes exist; each refusal message names its route; the B2-i authorization satisfies its four ⚖ constraints | B2 per-route fixtures |
| AC-12 | Rules-as-code sweep landed: GG-22 defined where cited; SendMessage relay rule homed; push-flow doc corrected; strip tool removes Triage and separately identified stale verdict/closure prose while preserving genuine later requirements | B3 doc-consistency suites + positive/negative strip fixtures |
| AC-13 | Every open `sprint: alfred` backlog item is closed with closure evidence or PO-visibly re-triaged; ledger reconciled; member issues closed with candidate-bound comments; sprint close comment written. The set is **28 as of 2026-08-28**: the 24 read in full by the design intake, minus the two moved to Nightwing at the design gate (PRD §9 decision 1), plus the six this design phase itself filed. The live set, not this number, is authoritative at close — re-count with `check-backlog-sprint-assignment.mjs` | backlog ledger + GitHub issue trail |
| AC-14 | Every wave's deliverables passed ≥1 independent Critic round (fresh context, paths-only dispatch); fail-then-fix cycles documented — and the same bar held for every design document of this epic before PO review (spec §12 design-phase review duty) | Critic evidence under `evidence/critic/` |
| AC-15 | Documentation acceptance per member issue against the exact accepted candidate | per-issue doc evidence links |
| AC-16 | Every host-layout onboarding test this sprint adds or touches asserts the success contract of §D; a rejection-only test appears solely for an explicitly unsupported layout. The affected-artifact set is **re-derived after the Nova rebase** (PO constraint, 2026-08-28) rather than carried from this clone base | §D review lens; A-track Critic evidence; the wave-0 post-rebase re-derivation note |
| AC-17 | **Disposition before authority:** no work package reaches implementation authority in a governed area whose architecture disposition is unresolved; an `adoption-deferred` decision satisfies this, an absent one does not | D4 adoption-state fixtures; planning-boundary evaluator run |
| AC-18 | **Map currency fails closed:** an accepted candidate never leaves its navigation map stale against contracts it touched; a checkpoint push instead records typed staleness debt, and the next planning boundary consumes that debt rather than discarding it | D3 class-7 fixtures (fresh/stale map); push-boundary debt fixture |
| AC-19 | **Decision parity across runners:** two fresh sessions on different supported runners resolve the same effective architecture constraints and active exceptions for the same governed area, or emit a typed divergence finding | D1 parity fixture (two-runner replay) |
| AC-20 | **Semantic conformance, not file presence:** the Critic review catches a token ADR that does not match its implementation | D1 token-ADR fixture (#99 §7) |
| AC-21 | **Anti-fragmentation:** a change that improves a metric by shredding topology into tiny modules is rejected rather than rewarded | #104 "misleading tiny-module optimization" fixture |
| AC-22 | **Active optimization exists at planning:** a finding at the planning boundary carries proposed conformant remedy options with their comparison, not only the violation | D2 remedy-comparison generator fixture |
| AC-23 | **AGENTS.md linkage:** a governed repository's AGENTS.md references the map bundle entry point, and the declared re-entry reading order resolves end to end from it | D2 estate fixture; re-entry walkthrough evidence |
| AC-24 | **Provider-free AGY dispatch seam:** a complete runner-neutral Goldfish packet reaches `invokeAgy` through one production caller with candidate/input/result isolation and a typed receipt. Fake executable cases prove success, malformed output, model mismatch, timeout and cancellation; a missing/mismatched repo-local plugin/pipeline-start marker refuses or remains unavailable. `agy plugins list`, a sandbox flag, and fixture success do not count as native guard or three-runner proof. | E3 Verify suite; `pipeline.cross-runner-dispatch-receipt.v1` fixture receipt; A1/A2/A3/A5 precondition readback |
| AC-25 | **Native Claude/Codex Host-Commit:** each direct runner route binds the exact prelaunch candidate and child/session/model identity to one validated structured final return; only its exact allowed diff is committed by the host with ordinary Git hooks, then commit readback, private local observation, and authored v4 publication occur in that order. Ambiguous or invalid returns do not gain authorship; a fresh clone without a separately approved signed export remains `UNVERIFIABLE`; no provider attestation is claimed. | Native Goldfish host state/return/finalizer/commit-execution Verify suites; authorship writer/verifier regressions; runner-hook contract readback |

### 2026-10-03 findings round (Spec §21)

| # | Criterion | Evidence |
|---|---|---|
| AC-26 | **Lifecycle-command admission:** every Pipeline-emitted `nextAction`/recovery/course command is admitted in each phase that emits it, under every supported path spelling; every command the design course emits up to `present-plan` is admitted with zero guard overrides; `scratch/` script execution stays fail-closed with a truthful denial that names the human route, while `scratch/` writes stay admitted; the course's declared evidence outputs are writable in the design phases that emit them; preflight and guard evaluate the same readiness intent | §21.1 R1-1…R1-9 fixtures (win32 + POSIX dialects) |
| AC-27 | **Read policy:** ordinary in-root reads (Read, Grep incl. directory/glob, Glob, `rg` flags, `git … \| head`) and exact WSL UNC files are admitted despite auxiliary-root failures; the shared credential-root list stays denied for host and distro paths in every spelling; refusal texts name the real cause | §21.2 R2-1…R2-5 fixtures, incl. case-mismatched session-root fixture |
| AC-28 | **Two-decision ceremonies:** per feature on the happy path (one feature, one design revision cycle, one push) the PO takes exactly two decisions per runner and mode, the final plan approval and the push approval, as defined in Spec §21.0; every additional push costs one more signed (or chat-confirmed) commit-bound approval; the only one-time acts are enrollment consent and key setup (first-use confirmation); every signature-mode push (checkpoint included) is signed and commit-bound in guard and pre-push hook; armed overrides survive unrelated working-tree changes; unborn HEAD signs | §21.3 R3-1…R3-7 fixtures; ceremony inventory test (scenarios A, B, C) |
| AC-29 | **Runner parity and platform parity:** role-route preflight (`native`, Advisor-only labelled `fallback-self-dispatch`, `unavailable`); a fallback result never satisfies readiness, Critic or plan-verifier, and fallback roles run read-only; Antigravity `feature` profile reaches readiness/Critic through host-observed children; native-Windows Pipeline subagents run under the budget lock; built-in agent types admitted but template-bound and budget-counted; runner-specific SessionStart hints; the Windows platform sweep covers K3-10…K3-15, the Windows Advisor fixture (K3-16), the trusted runner-CLI location (K3-17) and the readiness child typing and schema dialect (K5-12) | §21.4 R4-1…R4-10 fixtures + per-runner host evidence |
| AC-30 | **Design-course contract:** documented and emitted sequence agree; one design revision cycle needs no PO interaction on any runner; course-run mechanics (`--run-v2` routes, readiness runner argument, resumable preparation); one trailer grammar; `--answers-file`; language asked once; Verify contract fixed before presentation; briefing quality (verified paths, closed shell grammar, private-identifier check) | §21.5 R5-1…R5-8 fixtures |
| AC-31 | **Forensics/audit:** multi-runner multi-segment transcript reader, usage only where supplied; continuity digest drift surfaced; unclassified docs refused at commit; generated audit index; host user paths refused at pre-commit | §21.6 R6-1…R6-5 fixtures |
| AC-32 | **Three-runner end-to-end happy path on the stamped candidate.** The scenario (Spec §21.7) is a greenfield local project from onboarding through design, Advisor, one design revision cycle, independent readiness, final plan approval, implementation and the single feature-branch push. **Host matrix:** Claude on native Windows (Git Bash), Claude on Linux or WSL, Codex on Linux or WSL, Antigravity on its supported host. **Pass:** zero guard overrides, zero operator hotfixes, zero recovery ceremonies, exactly two per-feature PO decisions with one-time acts limited to enrollment consent and key setup, push completed and read back. A host without a run record is `not verified`. | Per-host run record and transcript export (R6 reader), ceremony inventory, candidate digest; PO-run host sessions |

### 2026-10-04 revision-4 additions (Spec §§18, 20, 21)

AC-35 and AC-36 extend AC-29 and AC-28; the cases they list are part of those
workstream suites.

| # | Criterion | Evidence |
|---|---|---|
| AC-33 | **Recovery availability:** V2 null owner is `unavailable` and V1 absent is `unobserved`; CAS-conflict classification, signed legacy custody and archival preserve bytes and grant no authority; State, `activeFeature`, proofs and history stay unchanged. The attended external route (pinned built-ins-only Node CLI, operator-selected artifact and public signer anchor, detached Ed25519 authorization, exact bounded code/test paths, preimage check, journaled per-file atomic prefix, exact post-image readback, forward-only crash recovery) refuses a wrong repository, wrong anchor, altered artifact, out-of-set path and preimage mismatch without mutation, resumes forward at every journal step, and returns typed unavailable naming the attended prerequisite for unknown owner, missing proof/key/trust, ambiguous bytes and unsupported host layout (never a dead end) | §20.3 RV-1…RV-11 fixtures (RV-8…RV-11: external route); candidate-bound host evidence |
| AC-34 | **Uninstall with a foreign Git hook:** refuses with `PU-FOREIGN-HOOK-CONFLICT` and instructions; the foreign hook, retained documents and Git history stay unchanged and ordinary Git still works | §18 case U-1 (win32 and POSIX dialects, consumer-layout repository) |
| AC-35 | **Model-family approval and role mechanism (extends AC-29):** per runner, the newest selectable release of an approved family is used; a hidden newest release falls back to the older selectable release and records it; a later older id is refused (watermark); activation is all-or-nothing and refused unless every available route is assigned; family switch, slot change, pin/unpin and floor change need a signed authority decision; activation passes on native Windows; a Compact or offline re-entry keeps the held model id. Critic and plan-verifier on Claude and Antigravity are `hook-observed-subagent` roles whose hook start/terminal records and read-only enforcement are measured per runner; unmeasured means `unavailable` | §21.4 R4-11, R4-12 fixtures + live A1-style measurement |
| AC-36 | **PO-decision ceremonies (extends AC-28):** the signing window starts at hand-over (default 60 minutes, 5–120, absolute expiry in the signed text); chat-mode confirmations are in-session, commit-bound and labelled; `standing-approved` checkpoint pushes stay admitted without a per-push approval while signature and chat modes need one per push; re-enrollment with retained history is exactly one one-time act (ceremony inventory scenario D) | §21.3 R3-1 (scenario D), R3-8, R3-9, R3-10 fixtures |

### 2026-10-06 revision-5 addition (Spec §22)

AC-37 is additional to AC-32. It does not change AC-32's host matrix or pass
condition, and a device-switch host run is extra evidence, not a substitute.

| # | Criterion | Evidence |
|---|---|---|
| AC-37 | **Agent-recoverable operation and device portability (PO decisions 2026-10-06 #17–#19 and 2026-10-07 #20–#27):** every device-switch row T1–T20 is owned exactly once (15 by R7, 5 mapped to R1/R3/R4/R5; 20 in total) and each R7 contract names a typed agent-executable repair or a typed attended prerequisite. Git child processes use the `/dev/null` constant and a Git discovery failure carries its cause and a read-only probe; the pre-ready session has a closed read-only diagnostic set; every Pipeline-prescribed preparation script (the Critic-input strip script, the Goldfish commit-command producer) is catalogue-admitted in every lifecycle state, `draft` included (T18, R1-1, R7-9c); zero-authority orphan session descriptors of a positively `not-live` or recorded `ended` owner are archived by a typed action without inference of owner death (§20 unchanged), while descriptors of `unavailable` or `unobserved` owners keep the shipped attended orphan-archive route (one confirmation with `--by`, no signature; a recovery act outside the §21.0 happy-path count, not a signature class; decision #24); digest-bound artifacts are tracked, refused up front when ignored, untracked or modified, and listed by handover and close; backlog and documentation writes stay admitted in every lifecycle state and the writer-produced state file is committable; an approval verifies on another device without a signature when its digests and bound set are unchanged, and is never regenerated when a bound artifact is lost, and a re-approval after a lost bound artifact reuses no earlier course or readiness evidence (decided, fail closed; decision #25); the key directory is one machine-wide setting, and a read-only signing-readiness probe (it resolves `openssl` the way the signing terminal will, runs an Ed25519 sign and verify round trip with a throwaway key, and checks that the key directory resolves and that its public key digest matches the committed trust anchor, with no read of private key material) runs at install, update and bootstrap (reported, not gating), before `prepare-for-signature` hands over a command (a failing probe hands over none) and in the PO's signing terminal as a read-only readiness-check command handed over BEFORE the signing command, which is handed over only after that check has passed in the same terminal (decision #21; `sign-intent` keeps its own pre-prompt probe as defence in depth and is never where a missing `openssl` is first found), and returns a typed result with the concrete repair the PO applies in their own terminal, while the Pipeline never selects, configures, pins, stores a path for or spawns by a Pipeline-chosen path any signing executable, `sign-intent` spawning `openssl` from the PATH of the PO's own signing terminal, with both spawns run from an explicit working directory outside every repository and, on win32, with `NoDefaultCurrentDirectoryInExePath` set, so that no decoy executable placed in the repository or in the working directory is ever started (R7-6e dynamic case; the hand-over text tells the PO to sign from a neutral directory) (decision #18's "resolved by the Pipeline itself" is delivered as detection and a typed repair, decided by the PO as #20, §22.6); a stale authoring registration is superseded by a catalogue-admitted verb with zero overrides and zero signatures, without inference of owner death, only on positive facts and with zero authority bound to it: branch (A), a registration of an earlier revision of the same lineage with different digests, needs its owner positively `not-live` or recorded `ended` (narrowed to decisions #22/#23 by the PO on 2026-10-07; a `live` owner is never superseded); branch (B), a registration of the same lineage at the current or an earlier revision, needs its owner positively `not-live` or recorded `ended`, or, with the same digests, an `unobserved` owner (decision #22); branch (C), a registration of another lineage or of a later revision, needs its owner positively `not-live` or recorded `ended` (decision #23); every other registration (a `live` owner, an `unavailable` owner, an `unobserved` owner outside the same-digest clause, including one of an earlier revision with different digests, or held authority) is refused with a typed attended prerequisite naming its route (waiting for the owner's terminal record, or the §20.2 signed legacy-custody transaction), and a later integration of a superseded registration fails closed with a typed `superseded` result and preserved bytes (§22.10); parallel dispatch is supported: concurrent tool calls of one subagent wait with bounded backoff for the dispatch-budget counter lock and are counted exactly once, a lock held beyond the bound is refused with a typed `counter-lock-timeout` naming the holder's age, parallel dispatches of different agents never share a lock, and a subagent's bootstrap receipt is recorded at SubagentStart so no preflight spelling matters (decision #26, T19 and T20, §22.11 R7-11); one environment readiness report with a typed repair per finding runs at install, bootstrap and before a ceremony; Bash and PowerShell lanes give the same denial and recovery; the device-switch walk (fresh clone of an approved fixture) needs zero PO terminal commands, zero overrides and zero signatures. Signatures appear only in the five classes enumerated in §22.0 | §22 R7-1a…R7-11e fixtures (win32 + POSIX dialects, source checkout and consumer-layout repository), including the R7-9a device-switch walk, the R7-9b static check, the R7-9c T18 replay and the R7-11 parallel-dispatch cases |

## B. Incident-derived regression criteria (live-measured classes)

| # | Criterion | Evidence |
|---|---|---|
| IR-1 | A post-close write to a bound Result is refused (agent routes) and detected (any route) at next state read — not at the next lifecycle transition weeks later | A3 dynamic-class + A5(i) fixtures |
| IR-2 | A `discard-feature` on a repo with active continuity and null Result completes into a `ready` session with no human shell step | A5(ii) end-to-end fixture |
| IR-3 | The four seed interruption classes (per-class dates and provenance: `design/issue-intake.md` #103) emit correct receipts when reproduced | C1 seed fixtures |
| IR-4 | A bounded read-only interpreter probe that merely mentions a protected path is admitted without a signature demand; an opaque write with an unresolved protected target remains a typed denial | B2-iii direct-admission and fail-closed negative fixtures |

## C. Fixture inventory floor

The union of: #101's 8 named fixture classes; #102's 8; #103's classification
determinism + lineage + privacy set; #104's 10; #105's 14; #106's 21; #109's
7 + dogfood; A1's probe classification set; A5's observer-conformance
enumeration; B2's per-route sets; C1's four seeds. `verify-suite-registration`
entries for each carry `invariantPinned` (C2 consolidation rule) — a fixture
that cannot name its invariant does not register.

E3 contributes successful bound dispatch, malformed output, observed-model
mismatch, timeout, cancellation, missing/mismatched start marker, and result
collision/traversal fixtures. They inject a fake executable and assert zero
provider/authentication calls. The later live-pilot evidence is not part of
this inventory and cannot be substituted for it.

## D. Review-lens rule (PO-accepted 2026-08-28 — PRD §9 decision 2)

`managed-onboarding-success-contract` is accepted into Alfred as a rule, not
as a work package: every host-layout onboarding test added or touched by this
sprint asserts the end-to-end success contract (inspect/plan/apply/readback,
exact allowed write set, host-control preservation); rejection-only tests are
acceptable solely for explicitly unsupported layouts. Applied as a Critic
review lens on A-track diffs touching onboarding tests, and bound as AC-16.

Two properties of this rule are deliberate and must survive later editing:

- **The target set is provisional until the Nova rebase.** The PO's
  acceptance carries the constraint that the onboarding surface changed in
  the Nova line, so the item's own affected-artifact list
  (`project-onboarding-v3.test.mjs`, `project-onboarding-e2e.test.mjs`, the
  onboarding acceptance guidance) is re-derived in wave 0 against the
  post-rebase base. A rule applied to a file list inherited from this clone
  base would silently miss whatever Nova moved.
- **The item's own `sprint:` field stays undeclared, by mechanism, not by
  oversight.** Ledger event 41's rescoped byte-pin binds that item's
  pre-Triage bytes; adding `sprint: alfred` there fails the backlog gate
  (`item-hash-rescope-amendment itemSha256 does not bind the current item's
  pre-Triage bytes`), measured live on 2026-08-28. The item therefore stays
  `status: deferred` and outside AC-13's closure set; this section is where
  its Alfred membership is recorded.
