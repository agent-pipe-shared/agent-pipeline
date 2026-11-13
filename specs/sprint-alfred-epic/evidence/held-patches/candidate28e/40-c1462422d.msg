feat(guard): make reopen-design the PO's own step

Claude test run 2026-11-12: the agent ran reopen-design itself for a
one-line Spec correction, voided the PO's design approval and could
not get back to a happy path. Reopening a signed design voids the PO's
approval, so it is the PO's step; a Spec correction during
implementation now has the Spec addendum (ADR-0095).

- lib/guard/evaluate.mjs: `reopen-design --by <name>` from an agent is
  refused as PO-REOPEN-HUMAN-ONLY on every runner; only
  `reopen-design --by <name> --dry-run` (writes nothing) is agent work.
- lib/human-guard-override.mjs: PO-REOPEN-HUMAN-ONLY is not liftable
  by a human guard override.
- lib/guard/sanctioned-args-scripts.mjs: the closed catalogue sanctions
  only the dry-run form. Root cause of the gap: the Codex and
  Antigravity adapters skip the lifecycle guard for a sanctioned
  lifecycle command, so the catalogue admitted the void there.
- lib/reopen-design-po-step.mjs (new leaf module): one wording for
  every text that points at the reopen: the PO runs it in their own
  terminal, the agent may preview it, a Spec correction goes through a
  Spec addendum. Bare verbs only (AC-148).
- Texts restated: guard-devplan hook and policy, denial-route,
  authority-restore, po-gate-authority-read, authority-seal-plan,
  calibration-verify-commit-transition, onboarding-continuity,
  project-onboarding-v3 (collect-input guidance; the applyAction argv
  stays, it is the PO's command), pipeline-state inspect action, seal
  situation reasons, set-phase refusal.
- Plan runbook: reopen-design is a po-only step (humanGate true) and
  no longer a closed catalogue shape; runbooks regenerated.
- happy-path.md and ADR-0095 Decision 10 state the rule.
- Tests restated where they pinned the agent-run void or the old
  wording (PODB009 new; devplan-shell-sanctioned-recovery,
  authority-seal-plan LB5-4, guard-lifecycle-ready, design-course
  A10, denial-names DND001/DND005/advisory, foreign-worktree AC3,
  catalogue-admit AC-123, lifecycle-coordination AC-207,
  ready-gate literals, approval-unverified D117).

Runs: the reopen-related suites in two batches, 1029+318 cases before
the restatements, all affected files green after them (152/153, one
skipped as before). The child-course case of
revised-native-design-cannot-reach-a-new-advisor-course fails on the
base checkout too under a world-writable TMPDIR (SDC-AUTHORITY-
UNAVAILABLE); it passes with a private TMPDIR (10/10).

AI-Assisted: true
Dispatch: stage-0 (elephant)
