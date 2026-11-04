# Candidate 19 plan (opened 2026-11-02, after the Full Verify 5 of candidate 18)

Status: working list, ordered by what can start without the PO. The topics and their reasons are in `candidate-19-seed-2026-11-02.md`; this file tracks the work. Candidate 18 is closed on the Elephant side (Full Verify 5: 4 red, all open by design, no real finding). The PO runs the greenfield tests of candidate 18 in parallel; their findings are added here as they arrive.

Method: the held-patch route of candidate 18 (clone slices under `scratch/`, `wNN-*.patch` + notes + check test, one PO apply script `po-apply-0.7-candidate19.sh`, derived-files refresh as the last step of that script, stamp after the apply). Numbering continues at w115. Elephant builds small items directly (PO exception, valid for candidate 18 only; for 19 the rule is re-confirmed or dispatch via the pipeline Goldfish agents).

## A. Can start now (no PO decision needed)

| ID | Item | Source | State |
|---|---|---|---|
| A1 | Case-completion tools `run-cc` / `cc-sync` in `scripts/clone-slice/` + `docs/operating-tools.md` entry | seed, Full Verify observations | done, `6e93f0350` (no derived-files refresh yet, see end note) |
| A2 | A suite that declares more case ids than its effective policy must fail in a normal run, not only in the Full Verify. Design question first: the declared ids exist only at run time (`registerTestCaseCompletion` cases), so a static registry check cannot see them; options are (a) `registerTestCaseCompletion` compares its ids with the effective policy when no descriptor is announced, (b) a light registry check that runs each required suite's declaration step, (c) a post-run check in `verify.mjs` | seed | built as the pre-stamp tool `scripts/clone-slice/cc-changed.mjs` (`8a8982ac2`): maps the changed test files to their Verify suites, runs `run-cc` for each, lists unregistered test files. Option (a)/(c) (a check in the normal run) stays open |
| A3 | Make `g23-read-help-tests` (case G23C001, `ls -lh ../`) and `agy-item-delivery-tests` independent of the clone location (green below the home directory), or skip with a stated reason | open-by-design reds of 18 | held as w115 (causes measured: agy fixtures five levels up = home / unwritable `/home`; g23 relied on credential-named files in the repository's scratch folder). Green in two clone locations; Full Verify run open |
| A4 | Full Verify keeps bounded logs of red suites in the run record | seed | held as w119 (`logs/<id>.red-excerpt.log`) |
| A5 | Full Verify resume from the progress journal | seed | held as w119 (`full-verify.mjs --resume`, `PIPELINE_VERIFY_RESUME_RUN`); the chained resume is untested |
| A6a | G8 / A18-M5: remedy text on the `prepare-push-subject` path | state.md deferred list | no patch needed: checked 2026-11-02, `pipeline-state.mjs` `prepare-push-subject` already prints the `materialize-push-threat-model` remedy for `CRITICAL-PROOF-BOUND-ARTIFACT-UNAVAILABLE` (as `approve-push` does), and w93 lists the action before the Close commit, which answers the PO question |
| A6b | G1 authorize-critical builder for deploy, publication and release-preflight kinds | state.md deferred list | large (catalog migration): pipeline Goldfish; slice `C19-G1-AUTHORIZE-CRITICAL-BUILDERS-2` delivered/running (result is committed as w122 when verified) |
| A6c | C18-5 pre-granted allowlist rule for the second approval gate | state.md deferred list | PO decision, not built: it changes runner permission settings (what a runner may pre-grant), which is a trust boundary and not the Elephant's call. Recommendation: allow-list only the read-only `inspect`/`prepare-*` calls |
| A6d | C18-12 `--plan` dry run for the readiness reviewer's scope advice | state.md deferred list | held as w116, in another form: no new CLI mode; the existing draft inspection (run at present-plan/submit-plan) now applies the same scope rule, so the refusal comes before the first signature. RED/GREEN case; related pins green; `project-onboarding-e2e` and `pipeline-state` not yet run |
| A6e | C18-6 rest: `heal` defers the retirement while a member is armed (tests encode the opposite, restate under QG-04) | state.md deferred list | held as w118 (Goldfish; `heal` defers the retirement while any producer is in flight; two cases restated under QG-04) |

## B. Needs a PO decision before it starts

| ID | Item | Decision needed |
|---|---|---|
| B1 | Ponytail best practices for the Goldfish (seed section 1) | PO 2026-11-02: logic yes, wording never; own definition. Still open: (1) where the rendered paragraph lives (Elephant recommendation: canonical rule in `roles/goldfish.md`, short paragraph rendered by the briefing generator, conditional on the task kind); (2) a bloat finding class for the Critic (recommendation: yes, narrow and evidence-gated; bundle with the PO's pending Critic pin re-pin). Built as opt-in w120 (`roles/goldfish.md` GF-10, Critic search item "unrequested addition") and w121 (a `smallestChangeParagraph` in the briefing generator); applied only with `APPLY_LEAN_RULE=1`; effect unmeasured |
| B2 | Work split | DECIDED (PO 2026-11-02): small items the Elephant builds itself, large ones via the pipeline Goldfish agents |

## C. From the greenfield tests of candidate 18

The written report is not there yet; first oral observations (PO 2026-11-03), same on all three runners (Claude, Codex, Antigravity):

| ID | Severity | Observation | Elephant reading (measured in the source 2026-11-03) |
|---|---|---|---|
| C19-G1 | major | The runners do not use a design driver that leads them step by step through the design phase; all three maneuver themselves into locks and then search for commands | Corrected after reading the source: a driver exists. `pipeline-state.mjs inspect` publishes a structural `nextAction` for `draft` -> `awaiting-approval` -> `approved` -> `implementing` (`buildInspectNextAction`; the `draft` step derives `--by` and `--profile` from onboarding, NVA-Q2-DRAFTDERIVE) and the close has `close-coordinator.mjs drive`. What is missing is not known without the runners' transcripts: either the runners do not call `inspect` before acting, or `nextAction` does not cover the steps where they get stuck (an edit on a bound document, `reopen-design`, rebind, the readiness review). To measure from the PO's report/transcripts: which command each runner ran at the first refusal, and what `inspect` printed at that moment. Candidate fix after that: make the refusals themselves (`GUARD-LIFECYCLE-AUTHORITY-BOUND` and neighbours) carry the `inspect` call as their typed retry action, and extend `nextAction` to the uncovered steps |
| C19-G2 | major (core issue) | The early binding of PRD/Spec produces the sequences: after `bootstrap-bind-apply` / `kickoff promote apply` the PRD, Spec and `design-input.md` are the bound authority documents (`continuity.authority.prd/.spec`), a direct edit is refused with `GUARD-LIFECYCLE-AUTHORITY-BOUND`, and the sanctioned route is `reopen-design --by <name>`, edit, `submit-plan --by <name> --profile ...`, `approve-plan --by <name>`; every `--by` must be a name the PO supplied (EL-36), so the agent cannot walk it alone | PO question: bind hard only in the step where the signature for the real release comes, not earlier. Analysis below |
| C19-G3 | major | Claude saw a drift after the bound documents changed and concluded it was blocked and wanted to stop; the drift would have gone away by itself with a plain `submit-plan` (PO 2026-11-03) | Measured in the source: when the continuity observation fails the session gets `continuity-observation-unavailable` with `nextAction: null` and the diagnostic "no cause is established here ... inspect read-only" (`lib/project-onboarding-v3.mjs`, the `continuity.status !== "valid"` branch). The cause IS known to the observer (`observeDetailed` in `lib/onboarding-continuity.mjs` holds the `KickoffError` code, e.g. `KICKOFF-PROMOTION-AUTHORITY-DRIFT`, and `classifyOnboardingContinuity` drops it). A drift of an edited, un-reopened bound document therefore reads as a dead end. Fix: carry the cause code to the diagnostic and, for the drift codes, name the two typed exits (`submit-plan --by <name> --profile <p>` rebinds; `authority-restore restore` returns the approved bytes) and put the first into a typed `nextAction`; the same sentence in the `GUARD-LIFECYCLE-AUTHORITY-BOUND` refusal text ("the design lock engages") which today names only restore; `inspect` should also state "drift is not terminal". Rule for all refusals: a state that a typed command lifts must never be worded as a block. Larger than a small item (continuity shape is digest-pinned): pipeline Goldfish, deep tier |
| C19-G5 | major (PO idea 2026-11-03) | The runners would be helped most if the first call of each standard command (start, close and the like) carried a link to a machine-readable runbook that states all prerequisites and the steps, in order, with the evidence to create and commit at each step, and if we keep it current | Not built; design questions open. Existing pieces to build on: `inspect` `nextAction` (`buildInspectNextAction`), `close-coordinator.mjs drive`, the typed retry actions of refusals, the human terminal action catalog. Requirements from the idea: (1) one runbook per lifecycle path (start, design/plan approval, implement, close), machine-readable, each step with preconditions, the exact command, the evidence it produces and the commit it needs, and the next step; (2) the first call of a standard command returns the runbook link once (typed field, not prose); (3) it stays current by construction: generate it from the catalog and the command tables, with a drift test in Verify that fails when a command, flag or step changes without the runbook. Needs the runners' transcripts for the steps where they actually stuck (see C19-G1); candidate for a pipeline Goldfish package after that |
| C19-G7 | major (PO 2026-11-03, Antigravity) | A feature close with push asked the PO for four signatures in a row ("not good") | Not measured yet; waiting for the report. Hypotheses to separate with the transcript: (a) repeats caused by a commit after signing, because every signature binds one exact HEAD and tree and any later commit (handover, evidence, a close artifact) voids it (`docs/push-release-flow.md`, ordering rule); (b) distinct gates in one flow that each need their own proof (push approval, a publication or release-preflight `authorize-critical` subject, a guard override); (c) a retry after a refusal that did not change the request. Measure per signature: the command, its subject, the HEAD it bound, and whether a tree change followed. Direction if (a): the close driver orders every commit before the first signature and prints one signing plan up front; if (b): collapse what policy allows into one attended signing step with a single plan listing all subjects (parity with the runbook idea C19-G5). Signing parity stays: the agent prepares everything, the PO only signs |

### C19-G2 analysis: bind late (draft, then seal)

Today two things are tied together that need not be: the bind at the end of onboarding (digests of PRD, Spec and design-input written into `continuity.authority`) and the approval (PRD release, EL-19). The approval signature already covers the exact bytes it releases. The early bind therefore protects nothing nobody relies on yet; between bind and approval it only costs: a lock on files that are still being worked on.

Proposal: two states of the design package. `draft`: the paths are registered in State, no digest bound, normal edits admitted (the credential and provenance rules stay; `design-input.md` stays immutable once captured). `sealed`: one agent-prepared, digest-bound step binds the digests in the same transaction as the approval, so the PO signs one thing. After the seal everything stays as today (lock, `reopen-design`, rebind).

Consequences:
- Gain: no lock trap before the approval, one ceremony instead of two, the runner needs no knowledge of the rebind sequence.
- Cost: the bound digests are read in about 70 files (continuity observation, readiness review, design advisory, Critic preflight, close, guard tripwire). Each reader needs a defined behaviour for a package without digests ("not yet sealed"), the drift detectors must tolerate a draft, and readiness reviews and advisories must bind the digest of the version they read (so a later edit makes them stale, which is the same invariant as today). Projects already bound need a migration (sealed stays sealed).
- Risk: between bind and approval the guard no longer protects the files; the protection moves to the review and approval digests. This is a trust-model statement and needs an ADR (EL-04) and the PO's decision.
- Not a small patch: do not squeeze it into the end of candidate 19 without a design review.

Recommendation: (1) now, in 19, the cheap relief that also answers C19-G1: a design-phase driver plus, while no approval exists yet, a single agent-executable `design-amend` step that hides reopen, edit window and resubmit from the runner (needs a decision on the `--by` label for unapproved drafts, since no human act is being replaced before the first approval); (2) the late binding as a drafted ADR with an independent review, built in 19 only if the review is positive, else 0.7.1. Greenfield transcripts of the three runners are needed to see which exact refusals they hit; the PO's report is the source.

Status 2026-11-03: the cheap relief for G3 is held as w117 (cause named, "not terminal", both exits). The late binding is drafted as `docs/adr/draft-late-binding-of-prd-and-spec-at-the-approval.md` (proposed, not built, `cb915f3d4`); it needs an independent review and the PO's decision. G1 (design driver) stays open: `nextAction` is unchanged by w117; the runners' transcripts are still needed.

C19-G4 (minor, found while building candidate 19): a Goldfish dispatched on the clone-slice route cannot land its host commit (`NGHF-PENDING-UNAVAILABLE`, `NGHF-COMMIT-EXCEPTION`); the Elephant verifies the three deliverable files and commits them itself. Not a defect of the delivered work; record for the dispatch tooling.

### C19-G5 analysis: a generated runbook (worked out with the advisor, PO idea 2026-11-03)

- **Map versus position.** `inspect`'s `nextAction` is the agent's current position; the runbook is the whole map of one lifecycle path. Both must be projections of the same state machine, otherwise they drift apart; that shared source is the design driver.
- **Generated, never authored.** Derived from the lifecycle transitions behind `buildInspectNextAction`, the human terminal action catalog (it already knows agent-eligible and human-only steps and signing subjects), the close coordinator's drive sequence, the typed retry actions of the guards and the evidence producers. A Verify suite regenerates and compares the committed copy (the mechanism of the vendored-canon and template-sync checks). "Kept current" then means the drift test is green.
- **Format.** Per step the typed action shape the preflight already emits (`executable`/`argv`, `executionBoundary`, `mutation`, `requiresPoApproval`, expected result schema), plus `preconditions` (read-only checks), `evidence` (schema, location, tracked or ignored), `commit` (scope, GIT-03 trailer form) and `signature` (none, or the subject). A path is an ordered step list, an index lists the paths; schema-versioned.
- **How the link arrives.** Standard commands are stateless and a stuck agent is rarely on its first call, so not "first call": every standard command result carries a small typed `runbook` field (path id, the step id this command sits at, a resolvable plugin-root-relative or repo-relative path, schema, digest). Refusals carry the step id too, which is the C19-G1/G3 fix stated generally: every refusal says where on the map the agent is. The bootstrap `ready` envelope carries the index once.
- **Scope.** One small runbook per path (start, design to approval, implement and dispatch, close and push), loaded only for the path the agent is on; the bootstrap payload budget (10-15k target, 45k refused) is the constraint.
- **Build order.** Runner transcripts first, giving the list of states where the runners stuck and `inspect` offered no `nextAction`; then extend `nextAction` and the close drive for those states (C19-G1); only then generate. Generating first would publish a map with the same holes. So C19-G5 depends on C19-G1.
- **C19-G7 is the same fix from the close side.** The close and push runbook makes the ordering rule an explicit step (every commit before the first signature; a commit after signing voids it) and one prepared signing plan lists all subjects. Check that separates the hypotheses: was each of the four signatures preceded by a commit made after the previous signature? If yes, the runner broke the ordering rule, and the immediate workaround is all commits first, then sign once.
- **Decision tier.** Changing every command's result contract plus a new Verify suite is EL-04 territory (an ADR). Not drafted before the transcript gap list exists.

### GF-10 measurement result (2026-11-03, indicative, n = 2)

Method: the same slice at the same base commit, once as it was delivered without the rule (held patches w104 and w85) and once redone by a fresh implementor Goldfish with the GF-10 paragraph in the briefing (the paragraph text of w121, placed as a coordinator fact because the briefing file is hash-pinned; held patches of the redo kept outside the apply folder in `scratch/gf10/`). Both redo briefings said it was an independent redo and named the existing patch as not-an-input.

| Slice | Arm | Files | Changed lines | Patch bytes | Tool calls |
|---|---|---|---|---|---|
| C18-20 (consent and hook handover) | without rule (w104) | 4 | 88 | 12657 | not recorded |
| C18-20 | with rule | 4 | 78 | 9809 | 62 |
| C18-9 (ruleset identity and version in the briefing build) | without rule (w85) | 2 | 80 | 11715 | not recorded |
| C18-9 | with rule | 2 | 55 | 10438 | 37 |

Reading: same files in both arms, 11 % and 31 % fewer changed lines with the rule, 22 % and 11 % fewer bytes; the with-rule runs reported what they left out on purpose. Caveats: one run per arm, the delivered patches may carry Elephant corrections, and the C18-20 redo stopped before the onboarding-continuity suites and the SKILL pins (budget spent on a stale-base contradiction), so green checks are not comparable there. It shows no harm and a modest reduction on two slices; it does not prove an effect. The decision stays with the PO; if adopted, apply with `APPLY_LEAN_RULE=1`.

## D. First runner report: Antigravity greenfield (TabletApp_agy_070_1, 2026-11-03)

PO decision 2026-11-03: fix every defect of priority 1 to 8, small ones directly by the Elephant, larger ones as pipeline Goldfish slices, plus the quick fixes from the report text. Report copy: `scratch/agy/docs/` (not tracked). Facts of the run: 1290 steps, 62 refusals or errors, 171 min active time of which 55 % in the close phase, 5 PO signatures instead of 2, pipeline administration 53.5 % of the non-cache tokens against 7.8 % product work. Elephant reading below is measured in the source on 2026-11-03.

| ID | Report prio | Defect | Elephant reading | Route |
|---|---|---|---|---|
| D1 | 1 critical | No pipeline subagent starts on Antigravity: `agents/*.md` carry Claude tool names (`tools: [Read, Grep, Glob]`), the runner's registry says `unknown component: tool "Read"` | Confirmed: `transformAgyRunnerAgent` in `lib/agy-central-snapshot.mjs` rewrites only the `model:` line (closed table D13), `tools:` is untouched. Fix: a second closed table for the `tools:` names (Read, Grep, Glob, Bash, Write, Edit to the runner's native names from the report: read_file, grep_search, find_by_name, run_command, write_file, edit_file), the same deterministic transform, typed refusal on an unmapped name, tests. The native names come from the runner's own error and the report, so a real Antigravity smoke run stays open | Elephant, clone-slice (small) |
| D2 | 2 critical | `--allow-caller-authored-fallback` let the main agent certify its own Critic rounds | Measured: the finalizer labels the independence (`caller-authored-fallback`, `nativeAttestation: false`, `originGate`) but the receipt still writes `session: {freshContext: true, historyInherited: false}` (`session-critic-finalizer.mjs` lines 488 and 513). Fix part 1 (small): a fallback verdict writes `freshContext: false`, `historyInherited: true` and the label into the receipt. Part 2 is a policy decision for the PO (see below): may a caller-authored verdict satisfy the close gate at all, and with which extra proof. The report's proposal to forbid reading plugin scripts is not taken: agents need the syntax; D6 supplies it instead | part 1 Elephant, clone-slice; part 2 PO decision |
| D3 | 3 high | Five signatures instead of two at the feature close: `feature-package-plan --reconcile` dirties tracked files before the PO signs (`repository must be clean`), and after `feature-package-reconcile` the pre-commit hook still demands a second override for `PB-CONTINUITY-*-result` | Not read in the source yet. Same family as C19-G7. Direction from the report: the prepare step writes only under `.git/agent-pipeline/` or `scratch/`; a signed reconcile deposits the commit capability for its own files so no second signature exists | Pipeline Goldfish, deep tier (guard and continuity), after an Elephant reading |
| D4 | 4 high | A late `project/push-threat-model.md` and the committed Critic evidence move the candidate and force a second Critic round and Verify with no product change | Not read in the source yet. Part a: materialize the threat model in the design phase when `gates.push_approval` is active (the close guide has it as step `materialize-push-threat-model`, `close-chain-guide.mjs`). Part b (candidate equality over the product subtree only) moves a trust boundary and needs an ADR and the PO's decision first | a: Goldfish; b: ADR draft |
| D5 | 5 medium | The Antigravity pre-tool wrapper prints a static `code=native-read-credential-root` for a plain missing project file | Confirmed: `hooks/antigravity-pretool-guard.mjs` line 641 passes the fixed code for any refusal of `nativeReadTargetRefusal`. Fix: pass the inner guard code (the refusal text already starts with it) | Elephant, clone-slice (small) |
| D6 | 6 medium | `happy-path.md` marks several verbs `no syntax documented`; the agent read plugin sources and guessed subcommands (332 turns in the close phase) | Confirmed (`references/happy-path.md` line 5). Fix now: the exact request shape and CLI signature of dispatch-record-write, session-critic-finalizer, register-feature-package, close-coordinator and guard-human-override, taken from their `--help`; lasting fix is the generated runbook (C19-G5) | Elephant, clone-slice (doc) |
| D7 | 7 medium | Repeated GIT-03 trailer refusals and an absolute node path refused by `GUARD-DEVPLAN-SHELL` | Agent errors made likely by terse refusals. Fix: the refusal texts name the exact accepted trailer lines and say "use the bare `node`" (same pattern as C18-8: one working example per refused shape) | Elephant, clone-slice (small) |
| D8 | 8 low | `security-scan` exits 2 with `remote-missing` in a purely local repository (`repository.mode: local`) | Confirmed: `lib/security-remote-identity.mjs` returns `remote-missing` for zero remotes. The scan binds the push destination into its evidence, so the fix needs a typed local-only mode that the push preparation then refuses until a remote exists | Pipeline Goldfish (security evidence shape) |

Quick fixes from the report text, taken along:

| ID | Where | Fix | Route |
|---|---|---|---|
| Q1 | Docs against machine state: `result.md` still says "Status: implementation is in progress." after the close while its JSON fence and `docs/state.md` say closed | The generator renders the sentence from the lifecycle state | Elephant, clone-slice |
| Q2 | Guard false positives: a read-only `ls -la` on `.git/agent-pipeline` and a `grep` outside the repository were refused with codes that read as unsafe | Both refusals are intended (protected control root, outside-repository read); the text should say so and name the permitted alternative (an exact-file read through the native tool, or the typed readback command) | with D7 |
| Q3 | Audit bundle misses the signature proofs, the release verify and the security scan, and binds the parent of the last close commit | Record; part of D4/D3 (what the bundle binds) | after D3 |
| Q4 | The intake generator cuts one module, so no slice can run in parallel (0 parallel dispatches) | Record as design finding: generate a modular file layout when the PRD names separable modules | candidate 19 design item, not a quick fix |
| Q5 | The runner can write the control plane with a `node scratch/*.mjs` helper (`.git/agent-pipeline/publication-close/...` written at transcript line 1231); the observation boundary is not sealed at host level | Security finding; PO decision before any change | PO decision |
| Q6 | `architectureOrientation: adoption-required` shown for a one-module feature | Informational | none |

### M1 (core of the Alfred sprint, PO 2026-11-03): the architecture gate does not produce modular designs

PO observation: agent architectures must modularize massively because of context limits, so that projects do not end in huge modules and files; the three runners differ (Claude and Antigravity planned one module, Codex split). Measured in the source and in the two result repositories:

- **Cause 1, the skeleton.** `renderArchitectureDesignSkeleton` (`lib/design-authoring.mjs`) hands every agent a draft with exactly one module `application` (owned paths `src/**`, `tests/**`, one implementation file `src/application.mjs`, one test entry) and the hint "Split modules as needed". The Antigravity result is that skeleton with the responsibility text replaced (`profileId: greenfield-single-module-web-app`, one module, `src/**`), and it then wrote one file of about 2600 lines for five functional areas. Codex's fitness model has four modules (domain, storage, ui, offline) with explicit owned paths: it ignored the default on its own.
- **Cause 2, no rule anywhere.** The validator (`validateArchitectureDesign`) requires at least one module; no guardrail, skill reference, readiness criterion or ADR states how to cut modules or bounds a file or module size (searched in `docs/adr`, `guardrails`, the skill references and the lib). The skeleton also carries `antiFragmentationPolicy.rejectTrivialFacades: true` with no opposing anti-monolith counterweight.
- **Cause 3, nothing after the design.** The fitness check has no size budget, so a module that grows during development is never reported.

Fix, in three parts, drafted as ADR `draft-modular-design-by-default-with-size-budgets` (EL-04: a new quality bar of the architecture gate): (1) skeleton with a split and a cut rule (small, can be built now); (2) a decomposition criterion in the readiness review and the design guidance; (3) `sizeBudgets` in the fitness model with a check at verify (Goldfish, deep tier, after the PO's decision and a measurement of sensible defaults on the three results). Part 4 of the ADR: slices follow modules, so parallel dispatch becomes possible.

Decisions for the PO from this report: (1) may a caller-authored Critic verdict satisfy the close gate once D1 makes native subagents work on Antigravity (recommendation: no, require the native review, keep the fallback only as a labelled degraded path that the close readback names); (2) the observation boundary hole Q5; (3) candidate equality over the product subtree (D4b).

## E. Second runner report: Claude Code on Windows (TabletApp_claude_070_1, 2026-11-03)

PO decision: take all seven points of section 8.2 of the report into candidate 19. Report copy: `scratch/claude/docs/` (not tracked). The PO keeps the session "Claude Fam App" open for follow-up questions; five questions were sent (host commit text and pending state, lock text and process, the commit and command order of the evidence loop, the reason for the single-module design, the rejected `implementationSurface`). Facts of the run: 20 h 29 min span, 6 h 05 min active, 48 failed tool results and 29 guard refusals, 0 of 11 host commits, no close, no push (stopped at `push-init`), 313 tests green. Positive: independent design review found real data-loss and lock traps; the main agent wrote no product code.

| ID | Report prio | Point | Elephant reading so far | Route |
|---|---|---|---|---|
| E1 | P1 | Host commit 0 of 11 (`NGHF-PENDING-UNAVAILABLE`); a helper that does check, commit with trailer and dispatch record in one step | Source: for a background launch the Claude `PostToolUse` finds no pending host-commit state (`lib/native-goldfish-host-finalizer.mjs` line 349 ff.), the message says the PreToolUse WARNING names the preparation code. On this Linux machine the same hook reports `awaiting-subagent-stop` for a background launch, so the Windows run lacked the pending state the PreToolUse step writes; the cause is not established. The interim route the hook prints (verify the diff, commit as the Elephant with the dispatch trailer) is not backed by a record kind: `dispatch-record-write.mjs` refuses a v4 authored-commit record without host observation, and the close skill expects the orchestrator-commit authorship (`CLOSE-AUTHORSHIP-COMMIT-ONLY`). Direction: name the preparation code in the final hook message; a typed orchestrator-commit helper that writes the record | after the Windows answers; Goldfish deep for the helper |
| E2 | P1 | Windows native: registry locks after every dispatch (`SDC-LOCK-HELD`, `unknown-registry-entry`), owner route; fail fast in the preflight when close or push is not possible on the platform | Cannot be reproduced on this Linux machine; the native Windows runs stay an open check. The fail-fast capability probe at bootstrap is buildable and testable with an injected platform. The lock source (`lib/session-requester-bridge.mjs` line 1770 reports process status unknown on Windows) is named by the report | probe: Goldfish; root cause: needs a Windows run |
| E3 | P1 | Evidence loop: the registration commit and every evidence commit make Verify and Security stale for HEAD; an ordered recipe (`push-init --plan`) and carry-forward of evidence-only commits | Same defect as D4 of the Antigravity report (the candidate moves although no product line changed). One design for both: evidence-only commits carry forward Verify and Security; the recipe is the close and push runbook of C19-G5. Candidate equality over a subtree moves a trust boundary: ADR first | ADR draft, then Goldfish |
| E4 | P2 | Parallelism: make the registry concurrent or show the slicing hint only where parallel dispatch is supported; document the worktree path | Overlaps Q4 and M1 (no modular design, no disjoint slices). Registry concurrency is Windows-specific in the report (`WIN-AUTH-OPEN` for the second launch) | with M1; Windows part waits |
| E5 | P2 | Design questions containing an address or e-mail land unchecked in `design-input.md`; warn at input | The pre-commit hook catches it only at the commit. Fix: refuse or warn at the intake step using the same private-identifier detector | Elephant or Goldfish after reading the intake step |
| E6 | P2 | PO effort: ACL repair with the exact path and a preview; verify command set at onboarding or by `set-phase --verify-command` without an override; the hook text about the proof import is wrong | Hook text (quick, Elephant): the pre-commit text says the agent imports the signed proof itself, but `guard-human-override.mjs authorize-by-signature` with the hashes of a private file was needed. The other two are design changes | text: Elephant; rest: Goldfish |
| E7 | P3 | Consistency: the PowerShell guard allows and refuses the same command; template against guard for hand-built briefings; `CDP-PATH` without a hint; the Critic skill should register the receipt or say clearly "advisory" | Template text (quick): the briefing template reads as if freehand were allowed while the generated-briefing guard refuses it; `CDP-PATH` refusal should name the path rule; PowerShell inconsistency needs the transcripts | quick: Elephant; guard: Goldfish |

Additional quick fixes from the table of section 3.1: Q7 `ARCHITECTURE-DESIGN-SURFACE-INVALID` names only the code, not the field (directory entries with a trailing slash in `implementationSurface`); Q8 `.gitattributes` written by the onboarding itself is refused by the lifecycle policy in the first commit (`GUARD-DEVPLAN-LIFECYCLE`), so the policy needs an exception for the onboarding's own files; Q9 `AR-APPROVAL-UNAVAILABLE`: the help names `--proposal-file` but the apply is only runnable with an injected verification; Q10 `WIN-AUTH-OPEN`: name the exact path and offer the repair with a preview. Single-module finding: Claude and Antigravity cut one module, Codex four; see M1.

## F. Third runner report: Codex (TabletApp_codex_070_1, 2026-11-03), each point checked against the source

PO decision: take all P0 and P1 points and, after verification, the P2 points into candidate 19. Report copy: `scratch/codex/docs/` (not tracked). The run is a retrospective after a closed local feature; the report is honest about its limits (the long main segment was only read at head and tail, so whole-run counts stay unmeasured). Verified here by reading the plugin source at HEAD:

| ID | Report prio | Point | Verification result | Route |
|---|---|---|---|---|
| F1 | P0 | `ARCHITECTURE-DESIGN-RECEIPT-STALE` blocks the next feature | Confirmed: `lib/architecture-design.mjs` line 287 compares the whole receipt (it binds `featureId` and `planPath`) with the receipt rebuilt for the new feature, so every second feature with an unchanged design fails. Same defect family as D4b/E3 | ADR (inheritance by equality over the design), then Goldfish deep |
| F2 | P0 | Read-only retrospective cannot run the product tests while a feature is `approved` | Confirmed: `lib/guard/devplan-shell-lane.mjs` line 192 maps `node --test <file>` to an opaque-script candidate with `forceLifecycleGate`, so any test run is refused outside the implementation phase. The rule is deliberate (an opaque script may write); the gap is that no sanctioned route exists to run tests with scratch-only output. The clone-slice route used for candidate building is the model | design question for the PO (analysis lane), ADR draft, then Goldfish deep |
| F3 | P1 | Bound `result.md` says "Implementation is in progress" after close | Confirmed: `lib/feature-package-registration.mjs` line 107 writes `- Status: implementation is in progress.` at registration; nothing rewrites it at close. Same as Q1 | Elephant (small) plus close-feature check |
| F4 | P1 | ADRs promised by the spec are missing and the close readback says not applicable | Mechanism confirmed: `lib/close-quality-readback.mjs` `adrRow` decides only from the typed architecture impact; nothing compares the spec's promised deliverables. The spec text itself was not read | Goldfish (small): a row that lists spec-promised ADR paths |
| F5 | P1 | Evidence rests partly on coordinator attestation, tool count 0 | Confirmed from the source: `session-critic-finalizer.mjs` lines 133 to 150 (caller-authored fallback) and 488/513 (`freshContext: true`). Same as D2 | D2 part 1 (label and flags), part 2 later |
| F6 | P1 | `critic-report-file` row points at the first report, not the final PASS | Confirmed: `criticRow` returns the first packet in listing order that holds a `report.md`; with three packets it names the oldest (a FAIL) | Elephant (small): resolve the packet the close consumed, show its verdict |
| F7 | P1 | AC3 provenance collision in the product code | Confirmed statically by reading `src/domain.mjs` lines 25 to 27, 42, 46: after an edit B/C the new ingredient C at index 1 gets the key of the old B (`transferIngredients`), the insert is skipped and `validateState` refuses the duplicate source. This is a product defect of the TabletApp, not of the plugin | PO list only; no plugin change. Process lesson: combine state transitions in tests |
| F8 | P2 | Two different Critic round limits in the operating model | Confirmed: the English text (D190) has no round count, the German reference block still names a limit of four | Elephant (small): align the German block; consistency test |
| F9 | P2 | Shell forms missed repeatedly | Overlaps D7/Q2 (exact spellings and the `rg --files` hint in refusal text) | with D7 |
| F10 | P2 | Browser evidence not bound to the integrated commit | Process finding, no plugin defect found; fixture and app hash capture is part of the candidate-bound evidence work | later, with D4 |
| F11 | P2 | No vertical slice before the full build | Overlaps M1 (slices follow modules) | with M1 |

Further points from the report text (not in its table): a second design signature because the schema value was wrong (the parser should run before the first review and signature; same family as D3), a PO-terminal approval that failed on an unclean repository (D3), and the missing runner export of phase windows, token deltas and a/b/c bucket (the report asks for it; large, deferred past candidate 19).

## PO decisions on the tiles (2026-11-03)

| Topic | Decision | Consequence for the build |
|---|---|---|
| Authority carry-forward (D3, D4b, E3, F1) | ADR plus build as an opt-in block | An ADR draft (Proposed, independent review), then the patches behind their own opt-in block in the apply script; the PO applies or leaves them out |
| Analysis lane (F2) | scratch-clone lane | A sanctioned command makes a throwaway clone under `scratch/` and runs the tests there; the working tree stays untouched, no lifecycle mutation, no signature. Needs the ADR for the guard exception |
| Caller-authored Critic verdict (D2 part 2) | no at rigor 1 or higher or high risk | The fallback stays a labelled degraded path; it satisfies the close gate only at rigor 0 and low risk; the close readback names it |
| Modular design (M1) | skeleton and criterion, budgets report-only | Several modules by a cut rule in the skeleton, a decomposition criterion in the readiness review, `sizeBudgets` reported not blocking (500 lines per file, 2500 per module as starting values) |
| Control-plane write (Q5) | block it now with a guard | The guard refuses a script run whose target is a path under `.git/agent-pipeline/`; own review; known limit: another interpreter is not covered without host sandboxing |
| GF-10 (w120/w121) | adopt | The apply script applies both by default (`APPLY_LEAN_RULE=0` leaves them out); the Critic search item belongs to the PO's open Critic preimage re-pin |
| Late-binding ADR | accept, build in candidate 19 | The ADR becomes Accepted; the build (guard tripwire, seal, shared reader) is a Goldfish chain with its own Critic review |
| Assignment of unclear topics | in 19: M1 parts 2 and 3, the generated runbook (G5), Windows lock and registry (E2 cause, E4); to 0.7.1: the runner export of phase windows and token buckets | The session "Claude Fam App" is a Windows run and answers on request, so the Windows items can be checked live there |

## Completion matrix of the three runner reports (status 2026-11-03, updated with every patch)

Legend: **built** = held patch exists, applies to HEAD, own tests green in a clone, notes and check test written; it is NOT applied, NOT Critic-reviewed and NOT run in a real consumer repository. **running** = a Goldfish slice is in flight. **planned** = decided, not yet started. **ADR first** = a decision record comes before the build. **moved** = not in candidate 19. None of the rows is "done": open for all are Full Verify of the final state, independent Critic review, real runner runs and PO acceptance.

### Antigravity (D, Q, M1)

| ID | Item | Status | Patch or route |
|---|---|---|---|
| D1 | Runner view maps the `tools:` list to the registry names | built | w126 (real Antigravity smoke run open) |
| D2a | Receipt of a caller-authored verdict says `freshContext: false` and carries the label | built | w135 |
| D2b | A caller-authored verdict satisfies the close gate only at rigor 0 and low risk | built (decided); the rigor-0 branches are covered by code reading only, because the audit route always has a package at rigor 1 or 2; the risk class has no State source and is read from the authored dispatch records | w137 (needs w135) |
| D3 | Signatures: dirty-tree check before the ceremony, a signed reconcile commits its own files, no double signature | ADR first (decided: opt-in block) | one ADR with D4b, E3, F1 |
| D4a | Push threat model materialized in the design phase when a push approval is active | partly built (w145: guidance in the happy path; the command has no phase precondition; no design-phase readback and no enforcement) | Elephant (text) |
| D4b | Evidence-only commits carry Verify and Security forward (candidate equality over the product subtree) | ADR first (decided: opt-in block) | one ADR with D3, E3, F1 |
| D5 | Pre-tool header names the real guard code | built | w127 |
| D6 | Exact CLI signatures in `happy-path.md` and the close skill | built (flag sets of the critic preflight and the close transitions; the full generated runbook is G5) | w132 |
| D7 | GIT-03 refusal prints the accepted form; shell refusal names the bare `node` | built | w130 |
| D8 | Security scan accepts a repository without a remote as a typed local-only subject; push gate still refuses it | built | w129 (Goldfish; the push-guard suite was run by the Elephant, green) |
| Q1 | `result.md` status sentence cannot go stale | built | w129a |
| Q2 | Intended read refusals say they are intended and name the alternative | planned; deferred on purpose: the refusal texts are pinned by several suites (g23-read-help, g23-quoted-pipeline-reads, the cross-runner passive matrix), so a wording change needs a coordinated test pass, not a quick edit | later wave with F9's `rg --files` hint |
| Q3 | Audit bundle binds the signature proofs, release verify and security scan | planned (after D3) | with the D3 slice |
| Q4 | One module, no parallel slices | see M1 | M1 |
| Q5 | Control-plane write by a `node scratch/*.mjs` helper | built (decided: guard now) | w131 in the apply script (static scan; exact-path exemption for `scripts/housekeeping.mjs`; other interpreters stay a known limit) |
| Q6 | `adoption-required` shown for a one-module feature | no action (informational) | after M1 it disappears for a split design |
| M1.1 | Design skeleton with several modules and a cut rule | built as a cut rule in the skeleton comment (the skeleton keeps one example module; no generated multi-module layout) | w140 |
| M1.2 | Decomposition criterion in the readiness review and design guidance | built (w144, reviewer wording as a question, never a block; guidance part is the w140 skeleton rule; whether a model raises it is a greenfield measurement) | Elephant (text) |
| M1.3 | `sizeBudgets` in the fitness model, reported not blocking | built (w143; advisory field `sizeBudgetAdvisory`, defaults 500 lines per file and 2500 per module, no outcome, no change of `overallStatus`; the walk over owned paths costs time on large repositories and is unmeasured; no consumer renders it yet) | Goldfish slice |
| M1.4 | Slices follow modules (parallel dispatch) | planned | with M1.2 and the slice planner |

### Claude Code on Windows (E, Q7 to Q10)

| ID | Item | Status | Patch or route |
|---|---|---|---|
| E1 | Host commit 0 of 11: name the preparation code, typed orchestrator-commit helper | planned (cause on Windows open) | Goldfish slice; the session "Claude Fam App" is asked for the stop-failure records |
| E2 | Fail fast at bootstrap when close or push cannot work on the platform; Windows registry lock cause | planned (decided: in 19) | Goldfish slice (probe); lock cause needs the Windows session |
| E3 | Evidence loop ordered recipe and carry-forward | ADR first | one ADR with D3, D4b, F1; recipe is the generated runbook (G5) |
| E4 | Parallelism: registry concurrency and slicing hint | planned (decided: in 19) | with M1 and E2 |
| E5 | Private identifier warned at intake, not only at the commit | built (warning in the intake generate plan; the e-mail category itself is not exercised by a test) | w136 |
| E6 | Wrong hook text about the proof import; ACL repair with a preview; verify command set | text planned; rest planned | Elephant (text); Goldfish (rest) |
| E7 | Template reads as if freehand is allowed; `CDP-PATH` hint; PowerShell inconsistency | partly built: Goldfish template text (w142), `CDP-PATH` hint (w133); the Critic template is in the pinned preimage and stays unchanged; PowerShell part and the Critic skill receipt note open | Elephant (text); guard part with the Windows session |
| Q7 | `ARCHITECTURE-DESIGN-SURFACE-INVALID` names the entry | built | w128 |
| Q8 | Onboarding's own `.gitattributes` refused by the lifecycle policy | built (exact root path added to the shared scaffold predicate; the onboarding end-to-end suite was not run) | w139 |
| Q9 | `AR-APPROVAL-UNAVAILABLE` help names a flag that cannot run alone | built (w141, text only; the signed route is not rebuilt) | Elephant (text) |
| Q10 | `WIN-AUTH-OPEN` names the exact path and offers a preview | planned | with E6 |

### Codex (F)

| ID | Item | Status | Patch or route |
|---|---|---|---|
| F1 | `ARCHITECTURE-DESIGN-RECEIPT-STALE` blocks the next feature | built as OPT-IN (`APPLY_AUTHORITY_CARRY=1`): the check accepts the receipt of a closed predecessor when the design and every target digest are equal, nothing is rewritten, no inheritance command (ADR point 1, minimal form); the ADR text has no second review yet | w138; D3, D4b, E3 remain ADR points still unbuilt |
| F2 | Read-only analysis lane while a feature is approved | ADR first (decided: scratch-clone lane) | ADR, then Goldfish slice |
| F3 | Result record claims no stale state | built | w129a |
| F4 | ADR promised by the Spec but missing at close | built, report-only (reads the module map's adrReferences, all modules, not only this feature's) | w134 (rebased patch on the chain) |
| F4b | Decisions to record are enforced from the design on (PO idea 2026-11-03: none of the three runs wrote an ADR) | planned | Skeleton rubric "decisions to record" (title, trigger, ADR path) that fills the existing `adrReferences` fields, a readiness criterion for the classic triggers (module boundaries, data keeping, offline and error strategy, security trade-off), the F4 close row checking every named path (report-only first, blocking after a measurement), and a runbook step that calls the `architecture-decision` skill when the design is promoted. No schema change |
| F5 | Attestation versus observation in the receipts | planned | = D2a, D2b |
| F6 | Close readback names the passing Critic round | built | w129b |
| F7 | AC3 provenance collision in the TabletApp | PO list (product defect, no plugin change) | none |
| F8 | German Critic round limit differs from the English rule | PO list: agents must not read the German reference block (CLAUDE.md language rule); the PO aligns the two lines of `docs/operating-model.md` below the DE marker that name a limit of four to the English rule (D190, no round count) | PO list |
| F9 | Shell forms missed repeatedly | partly built (accepted forms printed) | w130; the `rg --files` hint is planned |
| F10 | Browser evidence not bound to the integrated commit | moved | with the carry-forward ADR |
| F11 | No vertical slice before the full build | planned | = M1.4 |

### Further decided items and what moved

| Item | Status |
|---|---|
| GF-10 adoption (w120, w121) | built earlier; the apply script now applies both by default |
| Late-binding ADR | accepted by the PO; build in candidate 19 planned as a Goldfish chain with its own review |
| Generated runbook (C19-G5) | planned (decided: in 19); stage 1 is D6 |
| Runner export of phase windows and token buckets (Codex) | moved to 0.7.1 |
| C18-5 pre-granted allowlist | decided: not introduced |

Open after the 2026-11-03/04 autonomous window, not built yet: D3 (signed reconcile commits its own files), D4a (only guidance built, w145), D4b (evidence-only carry-forward), E1, E2, E3, E4, E7 guard part, F2 build (analysis lane), M1.4, G5 runbook, the late-binding ADR build chain, Q2, Q3, F9 rest. Q8, F1, M1.1, M1.3 and Q9 are built (w139, w138 opt-in, w140, w143, w141). Nothing here is claimed done.

Count now: **built 20 items** (the 14 below plus Q8, F1/opt-in, M1.1, M1.2, M1.3 and Q9) (D1, D2a, D2b, D5, D6, D7, D8, E5, E6/Q10 text, F4, Q1 and F3, F6, Q5, Q7, in patches w126 to w137 with w129a and w129b; the apply script was rehearsed in a clone on 2026-11-03 through w137 plus GF-10 with exit 0, and again on 2026-11-04 at e10acc7a8 through w145 plus GF-10, default chain and opt-in variant (w138) both exit 0, which proves only that the chain applies, not a Full Verify), **ADR first 5** (D3, D4b, E3, F1, F2; both drafts had one independent Opus review on 2026-11-03 with ten findings, all addressed in the drafts, the revised text is not re-reviewed until a working local candidate exists, PO decision), **planned** the rest.

PO decisions of 2026-11-03 (second round, all recommendations): (1) rehearse the apply script in a clone now with the existing chain, then add the remaining items in waves and rehearse after each wave; (2) ADR enforcement from the design (F4b) starts report-only; (3) analysis runs in the control directory keep the last five runs and at most seven days, no network policy yet; (4) no Critic carry-forward in the authority ADR (only Verify and Security evidence).

PO list additions (2026-11-03): host sandboxing for test execution (residual of the analysis lane and the control-plane scan, due before the 0.8 candidate); the `scripts/housekeeping.mjs` exemption of w131 (edits to that path need normal review); the commit of the ADR drafts held a design trailer with more than ten paths, so the authorship verifier reports it as unverifiable (later commits split ADRs and held-patch files). The earlier candidate 19 patches w115 to w125 are applied; w126 and later are not.

## Order of work

A3 and A2 first (both remove noise from every future Full Verify), then A4/A5, then A6, then B1 when decided. Greenfield findings jump the queue by severity.

## Full Verify 6 on the applied state (2026-11-03)

Clone below the home directory with an `upstream` remote, built by rehearsing `po-apply-0.7-candidate19.sh` (default, without the lean rule) from HEAD `b61d60a87`; 1154 steps, 6565 s, 4 red. Rerun alone, one at a time:

- `codex-pretool-guard-tests`: green alone (272 s); red only inside the full run, so load.
- `g23-read-help-tests`: green alone (4 s), red in the full run with `VERIFY-CASE-COMPLETION-DECLARATION`: the suite declares G23C001 to G23C004 (G23C004 came with C18-8), its policy in `harness/verify-suites.json` listed three ids. A real finding, fixed by w125 (one line, applies after w124, rehearsed clean). Measured with the real parser on the recorded stream: without G23C004 rejected (`VERIFY-CASE-COMPLETION-DECLARATION`), with w125 accepted. Not re-run as a whole Full Verify; `run-cc.mjs` does not read `verify-suites.json` policies (tool follow-up).
- `codex-isolated-critic-protected-preimage-tests`: red, open by design (PO re-pin; never re-pinned by the Elephant).
- `security-scan`: red, `remote-ambiguous` with two remotes in the clone; open by design (run with `--remote upstream`).

One real finding (g23), one patch (w125). Not covered by this run: main-tree checks, batch Critic (paused), native Windows runs, real Codex/Antigravity runs, hook activation on a real promotion, parallel host commits in a real run, PO acceptance.

## PO decisions after the apply (2026-11-03)

Candidate 19 is applied (`4924916bf`; w120/w121 not). Decisions: GF-10 is measured on two or three past slices before any adoption; the late-binding ADR gets an independent review, then the PO decides; C18-5 (pre-granted allowlist) is not introduced; next is waiting for the greenfield reports, with no stamp and no main-tree Full Verify until they are in. The GF-10 measurement and the ADR review are queued preparation, not started.

## End note: derived files

Adding or removing a script, suite or skill drifts the inventory baseline and the Reader inputs (`node scripts/refresh-derived-files.mjs --check` reports `inventory-baseline: DRIFT` since A1). The refresh touches `plugins/pipeline-core/` and is therefore part of the PO apply script (last step), not a separate commit by the Elephant.
