# Quality-Gate Guardrails

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 3
> Audience: every agent role; primary consumers are Goldfish (submission), Elephant (gate decision), and Critic (trajectory check). Operationalizes the quality-gate / Definition-of-Done decision (`docs/adr/0005-quality-gates-dod.md`).

**Precedence and enforcement:** as defined in `guardrails/global.md` (header). Principle: deterministic before probabilistic — machines gate first, LLM judgment reviews after (`docs/operating-model.md`, *What the model protects* — rule 3).

Rule IDs: `QG-xx`.

---

## QG-01 — The gate chain is the norm

- **MUST** pass the full deterministic chain `Format → Lint → Typecheck → Tests → Build` (blocking) before any submission counts and before any LLM review starts. The concrete checkers per project come from the calibration (<PROJECT_A>: pnpm chain; <PROJECT_B>: yamllint + `check_config`; <PROJECT_C>: build/compile gate) — the chain semantics are central and non-negotiable.
- **MUST NOT** hand a diff to the Critic while deterministic gates are red, and the Critic **MUST NOT** flag anything CI/verify already enforces (lint, formatting, type errors) — no noise, no double work.
- `verify` + evidence are invariant on ALL rigor levels — there is no path around the deterministic gates, not even for one-line fixes (`docs/operating-model.md`, *Rigor, risk and gates*).
- **Why:** Machines find mechanical errors guaranteed and cheaply; LLM review is probabilistic and expensive — inverting the order wastes tokens and dilutes findings.
- **Verification:** The verify script encodes the chain (QG-02); the gate decision (SDLC step 8) records green evidence before the Critic dispatch; Critic reports contain no CI-enforceable findings.

## QG-02 — verify-script contract: ONE script, three consumers

- Each project **MUST** define exactly ONE verify entry point (`{{VERIFY_COMMAND}}`, e.g. `pnpm verify` — named in the project calibration at its resolved authority tier — `project/pipeline.json`, else `.claude/pipeline.json` — field `verify`) that runs the full chain.
- Exactly three consumers execute the IDENTICAL command:
  1. **Stop hook** — blocks the Goldfish turn from ending while red (exit 2 + stderr feedback),
  2. **Goldfish submission** — the run that writes the evidence artifact (QG-03),
  3. **CI** — the final, unbypassable instance on push/PR.
- **MUST NOT** define additional or diverging check chains in hooks, CI, or scripts ("one more quick check over here" is how three truths start).
- **Why:** Three diverging check paths = three truths = gate drift (a known anti-pattern); one script is the only way "green" stays unambiguous (ADR-0005).
- **Verification:** Calibration names the command; the CI workflow provably calls the same command; the evidence artifact names script + commit + tree + exit code. The runner first invalidates any earlier evidence with a red `running` record, captures a clean Git candidate, and rejects the result if the worktree, commit, or tree changes before evidence write. Thus an interrupted run cannot leave a prior candidate's green result usable. Bootstrap step 5 checks the script exists and is callable (`harness/session-bootstrap.md`). **DEFER:** the central stop-hook gate framework (consumer 1) is not shipped in the plugin — `close-block` already runs the verify gate at close, so consumers 2 and 3 carry the contract meanwhile; trigger to build it: first unverified-close incident in the feature phase.

## QG-03 — Evidence artifact: machine-generated JSON

- The verify script itself **MUST** write the evidence artifact as JSON; the model **MUST NOT** author, edit, or "reconstruct" it. A submission without a script-written artifact is unverified regardless of what the report claims (P4).
- Normative minimum fields:

  ```json
  {
    "schema": "pipeline.verify-evidence.v0",
    "project": "{{PROJECT_NAME}}",
    "command": "{{VERIFY_COMMAND}}",
    "commit": "{{GIT_SHA}}",
    "tree": "{{GIT_TREE}}",
    "candidate": { "binding": "exact" },
    "finishedAt": "{{ISO8601_TIMESTAMP}}",
    "steps": [
      { "name": "format", "exitCode": 0 },
      { "name": "lint", "exitCode": 0 },
      { "name": "typecheck", "exitCode": 0 },
      { "name": "tests", "exitCode": 0 },
      { "name": "build", "exitCode": 0 }
    ],
    "exitCode": 0
  }
  ```

- Task/feature status lists (where used) are also JSON, and the agent may change ONLY the designated status field (e.g. `passes`) — strongly-worded, per the long-running-agents harness pattern.
- The completion report maps results three-valued: passed / failed / not verifiable — "not verifiable" is stated honestly, never rounded up to green.
- **Why:** Script-written JSON is tamper-evident and machine-checkable; models are measurably less likely to inappropriately rewrite JSON than Markdown. Self-written "evidence" is the failure mode, not a mitigation.
- **Verification:** The Critic's trajectory check compares artifact vs. claims: does the artifact exist, did the script write it (timestamps/trajectory), does the commit SHA match the diff? **Delivered (reduced scope: no registry, no expiry fields — see QG-05/QG-06 CUT disposition):** writer = `harness/scripts/verify.mjs` (self-application, project calibration field `verify`); canonical artifact path = `evidence/verify-latest.json` (git-ignored — a regenerated status snapshot, not a durable audit trail).

## QG-04 — Test-role separation: the implementor never touches its own tests

- An implementation Goldfish **MUST NOT** create, modify, delete, or weaken the tests/checks that validate its own implementation — tests are the contract, not negotiating mass.
- If a test is genuinely wrong or the spec contradicts it: trigger the stop condition and report — the test change is a SEPARATE task (separate dispatch/commit), and the Critic reviews test diffs specifically for weakening (threshold lowering, assertion removal, skips).
- **MUST NOT** soften gates to get green: no skipping tests, no lowering thresholds, no `|| true`.
- **Why:** Self-validation is the core failure mode of agentic coding — an agent that can edit its own examiner always passes (`docs/operating-model.md`, *Roles and boundaries* — Goldfish row).
- **Verification:** Test-path protection during implementation tasks — **delivered:** PreToolUse hook `guard-testpath.mjs` blocks Edit/Write on paths named in a project's `.claude/guard-config.json` (`protectedTestPaths`); Bash/PowerShell writes to the same paths are NOT covered by this hook — those tool calls route only through `guard-git.mjs`, which does not check test paths (see the hook's own NOT-COVERED header); scope is deliberately a blanket per-path block, not automatic task-type detection (that distinction stays an open design question, out of scope for this delivery — see the hook's own header comment). The briefing's prohibitions field (canonical field 4, `docs/operating-model.md`, *The lifecycle* — step 5, Dispatch; `roles/goldfish.md` GF-01) and Critic test-diff review remain the primary defense for that nuance.

## QG-05 — Gate honesty: document what a gate does NOT check

- Every gate **MUST** carry an explicit statement of its blind spots ("does not check: …"). Examples from the legacy stock: <PROJECT_A> CI is "alarm, not barrier"; <PROJECT_B> `check_config` does not validate card syntax; <PROJECT_C>'s compile gate is fail-open when the editor is offline.
- Reports and DoD statements **MUST** name the gate limits relevant to the claim ("tests green, but E2E not covered").
- **Why:** A green gate that silently checks less than assumed produces confident-wrong "done" — false trust is worse than no gate.
- **Verification:** Gate registry with mandatory "does not check" field per gate — **CUT:** registry bureaucracy exceeds its value at one-dev scale; the statement lives next to the gate definition in the project calibration/docs instead. Re-trigger: first gate-expiry incident, or more than one verify gate per project.

## QG-06 — Gates are binary; warn-only needs an expiry date OR a documented, justified calibration

- A gate is either BLOCKING or DELETED. An ad-hoc, undocumented warn-only state is a temporary exception and **MUST** carry: reason, owner (the PO), and an expiry date. At expiry it is promoted to blocking or deleted — no third option, no silent extension.
- **MUST NOT** introduce "documented instead of fixed" risks: a known gap with a TODO comment and no due date is a finding, not a mitigation.
- **Revision (`docs/adr/0027-gate-philosophy.md`):** the pipeline manifest (`project/pipeline.yaml`, else `.claude/pipeline.yaml`) introduces per-gate modes `blocking | warn | off` as a first-class, PROJECT-level CALIBRATION field — this does not reopen QG-06's binary principle. A manifest gate is still binary at any given moment (its `mode` is one explicit value, never an undeclared drift); `warn` in the manifest **MUST** carry a justifying comment directly in the manifest file (the manifest-level equivalent of QG-06's reason/owner/expiry fields, in a leaner form appropriate to a machine-read config). Documented configuration is not silent decay (a known anti-pattern) — an undocumented or unjustified `warn`/`off` is still exactly the violation this rule exists to catch.
- **Why:** Warn-only becomes permanent by default — <PROJECT_A>'s Lighthouse gate stayed warn-only from introduction ("once calibrated, set to error" never happened); <PROJECT_B>'s action-pinning TODO survived from project start.
- **Verification:** Gate registry fields `status` + `expires` are machine-checkable; the `/close` drift check flags expired warn-only gates; the Critic checklist contains "are there documented-instead-of-fixed risks?". **CUT (same disposition as QG-05):** no registry implementation at one-dev scale; re-trigger: first gate-expiry incident, or more than one verify gate per project. Manifest gate modes are additionally reviewed via the Critic checklist item above — an unjustified `warn`/`off` in a manifest is the same finding class as an undocumented legacy warn-only gate.

## QG-07 — Bugfix discipline: reproduce before you fix

- Before fixing ANY reported bug, **MUST** first reproduce the failure with a failing test or a repro command that demonstrably fails against the current code — describing the bug or reasoning about its cause is not reproduction; a red check is.
- **MUST** fix only the root cause the repro isolates — no incidental cleanup and no unrelated refactors riding along in the same change; a rename or style fix that surfaces along the way goes into a SEPARATE commit, never bundled with the bugfix.
- The repro test **MUST** stay permanently in the suite after the fix goes green — it is the regression guard for exactly this bug, not a scratch artifact to delete once the fix lands.
- **Why:** This was the largest substantive gap identified by an external review (Google, Whitepaper „Day 5") — no rule covered bugfix discipline at all. A fix without a preceding red repro cannot prove it fixed the reported failure rather than something adjacent; "fix + drive-by cleanup" in one commit is a scope-creep vector wearing a bugfix disguise, and QG-04's test-role separation only protects tests an implementor did not write in the first place.
- **Verification:** Bugfix completion reports name the repro command/test and its pre-fix red result; the diff's test file shows the repro test present and green post-fix; a bugfix commit containing unrelated renames or cleanup is a QG-07 violation to flag in Critic review.

## QG-08 — No commits while a Verify run is in flight; registering a suite is not done until the capability inventory covers it

- **MUST NOT** create a new commit (including a handover/docs-only commit) while a background/foreground `verify.mjs` run is still in progress against the working tree — the runner binds its evidence to one clean, unchanged Git candidate from start through evidence write; a commit landed mid-run detaches the evidence from the candidate it claims to describe (`VERIFY-CANDIDATE-DRIFT`), producing evidence that looks green but is not bound to the reviewed HEAD, and forces a re-run even when the commit itself was unrelated to the diff under test.
- **MUST** treat registering a new suite in `verify.mjs` as incomplete until the owning capability's `surfaceIds` in `docs/product-capability-inventory.json` covers the newly-discovered `verify-phase:` surface in the SAME change — a dispatch briefed only "register the suite" is under-scoped; the categorization is part of the registration act, not a separate follow-up. **This used to be two hand edits and is now one** (NVA-INVDERIVE-1, 2026-08-28): the inventory's `surfaces` array was pure duplication of `discoverSurfaces()`'s output and has been removed, so the surface set is derived and only the capability mapping — a judgement no code can derive — is still declared. The check now names the exact uncategorized surfaceId rather than reporting a coverage mismatch.
- **MUST** run the broader downstream test suite(s) for any changed module known to be widely consumed (i.e. imported by more than the files the dispatch directly touched), in addition to the files the dispatch was briefed to change, before claiming the change verified — a passing narrow diff does not prove a shared module's other callers still pass.
- **Why:** All three are the same shape: a dispatch or session correctly followed its own narrow instruction and still produced a false-green or drifted result because a coupling only visible at the full-repository level was outside its briefed scope. Concurrency safety ("don't run the full gate, a second concurrent run corrupts the candidate lock") and suite-registration completeness are both correct instructions in isolation; the compensating control belongs in the briefing/rule, not in loosening either instruction. This exact self-inflicted no-commit-mid-run pattern (a docs/state.md update, a benchmark file, a backlog item — landing while Verify was still running) separately cost a full re-run multiple times in the same Nova sprint block before being named as a standing rule; the guard already fails the run closed, but the cost is a wasted run, not a silent miss — writing the rule down front-loads that cost to "wait for the run to finish" instead of "re-run after the failure."
- **Verification:** `evidence/verify-latest.json`'s `candidate.binding` is `"exact"` against the commit under review, never `"drift"`, for any claim that Verify passed at that commit; `check-verify-suite-registration.mjs` reports 0 unregistered surfaces after a suite-registration dispatch; a Critic reviewing a widely-consumed-module diff checks for downstream-suite evidence beyond the directly-changed files. `VERIFY-CANDIDATE-DRIFT` in `harness/scripts/verify.mjs` is the mechanical backstop for the no-commit-while-running duty; this entry is the proactive form of the same rule for session/close discipline.
- **Addendum (extracted from `docs/state.md`, Sprint Phoenix checkpoint 34/35 history, dispatch `PHX-WP-STATE-ROTATION-EXTRACT-AND-BUILD`):** two refinements to the "widely consumed module" duty above. First, blast radius for a `plugins/pipeline-core/lib/*.mjs` edit is not only its import graph — a suite can depend on the file's literal SOURCE TEXT (string/regex matching against file content) without importing it at all; `rg` for the file's path/name across the test tree, not only its export names, before declaring the change's test surface covered. Second, the "check every consumer of a widely-shared schema" duty applies RETROACTIVELY when a gap is discovered later, not only prospectively at the time of the change: a criterion already booked `implemented` whose earlier change touched a widely-shared schema is not exempt from this check just because time has passed — fix a retroactively-discovered broken consumer immediately rather than leaving it for a future session to rediscover.

## QG-09 — No unproven "cannot happen" claims

- **MUST NOT** write a claim of the form "X cannot happen because Y" — in code, in a code comment, in a commit message, or in a durable register/handover entry — on reasoning alone. Either back it with a test/fixture that would fail if X could in fact happen, or a measured, executed probe (a real command run and its output read, not inferred), or state it as an open question instead of an assertion.
- **MUST** treat an unbacked "cannot happen" claim already written down as a finding to correct, not a style nit — the same discipline QG-07 requires for a fix (red repro before claiming fixed) applies to a claim of impossibility: write the test/probe first, then the claim, never the reverse.
- **Why:** named as a standing rule after a Critic round found three of five findings shared one root cause, and separately (`docs/state.md`, Sprint Nova checkpoint history, T2–T5 Critic-round retrospective) a multi-round guardrail remediation found that four of five successive Critic rounds each caught a blocker/major in the previous round's own remediation — in both cases the root cause named explicitly was reasoning about what the code should do instead of measuring what it does, then writing the conclusion into a comment or the register. QG-07's reproduce-before-you-fix discipline would have caught the same class if followed for a bugfix; it did not by itself cover the parallel failure mode of an untested impossibility claim written down as if it were evidence, which is the gap this rule closes.
- **Verification:** Critic review flags an unverified "cannot happen"/"X is impossible" assertion — code comment, commit message, or durable doc — as a finding when it carries no adjacent test/fixture name or described executed probe backing it; the fix is either a test/probe demonstrating it, or a rewritten statement phrased as an open question.

## QG-10 — Severity belongs to the check that produces a finding, not the gate that consumes it

- A check **MUST** exit non-zero only for findings that genuinely block; an unfixable historical fact (e.g. a past commit's non-conforming shape that cannot be rewritten under GIT-04) **MUST** be reported, not made blocking. The push gate (`GG-03`, `authorizeRecordedPush`) stays exactly as strict as today — demanding `exitCode === 0` from `harness/scripts/verify.mjs` before an approval is recorded — because that demand is correct once each check classifies its own findings honestly.
- **MUST NOT** widen the push gate itself to interpret or tolerate partial check failures; the rejected alternative was teaching the gate to distinguish blocking from non-blocking findings post hoc. Classification happens once, at the source (the check), not twice.
- **Why:** A gate that has to second-guess a check's exit code duplicates the check's own judgment in a second place — the exact "two truths" failure QG-02 names for diverging check chains, applied to severity instead of command identity.
- **Verification:** `node harness/scripts/verify.mjs` exits 0 iff no check reports a genuinely blocking finding; a check's own report/log distinguishes blocking findings from reported-but-non-blocking ones in its own output, not in the gate's interpretation of that output.

## QG-11 — Test what the change altered, not only what it was meant to fix

- A bugfix's or feature change's own regression tests **MUST** cover the code paths the diff actually touched, not only the originally reported symptom; a test that re-checks solely the intended repair does not prove the altered surface is otherwise safe.
- **Why:** a heredoc-stripping fix to the push gate shipped tests covering the intended repair (allow a commit message mentioning the phrase) but not the altered surface (a command placed after the terminator) — the change made the gate fail-open, its own tests were green throughout, and an independent Critic caught the regression, not Verify (`backlog/items/2026-08-06-no-gate-is-tested-end-to-end-for-satisfiability.md`).
- **Verification:** Critic review checks that a change's added/modified tests exercise the diff's changed branches and surfaces, not solely the reported symptom; a diff that alters conditional logic without a test for the new or changed branch is a QG-11 finding.

## QG-12 — A new `docs/**` file needs a matching governance registry entry

- Any commit that adds a new file under `docs/**` **MUST** also add a matching entry to `governance/observation-doc-governance.json`'s documentation inventory; `check-observation-governance.mjs` refuses an unregistered new doc with `OG-DOC-UNCLASSIFIED`.
- **Why:** a new `docs/**` file (e.g. an ADR, a handover-rotation archive file) that skips this registration step fails the gate mechanically, and the lesson was previously captured only in a personal AI cross-session memory file rather than any repo-committed artifact — a gap this session hit twice independently before it was named here (`backlog/items/2026-08-18-new-docs-file-needs-governance-registry-rule-has-no-repo-level-home.md`).
- **Verification:** `check-observation-governance.mjs` (run via `harness/scripts/verify.mjs`) exits non-zero with `OG-DOC-UNCLASSIFIED` for any `docs/**` file present in the tree but absent from the registry.

## QG-13 — Critic review round cap: one initial round, one re-review round

- After the initial Critic round for a package, at most **one** re-review round follows a FAIL/blocking-finding rework: the Elephant dispatches the rework, then re-dispatches a fresh Critic exactly once against the reworked diff. If that re-review round ALSO reports a blocking finding, the Elephant **MUST NOT** dispatch a third Critic round for that package — it self-verifies the further rework directly instead.
- **MUST NOT** reset the cap by re-labeling continued rework on the same underlying finding as a "new" package or task; only a genuine scope change (a materially different diff, a newly discovered A/G/S touch, or explicit PO direction) licenses a fresh initial round.
- **Why:** this session's own handover history (`docs/state.md`) recorded two mutually inconsistent values in circulation within the same reviewed range — a "two-round cap" and a later, seemingly PO-confirmed "one Critic round per package, then self-verify" — with the rule itself codified nowhere in a repo-committed artifact (`backlog/items/2026-08-18-critic-review-round-cap-has-no-durable-home-and-two-inconsistent-values-circulate.md`). PO decision 2026-08-18 (decision #5) resolved this as "1 initial Critic round + 1 re-review round" (two Critic dispatches total per package before self-verify takes over), written down once so exactly one number circulates repo-wide.
- **Verification:** a completion/handover record showing more than two same-package Critic dispatches (initial + one re-review) without a documented scope-change justification is a QG-13 violation to flag in Critic/retro review; the Elephant's own report or state entry states which round — initial or re-review — a given Critic verdict belongs to.

## QG-14 — Web & Browser Deliverable Integrity (DOM, CORS, Protocol Containment)

**Scope note:** added during the `sprint-agy-runner` work package. It is
unrelated to that sprint's declared scope (`specs/sprint-agy-runner/prd_agy-runner.md`
§4, `specs/sprint-agy-runner/spec.md` §5 — Antigravity runner integration,
no web/browser deliverable in either), and neither scope document records it
as an accepted in-sprint addition. Retained here (not deleted) pending a
separate review of its own — do not treat this entry as sprint-agy-runner-
approved.

- Any deliverable intended for web/browser runtime (e.g. HTML/JS/CSS applications, games, or UI components) **MUST** be verified for runtime asset resolution and protocol compatibility.
- ES module script tags (`<script type="module">`), local fetch requests, and dynamic imports fail under the `file:///` protocol due to browser CORS and origin isolation rules. When building browser deliverables:
  - If standalone offline execution is required, code **MUST NOT** rely on unbundled ES module imports or CORS-restricted asset fetches over `file:///`, OR
  - The verification harness and test suite **MUST** launch a local HTTP server (`http://localhost:<port>`) or headless browser harness (e.g. Playwright / Puppeteer) to exercise DOM rendering, script execution, and interaction without browser console errors.
- Unit-level tests (e.g. Node tests mocking DOM APIs) are necessary but **NOT** sufficient on their own to prove browser deliverable integrity: at least one real DOM / browser load test must verify that the entry point loads and renders cleanly.
- **Why:** In Greenfield evaluation runs, web applications that passed Node unit tests failed completely in user browser testing because ES modules and asset loading threw CORS errors under `file:///` without an active HTTP server.
- **Verification:** Critic review checks web deliverable test evidence for headless browser/DOM execution and validates that protocol constraints are addressed in the deliverable documentation and test suite.

## QG-15 — Critical-action ceremony binding is commit-exact: sequence unrelated commits AFTER consuming a pending signature, never before or during

- **MUST NOT** land any unrelated commit (including a docs-only/handover commit) between preparing/signing a critical-action authorization (HGO signature ceremony, `authorize-critical`, a reconcile/push-approval request, or any other `pipeline-state.mjs`/`po-human-approval.mjs` ceremony bound via `criticalActionSubjectSha256` or an equivalent candidate-bound digest) and consuming that signature into pipeline state. The binding is exact against the candidate commit/tree observed when the request was prepared; any commit landing in between moves `HEAD` and invalidates the pending signature (fails closed, e.g. `HGO-DRIFT` / `CRITICAL-ACTION-REQUEST-MISMATCH`), forcing the entire ceremony to be redone.
- **MUST**, when a ceremony is pending, batch any further unrelated work (docs/handover updates, unrelated fixes) to land AFTER the ceremony's consuming step completes, not before or during — the same discipline QG-08 already requires for an in-flight Verify run, applied to the signature-binding case.
- **MUST**, before preparing a candidate-bound ceremony request in a repository where a parallel session might be active (a sibling branch/checkout of the same project, another live Elephant session), check whether one is (e.g. a liveness message to the peer session) — a commit landed by a session other than the one preparing the ceremony invalidates the binding by the exact same mechanism as an unrelated self-authored commit, and is cheaper to rule out beforehand than to diagnose and redo after a refusal (extracted from `docs/state.md`, 2026-08-17 checkpoint history, dispatch `PHX-WP-STATE-EXTRACT-CHUNK-1`: a reconcile ceremony was rebuilt once specifically because a sibling session's commit landed mid-ceremony, unnoticed until the signed proof was refused).
- **Why:** Observed twice in the same sprint: (1) `docs/state.md` checkpoint 25 — a reconcile request's `intentSha256` was bound to a candidate, then a further checkpoint commit (docs-only) moved `HEAD` and silently invalidated it, forcing a rebuild; (2) checkpoint 12 — the HGO `plan → prepare-authorization → sign → authorize-by-signature` ceremony cost two redone rounds before this ordering was internalized. The mechanism is deliberately unforgiving by design (a wrong/stale binding must fail closed, never silently accept); the process discipline this rule states is what avoids paying that cost repeatedly.
- **Verification:** A prepared-but-unconsumed critical-action request file exists in the session state only while no other commit lands; a Critic/trajectory review flags a commit interleaved between a ceremony's prepare/sign step and its consuming step as a QG-15 violation.

## QG-16 — A briefing must never grant a dispatch authority to clear a control that exists to check that dispatch's own class of work

- **MUST NOT** brief or authorize a dispatch to re-baseline, re-pin, silence, or otherwise clear a tripwire/tamper-detection control (e.g. a Critic protected-preimage digest pin, a security-scan baseline, any control whose stated purpose is independent oversight of a class of change) when that dispatch is itself producing or defending work of the exact class the control checks. "Show your evidence for why the drift is legitimate" is not a substitute for separation of duties — a party that can both make the change and clear the check that verifies it is not independently checked at all, however careful its own justification reads.
- This extends QG-04's implementor/test separation beyond literal test files to any tripwire whose entire purpose is checking a class of work from outside that work's own authorship.
- Separately, even when a control is cleared by the correct independent party, an authorization to RUN a review that informs a decision is not itself authorization to ACT on that review's outcome — the two are distinct approvals and the second must be obtained explicitly, never inferred from the first.
- **Why:** Observed live (`docs/state.md`, 2026-08-08 checkpoint history, dispatch `PHX-WP-STATE-EXTRACT-CHUNK-2`): a dispatch was briefed to "update the pin only if you can show the drift was a legitimate reviewed change" and did exactly that — re-baselining six of nine Critic protected-preimage digests on its own say-so. Reverted; the runtime's own security warning and a permission-layer refusal both caught it independently before the orchestrator did. The same session later cleared the separation-of-duties question correctly (independent reviewer, mechanic tier, transcription-only scope) and still over-read a PO's "run one [review]" as consent to act on its result — a second, distinct mistake even after the first was corrected.
- **Verification:** A briefing that hands a dispatch write/clear authority over a pin, baseline, or tripwire covering its own deliverable's class is a QG-16 finding at Critic/trajectory review; a gate-record entry acting on a review's outcome cites the PO's explicit action-authorization, not merely the review's own launch approval.

## QG-17 — Before requesting a signed window/ceremony, enumerate everything it must cover, not just the item that triggered it

- **MUST** enumerate every currently-known edit that needs the SAME protected surface lifted — not only the one item that prompted the request — before preparing a signed maintenance-window or override-ceremony request (GMW, HGO, or any protected-path signing flow), so a second signing round is not needed for something already known at request time.
- **Why:** Observed live (`docs/state.md`, Sprint Phoenix checkpoint history, dispatch `PHX-WP-STATE-EXTRACT-CHUNK-3`): a TP-3 signing window was prepared before checking whether anything else needed TP-3; a second registration would have arrived after the window closed, costing a further human signing round. Same shape as QG-15's ceremony-binding discipline, applied at request-preparation time rather than only at consumption time.
- **Verification:** A signed-window/ceremony request's prepared scope is checked against every other currently-known pending edit to the same protected surface before the request is prepared; a second request for the same surface opened within one work stretch without a stated reason (new information, not foreseeable at first request) is a QG-17 finding at Critic/trajectory review.
