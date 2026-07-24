# Quality-Gate Guardrails

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 3
> Audience: every agent role; primary consumers are Goldfish (submission), Elephant (gate decision), and Critic (trajectory check). Operationalizes the quality-gate / Definition-of-Done decision (`docs/adr/0005-quality-gates-dod.md`).

**Precedence and enforcement:** as defined in `guardrails/global.md` (header). Principle: deterministic before probabilistic — machines gate first, LLM judgment reviews after (`docs/operating-model.md` §4).

Rule IDs: `QG-xx`.

---

## QG-01 — The gate chain is the norm

- **MUST** pass the full deterministic chain `Format → Lint → Typecheck → Tests → Build` (blocking) before any submission counts and before any LLM review starts. The concrete checkers per project come from the calibration (<PROJECT_A>: pnpm chain; <PROJECT_B>: yamllint + `check_config`; <PROJECT_C>: build/compile gate) — the chain semantics are central and non-negotiable.
- **MUST NOT** hand a diff to the Critic while deterministic gates are red, and the Critic **MUST NOT** flag anything CI/verify already enforces (lint, formatting, type errors) — no noise, no double work.
- `verify` + evidence are invariant on ALL rigor levels — there is no path around the deterministic gates, not even for one-line fixes (`docs/operating-model.md` §3.3).
- **Why:** Machines find mechanical errors guaranteed and cheaply; LLM review is probabilistic and expensive — inverting the order wastes tokens and dilutes findings.
- **Verification:** The verify script encodes the chain (QG-02); the gate decision (SDLC step 8) records green evidence before the Critic dispatch; Critic reports contain no CI-enforceable findings.

## QG-02 — verify-script contract: ONE script, three consumers

- Each project **MUST** define exactly ONE verify entry point (`{{VERIFY_COMMAND}}`, e.g. `pnpm verify` — named in the project calibration `.claude/pipeline.json`, field `verify`) that runs the full chain.
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
- **Verification:** The Critic's trajectory check compares artifact vs. claims: does the artifact exist, did the script write it (timestamps/trajectory), does the commit SHA match the diff? **Delivered (reduced scope: no registry, no expiry fields — see QG-05/QG-06 CUT disposition):** writer = `harness/scripts/verify.mjs` (self-application, `.claude/pipeline.json` field `verify`); canonical artifact path = `evidence/verify-latest.json` (git-ignored — a regenerated status snapshot, not a durable audit trail).

## QG-04 — Test-role separation: the implementor never touches its own tests

- An implementation Goldfish **MUST NOT** create, modify, delete, or weaken the tests/checks that validate its own implementation — tests are the contract, not negotiating mass.
- If a test is genuinely wrong or the spec contradicts it: trigger the stop condition and report — the test change is a SEPARATE task (separate dispatch/commit), and the Critic reviews test diffs specifically for weakening (threshold lowering, assertion removal, skips).
- **MUST NOT** soften gates to get green: no skipping tests, no lowering thresholds, no `|| true`.
- **Why:** Self-validation is the core failure mode of agentic coding — an agent that can edit its own examiner always passes (`docs/operating-model.md` §2.3).
- **Verification:** Test-path protection during implementation tasks — **delivered:** PreToolUse hook `guard-testpath.mjs` blocks Edit/Write on paths named in a project's `.claude/guard-config.json` (`protectedTestPaths`); Bash/PowerShell writes to the same paths are NOT covered by this hook — those tool calls route only through `guard-git.mjs`, which does not check test paths (see the hook's own NOT-COVERED header); scope is deliberately a blanket per-path block, not automatic task-type detection (that distinction stays an open design question, out of scope for this delivery — see the hook's own header comment). The briefing's prohibitions field (canonical field 4, `docs/operating-model.md` §2.3) and Critic test-diff review remain the primary defense for that nuance.

## QG-05 — Gate honesty: document what a gate does NOT check

- Every gate **MUST** carry an explicit statement of its blind spots ("does not check: …"). Examples from the legacy stock: <PROJECT_A> CI is "alarm, not barrier"; <PROJECT_B> `check_config` does not validate card syntax; <PROJECT_C>'s compile gate is fail-open when the editor is offline.
- Reports and DoD statements **MUST** name the gate limits relevant to the claim ("tests green, but E2E not covered").
- **Why:** A green gate that silently checks less than assumed produces confident-wrong "done" — false trust is worse than no gate.
- **Verification:** Gate registry with mandatory "does not check" field per gate — **CUT:** registry bureaucracy exceeds its value at one-dev scale; the statement lives next to the gate definition in the project calibration/docs instead. Re-trigger: first gate-expiry incident, or more than one verify gate per project.

## QG-06 — Gates are binary; warn-only needs an expiry date OR a documented, justified calibration

- A gate is either BLOCKING or DELETED. An ad-hoc, undocumented warn-only state is a temporary exception and **MUST** carry: reason, owner (the PO), and an expiry date. At expiry it is promoted to blocking or deleted — no third option, no silent extension.
- **MUST NOT** introduce "documented instead of fixed" risks: a known gap with a TODO comment and no due date is a finding, not a mitigation.
- **Revision (`docs/adr/0027-gate-philosophy.md`):** the pipeline manifest (`.claude/pipeline.yaml`) introduces per-gate modes `blocking | warn | off` as a first-class, PROJECT-level CALIBRATION field — this does not reopen QG-06's binary principle. A manifest gate is still binary at any given moment (its `mode` is one explicit value, never an undeclared drift); `warn` in the manifest **MUST** carry a justifying comment directly in the manifest file (the manifest-level equivalent of QG-06's reason/owner/expiry fields, in a leaner form appropriate to a machine-read config). Documented configuration is not silent decay (a known anti-pattern) — an undocumented or unjustified `warn`/`off` is still exactly the violation this rule exists to catch.
- **Why:** Warn-only becomes permanent by default — <PROJECT_A>'s Lighthouse gate stayed warn-only from introduction ("once calibrated, set to error" never happened); <PROJECT_B>'s action-pinning TODO survived from project start.
- **Verification:** Gate registry fields `status` + `expires` are machine-checkable; the `/close` drift check flags expired warn-only gates; the Critic checklist contains "are there documented-instead-of-fixed risks?". **CUT (same disposition as QG-05):** no registry implementation at one-dev scale; re-trigger: first gate-expiry incident, or more than one verify gate per project. Manifest gate modes are additionally reviewed via the Critic checklist item above — an unjustified `warn`/`off` in a manifest is the same finding class as an undocumented legacy warn-only gate.

## QG-07 — Bugfix discipline: reproduce before you fix

- Before fixing ANY reported bug, **MUST** first reproduce the failure with a failing test or a repro command that demonstrably fails against the current code — describing the bug or reasoning about its cause is not reproduction; a red check is.
- **MUST** fix only the root cause the repro isolates — no incidental cleanup and no unrelated refactors riding along in the same change; a rename or style fix that surfaces along the way goes into a SEPARATE commit, never bundled with the bugfix.
- The repro test **MUST** stay permanently in the suite after the fix goes green — it is the regression guard for exactly this bug, not a scratch artifact to delete once the fix lands.
- **Why:** This was the largest substantive gap identified by an external review (Google, Whitepaper „Day 5") — no rule covered bugfix discipline at all. A fix without a preceding red repro cannot prove it fixed the reported failure rather than something adjacent; "fix + drive-by cleanup" in one commit is a scope-creep vector wearing a bugfix disguise, and QG-04's test-role separation only protects tests an implementor did not write in the first place.
- **Verification:** Bugfix completion reports name the repro command/test and its pre-fix red result; the diff's test file shows the repro test present and green post-fix; a bugfix commit containing unrelated renames or cleanup is a QG-07 violation to flag in Critic review.
